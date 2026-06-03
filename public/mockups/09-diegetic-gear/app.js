/* =====================================================================
   DIEGETIC GEAR — interaction layer
   Pure vanilla. Screen switching + diegetic selection states.
   ===================================================================== */
(function () {
  "use strict";

  var ORDER = ["screen-menu", "screen-modes", "screen-deploy", "screen-combat", "screen-loading"];

  var screens = ORDER.map(function (id) { return document.getElementById(id); });
  var segments = Array.prototype.slice.call(document.querySelectorAll(".seg"));

  function showScreen(id) {
    if (ORDER.indexOf(id) === -1) { return; }
    screens.forEach(function (s) {
      if (!s) { return; }
      s.classList.toggle("is-active", s.id === id);
    });
    segments.forEach(function (seg) {
      seg.setAttribute("aria-pressed", String(seg.dataset.target === id));
    });
    // scroll the freshly shown screen to top so phone view never starts mid-clip
    var active = document.getElementById(id);
    if (active) { active.scrollTop = 0; }
  }

  // --- nav segments ---
  segments.forEach(function (seg) {
    seg.addEventListener("click", function () { showScreen(seg.dataset.target); });
  });

  // --- any element with data-target navigates (dog-tags, kit buttons, etc.) ---
  document.querySelectorAll("[data-target]").forEach(function (el) {
    if (el.classList.contains("seg")) { return; }
    el.addEventListener("click", function () { showScreen(el.dataset.target); });
  });

  // --- arrow keys cycle screens ---
  document.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") { return; }
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") { return; }
    var current = ORDER.findIndex(function (id) {
      var s = document.getElementById(id);
      return s && s.classList.contains("is-active");
    });
    if (current === -1) { current = 0; }
    var next = e.key === "ArrowRight"
      ? (current + 1) % ORDER.length
      : (current - 1 + ORDER.length) % ORDER.length;
    showScreen(ORDER[next]);
  });

  /* ---------- generic single-select within a group ---------- */
  function wireSingleSelect(selector, selectedClass, opts) {
    opts = opts || {};
    var items = Array.prototype.slice.call(document.querySelectorAll(selector));
    items.forEach(function (item) {
      item.addEventListener("click", function () {
        items.forEach(function (other) {
          other.classList.remove(selectedClass);
          if (opts.aria) { other.setAttribute("aria-checked", "false"); }
        });
        item.classList.add(selectedClass);
        if (opts.aria) { item.setAttribute("aria-checked", "true"); }
        if (typeof opts.onSelect === "function") { opts.onSelect(item); }
      });
      // keyboard activation for role=radio elements
      if (opts.aria) {
        item.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            item.click();
          }
        });
      }
    });
  }

  // MODES: operation folders
  wireSingleSelect(".op-folder", "is-selected", { aria: true });

  // DEPLOY: vehicle chips
  wireSingleSelect(".veh-chip", "is-selected", { aria: true });

  // DEPLOY: spawn rows <-> map pins kept in sync by data-spawn
  function selectSpawn(key) {
    document.querySelectorAll(".spawn-row").forEach(function (row) {
      var on = row.dataset.spawn === key;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-checked", String(on));
    });
    document.querySelectorAll(".pin").forEach(function (pin) {
      pin.classList.toggle("is-selected", pin.dataset.spawn === key);
    });
  }
  document.querySelectorAll(".spawn-row").forEach(function (row) {
    row.addEventListener("click", function () { selectSpawn(row.dataset.spawn); });
    row.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectSpawn(row.dataset.spawn); }
    });
  });
  document.querySelectorAll(".pin").forEach(function (pin) {
    pin.addEventListener("click", function () { selectSpawn(pin.dataset.spawn); });
  });

  // DEPLOY: loadout kit slots — highlight active (cosmetic swap feedback)
  var kitSlots = Array.prototype.slice.call(document.querySelectorAll(".kit-slot"));
  kitSlots.forEach(function (slot) {
    slot.setAttribute("tabindex", "0");
    slot.addEventListener("click", function () {
      kitSlots.forEach(function (s) { s.classList.remove("is-active"); });
      slot.classList.add("is-active");
    });
    slot.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); slot.click(); }
    });
  });

  // COMBAT: mobile control layout toggle
  var mobileToggle = document.getElementById("mobileToggle");
  var combatScreen = document.getElementById("screen-combat");
  if (mobileToggle && combatScreen) {
    mobileToggle.addEventListener("click", function () {
      var on = combatScreen.classList.toggle("show-mobile");
      mobileToggle.setAttribute("aria-pressed", String(on));
    });
  }

  // default screen
  showScreen("screen-menu");
})();
