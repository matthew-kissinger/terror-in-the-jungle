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
    getTexture: vi.fn((name: string) => textures.get(name)),
  } as unknown as AssetLoader;
}

function latestVegetationConfig() {
  const mocked = vi.mocked(GPUBillboardVegetation);
  return mocked.mock.calls.at(-1)?.[1];
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
    const system = new GPUBillboardSystem(new THREE.Scene(), makeAssetLoader());

    await system.initializeFromConfig([vegetationType]);

    const config = latestVegetationConfig();
    expect(config?.normalTexture).toBeDefined();
    expect(config?.shaderProfile).toBe('normal-lit');
  });

  it('does not fetch unused normal textures for hemisphere-profile vegetation', async () => {
    const assetLoader = makeAssetLoader();
    const system = new GPUBillboardSystem(new THREE.Scene(), assetLoader);

    await system.initializeFromConfig([hemisphereVegetationType]);

    const config = latestVegetationConfig();
    expect(config?.normalTexture).toBeUndefined();
    expect(config?.shaderProfile).toBe('hemisphere');
    expect(assetLoader.getTexture).toHaveBeenCalledWith(hemisphereVegetationType.textureName);
    expect(assetLoader.getTexture).not.toHaveBeenCalledWith(hemisphereVegetationType.normalTextureName);
  });

  it('can disable vegetation normals for KB-LOAD candidate proof runs', async () => {
    (globalThis as { __KB_LOAD_DISABLE_VEGETATION_NORMALS__?: boolean }).__KB_LOAD_DISABLE_VEGETATION_NORMALS__ = true;
    const system = new GPUBillboardSystem(new THREE.Scene(), makeAssetLoader());

    await system.initializeFromConfig([vegetationType]);

    const config = latestVegetationConfig();
    expect(config?.normalTexture).toBeUndefined();
    expect(config?.shaderProfile).toBe('hemisphere');
  });
});
