// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * TrackedVehiclePhysics behavior tests.
 *
 * Authoritative scope: docs/rearch/TANK_SYSTEMS_2026-05-13.md
 * Task brief: docs/tasks/cycle-vekhikl-3-tank-chassis.md (R1 — tests)
 *
 * --- Public surface under test (from TrackedVehiclePhysics.ts) ---
 *
 * class TrackedVehiclePhysics {
 *   static readonly FIXED_STEP_SECONDS = 1 / 60;
 *   constructor(initialPosition: THREE.Vector3, config?: Partial<TrackedVehiclePhysicsConfig>);
 *   update(deltaTime: number, terrain: ITerrainRuntime | null): void;
 *   setControls(throttleAxis: number, turnAxis: number, brake: boolean): void;
 *   getState(): { position, velocity, angularVelocity, quaternion,
 *                 leftTrackSpeed (m/s), rightTrackSpeed (m/s),
 *                 isGrounded, tracksBlown };
 *   setPosition(p): void;
 *   setQuaternion(q): void;
 *   setTracksBlown(blown): void;
 *   dispose(): void;
 *   setWorldHalfExtent(halfExtent): void;
 *   conformToTerrain(terrain): void;
 *   getInterpolationAlpha(): number;
 *   getCornerSamples(): readonly CornerSample[];
 *   getForwardSpeed(): number;
 *   getEngineAudioParams(): { rpm, load };
 * }
 *
 * Skid-steer kinematics (memo §"Locomotion: skid-steer"):
 *   leftTrackCmd  = clamp(throttle - turn, -1, +1)
 *   rightTrackCmd = clamp(throttle + turn, -1, +1)
 *   v_forward = (leftTrackSpeed + rightTrackSpeed) * 0.5 * maxTrackSpeed
 *   omega_y   = (rightTrackSpeed - leftTrackSpeed) * maxTrackSpeed
 *               / trackSeparation
 *
 * Tests are L2 (one system + mocked ITerrainRuntime) per docs/TESTING.md.
 * Assertions are directional / bounded — they do NOT mirror tuning constants
 * from the implementation. Numeric assertions reference the analytical
 * skid-steer formulas (behavior), not the integrator's internal time
 * constants.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TrackedVehiclePhysics } from './TrackedVehiclePhysics';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

// =============================================================================
// Terrain mocks (per-test, kept inline so each test reads top-to-bottom)
// =============================================================================

