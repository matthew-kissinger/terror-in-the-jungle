// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { AirSupportType } from './AirSupportTypes';

/**
 * Pure target-validity gates for the air-support DESIGNATE step. Kept free of
 * THREE / DOM so the predicates are trivially unit-testable: the call-in UI
 * feeds in a precomputed horizontal distance + friendly count and renders the
 * returned status (ring colour, banner text, commit-enabled).
 */

export type StrikeGateStatus = 'valid' | 'out_of_range' | 'no_ground' | 'danger_close';

export interface StrikeGateInput {
  /** Horizontal (XZ) distance from the requester to the marked point, metres. */
  horizontalDistance: number;
  /** False when the view-ray fell back to the sky (no terrain hit). */
  hasGround: boolean;
  /** Max call range for the asset, metres; undefined = unlimited. */
  maxCallRange?: number;
  /** Danger-close envelope radius, metres; undefined = no danger-close concept. */
  dangerCloseRadius?: number;
  /** Friendly combatants inside the danger-close radius of the mark. */
  friendliesInRadius: number;
}

export interface StrikeGateResult {
  status: StrikeGateStatus;
  /** Can the strike be confirmed with a single press? */
  canCommit: boolean;
  /** Danger-close: confirm is allowed but needs a deliberate override. */
  requiresOverride: boolean;
}

/**
 * Generous per-asset max call ranges (metres). The intent is only to grey an
 * absurdly distant mark, not to fight normal play — most marks are well inside.
 * Arclight (strategic saturation) is unlimited.
 */
export const STRIKE_MAX_CALL_RANGE: Record<AirSupportType, number | undefined> = {
  spooky: 1500,
  napalm: 1200,
  rocket_run: 1000,
  recon: 2000,
  arclight: undefined,
};

/**
 * Approximate ground footprint (metres) used to size the DESIGNATE ring so the
 * player sees roughly where the ordnance lands. Saturation strikes read large;
 * precision runs read tight.
 */
export const STRIKE_FOOTPRINT_RADIUS: Record<AirSupportType, number> = {
  spooky: 30,
  napalm: 45,
  rocket_run: 20,
  recon: 14,
  arclight: 90,
};

export function horizontalDistanceXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/**
 * Resolve the DESIGNATE gate. Precedence: no-ground (looking at sky) → out of
 * range → danger-close (valid mark but friendlies are inside the envelope, needs
 * an override) → valid.
 */
export function resolveStrikeGate(input: StrikeGateInput): StrikeGateResult {
  if (!input.hasGround) {
    return { status: 'no_ground', canCommit: false, requiresOverride: false };
  }
  if (input.maxCallRange !== undefined && input.horizontalDistance > input.maxCallRange) {
    return { status: 'out_of_range', canCommit: false, requiresOverride: false };
  }
  if (
    input.dangerCloseRadius !== undefined &&
    input.dangerCloseRadius > 0 &&
    input.friendliesInRadius > 0
  ) {
    return { status: 'danger_close', canCommit: false, requiresOverride: true };
  }
  return { status: 'valid', canCommit: true, requiresOverride: false };
}
