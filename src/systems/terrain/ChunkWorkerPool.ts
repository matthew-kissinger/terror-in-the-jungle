/**
 * Worker pool for parallel chunk generation
 *
 * Manages a pool of ChunkWorkers for off-thread terrain generation.
 * Uses transferable ArrayBuffers for zero-copy data transfer.
 *
 * Based on patterns from:
 * - three-mesh-bvh GenerateMeshBVHWorker
 * - MDN Web Workers API best practices
 */

import * as THREE from 'three';
import { ChunkWorkerLifecycle, WorkerState, ChunkRequest, WorkerMessageData } from './ChunkWorkerLifecycle';
import { ChunkTaskQueue } from './ChunkTaskQueue';
import { ChunkWorkerTelemetry } from './ChunkWorkerTelemetry';
import { Logger } from '../../utils/Logger';

export interface VegetationPosition {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
}

export interface VegetationData {
  fern: VegetationPosition[];
  elephantEar: VegetationPosition[];
  fanPalm: VegetationPosition[];
  coconut: VegetationPosition[];
  areca: VegetationPosition[];
  dipterocarp: VegetationPosition[];
  banyan: VegetationPosition[];
}

export interface ChunkGeometryResult {
  chunkX: number;
  chunkZ: number;
  geometry: THREE.BufferGeometry;
  heightData: Float32Array;
  vegetation?: VegetationData;
}

export class ChunkWorkerPool {
  private lifecycle: ChunkWorkerLifecycle;
  private taskQueue: ChunkTaskQueue;
  private telemetry: ChunkWorkerTelemetry;
  private pendingRequests: Map<number, ChunkRequest> = new Map();
  private readonly seed: number;
  private readonly segments: number;
  private isDisposed = false;

  constructor(
    workerCount: number = navigator.hardwareConcurrency || 4,
    seed: number = 12345,
    segments: number = 32
  ) {
    this.seed = seed;
    this.segments = segments;

    // Initialize sub-modules
    this.taskQueue = new ChunkTaskQueue();
    this.telemetry = new ChunkWorkerTelemetry();

    // Initialize lifecycle with callbacks
    this.lifecycle = new ChunkWorkerLifecycle(
      workerCount,
      seed,
      segments,
      this.pendingRequests,
      {
        onWorkerReady: () => {
          this.telemetry.recordWorkerReady();
          const workers = this.lifecycle.getWorkers();
          Logger.debug('Terrain', `Worker ready (${this.telemetry.getTelemetry().workersReady}/${workers.length})`);
          this.processQueue();
        },
        onWorkerResult: (state: WorkerState, data: WorkerMessageData) => {
          this.handleWorkerResult(state, data);
        },
        onWorkerError: (state: WorkerState, error: ErrorEvent) => {
          this.handleWorkerError(state, error);
        }
      }
    );
  }

  /**
   * Handle worker result message
   */
  private handleWorkerResult(state: WorkerState, data: WorkerMessageData): void {
    if (!data.requestId) return;

    const request = this.pendingRequests.get(data.requestId);
    if (request) {
      this.pendingRequests.delete(data.requestId);

      // Track telemetry
      const generationTime = performance.now() - (request as any).startTime;
      this.telemetry.recordChunkGenerated(generationTime);

      // Create Three.js geometry from transferred data
      if (!data.positions || !data.normals || !data.uvs || !data.indices || !data.heightData) {
        request.reject(new Error('Missing geometry data in worker result'));
        return;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));

      const result: ChunkGeometryResult = {
        chunkX: data.chunkX!,
        chunkZ: data.chunkZ!,
        geometry,
        heightData: data.heightData,
        vegetation: data.vegetation
      };

      // Clear from in-flight tracking
      this.taskQueue.removeInFlight(data.chunkX!, data.chunkZ!);

      request.resolve(result);
    }

