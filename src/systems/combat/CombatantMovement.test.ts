import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantMovement } from './CombatantMovement';
import { CombatantState } from './types';
import { createTestCombatant, mockTerrainRuntime } from '../../test-utils';
import { NPC_MAX_SPEED } from '../../config/CombatantConfig';

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

  it('bounds per-tick position delta even under a hitching deltaTime', () => {
    // Frame hitches (GC pause, long frame) can deliver oversized dt to the movement
    // integrator. The position step must stay bounded so NPCs cannot teleport.
    const c = createTestCombatant({
      id: 'npc-hitch',
      state: CombatantState.ADVANCING,
      position: new THREE.Vector3(0, 0, 0),
      destinationPoint: new THREE.Vector3(100, 0, 0),
      lodLevel: 'high',
    });

    const startX = c.position.x;
    const startZ = c.position.z;

    // 2 seconds of dt in a single tick — represents a severe hitch.
    movement.updateMovement(c, 2.0, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    const horizontalDelta = Math.hypot(c.position.x - startX, c.position.z - startZ);
    // Upper bound: NPC_MAX_SPEED * MAX_DELTA_TIME (0.1s clamp) = 0.8m, with a small
    // tolerance for downstream steering adjustments. Definitively far below the ~16m
    // that an unclamped 2.0s dt * 8 m/s would produce.
    expect(horizontalDelta).toBeLessThan(NPC_MAX_SPEED * 0.1 + 0.5);
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
