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

function terrainUniforms(mat: ReturnType<typeof createTerrainMaterial>): Record<string, any> {
  return mat.userData.terrainUniforms as Record<string, any>;
}

describe('TerrainMaterial', () => {
  it('creates a terrain node material that exposes terrain uniforms', () => {
    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 512,
      splatmap: testSplatmap,
      biomeConfig: testBiomeConfig,
    });

    expect(mat).toBeDefined();
    expect(mat.isNodeMaterial).toBe(true);
    expect(mat.isKonveyerTerrainNodeMaterial).toBe(true);
    expect(mat.fog).toBe(false);
    expect(mat.positionNode).toBeDefined();
    expect(mat.normalNode).toBeDefined();
    expect(mat.colorNode).toBeDefined();
    expect(mat.roughnessNode).toBeDefined();
    const uniforms = terrainUniforms(mat);

    // Observable: the material publishes terrain-specific uniforms bound to the
    // provided world size and textures. Downstream consumers rely on these.
    expect(uniforms.terrainHeightmap).toBeDefined();
    expect(uniforms.terrainNormalMap).toBeDefined();
    expect(uniforms.terrainWorldSize.value).toBe(512);
    expect(uniforms.terrainPlayableWorldSize.value).toBe(512);
    expect(uniforms.terrainVisualMargin.value).toBe(0);
    expect(uniforms.biomeTexture0).toBeDefined();
    expect(uniforms.biomeRuleElevationBlendWidth).toBeDefined();
    expect(uniforms.cliffRockBiomeSlot.value).toBe(1);
  });

  it('binds playable and visual terrain extents for edge-only visual tinting', () => {
    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 35200,
      playableWorldSize: 32000,
      visualMargin: 1600,
      splatmap: testSplatmap,
      biomeConfig: testBiomeConfig,
    });

    const uniforms = terrainUniforms(mat);
    expect(uniforms.terrainWorldSize.value).toBe(35200);
    expect(uniforms.terrainPlayableWorldSize.value).toBe(32000);
    expect(uniforms.terrainVisualMargin.value).toBe(1600);
    expect(mat.colorNode).toBeDefined();
  });

  it('binds far-canopy tint uniforms and node graph when enabled', () => {
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

    const uniforms = terrainUniforms(mat);

    expect(uniforms.farCanopyTintEnabled.value).toBe(1);
    expect(uniforms.farCanopyTintStartDistance.value).toBe(560);
    expect(uniforms.farCanopyTintEndDistance.value).toBe(1250);
    expect(uniforms.farCanopyTintStrength.value).toBeCloseTo(0.28);
    expect(uniforms.farCanopyTintFogStrength.value).toBeCloseTo(0.72);
    expect(mat.colorNode).toBeDefined();
    expect(mat.roughnessNode).toBeDefined();
  });

  it('binds hydrology mask uniforms and node graph when a mask is available', () => {
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

    const uniforms = terrainUniforms(mat);

    expect(uniforms.hydrologyMaskEnabled.value).toBe(1);
    expect(uniforms.hydrologyMaskTextureSize.value.x).toBe(257);
    expect(uniforms.hydrologyMaskOrigin.value.x).toBe(-1520);
    expect(uniforms.hydrologyWetBiomeSlot.value).toBe(1);
    expect(uniforms.hydrologyChannelBiomeSlot.value).toBe(2);
    expect(uniforms.hydrologyWetStrength.value).toBeCloseTo(0.08);
    expect(uniforms.hydrologyChannelStrength.value).toBeCloseTo(0.14);
    expect(mat.colorNode).toBeDefined();
    expect(mat.roughnessNode).toBeDefined();
  });

  it('updateTerrainMaterialTextures refreshes uniforms and node graph', () => {
    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 1024,
      splatmap: testSplatmap,
      biomeConfig: testBiomeConfig,
    });
    const previousPositionNode = mat.positionNode;

    updateTerrainMaterialTextures(
      mat,
      makeMockTexture(),
      makeMockTexture(),
      2048,
      testBiomeConfig,
      testSplatmap,
    );

    expect(terrainUniforms(mat).terrainWorldSize.value).toBe(2048);
    expect(mat.positionNode).toBeDefined();
    expect(mat.positionNode).not.toBe(previousPositionNode);
  });

  it('updateTerrainMaterialWetness reaches through to the live shader uniform', () => {
    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 1024,
      splatmap: testSplatmap,
      biomeConfig: testBiomeConfig,
    });

    updateTerrainMaterialWetness(mat, 0.8);

    expect(terrainUniforms(mat).environmentWetness.value).toBe(0.8);
  });

  it('updateTerrainMaterialFarCanopyTint updates the live shader uniforms without recompiling', () => {
    const mat = createTerrainMaterial({
      heightTexture: makeMockTexture(),
      normalTexture: makeMockTexture(),
      worldSize: 1024,
      splatmap: testSplatmap,
      biomeConfig: testBiomeConfig,
    });

    updateTerrainMaterialFarCanopyTint(mat, {
      enabled: true,
      startDistance: 600,
      endDistance: 1600,
      strength: 0.34,
      fogStrength: 0.78,
      color: [0.11, 0.25, 0.10],
    });

    const uniforms = terrainUniforms(mat);
    expect(uniforms.farCanopyTintEnabled.value).toBe(1);
    expect(uniforms.farCanopyTintEndDistance.value).toBe(1600);
    expect(uniforms.farCanopyTintFogStrength.value).toBeCloseTo(0.78);
    expect(uniforms.farCanopyTintColor.value.g).toBeCloseTo(0.25);
  });
});
