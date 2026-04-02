import { describe, expect, it } from 'vitest';
import { resolveNearbySafeSpawnPosition, resolveOpenSpawnFacingYaw } from './SpawnFacing';

describe('resolveOpenSpawnFacingYaw', () => {
  it('keeps the fallback yaw on flat terrain', () => {
    const terrain = {
      getEffectiveHeightAt: () => 10
    };

    expect(resolveOpenSpawnFacingYaw({ x: 0, z: 0 }, terrain, Math.PI)).toBe(Math.PI);
  });

  it('rotates away from a rising wall directly ahead', () => {
    const terrain = {
      getEffectiveHeightAt: (_x: number, z: number) => (z > 0 ? z * 2 : 0)
    };

    expect(resolveOpenSpawnFacingYaw({ x: 0, z: 0 }, terrain, Math.PI)).toBe(0);
  });
});

describe('resolveNearbySafeSpawnPosition', () => {
  it('keeps the anchor when the nearby terrain is equally safe', () => {
    const terrain = {
      getEffectiveHeightAt: () => 10,
      getSlopeAt: () => 4
    };

    expect(resolveNearbySafeSpawnPosition({ x: 0, z: 0 }, terrain)).toEqual({ x: 0, z: 0 });
  });

  it('moves origin spawns toward flatter nearby ground', () => {
    const terrain = {
      getEffectiveHeightAt: (x: number, z: number) => {
        if (x <= -20 && z <= -20) return 2;
        if (x >= 0 || z >= 0) return 40;
        return 12;
      },
      getSlopeAt: (x: number, z: number) => (x <= -20 && z <= -20 ? 3 : 25)
    };

    const result = resolveNearbySafeSpawnPosition({ x: 0, z: 0 }, terrain);
    expect(result.x).toBeLessThan(0);
    expect(result.z).toBeLessThan(0);
  });
});
