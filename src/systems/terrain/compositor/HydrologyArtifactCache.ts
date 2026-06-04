// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

// R2.2 of cycle-terrain-compositor (memo:
// docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md §Risks "Compose time
// creep").
//
// Cache for the Pass C recomposed hydrology artifact, keyed on
// (sorted-stamps + base-artifact-version + composed-provider-identity).
//
// Backends:
//   1. In-memory LRU (always available; primary sync-path lookup).
//   2. IndexedDB (browsers + workers; persistent across reloads).
//   3. OPFS (modern browsers; used as a JSON blob store when available).
//
// Synchronous `getInMemory(key)` is the hot-path call from `composeTerrain`
// — Pass C runs synchronously inside the startup pipeline, so we cannot
// `await` an IDB / OPFS hit there. To make persistent storage useful, the
// caller can `await cache.warm(key)` BEFORE `composeTerrain` (e.g. during
// terrain prep) which hydrates the in-memory LRU. The cache degrades
// gracefully on every error (missing storage, quota, schema mismatch);
// recomposing is always safe because it is pure.

import type { HydrologyBakeArtifact } from '../hydrology/HydrologyBake';

const DB_NAME = 'terrain-compositor';
const STORE_NAME = 'hydrology-recompose';
const DB_VERSION = 1;
const OPFS_DIR_NAME = 'terrain-compositor';
const OPFS_SUBDIR_NAME = 'hydrology-recompose';
const DEFAULT_IN_MEMORY_CAPACITY = 8;

export interface HydrologyArtifactCacheOptions {
  /** Override the in-memory LRU capacity. Defaults to 8 entries. */
  inMemoryCapacity?: number;
  /**
   * Skip IndexedDB even when `indexedDB` is present. Useful for tests that
   * want to exercise the in-memory path only.
   */
  disableIndexedDB?: boolean;
  /** Skip OPFS even when `navigator.storage.getDirectory` is present. */
  disableOPFS?: boolean;
}

/**
 * Compute a stable cache key for a recomposed hydrology artifact.
 *
 * The key combines (a) the canonical stamp list sorted by priority,
 * (b) the input artifact's schema version + channel-count + cell sizing,
 * and (c) the composed provider's identity (any object whose JSON
 * serialization captures the provider's height field — callers usually
 * pass `composedProvider.getWorkerConfig()`).
 *
 * Uses crypto.subtle.digest when available (browsers / Node 20+) and
 * falls back to a deterministic string-hash otherwise. Either way the key
 * is stable across page loads.
 */
export async function computeHydrologyArtifactCacheKey(
  stampsFingerprint: unknown,
  baseArtifact: HydrologyBakeArtifact | null,
  composedProviderIdentity: unknown,
): Promise<string> {
  const payload = JSON.stringify({
    schemaVersion: 1,
    stamps: stampsFingerprint,
    artifact: baseArtifact ? {
      schemaVersion: baseArtifact.schemaVersion,
      width: baseArtifact.width,
      height: baseArtifact.height,
      cellSizeMeters: baseArtifact.cellSizeMeters,
      channelCount: baseArtifact.channelPolylines.length,
      // Cheap fingerprint of polyline structure — point counts + endpoints —
      // avoids serializing every elevation while still invalidating on any
      // change to the bake input.
      polylines: baseArtifact.channelPolylines.map((c) => ({
        head: c.headCell,
        outlet: c.outletCell,
        len: c.lengthCells,
        points: c.points.length,
      })),
    } : null,
    composedProvider: composedProviderIdentity ?? null,
  });
  return hashString(payload);
}

async function hashString(input: string): Promise<string> {
  const subtle = typeof globalThis.crypto !== 'undefined'
    ? globalThis.crypto.subtle
    : undefined;
  if (subtle && typeof subtle.digest === 'function') {
    try {
      const encoded = new TextEncoder().encode(input);
      const buf = await subtle.digest('SHA-1', encoded);
      return 'sha1-' + bytesToHex(new Uint8Array(buf));
    } catch {
      // Fall through to non-crypto hash.
    }
  }
  return 'fnv1a-' + fnv1a64Hex(input);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return hex;
}

