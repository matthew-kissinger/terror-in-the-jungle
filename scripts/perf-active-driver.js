/**
 * perf-active-driver.js — agent-driven perf harness driver.
 *
 * Rewritten in the A4 pass to drive the player via the typed
 * action/observation API in `src/systems/agent/` instead of synthesizing
 * `KeyboardEvent`s. Two structural wins over the previous driver:
 *
 *  1. No keystroke seam. Movement is `agent.apply({ kind: 'move-to' })`;
 *     firing is `agent.apply({ kind: 'fire-at' })`; vehicle exit is
 *     `agent.apply({ kind: 'exit-vehicle' })`. The `PlayerMovement` fixed-step
 *     loop consumes the intent directly, so the class of bugs that came from
 *     state-machine flap (B2 patched the latest instance) is gone.
 *
 *  2. No raw `combatantSystem.getAllCombatants()` probing. The driver reads
 *     `agent.observe()` and picks a target from the bounded
 *     `visibleEntities` list.
 *
 * The external surface (`window.__perfHarnessDriver.start / stop / getDebugSnapshot`)
 * is preserved bit-for-bit. `scripts/perf-capture.ts` needs no changes.
 *
 * Design memo: docs/rearch/E4-agent-player-api.md (spike/E4-agent-player-api).
 */

