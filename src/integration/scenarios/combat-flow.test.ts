import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { GameScenario } from '../harness/GameScenario';
import {
  Faction,
  CombatantState,
  isBlufor,
  isOpfor,
} from '../../systems/combat/types';
import { ZoneState, CaptureZone } from '../../systems/world/ZoneManager';

// Stub HeightQueryCache so SquadManager doesn't depend on noise generation
vi.mock('../../systems/terrain/HeightQueryCache', () => ({
  getHeightQueryCache: () => ({
    getHeightAt: (_x: number, _z: number) => 0,
  }),
}));

// Silence Logger output during tests
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Combat Flow Integration', () => {
  let scenario: GameScenario;

  beforeEach(() => {
    scenario = new GameScenario(2000);
  });

  afterEach(() => {
    scenario.dispose();
  });

  // ---------------------------------------------------------------------------
  // Spawning and spatial registration
  // ---------------------------------------------------------------------------

  it('spawning combatants registers them in the spatial grid', () => {
    const pos = new THREE.Vector3(100, 0, 100);
    scenario.spawnSquad(Faction.US, pos, 4);

    // All 4 should be queryable near the spawn position
    const found = scenario.spatialGrid.queryRadius(pos, 50);
    expect(found.length).toBe(4);
  });

  it('spatial query finds combatants within radius', () => {
    scenario.spawnCombatant(Faction.US, new THREE.Vector3(10, 0, 10));
    scenario.spawnCombatant(Faction.NVA, new THREE.Vector3(20, 0, 20));
    scenario.spawnCombatant(Faction.NVA, new THREE.Vector3(500, 0, 500));

    const nearby = scenario.spatialGrid.queryRadius(new THREE.Vector3(0, 0, 0), 50);
    expect(nearby.length).toBe(2);
  });

  it('spatial query excludes combatants outside radius', () => {
    scenario.spawnCombatant(Faction.US, new THREE.Vector3(10, 0, 10));
    scenario.spawnCombatant(Faction.NVA, new THREE.Vector3(300, 0, 300));

    const nearby = scenario.spatialGrid.queryRadius(
      new THREE.Vector3(10, 0, 10),
      20,
    );
    expect(nearby.length).toBe(1);
  });

  it('dead combatants are excluded from living faction counts', () => {
    const { members } = scenario.spawnSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4);
    scenario.spawnSquad(Faction.NVA, new THREE.Vector3(200, 0, 200), 3);

    // Kill two US combatants
    scenario.killCombatant(members[0].id);
    scenario.killCombatant(members[1].id);

    expect(scenario.getLivingByFaction(Faction.US).length).toBe(2);
    expect(scenario.getLivingByFaction(Faction.NVA).length).toBe(3);
  });

  it('dead combatants are removed from spatial grid during sync', () => {
    const c = scenario.spawnCombatant(Faction.US, new THREE.Vector3(50, 0, 50));
    scenario.killCombatant(c.id);

    // After sync, dead entity should not appear in queries
    scenario.tick(1 / 60);
    const found = scenario.spatialGrid.queryRadius(new THREE.Vector3(50, 0, 50), 30);
    expect(found).not.toContain(c.id);
  });

  // ---------------------------------------------------------------------------
  // Kill removes combatant from spatial grid
  // ---------------------------------------------------------------------------

  it('killing a combatant removes it from spatial queries immediately', () => {
    const c = scenario.spawnCombatant(Faction.NVA, new THREE.Vector3(100, 0, 100));

    // Before kill - should be found
    let found = scenario.spatialGrid.queryRadius(new THREE.Vector3(100, 0, 100), 20);
    expect(found).toContain(c.id);

    // After kill - removed
    scenario.killCombatant(c.id);
    found = scenario.spatialGrid.queryRadius(new THREE.Vector3(100, 0, 100), 20);
    expect(found).not.toContain(c.id);
  });

  // ---------------------------------------------------------------------------
  // Multiple squads maintain separate member lists
  // ---------------------------------------------------------------------------

  it('multiple squads maintain separate member lists', () => {
    const { squad: s1, members: m1 } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(0, 0, 0),
      4,
    );
    const { squad: s2, members: m2 } = scenario.spawnSquad(
      Faction.NVA,
      new THREE.Vector3(200, 0, 200),
      3,
    );

    expect(s1.members.length).toBe(4);
    expect(s2.members.length).toBe(3);

    // No member ID overlap
    const s1Ids = new Set(s1.members);
    for (const id of s2.members) {
      expect(s1Ids.has(id)).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------
  // TicketSystem: death penalty
  // ---------------------------------------------------------------------------

  it('TicketSystem tracks faction tickets and applies death penalty', () => {
    scenario.ticketSystem.setMaxTickets(200);

    expect(scenario.ticketSystem.getTickets(Faction.US)).toBe(200);
    expect(scenario.ticketSystem.getTickets(Faction.NVA)).toBe(200);

    scenario.ticketSystem.onCombatantDeath(Faction.US);
    // Default death penalty is 2
    expect(scenario.ticketSystem.getTickets(Faction.US)).toBe(198);
    // OPFOR gets a kill recorded
    expect(scenario.ticketSystem.getKills(Faction.NVA)).toBe(1);
  });

  it('TicketSystem applies bleed when one faction holds more zones', () => {
    // Set up zones where OPFOR has majority but NOT total control
    // (total control triggers instant victory, ending the game)
    const zonesArray: CaptureZone[] = [
      scenario.createZone('A', 'Alpha', new THREE.Vector3(0, 0, 0), {
        state: ZoneState.OPFOR_CONTROLLED,
        owner: Faction.NVA,
        captureProgress: 100,
      }),
      scenario.createZone('B', 'Bravo', new THREE.Vector3(100, 0, 0), {
        state: ZoneState.OPFOR_CONTROLLED,
        owner: Faction.NVA,
        captureProgress: 100,
      }),
      scenario.createZone('C', 'Charlie', new THREE.Vector3(200, 0, 0), {
        state: ZoneState.US_CONTROLLED,
        owner: Faction.US,
        captureProgress: 100,
      }),
    ];

    const mockZoneManager = {
      getAllZones: () => zonesArray,
    } as any;

    scenario.ticketSystem.setMaxTickets(300);
    scenario.ticketSystem.setZoneManager(mockZoneManager);

    // Advance past SETUP phase into COMBAT
    const setupDuration = scenario.ticketSystem.getSetupDuration();
    scenario.ticketSystem.update(setupDuration + 0.1);

    const usTicketsBefore = scenario.ticketSystem.getTickets(Faction.US);

    // Simulate 5 seconds of bleed
    scenario.ticketSystem.update(5);

    const usTicketsAfter = scenario.ticketSystem.getTickets(Faction.US);
    // US should have bled tickets since OPFOR holds 2/3 zones (>50%)
    expect(usTicketsAfter).toBeLessThan(usTicketsBefore);
  });

  // ---------------------------------------------------------------------------
  // RespawnManager: queue and process
  // ---------------------------------------------------------------------------

  it('RespawnManager queues respawn after delay', () => {
    scenario.respawnManager.queueRespawn('squad_test', 'original_1');

    const pending = scenario.respawnManager.getPendingRespawns();
    expect(pending.length).toBe(1);
    expect(pending[0].squadId).toBe('squad_test');
    expect(pending[0].originalId).toBe('original_1');
    expect(pending[0].respawnTime).toBeGreaterThan(Date.now() - 1000);
  });

  it('RespawnManager processes ready respawns', () => {
    // Create a squad so the respawn has something to attach to
    const { squad } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(0, 0, 0),
      3,
    );
    squad.isPlayerControlled = true;

    // Manually push a respawn that is already ready (respawnTime in the past)
    scenario.respawnManager.setPendingRespawns([
      { squadId: squad.id, respawnTime: Date.now() - 1000, originalId: 'old_1' },
    ]);

    const membersBefore = squad.members.length;
    scenario.respawnManager.handlePendingRespawns();

    // The ready respawn should have been processed (new member added to squad)
    expect(squad.members.length).toBe(membersBefore + 1);

    // Pending list should be empty now
    expect(scenario.respawnManager.getPendingRespawns().length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Cross-system: spawn, kill, ticket, respawn flow
  // ---------------------------------------------------------------------------

  it('full combat lifecycle: spawn -> kill -> ticket deduction -> respawn', () => {
    scenario.ticketSystem.setMaxTickets(100);

    // Spawn squads for both sides
    const { members: usMembers, squad: usSquad } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(0, 0, 0),
      4,
    );
    scenario.spawnSquad(Faction.NVA, new THREE.Vector3(200, 0, 200), 4);

    // Verify initial state
    expect(scenario.combatants.size).toBe(8);
    expect(scenario.ticketSystem.getTickets(Faction.US)).toBe(100);

    // Kill a US combatant and notify tickets
    const victim = usMembers[1];
    scenario.killCombatant(victim.id, true);

    // Tickets should decrease
    expect(scenario.ticketSystem.getTickets(Faction.US)).toBe(98);

    // Victim should be dead in combatants map
    expect(scenario.combatants.get(victim.id)!.state).toBe(CombatantState.DEAD);

    // Victim should not appear in spatial queries
    const found = scenario.spatialGrid.queryRadius(victim.position.clone(), 50);
    expect(found).not.toContain(victim.id);

    // Living US count should decrease
    expect(scenario.getLivingByFaction(Faction.US).length).toBe(3);
  });

  it('combatant movement updates spatial grid position', () => {
    const c = scenario.spawnCombatant(Faction.US, new THREE.Vector3(0, 0, 0));

    // Move far away
    scenario.moveCombatant(c.id, new THREE.Vector3(500, 0, 500));

    // Should not be found at old position
    const oldQuery = scenario.spatialGrid.queryRadius(new THREE.Vector3(0, 0, 0), 30);
    expect(oldQuery).not.toContain(c.id);

    // Should be found at new position
    const newQuery = scenario.spatialGrid.queryRadius(new THREE.Vector3(500, 0, 500), 30);
    expect(newQuery).toContain(c.id);
  });

  it('faction counts remain consistent through spawn-kill cycles', () => {
    scenario.spawnSquad(Faction.US, new THREE.Vector3(0, 0, 0), 5);
    scenario.spawnSquad(Faction.NVA, new THREE.Vector3(200, 0, 200), 5);

    expect(scenario.getLivingByFaction(Faction.US).length).toBe(5);
    expect(scenario.getLivingByFaction(Faction.NVA).length).toBe(5);

    // Kill 2 US and 3 NVA
    const usCombatants = scenario.getByFaction(Faction.US);
    const nvaCombatants = scenario.getByFaction(Faction.NVA);

    scenario.killCombatant(usCombatants[0].id);
    scenario.killCombatant(usCombatants[1].id);
    scenario.killCombatant(nvaCombatants[0].id);
    scenario.killCombatant(nvaCombatants[1].id);
    scenario.killCombatant(nvaCombatants[2].id);

    expect(scenario.getLivingByFaction(Faction.US).length).toBe(3);
    expect(scenario.getLivingByFaction(Faction.NVA).length).toBe(2);

    // Spawn reinforcements
    scenario.spawnSquad(Faction.NVA, new THREE.Vector3(300, 0, 300), 4);
    expect(scenario.getLivingByFaction(Faction.NVA).length).toBe(6);
  });
});
