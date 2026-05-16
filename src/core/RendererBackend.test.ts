/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  collectKonveyerNodeMaterialShaders,
  createInitialRendererCapabilities,
  resolveRendererBackendMode,
} from './RendererBackend';

const originalHref = window.location.href;

function setSearch(search: string): void {
  window.history.replaceState(null, '', `/${search}`);
}

beforeEach(() => {
  vi.stubEnv('VITE_KONVEYER_WEBGPU', '');
  vi.stubEnv('VITE_KONVEYER_FORCE_WEBGL', '');
  vi.stubEnv('VITE_KONVEYER_WEBGPU_STRICT', '');
  setSearch('');
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', originalHref);
});

describe('resolveRendererBackendMode', () => {
  it('requests WebGPU as the default runtime backend', () => {
    expect(resolveRendererBackendMode()).toBe('webgpu');
  });

  it('selects the experimental WebGPU backend from the renderer query param', () => {
    setSearch('?renderer=webgpu');
    expect(resolveRendererBackendMode()).toBe('webgpu');
  });

  it('allows explicit legacy WebGL selection from the renderer query param', () => {
    setSearch('?renderer=webgl');
    expect(resolveRendererBackendMode()).toBe('webgl');
  });

  it('selects the forced-WebGL negative diagnostic mode from the renderer query param', () => {
    setSearch('?renderer=webgpu-force-webgl');
    expect(resolveRendererBackendMode()).toBe('webgpu-force-webgl');
  });

  it('selects strict WebGPU proof mode when fallback would hide migration failures', () => {
    setSearch('?renderer=webgpu-strict');
    expect(resolveRendererBackendMode()).toBe('webgpu-strict');
  });

  it('allows build-time legacy WebGL opt-out for compatibility runs', () => {
    vi.stubEnv('VITE_KONVEYER_WEBGPU', '0');
    expect(resolveRendererBackendMode()).toBe('webgl');
  });

  it('allows explicit build-time force-WebGL compatibility runs', () => {
    vi.stubEnv('VITE_KONVEYER_FORCE_WEBGL', '1');
    expect(resolveRendererBackendMode()).toBe('webgl');
  });

  it('allows build-time strict proof opt-in for migration gates', () => {
    vi.stubEnv('VITE_KONVEYER_WEBGPU', '1');
    vi.stubEnv('VITE_KONVEYER_WEBGPU_STRICT', '1');
    expect(resolveRendererBackendMode()).toBe('webgpu-strict');
  });
});

describe('createInitialRendererCapabilities', () => {
  it('records explicit WebGL diagnostic mode as ready', () => {
    const caps = createInitialRendererCapabilities('webgl');
    expect(caps.requestedMode).toBe('webgl');
    expect(caps.resolvedBackend).toBe('webgl');
    expect(caps.initStatus).toBe('ready');
  });

  it('records WebGPU selection as pending until async renderer init finishes', () => {
    const caps = createInitialRendererCapabilities('webgpu');
    expect(caps.requestedMode).toBe('webgpu');
    expect(caps.resolvedBackend).toBe('unknown');
    expect(caps.initStatus).toBe('pending');
    expect(caps.strictWebGPU).toBe(false);
  });

  it('marks strict WebGPU proof mode as pending and non-fallbackable', () => {
    const caps = createInitialRendererCapabilities('webgpu-strict');
    expect(caps.requestedMode).toBe('webgpu-strict');
    expect(caps.resolvedBackend).toBe('unknown');
    expect(caps.initStatus).toBe('pending');
    expect(caps.strictWebGPU).toBe(true);
  });
});

