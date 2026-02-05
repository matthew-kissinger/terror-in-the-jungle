import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ImprovedChunk } from './ImprovedChunk';
import { Logger } from '../../utils/Logger';
import { performanceTelemetry } from '../debug/PerformanceTelemetry';

/**
 * Merges individual chunk terrain meshes into larger combined meshes by distance rings.
 * Reduces draw calls from ~100-150 (one per chunk) to ~10 (one per ring).
 */
export class TerrainMeshMerger {
  private scene: THREE.Scene;
  private mergedMeshes: Map<number, THREE.Mesh> = new Map();
  private ringAssignments: Map<string, number> = new Map(); // chunkKey -> ring

  private readonly NUM_RINGS = 10; // Number of distance rings
  private readonly MERGE_DEBOUNCE_MS = 500; // Debounce re-merges
  private mergeTimer: number | null = null;
  private pendingMerge = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Update merged meshes based on current loaded chunks
   */
  updateMergedMeshes(
    chunks: Map<string, ImprovedChunk>,
    playerPosition: THREE.Vector3,
    chunkSize: number
  ): void {
    // Clear pending merge and debounce
    if (this.mergeTimer !== null) {
      clearTimeout(this.mergeTimer);
    }

    this.pendingMerge = true;
    this.mergeTimer = window.setTimeout(() => {
      this.performMerge(chunks, playerPosition, chunkSize);
      this.pendingMerge = false;
      this.mergeTimer = null;
    }, this.MERGE_DEBOUNCE_MS);
  }

  /**
   * Perform the actual merge operation
   */
  private performMerge(
    chunks: Map<string, ImprovedChunk>,
    playerPosition: THREE.Vector3,
    chunkSize: number
  ): void {
    const startTime = performance.now();

    // Begin timing for telemetry
    performanceTelemetry.beginSystem('terrain_merger');

    // Group chunks by ring
    const chunksByRing = this.groupChunksByRing(chunks, playerPosition, chunkSize);

    // Track which rings are still active
    const activeRings = new Set<number>();

    // Merge each ring
    chunksByRing.forEach((ringChunks, ring) => {
      activeRings.add(ring);
      this.mergeRing(ring, ringChunks);
    });

    // Dispose rings that are no longer needed
    this.mergedMeshes.forEach((mesh, ring) => {
      if (!activeRings.has(ring)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
        }
        this.mergedMeshes.delete(ring);
        Logger.debug('terrain-merger', `Disposed ring ${ring} merged mesh`);
      }
    });

    // End timing for telemetry
    performanceTelemetry.endSystem('terrain_merger');

    const elapsed = performance.now() - startTime;
    Logger.info('terrain-merger', `Merged ${chunks.size} chunks into ${activeRings.size} rings in ${elapsed.toFixed(2)}ms`);
  }

  /**
   * Group chunks by distance ring from player
   */
  private groupChunksByRing(
    chunks: Map<string, ImprovedChunk>,
    playerPosition: THREE.Vector3,
    chunkSize: number
  ): Map<number, ImprovedChunk[]> {
    const chunksByRing = new Map<number, ImprovedChunk[]>();

    chunks.forEach((chunk, key) => {
      // Calculate distance to player in chunk units
      const chunkPos = chunk.getPosition();
      const dx = Math.abs(chunkPos.x - playerPosition.x) / chunkSize;
      const dz = Math.abs(chunkPos.z - playerPosition.z) / chunkSize;
      const distanceChunks = Math.max(dx, dz);

      // Assign to ring (0 = closest, NUM_RINGS-1 = farthest)
      const ring = Math.min(
        Math.floor((distanceChunks / 8) * this.NUM_RINGS),
        this.NUM_RINGS - 1
      );

      if (!chunksByRing.has(ring)) {
        chunksByRing.set(ring, []);
      }
      chunksByRing.get(ring)!.push(chunk);
      this.ringAssignments.set(key, ring);
    });

    return chunksByRing;
  }

  /**
   * Merge chunks in a single ring into one mesh
   */
  private mergeRing(ring: number, chunks: ImprovedChunk[]): void {
    // Collect geometries and materials from chunks
    const geometries: THREE.BufferGeometry[] = [];
    let sharedMaterial: THREE.Material | null = null;

    for (const chunk of chunks) {
      const terrainMesh = chunk.getTerrainMesh();
      if (!terrainMesh) continue;

      // Clone geometry to avoid modifying original
      const geomClone = terrainMesh.geometry.clone();

      // Apply mesh transform to geometry
      geomClone.applyMatrix4(terrainMesh.matrixWorld);

      geometries.push(geomClone);

      // Use first chunk's material for all (they should be identical)
      if (!sharedMaterial && terrainMesh.material instanceof THREE.Material) {
        sharedMaterial = terrainMesh.material;
      }

      // Hide original mesh (we'll show merged mesh instead)
      terrainMesh.visible = false;
    }

    if (geometries.length === 0) {
      Logger.warn('terrain-merger', `Ring ${ring} has no geometries to merge`);
      return;
    }

    // Merge geometries
    const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries, false);

    // Dispose cloned geometries
    geometries.forEach(g => g.dispose());

    if (!mergedGeometry) {
      Logger.error('terrain-merger', `Failed to merge geometries for ring ${ring}`);
      return;
    }

    // Compute BVH for merged geometry (important for raycasting!)
    mergedGeometry.computeBoundsTree();

    // Create merged mesh
    const mergedMesh = new THREE.Mesh(
      mergedGeometry,
      sharedMaterial || new THREE.MeshLambertMaterial({ color: 0x4a7c59 })
    );
    mergedMesh.name = `terrain_merged_ring_${ring}`;
    mergedMesh.receiveShadow = true;

    // Remove old merged mesh for this ring if it exists
    const oldMesh = this.mergedMeshes.get(ring);
    if (oldMesh) {
      this.scene.remove(oldMesh);
      oldMesh.geometry.dispose();
      // Don't dispose material - it's shared with chunks
    }

    // Add new merged mesh
    this.scene.add(mergedMesh);
    this.mergedMeshes.set(ring, mergedMesh);

    Logger.debug('terrain-merger', `Merged ring ${ring}: ${chunks.length} chunks -> 1 mesh`);
  }

  /**
   * Get stats for debugging
   */
  getStats(): {
    activeRings: number;
    totalChunks: number;
    pendingMerge: boolean;
    estimatedDrawCallSavings: number;
  } {
    const totalChunks = this.ringAssignments.size;
    const activeRings = this.mergedMeshes.size;
    
    // Estimated draw call savings: without merging = 1 draw call per chunk
    // with merging = 1 draw call per ring
    // Savings = chunks - rings (only if merging is active)
    const estimatedDrawCallSavings = activeRings > 0 ? totalChunks - activeRings : 0;
    
    return {
      activeRings,
      totalChunks,
      pendingMerge: this.pendingMerge,
      estimatedDrawCallSavings
    };
  }

  /**
   * Dispose all merged meshes
   */
  dispose(): void {
    if (this.mergeTimer !== null) {
      clearTimeout(this.mergeTimer);
      this.mergeTimer = null;
    }

    this.mergedMeshes.forEach((mesh) => {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      // Don't dispose material - it's shared with chunks
    });

    this.mergedMeshes.clear();
    this.ringAssignments.clear();
    this.pendingMerge = false;
  }
}
