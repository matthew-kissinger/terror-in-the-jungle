// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import {
  terrainStageBufferVisibleChanged,
  terrainStageRecord,
} from './perf-terrain-stage-classification';

export type PresentationGapContextEntry = {
  seq?: number;
  startAtMs?: number;
  endAtMs?: number;
  atMs?: number;
  gapMs: number;
  estimatedDropped60HzFrames: number;
  overBudget60HzMs?: number;
  droppedFrameTime60HzMs?: number;
  engineFrameCount?: number | null;
  wallAtMs?: number | null;
  visibilityState?: string | null;
  presentationContext?: Record<string, unknown> | null;
  harnessContext?: Record<string, unknown> | null;
  sampleTs?: string;
  sampleFrameCount?: number;
};

type SceneAttributionCategory = {
  category: string;
  visibleDrawCallLike: number;
  visibleTriangles: number;
  visibleInstances: number;
  visibleMeshes: number;
};

type RenderSubmissionCategory = {
  category: string;
  drawSubmissions: number;
  triangles: number;
  instances: number;
  materials: number;
  geometries: number;
  samples: number;
};

export type NumericStats = {
  count: number;
  total: number;
  avg: number;
  min: number;
  max: number;
};

export type PresentationGapSceneSummary = {
  source: 'runtime-scene-attribution' | 'final-scene-attribution';
  correlation: 'runtime-sampled' | 'run-final-uncorrelated';
  sceneSampleCount: number;
  categoryCount: number;
  visibleDrawCallLikeTotal: number;
  visibleTrianglesTotal: number;
  visibleInstancesTotal: number;
  topVisibleDrawCallLike: SceneAttributionCategory[];
  topVisibleTriangles: SceneAttributionCategory[];
};

export type PresentationGapMaterializationSummary = {
  gapCount: number;
  correlatedGapCount: number;
  closeModelStatsObservedCount: number;
  closeModelActiveGapCount: number;
  materializationEventGapCount: number;
  totalMaterializationEvents: number;
  renderSubmissionCorrelatedGapCount: number;
  droppedFrameTimeWithCloseModels60HzMs: number;
  droppedFrameTimeWithMaterializationEvents60HzMs: number;
  droppedFrameTimeByCloseModelActivity: Record<'active' | 'inactive' | 'missing', number>;
  nearestSampleDeltaMs?: NumericStats;
  candidatesWithinCloseRadius?: NumericStats;
  renderedCloseModels?: NumericStats;
  activeCloseModels?: NumericStats;
  fallbackCount?: NumericStats;
  poolLoads?: NumericStats;
  closeModelMs?: NumericStats;
  materializationEventsMs?: NumericStats;
  materializationEventsPerGap?: NumericStats;
  renderFrameDrawSubmissions?: NumericStats;
  renderFrameTriangles?: NumericStats;
  topRenderCategoriesByDrawSubmissions: RenderSubmissionCategory[];
  topRenderCategoriesByTriangles: RenderSubmissionCategory[];
};

export type PresentationGapTerrainSummary = {
  gapCount: number;
  droppedFrameTime60HzMs: number;
  overBudget60HzMs: number;
  lowClearanceThresholdMeters: number;
  byTerrainSyncSubmission: Record<string, number>;
  droppedFrameTimeByTerrainSyncSubmission: Record<string, number>;
  terrainBufferSubmittedCount: number;
  terrainSyncRecheckedCount: number;
  terrainSyncPoseStaleCount: number;
  terrainSyncProjectionChangedCount: number;
  terrainStageHashChangedCount: number;
  terrainStageIdentityHashChangedCount: number;
  terrainStageMorphHashChangedCount: number;
  terrainStageEdgeMaskHashChangedCount: number;
  terrainStageTileCountChangedCount: number;
  terrainStageBufferVisibleChangedCount: number;
  terrainStageBufferVisibleChangedWithoutSubmissionCount: number;
  terrainSelectionSaturatedCount: number;
  terrainNotReadyCount: number;
  lowClearanceCount: number;
  fireIntentCount: number;
  nonFireIntentCount: number;
  unknownFireIntentCount: number;
  tileCount?: NumericStats;
  morphingTiles?: NumericStats;
  edgeMorphTiles?: NumericStats;
  maxMorphFactor?: NumericStats;
  cameraClearanceMeters?: NumericStats;
  terrainSyncPositionDeltaMeters?: NumericStats;
  terrainSyncRotationDeltaDeg?: NumericStats;
  terrainRenderObservedCount: number;
  boundedShadowPassCount: number;
  byShadowPrefixCoverage: Record<string, number>;
  droppedFrameTimeByShadowPrefixCoverage: Record<string, number>;
  shadowPrefixInstances?: NumericStats;
  lastMainPassInstances?: NumericStats;
  lastShadowPassInstances?: NumericStats;
  shadowPrefixRatio?: NumericStats;
  renderSelectionMs?: NumericStats;
  renderUpdateInstancesMs?: NumericStats;
  mainTerrainTriangleEstimate?: NumericStats;
  mainTerrainInteriorTriangleEstimate?: NumericStats;
  mainTerrainFullSkirtTriangleEstimate?: NumericStats;
  edgeTransitionSkirtTriangleEstimate?: NumericStats;
  potentialSkirtTriangleSavingsEstimate?: NumericStats;
  potentialSkirtTriangleSavingsRatio?: NumericStats;
  shadowTerrainTriangleEstimate?: NumericStats;
  avgLodCounts: Record<string, number>;
  maxLodCounts: Record<string, number>;
  avgEdgeMorphMaskCounts: Record<string, number>;
  maxEdgeMorphMaskCounts: Record<string, number>;
};

