import * as THREE from 'three';
import { Combatant, CombatantState, Faction, ITargetable, isAlly } from '../types';
import { ISpatialQuery } from '../SpatialOctree';
import { clusterManager } from '../ClusterManager';
import { SeededRandom } from '../../../core/SeededRandom';

// Module-level scratch vectors
const _playerTarget: ITargetable = {
  id: 'PLAYER',
  kind: 'player',
  faction: Faction.US,
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  state: CombatantState.ENGAGING,
  health: 100,
};

const _potentialTargetsScratch: ITargetable[] = [];
const CLUSTER_RADIUS = 15;
const CLUSTER_RADIUS_SQ = CLUSTER_RADIUS * CLUSTER_RADIUS;
const CLUSTER_THRESHOLD = 4;
const MAX_EXPECTED_CLUSTER_NEIGHBORS = 10;

type SpatialQueryCacheEntry = {
  radius: number;
  ids: readonly string[];
};

/**
 * Handles target acquisition and engagement decisions
 */
export class AITargetAcquisition {
  private readonly spatialQueryCache = new Map<string, SpatialQueryCacheEntry>();
  private playerFaction: Faction = Faction.US;

  beginFrame(): void {
    this.spatialQueryCache.clear();
  }

  getClusterDensity(
    combatant: Combatant,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: ISpatialQuery
  ): number {
    if (!spatialGrid) {
      return 0;
    }

    const nearbyIds = this.getNearbyIds(combatant, CLUSTER_RADIUS, spatialGrid);
    let nearbyFriendlies = 0;

    for (const id of nearbyIds) {
      if (id === combatant.id) continue;

      const other = allCombatants.get(id);
      if (!other || other.state === CombatantState.DEAD || !isAlly(other.faction, combatant.faction)) {
        continue;
      }

      if (combatant.position.distanceToSquared(other.position) < CLUSTER_RADIUS_SQ) {
        nearbyFriendlies++;
      }
    }

    return Math.min(1, nearbyFriendlies / MAX_EXPECTED_CLUSTER_NEIGHBORS);
  }

  /**
   * Find the nearest enemy within visual range, with cluster-aware target distribution
   */
  findNearestEnemy(
    combatant: Combatant,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: ISpatialQuery
  ): ITargetable | null {
    const visualRange = combatant.skillProfile.visualRange;
    const visualRangeSq = visualRange * visualRange;
    const potentialTargets = _potentialTargetsScratch;
    potentialTargets.length = 0;
    let inCluster = false;

    // Check player as potential target for OPFOR
    if (!isAlly(combatant.faction, this.playerFaction)) {
      const playerDistanceSq = combatant.position.distanceToSquared(playerPosition);
      if (playerDistanceSq < visualRangeSq) {
        _playerTarget.faction = this.playerFaction;
        _playerTarget.position.copy(playerPosition);
        potentialTargets.push(_playerTarget);
      }
    }

    // Collect all enemy combatants within visual range and determine cluster status
    if (spatialGrid) {
      const queryRadius = Math.max(visualRange, CLUSTER_RADIUS);
      const nearbyIds = this.getNearbyIds(combatant, queryRadius, spatialGrid);
      let nearbyFriendlies = 0;

      for (const id of nearbyIds) {
        const other = allCombatants.get(id);
        if (!other || other.state === CombatantState.DEAD) continue;

        const distSq = combatant.position.distanceToSquared(other.position);

        if (isAlly(other.faction, combatant.faction)) {
          if (id !== combatant.id && distSq < CLUSTER_RADIUS_SQ) {
            nearbyFriendlies++;
          }
          continue;
        }

        if (distSq < visualRangeSq) {
          potentialTargets.push(other);
        }
      }
      inCluster = nearbyFriendlies >= CLUSTER_THRESHOLD;
    } else {
      let nearbyFriendlies = 0;

      allCombatants.forEach(other => {
        if (other.state === CombatantState.DEAD) return;

        const distSq = combatant.position.distanceToSquared(other.position);

        if (isAlly(other.faction, combatant.faction)) {
          if (other.id !== combatant.id && distSq < CLUSTER_RADIUS_SQ) {
            nearbyFriendlies++;
          }
          return;
        }

        if (distSq < visualRangeSq) {
          potentialTargets.push(other);
        }
      });
      inCluster = nearbyFriendlies >= CLUSTER_THRESHOLD;
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

    let nearestEnemy: ITargetable | null = null;
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

    return SeededRandom.random() < engageProbability;
  }

  /**
   * Count nearby enemies within a given radius
   */
  countNearbyEnemies(
    combatant: Combatant,
    radius: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: ISpatialQuery
  ): number {
    let count = 0;
    const radiusSq = radius * radius;

    if (!isAlly(combatant.faction, this.playerFaction)) {
      if (combatant.position.distanceToSquared(playerPosition) < radiusSq) {
        count++;
      }
    }

    if (spatialGrid) {
      const nearbyIds = this.getNearbyIds(combatant, radius, spatialGrid);

      for (const id of nearbyIds) {
        const other = allCombatants.get(id);
        if (!other) continue;
        if (!isAlly(other.faction, combatant.faction) &&
            other.state !== CombatantState.DEAD &&
            other.position.distanceToSquared(combatant.position) < radiusSq) {
          count++;
        }
      }
    } else {
      allCombatants.forEach(other => {
        if (!isAlly(other.faction, combatant.faction) &&
            other.state !== CombatantState.DEAD &&
            other.position.distanceToSquared(combatant.position) < radiusSq) {
          count++;
        }
      });
    }

    return count;
  }

  setPlayerFaction(faction: Faction): void {
    this.playerFaction = faction;
  }

  private getNearbyIds(
    combatant: Combatant,
    radius: number,
    spatialGrid: ISpatialQuery
  ): readonly string[] {
    const cached = this.spatialQueryCache.get(combatant.id);
    if (cached && cached.radius >= radius) {
      return cached.ids;
    }

    const ids = spatialGrid.queryRadius(combatant.position, radius);
    this.spatialQueryCache.set(combatant.id, { radius, ids });
    return ids;
  }
}
