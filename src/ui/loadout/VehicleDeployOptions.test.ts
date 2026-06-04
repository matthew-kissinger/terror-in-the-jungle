// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behaviour tests for the crewable-vehicle deploy option catalogue.
 *
 * Caller-visible behaviour we care about:
 *  - Modes that have a crewable tank surface at least one ARMOR option so
 *    the deploy screen can show "where the tank is".
 *  - Modes without a tank placement return an empty list so the deploy
 *    screen simply omits the vehicles section.
 *  - The returned options are defensive copies, so a caller mutating one
 *    option's position does not corrupt the shared catalogue.
 */
import { describe, it, expect } from 'vitest';
import { Faction } from '../../systems/combat/types';
import { M48_SPAWN_OFFSETS } from '../../config/vehicles/m48-config';
import { getVehicleDeployOptionsForMode } from './LoadoutTypes';

describe('getVehicleDeployOptionsForMode', () => {
  it('offers a crewable US armor option in Open Frontier', () => {
    const options = getVehicleDeployOptionsForMode('open_frontier');

    expect(options.length).toBeGreaterThan(0);
    const armor = options.find(option => option.classLabel === 'ARMOR');
    expect(armor).toBeDefined();
    expect(armor!.faction).toBe(Faction.US);
    expect(armor!.controlsHint.length).toBeGreaterThan(0);
  });

  it('offers a crewable armor option in A Shau Valley', () => {
    const options = getVehicleDeployOptionsForMode('a_shau_valley');
    expect(options.some(option => option.classLabel === 'ARMOR')).toBe(true);
  });

  it('anchors the tank option at its real spawn location', () => {
    const [option] = getVehicleDeployOptionsForMode('open_frontier');
    expect(option.position.x).toBe(M48_SPAWN_OFFSETS.open_frontier.x);
    expect(option.position.z).toBe(M48_SPAWN_OFFSETS.open_frontier.z);
  });

  it('returns an empty list for a mode with no crewable vehicles', () => {
    expect(getVehicleDeployOptionsForMode('team_deathmatch')).toEqual([]);
    expect(getVehicleDeployOptionsForMode('unknown_mode')).toEqual([]);
  });

  it('returns defensive copies so callers cannot corrupt the catalogue', () => {
    const first = getVehicleDeployOptionsForMode('open_frontier');
    first[0].position.x = 99999;

    const second = getVehicleDeployOptionsForMode('open_frontier');
    expect(second[0].position.x).toBe(M48_SPAWN_OFFSETS.open_frontier.x);
  });
});
