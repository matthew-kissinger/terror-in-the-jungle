/**
 * Parameterized heightmap generator for the terrain sandbox.
 *
 * Uses the shared `NoiseGenerator` primitive (same Perlin impl as the
 * main game's `NoiseHeightProvider`) but exposes the fBm parameters
 * (octaves, lacunarity, persistence, frequency, amplitude) as first-class
 * knobs. NOT a drop-in replacement for `NoiseHeightProvider`: the game's
 * terrain is a hand-tuned multi-band composition (continental + ridges +
 * valleys + hills + water carving) that is not parameter-shaped. The
 * sandbox's job is to explore the parameter space, not to mirror the
 * shipped algorithm.
 */

import { NoiseGenerator } from '../../utils/NoiseGenerator';

export interface HeightmapParams {
  seed: number;
  octaves: number;
  frequency: number;
  lacunarity: number;
  persistence: number;
  amplitude: number;
  warpStrength: number;
  warpFrequency: number;
  mapSizeMeters: number;
  resolution: number;
}

export const DEFAULT_HEIGHTMAP_PARAMS: HeightmapParams = {
  seed: 42,
  octaves: 5,
  frequency: 0.0015,
  lacunarity: 2.0,
  persistence: 0.5,
  amplitude: 120,
  warpStrength: 0,
  warpFrequency: 0.002,
  mapSizeMeters: 2000,
  resolution: 256,
};

export interface GeneratedHeightmap {
  data: Float32Array;
  resolution: number;
  mapSizeMeters: number;
  min: number;
  max: number;
  generationTimeMs: number;
}

const ALLOWED_RESOLUTIONS = [128, 256, 512, 1024, 2048] as const;

/** Clamp a parameter patch into allowed ranges. */
export function clampParams(raw: Partial<HeightmapParams>): HeightmapParams {
  const p = { ...DEFAULT_HEIGHTMAP_PARAMS, ...raw };
  p.seed = Math.max(1, Math.min(999999, Math.floor(p.seed)));
  p.octaves = Math.max(1, Math.min(8, Math.floor(p.octaves)));
  p.frequency = Math.max(0.0001, Math.min(0.01, p.frequency));
  p.lacunarity = Math.max(1.5, Math.min(3.0, p.lacunarity));
  p.persistence = Math.max(0.3, Math.min(0.7, p.persistence));
  p.amplitude = Math.max(10, Math.min(300, p.amplitude));
  p.warpStrength = Math.max(0, Math.min(100, p.warpStrength));
  p.warpFrequency = Math.max(0.0001, Math.min(0.01, p.warpFrequency));
  p.mapSizeMeters = Math.max(1000, Math.min(8000, p.mapSizeMeters));
  if (!(ALLOWED_RESOLUTIONS as readonly number[]).includes(p.resolution)) p.resolution = 256;
  return p;
}

/**
 * Same fBm formula as NoiseGenerator.fractalNoise but with explicit
 * lacunarity so we can expose the full (octaves, persistence, lacunarity)
 * triplet without editing the shared primitive.
 */
function fbm(
  noise: NoiseGenerator, x: number, y: number,
  octaves: number, persistence: number, lacunarity: number, baseFrequency: number,
): number {
  let value = 0, amplitude = 1, frequency = baseFrequency, maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise.noise(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return maxValue > 0 ? value / maxValue : 0;
}

/** Generate a heightmap grid (row-major, z-major). Output in meters. */
export function generateHeightmap(raw: Partial<HeightmapParams>): GeneratedHeightmap {
  const params = clampParams(raw);
  const { resolution, mapSizeMeters } = params;
  const half = mapSizeMeters / 2;
  const step = resolution > 1 ? mapSizeMeters / (resolution - 1) : 0;
  const noise = new NoiseGenerator(params.seed);
  // Decorrelated warp channel so warp direction isn't aligned with the base field.
  const warpNoise = new NoiseGenerator(params.seed ^ 0x5f3759df);

  const data = new Float32Array(resolution * resolution);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  for (let z = 0; z < resolution; z++) {
    const worldZ = -half + z * step;
    for (let x = 0; x < resolution; x++) {
      const worldX = -half + x * step;
      let sx = worldX, sz = worldZ;
      if (params.warpStrength > 0) {
        const wx = warpNoise.noise(worldX * params.warpFrequency, worldZ * params.warpFrequency);
        const wz = warpNoise.noise(worldZ * params.warpFrequency + 97.3, worldX * params.warpFrequency + 31.1);
        sx = worldX + wx * params.warpStrength;
        sz = worldZ + wz * params.warpStrength;
      }
      const h = fbm(noise, sx, sz, params.octaves, params.persistence, params.lacunarity, params.frequency) * params.amplitude;
      data[z * resolution + x] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    data, resolution, mapSizeMeters,
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
    generationTimeMs: t1 - t0,
  };
}
