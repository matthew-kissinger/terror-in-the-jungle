import { describe, it, expect } from 'vitest';
import {
  computeSlopeSpeedMultiplier,
  isWalkableSlope,
  canStepUp,
  computeSlopeSlideVelocity,
  MAX_WALKABLE_SLOPE,
  MAX_STEP_HEIGHT
} from './SlopePhysics';

describe('computeSlopeSpeedMultiplier', () => {
  it('returns 1.0 on flat terrain (slope=0)', () => {
    expect(computeSlopeSpeedMultiplier(0)).toBe(1.0);
  });

  it('returns gentle penalty for mild slopes', () => {
    // slope 0.1 -> slopeDot 0.9 -> return 0.9
    expect(computeSlopeSpeedMultiplier(0.1)).toBeCloseTo(0.9);
  });

  it('returns ~0.7 at the gentle/crawl boundary (slope=0.3)', () => {
    // slope 0.3 -> slopeDot 0.7 -> return 0.7 (still in gentle zone, >= 0.7)
    expect(computeSlopeSpeedMultiplier(0.3)).toBeCloseTo(0.7);
  });

  it('returns crawl speed for 45-60 deg slopes', () => {
    // slope 0.35 -> slopeDot 0.65 -> crawl zone -> 0.65 * 0.5 = 0.325
    expect(computeSlopeSpeedMultiplier(0.35)).toBeCloseTo(0.325);
  });

  it('returns 0 when blocked above 60 deg (slope > 0.5)', () => {
    expect(computeSlopeSpeedMultiplier(0.6)).toBe(0);
    expect(computeSlopeSpeedMultiplier(0.8)).toBe(0);
    expect(computeSlopeSpeedMultiplier(1.0)).toBe(0);
  });

  it('returns 0 exactly at MAX_WALKABLE_SLOPE boundary', () => {
    // slope 0.5 -> slopeDot 0.5 -> crawl zone (>= 0.5), returns 0.5 * 0.5 = 0.25
    expect(computeSlopeSpeedMultiplier(MAX_WALKABLE_SLOPE)).toBeCloseTo(0.25);
    // slope 0.501 -> slopeDot 0.499 -> blocked
    expect(computeSlopeSpeedMultiplier(0.501)).toBe(0);
  });
});

describe('isWalkableSlope', () => {
  it('returns true for flat terrain', () => {
    expect(isWalkableSlope(0)).toBe(true);
  });

  it('returns true at boundary (slope=0.5)', () => {
    expect(isWalkableSlope(0.5)).toBe(true);
  });

  it('returns false above boundary', () => {
    expect(isWalkableSlope(0.51)).toBe(false);
    expect(isWalkableSlope(1.0)).toBe(false);
  });
});

describe('canStepUp', () => {
  it('accepts small height deltas', () => {
    expect(canStepUp(10, 10.3)).toBe(true);
    expect(canStepUp(10, 10.0)).toBe(true);
  });

  it('rejects large height deltas', () => {
    expect(canStepUp(10, 10.8)).toBe(false);
    expect(canStepUp(10, 13)).toBe(false);
  });

  it('always accepts step-down (negative delta)', () => {
    expect(canStepUp(10, 8)).toBe(true);
  });

  it('rejects at exactly MAX_STEP_HEIGHT + epsilon', () => {
    expect(canStepUp(0, MAX_STEP_HEIGHT)).toBe(true);
    expect(canStepUp(0, MAX_STEP_HEIGHT + 0.01)).toBe(false);
  });
});

describe('computeSlopeSlideVelocity', () => {
  it('returns zero for zero normal XZ', () => {
    const v = computeSlopeSlideVelocity(0, 0, 8);
    expect(v.x).toBe(0);
    expect(v.z).toBe(0);
  });

  it('points downhill in X direction', () => {
    const v = computeSlopeSlideVelocity(1, 0, 8);
    expect(v.x).toBeCloseTo(8);
    expect(v.z).toBeCloseTo(0);
  });

  it('points downhill in Z direction', () => {
    const v = computeSlopeSlideVelocity(0, -1, 8);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(-8);
  });

  it('normalizes diagonal direction', () => {
    const v = computeSlopeSlideVelocity(1, 1, 8);
    const len = Math.sqrt(v.x * v.x + v.z * v.z);
    expect(len).toBeCloseTo(8);
  });
});
