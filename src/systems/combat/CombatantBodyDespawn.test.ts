// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { CombatantLODManager } from './CombatantLODManager';
import { CombatantSpawnManager } from './CombatantSpawnManager';
import { CombatantDamage } from './CombatantDamage';
import { Combatant, CombatantState, Faction, Squad } from './types';
import { createTestCombatant } from '../../test-utils';
import type { CombatantAI } from './CombatantAI';
import type { CombatantCombat } from './CombatantCombat';
import type { CombatantMovement } from './CombatantMovement';
import type { CombatantRenderer } from './CombatantRenderer';
import type { SquadManager } from './SquadManager';
import type { CombatantFactory } from './CombatantFactory';
import type { GameModeManager } from '../world/GameModeManager';
import type { TicketSystem } from '../world/TicketSystem';
import type { SpatialGridManager } from './SpatialGridManager';

// Both managers reference the SpatialGridManager singleton. Mock it so we can
// observe despawn effects without a real octree, and so the two managers under
// test share the same mocked surface.
vi.mock('./SpatialGridManager', () => {
  const grid = {
    syncEntity: vi.fn(),
    removeEntity: vi.fn(),
    getOctreeStats: vi.fn(() => ({ totalNodes: 1, totalEntities: 1, maxDepth: 1 })),
    clear: vi.fn(),
  };
  return { spatialGridManager: grid };
});

// Total death-animation time is DEATH_FALL_DURATION + DEATH_GROUND_TIME +
// DEATH_FADEOUT_DURATION = 8.7s in CombatantLODManager. A single 9s tick
// completes any in-flight animation deterministically without asserting on
// the exact constant.
const FULL_DEATH_TICK_SECONDS = 9;

function createMockLODDeps() {
  const combatantAI = { updateAI: vi.fn(), clearLOSCache: vi.fn() } as unknown as CombatantAI;
  const combatantCombat = { updateCombat: vi.fn() } as unknown as CombatantCombat;
  const combatantMovement = {
    updateMovement: vi.fn(),
    updateRotation: vi.fn(),
    syncTerrainHeight: vi.fn(() => true),
    resetPathQueryBudget: vi.fn(),
  } as unknown as CombatantMovement;
  const combatantRenderer = { updateCombatantTexture: vi.fn() } as unknown as CombatantRenderer;
  const squadManager = { getAllSquads: vi.fn(() => new Map()) } as unknown as SquadManager;
  return { combatantAI, combatantCombat, combatantMovement, combatantRenderer, squadManager };
}

function createMockGameModeManager(worldSize = 400): GameModeManager {
  return { getWorldSize: vi.fn(() => worldSize), getCurrentConfig: vi.fn(() => undefined) } as unknown as GameModeManager;
}

function createMockTicketSystem(): TicketSystem {
  return {
    getGameState: vi.fn(() => ({ phase: 'COMBAT', usTickets: 100, opforTickets: 100 })),
    isGameActive: vi.fn(() => true),
    onCombatantDeath: vi.fn(),
  } as unknown as TicketSystem;
}

/**
 * SpawnManager needs a SquadManager + CombatantFactory. We back its respawn
 * path with a real squad registry (a plain Map proxy) so player-squad respawn
 * queueing can be observed as a real new combatant appearing in the map.
 */
function createSquadBackedManagers(squads: Map<string, Squad>) {
  let spawnCounter = 0;
  const squadManager = {
    createSquad: vi.fn((faction: Faction, position: THREE.Vector3, size: number) => {
      const members: Combatant[] = [];
      for (let i = 0; i < size; i++) {
        members.push(createTestCombatant({ id: `spawned-${spawnCounter++}`, faction, position: position.clone() }));
      }
      const squad: Squad = {
        id: `squad-${spawnCounter}`,
        faction,
        members: members.map(m => m.id),
        isPlayerControlled: false,
        formation: 'line',
      } as Squad;
      squads.set(squad.id, squad);
      return { squad, members };
    }),
    getSquad: vi.fn((id: string) => squads.get(id)),
    getAllSquads: vi.fn(() => squads),
    removeSquadMember: vi.fn((squadId: string, memberId: string) => {
      const squad = squads.get(squadId);
      if (!squad) return;
      const idx = squad.members.indexOf(memberId);
      if (idx > -1) squad.members.splice(idx, 1);
      if (squad.members.length === 0) squads.delete(squadId);
      else if (squad.leaderId === memberId) squad.leaderId = squad.members[0];
    }),
    setTerrainSystem: vi.fn(),
  } as unknown as SquadManager;

  const combatantFactory = {
    createCombatant: vi.fn((faction: Faction, position: THREE.Vector3, opts?: { squadId?: string }) =>
      createTestCombatant({
        id: `respawned-${spawnCounter++}`,
        faction,
        position: position.clone(),
        squadId: opts?.squadId,
        state: CombatantState.IDLE,
        health: 100,
      })
    ),
  } as unknown as CombatantFactory;

  return { squadManager, combatantFactory };
}

