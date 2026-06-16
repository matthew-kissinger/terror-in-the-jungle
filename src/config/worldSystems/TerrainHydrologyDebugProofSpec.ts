// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export type TerrainHydrologyLaneId =
  | 'heightfieldAuthorityAudit'
  | 'erosionCandidateMasks'
  | 'hydrologyAnalysisBuffers'
  | 'debugWaterLevelProof';

export type TerrainHydrologyProtectedAuthorityId =
  | 'terrainSystem'
  | 'terrainSurfaceRuntime'
  | 'heightProviderFactory'
  | 'aShauDemConfig'
  | 'openFrontierSeedConfig'
  | 'mapSeedRegistry'
  | 'prebakedNavmeshAssets'
  | 'prebakedHeightmapAssets';

export type TerrainHydrologyProofHook =
  | 'rendererFeatureProfileSnapshot'
  | 'terrainBaselineProof'
  | 'terrainVisualMatrix'
  | 'quietMachinePerfAttribution'
  | 'ownerDebugWaterApproval'
  | 'liveReleaseGate';

export type TerrainHydrologyForbiddenOutput =
  | 'runtimeWaterRendering'
  | 'runtimeWaterQueryPhysics'
  | 'swimmingOrBuoyancy'
  | 'watercraftSpawnOrBoarding'
  | 'waterSystemReactivation'
  | 'hydrologySystemReactivation'
  | 'terrainAuthoritySwap'
  | 'demOrNavmeshMutation'
  | 'fableAssetImport'
  | 'fableWaterMaterial';

export interface TerrainHydrologyProtectedAuthority {
  readonly id: TerrainHydrologyProtectedAuthorityId;
  readonly displayName: string;
  readonly files: readonly string[];
  readonly contract: string;
}

export interface TerrainHydrologyDebugLaneSpec {
  readonly id: TerrainHydrologyLaneId;
  readonly displayName: string;
  readonly status: 'diagnostic-only' | 'owner-approval-required';
  readonly runtimeDefault: false;
  readonly authoritativeTerrainMutation: false;
  readonly runtimeWaterDependency: 'none';
  readonly waterOutput: 'none' | 'debug-only-water-level-proof';
  readonly fableAssetsAllowed: false;
  readonly allowedOutputs: readonly string[];
  readonly forbiddenOutputs: readonly TerrainHydrologyForbiddenOutput[];
  readonly protectedAuthorities: readonly TerrainHydrologyProtectedAuthorityId[];
  readonly proofHooks: readonly TerrainHydrologyProofHook[];
  readonly notes: readonly string[];
}

const SHARED_PROOF_HOOKS: readonly TerrainHydrologyProofHook[] = [
  'rendererFeatureProfileSnapshot',
  'terrainBaselineProof',
  'terrainVisualMatrix',
  'quietMachinePerfAttribution',
];

const WATER_PROOF_HOOKS: readonly TerrainHydrologyProofHook[] = [
  'rendererFeatureProfileSnapshot',
  'terrainBaselineProof',
  'terrainVisualMatrix',
  'quietMachinePerfAttribution',
  'ownerDebugWaterApproval',
];

const ALL_PROTECTED_AUTHORITIES: readonly TerrainHydrologyProtectedAuthorityId[] = [
  'terrainSystem',
  'terrainSurfaceRuntime',
  'heightProviderFactory',
  'aShauDemConfig',
  'openFrontierSeedConfig',
  'mapSeedRegistry',
  'prebakedNavmeshAssets',
  'prebakedHeightmapAssets',
];

const RUNTIME_WATER_FORBIDDEN_OUTPUTS: readonly TerrainHydrologyForbiddenOutput[] = [
  'runtimeWaterRendering',
  'runtimeWaterQueryPhysics',
  'swimmingOrBuoyancy',
  'watercraftSpawnOrBoarding',
  'waterSystemReactivation',
  'hydrologySystemReactivation',
  'terrainAuthoritySwap',
  'demOrNavmeshMutation',
  'fableAssetImport',
  'fableWaterMaterial',
];

export const TERRAIN_HYDROLOGY_PROTECTED_AUTHORITIES: readonly TerrainHydrologyProtectedAuthority[] = [
  {
    id: 'terrainSystem',
    displayName: 'TerrainSystem runtime authority',
    files: ['src/systems/terrain/TerrainSystem.ts'],
    contract: 'Owns runtime terrain construction and must not be replaced by Fable heightfield code.',
  },
  {
    id: 'terrainSurfaceRuntime',
    displayName: 'TerrainSurfaceRuntime gameplay surface',
    files: ['src/systems/terrain/TerrainSurfaceRuntime.ts'],
    contract: 'Owns CPU gameplay surface sampling for DEM-scale and seeded worlds.',
  },
  {
    id: 'heightProviderFactory',
    displayName: 'HeightProviderFactory source adapter',
    files: ['src/systems/terrain/HeightProviderFactory.ts'],
    contract: 'Owns DEM, seeded height, and baked-heightmap provider selection.',
  },
  {
    id: 'aShauDemConfig',
    displayName: 'A Shau DEM and navmesh config',
    files: [
      'src/config/AShauValleyConfig.ts',
      'public/data/vietnam/big-map/a-shau-z14-9x9.f32',
      'public/data/navmesh/a_shau_valley.bin',
    ],
    contract: 'A Shau keeps real DEM metadata and prebaked full-battlefield navmesh authority.',
  },
  {
    id: 'openFrontierSeedConfig',
    displayName: 'Open Frontier seeded terrain config',
    files: [
      'src/config/OpenFrontierConfig.ts',
      'public/data/navmesh/open_frontier-42.bin',
      'public/data/heightmaps/open_frontier-42.f32',
    ],
    contract: 'Open Frontier keeps seeded terrain plus prebaked navmesh/heightmap authority.',
  },
  {
    id: 'mapSeedRegistry',
    displayName: 'Map seed registry',
    files: ['src/config/MapSeedRegistry.ts'],
    contract: 'Generated modes keep explicit navmesh/heightmap seed pairs.',
  },
  {
    id: 'prebakedNavmeshAssets',
    displayName: 'Prebaked navmesh assets',
    files: ['scripts/prebake-navmesh.ts', 'public/data/navmesh/bake-manifest.json'],
    contract: 'Build-time navmesh generation remains the source of navigation assets.',
  },
  {
    id: 'prebakedHeightmapAssets',
    displayName: 'Prebaked heightmap assets',
    files: ['scripts/prebake-navmesh.ts', 'public/data/heightmaps/open_frontier-42.f32'],
    contract: 'Build-time heightmap grids remain the seeded-world gameplay terrain surface input.',
  },
] as const;

