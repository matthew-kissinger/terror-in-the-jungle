/**
 * Harness runner — drives one declarative scenario end-to-end.
 *
 * Responsibilities (from docs/tasks/perf-harness-architecture.md):
 *  1. Accept a scenario id or config.
 *  2. Seed RNG, start a replay recorder.
 *  3. Instantiate the action policy and call `tick(obs) → action` each tick.
 *  4. Accumulate observation state (shotsFired, engagements, distanceTraversedM,
 *     maxStuckSeconds).
 *  5. On stop, evaluate validators — `fail` is load-bearing, it is NOT a warn.
 *
 * The runner is engine-agnostic: it accepts an `AgentLike` interface that the
 * production path (`createAgentControllerFromEngine`) and tests (fakes) both
 * satisfy. This is a behavior test seam — see docs/TESTING.md.
 */

import type { AgentAction, AgentObservation } from '../../systems/agent/AgentTypes';
import { SeededRandom } from '../../core/SeededRandom';
import { ReplayRecorder } from '../../core/ReplayRecorder';
import { createPolicy } from './policies';
import {
  hashSeed,
  type ScenarioConfig,
  type ScenarioObservationState,
  type ScenarioRunResult,
} from './types';
import { evaluateValidator, overallStatus } from './validators';
import { findScenario } from './scenarios';

/** Structural subset of AgentController that the runner actually uses. */
export interface AgentLike {
  apply(action: AgentAction): unknown;
  step(): void;
  observe(): AgentObservation;
  release(): void;
}

export interface RunnerClock {
  nowMs(): number;
}

export interface RunnerOptions {
  scenario: string | ScenarioConfig;
  agent: AgentLike;
  clock?: RunnerClock;
  /** Ticks per second at which the runner steps. Default 60 Hz. */
  tickRateHz?: number;
  /** Optional hook called once before the first tick, after seeding RNG. */
  onStart?(cfg: ScenarioConfig): void | Promise<void>;
  /** Optional hook called each tick for perf-capture integration. */
  onTick?(obs: AgentObservation, state: ScenarioObservationState): void;
  /** Optional pluggable wait function. Defaults to `setTimeout`. */
  wait?(ms: number): Promise<void>;
}

const DEFAULT_TICK_HZ = 60;
const STUCK_VELOCITY_THRESHOLD = 0.2; // m/s — very slow or still
const ENGAGEMENT_MIN_DISTANCE_DELTA_M = 0.01;

