/**
 * IndexedDB cache for serialized navmesh data.
 * Avoids regenerating navmesh when world params haven't changed.
 */

const DB_NAME = 'navmesh-cache';
const STORE_NAME = 'meshes';
const DB_VERSION = 1;
const MAX_ENTRIES = 5;
const CACHE_PREFIX = 'navmesh-v1-';

interface CacheEntry {
  data: Uint8Array;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Compute a deterministic cache key from navmesh generation parameters.
 * Uses SHA-256 of the JSON-serialized config.
 */
export async function computeNavmeshCacheKey(
  worldSize: number,
  recastConfig: Record<string, number>,
): Promise<string> {
  const payload = JSON.stringify({ worldSize, ...recastConfig });
  const encoded = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = Array.from(hashArray, (b) => b.toString(16).padStart(2, '0')).join('');
  return CACHE_PREFIX + hashHex;
}

/**
 * Retrieve cached navmesh data by key. Returns null on miss or error.
 */
export async function getCachedNavmesh(key: string): Promise<Uint8Array | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        db.close();
        const entry = request.result as CacheEntry | undefined;
        resolve(entry?.data ?? null);
      };
      request.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Store navmesh data in cache. Evicts oldest entries if over MAX_ENTRIES.
 */
export async function setCachedNavmesh(key: string, data: Uint8Array): Promise<void> {
  try {
    const db = await openDB();

    // Read all keys + timestamps for LRU eviction
    const allEntries = await new Promise<Array<{ key: string; timestamp: number }>>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const entries: Array<{ key: string; timestamp: number }> = [];
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (c) {
          entries.push({ key: c.key as string, timestamp: (c.value as CacheEntry).timestamp });
          c.continue();
        } else {
          resolve(entries);
        }
      };
      cursor.onerror = () => resolve(entries);
    });

    // Determine keys to evict (keep MAX_ENTRIES - 1 to make room for new entry)
    const keysToDelete: string[] = [];
    if (allEntries.length >= MAX_ENTRIES) {
      allEntries.sort((a, b) => a.timestamp - b.timestamp);
      const evictCount = allEntries.length - MAX_ENTRIES + 1;
      for (let i = 0; i < evictCount; i++) {
        keysToDelete.push(allEntries[i].key);
      }
    }

    // Write new entry + delete evicted in one transaction
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ data, timestamp: Date.now() } satisfies CacheEntry, key);
    for (const k of keysToDelete) {
      store.delete(k);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // Silently ignore cache write failures
  }
}
