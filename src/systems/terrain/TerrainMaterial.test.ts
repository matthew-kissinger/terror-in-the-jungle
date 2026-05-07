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
    r = 0;
    g = 0;
    b = 0;
    constructor(r = 0, g?: number, b?: number) {
      if (g === undefined || b === undefined) {
        this.r = r;
        this.g = r;
        this.b = r;
      } else {
        this.r = r;
        this.g = g;
        this.b = b;
      }
    }
    setRGB(r: number, g: number, b: number) {
      this.r = r;
      this.g = g;
      this.b = b;
      return this;
    }
  },
  Vector2: class {
    x = 0;
    y = 0;
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
  },
  MathUtils: {
    clamp: (value: number, min: number, max: number) => Math.min(Math.max(value, min), max),
  },
}));

import {
  createTerrainMaterial,
  updateTerrainMaterialFarCanopyTint,
  updateTerrainMaterialTextures,
  updateTerrainMaterialWetness,
} from './TerrainMaterial';
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
  cliffRockBiomeSlot: 1,
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

function makeShader() {
  return {
    uniforms: {} as Record<string, any>,
    vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_begin>\n#include <fog_fragment>',
  };
}

describe('TerrainMaterial', () => {
  it('creates a terrain material that exposes terrain uniforms after shader compile', () => {
    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 512,
      splatmap: testSplatmap,
      biomeConfig: testBiomeConfig,
    });

    expect(mat).toBeDefined();
    expect(mat.onBeforeCompile).toBeDefined();

    const shader = makeShader();
    mat.onBeforeCompile(shader as any, null as any);

    // Observable: the material publishes terrain-specific uniforms bound to the
    // provided world size and textures. Downstream consumers rely on these.
    expect(shader.uniforms.terrainHeightmap).toBeDefined();
    expect(shader.uniforms.terrainNormalMap).toBeDefined();
    expect(shader.uniforms.terrainWorldSize.value).toBe(512);
    expect(shader.uniforms.biomeTexture0).toBeDefined();
    expect(shader.uniforms.biomeRuleElevationBlendWidth).toBeDefined();
    expect(shader.uniforms.cliffRockBiomeSlot.value).toBe(1);
  });

  it('binds far-canopy tint uniforms and shader logic when enabled', () => {
    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 3200,
      splatmap: testSplatmap,
      biomeConfig: testBiomeConfig,
      farCanopyTint: {
        enabled: true,
        startDistance: 560,
        endDistance: 1250,
        strength: 0.28,
        fogStrength: 0.72,
        color: [0.12, 0.26, 0.11],
      },
    });

    const shader = makeShader();
    mat.onBeforeCompile(shader as any, null as any);

    expect(shader.uniforms.farCanopyTintEnabled.value).toBe(1);
    expect(shader.uniforms.farCanopyTintStartDistance.value).toBe(560);
    expect(shader.uniforms.farCanopyTintEndDistance.value).toBe(1250);
    expect(shader.uniforms.farCanopyTintStrength.value).toBeCloseTo(0.28);
    expect(shader.uniforms.farCanopyTintFogStrength.value).toBeCloseTo(0.72);
    expect(shader.fragmentShader).toContain('applyFarCanopyTint');
    expect(shader.fragmentShader).toContain('distance(cameraPosition.xz, worldPos)');
    expect(shader.fragmentShader).toContain('farCanopyFogMask');
    expect(shader.fragmentShader).toContain('gl_FragColor.rgb = mix(gl_FragColor.rgb, foggedCanopy');
  });

  it('binds hydrology mask uniforms and shader logic when a mask is available', () => {
    const hydrologyBiomeConfig = {
      layers: [
        { biomeId: 'denseJungle', texture: makeMockTexture(), tileScale: 0.1, roughness: 0.85 },
        { biomeId: 'swamp', texture: makeMockTexture(), tileScale: 0.12, roughness: 0.96 },
        { biomeId: 'riverbank', texture: makeMockTexture(), tileScale: 0.11, roughness: 0.9 },
      ],
      rules: [],
      cliffRockBiomeSlot: 0,
    };

    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 3200,
      splatmap: testSplatmap,
      biomeConfig: hydrologyBiomeConfig,
      hydrologyMask: {
        texture: makeMockTexture(),
        width: 257,
        height: 257,
        originX: -1520,
        originZ: -1520,
        cellSizeMeters: 12,
        wetBiomeId: 'swamp',
        channelBiomeId: 'riverbank',
      },
    });

    const shader = makeShader();
    mat.onBeforeCompile(shader as any, null as any);

    expect(shader.uniforms.hydrologyMaskEnabled.value).toBe(1);
    expect(shader.uniforms.hydrologyMaskTextureSize.value.x).toBe(257);
    expect(shader.uniforms.hydrologyMaskOrigin.value.x).toBe(-1520);
    expect(shader.uniforms.hydrologyWetBiomeSlot.value).toBe(1);
    expect(shader.uniforms.hydrologyChannelBiomeSlot.value).toBe(2);
    expect(shader.uniforms.hydrologyWetStrength.value).toBeCloseTo(0.08);
    expect(shader.uniforms.hydrologyChannelStrength.value).toBeCloseTo(0.14);
    expect(shader.fragmentShader).toContain('sampleHydrologyMask');
    expect(shader.fragmentShader).toContain('applyHydrologyBiomeBlend');
    expect(shader.fragmentShader).toContain('secondaryBlend = clamp(1.0 - hydrologyWeight');
  });

  it('updateTerrainMaterialTextures marks the material dirty for shader recompile', () => {
    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 1024,
      splatmap: testSplatmap,
      biomeConfig: testBiomeConfig,
    });

    updateTerrainMaterialTextures(
      mat,
      makeMockTexture(),
      makeMockTexture(),
      2048,
      testBiomeConfig,
      testSplatmap,
    );

    expect(mat.needsUpdate).toBe(true);
  });

  it('updateTerrainMaterialWetness reaches through to the live shader uniform', () => {
    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 1024,
      splatmap: testSplatmap,
      biomeConfig: testBiomeConfig,
    });

    const shader = makeShader();
    mat.onBeforeCompile(shader as any, null as any);
    updateTerrainMaterialWetness(mat, 0.8);

    expect(shader.uniforms.environmentWetness.value).toBe(0.8);
  });

  it('updateTerrainMaterialFarCanopyTint updates the live shader uniforms without recompiling', () => {
    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 1024,
      splatmap: testSplatmap,
      biomeConfig: testBiomeConfig,
    });

    const shader = makeShader();
    mat.onBeforeCompile(shader as any, null as any);
    updateTerrainMaterialFarCanopyTint(mat, {
      enabled: true,
      startDistance: 600,
      endDistance: 1600,
      strength: 0.34,
      fogStrength: 0.78,
      color: [0.11, 0.25, 0.10],
    });

    expect(shader.uniforms.farCanopyTintEnabled.value).toBe(1);
    expect(shader.uniforms.farCanopyTintEndDistance.value).toBe(1600);
    expect(shader.uniforms.farCanopyTintFogStrength.value).toBeCloseTo(0.78);
    expect(shader.uniforms.farCanopyTintColor.value.g).toBeCloseTo(0.25);
  });
});
