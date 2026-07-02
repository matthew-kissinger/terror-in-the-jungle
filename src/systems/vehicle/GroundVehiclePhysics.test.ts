// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * GroundVehiclePhysics behavior tests.
 *
 * Authoritative scope: docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md
 * Task brief: docs/tasks/cycle-vekhikl-1-jeep-drivable.md
 *
 * --- API contract (enforced by these tests) ---
 *
 * class GroundVehiclePhysics {
 *   static readonly FIXED_STEP_SECONDS = 1 / 60;
 *
 *   constructor(initialPosition: THREE.Vector3, config?: Partial<GroundVehiclePhysicsConfig>);
 *
 *   update(deltaTime: number, terrain: ITerrainRuntime | null): void;
 *
 *   setControls(controls: Partial<GroundVehicleControls>): void;
 *   setEngineActive(active: boolean): void;
 *   getState(): Readonly<GroundVehicleState>;
 *   getControls(): Readonly<GroundVehicleControls>;
 *   resetToStable(position: THREE.Vector3): void;
 *   getGroundSpeed(): number;
 *   getForwardSpeed(): number;
 *   getHeading(): number;
 *   getEngineAudioParams(): { rpm: number; load: number };
 * }
 *
 * Note: per the rearch memo, ground vehicles CONFORM to terrain rather
 * than bounce (unlike HelicopterPhysics). Vertical velocity is absorbed
 * on contact (clamped to >= 0); the chassis snaps to averaged wheel
 * ground height + axleOffset.
 *
 * Tests are L2 (one system + mocked ITerrainRuntime) per docs/TESTING.md.
 * Assertions are directional / bounded — they do NOT mirror tuning
 * constants from the implementation.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  GroundVehiclePhysics,
} from './GroundVehiclePhysics';
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
 * Mock terrain whose surface tilts uniformly along world-X.
 * dydx is rise/run along +X; the surface normal tilts away from +X by atan(dydx).
 *
 * `getSlopeAt` returns the REAL runtime contract: a 0..1 slope deficit
 * (`1 - normal.y`), NOT an angle. HeightQueryCache.getSlopeAt returns exactly
 * this, and GroundVehiclePhysics converts it to an angle (`acos(1 - deficit)`)
 * at the consumption site. Keeping the mock honest exercises that conversion.
 */
