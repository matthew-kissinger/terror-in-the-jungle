import { describe, it, expect } from 'vitest';
import {
  DEM_EDGE_BASELINE_M,
  DEM_EDGE_TAPER_RADIUS_M,
  sampleDEMBilinearWithTaper,
} from './DEMSampling';
import { DEMHeightProvider } from './DEMHeightProvider';

/**
 * Worker-vs-main parity tests for the shared DEM bilinear sampler.
 *
 * The 2026-05-19 dem-edge-taper PR added an outside-DEM taper to the
 * main-thread `DEMHeightProvider.sampleBilinear`, but the worker's
 * inline `sampleDEM` still ran the pre-taper clamp — meaning
 * worker-baked visual chunks (which extend past the playable bounds
 * via `halfVisual = halfPlayable + visualMargin`) saw the old extruded
 * boundary, contradicting the main-thread NPC ground-stick + navmesh
 * sample of the same world coords.
 *
 * The fix is the shared {@link sampleDEMBilinearWithTaper} helper that
 * both call sites delegate to. These tests defend that contract:
 *  1. The helper is the canonical implementation; `DEMHeightProvider`
 *     produces identical output for any world coord (in-DEM and past
 *     the boundary into the visual margin).
 *  2. The helper saturates at the baseline past the taper radius,
 *     regardless of which side of the DEM the query falls on.
 */

const WIDTH = 8;
const HEIGHT = 8;
const METERS_PER_PIXEL = 12;

function buildHelperFixture(): {
  data: Float32Array;
  dem: DEMHeightProvider;
  halfW: number;
  halfH: number;
} {
  const data = new Float32Array(WIDTH * HEIGHT);
  // Non-uniform pattern so the boundary samples differ across the
  // four edges — that way the parity check would surface any subtle
  // axis transposition (z*width+x vs x*width+z).
  for (let z = 0; z < HEIGHT; z++) {
    for (let x = 0; x < WIDTH; x++) {
      data[z * WIDTH + x] = 100 + x * 10 + z * 7;
    }
  }
  const dem = new DEMHeightProvider(data, WIDTH, HEIGHT, METERS_PER_PIXEL);
  return {
    data,
    dem,
    halfW: (WIDTH * METERS_PER_PIXEL) / 2,
    halfH: (HEIGHT * METERS_PER_PIXEL) / 2,
  };
}

/**
 * Direct helper call mirroring the worker's `sampleDEM`. The worker
 * computes halfWidth/halfHeight from `width * metersPerPixel / 2` then
 * delegates to {@link sampleDEMBilinearWithTaper}; this function does
 * the same work the worker does at the call site.
 */
function callHelperLikeWorker(
  data: Float32Array,
  worldX: number,
  worldZ: number,
): number {
  const halfWidthMeters = (WIDTH * METERS_PER_PIXEL) / 2;
  const halfHeightMeters = (HEIGHT * METERS_PER_PIXEL) / 2;
  return sampleDEMBilinearWithTaper(
    data,
    WIDTH,
    HEIGHT,
    METERS_PER_PIXEL,
    0,
    0,
    halfWidthMeters,
    halfHeightMeters,
    worldX,
    worldZ,
  );
}

describe('DEMSampling shared helper (main-vs-worker parity)', () => {
  it('matches DEMHeightProvider.getHeightAt at interior samples', () => {
    const { data, dem, halfW, halfH } = buildHelperFixture();
    // Sweep across the interior — both axes — including some
    // non-grid-aligned fractional positions.
    const probes: Array<[number, number]> = [
      [0, 0],
      [-halfW + 1, -halfH + 1],
      [halfW - 1, halfH - 1],
      [-7, 11],
      [3.5, -4.2],
      [halfW * 0.5, -halfH * 0.5],
    ];
    for (const [wx, wz] of probes) {
      const main = dem.getHeightAt(wx, wz);
      const helper = callHelperLikeWorker(data, wx, wz);
      // Worker-call and main-thread provider must produce the SAME
      // height for every interior sample. Equality is exact since
      // both call the same helper; toBeCloseTo guards against any
      // accidental float drift if the wiring later changes.
      expect(helper).toBeCloseTo(main, 9);
    }
  });

  it('matches DEMHeightProvider.getHeightAt past the +X boundary (the worker-bake path the reviewer flagged)', () => {
    const { data, dem, halfW } = buildHelperFixture();
    // Step out past +X through the entire taper radius. This is the
    // exact path A Shau's visual margin queries hit, and the old
    // worker clamp-bilinear would have extruded the boundary pixel
    // here while the main thread tapered.
    for (let d = 0; d <= DEM_EDGE_TAPER_RADIUS_M * 1.5; d += 100) {
      const worldX = halfW + d;
      const worldZ = 5;
      const main = dem.getHeightAt(worldX, worldZ);
      const helper = callHelperLikeWorker(data, worldX, worldZ);
      expect(helper).toBeCloseTo(main, 9);
    }
  });

  it('matches DEMHeightProvider.getHeightAt past all four boundaries', () => {
    const { data, dem, halfW, halfH } = buildHelperFixture();
    const offset = DEM_EDGE_TAPER_RADIUS_M * 0.4;
    const probes: Array<[number, number]> = [
      [halfW + offset, 0],
      [-halfW - offset, 0],
      [0, halfH + offset],
      [0, -halfH - offset],
      // Diagonal: both outsides simultaneously
      [halfW + offset, halfH + offset],
    ];
    for (const [wx, wz] of probes) {
      const main = dem.getHeightAt(wx, wz);
      const helper = callHelperLikeWorker(data, wx, wz);
      expect(helper).toBeCloseTo(main, 9);
    }
  });

  it('saturates at the baseline past the taper radius (worker output stays bounded)', () => {
    const { data, halfW } = buildHelperFixture();
    // Sample well past the radius along +X. The worker-path return
    // must equal the baseline (not the extruded boundary pixel).
    const far = callHelperLikeWorker(data, halfW + DEM_EDGE_TAPER_RADIUS_M + 10, 0);
    expect(far).toBeCloseTo(DEM_EDGE_BASELINE_M, 4);
  });
});
