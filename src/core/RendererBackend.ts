import * as THREE from 'three';
import { WebGLNodesHandler } from 'three/addons/tsl/WebGLNodesHandler.js';

export type RendererBackendMode = 'webgl' | 'webgpu' | 'webgpu-force-webgl' | 'webgpu-strict';
export type ResolvedRendererBackend = 'webgl' | 'webgpu' | 'webgpu-webgl-fallback' | 'unknown';
export type RendererInitStatus = 'ready' | 'pending' | 'fallback-webgl' | 'failed';

export interface RendererBackendCapabilities {
  requestedMode: RendererBackendMode;
  resolvedBackend: ResolvedRendererBackend;
  initStatus: RendererInitStatus;
  isWebGPURenderer: boolean;
  forceWebGL: boolean;
  strictWebGPU: boolean;
  navigatorGpuAvailable: boolean;
  adapterAvailable: boolean | null;
  adapterName: string | null;
  adapterFeatures: string[];
  adapterLimits: Record<string, number | string | boolean | null>;
  error: string | null;
  notes: string[];
}

export type CommonRenderer = THREE.WebGLRenderer & {
  init?: () => Promise<unknown>;
  hasInitialized?: () => boolean;
  isWebGPURenderer?: boolean;
  backend?: {
    isWebGPUBackend?: boolean;
    isWebGLBackend?: boolean;
  };
};

type WebGLRendererWithNodes = THREE.WebGLRenderer & {
  setNodesHandler?: (handler: WebGLNodesHandler) => void;
};

type NavigatorGpuAdapter = {
  features?: Iterable<string>;
  limits?: Record<string, unknown>;
  info?: {
    description?: string;
    device?: string;
    vendor?: string;
  };
};

type NavigatorWithGpu = Navigator & {
  gpu?: {
    requestAdapter?: (options?: { powerPreference?: 'low-power' | 'high-performance' }) => Promise<NavigatorGpuAdapter | null>;
  };
};

const WEBGPU_LIMIT_NAMES = [
  'maxTextureDimension2D',
  'maxBindGroups',
  'maxBufferSize',
  'maxStorageBufferBindingSize',
  'maxUniformBufferBindingSize',
  'maxVertexBuffers',
  'maxVertexAttributes',
  'maxComputeWorkgroupStorageSize',
  'maxComputeInvocationsPerWorkgroup',
  'maxComputeWorkgroupsPerDimension',
] as const;

export function resolveRendererBackendMode(): RendererBackendMode {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get('renderer') ?? params.get('webgpu') ?? '').toLowerCase();
    if (requested === 'webgpu' || requested === '1' || requested === 'true') {
      return 'webgpu';
    }
    if (requested === 'webgl' || requested === '0' || requested === 'false') {
      return 'webgl';
    }
    if (requested === 'webgpu-strict' || requested === 'strict') {
      return 'webgpu-strict';
    }
    if (
      requested === 'webgpu-force-webgl'
      || requested === 'force-webgl'
      || requested === 'fallback'
    ) {
      return 'webgpu-force-webgl';
    }
  }

  if (import.meta.env.VITE_KONVEYER_WEBGPU_STRICT === '1') {
    return 'webgpu-strict';
  }
  if (
    import.meta.env.VITE_KONVEYER_WEBGPU === '0'
    || import.meta.env.VITE_KONVEYER_FORCE_WEBGL === '1'
  ) {
    return 'webgl';
  }
  return 'webgpu';
}

export function createWebGLRenderer(preserveDrawingBuffer: boolean): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer,
  });
  const rendererWithNodes = renderer as WebGLRendererWithNodes;
  rendererWithNodes.setNodesHandler?.(new WebGLNodesHandler());
  return rendererWithNodes;
}

