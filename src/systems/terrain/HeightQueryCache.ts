import * as THREE from 'three';
import { NoiseGenerator } from '../../utils/NoiseGenerator';

/**
 * CPU-side height query system that generates terrain height directly from noise.
 * Always returns valid heights regardless of chunk loading state.
 * Uses LRU cache for performance on repeated queries.
 */
export class HeightQueryCache {
  private noiseGenerator: NoiseGenerator;
  private cache: Map<string, number> = new Map();
  private readonly maxCacheSize: number;
  private readonly CACHE_RESOLUTION = 0.5; // Snap queries to 0.5m grid for cache hits

  constructor(seed: number = 12345, maxCacheSize: number = 10000) {
    this.noiseGenerator = new NoiseGenerator(seed);
    this.maxCacheSize = maxCacheSize;
  }

  /**
   * Get terrain height at world coordinates.
   * Uses same algorithm as ImprovedChunk for consistency.
   */
  getHeightAt(worldX: number, worldZ: number): number {
    // Snap to grid for cache efficiency
    const snapX = Math.round(worldX / this.CACHE_RESOLUTION) * this.CACHE_RESOLUTION;
    const snapZ = Math.round(worldZ / this.CACHE_RESOLUTION) * this.CACHE_RESOLUTION;
    const key = `${snapX},${snapZ}`;

    // Check cache
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // Generate height from noise
    const height = this.calculateHeight(snapX, snapZ);

    // Add to cache
    this.cache.set(key, height);

    // Evict oldest if over limit
    if (this.cache.size > this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    return height;
  }

  /**
   * Calculate terrain height using the same algorithm as ImprovedChunk.
   * This ensures perfect consistency between CPU queries and visual terrain.
   */
  private calculateHeight(worldX: number, worldZ: number): number {
    // Continental/base terrain shape (very low frequency)
    let continentalHeight = this.noiseGenerator.noise(worldX * 0.001, worldZ * 0.001);

    // Mountain ridges using ridge noise (inverted absolute value)
    let ridgeNoise = 1 - Math.abs(this.noiseGenerator.noise(worldX * 0.003, worldZ * 0.003));
    ridgeNoise = Math.pow(ridgeNoise, 1.5);

    // Valley carving using erosion-like shaping
    let valleyNoise = this.noiseGenerator.noise(worldX * 0.008, worldZ * 0.008);
    valleyNoise = Math.pow(Math.abs(valleyNoise), 0.7) * Math.sign(valleyNoise);

    // Hills and medium features with varying persistence
    let hillNoise = 0;
    hillNoise += this.noiseGenerator.noise(worldX * 0.015, worldZ * 0.015) * 0.5;
    hillNoise += this.noiseGenerator.noise(worldX * 0.03, worldZ * 0.03) * 0.25;
    hillNoise += this.noiseGenerator.noise(worldX * 0.06, worldZ * 0.06) * 0.125;

    // Fine details
    let detailNoise = this.noiseGenerator.noise(worldX * 0.1, worldZ * 0.1) * 0.1;

    // Combine layers
    let height = 0;

    // Base elevation influenced by continental noise
    height += (continentalHeight * 0.5 + 0.5) * 30;

    // Add mountain ridges with smooth transitions
    const ridgeStrength = THREE.MathUtils.smoothstep(continentalHeight, -0.3, 0.2);
    height += ridgeNoise * 80 * ridgeStrength;

    // Carve valleys
    height += valleyNoise * 40;

    // Add hills with persistence falloff
    height += hillNoise * 35;

    // Add fine details
    height += detailNoise * 8;

    // Create water areas (lakes and rivers)
    const waterNoise = this.noiseGenerator.noise(worldX * 0.003, worldZ * 0.003);
    const riverNoise = this.noiseGenerator.noise(worldX * 0.01, worldZ * 0.01);

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

  /**
   * Get terrain normal at world coordinates (for slope calculations)
   */
  getNormalAt(worldX: number, worldZ: number, sampleDistance: number = 1.0): THREE.Vector3 {
    const northHeight = this.getHeightAt(worldX, worldZ + sampleDistance);
    const southHeight = this.getHeightAt(worldX, worldZ - sampleDistance);
    const eastHeight = this.getHeightAt(worldX + sampleDistance, worldZ);
    const westHeight = this.getHeightAt(worldX - sampleDistance, worldZ);

    // Calculate normal from height differences
    const normal = new THREE.Vector3(
      (westHeight - eastHeight) / (2 * sampleDistance),
      1,
      (southHeight - northHeight) / (2 * sampleDistance)
    );

    return normal.normalize();
  }

  /**
   * Get terrain slope at world coordinates (0 = flat, 1 = vertical)
   */
  getSlopeAt(worldX: number, worldZ: number): number {
    const normal = this.getNormalAt(worldX, worldZ);
    return 1 - normal.y; // 0 when pointing straight up, 1 when horizontal
  }

  /**
   * Check if position is underwater
   */
  isUnderwater(worldX: number, worldZ: number): boolean {
    return this.getHeightAt(worldX, worldZ) < 0;
  }

  /**
   * Clear the cache (useful when changing noise parameters)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize
    };
  }

  /**
   * Preload a region into cache (useful for spawn areas)
   */
  preloadRegion(centerX: number, centerZ: number, radius: number, resolution: number = 2): void {
    for (let x = centerX - radius; x <= centerX + radius; x += resolution) {
      for (let z = centerZ - radius; z <= centerZ + radius; z += resolution) {
        this.getHeightAt(x, z);
      }
    }
  }
}

// Singleton instance for global access
let heightQueryCacheInstance: HeightQueryCache | null = null;

export function getHeightQueryCache(seed?: number): HeightQueryCache {
  if (!heightQueryCacheInstance) {
    heightQueryCacheInstance = new HeightQueryCache(seed);
  }
  return heightQueryCacheInstance;
}

export function resetHeightQueryCache(seed?: number): HeightQueryCache {
  heightQueryCacheInstance = new HeightQueryCache(seed);
  return heightQueryCacheInstance;
}
