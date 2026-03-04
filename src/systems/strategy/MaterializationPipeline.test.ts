import { describe, expect, it, vi } from 'vitest';
import { MaterializationPipeline } from './MaterializationPipeline';
import { AgentTier, type StrategicAgent, type StrategicSquad } from './types';
import { Faction } from '../combat/types';
import type { WarSimulatorConfig } from '../../config/gameModeTypes';

function createAgent(id: string, faction: Faction, squadId: string, x: number): StrategicAgent {
  return {
    id,
    faction,
    x,
    y: 0,
    z: 0,
    health: 100,
    alive: true,
    tier: AgentTier.STRATEGIC,
    squadId,
    isLeader: id.endsWith('_0'),
    destX: x,
    destZ: 0,
    speed: 4,
    combatState: 'idle'
  };
}

describe('MaterializationPipeline', () => {
  it('prioritizes the nearest squad instead of spawn insertion order', () => {
    const agents = new Map<string, StrategicAgent>();
    const squads = new Map<string, StrategicSquad>();
    const config: WarSimulatorConfig = {
      enabled: true,
      totalAgents: 8,
      agentsPerFaction: 4,
      materializationRadius: 500,
      dematerializationRadius: 600,
      simulatedRadius: 2000,
      abstractCombatInterval: 2000,
      directorUpdateInterval: 5000,
      maxMaterialized: 48,
      reinforcementCooldown: 90,
      squadSize: { min: 4, max: 4 }
    };

    const usSquadId = 'us_squad';
    const nvaSquadId = 'nva_squad';
    squads.set(usSquadId, {
      id: usSquadId,
      faction: Faction.US,
      members: [],
      leaderId: 'us_0',
      x: 320,
      z: 0,
      objectiveX: 320,
      objectiveZ: 0,
      stance: 'attack',
      strength: 1,
      combatActive: false,
      lastCombatTime: 0
    });
    squads.set(nvaSquadId, {
      id: nvaSquadId,
      faction: Faction.NVA,
      members: [],
      leaderId: 'nva_0',
      x: 120,
      z: 0,
      objectiveX: 120,
      objectiveZ: 0,
      stance: 'defend',
      strength: 1,
      combatActive: false,
      lastCombatTime: 0
    });

    for (let i = 0; i < 6; i++) {
      const agent = createAgent(`us_${i}`, Faction.US, usSquadId, 320 + i);
      agents.set(agent.id, agent);
      squads.get(usSquadId)!.members.push(agent.id);
    }
    for (let i = 0; i < 2; i++) {
      const agent = createAgent(`nva_${i}`, Faction.NVA, nvaSquadId, 120 + i);
      agents.set(agent.id, agent);
      squads.get(nvaSquadId)!.members.push(agent.id);
    }

    const materializeAgent = vi.fn((data: { faction: Faction; x: number; y: number; z: number }) => `${data.faction}_${data.x}`);
    const pipeline = new MaterializationPipeline(
      agents,
      squads,
      config,
      {
        materializeAgent,
        dematerializeAgent: vi.fn(),
        getCombatantLiveness: vi.fn(() => ({ exists: true, alive: true }))
      } as any
    );

    pipeline.update(0, 0, 0, 0, 0);

    expect(materializeAgent).toHaveBeenCalledTimes(4);
    const factions = materializeAgent.mock.calls.map(call => call[0].faction);
    expect(factions).toContain(Faction.NVA);
    expect(factions[0]).toBe(Faction.NVA);
  });
});
