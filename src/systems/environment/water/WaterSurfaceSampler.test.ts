import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WaterSurfaceSampler } from './WaterSurfaceSampler';
import type { HydrologyWaterQuerySegment } from './HydrologyRiverSurface';

/**
 * Behavior tests for the runtime water-surface sampler. These exercise the
 * gameplay-facing contract that buoyancy / swim / VFX callers depend on:
 * priority of hydrology over global plane, dry positions reporting null,
 * immersion clamping, and the depth → buoyancy scalar mapping.
 *
 * Implementation-mirror assertions on tuning constants (default immersion
 * depth, clamp ranges) are intentionally avoided per docs/TESTING.md.
 */

function makeBindings(opts: {
  globalActive?: boolean;
  globalY?: number;
  segments?: readonly HydrologyWaterQuerySegment[];
}) {
  return {
    globalWaterLevel: opts.globalY ?? 0,
    isGlobalPlaneActive: () => opts.globalActive ?? false,
    getHydrologyQuerySegments: () => opts.segments ?? [],
  };
}

/**
 * Build a hydrology segment with explicit flow data. Most existing tests
 * pre-date the flow fields and only set geometry. This helper keeps new
 * tests readable while leaving the original fixtures alone.
 */
function makeFlowingSegment(overrides: Partial<HydrologyWaterQuerySegment> = {}): HydrologyWaterQuerySegment {
  return {
    startX: 0,
    startZ: 0,
    endX: 10,
    endZ: 0,
    startSurfaceY: 4,
    endSurfaceY: 6,
    halfWidth: 2,
    flowX: 1,
    flowZ: 0,
    flowSpeedMetersPerSecond: 0.5,
    ...overrides,
  };
}

