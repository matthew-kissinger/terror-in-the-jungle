/* ============================================================
   TERROR IN THE JUNGLE — DIRECTION 08 · SWISS MINIMAL
   Vanilla JS. Screen switching, selectable controls, theme,
   countdown, mobile HUD toggle. No framework, no build step.
   ============================================================ */
(function () {
  "use strict";

  var SCREENS = ["menu", "modes", "deploy", "combat", "loading"];

  var segs = Array.prototype.slice.call(document.querySelectorAll(".seg"));
  var panels = {};
  SCREENS.forEach(function (id) {
    panels[id] = document.getElementById("screen-" + id);
  });

  var current = "menu";

  function showScreen(id) {
    if (SCREENS.indexOf(id) === -1) return;
    current = id;

    SCREENS.forEach(function (s) {
      var panel = panels[s];
      if (!panel) return;
      var active = s === id;
      panel.classList.toggle("is-active", active);
      if (active) {
        panel.removeAttribute("hidden");
        panel.scrollTop = 0;
      } else {
        panel.setAttribute("hidden", "");
      }
    });

    segs.forEach(function (seg) {
      seg.setAttribute("aria-selected", seg.dataset.screen === id ? "true" : "false");
    });
  }

  // nav segments
  segs.forEach(function (seg) {
    seg.addEventListener("click", function () {
      showScreen(seg.dataset.screen);
    });
  });

  // any element with data-go navigates
  document.querySelectorAll("[data-go]").forEach(function (el) {
    el.addEventListener("click", function () {
      showScreen(el.getAttribute("data-go"));
    });
  });

  // keyboard arrows
  document.addEventListener("keydown", function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var idx = SCREENS.indexOf(current);
    if (e.key === "ArrowRight") {
      showScreen(SCREENS[(idx + 1) % SCREENS.length]);
    } else if (e.key === "ArrowLeft") {
      showScreen(SCREENS[(idx - 1 + SCREENS.length) % SCREENS.length]);
    }
  });

  /* ---------- single-select group helper ---------- */
  function singleSelect(selector, selectedClass) {
    var items = Array.prototype.slice.call(document.querySelectorAll(selector));
    function pick(el) {
      items.forEach(function (i) { i.classList.toggle(selectedClass, i === el); });
    }
    items.forEach(function (el) {
      el.addEventListener("click", function () { pick(el); });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(el); }
      });
    });
  }

  // modes cards
  singleSelect("[data-mode]", "is-selected");
  // vehicles
  singleSelect("[data-veh]", "is-selected");

  /* ---------- spawn points: sync list + map pin ---------- */
  var spawnBtns = Array.prototype.slice.call(document.querySelectorAll("[data-spawn]"));
  var mapPins = Array.prototype.slice.call(document.querySelectorAll(".map-pin"));

  function selectSpawn(key) {
    spawnBtns.forEach(function (b) { b.classList.toggle("is-selected", b.dataset.spawn === key); });
    mapPins.forEach(function (p) { p.classList.toggle("is-selected", p.dataset.pin === key); });
  }
  spawnBtns.forEach(function (b) {
    b.addEventListener("click", function () { selectSpawn(b.dataset.spawn); });
    b.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectSpawn(b.dataset.spawn); }
    });
  });
  mapPins.forEach(function (p) {
    p.addEventListener("click", function () { selectSpawn(p.dataset.pin); });
  });

  /* ---------- loadout rows: cycle equipped through alternates ---------- */
  document.querySelectorAll(".lo-row").forEach(function (row) {
    var pickEl = row.querySelector(".pick");
    var alts = Array.prototype.slice.call(row.querySelectorAll(".alt"));
    if (!pickEl || !alts.length) return;

    // build cycle: [current, ...alts]
    var options = [pickEl.textContent.trim()].concat(alts.map(function (a) { return a.textContent.trim(); }));
    var pos = 0;

    function cycle() {
      pos = (pos + 1) % options.length;
      var next = options[pos];
      pickEl.textContent = next;
      // reflect which alt is "active" by underlining selection state
      alts.forEach(function (a) {
        a.classList.toggle("alt--active", a.textContent.trim() === next);
      });
      row.classList.add("lo-row--flash");
      window.setTimeout(function () { row.classList.remove("lo-row--flash"); }, 180);
    }

    row.addEventListener("click", cycle);
    row.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycle(); }
    });
  });

  /* ---------- theme toggle (paper <-> ink) ---------- */
  var root = document.documentElement;
  var themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    var label = themeBtn.querySelector(".theme-toggle__label");
    themeBtn.addEventListener("click", function () {
      var isInk = root.getAttribute("data-theme") === "ink";
      root.setAttribute("data-theme", isInk ? "paper" : "ink");
      if (label) label.textContent = isInk ? "INK" : "PAPER";
    });
  }

  /* ---------- mobile HUD toggle (combat) ---------- */
  var combat = document.getElementById("combat");
  var mobBtn = document.getElementById("mobile-toggle");
  var mobState = document.getElementById("mobile-state");
  if (combat && mobBtn) {
    mobBtn.addEventListener("click", function () {
      var on = combat.classList.toggle("show-touch");
      if (mobState) mobState.textContent = on ? "ON" : "OFF";
    });
  }

  /* ---------- deploy countdown (8 -> 0, then idle) ---------- */
  var cd = document.getElementById("deploy-countdown");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (cd && !reduce) {
    var remaining = 8;
    window.setInterval(function () {
      // only tick while the deploy screen is the active one
      if (current !== "deploy") return;
      remaining = remaining > 0 ? remaining - 1 : 8; // loop for demo liveliness
      cd.textContent = "0:" + (remaining < 10 ? "0" + remaining : remaining);
    }, 1000);
  }

  /* ---------- init ---------- */
  showScreen("menu");
})();
