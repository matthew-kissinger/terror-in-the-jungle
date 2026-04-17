import { describe, it, expect } from 'vitest';
import {
  computeSlopeSpeedMultiplier,
  isWalkableSlope,
  canStepUp,
  computeSlopeSlideVelocity,
  MAX_STEP_HEIGHT,
} from './SlopePhysics';

describe('computeSlopeSpeedMultiplier', () => {
  it('returns full speed on flat terrain', () => {
    expect(computeSlopeSpeedMultiplier(0)).toBe(1.0);
  });

  it('slows the combatant down as slopes get steeper (monotonic penalty)', () => {
    const flat = computeSlopeSpeedMultiplier(0);
    const gentle = computeSlopeSpeedMultiplier(0.1);
    const crawl = computeSlopeSpeedMultiplier(0.35);
    expect(gentle).toBeLessThan(flat);
    expect(crawl).toBeLessThan(gentle);
  });

  it('blocks movement entirely on cliff-steep slopes', () => {
    expect(computeSlopeSpeedMultiplier(0.6)).toBe(0);
    expect(computeSlopeSpeedMultiplier(1.0)).toBe(0);
  });
});

describe('isWalkableSlope', () => {
  it('accepts flat ground', () => {
    expect(isWalkableSlope(0)).toBe(true);
  });

  it('rejects near-vertical slopes', () => {
    expect(isWalkableSlope(1.0)).toBe(false);
  });
});

describe('canStepUp', () => {
  it('accepts small ledge climbs', () => {
    expect(canStepUp(10, 10.3)).toBe(true);
  });

  it('rejects ledges taller than the step limit', () => {
    expect(canStepUp(10, 13)).toBe(false);
    expect(canStepUp(0, MAX_STEP_HEIGHT + 0.01)).toBe(false);
  });

  it('always accepts stepping down', () => {
    expect(canStepUp(10, 8)).toBe(true);
  });
});

describe('computeSlopeSlideVelocity', () => {
  it('produces no slide on flat normals', () => {
    const v = computeSlopeSlideVelocity(0, 0, 8);
    expect(v.x).toBe(0);
    expect(v.z).toBe(0);
  });

  it('points downhill along the slope normal projection', () => {
    const v = computeSlopeSlideVelocity(1, 0, 8);
    expect(v.x).toBeCloseTo(8);
    expect(v.z).toBeCloseTo(0);
  });

  it('normalizes diagonal slide direction so speed magnitude is preserved', () => {
    const v = computeSlopeSlideVelocity(1, 1, 8);
    const len = Math.sqrt(v.x * v.x + v.z * v.z);
    expect(len).toBeCloseTo(8);
  });
});