export type PresentationGapContextSummary = {
  sampleCount: number;
  gapCount: number;
  maxGapMs: number;
  totalDroppedFrameTime60HzMs: number;
  totalOverBudget60HzMs: number;
  terrain?: PresentationGapTerrainSummary;
  scene?: PresentationGapSceneSummary;
  materialization?: PresentationGapMaterializationSummary;
  latest: PresentationGapContextEntry[];
};

export type PresentationGapSummaryOptions = {
  finalSceneAttribution?: unknown[] | null;
};

const LOW_CLEARANCE_THRESHOLD_METERS = 2.5;

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrZero(value: unknown): number {
  return finiteNumber(value) ?? 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function boolIsTrue(value: unknown): boolean {
  return value === true;
}

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function addByKey(totals: Record<string, number>, key: string, value: number): void {
  totals[key] = (totals[key] ?? 0) + value;
}

function pushFinite(target: number[], value: unknown): number | null {
  const parsed = finiteNumber(value);
  if (parsed !== null) {
    target.push(parsed);
  }
  return parsed;
}

function numericStats(values: number[]): NumericStats | undefined {
  if (values.length === 0) return undefined;
  let total = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    total += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return {
    count: values.length,
    total,
    avg: total / values.length,
    min,
    max,
  };
}

function normalizeSceneAttributionCategories(value: unknown): SceneAttributionCategory[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => objectOrNull(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      category: stringOrNull(entry.category) ?? 'unattributed',
      visibleDrawCallLike: numberOrZero(entry.visibleDrawCallLike ?? entry.drawCallLike),
      visibleTriangles: numberOrZero(entry.visibleTriangles ?? entry.triangles),
      visibleInstances: numberOrZero(entry.visibleInstances ?? entry.instances),
      visibleMeshes: numberOrZero(entry.visibleMeshes ?? entry.meshes),
    }))
    .filter((entry) =>
      entry.visibleDrawCallLike > 0
      || entry.visibleTriangles > 0
      || entry.visibleInstances > 0
      || entry.visibleMeshes > 0
    );
}

function normalizeRenderSubmissionCategories(value: unknown): RenderSubmissionCategory[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => objectOrNull(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      category: stringOrNull(entry.category) ?? 'unattributed',
      drawSubmissions: numberOrZero(entry.drawSubmissions),
      triangles: numberOrZero(entry.triangles),
      instances: numberOrZero(entry.instances),
      materials: numberOrZero(entry.materials),
      geometries: numberOrZero(entry.geometries),
      samples: 1,
    }))
    .filter((entry) =>
      entry.drawSubmissions > 0
      || entry.triangles > 0
      || entry.instances > 0
      || entry.materials > 0
      || entry.geometries > 0
    );
}

function mergeRenderSubmissionCategory(
  totals: Map<string, RenderSubmissionCategory>,
  category: RenderSubmissionCategory,
): void {
  const existing = totals.get(category.category);
  if (!existing) {
    totals.set(category.category, { ...category });
    return;
  }
  existing.drawSubmissions += category.drawSubmissions;
  existing.triangles += category.triangles;
  existing.instances += category.instances;
  existing.materials += category.materials;
  existing.geometries += category.geometries;
  existing.samples += category.samples;
}

function summarizeSceneCategories(
  categories: SceneAttributionCategory[],
  source: PresentationGapSceneSummary['source'],
  correlation: PresentationGapSceneSummary['correlation'],
  sceneSampleCount: number,
): PresentationGapSceneSummary | undefined {
  if (categories.length === 0) return undefined;
  return {
    source,
    correlation,
    sceneSampleCount,
    categoryCount: categories.length,
    visibleDrawCallLikeTotal: categories.reduce((sum, entry) => sum + entry.visibleDrawCallLike, 0),
    visibleTrianglesTotal: categories.reduce((sum, entry) => sum + entry.visibleTriangles, 0),
    visibleInstancesTotal: categories.reduce((sum, entry) => sum + entry.visibleInstances, 0),
    topVisibleDrawCallLike: categories
      .slice()
      .sort((a, b) =>
        b.visibleDrawCallLike - a.visibleDrawCallLike ||
        b.visibleTriangles - a.visibleTriangles
      )
      .slice(0, 8),
    topVisibleTriangles: categories
      .slice()
      .sort((a, b) =>
        b.visibleTriangles - a.visibleTriangles ||
        b.visibleDrawCallLike - a.visibleDrawCallLike
      )
      .slice(0, 8),
  };
}

