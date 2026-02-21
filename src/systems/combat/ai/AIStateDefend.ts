import * as THREE from 'three';
import { Combatant, CombatantState } from '../types';
import { SpatialOctree } from '../SpatialOctree';
import { ZoneManager } from '../../world/ZoneManager';
import { clusterManager } from '../ClusterManager';

const _toTarget = new THREE.Vector3();
const _toDefensePos = new THREE.Vector3();
const _toZone = new THREE.Vector3();

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

      // At very close range (<15m), defenders should ALWAYS react regardless of facing
      // This prevents the "standing right next to them" issue
      const veryCloseRange = distance < 15;

      if (distance < 50) {
        // Turn to face the enemy BEFORE checking LOS
        // This fixes the bug where defenders facing outward wouldn't see approaching enemies
        _toTarget.subVectors(targetPos, combatant.position).normalize();
        combatant.rotation = Math.atan2(_toTarget.z, _toTarget.x);

        // At very close range, skip LOS check entirely - they would hear/sense you
        if (veryCloseRange || canSeeTarget(combatant, enemy, playerPosition)) {
          combatant.state = CombatantState.ALERT;
          combatant.target = enemy;
          combatant.previousState = CombatantState.DEFENDING;

          // Calculate base reaction delay
          const rangeDelay = veryCloseRange ? 0 : Math.floor(distance / 30) * 250;
          let baseDelay = (combatant.skillProfile.reactionDelayMs * (veryCloseRange ? 0.3 : 1) + rangeDelay);

          // In clusters, stagger reactions to prevent synchronized behavior
          if (spatialGrid) {
            const clusterDensity = this.getClusterDensity(combatant, allCombatants, spatialGrid);
            if (clusterDensity > 0.3) {
              baseDelay = clusterManager.getStaggeredReactionDelay(baseDelay, clusterDensity);
            }
          }

          combatant.reactionTimer = baseDelay / 1000;
          combatant.alertTimer = 1.5;
          return;
        }
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
      _toDefensePos
        .subVectors(combatant.defensePosition, combatant.position)
        .normalize();
      combatant.rotation = Math.atan2(_toDefensePos.z, _toDefensePos.x);
    } else {
      combatant.destinationPoint = undefined;
      if (combatant.defendingZoneId && this.zoneManager) {
        const zone = this.zoneManager.getAllZones()
          .find(z => z.id === combatant.defendingZoneId);
        if (zone) {
          _toZone
            .subVectors(zone.position, combatant.position);
          const outwardAngle = Math.atan2(_toZone.z, _toZone.x) + Math.PI;
          combatant.rotation = outwardAngle;
        }
      }
    }
  }

  private getClusterDensity(
    combatant: Combatant,
    allCombatants: Map<string, Combatant>,
    spatialGrid: SpatialOctree
  ): number {
    const CLUSTER_RADIUS = 15;
    const CLUSTER_RADIUS_SQ = CLUSTER_RADIUS * CLUSTER_RADIUS;
    const nearbyIds = spatialGrid.queryRadius(combatant.position, CLUSTER_RADIUS);
    let nearbyCount = 0;
    const maxExpected = 10;

    for (const id of nearbyIds) {
      if (id === combatant.id) continue;
      const other = allCombatants.get(id);
      if (!other) continue;
      if (other.state === CombatantState.DEAD) continue;
      if (combatant.position.distanceToSquared(other.position) < CLUSTER_RADIUS_SQ) {
        nearbyCount++;
      }
    }

    return Math.min(1, nearbyCount / maxExpected);
  }
}