export function createInitialRendererCapabilities(
  requestedMode: RendererBackendMode,
): RendererBackendCapabilities {
  return {
    requestedMode,
    resolvedBackend: requestedMode === 'webgl' ? 'webgl' : 'unknown',
    initStatus: requestedMode === 'webgl' ? 'ready' : 'pending',
    isWebGPURenderer: false,
    forceWebGL: requestedMode === 'webgpu-force-webgl',
    strictWebGPU: requestedMode === 'webgpu-strict',
    navigatorGpuAvailable: getNavigatorGpuAvailable(),
    adapterAvailable: null,
    adapterName: null,
    adapterFeatures: [],
    adapterLimits: {},
    error: null,
    notes: requestedMode === 'webgl'
      ? ['Explicit WebGL diagnostic renderer selected.']
      : [requestedMode === 'webgpu-strict'
        ? 'Strict WebGPU proof mode requested; backend fallback must fail loudly.'
        : 'WebGPU renderer requested; WebGL fallback is disabled for KONVEYER proof.'],
  };
}

export async function createWebGPURenderer(
  requestedMode: Extract<RendererBackendMode, 'webgpu' | 'webgpu-force-webgl' | 'webgpu-strict'>,
): Promise<{ renderer: CommonRenderer; capabilities: RendererBackendCapabilities }> {
  const webgpuModule = await import('three/webgpu');
  const renderer = new webgpuModule.WebGPURenderer({
    antialias: true,
    powerPreference: 'high-performance',
    forceWebGL: requestedMode === 'webgpu-force-webgl',
  }) as unknown as CommonRenderer;

  const adapter = await collectNavigatorWebGPUCapabilities();

  return {
    renderer,
    capabilities: {
      requestedMode,
      resolvedBackend: 'unknown',
      initStatus: 'pending',
      isWebGPURenderer: true,
      forceWebGL: requestedMode === 'webgpu-force-webgl',
      strictWebGPU: requestedMode === 'webgpu-strict',
      navigatorGpuAvailable: adapter.navigatorGpuAvailable,
      adapterAvailable: adapter.adapterAvailable,
      adapterName: adapter.adapterName,
      adapterFeatures: adapter.adapterFeatures,
      adapterLimits: adapter.adapterLimits,
      error: adapter.error,
      notes: adapter.notes,
    },
  };
}

export async function initializeCommonRenderer(renderer: CommonRenderer): Promise<void> {
  if (typeof renderer.init === 'function' && renderer.hasInitialized?.() !== true) {
    await renderer.init();
  }
}

export function inspectResolvedRendererBackend(renderer: CommonRenderer): ResolvedRendererBackend {
  if (renderer.backend?.isWebGPUBackend === true) return 'webgpu';
  if (renderer.backend?.isWebGLBackend === true) {
    return renderer.isWebGPURenderer ? 'webgpu-webgl-fallback' : 'webgl';
  }
  return renderer.isWebGPURenderer ? 'unknown' : 'webgl';
}

