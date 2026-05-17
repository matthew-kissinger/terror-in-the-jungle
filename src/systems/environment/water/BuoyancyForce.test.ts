import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  applyBuoyancyForce,
  applyBuoyancyForceBatch,
  neutralImmersion,
  DEFAULT_BUOYANCY_CONFIG,
  type BuoyantBody,
  type BuoyancySamplerLike,
} from './BuoyancyForce';
import type {
  WaterInteractionOptions,
  WaterInteractionSample,
} from './WaterSurfaceSampler';

/**
 * Behavior tests for `applyBuoyancyForce`. We assert *what* the integrator
 * does to a body over time (settles at neutral, sinks if too heavy,
 * resurfaces from depth, does not blow up under repeated cycles) and
 * deliberately avoid pinning specific tuning constants. Per docs/TESTING.md,
 * implementation-mirror assertions on coefficients, internal scratch
 * vectors, and exact magnitudes are not made.
 *
 * The sampler is a lightweight stub modelling a flat water plane at
 * y = 0. That keeps the test L1-pure: no `WaterSystem`, no DOM, no
 * Three.js scene graph.
 */

const DEFAULT_IMMERSION_DEPTH_METERS = 1.6;

/**
 * Stub sampler: water surface lives at `surfaceY`; immersion saturates over
 * `immersionDepthMeters` so the buoyancyScalar behaves the way the real
 * WaterSurfaceSampler does. No hydrology, no global-plane gating.
 */
function makeFlatWater(surfaceY = 0): BuoyancySamplerLike {
  return {
    sampleWaterInteraction(
      position: THREE.Vector3,
      options?: WaterInteractionOptions,
    ): WaterInteractionSample {
      const depth = Math.max(0, surfaceY - position.y);
      const immersionDepth = options?.immersionDepthMeters
        && options.immersionDepthMeters > 0.01
        ? options.immersionDepthMeters
        : DEFAULT_IMMERSION_DEPTH_METERS;
      const immersion01 = Math.min(1, depth / immersionDepth);
      return {
        source: depth > 0 ? 'global' : 'none',
        surfaceY: depth > 0 ? surfaceY : null,
        depth,
        submerged: depth > 0,
        immersion01,
        buoyancyScalar: immersion01,
      };
    },
  };
}

function makeBody(overrides: Partial<BuoyantBody> = {}): BuoyantBody {
  return {
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    mass: 1,
    volume: 0.001,
    dragCoefficient: 1.4,
    ...overrides,
    // Avoid the spread-copy aliasing the caller's vectors.
    ...(overrides.position ? { position: overrides.position.clone() } : { position: new THREE.Vector3(0, 0, 0) }),
    ...(overrides.velocity ? { velocity: overrides.velocity.clone() } : { velocity: new THREE.Vector3(0, 0, 0) }),
  };
}

/** Run the integrator for `seconds` of sim time at fixed `dt`. */
function simulate(
  body: BuoyantBody,
  sampler: BuoyancySamplerLike,
  seconds: number,
  dt = 1 / 60,
): void {
  const steps = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < steps; i += 1) {
    applyBuoyancyForce(body, dt, sampler);
  }
}

