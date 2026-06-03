/* =========================================================
   TERROR IN THE JUNGLE // COMMS TERMINAL / CRT
   Vanilla screen-switcher + diegetic terminal behaviors.
   ========================================================= */
(function () {
  "use strict";

  var REDUCED = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var SCREENS = ["menu", "modes", "deploy", "combat", "loading"];

  var segs = Array.prototype.slice.call(document.querySelectorAll(".nav-seg"));
  var sections = {};
  SCREENS.forEach(function (id) {
    sections[id] = document.getElementById("screen-" + id);
  });

  var current = "menu";

  function show(id) {
    if (SCREENS.indexOf(id) === -1) return;
    current = id;
    SCREENS.forEach(function (s) {
      var el = sections[s];
      if (!el) return;
      var on = s === id;
      el.classList.toggle("is-visible", on);
      if (on) { el.removeAttribute("hidden"); }
      else { el.setAttribute("hidden", ""); }
    });
    segs.forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-screen") === id);
    });
    // scroll active screen to top
    if (sections[id]) sections[id].scrollTop = 0;

    if (id === "menu") runBootLines();
    if (id === "deploy") ensureChatter();
  }

  // nav segments
  segs.forEach(function (b) {
    b.addEventListener("click", function () { show(b.getAttribute("data-screen")); });
  });

  // data-go buttons (DEPLOY, SETTINGS->modes, BACK, etc.)
  document.querySelectorAll("[data-go]").forEach(function (el) {
    el.addEventListener("click", function () { show(el.getAttribute("data-go")); });
  });

  // arrow-key navigation
  document.addEventListener("keydown", function (e) {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    var i = SCREENS.indexOf(current);
    if (e.key === "ArrowRight") { show(SCREENS[(i + 1) % SCREENS.length]); }
    else if (e.key === "ArrowLeft") { show(SCREENS[(i - 1 + SCREENS.length) % SCREENS.length]); }
  });

  /* ---------- generic single-select within a group ---------- */
  function singleSelect(items, selectedClass, onSelect) {
    items.forEach(function (item) {
      function pick() {
        items.forEach(function (it) { it.classList.remove(selectedClass); });
        item.classList.add(selectedClass);
        if (onSelect) onSelect(item);
      }
      item.addEventListener("click", pick);
      item.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
      });
    });
  }

  /* ---------- MODES: card selection ---------- */
  singleSelect(
    Array.prototype.slice.call(document.querySelectorAll("#screen-modes .opcard")),
    "is-selected",
    function (card) {
      // update the ACTIVE/STANDBY badges
      document.querySelectorAll("#screen-modes .opcard").forEach(function (c) {
        var sel = c.querySelector(".opcard-sel");
        if (!sel) return;
        if (c === card) { sel.innerHTML = "&#9656; ACTIVE"; }
        else { sel.innerHTML = "&#9633; STANDBY"; }
      });
    }
  );

  /* ---------- DEPLOY: spawn selection (list + glyphs linked) ---------- */
  var spawnEls = Array.prototype.slice.call(document.querySelectorAll("#spawnlist .spawn"));
  var glyphEls = Array.prototype.slice.call(document.querySelectorAll(".spawn-glyph"));

  function selectSpawn(idx) {
    spawnEls.forEach(function (s) {
      s.classList.toggle("is-selected", s.getAttribute("data-spawn") === String(idx));
    });
    glyphEls.forEach(function (g) {
      g.classList.toggle("is-selected", g.getAttribute("data-spawn") === String(idx));
    });
  }
  spawnEls.forEach(function (s) {
    s.addEventListener("click", function () { selectSpawn(s.getAttribute("data-spawn")); });
    s.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectSpawn(s.getAttribute("data-spawn")); }
    });
  });
  glyphEls.forEach(function (g) {
    g.addEventListener("click", function () { selectSpawn(g.getAttribute("data-spawn")); });
  });

  /* ---------- DEPLOY: vehicles + loadout slots ---------- */
  singleSelect(
    Array.prototype.slice.call(document.querySelectorAll(".vehicles .veh")),
    "is-selected"
  );
  singleSelect(
    Array.prototype.slice.call(document.querySelectorAll(".loadout .slot")),
    "is-selected"
  );

  /* ---------- DEPLOY: countdown ticker (purely cosmetic loop) ---------- */
  var deployClock = document.getElementById("deploy-clock");
  var deployBtnClock = document.getElementById("deploy-btn-clock");
  var cd = 8;
  function tickCountdown() {
    cd = cd <= 0 ? 8 : cd - 1;
    var txt = "0:" + (cd < 10 ? "0" + cd : cd);
    if (deployClock) deployClock.textContent = txt;
    if (deployBtnClock) deployBtnClock.textContent = "T‑00:0" + cd;
  }
  if (!REDUCED) setInterval(tickCountdown, 1000);

  /* ---------- MENU: boot line reveal ---------- */
  var bootLines = Array.prototype.slice.call(document.querySelectorAll("[data-boot]"));
  var bootTimers = [];
  function runBootLines() {
    bootTimers.forEach(clearTimeout); bootTimers = [];
    if (REDUCED) { bootLines.forEach(function (l) { l.classList.add("show"); }); return; }
    bootLines.forEach(function (l) { l.classList.remove("show"); });
    bootLines.forEach(function (l, i) {
      bootTimers.push(setTimeout(function () { l.classList.add("show"); }, 350 + i * 420));
    });
  }

  /* ---------- DEPLOY: scrolling comms chatter ---------- */
  var chatter = document.getElementById("chatter");
  var chatterStarted = false;
  var CHATTER = [
    ["0641", "RECON-1", "movement east treeline, over.", false],
    ["0641", "ACTUAL", "copy, hold posiTIon.", false],
    ["0642", "DUSTOFF", "inbound LZ BRAVO 2 mike.", true],
    ["0643", "HILL-937", "taking fire, request air.", true],
    ["0643", "PHANTOM-2", "wheels up, vectoring 047.", false],
    ["0644", "RECON-1", "contact, danger close.", true],
    ["0645", "ALPHA-6", "frag out, suppressing.", false],
    ["0646", "MEDIC", "casualty stable, moving.", false],
    ["0647", "ACTUAL", "all units push the ridge.", false]
  ];
  var chIdx = 0;
  function pushChatter() {
    if (!chatter) return;
    var row = CHATTER[chIdx % CHATTER.length];
    chIdx++;
    var line = document.createElement("div");
    line.className = "ch-line";
    line.innerHTML =
      '<span class="ch-time">' + row[0] + '</span> ' +
      '<span class="ch-call">' + row[1] + '</span> ' +
      (row[3] ? '<span class="ch-amber">' + row[2] + '</span>' : row[2]);
    chatter.appendChild(line);
    // keep ~8 lines
    while (chatter.children.length > 8) chatter.removeChild(chatter.firstChild);
  }
  function ensureChatter() {
    if (chatterStarted || !chatter) return;
    chatterStarted = true;
    for (var i = 0; i < 6; i++) pushChatter();
    if (!REDUCED) setInterval(pushChatter, 2600);
  }

  /* ---------- COMBAT: mobile touch-HUD toggle ---------- */
  var mobToggle = document.getElementById("mobToggle");
  var hud = document.getElementById("hud");
  function setMobile(on) {
    if (!hud || !mobToggle) return;
    hud.setAttribute("data-mobile", on ? "on" : "off");
    mobToggle.classList.toggle("is-on", on);
    mobToggle.innerHTML = on ? "☑ HIDE TOUCH HUD" : "☐ SHOW TOUCH HUD";
  }
  if (mobToggle && hud) {
    mobToggle.addEventListener("click", function () {
      setMobile(hud.getAttribute("data-mobile") !== "on");
    });
    // auto-on for narrow screens
    if (window.matchMedia("(max-width:720px)").matches) setMobile(true);
  }

  /* ---------- LOADING: animated ASCII fill + tip rotation ---------- */
  var loadFill = document.getElementById("loadFill");
  var loadPct = document.getElementById("loadPct");
  var loadAscii = document.getElementById("loadAscii");
  var loadTip = document.getElementById("loadTip");

  var TIPS = [
    "Suppressing fire pins the enemy in place.",
    "Capture zones faster with a full squad stacked.",
    "Smoke breaks line of sight - push under cover.",
    "Call DUSTOFF early; medevac saves tickets.",
    "Hill 937 is hot - flank, do not feed it."
  ];

  function renderAsciiBar(pct) {
    if (!loadAscii) return;
    var width = 40;
    var filled = Math.round((pct / 100) * width);
    var bar = "[";
    for (var i = 0; i < width; i++) bar += i < filled ? "█" : "·";
    bar += "] " + pct + "%";
    loadAscii.textContent = bar;
  }
  renderAsciiBar(62);

  if (!REDUCED) {
    // gentle "loading" shimmer around 62% (does not complete - it's a mockup)
    var base = 62, dir = 1;
    setInterval(function () {
      base += dir * 1;
      if (base >= 66) dir = -1;
      if (base <= 58) dir = 1;
      if (loadFill) loadFill.style.width = base + "%";
      if (loadPct) loadPct.textContent = base + "%";
      renderAsciiBar(base);
    }, 700);

    var tipI = 0;
    setInterval(function () {
      tipI = (tipI + 1) % TIPS.length;
      if (!loadTip) return;
      loadTip.style.opacity = "0";
      setTimeout(function () {
        loadTip.textContent = TIPS[tipI];
        loadTip.style.opacity = "1";
      }, 220);
    }, 3800);
    if (loadTip) loadTip.style.transition = "opacity .22s linear";
  }

  /* ---------- boot ---------- */
  show("menu");
})();
