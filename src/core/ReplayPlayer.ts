/**
 * ReplayPlayer — drive a tick-based sim from a captured replay blob, then
 * compare the replayed final state to the recorded one within tolerance.
 *
 * This is infrastructure; the caller supplies a `SimHarness` that knows how
 * to advance its own sim one tick given an input frame and how to snapshot
 * its final state. ReplayPlayer opens a SeededRandom session, feeds inputs
 * in tick order, closes the session, then diffs snapshots.
 *
 * Tolerance defaults match the C2 brief:
 *   - position: < 0.1 m
 *   - attitude: < 1 deg
 *   - health:   < 1 HP
 *
 * Single-machine only — cross-machine determinism is not a goal.
 */

import { SeededRandom } from './SeededRandom';
import type { ReplayBlob, ReplayStateSnapshot, ReplayStateSnapshotEntity } from './ReplayRecorder';

interface ReplayTolerance {
  positionEpsilonM: number;
  attitudeEpsilonDeg: number;
  healthEpsilonHp: number;
}

export const DEFAULT_REPLAY_TOLERANCE: ReplayTolerance = {
  positionEpsilonM: 0.1,
  attitudeEpsilonDeg: 1,
  healthEpsilonHp: 1,
};

/** Caller-owned sim adapter. Kept structural so tests and real engines both fit. */
export interface SimHarness<I> {
  /** Apply the input for `tick` and advance sim state by one tick. */
  step(tick: number, input: I): void;
  /** Produce a final-state snapshot for comparison. */
  snapshot(): ReplayStateSnapshot;
}

interface ReplayConvergenceReport {
  ok: boolean;
  tickCount: number;
  positionMaxErrM: number;
  attitudeMaxErrDeg: number;
  healthMaxErrHp: number;
  /** Non-empty when ok === false. One entry per violation. */
  failures: string[];
}

export class ReplayPlayer {
  /**
   * Play back a replay against a harness and return whether the resulting
   * snapshot matches the recorded one within tolerance.
   */
  static play<I>(
    blob: ReplayBlob<I>,
    harness: SimHarness<I>,
    tolerance: ReplayTolerance = DEFAULT_REPLAY_TOLERANCE,
  ): ReplayConvergenceReport {
    if (blob.format !== 'replay-v1') {
      throw new Error(`ReplayPlayer: unsupported blob format ${blob.format}`);
    }

    SeededRandom.beginSession(blob.seed);
    try {
      for (const frame of blob.inputs) {
        harness.step(frame.tick, frame.input);
      }
    } finally {
      SeededRandom.endSession();
    }

    const replayedSnapshot = harness.snapshot();
    return ReplayPlayer.compare(blob.finalState, replayedSnapshot, tolerance);
  }

  /**
   * Compare two snapshots entity-by-entity and produce a structured report.
   * Public so callers can fold in their own recorded final states.
   */
  static compare(
    recorded: ReplayStateSnapshot,
    replayed: ReplayStateSnapshot,
    tolerance: ReplayTolerance = DEFAULT_REPLAY_TOLERANCE,
  ): ReplayConvergenceReport {
    const failures: string[] = [];
    let positionMax = 0;
    let attitudeMax = 0;
    let healthMax = 0;

    const recordedById = new Map<string, ReplayStateSnapshotEntity>();
    for (const e of recorded.entities) recordedById.set(e.id, e);

    const replayedById = new Map<string, ReplayStateSnapshotEntity>();
    for (const e of replayed.entities) replayedById.set(e.id, e);

    if (recordedById.size !== replayedById.size) {
      failures.push(
        `entity count mismatch: recorded=${recordedById.size} replayed=${replayedById.size}`,
      );
    }

    for (const [id, rec] of recordedById) {
      const rep = replayedById.get(id);
      if (!rep) {
        failures.push(`missing entity in replay: ${id}`);
        continue;
      }

      const dx = rep.position.x - rec.position.x;
      const dy = rep.position.y - rec.position.y;
      const dz = rep.position.z - rec.position.z;
      const posErr = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (posErr > positionMax) positionMax = posErr;
      if (posErr > tolerance.positionEpsilonM) {
        failures.push(
          `${id} position error ${posErr.toFixed(4)}m exceeds ${tolerance.positionEpsilonM}m`,
        );
      }

      if (rec.attitude && rep.attitude) {
        const attErr = Math.max(
          Math.abs(wrapDeg(rep.attitude.yaw - rec.attitude.yaw)),
          Math.abs(wrapDeg(rep.attitude.pitch - rec.attitude.pitch)),
          Math.abs(wrapDeg(rep.attitude.roll - rec.attitude.roll)),
        );
        if (attErr > attitudeMax) attitudeMax = attErr;
        if (attErr > tolerance.attitudeEpsilonDeg) {
          failures.push(
            `${id} attitude error ${attErr.toFixed(3)}deg exceeds ${tolerance.attitudeEpsilonDeg}deg`,
          );
        }
      }

      if (rec.health !== undefined && rep.health !== undefined) {
        const hpErr = Math.abs(rep.health - rec.health);
        if (hpErr > healthMax) healthMax = hpErr;
        if (hpErr > tolerance.healthEpsilonHp) {
          failures.push(
            `${id} health error ${hpErr.toFixed(2)}HP exceeds ${tolerance.healthEpsilonHp}HP`,
          );
        }
      }
    }

    for (const id of replayedById.keys()) {
      if (!recordedById.has(id)) {
        failures.push(`extra entity in replay: ${id}`);
      }
    }

    return {
      ok: failures.length === 0,
      tickCount: Math.max(recorded.tick, replayed.tick),
      positionMaxErrM: positionMax,
      attitudeMaxErrDeg: attitudeMax,
      healthMaxErrHp: healthMax,
      failures,
    };
  }
}

/** Convert a radian delta to degrees in (-180, 180]. */
function wrapDeg(radDelta: number): number {
  const deg = (radDelta * 180) / Math.PI;
  const wrapped = ((deg + 180) % 360) - 180;
  // ((-180) % 360) === -180 on JS; add a nudge to keep the interval half-open on the upper side.
  return wrapped <= -180 ? wrapped + 360 : wrapped;
}
