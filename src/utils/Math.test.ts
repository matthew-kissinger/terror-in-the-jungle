import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MathUtils } from './Math';

describe('MathUtils', () => {
  describe('lerp', () => {
    it('should return a when t=0', () => {
      expect(MathUtils.lerp(5, 10, 0)).toBe(5);
      expect(MathUtils.lerp(0, 100, 0)).toBe(0);
      expect(MathUtils.lerp(-10, 10, 0)).toBe(-10);
    });

    it('should return b when t=1', () => {
      expect(MathUtils.lerp(5, 10, 1)).toBe(10);
      expect(MathUtils.lerp(0, 100, 1)).toBe(100);
      expect(MathUtils.lerp(-10, 10, 1)).toBe(10);
    });

    it('should return midpoint when t=0.5', () => {
      expect(MathUtils.lerp(0, 10, 0.5)).toBe(5);
      expect(MathUtils.lerp(10, 20, 0.5)).toBe(15);
      expect(MathUtils.lerp(-10, 10, 0.5)).toBe(0);
    });

    it('should interpolate correctly at arbitrary t values', () => {
      expect(MathUtils.lerp(0, 100, 0.25)).toBe(25);
      expect(MathUtils.lerp(0, 100, 0.75)).toBe(75);
      expect(MathUtils.lerp(10, 20, 0.3)).toBeCloseTo(13);
    });

    it('should handle negative values', () => {
      expect(MathUtils.lerp(-10, -5, 0.5)).toBe(-7.5);
      expect(MathUtils.lerp(-100, 100, 0.5)).toBe(0);
    });

    it('should extrapolate beyond [0, 1] range', () => {
      expect(MathUtils.lerp(0, 10, 2)).toBe(20);
      expect(MathUtils.lerp(0, 10, -1)).toBe(-10);
    });
  });

  describe('clamp', () => {
    it('should return value when within bounds', () => {
      expect(MathUtils.clamp(5, 0, 10)).toBe(5);
      expect(MathUtils.clamp(0, 0, 10)).toBe(0);
      expect(MathUtils.clamp(10, 0, 10)).toBe(10);
    });

    it('should clamp to min when value is below min', () => {
      expect(MathUtils.clamp(-5, 0, 10)).toBe(0);
      expect(MathUtils.clamp(-100, -50, 50)).toBe(-50);
    });

    it('should clamp to max when value is above max', () => {
      expect(MathUtils.clamp(15, 0, 10)).toBe(10);
      expect(MathUtils.clamp(100, -50, 50)).toBe(50);
    });

    it('should handle negative ranges', () => {
      expect(MathUtils.clamp(-5, -10, -1)).toBe(-5);
      expect(MathUtils.clamp(-15, -10, -1)).toBe(-10);
      expect(MathUtils.clamp(5, -10, -1)).toBe(-1);
    });

    it('should handle single-value ranges', () => {
      expect(MathUtils.clamp(0, 5, 5)).toBe(5);
      expect(MathUtils.clamp(10, 5, 5)).toBe(5);
    });

    it('should handle zero-inclusive ranges', () => {
      expect(MathUtils.clamp(0, -5, 5)).toBe(0);
      expect(MathUtils.clamp(-3, -5, 5)).toBe(-3);
    });
  });

  describe('smoothstep', () => {
    it('should return 0 when x is at or below edge0', () => {
      expect(MathUtils.smoothstep(0, 10, 0)).toBe(0);
      expect(MathUtils.smoothstep(5, 10, 5)).toBe(0);
      expect(MathUtils.smoothstep(0, 10, -5)).toBe(0);
    });

    it('should return 1 when x is at or above edge1', () => {
      expect(MathUtils.smoothstep(0, 10, 10)).toBe(1);
      expect(MathUtils.smoothstep(0, 10, 15)).toBe(1);
    });

    it('should return 0.5 when x is at midpoint', () => {
      expect(MathUtils.smoothstep(0, 10, 5)).toBeCloseTo(0.5);
      expect(MathUtils.smoothstep(5, 15, 10)).toBeCloseTo(0.5);
    });

    it('should interpolate smoothly between edges', () => {
      // At 25% of the way: hermite polynomial should give ~0.1563
      const val25 = MathUtils.smoothstep(0, 10, 2.5);
      expect(val25).toBeGreaterThan(0);
      expect(val25).toBeLessThan(0.5);

      // At 75% of the way: hermite polynomial should give ~0.8438
      const val75 = MathUtils.smoothstep(0, 10, 7.5);
      expect(val75).toBeGreaterThan(0.5);
      expect(val75).toBeLessThan(1);
    });

    it('should apply hermite curve correctly', () => {
      // Verify the hermite polynomial: y = t^2 * (3 - 2t)
      // At t=0.5: 0.5^2 * (3 - 2*0.5) = 0.25 * 2 = 0.5
      expect(MathUtils.smoothstep(0, 1, 0.5)).toBe(0.5);

      // At t=0.25: 0.25^2 * (3 - 2*0.25) = 0.0625 * 2.5 = 0.15625
      expect(MathUtils.smoothstep(0, 1, 0.25)).toBeCloseTo(0.15625);
    });

    it('should handle negative edge values', () => {
      expect(MathUtils.smoothstep(-10, 0, -10)).toBe(0);
      expect(MathUtils.smoothstep(-10, 0, 0)).toBe(1);
      expect(MathUtils.smoothstep(-10, 0, -5)).toBeCloseTo(0.5);
    });
  });

  describe('randomInRange', () => {
    beforeEach(() => {
      vi.spyOn(Math, 'random');
    });

    it('should return min when Math.random() returns 0', () => {
      vi.mocked(Math.random).mockReturnValue(0);
      expect(MathUtils.randomInRange(0, 10)).toBe(0);
      expect(MathUtils.randomInRange(5, 15)).toBe(5);
      expect(MathUtils.randomInRange(-10, 10)).toBe(-10);
    });

    it('should return max when Math.random() returns 1', () => {
      vi.mocked(Math.random).mockReturnValue(1);
      expect(MathUtils.randomInRange(0, 10)).toBe(10);
      expect(MathUtils.randomInRange(5, 15)).toBe(15);
      expect(MathUtils.randomInRange(-10, 10)).toBe(10);
    });

    it('should return midpoint when Math.random() returns 0.5', () => {
      vi.mocked(Math.random).mockReturnValue(0.5);
      expect(MathUtils.randomInRange(0, 10)).toBe(5);
      expect(MathUtils.randomInRange(10, 20)).toBe(15);
      expect(MathUtils.randomInRange(-10, 10)).toBe(0);
    });

    it('should stay within bounds for random values', () => {
      vi.mocked(Math.random).mockReturnValue(0.25);
      const val = MathUtils.randomInRange(5, 15);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThanOrEqual(15);
    });

    it('should handle negative ranges', () => {
      vi.mocked(Math.random).mockReturnValue(0.5);
      expect(MathUtils.randomInRange(-20, -10)).toBe(-15);
      expect(MathUtils.randomInRange(-100, -50)).toBe(-75);
    });

    it('should produce values across the range with real randomness', () => {
      // Reset mock to use actual Math.random()
      vi.mocked(Math.random).mockRestore();

      const values: number[] = [];
      for (let i = 0; i < 100; i++) {
        values.push(MathUtils.randomInRange(0, 100));
      }

      // Check that we get a range of values
      const min = Math.min(...values);
      const max = Math.max(...values);
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(100);
      expect(max - min).toBeGreaterThan(50); // Should have reasonable spread
    });
  });
});
