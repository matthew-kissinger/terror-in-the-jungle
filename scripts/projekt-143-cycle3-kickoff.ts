#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

type CheckStatus = 'pass' | 'warn' | 'fail';
type TargetStatus = 'evidence_complete' | 'ready_for_branch' | 'needs_decision' | 'needs_baseline' | 'blocked';

type Cycle3Target = {
  id: string;
  bureau: 'KB-LOAD' | 'KB-OPTIK' | 'KB-CULL' | 'KB-TERRAIN' | 'KB-EFFECTS';
  status: TargetStatus;
  priority: number;
  summary: string;
  evidence: Record<string, unknown>;
  requiredBefore: string[];
  acceptance: string[];
  nonClaims: string[];
};

type KickoffReport = {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-cycle3-kickoff';
  status: CheckStatus;
  inputs: Record<string, string | null>;
  targets: Cycle3Target[];
  recommendedOrder: string[];
  openDecisions: string[];
};

type Cycle2Proof = {
  status?: CheckStatus;
  sourceGitSha?: string;
  checks?: Array<{
    id?: string;
    status?: CheckStatus;
    evidence?: Record<string, unknown>;
  }>;
};

type OpticsScaleProof = {
  status?: CheckStatus;
  measurementTrust?: { status?: CheckStatus; flags?: Record<string, unknown> };
  runtimeContracts?: {
    npc?: {
      visualHeightMeters?: number;
      spriteHeightMeters?: number;
      closeModelTargetHeightMeters?: number;
    };
  };
  npcComparisons?: Array<{
    runtimeFaction?: string;
    deltas?: {
      renderedVisibleHeightRatio?: number | null;
      meanOpaqueLumaDelta?: number | null;
      meanOpaqueLumaDeltaPercent?: number | null;
    };
    flags?: string[];
  }>;
  aircraftNativeScale?: Array<{
    key?: string;
    nativeBoundsMeters?: { longestAxis?: number };
    nativeLongestAxisToNpcVisualHeight?: number;
  }>;
};

type OptikDecisionPacket = {
  status?: CheckStatus;
  recommendedSequence?: string[];
  openOwnerDecision?: string;
};

type OptikHumanReview = {
  status?:
    | 'needs_human_decision'
    | 'accepted_exception'
    | 'rejected_needs_crop_scale_pass'
    | 'invalid_runtime_comparison'
    | 'needs_runtime_equivalent_review';
  comparisonBasis?: 'separate_transparent_crops' | 'runtime_equivalent_same_scene' | 'owner_explicit_exception';
  html?: string;
  decision?: string;
  ownerDecision?: string;
  decidedAt?: string;
};

type OptikExpandedProof = {
  status?: CheckStatus;
  coverage?: { cameraProfileSet?: string };
  measurementTrust?: { status?: CheckStatus };
  aggregate?: {
    sampleCount?: number;
    flaggedSamples?: number;
    minVisibleHeightRatio?: number | null;
    maxVisibleHeightRatio?: number | null;
    minLumaDeltaPercent?: number | null;
    maxLumaDeltaPercent?: number | null;
    maxAbsLumaDeltaPercent?: number | null;
    flaggedProfiles?: string[];
  };
};

type TextureAudit = {
  summary?: {
    totalEstimatedMipmappedRgbaMiB?: number;
    totalEstimatedMipmappedMiB?: number;
    flaggedTextures?: number;
    hardFailures?: number;
    candidateEstimatedMipmappedRgbaMiB?: number;
    totalEstimatedCandidateMipmappedMiB?: number;
    candidateSavingsMiB?: number;
    totalEstimatedCandidateSavingsMiB?: number;
  };
};

type StartupSummary = {
  runs?: Array<unknown> | number;
  averagesMs?: {
    modeClickToPlayable?: number;
    deployClickToPlayable?: number;
  };
  perRun?: Array<{
    browserStalls?: {
      webglTextureUploadCount?: number;
      webglTextureUploadTotalDurationMs?: number;
      webglTextureUploadMaxDurationMs?: number;
    };
  }>;
  summary?: {
    modeClickToPlayableMs?: { average?: number; median?: number; p95?: number };
    deployClickToPlayableMs?: { average?: number; median?: number; p95?: number };
    webglTextureUploadCount?: { average?: number; median?: number; p95?: number };
    webglTextureUploadTotalDurationMs?: { average?: number; median?: number; p95?: number };
    webglTextureUploadMaxDurationMs?: { average?: number; median?: number; p95?: number };
  };
  webglUploadSummary?: {
    totalDurationMs?: number;
    maxDurationMs?: number;
    count?: number;
    averageCount?: number;
    largestUploads?: unknown[];
  };
};

type VegetationNormalProof = {
  status?: CheckStatus;
  files?: {
    contactSheet?: string;
  };
  aggregate?: {
    expectedPairs?: number;
    capturedPairs?: number;
    maxMeanAbsRgbDelta?: number | null;
    maxMeanAbsLumaDelta?: number | null;
    maxAbsMeanLumaDeltaPercent?: number | null;
    maxVegetationActiveDelta?: number | null;
  };
};

type PerfValidationCheck = {
  id?: string;
  status?: CheckStatus;
  value?: number;
  message?: string;
};

type PerfSceneCategory = {
  category?: string;
  objects?: number;
  visibleObjects?: number;
  meshes?: number;
  drawCallLike?: number;
  visibleDrawCallLike?: number;
  triangles?: number;
  visibleTriangles?: number;
  materials?: number;
};

type PerfSummary = {
  status?: CheckStatus | 'ok' | 'failed';
  validation?: {
    overall?: CheckStatus;
    checks?: PerfValidationCheck[];
  };
  measurementTrust?: { status?: CheckStatus };
  scenario?: {
    mode?: string;
  };
  sceneAttribution?: PerfSceneCategory[];
};

type ClosePoolResidencyEvidence = {
  status: 'evidence_complete' | 'diagnostic_only';
  beforeOpenFrontierPath: string | null;
  openFrontierAfterPath: string | null;
  aShauAfterPath: string | null;
  beforeOpenFrontier: Record<string, unknown>;
  openFrontierAfter: Record<string, unknown>;
  aShauAfter: Record<string, unknown>;
  notes: string[];
};

type GrenadeSummary = {
  status?: CheckStatus;
  measurementTrust?: { status?: CheckStatus; flags?: Record<string, unknown> };
  baseline?: unknown;
  detonation?: {
    frame?: {
      p95FrameMs?: number;
      maxFrameMs?: number;
    };
    renderAttribution?: {
      totals?: {
        maxDurationMs?: number;
      };
      topNearTriggerCalls?: unknown[];
    };
    browserStalls?: {
      longTaskCount?: number;
      longTaskMaxDurationMs?: number;
      longAnimationFrameCount?: number;
      longAnimationFrameMaxDurationMs?: number;
    };
    userTiming?: Record<string, { totalDurationMs?: number; maxDurationMs?: number }>;
  };
  deltas?: {
    maxFrameMs?: number;
    p99FrameMs?: number;
    hitch50Count?: number;
  };
  windows?: unknown;
};

type HorizonAudit = {
  summary?: {
    flaggedModes?: number;
    largestBareTerrainBandMeters?: number;
    largestBareTerrainBandMode?: string | null;
  };
};

type TerrainHorizonBaseline = {
  status?: CheckStatus;
  sourceGitStatus?: string[];
  measurementTrust?: { status?: CheckStatus };
  scenarios?: Array<{
    key?: string;
    shots?: Array<{
      kind?: string;
      imageMetrics?: {
        farBand?: { greenDominanceRatio?: number | null };
        groundBand?: { greenDominanceRatio?: number | null };
      };
    }>;
  }>;
  performanceBaselines?: {
    openFrontier?: {
      status?: CheckStatus;
      peakP95FrameMs?: number | null;
      p95AfterCeilingPlus1p5Ms?: number | null;
      maxDrawCalls?: number | null;
      drawCallAfterCeiling10Percent?: number | null;
    };
    aShau?: {
      status?: CheckStatus;
      peakP95FrameMs?: number | null;
      p95AfterCeilingPlus1p5Ms?: number | null;
      maxDrawCalls?: number | null;
      drawCallAfterCeiling10Percent?: number | null;
    };
  };
};

type VegetationGroundingAudit = {
  status?: CheckStatus;
  summary?: {
    runtimeSpecies?: number;
    flaggedSpecies?: number;
  };
};

type TerrainAssetInventory = {
  status?: CheckStatus;
  summary?: {
    runtimeVegetationSpecies?: number;
    retiredVegetationSpecies?: number;
    blockedVegetationSpecies?: number;
    missingAssets?: number;
    pixelForgeGroundCoverCandidates?: number;
    trailOrClearedTextures?: number;
  };
};

type TerrainHydrologySummary = {
  wetCandidatePercent?: number;
  channelCandidatePercent?: number;
  currentHydrologyBiomePercent?: number;
  currentHydrologyCoversWetPercent?: number;
  currentHydrologyWithoutWetSignalPercent?: number;
  bambooOnWetCandidatePercent?: number;
  channelPathCount?: number;
  longestChannelPathCells?: number;
  longestChannelPathMeters?: number;
};

type TerrainHydrologyAudit = {
  status?: CheckStatus;
  staticContracts?: {
    corridorSamplerPath?: string;
    corridorSamplerStatus?: string;
  };
  summary?: TerrainHydrologySummary;
  scenarios?: {
    aShau?: { summary?: TerrainHydrologySummary; flags?: string[] };
    openFrontier?: { summary?: TerrainHydrologySummary; flags?: string[] };
  };
  flags?: string[];
  recommendation?: {
    nextBranch?: string;
  };
};

type TerrainWaterSystemAudit = {
  status?: CheckStatus;
  currentContract?: Record<string, unknown>;
  findings?: string[];
  nextBranchRequirements?: string[];
};

type LoadBranchSelector = {
  status?: string;
  selectedBranch?: string;
  selectedBranchSummary?: string;
  inspectedEvidence?: {
    vegetationCandidatesOnly?: {
      estimatedSavingsMiB?: number;
      estimatedMipmappedMiB?: number;
    } | null;
    topVegetationUploadSpecies?: string[];
    activeVegetationAtlasCandidates?: Array<{
      species?: string;
      estimatedSavingsMiB?: number;
    }>;
    vegetationCandidateStartupProof?: Record<string, unknown>;
    vegetationNormalProofStatus?: string | null;
  };
};

type PixelForgeVegetationReadiness = {
  status?: CheckStatus;
  branchExecutionState?: string;
  selectedBranch?: string | null;
  commandSurface?: {
    candidateTileOverrideDetected?: boolean;
  };
  summary?: {
    selectedSpecies?: string[];
    selectedVariants?: string[];
    normalPairsRetained?: boolean;
    targetTileSize?: number | null;
    targetAtlasSize?: string | null;
    estimatedSavingsMiB?: number;
    candidateOutputProfileSupported?: boolean;
  };
};

type VegetationCandidateProof = {
  status?: CheckStatus;
  files?: {
    contactSheet?: string;
  };
  aggregate?: {
    expectedPairs?: number;
    completePairs?: number;
    maxOpaqueLumaDeltaPercent?: number;
    maxOpaqueRatioDelta?: number;
  };
};

type VegetationCandidateImportPlan = {
  status?: CheckStatus;
  importState?: string;
  dryRun?: boolean;
  ownerAccepted?: boolean;
  summary?: {
    expectedItems?: number;
    readyItems?: number;
    appliedItems?: number;
    blockedItems?: number;
  };
  findings?: string[];
};

type HydrologyBakeManifest = {
  schemaVersion?: number;
  generator?: string;
  entries?: Array<{
    modeId?: string;
    source?: string;
    seed?: number | null;
    signature?: string;
    hydrologyAsset?: string;
  }>;
};

type TerrainSliceEvidence = {
  farCanopyTint: {
    status: 'evidence_complete' | 'diagnostic_only';
    beforePath: string | null;
    afterPath: string | null;
    deltas: Record<string, number | null>;
  };
  runtimeVegetationGrounding: {
    status: 'evidence_complete' | 'diagnostic_only';
    auditPath: string | null;
    runtimeSpecies: number | null;
    flaggedSpecies: number | null;
  };
  smallPalmAndGroundCoverDirection: {
    status: 'evidence_complete' | 'diagnostic_only';
    inventoryPath: string | null;
    runtimeVegetationSpecies: number | null;
    retiredVegetationSpecies: number | null;
    missingAssets: number | null;
    pixelForgeGroundCoverCandidates: number | null;
    trailOrClearedTextures: number | null;
  };
  openItems: string[];
};

type CullingProof = {
  status?: CheckStatus;
  measurementTrust?: { status?: CheckStatus };
  rendererInfo?: {
    drawCalls?: number;
    triangles?: number;
  };
};

