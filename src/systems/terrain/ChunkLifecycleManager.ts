import * as THREE from 'three';
import { ImprovedChunk } from './ImprovedChunk';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { AssetLoader } from '../assets/AssetLoader';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { LOSAccelerator } from '../combat/LOSAccelerator';
import { ChunkWorkerPool, ChunkGeometryResult } from './ChunkWorkerPool';
import { ViteBVHWorker } from '../../workers/BVHWorker';
import { Logger } from '../../utils/Logger';
import { ChunkQueueItem } from './ChunkPriorityManager';
import { TerrainMeshMerger } from './TerrainMeshMerger';
import { performanceTelemetry } from '../debug/PerformanceTelemetry';

export interface ChunkLifecycleConfig {
  size: number;
  loadDistance: number;
  renderDistance: number;
  skipTerrainMesh?: boolean;
  enableMeshMerging?: boolean; // Enable chunk mesh merging for reduced draw calls
}

/**
 * Manages chunk lifecycle: creation, loading, disposal, visibility
 * Handles both worker-based and main-thread chunk generation
 */
export class ChunkLifecycleManager {
  private scene: THREE.Scene;
  private assetLoader: AssetLoader;
  private globalBillboardSystem: GlobalBillboardSystem;
  private config: ChunkLifecycleConfig;
  private noiseGenerator: NoiseGenerator;
  private losAccelerator: LOSAccelerator;
  private workerPool: ChunkWorkerPool | null;
  private bvhWorker: ViteBVHWorker | null;

  // Chunk storage
  private chunks: Map<string, ImprovedChunk> = new Map();
  private loadingChunks: Set<string> = new Set();

  // Player tracking for distance checks
  private playerPosition = new THREE.Vector3();

  // Mesh merging system
  private meshMerger: TerrainMeshMerger | null = null;

  constructor(
    scene: THREE.Scene,
    assetLoader: AssetLoader,
    globalBillboardSystem: GlobalBillboardSystem,
    config: ChunkLifecycleConfig,
    noiseGenerator: NoiseGenerator,
    losAccelerator: LOSAccelerator,
    workerPool: ChunkWorkerPool | null,
    bvhWorker: ViteBVHWorker | null
  ) {
    this.scene = scene;
    this.assetLoader = assetLoader;
    this.globalBillboardSystem = globalBillboardSystem;
    this.config = config;
    this.noiseGenerator = noiseGenerator;
    this.losAccelerator = losAccelerator;
    this.workerPool = workerPool;
    this.bvhWorker = bvhWorker;

    // Initialize mesh merger if enabled
    if (config.enableMeshMerging && !config.skipTerrainMesh) {
      this.meshMerger = new TerrainMeshMerger(scene);
      Logger.info('chunks', 'Terrain mesh merging enabled');
    }
  }

  /**
   * Update player position for distance checks
   */
  updatePlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  /**
   * Load chunk immediately (synchronous, for initial chunks)
   */
  async loadChunkImmediate(chunkX: number, chunkZ: number): Promise<void> {
    const chunkKey = this.getChunkKey(chunkX, chunkZ);
    
    if (this.chunks.has(chunkKey)) return;
    
    try {
      const chunk = new ImprovedChunk(
        this.scene,
        this.assetLoader,
        chunkX,
        chunkZ,
        this.config.size,
        this.noiseGenerator,
        this.globalBillboardSystem,
        this.config.skipTerrainMesh ?? false
      );

      await chunk.generate();
      this.chunks.set(chunkKey, chunk);

      // Register chunk terrain mesh with LOS accelerator (if not skipped)
      if (!this.config.skipTerrainMesh) {
        const terrainMesh = chunk.getTerrainMesh();
        if (terrainMesh) {
          this.losAccelerator.registerChunk(chunkKey, terrainMesh);
        }
      }

      Logger.debug('chunks', `Loaded initial chunk (${chunkX}, ${chunkZ})`);

      // Trigger mesh merge update
      this.updateMergedMeshes();
    } catch (error) {
      console.error(`❌ Failed to load chunk (${chunkX}, ${chunkZ}):`, error);
    }
  }

  /**
   * Load chunks asynchronously from queue items
   */
  async loadChunksAsync(items: ChunkQueueItem[]): Promise<void> {
    for (const item of items) {
      await this.loadChunkAsync(item.x, item.z);
    }
  }

  /**
   * Load chunk asynchronously
   */
  private async loadChunkAsync(chunkX: number, chunkZ: number): Promise<void> {
    const chunkKey = this.getChunkKey(chunkX, chunkZ);

    if (this.chunks.has(chunkKey) || this.loadingChunks.has(chunkKey)) {
      return;
    }

    this.loadingChunks.add(chunkKey);

    // Use web worker if available for parallel terrain generation
    if (this.workerPool) {
      await this.loadChunkWithWorker(chunkX, chunkZ, chunkKey);
    } else {
      // Fallback to main thread generation
      this.loadChunkMainThread(chunkX, chunkZ, chunkKey);
    }
  }

