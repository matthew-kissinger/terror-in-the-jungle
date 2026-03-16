import type { Combatant } from './types';
import { NPC_MAX_SPEED } from '../../config/CombatantConfig';

// ── Tuning constants ──
const STUCK_CHECK_INTERVAL_MS = 1500;
const STUCK_MOVE_THRESHOLD_SQ = 1.0; // 1m — if moved less than this, count as stuck
const STUCK_TICK_THRESHOLD = 3; // 3 consecutive stuck checks (~4.5s) = confirmed stuck
const STUCK_NUDGE_DISTANCE = 8.0; // meters to shift destination on recovery
const STUCK_MAX_RECOVERIES = 3; // after this many nudges, clear destination entirely

interface StuckRecord {
  lastCheckX: number;
  lastCheckZ: number;
  lastCheckTime: number;
  stuckTicks: number;
  recoveryCount: number;
}

/**
 * Tracks NPC positions over time and detects/recovers stuck agents.
 *
 * Fast path (99%+ of calls): Map lookup + timestamp comparison.
 * No per-frame allocations.
 */
export class StuckDetector {
  private records = new Map<string, StuckRecord>();

  /**
   * Check if a combatant is stuck and attempt recovery if so.
   * Call once per frame after final position is settled.
   */
  checkAndRecover(combatant: Combatant, now: number): void {
    const record = this.records.get(combatant.id);

    if (!record) {
      this.records.set(combatant.id, {
        lastCheckX: combatant.position.x,
        lastCheckZ: combatant.position.z,
        lastCheckTime: now,
        stuckTicks: 0,
        recoveryCount: 0,
      });
      return;
    }

    // Interval gate — skip if not enough time has passed
    if (now - record.lastCheckTime < STUCK_CHECK_INTERVAL_MS) return;

    // Measure XZ displacement since last check
    const dx = combatant.position.x - record.lastCheckX;
    const dz = combatant.position.z - record.lastCheckZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < STUCK_MOVE_THRESHOLD_SQ) {
      record.stuckTicks++;
    } else {
      record.stuckTicks = 0;
      record.recoveryCount = 0; // moving again — reset recovery counter
    }

    record.lastCheckX = combatant.position.x;
    record.lastCheckZ = combatant.position.z;
    record.lastCheckTime = now;

    if (record.stuckTicks >= STUCK_TICK_THRESHOLD) {
      this.recoverStuck(combatant, record);
      record.stuckTicks = 0;
    }
  }

  private recoverStuck(combatant: Combatant, record: StuckRecord): void {
    record.recoveryCount++;

    if (record.recoveryCount > STUCK_MAX_RECOVERIES) {
      // Too many failed nudges — clear destination so the state machine re-evaluates
      combatant.destinationPoint = undefined;
      record.recoveryCount = 0;
      return;
    }

    if (combatant.destinationPoint) {
      // Nudge destination in a random direction
      const angle = Math.random() * Math.PI * 2;
      combatant.destinationPoint.x += Math.cos(angle) * STUCK_NUDGE_DISTANCE;
      combatant.destinationPoint.z += Math.sin(angle) * STUCK_NUDGE_DISTANCE;
    } else {
      // No destination — give a random velocity impulse for one frame
      const angle = Math.random() * Math.PI * 2;
      combatant.velocity.x = Math.cos(angle) * NPC_MAX_SPEED;
      combatant.velocity.z = Math.sin(angle) * NPC_MAX_SPEED;
    }
  }

  /** Remove tracking for a combatant (call on death/despawn). */
  remove(id: string): void {
    this.records.delete(id);
  }

  /** Clear all records (call on round reset). */
  clear(): void {
    this.records.clear();
  }

  /** Visible for testing. */
  getRecord(id: string): StuckRecord | undefined {
    return this.records.get(id);
  }
}

// Export constants for testing
export {
  STUCK_CHECK_INTERVAL_MS,
  STUCK_MOVE_THRESHOLD_SQ,
  STUCK_TICK_THRESHOLD,
  STUCK_NUDGE_DISTANCE,
  STUCK_MAX_RECOVERIES,
};
