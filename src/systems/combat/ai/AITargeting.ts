import * as THREE from 'three';
import { Combatant, CombatantState, Faction } from '../types';
import { ImprovedChunkManager } from '../../terrain/ImprovedChunkManager';
import { SandbagSystem } from '../../weapons/SandbagSystem';
import { SpatialGridManager } from '../SpatialGridManager';
import { objectPool } from '../../../utils/ObjectPoolManager';
import { clusterManager } from '../ClusterManager';
import { getHeightQueryCache } from '../../terrain/HeightQueryCache';

// Module-level reusable objects to reduce allocations
const _playerProxy: Combatant = {
  id: 'PLAYER',
  faction: Faction.US,
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  state: CombatantState.ENGAGING,
  health: 100,
  maxHealth: 100
} as Combatant;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _v7 = new THREE.Vector3();
const _v8 = new THREE.Vector3();
const _ray = new THREE.Ray();

/**
 * Handles target acquisition, line of sight checks, and cover finding
 */
export class AITargeting {
  private chunkManager?: ImprovedChunkManager;
  private sandbagSystem?: SandbagSystem;

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.sandbagSystem = sandbagSystem;
  }

  findNearestEnemy(
    combatant: Combatant,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialGridManager
  ): Combatant | null {
    const visualRange = combatant.skillProfile.visualRange;
    const visualRangeSq = visualRange * visualRange;
    const potentialTargets: Combatant[] = [];
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
      return clusterManager.assignDistributedTarget(combatant, potentialTargets, allCombatants);
    }

    // Not in cluster - just pick nearest target
    if (potentialTargets.length === 0) return null;
    if (potentialTargets.length === 1) return potentialTargets[0];

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

    return nearestEnemy;
  }

  canSeeTarget(
    combatant: Combatant,
    target: Combatant,
    playerPosition: THREE.Vector3
  ): boolean {
    const targetPos = target.id === 'PLAYER' ? playerPosition : target.position;
    const distanceSq = combatant.position.distanceToSquared(targetPos);
    const visualRange = combatant.skillProfile.visualRange;

    if (distanceSq > visualRange * visualRange) return false;

    const distance = Math.sqrt(distanceSq);

    const toTarget = _v1;
    toTarget.subVectors(targetPos, combatant.position).divideScalar(distance || 1);

    const forward = _v2;
    forward.set(
      Math.cos(combatant.rotation),
      0,
      Math.sin(combatant.rotation)
    );

    const dot = forward.dot(toTarget);
    const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
    const halfFov = THREE.MathUtils.degToRad(combatant.skillProfile.fieldOfView / 2);

    if (angle > halfFov) {
      return false;
    }

    if (this.chunkManager && combatant.lodLevel &&
        (combatant.lodLevel === 'high' || combatant.lodLevel === 'medium')) {

      const eyePos = _v3;
      eyePos.copy(combatant.position);
      eyePos.y += 1.7;

      const targetEyePos = _v4;
      targetEyePos.copy(targetPos);
      targetEyePos.y += 1.7;

      const direction = _v5;
      direction.subVectors(targetEyePos, eyePos).normalize();

      const terrainHit = this.chunkManager.raycastTerrain(eyePos, direction, distance);

      if (terrainHit.hit && terrainHit.distance! < distance - 1) {
        return false;
      }
    }

    if (this.sandbagSystem) {
      const eyePos = _v3;
      eyePos.copy(combatant.position);
      eyePos.y += 1.7;

      const targetEyePos = _v4;
      targetEyePos.copy(targetPos);
      targetEyePos.y += 1.7;

      const direction = _v5;
      direction.subVectors(targetEyePos, eyePos).normalize();

      _ray.set(eyePos, direction);
      const sandbagBounds = this.sandbagSystem.getSandbagBounds();

      for (const bounds of sandbagBounds) {
        // Use _v1 for intersection point as toTarget/forward are no longer needed
        const intersection = _ray.intersectBox(bounds, _v1);
        if (intersection && eyePos.distanceTo(intersection) < distance) {
          return false;
        }
      }
    }

    return true;
  }

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

  countNearbyEnemies(
    combatant: Combatant,
    radius: number,
    playerPosition: THREE.Vector3,
    allCombatants: Map<string, Combatant>,
    spatialGrid?: SpatialGridManager
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

  shouldSeekCover(combatant: Combatant): boolean {
    if (combatant.lodLevel !== 'high' && combatant.lodLevel !== 'medium') {
      return false;
    }

    if (combatant.inCover) {
      return false;
    }

    const timeSinceLastCoverSeek = combatant.lastCoverSeekTime ?
      (Date.now() - combatant.lastCoverSeekTime) / 1000 : 999;
    if (timeSinceLastCoverSeek < 3) {
      return false;
    }

    const timeSinceHit = (Date.now() - combatant.lastHitTime) / 1000;
    const recentlyHit = timeSinceHit < 2.0;
    const lowHealth = combatant.health < combatant.maxHealth * 0.5;
    const highSuppression = combatant.suppressionLevel > 0.6;
    const inBurstCooldown = combatant.burstCooldown > 0.5;

    return recentlyHit || lowHealth || highSuppression ||
           (inBurstCooldown && !!combatant.target && timeSinceHit < 5.0);
  }

  findNearestCover(combatant: Combatant, threatPosition: THREE.Vector3): THREE.Vector3 | null {
    const MAX_SEARCH_RADIUS = 30;
    const MAX_SEARCH_RADIUS_SQ = MAX_SEARCH_RADIUS * MAX_SEARCH_RADIUS;
    const SEARCH_SAMPLES = 16;
    const SANDBAG_PREFERRED_DISTANCE = 15;
    let bestCoverPos: THREE.Vector3 | null = null;
    let bestCoverScore = -Infinity;

    if (this.sandbagSystem) {
      const sandbagBounds = this.sandbagSystem.getSandbagBounds();

      for (const bounds of sandbagBounds) {
        const sandbagCenter = _v1;
        bounds.getCenter(sandbagCenter);

        const distanceToSandbagSq = combatant.position.distanceToSquared(sandbagCenter);

        if (distanceToSandbagSq > MAX_SEARCH_RADIUS_SQ) continue;

        const threatToSandbag = _v2;
        threatToSandbag.subVectors(sandbagCenter, threatPosition).normalize();

        const coverPos = _v3;
        coverPos.copy(sandbagCenter).addScaledVector(threatToSandbag, 2);

        if (this.isSandbagCover(coverPos, sandbagCenter, bounds, threatPosition)) {
          const distanceToCombatantSq = combatant.position.distanceToSquared(coverPos);
          const distanceToCombatant = Math.sqrt(distanceToCombatantSq);
          const distanceToSandbag = Math.sqrt(distanceToSandbagSq);

          let score = 1 / (distanceToCombatant + 1);

          if (distanceToSandbag < SANDBAG_PREFERRED_DISTANCE) {
            score *= 2.0;
          }

          if (distanceToCombatant < distanceToSandbag) {
            score *= 1.5;
          }

          if (score > bestCoverScore) {
            bestCoverScore = score;
            bestCoverPos = coverPos.clone();
          }
        }
      }
    }

    if (this.chunkManager) {
      const vegetationCover = this.findVegetationCover(combatant.position, threatPosition, MAX_SEARCH_RADIUS);

      for (const vegPos of vegetationCover) {
        const distanceToCombatantSq = combatant.position.distanceToSquared(vegPos);
        const distanceToCombatant = Math.sqrt(distanceToCombatantSq);
        const distanceToThreatSq = vegPos.distanceToSquared(threatPosition);

        const toThreat = _v1;
        toThreat.subVectors(threatPosition, vegPos).normalize();
        const toCombatant = _v2;
        toCombatant.subVectors(combatant.position, vegPos).normalize();
        const flankingAngle = Math.abs(toThreat.dot(toCombatant));
        const flankingScore = 1 - flankingAngle;

        let score = (1 / (distanceToCombatant + 1)) * 1.5;
        score *= (1 + flankingScore * 0.5);

        if (distanceToCombatantSq < distanceToThreatSq) {
          score *= 1.3;
        }

        if (score > bestCoverScore) {
          bestCoverScore = score;
          bestCoverPos = vegPos.clone();
        }
      }
    }

    if (this.chunkManager) {
      for (let i = 0; i < SEARCH_SAMPLES; i++) {
        const angle = (i / SEARCH_SAMPLES) * Math.PI * 2;

        for (const radius of [10, 20, 30]) {
          const testPos = _v1;
          testPos.set(
            combatant.position.x + Math.cos(angle) * radius,
            0,
            combatant.position.z + Math.sin(angle) * radius
          );

          const terrainHeight = getHeightQueryCache().getHeightAt(testPos.x, testPos.z);
          testPos.y = terrainHeight;

          if (this.isPositionCover(testPos, combatant.position, threatPosition)) {
            const distanceToCombatantSq = combatant.position.distanceToSquared(testPos);
            const heightDifference = Math.abs(testPos.y - combatant.position.y);

            const score = (1 / (Math.sqrt(distanceToCombatantSq) + 1)) * heightDifference;

            if (score > bestCoverScore) {
              bestCoverScore = score;
              bestCoverPos = testPos.clone();
            }
          }
        }
      }
    }

    return bestCoverPos;
  }

  isCoverFlanked(combatant: Combatant, threatPos: THREE.Vector3): boolean {
    if (!combatant.coverPosition) return true;

    const coverToThreat = _v1;
    coverToThreat.subVectors(threatPos, combatant.coverPosition).normalize();

    const coverToCombatant = _v2;
    coverToCombatant.subVectors(combatant.position, combatant.coverPosition).normalize();

    const dotProduct = coverToThreat.dot(coverToCombatant);

    return dotProduct > 0.3;
  }

  private findVegetationCover(
    position: THREE.Vector3,
    threatPosition: THREE.Vector3,
    searchRadius: number
  ): THREE.Vector3[] {
    if (!this.chunkManager) return [];

    const coverPositions: THREE.Vector3[] = [];
    const VEGETATION_COVER_DISTANCE = 3;
    const MIN_COVER_HEIGHT = 1.5;
    const searchRadiusSq = searchRadius * searchRadius;

    const gridSize = 12;
    const step = (searchRadius * 2) / gridSize;

    for (let x = -searchRadius; x <= searchRadius; x += step) {
      for (let z = -searchRadius; z <= searchRadius; z += step) {
        const samplePos = _v1;
        samplePos.set(
          position.x + x,
          0,
          position.z + z
        );

        const distanceSq = position.distanceToSquared(samplePos);
        if (distanceSq > searchRadiusSq || distanceSq < 9) continue;

        const localHeight = getHeightQueryCache().getHeightAt(samplePos.x, samplePos.z);
        const surroundingHeights = [
          getHeightQueryCache().getHeightAt(samplePos.x + 2, samplePos.z),
          getHeightQueryCache().getHeightAt(samplePos.x - 2, samplePos.z),
          getHeightQueryCache().getHeightAt(samplePos.x, samplePos.z + 2),
          getHeightQueryCache().getHeightAt(samplePos.x, samplePos.z - 2)
        ];

        const avgHeight = surroundingHeights.reduce((a, b) => a + b, 0) / surroundingHeights.length;
        const heightVariation = Math.abs(localHeight - avgHeight);

        const hasHeightVariation = heightVariation > 0.8;
        const isElevated = localHeight > position.y + MIN_COVER_HEIGHT;

        if (hasHeightVariation || isElevated) {
          const threatToVeg = _v2;
          threatToVeg.subVectors(samplePos, threatPosition).normalize();

          const coverPos = _v3;
          coverPos.copy(samplePos).addScaledVector(threatToVeg, VEGETATION_COVER_DISTANCE);
          coverPos.y = getHeightQueryCache().getHeightAt(coverPos.x, coverPos.z);

          const coverToSample = _v4;
          coverToSample.subVectors(samplePos, coverPos).normalize();
          const coverToThreat = _v5;
          coverToThreat.subVectors(threatPosition, coverPos).normalize();

          const dotProduct = coverToSample.dot(coverToThreat);
          if (dotProduct > 0.5) {
            coverPositions.push(coverPos.clone());
          }
        }
      }
    }

    return coverPositions;
  }

  private isPositionCover(
    coverPos: THREE.Vector3,
    combatantPos: THREE.Vector3,
    threatPos: THREE.Vector3
  ): boolean {
    if (!this.chunkManager) {
      return false;
    }

    const heightDifference = coverPos.y - combatantPos.y;
    if (heightDifference < 1.0) {
      return false;
    }

    const distance = coverPos.distanceTo(threatPos);

    const threatEyePos = _v6;
    threatEyePos.copy(threatPos);
    threatEyePos.y += 1.7;

    const coverEyePos = _v7;
    coverEyePos.copy(coverPos);
    coverEyePos.y += 1.7;

    const direction = _v8;
    direction.subVectors(coverEyePos, threatEyePos).normalize();

    const terrainHit = this.chunkManager.raycastTerrain(threatEyePos, direction, distance);

    return terrainHit.hit && terrainHit.distance! < distance - 1;
  }

  private isSandbagCover(
    coverPos: THREE.Vector3,
    sandbagCenter: THREE.Vector3,
    sandbagBounds: THREE.Box3,
    threatPos: THREE.Vector3
  ): boolean {
    const threatToSandbag = _v4;
    threatToSandbag.subVectors(sandbagCenter, threatPos);
    const threatToCover = _v5;
    threatToCover.subVectors(coverPos, threatPos);

    if (threatToCover.lengthSq() < threatToSandbag.lengthSq()) {
      return false;
    }

    const distance = coverPos.distanceTo(threatPos);

    const threatEyePos = _v6;
    threatEyePos.copy(threatPos);
    threatEyePos.y += 1.7;

    const coverEyePos = _v7;
    coverEyePos.copy(coverPos);
    coverEyePos.y += 1.7;

    const direction = _v8;
    direction.subVectors(coverEyePos, threatEyePos).normalize();

    _ray.set(threatEyePos, direction);

    // Use _v1 for intersection point as it's not used in this scope anymore
    const intersection = _ray.intersectBox(sandbagBounds, _v1);

    if (intersection && threatEyePos.distanceTo(intersection) < distance - 0.5) {
      return true;
    }

    return false;
  }
}
