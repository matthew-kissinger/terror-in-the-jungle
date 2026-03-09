import * as THREE from 'three';
import type { AirSupportMission } from './AirSupportTypes';
import type { GrenadeSystem } from '../weapons/GrenadeSystem';
import type { IAudioManager } from '../../types/SystemInterfaces';

// Rocket run parameters
const APPROACH_DISTANCE = 400;
const FIRE_START_DISTANCE = 200; // start firing at this distance from target
const BREAK_OFF_DISTANCE = 100; // break off and climb at this distance
const ROCKET_COUNT = 6;
const ROCKET_INTERVAL = 0.3; // seconds between rockets
const ROCKET_SPEED = 150; // m/s
const ROCKET_FUSE = 10; // seconds (long fuse, relies on terrain impact)

// Scratch vectors
const _rocketPos = new THREE.Vector3();
const _rocketVel = new THREE.Vector3();

export function initRocketRun(mission: AirSupportMission): void {
  mission.missionData.rocketsFired = 0;
  mission.missionData.nextRocketAt = 0;
  mission.missionData.brokeOff = 0;
}

export function updateRocketRun(
  mission: AirSupportMission,
  dt: number,
  grenadeSystem: GrenadeSystem | undefined,
  audioManager: IAudioManager | undefined,
  getTerrainHeight: (x: number, z: number) => number,
): void {
  const { aircraft, targetPosition, approachDirection } = mission;
  const speed = 60;

  if (mission.missionData.brokeOff === 0) {
    // Linear approach
    const totalDistance = APPROACH_DISTANCE + BREAK_OFF_DISTANCE;
    const totalTime = totalDistance / speed;
    const t = Math.min(mission.elapsed / totalTime, 1);

    const startX = targetPosition.x - approachDirection.x * APPROACH_DISTANCE;
    const startZ = targetPosition.z - approachDirection.z * APPROACH_DISTANCE;

    aircraft.position.x = startX + approachDirection.x * totalDistance * t;
    aircraft.position.z = startZ + approachDirection.z * totalDistance * t;

    const terrainH = getTerrainHeight(aircraft.position.x, aircraft.position.z);
    aircraft.position.y = terrainH + 80;

    // Face approach direction
    aircraft.rotation.set(0, Math.atan2(approachDirection.x, approachDirection.z), 0);

    // Calculate distance to target
    const dx = aircraft.position.x - targetPosition.x;
    const dz = aircraft.position.z - targetPosition.z;
    const distToTarget = Math.sqrt(dx * dx + dz * dz);

    // Fire rockets when in range
    if (distToTarget < FIRE_START_DISTANCE && mission.missionData.rocketsFired < ROCKET_COUNT) {
      mission.missionData.nextRocketAt -= dt;
      if (mission.missionData.nextRocketAt <= 0) {
        mission.missionData.nextRocketAt = ROCKET_INTERVAL;
        mission.missionData.rocketsFired++;

        // Spawn rocket projectile
        if (grenadeSystem) {
          _rocketPos.copy(aircraft.position);
          _rocketPos.y -= 1; // underwing

          // Aim at target with small scatter
          _rocketVel.copy(approachDirection);
          _rocketVel.x += (Math.random() - 0.5) * 0.05;
          _rocketVel.z += (Math.random() - 0.5) * 0.05;
          _rocketVel.normalize().multiplyScalar(ROCKET_SPEED);
          // Slight downward angle toward ground
          _rocketVel.y = -20;

          grenadeSystem.spawnProjectile(_rocketPos.clone(), _rocketVel.clone(), ROCKET_FUSE, 'rocket');
        }

        audioManager?.play('rocketLaunch', aircraft.position, 0.6);
      }
    }

    // Break off when past target
    if (distToTarget < BREAK_OFF_DISTANCE && t > 0.5) {
      mission.missionData.brokeOff = 1;
      mission.missionData.breakOffElapsed = 0;
    }
  } else {
    // Break-off: climb and exit
    mission.missionData.breakOffElapsed += dt;
    const breakT = mission.missionData.breakOffElapsed;

    aircraft.position.x += approachDirection.x * speed * dt;
    aircraft.position.z += approachDirection.z * speed * dt;
    aircraft.position.y += 30 * dt; // climb

    // Pitch up during break-off
    aircraft.rotation.set(
      -0.3 * Math.min(breakT, 1), // nose up
      Math.atan2(approachDirection.x, approachDirection.z),
      0,
    );

    if (breakT > 5) {
      mission.state = 'outbound';
    }
  }
}
