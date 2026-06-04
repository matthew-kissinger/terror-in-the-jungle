// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { AirSupportType } from './AirSupportTypes';

export type AirSupportRadioAssetId =
  | 'a1_napalm'
  | 'a1_rockets'
  | 'f4_bombs'
  | 'ac47_orbit'
  | 'cobra_rocket_run'
  | 'huey_gunship_strafe';

export type AirSupportTargetMarking = 'smoke' | 'willie_pete' | 'position_only';

export interface AirSupportRadioAsset {
  id: AirSupportRadioAssetId;
  label: string;
  aircraft: string;
  payload: string;
  mission: string;
  cooldownSeconds: number;
}

export interface AirSupportTargetMarkingOption {
  id: AirSupportTargetMarking;
  label: string;
  shortLabel: string;
}

export type AirSupportRadioCooldowns = Partial<Record<AirSupportRadioAssetId, number>>;

export const AIR_SUPPORT_TARGET_MARKINGS: AirSupportTargetMarkingOption[] = [
  { id: 'smoke', label: 'Smoke Mark', shortLabel: 'Smoke' },
  { id: 'willie_pete', label: 'Willie Pete', shortLabel: 'WP' },
  { id: 'position_only', label: 'Position Only', shortLabel: 'Grid' },
];

export const AIR_SUPPORT_RADIO_ASSETS: AirSupportRadioAsset[] = [
  {
    id: 'a1_napalm',
    label: 'A-1 Napalm',
    aircraft: 'A-1 Skyraider',
    payload: 'Napalm',
    mission: 'Low strike',
    cooldownSeconds: 90,
  },
  {
    id: 'a1_rockets',
    label: 'A-1 Rockets',
    aircraft: 'A-1 Skyraider',
    payload: 'Rocket pods',
    mission: 'Dive attack',
    cooldownSeconds: 60,
  },
  {
    id: 'f4_bombs',
    label: 'F-4 Bombs',
    aircraft: 'F-4 Phantom',
    payload: 'Bombs',
    mission: 'Fast strike',
    cooldownSeconds: 90,
  },
  {
    id: 'ac47_orbit',
    label: 'AC-47 Orbit',
    aircraft: 'AC-47 Spooky',
    payload: 'Miniguns',
    mission: 'Pylon orbit',
    cooldownSeconds: 180,
  },
  {
    id: 'cobra_rocket_run',
    label: 'Cobra Rocket Run',
    aircraft: 'AH-1 Cobra',
    payload: 'Rockets',
    mission: 'Gunship run',
    cooldownSeconds: 60,
  },
  {
    id: 'huey_gunship_strafe',
    label: 'Huey Gunship Strafe',
    aircraft: 'UH-1C Gunship',
    payload: 'Minigun strafe',
    mission: 'Close support',
    cooldownSeconds: 180,
  },
];

/**
 * Maps each radio asset onto the runtime sortie type that fulfils it
 * (`AirSupportManager.requestSupport`). Several radio assets share a runtime
 * type — they share that type's cooldown, which is the single cooldown
 * authority (the catalog `cooldownSeconds` are aligned to it for the HUD bar).
 */
export const radioAssetToSupportType: Record<AirSupportRadioAssetId, AirSupportType> = {
  a1_napalm: 'napalm',
  a1_rockets: 'rocket_run',
  f4_bombs: 'napalm',
  ac47_orbit: 'spooky',
  cobra_rocket_run: 'rocket_run',
  huey_gunship_strafe: 'spooky',
};

export function getAirSupportRadioAsset(assetId: AirSupportRadioAssetId): AirSupportRadioAsset {
  const asset = AIR_SUPPORT_RADIO_ASSETS.find((entry) => entry.id === assetId);
  if (!asset) {
    throw new Error(`Unknown air support radio asset: ${assetId}`);
  }
  return asset;
}

export function getCooldownRemaining(
  cooldowns: AirSupportRadioCooldowns,
  assetId: AirSupportRadioAssetId,
): number {
  const value = cooldowns[assetId] ?? 0;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function countReadyAssets(cooldowns: AirSupportRadioCooldowns): number {
  return AIR_SUPPORT_RADIO_ASSETS.filter((asset) => getCooldownRemaining(cooldowns, asset.id) <= 0).length;
}
