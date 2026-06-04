// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { Combatant } from './types';

/**
 * Slope-stuck detector. Distinct from the general-purpose
 * {@link ./StuckDetector | StuckDetector} so that a recoverable, terrain-only
 * stall (NPC pinned on an unwalkable incline) can bypass the
 * backtrack/hold escalation ladder and instead yield to gravity until the
 * combatant lands on walkable slope again.
 *
 * Contract:
 *   - {@link checkAndUpdate} is called every {@link CombatantMovement.updateMovement}
 *     tick, after the terrain-aware solver has set the desired velocity for
 *     the frame.
 *   - When the combatant has intended-but-stalled movement (full forward
 *     intent, speed below {@link STUCK_SPEED_EPSILON} m/s) on an unwalkable
 *     slope for longer than {@link SLOPE_STALL_TIME_MS}, the detector flips
 *     to the recovering state and returns `'slide'`. The caller is expected
 *     to override the frame's velocity with a downhill slide.
 *   - The recovering state persists across frames until the combatant
 *     reaches a walkable slope, at which point `'recovered'` is returned
 *     exactly once so the caller can re-acquire its pathing target (clear
 *     the cached navmesh path, drop the recovery flag).
 *
 * Threshold rationale:
 *   - {@link SLOPE_STALL_TIME_MS} = 1500 ms matches the per-task brief
 *     (`docs/tasks/cycle-defekt-4-npc-route-quality.md` §npc-slope-stuck-recovery).
 *     Long enough that contour + scored-recovery paths inside
 *     {@link CombatantMovement} have already had a chance to fire before the
 *     slope-slide fallback kicks in, short enough that it does not feel
 *     stuck on screen.
 *   - The walkable-slope cutoff is owned by
 *     {@link ../terrain/SlopePhysics.isWalkableSlope}; this detector
 *     receives the boolean from the caller so the threshold stays in
 *     lockstep with player physics.
 *
 * No randomness, no state-machine label shuffles — small map, small
 * surface, two transitions: idle -> recovering -> recovered -> idle.
 */
export const STUCK_SPEED_EPSILON = 0.5;
export const SLOPE_STALL_TIME_MS = 1500;

export type SlopeStuckAction =
  /** No recovery action this tick. NPC may or may not be stalled. */
  | 'none'
  /** NPC is in recovery; caller should apply a downhill slide velocity. */
  | 'slide'
  /** Recovery cleared on this tick; caller should drop cached path. */
  | 'recovered';

interface SlopeStuckRecord {
  /** Wall-clock ms when this NPC first looked stalled on an unwalkable slope. */
  stallStartMs?: number;
  /** True once the stall has tipped over the time threshold. */
  recovering: boolean;
}

export class SlopeStuckDetector {
  private records = new Map<string, SlopeStuckRecord>();

  /**
   * Update detector state for a combatant.
   *
   * @param combatant - the combatant being evaluated.
   * @param now       - wall-clock ms.
   * @param onUnwalkableSlope - true when the combatant currently stands on a
   *                            slope steeper than {@link isWalkableSlope}.
   * @param wantsMovement - true when the combatant has live movement intent
   *                        (i.e. the AI is asking it to push toward an
   *                        anchor). Recovery never triggers for an NPC
   *                        that is voluntarily stationary.
   * @param currentSpeed - horizontal speed magnitude (m/s) the solver just
   *                       computed for this frame.
   */
  checkAndUpdate(
    combatant: Combatant,
    now: number,
    onUnwalkableSlope: boolean,
    wantsMovement: boolean,
    currentSpeed: number,
  ): SlopeStuckAction {
    let record = this.records.get(combatant.id);

    // Already sliding — exit when we land on walkable slope, otherwise keep
    // sliding regardless of how the solver currently feels about movement.
    if (record?.recovering) {
      if (!onUnwalkableSlope) {
        this.records.delete(combatant.id);
        return 'recovered';
      }
      return 'slide';
    }

    // Not yet recovering. Only accumulate stall time when the AI wants the
    // NPC to move and the slope is unwalkable but the realized speed is
    // negligible. Anything else clears the stall window.
    const stalled = wantsMovement && onUnwalkableSlope && currentSpeed < STUCK_SPEED_EPSILON;
    if (!stalled) {
      if (record) {
        // Reset partial accumulation so a momentary slowdown doesn't carry
        // over to the next time the NPC pins.
        this.records.delete(combatant.id);
      }
      return 'none';
    }

    if (!record) {
      record = { stallStartMs: now, recovering: false };
      this.records.set(combatant.id, record);
      return 'none';
    }

    if (record.stallStartMs === undefined) {
      record.stallStartMs = now;
      return 'none';
    }

    if (now - record.stallStartMs >= SLOPE_STALL_TIME_MS) {
      record.recovering = true;
      return 'slide';
    }

    return 'none';
  }

  /** True if this NPC is currently in slope-slide recovery. */
  isRecovering(id: string): boolean {
    return !!this.records.get(id)?.recovering;
  }

  /** Drop tracking for a combatant (death, dematerialization, reset). */
  remove(id: string): void {
    this.records.delete(id);
  }

  /** Drop all tracking. Call on round/mode transitions. */
  clear(): void {
    this.records.clear();
  }

  /** @internal Visible to tests so they can introspect the stall window. */
  getRecord(id: string): { recovering: boolean; stallStartMs?: number } | undefined {
    const r = this.records.get(id);
    if (!r) return undefined;
    return { recovering: r.recovering, stallStartMs: r.stallStartMs };
  }
}

