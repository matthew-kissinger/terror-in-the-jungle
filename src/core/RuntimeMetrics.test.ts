// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import { RuntimeMetrics } from './RuntimeMetrics';

describe('RuntimeMetrics frame events', () => {
  it('records hitch frame events in chronological snapshot order', () => {
    const metrics = new RuntimeMetrics();

    metrics.updateFrame(0.016);
    metrics.updateFrame(0.04);
    metrics.updateFrame(0.1);
    metrics.updateFrame(0.12);

    const snapshot = metrics.getSnapshot();
    const last = snapshot.frameEvents[snapshot.frameEvents.length - 1];

    expect(snapshot.maxFrameMs).toBeCloseTo(120);
    expect(snapshot.hitch33Count).toBe(3);
    expect(snapshot.hitch50Count).toBe(2);
    expect(snapshot.hitch100Count).toBe(1);
    expect(snapshot.frameEvents.map(event => event.frameCount)).toEqual([2, 3, 4]);
    expect(last?.frameMs).toBeCloseTo(120);
    expect(last?.newMax).toBe(true);
    expect(last?.hitch100).toBe(true);
  });

  it('clears frame events on reset', () => {
    const metrics = new RuntimeMetrics();

    metrics.updateFrame(0.08);
    expect(metrics.getFrameCount()).toBe(1);
    expect(metrics.getSnapshot().frameEvents).toHaveLength(1);

    metrics.reset();

    const snapshot = metrics.getSnapshot();
    expect(snapshot.frameCount).toBe(0);
    expect(metrics.getFrameCount()).toBe(0);
    expect(snapshot.frameEvents).toEqual([]);
  });

  it('bounds the frame event ring', () => {
    const metrics = new RuntimeMetrics();

    for (let i = 0; i < 80; i++) {
      metrics.updateFrame(0.04 + i / 100000);
    }

    const events = metrics.getSnapshot().frameEvents;
    expect(events).toHaveLength(64);
    expect(events[0]?.frameCount).toBe(17);
    expect(events[events.length - 1]?.frameCount).toBe(80);
  });

  it('computes percentile snapshots without sorting the full active sample window', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const sortSpy = vi.spyOn(Float64Array.prototype, 'sort');
    try {
      const metrics = new RuntimeMetrics();

      for (let i = 1; i <= 300; i++) {
        metrics.updateFrame(i / 1000);
      }

      const snapshot = metrics.getSnapshot();
      expect(snapshot.p95FrameMs).toBe(285);
      expect(snapshot.p99FrameMs).toBe(297);
      expect(sortSpy).not.toHaveBeenCalled();
    } finally {
      sortSpy.mockRestore();
      nowSpy.mockRestore();
    }
  });
});
