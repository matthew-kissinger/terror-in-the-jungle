/* =========================================================
   Modern Tactical — interaction layer
   Pure vanilla. No deps. Self-contained.
   ========================================================= */
(function () {
  "use strict";

  var SCREENS = ["menu", "modes", "deploy", "combat", "loading"];

  var sections = {};
  SCREENS.forEach(function (id) {
    sections[id] = document.getElementById("screen-" + id);
  });

  var navSegs = Array.prototype.slice.call(document.querySelectorAll(".nav__seg"));
  var navInk = document.querySelector(".nav__ink");
  var body = document.body;

  /* ---------- screen switching ---------- */
  function showScreen(id) {
    if (SCREENS.indexOf(id) === -1) return;

    SCREENS.forEach(function (s) {
      var el = sections[s];
      if (!el) return;
      if (s === id) {
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });

    body.setAttribute("data-screen", id);

    // nav active state + animated ink underline
    var idx = SCREENS.indexOf(id);
    navSegs.forEach(function (seg, i) {
      seg.classList.toggle("is-active", i === idx);
    });
    if (navInk) {
      navInk.style.transform = "translateX(" + (idx * 100) + "%)";
    }

    // reset scroll on the freshly shown screen
    if (sections[id]) sections[id].scrollTop = 0;
  }

  /* ---------- delegated [data-goto] clicks ---------- */
  document.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-goto]");
    if (trigger) {
      showScreen(trigger.getAttribute("data-goto"));
    }
  });

  /* ---------- spawn point selection (list + map pins kept in sync) ---------- */
  var spawnBtns = Array.prototype.slice.call(document.querySelectorAll(".spawn"));
  var pins = Array.prototype.slice.call(document.querySelectorAll(".pin"));
  var routeLine = document.getElementById("routeLine");

  // map pin coords for the route line origin (objective is fixed at HILL 937)
  var PIN_XY = {
    alpha: [120, 300],
    bravo: [250, 210],
    ridge: [380, 250],
    river: [300, 360],
    hill: [440, 150]
  };
  var OBJ_XY = [430, 120];

  function selectSpawn(key) {
    spawnBtns.forEach(function (b) {
      var on = b.getAttribute("data-spawn") === key;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    pins.forEach(function (p) {
      p.classList.toggle("is-active", p.getAttribute("data-spawn") === key);
    });
    if (routeLine && PIN_XY[key]) {
      routeLine.setAttribute(
        "d",
        "M" + PIN_XY[key][0] + "," + PIN_XY[key][1] + " L" + OBJ_XY[0] + "," + OBJ_XY[1]
      );
    }
  }

  spawnBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      selectSpawn(b.getAttribute("data-spawn"));
    });
  });
  pins.forEach(function (p) {
    p.addEventListener("click", function () {
      selectSpawn(p.getAttribute("data-spawn"));
    });
  });

  /* ---------- vehicle selection ---------- */
  var vehBtns = Array.prototype.slice.call(document.querySelectorAll(".veh"));
  vehBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      vehBtns.forEach(function (o) { o.classList.remove("is-active"); });
      b.classList.add("is-active");
    });
  });

  /* ---------- loadout slots: cycle current pick through its alternates ---------- */
  var SLOT_CYCLE = {
    primary:   ["M16 RIFLE", "M14", "M60 LMG", "SHOTGUN", "M79 LAUNCHER"],
    secondary: ["M1911 PISTOL", "SAWN-OFF", "FLARE GUN"],
    equipment: ["MEDKIT", "SANDBAGS", "MORTAR", "RADIO"],
    explosive: ["M67 GRENADE", "SMOKE", "C4"]
  };
  var slotIndex = { primary: 0, secondary: 0, equipment: 0, explosive: 0 };

  var slots = Array.prototype.slice.call(document.querySelectorAll(".slot"));
  slots.forEach(function (slot) {
    slot.addEventListener("click", function () {
      var kind = slot.getAttribute("data-slot");
      var cycle = SLOT_CYCLE[kind];
      if (!cycle) return;
      slotIndex[kind] = (slotIndex[kind] + 1) % cycle.length;
      var label = cycle[slotIndex[kind]];

      var pickEl = slot.querySelector(".slot__pick");
      if (pickEl) {
        if (kind === "explosive" && label === "M67 GRENADE") {
          pickEl.innerHTML = 'M67 GRENADE <span class="slot__qty">&times;3</span>';
        } else if (kind === "explosive" && label === "SMOKE") {
          pickEl.innerHTML = 'SMOKE <span class="slot__qty">&times;2</span>';
        } else {
          pickEl.textContent = label;
        }
      }

      // brief confirm flash
      slot.classList.remove("is-bumped");
      // force reflow so the class re-add re-triggers transition
      void slot.offsetWidth;
      slot.classList.add("is-bumped");
      window.setTimeout(function () { slot.classList.remove("is-bumped"); }, 260);
    });
  });

  /* ---------- mobile controls toggle ---------- */
  var mobileToggle = document.getElementById("mobileToggle");
  if (mobileToggle) {
    mobileToggle.addEventListener("click", function () {
      var on = body.classList.toggle("show-touch");
      mobileToggle.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  /* ---------- deploy countdown (cosmetic, loops) ---------- */
  var countdownEl = document.getElementById("deployCountdown");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (countdownEl && !reduceMotion) {
    var secs = 8;
    window.setInterval(function () {
      // only tick while DEPLOY screen is visible
      if (body.getAttribute("data-screen") !== "deploy") return;
      secs = secs <= 0 ? 8 : secs - 1;
      countdownEl.textContent = "0:" + (secs < 10 ? "0" : "") + secs;
    }, 1000);
  }

  /* ---------- keyboard: left/right arrows switch screens ---------- */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    // don't hijack when focus is in a text field (none here, but safe)
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    var cur = SCREENS.indexOf(body.getAttribute("data-screen"));
    if (cur === -1) cur = 0;
    var next = e.key === "ArrowRight"
      ? (cur + 1) % SCREENS.length
      : (cur - 1 + SCREENS.length) % SCREENS.length;
    showScreen(SCREENS[next]);
    e.preventDefault();
  });

  /* ---------- init ---------- */
  showScreen("menu");
})();
