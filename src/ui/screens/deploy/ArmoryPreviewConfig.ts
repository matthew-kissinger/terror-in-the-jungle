// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { WeaponModels } from '../../../systems/assets/modelPaths';
import { getPixelForgeNpcRuntimeFaction } from '../../../systems/combat/PixelForgeNpcRuntime';
import { Faction } from '../../../systems/combat/types';
import { getWeaponArtMode, type WeaponArtMode } from '../../../config/weaponArtMode';
import { LoadoutWeapon } from '../../loadout/LoadoutTypes';

export type WeaponSocketMode = 'shouldered-forward' | 'hand-forward';

export interface ArmoryWeaponPreviewConfig {
  id: string;
  modelPath: string;
  lengthMeters: number;
  gripNames: string[];
  supportNames: string[];
  muzzleNames: string[];
  stockNames: string[];
  pitchTrimDeg: number;
  forwardHold: number;
  gripOffset: number;
  socketMode: WeaponSocketMode;
}

export const PREVIEW_CHARACTER_HEIGHT_M = 2.08;
export const FALLBACK_ARMORY_FACTION = Faction.US;

const COMMON_LONG_GUN_SOCKET: Pick<
  ArmoryWeaponPreviewConfig,
  'pitchTrimDeg' | 'forwardHold' | 'gripOffset' | 'socketMode'
> = {
  pitchTrimDeg: 5,
  forwardHold: 0.1,
  gripOffset: 0,
  socketMode: 'shouldered-forward',
};

type ArmoryPreviewConfigTable = Record<Exclude<LoadoutWeapon, LoadoutWeapon.RIFLE>, ArmoryWeaponPreviewConfig>;

// Legacy first-gen armory preview node vocabularies.
const WEAPON_PREVIEW_CONFIGS_LEGACY: ArmoryPreviewConfigTable = {
  [LoadoutWeapon.SHOTGUN]: {
    id: 'ithaca37',
    modelPath: WeaponModels.ITHACA37,
    lengthMeters: 1.02,
    gripNames: ['Mesh_TriggerGuard', 'Mesh_GripSwell', 'Mesh_Receiver'],
    supportNames: ['Mesh_PumpGrip', 'Mesh_MagazineTube', 'Mesh_Barrel'],
    muzzleNames: ['Mesh_FrontBead', 'Mesh_Barrel'],
    stockNames: ['Mesh_Buttpad', 'Mesh_Stock'],
    ...COMMON_LONG_GUN_SOCKET,
  },
  [LoadoutWeapon.SMG]: {
    id: 'm3-grease-gun',
    modelPath: WeaponModels.M3_GREASE_GUN,
    lengthMeters: 0.58,
    gripNames: ['Mesh_PistolGrip', 'Mesh_TriggerGuardBottom', 'Mesh_Receiver'],
    supportNames: ['Mesh_BarrelShroud', 'Mesh_ReceiverCapFront', 'Mesh_Barrel'],
    muzzleNames: ['Mesh_Muzzle', 'Mesh_Barrel', 'Mesh_FrontSight'],
    stockNames: ['Mesh_Buttplate', 'Mesh_StockRodTop', 'Mesh_StockRodBottom'],
    ...COMMON_LONG_GUN_SOCKET,
  },
  [LoadoutWeapon.PISTOL]: {
    id: 'm1911',
    modelPath: WeaponModels.M1911,
    lengthMeters: 0.22,
    gripNames: ['Joint_Grip', 'Mesh_GripMesh', 'Mesh_GripPanelL', 'Mesh_Frame'],
    supportNames: ['Mesh_Slide', 'Mesh_Barrel'],
    muzzleNames: ['Mesh_BarrelBushing', 'Mesh_FrontSight', 'Mesh_Barrel'],
    stockNames: ['Joint_Grip', 'Mesh_GripSafety', 'Mesh_Frame'],
    pitchTrimDeg: 0,
    forwardHold: 0.04,
    gripOffset: 0,
    socketMode: 'hand-forward',
  },
  [LoadoutWeapon.LMG]: {
    id: 'm60',
    modelPath: WeaponModels.M60,
    lengthMeters: 1.08,
    gripNames: ['Mesh_Grip', 'Mesh_TriggerGuard', 'Mesh_Receiver'],
    supportNames: ['Mesh_Handle', 'Mesh_HeatShield', 'Mesh_Barrel'],
    muzzleNames: ['Mesh_FrontSight', 'Mesh_Barrel'],
    stockNames: ['Mesh_Buttplate', 'Mesh_Stock'],
    pitchTrimDeg: 4,
    forwardHold: 0.08,
    gripOffset: 0,
    socketMode: 'shouldered-forward',
  },
  [LoadoutWeapon.LAUNCHER]: {
    id: 'm79',
    modelPath: WeaponModels.M79,
    lengthMeters: 0.74,
    gripNames: ['Mesh_PistolGrip', 'Mesh_TriggerGuard', 'Mesh_Receiver'],
    supportNames: ['Mesh_Handguard', 'Mesh_Barrel'],
    muzzleNames: ['Mesh_MuzzleRing', 'Mesh_Barrel', 'Mesh_FrontSight'],
    stockNames: ['Mesh_Buttpad', 'Mesh_Stock'],
    pitchTrimDeg: 4,
    forwardHold: 0.08,
    gripOffset: 0,
    socketMode: 'shouldered-forward',
  },
  [LoadoutWeapon.MARKSMAN]: {
    id: 'dragunov-svd',
    modelPath: WeaponModels.DRAGUNOV_SVD,
    lengthMeters: 1.29,
    gripNames: ['Mesh_TriggerGuard', 'Mesh_GripCap', 'Mesh_Receiver'],
    supportNames: ['Mesh_Handguard', 'Mesh_GasTube', 'Mesh_Barrel'],
    muzzleNames: ['Mesh_FlashHider', 'Mesh_FrontSightBase', 'Mesh_Barrel'],
    stockNames: ['Mesh_ButtPad', 'Mesh_Stock'],
    ...COMMON_LONG_GUN_SOCKET,
  },
  [LoadoutWeapon.SKS]: {
    id: 'sks',
    modelPath: WeaponModels.SKS,
    lengthMeters: 1.0,
    gripNames: ['Mesh_TriggerGuard', 'Mesh_Receiver', 'Mesh_Stock'],
    supportNames: ['Mesh_Handguard', 'Mesh_GasTube', 'Mesh_Barrel'],
    muzzleNames: ['Mesh_FrontSightBase', 'Mesh_Bayonet', 'Mesh_Barrel'],
    stockNames: ['Mesh_Buttplate', 'Mesh_Stock'],
    ...COMMON_LONG_GUN_SOCKET,
  },
};

