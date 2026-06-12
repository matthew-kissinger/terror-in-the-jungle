// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  AIR_SUPPORT_RADIO_ASSETS,
  AIR_SUPPORT_TARGET_MARKINGS,
  countReadyAssets,
  getAirSupportRadioAsset,
  getCooldownRemaining,
  radioAssetToSupportType,
  type AirSupportRadioCooldowns,
} from './AirSupportRadioCatalog';

describe('AirSupportRadioCatalog', () => {
  it('exposes the air-support options needed by the radio shell', () => {
    const aircraft = AIR_SUPPORT_RADIO_ASSETS.map((asset) => asset.aircraft);
    const payloads = AIR_SUPPORT_RADIO_ASSETS.map((asset) => asset.payload);

    expect(aircraft).toEqual(expect.arrayContaining([
      'A-1 Skyraider',
      'F-4 Phantom',
      'AC-47 Spooky',
      'AH-1 Cobra',
      'UH-1C Gunship',
      'B-52 Stratofortress',
    ]));
    expect(payloads).toEqual(expect.arrayContaining([
      'Napalm',
      'Rocket pods',
      'Bombs',
      'Miniguns',
      'Minigun strafe',
      'Bomb string',
    ]));
  });

  it('makes the B-52 Arc Light the top-tier call-in with the longest cooldown', () => {
    const arclight = getAirSupportRadioAsset('b52_arclight');
    const others = AIR_SUPPORT_RADIO_ASSETS.filter((asset) => asset.id !== 'b52_arclight');

    // The Arc Light is the most expensive call-in: no other asset cools longer.
    for (const asset of others) {
      expect(arclight.cooldownSeconds).toBeGreaterThan(asset.cooldownSeconds);
    }
    // It maps onto the dedicated arclight runtime sortie type.
    expect(radioAssetToSupportType.b52_arclight).toBe('arclight');
    // Saturation strikes document a danger-close envelope for the player.
    expect(arclight.dangerCloseRadius).toBeGreaterThan(0);
  });

  it('keeps every radio asset wired to a runtime support type', () => {
    for (const asset of AIR_SUPPORT_RADIO_ASSETS) {
      expect(radioAssetToSupportType[asset.id]).toBeTruthy();
    }
  });

  it('keeps radio asset ids unique and lookup-safe', () => {
    const ids = AIR_SUPPORT_RADIO_ASSETS.map((asset) => asset.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(getAirSupportRadioAsset('ac47_orbit').aircraft).toBe('AC-47 Spooky');
  });

  it('supports smoke, willie-pete, and position-only target marking modes', () => {
    const modes = AIR_SUPPORT_TARGET_MARKINGS.map((mode) => mode.id);

    expect(modes).toEqual(expect.arrayContaining(['smoke', 'willie_pete', 'position_only']));
  });

  it('reports cooldown readiness without allowing bad numbers into the HUD', () => {
    const cooldowns: AirSupportRadioCooldowns = {
      ac47_orbit: 32,
      f4_bombs: Number.NaN,
    };

    expect(getCooldownRemaining(cooldowns, 'ac47_orbit')).toBe(32);
    expect(getCooldownRemaining(cooldowns, 'f4_bombs')).toBe(0);
    expect(countReadyAssets(cooldowns)).toBe(AIR_SUPPORT_RADIO_ASSETS.length - 1);
  });
});
