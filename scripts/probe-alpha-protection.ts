/**
 * Probe harness for the airframe-soft-alpha-protection task.
 *
 * Drives the A-1 Skyraider under a sustained hard-pull scenario (full
 * throttle, elevator held at +0.8 for 60 s after liftoff) and captures the
 * vertical-speed trace. Used to compare alpha-protection ramps (baseline
 * narrow smoothstep vs. widened smoothstep vs. tanh) and measure peak-to-peak
 * vertical oscillation amplitude on a hands-steady-on-the-stick climb.
 *
 * This probe runs against whatever `Airframe` is on disk — re-run it after
 * each edit to capture the variant's trace.
 *
 * Usage:
 *   npx tsx scripts/probe-alpha-protection.ts > \
 *     docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/airframe-soft-alpha-protection/probe-<label>.json
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
  simTimeS: number;
  altitudeAGL: number;
  altitude: number;
  verticalSpeedMs: number;
  forwardAirspeedMs: number;
  aoaDeg: number;
  pitchDeg: number;
  weightOnWheels: boolean;
  phase: string;
  elevatorEffector: number;
}

function run(label: string, scenario: 'hardPull' | 'steadyClimb' = 'hardPull') {
  const cfg = airframeConfigFromLegacy(FIXED_WING_CONFIGS.A1_SKYRAIDER.physics);
  const af = new Airframe(new THREE.Vector3(0, cfg.ground.gearClearanceM, 0), cfg);
  const probe = flatProbe(0);

  // Phase 1: takeoff. Full throttle + light pitch, run until airborne and
  // above 40 m AGL. This gets us into cruise before we apply the test pull.
  const takeoffCmd = intent({ throttle: 1, pitch: 0.3, tier: 'raw' });
  let takeoffTicks = 0;
  const takeoffMaxTicks = Math.round(30 / FIXED_DT);
  while (takeoffTicks < takeoffMaxTicks) {
    af.step(takeoffCmd, probe, FIXED_DT);
    takeoffTicks++;
    const s = af.getState();
    if (!s.weightOnWheels && s.altitudeAGL > 40) break;
  }

  // Phase 2: scripted pitch hold. Two scenarios:
  //   hardPull    — pitch +0.8 for 60 s (stall-protection check)
  //   steadyClimb — pitch +0.3 for 30 s (boundary-limit oscillation test)
  const pullPitch = scenario === 'hardPull' ? 0.8 : 0.3;
  const durationS = scenario === 'hardPull' ? 60 : 30;
  const cmd = intent({ throttle: 1, pitch: pullPitch, tier: 'raw' });
  const totalTicks = Math.round(durationS / FIXED_DT);
  const sampleEveryTicks = Math.round(0.1 / FIXED_DT);
  const samples: Sample[] = [];

  for (let i = 0; i < totalTicks; i++) {
    af.step(cmd, probe, FIXED_DT);
    if (i % sampleEveryTicks !== 0) continue;
    const s = af.getState();
    samples.push({
      simTimeS: i * FIXED_DT,
      altitudeAGL: s.altitudeAGL,
      altitude: s.altitude,
      verticalSpeedMs: s.verticalSpeedMs,
      forwardAirspeedMs: s.forwardAirspeedMs,
      aoaDeg: s.aoaDeg,
      pitchDeg: s.pitchDeg,
      weightOnWheels: s.weightOnWheels,
      phase: s.phase,
      elevatorEffector: s.effectors.elevator,
    });
  }

  // Metrics over the settled part of the pull. Drop the first 2 s (initial
  // pitch-up transient) and also drop any ticks where the aircraft has
  // touched ground (so terrain contact doesn't skew airspeed metrics). Use
  // a tail length appropriate to the scenario — for hardPull, 2..31 s so
  // we see the first phugoid cycle; for steadyClimb, 2..durationS.
  const endLimitS = scenario === 'hardPull' ? 31 : durationS;
  const startIndex = samples.findIndex((s) => s.simTimeS >= 2);
  const endIndex = samples.findIndex((s) => s.simTimeS >= endLimitS);
  const windowed = samples.slice(
    Math.max(0, startIndex),
    endIndex > 0 ? endIndex : samples.length,
  );
  const tail = windowed.filter((s) => !s.weightOnWheels);

  const vsValues = tail.map((s) => s.verticalSpeedMs);
  const vsMean =
    vsValues.reduce((a, b) => a + b, 0) / Math.max(vsValues.length, 1);
  const vsMax = Math.max(...vsValues);
  const vsMin = Math.min(...vsValues);
  const vsPeakToPeak = vsMax - vsMin;
  const vsRMS = Math.sqrt(
    vsValues.reduce((a, b) => a + (b - vsMean) * (b - vsMean), 0) /
      Math.max(vsValues.length, 1),
  );

  // Stall-avoidance check: min forward airspeed during the tail.
  const fwdMin = Math.min(...tail.map((s) => s.forwardAirspeedMs));
  const aoaMax = Math.max(...tail.map((s) => Math.abs(s.aoaDeg)));

  // Did the aircraft stay airborne through the whole window? A hard stall +
  // crash manifests as a sample where weightOnWheels = true in `windowed`.
  const crashedIndex = windowed.findIndex((s) => s.weightOnWheels);
  const stayedAirborne = crashedIndex < 0;
  const crashedAtS = crashedIndex >= 0 ? windowed[crashedIndex].simTimeS : null;

  // Short-window (1 s) peak-to-peak vertical-speed oscillation. This is
  // the signal the boundary-limit oscillator produces most clearly — a
  // high-frequency flap at the alpha boundary, not the long-period phugoid.
  // For each 1 s window we compute max-min and take the median across
  // windows as a robust central estimate.
  const windowSpanS = 1.0;
  const shortWindowPtp: number[] = [];
  for (let i = 0; i < tail.length; i++) {
    const startT = tail[i].simTimeS;
    const endT = startT + windowSpanS;
    const window: number[] = [];
    for (let j = i; j < tail.length && tail[j].simTimeS < endT; j++) {
      window.push(tail[j].verticalSpeedMs);
    }
    if (window.length >= 3) {
      shortWindowPtp.push(Math.max(...window) - Math.min(...window));
    }
  }
  shortWindowPtp.sort((a, b) => a - b);
  const vsPtp1sMedian =
    shortWindowPtp.length > 0
      ? shortWindowPtp[Math.floor(shortWindowPtp.length / 2)]
      : 0;

  // Short-window RMS of alpha. Alpha boundary-chatter is the most direct
  // signature of the oscillator this task targets. Compute alpha RMS across
  // 1 s windows and take the median.
  const alphaPtp1s: number[] = [];
  for (let i = 0; i < tail.length; i++) {
    const startT = tail[i].simTimeS;
    const endT = startT + windowSpanS;
    const window: number[] = [];
    for (let j = i; j < tail.length && tail[j].simTimeS < endT; j++) {
      window.push(Math.abs(tail[j].aoaDeg));
    }
    if (window.length >= 3) {
      alphaPtp1s.push(Math.max(...window) - Math.min(...window));
    }
  }
  alphaPtp1s.sort((a, b) => a - b);
  const alphaPtp1sMedian =
    alphaPtp1s.length > 0 ? alphaPtp1s[Math.floor(alphaPtp1s.length / 2)] : 0;

  return {
    label,
    scenario,
    scenarioDesc: `A-1 Skyraider, flat probe, full throttle + pitch +0.3 takeoff until AGL>40m, then ${durationS} s at pitch +${pullPitch}.`,
    alphaStallDeg: cfg.aero.alphaStallDeg,
    stallSpeedMs: cfg.aero.stallSpeedMs,
    takeoffTicks,
    totalHardPullTicks: totalTicks,
    tailSampleCount: tail.length,
    metrics: {
      vsMean,
      vsMax,
      vsMin,
      vsPeakToPeak,
      vsRMS,
      vsPtp1sMedian,
      alphaPtp1sMedian,
      fwdMin,
      fwdMinAsFractionOfStall: fwdMin / cfg.aero.stallSpeedMs,
      aoaMaxDeg: aoaMax,
      stayedAirborne,
      crashedAtS,
    },
    samples,
  };
}

const label = process.argv[2] || 'current';
const scenario = (process.argv[3] as 'hardPull' | 'steadyClimb') || 'hardPull';
const result = run(label, scenario);
console.log(JSON.stringify(result, null, 2));
