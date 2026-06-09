// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import { DemBufferCache } from './demBufferCache';

describe('DemBufferCache', () => {
  it('returns a stable view for the same buffer without re-allocating', () => {
    const cache = new DemBufferCache();
    const buffer = new Float32Array([1, 2, 3, 4]).buffer;

    const first = cache.getView(buffer);
    const second = cache.getView(buffer);

    expect(first).toBe(second);
    expect(Array.from(first)).toEqual([1, 2, 3, 4]);
  });

  it('releases all retained DEM buffers when cleared on a provider swap', () => {
    const cache = new DemBufferCache();
    const oldDem = new Float32Array([10, 20, 30]).buffer;
    cache.getView(oldDem);
    expect(cache.size).toBe(1);

    // A new height provider arrives -> the worker clears the cache so the old
    // (~21MB) DEM buffer is no longer retained across the mode switch.
    cache.clear();

    expect(cache.size).toBe(0);

    // A fresh provider's buffer caches independently of the evicted one.
    const newDem = new Float32Array([1, 2]).buffer;
    cache.getView(newDem);
    expect(cache.size).toBe(1);
  });
});
