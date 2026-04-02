import type { Combatant } from './types';

export type StuckRecoveryAction = 'none' | 'backtrack';

// Stuck detection is a guardrail, not a primary navigation system.
// Intervals must be long enough for contour logic to complete before triggering backtrack.
const STUCK_CHECK_INTERVAL_MS = 600;
const STUCK_MOVE_THRESHOLD_SQ = 0.25;
const STUCK_PROGRESS_IMPROVEMENT_SQ = 0.5;
const STUCK_TICK_THRESHOLD = 2;
const STUCK_PINNED_RADIUS_SQ = 2.25;
const STUCK_PINNED_RELEASE_RADIUS_SQ = 6.25;
const STUCK_PINNED_DWELL_MS = 1200;

interface StuckRecord {
  lastCheckX: number;
  lastCheckZ: number;
  lastCheckTime: number;
  stuckTicks: number;
  recoveryCount: number;
  lastAnchorDistanceSq: number;
  lastAnchorX?: number;
  lastAnchorZ?: number;
  localAreaOriginX: number;
  localAreaOriginZ: number;
  localAreaDwellMs: number;
  localAreaMaxRadiusSq: number;
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

  checkAndRecover(combatant: Combatant, now: number): StuckRecoveryAction {
    const anchor = combatant.movementAnchor ?? combatant.destinationPoint;
    const anchorDistanceSq = anchor
      ? combatant.position.distanceToSquared(anchor)
      : Number.POSITIVE_INFINITY;
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
    if (anchorChanged) {
      record.stuckTicks = 0;
      record.recoveryCount = 0;
      this.resetLocalArea(record, combatant.position.x, combatant.position.z);
    }

    const wantsMovement = combatant.velocity.lengthSq() > 0.01;
    const madeAnchorProgress = anchor
      ? anchorDistanceSq + STUCK_PROGRESS_IMPROVEMENT_SQ < record.lastAnchorDistanceSq
      : false;
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
      record.recoveryCount = 0;
      this.resetLocalArea(record, combatant.position.x, combatant.position.z);
    } else if ((movedSq < STUCK_MOVE_THRESHOLD_SQ || pinnedInArea) && !madeAnchorProgress) {
      record.stuckTicks++;
    } else {
      record.stuckTicks = 0;
      if (madeAnchorProgress || escapedLocalArea) {
        record.recoveryCount = 0;
      }
    }

    record.lastCheckX = combatant.position.x;
    record.lastCheckZ = combatant.position.z;
    record.lastCheckTime = now;
    record.lastAnchorDistanceSq = anchorDistanceSq;
    record.lastAnchorX = anchor?.x;
    record.lastAnchorZ = anchor?.z;

    if (
      record.stuckTicks >= STUCK_TICK_THRESHOLD &&
      combatant.movementLastGoodPosition
    ) {
      record.stuckTicks = 0;
      record.recoveryCount++;
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
};
