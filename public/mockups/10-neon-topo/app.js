/* ============================================================
   NEON TOPO — interaction layer (vanilla JS, no deps)
   Screen switching + small stateful demos for the mockup.
   ============================================================ */
(function () {
  'use strict';

  var SCREENS = ['menu', 'modes', 'deploy', 'combat', 'loading'];
  var body = document.body;
  var segBtns = Array.prototype.slice.call(document.querySelectorAll('.seg__btn'));
  var segInk = document.getElementById('segInk');

  /* ---------------- screen switching ---------------- */
  function showScreen(name) {
    if (SCREENS.indexOf(name) === -1) return;

    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('is-active', s.id === 'screen-' + name);
    });

    segBtns.forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-go') === name);
    });

    body.setAttribute('data-screen', name);
    moveInk();

    // reset scroll of the now-active screen
    var active = document.getElementById('screen-' + name);
    if (active) active.scrollTop = 0;
  }

  /* slide the segmented-control highlight under the active button */
  function moveInk() {
    if (!segInk) return;
    var active = document.querySelector('.seg__btn.is-active');
    if (!active) { segInk.style.opacity = '0'; return; }
    // hidden on phone (segmented bar restyled); skip transform there
    var segRect = active.parentElement.getBoundingClientRect();
    var r = active.getBoundingClientRect();
    if (segRect.width === 0) return;
    segInk.style.opacity = '1';
    segInk.style.width = r.width + 'px';
    segInk.style.transform = 'translateX(' + (r.left - segRect.left - 4) + 'px)';
  }

  // delegate every [data-go] (nav buttons + in-screen CTAs)
  document.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go) {
      e.preventDefault();
      showScreen(go.getAttribute('data-go'));
    }
  });

  // keyboard arrows switch screens
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    var cur = SCREENS.indexOf(body.getAttribute('data-screen'));
    if (cur === -1) cur = 0;
    var next = e.key === 'ArrowRight'
      ? Math.min(SCREENS.length - 1, cur + 1)
      : Math.max(0, cur - 1);
    showScreen(SCREENS[next]);
  });

  window.addEventListener('resize', moveInk);

  /* ---------------- MODES: single-select cards ---------------- */
  var modesGrid = document.getElementById('modesGrid');
  if (modesGrid) {
    modesGrid.addEventListener('click', function (e) {
      var card = e.target.closest('.mode');
      if (!card) return;
      modesGrid.querySelectorAll('.mode').forEach(function (m) {
        var on = m === card;
        m.classList.toggle('is-selected', on);
        var sel = m.querySelector('.mode__sel');
        if (sel) sel.textContent = on ? 'SELECTED' : 'SELECT';
      });
    });
  }

  /* ---------------- DEPLOY: spawn selection (map + list in sync) ---------------- */
  var SPAWN_NAMES = ['FIREBASE ALPHA', 'LZ BRAVO', 'RIDGE OUTPOST', 'RIVER CROSSING', 'HILL 937'];
  var spawnMeta = document.getElementById('spawnMeta');
  var deploySub = document.getElementById('deploySub');
  var vehName = 'UH-1 HUEY';
  var selectedSpawn = 0;

  function selectSpawn(idx) {
    selectedSpawn = idx;
    document.querySelectorAll('.spawn').forEach(function (s) {
      s.classList.toggle('is-selected', +s.getAttribute('data-spawn') === idx);
    });
    document.querySelectorAll('.srow').forEach(function (r) {
      r.classList.toggle('is-selected', +r.getAttribute('data-spawn') === idx);
    });
    if (spawnMeta) spawnMeta.textContent = SPAWN_NAMES[idx];
    updateDeploySub();
  }

  function updateDeploySub() {
    if (deploySub) deploySub.textContent = SPAWN_NAMES[selectedSpawn] + ' · ' + vehName;
  }

  document.querySelectorAll('.spawn, .srow').forEach(function (el) {
    el.addEventListener('click', function () {
      selectSpawn(+el.getAttribute('data-spawn'));
    });
  });

  /* vehicles */
  var vehicles = document.getElementById('vehicles');
  if (vehicles) {
    vehicles.addEventListener('click', function (e) {
      var v = e.target.closest('.veh');
      if (!v) return;
      vehicles.querySelectorAll('.veh').forEach(function (x) { x.classList.remove('is-selected'); });
      v.classList.add('is-selected');
      var b = v.querySelector('b');
      vehName = b ? b.textContent : vehName;
      updateDeploySub();
    });
  }

  /* loadout slots: clicking sets active + cycles the pick through its alternates */
  var kit = document.getElementById('kit');
  if (kit) {
    var ALTS = {
      primary:   ['M16 RIFLE', 'M14', 'M60 LMG', 'SHOTGUN', 'M79 LAUNCHER'],
      secondary: ['M1911 PISTOL', 'SAWN-OFF', 'FLARE GUN'],
      equipment: ['MEDKIT', 'SANDBAGS', 'MORTAR', 'RADIO'],
      explosive: ['M67 GRENADE', 'SMOKE', 'C4']
    };
    var idxState = { primary: 0, secondary: 0, equipment: 0, explosive: 0 };

    kit.addEventListener('click', function (e) {
      var slot = e.target.closest('.slot');
      if (!slot) return;
      var key = slot.getAttribute('data-slot');

      // mark active
      kit.querySelectorAll('.slot').forEach(function (s) { s.classList.remove('is-active'); });
      slot.classList.add('is-active');

      // cycle the pick to the next alternate
      var list = ALTS[key];
      idxState[key] = (idxState[key] + 1) % list.length;
      var nameEl = slot.querySelector('.slot__name');
      if (nameEl) {
        var label = list[idxState[key]];
        if (key === 'explosive') {
          nameEl.innerHTML = label + (label === 'M67 GRENADE'
            ? ' <em class="slot__qty">&times;3</em>'
            : (label === 'SMOKE' ? ' <em class="slot__qty">&times;2</em>' : ''));
        } else {
          nameEl.textContent = label;
        }
      }
    });
  }

  /* DEPLOY countdown — gentle loop, purely cosmetic */
  var countdown = document.getElementById('countdown');
  if (countdown) {
    var t = 8;
    setInterval(function () {
      if (body.getAttribute('data-screen') !== 'deploy') return;
      t = (t <= 0) ? 8 : t - 1;
      countdown.textContent = '0:' + (t < 10 ? '0' + t : t);
    }, 1000);
  }

  /* ---------------- COMBAT: mobile-control toggle + live match timer ---------------- */
  var mobToggle = document.getElementById('mobToggle');
  var touchLayer = document.getElementById('touchLayer');
  var mobState = document.getElementById('mobState');
  if (mobToggle && touchLayer) {
    mobToggle.addEventListener('click', function () {
      var on = touchLayer.classList.toggle('is-on');
      if (mobState) mobState.textContent = on ? 'ON' : 'OFF';
    });
  }

  var matchTimer = document.getElementById('matchTimer');
  if (matchTimer) {
    var secs = 12 * 60 + 47;
    setInterval(function () {
      if (body.getAttribute('data-screen') !== 'combat') return;
      secs = secs > 0 ? secs - 1 : 0;
      var m = Math.floor(secs / 60), s = secs % 60;
      matchTimer.textContent = m + ':' + (s < 10 ? '0' + s : s);
    }, 1000);
  }

  /* ---------------- LOADING: rotating field-intel tips ---------------- */
  var tipText = document.getElementById('tipText');
  if (tipText) {
    var TIPS = [
      'Suppressing fire pins the enemy in place.',
      'Hold high ground to control sightlines across the valley.',
      'Smoke breaks the line of sight — cross open ground under cover.',
      'Mark contested zones; rotate forces before tickets bleed out.',
      'A medkit revives a downed squadmate faster than a respawn.'
    ];
    var ti = 0;
    setInterval(function () {
      ti = (ti + 1) % TIPS.length;
      tipText.style.opacity = '0';
      setTimeout(function () {
        tipText.textContent = TIPS[ti];
        tipText.style.opacity = '1';
      }, 220);
    }, 3600);
    tipText.style.transition = 'opacity .22s ease';
  }

  /* ---------------- boot ---------------- */
  showScreen('menu');
  // ink can need a tick after fonts/layout settle
  setTimeout(moveInk, 60);
  window.addEventListener('load', moveInk);
})();
