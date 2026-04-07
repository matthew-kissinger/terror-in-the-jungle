import * as THREE from 'three';
import type { LOSAccelerator } from '../combat/LOSAccelerator';
import { getHeightQueryCache } from './HeightQueryCache';

// Scratch vectors (zero allocation per call)
const _queryPos = new THREE.Vector3();
const _rayTarget = new THREE.Vector3();
const _collisionBox = new THREE.Box3();

/**
 * Terrain query facade. Replaces ChunkTerrainQueries.
 * All height queries delegate to HeightQueryCache (always available, no chunk lookup needed).
 * Raycasting uses LOSAccelerator with near-field BVH mesh.
 */
export class TerrainQueries {
  private losAccelerator: LOSAccelerator;
  private collisionObjects: Map<string, {
    object: THREE.Object3D;
    bounds: THREE.Box3;
    dynamic: boolean;
  }> = new Map();

  constructor(losAccelerator: LOSAccelerator) {
    this.losAccelerator = losAccelerator;
  }

  /**
   * Get terrain height at world coordinates.
   */
  getHeightAt(x: number, z: number): number {
    return getHeightQueryCache().getHeightAt(x, z);
  }

  /**
   * Get effective height considering collision objects (e.g. sandbags).
   */
  getEffectiveHeightAt(x: number, z: number): number {
    let height = this.getHeightAt(x, z);

    for (const [, entry] of this.collisionObjects) {
      const obj = entry.object;
      if (!obj.visible) continue;
      const box = this.getCollisionBounds(entry);

      if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z) {
        height = Math.max(height, box.max.y);
      }
    }

    return height;
  }

  getSlopeAt(x: number, z: number): number {
    return getHeightQueryCache().getSlopeAt(x, z);
  }

  getNormalAt(x: number, z: number, target?: THREE.Vector3): THREE.Vector3 {
    const normal = getHeightQueryCache().getNormalAt(x, z);
    return (target ?? _queryPos).copy(normal);
  }

  /**
   * Check collision with registered objects.
   */
  checkObjectCollision(position: THREE.Vector3, radius = 0.5): boolean {
    for (const [, entry] of this.collisionObjects) {
      const obj = entry.object;
      if (!obj.visible) continue;
      _collisionBox.copy(this.getCollisionBounds(entry)).expandByScalar(radius);
      if (_collisionBox.containsPoint(position)) return true;
    }
    return false;
  }

  /**
   * Register a collision object for height/collision queries.
   */
  registerCollisionObject(
    id: string,
    object: THREE.Object3D,
    options?: {
      dynamic?: boolean;
    },
  ): void {
    const entry = {
      object,
      bounds: new THREE.Box3(),
      dynamic: options?.dynamic === true,
    };

    if (!entry.dynamic) {
      object.updateMatrixWorld(true);
      entry.bounds.setFromObject(object);
    }

    this.collisionObjects.set(id, entry);
  }

  /**
   * Unregister a collision object.
   */
  unregisterCollisionObject(id: string): void {
    this.collisionObjects.delete(id);
  }

  /**
   * Raycast against terrain using LOSAccelerator BVH.
   */
  raycastTerrain(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
  ): { hit: boolean; point?: THREE.Vector3; distance?: number } {
    _rayTarget.copy(origin).addScaledVector(direction, maxDistance);
    const result = this.losAccelerator.checkLineOfSight(origin, _rayTarget, maxDistance);

    if (!result.clear && result.hitPoint) {
      return { hit: true, point: result.hitPoint, distance: result.distance };
    }
    return { hit: false };
  }

  /**
   * Get the LOSAccelerator for direct use.
   */
  getLOSAccelerator(): LOSAccelerator {
    return this.losAccelerator;
  }

  dispose(): void {
    this.collisionObjects.clear();
  }

  private getCollisionBounds(entry: {
    object: THREE.Object3D;
    bounds: THREE.Box3;
    dynamic: boolean;
  }): THREE.Box3 {
    if (entry.dynamic) {
      entry.object.updateMatrixWorld(true);
      entry.bounds.setFromObject(entry.object);
    }
    return entry.bounds;
  }
}
