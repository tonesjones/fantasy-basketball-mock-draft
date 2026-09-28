/* Visual effects only (no app state): pointer "spotlight" for cards and chips.
   Sets --mx/--my (pointer position inside the hovered element) which
   styles.css uses for a radial glow. Safe to delete; the app works without it. */
(function () {
  "use strict";
  if (typeof window === "undefined" || !window.matchMedia) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!window.matchMedia("(hover: hover)").matches) return;
  var SEL = ".avail,.side,.turnbar,.catchip,.posbtn,.pick-coach .pc-card,.puntbox,.setup-details,.boardwrap";
  var last = null;
  document.addEventListener(
    "pointermove",
    function (e) {
      var t = e.target && e.target.closest ? e.target.closest(SEL) : null;
      if (last && last !== t) last.classList.remove("fx-lit");
      last = t;
      if (!t) return;
      var r = t.getBoundingClientRect();
      t.style.setProperty("--mx", e.clientX - r.left + "px");
      t.style.setProperty("--my", e.clientY - r.top + "px");
      t.classList.add("fx-lit");
    },
    { passive: true }
  );
  document.addEventListener("pointerleave", function () {
    if (last) last.classList.remove("fx-lit");
    last = null;
  });
})();
