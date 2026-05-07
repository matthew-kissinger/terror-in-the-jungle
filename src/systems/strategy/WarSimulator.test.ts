import * as THREE from 'three';
import { describe, it, expect } from 'vitest';
import { WarSimulator } from './WarSimulator';
import { Faction } from '../combat/types';
import { AgentTier, StrategicAgent, StrategicSquad } from './types';
import { StrategicRoutePlanner } from './StrategicRoutePlanner';

type SpawnZone = {
  id: string;
  name: string;
  position: { x: number; z: number };
  radius?: number;
  isHomeBase: boolean;
  owner: Faction | null;
  state?: string;
  ticketBleedRate?: number;
};

function createConfiguredSimulator(agentsPerFaction: number, squadSize: number): WarSimulator {
  const simulator = new WarSimulator();
  (simulator as any).config = {
    enabled: true,
    totalAgents: agentsPerFaction * 2,
    agentsPerFaction,
    materializationRadius: 500,
    dematerializationRadius: 600,
    simulatedRadius: 2000,
    abstractCombatInterval: 2000,
    directorUpdateInterval: 5000,
    maxMaterialized: 48,
    reinforcementCooldown: 90,
    squadSize: { min: squadSize, max: squadSize }
  };
  return simulator;
}

function countFactionAgentsNearZones(
  simulator: WarSimulator,
  zones: SpawnZone[],
  faction: Faction,
  radius: number
): number {
  const r2 = radius * radius;
  let count = 0;
  for (const agent of simulator.getAllAgents().values()) {
    if (!agent.alive || agent.faction !== faction) continue;
    for (const zone of zones) {
      const dx = agent.x - zone.position.x;
      const dz = agent.z - zone.position.z;
      if ((dx * dx + dz * dz) <= r2) {
        count++;
        break;
      }
    }
  }
  return count;
}