function summarizeSceneContext(
  runtimeSamples: unknown[],
  options?: PresentationGapSummaryOptions,
): PresentationGapSceneSummary | undefined {
  const runtimeSceneSamples = runtimeSamples
    .map((sample) => objectOrNull(sample))
    .filter((sample): sample is Record<string, unknown> =>
      sample !== null && Array.isArray(sample.sceneAttribution)
    );
  const latestRuntimeScene = runtimeSceneSamples.at(-1);
  if (latestRuntimeScene) {
    return summarizeSceneCategories(
      normalizeSceneAttributionCategories(latestRuntimeScene.sceneAttribution),
      'runtime-scene-attribution',
      'runtime-sampled',
      runtimeSceneSamples.length,
    );
  }

  return summarizeSceneCategories(
    normalizeSceneAttributionCategories(options?.finalSceneAttribution),
    'final-scene-attribution',
    'run-final-uncorrelated',
    Array.isArray(options?.finalSceneAttribution) ? 1 : 0,
  );
}

function gapAnchorMs(gap: PresentationGapContextEntry): number | null {
  return finiteNumber(gap.endAtMs)
    ?? finiteNumber(gap.atMs)
    ?? finiteNumber(gap.startAtMs);
}

function runtimeSampleMs(sample: Record<string, unknown>): number | null {
  return finiteNumber(sample.pagePerformanceNowMs);
}

function closestRuntimeSample(
  runtimeSamples: Record<string, unknown>[],
  anchorMs: number | null,
): { sample: Record<string, unknown>; deltaMs: number } | null {
  if (anchorMs === null) return null;
  let best: { sample: Record<string, unknown>; deltaMs: number } | null = null;
  for (const sample of runtimeSamples) {
    const sampleMs = runtimeSampleMs(sample);
    if (sampleMs === null) continue;
    const deltaMs = Math.abs(sampleMs - anchorMs);
    if (!best || deltaMs < best.deltaMs) {
      best = { sample, deltaMs };
    }
  }
  return best;
}

function renderFrameAnchorMs(frame: Record<string, unknown>): number | null {
  const first = finiteNumber(frame.firstAtMs);
  const last = finiteNumber(frame.lastAtMs);
  if (first !== null && last !== null) return (first + last) / 2;
  return last ?? first;
}

function closestRenderSubmissionFrame(
  renderSubmissions: Record<string, unknown> | null,
  anchorMs: number | null,
): Record<string, unknown> | null {
  const frames = Array.isArray(renderSubmissions?.frames) ? renderSubmissions.frames : [];
  if (frames.length === 0) return null;
  let best: { frame: Record<string, unknown>; deltaMs: number } | null = null;
  for (const frameValue of frames) {
    const frame = objectOrNull(frameValue);
    if (!frame) continue;
    const frameMs = renderFrameAnchorMs(frame);
    const deltaMs = anchorMs !== null && frameMs !== null ? Math.abs(frameMs - anchorMs) : 0;
    if (!best || deltaMs < best.deltaMs) {
      best = { frame, deltaMs };
    }
  }
  return best?.frame ?? null;
}