type CullingOwnerBaseline = {
  status?: CheckStatus;
  sourceGitStatus?: string[];
  measurementTrust?: { status?: CheckStatus };
  selectedOwnerPath?: {
    id?: string;
    status?: 'ready_for_branch' | 'diagnostic_only' | 'blocked';
    ownerCategories?: string[];
    evidence?: Record<string, unknown>;
  } | null;
  performanceBaselines?: {
    openFrontier?: {
      path?: string | null;
      visibleUnattributedPercent?: number | null;
      maxRendererDrawCalls?: number | null;
    };
    aShau?: {
      path?: string | null;
      visibleUnattributedPercent?: number | null;
      maxRendererDrawCalls?: number | null;
    };
  };
};

type CullingSliceEvidence = {
  staticFeatureAndVisibleHelicopterOwnerPath: {
    status: 'evidence_complete' | 'diagnostic_only';
    beforePath: string | null;
    afterPath: string | null;
    deltas: Record<string, number | null>;
  };
  vehicleInteractionSafety: {
    status: 'evidence_complete' | 'diagnostic_only';
    sourcePaths: string[];
    testedContracts: string[];
  };
  openItems: string[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-cycle3-kickoff';
const HYDROLOGY_BAKE_MANIFEST_PATH = join(process.cwd(), 'public', 'data', 'hydrology', 'bake-manifest.json');
const HYDROLOGY_BAKE_LOADER_PATH = join(process.cwd(), 'src', 'systems', 'terrain', 'hydrology', 'HydrologyBakeManifest.ts');
const HYDROLOGY_BIOME_CLASSIFIER_PATH = join(process.cwd(), 'src', 'systems', 'terrain', 'hydrology', 'HydrologyBiomeClassifier.ts');
const HYDROLOGY_CORRIDOR_PATH = join(process.cwd(), 'src', 'systems', 'terrain', 'hydrology', 'HydrologyCorridor.ts');
const HYDROLOGY_RUNTIME_PRELOAD_PATH = join(process.cwd(), 'src', 'core', 'ModeStartupPreparer.ts');
const HELICOPTER_INTERACTION_PATH = join(process.cwd(), 'src', 'systems', 'helicopter', 'HelicopterInteraction.ts');
const HELICOPTER_INTERACTION_TEST_PATH = join(process.cwd(), 'src', 'systems', 'helicopter', 'HelicopterInteraction.test.ts');
const FIXED_WING_INTERACTION_TEST_PATH = join(process.cwd(), 'src', 'systems', 'vehicle', 'FixedWingInteraction.test.ts');
const AIR_VEHICLE_VISIBILITY_TEST_PATH = join(process.cwd(), 'src', 'systems', 'vehicle', 'AirVehicleVisibility.test.ts');

function hydrologyBakeLoaderStatus(loaderPath: string | null): 'missing' | 'present_unwired' | 'feature_gated_preload' {
  if (!loaderPath) return 'missing';
  const startupPreparer = existsSync(HYDROLOGY_RUNTIME_PRELOAD_PATH)
    ? readFileSync(HYDROLOGY_RUNTIME_PRELOAD_PATH, 'utf-8')
    : '';
  return startupPreparer.includes('maybePreloadHydrologyBake')
    && startupPreparer.includes('loadHydrologyBakeForMode')
    && startupPreparer.includes('setHydrologyBake')
    ? 'feature_gated_preload'
    : 'present_unwired';
}

function hydrologyBiomeClassifierStatus(classifierPath: string | null): 'missing' | 'feature_gated_vegetation_classifier' {
  if (!classifierPath) return 'missing';
  const startupPreparer = existsSync(HYDROLOGY_RUNTIME_PRELOAD_PATH)
    ? readFileSync(HYDROLOGY_RUNTIME_PRELOAD_PATH, 'utf-8')
    : '';
  return startupPreparer.includes('__PROJEKT_143_ENABLE_HYDROLOGY_BIOMES__')
    && startupPreparer.includes('setHydrologyBiomePolicy')
    ? 'feature_gated_vegetation_classifier'
    : 'missing';
}

function hydrologyCorridorStatus(corridorPath: string | null): 'missing' | 'pure_world_space_helper' {
  if (!corridorPath) return 'missing';
  const source = readFileSync(corridorPath, 'utf-8');
  return source.includes('sampleHydrologyCorridor')
    && source.includes('findNearestHydrologyChannel')
    ? 'pure_world_space_helper'
    : 'missing';
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function readJson<T>(path: string | null): T | null {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function walkFiles(root: string, predicate: (path: string) => boolean, results: string[] = []): string[] {
  if (!existsSync(root)) return results;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, predicate, results);
    } else if (predicate(path)) {
      results.push(path);
    }
  }
  return results;
}

function latestFile(files: string[], predicate: (path: string) => boolean): string | null {
  const matches = files.filter(predicate);
  matches.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matches[0] ?? null;
}

function expandedCameraProfileSet(path: string): string {
  return readJson<OptikExpandedProof>(path)?.coverage?.cameraProfileSet ?? 'expanded-stress';
}

function latestExpandedProofPath(files: string[], cameraProfileSet: string): string | null {
  return latestFile(files, (path) =>
    path.endsWith(join('projekt-143-optik-expanded-proof', 'summary.json'))
    && expandedCameraProfileSet(path) === cameraProfileSet
  );
}

function latestStartupSummary(files: string[], mode: 'open-frontier' | 'zone-control'): string | null {
  return latestFile(files, (path) =>
    path.endsWith(join(`startup-ui-${mode}`, 'summary.json'))
  );
}

function latestPerfSummaryForMode(files: string[], mode: string): string | null {
  return latestFile(files, (path) => {
    if (!path.endsWith('summary.json')) return false;
    try {
      const summary = readJson<PerfSummary>(path);
      return summary?.scenario?.mode === mode
        && isCertificationPerfSummary(summary)
        && existsSync(join(path, '..', 'scene-attribution.json'));
    } catch {
      return false;
    }
  });
}

function isCertificationPerfSummary(summary: PerfSummary): boolean {
  return summary.measurementTrust?.status === 'pass'
    && summary.validation?.overall !== 'fail'
    && summary.status !== 'failed';
}

function latestCleanTerrainHorizonBaseline(files: string[]): string | null {
  return latestFile(files, (path) => {
    if (!path.endsWith(join('projekt-143-terrain-horizon-baseline', 'summary.json'))) return false;
    try {
      const summary = readJson<TerrainHorizonBaseline>(path);
      return summary?.status === 'pass' && (summary.sourceGitStatus?.length ?? 0) === 0;
    } catch {
      return false;
    }
  });
}

function latestCleanCullingOwnerBaseline(files: string[]): string | null {
  return latestFile(files, (path) => {
    if (!path.endsWith(join('projekt-143-culling-owner-baseline', 'summary.json'))) return false;
    try {
      const summary = readJson<CullingOwnerBaseline>(path);
      return summary?.status === 'pass' && (summary.sourceGitStatus?.length ?? 0) === 0;
    } catch {
      return false;
    }
  });
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function cullingBaselinePerfPath(
  baseline: CullingOwnerBaseline | null,
  mode: 'openFrontier' | 'aShau',
): string | null {
  const value = baseline?.performanceBaselines?.[mode]?.path;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function validationCheck(summary: PerfSummary | null, id: string): PerfValidationCheck | null {
  return summary?.validation?.checks?.find((check) => check.id === id) ?? null;
}

function sceneCategory(summary: PerfSummary | null, category: string): PerfSceneCategory | null {
  return summary?.sceneAttribution?.find((entry) => entry.category === category) ?? null;
}

function categoryDrawCallLike(summary: PerfSummary | null, category: string): number | null {
  const entry = sceneCategory(summary, category);
  return entry?.drawCallLike ?? entry?.meshes ?? null;
}

function closePoolSnapshot(summary: PerfSummary | null): Record<string, unknown> {
  const npcClose = sceneCategory(summary, 'npc_close_glb');
  const weapons = sceneCategory(summary, 'weapons');
  return {
    status: summary?.status ?? null,
    validationOverall: summary?.validation?.overall ?? null,
    measurementTrustStatus: summary?.measurementTrust?.status ?? null,
    heapPeakGrowthMb: validationCheck(summary, 'heap_peak_growth_mb')?.value ?? null,
    heapPeakStatus: validationCheck(summary, 'heap_peak_growth_mb')?.status ?? null,
    heapEndGrowthMb: validationCheck(summary, 'heap_growth_mb')?.value ?? null,
    heapEndStatus: validationCheck(summary, 'heap_growth_mb')?.status ?? null,
    p99FrameMs: validationCheck(summary, 'peak_p99_frame_ms')?.value ?? null,
    p99Status: validationCheck(summary, 'peak_p99_frame_ms')?.status ?? null,
    playerShots: validationCheck(summary, 'player_shots_recorded')?.value
      ?? validationCheck(summary, 'harness_min_shots_fired')?.value
      ?? null,
    playerHits: validationCheck(summary, 'player_hits_recorded')?.value
      ?? validationCheck(summary, 'harness_min_hits_recorded')?.value
      ?? null,
    npcCloseObjects: npcClose?.objects ?? null,
    npcCloseVisibleObjects: npcClose?.visibleObjects ?? null,
    npcCloseDrawCallLike: categoryDrawCallLike(summary, 'npc_close_glb'),
    npcCloseTriangles: npcClose?.triangles ?? null,
    npcCloseVisibleTriangles: npcClose?.visibleTriangles ?? null,
    weaponObjects: weapons?.objects ?? null,
    weaponVisibleObjects: weapons?.visibleObjects ?? null,
    weaponDrawCallLike: categoryDrawCallLike(summary, 'weapons'),
    weaponTriangles: weapons?.triangles ?? null,
    weaponVisibleTriangles: weapons?.visibleTriangles ?? null,
  };
}

function terrainGreenRatio(
  summary: TerrainHorizonBaseline | null,
  scenarioKey: string,
  shotKind: string,
  band: 'farBand' | 'groundBand'
): number | null {
  const shot = summary?.scenarios
    ?.find((scenario) => scenario.key === scenarioKey)
    ?.shots
    ?.find((entry) => entry.kind === shotKind);
  return shot?.imageMetrics?.[band]?.greenDominanceRatio ?? null;
}

function delta(after: number | null, before: number | null): number | null {
  if (after === null || before === null) return null;
  return Number((after - before).toFixed(4));
}

function buildTerrainSliceEvidence(
  beforeTerrainPath: string | null,
  beforeTerrain: TerrainHorizonBaseline | null,
  afterTerrainPath: string | null,
  afterTerrain: TerrainHorizonBaseline | null,
  groundingPath: string | null,
  grounding: VegetationGroundingAudit | null,
  inventoryPath: string | null,
  inventory: TerrainAssetInventory | null,
): TerrainSliceEvidence {
  const openElevatedGroundDelta = delta(
    terrainGreenRatio(afterTerrain, 'openfrontier', 'horizon-elevated', 'groundBand'),
    terrainGreenRatio(beforeTerrain, 'openfrontier', 'horizon-elevated', 'groundBand'),
  );
  const openHighGroundDelta = delta(
    terrainGreenRatio(afterTerrain, 'openfrontier', 'horizon-high-oblique', 'groundBand'),
    terrainGreenRatio(beforeTerrain, 'openfrontier', 'horizon-high-oblique', 'groundBand'),
  );
  const aShauElevatedFarDelta = delta(
    terrainGreenRatio(afterTerrain, 'ashau', 'horizon-elevated', 'farBand'),
    terrainGreenRatio(beforeTerrain, 'ashau', 'horizon-elevated', 'farBand'),
  );
  const aShauHighFarDelta = delta(
    terrainGreenRatio(afterTerrain, 'ashau', 'horizon-high-oblique', 'farBand'),
    terrainGreenRatio(beforeTerrain, 'ashau', 'horizon-high-oblique', 'farBand'),
  );
  const farCanopyComplete = beforeTerrain?.status === 'pass'
    && afterTerrain?.status === 'pass'
    && afterTerrain.measurementTrust?.status === 'pass'
    && (openElevatedGroundDelta ?? 0) > 0.2
    && (openHighGroundDelta ?? 0) > 0.2
    && (aShauElevatedFarDelta ?? 0) > 0.2
    && (aShauHighFarDelta ?? 0) > 0.1;
  const groundingComplete = grounding?.status === 'pass'
    && (grounding.summary?.runtimeSpecies ?? 0) >= 6
    && grounding.summary?.flaggedSpecies === 0;
  const inventoryComplete = (inventory?.status === 'pass' || inventory?.status === 'warn')
    && inventory.summary?.runtimeVegetationSpecies === 6
    && inventory.summary?.retiredVegetationSpecies === 1
    && inventory.summary?.missingAssets === 0
    && (inventory.summary?.pixelForgeGroundCoverCandidates ?? 0) >= 1
    && (inventory.summary?.trailOrClearedTextures ?? 0) >= 1;

  return {
    farCanopyTint: {
      status: farCanopyComplete ? 'evidence_complete' : 'diagnostic_only',
      beforePath: rel(beforeTerrainPath),
      afterPath: rel(afterTerrainPath),
      deltas: {
        openFrontierElevatedGroundGreenDelta: openElevatedGroundDelta,
        openFrontierHighObliqueGroundGreenDelta: openHighGroundDelta,
        aShauElevatedFarGreenDelta: aShauElevatedFarDelta,
        aShauHighObliqueFarGreenDelta: aShauHighFarDelta,
      },
    },
    runtimeVegetationGrounding: {
      status: groundingComplete ? 'evidence_complete' : 'diagnostic_only',
      auditPath: rel(groundingPath),
      runtimeSpecies: grounding?.summary?.runtimeSpecies ?? null,
      flaggedSpecies: grounding?.summary?.flaggedSpecies ?? null,
    },
    smallPalmAndGroundCoverDirection: {
      status: inventoryComplete ? 'evidence_complete' : 'diagnostic_only',
      inventoryPath: rel(inventoryPath),
      runtimeVegetationSpecies: inventory?.summary?.runtimeVegetationSpecies ?? null,
      retiredVegetationSpecies: inventory?.summary?.retiredVegetationSpecies ?? null,
      missingAssets: inventory?.summary?.missingAssets ?? null,
      pixelForgeGroundCoverCandidates: inventory?.summary?.pixelForgeGroundCoverCandidates ?? null,
      trailOrClearedTextures: inventory?.summary?.trailOrClearedTextures ?? null,
    },
    openItems: [
      'A Shau route/nav quality remains unsigned while terrain-stall or backtracking warnings exist.',
      'New ground-cover/trail assets are cataloged, not runtime-accepted imports.',
      'Human visual review is still required before final far-horizon art direction is closed.',
    ],
  };
}

function ownerPathMetric(
  baseline: CullingOwnerBaseline | null,
  mode: 'openFrontier' | 'aShau',
  metric: 'ownerDrawCallLike' | 'ownerVisibleDrawCallLike' | 'ownerVisibleTriangles' | 'maxRendererDrawCalls'
): number | null {
  const evidence = baseline?.selectedOwnerPath?.evidence?.[mode] as Record<string, unknown> | undefined;
  const value = evidence?.[metric];
  return typeof value === 'number' ? value : null;
}

function buildCullingSliceEvidence(
  beforePath: string | null,
  before: CullingOwnerBaseline | null,
  afterPath: string | null,
  after: CullingOwnerBaseline | null,
): CullingSliceEvidence {
  const helicopterInteractionSource = existsSync(HELICOPTER_INTERACTION_PATH)
    ? readFileSync(HELICOPTER_INTERACTION_PATH, 'utf-8')
    : '';
  const helicopterInteractionTest = existsSync(HELICOPTER_INTERACTION_TEST_PATH)
    ? readFileSync(HELICOPTER_INTERACTION_TEST_PATH, 'utf-8')
    : '';
  const fixedWingInteractionTest = existsSync(FIXED_WING_INTERACTION_TEST_PATH)
    ? readFileSync(FIXED_WING_INTERACTION_TEST_PATH, 'utf-8')
    : '';
  const airVehicleVisibilityTestExists = existsSync(AIR_VEHICLE_VISIBILITY_TEST_PATH);
  const vehicleInteractionSafetyComplete =
    helicopterInteractionSource.includes('isInHelicopter() || this.playerController.isInFixedWing()')
    && helicopterInteractionTest.includes('does not offer helicopter entry while the player is already in a fixed-wing aircraft')
    && helicopterInteractionTest.includes('keeps a render-culled helicopter enterable when the player is on foot')
    && fixedWingInteractionTest.includes('keeps a render-culled parked aircraft enterable when the player is on foot')
    && airVehicleVisibilityTestExists;
  const openOwnerVisibleDrawCallDelta = delta(
    ownerPathMetric(after, 'openFrontier', 'ownerVisibleDrawCallLike') ?? ownerPathMetric(after, 'openFrontier', 'ownerDrawCallLike'),
    ownerPathMetric(before, 'openFrontier', 'ownerVisibleDrawCallLike') ?? ownerPathMetric(before, 'openFrontier', 'ownerDrawCallLike'),
  );
  const aShauOwnerVisibleDrawCallDelta = delta(
    ownerPathMetric(after, 'aShau', 'ownerVisibleDrawCallLike') ?? ownerPathMetric(after, 'aShau', 'ownerDrawCallLike'),
    ownerPathMetric(before, 'aShau', 'ownerVisibleDrawCallLike') ?? ownerPathMetric(before, 'aShau', 'ownerDrawCallLike'),
  );
  const openTotalDrawCallDelta = delta(
    ownerPathMetric(after, 'openFrontier', 'maxRendererDrawCalls'),
    ownerPathMetric(before, 'openFrontier', 'maxRendererDrawCalls'),
  );
  const aShauTotalDrawCallDelta = delta(
    ownerPathMetric(after, 'aShau', 'maxRendererDrawCalls'),
    ownerPathMetric(before, 'aShau', 'maxRendererDrawCalls'),
  );
  const ownerPathComplete = before?.status === 'pass'
    && after?.status === 'pass'
    && after.measurementTrust?.status === 'pass'
    && before.selectedOwnerPath?.id === 'large-mode-world-static-and-visible-helicopters'
    && after.selectedOwnerPath?.id === 'large-mode-world-static-and-visible-helicopters'
    && (openOwnerVisibleDrawCallDelta ?? 0) < 0
    && (aShauOwnerVisibleDrawCallDelta ?? 0) < 0
    && (openTotalDrawCallDelta ?? 0) <= 0
    && (aShauTotalDrawCallDelta ?? 0) <= 0;

  return {
    staticFeatureAndVisibleHelicopterOwnerPath: {
      status: ownerPathComplete ? 'evidence_complete' : 'diagnostic_only',
      beforePath: rel(beforePath),
      afterPath: rel(afterPath),
      deltas: {
        openFrontierOwnerVisibleDrawCallLikeDelta: openOwnerVisibleDrawCallDelta,
        aShauOwnerVisibleDrawCallLikeDelta: aShauOwnerVisibleDrawCallDelta,
        openFrontierTotalDrawCallsDelta: openTotalDrawCallDelta,
        aShauTotalDrawCallsDelta: aShauTotalDrawCallDelta,
      },
    },
    vehicleInteractionSafety: {
      status: vehicleInteractionSafetyComplete ? 'evidence_complete' : 'diagnostic_only',
      sourcePaths: [
        rel(HELICOPTER_INTERACTION_PATH),
        rel(HELICOPTER_INTERACTION_TEST_PATH),
        rel(FIXED_WING_INTERACTION_TEST_PATH),
        rel(AIR_VEHICLE_VISIBILITY_TEST_PATH),
      ],
      testedContracts: [
        'Helicopter entry is suppressed while already in fixed-wing flight.',
        'Render-culled helicopters remain enterable when the player is on foot.',
        'Render-culled parked fixed-wing aircraft remain enterable when the player is on foot.',
        'Air-vehicle render/simulation culling stays covered by pure visibility tests.',
      ],
    },
    openItems: [
      'Broad HLOD policy remains open; this slice only covers the selected static-feature/visible-helicopter owner path.',
      vehicleInteractionSafetyComplete
        ? 'Vehicle entry has unit-level culling safety coverage; parked-aircraft playtest coverage, collision behavior, and future ground-vehicle driving still need separate validation when changed.'
        : 'Vehicle entry, collision, and parked-aircraft gameplay behavior still need separate validation when changed.',
      'Vegetation imposter distance remains owned by KB-TERRAIN/KB-LOAD unless explicitly moved into KB-CULL.',
    ],
  };
}

function buildClosePoolResidencyEvidence(
  beforeOpenFrontierPath: string | null,
  beforeOpenFrontier: PerfSummary | null,
  openFrontierAfterPath: string | null,
  openFrontierAfter: PerfSummary | null,
  aShauAfterPath: string | null,
  aShauAfter: PerfSummary | null
): ClosePoolResidencyEvidence {
  const beforeNpcDraws = categoryDrawCallLike(beforeOpenFrontier, 'npc_close_glb');
  const beforeWeaponDraws = categoryDrawCallLike(beforeOpenFrontier, 'weapons');
  const afterNpcDraws = categoryDrawCallLike(openFrontierAfter, 'npc_close_glb');
  const afterWeaponDraws = categoryDrawCallLike(openFrontierAfter, 'weapons');
  const openHeapPeak = validationCheck(openFrontierAfter, 'heap_peak_growth_mb');
  const aShauHeapPeak = validationCheck(aShauAfter, 'heap_peak_growth_mb');
  const beforeNpcCategory = sceneCategory(beforeOpenFrontier, 'npc_close_glb');
  const beforeWeaponCategory = sceneCategory(beforeOpenFrontier, 'weapons');
  const beforeTrusted = beforeOpenFrontier?.measurementTrust?.status === 'pass'
    && beforeOpenFrontier.status !== 'failed'
    && beforeOpenFrontier.validation?.overall !== 'fail';
  const hasTrustedAfter = openFrontierAfter?.measurementTrust?.status === 'pass'
    && aShauAfter?.measurementTrust?.status === 'pass';
  const hasTrustedHiddenResidentBefore = beforeTrusted
    && (beforeNpcDraws ?? 0) > 0
    && (beforeWeaponDraws ?? 0) > 0
    && (beforeNpcCategory?.visibleTriangles ?? Number.POSITIVE_INFINITY) === 0
    && (beforeWeaponCategory?.visibleTriangles ?? Number.POSITIVE_INFINITY) === 0;
  const openAfterAccepted = openFrontierAfter?.status === 'ok'
    && openFrontierAfter.validation?.overall !== 'fail'
    && openHeapPeak?.status !== 'fail'
    && validationCheck(openFrontierAfter, 'player_shots_recorded')?.status === 'pass'
    && validationCheck(openFrontierAfter, 'player_hits_recorded')?.status === 'pass';
  const aShauAfterAccepted = aShauAfter?.status === 'ok'
    && aShauAfter.validation?.overall !== 'fail'
    && aShauHeapPeak?.status !== 'fail'
    && validationCheck(aShauAfter, 'player_shots_recorded')?.status === 'pass'
    && validationCheck(aShauAfter, 'player_hits_recorded')?.status === 'pass';
  const hasResidencyDrop = beforeNpcDraws !== null
    && beforeWeaponDraws !== null
    && afterNpcDraws !== null
    && afterWeaponDraws !== null
    && afterNpcDraws < beforeNpcDraws
    && afterWeaponDraws < beforeWeaponDraws;

  return {
    status: hasTrustedHiddenResidentBefore && hasTrustedAfter && openAfterAccepted && aShauAfterAccepted && hasResidencyDrop
      ? 'evidence_complete'
      : 'diagnostic_only',
    beforeOpenFrontierPath: rel(beforeOpenFrontierPath),
    openFrontierAfterPath: rel(openFrontierAfterPath),
    aShauAfterPath: rel(aShauAfterPath),
    beforeOpenFrontier: closePoolSnapshot(beforeOpenFrontier),
    openFrontierAfter: closePoolSnapshot(openFrontierAfter),
    aShauAfter: closePoolSnapshot(aShauAfter),
    notes: [
      'This accepts only the close-NPC/weapon pool residency slice.',
      'It does not close broad KB-CULL static-feature, vehicle, HLOD, or vegetation culling work.',
      'It does not close KB-LOAD texture policy or vegetation normal-map removal.',
    ],
  };
}

function average(values: number[]): number | null {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  return Number((finite.reduce((sum, value) => sum + value, 0) / finite.length).toFixed(3));
}

function min(values: number[]): number | null {
  const finite = values.filter(Number.isFinite);
  return finite.length > 0 ? Number(Math.min(...finite).toFixed(3)) : null;
}

function max(values: number[]): number | null {
  const finite = values.filter(Number.isFinite);
  return finite.length > 0 ? Number(Math.max(...finite).toFixed(3)) : null;
}

function startupAverageMs(summary: StartupSummary | null, key: 'modeClickToPlayable' | 'deployClickToPlayable'): number | null {
  if (!summary) return null;
  if (key === 'modeClickToPlayable') {
    return summary.summary?.modeClickToPlayableMs?.average ?? summary.averagesMs?.modeClickToPlayable ?? null;
  }
  return summary.summary?.deployClickToPlayableMs?.average ?? summary.averagesMs?.deployClickToPlayable ?? null;
}

function startupUploadAverage(
  summary: StartupSummary | null,
  key: 'webglTextureUploadCount' | 'webglTextureUploadTotalDurationMs' | 'webglTextureUploadMaxDurationMs'
): number | null {
  if (!summary) return null;
  if (key === 'webglTextureUploadTotalDurationMs') {
    return summary.summary?.webglTextureUploadTotalDurationMs?.average
      ?? average((summary.perRun ?? []).map((run) => run.browserStalls?.webglTextureUploadTotalDurationMs ?? NaN));
  }
  if (key === 'webglTextureUploadMaxDurationMs') {
    return summary.summary?.webglTextureUploadMaxDurationMs?.average
      ?? average((summary.perRun ?? []).map((run) => run.browserStalls?.webglTextureUploadMaxDurationMs ?? NaN));
  }
  return summary.summary?.webglTextureUploadCount?.average
    ?? summary.webglUploadSummary?.averageCount
    ?? average((summary.perRun ?? []).map((run) => run.browserStalls?.webglTextureUploadCount ?? NaN));
}

function statusFromTargets(targets: Cycle3Target[], cycle2: Cycle2Proof | null): CheckStatus {
  if (!cycle2 || cycle2.status !== 'pass') return 'fail';
  if (targets.some((target) => target.status === 'blocked')) return 'warn';
  if (targets.some((target) => target.status === 'needs_baseline' || target.status === 'needs_decision')) return 'warn';
  return 'pass';
}

function buildOptikTarget(
  opticsPath: string | null,
  proof: OpticsScaleProof | null,
  decisionPath: string | null,
  decision: OptikDecisionPacket | null,
  humanReviewPath: string | null,
  humanReview: OptikHumanReview | null,
  expandedPath: string | null,
  expanded: OptikExpandedProof | null,
  runtimeLodExpandedPath: string | null,
  runtimeLodExpanded: OptikExpandedProof | null
): Cycle3Target {
  const ratios = (proof?.npcComparisons ?? [])
    .map((entry) => entry.deltas?.renderedVisibleHeightRatio)
    .filter((value): value is number => value !== null && value !== undefined);
  const lumaDeltas = (proof?.npcComparisons ?? [])
    .map((entry) => entry.deltas?.meanOpaqueLumaDelta)
    .filter((value): value is number => value !== null && value !== undefined);
  const lumaDeltaPercents = (proof?.npcComparisons ?? [])
    .map((entry) => entry.deltas?.meanOpaqueLumaDeltaPercent)
    .filter((value): value is number => value !== null && value !== undefined);
  const aircraftRatios = (proof?.aircraftNativeScale ?? [])
    .map((entry) => entry.nativeLongestAxisToNpcVisualHeight)
    .filter((value): value is number => value !== null && value !== undefined);
  const trusted = proof?.status === 'pass' && proof.measurementTrust?.status === 'pass';
  const visibleHeightWithinBand = ratios.length > 0 && ratios.every((ratio) => ratio >= 0.85 && ratio <= 1.15);
  const lumaStillFlagged = (proof?.npcComparisons ?? [])
    .some((entry) => entry.flags?.some((flag) => flag.startsWith('rendered-luma-delta-')));
  const expandedTrusted = expanded?.measurementTrust?.status === 'pass';
  const expandedFlaggedSamples = expanded?.aggregate?.flaggedSamples ?? null;
  const expandedHasFlags = expandedTrusted && expandedFlaggedSamples !== null && expandedFlaggedSamples > 0;
  const expandedPasses = expandedTrusted && expanded?.status === 'pass';
  const expandedMaxAbsLumaDeltaPercent = expanded?.aggregate?.maxAbsLumaDeltaPercent ?? null;
  const expandedLumaInProofBand = expandedTrusted
    && expandedMaxAbsLumaDeltaPercent !== null
    && expandedMaxAbsLumaDeltaPercent <= 12;
  const expandedVisibleHeightInProofBand = expandedTrusted
    && (expanded?.aggregate?.minVisibleHeightRatio ?? 0) >= 0.85
    && (expanded?.aggregate?.maxVisibleHeightRatio ?? 2) <= 1.15;
  const expandedOnlyVisibleHeightFlags = expandedHasFlags
    && expandedLumaInProofBand
    && !expandedVisibleHeightInProofBand;
  const runtimeLodExpandedPasses =
    runtimeLodExpanded?.measurementTrust?.status === 'pass'
    && runtimeLodExpanded?.status === 'pass';
  const humanReviewHasAcceptableBasis =
    humanReview?.comparisonBasis === 'runtime_equivalent_same_scene'
    || humanReview?.comparisonBasis === 'owner_explicit_exception';
  const humanAcceptedException = humanReview?.status === 'accepted_exception' && humanReviewHasAcceptableBasis;
  const humanRejectedForCropScale = humanReview?.status === 'rejected_needs_crop_scale_pass';
  const humanInvalidRuntimeComparison =
    humanReview?.status === 'invalid_runtime_comparison'
    || humanReview?.status === 'needs_runtime_equivalent_review'
    || humanReview?.comparisonBasis === 'separate_transparent_crops';

  return {
    id: 'npc-imposter-scale-luma-contract',
    bureau: 'KB-OPTIK',
    status: humanAcceptedException
      ? 'evidence_complete'
      : humanInvalidRuntimeComparison
      ? 'needs_decision'
      : trusted
      ? visibleHeightWithinBand
        ? expandedHasFlags
          ? humanRejectedForCropScale ? 'ready_for_branch' : 'needs_decision'
          : 'ready_for_branch'
        : 'needs_decision'
      : 'blocked',
    priority: 1,
    summary: humanAcceptedException
      ? 'Scale/crop and expanded lighting luma are inside proof bands, runtime LOD-edge proof passes, and owner review accepts the 8.5m near-stress exception for the current NPC imposter contract.'
      : humanInvalidRuntimeComparison
      ? 'Scale/crop and expanded lighting luma have mechanical proof, but the human-review packet was rejected because it compared a T-pose close GLB crop against an atlas impostor pose; regenerate runtime-equivalent comparison evidence.'
      : trusted
      ? visibleHeightWithinBand
        ? lumaStillFlagged
          ? 'First scale/crop remediation has matched evidence inside the +/-15% height band; remaining KB-OPTIK work is shader/luma parity or an explicit visual exception.'
          : expandedPasses
            ? 'Scale/crop and expanded lighting/gameplay-camera luma parity are inside matched proof bands; remaining KB-OPTIK work is human review or explicit closeout.'
            : expandedOnlyVisibleHeightFlags
              ? runtimeLodExpandedPasses
                ? 'Scale/crop and expanded lighting luma are inside proof bands; the 8.5m near-stress camera flags, but runtime LOD-edge proof passes, so KB-OPTIK needs a visual-exception or human-review decision.'
                : 'Scale/crop and expanded lighting luma are inside proof bands, but gameplay-camera visible-height samples still need a KB-OPTIK shape/crop decision.'
            : expandedHasFlags
              ? 'Scale/crop and selected-lighting luma parity are inside matched proof bands, but expanded lighting/gameplay-camera proof found visual flags that need targeted KB-OPTIK decision.'
              : 'Scale/crop and selected-lighting luma parity are inside matched proof bands; remaining KB-OPTIK work is expanded lighting snapshots, human review, or explicit closeout.'
        : decisionPath
          ? 'Matched evidence and KB-OPTIK decision packet exist; imposter crop/regeneration remains the recommended first runtime branch.'
          : 'Matched evidence exists; decide whether to change NPC runtime visual height, regenerate imposter bakes, align shader/luma, or combine those changes in separate measured slices.'
      : 'Matched close-GLB/imposter evidence is missing or untrusted.',
    evidence: {
      opticsScaleProofPath: rel(opticsPath),
      optikDecisionPacketPath: rel(decisionPath),
      optikHumanReviewPath: rel(humanReviewPath),
      optikExpandedProofPath: rel(expandedPath),
      runtimeLodExpandedProofPath: rel(runtimeLodExpandedPath),
      optikDecisionPacketStatus: decision?.status ?? null,
      optikHumanReviewStatus: humanReview?.status ?? null,
      optikHumanReviewComparisonBasis: humanReview?.comparisonBasis ?? null,
      optikHumanReviewHtml: humanReview?.html ?? null,
      optikHumanReviewDecision: humanReview?.ownerDecision ?? humanReview?.decision ?? null,
      optikExpandedProofStatus: expanded?.status ?? null,
      runtimeLodExpandedProofStatus: runtimeLodExpanded?.status ?? null,
      recommendedFirstRuntimeBranch: decision?.recommendedSequence?.[1] ?? null,
      openOwnerDecision: decision?.openOwnerDecision ?? null,
      runtimeNpcVisualHeightMeters: proof?.runtimeContracts?.npc?.visualHeightMeters ?? null,
      visibleHeightWithinBand,
      lumaStillFlagged,
      renderedVisibleHeightRatio: {
        min: min(ratios),
        average: average(ratios),
        max: max(ratios),
      },
      meanOpaqueLumaDelta: {
        min: min(lumaDeltas),
        average: average(lumaDeltas),
        max: max(lumaDeltas),
      },
      meanOpaqueLumaDeltaPercent: {
        min: min(lumaDeltaPercents),
        average: average(lumaDeltaPercents),
        max: max(lumaDeltaPercents),
      },
      aircraftLongestAxisToNpcHeight: {
        min: min(aircraftRatios),
        average: average(aircraftRatios),
        max: max(aircraftRatios),
      },
      expandedProof: {
        cameraProfileSet: expanded?.coverage?.cameraProfileSet ?? null,
        sampleCount: expanded?.aggregate?.sampleCount ?? null,
        flaggedSamples: expandedFlaggedSamples,
        minVisibleHeightRatio: expanded?.aggregate?.minVisibleHeightRatio ?? null,
        maxVisibleHeightRatio: expanded?.aggregate?.maxVisibleHeightRatio ?? null,
        minLumaDeltaPercent: expanded?.aggregate?.minLumaDeltaPercent ?? null,
        maxLumaDeltaPercent: expanded?.aggregate?.maxLumaDeltaPercent ?? null,
        maxAbsLumaDeltaPercent: expanded?.aggregate?.maxAbsLumaDeltaPercent ?? null,
        flaggedProfiles: expanded?.aggregate?.flaggedProfiles ?? null,
      },
      runtimeLodExpandedProof: {
        cameraProfileSet: runtimeLodExpanded?.coverage?.cameraProfileSet ?? null,
        sampleCount: runtimeLodExpanded?.aggregate?.sampleCount ?? null,
        flaggedSamples: runtimeLodExpanded?.aggregate?.flaggedSamples ?? null,
        minVisibleHeightRatio: runtimeLodExpanded?.aggregate?.minVisibleHeightRatio ?? null,
        maxVisibleHeightRatio: runtimeLodExpanded?.aggregate?.maxVisibleHeightRatio ?? null,
        minLumaDeltaPercent: runtimeLodExpanded?.aggregate?.minLumaDeltaPercent ?? null,
        maxLumaDeltaPercent: runtimeLodExpanded?.aggregate?.maxLumaDeltaPercent ?? null,
        maxAbsLumaDeltaPercent: runtimeLodExpanded?.aggregate?.maxAbsLumaDeltaPercent ?? null,
        flaggedProfiles: runtimeLodExpanded?.aggregate?.flaggedProfiles ?? null,
      },
    },
    requiredBefore: [
      humanAcceptedException
        ? 'Keep the accepted near-stress exception tied to the current 2.95m target, crop maps, and runtime LOD-edge proof artifacts.'
        : humanInvalidRuntimeComparison
          ? 'Do not use the rejected T-pose-versus-atlas human-review packet for acceptance; regenerate a runtime-equivalent comparison before KB-OPTIK closeout.'
        : 'Use the latest matched scale/crop proof as the after artifact for the first remediation.',
      lumaStillFlagged
        ? 'If continuing KB-OPTIK, isolate shader/luma parity from target height and crop metadata changes.'
        : expandedTrusted
          ? expandedOnlyVisibleHeightFlags
            ? runtimeLodExpandedPasses
              ? 'If continuing KB-OPTIK, document the near-stress camera exception or run human visual review before changing crop/scale again.'
              : 'If continuing KB-OPTIK, inspect the flagged gameplay-camera silhouette samples before changing shader constants again.'
            : expandedHasFlags
            ? 'If continuing KB-OPTIK, inspect the flagged expanded lighting/gameplay-camera samples before changing shader constants again.'
            : 'If continuing KB-OPTIK, use the expanded lighting/gameplay-camera proof for human visual review or explicit closeout.'
          : 'If continuing KB-OPTIK, expand proof coverage to dawn, dusk, haze, and combat camera screenshots without changing target height or crop metadata.',
      'If changing the 2.95m target again, update close GLB, imposter, hit/aiming, and player-relative scale tests together.',
    ],
    acceptance: [
      'Matched close/imposter visible height delta within +/-15% for the first remediation, or explicit visual exception.',
      'Mean opaque luma delta within +/-12% under selected and expanded lighting snapshots.',
      'No performance or upload regression accepted without paired artifacts.',
    ],
    nonClaims: [
      humanAcceptedException
        ? 'Do not apply this visual exception to future NPC atlases, target-height changes, or crop-map changes without a fresh proof packet.'
        : humanInvalidRuntimeComparison
        ? 'Do not claim human visual signoff from the rejected T-pose-versus-atlas packet.'
        : lumaStillFlagged
        ? 'Do not claim full NPC visual parity while luma remains flagged.'
        : expandedPasses
          ? 'Do not claim human visual signoff from mechanical proof alone.'
          : expandedOnlyVisibleHeightFlags
            ? runtimeLodExpandedPasses
              ? 'Do not claim final NPC visual parity until the near-stress exception is documented or human-reviewed.'
              : 'Do not claim final NPC visual parity while gameplay-camera silhouette samples remain flagged.'
            : 'Do not claim final NPC visual parity until expanded lighting screenshots and human review exist.',
      'Do not accept aircraft scale changes from this target without a separate vehicle-scale proof.',
    ],
  };
}

function buildLoadTarget(
  texturePath: string | null,
  startupOpenPath: string | null,
  startupOpen: StartupSummary | null,
  startupZonePath: string | null,
  startupZone: StartupSummary | null,
  texture: TextureAudit | null,
  vegetationNormalProofPath: string | null,
  vegetationNormalProof: VegetationNormalProof | null,
  loadBranchSelectorPath: string | null,
  loadBranchSelector: LoadBranchSelector | null,
  pixelForgeVegetationReadinessPath: string | null,
  pixelForgeVegetationReadiness: PixelForgeVegetationReadiness | null,
  vegetationCandidateProofPath: string | null,
  vegetationCandidateProof: VegetationCandidateProof | null,
  vegetationCandidateImportPlanPath: string | null,
  vegetationCandidateImportPlan: VegetationCandidateImportPlan | null,
  closePoolResidency: ClosePoolResidencyEvidence,
): Cycle3Target {
  const hasStartup = Boolean(startupOpenPath && startupZonePath);
  const hasTextureAudit = Boolean(texturePath);
  const closePoolAccepted = closePoolResidency.status === 'evidence_complete';
  const normalMapRemovalPolicy = vegetationNormalProof?.status === 'warn'
    ? 'rejected_for_default_policy_visual_warn'
    : vegetationNormalProof?.status === 'pass'
      ? 'candidate_needs_owner_review_before_default_policy'
      : 'not_evaluated';
  const candidateProofReady = vegetationCandidateProof?.status === 'pass'
    && (vegetationCandidateProof.aggregate?.expectedPairs ?? 0) > 0
    && vegetationCandidateProof.aggregate?.completePairs === vegetationCandidateProof.aggregate?.expectedPairs;
  const importPlanDryRunReady = vegetationCandidateImportPlan?.status === 'pass'
    && vegetationCandidateImportPlan.importState === 'dry_run_ready'
    && (vegetationCandidateImportPlan.summary?.expectedItems ?? 0) > 0
    && vegetationCandidateImportPlan.summary?.readyItems === vegetationCandidateImportPlan.summary?.expectedItems;
  return {
    id: 'pixel-forge-texture-upload-residency',
    bureau: 'KB-LOAD',
    status: hasStartup && hasTextureAudit ? 'ready_for_branch' : 'needs_baseline',
    priority: 2,
    summary: pixelForgeVegetationReadiness?.branchExecutionState === 'needs_pixel_forge_profile_patch'
      ? `KB-LOAD has selected ${loadBranchSelector?.selectedBranch ?? 'a vegetation atlas regeneration branch'}, and Pixel Forge readiness now shows the active source variants and normal pairs are present, but a 256px-tile review-only candidate profile must be added before generation/proof.`
      : pixelForgeVegetationReadiness?.branchExecutionState === 'ready_for_candidate_generation'
        ? importPlanDryRunReady
      ? loadBranchSelector?.status === 'candidate_startup_proof_ready'
        ? `KB-LOAD has selected ${loadBranchSelector?.selectedBranch ?? 'a vegetation atlas regeneration branch'}, and proof-only candidate startup tables show the repaired Pixel Forge 256px candidates can reduce startup/upload cost; next is owner visual acceptance, accepted import, and real runtime proof.`
        : `KB-LOAD has selected ${loadBranchSelector?.selectedBranch ?? 'a vegetation atlas regeneration branch'}, and the repaired Pixel Forge 256px candidate proof plus TIJ dry-run import plan are ready; next is owner visual acceptance, accepted import, and quiet-machine startup tables.`
          : candidateProofReady
            ? `KB-LOAD has selected ${loadBranchSelector?.selectedBranch ?? 'a vegetation atlas regeneration branch'}, and Pixel Forge candidate proof is ready; next is the TIJ dry-run import plan, owner visual acceptance, and quiet-machine startup tables.`
            : `KB-LOAD has selected ${loadBranchSelector?.selectedBranch ?? 'a vegetation atlas regeneration branch'}, and Pixel Forge readiness now shows a review-only 256px candidate profile is available; next is candidate generation, selected-species validation, side-by-side visual proof, and quiet-machine startup tables.`
      : loadBranchSelector?.selectedBranch
      ? `KB-LOAD has selected ${loadBranchSelector.selectedBranch} as the next quiet-machine proof branch; scoped lazy NPC/post-reveal/close-pool work exists, but the selected texture branch still needs paired visual proof and before/after startup tables.`
      : closePoolAccepted
        ? 'KB-LOAD has scoped startup/upload wins from lazy NPC imposter buckets, post-reveal background work, and a trusted close-GLB pool residency slice; remaining texture/upload branches still need paired visual proof and before/after startup tables.'
        : 'KB-LOAD has scoped startup/upload wins from lazy NPC imposter buckets plus post-reveal background work and lazy close-GLB pool loading; remaining texture/upload branches still need paired visual proof and before/after startup tables.',
    evidence: {
      textureAuditPath: rel(texturePath),
      startupOpenFrontierPath: rel(startupOpenPath),
      startupZoneControlPath: rel(startupZonePath),
      totalEstimatedMipmappedRgbaMiB: texture?.summary?.totalEstimatedMipmappedRgbaMiB ?? texture?.summary?.totalEstimatedMipmappedMiB ?? null,
      flaggedTextures: texture?.summary?.flaggedTextures ?? null,
      hardFailures: texture?.summary?.hardFailures ?? null,
      candidateEstimatedMipmappedRgbaMiB: texture?.summary?.candidateEstimatedMipmappedRgbaMiB ?? texture?.summary?.totalEstimatedCandidateMipmappedMiB ?? null,
      candidateSavingsMiB: texture?.summary?.candidateSavingsMiB ?? texture?.summary?.totalEstimatedCandidateSavingsMiB ?? null,
      openFrontierModeClickToPlayableAverageMs: startupAverageMs(startupOpen, 'modeClickToPlayable'),
      openFrontierDeployClickToPlayableAverageMs: startupAverageMs(startupOpen, 'deployClickToPlayable'),
      openFrontierWebglUploadTotalAverageMs: startupUploadAverage(startupOpen, 'webglTextureUploadTotalDurationMs'),
      openFrontierWebglUploadMaxAverageMs: startupUploadAverage(startupOpen, 'webglTextureUploadMaxDurationMs'),
      openFrontierUploadCount: startupUploadAverage(startupOpen, 'webglTextureUploadCount'),
      openFrontierLargestUploads: startupOpen?.webglUploadSummary?.largestUploads ?? null,
      zoneControlModeClickToPlayableAverageMs: startupAverageMs(startupZone, 'modeClickToPlayable'),
      zoneControlDeployClickToPlayableAverageMs: startupAverageMs(startupZone, 'deployClickToPlayable'),
      zoneControlWebglUploadTotalAverageMs: startupUploadAverage(startupZone, 'webglTextureUploadTotalDurationMs'),
      zoneControlWebglUploadMaxAverageMs: startupUploadAverage(startupZone, 'webglTextureUploadMaxDurationMs'),
      zoneControlUploadCount: startupUploadAverage(startupZone, 'webglTextureUploadCount'),
      zoneControlLargestUploads: startupZone?.webglUploadSummary?.largestUploads ?? null,
      vegetationNormalProofPath: rel(vegetationNormalProofPath),
      vegetationNormalProofStatus: vegetationNormalProof?.status ?? null,
      vegetationNormalProofContactSheet: vegetationNormalProof?.files?.contactSheet ?? null,
      vegetationNormalProofCapturedPairs: vegetationNormalProof?.aggregate?.capturedPairs ?? null,
      vegetationNormalProofExpectedPairs: vegetationNormalProof?.aggregate?.expectedPairs ?? null,
      vegetationNormalProofMaxMeanAbsRgbDelta: vegetationNormalProof?.aggregate?.maxMeanAbsRgbDelta ?? null,
      vegetationNormalProofMaxAbsMeanLumaDeltaPercent: vegetationNormalProof?.aggregate?.maxAbsMeanLumaDeltaPercent ?? null,
      vegetationNormalMapRemovalPolicy: normalMapRemovalPolicy,
      vegetationNormalMapDefaultPolicy: 'unchanged',
      loadBranchSelectorPath: rel(loadBranchSelectorPath),
      loadBranchSelectorStatus: loadBranchSelector?.status ?? null,
      selectedLoadBranch: loadBranchSelector?.selectedBranch ?? null,
      selectedLoadBranchSummary: loadBranchSelector?.selectedBranchSummary ?? null,
      selectedLoadBranchVegetationSavingsMiB: loadBranchSelector?.inspectedEvidence?.vegetationCandidatesOnly?.estimatedSavingsMiB ?? null,
      selectedLoadBranchTopVegetationUploadSpecies: loadBranchSelector?.inspectedEvidence?.topVegetationUploadSpecies ?? null,
      selectedLoadBranchAtlasCandidates: loadBranchSelector?.inspectedEvidence?.activeVegetationAtlasCandidates ?? null,
      selectedLoadBranchCandidateStartupProof: loadBranchSelector?.inspectedEvidence?.vegetationCandidateStartupProof ?? null,
      pixelForgeVegetationReadinessPath: rel(pixelForgeVegetationReadinessPath),
      pixelForgeVegetationReadinessStatus: pixelForgeVegetationReadiness?.status ?? null,
      pixelForgeVegetationBranchExecutionState: pixelForgeVegetationReadiness?.branchExecutionState ?? null,
      pixelForgeVegetationSelectedSpecies: pixelForgeVegetationReadiness?.summary?.selectedSpecies ?? null,
      pixelForgeVegetationSelectedVariants: pixelForgeVegetationReadiness?.summary?.selectedVariants ?? null,
      pixelForgeVegetationTargetAtlasSize: pixelForgeVegetationReadiness?.summary?.targetAtlasSize ?? null,
      pixelForgeVegetationTargetTileSize: pixelForgeVegetationReadiness?.summary?.targetTileSize ?? null,
      pixelForgeVegetationNormalPairsRetained: pixelForgeVegetationReadiness?.summary?.normalPairsRetained ?? null,
      pixelForgeVegetationCandidateProfileSupported: pixelForgeVegetationReadiness?.summary?.candidateOutputProfileSupported ?? null,
      pixelForgeVegetationCandidateTileOverrideDetected: pixelForgeVegetationReadiness?.commandSurface?.candidateTileOverrideDetected ?? null,
      vegetationCandidateProofPath: rel(vegetationCandidateProofPath),
      vegetationCandidateProofStatus: vegetationCandidateProof?.status ?? null,
      vegetationCandidateProofCompletePairs: vegetationCandidateProof?.aggregate?.completePairs ?? null,
      vegetationCandidateProofExpectedPairs: vegetationCandidateProof?.aggregate?.expectedPairs ?? null,
      vegetationCandidateProofMaxOpaqueLumaDeltaPercent: vegetationCandidateProof?.aggregate?.maxOpaqueLumaDeltaPercent ?? null,
      vegetationCandidateProofMaxOpaqueRatioDelta: vegetationCandidateProof?.aggregate?.maxOpaqueRatioDelta ?? null,
      vegetationCandidateProofContactSheet: vegetationCandidateProof?.files?.contactSheet ?? null,
      vegetationCandidateImportPlanPath: rel(vegetationCandidateImportPlanPath),
      vegetationCandidateImportPlanStatus: vegetationCandidateImportPlan?.status ?? null,
      vegetationCandidateImportPlanState: vegetationCandidateImportPlan?.importState ?? null,
      vegetationCandidateImportPlanDryRun: vegetationCandidateImportPlan?.dryRun ?? null,
      vegetationCandidateImportPlanOwnerAccepted: vegetationCandidateImportPlan?.ownerAccepted ?? null,
      vegetationCandidateImportPlanReadyItems: vegetationCandidateImportPlan?.summary?.readyItems ?? null,
      vegetationCandidateImportPlanExpectedItems: vegetationCandidateImportPlan?.summary?.expectedItems ?? null,
      vegetationCandidateImportPlanBlockedItems: vegetationCandidateImportPlan?.summary?.blockedItems ?? null,
      vegetationCandidateImportPlanFindings: vegetationCandidateImportPlan?.findings ?? null,
      closePoolResidency,
    },
    requiredBefore: [
      'Run fresh Open Frontier and Zone Control startup UI artifacts immediately before the branch if the latest startup artifacts predate the target assets.',
      'Do not broaden startup texture warmup from the rejected fanPalm artifact without a new paired proof.',
      pixelForgeVegetationReadiness?.branchExecutionState === 'needs_pixel_forge_profile_patch'
        ? 'Patch Pixel Forge with a review-only 256px-tile color/normal candidate profile for the selected active vegetation variants before generating or importing assets.'
        : pixelForgeVegetationReadiness?.branchExecutionState === 'ready_for_candidate_generation'
          ? importPlanDryRunReady
            ? 'Review and accept/reject the Pixel Forge candidate contact sheet before running any `--apply --owner-accepted` import.'
            : candidateProofReady
              ? 'Run the TIJ vegetation candidate import-plan dry run before importing assets.'
              : 'Run the Pixel Forge kb-load-vegetation-256 candidate profile and selected-species validator before importing assets.'
          : 'Run the Pixel Forge vegetation readiness audit before generating selected KB-LOAD assets so source variants, normal pairs, and candidate dimensions are explicit.',
      loadBranchSelector?.selectedBranch
        ? `Execute the selected ${loadBranchSelector.selectedBranch} branch first, or file a new selector artifact before changing scope.`
        : 'Choose one remaining texture class first: fanPalm with a latency guard, NPC albedo atlases, approved asset regeneration, or preload/deferred upload policy.',
      'Keep live-entry background work and close-GLB pool loading out of the first playable frame unless paired startup artifacts prove no regression.',
      'Pair all texture candidates with KB-OPTIK visual proof before shipping. Vegetation normal-map removal is rejected for the default policy while the latest A/B proof remains visual WARN.',
    ],
    acceptance: [
      'Open Frontier and Zone Control mode-click-to-playable median and p95 do not regress against the before artifact.',
      'WebGL upload total and largest-upload table improve, or the branch is recorded as rejected evidence rather than landed remediation.',
      'No texture downscale/compression is accepted without visual screenshots.',
      'No vegetation normal-map removal is accepted without a future PASS/owner-accepted `projekt-143-vegetation-normal-proof` contact sheet.',
    ],
    nonClaims: [
      'Texture candidate savings are planning estimates, not accepted art changes.',
      'Do not claim a startup-latency win from WebGL upload totals alone.',
      'Do not compare diagnostic wrapped-upload timing directly against clean runtime captures.',
    ],
  };
}

function buildEffectsTarget(grenadePath: string | null, grenade: GrenadeSummary | null): Cycle3Target {
  const trusted = grenade?.measurementTrust?.status === 'pass' || Boolean(grenadePath);
  const hasRenderAttribution = Boolean(grenade?.detonation?.renderAttribution);
  const renderMaxMs = grenade?.detonation?.renderAttribution?.totals?.maxDurationMs ?? null;
  const frameMaxMs = grenade?.detonation?.frame?.maxFrameMs ?? null;
  const stalls = grenade?.detonation?.browserStalls ?? null;
  const fragTiming = grenade?.detonation?.userTiming?.['kb-effects.grenade.frag.total'] ?? null;
  const trustFlags = grenade?.measurementTrust?.flags ?? {};
  const triggerOrPostLoafCount = Number(trustFlags.triggerOrPostTriggerLongAnimationFrameCount ?? Number.POSITIVE_INFINITY);
  const nearTriggerMainRenderMs = Number(trustFlags.maxNearTriggerMainSceneRenderMs ?? renderMaxMs ?? Number.POSITIVE_INFINITY);
  const lowLoadEvidenceComplete = Boolean(
    hasRenderAttribution
    && grenade?.measurementTrust?.status === 'pass'
    && (stalls?.longTaskCount ?? Number.POSITIVE_INFINITY) === 0
    && triggerOrPostLoafCount === 0
    && nearTriggerMainRenderMs < 50
    && frameMaxMs !== null
    && frameMaxMs < 50
  );
  return {
    id: 'grenade-first-use-stall',
    bureau: 'KB-EFFECTS',
    status: lowLoadEvidenceComplete
      ? 'evidence_complete'
      : (hasRenderAttribution ? 'needs_decision' : (trusted ? 'ready_for_branch' : 'needs_baseline')),
    priority: 3,
    summary: lowLoadEvidenceComplete
      ? 'KB-EFFECTS low-load grenade first-use closeout is evidence-complete for the unlit pooled explosion path; no trigger/post-trigger browser stall remains in the trusted probe.'
      : hasRenderAttribution
      ? 'KB-EFFECTS has first unlit-explosion architecture evidence: trigger-adjacent render calls are no longer the 300ms+ stall, but the probe still needs clean browser-stall/frame-metric closeout.'
      : 'Grenade remediation is blocked on render-frame attribution; matched visible warmup attempts still reproduced the low-load two-grenade first-use stall.',
    evidence: {
      grenadeArtifactPath: rel(grenadePath),
      status: grenade?.status ?? null,
      measurementTrustStatus: grenade?.measurementTrust?.status ?? null,
      hasBaselineWindow: Boolean(grenade?.baseline),
      hasDetonationWindow: Boolean(grenade?.detonation),
      hasRenderAttribution,
      detonationFrameMaxMs: frameMaxMs,
      detonationLongTaskCount: stalls?.longTaskCount ?? null,
      detonationLongTaskMaxMs: stalls?.longTaskMaxDurationMs ?? null,
      detonationLongAnimationFrameCount: stalls?.longAnimationFrameCount ?? null,
      detonationLongAnimationFrameMaxMs: stalls?.longAnimationFrameMaxDurationMs ?? null,
      renderAttributionMaxMs: renderMaxMs,
      maxNearTriggerMainSceneRenderMs: trustFlags.maxNearTriggerMainSceneRenderMs ?? null,
      preTriggerLongAnimationFrameCount: trustFlags.preTriggerLongAnimationFrameCount ?? null,
      preTriggerLoafOverlapsFirstTrigger: trustFlags.preTriggerLoafOverlapsFirstTrigger ?? null,
      triggerOrPostTriggerLongAnimationFrameCount: trustFlags.triggerOrPostTriggerLongAnimationFrameCount ?? null,
      postTriggerLongAnimationFrameCount: trustFlags.postTriggerLongAnimationFrameCount ?? null,
      classifiedPreTriggerFrameMax: trustFlags.classifiedPreTriggerFrameMax ?? null,
      lowLoadEvidenceComplete,
      fragTotalDurationMs: fragTiming?.totalDurationMs ?? null,
      fragMaxDurationMs: fragTiming?.maxDurationMs ?? null,
      maxFrameDeltaMs: grenade?.deltas?.maxFrameMs ?? null,
      hitch50Delta: grenade?.deltas?.hitch50Count ?? null,
      windows: grenade?.windows ?? null,
    },
    requiredBefore: [
      lowLoadEvidenceComplete
        ? 'Keep the unlit pooled explosion architecture; do not reintroduce dynamic explosion lights for visual polish.'
        : hasRenderAttribution
        ? 'Classify or remove the remaining pre-trigger LoAF/frame-metric contamination before declaring KB-EFFECTS closed.'
        : 'Refresh low-load two-grenade probe if the latest artifact is stale or missing CPU profile/long-task windows.',
      lowLoadEvidenceComplete
        ? 'Treat any future grenade visual changes as new evidence work with matched render attribution.'
        : 'Do not reintroduce dynamic explosion PointLights; grenade visuals should stay unlit, pooled, and shader-stable.',
      'Keep grenade JS, audio, particle, renderer, and shader/program changes separate unless evidence forces coupling.',
    ],
    acceptance: [
      'No long task above 50ms within +/-250ms of either warmed trigger.',
      'First/second detonation p95 delta below 3ms.',
      'Render attribution shows no trigger-adjacent main-scene render call above 50ms.',
      'Any remaining LoAF/frame max is classified as trigger-caused or pre-trigger harness contamination.',
    ],
    nonClaims: [
      'Do not close KB-EFFECTS from frag JS timings alone.',
      'Do not use saturated combat120 grenade artifacts for first-use attribution.',
      lowLoadEvidenceComplete
        ? 'Do not claim combat120 or stress-scene grenade closeout from the low-load probe.'
        : 'Do not claim full KB-EFFECTS closeout while the low-load probe still records a 100ms max frame or unclassified LoAF.',
    ],
  };
}

function buildTerrainTarget(
  horizonPath: string | null,
  horizon: HorizonAudit | null,
  openFrontierSummaryPath: string | null,
  aShauSummaryPath: string | null,
  terrainBaselinePath: string | null,
  terrainBaseline: TerrainHorizonBaseline | null,
  hydrologyPath: string | null,
  hydrology: TerrainHydrologyAudit | null,
  hydrologyBakeManifestPath: string | null,
  hydrologyBakeManifest: HydrologyBakeManifest | null,
  hydrologyBakeLoaderPath: string | null,
  waterSystemAuditPath: string | null,
  waterSystemAudit: TerrainWaterSystemAudit | null,
  terrainSliceEvidence: TerrainSliceEvidence,
): Cycle3Target {
  const hasHorizon = Boolean(horizonPath);
  const screenshotBaselineTrusted = terrainBaseline?.status === 'pass'
    && terrainBaseline.measurementTrust?.status === 'pass'
    && (terrainBaseline.scenarios ?? []).reduce((sum, scenario) => sum + (scenario.shots?.length ?? 0), 0) >= 4;
  const matchedPerfTrusted = terrainBaseline?.performanceBaselines?.openFrontier?.status === 'pass'
    && terrainBaseline.performanceBaselines.aShau?.status === 'pass';
  const baselineReady = hasHorizon && screenshotBaselineTrusted && matchedPerfTrusted;
  return {
    id: 'large-mode-vegetation-horizon',
    bureau: 'KB-TERRAIN',
    status: baselineReady ? 'ready_for_branch' : (hasHorizon ? 'needs_baseline' : 'blocked'),
    priority: 4,
    summary: baselineReady && terrainSliceEvidence.farCanopyTint.status === 'evidence_complete'
      ? 'KB-TERRAIN has scoped far-canopy tint, short-palm retirement, and vegetation-grounding evidence; A Shau route/nav quality, new ground-cover imports, and final visual acceptance remain open.'
      : baselineReady
      ? 'Elevated Open Frontier/A Shau screenshot and perf-before baselines are ready; outer-canopy and small-palm removal work still need matched after evidence.'
      : 'Outer-canopy work needs matched elevated runtime screenshots and perf deltas before any far layer is accepted.',
    evidence: {
      horizonAuditPath: rel(horizonPath),
      terrainHorizonBaselinePath: rel(terrainBaselinePath),
      openFrontierPerfSummaryPath: rel(openFrontierSummaryPath),
      aShauPerfSummaryPath: rel(aShauSummaryPath),
      terrainBaselineStatus: terrainBaseline?.status ?? null,
      terrainBaselineMeasurementTrustStatus: terrainBaseline?.measurementTrust?.status ?? null,
      screenshotCount: (terrainBaseline?.scenarios ?? []).reduce((sum, scenario) => sum + (scenario.shots?.length ?? 0), 0),
      openFrontierP95AfterCeilingPlus1p5Ms: terrainBaseline?.performanceBaselines?.openFrontier?.p95AfterCeilingPlus1p5Ms ?? null,
      openFrontierDrawCallAfterCeiling10Percent: terrainBaseline?.performanceBaselines?.openFrontier?.drawCallAfterCeiling10Percent ?? null,
      aShauP95AfterCeilingPlus1p5Ms: terrainBaseline?.performanceBaselines?.aShau?.p95AfterCeilingPlus1p5Ms ?? null,
      aShauDrawCallAfterCeiling10Percent: terrainBaseline?.performanceBaselines?.aShau?.drawCallAfterCeiling10Percent ?? null,
      flaggedModes: horizon?.summary?.flaggedModes ?? null,
      largestBareTerrainBandMeters: horizon?.summary?.largestBareTerrainBandMeters ?? null,
      largestBareTerrainBandMode: horizon?.summary?.largestBareTerrainBandMode ?? null,
      terrainHydrologyAuditPath: rel(hydrologyPath),
      terrainHydrologyStatus: hydrology?.status ?? null,
      terrainHydrologySummary: hydrology?.summary ?? null,
      terrainHydrologyAShauSummary: hydrology?.scenarios?.aShau?.summary ?? null,
      terrainHydrologyOpenFrontierSummary: hydrology?.scenarios?.openFrontier?.summary ?? null,
      terrainHydrologyFlags: hydrology?.flags ?? null,
      terrainHydrologyOpenFrontierFlags: hydrology?.scenarios?.openFrontier?.flags ?? null,
      terrainHydrologyNextBranch: hydrology?.recommendation?.nextBranch ?? null,
      terrainHydrologyBakeManifestPath: rel(hydrologyBakeManifestPath),
      terrainHydrologyBakeManifestStatus: hydrologyBakeManifest?.schemaVersion === 1 ? 'present' : 'missing_or_stale',
      terrainHydrologyBakeLoaderPath: rel(hydrologyBakeLoaderPath),
      terrainHydrologyBakeLoaderStatus: hydrologyBakeLoaderStatus(hydrologyBakeLoaderPath),
      terrainHydrologyRuntimePreloadPath: existsSync(HYDROLOGY_RUNTIME_PRELOAD_PATH) ? rel(HYDROLOGY_RUNTIME_PRELOAD_PATH) : null,
      terrainHydrologyBiomeClassifierPath: existsSync(HYDROLOGY_BIOME_CLASSIFIER_PATH) ? rel(HYDROLOGY_BIOME_CLASSIFIER_PATH) : null,
      terrainHydrologyBiomeClassifierStatus: hydrologyBiomeClassifierStatus(
        existsSync(HYDROLOGY_BIOME_CLASSIFIER_PATH) ? HYDROLOGY_BIOME_CLASSIFIER_PATH : null,
      ),
      terrainHydrologyCorridorSamplerPath: hydrology?.staticContracts?.corridorSamplerPath
        ?? (existsSync(HYDROLOGY_CORRIDOR_PATH) ? rel(HYDROLOGY_CORRIDOR_PATH) : null),
      terrainHydrologyCorridorSamplerStatus: hydrology?.staticContracts?.corridorSamplerStatus
        ?? hydrologyCorridorStatus(existsSync(HYDROLOGY_CORRIDOR_PATH) ? HYDROLOGY_CORRIDOR_PATH : null),
      terrainWaterSystemAuditPath: rel(waterSystemAuditPath),
      terrainWaterSystemStatus: waterSystemAudit?.status ?? null,
      terrainWaterSystemContract: waterSystemAudit?.currentContract ?? null,
      terrainWaterSystemFindings: waterSystemAudit?.findings ?? null,
      terrainHydrologyBakeEntries: hydrologyBakeManifest?.entries?.map((entry) => ({
        modeId: entry.modeId ?? null,
        source: entry.source ?? null,
        seed: entry.seed ?? null,
        signature: entry.signature ?? null,
        hydrologyAsset: entry.hydrologyAsset ?? null,
      })) ?? null,
      terrainSliceEvidence,
    },
    requiredBefore: [
      baselineReady
        ? terrainSliceEvidence.farCanopyTint.status === 'evidence_complete'
          ? 'Continue KB-TERRAIN from A Shau route/nav quality or runtime ground-cover/trail asset acceptance; the current far-canopy tint slice has matched before/after evidence.'
          : 'Choose the first far-horizon owner path: visual-only proof, far-canopy cards, or vegetation distance policy.'
        : 'Use current elevated Open Frontier and A Shau screenshots as before evidence.',
      baselineReady
        ? 'Fresh-build the terrain horizon baseline before the after comparison if the current proof reused an existing perf build.'
        : 'Define whether the first branch is visual-only proof, far-canopy cards, or vegetation distance policy.',
      'Remove the short Quaternius palm only with a matched vegetation review that preserves the taller fanPalm/coconut palm-like species and reallocates the freed budget to grass or ground cover.',
      hydrology?.status === 'warn'
        ? 'Use the DEM hydrology audit to replace or explicitly reject the current elevation-only A Shau riverbank/swamp proxy before final vegetation ecology acceptance.'
        : 'Keep A Shau hydrology distribution backed by a current terrain hydrology audit artifact.',
      waterSystemAudit?.status === 'warn'
        ? 'Keep WaterSystem as the global fallback and build any accepted river/wetland rendering from hydrology channel data, not by stretching or clipping the current plane.'
        : 'Keep the water-system contract explicitly audited before enabling runtime river visuals.',
      'Treat EZ Tree or similar procedural tree tooling as a source-pipeline investigation only: verify licensing, browser GLB budget, and Pixel Forge bake compatibility before runtime import.',
      'Capture matched perf before and after in Open Frontier and A Shau.',
    ],
    acceptance: [
      'Elevated Open Frontier and A Shau screenshots show improved horizon coverage.',
      'The short Quaternius palm is absent from runtime vegetation and shipped assets while the taller palm-like species remain visible and the replacement ground cover is documented.',
      'Any generated tree/ground-cover source GLB has a reviewed license, triangle/texture budget, Pixel Forge bake, and screenshot proof before becoming a shipped asset.',
      'Outer canopy adds no more than 1.5ms p95 frame time and no more than 10% draw-call growth.',
      'No near/mid vegetation regression in ground cameras.',
    ],
    nonClaims: [
      terrainSliceEvidence.farCanopyTint.status === 'evidence_complete'
        ? 'Do not generalize the far-canopy tint slice into full A Shau route/nav, terrain-stall, ground-cover import, or final art-direction acceptance.'
        : 'Do not accept an outer canopy from static horizon audit alone.',
      'Do not start WebGPU to solve far canopy during Cycle 3.',
    ],
  };
}

function buildCullTarget(
  cullingPath: string | null,
  culling: CullingProof | null,
  cullingBaselinePath: string | null,
  cullingBaseline: CullingOwnerBaseline | null,
  openFrontierSummaryPath: string | null,
  aShauSummaryPath: string | null,
  combat120SummaryPath: string | null,
  closePoolResidency: ClosePoolResidencyEvidence,
  cullingSliceEvidence: CullingSliceEvidence,
): Cycle3Target {
  const trusted = culling?.status === 'pass' && culling.measurementTrust?.status === 'pass';
  const ownerBaselineReady = cullingBaseline?.status === 'pass'
    && cullingBaseline.measurementTrust?.status === 'pass'
    && cullingBaseline.selectedOwnerPath?.status === 'ready_for_branch';
  const closePoolAccepted = closePoolResidency.status === 'evidence_complete';
  const staticOwnerPathAccepted = cullingSliceEvidence.staticFeatureAndVisibleHelicopterOwnerPath.status === 'evidence_complete';
  const vehicleInteractionSafetyAccepted = cullingSliceEvidence.vehicleInteractionSafety.status === 'evidence_complete';
  return {
    id: 'static-feature-and-vehicle-culling-hlod',
    bureau: 'KB-CULL',
    status: ownerBaselineReady ? 'ready_for_branch' : (trusted ? 'needs_baseline' : 'blocked'),
    priority: 5,
    summary: ownerBaselineReady
      ? closePoolAccepted && staticOwnerPathAccepted
        ? vehicleInteractionSafetyAccepted
          ? 'KB-CULL has scoped trusted after slices for the selected static-feature/visible-helicopter owner path, close-NPC pool residency, and unit-level vehicle interaction safety; broad HLOD, parked-aircraft playtest, future vehicle driving, and vegetation culling remain open.'
          : 'KB-CULL has scoped trusted after slices for the selected static-feature/visible-helicopter owner path and close-NPC pool residency; broad HLOD, vehicle, and vegetation culling remain open.'
        : closePoolAccepted
        ? 'KB-CULL has a selected owner-path before baseline for large-mode world static features and visible helicopters, plus a scoped trusted close-NPC pool-residency after slice.'
        : staticOwnerPathAccepted
        ? vehicleInteractionSafetyAccepted
          ? 'KB-CULL has scoped evidence for the selected large-mode static-feature/visible-helicopter owner path and vehicle interaction safety; close-NPC residency and broader HLOD remain open.'
          : 'KB-CULL has a scoped trusted after slice for the selected large-mode static-feature/visible-helicopter owner path; close-NPC residency and broader HLOD remain open.'
        : 'KB-CULL has a selected owner-path before baseline for large-mode world static features and visible helicopters.'
      : 'Culling/HLOD remediation has category proof, but each actual change still needs representative before/after renderer telemetry.',
    evidence: {
      cullingProofPath: rel(cullingPath),
      cullingOwnerBaselinePath: rel(cullingBaselinePath),
      openFrontierPerfSummaryPath: rel(openFrontierSummaryPath),
      aShauPerfSummaryPath: rel(aShauSummaryPath),
      combat120PerfSummaryPath: rel(combat120SummaryPath),
      status: culling?.status ?? null,
      measurementTrustStatus: culling?.measurementTrust?.status ?? null,
      drawCalls: culling?.rendererInfo?.drawCalls ?? null,
      triangles: culling?.rendererInfo?.triangles ?? null,
      ownerBaselineStatus: cullingBaseline?.status ?? null,
      ownerBaselineMeasurementTrustStatus: cullingBaseline?.measurementTrust?.status ?? null,
      selectedOwnerPathId: cullingBaseline?.selectedOwnerPath?.id ?? null,
      selectedOwnerCategories: cullingBaseline?.selectedOwnerPath?.ownerCategories ?? null,
      openFrontierVisibleUnattributedPercent: cullingBaseline?.performanceBaselines?.openFrontier?.visibleUnattributedPercent ?? null,
      aShauVisibleUnattributedPercent: cullingBaseline?.performanceBaselines?.aShau?.visibleUnattributedPercent ?? null,
      ownerEvidence: cullingBaseline?.selectedOwnerPath?.evidence ?? null,
      closePoolResidency,
      cullingSliceEvidence,
    },
    requiredBefore: [
      ownerBaselineReady
        ? closePoolAccepted && staticOwnerPathAccepted
          ? vehicleInteractionSafetyAccepted
            ? 'Continue broad KB-CULL from HLOD, parked-aircraft playtest, future vehicle-driving, or vegetation-distance decisions; selected static-feature/visible-helicopter, close-NPC residency, and vehicle interaction safety slices already have scoped evidence.'
            : 'Continue broad KB-CULL from HLOD, vehicle interaction, or vegetation-distance decisions; selected static-feature/visible-helicopter and close-NPC residency slices already have scoped trusted after evidence.'
          : closePoolAccepted
          ? 'Continue broad KB-CULL from the selected static-feature/visible-helicopter owner path; the close-NPC pool-residency slice already has scoped trusted after evidence.'
          : staticOwnerPathAccepted
          ? vehicleInteractionSafetyAccepted
            ? 'Continue broad KB-CULL from close-NPC residency, HLOD, parked-aircraft playtest, future vehicle-driving, or vegetation-distance decisions; selected static-feature/visible-helicopter and vehicle interaction safety slices already have scoped evidence.'
            : 'Continue broad KB-CULL from close-NPC residency, HLOD, or vehicle interaction decisions; the selected static-feature/visible-helicopter owner path already has scoped trusted after evidence.'
          : 'Start with the selected owner path or explicitly file a different owner decision before editing runtime culling code.'
        : 'Pick one owner path: static world features, parked aircraft visibility, close NPC pool residency, or vegetation imposters.',
      ownerBaselineReady
        ? 'Rerun the culling owner baseline after any candidate change and compare matched owner draw-call/triangle deltas.'
        : 'Capture representative before scene attribution and renderer stats for that path.',
      'Keep HLOD/culling registration visible in docs and artifacts.',
    ],
    acceptance: [
      'Visible unattributed triangles stay below 10%.',
      'Draw-call/triangle deltas improve in matched camera windows.',
      'No hidden gameplay interaction or vehicle entry regression.',
    ],
    nonClaims: [
      'Do not use the deterministic proof screenshot as gameplay scale evidence.',
      closePoolAccepted || staticOwnerPathAccepted
        ? 'Do not generalize scoped KB-CULL slices into broad HLOD, parked-aircraft gameplay, future vehicle-driving, or vegetation culling acceptance.'
        : 'Do not certify culling from static inventory alone.',
    ],
  };
}

function writeMarkdown(report: KickoffReport, path: string): void {
  const lines = [
    '# Projekt Objekt-143 Cycle 3 Kickoff',
    '',
    `Generated: ${report.createdAt}`,
    `Source SHA: ${report.sourceGitSha}`,
    `Status: ${report.status.toUpperCase()}`,
    '',
    '## Recommended Order',
    '',
    ...report.recommendedOrder.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Targets',
    '',
    '| Priority | Target | Bureau | Status | Summary |',
    '| ---: | --- | --- | --- | --- |',
    ...report.targets.map((target) =>
      `| ${target.priority} | ${target.id} | ${target.bureau} | ${target.status} | ${target.summary} |`
    ),
    '',
    '## Open Decisions',
    '',
    ...report.openDecisions.map((decision) => `- ${decision}`),
    '',
  ];
  writeFileSync(path, lines.join('\n'), 'utf-8');
}

function main(): void {
  const artifactFiles = walkFiles(ARTIFACT_ROOT, () => true);
  const cycle2Path = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-cycle2-proof-suite', 'cycle2-proof-summary.json')));
  const opticsScalePath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-optics-scale-proof', 'summary.json')));
  const optikExpandedPath = latestExpandedProofPath(artifactFiles, 'expanded-stress');
  const runtimeLodExpandedPath = latestExpandedProofPath(artifactFiles, 'runtime-lod-edge');
  const optikDecisionPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-optik-decision-packet', 'decision-packet.json')));
  const optikHumanReviewPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-optik-human-review', 'review-summary.json')));
  const texturePath = latestFile(artifactFiles, (path) => path.endsWith(join('pixel-forge-texture-audit', 'texture-audit.json')));
  const startupOpenPath = latestStartupSummary(artifactFiles, 'open-frontier');
  const startupZonePath = latestStartupSummary(artifactFiles, 'zone-control');
  const vegetationNormalProofPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-vegetation-normal-proof', 'summary.json')));
  const loadBranchSelectorPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-load-branch-selector', 'load-branch-selector.json')));
  const pixelForgeVegetationReadinessPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-pixel-forge-vegetation-readiness', 'vegetation-readiness.json')));
  const vegetationCandidateProofPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-vegetation-candidate-proof', 'summary.json')));
  const vegetationCandidateImportPlanPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-vegetation-candidate-import-plan', 'import-plan.json')));
  const openFrontierPerfPath = latestPerfSummaryForMode(artifactFiles, 'open_frontier');
  const combat120PerfPath = latestPerfSummaryForMode(artifactFiles, 'ai_sandbox');
  const aShauPerfPath = latestPerfSummaryForMode(artifactFiles, 'a_shau_valley');
  const grenadePath = latestFile(artifactFiles, (path) => path.includes('grenade-spike-') && path.endsWith('summary.json'));
  const horizonPath = latestFile(artifactFiles, (path) => path.endsWith(join('vegetation-horizon-audit', 'horizon-audit.json')));
  const terrainBaselinePath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-terrain-horizon-baseline', 'summary.json')));
  const terrainBeforeBaselinePath = latestCleanTerrainHorizonBaseline(artifactFiles);
  const terrainInventoryPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-terrain-asset-inventory', 'terrain-asset-inventory.json')));
  const vegetationGroundingPath = latestFile(artifactFiles, (path) => path.endsWith(join('vegetation-grounding-audit', 'summary.json')));
  const terrainHydrologyPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-terrain-hydrology-audit', 'hydrology-audit.json')));
  const waterSystemAuditPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-water-system-audit', 'water-system-audit.json')));
  const hydrologyBakeManifestPath = existsSync(HYDROLOGY_BAKE_MANIFEST_PATH) ? HYDROLOGY_BAKE_MANIFEST_PATH : null;
  const hydrologyBakeLoaderPath = existsSync(HYDROLOGY_BAKE_LOADER_PATH) ? HYDROLOGY_BAKE_LOADER_PATH : null;
  const cullingPath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-culling-proof', 'summary.json')));
  const cullingBaselinePath = latestFile(artifactFiles, (path) => path.endsWith(join('projekt-143-culling-owner-baseline', 'summary.json')));
  const cullingBeforeBaselinePath = latestCleanCullingOwnerBaseline(artifactFiles);

  const cycle2 = readJson<Cycle2Proof>(cycle2Path);
  const opticsScale = readJson<OpticsScaleProof>(opticsScalePath);
  const optikExpanded = readJson<OptikExpandedProof>(optikExpandedPath);
  const runtimeLodExpanded = readJson<OptikExpandedProof>(runtimeLodExpandedPath);
  const optikDecision = readJson<OptikDecisionPacket>(optikDecisionPath);
  const optikHumanReview = readJson<OptikHumanReview>(optikHumanReviewPath);
  const texture = readJson<TextureAudit>(texturePath);
  const startupOpen = readJson<StartupSummary>(startupOpenPath);
  const startupZone = readJson<StartupSummary>(startupZonePath);
  const vegetationNormalProof = readJson<VegetationNormalProof>(vegetationNormalProofPath);
  const loadBranchSelector = readJson<LoadBranchSelector>(loadBranchSelectorPath);
  const pixelForgeVegetationReadiness = readJson<PixelForgeVegetationReadiness>(pixelForgeVegetationReadinessPath);
  const vegetationCandidateProof = readJson<VegetationCandidateProof>(vegetationCandidateProofPath);
  const vegetationCandidateImportPlan = readJson<VegetationCandidateImportPlan>(vegetationCandidateImportPlanPath);
  const openFrontierPerf = readJson<PerfSummary>(openFrontierPerfPath);
  const aShauPerf = readJson<PerfSummary>(aShauPerfPath);
  const grenade = readJson<GrenadeSummary>(grenadePath);
  const horizon = readJson<HorizonAudit>(horizonPath);
  const terrainBaseline = readJson<TerrainHorizonBaseline>(terrainBaselinePath);
  const terrainBeforeBaseline = readJson<TerrainHorizonBaseline>(terrainBeforeBaselinePath);
  const terrainInventory = readJson<TerrainAssetInventory>(terrainInventoryPath);
  const vegetationGrounding = readJson<VegetationGroundingAudit>(vegetationGroundingPath);
  const terrainHydrology = readJson<TerrainHydrologyAudit>(terrainHydrologyPath);
  const waterSystemAudit = readJson<TerrainWaterSystemAudit>(waterSystemAuditPath);
  const hydrologyBakeManifest = readJson<HydrologyBakeManifest>(hydrologyBakeManifestPath);
  const culling = readJson<CullingProof>(cullingPath);
  const cullingBaseline = readJson<CullingOwnerBaseline>(cullingBaselinePath);
  const cullingBeforeBaseline = readJson<CullingOwnerBaseline>(cullingBeforeBaselinePath);
  const closePoolBeforeOpenFrontierPath = cullingBaselinePerfPath(cullingBeforeBaseline, 'openFrontier');
  const closePoolOpenFrontierAfterPath = cullingBaselinePerfPath(cullingBaseline, 'openFrontier') ?? openFrontierPerfPath;
  const closePoolAShauAfterPath = cullingBaselinePerfPath(cullingBaseline, 'aShau') ?? aShauPerfPath;
  const closePoolBeforeOpenFrontier = readJson<PerfSummary>(closePoolBeforeOpenFrontierPath);
  const closePoolOpenFrontierAfter = readJson<PerfSummary>(closePoolOpenFrontierAfterPath);
  const closePoolAShauAfter = readJson<PerfSummary>(closePoolAShauAfterPath);
  const closePoolResidency = buildClosePoolResidencyEvidence(
    closePoolBeforeOpenFrontierPath,
    closePoolBeforeOpenFrontier,
    closePoolOpenFrontierAfterPath,
    closePoolOpenFrontierAfter,
    closePoolAShauAfterPath,
    closePoolAShauAfter,
  );
  const terrainSliceEvidence = buildTerrainSliceEvidence(
    terrainBeforeBaselinePath,
    terrainBeforeBaseline,
    terrainBaselinePath,
    terrainBaseline,
    vegetationGroundingPath,
    vegetationGrounding,
    terrainInventoryPath,
    terrainInventory,
  );
  const cullingSliceEvidence = buildCullingSliceEvidence(
    cullingBeforeBaselinePath,
    cullingBeforeBaseline,
    cullingBaselinePath,
    cullingBaseline,
  );

  const targets = [
    buildOptikTarget(
      opticsScalePath,
      opticsScale,
      optikDecisionPath,
      optikDecision,
      optikHumanReviewPath,
      optikHumanReview,
      optikExpandedPath,
      optikExpanded,
      runtimeLodExpandedPath,
      runtimeLodExpanded,
    ),
    buildLoadTarget(
      texturePath,
      startupOpenPath,
      startupOpen,
      startupZonePath,
      startupZone,
      texture,
      vegetationNormalProofPath,
      vegetationNormalProof,
      loadBranchSelectorPath,
      loadBranchSelector,
      pixelForgeVegetationReadinessPath,
      pixelForgeVegetationReadiness,
      vegetationCandidateProofPath,
      vegetationCandidateProof,
      vegetationCandidateImportPlanPath,
      vegetationCandidateImportPlan,
      closePoolResidency,
    ),
    buildEffectsTarget(grenadePath, grenade),
    buildTerrainTarget(
      horizonPath,
      horizon,
      openFrontierPerfPath,
      aShauPerfPath,
      terrainBaselinePath,
      terrainBaseline,
      terrainHydrologyPath,
      terrainHydrology,
      hydrologyBakeManifestPath,
      hydrologyBakeManifest,
      hydrologyBakeLoaderPath,
      waterSystemAuditPath,
      waterSystemAudit,
      terrainSliceEvidence,
    ),
    buildCullTarget(cullingPath, culling, cullingBaselinePath, cullingBaseline, openFrontierPerfPath, aShauPerfPath, combat120PerfPath, closePoolResidency, cullingSliceEvidence),
  ].sort((a, b) => a.priority - b.priority);

  const report: KickoffReport = {
    createdAt: new Date().toISOString(),
    sourceGitSha: gitSha(),
    mode: 'projekt-143-cycle3-kickoff',
    status: statusFromTargets(targets, cycle2),
    inputs: {
      cycle2Proof: rel(cycle2Path),
      opticsScaleProof: rel(opticsScalePath),
      optikExpandedProof: rel(optikExpandedPath),
      runtimeLodExpandedProof: rel(runtimeLodExpandedPath),
      optikDecisionPacket: rel(optikDecisionPath),
      optikHumanReview: rel(optikHumanReviewPath),
      textureAudit: rel(texturePath),
      startupOpenFrontier: rel(startupOpenPath),
      startupZoneControl: rel(startupZonePath),
      vegetationNormalProof: rel(vegetationNormalProofPath),
      loadBranchSelector: rel(loadBranchSelectorPath),
      pixelForgeVegetationReadiness: rel(pixelForgeVegetationReadinessPath),
      openFrontierPerfSummary: rel(openFrontierPerfPath),
      closePoolBeforeOpenFrontier: rel(closePoolBeforeOpenFrontierPath),
      closePoolOpenFrontierAfter: rel(closePoolOpenFrontierAfterPath),
      closePoolAShauAfter: rel(closePoolAShauAfterPath),
      combat120PerfSummary: rel(combat120PerfPath),
      aShauPerfSummary: rel(aShauPerfPath),
      grenadeSpike: rel(grenadePath),
      horizonAudit: rel(horizonPath),
      terrainHorizonBaseline: rel(terrainBaselinePath),
      terrainBeforeHorizonBaseline: rel(terrainBeforeBaselinePath),
      terrainAssetInventory: rel(terrainInventoryPath),
      vegetationGrounding: rel(vegetationGroundingPath),
      terrainHydrology: rel(terrainHydrologyPath),
      terrainWaterSystemAudit: rel(waterSystemAuditPath),
      terrainHydrologyBakeManifest: rel(hydrologyBakeManifestPath),
      terrainHydrologyBakeLoader: rel(hydrologyBakeLoaderPath),
      terrainHydrologyCorridorSampler: existsSync(HYDROLOGY_CORRIDOR_PATH) ? rel(HYDROLOGY_CORRIDOR_PATH) : null,
      cullingProof: rel(cullingPath),
      cullingOwnerBaseline: rel(cullingBaselinePath),
      cullingBeforeOwnerBaseline: rel(cullingBeforeBaselinePath),
    },
    targets,
    recommendedOrder: [
      'Treat the 2.95m NPC target drop, per-tile imposter crop, selected-lighting luma proof, expanded-luma atmosphere pass, and owner-accepted runtime-equivalent review packet as the current KB-OPTIK remediation slice.',
      'Do not destabilize KB-OPTIK for small pose/brightness polish unless a future crop/view/rebake pass keeps the same runtime-equivalent proof gates.',
      loadBranchSelector?.selectedBranch
        ? `For KB-LOAD, execute ${loadBranchSelector.selectedBranch} next; start with the Pixel Forge vegetation readiness requirement (${pixelForgeVegetationReadiness?.branchExecutionState ?? 'readiness_missing'}), then prove startup latency does not regress while reducing remaining uploads, and keep vegetation normal-map removal rejected for default policy while the latest A/B proof is visual WARN.`
        : 'For KB-LOAD, treat the old giantPalm warmup as retired partial upload evidence only; the next branch must prove startup latency does not regress while reducing remaining uploads. Vegetation normal-map removal is rejected for default policy while the latest A/B proof remains visual WARN.',
      'For KB-EFFECTS, preserve the unlit pooled explosion architecture; do not reopen low-load grenade work unless visuals change, and do not infer combat120/stress closeout.',
      'For KB-TERRAIN, use the terrain horizon baseline proof as before evidence, use the hydrology audit to route the reusable river/wetness-mask branch, then require matched after screenshots plus Open Frontier/A Shau perf deltas.',
      'For KB-CULL, treat close-NPC pool residency as a scoped trusted after slice only; continue broad static-feature, vehicle, HLOD, and vegetation culling from owner-path before/after evidence.',
      'Keep WebGPU out of Cycle 3 unless the owner explicitly approves reopening the point-of-no-return decision.',
    ],
    openDecisions: [
      loadBranchSelector?.selectedBranch
        ? `Can the selected KB-LOAD ${loadBranchSelector.selectedBranch} branch clear the Pixel Forge ${pixelForgeVegetationReadiness?.branchExecutionState ?? 'readiness'} requirement, then matched quiet-machine startup and visual proof, without destabilizing accepted vegetation/NPC visuals?`
        : 'Should the next KB-LOAD branch target fanPalm with a latency guard, NPC atlases, approved asset regeneration, or upload scheduling now that vegetation normal-map removal is not accepted for default policy?',
      'Which large-mode p95/draw-call budget will be used for far-canopy acceptance in this cycle?',
      'Should the next KB-TERRAIN branch replace the current elevation-only A Shau riverbank/swamp proxy with a reusable baked DEM/procedural hydrology mask, and how should that same mask drive future Open Frontier rivers?',
      'Is EZ Tree the right source generator for missing Vietnam trees and trail/ground cover, or should another licensed procedural source feed the Pixel Forge bake path?',
    ],
  };

  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonFile = join(outputDir, 'cycle3-kickoff-summary.json');
  const markdownFile = join(outputDir, 'cycle3-kickoff-summary.md');
  writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeMarkdown(report, markdownFile);

  console.log(`Projekt 143 Cycle 3 kickoff ${report.status.toUpperCase()}: ${relative(process.cwd(), jsonFile)}`);
  for (const target of report.targets) {
    console.log(`- ${target.status.toUpperCase()} ${target.id}: ${target.summary}`);
  }

  if (process.argv.includes('--strict') && report.status !== 'pass') {
    process.exitCode = 1;
  }
}

main();
