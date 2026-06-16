// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export type VisualForestLaneGroup = 'sky-cloud-post' | 'forest-nanite-lite';

export type VisualForestLaneId =
  | 'renderPipelinePostProof'
  | 'volumetricCloudPrototype'
  | 'cloudShadowPrototype'
  | 'gpuForestCullingProof'
  | 'aggregateForestLodProof'
  | 'octahedralImpostorBakeSpec'
  | 'naniteLiteClusterStudy';

export type VisualForestAuthorityId =
  | 'atmosphereSystem'
  | 'lightingRig'
  | 'scenarioAtmospherePresets'
  | 'sunDiscMesh'
  | 'postProcessingShim'
  | 'todCoherenceGate'
  | 'atmosphereEvidenceMatrix'
  | 'globalBillboardSystem'
  | 'gpuBillboardSystem'
  | 'terrainVegetationRuntime'
  | 'vegetationScatterer'
  | 'jungleGroundRing'
  | 'vegetationTypes'
  | 'vietnamSpeciesSourceSpecs'
  | 'assetAcceptanceStandard'
  | 'assetGalleryProof'
  | 'vegetationHorizonAudit'
  | 'vegetationGroundingAudit';

export type VisualForestProofHook =
  | 'rendererFeatureProfileSnapshot'
  | 'todCoherenceGate'
  | 'atmosphereEvidenceMatrix'
  | 'terrainBaselineProof'
  | 'terrainVisualMatrix'
  | 'assetAcceptanceReview'
  | 'assetGalleryReview'
  | 'vegetationHorizonAudit'
  | 'vegetationGroundingAudit'
  | 'quietMachinePerfAttribution'
  | 'liveReleaseGate';

export type VisualForestForbiddenOutput =
  | 'secondLightingAuthority'
  | 'defaultOnCloudOrPostReplacement'
  | 'fallbackBehaviorUnspecified'
  | 'retiredPostProcessPathRevival'
  | 'fableSkyCloudPostPort'
  | 'fableForestRuntimePort'
  | 'fableGeneratedSpecies'
  | 'unacceptedSourceAsset'
  | 'hiddenRoutesBasesOrNpcs'
  | 'defaultOnForestHlodSwap'
  | 'trueMeshletNanite'
  | 'runtimeWaterDependency';

export interface VisualForestProtectedAuthority {
  readonly id: VisualForestAuthorityId;
  readonly displayName: string;
  readonly files: readonly string[];
  readonly contract: string;
}

export interface VisualForestWorldSystemsLaneSpec {
  readonly id: VisualForestLaneId;
  readonly group: VisualForestLaneGroup;
  readonly displayName: string;
  readonly status: 'diagnostic-only' | 'source-spec-only';
  readonly runtimeDefault: false;
  readonly webgpuPrimary: boolean;
  readonly webglFallbackBehavior: 'existing-authority-only' | 'disabled-or-existing-authority-only';
  readonly lightingAuthorityMutation: false;
  readonly runtimeVegetationMutation: 'none';
  readonly runtimeWaterDependency: 'none';
  readonly fableAssetsAllowed: false;
  readonly fableRuntimePortAllowed: false;
  readonly trueMeshletNanite: false;
  readonly allowedOutputs: readonly string[];
  readonly forbiddenOutputs: readonly VisualForestForbiddenOutput[];
  readonly protectedAuthorities: readonly VisualForestAuthorityId[];
  readonly proofHooks: readonly VisualForestProofHook[];
  readonly notes: readonly string[];
}

const SKY_CLOUD_POST_AUTHORITIES: readonly VisualForestAuthorityId[] = [
  'atmosphereSystem',
  'lightingRig',
  'scenarioAtmospherePresets',
  'sunDiscMesh',
  'postProcessingShim',
  'todCoherenceGate',
  'atmosphereEvidenceMatrix',
];