describe('applyBuoyancyForce — behavior contract', () => {
  it('a body with neutral buoyancy settles at the surface from above and below', () => {
    const sampler = makeFlatWater(0);
    // Pick a (mass, volume) pair whose neutralImmersion is < 1 (sits below the
    // saturation depth), so the body finds an equilibrium below the surface.
    // 1 kg / 0.005 m^3 → neutralImmersion = 1 / (1000 * 0.005) = 0.2.
    const body = makeBody({
      mass: 1,
      volume: 0.005,
      dragCoefficient: 4.0, // strong drag so we converge quickly in test time
      position: new THREE.Vector3(0, 5, 0),
    });

    simulate(body, sampler, 20);

    // Equilibrium: weight = buoyancy → ρVg·imm = mg → imm = m/(ρV).
    const expectedImmersion = neutralImmersion(body.mass, body.volume);
    const expectedY = -expectedImmersion * DEFAULT_IMMERSION_DEPTH_METERS;

    expect(Math.abs(body.position.y - expectedY)).toBeLessThan(0.1);
    expect(Math.abs(body.velocity.y)).toBeLessThan(0.2);

    // Same equilibrium from below.
    const fromBelow = makeBody({
      mass: 1,
      volume: 0.005,
      dragCoefficient: 4.0,
      position: new THREE.Vector3(0, -5, 0),
    });
    simulate(fromBelow, sampler, 20);
    expect(Math.abs(fromBelow.position.y - expectedY)).toBeLessThan(0.1);
    expect(Math.abs(fromBelow.velocity.y)).toBeLessThan(0.2);
  });

  it('a body too heavy for its displaced volume sinks past saturation', () => {
    const sampler = makeFlatWater(0);
    // 50 kg, 0.005 m^3 → neutralImmersion = 10 (impossible to float);
    // immersion saturates at 1 and the body still has net downward force.
    const body = makeBody({
      mass: 50,
      volume: 0.005,
      dragCoefficient: 1.5,
      position: new THREE.Vector3(0, 0, 0),
    });

    const startY = body.position.y;
    simulate(body, sampler, 6);

    expect(body.position.y).toBeLessThan(startY - 2);
    expect(body.velocity.y).toBeLessThan(0);
    expect(neutralImmersion(body.mass, body.volume)).toBeGreaterThan(1);
  });

  it('a body released deep underwater rises back toward the surface', () => {
    const sampler = makeFlatWater(0);
    const body = makeBody({
      mass: 1,
      volume: 0.005,
      dragCoefficient: 4.0,
      position: new THREE.Vector3(0, -10, 0),
    });

    const startY = body.position.y;

    // Within a few seconds the body should have made significant upward progress.
    simulate(body, sampler, 4);
    expect(body.position.y).toBeGreaterThan(startY + 1);

    // After enough sim time it converges near the same neutral equilibrium.
    simulate(body, sampler, 30);
    const expectedY = -neutralImmersion(body.mass, body.volume) * DEFAULT_IMMERSION_DEPTH_METERS;
    expect(Math.abs(body.position.y - expectedY)).toBeLessThan(0.15);
  });

  it('a damped body does not grow in oscillation amplitude over many cycles', () => {
    const sampler = makeFlatWater(0);
    const body = makeBody({
      mass: 1,
      volume: 0.005,
      dragCoefficient: 3.0, // sub-critical so we actually oscillate
      position: new THREE.Vector3(0, 3, 0),
    });

    const dt = 1 / 120; // smaller step keeps explicit-Euler honest for this assertion
    const samples: number[] = [];
    const totalSteps = 60 * 120; // 60 seconds
    for (let i = 0; i < totalSteps; i += 1) {
      applyBuoyancyForce(body, dt, sampler);
      if (i % 5 === 0) samples.push(body.position.y);
    }

    // Bucket into 10 windows of equal width; the peak deviation from the
    // long-run mean must not grow window-over-window. (Behavior assertion:
    // damped, not necessarily exact critical damping.)
    const bucketSize = Math.floor(samples.length / 10);
    const meanLastWindow = average(samples.slice(samples.length - bucketSize));
    const peakDevs: number[] = [];
    for (let b = 0; b < 10; b += 1) {
      const slice = samples.slice(b * bucketSize, (b + 1) * bucketSize);
      let peak = 0;
      for (const y of slice) {
        const dev = Math.abs(y - meanLastWindow);
        if (dev > peak) peak = dev;
      }
      peakDevs.push(peak);
    }

    // No window's peak deviation should exceed the first window's peak — a
    // strictly non-growing envelope, which a damped system guarantees.
    for (let b = 1; b < peakDevs.length; b += 1) {
      expect(peakDevs[b]).toBeLessThanOrEqual(peakDevs[0] + 1e-6);
    }

    // And the final settling deviation should be small compared to start.
    expect(peakDevs[peakDevs.length - 1]).toBeLessThan(peakDevs[0] * 0.5);

    // No NaNs / infinities.
    expect(Number.isFinite(body.position.y)).toBe(true);
    expect(Number.isFinite(body.velocity.y)).toBe(true);
  });

  it('a dry body falls under gravity only (no buoyancy applied above water)', () => {
    const sampler = makeFlatWater(0);
    const body = makeBody({
      mass: 1,
      volume: 0.005,
      dragCoefficient: 4.0,
      position: new THREE.Vector3(0, 5, 0),
    });

    // One short step from rest above water.
    applyBuoyancyForce(body, 0.1, sampler);
    // Falling: velocity is downward, not damped (dry).
    expect(body.velocity.y).toBeLessThan(0);
    // Free-fall acceleration approximation: |Δv| ≈ g * dt = ~0.981.
    expect(Math.abs(body.velocity.y)).toBeGreaterThan(0.5);
    expect(Math.abs(body.velocity.y)).toBeLessThan(2.0);
  });

  it('skips integration for non-finite or non-positive dt', () => {
    const sampler = makeFlatWater(0);
    const body = makeBody({
      mass: 1,
      volume: 0.005,
      dragCoefficient: 4.0,
      position: new THREE.Vector3(0, 5, 0),
      velocity: new THREE.Vector3(1, 2, 3),
    });

    const beforePos = body.position.clone();
    const beforeVel = body.velocity.clone();

    applyBuoyancyForce(body, 0, sampler);
    applyBuoyancyForce(body, Number.NaN, sampler);
    applyBuoyancyForce(body, -0.016, sampler);

    expect(body.position.equals(beforePos)).toBe(true);
    expect(body.velocity.equals(beforeVel)).toBe(true);
  });

  it('clamps body velocity to the configured maxLinearSpeed', () => {
    const sampler = makeFlatWater(0);
    const body = makeBody({
      mass: 1,
      volume: 0.005,
      dragCoefficient: 0, // disable damping to isolate the clamp
      position: new THREE.Vector3(0, 100, 0),
      velocity: new THREE.Vector3(0, -1000, 0), // start absurdly fast
    });

    applyBuoyancyForce(body, 1 / 60, sampler);
    expect(body.velocity.length()).toBeLessThanOrEqual(DEFAULT_BUOYANCY_CONFIG.maxLinearSpeed + 1e-6);
  });

  it('reuses a pre-merged config across the batch path', () => {
    const sampler = makeFlatWater(0);
    // Pick non-neutral mass/volume pairs so a single batched step always
    // produces a non-zero net force; neutral buoyancy would be a degenerate
    // "moved by zero force" case that hides a no-op bug in the batch path.
    const bodies = [
      makeBody({ mass: 1, volume: 0.0005, position: new THREE.Vector3(0, 5, 0) }),
      makeBody({ mass: 1, volume: 0.0005, position: new THREE.Vector3(10, -2, 0) }),
      makeBody({ mass: 1, volume: 0.0005, position: new THREE.Vector3(-5, 0.5, 5) }),
    ];

    applyBuoyancyForceBatch(bodies, 1 / 60, sampler, { gravity: 9.81 });

    // The batch path must apply a non-zero impulse to every body.
    for (const body of bodies) {
      expect(body.velocity.lengthSq()).toBeGreaterThan(0);
    }
  });

  it('uses caller-provided immersionDepthMeters so callers can tune saturation', () => {
    // Body just below the surface. With small immersionDepthMeters the body
    // saturates buoyancy quickly; with large it stays sub-buoyant.
    const sampler = makeFlatWater(0);

    const shallow = makeBody({
      mass: 1,
      volume: 0.01, // neutralImmersion = 0.1 vs. depthMeters=0.5 → expected y ≈ -0.05
      dragCoefficient: 5,
      position: new THREE.Vector3(0, -2, 0),
    });
    for (let i = 0; i < 60 * 30; i += 1) {
      applyBuoyancyForce(shallow, 1 / 60, sampler, {}, { immersionDepthMeters: 0.5 });
    }

    const deep = makeBody({
      mass: 1,
      volume: 0.01,
      dragCoefficient: 5,
      position: new THREE.Vector3(0, -2, 0),
    });
    for (let i = 0; i < 60 * 30; i += 1) {
      applyBuoyancyForce(deep, 1 / 60, sampler, {}, { immersionDepthMeters: 5.0 });
    }

    // Smaller saturation depth → equilibrium closer to surface.
    expect(deep.position.y).toBeLessThan(shallow.position.y);
  });
});

describe('neutralImmersion', () => {
  it('returns mass / (ρ * V) for finite positive volume', () => {
    // 1 kg, 0.001 m^3 in fresh water → 1.0 (exactly afloat at saturation).
    expect(neutralImmersion(1, 0.001)).toBeCloseTo(1, 6);
    // Half mass, same volume → 0.5.
    expect(neutralImmersion(0.5, 0.001)).toBeCloseTo(0.5, 6);
  });

  it('returns +Infinity for zero or negative volume (body cannot float)', () => {
    expect(neutralImmersion(1, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(neutralImmersion(1, -1)).toBe(Number.POSITIVE_INFINITY);
  });
});

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}
