/**
 * L2 regression for the low-q authority-scale floor.
 *
 * The old model applied `clamp(q/qRef, 0.15, 2.2)` to pitch/roll/yaw authority.
 * The clamp produced a non-smooth derivative at the low-q edge: below the
 * threshold, control feel was pinned; above it, control feel grew linearly —
 * the "feel" of the aircraft changed abruptly as q crossed the edge. During
 * slow climb (just above Vr) this contributed to climb-rock.
 *
 * The replacement blends from a floor up to the linear response via a
 * smoothstep window, which guarantees a continuous first derivative through
 * the entire low-q range.
 *
 * Per docs/TESTING.md, this test asserts observable behavior (single-step
 * pitch-rate response across a range of airspeeds) rather than the value of
 * any particular internal constant. What it pins is *continuity*: no abrupt
 * jump in how much pitch authority a fixed stick input produces as airspeed
 * sweeps through the formerly-clamp-edge region.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Airframe } from './Airframe';
import type { AirframeIntent, AirframeTerrainProbe } from './types';
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

/**
 * Step the airframe once from a clean airborne reset at the given forward
 * airspeed, applying a constant pitch-up stick. Return the resulting pitch
 * rate. Isolates authority-scale behaviour: same stick, same altitude, same
 * attitude — only q (via forwardSpeed) varies.
 */
function pitchRateAtSpeed(forwardSpeed: number, pitch: number): number {
  const af = new Airframe(
    new THREE.Vector3(0, 500, 0),
    SKYRAIDER_AF,
  );
  const q = new THREE.Quaternion(); // identity: facing -Z, level
  af.resetAirborne(new THREE.Vector3(0, 500, 0), q, forwardSpeed, 0, 0);
  af.step(intent({ pitch, throttle: 0, tier: 'raw' }), flatProbe(0), FIXED_DT);
  return af.getState().pitchRateDeg;
}

describe('Airframe — low-q authority-scale continuity', () => {
  it('pitch response is continuous in airspeed across the low-q blend region', () => {
    // vrSpeedMs maps to qNorm = 1.0. The blend window is qNorm in [0.10, 0.30].
    // qNorm = (v / vr)^2, so the window is v in [sqrt(0.10)*vr, sqrt(0.30)*vr]
    // ≈ [0.316 * vr, 0.548 * vr]. Sweep a wider band [0.10 * vr, 0.80 * vr] so
    // both the floor region, the blend region, and the linear region are
    // covered.
    const vr = SKYRAIDER_AF.aero.vrSpeedMs;
    const lo = 0.10 * vr;
    const hi = 0.80 * vr;
    const N = 40;

    const speeds: number[] = [];
    const rates: number[] = [];
    for (let i = 0; i <= N; i++) {
      const v = lo + (hi - lo) * (i / N);
      speeds.push(v);
      rates.push(pitchRateAtSpeed(v, 0.5));
    }

    // Finite differences (per-m/s slope of pitchRateDeg). A hard clamp shows
    // as a single large spike where the constraint releases; a smooth blend
    // gives a bounded, slowly-varying finite difference.
    const deltas: number[] = [];
    for (let i = 1; i < rates.length; i++) {
      const dv = speeds[i] - speeds[i - 1];
      deltas.push((rates[i] - rates[i - 1]) / dv);
    }

    const maxAbsDelta = deltas.reduce((m, d) => Math.max(m, Math.abs(d)), 0);
    const medianAbsDelta = [...deltas.map(Math.abs)].sort((a, b) => a - b)[
      Math.floor(deltas.length / 2)
    ];

    // The hard-clamp version had a spike-to-median ratio much larger than
    // this bound (the slope jumps from 0 to the linear value in one step).
    // The smoothstep version keeps the ratio small because the derivative
    // grows and shrinks smoothly across the window.
    expect(maxAbsDelta).toBeLessThan(medianAbsDelta * 8 + 1e-3);
    // Sanity: the response is nontrivial (positive stick produces positive
    // pitch-up rate somewhere in the sweep).
    expect(Math.max(...rates)).toBeGreaterThan(0);
  });

  it('high-speed authority is unchanged (high-side clamp remains at 2.2)', () => {
    // qNorm = 2.2 corresponds to v = sqrt(2.2) * vr ≈ 1.483 * vr. Above that,
    // authority is clamped and additional speed should not produce additional
    // pitch rate. Compare v = 1.6 * vr and v = 2.0 * vr — both above the
    // clamp — and require the pitch-rate response to be identical to within
    // numerical noise.
    const vr = SKYRAIDER_AF.aero.vrSpeedMs;
    const rateAtHigh = pitchRateAtSpeed(1.6 * vr, 0.5);
    const rateAtVeryHigh = pitchRateAtSpeed(2.0 * vr, 0.5);

    // Aero forces (lift, drag, damping) also vary with speed, so the values
    // won't match to machine precision. Require the fractional difference to
    // be small — a broken high-side clamp (e.g. linear scaling) would diverge
    // by ~25% across this range.
    const frac = Math.abs(rateAtVeryHigh - rateAtHigh) / Math.max(Math.abs(rateAtHigh), 1e-6);
    expect(frac).toBeLessThan(0.10);
  });
});
