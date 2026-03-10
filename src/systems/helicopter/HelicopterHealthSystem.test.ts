import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { HelicopterHealthSystem } from './HelicopterHealthSystem';
import type { IAudioManager, IHUDSystem } from '../../types/SystemInterfaces';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeAudioManager(): IAudioManager {
  return { play: vi.fn() } as unknown as IAudioManager;
}

function makeHUDSystem(): IHUDSystem {
  return { setHelicopterDamage: vi.fn() } as unknown as IHUDSystem;
}

describe('HelicopterHealthSystem', () => {
  let system: HelicopterHealthSystem;
  const pos = new THREE.Vector3(10, 20, 30);

  beforeEach(() => {
    system = new HelicopterHealthSystem();
  });

  // ── initHealth ──

  describe('initHealth', () => {
    it('sets transport max HP to 500', () => {
      system.initHealth('h1', 'transport');
      expect(system.getHealthPercent('h1')).toBe(1);
      // Damage 500 should destroy it exactly
      system.applyDamage('h1', 500, pos);
      expect(system.isDestroyed('h1')).toBe(true);
    });

    it('sets gunship max HP to 600', () => {
      system.initHealth('h1', 'gunship');
      system.applyDamage('h1', 599, pos);
      expect(system.isDestroyed('h1')).toBe(false);
      system.applyDamage('h1', 1, pos);
      expect(system.isDestroyed('h1')).toBe(true);
    });

    it('sets attack max HP to 400', () => {
      system.initHealth('h1', 'attack');
      system.applyDamage('h1', 400, pos);
      expect(system.isDestroyed('h1')).toBe(true);
    });

    it('defaults to 500 HP for unknown role', () => {
      system.initHealth('h1', 'recon');
      system.applyDamage('h1', 500, pos);
      expect(system.isDestroyed('h1')).toBe(true);
    });
  });

  // ── applyDamage ──

  describe('applyDamage', () => {
    it('reduces health correctly', () => {
      system.initHealth('h1', 'transport'); // 500 HP
      system.applyDamage('h1', 100, pos);
      expect(system.getHealthPercent('h1')).toBeCloseTo(400 / 500);
    });

    it('clamps health at 0 and never goes negative', () => {
      system.initHealth('h1', 'attack'); // 400 HP
      system.applyDamage('h1', 9999, pos);
      expect(system.getHealthPercent('h1')).toBe(0);
      expect(system.isDestroyed('h1')).toBe(true);
    });

    it('is a no-op on an already destroyed helicopter', () => {
      system.initHealth('h1', 'transport');
      const cb = vi.fn();
      system.onDestroyed(cb);
      system.applyDamage('h1', 500, pos);
      expect(cb).toHaveBeenCalledTimes(1);
      // Second call should be a no-op
      system.applyDamage('h1', 100, pos);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('is a no-op on unknown helicopter id', () => {
      // Should not throw
      system.applyDamage('nonexistent', 100, pos);
      expect(system.isDestroyed('nonexistent')).toBe(false);
    });

    it('fires onDestroyed callback with correct id and position', () => {
      system.initHealth('h1', 'attack');
      const cb = vi.fn();
      system.onDestroyed(cb);
      const destroyPos = new THREE.Vector3(1, 2, 3);
      system.applyDamage('h1', 400, destroyPos);
      expect(cb).toHaveBeenCalledOnce();
      expect(cb).toHaveBeenCalledWith('h1', destroyPos);
    });

    it('plays explosion audio on destruction', () => {
      const audio = makeAudioManager();
      system.setAudioManager(audio);
      system.initHealth('h1', 'transport');
      const destroyPos = new THREE.Vector3(5, 6, 7);
      system.applyDamage('h1', 500, destroyPos);
      expect(audio.play).toHaveBeenCalledWith('grenadeExplosion', destroyPos);
    });

    it('does not play audio when damage does not destroy', () => {
      const audio = makeAudioManager();
      system.setAudioManager(audio);
      system.initHealth('h1', 'transport');
      system.applyDamage('h1', 100, pos);
      expect(audio.play).not.toHaveBeenCalled();
    });

    it('does not play audio if no audio manager is set', () => {
      // No audioManager set - should not throw
      system.initHealth('h1', 'attack');
      system.applyDamage('h1', 400, pos);
      expect(system.isDestroyed('h1')).toBe(true);
    });
  });

  // ── repair ──

  describe('repair', () => {
    it('repairs at 50 HP/s rate', () => {
      system.initHealth('h1', 'transport'); // 500 HP
      system.applyDamage('h1', 200, pos); // 300 HP
      system.repair('h1', 1.0); // +50 HP -> 350
      expect(system.getHealthPercent('h1')).toBeCloseTo(350 / 500);
    });

    it('returns false on destroyed helicopter', () => {
      system.initHealth('h1', 'transport');
      system.applyDamage('h1', 500, pos);
      expect(system.repair('h1', 1.0)).toBe(false);
    });

    it('returns false on unknown helicopter', () => {
      expect(system.repair('nonexistent', 1.0)).toBe(false);
    });

    it('returns true when already at full health', () => {
      system.initHealth('h1', 'transport');
      expect(system.repair('h1', 1.0)).toBe(true);
    });

    it('never exceeds max HP', () => {
      system.initHealth('h1', 'attack'); // 400 HP
      system.applyDamage('h1', 10, pos); // 390 HP
      system.repair('h1', 10.0); // +500 HP -> clamped to 400
      expect(system.getHealthPercent('h1')).toBe(1);
    });

    it('returns true once fully repaired', () => {
      system.initHealth('h1', 'attack'); // 400 HP
      system.applyDamage('h1', 50, pos); // 350 HP
      const result = system.repair('h1', 1.0); // +50 -> 400, fully repaired
      expect(result).toBe(true);
    });

    it('returns false while still repairing', () => {
      system.initHealth('h1', 'transport'); // 500 HP
      system.applyDamage('h1', 200, pos); // 300 HP
      const result = system.repair('h1', 0.5); // +25 -> 325, not full
      expect(result).toBe(false);
    });
  });

  // ── getHealthPercent ──

  describe('getHealthPercent', () => {
    it('returns correct ratio after damage', () => {
      system.initHealth('h1', 'gunship'); // 600 HP
      system.applyDamage('h1', 150, pos); // 450 HP
      expect(system.getHealthPercent('h1')).toBeCloseTo(450 / 600);
    });

    it('returns 1 for unknown helicopter', () => {
      expect(system.getHealthPercent('nonexistent')).toBe(1);
    });

    it('returns 0 for destroyed helicopter', () => {
      system.initHealth('h1', 'attack');
      system.applyDamage('h1', 400, pos);
      expect(system.getHealthPercent('h1')).toBe(0);
    });
  });

  // ── status thresholds ──

  describe('status thresholds', () => {
    it('isDestroyed returns false for unknown helicopter', () => {
      expect(system.isDestroyed('nonexistent')).toBe(false);
    });

    it('isCritical triggers at 25% or below', () => {
      system.initHealth('h1', 'attack'); // 400 HP
      system.applyDamage('h1', 299, pos); // 101/400 = 25.25% -> not critical
      expect(system.isCritical('h1')).toBe(false);
      system.applyDamage('h1', 1, pos); // 100/400 = 25% -> critical
      expect(system.isCritical('h1')).toBe(true);
    });

    it('isSmoking triggers at 50% or below', () => {
      system.initHealth('h1', 'transport'); // 500 HP
      system.applyDamage('h1', 249, pos); // 251/500 = 50.2% -> not smoking
      expect(system.isSmoking('h1')).toBe(false);
      system.applyDamage('h1', 1, pos); // 250/500 = 50% -> smoking
      expect(system.isSmoking('h1')).toBe(true);
    });

    it('isWarning triggers at 50% or below', () => {
      system.initHealth('h1', 'transport'); // 500 HP
      system.applyDamage('h1', 250, pos); // 250/500 = 50% -> warning
      expect(system.isWarning('h1')).toBe(true);
    });

    it('isWarning returns false above 50%', () => {
      system.initHealth('h1', 'transport');
      system.applyDamage('h1', 200, pos); // 300/500 = 60%
      expect(system.isWarning('h1')).toBe(false);
    });
  });

  // ── updateHUD ──

  describe('updateHUD', () => {
    it('pushes correct health percent to HUD', () => {
      const hud = makeHUDSystem();
      system.setHUDSystem(hud);
      system.initHealth('h1', 'gunship'); // 600 HP
      system.applyDamage('h1', 300, pos); // 300/600 = 50%
      system.updateHUD('h1');
      expect(hud.setHelicopterDamage).toHaveBeenCalledWith(0.5);
    });

    it('is a no-op without hudSystem', () => {
      system.initHealth('h1', 'transport');
      // Should not throw
      system.updateHUD('h1');
    });
  });

  // ── dispose ──

  describe('dispose', () => {
    it('removes a single helicopter', () => {
      system.initHealth('h1', 'transport');
      system.initHealth('h2', 'gunship');
      system.dispose('h1');
      expect(system.getHealthPercent('h1')).toBe(1); // returns default for unknown
      expect(system.isDestroyed('h1')).toBe(false);
      // h2 should be unaffected
      expect(system.getHealthPercent('h2')).toBe(1);
    });

    it('disposeAll removes all helicopters', () => {
      system.initHealth('h1', 'transport');
      system.initHealth('h2', 'gunship');
      system.initHealth('h3', 'attack');
      system.disposeAll();
      // All should return defaults for unknown
      expect(system.getHealthPercent('h1')).toBe(1);
      expect(system.getHealthPercent('h2')).toBe(1);
      expect(system.getHealthPercent('h3')).toBe(1);
    });
  });
});
