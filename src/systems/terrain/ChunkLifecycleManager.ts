import * as THREE from 'three';
import { ImprovedChunk } from './ImprovedChunk';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { AssetLoader } from '../assets/AssetLoader';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { LOSAccelerator } from '../combat/LOSAccelerator';
import { ChunkWorkerPool } from './ChunkWorkerPool';
import { ViteBVHWorker } from '../../workers/BVHWorker';
import { Logger } from '../../utils/Logger';
import { ChunkQueueItem } from './ChunkPriorityManager';
import { TerrainMeshMerger } from './TerrainMeshMerger';
import { performanceTelemetry } from '../debug/PerformanceTelemetry';
import { ChunkLoadingStrategy } from './ChunkLoadingStrategy';
import { ChunkLifecycleConfig } from './ChunkLifecycleTypes';
import { getChunkKey, worldToChunkCoord } from './ChunkSpatialUtils';

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
  private loadingStrategy: ChunkLoadingStrategy;

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

    this.loadingStrategy = new ChunkLoadingStrategy({
      scene: this.scene,
      assetLoader: this.assetLoader,
      globalBillboardSystem: this.globalBillboardSystem,
      noiseGenerator: this.noiseGenerator,
      losAccelerator: this.losAccelerator,
      workerPool: this.workerPool,
      bvhWorker: this.bvhWorker,
      chunks: this.chunks,
      loadingChunks: this.loadingChunks,
      playerPosition: this.playerPosition,
      getConfig: () => this.config,
      updateMergedMeshes: () => this.updateMergedMeshes()
    });
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
    const chunkKey = getChunkKey(chunkX, chunkZ);
    
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
      Logger.error('chunks', `Failed to load chunk (${chunkX}, ${chunkZ}):`, error);
    }
  }

  /**
   * Load chunks asynchronously from queue items
   */
  async loadChunksAsync(items: ChunkQueueItem[]): Promise<void> {
    for (const item of items) {
      await this.loadingStrategy.loadChunkAsync(item.x, item.z);
    }
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
    this.chunks.forEach((chunk, key) => {
      const distance = getChunkDistance(chunk.getPosition(), this.playerPosition);
      const lodLevel = calculateLOD(distance);
      chunk.setLODLevel(lodLevel);

      // If this chunk's mesh has been merged, keep the original hidden
      // to avoid double-rendering with the merged mesh
      if (this.meshMerger && this.meshMerger.isChunkMerged(key)) {
        chunk.setVisible(false);
      } else {
        chunk.setVisible(shouldBeVisible(distance));
      }
    });
  }

  /**
   * Get chunk at world position
   */
  getChunkAt(worldPos: THREE.Vector3): ImprovedChunk | undefined {
    const chunkCoord = worldToChunkCoord(worldPos, this.config.size);
    const key = getChunkKey(chunkCoord.x, chunkCoord.y);
    return this.chunks.get(key);
  }

  /**
   * Check if chunk is loaded
   */
  isChunkLoaded(chunkX: number, chunkZ: number): boolean {
    const key = getChunkKey(chunkX, chunkZ);
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
}