function defaultClock(): RunnerClock {
  return {
    nowMs: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  };
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveScenario(source: string | ScenarioConfig): ScenarioConfig {
  if (typeof source !== 'string') return source;
  const found = findScenario(source);
  if (!found) {
    throw new Error(`[harness] unknown scenario id "${source}". Known: ${Object.keys(findScenario).join(', ')}`);
  }
  return found;
}

/**
 * Accumulator: incorporates one observation into the running state.
 * Exported for tests — pure function, no engine access.
 *
 * Engagement counting is intentionally coarse: it increments on a
 * 0 → ≥1 transition in the hostile-visible count. If a hostile is
 * continuously visible across the whole run (e.g. a scripted fake world),
 * callers should seed the first observation with no hostiles so the first
 * contact counts.
 */
export function accumulateObservation(
  prev: ScenarioObservationState,
  obs: AgentObservation,
  prevObs: AgentObservation | null,
  tickDtMs: number,
): ScenarioObservationState {
  let shotsFired = prev.shotsFired;
  let engagements = prev.engagements;
  let distanceTraversedM = prev.distanceTraversedM;
  let maxStuckSeconds = prev.maxStuckSeconds;

  // First observation: treat it as the 0-baseline. If hostiles are already
  // visible, count one engagement (player spawned in contact).
  if (!prevObs) {
    if (countHostiles(obs) > 0) engagements++;
  } else {
    // Shots fired: the AgentController lowers magazine on fire; count positive
    // deltas (ignore reload refills which can increase magazine).
    const prevMag = prevObs.ownState.ammoInMag;
    const curMag = obs.ownState.ammoInMag;
    if (curMag < prevMag) shotsFired += prevMag - curMag;

    // Distance: horizontal displacement between ticks. Ignore respawn jumps
    // (> 20 m in one tick), and any tick where prev snapshot says dead.
    if (!prevObs.ownState.isDead) {
      const dx = obs.ownState.position.x - prevObs.ownState.position.x;
      const dz = obs.ownState.position.z - prevObs.ownState.position.z;
      const step = Math.hypot(dx, dz);
      if (step < 20 && step >= ENGAGEMENT_MIN_DISTANCE_DELTA_M) distanceTraversedM += step;
    }

    // Engagements: 0→≥1 transition in hostile visible count.
    const prevHostiles = countHostiles(prevObs);
    const curHostiles = countHostiles(obs);
    if (prevHostiles === 0 && curHostiles > 0) engagements++;
  }

  // Stuck tracking: velocity near zero AND (not engaged in fire) grows the
  // current stuck window. Reset when the player moves meaningfully.
  const speed = Math.hypot(obs.ownState.velocity.x, obs.ownState.velocity.z);
  const isStuck = speed < STUCK_VELOCITY_THRESHOLD && !obs.ownState.isDead;
  const dtSec = Math.max(0, tickDtMs / 1000);
  const newStuckSeconds = isStuck ? (prev.maxStuckSeconds + dtSec) : 0;
  // We want the MAX stuck window, but prev.maxStuckSeconds also holds the max;
  // track both via a running counter. Keep it simple: the accumulator treats
  // `maxStuckSeconds` as the current-run window while a separate max is held
  // in runner state. Callers fold via `accumulateMaxStuck` below.
  // For this pure function, return the rolling window:
  if (!isStuck) {
    // carry forward the max we have, reset rolling window
    maxStuckSeconds = prev.maxStuckSeconds;
  } else {
    maxStuckSeconds = Math.max(prev.maxStuckSeconds, newStuckSeconds);
  }

  return {
    shotsFired,
    engagements,
    distanceTraversedM,
    maxStuckSeconds,
    ticks: prev.ticks + 1,
    elapsedMs: prev.elapsedMs + tickDtMs,
  };
}

function countHostiles(obs: AgentObservation): number {
  let count = 0;
  for (let i = 0; i < obs.visibleEntities.length; i++) {
    const e = obs.visibleEntities[i];
    if (e.kind !== 'combatant' || !e.faction) continue;
    // Any visible entity whose faction alliance differs from ours = hostile.
    if (e.faction !== obs.ownState.faction) count++;
  }
  return count;
}

/**
 * Run a scenario. Returns the typed run result. Does not throw on validator
 * failure — a failed result IS the signal. Throws only on configuration /
 * wiring errors.
 */
export async function runScenario(options: RunnerOptions): Promise<ScenarioRunResult> {
  const cfg = resolveScenario(options.scenario);
  const seed = hashSeed(cfg.player.seed);
  const clock = options.clock ?? defaultClock();
  const wait = options.wait ?? defaultWait;
  const tickHz = options.tickRateHz ?? DEFAULT_TICK_HZ;
  const tickMs = 1000 / tickHz;

  SeededRandom.beginSession(seed);
  const recorder = new ReplayRecorder<AgentAction | { kind: 'noop' }>({
    seed,
    scenario: cfg.id,
    tickRateHz: tickHz,
  });
  const policy = createPolicy(cfg.player.policy);
  policy.reset?.();

  const startedAt = new Date().toISOString();
  const startWall = clock.nowMs();

  if (options.onStart) await options.onStart(cfg);

  let state: ScenarioObservationState = {
    shotsFired: 0,
    engagements: 0,
    distanceTraversedM: 0,
    maxStuckSeconds: 0,
    ticks: 0,
    elapsedMs: 0,
  };
  let prevObs: AgentObservation | null = null;
  let currentStuckSeconds = 0;
  const totalMs = cfg.durationSec * 1000;
  const deadline = startWall + totalMs;
  let tickIndex = 0;

  try {
    while (clock.nowMs() < deadline) {
      const obs = options.agent.observe();
      const action = policy.tick(obs, clock.nowMs());
      if (action) {
        options.agent.apply(action);
        recorder.recordInput(tickIndex, action);
      } else {
        recorder.recordInput(tickIndex, { kind: 'noop' });
      }
      options.agent.step();

      state = accumulateObservation(state, obs, prevObs, tickMs);

      // Maintain the true max-stuck across reset windows independently of
      // the pure accumulator (which resets on motion).
      const speed = Math.hypot(obs.ownState.velocity.x, obs.ownState.velocity.z);
      if (speed < STUCK_VELOCITY_THRESHOLD && !obs.ownState.isDead) {
        currentStuckSeconds += tickMs / 1000;
        if (currentStuckSeconds > state.maxStuckSeconds) {
          state = { ...state, maxStuckSeconds: currentStuckSeconds };
        }
      } else {
        currentStuckSeconds = 0;
      }

      prevObs = obs;
      options.onTick?.(obs, state);
      tickIndex++;
      await wait(tickMs);
    }
  } finally {
    options.agent.release();
    SeededRandom.endSession();
  }

  const endWall = clock.nowMs();
  const endedAt = new Date().toISOString();

  recorder.recordFinalState({
    tick: tickIndex,
    timeMs: endWall - startWall,
    entities: prevObs
      ? [{ id: 'player', position: prevObs.ownState.position, health: prevObs.ownState.healthAbs }]
      : [],
  });

  const validators = cfg.validators.map((v) => evaluateValidator(v, state));
  const overall = overallStatus(validators);

  return {
    scenarioId: cfg.id,
    seed,
    seedSource: cfg.player.seed,
    startedAt,
    endedAt,
    durationMs: endWall - startWall,
    observations: state,
    validators,
    overall,
    replay: recorder.build(),
  };
}
