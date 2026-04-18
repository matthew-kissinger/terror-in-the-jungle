/**
 * Perf-harness module entry. Load lazily from `src/core/bootstrap.ts` only
 * when `VITE_PERF_HARNESS === '1'` so retail bundles exclude the harness
 * surface entirely (see docs/tasks/perf-harness-architecture.md).
 */

export type {
  ScenarioConfig,
  ScenarioMode,
  ActionPolicyConfig,
  SpawnPolicyConfig,
  ValidatorConfig,
  ValidatorResult,
  ScenarioRunResult,
  ScenarioObservationState,
  ActionPolicy,
} from './types';

export { hashSeed } from './types';

export { runScenario, accumulateObservation } from './runner';
export type { AgentLike, RunnerOptions } from './runner';

export { createPolicy } from './policies';
export { resolveSpawnPoint } from './spawn-policies';
export { evaluateValidator, overallStatus } from './validators';
export { findScenario, listScenarioIds, SCENARIOS } from './scenarios';
