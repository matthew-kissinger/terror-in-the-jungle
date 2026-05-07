import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantMovement } from './CombatantMovement';
import { CombatantState } from './types';
import { createTestCombatant, mockTerrainRuntime } from '../../test-utils';
import { NPC_MAX_SPEED, NPC_Y_OFFSET } from '../../config/CombatantConfig';

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

  it('steers long-range movement toward the current navmesh waypoint through the terrain-aware solver', () => {
    const adapter = mockNavmeshAdapter();
    const navSystem = mockNavmeshSystem(adapter);
    const startWaypoint = new THREE.Vector3(0, 0, 0);
    const routeWaypoint = new THREE.Vector3(0, 0, 80);
    const destination = new THREE.Vector3(120, 0, 0);
    navSystem.queryPath.mockReturnValue([
      startWaypoint,
      routeWaypoint,
      destination,
    ]);
    movement.setNavmeshSystem(navSystem as any);

    const c = createTestCombatant({
      id: 'npc-route',
      state: CombatantState.ADVANCING,
      position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
      destinationPoint: destination.clone(),
      lodLevel: 'high',
    });

    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    expect(navSystem.queryPath).toHaveBeenCalledTimes(1);
    expect(c.velocity.z).toBeGreaterThan(Math.abs(c.velocity.x));
    expect(c.movementAnchor?.x).toBeCloseTo(routeWaypoint.x);
    expect(c.movementAnchor?.z).toBeCloseTo(routeWaypoint.z);
  });

  it('skips a terrain-blocked navmesh waypoint when the next route point is immediately walkable', () => {
    terrain.getHeightAt = vi.fn((x: number, z: number) => (
      x > 0 && Math.abs(z) < 4 ? x * 2 : 0
    ));
    const adapter = mockNavmeshAdapter();
    const navSystem = mockNavmeshSystem(adapter);
    const blockedWaypoint = new THREE.Vector3(30, 0, 0);
    const sideWaypoint = new THREE.Vector3(0, 0, 30);
    const destination = new THREE.Vector3(120, 0, 0);
    navSystem.queryPath.mockReturnValue([
      new THREE.Vector3(0, 0, 0),
      blockedWaypoint,
      sideWaypoint,
      destination,
    ]);
    movement.setNavmeshSystem(navSystem as any);

    const c = createTestCombatant({
      id: 'npc-route-lip',
      state: CombatantState.ADVANCING,
      position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
      destinationPoint: destination.clone(),
      lodLevel: 'high',
    });

    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    expect(navSystem.queryPath).toHaveBeenCalledTimes(1);
    expect(c.movementAnchor?.x).toBeCloseTo(sideWaypoint.x);
    expect(c.movementAnchor?.z).toBeCloseTo(sideWaypoint.z);
    expect(c.velocity.z).toBeGreaterThan(Math.abs(c.velocity.x));
  });

  it('does not let navmesh steering override an active backtrack recovery point', () => {
    const adapter = mockNavmeshAdapter();
    const navSystem = mockNavmeshSystem(adapter);
    navSystem.queryPath.mockReturnValue([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 80),
      new THREE.Vector3(120, 0, 0),
    ]);
    movement.setNavmeshSystem(navSystem as any);

    const backtrackPoint = new THREE.Vector3(-30, NPC_Y_OFFSET, 0);
    const c = createTestCombatant({
      id: 'npc-backtrack',
      state: CombatantState.ADVANCING,
      position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
      destinationPoint: new THREE.Vector3(120, 0, 0),
      lodLevel: 'high',
    });
    c.movementBacktrackPoint = backtrackPoint.clone();

    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    expect(navSystem.queryPath).not.toHaveBeenCalled();
    expect(c.velocity.x).toBeLessThan(0);
    expect(c.movementAnchor?.x).toBeCloseTo(backtrackPoint.x);
    expect(c.movementIntent).toBe('backtrack');
  });

  it('backs up toward last-good navmesh progress instead of the current-position snap', () => {
    const adapter = mockNavmeshAdapter();
    const navSystem = mockNavmeshSystem(adapter);
    navSystem.findNearestPoint.mockImplementation((point: THREE.Vector3) => (
      point.x < -4
        ? new THREE.Vector3(-8, 0, 0)
        : new THREE.Vector3(0, 0, 0)
    ));
    movement.setNavmeshSystem(navSystem as any);

    const c = createTestCombatant({
      id: 'npc-navmesh-recovery',
      state: CombatantState.ADVANCING,
      position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
      destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
      movementLastGoodPosition: new THREE.Vector3(-8, NPC_Y_OFFSET, 0),
      lodLevel: 'high',
    });

    const activated = (movement as unknown as {
      activateBacktrack: (combatant: typeof c) => boolean;
    }).activateBacktrack(c);

    expect(activated).toBe(true);
    expect(navSystem.findNearestPoint).toHaveBeenCalledWith(
      expect.objectContaining({ x: -8, z: 0 }),
      10,
    );
    expect(c.movementBacktrackPoint?.x).toBeCloseTo(-8);
    expect(c.movementBacktrackPoint?.y).toBeCloseTo(NPC_Y_OFFSET);
    expect(c.movementIntent).toBe('backtrack');
  });

  it('falls back to a scored recovery point when navmesh snapping would no-op', () => {
    const adapter = mockNavmeshAdapter();
    const navSystem = mockNavmeshSystem(adapter);
    navSystem.findNearestPoint.mockReturnValue(new THREE.Vector3(0, 0, 0));
    movement.setNavmeshSystem(navSystem as any);

    const c = createTestCombatant({
      id: 'npc-navmesh-recovery-noop',
      state: CombatantState.ADVANCING,
      position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
      destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
      movementLastGoodPosition: new THREE.Vector3(-8, NPC_Y_OFFSET, 0),
      lodLevel: 'high',
    });

    const activated = (movement as unknown as {
      activateBacktrack: (combatant: typeof c) => boolean;
    }).activateBacktrack(c);

    expect(activated).toBe(true);
    expect(c.movementBacktrackPoint).toBeDefined();
    expect(c.position.distanceToSquared(c.movementBacktrackPoint!)).toBeGreaterThan(2.25);
    expect(c.movementIntent).toBe('backtrack');
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

    expect(c.velocity.x).toBeGreaterThan(4);
    expect(Math.abs(c.velocity.z)).toBeLessThan(0.01);
  });

  it('moves retreating units toward their fallback anchor instead of carrying stale combat velocity', () => {
    const c = createTestCombatant({
      id: 'npc-retreating',
      state: CombatantState.RETREATING,
      position: new THREE.Vector3(0, 0, 0),
      destinationPoint: new THREE.Vector3(40, 0, 0),
      velocity: new THREE.Vector3(-2, 0, 0),
      lodLevel: 'high',
    });

    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    expect(c.velocity.x).toBeGreaterThan(4);
    expect(Math.abs(c.velocity.z)).toBeLessThan(0.01);
    expect(c.position.x).toBeGreaterThan(0);
    expect(c.movementAnchor?.x).toBeCloseTo(40);
    expect(c.movementIntent).toBe('direct_push');
  });

  it('caps post-spacing horizontal velocity at the shared NPC max speed', () => {
    const c = createTestCombatant({
      id: 'npc-spacing-fast',
      state: CombatantState.PATROLLING,
      squadRole: 'leader' as const,
      position: new THREE.Vector3(0, 0, 0),
      destinationPoint: new THREE.Vector3(200, 0, 0),
      lodLevel: 'high',
    });
    const neighbor = createTestCombatant({
      id: 'npc-spacing-neighbor',
      position: new THREE.Vector3(-0.5, 0, 0),
    });
    const combatants = new Map([
      [c.id, c],
      [neighbor.id, neighbor],
    ]);
    movement.setSpatialGridManager({
      queryRadius: vi.fn(() => [c.id, neighbor.id]),
    } as any);

    movement.updateMovement(c, 0.016, new Map(), combatants, {
      disableTerrainSample: true,
    });

    expect(c.velocity.length()).toBeLessThanOrEqual(NPC_MAX_SPEED + 1e-6);
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

    expect(c.velocity.x).toBeGreaterThan(4.3);
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

  it('snaps visual rotation to authoritative facing without turn smoothing', () => {
    const c = createTestCombatant({
      id: 'npc-turn',
      rotation: Math.PI * 1.5,
      visualRotation: 0.25,
      rotationVelocity: 3,
    });

    movement.updateRotation(c, 0.016);

    expect(c.visualRotation).toBeCloseTo(Math.PI * 1.5);
    expect(c.rotationVelocity).toBe(0);
  });

  it('normalizes snapped visual rotation and clears invalid turn velocity', () => {
    const c = createTestCombatant({
      id: 'npc-turn-wrap',
      rotation: -Math.PI / 2,
      visualRotation: Number.NaN,
      rotationVelocity: Number.POSITIVE_INFINITY,
    });

    movement.updateRotation(c, 10);

    expect(c.visualRotation).toBeCloseTo(Math.PI * 1.5);
    expect(c.rotationVelocity).toBe(0);
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