export function isWebGPURenderer(renderer: THREE.WebGLRenderer): boolean {
  return (renderer as CommonRenderer).isWebGPURenderer === true;
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * TSL node-material debug record produced by {@link collectKonveyerNodeMaterialShaders}.
 *
 * Two record kinds:
 *
 * 1. `kind: 'material'` — one per unique `isKonveyer*NodeMaterial`-tagged
 *    material instance found in the scene. Identifies the material and (best
 *    effort) attaches the compiled GLSL when the classic
 *    `WebGLRenderer + WebGLNodesHandler` path is in use (which writes
 *    `_latestBuilder` directly onto the material).
 * 2. `kind: 'cacheEntry'` — one per entry in
 *    `renderer._nodes.nodeBuilderCache`. The TSL backend mangles uniform
 *    and sampler names (`nodeUniform0`, etc.), so we cannot correlate a
 *    cache entry back to a specific material on the WebGPURenderer +
 *    WebGL2-fallback path. Sampler counts alone discriminate terrain
 *    (~10–12 samplers) from impostor/billboard (~2–4 samplers); the probe
 *    consumer (`scripts/perf-tsl-shader-cost.ts`) groups by sampler count
 *    and reports the per-bucket max, which is the load-bearing metric for
 *    the R1 terrain-sampler early-out audit.
 *
 * Dev-only surface — exposed via `window.__tslShaderCost()` and only wired
 * when the existing `?diag=1` (or perf-harness) gate fires in bootstrap.ts.
 * Retail Vite builds DCE the bootstrap surface; this helper has no production
 * runtime cost.
 *
 * Authored for `tsl-shader-cost-probe` (R3) in
 * `docs/tasks/cycle-mobile-webgl2-fallback-fix.md`. Validates the R1
 * sampler-count drop named in
 * `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md`.
 */
export type KonveyerNodeMaterialShaderRecord = MaterialShaderRecord | CacheEntryShaderRecord;

export interface MaterialShaderRecord {
  kind: 'material';
  marker: 'isKonveyerTerrainNodeMaterial' | 'isKonveyerNpcImpostorNodeMaterial' | 'isKonveyerBillboardNodeMaterial';
  className: string;
  materialName: string | null;
  uuid: string;
  customProgramCacheKey: string | null;
  shaderSource: 'material._latestBuilder' | 'none';
  fragmentShader: string | null;
  vertexShader: string | null;
  fragmentLength: number | null;
  vertexLength: number | null;
  fragmentSamplerCount: number | null;
  fragmentUniformCount: number | null;
  fragmentInstructionCount: number | null;
  vertexSamplerCount: number | null;
  vertexUniformCount: number | null;
  vertexInstructionCount: number | null;
}

export interface CacheEntryShaderRecord {
  kind: 'cacheEntry';
  /** Cache-array index. The cache key is a `cyrb53` hash and not stable. */
  cacheIndex: number;
  fragmentShader: string | null;
  vertexShader: string | null;
  fragmentLength: number | null;
  vertexLength: number | null;
  fragmentSamplerCount: number | null;
  fragmentUniformCount: number | null;
  fragmentInstructionCount: number | null;
  vertexSamplerCount: number | null;
  vertexUniformCount: number | null;
  vertexInstructionCount: number | null;
}

type MaterialWithLatestBuilder = THREE.Material & {
  _latestBuilder?: {
    fragmentShader?: string;
    vertexShader?: string;
  };
  isKonveyerTerrainNodeMaterial?: boolean;
  isKonveyerNpcImpostorNodeMaterial?: boolean;
  isKonveyerBillboardNodeMaterial?: boolean;
  customProgramCacheKey?: () => string;
};

type NodeBuilderStateLike = {
  fragmentShader?: string;
  vertexShader?: string;
};

// `renderer._nodes.nodeBuilderCache` is `Map<number, NodeBuilderState>` in
// the unified `WebGPURenderer` (the key is a numeric `cyrb53` hash from
// `three/src/nodes/core/NodeUtils.js#hashArray`, not a string). The classic
// `WebGLNodesHandler` path does not populate this cache at all; it instead
// attaches `_latestBuilder` to each material.
type RendererWithNodes = CommonRenderer & {
  _nodes?: {
    nodeBuilderCache?: Map<unknown, NodeBuilderStateLike>;
  };
};

const KONVEYER_MARKERS = [
  'isKonveyerTerrainNodeMaterial',
  'isKonveyerNpcImpostorNodeMaterial',
  'isKonveyerBillboardNodeMaterial',
] as const;

function detectKonveyerMarker(
  material: MaterialWithLatestBuilder,
): MaterialShaderRecord['marker'] | null {
  for (const marker of KONVEYER_MARKERS) {
    if (material[marker] === true) return marker;
  }
  return null;
}

function countSamplers(source: string): number {
  // GLSL ES 3.00 emits `uniform sampler2D foo;` (with optional precision and
  // layout qualifiers). Matches `sampler2D`, `samplerCube`, `sampler2DArray`,
  // `sampler3D`. Multiline tolerant; no /m flag needed since `;` terminates.
  const matches = source.match(/\buniform\s+(?:(?:highp|mediump|lowp)\s+)?sampler(?:2D|Cube|2DArray|3D)\b/g);
  return matches?.length ?? 0;
}

function countUniforms(source: string): number {
  // Counts top-level `uniform` declarations. Excludes the `uniform` keyword
  // appearing inside `layout(...) uniform Block { ... }` block names by
  // requiring a type token next.
  const matches = source.match(/^\s*uniform\s+[A-Za-z_][\w]*/gm);
  return matches?.length ?? 0;
}

function countInstructionLines(source: string): number {
  // Strip block comments + line comments, then count non-blank lines.
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const lines = stripped.split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    // Skip standalone braces; they're scope markers, not instructions.
    if (trimmed === '{' || trimmed === '}') continue;
    count += 1;
  }
  return count;
}

