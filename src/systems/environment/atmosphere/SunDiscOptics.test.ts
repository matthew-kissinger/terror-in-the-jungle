// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import {
  limbDarkening,
  scatterHalo,
  SUN_DISC_LIMB_U,
  SUN_DISC_HALO_OUTER_R,
  SUN_DISC_HALO_STRENGTH,
} from './SunDiscOptics';

/**
 * Behaviour contract for the sun-disc optics (`sun-disc-scorch-rebuild`). We
 * assert the SHAPE of the limb-darkening and halo functions — a body that is
 * brightest at center and dims to its limb, and a scatter ring that lives only
 * just outside the body edge — not any single tuning constant.
 */
describe('SunDiscOptics — limb darkening', () => {
  it('is fully bright at the disc center (I(0) = 1)', () => {
    expect(limbDarkening(0)).toBeCloseTo(1, 6);
  });

  it('dims to exactly 1 - u at the limb (I(1) = 1 - u)', () => {
    expect(limbDarkening(1)).toBeCloseTo(1 - SUN_DISC_LIMB_U, 6);
  });

  it('is monotonically decreasing from center to limb (a body with volume, not a flat lobe)', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 20; i += 1) {
      const r = i / 20;
      const v = limbDarkening(r);
      expect(v).toBeLessThanOrEqual(previous + 1e-9);
      previous = v;
    }
  });

  it('stays within [1 - u, 1] across the body and clamps outside it', () => {
    for (const r of [-0.5, 0, 0.25, 0.5, 0.75, 1, 1.5]) {
      const v = limbDarkening(r);
      expect(v).toBeGreaterThanOrEqual(1 - SUN_DISC_LIMB_U - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
    // Beyond the limb clamps to the limb value rather than going negative.
    expect(limbDarkening(2)).toBeCloseTo(1 - SUN_DISC_LIMB_U, 6);
  });

  it('honors a custom coefficient (u = 0 is a flat disc)', () => {
    for (const r of [0, 0.3, 0.6, 1]) {
      expect(limbDarkening(r, 0)).toBeCloseTo(1, 6);
    }
  });
});

describe('SunDiscOptics — forward-scatter halo', () => {
  it('is zero inside the body (r <= 1): the body owns that region, not the halo', () => {
    for (const r of [0, 0.5, 0.9, 1]) {
      expect(scatterHalo(r)).toBe(0);
    }
  });

  it('is zero beyond the tight halo annulus (the dome owns the wide glow)', () => {
    expect(scatterHalo(SUN_DISC_HALO_OUTER_R)).toBe(0);
    expect(scatterHalo(SUN_DISC_HALO_OUTER_R + 0.5)).toBe(0);
    expect(scatterHalo(5)).toBe(0);
  });

  it('peaks just outside the body edge and falls off outward', () => {
    const nearEdge = scatterHalo(1.05);
    const midway = scatterHalo((1 + SUN_DISC_HALO_OUTER_R) / 2);
    const nearOuter = scatterHalo(SUN_DISC_HALO_OUTER_R - 0.05);
    expect(nearEdge).toBeGreaterThan(0);
    expect(nearEdge).toBeGreaterThan(midway);
    expect(midway).toBeGreaterThan(nearOuter);
  });

  it('never exceeds the configured peak strength', () => {
    for (let i = 0; i <= 40; i += 1) {
      const r = 1 + (i / 40) * (SUN_DISC_HALO_OUTER_R - 1);
      expect(scatterHalo(r)).toBeLessThanOrEqual(SUN_DISC_HALO_STRENGTH + 1e-9);
    }
  });

  it('keeps the halo tight — the annulus is only a fraction of the body radius wide', () => {
    // The dome owns the WIDE glow; this ring must not sprawl. Outer radius stays
    // within a couple body-radii of the edge.
    expect(SUN_DISC_HALO_OUTER_R).toBeGreaterThan(1);
    expect(SUN_DISC_HALO_OUTER_R).toBeLessThan(3);
  });
});
