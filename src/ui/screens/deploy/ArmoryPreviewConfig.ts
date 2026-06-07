// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { WeaponModels } from '../../../systems/assets/modelPaths';
import { getPixelForgeNpcRuntimeFaction } from '../../../systems/combat/PixelForgeNpcRuntime';
import { Faction } from '../../../systems/combat/types';
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

const WEAPON_PREVIEW_CONFIGS: Record<Exclude<LoadoutWeapon, LoadoutWeapon.RIFLE>, ArmoryWeaponPreviewConfig> = {
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
};

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
