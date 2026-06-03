/* =====================================================================
   TERROR IN THE JUNGLE // 04 BRUTALIST STENCIL // app.js
   Pure vanilla. Screen switching + selection states + small flavor.
===================================================================== */
(function () {
  "use strict";

  var SCREENS = ["menu", "modes", "deploy", "combat", "loading"];

  var screens = {};
  SCREENS.forEach(function (id) {
    screens[id] = document.getElementById("screen-" + id);
  });
  var segs = Array.prototype.slice.call(document.querySelectorAll(".seg"));

  /* ---------- screen switching ---------- */
  function show(id) {
    if (SCREENS.indexOf(id) === -1) { id = "menu"; }

    SCREENS.forEach(function (sid) {
      var el = screens[sid];
      if (!el) { return; }
      var active = sid === id;
      el.classList.toggle("is-active", active);
      if (active) { el.removeAttribute("hidden"); }
      else { el.setAttribute("hidden", ""); }
    });

    segs.forEach(function (s) {
      s.setAttribute("aria-selected", String(s.dataset.go === id));
    });

    document.body.dataset.screen = id;

    // jump scroll to top of stage for the new screen (no smooth = brutalist cut)
    window.scrollTo(0, 0);
  }

  // delegate every [data-go] (nav segs + in-screen buttons)
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-go]");
    if (t) { show(t.dataset.go); }
  });

  /* ---------- arrow-key navigation ---------- */
  document.addEventListener("keydown", function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { return; }
    var cur = SCREENS.indexOf(document.body.dataset.screen || "menu");
    if (e.key === "ArrowRight") { show(SCREENS[Math.min(SCREENS.length - 1, cur + 1)]); }
    else if (e.key === "ArrowLeft") { show(SCREENS[Math.max(0, cur - 1)]); }
  });

  /* ---------- generic single-select within a group ---------- */
  function singleSelect(selector, selectedClass, onPick) {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(selector));
    function pick(node) {
      nodes.forEach(function (n) {
        var on = n === node;
        n.classList.toggle(selectedClass, on);
        if (n.hasAttribute("role")) {
          if (n.getAttribute("role") === "option") { n.setAttribute("aria-selected", String(on)); }
          if (n.getAttribute("role") === "radio") { n.setAttribute("aria-checked", String(on)); }
        }
      });
      if (onPick) { onPick(node); }
    }
    nodes.forEach(function (n) {
      n.addEventListener("click", function () { pick(n); });
      n.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(n); }
      });
    });
  }

  singleSelect(".opcard", "is-selected");
  singleSelect(".spawn", "is-selected");
  singleSelect(".veh", "is-selected");

  /* ---------- loadout slot: cycle the displayed pick through alts ---------- */
  (function loadoutSwap() {
    var slots = Array.prototype.slice.call(document.querySelectorAll(".slot"));
    slots.forEach(function (slot) {
      var nameEl = slot.querySelector(".slot__name");
      var altsEl = slot.querySelector(".slot__alts");
      if (!nameEl || !altsEl) { return; }

      // build a ring of options: current pick + the alts
      var current = nameEl.textContent.trim();
      var alts = altsEl.textContent.split("·").map(function (s) { return s.trim(); }).filter(Boolean);
      var ring = [current].concat(alts);
      var idx = 0;

      function swap() {
        idx = (idx + 1) % ring.length;
        nameEl.textContent = ring[idx];
        // rebuild the alts line from the remaining ring members, preserving order
        var rest = ring.slice(0, idx).concat(ring.slice(idx + 1));
        altsEl.textContent = rest.join(" · ");
        // brutalist tick: brief invert
        slot.style.borderLeftColor = "#FF5A1F";
      }

      slot.addEventListener("click", swap);
      slot.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); swap(); }
      });
    });
  })();

  /* ---------- mobile HUD toggle ---------- */
  (function mobileToggle() {
    var btn = document.getElementById("mobileToggle");
    var hud = document.querySelector(".hud");
    if (!btn || !hud) { return; }
    btn.addEventListener("click", function () {
      var on = hud.dataset.mobile !== "on";
      hud.dataset.mobile = on ? "on" : "off";
      btn.setAttribute("aria-pressed", String(on));
      var b = btn.querySelector("b");
      if (b) { b.textContent = on ? "ON" : "OFF"; }
    });
  })();

  /* ---------- deploy countdown (cosmetic loop 0:08 -> 0:00) ---------- */
  (function countdown() {
    var els = [document.getElementById("dpl-count"), document.getElementById("dpl-count-2")];
    els = els.filter(Boolean);
    if (!els.length) { return; }
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { return; }
    var t = 8;
    setInterval(function () {
      t = t <= 0 ? 8 : t - 1;
      var s = "0:" + (t < 10 ? "0" + t : t);
      els.forEach(function (e) { e.textContent = s; });
    }, 1000);
  })();

  /* ---------- rotating field tip ---------- */
  (function tips() {
    var el = document.getElementById("tipText");
    if (!el) { return; }
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { return; }
    var lines = [
      "Suppressing fire pins the enemy in place.",
      "Capture zones faster with more allies present.",
      "Smoke breaks line of sight. Use it to advance.",
      "The M79 clears bunkers. Mind the minimum arming range.",
      "Call the Huey for rapid frontline redeploy."
    ];
    var i = 0;
    setInterval(function () {
      i = (i + 1) % lines.length;
      el.textContent = lines[i];
    }, 3600);
  })();

  /* ---------- boot ---------- */
  // honor a hash like #combat for direct linking; default MENU
  var initial = (location.hash || "").replace("#", "");
  show(SCREENS.indexOf(initial) !== -1 ? initial : "menu");
})();