function buildMaterialRecord(
  material: MaterialWithLatestBuilder,
  marker: MaterialShaderRecord['marker'],
  source: MaterialShaderRecord['shaderSource'],
  fragmentShader: string | null,
  vertexShader: string | null,
): MaterialShaderRecord {
  let cacheKey: string | null = null;
  try {
    cacheKey = typeof material.customProgramCacheKey === 'function'
      ? material.customProgramCacheKey()
      : null;
  } catch {
    cacheKey = null;
  }
  return {
    kind: 'material',
    marker,
    className: material.constructor?.name ?? 'Unknown',
    materialName: material.name && material.name.length > 0 ? material.name : null,
    uuid: material.uuid,
    customProgramCacheKey: cacheKey,
    shaderSource: source,
    fragmentShader,
    vertexShader,
    fragmentLength: fragmentShader === null ? null : fragmentShader.length,
    vertexLength: vertexShader === null ? null : vertexShader.length,
    fragmentSamplerCount: fragmentShader === null ? null : countSamplers(fragmentShader),
    fragmentUniformCount: fragmentShader === null ? null : countUniforms(fragmentShader),
    fragmentInstructionCount: fragmentShader === null ? null : countInstructionLines(fragmentShader),
    vertexSamplerCount: vertexShader === null ? null : countSamplers(vertexShader),
    vertexUniformCount: vertexShader === null ? null : countUniforms(vertexShader),
    vertexInstructionCount: vertexShader === null ? null : countInstructionLines(vertexShader),
  };
}

function buildCacheRecord(
  cacheIndex: number,
  fragmentShader: string | null,
  vertexShader: string | null,
): CacheEntryShaderRecord {
  return {
    kind: 'cacheEntry',
    cacheIndex,
    fragmentShader,
    vertexShader,
    fragmentLength: fragmentShader === null ? null : fragmentShader.length,
    vertexLength: vertexShader === null ? null : vertexShader.length,
    fragmentSamplerCount: fragmentShader === null ? null : countSamplers(fragmentShader),
    fragmentUniformCount: fragmentShader === null ? null : countUniforms(fragmentShader),
    fragmentInstructionCount: fragmentShader === null ? null : countInstructionLines(fragmentShader),
    vertexSamplerCount: vertexShader === null ? null : countSamplers(vertexShader),
    vertexUniformCount: vertexShader === null ? null : countUniforms(vertexShader),
    vertexInstructionCount: vertexShader === null ? null : countInstructionLines(vertexShader),
  };
}

/**
 * Walks the scene, collects every TSL node-material tagged with a Konveyer
 * `isKonveyer*NodeMaterial` marker, and enumerates every entry in
 * `renderer._nodes.nodeBuilderCache`. Returns a flat array containing both
 * record kinds; run **after** at least one render or after
 * `renderer.compileAsync(scene, camera)` resolves so the builder cache is
 * populated.
 *
 * For the classic `WebGLRenderer + WebGLNodesHandler` path the compiled
 * GLSL is attached to each material via `_latestBuilder`; we surface it on
 * the `'material'` record with `shaderSource: 'material._latestBuilder'`.
 *
 * For the unified `WebGPURenderer` (both `webgpu` and
 * `webgpu-webgl-fallback` backends) the TSL fragment GLSL anonymises
 * uniform names (`nodeUniform0`, etc.) and the cache key is a numeric
 * `cyrb53` hash, so we cannot correlate a cache entry back to a specific
 * material. The probe consumer (`scripts/perf-tsl-shader-cost.ts`) groups
 * cache entries by sampler count and surfaces the per-bucket max — that
 * is the load-bearing metric for the R1 terrain-sampler early-out audit.
 *
 * Unique material instances are deduplicated by `material.uuid`.
 */
