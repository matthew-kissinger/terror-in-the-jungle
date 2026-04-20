/**
 * L3 integration test for the fixed-wing path.
 *
 * Drives `Airframe` directly with commanded inputs over multi-second scenarios
 * and asserts observable flight outcomes — altitude, airspeed, altitude loss
 * — rather than internal phase names or tuning values. Per docs/TESTING.md:
 * behavior tests, not implementation mirrors.
 *
 * Tests 1 (takeoff) and 5 (cliff) were the original named regression targets
 * from the B1 rebuild; test 2 (level cruise) was a second observable
 * regression surfaced while writing these tests. Post-B1 cutover (shim
 * deleted) these run against `Airframe` directly; the feel-neutralized
 * `airframeConfigFromLegacy()` translation keeps the per-aircraft tuning the
 * old shim exposed so the numeric budgets (altitudeAGL > 20 at 8s full
 * throttle + rotation, |end-start| < 5m over 5s cruise, altitudeLoss < 30m
 * over the cliff) are unchanged.
 *
 * See docs/tasks/A1-plane-test-mode.md, docs/tasks/b1-flight-cutover.md.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Airframe } from '../airframe/Airframe';
import type { AirframeIntent, AirframeTerrainProbe } from '../airframe/types';
import { FIXED_WING_CONFIGS } from '../FixedWingConfigs';
import { airframeConfigFromLegacy } from '../FixedWingTypes';

const FIXED_DT = 1 / 60;
const SKYRAIDER = FIXED_WING_CONFIGS.A1_SKYRAIDER.physics;
const SKYRAIDER_AF = airframeConfigFromLegacy(SKYRAIDER);

function flatProbe(height: number): AirframeTerrainProbe {
  const normal = new THREE.Vector3(0, 1, 0);
  return {
    sample() {
      return { height, normal };
    },
    sweep(from, to) {
      if (from.y >= height && to.y < height) {
        const t = (from.y - height) / Math.max(from.y - to.y, 0.0001);
        const point = new THREE.Vector3().lerpVectors(from, to, t);
        point.y = height;
        return { hit: true, point, normal };
      }
      return null;
    },
  };
}

/**
 * Step-function terrain: returns `lowHeight` for x >= xThreshold and
 * `highHeight` otherwise. Models the cliff-edge scenario. The swept query
 * returns a hit when the end-point dips below whichever slab applies.
 */
function stepProbe(xThreshold: number, highHeight: number, lowHeight: number): AirframeTerrainProbe {
  const normal = new THREE.Vector3(0, 1, 0);
  const heightAt = (x: number) => (x >= xThreshold ? lowHeight : highHeight);
  return {
    sample(x) {
      return { height: heightAt(x), normal };
    },
    sweep(from, to) {
      const h = heightAt(to.x);
      if (from.y >= h && to.y < h) {
        const t = (from.y - h) / Math.max(from.y - to.y, 0.0001);
        const point = new THREE.Vector3().lerpVectors(from, to, t);
        point.y = h;
        return { hit: true, point, normal };
      }
      return null;
    },
  };
}

function intent(overrides: Partial<AirframeIntent>): AirframeIntent {
  return {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttle: 0,
    brake: 0,
    tier: 'raw',
    ...overrides,
  };
}

