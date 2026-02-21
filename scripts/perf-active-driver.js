(function () {
  const globalWindow = window;

  function keyToLabel(code) {
    if (code.startsWith('Key')) return code.slice(3).toLowerCase();
    if (code.startsWith('Digit')) return code.slice(5);
    return code.toLowerCase();
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
    const modeProfiles = {
      ai_sandbox: {
        sprintDistance: 200,
        approachDistance: 120,
        retreatDistance: 18,
        holdChanceWhenVisible: 0.06,
        transitionHoldMs: 900,
        decisionIntervalMs: Math.max(420, opts.movementDecisionIntervalMs),
        preferredJuke: 'push',
        objectiveBias: 'frontline'
      },
      open_frontier: {
        sprintDistance: 360,
        approachDistance: 185,
        retreatDistance: 16,
        holdChanceWhenVisible: 0.02,
        transitionHoldMs: 900,
        decisionIntervalMs: Math.max(380, opts.movementDecisionIntervalMs),
        preferredJuke: 'strafe',
        objectiveBias: 'zone'
      },
      a_shau_valley: {
        sprintDistance: 320,
        approachDistance: 150,
        retreatDistance: 18,
        holdChanceWhenVisible: 0.01,
        transitionHoldMs: 850,
        decisionIntervalMs: Math.max(360, opts.movementDecisionIntervalMs),
        preferredJuke: 'push',
        objectiveBias: 'enemy_mass'
      },
      zone_control: {
        sprintDistance: 220,
        approachDistance: 110,
        retreatDistance: 16,
        holdChanceWhenVisible: 0.05,
        transitionHoldMs: 950,
        decisionIntervalMs: Math.max(480, opts.movementDecisionIntervalMs),
        preferredJuke: 'push',
        objectiveBias: 'zone'
      },
      team_deathmatch: {
        sprintDistance: 175,
        approachDistance: 90,
        retreatDistance: 12,
        holdChanceWhenVisible: 0.08,
        transitionHoldMs: 700,
        decisionIntervalMs: Math.max(360, opts.movementDecisionIntervalMs),
        preferredJuke: 'push',
        objectiveBias: 'enemy_mass'
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
      enemySpawn: null,
      frontlineCompressed: false,
      frontlineDistance: 0,
      frontlineMoveCount: 0,
      targetVisible: false,
      lastMovementDecisionAt: 0,
      movementLockUntil: 0,
      movementState: 'advance',
      firingUntil: 0,
      lastStablePos: null,
      stuckMs: 0,
      objectiveZoneId: null,
      objectiveSwitchAt: 0,
      captureZoneId: null,
      captureHoldUntil: 0,
      capturedZoneCount: 0,
      lastShotAt: Date.now()
    };
    const MAX_YAW_STEP = 0.09;
    const MAX_PITCH_STEP = 0.06;
    const MAX_AIM_VERTICAL_DELTA = 4.5;
    const FORCE_CONTACT_REINSERT_MS = opts.mode === 'a_shau_valley' ? 15000 : 22000;
    const FORCE_CONTACT_REINSERT_COOLDOWN_MS = opts.mode === 'a_shau_valley' ? 20000 : 32000;
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

    function setMovementState(nextState) {
      const now = Date.now();
      if (state.movementState === nextState && now < state.movementLockUntil) {
        return;
      }
      state.movementState = nextState;
      state.movementLockUntil = now + modeProfile.transitionHoldMs + Math.floor(Math.random() * 360);

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

    function mouseDown() {
      if (state.firingHeld) return;
      state.firingHeld = true;
      globalWindow.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: globalWindow.innerWidth / 2,
        clientY: globalWindow.innerHeight / 2
      }));
    }

    function mouseUp() {
      if (!state.firingHeld) return;
      state.firingHeld = false;
      globalWindow.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 0,
        clientX: globalWindow.innerWidth / 2,
        clientY: globalWindow.innerHeight / 2
      }));
    }

    function getSystems() {
      return globalWindow.__engine && globalWindow.__engine.systemManager;
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
          if (zone && zone.isHomeBase && zone.owner === 'OPFOR' && zone.position) {
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
        if (combatant.faction !== 'OPFOR') continue;
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
        if (zone && zone.isHomeBase && zone.owner === 'US' && zone.position) {
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
        if (combatant.faction !== 'OPFOR') continue;
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
      const chunkManager = systems && systems.chunkManager;
      if (!chunkManager || !chunkManager.raycastTerrain || !fromPos || !toPos) return false;

      const dx = toPos.x - fromPos.x;
      const dy = (toPos.y || 0) - (fromPos.y || 0);
      const dz = toPos.z - fromPos.z;
      const distance = Math.hypot(dx, dy, dz);
      if (!Number.isFinite(distance) || distance < 0.001) return false;

      const dir = { x: dx / distance, y: dy / distance, z: dz / distance };
      const hit = chunkManager.raycastTerrain(fromPos, dir, distance);
      return !!(hit && hit.hit && Number.isFinite(hit.distance) && hit.distance < distance - 0.75);
    }

    function hasHeightProfileOcclusion(systems, fromPos, toPos) {
      const chunkManager = systems && systems.chunkManager;
      if (!chunkManager || !fromPos || !toPos) return false;
      const getHeight =
        chunkManager.getTerrainHeightAt ||
        chunkManager.getHeightAtWorldPosition ||
        chunkManager.getHeightAt;
      if (!getHeight) return false;

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
        const terrainY = Number(getHeight.call(chunkManager, sx, sz));
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

    function clampAimY(playerY, desiredY) {
      const py = Number(playerY || 0);
      const dy = Number(desiredY || py);
      return Math.max(py - MAX_AIM_VERTICAL_DELTA, Math.min(py + MAX_AIM_VERTICAL_DELTA, dy));
    }

    function isTerrainReadyAt(systems, x, z) {
      if (!systems || !systems.chunkManager) return false;
      const cm = systems.chunkManager;
      if (!cm.isChunkLoaded || !cm.getChunkSize) return false;
      const chunkSize = Number(cm.getChunkSize());
      if (!Number.isFinite(chunkSize) || chunkSize <= 0) return false;

      const cx = Math.floor(Number(x) / chunkSize);
      const cz = Math.floor(Number(z) / chunkSize);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!cm.isChunkLoaded(cx + dx, cz + dz)) {
            return false;
          }
        }
      }
      return true;
    }

    function groundPlayerIfNeeded(systems, playerPos) {
      if (!systems || !systems.playerController || !systems.playerController.setPosition || !playerPos) return;
      if (systems.playerController.isInHelicopter && systems.playerController.isInHelicopter()) return;
      const chunkManager = systems.chunkManager;
      if (!chunkManager || !chunkManager.getHeightAtWorldPosition) return;
      if (!isTerrainReadyAt(systems, playerPos.x, playerPos.z)) return;
      const ground = Number(chunkManager.getHeightAtWorldPosition(Number(playerPos.x), Number(playerPos.z)));
      if (!Number.isFinite(ground)) return;
      const targetY = ground + 2;
      const currentY = Number(playerPos.y || 0);
      // Snap only when clearly off-ground to prevent jitter.
      if (Math.abs(currentY - targetY) < 3.5) return;
      const corrected = playerPos.clone ? playerPos.clone() : { x: Number(playerPos.x), y: currentY, z: Number(playerPos.z) };
      corrected.y = targetY;
      systems.playerController.setPosition(corrected, 'harness.ground_lock');
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
        if (combatant.faction === 'US') {
          usX += Number(combatant.position.x);
          usY += Number(combatant.position.y);
          usZ += Number(combatant.position.z);
          usCount++;
        } else if (combatant.faction === 'OPFOR') {
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
        if (combatant.faction === 'US') {
          usX += Number(combatant.position.x);
          usY += Number(combatant.position.y);
          usZ += Number(combatant.position.z);
          usCount++;
        } else if (combatant.faction === 'OPFOR') {
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
        const isOwnedByUs = zone.owner === 'US';
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

        if (activeZone.owner === 'US' && !activeZone.isHomeBase) {
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
        if (zone.owner === 'US' && zone.state !== 'contested') continue;
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
        if (combatant.faction !== 'OPFOR') continue;
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
      const us = alive.filter((combatant) => combatant.faction === 'US');
      const opfor = alive.filter((combatant) => combatant.faction === 'OPFOR');
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
          const height = systems.chunkManager && systems.chunkManager.getHeightAtWorldPosition
            ? systems.chunkManager.getHeightAtWorldPosition(nextX, nextZ)
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

    function keepPlayerInAction() {
      const systems = getSystems();
      if (!systems) return;

      const health = systems.playerHealthSystem;
      if (opts.topUpHealth && health && health.getHealth && health.getMaxHealth && health.isDead && !health.isDead()) {
        const hp = Number(health.getHealth());
        const maxHp = Number(health.getMaxHealth());
        if (Number.isFinite(hp) && Number.isFinite(maxHp) && hp < Math.max(45, maxHp * 0.35)) {
          if (health.playerState) {
            health.playerState.health = maxHp;
          }
          if (health.applySpawnProtection) {
            health.applySpawnProtection(1.0);
          }
        }
      }

      if (opts.autoRespawn && health && health.isDead && health.isDead()) {
        releaseAllKeys();
        mouseUp();
        if (systems.playerRespawnManager && systems.playerRespawnManager.cancelPendingRespawn) {
          systems.playerRespawnManager.cancelPendingRespawn();
        }
        if (systems.playerRespawnManager && systems.playerRespawnManager.respawnAtBase) {
          systems.playerRespawnManager.respawnAtBase();
        }
        if (opts.allowWarpRecovery) {
          const pressureSpawn = getPressureSpawnPoint(systems);
          if (pressureSpawn && systems.playerController && systems.playerController.setPosition) {
            if (!isTerrainReadyAt(systems, pressureSpawn.x, pressureSpawn.z)) {
              state.respawnCount++;
              return;
            }
            const currentPos = systems.playerController.getPosition ? systems.playerController.getPosition() : null;
            const nextPos = currentPos && currentPos.clone ? currentPos.clone() : { x: 0, y: pressureSpawn.y, z: 0 };
            nextPos.x = pressureSpawn.x;
            nextPos.z = pressureSpawn.z;
            nextPos.y = pressureSpawn.y;
            const height = systems.chunkManager && systems.chunkManager.getHeightAtWorldPosition
              ? systems.chunkManager.getHeightAtWorldPosition(nextPos.x, nextPos.z)
              : undefined;
            if (Number.isFinite(height)) nextPos.y = Number(height) + 2;
            systems.playerController.setPosition(nextPos, 'harness.recovery.respawn');
          }
        }
        state.respawnCount++;
      }

      if (systems.playerController && systems.playerController.isInHelicopter && systems.playerController.isInHelicopter()) {
        const position = systems.playerController.getPosition ? systems.playerController.getPosition() : null;
        if (position && position.clone) {
          const exitPos = position.clone();
          const height = systems.chunkManager && systems.chunkManager.getHeightAtWorldPosition
            ? systems.chunkManager.getHeightAtWorldPosition(exitPos.x, exitPos.z)
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
      groundPlayerIfNeeded(systems, playerPos);

      const enemySpawn = getEnemySpawn(systems);
      const pressureSpawn = getPressureSpawnPoint(systems);
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
          const h = systems.chunkManager && systems.chunkManager.getHeightAtWorldPosition
            ? systems.chunkManager.getHeightAtWorldPosition(insertPos.x, insertPos.z)
            : undefined;
          if (Number.isFinite(h)) insertPos.y = Number(h) + 2;
          if (systems.playerController && systems.playerController.setPosition) {
            systems.playerController.setPosition(insertPos, 'harness.recovery.pressure');
          }
        }
      }
      const engagementCenter = getEngagementCenter(systems) || enemySpawn;
      const nearestOpfor = findNearestOpfor(systems, perceptionRange * perceptionRange);
      const predictedTarget = nearestOpfor ? predictTargetPoint(nearestOpfor, playerPos) : null;
      const target = predictedTarget || nearestOpfor?.position || getModeObjective(systems, playerPos) || engagementCenter;
      state.targetVisible = false;

      if (target) {
        const cameraController = systems.playerController ? systems.playerController.cameraController : null;
        const prevYaw = cameraController ? Number(cameraController.yaw || 0) : Number(camera.rotation.y || 0);
        const prevPitch = cameraController ? Number(cameraController.pitch || 0) : Number(camera.rotation.x || 0);

        const aimY = clampAimY(playerPos.y, (target.y || 0) + 1.2);
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

        camera.rotation.y = nextYaw;
        camera.rotation.x = nextPitch;
        if (cameraController) {
          cameraController.yaw = nextYaw;
          cameraController.pitch = nextPitch;
        }

        if (nearestOpfor) {
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
          const blockedRay = hasTerrainOcclusion(systems, eye, targetEye);
          const blockedHeight = hasHeightProfileOcclusion(systems, eye, targetEye);
          state.targetVisible = !(blockedRay || blockedHeight);
        }
      }

      const captureFocus = getCaptureFocus(systems, playerPos);
      const shouldBiasCombat = opts.mode === 'open_frontier'
        && (state.capturedZoneCount > 0 || (Date.now() - state.lastShotAt) > 25000);
      const combatTarget = getEnemyMassPoint(systems) || getLeadChargePoint(systems) || engagementCenter;
      const objectiveTarget = shouldBiasCombat
        ? (combatTarget || captureFocus?.target || getModeObjective(systems, playerPos) || engagementCenter)
        : (captureFocus?.target || getModeObjective(systems, playerPos) || engagementCenter);
      const nearestDist = nearestOpfor
        ? Math.hypot(nearestOpfor.position.x - playerPos.x, nearestOpfor.position.z - playerPos.z)
        : Number.POSITIVE_INFINITY;
      const nearestPredicted = nearestOpfor ? predictTargetPoint(nearestOpfor, playerPos) : null;
      const predictedLockDistance = opts.mode === 'open_frontier' ? 170 : opts.mode === 'team_deathmatch' ? 125 : 95;
      const movementTarget = (nearestPredicted && nearestDist < predictedLockDistance) ? nearestPredicted : objectiveTarget;

      const nowMs = Date.now();
      const noContactTooLong = (nowMs - state.lastShotAt) > FORCE_CONTACT_REINSERT_MS;
      const farFromFight = !nearestOpfor || nearestDist > (opts.mode === 'a_shau_valley' ? 320 : 260);
      if (farFromFight && noContactTooLong && (nowMs - lastForcedContactInsertAt) > FORCE_CONTACT_REINSERT_COOLDOWN_MS) {
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
          const h = systems.chunkManager && systems.chunkManager.getHeightAtWorldPosition
            ? systems.chunkManager.getHeightAtWorldPosition(nextPos.x, nextPos.z)
            : undefined;
          if (Number.isFinite(h)) nextPos.y = Number(h) + 2;
          systems.playerController.setPosition(nextPos, 'harness.recovery.contact_insert');
          lastForcedContactInsertAt = nowMs;
          state.stuckMs = 0;
        }
      }

      if (movementTarget) {
        const dx = movementTarget.x - playerPos.x;
        const dz = movementTarget.z - playerPos.z;
        const dist = Math.hypot(dx, dz);
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

        if ((dist > 400 || playerPos.y > 140) && opts.allowWarpRecovery && state.stuckMs > 10000) {
          const anchor = engagementCenter || movementTarget;
          if (anchor) {
            const offsetAngle = Math.random() * Math.PI * 2;
            const offsetRadius = 80 + Math.random() * 45;
            const nextX = anchor.x + Math.cos(offsetAngle) * offsetRadius;
            const nextZ = anchor.z + Math.sin(offsetAngle) * offsetRadius;
            if (!isTerrainReadyAt(systems, nextX, nextZ)) {
              return;
            }
            const nextPos = playerPos.clone();
            nextPos.x = nextX;
            nextPos.z = nextZ;
            const height = systems.chunkManager && systems.chunkManager.getHeightAtWorldPosition
              ? systems.chunkManager.getHeightAtWorldPosition(nextX, nextZ)
              : undefined;
            if (Number.isFinite(height)) {
              nextPos.y = Number(height) + 2;
            }
            if (systems.playerController && systems.playerController.setPosition) {
              systems.playerController.setPosition(nextPos, 'harness.recovery.stuck');
            }
            state.stuckMs = 0;
          }
        }

        const now = Date.now();
        if (captureFocus && captureFocus.hold && captureFocus.inside) {
          setMovementState('hold');
          return;
        }

        if (now < state.firingUntil && state.targetVisible) {
          setMovementState('hold');
          return;
        }
        if (now - state.lastMovementDecisionAt >= modeProfile.decisionIntervalMs) {
          state.lastMovementDecisionAt = now;
          const noNearbyEnemy = !nearestOpfor || nearestDist > (opts.mode === 'open_frontier' ? 140 : 95);
          if (captureFocus && !captureFocus.inside && noNearbyEnemy) {
            setMovementState('sprint');
            return;
          }
          if (captureFocus && !captureFocus.inside) {
            setMovementState(dist > modeProfile.sprintDistance ? 'sprint' : 'advance');
            return;
          }
          if (!state.targetVisible && dist > 60) {
            setMovementState(dist > modeProfile.sprintDistance ? 'sprint' : 'advance');
            return;
          }
          // Coherent movement policy: fewer abrupt transitions, mode-aware ranges.
          if (dist > modeProfile.sprintDistance) {
            setMovementState('sprint');
          } else if (dist > modeProfile.approachDistance) {
            setMovementState('advance');
          } else if (dist < modeProfile.retreatDistance && state.targetVisible) {
            setMovementState('retreat');
          } else if (state.targetVisible && dist < 70 && Math.random() < modeProfile.holdChanceWhenVisible) {
            setMovementState('hold');
          } else if (modeProfile.preferredJuke === 'push' && Math.random() < 0.3) {
            setMovementState('advance');
          } else {
            setMovementState('strafe');
          }
        }
      }
    }

    function stop() {
      releaseAllKeys();
      mouseUp();
      if (state.fireTimer) clearInterval(state.fireTimer);
      if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
      return {
        respawnCount: state.respawnCount,
        frontlineCompressed: state.frontlineCompressed,
        frontlineDistance: state.frontlineDistance,
        frontlineMoveCount: state.frontlineMoveCount,
        capturedZoneCount: state.capturedZoneCount
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
      if (!playerPos || !camera || !nearestOpfor) return;

      const dx = nearestOpfor.position.x - playerPos.x;
      const dy = (nearestOpfor.position.y || 0) + 1.2 - ((playerPos.y || 0) + 1.6);
      const dz = nearestOpfor.position.z - playerPos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (!Number.isFinite(dist) || dist < 0.001) return;
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
      const blockedRay = hasTerrainOcclusion(systems, eye, targetEye);
      const blockedHeight = hasHeightProfileOcclusion(systems, eye, targetEye);
      const visibleNow = !(blockedRay || blockedHeight);
      state.targetVisible = visibleNow;
      if (!visibleNow) return;
      const tx = dx / dist;
      const ty = dy / dist;
      const tz = dz / dist;

      // Pre-shot assist: tighten aim toward center mass just before burst.
      const cameraController = systems.playerController ? systems.playerController.cameraController : null;
      const prevYaw = cameraController ? Number(cameraController.yaw || 0) : Number(camera.rotation.y || 0);
      const prevPitch = cameraController ? Number(cameraController.pitch || 0) : Number(camera.rotation.x || 0);
      const clampedAimY = clampAimY(playerPos.y, (nearestOpfor.position.y || 0) + 1.25);
      camera.lookAt(nearestOpfor.position.x, clampedAimY, nearestOpfor.position.z);
      const desiredYaw = Number(camera.rotation.y || 0);
      const desiredPitch = Number(camera.rotation.x || 0);
      let yawDelta = desiredYaw - prevYaw;
      while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
      while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
      const pitchDelta = desiredPitch - prevPitch;
      const assistYaw = Math.max(-0.24, Math.min(0.24, yawDelta));
      const assistPitch = Math.max(-0.16, Math.min(0.16, pitchDelta));
      const nextYaw = prevYaw + assistYaw;
      const nextPitch = prevPitch + assistPitch;
      camera.rotation.y = nextYaw;
      camera.rotation.x = nextPitch;
      if (cameraController) {
        cameraController.yaw = nextYaw;
        cameraController.pitch = nextPitch;
      }

      const forward = getCameraForward(camera);
      const aimDot = forward.x * tx + forward.y * ty + forward.z * tz;
      const verticalComponent = Math.abs(ty);
      if (aimDot < 0.8) return;
      if (verticalComponent > 0.45 && !closeRange) return;

      if (dist < 110) {
        setMovementState('hold');
      }

      mouseDown();
      state.lastShotAt = Date.now();
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
      movementPatternCount: 3,
      compressFrontline: enableFrontlineCompression,
      mode: opts.mode,
      allowWarpRecovery: opts.allowWarpRecovery,
      topUpHealth: opts.topUpHealth,
      autoRespawn: opts.autoRespawn
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
    }
  };
})();
