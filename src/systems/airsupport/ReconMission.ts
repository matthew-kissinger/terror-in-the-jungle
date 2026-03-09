import type { AirSupportMission } from './AirSupportTypes';
import type { CombatantSystem } from '../combat/CombatantSystem';
import { GameEventBus } from '../../core/GameEventBus';

// Recon parameters
const FLYOVER_DISTANCE = 600; // total flight distance
const REVEAL_RADIUS = 100; // meters from flight path

export function initRecon(mission: AirSupportMission): void {
  mission.missionData.revealed = 0;
}

export function updateRecon(
  mission: AirSupportMission,
  dt: number,
  combatantSystem: CombatantSystem | undefined,
  getTerrainHeight: (x: number, z: number) => number,
): void {
  const { aircraft, targetPosition, approachDirection } = mission;
  const speed = 50;

  const totalTime = FLYOVER_DISTANCE / speed;
  const t = Math.min(mission.elapsed / totalTime, 1);

  const startX = targetPosition.x - approachDirection.x * (FLYOVER_DISTANCE / 2);
  const startZ = targetPosition.z - approachDirection.z * (FLYOVER_DISTANCE / 2);

  aircraft.position.x = startX + approachDirection.x * FLYOVER_DISTANCE * t;
  aircraft.position.z = startZ + approachDirection.z * FLYOVER_DISTANCE * t;

  const terrainH = getTerrainHeight(aircraft.position.x, aircraft.position.z);
  aircraft.position.y = terrainH + 200;

  aircraft.rotation.set(0, Math.atan2(approachDirection.x, approachDirection.z), 0);

  // Reveal enemies near aircraft when passing over target area
  if (mission.missionData.revealed === 0 && combatantSystem) {
    const dx = aircraft.position.x - targetPosition.x;
    const dz = aircraft.position.z - targetPosition.z;
    const distToTarget = Math.sqrt(dx * dx + dz * dz);

    if (distToTarget < REVEAL_RADIUS) {
      mission.missionData.revealed = 1;
      const enemyIds = combatantSystem.querySpatialRadius(targetPosition, REVEAL_RADIUS);
      if (enemyIds.length > 0) {
        GameEventBus.emit('recon_reveal', {
          position: targetPosition.clone(),
          radius: REVEAL_RADIUS,
          enemyCount: enemyIds.length,
        });
      }
    }
  }

  if (t >= 1.0) {
    mission.state = 'outbound';
  }
}
