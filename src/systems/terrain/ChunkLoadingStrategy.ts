import * as THREE from 'three';
import { ImprovedChunk } from './ImprovedChunk';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { AssetLoader } from '../assets/AssetLoader';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { LOSAccelerator } from '../combat/LOSAccelerator';
import { ChunkWorkerPool } from './ChunkWorkerPool';
import { ViteBVHWorker } from '../../workers/BVHWorker';
import { Logger } from '../../utils/Logger';
import { ChunkLifecycleConfig } from './ChunkLifecycleTypes';
import { getChunkDistanceFromPlayer, getChunkKey } from './ChunkSpatialUtils';

interface ChunkLoadingStrategyDeps {
  scene: THREE.Scene;
  assetLoader: AssetLoader;
  globalBillboardSystem: GlobalBillboardSystem;
  noiseGenerator: NoiseGenerator;
  losAccelerator: LOSAccelerator;
  workerPool: ChunkWorkerPool | null;
  bvhWorker: ViteBVHWorker | null;
  chunks: Map<string, ImprovedChunk>;
  loadingChunks: Set<string>;
  playerPosition: THREE.Vector3;
  getConfig: () => ChunkLifecycleConfig;
  updateMergedMeshes: () => void;
}

export class ChunkLoadingStrategy {
  private scene: THREE.Scene;
  private assetLoader: AssetLoader;
  private globalBillboardSystem: GlobalBillboardSystem;
  private noiseGenerator: NoiseGenerator;
  private losAccelerator: LOSAccelerator;
  private workerPool: ChunkWorkerPool | null;
  private bvhWorker: ViteBVHWorker | null;
  private chunks: Map<string, ImprovedChunk>;
  private loadingChunks: Set<string>;
  private playerPosition: THREE.Vector3;
  private getConfig: () => ChunkLifecycleConfig;
  private updateMergedMeshes: () => void;

  constructor(deps: ChunkLoadingStrategyDeps) {
    this.scene = deps.scene;
    this.assetLoader = deps.assetLoader;
    this.globalBillboardSystem = deps.globalBillboardSystem;
    this.noiseGenerator = deps.noiseGenerator;
    this.losAccelerator = deps.losAccelerator;
    this.workerPool = deps.workerPool;
    this.bvhWorker = deps.bvhWorker;
    this.chunks = deps.chunks;
    this.loadingChunks = deps.loadingChunks;
    this.playerPosition = deps.playerPosition;
    this.getConfig = deps.getConfig;
    this.updateMergedMeshes = deps.updateMergedMeshes;
  }

  /**
   * Load chunk asynchronously
   */
  async loadChunkAsync(chunkX: number, chunkZ: number): Promise<void> {
    const chunkKey = getChunkKey(chunkX, chunkZ);

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

    const priority = getChunkDistanceFromPlayer(
      this.playerPosition,
      chunkX,
      chunkZ,
      this.getConfig().size
    );

    try {
      // Request geometry from worker pool
      const result = await this.workerPool.generateChunk(
        chunkX,
        chunkZ,
        this.getConfig().size,
        priority
      );

      // Check if still needed (player might have moved)
      const currentDistance = getChunkDistanceFromPlayer(
        this.playerPosition,
        chunkX,
        chunkZ,
        this.getConfig().size
      );
      if (currentDistance > this.getConfig().loadDistance) {
        result.geometry.dispose();
        Logger.debug('chunks', `Disposed unneeded worker chunk (${chunkX}, ${chunkZ})`);
        return;
      }

      // Compute BVH in worker (off main thread) if BVH worker available
      let bvhComputed = false;
      if (this.bvhWorker && !this.getConfig().skipTerrainMesh) {
        try {
          const bvh = await this.bvhWorker.generate(result.geometry, {});
          (result.geometry as any).boundsTree = bvh;
          bvhComputed = true;
          Logger.debug('chunks', `BVH computed in worker for chunk (${chunkX}, ${chunkZ})`);
        } catch (_bvhError) {
          Logger.warn('chunks', `BVH worker failed for chunk (${chunkX}, ${chunkZ}), will compute on main thread`);
        }
      }

      // Create chunk and populate with worker data
      const chunk = new ImprovedChunk(
        this.scene,
        this.assetLoader,
        chunkX,
        chunkZ,
        this.getConfig().size,
        this.noiseGenerator,
        this.globalBillboardSystem,
        this.getConfig().skipTerrainMesh ?? false
      );

      // Use worker-generated geometry, height data, and vegetation
      // Pass bvhComputed flag to skip redundant BVH computation
      await chunk.generateFromWorker(result.geometry, result.heightData, result.vegetation, bvhComputed);

      this.chunks.set(chunkKey, chunk);

      // Register chunk terrain mesh with LOS accelerator (if not skipped)
      if (!this.getConfig().skipTerrainMesh) {
        const terrainMesh = chunk.getTerrainMesh();
        if (terrainMesh) {
          this.losAccelerator.registerChunk(chunkKey, terrainMesh);
        }
      }

      Logger.debug('chunks', `Worker loaded chunk (${chunkX}, ${chunkZ})`);

      // Trigger mesh merge update
      this.updateMergedMeshes();
    } catch (error) {
      Logger.error('chunks', ` Worker failed for chunk (${chunkX}, ${chunkZ}):`, error);
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
        const config = this.getConfig();
        const chunk = new ImprovedChunk(
          this.scene,
          this.assetLoader,
          chunkX,
          chunkZ,
          config.size,
          this.noiseGenerator,
          this.globalBillboardSystem,
          config.skipTerrainMesh ?? false
        );

        await chunk.generate();
        const currentDistance = getChunkDistanceFromPlayer(
          this.playerPosition,
          chunkX,
          chunkZ,
          config.size
        );

        // Only add if still needed (player might have moved away)
        if (currentDistance <= config.loadDistance) {
          this.chunks.set(chunkKey, chunk);

          // Register chunk terrain mesh with LOS accelerator (if not skipped)
          if (!config.skipTerrainMesh) {
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
        Logger.error('chunks', ` Failed to load chunk (${chunkX}, ${chunkZ}):`, error);
      } finally {
        this.loadingChunks.delete(chunkKey);
      }
    }, 0);
  }
}
