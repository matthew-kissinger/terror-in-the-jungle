/**
 * Validator behavior tests — pure, no runner, no engine.
 * A failing validator returns status='fail' and a human message suitable
 * for a CI log.
 */

import { describe, it, expect } from 'vitest';
import { evaluateValidator, overallStatus } from '../validators';
import type { ScenarioObservationState } from '../types';

function state(p: Partial<ScenarioObservationState> = {}): ScenarioObservationState {
  return {
    shotsFired: 0,
    engagements: 0,
    distanceTraversedM: 0,
    maxStuckSeconds: 0,
    ticks: 0,
    elapsedMs: 0,
    ...p,
  };
}

describe('evaluateValidator', () => {
  it('min-shots passes when shotsFired >= count', () => {
    const r = evaluateValidator({ kind: 'min-shots', count: 10 }, state({ shotsFired: 12 }));
    expect(r.status).toBe('pass');
    expect(r.actual).toBe(12);
    expect(r.threshold).toBe(10);
  });

  it('min-shots fails with an actionable message when shotsFired < count', () => {
    const r = evaluateValidator({ kind: 'min-shots', count: 50 }, state({ shotsFired: 0 }));
    expect(r.status).toBe('fail');
    expect(r.message).toMatch(/shotsFired=0/);
    expect(r.message).toMatch(/< 50/);
  });

  it('min-engagements fails when scenario did not exercise combat', () => {
    const r = evaluateValidator({ kind: 'min-engagements', count: 3 }, state({ engagements: 0 }));
    expect(r.status).toBe('fail');
    expect(r.message).toMatch(/did not exercise combat/);
  });

  it('min-distance-traversed-m detects a stationary player', () => {
    const r = evaluateValidator(
      { kind: 'min-distance-traversed-m', meters: 40 },
      state({ distanceTraversedM: 1 }),
    );
    expect(r.status).toBe('fail');
    expect(r.message).toMatch(/hardly moved/);
  });

  it('max-stuck-seconds fails when player is stuck too long', () => {
    const r = evaluateValidator(
      { kind: 'max-stuck-seconds', seconds: 5 },
      state({ maxStuckSeconds: 11.5 }),
    );
    expect(r.status).toBe('fail');
    expect(r.actual).toBeCloseTo(11.5, 1);
    expect(r.message).toMatch(/stuck too long/);
  });
});

describe('overallStatus', () => {
  it('passes only if every validator passes', () => {
    expect(overallStatus([
      { id: 'a', kind: 'min-shots', status: 'pass', actual: 1, threshold: 0, message: '' },
      { id: 'b', kind: 'min-engagements', status: 'pass', actual: 1, threshold: 0, message: '' },
    ])).toBe('pass');
  });

  it('fails if any validator fails', () => {
    expect(overallStatus([
      { id: 'a', kind: 'min-shots', status: 'pass', actual: 1, threshold: 0, message: '' },
      { id: 'b', kind: 'min-engagements', status: 'fail', actual: 0, threshold: 1, message: '' },
    ])).toBe('fail');
  });
});