const FOREST_NANITE_AUTHORITIES: readonly VisualForestAuthorityId[] = [
  'globalBillboardSystem',
  'gpuBillboardSystem',
  'terrainVegetationRuntime',
  'vegetationScatterer',
  'jungleGroundRing',
  'vegetationTypes',
  'vietnamSpeciesSourceSpecs',
  'assetAcceptanceStandard',
  'assetGalleryProof',
  'vegetationHorizonAudit',
  'vegetationGroundingAudit',
];

const SKY_CLOUD_POST_HOOKS: readonly VisualForestProofHook[] = [
  'rendererFeatureProfileSnapshot',
  'todCoherenceGate',
  'atmosphereEvidenceMatrix',
  'quietMachinePerfAttribution',
];

const FOREST_NANITE_HOOKS: readonly VisualForestProofHook[] = [
  'rendererFeatureProfileSnapshot',
  'assetAcceptanceReview',
  'assetGalleryReview',
  'terrainBaselineProof',
  'terrainVisualMatrix',
  'vegetationHorizonAudit',
  'vegetationGroundingAudit',
  'quietMachinePerfAttribution',
];

const COMMON_FORBIDDEN_OUTPUTS: readonly VisualForestForbiddenOutput[] = [
  'runtimeWaterDependency',
  'fableSkyCloudPostPort',
  'fableForestRuntimePort',
  'fableGeneratedSpecies',
  'unacceptedSourceAsset',
  'trueMeshletNanite',
];

const SKY_FORBIDDEN_OUTPUTS: readonly VisualForestForbiddenOutput[] = [
  ...COMMON_FORBIDDEN_OUTPUTS,
  'secondLightingAuthority',
  'defaultOnCloudOrPostReplacement',
  'fallbackBehaviorUnspecified',
  'retiredPostProcessPathRevival',
];

const FOREST_FORBIDDEN_OUTPUTS: readonly VisualForestForbiddenOutput[] = [
  ...COMMON_FORBIDDEN_OUTPUTS,
  'hiddenRoutesBasesOrNpcs',
  'defaultOnForestHlodSwap',
];

