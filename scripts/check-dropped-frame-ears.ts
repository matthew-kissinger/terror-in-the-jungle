#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type CheckStatus = 'pass' | 'warn' | 'fail';
export type DroppedFrameEarsClassification = 'proven' | 'diagnostic' | 'rejected';
type RequiredScenario = 'open_frontier' | 'a_shau_valley';

export interface DroppedFrameEarsCheck {
  id: string;
  status: CheckStatus;
  message: string;
  value?: string | number | boolean | null;
}

export interface DroppedFrameEarsArtifactEvaluation {
  artifactDir: string;
  artifactRelPath: string;
  scenario: string | null;
  classification: DroppedFrameEarsClassification;
  contactQualified: boolean;
  materializationQualified: boolean;
  completionLaneQualified: boolean;
  criticalPass: boolean;
  failCount: number;
  warnCount: number;
  checks: DroppedFrameEarsCheck[];
}

export interface DroppedFrameEarsEvaluation {
  status: CheckStatus;
  requiredScenarios: readonly RequiredScenario[];
  passingScenarios: RequiredScenario[];
  missingScenarios: RequiredScenario[];
  artifacts: DroppedFrameEarsArtifactEvaluation[];
}

type ValidationCheck = {
  id?: string;
  status?: CheckStatus;
  value?: unknown;
  message?: string;
};

type ThresholdCheck = {
  id: string;
  maxExclusive: number;
  fallbackPath: readonly string[];
  label: string;
};

