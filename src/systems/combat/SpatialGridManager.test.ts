import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { SpatialGridManager } from './SpatialGridManager';
import { Combatant, CombatantState } from './types';
import { createTestCombatant } from '../../test-utils';

function createMockCombatant(
  id: string,
  position: THREE.Vector3,
  state: CombatantState = CombatantState.IDLE
): Combatant {
  return createTestCombatant({
    id,
    position: position.clone(),
    state,
    lastUpdateTime: Date.now(),
  });
}

describe('SpatialGridManager', () => {
  let manager: SpatialGridManager;

  beforeEach(() => {
    manager = new SpatialGridManager();
  });

  describe('lifecycle', () => {
    it('starts uninitialized with an empty grid', () => {
      expect(manager.getIsInitialized()).toBe(false);
      expect(manager.getGrid()).toBeNull();
      expect(manager.getTelemetry().entityCount).toBe(0);
    });

    it('initializes once per world size and skips redundant initialization', () => {
      manager.initialize(4000);
      const firstRebuildMs = manager.getTelemetry().lastRebuildMs;

      manager.initialize(4000);
      expect(manager.getTelemetry().lastRebuildMs).toBe(firstRebuildMs);
      expect(manager.getIsInitialized()).toBe(true);
    });

    it('reinitializes with a new world size and clears entities', () => {
      manager.initialize(2000);
      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));

      manager.reinitialize(4000);

      expect(manager.getIsInitialized()).toBe(true);
      expect(manager.getOctreeStats()!.totalEntities).toBe(0);

      manager.syncEntity('e2', new THREE.Vector3(200, 0, 200));
      expect(manager.queryRadius(new THREE.Vector3(200, 0, 200), 50)).toContain('e2');
    });

    it('reset returns manager to pre-initialize state', () => {
      manager.initialize(4000);
      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));

      manager.reset();

      expect(manager.getIsInitialized()).toBe(false);
      expect(manager.getGrid()).toBeNull();
      expect(manager.getTelemetry().entityCount).toBe(0);
    });
  });

  describe('syncAllPositions', () => {
    it('increments fallback counter when called before initialization', () => {
      const combatants = new Map<string, Combatant>([
        ['c1', createMockCombatant('c1', new THREE.Vector3(100, 0, 100))],
      ]);
      manager.syncAllPositions(combatants, new THREE.Vector3(0, 0, 0));

      expect(manager.getTelemetry().fallbackCount).toBeGreaterThan(0);
    });

    it('syncs alive combatants and omits dead ones', () => {
      manager.initialize(4000);

      const combatants = new Map<string, Combatant>([
        ['alive', createMockCombatant('alive', new THREE.Vector3(100, 0, 100), CombatantState.IDLE)],
        ['dead', createMockCombatant('dead', new THREE.Vector3(200, 0, 200), CombatantState.DEAD)],
      ]);

      manager.syncAllPositions(combatants, new THREE.Vector3(0, 0, 0));

      const hits = manager.queryRadius(new THREE.Vector3(150, 0, 150), 200);
      expect(hits).toContain('alive');
      expect(hits).not.toContain('dead');
    });

    it('skips entities already handled by the primary spatial owner', () => {
      manager.initialize(4000);

      const combatants = new Map<string, Combatant>([
        ['c1', createMockCombatant('c1', new THREE.Vector3(100, 0, 100))],
      ]);

      const updateSpy = vi.spyOn(manager.getGrid()!, 'updatePosition');
      manager.syncAllPositions(combatants, new THREE.Vector3(0, 0, 0), new Set<string>(['c1']));

      expect(updateSpy).not.toHaveBeenCalled();
    });
  });

  describe('entity CRUD', () => {
    it('syncEntity inserts and updates position', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      expect(manager.queryRadius(new THREE.Vector3(100, 0, 100), 50)).toContain('e1');

      manager.syncEntity('e1', new THREE.Vector3(500, 0, 500));
      expect(manager.queryRadius(new THREE.Vector3(500, 0, 500), 50)).toContain('e1');
      expect(manager.queryRadius(new THREE.Vector3(100, 0, 100), 50)).not.toContain('e1');
    });

    it('removeEntity removes the given id and is a no-op for unknown ids', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.removeEntity('e1');
      expect(manager.queryRadius(new THREE.Vector3(100, 0, 100), 50)).not.toContain('e1');

      expect(() => manager.removeEntity('non-existent')).not.toThrow();
    });

    it('clear empties the grid and keeps it reusable', () => {
      manager.initialize(4000);
      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.clear();

      expect(manager.getOctreeStats()!.totalEntities).toBe(0);

      manager.syncEntity('e2', new THREE.Vector3(200, 0, 200));
      expect(manager.queryRadius(new THREE.Vector3(200, 0, 200), 50)).toContain('e2');
    });
  });

  describe('queries', () => {
    it('queryRadius returns entities within the radius and excludes far ones', () => {
      manager.initialize(4000);
      manager.syncEntity('near-a', new THREE.Vector3(100, 0, 100));
      manager.syncEntity('near-b', new THREE.Vector3(150, 0, 150));
      manager.syncEntity('far', new THREE.Vector3(500, 0, 500));

      const hits = manager.queryRadius(new THREE.Vector3(100, 0, 100), 100);
      expect(hits).toContain('near-a');
      expect(hits).toContain('near-b');
      expect(hits).not.toContain('far');
    });

    it('queryNearestK returns the closest k entities and respects maxDistance', () => {
      manager.initialize(4000);
      manager.syncEntity('closest', new THREE.Vector3(10, 0, 0));
      manager.syncEntity('middle', new THREE.Vector3(50, 0, 0));
      manager.syncEntity('farthest', new THREE.Vector3(200, 0, 0));

      const twoClosest = manager.queryNearestK(new THREE.Vector3(0, 0, 0), 2);
      expect(twoClosest).toContain('closest');
      expect(twoClosest).toContain('middle');
      expect(twoClosest).not.toContain('farthest');

      const underMaxDist = manager.queryNearestK(new THREE.Vector3(0, 0, 0), 10, 100);
      expect(underMaxDist).toContain('closest');
      expect(underMaxDist).not.toContain('farthest');
    });

    it('queryRay finds entities near the ray within maxDistance', () => {
      manager.initialize(4000);
      manager.syncEntity('on-ray', new THREE.Vector3(-1500, 0, 0));
      manager.syncEntity('off-ray', new THREE.Vector3(-1500, 50, 0));

      const hits = manager.queryRay(
        new THREE.Vector3(-2500, 0, 0),
        new THREE.Vector3(1, 0, 0),
        2000
      );

      expect(hits).toContain('on-ray');
      expect(hits).not.toContain('off-ray');
    });

    it('queries performed before initialization increment the fallback counter', () => {
      expect(manager.queryRadius(new THREE.Vector3(0, 0, 0), 100)).toEqual([]);
      expect(manager.queryNearestK(new THREE.Vector3(0, 0, 0), 3)).toEqual([]);
      expect(manager.queryRay(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), 100)).toEqual([]);

      expect(manager.getTelemetry().fallbackCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('telemetry', () => {
    it('resetFrameTelemetry clears per-frame counters but preserves long-lived stats', () => {
      manager.initialize(4000);
      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.queryRadius(new THREE.Vector3(100, 0, 100), 50);

      expect(manager.getTelemetry().queriesThisFrame).toBeGreaterThan(0);

      const preResetAvg = manager.getTelemetry().avgQueryTimeMs;
      manager.resetFrameTelemetry();

      const after = manager.getTelemetry();
      expect(after.queriesThisFrame).toBe(0);
      expect(after.avgQueryTimeMs).toBe(preResetAvg);
      expect(after.initialized).toBe(true);
    });
  });

  describe('integration', () => {
    it('supports a full insert-query-remove-clear workflow', () => {
      manager.initialize(4000);

      manager.syncEntity('e1', new THREE.Vector3(100, 0, 100));
      manager.syncEntity('e2', new THREE.Vector3(200, 0, 200));
      manager.syncEntity('e3', new THREE.Vector3(300, 0, 300));

      expect(manager.queryRadius(new THREE.Vector3(100, 0, 100), 150)).toContain('e1');
      expect(manager.queryRadius(new THREE.Vector3(100, 0, 100), 150)).toContain('e2');

      manager.removeEntity('e1');
      expect(manager.queryRadius(new THREE.Vector3(100, 0, 100), 150)).not.toContain('e1');

      manager.syncEntity('e2', new THREE.Vector3(100, 0, 100));
      expect(manager.queryRadius(new THREE.Vector3(100, 0, 100), 50)).toContain('e2');

      manager.clear();
      expect(manager.getOctreeStats()!.totalEntities).toBe(0);
    });
  });
});
