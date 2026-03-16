import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantMovement } from './CombatantMovement';
import { CombatantState } from './types';
import { createTestCombatant, mockTerrainRuntime } from '../../test-utils';

// Minimal NavmeshMovementAdapter mock
function mockNavmeshAdapter(agentIds: Set<string> = new Set()) {
  return {
    hasAgent: vi.fn((id: string) => agentIds.has(id)),
    registerAgent: vi.fn(() => true),
    unregisterAgent: vi.fn(),
    updateAgentTarget: vi.fn(),
    applyAgentVelocity: vi.fn(),
    getAgentCount: vi.fn(() => agentIds.size),
    dispose: vi.fn(),
  };
}

// Minimal NavmeshSystem mock
function mockNavmeshSystem(adapter: ReturnType<typeof mockNavmeshAdapter> | null) {
  return {
    getAdapter: vi.fn(() => adapter),
    init: vi.fn(),
    generateNavmesh: vi.fn(),
    update: vi.fn(),
    isReady: vi.fn(() => !!adapter),
    isWasmReady: vi.fn(() => !!adapter),
    dispose: vi.fn(),
  };
}

describe('CombatantMovement', () => {
  let movement: CombatantMovement;
  let terrain: ReturnType<typeof mockTerrainRuntime>;

  beforeEach(() => {
    terrain = mockTerrainRuntime();
    movement = new CombatantMovement(terrain);
  });

  describe('slope penalty bypass for navmesh agents', () => {
    it('skips slope penalty for NPC with a navmesh crowd agent', () => {
      const adapter = mockNavmeshAdapter(new Set(['npc1']));
      const navSystem = mockNavmeshSystem(adapter);
      movement.setNavmeshSystem(navSystem as any);

      // Set terrain to return a steep slope (would normally zero velocity)
      terrain.getSlopeAt = vi.fn(() => 0.8); // steep slope

      const c = createTestCombatant({
        id: 'npc1',
        state: CombatantState.PATROLLING,
        squadRole: 'leader' as any,
        position: new THREE.Vector3(0, 0, 0),
        destinationPoint: new THREE.Vector3(100, 0, 100),
        lodLevel: 'high',
      });

      movement.updateMovement(c, 0.016, new Map(), new Map(), {
        disableSpacing: true,
        disableTerrainSample: true,
      });

      // getSlopeAt should NOT have been called for this navmesh agent
      expect(terrain.getSlopeAt).not.toHaveBeenCalled();
    });

    it('applies slope penalty for beeline NPC without navmesh agent', () => {
      const adapter = mockNavmeshAdapter(new Set()); // no agents registered
      const navSystem = mockNavmeshSystem(adapter);
      movement.setNavmeshSystem(navSystem as any);

      terrain.getSlopeAt = vi.fn(() => 0.3); // moderate slope

      const c = createTestCombatant({
        id: 'npc2',
        state: CombatantState.PATROLLING,
        squadRole: 'leader' as any,
        position: new THREE.Vector3(0, 0, 0),
        destinationPoint: new THREE.Vector3(100, 0, 100),
        lodLevel: 'low', // low LOD = beeline
      });

      movement.updateMovement(c, 0.016, new Map(), new Map(), {
        disableSpacing: true,
        disableTerrainSample: true,
      });

      // getSlopeAt SHOULD have been called for beeline NPC
      expect(terrain.getSlopeAt).toHaveBeenCalled();
    });
  });

  describe('stuck detector integration', () => {
    it('does not crash when processing dead NPC', () => {
      const c = createTestCombatant({
        id: 'npc1',
        state: CombatantState.DEAD,
        position: new THREE.Vector3(0, 0, 0),
      });

      // Should not throw
      movement.updateMovement(c, 0.016, new Map(), new Map(), {
        disableSpacing: true,
        disableTerrainSample: true,
      });

      expect(c.velocity.lengthSq()).toBe(0);
    });

    it('cleans up stuck records via unregisterNavmeshAgent', () => {
      // This is a smoke test — the stuck detector is internal,
      // we just verify the method doesn't throw
      expect(() => movement.unregisterNavmeshAgent('some-id')).not.toThrow();
    });

    it('resetStuckDetector does not throw', () => {
      expect(() => movement.resetStuckDetector()).not.toThrow();
    });
  });
});
