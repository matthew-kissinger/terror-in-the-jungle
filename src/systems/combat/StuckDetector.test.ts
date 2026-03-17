import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { createTestCombatant } from '../../test-utils';
import {
  StuckDetector,
  STUCK_CHECK_INTERVAL_MS,
  STUCK_TICK_THRESHOLD,
  STUCK_MAX_RECOVERIES,
} from './StuckDetector';


describe('StuckDetector', () => {
  let detector: StuckDetector;

  beforeEach(() => {
    detector = new StuckDetector();
  });

  it('creates a record on first call without triggering recovery', () => {
    const c = createTestCombatant({ id: 'npc1', position: new THREE.Vector3(10, 0, 20) });
    detector.checkAndRecover(c, 0);

    const record = detector.getRecord('npc1');
    expect(record).toBeDefined();
    expect(record!.lastCheckX).toBe(10);
    expect(record!.lastCheckZ).toBe(20);
    expect(record!.stuckTicks).toBe(0);
    expect(record!.recoveryCount).toBe(0);
  });

  it('skips check when within interval', () => {
    const c = createTestCombatant({ id: 'npc1', position: new THREE.Vector3(10, 0, 20) });
    detector.checkAndRecover(c, 0);

    // Move slightly but check too soon — should not update record
    c.position.set(10, 0, 20);
    detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS - 1);

    const record = detector.getRecord('npc1');
    expect(record!.stuckTicks).toBe(0);
    expect(record!.lastCheckTime).toBe(0); // unchanged
  });

  it('resets stuckTicks when NPC has moved', () => {
    const c = createTestCombatant({ id: 'npc1', position: new THREE.Vector3(0, 0, 0) });
    detector.checkAndRecover(c, 0);

    // Move well beyond threshold
    c.position.set(5, 0, 5);
    detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS);

    const record = detector.getRecord('npc1');
    expect(record!.stuckTicks).toBe(0);
  });

  it('increments stuckTicks when NPC has not moved', () => {
    const c = createTestCombatant({ id: 'npc1', position: new THREE.Vector3(10, 0, 10) });
    detector.checkAndRecover(c, 0);

    // Don't move — check at interval
    detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS);
    expect(detector.getRecord('npc1')!.stuckTicks).toBe(1);

    detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS * 2);
    expect(detector.getRecord('npc1')!.stuckTicks).toBe(2);
  });

  it('triggers recovery after STUCK_TICK_THRESHOLD consecutive stuck checks', () => {
    const dest = new THREE.Vector3(50, 0, 50);
    const c = createTestCombatant({
      id: 'npc1',
      position: new THREE.Vector3(10, 0, 10),
      destinationPoint: dest,
    });

    detector.checkAndRecover(c, 0);

    // Simulate stuck for threshold checks
    for (let i = 1; i <= STUCK_TICK_THRESHOLD; i++) {
      detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS * i);
    }

    // Destination should have been nudged
    const moved = dest.x !== 50 || dest.z !== 50;
    expect(moved).toBe(true);
    // stuckTicks reset after recovery
    expect(detector.getRecord('npc1')!.stuckTicks).toBe(0);
    expect(detector.getRecord('npc1')!.recoveryCount).toBe(1);
  });

  it('sets random velocity when stuck with no destination', () => {
    const c = createTestCombatant({
      id: 'npc1',
      position: new THREE.Vector3(10, 0, 10),
      destinationPoint: undefined,
    });
    c.velocity.set(0, 0, 0);

    detector.checkAndRecover(c, 0);
    for (let i = 1; i <= STUCK_TICK_THRESHOLD; i++) {
      detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS * i);
    }

    // Should have a non-zero velocity impulse
    expect(c.velocity.lengthSq()).toBeGreaterThan(0);
  });

  it('clears destination after STUCK_MAX_RECOVERIES nudges', () => {
    const c = createTestCombatant({
      id: 'npc1',
      position: new THREE.Vector3(10, 0, 10),
      destinationPoint: new THREE.Vector3(50, 0, 50),
    });

    detector.checkAndRecover(c, 0);

    let t = 0;
    for (let recovery = 0; recovery <= STUCK_MAX_RECOVERIES; recovery++) {
      // Each recovery takes STUCK_TICK_THRESHOLD checks
      for (let i = 0; i < STUCK_TICK_THRESHOLD; i++) {
        t += STUCK_CHECK_INTERVAL_MS;
        detector.checkAndRecover(c, t);
      }
      // Re-assign destination after each nudge (simulating state machine re-set)
      if (recovery < STUCK_MAX_RECOVERIES) {
        c.destinationPoint = new THREE.Vector3(50, 0, 50);
      }
    }

    // After max recoveries, destination should be cleared
    expect(c.destinationPoint).toBeUndefined();
  });

  it('resets recoveryCount when NPC starts moving', () => {
    const c = createTestCombatant({
      id: 'npc1',
      position: new THREE.Vector3(10, 0, 10),
      destinationPoint: new THREE.Vector3(50, 0, 50),
    });

    detector.checkAndRecover(c, 0);

    // Get stuck once to increment recovery
    for (let i = 1; i <= STUCK_TICK_THRESHOLD; i++) {
      detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS * i);
    }
    expect(detector.getRecord('npc1')!.recoveryCount).toBe(1);

    // Now move significantly
    c.position.set(20, 0, 20);
    detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS * (STUCK_TICK_THRESHOLD + 1));

    expect(detector.getRecord('npc1')!.recoveryCount).toBe(0);
    expect(detector.getRecord('npc1')!.stuckTicks).toBe(0);
  });

  it('remove() deletes the record', () => {
    const c = createTestCombatant({ id: 'npc1' });
    detector.checkAndRecover(c, 0);
    expect(detector.getRecord('npc1')).toBeDefined();

    detector.remove('npc1');
    expect(detector.getRecord('npc1')).toBeUndefined();
  });

  it('clear() removes all records', () => {
    const c1 = createTestCombatant({ id: 'npc1' });
    const c2 = createTestCombatant({ id: 'npc2' });
    detector.checkAndRecover(c1, 0);
    detector.checkAndRecover(c2, 0);

    detector.clear();
    expect(detector.getRecord('npc1')).toBeUndefined();
    expect(detector.getRecord('npc2')).toBeUndefined();
  });

  it('tracks multiple combatants independently', () => {
    const c1 = createTestCombatant({ id: 'npc1', position: new THREE.Vector3(0, 0, 0) });
    const c2 = createTestCombatant({ id: 'npc2', position: new THREE.Vector3(100, 0, 100) });

    detector.checkAndRecover(c1, 0);
    detector.checkAndRecover(c2, 0);

    // c1 stays stuck, c2 moves
    c2.position.set(110, 0, 110);
    detector.checkAndRecover(c1, STUCK_CHECK_INTERVAL_MS);
    detector.checkAndRecover(c2, STUCK_CHECK_INTERVAL_MS);

    expect(detector.getRecord('npc1')!.stuckTicks).toBe(1);
    expect(detector.getRecord('npc2')!.stuckTicks).toBe(0);
  });
});
