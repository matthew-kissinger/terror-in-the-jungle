import { describe, it, expect } from 'vitest';
import {
  DEMHeightProvider,
  DEM_EDGE_BASELINE_M,
  DEM_EDGE_TAPER_RADIUS_M,
} from './DEMHeightProvider';

/**
 * Regression + behavior tests for the outside-DEM edge taper that
 * replaced the boundary clamp at `sampleBilinear` (closes Stage D3 of
 * cycle-2026-05-09-cdlod-edge-morph).
 *
 * Two contracts to defend:
 *  1. In-DEM samples are unchanged. The taper must not pollute the
 *     interior; samples inside [0, width-1] x [0, height-1] must equal
 *     the reference bilinear interpolation of the four nearest pixels.
 *  2. Outside-DEM samples ramp smoothly (C0 continuity at the boundary,
 *     monotonic descent toward {@link DEM_EDGE_BASELINE_M}, saturated
 *     at the baseline past {@link DEM_EDGE_TAPER_RADIUS_M}).
 */

const METERS_PER_PIXEL = 9;
const WIDTH = 16;
const HEIGHT = 16;

/**
 * Build a small DEM with non-uniform interior values so the regression
 * comparison would surface any accidental smoothing or clamp regression.
 * The interior pattern is a smoothly-varying ridge that peaks near the
 * center so the boundary pixels are not all identical (otherwise the
 * boundary-vs-taper transition would be trivially zero).
 */
function buildPatternedDEM(): {
  dem: DEMHeightProvider;
  data: Float32Array;
} {
  const data = new Float32Array(WIDTH * HEIGHT);
  for (let z = 0; z < HEIGHT; z++) {
    for (let x = 0; x < WIDTH; x++) {
      const nx = (x - (WIDTH - 1) / 2) / WIDTH;
      const nz = (z - (HEIGHT - 1) / 2) / HEIGHT;
      // A radial cosine bump in [-1, 1] mapped to [580, 1080] — A-Shau
      // valley-floor numbers so the test fixture sits in the same range
      // as the live DEM. The exact magnitudes don't matter for the
      // assertions; they matter only as a non-trivial interior pattern.
      const radial = Math.cos(Math.min(1, Math.hypot(nx, nz) * 2) * Math.PI);
      data[z * WIDTH + x] = 830 + radial * 250;
    }
  }
  return {
    dem: new DEMHeightProvider(data, WIDTH, HEIGHT, METERS_PER_PIXEL),
    data,
  };
}

/**
 * Reference bilinear sampler — the math the taper-free interior path is
 * required to reproduce. Truth oracle for the in-DEM regression check.
 */
function referenceBilinear(
  data: Float32Array,
  width: number,
  height: number,
  metersPerPixel: number,
  worldX: number,
  worldZ: number,
): number {
  const halfWidthMeters = (width * metersPerPixel) / 2;
  const halfHeightMeters = (height * metersPerPixel) / 2;
  const relX = worldX + halfWidthMeters;
  const relZ = worldZ + halfHeightMeters;
  const gx = Math.max(0, Math.min(width - 1.001, relX / metersPerPixel));
  const gz = Math.max(0, Math.min(height - 1.001, relZ / metersPerPixel));
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(x0 + 1, width - 1);
  const z1 = Math.min(z0 + 1, height - 1);
  const fx = gx - x0;
  const fz = gz - z0;
  const h00 = data[z0 * width + x0];
  const h10 = data[z0 * width + x1];
  const h01 = data[z1 * width + x0];
  const h11 = data[z1 * width + x1];
  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;
  return h0 * (1 - fz) + h1 * fz;
}

