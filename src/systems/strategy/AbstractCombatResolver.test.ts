// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbstractCombatResolver } from './AbstractCombatResolver';
import { WarEventEmitter } from './WarEventEmitter';
import { AgentTier, StrategicAgent, StrategicSquad, WarEvent } from './types';
import { Faction } from '../combat/types';
import type { WarSimulatorConfig } from '../../config/gameModeTypes';
import type { CaptureZone } from '../world/ZoneManager';
import type { IZoneQuery } from '../../types/SystemInterfaces';

// ---------------------------------------------------------------------------
// Fixtures. These build the minimal StrategicAgent / StrategicSquad records the
// resolver reads. They are deliberately permissive about tuning-relevant fields
// (positions, member counts) so tests assert OUTCOMES (who died, what events
// fired) rather than internal constants.
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<WarSimulatorConfig> = {}): WarSimulatorConfig {
  return {
    enabled: true,
    totalAgents: 200,
    agentsPerFaction: 100,
    materializationRadius: 500,
    dematerializationRadius: 600,
    simulatedRadius: 2000,
    abstractCombatInterval: 2000,
    directorUpdateInterval: 5000,
    maxMaterialized: 48,
    reinforcementCooldown: 90,
    squadSize: { min: 8, max: 12 },
    ...overrides,
  };
}

function makeAgent(
  id: string,
  faction: Faction,
  squadId: string,
  pos: { x: number; z: number },
  tier: AgentTier = AgentTier.SIMULATED,
): StrategicAgent {
  return {
    id,
    faction,
    x: pos.x,
    z: pos.z,
    y: 0,
    health: 100,
    alive: true,
    tier,
    squadId,
    isLeader: false,
    destX: pos.x,
    destZ: pos.z,
    speed: 100,
    combatState: 'idle',
  };
}

function makeSquad(
  id: string,
  faction: Faction,
  pos: { x: number; z: number },
  memberIds: string[],
  overrides: Partial<StrategicSquad> = {},
): StrategicSquad {
  return {
    id,
    faction,
    members: memberIds,
    leaderId: memberIds[0] ?? id,
    x: pos.x,
    z: pos.z,
    objectiveX: pos.x,
    objectiveZ: pos.z,
    stance: 'attack',
    strength: 1,
    combatActive: false,
    lastCombatTime: 0,
    ...overrides,
  };
}

/**
 * Build a fully-populated opposed scenario: one US squad and one NVA squad,
 * each with `size` simulated members, at the given positions. Returns the maps
 * the resolver consumes plus the squad handles for assertions.
 */
function buildScenario(opts: {
  usPos: { x: number; z: number };
  opforPos: { x: number; z: number };
  size?: number;
  usTier?: AgentTier;
}) {
  const size = opts.size ?? 10;
  const agents = new Map<string, StrategicAgent>();
  const squads = new Map<string, StrategicSquad>();

  const usMembers: string[] = [];
  const opforMembers: string[] = [];
  for (let i = 0; i < size; i++) {
    const usId = `us_a_${i}`;
    const opId = `op_a_${i}`;
    agents.set(usId, makeAgent(usId, Faction.US, 'us_sq', opts.usPos, opts.usTier ?? AgentTier.SIMULATED));
    agents.set(opId, makeAgent(opId, Faction.NVA, 'op_sq', opts.opforPos));
    usMembers.push(usId);
    opforMembers.push(opId);
  }

  const usSquad = makeSquad('us_sq', Faction.US, opts.usPos, usMembers);
  const opSquad = makeSquad('op_sq', Faction.NVA, opts.opforPos, opforMembers);
  squads.set(usSquad.id, usSquad);
  squads.set(opSquad.id, opSquad);

  return { agents, squads, usSquad, opSquad };
}

function collectEvents(emitter: WarEventEmitter): WarEvent[] {
  const seen: WarEvent[] = [];
  emitter.subscribe((batch) => seen.push(...batch));
  return seen;
}

function aliveCount(agents: Map<string, StrategicAgent>, faction: Faction): number {
  let n = 0;
  for (const a of agents.values()) if (a.faction === faction && a.alive) n++;
  return n;
}

