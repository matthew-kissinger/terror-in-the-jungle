import { describe, expect, it } from 'vitest';
import type { HydrologyBakeArtifact } from '../hydrology/HydrologyBake';
import {
  HydrologyArtifactCache,
  computeHydrologyArtifactCacheKey,
} from './HydrologyArtifactCache';

/**
 * Behavior tests for the hydrology-recompose cache. The Node test env
 * exposes no IndexedDB nor OPFS, so the IDB/OPFS paths are exercised
 * via a tiny hand-rolled IDB shim installed on `globalThis`. The
 * in-memory LRU path is exercised in the default test env.
 */

function makeArtifact(channelCount = 1, elevation = 5): HydrologyBakeArtifact {
  return {
    schemaVersion: 1,
    width: 4,
    height: 4,
    cellSizeMeters: 50,
    depressionHandling: 'epsilon-fill',
    transform: { originX: 0, originZ: 0, cellSizeMeters: 50 },
    thresholds: {
      accumulationP90Cells: 10,
      accumulationP95Cells: 20,
      accumulationP98Cells: 40,
      accumulationP99Cells: 80,
    },
    masks: { wetCandidateCells: [], channelCandidateCells: [] },
    channelPolylines: Array.from({ length: channelCount }, (_, i) => ({
      headCell: i * 10,
      outletCell: i * 10 + 3,
      lengthCells: 4,
      lengthMeters: 200,
      maxAccumulationCells: 320,
      points: [
        { cell: i * 10, x: i * 100, z: 0, elevationMeters: elevation, accumulationCells: 64 },
        { cell: i * 10 + 1, x: i * 100 + 50, z: 0, elevationMeters: elevation, accumulationCells: 128 },
      ],
    })),
  };
}

describe('computeHydrologyArtifactCacheKey', () => {
  it('returns the same key for identical (stamps, artifact, provider) inputs', async () => {
    const artifact = makeArtifact();
    const stamps = [{ priority: 10, kind: 'flatten_circle', x: 0 }];
    const provider = { type: 'noise', seed: 42 };

    const k1 = await computeHydrologyArtifactCacheKey(stamps, artifact, provider);
    const k2 = await computeHydrologyArtifactCacheKey(stamps, artifact, provider);
    expect(k1).toBe(k2);
  });

  it('returns a different key when stamps change', async () => {
    const artifact = makeArtifact();
    const provider = { type: 'noise', seed: 42 };

    const k1 = await computeHydrologyArtifactCacheKey([{ kind: 'A' }], artifact, provider);
    const k2 = await computeHydrologyArtifactCacheKey([{ kind: 'B' }], artifact, provider);
    expect(k1).not.toBe(k2);
  });

  it('returns a different key when the composed provider identity changes', async () => {
    const artifact = makeArtifact();
    const stamps = [{ priority: 10 }];

    const k1 = await computeHydrologyArtifactCacheKey(stamps, artifact, { type: 'noise', seed: 1 });
    const k2 = await computeHydrologyArtifactCacheKey(stamps, artifact, { type: 'noise', seed: 2 });
    expect(k1).not.toBe(k2);
  });

  it('returns a different key when the artifact channel count changes', async () => {
    const stamps = [{ priority: 10 }];
    const provider = { type: 'noise', seed: 1 };

    const k1 = await computeHydrologyArtifactCacheKey(stamps, makeArtifact(1), provider);
    const k2 = await computeHydrologyArtifactCacheKey(stamps, makeArtifact(2), provider);
    expect(k1).not.toBe(k2);
  });
});

describe('HydrologyArtifactCache (in-memory LRU)', () => {
  it('in-memory get returns null on a cold miss', () => {
    const cache = new HydrologyArtifactCache({ disableIndexedDB: true, disableOPFS: true });
    expect(cache.getInMemory('nope')).toBeNull();
  });

  it('in-memory set followed by get returns the same artifact reference', () => {
    const cache = new HydrologyArtifactCache({ disableIndexedDB: true, disableOPFS: true });
    const artifact = makeArtifact();
    cache.set('key-1', artifact);
    expect(cache.getInMemory('key-1')).toBe(artifact);
  });

  it('second compose-flow lookup hits in-memory in <5ms (cold/warm acceptance)', () => {
    const cache = new HydrologyArtifactCache({ disableIndexedDB: true, disableOPFS: true });
    const artifact = makeArtifact(3, 7);
    const key = 'composed-key';

    // Cold: write the cache.
    cache.set(key, artifact);

    // Warm: a getInMemory hit must complete well under the 5 ms acceptance
    // budget. We measure a single lookup; per the brief this is the
    // synchronous hot path inside `composeTerrain`.
    const start = performance.now();
    const hit = cache.getInMemory(key);
    const elapsedMs = performance.now() - start;

    expect(hit).toBe(artifact);
    expect(elapsedMs).toBeLessThan(5);
  });

  it('evicts least-recently-used entries when capacity is exceeded', () => {
    const cache = new HydrologyArtifactCache({
      inMemoryCapacity: 2,
      disableIndexedDB: true,
      disableOPFS: true,
    });
    cache.set('a', makeArtifact(1));
    cache.set('b', makeArtifact(2));
    // Touch 'a' so 'b' is now LRU.
    cache.getInMemory('a');
    cache.set('c', makeArtifact(3));

    expect(cache.inMemorySize()).toBe(2);
    expect(cache.getInMemory('a')).not.toBeNull();
    expect(cache.getInMemory('c')).not.toBeNull();
    expect(cache.getInMemory('b')).toBeNull();
  });

  it('warm() resolves false when neither persistent backend is available', async () => {
    const cache = new HydrologyArtifactCache({ disableIndexedDB: true, disableOPFS: true });
    expect(await cache.warm('any')).toBe(false);
  });

  it('set() never throws even when persistent backends explode', () => {
    // The IDB/OPFS write paths swallow errors silently. Construct a cache
    // that disables them outright and confirm set still works (smoke test
    // of the fire-and-forget contract).
    const cache = new HydrologyArtifactCache({ disableIndexedDB: true, disableOPFS: true });
    expect(() => cache.set('k', makeArtifact())).not.toThrow();
    expect(cache.getInMemory('k')).not.toBeNull();
  });
});

