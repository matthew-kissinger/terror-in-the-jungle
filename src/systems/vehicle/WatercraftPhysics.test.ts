/**
 * WatercraftPhysics behavior tests.
 *
 * Authoritative scope: docs/tasks/cycle-voda-3-watercraft.md (R1 — tests)
 * Sibling task: `watercraft-physics-core` (authors `WatercraftPhysics.ts`).
 *
 * --- Stub-then-swap (Option B per the task brief) ---------------------------
 *
 * This file is authored before the sibling `WatercraftPhysics.ts` lands on
 * master. Per the brief's "Stub-then-swap pattern", we declare the public
 * surface as a file-scope `IWatercraftPhysics` interface and exercise the
 * behavior contract through that interface. A small reference implementation
 * (`InternalReferenceWatercraftPhysics`) lives at the bottom of this file so
 * the suite is runnable *today* — it composes `applyBuoyancyForce` per hull
 * sample, applies throttle/rudder forces, and runs a quadratic drag pass.
 *
 * **Orchestrator post-merge swap procedure** (single import-line change):
 *   1. Replace the `createPhysicsUnderTest` factory with:
 *        `import { WatercraftPhysics, type WatercraftPhysicsConfig } from './WatercraftPhysics';`
 *        `function createPhysicsUnderTest(config: WatercraftPhysicsConfig): IWatercraftPhysics {`
 *        `  return new WatercraftPhysics(config);`
 *        `}`
 *   2. Delete `InternalReferenceWatercraftPhysics` (and any helpers used only by it).
 *   3. Delete the local `WatercraftPhysicsConfig` + `IWatercraftPhysics` declarations
 *      if the sibling file exports a structurally identical pair.
 *
 * The seven behavior tests (per brief §watercraft-physics-tests) are deliberately
 * tight enough to fail on broken physics and loose enough to pass on any correct
 * implementation. They follow the `GroundVehiclePhysics.test.ts` /
 * `TrackedVehiclePhysics.test.ts` pattern: L2, mocked terrain + water sampler,
 * directional / bounded assertions, no tuning-constant probes (per docs/TESTING.md).
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  applyBuoyancyForce,
  type BuoyantBody,
  type BuoyancySamplerLike,
} from '../environment/water/BuoyancyForce';
import type {
  WaterInteractionOptions,
  WaterInteractionSample,
} from '../environment/water/WaterSurfaceSampler';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

// =============================================================================
// Local contract (Option B stub — orchestrator deletes / replaces post-merge)
// =============================================================================

interface WatercraftPhysicsConfig {
  hullSamplePoints: ReadonlyArray<THREE.Vector3>;
  hullDisplacement: number;
  mass: number;
  enginePower: number;
  rudderAuthority: number;
  dragCoefficient: number;
  bridgeClearance?: number;
  initialPosition?: THREE.Vector3;
  initialQuaternion?: THREE.Quaternion;
  /**
   * The watercraft needs to query water for buoyancy + flow. The sibling
   * impl is expected to accept a sampler via config (most natural injection
   * point for an L2-testable rig). If the sibling chose a different shape
   * — e.g. `update(dt, terrain, sampler)` — the orchestrator should adjust
   * the swap step to match.
   */
  waterSampler: BuoyancySamplerLike;
}

interface HullSampleResult {
  position: THREE.Vector3;
  submerged: boolean;
  depth: number;
}

interface WatercraftState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  angularVelocity: number;
  throttle: number;
  rudder: number;
  grounded: boolean;
}

interface IWatercraftPhysics {
  update(dt: number, terrain: ITerrainRuntime | undefined): void;
  setControls(throttle: number, rudder: number): void;
  setPosition(pos: THREE.Vector3): void;
  setQuaternion(q: THREE.Quaternion): void;
  getState(): WatercraftState;
  getForwardSpeed(): number;
  getHullSamples(): ReadonlyArray<HullSampleResult>;
  isGrounded(): boolean;
  isUnderBridge(): boolean;
  dispose(): void;
}