  /**
   * Load chunk using web worker for parallel terrain generation
   */
  private async loadChunkWithWorker(chunkX: number, chunkZ: number, chunkKey: string): Promise<void> {
    if (!this.workerPool) return;

    const priority = this.getChunkDistanceFromPlayer(chunkX, chunkZ);

    try {
      // Request geometry from worker pool
      const result = await this.workerPool.generateChunk(
        chunkX,
        chunkZ,
        this.config.size,
        priority
      );

      // Check if still needed (player might have moved)
      const currentDistance = this.getChunkDistanceFromPlayer(chunkX, chunkZ);
      if (currentDistance > this.config.loadDistance) {
        result.geometry.dispose();
        Logger.debug('chunks', `Disposed unneeded worker chunk (${chunkX}, ${chunkZ})`);
        return;
      }

      // Compute BVH in worker (off main thread) if BVH worker available
      let bvhComputed = false;
      if (this.bvhWorker && !this.config.skipTerrainMesh) {
        try {
          const bvh = await this.bvhWorker.generate(result.geometry, {});
          (result.geometry as any).boundsTree = bvh;
          bvhComputed = true;
          Logger.debug('chunks', `BVH computed in worker for chunk (${chunkX}, ${chunkZ})`);
        } catch (bvhError) {
          Logger.warn('chunks', `BVH worker failed for chunk (${chunkX}, ${chunkZ}), will compute on main thread`);
        }
      }

      // Create chunk and populate with worker data
      const chunk = new ImprovedChunk(
        this.scene,
        this.assetLoader,
        chunkX,
        chunkZ,
        this.config.size,
        this.noiseGenerator,
        this.globalBillboardSystem,
        this.config.skipTerrainMesh ?? false
      );

      // Use worker-generated geometry, height data, and vegetation
      // Pass bvhComputed flag to skip redundant BVH computation
      await chunk.generateFromWorker(result.geometry, result.heightData, result.vegetation, bvhComputed);

      this.chunks.set(chunkKey, chunk);

      // Register chunk terrain mesh with LOS accelerator (if not skipped)
      if (!this.config.skipTerrainMesh) {
        const terrainMesh = chunk.getTerrainMesh();
        if (terrainMesh) {
          this.losAccelerator.registerChunk(chunkKey, terrainMesh);
        }
      }

      Logger.debug('chunks', `Worker loaded chunk (${chunkX}, ${chunkZ})`);

      // Trigger mesh merge update
      this.updateMergedMeshes();
    } catch (error) {
      console.error(`❌ Worker failed for chunk (${chunkX}, ${chunkZ}):`, error);
      // Fall back to main thread
      this.loadChunkMainThread(chunkX, chunkZ, chunkKey);
    } finally {
      this.loadingChunks.delete(chunkKey);
    }
  }

  /**
   * Load chunk on main thread (fallback when workers unavailable)
   */
  private loadChunkMainThread(chunkX: number, chunkZ: number, chunkKey: string): void {
    // Use setTimeout to make it truly async and not block
    setTimeout(async () => {
      try {
        const chunk = new ImprovedChunk(
          this.scene,
          this.assetLoader,
          chunkX,
          chunkZ,
          this.config.size,
          this.noiseGenerator,
          this.globalBillboardSystem,
          this.config.skipTerrainMesh ?? false
        );

        await chunk.generate();
        const currentDistance = this.getChunkDistanceFromPlayer(chunkX, chunkZ);

        // Only add if still needed (player might have moved away)
        if (currentDistance <= this.config.loadDistance) {
          this.chunks.set(chunkKey, chunk);

          // Register chunk terrain mesh with LOS accelerator (if not skipped)
          if (!this.config.skipTerrainMesh) {
            const terrainMesh = chunk.getTerrainMesh();
            if (terrainMesh) {
              this.losAccelerator.registerChunk(chunkKey, terrainMesh);
            }
          }

          Logger.debug('chunks', `Main thread loaded chunk (${chunkX}, ${chunkZ})`);

          // Trigger mesh merge update
          this.updateMergedMeshes();
        } else {
          chunk.dispose();
          Logger.debug('chunks', `Disposed unneeded chunk (${chunkX}, ${chunkZ})`);
        }
      } catch (error) {
        console.error(`❌ Failed to load chunk (${chunkX}, ${chunkZ}):`, error);
      } finally {
        this.loadingChunks.delete(chunkKey);
      }
    }, 0);
  }

