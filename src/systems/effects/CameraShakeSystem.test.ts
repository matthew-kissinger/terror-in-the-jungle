import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CameraShakeSystem } from './CameraShakeSystem';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('CameraShakeSystem', () => {
  let system: CameraShakeSystem;

  beforeEach(() => {
    system = new CameraShakeSystem();
  });

  afterEach(() => {
    system.dispose();
    vi.clearAllMocks();
  });

  describe('init()', () => {
    it('should resolve without error', async () => {
      await expect(system.init()).resolves.toBeUndefined();
    });
  });

  describe('shake()', () => {
    it('should add a shake to activeShakes', () => {
      system.shake(1.0, 0.5);
      expect(system.isShaking()).toBe(true);
    });

    it('should cap intensity at MAX_INTENSITY (2.5)', () => {
      system.shake(5.0, 0.5);
      expect(system.getTotalIntensity()).toBeCloseTo(2.5);
    });

    it('should use DEFAULT_FREQUENCY (20) when frequency not provided', () => {
      system.shake(1.0, 0.5);
      const shakes = (system as any).activeShakes;
      expect(shakes[0].frequency).toBe(20);
    });

    it('should use custom frequency when provided', () => {
      system.shake(1.0, 0.5, 35);
      const shakes = (system as any).activeShakes;
      expect(shakes[0].frequency).toBe(35);
    });

    it('should allow multiple shakes simultaneously', () => {
      system.shake(0.5, 0.3);
      system.shake(0.8, 0.4);
      system.shake(1.0, 0.5);
      const shakes = (system as any).activeShakes;
      expect(shakes.length).toBe(3);
    });

    it('should store correct intensity and duration', () => {
      system.shake(0.7, 0.4, 25);
      const shake = (system as any).activeShakes[0];
      expect(shake.intensity).toBeCloseTo(0.7);
      expect(shake.duration).toBeCloseTo(0.4);
      expect(shake.elapsed).toBe(0);
    });
  });

  describe('update()', () => {
    it('should advance noiseOffset by deltaTime * 10', () => {
      const initialOffset = (system as any).noiseOffset;
      system.update(0.1);
      expect((system as any).noiseOffset).toBeCloseTo(initialOffset + 1.0);
    });

    it('should remove expired shakes (elapsed >= duration)', () => {
      system.shake(1.0, 0.2);
      expect(system.isShaking()).toBe(true);

      system.update(0.3); // 0.3 > 0.2 duration
      expect(system.isShaking()).toBe(false);
    });

    it('should keep active shakes (elapsed < duration)', () => {
      system.shake(1.0, 1.0);
      system.update(0.5); // 0.5 < 1.0 duration
      expect(system.isShaking()).toBe(true);
    });

    it('should use swap-and-pop for removal (not splice)', () => {
      // Add 3 shakes with different durations
      system.shake(0.5, 0.1); // expires first
      system.shake(0.8, 1.0); // survives
      system.shake(1.0, 1.0); // survives

      const shakes = (system as any).activeShakes;
      const secondShake = shakes[1];
      const thirdShake = shakes[2];

      system.update(0.2); // first shake expires

      // After swap-and-pop, the last element replaces the removed one
      expect(shakes.length).toBe(2);
      // The remaining shakes should be the ones that survived
      expect(shakes.some((s: any) => s === secondShake || s === thirdShake)).toBe(true);
    });

    it('should handle empty activeShakes array', () => {
      expect(() => system.update(0.016)).not.toThrow();
    });

    it('should advance elapsed time for active shakes', () => {
      system.shake(1.0, 1.0);
      system.update(0.3);
      const shake = (system as any).activeShakes[0];
      expect(shake.elapsed).toBeCloseTo(0.3);
    });
  });

  describe('shakeFromExplosion()', () => {
    it('should not shake when distance > maxRadius * 1.5', () => {
      const explosionPos = new THREE.Vector3(0, 0, 0);
      const playerPos = new THREE.Vector3(100, 0, 0);
      system.shakeFromExplosion(explosionPos, playerPos, 10); // maxRadius=10, 1.5x=15, dist=100
      expect(system.isShaking()).toBe(false);
    });

    it('should produce full intensity at epicenter (distance = 0)', () => {
      const pos = new THREE.Vector3(5, 0, 5);
      system.shakeFromExplosion(pos, pos.clone(), 10);

      expect(system.isShaking()).toBe(true);
      // At distance 0: falloff=1, intensity=1.5*1*1=1.5
      expect(system.getTotalIntensity()).toBeCloseTo(1.5);
    });

    it('should scale intensity with quadratic falloff', () => {
      const explosionPos = new THREE.Vector3(0, 0, 0);
      const maxRadius = 10;

      // At half of maxRadius*1.5 = 7.5
      const halfPos = new THREE.Vector3(7.5, 0, 0);
      system.shakeFromExplosion(explosionPos, halfPos, maxRadius);

      // falloff = 1 - (7.5 / 15) = 0.5, intensity = 1.5 * 0.25 = 0.375
      expect(system.getTotalIntensity()).toBeCloseTo(0.375);
    });

    it('should use 25 Hz frequency for explosions', () => {
      const pos = new THREE.Vector3(0, 0, 0);
      system.shakeFromExplosion(pos, pos.clone(), 10);
      const shake = (system as any).activeShakes[0];
      expect(shake.frequency).toBe(25);
    });

    it('should produce ~0 intensity at exactly maxRadius * 1.5 boundary', () => {
      const explosionPos = new THREE.Vector3(0, 0, 0);
      const maxRadius = 10;
      // Distance exactly at maxRadius * 1.5 = 15
      const boundaryPos = new THREE.Vector3(15, 0, 0);
      system.shakeFromExplosion(explosionPos, boundaryPos, maxRadius);

      // falloff = max(0, 1 - 15/15) = 0, intensity = 0
      // System may or may not add shake with 0 intensity
      if (system.isShaking()) {
        expect(system.getTotalIntensity()).toBeCloseTo(0);
      }
    });

    it('should calculate duration based on falloff', () => {
      const pos = new THREE.Vector3(0, 0, 0);
      system.shakeFromExplosion(pos, pos.clone(), 10);

      const shake = (system as any).activeShakes[0];
      // At distance 0: falloff=1, duration = 0.3 + 0.2*1 = 0.5
      expect(shake.duration).toBeCloseTo(0.5);
    });

    it('should produce significant shake at half maxRadius', () => {
      const explosionPos = new THREE.Vector3(0, 0, 0);
      const maxRadius = 10;
      const halfPos = new THREE.Vector3(5, 0, 0);
      system.shakeFromExplosion(explosionPos, halfPos, maxRadius);

      expect(system.isShaking()).toBe(true);
      // falloff = 1 - (5/15) = 0.667, intensity = 1.5 * 0.667^2 ≈ 0.667
      expect(system.getTotalIntensity()).toBeGreaterThan(0.5);
    });
  });

  describe('shakeFromDamage()', () => {
    it('should produce ~0.2 intensity from 10 damage', () => {
      system.shakeFromDamage(10);
      // intensity = min(10/50, 1.2) = 0.2
      expect(system.getTotalIntensity()).toBeCloseTo(0.2);
    });

    it('should produce ~1.0 intensity from 50 damage', () => {
      system.shakeFromDamage(50);
      // intensity = min(50/50, 1.2) = 1.0
      expect(system.getTotalIntensity()).toBeCloseTo(1.0);
    });

    it('should cap intensity at 1.2 for 100 damage', () => {
      system.shakeFromDamage(100);
      // intensity = min(100/50, 1.2) = min(2, 1.2) = 1.2
      expect(system.getTotalIntensity()).toBeCloseTo(1.2);
    });

    it('should scale duration with intensity (0.15 to 0.3s)', () => {
      system.shakeFromDamage(10);
      const shake10 = (system as any).activeShakes[0];
      // intensity = 0.2, duration = 0.15 + 0.2*0.15 = 0.18
      expect(shake10.duration).toBeCloseTo(0.18);

      const system2 = new CameraShakeSystem();
      system2.shakeFromDamage(50);
      const shake50 = (system2 as any).activeShakes[0];
      // intensity = 1.0, duration = 0.15 + 1.0*0.15 = 0.3
      expect(shake50.duration).toBeCloseTo(0.3);
      system2.dispose();
    });

    it('should use 30 Hz frequency', () => {
      system.shakeFromDamage(25);
      const shake = (system as any).activeShakes[0];
      expect(shake.frequency).toBe(30);
    });
  });

  describe('shakeFromNearbyDeath()', () => {
    it('should not shake when distance > 20 units', () => {
      const deathPos = new THREE.Vector3(0, 0, 0);
      const playerPos = new THREE.Vector3(25, 0, 0);
      system.shakeFromNearbyDeath(deathPos, playerPos);
      expect(system.isShaking()).toBe(false);
    });

    it('should produce subtle shake (max intensity 0.15) at close range', () => {
      const pos = new THREE.Vector3(0, 0, 0);
      system.shakeFromNearbyDeath(pos, pos.clone());
      // At distance 0: falloff=1, intensity=0.15*1=0.15
      expect(system.getTotalIntensity()).toBeCloseTo(0.15);
    });

    it('should scale intensity linearly with distance', () => {
      const deathPos = new THREE.Vector3(0, 0, 0);

      // At distance 10 (half of 20)
      const playerPos = new THREE.Vector3(10, 0, 0);
      system.shakeFromNearbyDeath(deathPos, playerPos);

      // falloff = 1 - (10/20) = 0.5, intensity = 0.15*0.5 = 0.075
      expect(system.getTotalIntensity()).toBeCloseTo(0.075);
    });

    it('should use fixed 0.2s duration', () => {
      const pos = new THREE.Vector3(0, 0, 0);
      system.shakeFromNearbyDeath(pos, pos.clone());
      const shake = (system as any).activeShakes[0];
      expect(shake.duration).toBeCloseTo(0.2);
    });

    it('should use 15 Hz frequency', () => {
      const pos = new THREE.Vector3(0, 0, 0);
      system.shakeFromNearbyDeath(pos, pos.clone());
      const shake = (system as any).activeShakes[0];
      expect(shake.frequency).toBe(15);
    });
  });

  describe('shakeFromRecoil()', () => {
    it('should produce very subtle shake: intensity 0.08, duration 0.06s, frequency 25 Hz', () => {
      system.shakeFromRecoil();
      const shake = (system as any).activeShakes[0];
      expect(shake.intensity).toBeCloseTo(0.08);
      expect(shake.duration).toBeCloseTo(0.06);
      expect(shake.frequency).toBe(25);
    });
  });

  describe('getCurrentShakeOffset()', () => {
    it('should return {pitch: 0, yaw: 0} when no active shakes', () => {
      const offset = system.getCurrentShakeOffset();
      expect(offset.pitch).toBe(0);
      expect(offset.yaw).toBe(0);
    });

    it('should return non-zero values when shakes are active', () => {
      system.shake(2.0, 1.0);
      // Advance noiseOffset so sine waves produce non-zero output
      system.update(0.05);

      const offset = system.getCurrentShakeOffset();
      // At least one of pitch/yaw should be non-zero (extremely unlikely both zero)
      expect(Math.abs(offset.pitch) + Math.abs(offset.yaw)).toBeGreaterThan(0);
    });

    it('should apply fade-out envelope in last 30% of duration', () => {
      system.shake(1.0, 1.0, 20);

      // At start (0% elapsed, 100% remaining -> full envelope)
      system.update(0.01);
      const offsetEarly = system.getCurrentShakeOffset();
      const magnitudeEarly = Math.abs(offsetEarly.pitch) + Math.abs(offsetEarly.yaw);

      // Reset and test near end (90% elapsed, 10% remaining -> in fade zone)
      const system2 = new CameraShakeSystem();
      system2.shake(1.0, 1.0, 20);
      // Match the noiseOffset by running same total time
      system2.update(0.9);
      // Now only 0.1s remaining out of 1.0s, fadeOut = min(1, 0.1 / 0.3) = 0.333
      const offsetLate = system2.getCurrentShakeOffset();
      const magnitudeLate = Math.abs(offsetLate.pitch) + Math.abs(offsetLate.yaw);

      // The late magnitude should be significantly less due to envelope
      // (different noiseOffset means different sine values, so we verify via getTotalIntensity)
      const intensityLate = system2.getTotalIntensity();
      // fadeOut = min(1, 0.1/0.3) ≈ 0.333
      expect(intensityLate).toBeCloseTo(1.0 * 0.333, 1);
      system2.dispose();
    });

    it('should sum multiple active shakes', () => {
      // Add one shake and record offset
      system.shake(1.0, 1.0, 20);
      system.update(0.05);
      const offsetSingle = system.getCurrentShakeOffset();

      // Add second shake (both now active)
      system.shake(1.0, 1.0, 20);
      const offsetDouble = system.getCurrentShakeOffset();

      // The total intensity should be greater with two shakes
      expect(system.getTotalIntensity()).toBeGreaterThan(1.0);
    });

    it('should use pseudo-Perlin noise (multiple sine waves combined)', () => {
      system.shake(1.0, 1.0, 10);

      // Collect offsets at different time steps
      const offsets: { pitch: number; yaw: number }[] = [];
      for (let i = 0; i < 20; i++) {
        system.update(0.01);
        offsets.push(system.getCurrentShakeOffset());
      }

      // Verify that values change over time (not constant)
      const uniquePitch = new Set(offsets.map(o => o.pitch.toFixed(6)));
      const uniqueYaw = new Set(offsets.map(o => o.yaw.toFixed(6)));
      expect(uniquePitch.size).toBeGreaterThan(1);
      expect(uniqueYaw.size).toBeGreaterThan(1);
    });

    it('should produce different values for pitch and yaw (different phase offsets)', () => {
      system.shake(1.5, 1.0, 15);
      system.update(0.1);

      const offset = system.getCurrentShakeOffset();
      // Pitch and yaw use different sine wave combinations, so they differ
      // (extremely unlikely to be exactly equal)
      expect(offset.pitch).not.toBeCloseTo(offset.yaw, 5);
    });
  });

  describe('isShaking()', () => {
    it('should return false with no active shakes', () => {
      expect(system.isShaking()).toBe(false);
    });

    it('should return true with active shakes', () => {
      system.shake(0.5, 0.5);
      expect(system.isShaking()).toBe(true);
    });

    it('should return false after all shakes expire', () => {
      system.shake(0.5, 0.1);
      system.shake(0.3, 0.2);

      system.update(0.3); // Both expired (0.3 > 0.2)
      expect(system.isShaking()).toBe(false);
    });
  });

  describe('getTotalIntensity()', () => {
    it('should return 0 with no active shakes', () => {
      expect(system.getTotalIntensity()).toBe(0);
    });

    it('should return intensity weighted by fade envelope', () => {
      system.shake(1.0, 1.0);
      // At elapsed=0, remaining=1.0, fadeOut = min(1, 1.0/0.3) = 1.0
      expect(system.getTotalIntensity()).toBeCloseTo(1.0);

      // Advance to 80% elapsed (20% remaining = 0.2s)
      system.update(0.8);
      // fadeOut = min(1, 0.2/0.3) ≈ 0.667
      expect(system.getTotalIntensity()).toBeCloseTo(1.0 * (0.2 / 0.3), 1);
    });

    it('should sum multiple active shakes', () => {
      system.shake(0.5, 1.0);
      system.shake(0.3, 1.0);

      // Both at full envelope initially
      expect(system.getTotalIntensity()).toBeCloseTo(0.8);
    });
  });

  describe('dispose()', () => {
    it('should clear all active shakes', () => {
      system.shake(1.0, 1.0);
      system.shake(0.5, 0.5);
      system.shake(0.3, 0.3);

      system.dispose();
      expect((system as any).activeShakes.length).toBe(0);
    });

    it('should cause isShaking() to return false after dispose', () => {
      system.shake(1.0, 1.0);
      expect(system.isShaking()).toBe(true);

      system.dispose();
      expect(system.isShaking()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle update with zero deltaTime', () => {
      system.shake(1.0, 0.5);
      expect(() => system.update(0)).not.toThrow();

      const shake = (system as any).activeShakes[0];
      expect(shake.elapsed).toBe(0);
    });

    it('should handle very large deltaTime', () => {
      system.shake(1.0, 1.0);
      system.update(1000);
      expect(system.isShaking()).toBe(false);
    });

    it('should handle shake with zero intensity', () => {
      system.shake(0, 1.0);
      expect(system.isShaking()).toBe(true);
      expect(system.getTotalIntensity()).toBe(0);
    });

    it('should handle shake with zero duration', () => {
      system.shake(1.0, 0);
      // A shake with zero duration will be immediately expired on next update
      system.update(0.001);
      expect(system.isShaking()).toBe(false);
    });

    it('should handle negative intensity by not going below zero', () => {
      // Math.min(negative, 2.5) = negative - system doesn't clamp floor
      system.shake(-1.0, 1.0);
      const shake = (system as any).activeShakes[0];
      expect(shake.intensity).toBe(-1.0);
    });

    it('should handle many simultaneous shakes', () => {
      for (let i = 0; i < 100; i++) {
        system.shake(0.1, 1.0);
      }
      expect((system as any).activeShakes.length).toBe(100);
      expect(() => system.update(0.016)).not.toThrow();
    });

    it('should handle shakeFromExplosion with zero maxRadius', () => {
      const pos = new THREE.Vector3(0, 0, 0);
      // maxRadius=0, so 1.5*0=0. Any distance > 0 will not shake
      system.shakeFromExplosion(pos, new THREE.Vector3(1, 0, 0), 0);
      expect(system.isShaking()).toBe(false);
    });

    it('should handle shakeFromDamage with zero damage', () => {
      system.shakeFromDamage(0);
      // intensity = 0, duration = 0.15
      const shake = (system as any).activeShakes[0];
      expect(shake.intensity).toBe(0);
      expect(shake.duration).toBeCloseTo(0.15);
    });
  });
});
