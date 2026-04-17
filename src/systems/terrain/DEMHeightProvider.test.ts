import { describe, it, expect } from 'vitest';
import { DEMHeightProvider } from './DEMHeightProvider';

/**
 * Creates a simple 4x4 DEM grid for testing.
 * Grid values:
 *
 *   z=0: [100, 200, 300, 400]
 *   z=1: [150, 250, 350, 450]
 *   z=2: [200, 300, 400, 500]
 *   z=3: [250, 350, 450, 550]
 *
 * metersPerPixel = 10, origin at (0, 0), so world bounds are [-20, 20] in both X and Z.
 */
function create4x4DEM(): DEMHeightProvider {
  const data = new Float32Array([
    100, 200, 300, 400,
    150, 250, 350, 450,
    200, 300, 400, 500,
    250, 350, 450, 550
  ]);
  return new DEMHeightProvider(data, 4, 4, 10, 0, 0);
}

describe('DEMHeightProvider', () => {
  it('returns exact grid values at grid corners', () => {
    const dem = create4x4DEM();
    expect(dem.getHeightAt(-20, -20)).toBeCloseTo(100, 2);
    expect(dem.getHeightAt(-10, -10)).toBeCloseTo(250, 2);
  });

  it('bilinearly interpolates between grid points', () => {
    const dem = create4x4DEM();
    // Cell (-20..-10, -20..-10): corners 100, 200, 150, 250.
    // Midpoint (-15, -15) = 175 by bilinear interpolation.
    expect(dem.getHeightAt(-15, -15)).toBeCloseTo(175, 2);
    // Along one axis only, between 100 and 200 at z-edge: expect midpoint 150.
    expect(dem.getHeightAt(-15, -20)).toBeCloseTo(150, 2);
  });

  it('clamps out-of-bounds queries to the edge sample', () => {
    const dem = create4x4DEM();
    // Far beyond top-left: clamps to (0,0)
    expect(dem.getHeightAt(-1000, -1000)).toBeCloseTo(100, 2);
  });

  it('offsets by the configured origin when interpreting world coordinates', () => {
    const data = new Float32Array([
      10, 20, 30, 40,
      50, 60, 70, 80,
      90, 100, 110, 120,
      130, 140, 150, 160
    ]);
    // 4x4 grid, 10m/pixel, origin at (100, 200) -> world bounds [80,120] x [180,220]
    const dem = new DEMHeightProvider(data, 4, 4, 10, 100, 200);

    // World (80, 180) maps to grid (0, 0) -> value 10
    expect(dem.getHeightAt(80, 180)).toBeCloseTo(10, 2);
    // World center (100, 200) maps to grid (2, 2) -> value 110
    expect(dem.getHeightAt(100, 200)).toBeCloseTo(110, 2);
  });

  it('reports its worker config and DEM dimensions for downstream bakers', () => {
    const dem = create4x4DEM();
    const config = dem.getWorkerConfig();
    expect(config.type).toBe('dem');
    if (config.type === 'dem') {
      expect(config.width).toBe(4);
      expect(config.height).toBe(4);
      expect(config.metersPerPixel).toBe(10);
    }
  });

  it('getHeightData bulk query agrees with individual getHeightAt calls', () => {
    const dem = create4x4DEM();
    const chunkX = 0;
    const chunkZ = 0;
    const size = 20;
    const segments = 4;
    const data = dem.getHeightData(chunkX, chunkZ, size, segments);

    expect(data.length).toBe((segments + 1) * (segments + 1));

    for (let z = 0; z <= segments; z++) {
      for (let x = 0; x <= segments; x++) {
        const worldX = chunkX * size + (x / segments) * size;
        const worldZ = chunkZ * size + (z / segments) * size;
        const expected = dem.getHeightAt(worldX, worldZ);
        expect(data[z * (segments + 1) + x]).toBeCloseTo(expected, 3);
      }
    }
  });

  it('handles degenerate 1x1 DEM by returning the single elevation everywhere', () => {
    const data = new Float32Array([500]);
    const dem = new DEMHeightProvider(data, 1, 1, 10);
    expect(dem.getHeightAt(0, 0)).toBeCloseTo(500, 2);
    expect(dem.getHeightAt(100, 100)).toBeCloseTo(500, 2);
  });

  it('returns constant value for a uniform elevation grid', () => {
    const data = new Float32Array(16).fill(373);
    const dem = new DEMHeightProvider(data, 4, 4, 100);
    expect(dem.getHeightAt(0, 0)).toBeCloseTo(373, 2);
    expect(dem.getHeightAt(150, -150)).toBeCloseTo(373, 2);
  });
});