type BooleanRuntimeFlag = {
  id: string;
  path: readonly string[];
  equals?: boolean | string;
  message: string;
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const REQUIRED_SCENARIOS = ['open_frontier', 'a_shau_valley'] as const satisfies readonly RequiredScenario[];
const REQUIRED_FILES = [
  'summary.json',
  'validation.json',
  'measurement-trust.json',
  'presentation-epochs.json',
  'runtime-render-submission-samples.json',
  'final-frame.png',
] as const;

const MIN_SUSTAINED_MATERIALIZATION_SAMPLES = 3;
const MIN_SUSTAINED_MATERIALIZATION_RATIO = 0.1;

const RAF_THRESHOLDS: readonly ThresholdCheck[] = [
  {
    id: 'raf_stutter_25ms_percent',
    maxExclusive: 0.5,
    fallbackPath: ['droppedFrameMetrics', 'browserRaf', 'stutter25Percent'],
    label: 'rAF gaps >25ms percent',
  },
  {
    id: 'raf_hitch_33ms_percent',
    maxExclusive: 0.25,
    fallbackPath: ['droppedFrameMetrics', 'browserRaf', 'hitch33Percent'],
    label: 'rAF gaps >33ms percent',
  },
  {
    id: 'raf_estimated_dropped_60hz_frames_per_second',
    maxExclusive: 0.1,
    fallbackPath: ['droppedFrameMetrics', 'browserRaf', 'estimatedDropped60HzFramesPerSecond'],
    label: 'estimated dropped 60Hz frames per second',
  },
  {
    id: 'raf_dropped_frame_time_60hz_ms_per_second',
    maxExclusive: 1,
    fallbackPath: ['droppedFrameMetrics', 'browserRaf', 'droppedFrameTime60HzMsPerSecond'],
    label: 'dropped-frame time over 60Hz budget per second',
  },
];

const HARNESS_EQUIVALENCE_IDS = [
  'harness_route_snap_trust',
  'harness_frontline_compression_equivalence',
  'harness_movement_mode_equivalence',
  'harness_view_slew_request_equivalence',
  'harness_shot_presentation_context_equivalence',
] as const;

const FORBIDDEN_RUNTIME_FLAGS: readonly BooleanRuntimeFlag[] = [
  {
    id: 'presentation_context_capture_disabled',
    path: ['perfRuntime', 'presentationContextCapture'],
    equals: false,
    message: 'rich presentation context capture is disabled',
  },
  {
    id: 'frontline_compression_requested',
    path: ['perfRuntime', 'frontlineCompressionRequested'],
    message: 'frontline compression was requested',
  },
  {
    id: 'npc_close_models_disabled',
    path: ['perfRuntime', 'npcCloseModelsDisabled'],
    message: 'close NPC models are disabled',
  },
  {
    id: 'terrain_shadows_disabled',
    path: ['perfRuntime', 'terrainShadowsDisabled'],
    message: 'terrain shadows are disabled',
  },
  {
    id: 'terrain_full_shadow_pass_enabled',
    path: ['perfRuntime', 'terrainFullShadowPassEnabled'],
    message: 'full terrain shadow pass is a diagnostic variant',
  },
  {
    id: 'bounded_terrain_shadow_pass_requested',
    path: ['perfRuntime', 'boundedTerrainShadowPassRequested'],
    message: 'bounded terrain shadow pass was explicitly requested as a diagnostic flag',
  },
  {
    id: 'terrain_force_instance_upload_enabled',
    path: ['perfRuntime', 'terrainForceInstanceUploadEnabled'],
    message: 'terrain instance uploads are forced',
  },
  {
    id: 'terrain_height_aware_frustum_requested',
    path: ['perfRuntime', 'terrainHeightAwareFrustumRequested'],
    message: 'height-aware terrain frustum was explicitly requested as a diagnostic flag',
  },
  {
    id: 'terrain_height_bounds_heuristic_enabled',
    path: ['perfRuntime', 'terrainHeightBoundsSource'],
    equals: 'heuristic-samples',
    message: 'heuristic-sampled terrain height bounds are diagnostic-only',
  },
  {
    id: 'terrain_full_skirts_requested',
    path: ['perfRuntime', 'terrainFullSkirtsRequested'],
    message: 'legacy full terrain skirts are explicitly requested',
  },
  {
    id: 'terrain_sparse_skirts_requested',
    path: ['perfRuntime', 'terrainSparseSkirtsRequested'],
    message: 'adaptive terrain skirts are explicitly requested by diagnostic flag',
  },
  {
    id: 'terrain_skirts_disabled',
    path: ['perfRuntime', 'terrainSkirtsDisabled'],
    message: 'terrain skirts are disabled',
  },
  {
    id: 'terrain_far_canopy_tint_disabled',
    path: ['perfRuntime', 'terrainFarCanopyTintDisabled'],
    message: 'far-canopy terrain tint is disabled',
  },
  {
    id: 'terrain_low_sun_occlusion_disabled',
    path: ['perfRuntime', 'terrainLowSunOcclusionDisabled'],
    message: 'low-sun terrain occlusion is disabled',
  },
  {
    id: 'wildlife_disabled',
    path: ['perfRuntime', 'wildlifeDisabled'],
    message: 'wildlife is disabled',
  },
];

const FORBIDDEN_QUERY_FLAGS = [
  'perfDisableNpcCloseModels',
  'perfDisableTerrainShadows',
  'perfBoundedTerrainShadowPass',
  'terrainFullShadowPass',
  'terrainForceInstanceUpload',
  'terrainEnableHeightAwareFrustum',
  'perfTerrainHeightAwareFrustum',
  'terrainFullTerrainSkirts',
  'terrainSparseTerrainSkirts',
  'perfDisableTerrainSkirts',
  'perfDisableTerrainFarCanopyTint',
  'perfDisableTerrainLowSunOcclusion',
  'perfDisableWildlife',
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readJsonObject(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return asRecord(JSON.parse(readFileSync(path, 'utf-8')));
  } catch {
    return null;
  }
}

function getPath(root: Record<string, unknown> | null, path: readonly string[]): unknown {
  let cursor: unknown = root;
  for (const part of path) {
    const record = asRecord(cursor);
    if (!record) return undefined;
    cursor = record[part];
  }
  return cursor;
}

function getString(root: Record<string, unknown> | null, path: readonly string[]): string | null {
  const value = getPath(root, path);
  return typeof value === 'string' ? value : null;
}

function getNumber(root: Record<string, unknown> | null, path: readonly string[]): number | null {
  const value = getPath(root, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getBoolean(root: Record<string, unknown> | null, path: readonly string[]): boolean | null {
  const value = getPath(root, path);
  return typeof value === 'boolean' ? value : null;
}

function getValidationChecks(validation: Record<string, unknown> | null, summary: Record<string, unknown> | null): ValidationCheck[] {
  const directChecks = asArray(getPath(validation, ['checks']));
  const summaryChecks = asArray(getPath(summary, ['validation', 'checks']));
  const checks = directChecks.length > 0 ? directChecks : summaryChecks;
  return checks
    .map((value) => asRecord(value))
    .filter((value): value is Record<string, unknown> => value !== null)
    .map((value) => ({
      id: typeof value.id === 'string' ? value.id : undefined,
      status: value.status === 'pass' || value.status === 'warn' || value.status === 'fail'
        ? value.status
        : undefined,
      value: value.value,
      message: typeof value.message === 'string' ? value.message : undefined,
    }));
}

function validationCheck(checks: readonly ValidationCheck[], id: string): ValidationCheck | null {
  return checks.find((check) => check.id === id) ?? null;
}

function checkPassed(checks: readonly DroppedFrameEarsCheck[], id: string): boolean {
  return checks.some((check) => check.id === id && check.status === 'pass');
}

function checkStatus(status: boolean, id: string, passMessage: string, failMessage: string, value?: DroppedFrameEarsCheck['value']): DroppedFrameEarsCheck {
  return {
    id,
    status: status ? 'pass' : 'fail',
    message: status ? passMessage : failMessage,
    value,
  };
}

function closeEnough(actual: number | null, expected: number | null): boolean {
  if (actual === null || expected === null || !Number.isFinite(actual) || !Number.isFinite(expected)) {
    return false;
  }
  const tolerance = Math.max(0.01, Math.abs(expected) * 0.000001);
  return Math.abs(actual - expected) <= tolerance;
}

function formatPercent(value: number | null): string {
  return value === null ? 'missing' : `${(value * 100).toFixed(1)}%`;
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function isRequiredScenario(value: string | null): value is RequiredScenario {
  return value === 'open_frontier' || value === 'a_shau_valley';
}

function validationOverall(validation: Record<string, unknown> | null, summary: Record<string, unknown> | null): string | null {
  return getString(validation, ['overall']) ?? getString(summary, ['validation', 'overall']);
}

function measurementTrustStatus(measurementTrust: Record<string, unknown> | null, summary: Record<string, unknown> | null): string | null {
  return getString(measurementTrust, ['status']) ?? getString(summary, ['measurementTrust', 'status']);
}

function rendererResolvedBackend(measurementTrust: Record<string, unknown> | null, summary: Record<string, unknown> | null): string | null {
  return getString(summary, ['rendererBackend', 'resolvedBackend'])
    ?? getString(summary, ['measurementTrust', 'rendererBackend', 'resolvedBackend'])
    ?? getString(measurementTrust, ['rendererBackend', 'resolvedBackend']);
}

function rendererStrictWebGpu(measurementTrust: Record<string, unknown> | null, summary: Record<string, unknown> | null): boolean {
  return getBoolean(summary, ['rendererBackend', 'strictWebGPU'])
    ?? getBoolean(summary, ['measurementTrust', 'rendererBackend', 'strictWebGPU'])
    ?? getBoolean(measurementTrust, ['rendererBackend', 'strictWebGPU'])
    ?? false;
}

function urlSearchParams(summary: Record<string, unknown> | null): URLSearchParams | null {
  const rawUrl = getString(summary, ['url']);
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).searchParams;
  } catch {
    return null;
  }
}

function addRequiredFileChecks(artifactDir: string, checks: DroppedFrameEarsCheck[]): void {
  for (const fileName of REQUIRED_FILES) {
    const path = join(artifactDir, fileName);
    const present = existsSync(path);
    checks.push(checkStatus(
      present,
      `required_file_${fileName.replaceAll('.', '_').replaceAll('-', '_')}`,
      `${fileName} is present`,
      `${fileName} is missing`,
      present
    ));
  }
}

function addRafChecks(
  checks: DroppedFrameEarsCheck[],
  validationChecks: readonly ValidationCheck[],
  summary: Record<string, unknown> | null
): void {
  for (const threshold of RAF_THRESHOLDS) {
    const fromValidation = validationCheck(validationChecks, threshold.id);
    const value = typeof fromValidation?.value === 'number'
      ? fromValidation.value
      : getNumber(summary, threshold.fallbackPath);
    const passed = value !== null && value < threshold.maxExclusive;
    checks.push({
      id: threshold.id,
      status: passed ? 'pass' : 'fail',
      value,
      message: value === null
        ? `${threshold.label} is missing; threshold is <${threshold.maxExclusive}`
        : `${threshold.label} ${value.toFixed(3)}; threshold is <${threshold.maxExclusive}`,
    });
  }
}

function addCombatChecks(checks: DroppedFrameEarsCheck[], validationChecks: readonly ValidationCheck[]): void {
  const shots = validationCheck(validationChecks, 'harness_min_shots_fired')
    ?? validationCheck(validationChecks, 'player_shots_recorded');
  const hits = validationCheck(validationChecks, 'harness_min_hits_recorded')
    ?? validationCheck(validationChecks, 'player_hits_recorded');
  checks.push(checkStatus(
    shots?.status === 'pass',
    'active_combat_shots',
    'active combat shot threshold passed',
    'active combat shot threshold is missing or failed',
    typeof shots?.value === 'number' ? shots.value : null
  ));
  checks.push(checkStatus(
    hits?.status === 'pass',
    'active_combat_hits',
    'active combat hit threshold passed',
    'active combat hit threshold is missing or failed',
    typeof hits?.value === 'number' ? hits.value : null
  ));
}

function addMaterializationEnvelopeChecks(
  checks: DroppedFrameEarsCheck[],
  validationChecks: readonly ValidationCheck[],
  summary: Record<string, unknown> | null
): void {
  const validationPressure = validationCheck(validationChecks, 'npc_materialization_pressure');
  const peakCandidates = typeof validationPressure?.value === 'number'
    ? validationPressure.value
    : getNumber(summary, ['closeModelEnvelope', 'peakCandidatesWithinCloseRadius']);
  const peakRendered = getNumber(summary, ['closeModelEnvelope', 'peakRenderedCloseModels']);
  const samplesWithCandidates = getNumber(summary, ['closeModelEnvelope', 'samplesWithCandidates']);
  const sampleCount = getNumber(summary, ['closeModelEnvelope', 'sampleCount']);
  const samplesWithRenderedCloseModels = getNumber(summary, ['closeModelEnvelope', 'samplesWithRenderedCloseModels']);
  const candidateSampleRatio = sampleCount !== null && sampleCount > 0 && samplesWithCandidates !== null
    ? samplesWithCandidates / sampleCount
    : null;
  const fallbackPassed = peakCandidates !== null
    && peakRendered !== null
    && samplesWithCandidates !== null
    && peakCandidates >= 4
    && peakRendered >= 2
    && samplesWithCandidates >= 2;
  const passed = validationPressure
    ? validationPressure.status === 'pass'
    : fallbackPassed;

  checks.push({
    id: 'npc_materialization_pressure',
    status: passed ? 'pass' : 'fail',
    value: peakCandidates,
    message: passed
      ? `NPC materialization pressure was represented (peak candidates=${peakCandidates ?? 'unknown'}, peak rendered=${peakRendered ?? 'unknown'}, samplesWithCandidates=${samplesWithCandidates ?? 'unknown'}/${sampleCount ?? 'unknown'})`
      : `NPC materialization pressure is missing or thin (peak candidates=${peakCandidates ?? 'missing'}, peak rendered=${peakRendered ?? 'missing'}, samplesWithCandidates=${samplesWithCandidates ?? 'missing'}/${sampleCount ?? 'missing'}); completion evidence must not close a materialization fix from low-contact route variance`,
  });

  const sustained = sampleCount !== null
    && samplesWithCandidates !== null
    && samplesWithRenderedCloseModels !== null
    && samplesWithCandidates >= MIN_SUSTAINED_MATERIALIZATION_SAMPLES
    && samplesWithRenderedCloseModels >= MIN_SUSTAINED_MATERIALIZATION_SAMPLES
    && candidateSampleRatio !== null
    && candidateSampleRatio >= MIN_SUSTAINED_MATERIALIZATION_RATIO;
  checks.push({
    id: 'npc_materialization_sustained_contact',
    status: sustained ? 'pass' : 'fail',
    value: candidateSampleRatio,
    message: sustained
      ? `NPC materialization contact was sustained across detailed samples (${samplesWithCandidates}/${sampleCount}, ${formatPercent(candidateSampleRatio)}; rendered=${samplesWithRenderedCloseModels})`
      : `NPC materialization contact was too bursty for completion comparison (${samplesWithCandidates ?? 'missing'}/${sampleCount ?? 'missing'}, ${formatPercent(candidateSampleRatio)}; rendered=${samplesWithRenderedCloseModels ?? 'missing'}; min samples=${MIN_SUSTAINED_MATERIALIZATION_SAMPLES}, min ratio=${formatPercent(MIN_SUSTAINED_MATERIALIZATION_RATIO)})`,
  });
}

function addHarnessEquivalenceChecks(checks: DroppedFrameEarsCheck[], validationChecks: readonly ValidationCheck[]): void {
  for (const id of HARNESS_EQUIVALENCE_IDS) {
    const check = validationCheck(validationChecks, id);
    const passed = check?.status === 'pass';
    checks.push({
      id,
      status: passed ? 'pass' : 'fail',
      value: typeof check?.value === 'number' || typeof check?.value === 'string' ? check.value : null,
      message: passed
        ? `${id} passed`
        : `${id} is missing, warning, or failed; completion evidence must explain or remove this harness mismatch`,
    });
  }
}

function addForbiddenRuntimeChecks(
  checks: DroppedFrameEarsCheck[],
  summary: Record<string, unknown> | null,
  searchParams: URLSearchParams | null
): void {
  for (const flag of FORBIDDEN_RUNTIME_FLAGS) {
    const actual = getPath(summary, flag.path);
    const forbiddenValue = flag.equals ?? true;
    const enabled = actual === forbiddenValue;
    checks.push({
      id: `forbidden_${flag.id}`,
      status: enabled ? 'fail' : 'pass',
      value: typeof actual === 'string' || typeof actual === 'boolean' || typeof actual === 'number'
        ? actual
        : null,
      message: enabled
        ? `Rejected content/runtime variant: ${flag.message}`
        : `Forbidden runtime flag is not set: ${flag.id}`,
    });
  }

  const shadowMode = getString(summary, ['perfRuntime', 'terrainShadowPassMode']);
  const diagnosticShadowMode = shadowMode === 'bounded-requested' || shadowMode === 'full-diagnostic';
  checks.push({
    id: 'forbidden_terrain_shadow_pass_mode',
    status: diagnosticShadowMode ? 'fail' : 'pass',
    value: shadowMode,
    message: diagnosticShadowMode
      ? `Rejected terrain shadow pass mode: ${shadowMode}`
      : `Terrain shadow pass mode is completion-compatible: ${shadowMode ?? 'unknown'}`,
  });

  const vegetationDensityScale = getNumber(summary, ['perfRuntime', 'vegetationDensityScale'])
    ?? (searchParams?.has('perfVegetationDensityScale')
      ? Number(searchParams.get('perfVegetationDensityScale'))
      : null);
  const changedVegetationDensity = vegetationDensityScale !== null
    && Number.isFinite(vegetationDensityScale)
    && Math.abs(vegetationDensityScale - 1) > 0.001;
  checks.push({
    id: 'forbidden_vegetation_density_scale',
    status: changedVegetationDensity ? 'fail' : 'pass',
    value: vegetationDensityScale,
    message: changedVegetationDensity
      ? `Rejected vegetation density scale: ${vegetationDensityScale}`
      : `Vegetation density scale is default-compatible: ${vegetationDensityScale ?? 'default'}`,
  });

  const weatherStateOverride = getString(summary, ['perfRuntime', 'weatherStateOverride']);
  const changedWeatherState = weatherStateOverride !== null && weatherStateOverride !== 'default';
  checks.push({
    id: 'forbidden_weather_state_override',
    status: changedWeatherState ? 'fail' : 'pass',
    value: weatherStateOverride,
    message: changedWeatherState
      ? `Rejected weather-state diagnostic override: ${weatherStateOverride}`
      : `Weather state is scenario default-compatible: ${weatherStateOverride ?? 'default'}`,
  });

  for (const queryFlag of FORBIDDEN_QUERY_FLAGS) {
    const enabled = searchParams?.get(queryFlag) === '1';
    checks.push({
      id: `forbidden_query_${queryFlag}`,
      status: enabled ? 'fail' : 'pass',
      value: enabled,
      message: enabled
        ? `Rejected URL/runtime diagnostic flag: ${queryFlag}=1`
        : `Forbidden query flag is not set: ${queryFlag}`,
    });
  }
}

function addTerrainHeightBoundsTrustChecks(
  checks: DroppedFrameEarsCheck[],
  summary: Record<string, unknown> | null
): void {
  const source = getString(summary, ['perfRuntime', 'terrainHeightBoundsSource']);
  const tests = getNumber(summary, ['perfRuntime', 'terrainHeightBoundsTests']);
  const fallbacks = getNumber(summary, ['perfRuntime', 'terrainHeightBoundsFallbacks']);

  if (source !== 'baked-grid') {
    checks.push({
      id: 'terrain_height_bounds_baked_grid_trust',
      status: 'pass',
      value: source,
      message: `Production baked-grid terrain bounds are not active: ${source ?? 'unknown'}`,
    });
    return;
  }

  const trusted = tests !== null && tests > 0 && fallbacks === 0;
  checks.push({
    id: 'terrain_height_bounds_baked_grid_trust',
    status: trusted ? 'pass' : 'fail',
    value: fallbacks,
    message: trusted
      ? `Baked-grid terrain bounds covered selection (${tests} tests, ${fallbacks} fallbacks)`
      : `Baked-grid terrain bounds were incomplete (${tests ?? 'missing'} tests, ${fallbacks ?? 'missing'} fallbacks)`,
  });
}

function addTerrainVisualDomainTrustChecks(
  checks: DroppedFrameEarsCheck[],
  summary: Record<string, unknown> | null
): void {
  const playableWorldSize = getNumber(summary, ['perfRuntime', 'terrainPlayableWorldSize']);
  const visualWorldSize = getNumber(summary, ['perfRuntime', 'terrainVisualWorldSize']);
  const visualMargin = getNumber(summary, ['perfRuntime', 'terrainVisualMargin']);
  const maxLODLevels = getNumber(summary, ['perfRuntime', 'terrainMaxLODLevels']);
  const lodRange0 = getNumber(summary, ['perfRuntime', 'terrainLodRange0']);
  const lodRangeLast = getNumber(summary, ['perfRuntime', 'terrainLodRangeLast']);
  const lod0VertexSpacing = getNumber(summary, ['perfRuntime', 'terrainLod0VertexSpacing']);

  const expectedVisualWorldSize = playableWorldSize !== null && visualMargin !== null
    ? playableWorldSize + visualMargin * 2
    : null;
  const visualExtentAligned = closeEnough(visualWorldSize, expectedVisualWorldSize);
  checks.push({
    id: 'terrain_visual_world_size_alignment',
    status: visualExtentAligned ? 'pass' : 'fail',
    value: visualWorldSize,
    message: visualExtentAligned
      ? `Terrain visual world size matches playable extent plus margin (${visualWorldSize})`
      : `Terrain visual world size is not aligned with playable extent plus margin (actual ${visualWorldSize ?? 'missing'}, expected ${expectedVisualWorldSize ?? 'missing'})`,
  });

  const lodCount = maxLODLevels !== null && Number.isInteger(maxLODLevels) && maxLODLevels > 0
    ? maxLODLevels
    : null;
  const expectedLodRange0 = visualWorldSize !== null && lodCount !== null
    ? (visualWorldSize / Math.pow(2, lodCount)) * 4
    : null;
  const expectedLodRangeLast = expectedLodRange0 !== null && lodCount !== null
    ? expectedLodRange0 * Math.pow(2, lodCount - 1)
    : null;
  const rangesAligned = closeEnough(lodRange0, expectedLodRange0)
    && closeEnough(lodRangeLast, expectedLodRangeLast)
    && lod0VertexSpacing !== null
    && lod0VertexSpacing > 0;
  checks.push({
    id: 'terrain_lod_ranges_visual_extent_alignment',
    status: rangesAligned ? 'pass' : 'fail',
    value: lodRange0,
    message: rangesAligned
      ? `Terrain LOD ranges are derived from the visual quadtree extent (LOD0 ${lodRange0}, last ${lodRangeLast})`
      : `Terrain LOD ranges are not derived from the visual quadtree extent (LOD0 ${lodRange0 ?? 'missing'} expected ${expectedLodRange0 ?? 'missing'}, last ${lodRangeLast ?? 'missing'} expected ${expectedLodRangeLast ?? 'missing'}, spacing ${lod0VertexSpacing ?? 'missing'})`,
  });
}

function addTerrainPresentationIntegrityChecks(
  checks: DroppedFrameEarsCheck[],
  summary: Record<string, unknown> | null
): void {
  const presentationGapCount = getNumber(summary, ['presentationGapContexts', 'gapCount']);
  const noPresentationGaps = presentationGapCount === 0;
  const unsyncedBufferVisibleChanges = getNumber(
    summary,
    ['presentationGapContexts', 'terrain', 'terrainStageBufferVisibleChangedWithoutSubmissionCount']
  );
  const bufferVisibleChanges = getNumber(
    summary,
    ['presentationGapContexts', 'terrain', 'terrainStageBufferVisibleChangedCount']
  );
  const morphChanges = getNumber(
    summary,
    ['presentationGapContexts', 'terrain', 'terrainStageMorphHashChangedCount']
  );
  const terrainGapCount = getNumber(summary, ['presentationGapContexts', 'terrain', 'gapCount']);
  const terrainSelectionSaturatedCount = getNumber(
    summary,
    ['presentationGapContexts', 'terrain', 'terrainSelectionSaturatedCount']
  );

  const hasTerrainGapSummary = terrainGapCount !== null;
  const coherent = noPresentationGaps || (
    hasTerrainGapSummary
    && unsyncedBufferVisibleChanges !== null
    && unsyncedBufferVisibleChanges === 0
  );
  checks.push({
    id: 'terrain_stage_buffer_submission_integrity',
    status: coherent ? 'pass' : 'fail',
    value: unsyncedBufferVisibleChanges,
    message: noPresentationGaps
      ? 'No presentation gaps were captured; no dropped-frame CDLOD stage mismatch to classify'
      : coherent
        ? `CDLOD buffer-visible terrain stage changes were submitted (${bufferVisibleChanges ?? 0} buffer-visible changes; ${morphChanges ?? 0} morph-only changes may use shader uniforms)`
      : hasTerrainGapSummary
        ? `CDLOD buffer-visible terrain stage changed without terrain buffer submission (${unsyncedBufferVisibleChanges ?? 'missing'} unsynced of ${bufferVisibleChanges ?? 'missing'} changes)`
        : 'Presentation gap terrain summary is missing; cannot prove CDLOD buffer submission integrity',
  });

  const selectionCapacityTrusted = noPresentationGaps || (
    hasTerrainGapSummary
    && terrainSelectionSaturatedCount !== null
    && terrainSelectionSaturatedCount === 0
  );
  checks.push({
    id: 'terrain_cdlod_selection_capacity',
    status: selectionCapacityTrusted ? 'pass' : 'fail',
    value: terrainSelectionSaturatedCount,
    message: noPresentationGaps
      ? 'No presentation gaps were captured; CDLOD selection capacity did not coincide with a dropped-frame context'
      : selectionCapacityTrusted
        ? 'CDLOD selection did not hit the tile cap in dropped-frame contexts'
        : hasTerrainGapSummary
          ? `CDLOD selection hit the tile cap in ${terrainSelectionSaturatedCount ?? 'missing'} dropped-frame contexts`
          : 'Presentation gap terrain summary is missing; cannot prove CDLOD selection capacity',
  });
}

export function evaluateDroppedFrameEarsArtifact(artifactDir: string): DroppedFrameEarsArtifactEvaluation {
  const absoluteArtifactDir = resolve(artifactDir);
  const summary = readJsonObject(join(absoluteArtifactDir, 'summary.json'));
  const validation = readJsonObject(join(absoluteArtifactDir, 'validation.json'));
  const measurementTrust = readJsonObject(join(absoluteArtifactDir, 'measurement-trust.json'));
  const validationChecks = getValidationChecks(validation, summary);
  const searchParams = urlSearchParams(summary);
  const checks: DroppedFrameEarsCheck[] = [];

  addRequiredFileChecks(absoluteArtifactDir, checks);

  const scenario = getString(summary, ['scenario', 'requestedMode'])
    ?? getString(summary, ['scenario', 'mode'])
    ?? getString(summary, ['mode']);
  checks.push(checkStatus(
    isRequiredScenario(scenario),
    'required_scenario',
    `Scenario ${scenario} is in the completion lane`,
    `Scenario ${scenario ?? 'unknown'} is not in the Open Frontier / A Shau completion lane`,
    scenario
  ));

  const quietMachineAttested = getBoolean(summary, ['captureEnvironment', 'quietMachineAttested']);
  checks.push(checkStatus(
    quietMachineAttested === true,
    'quiet_machine_attested',
    'Quiet-machine attestation is present',
    'Quiet-machine attestation is missing or false',
    quietMachineAttested
  ));

  const status = getString(summary, ['status']);
  checks.push(checkStatus(
    status === 'ok',
    'capture_status_ok',
    'Capture status is ok',
    `Capture status is ${status ?? 'unknown'}`,
    status
  ));

  const overall = validationOverall(validation, summary);
  checks.push(checkStatus(
    overall === 'pass',
    'validation_pass',
    'Validation overall is pass',
    `Validation overall is ${overall ?? 'unknown'}`,
    overall
  ));

  const trust = measurementTrustStatus(measurementTrust, summary);
  checks.push(checkStatus(
    trust === 'pass',
    'measurement_trust_pass',
    'Measurement trust passed',
    `Measurement trust is ${trust ?? 'unknown'}`,
    trust
  ));

  const resolvedBackend = rendererResolvedBackend(measurementTrust, summary);
  const strictWebGpu = rendererStrictWebGpu(measurementTrust, summary);
  checks.push(checkStatus(
    resolvedBackend === 'webgpu' && strictWebGpu,
    'strict_webgpu_backend',
    'Renderer resolved to strict WebGPU',
    `Renderer backend is ${resolvedBackend ?? 'unknown'} strictWebGPU=${strictWebGpu}`,
    resolvedBackend
  ));

  addRafChecks(checks, validationChecks, summary);
  addCombatChecks(checks, validationChecks);
  addMaterializationEnvelopeChecks(checks, validationChecks, summary);
  addHarnessEquivalenceChecks(checks, validationChecks);
  addForbiddenRuntimeChecks(checks, summary, searchParams);
  addTerrainHeightBoundsTrustChecks(checks, summary);
  addTerrainVisualDomainTrustChecks(checks, summary);
  addTerrainPresentationIntegrityChecks(checks, summary);

  checks.push({
    id: 'owner_visual_acceptance_required',
    status: 'warn',
    message: 'Automated artifacts cannot prove the terrain/camera glitch is owner-accepted; keep owner playtest in the release gate.',
    value: null,
  });

  const failCount = checks.filter((check) => check.status === 'fail').length;
  const warnCount = checks.filter((check) => check.status === 'warn').length;
  const rejected = checks.some((check) => check.status === 'fail' && check.id.startsWith('forbidden_'));
  const classification: DroppedFrameEarsClassification = rejected
    ? 'rejected'
    : failCount === 0
      ? 'proven'
      : 'diagnostic';
  const contactQualified = checkPassed(checks, 'active_combat_shots')
    && checkPassed(checks, 'active_combat_hits');
  const materializationQualified = checkPassed(checks, 'npc_materialization_pressure')
    && checkPassed(checks, 'npc_materialization_sustained_contact');
  const completionLaneQualified = classification === 'proven'
    && contactQualified
    && materializationQualified;

  return {
    artifactDir: absoluteArtifactDir,
    artifactRelPath: rel(absoluteArtifactDir),
    scenario,
    classification,
    contactQualified,
    materializationQualified,
    completionLaneQualified,
    criticalPass: completionLaneQualified,
    failCount,
    warnCount,
    checks,
  };
}

export function evaluateDroppedFrameEars(artifactDirs: readonly string[]): DroppedFrameEarsEvaluation {
  const artifacts = artifactDirs.map((artifactDir) => evaluateDroppedFrameEarsArtifact(artifactDir));
  const passingScenarios = REQUIRED_SCENARIOS.filter((scenario) =>
    artifacts.some((artifact) => artifact.scenario === scenario && artifact.criticalPass)
  );
  const missingScenarios = REQUIRED_SCENARIOS.filter((scenario) => !passingScenarios.includes(scenario));
  return {
    status: missingScenarios.length === 0 ? 'pass' : 'fail',
    requiredScenarios: REQUIRED_SCENARIOS,
    passingScenarios,
    missingScenarios,
    artifacts,
  };
}

function latestArtifactDir(): string | null {
  if (!existsSync(ARTIFACT_ROOT)) return null;
  const dirs = readdirSync(ARTIFACT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(ARTIFACT_ROOT, entry.name))
    .filter((path) => existsSync(join(path, 'summary.json')))
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
  return dirs.at(-1) ?? null;
}

function parseArgs(argv: readonly string[]): { dirs: string[]; strict: boolean; json: boolean; help: boolean } {
  const dirs: string[] = [];
  let strict = false;
  let json = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--strict') {
      strict = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--latest') {
      const latest = latestArtifactDir();
      if (latest) dirs.push(latest);
    } else if (arg === '--dir') {
      const next = argv[++i];
      if (!next) throw new Error('--dir requires a path');
      dirs.push(next);
    } else if (arg.startsWith('--dir=')) {
      dirs.push(arg.slice('--dir='.length));
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      dirs.push(arg);
    }
  }

  if (dirs.length === 0 && !help) {
    const latest = latestArtifactDir();
    if (latest) dirs.push(latest);
  }

  return { dirs, strict, json, help };
}

