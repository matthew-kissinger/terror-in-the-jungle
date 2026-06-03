/* =====================================================================
   FIELD JOURNAL — app.js
   Screen switching + light, self-contained interactions.
   No framework, no build. Zero external deps.
   ===================================================================== */
(function () {
  "use strict";

  var SCREENS = ["menu", "modes", "deploy", "combat", "loading"];

  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var sections = {};
  SCREENS.forEach(function (name) {
    sections[name] = document.getElementById("screen-" + name);
  });

  function showScreen(name) {
    if (SCREENS.indexOf(name) === -1) return;
    SCREENS.forEach(function (n) {
      var sec = sections[n];
      if (sec) sec.classList.toggle("is-active", n === name);
    });
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-screen") === name;
      if (on) {
        t.setAttribute("aria-current", "true");
      } else {
        t.removeAttribute("aria-current");
      }
    });
    // scroll the screen back to top on switch
    window.scrollTo(0, 0);
    current = name;
  }

  var current = "menu";

  // --- tab clicks ---
  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      showScreen(t.getAttribute("data-screen"));
    });
  });

  // --- any element with data-goto navigates ---
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-goto]");
    if (el) {
      showScreen(el.getAttribute("data-goto"));
    }
  });

  // --- left/right arrow keys switch screens ---
  document.addEventListener("keydown", function (e) {
    // ignore if typing in a field
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      var idx = SCREENS.indexOf(current);
      if (idx === -1) idx = 0;
      idx += e.key === "ArrowRight" ? 1 : -1;
      idx = (idx + SCREENS.length) % SCREENS.length;
      showScreen(SCREENS[idx]);
    }
  });

  /* ---------------- SCREEN 2: operation card select ---------------- */
  var opCards = Array.prototype.slice.call(document.querySelectorAll(".op-card"));
  function selectOp(card) {
    opCards.forEach(function (c) {
      var on = c === card;
      c.classList.toggle("is-selected", on);
      var chk = c.querySelector(".op-check");
      if (chk) chk.textContent = on ? "SELECTED" : "SELECT";
    });
  }
  opCards.forEach(function (card) {
    card.addEventListener("click", function () { selectOp(card); });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectOp(card);
      }
    });
  });

  /* ---------------- SCREEN 3: spawn select (map + list synced) ---------------- */
  var spawnPins = Array.prototype.slice.call(document.querySelectorAll(".spawn"));
  var spawnRows = Array.prototype.slice.call(document.querySelectorAll(".spawn-row"));

  function selectSpawn(name) {
    spawnPins.forEach(function (p) {
      p.classList.toggle("is-selected", p.getAttribute("data-spawn") === name);
    });
    spawnRows.forEach(function (r) {
      r.classList.toggle("is-selected", r.getAttribute("data-spawn-row") === name);
    });
  }
  spawnPins.forEach(function (p) {
    p.addEventListener("click", function () { selectSpawn(p.getAttribute("data-spawn")); });
  });
  spawnRows.forEach(function (r) {
    r.addEventListener("click", function () { selectSpawn(r.getAttribute("data-spawn-row")); });
  });

  /* ---------------- SCREEN 3: vehicle select ---------------- */
  var vehs = Array.prototype.slice.call(document.querySelectorAll(".veh"));
  vehs.forEach(function (v) {
    v.addEventListener("click", function () {
      vehs.forEach(function (o) { o.classList.toggle("is-selected", o === v); });
    });
  });

  /* ---------------- SCREEN 3: loadout slot cycling ---------------- */
  // each slot cycles its pick through [current, ...alts] on click. Purely cosmetic.
  var slots = Array.prototype.slice.call(document.querySelectorAll(".slot"));
  slots.forEach(function (slot) {
    var pickEl = slot.querySelector(".slot-pick");
    var altEls = Array.prototype.slice.call(slot.querySelectorAll(".alt"));
    if (!pickEl || !altEls.length) return;

    // Preserve any trailing markup (e.g. the "x3" em) from the primary explosive pick.
    var emEl = pickEl.querySelector("em");
    var emHTML = emEl ? " " + emEl.outerHTML : "";
    var basePick = (emEl ? pickEl.childNodes[0].textContent : pickEl.textContent).trim();

    var options = [basePick].concat(altEls.map(function (a) { return a.textContent.trim(); }));
    var i = 0;

    slot.setAttribute("tabindex", "0");
    slot.setAttribute("role", "button");

    function cycle() {
      i = (i + 1) % options.length;
      // keep the grenade count em only on the original M67 entry
      if (options[i] === basePick && emHTML) {
        pickEl.innerHTML = basePick + emHTML;
      } else {
        pickEl.textContent = options[i];
      }
      slot.style.borderLeftColor = "var(--red)";
      setTimeout(function () { slot.style.borderLeftColor = ""; }, 220);
    }

    slot.addEventListener("click", cycle);
    slot.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycle(); }
    });
  });

  /* ---------------- SCREEN 3: live deploy countdown (cosmetic) ---------------- */
  var cd = document.getElementById("deploy-countdown");
  if (cd) {
    var secs = 8;
    setInterval(function () {
      // only tick when deploy screen is visible
      if (current !== "deploy") return;
      secs = secs <= 0 ? 8 : secs - 1;
      cd.textContent = "0:" + (secs < 10 ? "0" : "") + secs;
    }, 1000);
  }

  /* ---------------- SCREEN 4: mobile control toggle ---------------- */
  var mobileToggle = document.getElementById("mobile-toggle");
  var touch = document.getElementById("touch-controls");
  if (mobileToggle && touch) {
    mobileToggle.addEventListener("click", function () {
      var on = touch.classList.toggle("force-on");
      mobileToggle.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  /* ---------------- SCREEN 5: rotating field-note tips ---------------- */
  var tipEl = document.getElementById("load-tip-text");
  if (tipEl) {
    var tips = [
      "Suppressing fire pins the enemy in place.",
      "Mark your spawn before the LZ goes hot.",
      "Smoke breaks line of sight - use it crossing open ground.",
      "Radio in contact reports; keep the squad together.",
      "High ground at Hill 937 sees the whole valley."
    ];
    var ti = 0;
    setInterval(function () {
      if (current !== "loading") return;
      ti = (ti + 1) % tips.length;
      tipEl.style.opacity = "0";
      setTimeout(function () {
        tipEl.textContent = tips[ti];
        tipEl.style.opacity = "";
      }, 220);
    }, 3600);
    tipEl.style.transition = "opacity .22s ease";
  }

  // boot
  showScreen("menu");
})();
