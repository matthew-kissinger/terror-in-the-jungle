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
  | 'debugWaterProof'
  | 'runtimeWater';

export type RendererFeaturePosture =
  | 'webgpuPrimary'
  | 'compatibilityFallback'
  | 'legacyWebGLDiagnostic'
  | 'unavailable';

export type WebGLCompatibilityMode = 'none' | 'degraded' | 'diagnostic';
export type RendererRequiredLimitName =
  | 'maxComputeInvocationsPerWorkgroup'
  | 'maxStorageBufferBindingSize';

export interface RendererRequiredLimitDecision {
  name: RendererRequiredLimitName;
  required: number;
  actual: number | null;
  satisfied: boolean;
}

export interface RendererFeatureDecision {
  available: boolean;
  policy: RendererFeaturePolicy;
  reason: string;
  proofHooks: string[];
  requiredLimits: RendererRequiredLimitDecision[];
}

export interface RendererFeatureProfile {
  posture: RendererFeaturePosture;
  resolvedBackend: RendererBackendCapabilities['resolvedBackend'];
  requestedMode: RendererBackendCapabilities['requestedMode'];
  strictWebGPU: boolean;
  webglCompatibilityMode: WebGLCompatibilityMode;
  deviceLoss: RendererBackendCapabilities['deviceLoss'];
  requiredLimits: Record<RendererRequiredLimitName, RendererRequiredLimitDecision>;
  decisions: Record<RendererFeatureId, RendererFeatureDecision>;
  notes: string[];
}

const WORLD_FIELD_STORAGE_BUFFER_FLOOR_BYTES = 128 * 1024 * 1024;
const COMPUTE_INVOCATION_FLOOR = 128;

const PROOF_HOOKS: Record<RendererFeatureId, string[]> = {
  sharedTslNodeMaterials: [
    'window.__rendererFeatureProfile().decisions.sharedTslNodeMaterials',
  ],
  webgpuCompute: [
    'window.__rendererFeatureProfile().decisions.webgpuCompute',
    'npm run check:platform-capabilities',
  ],
  storageBufferWorldFields: [
    'window.__rendererFeatureProfile().decisions.storageBufferWorldFields',
    'npm run check:platform-capabilities',
  ],
  renderPipelinePost: [
    'window.__rendererFeatureProfile().decisions.renderPipelinePost',
    'window.__skyCloudPostProofGate()',
    'npm run check:tod-coherence',
  ],
  volumetricCloudPrototype: [
    'window.__rendererFeatureProfile().decisions.volumetricCloudPrototype',
    'window.__skyCloudPostProofGate()',
    'npm run check:tod-coherence',
  ],
  gpuForestCulling: [
    'window.__rendererFeatureProfile().decisions.gpuForestCulling',
    'npm run check:culling-baseline',
  ],
  octahedralImpostorBake: [
    'window.__rendererFeatureProfile().decisions.octahedralImpostorBake',
    'npm run check:asset-gallery',
  ],
  hydrologyAnalysis: [
    'window.__rendererFeatureProfile().decisions.hydrologyAnalysis',
  ],
  debugWaterProof: [
    'window.__rendererFeatureProfile().decisions.debugWaterProof',
    'npm run test:quick -- src/systems/environment/water/DebugWaterProof.test.ts',
  ],
  runtimeWater: [
    'window.__rendererFeatureProfile().decisions.runtimeWater',
  ],
};

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

function makeLimitDecision(
  name: RendererRequiredLimitName,
  required: number,
  actual: number | null,
): RendererRequiredLimitDecision {
  return {
    name,
    required,
    actual,
    satisfied: actual === null || actual >= required,
  };
}

function makeDecision(
  available: boolean,
  policy: RendererFeaturePolicy,
  reason: string,
  options: {
    proofHooks?: string[];
    requiredLimits?: RendererRequiredLimitDecision[];
  } = {},
): RendererFeatureDecision {
  return {
    available,
    policy,
    reason,
    proofHooks: [...(options.proofHooks ?? [])],
    requiredLimits: [...(options.requiredLimits ?? [])],
  };
}

function isWebGPUReady(capabilities: RendererBackendCapabilities): boolean {
  return capabilities.initStatus === 'ready'
    && capabilities.resolvedBackend === 'webgpu'
    && capabilities.isWebGPURenderer
    && !capabilities.deviceLoss.lost;
}

function isUnifiedWebGLFallback(capabilities: RendererBackendCapabilities): boolean {
  return capabilities.initStatus === 'ready'
    && capabilities.resolvedBackend === 'webgpu-webgl-fallback'
    && capabilities.isWebGPURenderer;
}

