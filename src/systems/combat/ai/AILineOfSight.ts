import * as THREE from 'three';
import { Combatant } from '../types';
import { ImprovedChunkManager } from '../../terrain/ImprovedChunkManager';
import { SandbagSystem } from '../../weapons/SandbagSystem';
import { SmokeCloudSystem } from '../../effects/SmokeCloudSystem';
import { tryConsumeRaycast } from './RaycastBudget';

// Module-level scratch vectors for LOS checks
const _toTarget = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _eyePos = new THREE.Vector3();
const _targetEyePos = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _intersection = new THREE.Vector3();
const _ray = new THREE.Ray();

/** Cache entry for LOS results */
interface LOSCacheEntry {
  result: boolean;
  timestamp: number;
}

/** Cache TTL in milliseconds - combatants don't teleport */
const LOS_CACHE_TTL_MS = 150;

/**
 * Handles line-of-sight and visibility checks
 */
export class AILineOfSight {
  private chunkManager?: ImprovedChunkManager;
  private sandbagSystem?: SandbagSystem;
  private smokeCloudSystem?: SmokeCloudSystem;

  // LOS result cache: avoids redundant raycasts for the same combatant pair
  private losCache: Map<string, LOSCacheEntry> = new Map();

  // Profiling counters
  static cacheHits = 0;
  static cacheMisses = 0;
  static budgetDenials = 0;

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
  }

  setSandbagSystem(sandbagSystem: SandbagSystem): void {
    this.sandbagSystem = sandbagSystem;
  }

  setSmokeCloudSystem(smokeCloudSystem: SmokeCloudSystem): void {
    this.smokeCloudSystem = smokeCloudSystem;
  }

  /**
   * Clear stale entries from the LOS cache.
   * Call once per frame to keep memory bounded.
   */
  clearCache(): void {
    const now = performance.now();
    // Only do full sweep if cache is getting large
    if (this.losCache.size > 200) {
      this.losCache.forEach((entry, key) => {
        if (now - entry.timestamp > LOS_CACHE_TTL_MS) {
          this.losCache.delete(key);
        }
      });
    }
  }

  /**
   * Get profiling stats for the LOS cache.
   */
  static getCacheStats(): { hits: number; misses: number; hitRate: number; budgetDenials: number } {
    const total = AILineOfSight.cacheHits + AILineOfSight.cacheMisses;
    return {
      hits: AILineOfSight.cacheHits,
      misses: AILineOfSight.cacheMisses,
      hitRate: total > 0 ? AILineOfSight.cacheHits / total : 0,
      budgetDenials: AILineOfSight.budgetDenials,
    };
  }

  /**
   * Reset profiling counters.
   */
  static resetStats(): void {
    AILineOfSight.cacheHits = 0;
    AILineOfSight.cacheMisses = 0;
    AILineOfSight.budgetDenials = 0;
  }

  /**
   * Check if a combatant can see the target (FOV + LOS checks)
   */
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

    // FOV check (cheap - always do this before cache lookup)
    _toTarget.subVectors(targetPos, combatant.position).divideScalar(distance || 1);

    _forward.set(
      Math.cos(combatant.rotation),
      0,
      Math.sin(combatant.rotation)
    );

    const dot = _forward.dot(_toTarget);
    const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
    const halfFov = THREE.MathUtils.degToRad(combatant.skillProfile.fieldOfView / 2);

    if (angle > halfFov) {
      return false;
    }

    // --- LOS Cache check (for the expensive raycast portion) ---
    const cacheKey = `${combatant.id}_${target.id}`;
    const now = performance.now();
    const cached = this.losCache.get(cacheKey);

    if (cached && (now - cached.timestamp) < LOS_CACHE_TTL_MS) {
      AILineOfSight.cacheHits++;
      return cached.result;
    }

    AILineOfSight.cacheMisses++;

    // --- Raycast budget gate ---
    // Terrain and sandbag checks are the expensive part.
    // If budget is exhausted, return conservative default (can't see).
    const needsTerrainRaycast = this.chunkManager && combatant.lodLevel &&
      (combatant.lodLevel === 'high' || combatant.lodLevel === 'medium');

    if (needsTerrainRaycast) {
      if (!tryConsumeRaycast()) {
        AILineOfSight.budgetDenials++;
        // Budget exhausted: return last cached result if available, otherwise conservative false
        if (cached) {
          return cached.result;
        }
        return false;
      }
    }

    // --- Full LOS evaluation ---
    const result = this.evaluateFullLOS(combatant, targetPos, distance);

    // Store in cache
    this.losCache.set(cacheKey, { result, timestamp: now });

    return result;
  }

  /**
   * Perform the full (expensive) LOS evaluation: terrain, sandbag, smoke checks.
   */
  private evaluateFullLOS(
    combatant: Combatant,
    targetPos: THREE.Vector3,
    distance: number
  ): boolean {
    // Terrain LOS check (high/medium LOD only)
    if (this.chunkManager && combatant.lodLevel &&
        (combatant.lodLevel === 'high' || combatant.lodLevel === 'medium')) {

      _eyePos.copy(combatant.position);
      _eyePos.y += 1.7;

      _targetEyePos.copy(targetPos);
      _targetEyePos.y += 1.7;

      _direction.subVectors(_targetEyePos, _eyePos).normalize();

      const terrainHit = this.chunkManager.raycastTerrain(_eyePos, _direction, distance);

      if (terrainHit.hit && terrainHit.distance! < distance - 1) {
        return false;
      }
    }

    // Sandbag LOS check
    if (this.sandbagSystem) {
      _eyePos.copy(combatant.position);
      _eyePos.y += 1.7;

      _targetEyePos.copy(targetPos);
      _targetEyePos.y += 1.7;

      _direction.subVectors(_targetEyePos, _eyePos).normalize();

      _ray.set(_eyePos, _direction);
      const sandbagBounds = this.sandbagSystem.getSandbagBounds();

      for (const bounds of sandbagBounds) {
        const intersection = _ray.intersectBox(bounds, _intersection);
        if (intersection && _eyePos.distanceTo(intersection) < distance) {
          return false;
        }
      }
    }

    // Smoke cloud LOS check
    if (this.smokeCloudSystem) {
      // Use already-computed eye positions from above checks
      // If not computed yet (low LOD), compute them now
      if (!combatant.lodLevel || (combatant.lodLevel !== 'high' && combatant.lodLevel !== 'medium')) {
        _eyePos.copy(combatant.position);
        _eyePos.y += 1.7;

        _targetEyePos.copy(targetPos);
        _targetEyePos.y += 1.7;
      }

      if (this.smokeCloudSystem.isLineBlocked(_eyePos, _targetEyePos)) {
        return false;
      }
    }

    return true;
  }
}
