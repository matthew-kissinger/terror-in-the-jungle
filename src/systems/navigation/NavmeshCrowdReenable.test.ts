// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Regression guard for the navmesh-crowd re-enable (2026-05-18).
 *
 * Context: on 2026-03-17 the Recast crowd surface was disabled because crowd
 * forces fought the terrain-aware solver — crowd's full-velocity override
 * was dragging agents to a near-zero speed on slopes, even where the navmesh
 * itself considered the slope walkable. See
 * `docs/archive/MOVEMENT_NAV_CHECKIN.md:661` and the disable site comment
 * carried in `CombatantMovement.ts` line 240 prior to this change:
 *
 *   "Unregister from crowd (crowd steering disabled; path queries used instead)."
 *
 * Re-enable strategy (this PR):
 *   1. High-LOD active combatants are registered with the crowd.
 *   2. Their destination is pushed to Recast via `updateAgentTarget`.
 *   3. Only the crowd's steered DIRECTION is consumed
 *      (`applyAgentSteeredDirection`) — caller speed is preserved.
 *   4. The terrain-aware solver runs *after* the crowd layer and remains
 *      the surface-projection / slope-speed authority.
 *
 * What this file proves:
 *   - The crowd surface is wired up (catches a re-disable / regression where
 *     the consumer goes back to the unregister-only flow).
 *   - The original regression does not reproduce: an NPC on a slope with a
 *     crowd peer nearby retains its caller-intended speed; crowd steering
 *     cannot drag it to a slope-blocked crawl.
 *   - The crowd's effect is layered, not authoritative: the terrain solver
 *     still gets the last word on slope-blocked directions.
 *
 * These are behavior tests (per `docs/TESTING.md`) — they assert observable
 * outcomes (NPC kept moving, NPC took crowd direction) without asserting on
 * internal phase/state names or tuning constants.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CombatantMovement } from '../combat/CombatantMovement';
import { CombatantState } from '../combat/types';
import { createTestCombatant, mockTerrainRuntime } from '../../test-utils';
import { NPC_Y_OFFSET } from '../../config/CombatantConfig';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Lightweight adapter mock matching NavmeshMovementAdapter's public surface.
// `applyAgentSteeredDirection` mirrors the real method's contract: rotate XZ
// to the crowd direction, preserve caller speed.
function makeAdapter(steeredDir: { x: number; z: number } | null = null) {
  const agentIds = new Set<string>();
  const mock = {
    hasAgent: vi.fn((id: string) => agentIds.has(id)),
    registerAgent: vi.fn((c: { id: string }) => {
      agentIds.add(c.id);
      return true;
    }),
    unregisterAgent: vi.fn((id: string) => agentIds.delete(id)),
    updateAgentTarget: vi.fn(),
    applyAgentVelocity: vi.fn(),
    applyAgentSteeredDirection: vi.fn((c: { id: string; velocity: THREE.Vector3 }) => {
      if (!agentIds.has(c.id)) return;
      if (!steeredDir) return;
      const mag = Math.sqrt(steeredDir.x * steeredDir.x + steeredDir.z * steeredDir.z);
      if (mag < 0.001) return;
      const callerSpeed = Math.sqrt(c.velocity.x * c.velocity.x + c.velocity.z * c.velocity.z);
      if (callerSpeed < 0.001) return;
      const inv = 1 / mag;
      c.velocity.x = steeredDir.x * inv * callerSpeed;
      c.velocity.z = steeredDir.z * inv * callerSpeed;
    }),
    getAgentCount: vi.fn(() => agentIds.size),
    dispose: vi.fn(),
    // Test-only handle to introspect membership without going through the spy.
    _ids: agentIds,
  };
  return mock;
}

function makeNavSystem(adapter: ReturnType<typeof makeAdapter> | null) {
  return {
    getAdapter: vi.fn(() => adapter),
    init: vi.fn(),
    generateNavmesh: vi.fn(),
    update: vi.fn(),
    isReady: vi.fn(() => !!adapter),
    isWasmReady: vi.fn(() => !!adapter),
    queryPath: vi.fn(() => null),
    findNearestPoint: vi.fn(() => null),
    isPointOnNavmesh: vi.fn(() => false),
    validateConnectivity: vi.fn(() => ({ connected: true, islands: [[0]] })),
    dispose: vi.fn(),
  };
}

