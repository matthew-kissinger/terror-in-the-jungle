/**
 * Web Worker for terrain chunk generation
 *
 * Generates terrain geometry off the main thread:
 * - Height data from noise
 * - Vertex positions, normals, UVs
 * - Returns transferable ArrayBuffers for zero-copy transfer
 *
 * Based on patterns from:
 * - three-mesh-bvh worker implementation
 * - EthanHermsey/Nature dual-worker architecture
 */

// Noise implementation - MUST match src/utils/NoiseGenerator.ts exactly for seamless chunks
class WorkerNoise {
  private perm: number[] = [];
  private seed: number;

  constructor(seed: number = 12345) {
    this.seed = seed;
    const p: number[] = [];
    for (let i = 0; i < 256; i++) p[i] = i;

    // Seeded random - MUST match NoiseGenerator.seedRandom()
    let x = Math.sin(seed) * 10000;
    const seedRandom = (): number => {
      x = Math.sin(x) * 10000;
      return x - Math.floor(x);
    };

    // Shuffle with seeded random
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(seedRandom() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    // Duplicate for overflow
    this.perm = [...p, ...p];
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  // Gradient function - MUST match NoiseGenerator.grad()
  private grad(hash: number, x: number, y: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  // Noise function - MUST match NoiseGenerator.noise()
  noise(x: number, y: number): number {
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

interface ChunkRequest {
  type: 'generate';
  chunkX: number;
  chunkZ: number;
  size: number;
  segments: number;
  seed: number;
  requestId: number;
}

interface ChunkResult {
  type: 'result';
  requestId: number;
  chunkX: number;
  chunkZ: number;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  heightData: Float32Array;
}

let noiseGenerator: WorkerNoise | null = null;

/**
 * Calculate terrain height - same algorithm as HeightQueryCache
 */
function calculateHeight(worldX: number, worldZ: number, noise: WorkerNoise): number {
  // Continental/base terrain shape
  let continentalHeight = noise.noise(worldX * 0.001, worldZ * 0.001);

  // Mountain ridges
  let ridgeNoise = 1 - Math.abs(noise.noise(worldX * 0.003, worldZ * 0.003));
  ridgeNoise = Math.pow(ridgeNoise, 1.5);

  // Valley carving
  let valleyNoise = noise.noise(worldX * 0.008, worldZ * 0.008);
  valleyNoise = Math.pow(Math.abs(valleyNoise), 0.7) * Math.sign(valleyNoise);

  // Hills
  let hillNoise = 0;
  hillNoise += noise.noise(worldX * 0.015, worldZ * 0.015) * 0.5;
  hillNoise += noise.noise(worldX * 0.03, worldZ * 0.03) * 0.25;
  hillNoise += noise.noise(worldX * 0.06, worldZ * 0.06) * 0.125;

  // Fine details
  let detailNoise = noise.noise(worldX * 0.1, worldZ * 0.1) * 0.1;

  // Combine layers
  let height = 0;
  height += (continentalHeight * 0.5 + 0.5) * 30;

  // Smoothstep for ridge strength
  const t = Math.max(0, Math.min(1, (continentalHeight - (-0.3)) / (0.2 - (-0.3))));
  const ridgeStrength = t * t * (3 - 2 * t);
  height += ridgeNoise * 80 * ridgeStrength;
  height += valleyNoise * 40;
  height += hillNoise * 35;
  height += detailNoise * 8;

  // Water areas
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

/**
 * Generate chunk geometry data
 */
function generateChunk(request: ChunkRequest): ChunkResult {
  const { chunkX, chunkZ, size, segments, seed, requestId } = request;

  // Initialize noise if needed
  if (!noiseGenerator) {
    noiseGenerator = new WorkerNoise(seed);
  }

  const baseX = chunkX * size;
  const baseZ = chunkZ * size;
  const segmentSize = size / segments;

  // Calculate array sizes
  const vertexCount = (segments + 1) * (segments + 1);
  const indexCount = segments * segments * 6;

  // Allocate typed arrays
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);
  const heightData = new Float32Array(vertexCount);

  // Generate vertices
  let vertexIndex = 0;
  for (let z = 0; z <= segments; z++) {
    for (let x = 0; x <= segments; x++) {
      const worldX = baseX + x * segmentSize;
      const worldZ = baseZ + z * segmentSize;
      const height = calculateHeight(worldX, worldZ, noiseGenerator);

      // Position (centered in chunk)
      const posIndex = vertexIndex * 3;
      positions[posIndex] = x * segmentSize - size / 2;
      positions[posIndex + 1] = height;
      positions[posIndex + 2] = z * segmentSize - size / 2;

      // UV
      const uvIndex = vertexIndex * 2;
      uvs[uvIndex] = x / segments;
      uvs[uvIndex + 1] = z / segments;

      // Store height for later use
      heightData[vertexIndex] = height;

      vertexIndex++;
    }
  }

  // Generate indices
  let indexIndex = 0;
  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const topLeft = z * (segments + 1) + x;
      const topRight = topLeft + 1;
      const bottomLeft = (z + 1) * (segments + 1) + x;
      const bottomRight = bottomLeft + 1;

      // Two triangles per quad
      indices[indexIndex++] = topLeft;
      indices[indexIndex++] = bottomLeft;
      indices[indexIndex++] = topRight;

      indices[indexIndex++] = topRight;
      indices[indexIndex++] = bottomLeft;
      indices[indexIndex++] = bottomRight;
    }
  }

  // Calculate normals
  // First pass: accumulate face normals
  const normalAccum = new Float32Array(vertexCount * 3);

  for (let i = 0; i < indexCount; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    // Get vertices
    const ax = positions[i0], ay = positions[i0 + 1], az = positions[i0 + 2];
    const bx = positions[i1], by = positions[i1 + 1], bz = positions[i1 + 2];
    const cx = positions[i2], cy = positions[i2 + 1], cz = positions[i2 + 2];

    // Calculate edge vectors
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;

    // Cross product
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    // Accumulate to vertices
    normalAccum[i0] += nx; normalAccum[i0 + 1] += ny; normalAccum[i0 + 2] += nz;
    normalAccum[i1] += nx; normalAccum[i1 + 1] += ny; normalAccum[i1 + 2] += nz;
    normalAccum[i2] += nx; normalAccum[i2 + 1] += ny; normalAccum[i2 + 2] += nz;
  }

  // Second pass: normalize
  for (let i = 0; i < vertexCount; i++) {
    const idx = i * 3;
    const nx = normalAccum[idx];
    const ny = normalAccum[idx + 1];
    const nz = normalAccum[idx + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

    normals[idx] = nx / len;
    normals[idx + 1] = ny / len;
    normals[idx + 2] = nz / len;
  }

  return {
    type: 'result',
    requestId,
    chunkX,
    chunkZ,
    positions,
    normals,
    uvs,
    indices,
    heightData
  };
}

// Worker message handler
self.onmessage = function(event: MessageEvent<ChunkRequest>) {
  const request = event.data;

  if (request.type === 'generate') {
    const result = generateChunk(request);

    // Transfer ArrayBuffers (zero-copy)
    // Use type assertion for worker context (different from window.postMessage)
    (self as unknown as Worker).postMessage(result, [
      result.positions.buffer,
      result.normals.buffer,
      result.uvs.buffer,
      result.indices.buffer,
      result.heightData.buffer
    ]);
  }
};

// Signal worker is ready
(self as unknown as Worker).postMessage({ type: 'ready' });