function classifyPosture(capabilities: RendererBackendCapabilities): RendererFeaturePosture {
  if (capabilities.deviceLoss.lost) return 'unavailable';
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
  const requiredLimits: Record<RendererRequiredLimitName, RendererRequiredLimitDecision> = {
    maxComputeInvocationsPerWorkgroup: makeLimitDecision(
      'maxComputeInvocationsPerWorkgroup',
      COMPUTE_INVOCATION_FLOOR,
      computeInvocationLimit,
    ),
    maxStorageBufferBindingSize: makeLimitDecision(
      'maxStorageBufferBindingSize',
      WORLD_FIELD_STORAGE_BUFFER_FLOOR_BYTES,
      storageBufferLimit,
    ),
  };
  const storageBufferEnough = requiredLimits.maxStorageBufferBindingSize.satisfied;
  const computeInvocationEnough = requiredLimits.maxComputeInvocationsPerWorkgroup.satisfied;
  const computeReady = webgpuReady
    && capabilities.navigatorGpuAvailable
    && adapterAvailable
    && computeInvocationEnough;
  const worldFieldReady = computeReady && storageBufferEnough;
  const lostDeviceReason = capabilities.deviceLoss.lost
    ? `WebGPU device loss reported (${capabilities.deviceLoss.reason ?? 'unknown'}); renderer must be recreated before WebGPU proof lanes run.`
    : null;

  const notes = [
    ...capabilities.notes,
    'WebGPU is the primary feature path; WebGL2 fallback is compatibility, not a mirrored feature target.',
    'Runtime water is disabled by the 2026-06-13 Fable/WebGPU world-systems cycle decision.',
    ...(lostDeviceReason ? [lostDeviceReason] : []),
  ];

  const decisions: Record<RendererFeatureId, RendererFeatureDecision> = {
    sharedTslNodeMaterials: sharedNodeSafe
      ? makeDecision(
        true,
        'sharedNodeSafe',
        webgpuReady
          ? 'Unified WebGPURenderer is initialized on a WebGPU backend.'
          : 'Unified WebGPURenderer is initialized on the WebGL2 fallback backend; shared TSL node materials may run with degraded feature scope.',
        { proofHooks: PROOF_HOOKS.sharedTslNodeMaterials },
      )
      : makeDecision(
        false,
        'disabled',
        lostDeviceReason ?? 'Renderer is not the unified WebGPURenderer path.',
        { proofHooks: PROOF_HOOKS.sharedTslNodeMaterials },
      ),
    webgpuCompute: computeReady
      ? makeDecision(
        true,
        'requiredWebGPU',
        computeInvocationLimit === null
          ? 'Strict WebGPU renderer is ready; compute invocation limit was not reported, so feature probes must verify workgroup shape.'
          : `Strict WebGPU renderer is ready with maxComputeInvocationsPerWorkgroup=${computeInvocationLimit}.`,
        {
          proofHooks: PROOF_HOOKS.webgpuCompute,
          requiredLimits: [requiredLimits.maxComputeInvocationsPerWorkgroup],
        },
      )
      : makeDecision(
        false,
        webgpuReady ? 'diagnosticOnly' : 'disabled',
        lostDeviceReason ?? (webgpuReady
          ? 'WebGPU renderer is ready but adapter or compute limits are below the cycle floor.'
          : 'Requires the strict WebGPU backend; fallback and legacy WebGL paths disable compute.'),
        {
          proofHooks: PROOF_HOOKS.webgpuCompute,
          requiredLimits: [requiredLimits.maxComputeInvocationsPerWorkgroup],
        },
      ),
    storageBufferWorldFields: worldFieldReady
      ? makeDecision(
        true,
        'requiredWebGPU',
        storageBufferLimit === null
          ? 'WebGPU compute is ready; storage-buffer limit was not reported, so field size must be guarded per allocation.'
          : `WebGPU compute is ready with maxStorageBufferBindingSize=${storageBufferLimit}.`,
        {
          proofHooks: PROOF_HOOKS.storageBufferWorldFields,
          requiredLimits: [
            requiredLimits.maxComputeInvocationsPerWorkgroup,
            requiredLimits.maxStorageBufferBindingSize,
          ],
        },
      )
      : makeDecision(
        false,
        computeReady ? 'diagnosticOnly' : 'disabled',
        lostDeviceReason ?? (computeReady
          ? `Storage-buffer world fields need at least ${WORLD_FIELD_STORAGE_BUFFER_FLOOR_BYTES} bytes per binding.`
          : 'Requires WebGPU compute before allocating GPU world fields.'),
        {
          proofHooks: PROOF_HOOKS.storageBufferWorldFields,
          requiredLimits: [
            requiredLimits.maxComputeInvocationsPerWorkgroup,
            requiredLimits.maxStorageBufferBindingSize,
          ],
        },
      ),
    renderPipelinePost: webgpuReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Allowed only behind dev/proof gates until the cloud/post evidence matrix passes.',
        { proofHooks: PROOF_HOOKS.renderPipelinePost },
      )
      : makeDecision(
        false,
        'disabled',
        lostDeviceReason ?? 'RenderPipeline post experiments are WebGPU-only this cycle.',
        { proofHooks: PROOF_HOOKS.renderPipelinePost },
      ),
    volumetricCloudPrototype: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Fable-style compute clouds are allowed as a guarded WebGPU prototype, not production default.',
        {
          proofHooks: PROOF_HOOKS.volumetricCloudPrototype,
          requiredLimits: [
            requiredLimits.maxComputeInvocationsPerWorkgroup,
            requiredLimits.maxStorageBufferBindingSize,
          ],
        },
      )
      : makeDecision(
        false,
        'disabled',
        lostDeviceReason ?? 'Cloud compute prototype waits on WebGPU compute and storage-buffer world fields.',
        {
          proofHooks: PROOF_HOOKS.volumetricCloudPrototype,
          requiredLimits: [
            requiredLimits.maxComputeInvocationsPerWorkgroup,
            requiredLimits.maxStorageBufferBindingSize,
          ],
        },
      ),
    gpuForestCulling: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Forest culling may be prototyped with GPU world fields; production vegetation remains TIJ-owned.',
        {
          proofHooks: PROOF_HOOKS.gpuForestCulling,
          requiredLimits: [
            requiredLimits.maxComputeInvocationsPerWorkgroup,
            requiredLimits.maxStorageBufferBindingSize,
          ],
        },
      )
      : makeDecision(
        false,
        'disabled',
        lostDeviceReason ?? 'GPU forest culling waits on WebGPU compute and storage-buffer world fields.',
        {
          proofHooks: PROOF_HOOKS.gpuForestCulling,
          requiredLimits: [
            requiredLimits.maxComputeInvocationsPerWorkgroup,
            requiredLimits.maxStorageBufferBindingSize,
          ],
        },
      ),
    octahedralImpostorBake: sharedNodeSafe
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Impostor capture is a bake/proof surface only until accepted tree source assets exist.',
        { proofHooks: PROOF_HOOKS.octahedralImpostorBake },
      )
      : makeDecision(
        false,
        'disabled',
        lostDeviceReason ?? 'Impostor bake requires the unified renderer path for proof parity.',
        { proofHooks: PROOF_HOOKS.octahedralImpostorBake },
      ),
    hydrologyAnalysis: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Hydrology can produce analysis buffers for future VODA design; it cannot drive runtime water this cycle.',
        {
          proofHooks: PROOF_HOOKS.hydrologyAnalysis,
          requiredLimits: [
            requiredLimits.maxComputeInvocationsPerWorkgroup,
            requiredLimits.maxStorageBufferBindingSize,
          ],
        },
      )
      : makeDecision(
        false,
        'disabled',
        lostDeviceReason ?? 'Hydrology analysis waits on WebGPU compute and storage-buffer world fields.',
        {
          proofHooks: PROOF_HOOKS.hydrologyAnalysis,
          requiredLimits: [
            requiredLimits.maxComputeInvocationsPerWorkgroup,
            requiredLimits.maxStorageBufferBindingSize,
          ],
        },
      ),
    debugWaterProof: sharedNodeSafe
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Debug basin/river water proofs may run as non-authoritative data overlays; they do not enable gameplay water.',
        { proofHooks: PROOF_HOOKS.debugWaterProof },
      )
      : makeDecision(
        false,
        'disabled',
        lostDeviceReason ?? 'Debug water proof waits on the unified renderer path for diagnostic parity.',
        { proofHooks: PROOF_HOOKS.debugWaterProof },
      ),
    runtimeWater: makeDecision(
      false,
      'disabled',
      'Runtime water is explicitly out of scope for this cycle.',
      { proofHooks: PROOF_HOOKS.runtimeWater },
    ),
  };

  return {
    posture,
    resolvedBackend: capabilities.resolvedBackend,
    requestedMode: capabilities.requestedMode,
    strictWebGPU: capabilities.strictWebGPU,
    webglCompatibilityMode: classifyWebGLCompatibility(posture),
    deviceLoss: { ...capabilities.deviceLoss },
    requiredLimits,
    decisions,
    notes,
  };
}