function fnv1a64Hex(input: string): string {
  // FNV-1a 64-bit. JavaScript numbers lose precision past 2^53 so we keep
  // two 32-bit halves and do schoolbook 64x64 multiply.
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i) & 0xff;
    lo ^= c;
    const result = mul64(hi, lo, 0x00000001, 0x000001b3);
    hi = result.hi;
    lo = result.lo;
  }
  return toHex32(hi) + toHex32(lo);
}

function mul64(ah: number, al: number, bh: number, bl: number): { hi: number; lo: number } {
  const ahi = ah >>> 0;
  const alo = al >>> 0;
  const bhi = bh >>> 0;
  const blo = bl >>> 0;
  const al0 = alo & 0xffff;
  const al1 = alo >>> 16;
  const bl0 = blo & 0xffff;
  const bl1 = blo >>> 16;

  const p00 = al0 * bl0;
  const p01 = al0 * bl1;
  const p10 = al1 * bl0;
  const p11 = al1 * bl1;

  const loLow = p00 + ((p01 & 0xffff) << 16) + ((p10 & 0xffff) << 16);
  const carry = Math.floor(loLow / 0x100000000);
  const lo = (loLow >>> 0);

  const hi = (
    ahi * blo +
    alo * bhi +
    p11 +
    (p01 >>> 16) +
    (p10 >>> 16) +
    carry
  ) >>> 0;

  return { hi, lo };
}

function toHex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}

/**
 * In-memory + IndexedDB/OPFS cache for recomposed hydrology artifacts.
 *
 * Lifecycle: construct once per `TerrainCompositor` (or per process — the
 * cache is naturally invalidated by key changes when stamps change). Call
 * `warm(key)` from the startup path BEFORE compose to pre-populate the
 * in-memory LRU from persistent storage. `getInMemory(key)` is the
 * synchronous read used by `composeTerrain`; `set(key, artifact)` writes
 * to both layers (in-memory immediately, persistent asynchronously
 * fire-and-forget).
 */
export class HydrologyArtifactCache {
  private readonly options: Required<HydrologyArtifactCacheOptions>;
  private readonly memory = new Map<string, HydrologyBakeArtifact>();

  constructor(options: HydrologyArtifactCacheOptions = {}) {
    this.options = {
      inMemoryCapacity: options.inMemoryCapacity ?? DEFAULT_IN_MEMORY_CAPACITY,
      disableIndexedDB: options.disableIndexedDB ?? false,
      disableOPFS: options.disableOPFS ?? false,
    };
  }

  /** Synchronous in-memory lookup. The hot path inside `composeTerrain`. */
  getInMemory(key: string): HydrologyBakeArtifact | null {
    const value = this.memory.get(key);
    if (!value) return null;
    // LRU touch: re-insert at the end of the map iteration order.
    this.memory.delete(key);
    this.memory.set(key, value);
    return value;
  }

  /**
   * Hydrate the in-memory LRU from persistent storage if available.
   * Idempotent: a hit on in-memory short-circuits. Always resolves; never
   * throws on missing-storage / quota / schema errors.
   */
  async warm(key: string): Promise<boolean> {
    if (this.memory.has(key)) return true;

    const opfsHit = await this.readOPFS(key);
    if (opfsHit) {
      this.putInMemory(key, opfsHit);
      return true;
    }

    const idbHit = await this.readIDB(key);
    if (idbHit) {
      this.putInMemory(key, idbHit);
      return true;
    }

    return false;
  }

  /**
   * Insert into both layers. Persistent writes are fire-and-forget; the
   * in-memory write completes synchronously so the next `getInMemory(key)`
   * hits the cache.
   */
  set(key: string, artifact: HydrologyBakeArtifact): void {
    this.putInMemory(key, artifact);
    void this.writeOPFS(key, artifact).catch(() => undefined);
    void this.writeIDB(key, artifact).catch(() => undefined);
  }