describe('WaterSurfaceSampler', () => {
  it('reports source=none and dry results when no water source covers the point', () => {
    const sampler = new WaterSurfaceSampler(makeBindings({}));

    const sample = sampler.sample(new THREE.Vector3(0, -5, 0));

    expect(sample.source).toBe('none');
    expect(sample.surfaceY).toBeNull();
    expect(sample.depth).toBe(0);
    expect(sample.submerged).toBe(false);
    expect(sample.immersion01).toBe(0);
    expect(sample.buoyancyScalar).toBe(0);
    expect(sampler.isUnderwater(new THREE.Vector3(0, -5, 0))).toBe(false);
    expect(sampler.getWaterSurfaceY(new THREE.Vector3(0, -5, 0))).toBeNull();
  });

  it('uses the global plane when active and no hydrology is present', () => {
    const sampler = new WaterSurfaceSampler(makeBindings({ globalActive: true, globalY: 0 }));

    expect(sampler.getWaterSurfaceY(new THREE.Vector3(10, 5, 10))).toBe(0);
    expect(sampler.getWaterDepth(new THREE.Vector3(10, -3, 10))).toBeCloseTo(3, 5);
    expect(sampler.isUnderwater(new THREE.Vector3(10, -0.1, 10))).toBe(true);
    expect(sampler.isUnderwater(new THREE.Vector3(10, 0.1, 10))).toBe(false);

    const sample = sampler.sample(new THREE.Vector3(0, -2, 0));
    expect(sample.source).toBe('global');
    expect(sample.surfaceY).toBe(0);
    expect(sample.depth).toBeCloseTo(2, 5);
    expect(sample.submerged).toBe(true);
  });

  it('prefers hydrology over the global plane inside the channel half-width', () => {
    const segments: HydrologyWaterQuerySegment[] = [
      {
        startX: 0,
        startZ: 0,
        endX: 10,
        endZ: 0,
        startSurfaceY: 4,
        endSurfaceY: 6,
        halfWidth: 2,
        flowX: 1,
        flowZ: 0,
        flowSpeedMetersPerSecond: 0.5,
      },
    ];
    const sampler = new WaterSurfaceSampler(
      makeBindings({ globalActive: true, globalY: 0, segments }),
    );

    // Midpoint of channel: surfaceY interpolates linearly to 5.
    const sample = sampler.sample(new THREE.Vector3(5, 1, 0));
    expect(sample.source).toBe('hydrology');
    expect(sample.surfaceY).toBeCloseTo(5, 5);
    expect(sample.depth).toBeCloseTo(4, 5);
  });

  it('falls back to global plane outside the channel half-width', () => {
    const segments: HydrologyWaterQuerySegment[] = [
      {
        startX: 0,
        startZ: 0,
        endX: 10,
        endZ: 0,
        startSurfaceY: 4,
        endSurfaceY: 6,
        halfWidth: 2,
        flowX: 1,
        flowZ: 0,
        flowSpeedMetersPerSecond: 0.5,
      },
    ];
    const sampler = new WaterSurfaceSampler(
      makeBindings({ globalActive: true, globalY: 0, segments }),
    );

    // 5 m off-axis: outside the 2 m half-width band.
    expect(sampler.sample(new THREE.Vector3(5, -1, 5)).source).toBe('global');
  });

  it('reports source=none when off-channel and the global plane is disabled', () => {
    const segments: HydrologyWaterQuerySegment[] = [
      {
        startX: 0,
        startZ: 0,
        endX: 10,
        endZ: 0,
        startSurfaceY: 4,
        endSurfaceY: 6,
        halfWidth: 2,
        flowX: 1,
        flowZ: 0,
        flowSpeedMetersPerSecond: 0.5,
      },
    ];
    const sampler = new WaterSurfaceSampler(
      makeBindings({ globalActive: false, segments }),
    );

    expect(sampler.sample(new THREE.Vector3(5, 1, 10)).source).toBe('none');
  });

  it('reports a non-zero flow vector for samples inside a hydrology channel', () => {
    const segments: HydrologyWaterQuerySegment[] = [makeFlowingSegment()];
    const sampler = new WaterSurfaceSampler(
      makeBindings({ globalActive: true, globalY: 0, segments }),
    );

    // Midpoint of the channel — inside the half-width band.
    const sample = sampler.sample(new THREE.Vector3(5, 1, 0));

    expect(sample.source).toBe('hydrology');
    expect(sample.flowVelocity.x).toBeGreaterThan(0);
    expect(sample.flowVelocity.y).toBe(0);
    // Magnitude matches the per-segment flow speed (up to floating point).
    expect(sample.flowVelocity.length()).toBeCloseTo(0.5, 5);
  });

  it('reports a zero flow vector outside any hydrology channel', () => {
    const segments: HydrologyWaterQuerySegment[] = [makeFlowingSegment()];
    const sampler = new WaterSurfaceSampler(
      makeBindings({ globalActive: true, globalY: 0, segments }),
    );

    // Off-axis: outside the channel band -> global plane only, no flow.
    const offAxis = sampler.sample(new THREE.Vector3(5, -1, 5));
    expect(offAxis.source).toBe('global');
    expect(offAxis.flowVelocity.lengthSq()).toBe(0);

    // Dry sample: no water source at all -> still zero.
    const drySampler = new WaterSurfaceSampler(makeBindings({}));
    const dry = drySampler.sample(new THREE.Vector3(0, -5, 0));
    expect(dry.flowVelocity.lengthSq()).toBe(0);
  });

  it('flow vectors from successive samples are independent (no shared scratch)', () => {
    const segments: HydrologyWaterQuerySegment[] = [makeFlowingSegment()];
    const sampler = new WaterSurfaceSampler(
      makeBindings({ globalActive: true, globalY: 0, segments }),
    );

    const a = sampler.sample(new THREE.Vector3(5, 1, 0));
    const b = sampler.sample(new THREE.Vector3(5, 1, 0));
    // Mutating `a.flowVelocity` must not bleed into the next sample.
    a.flowVelocity.set(-100, -100, -100);
    expect(b.flowVelocity.x).toBeCloseTo(0.5, 5);

    const c = sampler.sample(new THREE.Vector3(5, 1, 0));
    expect(c.flowVelocity.x).toBeCloseTo(0.5, 5);
  });

  it('clamps immersion01 to [0, 1] independent of true depth', () => {
    const sampler = new WaterSurfaceSampler(makeBindings({ globalActive: true, globalY: 0 }));

    const deep = sampler.sample(new THREE.Vector3(0, -50, 0), { immersionDepthMeters: 1 });
    expect(deep.immersion01).toBe(1);
    expect(deep.buoyancyScalar).toBe(1);

    const surface = sampler.sample(new THREE.Vector3(0, 0, 0), { immersionDepthMeters: 1 });
    expect(surface.immersion01).toBe(0);
  });
});
