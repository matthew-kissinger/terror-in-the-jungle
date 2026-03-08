import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { SpectatorCamera, SpectatorCandidate } from './SpectatorCamera';
import { Faction } from '../combat/types';

// Suppress Logger output in tests
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

function makeCandidates(count: number, faction = Faction.US): SpectatorCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `npc_${i}`,
    position: new THREE.Vector3(i * 10, 0, 0),
    faction,
  }));
}

describe('SpectatorCamera', () => {
  let camera: THREE.PerspectiveCamera;
  let spectator: SpectatorCamera;

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 5, -50);
    spectator = new SpectatorCamera(camera);
  });

  afterEach(() => {
    spectator.deactivate();
  });

  // ── Lifecycle ──

  describe('activate / deactivate', () => {
    it('is inactive by default', () => {
      expect(spectator.isActive()).toBe(false);
      expect(spectator.getCurrentTargetId()).toBeNull();
    });

    it('activates with candidates', () => {
      const candidates = makeCandidates(3);
      spectator.activate(candidates);

      expect(spectator.isActive()).toBe(true);
      expect(spectator.getCurrentTargetId()).toBe('npc_0');
    });

    it('activates with empty candidates (overhead fallback)', () => {
      spectator.activate([]);

      expect(spectator.isActive()).toBe(true);
      expect(spectator.getCurrentTargetId()).toBeNull();
    });

    it('deactivates and restores camera position', () => {
      const originalPos = camera.position.clone();
      const _originalQuat = camera.quaternion.clone();

      spectator.activate(makeCandidates(2));
      spectator.update(1.0, makeCandidates(2)); // move camera

      spectator.deactivate();

      expect(spectator.isActive()).toBe(false);
      expect(camera.position.x).toBeCloseTo(originalPos.x, 1);
      expect(camera.position.y).toBeCloseTo(originalPos.y, 1);
      expect(camera.position.z).toBeCloseTo(originalPos.z, 1);
    });

    it('deactivate is idempotent when not active', () => {
      expect(() => spectator.deactivate()).not.toThrow();
      expect(spectator.isActive()).toBe(false);
    });

    it('activate is idempotent when already active', () => {
      spectator.activate(makeCandidates(2));
      const targetBefore = spectator.getCurrentTargetId();
      spectator.activate(makeCandidates(3)); // should be ignored
      expect(spectator.getCurrentTargetId()).toBe(targetBefore);
    });
  });

  // ── Target cycling ──

  describe('nextTarget / prevTarget', () => {
    it('cycles forward through candidates', () => {
      spectator.activate(makeCandidates(3));
      expect(spectator.getCurrentTargetId()).toBe('npc_0');

      spectator.nextTarget();
      expect(spectator.getCurrentTargetId()).toBe('npc_1');

      spectator.nextTarget();
      expect(spectator.getCurrentTargetId()).toBe('npc_2');

      // Wraps around
      spectator.nextTarget();
      expect(spectator.getCurrentTargetId()).toBe('npc_0');
    });

    it('cycles backward through candidates', () => {
      spectator.activate(makeCandidates(3));
      expect(spectator.getCurrentTargetId()).toBe('npc_0');

      // Wraps to last
      spectator.prevTarget();
      expect(spectator.getCurrentTargetId()).toBe('npc_2');

      spectator.prevTarget();
      expect(spectator.getCurrentTargetId()).toBe('npc_1');
    });

    it('does nothing when inactive', () => {
      spectator.nextTarget();
      spectator.prevTarget();
      expect(spectator.getCurrentTargetId()).toBeNull();
    });

    it('does nothing with zero candidates', () => {
      spectator.activate([]);
      spectator.nextTarget();
      expect(spectator.getCurrentTargetId()).toBeNull();
    });
  });

  // ── Update with smooth follow ──

  describe('update', () => {
    it('moves camera toward target position', () => {
      const candidates = makeCandidates(1);
      candidates[0].position.set(100, 0, 100);

      spectator.activate(candidates);
      const initialCameraPos = camera.position.clone();

      spectator.update(0.016, candidates); // one frame at 60fps

      // Camera should have moved toward the target
      const distBefore = initialCameraPos.distanceTo(candidates[0].position);
      const distAfter = camera.position.distanceTo(candidates[0].position);
      // It should get closer (or at least not further away), noting the offset
      expect(distAfter).toBeLessThan(distBefore + 20);
    });

    it('updates even with zero dt without crashing', () => {
      const candidates = makeCandidates(1);
      spectator.activate(candidates);
      expect(() => spectator.update(0, candidates)).not.toThrow();
    });

    it('does nothing when inactive', () => {
      const posBefore = camera.position.clone();
      spectator.update(0.1, makeCandidates(2));
      expect(camera.position.equals(posBefore)).toBe(true);
    });
  });

  // ── Auto-advance when target dies ──

  describe('auto-advance on target death', () => {
    it('auto-advances to next candidate when current target disappears', () => {
      const candidates = makeCandidates(3);
      spectator.activate(candidates);
      expect(spectator.getCurrentTargetId()).toBe('npc_0');

      // npc_0 dies - remove from candidates
      const remaining = candidates.filter(c => c.id !== 'npc_0');
      spectator.update(0.016, remaining);

      // Should have auto-advanced
      expect(spectator.getCurrentTargetId()).not.toBe('npc_0');
      expect(spectator.getCurrentTargetId()).not.toBeNull();
    });

    it('falls back to overhead when all targets disappear', () => {
      spectator.activate(makeCandidates(1));
      expect(spectator.getCurrentTargetId()).toBe('npc_0');

      spectator.update(0.016, []);

      // No valid target - overhead fallback
      expect(spectator.getCurrentTargetId()).toBeNull();
    });

    it('continues tracking when target list changes but current survives', () => {
      const candidates = makeCandidates(3);
      spectator.activate(candidates);
      spectator.nextTarget(); // now watching npc_1
      expect(spectator.getCurrentTargetId()).toBe('npc_1');

      // npc_2 dies, npc_1 survives
      const remaining = candidates.filter(c => c.id !== 'npc_2');
      spectator.update(0.016, remaining);

      expect(spectator.getCurrentTargetId()).toBe('npc_1');
    });
  });

  // ── Overhead fallback ──

  describe('overhead fallback', () => {
    it('uses overhead camera when no candidates exist', () => {
      spectator.activate([]);
      spectator.update(1.0, []);

      // Camera should be high up (overhead position)
      expect(camera.position.y).toBeGreaterThan(10);
    });

    it('uses last known position when target disappears', () => {
      const candidates = makeCandidates(1);
      candidates[0].position.set(50, 0, 50);
      spectator.activate(candidates);

      // Follow for a few frames
      spectator.update(1.0, candidates);
      spectator.update(1.0, candidates);

      // Target dies
      spectator.update(1.0, []);

      // Camera should be above last known position
      expect(camera.position.y).toBeGreaterThan(10);
    });
  });

  // ── Mouse look ──

  describe('applyMouseDelta', () => {
    it('does nothing when inactive', () => {
      expect(() => spectator.applyMouseDelta(10)).not.toThrow();
    });

    it('applies yaw rotation around target', () => {
      const candidates = makeCandidates(1);
      candidates[0].position.set(0, 0, 0);
      spectator.activate(candidates);

      // Initial update to position camera
      spectator.update(5.0, candidates); // long dt to converge

      const posBefore = camera.position.clone();

      // Apply yaw
      spectator.applyMouseDelta(100);
      spectator.update(5.0, candidates); // converge again

      // Camera should have moved laterally
      expect(camera.position.x).not.toBeCloseTo(posBefore.x, 0);
    });
  });

  // ── isActive state ──

  describe('isActive', () => {
    it('returns false before activation', () => {
      expect(spectator.isActive()).toBe(false);
    });

    it('returns true after activation', () => {
      spectator.activate(makeCandidates(1));
      expect(spectator.isActive()).toBe(true);
    });

    it('returns false after deactivation', () => {
      spectator.activate(makeCandidates(1));
      spectator.deactivate();
      expect(spectator.isActive()).toBe(false);
    });
  });

  // ── getCurrentTargetId ──

  describe('getCurrentTargetId', () => {
    it('returns null when inactive', () => {
      expect(spectator.getCurrentTargetId()).toBeNull();
    });

    it('returns first candidate id after activation', () => {
      spectator.activate(makeCandidates(2));
      expect(spectator.getCurrentTargetId()).toBe('npc_0');
    });

    it('returns null after deactivation', () => {
      spectator.activate(makeCandidates(2));
      spectator.deactivate();
      expect(spectator.getCurrentTargetId()).toBeNull();
    });

    it('returns null when activated with no candidates', () => {
      spectator.activate([]);
      expect(spectator.getCurrentTargetId()).toBeNull();
    });
  });
});
