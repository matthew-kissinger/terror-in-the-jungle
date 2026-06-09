// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Logger } from '../../utils/Logger';
import type { HeightProviderConfig } from './IHeightProvider';
import type { PreparedHeightmapGrid } from './PreparedTerrainSource';

export interface TerrainSurfaceBakeResult {
  heightData: Float32Array;
  normalData: Uint8Array;
  gridSize: number;
  worldSize: number;
}

function cloneHeightProviderConfig(config: HeightProviderConfig): HeightProviderConfig {
  switch (config.type) {
    case 'dem':
      return {
        ...config,
        buffer: config.buffer.slice(0),
      };
    case 'stamped':
      return {
        ...config,
        base: cloneHeightProviderConfig(config.base),
        stamps: config.stamps.map((stamp) => ({ ...stamp })),
      };
    case 'visualExtent':
      return {
        ...config,
        base: cloneHeightProviderConfig(config.base),
        source: cloneHeightProviderConfig(config.source),
      };
    case 'noise':
    default:
      return { ...config };
  }
}

function collectTransferables(config: HeightProviderConfig, transferables: Transferable[]): void {
  switch (config.type) {
    case 'dem':
      transferables.push(config.buffer);
      return;
    case 'stamped':
      collectTransferables(config.base, transferables);
      return;
    case 'visualExtent':
      collectTransferables(config.base, transferables);
      collectTransferables(config.source, transferables);
      return;
    case 'noise':
    default:
      return;
  }
}

// Bake/generate timeout (ms). Mirrors the navmesh worker (NavmeshSystem
// WORKER_TIMEOUT_MS) so a wedged worker rejects + recovers instead of
// hanging startup forever.
const WORKER_TASK_TIMEOUT_MS = 60_000;

interface PendingTask {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  workerIdx: number;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

interface QueuedTask {
  message: Record<string, unknown>;
  transferables: Transferable[];
  resolve: (data: any) => void;
  reject: (err: Error) => void;
}

/**
 * Clean worker pool for terrain operations.
 * Workers are proper ES module files bundled by Vite.
 */
export class TerrainWorkerPool {
  private workers: Worker[] = [];
  private readyWorkers: Set<number> = new Set();
  private busyWorkers: Set<number> = new Set();
  private pendingTasks: Map<number, PendingTask> = new Map();
  // Tasks waiting for a free worker. A busy pool queues here instead of
  // mis-dispatching onto an already-busy worker slot.
  private taskQueue: QueuedTask[] = [];
  private nextRequestId = 1;
  private workerCount: number;
  private disposed = false;

  // Telemetry
  private totalTasksCompleted = 0;
  private totalTaskTimeMs = 0;
  private taskStartTimes: Map<number, number> = new Map();

  constructor(workerCount: number = navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency - 1, 4) : 2) {
    this.workerCount = workerCount;
    this.spawnWorkers();
  }

  /**
   * Construct a single worker. Extracted as a seam so tests can inject a
   * controllable fake worker. Returns null when the Worker API is unavailable
   * (node/test environment) or construction throws.
   */
  protected createWorker(index: number): Worker | null {
    if (typeof Worker === 'undefined') {
      return null;
    }
    try {
      const worker = new Worker(
        new URL('../../workers/terrain.worker.ts', import.meta.url),
        { type: 'module' },
      );
      void index;
      return worker;
    } catch {
      return null;
    }
  }

  private spawnWorkers(): void {
    if (typeof Worker === 'undefined') {
      Logger.warn('terrain-workers', 'Worker API not available (test environment)');
    }

    for (let i = 0; i < this.workerCount; i++) {
      const worker = this.createWorker(i);
      if (!worker) {
        Logger.warn('terrain-workers', `Failed to spawn worker ${i}`);
        continue;
      }

      worker.onmessage = (event) => this.handleMessage(i, event);
      worker.onerror = (err) => this.handleWorkerError(i, err);

      this.workers.push(worker);
    }
  }

  private handleWorkerError(workerIdx: number, err: { message: string }): void {
    Logger.error('terrain-workers', `Worker ${workerIdx} error:`, err.message);
    // Reject any task in flight on this worker so callers don't stall forever.
    for (const [requestId, pending] of this.pendingTasks) {
      if (pending.workerIdx === workerIdx) {
        this.settleRejection(requestId, pending, new Error(`Terrain worker ${workerIdx} error: ${err.message}`));
      }
    }
    // The slot is free again (the failed task no longer occupies it).
    this.busyWorkers.delete(workerIdx);
    this.pumpQueue();
  }

