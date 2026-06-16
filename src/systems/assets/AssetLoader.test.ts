// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AssetCategory, type AssetInfo } from '../../types';
import { Logger } from '../../utils/Logger';
import { AssetLoader } from './AssetLoader';

type AssetLoaderInternals = {
  assets: Map<string, AssetInfo>;
  loadedTextures: Map<string, THREE.Texture>;
};

function seedTexture(loader: AssetLoader, name: string, texture: THREE.Texture): void {
  const internals = loader as unknown as AssetLoaderInternals;
  internals.assets.set(name, {
    name,
    path: `/assets/${name}.png`,
    category: AssetCategory.FOLIAGE,
  });
  internals.loadedTextures.set(name, texture);
}

function makeTexture(width: number, height: number): THREE.Texture {
  const texture = new THREE.Texture();
  texture.image = { width, height } as HTMLImageElement;
  return texture;
}

describe('AssetLoader GPU texture warmup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    performance.clearMarks();
    performance.clearMeasures();
  });

  it('configures terrain ground albedo textures as sRGB repeatable mipmapped surfaces', () => {
    const loader = new AssetLoader();
    const texture = makeTexture(512, 512);
    const versionBefore = texture.version;

    (loader as unknown as {
      configureTextureForCategory(texture: THREE.Texture, category: AssetCategory): void;
    }).configureTextureForCategory(texture, AssetCategory.GROUND);

    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.version).toBeGreaterThan(versionBefore);
  });

  it('defers Pixel Forge foliage atlas decode out of boot-critical texture init', async () => {
    const loader = new AssetLoader();
    const loadTexture = vi
      .spyOn(loader as unknown as { loadTexture(path: string): Promise<THREE.Texture> }, 'loadTexture')
      .mockImplementation(async () => makeTexture(1, 1));

    await loader.init();

    const loadedPaths = loadTexture.mock.calls.map(([path]) => path);
    expect(loadedPaths.some(path => path.includes('jungle-floor.webp'))).toBe(true);
    expect(loadedPaths.some(path => path.includes('pixel-forge/npcs/usArmy/idle/animated-albedo-packed.png'))).toBe(true);
    expect(loadedPaths.some(path => path.includes('pixel-forge/npcs/usArmy/advance_fire/animated-albedo-packed.png'))).toBe(false);
    expect(loadedPaths.some(path => path.includes('pixel-forge/vegetation/'))).toBe(false);
    expect(loader.getTexture('PixelForge.Vegetation.fanPalm.color')).toBeUndefined();
    expect(loader.getTexture('PixelForge.NPC.US.idle.color')).toBeInstanceOf(THREE.Texture);
    expect(loader.getTexture('PixelForge.NPC.US.advance_fire.color')).toBeUndefined();
  });

  it('loads deferred texture names on demand once assets are registered', async () => {
    const loader = new AssetLoader();
    const loadTexture = vi
      .spyOn(loader as unknown as { loadTexture(path: string): Promise<THREE.Texture> }, 'loadTexture')
      .mockImplementation(async () => makeTexture(1, 1));

    await loader.init();
    loadTexture.mockClear();

    const progress: Array<[number, number]> = [];
    await loader.ensureTexturesLoaded(
      [
        'PixelForge.Vegetation.fanPalm.color',
        'PixelForge.Vegetation.fanPalm.color',
      ],
      (loaded, total) => progress.push([loaded, total]),
    );

    expect(loadTexture).toHaveBeenCalledTimes(1);
    expect(loadTexture.mock.calls[0]?.[0]).toContain('pixel-forge/vegetation/fanPalm/');
    expect(loader.getTexture('PixelForge.Vegetation.fanPalm.color')).toBeInstanceOf(THREE.Texture);
    expect(progress).toEqual([[1, 1]]);
  });

  it('can batch deferred texture loads and yield between batches', async () => {
    const loader = new AssetLoader();
    const loadOrder: string[] = [];
    vi.spyOn(loader as unknown as { loadTexture(path: string): Promise<THREE.Texture> }, 'loadTexture')
      .mockImplementation(async (path: string) => {
        loadOrder.push(path);
        return makeTexture(1, 1);
      });

    await loader.init();
    loadOrder.length = 0;
    const yields: number[] = [];
    const progress: Array<[number, number]> = [];

    await loader.ensureTexturesLoaded(
      [
        'PixelForge.Vegetation.fanPalm.color',
        'PixelForge.Vegetation.fanPalm.normal',
        'PixelForge.Vegetation.bananaPlant.color',
      ],
      (loaded, total) => progress.push([loaded, total]),
      {
        batchSize: 2,
        afterBatch: async () => {
          yields.push(loadOrder.length);
        },
      },
    );

    expect(loadOrder).toHaveLength(3);
    expect(yields).toEqual([2]);
    expect(progress.at(-1)).toEqual([3, 3]);
  });

  it('loads non-startup NPC impostor atlases during mode startup preparation', async () => {
    const loader = new AssetLoader();
    const loadTexture = vi
      .spyOn(loader as unknown as { loadTexture(path: string): Promise<THREE.Texture> }, 'loadTexture')
      .mockImplementation(async () => makeTexture(1, 1));

    await loader.init();
    loadTexture.mockClear();

    const progress: Array<[number, number]> = [];
    await loader.ensurePixelForgeNpcImpostorTexturesLoaded((loaded, total) => {
      progress.push([loaded, total]);
    });

    const loadedPaths = loadTexture.mock.calls.map(([path]) => path);
    expect(loadedPaths.some(path => path.includes('pixel-forge/npcs/usArmy/idle/'))).toBe(false);
    expect(loadedPaths.some(path => path.includes('pixel-forge/npcs/usArmy/advance_fire/'))).toBe(true);
    expect(loadedPaths.some(path => path.includes('pixel-forge/npcs/vc/death_fall_back/'))).toBe(true);
    expect(loadedPaths.some(path => path.includes('pixel-forge/vegetation/'))).toBe(false);
    expect(loader.getTexture('PixelForge.NPC.US.advance_fire.color')).toBeInstanceOf(THREE.Texture);
    expect(progress.at(-1)).toEqual([28, 28]);
  });

  it('uploads requested loaded textures and records texture residency metadata', () => {
    const loader = new AssetLoader();
    const texture = makeTexture(4096, 2048);
    const name = 'PixelForge.Vegetation.fanPalm.color';
    seedTexture(loader, name, texture);
    const renderer = { initTexture: vi.fn() } as unknown as THREE.WebGLRenderer;

    const summary = loader.warmGpuTextures(renderer, [name, 'PixelForge.Missing']);

    expect(renderer.initTexture).toHaveBeenCalledWith(texture);
    expect(summary.requested).toBe(2);
    expect(summary.uploaded).toBe(1);
    expect(summary.missing).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.missingNames).toEqual(['PixelForge.Missing']);
    expect(summary.entries[0]).toMatchObject({
      name,
      path: `/assets/${name}.png`,
      category: AssetCategory.FOLIAGE,
      width: 4096,
      height: 2048,
      estimatedMipmappedMiB: 42.67,
      status: 'uploaded',
    });
  });

  it('keeps startup resilient when a renderer upload fails', () => {
    const loader = new AssetLoader();
    const name = 'PixelForge.Vegetation.fanPalm.normal';
    seedTexture(loader, name, makeTexture(4096, 2048));
    vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const renderer = {
      initTexture: vi.fn(() => {
        throw new Error('upload failed');
      }),
    } as unknown as THREE.WebGLRenderer;

    const summary = loader.warmGpuTextures(renderer, [name]);

    expect(summary.uploaded).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.entries[0]).toMatchObject({
      name,
      status: 'failed',
      error: 'upload failed',
    });
  });
});
