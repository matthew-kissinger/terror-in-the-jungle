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

interface ChunkRequest {
  chunkX: number;
  chunkZ: number;
  size: number;
  segments: number;
  seed: number;
  priority: number;
  resolve: (result: ChunkGeometryResult) => void;
  reject: (error: Error) => void;
}

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

interface WorkerState {
  worker: Worker;
  busy: boolean;
  currentRequest?: ChunkRequest;
}

export class ChunkWorkerPool {
  private workers: WorkerState[] = [];
  private queue: ChunkRequest[] = [];
  private requestId = 0;
  private pendingRequests: Map<number, ChunkRequest> = new Map();
  private readonly seed: number;
  private readonly segments: number;
  private isDisposed = false;

  // Deduplication: track chunks being generated
  private inFlightChunks: Map<string, Promise<ChunkGeometryResult>> = new Map();

  // Telemetry
  private telemetry = {
    chunksGenerated: 0,
    totalGenerationTimeMs: 0,
    avgGenerationTimeMs: 0,
    workersReady: 0,
    duplicatesAvoided: 0
  };

  constructor(
    workerCount: number = navigator.hardwareConcurrency || 4,
    seed: number = 12345,
    segments: number = 32
  ) {
    this.seed = seed;
    this.segments = segments;

    // Limit workers to reasonable count
    const count = Math.min(Math.max(2, workerCount), 8);
    console.log(`[ChunkWorkerPool] Creating ${count} workers`);

    for (let i = 0; i < count; i++) {
      this.createWorker();
    }
  }

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

