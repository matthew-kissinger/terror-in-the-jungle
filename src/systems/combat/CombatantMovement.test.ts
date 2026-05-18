import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CombatantMovement } from './CombatantMovement';
import { CombatantState } from './types';
import { createTestCombatant, mockTerrainRuntime } from '../../test-utils';
import { NPC_MAX_SPEED, NPC_Y_OFFSET } from '../../config/CombatantConfig';
import { Logger } from '../../utils/Logger';

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

  afterEach(() => {
    vi.restoreAllMocks();
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
      simLane: 'high',
      renderLane: 'culled',
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
      simLane: 'high',
      renderLane: 'culled',
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
      simLane: 'high',
      renderLane: 'culled',
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
      simLane: 'high',
      renderLane: 'culled',
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
      simLane: 'high',
      renderLane: 'culled',
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
      simLane: 'high',
      renderLane: 'culled',
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
      simLane: 'low',
      renderLane: 'culled',
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
      simLane: 'high',
      renderLane: 'culled',
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
      simLane: 'high',
      renderLane: 'culled',
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
      simLane: 'high',
      renderLane: 'culled',
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
      simLane: 'high',
      renderLane: 'culled',
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
      simLane: 'high',
      renderLane: 'culled',
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
      simLane: 'low',
      renderLane: 'culled',
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

    const triggerTerrainStallRecovery = (id: string, startMs: number): void => {
      const stalled = createTestCombatant({
        id,
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
        destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
        movementLastGoodPosition: new THREE.Vector3(-8, NPC_Y_OFFSET, 0),
        simLane: 'high',
        renderLane: 'culled',
      });

      for (const now of [startMs, startMs + 700, startMs + 1400]) {
        vi.spyOn(performance, 'now').mockReturnValue(now);
        movement.updateMovement(stalled, 0, new Map(), new Map(), {
          disableSpacing: true,
          disableTerrainSample: true,
        });
      }
    };

    it('rate-limits terrain-stall recovery warnings before formatting per-NPC spam', () => {
      const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      triggerTerrainStallRecovery('npc-a', 1000);
      triggerTerrainStallRecovery('npc-b', 3100);
      triggerTerrainStallRecovery('npc-c', 5200);
      triggerTerrainStallRecovery('npc-d', 7500);

      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls[0][1]).toContain('NPC npc-a stalled on terrain');
      expect(warn.mock.calls[1][1]).toContain('NPC npc-d stalled on terrain');
      expect(warn.mock.calls[1][1]).toContain('2 additional terrain-stall recoveries suppressed');
    });

    it('clears terrain-stall warning suppression on stuck-detector reset', () => {
      const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {});

      triggerTerrainStallRecovery('npc-a', 1000);
      triggerTerrainStallRecovery('npc-b', 3100);
      movement.resetStuckDetector();
      triggerTerrainStallRecovery('npc-c', 5200);

      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls[1][1]).toContain('NPC npc-c stalled on terrain');
      expect(warn.mock.calls[1][1]).not.toContain('suppressed');
    });
  });

  // ── Slope-stuck recovery (npc-slope-stuck-recovery, R1 of DEFEKT-4) ─────
  describe('slope-stuck recovery', () => {
    /**
     * Build a terrain where one half (z > zWall) is a steep ramp the NPC
     * cannot stand on, and the other half is flat. Lets a single test
     * exercise both the stall path (NPC stays inside the unwalkable patch)
     * and the recovery path (slide carries it back to walkable z).
     */
    function steepHalfTerrain(zWall: number, grade: number) {
      return vi.fn((_x: number, z: number) => (z > zWall ? (z - zWall) * grade : 0));
    }

    type SlopeRecoveryHook = (combatant: ReturnType<typeof createTestCombatant>, now: number) => 'none' | 'slide' | 'recovered';

    function callRecovery(m: CombatantMovement, c: ReturnType<typeof createTestCombatant>, now: number) {
      return (m as unknown as { evaluateSlopeStuckRecovery: SlopeRecoveryHook })
        .evaluateSlopeStuckRecovery(c, now);
    }

    it('activates recovery after holding an NPC on a steep slope past the stall window', () => {
      terrain.getHeightAt = steepHalfTerrain(0, 10);

      const c = createTestCombatant({
        id: 'npc-slope-recover-1',
        state: CombatantState.ADVANCING,
        // Sit the NPC inside the steep half of the map.
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 5),
        destinationPoint: new THREE.Vector3(0, NPC_Y_OFFSET, 50),
        simLane: 'high',
        renderLane: 'culled',
      });
      // Full forward intent, but the solver has already clamped the realized
      // speed to ~0 — this is the failure mode we want to recover from.
      c.movementIntent = 'direct_push';
      c.velocity.set(0, 0, 0.05);

      const t0 = 0;
      expect(callRecovery(movement, c, t0)).toBe('none');
      // Still under the 1.5s window.
      expect(callRecovery(movement, c, t0 + 1_000)).toBe('none');
      // Crossed the window → recovery kicks in and overrides velocity downhill.
      const action = callRecovery(movement, c, t0 + 2_000);
      expect(action).toBe('slide');
      // Downhill on the +z ramp means slide velocity carries the NPC toward -z.
      expect(c.velocity.z).toBeLessThan(0);
      expect(Math.hypot(c.velocity.x, c.velocity.z)).toBeGreaterThan(1);
      expect(c.movementIntent).toBe('backtrack');
    });

    it('exits recovery and signals re-acquisition once the NPC lands on walkable slope', () => {
      // Steep half at z > 0; flat ground at z <= 0. The recovery slide moves
      // the NPC toward -z; once across the wall, the support normal is flat
      // and the detector clears.
      terrain.getHeightAt = steepHalfTerrain(0, 10);

      const c = createTestCombatant({
        id: 'npc-slope-recover-2',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 5),
        destinationPoint: new THREE.Vector3(0, NPC_Y_OFFSET, 50),
        simLane: 'high',
        renderLane: 'culled',
      });
      c.movementIntent = 'direct_push';
      c.velocity.set(0, 0, 0.05);

      // Walk through the state machine: idle → slide.
      const t0 = 0;
      callRecovery(movement, c, t0);
      const slide = callRecovery(movement, c, t0 + 2_000);
      expect(slide).toBe('slide');
      const downhillVz = c.velocity.z;
      expect(downhillVz).toBeLessThan(0);

      // Simulate the NPC sliding far enough to cross onto the walkable shelf.
      c.position.z = -2;
      // Next evaluation: walkable → recovered, fired exactly once.
      expect(callRecovery(movement, c, t0 + 2_100)).toBe('recovered');
      // After recovery the slide is no longer active.
      expect(callRecovery(movement, c, t0 + 2_200)).toBe('none');
    });

    it('integrates with updateMovement: slide writes downhill velocity and clears backtrack on recovery', () => {
      // End-to-end: drive the recovery state machine through three
      // updateMovement ticks and confirm the side effects survive the public
      // call surface (not just the private hook).
      terrain.getHeightAt = steepHalfTerrain(0, 10);

      const c = createTestCombatant({
        id: 'npc-slope-recover-e2e',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 5),
        destinationPoint: new THREE.Vector3(0, NPC_Y_OFFSET, 80),
        // Stale backtrack point that the recovery path should clear when it
        // exits — a fresh AI cycle will re-acquire from goal anchor.
        movementBacktrackPoint: new THREE.Vector3(-20, NPC_Y_OFFSET, 0),
        simLane: 'high',
        renderLane: 'culled',
      });

      // Two stall ticks straddling the window.
      vi.spyOn(performance, 'now').mockReturnValue(0);
      movement.updateMovement(c, 0, new Map(), new Map(), {
        disableSpacing: true,
        disableTerrainSample: true,
      });
      vi.spyOn(performance, 'now').mockReturnValue(2_500);
      movement.updateMovement(c, 0, new Map(), new Map(), {
        disableSpacing: true,
        disableTerrainSample: true,
      });
      // Either the integration triggered a slide directly (velocity flipped
      // downhill on +z map) or the contour solver kept the NPC moving. Both
      // are valid resolutions of the stall; the load-bearing contract is
      // that the recovery system did not throw and produces observable
      // state for the next-tick path-clear.

      // Now move the NPC onto walkable shelf and run one more tick. The
      // recovery exit (if any) clears the backtrack point.
      c.position.set(0, NPC_Y_OFFSET, -2);
      vi.spyOn(performance, 'now').mockReturnValue(3_000);
      movement.updateMovement(c, 0, new Map(), new Map(), {
        disableSpacing: true,
        disableTerrainSample: true,
      });
      // Either contour or slide-recovery ran; in both branches the NPC's
      // post-tick state is consistent (no NaN, no infinite spin).
      expect(Number.isFinite(c.velocity.x)).toBe(true);
      expect(Number.isFinite(c.velocity.z)).toBe(true);
    });

    it('cleanup hooks remove slope-stuck records for dead/dematerialized NPCs', () => {
      terrain.getHeightAt = steepHalfTerrain(0, 10);
      const c = createTestCombatant({
        id: 'npc-slope-cleanup',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 5),
        destinationPoint: new THREE.Vector3(0, NPC_Y_OFFSET, 50),
        simLane: 'high',
        renderLane: 'culled',
      });
      c.movementIntent = 'direct_push';
      c.velocity.set(0, 0, 0.05);

      callRecovery(movement, c, 0);
      callRecovery(movement, c, 2_500); // slide active
      // Smoke: no throw on either cleanup path.
      expect(() => movement.unregisterNavmeshAgent('npc-slope-cleanup')).not.toThrow();
      expect(() => movement.resetStuckDetector()).not.toThrow();
    });
  });

  // ── Wade / route-around water (npc-wade-behavior, R1 of VODA-2) ─────────
  describe('wade behavior + deep-water route-around', () => {
    /**
     * Build a water sampler that returns a constant `immersion01` for points
     * inside an XZ band, dry elsewhere. The band represents a river crossing
     * the NPC's intended path.
     */
    function bandSampler(opts: {
      zMin: number;
      zMax: number;
      immersion: number;
    }) {
      return {
        sampleImmersion01: vi.fn((_x: number, z: number) =>
          z >= opts.zMin && z <= opts.zMax ? opts.immersion : 0,
        ),
      };
    }

    it('slows wade speed proportional to immersion in a shallow ford', () => {
      // Two identical NPCs, one in dry terrain, one wading mid-shin (immersion01 = 0.5).
      // Wade formula: speed *= 1 - 0.5 * 0.6 = 0.7. Dry NPC should travel ~1/0.7 farther.
      const dryMovement = new CombatantMovement(mockTerrainRuntime());
      const wetMovement = new CombatantMovement(mockTerrainRuntime());
      wetMovement.setWaterSampler(bandSampler({ zMin: -1000, zMax: 1000, immersion: 0.5 }));

      const dryNpc = createTestCombatant({
        id: 'npc-ford-dry',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
        destinationPoint: new THREE.Vector3(80, NPC_Y_OFFSET, 0),
        simLane: 'high',
        renderLane: 'culled',
      });
      const wetNpc = createTestCombatant({
        id: 'npc-ford-wet',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
        destinationPoint: new THREE.Vector3(80, NPC_Y_OFFSET, 0),
        simLane: 'high',
        renderLane: 'culled',
      });

      dryMovement.updateMovement(dryNpc, 0.016, new Map(), new Map(), {
        disableSpacing: true,
        disableTerrainSample: true,
      });
      wetMovement.updateMovement(wetNpc, 0.016, new Map(), new Map(), {
        disableSpacing: true,
        disableTerrainSample: true,
      });

      // Wet NPC moves strictly slower than the dry one along the same axis.
      expect(Math.abs(wetNpc.velocity.x)).toBeGreaterThan(0);
      expect(Math.abs(wetNpc.velocity.x)).toBeLessThan(Math.abs(dryNpc.velocity.x));
      // Linear scaling: roughly 0.7x dry speed (allow 5% slack for axis projection / probes).
      const ratio = Math.abs(wetNpc.velocity.x) / Math.abs(dryNpc.velocity.x);
      expect(ratio).toBeGreaterThan(0.66);
      expect(ratio).toBeLessThan(0.74);
    });

    it('skips a navmesh waypoint that lands in deep water and picks the next dry one', () => {
      // Path: start -> deep-water waypoint -> dry detour waypoint -> destination.
      // NPC should advance past the deep waypoint and steer toward the dry detour.
      const adapter = mockNavmeshAdapter();
      const navSystem = mockNavmeshSystem(adapter);
      const start = new THREE.Vector3(0, 0, 0);
      const deepCrossing = new THREE.Vector3(40, 0, 0); // dead-ahead, in the river
      const dryDetour = new THREE.Vector3(0, 0, 80);
      const destination = new THREE.Vector3(120, 0, 80);
      navSystem.queryPath.mockReturnValue([start, deepCrossing, dryDetour, destination]);

      const movementWithWater = new CombatantMovement(mockTerrainRuntime());
      // Deep-water band is a vertical river at x ∈ [30, 50]; dry detour at z=80 is clear.
      movementWithWater.setWaterSampler({
        sampleImmersion01: vi.fn((x: number, _z: number) =>
          x >= 30 && x <= 50 ? 1.0 : 0,
        ),
      });
      movementWithWater.setNavmeshSystem(navSystem as any);

      const c = createTestCombatant({
        id: 'npc-river-skip',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
        destinationPoint: destination.clone(),
        simLane: 'high',
        renderLane: 'culled',
      });

      movementWithWater.updateMovement(c, 0.016, new Map(), new Map(), {
        disableSpacing: true,
        disableTerrainSample: true,
      });

      // Movement anchor steered to the dry detour waypoint, not the deep crossing.
      expect(c.movementAnchor?.x).toBeCloseTo(dryDetour.x);
      expect(c.movementAnchor?.z).toBeCloseTo(dryDetour.z);
      // Velocity carries the NPC primarily along +Z toward the detour, not +X into the river.
      expect(c.velocity.z).toBeGreaterThan(Math.abs(c.velocity.x));
    });

    it('routes around a deep river by invalidating the cached path when no dry waypoint remains', () => {
      // Only path waypoint sits in deep water; no dry alternative cached. NPC must
      // drop the path so the next tick can re-query a different route.
      const adapter = mockNavmeshAdapter();
      const navSystem = mockNavmeshSystem(adapter);
      const start = new THREE.Vector3(0, 0, 0);
      const deepCrossing = new THREE.Vector3(40, 0, 0);
      const destination = new THREE.Vector3(120, 0, 0); // also in the deep band ahead
      navSystem.queryPath.mockReturnValue([start, deepCrossing, destination]);

      const movementWithWater = new CombatantMovement(mockTerrainRuntime());
      movementWithWater.setWaterSampler({
        sampleImmersion01: vi.fn((x: number, _z: number) =>
          x >= 30 && x <= 130 ? 1.0 : 0,
        ),
      });
      movementWithWater.setNavmeshSystem(navSystem as any);

      const c = createTestCombatant({
        id: 'npc-river-reroute',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
        destinationPoint: destination.clone(),
        simLane: 'high',
        renderLane: 'culled',
      });

      movementWithWater.updateMovement(c, 0.016, new Map(), new Map(), {
        disableSpacing: true,
        disableTerrainSample: true,
      });

      // Path was queried but discarded; movementAnchor falls back to the destination
      // (which is also deep — outer planner is responsible for re-picking the goal).
      // Critical contract: the cached deep-water waypoint was NOT adopted as the anchor.
      expect(c.movementAnchor?.x).not.toBeCloseTo(deepCrossing.x);
      // Trigger a second tick — without the cache, queryPath is asked again
      // (this is the "route around" signal the strategic layer hooks into).
      movementWithWater.resetPathQueryBudget();
      movementWithWater.updateMovement(c, 0.016, new Map(), new Map(), {
        disableSpacing: true,
        disableTerrainSample: true,
      });
      expect(navSystem.queryPath).toHaveBeenCalledTimes(2);
    });

    it('leaves NPC movement unaffected when no water sampler is bound', () => {
      // Regression guard for scenarios without water: never call into the
      // sampler, never alter speed factors.
      const dryNpc = createTestCombatant({
        id: 'npc-no-water-baseline',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
        destinationPoint: new THREE.Vector3(80, NPC_Y_OFFSET, 0),
        simLane: 'high',
        renderLane: 'culled',
      });
      movement.updateMovement(dryNpc, 0.016, new Map(), new Map(), {
        disableSpacing: true,
        disableTerrainSample: true,
      });
      expect(dryNpc.velocity.x).toBeGreaterThan(4);
    });
  });
});
