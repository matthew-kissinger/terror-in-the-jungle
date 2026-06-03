/* =====================================================================
   TERROR IN THE JUNGLE — Direction 07 "Oppressive Horror"
   Self-contained mockup interaction layer. Vanilla JS, no deps.
   ===================================================================== */
(function () {
  "use strict";

  var SCREENS = ["menu", "modes", "deploy", "combat", "loading"];
  var body = document.body;

  /* ---------- Screen switching ---------- */
  var sections = {};
  SCREENS.forEach(function (name) {
    sections[name] = document.querySelector('.screen[data-name="' + name + '"]');
  });
  var segs = Array.prototype.slice.call(document.querySelectorAll(".seg"));

  function showScreen(name) {
    if (SCREENS.indexOf(name) === -1) return;
    SCREENS.forEach(function (n) {
      var el = sections[n];
      if (!el) return;
      if (n === name) {
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });
    segs.forEach(function (s) {
      s.setAttribute("aria-selected", s.getAttribute("data-go") === name ? "true" : "false");
    });
    body.setAttribute("data-screen", name);
    // re-trigger entrance animation
    var active = sections[name];
    if (active) {
      active.style.animation = "none";
      // force reflow then restore
      void active.offsetWidth;
      active.style.animation = "";
    }
    window.scrollTo(0, 0);
  }

  // Any element with data-go switches screens (segments + buttons + chips)
  document.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-go]");
    if (trigger) {
      var dest = trigger.getAttribute("data-go");
      showScreen(dest);
    }
  });

  /* ---------- Arrow-key navigation ---------- */
  document.addEventListener("keydown", function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var cur = SCREENS.indexOf(body.getAttribute("data-screen"));
    if (cur === -1) cur = 0;
    if (e.key === "ArrowRight") {
      showScreen(SCREENS[(cur + 1) % SCREENS.length]);
    } else if (e.key === "ArrowLeft") {
      showScreen(SCREENS[(cur - 1 + SCREENS.length) % SCREENS.length]);
    }
  });

  /* ---------- MODES: single-select cards ---------- */
  var ops = Array.prototype.slice.call(document.querySelectorAll(".op"));
  ops.forEach(function (op) {
    op.addEventListener("click", function () {
      ops.forEach(function (o) {
        o.classList.remove("is-selected");
        o.setAttribute("aria-pressed", "false");
        var b = o.querySelector(".op__badge");
        if (b && b.textContent === "SELECTED") b.remove();
      });
      op.classList.add("is-selected");
      op.setAttribute("aria-pressed", "true");
      // add a SELECTED badge if not an epic/campaign card already badged
      var top = op.querySelector(".op__top");
      if (top && !op.querySelector(".op__badge")) {
        var badge = document.createElement("span");
        badge.className = "op__badge";
        badge.textContent = "SELECTED";
        top.appendChild(badge);
      }
    });
  });

  /* ---------- DEPLOY: spawn selection (list + map stay in sync) ---------- */
  function selectSpawn(name) {
    var all = document.querySelectorAll("[data-spawn]");
    all.forEach(function (el) {
      var on = el.getAttribute("data-spawn") === name;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  document.querySelectorAll("[data-spawn]").forEach(function (el) {
    el.addEventListener("click", function () {
      selectSpawn(el.getAttribute("data-spawn"));
    });
  });

  /* ---------- DEPLOY: vehicle selection ---------- */
  var vehs = Array.prototype.slice.call(document.querySelectorAll(".veh"));
  vehs.forEach(function (v) {
    v.addEventListener("click", function () {
      vehs.forEach(function (o) {
        o.classList.remove("is-active");
        o.setAttribute("aria-pressed", "false");
      });
      v.classList.add("is-active");
      v.setAttribute("aria-pressed", "true");
    });
  });

  /* ---------- DEPLOY: loadout alt swap (click an alt -> becomes the pick) ---------- */
  document.querySelectorAll(".slot").forEach(function (slot) {
    var nameEl = slot.querySelector(".slot__name");
    slot.querySelectorAll(".alt").forEach(function (alt) {
      alt.addEventListener("click", function () {
        var picked = alt.textContent.trim();
        var current = nameEl.textContent.replace(/\s*×\d+\s*$/, "").trim();
        // preserve a trailing count (e.g. grenades) if present
        var countMatch = nameEl.textContent.match(/×\d+/);
        nameEl.textContent = picked.toUpperCase();
        if (countMatch && /grenade|smoke|c4/i.test(picked)) {
          var x = document.createElement("b");
          x.className = "slot__x";
          x.textContent = " " + countMatch[0];
          nameEl.appendChild(x);
        }
        alt.textContent = current.charAt(0) + current.slice(1).toLowerCase();
        // gentle confirm flash
        slot.animate(
          [{ borderColor: "rgba(181,134,43,.7)" }, { borderColor: "" }],
          { duration: 500, easing: "ease-out" }
        );
      });
    });
  });

  /* ---------- DEPLOY: cosmetic countdown ---------- */
  var clocks = [document.getElementById("deployClock"), document.getElementById("deployClock2")];
  var t = 8;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) {
    setInterval(function () {
      t -= 1;
      if (t < 0) t = 8;
      var txt = "0:" + (t < 10 ? "0" + t : t);
      clocks.forEach(function (c) { if (c) c.textContent = txt; });
    }, 1000);
  }

  /* ---------- COMBAT: mobile HUD toggle ---------- */
  var mobileToggle = document.getElementById("mobileToggle");
  if (mobileToggle) {
    mobileToggle.addEventListener("click", function () {
      var on = body.classList.toggle("show-mobile");
      mobileToggle.textContent = on ? "HIDE MOBILE HUD" : "SHOW MOBILE HUD";
    });
  }

  /* ---------- LOADING: rotating field-note tips ---------- */
  var tips = [
    "Suppressing fire pins the enemy in place.",
    "The jungle hides more than it shows. Watch the treeline.",
    "Hold the high ground. Hill 937 changes hands by the hour.",
    "Smoke breaks line of sight. Use it to cross open ground.",
    "Stay with your squad. Alone in the valley, you do not last."
  ];
  var tipEl = document.getElementById("tipText");
  if (tipEl && !reduce) {
    var ti = 0;
    setInterval(function () {
      ti = (ti + 1) % tips.length;
      tipEl.style.opacity = "0";
      setTimeout(function () {
        tipEl.textContent = tips[ti];
        tipEl.style.opacity = "1";
      }, 320);
    }, 4200);
    tipEl.style.transition = "opacity .3s ease";
  }

  /* ---------- init ---------- */
  showScreen("menu");
})();
