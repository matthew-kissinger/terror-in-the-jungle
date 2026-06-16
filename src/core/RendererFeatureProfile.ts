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
  | 'debugWaterProof'
  | 'runtimeWater';

export type RendererFeaturePosture =
  | 'webgpuPrimary'
  | 'compatibilityFallback'
  | 'legacyWebGLDiagnostic'
  | 'unavailable';

export type WebGLCompatibilityMode = 'none' | 'degraded' | 'diagnostic';
export type RendererFeatureProofHook = string;
export type RendererRequiredLimitName =
  | 'maxComputeInvocationsPerWorkgroup'
  | 'maxStorageBufferBindingSize';

export type RendererFeatureDeviceLossPolicy =
  | 'reprofileAfterRestore'
  | 'requiresRendererReinit'
  | 'disabledUntilFutureCycle'
  | 'noRuntimeGpuState';

export interface RendererFeatureRequiredLimit {
  name: RendererRequiredLimitName;
  floor: number;
  required: number;
  actual: number | null;
  satisfied: boolean;
  requiredFor: string;
}

export type RendererRequiredLimitDecision = RendererFeatureRequiredLimit;

export type RendererFeatureRequiredLimits = Record<
  RendererRequiredLimitName,
  RendererFeatureRequiredLimit
> & {
  worldFieldStorageBufferFloorBytes: number;
  computeInvocationFloor: number;
};

export interface RendererFeatureDecision {
  available: boolean;
  policy: RendererFeaturePolicy;
  reason: string;
  requiredLimits: RendererFeatureRequiredLimit[];
  proofHooks: RendererFeatureProofHook[];
  deviceLossPolicy: RendererFeatureDeviceLossPolicy;
}

export type RendererFeatureDeviceLossSummary =
  RendererBackendCapabilities['deviceLoss'] & {
    contextGuard: 'WebGLContextGuard';
    diagnosticLanesReprofileAfterRestore: boolean;
    strictWebGPURequiresBackendReinit: boolean;
    runtimeWaterRestores: false;
    notes: string[];
  };

export interface RendererFeatureProfile {
  posture: RendererFeaturePosture;
  resolvedBackend: RendererBackendCapabilities['resolvedBackend'];
  requestedMode: RendererBackendCapabilities['requestedMode'];
  strictWebGPU: boolean;
  webglCompatibilityMode: WebGLCompatibilityMode;
  deviceLoss: RendererFeatureDeviceLossSummary;
  requiredLimits: RendererFeatureRequiredLimits;
  proofHookDescriptions: Record<RendererFeatureProofHook, string>;
  decisions: Record<RendererFeatureId, RendererFeatureDecision>;
  notes: string[];
}

const WORLD_FIELD_STORAGE_BUFFER_FLOOR_BYTES = 128 * 1024 * 1024;
const COMPUTE_INVOCATION_FLOOR = 128;
const PROFILE_SNAPSHOT_HOOK = 'rendererFeatureProfileSnapshot';
const PLATFORM_CAPABILITIES_HOOK = 'npm run check:platform-capabilities';

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