(function () {
  const globalWindow = window;
  const OPFOR = new Set(['NVA', 'VC']);

  function getEngine() {
    return globalWindow.__engine || null;
  }

  function getAgent() {
    const factory = globalWindow.__agent && globalWindow.__agent.createFromEngine;
    if (typeof factory !== 'function') return null;
    try { return factory(); } catch (_err) { return null; }
  }

  function clampMode(mode) {
    const m = String(mode || 'ai_sandbox').toLowerCase();
    const known = ['ai_sandbox', 'open_frontier', 'a_shau_valley', 'zone_control', 'team_deathmatch'];
    return known.indexOf(m) >= 0 ? m : 'ai_sandbox';
  }

  // Per-mode target selection + distance tuning. Narrower than the old
  // per-mode state machine because movement is now a single continuous
  // `move-to`; there are no separate sprint/advance/retreat/strafe states.
  const MODE_PROFILES = {
    ai_sandbox:      { sprintDistance: 200, maxFireDistance: 165, perceptionRange: 220, objective: 'frontline' },
    open_frontier:   { sprintDistance: 360, maxFireDistance: 245, perceptionRange: 900, objective: 'zone' },
    a_shau_valley:   { sprintDistance: 320, maxFireDistance: 235, perceptionRange: 1100, objective: 'enemy_mass' },
    zone_control:    { sprintDistance: 220, maxFireDistance: 150, perceptionRange: 220, objective: 'zone' },
    team_deathmatch: { sprintDistance: 175, maxFireDistance: 140, perceptionRange: 260, objective: 'enemy_mass' },
  };

  // Health / ammo admin cooldowns. Shared with the previous driver's behavior
  // so combat120 capture continuity is preserved.
  const HEALTH_TOP_UP_COOLDOWN_MS = 12000;
  const HEALTH_TOP_UP_CRITICAL_RATIO = 0.14;
  const HEALTH_TOP_UP_TARGET_RATIO = 0.55;
  const HEALTH_TOP_UP_BURST_HP = 55;
  const AMMO_REFILL_COOLDOWN_MS = 5000;
  const AMMO_RESERVE_FLOOR = 24;
  const RESPAWN_RETRY_COOLDOWN_MS = 450;
  const HEARTBEAT_MS = 250;

  function createDriver(options) {
    const opts = {
      mode: clampMode(options.mode),
      compressFrontline: !!options.compressFrontline,
      allowWarpRecovery: options.allowWarpRecovery === true,
      topUpHealth: options.topUpHealth !== false,
      autoRespawn: options.autoRespawn !== false,
    };
    const profile = MODE_PROFILES[opts.mode];
    let agent = null;

    const state = {
      heartbeatTimer: null,
      respawnCount: 0,
      ammoRefillCount: 0,
      healthTopUpCount: 0,
      frontlineCompressed: false,
      frontlineDistance: 0,
      frontlineMoveCount: 0,
      capturedZoneCount: 0,
      // movementTransitions is kept in the stats surface for backwards-compat
      // with scripts/perf-capture.ts; it stays at 0 because the new driver
      // has no state machine to transition between.
      movementTransitions: 0,
      lastHealthTopUpAt: 0,
      lastAmmoRefillAt: 0,
      respawnRetryAt: 0,
      deathHandled: false,
      lastShotAt: Date.now(),
      lastDebug: null,
      firing: false,
    };

    function ensureAgent() {
      if (agent) return agent;
      agent = getAgent();
      if (agent && profile) {
        agent.setPerception({
          visionRangeM: profile.perceptionRange,
          visionConeRad: Math.PI * 1.2, // slightly wider than human FOV for target selection
          maxVisibleEntities: 64,
        });
      }
      return agent;
    }

    function disablePointerLock(engine) {
      const pc = engine.systemManager && engine.systemManager.playerController;
      if (pc && typeof pc.setPointerLockEnabled === 'function') {
        pc.setPointerLockEnabled(false);
      }
    }

    function topUpHealthIfNeeded(engine, nowMs) {
      if (!opts.topUpHealth) return;
      const health = engine.systemManager && engine.systemManager.playerHealthSystem;
      const ps = health && health.playerState;
      if (!ps) return;
      const maxHp = Number(ps.maxHealth) || 100;
      const hp = Number(ps.health) || 0;
      const ratio = maxHp > 0 ? hp / maxHp : 1;
      if (ratio > HEALTH_TOP_UP_CRITICAL_RATIO) return;
      if (nowMs - state.lastHealthTopUpAt < HEALTH_TOP_UP_COOLDOWN_MS) return;
      ps.health = Math.min(maxHp, Math.max(maxHp * HEALTH_TOP_UP_TARGET_RATIO, hp + HEALTH_TOP_UP_BURST_HP));
      state.lastHealthTopUpAt = nowMs;
      state.healthTopUpCount++;
    }

    function sustainAmmoIfNeeded(engine, nowMs) {
      const weapon = engine.systemManager && engine.systemManager.firstPersonWeapon;
      if (!weapon || typeof weapon.getAmmoState !== 'function') return;
      if (nowMs - state.lastAmmoRefillAt < AMMO_REFILL_COOLDOWN_MS) return;
      const a = weapon.getAmmoState();
      const reserve = Number(a && a.reserveAmmo);
      if (!Number.isFinite(reserve) || reserve > AMMO_RESERVE_FLOOR) return;
      const inv = engine.systemManager.inventoryManager;
      if (inv && typeof inv.reset === 'function') inv.reset();
      if (typeof weapon.enable === 'function') weapon.enable();
      state.lastAmmoRefillAt = nowMs;
      state.ammoRefillCount++;
    }

    function handleDeath(engine, nowMs) {
      if (!opts.autoRespawn) return true;
      if (state.deathHandled && nowMs < state.respawnRetryAt) return true;
      state.deathHandled = true;
      state.respawnRetryAt = nowMs + RESPAWN_RETRY_COOLDOWN_MS;
      const respawn = engine.systemManager && engine.systemManager.playerRespawnManager;
      if (respawn) {
        if (typeof respawn.cancelPendingRespawn === 'function') respawn.cancelPendingRespawn();
        if (typeof respawn.respawnAtBase === 'function') {
          respawn.respawnAtBase();
          state.respawnCount++;
          state.lastHealthTopUpAt = nowMs;
        }
      }
      if (state.firing) {
        agent && agent.apply({ kind: 'cease-fire' });
        state.firing = false;
      }
      return true;
    }

    function pickTarget(obs) {
      if (!obs || !obs.visibleEntities) return null;
      let best = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (let i = 0; i < obs.visibleEntities.length; i++) {
        const e = obs.visibleEntities[i];
        if (!e || e.kind !== 'combatant') continue;
        if (!OPFOR.has(String(e.faction))) continue;
        if (e.distance >= profile.maxFireDistance) continue;
        if (e.distance < bestD) { best = e; bestD = e.distance; }
      }
      return best;
    }

    function pickObjectivePoint(obs) {
      if (!obs) return null;
      const own = obs.ownState && obs.ownState.faction;
      const zones = obs.objectives || [];

      // Prefer contested zone, then any zone not owned by us.
      if (profile.objective === 'zone' || profile.objective === 'frontline') {
        const contested = zones.find((z) => z.owner === 'contested');
        if (contested) return contested.position;
      }

      if (profile.objective === 'enemy_mass' && obs.visibleEntities.length > 0) {
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let i = 0; i < obs.visibleEntities.length; i++) {
          const e = obs.visibleEntities[i];
          if (e.kind === 'combatant' && OPFOR.has(String(e.faction))) {
            sx += e.position.x; sy += e.position.y; sz += e.position.z; n++;
          }
        }
        if (n > 0) return { x: sx / n, y: sy / n, z: sz / n };
      }

      const unowned = zones.find((z) => z.owner !== own && !z.isHomeBase);
      if (unowned) return unowned.position;
      const contested = zones.find((z) => z.owner === 'contested');
      if (contested) return contested.position;
      const any = zones.find((z) => !z.isHomeBase) || zones[0];
      return any ? any.position : null;
    }

    function heartbeat() {
      const engine = getEngine();
      if (!engine) return;
      disablePointerLock(engine);
      const ag = ensureAgent();
      if (!ag) return;

      const nowMs = Date.now();
      const health = engine.systemManager && engine.systemManager.playerHealthSystem;
      const isDead = Boolean(health && typeof health.isDead === 'function' && health.isDead());
      if (!isDead) state.deathHandled = false;

      topUpHealthIfNeeded(engine, nowMs);

      if (isDead) {
        handleDeath(engine, nowMs);
        return;
      }

      // Auto-dismount: if somehow still aboard a vehicle, step out so the
      // infantry weapon loop runs. Best-effort, matches old driver behavior.
      const obs = ag.observe();
      if (obs.ownState.inVehicle) {
        ag.apply({ kind: 'exit-vehicle' });
      }

      sustainAmmoIfNeeded(engine, nowMs);

      // 1) Target selection (fire) — point at the nearest OPFOR within range.
      const target = pickTarget(obs);
      if (target) {
        ag.apply({ kind: 'fire-at', target: target.id, mode: 'hold' });
        state.firing = true;
        state.lastShotAt = nowMs;
      } else if (state.firing) {
        ag.apply({ kind: 'cease-fire' });
        state.firing = false;
      }

      // 2) Movement — march toward an objective (or enemy mass), sprint when far.
      const dest = (target && target.distance < profile.sprintDistance)
        ? target.position
        : (pickObjectivePoint(obs) || (target && target.position) || null);
      if (dest) {
        const own = obs.ownState.position;
        const dx = dest.x - own.x;
        const dz = dest.z - own.z;
        const dist = Math.hypot(dx, dz);
        state.frontlineDistance = dist;
        ag.apply({
          kind: 'move-to',
          target: { x: dest.x, y: dest.y || 0, z: dest.z },
          stance: dist > profile.sprintDistance ? 'sprint' : 'walk',
          tolerance: 6,
        });
      }

      // 3) Advance per-tick steppers so long-running intents (move-to,
      // fire-at hold) integrate toward the goal between heartbeats.
      ag.step();

      state.lastDebug = {
        mode: opts.mode,
        tick: obs.tick,
        targetId: target ? target.id : null,
        targetDistance: target ? target.distance : null,
        destKind: dest ? 'set' : 'none',
        visibleCount: obs.visibleEntities.length,
        firing: state.firing,
        lastShotAt: state.lastShotAt,
        respawnCount: state.respawnCount,
        ammoRefillCount: state.ammoRefillCount,
        healthTopUpCount: state.healthTopUpCount,
      };
    }

    function stop() {
      if (state.heartbeatTimer) {
        clearInterval(state.heartbeatTimer);
        state.heartbeatTimer = null;
      }
      if (agent) {
        try { agent.release(); } catch (_err) { /* intentionally swallowed — harness stop must not throw */ }
      }
      return {
        respawnCount: state.respawnCount,
        ammoRefillCount: state.ammoRefillCount,
        healthTopUpCount: state.healthTopUpCount,
        frontlineCompressed: state.frontlineCompressed,
        frontlineDistance: state.frontlineDistance,
        frontlineMoveCount: state.frontlineMoveCount,
        capturedZoneCount: state.capturedZoneCount,
        movementTransitions: state.movementTransitions,
      };
    }

    function getDebugSnapshot() {
      return state.lastDebug;
    }

    state.heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
    heartbeat();

    return {
      stop,
      getDebugSnapshot,
      movementPatternCount: 0,
      compressFrontline: opts.compressFrontline,
      mode: opts.mode,
      allowWarpRecovery: opts.allowWarpRecovery,
      topUpHealth: opts.topUpHealth,
      autoRespawn: opts.autoRespawn,
    };
  }

  globalWindow.__perfHarnessDriver = {
    start: function (options) {
      if (globalWindow.__perfHarnessDriverState && globalWindow.__perfHarnessDriverState.stop) {
        globalWindow.__perfHarnessDriverState.stop();
      }
      const driver = createDriver(options || {});
      globalWindow.__perfHarnessDriverState = driver;
      return {
        movementPatternCount: driver.movementPatternCount || 0,
        compressFrontline: !!driver.compressFrontline,
        mode: String(driver.mode || ''),
        allowWarpRecovery: !!driver.allowWarpRecovery,
        topUpHealth: driver.topUpHealth !== false,
        autoRespawn: driver.autoRespawn !== false,
      };
    },
    stop: function () {
      if (!globalWindow.__perfHarnessDriverState || !globalWindow.__perfHarnessDriverState.stop) {
        return null;
      }
      const stats = globalWindow.__perfHarnessDriverState.stop();
      globalWindow.__perfHarnessDriverState = null;
      return stats;
    },
    getDebugSnapshot: function () {
      if (!globalWindow.__perfHarnessDriverState || !globalWindow.__perfHarnessDriverState.getDebugSnapshot) {
        return null;
      }
      return globalWindow.__perfHarnessDriverState.getDebugSnapshot();
    },
  };
})();