describe('combatant body despawn ownership', () => {
  let combatants: Map<string, Combatant>;
  let spatialGrid: SpatialGridManager;

  beforeEach(async () => {
    combatants = new Map();
    // Pull the mocked singleton so assertions can read its call records.
    const mod = await import('./SpatialGridManager');
    spatialGrid = mod.spatialGridManager as unknown as SpatialGridManager;
    vi.mocked(spatialGrid.removeEntity).mockClear();
    vi.mocked(spatialGrid.syncEntity).mockClear();
  });

  describe('exactly-once despawn (no double-despawn, no immortal body)', () => {
    it('despawns an animated death exactly once after the animation completes', () => {
      const deps = createMockLODDeps();
      const lod = new CombatantLODManager(
        combatants,
        new THREE.Vector3(0, 0, 0),
        deps.combatantAI,
        deps.combatantCombat,
        deps.combatantMovement,
        deps.combatantRenderer,
        deps.squadManager,
        spatialGrid
      );
      lod.setGameModeManager(createMockGameModeManager(400));

      // A combatant killed by a rifle: marked DEAD and animating.
      const body = createTestCombatant({
        id: 'body-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(20, 0, 0),
        state: CombatantState.DEAD,
        health: 0,
        isDying: true,
        deathProgress: 0,
      });
      combatants.set('body-1', body);

      // Mid-animation: still present.
      lod.updateCombatants(0.1);
      expect(combatants.has('body-1')).toBe(true);

      // Animation completes: despawned.
      lod.updateCombatants(FULL_DEATH_TICK_SECONDS);
      expect(combatants.has('body-1')).toBe(false);

      // Despawn happens at least once for this id.
      const removeCalls = vi.mocked(spatialGrid.removeEntity).mock.calls.filter(c => c[0] === 'body-1');
      expect(removeCalls.length).toBeGreaterThanOrEqual(1);

      // Further ticks must not re-despawn (no double-owner double-fire).
      vi.mocked(spatialGrid.removeEntity).mockClear();
      lod.updateCombatants(0.1);
      const reRemoveCalls = vi.mocked(spatialGrid.removeEntity).mock.calls.filter(c => c[0] === 'body-1');
      expect(reRemoveCalls.length).toBe(0);
    });

    it('despawns a terminal DEAD straggler (no animation in flight) so no body is immortal', () => {
      const deps = createMockLODDeps();
      const lod = new CombatantLODManager(
        combatants,
        new THREE.Vector3(0, 0, 0),
        deps.combatantAI,
        deps.combatantCombat,
        deps.combatantMovement,
        deps.combatantRenderer,
        deps.squadManager,
        spatialGrid
      );
      lod.setGameModeManager(createMockGameModeManager(400));

      // Force-marked DEAD with no death animation (e.g. external population
      // tear-down). Before this fix the spawn-manager sweep cleaned these up;
      // now the LOD manager must, or the body lives forever.
      const straggler = createTestCombatant({
        id: 'straggler-1',
        faction: Faction.NVA,
        position: new THREE.Vector3(30, 0, 0),
        state: CombatantState.DEAD,
        health: 0,
        isDying: false,
      });
      combatants.set('straggler-1', straggler);

      lod.updateCombatants(0.016);

      expect(combatants.has('straggler-1')).toBe(false);
      expect(spatialGrid.removeEntity).toHaveBeenCalledWith('straggler-1');
    });

    it('does not let the spawn manager despawn bodies (LOD manager is sole owner)', () => {
      const squads = new Map<string, Squad>();
      const { squadManager, combatantFactory } = createSquadBackedManagers(squads);
      const spawnManager = new CombatantSpawnManager(combatants, combatantFactory, squadManager);
      spawnManager.setGameModeManager(createMockGameModeManager(400));

      const body = createTestCombatant({
        id: 'body-2',
        faction: Faction.NVA,
        position: new THREE.Vector3(0, 0, 0),
        state: CombatantState.DEAD,
        health: 0,
        isDying: true,
        deathProgress: 0.5,
      });
      combatants.set('body-2', body);

      // Drive the periodic spawn check (interval is 3s). An animating body must
      // survive the spawn manager so the LOD manager owns its lifetime.
      const futureDate = Date.now() + 4000;
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(futureDate);
      try {
        spawnManager.update(4.0, true);
      } finally {
        dateSpy.mockRestore();
      }

      expect(combatants.has('body-2')).toBe(true);
    });
  });

  describe('player-squad rifle death still respawns', () => {
    it('queues a player-squad respawn through the death pipeline hook on a rifle kill', () => {
      const squads = new Map<string, Squad>();
      const playerSquad: Squad = {
        id: 'player-squad',
        faction: Faction.US,
        members: ['pc-1', 'pc-2'],
        leaderId: 'pc-1',
        isPlayerControlled: true,
        formation: 'line',
      } as Squad;
      squads.set('player-squad', playerSquad);

      const { squadManager, combatantFactory } = createSquadBackedManagers(squads);
      const spawnManager = new CombatantSpawnManager(combatants, combatantFactory, squadManager);
      spawnManager.setGameModeManager(createMockGameModeManager(400));

      const damage = new CombatantDamage();
      damage.setDeathBookkeeping({
        getSquads: () => squadManager.getAllSquads(),
        isPlayerControlledSquad: (id) => !!squadManager.getSquad(id)?.isPlayerControlled,
        queueRespawn: (squadId, memberId) => spawnManager.queueRespawn(squadId, memberId),
      });

      const victim = createTestCombatant({
        id: 'pc-2',
        faction: Faction.US,
        health: 10,
        state: CombatantState.IDLE,
        squadId: 'player-squad',
      });

      // Rifle kill with no explicit squads map (mirrors player-shot path).
      damage.applyDamage(victim, 50);

      expect(victim.state).toBe(CombatantState.DEAD);

      // The respawn should fire once the pending timer elapses.
      const futureDate = Date.now() + 6000;
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(futureDate);
      try {
        // Periodic spawn check drains pending respawns.
        spawnManager.update(6.0, true);
      } finally {
        dateSpy.mockRestore();
      }

      // A replacement combatant for the player squad must have been created.
      expect(combatantFactory.createCombatant).toHaveBeenCalled();
      const createdForPlayerSquad = vi.mocked(combatantFactory.createCombatant).mock.calls.some(
        c => (c[2] as { squadId?: string } | undefined)?.squadId === 'player-squad'
      );
      expect(createdForPlayerSquad).toBe(true);
    });
  });

  describe('player-rifle kill still reconciles the victim squad', () => {
    it('prunes the victim from its squad even when no squads map is passed to applyDamage', () => {
      const squads = new Map<string, Squad>();
      const enemySquad: Squad = {
        id: 'enemy-squad',
        faction: Faction.NVA,
        members: ['e-1', 'e-2'],
        leaderId: 'e-1',
        isPlayerControlled: false,
        formation: 'line',
      } as Squad;
      squads.set('enemy-squad', enemySquad);

      const { squadManager } = createSquadBackedManagers(squads);

      const damage = new CombatantDamage();
      damage.setDeathBookkeeping({
        getSquads: () => squadManager.getAllSquads(),
        isPlayerControlledSquad: (id) => !!squadManager.getSquad(id)?.isPlayerControlled,
        queueRespawn: vi.fn(),
      });

      const victim = createTestCombatant({
        id: 'e-2',
        faction: Faction.NVA,
        health: 10,
        state: CombatantState.IDLE,
        squadId: 'enemy-squad',
      });

      // Player-rifle path passes squads: undefined; the wired registry must
      // still reconcile the victim's squad.
      damage.applyDamage(victim, 50, undefined, undefined);

      expect(enemySquad.members).not.toContain('e-2');
      expect(enemySquad.members).toEqual(['e-1']);
    });

    it('promotes a survivor when a player rifle kill drops the squad leader', () => {
      const squads = new Map<string, Squad>();
      const enemySquad: Squad = {
        id: 'enemy-squad',
        faction: Faction.NVA,
        members: ['leader', 'follower'],
        leaderId: 'leader',
        isPlayerControlled: false,
        formation: 'line',
      } as Squad;
      squads.set('enemy-squad', enemySquad);

      const { squadManager } = createSquadBackedManagers(squads);

      const damage = new CombatantDamage();
      damage.setDeathBookkeeping({
        getSquads: () => squadManager.getAllSquads(),
        isPlayerControlledSquad: (id) => !!squadManager.getSquad(id)?.isPlayerControlled,
        queueRespawn: vi.fn(),
      });

      const leader = createTestCombatant({
        id: 'leader',
        faction: Faction.NVA,
        health: 10,
        state: CombatantState.IDLE,
        squadId: 'enemy-squad',
      });

      damage.applyDamage(leader, 50, undefined, undefined);

      expect(enemySquad.members).not.toContain('leader');
      expect(enemySquad.leaderId).toBe('follower');
    });
  });

  describe('ticket system still gates spawn-manager spawning', () => {
    it('does not throw when the periodic check runs with an inactive game', () => {
      const squads = new Map<string, Squad>();
      const { squadManager, combatantFactory } = createSquadBackedManagers(squads);
      const spawnManager = new CombatantSpawnManager(combatants, combatantFactory, squadManager);
      spawnManager.setGameModeManager(createMockGameModeManager(400));
      const ticketSystem = createMockTicketSystem();
      vi.mocked(ticketSystem.isGameActive).mockReturnValue(false);

      const futureDate = Date.now() + 4000;
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(futureDate);
      try {
        expect(() => spawnManager.update(4.0, true, ticketSystem)).not.toThrow();
      } finally {
        dateSpy.mockRestore();
      }
    });
  });
});
