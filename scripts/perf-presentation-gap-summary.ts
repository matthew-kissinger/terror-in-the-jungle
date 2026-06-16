// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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

export type NumericStats = {
  count: number;
  total: number;
  avg: number;
  min: number;
  max: number;
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
  terrainStageTileCountChangedCount: number;
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
  avgLodCounts: Record<string, number>;
  maxLodCounts: Record<string, number>;
};

export type PresentationGapContextSummary = {
  sampleCount: number;
  gapCount: number;
  maxGapMs: number;
  totalDroppedFrameTime60HzMs: number;
  totalOverBudget60HzMs: number;
  terrain?: PresentationGapTerrainSummary;
  latest: PresentationGapContextEntry[];
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
  let terrainStageTileCountChangedCount = 0;
  let terrainSelectionSaturatedCount = 0;
  let terrainNotReadyCount = 0;
  let lowClearanceCount = 0;
  let fireIntentCount = 0;
  let nonFireIntentCount = 0;
  let unknownFireIntentCount = 0;
  const tileCounts: number[] = [];
  const morphingTiles: number[] = [];
  const edgeMorphTiles: number[] = [];
  const maxMorphFactors: number[] = [];
  const cameraClearances: number[] = [];
  const terrainSyncPositionDeltas: number[] = [];
  const terrainSyncRotationDeltas: number[] = [];
  const lodTotals: Record<string, number> = {};
  const lodMaxes: Record<string, number> = {};

  for (const gap of gaps) {
    const presentationContext = objectOrNull(gap.presentationContext);
    const terrain = objectOrNull(presentationContext?.terrain);
    const terrainSync = objectOrNull(presentationContext?.terrainSync);
    const terrainByStage = objectOrNull(presentationContext?.terrainByStage);
    const afterSimulation = objectOrNull(terrainByStage?.['after-simulation']);
    const beforeRender = objectOrNull(terrainByStage?.['before-render']);
    const harnessContext = objectOrNull(gap.harnessContext);
    if (!presentationContext && !terrain && !terrainSync && !terrainByStage && !harnessContext) {
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

    const afterHash = stringOrNull(afterSimulation?.tileHash);
    const beforeHash = stringOrNull(beforeRender?.tileHash);
    if (afterHash !== null && beforeHash !== null && afterHash !== beforeHash) {
      terrainStageHashChangedCount++;
    }
    const afterTileCount = finiteNumber(afterSimulation?.tileCount);
    const beforeTileCount = finiteNumber(beforeRender?.tileCount);
    if (afterTileCount !== null && beforeTileCount !== null && afterTileCount !== beforeTileCount) {
      terrainStageTileCountChangedCount++;
    }

    if (boolIsTrue(terrain?.tileSelectionSaturated)) terrainSelectionSaturatedCount++;
    pushFinite(tileCounts, terrain?.tileCount);
    pushFinite(morphingTiles, terrain?.morphingTiles);
    pushFinite(edgeMorphTiles, terrain?.edgeMorphTiles);
    pushFinite(maxMorphFactors, terrain?.maxMorphFactor);
    addLodCounts(objectOrNull(terrain?.lodCounts), lodTotals, lodMaxes);

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
    terrainStageTileCountChangedCount,
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
    avgLodCounts,
    maxLodCounts: lodMaxes,
  };
}

export function summarizePresentationGapContexts(
  runtimeSamples: unknown[],
  finalPresentationEpochs: Record<string, unknown>[] = [],
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
    latest,
  };
}
