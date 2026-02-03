import * as THREE from 'three';

export interface ChunkQueueItem {
  x: number;
  z: number;
  priority: number;
}

export interface ChunkPriorityConfig {
  loadDistance: number;
  renderDistance: number;
  maxQueueSize: number;
  chunkSize: number;
}

/**
 * Manages chunk loading priority and queue operations
 * Handles distance-based prioritization and LOD calculations
 */
export class ChunkPriorityManager {
  private config: ChunkPriorityConfig;
  private loadQueue: ChunkQueueItem[] = [];
  private playerPosition = new THREE.Vector3();
  private lastChunkPosition = new THREE.Vector2();

  constructor(config: ChunkPriorityConfig) {
    this.config = config;
  }

  /**
   * Update player position for priority calculations
   */
  updatePlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  /**
   * Get current chunk position
   */
  getCurrentChunkPosition(): THREE.Vector2 {
    return this.worldToChunkCoord(this.playerPosition);
  }

  /**
   * Check if player moved to different chunk
   */
  hasPlayerMovedChunk(): boolean {
    const currentChunkPos = this.worldToChunkCoord(this.playerPosition);
    const moved = !currentChunkPos.equals(this.lastChunkPosition);
    if (moved) {
      this.lastChunkPosition.copy(currentChunkPos);
    }
    return moved;
  }

  /**
   * Build priority queue for chunks that need loading
   * @param existingChunks Set of chunk keys that already exist
   * @param loadingChunks Set of chunk keys currently being loaded
   */
  updateLoadQueue(
    existingChunks: Set<string>,
    loadingChunks: Set<string>
  ): void {
    // Clear existing queue
    this.loadQueue = [];
    
    const centerChunk = this.worldToChunkCoord(this.playerPosition);
    
    // Build priority queue based on distance
    for (let x = centerChunk.x - this.config.loadDistance; x <= centerChunk.x + this.config.loadDistance; x++) {
      for (let z = centerChunk.y - this.config.loadDistance; z <= centerChunk.y + this.config.loadDistance; z++) {
        const chunkKey = this.getChunkKey(x, z);
        
        if (!existingChunks.has(chunkKey) && !loadingChunks.has(chunkKey)) {
          const distance = Math.max(Math.abs(x - centerChunk.x), Math.abs(z - centerChunk.y));
          this.loadQueue.push({ x, z, priority: distance });
        }
      }
    }
    
    // Sort by priority (closer chunks first)
    this.loadQueue.sort((a, b) => a.priority - b.priority);

    if (this.loadQueue.length > this.config.maxQueueSize) {
      this.loadQueue.length = this.config.maxQueueSize;
    }
  }

  /**
   * Get next items from queue within budget
   * @param budgetMs Frame budget in milliseconds
   * @param maxChunks Maximum chunks to process
   * @returns Array of queue items to process
   */
  drainLoadQueue(budgetMs: number, maxChunks: number): ChunkQueueItem[] {
    if (this.loadQueue.length === 0) return [];

    const start = performance.now();
    const items: ChunkQueueItem[] = [];

    while (this.loadQueue.length > 0 && items.length < maxChunks) {
      if (performance.now() - start > budgetMs) {
        break;
      }

      const item = this.loadQueue.shift();
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Get all chunks in radius around center
   */
  getChunksInRadius(center: THREE.Vector3, radius: number): Array<{x: number, z: number}> {
    const centerChunk = this.worldToChunkCoord(center);
    const chunks: Array<{x: number, z: number}> = [];
    
    for (let x = centerChunk.x - radius; x <= centerChunk.x + radius; x++) {
      for (let z = centerChunk.y - radius; z <= centerChunk.y + radius; z++) {
        chunks.push({x, z});
      }
    }
    
    return chunks;
  }

  /**
   * Calculate distance from player to chunk
   */
  getChunkDistanceFromPlayer(chunkX: number, chunkZ: number): number {
    const playerChunk = this.worldToChunkCoord(this.playerPosition);
    return Math.max(Math.abs(chunkX - playerChunk.x), Math.abs(chunkZ - playerChunk.y));
  }

  /**
   * Calculate distance between chunk world position and player
   */
  getChunkDistance(chunkWorldPos: THREE.Vector3, playerPos: THREE.Vector3): number {
    return Math.max(
      Math.abs(chunkWorldPos.x - playerPos.x) / this.config.chunkSize,
      Math.abs(chunkWorldPos.z - playerPos.z) / this.config.chunkSize
    );
  }

  /**
   * Calculate LOD level based on distance
   */
  calculateLOD(distance: number): number {
    // Balanced LOD for performance while maintaining visual quality
    if (distance <= 3) return 0;      // Full detail for nearby chunks (radius 3)
    if (distance <= 5) return 1;      // 50% detail for medium range
    if (distance <= 7) return 2;      // 25% detail for far chunks
    return 3;                         // 10% detail for very far chunks
  }

  /**
   * Check if chunk should be visible based on render distance
   */
  shouldChunkBeVisible(distance: number): boolean {
    // Keep chunks visible with a buffer to prevent pop-in
    return distance <= this.config.renderDistance + 1;
  }

  /**
   * Check if chunk should be unloaded based on load distance
   */
  shouldChunkBeUnloaded(chunkX: number, chunkZ: number): boolean {
    const distance = this.getChunkDistanceFromPlayer(chunkX, chunkZ);
    return distance > this.config.loadDistance;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.loadQueue.length;
  }

  /**
   * Get queue items (for debugging)
   */
  getQueueItems(): readonly ChunkQueueItem[] {
    return this.loadQueue;
  }

  /**
   * Clear queue
   */
  clearQueue(): void {
    this.loadQueue = [];
  }

  /**
   * Convert world position to chunk coordinates
   */
  private worldToChunkCoord(worldPos: THREE.Vector3): THREE.Vector2 {
    return new THREE.Vector2(
      Math.floor(worldPos.x / this.config.chunkSize),
      Math.floor(worldPos.z / this.config.chunkSize)
    );
  }

  /**
   * Get chunk key from coordinates
   */
  getChunkKey(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ChunkPriorityConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
