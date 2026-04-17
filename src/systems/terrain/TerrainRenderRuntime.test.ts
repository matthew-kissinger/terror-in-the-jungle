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

  it('renders over an extent larger than the playable world when a visual margin is configured', () => {
    const playableSize = 500;
    const config = {
      worldSize: playableSize,
      visualMargin: 320,
      maxLODLevels: 4,
      lodRanges: [125, 250, 500, 1000],
      tileResolution: 33,
    };

    const runtime = new TerrainRenderRuntime(
      { add: vi.fn(), remove: vi.fn() } as unknown as THREE.Scene,
      new THREE.PerspectiveCamera(),
      new THREE.MeshStandardMaterial(),
      config,
    );

    runtime.reconfigure(config);

    // Observable behavior: the quadtree is configured with an extent strictly
    // larger than the playable world so that overflow terrain stays visible at
    // the map edges. Exact arithmetic (margin * 2 etc.) is not load-bearing.
    expect(mockQuadtreeCtor).toHaveBeenCalled();
    const lastCallArgs = mockQuadtreeCtor.mock.calls[mockQuadtreeCtor.mock.calls.length - 1];
    const [renderedExtent] = lastCallArgs;
    expect(renderedExtent).toBeGreaterThan(playableSize);
  });
});