describe('DEMHeightProvider edge taper', () => {
  describe('in-DEM regression', () => {
    it('returns reference bilinear at 64 interior samples (taper must not pollute interior)', () => {
      const { dem, data } = buildPatternedDEM();
      // 8x8 sample grid distributed strictly inside the DEM box, well away
      // from the boundary so the assertion is independent of any
      // epsilon-near-edge nuances.
      const halfW = (WIDTH * METERS_PER_PIXEL) / 2;
      const halfH = (HEIGHT * METERS_PER_PIXEL) / 2;
      const innerMargin = METERS_PER_PIXEL; // one pixel from the edge
      const minX = -halfW + innerMargin;
      const maxX = halfW - innerMargin;
      const minZ = -halfH + innerMargin;
      const maxZ = halfH - innerMargin;
      let checked = 0;
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const u = i / 7;
          const v = j / 7;
          const worldX = minX + (maxX - minX) * u;
          const worldZ = minZ + (maxZ - minZ) * v;
          const got = dem.getHeightAt(worldX, worldZ);
          const expected = referenceBilinear(data, WIDTH, HEIGHT, METERS_PER_PIXEL, worldX, worldZ);
          expect(got).toBeCloseTo(expected, 6);
          checked++;
        }
      }
      expect(checked).toBe(64);
    });
  });

  describe('outside-DEM behavior', () => {
    it('is C0-continuous at the boundary (boundary sample equals boundary-minus-epsilon)', () => {
      const { dem } = buildPatternedDEM();
      const halfW = (WIDTH * METERS_PER_PIXEL) / 2;
      // Probe along the +X edge at a sweep of Z offsets so the assertion
      // exercises a range of boundary samples rather than a single corner.
      for (const zOffset of [-20, 0, 20]) {
        const inside = dem.getHeightAt(halfW - 0.001, zOffset);
        const outside = dem.getHeightAt(halfW + 0.001, zOffset);
        // 1 mm step across the boundary — heights must agree within an
        // amount well below any visible discontinuity.
        expect(outside).toBeCloseTo(inside, 2);
      }
    });

    it('descends monotonically toward the baseline as distance past the boundary grows', () => {
      const { dem } = buildPatternedDEM();
      const halfW = (WIDTH * METERS_PER_PIXEL) / 2;
      // Sample along +X past the boundary; with the interior peak above
      // the baseline (0 m), distance-from-boundary should drive the value
      // monotonically toward the baseline.
      const boundaryValue = dem.getHeightAt(halfW - 0.001, 0);
      expect(boundaryValue).toBeGreaterThan(DEM_EDGE_BASELINE_M);
      const samples: number[] = [];
      for (let d = 0; d <= DEM_EDGE_TAPER_RADIUS_M; d += DEM_EDGE_TAPER_RADIUS_M / 8) {
        samples.push(dem.getHeightAt(halfW + d, 0));
      }
      for (let i = 1; i < samples.length; i++) {
        // Strictly non-increasing across the taper ramp.
        expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] + 1e-6);
      }
      // First sample is at the boundary (taper t=0) and matches the
      // interior; last sample is at the radius and is at the baseline.
      expect(samples[0]).toBeCloseTo(boundaryValue, 3);
      expect(samples[samples.length - 1]).toBeCloseTo(DEM_EDGE_BASELINE_M, 3);
    });

    it('saturates at the baseline for queries past the taper radius', () => {
      const { dem } = buildPatternedDEM();
      const halfW = (WIDTH * METERS_PER_PIXEL) / 2;
      // Two queries past the radius — both must equal the baseline.
      const past1 = dem.getHeightAt(halfW + DEM_EDGE_TAPER_RADIUS_M + 1, 0);
      const past2 = dem.getHeightAt(halfW + DEM_EDGE_TAPER_RADIUS_M * 4, 0);
      expect(past1).toBeCloseTo(DEM_EDGE_BASELINE_M, 4);
      expect(past2).toBeCloseTo(DEM_EDGE_BASELINE_M, 4);
    });

    it('tapers symmetrically on all four sides of the DEM (no axis bias)', () => {
      // Uniform DEM fixture so the four boundary samples are guaranteed
      // identical — this isolates the taper's axial symmetry from any
      // bilinear-clamp epsilon asymmetry the patterned fixture would
      // introduce at opposite edges.
      const uniformHeight = 600;
      const uniformData = new Float32Array(WIDTH * HEIGHT).fill(uniformHeight);
      const uniformDem = new DEMHeightProvider(
        uniformData, WIDTH, HEIGHT, METERS_PER_PIXEL,
      );
      const halfW = (WIDTH * METERS_PER_PIXEL) / 2;
      const halfH = (HEIGHT * METERS_PER_PIXEL) / 2;
      const offset = DEM_EDGE_TAPER_RADIUS_M * 0.5;
      // All four cardinal directions, taken from the box center. With a
      // uniform DEM the four taper outputs land at matching elevations —
      // any divergence here means a transposed-axis bug or a swapped sign.
      const east = uniformDem.getHeightAt(halfW + offset, 0);
      const west = uniformDem.getHeightAt(-halfW - offset, 0);
      const north = uniformDem.getHeightAt(0, -halfH - offset);
      const south = uniformDem.getHeightAt(0, halfH + offset);
      expect(west).toBeCloseTo(east, 6);
      expect(north).toBeCloseTo(east, 6);
      expect(south).toBeCloseTo(east, 6);
      // The smoothstep half-way point: at t=0.5, smoothstep = 0.5, so
      // the taper sits exactly between the boundary and baseline.
      expect(east).toBeCloseTo((uniformHeight + DEM_EDGE_BASELINE_M) / 2, 4);
    });
  });
});
