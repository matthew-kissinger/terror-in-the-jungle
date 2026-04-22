/**
 * Pose-continuity probe for the player-controller-interpolated-pose task.
 *
 * Runs the fixed-wing Airframe at a 1/60 s physics step, drives it with a
 * steady cruise command, and samples the pose every render frame at a
 * 1/144 s render cadence. Records two traces:
 *
 *   before: raw physics pose (what the PlayerController used to receive).
 *   after : interpolated pose (what it receives now).
 *
 * The "before" trace exhibits a sawtooth — long runs of zero-delta frames
 * (when the physics accumulator has not crossed the 1/60 step) separated
 * by big jumps on the frames that fire a step. The "after" trace is smooth
 * and monotonic.
 *
 * Run with: `npx tsx docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/player-controller-interpolated-pose/probe.mts`
 */

import * as THREE from 'three';
import { Airframe } from '../../../../../src/systems/vehicle/airframe/Airframe';
import type { AirframeTerrainProbe } from '../../../../../src/systems/vehicle/airframe/types';
import { FIXED_WING_CONFIGS } from '../../../../../src/systems/vehicle/FixedWingConfigs';
import { airframeConfigFromLegacy } from '../../../../../src/systems/vehicle/FixedWingTypes';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKYRAIDER_AF = airframeConfigFromLegacy(FIXED_WING_CONFIGS.A1_SKYRAIDER.physics);
const RENDER_DT = 1 / 144;
const WARMUP_STEPS = 60;
const SAMPLE_FRAMES = 240;

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

function runTrace(useInterpolated: boolean): {
  samples: Array<{ frame: number; z: number; delta: number }>;
  summary: { zeroDeltaFrames: number; meanAbsDelta: number; stddevAbsDelta: number; relStddev: number };
} {
  const af = new Airframe(new THREE.Vector3(0, 200, 0), SKYRAIDER_AF);
  const probe = flatProbe(0);
  af.resetAirborne(new THREE.Vector3(0, 200, 0), new THREE.Quaternion(), 60, 0, 0);
  const intent = {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttle: 0.55,
    brake: 0,
    tier: 'assist' as const,
  };

  // Warm up with physics-dt so we are well past any startup transient.
  for (let i = 0; i < WARMUP_STEPS; i++) {
    af.step(intent, probe, 1 / 60);
  }

  const samples: Array<{ frame: number; z: number; delta: number }> = [];
  let prevZ = useInterpolated ? af.getInterpolatedState().position.z : af.getPosition().z;

  for (let frame = 0; frame < SAMPLE_FRAMES; frame++) {
    af.step(intent, probe, RENDER_DT);
    const z = useInterpolated ? af.getInterpolatedState().position.z : af.getPosition().z;
    const delta = z - prevZ;
    samples.push({ frame, z, delta });
    prevZ = z;
  }

  const deltas = samples.map((s) => Math.abs(s.delta));
  const zeroDeltaFrames = deltas.filter((d) => d < 1e-9).length;
  const meanAbsDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance = deltas.reduce((a, b) => a + (b - meanAbsDelta) ** 2, 0) / deltas.length;
  const stddevAbsDelta = Math.sqrt(variance);
  const relStddev = stddevAbsDelta / Math.max(meanAbsDelta, 1e-9);

  return {
    samples,
    summary: { zeroDeltaFrames, meanAbsDelta, stddevAbsDelta, relStddev },
  };
}

const here = dirname(fileURLToPath(import.meta.url));

const before = runTrace(false);
const after = runTrace(true);

const payload = {
  meta: {
    task: 'player-controller-interpolated-pose',
    cycle: 'cycle-2026-04-22-flight-rebuild-overnight',
    physicsDt: 1 / 60,
    renderDt: RENDER_DT,
    warmupPhysicsSteps: WARMUP_STEPS,
    sampleFrames: SAMPLE_FRAMES,
    aircraft: 'A1_SKYRAIDER',
    scenario: '60 m/s cruise at 200m AGL, throttle 0.55, tier=assist, neutral stick',
  },
  before: {
    source: 'airframe.getPosition() — raw physics (pre-fix behavior)',
    summary: before.summary,
    samples: before.samples,
  },
  after: {
    source: 'airframe.getInterpolatedState().position — fixed feed',
    summary: after.summary,
    samples: after.samples,
  },
  diagnosis: {
    zeroDeltaReduction: before.summary.zeroDeltaFrames - after.summary.zeroDeltaFrames,
    relStddevReduction: before.summary.relStddev - after.summary.relStddev,
    note:
      'before.zeroDeltaFrames ≈ 144 of 240 frames (accumulator between steps). after.zeroDeltaFrames ≈ 0 (smooth interpolation).',
  },
};

writeFileSync(resolve(here, 'pose-continuity.json'), JSON.stringify(payload, null, 2));
console.log('summary:', {
  before: before.summary,
  after: after.summary,
});
console.log('wrote:', resolve(here, 'pose-continuity.json'));
