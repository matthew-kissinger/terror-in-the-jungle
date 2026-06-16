// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import type { VegetationTypeConfig } from '../../config/vegetationTypes';
import type { BiomeVegetationEntry } from '../../config/biomes';
import type { GlobalBillboardSystem } from '../world/billboard/GlobalBillboardSystem';

const { mockGetHeightAt } = vi.hoisted(() => ({
  mockGetHeightAt: vi.fn().mockReturnValue(5),
}));

vi.mock('./HeightQueryCache', () => {
  const cache = {
    getHeightAt: mockGetHeightAt,
    getProvider: vi.fn(),
  };
  return {
    getHeightQueryCache: () => cache,
    HeightQueryCache: class {},
  };
});

import { JungleGroundRing } from './JungleGroundRing';

function makeMockBillboard(): GlobalBillboardSystem {
  return {
    addChunkInstances: vi.fn(),
    removeChunkInstances: vi.fn(),
    configure: vi.fn(),
    getActiveVegetationTypes: vi.fn().mockReturnValue([]),
    getActiveBiome: vi.fn(),
  } as unknown as GlobalBillboardSystem;
}

const testTypes: VegetationTypeConfig[] = [
  {
    id: 'fern',
    textureName: 'PixelForge.Vegetation.fern.color',
    normalTextureName: 'PixelForge.Vegetation.fern.normal',
    size: 2,
    maxInstances: 1000,
    yOffset: 0.5,
    fadeDistance: 50,
    maxDistance: 100,
    baseDensity: 8,
    placement: 'random',
    maxSlopeDeg: 24,
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
  {
    id: 'elephantEar',
    textureName: 'PixelForge.Vegetation.elephantEar.color',
    normalTextureName: 'PixelForge.Vegetation.elephantEar.normal',
    size: 4,
    maxInstances: 1000,
    yOffset: 1,
    fadeDistance: 60,
    maxDistance: 120,
    baseDensity: 3,
    placement: 'random',
    maxSlopeDeg: 22,
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
  {
    id: 'bananaPlant',
    textureName: 'PixelForge.Vegetation.bananaPlant.color',
    normalTextureName: 'PixelForge.Vegetation.bananaPlant.normal',
    size: 6,
    maxInstances: 1000,
    yOffset: 2,
    fadeDistance: 90,
    maxDistance: 150,
    baseDensity: 8,
    placement: 'random',
    maxSlopeDeg: 18,
    tier: 'midLevel',
    representation: 'imposter',
    atlasProfile: 'mid-balanced',
    shaderProfile: 'normal-lit',
    imposterAtlas: {
      tilesX: 4,
      tilesY: 4,
      layout: 'latlon',
      tileSize: 512,
    },
    normalSpace: 'capture-view',
  },
];

const denseJunglePalette: BiomeVegetationEntry[] = [
  { typeId: 'fern', densityMultiplier: 1 },
  { typeId: 'elephantEar', densityMultiplier: 1 },
  { typeId: 'bananaPlant', densityMultiplier: 1 },
];

describe('JungleGroundRing', () => {
  let billboard: GlobalBillboardSystem;
  let ring: JungleGroundRing;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHeightAt.mockReturnValue(5);
    billboard = makeMockBillboard();
    ring = new JungleGroundRing(billboard, 32, 1);
    ring.setWorldBounds(512, 64);
    ring.configure(
      testTypes,
      'denseJungle',
      new Map([['denseJungle', denseJunglePalette]]),
    );
  });

  it('generates prefixed near-field ground cover cells through the existing billboard system', () => {
    ring.updateBudgeted(new THREE.Vector3(0, 0, 0), { maxAddsPerFrame: 1, maxRemovalsPerFrame: 0 });

    expect(billboard.addChunkInstances).toHaveBeenCalledTimes(1);
    const [chunkKey, instancesByType] = vi.mocked(billboard.addChunkInstances).mock.calls[0];
    expect(chunkKey).toMatch(/^jungle-ground-ring:/);
    expect(instancesByType.has('fern')).toBe(true);
    expect(instancesByType.has('elephantEar')).toBe(true);
    expect(instancesByType.has('bananaPlant')).toBe(false);
  });

  it('still loads the nearest ring cell when traversal throttles additions', () => {
    ring.updateBudgeted(new THREE.Vector3(8, 0, 8), { maxAddsPerFrame: 0, maxRemovalsPerFrame: 0 });

    expect(billboard.addChunkInstances).toHaveBeenCalledTimes(1);
    expect(ring.getDebugInfo().lastUpdate).toEqual(expect.objectContaining({
      requestedAddBudget: 0,
      resolvedAddBudget: 1,
      addedCells: 1,
    }));
    expect(ring.getPendingCounts().adds).toBeGreaterThan(0);
  });

  it('compacts processed residency queues without splice allocation', () => {
    const internals = ring as unknown as {
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
    expect(billboard.removeChunkInstances).toHaveBeenCalledWith('jungle-ground-ring:8,8');
    expect(billboard.addChunkInstances).toHaveBeenCalledWith('jungle-ground-ring:0,0', expect.any(Map));
    expect(internals.pendingRemovals).toEqual(['9,9']);
    expect(internals.pendingAdditions).toEqual(['8,8']);
  });

  it('deduplicates pending residency work when rebuilding the target ring', () => {
    const internals = ring as unknown as {
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
    expect(internals.targetCells.size).toBe(9);
    expect(internals.pendingRemovals).toEqual(['9,9']);
    expect(internals.pendingAdditions.filter((key) => key === '0,1')).toHaveLength(1);
    expect(internals.pendingAdditions).not.toContain('9,9');
    expect(new Set(internals.pendingAdditions).size).toBe(internals.pendingAdditions.length);
  });

  it('orders residency additions by distance without sorting cell keys', () => {
    const internals = ring as unknown as {
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
    expect(internals.pendingAdditions).toEqual([
      '0,0',
      '-1,0',
      '0,-1',
      '0,1',
      '1,0',
      '-1,-1',
      '-1,1',
      '1,-1',
      '1,1',
    ]);
  });

  it('respects route and base exclusion zones before adding dense ground cover', () => {
    ring.setExclusionZones([{ x: 0, z: 0, radius: 80 }]);

    ring.updateBudgeted(new THREE.Vector3(0, 0, 0), { maxAddsPerFrame: 1, maxRemovalsPerFrame: 0 });

    expect(billboard.addChunkInstances).not.toHaveBeenCalled();
    expect(ring.getDebugInfo().lastUpdate.lastGeneratedCell).toEqual(expect.objectContaining({
      skippedReason: 'empty-cell',
      instanceCount: 0,
    }));
  });

  it('removes ring cells with the same key prefix when the player moves out of range', () => {
    ring.updateBudgeted(new THREE.Vector3(0, 0, 0), { maxAddsPerFrame: 9, maxRemovalsPerFrame: 0 });

    ring.updateBudgeted(new THREE.Vector3(256, 0, 256), { maxAddsPerFrame: 0, maxRemovalsPerFrame: 9 });

    expect(billboard.removeChunkInstances).toHaveBeenCalled();
    const removedKeys = vi.mocked(billboard.removeChunkInstances).mock.calls.map((call) => call[0]);
    expect(removedKeys.every((key) => key.startsWith('jungle-ground-ring:'))).toBe(true);
  });
});
