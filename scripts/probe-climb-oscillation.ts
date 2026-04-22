/**
 * Probe: hands-off climb at full throttle for A-1 Skyraider.
 *
 * Measures vertical-speed oscillation (peak-to-peak amplitude and RMS) over
 * 30 s to characterize the phugoid mode. Exit: JSON dump.
 *
 * Usage:
 *   npx tsx scripts/probe-climb-oscillation.ts [label]
 */

import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Airframe } from '../src/systems/vehicle/airframe/Airframe';
import type { AirframeIntent, AirframeTerrainProbe } from '../src/systems/vehicle/airframe/types';
import { FIXED_WING_CONFIGS } from '../src/systems/vehicle/FixedWingConfigs';
import { airframeConfigFromLegacy } from '../src/systems/vehicle/FixedWingTypes';

const FIXED_DT = 1 / 60;
const SKYRAIDER_AF = airframeConfigFromLegacy(FIXED_WING_CONFIGS.A1_SKYRAIDER.physics);

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

function runClimbProbe(label: string): void {
  // Start airborne at 100 m, forward speed = v2Speed (above stall, in a
  // healthy climb-capable regime), wings level.
  const startY = 100;
  const af = new Airframe(new THREE.Vector3(0, startY, 0), SKYRAIDER_AF);
  af.resetAirborne(
    new THREE.Vector3(0, startY, 0),
    new THREE.Quaternion(),
    SKYRAIDER_AF.aero.v2SpeedMs,
    0,
    startY - SKYRAIDER_AF.ground.gearClearanceM - 100,
  );
  const probe = flatProbe(startY - SKYRAIDER_AF.ground.gearClearanceM - 100);
  // Hands off (pitch=0), full throttle, RAW tier so altitude hold PD doesn't engage.
  const cmd = intent({ throttle: 1, pitch: 0, tier: 'raw' });

  const durationSec = 30;
  const ticks = Math.round(durationSec / FIXED_DT);
  const vs: number[] = [];
  const alt: number[] = [];
  const pitchDeg: number[] = [];

  for (let i = 0; i < ticks; i++) {
    af.step(cmd, probe, FIXED_DT);
    const s = af.getState();
    vs.push(s.verticalSpeedMs);
    alt.push(s.position.y);
    pitchDeg.push(s.pitchDeg);
  }

  // Trim the first 2 s so we're past the initial trim transient.
  const skip = Math.round(2 / FIXED_DT);
  const vsTrim = vs.slice(skip);
  const altTrim = alt.slice(skip);

  const vsMin = Math.min(...vsTrim);
  const vsMax = Math.max(...vsTrim);
  const vsMean = vsTrim.reduce((a, b) => a + b, 0) / vsTrim.length;
  const vsRms = Math.sqrt(
    vsTrim.reduce((a, b) => a + (b - vsMean) ** 2, 0) / vsTrim.length,
  );

  const altMin = Math.min(...altTrim);
  const altMax = Math.max(...altTrim);

  const out = {
    label,
    durationSec,
    skipSec: 2,
    vsMin,
    vsMax,
    vsPeakToPeak: vsMax - vsMin,
    vsMean,
    vsRms,
    altStart: alt[0],
    altEnd: alt[alt.length - 1],
    altMin,
    altMax,
    altPeakToPeak: altMax - altMin,
  };
  console.log(JSON.stringify(out, null, 2));
  const outPath = resolve(
    'docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airframe-climb-rate-pitch-damper',
    `probe-${label}.json`,
  );
  writeFileSync(outPath, JSON.stringify(out, null, 2));
}

function runCruiseStepProbe(label: string): void {
  // Measure cruise pitch responsiveness: step input to +0.5 elevator at t=0,
  // measure time to reach 10 deg pitch (target from task brief). Probe runs
  // short enough (2 s) that vy stays near zero — the damping boost is tied
  // to vy > 0, so this isolates cruise-regime pitch authority.
  const startY = 500;
  const af = new Airframe(new THREE.Vector3(0, startY, 0), SKYRAIDER_AF);
  af.resetAirborne(
    new THREE.Vector3(0, startY, 0),
    new THREE.Quaternion(),
    SKYRAIDER_AF.aero.v2SpeedMs * 1.3, // cruise-ish
    0,
    startY - 500,
  );
  const probe = flatProbe(startY - 500);

  const durationSec = 2;
  const ticks = Math.round(durationSec / FIXED_DT);
  const pitchDeg: number[] = [];
  const vy: number[] = [];
  // Constant +0.5 elevator (moderate up) for the whole window.
  const cmd = intent({ throttle: 0.5, pitch: 0.5, tier: 'raw' });

  for (let i = 0; i < ticks; i++) {
    af.step(cmd, probe, FIXED_DT);
    const s = af.getState();
    pitchDeg.push(s.pitchDeg);
    vy.push(s.verticalSpeedMs);
  }

  const peak = Math.max(...pitchDeg);
  const target10 = 10;
  let tTo10 = -1;
  for (let i = 0; i < pitchDeg.length; i++) {
    if (pitchDeg[i] >= target10) {
      tTo10 = i * FIXED_DT;
      break;
    }
  }

  const out = {
    label,
    durationSec,
    peakPitchDeg: peak,
    timeTo10DegSec: tTo10,
    finalPitchDeg: pitchDeg[pitchDeg.length - 1],
    vyAtEnd: vy[vy.length - 1],
  };
  console.log(JSON.stringify(out, null, 2));
  const outPath = resolve(
    'docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airframe-climb-rate-pitch-damper',
    `probe-cruise-step-${label}.json`,
  );
  writeFileSync(outPath, JSON.stringify(out, null, 2));
}

const label = process.argv[2] ?? 'unlabeled';
runClimbProbe(label);
runCruiseStepProbe(label);
