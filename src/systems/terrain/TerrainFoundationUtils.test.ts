import { describe, it, expect } from 'vitest';
import { sampleTerrainHeightRange, computeFoundationDepth } from './TerrainFoundationUtils';

describe('sampleTerrainHeightRange', () => {
  it('returns identical min/max on flat terrain', () => {
    const { min, max } = sampleTerrainHeightRange(0, 0, 10, () => 5);
    expect(min).toBe(5);
    expect(max).toBe(5);
  });

  it('detects height variation across the footprint', () => {
    // Slope: height increases linearly with X
    const { min, max } = sampleTerrainHeightRange(0, 0, 10, (x) => x);
    expect(min).toBeLessThan(0);
    expect(max).toBeGreaterThan(0);
    // Samples at radius edges: x = -10 and x = +10
    expect(min).toBeCloseTo(-10, 0);
    expect(max).toBeCloseTo(10, 0);
  });

  it('samples the center point', () => {
    const calls: [number, number][] = [];
    sampleTerrainHeightRange(100, 200, 10, (x, z) => {
      calls.push([x, z]);
      return 0;
    });
    expect(calls[0]).toEqual([100, 200]);
  });

  it('handles a single peak within the footprint', () => {
    const { min, max } = sampleTerrainHeightRange(0, 0, 10, (x, z) => {
      // Peak at (3, 0)
      const d = Math.sqrt((x - 3) ** 2 + z ** 2);
      return d < 1 ? 50 : 2;
    });
    expect(max).toBe(50);
    expect(min).toBe(2);
  });

  it('handles negative heights', () => {
    const { min, max } = sampleTerrainHeightRange(0, 0, 10, () => -20);
    expect(min).toBe(-20);
    expect(max).toBe(-20);
  });
});

describe('computeFoundationDepth', () => {
  it('returns minDepth on flat terrain', () => {
    expect(computeFoundationDepth(10, 10, 0.6, 1.0)).toBe(1.0);
    // terrainGap = 0, margin = 1.0 → max(0.6, 1.0) = 1.0
  });

  it('returns minDepth when gap + margin is smaller', () => {
    // targetHeight only 0.1 above min terrain
    expect(computeFoundationDepth(10.1, 10, 0.6, 0.3)).toBe(0.6);
    // terrainGap = 0.1, margin = 0.3 → max(0.6, 0.4) = 0.6
  });

  it('extends to cover full terrain gap on slopes', () => {
    const depth = computeFoundationDepth(50, 20, 0.6, 1.0);
    expect(depth).toBe(31); // 50 - 20 + 1.0 = 31
  });

  it('uses default minDepth and margin when omitted', () => {
    expect(computeFoundationDepth(10, 10)).toBe(1.0);
    // terrainGap = 0, default margin = 1.0 → max(0.6, 1.0) = 1.0
  });

  it('handles large elevation differences', () => {
    const depth = computeFoundationDepth(100, 0, 0.6, 2.0);
    expect(depth).toBe(102); // 100 - 0 + 2.0
  });

  it('handles negative terrain heights', () => {
    const depth = computeFoundationDepth(5, -10, 0.6, 1.0);
    expect(depth).toBe(16); // 5 - (-10) + 1.0 = 16
  });
});
