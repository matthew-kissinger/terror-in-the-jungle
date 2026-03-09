/**
 * @vitest-environment jsdom
 */
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
});
