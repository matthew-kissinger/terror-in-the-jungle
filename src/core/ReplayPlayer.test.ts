/**
 * L3 scenario test: 30-second scripted session converges under seeded replay.
 *
 * This exercises the SeededRandom + ReplayRecorder + ReplayPlayer path with a
 * small, representative sim that reads RNG through `SeededRandom.random()`
 * (the same seam the C2 top-20 replacements use). If this converges, the
 * seeded RNG seam is wired correctly and ready for broader adoption.
 */

import { describe, expect, it, afterEach } from 'vitest';
import { SeededRandom } from './SeededRandom';
import { ReplayRecorder, type ReplayStateSnapshot } from './ReplayRecorder';
import { ReplayPlayer, DEFAULT_REPLAY_TOLERANCE, type SimHarness } from './ReplayPlayer';

interface SimEntity {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  health: number;
  wanderPhase: number;
}

interface ScriptedInput {
  fire: boolean;
  moveX: number;
  moveZ: number;
}

const TICK_RATE_HZ = 60;
const DURATION_SEC = 30;
const TICK_COUNT = TICK_RATE_HZ * DURATION_SEC;
const ENTITY_COUNT = 16;

/**
 * Minimal sim that mirrors the shape of combat tick RNG usage:
 * - wander jitter per tick (was Math.random in CombatantFactory)
 * - hit roll gate (was Math.random in CombatantBallistics)
 * - damage roll (was Math.random in CombatantBallistics)
 *
 * All RNG routed through SeededRandom.random(), same as the C2 top-20 sites.
 */
class TestSim implements SimHarness<ScriptedInput> {
  private readonly entities: SimEntity[];
  private tickCount = 0;

  constructor(seed: number) {
    this.entities = [];
    // Seeded initial placement, so spawn positions are deterministic too.
    // Uses a side-channel RNG so it doesn't consume from the tick stream.
    const setupRng = new SeededRandom(seed ^ 0xa5a5a5a5);
    for (let i = 0; i < ENTITY_COUNT; i++) {
      this.entities.push({
        id: `ent-${i}`,
        x: setupRng.random() * 100 - 50,
        y: 0,
        z: setupRng.random() * 100 - 50,
        yaw: setupRng.random() * Math.PI * 2,
        pitch: 0,
        roll: 0,
        health: 100,
        wanderPhase: setupRng.random() * Math.PI * 2,
      });
    }
  }

  step(tick: number, input: ScriptedInput): void {
    const dt = 1 / TICK_RATE_HZ;
    for (const e of this.entities) {
      // Wander jitter: reads ambient SeededRandom via the static drop-in.
      const wanderX = (SeededRandom.random() - 0.5) * 0.3;
      const wanderZ = (SeededRandom.random() - 0.5) * 0.3;
      const vx = input.moveX * 5 + wanderX;
      const vz = input.moveZ * 5 + wanderZ;
      e.x += vx * dt;
      e.z += vz * dt;

      // Yaw drift driven by the wander phase — deterministic trig; no RNG.
      e.wanderPhase += dt * 0.7;
      e.yaw = e.wanderPhase;

      // Hit roll
      if (input.fire && SeededRandom.random() < 0.2) {
        const damage = 10 + SeededRandom.random() * 5;
        e.health = Math.max(0, e.health - damage);
      }
    }
    this.tickCount = tick + 1;
  }

  snapshot(): ReplayStateSnapshot {
    return {
      tick: this.tickCount,
      timeMs: (this.tickCount / TICK_RATE_HZ) * 1000,
      entities: this.entities.map((e) => ({
        id: e.id,
        position: { x: e.x, y: e.y, z: e.z },
        attitude: { yaw: e.yaw, pitch: e.pitch, roll: e.roll },
        health: e.health,
      })),
    };
  }
}

function scriptedInput(tick: number): ScriptedInput {
  return {
    fire: tick % 7 === 0,
    moveX: Math.sin(tick * 0.01),
    moveZ: Math.cos(tick * 0.01),
  };
}

function runRecorded(seed: number): ReturnType<ReplayRecorder<ScriptedInput>['build']> {
  const recorder = new ReplayRecorder<ScriptedInput>({
    seed,
    scenario: 'c2-30s-scripted',
    tickRateHz: TICK_RATE_HZ,
  });

  const sim = new TestSim(seed);
  SeededRandom.beginSession(seed);
  try {
    for (let t = 0; t < TICK_COUNT; t++) {
      const input = scriptedInput(t);
      recorder.recordInput(t, input);
      sim.step(t, input);
    }
  } finally {
    SeededRandom.endSession();
  }
  recorder.recordFinalState(sim.snapshot());
  return recorder.build();
}

describe('30-second seeded replay (C2)', () => {
  afterEach(() => {
    SeededRandom.endSession();
  });

  it('converges within tolerance across record → play', () => {
    const seed = 20260418;
    const blob = runRecorded(seed);
    expect(blob.inputs.length).toBe(TICK_COUNT);

    const replaySim = new TestSim(seed);
    const report = ReplayPlayer.play(blob, replaySim);

    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.positionMaxErrM).toBeLessThanOrEqual(DEFAULT_REPLAY_TOLERANCE.positionEpsilonM);
    expect(report.attitudeMaxErrDeg).toBeLessThanOrEqual(DEFAULT_REPLAY_TOLERANCE.attitudeEpsilonDeg);
    expect(report.healthMaxErrHp).toBeLessThanOrEqual(DEFAULT_REPLAY_TOLERANCE.healthEpsilonHp);
  });

  it('different seeds produce different final states (RNG is actually seeding the sim)', () => {
    const blobA = runRecorded(111);
    const blobB = runRecorded(222);
    // Same scripted inputs, different seed: final positions should diverge.
    const posA = blobA.finalState.entities[0].position;
    const posB = blobB.finalState.entities[0].position;
    const diverged = posA.x !== posB.x || posA.z !== posB.z;
    expect(diverged).toBe(true);
  });

  it('playing back with the wrong seed fails convergence', () => {
    const seed = 12345;
    const blob = runRecorded(seed);
    // Tamper: play against the harness but flip the seed inside the blob.
    const tampered = { ...blob, seed: seed + 1 };
    const replaySim = new TestSim(seed); // initial state still matches recorded
    const report = ReplayPlayer.play(tampered, replaySim);
    expect(report.ok).toBe(false);
  });

  it('records exactly one input per tick for the session duration', () => {
    const blob = runRecorded(42);
    expect(blob.inputs.length).toBe(TICK_COUNT);
    expect(blob.inputs[0].tick).toBe(0);
    expect(blob.inputs[blob.inputs.length - 1].tick).toBe(TICK_COUNT - 1);
  });
});
