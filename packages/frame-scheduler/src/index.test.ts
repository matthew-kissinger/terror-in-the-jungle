// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { createFrameScheduler } from './index';

type GroupId = 'frame' | 'slow';

describe('createFrameScheduler', () => {
  it('returns per-frame deltas for zero interval groups', () => {
    const scheduler = createFrameScheduler<GroupId>([
      { id: 'frame', intervalSeconds: 0 },
      { id: 'slow', intervalSeconds: 1 },
    ]);

    expect(scheduler.consume('frame', 0.016)).toBe(0.016);
  });

  it('accumulates fixed cadence groups', () => {
    const scheduler = createFrameScheduler<GroupId>([
      { id: 'frame', intervalSeconds: 0 },
      { id: 'slow', intervalSeconds: 0.1 },
    ]);

    expect(scheduler.consume('slow', 0.04)).toBeNull();
    expect(scheduler.getAccumulator('slow')).toBeCloseTo(0.04);
    expect(scheduler.consume('slow', 0.07)).toBeCloseTo(0.11);
    expect(scheduler.getAccumulator('slow')).toBe(0);
  });

  it('resets one group or all groups', () => {
    const scheduler = createFrameScheduler<GroupId>([
      { id: 'frame', intervalSeconds: 0.5 },
      { id: 'slow', intervalSeconds: 1 },
    ]);

    scheduler.consume('frame', 0.2);
    scheduler.consume('slow', 0.4);
    scheduler.reset('frame');
    expect(scheduler.getAccumulator('frame')).toBe(0);
    expect(scheduler.getAccumulator('slow')).toBeCloseTo(0.4);
    scheduler.reset();
    expect(scheduler.getAccumulator('slow')).toBe(0);
  });

  it('clamps large deltas when maxDeltaSeconds is set', () => {
    const scheduler = createFrameScheduler<GroupId>([
      { id: 'frame', intervalSeconds: 0 },
      { id: 'slow', intervalSeconds: 1, maxDeltaSeconds: 0.25 },
    ]);

    expect(scheduler.consume('slow', 2)).toBeNull();
    expect(scheduler.getAccumulator('slow')).toBe(0.25);
  });
});