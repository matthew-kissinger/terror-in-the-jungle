// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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

  it('reports residency debug info for perf heap attribution', () => {
    const pos = new THREE.Vector3(10, 0, 10);

    scatterer.updateBudgeted(pos, { maxAddsPerFrame: 2, maxRemovalsPerFrame: 0 });

    expect(scatterer.getDebugInfo()).toEqual(expect.objectContaining({
      cellSize: 64,
      maxCellDistance: 2,
      activeCells: 2,
      targetCells: 25,
      pendingAdditions: 23,
      pendingRemovals: 0,
      lastPlayerCell: { x: 0, z: 0 },
      lastUpdate: expect.objectContaining({
        requestedAddBudget: 2,
        resolvedAddBudget: 2,
        addedCells: 2,
        removedCells: 0,
        generatedInstances: expect.any(Number),
        lastGeneratedCell: expect.objectContaining({
          cellKey: expect.any(String),
          instanceCount: expect.any(Number),
          typeCounts: expect.any(Object),
        }),
      }),
    }));
  });

  it('sizes residency from active vegetation draw distance instead of the fallback ring', () => {
    const compactScatterer = new VegetationScatterer(billboard, 64, 6);
    compactScatterer.configure(
      [
        {
          ...testTypes[0],
          tier: 'midLevel',
          maxDistance: 130,
        },
      ],
      'denseJungle',
      new Map([['denseJungle', testPalette]]),
    );

    compactScatterer.updateBudgeted(new THREE.Vector3(10, 0, 10), { maxAddsPerFrame: 1, maxRemovalsPerFrame: 0 });

    expect(compactScatterer.getDebugInfo()).toEqual(expect.objectContaining({
      maxCellDistance: 3,
      targetCells: 49,
    }));
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

  it('compacts processed residency queues without splice allocation', () => {
    const internals = scatterer as unknown as {
      activeCells: Set<string>;
      pendingAdditions: string[];
      pendingRemovals: string[];
      lastPlayerCellX: number;
      lastPlayerCellZ: number;
      processPendingWork(maxAddsPerFrame: number, maxRemovalsPerFrame: number): boolean;
    };
    internals.activeCells = new Set(['8,8', '9,9']);
    internals.pendingRemovals = ['8,8', '9,9'];
    internals.pendingAdditions = ['8,8', '0,0'];
    internals.lastPlayerCellX = 0;
    internals.lastPlayerCellZ = 0;

    const spliceSpy = vi.spyOn(Array.prototype, 'splice');
    const didWork = internals.processPendingWork(0, 1);
    const spliceCalls = spliceSpy.mock.calls.length;
    spliceSpy.mockRestore();

    expect(didWork).toBe(true);
    expect(spliceCalls).toBe(0);
    expect(billboard.removeChunkInstances).toHaveBeenCalledWith('8,8');
    expect(billboard.addChunkInstances).toHaveBeenCalledWith('0,0', expect.any(Map));
    expect(internals.pendingRemovals).toEqual(['9,9']);
    expect(internals.pendingAdditions).toEqual(['8,8']);
  });

  it('deduplicates pending residency work when rebuilding the target ring', () => {
    const internals = scatterer as unknown as {
      activeCells: Set<string>;
      targetCells: Set<string>;
      pendingAdditions: string[];
      pendingRemovals: string[];
      rebuildResidencyTargets(cellX: number, cellZ: number): void;
    };
    internals.activeCells = new Set(['0,0', '9,9']);
    internals.pendingAdditions = ['0,1', '9,9'];
    internals.pendingRemovals = ['8,8', '9,9'];
    const targetCells = internals.targetCells;

    internals.rebuildResidencyTargets(0, 0);

    expect(internals.targetCells).toBe(targetCells);
    expect(internals.targetCells.size).toBe(25);
    expect(internals.pendingRemovals).toEqual(['9,9']);
    expect(internals.pendingAdditions.filter((key) => key === '0,1')).toHaveLength(1);
    expect(internals.pendingAdditions).not.toContain('9,9');
    expect(new Set(internals.pendingAdditions).size).toBe(internals.pendingAdditions.length);
  });

  it('orders residency additions by distance without sorting cell keys', () => {
    const internals = scatterer as unknown as {
      activeCells: Set<string>;
      pendingAdditions: string[];
      pendingRemovals: string[];
      rebuildResidencyTargets(cellX: number, cellZ: number): void;
    };
    internals.activeCells = new Set();
    internals.pendingAdditions = [];
    internals.pendingRemovals = [];

    const sortSpy = vi.spyOn(Array.prototype, 'sort');
    internals.rebuildResidencyTargets(0, 0);
    const sortCalls = sortSpy.mock.calls.length;
    sortSpy.mockRestore();

    expect(sortCalls).toBe(0);
    expect(internals.pendingAdditions[0]).toBe('0,0');
    let previousDistance = 0;
    for (const key of internals.pendingAdditions) {
      const [x, z] = key.split(',').map(Number);
      const distance = Math.abs(x) + Math.abs(z);
      expect(distance).toBeGreaterThanOrEqual(previousDistance);
      previousDistance = distance;
    }
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

  it('preserves generated vegetation arrays when exclusion zones do not remove instances', () => {
    const generatedFern = [
      { position: new THREE.Vector3(0, 5, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
      { position: new THREE.Vector3(5, 5, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
    ];
    vi.mocked(ChunkVegetationGenerator.generateVegetation).mockReturnValueOnce(new Map([
      ['fern', generatedFern],
    ]));
    scatterer.setExclusionZones([{ x: 1000, z: 1000, radius: 8 }]);

    scatterer.updateBudgeted(new THREE.Vector3(0, 0, 0), { maxAddsPerFrame: 1, maxRemovalsPerFrame: 0 });

    const [, instancesByType] = vi.mocked(billboard.addChunkInstances).mock.calls[0];
    expect(instancesByType.get('fern')).toBe(generatedFern);
    expect(scatterer.getDebugInfo().lastUpdate.lastGeneratedCell).toEqual(expect.objectContaining({
      skippedReason: null,
      instanceCount: 2,
    }));
  });

  it('filters only vegetation instances inside exclusion zones', () => {
    const kept = { position: new THREE.Vector3(20, 5, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 };
    const generatedFern = [
      { position: new THREE.Vector3(0, 5, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
      kept,
    ];
    vi.mocked(ChunkVegetationGenerator.generateVegetation).mockReturnValueOnce(new Map([
      ['fern', generatedFern],
    ]));
    scatterer.setExclusionZones([{ x: 0, z: 0, radius: 8 }]);

    scatterer.updateBudgeted(new THREE.Vector3(0, 0, 0), { maxAddsPerFrame: 1, maxRemovalsPerFrame: 0 });

    const [, instancesByType] = vi.mocked(billboard.addChunkInstances).mock.calls[0];
    expect(instancesByType.get('fern')).toEqual([kept]);
    expect(instancesByType.get('fern')).not.toBe(generatedFern);
    expect(scatterer.getDebugInfo().lastUpdate.lastGeneratedCell).toEqual(expect.objectContaining({
      skippedReason: null,
      instanceCount: 1,
    }));
  });
});
