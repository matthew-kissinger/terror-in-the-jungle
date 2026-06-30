// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import {
  applyOrbitDelta,
  applyZoom,
  orbitToCartesian,
  DEFAULT_ORBIT_LIMITS,
  type OrbitState,
} from './OrbitalTopoControls';

const base: OrbitState = { azimuth: 0, polar: 0.9, radius: 150 };

describe('orbital topo controls math', () => {
  it('orbiting changes azimuth freely but clamps polar away from the poles', () => {
    const orbited = applyOrbitDelta(base, 0.5, -5, DEFAULT_ORBIT_LIMITS);
    expect(orbited.azimuth).toBeCloseTo(0.5);
    // A huge downward delta is clamped at the min polar, not driven negative.
    expect(orbited.polar).toBeGreaterThanOrEqual(DEFAULT_ORBIT_LIMITS.minPolar);
    expect(orbited.polar).toBeLessThanOrEqual(DEFAULT_ORBIT_LIMITS.maxPolar);
  });

  it('zoom clamps the radius to the configured range', () => {
    const farOut = applyZoom(base, 100, DEFAULT_ORBIT_LIMITS);
    expect(farOut.radius).toBe(DEFAULT_ORBIT_LIMITS.maxRadius);
    const closeIn = applyZoom(base, 0.0001, DEFAULT_ORBIT_LIMITS);
    expect(closeIn.radius).toBe(DEFAULT_ORBIT_LIMITS.minRadius);
  });

  it('places the camera above the target when looking straight down (small polar)', () => {
    const topDown: OrbitState = { azimuth: 0, polar: 0.01, radius: 100 };
    const pos = orbitToCartesian(topDown, { x: 0, y: 0, z: 0 });
    expect(pos.y).toBeGreaterThan(90);
    expect(Math.abs(pos.x)).toBeLessThan(5);
    expect(Math.abs(pos.z)).toBeLessThan(5);
  });

  it('keeps the camera at the orbit radius distance from the target', () => {
    const pos = orbitToCartesian(base, { x: 0, y: 0, z: 0 });
    const dist = Math.hypot(pos.x, pos.y, pos.z);
    expect(dist).toBeCloseTo(base.radius);
  });
});
