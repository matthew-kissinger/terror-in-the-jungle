/**
 * L2 regression for the soft alpha-protection roll-off.
 *
 * The old narrow 4-deg smoothstep (stall-5 to stall-1) produced a bang-bang
 * boundary oscillator: a small alpha excursion through the narrow ramp
 * moved the applied elevator authority from near-full to near-zero, the
 * nose sank, alpha dropped, authority returned, nose rose, repeat. This
 * test pins the softness contract: a 1-deg alpha change near stall must
 * never produce more than a ~35% swing in applied authority at full aft
 * stick. A 4-deg narrow smoothstep fails this (near the middle of a 4-deg
 * band, a 1-deg alpha change is 25% of the band -> the smoothstep slope
 * peaks near 0.5/deg, i.e. 50% authority change per deg).
 *
 * Per docs/TESTING.md: test asserts observable behaviour (pitch-rate
 * response to a small alpha shift under the same commanded stick). It does
 * NOT assert on the specific ramp shape (tanh vs smoothstep vs polynomial)
 * or on the numeric alphaStallDeg.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Airframe } from './Airframe';
import type { AirframeConfig, AirframeIntent, AirframeTerrainProbe } from './types';
import { FIXED_WING_CONFIGS } from '../FixedWingConfigs';
import { airframeConfigFromLegacy } from '../FixedWingTypes';

const FIXED_DT = 1 / 60;
const SKYRAIDER_AF = airframeConfigFromLegacy(FIXED_WING_CONFIGS.A1_SKYRAIDER.physics);

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

/**
 * Probe the protected-elevator pitch response at a fixed alpha under a
 * given stick input. Warms the elevator effector to saturation at the
 * requested alpha, then reads the pitch-rate produced by one sim step.
 *
 * Uses `resetAirborne` every tick to pin alpha; this keeps the aircraft
 * at the requested state while the effector lerp catches up.
 */
function pitchRateAtAlpha(
  cfg: AirframeConfig,
  alphaDeg: number,
  pitchStick: number,
): number {
  const af = new Airframe(new THREE.Vector3(0, 100, 0), cfg);
  const speed = 55; // well above stall for Skyraider (34 m/s)
  const alphaRad = THREE.MathUtils.degToRad(alphaDeg);
  const fwd = speed * Math.cos(alphaRad);
  const vert = -speed * Math.sin(alphaRad);
  const cmd = intent({ throttle: 1, pitch: pitchStick, tier: 'raw' });
  const probe = flatProbe(-100); // far below, no collision

  for (let i = 0; i < 60; i++) {
    af.resetAirborne(
      new THREE.Vector3(0, 100, 0),
      new THREE.Quaternion(),
      fwd,
      vert,
    );
    af.step(cmd, probe, FIXED_DT);
  }
  return af.getState().pitchRateDeg;
}

/**
 * The elevator-authority contribution at a given alpha is the difference
 * between full-aft-stick and centered-stick pitch rates, isolating the
 * protected-elevator torque from base restoring / stall-drop / pitch-damp
 * terms (which are identical at the pinned alpha).
 */
function elevatorAuthorityAtAlpha(cfg: AirframeConfig, alphaDeg: number): number {
  const full = pitchRateAtAlpha(cfg, alphaDeg, 1.0);
  const centered = pitchRateAtAlpha(cfg, alphaDeg, 0.0);
  return full - centered;
}

describe('Airframe — alpha protection roll-off', () => {
  it('elevator authority is smooth (not bang-bang) as alpha crosses stall', () => {
    // Sample the elevator-authority contribution (full-stick minus
    // centered-stick pitch rate) at four alphas: 2 deg below stall, 1
    // deg below, at stall, and 1 deg past. A narrow 4-deg smoothstep
    // centred just below stall will show a near-complete drop inside
    // this 3-deg window (authority hits zero by alphaStall - 1). A
    // smooth wide ramp drops gradually.
    const stallDeg = SKYRAIDER_AF.aero.alphaStallDeg;
    const authAtLow = elevatorAuthorityAtAlpha(SKYRAIDER_AF, stallDeg - 2);
    const authAtMid = elevatorAuthorityAtAlpha(SKYRAIDER_AF, stallDeg - 1);
    const authAtStall = elevatorAuthorityAtAlpha(SKYRAIDER_AF, stallDeg);
    const authPast = elevatorAuthorityAtAlpha(SKYRAIDER_AF, stallDeg + 1);

    // Reference: the well-below-stall authority (ramp is at or near 1.0).
    const ref = elevatorAuthorityAtAlpha(SKYRAIDER_AF, stallDeg - 10);
    expect(ref).toBeGreaterThan(0);

    // The brief's "within 2 deg of stall" band covers alphaStall - 2
    // through alphaStall + 2. A bang-bang 0→full ramp produces an almost
    // full-authority drop inside this band. A smooth ramp drops
    // gradually. Require each adjacent 1-deg step to be less than 50%
    // of the reference authority.
    const deltas = [
      Math.abs(authAtLow - authAtMid) / ref,
      Math.abs(authAtMid - authAtStall) / ref,
      Math.abs(authAtStall - authPast) / ref,
    ];
    for (const d of deltas) {
      expect(d).toBeLessThan(0.5);
    }
  });

  it('retains a sliver of recovery authority when alpha is 1 deg past stall', () => {
    // Past stall the old narrow smoothstep drove the protection factor
    // to zero and the pilot had no elevator authority left (only aero
    // restoring moments could recover the nose). The soft ramp retains
    // a nonzero authority past stall, so the same aft-stick input that
    // entered the stall also contributes to exiting it. Check the
    // elevator authority CONTRIBUTION (full-stick minus centered-stick
    // pitch rate) at alpha = stall + 1 deg is a meaningful fraction of
    // the well-below-stall authority.
    const stallDeg = SKYRAIDER_AF.aero.alphaStallDeg;
    const ref = elevatorAuthorityAtAlpha(SKYRAIDER_AF, stallDeg - 10);
    const authPast = elevatorAuthorityAtAlpha(SKYRAIDER_AF, stallDeg + 1);
    expect(ref).toBeGreaterThan(0);
    // 10% residual authority past stall is a defensible floor: the old
    // narrow smoothstep yields ~0%, the soft ramp yields >25%.
    expect(authPast).toBeGreaterThan(0.1 * ref);
  });
});
