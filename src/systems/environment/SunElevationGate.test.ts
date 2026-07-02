// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import {
  SUN_GATE_FULL_RAD,
  SUN_GATE_HORIZON_RAD,
  sunCardLowSunFade,
  sunElevationGate,
} from './SunElevationGate';

/**
 * L1 behavior tests for the shared sun-elevation gate curve
 * (`sun-elevation-light-gating`). These assert the OBSERVABLE contract every rig
 * consumer depends on — sunlight dies below the horizon, returns at high sun,
 * and rolls off smoothly and monotonically in between — not the specific edge
 * constants (those are tuning values). See docs/TESTING.md.
 */
describe('sunElevationGate — direct sun dies below the horizon, returns high', () => {
  it('is fully off at and below the geometric horizon', () => {
    // A sun on or under the horizon casts no direct light on a surface; the gate
    // must zero the direct term there so no light "goes through" the terrain.
    expect(sunElevationGate(SUN_GATE_HORIZON_RAD)).toBe(0);
    expect(sunElevationGate(-0.05)).toBe(0);
    expect(sunElevationGate(-0.5)).toBe(0);
    expect(sunElevationGate(-Math.PI / 2)).toBe(0);
  });

  it('is fully on for a sun clear of the horizon band', () => {
    // Above the twilight band the gate must be exactly 1 so the daytime look is
    // unchanged from the ungated behavior (the gate only shapes low sun).
    expect(sunElevationGate(SUN_GATE_FULL_RAD)).toBe(1);
    expect(sunElevationGate(0.3)).toBe(1);
    expect(sunElevationGate(Math.PI / 2)).toBe(1);
  });

  it('rolls off monotonically and smoothly through the twilight band (no pop)', () => {
    // Sample densely across the whole range; the gate must never decrease as the
    // sun rises, and never step by more than a small amount between adjacent
    // samples (a pop would show as a large jump).
    let prev = sunElevationGate(-0.3);
    let maxStep = 0;
    for (let e = -0.3; e <= 0.4; e += 0.005) {
      const g = sunElevationGate(e);
      expect(g).toBeGreaterThanOrEqual(prev - 1e-9); // monotonic non-decreasing
      maxStep = Math.max(maxStep, Math.abs(g - prev));
      prev = g;
    }
    // Adjacent 0.005-rad samples never jump more than ~0.1 — smooth, no pop.
    expect(maxStep).toBeLessThan(0.1);
  });

  it('stays within [0, 1] everywhere', () => {
    for (let e = -1; e <= 1.4; e += 0.02) {
      const g = sunElevationGate(e);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });

  it('midway through the band gives a partial (dusk) contribution, not 0 or 1', () => {
    const mid = (SUN_GATE_HORIZON_RAD + SUN_GATE_FULL_RAD) / 2;
    const g = sunElevationGate(mid);
    expect(g).toBeGreaterThan(0);
    expect(g).toBeLessThan(1);
  });
});

describe('sunCardLowSunFade — companion card-normal correction shares one source', () => {
  it('eases from a floor at low sun up to full with a high sun, monotonically', () => {
    // The card families (foliage/impostor/NPC) read this over sunDirection.y.
    // Low sun -> floor (residual dusk contribution), high sun -> full (1).
    const low = sunCardLowSunFade(0.0);
    const high = sunCardLowSunFade(0.9);
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(1);
    expect(high).toBeCloseTo(1, 6);

    let prev = sunCardLowSunFade(-0.2);
    for (let y = -0.2; y <= 1; y += 0.01) {
      const f = sunCardLowSunFade(y);
      expect(f).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = f;
    }
  });

  it('never drops below its floor (cards keep a residual dusk term, do not crash below terrain)', () => {
    for (let y = -1; y <= 1; y += 0.02) {
      // Floor is the low-sun asymptote; the fade must not undershoot it.
      expect(sunCardLowSunFade(y)).toBeGreaterThanOrEqual(sunCardLowSunFade(-1) - 1e-9);
    }
  });
});
