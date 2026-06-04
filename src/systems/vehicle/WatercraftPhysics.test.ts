// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * WatercraftPhysics behavior tests.
 *
 * Authoritative scope: docs/tasks/cycle-voda-3-watercraft.md (R1 — tests)
 * Sibling task: `watercraft-physics-core` (authors `WatercraftPhysics.ts`).
 *
 * --- Stub-then-swap (Option B) -- POST-SWAP STATE ---------------------------
 * The sibling `WatercraftPhysics` has landed on master. This file now drives
 * the real class directly via its `setWaterSampler(...)` setter (the sampler
 * is NOT a config field on the real impl). The seven behavior tests below
 * follow the `GroundVehiclePhysics.test.ts` / `TrackedVehiclePhysics.test.ts`
 * pattern: L2, mocked terrain + water sampler, directional / bounded
 * assertions, no tuning-constant probes (per docs/TESTING.md).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  WatercraftPhysics,
  type WatercraftPhysicsConfig,
} from './WatercraftPhysics';
import type { BuoyancySamplerLike } from '../environment/water/BuoyancyForce';
import type {
  WaterInteractionOptions,
  WaterInteractionSample,
} from '../environment/water/WaterSurfaceSampler';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

// =============================================================================
// Factory: builds the real WatercraftPhysics + attaches the water sampler
// =============================================================================

/**
 * The sibling `WatercraftPhysics` separates construction from sampler
 * binding: the sampler is supplied via `setWaterSampler(...)` (not a config
 * field). This helper bundles both for ergonomic test sites.
 */
function createPhysicsUnderTest(
  config: WatercraftPhysicsConfig,
  sampler: BuoyancySamplerLike,
): WatercraftPhysics {
  const physics = new WatercraftPhysics(config);
  physics.setWaterSampler(sampler);
  return physics;
}

// =============================================================================
// Water sampler fakes (L2 — no WaterSystem, no DOM, no asset loader)
// =============================================================================

const DEFAULT_IMMERSION_DEPTH_METERS = 1.6;

/** Flat global plane at `surfaceY`, optional constant horizontal flow. */
function makeFlatWater(
  surfaceY = 0,
  flow: THREE.Vector3 = new THREE.Vector3(),
): BuoyancySamplerLike {
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
        flowVelocity: depth > 0 ? flow.clone() : new THREE.Vector3(),
      };
    },
  };
}

/**
 * Surface oscillates sinusoidally in time around `meanY`. The sampler keeps
 * an external clock the test increments per step, decoupling wave phase from
 * the physics integrator's own dt accounting.
 */
function makeWaveWater(meanY: number, amplitude: number, omega: number, clock: { t: number }): BuoyancySamplerLike {
  return {
    sampleWaterInteraction(
      position: THREE.Vector3,
      options?: WaterInteractionOptions,
    ): WaterInteractionSample {
      const surfaceY = meanY + amplitude * Math.sin(omega * clock.t);
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
        flowVelocity: new THREE.Vector3(),
      };
    },
  };
}

// =============================================================================
// Terrain fakes
// =============================================================================

function makeDeepTerrain(): ITerrainRuntime {
  // Floor is far below the water — boat cannot touch bottom.
  return makeFlatTerrain(-200);
}

function makeBeachTerrain(waterLevel: number): ITerrainRuntime {
  // Terrain pokes 0.1m above water everywhere — driving into it grounds the hull.
  return makeFlatTerrain(waterLevel + 0.1);
}

function makeFlatTerrain(height: number): ITerrainRuntime {
  return {
    getHeightAt: () => height,
    getEffectiveHeightAt: () => height,
    getSlopeAt: () => 0,
    getNormalAt: (_x, _z, target) => {
      const v = target ?? new THREE.Vector3();
      return v.set(0, 1, 0);
    },
    getPlayableWorldSize: () => 4000,
    getWorldSize: () => 4000,
    isTerrainReady: () => true,
    hasTerrainAt: () => true,
    getActiveTerrainTileCount: () => 1,
    setSurfaceWetness: () => {},
    updatePlayerPosition: () => {},
    registerCollisionObject: () => {},
    unregisterCollisionObject: () => {},
    raycastTerrain: () => ({ hit: false }),
  };
}

// =============================================================================
// Hull factory — a small four-corner rectangle in local space
// =============================================================================

/**
 * Returns a four-corner hull sample layout: FL, FR, RL, RR around the local
 * origin. Length runs along -Z (chassis-forward convention from
 * GroundVehiclePhysics).
 */
function makeRectangularHull(length: number, beam: number): THREE.Vector3[] {
  const halfL = length / 2;
  const halfB = beam / 2;
  return [
    new THREE.Vector3(-halfB, 0, -halfL), // FL
    new THREE.Vector3(+halfB, 0, -halfL), // FR
    new THREE.Vector3(-halfB, 0, +halfL), // RL
    new THREE.Vector3(+halfB, 0, +halfL), // RR
  ];
}

