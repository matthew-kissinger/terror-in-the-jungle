/**
 * @vitest-environment jsdom
 *
 * Behaviour tests for the deploy screen's selectable Ammo Load slot (UX-3).
 *
 * Caller-visible behaviour we care about:
 *  - The loadout sheet renders a 4th "Ammo Load" slot alongside the existing
 *    primary / secondary / equipment rows.
 *  - The slot shows the current load label (Standard by default / when absent)
 *    and surfaces the universal ammo-load pool as chips with the active one
 *    highlighted (NOT faction-filtered).
 *  - Cycling the slot's PREV/NEXT fires the loadout-change callback with the
 *    'ammoLoad' field key so it flows to LoadoutService.cycleField.
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { beforeEach, describe, it, expect, vi } from 'vitest';
import { DeployScreen } from './DeployScreen';
import { Alliance, Faction } from '../../systems/combat/types';
import { GameMode } from '../../config/gameModeTypes';
import {
  AmmoLoad,
  LoadoutEquipment,
  LoadoutWeapon,
  type PlayerLoadout,
} from '../loadout/LoadoutTypes';
import type { LoadoutPresentationModel } from '../../systems/player/LoadoutService';

function loadout(overrides: Partial<PlayerLoadout> = {}): PlayerLoadout {
  return {
    primaryWeapon: LoadoutWeapon.RIFLE,
    secondaryWeapon: LoadoutWeapon.SHOTGUN,
    equipment: LoadoutEquipment.FRAG_GRENADE,
    ...overrides,
  };
}

function presentation(): LoadoutPresentationModel {
  return {
    context: { mode: GameMode.ZONE_CONTROL, alliance: Alliance.BLUFOR, faction: Faction.US },
    factionLabel: 'US',
    presetIndex: 0,
    presetCount: 3,
    presetName: 'Rifleman',
    presetDescription: 'Balanced.',
    presetDirty: false,
    availableWeapons: [LoadoutWeapon.RIFLE, LoadoutWeapon.SHOTGUN],
    availableEquipment: [LoadoutEquipment.FRAG_GRENADE],
  };
}

/** The PREV/NEXT buttons for a loadout slot are text buttons inside the row
 * that owns the `loadout-<field>-value` element. Walk up to the row and pick
 * the button by its label. */
function slotButton(field: string, label: 'PREV' | 'NEXT'): HTMLButtonElement {
  const valueEl = document.getElementById(`loadout-${field}-value`)!;
  const row = valueEl.parentElement!.parentElement!;
  const button = Array.from(row.querySelectorAll('button')).find(
    b => b.textContent === label,
  );
  return button as HTMLButtonElement;
}

describe('DeployScreen ammo-load slot', () => {
  let screen: DeployScreen;

  beforeEach(() => {
    document.body.innerHTML = '';
    screen = new DeployScreen();
  });

  it('renders a 4th Ammo Load slot showing Standard when none is selected', () => {
    screen.updateLoadout(loadout());

    const value = document.getElementById('loadout-ammoLoad-value');
    expect(value).toBeTruthy();
    expect(value!.textContent).toBe('Standard');
  });

  it('reflects the selected ammo load in the slot value', () => {
    screen.updateLoadout(loadout({ ammoLoad: AmmoLoad.HEAVY }));

    expect(document.getElementById('loadout-ammoLoad-value')!.textContent).toBe('Heavy');
  });

  it('surfaces the universal ammo-load pool as chips with the active one highlighted', () => {
    screen.updateLoadoutPresentation(presentation());
    screen.updateLoadout(loadout({ ammoLoad: AmmoLoad.EXTENDED }));

    const valueEl = document.getElementById('loadout-ammoLoad-value')!;
    const row = valueEl.parentElement!.parentElement!;
    const chipTexts = Array.from(row.querySelectorAll('div'))
      .map(d => d.textContent)
      .filter(t => t === 'STD' || t === 'EXT' || t === 'HVY');

    // All three universal loads appear regardless of faction pool.
    expect(chipTexts).toEqual(['STD', 'EXT', 'HVY']);
  });

  it('cycles the ammo load forward via the slot NEXT button', () => {
    const onChange = vi.fn();
    screen.setLoadoutChangeCallback(onChange);
    screen.setLoadoutEditingEnabled(true);
    screen.updateLoadout(loadout());

    slotButton('ammoLoad', 'NEXT').dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith('ammoLoad', 1);
  });

  it('cycles the ammo load backward via the slot PREV button', () => {
    const onChange = vi.fn();
    screen.setLoadoutChangeCallback(onChange);
    screen.setLoadoutEditingEnabled(true);
    screen.updateLoadout(loadout());

    slotButton('ammoLoad', 'PREV').dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith('ammoLoad', -1);
  });
});
