import { describe, it, expect } from 'vitest';
import { computeNavmeshCacheKey, getCachedNavmesh, setCachedNavmesh } from './NavmeshCache';

describe('NavmeshCache', () => {
  describe('computeNavmeshCacheKey', () => {
    it('returns the same key for the same world + config', async () => {
      const config = { cs: 3.0, ch: 0.4, walkableSlopeAngle: 45 };
      const key1 = await computeNavmeshCacheKey(3200, config);
      const key2 = await computeNavmeshCacheKey(3200, config);
      expect(key1).toBe(key2);
    });

    it('returns a different key when world size changes', async () => {
      const config = { cs: 3.0, ch: 0.4 };
      const key1 = await computeNavmeshCacheKey(800, config);
      const key2 = await computeNavmeshCacheKey(3200, config);
      expect(key1).not.toBe(key2);
    });

    it('returns a different key when recast config changes', async () => {
      const key1 = await computeNavmeshCacheKey(3200, { cs: 3.0 });
      const key2 = await computeNavmeshCacheKey(3200, { cs: 2.0 });
      expect(key1).not.toBe(key2);
    });

    it('returns a different key when terrain fingerprint changes', async () => {
      const config = { cs: 3.0, ch: 0.4 };
      const key1 = await computeNavmeshCacheKey(3200, config, 'terrain-a');
      const key2 = await computeNavmeshCacheKey(3200, config, 'terrain-b');
      expect(key1).not.toBe(key2);
    });
  });

  describe('getCachedNavmesh / setCachedNavmesh', () => {
    it('degrade gracefully when storage is unavailable', async () => {
      // In this test env IndexedDB is absent, so get/set must not throw and get returns null.
      await expect(setCachedNavmesh('test-key', new Uint8Array([1, 2, 3]))).resolves.not.toThrow();
      const result = await getCachedNavmesh('nonexistent-key');
      expect(result).toBeNull();
    });
  });
});
