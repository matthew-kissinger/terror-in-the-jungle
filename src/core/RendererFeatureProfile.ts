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
  | 'terrainHeightfieldErosion'
  | 'debugWaterLevelProof'
  | 'renderPipelinePost'
  | 'volumetricCloudPrototype'
  | 'gpuForestCulling'
  | 'aggregateForestLod'
  | 'naniteLiteClusterStudy'
  | 'octahedralImpostorBake'
  | 'vietnamSpeciesSourceSpecs'
  | 'hydrologyAnalysis'
  | 'runtimeWater';

export type RendererFeaturePosture =
  | 'webgpuPrimary'
  | 'compatibilityFallback'
  | 'legacyWebGLDiagnostic'
  | 'unavailable';

export type WebGLCompatibilityMode = 'none' | 'degraded' | 'diagnostic';

export type RendererFeatureProofHook =
  | 'rendererFeatureProfileSnapshot'
  | 'quietMachinePerfAttribution'
  | 'terrainBaselineProof'
  | 'terrainVisualMatrix'
  | 'todCoherenceGate'
  | 'atmosphereEvidenceMatrix'
  | 'assetAcceptanceReview'
  | 'assetGalleryReview'
  | 'ownerDebugWaterApproval'
  | 'liveReleaseGate';

export type RendererFeatureDeviceLossPolicy =
  | 'reprofileAfterRestore'
  | 'requiresRendererReinit'
  | 'disabledUntilFutureCycle'
  | 'noRuntimeGpuState';

export interface RendererFeatureRequiredLimit {
  name: 'maxStorageBufferBindingSize' | 'maxComputeInvocationsPerWorkgroup';
  floor: number;
  actual: number | null;
  satisfied: boolean;
  requiredFor: string;
}

export interface RendererFeatureDecision {
  available: boolean;
  policy: RendererFeaturePolicy;
  reason: string;
  requiredLimits: RendererFeatureRequiredLimit[];
  proofHooks: RendererFeatureProofHook[];
  deviceLossPolicy: RendererFeatureDeviceLossPolicy;
}

export interface RendererFeatureDeviceLossSummary {
  contextGuard: 'WebGLContextGuard';
  diagnosticLanesReprofileAfterRestore: boolean;
  strictWebGPURequiresBackendReinit: boolean;
  runtimeWaterRestores: false;
  notes: string[];
}

