// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Small bounded chronological ring for debug/profiling event streams.
 *
 * Push is O(1) and never front-prunes with Array.shift(). Snapshots return
 * ordinary arrays in oldest-to-newest order so existing artifact writers can
 * consume them without knowing about the internal cursor.
 */
export class BoundedRingBuffer<T> {
  private readonly values: Array<T | undefined>;
  private writeIndex = 0;
  private count = 0;

  constructor(private readonly maxSize: number) {
    if (!(maxSize > 0) || !Number.isFinite(maxSize)) {
      throw new Error(`BoundedRingBuffer maxSize must be a positive finite number, got ${maxSize}`);
    }
    this.values = new Array<T | undefined>(Math.floor(maxSize));
  }

  get size(): number {
    return this.count;
  }

  get capacity(): number {
    return this.values.length;
  }

  push(value: T): void {
    this.values[this.writeIndex] = value;
    this.writeIndex = (this.writeIndex + 1) % this.values.length;
    if (this.count < this.values.length) this.count++;
  }

  snapshotLatest(limit: number = this.count): T[] {
    if (!(limit > 0) || !Number.isFinite(limit) || this.count === 0) return [];
    const outputCount = Math.min(this.count, Math.floor(limit));
    const output = new Array<T>(outputCount);
    const start = (this.writeIndex - outputCount + this.values.length) % this.values.length;
    for (let index = 0; index < outputCount; index++) {
      output[index] = this.values[(start + index) % this.values.length] as T;
    }
    return output;
  }

  forEachLatest(callback: (value: T, index: number) => void, limit: number = this.count): number {
    if (!(limit > 0) || !Number.isFinite(limit) || this.count === 0) return 0;
    const outputCount = Math.min(this.count, Math.floor(limit));
    const start = (this.writeIndex - outputCount + this.values.length) % this.values.length;
    for (let index = 0; index < outputCount; index++) {
      callback(this.values[(start + index) % this.values.length] as T, index);
    }
    return outputCount;
  }

  clear(): void {
    this.writeIndex = 0;
    this.count = 0;
  }
}
