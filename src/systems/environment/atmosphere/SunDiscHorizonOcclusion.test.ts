// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import {
  maxBlockingElevationAngle,
  horizonOcclusionOpacity,
  computeHorizonOcclusion,
  sampleTerrainHorizonOcclusion,
  type HorizonSample,
} from './SunDiscHorizonOcclusion';

/**
 * Behaviour contract for the sun-disc terrain-horizon occlusion test. We assert
 * the observable outcome — the disc fades to zero as the sun sinks behind a
 * sampled ridge, is fully visible above it, and never occludes when there is no
 * terrain — not the internal atan/smoothstep expression.
 */
describe('SunDiscHorizonOcclusion — blocking angle', () => {
  it('reads the ridge that subtends the largest angle from the eye', () => {
    const eyeHeight = 100;
    // A closer, taller ridge subtends a larger angle than a far, low one.
    const samples: HorizonSample[] = [
      { distance: 200, terrainHeight: 260 }, // rise 160 over 200 -> steep
      { distance: 2000, terrainHeight: 300 }, // rise 200 over 2000 -> shallow
    ];
    const angle = maxBlockingElevationAngle(eyeHeight, samples);
    expect(angle).toBeCloseTo(Math.atan2(160, 200), 5);
  });

  it('returns a non-positive angle when all terrain is at or below the eye', () => {
    const angle = maxBlockingElevationAngle(500, [
      { distance: 300, terrainHeight: 500 },
      { distance: 900, terrainHeight: 420 },
    ]);
    expect(angle).toBeLessThanOrEqual(0);
  });

  it('never occludes when there are no samples', () => {
    expect(maxBlockingElevationAngle(0, [])).toBe(Number.NEGATIVE_INFINITY);
    expect(horizonOcclusionOpacity(0.1, Number.NEGATIVE_INFINITY)).toBe(1);
  });
});

describe('SunDiscHorizonOcclusion — fade band', () => {
  it('is fully visible when the sun sits well above the blocking ridge', () => {
    // Sun at 20 degrees, ridge at 5 degrees -> clear.
    const opacity = horizonOcclusionOpacity(0.35, 0.087);
    expect(opacity).toBe(1);
  });

  it('is fully hidden when the sun has sunk well below the ridge', () => {
    // Sun at 2 degrees, ridge at 15 degrees -> behind the hill.
    const opacity = horizonOcclusionOpacity(0.035, 0.26);
    expect(opacity).toBe(0);
  });

  it('fades monotonically as the sun descends toward and past the ridge', () => {
    const ridge = 0.15; // ~8.6 degrees
    const sweep = [0.30, 0.22, 0.17, 0.15, 0.13, 0.08, 0.02];
    let previous = Number.POSITIVE_INFINITY;
    for (const sunElev of sweep) {
      const opacity = horizonOcclusionOpacity(sunElev, ridge);
      expect(opacity).toBeGreaterThanOrEqual(0);
      expect(opacity).toBeLessThanOrEqual(1);
      // Lower sun -> equal or lower opacity (never brightens as it sets).
      expect(opacity).toBeLessThanOrEqual(previous + 1e-9);
      previous = opacity;
    }
    // The extremes of the sweep bracket the full range.
    expect(horizonOcclusionOpacity(sweep[0], ridge)).toBe(1);
    expect(horizonOcclusionOpacity(sweep[sweep.length - 1], ridge)).toBe(0);
  });
});

describe('SunDiscHorizonOcclusion — combined march', () => {
  it('hides the disc when the sun is behind a tall near ridge', () => {
    const samples: HorizonSample[] = [{ distance: 150, terrainHeight: 600 }];
    // Eye at 100m, ridge rises 500m at 150m out -> ~73 degrees blocking.
    // Sun low at ~3 degrees -> hidden.
    const opacity = computeHorizonOcclusion(100, 0.05, samples);
    expect(opacity).toBe(0);
  });

  it('leaves the disc visible over flat, low terrain', () => {
    const samples: HorizonSample[] = [
      { distance: 300, terrainHeight: 50 },
      { distance: 1200, terrainHeight: 40 },
    ];
    const opacity = computeHorizonOcclusion(100, 0.4, samples);
    expect(opacity).toBe(1);
  });
});

describe('SunDiscHorizonOcclusion — terrain-query driver', () => {
  const scratch: HorizonSample[] = [];
  const vec = (x: number, y: number, z: number) => ({ x, y, z });

  it('returns full visibility when the sun is at or below the horizon', () => {
    const terrain = { getHeightAt: () => 9999 };
    const occ = sampleTerrainHorizonOcclusion(terrain, vec(0, 100, 0), vec(1, 0, 0), scratch);
    expect(occ).toBe(1);
  });

  it('returns full visibility when the sun points near-straight up (no ridge can block)', () => {
    const terrain = { getHeightAt: () => 9999 };
    // Horizontal projection below the degenerate-direction threshold: nothing on
    // the horizontal plane can subtend a blocking angle for a straight-up sun.
    const occ = sampleTerrainHorizonOcclusion(terrain, vec(0, 100, 0), vec(1e-6, 1, 1e-6), scratch);
    expect(occ).toBe(1);
  });

  it('returns full visibility when terrain is not ready yet', () => {
    const terrain = { getHeightAt: () => 9999, isTerrainReady: () => false };
    const occ = sampleTerrainHorizonOcclusion(terrain, vec(0, 100, 0), vec(0.7, 0.2, 0), scratch);
    expect(occ).toBe(1);
  });

  it('fades the disc when a low sun is marched into a tall ridge along the sun azimuth', () => {
    // Uniformly tall terrain everywhere -> any low sun is blocked.
    const terrain = { getHeightAt: () => 900, isTerrainReady: () => true };
    // Camera at y=100, sun low (elevation ~ atan2(0.06, ~1) ~ 3.4 degrees).
    const occ = sampleTerrainHorizonOcclusion(terrain, vec(0, 100, 0), vec(0.9, 0.06, 0), scratch);
    expect(occ).toBe(0);
  });

  it('keeps the disc visible when the marched terrain sits below the eye', () => {
    const terrain = { getHeightAt: () => 10, isTerrainReady: () => true };
    // High sun over a valley floor far below the camera.
    const occ = sampleTerrainHorizonOcclusion(terrain, vec(0, 300, 0), vec(0.6, 0.8, 0), scratch);
    expect(occ).toBe(1);
  });

  it('allocates nothing across repeated frames (reuses the scratch buffer)', () => {
    const terrain = { getHeightAt: () => 200, isTerrainReady: () => true };
    const buf: HorizonSample[] = [];
    for (let i = 0; i < 5; i += 1) {
      sampleTerrainHorizonOcclusion(terrain, vec(i, 150, i), vec(0.8, 0.3, 0), buf);
    }
    // The buffer is reused: its length reflects only the last march's samples,
    // never accumulates across frames.
    expect(buf.length).toBeLessThanOrEqual(8);
  });
});
