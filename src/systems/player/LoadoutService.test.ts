// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameMode } from '../../config/gameModeTypes';
import { Alliance, Faction, GrenadeType } from '../combat/types';
import { LoadoutService } from './LoadoutService';
import {
  AmmoLoad,
  DEFAULT_PLAYER_LOADOUT,
  LoadoutEquipment,
  LoadoutWeapon
} from '../../ui/loadout/LoadoutTypes';

describe('LoadoutService', () => {
  let storage = new Map<string, string>();

  beforeEach(() => {
    storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      }
    });
  });

  it('starts with the default player loadout when storage is empty', () => {
    const service = new LoadoutService();

    expect(service.getCurrentLoadout()).toEqual(DEFAULT_PLAYER_LOADOUT);
    expect(service.getPresentationModel()).toEqual(expect.objectContaining({
      factionLabel: 'US',
      presetName: 'Rifleman',
      presetIndex: 0,
      presetCount: 3,
      presetDirty: false,
    }));
  });

  it('keeps the two weapon slots distinct when cycling primary', () => {
    const service = new LoadoutService();

    const nextLoadout = service.cycleField('primaryWeapon', 1);

    expect(nextLoadout.primaryWeapon).toBe(LoadoutWeapon.SMG);
    expect(nextLoadout.secondaryWeapon).toBe(LoadoutWeapon.SHOTGUN);
  });

  it('uses faction-aware option pools when context changes', () => {
    const service = new LoadoutService();

    service.setContext({
      mode: GameMode.A_SHAU_VALLEY,
      alliance: Alliance.OPFOR,
      faction: Faction.NVA,
    });
    const before = service.getCurrentLoadout();
    const after = service.setEquipment(LoadoutEquipment.FLASHBANG);

    expect(after).toEqual(before);
    expect(service.getPresentationModel()).toEqual(expect.objectContaining({
      factionLabel: 'NVA',
      availableWeapons: expect.arrayContaining([LoadoutWeapon.RIFLE, LoadoutWeapon.SMG, LoadoutWeapon.PISTOL]),
      availableEquipment: expect.arrayContaining([LoadoutEquipment.FRAG_GRENADE, LoadoutEquipment.SMOKE_GRENADE, LoadoutEquipment.MORTAR_KIT]),
    }));
    expect(service.getPresentationModel().availableEquipment).not.toContain(LoadoutEquipment.FLASHBANG);
  });

  it('cycles between preset slots and updates the active loadout', () => {
    const service = new LoadoutService();

    const nextLoadout = service.cyclePreset(1);
    const presentation = service.getPresentationModel();

    expect(nextLoadout).toEqual({
      primaryWeapon: LoadoutWeapon.SMG,
      secondaryWeapon: LoadoutWeapon.PISTOL,
      equipment: LoadoutEquipment.SMOKE_GRENADE,
    });
    expect(presentation.presetIndex).toBe(1);
    expect(presentation.presetName).toBe('Recon');
    expect(presentation.presetDirty).toBe(false);
  });

  it('saves changes back into the active preset and clears the dirty flag', () => {
    const service = new LoadoutService();

    service.cyclePreset(1);
    service.setEquipment(LoadoutEquipment.FLASHBANG);
    expect(service.getPresentationModel().presetDirty).toBe(true);

    const savedPreset = service.saveCurrentToActivePreset();

    expect(savedPreset.loadout).toEqual(expect.objectContaining({
      primaryWeapon: LoadoutWeapon.SMG,
      secondaryWeapon: LoadoutWeapon.PISTOL,
      equipment: LoadoutEquipment.FLASHBANG,
    }));
    expect(service.getPresentationModel()).toEqual(expect.objectContaining({
      presetIndex: 1,
      presetDirty: false,
    }));

    const reloaded = new LoadoutService();
    expect(reloaded.getPresentationModel()).toEqual(expect.objectContaining({
      presetIndex: 1,
      presetDirty: false,
    }));
    expect(reloaded.getCurrentLoadout()).toEqual(expect.objectContaining({
      equipment: LoadoutEquipment.FLASHBANG,
    }));
  });

  it('persists separate preset state by faction context', () => {
    const service = new LoadoutService();

    service.setContext({
      mode: GameMode.ZONE_CONTROL,
      alliance: Alliance.BLUFOR,
      faction: Faction.US,
    });
    service.setLoadout({
      primaryWeapon: LoadoutWeapon.RIFLE,
      secondaryWeapon: LoadoutWeapon.PISTOL,
      equipment: LoadoutEquipment.SANDBAG_KIT,
    });

    service.setContext({
      mode: GameMode.A_SHAU_VALLEY,
      alliance: Alliance.OPFOR,
      faction: Faction.NVA,
    });
    service.setLoadout({
      primaryWeapon: LoadoutWeapon.SMG,
      secondaryWeapon: LoadoutWeapon.PISTOL,
      equipment: LoadoutEquipment.MORTAR_KIT,
    });

    service.setContext({
      mode: GameMode.ZONE_CONTROL,
      alliance: Alliance.BLUFOR,
      faction: Faction.US,
    });
    expect(service.getCurrentLoadout()).toEqual(expect.objectContaining({
      secondaryWeapon: LoadoutWeapon.PISTOL,
      equipment: LoadoutEquipment.SANDBAG_KIT,
    }));

    service.setContext({
      mode: GameMode.A_SHAU_VALLEY,
      alliance: Alliance.OPFOR,
      faction: Faction.NVA,
    });
    expect(service.getCurrentLoadout()).toEqual(expect.objectContaining({
      primaryWeapon: LoadoutWeapon.SMG,
      equipment: LoadoutEquipment.MORTAR_KIT,
    }));
  });

  it('applies the saved loadout to the live runtime targets', () => {
    const service = new LoadoutService();
    const inventoryManager = {
      setLoadout: vi.fn(),
      reset: vi.fn(),
    };
    const firstPersonWeapon = {
      setPlayerFaction: vi.fn(),
      setPrimaryWeapon: vi.fn(),
    };
    const grenadeSystem = {
      setGrenadeType: vi.fn(),
    };

    service.setLoadout({
      primaryWeapon: LoadoutWeapon.SMG,
      secondaryWeapon: LoadoutWeapon.PISTOL,
      equipment: LoadoutEquipment.SMOKE_GRENADE,
    });

    service.applyToRuntime({
      inventoryManager: inventoryManager as any,
      firstPersonWeapon: firstPersonWeapon as any,
      grenadeSystem: grenadeSystem as any,
    });

    expect(inventoryManager.setLoadout).toHaveBeenCalledWith(expect.objectContaining({
      primaryWeapon: LoadoutWeapon.SMG,
      secondaryWeapon: LoadoutWeapon.PISTOL,
      equipment: LoadoutEquipment.SMOKE_GRENADE,
    }));
    expect(inventoryManager.reset).toHaveBeenCalled();
    expect(firstPersonWeapon.setPlayerFaction).toHaveBeenCalledWith(Faction.US);
    expect(firstPersonWeapon.setPrimaryWeapon).toHaveBeenCalledWith('smg');
    expect(grenadeSystem.setGrenadeType).toHaveBeenCalledWith(GrenadeType.SMOKE);
  });

  describe('selectable ammo load', () => {
    it('cycles the ammo load forward through the universal pool', () => {
      const service = new LoadoutService();

      // Absent ammo load is treated as STANDARD, so the first forward step is EXTENDED.
      expect(service.getCurrentLoadout().ammoLoad).toBeUndefined();
      expect(service.cycleField('ammoLoad', 1).ammoLoad).toBe(AmmoLoad.EXTENDED);
      expect(service.cycleField('ammoLoad', 1).ammoLoad).toBe(AmmoLoad.HEAVY);
      // Wraps back to STANDARD.
      expect(service.cycleField('ammoLoad', 1).ammoLoad).toBe(AmmoLoad.STANDARD);
    });

    it('cycles the ammo load backward through the universal pool', () => {
      const service = new LoadoutService();

      // Stepping back from the implicit STANDARD wraps to HEAVY.
      expect(service.cycleField('ammoLoad', -1).ammoLoad).toBe(AmmoLoad.HEAVY);
      expect(service.cycleField('ammoLoad', -1).ammoLoad).toBe(AmmoLoad.EXTENDED);
      expect(service.cycleField('ammoLoad', -1).ammoLoad).toBe(AmmoLoad.STANDARD);
    });

    it('applies the standard reserve factor (1.0) when no ammo load is selected', () => {
      const service = new LoadoutService();
      const firstPersonWeapon = {
        setPlayerFaction: vi.fn(),
        setPrimaryWeapon: vi.fn(),
        setReserveAmmoFactor: vi.fn(),
      };

      service.applyToRuntime({ firstPersonWeapon: firstPersonWeapon as any });

      expect(firstPersonWeapon.setReserveAmmoFactor).toHaveBeenCalledWith(1.0);
    });

    it('applies the matching reserve factor for the selected ammo load', () => {
      const service = new LoadoutService();
      const firstPersonWeapon = {
        setPlayerFaction: vi.fn(),
        setPrimaryWeapon: vi.fn(),
        setReserveAmmoFactor: vi.fn(),
      };

      service.setAmmoLoad(AmmoLoad.HEAVY);
      service.applyToRuntime({ firstPersonWeapon: firstPersonWeapon as any });

      // HEAVY maps to a x2.0 reserve multiplier.
      expect(firstPersonWeapon.setReserveAmmoFactor).toHaveBeenCalledWith(2.0);
    });

    it('does not break applyToRuntime when the weapon double lacks setReserveAmmoFactor', () => {
      const service = new LoadoutService();
      const firstPersonWeapon = {
        setPlayerFaction: vi.fn(),
        setPrimaryWeapon: vi.fn(),
      };

      service.setAmmoLoad(AmmoLoad.EXTENDED);

      // The optional-call must tolerate a runtime double without the method.
      expect(() =>
        service.applyToRuntime({ firstPersonWeapon: firstPersonWeapon as any })
      ).not.toThrow();
      expect(firstPersonWeapon.setPrimaryWeapon).toHaveBeenCalled();
    });

    it('surfaces no handling penalty (factor 1.0) for the standard / default load', () => {
      const service = new LoadoutService();
      const firstPersonWeapon = {
        setPlayerFaction: vi.fn(),
        setPrimaryWeapon: vi.fn(),
        setHandlingFactor: vi.fn(),
      };

      service.applyToRuntime({ firstPersonWeapon: firstPersonWeapon as any });

      // STANDARD must keep handling identical to today (no penalty).
      expect(firstPersonWeapon.setHandlingFactor).toHaveBeenCalledWith(1.0);
    });

    it('surfaces a real handling penalty (> 1.0) for the heavy load — the tradeoff', () => {
      const service = new LoadoutService();
      const firstPersonWeapon = {
        setPlayerFaction: vi.fn(),
        setPrimaryWeapon: vi.fn(),
        setHandlingFactor: vi.fn(),
      };

      service.setAmmoLoad(AmmoLoad.HEAVY);
      service.applyToRuntime({ firstPersonWeapon: firstPersonWeapon as any });

      // The heavy load must cost handling speed (penalty strictly above baseline),
      // so it is not strictly better than STANDARD. Value is tuning, not asserted.
      const factor = firstPersonWeapon.setHandlingFactor.mock.calls[0][0];
      expect(factor).toBeGreaterThan(1.0);
    });

    it('does not break applyToRuntime when the weapon double lacks setHandlingFactor', () => {
      const service = new LoadoutService();
      const firstPersonWeapon = {
        setPlayerFaction: vi.fn(),
        setPrimaryWeapon: vi.fn(),
      };

      service.setAmmoLoad(AmmoLoad.HEAVY);

      expect(() =>
        service.applyToRuntime({ firstPersonWeapon: firstPersonWeapon as any })
      ).not.toThrow();
    });

    it('persists the selected ammo load across a reload from storage', () => {
      const service = new LoadoutService();
      service.setAmmoLoad(AmmoLoad.EXTENDED);
      service.saveCurrentToActivePreset();

      const reloaded = new LoadoutService();
      expect(reloaded.getCurrentLoadout().ammoLoad).toBe(AmmoLoad.EXTENDED);
    });
  });
});