describe('AbstractCombatResolver engagement detection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks both squads combat-active when within engagement range', () => {
    const { agents, squads, usSquad, opSquad } = buildScenario({
      usPos: { x: 0, z: 0 },
      opforPos: { x: 50, z: 0 }, // well inside 200m
    });
    const events = new WarEventEmitter();
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig(), events);
    // Move squads far from the (0,0) player so the proximity protection does
    // not suppress activity — engagement flag is independent of kills anyway.
    resolver.setPlayerPosition(99999, 99999);

    resolver.update(10);

    expect(usSquad.combatActive).toBe(true);
    expect(opSquad.combatActive).toBe(true);
  });

  it('leaves squads idle when they are out of engagement range', () => {
    const { agents, squads, usSquad, opSquad } = buildScenario({
      usPos: { x: 0, z: 0 },
      opforPos: { x: 5000, z: 0 }, // way beyond 200m
    });
    const events = new WarEventEmitter();
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig(), events);

    resolver.update(10);

    expect(usSquad.combatActive).toBe(false);
    expect(opSquad.combatActive).toBe(false);
  });

  it('records the combat timestamp on engaged squads', () => {
    const { agents, squads, usSquad, opSquad } = buildScenario({
      usPos: { x: 0, z: 0 },
      opforPos: { x: 40, z: 0 },
    });
    const events = new WarEventEmitter();
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig(), events);
    resolver.setPlayerPosition(99999, 99999);

    resolver.update(42);

    expect(usSquad.lastCombatTime).toBe(42);
    expect(opSquad.lastCombatTime).toBe(42);
  });
});

describe('AbstractCombatResolver update cadence', () => {
  it('does not resolve again before the configured interval elapses', () => {
    const { agents, squads, usSquad } = buildScenario({
      usPos: { x: 0, z: 0 },
      opforPos: { x: 40, z: 0 },
    });
    const events = new WarEventEmitter();
    // interval = 2000ms -> 2s
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig({ abstractCombatInterval: 2000 }), events);

    resolver.update(0);
    usSquad.combatActive = false; // mutate to detect whether a second pass ran

    // Only 1s later: below the 2s interval, so update should early-return.
    resolver.update(1);
    expect(usSquad.combatActive).toBe(false);

    // Past the interval: it runs again and re-sets the flag.
    resolver.update(3);
    expect(usSquad.combatActive).toBe(true);
  });
});

