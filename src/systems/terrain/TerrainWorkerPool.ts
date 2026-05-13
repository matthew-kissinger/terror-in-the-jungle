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

/**
 * Clean worker pool for terrain operations.
 * Workers are proper ES module files bundled by Vite.
 */
export class TerrainWorkerPool {
  private workers: Worker[] = [];
  private readyWorkers: Set<number> = new Set();
  private busyWorkers: Set<number> = new Set();
  private pendingTasks: Map<number, {
    resolve: (data: any) => void;
    reject: (err: Error) => void;
    workerIdx: number;
  }> = new Map();
  private nextRequestId = 1;
  private workerCount: number;

  // Telemetry
  private totalTasksCompleted = 0;
  private totalTaskTimeMs = 0;
  private taskStartTimes: Map<number, number> = new Map();

  constructor(workerCount: number = navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency - 1, 4) : 2) {
    this.workerCount = workerCount;
    this.spawnWorkers();
  }

  private spawnWorkers(): void {
    if (typeof Worker === 'undefined') {
      Logger.warn('terrain-workers', 'Worker API not available (test environment)');
      return;
    }

    for (let i = 0; i < this.workerCount; i++) {
      try {
        const worker = new Worker(
          new URL('../../workers/terrain.worker.ts', import.meta.url),
          { type: 'module' },
        );

        worker.onmessage = (event) => this.handleMessage(i, event);
        worker.onerror = (err) => {
          Logger.error('terrain-workers', `Worker ${i} error:`, err.message);
        };

        this.workers.push(worker);
      } catch {
        Logger.warn('terrain-workers', `Failed to spawn worker ${i}`);
      }
    }
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

      // Telemetry
      const startTime = this.taskStartTimes.get(requestId);
      if (startTime) {
        this.totalTaskTimeMs += performance.now() - startTime;
        this.taskStartTimes.delete(requestId);
      }
      this.totalTasksCompleted++;

      pending.resolve(data);
    }
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
    const workerIdx = this.getAvailableWorker();
    if (workerIdx < 0) {
      throw new Error('No workers available for heightmap bake');
    }

    const requestId = this.nextRequestId++;
    this.busyWorkers.add(workerIdx);
    this.taskStartTimes.set(requestId, performance.now());

    return new Promise<TerrainSurfaceBakeResult>((resolve, reject) => {
      this.pendingTasks.set(requestId, {
        resolve: (data) => resolve({
          heightData: data.data as Float32Array,
          normalData: data.normalData as Uint8Array,
          gridSize: data.gridSize as number,
          worldSize: data.worldSize as number,
        }),
        reject,
        workerIdx,
      });

      this.workers[workerIdx].postMessage({
        ...message,
        requestId,
      }, transferables);
    });
  }

  /**
   * Generate terrain work units in worker space.
   * This remains available while terrain generation tasks are still message-based.
   */
  async generateChunk(
    chunkX: number, chunkZ: number,
    size: number, segments: number, seed: number,
  ): Promise<any> {
    const workerIdx = this.getAvailableWorker();
    if (workerIdx < 0) {
      throw new Error('No workers available for chunk generation');
    }

    const requestId = this.nextRequestId++;
    this.busyWorkers.add(workerIdx);
    this.taskStartTimes.set(requestId, performance.now());

    return new Promise((resolve, reject) => {
      this.pendingTasks.set(requestId, { resolve, reject, workerIdx });
      this.workers[workerIdx].postMessage({
        type: 'generate',
        requestId,
        chunkX,
        chunkZ,
        size,
        segments,
        seed,
      });
    });
  }

  private getAvailableWorker(): number {
    // Find a worker that is ready and not busy
    for (let i = 0; i < this.workerCount; i++) {
      if (!this.busyWorkers.has(i)) {
        return i;
      }
    }
    // All busy - queue to the least loaded (round-robin)
    return this.nextRequestId % this.workerCount;
  }

  getStats(): {
    enabled: boolean;
    queueLength: number;
    busyWorkers: number;
    totalWorkers: number;
  } {
    return {
      enabled: true,
      queueLength: this.pendingTasks.size,
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
      queueLength: this.pendingTasks.size,
      busyWorkers: this.busyWorkers.size,
      inFlightChunks: this.busyWorkers.size,
    };
  }

  dispose(): void {
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
