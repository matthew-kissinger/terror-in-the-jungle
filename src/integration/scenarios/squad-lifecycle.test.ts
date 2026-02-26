import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { GameScenario } from '../harness/GameScenario';
import { Faction, CombatantState } from '../../systems/combat/types';

// Stub HeightQueryCache
vi.mock('../../systems/terrain/HeightQueryCache', () => ({
  getHeightQueryCache: () => ({
    getHeightAt: (_x: number, _z: number) => 0,
  }),
}));

// Silence Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Squad Lifecycle Integration', () => {
  let scenario: GameScenario;

  beforeEach(() => {
    scenario = new GameScenario(2000);
  });

  afterEach(() => {
    scenario.dispose();
  });

  // ---------------------------------------------------------------------------
  // Squad creation
  // ---------------------------------------------------------------------------

  it('creating a squad registers it with the correct faction', () => {
    const { squad } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(50, 0, 50),
      4,
    );

    expect(squad.faction).toBe(Faction.US);
    expect(scenario.squadManager.getSquad(squad.id)).toBe(squad);
  });

  it('creating a squad assigns a unique ID', () => {
    const { squad: s1 } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(0, 0, 0),
      3,
    );
    const { squad: s2 } = scenario.spawnSquad(
      Faction.NVA,
      new THREE.Vector3(200, 0, 200),
      3,
    );

    expect(s1.id).not.toBe(s2.id);
  });

  it('squad members are registered in the combatants map', () => {
    const { members } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(0, 0, 0),
      4,
    );

    for (const m of members) {
      expect(scenario.combatants.has(m.id)).toBe(true);
    }
  });

  it('first member is assigned as squad leader', () => {
    const { squad, members } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(0, 0, 0),
      4,
    );

    expect(squad.leaderId).toBe(members[0].id);
    expect(members[0].squadRole).toBe('leader');
  });

  it('non-leader members are assigned as followers', () => {
    const { members } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(0, 0, 0),
      4,
    );

    for (let i = 1; i < members.length; i++) {
      expect(members[i].squadRole).toBe('follower');
    }
  });

  // ---------------------------------------------------------------------------
  // Member removal
  // ---------------------------------------------------------------------------

  it('removing a member updates the squad member list', () => {
    const { squad, members } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(0, 0, 0),
      5,
    );

    const removedId = members[2].id;
    scenario.squadManager.removeSquadMember(squad.id, removedId);

    expect(squad.members.length).toBe(4);
    expect(squad.members).not.toContain(removedId);
  });

  it('removing the leader promotes a new leader', () => {
    const { squad, members } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(0, 0, 0),
      4,
    );

    const originalLeaderId = squad.leaderId;
    scenario.squadManager.removeSquadMember(squad.id, originalLeaderId!);

    // New leader should be the next member
    expect(squad.leaderId).toBe(members[1].id);
    expect(squad.leaderId).not.toBe(originalLeaderId);
  });

  it('squad with all members removed is dissolved', () => {
    const { squad, members } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(0, 0, 0),
      2,
    );

    scenario.squadManager.removeSquadMember(squad.id, members[0].id);
    scenario.squadManager.removeSquadMember(squad.id, members[1].id);

    expect(scenario.squadManager.getSquad(squad.id)).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Player-controlled squad
  // ---------------------------------------------------------------------------

  it('player-controlled squad is correctly identified', () => {
    const { squad } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(0, 0, 0),
      4,
    );
    squad.isPlayerControlled = true;

    expect(squad.isPlayerControlled).toBe(true);

    // Non-player squad defaults to undefined/falsy
    const { squad: aiSquad } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(100, 0, 0),
      3,
    );
    expect(aiSquad.isPlayerControlled).toBeFalsy();
  });

  // ---------------------------------------------------------------------------
  // Squad centroid calculation (used by RespawnManager)
  // ---------------------------------------------------------------------------

  it('squad centroid can be calculated from member positions', () => {
    const { squad, members } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(100, 0, 100),
      4,
    );

    // Manually position members at known locations for deterministic test
    members[0].position.set(0, 0, 0);
    members[1].position.set(100, 0, 0);
    members[2].position.set(0, 0, 100);
    members[3].position.set(100, 0, 100);

    // Calculate centroid as RespawnManager does
    const centroid = new THREE.Vector3(0, 0, 0);
    let validCount = 0;
    for (const id of squad.members) {
      const m = scenario.combatants.get(id);
      if (m) {
        centroid.add(m.position);
        validCount++;
      }
    }
    if (validCount > 0) {
      centroid.divideScalar(validCount);
    }

    expect(centroid.x).toBeCloseTo(50);
    expect(centroid.y).toBeCloseTo(0);
    expect(centroid.z).toBeCloseTo(50);
  });

  // ---------------------------------------------------------------------------
  // Multi-faction squads
  // ---------------------------------------------------------------------------

  it('multiple factions maintain independent squad rosters', () => {
    scenario.spawnSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4);
    scenario.spawnSquad(Faction.US, new THREE.Vector3(50, 0, 0), 3);
    scenario.spawnSquad(Faction.NVA, new THREE.Vector3(200, 0, 200), 5);
    scenario.spawnSquad(Faction.VC, new THREE.Vector3(300, 0, 300), 2);

    const allSquads = scenario.squadManager.getAllSquads();
    expect(allSquads.size).toBe(4);

    // Count by faction
    let usSquads = 0;
    let nvaSquads = 0;
    let vcSquads = 0;
    allSquads.forEach(s => {
      if (s.faction === Faction.US) usSquads++;
      if (s.faction === Faction.NVA) nvaSquads++;
      if (s.faction === Faction.VC) vcSquads++;
    });

    expect(usSquads).toBe(2);
    expect(nvaSquads).toBe(1);
    expect(vcSquads).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Squad spatial coherence
  // ---------------------------------------------------------------------------

  it('squad members are spatially registered and queryable', () => {
    const spawnPos = new THREE.Vector3(500, 0, 500);
    const { members } = scenario.spawnSquad(Faction.NVA, spawnPos, 4);

    // All members should be near the spawn position (formation spread < 20m)
    const found = scenario.spatialGrid.queryRadius(spawnPos, 30);
    expect(found.length).toBe(4);

    for (const m of members) {
      expect(found).toContain(m.id);
    }
  });

  // ---------------------------------------------------------------------------
  // Cross-system: kill squad members, check squad integrity + respawn
  // ---------------------------------------------------------------------------

  it('killing squad members and respawning maintains squad integrity', () => {
    const { squad, members } = scenario.spawnSquad(
      Faction.US,
      new THREE.Vector3(0, 0, 0),
      5,
    );
    squad.isPlayerControlled = true;

    // Kill 2 members
    const victim1 = members[1];
    const victim2 = members[3];

    scenario.killCombatant(victim1.id, true);
    scenario.killCombatant(victim2.id, true);

    // Remove dead members from squad (as RespawnManager.removeCombatant does)
    scenario.squadManager.removeSquadMember(squad.id, victim1.id);
    scenario.squadManager.removeSquadMember(squad.id, victim2.id);

    expect(squad.members.length).toBe(3);

    // Respawn: manually add new members via the factory
    const newMember = scenario.combatantFactory.createCombatant(
      Faction.US,
      new THREE.Vector3(10, 0, 10),
      { squadId: squad.id, squadRole: 'follower' },
    );
    squad.members.push(newMember.id);
    scenario.combatants.set(newMember.id, newMember);
    scenario.spatialGrid.syncEntity(newMember.id, newMember.position);

    // Squad should now have 4 members (3 surviving + 1 respawned)
    expect(squad.members.length).toBe(4);

    // All current members should be living
    for (const id of squad.members) {
      const c = scenario.combatants.get(id);
      expect(c).toBeDefined();
      expect(c!.state).not.toBe(CombatantState.DEAD);
    }
  });

  it('dispose clears all squads and combatants', () => {
    scenario.spawnSquad(Faction.US, new THREE.Vector3(0, 0, 0), 4);
    scenario.spawnSquad(Faction.NVA, new THREE.Vector3(200, 0, 0), 3);

    expect(scenario.combatants.size).toBe(7);
    expect(scenario.squadManager.getAllSquads().size).toBe(2);

    scenario.dispose();

    expect(scenario.combatants.size).toBe(0);
    expect(scenario.squadManager.getAllSquads().size).toBe(0);
  });
});
