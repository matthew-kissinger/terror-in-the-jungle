import { describe, it, expect, beforeEach } from 'vitest';
import { computeNavmeshCacheKey, getCachedNavmesh, setCachedNavmesh } from './NavmeshCache';

// fake-indexeddb is auto-loaded by vitest's jsdom/happy-dom environment
// or we test the key function which doesn't need IndexedDB

describe('NavmeshCache', () => {
  describe('computeNavmeshCacheKey', () => {
    it('produces a deterministic key', async () => {
      const config = { cs: 3.0, ch: 0.4, walkableSlopeAngle: 45 };
      const key1 = await computeNavmeshCacheKey(3200, config);
      const key2 = await computeNavmeshCacheKey(3200, config);
      expect(key1).toBe(key2);
    });

    it('produces different keys for different world sizes', async () => {
      const config = { cs: 3.0, ch: 0.4 };
      const key1 = await computeNavmeshCacheKey(800, config);
      const key2 = await computeNavmeshCacheKey(3200, config);
      expect(key1).not.toBe(key2);
    });

    it('produces different keys for different configs', async () => {
      const key1 = await computeNavmeshCacheKey(3200, { cs: 3.0 });
      const key2 = await computeNavmeshCacheKey(3200, { cs: 2.0 });
      expect(key1).not.toBe(key2);
    });

    it('key starts with version prefix', async () => {
      const key = await computeNavmeshCacheKey(800, { cs: 1.0 });
      expect(key).toMatch(/^navmesh-v1-/);
    });

    it('key contains hex hash', async () => {
      const key = await computeNavmeshCacheKey(800, { cs: 1.0 });
      const hash = key.replace('navmesh-v1-', '');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('getCachedNavmesh / setCachedNavmesh', () => {
    beforeEach(() => {
      // IndexedDB may not be available in test environment
      // These tests verify the API handles errors gracefully
    });

    it('returns null for missing key', async () => {
      const result = await getCachedNavmesh('nonexistent-key');
      // Either null (no IndexedDB) or null (key not found)
      expect(result).toBeNull();
    });

    it('set does not throw on missing IndexedDB', async () => {
      const data = new Uint8Array([1, 2, 3]);
      // Should not throw even if IndexedDB is unavailable
      await expect(setCachedNavmesh('test-key', data)).resolves.not.toThrow();
    });
  });
});
