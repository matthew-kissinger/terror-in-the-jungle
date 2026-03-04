import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

const { mockQuadtreeCtor } = vi.hoisted(() => ({
  mockQuadtreeCtor: vi.fn(),
}));

vi.mock('./CDLODQuadtree', () => ({
  CDLODQuadtree: class {
    constructor(worldSize: number, maxLOD: number, lodRanges: readonly number[]) {
      mockQuadtreeCtor(worldSize, maxLOD, lodRanges);
    }
    selectTiles = vi.fn().mockReturnValue([]);
    getSelectedTileCount = vi.fn().mockReturnValue(0);
  },
}));

vi.mock('./CDLODRenderer', () => ({
  CDLODRenderer: class {
    getMesh = vi.fn().mockReturnValue({});
    updateInstances = vi.fn();
    dispose = vi.fn();
  },
}));

import { TerrainRenderRuntime } from './TerrainRenderRuntime';

describe('TerrainRenderRuntime', () => {
  beforeEach(() => {
    mockQuadtreeCtor.mockClear();
  });

  it('inflates quadtree coverage by the configured visual margin', () => {
    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      {
        worldSize: 500,
        visualMargin: 320,
        maxLODLevels: 4,
        lodRanges: [125, 250, 500, 1000],
        tileResolution: 33,
      },
    );

    runtime.reconfigure({
      worldSize: 500,
      visualMargin: 320,
      maxLODLevels: 4,
      lodRanges: [125, 250, 500, 1000],
      tileResolution: 33,
    });

    expect(mockQuadtreeCtor).toHaveBeenLastCalledWith(1140, 4, [125, 250, 500, 1000]);
  });
});
