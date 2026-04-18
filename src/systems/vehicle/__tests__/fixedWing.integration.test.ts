/**
 * L3 integration test for the fixed-wing path.
 *
 * Drives FixedWingPhysics with commanded inputs (the same interface the pilot
 * adapter and NPC pilot ultimately call) over multi-second scenarios and
 * asserts observable flight outcomes — altitude, airspeed, altitude loss —
 * rather than internal phase names or tuning values. Per docs/TESTING.md:
 * behavior tests, not implementation mirrors.
 *
 * Tests 1 (takeoff) and 5 (cliff) were the brief's named regression targets;
 * test 2 (level cruise) was a second observable regression surfaced while
 * writing these tests. All three were previously declared with `it.fails()`.
 * As of the B1 vehicle physics rebuild the backing sim (now the unified
 * Airframe primitive via FixedWingPhysics) passes all five scenarios, so
 * they are declared as plain `it()` assertions here.
 *
 * See docs/tasks/A1-plane-test-mode.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FixedWingPhysics } from '../FixedWingPhysics';
import type { FixedWingTerrainSample } from '../FixedWingPhysics';
import { FIXED_WING_CONFIGS } from '../FixedWingConfigs';

const FIXED_DT = 1 / 60;
const SKYRAIDER = FIXED_WING_CONFIGS.A1_SKYRAIDER.physics;

function flatTerrainAt(height: number): FixedWingTerrainSample {
  return { height, normal: new THREE.Vector3(0, 1, 0) };
}

describe('FixedWing L3 integration — behavior contracts', () => {
  // ─────────────────────────────────────────────────────────────────────
  // Test 1 — former regression target; now passes against the rebuilt
  // Airframe sim.
  // ─────────────────────────────────────────────────────────────────────
  it('takes off from a flat runway in 8 seconds at full throttle + elevator', () => {
    const phys = new FixedWingPhysics(new THREE.Vector3(0, 1.5, 0), SKYRAIDER);

    for (let i = 0; i < Math.round(8 / FIXED_DT); i++) {
      phys.setCommand({
        throttleTarget: 1,
        pitchCommand: 0.3,
        rollCommand: 0,
        yawCommand: 0,
        brake: 0,
      });
      phys.update(FIXED_DT, flatTerrainAt(0));
    }

    const snap = phys.getFlightSnapshot();
    expect(snap.altitudeAGL).toBeGreaterThan(20);
    expect(snap.forwardAirspeed).toBeGreaterThan(SKYRAIDER.vrSpeed);
  });

  // Former regression: neutral stick at 50 m/s with stability assist used to
  // descend roughly 50 m over 5 s because of an unbalanced pitch trim. The
  // rebuilt sim's assist tier autolevels toward trim alpha and holds
  // altitude.
  it('holds altitude in level cruise with neutral stick', () => {
    const phys = new FixedWingPhysics(new THREE.Vector3(0, 200, 0), SKYRAIDER);
    // Place airborne at 200m with 50 m/s cruise (> v2, < max).
    const quat = new THREE.Quaternion(); // identity: forward = -Z
    phys.resetAirborne(new THREE.Vector3(0, 200, 0), quat, 50, 0, 0);

    const startAltitude = phys.getFlightSnapshot().altitude;

    for (let i = 0; i < Math.round(5 / FIXED_DT); i++) {
      phys.setCommand({
        throttleTarget: 0.55, // cruise-ish — enough to sustain 50 m/s
        pitchCommand: 0,
        rollCommand: 0,
        yawCommand: 0,
        brake: 0,
        stabilityAssist: true,
      });
      phys.update(FIXED_DT, flatTerrainAt(0));
    }

    const endAltitude = phys.getFlightSnapshot().altitude;
    expect(Math.abs(endAltitude - startAltitude)).toBeLessThan(5);
  });

  it('accelerates in a nose-down dive', () => {
    const phys = new FixedWingPhysics(new THREE.Vector3(0, 300, 0), SKYRAIDER);
    const quat = new THREE.Quaternion();
    phys.resetAirborne(new THREE.Vector3(0, 300, 0), quat, SKYRAIDER.v2Speed + 5, 0, 0);

    // Use airspeed magnitude, not forward-axis airspeed: the dive command drives
    // the nose through vertical under the current physics, which flips the sign
    // of forward-body velocity. Energy gain from gravity is the observable.
    const startSpeed = phys.getFlightSnapshot().airspeed;

    for (let i = 0; i < Math.round(3 / FIXED_DT); i++) {
      phys.setCommand({
        throttleTarget: 0.5,
        pitchCommand: -0.5,
        rollCommand: 0,
        yawCommand: 0,
        brake: 0,
      });
      phys.update(FIXED_DT, flatTerrainAt(0));
    }

    const endSpeed = phys.getFlightSnapshot().airspeed;
    expect(endSpeed).toBeGreaterThan(startSpeed);
  });

  it('does not stall in the first second when full pitch-up is held from cruise', () => {
    const phys = new FixedWingPhysics(new THREE.Vector3(0, 500, 0), SKYRAIDER);
    const quat = new THREE.Quaternion();
    phys.resetAirborne(
      new THREE.Vector3(0, 500, 0),
      quat,
      SKYRAIDER.v2Speed + 10,
      0,
      0,
    );

    const ticksPerSec = Math.round(1 / FIXED_DT);
    for (let i = 0; i < ticksPerSec; i++) {
      phys.setCommand({
        throttleTarget: 1,
        pitchCommand: 1.0,
        rollCommand: 0,
        yawCommand: 0,
        brake: 0,
      });
      phys.update(FIXED_DT, flatTerrainAt(0));
    }

    const snap = phys.getFlightSnapshot();
    expect(snap.forwardAirspeed).toBeGreaterThan(SKYRAIDER.stallSpeed);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Test 5 — former regression: a low-speed aircraft cleared just past a
  // cliff edge at ~50 m AGL with full throttle and neutral stick should
  // lose less than 30 m of altitude in 4 s. After the rebuild the assist
  // tier's autolevel-toward-trim elevator plus restored ground-effect lift
  // keeps the aircraft within the budget.
  // ─────────────────────────────────────────────────────────────────────
  it('loses < 30 m of altitude over a cliff at marginal airspeed', () => {
    // forward=+X: rotate identity 90deg CCW about Y so -Z becomes +X.
    const facingPlusX = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -Math.PI / 2,
    );
    const phys = new FixedWingPhysics(new THREE.Vector3(1, 50.5, 0), SKYRAIDER);
    phys.resetAirborne(
      new THREE.Vector3(1, 50.5, 0),
      facingPlusX,
      40, // below Vr but above stall
      0,
      0, // groundHeight below plane (x>=0 side)
    );

    const startAltitude = phys.getFlightSnapshot().altitude;

    const sampleCliff = (pos: THREE.Vector3): FixedWingTerrainSample =>
      flatTerrainAt(pos.x < 0 ? 50 : 0);

    for (let i = 0; i < Math.round(4 / FIXED_DT); i++) {
      phys.setCommand({
        throttleTarget: 1,
        pitchCommand: 0,
        rollCommand: 0,
        yawCommand: 0,
        brake: 0,
      });
      phys.update(FIXED_DT, sampleCliff(phys.getPosition()));
    }

    const altitudeLoss = startAltitude - phys.getFlightSnapshot().altitude;
    expect(altitudeLoss).toBeLessThan(30);
  });
});
