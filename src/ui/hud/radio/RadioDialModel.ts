// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * RadioDialModel — the ONE catalog-driven data model behind both radio dial
 * presentations (desktop `RadialDialView`, touch `RadioBottomSheet`).
 *
 * It does NOT own any catalog of its own. It COMPOSES the existing first-party
 * catalogs into a uniform category → option tree so the two views render the
 * same data and the controller issues the same intents:
 *
 *   - FIRE SUPPORT ← `AIR_SUPPORT_RADIO_ASSETS` (+ target-mode drilldown)
 *   - SQUAD        ← `SQUAD_QUICK_COMMAND_OPTIONS`
 *   - SIGNALS      ← `RADIO_STATIONS` (always-available; routed to RadioStationSystem)
 *
 * The model is pure data + helpers (no DOM, no THREE). Cooldown state is fed in
 * by the controller and resolved by support TYPE, so two radio assets that
 * share a runtime sortie type (e.g. the AC-47 orbit and Huey strafe both map to
 * `spooky`) grey out together.
 */

import {
  AIR_SUPPORT_RADIO_ASSETS,
  getCooldownRemaining,
  radioAssetToSupportType,
  type AirSupportRadioAssetId,
  type AirSupportRadioCooldowns,
  type AirSupportTargetMarking,
} from '../../../systems/airsupport/AirSupportRadioCatalog';
import { SQUAD_QUICK_COMMAND_OPTIONS } from '../../../systems/combat/SquadCommandPresentation';
import type { SquadCommand } from '../../../systems/combat/types';
import { RADIO_STATIONS } from '../../../config/radioStations';

/** The three always-present categories on the dial (inner ring on desktop). */
export type RadioCategoryId = 'fire-support' | 'squad' | 'signals';

export type FireSupportTargetMode = 'current-smoke' | 'throw-smoke-marker' | 'reticle-grid';

/**
 * A leaf option on an outer ring / drill list. The discriminated `kind`
 * carries the catalog-native id the controller needs to issue the intent.
 */
export type RadioOption =
  | {
      kind: 'fire-support';
      id: string;
      label: string;
      detail: string;
      assetId: AirSupportRadioAssetId;
    }
  | {
      kind: 'fire-support-target';
      id: string;
      label: string;
      detail: string;
      targetMode: FireSupportTargetMode;
      assetId: AirSupportRadioAssetId;
    }
  | {
      kind: 'squad';
      id: string;
      label: string;
      detail: string;
      slot: number;
      command: SquadCommand;
    }
  | {
      kind: 'station';
      id: string;
      label: string;
      detail: string;
      stationId: string;
    };

export interface RadioCategory {
  id: RadioCategoryId;
  label: string;
  /** Short hint shown under the category (one line). */
  hint: string;
  options: RadioOption[];
}

/**
 * The intent a selection produces. The controller resolves an option into one
 * of these and hands it to the owner (`CommandInputManager`), which drives the
 * real squad / air-support / radio-station paths. No view issues an intent
 * directly — they all funnel through the controller.
 */
export type RadioIntent =
  | {
      kind: 'fire-support';
      assetId: AirSupportRadioAssetId;
      marking: AirSupportTargetMarking;
      targetMode: Exclude<FireSupportTargetMode, 'throw-smoke-marker'>;
    }
  | { kind: 'throw-smoke-marker'; assetId: AirSupportRadioAssetId }
  | { kind: 'squad'; slot: number; command: SquadCommand }
  | { kind: 'station'; stationId: string };

function buildFireSupportCategory(): RadioCategory {
  return {
    id: 'fire-support',
    label: 'Fire Support',
    hint: 'Choose aircraft, then target method.',
    options: AIR_SUPPORT_RADIO_ASSETS.map((asset) => ({
      kind: 'fire-support' as const,
      id: asset.id,
      label: asset.label,
      detail: `${asset.aircraft} / ${asset.payload}`,
      assetId: asset.id,
    })),
  };
}

function buildSquadCategory(): RadioCategory {
  return {
    id: 'squad',
    label: 'Squad',
    hint: 'Order your fire team.',
    options: SQUAD_QUICK_COMMAND_OPTIONS.map((option) => ({
      kind: 'squad' as const,
      id: `slot-${option.slot}`,
      label: option.fullLabel,
      detail: option.effect,
      slot: option.slot,
      command: option.command,
    })),
  };
}

function buildSignalsCategory(): RadioCategory {
  return {
    id: 'signals',
    label: 'Signals',
    hint: 'Tune the field radio.',
    options: RADIO_STATIONS.map((station) => ({
      kind: 'station' as const,
      id: station.id,
      label: station.label,
      detail: station.description,
      stationId: station.id,
    })),
  };
}

/**
 * Build the full category tree. Always returns all four categories in a stable
 * order; STATIONS is always present (it is wired to the headless
 * `RadioStationSystem` and never gated by squad/air-support availability).
 */
export function buildRadioCategories(): RadioCategory[] {
  return [
    buildFireSupportCategory(),
    buildSquadCategory(),
    buildSignalsCategory(),
  ];
}

export function buildFireSupportTargetOptions(assetId: AirSupportRadioAssetId): RadioOption[] {
  return [
    {
      kind: 'fire-support-target',
      id: `${assetId}:current-smoke`,
      label: 'Use Smoke',
      detail: 'Use the active smoke marker.',
      targetMode: 'current-smoke',
      assetId,
    },
    {
      kind: 'fire-support-target',
      id: `${assetId}:throw-smoke-marker`,
      label: 'Throw Smoke',
      detail: 'Equip a smoke marker canister.',
      targetMode: 'throw-smoke-marker',
      assetId,
    },
    {
      kind: 'fire-support-target',
      id: `${assetId}:reticle-grid`,
      label: 'Reticle/Grid',
      detail: 'Designate where you look.',
      targetMode: 'reticle-grid',
      assetId,
    },
  ];
}

/**
 * Remaining cooldown (seconds) for an option, resolved by support TYPE so
 * assets sharing a sortie type share the bar. Non-fire-support options never
 * cool down (return 0).
 */
export function radioOptionCooldown(
  option: RadioOption,
  cooldowns: AirSupportRadioCooldowns,
): number {
  if (option.kind !== 'fire-support' && option.kind !== 'fire-support-target') return 0;
  const type = radioAssetToSupportType[option.assetId];
  if (!type) return getCooldownRemaining(cooldowns, option.assetId);
  // Resolve by type: take the max remaining across every asset of this type so
  // all assets of a cooling-down sortie grey out together.
  let remaining = 0;
  for (const asset of AIR_SUPPORT_RADIO_ASSETS) {
    if (radioAssetToSupportType[asset.id] !== type) continue;
    remaining = Math.max(remaining, getCooldownRemaining(cooldowns, asset.id));
  }
  return remaining;
}

/** True when the option is currently selectable (not cooling down). */
export function isRadioOptionReady(
  option: RadioOption,
  cooldowns: AirSupportRadioCooldowns,
): boolean {
  return radioOptionCooldown(option, cooldowns) <= 0;
}

/** Format a cooldown remaining (seconds) into a compact dial label. */
export function formatRadioCooldown(seconds: number): string {
  const safe = Math.ceil(Math.max(0, seconds));
  return safe >= 60 ? `${Math.ceil(safe / 60)}M` : `${safe}S`;
}
