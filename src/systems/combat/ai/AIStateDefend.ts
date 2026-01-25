import * as THREE from 'three';
import { Combatant, CombatantState } from '../types';
import { SpatialOctree } from '../SpatialOctree';
import { ZoneManager } from '../../world/ZoneManager';

/**
 * Handles defensive zone holding behavior
 */
export class AIStateDefend {
  private zoneManager?: ZoneManager;

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
  }

  handleDefending(
    combatant: Combatant,
    deltaTime: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid: SpatialOctree | undefined,
    findNearestEnemy: (
      combatant: Combatant,
      playerPosition: THREE.Vector3,
      allCombatants: Map<string, Combatant>,
      spatialGrid?: SpatialOctree
    ) => Combatant | null,
    canSeeTarget: (
      combatant: Combatant,
      target: Combatant,
      playerPosition: THREE.Vector3
    ) => boolean
  ): void {
    // Check for nearby enemies - defenders engage if threatened
    const enemy = findNearestEnemy(combatant, playerPosition, allCombatants, spatialGrid);
    if (enemy) {
      const targetPos = enemy.id === 'PLAYER' ? playerPosition : enemy.position;
      const distance = combatant.position.distanceTo(targetPos);

      if (distance < 50 && canSeeTarget(combatant, enemy, playerPosition)) {
        combatant.state = CombatantState.ALERT;
        combatant.target = enemy;
        combatant.previousState = CombatantState.DEFENDING;

        const rangeDelay = Math.floor(distance / 30) * 250;
        combatant.reactionTimer = (combatant.skillProfile.reactionDelayMs + rangeDelay) / 1000;
        combatant.alertTimer = 1.5;
        return;
      }
    }

    if (!combatant.defensePosition) {
      combatant.state = CombatantState.PATROLLING;
      combatant.defendingZoneId = undefined;
      return;
    }

    const distanceToDefensePos = combatant.position.distanceTo(combatant.defensePosition);
    if (distanceToDefensePos > 3) {
      combatant.destinationPoint = combatant.defensePosition.clone();
      const toDefensePos = new THREE.Vector3()
        .subVectors(combatant.defensePosition, combatant.position)
        .normalize();
      combatant.rotation = Math.atan2(toDefensePos.z, toDefensePos.x);
    } else {
      combatant.destinationPoint = undefined;
      if (combatant.defendingZoneId && this.zoneManager) {
        const zone = this.zoneManager.getAllZones()
          .find(z => z.id === combatant.defendingZoneId);
        if (zone) {
          const toZone = new THREE.Vector3()
            .subVectors(zone.position, combatant.position);
          const outwardAngle = Math.atan2(toZone.z, toZone.x) + Math.PI;
          combatant.rotation = outwardAngle;
        }
      }
    }
  }
}
