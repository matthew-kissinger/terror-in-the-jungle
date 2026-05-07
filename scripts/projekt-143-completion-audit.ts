#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

type CompletionStatus = 'complete' | 'not_complete';
type RequirementStatus = 'pass' | 'partial' | 'blocked' | 'fail' | 'missing';

type CycleTargetStatus = 'evidence_complete' | 'ready_for_branch' | 'needs_decision' | 'needs_baseline' | 'blocked';

interface Cycle3Target {
  id?: string;
  bureau?: string;
  status?: CycleTargetStatus;
  summary?: string;
  evidence?: Record<string, unknown>;
}

interface Cycle3Report {
  createdAt?: string;
  sourceGitSha?: string;
  status?: string;
  inputs?: Record<string, string | null>;
  targets?: Cycle3Target[];
  openDecisions?: string[];
  recommendedOrder?: string[];
}

interface EvidenceSuiteReport {
  status?: string;
  steps?: Array<{ id?: string; ok?: boolean; artifactPath?: string | null }>;
}

interface TerrainAssetInventory {
  status?: string;
  summary?: {
    runtimeVegetationSpecies?: number;
    retiredVegetationSpecies?: number;
    blockedVegetationSpecies?: number;
    missingAssets?: number;
    pixelForgeGroundCoverCandidates?: number;
    pixelForgeGalleryBuildingCandidates?: number;
    pixelForgeGalleryGroundVehicleCandidates?: number;
  };
}

interface TerrainPlacementAudit {
  status?: string;
  assumptions?: {
    foundationNativeReliefWarnMeters?: number;
  };
  summary?: {
    modes?: number;
    auditedFeatures?: number;
    failFeatures?: number;
    warnFeatures?: number;
  };
  modes?: Array<{
    id?: string;
    sampledSeed?: number | null;
    features?: Array<{
      id?: string;
      kind?: string;
      status?: string;
      flags?: string[];
      sourceSpanMeters?: number;
      stampedSpanMeters?: number;
      generatedPlacements?: {
        count?: number;
        maxFootprintRadiusMeters?: number;
        maxSourceSpanMeters?: number;
        maxStampedSpanMeters?: number;
        nativeReliefWarnCount?: number;
        worstNativeReliefPlacements?: Array<{
          id?: string;
          modelPath?: string;
          worldX?: number;
          worldZ?: number;
          footprintRadiusMeters?: number;
          sourceSpanMeters?: number;
          stampedSpanMeters?: number;
        }>;
      };
    }>;
  }>;
}

interface TerrainRouteAudit {
  status?: string;
  summary?: {
    modes?: number;
    routeAwareModes?: number;
    failModes?: number;
    warnModes?: number;
    totalRouteLengthMeters?: number;
    totalRouteCapsuleStamps?: number;
  };
  modes?: Array<{
    id?: string;
    status?: string;
    routeCount?: number;
    routeLengthMeters?: number;
    routeCapsuleStamps?: number;
    routeSurfacePatches?: number;
    flags?: string[];
  }>;
}

interface TerrainDistributionAudit {
  status?: string;
  summary?: {
    modes?: number;
    warnModes?: number;
    failModes?: number;
    flaggedModes?: number;
  };
  modes?: Array<{
    id?: string;
    status?: string;
    flags?: string[];
    runtimeHydrologyClassification?: {
      loaded?: boolean;
      biomeIds?: string[];
    };
    materialPrimaryDistribution?: Array<{ id?: string; percent?: number }>;
    flatGroundMaterialDistribution?: Array<{ id?: string; percent?: number }>;
    vegetationRelativeDensity?: Array<{ id?: string; percent?: number }>;
  }>;
}

interface PixelForgeStructureReview {
  status?: string;
  summary?: {
    buildingCandidates?: number;
    buildingGridCoverage?: number;
    groundVehicleCandidates?: number;
    groundVehicleGridCoverage?: number;
    missingBuildingGrids?: number;
    missingGroundVehicleGrids?: number;
    orphanBuildingGrids?: number;
    orphanGroundVehicleGrids?: number;
    highOrMediumOptimizationRisk?: number;
  };
  files?: {
    markdown?: string;
    contactSheet?: string | null;
  };
  findings?: string[];
  nextRequiredWork?: string[];
  nonClaims?: string[];
}

interface PixelForgeBureauReport {
  status?: string;
  pixelForgeRootExists?: boolean;
  galleryManifest?: {
    totalEntries?: number;
    vegetationSpecies?: string[];
    runtimeSpeciesPresent?: string[];
    runtimeSpeciesMissing?: string[];
    retiredSpeciesPresent?: string[];
    blockedSpeciesPresent?: string[];
    productionStatuses?: Record<string, string | null>;
    manifestPolicyAligned?: boolean;
    manifestPolicyIssues?: string[];
  };
  npcPackage?: {
    exists?: boolean;
    factionCount?: number | null;
    clipCount?: number | null;
    imposterCount?: number | null;
  };
  relevanceCatalog?: {
    propFamilies?: unknown[];
    vegetationPackages?: unknown[];
    queues?: unknown[];
  };
}

interface PixelForgeVegetationReadinessReport {
  status?: string;
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
}

interface VegetationCandidateProof {
  status?: string;
  target?: {
    selectedVariants?: string[];
    targetTileSize?: number | null;
    targetAtlasSize?: string | null;
  };
  files?: {
    contactSheet?: string;
  };
  aggregate?: {
    expectedPairs?: number;
    completePairs?: number;
    missingCandidatePairs?: number;
    maxOpaqueLumaDeltaPercent?: number | null;
    maxOpaqueRatioDelta?: number | null;
  };
}

interface VegetationCandidateImportPlan {
  status?: string;
  importState?: string;
  dryRun?: boolean;
  applyRequested?: boolean;
  ownerAccepted?: boolean;
  inputs?: {
    candidateContactSheet?: string | null;
  };
  summary?: {
    expectedItems?: number;
    readyItems?: number;
    appliedItems?: number;
    blockedItems?: number;
    runtimeDestinations?: string[];
  };
}

interface VegetationNormalProof {
  status?: string;
  files?: { contactSheet?: string };
  aggregate?: {
    expectedPairs?: number;
    capturedPairs?: number;
    maxMeanAbsRgbDelta?: number | null;
    maxAbsMeanLumaDeltaPercent?: number | null;
  };
}

interface ActiveDriverDiagnostic {
  status?: string;
  summary?: {
    telemetryPresent?: boolean;
    runtimeSampleCount?: number;
    finalBotState?: string | null;
    finalObjectiveKind?: string | null;
    finalObjectiveDistance?: number | null;
    finalPathQueryStatus?: string | null;
    finalPathTargetDistance?: number | null;
    finalPlayerDistanceMoved?: number | null;
    finalPlayerBlockedByTerrain?: number | null;
    finalCollisionHeightDeltaAtPlayer?: number | null;
    finalPlayerMovementBlockReason?: string | null;
    finalNearestOpforDistance?: number | null;
    finalNearestPerceivedEnemyDistance?: number | null;
    finalPerceptionRange?: number | null;
    finalEngineShotsFired?: number;
    finalEngineShotsHit?: number;
    finalKills?: number;
    maxStuckSeconds?: number;
    maxWaypointReplanFailures?: number;
  };
  findings?: string[];
}

interface PerfCaptureSummary {
  status?: string;
  failureReason?: string;
  durationSeconds?: number;
  scenario?: {
    mode?: string;
  };
  validation?: {
    overall?: string;
    checks?: Array<{ id?: string; status?: string; value?: number | string | null }>;
  };
  measurementTrust?: { status?: string };
}

interface PerfHeapDiagnostic {
  status?: string;
  inputs?: {
    summary?: string;
  };
  sourceSummary?: {
    status?: string | null;
    validation?: string | null;
    measurementTrust?: string | null;
  };
  validationHighlights?: {
    peakP99FrameMs?: { status?: string; value?: number | string | null };
    heapPeakGrowthMb?: { status?: string; value?: number | string | null };
    heapGrowthMb?: { status?: string; value?: number | string | null };
    heapRecoveryRatio?: { status?: string; value?: number | string | null };
    shots?: { status?: string; value?: number | string | null };
    hits?: { status?: string; value?: number | string | null };
  };
  heap?: {
    peakMb?: number | null;
    endMb?: number | null;
    peakGrowthMb?: number | null;
    endGrowthMb?: number | null;
    reclaimedFromPeakRatio?: number | null;
  };
  streamSignalsNearPeak?: {
    vegetationPendingObserved?: boolean;
    collisionPendingObserved?: boolean;
    maxVegetationTimeMs?: number | null;
    maxCollisionPendingUnits?: number | null;
  };
  classification?: {
    heapShape?: string;
    likelySource?: string;
    acceptance?: string;
  };
  files?: {
    summary?: string;
    markdown?: string;
  };
}

interface GrenadeSummary {
  status?: string;
  measurementTrust?: { status?: string };
}

interface HydrologyBakeManifest {
  schemaVersion?: number;
  generator?: string;
  entries?: Array<{
    modeId?: string;
    source?: string;
    seed?: number | null;
    signature?: string;
    hydrologyAsset?: string;
  }>;
}

interface WaterSystemAudit {
  status?: string;
  currentContract?: Record<string, unknown>;
  findings?: string[];
  nextBranchRequirements?: string[];
}

interface WaterRuntimeProof {
  status?: string;
  results?: Array<{
    mode?: string;
    screenshot?: string;
    errors?: unknown[];
    proof?: {
      waterInfo?: {
        enabled?: boolean;
        waterVisible?: boolean;
        hydrologyRiverVisible?: boolean;
        hydrologyChannelCount?: number;
        hydrologySegmentCount?: number;
      };
      groupPresent?: boolean;
      meshPresent?: boolean;
    };
  }>;
}

interface TerrainHydrologyAudit {
  status?: string;
  summary?: unknown;
  flags?: unknown[];
  scenarios?: {
    aShau?: { summary?: unknown; flags?: unknown[] };
    openFrontier?: { summary?: unknown; flags?: unknown[] };
  };
}

interface TerrainVisualReview {
  status?: string;
  files?: {
    summary?: string;
    markdown?: string;
    contactSheet?: string;
  };
  scenarios?: Array<{
    mode?: string;
    status?: string;
    shots?: Array<{
      kind?: string;
      file?: string;
      errors?: unknown[];
      imageMetrics?: unknown;
    }>;
    browserErrors?: unknown[];
    pageErrors?: unknown[];
  }>;
  checks?: Array<{ id?: string; status?: string; value?: unknown; message?: string }>;
  requiredNextActions?: string[];
  nonClaims?: string[];
}

interface WebgpuStrategyAudit {
  activeRuntime?: {
    activeWebgpuSourceMatches?: unknown[];
    webglRendererEntrypoints?: unknown[];
    migrationBlockers?: Array<{ matches?: unknown[] }>;
  };
  nearMetalPlatformTrack?: {
    browserProbeStatus?: string;
  };
  recommendation?: {
    decision?: string;
  };
}

interface PlatformCapabilityProbe {
  status?: string;
  config?: {
    runBrowser?: boolean;
  };
  headerContract?: {
    status?: string;
    localHeadersFile?: {
      path?: string;
      exists?: boolean;
      coop?: string | null;
      coep?: string | null;
      crossOriginIsolationConfigured?: boolean;
    };
    live?: {
      checked?: boolean;
      url?: string;
      statusCode?: number | null;
      coop?: string | null;
      coep?: string | null;
      cacheControl?: string | null;
      accessControlAllowOrigin?: string | null;
      crossOriginIsolationHeadersPresent?: boolean | null;
      error?: string | null;
    };
  };
  browser?: {
    isolated?: {
      webgl2?: {
        renderer?: string | null;
        hasDisjointTimerQueryWebgl2?: boolean;
      };
      webgpu?: {
        adapterAvailable?: boolean;
      };
      sharedArrayBuffer?: {
        available?: boolean;
      };
      offscreenCanvas?: {
        webgl2ContextAvailable?: boolean;
      };
    } | null;
  };
  checks?: Array<{ name?: string; status?: string; detail?: string }>;
}

interface PromptChecklistItem {
  id: string;
  requirement: string;
  namedEvidence: string[];
  inspectedEvidence: Record<string, unknown>;
  status: RequirementStatus;
  coverage: string;
  missingOrWeak: string[];
  proxyWarning: string;
}

interface GitState {
  head: string;
  branchLine: string;
  shortStatus: string[];
  aheadOfOriginMaster: number | null;
  behindOriginMaster: number | null;
  dirty: boolean;
}

interface LiveReleaseProof {
  status?: string;
  git?: {
    head?: string;
    branchLine?: string;
    dirty?: boolean;
  };
  github?: {
    ci?: { databaseId?: number; conclusion?: string; status?: string; headSha?: string; url?: string } | null;
    deploy?: { databaseId?: number; conclusion?: string; status?: string; headSha?: string; url?: string } | null;
  };
  manifest?: {
    gitSha?: string | null;
    generatedAt?: string | null;
    assetBaseUrl?: string | null;
  };
  pagesHeaders?: Array<{
    path?: string;
    status?: number;
    contentType?: string | null;
    cacheControl?: string | null;
    coop?: string | null;
    coep?: string | null;
  }>;
  r2AshauDem?: {
    status?: number;
    url?: string;
    contentType?: string | null;
    contentLength?: string | null;
    expectedSize?: number | null;
    cacheControl?: string | null;
    cors?: string | null;
  } | null;
  browserSmoke?: {
    menuText?: string | null;
    modeVisible?: boolean;
    deployUiVisible?: boolean;
    retryVisible?: boolean;
    consoleErrors?: string[];
    pageErrors?: string[];
    requestErrors?: string[];
  } | null;
  checks?: Array<{ id?: string; status?: string; detail?: string }>;
}

