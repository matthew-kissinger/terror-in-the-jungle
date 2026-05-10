import * as THREE from 'three';

export type RendererBackendMode = 'webgl' | 'webgpu' | 'webgpu-force-webgl';
export type ResolvedRendererBackend = 'webgl' | 'webgpu' | 'webgpu-webgl-fallback' | 'unknown';
export type RendererInitStatus = 'ready' | 'pending' | 'fallback-webgl' | 'failed';

export interface RendererBackendCapabilities {
  requestedMode: RendererBackendMode;
  resolvedBackend: ResolvedRendererBackend;
  initStatus: RendererInitStatus;
  isWebGPURenderer: boolean;
  forceWebGL: boolean;
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
    if (
      requested === 'webgpu-force-webgl'
      || requested === 'force-webgl'
      || requested === 'fallback'
    ) {
      return 'webgpu-force-webgl';
    }
  }

  return import.meta.env.VITE_KONVEYER_WEBGPU === '1' ? 'webgpu' : 'webgl';
}

export function createWebGLRenderer(preserveDrawingBuffer: boolean): THREE.WebGLRenderer {
  return new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer,
  });
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
    navigatorGpuAvailable: getNavigatorGpuAvailable(),
    adapterAvailable: null,
    adapterName: null,
    adapterFeatures: [],
    adapterLimits: {},
    error: null,
    notes: requestedMode === 'webgl'
      ? ['WebGL renderer selected by default.']
      : ['WebGPU renderer requested; bootstrapping through async renderer init.'],
  };
}

export async function createWebGPURenderer(
  requestedMode: Extract<RendererBackendMode, 'webgpu' | 'webgpu-force-webgl'>,
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
      notes: ['navigator.gpu is unavailable; WebGPU renderer will rely on fallback.'],
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
      notes: ['WebGPU adapter probe threw; renderer fallback is still allowed.'],
    };
  }
}

function getNavigatorGpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator as NavigatorWithGpu).gpu);
}

