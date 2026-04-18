/**
 * Perf-harness declarative config types.
 *
 * This is the schema for scenarios, policies, spawn policies, and validators
 * consumed by `runner.ts`. It replaces the imperative 1755-LOC
 * `scripts/perf-active-driver.js` with declared intent that a single runner
 * can enforce.
 *
 * No `src/types/SystemInterfaces.ts` fence changes — the harness rides on
 * the AgentController surface (`src/systems/agent/`).
 */

import type { AgentAction, AgentObservation, Vec3 } from '../../systems/agent/AgentTypes';
import type { Faction } from '../../systems/combat/types';

export type ScenarioMode = 'ai_sandbox' | 'open_frontier' | 'zone_control' | 'team_deathmatch' | 'a_shau_valley';

export type SpawnPolicyConfig =
  | { kind: 'at-spawn-point' }
  | { kind: 'within-engagement-range'; targetFaction: Faction | 'opfor' | 'blufor'; minDistM: number; maxDistM: number }
  | { kind: 'coords'; position: Vec3; yawRad?: number };

export type ActionPolicyConfig =
  | {
      kind: 'engage-nearest-hostile';
      fireMode?: 'single' | 'burst' | 'hold';
      reengageCooldownMs?: number;
      /** If closer than this, retreat instead of pushing. */
      minStandoffM?: number;
      /** Sprint forward when beyond this distance from target. */
      sprintBeyondM?: number;
    }
  | { kind: 'hold-position'; faceNearestHostile?: boolean }
  | { kind: 'patrol-waypoints'; waypoints: Vec3[]; loop?: boolean }
  | { kind: 'do-nothing' };

export type ValidatorConfig =
  | { kind: 'min-shots'; count: number }
  | { kind: 'min-engagements'; count: number }
  | { kind: 'min-distance-traversed-m'; meters: number }
  | { kind: 'max-stuck-seconds'; seconds: number };

export interface ScenarioObservations {
  frameTimes: boolean;
  aiBudgetOverruns: boolean;
  shotsFired: boolean;
  engagements: boolean;
}

export interface ScenarioConfig {
  id: string;
  map: ScenarioMode;
  npcCount: number;
  durationSec: number;
  warmupSec: number;
  player: {
    spawn: SpawnPolicyConfig;
    policy: ActionPolicyConfig;
    /** String → number hash for SeededRandom. */
    seed: string;
  };
  observe: ScenarioObservations;
  validators: ValidatorConfig[];
}

/** Totals + distributions the runner accumulates during a scenario. */
export interface ScenarioObservationState {
  /** Monotonic total shots fired (observed via ownState ammo deltas). */
  shotsFired: number;
  /** Count of distinct engage transitions (idle → has hostile in firing range). */
  engagements: number;
  /** Horizontal meters travelled by the player over the run. */
  distanceTraversedM: number;
  /** Longest span with near-zero velocity and no firing activity. */
  maxStuckSeconds: number;
  /** Ticks the runner observed. */
  ticks: number;
  /** Wall-clock ms the runner spent in scenario steps. */
  elapsedMs: number;
}

export interface ValidatorResult {
  id: string;
  kind: ValidatorConfig['kind'];
  status: 'pass' | 'fail';
  actual: number;
  threshold: number;
  message: string;
}

export interface ScenarioRunResult {
  scenarioId: string;
  seed: number;
  seedSource: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  observations: ScenarioObservationState;
  validators: ValidatorResult[];
  overall: 'pass' | 'fail';
  /** Replay blob — the runner produces this even on failure. */
  replay?: unknown;
}

/**
 * A pluggable action policy. Tests supply a fake `ObservationFn`; the runner
 * wires in the live AgentController.
 */
export interface ActionPolicy {
  id: string;
  /** Called once before the first tick. */
  reset?(): void;
  /** Called per tick. Returns the action to apply (or null to do nothing). */
  tick(obs: AgentObservation, nowMs: number): AgentAction | null;
}

/** Deterministic hash of a seed string → 32-bit int. */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}
