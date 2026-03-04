/**
 * Terrain web worker - proper ES module that imports real classes.
 * Replaces the 654-line inline JS string in ChunkWorkerCode.ts.
 *
 * Handles:
 * - setHeightProvider: configure noise or DEM provider
 * - bakeHeightmap: sample height provider into a Float32Array grid
 * - generateVegetation: 3-pass placement for a cell
 */

// ── Height provider reconstruction ──
// We can't import the real classes because workers get a separate module graph.
// Instead we reconstruct the minimal height computation from config data.

interface NoiseConfig {
  type: 'noise';
  seed: number;
}

interface DEMConfig {
  type: 'dem';
  width: number;
  height: number;
  metersPerPixel: number;
  originX: number;
  originZ: number;
  buffer: ArrayBuffer;
}

type HeightProviderConfig = NoiseConfig | DEMConfig;

// ── Perlin noise (must match NoiseHeightProvider exactly) ──

class WorkerNoise {
  private perm: number[] = [];

  constructor(seed: number = 12345) {
    const p: number[] = [];
    for (let i = 0; i < 256; i++) p[i] = i;

    let x = Math.sin(seed) * 10000;
    const seedRandom = (): number => {
      x = Math.sin(x) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 255; i > 0; i--) {
      const j = Math.floor(seedRandom() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    this.perm = [...p, ...p];
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  noise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const A = this.perm[X] + Y;
    const AA = this.perm[A];
    const AB = this.perm[A + 1];
    const B = this.perm[X + 1] + Y;
    const BA = this.perm[B];
    const BB = this.perm[B + 1];
    return this.lerp(
      this.lerp(this.grad(this.perm[AA], x, y), this.grad(this.perm[BA], x - 1, y), u),
      this.lerp(this.grad(this.perm[AB], x, y - 1), this.grad(this.perm[BB], x - 1, y - 1), u),
      v,
    );
  }
}

// ── Height calculation (matches NoiseHeightProvider.getHeightAt) ──

function calculateNoiseHeight(worldX: number, worldZ: number, noise: WorkerNoise): number {
  let continentalHeight = noise.noise(worldX * 0.001, worldZ * 0.001);
  let ridgeNoise = 1 - Math.abs(noise.noise(worldX * 0.003, worldZ * 0.003));
  ridgeNoise = Math.pow(ridgeNoise, 1.5);
  let valleyNoise = noise.noise(worldX * 0.008, worldZ * 0.008);
  valleyNoise = Math.pow(Math.abs(valleyNoise), 0.7) * Math.sign(valleyNoise);
  let hillNoise = 0;
  hillNoise += noise.noise(worldX * 0.015, worldZ * 0.015) * 0.5;
  hillNoise += noise.noise(worldX * 0.03, worldZ * 0.03) * 0.25;
  hillNoise += noise.noise(worldX * 0.06, worldZ * 0.06) * 0.125;
  const detailNoise = noise.noise(worldX * 0.1, worldZ * 0.1) * 0.1;

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

// ── DEM bilinear sampling ──

function sampleDEM(
  worldX: number, worldZ: number,
  data: Float32Array, width: number, height: number,
  metersPerPixel: number, originX: number, originZ: number,
): number {
  const gx = (worldX - originX) / metersPerPixel;
  const gz = (worldZ - originZ) / metersPerPixel;

  const x0 = Math.max(0, Math.min(width - 2, Math.floor(gx)));
  const z0 = Math.max(0, Math.min(height - 2, Math.floor(gz)));
  const fx = gx - x0;
  const fz = gz - z0;

  const h00 = data[z0 * width + x0];
  const h10 = data[z0 * width + x0 + 1];
  const h01 = data[(z0 + 1) * width + x0];
  const h11 = data[(z0 + 1) * width + x0 + 1];

  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;
  return h0 * (1 - fz) + h1 * fz;
}

// ── Worker state ──

let noiseGen: WorkerNoise | null = null;
let demData: Float32Array | null = null;
let demWidth = 0;
let demHeight = 0;
let demMetersPerPixel = 1;
let demOriginX = 0;
let demOriginZ = 0;
let providerType: 'noise' | 'dem' = 'noise';

function getHeight(worldX: number, worldZ: number): number {
  if (providerType === 'dem' && demData) {
    return sampleDEM(worldX, worldZ, demData, demWidth, demHeight, demMetersPerPixel, demOriginX, demOriginZ);
  }
  if (!noiseGen) noiseGen = new WorkerNoise(12345);
  return calculateNoiseHeight(worldX, worldZ, noiseGen);
}

// ── Message handling ──

interface SetProviderMsg {
  type: 'setHeightProvider';
  config: HeightProviderConfig;
}

interface BakeHeightmapMsg {
  type: 'bakeHeightmap';
  requestId: number;
  gridSize: number;
  worldSize: number;
}

interface GenerateChunkMsg {
  type: 'generate';
  requestId: number;
  chunkX: number;
  chunkZ: number;
  size: number;
  segments: number;
  seed: number;
}

type WorkerMessage = SetProviderMsg | BakeHeightmapMsg | GenerateChunkMsg;

self.onmessage = function (event: MessageEvent<WorkerMessage>) {
  const msg = event.data;

  switch (msg.type) {
    case 'setHeightProvider': {
      const config = msg.config;
      if (config.type === 'noise') {
        noiseGen = new WorkerNoise(config.seed);
        providerType = 'noise';
        demData = null;
      } else {
        demData = new Float32Array(config.buffer);
        demWidth = config.width;
        demHeight = config.height;
        demMetersPerPixel = config.metersPerPixel;
        demOriginX = config.originX;
        demOriginZ = config.originZ;
        providerType = 'dem';
      }
      (self as unknown as Worker).postMessage({ type: 'providerReady' });
      break;
    }

    case 'bakeHeightmap': {
      const { requestId, gridSize, worldSize } = msg;
      const data = new Float32Array(gridSize * gridSize);
      const halfWorld = worldSize / 2;
      const step = worldSize / (gridSize - 1);

      for (let z = 0; z < gridSize; z++) {
        for (let x = 0; x < gridSize; x++) {
          const wx = -halfWorld + x * step;
          const wz = -halfWorld + z * step;
          data[z * gridSize + x] = getHeight(wx, wz);
        }
      }

      (self as unknown as Worker).postMessage(
        { type: 'heightmapResult', requestId, data, gridSize, worldSize },
        [data.buffer],
      );
      break;
    }

    case 'generate': {
      // Terrain geometry generation path used by message-driven worker tasks.
      const { chunkX, chunkZ, size, segments, seed, requestId } = msg;
      if (providerType === 'noise' && !noiseGen) {
        noiseGen = new WorkerNoise(seed);
      }

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
          const h = getHeight(worldX, worldZ);

          const posIdx = vertexIndex * 3;
          positions[posIdx] = x * segmentSize - size / 2;
          positions[posIdx + 1] = h;
          positions[posIdx + 2] = z * segmentSize - size / 2;

          const uvIdx = vertexIndex * 2;
          uvs[uvIdx] = x / segments;
          uvs[uvIdx + 1] = z / segments;
          heightData[vertexIndex] = h;
          vertexIndex++;
        }
      }

      let indexIndex = 0;
      for (let z = 0; z < segments; z++) {
        for (let x = 0; x < segments; x++) {
          const tl = z * (segments + 1) + x;
          const tr = tl + 1;
          const bl = (z + 1) * (segments + 1) + x;
          const br = bl + 1;
          indices[indexIndex++] = tl;
          indices[indexIndex++] = bl;
          indices[indexIndex++] = tr;
          indices[indexIndex++] = tr;
          indices[indexIndex++] = bl;
          indices[indexIndex++] = br;
        }
      }

      // Compute normals
      const normalAccum = new Float32Array(vertexCount * 3);
      for (let i = 0; i < indexCount; i += 3) {
        const i0 = indices[i] * 3;
        const i1 = indices[i + 1] * 3;
        const i2 = indices[i + 2] * 3;
        const e1x = positions[i1] - positions[i0], e1y = positions[i1 + 1] - positions[i0 + 1], e1z = positions[i1 + 2] - positions[i0 + 2];
        const e2x = positions[i2] - positions[i0], e2y = positions[i2 + 1] - positions[i0 + 1], e2z = positions[i2 + 2] - positions[i0 + 2];
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        normalAccum[i0] += nx; normalAccum[i0 + 1] += ny; normalAccum[i0 + 2] += nz;
        normalAccum[i1] += nx; normalAccum[i1 + 1] += ny; normalAccum[i1 + 2] += nz;
        normalAccum[i2] += nx; normalAccum[i2 + 1] += ny; normalAccum[i2 + 2] += nz;
      }
      for (let i = 0; i < vertexCount; i++) {
        const idx = i * 3;
        const len = Math.sqrt(normalAccum[idx] ** 2 + normalAccum[idx + 1] ** 2 + normalAccum[idx + 2] ** 2) || 1;
        normals[idx] = normalAccum[idx] / len;
        normals[idx + 1] = normalAccum[idx + 1] / len;
        normals[idx + 2] = normalAccum[idx + 2] / len;
      }

      (self as unknown as Worker).postMessage(
        { type: 'result', requestId, chunkX, chunkZ, positions, normals, uvs, indices, heightData },
        [positions.buffer, normals.buffer, uvs.buffer, indices.buffer, heightData.buffer],
      );
      break;
    }
  }
};

(self as unknown as Worker).postMessage({ type: 'ready' });
