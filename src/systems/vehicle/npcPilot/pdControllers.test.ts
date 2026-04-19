import { describe, it, expect } from 'vitest';
import {
  airspeedHold,
  altitudeHold,
  coordinatedYaw,
  headingHold,
  headingToTargetDeg,
  horizontalDistance,
} from './pdControllers';

/**
 * Behavior tests for the NPC pilot's PD controllers. We do NOT assert on gain
 * values or specific numeric outputs — the gains are tuning knobs. Instead we
 * assert monotonic, sign-correct, bounded behavior that survives retuning.
 */

describe('altitudeHold', () => {
  it('commands nose-up when below target', () => {
    const pitch = altitudeHold(200, 100, 0, 0);
    expect(pitch).toBeGreaterThan(0);
  });

  it('commands nose-down when above target', () => {
    const pitch = altitudeHold(100, 200, 0, 0);
    expect(pitch).toBeLessThan(0);
  });

  it('returns zero pitch at target with no vertical motion', () => {
    const pitch = altitudeHold(150, 150, 0, 0);
    expect(Math.abs(pitch)).toBeLessThan(0.05);
  });

  it('output is bounded', () => {
    const huge = altitudeHold(10000, 0, 0, 0);
    expect(huge).toBeGreaterThanOrEqual(-1);
    expect(huge).toBeLessThanOrEqual(1);
  });

  it('damps on climb rate — high vs reduces commanded pitch-up', () => {
    const noClimb = altitudeHold(200, 100, 0, 0);
    const climbing = altitudeHold(200, 100, 20, 0);
    expect(climbing).toBeLessThan(noClimb);
  });
});

describe('headingHold', () => {
  it('commands right bank when target heading is clockwise', () => {
    // current 0, desired 90 → turn right (positive bank)
    const bank = headingHold(90, 0, 0, 0);
    expect(bank).toBeGreaterThan(0);
  });

  it('commands left bank when target heading is counterclockwise', () => {
    const bank = headingHold(270, 0, 0, 0);
    // 270 wraps to -90; expect negative (left) bank
    expect(bank).toBeLessThan(0);
  });

  it('zero output when aligned and level', () => {
    const bank = headingHold(45, 45, 0, 0);
    expect(Math.abs(bank)).toBeLessThan(0.05);
  });

  it('output is bounded', () => {
    const bank = headingHold(180, 0, 0, 0);
    expect(bank).toBeGreaterThanOrEqual(-1);
    expect(bank).toBeLessThanOrEqual(1);
  });

  it('damps on roll rate', () => {
    // Use a modest heading error so neither call saturates the output limit;
    // the rate-damping term must still visibly reduce the command.
    const noRate = headingHold(20, 0, 0, 0);
    const withRate = headingHold(20, 0, 0, 50);
    expect(withRate).toBeLessThan(noRate);
  });
});

describe('airspeedHold', () => {
  it('commands throttle-up when slow', () => {
    const thr = airspeedHold(60, 40);
    expect(thr).toBeGreaterThan(0.5);
  });

  it('commands throttle-down when fast', () => {
    const thr = airspeedHold(60, 80);
    expect(thr).toBeLessThan(0.5);
  });

  it('respects idle floor', () => {
    const thr = airspeedHold(30, 200, 0.4);
    expect(thr).toBeGreaterThanOrEqual(0.4);
  });

  it('output is 0..1', () => {
    expect(airspeedHold(60, 0)).toBeLessThanOrEqual(1);
    expect(airspeedHold(60, 500)).toBeGreaterThanOrEqual(0);
  });
});

describe('coordinatedYaw', () => {
  it('positive roll produces positive yaw', () => {
    expect(coordinatedYaw(30)).toBeGreaterThan(0);
  });

  it('negative roll produces negative yaw', () => {
    expect(coordinatedYaw(-30)).toBeLessThan(0);
  });

  it('zero roll produces zero yaw', () => {
    expect(coordinatedYaw(0)).toBe(0);
  });

  it('output bounded', () => {
    expect(Math.abs(coordinatedYaw(200))).toBeLessThanOrEqual(1);
  });
});

describe('headingToTargetDeg', () => {
  it('target due north (-z) is heading 0', () => {
    expect(headingToTargetDeg(0, -100)).toBeCloseTo(0, 1);
  });

  it('target east (+x) is heading 90', () => {
    expect(headingToTargetDeg(100, 0)).toBeCloseTo(90, 1);
  });

  it('target south (+z) is heading 180', () => {
    expect(headingToTargetDeg(0, 100)).toBeCloseTo(180, 1);
  });

  it('target west (-x) is heading 270', () => {
    expect(headingToTargetDeg(-100, 0)).toBeCloseTo(270, 1);
  });
});

describe('horizontalDistance', () => {
  it('returns zero at same point', () => {
    expect(horizontalDistance(5, 5, 5, 5)).toBe(0);
  });

  it('computes planar distance ignoring y', () => {
    expect(horizontalDistance(0, 0, 3, 4)).toBeCloseTo(5, 5);
  });
});
