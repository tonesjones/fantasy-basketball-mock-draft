// Optional board and value scenes. Their DOM tables and SVG remain usable without WebGL.
const source = "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js";
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const mobile = matchMedia("(max-width: 640px)");
let threePromise;
const mounts = new Map();

function mount(host, build) {
  let dead = false, visible = false, renderer, scene, camera, resizeObserver;
  let cleanup = () => {};
  const box = host.classList.contains("board-scene") ? host : host.querySelector(".value-canvas");
  const canvasEvents = new AbortController();
  function draw() { if (visible && !document.hidden && renderer) renderer.render(scene, camera); }
  function resize() {
    if (!renderer || dead || !box.clientWidth) return;
    const height = host.classList.contains("board-scene") ? box.clientWidth * (mobile.matches ? 0.72 : 0.55) : box.clientHeight;
    const halfHeight = 5.2, halfWidth = halfHeight * box.clientWidth / height;
    camera.left = -halfWidth; camera.right = halfWidth;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile.matches ? 1.5 : 2));
    renderer.setSize(box.clientWidth, height, false);
    draw();
  }
  async function start() {
    if (dead || renderer || !visible || document.hidden || reduce.matches) return;
    try {
      threePromise ||= import(source);
      const THREE = await threePromise;
      if (dead || !visible) return;
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !mobile.matches, powerPreference: "low-power" });
      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(-7.5, 7.5, 5.2, -5.2, 0.1, 80);
      const result = build(THREE, scene, camera, draw, renderer.domElement, canvasEvents.signal);
      cleanup = result || cleanup;
      box.append(renderer.domElement);
      renderer.domElement.addEventListener("webglcontextlost", dispose, { once: true });
      host.classList.add("is-3d");
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(box);
      resize();
    } catch (_) { threePromise = null; dispose(); }
  }
  const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) start(); });
  intersection.observe(box);
  const visibility = () => { if (!document.hidden) start(); };
  document.addEventListener("visibilitychange", visibility);
  function dispose() {
    if (dead) return;
    dead = true;
    intersection.disconnect();
    resizeObserver?.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    canvasEvents.abort();
    cleanup();
    renderer?.dispose();
    renderer?.domElement.remove();
    host.classList.remove("is-3d");
  }
  return { dispose };
}

function board(host) {
  const panel = host.closest(".board-scene-panel");
  const table = panel.nextElementSibling.querySelector("table.board");
  const rows = [...table.rows].slice(1);
  const buttons = [...panel.querySelectorAll("[data-board-team]")];
  const roster = panel.querySelector(".board-team-roster");
  let selected = -1, select3D = () => {};
  function select(team) {
    selected = team;
    buttons.forEach((button, i) => button.classList.toggle("sel", i === team));
    [...table.querySelectorAll("td")].forEach(cell => cell.classList.remove("scene-selected"));
    const picks = rows.map(row => row.cells[team + 1]).filter(Boolean);
    picks.forEach(cell => cell.classList.add("scene-selected"));
    const names = picks.map((cell, i) => cell.textContent.trim() ? `R${i + 1} ${cell.textContent.trim()}` : null).filter(Boolean);
    roster.textContent = `${buttons[team].textContent}: ${names.length ? names.join(" · ") : "No picks yet."}`;
    select3D(team);
  }
  buttons.forEach((button, i) => button.addEventListener("click", () => select(i)));
  select(buttons.findIndex(button => button.textContent === "You") >= 0 ? buttons.findIndex(button => button.textContent === "You") : 0);
  const mount3D = mount(host, (THREE, scene, camera, draw) => {
    const group = new THREE.Group(); scene.add(group);
    const geometry = new THREE.BoxGeometry(0.78, 0.12, 0.7);
    const tokens = getComputedStyle(document.querySelector("#md"));
    const materials = [
      new THREE.MeshBasicMaterial({ color: tokens.getPropertyValue("--dl-border-strong").trim() || "#456074" }),
      new THREE.MeshBasicMaterial({ color: tokens.getPropertyValue("--dl-blue").trim() || "#52a8ff" }),
      new THREE.MeshBasicMaterial({ color: tokens.getPropertyValue("--dl-green").trim() || "#52d18a" })
    ];
    const slots = [], dropping = [];
    rows.forEach((row, round) => {
      for (let team = 0; team < buttons.length; team++) {
        const cell = row.cells[team + 1];
        const filled = !!cell.textContent.trim();
        const you = cell.classList.contains("you") || cell.classList.contains("future-you");
        const mesh = new THREE.Mesh(geometry, materials[you ? 2 : filled ? 1 : 0]);
        const drop = cell.classList.contains("latest-pick");
        mesh.position.set(team - (buttons.length - 1) / 2, drop ? 2.2 : filled ? 0.08 : 0, round - (rows.length - 1) / 2);
        if (drop) dropping.push(mesh);
        group.add(mesh); slots.push({ mesh, team });
      }
    });
    camera.position.set(0, 16, 16);
    camera.lookAt(0, 0, 0);
    let frame = 0, dropFrame = 0;
    if (dropping.length) {
      const began = performance.now();
      function fall(now) {
        const t = Math.min(1, (now - began) / 300);
        dropping.forEach(mesh => { mesh.position.y = 2.2 - 2.12 * (1 - Math.pow(1 - t, 3)); });
        draw();
        if (t < 1 && !document.hidden) dropFrame = requestAnimationFrame(fall);
      }
      dropFrame = requestAnimationFrame(fall);
    }
    select3D = team => {
      cancelAnimationFrame(frame);
      slots.forEach(slot => slot.mesh.scale.y = slot.team === team ? 2.2 : 1);
      const from = group.rotation.y, to = (team - (buttons.length - 1) / 2) * 0.035;
      const began = performance.now();
      function step(now) {
        const t = Math.min(1, (now - began) / 260);
        group.rotation.y = from + (to - from) * t;
        draw();
        if (t < 1 && !document.hidden) frame = requestAnimationFrame(step);
      }
      frame = requestAnimationFrame(step);
    };
    select3D(selected);
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(dropFrame); geometry.dispose(); materials.forEach(m => m.dispose()); };
  });
  return { dispose: () => { mount3D.dispose(); buttons.forEach(button => button.replaceWith(button.cloneNode(true))); } };
}

