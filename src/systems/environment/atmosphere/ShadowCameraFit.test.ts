// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import {
  computeShadowCameraFit,
  SHADOW_FIT_MAX_DEPTH_MULTIPLE,
  SHADOW_FIT_MIN_ELEVATION_SIN,
} from './ShadowCameraFit';

/**
 * Behavior contract for the elevation-aware single-shadow-map fit
 * (`shadow-single-map-truth`). We assert the SHAPE of the fit — the ground under
 * the player is always inside the depth column, the column lengthens at low sun
 * but stays bounded, and bias grows toward the horizon — NOT any single tuning
 * constant. The bug being fixed: the legacy fixed box (far 300) sat inside the
 * 500m light distance, so the ground beneath the player was clipped out.
 */

const LIGHT_DISTANCE = 500;

function fit(sunElevationSin: number, mapSize = 2048, groundHalfExtent = 100) {
  return computeShadowCameraFit({ groundHalfExtent, sunElevationSin, lightDistance: LIGHT_DISTANCE, mapSize });
}

describe('computeShadowCameraFit — depth column straddles the light distance', () => {
  it('always contains the follow-target plane (the ground under the player) at every sun angle', () => {
    for (const e of [1.0, 0.7, 0.4, 0.2, SHADOW_FIT_MIN_ELEVATION_SIN, 0.02, -0.3]) {
      const f = fit(e);
      // The target sits at lightDistance from the light; it must be inside [near, far].
      expect(f.near).toBeLessThan(LIGHT_DISTANCE);
      expect(f.far).toBeGreaterThan(LIGHT_DISTANCE);
    }
  });

  it('keeps the near plane positive (never degenerate/inverted)', () => {
    for (const e of [1.0, 0.5, SHADOW_FIT_MIN_ELEVATION_SIN, 0.0, -1.0]) {
      expect(fit(e).near).toBeGreaterThan(0);
    }
  });
});

describe('computeShadowCameraFit — column lengthens at low sun but stays bounded', () => {
  it('grows the far plane as the sun lowers (a shallow light projects onto a longer column)', () => {
    const high = fit(0.9).far;
    const mid = fit(0.4).far;
    const low = fit(0.15).far;
    expect(mid).toBeGreaterThan(high);
    expect(low).toBeGreaterThan(mid);
  });

  it('caps the far plane so a grazing sun cannot blow up the depth range', () => {
    const cap = LIGHT_DISTANCE * SHADOW_FIT_MAX_DEPTH_MULTIPLE;
    for (const e of [SHADOW_FIT_MIN_ELEVATION_SIN, 0.05, 0.0, -0.5]) {
      expect(fit(e).far).toBeLessThanOrEqual(cap + 1e-6);
    }
  });

  it('floors a sub-horizon sun to the minimum plausible elevation (no infinite column)', () => {
    const below = fit(-0.4);
    const floored = fit(SHADOW_FIT_MIN_ELEVATION_SIN);
    expect(below.effectiveElevationSin).toBeCloseTo(SHADOW_FIT_MIN_ELEVATION_SIN, 6);
    expect(below.far).toBeCloseTo(floored.far, 6);
  });
});

describe('computeShadowCameraFit — bias grows toward the horizon', () => {
  it('uses a larger-magnitude bias at grazing sun than at zenith (clears low-sun acne)', () => {
    const zenith = fit(1.0);
    const graze = fit(SHADOW_FIT_MIN_ELEVATION_SIN);
    expect(Math.abs(graze.bias)).toBeGreaterThan(Math.abs(zenith.bias));
    expect(graze.normalBias).toBeGreaterThan(zenith.normalBias);
  });

  it('scales normalBias up for lower-resolution shadow maps (coarser texels need a larger push)', () => {
    const big = fit(0.5, 2048).normalBias;
    const small = fit(0.5, 512).normalBias;
    expect(small).toBeGreaterThan(big);
  });
});

describe('computeShadowCameraFit — ortho footprint is preserved', () => {
  it('leaves the horizontal half-extent unchanged (only depth + bias are elevation-driven)', () => {
    for (const half of [70, 100]) {
      expect(fit(0.5, 2048, half).halfExtent).toBe(half);
    }
  });
});
