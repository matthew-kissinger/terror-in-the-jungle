/**
 * @vitest-environment jsdom
 *
 * Behaviour tests for the deploy armory's weapon-stats readout
 * (weapon-stats-panel).
 *
 * Caller-visible behaviour we care about:
 *  - The armory surfaces the focused weapon's rpm / damage near→far / falloff
 *    range / recoil / ADS time, sourced from the weapon's own `WeaponSpec`.
 *  - The readout changes when the focused weapon changes (loadout update or a
 *    chip-strip selection).
 *
 * The expected numbers are read from `WeaponRigManager.getWeaponSpec` (the same
 * spec table the runtime weapon cores are built from), NOT hard-coded — so this
 * stays a behaviour test that survives a weapon-balance retune: it only fails if
 * the armory shows numbers that DON'T match the selected weapon's spec.
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { beforeEach, describe, it, expect } from 'vitest';
import { DeployScreen } from './DeployScreen';
import { Alliance, Faction } from '../../systems/combat/types';
import { GameMode } from '../../config/gameModeTypes';
import {
  LoadoutEquipment,
  LoadoutWeapon,
  type PlayerLoadout,
} from '../loadout/LoadoutTypes';
import { WeaponRigManager } from '../../systems/player/weapon/WeaponRigManager';
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
    availableWeapons: [LoadoutWeapon.RIFLE, LoadoutWeapon.MARKSMAN, LoadoutWeapon.SMG],
    availableEquipment: [LoadoutEquipment.FRAG_GRENADE],
  };
}

function statText(key: string): string {
  return document.getElementById(`respawn-armory-stat-${key}`)!.textContent ?? '';
}

function specFor(weapon: LoadoutWeapon) {
  return WeaponRigManager.getWeaponSpec(
    weapon as Parameters<typeof WeaponRigManager.getWeaponSpec>[0],
  );
}

describe('DeployScreen weapon-stats readout', () => {
  let screen: DeployScreen;

  beforeEach(() => {
    document.body.innerHTML = '';
    screen = new DeployScreen();
  });

  it('renders the focused weapon spec stats in the armory', () => {
    screen.updateLoadout(loadout({ primaryWeapon: LoadoutWeapon.RIFLE }));

    const spec = specFor(LoadoutWeapon.RIFLE);
    expect(document.getElementById('respawn-armory-weapon-stats-name')!.textContent)
      .toBe(spec.name);
    // Each rendered stat must carry the spec's own values for that weapon.
    expect(statText('rpm')).toContain(String(Math.round(spec.rpm)));
    expect(statText('damage')).toContain(String(Math.round(spec.damageNear)));
    expect(statText('damage')).toContain(String(Math.round(spec.damageFar)));
    expect(statText('falloff')).toContain(String(Math.round(spec.falloffStart)));
    expect(statText('falloff')).toContain(String(Math.round(spec.falloffEnd)));
    expect(statText('recoil')).toContain(spec.recoilPerShotDeg.toFixed(2));
    expect(statText('ads')).toContain(spec.adsTime.toFixed(2));
  });

  it('shows different stats for a different weapon (each matches its own spec)', () => {
    screen.updateLoadout(loadout({ primaryWeapon: LoadoutWeapon.MARKSMAN }));

    const marksman = specFor(LoadoutWeapon.MARKSMAN);
    const rifle = specFor(LoadoutWeapon.RIFLE);

    // The marksman reads as a DISTINCT weapon, not the rifle.
    expect(document.getElementById('respawn-armory-weapon-stats-name')!.textContent)
      .toBe(marksman.name);
    expect(statText('rpm')).toContain(String(Math.round(marksman.rpm)));
    expect(statText('damage')).toContain(String(Math.round(marksman.damageNear)));
    expect(statText('rpm')).not.toContain(String(Math.round(rifle.rpm)));
  });

  it('updates the stats when the focused weapon changes via the loadout', () => {
    screen.updateLoadout(loadout({ primaryWeapon: LoadoutWeapon.SMG }));
    expect(statText('rpm')).toContain(String(Math.round(specFor(LoadoutWeapon.SMG).rpm)));

    screen.updateLoadout(loadout({ primaryWeapon: LoadoutWeapon.PISTOL }));
    expect(statText('rpm')).toContain(String(Math.round(specFor(LoadoutWeapon.PISTOL).rpm)));
    expect(document.getElementById('respawn-armory-weapon-stats-name')!.textContent)
      .toBe(specFor(LoadoutWeapon.PISTOL).name);
  });

  it('updates the stats when a weapon chip is selected in the armory', () => {
    screen.configureSession(deploySession());
    screen.setLoadoutEditingEnabled(true);
    screen.updateLoadoutPresentation(presentation());
    screen.updateLoadout(loadout({ primaryWeapon: LoadoutWeapon.RIFLE }));

    const marksmanChip = document.querySelector<HTMLButtonElement>(
      '#respawn-loadout-primaryWeapon-options button[data-loadout-option="marksman"]',
    )!;
    marksmanChip.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    const marksman = specFor(LoadoutWeapon.MARKSMAN);
    expect(document.getElementById('respawn-armory-weapon-stats-name')!.textContent)
      .toBe(marksman.name);
    expect(statText('damage')).toContain(String(Math.round(marksman.damageNear)));
  });
});

function deploySession(): Parameters<DeployScreen['configureSession']>[0] {
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
  };
}