export interface RendererFeatureProfile {
  posture: RendererFeaturePosture;
  resolvedBackend: RendererBackendCapabilities['resolvedBackend'];
  requestedMode: RendererBackendCapabilities['requestedMode'];
  strictWebGPU: boolean;
  webglCompatibilityMode: WebGLCompatibilityMode;
  requiredLimits: {
    worldFieldStorageBufferFloorBytes: number;
    computeInvocationFloor: number;
  };
  proofHookDescriptions: Record<RendererFeatureProofHook, string>;
  deviceLoss: RendererFeatureDeviceLossSummary;
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
  options: {
    requiredLimits?: RendererFeatureRequiredLimit[];
    proofHooks?: RendererFeatureProofHook[];
    deviceLossPolicy?: RendererFeatureDeviceLossPolicy;
  } = {},
): RendererFeatureDecision {
  return {
    available,
    policy,
    reason,
    requiredLimits: options.requiredLimits ?? [],
    proofHooks: options.proofHooks ?? ['rendererFeatureProfileSnapshot'],
    deviceLossPolicy: options.deviceLossPolicy ?? 'reprofileAfterRestore',
  };
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

function makeLimitRequirement(
  name: RendererFeatureRequiredLimit['name'],
  floor: number,
  actual: number | null,
  requiredFor: string,
): RendererFeatureRequiredLimit {
  return {
    name,
    floor,
    actual,
    satisfied: actual === null || actual >= floor,
    requiredFor,
  };
}

const PROOF_HOOK_DESCRIPTIONS: Record<RendererFeatureProofHook, string> = {
  rendererFeatureProfileSnapshot: 'Capture __rendererFeatureProfile or an equivalent profile snapshot for the active backend.',
  quietMachinePerfAttribution: 'Run same-machine quiet perf attribution before and after any default-on candidate.',
  terrainBaselineProof: 'Use terrain baseline evidence for Open Frontier and A Shau before terrain, vegetation, forest, or far-horizon changes.',
  terrainVisualMatrix: 'Capture scenario visual evidence for terrain authority, placement, and fallback readability.',
  todCoherenceGate: 'Run the TOD coherence gate when sky, lighting, cloud, post, fog, shadow, or atmosphere authority changes.',
  atmosphereEvidenceMatrix: 'Capture all-mode atmosphere evidence before promoting shared sky/cloud/post behavior.',
  assetAcceptanceReview: 'Use the asset acceptance standard before importing or generating source assets.',
  assetGalleryReview: 'Use the asset gallery proof surface for accepted visual assets.',
  ownerDebugWaterApproval: 'Owner must explicitly approve debug-only water-level or basin/river proof scope before implementation.',
  liveReleaseGate: 'After release-safe merge and deploy, verify production with check:live-release.',
};

function buildDeviceLossSummary(
  posture: RendererFeaturePosture,
  strictWebGPU: boolean,
): RendererFeatureDeviceLossSummary {
  return {
    contextGuard: 'WebGLContextGuard',
    diagnosticLanesReprofileAfterRestore: posture === 'webgpuPrimary',
    strictWebGPURequiresBackendReinit: strictWebGPU,
    runtimeWaterRestores: false,
    notes: [
      'After graphics context restore, WebGPU diagnostic lanes must re-read the renderer feature profile before resuming proof work.',
      strictWebGPU
        ? 'Strict WebGPU proof mode must fail loudly if restore resolves to a fallback backend.'
        : 'Fallback restore may keep the app shell running with WebGPU-only diagnostic lanes disabled.',
      'Runtime water has no restore path in this cycle because it is disabled.',
    ],
  };
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
  const computeLimitRequirement = makeLimitRequirement(
    'maxComputeInvocationsPerWorkgroup',
    COMPUTE_INVOCATION_FLOOR,
    computeInvocationLimit,
    'WebGPU compute prototype lanes',
  );
  const storageLimitRequirement = makeLimitRequirement(
    'maxStorageBufferBindingSize',
    WORLD_FIELD_STORAGE_BUFFER_FLOOR_BYTES,
    storageBufferLimit,
    'GPU world-field prototype lanes',
  );
  const worldFieldRequirements = [computeLimitRequirement, storageLimitRequirement];
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
        {
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'terrainVisualMatrix',
          ],
        },
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
        {
          requiredLimits: [computeLimitRequirement],
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'quietMachinePerfAttribution',
          ],
          deviceLossPolicy: 'requiresRendererReinit',
        },
      )
      : makeDecision(
        false,
        webgpuReady ? 'diagnosticOnly' : 'disabled',
        webgpuReady
          ? 'WebGPU renderer is ready but adapter or compute limits are below the cycle floor.'
          : 'Requires the strict WebGPU backend; fallback and legacy WebGL paths disable compute.',
        {
          requiredLimits: [computeLimitRequirement],
          deviceLossPolicy: webgpuReady ? 'reprofileAfterRestore' : 'disabledUntilFutureCycle',
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
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'quietMachinePerfAttribution',
            'terrainBaselineProof',
          ],
          deviceLossPolicy: 'requiresRendererReinit',
        },
      )
      : makeDecision(
        false,
        computeReady ? 'diagnosticOnly' : 'disabled',
        computeReady
          ? `Storage-buffer world fields need at least ${WORLD_FIELD_STORAGE_BUFFER_FLOOR_BYTES} bytes per binding.`
          : 'Requires WebGPU compute before allocating GPU world fields.',
        {
          requiredLimits: worldFieldRequirements,
          deviceLossPolicy: computeReady ? 'reprofileAfterRestore' : 'disabledUntilFutureCycle',
        },
      ),
    terrainHeightfieldErosion: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Heightfield and erosion work may run only as a TIJ terrain-authority spike; it cannot replace A Shau DEM or navmesh ownership.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'quietMachinePerfAttribution',
            'terrainBaselineProof',
            'terrainVisualMatrix',
          ],
          deviceLossPolicy: 'requiresRendererReinit',
        },
      )
      : makeDecision(
        false,
        'disabled',
        'Heightfield and erosion prototypes wait on WebGPU compute and storage-buffer world fields.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'quietMachinePerfAttribution',
            'terrainBaselineProof',
            'terrainVisualMatrix',
          ],
          deviceLossPolicy: 'disabledUntilFutureCycle',
        },
      ),
    debugWaterLevelProof: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Debug-only water-level and basin/river proof buffers may be produced for future VODA design; they cannot become gameplay water.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'ownerDebugWaterApproval',
            'terrainBaselineProof',
            'terrainVisualMatrix',
          ],
          deviceLossPolicy: 'requiresRendererReinit',
        },
      )
      : makeDecision(
        false,
        'disabled',
        'Debug water-level proof waits on WebGPU world-field capability and owner approval.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'ownerDebugWaterApproval',
            'terrainBaselineProof',
            'terrainVisualMatrix',
          ],
          deviceLossPolicy: 'disabledUntilFutureCycle',
        },
      ),
    renderPipelinePost: webgpuReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Allowed only behind dev/proof gates until the cloud/post evidence matrix passes.',
        {
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'quietMachinePerfAttribution',
            'todCoherenceGate',
            'atmosphereEvidenceMatrix',
          ],
          deviceLossPolicy: 'requiresRendererReinit',
        },
      )
      : makeDecision(
        false,
        'disabled',
        'RenderPipeline post experiments are WebGPU-only this cycle.',
        {
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'quietMachinePerfAttribution',
            'todCoherenceGate',
            'atmosphereEvidenceMatrix',
          ],
          deviceLossPolicy: 'disabledUntilFutureCycle',
        },
      ),
    volumetricCloudPrototype: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Fable-style compute clouds are allowed as a guarded WebGPU prototype, not production default.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'quietMachinePerfAttribution',
            'todCoherenceGate',
            'atmosphereEvidenceMatrix',
          ],
          deviceLossPolicy: 'requiresRendererReinit',
        },
      )
      : makeDecision(
        false,
        'disabled',
        'Cloud compute prototype waits on WebGPU compute and storage-buffer world fields.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'quietMachinePerfAttribution',
            'todCoherenceGate',
            'atmosphereEvidenceMatrix',
          ],
          deviceLossPolicy: 'disabledUntilFutureCycle',
        },
      ),
    gpuForestCulling: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Forest culling may be prototyped with GPU world fields; production vegetation remains TIJ-owned.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'quietMachinePerfAttribution',
            'terrainBaselineProof',
            'terrainVisualMatrix',
          ],
          deviceLossPolicy: 'requiresRendererReinit',
        },
      )
      : makeDecision(
        false,
        'disabled',
        'GPU forest culling waits on WebGPU compute and storage-buffer world fields.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'quietMachinePerfAttribution',
            'terrainBaselineProof',
            'terrainVisualMatrix',
          ],
          deviceLossPolicy: 'disabledUntilFutureCycle',
        },
      ),
    aggregateForestLod: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Aggregate forest LOD may evaluate TIJ-owned culling and impostor bands; it cannot port the full Fable Forests runtime.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'quietMachinePerfAttribution',
            'terrainBaselineProof',
            'terrainVisualMatrix',
            'assetAcceptanceReview',
            'assetGalleryReview',
          ],
          deviceLossPolicy: 'requiresRendererReinit',
        },
      )
      : makeDecision(
        false,
        'disabled',
        'Aggregate forest LOD waits on WebGPU world-field capability and accepted source assets.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'assetAcceptanceReview',
            'assetGalleryReview',
            'terrainBaselineProof',
            'terrainVisualMatrix',
          ],
          deviceLossPolicy: 'disabledUntilFutureCycle',
        },
      ),
    naniteLiteClusterStudy: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Nanite-lite cluster study may evaluate hero-tree clusters and aggregate impostors; true meshlet Nanite remains out of scope.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'quietMachinePerfAttribution',
            'terrainVisualMatrix',
            'assetAcceptanceReview',
          ],
          deviceLossPolicy: 'requiresRendererReinit',
        },
      )
      : makeDecision(
        false,
        'disabled',
        'Nanite-lite cluster study waits on WebGPU world-field capability and accepted source assets.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'assetAcceptanceReview',
            'terrainVisualMatrix',
          ],
          deviceLossPolicy: 'disabledUntilFutureCycle',
        },
      ),
    octahedralImpostorBake: sharedNodeSafe
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Impostor capture is a bake/proof surface only until accepted tree source assets exist.',
        {
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'assetAcceptanceReview',
            'assetGalleryReview',
            'terrainVisualMatrix',
          ],
        },
      )
      : makeDecision(
        false,
        'disabled',
        'Impostor bake requires the unified renderer path for proof parity.',
        {
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'assetAcceptanceReview',
            'assetGalleryReview',
          ],
          deviceLossPolicy: 'disabledUntilFutureCycle',
        },
      ),
    vietnamSpeciesSourceSpecs: makeDecision(
      true,
      'diagnosticOnly',
      'Species work is a Vietnam source-asset specification lane only; no Fable generated species or assets are runtime inputs.',
      {
        proofHooks: [
          'assetAcceptanceReview',
          'assetGalleryReview',
          'terrainVisualMatrix',
      ],
      deviceLossPolicy: 'noRuntimeGpuState',
    },
    ),
    hydrologyAnalysis: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Hydrology can produce analysis buffers for future VODA design; it cannot drive runtime water this cycle.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'ownerDebugWaterApproval',
            'terrainBaselineProof',
            'terrainVisualMatrix',
          ],
          deviceLossPolicy: 'requiresRendererReinit',
        },
      )
      : makeDecision(
        false,
        'disabled',
        'Hydrology analysis waits on WebGPU compute and storage-buffer world fields.',
        {
          requiredLimits: worldFieldRequirements,
          proofHooks: [
            'rendererFeatureProfileSnapshot',
            'ownerDebugWaterApproval',
            'terrainBaselineProof',
            'terrainVisualMatrix',
          ],
          deviceLossPolicy: 'disabledUntilFutureCycle',
        },
      ),
    runtimeWater: makeDecision(
      false,
      'disabled',
      'Runtime water is explicitly out of scope for this cycle.',
      {
        proofHooks: [
          'ownerDebugWaterApproval',
          'liveReleaseGate',
        ],
        deviceLossPolicy: 'disabledUntilFutureCycle',
      },
    ),
  };

  return {
    posture,
    resolvedBackend: capabilities.resolvedBackend,
    requestedMode: capabilities.requestedMode,
    strictWebGPU: capabilities.strictWebGPU,
    webglCompatibilityMode: classifyWebGLCompatibility(posture),
    requiredLimits: {
      worldFieldStorageBufferFloorBytes: WORLD_FIELD_STORAGE_BUFFER_FLOOR_BYTES,
      computeInvocationFloor: COMPUTE_INVOCATION_FLOOR,
    },
    proofHookDescriptions: PROOF_HOOK_DESCRIPTIONS,
    deviceLoss: buildDeviceLossSummary(posture, capabilities.strictWebGPU),
    decisions,
    notes,
  };
}
