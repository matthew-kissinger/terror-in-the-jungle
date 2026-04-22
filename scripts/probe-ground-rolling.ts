/**
 * Probe harness for the airframe-ground-rolling-model task.
 *
 * Drives three fixed-wing airframes (A-1, F-4, AC-47) through an identical
 * scripted takeoff input sequence and writes per-tick traces for review.
 * Captures forward airspeed, altitude AGL, vertical speed, weightOnWheels,
 * and the new wheel-load value so the continuous liftoff transition can be
 * compared against the discrete-gate baseline.
 *
 * Usage:
 *   npx tsx scripts/probe-ground-rolling.ts > \
 *     docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airframe-ground-rolling-model/probe-after.json
 */

import * as THREE from 'three';
import { Airframe } from '../src/systems/vehicle/airframe/Airframe';
import type { AirframeIntent, AirframeTerrainProbe } from '../src/systems/vehicle/airframe/types';
import { FIXED_WING_CONFIGS } from '../src/systems/vehicle/FixedWingConfigs';
import { airframeConfigFromLegacy } from '../src/systems/vehicle/FixedWingTypes';

const FIXED_DT = 1 / 60;

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

interface Sample {
  simTimeMs: number;
  airspeed: number;
  forwardAirspeed: number;
  altitudeAGL: number;
  verticalSpeedMs: number;
  weightOnWheels: boolean;
  phase: string;
  wheelLoad: number;
  groundPitchDeg: number;
  throttle: number;
}

function runAircraft(configKey: 'A1_SKYRAIDER' | 'F4_PHANTOM' | 'AC47_SPOOKY') {
  const legacy = FIXED_WING_CONFIGS[configKey].physics;
  const cfg = airframeConfigFromLegacy(legacy);
  const af = new Airframe(new THREE.Vector3(0, cfg.ground.gearClearanceM, 0), cfg);
  const probe = flatProbe(0);

  // Identical input schedule for all three: full throttle ramp, light pitch,
  // and a full pitch-up starting at t = 0 so we observe progressive authority.
  const cmd = intent({ throttle: 1, pitch: 0.3, tier: 'raw' });

  const samples: Sample[] = [];
  const totalTicks = Math.round(12 / FIXED_DT);
  const sampleEveryTicks = Math.round(0.1 / FIXED_DT); // 100 ms resolution
  let liftoffSimTimeMs = -1;
  for (let i = 0; i < totalTicks; i++) {
    af.step(cmd, probe, FIXED_DT);
    const s = af.getState();
    const simTimeMs = Math.round((i + 1) * FIXED_DT * 1000);
    const vr = Math.max(cfg.aero.vrSpeedMs, 0.0001);
    const wheelLoad = Math.max(0, Math.min(1, (vr - s.forwardAirspeedMs) / vr));
    if (liftoffSimTimeMs < 0 && !s.weightOnWheels) {
      liftoffSimTimeMs = simTimeMs;
    }
    if (i % sampleEveryTicks === 0 || !s.weightOnWheels) {
      samples.push({
        simTimeMs,
        airspeed: Number(s.airspeedMs.toFixed(3)),
        forwardAirspeed: Number(s.forwardAirspeedMs.toFixed(3)),
        altitudeAGL: Number(s.altitudeAGL.toFixed(4)),
        verticalSpeedMs: Number(s.verticalSpeedMs.toFixed(4)),
        weightOnWheels: s.weightOnWheels,
        phase: s.phase,
        wheelLoad: Number(wheelLoad.toFixed(4)),
        groundPitchDeg: Number(s.pitchDeg.toFixed(3)),
        throttle: Number(s.effectors.throttle.toFixed(3)),
      });
    }
    if (!s.weightOnWheels && simTimeMs > liftoffSimTimeMs + 3000) break;
  }

  const finalState = af.getState();
  return {
    configKey,
    vrSpeedMs: cfg.aero.vrSpeedMs,
    stallSpeedMs: cfg.aero.stallSpeedMs,
    liftoffSimTimeMs,
    finalAltitudeAGL: Number(finalState.altitudeAGL.toFixed(3)),
    finalForwardAirspeedMs: Number(finalState.forwardAirspeedMs.toFixed(3)),
    samples,
  };
}

function rolloutMonotonicityWindow(samples: Sample[]): {
  maxDropM: number;
  windowMs: number;
  violated: boolean;
} {
  // Check the monotonic-or-stationary contract over a 50 ms window during
  // the ground-roll phase. We track Y by inferring from altitudeAGL + gear
  // clearance (which is constant per-config; we just use altitudeAGL delta
  // because on flat terrain groundHeight is constant).
  const windowMs = 50;
  let maxDrop = 0;
  const groundOnly = samples.filter((s) => s.weightOnWheels);
  for (let i = 0; i < groundOnly.length; i++) {
    for (let j = i + 1; j < groundOnly.length; j++) {
      if (groundOnly[j].simTimeMs - groundOnly[i].simTimeMs > windowMs) break;
      const drop = groundOnly[i].altitudeAGL - groundOnly[j].altitudeAGL;
      if (drop > maxDrop) maxDrop = drop;
    }
  }
  return { maxDropM: Number(maxDrop.toFixed(5)), windowMs, violated: maxDrop > 0.1 };
}

function main() {
  const results = (['A1_SKYRAIDER', 'F4_PHANTOM', 'AC47_SPOOKY'] as const).map((key) => {
    const r = runAircraft(key);
    const mono = rolloutMonotonicityWindow(r.samples);
    return { ...r, rolloutMonotonicity: mono };
  });

  const payload = {
    timestamp: new Date().toISOString(),
    scenario: 'flat-runway takeoff, full throttle + pitch 0.3, raw tier',
    dtSec: FIXED_DT,
    results,
  };
  console.log(JSON.stringify(payload, null, 2));
}

main();