  private handleMessage(workerIdx: number, event: MessageEvent): void {
    const data = event.data;

    if (data.type === 'ready') {
      this.readyWorkers.add(workerIdx);
      Logger.debug('terrain-workers', `Worker ${workerIdx} ready`);
      return;
    }

    if (data.type === 'providerReady') {
      return;
    }

    const requestId = data.requestId;
    const pending = this.pendingTasks.get(requestId);
    if (pending) {
      this.pendingTasks.delete(requestId);
      this.busyWorkers.delete(pending.workerIdx);
      if (pending.timeoutId !== null) {
        clearTimeout(pending.timeoutId);
      }

      // Telemetry
      const startTime = this.taskStartTimes.get(requestId);
      if (startTime) {
        this.totalTaskTimeMs += performance.now() - startTime;
        this.taskStartTimes.delete(requestId);
      }
      this.totalTasksCompleted++;

      pending.resolve(data);
      this.pumpQueue();
    }
  }

  /**
   * Reject a pending task and tear down its timer/telemetry. Does not free the
   * worker slot or pump the queue — callers decide that (dispose drains the
   * whole queue; a worker error frees just that slot).
   */
  private settleRejection(requestId: number, pending: PendingTask, err: Error): void {
    this.pendingTasks.delete(requestId);
    this.taskStartTimes.delete(requestId);
    if (pending.timeoutId !== null) {
      clearTimeout(pending.timeoutId);
    }
    pending.reject(err);
  }

  /**
   * Send height provider config to all workers.
   */
  sendHeightProvider(config: HeightProviderConfig): void {
    for (const worker of this.workers) {
      const clonedConfig = cloneHeightProviderConfig(config);
      const transferables: Transferable[] = [];
      collectTransferables(clonedConfig, transferables);
      worker.postMessage({ type: 'setHeightProvider', config: clonedConfig }, transferables);
    }
  }

  /**
   * Bake a heightmap grid in a worker. Returns Float32Array of heights.
   */
  async bakeHeightmap(gridSize: number, worldSize: number): Promise<Float32Array> {
    const result = await this.enqueueHeightmapBake({
      type: 'bakeHeightmap',
      gridSize,
      worldSize,
    });
    return result.heightData;
  }

  async bakeHeightmapSurface(
    providerConfig: HeightProviderConfig,
    gridSize: number,
    worldSize: number,
  ): Promise<TerrainSurfaceBakeResult> {
    const clonedConfig = cloneHeightProviderConfig(providerConfig);
    const transferables: Transferable[] = [];
    collectTransferables(clonedConfig, transferables);

    return this.enqueueHeightmapBake({
      type: 'bakeHeightmap',
      gridSize,
      worldSize,
      providerConfig: clonedConfig,
    }, transferables);
  }

  async bakePreparedVisualHeightmap(
    preparedHeightmap: PreparedHeightmapGrid,
    playableWorldSize: number,
    visualMargin: number,
    sourceConfig: HeightProviderConfig,
    gridSize: number,
  ): Promise<TerrainSurfaceBakeResult> {
    const preparedData = new Float32Array(preparedHeightmap.data);
    const clonedSourceConfig = cloneHeightProviderConfig(sourceConfig);
    const transferables: Transferable[] = [preparedData.buffer];
    collectTransferables(clonedSourceConfig, transferables);

    return this.enqueueHeightmapBake({
      type: 'bakePreparedVisualHeightmap',
      preparedData,
      preparedGridSize: preparedHeightmap.gridSize,
      playableWorldSize,
      visualMargin,
      sourceConfig: clonedSourceConfig,
      gridSize,
    }, transferables);
  }

  private async enqueueHeightmapBake(
    message: Record<string, unknown>,
    transferables: Transferable[] = [],
  ): Promise<TerrainSurfaceBakeResult> {
    const data = await this.enqueueTask(message, transferables);
    return {
      heightData: data.data as Float32Array,
      normalData: data.normalData as Uint8Array,
      gridSize: data.gridSize as number,
      worldSize: data.worldSize as number,
    };
  }

