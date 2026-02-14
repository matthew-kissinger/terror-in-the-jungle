import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ImprovedChunk } from './ImprovedChunk';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { AssetLoader } from '../assets/AssetLoader';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import { Logger } from '../../utils/Logger';
import { LOSAccelerator } from '../combat/LOSAccelerator';
import { ChunkWorkerPool } from './ChunkWorkerPool';
import { ViteBVHWorker } from '../../workers/BVHWorker';
import { ChunkPriorityManager } from './ChunkPriorityManager';
import { ChunkLifecycleManager } from './ChunkLifecycleManager';
import { ChunkTerrainQueries } from './ChunkTerrainQueries';
import { ChunkLoadQueueManager } from './ChunkLoadQueueManager';

export interface ChunkConfig {
  size: number;
  renderDistance: number;
  loadDistance: number;
  lodLevels: number;
  skipTerrainMesh?: boolean; // When true, chunks only spawn vegetation (GPU terrain handles visuals)
}

/**
 * Improved ChunkManager with async loading and performance optimizations
 * Orchestrates chunk priority and lifecycle management
 */
export class ImprovedChunkManager implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private assetLoader: AssetLoader;
  private config: ChunkConfig;
  private noiseGenerator: NoiseGenerator;
  private globalBillboardSystem: GlobalBillboardSystem;

  // Sub-managers
  private priorityManager: ChunkPriorityManager;
  private lifecycleManager: ChunkLifecycleManager;
  private terrainQueries: ChunkTerrainQueries;
  private loadQueueManager: ChunkLoadQueueManager;

  // LOS acceleration
  private losAccelerator: LOSAccelerator = new LOSAccelerator();

  // Web worker pool for parallel chunk generation
  private workerPool: ChunkWorkerPool | null = null;
  private bvhWorker: ViteBVHWorker | null = null;
  private readonly USE_WORKERS = true;

  // Player tracking
  private playerPosition = new THREE.Vector3();

  // Adaptive bounds
  private readonly minRenderDistance: number;
  private readonly maxRenderDistance: number;
  
  // Performance settings
  private updateTimer = 0;
  private readonly UPDATE_INTERVAL = 0.25;  // Chunk system update cadence
  private readonly MAX_CHUNKS_PER_FRAME = 1; // Limit ingestion to reduce spikes
  private readonly IN_FRAME_BUDGET_MS = 2.0;
  private readonly IDLE_BUDGET_MS = 6.0;
  private readonly MAX_QUEUE_SIZE = 48;
  private readonly LOAD_DELAY_FALLBACK = 100;

  // Adaptive render distance
  private fpsEma = 60;
  private readonly FPS_EMA_ALPHA = 0.1;
  private lastAdaptTime = performance.now();
  private readonly ADAPT_COOLDOWN_MS = 1500;

  constructor(
    scene: THREE.Scene, 
    camera: THREE.PerspectiveCamera,
    assetLoader: AssetLoader,
    globalBillboardSystem: GlobalBillboardSystem,
    config: ChunkConfig = {
      size: 64,
      renderDistance: 6,  // Visible chunks
      loadDistance: 7,     // Load 1 extra ring beyond visible
      lodLevels: 4        // More LOD levels for gradual quality reduction
    }
  ) {
    this.scene = scene;
    this.camera = camera;
    this.assetLoader = assetLoader;
    this.globalBillboardSystem = globalBillboardSystem;
    this.config = config;
    this.noiseGenerator = new NoiseGenerator(12345);
    this.maxRenderDistance = config.renderDistance;
    this.minRenderDistance = Math.max(3, Math.floor(config.renderDistance / 2));

    // Initialize worker pool for parallel chunk generation
    if (this.USE_WORKERS) {
      try {
        this.workerPool = new ChunkWorkerPool(
          navigator.hardwareConcurrency || 4,
          12345, // Same seed as noiseGenerator
          32     // segments
        );
        Logger.info('chunks', `Worker pool initialized with ${navigator.hardwareConcurrency || 4} workers`);

        // Initialize BVH worker for off-thread collision tree building
        this.bvhWorker = new ViteBVHWorker();
        Logger.info('chunks', 'BVH worker initialized (Vite-compatible)');
      } catch (error) {
        Logger.warn('chunks', `Failed to create worker pool, falling back to main thread: ${error}`);
        this.workerPool = null;
        this.bvhWorker = null;
      }
    }

    // Initialize sub-managers
    this.priorityManager = new ChunkPriorityManager({
      loadDistance: config.loadDistance,
      renderDistance: config.renderDistance,
      maxQueueSize: this.MAX_QUEUE_SIZE,
      chunkSize: config.size
    });

    this.lifecycleManager = new ChunkLifecycleManager(
      scene,
      assetLoader,
      globalBillboardSystem,
      {
        size: config.size,
        loadDistance: config.loadDistance,
        renderDistance: config.renderDistance,
        skipTerrainMesh: config.skipTerrainMesh,
        enableMeshMerging: false // Disabled by default: async merge spikes stall the main thread.
      },
      this.noiseGenerator,
      this.losAccelerator,
      this.workerPool,
      this.bvhWorker
    );

    // Initialize terrain queries manager
    this.terrainQueries = new ChunkTerrainQueries(
      this.losAccelerator,
      (worldPos: THREE.Vector3) => this.lifecycleManager.getChunkAt(worldPos)
    );

    // Initialize load queue manager
    this.loadQueueManager = new ChunkLoadQueueManager(
      this.priorityManager,
      this.lifecycleManager,
      {
        maxChunksPerFrame: this.MAX_CHUNKS_PER_FRAME,
        inFrameBudgetMs: this.IN_FRAME_BUDGET_MS,
        idleBudgetMs: this.IDLE_BUDGET_MS,
        loadDelayFallback: this.LOAD_DELAY_FALLBACK
      }
    );
  }

  async init(): Promise<void> {
    Logger.info('chunks', 'Initializing improved chunk manager');
    const maxChunks = (this.config.loadDistance * 2 + 1) ** 2;
    Logger.debug('chunks', `Config render=${this.config.renderDistance}, load=${this.config.loadDistance}, max=${maxChunks}, size=${this.config.size}`);

    // Keep startup bounded but avoid spawn-hole visuals:
    // sync-load center chunk plus cardinal neighbors (5 chunks total).
    const centerX = Math.floor(this.playerPosition.x / this.config.size);
    const centerZ = Math.floor(this.playerPosition.z / this.config.size);
    const startupCoords: Array<[number, number]> = [
      [centerX, centerZ],
      [centerX + 1, centerZ],
      [centerX - 1, centerZ],
      [centerX, centerZ + 1],
      [centerX, centerZ - 1]
    ];
    for (const [chunkX, chunkZ] of startupCoords) {
      await this.lifecycleManager.loadChunkImmediate(chunkX, chunkZ);
    }

    Logger.info('chunks', `Initial startup chunks generated around (${centerX}, ${centerZ})`);
    this.loadQueueManager.updateLoadQueue();
  }

  update(deltaTime: number): void {
    this.updateTimer += deltaTime;
    // Track FPS EMA
    this.fpsEma = this.fpsEma * (1 - this.FPS_EMA_ALPHA) + (1 / Math.max(0.001, deltaTime)) * this.FPS_EMA_ALPHA;
    // Adapt render distance gradually to maintain stability
    const nowMs = performance.now();
    if (nowMs - this.lastAdaptTime > this.ADAPT_COOLDOWN_MS) {
      if (this.fpsEma < 55 && this.config.renderDistance > this.minRenderDistance) {
        this.setRenderDistance(this.config.renderDistance - 1);
        this.lastAdaptTime = nowMs;
      } else if (this.fpsEma > 65 && this.config.renderDistance < this.maxRenderDistance) {
        this.setRenderDistance(this.config.renderDistance + 1);
        this.lastAdaptTime = nowMs;
      }
    }
    
    if (this.updateTimer >= this.UPDATE_INTERVAL) {
      this.updateTimer = 0;
      
      // Update player position in managers
      this.priorityManager.updatePlayerPosition(this.playerPosition);
      this.lifecycleManager.updatePlayerPosition(this.playerPosition);
      
      // Check if player moved to different chunk
      if (this.priorityManager.hasPlayerMovedChunk()) {
        this.ensurePlayerChunkResident();
        this.loadQueueManager.updateLoadQueue();
      }
      
      // Process load queue gradually within the frame budget
      this.loadQueueManager.drainLoadQueue(this.IN_FRAME_BUDGET_MS, this.MAX_CHUNKS_PER_FRAME);
      
      // Update chunk visibility
      this.updateChunkVisibility();
      
      // Clean up distant chunks
      this.unloadDistantChunks();
    }
  }

  dispose(): void {
    this.loadQueueManager.cancelBackgroundLoader();
    this.lifecycleManager.dispose();
    this.priorityManager.clearQueue();
    this.losAccelerator.clear();

    // Dispose worker pool
    if (this.workerPool) {
      this.workerPool.dispose();
      this.workerPool = null;
    }

    // Dispose BVH worker
    if (this.bvhWorker) {
      this.bvhWorker.dispose();
      this.bvhWorker = null;
    }

    Logger.info('chunks', 'Chunk manager disposed');
  }

  updatePlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
    this.priorityManager.updatePlayerPosition(position);
    this.lifecycleManager.updatePlayerPosition(position);
  }

  private unloadDistantChunks(): void {
    this.lifecycleManager.unloadDistantChunks((chunkX, chunkZ) => {
      return this.priorityManager.shouldChunkBeUnloaded(chunkX, chunkZ);
    });
  }

  private updateChunkVisibility(): void {
    this.lifecycleManager.updateChunkVisibility(
      (chunkWorldPos, playerPos) => this.priorityManager.getChunkDistance(chunkWorldPos, playerPos),
      (distance) => this.priorityManager.calculateLOD(distance),
      (distance) => this.priorityManager.shouldChunkBeVisible(distance)
    );
  }

  private ensurePlayerChunkResident(): void {
    const centerX = Math.floor(this.playerPosition.x / this.config.size);
    const centerZ = Math.floor(this.playerPosition.z / this.config.size);
    const required: Array<[number, number]> = [
      [centerX, centerZ],
      [centerX + 1, centerZ],
      [centerX - 1, centerZ],
      [centerX, centerZ + 1],
      [centerX, centerZ - 1]
    ];

    for (const [chunkX, chunkZ] of required) {
      if (this.lifecycleManager.isChunkLoaded(chunkX, chunkZ)) continue;
      void this.lifecycleManager.loadChunkImmediate(chunkX, chunkZ).catch((error) => {
        Logger.warn('chunks', `Failed immediate ensure-load for chunk (${chunkX}, ${chunkZ}): ${String(error)}`);
      });
    }
  }

  // Public accessors
  getLoadedChunkCount(): number {
    return this.lifecycleManager.getLoadedChunkCount();
  }

  getChunkAt(worldPos: THREE.Vector3): ImprovedChunk | undefined {
    return this.lifecycleManager.getChunkAt(worldPos);
  }

  getHeightAt(x: number, z: number): number {
    return this.terrainQueries.getHeightAt(x, z);
  }

  // IChunkManager implementation
  getTerrainHeightAt(x: number, z: number): number {
    return this.getHeightAt(x, z);
  }

  isChunkLoaded(x: number, z: number): boolean {
    return this.lifecycleManager.isChunkLoaded(x, z);
  }

  /**
   * Register an object for collision detection
   */
  registerCollisionObject(id: string, object: THREE.Object3D): void {
    this.terrainQueries.registerCollisionObject(id, object);
  }

  /**
   * Unregister a collision object
   */
  unregisterCollisionObject(id: string): void {
    this.terrainQueries.unregisterCollisionObject(id);
  }

  /**
   * Get effective height at position, considering both terrain and collision objects
   */
  getEffectiveHeightAt(x: number, z: number): number {
    return this.terrainQueries.getEffectiveHeightAt(x, z);
  }

  /**
   * Check for collision with objects at given position
   */
  checkObjectCollision(position: THREE.Vector3, radius: number = 0.5): boolean {
    return this.terrainQueries.checkObjectCollision(position, radius);
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
    return this.terrainQueries.raycastTerrain(origin, direction, maxDistance);
  }

  getQueueSize(): number {
    return this.loadQueueManager.getQueueSize();
  }

  getLoadingCount(): number {
    return this.lifecycleManager.getLoadingCount();
  }

  getChunkSize(): number {
    return this.config.size;
  }

  /**
   * Get worker pool statistics for debugging
   */
  getWorkerStats(): { enabled: boolean; queueLength: number; busyWorkers: number; totalWorkers: number } | null {
    if (!this.workerPool) {
      return null;
    }
    return {
      enabled: true,
      ...this.workerPool.getStats()
    };
  }

  /**
   * Get detailed worker telemetry for debugging
   * Call from console: game.chunkManager.getWorkerTelemetry()
   */
  getWorkerTelemetry(): {
    enabled: boolean;
    chunksGenerated: number;
    avgGenerationTimeMs: number;
    workersReady: number;
    duplicatesAvoided: number;
    queueLength: number;
    busyWorkers: number;
    inFlightChunks: number;
  } | null {
    if (!this.workerPool) {
      Logger.info('terrain', '[ChunkManager] Workers disabled, using main thread');
      return null;
    }
    const telemetry = this.workerPool.getTelemetry();
    Logger.info('terrain', '[ChunkManager] Worker Telemetry:', telemetry);
    return { enabled: true, ...telemetry };
  }

  // Game mode configuration
  setRenderDistance(distance: number): void {
    this.config.renderDistance = distance;
    this.config.loadDistance = distance + 1;
    Logger.info('chunks', `Render distance set to ${distance}`);
    
    // Update sub-managers
    this.priorityManager.updateConfig({
      renderDistance: distance,
      loadDistance: distance + 1
    });
    this.lifecycleManager.updateConfig({
      renderDistance: distance,
      loadDistance: distance + 1
    });
    
    // Trigger chunk reload
    this.loadQueueManager.updateLoadQueue();
  }

  /**
   * Get the LOS accelerator for direct access (e.g., for batch queries)
   */
  getLOSAccelerator(): LOSAccelerator {
    return this.losAccelerator;
  }

  /**
   * Get terrain mesh merger stats (for debugging draw call reduction)
   * Call from console: game.chunkManager.getMergerStats()
   */
  getMergerStats(): { activeRings: number; totalChunks: number; pendingMerge: boolean; estimatedDrawCallSavings: number } | null {
    return this.lifecycleManager.getMergerStats();
  }
}
