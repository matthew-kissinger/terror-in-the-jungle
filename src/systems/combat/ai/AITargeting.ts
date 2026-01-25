import * as THREE from 'three';
import { Combatant, CombatantState, Faction } from '../types';
import { ImprovedChunkManager } from '../../terrain/ImprovedChunkManager';
import { SandbagSystem } from '../../weapons/SandbagSystem';
import { SpatialOctree } from '../SpatialOctree';
import { objectPool } from '../../../utils/ObjectPoolManager';
import { clusterManager } from '../ClusterManager';

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
    spatialGrid?: SpatialOctree
  ): Combatant | null {
    const visualRange = combatant.skillProfile.visualRange;
    const potentialTargets: Combatant[] = [];

    // Check player as potential target for OPFOR
    if (combatant.faction === Faction.OPFOR) {
      const playerDistance = combatant.position.distanceTo(playerPosition);
      if (playerDistance < visualRange) {
        potentialTargets.push({
          id: 'PLAYER',
          faction: Faction.US,
          position: playerPosition.clone(),
          velocity: new THREE.Vector3(),
          state: CombatantState.ENGAGING,
          health: 100,
          maxHealth: 100
        } as Combatant);
      }
    }

    // Collect all enemy combatants within visual range
    if (spatialGrid) {
      const nearbyIds = spatialGrid.queryRadius(combatant.position, visualRange);

      for (const id of nearbyIds) {
        const other = allCombatants.get(id);
        if (!other) continue;
        if (other.faction === combatant.faction) continue;
        if (other.state === CombatantState.DEAD) continue;

        const distance = combatant.position.distanceTo(other.position);
        if (distance < visualRange) {
          potentialTargets.push(other);
        }
      }
    } else {
      allCombatants.forEach(other => {
        if (other.faction === combatant.faction) return;
        if (other.state === CombatantState.DEAD) return;

        const distance = combatant.position.distanceTo(other.position);
        if (distance < visualRange) {
          potentialTargets.push(other);
        }
      });
    }

    // Use cluster-aware target distribution when in a cluster
    // This prevents all NPCs from focusing the same enemy
    if (clusterManager.isInCluster(combatant, allCombatants)) {
      return clusterManager.assignDistributedTarget(combatant, potentialTargets, allCombatants);
    }

    // Not in cluster - just pick nearest target
    if (potentialTargets.length === 0) return null;
    if (potentialTargets.length === 1) return potentialTargets[0];

    let nearestEnemy: Combatant | null = null;
    let minDistance = Infinity;

    for (const target of potentialTargets) {
      const targetPos = target.id === 'PLAYER' ? playerPosition : target.position;
      const distance = combatant.position.distanceTo(targetPos);
      if (distance < minDistance) {
        minDistance = distance;
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
    const distance = combatant.position.distanceTo(targetPos);

    if (distance > combatant.skillProfile.visualRange) return false;

    const toTarget = objectPool.getVector3();
    toTarget.subVectors(targetPos, combatant.position).normalize();

    const forward = objectPool.getVector3();
    forward.set(
      Math.cos(combatant.rotation),
      0,
      Math.sin(combatant.rotation)
    );

    const angle = Math.acos(forward.dot(toTarget));
    const halfFov = THREE.MathUtils.degToRad(combatant.skillProfile.fieldOfView / 2);

    if (angle > halfFov) {
      objectPool.releaseVector3(toTarget);
      objectPool.releaseVector3(forward);
      return false;
    }

    if (this.chunkManager && combatant.lodLevel &&
        (combatant.lodLevel === 'high' || combatant.lodLevel === 'medium')) {

      const eyePos = objectPool.getVector3();
      eyePos.copy(combatant.position);
      eyePos.y += 1.7;

      const targetEyePos = objectPool.getVector3();
      targetEyePos.copy(targetPos);
      targetEyePos.y += 1.7;

      const direction = objectPool.getVector3();
      direction.subVectors(targetEyePos, eyePos).normalize();

      const terrainHit = this.chunkManager.raycastTerrain(eyePos, direction, distance);

      objectPool.releaseVector3(direction);
      objectPool.releaseVector3(targetEyePos);
      objectPool.releaseVector3(eyePos);

      if (terrainHit.hit && terrainHit.distance! < distance - 1) {
        objectPool.releaseVector3(toTarget);
        objectPool.releaseVector3(forward);
        return false;
      }
    }

    if (this.sandbagSystem) {
      const eyePos = objectPool.getVector3();
      eyePos.copy(combatant.position);
      eyePos.y += 1.7;

      const targetEyePos = objectPool.getVector3();
      targetEyePos.copy(targetPos);
      targetEyePos.y += 1.7;

      const direction = objectPool.getVector3();
      direction.subVectors(targetEyePos, eyePos).normalize();

      const ray = new THREE.Ray(eyePos, direction);
      const sandbagBounds = this.sandbagSystem.getSandbagBounds();

      for (const bounds of sandbagBounds) {
        const intersectionPoint = objectPool.getVector3();
        const intersection = ray.intersectBox(bounds, intersectionPoint);
        if (intersection && eyePos.distanceTo(intersection) < distance) {
          objectPool.releaseVector3(intersectionPoint);
          objectPool.releaseVector3(direction);
          objectPool.releaseVector3(targetEyePos);
          objectPool.releaseVector3(eyePos);
          objectPool.releaseVector3(toTarget);
          objectPool.releaseVector3(forward);
          return false;
        }
        objectPool.releaseVector3(intersectionPoint);
      }

      objectPool.releaseVector3(direction);
      objectPool.releaseVector3(targetEyePos);
      objectPool.releaseVector3(eyePos);
    }

    objectPool.releaseVector3(toTarget);
    objectPool.releaseVector3(forward);
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
    spatialGrid?: SpatialOctree
  ): number {
    let count = 0;

    if (combatant.faction === Faction.OPFOR) {
      if (combatant.position.distanceTo(playerPosition) < radius) {
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
            other.position.distanceTo(combatant.position) < radius) {
          count++;
        }
      }
    } else {
      allCombatants.forEach(other => {
        if (other.faction !== combatant.faction &&
            other.state !== CombatantState.DEAD &&
            other.position.distanceTo(combatant.position) < radius) {
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
    const SEARCH_SAMPLES = 16;
    const SANDBAG_PREFERRED_DISTANCE = 15;
    const VEGETATION_COVER_DISTANCE = 3;
    let bestCoverPos: THREE.Vector3 | null = null;
    let bestCoverScore = -Infinity;

    if (this.sandbagSystem) {
      const sandbagBounds = this.sandbagSystem.getSandbagBounds();

      for (const bounds of sandbagBounds) {
        const sandbagCenter = new THREE.Vector3();
        bounds.getCenter(sandbagCenter);

        const distanceToSandbag = combatant.position.distanceTo(sandbagCenter);

        if (distanceToSandbag > MAX_SEARCH_RADIUS) continue;

        const threatToSandbag = new THREE.Vector3()
          .subVectors(sandbagCenter, threatPosition)
          .normalize();

        const coverPos = sandbagCenter.clone().add(threatToSandbag.multiplyScalar(2));

        if (this.isSandbagCover(coverPos, sandbagCenter, bounds, threatPosition)) {
          const distanceToCombatant = combatant.position.distanceTo(coverPos);

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
        const distanceToCombatant = combatant.position.distanceTo(vegPos);
        const distanceToThreat = vegPos.distanceTo(threatPosition);

        const toThreat = new THREE.Vector3().subVectors(threatPosition, vegPos).normalize();
        const toCombatant = new THREE.Vector3().subVectors(combatant.position, vegPos).normalize();
        const flankingAngle = Math.abs(toThreat.dot(toCombatant));
        const flankingScore = 1 - flankingAngle;

        let score = (1 / (distanceToCombatant + 1)) * 1.5;
        score *= (1 + flankingScore * 0.5);

        if (distanceToCombatant < distanceToThreat) {
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
          const testPos = new THREE.Vector3(
            combatant.position.x + Math.cos(angle) * radius,
            0,
            combatant.position.z + Math.sin(angle) * radius
          );

          const terrainHeight = this.chunkManager.getHeightAt(testPos.x, testPos.z);
          testPos.y = terrainHeight;

          if (this.isPositionCover(testPos, combatant.position, threatPosition)) {
            const distanceToCombatant = combatant.position.distanceTo(testPos);
            const heightDifference = Math.abs(testPos.y - combatant.position.y);

            const score = (1 / (distanceToCombatant + 1)) * heightDifference;

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

    const coverToThreat = new THREE.Vector3()
      .subVectors(threatPos, combatant.coverPosition);

    const coverToCombatant = new THREE.Vector3()
      .subVectors(combatant.position, combatant.coverPosition);

    const dotProduct = coverToThreat.normalize().dot(coverToCombatant.normalize());

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

    const gridSize = 12;
    const step = (searchRadius * 2) / gridSize;

    for (let x = -searchRadius; x <= searchRadius; x += step) {
      for (let z = -searchRadius; z <= searchRadius; z += step) {
        const samplePos = new THREE.Vector3(
          position.x + x,
          0,
          position.z + z
        );

        const distance = position.distanceTo(samplePos);
        if (distance > searchRadius || distance < 3) continue;

        const localHeight = this.chunkManager.getHeightAt(samplePos.x, samplePos.z);
        const surroundingHeights = [
          this.chunkManager.getHeightAt(samplePos.x + 2, samplePos.z),
          this.chunkManager.getHeightAt(samplePos.x - 2, samplePos.z),
          this.chunkManager.getHeightAt(samplePos.x, samplePos.z + 2),
          this.chunkManager.getHeightAt(samplePos.x, samplePos.z - 2)
        ];

        const avgHeight = surroundingHeights.reduce((a, b) => a + b, 0) / surroundingHeights.length;
        const heightVariation = Math.abs(localHeight - avgHeight);

        const hasHeightVariation = heightVariation > 0.8;
        const isElevated = localHeight > position.y + MIN_COVER_HEIGHT;

        if (hasHeightVariation || isElevated) {
          const threatToVeg = new THREE.Vector3()
            .subVectors(samplePos, threatPosition)
            .normalize();

          const coverPos = samplePos.clone().add(
            threatToVeg.multiplyScalar(VEGETATION_COVER_DISTANCE)
          );
          coverPos.y = this.chunkManager.getHeightAt(coverPos.x, coverPos.z);

          const coverToSample = new THREE.Vector3()
            .subVectors(samplePos, coverPos);
          const coverToThreat = new THREE.Vector3()
            .subVectors(threatPosition, coverPos);

          const dotProduct = coverToSample.normalize().dot(coverToThreat.normalize());
          if (dotProduct > 0.5) {
            coverPositions.push(coverPos);
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

    const threatToCover = new THREE.Vector3()
      .subVectors(coverPos, threatPos)
      .normalize();

    const distance = coverPos.distanceTo(threatPos);

    const threatEyePos = threatPos.clone();
    threatEyePos.y += 1.7;

    const coverEyePos = coverPos.clone();
    coverEyePos.y += 1.7;

    const direction = new THREE.Vector3()
      .subVectors(coverEyePos, threatEyePos)
      .normalize();

    const terrainHit = this.chunkManager.raycastTerrain(threatEyePos, direction, distance);

    return terrainHit.hit && terrainHit.distance! < distance - 1;
  }

  private isSandbagCover(
    coverPos: THREE.Vector3,
    sandbagCenter: THREE.Vector3,
    sandbagBounds: THREE.Box3,
    threatPos: THREE.Vector3
  ): boolean {
    const threatToSandbag = new THREE.Vector3()
      .subVectors(sandbagCenter, threatPos);
    const threatToCover = new THREE.Vector3()
      .subVectors(coverPos, threatPos);

    if (threatToCover.length() < threatToSandbag.length()) {
      return false;
    }

    const distance = coverPos.distanceTo(threatPos);

    const threatEyePos = threatPos.clone();
    threatEyePos.y += 1.7;

    const coverEyePos = coverPos.clone();
    coverEyePos.y += 1.7;

    const direction = new THREE.Vector3()
      .subVectors(coverEyePos, threatEyePos)
      .normalize();

    const ray = new THREE.Ray(threatEyePos, direction);

    const intersection = ray.intersectBox(sandbagBounds, new THREE.Vector3());

    if (intersection && threatEyePos.distanceTo(intersection) < distance - 0.5) {
      return true;
    }

    return false;
  }
}
