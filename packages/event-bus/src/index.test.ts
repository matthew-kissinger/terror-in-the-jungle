// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { createEventBus } from './index';

interface TestEvents extends Record<string, unknown> {
  hit: { id: string };
  score: { value: number };
}

describe('createEventBus', () => {
  it('queues events and flushes them in order', () => {
    const bus = createEventBus<TestEvents>();
    const seen: string[] = [];
    bus.subscribe('hit', (event) => seen.push(event.id));

    bus.emit('hit', { id: 'a' });
    bus.emit('hit', { id: 'b' });

    expect(seen).toEqual([]);
    expect(bus.getPendingCount()).toBe(2);
    bus.flush();
    expect(seen).toEqual(['a', 'b']);
    expect(bus.getPendingCount()).toBe(0);
  });

  it('unsubscribes listeners', () => {
    const bus = createEventBus<TestEvents>();
    let count = 0;
    const unsubscribe = bus.subscribe('score', () => count++);

    bus.emit('score', { value: 1 });
    bus.flush();
    unsubscribe();
    bus.emit('score', { value: 2 });
    bus.flush();

    expect(count).toBe(1);
    expect(bus.getListenerCount('score')).toBe(0);
  });

  it('queues reentrant emits for the next flush', () => {
    const bus = createEventBus<TestEvents>();
    const seen: string[] = [];
    bus.subscribe('hit', (event) => {
      seen.push(event.id);
      if (event.id === 'first') {
        bus.emit('hit', { id: 'second' });
      }
    });

    bus.emit('hit', { id: 'first' });
    bus.flush();
    expect(seen).toEqual(['first']);
    bus.flush();
    expect(seen).toEqual(['first', 'second']);
  });

  it('clears listeners and queued events', () => {
    const bus = createEventBus<TestEvents>();
    bus.subscribe('hit', () => undefined);
    bus.emit('hit', { id: 'x' });

    bus.clear();

    expect(bus.getPendingCount()).toBe(0);
    expect(bus.getListenerCount()).toBe(0);
  });
});