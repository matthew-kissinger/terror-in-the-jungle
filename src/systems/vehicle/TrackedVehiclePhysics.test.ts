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
});
