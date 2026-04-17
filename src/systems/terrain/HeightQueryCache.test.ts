import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeightQueryCache, getHeightQueryCache, resetHeightQueryCache } from './HeightQueryCache';
import { NoiseGenerator } from '../../utils/NoiseGenerator';

// Automatically mock NoiseGenerator so we can prove cache hits avoid the underlying noise call.
vi.mock('../../utils/NoiseGenerator');

describe('HeightQueryCache', () => {
  let mockNoise: any;

  beforeEach(() => {
    resetHeightQueryCache();
    vi.clearAllMocks();

    const MockNoiseGenerator = vi.mocked(NoiseGenerator);
    mockNoise = vi.fn().mockReturnValue(0.5);

    MockNoiseGenerator.prototype.noise = mockNoise;
    MockNoiseGenerator.prototype.fractalNoise = vi.fn().mockReturnValue(0.5);
    MockNoiseGenerator.prototype.ridgedNoise = vi.fn().mockReturnValue(0.5);
    MockNoiseGenerator.prototype.turbulence = vi.fn().mockReturnValue(0.5);
  });

  it('getHeightAt returns a finite number', () => {
    const cache = new HeightQueryCache();
    const height = cache.getHeightAt(10, 20);
    expect(Number.isFinite(height)).toBe(true);
  });

  it('returns the same value for repeat queries at the same position without recomputing', () => {
    const cache = new HeightQueryCache();

    const height1 = cache.getHeightAt(10, 20);
    mockNoise.mockClear();
    const height2 = cache.getHeightAt(10, 20);

    expect(height2).toBe(height1);
    expect(mockNoise).not.toHaveBeenCalled();
  });

  it('treats distinct coordinates as distinct cache keys', () => {
    const cache = new HeightQueryCache();
    cache.getHeightAt(10, 20);
    cache.getHeightAt(20, 10);
    cache.getHeightAt(-10, 20);
    cache.getHeightAt(10, -20);

    // Four distinct positions cached
    expect(cache.getCacheStats().size).toBe(4);
  });

  it('clearCache drops all cached entries', () => {
    const cache = new HeightQueryCache();
    cache.getHeightAt(10, 20);
    cache.getHeightAt(30, 40);
    expect(cache.getCacheStats().size).toBeGreaterThan(0);

    cache.clearCache();
    expect(cache.getCacheStats().size).toBe(0);
  });

  it('eventually evicts entries when the cache fills past its limit', () => {
    const cache = new HeightQueryCache(12345, 3);
    cache.getHeightAt(1, 1);
    cache.getHeightAt(2, 2);
    cache.getHeightAt(3, 3);
    cache.getHeightAt(4, 4);

    // With a 3-entry budget and 4 distinct insertions, the cache must have
    // dropped at least one entry rather than growing unbounded.
    expect(cache.getCacheStats().size).toBeLessThanOrEqual(3);
  });

  it('getNormalAt returns a unit vector with positive Y component', () => {
    const cache = new HeightQueryCache();
    const normal = cache.getNormalAt(10, 20);
    expect(normal.length()).toBeCloseTo(1);
    expect(normal.y).toBeGreaterThan(0);
  });

  it('getSlopeAt returns a 0..1 value', () => {
    const cache = new HeightQueryCache();
    const slope = cache.getSlopeAt(10, 20);
    expect(slope).toBeGreaterThanOrEqual(0);
    expect(slope).toBeLessThanOrEqual(1);
  });

  it('isUnderwater reflects the sign of the height query', () => {
    const cache = new HeightQueryCache();

    mockNoise.mockReturnValue(-1.0);
    expect(cache.isUnderwater(0, 0)).toBe(true);

    cache.clearCache();
    mockNoise.mockReturnValue(0.5);
    expect(cache.isUnderwater(100, 100)).toBe(false);
  });

  it('resetHeightQueryCache() replaces the shared singleton', () => {
    const first = getHeightQueryCache();
    resetHeightQueryCache();
    const second = getHeightQueryCache();

    expect(second).not.toBe(first);
  });
});
