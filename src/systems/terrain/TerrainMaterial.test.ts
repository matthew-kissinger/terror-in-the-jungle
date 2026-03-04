import { describe, it, expect, vi } from 'vitest';

// Mock Three.js
vi.mock('three', () => ({
  MeshStandardMaterial: class {
    color = 0;
    roughness = 0;
    metalness = 0;
    flatShading = false;
    needsUpdate = false;
    onBeforeCompile: any = null;
    constructor(opts: any = {}) {
      Object.assign(this, opts);
    }
    dispose = vi.fn();
  },
  Color: class {
    constructor(public hex: number) {}
  },
}));

import { createTerrainMaterial, updateTerrainMaterialTextures } from './TerrainMaterial';
import type { SplatmapConfig } from './TerrainConfig';

function makeMockTexture(): any {
  return { needsUpdate: false, dispose: vi.fn() };
}

const testBiomeConfig = {
  layers: [
    { biomeId: 'denseJungle', texture: makeMockTexture(), tileScale: 0.1, roughness: 0.85 },
    { biomeId: 'highland', texture: makeMockTexture(), tileScale: 0.08, roughness: 0.78 },
  ],
  rules: [
    { biomeSlot: 1, elevationMin: 900, elevationMax: 2000, minUpDot: 0.7, priority: 2 },
  ],
};

const testSplatmap: SplatmapConfig = {
  layers: [
    { id: 'grass', albedoColor: 0x3a5f0b, roughness: 0.85, metalness: 0, tileScale: 0.1 },
    { id: 'dirt', albedoColor: 0x6b4423, roughness: 0.9, metalness: 0, tileScale: 0.12 },
    { id: 'rock', albedoColor: 0x808080, roughness: 0.75, metalness: 0.05, tileScale: 0.08 },
    { id: 'sand', albedoColor: 0xc2b280, roughness: 0.95, metalness: 0, tileScale: 0.15 },
  ],
  triplanarSlopeThreshold: 0.707,
  antiTilingStrength: 0.3,
};

describe('TerrainMaterial', () => {
  it('creates a MeshStandardMaterial', () => {
    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 1024,
      splatmap: testSplatmap,
      biomeConfig: testBiomeConfig,
    });

    expect(mat).toBeDefined();
    expect(mat.onBeforeCompile).toBeDefined();
  });

  it('onBeforeCompile injects terrain uniforms', () => {
    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 512,
      splatmap: testSplatmap,
      biomeConfig: testBiomeConfig,
    });

    // Simulate shader compilation
    const shader = {
      uniforms: {} as Record<string, any>,
      vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>\n#include <normal_fragment_begin>',
    };

    mat.onBeforeCompile(shader as any, null as any);

    expect(shader.uniforms.terrainHeightmap).toBeDefined();
    expect(shader.uniforms.terrainNormalMap).toBeDefined();
    expect(shader.uniforms.terrainWorldSize.value).toBe(512);
    expect(shader.uniforms.biomeTexture0).toBeDefined();
    expect(shader.uniforms.biomeRuleBiomeSlot).toBeDefined();
    expect(shader.uniforms.antiTilingStrength.value).toBe(0.3);
    expect(shader.uniforms.triplanarSlopeThreshold.value).toBe(0.707);
    expect(shader.fragmentShader).toContain('sampleBiomeTriplanar');
  });

  it('updateTerrainMaterialTextures replaces textures', () => {
    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 1024,
      splatmap: testSplatmap,
      biomeConfig: testBiomeConfig,
    });

    const newHeight = makeMockTexture();
    const newNormal = makeMockTexture();
    updateTerrainMaterialTextures(mat, newHeight, newNormal, 2048, testBiomeConfig, testSplatmap);

    // The material should be marked for recompile
    expect(mat.needsUpdate).toBe(true);
  });
});
