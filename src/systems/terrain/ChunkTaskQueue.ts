/**
 * Task queue management for ChunkWorkerPool
 * Handles priority queue, deduplication, and work assignment
 */

import { ChunkRequest } from './ChunkWorkerLifecycle';
import { ChunkGeometryResult } from './ChunkWorkerPool';

/**
 * Manages chunk generation task queue with priority and deduplication
 */
export class ChunkTaskQueue {
  private queue: ChunkRequest[] = [];
  private requestId = 0;
  private inFlightChunks: Map<string, Promise<ChunkGeometryResult>> = new Map();
  private duplicatesAvoided = 0;

  /**
   * Get next request ID
   */
  getNextRequestId(): number {
    return this.requestId++;
  }

  /**
   * Add request to queue
   */
  enqueue(request: ChunkRequest): void {
    this.queue.push(request);
  }

  /**
   * Process queue: sort by priority and find next work item
   * @returns Next request to process, or null if queue is empty
   */
  dequeue(): ChunkRequest | null {
    if (this.queue.length === 0) {
      return null;
    }

    // Sort queue by priority (lower = higher priority)
    this.queue.sort((a, b) => a.priority - b.priority);

    return this.queue.shift() || null;
  }

  /**
   * Cancel requests for a specific chunk
   */
  cancelChunk(chunkX: number, chunkZ: number): void {
    this.queue = this.queue.filter(
      r => r.chunkX !== chunkX || r.chunkZ !== chunkZ
    );
  }

  /**
   * Check if chunk is already in flight (deduplication)
   */
  isChunkInFlight(chunkX: number, chunkZ: number): boolean {
    const chunkKey = `${chunkX},${chunkZ}`;
    return this.inFlightChunks.has(chunkKey);
  }

  /**
   * Get existing promise for in-flight chunk
   */
  getInFlightPromise(chunkX: number, chunkZ: number): Promise<ChunkGeometryResult> | undefined {
    const chunkKey = `${chunkX},${chunkZ}`;
    return this.inFlightChunks.get(chunkKey);
  }

  /**
   * Track chunk as in-flight
   */
  trackInFlight(chunkX: number, chunkZ: number, promise: Promise<ChunkGeometryResult>): void {
    const chunkKey = `${chunkX},${chunkZ}`;
    this.inFlightChunks.set(chunkKey, promise);
  }

  /**
   * Remove chunk from in-flight tracking
   */
  removeInFlight(chunkX: number, chunkZ: number): void {
    const chunkKey = `${chunkX},${chunkZ}`;
    this.inFlightChunks.delete(chunkKey);
  }

  /**
   * Record duplicate avoidance
   */
  recordDuplicate(): void {
    this.duplicatesAvoided++;
  }

  /**
   * Get duplicate count
   */
  getDuplicatesAvoided(): number {
    return this.duplicatesAvoided;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get in-flight count
   */
  getInFlightCount(): number {
    return this.inFlightChunks.size;
  }

  /**
   * Clear queue
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Clear in-flight tracking
   */
  clearInFlight(): void {
    this.inFlightChunks.clear();
  }
}
