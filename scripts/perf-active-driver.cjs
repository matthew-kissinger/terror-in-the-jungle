(function (root) {
  const globalWindow = typeof window !== 'undefined' ? window : null;

  function keyToLabel(code) {
    if (code.startsWith('Key')) return code.slice(3).toLowerCase();
    if (code.startsWith('Digit')) return code.slice(5);
    return code.toLowerCase();
  }

  // Alliance helpers: factions are US/ARVN (BLUFOR) and NVA/VC (OPFOR)
  const OPFOR_FACTIONS = new Set(['NVA', 'VC']);
  const BLUFOR_FACTIONS = new Set(['US', 'ARVN']);
  function isOpforFaction(faction) { return OPFOR_FACTIONS.has(faction); }
  function isBluforFaction(faction) { return BLUFOR_FACTIONS.has(faction); }

  // Pure fire decision — shared with scripts/perf-harness/perf-active-driver.test.js.
  // Sign-flipped target-delta (A4-class regression) produces aimDot near -1 and is
  // rejected by the aim_dot_too_low branch.
  function evaluateFireDecision(opts) {
    const forward = opts && opts.cameraForward;
    const toTarget = opts && opts.toTarget;
    const aimDotThreshold = Number(opts && opts.aimDotThreshold);
    const verticalThreshold = Number(opts && opts.verticalThreshold);
    const closeRange = !!(opts && opts.closeRange);

    if (!forward || !toTarget) {
      return { shouldFire: false, reason: 'missing_vectors', aimDot: 0, verticalComponent: 0 };
    }
    const fx = Number(forward.x || 0);
    const fy = Number(forward.y || 0);
    const fz = Number(forward.z || 0);
    const tx = Number(toTarget.x || 0);
    const ty = Number(toTarget.y || 0);
    const tz = Number(toTarget.z || 0);
    const fLen = Math.hypot(fx, fy, fz);
    const tLen = Math.hypot(tx, ty, tz);
    if (!Number.isFinite(fLen) || !Number.isFinite(tLen) || fLen < 1e-6 || tLen < 1e-6) {
      return { shouldFire: false, reason: 'degenerate_vectors', aimDot: 0, verticalComponent: 0 };
    }
    const fnx = fx / fLen;
    const fny = fy / fLen;
    const fnz = fz / fLen;
    const tnx = tx / tLen;
    const tny = ty / tLen;
    const tnz = tz / tLen;
    const aimDot = fnx * tnx + fny * tny + fnz * tnz;
    const verticalComponent = Math.abs(tny);
    const dotThreshold = Number.isFinite(aimDotThreshold) ? aimDotThreshold : 0.8;
    const vThreshold = Number.isFinite(verticalThreshold) ? verticalThreshold : 0.45;

    if (aimDot < dotThreshold) {
      return { shouldFire: false, reason: 'aim_dot_too_low', aimDot: aimDot, verticalComponent: verticalComponent };
    }
    if (verticalComponent > vThreshold && !closeRange) {
      return { shouldFire: false, reason: 'vertical_angle_rejected', aimDot: aimDot, verticalComponent: verticalComponent };
    }
    return { shouldFire: true, reason: 'ok', aimDot: aimDot, verticalComponent: verticalComponent };
  }

  // Layer 2 helper — 5-candidate gradient probe. Returns null if every candidate
  // (ahead, ±45, ±90 off bearingRad) exceeds maxGradient; otherwise the candidate
  // with smallest |gradient| among those that still advance toward the target.
  function chooseHeadingByGradient(opts) {
    const sampleHeight = opts && opts.sampleHeight;
    const from = opts && opts.from;
    const bearingRad = Number(opts && opts.bearingRad);
    const maxGradient = Number(opts && opts.maxGradient);
    const lookAhead = Number(opts && opts.lookAhead);
    if (typeof sampleHeight !== 'function' || !from || !Number.isFinite(bearingRad)) {
      return null;
    }
    const grad = Number.isFinite(maxGradient) && maxGradient > 0 ? maxGradient : 0.45;
    const la = Number.isFinite(lookAhead) && lookAhead > 0 ? lookAhead : 8;
    const hHere = Number(sampleHeight(Number(from.x), Number(from.z)));
    if (!Number.isFinite(hHere)) return null;
    const offsets = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];
    // Rotate so bearingRad is "ahead". Use standard x=sin(yaw), z=-cos(yaw) convention;
    // the driver uses the same mapping in syncCameraAim.
    let best = null;
    let bestAbsGrad = Number.POSITIVE_INFINITY;
    for (let i = 0; i < offsets.length; i++) {
      const yaw = bearingRad + offsets[i];
      const dx = Math.sin(yaw);
      const dz = -Math.cos(yaw);
      // Dot-product of candidate direction with original bearing direction.
      const bdx = Math.sin(bearingRad);
      const bdz = -Math.cos(bearingRad);
      const dot = dx * bdx + dz * bdz;
      if (dot <= 0) continue; // candidate heads sideways/backwards; skip.
      const probeX = Number(from.x) + dx * la;
      const probeZ = Number(from.z) + dz * la;
      const hThere = Number(sampleHeight(probeX, probeZ));
      if (!Number.isFinite(hThere)) continue;
      const gradient = (hThere - hHere) / la;
      const absGradient = Math.abs(gradient);
      if (absGradient > grad) continue;
      if (absGradient < bestAbsGrad) {
        bestAbsGrad = absGradient;
        best = { yaw: yaw, gradient: gradient, offsetRad: offsets[i] };
      }
    }
    return best;
  }

  function createDriver(options) {
    const opts = {
      compressFrontline: !!options.compressFrontline,
      frontlineTriggerDistance: Number(options.frontlineTriggerDistance || 500),
      maxCompressedPerFaction: Number(options.maxCompressedPerFaction || 28),
      mode: String(options.mode || 'ai_sandbox').toLowerCase(),
      allowWarpRecovery: options.allowWarpRecovery === true,
      topUpHealth: options.topUpHealth !== false,
      autoRespawn: options.autoRespawn !== false,
      movementDecisionIntervalMs: Number(options.movementDecisionIntervalMs || 450)
    };
    const enableFrontlineCompression = opts.compressFrontline && (
      opts.mode === 'ai_sandbox' ||
      opts.mode === 'zone_control' ||
      opts.mode === 'team_deathmatch'
    );
    // Layer 4 — scenario terrain contract per mode (tunes Layer 1-3 stack).
    const modeProfiles = {
      ai_sandbox: {
        sprintDistance: 200,
        approachDistance: 120,
        retreatDistance: 18,
        maxFireDistance: 165,
        holdChanceWhenVisible: 0.06,
        transitionHoldMs: 900,
        decisionIntervalMs: Math.max(420, opts.movementDecisionIntervalMs),
        preferredJuke: 'push',
        objectiveBias: 'frontline',
        terrainProfile: 'mountainous',
        maxGradient: 0.55,
        stuckTimeoutSec: 4,
        waypointReplanIntervalMs: 3500
      },
      open_frontier: {
        sprintDistance: 360,
        approachDistance: 185,
        retreatDistance: 16,
        maxFireDistance: 245,
        holdChanceWhenVisible: 0.02,
        transitionHoldMs: 900,
        decisionIntervalMs: Math.max(380, opts.movementDecisionIntervalMs),
        preferredJuke: 'strafe',
        objectiveBias: 'zone',
        terrainProfile: 'rolling',
        maxGradient: 0.45,
        stuckTimeoutSec: 6,
        waypointReplanIntervalMs: 5000
      },
      a_shau_valley: {
        sprintDistance: 320,
        approachDistance: 150,
        retreatDistance: 18,
        maxFireDistance: 235,
        holdChanceWhenVisible: 0.01,
        transitionHoldMs: 850,
        decisionIntervalMs: Math.max(360, opts.movementDecisionIntervalMs),
        preferredJuke: 'push',
        objectiveBias: 'enemy_mass',
        terrainProfile: 'mountainous',
        maxGradient: 0.60,
        stuckTimeoutSec: 5,
        waypointReplanIntervalMs: 4000
      },
      zone_control: {
        sprintDistance: 220,
        approachDistance: 110,
        retreatDistance: 16,
        maxFireDistance: 150,
        holdChanceWhenVisible: 0.05,
        transitionHoldMs: 950,
        decisionIntervalMs: Math.max(480, opts.movementDecisionIntervalMs),
        preferredJuke: 'push',
        objectiveBias: 'zone',
        terrainProfile: 'rolling',
        maxGradient: 0.45,
        stuckTimeoutSec: 6,
        waypointReplanIntervalMs: 5000
      },
      team_deathmatch: {
        sprintDistance: 175,
        approachDistance: 90,
        retreatDistance: 12,
        maxFireDistance: 140,
        holdChanceWhenVisible: 0.08,
        transitionHoldMs: 700,
        decisionIntervalMs: Math.max(360, opts.movementDecisionIntervalMs),
        preferredJuke: 'push',
        objectiveBias: 'enemy_mass',
        terrainProfile: 'flat',
        maxGradient: 0.35,
        stuckTimeoutSec: 8,
        waypointReplanIntervalMs: 6000
      }
    };
    const modeProfile = modeProfiles[opts.mode] || modeProfiles.ai_sandbox;
    const perceptionRange = opts.mode === 'a_shau_valley'
      ? 1100
      : opts.mode === 'open_frontier'
        ? 900
        : opts.mode === 'team_deathmatch'
          ? 260
          : 220;

    const state = {
      fireTimer: null,
      heartbeatTimer: null,
      pressedKeys: new Set(),
      firingHeld: false,
      respawnCount: 0,
      ammoRefillCount: 0,
      healthTopUpCount: 0,
      enemySpawn: null,
      frontlineCompressed: false,
      frontlineDistance: 0,
      frontlineMoveCount: 0,
      targetVisible: false,
      lastMovementDecisionAt: 0,
      movementLockUntil: 0,
      movementState: 'advance',
      previousMovementState: null,
      movementStateSince: 0,
      lastReversalAt: 0,
      movementTransitions: 0,
      firingUntil: 0,
      lastRepositionAt: 0,
      lastFireProbe: null,
      lastStablePos: null,
      stuckMs: 0,
      objectiveZoneId: null,
      objectiveSwitchAt: 0,
      captureZoneId: null,
      captureHoldUntil: 0,
      capturedZoneCount: 0,
      lastShotAt: Date.now(),
      hasFired: false,
      lastAmmoRefillAt: 0,
      lastHealthTopUpAt: 0,
      deathHandled: false,
      respawnRetryAt: 0,
      frontlineInserted: false,
      setupFastForwarded: false,
      forcedContactInsertCount: 0,
      stuckRecoveryMode: false,
      stuckRecoveryUntil: 0,
      // perf-harness-redesign state (Layers 1-3 + LOS counter).
      waypoints: null,
      waypointIdx: 0,
      waypointTarget: null,
      lastWaypointReplanAt: 0,
      waypointReplanFailures: 0,
      waypointsFollowedCount: 0,
      maxStuckMs: 0,
      stuckTeleportCount: 0,
      losRejectedShots: 0,
      gradientProbeDeflections: 0
    };
    const MAX_YAW_STEP = 0.09;
    const MAX_PITCH_STEP = 0.06;
    const MAX_AIM_VERTICAL_DELTA = 4.5;
    const HEALTH_TOP_UP_COOLDOWN_MS = 12000;
    const HEALTH_TOP_UP_CRITICAL_RATIO = 0.14;
    const HEALTH_TOP_UP_CRITICAL_HP_ABS = 20;
    const HEALTH_TOP_UP_TARGET_RATIO = 0.55;
    const HEALTH_TOP_UP_BURST_HP = 55;
    const RESPAWN_RETRY_COOLDOWN_MS = 450;
    const AMMO_REFILL_COOLDOWN_MS = 5000;
    const AMMO_RESERVE_FLOOR = 24;
    const AMMO_CRITICAL_RESERVE = 4;
    const FORCE_CONTACT_REINSERT_MS = opts.mode === 'open_frontier'
      ? 10000
      : opts.mode === 'a_shau_valley'
        ? 12000
        : 22000;
    const FORCE_CONTACT_REINSERT_COOLDOWN_MS = opts.mode === 'open_frontier'
      ? 15000
      : opts.mode === 'a_shau_valley'
        ? 18000
        : 32000;
    let lastForcedContactInsertAt = 0;

    function dispatchKey(type, code) {
      document.dispatchEvent(new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        code: code,
        key: keyToLabel(code)
      }));
    }

    function pressKey(code) {
      if (state.pressedKeys.has(code)) return;
      state.pressedKeys.add(code);
      dispatchKey('keydown', code);
    }

    function releaseKey(code) {
      if (!state.pressedKeys.has(code)) return;
      state.pressedKeys.delete(code);
      dispatchKey('keyup', code);
    }

    function setMovementPattern(pattern) {
      const keys = Array.from(state.pressedKeys);
      for (let i = 0; i < keys.length; i++) {
        if (!pattern.includes(keys[i])) releaseKey(keys[i]);
      }
      for (let i = 0; i < pattern.length; i++) {
        pressKey(pattern[i]);
      }
    }

    // Pairs that count as direction reversals for the anti-flap debounce.
    const REVERSAL_PAIRS = {
      advance: 'retreat',
      retreat: 'advance',
      sprint: 'retreat',
      strafe: 'retreat'
    };
    const REVERSAL_COOLDOWN_MS = 900;

    function isReversal(fromState, toState) {
      return REVERSAL_PAIRS[fromState] === toState;
    }

    function setMovementState(nextState, options) {
      const now = Date.now();
      const force = !!(options && options.force);

      // No-op when already in the target state (but keep pattern fresh without
      // resetting the dwell timer — important so repeated same-state requests
      // don't extend the lock indefinitely).
      if (state.movementState === nextState) {
        return;
      }

      // Enforce minimum dwell in the current state unless the caller forces it
      // (firing locks, capture-point holds, stuck recovery).
      if (!force && now < state.movementLockUntil) {
        return;
      }

      // Anti-flap: suppress rapid direction reversals (e.g. advance <-> retreat
      // bouncing) within a short window, unless forced.
      if (!force && isReversal(state.movementState, nextState) && (now - state.lastReversalAt) < REVERSAL_COOLDOWN_MS) {
        return;
      }

      if (isReversal(state.movementState, nextState)) {
        state.lastReversalAt = now;
      }

      state.previousMovementState = state.movementState;
      state.movementState = nextState;
      state.movementStateSince = now;
      state.movementLockUntil = now + modeProfile.transitionHoldMs + Math.floor(Math.random() * 360);
      state.movementTransitions++;

      if (nextState === 'sprint') {
        setMovementPattern(['KeyW', 'ShiftLeft']);
      } else if (nextState === 'advance') {
        setMovementPattern(Math.random() < 0.5 ? ['KeyW', 'KeyA'] : ['KeyW', 'KeyD']);
      } else if (nextState === 'retreat') {
        setMovementPattern(Math.random() < 0.5 ? ['KeyS', 'KeyA'] : ['KeyS', 'KeyD']);
      } else if (nextState === 'hold') {
        setMovementPattern([]);
      } else if (nextState === 'strafe') {
        setMovementPattern(Math.random() < 0.5 ? ['KeyW', 'KeyA'] : ['KeyW', 'KeyD']);
      }
    }

    function releaseAllKeys() {
      const keys = Array.from(state.pressedKeys);
      for (let i = 0; i < keys.length; i++) {
        releaseKey(keys[i]);
      }
    }

    function dispatchMouse(type, button, buttons) {
      const init = {
        bubbles: true,
        cancelable: true,
        button: button,
        buttons: buttons,
        clientX: globalWindow.innerWidth / 2,
        clientY: globalWindow.innerHeight / 2
      };
      document.dispatchEvent(new MouseEvent(type, init));
      globalWindow.dispatchEvent(new MouseEvent(type, init));
    }

    function invokePlayerAction(actionName) {
      const systems = getSystems();
      const playerController = systems && systems.playerController;
      const action = playerController && playerController[actionName];
      if (typeof action !== 'function') return false;
      action.call(playerController);
      return true;
    }

    function syncCameraAim(camera, cameraController, yaw, pitch) {
      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
      if (cameraController) {
        cameraController.yaw = yaw;
        cameraController.pitch = pitch;
      }
      if (typeof camera.updateMatrixWorld === 'function') {
        camera.updateMatrixWorld(true);
      }
    }

    function syncCameraPosition(camera, cameraController, position) {
      if (!camera || !position) return;
      if (camera.position && typeof camera.position.copy === 'function') {
        camera.position.copy(position);
      } else {
        camera.position.x = Number(position.x || 0);
        camera.position.y = Number(position.y || 0);
        camera.position.z = Number(position.z || 0);
      }
      if (cameraController && typeof cameraController.resetCameraPosition === 'function') {
        cameraController.resetCameraPosition(position);
      }
      if (typeof camera.updateMatrixWorld === 'function') {
        camera.updateMatrixWorld(true);
      }
    }

    function setHarnessPlayerPosition(systems, position, reason) {
      const playerController = systems && systems.playerController;
      if (!playerController || typeof playerController.setPosition !== 'function') return false;
      playerController.setPosition(position, reason);
      const refreshedPos = playerController.getPosition ? playerController.getPosition() : position;
      const camera = playerController.getCamera ? playerController.getCamera() : null;
      syncCameraPosition(camera, playerController.cameraController, refreshedPos);
      state.lastRepositionAt = Date.now();
      return true;
    }

    function mouseDown() {
      if (state.firingHeld) return;
      state.firingHeld = true;
      if (!invokePlayerAction('actionFireStart')) {
        dispatchMouse('mousedown', 0, 1);
      }
    }

    function mouseUp() {
      if (!state.firingHeld) return;
      state.firingHeld = false;
      if (!invokePlayerAction('actionFireStop')) {
        dispatchMouse('mouseup', 0, 0);
      }
    }

    function getSystems() {
      return globalWindow.__engine && globalWindow.__engine.systemManager;
    }

    function disablePointerLockForHarness(systems) {
      const playerController = systems && systems.playerController;
      if (playerController && typeof playerController.setPointerLockEnabled === 'function') {
        playerController.setPointerLockEnabled(false);
      }
    }

    function fastForwardSetupPhaseIfNeeded(systems) {
      if (state.setupFastForwarded || opts.mode !== 'a_shau_valley') return;
      const ticketSystem = systems && systems.ticketSystem;
      if (!ticketSystem || typeof ticketSystem.getGameState !== 'function' || typeof ticketSystem.update !== 'function') {
        return;
      }
      const phase = ticketSystem.getGameState().phase;
      if (phase !== 'SETUP') {
        state.setupFastForwarded = true;
        return;
      }
      const setupDuration = typeof ticketSystem.getSetupDuration === 'function'
        ? Number(ticketSystem.getSetupDuration())
        : 10;
      ticketSystem.update(Math.max(0.25, setupDuration + 0.1));
      state.setupFastForwarded = true;
    }

    function getPlayerShotRay(systems, camera) {
      const firstPersonWeapon = systems && systems.firstPersonWeapon;
      const rigManager = firstPersonWeapon && firstPersonWeapon.rigManager;
      const gunCore = rigManager && rigManager.getCurrentCore ? rigManager.getCurrentCore() : null;
      if (!gunCore || typeof gunCore.computeShotRay !== 'function' || typeof gunCore.getSpreadDeg !== 'function') {
        return null;
      }
      return gunCore.computeShotRay(camera, gunCore.getSpreadDeg());
    }

    function analyzePlayerShot(systems, ray) {
      const combatantSystem = systems && systems.combatantSystem;
      const combatantCombat = combatantSystem && combatantSystem.combatantCombat;
      const hitDetection = combatantCombat && combatantCombat.hitDetection;
      if (!combatantSystem || !combatantCombat || !hitDetection || !ray) {
        return {
          landable: false,
          reason: 'missing_dependencies',
          hit: null,
          terrainHit: null
        };
      }

      const sandbagSystem = combatantCombat.sandbagSystem;
      if (sandbagSystem && typeof sandbagSystem.checkRayIntersection === 'function' && sandbagSystem.checkRayIntersection(ray)) {
        return {
          landable: false,
          reason: 'sandbag_block',
          hit: null,
          terrainHit: null
        };
      }

      const hit = hitDetection.raycastCombatants(ray, 'US', combatantSystem.combatants);
      if (!hit) {
        return {
          landable: false,
          reason: 'no_combatant_hit',
          hit: null,
          terrainHit: null
        };
      }

      const terrainSystem = combatantCombat.terrainSystem;
      if (terrainSystem && typeof terrainSystem.raycastTerrain === 'function') {
        const terrainHit = terrainSystem.raycastTerrain(ray.origin, ray.direction, hit.distance);
        if (terrainHit && terrainHit.hit && Number.isFinite(terrainHit.distance) && terrainHit.distance < hit.distance - 0.5) {
          return {
            landable: false,
            reason: 'terrain_block',
            hit: hit,
            terrainHit: terrainHit
          };
        }
      }

      if (typeof combatantCombat.isBlockedByHeightProfile === 'function' && combatantCombat.isBlockedByHeightProfile(ray, hit.distance)) {
        return {
          landable: false,
          reason: 'height_profile_block',
          hit: hit,
          terrainHit: null
        };
      }

      return {
        landable: true,
        reason: 'clear',
        hit: hit,
        terrainHit: null
      };
    }

    function canLandPlayerShot(systems, ray) {
      return analyzePlayerShot(systems, ray).landable;
    }

    function getEnemySpawn(systems) {
      if (state.enemySpawn) return state.enemySpawn;

      const config = systems && systems.gameModeManager && systems.gameModeManager.getCurrentConfig
        ? systems.gameModeManager.getCurrentConfig()
        : null;
      const zones = config && Array.isArray(config.zones) ? config.zones : null;
      if (zones) {
        for (let i = 0; i < zones.length; i++) {
          const zone = zones[i];
          if (zone && zone.isHomeBase && isOpforFaction(zone.owner) && zone.position) {
            state.enemySpawn = {
              x: Number(zone.position.x),
              y: Number(zone.position.y),
              z: Number(zone.position.z)
            };
            return state.enemySpawn;
          }
        }
      }

      const combatants = systems && systems.combatantSystem && systems.combatantSystem.getAllCombatants
        ? systems.combatantSystem.getAllCombatants()
        : null;
      if (!Array.isArray(combatants)) return null;

      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      for (let i = 0; i < combatants.length; i++) {
        const combatant = combatants[i];
        if (!combatant || combatant.id === 'player_proxy') continue;
        if (!isOpforFaction(combatant.faction)) continue;
        if (combatant.health <= 0 || combatant.state === 'dead') continue;
        sumX += Number(combatant.position.x);
        sumY += Number(combatant.position.y);
        sumZ += Number(combatant.position.z);
        count++;
      }
      if (count > 0) {
        state.enemySpawn = { x: sumX / count, y: sumY / count, z: sumZ / count };
      }
      return state.enemySpawn;
    }

    function getUSSpawn(systems) {
      const config = systems && systems.gameModeManager && systems.gameModeManager.getCurrentConfig
        ? systems.gameModeManager.getCurrentConfig()
        : null;
      const zones = config && Array.isArray(config.zones) ? config.zones : null;
      if (!zones) return null;
      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        if (zone && zone.isHomeBase && isBluforFaction(zone.owner) && zone.position) {
          return {
            x: Number(zone.position.x),
            y: Number(zone.position.y),
            z: Number(zone.position.z)
          };
        }
      }
      return null;
    }

    function getPressureSpawnPoint(systems) {
      const aShauSuggestion = systems
        && systems.playerRespawnManager
        && typeof systems.playerRespawnManager.getAShauPressureInsertionSuggestion === 'function'
        ? (
            systems.playerRespawnManager.getAShauPressureInsertionSuggestion({ minOpfor250: 1 })
            || systems.playerRespawnManager.getAShauPressureInsertionSuggestion({ minOpfor250: 0 })
          )
        : null;
      if (aShauSuggestion) {
        return {
          x: Number(aShauSuggestion.x),
          y: Number(aShauSuggestion.y || 0),
          z: Number(aShauSuggestion.z)
        };
      }

      if (opts.mode === 'open_frontier') {
        const liveFront = getLeadChargePoint(systems) || getEnemyMassPoint(systems) || getEngagementCenter(systems);
        if (liveFront) {
          return {
            x: Number(liveFront.x) + (Math.random() - 0.5) * 28,
            y: Number(liveFront.y || 0),
            z: Number(liveFront.z) + (Math.random() - 0.5) * 28
          };
        }
      }

      const usSpawn = getUSSpawn(systems);
      const enemySpawn = getEnemySpawn(systems);
      if (!usSpawn || !enemySpawn) return enemySpawn || usSpawn || null;

      const midX = (usSpawn.x + enemySpawn.x) * 0.5;
      const midZ = (usSpawn.z + enemySpawn.z) * 0.5;
      const laneX = enemySpawn.x - usSpawn.x;
      const laneZ = enemySpawn.z - usSpawn.z;
      const laneLen = Math.hypot(laneX, laneZ) || 1;
      const dirX = laneX / laneLen;
      const dirZ = laneZ / laneLen;
      const lateralX = -dirZ;
      const lateralZ = dirX;

      // Keep respawn/insert near the middle lane with a slight own-side bias.
      const ownSideBias = 8;
      const along = ownSideBias + (Math.random() - 0.5) * 40;
      const lateral = (Math.random() - 0.5) * 44;
      return {
        x: midX + dirX * along + lateralX * lateral,
        y: (usSpawn.y + enemySpawn.y) * 0.5,
        z: midZ + dirZ * along + lateralZ * lateral
      };
    }

    function findNearestOpfor(systems, maxDistanceSq) {
      const combatants = systems && systems.combatantSystem && systems.combatantSystem.getAllCombatants
        ? systems.combatantSystem.getAllCombatants()
        : null;
      if (!Array.isArray(combatants) || combatants.length === 0) return null;
      const playerPos = systems.playerController && systems.playerController.getPosition
        ? systems.playerController.getPosition()
        : null;
      if (!playerPos) return null;

      let nearest = null;
      let nearestDistSq = Number.POSITIVE_INFINITY;
      for (let i = 0; i < combatants.length; i++) {
        const combatant = combatants[i];
        if (!combatant || combatant.id === 'player_proxy') continue;
        if (!isOpforFaction(combatant.faction)) continue;
        if (combatant.health <= 0 || combatant.state === 'dead') continue;
        const dx = combatant.position.x - playerPos.x;
        const dz = combatant.position.z - playerPos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < nearestDistSq && distSq <= maxDistanceSq) {
          nearestDistSq = distSq;
          nearest = combatant;
        }
      }
      return nearest;
    }

    function predictTargetPoint(targetCombatant, playerPos) {
      if (!targetCombatant || !targetCombatant.position) return null;
      const targetPos = targetCombatant.position;
      const vel = targetCombatant.velocity;
      const vx = vel && Number.isFinite(Number(vel.x)) ? Number(vel.x) : 0;
      const vz = vel && Number.isFinite(Number(vel.z)) ? Number(vel.z) : 0;
      const dx = Number(targetPos.x) - Number(playerPos.x);
      const dz = Number(targetPos.z) - Number(playerPos.z);
      const dist = Math.hypot(dx, dz);
      const leadTime = Math.min(0.35, Math.max(0.08, dist / 280));
      return {
        x: Number(targetPos.x) + vx * leadTime,
        y: Number(targetPos.y || 0),
        z: Number(targetPos.z) + vz * leadTime
      };
    }

    function hasTerrainOcclusion(systems, fromPos, toPos) {
      const terrain = systems && systems.terrainSystem;
      if (!terrain || !terrain.raycastTerrain || !fromPos || !toPos) return false;

      const dx = toPos.x - fromPos.x;
      const dy = (toPos.y || 0) - (fromPos.y || 0);
      const dz = toPos.z - fromPos.z;
      const distance = Math.hypot(dx, dy, dz);
      if (!Number.isFinite(distance) || distance < 0.001) return false;

      const dir = { x: dx / distance, y: dy / distance, z: dz / distance };
      const hit = terrain.raycastTerrain(fromPos, dir, distance);
      return !!(hit && hit.hit && Number.isFinite(hit.distance) && hit.distance < distance - 0.75);
    }

    function hasHeightProfileOcclusion(systems, fromPos, toPos) {
      const terrain = systems && systems.terrainSystem;
      if (!terrain || !terrain.getHeightAt || !fromPos || !toPos) return false;

      const dx = toPos.x - fromPos.x;
      const dz = toPos.z - fromPos.z;
      const horizontalDist = Math.hypot(dx, dz);
      if (!Number.isFinite(horizontalDist) || horizontalDist < 8) return false;

      const samples = Math.min(7, Math.max(3, Math.floor(horizontalDist / 18)));
      let blockingSamples = 0;
      for (let i = 1; i < samples; i++) {
        const t = i / samples;
        const sx = fromPos.x + dx * t;
        const sz = fromPos.z + dz * t;
        const lineY = fromPos.y + ((toPos.y || 0) - (fromPos.y || 0)) * t;
        const terrainY = Number(terrain.getHeightAt(sx, sz));
        if (!Number.isFinite(terrainY)) continue;
        if (terrainY > lineY + 1.3) {
          blockingSamples++;
          if (blockingSamples >= 2) return true;
        }
      }
      return false;
    }

    function getCameraForward(camera) {
      const elements = camera && camera.matrixWorld && camera.matrixWorld.elements;
      if (!elements || elements.length < 16) {
        return { x: 0, y: 0, z: -1 };
      }
      const fx = -elements[8];
      const fy = -elements[9];
      const fz = -elements[10];
      const len = Math.hypot(fx, fy, fz) || 1;
      return { x: fx / len, y: fy / len, z: fz / len };
    }

    function clampAimY(playerY, desiredY, horizontalDist) {
      const py = Number(playerY || 0);
      const dy = Number(desiredY || py);
      if (opts.mode === 'open_frontier' || opts.mode === 'a_shau_valley') {
        return dy;
      }
      const dynamicLimit = Math.max(
        MAX_AIM_VERTICAL_DELTA,
        Number(horizontalDist || 0) * (opts.mode === 'open_frontier' ? 0.18 : opts.mode === 'a_shau_valley' ? 0.2 : 0.08)
      );
      return Math.max(py - dynamicLimit, Math.min(py + dynamicLimit, dy));
    }

    function isTerrainReadyAt(systems, x, z) {
      const terrain = systems && systems.terrainSystem;
      if (!terrain) return false;
      if (terrain.isTerrainReady && !terrain.isTerrainReady()) return false;
      if (terrain.hasTerrainAt) return terrain.hasTerrainAt(Number(x), Number(z));
      return true;
    }

    /** Probe terrain slope at a given angle/distance from position. Returns slope in degrees. */
    function probeTerrainSlope(systems, pos, angleDeg, distance) {
      var terrain = systems && systems.terrainSystem;
      if (!terrain || !terrain.getHeightAt) return 0;
      var rad = angleDeg * Math.PI / 180;
      var probeX = Number(pos.x) + Math.sin(rad) * distance;
      var probeZ = Number(pos.z) + Math.cos(rad) * distance;
      var hHere = Number(terrain.getHeightAt(Number(pos.x), Number(pos.z)));
      var hThere = Number(terrain.getHeightAt(probeX, probeZ));
      if (!Number.isFinite(hHere) || !Number.isFinite(hThere)) return 0;
      var rise = hThere - hHere;
      return Math.abs(Math.atan2(rise, distance)) * 180 / Math.PI;
    }

    /** Find a clear movement yaw (degrees) that avoids steep slopes. Returns null if all blocked. */
    function findClearDirection(systems, pos, preferredYawDeg) {
      var SLOPE_LIMIT = 35;
      var PROBE_DIST = 8;
      // Try preferred direction first, then 90deg offsets, then 180
      var offsets = [0, 90, -90, 45, -45, 135, -135, 180];
      for (var i = 0; i < offsets.length; i++) {
        var testYaw = preferredYawDeg + offsets[i];
        var slope = probeTerrainSlope(systems, pos, testYaw, PROBE_DIST);
        if (slope < SLOPE_LIMIT) return testYaw;
      }
      return null;
    }

    // Layer 1 — navmesh path query wrapper. Tolerant of null (navmesh warming up,
    // anchor off-mesh); callers cascade to Layer 2 direct steering. Waypoints are
    // cloned to plain objects so state mutation can't disturb the query cache.
    function planWaypoints(systems, playerPos, anchor) {
      if (!playerPos || !anchor) return null;
      const navmeshSystem = systems && systems.navmeshSystem;
      if (!navmeshSystem || typeof navmeshSystem.queryPath !== 'function') return null;
      try {
        const startVec = { x: Number(playerPos.x || 0), y: Number(playerPos.y || 0), z: Number(playerPos.z || 0) };
        const endVec = { x: Number(anchor.x || 0), y: Number(anchor.y || 0), z: Number(anchor.z || 0) };
        const path = navmeshSystem.queryPath(startVec, endVec);
        if (!path || path.length === 0) return null;
        const out = [];
        for (let i = 0; i < path.length; i++) {
          const p = path[i];
          if (!p) continue;
          out.push({ x: Number(p.x || 0), y: Number(p.y || 0), z: Number(p.z || 0) });
        }
        return out.length > 0 ? out : null;
      } catch (_err) {
        return null;
      }
    }

    // Layer 2 wrapper — converts the driver's (dx, dz) target delta into the yaw
    // convention chooseHeadingByGradient expects (forward = (sin(yaw), 0, -cos(yaw))).
    function chooseTerrainHeading(systems, from, target, maxGradient) {
      const terrain = systems && systems.terrainSystem;
      if (!terrain || typeof terrain.getHeightAt !== 'function' || !from || !target) return null;
      const dx = Number(target.x || 0) - Number(from.x || 0);
      const dz = Number(target.z || 0) - Number(from.z || 0);
      if (!Number.isFinite(dx + dz) || Math.hypot(dx, dz) < 0.01) return null;
      const bearingRad = Math.atan2(dx, -dz);
      const choice = chooseHeadingByGradient({
        sampleHeight: function (x, z) { return terrain.getHeightAt(x, z); },
        from: from,
        bearingRad: bearingRad,
        maxGradient: Number.isFinite(maxGradient) ? maxGradient : 0.45,
        lookAhead: 8
      });
      if (!choice) return null;
      return { yaw: choice.yaw, gradient: choice.gradient, deflected: Math.abs(choice.offsetRad) > 1e-4 };
    }

    function groundPlayerIfNeeded(systems, playerPos) {
      if (!systems || !systems.playerController || !systems.playerController.setPosition || !playerPos) return;
      if (systems.playerController.isInHelicopter && systems.playerController.isInHelicopter()) return;
      const terrain = systems.terrainSystem;
      if (!terrain || !terrain.getHeightAt) return;
      if (!isTerrainReadyAt(systems, playerPos.x, playerPos.z)) return;
      const ground = Number(terrain.getHeightAt(Number(playerPos.x), Number(playerPos.z)));
      if (!Number.isFinite(ground)) return;
      const targetY = ground + 2;
      const currentY = Number(playerPos.y || 0);
      // Snap only when clearly off-ground to prevent jitter.
      if (Math.abs(currentY - targetY) < 3.5) return;
      const corrected = playerPos.clone ? playerPos.clone() : { x: Number(playerPos.x), y: currentY, z: Number(playerPos.z) };
      corrected.y = targetY;
      setHarnessPlayerPosition(systems, corrected, 'harness.ground_lock');
    }

    function getEngagementCenter(systems) {
      const combatants = systems && systems.combatantSystem && systems.combatantSystem.getAllCombatants
        ? systems.combatantSystem.getAllCombatants()
        : null;
      if (!Array.isArray(combatants) || combatants.length === 0) {
        return getEnemySpawn(systems);
      }

      let usCount = 0;
      let usX = 0;
      let usY = 0;
      let usZ = 0;
      let opforCount = 0;
      let opforX = 0;
      let opforY = 0;
      let opforZ = 0;

      for (let i = 0; i < combatants.length; i++) {
        const combatant = combatants[i];
        if (!combatant || combatant.id === 'player_proxy') continue;
        if (combatant.health <= 0 || combatant.state === 'dead') continue;
        if (isBluforFaction(combatant.faction)) {
          usX += Number(combatant.position.x);
          usY += Number(combatant.position.y);
          usZ += Number(combatant.position.z);
          usCount++;
        } else if (isOpforFaction(combatant.faction)) {
          opforX += Number(combatant.position.x);
          opforY += Number(combatant.position.y);
          opforZ += Number(combatant.position.z);
          opforCount++;
        }
      }

      if (usCount > 0 && opforCount > 0) {
        return {
          x: (usX / usCount + opforX / opforCount) * 0.5,
          y: (usY / usCount + opforY / opforCount) * 0.5,
          z: (usZ / usCount + opforZ / opforCount) * 0.5
        };
      }
      return getEnemySpawn(systems);
    }

    function getLeadChargePoint(systems) {
      const combatants = systems && systems.combatantSystem && systems.combatantSystem.getAllCombatants
        ? systems.combatantSystem.getAllCombatants()
        : null;
      if (!Array.isArray(combatants) || combatants.length === 0) {
        return getEngagementCenter(systems) || getEnemySpawn(systems);
      }

      let usCount = 0;
      let usX = 0;
      let usY = 0;
      let usZ = 0;
      let opforCount = 0;
      let opforX = 0;
      let opforY = 0;
      let opforZ = 0;

      for (let i = 0; i < combatants.length; i++) {
        const combatant = combatants[i];
        if (!combatant || combatant.id === 'player_proxy') continue;
        if (combatant.health <= 0 || combatant.state === 'dead') continue;
        if (isBluforFaction(combatant.faction)) {
          usX += Number(combatant.position.x);
          usY += Number(combatant.position.y);
          usZ += Number(combatant.position.z);
          usCount++;
        } else if (isOpforFaction(combatant.faction)) {
          opforX += Number(combatant.position.x);
          opforY += Number(combatant.position.y);
          opforZ += Number(combatant.position.z);
          opforCount++;
        }
      }

      if (usCount < 1 || opforCount < 1) {
        return getEngagementCenter(systems) || getEnemySpawn(systems);
      }

      const usCenter = { x: usX / usCount, y: usY / usCount, z: usZ / usCount };
      const opforCenter = { x: opforX / opforCount, y: opforY / opforCount, z: opforZ / opforCount };
      const laneX = opforCenter.x - usCenter.x;
      const laneZ = opforCenter.z - usCenter.z;
      const laneLen = Math.hypot(laneX, laneZ) || 1;
      const dirX = laneX / laneLen;
      const dirZ = laneZ / laneLen;

      // Push player ahead of friendly centroid toward contact, not behind the line.
      const pushDist = Math.min(110, Math.max(55, laneLen * 0.32));
      const lateralX = -dirZ;
      const lateralZ = dirX;
      const lateral = (Math.random() - 0.5) * 20;

      return {
        x: usCenter.x + dirX * pushDist + lateralX * lateral,
        y: (usCenter.y + opforCenter.y) * 0.5,
        z: usCenter.z + dirZ * pushDist + lateralZ * lateral
      };
    }

    function getObjectiveZoneTarget(systems, playerPos) {
      const zoneManager = systems && systems.zoneManager;
      const zones = zoneManager && zoneManager.getAllZones ? zoneManager.getAllZones() : null;
      if (!Array.isArray(zones) || zones.length === 0) {
        return null;
      }

      let bestZone = null;
      let bestScore = Number.POSITIVE_INFINITY;
      const now = Date.now();
      const stickyZoneId = now < state.objectiveSwitchAt ? state.objectiveZoneId : null;
      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        if (!zone || zone.isHomeBase) continue;
        const isContested = zone.state === 'contested';
        const isOwnedByUs = isBluforFaction(zone.owner);
        const isSticky = stickyZoneId && zone.id === stickyZoneId;
        const priority = isContested ? 0 : isOwnedByUs ? 3 : 1;
        const dx = Number(zone.position.x) - Number(playerPos.x);
        const dz = Number(zone.position.z) - Number(playerPos.z);
        const distSq = dx * dx + dz * dz;
        const score = priority * 500000 + distSq + (isSticky ? -160000 : 0);
        if (score < bestScore) {
          bestScore = score;
          bestZone = zone;
        }
      }

      if (bestZone && bestZone.position) {
        state.objectiveZoneId = String(bestZone.id || '');
        state.objectiveSwitchAt = now + 5500 + Math.floor(Math.random() * 2200);
        return {
          x: Number(bestZone.position.x),
          y: Number(bestZone.position.y || 0),
          z: Number(bestZone.position.z)
        };
      }
      return null;
    }

    function findZoneById(zones, id) {
      if (!Array.isArray(zones) || !id) return null;
      for (let i = 0; i < zones.length; i++) {
        if (zones[i] && String(zones[i].id) === String(id)) return zones[i];
      }
      return null;
    }

    function getCaptureFocus(systems, playerPos) {
      const zoneManager = systems && systems.zoneManager;
      const zones = zoneManager && zoneManager.getAllZones ? zoneManager.getAllZones() : null;
      if (!Array.isArray(zones) || zones.length === 0) {
        state.captureZoneId = null;
        state.captureHoldUntil = 0;
        return null;
      }

      const now = Date.now();
      const activeZone = findZoneById(zones, state.captureZoneId);
      if (activeZone) {
        const dx = Number(activeZone.position.x) - Number(playerPos.x);
        const dz = Number(activeZone.position.z) - Number(playerPos.z);
        const dist = Math.hypot(dx, dz);
        const inside = dist <= Math.max(7, Number(activeZone.radius) * 0.72);

        if (isBluforFaction(activeZone.owner) && !activeZone.isHomeBase) {
          state.capturedZoneCount += 1;
          state.captureZoneId = null;
          state.captureHoldUntil = 0;
          return null;
        }

        if (inside && now > state.captureHoldUntil) {
          // Capture in Open Frontier can take a long time with a single actor.
          state.captureHoldUntil = now + 90000 + Math.floor(Math.random() * 20000);
        }

        if (dist > Math.max(16, Number(activeZone.radius) * 1.5) && now > state.captureHoldUntil) {
          state.captureZoneId = null;
          state.captureHoldUntil = 0;
          return null;
        }

        return {
          zone: activeZone,
          target: {
            x: Number(activeZone.position.x),
            y: Number(activeZone.position.y || 0),
            z: Number(activeZone.position.z)
          },
          inside: inside,
          hold: now < state.captureHoldUntil
        };
      }

      let bestZone = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        if (!zone || zone.isHomeBase) continue;
        if (isBluforFaction(zone.owner) && zone.state !== 'contested') continue;
        const dx = Number(zone.position.x) - Number(playerPos.x);
        const dz = Number(zone.position.z) - Number(playerPos.z);
        const dist = Math.hypot(dx, dz);
        const prefer = zone.state === 'contested' ? -20 : 0;
        const score = dist + prefer;
        if (score < bestDist) {
          bestDist = score;
          bestZone = zone;
        }
      }

      if (!bestZone) return null;
      const distToBest = Math.hypot(Number(bestZone.position.x) - Number(playerPos.x), Number(bestZone.position.z) - Number(playerPos.z));
      state.captureZoneId = String(bestZone.id || '');
      state.captureHoldUntil = now + 110000 + Math.floor(Math.random() * 25000);
      return {
        zone: bestZone,
        target: {
          x: Number(bestZone.position.x),
          y: Number(bestZone.position.y || 0),
          z: Number(bestZone.position.z)
        },
        inside: distToBest <= Math.max(7, Number(bestZone.radius) * 0.72),
        hold: distToBest <= Math.max(7, Number(bestZone.radius) * 0.72)
      };
    }

    function getEnemyMassPoint(systems) {
      const combatants = systems && systems.combatantSystem && systems.combatantSystem.getAllCombatants
        ? systems.combatantSystem.getAllCombatants()
        : null;
      if (!Array.isArray(combatants) || combatants.length === 0) return null;

      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      for (let i = 0; i < combatants.length; i++) {
        const combatant = combatants[i];
        if (!combatant || combatant.id === 'player_proxy') continue;
        if (!isOpforFaction(combatant.faction)) continue;
        if (combatant.health <= 0 || combatant.state === 'dead') continue;
        sumX += Number(combatant.position.x);
        sumY += Number(combatant.position.y || 0);
        sumZ += Number(combatant.position.z);
        count++;
      }
      if (count < 1) return null;
      return { x: sumX / count, y: sumY / count, z: sumZ / count };
    }

    function getModeObjective(systems, playerPos) {
      if (opts.mode === 'open_frontier' && !state.hasFired) {
        return (
          getEnemyMassPoint(systems) ||
          getLeadChargePoint(systems) ||
          getObjectiveZoneTarget(systems, playerPos) ||
          getEngagementCenter(systems) ||
          getEnemySpawn(systems)
        );
      }
      if (modeProfile.objectiveBias === 'zone') {
        return (
          getObjectiveZoneTarget(systems, playerPos) ||
          getLeadChargePoint(systems) ||
          getEngagementCenter(systems) ||
          getEnemySpawn(systems)
        );
      }
      if (modeProfile.objectiveBias === 'enemy_mass') {
        return (
          getEnemyMassPoint(systems) ||
          getLeadChargePoint(systems) ||
          getEngagementCenter(systems) ||
          getEnemySpawn(systems)
        );
      }
      return getLeadChargePoint(systems) || getEngagementCenter(systems) || getEnemySpawn(systems);
    }

    function compressFrontline(systems) {
      if (!enableFrontlineCompression || state.frontlineCompressed) return;
      const combatants = systems && systems.combatantSystem && systems.combatantSystem.getAllCombatants
        ? systems.combatantSystem.getAllCombatants()
        : null;
      if (!Array.isArray(combatants) || combatants.length === 0) return;

      const alive = combatants.filter((combatant) =>
        combatant &&
        combatant.id !== 'player_proxy' &&
        combatant.health > 0 &&
        combatant.state !== 'dead'
      );
      const us = alive.filter((combatant) => isBluforFaction(combatant.faction));
      const opfor = alive.filter((combatant) => isOpforFaction(combatant.faction));
      if (us.length === 0 || opfor.length === 0) return;

      function centroid(items) {
        let sumX = 0;
        let sumZ = 0;
        for (let i = 0; i < items.length; i++) {
          sumX += Number(items[i].position.x);
          sumZ += Number(items[i].position.z);
        }
        return { x: sumX / items.length, z: sumZ / items.length };
      }

      const usCenter = centroid(us);
      const opforCenter = centroid(opfor);
      const dx = opforCenter.x - usCenter.x;
      const dz = opforCenter.z - usCenter.z;
      const distance = Math.hypot(dx, dz);
      state.frontlineDistance = distance;
      if (!Number.isFinite(distance) || distance < opts.frontlineTriggerDistance) {
        state.frontlineCompressed = true;
        return;
      }

      const safeDx = distance > 0.001 ? dx / distance : 1;
      const safeDz = distance > 0.001 ? dz / distance : 0;
      const midpointX = (usCenter.x + opforCenter.x) * 0.5;
      const midpointZ = (usCenter.z + opforCenter.z) * 0.5;
      const lateralX = -safeDz;
      const lateralZ = safeDx;

      function moveGroup(group, side) {
        let moved = 0;
        const cap = Math.min(group.length, Math.max(0, opts.maxCompressedPerFaction));
        for (let i = 0; i < cap; i++) {
          const combatant = group[i];
          const laneOffset = (Math.random() - 0.5) * 130;
          const forwardOffset = side * (35 + Math.random() * 25);
          const nextX = midpointX + safeDx * forwardOffset + lateralX * laneOffset;
          const nextZ = midpointZ + safeDz * forwardOffset + lateralZ * laneOffset;
          const height = systems.terrainSystem && systems.terrainSystem.getHeightAt
            ? systems.terrainSystem.getHeightAt(nextX, nextZ)
            : undefined;
          combatant.position.x = nextX;
          combatant.position.z = nextZ;
          if (Number.isFinite(height)) {
            combatant.position.y = Number(height) + 2;
          }
          if (combatant.velocity && combatant.velocity.set) {
            combatant.velocity.set(0, 0, 0);
          }
          moved++;
        }
        return moved;
      }

      const usMoved = moveGroup(us, -1);
      const opforMoved = moveGroup(opfor, 1);
      state.frontlineMoveCount = usMoved + opforMoved;
      state.frontlineCompressed = true;
    }

    function topUpPlayerHealth(health) {
      if (!opts.topUpHealth || !health || !health.getHealth || !health.getMaxHealth || !health.isDead || health.isDead()) {
        return;
      }
      const now = Date.now();
      if (now - state.lastHealthTopUpAt < HEALTH_TOP_UP_COOLDOWN_MS) return;
      const hp = Number(health.getHealth());
      const maxHp = Number(health.getMaxHealth());
      if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return;
      const criticalHp = Math.max(HEALTH_TOP_UP_CRITICAL_HP_ABS, maxHp * HEALTH_TOP_UP_CRITICAL_RATIO);
      if (hp > criticalHp) return;
      if (!health.playerState) return;
      const targetHp = Math.min(maxHp, Math.max(maxHp * HEALTH_TOP_UP_TARGET_RATIO, hp + HEALTH_TOP_UP_BURST_HP));
      health.playerState.health = targetHp;
      state.lastHealthTopUpAt = now;
      state.healthTopUpCount++;
    }

    function sustainAmmo(systems, forceRefill) {
      const weapon = systems && systems.firstPersonWeapon;
      if (!weapon || typeof weapon.getAmmoState !== 'function') return false;
      const now = Date.now();
      if (!forceRefill && now - state.lastAmmoRefillAt < AMMO_REFILL_COOLDOWN_MS) return false;
      const ammoState = weapon.getAmmoState();
      const magazine = Number(ammoState && ammoState.currentMagazine);
      const reserve = Number(ammoState && ammoState.reserveAmmo);
      if (!Number.isFinite(magazine) || !Number.isFinite(reserve)) return false;
      const needsRefill = forceRefill || reserve <= AMMO_RESERVE_FLOOR || (magazine <= 0 && reserve <= AMMO_CRITICAL_RESERVE);
      if (!needsRefill) return false;
      if (systems.inventoryManager && typeof systems.inventoryManager.reset === 'function') {
        systems.inventoryManager.reset();
      }
      if (typeof weapon.enable === 'function') {
        weapon.enable();
      }
      state.lastAmmoRefillAt = now;
      state.ammoRefillCount++;
      return true;
    }

    function keepPlayerInAction() {
      const systems = getSystems();
      if (!systems) return;
      disablePointerLockForHarness(systems);
      fastForwardSetupPhaseIfNeeded(systems);

      const health = systems.playerHealthSystem;
      const isDead = Boolean(health && health.isDead && health.isDead());
      if (!isDead) {
        state.deathHandled = false;
      }
      topUpPlayerHealth(health);

      if (opts.autoRespawn && isDead) {
        const now = Date.now();
        if (state.deathHandled && now < state.respawnRetryAt) {
          return;
        }
        state.deathHandled = true;
        state.respawnRetryAt = now + RESPAWN_RETRY_COOLDOWN_MS;
        releaseAllKeys();
        mouseUp();
        let respawned = false;
        if (systems.playerRespawnManager && systems.playerRespawnManager.cancelPendingRespawn) {
          systems.playerRespawnManager.cancelPendingRespawn();
        }
        if (systems.playerRespawnManager && systems.playerRespawnManager.respawnAtBase) {
          systems.playerRespawnManager.respawnAtBase();
          respawned = true;
        }
        if (opts.allowWarpRecovery) {
          const pressureSpawn = getPressureSpawnPoint(systems);
          if (pressureSpawn && systems.playerController && systems.playerController.setPosition) {
            if (isTerrainReadyAt(systems, pressureSpawn.x, pressureSpawn.z)) {
              const currentPos = systems.playerController.getPosition ? systems.playerController.getPosition() : null;
              const nextPos = currentPos && currentPos.clone ? currentPos.clone() : { x: 0, y: pressureSpawn.y, z: 0 };
              nextPos.x = pressureSpawn.x;
              nextPos.z = pressureSpawn.z;
              nextPos.y = pressureSpawn.y;
              const height = systems.terrainSystem && systems.terrainSystem.getHeightAt
                ? systems.terrainSystem.getHeightAt(nextPos.x, nextPos.z)
                : undefined;
              if (Number.isFinite(height)) nextPos.y = Number(height) + 2;
              setHarnessPlayerPosition(systems, nextPos, 'harness.recovery.respawn');
            }
          }
        }
        if (respawned) {
          state.respawnCount++;
          state.lastHealthTopUpAt = now;
          sustainAmmo(systems, true);
        }
        return;
      }

      if (isDead) {
        return;
      }

      if (systems.playerController && systems.playerController.isInHelicopter && systems.playerController.isInHelicopter()) {
        const position = systems.playerController.getPosition ? systems.playerController.getPosition() : null;
        if (position && position.clone) {
          const exitPos = position.clone();
          const height = systems.terrainSystem && systems.terrainSystem.getHeightAt
            ? systems.terrainSystem.getHeightAt(exitPos.x, exitPos.z)
            : undefined;
          exitPos.y = Number.isFinite(height) ? Number(height) + 2 : exitPos.y;
          if (systems.playerController.exitHelicopter) {
            systems.playerController.exitHelicopter(exitPos);
          }
        }
      }

      compressFrontline(systems);

      const playerPos = systems.playerController && systems.playerController.getPosition
        ? systems.playerController.getPosition()
        : null;
      const camera = systems.playerController && systems.playerController.getCamera
        ? systems.playerController.getCamera()
        : null;
      if (!playerPos || !camera) return;
      sustainAmmo(systems, false);
      syncCameraPosition(camera, systems.playerController.cameraController, playerPos);
      groundPlayerIfNeeded(systems, playerPos);

      const enemySpawn = getEnemySpawn(systems);
      const pressureSpawn = getPressureSpawnPoint(systems);
      if (!state.frontlineInserted && pressureSpawn && (opts.mode === 'open_frontier' || opts.mode === 'a_shau_valley')) {
        const nextPos = playerPos.clone ? playerPos.clone() : { x: Number(playerPos.x), y: Number(playerPos.y || 0), z: Number(playerPos.z) };
        nextPos.x = pressureSpawn.x;
        nextPos.z = pressureSpawn.z;
        const height = systems.terrainSystem && systems.terrainSystem.getHeightAt
          ? systems.terrainSystem.getHeightAt(nextPos.x, nextPos.z)
          : undefined;
        if (Number.isFinite(height)) nextPos.y = Number(height) + 2;
        if (setHarnessPlayerPosition(systems, nextPos, 'harness.recovery.frontline_start')) {
          state.frontlineInserted = true;
          state.stuckMs = 0;
          return;
        }
      }
      const engagementCenter = getEngagementCenter(systems) || enemySpawn;
      if (pressureSpawn) {
        const distToPressure = Math.hypot(pressureSpawn.x - playerPos.x, pressureSpawn.z - playerPos.z);
        if (distToPressure > 260 && opts.allowWarpRecovery) {
          if (!isTerrainReadyAt(systems, pressureSpawn.x, pressureSpawn.z)) {
            // Skip pressure warp until terrain around target is resident.
            // Keeps harness movement from dropping player through not-yet-loaded ground.
            return;
          }
          const insertPos = playerPos.clone();
          insertPos.x = pressureSpawn.x;
          insertPos.z = pressureSpawn.z;
          const h = systems.terrainSystem && systems.terrainSystem.getHeightAt
            ? systems.terrainSystem.getHeightAt(insertPos.x, insertPos.z)
            : undefined;
          if (Number.isFinite(h)) insertPos.y = Number(h) + 2;
          if (setHarnessPlayerPosition(systems, insertPos, 'harness.recovery.pressure')) {
            return;
          }
        }
      }
      const nearestOpfor = findNearestOpfor(systems, perceptionRange * perceptionRange);
      const nearestDist = nearestOpfor
        ? Math.hypot(nearestOpfor.position.x - playerPos.x, nearestOpfor.position.z - playerPos.z)
        : Number.POSITIVE_INFINITY;
      const predictedTarget = nearestOpfor ? predictTargetPoint(nearestOpfor, playerPos) : null;
      const target = predictedTarget || nearestOpfor?.position || getModeObjective(systems, playerPos) || engagementCenter;
      state.targetVisible = false;

      if (target) {
        const cameraController = systems.playerController ? systems.playerController.cameraController : null;
        const prevYaw = cameraController ? Number(cameraController.yaw || 0) : Number(camera.rotation.y || 0);
        const prevPitch = cameraController ? Number(cameraController.pitch || 0) : Number(camera.rotation.x || 0);

        const targetHorizontalDist = Math.hypot(
          Number((target.x || 0) - playerPos.x),
          Number((target.z || 0) - playerPos.z)
        );
        const aimY = clampAimY(playerPos.y, (target.y || 0) + 1.2, targetHorizontalDist);
        camera.lookAt(target.x, aimY, target.z);
        const desiredYaw = Number(camera.rotation.y || 0);
        const desiredPitch = Number(camera.rotation.x || 0);
        let yawDelta = desiredYaw - prevYaw;
        while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
        while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
        const pitchDelta = desiredPitch - prevPitch;

        const distToTarget = Math.hypot(
          Number((target.x || 0) - playerPos.x),
          Number((target.z || 0) - playerPos.z)
        );
        const dynamicYawStep = Math.min(0.14, MAX_YAW_STEP + (distToTarget < 85 ? 0.03 : 0));
        const dynamicPitchStep = Math.min(0.1, MAX_PITCH_STEP + (distToTarget < 85 ? 0.02 : 0));
        const nextYaw = prevYaw + Math.max(-dynamicYawStep, Math.min(dynamicYawStep, yawDelta));
        const nextPitch = prevPitch + Math.max(-dynamicPitchStep, Math.min(dynamicPitchStep, pitchDelta));

        syncCameraAim(camera, cameraController, nextYaw, nextPitch);

        if (nearestOpfor) {
          const probeShotRay = getPlayerShotRay(systems, camera);
          state.targetVisible = canLandPlayerShot(systems, probeShotRay);
        }
      }

      const captureFocus = getCaptureFocus(systems, playerPos);
      const shouldBiasCombat = opts.mode === 'open_frontier'
        && (state.capturedZoneCount > 0 || (Date.now() - state.lastShotAt) > 25000);
      const combatTarget = getEnemyMassPoint(systems) || getLeadChargePoint(systems) || engagementCenter;
      const objectiveTarget = shouldBiasCombat
        ? (combatTarget || captureFocus?.target || getModeObjective(systems, playerPos) || engagementCenter)
        : (captureFocus?.target || getModeObjective(systems, playerPos) || engagementCenter);
      const nearestPredicted = nearestOpfor ? predictTargetPoint(nearestOpfor, playerPos) : null;
      const predictedLockDistance = Math.max(95, Number(modeProfile.maxFireDistance || 0));
      const movementTarget = (nearestPredicted && nearestDist < predictedLockDistance) ? nearestPredicted : objectiveTarget;

      const nowMs = Date.now();
      const noContactTooLong = (nowMs - state.lastShotAt) > FORCE_CONTACT_REINSERT_MS;
      const farFromFight = !nearestOpfor
        || nearestDist > Math.max(200, Number(modeProfile.maxFireDistance || 0) + 10)
        || !state.targetVisible;
      const maxForcedContactInserts = opts.mode === 'open_frontier' ? 1 : 2;
      if (
        farFromFight
        && noContactTooLong
        && state.forcedContactInsertCount < maxForcedContactInserts
        && (nowMs - lastForcedContactInsertAt) > FORCE_CONTACT_REINSERT_COOLDOWN_MS
      ) {
        const insertAnchor = getEnemyMassPoint(systems) || getLeadChargePoint(systems) || engagementCenter || movementTarget;
        if (insertAnchor && systems.playerController && systems.playerController.setPosition) {
          const nextPos = playerPos.clone ? playerPos.clone() : { x: Number(playerPos.x), y: Number(playerPos.y || 0), z: Number(playerPos.z) };
          const lateral = (Math.random() - 0.5) * 70;
          const forward = 35 + Math.random() * 35;
          nextPos.x = Number(insertAnchor.x) + forward;
          nextPos.z = Number(insertAnchor.z) + lateral;
          if (!isTerrainReadyAt(systems, nextPos.x, nextPos.z)) {
            return;
          }
          const h = systems.terrainSystem && systems.terrainSystem.getHeightAt
            ? systems.terrainSystem.getHeightAt(nextPos.x, nextPos.z)
            : undefined;
          if (Number.isFinite(h)) nextPos.y = Number(h) + 2;
          if (setHarnessPlayerPosition(systems, nextPos, 'harness.recovery.contact_insert')) {
            lastForcedContactInsertAt = nowMs;
            state.forcedContactInsertCount++;
            state.stuckMs = 0;
            return;
          }
        }
      }

      if (movementTarget) {
        // Layer 1 — navmesh waypoint routing. Throttle covers both success and
        // failure paths (failed queryPath still updates lastWaypointReplanAt so the
        // 250ms heartbeat doesn't hammer the query). Path-exhausted case retries
        // sooner (750ms) so waypoint advancement stays snappy.
        const waypointAnchor = engagementCenter || objectiveTarget || movementTarget;
        const replanIntervalMs = Number(modeProfile.waypointReplanIntervalMs || 5000);
        const sinceReplanMs = Date.now() - state.lastWaypointReplanAt;
        const pathExhausted =
          !state.waypoints
          || state.waypoints.length === 0
          || state.waypointIdx >= state.waypoints.length;
        const needsReplan =
          sinceReplanMs > replanIntervalMs
          || (pathExhausted && sinceReplanMs > 750);
        if (waypointAnchor && needsReplan) {
          const path = planWaypoints(systems, playerPos, waypointAnchor);
          state.lastWaypointReplanAt = Date.now();
          if (path && path.length > 0) {
            state.waypoints = path;
            state.waypointIdx = 0;
            state.waypointTarget = {
              x: Number(waypointAnchor.x || 0),
              y: Number(waypointAnchor.y || 0),
              z: Number(waypointAnchor.z || 0)
            };
          } else {
            state.waypointReplanFailures++;
            // Cascade to Layer 2 / direct target steering until the next replan window.
            state.waypoints = null;
          }
        }

        // Advance waypoint index when within 4m; force a replan once path is done.
        if (state.waypoints && state.waypoints.length > 0) {
          while (state.waypointIdx < state.waypoints.length) {
            const wp = state.waypoints[state.waypointIdx];
            const wpDx = Number(wp.x || 0) - Number(playerPos.x || 0);
            const wpDz = Number(wp.z || 0) - Number(playerPos.z || 0);
            if (Math.hypot(wpDx, wpDz) > 4) break;
            state.waypointIdx++;
          }
          if (state.waypointIdx >= state.waypoints.length) state.lastWaypointReplanAt = 0;
        }

        // Steering target is the next waypoint if Layer 1 gave us one, else direct.
        let steeringTarget = movementTarget;
        if (state.waypoints && state.waypoints.length > 0 && state.waypointIdx < state.waypoints.length) {
          steeringTarget = state.waypoints[state.waypointIdx];
          state.waypointsFollowedCount++;
        }

        const dx = steeringTarget.x - playerPos.x;
        const dz = steeringTarget.z - playerPos.z;
        const dist = Math.hypot(dx, dz);
        // Distance to the final movement target (not waypoint) for the downstream
        // movement-state policy; keeps sprint/advance distance semantics intact.
        const finalDx = movementTarget.x - playerPos.x;
        const finalDz = movementTarget.z - playerPos.z;
        const finalDist = Math.hypot(finalDx, finalDz);
        if (!state.lastStablePos) {
          state.lastStablePos = { x: Number(playerPos.x), z: Number(playerPos.z) };
          state.stuckMs = 0;
        } else {
          const moved = Math.hypot(Number(playerPos.x) - state.lastStablePos.x, Number(playerPos.z) - state.lastStablePos.z);
          if (moved < 0.4) {
            state.stuckMs += 250;
          } else {
            state.stuckMs = 0;
            state.lastStablePos.x = Number(playerPos.x);
            state.lastStablePos.z = Number(playerPos.z);
          }
        }
        if (state.stuckMs > state.maxStuckMs) state.maxStuckMs = state.stuckMs;

        // Layer 3 — stuck detection. 3s triggers retreat-strafe; mode-specific
        // stuckTimeoutSec escalates to teleport (reason: harness.recovery.stuck).
        const stuckTimeoutMs = Math.max(1000, Number(modeProfile.stuckTimeoutSec || 5) * 1000);
        if (state.stuckMs > 3000 && !state.stuckRecoveryMode) {
          state.stuckRecoveryMode = true;
          state.stuckRecoveryUntil = Date.now() + 2000;
          setMovementState('retreat', { force: true });
        }
        if (state.stuckRecoveryMode && Date.now() < state.stuckRecoveryUntil) {
          // Alternate strafes during recovery
          if (Math.random() < 0.3) {
            setMovementPattern(Math.random() < 0.5 ? ['KeyS', 'KeyA'] : ['KeyS', 'KeyD']);
          }
          return;
        }
        if (state.stuckRecoveryMode && Date.now() >= state.stuckRecoveryUntil) {
          state.stuckRecoveryMode = false;
        }

        if (state.stuckMs > stuckTimeoutMs) {
          // Prefer hop to next waypoint (keeps planned route); else teleport near
          // the engagement anchor.
          let teleportTarget = null;
          if (
            state.waypoints
            && state.waypoints.length > 0
            && state.waypointIdx + 1 < state.waypoints.length
          ) {
            teleportTarget = state.waypoints[state.waypointIdx + 1];
          }
          if (!teleportTarget) {
            const anchor = engagementCenter || movementTarget;
            if (anchor) {
              const offsetAngle = Math.random() * Math.PI * 2;
              const offsetRadius = 80 + Math.random() * 45;
              teleportTarget = {
                x: anchor.x + Math.cos(offsetAngle) * offsetRadius,
                y: anchor.y || 0,
                z: anchor.z + Math.sin(offsetAngle) * offsetRadius
              };
            }
          }
          if (teleportTarget) {
            if (!isTerrainReadyAt(systems, teleportTarget.x, teleportTarget.z)) return;
            const nextPos = playerPos.clone();
            nextPos.x = Number(teleportTarget.x);
            nextPos.z = Number(teleportTarget.z);
            const height = systems.terrainSystem && systems.terrainSystem.getHeightAt
              ? systems.terrainSystem.getHeightAt(nextPos.x, nextPos.z)
              : undefined;
            if (Number.isFinite(height)) nextPos.y = Number(height) + 2;
            if (setHarnessPlayerPosition(systems, nextPos, 'harness.recovery.stuck')) {
              state.stuckMs = 0;
              state.stuckRecoveryMode = false;
              state.stuckTeleportCount++;
              state.waypoints = null;
              state.lastWaypointReplanAt = 0;
              return;
            }
          }
        }

        const now = Date.now();
        const shouldStayOnCapturePoint = !(
          opts.mode === 'open_frontier'
          && !state.hasFired
          && (!nearestOpfor || nearestDist > 140)
        );
        if (captureFocus && captureFocus.hold && captureFocus.inside && shouldStayOnCapturePoint) {
          setMovementState('hold', { force: true });
          return;
        }

        if (now < state.firingUntil && state.targetVisible) {
          setMovementState('hold', { force: true });
          return;
        }
        if (now - state.lastMovementDecisionAt >= modeProfile.decisionIntervalMs) {
          state.lastMovementDecisionAt = now;

          // Layer 2 — gradient probe. Deflected headings translate to WASD keys
          // RELATIVE to the camera forward so the camera stays aimed at the target
          // (fire loop can still land shots) while the player strafes around.
          const cameraController = systems.playerController ? systems.playerController.cameraController : null;
          const cameraYaw = cameraController
            ? Number(cameraController.yaw || 0)
            : Number(camera.rotation.y || 0);
          const heading = chooseTerrainHeading(systems, playerPos, steeringTarget, modeProfile.maxGradient);
          if (heading && heading.deflected) {
            state.gradientProbeDeflections++;
            // Bucket |rel angle| into 5 WASD patterns (W/W+strafe/strafe/S+strafe/S).
            let rel = heading.yaw - cameraYaw;
            while (rel > Math.PI) rel -= Math.PI * 2;
            while (rel < -Math.PI) rel += Math.PI * 2;
            const absRel = Math.abs(rel);
            const side = rel >= 0 ? 'KeyD' : 'KeyA';
            const DEG_30 = Math.PI / 6;
            const DEG_60 = Math.PI / 3;
            const DEG_120 = 2 * Math.PI / 3;
            const DEG_150 = 5 * Math.PI / 6;
            let pattern;
            if (absRel < DEG_30) pattern = ['KeyW'];
            else if (absRel < DEG_60) pattern = ['KeyW', side];
            else if (absRel < DEG_120) pattern = [side];
            else if (absRel < DEG_150) pattern = ['KeyS', side];
            else pattern = ['KeyS'];
            setMovementPattern(pattern);
            state.movementTransitions++;
            return;
          } else if (!heading) {
            // No candidate passes the gradient gate. Last-resort 8-way slope probe
            // (the existing behaviour) picks ANY direction under the hard slope cap;
            // if that fails, retreat and let Layer 3 teleport.
            const currentYawDeg = cameraYaw * 180 / Math.PI;
            const forwardSlope = probeTerrainSlope(systems, playerPos, currentYawDeg, 8);
            if (forwardSlope > 35) {
              const clearDir = findClearDirection(systems, playerPos, currentYawDeg);
              if (clearDir !== null && clearDir !== currentYawDeg) {
                // Hard-stuck fallback: rotate camera. Not the normal Layer 2 path.
                const clearRad = clearDir * Math.PI / 180;
                syncCameraAim(camera, cameraController, clearRad, Number(cameraController ? cameraController.pitch || 0 : camera.rotation.x || 0));
                setMovementState('advance');
                return;
              }
              setMovementState('retreat', { force: true });
              return;
            }
          }

          const noNearbyEnemy = !nearestOpfor || nearestDist > (opts.mode === 'open_frontier' ? 140 : 95);
          if (captureFocus && !captureFocus.inside && noNearbyEnemy) {
            setMovementState('sprint');
            return;
          }
          if (captureFocus && !captureFocus.inside) {
            setMovementState(finalDist > modeProfile.sprintDistance ? 'sprint' : 'advance');
            return;
          }
          if (!state.targetVisible && finalDist > 60) {
            setMovementState(finalDist > modeProfile.sprintDistance ? 'sprint' : 'advance');
            return;
          }
          // Coherent movement policy: fewer abrupt transitions, mode-aware ranges.
          if (finalDist > modeProfile.sprintDistance) {
            setMovementState('sprint');
          } else if (finalDist > modeProfile.approachDistance) {
            setMovementState('advance');
          } else if (finalDist < modeProfile.retreatDistance && state.targetVisible) {
            setMovementState('retreat');
          } else if (state.targetVisible && finalDist < 70 && Math.random() < modeProfile.holdChanceWhenVisible) {
            setMovementState('hold');
          } else if (modeProfile.preferredJuke === 'push' && Math.random() < 0.3) {
            setMovementState('advance');
          } else {
            setMovementState('strafe');
          }
        }
        // Silence unused-var linter: `dist` is kept for telemetry/debug but the
        // primary distance used downstream is finalDist.
        void dist;
      }
    }

    function stop() {
      releaseAllKeys();
      mouseUp();
      if (state.fireTimer) clearInterval(state.fireTimer);
      if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
      return {
        respawnCount: state.respawnCount,
        ammoRefillCount: state.ammoRefillCount,
        healthTopUpCount: state.healthTopUpCount,
        frontlineCompressed: state.frontlineCompressed,
        frontlineDistance: state.frontlineDistance,
        frontlineMoveCount: state.frontlineMoveCount,
        capturedZoneCount: state.capturedZoneCount,
        movementTransitions: state.movementTransitions,
        // perf-harness-redesign surfaces — read by capture-side per-mode validators.
        losRejectedShots: state.losRejectedShots,
        stuckTeleportCount: state.stuckTeleportCount,
        maxStuckSeconds: Math.max(0, Math.round(state.maxStuckMs / 100) / 10),
        gradientProbeDeflections: state.gradientProbeDeflections,
        waypointsFollowedCount: state.waypointsFollowedCount,
        waypointReplanFailures: state.waypointReplanFailures
      };
    }

    function updateFireProbe(data) {
      state.lastFireProbe = Object.assign({
        at: Date.now(),
        reason: 'unknown',
        shotsFired: false
      }, data || {});
    }

    function getDebugSnapshot() {
      return {
        mode: opts.mode,
        terrainProfile: String(modeProfile.terrainProfile || ''),
        maxGradient: Number(modeProfile.maxGradient || 0),
        stuckTimeoutSec: Number(modeProfile.stuckTimeoutSec || 0),
        losRejectedShots: state.losRejectedShots,
        stuckTeleportCount: state.stuckTeleportCount,
        maxStuckSeconds: Math.max(0, Math.round(state.maxStuckMs / 100) / 10),
        gradientProbeDeflections: state.gradientProbeDeflections,
        waypointsFollowedCount: state.waypointsFollowedCount,
        waypointReplanFailures: state.waypointReplanFailures,
        waypointCount: state.waypoints ? state.waypoints.length : 0,
        waypointIdx: state.waypointIdx,
        movementState: state.movementState,
        previousMovementState: state.previousMovementState,
        movementStateSince: state.movementStateSince,
        movementTransitions: state.movementTransitions,
        targetVisible: state.targetVisible,
        lastRepositionAt: state.lastRepositionAt,
        lastShotAt: state.lastShotAt,
        respawnCount: state.respawnCount,
        ammoRefillCount: state.ammoRefillCount,
        healthTopUpCount: state.healthTopUpCount,
        lastFireProbe: state.lastFireProbe
      };
    }

    setMovementState('sprint');

    state.fireTimer = setInterval(function () {
      const systems = getSystems();
      const health = systems && systems.playerHealthSystem;
      if (health && health.isDead && health.isDead()) return;
      const playerPos = systems && systems.playerController && systems.playerController.getPosition
        ? systems.playerController.getPosition()
        : null;
      const camera = systems && systems.playerController && systems.playerController.getCamera
        ? systems.playerController.getCamera()
        : null;
      const nearestOpfor = findNearestOpfor(systems, perceptionRange * perceptionRange);
      if (!playerPos || !camera || !nearestOpfor) {
        updateFireProbe({
          reason: !playerPos || !camera ? 'missing_player_or_camera' : 'missing_target',
          hasPlayer: !!playerPos,
          hasCamera: !!camera,
          hasTarget: !!nearestOpfor
        });
        return;
      }
      const sinceRepositionMs = Date.now() - state.lastRepositionAt;
      if (sinceRepositionMs < 450) {
        updateFireProbe({
          reason: 'reposition_cooldown',
          sinceRepositionMs: sinceRepositionMs,
          targetDistance: Math.hypot(
            nearestOpfor.position.x - playerPos.x,
            nearestOpfor.position.z - playerPos.z
          )
        });
        return;
      }
      syncCameraPosition(camera, systems.playerController.cameraController, playerPos);

      const dx = nearestOpfor.position.x - playerPos.x;
      const dy = (nearestOpfor.position.y || 0) + 1.2 - ((playerPos.y || 0) + 1.6);
      const dz = nearestOpfor.position.z - playerPos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (!Number.isFinite(dist) || dist < 0.001) {
        updateFireProbe({ reason: 'invalid_target_distance', targetDistance: dist });
        return;
      }
      if (dist > Number(modeProfile.maxFireDistance || 0)) {
        updateFireProbe({
          reason: 'target_out_of_range',
          targetDistance: dist,
          maxFireDistance: Number(modeProfile.maxFireDistance || 0)
        });
        return;
      }
      if (opts.mode === 'open_frontier' && dist > 120) {
        updateFireProbe({
          reason: 'target_out_of_effective_range',
          targetDistance: dist,
          maxEffectiveFireDistance: 120
        });
        return;
      }
      const closeRange = dist < (opts.mode === 'open_frontier' ? 95 : 65);
      const eye = {
        x: playerPos.x,
        y: Number(playerPos.y || 0) + 1.6,
        z: playerPos.z
      };
      const targetEye = {
        x: nearestOpfor.position.x,
        y: Number(nearestOpfor.position.y || 0) + 1.2,
        z: nearestOpfor.position.z
      };
      // LOS-aware fire gate (aim-path). Probe the eye-to-target ray for terrain
      // occlusion BEFORE invoking actionFireStart. Counter rises on every rejection
      // so captures can prove the gate engaged during the run.
      const blockedRay = hasTerrainOcclusion(systems, eye, targetEye);
      const blockedHeight = hasHeightProfileOcclusion(systems, eye, targetEye);
      const visibleNow = !(blockedRay || blockedHeight);
      state.targetVisible = visibleNow;
      if (!visibleNow) {
        state.losRejectedShots++;
        updateFireProbe({
          reason: 'target_occluded',
          targetDistance: dist,
          blockedRay: blockedRay,
          blockedHeight: blockedHeight
        });
        return;
      }
      const tx = dx / dist;
      const ty = dy / dist;
      const tz = dz / dist;

      // Pre-shot assist: tighten aim toward center mass just before burst.
      const cameraController = systems.playerController ? systems.playerController.cameraController : null;
      const clampedAimY = clampAimY(playerPos.y, (nearestOpfor.position.y || 0) + 1.25, Math.hypot(dx, dz));
      camera.rotation.order = 'YXZ';
      camera.lookAt(nearestOpfor.position.x, clampedAimY, nearestOpfor.position.z);
      syncCameraAim(
        camera,
        cameraController,
        Number(camera.rotation.y || 0),
        Number(camera.rotation.x || 0)
      );

      const shotRay = getPlayerShotRay(systems, camera);
      const shotAnalysis = analyzePlayerShot(systems, shotRay);
      const cameraDelta = Math.hypot(
        Number(camera.position.x || 0) - Number(playerPos.x || 0),
        Number(camera.position.y || 0) - Number(playerPos.y || 0),
        Number(camera.position.z || 0) - Number(playerPos.z || 0)
      );
      const rayOriginDelta = shotRay ? Math.hypot(
        Number(shotRay.origin.x || 0) - Number(playerPos.x || 0),
        Number(shotRay.origin.y || 0) - Number(playerPos.y || 0),
        Number(shotRay.origin.z || 0) - Number(playerPos.z || 0)
      ) : Number.NaN;
      const allowSpeculativeFire =
        opts.mode === 'open_frontier'
        && visibleNow
        && shotAnalysis.reason === 'no_combatant_hit'
        && dist <= 90;
      if (!shotAnalysis.landable) {
        if (allowSpeculativeFire) {
          setMovementState('hold', { force: true });
        } else {
        if (shotAnalysis.reason === 'terrain_block' || shotAnalysis.reason === 'height_profile_block') {
          state.losRejectedShots++;
        }
        updateFireProbe({
          reason: 'shot_blocked',
          shotBlockReason: shotAnalysis.reason,
          targetDistance: dist,
          cameraDelta: cameraDelta,
          rayOriginDelta: rayOriginDelta,
          shotOrigin: shotRay ? {
            x: Number(shotRay.origin.x || 0),
            y: Number(shotRay.origin.y || 0),
            z: Number(shotRay.origin.z || 0)
          } : null,
          targetId: String(nearestOpfor.id || ''),
          hit: shotAnalysis.hit ? {
            combatantId: String(shotAnalysis.hit.combatant && shotAnalysis.hit.combatant.id || ''),
            distance: Number(shotAnalysis.hit.distance || 0)
          } : null,
          terrainHit: shotAnalysis.terrainHit ? {
            distance: Number(shotAnalysis.terrainHit.distance || 0),
            hit: !!shotAnalysis.terrainHit.hit
          } : null
        });
        return;
        }
      }

      const forward = shotRay ? shotRay.direction : getCameraForward(camera);
      // Route aim-dot + vertical-angle decision through the pure helper so the
      // A4-class regression test (scripts/perf-harness/perf-active-driver.test.js)
      // exercises the same logic the browser does.
      const fireDecision = evaluateFireDecision({
        cameraForward: { x: forward.x, y: forward.y, z: forward.z },
        toTarget: { x: tx, y: ty, z: tz },
        aimDotThreshold: 0.8,
        verticalThreshold: 0.45,
        closeRange: closeRange
      });
      const aimDot = fireDecision.aimDot;
      const verticalComponent = fireDecision.verticalComponent;
      if (!fireDecision.shouldFire) {
        updateFireProbe({
          reason: fireDecision.reason,
          targetDistance: dist,
          aimDot: aimDot,
          verticalComponent: verticalComponent,
          closeRange: closeRange,
          cameraDelta: cameraDelta,
          rayOriginDelta: rayOriginDelta,
          targetId: String(nearestOpfor.id || '')
        });
        return;
      }

      if (dist < 110) {
        setMovementState('hold', { force: true });
      }

      mouseDown();
      state.lastShotAt = Date.now();
      state.hasFired = true;
      updateFireProbe({
        reason: allowSpeculativeFire ? 'speculative_fire' : 'firing',
        shotsFired: true,
        targetDistance: dist,
        aimDot: aimDot,
        cameraDelta: cameraDelta,
        rayOriginDelta: rayOriginDelta,
        targetId: String(nearestOpfor.id || '')
      });
      const holdMs = 260 + Math.floor(Math.random() * 220);
      state.firingUntil = Date.now() + holdMs + 120;
      setTimeout(function () {
        mouseUp();
      }, holdMs);
    }, 700);

    state.heartbeatTimer = setInterval(function () {
      keepPlayerInAction();
    }, 250);

    keepPlayerInAction();

    return {
      stop: stop,
      getDebugSnapshot: getDebugSnapshot,
      movementPatternCount: 3,
      compressFrontline: enableFrontlineCompression,
      mode: opts.mode,
      allowWarpRecovery: opts.allowWarpRecovery,
      topUpHealth: opts.topUpHealth,
      autoRespawn: opts.autoRespawn
    };
  }

  if (globalWindow) {
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
          autoRespawn: driver.autoRespawn !== false
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
      }
    };
  }

  // Expose pure helpers for Node-side regression tests (scripts/perf-harness/*).
  // Browser scripts ignore the module.exports branch.
  if (typeof module !== 'undefined' && module && module.exports) {
    module.exports = {
      evaluateFireDecision: evaluateFireDecision,
      chooseHeadingByGradient: chooseHeadingByGradient
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
