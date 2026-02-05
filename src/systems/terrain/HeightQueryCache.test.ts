import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeightQueryCache } from './HeightQueryCache';
import { NoiseGenerator } from '../../utils/NoiseGenerator';

// Automatically mock NoiseGenerator
vi.mock('../../utils/NoiseGenerator');

describe('HeightQueryCache', () => {
  let mockNoise: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up default mock behavior for NoiseGenerator
    const MockNoiseGenerator = vi.mocked(NoiseGenerator);
    mockNoise = vi.fn().mockReturnValue(0.5);
    
    MockNoiseGenerator.prototype.noise = mockNoise;
    MockNoiseGenerator.prototype.fractalNoise = vi.fn().mockReturnValue(0.5);
    MockNoiseGenerator.prototype.ridgedNoise = vi.fn().mockReturnValue(0.5);
    MockNoiseGenerator.prototype.turbulence = vi.fn().mockReturnValue(0.5);
  });

  describe('Constructor', () => {
    it('should initialize with default cache size', () => {
      const cache = new HeightQueryCache();
      const stats = cache.getCacheStats();
      expect(stats.maxSize).toBe(10000);
      expect(stats.size).toBe(0);
    });

    it('should initialize with custom cache size', () => {
      const cache = new HeightQueryCache(12345, 50);
      const stats = cache.getCacheStats();
      expect(stats.maxSize).toBe(50);
    });
  });

  describe('getHeightAt', () => {
    it('should return a height value', () => {
      const cache = new HeightQueryCache();
      const height = cache.getHeightAt(10, 20);
      expect(typeof height).toBe('number');
    });

    it('should cache results and return them on subsequent calls', () => {
      const cache = new HeightQueryCache();
      
      // First call
      const height1 = cache.getHeightAt(10, 20);
      expect(cache.getCacheStats().size).toBe(1);
      
      // Reset call count of noise mock
      mockNoise.mockClear();
      
      // Second call at same position should hit cache
      const height2 = cache.getHeightAt(10, 20);
      
      expect(height2).toBe(height1);
      expect(mockNoise).not.toHaveBeenCalled();
      expect(cache.getCacheStats().size).toBe(1);
    });

    it('should snap coordinates to grid', () => {
      const cache = new HeightQueryCache();
      
      const height1 = cache.getHeightAt(10.1, 20.1); // Snaps to 10.0, 20.0
      
      mockNoise.mockClear();
      const height2 = cache.getHeightAt(10.2, 20.2); // Snaps to 10.0, 20.0
      
      expect(height2).toBe(height1);
      expect(mockNoise).not.toHaveBeenCalled();
      
      mockNoise.mockClear();
      mockNoise.mockReturnValue(0.6); // Change return value to ensure it's different if called
      const height3 = cache.getHeightAt(10.4, 20.4); // Snaps to 10.5, 20.5
      
      expect(mockNoise).toHaveBeenCalled();
      expect(cache.getCacheStats().size).toBe(2);
    });
  });

  describe('clearCache', () => {
    it('should remove all cached values', () => {
      const cache = new HeightQueryCache();
      cache.getHeightAt(10, 20);
      cache.getHeightAt(30, 40);
      expect(cache.getCacheStats().size).toBe(2);
      
      cache.clearCache();
      expect(cache.getCacheStats().size).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entries when cache is full', () => {
      const maxLimit = 3;
      const cache = new HeightQueryCache(12345, maxLimit);
      
      // Fill cache
      cache.getHeightAt(1, 1);
      cache.getHeightAt(2, 2);
      cache.getHeightAt(3, 3);
      expect(cache.getCacheStats().size).toBe(3);
      
      // Add one more, should evict (1, 1)
      cache.getHeightAt(4, 4);
      expect(cache.getCacheStats().size).toBe(3);
      
      // Check if (1, 1) is still in cache
      mockNoise.mockClear();
      cache.getHeightAt(1, 1);
      expect(mockNoise).toHaveBeenCalled(); // Should have been recalculated
    });

    it('should preserve recently accessed entries', () => {
      const maxLimit = 3;
      const cache = new HeightQueryCache(12345, maxLimit);
      
      cache.getHeightAt(1, 1); // Oldest
      cache.getHeightAt(2, 2);
      cache.getHeightAt(3, 3);
      
      // Access (1, 1) to make it most recent
      mockNoise.mockClear();
      cache.getHeightAt(1, 1);
      expect(mockNoise).not.toHaveBeenCalled(); // Cache hit
      
      // Add one more, should evict (2, 2) which is now the oldest
      cache.getHeightAt(4, 4);
      
      // (1, 1) should still be in cache
      mockNoise.mockClear();
      cache.getHeightAt(1, 1);
      expect(mockNoise).not.toHaveBeenCalled();
      
      // (2, 2) should be evicted
      mockNoise.mockClear();
      cache.getHeightAt(2, 2);
      expect(mockNoise).toHaveBeenCalled();
    });
  });

  describe('Coordinate collisions', () => {
    it('should treat different coordinates as different keys', () => {
      const cache = new HeightQueryCache();
      cache.getHeightAt(10, 20);
      cache.getHeightAt(20, 10);
      
      expect(cache.getCacheStats().size).toBe(2);
    });
  });

  describe('getNormalAt', () => {
    it('should return a normalized Vector3', () => {
      const cache = new HeightQueryCache();
      const normal = cache.getNormalAt(10, 20);
      expect(normal.length()).toBeCloseTo(1);
    });
  });

  describe('getSlopeAt', () => {
    it('should return a value between 0 and 1', () => {
      const cache = new HeightQueryCache();
      const slope = cache.getSlopeAt(10, 20);
      expect(slope).toBeGreaterThanOrEqual(0);
      expect(slope).toBeLessThanOrEqual(1);
    });
  });

  describe('isUnderwater', () => {
    it('should return true if height < 0', () => {
      const cache = new HeightQueryCache();
      mockNoise.mockReturnValue(-1.0);
      
      expect(cache.isUnderwater(0, 0)).toBe(true);
    });

    it('should return false if height >= 0', () => {
      const cache = new HeightQueryCache();
      mockNoise.mockReturnValue(0.5);
      
      expect(cache.isUnderwater(0, 0)).toBe(false);
    });
  });
});