const SHARED_TSL_HOOKS = [PROFILE_SNAPSHOT_HOOK, 'window.__rendererFeatureProfile().decisions.sharedTslNodeMaterials', 'terrainVisualMatrix'];
const WEBGPU_COMPUTE_HOOKS = [PROFILE_SNAPSHOT_HOOK, 'window.__rendererFeatureProfile().decisions.webgpuCompute', PLATFORM_CAPABILITIES_HOOK, 'quietMachinePerfAttribution'];
const STORAGE_WORLD_FIELD_HOOKS = [PROFILE_SNAPSHOT_HOOK, 'window.__rendererFeatureProfile().decisions.storageBufferWorldFields', PLATFORM_CAPABILITIES_HOOK, 'quietMachinePerfAttribution', 'terrainBaselineProof'];
const TERRAIN_PROOF_HOOKS = [PROFILE_SNAPSHOT_HOOK, 'quietMachinePerfAttribution', 'terrainBaselineProof', 'terrainVisualMatrix'];
const DEBUG_WATER_LEVEL_HOOKS = [PROFILE_SNAPSHOT_HOOK, 'ownerDebugWaterApproval', 'terrainBaselineProof', 'terrainVisualMatrix'];
const SKY_CLOUD_POST_HOOKS = [PROFILE_SNAPSHOT_HOOK, 'window.__rendererFeatureProfile().decisions.renderPipelinePost', 'window.__skyCloudPostProofGate()', 'npm run check:tod-coherence', 'quietMachinePerfAttribution', 'todCoherenceGate', 'atmosphereEvidenceMatrix'];
const VOLUMETRIC_CLOUD_HOOKS = [PROFILE_SNAPSHOT_HOOK, 'window.__rendererFeatureProfile().decisions.volumetricCloudPrototype', 'window.__skyCloudPostProofGate()', 'npm run check:tod-coherence', 'quietMachinePerfAttribution', 'todCoherenceGate', 'atmosphereEvidenceMatrix'];
const GPU_FOREST_CULLING_HOOKS = [PROFILE_SNAPSHOT_HOOK, 'window.__rendererFeatureProfile().decisions.gpuForestCulling', 'npm run check:forest-lod-plan', 'npm run check:culling-baseline', 'quietMachinePerfAttribution', 'terrainBaselineProof', 'terrainVisualMatrix'];
const AGGREGATE_FOREST_LOD_HOOKS = [PROFILE_SNAPSHOT_HOOK, 'quietMachinePerfAttribution', 'terrainBaselineProof', 'terrainVisualMatrix', 'assetAcceptanceReview', 'assetGalleryReview'];
const NANITE_LITE_HOOKS = [PROFILE_SNAPSHOT_HOOK, 'quietMachinePerfAttribution', 'terrainVisualMatrix', 'assetAcceptanceReview'];
const OCTA_BAKE_HOOKS = [PROFILE_SNAPSHOT_HOOK, 'window.__rendererFeatureProfile().decisions.octahedralImpostorBake', 'npm run check:asset-gallery', 'assetAcceptanceReview', 'assetGalleryReview', 'terrainVisualMatrix'];
const VIETNAM_SPEC_HOOKS = ['assetAcceptanceReview', 'assetGalleryReview', 'terrainVisualMatrix'];
const HYDROLOGY_HOOKS = [PROFILE_SNAPSHOT_HOOK, 'window.__rendererFeatureProfile().decisions.hydrologyAnalysis', 'ownerDebugWaterApproval', 'terrainBaselineProof', 'terrainVisualMatrix'];
const DEBUG_WATER_PROOF_HOOKS = [PROFILE_SNAPSHOT_HOOK, 'window.__rendererFeatureProfile().decisions.debugWaterProof', 'npm run test:quick -- src/systems/environment/water/DebugWaterProof.test.ts', 'ownerDebugWaterApproval'];
const RUNTIME_WATER_HOOKS = ['ownerDebugWaterApproval', 'window.__rendererFeatureProfile().decisions.runtimeWater', 'liveReleaseGate'];

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
    requiredLimits: [...(options.requiredLimits ?? [])],
    proofHooks: [...(options.proofHooks ?? [PROFILE_SNAPSHOT_HOOK])],
    deviceLossPolicy: options.deviceLossPolicy ?? 'reprofileAfterRestore',
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
    && capabilities.isWebGPURenderer
    && !capabilities.deviceLoss.lost;
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

function makeLimitRequirement(
  name: RendererRequiredLimitName,
  floor: number,
  actual: number | null,
  requiredFor: string,
): RendererFeatureRequiredLimit {
  return {
    name,
    floor,
    required: floor,
    actual,
    satisfied: actual === null || actual >= floor,
    requiredFor,
  };
}

