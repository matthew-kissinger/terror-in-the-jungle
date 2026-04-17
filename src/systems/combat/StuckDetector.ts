import type { Combatant } from './types';
import type * as THREE from 'three';

export type StuckRecoveryAction = 'none' | 'backtrack' | 'hold';

// Stuck detection is a guardrail, not a primary navigation system.
// Intervals must be long enough for contour logic to complete before triggering backtrack.
const STUCK_CHECK_INTERVAL_MS = 600;
const STUCK_MOVE_THRESHOLD_SQ = 0.25;
const STUCK_PROGRESS_IMPROVEMENT_SQ = 0.5;
const STUCK_TICK_THRESHOLD = 2;
const STUCK_PINNED_RADIUS_SQ = 2.25;
const STUCK_PINNED_RELEASE_RADIUS_SQ = 6.25;
const STUCK_PINNED_DWELL_MS = 1200;
const MAX_CONSECUTIVE_BACKTRACKS = 4;
const HOLD_COOLDOWN_MS = 15_000;
// Radius (squared) around the last recorded goal that counts as "same goal".
// Goal anchor flips larger than this reset recoveryCount. Small jitters from
// backtrack-point cycling or target-position drift do not.
const GOAL_ANCHOR_CHANGE_SQ = 25;
// Linear distance (meters) the NPC must close on its goal in a single check
// tick to count as meaningful goal progress and reset the escalation counter.
// Must be large enough that a completed backtrack that returns the NPC to
// roughly the same net distance does NOT reset — otherwise the NPC would
// loop indefinitely on unreachable objectives.
const GOAL_PROGRESS_RESET_METERS = 2;

interface StuckRecord {
  lastCheckX: number;
  lastCheckZ: number;
  lastCheckTime: number;
  stuckTicks: number;
  recoveryCount: number;
  lastAnchorDistanceSq: number;
  lastAnchorX?: number;
  lastAnchorZ?: number;
  /** Last recorded goal anchor (destination / cover / target), tracked
   *  independently from the transient movement anchor so that backtrack
   *  cycles do not reset recoveryCount. */
  lastGoalAnchorX?: number;
  lastGoalAnchorZ?: number;
  /** Distance-squared from combatant to goal at the most recent check. */
  lastGoalDistanceSq?: number;
  localAreaOriginX: number;
  localAreaOriginZ: number;
  localAreaDwellMs: number;
  localAreaMaxRadiusSq: number;
  holdStartTime?: number;
}

/**
 * Tracks short-horizon terrain stalls and requests deterministic recovery.
 *
 * This detector no longer mutates destinations or injects random impulses.
 * It watches whether a combatant both moves and makes progress toward its
 * current movement anchor, then asks the caller to trigger a backtrack when
 * that progress stalls for too long.
 */
export class StuckDetector {
  private records = new Map<string, StuckRecord>();

