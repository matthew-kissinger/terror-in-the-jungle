// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Combatant, Squad, SquadCommand } from './types';
import { SquadCommandConfig } from '../../config/SquadCommandConfig';

/**
 * Per-tick standing-order intent for a player-commanded combatant (SVYAZ-4
 * Stage 2 persistence leash). Pure + stateless: derived only from the squad
 * order board (`currentCommand` / `commandPosition` / `commandLeashRadius`) and
 * `SquadCommandConfig`. No `Math.random`, no wall-clock / time-of-day reads —
 * the surrounding combat code has flagged nondeterminism, so this helper stays
 * trivially testable and reproducible.
 */
export interface SquadOrderIntent {
  /**
   * False only for an active leashed order whose anchor is known. When false the
   * caller must apply the leash gate (`isWithinLeash`) before acquiring/chasing
   * an enemy. True means "no active leashed order — behave autonomously", so the
   * off-commanded-path code path is byte-identical (the caller skips the gate).
   */
  acquisitionAllowed: boolean;
  /** Whether an active HOLD / ATTACK / PATROL order is in force for this squad. */
  hasActiveOrder: boolean;
  /**
   * Standing posture derived from the squad command.
   * - `hold` / `attack` / `patrol`: leashed standing orders (acquisition gated by
   *   `isWithinLeash`).
   * - `fallback`: break contact and run to rally (FALL BACK / RETREAT). Not a
   *   leashed order — `hasActiveOrder` is false — but a distinct posture the
   *   acquisition scans use to suppress fire unless the unit is pinned
   *   (`isFallbackAcquisitionSuppressed`).
   * - `none`: behave autonomously (off the commanded path).
   */
  mode: 'none' | 'hold' | 'attack' | 'patrol' | 'fallback';
  /** Leash radius (metres) for the active leashed order, or 0 otherwise. */
  leashRadius: number;
  /**
   * Order anchor. For HOLD/ATTACK/PATROL this is the squad's `commandPosition`.
   * For `fallback` it is the explicit marked rally point, or null when the squad
   * means "rally to the live player" (resolved by `resolveFallbackRally`).
   */
  anchor: THREE.Vector3 | null;
}

const NONE_INTENT: SquadOrderIntent = {
  acquisitionAllowed: true,
  hasActiveOrder: false,
  mode: 'none',
  leashRadius: 0,
  anchor: null,
};

function modeForCommand(command: SquadCommand | undefined): SquadOrderIntent['mode'] {
  switch (command) {
    case SquadCommand.HOLD_POSITION:
      return 'hold';
    case SquadCommand.ATTACK_HERE:
      return 'attack';
    case SquadCommand.PATROL_HERE:
      return 'patrol';
    case SquadCommand.RETREAT:
      return 'fallback';
    default:
      return 'none';
  }
}

/**
 * Resolve the per-tick leash radius (metres) for a leashed order. Prefers the
 * `commandLeashRadius` resolved at issue time onto the squad; falls back to the
 * live `SquadCommandConfig` value for the order type so the helper is correct
 * even when the squad was issued before the field existed.
 */
function leashRadiusFor(mode: SquadOrderIntent['mode'], squad: Squad): number {
  if (squad.commandLeashRadius !== undefined && squad.commandLeashRadius > 0) {
    return squad.commandLeashRadius;
  }
  switch (mode) {
    case 'hold':
      return SquadCommandConfig.holdLeashRadius;
    case 'attack':
      return SquadCommandConfig.attackLeashRadius;
    case 'patrol':
      return SquadCommandConfig.patrolRoamRadius;
    default:
      return 0;
  }
}

/**
 * Derive the standing-order intent for a combatant in a player-commanded squad.
 *
 * Returns a "no order" intent (acquisitionAllowed=true) — the off-commanded-path
 * default — for any of: non-player squad, no/STAND-DOWN/FREE-ROAM order, a
 * leashed order with no anchor set. Those cases must remain byte-identical to
 * pre-leash behavior, so the caller skips the gate entirely.
 */