function buildDeviceLossSummary(
  posture: RendererFeaturePosture,
  capabilities: RendererBackendCapabilities,
): RendererFeatureDeviceLossSummary {
  return {
    ...capabilities.deviceLoss,
    contextGuard: 'WebGLContextGuard',
    diagnosticLanesReprofileAfterRestore: posture === 'webgpuPrimary',
    strictWebGPURequiresBackendReinit: capabilities.strictWebGPU,
    runtimeWaterRestores: false,
    notes: [
      'After graphics context restore, WebGPU diagnostic lanes must re-read the renderer feature profile before resuming proof work.',
      capabilities.strictWebGPU
        ? 'Strict WebGPU proof mode must fail loudly if restore resolves to a fallback backend.'
        : 'Fallback restore may keep the app shell running with WebGPU-only diagnostic lanes disabled.',
      'Runtime water has no restore path in this cycle because it is disabled.',
    ],
  };
}

function disabledDeviceLossReason(
  lostDeviceReason: string | null,
  fallbackReason: string,
): string {
  return lostDeviceReason ?? fallbackReason;
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
  const requiredLimits: RendererFeatureRequiredLimits = {
    maxComputeInvocationsPerWorkgroup: computeLimitRequirement,
    maxStorageBufferBindingSize: storageLimitRequirement,
    worldFieldStorageBufferFloorBytes: WORLD_FIELD_STORAGE_BUFFER_FLOOR_BYTES,
    computeInvocationFloor: COMPUTE_INVOCATION_FLOOR,
  };
  const storageBufferEnough = storageLimitRequirement.satisfied;
  const computeInvocationEnough = computeLimitRequirement.satisfied;
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
        { proofHooks: SHARED_TSL_HOOKS },
      )
      : makeDecision(
        false,
        'disabled',
        disabledDeviceLossReason(lostDeviceReason, 'Renderer is not the unified WebGPURenderer path.'),
        { proofHooks: SHARED_TSL_HOOKS, deviceLossPolicy: 'disabledUntilFutureCycle' },
      ),
    webgpuCompute: computeReady
      ? makeDecision(
        true,
        'requiredWebGPU',
        computeInvocationLimit === null
          ? 'Strict WebGPU renderer is ready; compute invocation limit was not reported, so feature probes must verify workgroup shape.'
          : `Strict WebGPU renderer is ready with maxComputeInvocationsPerWorkgroup=${computeInvocationLimit}.`,
        { requiredLimits: [computeLimitRequirement], proofHooks: WEBGPU_COMPUTE_HOOKS, deviceLossPolicy: 'requiresRendererReinit' },
      )
      : makeDecision(
        false,
        webgpuReady ? 'diagnosticOnly' : 'disabled',
        disabledDeviceLossReason(
          lostDeviceReason,
          webgpuReady
            ? 'WebGPU renderer is ready but adapter or compute limits are below the cycle floor.'
            : 'Requires the strict WebGPU backend; fallback and legacy WebGL paths disable compute.',
        ),
        { requiredLimits: [computeLimitRequirement], proofHooks: WEBGPU_COMPUTE_HOOKS, deviceLossPolicy: webgpuReady ? 'reprofileAfterRestore' : 'disabledUntilFutureCycle' },
      ),
    storageBufferWorldFields: worldFieldReady
      ? makeDecision(
        true,
        'requiredWebGPU',
        storageBufferLimit === null
          ? 'WebGPU compute is ready; storage-buffer limit was not reported, so field size must be guarded per allocation.'
          : `WebGPU compute is ready with maxStorageBufferBindingSize=${storageBufferLimit}.`,
        { requiredLimits: worldFieldRequirements, proofHooks: STORAGE_WORLD_FIELD_HOOKS, deviceLossPolicy: 'requiresRendererReinit' },
      )
      : makeDecision(
        false,
        computeReady ? 'diagnosticOnly' : 'disabled',
        disabledDeviceLossReason(
          lostDeviceReason,
          computeReady
            ? `Storage-buffer world fields need at least ${WORLD_FIELD_STORAGE_BUFFER_FLOOR_BYTES} bytes per binding.`
            : 'Requires WebGPU compute before allocating GPU world fields.',
        ),
        { requiredLimits: worldFieldRequirements, proofHooks: STORAGE_WORLD_FIELD_HOOKS, deviceLossPolicy: computeReady ? 'reprofileAfterRestore' : 'disabledUntilFutureCycle' },
      ),
    terrainHeightfieldErosion: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Heightfield and erosion work may run only as a TIJ terrain-authority spike; it cannot replace A Shau DEM or navmesh ownership.',
        { requiredLimits: worldFieldRequirements, proofHooks: TERRAIN_PROOF_HOOKS, deviceLossPolicy: 'requiresRendererReinit' },
      )
      : makeDecision(
        false,
        'disabled',
        disabledDeviceLossReason(lostDeviceReason, 'Heightfield and erosion prototypes wait on WebGPU compute and storage-buffer world fields.'),
        { requiredLimits: worldFieldRequirements, proofHooks: TERRAIN_PROOF_HOOKS, deviceLossPolicy: 'disabledUntilFutureCycle' },
      ),
    debugWaterLevelProof: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Debug-only water-level and basin/river proof buffers may be produced for future VODA design; they cannot become gameplay water.',
        { requiredLimits: worldFieldRequirements, proofHooks: DEBUG_WATER_LEVEL_HOOKS, deviceLossPolicy: 'requiresRendererReinit' },
      )
      : makeDecision(
        false,
        'disabled',
        disabledDeviceLossReason(lostDeviceReason, 'Debug water-level proof waits on WebGPU world-field capability and owner approval.'),
        { requiredLimits: worldFieldRequirements, proofHooks: DEBUG_WATER_LEVEL_HOOKS, deviceLossPolicy: 'disabledUntilFutureCycle' },
      ),
    renderPipelinePost: webgpuReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Allowed only behind dev/proof gates until the cloud/post evidence matrix passes.',
        { proofHooks: SKY_CLOUD_POST_HOOKS, deviceLossPolicy: 'requiresRendererReinit' },
      )
      : makeDecision(
        false,
        'disabled',
        disabledDeviceLossReason(lostDeviceReason, 'RenderPipeline post experiments are WebGPU-only this cycle.'),
        { proofHooks: SKY_CLOUD_POST_HOOKS, deviceLossPolicy: 'disabledUntilFutureCycle' },
      ),
    volumetricCloudPrototype: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Fable-style compute clouds are allowed as a guarded WebGPU prototype, not production default.',
        { requiredLimits: worldFieldRequirements, proofHooks: VOLUMETRIC_CLOUD_HOOKS, deviceLossPolicy: 'requiresRendererReinit' },
      )
      : makeDecision(
        false,
        'disabled',
        disabledDeviceLossReason(lostDeviceReason, 'Cloud compute prototype waits on WebGPU compute and storage-buffer world fields.'),
        { requiredLimits: worldFieldRequirements, proofHooks: VOLUMETRIC_CLOUD_HOOKS, deviceLossPolicy: 'disabledUntilFutureCycle' },
      ),
    gpuForestCulling: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Forest culling may be prototyped with GPU world fields; production vegetation remains TIJ-owned.',
        { requiredLimits: worldFieldRequirements, proofHooks: GPU_FOREST_CULLING_HOOKS, deviceLossPolicy: 'requiresRendererReinit' },
      )
      : makeDecision(
        false,
        'disabled',
        disabledDeviceLossReason(lostDeviceReason, 'GPU forest culling waits on WebGPU compute and storage-buffer world fields.'),
        { requiredLimits: worldFieldRequirements, proofHooks: GPU_FOREST_CULLING_HOOKS, deviceLossPolicy: 'disabledUntilFutureCycle' },
      ),
    aggregateForestLod: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Aggregate forest LOD may evaluate TIJ-owned culling and impostor bands; it cannot port the full Fable Forests runtime.',
        { requiredLimits: worldFieldRequirements, proofHooks: AGGREGATE_FOREST_LOD_HOOKS, deviceLossPolicy: 'requiresRendererReinit' },
      )
      : makeDecision(
        false,
        'disabled',
        disabledDeviceLossReason(lostDeviceReason, 'Aggregate forest LOD waits on WebGPU world-field capability and accepted source assets.'),
        { requiredLimits: worldFieldRequirements, proofHooks: AGGREGATE_FOREST_LOD_HOOKS, deviceLossPolicy: 'disabledUntilFutureCycle' },
      ),
    naniteLiteClusterStudy: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Nanite-lite cluster study may evaluate hero-tree clusters and aggregate impostors; true meshlet Nanite remains out of scope.',
        { requiredLimits: worldFieldRequirements, proofHooks: NANITE_LITE_HOOKS, deviceLossPolicy: 'requiresRendererReinit' },
      )
      : makeDecision(
        false,
        'disabled',
        disabledDeviceLossReason(lostDeviceReason, 'Nanite-lite cluster study waits on WebGPU world-field capability and accepted source assets.'),
        { requiredLimits: worldFieldRequirements, proofHooks: NANITE_LITE_HOOKS, deviceLossPolicy: 'disabledUntilFutureCycle' },
      ),
    octahedralImpostorBake: sharedNodeSafe
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Impostor capture is a bake/proof surface only until accepted tree source assets exist.',
        { proofHooks: OCTA_BAKE_HOOKS },
      )
      : makeDecision(
        false,
        'disabled',
        disabledDeviceLossReason(lostDeviceReason, 'Impostor bake requires the unified renderer path for proof parity.'),
        { proofHooks: OCTA_BAKE_HOOKS, deviceLossPolicy: 'disabledUntilFutureCycle' },
      ),
    vietnamSpeciesSourceSpecs: makeDecision(
      true,
      'diagnosticOnly',
      'Species work is a Vietnam source-asset specification lane only; no Fable generated species or assets are runtime inputs.',
      { proofHooks: VIETNAM_SPEC_HOOKS, deviceLossPolicy: 'noRuntimeGpuState' },
    ),
    hydrologyAnalysis: worldFieldReady
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Hydrology can produce analysis buffers for future VODA design; it cannot drive runtime water this cycle.',
        { requiredLimits: worldFieldRequirements, proofHooks: HYDROLOGY_HOOKS, deviceLossPolicy: 'requiresRendererReinit' },
      )
      : makeDecision(
        false,
        'disabled',
        disabledDeviceLossReason(lostDeviceReason, 'Hydrology analysis waits on WebGPU compute and storage-buffer world fields.'),
        { requiredLimits: worldFieldRequirements, proofHooks: HYDROLOGY_HOOKS, deviceLossPolicy: 'disabledUntilFutureCycle' },
      ),
    debugWaterProof: sharedNodeSafe
      ? makeDecision(
        true,
        'diagnosticOnly',
        'Debug basin/river water proofs may run as non-authoritative data overlays; they do not enable gameplay water.',
        { proofHooks: DEBUG_WATER_PROOF_HOOKS, deviceLossPolicy: 'reprofileAfterRestore' },
      )
      : makeDecision(
        false,
        'disabled',
        disabledDeviceLossReason(lostDeviceReason, 'Debug water proof waits on the unified renderer path for diagnostic parity.'),
        { proofHooks: DEBUG_WATER_PROOF_HOOKS, deviceLossPolicy: 'disabledUntilFutureCycle' },
      ),
    runtimeWater: makeDecision(
      false,
      'disabled',
      'Runtime water is explicitly out of scope for this cycle.',
      { proofHooks: RUNTIME_WATER_HOOKS, deviceLossPolicy: 'disabledUntilFutureCycle' },
    ),
  };

  return {
    posture,
    resolvedBackend: capabilities.resolvedBackend,
    requestedMode: capabilities.requestedMode,
    strictWebGPU: capabilities.strictWebGPU,
    webglCompatibilityMode: classifyWebGLCompatibility(posture),
    deviceLoss: buildDeviceLossSummary(posture, capabilities),
    requiredLimits,
    proofHookDescriptions: PROOF_HOOK_DESCRIPTIONS,
    decisions,
    notes,
  };
}