/**
 * Orchestrator swap point. Replace the body with:
 *   `return new WatercraftPhysics(config);`
 * once the sibling impl has landed on master.
 */
function createPhysicsUnderTest(config: WatercraftPhysicsConfig): IWatercraftPhysics {
  return new InternalReferenceWatercraftPhysics(config);
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
    waterSampler: makeFlatWater(0),
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('WatercraftPhysics', () => {
  const DT = 1 / 60;

  it('neutral buoyancy floats at expected waterline', () => {
    // No throttle, no current, deep terrain. Hull settles at the equilibrium
    // immersion line — bounded near the surface within a generous tolerance.
    const sampler = makeFlatWater(0);
    const physics = createPhysicsUnderTest(defaultConfig({
      waterSampler: sampler,
      initialPosition: new THREE.Vector3(0, 3, 0), // released above water
    }));

    const terrain = makeDeepTerrain();
    for (let i = 0; i < 600; i += 1) physics.update(DT, terrain); // 10s settle

    const y = physics.getState().position.y;
    // Hull centre sits near the surface — within a hull-thickness band.
    // Behavioral assertion: did NOT sink past saturation, did NOT fly off.
    expect(y).toBeGreaterThan(-2.0);
    expect(y).toBeLessThan(1.0);
    // Vertical velocity has bled toward zero (damped settle).
    expect(Math.abs(physics.getState().velocity.y)).toBeLessThan(1.0);
  });

  it('throttle drives forward motion', () => {
    // From rest at the waterline, full throttle for ~2s yields measurable
    // forward velocity along the chassis-forward axis (-Z in local).
    const sampler = makeFlatWater(0);
    const physics = createPhysicsUnderTest(defaultConfig({
      waterSampler: sampler,
      initialPosition: new THREE.Vector3(0, 0, 0),
    }));
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
      waterSampler: sampler,
      initialPosition: new THREE.Vector3(0, 0, 0),
    }));
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

  it('river current adds drift to stationary hull', () => {
    // Flow of (1, 0, 0) m/s. No throttle. After a few seconds the hull's
    // velocity x-component is positive (drifting downstream); magnitude
    // lands in a fraction of flow speed per the half-coupling pattern
    // BuoyancyForce uses.
    const flow = new THREE.Vector3(1, 0, 0);
    const sampler = makeFlatWater(0, flow);
    const physics = createPhysicsUnderTest(defaultConfig({
      waterSampler: sampler,
      initialPosition: new THREE.Vector3(0, -0.2, 0), // start partly submerged
    }));
    const terrain = makeDeepTerrain();

    // Settle vertically without throttle so any horizontal motion is current-driven.
    for (let i = 0; i < 60; i += 1) physics.update(DT, terrain);
    const xBefore = physics.getState().position.x;

    physics.setControls(0, 0);
    for (let i = 0; i < 240; i += 1) physics.update(DT, terrain); // 4s

    const state = physics.getState();
    // Hull drifted downstream (+X).
    expect(state.position.x - xBefore).toBeGreaterThan(0.1);
    // Horizontal velocity has a positive x-component.
    expect(state.velocity.x).toBeGreaterThan(0.05);
    // Magnitude is a sane fraction of flow (not amplifying past it).
    expect(state.velocity.x).toBeLessThanOrEqual(flow.x + 1e-3);
  });

  it('beach contact transitions to grounded state', () => {
    // Terrain pokes 0.1m above the water surface — driving forward into
    // it grounds the hull.
    const waterLevel = 0;
    const sampler = makeFlatWater(waterLevel);
    const physics = createPhysicsUnderTest(defaultConfig({
      waterSampler: sampler,
      initialPosition: new THREE.Vector3(0, 0, 0),
    }));
    const terrain = makeBeachTerrain(waterLevel);

    // Apply throttle for a couple seconds to drive into the "beach."
    physics.setControls(1.0, 0);
    for (let i = 0; i < 240; i += 1) physics.update(DT, terrain);

    expect(physics.isGrounded()).toBe(true);
    expect(physics.getState().grounded).toBe(true);
  });

  it('bridge clearance: API exists and reports a boolean (MVP no-op contract)', () => {
    // Per the brief: bridge clearance check is API-exists, not behavioral
    // in the MVP. The sibling likely returns `false` always (no bridge
    // detection wired). Test exercises the path and verifies the contract:
    // method exists, returns a boolean, does not throw.
    const sampler = makeFlatWater(0);
    const physics = createPhysicsUnderTest(defaultConfig({
      waterSampler: sampler,
      bridgeClearance: 2.0,
    }));
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
      waterSampler: sampler,
      initialPosition: new THREE.Vector3(0, meanY, 0),
    }));
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

// =============================================================================
// Internal reference implementation (orchestrator DELETES post-merge)
// -----------------------------------------------------------------------------
// Lightweight reference watercraft physics that satisfies the
// `IWatercraftPhysics` contract using the shipped `applyBuoyancyForce`.
// Purpose: keeps this test file runnable today, before the sibling impl
// lands on master. The seven tests above are written so that any correct
// `WatercraftPhysics` impl will also pass them.
//
// Force model:
//   - Per hull-sample buoyancy via `applyBuoyancyForce` against the shared
//     waterSampler.
//   - Throttle: forward thrust along the chassis-forward axis (-Z local).
//   - Rudder: yaw torque proportional to (rudder * forwardSpeed *
//     rudderAuthority).
//   - Drag: quadratic damping on horizontal velocity.
//   - Grounding: when ALL hull sample positions are at-or-above the terrain
//     surface by a small skin, set `grounded = true`.
// =============================================================================

class InternalReferenceWatercraftPhysics implements IWatercraftPhysics {
  private readonly config: WatercraftPhysicsConfig;
  private readonly state: WatercraftState;
  private readonly aggregateBody: BuoyantBody;
  private hullSampleScratch: HullSampleResult[];
  private disposed = false;

  constructor(config: WatercraftPhysicsConfig) {
    this.config = config;
    this.state = {
      position: (config.initialPosition ?? new THREE.Vector3()).clone(),
      velocity: new THREE.Vector3(),
      quaternion: (config.initialQuaternion ?? new THREE.Quaternion()).clone(),
      angularVelocity: 0,
      throttle: 0,
      rudder: 0,
      grounded: false,
    };
    // Aggregate body — buoyancy is integrated once against the full hull
    // displacement at the hull centroid. Per-sample submerged tracking
    // happens in update().
    this.aggregateBody = {
      position: this.state.position,
      velocity: this.state.velocity,
      mass: config.mass,
      volume: config.hullDisplacement,
      dragCoefficient: config.dragCoefficient,
    };
    this.hullSampleScratch = config.hullSamplePoints.map(() => ({
      position: new THREE.Vector3(),
      submerged: false,
      depth: 0,
    }));
  }

  update(dt: number, terrain: ITerrainRuntime | undefined): void {
    if (this.disposed || !Number.isFinite(dt) || dt <= 0) return;

    // 1) Sample each hull point against the water sampler. Track grounding
    //    by comparing the lowest hull-sample y to the terrain height.
    let anySubmerged = false;
    let allAboveTerrain = true;
    const worldUp = new THREE.Vector3(0, 1, 0);
    void worldUp; // reserved for hull-conform rotation; not yet wired
    for (let i = 0; i < this.config.hullSamplePoints.length; i += 1) {
      const local = this.config.hullSamplePoints[i];
      const worldPos = local.clone().applyQuaternion(this.state.quaternion).add(this.state.position);
      const sample = this.config.waterSampler.sampleWaterInteraction(worldPos);
      this.hullSampleScratch[i].position.copy(worldPos);
      this.hullSampleScratch[i].submerged = sample.submerged;
      this.hullSampleScratch[i].depth = sample.depth;
      if (sample.submerged) anySubmerged = true;
      if (terrain) {
        const terrainY = terrain.getHeightAt(worldPos.x, worldPos.z);
        if (worldPos.y - terrainY > 0.2) allAboveTerrain = false;
      } else {
        allAboveTerrain = false;
      }
    }

    // 2) Apply buoyancy + flow drag against the aggregate body. This uses
    //    the existing `applyBuoyancyForce` integrator end-to-end so the
    //    test exercises the real buoyancy + flow-coupling code paths.
    applyBuoyancyForce(this.aggregateBody, dt, this.config.waterSampler);

    // 3) Throttle: thrust along the chassis-forward axis.
    if (anySubmerged) {
      const thrust = (this.state.throttle * this.config.enginePower) / Math.max(this.config.mass, 1e-3);
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.state.quaternion);
      this.state.velocity.x += forward.x * thrust * dt;
      this.state.velocity.z += forward.z * thrust * dt;
    }

    // 4) Quadratic drag on horizontal velocity.
    const horizSpeedSq = this.state.velocity.x * this.state.velocity.x
      + this.state.velocity.z * this.state.velocity.z;
    if (horizSpeedSq > 1e-6) {
      const horizSpeed = Math.sqrt(horizSpeedSq);
      const dragAcc = (this.config.dragCoefficient * horizSpeedSq) / Math.max(this.config.mass, 1e-3);
      const dragFactor = Math.max(0, 1 - (dragAcc * dt) / horizSpeed);
      this.state.velocity.x *= dragFactor;
      this.state.velocity.z *= dragFactor;
    }

    // 5) Rudder: yaw rate proportional to rudder * forward-speed (in water).
    const fwdSpeed = this.getForwardSpeed();
    if (anySubmerged) {
      const yawAccel = this.state.rudder * this.config.rudderAuthority * Math.sign(fwdSpeed || 1)
        * Math.min(Math.abs(fwdSpeed), 5.0);
      // First-order: angular velocity tracks the target with simple lerp.
      this.state.angularVelocity += yawAccel * dt;
      // Angular damping.
      this.state.angularVelocity *= Math.exp(-1.5 * dt);
      // Integrate yaw into the quaternion.
      const dq = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.state.angularVelocity * dt,
      );
      this.state.quaternion.multiplyQuaternions(dq, this.state.quaternion).normalize();
    } else {
      // Out of water: spin decays freely.
      this.state.angularVelocity *= Math.exp(-2.0 * dt);
    }

    // 6) Grounding: hull rests on / above terrain across all samples.
    this.state.grounded = allAboveTerrain && anySubmerged === false
      || (terrain !== undefined && allAboveTerrain && !!terrain);
    // Simple convention: if terrain pokes above water at the hull and the
    // hull is making contact, we're grounded.
    if (terrain && this.config.hullSamplePoints.length > 0) {
      let allHullsOnGround = true;
      for (let i = 0; i < this.hullSampleScratch.length; i += 1) {
        const hp = this.hullSampleScratch[i].position;
        const t = terrain.getHeightAt(hp.x, hp.z);
        if (hp.y - t > 0.3) { allHullsOnGround = false; break; }
      }
      if (allHullsOnGround) this.state.grounded = true;
    }
  }

  setControls(throttle: number, rudder: number): void {
    this.state.throttle = clamp(throttle, -1, 1);
    this.state.rudder = clamp(rudder, -1, 1);
  }

  setPosition(pos: THREE.Vector3): void {
    this.state.position.copy(pos);
  }

  setQuaternion(q: THREE.Quaternion): void {
    this.state.quaternion.copy(q);
  }

  getState(): WatercraftState {
    return this.state;
  }

  getForwardSpeed(): number {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.state.quaternion);
    return this.state.velocity.x * forward.x + this.state.velocity.z * forward.z;
  }

  getHullSamples(): ReadonlyArray<HullSampleResult> {
    return this.hullSampleScratch;
  }

  isGrounded(): boolean {
    return this.state.grounded;
  }

  isUnderBridge(): boolean {
    // MVP: no bridge detection wired (per brief — sibling's TODO).
    return false;
  }

  dispose(): void {
    this.disposed = true;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
