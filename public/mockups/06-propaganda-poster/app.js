/* =================================================================
   TERROR IN THE JUNGLE — Propaganda Poster mockup
   Vanilla JS: screen switching + light poster interactions.
   ================================================================= */
(function () {
  'use strict';

  var SCREENS = ['menu', 'modes', 'deploy', 'combat', 'loading'];

  var segs = Array.prototype.slice.call(document.querySelectorAll('.seg'));
  var screens = {};
  SCREENS.forEach(function (id) {
    screens[id] = document.getElementById('screen-' + id);
  });

  var current = 'menu';

  function showScreen(id) {
    if (SCREENS.indexOf(id) === -1) return;
    current = id;
    SCREENS.forEach(function (s) {
      var el = screens[s];
      if (el) el.classList.toggle('is-active', s === id);
    });
    segs.forEach(function (btn) {
      var on = btn.getAttribute('data-screen') === id;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    // scroll to top of stage on switch
    if (window.scrollTo) window.scrollTo(0, 0);
  }

  // --- switcher segments ---
  segs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      showScreen(btn.getAttribute('data-screen'));
    });
  });

  // --- any element with [data-go] navigates ---
  document.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go) {
      e.preventDefault();
      showScreen(go.getAttribute('data-go'));
    }
  });

  // --- left/right arrow keys switch screens ---
  document.addEventListener('keydown', function (e) {
    // ignore when typing in a field (none here, but safe)
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      var idx = SCREENS.indexOf(current);
      idx += (e.key === 'ArrowRight') ? 1 : -1;
      if (idx < 0) idx = SCREENS.length - 1;
      if (idx >= SCREENS.length) idx = 0;
      showScreen(SCREENS[idx]);
      e.preventDefault();
    }
  });

  // =================================================================
  // DEPLOY — spawn selection (rows <-> map markers stay in sync)
  // =================================================================
  var spawnRows = Array.prototype.slice.call(document.querySelectorAll('.spawn-row'));
  var spawnMarkers = Array.prototype.slice.call(document.querySelectorAll('.spawn-marker'));

  function selectSpawn(key) {
    spawnRows.forEach(function (r) {
      r.classList.toggle('is-active', r.getAttribute('data-spawn') === key);
    });
    spawnMarkers.forEach(function (m) {
      m.classList.toggle('is-active', m.getAttribute('data-spawn') === key);
    });
  }

  spawnRows.forEach(function (row) {
    row.addEventListener('click', function () { selectSpawn(row.getAttribute('data-spawn')); });
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSpawn(row.getAttribute('data-spawn')); }
    });
  });
  spawnMarkers.forEach(function (m) {
    m.addEventListener('click', function () { selectSpawn(m.getAttribute('data-spawn')); });
  });
  // initialise marker selection to match the pre-selected row (firebase)
  selectSpawn('firebase');

  // --- vehicle selection ---
  var vehBtns = Array.prototype.slice.call(document.querySelectorAll('.vbtn'));
  vehBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      vehBtns.forEach(function (x) { x.classList.remove('is-active'); });
      b.classList.add('is-active');
    });
  });

  // --- loadout slots: cycle the displayed pick through its alts on tap ---
  var SLOT_PICKS = {
    primary:   ['M16 RIFLE', 'M14', 'M60 LMG', 'SHOTGUN', 'M79 LAUNCHER'],
    secondary: ['M1911 PISTOL', 'SAWN-OFF', 'FLARE GUN'],
    equipment: ['MEDKIT', 'SANDBAGS', 'MORTAR', 'RADIO'],
    explosive: ['M67 GRENADE|×3', 'SMOKE|', 'C4|']
  };
  var slotIndex = { primary: 0, secondary: 0, equipment: 0, explosive: 0 };

  Array.prototype.slice.call(document.querySelectorAll('.slot')).forEach(function (slot) {
    slot.addEventListener('click', function () {
      var key = slot.getAttribute('data-slot');
      var list = SLOT_PICKS[key];
      if (!list) return;
      slotIndex[key] = (slotIndex[key] + 1) % list.length;
      var raw = list[slotIndex[key]];
      var pickEl = slot.querySelector('.slot__pick');
      if (pickEl) {
        if (raw.indexOf('|') !== -1) {
          var parts = raw.split('|');
          pickEl.innerHTML = parts[0] + (parts[1] ? ' <em>' + parts[1] + '</em>' : '');
        } else {
          pickEl.textContent = raw;
        }
      }
      // satisfying little bump
      slot.classList.remove('is-bump');
      // force reflow so the animation can replay
      void slot.offsetWidth;
      slot.classList.add('is-bump');
    });
  });

  // =================================================================
  // DEPLOY — countdown timer (loops, purely cosmetic)
  // =================================================================
  var timerEl = document.getElementById('deploy-timer');
  if (timerEl) {
    var t = 8;
    setInterval(function () {
      t -= 1;
      if (t < 0) t = 8;
      timerEl.textContent = '0:' + (t < 10 ? '0' + t : t);
    }, 1000);
  }

  // =================================================================
  // COMBAT — mobile control toggle
  // =================================================================
  var mobileToggle = document.getElementById('mobile-toggle');
  var touch = document.querySelector('.touch-controls');
  if (mobileToggle && touch) {
    mobileToggle.addEventListener('click', function () {
      var on = touch.classList.toggle('show');
      mobileToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // =================================================================
  // LOADING — rotating field tips (does not advance the bar; bar
  // stays at the spec'd 62% / MODELS phase)
  // =================================================================
  var TIPS = [
    'Suppressing fire pins the enemy in place.',
    'Mark targets for your squad with the spotting key.',
    'Smoke breaks line of sight — push under its cover.',
    'Stay off ridgelines; you skyline against the dawn.',
    'A medkit revives a downed ally faster than a respawn.'
  ];
  var tipEl = document.getElementById('tip-text');
  if (tipEl) {
    var ti = 0;
    setInterval(function () {
      ti = (ti + 1) % TIPS.length;
      tipEl.style.opacity = '0';
      setTimeout(function () {
        tipEl.textContent = TIPS[ti];
        tipEl.style.opacity = '1';
      }, 220);
    }, 4200);
    tipEl.style.transition = 'opacity 0.22s ease';
  }

  // default screen
  showScreen('menu');
})();