describe('AbstractCombatResolver casualty resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('kills members on a guaranteed roll and reduces squad strength accordingly', () => {
    // Force every kill roll to succeed.
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const { agents, squads, usSquad, opSquad } = buildScenario({
      usPos: { x: 0, z: 0 },
      opforPos: { x: 30, z: 0 },
      size: 10,
    });
    const events = new WarEventEmitter();
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig(), events);
    resolver.setPlayerPosition(99999, 99999); // disable proximity protection

    resolver.update(5);

    // With random()===0 every alive member on both sides dies.
    expect(aliveCount(agents, Faction.US)).toBe(0);
    expect(aliveCount(agents, Faction.NVA)).toBe(0);
    expect(usSquad.strength).toBe(0);
    expect(opSquad.strength).toBe(0);
  });

  it('produces zero casualties when every roll fails', () => {
    // Force every kill roll to fail.
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);

    const { agents, squads, usSquad, opSquad } = buildScenario({
      usPos: { x: 0, z: 0 },
      opforPos: { x: 30, z: 0 },
      size: 10,
    });
    const events = new WarEventEmitter();
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig(), events);
    resolver.setPlayerPosition(99999, 99999);

    resolver.update(5);

    expect(aliveCount(agents, Faction.US)).toBe(10);
    expect(aliveCount(agents, Faction.NVA)).toBe(10);
    expect(usSquad.strength).toBe(1);
    expect(opSquad.strength).toBe(1);
  });

  it('never kills materialized agents (the full combat system owns them)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // would kill anything killable

    // US side is fully materialized; OPFOR is simulated.
    const { agents, squads } = buildScenario({
      usPos: { x: 0, z: 0 },
      opforPos: { x: 30, z: 0 },
      size: 6,
      usTier: AgentTier.MATERIALIZED,
    });
    const events = new WarEventEmitter();
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig(), events);
    resolver.setPlayerPosition(99999, 99999);

    resolver.update(5);

    // Materialized US agents survive abstract resolution entirely.
    expect(aliveCount(agents, Faction.US)).toBe(6);
    // Simulated OPFOR are eligible and all die.
    expect(aliveCount(agents, Faction.NVA)).toBe(0);
  });

  it('reduces kills for squads near the player versus squads far away', () => {
    // Pick a roll that sits ABOVE the near-player (reduced) kill chance but
    // BELOW the unprotected one, so the proximity reduction flips the outcome:
    // far squads take casualties, near-player squads are spared. The exact
    // threshold is a tuning detail; we only assert the resulting ordering.
    vi.spyOn(Math, 'random').mockReturnValue(0.04);

    const near = buildScenario({ usPos: { x: 0, z: 0 }, opforPos: { x: 30, z: 0 }, size: 10 });
    const far = buildScenario({ usPos: { x: 0, z: 0 }, opforPos: { x: 30, z: 0 }, size: 10 });

    const nearResolver = new AbstractCombatResolver(near.agents, near.squads, makeConfig(), new WarEventEmitter());
    nearResolver.setPlayerPosition(0, 0); // player right on top of the squads

    const farResolver = new AbstractCombatResolver(far.agents, far.squads, makeConfig(), new WarEventEmitter());
    farResolver.setPlayerPosition(99999, 99999); // player nowhere near

    nearResolver.update(5);
    farResolver.update(5);

    const nearCasualties =
      20 - (aliveCount(near.agents, Faction.US) + aliveCount(near.agents, Faction.NVA));
    const farCasualties =
      20 - (aliveCount(far.agents, Faction.US) + aliveCount(far.agents, Faction.NVA));

    // The near-player engagement must not produce MORE casualties than the
    // distant one; the protection only ever lowers the kill rate.
    expect(nearCasualties).toBeLessThan(farCasualties);
  });

  it('feeds each abstract death into the ticket system for the dead faction', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const { agents, squads } = buildScenario({
      usPos: { x: 0, z: 0 },
      opforPos: { x: 30, z: 0 },
      size: 4,
    });
    const events = new WarEventEmitter();
    const deaths: Faction[] = [];
    const ticketSystem = {
      onCombatantDeath: (faction: Faction) => deaths.push(faction),
    } as any;
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig(), events, ticketSystem);
    resolver.setPlayerPosition(99999, 99999);

    resolver.update(5);

    // 4 US + 4 NVA all die -> 8 ticket deductions, balanced per faction.
    expect(deaths.length).toBe(8);
    expect(deaths.filter((f) => f === Faction.US).length).toBe(4);
    expect(deaths.filter((f) => f === Faction.NVA).length).toBe(4);
  });
});