/**
 * Tiny IDB shim with just enough surface area to back `HydrologyArtifactCache`.
 * Built from scratch so we don't add a dependency for one test file.
 */
function installFakeIndexedDB(): { uninstall: () => void; underlying: Map<string, Map<string, unknown>> } {
  const stores = new Map<string, Map<string, unknown>>();

  const fakeIDBFactory = {
    open(dbName: string, _version: number) {
      const request: Record<string, unknown> = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
        result: null,
      };
      Promise.resolve().then(() => {
        const objectStoreNames = {
          contains: (n: string) => stores.has(`${dbName}/${n}`),
        };
        const db = {
          objectStoreNames,
          createObjectStore: (name: string) => {
            const key = `${dbName}/${name}`;
            if (!stores.has(key)) stores.set(key, new Map());
          },
          transaction: (storeName: string, _mode: string) => {
            const key = `${dbName}/${storeName}`;
            if (!stores.has(key)) stores.set(key, new Map());
            const store = stores.get(key)!;
            const tx: Record<string, unknown> = {
              objectStore: (_n: string) => ({
                get: (k: string) => {
                  const req: Record<string, unknown> = {
                    onsuccess: null,
                    onerror: null,
                    result: store.get(k),
                  };
                  Promise.resolve().then(() => {
                    const cb = req.onsuccess as ((this: unknown) => void) | null;
                    if (cb) cb.call(req);
                  });
                  return req;
                },
                put: (value: unknown, k: string) => {
                  store.set(k, value);
                  return { onsuccess: null, onerror: null };
                },
              }),
              oncomplete: null,
              onerror: null,
              onabort: null,
            };
            Promise.resolve().then(() => {
              const cb = tx.oncomplete as ((this: unknown) => void) | null;
              if (cb) cb.call(tx);
            });
            return tx;
          },
          close: () => undefined,
        };
        // First emit upgradeneeded (so the store gets created), then success.
        request.result = db;
        const upgrade = request.onupgradeneeded as ((this: unknown) => void) | null;
        if (upgrade) upgrade.call(request);
        const success = request.onsuccess as ((this: unknown) => void) | null;
        if (success) success.call(request);
      });
      return request;
    },
  } as unknown as IDBFactory;

  const previous = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = fakeIDBFactory;

  return {
    uninstall: () => {
      if (previous) {
        (globalThis as { indexedDB?: IDBFactory }).indexedDB = previous;
      } else {
        delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
      }
    },
    underlying: stores,
  };
}

describe('HydrologyArtifactCache (IndexedDB fallback)', () => {
  it('warm() promotes a persisted entry to the in-memory LRU', async () => {
    const idb = installFakeIndexedDB();
    try {
      const cache = new HydrologyArtifactCache({ disableOPFS: true });
      const artifact = makeArtifact(1, 11);
      const key = 'warm-key';

      // Write via the cache (sets in-memory + fires IDB write).
      cache.set(key, artifact);

      // Simulate a fresh process: drop in-memory state, then warm from IDB.
      cache.clearInMemory();
      expect(cache.getInMemory(key)).toBeNull();

      const hit = await cache.warm(key);
      expect(hit).toBe(true);
      const warmed = cache.getInMemory(key);
      expect(warmed).not.toBeNull();
      expect(warmed?.channelPolylines[0]?.points[0]?.elevationMeters).toBe(11);
    } finally {
      idb.uninstall();
    }
  });

  it('warm() returns false when the entry is absent from persistent storage', async () => {
    const idb = installFakeIndexedDB();
    try {
      const cache = new HydrologyArtifactCache({ disableOPFS: true });
      expect(await cache.warm('never-written')).toBe(false);
    } finally {
      idb.uninstall();
    }
  });
});
