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
      movementDecisionIntervalMs: Number(options.movementDecisionIntervalMs || 450)
    };
    const modeProfile = opts.mode === 'open_frontier'
      ? {
          sprintDistance: 260,
          approachDistance: 120,
          retreatDistance: 26,
          holdChanceWhenVisible: 0.35,
          transitionHoldMs: 1000,
          decisionIntervalMs: Math.max(620, opts.movementDecisionIntervalMs),
          preferredJuke: 'strafe'
        }
      : {
          sprintDistance: 200,
          approachDistance: 120,
          retreatDistance: 30,
          holdChanceWhenVisible: 0.6,
          transitionHoldMs: 720,
          decisionIntervalMs: Math.max(420, opts.movementDecisionIntervalMs),
          preferredJuke: 'push'
        };

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
      lastStablePos: null,
      stuckMs: 0
    };
    const MAX_YAW_STEP = 0.08;
    const MAX_PITCH_STEP = 0.05;

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
      state.movementLockUntil = now + modeProfile.transitionHoldMs + Math.floor(Math.random() * 240);

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
      const ownSideBias = -18;
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

    function getModeObjective(systems, playerPos) {
      if (opts.mode !== 'open_frontier') {
        return getEngagementCenter(systems) || getEnemySpawn(systems);
      }

      const zoneManager = systems && systems.zoneManager;
      const zones = zoneManager && zoneManager.getAllZones ? zoneManager.getAllZones() : null;
      if (!Array.isArray(zones) || zones.length === 0) {
        return getEngagementCenter(systems) || getEnemySpawn(systems);
      }

      let bestZone = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        if (!zone || zone.isHomeBase) continue;
        // Prioritize contested and non-US-owned zones.
        const priority = zone.state === 'contested' ? 0 : zone.owner === 'US' ? 2 : 1;
        const dx = Number(zone.position.x) - Number(playerPos.x);
        const dz = Number(zone.position.z) - Number(playerPos.z);
        const distSq = dx * dx + dz * dz;
        const score = priority * 500000 + distSq;
        if (score < bestScore) {
          bestScore = score;
          bestZone = zone;
        }
      }

      if (bestZone && bestZone.position) {
        return {
          x: Number(bestZone.position.x),
          y: Number(bestZone.position.y || 0),
          z: Number(bestZone.position.z)
        };
      }
      return getEngagementCenter(systems) || getEnemySpawn(systems);
    }

    function compressFrontline(systems) {
      if (!opts.compressFrontline || state.frontlineCompressed) return;
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
      if (health && health.getHealth && health.getMaxHealth && health.isDead && !health.isDead()) {
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

      if (health && health.isDead && health.isDead()) {
        releaseAllKeys();
        mouseUp();
        if (systems.playerRespawnManager && systems.playerRespawnManager.cancelPendingRespawn) {
          systems.playerRespawnManager.cancelPendingRespawn();
        }
        if (systems.playerRespawnManager && systems.playerRespawnManager.respawnAtBase) {
          systems.playerRespawnManager.respawnAtBase();
        }
        const pressureSpawn = getPressureSpawnPoint(systems);
        if (pressureSpawn && systems.playerController && systems.playerController.setPosition) {
          const currentPos = systems.playerController.getPosition ? systems.playerController.getPosition() : null;
          const nextPos = currentPos && currentPos.clone ? currentPos.clone() : { x: 0, y: pressureSpawn.y, z: 0 };
          nextPos.x = pressureSpawn.x;
          nextPos.z = pressureSpawn.z;
          nextPos.y = pressureSpawn.y;
          const height = systems.chunkManager && systems.chunkManager.getHeightAtWorldPosition
            ? systems.chunkManager.getHeightAtWorldPosition(nextPos.x, nextPos.z)
            : undefined;
          if (Number.isFinite(height)) nextPos.y = Number(height) + 2;
          systems.playerController.setPosition(nextPos);
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

      const enemySpawn = getEnemySpawn(systems);
      const pressureSpawn = getPressureSpawnPoint(systems);
      if (pressureSpawn) {
        const distToPressure = Math.hypot(pressureSpawn.x - playerPos.x, pressureSpawn.z - playerPos.z);
        if (distToPressure > 260 && opts.allowWarpRecovery) {
          const insertPos = playerPos.clone();
          insertPos.x = pressureSpawn.x;
          insertPos.z = pressureSpawn.z;
          const h = systems.chunkManager && systems.chunkManager.getHeightAtWorldPosition
            ? systems.chunkManager.getHeightAtWorldPosition(insertPos.x, insertPos.z)
            : undefined;
          if (Number.isFinite(h)) insertPos.y = Number(h) + 2;
          if (systems.playerController && systems.playerController.setPosition) {
            systems.playerController.setPosition(insertPos);
          }
        }
      }
      const engagementCenter = getEngagementCenter(systems) || enemySpawn;
      const nearestOpfor = findNearestOpfor(systems, 200 * 200);
      const target = nearestOpfor
        ? nearestOpfor.position
        : getModeObjective(systems, playerPos) || engagementCenter;
      state.targetVisible = false;

      if (target) {
        const cameraController = systems.playerController ? systems.playerController.cameraController : null;
        const prevYaw = cameraController ? Number(cameraController.yaw || 0) : Number(camera.rotation.y || 0);
        const prevPitch = cameraController ? Number(cameraController.pitch || 0) : Number(camera.rotation.x || 0);

        camera.lookAt(target.x, (target.y || 0) + 1.2, target.z);
        const desiredYaw = Number(camera.rotation.y || 0);
        const desiredPitch = Number(camera.rotation.x || 0);
        let yawDelta = desiredYaw - prevYaw;
        while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
        while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
        const pitchDelta = desiredPitch - prevPitch;

        const nextYaw = prevYaw + Math.max(-MAX_YAW_STEP, Math.min(MAX_YAW_STEP, yawDelta));
        const nextPitch = prevPitch + Math.max(-MAX_PITCH_STEP, Math.min(MAX_PITCH_STEP, pitchDelta));

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
          const blocked = hasTerrainOcclusion(systems, eye, targetEye);
          state.targetVisible = !blocked;
        }
      }

      const movementTarget = nearestOpfor ? nearestOpfor.position : (getModeObjective(systems, playerPos) || engagementCenter);
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
              systems.playerController.setPosition(nextPos);
            }
            state.stuckMs = 0;
          }
        }

        const now = Date.now();
        if (now - state.lastMovementDecisionAt >= modeProfile.decisionIntervalMs) {
          state.lastMovementDecisionAt = now;
          // Coherent movement policy: fewer abrupt transitions, mode-aware ranges.
          if (dist > modeProfile.sprintDistance) {
            setMovementState('sprint');
          } else if (dist > modeProfile.approachDistance) {
            setMovementState('advance');
          } else if (dist < modeProfile.retreatDistance && state.targetVisible) {
            setMovementState('retreat');
          } else if (state.targetVisible && Math.random() < modeProfile.holdChanceWhenVisible) {
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
        frontlineMoveCount: state.frontlineMoveCount
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
      const nearestOpfor = findNearestOpfor(systems, 180 * 180);
      if (!playerPos || !camera || !nearestOpfor) return;

      const dx = nearestOpfor.position.x - playerPos.x;
      const dy = (nearestOpfor.position.y || 0) + 1.2 - ((playerPos.y || 0) + 1.6);
      const dz = nearestOpfor.position.z - playerPos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (!Number.isFinite(dist) || dist < 0.001) return;
      const closeRange = dist < 45;
      if (!state.targetVisible && !closeRange) return;
      const tx = dx / dist;
      const ty = dy / dist;
      const tz = dz / dist;

      const forward = getCameraForward(camera);
      const aimDot = forward.x * tx + forward.y * ty + forward.z * tz;
      if (aimDot < 0.82) return;

      mouseDown();
      const holdMs = 220 + Math.floor(Math.random() * 220);
      setTimeout(function () {
        mouseUp();
      }, holdMs);
    }, 900);

    state.heartbeatTimer = setInterval(function () {
      keepPlayerInAction();
    }, 250);

    keepPlayerInAction();

    return {
      stop: stop,
      movementPatternCount: 3,
      compressFrontline: opts.compressFrontline,
      mode: opts.mode,
      allowWarpRecovery: opts.allowWarpRecovery
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
        compressFrontline: !!driver.compressFrontline
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
