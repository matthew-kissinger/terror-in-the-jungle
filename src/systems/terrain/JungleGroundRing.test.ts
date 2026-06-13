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
