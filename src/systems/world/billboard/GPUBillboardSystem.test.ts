// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GPUBillboardSystem } from './GPUBillboardSystem';
import { GPUBillboardVegetation } from './BillboardBufferManager';
import type { AssetLoader } from '../../assets/AssetLoader';
import type { VegetationTypeConfig } from '../../../config/vegetationTypes';

vi.mock('./BillboardBufferManager', () => ({
  GPUBillboardVegetation: vi.fn(function MockGPUBillboardVegetation(this: Record<string, unknown>) {
    this.addInstances = vi.fn(() => []);
    this.removeInstances = vi.fn();
    this.update = vi.fn();
    this.getInstanceCount = vi.fn(() => 0);
    this.getHighWaterMark = vi.fn(() => 0);
    this.getFreeSlotCount = vi.fn(() => 0);
    this.getInstancePositions = vi.fn(() => new Float32Array());
    this.dispose = vi.fn();
  }),
}));

vi.mock('../../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const vegetationType: VegetationTypeConfig = {
  id: 'fanPalm',
  textureName: 'PixelForge.Vegetation.fanPalm.color',
  normalTextureName: 'PixelForge.Vegetation.fanPalm.normal',
  size: 16,
  fadeDistance: 240,
  maxDistance: 360,
  baseDensity: 0.01,
  maxInstances: 64,
  representation: 'imposter',
  atlasProfile: 'mid-balanced',
  shaderProfile: 'normal-lit',
  imposterAtlas: {
    tilesX: 4,
    tilesY: 4,
    layout: 'latlon',
    tileSize: 512,
  },
  yOffset: 8,
};

const hemisphereVegetationType: VegetationTypeConfig = {
  ...vegetationType,
  id: 'fern',
  textureName: 'PixelForge.Vegetation.fern.color',
  normalTextureName: 'PixelForge.Vegetation.fern.normal',
  shaderProfile: 'hemisphere',
  atlasProfile: 'ground-compact',
  tier: 'groundCover',
};

function makeAssetLoader(): AssetLoader {
  const textures = new Map<string, THREE.Texture>([
    [vegetationType.textureName, new THREE.Texture()],
    [vegetationType.normalTextureName, new THREE.Texture()],
    [hemisphereVegetationType.textureName, new THREE.Texture()],
    [hemisphereVegetationType.normalTextureName, new THREE.Texture()],
  ]);

  return {
    ensureTexturesLoaded: vi.fn(async (names: readonly string[]) => {
      for (const name of names) {
        if (!textures.has(name)) {
          textures.set(name, new THREE.Texture());
        }
      }
    }),
    getTexture: vi.fn((name: string) => textures.get(name)),
  } as unknown as AssetLoader;
}

function latestVegetationConfig() {
  const mocked = vi.mocked(GPUBillboardVegetation);
  return mocked.mock.calls.at(-1)?.[1];
}

function latestVegetationInstance() {
  const mocked = vi.mocked(GPUBillboardVegetation);
  return mocked.mock.instances.at(-1) as unknown as {
    addInstances: ReturnType<typeof vi.fn>;
    removeInstances: ReturnType<typeof vi.fn>;
    getInstancePositions: ReturnType<typeof vi.fn>;
  };
}