function makeSlopedTerrain(dydx: number): ITerrainRuntime {
  // Normal: rotate (0,1,0) around Z by -atan(dydx). For dydx>0 (climbing +X) normal tilts toward -X.
  const n = new THREE.Vector3(-dydx, 1, 0).normalize();
  const slopeDeficit = 1 - n.y; // matches HeightQueryCache: 1 - normal.y
  return {
    getHeightAt: (x: number, _z: number) => x * dydx,
    getEffectiveHeightAt: (x: number, _z: number) => x * dydx,
    getSlopeAt: () => slopeDeficit,
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

/**
 * Mock terrain whose surface rises along chassis-forward for the default
 * identity orientation (local/world -Z). risePerForwardMeter is rise/run as
 * the vehicle moves toward negative Z. `getSlopeAt` returns the runtime slope
 * deficit (`1 - normal.y`), same as HeightQueryCache.
 */
function makeForwardRampTerrain(risePerForwardMeter: number): ITerrainRuntime {
  const n = new THREE.Vector3(0, 1, risePerForwardMeter).normalize();
  const slopeDeficit = 1 - n.y;
  return {
    getHeightAt: (_x: number, z: number) => -z * risePerForwardMeter,
    getEffectiveHeightAt: (_x: number, z: number) => -z * risePerForwardMeter,
    getSlopeAt: () => slopeDeficit,
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
// Tests
// =============================================================================

describe('GroundVehiclePhysics', () => {
  // Use a delta-time large enough to trigger at least one fixed step per call.
  const DT = 0.02;

  describe('Gravity', () => {
    it('applies gravity when airborne with zero throttle', () => {
      // Spawn high above flat ground, engine off, no throttle.
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 50, 0));
      const flat = makeFlatTerrain(0);

      const yBefore = physics.getState().position.y;
      const vyBefore = physics.getState().velocity.y;

      // Step ~30 frames at 1/60s.
      for (let i = 0; i < 30; i++) {
        physics.update(DT, flat);
      }

      const state = physics.getState();
      // Should be falling (negative vy) and below starting height.
      expect(state.velocity.y).toBeLessThan(vyBefore);
      expect(state.velocity.y).toBeLessThan(0);
      expect(state.position.y).toBeLessThan(yBefore);
      expect(state.isGrounded).toBe(false);
    });
  });

  describe('Wheel terrain conform', () => {
    it('wheels conform to flat ground (chassis settles at axle offset)', () => {
      // Drop the vehicle from just above the ground; settle.
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      const flat = makeFlatTerrain(0);

      // Let it settle.
      for (let i = 0; i < 120; i++) {
        physics.update(DT, flat);
      }

      const state = physics.getState();
      expect(state.isGrounded).toBe(true);
      // Chassis Y sits at terrain + axleOffset (a small positive value).
      expect(state.position.y).toBeGreaterThan(0);
      expect(state.position.y).toBeLessThan(1.5);
    });

    it('wheels conform to slope (chassis tilts to match terrain normal)', () => {
      // A surface rising 1m per 2m along +X (~26.6 deg slope, below the jeep's
      // maxClimbSlope of ~0.87 rad). dy/dx = 0.5 -> surface angle ~0.4636 rad.
      const sloped = makeSlopedTerrain(0.5);
      // Spawn just above the slope at x=0 so chassis settles onto it.
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));

      // Let the tilt conform settle (smoothed normal needs a few time constants).
      for (let i = 0; i < 240; i++) {
        physics.update(DT, sloped);
      }

      const state = physics.getState();
      expect(state.isGrounded).toBe(true);

      // Inclined orientation: chassis local-up should be close to terrain normal.
      const chassisUp = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quaternion);
      const expectedNormal = new THREE.Vector3(-0.5, 1, 0).normalize();
      const dot = chassisUp.dot(expectedNormal);
      // Allow some tolerance for the conform step.
      expect(dot).toBeGreaterThan(0.95);
      // And it should NOT be flat (i.e., differ from world-up).
      const worldUp = new THREE.Vector3(0, 1, 0);
      expect(chassisUp.dot(worldUp)).toBeLessThan(0.999);
    });
  });

  describe('Ackermann steering', () => {
    it('Ackermann yaw rate scales with steer angle at constant forward speed', () => {
      // Establish forward speed via throttle on flat ground.
      const flat = makeFlatTerrain(0);

      function runWithSteer(steerAngle: number): number {
        const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
        physics.setEngineActive(true);
        // Settle on ground first.
        for (let i = 0; i < 30; i++) physics.update(DT, flat);

        physics.setControls({ throttle: 0.5, steerAngle: 0 });
        // Spool up forward speed.
        for (let i = 0; i < 240; i++) physics.update(DT, flat);

        // Apply steer; measure yaw rate over the next 30 frames.
        physics.setControls({ throttle: 0.5, steerAngle });
        // Let smoothed inputs catch up.
        for (let i = 0; i < 30; i++) physics.update(DT, flat);

        const samples: number[] = [];
        for (let i = 0; i < 30; i++) {
          physics.update(DT, flat);
          samples.push(physics.getState().angularVelocity.y);
        }
        return samples.reduce((a, b) => a + b, 0) / samples.length;
      }

      const yawLow = runWithSteer(0.1);
      const yawHigh = runWithSteer(0.3);

      // Both should be non-zero in the same direction (forward speed > 0, positive steer).
      expect(Math.sign(yawLow)).toBe(Math.sign(yawHigh));
      expect(Math.abs(yawLow)).toBeGreaterThan(0);
      // Higher steer angle → higher yaw rate (Ackermann scales with tan(steer)).
      expect(Math.abs(yawHigh)).toBeGreaterThan(Math.abs(yawLow));
    });

    it('turns right for positive steer and left for negative steer', () => {
      const flat = makeFlatTerrain(0);

      function forwardXAfterSteer(steerAngle: number): number {
        const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
        physics.setEngineActive(true);
        for (let i = 0; i < 30; i++) physics.update(DT, flat);

        physics.setControls({ throttle: 0.8, steerAngle: 0 });
        for (let i = 0; i < 180; i++) physics.update(DT, flat);

        physics.setControls({ throttle: 0.8, steerAngle });
        for (let i = 0; i < 90; i++) physics.update(DT, flat);

        return new THREE.Vector3(0, 0, -1)
          .applyQuaternion(physics.getState().quaternion)
          .x;
      }

      expect(forwardXAfterSteer(0.35)).toBeGreaterThan(0.05);
      expect(forwardXAfterSteer(-0.35)).toBeLessThan(-0.05);
    });
  });

  describe('Brake', () => {
    it('brake decelerates from cruise to stop', () => {
      const flat = makeFlatTerrain(0);
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      physics.setEngineActive(true);

      // Settle.
      for (let i = 0; i < 30; i++) physics.update(DT, flat);

      // Accelerate to cruise.
      physics.setControls({ throttle: 1.0, steerAngle: 0 });
      for (let i = 0; i < 360; i++) physics.update(DT, flat);

      const cruiseSpeed = physics.getGroundSpeed();
      expect(cruiseSpeed).toBeGreaterThan(0.5); // moving at non-trivial speed

      // Release throttle, apply full brake.
      physics.setEngineActive(false);
      physics.setControls({ throttle: 0, brake: 1.0 });

      // Brake for long enough that any reasonable model would stop.
      for (let i = 0; i < 600; i++) physics.update(DT, flat);

      const finalSpeed = physics.getGroundSpeed();
      expect(finalSpeed).toBeLessThan(0.1);
      // And clearly slower than the cruise speed.
      expect(finalSpeed).toBeLessThan(cruiseSpeed * 0.1);
    });
  });

  describe('Low-cadence catch-up', () => {
    it('continues to accelerate through a delayed frame instead of time-dilating to a stop', () => {
      const flat = makeFlatTerrain(0);
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      physics.setEngineActive(true);

      for (let i = 0; i < 30; i++) physics.update(DT, flat);
      physics.setControls({ throttle: 1.0, steerAngle: 0 });

      const start = physics.getState().position.clone();
      physics.update(1.0, flat);

      const travel = physics.getState().position.distanceTo(start);
      expect(travel).toBeGreaterThan(0.25);
      expect(physics.getForwardSpeed()).toBeGreaterThan(1.0);
    });
  });

  describe('Arcade-hybrid traction', () => {
    it('bleeds lateral slide faster than forward motion while grounded', () => {
      const flat = makeFlatTerrain(0);
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      for (let i = 0; i < 30; i++) physics.update(DT, flat);

      physics.getState().velocity.set(6, 0, -4);
      const initialLateral = Math.abs(physics.getState().velocity.x);
      const initialForward = physics.getForwardSpeed();

      for (let i = 0; i < 120; i++) physics.update(DT, flat);

      expect(Math.abs(physics.getState().velocity.x)).toBeLessThan(initialLateral * 0.25);
      expect(physics.getForwardSpeed()).toBeGreaterThan(initialForward * 0.35);
    });

    it('keeps enough drive authority to climb a moderate jungle road grade', () => {
      const ramp = makeForwardRampTerrain(0.5);
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      physics.setEngineActive(true);
      for (let i = 0; i < 30; i++) physics.update(DT, ramp);

      const start = physics.getState().position.clone();
      physics.setControls({ throttle: 1.0, steerAngle: 0 });
      for (let i = 0; i < 420; i++) physics.update(DT, ramp);

      const state = physics.getState();
      expect(state.position.z).toBeLessThan(start.z - 4);
      expect(state.position.y).toBeGreaterThan(start.y + 1);
      expect(physics.getForwardSpeed()).toBeGreaterThan(0.8);
    });
  });

  describe('Slope-stall', () => {
    it('forward drive force scales down on slopes above threshold', () => {
      // Compare achieved chassis-forward speed after a fixed throttle window
      // on a gentle slope vs a near-vertical wall past maxClimbSlope.
      // We measure the signed forward component (chassis local -Z) so that
      // gravity-induced downhill sliding (which is perpendicular to forward
      // at spawn) does NOT register as forward progress on the wall slope.
      const gentle = makeSlopedTerrain(0.05); // ~2.86 deg, well below maxClimbSlope
      const wall = makeSlopedTerrain(2.0);    // ~63 deg surface angle, above the jeep's ~0.87 rad (~50 deg) ceiling

      function forwardSpeedOn(terrain: ITerrainRuntime): number {
        const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
        physics.setEngineActive(true);
        for (let i = 0; i < 30; i++) physics.update(DT, terrain); // settle
        physics.setControls({ throttle: 1.0, steerAngle: 0 });
        for (let i = 0; i < 360; i++) physics.update(DT, terrain);
        return physics.getForwardSpeed();
      }

      const fwdGentle = forwardSpeedOn(gentle);
      const fwdWall = forwardSpeedOn(wall);

      // Drive should produce positive forward speed on the gentle slope.
      expect(fwdGentle).toBeGreaterThan(1.0);
      // Wall slope past maxClimbSlope → drive force scaled to zero, so no
      // positive forward progress despite full throttle.
      expect(fwdWall).toBeLessThan(fwdGentle);
      expect(fwdWall).toBeLessThan(0.5);
    });
  });

  describe('Hard landing', () => {
    it('absorbs vertical impact (ground vehicles conform; no bounce)', () => {
      // Per docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md: ground vehicles
      // conform to terrain on contact rather than bouncing (unlike
      // HelicopterPhysics). A hard descent velocity is clamped to >= 0 on
      // contact, and the chassis snaps to averaged ground height + axleOffset.
      const flat = makeFlatTerrain(0);
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 50, 0));

      // Inject a hard descent velocity and place the chassis right at the
      // impact line so the next fixed step resolves the collision.
      physics.getState().velocity.y = -10;
      physics.getState().position.y = 0.5; // near the terrain + axleOffset target

      // One fixed step is enough for the contact to resolve.
      physics.update(DT, flat);

      const state = physics.getState();
      // Conform behavior: vertical velocity is absorbed (no bounce upward),
      // chassis is grounded, and Y is at or near the conformed ground line.
      expect(state.isGrounded).toBe(true);
      expect(state.velocity.y).toBeGreaterThanOrEqual(0);
      // No upward kick — the impact does not eject the chassis off the ground.
      expect(state.velocity.y).toBeLessThan(1.0);
      // Chassis sits near the ground (within a generous bound that does not
      // mirror the exact axleOffset value).
      expect(state.position.y).toBeGreaterThan(0);
      expect(state.position.y).toBeLessThan(2.0);
    });
  });

  // Heading-hold regression suite (vehicle-heading-hold-and-slope-truth).
  // The prior conform re-extracted world-Y yaw from the tilt-composed
  // quaternion every fixed step; YXZ yaw of (tilt * yaw) reads
  // atan2(sin psi, cos psi * cos slope), so heading error was amplified by
  // 1/cos(slope) each step and a cross-slope chassis weathervaned — even a
  // parked one. These tests pin the observable: heading is held by an explicit
  // scalar and only the yaw-integration step moves it.
  describe('Heading hold on slopes', () => {
    // ~25 deg cross-slope (tan 25 deg ~ 0.4663). The chassis is parked broadside
    // to the fall line, the worst case for the weathervane defect.
    function crossSlopeForward(physics: GroundVehiclePhysics): THREE.Vector3 {
      return new THREE.Vector3(0, 0, -1).applyQuaternion(physics.getState().quaternion);
    }

    it('a parked vehicle on a 25-degree slope holds its heading for 600 steps', () => {
      const sloped = makeSlopedTerrain(0.4663); // ~25 deg surface angle
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      // Point the chassis 40 deg off the fall line (broadside-ish to the slope)
      // so any weathervane would swing it visibly. Engine off, zero throttle.
      const placedYaw = (40 * Math.PI) / 180;
      physics.setQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placedYaw));

      // Settle onto the slope, then read the reference heading.
      for (let i = 0; i < 60; i++) physics.update(DT, sloped);
      const headingRef = physics.getHeading();
      const forwardRef = crossSlopeForward(physics).clone();

      // Park for 600 more steps with no input.
      for (let i = 0; i < 600; i++) physics.update(DT, sloped);

      // Scalar heading is unchanged (no weathervane, no drift).
      expect(Math.abs(physics.getHeading() - headingRef)).toBeLessThan(0.5);
      // The rendered forward axis also holds — heading did not bleed out of the
      // quaternion via the tilt composition.
      const forwardNow = crossSlopeForward(physics);
      // Compare only the horizontal pointing (x,z), which is what heading means.
      const refXZ = new THREE.Vector2(forwardRef.x, forwardRef.z).normalize();
      const nowXZ = new THREE.Vector2(forwardNow.x, forwardNow.z).normalize();
      expect(refXZ.dot(nowXZ)).toBeGreaterThan(0.999);
    });

    it('full-throttle climb from a heading offset gains altitude without weathervaning away', () => {
      // The ramp rises toward -Z (uphill = -Z). Spawn pointing ~5 deg off the
      // uphill fall line and climb. The fix must keep the chassis pointing up
      // the hill (heading holds) so it gains real elevation instead of swinging
      // cross-slope and stalling.
      const ramp = makeForwardRampTerrain(0.5); // ~26.6 deg forward grade
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      const offsetRad = 5 * Math.PI / 180;
      physics.setQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), offsetRad));
      physics.setEngineActive(true);

      for (let i = 0; i < 30; i++) physics.update(DT, ramp);
      const startHeading = physics.getHeading();
      const start = physics.getState().position.clone();

      physics.setControls({ throttle: 1.0, steerAngle: 0 });
      for (let i = 0; i < 420; i++) physics.update(DT, ramp);

      const state = physics.getState();
      // Gained real elevation and made uphill (-Z) progress.
      expect(state.position.y).toBeGreaterThan(start.y + 1);
      expect(state.position.z).toBeLessThan(start.z - 2);
      // Heading did NOT weathervane away — it holds the climb pointing (no
      // steering input was applied, so heading must be essentially unchanged).
      expect(Math.abs(physics.getHeading() - startHeading)).toBeLessThan(2);
    });
  });

  // Conform smoothing (vehicle-heading-hold-and-slope-truth): the chassis tilt
  // is lerped toward the sampled normal with a configurable time constant so the
  // attitude reads smooth, not snappy. Heading stays exact — only tilt smooths.
  describe('Conform smoothing', () => {
    it('settles the chassis tilt toward the slope normal within ~3 time constants without oscillation', () => {
      const tau = 0.2;
      const stepsPerTau = Math.round(tau / DT); // fixed 60 Hz steps per tau
      const sloped = makeSlopedTerrain(0.5); // ~26.6 deg
      // Spawn resting on the surface so conform (not the fall) is what settles.
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 0.45, 0), { conformTau: tau });

      const expectedNormal = new THREE.Vector3(-0.5, 1, 0).normalize();
      const chassisUpAt = () =>
        new THREE.Vector3(0, 1, 0).applyQuaternion(physics.getState().quaternion);

      // One grounded step establishes the smoothing start; then sample the
      // alignment (dot with the target normal) each step so we can assert
      // monotone approach (no oscillation) then settled state.
      physics.update(DT, sloped);
      let prevDot = chassisUpAt().dot(expectedNormal);
      let overshoots = 0;
      const settleSteps = stepsPerTau * 3;
      for (let i = 0; i < settleSteps; i++) {
        physics.update(DT, sloped);
        const dot = chassisUpAt().dot(expectedNormal);
        // Alignment should improve (or hold) toward 1 — a drop signals ringing.
        if (dot < prevDot - 1e-3) overshoots += 1;
        prevDot = dot;
      }

      // Settled: chassis up aligns with the slope normal after ~3*tau.
      expect(chassisUpAt().dot(expectedNormal)).toBeGreaterThan(0.98);
      // Monotone approach — the smoothed conform does not overshoot/ring.
      expect(overshoots).toBe(0);
    });

    it('hard-snaps (legacy behavior) when conformTau is zero', () => {
      const sloped = makeSlopedTerrain(0.5);
      // Spawn essentially resting on the surface so the chassis is grounded
      // within a step or two, isolating the conform (not the fall).
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 0.45, 0), { conformTau: 0 });
      const expectedNormal = new THREE.Vector3(-0.5, 1, 0).normalize();

      // With smoothing disabled, the first few grounded steps already align the
      // chassis with the slope normal (no exponential ramp).
      for (let i = 0; i < 10; i++) physics.update(DT, sloped);
      const chassisUp = new THREE.Vector3(0, 1, 0).applyQuaternion(physics.getState().quaternion);
      expect(chassisUp.dot(expectedNormal)).toBeGreaterThan(0.98);
    });
  });

  // Per-class slope-gate ceilings (vehicle-heading-hold-and-slope-truth): the
  // runtime slope deficit (1 - normal.y) is converted to a true surface angle
  // before comparing against the radian ceiling. A grade just under the ceiling
  // is climbable; one just over it stalls.
  describe('Per-class climb ceiling (deficit->angle conversion)', () => {
    // The jeep ceiling is ~0.87 rad (~50 deg). Build grades that bracket it.
    function forwardSpeedOnGrade(surfaceAngleRad: number): number {
      const dydz = Math.tan(surfaceAngleRad); // forward ramp rise-per-meter
      const ramp = makeForwardRampTerrain(dydz);
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));
      physics.setEngineActive(true);
      for (let i = 0; i < 30; i++) physics.update(DT, ramp); // settle
      physics.setControls({ throttle: 1.0, steerAngle: 0 });
      for (let i = 0; i < 360; i++) physics.update(DT, ramp);
      return physics.getForwardSpeed();
    }

    it('climbs a grade just below the jeep ceiling and stalls just above it', () => {
      const below = forwardSpeedOnGrade(0.78); // ~45 deg, under ~50 deg ceiling
      const above = forwardSpeedOnGrade(1.05);  // ~60 deg, over the ceiling

      // Under the ceiling: still making forward headway.
      expect(below).toBeGreaterThan(0.5);
      // Over the ceiling: drive fades to zero, no forward progress.
      expect(above).toBeLessThan(0.5);
      expect(above).toBeLessThan(below);
    });
  });
});