function value(host) {
  const players = JSON.parse(host.dataset.players);
  return mount(host, (THREE, scene, camera, draw, canvas, signal) => {
    const group = new THREE.Group(); scene.add(group);
    const positions = [], colors = [], latePositions = [];
    const standard = new THREE.Color(getComputedStyle(document.querySelector("#md")).getPropertyValue("--dl-blue").trim() || "#52a8ff");
    const late = new THREE.Color(getComputedStyle(document.querySelector("#md")).getPropertyValue("--dl-green").trim() || "#52d18a");
    players.forEach(player => {
      positions.push((Math.min(270, player.adp) / 270 - 0.5) * 12, Math.max(-3.2, Math.min(3.2, player.value / 7)), (player.scarce / 9 - 0.5) * 5);
      const color = player.late > 0 ? late : standard;
      colors.push(color.r, color.g, color.b);
      if (player.late > 0) latePositions.push(...positions.slice(-3));
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({ size: mobile.matches ? 3 : 4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
    group.add(new THREE.Points(geometry, material));
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute("position", new THREE.Float32BufferAttribute(latePositions, 3));
    const glowMaterial = new THREE.PointsMaterial({ size: 11, sizeAttenuation: false, color: late, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    group.add(new THREE.Points(glowGeometry, glowMaterial));
    camera.position.set(0, 3, 18); camera.lookAt(0, 0, 0);
    let down = false, lastX = 0;
    canvas.style.touchAction = "pan-y";
    canvas.addEventListener("pointerdown", e => { down = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); }, { signal });
    canvas.addEventListener("pointermove", e => { if (!down) return; group.rotation.y += (e.clientX - lastX) * 0.006; lastX = e.clientX; draw(); }, { signal });
    canvas.addEventListener("pointerup", () => { down = false; }, { signal });
    return () => { geometry.dispose(); material.dispose(); glowGeometry.dispose(); glowMaterial.dispose(); };
  });
}

function sync() {
  const hosts = [...document.querySelectorAll("#md .board-scene, #md .value-field")];
  for (const [host, instance] of mounts) if (!hosts.includes(host) || reduce.matches) { instance.dispose(); mounts.delete(host); }
  if (reduce.matches) return;
  hosts.forEach(host => { if (!mounts.has(host)) mounts.set(host, host.classList.contains("board-scene") ? board(host) : value(host)); });
}
let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; sync(); });
}).observe(document.getElementById("mdapp"), { childList: true, subtree: true });
reduce.addEventListener("change", sync);
sync();
