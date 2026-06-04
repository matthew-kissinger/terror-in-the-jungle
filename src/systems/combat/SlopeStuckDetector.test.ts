// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import {
  SlopeStuckDetector,
  SLOPE_STALL_TIME_MS,
  STUCK_SPEED_EPSILON,
} from './SlopeStuckDetector';
import { createTestCombatant } from '../../test-utils';

describe('SlopeStuckDetector', () => {
  it('does not flag a stationary NPC with no movement intent as slope-stuck', () => {
    const detector = new SlopeStuckDetector();
    const c = createTestCombatant({ id: 'npc-hold' });
    // wantsMovement=false short-circuits the detector regardless of slope.
    const t0 = 0;
    expect(detector.checkAndUpdate(c, t0, true, false, 0)).toBe('none');
    expect(detector.checkAndUpdate(c, t0 + SLOPE_STALL_TIME_MS * 2, true, false, 0)).toBe('none');
    expect(detector.isRecovering('npc-hold')).toBe(false);
  });

  it('does not flag a moving NPC on walkable terrain', () => {
    const detector = new SlopeStuckDetector();
    const c = createTestCombatant({ id: 'npc-walk' });
    const t0 = 100;
    // onUnwalkableSlope=false → detector stays idle even at low speed.
    expect(detector.checkAndUpdate(c, t0, false, true, 0)).toBe('none');
    expect(detector.checkAndUpdate(c, t0 + SLOPE_STALL_TIME_MS * 2, false, true, 0)).toBe('none');
    expect(detector.isRecovering('npc-walk')).toBe(false);
  });

  it('triggers slide after the configured stall window on an unwalkable slope', () => {
    const detector = new SlopeStuckDetector();
    const c = createTestCombatant({ id: 'npc-stall' });
    const t0 = 1_000;
    // First tick: seed the stall timer.
    expect(detector.checkAndUpdate(c, t0, true, true, STUCK_SPEED_EPSILON * 0.1)).toBe('none');
    // Mid-stall: still under the window, still 'none'.
    expect(
      detector.checkAndUpdate(c, t0 + SLOPE_STALL_TIME_MS - 100, true, true, STUCK_SPEED_EPSILON * 0.1),
    ).toBe('none');
    // Past the window: detector escalates to 'slide'.
    expect(
      detector.checkAndUpdate(c, t0 + SLOPE_STALL_TIME_MS + 10, true, true, STUCK_SPEED_EPSILON * 0.1),
    ).toBe('slide');
    expect(detector.isRecovering('npc-stall')).toBe(true);
  });

  it('keeps sliding across subsequent ticks while the NPC remains on unwalkable slope', () => {
    const detector = new SlopeStuckDetector();
    const c = createTestCombatant({ id: 'npc-keep-sliding' });
    const t0 = 500;
    detector.checkAndUpdate(c, t0, true, true, 0);
    detector.checkAndUpdate(c, t0 + SLOPE_STALL_TIME_MS + 1, true, true, 0);
    // Now in recovery — sliding stays active even if `wantsMovement` flips
    // (the AI is still issuing forward intent next tick).
    expect(detector.checkAndUpdate(c, t0 + SLOPE_STALL_TIME_MS + 500, true, true, 0)).toBe('slide');
    expect(detector.checkAndUpdate(c, t0 + SLOPE_STALL_TIME_MS + 1000, true, true, 0)).toBe('slide');
  });

  it('exits recovery when the NPC reaches walkable slope and signals re-acquisition once', () => {
    const detector = new SlopeStuckDetector();
    const c = createTestCombatant({ id: 'npc-recover' });
    const t0 = 10_000;
    detector.checkAndUpdate(c, t0, true, true, 0);
    expect(detector.checkAndUpdate(c, t0 + SLOPE_STALL_TIME_MS + 1, true, true, 0)).toBe('slide');
    // Walkable terrain reached → recovered signal, fired once, then back to idle.
    expect(detector.checkAndUpdate(c, t0 + SLOPE_STALL_TIME_MS + 100, false, true, 5)).toBe('recovered');
    expect(detector.isRecovering('npc-recover')).toBe(false);
    expect(detector.checkAndUpdate(c, t0 + SLOPE_STALL_TIME_MS + 200, false, true, 5)).toBe('none');
  });

  it('resets stall accumulation when the NPC briefly clears the unwalkable patch', () => {
    const detector = new SlopeStuckDetector();
    const c = createTestCombatant({ id: 'npc-blip' });
    const t0 = 0;
    detector.checkAndUpdate(c, t0, true, true, 0); // start accumulating
    // Brief walkable spell — stall window resets.
    expect(detector.checkAndUpdate(c, t0 + 500, false, true, 5)).toBe('none');
    // Back on unwalkable; we should NOT immediately re-fire from the old timer.
    detector.checkAndUpdate(c, t0 + 600, true, true, 0);
    expect(detector.checkAndUpdate(c, t0 + 600 + SLOPE_STALL_TIME_MS - 200, true, true, 0)).toBe('none');
    // Full window from the new seed → slide.
    expect(detector.checkAndUpdate(c, t0 + 600 + SLOPE_STALL_TIME_MS + 50, true, true, 0)).toBe('slide');
  });

  it('does not escalate when realized speed is above the epsilon (NPC is actually moving)', () => {
    const detector = new SlopeStuckDetector();
    const c = createTestCombatant({ id: 'npc-contour' });
    const t0 = 0;
    // Speed > epsilon means the solver IS getting the NPC across the slope
    // (e.g. contour direction succeeded). No recovery needed.
    detector.checkAndUpdate(c, t0, true, true, STUCK_SPEED_EPSILON + 1);
    expect(detector.checkAndUpdate(c, t0 + SLOPE_STALL_TIME_MS * 2, true, true, STUCK_SPEED_EPSILON + 1))
      .toBe('none');
    expect(detector.isRecovering('npc-contour')).toBe(false);
  });

  it('clear() drops all tracking', () => {
    const detector = new SlopeStuckDetector();
    const c = createTestCombatant({ id: 'npc-clear' });
    detector.checkAndUpdate(c, 0, true, true, 0);
    detector.checkAndUpdate(c, SLOPE_STALL_TIME_MS + 1, true, true, 0); // -> slide
    expect(detector.isRecovering('npc-clear')).toBe(true);
    detector.clear();
    expect(detector.isRecovering('npc-clear')).toBe(false);
  });

  it('remove() drops per-id tracking', () => {
    const detector = new SlopeStuckDetector();
    const c = createTestCombatant({ id: 'npc-remove' });
    detector.checkAndUpdate(c, 0, true, true, 0);
    detector.checkAndUpdate(c, SLOPE_STALL_TIME_MS + 1, true, true, 0);
    expect(detector.isRecovering('npc-remove')).toBe(true);
    detector.remove('npc-remove');
    expect(detector.isRecovering('npc-remove')).toBe(false);
  });
});