function summarizeMaterializationGaps(
  gaps: PresentationGapContextEntry[],
  runtimeSamples: unknown[],
): PresentationGapMaterializationSummary | undefined {
  const samples = runtimeSamples
    .map((sample) => objectOrNull(sample))
    .filter((sample): sample is Record<string, unknown> =>
      sample !== null && runtimeSampleMs(sample) !== null
    );
  if (gaps.length === 0 || samples.length === 0) return undefined;

  let correlatedGapCount = 0;
  let closeModelStatsObservedCount = 0;
  let closeModelActiveGapCount = 0;
  let materializationEventGapCount = 0;
  let totalMaterializationEvents = 0;
  let renderSubmissionCorrelatedGapCount = 0;
  let droppedFrameTimeWithCloseModels60HzMs = 0;
  let droppedFrameTimeWithMaterializationEvents60HzMs = 0;
  const droppedFrameTimeByCloseModelActivity: Record<'active' | 'inactive' | 'missing', number> = {
    active: 0,
    inactive: 0,
    missing: 0,
  };
  const nearestSampleDeltas: number[] = [];
  const candidatesWithinCloseRadius: number[] = [];
  const renderedCloseModels: number[] = [];
  const activeCloseModels: number[] = [];
  const fallbackCounts: number[] = [];
  const poolLoads: number[] = [];
  const closeModelMs: number[] = [];
  const materializationEventsMs: number[] = [];
  const materializationEventsPerGap: number[] = [];
  const renderFrameDrawSubmissions: number[] = [];
  const renderFrameTriangles: number[] = [];
  const renderCategoryTotals = new Map<string, RenderSubmissionCategory>();

  for (const gap of gaps) {
    const anchorMs = gapAnchorMs(gap);
    const nearest = closestRuntimeSample(samples, anchorMs);
    if (!nearest) continue;
    correlatedGapCount++;
    nearestSampleDeltas.push(nearest.deltaMs);
    const sample = nearest.sample;
    const gapDropped = numberOrZero(gap.droppedFrameTime60HzMs);

    const closeStats = objectOrNull(sample.closeModelStats);
    if (closeStats) {
      closeModelStatsObservedCount++;
      const active = pushFinite(activeCloseModels, closeStats.activeCloseModels) ?? 0;
      pushFinite(candidatesWithinCloseRadius, closeStats.candidatesWithinCloseRadius);
      pushFinite(renderedCloseModels, closeStats.renderedCloseModels);
      pushFinite(fallbackCounts, closeStats.fallbackCount);
      pushFinite(poolLoads, closeStats.poolLoads);
      if (active > 0) {
        closeModelActiveGapCount++;
        droppedFrameTimeWithCloseModels60HzMs += gapDropped;
        droppedFrameTimeByCloseModelActivity.active += gapDropped;
      } else {
        droppedFrameTimeByCloseModelActivity.inactive += gapDropped;
      }
    } else {
      droppedFrameTimeByCloseModelActivity.missing += gapDropped;
    }

    const events = Array.isArray(sample.materializationTierEvents)
      ? sample.materializationTierEvents
      : [];
    const transitionWindow = objectOrNull(closeStats?.transitionWindow);
    const transitionWindowEventCount = Math.max(0, numberOrZero(transitionWindow?.total));
    const eventCount = Math.max(events.length, transitionWindowEventCount);
    materializationEventsPerGap.push(eventCount);
    totalMaterializationEvents += eventCount;
    if (eventCount > 0) {
      materializationEventGapCount++;
      droppedFrameTimeWithMaterializationEvents60HzMs += gapDropped;
    }

    const combatBreakdown = objectOrNull(sample.combatBreakdown);
    const billboardProfile = objectOrNull(combatBreakdown?.billboardProfile);
    pushFinite(closeModelMs, billboardProfile?.closeModelMs);
    pushFinite(materializationEventsMs, billboardProfile?.materializationEventsMs);

    const renderSubmissions = objectOrNull(sample.renderSubmissions);
    const renderFrame = closestRenderSubmissionFrame(renderSubmissions, anchorMs);
    if (renderFrame) {
      renderSubmissionCorrelatedGapCount++;
      pushFinite(renderFrameDrawSubmissions, renderFrame.drawSubmissions);
      pushFinite(renderFrameTriangles, renderFrame.triangles);
      for (const category of normalizeRenderSubmissionCategories(renderFrame.categories)) {
        mergeRenderSubmissionCategory(renderCategoryTotals, category);
      }
    }
  }

  if (correlatedGapCount === 0) return undefined;

  const categories = Array.from(renderCategoryTotals.values());
  return {
    gapCount: gaps.length,
    correlatedGapCount,
    closeModelStatsObservedCount,
    closeModelActiveGapCount,
    materializationEventGapCount,
    totalMaterializationEvents,
    renderSubmissionCorrelatedGapCount,
    droppedFrameTimeWithCloseModels60HzMs,
    droppedFrameTimeWithMaterializationEvents60HzMs,
    droppedFrameTimeByCloseModelActivity,
    nearestSampleDeltaMs: numericStats(nearestSampleDeltas),
    candidatesWithinCloseRadius: numericStats(candidatesWithinCloseRadius),
    renderedCloseModels: numericStats(renderedCloseModels),
    activeCloseModels: numericStats(activeCloseModels),
    fallbackCount: numericStats(fallbackCounts),
    poolLoads: numericStats(poolLoads),
    closeModelMs: numericStats(closeModelMs),
    materializationEventsMs: numericStats(materializationEventsMs),
    materializationEventsPerGap: numericStats(materializationEventsPerGap),
    renderFrameDrawSubmissions: numericStats(renderFrameDrawSubmissions),
    renderFrameTriangles: numericStats(renderFrameTriangles),
    topRenderCategoriesByDrawSubmissions: categories
      .slice()
      .sort((a, b) => b.drawSubmissions - a.drawSubmissions || b.triangles - a.triangles)
      .slice(0, 8),
    topRenderCategoriesByTriangles: categories
      .slice()
      .sort((a, b) => b.triangles - a.triangles || b.drawSubmissions - a.drawSubmissions)
      .slice(0, 8),
  };
}

function normalizeFinalPresentationGap(entry: Record<string, unknown>): PresentationGapContextEntry | null {
  const gapMs = finiteNumber(entry.gapMs);
  if (gapMs === null || gapMs <= 0) return null;
  return {
    seq: finiteNumber(entry.seq) ?? undefined,
    startAtMs: finiteNumber(entry.startAtMs) ?? undefined,
    endAtMs: finiteNumber(entry.endAtMs) ?? undefined,
    gapMs,
    estimatedDropped60HzFrames: numberOrZero(entry.estimatedDropped60HzFrames),
    overBudget60HzMs: numberOrZero(entry.overBudget60HzMs),
    droppedFrameTime60HzMs: numberOrZero(entry.droppedFrameTime60HzMs),
    engineFrameCount: finiteNumber(entry.engineFrameCount),
    wallAtMs: finiteNumber(entry.wallAtMs),
    visibilityState: typeof entry.visibilityState === 'string' ? entry.visibilityState : null,
    presentationContext: objectOrNull(entry.presentationContext),
    harnessContext: objectOrNull(entry.harnessContext),
  };
}

function normalizeRuntimeRafGap(
  entry: Record<string, unknown>,
  sample: Record<string, unknown>,
): PresentationGapContextEntry | null {
  const gapMs = finiteNumber(entry.gapMs);
  if (gapMs === null || gapMs <= 0) return null;
  return {
    atMs: numberOrZero(entry.atMs),
    gapMs,
    estimatedDropped60HzFrames: numberOrZero(entry.estimatedDropped60HzFrames),
    overBudget60HzMs: numberOrZero(entry.overBudget60HzMs),
    droppedFrameTime60HzMs: numberOrZero(entry.droppedFrameTime60HzMs),
    presentationContext: objectOrNull(entry.presentationContext),
    harnessContext: objectOrNull(entry.harnessContext),
    sampleTs: typeof sample.ts === 'string' ? sample.ts : undefined,
    sampleFrameCount: finiteNumber(sample.frameCount) ?? undefined,
  };
}