describe('collectKonveyerNodeMaterialShaders', () => {
  // Synthetic fragment GLSL approximating the shape of a TSL-emitted
  // terrain fragment. Used to verify the helper's sampler/uniform/
  // instruction counters report the metrics that the probe ranks against.
  // Tests behavior (metrics over compiled GLSL strings), not the helper's
  // private regexes. The R3 probe asserts ratios across pre/post-fix runs;
  // these unit tests only check that the counters move in the right
  // direction for known inputs.
  const FAKE_TERRAIN_FRAG_UNROLLED = `#version 300 es
precision highp float;
uniform sampler2D biomeTexture0;
uniform sampler2D biomeTexture1;
uniform sampler2D biomeTexture2;
uniform sampler2D biomeTexture3;
uniform sampler2D biomeTexture4;
uniform sampler2D biomeTexture5;
uniform sampler2D biomeTexture6;
uniform sampler2D biomeTexture7;
uniform sampler2D terrainNormalMap;
uniform float biomeSlot;
uniform vec3 lightColor;
void main() {
  vec4 a = texture(biomeTexture0, vec2(0.0));
  vec4 b = texture(biomeTexture1, vec2(0.0));
  vec4 c = texture(biomeTexture2, vec2(0.0));
  vec4 d = texture(biomeTexture3, vec2(0.0));
  vec4 e = texture(biomeTexture4, vec2(0.0));
  vec4 f = texture(biomeTexture5, vec2(0.0));
  vec4 g = texture(biomeTexture6, vec2(0.0));
  vec4 h = texture(biomeTexture7, vec2(0.0));
  gl_FragColor = (a + b + c + d + e + f + g + h);
}
`;

  const FAKE_TERRAIN_FRAG_EARLY_OUT = `#version 300 es
precision highp float;
uniform sampler2D biomeTexture0;
uniform sampler2D terrainNormalMap;
uniform float biomeSlot;
uniform vec3 lightColor;
void main() {
  vec4 r;
  if (biomeSlot < 0.5) {
    r = texture(biomeTexture0, vec2(0.0));
  }
  gl_FragColor = r;
}
`;

  type TaggedMaterial = THREE.Material & {
    _latestBuilder?: { fragmentShader?: string; vertexShader?: string };
    isKonveyerTerrainNodeMaterial?: boolean;
    isKonveyerNpcImpostorNodeMaterial?: boolean;
    isKonveyerBillboardNodeMaterial?: boolean;
  };

  function makeTaggedMaterial(
    marker: 'isKonveyerTerrainNodeMaterial' | 'isKonveyerNpcImpostorNodeMaterial' | 'isKonveyerBillboardNodeMaterial',
    fragmentShader: string | undefined,
  ): TaggedMaterial {
    const material = new THREE.MeshBasicMaterial() as TaggedMaterial;
    material[marker] = true;
    if (fragmentShader !== undefined) {
      material._latestBuilder = { fragmentShader, vertexShader: '#version 300 es\nvoid main() { gl_Position = vec4(0); }\n' };
    }
    return material;
  }

  function makeFakeRenderer(): any {
    // Helper only uses `renderer._nodes.nodeBuilderCache` as a Map; supply
    // an empty one so the helper falls through to the `material._latestBuilder`
    // path. This proves the helper does not require WebGPU at all.
    return {
      _nodes: { nodeBuilderCache: new Map() },
    };
  }

  function materialRecords(records: ReturnType<typeof collectKonveyerNodeMaterialShaders>) {
    return records.filter((r): r is Extract<typeof r, { kind: 'material' }> => r.kind === 'material');
  }
  function cacheRecords(records: ReturnType<typeof collectKonveyerNodeMaterialShaders>) {
    return records.filter((r): r is Extract<typeof r, { kind: 'cacheEntry' }> => r.kind === 'cacheEntry');
  }

  it('returns nothing when the scene has no Konveyer-tagged materials and the cache is empty', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    scene.add(mesh);
    const records = collectKonveyerNodeMaterialShaders(makeFakeRenderer(), scene);
    expect(records).toEqual([]);
  });

  it('reports one material record per uniquely-tagged TSL material instance', () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      makeTaggedMaterial('isKonveyerTerrainNodeMaterial', FAKE_TERRAIN_FRAG_UNROLLED),
    ));
    scene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      makeTaggedMaterial('isKonveyerBillboardNodeMaterial', FAKE_TERRAIN_FRAG_EARLY_OUT),
    ));
    const records = materialRecords(collectKonveyerNodeMaterialShaders(makeFakeRenderer(), scene));
    expect(records).toHaveLength(2);
    const markers = records.map((r) => r.marker).sort();
    expect(markers).toEqual(['isKonveyerBillboardNodeMaterial', 'isKonveyerTerrainNodeMaterial']);
  });

  it('deduplicates a material instance shared across multiple meshes', () => {
    const scene = new THREE.Scene();
    const shared = makeTaggedMaterial('isKonveyerTerrainNodeMaterial', FAKE_TERRAIN_FRAG_UNROLLED);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shared));
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shared));
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shared));
    const records = materialRecords(collectKonveyerNodeMaterialShaders(makeFakeRenderer(), scene));
    expect(records).toHaveLength(1);
    expect(records[0].uuid).toBe(shared.uuid);
  });

  it('reports a higher fragment sampler count for the unrolled biome chain than the early-out variant', () => {
    const scene = new THREE.Scene();
    const unrolled = makeTaggedMaterial('isKonveyerTerrainNodeMaterial', FAKE_TERRAIN_FRAG_UNROLLED);
    const earlyOut = makeTaggedMaterial('isKonveyerBillboardNodeMaterial', FAKE_TERRAIN_FRAG_EARLY_OUT);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), unrolled));
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), earlyOut));
    const records = materialRecords(collectKonveyerNodeMaterialShaders(makeFakeRenderer(), scene));
    const u = records.find((r) => r.marker === 'isKonveyerTerrainNodeMaterial')!;
    const e = records.find((r) => r.marker === 'isKonveyerBillboardNodeMaterial')!;
    expect(u.fragmentSamplerCount!).toBeGreaterThan(e.fragmentSamplerCount!);
    // Behavior: the ratio is significant (R1 fix-cycle target floor is 4x).
    expect(u.fragmentSamplerCount! / Math.max(1, e.fragmentSamplerCount!)).toBeGreaterThanOrEqual(4);
  });

  it('records `shaderSource: "none"` when the material has no compiled builder yet', () => {
    const scene = new THREE.Scene();
    const material = makeTaggedMaterial('isKonveyerTerrainNodeMaterial', undefined);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));
    const records = materialRecords(collectKonveyerNodeMaterialShaders(makeFakeRenderer(), scene));
    expect(records).toHaveLength(1);
    expect(records[0].shaderSource).toBe('none');
    expect(records[0].fragmentShader).toBeNull();
    expect(records[0].fragmentSamplerCount).toBeNull();
  });

  it('reports cache entries from `renderer._nodes.nodeBuilderCache` independently of scene materials', () => {
    const scene = new THREE.Scene();
    // No tagged materials in the scene, but the renderer cache contains
    // two compiled entries. The cache-entry side of the helper still
    // surfaces both with sampler/uniform/instruction counts.
    const renderer = {
      _nodes: { nodeBuilderCache: new Map<number, { fragmentShader: string; vertexShader: string }>() },
    } as any;
    renderer._nodes.nodeBuilderCache.set(1, { fragmentShader: FAKE_TERRAIN_FRAG_UNROLLED, vertexShader: '#version 300 es\nvoid main(){}' });
    renderer._nodes.nodeBuilderCache.set(2, { fragmentShader: FAKE_TERRAIN_FRAG_EARLY_OUT, vertexShader: '#version 300 es\nvoid main(){}' });
    const records = cacheRecords(collectKonveyerNodeMaterialShaders(renderer, scene));
    expect(records).toHaveLength(2);
    // Behavior: cache-entry records expose the same per-shader metrics.
    expect(Math.max(...records.map((r) => r.fragmentSamplerCount ?? 0)))
      .toBeGreaterThanOrEqual(8);
    expect(Math.min(...records.map((r) => r.fragmentSamplerCount ?? 0)))
      .toBeLessThanOrEqual(2);
  });
});