function printHelp(): void {
  console.log([
    'Usage: npm run check:dropped-frame-ears -- [--dir artifacts/perf/<capture>] [--strict] [--json]',
    '',
    'Classifies perf artifacts against the STABILIZAT-4 dropped-frame EARS criteria.',
    'Completion requires one passing Open Frontier artifact and one passing A Shau artifact.',
    'Without --dir, the latest artifacts/perf capture is evaluated.',
  ].join('\n'));
}

function printHumanReport(evaluation: DroppedFrameEarsEvaluation): void {
  console.log([
    `[ST4-EARS] overall=${evaluation.status}`,
    `required=${evaluation.requiredScenarios.join(',')}`,
    `passing=${evaluation.passingScenarios.join(',') || 'none'}`,
    `missing=${evaluation.missingScenarios.join(',') || 'none'}`,
  ].join(' '));

  for (const artifact of evaluation.artifacts) {
    console.log(`[ST4-EARS] ${artifact.artifactRelPath} scenario=${artifact.scenario ?? 'unknown'} classification=${artifact.classification} contact=${artifact.contactQualified ? 'qualified' : 'low'} materialization=${artifact.materializationQualified ? 'qualified' : 'thin'} fail=${artifact.failCount} warn=${artifact.warnCount}`);
    for (const check of artifact.checks.filter((entry) => entry.status !== 'pass')) {
      console.log(`  ${check.status.toUpperCase()} ${check.id}: ${check.message}`);
    }
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (options.dirs.length === 0) {
    throw new Error('No perf artifact directories found. Pass --dir artifacts/perf/<capture>.');
  }

  const evaluation = evaluateDroppedFrameEars(options.dirs);
  if (options.json) {
    console.log(JSON.stringify(evaluation, null, 2));
  } else {
    printHumanReport(evaluation);
  }

  if (options.strict && evaluation.status !== 'pass') {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
