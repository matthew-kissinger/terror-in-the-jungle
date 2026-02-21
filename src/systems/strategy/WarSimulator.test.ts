import { describe, it, expect } from 'vitest';
import { WarSimulator } from './WarSimulator';
import { Faction } from '../combat/types';

type SpawnZone = {
  id: string;
  name: string;
  position: { x: number; z: number };
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
      { id: 'opfor_hq', name: 'OP HQ', position: { x: 1000, z: 0 }, isHomeBase: true, owner: Faction.OPFOR },
      { id: 'us_firebase', name: 'US Firebase', position: { x: -400, z: 180 }, isHomeBase: false, owner: Faction.US, ticketBleedRate: 2 },
      { id: 'opfor_depot', name: 'OP Depot', position: { x: 420, z: -150 }, isHomeBase: false, owner: Faction.OPFOR, ticketBleedRate: 2 },
      { id: 'hill_937', name: 'Hill 937', position: { x: 0, z: 0 }, isHomeBase: false, owner: null, state: 'contested', ticketBleedRate: 6 },
      { id: 'valley_crossing', name: 'Valley Crossing', position: { x: 120, z: 80 }, isHomeBase: false, owner: null, state: 'neutral', ticketBleedRate: 4 }
    ];

    simulator.spawnStrategicForces(zones);

    expect(simulator.getAgentCount()).toBe(200);

    const frontlineZones = zones.filter(z => !z.isHomeBase && (z.owner === null || z.state === 'contested'));
    const usFrontline = countFactionAgentsNearZones(simulator, frontlineZones, Faction.US, 220);
    const opforFrontline = countFactionAgentsNearZones(simulator, frontlineZones, Faction.OPFOR, 220);

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
      { id: 'opfor_hq', name: 'OP HQ', position: { x: 1000, z: 0 }, isHomeBase: true, owner: Faction.OPFOR },
      { id: 'us_zone', name: 'US Zone', position: { x: -350, z: 120 }, isHomeBase: false, owner: Faction.US },
      { id: 'op_zone', name: 'OP Zone', position: { x: 360, z: -120 }, isHomeBase: false, owner: Faction.OPFOR },
      highValue,
      lowValue
    ];

    simulator.spawnStrategicForces(zones);

    const usAtHigh = countFactionAgentsNearZones(simulator, [highValue], Faction.US, 220);
    const opforAtHigh = countFactionAgentsNearZones(simulator, [highValue], Faction.OPFOR, 220);
    const usAtLow = countFactionAgentsNearZones(simulator, [lowValue], Faction.US, 220);
    const opforAtLow = countFactionAgentsNearZones(simulator, [lowValue], Faction.OPFOR, 220);

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
      { id: 'opfor_hq', name: 'OP HQ', position: { x: 1000, z: 0 }, isHomeBase: true, owner: Faction.OPFOR },
      { id: 'hill_937', name: 'Hill 937', position: { x: 0, z: 0 }, isHomeBase: false, owner: null, state: 'contested', ticketBleedRate: 6 }
    ];

    simulator.spawnStrategicForces(zones);
    const firstCount = simulator.getAgentCount();
    expect(firstCount).toBe(120);

    simulator.spawnStrategicForces(zones);
    const secondCount = simulator.getAgentCount();
    expect(secondCount).toBe(120);
  });
});