  /** Test-only: clear in-memory LRU. Persistent storage is untouched. */
  clearInMemory(): void {
    this.memory.clear();
  }

  /** Visible size of the in-memory LRU. Useful for assertions. */
  inMemorySize(): number {
    return this.memory.size;
  }

  private putInMemory(key: string, artifact: HydrologyBakeArtifact): void {
    if (this.memory.has(key)) this.memory.delete(key);
    this.memory.set(key, artifact);
    while (this.memory.size > this.options.inMemoryCapacity) {
      const oldest = this.memory.keys().next().value;
      if (oldest === undefined) break;
      this.memory.delete(oldest);
    }
  }

  private async readOPFS(key: string): Promise<HydrologyBakeArtifact | null> {
    if (this.options.disableOPFS) return null;
    try {
      const handle = await this.openOPFSFile(key, false);
      if (!handle) return null;
      const file = await handle.getFile();
      const text = await file.text();
      return parseArtifact(text);
    } catch {
      return null;
    }
  }

  private async writeOPFS(key: string, artifact: HydrologyBakeArtifact): Promise<void> {
    if (this.options.disableOPFS) return;
    try {
      const handle = await this.openOPFSFile(key, true);
      if (!handle) return;
      const writable = await (handle as unknown as {
        createWritable: () => Promise<{
          write: (data: string) => Promise<void>;
          close: () => Promise<void>;
        }>;
      }).createWritable();
      await writable.write(JSON.stringify(artifact));
      await writable.close();
    } catch {
      // Silent — cache layer is best-effort.
    }
  }

  private async openOPFSFile(
    key: string,
    create: boolean,
  ): Promise<FileSystemFileHandleLike | null> {
    const nav = globalThis.navigator as { storage?: { getDirectory?: () => Promise<unknown> } } | undefined;
    const getDirectory = nav?.storage?.getDirectory;
    if (typeof getDirectory !== 'function') return null;

    const root = await getDirectory.call(nav!.storage) as DirectoryHandleLike;
    const top = await root.getDirectoryHandle(OPFS_DIR_NAME, { create });
    if (!top) return null;
    const sub = await top.getDirectoryHandle(OPFS_SUBDIR_NAME, { create });
    if (!sub) return null;
    return sub.getFileHandle(`${key}.json`, { create });
  }

  private async readIDB(key: string): Promise<HydrologyBakeArtifact | null> {
    if (this.options.disableIndexedDB) return null;
    const idb = getIndexedDB();
    if (!idb) return null;
    try {
      const db = await openDB(idb);
      return await new Promise<HydrologyBakeArtifact | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          db.close();
          const value = req.result as HydrologyBakeArtifact | undefined;
          resolve(value ?? null);
        };
        req.onerror = () => { db.close(); resolve(null); };
      });
    } catch {
      return null;
    }
  }

  private async writeIDB(key: string, artifact: HydrologyBakeArtifact): Promise<void> {
    if (this.options.disableIndexedDB) return;
    const idb = getIndexedDB();
    if (!idb) return;
    try {
      const db = await openDB(idb);
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(artifact, key);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); resolve(); };
      });
    } catch {
      // Silent.
    }
  }
}

function parseArtifact(text: string): HydrologyBakeArtifact | null {
  try {
    const parsed = JSON.parse(text) as HydrologyBakeArtifact;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.channelPolylines)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

interface DirectoryHandleLike {
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<DirectoryHandleLike>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandleLike>;
}

interface FileSystemFileHandleLike {
  getFile: () => Promise<{ text: () => Promise<string> }>;
}

function getIndexedDB(): IDBFactory | null {
  const scope = globalThis as { indexedDB?: IDBFactory };
  return scope.indexedDB ?? null;
}

function openDB(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('indexedDB.open blocked'));
  });
}
