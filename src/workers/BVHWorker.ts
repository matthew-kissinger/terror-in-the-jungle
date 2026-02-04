/**
 * Custom BVH Worker wrapper for Vite compatibility
 *
 * three-mesh-bvh's GenerateMeshBVHWorker doesn't work in Vite dev mode
 * because import.meta.url resolves incorrectly for node_modules workers.
 *
 * This wrapper uses Vite's native ?worker syntax for proper bundling.
 * Based on three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js
 *
 * Uses a pool of workers for parallel BVH computation.
 */

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
// Import worker using Vite's native worker syntax
import BVHWorkerScript from './bvh.worker.js?worker';
import { Logger } from '../utils/Logger';

export interface BVHWorkerOptions {
  maxLeafTris?: number;
  setBoundingBox?: boolean;
  onProgress?: (progress: number) => void;
}

interface QueuedJob {
  geometry: THREE.BufferGeometry;
  options: BVHWorkerOptions;
  resolve: (bvh: MeshBVH) => void;
  reject: (error: Error) => void;
}

interface WorkerState {
  worker: Worker;
  busy: boolean;
}

/**
 * Pool of BVH workers for parallel computation
 */
export class ViteBVHWorker {
  private workers: WorkerState[] = [];
  private queue: QueuedJob[] = [];
  private readonly poolSize: number;

  constructor(poolSize: number = 4) {
    this.poolSize = poolSize;

    for (let i = 0; i < poolSize; i++) {
      try {
        const worker = new BVHWorkerScript();
        this.workers.push({ worker, busy: false });
      } catch (error) {
        Logger.error('workers', `[ViteBVHWorker] Failed to create worker ${i}:`, error);
      }
    }

    if (this.workers.length > 0) {
      Logger.info('workers', `[ViteBVHWorker] Pool initialized with ${this.workers.length} workers`);
    } else {
      Logger.error('workers', '[ViteBVHWorker] No workers could be created');
    }
  }

  async generate(geometry: THREE.BufferGeometry, options: BVHWorkerOptions = {}): Promise<MeshBVH> {
    if (this.workers.length === 0) {
      throw new Error('ViteBVHWorker: No workers available');
    }

    if (
      (geometry.getAttribute('position') as any)?.isInterleavedBufferAttribute ||
      (geometry.index as any)?.isInterleavedBufferAttribute
    ) {
      throw new Error('ViteBVHWorker: InterleavedBufferAttribute not supported');
    }

    // Find an available worker
    const availableWorker = this.workers.find(w => !w.busy);

    if (availableWorker) {
      return this.executeJob(availableWorker, geometry, options);
    }

    // No worker available, queue the job
    return new Promise((resolve, reject) => {
      this.queue.push({ geometry, options, resolve, reject });
    });
  }

  private async executeJob(
    workerState: WorkerState,
    geometry: THREE.BufferGeometry,
    options: BVHWorkerOptions
  ): Promise<MeshBVH> {
    workerState.busy = true;

    return new Promise((resolve, reject) => {
      const worker = workerState.worker;

      const cleanup = () => {
        workerState.busy = false;
        this.processQueue();
      };

      worker.onerror = (e) => {
        cleanup();
        reject(new Error(`ViteBVHWorker: ${e.message}`));
      };

      worker.onmessage = (e) => {
        const { data } = e;

        if (data.error) {
          cleanup();
          reject(new Error(data.error));
          return;
        }

        if (data.serialized) {
          const { serialized, position } = data;

          // Deserialize the BVH
          const bvh = MeshBVH.deserialize(serialized, geometry, { setIndex: false });

          // Replace the position array (it was transferred/neutered)
          (geometry.attributes.position as THREE.BufferAttribute).array = position;

          // Handle index if present
          if (serialized.index) {
            if (geometry.index) {
              geometry.index.array = serialized.index;
            } else {
              const newIndex = new THREE.BufferAttribute(serialized.index, 1, false);
              geometry.setIndex(newIndex);
            }
          }

          // Set bounding box if requested
          if (options.setBoundingBox !== false) {
            geometry.boundingBox = bvh.getBoundingBox(new THREE.Box3());
          }

          cleanup();
          resolve(bvh);
        } else if (options.onProgress && data.progress !== undefined) {
          options.onProgress(data.progress);
        }
      };

      // Get geometry data to transfer
      const index = geometry.index ? geometry.index.array : null;
      const position = geometry.attributes.position.array as Float32Array;

      const transferable: ArrayBuffer[] = [position.buffer as ArrayBuffer];
      if (index) {
        transferable.push((index as Float32Array).buffer as ArrayBuffer);
      }

      // Filter out SharedArrayBuffers (they can't be transferred)
      const toTransfer = transferable.filter(
        (v): v is ArrayBuffer => typeof SharedArrayBuffer === 'undefined' || !(v instanceof SharedArrayBuffer)
      );

      worker.postMessage(
        {
          index,
          position,
          options: {
            ...options,
            onProgress: null,
            includedProgressCallback: Boolean(options.onProgress),
            groups: [...geometry.groups],
          },
        },
        toTransfer
      );
    });
  }

  private processQueue(): void {
    if (this.queue.length === 0) return;

    // Find an available worker
    const availableWorker = this.workers.find(w => !w.busy);
    if (!availableWorker) return;

    const job = this.queue.shift()!;
    this.executeJob(availableWorker, job.geometry, job.options)
      .then(job.resolve)
      .catch(job.reject);
  }

  getStats(): { total: number; busy: number; queued: number } {
    return {
      total: this.workers.length,
      busy: this.workers.filter(w => w.busy).length,
      queued: this.queue.length
    };
  }

  dispose(): void {
    // Reject any queued jobs
    for (const job of this.queue) {
      job.reject(new Error('ViteBVHWorker: Worker disposed'));
    }
    this.queue = [];

    // Terminate all workers
    for (const workerState of this.workers) {
      workerState.worker.terminate();
    }
    this.workers = [];
  }
}