function extractRuntimeRafEntries(sample: Record<string, unknown>): Record<string, unknown>[] {
  const browserStalls = objectOrNull(sample.browserStalls);
  const recent = objectOrNull(browserStalls?.recent);
  const rafCadence = objectOrNull(recent?.rafCadence);
  const entries = rafCadence?.entries;
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => objectOrNull(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function addLodCounts(
  lodCounts: Record<string, unknown> | null,
  totals: Record<string, number>,
  maxes: Record<string, number>,
): void {
  if (!lodCounts) return;
  for (const [lod, value] of Object.entries(lodCounts)) {
    const count = finiteNumber(value);
    if (count === null) continue;
    totals[lod] = (totals[lod] ?? 0) + count;
    maxes[lod] = Math.max(maxes[lod] ?? 0, count);
  }
}

function addStringNumberCounts(
  counts: Record<string, unknown> | null,
  totals: Record<string, number>,
  maxes: Record<string, number>,
): void {
  if (!counts) return;
  for (const [key, value] of Object.entries(counts)) {
    const count = finiteNumber(value);
    if (count === null) continue;
    totals[key] = (totals[key] ?? 0) + count;
    maxes[key] = Math.max(maxes[key] ?? 0, count);
  }
}

function countMaskBits(value: number): number {
  const mask = Math.max(0, Math.trunc(value));
  let bits = 0;
  for (let bit = 1; bit <= 8; bit <<= 1) {
    if ((mask & bit) !== 0) bits += 1;
  }
  return bits;
}

function countEdgeMorphEdges(edgeMorphMaskCounts: Record<string, unknown> | null): number {
  if (!edgeMorphMaskCounts) return 0;
  let edges = 0;
  for (const [maskKey, value] of Object.entries(edgeMorphMaskCounts)) {
    const mask = finiteNumber(maskKey);
    const count = finiteNumber(value);
    if (mask === null || count === null) continue;
    edges += countMaskBits(mask) * count;
  }
  return edges;
}

function classifyShadowPrefixCoverage(
  terrainRender: Record<string, unknown> | null,
): string {
  if (!terrainRender) return 'missing';
  if (terrainRender.boundedShadowPassEnabled === false) return 'unbounded';

  const ratio = finiteNumber(terrainRender.shadowPrefixRatio);
  if (ratio === null) return 'unknown';
  if (ratio <= 0) return 'none';
  if (ratio < 0.35) return 'low';
  if (ratio < 0.7) return 'medium';
  return 'high';
}

function summarizeTerrainGaps(gaps: PresentationGapContextEntry[]): PresentationGapTerrainSummary | undefined {
  let gapCount = 0;
  let droppedFrameTime60HzMs = 0;
  let overBudget60HzMs = 0;
  const byTerrainSyncSubmission: Record<string, number> = {};
  const droppedFrameTimeByTerrainSyncSubmission: Record<string, number> = {};
  let terrainBufferSubmittedCount = 0;
  let terrainSyncRecheckedCount = 0;
  let terrainSyncPoseStaleCount = 0;
  let terrainSyncProjectionChangedCount = 0;
  let terrainStageHashChangedCount = 0;
  let terrainStageIdentityHashChangedCount = 0;
  let terrainStageMorphHashChangedCount = 0;
  let terrainStageEdgeMaskHashChangedCount = 0;
  let terrainStageTileCountChangedCount = 0;
  let terrainStageBufferVisibleChangedCount = 0;
  let terrainStageBufferVisibleChangedWithoutSubmissionCount = 0;
  let terrainSelectionSaturatedCount = 0;
  let terrainNotReadyCount = 0;
  let lowClearanceCount = 0;
  let fireIntentCount = 0;
  let nonFireIntentCount = 0;
  let unknownFireIntentCount = 0;
  let terrainRenderObservedCount = 0;
  let boundedShadowPassCount = 0;
  const byShadowPrefixCoverage: Record<string, number> = {};
  const droppedFrameTimeByShadowPrefixCoverage: Record<string, number> = {};
  const tileCounts: number[] = [];
  const morphingTiles: number[] = [];
  const edgeMorphTiles: number[] = [];
  const maxMorphFactors: number[] = [];
  const cameraClearances: number[] = [];
  const terrainSyncPositionDeltas: number[] = [];
  const terrainSyncRotationDeltas: number[] = [];
  const shadowPrefixInstances: number[] = [];
  const lastMainPassInstances: number[] = [];
  const lastShadowPassInstances: number[] = [];
  const shadowPrefixRatios: number[] = [];
  const renderSelectionMs: number[] = [];
  const renderUpdateInstancesMs: number[] = [];
  const mainTerrainTriangleEstimates: number[] = [];
  const mainTerrainInteriorTriangleEstimates: number[] = [];
  const mainTerrainFullSkirtTriangleEstimates: number[] = [];
  const edgeTransitionSkirtTriangleEstimates: number[] = [];
  const potentialSkirtTriangleSavingsEstimates: number[] = [];
  const potentialSkirtTriangleSavingsRatios: number[] = [];
  const shadowTerrainTriangleEstimates: number[] = [];
  const lodTotals: Record<string, number> = {};
  const lodMaxes: Record<string, number> = {};
  const edgeMorphMaskTotals: Record<string, number> = {};
  const edgeMorphMaskMaxes: Record<string, number> = {};

  for (const gap of gaps) {
    const presentationContext = objectOrNull(gap.presentationContext);
    const terrain = objectOrNull(presentationContext?.terrain);
    const terrainRender = objectOrNull(presentationContext?.terrainRender);
    const terrainSync = objectOrNull(presentationContext?.terrainSync);
    const terrainByStage = objectOrNull(presentationContext?.terrainByStage);
    const afterSimulation = terrainStageRecord(terrainByStage, 'after-simulation');
    const beforeRender = terrainStageRecord(terrainByStage, 'before-render');
    const harnessContext = objectOrNull(gap.harnessContext);
    if (!presentationContext && !terrain && !terrainRender && !terrainSync && !terrainByStage && !harnessContext) {
      continue;
    }

    gapCount++;
    const gapDropped = numberOrZero(gap.droppedFrameTime60HzMs);
    const gapOverBudget = numberOrZero(gap.overBudget60HzMs);
    droppedFrameTime60HzMs += gapDropped;
    overBudget60HzMs += gapOverBudget;

    const submissionClassification = stringOrNull(terrainSync?.submissionClassification)
      ?? (terrainSync ? 'none' : 'missing');
    incrementCount(byTerrainSyncSubmission, submissionClassification);
    addByKey(droppedFrameTimeByTerrainSyncSubmission, submissionClassification, gapDropped);

    if (boolIsTrue(terrainSync?.terrainBufferSubmitted)) terrainBufferSubmittedCount++;
    if (boolIsTrue(terrainSync?.selectionRechecked)) terrainSyncRecheckedCount++;
    if (boolIsTrue(terrainSync?.poseWasStale)) terrainSyncPoseStaleCount++;
    if (boolIsTrue(terrainSync?.projectionChanged)) terrainSyncProjectionChangedCount++;
    pushFinite(terrainSyncPositionDeltas, terrainSync?.positionDeltaMeters);
    pushFinite(terrainSyncRotationDeltas, terrainSync?.rotationDeltaDeg);

    const shadowCoverageClass = classifyShadowPrefixCoverage(terrainRender);
    incrementCount(byShadowPrefixCoverage, shadowCoverageClass);
    addByKey(droppedFrameTimeByShadowPrefixCoverage, shadowCoverageClass, gapDropped);
    if (terrainRender) {
      terrainRenderObservedCount++;
      if (terrainRender.boundedShadowPassEnabled === true) boundedShadowPassCount++;
      pushFinite(shadowPrefixInstances, terrainRender.shadowPrefixInstances);
      pushFinite(lastMainPassInstances, terrainRender.lastMainPassInstances);
      pushFinite(lastShadowPassInstances, terrainRender.lastShadowPassInstances);
      pushFinite(shadowPrefixRatios, terrainRender.shadowPrefixRatio);
      pushFinite(renderSelectionMs, terrainRender.lastSelectionMs);
      pushFinite(renderUpdateInstancesMs, terrainRender.lastUpdateInstancesMs);
    }

    const afterHash = stringOrNull(afterSimulation?.tileHash);
    const beforeHash = stringOrNull(beforeRender?.tileHash);
    if (afterHash !== null && beforeHash !== null && afterHash !== beforeHash) {
      terrainStageHashChangedCount++;
    }
    const afterIdentityHash = stringOrNull(afterSimulation?.tileIdentityHash);
    const beforeIdentityHash = stringOrNull(beforeRender?.tileIdentityHash);
    let identityChanged = false;
    if (
      afterIdentityHash !== null
      && beforeIdentityHash !== null
      && afterIdentityHash !== beforeIdentityHash
    ) {
      identityChanged = true;
      terrainStageIdentityHashChangedCount++;
    }
    const afterMorphHash = stringOrNull(afterSimulation?.morphHash);
    const beforeMorphHash = stringOrNull(beforeRender?.morphHash);
    if (afterMorphHash !== null && beforeMorphHash !== null && afterMorphHash !== beforeMorphHash) {
      terrainStageMorphHashChangedCount++;
    }
    const afterEdgeMaskHash = stringOrNull(afterSimulation?.edgeMaskHash);
    const beforeEdgeMaskHash = stringOrNull(beforeRender?.edgeMaskHash);
    let edgeMaskChanged = false;
    if (
      afterEdgeMaskHash !== null
      && beforeEdgeMaskHash !== null
      && afterEdgeMaskHash !== beforeEdgeMaskHash
    ) {
      edgeMaskChanged = true;
      terrainStageEdgeMaskHashChangedCount++;
    }
    const afterTileCount = finiteNumber(afterSimulation?.tileCount);
    const beforeTileCount = finiteNumber(beforeRender?.tileCount);
    let tileCountChanged = false;
    if (afterTileCount !== null && beforeTileCount !== null && afterTileCount !== beforeTileCount) {
      tileCountChanged = true;
      terrainStageTileCountChangedCount++;
    }
    const bufferVisibleChanged = terrainStageBufferVisibleChanged(terrainByStage)
      || identityChanged
      || edgeMaskChanged
      || tileCountChanged;
    if (bufferVisibleChanged) {
      terrainStageBufferVisibleChangedCount++;
      if (terrainSync && !boolIsTrue(terrainSync.terrainBufferSubmitted)) {
        terrainStageBufferVisibleChangedWithoutSubmissionCount++;
      }
    }

    if (boolIsTrue(terrain?.tileSelectionSaturated)) terrainSelectionSaturatedCount++;
    pushFinite(tileCounts, terrain?.tileCount);
    pushFinite(morphingTiles, terrain?.morphingTiles);
    pushFinite(edgeMorphTiles, terrain?.edgeMorphTiles);
    pushFinite(maxMorphFactors, terrain?.maxMorphFactor);
    addLodCounts(objectOrNull(terrain?.lodCounts), lodTotals, lodMaxes);
    const edgeMorphMaskCounts = objectOrNull(terrain?.edgeMorphMaskCounts);
    addStringNumberCounts(edgeMorphMaskCounts, edgeMorphMaskTotals, edgeMorphMaskMaxes);

    const tileCount = finiteNumber(terrain?.tileCount);
    const tileInteriorTriangles = finiteNumber(terrainRender?.tileInteriorTriangles);
    const tileSkirtTriangles = finiteNumber(terrainRender?.tileSkirtTriangles);
    const tileSkirtTrianglesPerEdge = finiteNumber(terrainRender?.tileSkirtTrianglesPerEdge);
    const tileTotalTriangles = finiteNumber(terrainRender?.tileTotalTriangles);
    const tileFullSkirtTriangles = finiteNumber(terrainRender?.tileFullSkirtTriangles)
      ?? tileSkirtTriangles;
    const lastMainPassEdgeSkirtInstances = finiteNumber(terrainRender?.lastMainPassEdgeSkirtInstances);
    const lastMainPassTriangleEstimate = finiteNumber(terrainRender?.lastMainPassTriangleEstimate);
    const lastShadowPassTriangleEstimate = finiteNumber(terrainRender?.lastShadowPassTriangleEstimate);
    if (
      tileCount !== null
      && tileInteriorTriangles !== null
      && tileSkirtTriangles !== null
      && tileSkirtTrianglesPerEdge !== null
      && tileTotalTriangles !== null
      && tileFullSkirtTriangles !== null
    ) {
      const interiorTriangles = tileCount * tileInteriorTriangles;
      const fullSkirtTriangles = tileCount * tileFullSkirtTriangles;
      const fallbackFullTriangles = tileCount * tileTotalTriangles;
      const edgeTransitionSkirtTriangles = (
        lastMainPassEdgeSkirtInstances !== null
          ? lastMainPassEdgeSkirtInstances
          : countEdgeMorphEdges(edgeMorphMaskCounts)
      ) * tileSkirtTrianglesPerEdge;
      const mainTriangles = lastMainPassTriangleEstimate ?? fallbackFullTriangles;
      const potentialSkirtSavings = Math.max(0, fullSkirtTriangles - edgeTransitionSkirtTriangles);
      mainTerrainInteriorTriangleEstimates.push(interiorTriangles);
      mainTerrainFullSkirtTriangleEstimates.push(fullSkirtTriangles);
      mainTerrainTriangleEstimates.push(mainTriangles);
      edgeTransitionSkirtTriangleEstimates.push(edgeTransitionSkirtTriangles);
      potentialSkirtTriangleSavingsEstimates.push(potentialSkirtSavings);
      if (mainTriangles > 0) {
        potentialSkirtTriangleSavingsRatios.push(potentialSkirtSavings / mainTriangles);
      }
    }

    const shadowInstances = finiteNumber(terrainRender?.lastShadowPassInstances);
    if (lastShadowPassTriangleEstimate !== null) {
      shadowTerrainTriangleEstimates.push(lastShadowPassTriangleEstimate);
    } else if (shadowInstances !== null && tileTotalTriangles !== null) {
      shadowTerrainTriangleEstimates.push(shadowInstances * tileTotalTriangles);
    }

    const cameraSample = objectOrNull(terrain?.cameraSample);
    const clearance = pushFinite(cameraClearances, cameraSample?.clearanceMeters);
    if (clearance !== null && clearance < LOW_CLEARANCE_THRESHOLD_METERS) {
      lowClearanceCount++;
    }
    if (cameraSample?.hasTerrain === false || cameraSample?.areaReady === false) {
      terrainNotReadyCount++;
    }

    if (harnessContext?.lastFireIntent === true) {
      fireIntentCount++;
    } else if (harnessContext?.lastFireIntent === false) {
      nonFireIntentCount++;
    } else {
      unknownFireIntentCount++;
    }
  }

  if (gapCount === 0) return undefined;

  const avgLodCounts: Record<string, number> = {};
  for (const [lod, total] of Object.entries(lodTotals)) {
    avgLodCounts[lod] = total / gapCount;
  }
  const avgEdgeMorphMaskCounts: Record<string, number> = {};
  for (const [mask, total] of Object.entries(edgeMorphMaskTotals)) {
    avgEdgeMorphMaskCounts[mask] = total / gapCount;
  }

  return {
    gapCount,
    droppedFrameTime60HzMs,
    overBudget60HzMs,
    lowClearanceThresholdMeters: LOW_CLEARANCE_THRESHOLD_METERS,
    byTerrainSyncSubmission,
    droppedFrameTimeByTerrainSyncSubmission,
    terrainBufferSubmittedCount,
    terrainSyncRecheckedCount,
    terrainSyncPoseStaleCount,
    terrainSyncProjectionChangedCount,
    terrainStageHashChangedCount,
    terrainStageIdentityHashChangedCount,
    terrainStageMorphHashChangedCount,
    terrainStageEdgeMaskHashChangedCount,
    terrainStageTileCountChangedCount,
    terrainStageBufferVisibleChangedCount,
    terrainStageBufferVisibleChangedWithoutSubmissionCount,
    terrainSelectionSaturatedCount,
    terrainNotReadyCount,
    lowClearanceCount,
    fireIntentCount,
    nonFireIntentCount,
    unknownFireIntentCount,
    tileCount: numericStats(tileCounts),
    morphingTiles: numericStats(morphingTiles),
    edgeMorphTiles: numericStats(edgeMorphTiles),
    maxMorphFactor: numericStats(maxMorphFactors),
    cameraClearanceMeters: numericStats(cameraClearances),
    terrainSyncPositionDeltaMeters: numericStats(terrainSyncPositionDeltas),
    terrainSyncRotationDeltaDeg: numericStats(terrainSyncRotationDeltas),
    terrainRenderObservedCount,
    boundedShadowPassCount,
    byShadowPrefixCoverage,
    droppedFrameTimeByShadowPrefixCoverage,
    shadowPrefixInstances: numericStats(shadowPrefixInstances),
    lastMainPassInstances: numericStats(lastMainPassInstances),
    lastShadowPassInstances: numericStats(lastShadowPassInstances),
    shadowPrefixRatio: numericStats(shadowPrefixRatios),
    renderSelectionMs: numericStats(renderSelectionMs),
    renderUpdateInstancesMs: numericStats(renderUpdateInstancesMs),
    mainTerrainTriangleEstimate: numericStats(mainTerrainTriangleEstimates),
    mainTerrainInteriorTriangleEstimate: numericStats(mainTerrainInteriorTriangleEstimates),
    mainTerrainFullSkirtTriangleEstimate: numericStats(mainTerrainFullSkirtTriangleEstimates),
    edgeTransitionSkirtTriangleEstimate: numericStats(edgeTransitionSkirtTriangleEstimates),
    potentialSkirtTriangleSavingsEstimate: numericStats(potentialSkirtTriangleSavingsEstimates),
    potentialSkirtTriangleSavingsRatio: numericStats(potentialSkirtTriangleSavingsRatios),
    shadowTerrainTriangleEstimate: numericStats(shadowTerrainTriangleEstimates),
    avgLodCounts,
    maxLodCounts: lodMaxes,
    avgEdgeMorphMaskCounts,
    maxEdgeMorphMaskCounts: edgeMorphMaskMaxes,
  };
}

export function summarizePresentationGapContexts(
  runtimeSamples: unknown[],
  finalPresentationEpochs: Record<string, unknown>[] = [],
  options?: PresentationGapSummaryOptions,
): PresentationGapContextSummary | undefined {
  const gaps: PresentationGapContextEntry[] = [];

  for (const entry of finalPresentationEpochs) {
    const gap = normalizeFinalPresentationGap(entry);
    if (gap) gaps.push(gap);
  }

  if (gaps.length === 0) {
    for (const sampleValue of runtimeSamples) {
      const sample = objectOrNull(sampleValue);
      if (!sample) continue;
      for (const entry of extractRuntimeRafEntries(sample)) {
        const gap = normalizeRuntimeRafGap(entry, sample);
        if (gap) gaps.push(gap);
      }
    }
  }

  if (gaps.length === 0) {
    return undefined;
  }

  const latest = gaps
    .slice()
    .sort((a, b) => {
      const aSeq = Number(a.seq ?? -1);
      const bSeq = Number(b.seq ?? -1);
      if (aSeq !== bSeq) return aSeq - bSeq;
      return Number(a.endAtMs ?? a.atMs ?? 0) - Number(b.endAtMs ?? b.atMs ?? 0);
    })
    .slice(-32);

  return {
    sampleCount: runtimeSamples.length,
    gapCount: gaps.length,
    maxGapMs: gaps.reduce((max, entry) => Math.max(max, entry.gapMs), 0),
    totalDroppedFrameTime60HzMs: gaps.reduce(
      (total, entry) => total + numberOrZero(entry.droppedFrameTime60HzMs),
      0,
    ),
    totalOverBudget60HzMs: gaps.reduce(
      (total, entry) => total + numberOrZero(entry.overBudget60HzMs),
      0,
    ),
    terrain: summarizeTerrainGaps(gaps),
    scene: summarizeSceneContext(runtimeSamples, options),
    materialization: summarizeMaterializationGaps(gaps, runtimeSamples),
    latest,
  };
}