describe('WarSimulator.spawnStrategicForces frontline seeding', () => {
  it('seeds both factions into contested/neutral frontline zones', () => {
    const simulator = createConfiguredSimulator(100, 10);

    const zones: SpawnZone[] = [
      { id: 'us_hq', name: 'US HQ', position: { x: -1000, z: 0 }, isHomeBase: true, owner: Faction.US },
      { id: 'opfor_hq', name: 'OP HQ', position: { x: 1000, z: 0 }, isHomeBase: true, owner: Faction.NVA },
      { id: 'us_firebase', name: 'US Firebase', position: { x: -400, z: 180 }, isHomeBase: false, owner: Faction.US, ticketBleedRate: 2 },
      { id: 'opfor_depot', name: 'OP Depot', position: { x: 420, z: -150 }, isHomeBase: false, owner: Faction.NVA, ticketBleedRate: 2 },
      { id: 'hill_937', name: 'Hill 937', position: { x: 0, z: 0 }, isHomeBase: false, owner: null, state: 'contested', ticketBleedRate: 6 },
      { id: 'valley_crossing', name: 'Valley Crossing', position: { x: 120, z: 80 }, isHomeBase: false, owner: null, state: 'neutral', ticketBleedRate: 4 }
    ];

    simulator.spawnStrategicForces(zones);

    expect(simulator.getAgentCount()).toBe(200);

    const frontlineZones = zones.filter(z => !z.isHomeBase && (z.owner === null || z.state === 'contested'));
    const usFrontline = countFactionAgentsNearZones(simulator, frontlineZones, Faction.US, 220);
    const opforFrontline = countFactionAgentsNearZones(simulator, frontlineZones, Faction.NVA, 220);

    // 20% frontline share with fixed size 10 gives >=20 agents/faction near frontline.
    expect(usFrontline).toBeGreaterThanOrEqual(20);
    expect(opforFrontline).toBeGreaterThanOrEqual(20);
  });

  it('prioritizes higher-value frontline zone when only one frontline squad is allocated', () => {
    const simulator = createConfiguredSimulator(40, 10);

    const highValue: SpawnZone = {
      id: 'hill_937',
      name: 'Hill 937',
      position: { x: 0, z: 0 },
      isHomeBase: false,
      owner: null,
      state: 'contested',
      ticketBleedRate: 8
    };
    const lowValue: SpawnZone = {
      id: 'trail_cut',
      name: 'Trail Cut',
      position: { x: 900, z: 900 },
      isHomeBase: false,
      owner: null,
      state: 'neutral',
      ticketBleedRate: 1
    };

    const zones: SpawnZone[] = [
      { id: 'us_hq', name: 'US HQ', position: { x: -1000, z: 0 }, isHomeBase: true, owner: Faction.US },
      { id: 'opfor_hq', name: 'OP HQ', position: { x: 1000, z: 0 }, isHomeBase: true, owner: Faction.NVA },
      { id: 'us_zone', name: 'US Zone', position: { x: -350, z: 120 }, isHomeBase: false, owner: Faction.US },
      { id: 'op_zone', name: 'OP Zone', position: { x: 360, z: -120 }, isHomeBase: false, owner: Faction.NVA },
      highValue,
      lowValue
    ];

    simulator.spawnStrategicForces(zones);

    const usAtHigh = countFactionAgentsNearZones(simulator, [highValue], Faction.US, 220);
    const opforAtHigh = countFactionAgentsNearZones(simulator, [highValue], Faction.NVA, 220);
    const usAtLow = countFactionAgentsNearZones(simulator, [lowValue], Faction.US, 220);
    const opforAtLow = countFactionAgentsNearZones(simulator, [lowValue], Faction.NVA, 220);

    // With one frontline squad/faction, both should seed at the highest-value frontline objective.
    expect(usAtHigh).toBeGreaterThanOrEqual(10);
    expect(opforAtHigh).toBeGreaterThanOrEqual(10);
    expect(usAtLow).toBe(0);
    expect(opforAtLow).toBe(0);
  });

  it('does not accumulate duplicate agents across repeated reseeds', () => {
    const simulator = createConfiguredSimulator(60, 10);
    const zones: SpawnZone[] = [
      { id: 'us_hq', name: 'US HQ', position: { x: -1000, z: 0 }, isHomeBase: true, owner: Faction.US },
      { id: 'opfor_hq', name: 'OP HQ', position: { x: 1000, z: 0 }, isHomeBase: true, owner: Faction.NVA },
      { id: 'hill_937', name: 'Hill 937', position: { x: 0, z: 0 }, isHomeBase: false, owner: null, state: 'contested', ticketBleedRate: 6 }
    ];

    simulator.spawnStrategicForces(zones);
    const firstCount = simulator.getAgentCount();
    expect(firstCount).toBe(120);

    simulator.spawnStrategicForces(zones);
    const secondCount = simulator.getAgentCount();
    expect(secondCount).toBe(120);
  });

  it('keeps frontline spawns inside the objective shoulder instead of the steep outer rim', () => {
    const simulator = createConfiguredSimulator(100, 10);

    const hill: SpawnZone = {
      id: 'hill_937',
      name: 'Hill 937',
      position: { x: 0, z: 0 },
      radius: 60,
      isHomeBase: false,
      owner: null,
      state: 'contested',
      ticketBleedRate: 6
    };
    const zones: SpawnZone[] = [
      { id: 'us_hq', name: 'US HQ', position: { x: -1000, z: 0 }, radius: 45, isHomeBase: true, owner: Faction.US },
      { id: 'opfor_hq', name: 'OP HQ', position: { x: 1000, z: 0 }, radius: 45, isHomeBase: true, owner: Faction.NVA },
      hill
    ];

    simulator.spawnStrategicForces(zones);

    const hillAgents = [...simulator.getAllAgents().values()].filter((agent) => {
      const dx = agent.x - hill.position.x;
      const dz = agent.z - hill.position.z;
      return dx * dx + dz * dz < 80 * 80;
    });
    expect(hillAgents.length).toBeGreaterThanOrEqual(40);
    for (const agent of hillAgents) {
      expect(Math.hypot(agent.x - hill.position.x, agent.z - hill.position.z)).toBeLessThanOrEqual(33.1);
    }
  });
});

