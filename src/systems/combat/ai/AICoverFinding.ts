import * as THREE from 'three';
import { Combatant } from '../types';
import { ImprovedChunkManager } from '../../terrain/ImprovedChunkManager';
import { SandbagSystem } from '../../weapons/SandbagSystem';
import { getHeightQueryCache } from '../../terrain/HeightQueryCache';

// Module-level scratch vectors for cover finding
const _sandbagCenter = new THREE.Vector3();
const _threatToSandbag = new THREE.Vector3();
const _coverPos = new THREE.Vector3();
const _coverToSample = new THREE.Vector3();
const _coverToThreat = new THREE.Vector3();
const _toThreat = new THREE.Vector3();
const _toCombatant = new THREE.Vector3();
const _testPos = new THREE.Vector3();
const _threatEyePos = new THREE.Vector3();
const _coverEyePos = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _threatToCover = new THREE.Vector3();
const _intersection = new THREE.Vector3();
const _coverToThreatCheck = new THREE.Vector3();
const _coverToCombatant = new THREE.Vector3();
const _ray = new THREE.Ray();

/**
 * Handles cover finding and cover viability checks
 */
export class AICoverFinding {
  private chunkManager?: ImprovedChunkManager;
  private sandbagSystem?: SandbagSystem;

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.sandbagSystem = sandbagSystem;
  }

  /**
   * Determine if a combatant should seek cover
   */
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

  /**
   * Find the nearest viable cover position (checks sandbags, vegetation, and terrain)
   */
  findNearestCover(combatant: Combatant, threatPosition: THREE.Vector3): THREE.Vector3 | null {
    const MAX_SEARCH_RADIUS = 30;
    const MAX_SEARCH_RADIUS_SQ = MAX_SEARCH_RADIUS * MAX_SEARCH_RADIUS;
    const SEARCH_SAMPLES = 16;
    const SANDBAG_PREFERRED_DISTANCE = 15;
    let bestCoverPos: THREE.Vector3 | null = null;
    let bestCoverScore = -Infinity;

    // Check sandbags first
    if (this.sandbagSystem) {
      const sandbagBounds = this.sandbagSystem.getSandbagBounds();

      for (const bounds of sandbagBounds) {
        bounds.getCenter(_sandbagCenter);

        const distanceToSandbagSq = combatant.position.distanceToSquared(_sandbagCenter);

        if (distanceToSandbagSq > MAX_SEARCH_RADIUS_SQ) continue;

        _threatToSandbag.subVectors(_sandbagCenter, threatPosition).normalize();

        _coverPos.copy(_sandbagCenter).addScaledVector(_threatToSandbag, 2);

        if (this.isSandbagCover(_coverPos, _sandbagCenter, bounds, threatPosition)) {
          const distanceToCombatantSq = combatant.position.distanceToSquared(_coverPos);
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
            bestCoverPos = _coverPos.clone();
          }
        }
      }
    }

    // Check vegetation cover
    if (this.chunkManager) {
      const vegetationCover = this.findVegetationCover(combatant.position, threatPosition, MAX_SEARCH_RADIUS);

      for (const vegPos of vegetationCover) {
        const distanceToCombatantSq = combatant.position.distanceToSquared(vegPos);
        const distanceToCombatant = Math.sqrt(distanceToCombatantSq);
        const distanceToThreatSq = vegPos.distanceToSquared(threatPosition);

        _toThreat.subVectors(threatPosition, vegPos).normalize();
        _toCombatant.subVectors(combatant.position, vegPos).normalize();
        const flankingAngle = Math.abs(_toThreat.dot(_toCombatant));
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

    // Check terrain cover
    if (this.chunkManager) {
      for (let i = 0; i < SEARCH_SAMPLES; i++) {
        const angle = (i / SEARCH_SAMPLES) * Math.PI * 2;

        for (const radius of [10, 20, 30]) {
          _testPos.set(
            combatant.position.x + Math.cos(angle) * radius,
            0,
            combatant.position.z + Math.sin(angle) * radius
          );

          const terrainHeight = getHeightQueryCache().getHeightAt(_testPos.x, _testPos.z);
          _testPos.y = terrainHeight;

          if (this.isPositionCover(_testPos, combatant.position, threatPosition)) {
            const distanceToCombatantSq = combatant.position.distanceToSquared(_testPos);
            const heightDifference = Math.abs(_testPos.y - combatant.position.y);

            const score = (1 / (Math.sqrt(distanceToCombatantSq) + 1)) * heightDifference;

            if (score > bestCoverScore) {
              bestCoverScore = score;
              bestCoverPos = _testPos.clone();
            }
          }
        }
      }
    }

    return bestCoverPos;
  }

  /**
   * Check if current cover is flanked by the threat
   */
  isCoverFlanked(combatant: Combatant, threatPos: THREE.Vector3): boolean {
    if (!combatant.coverPosition) return true;

    _coverToThreatCheck.subVectors(threatPos, combatant.coverPosition).normalize();

    _coverToCombatant.subVectors(combatant.position, combatant.coverPosition).normalize();

    const dotProduct = _coverToThreatCheck.dot(_coverToCombatant);

    return dotProduct > 0.3;
  }

  // Private methods

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
        const samplePos = _testPos;
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
          const threatToVeg = _toThreat;
          threatToVeg.subVectors(samplePos, threatPosition).normalize();

          const coverPos = _coverPos;
          coverPos.copy(samplePos).addScaledVector(threatToVeg, VEGETATION_COVER_DISTANCE);
          coverPos.y = getHeightQueryCache().getHeightAt(coverPos.x, coverPos.z);

          _coverToSample.subVectors(samplePos, coverPos).normalize();
          _coverToThreat.subVectors(threatPosition, coverPos).normalize();

          const dotProduct = _coverToSample.dot(_coverToThreat);
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

    _threatEyePos.copy(threatPos);
    _threatEyePos.y += 1.7;

    _coverEyePos.copy(coverPos);
    _coverEyePos.y += 1.7;

    _direction.subVectors(_coverEyePos, _threatEyePos).normalize();

    const terrainHit = this.chunkManager.raycastTerrain(_threatEyePos, _direction, distance);

    return terrainHit.hit && terrainHit.distance! < distance - 1;
  }

  private isSandbagCover(
    coverPos: THREE.Vector3,
    sandbagCenter: THREE.Vector3,
    sandbagBounds: THREE.Box3,
    threatPos: THREE.Vector3
  ): boolean {
    _threatToSandbag.subVectors(sandbagCenter, threatPos);
    _threatToCover.subVectors(coverPos, threatPos);

    if (_threatToCover.lengthSq() < _threatToSandbag.lengthSq()) {
      return false;
    }

    const distance = coverPos.distanceTo(threatPos);

    _threatEyePos.copy(threatPos);
    _threatEyePos.y += 1.7;

    _coverEyePos.copy(coverPos);
    _coverEyePos.y += 1.7;

    _direction.subVectors(_coverEyePos, _threatEyePos).normalize();

    _ray.set(_threatEyePos, _direction);

    const intersection = _ray.intersectBox(sandbagBounds, _intersection);

    if (intersection && _threatEyePos.distanceTo(intersection) < distance - 0.5) {
      return true;
    }

    return false;
  }
}
