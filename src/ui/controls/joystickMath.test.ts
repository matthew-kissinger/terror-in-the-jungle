import { describe, expect, it } from 'vitest';
import { applyDeadZone } from './joystickMath';

describe('applyDeadZone', () => {
  it('zeroes input below dead zone', () => {
    const result = applyDeadZone(0.05, 0.05, 0.1);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('zeroes input at exactly zero', () => {
    const result = applyDeadZone(0, 0, 0.1);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('remaps input above dead zone to start from 0', () => {
    const result = applyDeadZone(0.1, 0, 0.1);
    // magnitude=0.1 == deadZone, so should be at the boundary (very small)
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBe(0);
  });

  it('preserves full-deflection direction at magnitude 1', () => {
    const result = applyDeadZone(1, 0, 0.1);
    expect(result.x).toBeCloseTo(1, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });

  it('preserves direction of input', () => {
    const result = applyDeadZone(-0.5, 0.5, 0.1);
    expect(result.x).toBeLessThan(0);
    expect(result.y).toBeGreaterThan(0);
    // Input has equal magnitude in both axes, output should too
    expect(result.x).toBeCloseTo(-result.y, 5);
  });

  it('mid-range input is remapped proportionally', () => {
    const deadZone = 0.1;
    const input = 0.55; // halfway through [0.1, 1.0]
    const result = applyDeadZone(input, 0, deadZone);
    const expected = (input - deadZone) / (1 - deadZone);
    expect(result.x).toBeCloseTo(expected, 5);
    expect(result.y).toBeCloseTo(0, 5);
  });
});