export const VISUAL_FOREST_PROTECTED_AUTHORITIES: readonly VisualForestProtectedAuthority[] = [
  {
    id: 'atmosphereSystem',
    displayName: 'AtmosphereSystem sky, fog, cloud, and scene-light seam',
    files: ['src/systems/environment/AtmosphereSystem.ts'],
    contract: 'Owns sky, fog color, cloud coverage intent, renderer-light application, and atmosphere timing markers.',
  },
  {
    id: 'lightingRig',
    displayName: 'LightingRig single lighting authority',
    files: ['src/systems/environment/LightingRig.ts'],
    contract: 'Owns the shared lighting rig bindings consumed by terrain, foliage, NPC impostors, and scene lights.',
  },
  {
    id: 'scenarioAtmospherePresets',
    displayName: 'Scenario atmosphere presets',
    files: ['src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts'],
    contract: 'Own per-scenario sun, fog, cloud coverage, TOD cycle, and rig-trim defaults.',
  },
  {
    id: 'sunDiscMesh',
    displayName: 'SunDiscMesh visible sun body',
    files: ['src/systems/environment/atmosphere/SunDiscMesh.ts'],
    contract: 'Owns the depth-tested hot sun body; cloud/post work cannot move visible-sun authority into the sky dome.',
  },
  {
    id: 'postProcessingShim',
    displayName: 'PostProcessingManager compatibility shim',
    files: ['src/systems/effects/PostProcessingManager.ts'],
    contract: 'Remains a no-op compatibility shim until a future node-based post pipeline is explicitly approved.',
  },
  {
    id: 'todCoherenceGate',
    displayName: 'TOD coherence gate',
    files: ['scripts/tod-coherence-gate.ts', 'scripts/capture-tod-coherence-sweep.ts'],
    contract: 'Required pre-deploy evidence for sky, cloud, post, fog, shadow, or lighting authority changes.',
  },
  {
    id: 'atmosphereEvidenceMatrix',
    displayName: 'All-mode atmosphere evidence matrix',
    files: ['scripts/capture-atmosphere-recovery-shots.ts'],
    contract: 'Captures all-mode sky/cloud/terrain readability evidence before shared visual behavior is promoted.',
  },
  {
    id: 'globalBillboardSystem',
    displayName: 'Global billboard vegetation runtime',
    files: ['src/systems/world/billboard/GlobalBillboardSystem.ts'],
    contract: 'Owns active biome vegetation selection and forwards accepted instances into the GPU billboard runtime.',
  },
  {
    id: 'gpuBillboardSystem',
    displayName: 'GPU billboard renderer',
    files: ['src/systems/world/billboard/GPUBillboardSystem.ts'],
    contract: 'Owns current billboard/impostor rendering; forest LOD study must adapt around this runtime, not replace it wholesale.',
  },
  {
    id: 'terrainVegetationRuntime',
    displayName: 'Terrain vegetation runtime',
    files: ['src/systems/terrain/TerrainVegetationRuntime.ts'],
    contract: 'Owns budgeted near and mid vegetation updates around the player.',
  },
  {
    id: 'vegetationScatterer',
    displayName: 'VegetationScatterer cell residency',
    files: ['src/systems/terrain/VegetationScatterer.ts'],
    contract: 'Owns mid/canopy cell residency, biome classification, exclusion zones, and terrain-aligned height placement.',
  },
  {
    id: 'jungleGroundRing',
    displayName: 'JungleGroundRing near-field ground cover',
    files: ['src/systems/terrain/JungleGroundRing.ts'],
    contract: 'Owns camera-following ground-cover rings; Fable-style aggregate ideas can inform this lane without importing Fable runtime.',
  },
  {
    id: 'vegetationTypes',
    displayName: 'Runtime vegetation registry',
    files: ['src/config/vegetationTypes.ts'],
    contract: 'Owns the accepted runtime vegetation IDs, impostor atlas profiles, distance bands, and placement tuning.',
  },
  {
    id: 'vietnamSpeciesSourceSpecs',
    displayName: 'Vietnam species source specs',
    files: ['src/config/worldSystems/VietnamSpeciesSourceSpecs.ts'],
    contract: 'Owns future source-only species requirements; generated Fable species and assets are not runtime inputs.',
  },
  {
    id: 'assetAcceptanceStandard',
    displayName: 'Asset acceptance standard',
    files: ['docs/ASSET_ACCEPTANCE_STANDARD.md'],
    contract: 'Required review surface for source assets before gallery, runtime registry, or import-pipeline changes.',
  },
  {
    id: 'assetGalleryProof',
    displayName: 'Asset gallery proof',
    files: ['src/dev/assetGallery/AssetGalleryApp.ts', 'scripts/check-asset-gallery.ts'],
    contract: 'Required visual review surface for accepted source assets before runtime promotion.',
  },
  {
    id: 'vegetationHorizonAudit',
    displayName: 'Vegetation horizon audit',
    files: ['scripts/vegetation-horizon-audit.ts'],
    contract: 'Static far-canopy and vegetation-distance evidence before large-mode forest/LOD decisions.',
  },
  {
    id: 'vegetationGroundingAudit',
    displayName: 'Vegetation grounding audit',
    files: ['scripts/vegetation-grounding-audit.ts'],
    contract: 'Atlas-alpha and slope-placement evidence before source vegetation or LOD promotion.',
  },
] as const;