  /**
   * Check whether a combatant is stalled and emit a recovery action.
   *
   * @param combatant - the combatant to evaluate.
   * @param now - current wall-clock-ish time in ms.
   * @param goalAnchor - the combatant's ultimate goal (destination / cover /
   *   target). When provided, this is used to track recovery escalation:
   *   `recoveryCount` only resets on a *goal* change or real progress toward
   *   the goal, not on every flip between the transient movement anchor
   *   (backtrack point) and the goal. When omitted, legacy behavior applies
   *   and movement-anchor changes reset recoveryCount.
   */
  checkAndRecover(
    combatant: Combatant,
    now: number,
    goalAnchor?: THREE.Vector3 | null,
  ): StuckRecoveryAction {
    const anchor = combatant.movementAnchor ?? combatant.destinationPoint;
    const anchorDistanceSq = anchor
      ? combatant.position.distanceToSquared(anchor)
      : Number.POSITIVE_INFINITY;
    const goalDistanceSq = goalAnchor
      ? combatant.position.distanceToSquared(goalAnchor)
      : undefined;
    const record = this.records.get(combatant.id);

    if (!record) {
      this.records.set(combatant.id, {
        lastCheckX: combatant.position.x,
        lastCheckZ: combatant.position.z,
        lastCheckTime: now,
        stuckTicks: 0,
        recoveryCount: 0,
        lastAnchorDistanceSq: anchorDistanceSq,
        lastAnchorX: anchor?.x,
        lastAnchorZ: anchor?.z,
        lastGoalAnchorX: goalAnchor?.x,
        lastGoalAnchorZ: goalAnchor?.z,
        lastGoalDistanceSq: goalDistanceSq,
        localAreaOriginX: combatant.position.x,
        localAreaOriginZ: combatant.position.z,
        localAreaDwellMs: 0,
        localAreaMaxRadiusSq: 0,
      });
      return 'none';
    }

    const deltaMs = now - record.lastCheckTime;
    if (deltaMs < STUCK_CHECK_INTERVAL_MS) {
      return 'none';
    }

    const dx = combatant.position.x - record.lastCheckX;
    const dz = combatant.position.z - record.lastCheckZ;
    const movedSq = dx * dx + dz * dz;

    const anchorChanged = this.hasAnchorChanged(record, anchor);
    // When a goalAnchor is provided, recoveryCount persists across movement-
    // anchor flips (e.g. backtrack-point -> goal -> backtrack-point cycles),
    // so the backtrack cap actually escalates to 'hold' on repeatedly
    // unreachable objectives. recoveryCount only resets when the goal itself
    // changes. Legacy callers (no goalAnchor) keep the prior behavior.
    const goalChanged = goalAnchor
      ? this.hasGoalChanged(record, goalAnchor)
      : anchorChanged;

    if (anchorChanged) {
      record.stuckTicks = 0;
      this.resetLocalArea(record, combatant.position.x, combatant.position.z);
    }
    if (goalChanged) {
      record.recoveryCount = 0;
      record.holdStartTime = undefined;
    }

    // Release hold state after cooldown expires
    if (record.holdStartTime && (now - record.holdStartTime) > HOLD_COOLDOWN_MS) {
      record.recoveryCount = 0;
      record.holdStartTime = undefined;
    }

    const wantsMovement = combatant.velocity.lengthSq() > 0.01;
    const madeAnchorProgress = anchor
      ? anchorDistanceSq + STUCK_PROGRESS_IMPROVEMENT_SQ < record.lastAnchorDistanceSq
      : false;
    // Progress toward the *goal* is the only thing that should reset the
    // backtrack cycle counter (otherwise a completed backtrack that simply
    // returns to the last-good point would reset it and let the NPC try the
    // same unreachable path forever). Compare in linear distance so the
    // threshold is invariant to how far the NPC is from the goal.
    const madeGoalProgress =
      !!goalAnchor &&
      goalDistanceSq !== undefined &&
      record.lastGoalDistanceSq !== undefined &&
      Number.isFinite(record.lastGoalDistanceSq) &&
      Math.sqrt(record.lastGoalDistanceSq) - Math.sqrt(goalDistanceSq) > GOAL_PROGRESS_RESET_METERS;

    const localDx = combatant.position.x - record.localAreaOriginX;
    const localDz = combatant.position.z - record.localAreaOriginZ;
    const localRadiusSq = localDx * localDx + localDz * localDz;
    const escapedLocalArea = localRadiusSq > STUCK_PINNED_RELEASE_RADIUS_SQ;

    if (madeAnchorProgress || escapedLocalArea) {
      this.resetLocalArea(record, combatant.position.x, combatant.position.z);
    } else if (wantsMovement) {
      record.localAreaDwellMs += deltaMs;
      record.localAreaMaxRadiusSq = Math.max(record.localAreaMaxRadiusSq, localRadiusSq);
    }

    const pinnedInArea =
      record.localAreaDwellMs >= STUCK_PINNED_DWELL_MS &&
      localRadiusSq <= STUCK_PINNED_RADIUS_SQ;

    if (!wantsMovement) {
      record.stuckTicks = 0;
      // Holding position voluntarily counts as "making good choices" — reset
      // the escalation counter so the NPC isn't punished for not pushing a
      // stall.
      record.recoveryCount = 0;
      this.resetLocalArea(record, combatant.position.x, combatant.position.z);
    } else if ((movedSq < STUCK_MOVE_THRESHOLD_SQ || pinnedInArea) && !madeAnchorProgress) {
      record.stuckTicks++;
    } else {
      record.stuckTicks = 0;
      // Reset the escalation counter only when we've genuinely advanced
      // toward the goal (or when no goal is being tracked, preserve legacy
      // behavior that resets on any anchor progress / local-area escape).
      if (goalAnchor) {
        if (madeGoalProgress) {
          record.recoveryCount = 0;
        }
      } else if (madeAnchorProgress || escapedLocalArea) {
        record.recoveryCount = 0;
      }
    }

    record.lastCheckX = combatant.position.x;
    record.lastCheckZ = combatant.position.z;
    record.lastCheckTime = now;
    record.lastAnchorDistanceSq = anchorDistanceSq;
    record.lastAnchorX = anchor?.x;
    record.lastAnchorZ = anchor?.z;
    record.lastGoalAnchorX = goalAnchor?.x;
    record.lastGoalAnchorZ = goalAnchor?.z;
    record.lastGoalDistanceSq = goalDistanceSq;

    if (
      record.stuckTicks >= STUCK_TICK_THRESHOLD &&
      combatant.movementLastGoodPosition
    ) {
      record.stuckTicks = 0;
      record.recoveryCount++;
      if (record.recoveryCount > MAX_CONSECUTIVE_BACKTRACKS) {
        record.holdStartTime = now;
        return 'hold';
      }
      return 'backtrack';
    }

    return 'none';
  }

