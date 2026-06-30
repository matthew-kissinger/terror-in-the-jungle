// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { AirSupportMission } from './AirSupportTypes';
import type { CombatantSystem } from '../combat/CombatantSystem';
import type { Faction } from '../combat/types';
import type { IAudioManager } from '../../types/SystemInterfaces';
import { spawnNapalmFire } from '../effects/NapalmFireSystem';
import { spawnSmokeCloud } from '../effects/SmokeCloudSystem';

// Napalm parameters
const APPROACH_DISTANCE = 500; // start/end distance from target
const DROP_DISTANCE = 50; // distance from target when canisters release
const FIRE_ZONE_RADIUS = 25;
const FIRE_ZONE_MAX_DAMAGE = 200;
const FIRE_TICK_INTERVAL = 0.5; // damage tick interval
const FIRE_DURATION = 12; // seconds of persistent fire
const FIRE_ZONE_COUNT = 6; // number of fire points along impact line
const NAPALM_BURST_STAGGER = 0.08; // seconds between successive fire-zone bursts (avoids one-frame pool eviction)

// Scratch vectors
const _firePos = new THREE.Vector3();

export function initNapalm(mission: AirSupportMission): void {
  mission.missionData.dropped = 0;
  mission.missionData.fireElapsed = 0;
  mission.missionData.fireDamageAccum = 0;
  // Fire zone positions stored as flat array: x0,z0, x1,z1, ...
  // Computed on drop
}

export function updateNapalm(
  mission: AirSupportMission,
  dt: number,
  combatantSystem: CombatantSystem | undefined,
  audioManager: IAudioManager | undefined,
  explosionSpawn: ((position: THREE.Vector3) => void) | undefined,
  getTerrainHeight: (x: number, z: number) => number,
  shooterFaction?: Faction,
): void {
  const { aircraft, targetPosition, approachDirection } = mission;
  const speed = 120;

  // Linear flight path: start -> target -> exit
  // elapsed tracks time through the full pass
  const totalDistance = APPROACH_DISTANCE * 2;
  const totalTime = totalDistance / speed;
  const t = Math.min(mission.elapsed / totalTime, 1);

  // Start position = target - approach * APPROACH_DISTANCE
  const startX = targetPosition.x - approachDirection.x * APPROACH_DISTANCE;
  const startZ = targetPosition.z - approachDirection.z * APPROACH_DISTANCE;

  aircraft.position.x = startX + approachDirection.x * totalDistance * t;
  aircraft.position.z = startZ + approachDirection.z * totalDistance * t;

  const terrainH = getTerrainHeight(aircraft.position.x, aircraft.position.z);
  aircraft.position.y = terrainH + 100;

  // Face approach direction
  aircraft.rotation.set(0, Math.atan2(approachDirection.x, approachDirection.z), 0);

  // Compute distance to target along approach axis
  const dx = aircraft.position.x - targetPosition.x;
  const dz = aircraft.position.z - targetPosition.z;
  const distToTarget = Math.sqrt(dx * dx + dz * dz);

  // Drop napalm when crossing near target
  if (mission.missionData.dropped === 0 && distToTarget < DROP_DISTANCE) {
    mission.missionData.dropped = 1;

    // Compute fire zone positions along approach direction
    const halfLength = FIRE_ZONE_RADIUS * 1.5;
    for (let i = 0; i < FIRE_ZONE_COUNT; i++) {
      const frac = (i / (FIRE_ZONE_COUNT - 1)) * 2 - 1; // -1 to 1
      const fx = targetPosition.x + approachDirection.x * halfLength * frac;
      const fz = targetPosition.z + approachDirection.z * halfLength * frac;
      mission.missionData[`fire_x${i}`] = fx;
      mission.missionData[`fire_z${i}`] = fz;
    }

    // Stage the per-zone bursts; they are released one at a time in the update
    // loop (below) rather than all in one frame, so the shared explosion pool is
    // never asked for all 6 slots at once. (Plan #6.)
    mission.missionData.burstsSpawned = 0;
    mission.missionData.burstAccum = NAPALM_BURST_STAGGER;

    // Initial damage burst
    if (combatantSystem) {
      combatantSystem.applyExplosionDamage(
        targetPosition,
        FIRE_ZONE_RADIUS,
        FIRE_ZONE_MAX_DAMAGE,
        undefined,
        'napalm',
        shooterFaction,
      );
    }

    audioManager?.play('napalmExplosion', targetPosition, 1.0);
  }

  // Persistent fire damage ticks
  if (mission.missionData.dropped === 1) {
    // Release the staggered fire-zone explosion bursts over the first frames
    // after the drop (one per NAPALM_BURST_STAGGER), instead of all at once.
    if (mission.missionData.burstsSpawned < FIRE_ZONE_COUNT) {
      mission.missionData.burstAccum += dt;
      while (
        mission.missionData.burstAccum >= NAPALM_BURST_STAGGER &&
        mission.missionData.burstsSpawned < FIRE_ZONE_COUNT
      ) {
        mission.missionData.burstAccum -= NAPALM_BURST_STAGGER;
        const i = mission.missionData.burstsSpawned as number;
        mission.missionData.burstsSpawned = i + 1;
        const fx = mission.missionData[`fire_x${i}`];
        const fz = mission.missionData[`fire_z${i}`];
        _firePos.set(fx, getTerrainHeight(fx, fz), fz);
        explosionSpawn?.(_firePos.clone());
        // Light a persistent fire that burns for the full FIRE_DURATION at each
        // zone (the missing visual), plus a smoke column over every other zone so
        // the strike reads from range without swamping the shared smoke pool.
        // No-ops in unit tests (the effect singletons are unwired there).
        spawnNapalmFire(_firePos, FIRE_DURATION, FIRE_ZONE_RADIUS);
        if (i % 2 === 0) spawnSmokeCloud(_firePos);
      }
    }

    mission.missionData.fireElapsed += dt;
    mission.missionData.fireDamageAccum += dt;

    if (mission.missionData.fireDamageAccum >= FIRE_TICK_INTERVAL) {
      mission.missionData.fireDamageAccum -= FIRE_TICK_INTERVAL;

      // Apply damage at each fire point
      if (combatantSystem) {
        for (let i = 0; i < FIRE_ZONE_COUNT; i++) {
          const fx = mission.missionData[`fire_x${i}`];
          const fz = mission.missionData[`fire_z${i}`];
          if (fx === undefined) continue;
          _firePos.set(fx, getTerrainHeight(fx, fz), fz);
          combatantSystem.applyExplosionDamage(
            _firePos,
            8,
            30,
            undefined,
            'napalm',
            shooterFaction,
          );
        }
      }
    }

    // Transition to outbound when fire expires
    if (mission.missionData.fireElapsed > FIRE_DURATION) {
      mission.state = 'outbound';
    }
  }

  // Aircraft exits when past total distance
  if (t >= 1.0 && mission.missionData.dropped === 0) {
    // Missed drop somehow, force it
    mission.missionData.dropped = 1;
  }
}