  private getWorkerCode(): string {
    // Inline worker code - MUST match NoiseGenerator.ts exactly for seamless chunks
    return `
// Noise implementation - matches src/utils/NoiseGenerator.ts exactly
class WorkerNoise {
  constructor(seed = 12345) {
    this.seed = seed;
    this.perm = [];
    const p = [];
    for (let i = 0; i < 256; i++) p[i] = i;

    // Seeded random - MUST match NoiseGenerator.seedRandom()
    let x = Math.sin(seed) * 10000;
    const seedRandom = () => {
      x = Math.sin(x) * 10000;
      return x - Math.floor(x);
    };

    // Shuffle with seeded random
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(seedRandom() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = [...p, ...p];
  }

  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  lerp(a, b, t) { return a + t * (b - a); }

  // Gradient function - MUST match NoiseGenerator.grad()
  grad(hash, x, y) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  // Noise function - MUST match NoiseGenerator.noise()
  noise(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);

    // Permutation lookups - MUST match NoiseGenerator
    const A = this.perm[X] + Y;
    const AA = this.perm[A];
    const AB = this.perm[A + 1];
    const B = this.perm[X + 1] + Y;
    const BA = this.perm[B];
    const BB = this.perm[B + 1];

    return this.lerp(
      this.lerp(
        this.grad(this.perm[AA], x, y),
        this.grad(this.perm[BA], x - 1, y),
        u
      ),
      this.lerp(
        this.grad(this.perm[AB], x, y - 1),
        this.grad(this.perm[BB], x - 1, y - 1),
        u
      ),
      v
    );
  }
}

let noiseGenerator = null;

function calculateHeight(worldX, worldZ, noise) {
  let continentalHeight = noise.noise(worldX * 0.001, worldZ * 0.001);
  let ridgeNoise = 1 - Math.abs(noise.noise(worldX * 0.003, worldZ * 0.003));
  ridgeNoise = Math.pow(ridgeNoise, 1.5);
  let valleyNoise = noise.noise(worldX * 0.008, worldZ * 0.008);
  valleyNoise = Math.pow(Math.abs(valleyNoise), 0.7) * Math.sign(valleyNoise);
  let hillNoise = 0;
  hillNoise += noise.noise(worldX * 0.015, worldZ * 0.015) * 0.5;
  hillNoise += noise.noise(worldX * 0.03, worldZ * 0.03) * 0.25;
  hillNoise += noise.noise(worldX * 0.06, worldZ * 0.06) * 0.125;
  let detailNoise = noise.noise(worldX * 0.1, worldZ * 0.1) * 0.1;

  let height = 0;
  height += (continentalHeight * 0.5 + 0.5) * 30;
  const t = Math.max(0, Math.min(1, (continentalHeight - (-0.3)) / (0.2 - (-0.3))));
  const ridgeStrength = t * t * (3 - 2 * t);
  height += ridgeNoise * 80 * ridgeStrength;
  height += valleyNoise * 40;
  height += hillNoise * 35;
  height += detailNoise * 8;

  const waterNoise = noise.noise(worldX * 0.003, worldZ * 0.003);
  const riverNoise = noise.noise(worldX * 0.01, worldZ * 0.01);
  if (waterNoise < -0.4 && height < 15) {
    height = -3 - waterNoise * 2;
  } else if (Math.abs(riverNoise) < 0.1 && height < 25) {
    height = height * 0.3 - 2;
  } else if (height < 20) {
    height = height * 0.7;
  }
  return Math.max(-8, height);
}

function generateChunk(request) {
  const { chunkX, chunkZ, size, segments, seed, requestId } = request;
  if (!noiseGenerator) noiseGenerator = new WorkerNoise(seed);

  const baseX = chunkX * size;
  const baseZ = chunkZ * size;
  const segmentSize = size / segments;
  const vertexCount = (segments + 1) * (segments + 1);
  const indexCount = segments * segments * 6;

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);
  const heightData = new Float32Array(vertexCount);

  let vertexIndex = 0;
  for (let z = 0; z <= segments; z++) {
    for (let x = 0; x <= segments; x++) {
      const worldX = baseX + x * segmentSize;
      const worldZ = baseZ + z * segmentSize;
      const height = calculateHeight(worldX, worldZ, noiseGenerator);
      const posIndex = vertexIndex * 3;
      positions[posIndex] = x * segmentSize - size / 2;
      positions[posIndex + 1] = height;
      positions[posIndex + 2] = z * segmentSize - size / 2;
      const uvIndex = vertexIndex * 2;
      uvs[uvIndex] = x / segments;
      uvs[uvIndex + 1] = z / segments;
      heightData[vertexIndex] = height;
      vertexIndex++;
    }
  }

  let indexIndex = 0;
  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const topLeft = z * (segments + 1) + x;
      const topRight = topLeft + 1;
      const bottomLeft = (z + 1) * (segments + 1) + x;
      const bottomRight = bottomLeft + 1;
      indices[indexIndex++] = topLeft;
      indices[indexIndex++] = bottomLeft;
      indices[indexIndex++] = topRight;
      indices[indexIndex++] = topRight;
      indices[indexIndex++] = bottomLeft;
      indices[indexIndex++] = bottomRight;
    }
  }

  const normalAccum = new Float32Array(vertexCount * 3);
  for (let i = 0; i < indexCount; i += 3) {
    const i0 = indices[i] * 3, i1 = indices[i + 1] * 3, i2 = indices[i + 2] * 3;
    const ax = positions[i0], ay = positions[i0 + 1], az = positions[i0 + 2];
    const bx = positions[i1], by = positions[i1 + 1], bz = positions[i1 + 2];
    const cx = positions[i2], cy = positions[i2 + 1], cz = positions[i2 + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    normalAccum[i0] += nx; normalAccum[i0 + 1] += ny; normalAccum[i0 + 2] += nz;
    normalAccum[i1] += nx; normalAccum[i1 + 1] += ny; normalAccum[i1 + 2] += nz;
    normalAccum[i2] += nx; normalAccum[i2 + 1] += ny; normalAccum[i2 + 2] += nz;
  }
  for (let i = 0; i < vertexCount; i++) {
    const idx = i * 3;
    const nx = normalAccum[idx], ny = normalAccum[idx + 1], nz = normalAccum[idx + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    normals[idx] = nx / len;
    normals[idx + 1] = ny / len;
    normals[idx + 2] = nz / len;
  }

  // Generate vegetation positions (moved from main thread)
  const vegetationData = generateVegetationPositions(chunkX, chunkZ, size, heightData, segments);

  return {
    type: 'result',
    requestId,
    chunkX,
    chunkZ,
    positions,
    normals,
    uvs,
    indices,
    heightData,
    vegetation: vegetationData
  };
}

// Poisson disk sampling for natural distribution
function poissonDiskSampling(width, height, minDist) {
  const cellSize = minDist / Math.sqrt(2);
  const gridWidth = Math.ceil(width / cellSize);
  const gridHeight = Math.ceil(height / cellSize);
  const grid = new Array(gridWidth * gridHeight).fill(-1);
  const points = [];
  const active = [];

  const addPoint = (x, y) => {
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    if (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight) {
      grid[gy * gridWidth + gx] = points.length;
      points.push({ x, y });
      active.push(points.length - 1);
    }
  };

  // Start with random point
  addPoint(Math.random() * width, Math.random() * height);

  while (active.length > 0 && points.length < 500) {
    const idx = Math.floor(Math.random() * active.length);
    const point = points[active[idx]];
    let found = false;

    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minDist + Math.random() * minDist;
      const nx = point.x + Math.cos(angle) * dist;
      const ny = point.y + Math.sin(angle) * dist;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const gx = Math.floor(nx / cellSize);
      const gy = Math.floor(ny / cellSize);
      let valid = true;

      for (let dy = -2; dy <= 2 && valid; dy++) {
        for (let dx = -2; dx <= 2 && valid; dx++) {
          const checkX = gx + dx;
          const checkY = gy + dy;
          if (checkX >= 0 && checkX < gridWidth && checkY >= 0 && checkY < gridHeight) {
            const checkIdx = grid[checkY * gridWidth + checkX];
            if (checkIdx !== -1) {
              const other = points[checkIdx];
              const distSq = (nx - other.x) ** 2 + (ny - other.y) ** 2;
              if (distSq < minDist * minDist) valid = false;
            }
          }
        }
      }

      if (valid) {
        addPoint(nx, ny);
        found = true;
        break;
      }
    }

    if (!found) active.splice(idx, 1);
  }

  return points;
}

function getHeightAtLocal(heightData, segments, size, localX, localZ) {
  localX = Math.max(0, Math.min(size, localX));
  localZ = Math.max(0, Math.min(size, localZ));

  const gridX = (localX / size) * segments;
  const gridZ = (localZ / size) * segments;

  const x0 = Math.floor(gridX);
  const x1 = Math.min(x0 + 1, segments);
  const z0 = Math.floor(gridZ);
  const z1 = Math.min(z0 + 1, segments);

  const fx = gridX - x0;
  const fz = gridZ - z0;

  const getIndex = (x, z) => z * (segments + 1) + x;

  const h00 = heightData[getIndex(x0, z0)];
  const h10 = heightData[getIndex(x1, z0)];
  const h01 = heightData[getIndex(x0, z1)];
  const h11 = heightData[getIndex(x1, z1)];

  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;

  return h0 * (1 - fz) + h1 * fz;
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function generateVegetationPositions(chunkX, chunkZ, size, heightData, segments) {
  const baseX = chunkX * size;
  const baseZ = chunkZ * size;
  const DENSITY_PER_UNIT = 1.0 / 128.0;

  const vegetation = {
    fern: [],
    elephantEar: [],
    fanPalm: [],
    coconut: [],
    areca: [],
    dipterocarp: [],
    banyan: []
  };

  // Ferns - dense ground cover
  const fernCount = Math.floor(size * size * DENSITY_PER_UNIT * 6.0);
  for (let i = 0; i < fernCount; i++) {
    const localX = Math.random() * size;
    const localZ = Math.random() * size;
    const height = getHeightAtLocal(heightData, segments, size, localX, localZ);
    vegetation.fern.push({
      x: baseX + localX, y: height + 0.2, z: baseZ + localZ,
      sx: randomInRange(2.4, 3.6), sy: randomInRange(2.4, 3.6)
    });
  }

  // Elephant ear
  const elephantEarCount = Math.floor(size * size * DENSITY_PER_UNIT * 0.8);
  for (let i = 0; i < elephantEarCount; i++) {
    const localX = Math.random() * size;
    const localZ = Math.random() * size;
    const height = getHeightAtLocal(heightData, segments, size, localX, localZ);
    vegetation.elephantEar.push({
      x: baseX + localX, y: height + 0.8, z: baseZ + localZ,
      sx: randomInRange(1.0, 1.5), sy: randomInRange(1.0, 1.5)
    });
  }

  // Fan Palm
  const fanPalmCount = Math.floor(size * size * DENSITY_PER_UNIT * 0.5);
  for (let i = 0; i < fanPalmCount; i++) {
    const localX = Math.random() * size;
    const localZ = Math.random() * size;
    const height = getHeightAtLocal(heightData, segments, size, localX, localZ);
    vegetation.fanPalm.push({
      x: baseX + localX, y: height + 0.6, z: baseZ + localZ,
      sx: randomInRange(0.8, 1.2), sy: randomInRange(0.8, 1.2)
    });
  }

  // Coconut palms - Poisson distributed
  const coconutPoints = poissonDiskSampling(size, size, 12);
  const maxCoconuts = Math.floor(size * size * DENSITY_PER_UNIT * 0.3);
  for (let i = 0; i < Math.min(coconutPoints.length * 0.5, maxCoconuts); i++) {
    const point = coconutPoints[i];
    const height = getHeightAtLocal(heightData, segments, size, point.x, point.y);
    if (Math.random() < 0.8) {
      vegetation.coconut.push({
        x: baseX + point.x, y: height + 2.0, z: baseZ + point.y,
        sx: randomInRange(0.8, 1.0), sy: randomInRange(0.9, 1.1)
      });
    }
  }

  // Areca palms - Poisson distributed
  const arecaPoints = poissonDiskSampling(size, size, 8);
  const maxAreca = Math.floor(size * size * DENSITY_PER_UNIT * 0.4);
  for (let i = 0; i < Math.min(arecaPoints.length * 0.8, maxAreca); i++) {
    const point = arecaPoints[i];
    const height = getHeightAtLocal(heightData, segments, size, point.x, point.y);
    vegetation.areca.push({
      x: baseX + point.x, y: height + 1.6, z: baseZ + point.y,
      sx: randomInRange(0.8, 1.0), sy: randomInRange(0.8, 1.0)
    });
  }

  // Giant trees - Poisson distributed
  const giantTreePoints = poissonDiskSampling(size, size, 16);
  const maxGiantTrees = Math.floor(size * size * DENSITY_PER_UNIT * 0.15);
  for (let i = 0; i < Math.min(giantTreePoints.length, maxGiantTrees); i++) {
    const point = giantTreePoints[i];
    const height = getHeightAtLocal(heightData, segments, size, point.x, point.y);
    if (i % 2 === 0) {
      vegetation.dipterocarp.push({
        x: baseX + point.x, y: height + 8.0, z: baseZ + point.y,
        sx: randomInRange(0.9, 1.1), sy: randomInRange(0.9, 1.1)
      });
    } else {
      vegetation.banyan.push({
        x: baseX + point.x, y: height + 7.0, z: baseZ + point.y,
        sx: randomInRange(0.9, 1.1), sy: randomInRange(0.9, 1.1)
      });
    }
  }

  return vegetation;
}

self.onmessage = function(event) {
  const request = event.data;
  if (request.type === 'generate') {
    const result = generateChunk(request);
    self.postMessage(result, [
      result.positions.buffer,
      result.normals.buffer,
      result.uvs.buffer,
      result.indices.buffer,
      result.heightData.buffer
    ]);
  }
};
self.postMessage({ type: 'ready' });
`;
  }

