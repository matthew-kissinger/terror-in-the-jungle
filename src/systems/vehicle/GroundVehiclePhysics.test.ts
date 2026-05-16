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
 * `slope` returned is the absolute slope angle in radians.
 */
function makeSlopedTerrain(dydx: number): ITerrainRuntime {
  const slope = Math.atan(Math.abs(dydx));
  // Normal: rotate (0,1,0) around Z by -atan(dydx). For dydx>0 (climbing +X) normal tilts toward -X.
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
      // A surface rising 1m per 2m along +X (~26.6 deg slope, below default maxClimbSlope of 0.54 rad).
      // dy/dx = 0.5 → slope ~0.4636 rad.
      const sloped = makeSlopedTerrain(0.5);
      // Spawn just above the slope at x=0 so chassis settles onto it.
      const physics = new GroundVehiclePhysics(new THREE.Vector3(0, 1.0, 0));

      for (let i = 0; i < 120; i++) {
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

  describe('Slope-stall', () => {
    it('forward drive force scales down on slopes above threshold', () => {
      // Compare achieved chassis-forward speed after a fixed throttle window
      // on a gentle slope vs a near-vertical slope past maxClimbSlope.
      // We measure the signed forward component (chassis local -Z) so that
      // gravity-induced downhill sliding (which is perpendicular to forward
      // at spawn) does NOT register as forward progress on the wall slope.
      const gentle = makeSlopedTerrain(0.05); // ~2.86 deg, well below maxClimbSlope
      const wall = makeSlopedTerrain(2.0);    // ~63 deg, well above maxClimbSlope (0.54 rad ~31 deg)

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
});
