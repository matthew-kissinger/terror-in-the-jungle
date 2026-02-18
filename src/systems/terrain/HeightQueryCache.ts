import * as THREE from 'three';
import type { IHeightProvider } from './IHeightProvider';
import { NoiseHeightProvider } from './NoiseHeightProvider';

/**
 * CPU-side height query system with LRU cache.
 * Delegates to an IHeightProvider for actual height computation.
 * Always returns valid heights regardless of chunk loading state.
 */
export class HeightQueryCache {
  private provider: IHeightProvider;
  private cache: Map<string, number> = new Map();
  private readonly maxCacheSize: number;
  private readonly CACHE_RESOLUTION = 0.5; // Snap queries to 0.5m grid for cache hits

  constructor(provider?: IHeightProvider, maxCacheSize?: number);
  constructor(seed?: number, maxCacheSize?: number);
  constructor(providerOrSeed?: IHeightProvider | number, maxCacheSize: number = 10000) {
    if (typeof providerOrSeed === 'object' && providerOrSeed !== null) {
      this.provider = providerOrSeed;
    } else {
      this.provider = new NoiseHeightProvider(providerOrSeed ?? 12345);
    }
    this.maxCacheSize = maxCacheSize;
  }

  /**
   * Get terrain height at world coordinates.
   */
  getHeightAt(worldX: number, worldZ: number): number {
    // Snap to grid for cache efficiency
    const snapX = Math.round(worldX / this.CACHE_RESOLUTION) * this.CACHE_RESOLUTION;
    const snapZ = Math.round(worldZ / this.CACHE_RESOLUTION) * this.CACHE_RESOLUTION;
    const key = `${snapX},${snapZ}`;

    // Check cache (delete+re-set to maintain LRU order)
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    // Generate height from provider
    const height = this.provider.getHeightAt(snapX, snapZ);

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
   * Replace the active height provider (e.g., switching to DEM mode).
   * Clears the cache since heights will change.
   */
  setProvider(provider: IHeightProvider): void {
    this.provider = provider;
    this.cache.clear();
  }

  /**
   * Get the current height provider.
   */
  getProvider(): IHeightProvider {
    return this.provider;
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
