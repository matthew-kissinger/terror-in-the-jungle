import * as THREE from 'three';
import type { LOSAccelerator } from '../combat/LOSAccelerator';
import { getHeightQueryCache } from './HeightQueryCache';

// Scratch vectors (zero allocation per call)
const _queryPos = new THREE.Vector3();
const _rayTarget = new THREE.Vector3();

/**
 * Terrain query facade. Replaces ChunkTerrainQueries.
 * All height queries delegate to HeightQueryCache (always available, no chunk lookup needed).
 * Raycasting uses LOSAccelerator with near-field BVH mesh.
 */
export class TerrainQueries {
  private losAccelerator: LOSAccelerator;
  private collisionObjects: Map<string, THREE.Object3D> = new Map();

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

    for (const [, obj] of this.collisionObjects) {
      if (!obj.visible) continue;
      const box = new THREE.Box3().setFromObject(obj);

      if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z) {
        height = Math.max(height, box.max.y);
      }
    }

    return height;
  }

  /**
   * Check collision with registered objects.
   */
  checkObjectCollision(position: THREE.Vector3, radius = 0.5): boolean {
    for (const [, obj] of this.collisionObjects) {
      if (!obj.visible) continue;
      const box = new THREE.Box3().setFromObject(obj);
      box.expandByScalar(radius);
      if (box.containsPoint(position)) return true;
    }
    return false;
  }

  /**
   * Register a collision object for height/collision queries.
   */
  registerCollisionObject(id: string, object: THREE.Object3D): void {
    this.collisionObjects.set(id, object);
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
}
