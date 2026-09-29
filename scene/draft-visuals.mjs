// Optional radar. This module loads with the page; three.js loads only when a visible radar mounts.
const cdn = "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js";
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const mobile = matchMedia("(max-width: 640px)");
let threePromise;
let active;

function mountRadar(host) {
  if (!host || reduce.matches) return;
  let visible = false;
  let dead = false;
  let scene, camera, renderer, shape, grid, material, observer, THREE;
  let raf = 0;
  const values = host.dataset.values.split(",").map(Number);
  const punts = host.dataset.punts ? host.dataset.punts.split(",") : [];
  const cats = ["PTS", "REB", "AST", "STL", "BLK", "3PM", "FG%", "FT%", "TO"];
  let current = values.map((v, i) => punts.includes(cats[i]) ? 0.1 : v);

  function polygon(THREE, radii) {
    const path = new THREE.Shape();
    radii.forEach((v, i) => {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / 9;
      const x = Math.cos(angle) * v, y = Math.sin(angle) * v;
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    });
    path.closePath();
    return new THREE.ExtrudeGeometry(path, { depth: 0.12, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.02, bevelThickness: 0.02 });
  }

  function render() {
    if (!dead && visible && !document.hidden && renderer) renderer.render(scene, camera);
  }

  function resize() {
    if (!renderer || dead) return;
    const box = host.querySelector(".radar-canvas");
    const width = box.clientWidth;
    if (!width) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile.matches ? 1.5 : 2));
    renderer.setSize(width, width, false);
    render();
  }

  async function start() {
    if (renderer || dead || !visible || document.hidden) return;
    try {
      threePromise ||= import(cdn);
      THREE = await threePromise;
      if (dead || !visible) return;
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !mobile.matches, powerPreference: "low-power" });
      renderer.domElement.addEventListener("webglcontextlost", () => dispose(), { once: true });
      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(-1.32, 1.32, 1.32, -1.32, 0.1, 20);
      camera.position.set(0, 0, 5);
      camera.lookAt(0, 0, 0);
      const tokens = getComputedStyle(document.querySelector("#md"));
      const accent = tokens.getPropertyValue("--dl-blue").trim() || tokens.getPropertyValue("--hatch-widget-accent").trim();
      material = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.66, side: THREE.DoubleSide });
      shape = new THREE.Mesh(polygon(THREE, current), material);
      shape.rotation.x = -0.27;
      scene.add(shape);
      const ringMaterial = new THREE.LineBasicMaterial({ color: tokens.getPropertyValue("--dl-border-strong").trim() || "#456074", transparent: true, opacity: 0.6 });
      grid = [];
      [0.5, 1].forEach(radius => {
        const points = Array.from({ length: 10 }, (_, i) => {
          const a = -Math.PI / 2 + (i % 9) * Math.PI * 2 / 9;
          return new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, -0.01);
        });
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), ringMaterial);
        grid.push(line); scene.add(line);
      });
      host.querySelector(".radar-canvas").append(renderer.domElement);
      host.classList.add("is-3d");
      resize();
      observer = new ResizeObserver(resize);
      observer.observe(host);
    } catch (_) {
      dispose(); // SVG stays visible when the CDN or WebGL is unavailable.
    }
  }

  const intersection = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) start();
  });
  intersection.observe(host);
  const visibility = () => { if (!document.hidden) start(); };
  document.addEventListener("visibilitychange", visibility);

  function dispose() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    intersection.disconnect();
    observer?.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    if (shape) { shape.geometry.dispose(); material.dispose(); }
    if (grid) { grid.forEach(line => line.geometry.dispose()); grid[0]?.material.dispose(); }
    renderer?.dispose();
    renderer?.domElement.remove();
    host.classList.remove("is-3d");
  }
  function update() {
    const values = host.dataset.values.split(",").map(Number);
    const punts = host.dataset.punts ? host.dataset.punts.split(",") : [];
    const next = values.map((v, i) => punts.includes(cats[i]) ? 0.1 : v);
    cancelAnimationFrame(raf);
    if (!shape || !visible || document.hidden) {
      current = next;
      if (shape) { shape.geometry.dispose(); shape.geometry = polygon(THREE, current); }
      return;
    }
    const from = current.slice(), began = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - began) / 260);
      current = from.map((v, i) => v + (next[i] - v) * (1 - Math.pow(1 - t, 3)));
      shape.geometry.dispose();
      shape.geometry = polygon(THREE, current);
      render();
      if (t < 1 && !dead && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }
  return { dispose, update };
}

function sync() {
  const host = document.querySelector("#md .punt-radar");
  document.body.classList.toggle("dl-on-clock", !!document.querySelector("#md .turnbar .you"));
  if (active?.host === host) return;
  active?.instance?.dispose();
  active = host ? { host, instance: mountRadar(host) } : null;
}

const app = document.getElementById("mdapp");
if (app) {
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; sync(); });
  }).observe(app, { childList: true, subtree: true });
  sync();
}
reduce.addEventListener("change", () => { active?.instance?.dispose(); active = null; sync(); });
window.addEventListener("draft-radar-update", () => active?.instance?.update());
