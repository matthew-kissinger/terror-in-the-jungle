import * as THREE from 'three';
import { Combatant, CombatantState, Faction } from '../types';
import { SpatialOctree } from '../SpatialOctree';
import { clusterManager } from '../ClusterManager';

// Module-level scratch vectors
const _playerProxy: Combatant = {
  id: 'PLAYER',
  faction: Faction.US,
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  state: CombatantState.ENGAGING,
  health: 100,
  maxHealth: 100,
  kills: 0,
  deaths: 0
} as Combatant;

const _potentialTargetsScratch: Combatant[] = [];

/**
 * Handles target acquisition and engagement decisions
 */
export class AITargetAcquisition {
  /**
   * Find the nearest enemy within visual range, with cluster-aware target distribution
   */
  findNearestEnemy(
    combatant: Combatant,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialOctree
  ): Combatant | null {
    const visualRange = combatant.skillProfile.visualRange;
    const visualRangeSq = visualRange * visualRange;
    const potentialTargets = _potentialTargetsScratch;
    potentialTargets.length = 0;
    let inCluster = false;

    // Check player as potential target for OPFOR
    if (combatant.faction === Faction.OPFOR) {
      const playerDistanceSq = combatant.position.distanceToSquared(playerPosition);
      if (playerDistanceSq < visualRangeSq) {
        // Reuse player proxy instead of creating new object
        _playerProxy.position.copy(playerPosition);
        potentialTargets.push(_playerProxy);
      }
    }

    // Collect all enemy combatants within visual range and determine cluster status
    if (spatialGrid) {
      // Use spatial grid to check both targets and cluster status in one pass if possible,
      // but query radius must be the larger of the two.
      const queryRadius = Math.max(visualRange, 15); // 15 is CLUSTER_RADIUS
      const nearbyIds = spatialGrid.queryRadius(combatant.position, queryRadius);
      const CLUSTER_RADIUS_SQ = 15 * 15;
      let nearbyFriendlies = 0;

      for (const id of nearbyIds) {
        const other = allCombatants.get(id);
        if (!other || other.state === CombatantState.DEAD) continue;

        const distSq = combatant.position.distanceToSquared(other.position);

        if (other.faction === combatant.faction) {
          if (id !== combatant.id && distSq < CLUSTER_RADIUS_SQ) {
            nearbyFriendlies++;
          }
          continue;
        }

        if (distSq < visualRangeSq) {
          potentialTargets.push(other);
        }
      }
      inCluster = nearbyFriendlies >= 4; // 4 is CLUSTER_THRESHOLD
    } else {
      let nearbyFriendlies = 0;
      const CLUSTER_RADIUS_SQ = 15 * 15;

      allCombatants.forEach(other => {
        if (other.state === CombatantState.DEAD) return;

        const distSq = combatant.position.distanceToSquared(other.position);

        if (other.faction === combatant.faction) {
          if (other.id !== combatant.id && distSq < CLUSTER_RADIUS_SQ) {
            nearbyFriendlies++;
          }
          return;
        }

        if (distSq < visualRangeSq) {
          potentialTargets.push(other);
        }
      });
      inCluster = nearbyFriendlies >= 4;
    }

    // Use cluster-aware target distribution when in a cluster
    // This prevents all NPCs from focusing the same enemy
    if (inCluster) {
      const target = clusterManager.assignDistributedTarget(combatant, potentialTargets, allCombatants);
      potentialTargets.length = 0;
      return target;
    }

    // Not in cluster - just pick nearest target
    if (potentialTargets.length === 0) {
      potentialTargets.length = 0;
      return null;
    }
    if (potentialTargets.length === 1) {
      const target = potentialTargets[0];
      potentialTargets.length = 0;
      return target;
    }

    let nearestEnemy: Combatant | null = null;
    let minDistanceSq = Infinity;

    for (const target of potentialTargets) {
      // Note: target.position is already correct for _playerProxy
      const distanceSq = combatant.position.distanceToSquared(target.position);
      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        nearestEnemy = target;
      }
    }

    potentialTargets.length = 0;
    return nearestEnemy;
  }

  /**
   * Determine if a combatant should engage a target at the given distance
   */
  shouldEngage(combatant: Combatant, distance: number): boolean {
    if (combatant.isObjectiveFocused) {
      const timeSinceHit = (Date.now() - combatant.lastHitTime) / 1000;
      const recentlyShot = timeSinceHit < 3.0;

      if (distance > 30 && !recentlyShot) {
        return false;
      }
    }

    let engageProbability = 1.0;
    if (distance < 30) {
      engageProbability = 1.0;
    } else if (distance < 60) {
      engageProbability = 0.8;
    } else if (distance < 90) {
      engageProbability = 0.5;
    } else {
      engageProbability = 0.2;
    }

    return Math.random() < engageProbability;
  }

  /**
   * Count nearby enemies within a given radius
   */
  countNearbyEnemies(
    combatant: Combatant,
    radius: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialOctree
  ): number {
    let count = 0;
    const radiusSq = radius * radius;

    if (combatant.faction === Faction.OPFOR) {
      if (combatant.position.distanceToSquared(playerPosition) < radiusSq) {
        count++;
      }
    }

    if (spatialGrid) {
      const nearbyIds = spatialGrid.queryRadius(combatant.position, radius);

      for (const id of nearbyIds) {
        const other = allCombatants.get(id);
        if (!other) continue;
        if (other.faction !== combatant.faction &&
            other.state !== CombatantState.DEAD &&
            other.position.distanceToSquared(combatant.position) < radiusSq) {
          count++;
        }
      }
    } else {
      allCombatants.forEach(other => {
        if (other.faction !== combatant.faction &&
            other.state !== CombatantState.DEAD &&
            other.position.distanceToSquared(combatant.position) < radiusSq) {
          count++;
        }
      });
    }

    return count;
  }
}
