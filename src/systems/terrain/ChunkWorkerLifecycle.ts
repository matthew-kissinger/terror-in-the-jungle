import { Logger } from '../../utils/Logger';
/**
 * Worker lifecycle management for ChunkWorkerPool
 * Handles worker creation, message handling, error handling, and worker code generation
 */

import type { ChunkGeometryResult } from './ChunkWorkerPool';
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
  type: 'ready' | 'result' | 'providerReady';
  requestId?: number;
  chunkX?: number;
  chunkZ?: number;
  positions?: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  indices?: Uint32Array;
  heightData?: Float32Array;
  vegetation?: import('./ChunkWorkerPool').VegetationData;
  biomeId?: string;
}

/**
 * Manages worker lifecycle: creation, message handling, error handling
 */
export class ChunkWorkerLifecycle {
  private workers: WorkerState[] = [];
  private workerUrls: string[] = [];
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
    Logger.info('terrain', `[ChunkWorkerPool] Creating ${count} workers`);

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
    this.workerUrls.push(workerUrl);

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
    Logger.error('terrain', '[ChunkWorkerPool] Worker error:', error);
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
   * Send height provider configuration to all workers.
   * For DEM mode, the buffer is transferred (zero-copy) to each worker via slicing.
   */
  sendHeightProvider(config: import('./IHeightProvider').HeightProviderConfig): void {
    for (const state of this.workers) {
      if (config.type === 'dem') {
        // Each worker gets its own copy of the buffer (transferable)
        const bufferCopy = config.buffer.slice(0);
        state.worker.postMessage({
          type: 'setHeightProvider',
          providerType: 'dem',
          buffer: bufferCopy,
          width: config.width,
          height: config.height,
          metersPerPixel: config.metersPerPixel,
          originX: config.originX,
          originZ: config.originZ
        }, [bufferCopy]);
      } else {
        state.worker.postMessage({
          type: 'setHeightProvider',
          providerType: 'noise',
          seed: config.seed
        });
      }
    }
  }

  /**
   * Send vegetation + biome config to all workers.
   * Workers use this to generate vegetation data-driven instead of hardcoded.
   */
  sendVegetationConfig(config: { types: any[]; biomePalette: any[] }): void {
    for (const state of this.workers) {
      state.worker.postMessage({
        type: 'setVegetationConfig',
        vegetationTypes: config.types,
        biomePalette: config.biomePalette,
      });
    }
  }

  sendBiomeConfig(config: { biomeRules: any[]; defaultBiomeId: string; allBiomePalettes: Record<string, any[]> }): void {
    for (const state of this.workers) {
      state.worker.postMessage({
        type: 'setBiomeConfig',
        biomeRules: config.biomeRules,
        defaultBiomeId: config.defaultBiomeId,
        allBiomePalettes: config.allBiomePalettes,
      });
    }
  }

  /**
   * Dispose all workers
   */
  dispose(): void {
    for (const state of this.workers) {
      state.worker.terminate();
    }
    this.workers = [];

    for (const url of this.workerUrls) {
      URL.revokeObjectURL(url);
    }
    this.workerUrls = [];
  }
}
