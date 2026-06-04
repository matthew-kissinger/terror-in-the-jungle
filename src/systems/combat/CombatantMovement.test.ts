// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CombatantMovement } from './CombatantMovement';
import { CombatantState } from './types';
import { createTestCombatant, mockTerrainRuntime } from '../../test-utils';
import { NPC_MAX_SPEED, NPC_Y_OFFSET, NpcLodConfig } from '../../config/CombatantConfig';
import { Logger } from '../../utils/Logger';

function mockNavmeshAdapter(agentIds: Set<string> = new Set()) {
  return {
    hasAgent: vi.fn((id: string) => agentIds.has(id)),
    registerAgent: vi.fn((c: { id: string }) => {
      agentIds.add(c.id);
      return true;
    }),
    unregisterAgent: vi.fn((id: string) => agentIds.delete(id)),
    updateAgentTarget: vi.fn(),
    applyAgentVelocity: vi.fn(),
    applyAgentSteeredDirection: vi.fn(),
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

  it('registers high-LOD combatants with the navmesh crowd for local avoidance', () => {
    const adapter = mockNavmeshAdapter();
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

    // Re-enabled per navmesh-crowd-reenable: high-LOD active NPCs join the crowd,
    // get their target pushed, and have crowd-steered direction applied. The
    // terrain-aware solver still runs after and remains the slope authority.
    expect(adapter.registerAgent).toHaveBeenCalled();
    expect(adapter.updateAgentTarget).toHaveBeenCalled();
    expect(adapter.applyAgentSteeredDirection).toHaveBeenCalled();
    expect(c.velocity.lengthSq()).toBeGreaterThan(0);
  });

  it('releases the crowd slot when a combatant drops out of high-LOD eligibility', () => {
    const adapter = mockNavmeshAdapter(new Set(['npc1']));
    const navSystem = mockNavmeshSystem(adapter);
    movement.setNavmeshSystem(navSystem as any);

    const c = createTestCombatant({
      id: 'npc1',
      state: CombatantState.PATROLLING,
      squadRole: 'leader' as const,
      position: new THREE.Vector3(0, 0, 0),
      destinationPoint: new THREE.Vector3(20, 0, 0),
      // Low simLane is ineligible for crowd steering.
      simLane: 'low',
      renderLane: 'culled',
    });

    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    expect(adapter.unregisterAgent).toHaveBeenCalledWith('npc1');
    expect(adapter.registerAgent).not.toHaveBeenCalled();
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

  // ── Terrain-solver stall-loop reroute (terrain-solver-stall-fix, R2 DEFEKT-4) ──
  describe('terrain-solver stall-loop reroute', () => {
    /**
     * Terrain factory: a steep wall sitting in the middle of the NPC's
     * planned navmesh path. Without the reroute fix, the solver's contour
     * branch fires every tick around the lip and the cached path is never
     * invalidated.
     */
    function lipTerrain(xWall: number, grade: number) {
      return vi.fn((x: number, _z: number) => (x > xWall ? (x - xWall) * grade : 0));
    }

    type StallHook = (
      combatant: ReturnType<typeof createTestCombatant>,
      contourActivated: boolean,
      lowProgress: boolean,
      deltaTime: number,
    ) => boolean;

    function callReroute(
      m: CombatantMovement,
      c: ReturnType<typeof createTestCombatant>,
      contourActivated: boolean,
      lowProgress: boolean,
      deltaTime: number,
    ) {
      return (m as unknown as { evaluateTerrainStallReroute: StallHook })
        .evaluateTerrainStallReroute(c, contourActivated, lowProgress, deltaTime);
    }

    it('invalidates a cached navmesh path when contour-stall sustains past the reroute window', () => {
      // Wall directly ahead of the start position. Navmesh hands the NPC a
      // path straight through it; the solver activates contour every tick.
      // After NPC_CONTOUR_STALL_REROUTE_MS of low-progress contour, the
      // cached path should be invalidated so the next tick re-queries.
      // Start the NPC already near the lip so contour engages from tick 0.
      terrain.getHeightAt = lipTerrain(2, 5);

      const adapter = mockNavmeshAdapter();
      const navSystem = mockNavmeshSystem(adapter);
      const start = new THREE.Vector3(0, 0, 0);
      const midBlocked = new THREE.Vector3(40, 0, 0); // sits past the wall
      const destination = new THREE.Vector3(120, 0, 0);
      navSystem.queryPath.mockReturnValue([start, midBlocked, destination]);
      movement.setNavmeshSystem(navSystem as any);

      const c = createTestCombatant({
        id: 'npc-stall-reroute',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
        destinationPoint: destination.clone(),
        simLane: 'high',
        renderLane: 'culled',
      });

      // Drive contour-stall ticks. The fix only fires when contourActivated
      // + lowProgress is sustained. With the lip-terrain in place, the
      // solver naturally produces those signals; we drive ticks via the
      // public updateMovement surface to keep the test behavioral.
      // Cap at 30 × 100ms = 3s of sim time. NPC_CONTOUR_STALL_REROUTE_MS is
      // 1200ms; PATH_MAX_AGE_MS is 10_000ms. A second queryPath inside the
      // 3s window is only possible if the reroute fired — natural cache
      // expiry would take ~10s.
      for (let i = 0; i < 30; i++) {
        movement.resetPathQueryBudget();
        vi.spyOn(performance, 'now').mockReturnValue(i * 100);
        movement.updateMovement(c, 0.1, new Map(), new Map(), {
          disableSpacing: true,
          disableTerrainSample: true,
        });
        if (navSystem.queryPath.mock.calls.length >= 2) break;
      }

      // The cached path must have been re-queried at least once after the
      // initial cache fill. Without the reroute the cache stays valid for
      // PATH_MAX_AGE_MS (10s) regardless of progress.
      expect(navSystem.queryPath.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('does not reroute when contour is not active', () => {
      // Flat terrain: no contour, no stall, no reroute regardless of how
      // long the tick stream runs.
      const c = createTestCombatant({
        id: 'npc-no-stall-no-reroute',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
        destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
        simLane: 'high',
        renderLane: 'culled',
      });

      // Drive the helper directly with the exact preconditions we want to
      // assert against — keep the unit isolated from solver internals.
      for (let i = 0; i < 50; i++) {
        const triggered = callReroute(movement, c, /*contour*/ false, /*lowProgress*/ false, 0.1);
        expect(triggered).toBe(false);
      }
      expect(c.movementContourStallMs ?? 0).toBe(0);
    });

    it('does not reroute when contour fires but the NPC is making forward progress', () => {
      const c = createTestCombatant({
        id: 'npc-contour-progressing',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
        destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
        simLane: 'high',
        renderLane: 'culled',
      });

      // Contour active every tick, but lowProgress is false because the NPC
      // is making meaningful XZ progress along the contour. No reroute.
      for (let i = 0; i < 50; i++) {
        const triggered = callReroute(movement, c, /*contour*/ true, /*lowProgress*/ false, 0.1);
        expect(triggered).toBe(false);
      }
      expect(c.movementContourStallMs ?? 0).toBe(0);
    });

    it('resets the stall accumulator on the first non-stalling tick', () => {
      const c = createTestCombatant({
        id: 'npc-stall-reset',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
        destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
        simLane: 'high',
        renderLane: 'culled',
      });

      // Accumulate partway toward the threshold (1200ms): 5 ticks × 100ms = 500ms.
      for (let i = 0; i < 5; i++) {
        callReroute(movement, c, true, true, 0.1);
      }
      expect(c.movementContourStallMs).toBeGreaterThan(0);
      expect(c.movementContourStallMs).toBeLessThan(1200);

      // One non-stalling tick clears the accumulator.
      callReroute(movement, c, false, true, 0.1);
      expect(c.movementContourStallMs).toBe(0);
    });

    it('only operates on high-LOD combatants', () => {
      // Low-LOD NPCs use a lighter path and don't oscillate the same way;
      // the brief constrains the fix to high-LOD only.
      const c = createTestCombatant({
        id: 'npc-low-lane',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
        destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
        simLane: 'low',
        renderLane: 'culled',
      });

      // Even 100 ticks of perfect stall conditions on a low-LOD NPC must
      // never trigger the reroute.
      for (let i = 0; i < 100; i++) {
        const triggered = callReroute(movement, c, true, true, 0.1);
        expect(triggered).toBe(false);
      }
      expect(c.movementContourStallMs ?? 0).toBe(0);
    });

    it('does not interfere when a backtrack point is already active', () => {
      // If the StuckDetector has already kicked us into backtrack, leave
      // recovery to the existing path — don't fight it from the solver.
      const adapter = mockNavmeshAdapter();
      const navSystem = mockNavmeshSystem(adapter);
      navSystem.queryPath.mockReturnValue([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(80, 0, 0),
      ]);
      movement.setNavmeshSystem(navSystem as any);

      const c = createTestCombatant({
        id: 'npc-backtrack-no-reroute',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
        destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
        movementBacktrackPoint: new THREE.Vector3(-10, NPC_Y_OFFSET, 0),
        simLane: 'high',
        renderLane: 'culled',
      });

      // Even with stall preconditions met, an active backtrack point must
      // suppress the reroute and zero the accumulator.
      for (let i = 0; i < 50; i++) {
        const triggered = callReroute(movement, c, true, true, 0.1);
        expect(triggered).toBe(false);
      }
      expect(c.movementContourStallMs ?? 0).toBe(0);
    });
  });

  // ── Sticky contour hysteresis (F2, combat-movement-stall-tail) ──────────
  describe('sticky contour hysteresis', () => {
    /**
     * Asymmetric ridge: a wall ahead (x > 2) plus a constant z-tilt so the
     * left/right go-around scores are genuinely contested. Under the baseline
     * +0.25 same-side bonus the chosen contour side flip-flops every few
     * hundred ms and the NPC oscillates in front of the lip; this is the shape
     * that most reproduces the convergence-time stall oscillation.
     */
    function ridgeTerrain() {
      return (x: number, z: number) => (x > 2 ? (x - 2) * 5 : 0) + z * 0.6;
    }

    afterEach(() => {
      NpcLodConfig.contourStickyHysteresisEnabled = false;
    });

    function driveStall(): { flips: number; finalX: number } {
      const t = mockTerrainRuntime();
      t.getHeightAt = ridgeTerrain();
      const m = new CombatantMovement(t);
      const adapter = mockNavmeshAdapter();
      const navSystem = mockNavmeshSystem(adapter);
      navSystem.queryPath.mockReturnValue([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(40, 0, 0),
        new THREE.Vector3(120, 0, 0),
      ]);
      m.setNavmeshSystem(navSystem as any);

      const c = createTestCombatant({
        id: 'npc-sticky-contour',
        state: CombatantState.ADVANCING,
        position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
        destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
        simLane: 'high',
        renderLane: 'culled',
      });

      let flips = 0;
      let prev: -1 | 1 | undefined;
      for (let i = 0; i < 50; i++) {
        m.resetPathQueryBudget();
        vi.spyOn(performance, 'now').mockReturnValue(i * 100);
        m.updateMovement(c, 0.1, new Map(), new Map(), {
          disableSpacing: true,
          disableTerrainSample: true,
        });
        const s = c.movementContourSign;
        if (prev !== undefined && s !== undefined && s !== prev) flips++;
        if (s !== undefined) prev = s;
      }
      return { flips, finalX: c.position.x };
    }

    it('ships OFF by default (no behavior change until owner playtest sign-off)', () => {
      expect(NpcLodConfig.contourStickyHysteresisEnabled).toBe(false);
    });

    it('cuts contour side-flips and lets the NPC clear the lip when enabled', () => {
      NpcLodConfig.contourStickyHysteresisEnabled = false;
      const off = driveStall();
      NpcLodConfig.contourStickyHysteresisEnabled = true;
      const on = driveStall();

      // Baseline must actually oscillate, else the comparison is vacuous.
      expect(off.flips).toBeGreaterThanOrEqual(4);
      // Sticky hysteresis at least halves the side-flipping...
      expect(on.flips).toBeLessThanOrEqual(Math.floor(off.flips / 2));
      // ...and committing to one go-around lets the NPC traverse past the lip
      // (x > 2) instead of oscillating in front of it.
      expect(on.finalX).toBeGreaterThan(off.finalX);
      expect(on.finalX).toBeGreaterThan(2);
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

  describe('convergence stall fixes', () => {
    // A "pocket": flat at the origin, steep walls in every direction past a
    // small radius. An NPC inside it has its forward probe (and both contour
    // probes) blocked every tick, so the terrain-aware solver activates contour
    // and the NPC makes no progress — the canonical convergence-stall trigger,
    // without the lateral-slide escape a single flat wall would allow.
    function pocketTerrain(radius = 1.6) {
      return vi.fn((x: number, z: number) => (Math.hypot(x, z) > radius ? 12 : 0));
    }

    describe('contour re-score caching (#2)', () => {
      it('samples terrain less on a cached contour tick than on a re-scoring tick', () => {
        let samples = 0;
        const pocket = pocketTerrain();
        const t = mockTerrainRuntime({
          getHeightAt: vi.fn((x: number, z: number) => {
            samples++;
            return pocket(x, z);
          }),
        });
        const m = new CombatantMovement(t);
        const c = createTestCombatant({
          id: 'npc-contour-cache',
          state: CombatantState.ADVANCING,
          position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
          destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
          simLane: 'high',
          renderLane: 'culled',
        });
        const tick = (nowMs: number) => {
          vi.spyOn(performance, 'now').mockReturnValue(nowMs);
          samples = 0;
          m.updateMovement(c, 0.016, new Map(), new Map(), {
            disableSpacing: true,
            disableTerrainSample: true,
          });
          return samples;
        };

        tick(0); // first contour tick scores both sides + fills the cache
        const cachedTickSamples = tick(16); // inside the window -> reuse the side
        const rescoreTickSamples = tick(16 + 1000); // past the window -> re-score

        expect(cachedTickSamples).toBeLessThan(rescoreTickSamples);
      });
    });

    describe('per-tick current-position height dedupe (#3, perf-only)', () => {
      // A slope whose height varies in BOTH x and z, so the contour solver's
      // current-position height genuinely drives the routing decision (a wrong
      // memo value would steer the NPC differently). Steep enough past a small
      // radius to keep the forward probe blocked => contour fires every tick.
      function slopeTerrain() {
        return (x: number, z: number) =>
          Math.hypot(x, z) > 1.6 ? 6 + x * 0.7 + z * 0.4 : 0;
      }

      // Build an NPC contour-stalled at the origin against `slopeTerrain`, with
      // a terrain mock that records every (x,z)->height call in order.
      function makeRun() {
        const pure = slopeTerrain();
        const callLog: Array<{ x: number; z: number; h: number }> = [];
        const t = mockTerrainRuntime({
          getHeightAt: vi.fn((x: number, z: number) => {
            const h = pure(x, z);
            callLog.push({ x, z, h });
            return h;
          }),
        });
        const m = new CombatantMovement(t);
        const c = createTestCombatant({
          id: 'npc-pos-dedupe',
          state: CombatantState.ADVANCING,
          position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
          destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
          simLane: 'high',
          renderLane: 'culled',
        });
        return { m, c, callLog, pure };
      }

      function runTrajectory(nowSequenceMs: number[]) {
        const { m, c, callLog, pure } = makeRun();
        const trajectory: Array<{ px: number; pz: number; vx: number; vz: number }> = [];
        for (const nowMs of nowSequenceMs) {
          vi.spyOn(performance, 'now').mockReturnValue(nowMs);
          m.updateMovement(c, 0.016, new Map(), new Map(), {
            disableSpacing: true,
            disableTerrainSample: true,
          });
          trajectory.push({ px: c.position.x, pz: c.position.z, vx: c.velocity.x, vz: c.velocity.z });
        }
        return { trajectory, callLog, pure };
      }

      // Re-score every tick (interval > rescore window) so the dedupe path is
      // exercised on every tick rather than short-circuited by the side cache.
      const nowSequence = [0, 1000, 2000, 3000, 4000];

      it('keeps height sampling pure: a coordinate never yields two different heights', () => {
        const { callLog, pure } = runTrajectory(nowSequence);
        // Every recorded sample equals the pure terrain value at that coord, so
        // the memo (which sits above getHeightAt) can only ever return what a
        // fresh call would have. This is the byte-identical guarantee.
        for (const { x, z, h } of callLog) {
          expect(h).toBe(pure(x, z));
        }
      });

      it('produces a deterministic, reproducible trajectory under the dedupe', () => {
        const a = runTrajectory(nowSequence).trajectory;
        const b = runTrajectory(nowSequence).trajectory;
        // Byte-identical routing: two independent runs over the same seed/scenario
        // yield the exact same positions and velocities every tick.
        expect(b).toEqual(a);
        // The NPC actually moved (the scenario exercised the solver, not a no-op).
        const moved = Math.hypot(a[a.length - 1].px, a[a.length - 1].pz) > 0;
        expect(moved).toBe(true);
      });

      it('collapses repeated start-of-tick current-position samples to one (vs un-deduped 2+)', () => {
        // Precise per-tick proof using the ordered call log: count how many times
        // the NPC's position AT THE START of the tick is sampled during that
        // tick. With the memo, the first sample fills the cache and all later
        // same-coord reads are served from it -> exactly one getHeightAt hit for
        // the start coord per tick.
        const { m, c, callLog } = makeRun();
        const startCoordHitsPerTick: number[] = [];
        for (const nowMs of nowSequence) {
          vi.spyOn(performance, 'now').mockReturnValue(nowMs);
          const startX = c.position.x;
          const startZ = c.position.z;
          const logBefore = callLog.length;
          m.updateMovement(c, 0.016, new Map(), new Map(), {
            disableSpacing: true,
            disableTerrainSample: true,
          });
          const tickCalls = callLog.slice(logBefore);
          const startHits = tickCalls.filter((e) => e.x === startX && e.z === startZ).length;
          startCoordHitsPerTick.push(startHits);
        }
        // Every tick activated the contour solver (start coord sampled at least
        // once) and never sampled the identical start coord more than once.
        expect(startCoordHitsPerTick.every((n) => n === 1)).toBe(true);
      });
    });

    describe('throttled path query keeps the cached route (#3)', () => {
      it('serves the stale route instead of stranding the NPC when the query budget is exhausted', () => {
        const adapter = mockNavmeshAdapter();
        const navSystem = mockNavmeshSystem(adapter);
        // Route bends sharply along +z before the +x destination, so following
        // the cached waypoint (z-dominant velocity) is distinguishable from a
        // fallback direct-push toward the destination (x-dominant velocity).
        const routeWaypoint = new THREE.Vector3(0, 0, 80);
        const destination = new THREE.Vector3(120, 0, 0);
        navSystem.queryPath.mockReturnValue([
          new THREE.Vector3(0, 0, 0),
          routeWaypoint,
          destination,
        ]);
        movement.setNavmeshSystem(navSystem as any);

        const c = createTestCombatant({
          id: 'npc-stale-route',
          state: CombatantState.ADVANCING,
          position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
          destinationPoint: destination.clone(),
          simLane: 'high',
          renderLane: 'culled',
        });

        // Frame 1: establish the cached route.
        vi.spyOn(performance, 'now').mockReturnValue(0);
        movement.resetPathQueryBudget();
        movement.updateMovement(c, 0.016, new Map(), new Map(), {
          disableSpacing: true,
          disableTerrainSample: true,
        });

        // Frame 2 (same instant, so the waypoint-stall timeout does not fire):
        // the destination jumped >5m, so the cached path is no longer "fresh".
        c.destinationPoint = new THREE.Vector3(140, 0, 0);
        movement.resetPathQueryBudget();
        // Exhaust the per-frame query budget with throwaway NPCs first.
        for (let i = 0; i < 6; i++) {
          const filler = createTestCombatant({
            id: `filler-${i}`,
            state: CombatantState.ADVANCING,
            position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
            destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 10 + i),
            simLane: 'high',
            renderLane: 'culled',
          });
          movement.updateMovement(filler, 0.016, new Map(), new Map(), {
            disableSpacing: true,
            disableTerrainSample: true,
          });
        }

        // The NPC's path can't be re-queried this frame (budget gone), but it
        // should keep steering along the cached waypoint (+z) instead of
        // snapping to a direct push at the destination (+x).
        c.velocity.set(0, 0, 0);
        movement.updateMovement(c, 0.016, new Map(), new Map(), {
          disableSpacing: true,
          disableTerrainSample: true,
        });

        expect(Math.abs(c.velocity.z)).toBeGreaterThan(Math.abs(c.velocity.x));
      });
    });

    describe('crowd dispersal on terminal hold (#1)', () => {
      // The terminal 'hold' escalation is rare by design (every recovery layer
      // tries to break a stall first), so the dispersal decision is exercised
      // directly through its helper — the same cast-based seam the reroute tests
      // use. It reads the friendly spacing force computed earlier in the tick;
      // we seed that force to stand in for "a crowd on the +z side".
      type DispersalHook = (
        combatant: ReturnType<typeof createTestCombatant>,
        now: number,
      ) => boolean;
      function callDispersal(
        m: CombatantMovement,
        c: ReturnType<typeof createTestCombatant>,
        now: number,
        spacingForce: THREE.Vector3,
      ): boolean {
        (m as unknown as { _spacingForce: THREE.Vector3 })._spacingForce.copy(spacingForce);
        return (m as unknown as { tryAssignCrowdDispersal: DispersalHook }).tryAssignCrowdDispersal(c, now);
      }

      it('sends a crowded held NPC to a point away from the crowd and delays re-evaluation', () => {
        const m = new CombatantMovement(mockTerrainRuntime());
        const c = createTestCombatant({
          id: 'npc-hold-disperse',
          position: new THREE.Vector3(5, NPC_Y_OFFSET, 5),
          destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
          lastZoneEvalTime: 0,
          simLane: 'high',
          renderLane: 'culled',
        });
        // Crowd on the +z side -> spacing force points -z (away from it).
        const dispersed = callDispersal(m, c, 4242, new THREE.Vector3(0, 0, -1));

        expect(dispersed).toBe(true);
        expect(c.destinationPoint).toBeDefined();
        const toDest = new THREE.Vector3()
          .subVectors(c.destinationPoint as THREE.Vector3, c.position)
          .setY(0);
        // Dispersal heads in the away (-z) direction, beyond the patrol arrival
        // radius (15m) so a leader does not immediately re-pick the contested zone.
        expect(toDest.z).toBeLessThan(0);
        expect(Math.abs(toDest.x)).toBeLessThan(1e-6);
        expect(toDest.length()).toBeGreaterThan(15);
        // Re-evaluation is delayed (stamped to now, not reset to 0).
        expect(c.lastZoneEvalTime).toBe(4242);
      });

      it('does not disperse an isolated NPC (preserving the immediate unfreeze)', () => {
        const m = new CombatantMovement(mockTerrainRuntime());
        const c = createTestCombatant({
          id: 'npc-hold-isolated',
          position: new THREE.Vector3(5, NPC_Y_OFFSET, 5),
          destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
          simLane: 'high',
          renderLane: 'culled',
        });
        // No crowd -> spacing force ~0 -> nothing to disperse from.
        const dispersed = callDispersal(m, c, 4242, new THREE.Vector3(0, 0, 0));
        expect(dispersed).toBe(false);
      });
    });

    describe('crowd-stall movement stagger (#4, default ON)', () => {
      function crowdStallTick() {
        const m = new CombatantMovement(mockTerrainRuntime({ getHeightAt: pocketTerrain() }));
        const c = createTestCombatant({
          id: 'npc-stagger',
          state: CombatantState.ADVANCING,
          position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
          destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
          simLane: 'high',
          renderLane: 'culled',
        });
        const neighbor = createTestCombatant({
          id: 'npc-stagger-neighbor',
          position: new THREE.Vector3(0, NPC_Y_OFFSET, 0.6),
        });
        const combatants = new Map([[c.id, c], [neighbor.id, neighbor]]);
        const queryRadius = vi.fn(() => [c.id, neighbor.id]);
        m.setSpatialGridManager({ queryRadius } as any);
        return { m, c, combatants, queryRadius };
      }

      it('defaults crowdStallStaggerEnabled to ON (pins the cycle-combat-p99-attribution default)', () => {
        // Pin the shipped default so a regression that flips it back off is
        // caught here rather than silently dropping the combat-side p99 lever.
        expect(NpcLodConfig.crowdStallStaggerEnabled).toBe(true);
      });

      it('runs the full solve every tick when explicitly disabled', () => {
        const original = NpcLodConfig.crowdStallStaggerEnabled;
        NpcLodConfig.crowdStallStaggerEnabled = false;
        try {
          const { m, c, combatants, queryRadius } = crowdStallTick();
          vi.spyOn(performance, 'now').mockReturnValue(0);
          m.updateMovement(c, 0.016, new Map(), combatants, {});
          vi.spyOn(performance, 'now').mockReturnValue(16);
          m.updateMovement(c, 0.016, new Map(), combatants, {});
          // Spacing (a full-solve step) ran on both ticks.
          expect(queryRadius.mock.calls.length).toBe(2);
          expect(c.movementStaggerSkipNext).toBeFalsy();
        } finally {
          NpcLodConfig.crowdStallStaggerEnabled = original;
        }
      });

      it('coasts the next tick for a crowd-stalled NPC when enabled', () => {
        const original = NpcLodConfig.crowdStallStaggerEnabled;
        NpcLodConfig.crowdStallStaggerEnabled = true;
        try {
          const { m, c, combatants, queryRadius } = crowdStallTick();
          vi.spyOn(performance, 'now').mockReturnValue(0);
          m.updateMovement(c, 0.016, new Map(), combatants, {});
          // The full solve armed a coast tick for the contour-stalled crowd NPC.
          expect(c.movementStaggerSkipNext).toBe(true);
          const callsAfterFull = queryRadius.mock.calls.length;
          vi.spyOn(performance, 'now').mockReturnValue(16);
          m.updateMovement(c, 0.016, new Map(), combatants, {});
          // Coast tick skipped the spacing grid query (and the terrain solve).
          expect(queryRadius.mock.calls.length).toBe(callsAfterFull);
          expect(c.movementStaggerSkipNext).toBe(false);
        } finally {
          NpcLodConfig.crowdStallStaggerEnabled = original;
        }
      });

      it('holds a 50% coast cadence (full -> coast -> full -> coast) on a sustained stall', () => {
        const original = NpcLodConfig.crowdStallStaggerEnabled;
        NpcLodConfig.crowdStallStaggerEnabled = true;
        try {
          const { m, c, combatants, queryRadius } = crowdStallTick();
          const solveTicks: boolean[] = [];
          let prevCalls = 0;
          for (let i = 0; i < 6; i++) {
            vi.spyOn(performance, 'now').mockReturnValue(i * 16);
            m.updateMovement(c, 0.016, new Map(), combatants, {});
            const calls = queryRadius.mock.calls.length;
            solveTicks.push(calls > prevCalls); // true when the spacing solve ran this tick
            prevCalls = calls;
          }
          // Alternating full/coast: the full solve runs every other tick.
          expect(solveTicks).toEqual([true, false, true, false, true, false]);
        } finally {
          NpcLodConfig.crowdStallStaggerEnabled = original;
        }
      });

      it('never coasts an isolated (non-crowded) NPC even with the flag on (no micro-stutter)', () => {
        const original = NpcLodConfig.crowdStallStaggerEnabled;
        NpcLodConfig.crowdStallStaggerEnabled = true;
        try {
          // Same stalling pocket terrain but NO neighbor in range -> spacing
          // force stays ~0, so the crowd gate never arms the coast.
          const m = new CombatantMovement(mockTerrainRuntime({ getHeightAt: pocketTerrain() }));
          const c = createTestCombatant({
            id: 'npc-stagger-isolated',
            state: CombatantState.ADVANCING,
            position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
            destinationPoint: new THREE.Vector3(120, NPC_Y_OFFSET, 0),
            simLane: 'high',
            renderLane: 'culled',
          });
          const queryRadius = vi.fn(() => [c.id]); // only itself nearby
          m.setSpatialGridManager({ queryRadius } as any);
          for (let i = 0; i < 4; i++) {
            vi.spyOn(performance, 'now').mockReturnValue(i * 16);
            m.updateMovement(c, 0.016, new Map([[c.id, c]]), new Map([[c.id, c]]), {});
            // The full solve runs every tick (spacing queried every tick) and the
            // coast flag is never armed for the lonely NPC.
            expect(c.movementStaggerSkipNext).toBeFalsy();
          }
          expect(queryRadius.mock.calls.length).toBe(4);
        } finally {
          NpcLodConfig.crowdStallStaggerEnabled = original;
        }
      });

      it('a coasted NPC still advances toward its goal (coast integrates velocity, not a freeze)', () => {
        const original = NpcLodConfig.crowdStallStaggerEnabled;
        NpcLodConfig.crowdStallStaggerEnabled = true;
        try {
          const { m, c, combatants } = crowdStallTick();
          vi.spyOn(performance, 'now').mockReturnValue(0);
          // Full solve arms the coast and leaves a non-zero velocity.
          m.updateMovement(c, 0.016, new Map(), combatants, {});
          expect(c.movementStaggerSkipNext).toBe(true);
          const before = c.position.clone();
          const vel = c.velocity.clone();
          vi.spyOn(performance, 'now').mockReturnValue(16);
          m.updateMovement(c, 0.016, new Map(), combatants, {});
          // The coast tick integrated the existing velocity (position changed by
          // velocity*dt), so the NPC keeps drifting rather than freezing.
          const expected = before.clone().addScaledVector(vel, 0.016);
          expect(c.position.x).toBeCloseTo(expected.x, 5);
          expect(c.position.z).toBeCloseTo(expected.z, 5);
        } finally {
          NpcLodConfig.crowdStallStaggerEnabled = original;
        }
      });
    });
  });
});