describe('AbstractCombatResolver event emission', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits an agent_killed event for each abstract casualty', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const { agents, squads } = buildScenario({
      usPos: { x: 100, z: 200 },
      opforPos: { x: 130, z: 200 },
      size: 3,
    });
    const events = new WarEventEmitter();
    const seen = collectEvents(events);
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig(), events);
    resolver.setPlayerPosition(99999, 99999);

    resolver.update(5);
    events.flush();

    const killed = seen.filter((e) => e.type === 'agent_killed');
    expect(killed.length).toBe(6); // all 3+3 die
    // Event carries the dead agent's faction and position.
    for (const e of killed) {
      expect([Faction.US, Faction.NVA]).toContain((e as any).faction);
      expect(typeof (e as any).x).toBe('number');
    }
  });

  it('emits squad_wiped when a squad loses all members', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const { agents, squads } = buildScenario({
      usPos: { x: 0, z: 0 },
      opforPos: { x: 30, z: 0 },
      size: 5,
    });
    const events = new WarEventEmitter();
    const seen = collectEvents(events);
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig(), events);
    resolver.setPlayerPosition(99999, 99999);

    resolver.update(5);
    events.flush();

    const wiped = seen.filter((e) => e.type === 'squad_wiped');
    const wipedSquadIds = new Set(wiped.map((e) => (e as any).squadId));
    expect(wipedSquadIds.has('us_sq')).toBe(true);
    expect(wipedSquadIds.has('op_sq')).toBe(true);
  });

  it('emits squad_engaged on first contact between two newly-engaged squads', () => {
    // Regression: combatActive used to be set true before the first-contact
    // guard ran, so squad_engaged never fired. The guard must key off the
    // PRIOR-tick combat state, not the freshly-written flag.
    const { agents, squads } = buildScenario({
      usPos: { x: 0, z: 0 },
      opforPos: { x: 30, z: 0 },
      size: 4,
    });
    const events = new WarEventEmitter();
    const seen = collectEvents(events);
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig(), events);
    resolver.setPlayerPosition(99999, 99999);

    resolver.update(5);
    events.flush();

    const engaged = seen.filter((e) => e.type === 'squad_engaged');
    expect(engaged.length).toBeGreaterThan(0);
    const e = engaged[0] as Extract<WarEvent, { type: 'squad_engaged' }>;
    expect([e.squadId, e.enemySquadId].sort()).toEqual(['op_sq', 'us_sq']);
  });

  it('does not re-emit squad_engaged while the same engagement persists', () => {
    // Throttle: once both squads are already combat-active, a subsequent tick
    // of the SAME engagement must not fire a fresh squad_engaged.
    const { agents, squads } = buildScenario({
      usPos: { x: 0, z: 0 },
      opforPos: { x: 30, z: 0 },
      size: 4,
    });
    const events = new WarEventEmitter();
    const seen = collectEvents(events);
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig(), events);
    resolver.setPlayerPosition(99999, 99999);

    resolver.update(5);  // first contact -> should emit
    resolver.update(10); // still engaged -> should NOT emit again

    events.flush();
    const engaged = seen.filter((e) => e.type === 'squad_engaged');
    expect(engaged.length).toBe(1);
  });

  it('does not emit combat events when there are no engagements', () => {
    const { agents, squads } = buildScenario({
      usPos: { x: 0, z: 0 },
      opforPos: { x: 9000, z: 0 },
      size: 5,
    });
    const events = new WarEventEmitter();
    const seen = collectEvents(events);
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig(), events);

    resolver.update(5);
    events.flush();

    expect(seen.length).toBe(0);
  });
});

describe('AbstractCombatResolver defensive bonus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets a defender at its own owned zone out-attrit an equal-size attacker', () => {
    // Tuned roll: at parity the un-bonused side's kill chance falls below this
    // roll (its members survive), but the defender's bonus lifts its effective
    // strength enough that ITS kill chance clears the roll, so the attacker
    // takes casualties while the defender takes none. The numeric threshold is
    // a tuning detail; we only assert the resulting casualty ordering.
    vi.spyOn(Math, 'random').mockReturnValue(0.06);

    const usPos = { x: 0, z: 0 };
    const opforPos = { x: 30, z: 0 };
    const { agents, squads, usSquad, opSquad } = buildScenario({
      usPos,
      opforPos,
      size: 10,
    });
    // US squad defends an owned zone it is standing on.
    usSquad.objectiveZoneId = 'us_zone';
    const zone: CaptureZone = {
      id: 'us_zone',
      name: 'US Zone',
      position: new THREE.Vector3(0, 0, 0),
      radius: 60,
      owner: Faction.US,
    } as CaptureZone;
    const zoneQuery: IZoneQuery = {
      getZoneById: (id: string) => (id === 'us_zone' ? zone : null),
    } as unknown as IZoneQuery;

    const events = new WarEventEmitter();
    const resolver = new AbstractCombatResolver(agents, squads, makeConfig(), events, undefined, zoneQuery);
    resolver.setPlayerPosition(99999, 99999);

    resolver.update(5);

    const usDead = 10 - aliveCount(agents, Faction.US);
    const opforDead = 10 - aliveCount(agents, Faction.NVA);

    // The defending US squad should suffer no more casualties than the attacker,
    // and the attacker should take strictly more than zero.
    expect(opforDead).toBeGreaterThan(usDead);
    expect(usSquad.strength).toBeGreaterThanOrEqual(opSquad.strength);
  });
});