describe('navmesh crowd re-enable', () => {
  let movement: CombatantMovement;

  beforeEach(() => {
    movement = new CombatantMovement(mockTerrainRuntime());
  });

  // -------------------------------------------------------------------------
  // 1. The crowd surface is actually wired up.
  //
  // If someone re-applies the 2026-03-17 disable (drops the consumer back to
  // an unregister-only flow), this test fails immediately.
  // -------------------------------------------------------------------------
  it('registers and steers a high-LOD ADVANCING combatant with the crowd', () => {
    const adapter = makeAdapter({ x: 1, z: 0 });
    movement.setNavmeshSystem(makeNavSystem(adapter) as any);

    const c = createTestCombatant({
      id: 'npc-crowd-on',
      state: CombatantState.ADVANCING,
      position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
      destinationPoint: new THREE.Vector3(40, NPC_Y_OFFSET, 0),
      simLane: 'high',
      renderLane: 'culled',
    });

    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    expect(adapter.registerAgent).toHaveBeenCalledTimes(1);
    expect(adapter.updateAgentTarget).toHaveBeenCalledTimes(1);
    expect(adapter.applyAgentSteeredDirection).toHaveBeenCalledTimes(1);
    expect(c.velocity.lengthSq()).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // 2. The original regression cannot reproduce by construction.
  //
  // Pre-regression: on a steep walkable slope, the crowd's full-velocity
  // override dragged caller speed toward zero (crowd's local-avoidance
  // heuristic chose a "safe but slow" velocity). NPCs perceptibly stalled.
  //
  // Post-fix: caller speed is preserved across the crowd step. Verify that
  // an NPC on a slope with a crowd peer keeps measurable forward speed.
  // -------------------------------------------------------------------------
  it('preserves slope-walkable forward speed under crowd influence', () => {
    // Slope rising in +X at slope ~30° (rise of 0.577 per unit run = tan(30°)).
    const terrain = mockTerrainRuntime();
    terrain.getHeightAt = vi.fn((x: number) => Math.max(0, x * 0.577));
    movement = new CombatantMovement(terrain);

    // Crowd suggests a slight sideways nudge (separation from a virtual peer
    // sitting south). The slope-fight regression manifested when crowd's
    // sideways nudge caused the consumer to overwrite forward velocity with
    // a slow lateral velocity. With direction-only consumption, the caller's
    // forward speed is preserved.
    const adapter = makeAdapter({ x: 0.95, z: -0.31 }); // mostly forward, slight south nudge
    movement.setNavmeshSystem(makeNavSystem(adapter) as any);

    const c = createTestCombatant({
      id: 'npc-slope',
      state: CombatantState.ADVANCING,
      position: new THREE.Vector3(0, NPC_Y_OFFSET, 0),
      destinationPoint: new THREE.Vector3(50, NPC_Y_OFFSET, 0),
      simLane: 'high',
      renderLane: 'culled',
    });

    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    expect(adapter.applyAgentSteeredDirection).toHaveBeenCalled();
    // Original regression mode: speed crashes below ~1 m/s on slopes due to
    // crowd dragging the velocity to its own (slope-fearful) magnitude. With
    // direction-only consumption we keep the caller's commanded speed.
    const horizontalSpeed = Math.sqrt(c.velocity.x * c.velocity.x + c.velocity.z * c.velocity.z);
    expect(horizontalSpeed).toBeGreaterThan(2.0);
  });

  // -------------------------------------------------------------------------
  // 3. The crowd's effect is layered, not authoritative.
  //
  // If the terrain-aware solver did NOT run after the crowd step, a crowd
  // direction that pushed an NPC into an unwalkable cliff would carry through
  // unprojected. The existing CombatantMovement test suite covers the
  // cliff-projection case ('contours on an unwalkable uphill instead of
  // zeroing velocity'); here we assert the simpler invariant: the terrain
  // solver's surface projection still fires when the crowd is active.
  // -------------------------------------------------------------------------
  it('still runs the terrain-aware solver after crowd steering', () => {
    // Forward terrain rises steeply in +X (effectively unwalkable lip).
    const terrain = mockTerrainRuntime();
    terrain.getHeightAt = vi.fn((x: number) => Math.max(0, x * 2));
    movement = new CombatantMovement(terrain);

    // Crowd wants to push the NPC directly into the lip.
    const adapter = makeAdapter({ x: 1, z: 0 });
    movement.setNavmeshSystem(makeNavSystem(adapter) as any);

    const c = createTestCombatant({
      id: 'npc-cliff',
      state: CombatantState.ADVANCING,
      position: new THREE.Vector3(0, 0, 0),
      destinationPoint: new THREE.Vector3(30, 0, 0),
      simLane: 'high',
      renderLane: 'culled',
    });

    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });

    // Surface projection should reduce or redirect the velocity so the NPC
    // doesn't carry the crowd's "drive into the cliff" direction unmodified.
    // The contour-follow branch flips most of the motion into ±Z; behavior
    // here mirrors the existing 'contours on an unwalkable uphill' test, but
    // confirms it still holds when the crowd had a say in the direction.
    expect(c.velocity.lengthSq()).toBeGreaterThan(0.1);
    expect(Math.abs(c.velocity.z)).toBeGreaterThan(0.1);
  });

  // -------------------------------------------------------------------------
  // 4. Dead combatants drop their crowd slot.
  //
  // The existing dead-NPC early-return already unregisters from the crowd;
  // this guard makes sure the re-enable PR didn't accidentally re-register
  // them later in the pipeline.
  // -------------------------------------------------------------------------
  it('releases crowd slots on death so the agent budget stays available', () => {
    const adapter = makeAdapter({ x: 1, z: 0 });
    movement.setNavmeshSystem(makeNavSystem(adapter) as any);

    const c = createTestCombatant({
      id: 'npc-fallen',
      state: CombatantState.ADVANCING,
      position: new THREE.Vector3(0, 0, 0),
      destinationPoint: new THREE.Vector3(40, 0, 0),
      simLane: 'high',
      renderLane: 'culled',
    });

    // First tick: alive — should join the crowd.
    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });
    expect(adapter._ids.has('npc-fallen')).toBe(true);

    // Second tick: marked dead — should be unregistered.
    c.state = CombatantState.DEAD;
    movement.updateMovement(c, 0.016, new Map(), new Map(), {
      disableSpacing: true,
      disableTerrainSample: true,
    });
    expect(adapter._ids.has('npc-fallen')).toBe(false);
  });
});
