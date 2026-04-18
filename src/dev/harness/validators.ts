/**
 * Validators — fail-loud end-of-scenario checks.
 *
 * Each validator consumes the accumulated `ScenarioObservationState` and
 * returns pass/fail with actionable context. A failed validator MUST fail
 * the scenario run outright (never "warn"). The A4 bug from 2026-04-18 got
 * past CI because validator failures were advisory; this module treats them
 * as contractual.
 */

import type {
  ScenarioObservationState,
  ValidatorConfig,
  ValidatorResult,
} from './types';

export function evaluateValidator(
  cfg: ValidatorConfig,
  obs: ScenarioObservationState,
): ValidatorResult {
  switch (cfg.kind) {
    case 'min-shots': {
      const pass = obs.shotsFired >= cfg.count;
      return mkResult(
        cfg,
        obs.shotsFired,
        cfg.count,
        pass,
        pass
          ? `shotsFired=${obs.shotsFired} ≥ ${cfg.count}`
          : `shotsFired=${obs.shotsFired} < ${cfg.count} — player never engaged combat`,
      );
    }
    case 'min-engagements': {
      const pass = obs.engagements >= cfg.count;
      return mkResult(
        cfg,
        obs.engagements,
        cfg.count,
        pass,
        pass
          ? `engagements=${obs.engagements} ≥ ${cfg.count}`
          : `engagements=${obs.engagements} < ${cfg.count} — scenario did not exercise combat`,
      );
    }
    case 'min-distance-traversed-m': {
      const pass = obs.distanceTraversedM >= cfg.meters;
      return mkResult(
        cfg,
        obs.distanceTraversedM,
        cfg.meters,
        pass,
        pass
          ? `distanceTraversedM=${obs.distanceTraversedM.toFixed(1)} ≥ ${cfg.meters}`
          : `distanceTraversedM=${obs.distanceTraversedM.toFixed(1)} < ${cfg.meters} — player hardly moved`,
      );
    }
    case 'max-stuck-seconds': {
      const pass = obs.maxStuckSeconds <= cfg.seconds;
      return mkResult(
        cfg,
        obs.maxStuckSeconds,
        cfg.seconds,
        pass,
        pass
          ? `maxStuckSeconds=${obs.maxStuckSeconds.toFixed(1)} ≤ ${cfg.seconds}`
          : `maxStuckSeconds=${obs.maxStuckSeconds.toFixed(1)} > ${cfg.seconds} — player was stuck too long`,
      );
    }
    default: {
      const _exhaustive: never = cfg;
      throw new Error(`Unknown validator kind: ${String((_exhaustive as { kind?: string }).kind)}`);
    }
  }
}

function mkResult(
  cfg: ValidatorConfig,
  actual: number,
  threshold: number,
  pass: boolean,
  message: string,
): ValidatorResult {
  return {
    id: validatorId(cfg),
    kind: cfg.kind,
    status: pass ? 'pass' : 'fail',
    actual,
    threshold,
    message,
  };
}

function validatorId(cfg: ValidatorConfig): string {
  switch (cfg.kind) {
    case 'min-shots': return `min-shots(${cfg.count})`;
    case 'min-engagements': return `min-engagements(${cfg.count})`;
    case 'min-distance-traversed-m': return `min-distance-traversed-m(${cfg.meters})`;
    case 'max-stuck-seconds': return `max-stuck-seconds(${cfg.seconds})`;
  }
}

export function overallStatus(results: ReadonlyArray<ValidatorResult>): 'pass' | 'fail' {
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fail') return 'fail';
  }
  return 'pass';
}
