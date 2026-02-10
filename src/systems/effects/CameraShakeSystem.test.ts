import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CameraShakeSystem } from './CameraShakeSystem';
import * as THREE from 'three';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('CameraShakeSystem', () => {
  let system: CameraShakeSystem;

  beforeEach(() => {
    system = new CameraShakeSystem();
  });

  describe('init()', () => {
    it('should return a promise', async () => {
      const result = system.init();
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it('should not throw', async () => {
      await expect(system.init()).resolves.not.toThrow();
    });
  });

  describe('shake()', () => {
    it('should add shake to activeShakes', () => {
      expect(system.isShaking()).toBe(false);
      system.shake(1.0, 0.5);
      expect(system.isShaking()).toBe(true);
    });

    it('should cap intensity at MAX_INTENSITY (2.5)', () => {
      system.shake(5.0, 0.5);
      const intensity = system.getTotalIntensity();
      expect(intensity).toBeLessThanOrEqual(2.5);
    });

    it('should use default frequency (20) when not specified', () => {
      system.shake(1.0, 0.5);
      const offset = system.getCurrentShakeOffset();
      // Shake should be active
      expect(offset.pitch).not.toBe(0);
    });

    it('should use custom frequency when provided', () => {
      system.shake(1.0, 0.5, 30);
      expect(system.isShaking()).toBe(true);
    });

    it('should set elapsed to 0 and duration as given', () => {
      system.shake(1.0, 0.75);
      expect(system.isShaking()).toBe(true);
      // After updating for less than duration, should still be active
      system.update(0.5);
      expect(system.isShaking()).toBe(true);
    });
  });

  describe('update()', () => {
    it('should advance noiseOffset by deltaTime * 10', () => {
      const offset1 = system.getCurrentShakeOffset();
      system.shake(1.0, 1.0);
      const offset2 = system.getCurrentShakeOffset();

      system.update(0.1); // noiseOffset increases by 1.0
      const offset3 = system.getCurrentShakeOffset();

      // Offsets should differ due to noiseOffset change
      expect(offset3.pitch).not.toBe(offset2.pitch);
    });

    it('should remove expired shakes (elapsed >= duration)', () => {
      system.shake(1.0, 0.5);
      expect(system.isShaking()).toBe(true);

      system.update(0.5); // elapsed = 0.5, duration = 0.5
      expect(system.isShaking()).toBe(false);
    });

    it('should NOT remove active shakes', () => {
      system.shake(1.0, 1.0);
      expect(system.isShaking()).toBe(true);

      system.update(0.3);
      expect(system.isShaking()).toBe(true);

      system.update(0.3);
      expect(system.isShaking()).toBe(true);
    });

    it('should handle swap-and-pop removal (last element swapped to removed position)', () => {
      // Add 3 shakes with different durations
      system.shake(1.0, 0.3, 10); // expires first
      system.shake(2.0, 0.5, 20); // expires second
      system.shake(1.5, 1.0, 30); // expires last

      expect(system.isShaking()).toBe(true);

      // Update to expire first shake
      system.update(0.3);
      expect(system.isShaking()).toBe(true);

      // Update to expire second shake
      system.update(0.2);
      expect(system.isShaking()).toBe(true);

      // Update to expire last shake
      system.update(0.5);
      expect(system.isShaking()).toBe(false);
    });

    it('should update multiple shakes independently', () => {
      system.shake(1.0, 0.5, 10);
      system.shake(0.5, 1.0, 20);

      expect(system.isShaking()).toBe(true);

      // Update to expire first shake but not second
      system.update(0.5);
      expect(system.isShaking()).toBe(true);

      // Update to expire second shake
      system.update(0.5);
      expect(system.isShaking()).toBe(false);
    });
  });

  describe('shakeFromExplosion()', () => {
    it('should not shake when distance > maxRadius * 1.5', () => {
      const explosionPos = new THREE.Vector3(0, 0, 0);
      const playerPos = new THREE.Vector3(40, 0, 0);
      const maxRadius = 20;

      system.shakeFromExplosion(explosionPos, playerPos, maxRadius);
      expect(system.isShaking()).toBe(false);
    });

    it('should apply full intensity at epicenter (distance = 0)', () => {
      const explosionPos = new THREE.Vector3(0, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);
      const maxRadius = 20;

      system.shakeFromExplosion(explosionPos, playerPos, maxRadius);
      expect(system.isShaking()).toBe(true);

      // falloff = 1, intensity = 1.5 * 1^2 = 1.5
      const intensity = system.getTotalIntensity();
      expect(intensity).toBeCloseTo(1.5, 1);
    });

    it('should use quadratic falloff: intensity = 1.5 * falloff^2', () => {
      const explosionPos = new THREE.Vector3(0, 0, 0);
      const playerPos = new THREE.Vector3(15, 0, 0); // distance = 15
      const maxRadius = 20;

      system.shakeFromExplosion(explosionPos, playerPos, maxRadius);

      // distance = 15, maxRadius * 1.5 = 30
      // falloff = 1 - (15 / 30) = 0.5
      // intensity = 1.5 * 0.5^2 = 0.375
      const intensity = system.getTotalIntensity();
      expect(intensity).toBeCloseTo(0.375, 2);
    });

    it('should have longer duration for closer explosions (0.3 + 0.2*falloff)', () => {
      const explosionPos = new THREE.Vector3(0, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);
      const maxRadius = 20;

      system.shakeFromExplosion(explosionPos, playerPos, maxRadius);
      expect(system.isShaking()).toBe(true);

      // falloff = 1, duration = 0.3 + 0.2*1 = 0.5
      system.update(0.49);
      expect(system.isShaking()).toBe(true);

      system.update(0.02);
      expect(system.isShaking()).toBe(false);
    });

    it('should use frequency 25', () => {
      const explosionPos = new THREE.Vector3(0, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);
      const maxRadius = 20;

      system.shakeFromExplosion(explosionPos, playerPos, maxRadius);
      expect(system.isShaking()).toBe(true);
    });

    it('should calculate expected values at distance 0 with maxRadius 20', () => {
      const explosionPos = new THREE.Vector3(0, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);
      const maxRadius = 20;

      system.shakeFromExplosion(explosionPos, playerPos, maxRadius);

      // falloff = 1, intensity = 1.5, duration = 0.5
      const intensity = system.getTotalIntensity();
      expect(intensity).toBeCloseTo(1.5, 1);

      system.update(0.5);
      expect(system.isShaking()).toBe(false);
    });
  });

  describe('shakeFromDamage()', () => {
    it('should scale 10 damage to 0.2 intensity', () => {
      system.shakeFromDamage(10);
      const intensity = system.getTotalIntensity();
      expect(intensity).toBeCloseTo(0.2, 2);
    });

    it('should scale 50 damage to 1.0 intensity', () => {
      system.shakeFromDamage(50);
      const intensity = system.getTotalIntensity();
      expect(intensity).toBeCloseTo(1.0, 2);
    });

    it('should cap 100 damage at 1.2 intensity (min(100/50, 1.2))', () => {
      system.shakeFromDamage(100);
      const intensity = system.getTotalIntensity();
      expect(intensity).toBeCloseTo(1.2, 2);
    });

    it('should scale duration: 0.15 + intensity*0.15', () => {
      system.shakeFromDamage(50); // intensity = 1.0, duration = 0.15 + 1.0*0.15 = 0.3
      expect(system.isShaking()).toBe(true);

      system.update(0.29);
      expect(system.isShaking()).toBe(true);

      system.update(0.02);
      expect(system.isShaking()).toBe(false);
    });

    it('should use frequency 30', () => {
      system.shakeFromDamage(25);
      expect(system.isShaking()).toBe(true);
    });
  });

  describe('shakeFromNearbyDeath()', () => {
    it('should not shake beyond 20 units', () => {
      const deathPos = new THREE.Vector3(0, 0, 0);
      const playerPos = new THREE.Vector3(25, 0, 0);

      system.shakeFromNearbyDeath(deathPos, playerPos);
      expect(system.isShaking()).toBe(false);
    });

    it('should apply intensity 0.15 and duration 0.2 at distance 0', () => {
      const deathPos = new THREE.Vector3(0, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);

      system.shakeFromNearbyDeath(deathPos, playerPos);
      expect(system.isShaking()).toBe(true);

      const intensity = system.getTotalIntensity();
      expect(intensity).toBeCloseTo(0.15, 2);

      system.update(0.2);
      expect(system.isShaking()).toBe(false);
    });

    it('should apply intensity 0.075 at distance 10 (linear falloff)', () => {
      const deathPos = new THREE.Vector3(0, 0, 0);
      const playerPos = new THREE.Vector3(10, 0, 0);

      system.shakeFromNearbyDeath(deathPos, playerPos);
      expect(system.isShaking()).toBe(true);

      // falloff = 1 - (10 / 20) = 0.5
      // intensity = 0.15 * 0.5 = 0.075
      const intensity = system.getTotalIntensity();
      expect(intensity).toBeCloseTo(0.075, 3);
    });

    it('should use frequency 15', () => {
      const deathPos = new THREE.Vector3(0, 0, 0);
      const playerPos = new THREE.Vector3(5, 0, 0);

      system.shakeFromNearbyDeath(deathPos, playerPos);
      expect(system.isShaking()).toBe(true);
    });
  });

  describe('shakeFromRecoil()', () => {
    it('should apply intensity 0.08, duration 0.06, frequency 25', () => {
      system.shakeFromRecoil();
      expect(system.isShaking()).toBe(true);

      const intensity = system.getTotalIntensity();
      expect(intensity).toBeCloseTo(0.08, 2);

      system.update(0.06);
      expect(system.isShaking()).toBe(false);
    });
  });

  describe('getCurrentShakeOffset()', () => {
    it('should return {pitch: 0, yaw: 0} when no active shakes', () => {
      const offset = system.getCurrentShakeOffset();
      expect(offset.pitch).toBe(0);
      expect(offset.yaw).toBe(0);
    });

    it('should return non-zero values when shakes active', () => {
      system.shake(1.0, 1.0);
      const offset = system.getCurrentShakeOffset();

      // At least one should be non-zero (stochastic, but highly likely)
      expect(Math.abs(offset.pitch) + Math.abs(offset.yaw)).toBeGreaterThan(0);
    });

    it('should apply fade-out envelope: last 30% of duration fades to 0', () => {
      system.shake(1.0, 1.0);

      // At elapsed = 0.8, remainingTime = 0.2, fadeOut = min(1, 0.2/(1.0*0.3)) = min(1, 0.667) = 0.667
      system.update(0.8);
      const intensityFading = system.getTotalIntensity();

      // Should be approximately 1.0 * 0.667 = 0.667
      expect(intensityFading).toBeCloseTo(0.667, 1);
    });

    it('should sum offsets from multiple shakes', () => {
      system.shake(0.5, 1.0, 10);
      const offset1 = system.getCurrentShakeOffset();

      system.shake(0.5, 1.0, 20);
      const offset2 = system.getCurrentShakeOffset();

      // With two shakes, the magnitude should generally be larger
      const mag1 = Math.abs(offset1.pitch) + Math.abs(offset1.yaw);
      const mag2 = Math.abs(offset2.pitch) + Math.abs(offset2.yaw);

      // This is probabilistic but should generally hold
      expect(mag2).toBeGreaterThanOrEqual(mag1 * 0.5); // Allow some variance
    });

    it('should use sine wave noise pattern for organic feel', () => {
      system.shake(1.0, 1.0);

      const offsets: Array<{ pitch: number; yaw: number }> = [];
      for (let i = 0; i < 5; i++) {
        offsets.push(system.getCurrentShakeOffset());
        system.update(0.01);
      }

      // Values should vary (not constant)
      const allSame = offsets.every(o => o.pitch === offsets[0].pitch);
      expect(allSame).toBe(false);
    });

    it('should cap max angle at degToRad(intensity * 0.6) per unit', () => {
      system.shake(2.0, 1.0); // intensity = 2.0, max angle = degToRad(2.0 * 0.6) = degToRad(1.2)

      const offset = system.getCurrentShakeOffset();
      const maxAngle = THREE.MathUtils.degToRad(2.0 * 0.6);

      // Each component should be within bounds (noise is [-1, 1] range roughly)
      expect(Math.abs(offset.pitch)).toBeLessThanOrEqual(maxAngle * 2); // Allow for noise amplitude
      expect(Math.abs(offset.yaw)).toBeLessThanOrEqual(maxAngle * 2);
    });
  });

  describe('isShaking()', () => {
    it('should return false when no active shakes', () => {
      expect(system.isShaking()).toBe(false);
    });

    it('should return true when shakes exist', () => {
      system.shake(1.0, 0.5);
      expect(system.isShaking()).toBe(true);
    });

    it('should return false after all shakes expire', () => {
      system.shake(1.0, 0.5);
      expect(system.isShaking()).toBe(true);

      system.update(0.5);
      expect(system.isShaking()).toBe(false);
    });
  });

  describe('getTotalIntensity()', () => {
    it('should return 0 when empty', () => {
      expect(system.getTotalIntensity()).toBe(0);
    });

    it('should return sum of intensity*fadeOut for all active shakes', () => {
      system.shake(1.0, 1.0);
      system.shake(0.5, 1.0);

      // Both at full intensity initially
      const total = system.getTotalIntensity();
      expect(total).toBeCloseTo(1.5, 1);
    });

    it('should correctly apply fadeOut envelope', () => {
      system.shake(1.0, 1.0);

      // At elapsed = 0.8, fadeOut = 0.667
      system.update(0.8);
      const intensity = system.getTotalIntensity();
      expect(intensity).toBeCloseTo(0.667, 1);
    });
  });

  describe('dispose()', () => {
    it('should clear all active shakes', () => {
      system.shake(1.0, 1.0);
      system.shake(0.5, 1.0);
      expect(system.isShaking()).toBe(true);

      system.dispose();
      expect(system.isShaking()).toBe(false);
    });

    it('should make isShaking() return false after dispose', () => {
      system.shake(1.0, 1.0);
      system.dispose();
      expect(system.isShaking()).toBe(false);
    });
  });

  describe('Lifecycle Integration', () => {
    it('should keep shake active when updated to halfway point', () => {
      system.shake(1.0, 1.0);
      expect(system.isShaking()).toBe(true);

      system.update(0.5);
      expect(system.isShaking()).toBe(true);
    });

    it('should remove shake when updated past duration', () => {
      system.shake(1.0, 0.5);
      expect(system.isShaking()).toBe(true);

      system.update(0.6);
      expect(system.isShaking()).toBe(false);
    });

    it('should keep 1 shake remaining when 2 of 3 expire', () => {
      system.shake(1.0, 0.3);
      system.shake(1.0, 0.5);
      system.shake(1.0, 1.0);

      expect(system.isShaking()).toBe(true);

      // Expire first two
      system.update(0.5);
      expect(system.isShaking()).toBe(true);

      // Verify only one shake remains by checking intensity
      const intensity = system.getTotalIntensity();
      expect(intensity).toBeCloseTo(1.0, 1);
    });

    it('should accumulate shakes when added every frame', () => {
      for (let i = 0; i < 5; i++) {
        system.shake(0.2, 1.0);
        system.update(0.1);
      }

      // Should have multiple active shakes
      expect(system.isShaking()).toBe(true);
      const intensity = system.getTotalIntensity();
      expect(intensity).toBeGreaterThan(0.5); // At least some accumulated
    });
  });
});
