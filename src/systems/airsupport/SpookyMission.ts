import * as THREE from 'three';
import type { AirSupportMission } from './AirSupportTypes';
import type { CombatantSystem } from '../combat/CombatantSystem';
import type { IAudioManager } from '../../types/SystemInterfaces';
import type { TracerPool } from '../effects/TracerPool';

// Orbit parameters
const ORBIT_RADIUS = 200;
const BANK_ANGLE = 0.44; // ~25 degrees left bank

// Weapon parameters
const BURST_INTERVAL_MIN = 2.0;
const BURST_INTERVAL_MAX = 3.0;
const ROUNDS_PER_BURST = 25;
const DAMAGE_PER_ROUND = 8;
const GROUND_SCATTER = 15; // meters scatter around target

// Scratch vectors
const _tracerStart = new THREE.Vector3();
const _tracerEnd = new THREE.Vector3();
const _targetPos = new THREE.Vector3();

export function initSpooky(mission: AirSupportMission): void {
  // Start at a random angle on the orbit
  mission.missionData.orbitAngle = Math.random() * Math.PI * 2;
  mission.missionData.nextBurstAt = BURST_INTERVAL_MIN;
  mission.missionData.burstRoundsRemaining = 0;
  mission.missionData.burstFireAccum = 0;
}

export function updateSpooky(
  mission: AirSupportMission,
  dt: number,
  combatantSystem: CombatantSystem | undefined,
  audioManager: IAudioManager | undefined,
  tracerPool: TracerPool | undefined,
  getTerrainHeight: (x: number, z: number) => number,
  physicsControlled = false,
): void {
  const { aircraft, targetPosition } = mission;

  // Flight positioning: skip if physics controller is handling it
  if (!physicsControlled) {
    const speed = 40; // m/s orbital speed

    // Advance orbit angle
    const angularSpeed = speed / ORBIT_RADIUS;
    mission.missionData.orbitAngle += angularSpeed * dt;
    const angle = mission.missionData.orbitAngle;

    // Position aircraft on orbit circle
    aircraft.position.x = targetPosition.x + ORBIT_RADIUS * Math.cos(angle);
    aircraft.position.z = targetPosition.z + ORBIT_RADIUS * Math.sin(angle);

    // Terrain-following altitude
    const terrainH = getTerrainHeight(aircraft.position.x, aircraft.position.z);
    aircraft.position.y = terrainH + 300;

    // Face tangent to orbit (left pylon turn)
    aircraft.rotation.set(0, angle + Math.PI / 2, -BANK_ANGLE);
  }

  // Weapon fire logic
  mission.missionData.nextBurstAt -= dt;
  if (mission.missionData.nextBurstAt <= 0 && mission.missionData.burstRoundsRemaining <= 0) {
    // Start new burst
    mission.missionData.burstRoundsRemaining = ROUNDS_PER_BURST;
    mission.missionData.burstFireAccum = 0;
    mission.missionData.nextBurstAt =
      BURST_INTERVAL_MIN + Math.random() * (BURST_INTERVAL_MAX - BURST_INTERVAL_MIN);
  }

  // Fire rounds in burst (spread across time for visual effect)
  if (mission.missionData.burstRoundsRemaining > 0) {
    const roundInterval = 0.02; // 50 rounds/sec visual rate
    mission.missionData.burstFireAccum += dt;

    while (
      mission.missionData.burstFireAccum >= roundInterval &&
      mission.missionData.burstRoundsRemaining > 0
    ) {
      mission.missionData.burstFireAccum -= roundInterval;
      mission.missionData.burstRoundsRemaining--;

      // Tracer from aircraft belly toward ground
      _tracerStart.copy(aircraft.position);
      _tracerStart.y -= 2; // belly offset

      _targetPos.set(
        targetPosition.x + (Math.random() - 0.5) * GROUND_SCATTER * 2,
        getTerrainHeight(targetPosition.x, targetPosition.z),
        targetPosition.z + (Math.random() - 0.5) * GROUND_SCATTER * 2,
      );
      _tracerEnd.copy(_targetPos);

      tracerPool?.spawn(_tracerStart, _tracerEnd, 200);

      // Apply damage to combatants near impact point
      if (combatantSystem) {
        combatantSystem.applyExplosionDamage(
          _targetPos,
          3,
          DAMAGE_PER_ROUND,
          undefined,
          'spooky_minigun',
        );
      }
    }

    // Audio on burst start
    if (mission.missionData.burstRoundsRemaining === ROUNDS_PER_BURST - 1) {
      audioManager?.play('minigunBurst', aircraft.position, 0.4);
    }
  }
}
