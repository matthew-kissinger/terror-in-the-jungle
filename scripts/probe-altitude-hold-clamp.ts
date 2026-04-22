/**
 * Probe harness for the a1-altitude-hold-elevator-clamp task.
 *
 * Drives each fixed-wing aircraft through two scenarios in the assist tier:
 *
 *   1. Recapture-after-pitch-release: spawn at cruise altitude/speed, pitch up
 *      at +0.8 stick for 2 s, release. Measure peak altitude deviation from
 *      the capture altitude over the next 30 s.
 *   2. Hands-off steady-state cruise: spawn at cruise altitude/speed with
 *      neutral stick. Measure peak altitude deviation over 60 s.
 *
 * Probe evaluates the effect of the per-aircraft `altitudeHoldElevatorClamp`
 * added in this task by reading whatever `Airframe` is on disk. To sweep
 * clamp values before committing a winner, temporarily edit the A-1 field in
 * `FixedWingConfigs.ts` and rerun.
 *
 * Usage:
 *   npx tsx scripts/probe-altitude-hold-clamp.ts [label]
 *   (writes probe-<label>.json to the cycle evidence folder)
 */

import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Airframe } from '../src/systems/vehicle/airframe/Airframe';
import type {
  AirframeIntent,
  AirframeTerrainProbe,
} from '../src/systems/vehicle/airframe/types';
import { FIXED_WING_CONFIGS } from '../src/systems/vehicle/FixedWingConfigs';
import { airframeConfigFromLegacy } from '../src/systems/vehicle/FixedWingTypes';

const FIXED_DT = 1 / 60;

type AircraftKey = 'A1_SKYRAIDER' | 'F4_PHANTOM' | 'AC47_SPOOKY';

interface CruiseParams {
  altitudeM: number;
  speedMs: number;
  throttle: number;
}

// Cruise parameters chosen to match the "cruise throttle" language in the
// original PR #126 brief: well above stall, well below max, steady throttle
// that matches the aircraft's typical level-flight regime.
const CRUISE: Record<AircraftKey, CruiseParams> = {
  A1_SKYRAIDER: { altitudeM: 200, speedMs: 55, throttle: 0.55 },
  F4_PHANTOM: { altitudeM: 500, speedMs: 120, throttle: 0.55 },
  AC47_SPOOKY: { altitudeM: 250, speedMs: 52, throttle: 0.55 },
};

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
    tier: 'assist',
    ...overrides,
  };
}

function runRecaptureScenario(key: AircraftKey, clampOverride?: number) {
  const baseCfg = airframeConfigFromLegacy(FIXED_WING_CONFIGS[key].physics);
  const cfg =
    clampOverride !== undefined
      ? {
          ...baseCfg,
          feel: { ...baseCfg.feel, altitudeHoldElevatorClamp: clampOverride },
        }
      : baseCfg;
  const { altitudeM, speedMs, throttle } = CRUISE[key];
  const af = new Airframe(new THREE.Vector3(0, altitudeM, 0), cfg);
  af.resetAirborne(
    new THREE.Vector3(0, altitudeM, 0),
    new THREE.Quaternion(),
    speedMs,
    0,
    0,
  );
  const probe = flatProbe(0);

  // Let the aircraft settle for 1 s with neutral stick so the hold-target is
  // captured and the PD has converged before the disturbance.
  const settleCmd = intent({ throttle, tier: 'assist' });
  for (let i = 0; i < Math.round(1.0 / FIXED_DT); i++) {
    af.step(settleCmd, probe, FIXED_DT);
  }
  const captureAltitude = af.getState().altitude;

  // 2 s of +0.8 pitch (climb-wedge disturbance). This is stronger than the
  // 0.15 nudge in the unit-test regression and is the scenario that exposed
  // the A-1 saturation after PR #126.
  const pitchCmd = intent({ throttle, pitch: 0.8, tier: 'assist' });
  for (let i = 0; i < Math.round(2.0 / FIXED_DT); i++) {
    af.step(pitchCmd, probe, FIXED_DT);
  }

  // Release the stick. Track peak altitude deviation over the next 30 s.
  const releaseCmd = intent({ throttle, tier: 'assist' });
  let maxAbove = 0;
  let maxBelow = 0;
  const durationSec = 30;
  for (let i = 0; i < Math.round(durationSec / FIXED_DT); i++) {
    af.step(releaseCmd, probe, FIXED_DT);
    const delta = af.getState().altitude - captureAltitude;
    if (delta > maxAbove) maxAbove = delta;
    if (delta < maxBelow) maxBelow = delta;
  }
  const endAltitude = af.getState().altitude;

  return {
    aircraft: key,
    scenario: 'recapture',
    captureAltitudeM: captureAltitude,
    endAltitudeM: endAltitude,
    peakAboveM: maxAbove,
    peakBelowM: maxBelow,
    peakDeviationM: Math.max(Math.abs(maxAbove), Math.abs(maxBelow)),
    stalled: af.getState().isStalled,
    clampUsed: cfg.feel.altitudeHoldElevatorClamp ?? 0.15,
  };
}