// Kiln gen-2 repaint art (default). Node names verified by parsing each
// kiln-war-2026-06 GLB JSON chunk; lengthMeters track the catalog forward
// extents. findNamed (CombatantRenderer) takes the first resolvable name, so the
// first entry in each list is a node confirmed present in that GLB.
const WEAPON_PREVIEW_CONFIGS_KILN: ArmoryPreviewConfigTable = {
  [LoadoutWeapon.SHOTGUN]: {
    id: 'ithaca-37-pump-action',
    modelPath: WeaponModels.ITHACA_37_PUMP_ACTION,
    lengthMeters: 1.01,
    gripNames: ['Mesh_GuardBottom', 'Mesh_Receiver', 'Mesh_Buttstock'],
    supportNames: ['Mesh_ForendBase', 'Mesh_MagTube', 'Mesh_Barrel'],
    muzzleNames: ['Mesh_FrontSight', 'Mesh_Barrel'],
    stockNames: ['Mesh_Buttplate', 'Mesh_Buttstock'],
    ...COMMON_LONG_GUN_SOCKET,
  },
  [LoadoutWeapon.SMG]: {
    id: 'm3a1-grease-gun',
    modelPath: WeaponModels.M3A1_GREASE_GUN,
    lengthMeters: 0.75,
    gripNames: ['Mesh_PistolGrip', 'Mesh_TriggerGuardBottom', 'Mesh_Receiver'],
    supportNames: ['Mesh_BarrelCollar', 'Mesh_Barrel', 'Mesh_MagazineWell'],
    muzzleNames: ['Mesh_MuzzleTip', 'Mesh_Barrel', 'Mesh_FrontSight'],
    stockNames: ['Mesh_ButtCross', 'Mesh_ButtL', 'Mesh_StockRodL'],
    ...COMMON_LONG_GUN_SOCKET,
  },
  [LoadoutWeapon.PISTOL]: {
    id: 'm1911a1-colt',
    modelPath: WeaponModels.M1911A1_COLT,
    lengthMeters: 0.22,
    gripNames: ['Mesh_GripFrame', 'Mesh_GripPanelL', 'Mesh_FrameMid'],
    supportNames: ['Mesh_SlideBase', 'Mesh_Barrel'],
    muzzleNames: ['Mesh_Bore', 'Mesh_Bushing', 'Mesh_FrontSight', 'Mesh_Barrel'],
    stockNames: ['Mesh_GripFrame', 'Mesh_GripSafetyBack', 'Mesh_FrameMid'],
    pitchTrimDeg: 0,
    forwardHold: 0.04,
    gripOffset: 0,
    socketMode: 'hand-forward',
  },
  [LoadoutWeapon.LMG]: {
    id: 'm60-pig-general-purpose',
    modelPath: WeaponModels.M60_PIG_GENERAL_PURPOSE,
    lengthMeters: 1.35,
    gripNames: ['Mesh_PistolGrip', 'Mesh_TriggerGuard', 'Mesh_Receiver'],
    supportNames: ['Mesh_Handguard', 'Mesh_HandleGrip', 'Mesh_Barrel'],
    muzzleNames: ['Mesh_FlashHider', 'Mesh_FrontSight', 'Mesh_Barrel'],
    stockNames: ['Mesh_Buttplate', 'Mesh_StockUpper', 'Mesh_StockLower'],
    pitchTrimDeg: 4,
    forwardHold: 0.08,
    gripOffset: 0,
    socketMode: 'shouldered-forward',
  },
  [LoadoutWeapon.LAUNCHER]: {
    id: 'm79-thumper-40mm-grenade',
    modelPath: WeaponModels.M79_THUMPER_40MM_GRENADE,
    lengthMeters: 0.71,
    gripNames: ['Mesh_StockGrip', 'Mesh_GuardBottom', 'Mesh_ReceiverBlock'],
    supportNames: ['Mesh_ForeEndWood', 'Mesh_ForeEndCapsule', 'Mesh_Mesh_Barrel'],
    muzzleNames: ['Mesh_Mesh_Barrel', 'Mesh_FrontSightBase', 'Mesh_FrontSightBlade'],
    stockNames: ['Mesh_Buttplate', 'Mesh_StockMain', 'Mesh_StockComb'],
    pitchTrimDeg: 4,
    forwardHold: 0.08,
    gripOffset: 0,
    socketMode: 'shouldered-forward',
  },
  [LoadoutWeapon.MARKSMAN]: {
    id: 'dragunov-svd-sniper-rifle',
    modelPath: WeaponModels.DRAGUNOV_SVD_SNIPER_RIFLE,
    lengthMeters: 1.21,
    gripNames: ['Mesh_TriggerGuard', 'Mesh_Receiver', 'Mesh_SVD_Stock'],
    supportNames: ['Mesh_Handguard', 'Mesh_GasTube', 'Mesh_Barrel'],
    muzzleNames: ['Mesh_FlashHider', 'Mesh_FrontSightBase', 'Mesh_Barrel'],
    stockNames: ['Mesh_Buttplate', 'Mesh_SVD_Stock'],
    ...COMMON_LONG_GUN_SOCKET,
  },
  [LoadoutWeapon.SKS]: {
    id: 'sks-carbine',
    modelPath: WeaponModels.SKS_CARBINE,
    lengthMeters: 1.04,
    gripNames: ['Mesh_TriggerGuard', 'Mesh_Receiver', 'Mesh_Stock'],
    supportNames: ['Mesh_Handguard', 'Mesh_GasTube', 'Mesh_Barrel'],
    muzzleNames: ['Mesh_FrontSightBase', 'Mesh_Bayonet', 'Mesh_Barrel'],
    stockNames: ['Mesh_Buttplate', 'Mesh_Stock'],
    ...COMMON_LONG_GUN_SOCKET,
  },
};

const WEAPON_PREVIEW_CONFIGS_BY_MODE: Record<WeaponArtMode, ArmoryPreviewConfigTable> = {
  legacy: WEAPON_PREVIEW_CONFIGS_LEGACY,
  kiln: WEAPON_PREVIEW_CONFIGS_KILN,
};

// Bound once at module load so the preview matches the held NPC / FPS art.
// Flip with `?weaponArt=legacy` or a pre-set `window.__weaponArt = 'legacy'`.
const WEAPON_PREVIEW_CONFIGS: ArmoryPreviewConfigTable =
  WEAPON_PREVIEW_CONFIGS_BY_MODE[getWeaponArtMode()];

export function getArmoryWeaponPreviewConfig(
  weapon: LoadoutWeapon,
  faction: Faction,
): ArmoryWeaponPreviewConfig {
  if (weapon !== LoadoutWeapon.RIFLE) return WEAPON_PREVIEW_CONFIGS[weapon];
  const runtimeWeapon = getPixelForgeNpcRuntimeFaction(faction).weapon;
  return {
    ...runtimeWeapon,
    socketMode: 'shouldered-forward',
  };
}