function makeFlatTerrain(height = 0): ITerrainRuntime {
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

/**
 * Surface tilts uniformly along +X. `dydx` = rise/run.
 * The surface normal tilts away from +X by atan(dydx);
 * `getSlopeAt` returns the absolute slope angle in radians.
 */
function makeSlopedTerrain(dydx: number): ITerrainRuntime {
  const slope = Math.atan(Math.abs(dydx));
  const n = new THREE.Vector3(-dydx, 1, 0).normalize();
  return {
    getHeightAt: (x: number, _z: number) => x * dydx,
    getEffectiveHeightAt: (x: number, _z: number) => x * dydx,
    getSlopeAt: () => slope,
    getNormalAt: (_x, _z, target) => {
      const v = target ?? new THREE.Vector3();
      return v.copy(n);
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
// Helpers
// =============================================================================

/** Step the physics enough frames to absorb initial transients. */
function settle(physics: TrackedVehiclePhysics, terrain: ITerrainRuntime, frames = 60, dt = 0.02): void {
  for (let i = 0; i < frames; i += 1) physics.update(dt, terrain);
}

/** Forward axis in world space derived from the chassis quaternion (-Z local). */
function worldForward(q: THREE.Quaternion): THREE.Vector3 {
  return new THREE.Vector3(0, 0, -1).applyQuaternion(q);
}

// =============================================================================
// Tests
// =============================================================================

describe('TrackedVehiclePhysics', () => {
  const DT = 0.02;

  it('rests on the terrain immediately when terrain is wired after construction', () => {
    const terrain = makeFlatTerrain(51);
    const physics = new TrackedVehiclePhysics(new THREE.Vector3(10, -20, 15));

    physics.conformToTerrain(terrain);

    const state = physics.getState();
    expect(state.position.y).toBeGreaterThan(51);
    expect(state.position.y).toBeLessThan(52);
    expect(state.isGrounded).toBe(true);
  });

  describe('Pure forward throttle', () => {
    it('drives forward with no yaw when only throttle is applied', () => {
      const flat = makeFlatTerrain(0);
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));

      // Settle onto the ground first.
      settle(physics, flat, 30, DT);

      // Capture starting forward axis + position; both should hold after we drive.
      const yawBefore = new THREE.Euler().setFromQuaternion(physics.getState().quaternion, 'YXZ').y;
      const posBefore = physics.getState().position.clone();

      physics.setControls(1.0, 0, false);
      for (let i = 0; i < 240; i += 1) physics.update(DT, flat);

      const state = physics.getState();
      const yawAfter = new THREE.Euler().setFromQuaternion(state.quaternion, 'YXZ').y;
      const yawDelta = Math.abs(yawAfter - yawBefore);

      // Pure forward throttle → both tracks at +1 → omega_y = 0 (analytical).
      expect(yawDelta).toBeLessThan(1e-3);
      expect(Math.abs(state.angularVelocity.y)).toBeLessThan(0.05);

      // Forward speed must be substantial and along chassis -Z.
      const forwardSpeed = physics.getForwardSpeed();
      expect(forwardSpeed).toBeGreaterThan(1.0);

      // Both per-track speeds must be positive and roughly equal.
      expect(state.leftTrackSpeed).toBeGreaterThan(0);
      expect(state.rightTrackSpeed).toBeGreaterThan(0);
      expect(Math.abs(state.leftTrackSpeed - state.rightTrackSpeed)).toBeLessThan(0.05);

      // World position moved (chassis traveled).
      const horizontalTravel = Math.hypot(
        state.position.x - posBefore.x,
        state.position.z - posBefore.z,
      );
      expect(horizontalTravel).toBeGreaterThan(0.5);
    });

    it('continues to advance through a delayed frame instead of simulating only a tiny slice', () => {
      const flat = makeFlatTerrain(0);
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      settle(physics, flat, 30, DT);

      const posBefore = physics.getState().position.clone();
      physics.setControls(1.0, 0, false);
      physics.update(1.0, flat);

      const state = physics.getState();
      const horizontalTravel = Math.hypot(
        state.position.x - posBefore.x,
        state.position.z - posBefore.z,
      );
      expect(horizontalTravel).toBeGreaterThan(1.0);
      expect(physics.getForwardSpeed()).toBeGreaterThan(2.0);
    });
  });

  describe('Pure turn axis', () => {
    it('pivots in place with negligible forward motion when only turn is applied', () => {
      const flat = makeFlatTerrain(0);
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      settle(physics, flat, 30, DT);

      const posBefore = physics.getState().position.clone();

      // Pure right turn: left track reverses, right track forwards, v_forward target = 0.
      physics.setControls(0, 1.0, false);
      for (let i = 0; i < 180; i += 1) physics.update(DT, flat);

      const state = physics.getState();

      // Tracks counter-rotate.
      expect(state.leftTrackSpeed).toBeLessThan(0);
      expect(state.rightTrackSpeed).toBeGreaterThan(0);
      // Equal in magnitude (within smoothing tolerance).
      expect(Math.abs(state.leftTrackSpeed + state.rightTrackSpeed)).toBeLessThan(0.5);

      // Non-zero yaw rate.
      expect(Math.abs(state.angularVelocity.y)).toBeGreaterThan(0.1);

      // Horizontal position should barely move (in-place pivot). Some drift is
      // allowed because the integrator chases an exponential target; the
      // assertion is "pivot, not drive."
      const horizontalDrift = Math.hypot(
        state.position.x - posBefore.x,
        state.position.z - posBefore.z,
      );
      expect(horizontalDrift).toBeLessThan(2.0);

      // Forward speed along chassis -Z stays near zero.
      expect(Math.abs(physics.getForwardSpeed())).toBeLessThan(1.0);
    });
  });

  describe('Throttle + turn coupling', () => {
    it('produces both forward motion and yaw with the analytical sign relationship', () => {
      const flat = makeFlatTerrain(0);
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      settle(physics, flat, 30, DT);

      // throttle = +1, turn = +0.5 → leftCmd = 0.5, rightCmd = 1.0 (asymmetric).
      physics.setControls(1.0, 0.5, false);
      for (let i = 0; i < 240; i += 1) physics.update(DT, flat);

      const state = physics.getState();

      // Forward motion: both track speeds positive, right > left.
      expect(state.leftTrackSpeed).toBeGreaterThan(0);
      expect(state.rightTrackSpeed).toBeGreaterThan(state.leftTrackSpeed);

      // Both forward speed and yaw rate non-zero.
      expect(physics.getForwardSpeed()).toBeGreaterThan(0.5);
      expect(Math.abs(state.angularVelocity.y)).toBeGreaterThan(0.05);

      // Coupling shape from differential-drive kinematics:
      //   omega_y = (rv - lv) / trackSeparation
      //   v_forward target = (lv + rv) / 2
      // ratio omega / v = 2 * (rv - lv) / ((lv + rv) * trackSeparation).
      // The integrator's drag + exponential approach means v and omega lag
      // their targets, but the ratio of sign and order-of-magnitude must
      // match — both are positive (right turn while driving forward).
      // We assert the *ratio of magnitudes* is non-degenerate.
      const ratio = Math.abs(state.angularVelocity.y) / Math.max(physics.getForwardSpeed(), 1e-3);
      expect(ratio).toBeGreaterThan(0.01);
      expect(ratio).toBeLessThan(10); // sanity ceiling — not pivoting in place
    });
  });

  describe('Chassis tilt on slope', () => {
    it('hull rolls/pitches to match the terrain normal (per-corner ground sample)', () => {
      // Slope of dy/dx = 0.4 → ~21.8 deg, well below the tank's
      // maxClimbSlope (~0.61 rad / 35 deg) so the chassis remains grounded
      // and conforms cleanly.
      const sloped = makeSlopedTerrain(0.4);
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));

      // Let the chassis settle on the slope under gravity.
      for (let i = 0; i < 240; i += 1) physics.update(DT, sloped);

      const state = physics.getState();
      expect(state.isGrounded).toBe(true);

      // Chassis local up should align with the terrain normal (within tol).
      const chassisUp = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quaternion);
      const expectedNormal = new THREE.Vector3(-0.4, 1, 0).normalize();
      expect(chassisUp.dot(expectedNormal)).toBeGreaterThan(0.95);

      // Chassis is NOT aligned with world-up — proves we tilted.
      const worldUp = new THREE.Vector3(0, 1, 0);
      expect(chassisUp.dot(worldUp)).toBeLessThan(0.999);

      // Per-corner samples are populated and report distinct world positions
      // along the chassis hull.
      const corners = physics.getCornerSamples();
      expect(corners.length).toBe(4);
      const uniqueX = new Set(corners.map((c) => c.position.x.toFixed(2)));
      const uniqueZ = new Set(corners.map((c) => c.position.z.toFixed(2)));
      // Four corners → at least 2 distinct X and 2 distinct Z values.
      expect(uniqueX.size).toBeGreaterThanOrEqual(2);
      expect(uniqueZ.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Tracks-blown', () => {
    it('immobilizes forward motion under full throttle while remaining grounded', () => {
      const flat = makeFlatTerrain(0);
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      settle(physics, flat, 30, DT);

      // First confirm the chassis CAN move on undamaged tracks (control).
      physics.setControls(1.0, 0, false);
      for (let i = 0; i < 120; i += 1) physics.update(DT, flat);
      expect(physics.getForwardSpeed()).toBeGreaterThan(0.5);

      // Blow the tracks. Driver continues to mash throttle.
      physics.setTracksBlown(true);
      physics.setControls(1.0, 0, false);
      for (let i = 0; i < 240; i += 1) physics.update(DT, flat);

      const state = physics.getState();
      expect(state.tracksBlown).toBe(true);

      // Per-track speeds pinned to zero (target = 0 regardless of throttle).
      expect(Math.abs(state.leftTrackSpeed)).toBeLessThan(0.05);
      expect(Math.abs(state.rightTrackSpeed)).toBeLessThan(0.05);

      // Forward and yaw must bleed down toward zero (drag + zero drive).
      expect(Math.abs(physics.getForwardSpeed())).toBeLessThan(0.5);
      expect(Math.abs(state.angularVelocity.y)).toBeLessThan(0.1);

      // Chassis remains grounded (so turret slew + cannon would still work
      // tactically — turret rig lives in cycle #9).
      expect(state.isGrounded).toBe(true);
    });
  });

  describe('Slope-stall', () => {
    it('forward drive scales down on slopes above the climb threshold', () => {
      // Compare achieved forward speed on a gentle slope vs a wall slope
      // past the tank's maxClimbSlope (~0.61 rad). The drive force fades
      // to zero at the threshold; gravity then dominates and may even
      // push the chassis backward.
      const gentle = makeSlopedTerrain(0.05); // ~2.86 deg
      const wall = makeSlopedTerrain(2.0);    // ~63 deg, above 35-deg tank max

      function forwardSpeedOn(terrain: ITerrainRuntime): number {
        const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
        settle(physics, terrain, 30, DT);
        physics.setControls(1.0, 0, false);
        for (let i = 0; i < 360; i += 1) physics.update(DT, terrain);
        return physics.getForwardSpeed();
      }

      const fwdGentle = forwardSpeedOn(gentle);
      const fwdWall = forwardSpeedOn(wall);

      // Gentle slope: drive succeeds.
      expect(fwdGentle).toBeGreaterThan(1.0);
      // Wall slope: drive is scaled to ~zero (and gravity tugs); the chassis
      // makes much less (or negative) forward progress.
      expect(fwdWall).toBeLessThan(fwdGentle);
      expect(fwdWall).toBeLessThan(0.5);
    });
  });

  describe('Input smoothing', () => {
    it('per-track speeds ramp continuously rather than jumping on a single frame', () => {
      const flat = makeFlatTerrain(0);
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      settle(physics, flat, 30, DT);

      // Both per-track speeds start at zero (no input has been issued).
      const beforeLeft = physics.getState().leftTrackSpeed;
      const beforeRight = physics.getState().rightTrackSpeed;
      expect(Math.abs(beforeLeft)).toBeLessThan(1e-6);
      expect(Math.abs(beforeRight)).toBeLessThan(1e-6);

      // Slam the throttle hard. One single fixed step at dt=1/60 must NOT
      // jump the smoothed track speed all the way to its maxTrackSpeed
      // target — smoothing is an exponential approach.
      physics.setControls(1.0, 0, false);
      physics.update(1 / 60, flat); // one step exactly

      const afterOne = physics.getState();
      const ramp = afterOne.leftTrackSpeed; // m/s
      // Must have started moving toward the target (positive).
      expect(ramp).toBeGreaterThan(0);
      // But far below the full maxTrackSpeed scaling. The default config
      // hits ~12 m/s at full deflection; one smoothed step should land
      // well under half that.
      expect(ramp).toBeLessThan(6);

      // After many frames the speed climbs further, demonstrating
      // continuous ramping (monotone increase, not a jump).
      let last = ramp;
      for (let i = 0; i < 30; i += 1) {
        physics.update(1 / 60, flat);
        const now = physics.getState().leftTrackSpeed;
        expect(now).toBeGreaterThanOrEqual(last - 1e-3);
        last = now;
      }
      // Final smoothed speed exceeds the single-step value (still ramping).
      expect(last).toBeGreaterThan(ramp);
    });
  });

  describe('Engine-killed (R2, tank-damage-states)', () => {
    it('clamps throttle so the chassis cannot drive forward even at full input', () => {
      const flat = makeFlatTerrain(0);
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      settle(physics, flat, 30, DT);

      // Sanity: undamaged chassis moves forward.
      physics.setControls(1.0, 0, false);
      for (let i = 0; i < 120; i += 1) physics.update(DT, flat);
      expect(physics.getForwardSpeed()).toBeGreaterThan(0.5);

      // Kill the engine. Driver continues to mash throttle.
      physics.setEngineKilled(true);
      expect(physics.isEngineKilled()).toBe(true);
      physics.setControls(1.0, 0, false);
      for (let i = 0; i < 240; i += 1) physics.update(DT, flat);

      // Forward velocity must bleed down to near-zero (no drive, drag wins).
      expect(Math.abs(physics.getForwardSpeed())).toBeLessThan(0.5);
      // State flag surfaces on the snapshot.
      expect(physics.getState().engineKilled).toBe(true);
    });

    it('still allows turn input through to the integrator (visual pivot)', () => {
      const flat = makeFlatTerrain(0);
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      settle(physics, flat, 30, DT);

      physics.setEngineKilled(true);
      physics.setControls(0, 1.0, false);
      for (let i = 0; i < 60; i += 1) physics.update(DT, flat);

      // Turn axis was not clamped — the rawControls path accepted the +1.
      // With throttle == 0 the per-track commands are leftCmd = -1, rightCmd = +1
      // (pivot), which the smoothing layer still ramps up. No assertion on
      // yaw magnitude (engine-killed pivots only from inertia in
      // typical play); the contract is that turn input is *accepted*.
      const state = physics.getState();
      // Left and right tracks counter-rotated under the pivot command.
      expect(state.rightTrackSpeed - state.leftTrackSpeed).toBeGreaterThan(0);
    });

    it('returns to normal acceptance after engine-killed is cleared', () => {
      const flat = makeFlatTerrain(0);
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      settle(physics, flat, 30, DT);

      physics.setEngineKilled(true);
      physics.setControls(1.0, 0, false);
      for (let i = 0; i < 60; i += 1) physics.update(DT, flat);
      expect(Math.abs(physics.getForwardSpeed())).toBeLessThan(0.5);

      physics.setEngineKilled(false);
      expect(physics.isEngineKilled()).toBe(false);
      physics.setControls(1.0, 0, false);
      for (let i = 0; i < 240; i += 1) physics.update(DT, flat);

      expect(physics.getForwardSpeed()).toBeGreaterThan(0.5);
    });
  });

  // Coverage sanity: ensure the forward axis derived from quaternion stays
  // unit-length under sustained yaw integration. Cheap, catches quaternion
  // normalization bugs in the integrator.
  describe('Quaternion hygiene', () => {
    it('chassis quaternion stays normalized across sustained turning', () => {
      const flat = makeFlatTerrain(0);
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      settle(physics, flat, 30, DT);

      physics.setControls(0.5, 0.5, false);
      for (let i = 0; i < 600; i += 1) physics.update(DT, flat);

      const q = physics.getState().quaternion;
      const lenSq = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w;
      expect(Math.abs(lenSq - 1)).toBeLessThan(1e-3);

      // Forward axis is finite + unit-length.
      const fwd = worldForward(q);
      expect(Number.isFinite(fwd.x) && Number.isFinite(fwd.y) && Number.isFinite(fwd.z)).toBe(true);
      expect(Math.abs(fwd.lengthSq() - 1)).toBeLessThan(1e-3);
    });
  });

  // Render-time interpolation. The chassis integrates at a fixed 60 Hz step but
  // is rendered at the display refresh, which can be 120/144 Hz. Reading the raw
  // fixed-step pose at a render frame that lands mid-step makes the chassis snap
  // to the latest completed step and stall until the next one fires — the same
  // jitter signature fixed for the helicopter chase-cam (8e99caac). The
  // authoritative visual pose is `getInterpolatedState()`, which blends the
  // previous and current fixed-step poses by the accumulator fraction.
  describe('Render interpolation between fixed steps', () => {
    const STEP = TrackedVehiclePhysics.FIXED_STEP_SECONDS;

    it('exposes a rendered pose strictly between the previous and current physics steps mid-step', () => {
      const flat = makeFlatTerrain(0);
      // Drive with exactly-fixed-step deltas from a fresh (zero-accumulator)
      // stepper so the render alpha is a known fraction at each assertion point.
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      physics.setControls(1.0, 0, false);
      for (let i = 0; i < 90; i += 1) physics.update(STEP, flat);

      // Standard fixed-step interpolation renders one step behind: at alpha == 0
      // (accumulator empty, right after a step completes) the rendered pose is
      // the *previous* completed step, and it advances toward the latest raw
      // step as the render clock fills the accumulator. Capture both bracketing
      // physics-step poses: alpha-0 rendered = previous step, raw state = latest.
      const prevStepPose = physics.getInterpolatedState().position.clone();
      const latestStepPose = physics.getState().position.clone();
      const segment = prevStepPose.distanceTo(latestStepPose);
      // The chassis is moving, so the two bracketing steps are distinct.
      expect(segment).toBeGreaterThan(1e-4);

      // Advance the render clock by HALF a fixed step. No new physics step fires
      // (accumulator = 0.5 * STEP), so the raw physics pose is unchanged.
      physics.update(STEP * 0.5, flat);
      const rawPhysics = physics.getState().position.clone();
      expect(rawPhysics.distanceTo(latestStepPose)).toBeLessThan(1e-6);

      // The rendered pose at alpha ~ 0.5 must lie strictly BETWEEN the two
      // bracketing physics steps — a genuine blend, not snapped to either
      // endpoint. Raw-pose rendering would pin the rendered pose to
      // `latestStepPose` (zero advance across the sub-step) and fail the
      // "moved away from the latest step" assertion below — that is the jitter
      // signature this test guards.
      const rendered = physics.getInterpolatedState().position.clone();
      expect(rendered.distanceTo(prevStepPose)).toBeGreaterThan(1e-4);
      expect(rendered.distanceTo(latestStepPose)).toBeGreaterThan(1e-4);
      expect(rendered.distanceTo(prevStepPose)).toBeLessThan(segment);
      expect(rendered.distanceTo(latestStepPose)).toBeLessThan(segment);
    });

    it('rendered pose advances smoothly across render frames faster than the fixed step', () => {
      const flat = makeFlatTerrain(0);
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      settle(physics, flat, 30, STEP);

      physics.setControls(1.0, 0, false);
      // Warm up to a steady forward speed at the fixed cadence.
      for (let i = 0; i < 60; i += 1) physics.update(STEP, flat);

      // Render at 144 Hz while the sim ticks at 60 Hz. Reading the raw pose here
      // would alias the fixed-step sawtooth: many render frames see ZERO advance
      // (accumulator mid-step) punctuated by a big jump when a step fires. The
      // interpolated pose must advance on essentially every render frame.
      const RENDER_DT = 1 / 144;
      let prev = physics.getInterpolatedState().position.clone();
      let framesThatAdvanced = 0;
      const TOTAL_FRAMES = 120;
      for (let i = 0; i < TOTAL_FRAMES; i += 1) {
        physics.update(RENDER_DT, flat);
        const now = physics.getInterpolatedState().position.clone();
        if (now.distanceTo(prev) > 1e-5) framesThatAdvanced += 1;
        prev = now;
      }

      // With raw-pose rendering only ~ (60/144) of frames would advance (~42%).
      // Interpolation should advance the vast majority of render frames.
      expect(framesThatAdvanced).toBeGreaterThan(TOTAL_FRAMES * 0.85);
    });

    it('seeds the interpolation buffer on conformToTerrain so the first frame does not lerp from a stale pose', () => {
      const terrain = makeFlatTerrain(40);
      const physics = new TrackedVehiclePhysics(new THREE.Vector3(10, -50, 15));

      // Constructed well below the surface; conform clamps it onto the terrain.
      physics.conformToTerrain(terrain);

      // The very first interpolated pose must already report the conformed Y,
      // not lerp up from the stale below-surface previous pose.
      const rendered = physics.getInterpolatedState();
      expect(rendered.position.y).toBeGreaterThan(40);
      expect(rendered.position.y).toBeLessThan(41);
    });
  });
});
