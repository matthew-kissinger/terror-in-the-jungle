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
    simLane: 'high',
    renderLane: 'culled',
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
    it('registers a combatant and reports it as known', () => {
      const c = makeCombatant();
      expect(adapter.registerAgent(c)).toBe(true);
      expect(adapter.hasAgent('npc-1')).toBe(true);
      expect(adapter.getAgentCount()).toBe(1);
    });

    it('is idempotent for an already-registered combatant', () => {
      const c = makeCombatant();
      adapter.registerAgent(c);
      expect(adapter.registerAgent(c)).toBe(true);
      expect(adapter.getAgentCount()).toBe(1);
    });

    it('refuses new registrations when the crowd is at capacity', () => {
      const { crowd: fullCrowd } = makeMockCrowd(0);
      const fullAdapter = new NavmeshMovementAdapter(fullCrowd);
      expect(fullAdapter.registerAgent(makeCombatant())).toBe(false);
    });

    it('returns false when the crowd rejects the agent', () => {
      (crowd.addAgent as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('crowd full');
      });
      expect(adapter.registerAgent(makeCombatant())).toBe(false);
    });
  });

  describe('unregisterAgent', () => {
    it('drops the agent from the adapter', () => {
      const c = makeCombatant();
      adapter.registerAgent(c);
      adapter.unregisterAgent('npc-1');
      expect(adapter.hasAgent('npc-1')).toBe(false);
      expect(adapter.getAgentCount()).toBe(0);
    });

    it('is a no-op for an unknown id', () => {
      expect(() => adapter.unregisterAgent('nonexistent')).not.toThrow();
    });
  });

  describe('updateAgentTarget', () => {
    it('forwards the combatant destination to the crowd agent', () => {
      const c = makeCombatant({ destinationPoint: new THREE.Vector3(100, 5, 200) });
      adapter.registerAgent(c);
      adapter.updateAgentTarget(c);
      // Contract: target forwarded with matching XZ (Y offset is an internal tuning detail).
      expect(agents[0].requestMoveTarget).toHaveBeenCalledTimes(1);
      const arg = (agents[0].requestMoveTarget as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(arg.x).toBe(100);
      expect(arg.z).toBe(200);
    });

    it('avoids redundant crowd updates when the destination barely moves', () => {
      const c = makeCombatant({ destinationPoint: new THREE.Vector3(100, 5, 200) });
      adapter.registerAgent(c);
      adapter.updateAgentTarget(c);

      // A very small nudge should not generate a fresh crowd request.
      c.destinationPoint = new THREE.Vector3(100.1, 5, 200.1);
      adapter.updateAgentTarget(c);

      // A large jump (well beyond any debounce threshold) should push a new target.
      c.destinationPoint = new THREE.Vector3(500, 5, 200);
      adapter.updateAgentTarget(c);

      expect(agents[0].requestMoveTarget).toHaveBeenCalledTimes(2);
    });

    it('skips combatants without a destination', () => {
      const c = {
        ...makeCombatant(),
        destinationPoint: undefined,
      } as unknown as Combatant;
      adapter.registerAgent(c);
      adapter.updateAgentTarget(c);
      expect(agents[0].requestMoveTarget).not.toHaveBeenCalled();
    });

    it('skips combatants that were never registered', () => {
      const c = makeCombatant();
      adapter.updateAgentTarget(c);
      expect(agents).toHaveLength(0);
    });
  });

  describe('applyAgentVelocity', () => {
    it('overrides combatant XZ velocity from the crowd agent and preserves Y', () => {
      const c = makeCombatant({ velocity: new THREE.Vector3(0, -1, 0) });
      adapter.registerAgent(c);
      adapter.applyAgentVelocity(c);
      expect(c.velocity.x).toBe(1);
      expect(c.velocity.z).toBe(2);
      expect(c.velocity.y).toBe(-1);
    });

    it('leaves velocity unchanged for an unregistered combatant', () => {
      const c = makeCombatant({ velocity: new THREE.Vector3(5, 0, 5) });
      adapter.applyAgentVelocity(c);
      expect(c.velocity.x).toBe(5);
      expect(c.velocity.z).toBe(5);
    });
  });

  describe('dispose', () => {
    it('removes all registered agents', () => {
      adapter.registerAgent(makeCombatant({ id: 'a' }));
      adapter.registerAgent(makeCombatant({ id: 'b' }));
      expect(adapter.getAgentCount()).toBe(2);
      adapter.dispose();
      expect(adapter.getAgentCount()).toBe(0);
    });
  });
});