/**
 * Construct a config whose displacement is tuned to float `mass` kg at a
 * known submersion fraction in fresh water. Equilibrium: m = ρ·V·fraction.
 * For a six-meter sampan with mass 250 kg targeting half-submerged float:
 *   V = 250 / (1000 * 0.5) = 0.5 m^3.
 */
function defaultConfig(overrides: Partial<WatercraftPhysicsConfig> = {}): WatercraftPhysicsConfig {
  const mass = 250;
  const fraction = 0.5;
  const waterDensity = 1000;
  const volume = mass / (waterDensity * fraction);
  return {
    hullSamplePoints: makeRectangularHull(6, 2),
    hullDisplacement: volume,
    mass,
    enginePower: 4000,
    rudderAuthority: 1.0,
    dragCoefficient: 1.4,
    bridgeClearance: 2.0,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('WatercraftPhysics', () => {
  const DT = 1 / 60;

  it('neutral buoyancy settles hull to a stable waterline', () => {
    // No throttle, no current, deep terrain. Released from y=3, gravity +
    // per-sample buoyancy form a damped spring → the hull converges to its
    // equilibrium waterline within a few seconds. Behavioral assertions:
    // (a) hull does NOT sink past saturation and does NOT fly off upward,
    // (b) by t=4s the per-second Y envelope is tight (hull settled, not
    // oscillating forever).
    const sampler = makeFlatWater(0);
    const physics = createPhysicsUnderTest(defaultConfig({
      initialPosition: new THREE.Vector3(0, 3, 0), // released above water
    }), sampler);

    const terrain = makeDeepTerrain();
    // Bleed transients for 4s so the damped spring has settled.
    for (let i = 0; i < 240; i += 1) physics.update(DT, terrain);

    const ys: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      physics.update(DT, terrain);
      ys.push(physics.getState().position.y);
    }
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const range = maxY - minY;
    // Envelope bounded — no runaway sink, no runaway lift. With the damping
    // term in `integrateLinear` the equilibrium for this fixture sits near
    // y = -0.6 m (half-submerged, displacement balances weight).
    expect(minY).toBeGreaterThan(-2);
    expect(maxY).toBeLessThan(2);
    // Hull has settled — residual oscillation across 1s is small relative to
    // hull height (HULL_HEIGHT_FOR_IMMERSION = 1.2m).
    expect(range).toBeLessThan(0.1);
    // Velocity finite (no NaN-leak under sustained forcing).
    expect(Number.isFinite(physics.getState().velocity.y)).toBe(true);
  });

  it('throttle drives forward motion', () => {
    // From rest at the waterline, full throttle for ~2s yields measurable
    // forward velocity along the chassis-forward axis (-Z in local).
    const sampler = makeFlatWater(0);
    const physics = createPhysicsUnderTest(defaultConfig({
      initialPosition: new THREE.Vector3(0, 0, 0),
    }), sampler);
    const terrain = makeDeepTerrain();

    // Settle on the water first so transient vertical motion isn't a confounder.
    for (let i = 0; i < 60; i += 1) physics.update(DT, terrain);

    physics.setControls(1.0, 0); // full throttle, neutral rudder
    const startPos = physics.getState().position.clone();
    for (let i = 0; i < 240; i += 1) physics.update(DT, terrain); // 4s

    const fwd = physics.getForwardSpeed();
    // Forward speed materialized.
    expect(fwd).toBeGreaterThan(0.5);
    // Hull travelled horizontally.
    const endPos = physics.getState().position;
    const horizontalTravel = Math.hypot(endPos.x - startPos.x, endPos.z - startPos.z);
    expect(horizontalTravel).toBeGreaterThan(0.5);
  });

  it('rudder yaws hull', () => {
    // From forward motion, full-right rudder for 1s should produce a
    // measurable yaw delta. Direction sign is checked as non-zero (the
    // sibling's convention is opaque to this contract — we assert magnitude
    // and consistency, not handedness).
    const sampler = makeFlatWater(0);
    const physics = createPhysicsUnderTest(defaultConfig({
      initialPosition: new THREE.Vector3(0, 0, 0),
    }), sampler);
    const terrain = makeDeepTerrain();

    // Spool up forward speed first.
    for (let i = 0; i < 60; i += 1) physics.update(DT, terrain);
    physics.setControls(1.0, 0);
    for (let i = 0; i < 180; i += 1) physics.update(DT, terrain);

    // Record yaw before, apply rudder, record yaw after.
    const yawBefore = new THREE.Euler().setFromQuaternion(physics.getState().quaternion, 'YXZ').y;
    physics.setControls(1.0, 1.0); // full rudder
    for (let i = 0; i < 120; i += 1) physics.update(DT, terrain); // 2s

    const yawAfter = new THREE.Euler().setFromQuaternion(physics.getState().quaternion, 'YXZ').y;
    const yawDelta = Math.abs(wrapAngle(yawAfter - yawBefore));
    // Bounded floor — must have turned at least a few degrees.
    expect(yawDelta).toBeGreaterThan(0.05);
    // Sign of angularVelocity matches sign of rudder * forwardSpeed coupling
    // (we just require it's not pinned at zero).
    expect(Math.abs(physics.getState().angularVelocity)).toBeGreaterThan(0.005);
  });

  it('river current drifts hull toward a bounded fraction of flow speed', () => {
    // Flow of (1, 0, 0) m/s. No throttle. The hull is pushed downstream by
    // the channel current via convergent half-coupling: velocity.x rises
    // toward `flow.x * FLOW_COUPLING` (~0.5 m/s) and stays bounded under
    // sustained current.
    const flow = new THREE.Vector3(1, 0, 0);
    const sampler = makeFlatWater(0, flow);
    const physics = createPhysicsUnderTest(defaultConfig({
      initialPosition: new THREE.Vector3(0, -0.2, 0), // start partly submerged
    }), sampler);
    const terrain = makeDeepTerrain();

    // Settle vertically without throttle so any horizontal motion is current-driven.
    for (let i = 0; i < 60; i += 1) physics.update(DT, terrain);
    const xBefore = physics.getState().position.x;

    physics.setControls(0, 0);
    for (let i = 0; i < 240; i += 1) physics.update(DT, terrain); // 4s

    const state = physics.getState();
    // Hull drifted downstream (+X).
    expect(state.position.x - xBefore).toBeGreaterThan(0.1);
    // Horizontal velocity converges toward half-flow (0.5 m/s) — directional,
    // and bounded well below the full channel speed (no unbounded accumulation).
    expect(state.velocity.x).toBeGreaterThan(0.2);
    expect(state.velocity.x).toBeLessThan(0.9);
    // Velocity is finite (no NaN-leak under sustained forcing).
    expect(Number.isFinite(state.velocity.x)).toBe(true);
  });

  it('beach contact transitions to grounded state', () => {
    // Terrain pokes 0.1m above the water surface — driving forward into
    // it grounds the hull.
    const waterLevel = 0;
    const sampler = makeFlatWater(waterLevel);
    const physics = createPhysicsUnderTest(defaultConfig({
      initialPosition: new THREE.Vector3(0, 0, 0),
    }), sampler);
    const terrain = makeBeachTerrain(waterLevel);

    // Apply throttle for a couple seconds to drive into the "beach."
    physics.setControls(1.0, 0);
    for (let i = 0; i < 240; i += 1) physics.update(DT, terrain);

    expect(physics.isGrounded()).toBe(true);
    expect(physics.getState().grounded).toBe(true);
  });

  it('bridge clearance: API exists and reports a boolean (MVP no-op contract)', () => {
    // Per the brief: bridge clearance check is API-exists, not behavioral
    // in the MVP. The sibling returns `false` always (bridge detection not
    // wired). Test exercises the path and verifies the contract:
    // method exists, returns a boolean, does not throw.
    const sampler = makeFlatWater(0);
    const physics = createPhysicsUnderTest(defaultConfig({
      bridgeClearance: 2.0,
    }), sampler);
    const terrain = makeDeepTerrain();

    physics.update(DT, terrain);
    const result = physics.isUnderBridge();
    expect(typeof result).toBe('boolean');
    // No throw, no NaN-leak into state.
    expect(Number.isFinite(physics.getState().position.y)).toBe(true);
  });

  it('wave heave produces vertical oscillation', () => {
    // Sinusoidal water surface around y = 2 with amplitude 0.5. The hull
    // tracks the surface — Y position varies through a bounded band larger
    // than what a still-water settle would produce.
    const clock = { t: 0 };
    const meanY = 2.0;
    const amplitude = 0.5;
    const omega = 2 * Math.PI / 2.0; // 2s period
    const sampler = makeWaveWater(meanY, amplitude, omega, clock);

    const physics = createPhysicsUnderTest(defaultConfig({
      initialPosition: new THREE.Vector3(0, meanY, 0),
    }), sampler);
    const terrain = makeDeepTerrain();

    // Settle into the wave field.
    for (let i = 0; i < 240; i += 1) {
      physics.update(DT, terrain);
      clock.t += DT;
    }

    // Sample Y across one wave period at fine resolution; oscillation must
    // be non-degenerate.
    const samples: number[] = [];
    for (let i = 0; i < 240; i += 1) {
      physics.update(DT, terrain);
      clock.t += DT;
      samples.push(physics.getState().position.y);
    }
    const minY = Math.min(...samples);
    const maxY = Math.max(...samples);
    const range = maxY - minY;
    // Hull oscillated through at least a fraction of the wave amplitude.
    expect(range).toBeGreaterThan(amplitude * 0.1);
    // Y is bounded and finite (no integrator blow-up under repeated forcing).
    expect(Number.isFinite(minY)).toBe(true);
    expect(Number.isFinite(maxY)).toBe(true);
    // Variance > 0 confirms responsiveness — not pinned at a static settle.
    const meanSample = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((acc, y) => acc + (y - meanSample) ** 2, 0) / samples.length;
    expect(variance).toBeGreaterThan(0);
  });
});

// =============================================================================
// Helpers
// =============================================================================

function wrapAngle(a: number): number {
  // Wrap to (-π, π].
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x <= -Math.PI) x += 2 * Math.PI;
  return x;
}