function runSteadyStateScenario(key: AircraftKey, clampOverride?: number) {
  const baseCfg = airframeConfigFromLegacy(FIXED_WING_CONFIGS[key].physics);
  const cfg =
    clampOverride !== undefined
      ? {
          ...baseCfg,
          feel: { ...baseCfg.feel, altitudeHoldElevatorClamp: clampOverride },
        }
      : baseCfg;
  const { altitudeM, speedMs, throttle } = CRUISE[key];
  const af = new Airframe(new THREE.Vector3(0, altitudeM, 0), cfg);
  af.resetAirborne(
    new THREE.Vector3(0, altitudeM, 0),
    new THREE.Quaternion(),
    speedMs,
    0,
    0,
  );
  const probe = flatProbe(0);

  const cmd = intent({ throttle, tier: 'assist' });
  // 2 s of settle, then measure peak deviation over 60 s.
  for (let i = 0; i < Math.round(2.0 / FIXED_DT); i++) {
    af.step(cmd, probe, FIXED_DT);
  }
  const captureAltitude = af.getState().altitude;

  let maxAbove = 0;
  let maxBelow = 0;
  const durationSec = 60;
  for (let i = 0; i < Math.round(durationSec / FIXED_DT); i++) {
    af.step(cmd, probe, FIXED_DT);
    const delta = af.getState().altitude - captureAltitude;
    if (delta > maxAbove) maxAbove = delta;
    if (delta < maxBelow) maxBelow = delta;
  }

  return {
    aircraft: key,
    scenario: 'steady_state',
    captureAltitudeM: captureAltitude,
    peakAboveM: maxAbove,
    peakBelowM: maxBelow,
    peakDeviationM: Math.max(Math.abs(maxAbove), Math.abs(maxBelow)),
    stalled: af.getState().isStalled,
    clampUsed: cfg.feel.altitudeHoldElevatorClamp ?? 0.15,
  };
}

function parseSweep(): number[] | null {
  const idx = process.argv.indexOf('--sweep-a1');
  if (idx < 0 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1].split(',').map((s) => Number(s.trim()));
}

function main(): void {
  const label = process.argv[2] ?? 'unlabeled';
  const sweep = parseSweep();
  const aircraft: AircraftKey[] = ['A1_SKYRAIDER', 'F4_PHANTOM', 'AC47_SPOOKY'];

  let results: unknown[];
  if (sweep) {
    // A-1 clamp sweep: the non-A-1 aircraft are sampled at their config
    // default so the report documents no-regression.
    const a1Results = sweep.flatMap((clamp) => [
      runRecaptureScenario('A1_SKYRAIDER', clamp),
      runSteadyStateScenario('A1_SKYRAIDER', clamp),
    ]);
    const othersResults = (['F4_PHANTOM', 'AC47_SPOOKY'] as AircraftKey[]).flatMap(
      (key) => [runRecaptureScenario(key), runSteadyStateScenario(key)],
    );
    results = [...a1Results, ...othersResults];
  } else {
    results = aircraft.flatMap((key) => [
      runRecaptureScenario(key),
      runSteadyStateScenario(key),
    ]);
  }

  const summary = {
    label,
    timestamp: new Date().toISOString(),
    sweep: sweep ?? null,
    results,
  };

  const outDir = resolve(
    'docs/cycles/cycle-2026-04-22-heap-and-polish/evidence/a1-altitude-hold-elevator-clamp',
  );
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `probe-${label}.json`);
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nProbe JSON written to ${outPath}`);
}

main();
