/**
 * Worker lifecycle management for ChunkWorkerPool
 * Handles worker creation, message handling, error handling, and worker code generation
 */

import * as THREE from 'three';
import { ChunkGeometryResult } from './ChunkWorkerPool';
import { getChunkWorkerCode } from './ChunkWorkerCode';

export interface ChunkRequest {
  chunkX: number;
  chunkZ: number;
  size: number;
  segments: number;
  seed: number;
  priority: number;
  resolve: (result: ChunkGeometryResult) => void;
  reject: (error: Error) => void;
}

export interface WorkerState {
  worker: Worker;
  busy: boolean;
  currentRequest?: ChunkRequest;
}

export interface WorkerMessageData {
  type: 'ready' | 'result';
  requestId?: number;
  chunkX?: number;
  chunkZ?: number;
  positions?: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  indices?: Uint32Array;
  heightData?: Float32Array;
  vegetation?: any;
}

/**
 * Manages worker lifecycle: creation, message handling, error handling
 */
export class ChunkWorkerLifecycle {
  private workers: WorkerState[] = [];
  private readonly seed: number;
  private readonly segments: number;
  private pendingRequests: Map<number, ChunkRequest>;
  private onWorkerReady: () => void;
  private onWorkerResult: (state: WorkerState, data: WorkerMessageData) => void;
  private onWorkerError: (state: WorkerState, error: ErrorEvent) => void;

  constructor(
    workerCount: number,
    seed: number,
    segments: number,
    pendingRequests: Map<number, ChunkRequest>,
    callbacks: {
      onWorkerReady: () => void;
      onWorkerResult: (state: WorkerState, data: WorkerMessageData) => void;
      onWorkerError: (state: WorkerState, error: ErrorEvent) => void;
    }
  ) {
    this.seed = seed;
    this.segments = segments;
    this.pendingRequests = pendingRequests;
    this.onWorkerReady = callbacks.onWorkerReady;
    this.onWorkerResult = callbacks.onWorkerResult;
    this.onWorkerError = callbacks.onWorkerError;

    // Limit workers to reasonable count
    const count = Math.min(Math.max(2, workerCount), 8);
    console.log(`[ChunkWorkerPool] Creating ${count} workers`);

    for (let i = 0; i < count; i++) {
      this.createWorker();
    }
  }

  /**
   * Create a new worker instance
   */
  private createWorker(): void {
    // Create worker from inline blob to avoid separate file issues with bundlers
    const workerCode = this.getWorkerCode();
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);

    const worker = new Worker(workerUrl);
    const state: WorkerState = { worker, busy: false };

    worker.onmessage = (event) => this.handleWorkerMessage(state, event);
    worker.onerror = (error) => this.handleWorkerError(state, error);

    this.workers.push(state);
  }

  /**
   * Get inline worker code - MUST match NoiseGenerator.ts exactly for seamless chunks
   */
  private getWorkerCode(): string {
    return getChunkWorkerCode();
  }

  /**
   * Handle worker message
   */
  private handleWorkerMessage(state: WorkerState, event: MessageEvent): void {
    const data: WorkerMessageData = event.data;

    if (data.type === 'ready') {
      this.onWorkerReady();
      return;
    }

    if (data.type === 'result') {
      this.onWorkerResult(state, data);
    }
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(state: WorkerState, error: ErrorEvent): void {
    console.error('[ChunkWorkerPool] Worker error:', error);
    this.onWorkerError(state, error);
  }

  /**
   * Get all workers
   */
  getWorkers(): WorkerState[] {
    return this.workers;
  }

  /**
   * Assign work to a worker
   */
  assignWork(state: WorkerState, request: ChunkRequest, requestId: number): void {
    state.busy = true;
    state.currentRequest = request;

    state.worker.postMessage({
      type: 'generate',
      requestId,
      chunkX: request.chunkX,
      chunkZ: request.chunkZ,
      size: request.size,
      segments: request.segments,
      seed: request.seed
    });
  }

  /**
   * Dispose all workers
   */
  dispose(): void {
    for (const state of this.workers) {
      state.worker.terminate();
    }
    this.workers = [];
  }
}
