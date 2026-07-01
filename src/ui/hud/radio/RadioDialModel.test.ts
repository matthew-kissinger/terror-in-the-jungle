// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Behavior tests for the shared radio dial data model. These assert the model
 * COMPOSES the existing catalogs (no duplicated lists) and that cooldown is
 * resolved by support TYPE — not internal shapes or tuning constants.
 */

import { describe, expect, it } from 'vitest';
import {
  buildFireSupportTargetOptions,
  buildRadioCategories,
  formatRadioCooldown,
  isRadioOptionReady,
  radioOptionCooldown,
  type RadioOption,
} from './RadioDialModel';
import { AIR_SUPPORT_RADIO_ASSETS, radioAssetToSupportType } from '../../../systems/airsupport/AirSupportRadioCatalog';
import { SQUAD_QUICK_COMMAND_OPTIONS } from '../../../systems/combat/SquadCommandPresentation';
import { RADIO_STATIONS } from '../../../config/radioStations';

function optionsOf(categoryId: string): RadioOption[] {
  const category = buildRadioCategories().find((c) => c.id === categoryId);
  return category?.options ?? [];
}

describe('RadioDialModel', () => {
  it('always exposes the three inner channels with stations under Signals', () => {
    const ids = buildRadioCategories().map((c) => c.id);
    expect(ids).toEqual(['fire-support', 'squad', 'signals']);
  });

  it('composes fire support from the air-support catalog without duplicating it', () => {
    const fireSupport = optionsOf('fire-support');
    expect(fireSupport).toHaveLength(AIR_SUPPORT_RADIO_ASSETS.length);
    for (const asset of AIR_SUPPORT_RADIO_ASSETS) {
      expect(fireSupport.some((o) => o.kind === 'fire-support' && o.assetId === asset.id)).toBe(true);
    }
  });

  it('composes squad orders from the squad command catalog', () => {
    const squad = optionsOf('squad');
    expect(squad).toHaveLength(SQUAD_QUICK_COMMAND_OPTIONS.length);
    for (const order of SQUAD_QUICK_COMMAND_OPTIONS) {
      expect(squad.some((o) => o.kind === 'squad' && o.slot === order.slot)).toBe(true);
    }
  });

  it('composes stations from the radio-station catalog', () => {
    const stations = optionsOf('signals');
    expect(stations).toHaveLength(RADIO_STATIONS.length);
    for (const station of RADIO_STATIONS) {
      expect(stations.some((o) => o.kind === 'station' && o.stationId === station.id)).toBe(true);
    }
  });

  it('builds the fire-support target drilldown for active smoke, throw smoke, and aim mark', () => {
    const asset = AIR_SUPPORT_RADIO_ASSETS[0];
    const targets = buildFireSupportTargetOptions(asset.id);
    expect(targets.map((option) => option.kind)).toEqual([
      'fire-support-target',
      'fire-support-target',
      'fire-support-target',
    ]);
    expect(targets.map((option) => option.kind === 'fire-support-target' ? option.targetMode : '')).toEqual([
      'current-smoke',
      'throw-smoke-marker',
      'reticle-grid',
    ]);
    expect(targets.map((option) => option.label)).toEqual([
      'Use Active Smoke',
      'Throw Smoke',
      'Aim Mark',
    ]);
    expect(targets.map((option) => option.label)).not.toContain('Use Smoke');
    expect(targets.map((option) => option.label)).not.toContain('Reticle/Grid');
  });

  it('greys assets that share a sortie type together when one is cooling down', () => {
    // Find two distinct assets that map to the SAME runtime sortie type.
    const byType = new Map<string, string[]>();
    for (const asset of AIR_SUPPORT_RADIO_ASSETS) {
      const type = radioAssetToSupportType[asset.id];
      byType.set(type, [...(byType.get(type) ?? []), asset.id]);
    }
    const shared = [...byType.values()].find((ids) => ids.length >= 2);
    expect(shared, 'expected at least two assets sharing a sortie type').toBeTruthy();
    const [first, second] = shared!;

    const fireSupport = optionsOf('fire-support');
    const firstOption = fireSupport.find((o) => o.kind === 'fire-support' && o.assetId === first)!;
    const secondOption = fireSupport.find((o) => o.kind === 'fire-support' && o.assetId === second)!;

    // Only the FIRST asset reports a raw cooldown, but type-resolution should
    // make the SECOND read as cooling down too (they share one sortie).
    const cooldowns = { [first]: 42 } as Record<string, number>;
    expect(isRadioOptionReady(firstOption, cooldowns)).toBe(false);
    expect(isRadioOptionReady(secondOption, cooldowns)).toBe(false);
  });

  it('never cools down non-fire-support options', () => {
    const squad = optionsOf('squad')[0];
    const station = optionsOf('signals')[0];
    expect(radioOptionCooldown(squad, { a1_napalm: 99 })).toBe(0);
    expect(radioOptionCooldown(station, { a1_napalm: 99 })).toBe(0);
    expect(isRadioOptionReady(squad, { a1_napalm: 99 })).toBe(true);
  });

  it('formats short cooldowns in seconds and long ones in minutes', () => {
    expect(formatRadioCooldown(0)).toBe('0S');
    expect(formatRadioCooldown(12)).toBe('12S');
    expect(formatRadioCooldown(120)).toBe('2M');
  });
});