export const VISUAL_FOREST_WORLD_SYSTEMS_PROOF_SPECS: readonly VisualForestWorldSystemsLaneSpec[] = [
  {
    id: 'renderPipelinePostProof',
    group: 'sky-cloud-post',
    displayName: 'Render-pipeline post proof',
    status: 'diagnostic-only',
    runtimeDefault: false,
    webgpuPrimary: true,
    webglFallbackBehavior: 'existing-authority-only',
    lightingAuthorityMutation: false,
    runtimeVegetationMutation: 'none',
    runtimeWaterDependency: 'none',
    fableAssetsAllowed: false,
    fableRuntimePortAllowed: false,
    trueMeshletNanite: false,
    allowedOutputs: [
      'default-off post-process pipeline notes or proof flags',
      'ablation artifacts comparing no-op post shim against any WebGPU-only candidate',
      'handoff notes for a future node-based post pipeline',
    ],
    forbiddenOutputs: SKY_FORBIDDEN_OUTPUTS,
    protectedAuthorities: SKY_CLOUD_POST_AUTHORITIES,
    proofHooks: [...SKY_CLOUD_POST_HOOKS, 'liveReleaseGate'],
    notes: [
      'PostProcessingManager is intentionally a no-op shim today.',
      'Any default-on post replacement must pass TOD, atmosphere, fallback, perf, and live-release gates.',
    ],
  },
  {
    id: 'volumetricCloudPrototype',
    group: 'sky-cloud-post',
    displayName: 'Volumetric cloud prototype',
    status: 'diagnostic-only',
    runtimeDefault: false,
    webgpuPrimary: true,
    webglFallbackBehavior: 'disabled-or-existing-authority-only',
    lightingAuthorityMutation: false,
    runtimeVegetationMutation: 'none',
    runtimeWaterDependency: 'none',
    fableAssetsAllowed: false,
    fableRuntimePortAllowed: false,
    trueMeshletNanite: false,
    allowedOutputs: [
      'WebGPU-only cloud prototype behind dev/proof flags',
      'cloud coverage and follow-target diagnostics that continue to read AtmosphereSystem authority',
      'screenshot artifacts for sky coverage, ground readability, and aircraft-cloud views',
    ],
    forbiddenOutputs: SKY_FORBIDDEN_OUTPUTS,
    protectedAuthorities: SKY_CLOUD_POST_AUTHORITIES,
    proofHooks: SKY_CLOUD_POST_HOOKS,
    notes: [
      'ScenarioAtmospherePresets and AtmosphereSystem remain cloud coverage authority.',
      'Fallback can keep current sky/cloud behavior or disable the prototype; it does not need a mirrored WebGL feature.',
    ],
  },
  {
    id: 'cloudShadowPrototype',
    group: 'sky-cloud-post',
    displayName: 'Cloud-shadow prototype',
    status: 'diagnostic-only',
    runtimeDefault: false,
    webgpuPrimary: true,
    webglFallbackBehavior: 'disabled-or-existing-authority-only',
    lightingAuthorityMutation: false,
    runtimeVegetationMutation: 'none',
    runtimeWaterDependency: 'none',
    fableAssetsAllowed: false,
    fableRuntimePortAllowed: false,
    trueMeshletNanite: false,
    allowedOutputs: [
      'debug-only cloud-shadow masks for terrain readability review',
      'light-authority notes describing how masks would multiply LightingRig output',
      'TOD sweep artifacts before any visual promotion',
    ],
    forbiddenOutputs: SKY_FORBIDDEN_OUTPUTS,
    protectedAuthorities: SKY_CLOUD_POST_AUTHORITIES,
    proofHooks: SKY_CLOUD_POST_HOOKS,
    notes: [
      'Cloud shadows must not become a second sun, fog, or exposure authority.',
      'Any mask must be reviewed against terrain, vegetation, NPC impostor, and fallback readability.',
    ],
  },
  {
    id: 'gpuForestCullingProof',
    group: 'forest-nanite-lite',
    displayName: 'GPU forest culling proof',
    status: 'diagnostic-only',
    runtimeDefault: false,
    webgpuPrimary: true,
    webglFallbackBehavior: 'disabled-or-existing-authority-only',
    lightingAuthorityMutation: false,
    runtimeVegetationMutation: 'none',
    runtimeWaterDependency: 'none',
    fableAssetsAllowed: false,
    fableRuntimePortAllowed: false,
    trueMeshletNanite: false,
    allowedOutputs: [
      'default-off culling diagnostics over existing GlobalBillboardSystem and TerrainVegetationRuntime data',
      'artifact JSON comparing candidate culling decisions against current vegetation residency',
      'Open Frontier and A Shau proof notes before any runtime promotion',
    ],
    forbiddenOutputs: FOREST_FORBIDDEN_OUTPUTS,
    protectedAuthorities: FOREST_NANITE_AUTHORITIES,
    proofHooks: FOREST_NANITE_HOOKS,
    notes: [
      'Current vegetation runtime remains authoritative until trusted perf and visual proof justify a change.',
      'Any runtime culling/HLOD swap must prove route, base, NPC, vehicle, and fallback readability.',
    ],
  },
  {
    id: 'aggregateForestLodProof',
    group: 'forest-nanite-lite',
    displayName: 'Aggregate forest LOD proof',
    status: 'source-spec-only',
    runtimeDefault: false,
    webgpuPrimary: true,
    webglFallbackBehavior: 'disabled-or-existing-authority-only',
    lightingAuthorityMutation: false,
    runtimeVegetationMutation: 'none',
    runtimeWaterDependency: 'none',
    fableAssetsAllowed: false,
    fableRuntimePortAllowed: false,
    trueMeshletNanite: false,
    allowedOutputs: [
      'accepted-source requirements for canopy clusters and far coverage',
      'gallery and horizon audit artifacts for aggregate LOD discussion',
      'default-off source-only plans for future imported tree families',
    ],
    forbiddenOutputs: FOREST_FORBIDDEN_OUTPUTS,
    protectedAuthorities: FOREST_NANITE_AUTHORITIES,
    proofHooks: FOREST_NANITE_HOOKS,
    notes: [
      'Aggregate LOD is allowed only as TIJ-owned source planning until accepted assets and visual proof exist.',
      'This lane cannot import the full Fable Forests runtime.',
    ],
  },
  {
    id: 'octahedralImpostorBakeSpec',
    group: 'forest-nanite-lite',
    displayName: 'Octahedral impostor bake spec',
    status: 'source-spec-only',
    runtimeDefault: false,
    webgpuPrimary: false,
    webglFallbackBehavior: 'existing-authority-only',
    lightingAuthorityMutation: false,
    runtimeVegetationMutation: 'none',
    runtimeWaterDependency: 'none',
    fableAssetsAllowed: false,
    fableRuntimePortAllowed: false,
    trueMeshletNanite: false,
    allowedOutputs: [
      'source-only bake requirements for future accepted vegetation families',
      'asset-gallery and grounding artifacts for accepted source review',
      'non-runtime bake metadata notes',
    ],
    forbiddenOutputs: FOREST_FORBIDDEN_OUTPUTS,
    protectedAuthorities: FOREST_NANITE_AUTHORITIES,
    proofHooks: [
      'rendererFeatureProfileSnapshot',
      'assetAcceptanceReview',
      'assetGalleryReview',
      'vegetationGroundingAudit',
      'terrainVisualMatrix',
    ],
    notes: [
      'Bake specs can be renderer-independent documentation, but runtime promotion still needs the full visual/perf gates.',
      'No generated Fable species or Fable bake outputs are approved by this lane.',
    ],
  },
  {
    id: 'naniteLiteClusterStudy',
    group: 'forest-nanite-lite',
    displayName: 'Nanite-lite cluster study',
    status: 'diagnostic-only',
    runtimeDefault: false,
    webgpuPrimary: true,
    webglFallbackBehavior: 'disabled-or-existing-authority-only',
    lightingAuthorityMutation: false,
    runtimeVegetationMutation: 'none',
    runtimeWaterDependency: 'none',
    fableAssetsAllowed: false,
    fableRuntimePortAllowed: false,
    trueMeshletNanite: false,
    allowedOutputs: [
      'hero-tree cluster feasibility notes',
      'aggregate impostor and cluster-card diagnostic artifacts',
      'source-only constraints for future accepted canopy assets',
    ],
    forbiddenOutputs: FOREST_FORBIDDEN_OUTPUTS,
    protectedAuthorities: FOREST_NANITE_AUTHORITIES,
    proofHooks: FOREST_NANITE_HOOKS,
    notes: [
      'Nanite-lite means cluster and aggregate study only; true meshlet Nanite is not in scope.',
      'No runtime geometry substitution lands without accepted source assets and quiet-machine proof.',
    ],
  },
] as const;