  remove(id: string): void {
    this.records.delete(id);
  }

  clear(): void {
    this.records.clear();
  }

  getRecord(id: string): StuckRecord | undefined {
    return this.records.get(id);
  }

  private hasAnchorChanged(
    record: StuckRecord,
    anchor: Combatant['movementAnchor'] | Combatant['destinationPoint'],
  ): boolean {
    if (!anchor) {
      return Number.isFinite(record.lastAnchorDistanceSq);
    }

    if (!Number.isFinite(record.lastAnchorX) || !Number.isFinite(record.lastAnchorZ)) {
      return true;
    }

    const dx = anchor.x - Number(record.lastAnchorX);
    const dz = anchor.z - Number(record.lastAnchorZ);
    return dx * dx + dz * dz > 4;
  }

  /**
   * Detect meaningful changes in the goal anchor — used to decide whether the
   * recovery-escalation counter should reset. Uses a larger threshold than
   * {@link hasAnchorChanged} so small jitters in target position (moving
   * enemy, cover-slot drift) don't collapse the escalation window.
   */
  private hasGoalChanged(record: StuckRecord, goalAnchor: THREE.Vector3): boolean {
    if (
      !Number.isFinite(record.lastGoalAnchorX) ||
      !Number.isFinite(record.lastGoalAnchorZ)
    ) {
      return true;
    }
    const dx = goalAnchor.x - Number(record.lastGoalAnchorX);
    const dz = goalAnchor.z - Number(record.lastGoalAnchorZ);
    return dx * dx + dz * dz > GOAL_ANCHOR_CHANGE_SQ;
  }

  private resetLocalArea(record: StuckRecord, x: number, z: number): void {
    record.localAreaOriginX = x;
    record.localAreaOriginZ = z;
    record.localAreaDwellMs = 0;
    record.localAreaMaxRadiusSq = 0;
  }
}

export {
  STUCK_CHECK_INTERVAL_MS,
  STUCK_PINNED_DWELL_MS,
  STUCK_TICK_THRESHOLD,
  MAX_CONSECUTIVE_BACKTRACKS,
  HOLD_COOLDOWN_MS,
};
