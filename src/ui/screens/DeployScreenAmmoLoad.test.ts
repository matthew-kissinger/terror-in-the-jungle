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

function deploySession(overrides: Partial<Parameters<DeployScreen['configureSession']>[0]> = {}): Parameters<DeployScreen['configureSession']>[0] {
  return {
    kind: 'initial',
    mode: GameMode.ZONE_CONTROL,
    modeName: 'Zone Control',
    modeDescription: 'Fast-paced combat.',
    flow: 'standard',
    mapVariant: 'frontier',
    flowLabel: 'Frontline deployment',
    headline: 'RETURN TO BATTLE',
    subheadline: 'Choose a controlled position and return to the fight.',
    mapTitle: 'TACTICAL MAP - SELECT DEPLOYMENT',
    selectedSpawnTitle: 'SELECTED SPAWN POINT',
    emptySelectionText: 'Select a spawn point on the map',
    readySelectionText: 'Ready to deploy',
    countdownLabel: 'Deployment available in',
    readyLabel: 'Ready for deployment',
    actionLabel: 'DEPLOY',
    secondaryActionLabel: null,
    allowSpawnSelection: true,
    allowLoadoutEditing: true,
    sequenceTitle: 'Redeploy Checklist',
    sequenceSteps: [],
    ...overrides,
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

    const optionGrid = document.getElementById('respawn-loadout-ammoLoad-options')!;
    const optionValues = Array.from(optionGrid.querySelectorAll<HTMLButtonElement>('button[data-loadout-option]'))
      .map(button => button.dataset.loadoutOption);
    const active = optionGrid.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');

    // All three universal loads appear regardless of faction pool.
    expect(optionValues).toEqual([AmmoLoad.STANDARD, AmmoLoad.EXTENDED, AmmoLoad.HEAVY]);
    expect(active?.dataset.loadoutOption).toBe(AmmoLoad.EXTENDED);
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

  it('exposes a separate Armory deploy view', () => {
    const root = screen.getContainer();
    const armoryButton = document.getElementById('respawn-view-armory') as HTMLButtonElement;
    const armoryPanel = document.getElementById('respawn-armory-preview-panel') as HTMLDivElement;
    const mapPanel = document.getElementById('respawn-map')!.parentElement as HTMLDivElement;

    expect(root.dataset.deployView).toBe('insertion');
    expect(armoryPanel.style.display).toBe('none');

    armoryButton.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(root.dataset.deployView).toBe('armory');
    expect(armoryPanel.style.display).not.toBe('none');
    expect(mapPanel.style.display).toBe('none');
  });

  it('starts each deploy session on Insertion while keeping Armory available', () => {
    const root = screen.getContainer();
    const armoryButton = document.getElementById('respawn-view-armory') as HTMLButtonElement;
    const insertionButton = document.getElementById('respawn-view-insertion') as HTMLButtonElement;

    screen.configureSession(deploySession());
    armoryButton.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(root.dataset.deployView).toBe('armory');

    screen.configureSession(deploySession({ kind: 'respawn', headline: 'REDEPLOY' }));

    expect(root.dataset.deployView).toBe('insertion');
    expect(armoryButton.disabled).toBe(false);
    expect(insertionButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders an actual 3D character preview canvas in Armory', () => {
    const canvas = document.getElementById('respawn-armory-character-canvas') as HTMLCanvasElement;
    const stage = document.getElementById('respawn-armory-model-stage') as HTMLDivElement;

    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(stage).toContain(canvas);
  });

  it('routes direct Armory option selection through the loadout select callback', () => {
    const onSelect = vi.fn();
    screen.configureSession(deploySession());
    screen.setLoadoutSelectCallback(onSelect);
    screen.updateLoadoutPresentation(presentation());
    screen.updateLoadout(loadout());

    const shotgun = document.querySelector<HTMLButtonElement>(
      '#respawn-loadout-primaryWeapon-options button[data-loadout-option="shotgun"]'
    )!;
    shotgun.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(onSelect).toHaveBeenCalledWith('primaryWeapon', LoadoutWeapon.SHOTGUN);
  });

  it('updates the Armory preview when the active loadout changes', () => {
    screen.updateLoadout(loadout({
      primaryWeapon: LoadoutWeapon.LMG,
      secondaryWeapon: LoadoutWeapon.PISTOL,
      equipment: LoadoutEquipment.MORTAR_KIT,
      ammoLoad: AmmoLoad.HEAVY,
    }));

    expect(document.getElementById('respawn-armory-primary')!.textContent).toContain('LMG');
    expect(document.getElementById('respawn-armory-secondary')!.textContent).toContain('Pistol');
    expect(document.getElementById('respawn-armory-equipment')!.textContent).toContain('Mortar Kit');
    expect(document.getElementById('respawn-armory-ammo')!.textContent).toContain('Heavy');

    const primaryIcon = document.querySelector('#respawn-armory-primary img') as HTMLImageElement;
    const equipmentIcon = document.querySelector('#respawn-armory-equipment img') as HTMLImageElement;
    expect(primaryIcon.src).toContain('icon-lmg.png');
    expect(equipmentIcon.src).toContain('icon-mortar.png');
  });
});
