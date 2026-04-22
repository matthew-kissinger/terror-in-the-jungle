import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantMovement } from './CombatantMovement';
import { CombatantState } from './types';
import { createTestCombatant, mockTerrainRuntime } from '../../test-utils';
import { NPC_Y_OFFSET } from '../../config/CombatantConfig';

function mockNavmeshAdapter(agentIds: Set<string> = new Set()) {
  return {
    hasAgent: vi.fn((id: string) => agentIds.has(id)),
    registerAgent: vi.fn(() => true),
    unregisterAgent: vi.fn((id: string) => agentIds.delete(id)),
    updateAgentTarget: vi.fn(),
    applyAgentVelocity: vi.fn(),
    getAgentCount: vi.fn(() => agentIds.size),
    dispose: vi.fn(),
  };
}

function mockNavmeshSystem(adapter: ReturnType<typeof mockNavmeshAdapter> | null) {
  return {
    getAdapter: vi.fn(() => adapter),
    init: vi.fn(),
    generateNavmesh: vi.fn(),
    update: vi.fn(),
    isReady: vi.fn(() => !!adapter),
    isWasmReady: vi.fn(() => !!adapter),
    queryPath: vi.fn(() => null), // default: no path available, fall through to terrain solver
    findNearestPoint: vi.fn(() => null),
    isPointOnNavmesh: vi.fn(() => false),
    validateConnectivity: vi.fn(() => ({ connected: true, islands: [[0]] })),
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

  it('unregisters legacy navmesh crowd agents and uses the terrain-aware mover', () => {
    const adapter = mockNavmeshAdapter(new Set(['npc1']));
    const navSystem = mockNavmeshSystem(adapter);
    movement.setNavmeshSystem(navSystem as any);

    const c = createTestCombatant({
      id: 'npc1',
      state: CombatantState.PATROLLING,
      squadRole: 'leader' as const,
      position: new THREE.Vector3(0, 0, 0),
      destinationPoint: new THREE.Vector3(20, 0, 0),
      lodLevel: 'high',
    });

    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    expect(adapter.unregisterAgent).toHaveBeenCalledWith('npc1');
    expect(c.velocity.lengthSq()).toBeGreaterThan(0);
  });

  it('contours on an unwalkable uphill instead of zeroing velocity', () => {
    terrain.getHeightAt = vi.fn((x: number) => Math.max(0, x * 2));

    const c = createTestCombatant({
      id: 'npc-steep',
      state: CombatantState.PATROLLING,
      squadRole: 'leader' as const,
      position: new THREE.Vector3(0, 0, 0),
      destinationPoint: new THREE.Vector3(30, 0, 0),
      lodLevel: 'low',
    });

    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    expect(c.velocity.lengthSq()).toBeGreaterThan(0.1);
    expect(Math.abs(c.velocity.z)).toBeGreaterThan(0.1);
    expect(c.position.distanceToSquared(new THREE.Vector3(0, 0, 0))).toBeGreaterThan(0.0001);
  });

  it('uses traversal-speed movement while advancing to a flank anchor', () => {
    const c = createTestCombatant({
      id: 'npc-advancing',
      state: CombatantState.ADVANCING,
      position: new THREE.Vector3(0, 0, 0),
      destinationPoint: new THREE.Vector3(80, 0, 0),
      lodLevel: 'high',
    });

    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    expect(c.velocity.x).toBeGreaterThan(6.5);
    expect(Math.abs(c.velocity.z)).toBeLessThan(0.01);
  });

  it('maintains strong direct uphill progress on climbable grades', () => {
    terrain.getHeightAt = vi.fn((x: number) => Math.max(0, x * 0.5));

    const c = createTestCombatant({
      id: 'npc-uphill',
      state: CombatantState.ADVANCING,
      position: new THREE.Vector3(0, 0, 0),
      destinationPoint: new THREE.Vector3(80, 0, 0),
      lodLevel: 'high',
    });

    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    expect(c.velocity.x).toBeGreaterThan(7.4);
    expect(Math.abs(c.velocity.z)).toBeLessThan(0.2);
  });

  it('holds position while suppressing instead of inheriting stale traversal velocity', () => {
    const c = createTestCombatant({
      id: 'npc-suppressing',
      state: CombatantState.SUPPRESSING,
      position: new THREE.Vector3(0, 0, 0),
      suppressionTarget: new THREE.Vector3(25, 0, 0),
      lodLevel: 'high',
    });
    c.velocity.set(4, 0, 1);

    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    expect(c.velocity.lengthSq()).toBe(0);
    expect(c.rotation).toBeCloseTo(0);
  });

  it('can ground a low-cost LOD combatant without running the full solver', () => {
    terrain.getHeightAt = vi.fn((x: number) => 5 + x * 0.5);
    const c = createTestCombatant({
      id: 'npc-low-cost',
      position: new THREE.Vector3(20, 42, 0),
      lodLevel: 'low',
    });

    expect(movement.syncTerrainHeight(c)).toBe(true);

    expect(c.position.y).toBeCloseTo(15 + NPC_Y_OFFSET);
    expect(c.terrainSampleHeight).toBeCloseTo(15);
  });

  describe('stuck detector integration', () => {
    it('does not crash when processing dead NPC', () => {
      const c = createTestCombatant({
        id: 'npc1',
        state: CombatantState.DEAD,
        position: new THREE.Vector3(0, 0, 0),
      });

      movement.updateMovement(c, 0.016, new Map(), new Map(), {
        disableSpacing: true,
        disableTerrainSample: true,
      });

      expect(c.velocity.lengthSq()).toBe(0);
    });

    it('cleans up stuck records via unregisterNavmeshAgent', () => {
      expect(() => movement.unregisterNavmeshAgent('some-id')).not.toThrow();
    });

    it('resetStuckDetector does not throw', () => {
      expect(() => movement.resetStuckDetector()).not.toThrow();
    });
  });
});
