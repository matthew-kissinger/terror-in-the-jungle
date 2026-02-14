import * as THREE from 'three';
import { ImprovedChunk } from './ImprovedChunk';
import { LOSAccelerator } from '../combat/LOSAccelerator';
import { getHeightQueryCache } from './HeightQueryCache';
import { Logger } from '../../utils/Logger';

// Module-level scratch vectors for performance (reused across calls)
const _heightBox = new THREE.Box3();
const _heightTestPoint = new THREE.Vector3();
const _heightRaycaster = new THREE.Raycaster();
const _heightRayOrigin = new THREE.Vector3();
const _heightRayDir = new THREE.Vector3(0, -1, 0);
const _collisionBox = new THREE.Box3();
const _raycastTarget = new THREE.Vector3();

/**
 * Manages terrain height queries, collision detection, and raycasting
 * Handles collision object registry and effective height calculations
 */
export class ChunkTerrainQueries {
  private collisionObjects: Map<string, THREE.Object3D> = new Map();
  private losAccelerator: LOSAccelerator;
  private getChunkAt: (worldPos: THREE.Vector3) => ImprovedChunk | undefined;

  constructor(
    losAccelerator: LOSAccelerator,
    getChunkAt: (worldPos: THREE.Vector3) => ImprovedChunk | undefined
  ) {
    this.losAccelerator = losAccelerator;
    this.getChunkAt = getChunkAt;
  }

  /**
   * Register an object for collision detection
   */
  registerCollisionObject(id: string, object: THREE.Object3D): void {
    this.collisionObjects.set(id, object);
    Logger.debug('chunks', `Registered collision object: ${id}`);
  }

  /**
   * Unregister a collision object
   */
  unregisterCollisionObject(id: string): void {
    this.collisionObjects.delete(id);
    Logger.debug('chunks', `Unregistered collision object: ${id}`);
  }

  /**
   * Get height at world position from terrain chunks
   */
  getHeightAt(x: number, z: number): number {
    const chunk = this.getChunkAt(_heightTestPoint.set(x, 0, z));
    if (chunk) {
      return chunk.getHeightAt(x, z);
    }
    // Fallback to HeightQueryCache when chunk not loaded
    return getHeightQueryCache().getHeightAt(x, z);
  }

  /**
   * Get effective height at position, considering both terrain and collision objects
   */
  getEffectiveHeightAt(x: number, z: number): number {
    let maxHeight = this.getHeightAt(x, z);
    const terrainHeight = maxHeight;

    // Check collision objects for higher surfaces
    let objectContributions = 0;
    this.collisionObjects.forEach((object, id) => {
      const objectHeight = this.getObjectHeightAt(object, x, z);
      if (objectHeight > 0) {
        objectContributions++;
        Logger.debug('chunks', `Collision object ${id} height ${objectHeight.toFixed(2)} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
      if (objectHeight > maxHeight) {
        maxHeight = objectHeight;
      }
    });

    if (objectContributions > 0) {
      Logger.debug('chunks', `Height sample (${x.toFixed(1)}, ${z.toFixed(1)}): terrain=${terrainHeight.toFixed(2)} final=${maxHeight.toFixed(2)}`);
    }

    return maxHeight;
  }

  /**
   * Get height of a specific object at given world position
   */
  private getObjectHeightAt(object: THREE.Object3D, x: number, z: number): number {
    // Get object bounding box
    _heightBox.setFromObject(object);

    // Check if X,Z position is within object's horizontal bounds
    _heightTestPoint.set(x, 0, z);

    if (x >= _heightBox.min.x && x <= _heightBox.max.x && z >= _heightBox.min.z && z <= _heightBox.max.z) {
      // Position is within bounds - use raycasting from above to find top surface
      _heightRayOrigin.set(x, _heightBox.max.y + 10, z);
      _heightRaycaster.set(_heightRayOrigin, _heightRayDir);

      const intersects = _heightRaycaster.intersectObject(object, true);
      if (intersects.length > 0) {
        // Return the highest intersection point
        let maxY = -Infinity;
        for (const intersect of intersects) {
          if (intersect.point.y > maxY) {
            maxY = intersect.point.y;
          }
        }
        return maxY;
      }

      // Fallback to bounding box max height if raycasting fails
      return _heightBox.max.y;
    }

    return 0;
  }

  /**
   * Check for collision with objects at given position
   */
  checkObjectCollision(position: THREE.Vector3, radius: number = 0.5): boolean {
    for (const [_id, object] of this.collisionObjects) {
      _collisionBox.setFromObject(object);
      const expandedBox = _collisionBox.expandByScalar(radius);

      if (expandedBox.containsPoint(position)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Raycast against terrain to check for obstructions
   * Now using BVH-accelerated LOS checks for better performance
   * @param origin Starting point of the ray
   * @param direction Direction of the ray (should be normalized)
   * @param maxDistance Maximum distance to check
   * @returns {hit: boolean, point?: THREE.Vector3, distance?: number}
   */
  raycastTerrain(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): {hit: boolean, point?: THREE.Vector3, distance?: number} {
    // Calculate target point from origin and direction
    _raycastTarget
      .copy(direction)
      .multiplyScalar(maxDistance)
      .add(origin);

    // Use BVH-accelerated LOS check
    const result = this.losAccelerator.checkLineOfSight(origin, _raycastTarget, maxDistance);

    if (!result.clear && result.hitPoint && result.distance !== undefined) {
      return {
        hit: true,
        point: result.hitPoint,
        distance: result.distance
      };
    }

    return { hit: false };
  }
}
