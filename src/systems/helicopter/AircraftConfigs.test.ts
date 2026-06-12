/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { describe, it, expect } from 'vitest';
import {
  AIRCRAFT_CONFIGS,
  getAircraftConfig,
} from './AircraftConfigs';
import type { AircraftWeaponMount } from './AircraftConfigs';

describe('AircraftConfigs', () => {
  describe('UH1_HUEY', () => {
    it('should have transport role with no weapons', () => {
      const config = AIRCRAFT_CONFIGS.UH1_HUEY;
      expect(config.role).toBe('transport');
      expect(config.weapons).toEqual([]);
    });

    it('should have 4 seats', () => {
      expect(AIRCRAFT_CONFIGS.UH1_HUEY.seats).toBe(4);
    });
  });

  describe('UH1C_GUNSHIP', () => {
    it('should have gunship role with M60 door gun', () => {
      const config = AIRCRAFT_CONFIGS.UH1C_GUNSHIP;
      expect(config.role).toBe('gunship');
      expect(config.weapons).toHaveLength(1);

      const weapon = config.weapons[0] as AircraftWeaponMount;
      expect(weapon.name).toBe('M60 Door Gun');
      expect(weapon.type).toBe('side_mount');
      expect(weapon.firingMode).toBe('crew');
      expect(weapon.ammoCapacity).toBe(500);
    });
  });

  describe('AH1_COBRA', () => {
    it('should have attack role with minigun and rockets', () => {
      const config = AIRCRAFT_CONFIGS.AH1_COBRA;
      expect(config.role).toBe('attack');
      expect(config.weapons).toHaveLength(2);
    });

    it('should have M134 Minigun as nose turret', () => {
      const minigun = AIRCRAFT_CONFIGS.AH1_COBRA.weapons[0];
      expect(minigun.name).toBe('M134 Minigun');
      expect(minigun.type).toBe('nose_turret');
      expect(minigun.firingMode).toBe('pilot');
      expect(minigun.ammoCapacity).toBe(4000);
    });

    it('should have Rocket Pod', () => {
      const rockets = AIRCRAFT_CONFIGS.AH1_COBRA.weapons[1];
      expect(rockets.name).toBe('Rocket Pod');
      expect(rockets.type).toBe('rocket_pod');
      expect(rockets.firingMode).toBe('pilot');
      expect(rockets.ammoCapacity).toBe(14);
    });
  });

  describe('getAircraftConfig()', () => {
    it('should return config by key', () => {
      const config = getAircraftConfig('AH1_COBRA');
      expect(config.role).toBe('attack');
    });

    it('should fall back to UH1_HUEY for unknown keys', () => {
      const config = getAircraftConfig('UNKNOWN_AIRCRAFT');
      expect(config.role).toBe('transport');
      expect(config.weapons).toEqual([]);
    });
  });

  describe('dormant catalog aircraft (no flight model this cycle)', () => {
    // ch47 / oh6 / hh3e are loadable static GLBs registered for the gallery and
    // future role systems, but no flight model was invented for them this cycle.
    // The guarantee is that they have NO dedicated flight config, so they can
    // never spawn at a helipad with a fabricated handling model — any lookup
    // resolves to the Huey transport fallback instead.
    for (const dormantKey of ['CH47_CHINOOK', 'OH6_KIOWA_SCOUT', 'HH3E_JOLLY_GREEN_GIANT']) {
      it(`${dormantKey} has no invented flight config`, () => {
        expect(AIRCRAFT_CONFIGS[dormantKey]).toBeUndefined();
        // Falls back to the Huey transport handling, identical to an unknown key.
        expect(getAircraftConfig(dormantKey)).toBe(AIRCRAFT_CONFIGS.UH1_HUEY);
      });
    }
  });
});
