// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Per-worker cache of Float32Array views over DEM ArrayBuffers.
 *
 * A DEM buffer for the A Shau map is ~21MB. Without eviction, swapping the
 * active height provider (e.g. on an Open Frontier -> Zone Control mode switch)
 * leaves the old DEM view retained in this cache for the lifetime of the
 * worker, leaking ~21MB per worker per mode switch. The terrain worker clears
 * this cache whenever it receives a new height provider so stale DEM buffers
 * are released.
 */
export class DemBufferCache {
  private cache = new Map<ArrayBuffer, Float32Array>();

  /**
   * Return a Float32Array view over the given DEM buffer, creating and caching
   * one on first access.
   */
  getView(buffer: ArrayBuffer): Float32Array {
    let view = this.cache.get(buffer);
    if (!view) {
      view = new Float32Array(buffer);
      this.cache.set(buffer, view);
    }
    return view;
  }

  /** Drop all cached DEM views, releasing their buffers for collection. */
  clear(): void {
    this.cache.clear();
  }

  /** Number of distinct DEM buffers currently retained. */
  get size(): number {
    return this.cache.size;
  }
}
