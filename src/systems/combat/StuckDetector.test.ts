import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { createTestCombatant } from '../../test-utils';
import {
  StuckDetector,
  STUCK_CHECK_INTERVAL_MS,
  STUCK_PINNED_DWELL_MS,
  STUCK_TICK_THRESHOLD,
  MAX_CONSECUTIVE_BACKTRACKS,
  HOLD_COOLDOWN_MS,
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

  it('returns hold after exceeding MAX_CONSECUTIVE_BACKTRACKS', () => {
    const c = createTestCombatant({
      id: 'npc-hold',
      position: new THREE.Vector3(10, 0, 10),
      movementAnchor: new THREE.Vector3(50, 0, 50),
      movementLastGoodPosition: new THREE.Vector3(6, 0, 6),
    });
    c.velocity.set(2, 0, 0);
    detector.checkAndRecover(c, 0);

    let t = 0;
    let action: ReturnType<StuckDetector['checkAndRecover']> = 'none';

    // Trigger MAX_CONSECUTIVE_BACKTRACKS backtracks
    for (let cycle = 0; cycle < MAX_CONSECUTIVE_BACKTRACKS; cycle++) {
      for (let tick = 0; tick < STUCK_TICK_THRESHOLD; tick++) {
        t += STUCK_CHECK_INTERVAL_MS;
        action = detector.checkAndRecover(c, t);
      }
      expect(action).toBe('backtrack');
    }

    // Next stall cycle should trigger 'hold'
    for (let tick = 0; tick < STUCK_TICK_THRESHOLD; tick++) {
      t += STUCK_CHECK_INTERVAL_MS;
      action = detector.checkAndRecover(c, t);
    }
    expect(action).toBe('hold');
    expect(detector.getRecord('npc-hold')!.holdStartTime).toBe(t);
  });

  it('resets hold state when anchor changes', () => {
    const c = createTestCombatant({
      id: 'npc-hold-reset',
      position: new THREE.Vector3(10, 0, 10),
      movementAnchor: new THREE.Vector3(50, 0, 50),
      movementLastGoodPosition: new THREE.Vector3(6, 0, 6),
    });
    c.velocity.set(2, 0, 0);
    detector.checkAndRecover(c, 0);

    let t = 0;
    // Drive to hold state
    for (let cycle = 0; cycle <= MAX_CONSECUTIVE_BACKTRACKS; cycle++) {
      for (let tick = 0; tick < STUCK_TICK_THRESHOLD; tick++) {
        t += STUCK_CHECK_INTERVAL_MS;
        detector.checkAndRecover(c, t);
      }
    }
    expect(detector.getRecord('npc-hold-reset')!.holdStartTime).toBeDefined();

    // Change anchor significantly (>2m)
    c.movementAnchor = new THREE.Vector3(100, 0, 100);
    t += STUCK_CHECK_INTERVAL_MS;
    detector.checkAndRecover(c, t);

    expect(detector.getRecord('npc-hold-reset')!.recoveryCount).toBe(0);
    expect(detector.getRecord('npc-hold-reset')!.holdStartTime).toBeUndefined();
  });

  it('resets hold state after HOLD_COOLDOWN_MS expires', () => {
    const c = createTestCombatant({
      id: 'npc-hold-timeout',
      position: new THREE.Vector3(10, 0, 10),
      movementAnchor: new THREE.Vector3(50, 0, 50),
      movementLastGoodPosition: new THREE.Vector3(6, 0, 6),
    });
    c.velocity.set(2, 0, 0);
    detector.checkAndRecover(c, 0);

    let t = 0;
    // Drive to hold state
    for (let cycle = 0; cycle <= MAX_CONSECUTIVE_BACKTRACKS; cycle++) {
      for (let tick = 0; tick < STUCK_TICK_THRESHOLD; tick++) {
        t += STUCK_CHECK_INTERVAL_MS;
        detector.checkAndRecover(c, t);
      }
    }
    expect(detector.getRecord('npc-hold-timeout')!.holdStartTime).toBeDefined();

    // Advance past cooldown
    t += HOLD_COOLDOWN_MS + 1;
    detector.checkAndRecover(c, t);

    expect(detector.getRecord('npc-hold-timeout')!.recoveryCount).toBe(0);
    expect(detector.getRecord('npc-hold-timeout')!.holdStartTime).toBeUndefined();
  });

  describe('goal-anchor-aware escalation', () => {
    /**
     * Simulate the real in-game backtrack cycle: NPC stalls, backtrack flips
     * the movement anchor to a nearby recovery point; NPC reaches it; movement
     * anchor flips back to the original goal; NPC re-stalls on the same slope.
     *
     * Without goal-aware tracking, the old detector reset recoveryCount every
     * time the movement anchor flipped back to the goal, so MAX_CONSECUTIVE_
     * BACKTRACKS never fired. With the goal anchor threaded through, the
     * detector should hit 'hold' after the cap.
     */
    it('escalates to hold across repeated backtrack<->goal flips on an unreachable goal', () => {
      const goal = new THREE.Vector3(50, 0, 50);
      const backtrackPoint = new THREE.Vector3(12, 0, 12);
      const c = createTestCombatant({
        id: 'npc-flipping',
        position: new THREE.Vector3(10, 0, 10),
        movementAnchor: goal.clone(),
        movementLastGoodPosition: new THREE.Vector3(8, 0, 8),
      });
      c.velocity.set(2, 0, 0);

      detector.checkAndRecover(c, 0, goal);

      let t = 0;
      let lastAction: ReturnType<StuckDetector['checkAndRecover']> = 'none';

      // Simulate many stall cycles. Each cycle: two stuck ticks against the
      // goal, then the movement anchor flips to the backtrack point as the
      // movement solver activates backtrack. The NPC makes no real progress
      // toward the goal overall.
      for (let cycle = 0; cycle < MAX_CONSECUTIVE_BACKTRACKS + 2; cycle++) {
        // Stall toward goal.
        c.movementAnchor = goal.clone();
        for (let tick = 0; tick < STUCK_TICK_THRESHOLD; tick++) {
          t += STUCK_CHECK_INTERVAL_MS;
          lastAction = detector.checkAndRecover(c, t, goal);
          if (lastAction === 'hold') break;
        }
        if (lastAction === 'hold') break;

        // Movement anchor flips to the backtrack point (simulates
        // activateBacktrack). The goal is unchanged.
        c.movementAnchor = backtrackPoint.clone();
        t += STUCK_CHECK_INTERVAL_MS;
        detector.checkAndRecover(c, t, goal);
      }

      expect(lastAction).toBe('hold');
    });

    /**
     * Real progress toward the goal — not just anchor flipping — should
     * reset the escalation counter.
     */
    it('resets recoveryCount when the NPC makes real progress toward the goal', () => {
      const goal = new THREE.Vector3(0, 0, 100);
      const c = createTestCombatant({
        id: 'npc-progressing',
        position: new THREE.Vector3(0, 0, 10),
        movementAnchor: goal.clone(),
        movementLastGoodPosition: new THREE.Vector3(0, 0, 8),
      });
      c.velocity.set(0, 0, 2);

      detector.checkAndRecover(c, 0, goal);

      // Drive two stuck ticks -> one backtrack trigger.
      let t = 0;
      for (let tick = 0; tick < STUCK_TICK_THRESHOLD; tick++) {
        t += STUCK_CHECK_INTERVAL_MS;
        detector.checkAndRecover(c, t, goal);
      }
      expect(detector.getRecord('npc-progressing')!.recoveryCount).toBe(1);

      // NPC now makes meaningful progress toward goal (moves ~20m closer).
      c.position.set(0, 0, 30);
      c.velocity.set(0, 0, 2);
      t += STUCK_CHECK_INTERVAL_MS;
      detector.checkAndRecover(c, t, goal);

      expect(detector.getRecord('npc-progressing')!.recoveryCount).toBe(0);
    });

    /**
     * If the AI assigns a completely new goal, the escalation counter must
     * reset. This mirrors the case where a squad leader re-routes the NPC
     * after a defend/engage transition.
     */
    it('resets recoveryCount when the goal anchor changes meaningfully', () => {
      const goalA = new THREE.Vector3(50, 0, 50);
      const goalB = new THREE.Vector3(-50, 0, -50);
      const c = createTestCombatant({
        id: 'npc-goal-change',
        position: new THREE.Vector3(10, 0, 10),
        movementAnchor: goalA.clone(),
        movementLastGoodPosition: new THREE.Vector3(8, 0, 8),
      });
      c.velocity.set(2, 0, 0);

      detector.checkAndRecover(c, 0, goalA);

      let t = 0;
      for (let tick = 0; tick < STUCK_TICK_THRESHOLD; tick++) {
        t += STUCK_CHECK_INTERVAL_MS;
        detector.checkAndRecover(c, t, goalA);
      }
      expect(detector.getRecord('npc-goal-change')!.recoveryCount).toBe(1);

      // New goal assigned by AI.
      t += STUCK_CHECK_INTERVAL_MS;
      detector.checkAndRecover(c, t, goalB);

      expect(detector.getRecord('npc-goal-change')!.recoveryCount).toBe(0);
    });
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