describe('GPUBillboardSystem KB-LOAD proof hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __KB_LOAD_DISABLE_VEGETATION_NORMALS__?: boolean }).__KB_LOAD_DISABLE_VEGETATION_NORMALS__;
  });

  afterEach(() => {
    delete (globalThis as { __KB_LOAD_DISABLE_VEGETATION_NORMALS__?: boolean }).__KB_LOAD_DISABLE_VEGETATION_NORMALS__;
  });

  it('uses normal-lit vegetation by default', async () => {
    const assetLoader = makeAssetLoader();
    const system = new GPUBillboardSystem(new THREE.Scene(), assetLoader);

    await system.initializeFromConfig([vegetationType]);

    const config = latestVegetationConfig();
    expect(assetLoader.ensureTexturesLoaded).toHaveBeenCalledWith([
      vegetationType.textureName,
      vegetationType.normalTextureName,
    ]);
    expect(config?.normalTexture).toBeDefined();
    expect(config?.shaderProfile).toBe('normal-lit');
  });

  it('does not fetch unused normal textures for hemisphere-profile vegetation', async () => {
    const assetLoader = makeAssetLoader();
    const system = new GPUBillboardSystem(new THREE.Scene(), assetLoader);

    await system.initializeFromConfig([hemisphereVegetationType]);

    const config = latestVegetationConfig();
    expect(assetLoader.ensureTexturesLoaded).toHaveBeenCalledWith([hemisphereVegetationType.textureName]);
    expect(config?.normalTexture).toBeUndefined();
    expect(config?.shaderProfile).toBe('hemisphere');
    expect(assetLoader.getTexture).toHaveBeenCalledWith(hemisphereVegetationType.textureName);
    expect(assetLoader.getTexture).not.toHaveBeenCalledWith(hemisphereVegetationType.normalTextureName);
  });

  it('can disable vegetation normals for KB-LOAD candidate proof runs', async () => {
    (globalThis as { __KB_LOAD_DISABLE_VEGETATION_NORMALS__?: boolean }).__KB_LOAD_DISABLE_VEGETATION_NORMALS__ = true;
    const assetLoader = makeAssetLoader();
    const system = new GPUBillboardSystem(new THREE.Scene(), assetLoader);

    await system.initializeFromConfig([vegetationType]);

    const config = latestVegetationConfig();
    expect(assetLoader.ensureTexturesLoaded).toHaveBeenCalledWith([vegetationType.textureName]);
    expect(config?.normalTexture).toBeUndefined();
    expect(config?.shaderProfile).toBe('hemisphere');
  });

  it('clears only vegetation instances inside any exclusion zone', async () => {
    const system = new GPUBillboardSystem(new THREE.Scene(), makeAssetLoader());
    await system.initializeFromConfig([vegetationType]);
    const vegetation = latestVegetationInstance();
    vegetation.addInstances.mockReturnValueOnce([0, 1, 2, 3]);
    vegetation.getInstancePositions.mockReturnValue(new Float32Array([
      0, 0, 0,
      10, 0, 0,
      50, 0, 0,
      0, 0, 50,
    ]));

    system.addChunkInstances('chunk-a', vegetationType.id, [
      { position: new THREE.Vector3(0, 0, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
      { position: new THREE.Vector3(10, 0, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
      { position: new THREE.Vector3(50, 0, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
      { position: new THREE.Vector3(0, 0, 50), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
    ]);

    const sliceSpy = vi.spyOn(Array.prototype, 'slice');
    system.clearInstancesInZones([
      { x: 9, z: 0, radius: 3 },
      { x: 0, z: 49, radius: 3 },
    ]);
    const sliceCalls = sliceSpy.mock.calls.length;
    sliceSpy.mockRestore();

    expect(sliceCalls).toBe(0);
    expect(vegetation.removeInstances).toHaveBeenCalledTimes(1);
    expect(vegetation.removeInstances).toHaveBeenCalledWith([1, 3]);

    system.removeChunkInstances('chunk-a');
    expect(vegetation.removeInstances).toHaveBeenCalledTimes(2);
    expect(vegetation.removeInstances).toHaveBeenLastCalledWith([0, 2]);
  });

  it('keeps tracked chunk indices unchanged when exclusion zones clear nothing', async () => {
    const system = new GPUBillboardSystem(new THREE.Scene(), makeAssetLoader());
    await system.initializeFromConfig([vegetationType]);
    const vegetation = latestVegetationInstance();
    const allocatedIndices = [0, 1];
    vegetation.addInstances.mockReturnValueOnce(allocatedIndices);
    vegetation.getInstancePositions.mockReturnValue(new Float32Array([
      0, 0, 0,
      10, 0, 0,
    ]));

    system.addChunkInstances('chunk-a', vegetationType.id, [
      { position: new THREE.Vector3(0, 0, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
      { position: new THREE.Vector3(10, 0, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
    ]);

    system.clearInstancesInZones([{ x: 100, z: 100, radius: 3, radiusSq: 9 }]);

    expect(vegetation.removeInstances).not.toHaveBeenCalled();

    system.removeChunkInstances('chunk-a');
    expect(vegetation.removeInstances).toHaveBeenCalledWith(allocatedIndices);
  });

  it('clears only vegetation instances inside a single exclusion radius', async () => {
    const system = new GPUBillboardSystem(new THREE.Scene(), makeAssetLoader());
    await system.initializeFromConfig([vegetationType]);
    const vegetation = latestVegetationInstance();
    vegetation.addInstances.mockReturnValueOnce([0, 1, 2]);
    vegetation.getInstancePositions.mockReturnValue(new Float32Array([
      0, 0, 0,
      5, 0, 0,
      20, 0, 0,
    ]));

    system.addChunkInstances('chunk-a', vegetationType.id, [
      { position: new THREE.Vector3(0, 0, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
      { position: new THREE.Vector3(5, 0, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
      { position: new THREE.Vector3(20, 0, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
    ]);

    const sliceSpy = vi.spyOn(Array.prototype, 'slice');
    system.clearInstancesInArea(0, 0, 6);
    const sliceCalls = sliceSpy.mock.calls.length;
    sliceSpy.mockRestore();

    expect(sliceCalls).toBe(0);
    expect(vegetation.removeInstances).toHaveBeenCalledTimes(1);
    expect(vegetation.removeInstances).toHaveBeenCalledWith([0, 1]);

    system.removeChunkInstances('chunk-a');
    expect(vegetation.removeInstances).toHaveBeenCalledTimes(2);
    expect(vegetation.removeInstances).toHaveBeenLastCalledWith([2]);
  });

  it('keeps tracked chunk indices unchanged when a radius clear removes nothing', async () => {
    const system = new GPUBillboardSystem(new THREE.Scene(), makeAssetLoader());
    await system.initializeFromConfig([vegetationType]);
    const vegetation = latestVegetationInstance();
    const allocatedIndices = [0, 1];
    vegetation.addInstances.mockReturnValueOnce(allocatedIndices);
    vegetation.getInstancePositions.mockReturnValue(new Float32Array([
      20, 0, 0,
      30, 0, 0,
    ]));

    system.addChunkInstances('chunk-a', vegetationType.id, [
      { position: new THREE.Vector3(20, 0, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
      { position: new THREE.Vector3(30, 0, 0), scale: new THREE.Vector3(1, 1, 1), rotation: 0 },
    ]);

    system.clearInstancesInArea(0, 0, 5);

    expect(vegetation.removeInstances).not.toHaveBeenCalled();

    system.removeChunkInstances('chunk-a');
    expect(vegetation.removeInstances).toHaveBeenCalledWith(allocatedIndices);
  });
});
