// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  getFactionOptionsForAlliance,
  getGameModeDefinition,
  getPlayableAlliances,
  isFactionSelectable,
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

  it('exposes both alliances and faction options for the A Shau premiere mode', () => {
    const definition = getGameModeDefinition(GameMode.A_SHAU_VALLEY);

    expect(getPlayableAlliances(definition)).toEqual([Alliance.BLUFOR, Alliance.OPFOR]);
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

describe('faction-side picker gating', () => {
  it('marks the A Shau premiere mode as faction-selectable', () => {
    expect(isFactionSelectable(getGameModeDefinition(GameMode.A_SHAU_VALLEY))).toBe(true);
  });

  it('keeps the standard modes hidden from the side picker', () => {
    expect(isFactionSelectable(getGameModeDefinition(GameMode.ZONE_CONTROL))).toBe(false);
    expect(isFactionSelectable(getGameModeDefinition(GameMode.OPEN_FRONTIER))).toBe(false);
    expect(isFactionSelectable(getGameModeDefinition(GameMode.TEAM_DEATHMATCH))).toBe(false);
  });

  it('routes an OPFOR choice to the OPFOR loadout pool on A Shau', () => {
    const definition = getGameModeDefinition(GameMode.A_SHAU_VALLEY);

    // The picker's chosen side reaches launch selection; the OPFOR faction pool
    // (incl. the Phase-4 marksman/SKS) becomes the player's faction.
    expect(resolveLaunchSelection(definition, { alliance: Alliance.OPFOR })).toEqual({
      alliance: Alliance.OPFOR,
      faction: Faction.NVA,
    });
  });

  it('keeps the default BLUFOR side when no choice is supplied on A Shau', () => {
    const definition = getGameModeDefinition(GameMode.A_SHAU_VALLEY);

    expect(resolveLaunchSelection(definition)).toEqual({
      alliance: Alliance.BLUFOR,
      faction: Faction.US,
    });
  });
});
