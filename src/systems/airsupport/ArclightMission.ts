// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { AirSupportMission } from './AirSupportTypes';
import type { CombatantSystem } from '../combat/CombatantSystem';
import type { Faction } from '../combat/types';
import type { IAudioManager } from '../../types/SystemInterfaces';

/**
 * B-52 Arc Light strike — the top-tier air-support call-in.
 *
 * A single high-altitude bomber makes one straight pass over the marked
 * heading and walks a long stick of bombs along it. The mission reuses the
 * shared explosion-pool + `applyExplosionDamage` path the napalm strike uses
 * for FX and damage, so it introduces no new effect assets.
 *
 * Performance posture (cycle-2026-06-11 perf headroom): the stick is a
 * transient FX burst, so bombs are released ONE AT A TIME on a fixed cadence
 * (`BOMB_INTERVAL`) rather than all at once. That bounds the per-frame
 * explosion-spawn count to at most one, keeping the shared pool from being
 * exhausted in a single frame and avoiding a long-task spike around the first
 * trigger.
 *
 * IFF: every damage application threads the requester faction so friendlies in
 * the impact corridor are spared (the same friend-or-foe contract as napalm /
 * spooky). The danger-close radius is documented in the radio catalog entry.
 */

// Arc Light bomb-string parameters.
const APPROACH_DISTANCE = 500; // start/end distance from target along the heading
const STICK_HALF_LENGTH = 90; // half the walked length; full stick ~180 m
const BOMB_COUNT = 12; // craters walked across the line (period-correct long stick)
const BOMB_INTERVAL = 0.18; // seconds between successive bomb releases (one per tick)
const BOMB_RADIUS = 14; // explosion damage radius per bomb
const BOMB_MAX_DAMAGE = 160; // peak damage at crater center
const CRUISE_OFFSET = 600; // meters above terrain on the run-in (matches config altitude)

// Scratch vectors (module-level; never reallocated per frame).
const _bombPos = new THREE.Vector3();

export function initArclight(mission: AirSupportMission): void {
  mission.missionData.released = 0; // count of bombs released so far
  mission.missionData.releaseAccum = 0; // time accumulator for the next release
  mission.missionData.walkStarted = 0; // 1 once the bomber crosses the release point
}

export function updateArclight(
  mission: AirSupportMission,
  dt: number,
  combatantSystem: CombatantSystem | undefined,
  audioManager: IAudioManager | undefined,
  explosionSpawn: ((position: THREE.Vector3) => void) | undefined,
  getTerrainHeight: (x: number, z: number) => number,
  shooterFaction?: Faction,
): void {
  const { aircraft, targetPosition, approachDirection } = mission;
  const speed = 150;

  // Linear flight path: start -> target -> exit, parameterized by elapsed time.
  const totalDistance = APPROACH_DISTANCE * 2;
  const totalTime = totalDistance / speed;
  const t = Math.min(mission.elapsed / totalTime, 1);

  const startX = targetPosition.x - approachDirection.x * APPROACH_DISTANCE;
  const startZ = targetPosition.z - approachDirection.z * APPROACH_DISTANCE;

  aircraft.position.x = startX + approachDirection.x * totalDistance * t;
  aircraft.position.z = startZ + approachDirection.z * totalDistance * t;
  aircraft.position.y = getTerrainHeight(aircraft.position.x, aircraft.position.z) + CRUISE_OFFSET;

  // Face the approach direction.
  aircraft.rotation.set(0, Math.atan2(approachDirection.x, approachDirection.z), 0);

  // Signed distance of the bomber along the heading relative to the target.
  // Negative = behind the target (still inbound), positive = past it.
  const dx = aircraft.position.x - targetPosition.x;
  const dz = aircraft.position.z - targetPosition.z;
  const along = dx * approachDirection.x + dz * approachDirection.z;

  // Begin the walk when the bomber reaches the leading edge of the stick. The
  // first bomb lands at the trailing edge (behind the mark) so the stick walks
  // up to and beyond the mark as the run progresses.
  if (mission.missionData.walkStarted === 0 && along >= -STICK_HALF_LENGTH) {
    mission.missionData.walkStarted = 1;
    mission.missionData.releaseAccum = 0;
  }

  if (mission.missionData.walkStarted === 1 && mission.missionData.released < BOMB_COUNT) {
    mission.missionData.releaseAccum += dt;

    // Release at most one bomb per tick to keep the per-frame effect count
    // bounded (the shared explosion pool is small and pre-allocated).
    if (mission.missionData.releaseAccum >= BOMB_INTERVAL) {
      mission.missionData.releaseAccum -= BOMB_INTERVAL;
      releaseBomb(
        mission,
        combatantSystem,
        audioManager,
        explosionSpawn,
        getTerrainHeight,
        shooterFaction,
      );
    }
  }

  // Hand off to outbound once the stick is fully walked AND the active window
  // has elapsed (gives the last explosions time to play before cleanup).
  if (mission.missionData.released >= BOMB_COUNT && mission.elapsed >= mission.duration) {
    mission.state = 'outbound';
  }

  // Safety: if the bomber flew clear without dropping (e.g. a degenerate
  // heading), force the walk so the call-in never silently no-ops.
  if (t >= 1.0 && mission.missionData.released < BOMB_COUNT) {
    mission.missionData.walkStarted = 1;
    mission.missionData.releaseAccum = BOMB_INTERVAL;
  }
}

/** Release a single bomb at the next position along the walked stick. */
function releaseBomb(
  mission: AirSupportMission,
  combatantSystem: CombatantSystem | undefined,
  audioManager: IAudioManager | undefined,
  explosionSpawn: ((position: THREE.Vector3) => void) | undefined,
  getTerrainHeight: (x: number, z: number) => number,
  shooterFaction?: Faction,
): void {
  const { targetPosition, approachDirection } = mission;
  const index = mission.missionData.released;
  mission.missionData.released = index + 1;

  // Walk from the trailing edge (-half) to the leading edge (+half) of the stick.
  const frac = BOMB_COUNT > 1 ? index / (BOMB_COUNT - 1) : 0.5; // 0..1
  const offset = -STICK_HALF_LENGTH + frac * (STICK_HALF_LENGTH * 2);

  const bx = targetPosition.x + approachDirection.x * offset;
  const bz = targetPosition.z + approachDirection.z * offset;
  _bombPos.set(bx, getTerrainHeight(bx, bz), bz);

  // Clone per release: the impact position is handed to pooled FX / damage
  // consumers, and the module scratch vector is reused on the next release.
  const impact = _bombPos.clone();

  explosionSpawn?.(impact);

  combatantSystem?.applyExplosionDamage(
    impact,
    BOMB_RADIUS,
    BOMB_MAX_DAMAGE,
    undefined,
    'arclight',
    shooterFaction,
  );

  audioManager?.play('grenadeExplosion', impact, 1.0);
}
