// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { RendererBackendCapabilities } from './RendererBackend';

export type RendererFeaturePolicy =
  | 'requiredWebGPU'
  | 'degradedFallback'
  | 'sharedNodeSafe'
  | 'diagnosticOnly'
  | 'disabled';

export type RendererFeatureId =
  | 'sharedTslNodeMaterials'
  | 'webgpuCompute'
  | 'storageBufferWorldFields'
  | 'renderPipelinePost'
  | 'volumetricCloudPrototype'
  | 'gpuForestCulling'
  | 'octahedralImpostorBake'
  | 'hydrologyAnalysis'
  | 'runtimeWater';

export type RendererFeaturePosture =
  | 'webgpuPrimary'
  | 'compatibilityFallback'
  | 'legacyWebGLDiagnostic'
  | 'unavailable';

export type WebGLCompatibilityMode = 'none' | 'degraded' | 'diagnostic';

export interface RendererFeatureDecision {
  available: boolean;
  policy: RendererFeaturePolicy;
  reason: string;
}

export interface RendererFeatureProfile {
  posture: RendererFeaturePosture;
  resolvedBackend: RendererBackendCapabilities['resolvedBackend'];
  requestedMode: RendererBackendCapabilities['requestedMode'];
  strictWebGPU: boolean;
  webglCompatibilityMode: WebGLCompatibilityMode;
  decisions: Record<RendererFeatureId, RendererFeatureDecision>;
  notes: string[];
}

const WORLD_FIELD_STORAGE_BUFFER_FLOOR_BYTES = 128 * 1024 * 1024;
const COMPUTE_INVOCATION_FLOOR = 128;

