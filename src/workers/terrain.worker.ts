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

interface FlattenCircleStampConfig {
  kind: 'flatten_circle';
  centerX: number;
  centerZ: number;
  innerRadius: number;
  outerRadius: number;
  gradeRadius: number;
  gradeStrength: number;
  samplingRadius: number;
  targetHeightMode: 'center' | 'average' | 'max';
  heightOffset: number;
  priority: number;
  targetHeight: number;
}

interface FlattenCapsuleStampConfig {
  kind: 'flatten_capsule';
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  innerRadius: number;
  outerRadius: number;
  gradeRadius: number;
  gradeStrength: number;
  samplingRadius: number;
  targetHeightMode: 'center' | 'average' | 'max';
  heightOffset: number;
  priority: number;
  targetHeight: number;
}

interface StampedConfig {
  type: 'stamped';
  base: HeightProviderConfig;
  stamps: Array<FlattenCircleStampConfig | FlattenCapsuleStampConfig>;
}

type HeightProviderConfig = NoiseConfig | DEMConfig | StampedConfig;

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

let activeProviderConfig: HeightProviderConfig = { type: 'noise', seed: 12345 };
const noiseCache = new Map<number, WorkerNoise>();
const demBufferCache = new Map<ArrayBuffer, Float32Array>();

function getNoise(seed: number): WorkerNoise {
  let noise = noiseCache.get(seed);
  if (!noise) {
    noise = new WorkerNoise(seed);
    noiseCache.set(seed, noise);
  }
  return noise;
}

function getHeight(worldX: number, worldZ: number): number {
  return sampleProviderHeight(activeProviderConfig, worldX, worldZ);
}

function sampleProviderHeight(config: HeightProviderConfig, worldX: number, worldZ: number): number {
  switch (config.type) {
    case 'noise':
      return calculateNoiseHeight(worldX, worldZ, getNoise(config.seed));
    case 'dem': {
      let demData = demBufferCache.get(config.buffer);
      if (!demData) {
        demData = new Float32Array(config.buffer);
        demBufferCache.set(config.buffer, demData);
      }
      return sampleDEM(worldX, worldZ, demData, config.width, config.height, config.metersPerPixel, config.originX, config.originZ);
    }
    case 'stamped': {
      let height = sampleProviderHeight(config.base, worldX, worldZ);
      for (const stamp of config.stamps) {
        height = applyResolvedStamp(height, worldX, worldZ, stamp);
      }
      return height;
    }
    default:
      return 0;
  }
}

function applyResolvedStamp(
  baseHeight: number,
  worldX: number,
  worldZ: number,
  stamp: FlattenCircleStampConfig | FlattenCapsuleStampConfig,
): number {
  switch (stamp.kind) {
    case 'flatten_circle': {
      const dx = worldX - stamp.centerX;
      const dz = worldZ - stamp.centerZ;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance >= stamp.gradeRadius) {
        return baseHeight;
      }

      const targetHeight = stamp.targetHeight + stamp.heightOffset;
      const influence = getFlattenInfluence(distance, stamp);
      if (influence <= 0) {
        return baseHeight;
      }
      return baseHeight + (targetHeight - baseHeight) * influence;
    }
    case 'flatten_capsule': {
      const distance = distanceToSegment(
        worldX,
        worldZ,
        stamp.startX,
        stamp.startZ,
        stamp.endX,
        stamp.endZ,
      );
      if (distance >= stamp.gradeRadius) {
        return baseHeight;
      }

      const targetHeight = stamp.targetHeight + stamp.heightOffset;
      const influence = getFlattenInfluence(distance, stamp);
      if (influence <= 0) {
        return baseHeight;
      }
      return baseHeight + (targetHeight - baseHeight) * influence;
    }
    default:
      return baseHeight;
  }
}

function getFlattenInfluence(
  distance: number,
  stamp: Pick<FlattenCircleStampConfig | FlattenCapsuleStampConfig, 'innerRadius' | 'outerRadius' | 'gradeRadius' | 'gradeStrength'>,
): number {
  if (distance <= stamp.innerRadius) {
    return 1;
  }

  const gradeStrength = stamp.gradeRadius > stamp.outerRadius ? clamp(stamp.gradeStrength, 0, 1) : 0;
  if (distance <= stamp.outerRadius) {
    const innerBlend = smoothstep(stamp.outerRadius, stamp.innerRadius, distance);
    return gradeStrength + (1 - gradeStrength) * innerBlend;
  }

  if (gradeStrength <= 0) {
    return 0;
  }

  return gradeStrength * smoothstep(stamp.gradeRadius, stamp.outerRadius, distance);
}

function distanceToSegment(
  x: number,
  z: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
): number {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.0001) {
    return Math.hypot(x - startX, z - startZ);
  }
  const t = clamp(((x - startX) * dx + (z - startZ) * dz) / lengthSq, 0, 1);
  const nearestX = startX + dx * t;
  const nearestZ = startZ + dz * t;
  return Math.hypot(x - nearestX, z - nearestZ);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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
      activeProviderConfig = msg.config;
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
      if (activeProviderConfig.type === 'noise') {
        activeProviderConfig = { type: 'noise', seed };
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
