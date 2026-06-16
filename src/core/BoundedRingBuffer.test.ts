// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { BoundedRingBuffer } from './BoundedRingBuffer';

describe('BoundedRingBuffer', () => {
  it('rejects invalid capacities', () => {
    expect(() => new BoundedRingBuffer<number>(0)).toThrow();
    expect(() => new BoundedRingBuffer<number>(Number.NaN)).toThrow();
  });

  it('returns snapshots in chronological order before wrapping', () => {
    const ring = new BoundedRingBuffer<number>(4);
    ring.push(1);
    ring.push(2);
    ring.push(3);

    expect(ring.size).toBe(3);
    expect(ring.capacity).toBe(4);
    expect(ring.snapshotLatest()).toEqual([1, 2, 3]);
    expect(ring.snapshotLatest(2)).toEqual([2, 3]);
  });

  it('keeps only the latest values after wrapping', () => {
    const ring = new BoundedRingBuffer<string>(3);
    ring.push('a');
    ring.push('b');
    ring.push('c');
    ring.push('d');
    ring.push('e');

    expect(ring.size).toBe(3);
    expect(ring.snapshotLatest()).toEqual(['c', 'd', 'e']);
    expect(ring.snapshotLatest(1)).toEqual(['e']);
  });

  it('iterates latest values in chronological order without requiring a snapshot', () => {
    const ring = new BoundedRingBuffer<number>(3);
    ring.push(1);
    ring.push(2);
    ring.push(3);
    ring.push(4);

    const values: number[] = [];
    const indexes: number[] = [];
    const count = ring.forEachLatest((value, index) => {
      values.push(value);
      indexes.push(index);
    }, 2);

    expect(count).toBe(2);
    expect(values).toEqual([3, 4]);
    expect(indexes).toEqual([0, 1]);
  });

  it('clears buffered values and accepts fresh writes', () => {
    const ring = new BoundedRingBuffer<number>(2);
    ring.push(1);
    ring.push(2);
    ring.clear();

    expect(ring.size).toBe(0);
    expect(ring.snapshotLatest()).toEqual([]);

    ring.push(3);
    expect(ring.snapshotLatest()).toEqual([3]);
  });
});