    state.busy = false;
    state.currentRequest = undefined;
    this.processQueue();
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(state: WorkerState, error: ErrorEvent): void {
    Logger.error('Terrain', 'Worker error:', error);

    if (state.currentRequest) {
      state.currentRequest.reject(new Error(error.message));
      if (state.currentRequest.chunkX !== undefined && state.currentRequest.chunkZ !== undefined) {
        this.taskQueue.removeInFlight(state.currentRequest.chunkX, state.currentRequest.chunkZ);
      }
    }

    state.busy = false;
    state.currentRequest = undefined;
    this.processQueue();
  }

  /**
   * Process queue: assign work to idle workers
   */
  private processQueue(): void {
    if (this.isDisposed) return;

    const workers = this.lifecycle.getWorkers();

    // Find idle workers and assign work
    for (const state of workers) {
      if (!state.busy) {
        const request = this.taskQueue.dequeue();
        if (request) {
          const requestId = this.taskQueue.getNextRequestId();
          this.pendingRequests.set(requestId, request);
          this.lifecycle.assignWork(state, request, requestId);
        }
      }
    }
  }

  /**
   * Request chunk generation
   * @returns Promise that resolves with geometry and height data
   */
  generateChunk(
    chunkX: number,
    chunkZ: number,
    size: number,
    priority: number = 0
  ): Promise<ChunkGeometryResult> {
    if (this.isDisposed) {
      return Promise.reject(new Error('Worker pool disposed'));
    }

    // Deduplication: return existing promise if chunk is already being generated
    if (this.taskQueue.isChunkInFlight(chunkX, chunkZ)) {
      const existingPromise = this.taskQueue.getInFlightPromise(chunkX, chunkZ);
      if (existingPromise) {
        this.telemetry.recordDuplicateAvoided();
        this.taskQueue.recordDuplicate();
        return existingPromise;
      }
    }

    const promise = new Promise<ChunkGeometryResult>((resolve, reject) => {
      const request: ChunkRequest & { startTime: number } = {
        chunkX,
        chunkZ,
        size,
        segments: this.segments,
        seed: this.seed,
        priority,
        resolve,
        reject,
        startTime: performance.now()
      };

      this.taskQueue.enqueue(request);
      this.processQueue();
    });

    // Track in-flight after promise is created
    this.taskQueue.trackInFlight(chunkX, chunkZ, promise);

    return promise;
  }

  /**
   * Cancel pending requests for a chunk
   */
  cancelChunk(chunkX: number, chunkZ: number): void {
    this.taskQueue.cancelChunk(chunkX, chunkZ);
  }

  /**
   * Get queue statistics
   */
  getStats(): { queueLength: number; busyWorkers: number; totalWorkers: number } {
    const workers = this.lifecycle.getWorkers();
    return {
      queueLength: this.taskQueue.getQueueLength(),
      busyWorkers: workers.filter(w => w.busy).length,
      totalWorkers: workers.length
    };
  }

  /**
   * Get telemetry for debugging
   */
  getTelemetry(): {
    chunksGenerated: number;
    avgGenerationTimeMs: number;
    workersReady: number;
    duplicatesAvoided: number;
    queueLength: number;
    busyWorkers: number;
    inFlightChunks: number;
  } {
    const workers = this.lifecycle.getWorkers();
    const telemetryData = this.telemetry.getTelemetry();
    return {
      ...telemetryData,
      duplicatesAvoided: this.taskQueue.getDuplicatesAvoided(),
      queueLength: this.taskQueue.getQueueLength(),
      busyWorkers: workers.filter(w => w.busy).length,
      inFlightChunks: this.taskQueue.getInFlightCount()
    };
  }

  /**
   * Dispose all workers
   */
  dispose(): void {
    this.isDisposed = true;
    this.taskQueue.clear();
    this.taskQueue.clearInFlight();
    this.pendingRequests.clear();
    this.lifecycle.dispose();

    Logger.info('Terrain', 'Disposed');
  }
}