export function resolveOrderIntent(_combatant: Combatant, squad: Squad | undefined): SquadOrderIntent {
  if (!squad || !squad.isPlayerControlled) {
    return NONE_INTENT;
  }

  const mode = modeForCommand(squad.currentCommand);
  if (mode === 'none') {
    return NONE_INTENT;
  }

  if (mode === 'fallback') {
    // FALL BACK is a posture, not a leash: the unit breaks contact and runs to
    // rally. `hasActiveOrder` stays false so the leash band (`isWithinLeash`)
    // never gates it; acquisition is instead suppressed unless the unit is
    // pinned (`isFallbackAcquisitionSuppressed`). A null anchor means "rally to
    // the live player" (resolved by `resolveFallbackRally`) — that is a valid
    // fallback, unlike a leashed order with no marked point.
    return {
      acquisitionAllowed: false,
      hasActiveOrder: false,
      mode,
      leashRadius: 0,
      anchor: squad.commandPosition ?? null,
    };
  }

  const anchor = squad.commandPosition ?? null;
  if (!anchor) {
    // A leashed order with no marked point cannot anchor a leash — leave the NPC
    // autonomous rather than anchoring on its own feet (the old broken default).
    return NONE_INTENT;
  }

  return {
    acquisitionAllowed: false,
    hasActiveOrder: true,
    mode,
    leashRadius: leashRadiusFor(mode, squad),
    anchor,
  };
}

/**
 * Decide whether an enemy at `enemyPosition` is within engage reach of a leashed
 * order — i.e. no farther than (leashRadius + engageBandPastLeash) from the
 * anchor. Pure horizontal (XZ) distance so terrain height never skews the leash.
 *
 * Returns true when the intent has no active leash (the caller should not gate).
 */
export function isWithinLeash(intent: SquadOrderIntent, enemyPosition: THREE.Vector3): boolean {
  if (!intent.hasActiveOrder || !intent.anchor) {
    return true;
  }
  const reach = intent.leashRadius + SquadCommandConfig.engageBandPastLeash;
  const dx = enemyPosition.x - intent.anchor.x;
  const dz = enemyPosition.z - intent.anchor.z;
  return dx * dx + dz * dz <= reach * reach;
}

/**
 * Resolve the FALL BACK rally destination for a player-commanded squad (SVYAZ-4
 * Stage 3). Honors an explicit marked point (`commandPosition`) when one is set;
 * otherwise rallies to the live player position when
 * `SquadCommandConfig.fallBackRallyToPlayer` is on. Returns null only when there
 * is no marked point and rally-to-player is disabled — the caller then leaves the
 * existing destination alone.
 *
 * Pure: clones inputs, reads no clock / RNG. The caller supplies `playerPosition`
 * so the squad order board never has to embed the (mutable) player reference.
 */
export function resolveFallbackRally(
  squad: Squad | undefined,
  playerPosition: THREE.Vector3,
): THREE.Vector3 | null {
  if (squad?.commandPosition) {
    return squad.commandPosition.clone();
  }
  if (SquadCommandConfig.fallBackRallyToPlayer) {
    return playerPosition.clone();
  }
  return null;
}

/**
 * "Fire only if pinned" gate for a FALL BACK unit (SVYAZ-4 Stage 3). A retreating
 * unit suppresses acquisition — it runs to rally rather than turning to fight —
 * UNLESS it was hit within `SquadCommandConfig.fallBackPinnedWindowSeconds`, in
 * which case it is pinned and may shoot back. Returns true when acquisition
 * should be suppressed.
 *
 * Pure: the clock read stays in the caller (which passes `nowMs`), so this helper
 * is deterministic and reproducible under test.
 */
export function isFallbackAcquisitionSuppressed(
  intent: SquadOrderIntent,
  lastHitTimeMs: number,
  nowMs: number,
): boolean {
  if (intent.mode !== 'fallback') return false;
  const pinned = isRecentlyHit(lastHitTimeMs, nowMs, SquadCommandConfig.fallBackPinnedWindowSeconds * 1000);
  return !pinned;
}

/**
 * Pure recency test: was `lastHitTimeMs` within `windowMs` before `nowMs`?
 * A `lastHitTimeMs` of 0 (never hit) is treated as not-recent. Extracted so the
 * "pinned" decision is unit-testable without a clock.
 */
export function isRecentlyHit(lastHitTimeMs: number, nowMs: number, windowMs: number): boolean {
  if (!lastHitTimeMs) return false;
  return nowMs - lastHitTimeMs < windowMs;
}