interface CompletionAuditReport {
  createdAt: string;
  mode: 'projekt-143-completion-audit';
  objective: string;
  concreteSuccessCriteria: string[];
  completionStatus: CompletionStatus;
  canMarkGoalComplete: boolean;
  sourceGitSha: string;
  git: GitState;
  inputs: Record<string, string | null>;
  promptToArtifactChecklist: PromptChecklistItem[];
  blockers: string[];
  nextRequiredActions: string[];
  nonClaims: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-completion-audit';
const HYDROLOGY_BAKE_MANIFEST_PATH = join(process.cwd(), 'public', 'data', 'hydrology', 'bake-manifest.json');
const HYDROLOGY_BAKE_LOADER_PATH = join(process.cwd(), 'src', 'systems', 'terrain', 'hydrology', 'HydrologyBakeManifest.ts');
const HYDROLOGY_BIOME_CLASSIFIER_PATH = join(process.cwd(), 'src', 'systems', 'terrain', 'hydrology', 'HydrologyBiomeClassifier.ts');
const HYDROLOGY_CORRIDOR_PATH = join(process.cwd(), 'src', 'systems', 'terrain', 'hydrology', 'HydrologyCorridor.ts');
const HYDROLOGY_RUNTIME_PRELOAD_PATH = join(process.cwd(), 'src', 'core', 'ModeStartupPreparer.ts');
const TERRAIN_SURFACE_RUNTIME_PATH = join(process.cwd(), 'src', 'systems', 'terrain', 'TerrainSurfaceRuntime.ts');
const TERRAIN_MATERIAL_PATH = join(process.cwd(), 'src', 'systems', 'terrain', 'TerrainMaterial.ts');
const TERRAIN_BIOME_RUNTIME_CONFIG_PATH = join(process.cwd(), 'src', 'systems', 'terrain', 'TerrainBiomeRuntimeConfig.ts');
const A_SHAU_CONFIG_PATH = join(process.cwd(), 'src', 'config', 'AShauValleyConfig.ts');
const OPEN_FRONTIER_CONFIG_PATH = join(process.cwd(), 'src', 'config', 'OpenFrontierConfig.ts');
const PLAYER_BOT_TYPES_PATH = join(process.cwd(), 'src', 'dev', 'harness', 'playerBot', 'types.ts');
const PLAYER_BOT_CONTROLLER_PATH = join(process.cwd(), 'src', 'dev', 'harness', 'playerBot', 'PlayerBotController.ts');
const PERF_ACTIVE_DRIVER_PATH = join(process.cwd(), 'scripts', 'perf-active-driver.cjs');
const PERF_CAPTURE_PATH = join(process.cwd(), 'scripts', 'perf-capture.ts');
const COMBATANT_RENDERER_PATH = join(process.cwd(), 'src', 'systems', 'combat', 'CombatantRenderer.ts');
const PROJEKT_LEDGER_PATH = join(process.cwd(), 'docs', 'PROJEKT_OBJEKT_143.md');
const PROJEKT_HANDOFF_PATH = join(process.cwd(), 'docs', 'PROJEKT_OBJEKT_143_HANDOFF.md');
const ROADMAP_PATH = join(process.cwd(), 'docs', 'ROADMAP.md');
const BACKLOG_PATH = join(process.cwd(), 'docs', 'BACKLOG.md');
const CLOSE_MODEL_CULL_BEFORE_OPEN_FRONTIER_PATH = join(
  ARTIFACT_ROOT,
  '2026-05-06T09-06-03-544Z',
  'summary.json',
);
const CLOSE_MODEL_CULL_AFTER_OPEN_FRONTIER_PATH = join(
  ARTIFACT_ROOT,
  '2026-05-06T09-09-45-715Z',
  'summary.json',
);
const CLOSE_MODEL_CULL_AFTER_A_SHAU_PATH = join(
  ARTIFACT_ROOT,
  '2026-05-06T09-11-34-037Z',
  'summary.json',
);

function largeMapHydrologyDefaultConfigStatus(): 'default_large_map_hydrology_enabled' | 'not_default_enabled' {
  const aShau = existsSync(A_SHAU_CONFIG_PATH) ? readFileSync(A_SHAU_CONFIG_PATH, 'utf-8') : '';
  const openFrontier = existsSync(OPEN_FRONTIER_CONFIG_PATH) ? readFileSync(OPEN_FRONTIER_CONFIG_PATH, 'utf-8') : '';
  const enabled = [aShau, openFrontier].every((source) => source.includes('hydrology:')
    && source.includes('preload: true')
    && source.includes('biomeClassification:')
    && source.includes('enabled: true'));
  return enabled ? 'default_large_map_hydrology_enabled' : 'not_default_enabled';
}

function hydrologyBakeLoaderStatus(loaderPath: string | null): 'missing' | 'present_unwired' | 'feature_gated_preload' | 'default_mode_preload' {
  if (!loaderPath) return 'missing';
  const startupPreparer = existsSync(HYDROLOGY_RUNTIME_PRELOAD_PATH)
    ? readFileSync(HYDROLOGY_RUNTIME_PRELOAD_PATH, 'utf-8')
    : '';
  const hasPreloadWiring = startupPreparer.includes('maybePreloadHydrologyBake')
    && startupPreparer.includes('loadHydrologyBakeForMode')
    && startupPreparer.includes('setHydrologyBake');
  if (!hasPreloadWiring) return 'present_unwired';
  return largeMapHydrologyDefaultConfigStatus() === 'default_large_map_hydrology_enabled'
    ? 'default_mode_preload'
    : 'feature_gated_preload';
}

function hydrologyBiomeClassifierStatus(classifierPath: string | null): 'missing' | 'feature_gated_vegetation_classifier' | 'default_mode_vegetation_classifier' {
  if (!classifierPath) return 'missing';
  const startupPreparer = existsSync(HYDROLOGY_RUNTIME_PRELOAD_PATH)
    ? readFileSync(HYDROLOGY_RUNTIME_PRELOAD_PATH, 'utf-8')
    : '';
  const hasClassifierWiring = startupPreparer.includes('__PROJEKT_143_ENABLE_HYDROLOGY_BIOMES__')
    && startupPreparer.includes('setHydrologyBiomePolicy');
  if (!hasClassifierWiring) return 'missing';
  return largeMapHydrologyDefaultConfigStatus() === 'default_large_map_hydrology_enabled'
    ? 'default_mode_vegetation_classifier'
    : 'feature_gated_vegetation_classifier';
}

function hydrologyCorridorStatus(corridorPath: string | null): 'missing' | 'pure_world_space_helper' {
  if (!corridorPath) return 'missing';
  const source = readFileSync(corridorPath, 'utf-8');
  return source.includes('sampleHydrologyCorridor')
    && source.includes('findNearestHydrologyChannel')
    ? 'pure_world_space_helper'
    : 'missing';
}

function hydrologyMaterialMaskStatus(): 'missing' | 'present_unwired' | 'default_mode_material_mask' {
  const surfaceRuntime = existsSync(TERRAIN_SURFACE_RUNTIME_PATH) ? readFileSync(TERRAIN_SURFACE_RUNTIME_PATH, 'utf-8') : '';
  const material = existsSync(TERRAIN_MATERIAL_PATH) ? readFileSync(TERRAIN_MATERIAL_PATH, 'utf-8') : '';
  const biomeRuntime = existsSync(TERRAIN_BIOME_RUNTIME_CONFIG_PATH) ? readFileSync(TERRAIN_BIOME_RUNTIME_CONFIG_PATH, 'utf-8') : '';
  const hasMaterialShaderPath = material.includes('hydrologyMaskTexture')
    && material.includes('sampleHydrologyMask')
    && material.includes('applyHydrologyBiomeBlend');
  const hasRuntimeTexturePath = surfaceRuntime.includes('setHydrologyMaterialMask')
    && surfaceRuntime.includes('createHydrologyMaskTexture')
    && surfaceRuntime.includes('materializeHydrologyMasksFromArtifact');
  const hasBiomeSlotPath = biomeRuntime.includes('extraBiomeIds')
    && biomeRuntime.includes('buildTerrainBiomeMaterialConfig');
  if (!hasMaterialShaderPath) return 'missing';
  if (!hasRuntimeTexturePath || !hasBiomeSlotPath) return 'present_unwired';
  return largeMapHydrologyDefaultConfigStatus() === 'default_large_map_hydrology_enabled'
    ? 'default_mode_material_mask'
    : 'present_unwired';
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitOutput(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf-8' }).trim();
}

function gitState(): GitState {
  const head = gitOutput(['rev-parse', 'HEAD']);
  const statusLines = gitOutput(['status', '--short', '--branch']).split(/\r?\n/).filter(Boolean);
  let aheadOfOriginMaster: number | null = null;
  let behindOriginMaster: number | null = null;
  try {
    const [behindText, aheadText] = gitOutput(['rev-list', '--left-right', '--count', 'origin/master...HEAD']).split(/\s+/);
    behindOriginMaster = Number.parseInt(behindText, 10);
    aheadOfOriginMaster = Number.parseInt(aheadText, 10);
  } catch {
    aheadOfOriginMaster = null;
    behindOriginMaster = null;
  }

  return {
    head,
    branchLine: statusLines[0] ?? '',
    shortStatus: statusLines.slice(1),
    aheadOfOriginMaster,
    behindOriginMaster,
    dirty: statusLines.slice(1).length > 0,
  };
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

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function validationCheck(summary: PerfCaptureSummary | null, id: string): { status?: string; value?: number | string | null } | null {
  return summary?.validation?.checks?.find((check) => check.id === id) ?? null;
}

function isPerfSummaryForMode(path: string, mode: string): boolean {
  if (!path.endsWith('summary.json')) return false;
  const summary = readJson<PerfCaptureSummary>(path);
  return summary?.scenario?.mode === mode && typeof summary.durationSeconds === 'number';
}

function target(report: Cycle3Report | null, id: string): Cycle3Target | null {
  return report?.targets?.find((entry) => entry.id === id) ?? null;
}

function targetStatus(report: Cycle3Report | null, id: string): string | null {
  return target(report, id)?.status ?? null;
}

function inputExists(path: string | null): boolean {
  return Boolean(path && existsSync(path));
}

function addItem(items: PromptChecklistItem[], item: PromptChecklistItem): void {
  items.push(item);
}

function statusBlocksCompletion(status: RequirementStatus): boolean {
  return status !== 'pass';
}

function writeMarkdown(report: CompletionAuditReport, path: string): void {
  const lines = [
    '# Projekt Objekt-143 Completion Audit',
    '',
    `Generated: ${report.createdAt}`,
    `Source SHA: ${report.sourceGitSha}`,
    `Completion status: ${report.completionStatus.toUpperCase()}`,
    `Can mark goal complete: ${report.canMarkGoalComplete ? 'yes' : 'no'}`,
    '',
    '## Objective',
    '',
    report.objective,
    '',
    '## Concrete Success Criteria',
    '',
    ...report.concreteSuccessCriteria.map((criterion) => `- ${criterion}`),
    '',
    '## Git State',
    '',
    `- Branch/status: ${report.git.branchLine}`,
    `- Dirty: ${report.git.dirty}`,
    `- Ahead origin/master: ${report.git.aheadOfOriginMaster ?? 'unknown'}`,
    `- Behind origin/master: ${report.git.behindOriginMaster ?? 'unknown'}`,
    '',
    '## Checklist',
    '',
    '| Status | Requirement | Evidence | Missing / Weak |',
    '| --- | --- | --- | --- |',
    ...report.promptToArtifactChecklist.map((item) => {
      const evidence = item.namedEvidence.length > 0 ? item.namedEvidence.join('<br>') : 'none';
      const missing = item.missingOrWeak.length > 0 ? item.missingOrWeak.join('<br>') : 'none';
      return `| ${item.status} | ${item.requirement} | ${evidence} | ${missing} |`;
    }),
    '',
    '## Blockers',
    '',
    ...report.blockers.map((blocker) => `- ${blocker}`),
    '',
    '## Next Required Actions',
    '',
    ...report.nextRequiredActions.map((action) => `- ${action}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
  ];
  writeFileSync(path, lines.join('\n'), 'utf-8');
}

function buildReport(): CompletionAuditReport {
  const files = walkFiles(ARTIFACT_ROOT, () => true);
  const cycle3Path = latestFile(files, (path) => path.endsWith(join('projekt-143-cycle3-kickoff', 'cycle3-kickoff-summary.json')));
  const suitePath = latestFile(files, (path) => path.endsWith(join('projekt-143-evidence-suite', 'suite-summary.json')));
  const terrainInventoryPath = latestFile(files, (path) => path.endsWith(join('projekt-143-terrain-asset-inventory', 'terrain-asset-inventory.json')));
  const pixelForgeStructureReviewPath = latestFile(files, (path) => path.endsWith(join('projekt-143-pixel-forge-structure-review', 'structure-review.json')));
  const pixelForgePath = latestFile(files, (path) => path.endsWith(join('projekt-143-pixel-forge-bureau', 'pixel-forge-bureau.json')));
  const vegetationNormalProofPath = latestFile(files, (path) => path.endsWith(join('projekt-143-vegetation-normal-proof', 'summary.json')));
  const loadBranchSelectorPath = latestFile(files, (path) => path.endsWith(join('projekt-143-load-branch-selector', 'load-branch-selector.json')));
  const pixelForgeVegetationReadinessPath = latestFile(files, (path) => path.endsWith(join('projekt-143-pixel-forge-vegetation-readiness', 'vegetation-readiness.json')));
  const vegetationCandidateProofPath = latestFile(files, (path) => path.endsWith(join('projekt-143-vegetation-candidate-proof', 'summary.json')));
  const vegetationCandidateImportPlanPath = latestFile(files, (path) => path.endsWith(join('projekt-143-vegetation-candidate-import-plan', 'import-plan.json')));
  const grenadePath = latestFile(files, (path) => path.includes('grenade-spike-') && path.endsWith('summary.json'));
  const optikDecisionPath = latestFile(files, (path) => path.endsWith(join('projekt-143-optik-decision-packet', 'decision-packet.json')));
  const optikHumanReviewPath = latestFile(files, (path) => path.endsWith(join('projekt-143-optik-human-review', 'review-summary.json')));
  const vegetationGroundingPath = latestFile(files, (path) => path.endsWith(join('vegetation-grounding-audit', 'summary.json')));
  const terrainBaselinePath = latestFile(files, (path) => path.endsWith(join('projekt-143-terrain-horizon-baseline', 'summary.json')));
  const terrainHydrologyPath = latestFile(files, (path) => path.endsWith(join('projekt-143-terrain-hydrology-audit', 'hydrology-audit.json')));
  const terrainRoutePath = latestFile(files, (path) => path.endsWith(join('projekt-143-terrain-route-audit', 'terrain-route-audit.json')));
  const terrainDistributionPath = latestFile(files, (path) => path.endsWith(join('projekt-143-terrain-distribution-audit', 'terrain-distribution-audit.json')));
  const waterSystemAuditPath = latestFile(files, (path) => path.endsWith(join('projekt-143-water-system-audit', 'water-system-audit.json')));
  const waterRuntimeProofPath = latestFile(files, (path) => path.endsWith(join('projekt-143-water-runtime-proof', 'water-runtime-proof.json')));
  const terrainVisualReviewPath = latestFile(files, (path) => path.endsWith(join('projekt-143-terrain-visual-review', 'visual-review.json')));
  const terrainPlacementPath = latestFile(files, (path) => path.endsWith(join('projekt-143-terrain-placement-audit', 'terrain-placement-audit.json')));
  const latestOpenFrontierPerfPath = latestFile(files, (path) => isPerfSummaryForMode(path, 'open_frontier'));
  const latestAShauPerfPath = latestFile(files, (path) => isPerfSummaryForMode(path, 'a_shau_valley'));
  const perfHeapDiagnosticPath = latestFile(files, (path) => path.endsWith(join('projekt-143-perf-heap-diagnostic', 'heap-diagnostic.json')));
  const webgpuStrategyPath = latestFile(files, (path) => path.endsWith(join('webgpu-strategy-audit', 'strategy-audit.json')));
  const platformCapabilityProbePath = latestFile(files, (path) => path.endsWith(join('projekt-143-platform-capability-probe', 'summary.json')));
  const activeDriverDiagnosticPath = latestFile(files, (path) => path.endsWith(join('projekt-143-active-driver-diagnostic', 'active-driver-diagnostic.json')));
  const liveReleaseProofPath = latestFile(files, (path) => path.endsWith(join('projekt-143-live-release-proof', 'release-proof.json')));
  const hydrologyBakeManifestPath = existsSync(HYDROLOGY_BAKE_MANIFEST_PATH) ? HYDROLOGY_BAKE_MANIFEST_PATH : null;
  const hydrologyBakeLoaderPath = existsSync(HYDROLOGY_BAKE_LOADER_PATH) ? HYDROLOGY_BAKE_LOADER_PATH : null;
  const hydrologyBiomeClassifierPath = existsSync(HYDROLOGY_BIOME_CLASSIFIER_PATH) ? HYDROLOGY_BIOME_CLASSIFIER_PATH : null;
  const hydrologyCorridorPath = existsSync(HYDROLOGY_CORRIDOR_PATH) ? HYDROLOGY_CORRIDOR_PATH : null;
  const aShauConfigPath = existsSync(A_SHAU_CONFIG_PATH) ? A_SHAU_CONFIG_PATH : null;
  const openFrontierConfigPath = existsSync(OPEN_FRONTIER_CONFIG_PATH) ? OPEN_FRONTIER_CONFIG_PATH : null;
  const cullingBaselinePath = latestFile(files, (path) => path.endsWith(join('projekt-143-culling-owner-baseline', 'summary.json')));

  const cycle3 = readJson<Cycle3Report>(cycle3Path);
  const suite = readJson<EvidenceSuiteReport>(suitePath);
  const terrainInventory = readJson<TerrainAssetInventory>(terrainInventoryPath);
  const pixelForgeStructureReview = readJson<PixelForgeStructureReview>(pixelForgeStructureReviewPath);
  const pixelForge = readJson<PixelForgeBureauReport>(pixelForgePath);
  const pixelForgeVegetationReadiness = readJson<PixelForgeVegetationReadinessReport>(pixelForgeVegetationReadinessPath);
  const vegetationCandidateProof = readJson<VegetationCandidateProof>(vegetationCandidateProofPath);
  const vegetationCandidateImportPlan = readJson<VegetationCandidateImportPlan>(vegetationCandidateImportPlanPath);
  const vegetationNormalProof = readJson<VegetationNormalProof>(vegetationNormalProofPath);
  const grenade = readJson<GrenadeSummary>(grenadePath);
  const terrainHydrology = readJson<TerrainHydrologyAudit>(terrainHydrologyPath);
  const terrainRoute = readJson<TerrainRouteAudit>(terrainRoutePath);
  const terrainDistribution = readJson<TerrainDistributionAudit>(terrainDistributionPath);
  const waterSystemAudit = readJson<WaterSystemAudit>(waterSystemAuditPath);
  const waterRuntimeProof = readJson<WaterRuntimeProof>(waterRuntimeProofPath);
  const terrainVisualReview = readJson<TerrainVisualReview>(terrainVisualReviewPath);
  const terrainPlacement = readJson<TerrainPlacementAudit>(terrainPlacementPath);
  const latestOpenFrontierPerf = readJson<PerfCaptureSummary>(latestOpenFrontierPerfPath);
  const latestAShauPerf = readJson<PerfCaptureSummary>(latestAShauPerfPath);
  const perfHeapDiagnostic = readJson<PerfHeapDiagnostic>(perfHeapDiagnosticPath);
  const webgpuStrategy = readJson<WebgpuStrategyAudit>(webgpuStrategyPath);
  const platformCapabilityProbe = readJson<PlatformCapabilityProbe>(platformCapabilityProbePath);
  const activeDriverDiagnostic = readJson<ActiveDriverDiagnostic>(activeDriverDiagnosticPath);
  const liveReleaseProof = readJson<LiveReleaseProof>(liveReleaseProofPath);
  const closeModelCullingBeforeOpenFrontier = readJson<PerfCaptureSummary>(
    existsSync(CLOSE_MODEL_CULL_BEFORE_OPEN_FRONTIER_PATH) ? CLOSE_MODEL_CULL_BEFORE_OPEN_FRONTIER_PATH : null,
  );
  const closeModelCullingAfterOpenFrontier = readJson<PerfCaptureSummary>(
    existsSync(CLOSE_MODEL_CULL_AFTER_OPEN_FRONTIER_PATH) ? CLOSE_MODEL_CULL_AFTER_OPEN_FRONTIER_PATH : null,
  );
  const closeModelCullingAfterAShau = readJson<PerfCaptureSummary>(
    existsSync(CLOSE_MODEL_CULL_AFTER_A_SHAU_PATH) ? CLOSE_MODEL_CULL_AFTER_A_SHAU_PATH : null,
  );
  const hydrologyBakeManifest = readJson<HydrologyBakeManifest>(hydrologyBakeManifestPath);
  const projektLedgerText = existsSync(PROJEKT_LEDGER_PATH) ? readFileSync(PROJEKT_LEDGER_PATH, 'utf-8') : '';
  const projektHandoffText = existsSync(PROJEKT_HANDOFF_PATH) ? readFileSync(PROJEKT_HANDOFF_PATH, 'utf-8') : '';
  const roadmapText = existsSync(ROADMAP_PATH) ? readFileSync(ROADMAP_PATH, 'utf-8') : '';
  const backlogText = existsSync(BACKLOG_PATH) ? readFileSync(BACKLOG_PATH, 'utf-8') : '';
  const git = gitState();

  const inputs = {
    cycle3Kickoff: rel(cycle3Path),
    staticEvidenceSuite: rel(suitePath),
    terrainAssetInventory: rel(terrainInventoryPath),
    pixelForgeStructureReview: rel(pixelForgeStructureReviewPath),
    pixelForgeBureau: rel(pixelForgePath),
    vegetationNormalProof: rel(vegetationNormalProofPath),
    loadBranchSelector: rel(loadBranchSelectorPath),
    pixelForgeVegetationReadiness: rel(pixelForgeVegetationReadinessPath),
    vegetationCandidateProof: rel(vegetationCandidateProofPath),
    vegetationCandidateImportPlan: rel(vegetationCandidateImportPlanPath),
    grenadeSpike: rel(grenadePath),
    optikDecisionPacket: rel(optikDecisionPath),
    optikHumanReview: rel(optikHumanReviewPath),
    vegetationGrounding: rel(vegetationGroundingPath),
    terrainHorizonBaseline: rel(terrainBaselinePath),
    terrainHydrology: rel(terrainHydrologyPath),
    terrainRoute: rel(terrainRoutePath),
    terrainDistribution: rel(terrainDistributionPath),
    terrainWaterSystemAudit: rel(waterSystemAuditPath),
    terrainWaterRuntimeProof: rel(waterRuntimeProofPath),
    terrainVisualReview: rel(terrainVisualReviewPath),
    terrainPlacement: rel(terrainPlacementPath),
    latestOpenFrontierPerf: rel(latestOpenFrontierPerfPath),
    latestAShauPerf: rel(latestAShauPerfPath),
    perfHeapDiagnostic: rel(perfHeapDiagnosticPath),
    webgpuStrategy: rel(webgpuStrategyPath),
    platformCapabilityProbe: rel(platformCapabilityProbePath),
    activeDriverDiagnostic: rel(activeDriverDiagnosticPath),
    liveReleaseProof: rel(liveReleaseProofPath),
    closeModelCullingBeforeOpenFrontier: rel(existsSync(CLOSE_MODEL_CULL_BEFORE_OPEN_FRONTIER_PATH) ? CLOSE_MODEL_CULL_BEFORE_OPEN_FRONTIER_PATH : null),
    closeModelCullingAfterOpenFrontier: rel(existsSync(CLOSE_MODEL_CULL_AFTER_OPEN_FRONTIER_PATH) ? CLOSE_MODEL_CULL_AFTER_OPEN_FRONTIER_PATH : null),
    closeModelCullingAfterAShau: rel(existsSync(CLOSE_MODEL_CULL_AFTER_A_SHAU_PATH) ? CLOSE_MODEL_CULL_AFTER_A_SHAU_PATH : null),
    terrainHydrologyBakeManifest: rel(hydrologyBakeManifestPath),
    terrainHydrologyBakeLoader: rel(hydrologyBakeLoaderPath),
    terrainHydrologyBiomeClassifier: rel(hydrologyBiomeClassifierPath),
    terrainHydrologyCorridorSampler: rel(hydrologyCorridorPath),
    terrainHydrologyMaterialShader: existsSync(TERRAIN_MATERIAL_PATH) ? rel(TERRAIN_MATERIAL_PATH) : null,
    terrainHydrologySurfaceRuntime: existsSync(TERRAIN_SURFACE_RUNTIME_PATH) ? rel(TERRAIN_SURFACE_RUNTIME_PATH) : null,
    terrainHydrologyBiomeRuntimeConfig: existsSync(TERRAIN_BIOME_RUNTIME_CONFIG_PATH) ? rel(TERRAIN_BIOME_RUNTIME_CONFIG_PATH) : null,
    terrainHydrologyAShauConfig: rel(aShauConfigPath),
    terrainHydrologyOpenFrontierConfig: rel(openFrontierConfigPath),
    cullingOwnerBaseline: rel(cullingBaselinePath),
    projektLedger: existsSync(PROJEKT_LEDGER_PATH) ? rel(PROJEKT_LEDGER_PATH) : null,
    projektHandoff: existsSync(PROJEKT_HANDOFF_PATH) ? rel(PROJEKT_HANDOFF_PATH) : null,
    roadmap: existsSync(ROADMAP_PATH) ? rel(ROADMAP_PATH) : null,
    backlog: existsSync(BACKLOG_PATH) ? rel(BACKLOG_PATH) : null,
  };

  const items: PromptChecklistItem[] = [];
  const cycleStatuses = {
    optik: targetStatus(cycle3, 'npc-imposter-scale-luma-contract'),
    load: targetStatus(cycle3, 'pixel-forge-texture-upload-residency'),
    effects: targetStatus(cycle3, 'grenade-first-use-stall'),
    terrain: targetStatus(cycle3, 'large-mode-vegetation-horizon'),
    cull: targetStatus(cycle3, 'static-feature-and-vehicle-culling-hlod'),
  };
  const optikEvidence = target(cycle3, 'npc-imposter-scale-luma-contract')?.evidence ?? {};
  const optikHumanReviewStatus = optikEvidence.optikHumanReviewStatus as string | undefined;
  const optikHumanReviewComparisonBasis = optikEvidence.optikHumanReviewComparisonBasis as string | undefined;
  const optikReviewInvalid =
    optikHumanReviewStatus === 'invalid_runtime_comparison'
    || optikHumanReviewStatus === 'needs_runtime_equivalent_review'
    || optikHumanReviewComparisonBasis === 'separate_transparent_crops';
  const loadEvidence = target(cycle3, 'pixel-forge-texture-upload-residency')?.evidence ?? {};
  const cullEvidence = target(cycle3, 'static-feature-and-vehicle-culling-hlod')?.evidence ?? {};
  const closePoolResidency = (cullEvidence.closePoolResidency ?? loadEvidence.closePoolResidency ?? null) as
    | { status?: string; [key: string]: unknown }
    | null;
  const closePoolResidencyAccepted = closePoolResidency?.status === 'evidence_complete';
  const cullingSliceEvidence = (cullEvidence.cullingSliceEvidence ?? null) as
    | {
      staticFeatureAndVisibleHelicopterOwnerPath?: { status?: string };
      vehicleInteractionSafety?: { status?: string; sourcePaths?: string[]; testedContracts?: string[] };
      openItems?: string[];
    }
    | null;
  const staticOwnerPathAccepted = cullingSliceEvidence?.staticFeatureAndVisibleHelicopterOwnerPath?.status === 'evidence_complete';
  const vehicleInteractionSafetyAccepted = cullingSliceEvidence?.vehicleInteractionSafety?.status === 'evidence_complete';
  const terrainEvidence = target(cycle3, 'large-mode-vegetation-horizon')?.evidence ?? {};
  const largeMapHydrologyDefaultEnabled =
    largeMapHydrologyDefaultConfigStatus() === 'default_large_map_hydrology_enabled';
  const terrainVisualReviewShotCount = terrainVisualReview?.scenarios?.reduce(
    (total, scenario) => total + (scenario.shots?.length ?? 0),
    0,
  ) ?? null;
  const terrainVisualReviewHydrologyShotCount = terrainVisualReview?.scenarios?.reduce(
    (total, scenario) => total + (scenario.shots?.filter((shot) => shot.kind?.startsWith('river-')).length ?? 0),
    0,
  ) ?? null;
  const terrainVisualReviewModes = terrainVisualReview?.scenarios?.map((scenario) => ({
    mode: scenario.mode ?? null,
    status: scenario.status ?? null,
    shots: scenario.shots?.length ?? 0,
    browserErrors: scenario.browserErrors?.length ?? 0,
    pageErrors: scenario.pageErrors?.length ?? 0,
  })) ?? null;
  const terrainVisualReviewPass =
    terrainVisualReview?.status === 'pass'
    && (terrainVisualReviewShotCount ?? 0) >= 8
    && terrainVisualReview?.scenarios?.every((scenario) => scenario.status === 'pass') === true;
  const loadFindingsCaptured =
    Boolean(target(cycle3, 'pixel-forge-texture-upload-residency'))
    && Boolean(inputs.loadBranchSelector)
    && vegetationCandidateProof?.status === 'pass'
    && vegetationCandidateImportPlan?.status === 'pass';
  const terrainFindingsCaptured =
    Boolean(target(cycle3, 'large-mode-vegetation-horizon'))
    && Boolean(inputs.terrainAssetInventory)
    && Boolean(inputs.terrainHydrology)
    && Boolean(inputs.terrainWaterSystemAudit)
    && Boolean(inputs.terrainVisualReview)
    && Boolean(inputs.terrainPlacement);
  const cullFindingsCaptured =
    Boolean(target(cycle3, 'static-feature-and-vehicle-culling-hlod'))
    && (staticOwnerPathAccepted || closePoolResidencyAccepted || vehicleInteractionSafetyAccepted || Boolean(inputs.cullingOwnerBaseline));
  const stabilizationScopeCaptured =
    projektLedgerText.includes('Projekt Objekt-143 Stabilization Closeout')
    && projektHandoffText.includes('Stabilization Closeout Target')
    && roadmapText.includes('Projekt Objekt-143 follow-up is intentionally deferred')
    && backlogText.includes('Projekt Objekt-143 Stabilization Closeout');
  const terrainPlacementFlaggedFeatures = terrainPlacement?.modes?.flatMap((mode) =>
    (mode.features ?? [])
      .filter((feature) => (feature.flags?.length ?? 0) > 0)
      .map((feature) => ({
        mode: mode.id ?? null,
        seed: mode.sampledSeed ?? null,
        id: feature.id ?? null,
        kind: feature.kind ?? null,
        status: feature.status ?? null,
        flags: feature.flags ?? [],
        sourceSpanMeters: feature.sourceSpanMeters ?? null,
        stampedSpanMeters: feature.stampedSpanMeters ?? null,
        generatedPlacementMaxSourceSpanMeters: feature.generatedPlacements?.maxSourceSpanMeters ?? null,
        generatedPlacementMaxStampedSpanMeters: feature.generatedPlacements?.maxStampedSpanMeters ?? null,
        generatedPlacementNativeReliefWarnCount: feature.generatedPlacements?.nativeReliefWarnCount ?? null,
        worstNativeReliefPlacements: feature.generatedPlacements?.worstNativeReliefPlacements ?? null,
      })),
  ) ?? [];
  const terrainPlacementGeneratedReliefWarnings = terrainPlacementFlaggedFeatures
    .filter((feature) => feature.generatedPlacementNativeReliefWarnCount !== null && feature.generatedPlacementNativeReliefWarnCount > 0);
  const terrainRouteFlaggedModes = terrainRoute?.modes
    ?.filter((mode) => (mode.flags?.length ?? 0) > 0 || mode.status === 'warn' || mode.status === 'fail')
    .map((mode) => ({
      mode: mode.id ?? null,
      status: mode.status ?? null,
      flags: mode.flags ?? [],
      routeCount: mode.routeCount ?? null,
      routeLengthMeters: mode.routeLengthMeters ?? null,
      routeCapsuleStamps: mode.routeCapsuleStamps ?? null,
      routeSurfacePatches: mode.routeSurfacePatches ?? null,
    })) ?? [];
  const terrainDistributionFlaggedModes = terrainDistribution?.modes
    ?.filter((mode) => (mode.flags?.length ?? 0) > 0 || mode.status === 'warn' || mode.status === 'fail')
    .map((mode) => ({
      mode: mode.id ?? null,
      status: mode.status ?? null,
      flags: mode.flags ?? [],
      runtimeHydrologyBiomes: mode.runtimeHydrologyClassification?.biomeIds ?? [],
      topMaterials: mode.materialPrimaryDistribution?.slice(0, 4) ?? [],
      topFlatMaterials: mode.flatGroundMaterialDistribution?.slice(0, 4) ?? [],
      topVegetation: mode.vegetationRelativeDensity?.slice(0, 4) ?? [],
    })) ?? [];
  const terrainDistributionLargeMapFlags = terrainDistributionFlaggedModes
    .filter((mode) => mode.mode === 'open_frontier' || mode.mode === 'a_shau_valley');
  const terrainSliceEvidence = (terrainEvidence.terrainSliceEvidence ?? null) as
    | {
      farCanopyTint?: { status?: string };
      runtimeVegetationGrounding?: { status?: string };
      smallPalmAndGroundCoverDirection?: { status?: string };
      openItems?: string[];
    }
    | null;
  const playerBotTypesSource = existsSync(PLAYER_BOT_TYPES_PATH) ? readFileSync(PLAYER_BOT_TYPES_PATH, 'utf-8') : '';
  const playerBotControllerSource = existsSync(PLAYER_BOT_CONTROLLER_PATH) ? readFileSync(PLAYER_BOT_CONTROLLER_PATH, 'utf-8') : '';
  const perfActiveDriverSource = existsSync(PERF_ACTIVE_DRIVER_PATH) ? readFileSync(PERF_ACTIVE_DRIVER_PATH, 'utf-8') : '';
  const perfCaptureSource = existsSync(PERF_CAPTURE_PATH) ? readFileSync(PERF_CAPTURE_PATH, 'utf-8') : '';
  const combatantRendererSource = existsSync(COMBATANT_RENDERER_PATH) ? readFileSync(COMBATANT_RENDERER_PATH, 'utf-8') : '';
  const activeDriverMovementTargetContract =
    playerBotTypesSource.includes('movementTarget')
    && playerBotControllerSource.includes('movementTarget')
    && perfActiveDriverSource.includes('selectDriverViewTarget')
    && perfActiveDriverSource.includes('step.intent.movementTarget');
  const activeDriverCombatObjectiveContract =
    perfActiveDriverSource.includes('selectPatrolObjective')
    && perfActiveDriverSource.includes('getNearestOpforObjective')
    && perfActiveDriverSource.includes("kind: 'nearest_opfor'");
  const activeDriverObjectiveTelemetry =
    perfActiveDriverSource.includes('lastObjectiveKind')
    && perfActiveDriverSource.includes('nearestOpforDistance')
    && perfActiveDriverSource.includes('nearestPerceivedEnemyDistance')
    && perfActiveDriverSource.includes('lastPathQueryStatus')
    && perfCaptureSource.includes('objectiveKind')
    && perfCaptureSource.includes('nearestOpforDistance')
    && perfCaptureSource.includes('nearestPerceivedEnemyDistance')
    && perfCaptureSource.includes('pathQueryStatus');
  const activeDriverDiagnosticSummary = activeDriverDiagnostic?.summary;
  const activeDriverOpenFrontierTrustedProof =
    latestOpenFrontierPerf?.status === 'ok'
    && latestOpenFrontierPerf?.measurementTrust?.status === 'pass'
    && latestOpenFrontierPerf?.validation?.overall !== 'fail'
    && (validationCheck(latestOpenFrontierPerf, 'harness_min_shots_fired')?.status === 'pass')
    && (validationCheck(latestOpenFrontierPerf, 'harness_min_hits_recorded')?.status === 'pass')
    && (validationCheck(latestOpenFrontierPerf, 'harness_max_stuck_seconds')?.status === 'pass');
  const activeDriverAShauTrustedProof =
    latestAShauPerf?.status === 'ok'
    && latestAShauPerf?.measurementTrust?.status === 'pass'
    && latestAShauPerf?.validation?.overall !== 'fail'
    && (validationCheck(latestAShauPerf, 'harness_min_shots_fired')?.status === 'pass')
    && (validationCheck(latestAShauPerf, 'harness_min_hits_recorded')?.status === 'pass')
    && (validationCheck(latestAShauPerf, 'harness_max_stuck_seconds')?.status === 'pass');
  const activeDriverTrustedModePairProof =
    activeDriverOpenFrontierTrustedProof && activeDriverAShauTrustedProof;
  const activeDriverPacingOrTerrainFindings = activeDriverDiagnostic?.findings?.filter((finding) => (
    /heading|pacing|terrain|blocked|stuck/i.test(finding)
  )) ?? [];
  const activeDriverPacingSignatureClear =
    activeDriverPacingOrTerrainFindings.length === 0
    && (activeDriverDiagnosticSummary?.maxStuckSeconds ?? Number.POSITIVE_INFINITY) <= 1
    && (activeDriverDiagnosticSummary?.finalPlayerBlockedByTerrain ?? Number.POSITIVE_INFINITY) === 0
    && (activeDriverDiagnosticSummary?.finalCollisionHeightDeltaAtPlayer ?? Number.POSITIVE_INFINITY) === 0
    && activeDriverDiagnosticSummary?.finalPlayerMovementBlockReason === 'none';
  const activeDriverObjectiveFlowStillWarn =
    activeDriverDiagnostic?.status === 'warn'
    && activeDriverDiagnostic?.findings?.some((finding) => finding.includes('Objective distance closed')) === true;
  const activeDriverBrowserLivenessProof =
    activeDriverDiagnostic?.status === 'pass'
    && (activeDriverDiagnosticSummary?.runtimeSampleCount ?? 0) >= 6
    && (activeDriverDiagnosticSummary?.finalEngineShotsFired ?? 0) >= 30
    && (activeDriverDiagnosticSummary?.finalEngineShotsHit ?? 0) >= 2
    && (activeDriverDiagnosticSummary?.maxStuckSeconds ?? Number.POSITIVE_INFINITY) <= 8
    && (activeDriverDiagnosticSummary?.finalPlayerDistanceMoved ?? 0) > 25
    && (activeDriverDiagnosticSummary?.finalPlayerBlockedByTerrain ?? Number.POSITIVE_INFINITY) === 0
    && (activeDriverDiagnosticSummary?.finalCollisionHeightDeltaAtPlayer ?? Number.POSITIVE_INFINITY) === 0
    && activeDriverDiagnosticSummary?.finalPlayerMovementBlockReason === 'none';
  const hydrologyRiverMeshConsumerPresent =
    waterSystemAudit?.currentContract?.hydrologyRiverMeshConsumerPresent === true
    && waterSystemAudit?.currentContract?.hydrologyRiverMeshStartupWiringPresent === true;
  const hydrologyRiverRuntimeProofPass =
    waterRuntimeProof?.status === 'pass'
    && (waterRuntimeProof.results?.length ?? 0) > 0
    && waterRuntimeProof.results?.every(result =>
      result.errors?.length === 0
      && result.proof?.groupPresent === true
      && result.proof?.meshPresent === true
      && result.proof?.waterInfo?.hydrologyRiverVisible === true
      && (result.proof?.waterInfo?.hydrologySegmentCount ?? 0) > 0
    ) === true;
  const closeModelFrustumCullingContract =
    combatantRendererSource.includes('configureCloseModelFrustumCulling')
    && combatantRendererSource.includes('child.frustumCulled = true')
    && !combatantRendererSource.includes('child.frustumCulled = false');
  const closeModelFrustumCullingEvidenceComplete =
    closeModelFrustumCullingContract
    && closeModelCullingBeforeOpenFrontier?.measurementTrust?.status === 'pass'
    && closeModelCullingBeforeOpenFrontier?.validation?.overall === 'fail'
    && closeModelCullingAfterOpenFrontier?.measurementTrust?.status === 'pass'
    && closeModelCullingAfterOpenFrontier?.validation?.overall === 'warn'
    && closeModelCullingAfterAShau?.measurementTrust?.status === 'pass'
    && closeModelCullingAfterAShau?.validation?.overall === 'warn'
    && validationCheck(closeModelCullingAfterOpenFrontier, 'harness_min_shots_fired')?.status === 'pass'
    && validationCheck(closeModelCullingAfterOpenFrontier, 'harness_min_hits_recorded')?.status === 'pass'
    && validationCheck(closeModelCullingAfterAShau, 'harness_min_shots_fired')?.status === 'pass'
    && validationCheck(closeModelCullingAfterAShau, 'harness_min_hits_recorded')?.status === 'pass';

  addItem(items, {
    id: 'ledger-and-cycle-control',
    requirement: 'Projekt Objekt-143 has an authoritative current ledger and kickoff artifact that can drive completion decisions.',
    namedEvidence: [inputs.cycle3Kickoff, 'docs/PROJEKT_OBJEKT_143.md', 'docs/PROJEKT_OBJEKT_143_HANDOFF.md'].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      cycle3Status: cycle3?.status ?? null,
      cycle3CreatedAt: cycle3?.createdAt ?? null,
      targetStatuses: cycleStatuses,
      openDecisionCount: cycle3?.openDecisions?.length ?? null,
    },
    status: cycle3?.status === 'warn' ? 'partial' : cycle3?.status === 'pass' ? 'pass' : 'missing',
    coverage: 'The kickoff artifact summarizes current bureau readiness and open decisions.',
    missingOrWeak: cycle3?.status === 'warn' ? ['Kickoff is WARN, so it is explicitly not a completion certificate.'] : [],
    proxyWarning: 'A kickoff report is a routing artifact; completion still requires every bureau and release gate to be closed.',
  });

  addItem(items, {
    id: 'static-evidence-suite',
    requirement: 'The static Projekt Objekt-143 evidence suite is wired and green.',
    namedEvidence: [inputs.staticEvidenceSuite].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      suiteStatus: suite?.status ?? null,
      steps: suite?.steps?.map((step) => ({ id: step.id, ok: step.ok, artifactPath: step.artifactPath })) ?? null,
    },
    status: suite?.status === 'pass' ? 'pass' : 'missing',
    coverage: 'Static audits for texture, imposter optics, vegetation horizon, and WebGPU strategy are wired.',
    missingOrWeak: suite?.status === 'pass' ? [] : ['Static evidence suite is missing or not pass.'],
    proxyWarning: 'This suite explicitly does not run headed perf probes or prove runtime remediation completion.',
  });

  const webgpuMigrationBlockerMatches = webgpuStrategy?.activeRuntime?.migrationBlockers
    ?.reduce((sum, blocker) => sum + (blocker.matches?.length ?? 0), 0) ?? null;
  const platformBrowserRun = platformCapabilityProbe?.config?.runBrowser === true;

  addItem(items, {
    id: 'kb-strategie-platform-track',
    requirement: 'KB-STRATEGIE covers the WebGL/WebGPU/platform-utilization decision and near-metal browser capability path without approving an unsupported migration.',
    namedEvidence: [inputs.webgpuStrategy, inputs.platformCapabilityProbe, 'scripts/webgpu-strategy-audit.ts', 'scripts/projekt-143-platform-capability-probe.ts'].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      recommendation: webgpuStrategy?.recommendation?.decision ?? null,
      activeWebgpuSourceMatches: webgpuStrategy?.activeRuntime?.activeWebgpuSourceMatches?.length ?? null,
      webglRendererEntrypoints: webgpuStrategy?.activeRuntime?.webglRendererEntrypoints?.length ?? null,
      migrationBlockerMatches: webgpuMigrationBlockerMatches,
      nearMetalBrowserProbeStatus: webgpuStrategy?.nearMetalPlatformTrack?.browserProbeStatus ?? null,
      platformProbeStatus: platformCapabilityProbe?.status ?? null,
      platformProbeBrowserRun: platformBrowserRun,
      headerContractStatus: platformCapabilityProbe?.headerContract?.status ?? null,
      localCrossOriginIsolationConfigured: platformCapabilityProbe?.headerContract?.localHeadersFile?.crossOriginIsolationConfigured ?? null,
      localCoop: platformCapabilityProbe?.headerContract?.localHeadersFile?.coop ?? null,
      localCoep: platformCapabilityProbe?.headerContract?.localHeadersFile?.coep ?? null,
      liveHeadersChecked: platformCapabilityProbe?.headerContract?.live?.checked ?? null,
      liveUrl: platformCapabilityProbe?.headerContract?.live?.url ?? null,
      liveStatusCode: platformCapabilityProbe?.headerContract?.live?.statusCode ?? null,
      liveCoop: platformCapabilityProbe?.headerContract?.live?.coop ?? null,
      liveCoep: platformCapabilityProbe?.headerContract?.live?.coep ?? null,
      liveCrossOriginIsolationHeadersPresent: platformCapabilityProbe?.headerContract?.live?.crossOriginIsolationHeadersPresent ?? null,
      isolatedWebglRenderer: platformCapabilityProbe?.browser?.isolated?.webgl2?.renderer ?? null,
      isolatedWebglTimerQuery: platformCapabilityProbe?.browser?.isolated?.webgl2?.hasDisjointTimerQueryWebgl2 ?? null,
      isolatedWebgpuAdapter: platformCapabilityProbe?.browser?.isolated?.webgpu?.adapterAvailable ?? null,
      isolatedSharedArrayBuffer: platformCapabilityProbe?.browser?.isolated?.sharedArrayBuffer?.available ?? null,
      isolatedOffscreenWebgl2: platformCapabilityProbe?.browser?.isolated?.offscreenCanvas?.webgl2ContextAvailable ?? null,
    },
    status: webgpuStrategy?.recommendation?.decision === 'reinforce-webgl'
      && (webgpuStrategy?.activeRuntime?.activeWebgpuSourceMatches?.length ?? 1) === 0
      && platformCapabilityProbe?.status
        ? (platformBrowserRun ? 'pass' : 'partial')
        : 'missing',
    coverage: platformBrowserRun
      ? 'The static strategy audit reinforces WebGL and the guarded platform probe records browser-backed capability inventory.'
      : 'The static strategy audit reinforces WebGL and the guarded platform probe exists.',
    missingOrWeak: [
      platformBrowserRun ? '' : 'Browser-backed platform capability values are deferred until the machine is quiet.',
      platformCapabilityProbe?.headerContract?.live?.checked ? '' : 'Live Pages cross-origin isolation headers have not been checked by the repeatable probe.',
      platformCapabilityProbe?.headerContract?.live?.checked && platformCapabilityProbe?.headerContract?.live?.crossOriginIsolationHeadersPresent !== true
        ? 'Live Pages does not currently show the COOP/COEP headers needed for cross-origin isolation planning.'
        : '',
      platformCapabilityProbe?.status ? '' : 'Platform capability probe artifact is missing.',
      webgpuStrategy?.recommendation?.decision === 'reinforce-webgl' ? '' : 'Latest strategy audit does not recommend reinforce-webgl.',
    ].filter(Boolean),
    proxyWarning: platformBrowserRun
      ? 'A static strategy audit and guarded browser capability probe do not prove WebGPU, worker rendering, WASM threads, or production runtime support.'
      : 'A static strategy audit and deferred platform probe do not prove WebGPU, worker rendering, WASM threads, or production Pages support.',
  });

  addItem(items, {
    id: 'kb-optik-closeout',
    requirement: 'KB-OPTIK closes NPC imposter scale, luma, crop, and human-visible parity decisions.',
    namedEvidence: [inputs.cycle3Kickoff, inputs.optikDecisionPacket, inputs.optikHumanReview].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      status: cycleStatuses.optik,
      summary: target(cycle3, 'npc-imposter-scale-luma-contract')?.summary ?? null,
      humanReviewStatus: optikHumanReviewStatus ?? null,
      humanReviewComparisonBasis: optikHumanReviewComparisonBasis ?? null,
      humanReviewHtml: optikEvidence.optikHumanReviewHtml ?? null,
      openDecisions: cycle3?.openDecisions ?? null,
    },
    status: cycleStatuses.optik === 'evidence_complete' ? 'pass' : cycleStatuses.optik === 'needs_decision' ? 'blocked' : 'partial',
    coverage: 'Matched scale/luma and runtime LOD-edge proof exist, but the current target status is still the controlling evidence.',
    missingOrWeak: optikReviewInvalid
      ? ['Current human-review packet was rejected as non-equivalent: T-pose/weaponless close GLB crop versus atlas impostor pose with weapon. Regenerate runtime-equivalent same-scene evidence before acceptance.']
      : cycleStatuses.optik === 'needs_decision'
      ? ['8.5m near-stress silhouette exception or human visual review remains undecided.']
      : [],
    proxyWarning: optikReviewInvalid
      ? 'Human review only counts when comparisonBasis is runtime_equivalent_same_scene or owner_explicit_exception.'
      : cycleStatuses.optik === 'evidence_complete'
      ? 'The owner-accepted exception is tied to the current 2.95m target, crop maps, luma proof, and runtime-equivalent review packet; future atlas, target-height, pose, or brightness changes need fresh proof.'
      : 'Runtime LOD-edge PASS is not the same as final visual acceptance while the near-stress decision remains open.',
  });

  addItem(items, {
    id: 'kb-load-closeout',
    requirement: 'KB-LOAD findings are captured for stabilization, with candidate asset work deferred to the roadmap instead of required for this closeout.',
    namedEvidence: [inputs.cycle3Kickoff, inputs.vegetationNormalProof, inputs.loadBranchSelector, inputs.pixelForgeVegetationReadiness, inputs.vegetationCandidateProof, inputs.vegetationCandidateImportPlan].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      status: cycleStatuses.load,
      selectedLoadBranch: target(cycle3, 'pixel-forge-texture-upload-residency')?.evidence?.selectedLoadBranch ?? null,
      loadBranchSelectorStatus: target(cycle3, 'pixel-forge-texture-upload-residency')?.evidence?.loadBranchSelectorStatus ?? null,
      selectedLoadBranchSummary: target(cycle3, 'pixel-forge-texture-upload-residency')?.evidence?.selectedLoadBranchSummary ?? null,
      pixelForgeVegetationReadinessStatus: target(cycle3, 'pixel-forge-texture-upload-residency')?.evidence?.pixelForgeVegetationReadinessStatus ?? pixelForgeVegetationReadiness?.status ?? null,
      pixelForgeVegetationBranchExecutionState: target(cycle3, 'pixel-forge-texture-upload-residency')?.evidence?.pixelForgeVegetationBranchExecutionState ?? pixelForgeVegetationReadiness?.branchExecutionState ?? null,
      pixelForgeVegetationSelectedSpecies: target(cycle3, 'pixel-forge-texture-upload-residency')?.evidence?.pixelForgeVegetationSelectedSpecies ?? pixelForgeVegetationReadiness?.summary?.selectedSpecies ?? null,
      pixelForgeVegetationTargetAtlasSize: target(cycle3, 'pixel-forge-texture-upload-residency')?.evidence?.pixelForgeVegetationTargetAtlasSize ?? pixelForgeVegetationReadiness?.summary?.targetAtlasSize ?? null,
      pixelForgeVegetationTargetTileSize: target(cycle3, 'pixel-forge-texture-upload-residency')?.evidence?.pixelForgeVegetationTargetTileSize ?? pixelForgeVegetationReadiness?.summary?.targetTileSize ?? null,
      pixelForgeVegetationNormalPairsRetained: target(cycle3, 'pixel-forge-texture-upload-residency')?.evidence?.pixelForgeVegetationNormalPairsRetained ?? pixelForgeVegetationReadiness?.summary?.normalPairsRetained ?? null,
      pixelForgeVegetationCandidateProfileSupported: target(cycle3, 'pixel-forge-texture-upload-residency')?.evidence?.pixelForgeVegetationCandidateProfileSupported ?? pixelForgeVegetationReadiness?.summary?.candidateOutputProfileSupported ?? null,
      pixelForgeVegetationCandidateTileOverrideDetected: target(cycle3, 'pixel-forge-texture-upload-residency')?.evidence?.pixelForgeVegetationCandidateTileOverrideDetected ?? pixelForgeVegetationReadiness?.commandSurface?.candidateTileOverrideDetected ?? null,
      vegetationCandidateProofStatus: vegetationCandidateProof?.status ?? null,
      vegetationCandidateProofContactSheet: vegetationCandidateProof?.files?.contactSheet ?? null,
      vegetationCandidateProofSelectedVariants: vegetationCandidateProof?.target?.selectedVariants ?? null,
      vegetationCandidateProofCompletePairs: vegetationCandidateProof?.aggregate?.completePairs ?? null,
      vegetationCandidateProofExpectedPairs: vegetationCandidateProof?.aggregate?.expectedPairs ?? null,
      vegetationCandidateProofMissingPairs: vegetationCandidateProof?.aggregate?.missingCandidatePairs ?? null,
      vegetationCandidateImportPlanStatus: vegetationCandidateImportPlan?.status ?? null,
      vegetationCandidateImportPlanState: vegetationCandidateImportPlan?.importState ?? null,
      vegetationCandidateImportPlanDryRun: vegetationCandidateImportPlan?.dryRun ?? null,
      vegetationCandidateImportPlanOwnerAccepted: vegetationCandidateImportPlan?.ownerAccepted ?? null,
      vegetationCandidateImportPlanReadyItems: vegetationCandidateImportPlan?.summary?.readyItems ?? null,
      vegetationCandidateImportPlanExpectedItems: vegetationCandidateImportPlan?.summary?.expectedItems ?? null,
      vegetationCandidateImportPlanAppliedItems: vegetationCandidateImportPlan?.summary?.appliedItems ?? null,
      vegetationCandidateImportPlanRuntimeDestinations: vegetationCandidateImportPlan?.summary?.runtimeDestinations ?? null,
      vegetationNormalProofStatus: vegetationNormalProof?.status ?? null,
      expectedPairs: vegetationNormalProof?.aggregate?.expectedPairs ?? null,
      capturedPairs: vegetationNormalProof?.aggregate?.capturedPairs ?? null,
      contactSheet: vegetationNormalProof?.files?.contactSheet ?? null,
      vegetationNormalMapRemovalPolicy: vegetationNormalProof?.status === 'warn'
        ? 'rejected_for_default_policy_visual_warn'
        : vegetationNormalProof?.status === 'pass'
          ? 'candidate_needs_owner_review_before_default_policy'
          : 'not_evaluated',
      vegetationNormalMapDefaultPolicy: 'unchanged',
      closePoolResidencyStatus: closePoolResidency?.status ?? null,
      closePoolResidency,
    },
    status: cycleStatuses.load === 'evidence_complete' || loadFindingsCaptured ? 'pass' : 'partial',
    coverage: closePoolResidencyAccepted
      ? 'Startup/upload baselines, a no-normal visual proof path, selected next texture branch, scoped close-GLB pool residency evidence, and proof-only vegetation-candidate startup tables are captured.'
      : 'Startup/upload baselines, selected next texture branch, no-normal visual proof, and proof-only vegetation-candidate startup tables are captured.',
    missingOrWeak: loadFindingsCaptured ? [
      'Candidate vegetation import, owner visual acceptance, and production use are deferred roadmap items under the revised stabilization objective.',
    ] : [
      'KB-LOAD findings are not yet fully captured for the stabilization handoff.',
      pixelForgeVegetationReadiness?.branchExecutionState === 'needs_pixel_forge_profile_patch'
        ? 'Selected KB-LOAD branch first needs a Pixel Forge 256px-tile review-only vegetation candidate profile before generated assets, visual proof, or quiet-machine startup tables can be accepted.'
        : pixelForgeVegetationReadiness?.branchExecutionState === 'ready_for_candidate_generation'
          ? vegetationCandidateProof?.status === 'pass'
            ? vegetationCandidateImportPlan?.status === 'pass' && vegetationCandidateImportPlan?.importState === 'dry_run_ready'
              ? 'Selected KB-LOAD branch has generated candidate-atlas static proof and a dry-run import plan; it still needs owner visual acceptance, actual import, and quiet-machine before/after startup tables.'
              : 'Selected KB-LOAD branch has generated candidate-atlas static proof; it still needs owner visual acceptance, a dry-run import plan, import, and quiet-machine before/after startup tables.'
            : 'Selected KB-LOAD branch has the Pixel Forge review-only candidate profile; it still needs candidate generation, selected-species validation, paired visual proof, and quiet-machine before/after startup tables.'
        : 'Selected KB-LOAD branch still needs generated assets, paired visual proof, and quiet-machine before/after startup tables.',
      'Vegetation normal-map removal is not accepted for default policy; latest A/B proof remains WARN and default normal maps stay unchanged.',
      'Long startup latency remains attributed but not closed.',
    ],
    proxyWarning: 'Improved candidate timings and dry-run-ready import plans are roadmap signal only; the current runtime asset policy remains unchanged until owner acceptance and import validation.',
  });

  addItem(items, {
    id: 'kb-effects-closeout',
    requirement: 'KB-EFFECTS closes grenade first-use stall for the scoped runtime path.',
    namedEvidence: [inputs.grenadeSpike].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      status: cycleStatuses.effects,
      grenadeStatus: grenade?.status ?? null,
      measurementTrust: grenade?.measurementTrust?.status ?? null,
    },
    status: cycleStatuses.effects === 'evidence_complete' && grenade?.measurementTrust?.status === 'pass' ? 'pass' : 'partial',
    coverage: 'Low-load grenade first-use path has trusted evidence.',
    missingOrWeak: cycleStatuses.effects === 'evidence_complete'
      ? []
      : ['Grenade target is not evidence_complete in the latest kickoff.'],
    proxyWarning: 'This does not certify grenade behavior under broad combat120 stress or future visual effect changes.',
  });

  addItem(items, {
    id: 'kb-terrain-closeout',
    requirement: 'KB-TERRAIN current findings are captured for stabilization, with water naturalism, A Shau route quality, ground cover, and placement polish deferred to the roadmap.',
    namedEvidence: [
      inputs.cycle3Kickoff,
      inputs.terrainHorizonBaseline,
      inputs.terrainAssetInventory,
      inputs.terrainHydrology,
      inputs.terrainRoute,
      inputs.terrainDistribution,
      inputs.terrainWaterSystemAudit,
      inputs.terrainWaterRuntimeProof,
      inputs.terrainVisualReview,
      inputs.terrainPlacement,
      inputs.pixelForgeStructureReview,
      inputs.latestOpenFrontierPerf,
      inputs.latestAShauPerf,
      inputs.perfHeapDiagnostic,
      inputs.terrainHydrologyBakeManifest,
      inputs.terrainHydrologyBakeLoader,
      inputs.terrainHydrologyAShauConfig,
      inputs.terrainHydrologyOpenFrontierConfig,
      inputs.activeDriverDiagnostic,
    ].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      status: cycleStatuses.terrain,
      terrainInventoryStatus: terrainInventory?.status ?? null,
      inventorySummary: terrainInventory?.summary ?? null,
      pixelForgeStructureReviewPath: inputs.pixelForgeStructureReview ?? null,
      pixelForgeStructureReviewStatus: pixelForgeStructureReview?.status ?? null,
      pixelForgeStructureReviewSummary: pixelForgeStructureReview?.summary ?? null,
      pixelForgeStructureReviewContactSheet: pixelForgeStructureReview?.files?.contactSheet ?? null,
      pixelForgeStructureReviewFindings: pixelForgeStructureReview?.findings ?? null,
      terrainHydrologyAuditPath: inputs.terrainHydrology ?? terrainEvidence.terrainHydrologyAuditPath ?? null,
      terrainHydrologyStatus: terrainHydrology?.status ?? terrainEvidence.terrainHydrologyStatus ?? null,
      terrainHydrologySummary: terrainHydrology?.summary ?? terrainEvidence.terrainHydrologySummary ?? null,
      terrainHydrologyAShauSummary: terrainHydrology?.scenarios?.aShau?.summary ?? terrainEvidence.terrainHydrologyAShauSummary ?? null,
      terrainHydrologyOpenFrontierSummary: terrainHydrology?.scenarios?.openFrontier?.summary ?? terrainEvidence.terrainHydrologyOpenFrontierSummary ?? null,
      terrainHydrologyFlags: terrainHydrology?.flags ?? terrainEvidence.terrainHydrologyFlags ?? null,
      terrainHydrologyOpenFrontierFlags: terrainHydrology?.scenarios?.openFrontier?.flags ?? terrainEvidence.terrainHydrologyOpenFrontierFlags ?? null,
      terrainRouteAuditPath: inputs.terrainRoute ?? null,
      terrainRouteStatus: terrainRoute?.status ?? null,
      terrainRouteSummary: terrainRoute?.summary ?? null,
      terrainRouteFlaggedModes,
      terrainRouteAShau: terrainRoute?.modes?.find((mode) => mode.id === 'a_shau_valley') ?? null,
      terrainRouteOpenFrontier: terrainRoute?.modes?.find((mode) => mode.id === 'open_frontier') ?? null,
      terrainDistributionAuditPath: inputs.terrainDistribution ?? null,
      terrainDistributionStatus: terrainDistribution?.status ?? null,
      terrainDistributionSummary: terrainDistribution?.summary ?? null,
      terrainDistributionFlaggedModes,
      terrainDistributionLargeMapFlags,
      terrainDistributionAShau: terrainDistribution?.modes?.find((mode) => mode.id === 'a_shau_valley') ?? null,
      terrainDistributionOpenFrontier: terrainDistribution?.modes?.find((mode) => mode.id === 'open_frontier') ?? null,
      terrainWaterSystemAuditPath: inputs.terrainWaterSystemAudit ?? terrainEvidence.terrainWaterSystemAuditPath ?? null,
      terrainWaterSystemStatus: waterSystemAudit?.status ?? terrainEvidence.terrainWaterSystemStatus ?? null,
      terrainWaterSystemContract: waterSystemAudit?.currentContract ?? terrainEvidence.terrainWaterSystemContract ?? null,
      terrainWaterSystemFindings: waterSystemAudit?.findings ?? terrainEvidence.terrainWaterSystemFindings ?? null,
      terrainWaterRuntimeProofPath: inputs.terrainWaterRuntimeProof ?? null,
      terrainWaterRuntimeProofStatus: waterRuntimeProof?.status ?? null,
      terrainWaterRuntimeProofResults: waterRuntimeProof?.results?.map(result => ({
        mode: result.mode ?? null,
        screenshot: result.screenshot ?? null,
        errors: result.errors?.length ?? null,
        globalWaterEnabled: result.proof?.waterInfo?.enabled ?? null,
        globalWaterVisible: result.proof?.waterInfo?.waterVisible ?? null,
        hydrologyRiverVisible: result.proof?.waterInfo?.hydrologyRiverVisible ?? null,
        hydrologyChannelCount: result.proof?.waterInfo?.hydrologyChannelCount ?? null,
        hydrologySegmentCount: result.proof?.waterInfo?.hydrologySegmentCount ?? null,
      })) ?? null,
      terrainVisualReviewPath: inputs.terrainVisualReview ?? null,
      terrainVisualReviewStatus: terrainVisualReview?.status ?? null,
      terrainVisualReviewMarkdown: terrainVisualReview?.files?.markdown ?? null,
      terrainVisualReviewContactSheet: terrainVisualReview?.files?.contactSheet ?? null,
      terrainVisualReviewChecks: terrainVisualReview?.checks?.map((check) => ({
        id: check.id ?? null,
        status: check.status ?? null,
        value: check.value ?? null,
      })) ?? null,
      terrainVisualReviewModes,
      terrainVisualReviewShotCount,
      terrainVisualReviewHydrologyShotCount,
      terrainVisualReviewNonClaims: terrainVisualReview?.nonClaims ?? null,
      terrainPlacementAuditPath: inputs.terrainPlacement ?? null,
      terrainPlacementStatus: terrainPlacement?.status ?? null,
      terrainPlacementSummary: terrainPlacement?.summary ?? null,
      terrainPlacementFoundationNativeReliefWarnMeters: terrainPlacement?.assumptions?.foundationNativeReliefWarnMeters ?? null,
      terrainPlacementFlaggedFeatures,
      terrainPlacementGeneratedReliefWarnings,
      latestOpenFrontierPerfPath: inputs.latestOpenFrontierPerf ?? null,
      latestOpenFrontierPerfStatus: latestOpenFrontierPerf?.status ?? null,
      latestOpenFrontierPerfValidation: latestOpenFrontierPerf?.validation?.overall ?? null,
      latestOpenFrontierPerfTrust: latestOpenFrontierPerf?.measurementTrust?.status ?? null,
      latestOpenFrontierPerfPeakP99Ms: validationCheck(latestOpenFrontierPerf, 'peak_p99_frame_ms')?.value ?? null,
      latestOpenFrontierPerfHeapPeakGrowthMb: validationCheck(latestOpenFrontierPerf, 'heap_peak_growth_mb')?.value ?? null,
      latestOpenFrontierPerfShots: validationCheck(latestOpenFrontierPerf, 'harness_min_shots_fired')?.value ?? null,
      latestOpenFrontierPerfHits: validationCheck(latestOpenFrontierPerf, 'harness_min_hits_recorded')?.value ?? null,
      latestAShauPerfPath: inputs.latestAShauPerf ?? null,
      latestAShauPerfStatus: latestAShauPerf?.status ?? null,
      latestAShauPerfValidation: latestAShauPerf?.validation?.overall ?? null,
      latestAShauPerfTrust: latestAShauPerf?.measurementTrust?.status ?? null,
      perfHeapDiagnosticPath: inputs.perfHeapDiagnostic ?? null,
      perfHeapDiagnosticStatus: perfHeapDiagnostic?.status ?? null,
      perfHeapDiagnosticSource: perfHeapDiagnostic?.inputs?.summary ?? null,
      perfHeapDiagnosticClassification: perfHeapDiagnostic?.classification ?? null,
      perfHeapDiagnosticHeap: perfHeapDiagnostic?.heap ?? null,
      perfHeapDiagnosticValidationHighlights: perfHeapDiagnostic?.validationHighlights ?? null,
      perfHeapDiagnosticStreamSignalsNearPeak: perfHeapDiagnostic?.streamSignalsNearPeak ?? null,
      terrainHydrologyBakeManifestPath: terrainEvidence.terrainHydrologyBakeManifestPath ?? inputs.terrainHydrologyBakeManifest ?? null,
      terrainHydrologyBakeManifestStatus: terrainEvidence.terrainHydrologyBakeManifestStatus ?? (hydrologyBakeManifest?.schemaVersion === 1 ? 'present' : 'missing_or_stale'),
      terrainHydrologyBakeLoaderPath: terrainEvidence.terrainHydrologyBakeLoaderPath ?? inputs.terrainHydrologyBakeLoader ?? null,
      terrainHydrologyBakeLoaderStatus: hydrologyBakeLoaderStatus(hydrologyBakeLoaderPath),
      terrainHydrologyDefaultConfigStatus: terrainEvidence.terrainHydrologyDefaultConfigStatus ?? largeMapHydrologyDefaultConfigStatus(),
      terrainHydrologyAShauConfigPath: inputs.terrainHydrologyAShauConfig ?? null,
      terrainHydrologyOpenFrontierConfigPath: inputs.terrainHydrologyOpenFrontierConfig ?? null,
      terrainHydrologyRuntimePreloadPath: terrainEvidence.terrainHydrologyRuntimePreloadPath
        ?? (existsSync(HYDROLOGY_RUNTIME_PRELOAD_PATH) ? rel(HYDROLOGY_RUNTIME_PRELOAD_PATH) : null),
      terrainHydrologyBiomeClassifierPath: terrainEvidence.terrainHydrologyBiomeClassifierPath ?? inputs.terrainHydrologyBiomeClassifier ?? null,
      terrainHydrologyBiomeClassifierStatus: hydrologyBiomeClassifierStatus(hydrologyBiomeClassifierPath),
      terrainHydrologyCorridorSamplerPath: terrainEvidence.terrainHydrologyCorridorSamplerPath ?? inputs.terrainHydrologyCorridorSampler ?? null,
      terrainHydrologyCorridorSamplerStatus: terrainEvidence.terrainHydrologyCorridorSamplerStatus ?? hydrologyCorridorStatus(hydrologyCorridorPath),
      terrainHydrologyMaterialShaderPath: inputs.terrainHydrologyMaterialShader ?? null,
      terrainHydrologySurfaceRuntimePath: inputs.terrainHydrologySurfaceRuntime ?? null,
      terrainHydrologyBiomeRuntimeConfigPath: inputs.terrainHydrologyBiomeRuntimeConfig ?? null,
      terrainHydrologyMaterialMaskStatus: hydrologyMaterialMaskStatus(),
      terrainHydrologyBakeEntries: terrainEvidence.terrainHydrologyBakeEntries ?? hydrologyBakeManifest?.entries ?? null,
      farCanopyTintStatus: terrainSliceEvidence?.farCanopyTint?.status ?? null,
      runtimeVegetationGroundingStatus: terrainSliceEvidence?.runtimeVegetationGrounding?.status ?? null,
      smallPalmAndGroundCoverDirectionStatus: terrainSliceEvidence?.smallPalmAndGroundCoverDirection?.status ?? null,
      terrainSliceOpenItems: terrainSliceEvidence?.openItems ?? null,
      activeDriverMovementTargetContract,
      activeDriverCombatObjectiveContract,
      activeDriverObjectiveTelemetry,
      activeDriverBrowserLivenessProof,
      activeDriverDiagnosticStatus: activeDriverDiagnostic?.status ?? null,
      activeDriverDiagnosticSummary: activeDriverDiagnosticSummary ?? null,
      activeDriverDiagnosticFindings: activeDriverDiagnostic?.findings ?? null,
      activeDriverPacingOrTerrainFindings,
      activeDriverOpenFrontierTrustedProof,
      activeDriverAShauTrustedProof,
      activeDriverTrustedModePairProof,
      activeDriverPacingSignatureClear,
      activeDriverObjectiveFlowStillWarn,
    },
    status: cycleStatuses.terrain === 'evidence_complete' || terrainFindingsCaptured ? 'pass' : 'partial',
    coverage: terrainSliceEvidence?.farCanopyTint?.status === 'evidence_complete'
      ? 'Baseline, route, placement, distribution, asset-inventory, far-canopy, short-palm, and vegetation-grounding evidence exist.'
      : 'Baseline, route, placement, distribution, and asset-inventory evidence exist.',
    missingOrWeak: [
      terrainFindingsCaptured
        ? 'Terrain/water/foundation/route findings are captured as roadmap signal under the revised stabilization objective; final terrain art acceptance is intentionally deferred.'
        : 'KB-TERRAIN findings are not yet fully captured for the stabilization handoff.',
      activeDriverBrowserLivenessProof
        ? 'A Shau active-player route/combat liveness now has trusted browser proof, but NPC terrain-stall/backtracking notes and terrain visual/water acceptance keep A Shau unsigned.'
        : 'A Shau remains unsigned due to terrain-stall/backtracking notes.',
      terrainSliceEvidence?.farCanopyTint?.status === 'evidence_complete'
        ? 'Far-canopy tint is a scoped accepted slice only; final far-horizon art direction still needs human visual acceptance.'
        : 'Far-horizon canopy/outer vegetation acceptance is not closed.',
      (terrainHydrology?.status ?? terrainEvidence.terrainHydrologyStatus) === 'warn'
        ? largeMapHydrologyDefaultEnabled
          ? hydrologyMaterialMaskStatus() === 'default_mode_material_mask'
            ? hydrologyRiverMeshConsumerPresent
              ? hydrologyRiverRuntimeProofPass
                ? 'Baked hydrology masks now drive default large-map vegetation classification, terrain material masks, and provisional river-strip water surfaces with headed runtime presence proof, but final ecology acceptance still needs visual/perf acceptance.'
                : 'Baked hydrology masks now drive default large-map vegetation classification, terrain material masks, and provisional river-strip water surfaces, but final ecology acceptance still needs visual and perf proof.'
              : 'Baked hydrology masks now drive default large-map vegetation classification and terrain material masks, but water rendering/river meshes and final ecology acceptance still need visual and perf proof.'
            : 'Baked hydrology masks are now configured for default large-map vegetation classification, but material/water rendering and final ecology acceptance still need visual and perf proof.'
          : 'Hydrology audit shows the current A Shau riverbank/swamp proxy is too elevation-driven and should become a baked DEM/procedural wetness mask before final ecology acceptance.'
        : 'Hydrology model still needs explicit acceptance for A Shau and reusable procedural maps.',
      (waterSystemAudit?.status ?? terrainEvidence.terrainWaterSystemStatus) === 'warn'
        ? hydrologyRiverMeshConsumerPresent
          ? hydrologyRiverRuntimeProofPass
            ? 'Water-system audit now sees a provisional hydrology river-strip consumer beside the global plane fallback, and the headed runtime proof confirms the meshes are present; runtime streams are still not accepted until art tuning, browser visual review, and perf proof exist.'
            : 'Water-system audit now sees a provisional hydrology river-strip consumer beside the global plane fallback, but runtime streams are not accepted until matched browser visual/perf proof exists.'
          : 'Water-system audit shows the current runtime water is a global plane/fallback, not an accepted river system.'
        : 'Water/hydrology rendering still needs explicit audit evidence before acceptance.',
      terrainVisualReviewPass
        ? 'Terrain visual-review packet now captures Open Frontier and A Shau ground, route, and hydrology shots without browser errors, but it still needs human acceptance and matched perf before KB-TERRAIN can close.'
        : 'Terrain visual-review packet is missing or not pass; capture Open Frontier and A Shau ground, route, and hydrology screenshots before art acceptance.',
      terrainRoute?.status === 'pass'
        ? ''
        : 'Terrain route audit is missing, WARN, or FAIL; route/trail quality cannot close without a passing route artifact plus visual acceptance.',
      terrainDistribution?.status === 'fail' || terrainDistributionLargeMapFlags.length > 0
        ? 'Terrain distribution audit flags Open Frontier or A Shau; vegetation/hydrology clustering needs another pass before ecology acceptance.'
        : terrainDistribution?.status === 'warn'
        ? 'Terrain distribution audit remains WARN only because AI Sandbox uses the fixed fallback seed for random-mode sampling; large-map distribution still needs human visual acceptance.'
        : terrainDistribution?.status === 'pass'
        ? ''
        : 'Terrain distribution audit is missing; vegetation and ground-cover distribution cannot close without mapped evidence.',
      terrainPlacement?.status === 'warn'
        ? `Terrain placement audit now flags ${terrainPlacement.summary?.warnFeatures ?? terrainPlacementFlaggedFeatures.length} high-native-relief pad(s) for foundation visual review before foundation acceptance.`
        : terrainPlacement?.status === 'fail'
        ? 'Terrain placement audit has failing foundation or airfield placement checks.'
        : '',
      terrainPlacementGeneratedReliefWarnings.length > 0
        ? `Generated airfield placements now flag ${terrainPlacementGeneratedReliefWarnings.length} airfield feature(s) with building/vehicle/parked-aircraft native relief over the warning threshold; this matches the owner-observed foundation-over-cliff issue and blocks structure/vehicle GLB import acceptance.`
        : '',
      latestOpenFrontierPerf?.validation?.overall === 'fail' || latestOpenFrontierPerf?.status === 'failed'
        ? `Latest Open Frontier matched perf attempt is rejected as acceptance evidence (${inputs.latestOpenFrontierPerf}): validation=${latestOpenFrontierPerf?.validation?.overall ?? 'unknown'}, status=${latestOpenFrontierPerf?.status ?? 'unknown'}.`
        : '',
      perfHeapDiagnostic?.classification?.heapShape === 'transient_gc_wave'
        ? `Perf heap diagnostic classifies the rejected Open Frontier run as a transient GC wave (${perfHeapDiagnostic.classification.likelySource ?? 'unknown source'}), so the next KB-TERRAIN perf pass should reduce or instrument short-lived allocations before rerunning the matched pair.`
        : '',
      'Ground-cover replacements are cataloged but not accepted runtime imports.',
      pixelForgeStructureReview?.status === 'warn'
        ? 'Pixel Forge building gallery candidates now have source-grid review coverage, but current ground-vehicle GLBs lack matching validation grids and need Pixel Forge-side refresh before future driving import.'
        : pixelForgeStructureReview?.status === 'pass'
        ? 'Pixel Forge structure/vehicle gallery has source-grid coverage, but still needs runtime side-by-side placement and perf acceptance before import.'
        : 'Pixel Forge structure/vehicle gallery review is missing; replacement candidates need source-grid and runtime side-by-side evidence before import.',
      activeDriverMovementTargetContract
        ? activeDriverTrustedModePairProof
          ? activeDriverPacingSignatureClear
            ? 'Retained Open Frontier/A Shau browser proof clears the active-driver pacing/stuck signature; objective-flow acceptance remains open because the latest diagnostic is still WARN.'
            : 'Trusted Open Frontier/A Shau browser proof exists, but the active-driver diagnostic still reports pacing or route-progress findings.'
          : 'Active-driver route-overlay movementTarget fix still needs trusted Open Frontier/A Shau browser liveness proof.'
        : 'Active-driver route-overlay movement contract is not yet wired for camera-relative player movement.',
      activeDriverCombatObjectiveContract
        ? activeDriverTrustedModePairProof
          ? activeDriverObjectiveFlowStillWarn
            ? 'Aggressive-mode active-driver combat-front routing now has trusted Open Frontier/A Shau shot proof, but objective-flow acceptance remains WARN until closure/progress telemetry or human visual review confirms sustained objective advance.'
            : ''
          : activeDriverObjectiveTelemetry
          ? 'Aggressive-mode active-driver combat-front objective routing plus objective/path telemetry still needs trusted Open Frontier/A Shau shot proof.'
          : 'Aggressive-mode active-driver combat-front objective routing has focused CPU validation only; quiet-machine Open Frontier/A Shau shot proof is still pending.'
        : 'Aggressive-mode active-driver objective routing can still choose zone patrol over combat-front acquisition.',
      activeDriverDiagnostic?.status === 'fail'
        ? 'Latest active-driver diagnostic cannot answer the objective/path questions yet; rerun Open Frontier/A Shau with the current telemetry patch.'
        : '',
      activeDriverTrustedModePairProof && activeDriverPacingSignatureClear
        ? 'Owner visual re-review is still needed to overturn the earlier 2026-05-06 close-pressure pacing report; current artifacts clear the telemetry pacing signature but do not replace human skilled-player acceptance.'
        : 'Owner visual review on 2026-05-06 still reports close-pressure twitch/cover-like pacing when many NPCs are near the player or HQ; active-driver and NPC cover behavior remain human-rejected until a visual rerun proves progress toward objectives without oscillation.',
    ],
    proxyWarning: 'A terrain asset inventory proves candidates and missing files, not visual/runtime acceptance.',
  });

  addItem(items, {
    id: 'kb-cull-closeout',
    requirement: 'KB-CULL findings and scoped accepted slices are captured for stabilization, with broad HLOD, vehicle-driving, and vegetation culling deferred to the roadmap.',
    namedEvidence: [
      inputs.cycle3Kickoff,
      inputs.cullingOwnerBaseline,
      inputs.closeModelCullingBeforeOpenFrontier,
      inputs.closeModelCullingAfterOpenFrontier,
      inputs.closeModelCullingAfterAShau,
    ].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      status: cycleStatuses.cull,
      targetSummary: target(cycle3, 'static-feature-and-vehicle-culling-hlod')?.summary ?? null,
      closePoolResidencyStatus: closePoolResidency?.status ?? null,
      staticFeatureAndVisibleHelicopterOwnerPathStatus: cullingSliceEvidence?.staticFeatureAndVisibleHelicopterOwnerPath?.status ?? null,
      vehicleInteractionSafetyStatus: cullingSliceEvidence?.vehicleInteractionSafety?.status ?? null,
      vehicleInteractionSafety: cullingSliceEvidence?.vehicleInteractionSafety ?? null,
      closeModelFrustumCullingStatus: closeModelFrustumCullingEvidenceComplete ? 'evidence_complete' : 'missing_or_incomplete',
      closeModelFrustumCullingContract,
      closeModelFrustumCulling: {
        beforeOpenFrontierPath: inputs.closeModelCullingBeforeOpenFrontier,
        openFrontierAfterPath: inputs.closeModelCullingAfterOpenFrontier,
        aShauAfterPath: inputs.closeModelCullingAfterAShau,
        beforeOpenFrontier: {
          validationOverall: closeModelCullingBeforeOpenFrontier?.validation?.overall ?? null,
          measurementTrustStatus: closeModelCullingBeforeOpenFrontier?.measurementTrust?.status ?? null,
          avgFrameMs: validationCheck(closeModelCullingBeforeOpenFrontier, 'avg_frame_ms')?.value ?? null,
          p99FrameMs: validationCheck(closeModelCullingBeforeOpenFrontier, 'peak_p99_frame_ms')?.value ?? null,
          hitch50Percent: validationCheck(closeModelCullingBeforeOpenFrontier, 'hitch_50ms_percent')?.value ?? null,
        },
        openFrontierAfter: {
          validationOverall: closeModelCullingAfterOpenFrontier?.validation?.overall ?? null,
          measurementTrustStatus: closeModelCullingAfterOpenFrontier?.measurementTrust?.status ?? null,
          avgFrameMs: validationCheck(closeModelCullingAfterOpenFrontier, 'avg_frame_ms')?.value ?? null,
          p99FrameMs: validationCheck(closeModelCullingAfterOpenFrontier, 'peak_p99_frame_ms')?.value ?? null,
          hitch50Percent: validationCheck(closeModelCullingAfterOpenFrontier, 'hitch_50ms_percent')?.value ?? null,
          playerShots: validationCheck(closeModelCullingAfterOpenFrontier, 'player_shots_recorded')?.value ?? null,
          playerHits: validationCheck(closeModelCullingAfterOpenFrontier, 'player_hits_recorded')?.value ?? null,
        },
        aShauAfter: {
          validationOverall: closeModelCullingAfterAShau?.validation?.overall ?? null,
          measurementTrustStatus: closeModelCullingAfterAShau?.measurementTrust?.status ?? null,
          avgFrameMs: validationCheck(closeModelCullingAfterAShau, 'avg_frame_ms')?.value ?? null,
          p99FrameMs: validationCheck(closeModelCullingAfterAShau, 'peak_p99_frame_ms')?.value ?? null,
          hitch50Percent: validationCheck(closeModelCullingAfterAShau, 'hitch_50ms_percent')?.value ?? null,
          playerShots: validationCheck(closeModelCullingAfterAShau, 'player_shots_recorded')?.value ?? null,
          playerHits: validationCheck(closeModelCullingAfterAShau, 'player_hits_recorded')?.value ?? null,
        },
      },
      cullingSliceOpenItems: cullingSliceEvidence?.openItems ?? null,
      closePoolResidency,
    },
    status: cycleStatuses.cull === 'evidence_complete' || cullFindingsCaptured ? 'pass' : 'partial',
    coverage: closePoolResidencyAccepted && staticOwnerPathAccepted && vehicleInteractionSafetyAccepted
      ? 'Owner-path baselines, selected static-feature/visible-helicopter after evidence, layer-specific culling evidence, scoped close-NPC pool-residency after evidence, and vehicle-interaction culling safety evidence exist.'
      : closePoolResidencyAccepted && staticOwnerPathAccepted
      ? 'Owner-path baselines, selected static-feature/visible-helicopter after evidence, layer-specific culling evidence, and scoped close-NPC pool-residency after evidence exist.'
      : closePoolResidencyAccepted && closeModelFrustumCullingEvidenceComplete
      ? 'Owner-path baselines, layer-specific culling evidence, scoped close-NPC pool-residency after evidence, and scoped close-model frustum-culling after evidence exist.'
      : closePoolResidencyAccepted
      ? 'Owner-path baselines, layer-specific culling evidence, and scoped close-NPC pool-residency after evidence exist.'
      : staticOwnerPathAccepted
      ? 'Owner-path baselines, selected static-feature/visible-helicopter after evidence, and layer-specific culling evidence exist.'
      : 'Owner-path baselines and layer-specific culling evidence exist.',
    missingOrWeak: [
      cullFindingsCaptured
        ? 'Broad HLOD, parked-aircraft playtest, future driving, and vegetation culling are captured as future work under the revised stabilization objective.'
        : 'KB-CULL findings are not yet fully captured for the stabilization handoff.',
      staticOwnerPathAccepted
        ? vehicleInteractionSafetyAccepted
          ? 'Selected static-feature/visible-helicopter owner path and vehicle-interaction safety are scoped accepted slices only; broad HLOD, parked-aircraft playtest/future driving, and vegetation culling remain unclosed.'
          : 'Selected static-feature/visible-helicopter owner path is now a scoped accepted slice only; broad HLOD, vehicle, and vegetation culling remain unclosed.'
        : 'Existing evidence covers selected layers only, not broad culling/HLOD acceptance.',
      closePoolResidencyAccepted
        ? 'Close-NPC pool residency is now a scoped accepted slice only; static-feature, vehicle, HLOD, and vegetation culling remain unclosed.'
        : 'Close-NPC pool residency remains diagnostic-only until combat stress trust passes.',
      closeModelFrustumCullingEvidenceComplete
        ? 'Close-model frustum culling is now a scoped accepted slice only; broad HLOD, vehicle, static-cluster, and vegetation culling remain unclosed.'
        : 'Close-model frustum culling lacks matched trusted Open Frontier/A Shau before/after evidence.',
    ],
    proxyWarning: 'Deterministic category proof and static batching evidence are not broad gameplay culling certification.',
  });

  addItem(items, {
    id: 'kb-forge-and-asset-pipeline',
    requirement: 'KB-FORGE folds the local Pixel Forge repo into Projekt as a relevance/catalog pipeline for TIJ assets.',
    namedEvidence: [inputs.pixelForgeBureau, inputs.pixelForgeStructureReview, 'docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md'].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      status: pixelForge?.status ?? null,
      pixelForgeStructureReviewStatus: pixelForgeStructureReview?.status ?? null,
      pixelForgeStructureReviewSummary: pixelForgeStructureReview?.summary ?? null,
      pixelForgeStructureReviewFiles: pixelForgeStructureReview?.files ?? null,
      pixelForgeRootExists: pixelForge?.pixelForgeRootExists ?? null,
      manifestEntries: pixelForge?.galleryManifest?.totalEntries ?? null,
      vegetationEntries: pixelForge?.galleryManifest?.vegetationSpecies?.length ?? null,
      runtimeMissing: pixelForge?.galleryManifest?.runtimeSpeciesMissing ?? null,
      retiredPresent: pixelForge?.galleryManifest?.retiredSpeciesPresent ?? null,
      blockedPresent: pixelForge?.galleryManifest?.blockedSpeciesPresent ?? null,
      productionStatuses: pixelForge?.galleryManifest?.productionStatuses ?? null,
      manifestPolicyAligned: pixelForge?.galleryManifest?.manifestPolicyAligned ?? null,
      manifestPolicyIssues: pixelForge?.galleryManifest?.manifestPolicyIssues ?? null,
      queues: pixelForge?.relevanceCatalog?.queues?.length ?? null,
      propFamilies: pixelForge?.relevanceCatalog?.propFamilies?.length ?? null,
      vegetationPackages: pixelForge?.relevanceCatalog?.vegetationPackages?.length ?? null,
      npcPackage: pixelForge?.npcPackage ?? null,
    },
    status: pixelForge?.status === 'pass' ? 'pass' : pixelForge?.pixelForgeRootExists ? 'partial' : 'missing',
    coverage: 'The sibling Pixel Forge repo is present and cataloged for TIJ pipeline relevance.',
    missingOrWeak: pixelForge?.status === 'pass'
      ? []
      : [
        'Audit remains WARN because the local Pixel Forge pipeline/catalog surface is incomplete or stale.',
        'No Pixel Forge output is accepted for runtime by this catalog.',
      ],
    proxyWarning: 'Local pipeline availability and a relevance catalog are not production asset acceptance.',
  });

  addItem(items, {
    id: 'owner-vegetation-specifics',
    requirement: 'Owner-directed vegetation changes are honored: remove the small palm, preserve taller palm-like trees, and redirect budget toward grass/ground cover/trails.',
    namedEvidence: [
      inputs.terrainAssetInventory,
      inputs.pixelForgeBureau,
      'src/config/vegetationTypes.ts',
      'src/config/vegetationTypes.test.ts',
      'src/config/biomes.ts',
    ].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      runtimeSpecies: pixelForge?.galleryManifest?.runtimeSpeciesPresent ?? null,
      retiredSpecies: pixelForge?.galleryManifest?.retiredSpeciesPresent ?? null,
      terrainInventorySummary: terrainInventory?.summary ?? null,
    },
    status: terrainInventory?.summary?.missingAssets === 0 && pixelForge?.galleryManifest?.runtimeSpeciesMissing?.length === 0 ? 'pass' : 'fail',
    coverage: 'Runtime inventory and config evidence records giantPalm retired, fanPalm/coconut preserved, and approved ground-cover runtime species fern/elephantEar with density and scale coverage.',
    missingOrWeak: terrainInventory?.summary?.missingAssets === 0 && pixelForge?.galleryManifest?.runtimeSpeciesMissing?.length === 0
      ? []
      : ['Runtime vegetation inventory is missing assets or approved species.'],
    proxyWarning: 'This closes the owner-specific small-palm/ground-cover request, not the broader KB-TERRAIN trail, far-horizon, or A Shau acceptance work.',
  });

  addItem(items, {
    id: 'stabilization-scope-and-roadmap-capture',
    requirement: 'The revised Projekt objective is recorded: stabilize the current local work, extract engineering signal, fold deferred research/TODOs into roadmap/backlog, and revamp Projekt after release.',
    namedEvidence: [inputs.projektLedger, inputs.projektHandoff, inputs.roadmap, inputs.backlog].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      projektLedgerHasCloseoutScope: projektLedgerText.includes('Projekt Objekt-143 Stabilization Closeout'),
      handoffHasCloseoutTarget: projektHandoffText.includes('Stabilization Closeout Target'),
      roadmapHasDeferredProjektFollowup: roadmapText.includes('Projekt Objekt-143 follow-up is intentionally deferred'),
      backlogHasStabilizationCloseout: backlogText.includes('Projekt Objekt-143 Stabilization Closeout'),
    },
    status: stabilizationScopeCaptured ? 'pass' : 'fail',
    coverage: stabilizationScopeCaptured
      ? 'Ledger, handoff, roadmap, and backlog all record the narrower stabilization objective and preserve experimental findings as future work.'
      : 'The revised stabilization objective is not yet recorded across the control docs.',
    missingOrWeak: [
      projektLedgerText.includes('Projekt Objekt-143 Stabilization Closeout') ? '' : 'Ledger does not record the revised stabilization objective.',
      projektHandoffText.includes('Stabilization Closeout Target') ? '' : 'Handoff does not record the revised stabilization target.',
      roadmapText.includes('Projekt Objekt-143 follow-up is intentionally deferred') ? '' : 'Roadmap does not carry the deferred Projekt revamp/follow-up signal.',
      backlogText.includes('Projekt Objekt-143 Stabilization Closeout') ? '' : 'Backlog does not carry the stabilization closeout checklist.',
    ].filter(Boolean),
    proxyWarning: 'Capturing future work in docs is not the same as implementing it; this item only verifies the revised objective and roadmap handoff.',
  });

  const releaseProofChecks = liveReleaseProof?.checks ?? [];
  const failedReleaseProofChecks = releaseProofChecks
    .filter((check) => check.status !== 'pass')
    .map((check) => `${check.id ?? 'unknown'}: ${check.detail ?? 'failed'}`);
  const releaseProofMatchesHead = liveReleaseProof?.git?.head === git.head
    && liveReleaseProof?.manifest?.gitSha === git.head;
  const releaseProofPasses = liveReleaseProof?.status === 'pass' && releaseProofMatchesHead;
  const releaseGatePasses = !git.dirty
    && git.aheadOfOriginMaster === 0
    && git.behindOriginMaster === 0
    && releaseProofPasses;

  addItem(items, {
    id: 'validation-and-release',
    requirement: 'The complete Projekt state is validated, committed, pushed, deployed, and live production parity is verified.',
    namedEvidence: [
      'git status --short --branch',
      'origin/master',
      'GitHub CI and Deploy runs',
      inputs.liveReleaseProof,
    ].filter((entry): entry is string => Boolean(entry)),
    inspectedEvidence: {
      branchLine: git.branchLine,
      dirty: git.dirty,
      shortStatus: git.shortStatus,
      aheadOfOriginMaster: git.aheadOfOriginMaster,
      behindOriginMaster: git.behindOriginMaster,
      liveReleaseProofStatus: liveReleaseProof?.status ?? null,
      liveReleaseProofMatchesHead: releaseProofMatchesHead,
      liveManifestGitSha: liveReleaseProof?.manifest?.gitSha ?? null,
      ciRun: liveReleaseProof?.github?.ci ?? null,
      deployRun: liveReleaseProof?.github?.deploy ?? null,
      pagesHeaders: liveReleaseProof?.pagesHeaders ?? null,
      r2AshauDem: liveReleaseProof?.r2AshauDem ?? null,
      browserSmoke: liveReleaseProof?.browserSmoke
        ? {
          menuText: liveReleaseProof.browserSmoke.menuText ?? null,
          modeVisible: liveReleaseProof.browserSmoke.modeVisible ?? null,
          deployUiVisible: liveReleaseProof.browserSmoke.deployUiVisible ?? null,
          retryVisible: liveReleaseProof.browserSmoke.retryVisible ?? null,
          consoleErrors: liveReleaseProof.browserSmoke.consoleErrors?.length ?? null,
          pageErrors: liveReleaseProof.browserSmoke.pageErrors?.length ?? null,
          requestErrors: liveReleaseProof.browserSmoke.requestErrors?.length ?? null,
        }
        : null,
    },
    status: releaseGatePasses ? 'pass' : (!git.dirty && git.aheadOfOriginMaster === 0 && git.behindOriginMaster === 0 ? 'partial' : 'fail'),
    coverage: releaseGatePasses
      ? 'Local git state, GitHub CI/deploy runs, live manifest SHA, Pages headers, R2 DEM headers, and live browser smoke are all verified for HEAD.'
      : 'Local git state and any available live-release proof are inspected directly.',
    missingOrWeak: [
      git.dirty ? 'Working tree has uncommitted changes.' : '',
      git.aheadOfOriginMaster && git.aheadOfOriginMaster > 0 ? `Local master is ahead of origin/master by ${git.aheadOfOriginMaster} commits.` : '',
      git.behindOriginMaster && git.behindOriginMaster > 0 ? `Local master is behind origin/master by ${git.behindOriginMaster} commits.` : '',
      liveReleaseProof ? '' : 'No live release proof artifact is present. Run npm run check:projekt-143-live-release-proof after deploy.',
      liveReleaseProof && liveReleaseProof.status !== 'pass' ? `Live release proof status is ${liveReleaseProof.status}.` : '',
      liveReleaseProof && !releaseProofMatchesHead ? 'Live release proof does not match current HEAD and live manifest SHA.' : '',
      ...failedReleaseProofChecks,
    ].filter(Boolean),
    proxyWarning: 'This item requires live-release proof for the current HEAD; local validation alone is not production parity.',
  });

  const blockers = items
    .filter((item) => statusBlocksCompletion(item.status))
    .map((item) => `${item.id}: ${item.missingOrWeak[0] ?? item.coverage}`);

  const nextRequiredActions = blockers.length === 0
    ? []
    : [
      stabilizationScopeCaptured
        ? null
        : 'Record the revised stabilization objective in the Projekt ledger, handoff, roadmap, and backlog before release.',
      'Run the selected stabilization validation gate for the current local stack: at minimum typecheck, targeted tests for touched systems, build/build:perf, and the Projekt completion audit.',
      'Commit the current local stack, push, run required CI/deploy, and verify live production state before any release-complete claim.',
    ].filter((action): action is string => Boolean(action));

  return {
    createdAt: new Date().toISOString(),
    mode: 'projekt-143-completion-audit',
    objective: 'Complete the revised Projekt Objekt-143 stabilization closeout: preserve the useful fixes and evidence from the experimental cycle, fold unresolved bureau work into roadmap/backlog, validate the current repo, then push, deploy, and verify live production parity.',
    concreteSuccessCriteria: [
      'Every named bureau target is either evidence_complete, owner-accepted, or explicitly captured as deferred roadmap/backlog work under the revised stabilization objective.',
      'The prompt-to-artifact checklist maps each requirement to real files, command output, or current git/deploy evidence.',
      'Static suites, runtime probes, visual proofs, and perf captures are treated as current-state evidence or future-work signal, not inflated into final visual/perf acceptance.',
      'Research, agent-orchestration lessons, Pixel Forge findings, hydrology/water work, vegetation distribution, culling/HLOD, and active-driver findings are represented in roadmap/backlog/handoff docs.',
      'The local repo is clean, pushed, CI-verified, manually deployed when required, and live Pages production is verified against the shipped SHA.',
    ],
    completionStatus: blockers.length === 0 ? 'complete' : 'not_complete',
    canMarkGoalComplete: blockers.length === 0,
    sourceGitSha: git.head,
    git,
    inputs,
    promptToArtifactChecklist: items,
    blockers,
    nextRequiredActions,
    nonClaims: [
      'This audit does not fix the remaining deferred bureau work.',
      'This audit explicitly does not accept vegetation normal-map removal for default policy.',
      'This audit does not accept any Pixel Forge candidate for runtime.',
      'This audit does not claim final water, terrain, culling/HLOD, vehicle-driving, or skilled-player acceptance when those items are recorded as roadmap work.',
      'This audit does not claim completion for any future Projekt revamp item that was intentionally deferred to roadmap/backlog.',
    ],
  };
}

function main(): void {
  const report = buildReport();
  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonFile = join(outputDir, 'completion-audit.json');
  const markdownFile = join(outputDir, 'completion-audit.md');
  writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeMarkdown(report, markdownFile);

  console.log(`Projekt 143 completion audit ${report.completionStatus.toUpperCase()}: ${relative(process.cwd(), jsonFile)}`);
  for (const item of report.promptToArtifactChecklist) {
    console.log(`- ${item.status.toUpperCase()} ${item.id}: ${item.requirement}`);
  }
  if (report.completionStatus !== 'complete') {
    console.log('Blockers:');
    for (const blocker of report.blockers) {
      console.log(`- ${blocker}`);
    }
  }

  if (process.argv.includes('--strict') && report.completionStatus !== 'complete') {
    process.exitCode = 1;
  }
}

main();