  /**
   * Unload chunks beyond load distance
   */
  unloadDistantChunks(shouldUnload: (chunkX: number, chunkZ: number) => boolean): void {
    const chunksToUnload: string[] = [];
    
    this.chunks.forEach((chunk, key) => {
      const [x, z] = key.split(',').map(Number);
      
      if (shouldUnload(x, z)) {
        chunksToUnload.push(key);
      }
    });

    chunksToUnload.forEach(key => {
      const chunk = this.chunks.get(key);
      if (chunk) {
        this.globalBillboardSystem.removeChunkInstances(key);
        this.losAccelerator.unregisterChunk(key);
        chunk.dispose();
        this.chunks.delete(key);
        Logger.debug('chunks', `Unloaded chunk ${key} (remaining=${this.chunks.size - 1})`);
      }
    });

    // Trigger mesh merge update if chunks were unloaded
    if (chunksToUnload.length > 0) {
      this.updateMergedMeshes();
    }
  }

  /**
   * Update chunk visibility and LOD based on distance
   */
  updateChunkVisibility(
    getChunkDistance: (chunkWorldPos: THREE.Vector3, playerPos: THREE.Vector3) => number,
    calculateLOD: (distance: number) => number,
    shouldBeVisible: (distance: number) => boolean
  ): void {
    this.chunks.forEach((chunk) => {
      const distance = getChunkDistance(chunk.getPosition(), this.playerPosition);
      const isVisible = shouldBeVisible(distance);
      const lodLevel = calculateLOD(distance);
      
      chunk.setVisible(isVisible);
      chunk.setLODLevel(lodLevel);
    });
  }

  /**
   * Get chunk at world position
   */
  getChunkAt(worldPos: THREE.Vector3): ImprovedChunk | undefined {
    const chunkCoord = this.worldToChunkCoord(worldPos);
    const key = this.getChunkKey(chunkCoord.x, chunkCoord.y);
    return this.chunks.get(key);
  }

  /**
   * Check if chunk is loaded
   */
  isChunkLoaded(chunkX: number, chunkZ: number): boolean {
    const key = this.getChunkKey(chunkX, chunkZ);
    return this.chunks.has(key);
  }

  /**
   * Get all loaded chunks
   */
  getChunks(): Map<string, ImprovedChunk> {
    return this.chunks;
  }

  /**
   * Get loading chunks set
   */
  getLoadingChunks(): Set<string> {
    return this.loadingChunks;
  }

  /**
   * Get loaded chunk count
   */
  getLoadedChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Get loading count
   */
  getLoadingCount(): number {
    return this.loadingChunks.size;
  }

  /**
   * Update merged terrain meshes (reduces draw calls)
   */
  private updateMergedMeshes(): void {
    if (this.meshMerger) {
      this.meshMerger.updateMergedMeshes(
        this.chunks,
        this.playerPosition,
        this.config.size
      );

      // Update telemetry with latest merger stats
      const stats = this.meshMerger.getStats();
      performanceTelemetry.updateTerrainMergerTelemetry({
        activeRings: stats.activeRings,
        totalChunks: stats.totalChunks,
        pendingMerge: stats.pendingMerge,
        estimatedDrawCallSavings: stats.estimatedDrawCallSavings,
        enabled: true
      });
    } else {
      // Clear telemetry if merger is not enabled
      performanceTelemetry.updateTerrainMergerTelemetry(null);
    }
  }

  /**
   * Get mesh merger stats for debugging
   */
  getMergerStats(): { activeRings: number; totalChunks: number; pendingMerge: boolean; estimatedDrawCallSavings: number } | null {
    return this.meshMerger ? this.meshMerger.getStats() : null;
  }

  /**
   * Dispose all chunks
   */
  dispose(): void {
    this.chunks.forEach(chunk => chunk.dispose());
    this.chunks.clear();
    this.loadingChunks.clear();

    // Dispose mesh merger
    if (this.meshMerger) {
      this.meshMerger.dispose();
      this.meshMerger = null;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ChunkLifecycleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Calculate distance from player to chunk
   */
  private getChunkDistanceFromPlayer(chunkX: number, chunkZ: number): number {
    const playerChunk = this.worldToChunkCoord(this.playerPosition);
    return Math.max(Math.abs(chunkX - playerChunk.x), Math.abs(chunkZ - playerChunk.y));
  }

  /**
   * Convert world position to chunk coordinates
   */
  private worldToChunkCoord(worldPos: THREE.Vector3): THREE.Vector2 {
    return new THREE.Vector2(
      Math.floor(worldPos.x / this.config.size),
      Math.floor(worldPos.z / this.config.size)
    );
  }

  /**
   * Get chunk key from coordinates
   */
  private getChunkKey(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }
}