function numericLimit(
  capabilities: RendererBackendCapabilities,
  name: string,
): number | null {
  const value = capabilities.adapterLimits[name];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function makeDecision(
  available: boolean,
  policy: RendererFeaturePolicy,
  reason: string,
): RendererFeatureDecision {
  return { available, policy, reason };
}

function isWebGPUReady(capabilities: RendererBackendCapabilities): boolean {
  return capabilities.initStatus === 'ready'
    && capabilities.resolvedBackend === 'webgpu'
    && capabilities.isWebGPURenderer;
}

function isUnifiedWebGLFallback(capabilities: RendererBackendCapabilities): boolean {
  return capabilities.initStatus === 'ready'
    && capabilities.resolvedBackend === 'webgpu-webgl-fallback'
    && capabilities.isWebGPURenderer;
}

function classifyPosture(capabilities: RendererBackendCapabilities): RendererFeaturePosture {
  if (isWebGPUReady(capabilities)) return 'webgpuPrimary';
  if (isUnifiedWebGLFallback(capabilities)) return 'compatibilityFallback';
  if (
    capabilities.initStatus === 'ready'
    && capabilities.resolvedBackend === 'webgl'
  ) {
    return 'legacyWebGLDiagnostic';
  }
  return 'unavailable';
}

function classifyWebGLCompatibility(
  posture: RendererFeaturePosture,
): WebGLCompatibilityMode {
  if (posture === 'compatibilityFallback') return 'degraded';
  if (posture === 'legacyWebGLDiagnostic') return 'diagnostic';
  return 'none';
}

export function buildRendererFeatureProfile(
  capabilities: RendererBackendCapabilities,
): RendererFeatureProfile {
  const posture = classifyPosture(capabilities);
  const webgpuReady = posture === 'webgpuPrimary';
  const unifiedFallback = posture === 'compatibilityFallback';
  const sharedNodeSafe = webgpuReady || unifiedFallback;
  const adapterAvailable = capabilities.adapterAvailable !== false;
  const storageBufferLimit = numericLimit(capabilities, 'maxStorageBufferBindingSize');
  const computeInvocationLimit = numericLimit(capabilities, 'maxComputeInvocationsPerWorkgroup');
  const storageBufferEnough = storageBufferLimit === null
    || storageBufferLimit >= WORLD_FIELD_STORAGE_BUFFER_FLOOR_BYTES;
  const computeInvocationEnough = computeInvocationLimit === null
    || computeInvocationLimit >= COMPUTE_INVOCATION_FLOOR;
  const computeReady = webgpuReady
    && capabilities.navigatorGpuAvailable
    && adapterAvailable
    && computeInvocationEnough;
  const worldFieldReady = computeReady && storageBufferEnough;

  const notes = [
    ...capabilities.notes,
    'WebGPU is the primary feature path; WebGL2 fallback is compatibility, not a mirrored feature target.',
    'Runtime water is disabled by the 2026-06-13 Fable/WebGPU world-systems cycle decision.',
  ];

  const decisions: Record<RendererFeatureId, RendererFeatureDecision> = {
    sharedTslNodeMaterials: sharedNodeSafe
      ? makeDecision(
        true,
        'sharedNodeSafe',
        webgpuReady
          ? 'Unified WebGPURenderer is initialized on a WebGPU backend.'
          : 'Unified WebGPURenderer is initialized on the WebGL2 fallback backend; shared TSL node materials may run with degraded feature scope.',
      )
      : makeDecision(
        false,
        'disabled',
        'Renderer is not the unified WebGPURenderer path.',
      ),
    webgpuCompute: computeReady
      ? makeDecision(
        true,
        'requiredWebGPU',
        computeInvocationLimit === null
          ? 'Strict WebGPU renderer is ready; compute invocation limit was not reported, so feature probes must verify workgroup shape.'
          : `Strict WebGPU renderer is ready with maxComputeInvocationsPerWorkgroup=${computeInvocationLimit}.`,
      )
      : makeDecision(
        false,
        webgpuReady ? 'diagnosticOnly' : 'disabled',
        webgpuReady
          ? 'WebGPU renderer is ready but adapter or compute limits are below the cycle floor.'
          : 'Requires the strict WebGPU backend; fallback and legacy WebGL paths disable compute.',
      ),
    storageBufferWorldFields: worldFieldReady
      ? makeDecision(
        true,
        'requiredWebGPU',
        storageBufferLimit === null
          ? 'WebGPU compute is ready; storage-buffer limit was not reported, so field size must be guarded per allocation.'
          : `WebGPU compute is ready with maxStorageBufferBindingSize=${storageBufferLimit}.`,
      )
      : makeDecision(
        false,
        computeReady ? 'diagnosticOnly' : 'disabled',
        computeReady
          ? `Storage-buffer world fields need at least ${WORLD_FIELD_STORAGE_BUFFER_FLOOR_BYTES} bytes per binding.`
          : 'Requires WebGPU compute before allocating GPU world fields.',
      ),
    renderPipelinePost: webgpuReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Allowed only behind dev/proof gates until the cloud/post evidence matrix passes.',
      )
      : makeDecision(
        false,
        'disabled',
        'RenderPipeline post experiments are WebGPU-only this cycle.',
      ),
    volumetricCloudPrototype: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Fable-style compute clouds are allowed as a guarded WebGPU prototype, not production default.',
      )
      : makeDecision(
        false,
        'disabled',
        'Cloud compute prototype waits on WebGPU compute and storage-buffer world fields.',
      ),
    gpuForestCulling: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Forest culling may be prototyped with GPU world fields; production vegetation remains TIJ-owned.',
      )
      : makeDecision(
        false,
        'disabled',
        'GPU forest culling waits on WebGPU compute and storage-buffer world fields.',
      ),
    octahedralImpostorBake: sharedNodeSafe
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Impostor capture is a bake/proof surface only until accepted tree source assets exist.',
      )
      : makeDecision(
        false,
        'disabled',
        'Impostor bake requires the unified renderer path for proof parity.',
      ),
    hydrologyAnalysis: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Hydrology can produce analysis buffers for future VODA design; it cannot drive runtime water this cycle.',
      )
      : makeDecision(
        false,
        'disabled',
        'Hydrology analysis waits on WebGPU compute and storage-buffer world fields.',
      ),
    runtimeWater: makeDecision(
      false,
      'disabled',
      'Runtime water is explicitly out of scope for this cycle.',
    ),
  };

  return {
    posture,
    resolvedBackend: capabilities.resolvedBackend,
    requestedMode: capabilities.requestedMode,
    strictWebGPU: capabilities.strictWebGPU,
    webglCompatibilityMode: classifyWebGLCompatibility(posture),
    decisions,
    notes,
  };
}
