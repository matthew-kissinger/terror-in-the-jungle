// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TerrainWorkerPool } from './TerrainWorkerPool';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * A controllable fake Worker. It records posted messages and lets the test
 * drive onmessage / onerror by hand, so we can exercise the pool's lifecycle
 * (resolve, reject-on-error, reject-on-dispose, timeout) deterministically.
 */
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  posted: Array<{ data: any; transfer: Transferable[] }> = [];
  terminated = false;

  postMessage(data: any, transfer: Transferable[] = []): void {
    this.posted.push({ data, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  emitMessage(data: any): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitError(message: string): void {
    this.onerror?.({ message });
  }
}

/**
 * Test subclass that swaps the real Worker construction for FakeWorkers we
 * can drive. The pool's behaviour is exercised through its public bake API.
 */
class TestableWorkerPool extends TerrainWorkerPool {
  // createWorker() runs from the base constructor, before any subclass field
  // initialization. With useDefineForClassFields, even an initializer-less field
  // emits `this.x = undefined` post-super, clobbering the populated list. Using
  // `declare` emits no runtime field, so the value set during super() survives.
  declare fakeWorkers: FakeWorker[];

  protected createWorker(): Worker | null {
    if (!this.fakeWorkers) this.fakeWorkers = [];
    const worker = new FakeWorker();
    this.fakeWorkers.push(worker);
    return worker as unknown as Worker;
  }
}

function makeResultMessage(requestId: number) {
  return {
    type: 'heightmapResult',
    requestId,
    data: new Float32Array(4),
    normalData: new Uint8Array(16),
    gridSize: 2,
    worldSize: 64,
  };
}

describe('TerrainWorkerPool lifecycle safety', () => {
  let pool: TestableWorkerPool;

  beforeEach(() => {
    vi.useFakeTimers();
    pool = new TestableWorkerPool(2);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('resolves a bake when the worker reports a result', async () => {
    const bake = pool.bakeHeightmap(2, 64);
    const worker = pool.fakeWorkers[0];
    const requestId = worker.posted[0].data.requestId;
    worker.emitMessage(makeResultMessage(requestId));
    const heights = await bake;
    expect(heights).toBeInstanceOf(Float32Array);
  });

  it('rejects all in-flight bakes when dispose() races a pending task', async () => {
    const bake = pool.bakeHeightmap(2, 64);
    // Do NOT emit a result — simulate a mode-switch/dispose mid-bake.
    pool.dispose();
    await expect(bake).rejects.toThrow();
  });

  it('rejects the pending bake when the worker raises an error', async () => {
    const bake = pool.bakeHeightmap(2, 64);
    const worker = pool.fakeWorkers[0];
    worker.emitError('worker exploded');
    await expect(bake).rejects.toThrow(/worker exploded|worker/i);
  });

  it('rejects a bake that never completes once the timeout elapses', async () => {
    const bake = pool.bakeHeightmap(2, 64);
    const rejection = expect(bake).rejects.toThrow(/timed out|timeout/i);
    vi.advanceTimersByTime(60_000);
    await rejection;
  });

  it('recovers the worker slot after a timeout so later bakes can dispatch', async () => {
    const first = pool.bakeHeightmap(2, 64);
    const firstReject = expect(first).rejects.toThrow();
    vi.advanceTimersByTime(60_000);
    await firstReject;

    // After recovery a fresh bake must still get dispatched and resolve.
    const second = pool.bakeHeightmap(2, 64);
    const worker = pool.fakeWorkers[0];
    const lastPosted = worker.posted[worker.posted.length - 1];
    worker.emitMessage(makeResultMessage(lastPosted.data.requestId));
    await expect(second).resolves.toBeInstanceOf(Float32Array);
  });

  it('queues work instead of mis-dispatching when every worker is busy', async () => {
    // Saturate both workers.
    const a = pool.bakeHeightmap(2, 64);
    const b = pool.bakeHeightmap(2, 64);
    // Third task arrives with no free worker; it must wait, not stomp a busy slot.
    const c = pool.bakeHeightmap(2, 64);

    const postedBefore = pool.fakeWorkers.reduce((n, w) => n + w.posted.length, 0);
    expect(postedBefore).toBe(2); // only the two initial tasks dispatched

    // Free worker 0 by resolving its task; the queued task should now dispatch.
    const worker0 = pool.fakeWorkers[0];
    worker0.emitMessage(makeResultMessage(worker0.posted[0].data.requestId));
    await a;

    const postedAfter = pool.fakeWorkers.reduce((n, w) => n + w.posted.length, 0);
    expect(postedAfter).toBe(3); // queued task dispatched onto the freed worker

    // Drain remaining tasks so no promise is left hanging.
    const worker1 = pool.fakeWorkers[1];
    worker1.emitMessage(makeResultMessage(worker1.posted[0].data.requestId));
    await b;
    worker0.emitMessage(makeResultMessage(worker0.posted[worker0.posted.length - 1].data.requestId));
    await c;
  });
});
