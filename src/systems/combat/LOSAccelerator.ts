import * as THREE from 'three';
import { ImprovedChunk } from '../terrain/ImprovedChunk';
import { Logger } from '../../utils/Logger';

const _losDirection = new THREE.Vector3();
const _rayBox = new THREE.Box3();
const _meshBox = new THREE.Box3();
const _losRaycaster = new THREE.Raycaster();

/**
 * Accelerates line-of-sight checks using BVH-accelerated raycasting
 *
 * Key optimizations:
 * - Caches BVH structures per chunk (already built in ImprovedChunk)
 * - Uses spatial culling to only check relevant chunks
 * - Leverages three-mesh-bvh for fast raycasting
 * - Tracks performance metrics for monitoring
 */
export class LOSAccelerator {
  private chunkCache: Map<string, THREE.Mesh> = new Map();

  // Performance tracking
  private queryCount = 0;
  private totalQueryTime = 0;
  private lastReportTime = 0;
  private readonly REPORT_INTERVAL_MS = 5000;

  /**
   * Register a chunk's terrain mesh for LOS checks
   */
  registerChunk(chunkKey: string, mesh: THREE.Mesh): void {
    this.chunkCache.set(chunkKey, mesh);
    Logger.debug('los', `Registered chunk ${chunkKey} for LOS (total: ${this.chunkCache.size})`);
  }

  /**
   * Unregister a chunk when it's unloaded
   */
  unregisterChunk(chunkKey: string): void {
    this.chunkCache.delete(chunkKey);
    Logger.debug('los', `Unregistered chunk ${chunkKey} (remaining: ${this.chunkCache.size})`);
  }

  /**
   * Check line of sight between two points using BVH-accelerated raycasting
   *
   * @param origin Starting point
   * @param target Target point
   * @param maxDistance Maximum distance to check
   * @returns True if line of sight is clear
   */
  checkLineOfSight(
    origin: THREE.Vector3,
    target: THREE.Vector3,
    maxDistance: number
  ): { clear: boolean; hitPoint?: THREE.Vector3; distance?: number } {
    const startTime = performance.now();

    // Calculate direction and distance
    _losDirection.subVectors(target, origin);
    const distance = _losDirection.length();
    _losDirection.normalize();

    // Early out if target is beyond max distance
    if (distance > maxDistance) {
      this.recordQuery(performance.now() - startTime);
      return { clear: false };
    }

    // Get relevant chunks along the ray path
    const relevantMeshes = this.getRelevantChunks(origin, target);

    if (relevantMeshes.length === 0) {
      this.recordQuery(performance.now() - startTime);
      return { clear: true };
    }

    // Perform raycast using BVH acceleration
    _losRaycaster.set(origin, _losDirection);
    _losRaycaster.far = distance;

    // Raycast against relevant meshes (BVH acceleration happens automatically)
    const intersects = _losRaycaster.intersectObjects(relevantMeshes, false);

    this.recordQuery(performance.now() - startTime);

    if (intersects.length > 0) {
      const hit = intersects[0];
      // Check if hit is between origin and target (with small tolerance)
      if (hit.distance < distance - 0.5) {
        return {
          clear: false,
          hitPoint: hit.point,
          distance: hit.distance
        };
      }
    }

    return { clear: true };
  }

  /**
   * Batch check multiple LOS queries (for future optimization)
   * Can be used to group queries per frame and process efficiently
   */
  batchCheckLineOfSight(
    queries: Array<{ origin: THREE.Vector3; target: THREE.Vector3; maxDistance: number }>
  ): Array<{ clear: boolean; hitPoint?: THREE.Vector3; distance?: number }> {
    return queries.map(q => this.checkLineOfSight(q.origin, q.target, q.maxDistance));
  }

  /**
   * Get chunks that intersect the line segment from origin to target
   * Uses spatial culling to avoid checking distant chunks
   */
  private getRelevantChunks(origin: THREE.Vector3, target: THREE.Vector3): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];

    // Calculate bounding box of the ray
    _rayBox.setFromPoints([origin, target]);
    _rayBox.expandByScalar(2); // Small buffer for edge cases

    // Check each cached chunk
    for (const [key, mesh] of this.chunkCache.entries()) {
      // Get mesh bounding box
      _meshBox.setFromObject(mesh);

      // Only include if ray box intersects chunk box
      if (_rayBox.intersectsBox(_meshBox)) {
        meshes.push(mesh);
      }
    }

    return meshes;
  }

  /**
   * Record query performance and periodically log metrics
   */
  private recordQuery(timeMs: number): void {
    this.queryCount++;
    this.totalQueryTime += timeMs;

    const now = performance.now();
    if (now - this.lastReportTime > this.REPORT_INTERVAL_MS) {
      const avgTime = this.totalQueryTime / this.queryCount;
      Logger.info('los',
        `LOS queries: ${this.queryCount} total, ` +
        `${avgTime.toFixed(3)}ms avg, ` +
        `${this.chunkCache.size} chunks cached`
      );

      // Reset counters
      this.queryCount = 0;
      this.totalQueryTime = 0;
      this.lastReportTime = now;
    }
  }

  /**
   * Get current performance stats (for debugging/monitoring)
   */
  getStats(): { queryCount: number; avgQueryTime: number; cachedChunks: number } {
    return {
      queryCount: this.queryCount,
      avgQueryTime: this.queryCount > 0 ? this.totalQueryTime / this.queryCount : 0,
      cachedChunks: this.chunkCache.size
    };
  }

  /**
   * Clear all cached chunks
   */
  clear(): void {
    this.chunkCache.clear();
    this.queryCount = 0;
    this.totalQueryTime = 0;
    Logger.info('los', 'Cleared LOS accelerator cache');
  }
}
