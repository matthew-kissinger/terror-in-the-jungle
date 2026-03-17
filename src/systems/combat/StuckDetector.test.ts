import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { createTestCombatant } from '../../test-utils';
import {
  StuckDetector,
  STUCK_CHECK_INTERVAL_MS,
  STUCK_PINNED_DWELL_MS,
  STUCK_TICK_THRESHOLD,
} from './StuckDetector';

describe('StuckDetector', () => {
  let detector: StuckDetector;

  beforeEach(() => {
    detector = new StuckDetector();
  });

  it('creates a record on first call without triggering recovery', () => {
    const anchor = new THREE.Vector3(20, 0, 20);
    const c = createTestCombatant({
      id: 'npc1',
      position: new THREE.Vector3(10, 0, 20),
      movementAnchor: anchor,
    });
    detector.checkAndRecover(c, 0);

    const record = detector.getRecord('npc1');
    expect(record).toBeDefined();
    expect(record!.lastCheckX).toBe(10);
    expect(record!.lastCheckZ).toBe(20);
    expect(record!.stuckTicks).toBe(0);
    expect(record!.recoveryCount).toBe(0);
    expect(record!.lastAnchorDistanceSq).toBeCloseTo(100);
  });

  it('skips check when within interval', () => {
    const c = createTestCombatant({
      id: 'npc1',
      position: new THREE.Vector3(10, 0, 20),
      movementAnchor: new THREE.Vector3(20, 0, 20),
    });
    detector.checkAndRecover(c, 0);

    detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS - 1);

    const record = detector.getRecord('npc1');
    expect(record!.stuckTicks).toBe(0);
    expect(record!.lastCheckTime).toBe(0);
  });

  it('resets stuckTicks when NPC has moved meaningfully', () => {
    const c = createTestCombatant({
      id: 'npc1',
      position: new THREE.Vector3(0, 0, 0),
      movementAnchor: new THREE.Vector3(10, 0, 0),
    });
    detector.checkAndRecover(c, 0);

    c.position.set(3, 0, 0);
    c.velocity.set(2, 0, 0);
    detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS);

    const record = detector.getRecord('npc1');
    expect(record!.stuckTicks).toBe(0);
    expect(record!.recoveryCount).toBe(0);
  });

  it('increments stuckTicks when NPC wants movement but does not move or progress', () => {
    const c = createTestCombatant({
      id: 'npc1',
      position: new THREE.Vector3(10, 0, 10),
      movementAnchor: new THREE.Vector3(50, 0, 50),
    });
    c.velocity.set(2, 0, 0);
    detector.checkAndRecover(c, 0);

    detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS);
    expect(detector.getRecord('npc1')!.stuckTicks).toBe(1);

    detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS * 2);
    expect(detector.getRecord('npc1')!.stuckTicks).toBe(2);
  });

  it('requests deterministic backtrack after repeated stalls', () => {
    const c = createTestCombatant({
      id: 'npc1',
      position: new THREE.Vector3(10, 0, 10),
      movementAnchor: new THREE.Vector3(50, 0, 50),
      movementLastGoodPosition: new THREE.Vector3(6, 0, 6),
    });
    c.velocity.set(2, 0, 0);

    detector.checkAndRecover(c, 0);

    let action: ReturnType<StuckDetector['checkAndRecover']> = 'none';
    for (let i = 1; i <= STUCK_TICK_THRESHOLD; i++) {
      action = detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS * i);
    }

    expect(action).toBe('backtrack');
    expect(detector.getRecord('npc1')!.stuckTicks).toBe(0);
    expect(detector.getRecord('npc1')!.recoveryCount).toBe(1);
  });

  it('treats local-area dithering as stuck even when the NPC wiggles around', () => {
    const c = createTestCombatant({
      id: 'npc-jitter',
      position: new THREE.Vector3(0, 0, 0),
      movementAnchor: new THREE.Vector3(0, 0, 50),
      movementLastGoodPosition: new THREE.Vector3(-3, 0, 0),
    });
    c.velocity.set(2, 0, 0);

    detector.checkAndRecover(c, 0);

    c.position.set(0.6, 0, 0);
    detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS);
    expect(detector.getRecord('npc-jitter')!.stuckTicks).toBe(0);
    expect(detector.getRecord('npc-jitter')!.localAreaDwellMs).toBe(STUCK_CHECK_INTERVAL_MS);

    c.position.set(-0.6, 0, 0);
    detector.checkAndRecover(c, STUCK_PINNED_DWELL_MS);
    expect(detector.getRecord('npc-jitter')!.stuckTicks).toBe(1);

    c.position.set(0.5, 0, 0);
    const action = detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS * 3);
    expect(action).toBe('backtrack');
  });

  it('does not request backtrack without a last good position', () => {
    const c = createTestCombatant({
      id: 'npc1',
      position: new THREE.Vector3(10, 0, 10),
      movementAnchor: new THREE.Vector3(50, 0, 50),
    });
    c.velocity.set(2, 0, 0);

    detector.checkAndRecover(c, 0);

    let action: ReturnType<StuckDetector['checkAndRecover']> = 'none';
    for (let i = 1; i <= STUCK_TICK_THRESHOLD; i++) {
      action = detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS * i);
    }

    expect(action).toBe('none');
  });

  it('resets recoveryCount when NPC starts moving again', () => {
    const c = createTestCombatant({
      id: 'npc1',
      position: new THREE.Vector3(10, 0, 10),
      movementAnchor: new THREE.Vector3(50, 0, 50),
      movementLastGoodPosition: new THREE.Vector3(6, 0, 6),
    });
    c.velocity.set(2, 0, 0);

    detector.checkAndRecover(c, 0);
    for (let i = 1; i <= STUCK_TICK_THRESHOLD; i++) {
      detector.checkAndRecover(c, STUCK_CHECK_INTERVAL_MS * i);
    }
    expect(detector.getRecord('npc1')!.recoveryCount).toBe(1);

    c.position.set(20, 0, 20);
    c.velocity.set(2, 0, 0);
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
    const c1 = createTestCombatant({
      id: 'npc1',
      position: new THREE.Vector3(0, 0, 0),
      movementAnchor: new THREE.Vector3(20, 0, 0),
    });
    const c2 = createTestCombatant({
      id: 'npc2',
      position: new THREE.Vector3(100, 0, 100),
      movementAnchor: new THREE.Vector3(130, 0, 100),
    });
    c1.velocity.set(2, 0, 0);
    c2.velocity.set(2, 0, 0);

    detector.checkAndRecover(c1, 0);
    detector.checkAndRecover(c2, 0);

    c2.position.set(103, 0, 100);
    detector.checkAndRecover(c1, STUCK_CHECK_INTERVAL_MS);
    detector.checkAndRecover(c2, STUCK_CHECK_INTERVAL_MS);

    expect(detector.getRecord('npc1')!.stuckTicks).toBe(1);
    expect(detector.getRecord('npc2')!.stuckTicks).toBe(0);
  });
});
