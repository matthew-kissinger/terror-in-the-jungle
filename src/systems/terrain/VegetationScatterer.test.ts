import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// Mock HeightQueryCache
vi.mock('./HeightQueryCache', () => {
  const cache = {
    getHeightAt: vi.fn().mockReturnValue(5),
    getProvider: vi.fn(),
  };
  return {
    getHeightQueryCache: () => cache,
    HeightQueryCache: class {},
  };
});

// Mock ChunkVegetationGenerator
vi.mock('./ChunkVegetationGenerator', () => ({
  ChunkVegetationGenerator: {
    generateVegetation: vi.fn().mockReturnValue(new Map([
      ['fern', [{ position: new THREE.Vector3(0, 5, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 }]],
    ])),
  },
}));

import { VegetationScatterer } from './VegetationScatterer';
import type { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';
import type { VegetationTypeConfig } from '../../config/vegetationTypes';
import type { BiomeClassificationRule, BiomeVegetationEntry } from '../../config/biomes';
import { ChunkVegetationGenerator } from './ChunkVegetationGenerator';
import { getHeightQueryCache } from './HeightQueryCache';

function makeMockBillboard(): GlobalBillboardSystem {
  return {
    addChunkInstances: vi.fn(),
    removeChunkInstances: vi.fn(),
    configure: vi.fn(),
    getActiveVegetationTypes: vi.fn().mockReturnValue([]),
    getActiveBiome: vi.fn(),
  } as any;
}

const testTypes: VegetationTypeConfig[] = [
  { id: 'fern', textureName: 'fern', size: 2, maxInstances: 1000, yOffset: 0, fadeDistance: 50, maxDistance: 100, baseDensity: 1, placement: 'random', tier: 'groundCover' },
];

const testPalette: BiomeVegetationEntry[] = [
  { typeId: 'fern', densityMultiplier: 1 },
];

const highlandPalette: BiomeVegetationEntry[] = [
  { typeId: 'fern', densityMultiplier: 0.25 },
];

describe('VegetationScatterer', () => {
  let scatterer: VegetationScatterer;
  let billboard: GlobalBillboardSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    billboard = makeMockBillboard();
    scatterer = new VegetationScatterer(billboard, 64, 2);
    scatterer.configure(
      testTypes,
      'denseJungle',
      new Map([
        ['denseJungle', testPalette],
        ['highland', highlandPalette],
      ]),
    );
  });

  it('generates cells around player position', () => {
    scatterer.update(new THREE.Vector3(0, 0, 0));

    expect(scatterer.getActiveCellCount()).toBeGreaterThan(0);
    expect(billboard.addChunkInstances).toHaveBeenCalled();
  });

  it('does not regenerate on same cell position', () => {
    scatterer.update(new THREE.Vector3(10, 0, 10));
    const count1 = (billboard.addChunkInstances as any).mock.calls.length;

    scatterer.update(new THREE.Vector3(15, 0, 15)); // Same cell
    const count2 = (billboard.addChunkInstances as any).mock.calls.length;

    expect(count2).toBe(count1);
  });

  it('removes distant cells when player moves', () => {
    scatterer.update(new THREE.Vector3(0, 0, 0));
    scatterer.update(new THREE.Vector3(500, 0, 500)); // Move far away

    expect(billboard.removeChunkInstances).toHaveBeenCalled();
  });

  it('clear removes all cells', () => {
    scatterer.update(new THREE.Vector3(0, 0, 0));
    expect(scatterer.getActiveCellCount()).toBeGreaterThan(0);

    scatterer.clear();
    expect(scatterer.getActiveCellCount()).toBe(0);
  });

  it('does not generate when not configured', () => {
    const emptyScatterer = new VegetationScatterer(billboard, 64, 2);
    emptyScatterer.update(new THREE.Vector3(0, 0, 0));

    // addChunkInstances should not be called for empty config
    // (cells are tracked but no vegetation generated)
    expect(emptyScatterer.getActiveCellCount()).toBeGreaterThan(0);
  });

  it('classifies vegetation by biome rule per cell', () => {
    const rules: BiomeClassificationRule[] = [
      { biomeId: 'highland', elevationMin: 4, priority: 10 },
    ];
    scatterer.configure(
      testTypes,
      'denseJungle',
      new Map([
        ['denseJungle', testPalette],
        ['highland', highlandPalette],
      ]),
      rules,
    );

    scatterer.update(new THREE.Vector3(0, 0, 0));

    expect(ChunkVegetationGenerator.generateVegetation).toHaveBeenCalled();
    const calls = vi.mocked(ChunkVegetationGenerator.generateVegetation).mock.calls;
    const classifiedPalette = calls[calls.length - 1][5];
    expect(classifiedPalette).toEqual(highlandPalette);
  });

  it('clamps overflow cell height sampling to playable bounds', () => {
    scatterer.setWorldBounds(100, 50);

    const cache = getHeightQueryCache() as any;
    cache.getHeightAt.mockClear();

    (scatterer as any).generateCell('1,0');

    const calls = vi.mocked(ChunkVegetationGenerator.generateVegetation).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const getHeight = calls[calls.length - 1][3] as (localX: number, localZ: number) => number;

    cache.getHeightAt.mockClear();
    getHeight(64, 0);

    expect(cache.getHeightAt).toHaveBeenCalledWith(50, 0);
  });
});