describe('WarSimulator strategic routing', () => {
  it('drives simulated agents through squad route waypoints instead of direct-line objectives', () => {
    const simulator = createConfiguredSimulator(1, 1);
    const heightQuery = () => 0;
    (simulator as any).getTerrainHeight = heightQuery;
    (simulator as any).routePlanner = new StrategicRoutePlanner(
      {
        worldSize: 1600,
        zones: [
          { id: 'us_base', position: new THREE.Vector3(0, 0, 0), radius: 30, isHomeBase: true },
          { id: 'objective', position: new THREE.Vector3(1000, 0, 0), radius: 30, isHomeBase: false },
        ],
        features: [
          {
            id: 'trail_gap',
            kind: 'road',
            name: 'Trail Gap',
            position: new THREE.Vector3(500, 0, 240),
            footprint: { shape: 'circle', radius: 24 },
            surface: { kind: 'jungle_trail', innerRadius: 16, outerRadius: 24 },
          },
        ],
      },
      (x, z) => {
        const ridgeX = Math.max(0, 240 - Math.abs(x - 500));
        const ridgeZ = Math.max(0, 180 - Math.abs(z));
        return ridgeX * ridgeZ * 0.005;
      },
    );

    const agent: StrategicAgent = {
      id: 'ws_agent_0',
      faction: Faction.US,
      x: 0,
      z: 0,
      y: 0,
      health: 100,
      alive: true,
      tier: AgentTier.SIMULATED,
      squadId: 'ws_squad_0',
      isLeader: true,
      destX: 0,
      destZ: 0,
      speed: 100,
      combatState: 'idle',
      formationSlot: 0,
    };
    const squad: StrategicSquad = {
      id: 'ws_squad_0',
      faction: Faction.US,
      members: [agent.id],
      leaderId: agent.id,
      x: 0,
      z: 0,
      objectiveZoneId: 'objective',
      objectiveX: 1000,
      objectiveZ: 0,
      stance: 'attack',
      strength: 1,
      combatActive: false,
      lastCombatTime: 0,
    };

    simulator.getAllAgents().set(agent.id, agent);
    simulator.getAllSquads().set(squad.id, squad);

    (simulator as any).updateSimulatedMovement(1, Number.POSITIVE_INFINITY);

    expect(agent.destZ).toBeGreaterThan(150);
    expect(squad.routeWaypoints?.some((waypoint) => waypoint.sourceId === 'feature:trail_gap')).toBe(true);

    agent.x = 500;
    agent.z = 240;
    squad.x = 500;
    squad.z = 240;

    (simulator as any).advanceSquadRoute(squad);
    (simulator as any).updateSimulatedMovement(1, Number.POSITIVE_INFINITY);

    expect(squad.routeWaypointIndex).toBeGreaterThan(0);
    expect(agent.destX).toBeGreaterThan(900);
    expect(Math.abs(agent.destZ)).toBeLessThan(10);
  });

  it('bounds final objective formation slots inside the route arrival band', () => {
    const simulator = createConfiguredSimulator(1, 1);
    const agent: StrategicAgent = {
      id: 'ws_agent_11',
      faction: Faction.US,
      x: -100,
      z: 0,
      y: 0,
      health: 100,
      alive: true,
      tier: AgentTier.SIMULATED,
      squadId: 'ws_squad_0',
      isLeader: false,
      destX: 0,
      destZ: 0,
      speed: 100,
      combatState: 'idle',
      formationSlot: 11,
    };
    const squad: StrategicSquad = {
      id: 'ws_squad_0',
      faction: Faction.US,
      members: Array.from({ length: 12 }, (_, index) => `ws_agent_${index}`),
      leaderId: 'ws_agent_0',
      x: -100,
      z: 0,
      objectiveZoneId: 'objective',
      objectiveX: 0,
      objectiveZ: 0,
      stance: 'attack',
      strength: 1,
      combatActive: false,
      lastCombatTime: 0,
      routeWaypointIndex: 0,
      routeWaypoints: [{
        x: 0,
        z: 0,
        arrivalRadius: 48,
        kind: 'objective',
      }],
    };

    const destination = (simulator as any).getAgentTravelDestination(agent, squad);

    expect(Math.hypot(destination.x, destination.z)).toBeLessThanOrEqual(34.6);
  });
});
