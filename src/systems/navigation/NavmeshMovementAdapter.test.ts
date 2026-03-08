import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { NavmeshMovementAdapter } from './NavmeshMovementAdapter';
import type { Combatant } from '../combat/types';
import type { Crowd, CrowdAgent } from '@recast-navigation/core';
import { createTestCombatant } from '../../test-utils';

function makeMockAgent(): CrowdAgent {
  return {
    requestMoveTarget: vi.fn(),
    velocity: vi.fn().mockReturnValue({ x: 1, y: 0, z: 2 }),
  } as unknown as CrowdAgent;
}

function makeMockCrowd(maxAgents = 64): { crowd: Crowd; agents: CrowdAgent[] } {
  const agents: CrowdAgent[] = [];
  const crowd = {
    getAgentCount: vi.fn().mockReturnValue(maxAgents),
    addAgent: vi.fn().mockImplementation(() => {
      const agent = makeMockAgent();
      agents.push(agent);
      return agent;
    }),
    removeAgent: vi.fn(),
  } as unknown as Crowd;
  return { crowd, agents };
}

function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return createTestCombatant({
    id: 'npc-1',
    position: new THREE.Vector3(10, 3, 20),
    velocity: new THREE.Vector3(1, 0, 1),
    destinationPoint: new THREE.Vector3(50, 3, 60),
    lodLevel: 'high',
    ...overrides,
  });
}

describe('NavmeshMovementAdapter', () => {
  let adapter: NavmeshMovementAdapter;
  let crowd: Crowd;
  let agents: CrowdAgent[];

  beforeEach(() => {
    const mock = makeMockCrowd();
    crowd = mock.crowd;
    agents = mock.agents;
    adapter = new NavmeshMovementAdapter(crowd);
  });

  describe('registerAgent', () => {
    it('registers a combatant and returns true', () => {
      const c = makeCombatant();
      expect(adapter.registerAgent(c)).toBe(true);
      expect(crowd.addAgent).toHaveBeenCalledOnce();
      expect(adapter.hasAgent('npc-1')).toBe(true);
      expect(adapter.getAgentCount()).toBe(1);
    });

    it('returns true for already-registered combatant without adding again', () => {
      const c = makeCombatant();
      adapter.registerAgent(c);
      expect(adapter.registerAgent(c)).toBe(true);
      expect(crowd.addAgent).toHaveBeenCalledOnce();
    });

    it('returns false when crowd is full', () => {
      const { crowd: fullCrowd } = makeMockCrowd(0);
      const fullAdapter = new NavmeshMovementAdapter(fullCrowd);
      expect(fullAdapter.registerAgent(makeCombatant())).toBe(false);
    });

    it('returns false when addAgent throws', () => {
      (crowd.addAgent as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('crowd full');
      });
      expect(adapter.registerAgent(makeCombatant())).toBe(false);
    });
  });

  describe('unregisterAgent', () => {
    it('removes agent from crowd and internal maps', () => {
      const c = makeCombatant();
      adapter.registerAgent(c);
      adapter.unregisterAgent('npc-1');
      expect(crowd.removeAgent).toHaveBeenCalledOnce();
      expect(adapter.hasAgent('npc-1')).toBe(false);
      expect(adapter.getAgentCount()).toBe(0);
    });

    it('is safe to call for unregistered id', () => {
      adapter.unregisterAgent('nonexistent');
      expect(crowd.removeAgent).not.toHaveBeenCalled();
    });
  });

  describe('updateAgentTarget', () => {
    it('calls requestMoveTarget on first update', () => {
      const c = makeCombatant({ destinationPoint: new THREE.Vector3(100, 5, 200) });
      adapter.registerAgent(c);
      adapter.updateAgentTarget(c);
      expect(agents[0].requestMoveTarget).toHaveBeenCalledWith(
        expect.objectContaining({ x: 100, y: 2, z: 200 }) // y - 3
      );
    });

    it('debounces when target moves less than 2m', () => {
      const c = makeCombatant({ destinationPoint: new THREE.Vector3(100, 5, 200) });
      adapter.registerAgent(c);
      adapter.updateAgentTarget(c);

      // Move target by 1m (under 2m threshold)
      c.destinationPoint = new THREE.Vector3(101, 5, 200);
      adapter.updateAgentTarget(c);
      expect(agents[0].requestMoveTarget).toHaveBeenCalledTimes(1);
    });

    it('updates when target moves more than 2m', () => {
      const c = makeCombatant({ destinationPoint: new THREE.Vector3(100, 5, 200) });
      adapter.registerAgent(c);
      adapter.updateAgentTarget(c);

      // Move target by 3m (over 2m threshold)
      c.destinationPoint = new THREE.Vector3(103, 5, 200);
      adapter.updateAgentTarget(c);
      expect(agents[0].requestMoveTarget).toHaveBeenCalledTimes(2);
    });

    it('skips when no destination set', () => {
      const c = {
        ...makeCombatant(),
        destinationPoint: undefined,
      } as unknown as Combatant;
      adapter.registerAgent(c);
      adapter.updateAgentTarget(c);
      expect(agents[0].requestMoveTarget).not.toHaveBeenCalled();
    });

    it('skips for unregistered combatant', () => {
      const c = makeCombatant();
      adapter.updateAgentTarget(c); // not registered
      expect(agents).toHaveLength(0);
    });
  });

  describe('applyAgentVelocity', () => {
    it('overrides combatant XZ velocity from crowd agent', () => {
      const c = makeCombatant({ velocity: new THREE.Vector3(0, -1, 0) });
      adapter.registerAgent(c);
      adapter.applyAgentVelocity(c);
      expect(c.velocity.x).toBe(1);
      expect(c.velocity.z).toBe(2);
      // Y unchanged
      expect(c.velocity.y).toBe(-1);
    });

    it('does nothing for unregistered combatant', () => {
      const c = makeCombatant({ velocity: new THREE.Vector3(5, 0, 5) });
      adapter.applyAgentVelocity(c);
      expect(c.velocity.x).toBe(5);
      expect(c.velocity.z).toBe(5);
    });
  });

  describe('dispose', () => {
    it('removes all agents', () => {
      adapter.registerAgent(makeCombatant({ id: 'a' }));
      adapter.registerAgent(makeCombatant({ id: 'b' }));
      expect(adapter.getAgentCount()).toBe(2);
      adapter.dispose();
      expect(adapter.getAgentCount()).toBe(0);
      expect(crowd.removeAgent).toHaveBeenCalledTimes(2);
    });
  });
});