export function collectKonveyerNodeMaterialShaders(
  renderer: CommonRenderer,
  scene: THREE.Object3D,
): KonveyerNodeMaterialShaderRecord[] {
  const seen = new Set<string>();
  const candidates: { material: MaterialWithLatestBuilder; marker: MaterialShaderRecord['marker'] }[] = [];

  scene.traverse((object) => {
    const meshLike = object as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
    const materialField = meshLike.material;
    if (!materialField) return;
    const materials = Array.isArray(materialField) ? materialField : [materialField];
    for (const mat of materials) {
      if (!mat || seen.has(mat.uuid)) continue;
      const tagged = mat as MaterialWithLatestBuilder;
      const marker = detectKonveyerMarker(tagged);
      if (!marker) continue;
      seen.add(mat.uuid);
      candidates.push({ material: tagged, marker });
    }
  });

  const rendererWithNodes = renderer as RendererWithNodes;
  const cacheEntries: NodeBuilderStateLike[] = rendererWithNodes._nodes?.nodeBuilderCache
    ? Array.from(rendererWithNodes._nodes.nodeBuilderCache.values())
    : [];

  const records: KonveyerNodeMaterialShaderRecord[] = [];

  for (const { material, marker } of candidates) {
    // Classic WebGLRenderer + WebGLNodesHandler attaches the compiled
    // builder directly onto the material instance. WebGPURenderer does
    // not, so the GLSL is exposed via the cache-entry records below.
    const latest = material._latestBuilder;
    if (latest?.fragmentShader || latest?.vertexShader) {
      records.push(buildMaterialRecord(
        material,
        marker,
        'material._latestBuilder',
        latest.fragmentShader ?? null,
        latest.vertexShader ?? null,
      ));
    } else {
      records.push(buildMaterialRecord(material, marker, 'none', null, null));
    }
  }

  for (let i = 0; i < cacheEntries.length; i++) {
    const entry = cacheEntries[i];
    if (!entry.fragmentShader && !entry.vertexShader) continue;
    records.push(buildCacheRecord(i, entry.fragmentShader ?? null, entry.vertexShader ?? null));
  }

  return records;
}

async function collectNavigatorWebGPUCapabilities(): Promise<{
  navigatorGpuAvailable: boolean;
  adapterAvailable: boolean | null;
  adapterName: string | null;
  adapterFeatures: string[];
  adapterLimits: Record<string, number | string | boolean | null>;
  error: string | null;
  notes: string[];
}> {
  if (typeof navigator === 'undefined') {
    return {
      navigatorGpuAvailable: false,
      adapterAvailable: null,
      adapterName: null,
      adapterFeatures: [],
      adapterLimits: {},
      error: null,
      notes: ['Navigator is unavailable; adapter probe skipped.'],
    };
  }

  const gpu = (navigator as NavigatorWithGpu).gpu;
  if (!gpu?.requestAdapter) {
    return {
      navigatorGpuAvailable: false,
      adapterAvailable: false,
      adapterName: null,
      adapterFeatures: [],
      adapterLimits: {},
      error: null,
      notes: ['navigator.gpu is unavailable before renderer init. Strict proof mode must treat this as a blocker.'],
    };
  }

  try {
    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    const adapterLimits: Record<string, number | string | boolean | null> = {};
    for (const name of WEBGPU_LIMIT_NAMES) {
      const value = adapter?.limits?.[name];
      adapterLimits[name] = typeof value === 'number'
        || typeof value === 'string'
        || typeof value === 'boolean'
        ? value
        : null;
    }

    return {
      navigatorGpuAvailable: true,
      adapterAvailable: Boolean(adapter),
      adapterName: adapter?.info?.description ?? adapter?.info?.device ?? adapter?.info?.vendor ?? null,
      adapterFeatures: Array.from(adapter?.features ?? []).sort(),
      adapterLimits,
      error: null,
      notes: adapter
        ? ['WebGPU adapter probe succeeded before renderer init.']
        : ['navigator.gpu exists but requestAdapter returned null.'],
    };
  } catch (error) {
    return {
      navigatorGpuAvailable: true,
      adapterAvailable: false,
      adapterName: null,
      adapterFeatures: [],
      adapterLimits: {},
      error: toErrorMessage(error),
      notes: ['WebGPU adapter probe threw before renderer init. Strict proof mode must treat this as a blocker.'],
    };
  }
}

function getNavigatorGpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator as NavigatorWithGpu).gpu);
}
