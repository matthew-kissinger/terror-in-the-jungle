import * as THREE from 'three';
import { Combatant, ITargetable } from '../types';
import type { ITerrainRuntime } from '../../../types/SystemInterfaces';
import { SandbagSystem } from '../../weapons/SandbagSystem';
import { SmokeCloudSystem } from '../../effects/SmokeCloudSystem';
import { tryConsumeRaycast } from './RaycastBudget';
import { copyActorEyePosition } from '../CombatantBodyMetrics';

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
  private terrainSystem?: ITerrainRuntime;
  private sandbagSystem?: SandbagSystem;
  private smokeCloudSystem?: SmokeCloudSystem;

  // LOS result cache: avoids redundant raycasts for the same combatant pair
  private losCache: Map<string, LOSCacheEntry> = new Map();

  // Profiling counters
  static cacheHits = 0;
  static cacheMisses = 0;
  static budgetDenials = 0;
  static prefilterPasses = 0;
  static prefilterRejects = 0;
  static fullEvaluations = 0;
  static terrainRaycasts = 0;
  static fullEvaluationClear = 0;
  static fullEvaluationBlocked = 0;

  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
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
  static getCacheStats(): {
    hits: number;
    misses: number;
      hitRate: number;
      budgetDenials: number;
      prefilterPasses: number;
      prefilterRejects: number;
      fullEvaluations: number;
      terrainRaycasts: number;
      fullEvaluationClear: number;
      fullEvaluationBlocked: number;
  } {
    const total = AILineOfSight.cacheHits + AILineOfSight.cacheMisses;
    return {
      hits: AILineOfSight.cacheHits,
      misses: AILineOfSight.cacheMisses,
      hitRate: total > 0 ? AILineOfSight.cacheHits / total : 0,
      budgetDenials: AILineOfSight.budgetDenials,
      prefilterPasses: AILineOfSight.prefilterPasses,
      prefilterRejects: AILineOfSight.prefilterRejects,
      fullEvaluations: AILineOfSight.fullEvaluations,
      terrainRaycasts: AILineOfSight.terrainRaycasts,
      fullEvaluationClear: AILineOfSight.fullEvaluationClear,
      fullEvaluationBlocked: AILineOfSight.fullEvaluationBlocked,
    };
  }

  /**
   * Reset profiling counters.
   */
  static resetStats(): void {
    AILineOfSight.cacheHits = 0;
    AILineOfSight.cacheMisses = 0;
    AILineOfSight.budgetDenials = 0;
    AILineOfSight.prefilterPasses = 0;
    AILineOfSight.prefilterRejects = 0;
    AILineOfSight.fullEvaluations = 0;
    AILineOfSight.terrainRaycasts = 0;
    AILineOfSight.fullEvaluationClear = 0;
    AILineOfSight.fullEvaluationBlocked = 0;
  }

  /**
   * Check if a combatant can see the target (FOV + LOS checks)
   */
  canSeeTarget(
    combatant: Combatant,
    target: ITargetable,
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

    // Cheap substitution for many expensive LOS raycasts:
    // sample terrain heightfield along the sight segment and reject clearly occluded pairs.
    if (this.isHeightfieldPrefilterEnabled() && this.terrainSystem) {
      const blocked = this.isBlockedByHeightfield(combatant, targetPos, distance);
      if (blocked) {
        AILineOfSight.prefilterRejects++;
        this.losCache.set(cacheKey, { result: false, timestamp: now });
        return false;
      }
      AILineOfSight.prefilterPasses++;
    }

    // --- Raycast budget gate ---
    // Terrain and sandbag checks are the expensive part.
    // If budget is exhausted, return conservative default (can't see).
    const needsTerrainRaycast = this.terrainSystem && combatant.lodLevel &&
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
    AILineOfSight.fullEvaluations++;
    const result = this.evaluateFullLOS(combatant, targetPos, distance);
    if (result) {
      AILineOfSight.fullEvaluationClear++;
    } else {
      AILineOfSight.fullEvaluationBlocked++;
    }

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
    copyActorEyePosition(_eyePos, combatant.position);
    copyActorEyePosition(_targetEyePos, targetPos);

    // Terrain LOS check (high/medium LOD only)
    if (this.terrainSystem && combatant.lodLevel &&
        (combatant.lodLevel === 'high' || combatant.lodLevel === 'medium')) {
      _direction.subVectors(_targetEyePos, _eyePos).normalize();
      AILineOfSight.terrainRaycasts++;

      const terrainHit = this.terrainSystem.raycastTerrain(_eyePos, _direction, distance);

      if (terrainHit.hit && terrainHit.distance! < distance - 1) {
        return false;
      }
    }

    // Sandbag LOS check
    if (this.sandbagSystem) {
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
      if (this.smokeCloudSystem.isLineBlocked(_eyePos, _targetEyePos)) {
        return false;
      }
    }

    return true;
  }

  private isHeightfieldPrefilterEnabled(): boolean {
    const fromGlobal = (globalThis as any).__LOS_HEIGHTFIELD_PREFILTER__;
    if (typeof fromGlobal === 'boolean') return fromGlobal;
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('losHeightPrefilter');
      return raw === '1' || raw === 'true';
    } catch {
      return false;
    }
  }

  private isBlockedByHeightfield(combatant: Combatant, targetPos: THREE.Vector3, distance: number): boolean {
    if (!this.terrainSystem || distance < 35 || distance > 220) return false;

    copyActorEyePosition(_eyePos, combatant.position);
    copyActorEyePosition(_targetEyePos, targetPos);

    const samples = Math.min(6, Math.max(2, Math.floor(distance / 20)));
    let blockingSamples = 0;
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      const sampleX = _eyePos.x + (_targetEyePos.x - _eyePos.x) * t;
      const sampleZ = _eyePos.z + (_targetEyePos.z - _eyePos.z) * t;
      const lineY = _eyePos.y + (_targetEyePos.y - _eyePos.y) * t;
      const terrainY = Number(this.terrainSystem.getEffectiveHeightAt(sampleX, sampleZ));
      if (!Number.isFinite(terrainY)) continue;
      if (terrainY > lineY + 1.2) {
        blockingSamples++;
        if (blockingSamples >= 2) {
          return true;
        }
      }
    }
    return false;
  }
}
