import { NoiseGenerator } from '../../utils/NoiseGenerator';
import { MathUtils } from '../../utils/Math';
import type { IHeightProvider, HeightProviderConfig } from './IHeightProvider';

/**
 * Procedural terrain height via multi-layer noise composition.
 * Single source of truth for the noise-based terrain algorithm - replaces
 * the duplicated logic that was in ChunkHeightGenerator, HeightQueryCache,
 * and ChunkWorkerCode.
 */
export class NoiseHeightProvider implements IHeightProvider {
  private noiseGenerator: NoiseGenerator;
  private readonly seed: number;

  constructor(seed: number = 12345) {
    this.seed = seed;
    this.noiseGenerator = new NoiseGenerator(seed);
  }

  getHeightAt(worldX: number, worldZ: number): number {
    return NoiseHeightProvider.calculateHeight(worldX, worldZ, this.noiseGenerator);
  }

  getWorkerConfig(): HeightProviderConfig {
    return { type: 'noise', seed: this.seed };
  }

  /**
   * Static method used by both the class instance and the worker code.
   * Keeps the canonical noise algorithm in one place.
   */
  static calculateHeight(worldX: number, worldZ: number, noise: NoiseGenerator): number {
    // Continental/base terrain shape (very low frequency)
    let continentalHeight = noise.noise(worldX * 0.001, worldZ * 0.001);

    // Mountain ridges using ridge noise (inverted absolute value)
    let ridgeNoise = 1 - Math.abs(noise.noise(worldX * 0.003, worldZ * 0.003));
    ridgeNoise = Math.pow(ridgeNoise, 1.5);

    // Valley carving using erosion-like shaping
    let valleyNoise = noise.noise(worldX * 0.008, worldZ * 0.008);
    valleyNoise = Math.pow(Math.abs(valleyNoise), 0.7) * Math.sign(valleyNoise);

    // Hills and medium features with varying persistence
    let hillNoise = 0;
    hillNoise += noise.noise(worldX * 0.015, worldZ * 0.015) * 0.5;
    hillNoise += noise.noise(worldX * 0.03, worldZ * 0.03) * 0.25;
    hillNoise += noise.noise(worldX * 0.06, worldZ * 0.06) * 0.125;

    // Fine details
    const detailNoise = noise.noise(worldX * 0.1, worldZ * 0.1) * 0.1;

    // Combine layers
    let height = 0;

    // Base elevation influenced by continental noise
    height += (continentalHeight * 0.5 + 0.5) * 30;

    // Add mountain ridges with smooth transitions
    const ridgeStrength = MathUtils.smoothstep(-0.3, 0.2, continentalHeight);
    height += ridgeNoise * 80 * ridgeStrength;

    // Carve valleys
    height += valleyNoise * 40;

    // Add hills with persistence falloff
    height += hillNoise * 35;

    // Add fine details
    height += detailNoise * 8;

    // Create water areas (lakes and rivers)
    const waterNoise = noise.noise(worldX * 0.003, worldZ * 0.003);
    const riverNoise = noise.noise(worldX * 0.01, worldZ * 0.01);

    // Lakes in low-lying areas
    if (waterNoise < -0.4 && height < 15) {
      height = -3 - waterNoise * 2; // Below water level (0)
    }
    // River valleys
    else if (Math.abs(riverNoise) < 0.1 && height < 25) {
      height = height * 0.3 - 2;
    }
    // Smooth lower valleys
    else if (height < 20) {
      height = height * 0.7;
    }

    // Allow negative heights for underwater terrain
    height = Math.max(-8, height);

    return height;
  }
}
