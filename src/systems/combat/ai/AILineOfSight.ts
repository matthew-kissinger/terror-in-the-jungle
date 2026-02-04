import * as THREE from 'three';
import { Combatant } from '../types';
import { ImprovedChunkManager } from '../../terrain/ImprovedChunkManager';
import { SandbagSystem } from '../../weapons/SandbagSystem';
import { SmokeCloudSystem } from '../../effects/SmokeCloudSystem';

// Module-level scratch vectors for LOS checks
const _toTarget = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _eyePos = new THREE.Vector3();
const _targetEyePos = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _intersection = new THREE.Vector3();
const _ray = new THREE.Ray();

/**
 * Handles line-of-sight and visibility checks
 */
export class AILineOfSight {
  private chunkManager?: ImprovedChunkManager;
  private sandbagSystem?: SandbagSystem;
  private smokeCloudSystem?: SmokeCloudSystem;

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

    // FOV check
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
