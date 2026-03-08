import { describe, expect, it } from 'vitest';
import {
  getFactionOptionsForAlliance,
  getGameModeDefinition,
  getPlayableAlliances,
  resolveLaunchSelection
} from './gameModeDefinitions';
import { GameMode } from './gameModeTypes';
import { Alliance, Faction } from '../systems/combat/types';

describe('getGameModeDefinition', () => {
  it('returns frontier deploy policies for Open Frontier', () => {
    const definition = getGameModeDefinition(GameMode.OPEN_FRONTIER);

    expect(definition.policies.deploy.flow).toBe('frontier');
    expect(definition.policies.deploy.mapVariant).toBe('frontier');
    expect(definition.policies.command.scale).toBe('company');
  });

  it('returns pressure-front runtime policies for A Shau Valley', () => {
    const definition = getGameModeDefinition(GameMode.A_SHAU_VALLEY);

    expect(definition.policies.objective.usesWarSimulator).toBe(true);
    expect(definition.policies.respawn.initialSpawnRule).toBe('forward_insertion');
    expect(definition.policies.respawn.contactAssistStyle).toBe('pressure_front');
    expect(definition.policies.mapIntel.tacticalRangeOverride).toBe(900);
  });

  it('exposes playable alliances and faction options for the selected mode', () => {
    const definition = getGameModeDefinition(GameMode.A_SHAU_VALLEY);

    expect(getPlayableAlliances(definition)).toEqual([Alliance.BLUFOR]);
    expect(getFactionOptionsForAlliance(definition, Alliance.BLUFOR)).toEqual([Faction.US, Faction.ARVN]);
    expect(getFactionOptionsForAlliance(definition, Alliance.OPFOR)).toEqual([Faction.NVA, Faction.VC]);
  });

  it('normalizes launch selection to a valid alliance/faction pair', () => {
    const definition = getGameModeDefinition(GameMode.ZONE_CONTROL);

    expect(resolveLaunchSelection(definition, {
      alliance: Alliance.OPFOR,
      faction: Faction.NVA,
    })).toEqual({
      alliance: Alliance.BLUFOR,
      faction: Faction.US,
    });
  });
});
