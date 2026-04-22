/**
 * Pose-continuity probe for the helicopter-interpolated-pose task.
 *
 * Helicopter analogue of cycle-2026-04-22-flight-rebuild-overnight/
 * evidence/player-controller-interpolated-pose/probe.mts.
 *
 * Runs HelicopterPhysics at its native 1/60 s fixed step, drives it with a
 * steady full-collective + small cyclic command, and samples the pose every
 * render frame at a 1/144 s render cadence. Records two traces:
 *
 *   before: raw physics pose (what PlayerController used to receive).
 *   after : interpolated pose (what it receives now).
 *
 * The "before" trace exhibits a sawtooth — long runs of zero-delta frames
 * between fixed steps separated by big jumps on the frames that fire a
 * step. The "after" trace is smooth.
 *
 * Run with: `npx tsx docs/cycles/cycle-2026-04-22-heap-and-polish/evidence/helicopter-interpolated-pose/probe.mts`
 */

import * as THREE from 'three';
import { HelicopterPhysics } from '../../../../../src/systems/helicopter/HelicopterPhysics';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RENDER_DT = 1 / 144;
const WARMUP_STEPS = 60;
const SAMPLE_FRAMES = 240;
const TERRAIN_HEIGHT = 0;

function runTrace(useInterpolated: boolean): {
  samples: Array<{ frame: number; y: number; delta: number }>;
  summary: { zeroDeltaFrames: number; meanAbsDelta: number; stddevAbsDelta: number; relStddev: number };
} {
  const physics = new HelicopterPhysics(new THREE.Vector3(0, 60, 0));
  physics.setControls({
    collective: 1.0,
    cyclicPitch: 0,
    cyclicRoll: 0,
    yaw: 0,
    engineBoost: false,
    autoHover: false,
  });

  // Warm up with physics-dt so engine spool and smoothing settle.
  for (let i = 0; i < WARMUP_STEPS; i++) {
    physics.update(1 / 60, TERRAIN_HEIGHT);
  }

  const readY = () =>
    useInterpolated
      ? physics.getInterpolatedState().position.y
      : physics.getState().position.y;

  const samples: Array<{ frame: number; y: number; delta: number }> = [];
  let prevY = readY();

  for (let frame = 0; frame < SAMPLE_FRAMES; frame++) {
    physics.update(RENDER_DT, TERRAIN_HEIGHT);
    const y = readY();
    const delta = y - prevY;
    samples.push({ frame, y, delta });
    prevY = y;
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
    task: 'helicopter-interpolated-pose',
    cycle: 'cycle-2026-04-22-heap-and-polish',
    physicsDt: 1 / 60,
    renderDt: RENDER_DT,
    warmupPhysicsSteps: WARMUP_STEPS,
    sampleFrames: SAMPLE_FRAMES,
    aircraft: 'HelicopterPhysics default (UH-1 class)',
    scenario: 'vertical climb at full collective, neutral cyclic/yaw, autoHover off',
  },
  before: {
    source: 'physics.getState().position — raw physics (pre-fix behavior)',
    summary: before.summary,
    samples: before.samples,
  },
  after: {
    source: 'physics.getInterpolatedState().position — fixed feed',
    summary: after.summary,
    samples: after.samples,
  },
  diagnosis: {
    zeroDeltaReduction: before.summary.zeroDeltaFrames - after.summary.zeroDeltaFrames,
    relStddevReduction: before.summary.relStddev - after.summary.relStddev,
    note:
      'before.zeroDeltaFrames counts render frames where the physics accumulator did not cross a 1/60 boundary (raw pose repeated). after.zeroDeltaFrames counts stalls in the smoothly interpolated pose (target 0).',
  },
};

writeFileSync(resolve(here, 'pose-continuity.json'), JSON.stringify(payload, null, 2));
console.log('summary:', {
  before: before.summary,
  after: after.summary,
});
console.log('wrote:', resolve(here, 'pose-continuity.json'));
