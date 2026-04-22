import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { mockTerrainRuntime } from '../../../test-utils';
import { createRuntimeTerrainProbe } from './terrainProbe';

describe('createRuntimeTerrainProbe', () => {
  it('samples the current terrain height instead of a latched slab', () => {
    let height = 4;
    const terrain = mockTerrainRuntime({
      getHeightAt: vi.fn(() => height),
    });
    const probe = createRuntimeTerrainProbe(terrain);

    expect(probe.sample(0, 0).height).toBe(4);
    height = 9;
    expect(probe.sample(20, 0).height).toBe(9);
  });

  it('sweeps against a rising heightfield when terrain raycast misses', () => {
    const terrain = mockTerrainRuntime({
      getHeightAt: vi.fn((x: number) => (x >= 10 ? 12 : 0)),
      raycastTerrain: vi.fn(() => ({ hit: false })),
    });
    const probe = createRuntimeTerrainProbe(terrain);

    const hit = probe.sweep(
      new THREE.Vector3(0, 6, 0),
      new THREE.Vector3(20, 6, 0),
    );

    expect(hit).not.toBeNull();
    expect(hit!.point.x).toBeGreaterThan(9);
    expect(hit!.point.x).toBeLessThan(13);
    expect(hit!.point.y).toBeCloseTo(12);
  });
});