describe('FixedWing L3 integration — behavior contracts', () => {
  // Former regression target; must pass against the unified Airframe sim.
  it('takes off from a flat runway in 8 seconds at full throttle + elevator', () => {
    const af = new Airframe(new THREE.Vector3(0, 1.5, 0), SKYRAIDER_AF);
    const probe = flatProbe(0);
    const cmd = intent({ throttle: 1, pitch: 0.3 });

    for (let i = 0; i < Math.round(8 / FIXED_DT); i++) {
      af.step(cmd, probe, FIXED_DT);
    }

    const state = af.getState();
    expect(state.altitudeAGL).toBeGreaterThan(20);
    expect(state.forwardAirspeedMs).toBeGreaterThan(SKYRAIDER.vrSpeed);
  });

  // Regression: post-liftoff porpoise. Before the fix the airborne
  // ground-touchdown fallback would snap the aircraft back to the runway
  // ~1 second after liftoff if AGL dipped below a small clearance threshold
  // with vy <= 0, producing a visible bounce during the early climb. The
  // contract here is that once an aircraft lifts off under reasonable inputs
  // it remains airborne for the rest of the climb segment — no retouchdown.
  it('does not re-touchdown within 4 seconds of liftoff at full throttle', () => {
    const af = new Airframe(new THREE.Vector3(0, SKYRAIDER_AF.ground.gearClearanceM, 0), SKYRAIDER_AF);
    const probe = flatProbe(0);
    const cmd = intent({ throttle: 1, pitch: 0.3 });

    let liftoffTick = -1;
    let postLiftoffTouchdowns = 0;
    let wasAirborne = false;
    // 12 s is enough for liftoff (~3 s into the roll) plus a 4 s climb window.
    const totalTicks = Math.round(12 / FIXED_DT);
    for (let i = 0; i < totalTicks; i++) {
      af.step(cmd, probe, FIXED_DT);
      const s = af.getState();
      if (liftoffTick < 0 && !s.weightOnWheels) {
        liftoffTick = i;
      }
      if (liftoffTick >= 0) {
        if (wasAirborne && s.weightOnWheels) {
          postLiftoffTouchdowns++;
        }
        wasAirborne = !s.weightOnWheels;
      }
      if (liftoffTick >= 0 && i > liftoffTick + Math.round(4 / FIXED_DT)) break;
    }

    expect(liftoffTick).toBeGreaterThan(0);
    expect(postLiftoffTouchdowns).toBe(0);
  });

  // Regression: altitude monotonicity across the first climb phase.
  // With aerodynamic oscillation the AGL trace zig-zagged around the
  // fallback threshold; after the fix the trace is strictly monotonic once
  // the plane has cleared the ground + gear clearance.
  it('climbs monotonically for 3 seconds after liftoff', () => {
    const af = new Airframe(new THREE.Vector3(0, SKYRAIDER_AF.ground.gearClearanceM, 0), SKYRAIDER_AF);
    const probe = flatProbe(0);
    const cmd = intent({ throttle: 1, pitch: 0.3 });

    let liftoffTick = -1;
    let lastAGL = 0;
    let dips = 0;
    const totalTicks = Math.round(12 / FIXED_DT);
    for (let i = 0; i < totalTicks; i++) {
      af.step(cmd, probe, FIXED_DT);
      const s = af.getState();
      if (liftoffTick < 0 && !s.weightOnWheels) {
        liftoffTick = i;
        lastAGL = s.altitudeAGL;
        continue;
      }
      if (liftoffTick >= 0) {
        // A true climb: AGL should not drop below its previous value by
        // more than a small tolerance (aerodynamic fluctuation).
        if (s.altitudeAGL < lastAGL - 0.1) {
          dips++;
        }
        lastAGL = Math.max(lastAGL, s.altitudeAGL);
        if (i > liftoffTick + Math.round(3 / FIXED_DT)) break;
      }
    }

    expect(liftoffTick).toBeGreaterThan(0);
    // Allow a tiny number of tolerance dips (≤ 3) for aerodynamic wiggle;
    // a real bounce produces dozens.
    expect(dips).toBeLessThan(4);
  });

  // Former regression: neutral stick at 50 m/s with stability assist used to
  // descend roughly 50 m over 5 s because of an unbalanced pitch trim. The
  // rebuilt sim's assist tier autolevels toward trim alpha and holds
  // altitude.
  it('holds altitude in level cruise with neutral stick', () => {
    const af = new Airframe(new THREE.Vector3(0, 200, 0), SKYRAIDER_AF);
    const probe = flatProbe(0);
    // Place airborne at 200m with 50 m/s cruise (> v2, < max).
    af.resetAirborne(new THREE.Vector3(0, 200, 0), new THREE.Quaternion(), 50, 0, 0);
    const startAltitude = af.getState().altitude;

    const cmd = intent({ throttle: 0.55, tier: 'assist' });
    for (let i = 0; i < Math.round(5 / FIXED_DT); i++) {
      af.step(cmd, probe, FIXED_DT);
    }

    const endAltitude = af.getState().altitude;
    expect(Math.abs(endAltitude - startAltitude)).toBeLessThan(5);
  });

  it('accelerates in a nose-down dive', () => {
    const af = new Airframe(new THREE.Vector3(0, 300, 0), SKYRAIDER_AF);
    const probe = flatProbe(0);
    af.resetAirborne(new THREE.Vector3(0, 300, 0), new THREE.Quaternion(), SKYRAIDER.v2Speed + 5, 0, 0);

    // Use airspeed magnitude, not forward-axis airspeed: the dive command
    // drives the nose through vertical, which flips the sign of forward-body
    // velocity. Energy gain from gravity is the observable.
    const startSpeed = af.getState().airspeedMs;

    const cmd = intent({ throttle: 0.5, pitch: -0.5 });
    for (let i = 0; i < Math.round(3 / FIXED_DT); i++) {
      af.step(cmd, probe, FIXED_DT);
    }

    const endSpeed = af.getState().airspeedMs;
    expect(endSpeed).toBeGreaterThan(startSpeed);
  });

  it('does not stall in the first second when full pitch-up is held from cruise', () => {
    const af = new Airframe(new THREE.Vector3(0, 500, 0), SKYRAIDER_AF);
    const probe = flatProbe(0);
    af.resetAirborne(
      new THREE.Vector3(0, 500, 0),
      new THREE.Quaternion(),
      SKYRAIDER.v2Speed + 10,
      0,
      0,
    );

    const cmd = intent({ throttle: 1, pitch: 1.0 });
    const ticksPerSec = Math.round(1 / FIXED_DT);
    for (let i = 0; i < ticksPerSec; i++) {
      af.step(cmd, probe, FIXED_DT);
    }

    const state = af.getState();
    expect(state.forwardAirspeedMs).toBeGreaterThan(SKYRAIDER.stallSpeed);
  });

  // Former regression: a low-speed aircraft cleared just past a cliff edge at
  // ~50 m AGL with full throttle and neutral stick should lose less than
  // 30 m of altitude in 4 s. After the rebuild the assist tier's autolevel
  // plus restored ground-effect lift keeps the aircraft within the budget.
  it('loses < 30 m of altitude over a cliff at marginal airspeed', () => {
    // forward=+X: rotate identity 90deg CCW about Y so -Z becomes +X.
    const facingPlusX = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      -Math.PI / 2,
    );
    const af = new Airframe(new THREE.Vector3(1, 50.5, 0), SKYRAIDER_AF);
    af.resetAirborne(
      new THREE.Vector3(1, 50.5, 0),
      facingPlusX,
      40, // below Vr but above stall
      0,
      0,
    );

    const startAltitude = af.getState().altitude;
    const probe = stepProbe(0, 50, 0);
    const cmd = intent({ throttle: 1 });

    for (let i = 0; i < Math.round(4 / FIXED_DT); i++) {
      af.step(cmd, probe, FIXED_DT);
    }

    const altitudeLoss = startAltitude - af.getState().altitude;
    expect(altitudeLoss).toBeLessThan(30);
  });
});
