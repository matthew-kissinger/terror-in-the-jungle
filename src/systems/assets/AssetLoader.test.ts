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
