/**
 * L2 regression: phugoid oscillation is quenched in sustained climb.
 *
 * The long-period speed-altitude coupling mode (phugoid) manifests as a
 * vertical-speed oscillation with ~100+ m/s peak-to-peak amplitude in the
 * A-1 hands-off full-throttle climb scenario under baseline damping.
 * Climb-rate-scaled pitch damping is expected to keep that amplitude under
 * a game-feel-acceptable bound without changing cruise pitch authority.
 *
 * Per docs/TESTING.md, the test asserts observable outcomes (vertical-speed
 * range over time, altitude rising) rather than internal damping constants
 * — the exact damping value or climbFactor onset threshold can be retuned
 * without breaking this test.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Airframe } from './Airframe';
import type { AirframeIntent, AirframeTerrainProbe } from './types';
import { FIXED_WING_CONFIGS } from '../FixedWingConfigs';
import { airframeConfigFromLegacy } from '../FixedWingTypes';

const FIXED_DT = 1 / 60;
const SKYRAIDER_AF = airframeConfigFromLegacy(FIXED_WING_CONFIGS.A1_SKYRAIDER.physics);

function flatProbeAt(groundHeight: number): AirframeTerrainProbe {
  const normal = new THREE.Vector3(0, 1, 0);
  return {
    sample() {
      return { height: groundHeight, normal };
    },
    sweep() {
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

describe('Airframe — climb-rate-scaled pitch damping', () => {
  it('A-1 hands-off climb at full throttle stays within a bounded vertical-speed envelope (no phugoid blowup)', () => {
    // Start airborne at 100 m AGL with trim speed so the plane is already in
    // a climb-capable regime. Ground is way below so the sim never touches
    // it during the 30 s window.
    const startY = 100;
    const farGround = -1000;
    const af = new Airframe(new THREE.Vector3(0, startY, 0), SKYRAIDER_AF);
    af.resetAirborne(
      new THREE.Vector3(0, startY, 0),
      new THREE.Quaternion(),
      SKYRAIDER_AF.aero.v2SpeedMs,
      0,
      farGround,
    );
    const probe = flatProbeAt(farGround);
    const cmd = intent({ throttle: 1, pitch: 0, tier: 'raw' });

    const durationSec = 30;
    const ticks = Math.round(durationSec / FIXED_DT);
    const skip = Math.round(2 / FIXED_DT); // trim out initial transient
    const vs: number[] = [];

    for (let i = 0; i < ticks; i++) {
      af.step(cmd, probe, FIXED_DT);
      const s = af.getState();
      vs.push(s.verticalSpeedMs);
    }

    const vsTrim = vs.slice(skip);
    const vsMin = Math.min(...vsTrim);
    const vsMax = Math.max(...vsTrim);
    const vsPeakToPeak = vsMax - vsMin;

    // The aircraft must be climbing on average (this is a climb scenario,
    // not a descent).
    const vsMean = vsTrim.reduce((a, b) => a + b, 0) / vsTrim.length;
    expect(vsMean).toBeGreaterThan(0);

    // Phugoid-damped envelope: peak-to-peak vertical-speed excursion under
    // 120 m/s. Baseline (no climb damping) was ~188 m/s. Tuning can shift
    // the exact number but a full-blown phugoid would overshoot this bound.
    expect(vsPeakToPeak).toBeLessThan(120);

    // Plane must gain net altitude over the 30 s window — regression guard
    // against a future change that damps so hard the plane can't climb.
    const af2State = af.getState();
    expect(af2State.altitude).toBeGreaterThan(startY + 100);

    // Vertical speed never collapses below zero for a sustained period — if
    // the phugoid dipped deep the way it did at baseline (vsMin reached
    // -120 m/s), vsMin would be negative-large. Require vsMin > -20 m/s as
    // an order-of-magnitude game-feel bound.
    expect(vsMin).toBeGreaterThan(-20);
  });

  it('pitch responsiveness in cruise (vy ~= 0) is unaffected by climb damping', () => {
    // Cruise scenario: step elevator to +0.5 and measure time to 10 deg.
    // vy starts at 0, so climbFactor is 0 and damping is unchanged. The
    // plane should reach 10 deg pitch within a short window — damping that
    // touched cruise would visibly delay this.
    const startY = 500;
    const af = new Airframe(new THREE.Vector3(0, startY, 0), SKYRAIDER_AF);
    af.resetAirborne(
      new THREE.Vector3(0, startY, 0),
      new THREE.Quaternion(),
      SKYRAIDER_AF.aero.v2SpeedMs * 1.3,
      0,
      startY - 1000,
    );
    const probe = flatProbeAt(startY - 1000);
    const cmd = intent({ throttle: 0.5, pitch: 0.5, tier: 'raw' });

    const ticks = Math.round(1 / FIXED_DT); // 1 s — more than enough
    let tTo10 = -1;
    for (let i = 0; i < ticks; i++) {
      af.step(cmd, probe, FIXED_DT);
      const s = af.getState();
      if (tTo10 < 0 && s.pitchDeg >= 10) {
        tTo10 = i * FIXED_DT;
        break;
      }
    }

    // Must reach 10 deg pitch within 1 s of stick input. Baseline is ~0.63 s;
    // bound is conservative (1 s) so a minor tuning shift doesn't flake.
    expect(tTo10).toBeGreaterThan(0);
    expect(tTo10).toBeLessThan(1);
  });
});
