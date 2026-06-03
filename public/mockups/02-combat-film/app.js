/* =====================================================================
   TERROR IN THE JUNGLE — Combat Film / 16mm — app.js
   Pure vanilla. Screen switching + light interaction for the mockup.
   ===================================================================== */
(function () {
  "use strict";

  var SCREENS = ["menu", "modes", "deploy", "combat", "loading"];
  var screens = {};
  var navSegs = {};

  SCREENS.forEach(function (name) {
    screens[name] = document.getElementById("screen-" + name);
  });
  document.querySelectorAll(".nav-seg").forEach(function (seg) {
    navSegs[seg.getAttribute("data-go")] = seg;
  });

  var current = "menu";

  function show(name) {
    if (!screens[name] || name === current) {
      if (screens[name]) current = name;
    }
    SCREENS.forEach(function (n) {
      var active = n === name;
      if (screens[n]) screens[n].classList.toggle("is-active", active);
      if (navSegs[n]) navSegs[n].classList.toggle("is-active", active);
    });
    current = name;
    // reset scroll so re-entering a screen starts at the top
    if (screens[name]) screens[name].scrollTop = 0;
  }

  // any element with [data-go] navigates
  document.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-go]");
    if (trigger) {
      e.preventDefault();
      show(trigger.getAttribute("data-go"));
    }
  });

  // arrow keys cycle screens
  document.addEventListener("keydown", function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var idx = SCREENS.indexOf(current);
    if (e.key === "ArrowRight") {
      show(SCREENS[(idx + 1) % SCREENS.length]);
    } else if (e.key === "ArrowLeft") {
      show(SCREENS[(idx - 1 + SCREENS.length) % SCREENS.length]);
    }
  });

  /* ---------- MODES: select a card ---------- */
  document.querySelectorAll(".op-card").forEach(function (card) {
    card.addEventListener("click", function () {
      document.querySelectorAll(".op-card").forEach(function (c) {
        c.classList.remove("is-selected");
        var tag = c.querySelector(".op-sel-tag");
        if (tag) tag.remove();
      });
      card.classList.add("is-selected");
      if (!card.querySelector(".op-sel-tag") && !card.classList.contains("op-card--feature")) {
        var tag = document.createElement("span");
        tag.className = "op-sel-tag";
        tag.textContent = "● ROLLING";
        card.appendChild(tag);
      }
    });
  });

  /* ---------- DEPLOY: spawn selection (list + map stay in sync) ---------- */
  function selectSpawn(id) {
    document.querySelectorAll(".spawn-row").forEach(function (row) {
      row.classList.toggle("is-selected", row.getAttribute("data-spawn") === id);
    });
    document.querySelectorAll(".map-pin").forEach(function (pin) {
      pin.classList.toggle("is-selected", pin.getAttribute("data-spawn") === id);
    });
  }
  document.querySelectorAll("[data-spawn]").forEach(function (el) {
    el.addEventListener("click", function () {
      selectSpawn(el.getAttribute("data-spawn"));
    });
  });

  /* ---------- DEPLOY: vehicle selection ---------- */
  document.querySelectorAll(".veh").forEach(function (v) {
    v.addEventListener("click", function () {
      document.querySelectorAll(".veh").forEach(function (o) { o.classList.remove("is-selected"); });
      v.classList.add("is-selected");
    });
  });

  /* ---------- DEPLOY: loadout alt picks ---------- */
  document.querySelectorAll(".lo-slot").forEach(function (slot) {
    var nameEl = slot.querySelector(".lo-name");
    var qtyEl = slot.querySelector(".lo-qty");
    slot.querySelectorAll(".alt").forEach(function (alt) {
      alt.addEventListener("click", function (e) {
        e.stopPropagation();
        slot.querySelectorAll(".alt").forEach(function (a) { a.classList.remove("is-current"); });
        alt.classList.add("is-current");
        // reflect pick in the big name label (strip any qty like "x3")
        var raw = alt.textContent.trim();
        var qtyMatch = raw.match(/[x×]\s*\d+/i);
        var base = raw.replace(/[x×]\s*\d+/i, "").trim();
        if (nameEl) nameEl.textContent = base.toUpperCase();
        if (qtyEl) qtyEl.textContent = qtyMatch ? ("×" + qtyMatch[0].replace(/[^\d]/g, "")) : "";
      });
    });
  });

  /* ---------- COMBAT: mobile control toggle ---------- */
  var mobileToggle = document.getElementById("mobileToggle");
  if (mobileToggle) {
    mobileToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var combat = screens.combat;
      if (combat) {
        var on = combat.classList.toggle("show-mobile");
        mobileToggle.textContent = on ? "▣ DESKTOP" : "▣ MOBILE";
      }
    });
  }

  /* ---------- DEPLOY: live-ish countdown (cosmetic) ---------- */
  var countEl = document.getElementById("deployCount");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (countEl && !reduceMotion) {
    var secs = 8;
    setInterval(function () {
      secs = secs > 0 ? secs - 1 : 8;
      countEl.textContent = "0:" + (secs < 10 ? "0" + secs : secs);
    }, 1000);
  }

  /* ---------- LOADING: gentle progress wobble around the briefed 62% ---------- */
  var loadFill = document.getElementById("loadFill");
  var loadPct = document.getElementById("loadPct");
  if (loadFill && loadPct && !reduceMotion) {
    var base = 62;
    setInterval(function () {
      var jitter = base + Math.round(Math.sin(Date.now() / 900) * 2);
      loadFill.style.width = jitter + "%";
      loadPct.textContent = jitter + "%";
    }, 700);
  }

  // boot
  show("menu");
})();