export const TERRAIN_HYDROLOGY_DEBUG_PROOF_SPECS: readonly TerrainHydrologyDebugLaneSpec[] = [
  {
    id: 'heightfieldAuthorityAudit',
    displayName: 'Heightfield authority audit',
    status: 'diagnostic-only',
    runtimeDefault: false,
    authoritativeTerrainMutation: false,
    runtimeWaterDependency: 'none',
    waterOutput: 'none',
    fableAssetsAllowed: false,
    allowedOutputs: [
      'offline comparison notes between source DEM/heightmap data and candidate world-field buffers',
      'debug histograms for slope, elevation, and gameplay-surface sampling drift',
      'handoff notes for future terrain-authoring spikes',
    ],
    forbiddenOutputs: RUNTIME_WATER_FORBIDDEN_OUTPUTS,
    protectedAuthorities: ALL_PROTECTED_AUTHORITIES,
    proofHooks: SHARED_PROOF_HOOKS,
    notes: [
      'Fable-style heightfields can inform diagnostics only; TerrainSystem and existing providers remain authoritative.',
      'No generated DEM, runtime terrain source, or navmesh replacement is approved by this lane.',
    ],
  },
  {
    id: 'erosionCandidateMasks',
    displayName: 'Erosion candidate masks',
    status: 'diagnostic-only',
    runtimeDefault: false,
    authoritativeTerrainMutation: false,
    runtimeWaterDependency: 'none',
    waterOutput: 'none',
    fableAssetsAllowed: false,
    allowedOutputs: [
      'candidate masks for future offline erosion review',
      'terrain-material or route-risk annotations for visual review',
      'non-authoritative screenshots or JSON samples for owner discussion',
    ],
    forbiddenOutputs: RUNTIME_WATER_FORBIDDEN_OUTPUTS,
    protectedAuthorities: ALL_PROTECTED_AUTHORITIES,
    proofHooks: SHARED_PROOF_HOOKS,
    notes: [
      'Hydraulic or thermal erosion ideas stay a review surface until a future terrain cycle approves terrain mutation.',
      'A Shau DEM, Open Frontier seed heightmaps, and navmesh binaries must not be modified by this lane.',
    ],
  },
  {
    id: 'hydrologyAnalysisBuffers',
    displayName: 'Hydrology analysis buffers',
    status: 'owner-approval-required',
    runtimeDefault: false,
    authoritativeTerrainMutation: false,
    runtimeWaterDependency: 'none',
    waterOutput: 'debug-only-water-level-proof',
    fableAssetsAllowed: false,
    allowedOutputs: [
      'debug moisture, flow, basin, and river analysis buffers',
      'default-off water-level proof overlays for future VODA design',
      'artifact JSON describing where a future water authority might attach',
    ],
    forbiddenOutputs: RUNTIME_WATER_FORBIDDEN_OUTPUTS,
    protectedAuthorities: ALL_PROTECTED_AUTHORITIES,
    proofHooks: WATER_PROOF_HOOKS,
    notes: [
      'Hydrology is drainage/material/debug input only until the owner approves a future VODA gameplay-water cycle.',
      'This lane cannot revive hydrology ribbons, global water planes, water queries, swimming, buoyancy, or boats.',
    ],
  },
  {
    id: 'debugWaterLevelProof',
    displayName: 'Debug water-level proof',
    status: 'owner-approval-required',
    runtimeDefault: false,
    authoritativeTerrainMutation: false,
    runtimeWaterDependency: 'none',
    waterOutput: 'debug-only-water-level-proof',
    fableAssetsAllowed: false,
    allowedOutputs: [
      'debug-only basin, river, or water-level overlay screenshots',
      'default-off proof buffers used to discuss a future water-level authority',
      'non-gameplay validation artifacts for placement and readability review',
    ],
    forbiddenOutputs: RUNTIME_WATER_FORBIDDEN_OUTPUTS,
    protectedAuthorities: ALL_PROTECTED_AUTHORITIES,
    proofHooks: [...WATER_PROOF_HOOKS, 'liveReleaseGate'],
    notes: [
      'This is a proof surface, not production gameplay water.',
      'Any default-on runtime water, boat, buoyancy, or swimming path requires a separate owner-approved VODA cycle.',
    ],
  },
] as const;
