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
  {
    id: 'fern',
    textureName: 'PixelForge.Vegetation.fern.color',
    normalTextureName: 'PixelForge.Vegetation.fern.normal',
    size: 2,
    maxInstances: 1000,
    yOffset: 0,
    fadeDistance: 50,
    maxDistance: 100,
    baseDensity: 1,
    placement: 'random',
    tier: 'groundCover',
    representation: 'imposter',
    atlasProfile: 'ground-compact',
    shaderProfile: 'hemisphere',
    imposterAtlas: {
      tilesX: 4,
      tilesY: 2,
      layout: 'latlon',
      tileSize: 256,
    },
  },
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
    // Drain all pending additions (budgeted at 4 per frame)
    const pos = new THREE.Vector3(10, 0, 10);
    for (let i = 0; i < 20; i++) scatterer.update(pos);
    const count1 = (billboard.addChunkInstances as any).mock.calls.length;

    // Same cell - no new additions
    scatterer.update(new THREE.Vector3(15, 0, 15));
    const count2 = (billboard.addChunkInstances as any).mock.calls.length;

    expect(count2).toBe(count1);
  });

  it('still loads nearest cells when far vegetation additions are throttled', () => {
    const pos = new THREE.Vector3(10, 0, 10);

    scatterer.updateBudgeted(pos, { maxAddsPerFrame: 0, maxRemovalsPerFrame: 0 });

    expect(scatterer.getActiveCellCount()).toBe(1);
    expect(billboard.addChunkInstances).toHaveBeenCalledTimes(1);
    expect(scatterer.getPendingCounts().adds).toBeGreaterThan(0);
  });

  it('prioritizes critical cells over stale far pending additions when throttled', () => {
    const internals = scatterer as unknown as {
      pendingAdditions: string[];
      lastPlayerCellX: number;
      lastPlayerCellZ: number;
      processPendingWork(maxAddsPerFrame: number, maxRemovalsPerFrame: number): boolean;
    };
    internals.pendingAdditions = ['8,8', '0,0'];
    internals.lastPlayerCellX = 0;
    internals.lastPlayerCellZ = 0;

    expect(internals.processPendingWork(0, 0)).toBe(true);

    expect(billboard.addChunkInstances).toHaveBeenCalledTimes(1);
    expect(billboard.addChunkInstances.mock.calls[0][0]).toBe('0,0');
    expect(internals.pendingAdditions).toEqual(['8,8']);
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

});
