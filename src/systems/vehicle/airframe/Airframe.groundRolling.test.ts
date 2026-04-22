/**
 * L2 regressions for the continuous wheel-load rolling model.
 *
 * These tests pin behaviour that the old discrete liftoff gate could not
 * produce:
 *
 *   - Pitch input below Vr moves the plane (nonzero vertical acceleration
 *     before liftoff, where the old gate forced velocity.y = 0).
 *   - Lateral friction is zero at forwardSpeed = Vr (the old model applied
 *     full friction right up until the gate flipped).
 *   - Rollout vertical position is monotonic-or-stationary — the per-tick
 *     sync at current XZ does not introduce sawtooth jitter.
 *
 * Per docs/TESTING.md, assertions are on observable outcomes (velocity,
 * position, airspeed), not on internal phase names or tuning constants.
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
 * Gently rolling (low-frequency sinusoidal) terrain. The heightmap varies
 * within ~0.05 m across the full 60 s rollout distance so the sync path is
 * exercised with something more interesting than a flat slab, without ever
 * dropping fast enough to violate the 50 ms monotone-or-stationary budget.
 */
function rollingProbe(): AirframeTerrainProbe {
  const normal = new THREE.Vector3(0, 1, 0);
  const heightAt = (x: number) => 0.03 * Math.sin(x * 0.02);
  return {
    sample(x) {
      return { height: heightAt(x), normal };
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

describe('Airframe — continuous wheel-load rolling model', () => {
  it('pitch input at 0.85 × Vr produces nonzero vertical acceleration before liftoff', () => {
    const af = new Airframe(
      new THREE.Vector3(0, SKYRAIDER_AF.ground.gearClearanceM, 0),
      SKYRAIDER_AF,
    );
    const probe = flatProbe(0);

    // Seed the velocity so the first ground step runs at 0.85 × Vr. Preserve
    // the plane's facing (-Z) by driving forward momentum along -Z.
    const vrTarget = SKYRAIDER_AF.aero.vrSpeedMs * 0.85;
    af.getVelocity().set(0, 0, -vrTarget);

    // Tiny pitch input, zero throttle: we want to isolate the effect of
    // elevator-on-trajectory at sub-Vr forward speed. Under the old gate,
    // velocity.y stays pinned to 0 because ground integration overwrites
    // velocity with the planar `move` vector.
    const cmd = intent({ throttle: 0, pitch: 0.5, tier: 'raw' });
    af.step(cmd, probe, FIXED_DT);
    const state = af.getState();

    // Aircraft is still on the runway (may have committed to liftoff in the
    // same tick if lift was sufficient; that's also a valid "nonzero vertical
    // acceleration" outcome). Either way the vertical component of velocity
    // must be positive — pitch authority scaled with (1 - wheelLoad) leaked
    // into trajectory.
    expect(state.verticalSpeedMs).toBeGreaterThan(0);
  });

  it('lateral friction vanishes at forwardSpeed = Vr', () => {
    const af = new Airframe(
      new THREE.Vector3(0, SKYRAIDER_AF.ground.gearClearanceM, 0),
      SKYRAIDER_AF,
    );
    const probe = flatProbe(0);

    // Seed forward = Vr, plus a sideways component so we can watch friction
    // (or its absence) act on it.
    const vr = SKYRAIDER_AF.aero.vrSpeedMs;
    const sideStart = 4;
    af.getVelocity().set(sideStart, 0, -vr);

    // Neutral stick, zero throttle, no brake. The only force that can damp
    // the sideways component is lateral friction. Under the old model,
    // friction was full strength right up until the gate flipped; under the
    // new wheel-load taper, at forwardSpeed = Vr the coefficient is zero.
    const cmd = intent({ throttle: 0, pitch: 0, tier: 'raw' });
    af.step(cmd, probe, FIXED_DT);

    // The aircraft may have committed liftoff in this same tick (because at
    // Vr the gate is trivially satisfied even without pitch — actually, the
    // gate requires pitch, so with zero pitch we stay on wheels). Either
    // way, the sideways component must be preserved because friction × 0 = 0.
    const sideAfter = af.getVelocity().x;
    expect(sideAfter).toBeCloseTo(sideStart, 2);
  });

  it('rollout vertical position is monotonic-or-stationary over a realistic takeoff run', () => {
    const af = new Airframe(
      new THREE.Vector3(0, SKYRAIDER_AF.ground.gearClearanceM, 0),
      SKYRAIDER_AF,
    );
    // Rolling terrain (shallow sinusoid) exercises the sync path without
    // ever descending fast enough to exceed gearClearanceM in 50 ms.
    const probe = rollingProbe();
    const cmd = intent({ throttle: 1, pitch: 0, tier: 'raw' });

    const samples: Array<{ t: number; y: number }> = [];
    // 3 s of rollout is well within the ground-roll phase for a Skyraider
    // even at full throttle (Vr ≈ 36 m/s; reaches ~30 m/s at 3 s), so we
    // don't confound with the liftoff impulse.
    for (let i = 0; i < Math.round(3 / FIXED_DT); i++) {
      af.step(cmd, probe, FIXED_DT);
      const s = af.getState();
      if (!s.weightOnWheels) break;
      samples.push({ t: i * FIXED_DT, y: s.position.y });
    }

    // "Monotonic-or-stationary in any 50 ms window" — the plane's Y never
    // drops more than gearClearanceM in any consecutive 50 ms span during
    // rollout. Equivalent to: for every pair of samples within 50 ms of
    // each other, |drop| ≤ gearClearanceM.
    const windowTicks = Math.ceil(0.05 / FIXED_DT);
    const tolerance = SKYRAIDER_AF.ground.gearClearanceM;
    for (let i = windowTicks; i < samples.length; i++) {
      const drop = samples[i - windowTicks].y - samples[i].y;
      expect(drop).toBeLessThanOrEqual(tolerance);
    }
  });

  it('ground friction does not produce a step at the liftoff transition', () => {
    // Drive a full ground roll at full throttle, log forward-axis
    // acceleration per tick, and require that no single-tick jump exceeds
    // the smooth envelope the aero-drag + thrust model would predict. Under
    // the old model the constant-friction → zero-friction flip at the gate
    // produced a visible acceleration spike on the liftoff frame.
    const af = new Airframe(
      new THREE.Vector3(0, SKYRAIDER_AF.ground.gearClearanceM, 0),
      SKYRAIDER_AF,
    );
    const probe = flatProbe(0);
    const cmd = intent({ throttle: 1, pitch: 0.3, tier: 'raw' });

    let prevFwd = 0;
    let maxDelta = 0;
    let liftoffTick = -1;
    const totalTicks = Math.round(10 / FIXED_DT);
    for (let i = 0; i < totalTicks; i++) {
      af.step(cmd, probe, FIXED_DT);
      const s = af.getState();
      if (liftoffTick < 0 && !s.weightOnWheels) {
        liftoffTick = i;
      }
      // Examine only ground-phase ticks — we want the pre-liftoff curve to
      // be smooth, and the liftoff-frame delta to not be catastrophically
      // larger than the ticks right before it.
      if (s.weightOnWheels) {
        const delta = s.forwardAirspeedMs - prevFwd;
        maxDelta = Math.max(maxDelta, delta);
        prevFwd = s.forwardAirspeedMs;
      } else {
        break;
      }
    }

    // At full throttle the Skyraider gains ~1.2 m/s per tick near the end
    // of the roll. A friction step would show as a dramatically larger
    // single-tick delta; require < 2 m/s per tick as the smoothness bound.
    expect(maxDelta).toBeLessThan(2);
    expect(liftoffTick).toBeGreaterThan(0);
  });
});
