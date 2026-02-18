import { describe, it, expect } from 'vitest';
import { DEMHeightProvider } from './DEMHeightProvider';

/**
 * Creates a simple 4x4 DEM grid for testing.
 * Grid values are set so we can verify bilinear interpolation:
 *
 *   z=0: [100, 200, 300, 400]
 *   z=1: [150, 250, 350, 450]
 *   z=2: [200, 300, 400, 500]
 *   z=3: [250, 350, 450, 550]
 *
 * metersPerPixel = 10, so the grid covers 40m x 40m.
 * Origin at (0, 0), so world bounds are [-20, 20] in both X and Z.
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
  describe('getHeightAt - exact grid points', () => {
    it('should return exact values at grid corners', () => {
      const dem = create4x4DEM();
      // Top-left corner: world (-20, -20) -> grid (0, 0) -> value 100
      expect(dem.getHeightAt(-20, -20)).toBeCloseTo(100, 2);
      // Top-right corner: world (20, -20) -> grid (3, 0) -> value 400
      // At the grid boundary, clamped to 3-epsilon
      expect(dem.getHeightAt(20, -20)).toBeCloseTo(400, 0);
      // Bottom-left corner: world (-20, 20) -> grid (0, 3) -> value 250
      expect(dem.getHeightAt(-20, 20)).toBeCloseTo(250, 0);
      // Bottom-right corner: world (20, 20) -> grid (3, 3) -> value 550
      expect(dem.getHeightAt(20, 20)).toBeCloseTo(550, 0);
    });

    it('should return exact value at grid center points', () => {
      const dem = create4x4DEM();
      // Grid (1, 1) -> world (-10, -10) -> value 250
      expect(dem.getHeightAt(-10, -10)).toBeCloseTo(250, 2);
      // Grid (2, 2) -> world (0, 0) -> value 400
      expect(dem.getHeightAt(0, 0)).toBeCloseTo(400, 2);
    });
  });

  describe('getHeightAt - bilinear interpolation', () => {
    it('should interpolate between two grid points along X axis', () => {
      const dem = create4x4DEM();
      // Midpoint between grid (0,0)=100 and grid (1,0)=200 at z=0
      // World: (-15, -20) -> grid (0.5, 0)
      // Expected: 100 * 0.5 + 200 * 0.5 = 150
      expect(dem.getHeightAt(-15, -20)).toBeCloseTo(150, 2);
    });

    it('should interpolate between two grid points along Z axis', () => {
      const dem = create4x4DEM();
      // Midpoint between grid (0,0)=100 and grid (0,1)=150 at x=0
      // World: (-20, -15) -> grid (0, 0.5)
      // Expected: 100 * 0.5 + 150 * 0.5 = 125
      expect(dem.getHeightAt(-20, -15)).toBeCloseTo(125, 2);
    });

    it('should bilinear interpolate in both axes', () => {
      const dem = create4x4DEM();
      // Midpoint in the first cell: grid (0.5, 0.5)
      // World: (-15, -15)
      // h00=100, h10=200, h01=150, h11=250
      // h0 = 100*0.5 + 200*0.5 = 150
      // h1 = 150*0.5 + 250*0.5 = 200
      // result = 150*0.5 + 200*0.5 = 175
      expect(dem.getHeightAt(-15, -15)).toBeCloseTo(175, 2);
    });

    it('should interpolate at quarter positions', () => {
      const dem = create4x4DEM();
      // Grid (0.25, 0.25) -> world (-17.5, -17.5)
      // h00=100, h10=200, h01=150, h11=250
      // h0 = 100*0.75 + 200*0.25 = 125
      // h1 = 150*0.75 + 250*0.25 = 175
      // result = 125*0.75 + 175*0.25 = 137.5
      expect(dem.getHeightAt(-17.5, -17.5)).toBeCloseTo(137.5, 2);
    });
  });

  describe('getHeightAt - edge clamping', () => {
    it('should clamp coordinates beyond the grid to edge values', () => {
      const dem = create4x4DEM();
      // Far beyond top-left: should clamp to grid (0, 0) -> 100
      expect(dem.getHeightAt(-1000, -1000)).toBeCloseTo(100, 2);
      // Far beyond bottom-right: should clamp to grid (3, 3) -> 550
      expect(dem.getHeightAt(1000, 1000)).toBeCloseTo(550, 0);
    });

    it('should clamp X only when X is out of bounds', () => {
      const dem = create4x4DEM();
      // X far left, Z at grid 1 -> clamp X to 0, Z at 1
      // Grid (0, 1) -> value 150
      expect(dem.getHeightAt(-1000, -10)).toBeCloseTo(150, 2);
    });

    it('should clamp Z only when Z is out of bounds', () => {
      const dem = create4x4DEM();
      // X at grid 1, Z far beyond -> clamp Z to 3
      // Grid (1, 3) -> value 350
      expect(dem.getHeightAt(-10, 1000)).toBeCloseTo(350, 0);
    });
  });

  describe('getHeightAt - with non-zero origin', () => {
    it('should offset world coordinates by origin', () => {
      // Use a 4x4 grid so "center" maps cleanly to grid (2, 2)
      const data = new Float32Array([
        10, 20, 30, 40,
        50, 60, 70, 80,
        90, 100, 110, 120,
        130, 140, 150, 160
      ]);
      // 4x4 grid, 10m/pixel, origin at (100, 200)
      // halfWidth = 20, halfHeight = 20
      // World bounds: [80,120] x [180,220]
      const dem = new DEMHeightProvider(data, 4, 4, 10, 100, 200);

      // World (80, 180) -> relX=0, relZ=0 -> grid (0, 0) -> 10
      expect(dem.getHeightAt(80, 180)).toBeCloseTo(10, 2);
      // World (100, 200) -> relX=20, relZ=20 -> grid (2, 2) -> 110
      expect(dem.getHeightAt(100, 200)).toBeCloseTo(110, 2);
      // World (90, 190) -> relX=10, relZ=10 -> grid (1, 1) -> 60
      expect(dem.getHeightAt(90, 190)).toBeCloseTo(60, 2);
    });
  });

  describe('getWorkerConfig', () => {
    it('should return correct config type', () => {
      const dem = create4x4DEM();
      const config = dem.getWorkerConfig();
      expect(config.type).toBe('dem');
    });

    it('should return a copy of the buffer', () => {
      const dem = create4x4DEM();
      const config = dem.getWorkerConfig();
      expect(config.type).toBe('dem');
      if (config.type === 'dem') {
        expect(config.width).toBe(4);
        expect(config.height).toBe(4);
        expect(config.metersPerPixel).toBe(10);
        expect(config.originX).toBe(0);
        expect(config.originZ).toBe(0);
        // Buffer should be a copy, not the same reference
        const view = new Float32Array(config.buffer);
        expect(view[0]).toBe(100);
        expect(view.length).toBe(16);
      }
    });
  });

  describe('getHeightData - bulk chunk query', () => {
    it('should return correct-sized array', () => {
      const dem = create4x4DEM();
      const segments = 4;
      const data = dem.getHeightData(0, 0, 20, segments);
      expect(data.length).toBe((segments + 1) * (segments + 1));
    });

    it('should produce same values as individual getHeightAt calls', () => {
      const dem = create4x4DEM();
      const chunkX = 0;
      const chunkZ = 0;
      const size = 20;
      const segments = 4;
      const data = dem.getHeightData(chunkX, chunkZ, size, segments);

      for (let z = 0; z <= segments; z++) {
        for (let x = 0; x <= segments; x++) {
          const worldX = chunkX * size + (x / segments) * size;
          const worldZ = chunkZ * size + (z / segments) * size;
          const expected = dem.getHeightAt(worldX, worldZ);
          expect(data[z * (segments + 1) + x]).toBeCloseTo(expected, 3);
        }
      }
    });
  });

  describe('sampleBilinear static method', () => {
    it('should match instance getHeightAt results', () => {
      const data = new Float32Array([100, 200, 300, 400]);
      const width = 2;
      const height = 2;
      const mpp = 10;
      const dem = new DEMHeightProvider(data, width, height, mpp);

      // Test several points
      for (const [wx, wz] of [[-10, -10], [0, 0], [-5, -5], [10, 10]]) {
        const instanceResult = dem.getHeightAt(wx, wz);
        const staticResult = DEMHeightProvider.sampleBilinear(
          data, width, height, mpp, 0, 0,
          (width * mpp) / 2, (height * mpp) / 2,
          wx, wz
        );
        expect(staticResult).toBeCloseTo(instanceResult, 10);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle 1x1 grid (single elevation value)', () => {
      const data = new Float32Array([500]);
      const dem = new DEMHeightProvider(data, 1, 1, 10);
      // Any query should return 500 since there is only one sample
      expect(dem.getHeightAt(0, 0)).toBeCloseTo(500, 2);
      expect(dem.getHeightAt(100, 100)).toBeCloseTo(500, 2);
      expect(dem.getHeightAt(-100, -100)).toBeCloseTo(500, 2);
    });

    it('should handle very small metersPerPixel (high resolution)', () => {
      // Use a 4x4 grid so center maps cleanly
      const data = new Float32Array([
        0,   25,  50,  75,
        100, 125, 150, 175,
        200, 225, 250, 275,
        300, 325, 350, 375
      ]);
      const dem = new DEMHeightProvider(data, 4, 4, 0.5);
      // Grid covers 2m x 2m, halfWidth=1, halfHeight=1
      // World (-1, -1) -> grid (0, 0) -> 0
      expect(dem.getHeightAt(-1, -1)).toBeCloseTo(0, 2);
      // World (0, 0) -> grid (2, 2) -> 250
      expect(dem.getHeightAt(0, 0)).toBeCloseTo(250, 2);
    });

    it('should handle uniform elevation grid', () => {
      const data = new Float32Array(16).fill(373);
      const dem = new DEMHeightProvider(data, 4, 4, 100);
      // Any point should return 373
      expect(dem.getHeightAt(0, 0)).toBeCloseTo(373, 2);
      expect(dem.getHeightAt(150, -150)).toBeCloseTo(373, 2);
    });
  });
});
