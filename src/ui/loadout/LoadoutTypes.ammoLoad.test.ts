// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * L1 (pure) tests for the selectable ammo-load substrate added to LoadoutTypes.
 *
 * The ammo load is a universal (NOT faction-filtered) loadout dimension that
 * scales the player's spawn RESERVE ammo. We assert the option pool, the
 * label/short-label lookups, the reserve-factor mapping, and that
 * `clonePlayerLoadout` round-trips an optional ammo load (and omits it when
 * absent, since STANDARD is the implicit default everywhere it is read).
 */
import { describe, it, expect } from 'vitest';
import {
  AmmoLoad,
  AMMO_LOAD_OPTIONS,
  clonePlayerLoadout,
  getAmmoLoadHandlingFactor,
  getAmmoLoadLabel,
  getAmmoLoadReserveFactor,
  getAmmoLoadShortLabel,
  LoadoutEquipment,
  LoadoutWeapon,
  type PlayerLoadout,
} from './LoadoutTypes';

describe('ammo load options', () => {
  it('exposes the three loads in order with labels and short labels', () => {
    expect(AMMO_LOAD_OPTIONS.map(o => o.value)).toEqual([
      AmmoLoad.STANDARD,
      AmmoLoad.EXTENDED,
      AmmoLoad.HEAVY,
    ]);
    expect(AMMO_LOAD_OPTIONS.map(o => o.label)).toEqual(['Standard', 'Extended', 'Heavy']);
    expect(AMMO_LOAD_OPTIONS.map(o => o.shortLabel)).toEqual(['STD', 'EXT', 'HVY']);
  });
});

describe('ammo load label lookups', () => {
  it('returns the display label for each load', () => {
    expect(getAmmoLoadLabel(AmmoLoad.STANDARD)).toBe('Standard');
    expect(getAmmoLoadLabel(AmmoLoad.EXTENDED)).toBe('Extended');
    expect(getAmmoLoadLabel(AmmoLoad.HEAVY)).toBe('Heavy');
  });

  it('returns the short label for each load', () => {
    expect(getAmmoLoadShortLabel(AmmoLoad.STANDARD)).toBe('STD');
    expect(getAmmoLoadShortLabel(AmmoLoad.EXTENDED)).toBe('EXT');
    expect(getAmmoLoadShortLabel(AmmoLoad.HEAVY)).toBe('HVY');
  });

  it('falls back to the standard label for an unknown value', () => {
    expect(getAmmoLoadLabel('mystery' as AmmoLoad)).toBe('Standard');
    expect(getAmmoLoadShortLabel('mystery' as AmmoLoad)).toBe('STD');
  });
});

describe('ammo load reserve factor', () => {
  it('maps each load to its reserve multiplier', () => {
    expect(getAmmoLoadReserveFactor(AmmoLoad.STANDARD)).toBe(1.0);
    expect(getAmmoLoadReserveFactor(AmmoLoad.EXTENDED)).toBe(1.5);
    expect(getAmmoLoadReserveFactor(AmmoLoad.HEAVY)).toBe(2.0);
  });

  it('treats an unknown load as the standard baseline factor', () => {
    expect(getAmmoLoadReserveFactor('mystery' as AmmoLoad)).toBe(1.0);
  });
});

describe('ammo load handling factor (the tradeoff)', () => {
  it('keeps STANDARD at no penalty and makes heavier loads strictly worse for handling', () => {
    // Behavior, not exact tuning: STANDARD must be the neutral baseline, and the
    // penalty must grow with the reserve a load grants so EXTENDED/HEAVY are a
    // genuine tradeoff rather than strictly better than STANDARD.
    const standard = getAmmoLoadHandlingFactor(AmmoLoad.STANDARD);
    const extended = getAmmoLoadHandlingFactor(AmmoLoad.EXTENDED);
    const heavy = getAmmoLoadHandlingFactor(AmmoLoad.HEAVY);

    expect(standard).toBe(1.0);
    expect(extended).toBeGreaterThan(standard);
    expect(heavy).toBeGreaterThan(extended);
  });

  it('orders the handling penalty the same way as the reserve it grants', () => {
    // The load that gives more reserve must also cost more handling, so there is
    // no free lunch: more ammo => slower handling, monotonically.
    const loads = [AmmoLoad.STANDARD, AmmoLoad.EXTENDED, AmmoLoad.HEAVY];
    const byReserve = [...loads].sort(
      (a, b) => getAmmoLoadReserveFactor(a) - getAmmoLoadReserveFactor(b)
    );
    const byHandling = [...loads].sort(
      (a, b) => getAmmoLoadHandlingFactor(a) - getAmmoLoadHandlingFactor(b)
    );
    expect(byHandling).toEqual(byReserve);
  });

  it('treats an unknown load as the standard (no-penalty) baseline', () => {
    expect(getAmmoLoadHandlingFactor('mystery' as AmmoLoad)).toBe(1.0);
  });
});

describe('clonePlayerLoadout with ammo load', () => {
  const base: PlayerLoadout = {
    primaryWeapon: LoadoutWeapon.RIFLE,
    secondaryWeapon: LoadoutWeapon.SHOTGUN,
    equipment: LoadoutEquipment.FRAG_GRENADE,
  };

  it('round-trips a present ammo load', () => {
    const cloned = clonePlayerLoadout({ ...base, ammoLoad: AmmoLoad.HEAVY });
    expect(cloned.ammoLoad).toBe(AmmoLoad.HEAVY);
  });

  it('omits ammo load when absent (implicit STANDARD)', () => {
    const cloned = clonePlayerLoadout(base);
    expect('ammoLoad' in cloned).toBe(false);
  });
});
