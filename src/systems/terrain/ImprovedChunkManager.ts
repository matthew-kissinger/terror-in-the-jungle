import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Chunk } from './Chunk';
import { ImprovedChunk } from './ImprovedChunk';
import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { AssetLoader } from '../assets/AssetLoader';
import { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';

export interface ChunkConfig {
  size: number;
  renderDistance: number;
  loadDistance: number;
  lodLevels: number;
}

/**
 * Improved ChunkManager with async loading and performance optimizations
 */
export class ImprovedChunkManager implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private assetLoader: AssetLoader;
  private config: ChunkConfig;
  private noiseGenerator: NoiseGenerator;
  private globalBillboardSystem: GlobalBillboardSystem;
  
  // Chunk storage
  private chunks: Map<string, ImprovedChunk> = new Map();
  private loadingChunks: Set<string> = new Set();
  private loadQueue: Array<{x: number, z: number, priority: number}> = [];
  
  // Player tracking
  private playerPosition = new THREE.Vector3();
  private lastChunkPosition = new THREE.Vector2();

  // Adaptive bounds
  private readonly minRenderDistance: number;
  private readonly maxRenderDistance: number;
  
  // Performance settings
  private updateTimer = 0;
  private readonly UPDATE_INTERVAL = 0.25;  // Chunk system update cadence
  private readonly MAX_CHUNKS_PER_FRAME = 1; // Limit ingestion to reduce spikes
  private readonly IN_FRAME_BUDGET_MS = 2.0;
  private readonly IDLE_BUDGET_MS = 6.0;
  private readonly MAX_QUEUE_SIZE = 96;
  private loaderHandle: number | null = null;
  private readonly LOAD_DELAY_FALLBACK = 100;

  // Adaptive render distance
  private fpsEma = 60;
  private readonly FPS_EMA_ALPHA = 0.1;
  private lastAdaptTime = 0;
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
    this.minRenderDistance = Math.max(4, config.renderDistance - 2);
  }

  async init(): Promise<void> {
    console.log('🗺️ Improved ChunkManager: Initializing...');
    const maxChunks = (this.config.loadDistance * 2 + 1) ** 2;
    console.log(`Config: render=${this.config.renderDistance}, load=${this.config.loadDistance}, max chunks=${maxChunks}, chunk size=${this.config.size}`);
    
    // Start with smaller immediate area to reduce initial load
    const initialChunks = this.getChunksInRadius(new THREE.Vector3(0, 0, 0), 1);
    
    // Load initial chunks synchronously for immediate playability
    for (const {x, z} of initialChunks) {
      await this.loadChunkImmediate(x, z);
    }
    
    console.log('✅ ImprovedChunkManager: Ready with initial chunks');
    this.updateLoadQueue();
  }

  update(deltaTime: number): void {
    this.updateTimer += deltaTime;
    // Track FPS EMA
    this.fpsEma = this.fpsEma * (1 - this.FPS_EMA_ALPHA) + (1 / Math.max(0.001, deltaTime)) * this.FPS_EMA_ALPHA;
    // Adapt render distance gradually to maintain stability
    const nowMs = performance.now();
    if (nowMs - this.lastAdaptTime > this.ADAPT_COOLDOWN_MS) {
      if (this.fpsEma < 28 && this.config.renderDistance > this.minRenderDistance) {
        this.setRenderDistance(this.config.renderDistance - 1);
        this.lastAdaptTime = nowMs;
      } else if (this.fpsEma > 55 && this.config.renderDistance < this.maxRenderDistance) {
        this.setRenderDistance(this.config.renderDistance + 1);
        this.lastAdaptTime = nowMs;
      }
    }
    
    if (this.updateTimer >= this.UPDATE_INTERVAL) {
      this.updateTimer = 0;
      
      // Check if player moved to different chunk
      const currentChunkPos = this.worldToChunkCoord(this.playerPosition);
      if (!currentChunkPos.equals(this.lastChunkPosition)) {
        this.updateLoadQueue();
        this.lastChunkPosition.copy(currentChunkPos);
      }
      
      // Process load queue gradually within the frame budget
      this.drainLoadQueue(this.IN_FRAME_BUDGET_MS, this.MAX_CHUNKS_PER_FRAME);
      
      // Update chunk visibility
      this.updateChunkVisibility();
      
      // Clean up distant chunks
      this.unloadDistantChunks();
    }
  }

  dispose(): void {
    this.cancelBackgroundLoader();
    this.chunks.forEach(chunk => chunk.dispose());
    this.chunks.clear();
    this.loadingChunks.clear();
    this.loadQueue = [];
    console.log('🧹 ImprovedChunkManager: Disposed');
  }

  updatePlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  private updateLoadQueue(): void {
    // Clear existing queue
    this.loadQueue = [];
    
    const centerChunk = this.worldToChunkCoord(this.playerPosition);
    
    // Build priority queue based on distance
    for (let x = centerChunk.x - this.config.loadDistance; x <= centerChunk.x + this.config.loadDistance; x++) {
      for (let z = centerChunk.y - this.config.loadDistance; z <= centerChunk.y + this.config.loadDistance; z++) {
        const chunkKey = this.getChunkKey(x, z);
        
        if (!this.chunks.has(chunkKey) && !this.loadingChunks.has(chunkKey)) {
          const distance = Math.max(Math.abs(x - centerChunk.x), Math.abs(z - centerChunk.y));
          this.loadQueue.push({ x, z, priority: distance });
        }
      }
    }
    
    // Sort by priority (closer chunks first)
    this.loadQueue.sort((a, b) => a.priority - b.priority);

    if (this.loadQueue.length > this.MAX_QUEUE_SIZE) {
      this.loadQueue.length = this.MAX_QUEUE_SIZE;
    }

    if (this.loadQueue.length > 0) {
      this.scheduleBackgroundLoader();
    }
  }

  private drainLoadQueue(budgetMs: number, maxChunks: number): void {
    if (this.loadQueue.length === 0) return;

    const start = performance.now();
    let processed = 0;

    while (this.loadQueue.length > 0 && processed < maxChunks) {
      if (performance.now() - start > budgetMs) {
        break;
      }

      const item = this.loadQueue.shift();
      if (!item) {
        continue;
      }

      this.loadChunkAsync(item.x, item.z);
      processed++;
    }

    if (this.loadQueue.length > 0) {
      this.scheduleBackgroundLoader();
    }
  }

  private scheduleBackgroundLoader(): void {
    if (this.loaderHandle !== null || this.loadQueue.length === 0) {
      return;
    }

    const callback = (deadline?: IdleDeadline) => {
      this.loaderHandle = null;

      const budget = deadline ? Math.min(deadline.timeRemaining(), this.IDLE_BUDGET_MS) : this.IDLE_BUDGET_MS;
      this.drainLoadQueue(budget, this.MAX_CHUNKS_PER_FRAME);

      if (this.loadQueue.length > 0) {
        this.scheduleBackgroundLoader();
      }
    };

    if (typeof (window as any).requestIdleCallback === 'function') {
      this.loaderHandle = (window as any).requestIdleCallback(callback);
    } else {
      this.loaderHandle = window.setTimeout(() => callback(), this.LOAD_DELAY_FALLBACK);
    }
  }

  private cancelBackgroundLoader(): void {
    if (this.loaderHandle === null) {
      return;
    }

    if (typeof (window as any).cancelIdleCallback === 'function') {
      (window as any).cancelIdleCallback(this.loaderHandle);
    } else {
      clearTimeout(this.loaderHandle);
    }

    this.loaderHandle = null;
  }

  private async loadChunkImmediate(chunkX: number, chunkZ: number): Promise<void> {
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
        this.globalBillboardSystem
      );

      await chunk.generate();
      this.chunks.set(chunkKey, chunk);
      console.log(`✅ Loaded initial chunk (${chunkX}, ${chunkZ})`);
    } catch (error) {
      console.error(`❌ Failed to load chunk (${chunkX}, ${chunkZ}):`, error);
    }
  }

  private async loadChunkAsync(chunkX: number, chunkZ: number): Promise<void> {
    const chunkKey = this.getChunkKey(chunkX, chunkZ);
    
    if (this.chunks.has(chunkKey) || this.loadingChunks.has(chunkKey)) {
      return;
    }

    this.loadingChunks.add(chunkKey);

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
          this.globalBillboardSystem
        );

        await chunk.generate();
        const currentDistance = this.getChunkDistanceFromPlayer(chunkX, chunkZ);

        // Only add if still needed (player might have moved away)
        if (currentDistance <= this.config.loadDistance) {
          this.chunks.set(chunkKey, chunk);
          console.log(`📦 Async loaded chunk (${chunkX}, ${chunkZ})`);
        } else {
          chunk.dispose();
          console.log(`🗑️ Disposed unneeded chunk (${chunkX}, ${chunkZ})`);
        }
      } catch (error) {
        console.error(`❌ Failed to load chunk (${chunkX}, ${chunkZ}):`, error);
      } finally {
        this.loadingChunks.delete(chunkKey);
      }
    }, 0);
  }

  private unloadDistantChunks(): void {
    const chunksToUnload: string[] = [];
    
    this.chunks.forEach((chunk, key) => {
      const [x, z] = key.split(',').map(Number);
      const distance = this.getChunkDistanceFromPlayer(x, z);
      
      // Unload chunks beyond load distance
      if (distance > this.config.loadDistance) {
        chunksToUnload.push(key);
      }
    });

    chunksToUnload.forEach(key => {
      const chunk = this.chunks.get(key);
      if (chunk) {
        this.globalBillboardSystem.removeChunkInstances(key);
        chunk.dispose();
        this.chunks.delete(key);
        console.log(`🗑️ Unloaded chunk ${key} (${this.chunks.size - 1} chunks remain)`);
      }
    });
  }

  private updateChunkVisibility(): void {
    this.chunks.forEach((chunk) => {
      const distance = this.getChunkDistance(chunk.getPosition(), this.playerPosition);
      // Keep chunks visible with a buffer to prevent pop-in
      const isVisible = distance <= this.config.renderDistance + 1;
      const lodLevel = this.calculateLOD(distance);
      
      chunk.setVisible(isVisible);
      chunk.setLODLevel(lodLevel);
    });
  }

  private getChunksInRadius(center: THREE.Vector3, radius: number): Array<{x: number, z: number}> {
    const centerChunk = this.worldToChunkCoord(center);
    const chunks: Array<{x: number, z: number}> = [];
    
    for (let x = centerChunk.x - radius; x <= centerChunk.x + radius; x++) {
      for (let z = centerChunk.y - radius; z <= centerChunk.y + radius; z++) {
        chunks.push({x, z});
      }
    }
    
    return chunks;
  }

  private getChunkDistanceFromPlayer(chunkX: number, chunkZ: number): number {
    const playerChunk = this.worldToChunkCoord(this.playerPosition);
    return Math.max(Math.abs(chunkX - playerChunk.x), Math.abs(chunkZ - playerChunk.y));
  }

  private calculateLOD(distance: number): number {
    // Balanced LOD for performance while maintaining visual quality
    if (distance <= 3) return 0;      // Full detail for nearby chunks (radius 3)
    if (distance <= 5) return 1;      // 50% detail for medium range
    if (distance <= 7) return 2;      // 25% detail for far chunks
    return 3;                         // 10% detail for very far chunks
  }

  private getChunkDistance(chunkWorldPos: THREE.Vector3, playerPos: THREE.Vector3): number {
    return Math.max(
      Math.abs(chunkWorldPos.x - playerPos.x) / this.config.size,
      Math.abs(chunkWorldPos.z - playerPos.z) / this.config.size
    );
  }

  private worldToChunkCoord(worldPos: THREE.Vector3): THREE.Vector2 {
    return new THREE.Vector2(
      Math.floor(worldPos.x / this.config.size),
      Math.floor(worldPos.z / this.config.size)
    );
  }

  private getChunkKey(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }

  // Public accessors
  getLoadedChunkCount(): number {
    return this.chunks.size;
  }

  getChunkAt(worldPos: THREE.Vector3): ImprovedChunk | undefined {
    const chunkCoord = this.worldToChunkCoord(worldPos);
    const key = this.getChunkKey(chunkCoord.x, chunkCoord.y);
    return this.chunks.get(key);
  }

  getHeightAt(x: number, z: number): number {
    const chunk = this.getChunkAt(new THREE.Vector3(x, 0, z));
    return chunk ? chunk.getHeightAt(x, z) : 0;
  }

  // Collision objects registry
  private collisionObjects: Map<string, THREE.Object3D> = new Map();

  /**
   * Register an object for collision detection
   */
  registerCollisionObject(id: string, object: THREE.Object3D): void {
    this.collisionObjects.set(id, object);
    console.log(`🔷 Registered collision object: ${id}`);
  }

  /**
   * Unregister a collision object
   */
  unregisterCollisionObject(id: string): void {
    this.collisionObjects.delete(id);
    console.log(`🔶 Unregistered collision object: ${id}`);
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
        console.log(`🔷 Object ${id} contributes height ${objectHeight.toFixed(2)} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
      }
      if (objectHeight > maxHeight) {
        maxHeight = objectHeight;
      }
    });

    if (objectContributions > 0) {
      console.log(`🎯 Final height at (${x.toFixed(1)}, ${z.toFixed(1)}): terrain=${terrainHeight.toFixed(2)}, final=${maxHeight.toFixed(2)}`);
    }

    return maxHeight;
  }

  /**
   * Get height of a specific object at given world position
   */
  private getObjectHeightAt(object: THREE.Object3D, x: number, z: number): number {
    // Get object bounding box
    const box = new THREE.Box3().setFromObject(object);

    // Check if X,Z position is within object's horizontal bounds
    const testPoint = new THREE.Vector3(x, 0, z);

    if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z) {
      // Position is within bounds - use raycasting from above to find top surface
      const raycaster = new THREE.Raycaster();
      const rayOrigin = new THREE.Vector3(x, box.max.y + 10, z);
      const rayDirection = new THREE.Vector3(0, -1, 0);
      raycaster.set(rayOrigin, rayDirection);

      const intersects = raycaster.intersectObject(object, true);
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
      return box.max.y;
    }

    return 0;
  }

  /**
   * Check for collision with objects at given position
   */
  checkObjectCollision(position: THREE.Vector3, radius: number = 0.5): boolean {
    for (const [id, object] of this.collisionObjects) {
      const box = new THREE.Box3().setFromObject(object);
      const expandedBox = box.expandByScalar(radius);

      if (expandedBox.containsPoint(position)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Raycast against terrain to check for obstructions
   * @param origin Starting point of the ray
   * @param direction Direction of the ray (should be normalized)
   * @param maxDistance Maximum distance to check
   * @returns {hit: boolean, point?: THREE.Vector3, distance?: number}
   */
  raycastTerrain(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): {hit: boolean, point?: THREE.Vector3, distance?: number} {
    const raycaster = new THREE.Raycaster();
    raycaster.set(origin, direction);
    raycaster.far = maxDistance;

    // Collect all loaded terrain meshes
    const terrainMeshes: THREE.Mesh[] = [];
    this.chunks.forEach(chunk => {
      const mesh = chunk.getTerrainMesh();
      if (mesh) {
        terrainMeshes.push(mesh);
      }
    });

    if (terrainMeshes.length === 0) {
      return { hit: false };
    }

    // Perform raycast against all terrain meshes
    const intersects = raycaster.intersectObjects(terrainMeshes);

    if (intersects.length > 0) {
      const closest = intersects[0];
      return {
        hit: true,
        point: closest.point,
        distance: closest.distance
      };
    }

    return { hit: false };
  }

  getQueueSize(): number {
    return this.loadQueue.length;
  }

  getLoadingCount(): number {
    return this.loadingChunks.size;
  }

  // Game mode configuration
  setRenderDistance(distance: number): void {
    this.config.renderDistance = distance;
    this.config.loadDistance = distance + 1;
    console.log(`🎮 Chunk render distance set to ${distance}`);
    // Trigger chunk reload
    this.updateLoadQueue();
  }
}