  /**
   * Generate terrain work units in worker space.
   * This remains available while terrain generation tasks are still message-based.
   */
  async generateChunk(
    chunkX: number, chunkZ: number,
    size: number, segments: number, seed: number,
  ): Promise<any> {
    return this.enqueueTask({
      type: 'generate',
      chunkX,
      chunkZ,
      size,
      segments,
      seed,
    });
  }

  /**
   * Enqueue a worker task. Dispatches immediately when a worker is free,
   * otherwise the task waits in the queue until a worker frees up (rather than
   * mis-dispatching onto an already-busy slot, which clobbered telemetry and
   * silently double-loaded a worker). Every dispatched task is guarded by a
   * timeout so a wedged worker rejects + recovers its slot.
   */
  private enqueueTask(
    message: Record<string, unknown>,
    transferables: Transferable[] = [],
  ): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      if (this.disposed) {
        reject(new Error('Terrain worker pool disposed'));
        return;
      }
      if (this.workers.length === 0) {
        reject(new Error('No workers available for terrain task'));
        return;
      }

      this.taskQueue.push({ message, transferables, resolve, reject });
      this.pumpQueue();
    });
  }

  /**
   * Dispatch queued tasks onto any free workers.
   */
  private pumpQueue(): void {
    while (this.taskQueue.length > 0) {
      const workerIdx = this.findFreeWorker();
      if (workerIdx < 0) {
        // No free worker — leave the rest queued until one frees.
        return;
      }

      const task = this.taskQueue.shift()!;
      this.dispatchTask(workerIdx, task);
    }
  }

  private dispatchTask(workerIdx: number, task: QueuedTask): void {
    const requestId = this.nextRequestId++;
    this.busyWorkers.add(workerIdx);
    this.taskStartTimes.set(requestId, performance.now());

    const timeoutId = setTimeout(() => {
      const pending = this.pendingTasks.get(requestId);
      if (!pending) return;
      this.busyWorkers.delete(workerIdx);
      this.settleRejection(
        requestId,
        pending,
        new Error(`Terrain worker ${workerIdx} timed out after ${WORKER_TASK_TIMEOUT_MS}ms`),
      );
      this.pumpQueue();
    }, WORKER_TASK_TIMEOUT_MS);

    this.pendingTasks.set(requestId, {
      resolve: task.resolve,
      reject: task.reject,
      workerIdx,
      timeoutId,
    });

    this.workers[workerIdx].postMessage({
      ...task.message,
      requestId,
    }, task.transferables);
  }

  private findFreeWorker(): number {
    for (let i = 0; i < this.workers.length; i++) {
      if (!this.busyWorkers.has(i)) {
        return i;
      }
    }
    return -1;
  }

  getStats(): {
    enabled: boolean;
    queueLength: number;
    busyWorkers: number;
    totalWorkers: number;
  } {
    return {
      enabled: true,
      queueLength: this.pendingTasks.size + this.taskQueue.length,
      busyWorkers: this.busyWorkers.size,
      totalWorkers: this.workerCount,
    };
  }

  getTelemetry(): {
    enabled: boolean;
    chunksGenerated: number;
    avgGenerationTimeMs: number;
    workersReady: number;
    duplicatesAvoided: number;
    queueLength: number;
    busyWorkers: number;
    inFlightChunks: number;
  } {
    return {
      enabled: true,
      chunksGenerated: this.totalTasksCompleted,
      avgGenerationTimeMs: this.totalTasksCompleted > 0 ? this.totalTaskTimeMs / this.totalTasksCompleted : 0,
      workersReady: this.readyWorkers.size,
      duplicatesAvoided: 0,
      queueLength: this.pendingTasks.size + this.taskQueue.length,
      busyWorkers: this.busyWorkers.size,
      inFlightChunks: this.busyWorkers.size,
    };
  }

  dispose(): void {
    this.disposed = true;

    const disposeError = new Error('Terrain worker pool disposed');

    // Reject every in-flight task so callers awaiting a bake don't hang
    // forever after a mode-switch/dispose race.
    for (const [requestId, pending] of this.pendingTasks) {
      this.settleRejection(requestId, pending, disposeError);
    }

    // Reject anything still waiting for a worker slot.
    const queued = this.taskQueue.splice(0, this.taskQueue.length);
    for (const task of queued) {
      task.reject(disposeError);
    }

    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.readyWorkers.clear();
    this.busyWorkers.clear();
    this.pendingTasks.clear();
    this.taskStartTimes.clear();
  }
}
