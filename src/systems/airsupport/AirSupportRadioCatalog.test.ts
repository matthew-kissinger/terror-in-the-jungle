import { describe, expect, it } from 'vitest';
import {
  AIR_SUPPORT_RADIO_ASSETS,
  AIR_SUPPORT_TARGET_MARKINGS,
  countReadyAssets,
  getAirSupportRadioAsset,
  getCooldownRemaining,
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
    ]));
    expect(payloads).toEqual(expect.arrayContaining([
      'Napalm',
      'Rocket pods',
      'Bombs',
      'Miniguns',
      'Minigun strafe',
    ]));
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