  private handleWorkerMessage(state: WorkerState, event: MessageEvent): void {
    const data = event.data;

    if (data.type === 'ready') {
      this.telemetry.workersReady++;
      console.log(`[ChunkWorkerPool] Worker ready (${this.telemetry.workersReady}/${this.workers.length})`);
      this.processQueue();
      return;
    }

    if (data.type === 'result') {
      const request = this.pendingRequests.get(data.requestId);
      if (request) {
        this.pendingRequests.delete(data.requestId);

        // Track telemetry
        const generationTime = performance.now() - (request as any).startTime;
        this.telemetry.chunksGenerated++;
        this.telemetry.totalGenerationTimeMs += generationTime;
        this.telemetry.avgGenerationTimeMs = this.telemetry.totalGenerationTimeMs / this.telemetry.chunksGenerated;

        // Create Three.js geometry from transferred data
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2));
        geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));

        const result: ChunkGeometryResult = {
          chunkX: data.chunkX,
          chunkZ: data.chunkZ,
          geometry,
          heightData: data.heightData,
          vegetation: data.vegetation
        };

        // Clear from in-flight tracking
        const chunkKey = `${data.chunkX},${data.chunkZ}`;
        this.inFlightChunks.delete(chunkKey);

        request.resolve(result);
      }

      state.busy = false;
      state.currentRequest = undefined;
      this.processQueue();
    }
  }

  private handleWorkerError(state: WorkerState, error: ErrorEvent): void {
    console.error('[ChunkWorkerPool] Worker error:', error);

    if (state.currentRequest) {
      state.currentRequest.reject(new Error(error.message));
      this.pendingRequests.delete(this.requestId);
    }

    state.busy = false;
    state.currentRequest = undefined;
    this.processQueue();
  }

  private processQueue(): void {
    if (this.isDisposed) return;

    // Sort queue by priority (lower = higher priority)
    this.queue.sort((a, b) => a.priority - b.priority);

    // Find idle workers and assign work
    for (const state of this.workers) {
      if (!state.busy && this.queue.length > 0) {
        const request = this.queue.shift()!;
        this.assignWork(state, request);
      }
    }
  }

  private assignWork(state: WorkerState, request: ChunkRequest): void {
    state.busy = true;
    state.currentRequest = request;

    const id = this.requestId++;
    this.pendingRequests.set(id, request);

    state.worker.postMessage({
      type: 'generate',
      requestId: id,
      chunkX: request.chunkX,
      chunkZ: request.chunkZ,
      size: request.size,
      segments: request.segments,
      seed: request.seed
    });
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
    const chunkKey = `${chunkX},${chunkZ}`;
    const existingPromise = this.inFlightChunks.get(chunkKey);
    if (existingPromise) {
      this.telemetry.duplicatesAvoided++;
      return existingPromise;
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

      this.queue.push(request);
      this.processQueue();
    });

    // Track in-flight
    this.inFlightChunks.set(chunkKey, promise);
    return promise;
  }

  /**
   * Cancel pending requests for a chunk
   */
  cancelChunk(chunkX: number, chunkZ: number): void {
    this.queue = this.queue.filter(
      r => r.chunkX !== chunkX || r.chunkZ !== chunkZ
    );
  }

  /**
   * Get queue statistics
   */
  getStats(): { queueLength: number; busyWorkers: number; totalWorkers: number } {
    return {
      queueLength: this.queue.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      totalWorkers: this.workers.length
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
    return {
      ...this.telemetry,
      queueLength: this.queue.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      inFlightChunks: this.inFlightChunks.size
    };
  }

  /**
   * Dispose all workers
   */
  dispose(): void {
    this.isDisposed = true;
    this.queue = [];
    this.pendingRequests.clear();

    for (const state of this.workers) {
      state.worker.terminate();
    }
    this.workers = [];

    console.log('[ChunkWorkerPool] Disposed');
  }
}
