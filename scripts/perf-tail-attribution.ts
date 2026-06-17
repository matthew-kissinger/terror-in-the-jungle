// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * combat-p99-tail-attribution (DEFEKT-3, L1)
 *
 * Per-method attribution of the single worst-p99 sample window, computed from
 * the timers a `perf:capture` run already records (`combatBreakdown` +
 * `systemTop`). Additive + read-only against the engine — no extra per-frame
 * cost. Extracted into its own module so it is unit-testable without importing
 * `perf-capture.ts` (which runs a real capture on import).
 *
 * The returned object IS the proof for "where is the tail frame's time?" from a
 * single capture, no baseline required:
 *
 *  - `coverSearch.totalCoverMs` ≈0 confirms DEFEKT-3's first clause (the
 *    synchronous cover search no longer dominates p99): the search is wired
 *    O(1), triple-capped, and off the hot path.
 *  - `combat.unattributedMs` = the Combat-phase total minus its named children,
 *    where the NPC contour terrain-stall movement cost hides (movement is billed
 *    to the Combat phase but not to a named aiMethodMs timer). Paired with the
 *    `state.advancing` entry in `topAiStates`.
 *  - `combatVsOther` splits the worst frame into the Combat system's sampled
 *    cost vs the remaining frame budget, while also preserving the top named
 *    non-combat systems. Do not treat the residual as renderer-only: it can
 *    include Player, World, browser/GPU work, or uninstrumented engine time.
 */

/** Minimal shape of a runtime sample this attribution consumes. */
export interface TailAttributionSample {
  ts: string;
  frameCount: number;
  avgFrameMs?: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  renderSubmissions?: {
    mode?: string;
    frameCountStart?: number | null;
    frameCountEnd?: number | null;
    frames?: Array<{
      frameCount: number;
      drawSubmissions: number;
      triangles: number;
      instances: number;
      passTypes?: Record<string, number>;
      categories?: Array<{
        category: string;
        drawSubmissions: number;
        triangles: number;
        instances: number;
        meshes: number;
        materials: number;
        geometries: number;
        passTypes?: Record<string, number>;
        topOwners?: Array<{
          ownerKey: string;
          ownerLabel: string;
          ownerType: string | null;
          drawSubmissions: number;
          triangles: number;
          instances: number;
          meshes: number;
        }>;
        examples?: Array<{
          nameChain: string;
          type: string;
          modelPath: string | null;
          ownerKey?: string | null;
          ownerLabel?: string | null;
          ownerType?: string | null;
          materialType: string | null;
          passType?: string;
          triangles: number;
          instances: number;
        }>;
      }>;
    }>;
    totals?: Array<{
      category: string;
      drawSubmissions: number;
      triangles: number;
      instances: number;
      meshes: number;
      materials: number;
      geometries: number;
      passTypes?: Record<string, number>;
      topOwners?: Array<{
        ownerKey: string;
        ownerLabel: string;
        ownerType: string | null;
        drawSubmissions: number;
        triangles: number;
        instances: number;
        meshes: number;
      }>;
      examples?: Array<{
        nameChain: string;
        type: string;
        modelPath: string | null;
        ownerKey?: string | null;
        ownerLabel?: string | null;
        ownerType?: string | null;
        materialType: string | null;
        passType?: string;
        triangles: number;
        instances: number;
      }>;
    }>;
    errors?: string[];
  } | null;
  renderSubmissionError?: string | null;
  sceneAttribution?: Array<{
    category: string;
    visibleDrawCallLike?: number;
    drawCallLike?: number;
    visibleTriangles?: number;
    triangles?: number;
    visibleInstances?: number;
    instances?: number;
    visibleMeshes?: number;
    meshes?: number;
  }> | null;
  sceneAttributionError?: string | null;
  browserStalls?: {
    recent?: {
      rafCadence?: {
        entries?: Array<{
          atMs?: number;
          gapMs: number;
          estimatedDropped60HzFrames?: number;
          overBudget60HzMs?: number;
          droppedFrameTime60HzMs?: number;
          presentationContext?: Record<string, unknown> | null;
          harnessContext?: Record<string, unknown> | null;
        }>;
      };
    };
  };
  loopFrameBreakdown?: Array<{
    frameCount: number | null;
    timestampDeltaMs: number;
    callbackDurationMs: number;
    segmentTotalMs: number;
    unmeasuredCallbackMs: number;
    segments: Record<string, number>;
    systemTimings?: Array<{
      name: string;
      lastMs: number;
      emaMs: number;
      budgetMs: number;
      overBudget: boolean;
    }>;
    telemetryTimings?: Array<{
      name: string;
      lastMs: number;
      emaMs: number;
      peakMs: number;
      budgetMs: number;
      overBudget: boolean;
    }>;
  }>;
  systemTop?: Array<{ name: string; emaMs: number; peakMs: number }>;
  combatBreakdown?: {
    totalMs?: number;
    aiUpdateMs?: number;
    spatialSyncMs?: number;
    billboardUpdateMs?: number;
    effectPoolsMs?: number;
    influenceMapMs?: number;
    aiStateMs?: Record<string, number>;
    aiMethodMs?: Record<string, number>;
    aiMethodCounts?: Record<string, number>;
    closeEngagement?: {
      engagement?: {
        suppressionFlankCoverSearches?: number;
        suppressionFlankCoverSearchCapSkips?: number;
      };
    };
  };
}

export type TailAttribution = {
  sampleTs: string;
  sampleFrameCount: number;
  p99FrameMs: number;
  maxFrameMs: number;
  combat: {
    totalMs: number;
    aiUpdateMs: number;
    spatialSyncMs: number;
    billboardUpdateMs: number;
    effectPoolsMs: number;
    influenceMapMs: number;
    /**
     * totalMs - sum(named children). Where un-named combat work (incl. the NPC
     * contour terrain-stall movement cost) lands.
     */
    unattributedMs: number;
  };
  topAiMethods: Array<{ name: string; ms: number; calls?: number }>;
  topAiStates: Array<{ name: string; ms: number }>;
  coverSearch: {
    coverGridQueryMs: number;
    coverSearchMs: number;
    findBestCoverMs: number;
    computeFlankDestinationMs: number;
    totalCoverMs: number;
    flankCoverSearches?: number;
    flankCoverSearchCapSkips?: number;
  };
  combatVsOther: {
    topSystem: string | null;
    topSystemMs: number;
    combatSystemMs: number;
    frameMs: number;
    /**
     * frameMs - combatSystemMs. This is non-combat + unassigned frame budget,
     * not a renderer-only measurement.
     */
    otherMs: number;
    topNonCombatSystems: Array<{ name: string; ms: number; percentOfFrame: number }>;
    sampledSystemMs: number;
    /** frameMs - sum(systemTop emaMs). This is unassigned/browser/GPU/residual time. */
    sampledSystemResidualMs: number;
  };
  loopFrameBreakdown: {
    entryCount: number;
    slowestCallbackMs: number;
    slowestTimestampDeltaMs: number;
    segmentTotalMs: number;
    unmeasuredCallbackMs: number;
    topSegments: Array<{ name: string; ms: number; percentOfCallback: number }>;
    topSystemTimings: Array<{
      name: string;
      lastMs: number;
      emaMs: number;
      budgetMs: number;
      overBudget: boolean;
      percentOfCallback: number;
    }>;
    topTelemetryTimings: Array<{
      name: string;
      lastMs: number;
      emaMs: number;
      peakMs: number;
      budgetMs: number;
      overBudget: boolean;
      percentOfCallback: number;
    }>;
  } | null;
  renderSubmissionContext: {
    available: boolean;
    error?: string | null;
    mode?: string;
    frameCountStart?: number | null;
    frameCountEnd?: number | null;
    nearestFrame?: {
      frameCount: number;
      frameCountDelta: number;
      drawSubmissions: number;
      triangles: number;
      instances: number;
      passTypes?: Record<string, number>;
      topCategories: Array<{
        category: string;
        drawSubmissions: number;
        triangles: number;
        instances: number;
        meshes: number;
        materials: number;
        geometries: number;
        passTypes?: Record<string, number>;
        topOwners?: Array<{
          ownerKey: string;
          ownerLabel: string;
          ownerType: string | null;
          drawSubmissions: number;
          triangles: number;
          instances: number;
          meshes: number;
        }>;
      }>;
      topTriangleCategories: Array<{
        category: string;
        drawSubmissions: number;
        triangles: number;
        instances: number;
        meshes: number;
        materials: number;
        geometries: number;
        passTypes?: Record<string, number>;
        topOwners?: Array<{
          ownerKey: string;
          ownerLabel: string;
          ownerType: string | null;
          drawSubmissions: number;
          triangles: number;
          instances: number;
          meshes: number;
        }>;
      }>;
      unattributed?: {
        category: string;
        drawSubmissions: number;
        triangles: number;
        instances: number;
        meshes: number;
        materials: number;
        geometries: number;
        passTypes?: Record<string, number>;
        topOwners?: Array<{
          ownerKey: string;
          ownerLabel: string;
          ownerType: string | null;
          drawSubmissions: number;
          triangles: number;
          instances: number;
          meshes: number;
        }>;
      };
    };
  } | null;
  sceneAttributionContext: {
    available: boolean;
    source?: 'runtimeSample' | 'finalSceneAttribution';
    correlation?: 'frame-local' | 'run-final-uncorrelated';
    error?: string | null;
    categoryCount: number;
    visibleDrawCallLikeTotal: number;
    visibleTrianglesTotal: number;
    visibleInstancesTotal: number;
    topVisibleCategories: Array<{
      category: string;
      visibleDrawCallLike: number;
      visibleTriangles: number;
      visibleInstances: number;
      visibleMeshes: number;
    }>;
  } | null;
  presentationGapContext: {
    available: boolean;
    source: 'runtimeSampleRafCadence' | 'finalPresentationEpochs';
    gapMs: number;
    estimatedDropped60HzFrames: number;
    overBudget60HzMs: number | null;
    droppedFrameTime60HzMs: number | null;
    engineFrameCount: number | null;
    frameCountDelta: number | null;
    terrainTileSelectionSaturated: boolean | null;
    terrainSyncTileSelectionSaturated: boolean | null;
    terrainSyncSelectionRechecked: boolean | null;
    terrainSyncPoseWasStale: boolean | null;
    terrainSyncProjectionChanged: boolean | null;
    terrainSyncBufferSubmitted: boolean | null;
    terrainSyncSubmissionClassification: string | null;
    terrainAfterSimulationTileHash: string | null;
    terrainBeforeRenderTileHash: string | null;
    terrainStageTileHashChanged: boolean | null;
    terrainStageIdentityHashChanged: boolean | null;
    terrainStageMorphHashChanged: boolean | null;
    terrainStageEdgeMaskHashChanged: boolean | null;
    terrainAfterSimulationTileCount: number | null;
    terrainBeforeRenderTileCount: number | null;
    cameraTerrainHeightAtCamera: number | null;
    cameraEffectiveHeightAtCamera: number | null;
    cameraTerrainClearanceMeters: number | null;
    cameraEffectiveClearanceMeters: number | null;
    cameraTerrainHasTerrain: boolean | null;
    cameraTerrainAreaReady: boolean | null;
    driverViewStepYawDeg: number | null;
    driverViewStepPitchDeg: number | null;
    driverViewYawClamped: boolean | null;
    driverViewPitchClamped: boolean | null;
    driverViewTargetKind: string | null;
    driverViewAnchorResyncChanged: boolean | null;
    driverFireIntent: boolean | null;
    driverAimDot: number | null;
    driverAimGatePassed: boolean | null;
    driverAimGateReason: string | null;
    driverFireLosGatePassed: boolean | null;
    driverFireLosReason: string | null;
    atMs?: number;
    startAtMs?: number;
    endAtMs?: number;
    presentationContext?: Record<string, unknown> | null;
    harnessContext?: Record<string, unknown> | null;
  } | null;
  /** totalCoverMs is a meaningful share (>10%) of the tail frame. */
  coverDominatesTail: boolean;
  /** Combat system is the frame's top cost AND >half the frame. */
  combatDominatesTail: boolean;
  conclusion: string;
};

const COVER_GRID_QUERY_KEY = 'engage.suppression.initiate.coverGridQuery';
const COVER_SEARCH_KEY = 'engage.suppression.initiate.coverSearch';
const FIND_BEST_COVER_KEY = 'engage.cover.findBestCover';
const COMPUTE_FLANK_DEST_KEY = 'engage.suppression.initiate.computeFlankDestination';

type TailAttributionOptions = {
  presentationEpochs?: Record<string, unknown>[];
  finalSceneAttribution?: TailAttributionSample['sceneAttribution'];
  /**
   * Full capture stream. Used to join sparse render-submission drains to the
   * selected tail sample when the exact worst-p99 sample did not capture one.
   */
  runtimeSamples?: TailAttributionSample[];
};

type RenderSubmissionCategoryLike = NonNullable<
  NonNullable<NonNullable<TailAttributionSample['renderSubmissions']>['frames']>[number]['categories']
>[number];

function numberValue(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function numberRecord(value: unknown): Record<string, number> | undefined {
  const record = objectOrNull(value);
  if (!record) return undefined;
  const entries = Object.entries(record)
    .map(([key, raw]) => [key, numberOrNull(raw)] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] !== null);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function rankRecord(
  rec: Record<string, number> | undefined,
  topN: number,
): Array<{ name: string; ms: number }> {
  return Object.entries(rec ?? {})
    .map(([name, ms]) => ({ name, ms: Number(ms) }))
    .filter((e) => Number.isFinite(e.ms))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, topN);
}

function normalizeSystemName(name: string): string {
  return name.startsWith('SystemUpdater.')
    ? name.slice('SystemUpdater.'.length)
    : name;
}

function hasParentBucket(name: string, names: Set<string>): boolean {
  let cursor = name;
  while (cursor.includes('.')) {
    cursor = cursor.slice(0, cursor.lastIndexOf('.'));
    if (names.has(cursor)) {
      return true;
    }
  }
  return false;
}

function summarizeLoopFrameBreakdown(
  entries: TailAttributionSample['loopFrameBreakdown'],
): TailAttribution['loopFrameBreakdown'] {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }
  const slowest = entries
    .slice()
    .sort((a, b) => Number(b.callbackDurationMs ?? 0) - Number(a.callbackDurationMs ?? 0))[0];
  if (!slowest) return null;
  const callbackDurationMs = Number(slowest.callbackDurationMs ?? 0);
  const topSegments = Object.entries(slowest.segments ?? {})
    .map(([name, ms]) => ({ name, ms: Number(ms) }))
    .filter((entry) => Number.isFinite(entry.ms))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 6)
    .map((entry) => ({
      ...entry,
      percentOfCallback: callbackDurationMs > 0 ? entry.ms / callbackDurationMs : 0,
    }));
  const topSystemTimings = Array.isArray(slowest.systemTimings)
    ? slowest.systemTimings
        .map((entry) => ({
          name: String(entry.name ?? 'unknown'),
          lastMs: Number(entry.lastMs ?? 0),
          emaMs: Number(entry.emaMs ?? 0),
          budgetMs: Number(entry.budgetMs ?? 0),
          overBudget: Boolean(entry.overBudget),
        }))
        .filter((entry) => Number.isFinite(entry.lastMs))
        .sort((a, b) => b.lastMs - a.lastMs)
        .slice(0, 6)
        .map((entry) => ({
          ...entry,
          percentOfCallback: callbackDurationMs > 0 ? entry.lastMs / callbackDurationMs : 0,
        }))
    : [];
  const topTelemetryTimings = Array.isArray(slowest.telemetryTimings)
    ? slowest.telemetryTimings
        .map((entry) => ({
          name: String(entry.name ?? 'unknown'),
          lastMs: Number(entry.lastMs ?? 0),
          emaMs: Number(entry.emaMs ?? 0),
          peakMs: Number(entry.peakMs ?? entry.lastMs ?? 0),
          budgetMs: Number(entry.budgetMs ?? 0),
          overBudget: Boolean(entry.overBudget),
        }))
        .filter((entry) => Number.isFinite(entry.lastMs))
        .sort((a, b) => b.lastMs - a.lastMs)
        .slice(0, 8)
        .map((entry) => ({
          ...entry,
          percentOfCallback: callbackDurationMs > 0 ? entry.lastMs / callbackDurationMs : 0,
        }))
    : [];
  return {
    entryCount: entries.length,
    slowestCallbackMs: callbackDurationMs,
    slowestTimestampDeltaMs: Number(slowest.timestampDeltaMs ?? 0),
    segmentTotalMs: Number(slowest.segmentTotalMs ?? 0),
    unmeasuredCallbackMs: Number(slowest.unmeasuredCallbackMs ?? 0),
    topSegments,
    topSystemTimings,
    topTelemetryTimings,
  };
}

function compactRenderSubmissionCategory(
  category: RenderSubmissionCategoryLike | undefined,
): NonNullable<NonNullable<TailAttribution['renderSubmissionContext']>['nearestFrame']>['topCategories'][number] | undefined {
  if (!category) return undefined;
  return {
    category: String(category.category ?? 'unattributed'),
    drawSubmissions: numberValue(category.drawSubmissions),
    triangles: numberValue(category.triangles),
    instances: numberValue(category.instances),
    meshes: numberValue(category.meshes),
    materials: numberValue(category.materials),
    geometries: numberValue(category.geometries),
    passTypes: numberRecord(category.passTypes),
    topOwners: Array.isArray(category.topOwners)
      ? category.topOwners.slice(0, 6).map((owner) => ({
          ownerKey: String(owner.ownerKey ?? 'unknown'),
          ownerLabel: String(owner.ownerLabel ?? owner.ownerKey ?? 'unknown'),
          ownerType: stringOrNull(owner.ownerType),
          drawSubmissions: numberValue(owner.drawSubmissions),
          triangles: numberValue(owner.triangles),
          instances: numberValue(owner.instances),
          meshes: numberValue(owner.meshes),
        }))
      : undefined,
  };
}

function hasRenderSubmissionContext(sample: TailAttributionSample): boolean {
  return !!sample.renderSubmissions || !!sample.renderSubmissionError;
}

function renderSubmissionTailDistance(sample: TailAttributionSample, tailFrameCount: number): number {
  const start = numberOrNull(sample.renderSubmissions?.frameCountStart);
  const end = numberOrNull(sample.renderSubmissions?.frameCountEnd);
  if (start !== null && end !== null) {
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    if (tailFrameCount >= min && tailFrameCount <= max) {
      return 0;
    }
    return Math.min(Math.abs(tailFrameCount - min), Math.abs(tailFrameCount - max));
  }

  return Math.abs(numberValue(sample.frameCount) - tailFrameCount);
}

function selectRenderSubmissionSample(
  tail: TailAttributionSample,
  samples: TailAttributionSample[] | undefined,
): TailAttributionSample {
  if (hasRenderSubmissionContext(tail)) {
    return tail;
  }

  const tailFrameCount = numberValue(tail.frameCount);
  return (samples ?? [])
    .filter((sample) => sample !== tail && hasRenderSubmissionContext(sample))
    .slice()
    .sort((a, b) => {
      const aDelta = renderSubmissionTailDistance(a, tailFrameCount);
      const bDelta = renderSubmissionTailDistance(b, tailFrameCount);
      if (aDelta !== bDelta) return aDelta - bDelta;
      const aHasDrain = a.renderSubmissions ? 1 : 0;
      const bHasDrain = b.renderSubmissions ? 1 : 0;
      return bHasDrain - aHasDrain;
    })[0] ?? tail;
}

function summarizeRenderSubmissionContext(
  tail: TailAttributionSample,
  options?: TailAttributionOptions,
): TailAttribution['renderSubmissionContext'] {
  const source = selectRenderSubmissionSample(tail, options?.runtimeSamples);
  const drain = source.renderSubmissions;
  if (!drain) {
    return source.renderSubmissionError
      ? { available: false, error: source.renderSubmissionError }
      : null;
  }

  const frames = Array.isArray(drain.frames) ? drain.frames : [];
  const tailFrameCount = numberValue(tail.frameCount);
  const nearestFrame = frames
    .slice()
    .sort((a, b) => {
      const aDelta = Math.abs(numberValue(a.frameCount) - tailFrameCount);
      const bDelta = Math.abs(numberValue(b.frameCount) - tailFrameCount);
      if (aDelta !== bDelta) return aDelta - bDelta;
      return numberValue(b.drawSubmissions) - numberValue(a.drawSubmissions);
    })[0];

  if (!nearestFrame) {
    return {
      available: false,
      error: source.renderSubmissionError ?? 'render_submission_frames_unavailable',
      mode: drain.mode,
      frameCountStart: drain.frameCountStart ?? null,
      frameCountEnd: drain.frameCountEnd ?? null,
    };
  }

  const categories = Array.isArray(nearestFrame.categories) ? nearestFrame.categories : [];
  const topCategories = categories
    .slice()
    .sort((a, b) =>
      numberValue(b.drawSubmissions) - numberValue(a.drawSubmissions) ||
      numberValue(b.triangles) - numberValue(a.triangles)
    )
    .slice(0, 8)
    .map((category) => compactRenderSubmissionCategory(category))
    .filter((category): category is NonNullable<typeof category> => Boolean(category));
  const topTriangleCategories = categories
    .slice()
    .sort((a, b) =>
      numberValue(b.triangles) - numberValue(a.triangles) ||
      numberValue(b.drawSubmissions) - numberValue(a.drawSubmissions)
    )
    .slice(0, 8)
    .map((category) => compactRenderSubmissionCategory(category))
    .filter((category): category is NonNullable<typeof category> => Boolean(category));
  const unattributed = compactRenderSubmissionCategory(
    categories.find((category) => String(category.category) === 'unattributed')
  );

  return {
    available: true,
    error: source.renderSubmissionError ?? drain.errors?.[0] ?? null,
    mode: drain.mode,
    frameCountStart: drain.frameCountStart ?? null,
    frameCountEnd: drain.frameCountEnd ?? null,
    nearestFrame: {
      frameCount: numberValue(nearestFrame.frameCount),
      frameCountDelta: Math.abs(numberValue(nearestFrame.frameCount) - tailFrameCount),
      drawSubmissions: numberValue(nearestFrame.drawSubmissions),
      triangles: numberValue(nearestFrame.triangles),
      instances: numberValue(nearestFrame.instances),
      passTypes: numberRecord(nearestFrame.passTypes),
      topCategories,
      topTriangleCategories,
      unattributed,
    },
  };
}

function summarizeSceneAttributionContext(
  tail: TailAttributionSample,
  options?: TailAttributionOptions,
): TailAttribution['sceneAttributionContext'] {
  const hasRuntimeSceneAttribution = Array.isArray(tail.sceneAttribution) && tail.sceneAttribution.length > 0;
  const hasFinalSceneAttribution = Array.isArray(options?.finalSceneAttribution)
    && options.finalSceneAttribution.length > 0;
  const entries = hasRuntimeSceneAttribution
    ? tail.sceneAttribution!
    : hasFinalSceneAttribution
      ? options!.finalSceneAttribution!
      : [];
  if (entries.length === 0) {
    return tail.sceneAttributionError
      ? {
          available: false,
          source: 'runtimeSample',
          correlation: 'frame-local',
          error: tail.sceneAttributionError,
          categoryCount: 0,
          visibleDrawCallLikeTotal: 0,
          visibleTrianglesTotal: 0,
          visibleInstancesTotal: 0,
          topVisibleCategories: [],
        }
      : null;
  }

  const normalized = entries.map((entry) => ({
    category: String(entry.category ?? 'unattributed'),
    visibleDrawCallLike: numberValue(entry.visibleDrawCallLike ?? entry.drawCallLike),
    visibleTriangles: numberValue(entry.visibleTriangles ?? entry.triangles),
    visibleInstances: numberValue(entry.visibleInstances ?? entry.instances),
    visibleMeshes: numberValue(entry.visibleMeshes ?? entry.meshes),
  }));

  return {
    available: true,
    source: hasRuntimeSceneAttribution ? 'runtimeSample' : 'finalSceneAttribution',
    correlation: hasRuntimeSceneAttribution ? 'frame-local' : 'run-final-uncorrelated',
    error: tail.sceneAttributionError ?? null,
    categoryCount: normalized.length,
    visibleDrawCallLikeTotal: normalized.reduce((sum, entry) => sum + entry.visibleDrawCallLike, 0),
    visibleTrianglesTotal: normalized.reduce((sum, entry) => sum + entry.visibleTriangles, 0),
    visibleInstancesTotal: normalized.reduce((sum, entry) => sum + entry.visibleInstances, 0),
    topVisibleCategories: normalized
      .slice()
      .sort((a, b) =>
        b.visibleDrawCallLike - a.visibleDrawCallLike ||
        b.visibleTriangles - a.visibleTriangles
      )
      .slice(0, 8),
  };
}

function presentationEngineFrameCount(entry: Record<string, unknown>): number | null {
  const direct = numberOrNull(entry.engineFrameCount);
  if (direct !== null) return direct;
  const context = objectOrNull(entry.presentationContext);
  return numberOrNull(context?.engineFrameCount ?? context?.frameCount);
}

function presentationTerrainSaturation(entry: Record<string, unknown>): {
  terrainTileSelectionSaturated: boolean | null;
  terrainSyncTileSelectionSaturated: boolean | null;
  terrainSyncSelectionRechecked: boolean | null;
  terrainSyncPoseWasStale: boolean | null;
  terrainSyncProjectionChanged: boolean | null;
  terrainSyncBufferSubmitted: boolean | null;
  terrainSyncSubmissionClassification: string | null;
} {
  const context = objectOrNull(entry.presentationContext);
  const terrain = objectOrNull(context?.terrain);
  const terrainSync = objectOrNull(context?.terrainSync);
  return {
    terrainTileSelectionSaturated: booleanOrNull(
      terrain?.tileSelectionSaturated ?? context?.terrainTileSelectionSaturated
    ),
    terrainSyncTileSelectionSaturated: booleanOrNull(
      terrainSync?.tileSelectionSaturated ?? context?.terrainSyncTileSelectionSaturated
    ),
    terrainSyncSelectionRechecked: booleanOrNull(
      terrainSync?.selectionRechecked ?? context?.terrainSyncSelectionRechecked
    ),
    terrainSyncPoseWasStale: booleanOrNull(
      terrainSync?.poseWasStale ?? context?.terrainSyncPoseWasStale
    ),
    terrainSyncProjectionChanged: booleanOrNull(
      terrainSync?.projectionChanged ?? context?.terrainSyncProjectionChanged
    ),
    terrainSyncBufferSubmitted: booleanOrNull(
      terrainSync?.terrainBufferSubmitted ?? context?.terrainSyncBufferSubmitted
    ),
    terrainSyncSubmissionClassification: stringOrNull(
      terrainSync?.submissionClassification ?? context?.terrainSyncSubmissionClassification
    ),
  };
}

function presentationCameraTerrainContext(entry: Record<string, unknown>): {
  cameraTerrainHeightAtCamera: number | null;
  cameraEffectiveHeightAtCamera: number | null;
  cameraTerrainClearanceMeters: number | null;
  cameraEffectiveClearanceMeters: number | null;
  cameraTerrainHasTerrain: boolean | null;
  cameraTerrainAreaReady: boolean | null;
} {
  const context = objectOrNull(entry.presentationContext);
  const terrain = objectOrNull(context?.terrain);
  const cameraSample = objectOrNull(terrain?.cameraSample ?? context?.cameraSample);
  return {
    cameraTerrainHeightAtCamera: numberOrNull(cameraSample?.terrainHeightAtCamera),
    cameraEffectiveHeightAtCamera: numberOrNull(cameraSample?.effectiveHeightAtCamera),
    cameraTerrainClearanceMeters: numberOrNull(cameraSample?.clearanceMeters),
    cameraEffectiveClearanceMeters: numberOrNull(cameraSample?.effectiveClearanceMeters),
    cameraTerrainHasTerrain: booleanOrNull(cameraSample?.hasTerrain),
    cameraTerrainAreaReady: booleanOrNull(cameraSample?.areaReady),
  };
}

function presentationTerrainStageContext(entry: Record<string, unknown>): {
  terrainAfterSimulationTileHash: string | null;
  terrainBeforeRenderTileHash: string | null;
  terrainStageTileHashChanged: boolean | null;
  terrainStageIdentityHashChanged: boolean | null;
  terrainStageMorphHashChanged: boolean | null;
  terrainStageEdgeMaskHashChanged: boolean | null;
  terrainAfterSimulationTileCount: number | null;
  terrainBeforeRenderTileCount: number | null;
} {
  const context = objectOrNull(entry.presentationContext);
  const terrainByStage = objectOrNull(context?.terrainByStage);
  const afterSimulation = objectOrNull(terrainByStage?.['after-simulation']);
  const beforeRender = objectOrNull(terrainByStage?.['before-render']);
  const afterSimulationHash = stringOrNull(afterSimulation?.tileHash);
  const beforeRenderHash = stringOrNull(beforeRender?.tileHash);
  const afterIdentityHash = stringOrNull(afterSimulation?.tileIdentityHash);
  const beforeIdentityHash = stringOrNull(beforeRender?.tileIdentityHash);
  const afterMorphHash = stringOrNull(afterSimulation?.morphHash);
  const beforeMorphHash = stringOrNull(beforeRender?.morphHash);
  const afterEdgeMaskHash = stringOrNull(afterSimulation?.edgeMaskHash);
  const beforeEdgeMaskHash = stringOrNull(beforeRender?.edgeMaskHash);
  return {
    terrainAfterSimulationTileHash: afterSimulationHash,
    terrainBeforeRenderTileHash: beforeRenderHash,
    terrainStageTileHashChanged: afterSimulationHash !== null && beforeRenderHash !== null
      ? afterSimulationHash !== beforeRenderHash
      : null,
    terrainStageIdentityHashChanged: afterIdentityHash !== null && beforeIdentityHash !== null
      ? afterIdentityHash !== beforeIdentityHash
      : null,
    terrainStageMorphHashChanged: afterMorphHash !== null && beforeMorphHash !== null
      ? afterMorphHash !== beforeMorphHash
      : null,
    terrainStageEdgeMaskHashChanged: afterEdgeMaskHash !== null && beforeEdgeMaskHash !== null
      ? afterEdgeMaskHash !== beforeEdgeMaskHash
      : null,
    terrainAfterSimulationTileCount: numberOrNull(afterSimulation?.tileCount),
    terrainBeforeRenderTileCount: numberOrNull(beforeRender?.tileCount),
  };
}

function presentationDriverGapContext(entry: Record<string, unknown>): {
  driverViewStepYawDeg: number | null;
  driverViewStepPitchDeg: number | null;
  driverViewYawClamped: boolean | null;
  driverViewPitchClamped: boolean | null;
  driverViewTargetKind: string | null;
  driverViewAnchorResyncChanged: boolean | null;
  driverFireIntent: boolean | null;
  driverAimDot: number | null;
  driverAimGatePassed: boolean | null;
  driverAimGateReason: string | null;
  driverFireLosGatePassed: boolean | null;
  driverFireLosReason: string | null;
} {
  const harness = objectOrNull(entry.harnessContext);
  const fireProbe = objectOrNull(harness?.lastFireProbe);
  return {
    driverViewStepYawDeg: numberOrNull(harness?.lastViewStepYawDeg),
    driverViewStepPitchDeg: numberOrNull(harness?.lastViewStepPitchDeg),
    driverViewYawClamped: booleanOrNull(harness?.lastViewYawClamped),
    driverViewPitchClamped: booleanOrNull(harness?.lastViewPitchClamped),
    driverViewTargetKind: stringOrNull(harness?.lastViewTargetKind),
    driverViewAnchorResyncChanged: booleanOrNull(harness?.lastViewAnchorResyncChanged),
    driverFireIntent: booleanOrNull(harness?.lastFireIntent),
    driverAimDot: numberOrNull(harness?.lastAimDot),
    driverAimGatePassed: booleanOrNull(harness?.lastAimGatePassed),
    driverAimGateReason: stringOrNull(harness?.lastAimGateReason),
    driverFireLosGatePassed: booleanOrNull(harness?.lastFireLosGatePassed),
    driverFireLosReason: stringOrNull(harness?.lastFireLosReason ?? fireProbe?.losReason),
  };
}

function summarizePresentationGapContext(
  tail: TailAttributionSample,
  options?: TailAttributionOptions,
): TailAttribution['presentationGapContext'] {
  const candidates: Array<{
    source: NonNullable<TailAttribution['presentationGapContext']>['source'];
    entry: Record<string, unknown>;
  }> = [];
  for (const entry of options?.presentationEpochs ?? []) {
    candidates.push({ source: 'finalPresentationEpochs', entry });
  }
  for (const entry of tail.browserStalls?.recent?.rafCadence?.entries ?? []) {
    candidates.push({
      source: 'runtimeSampleRafCadence',
      entry: entry as Record<string, unknown>,
    });
  }

  const tailFrameCount = numberValue(tail.frameCount);
  const normalized = candidates
    .map((candidate) => {
      const gapMs = numberOrNull(candidate.entry.gapMs);
      if (gapMs === null || gapMs <= 0) return null;
      const engineFrameCount = presentationEngineFrameCount(candidate.entry);
      const terrainSaturation = presentationTerrainSaturation(candidate.entry);
      const cameraTerrainContext = presentationCameraTerrainContext(candidate.entry);
      const terrainStageContext = presentationTerrainStageContext(candidate.entry);
      const driverGapContext = presentationDriverGapContext(candidate.entry);
      return {
        source: candidate.source,
        gapMs,
        estimatedDropped60HzFrames: numberValue(candidate.entry.estimatedDropped60HzFrames),
        overBudget60HzMs: numberOrNull(candidate.entry.overBudget60HzMs),
        droppedFrameTime60HzMs: numberOrNull(candidate.entry.droppedFrameTime60HzMs),
        engineFrameCount,
        frameCountDelta: engineFrameCount === null ? null : Math.abs(engineFrameCount - tailFrameCount),
        ...terrainSaturation,
        ...cameraTerrainContext,
        ...terrainStageContext,
        ...driverGapContext,
        atMs: numberOrNull(candidate.entry.atMs) ?? undefined,
        startAtMs: numberOrNull(candidate.entry.startAtMs) ?? undefined,
        endAtMs: numberOrNull(candidate.entry.endAtMs) ?? undefined,
        presentationContext: objectOrNull(candidate.entry.presentationContext),
        harnessContext: objectOrNull(candidate.entry.harnessContext),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (normalized.length === 0) return null;

  const nearest = normalized
    .slice()
    .sort((a, b) => {
      if (a.frameCountDelta !== null && b.frameCountDelta !== null && a.frameCountDelta !== b.frameCountDelta) {
        return a.frameCountDelta - b.frameCountDelta;
      }
      if (a.frameCountDelta !== null && b.frameCountDelta === null) return -1;
      if (a.frameCountDelta === null && b.frameCountDelta !== null) return 1;
      return b.gapMs - a.gapMs;
    })[0];

  return {
    available: true,
    source: nearest.source,
    gapMs: nearest.gapMs,
    estimatedDropped60HzFrames: nearest.estimatedDropped60HzFrames,
    overBudget60HzMs: nearest.overBudget60HzMs,
    droppedFrameTime60HzMs: nearest.droppedFrameTime60HzMs,
    engineFrameCount: nearest.engineFrameCount,
    frameCountDelta: nearest.frameCountDelta,
    terrainTileSelectionSaturated: nearest.terrainTileSelectionSaturated,
    terrainSyncTileSelectionSaturated: nearest.terrainSyncTileSelectionSaturated,
    terrainSyncSelectionRechecked: nearest.terrainSyncSelectionRechecked,
    terrainSyncPoseWasStale: nearest.terrainSyncPoseWasStale,
    terrainSyncProjectionChanged: nearest.terrainSyncProjectionChanged,
    terrainSyncBufferSubmitted: nearest.terrainSyncBufferSubmitted,
    terrainSyncSubmissionClassification: nearest.terrainSyncSubmissionClassification,
    terrainAfterSimulationTileHash: nearest.terrainAfterSimulationTileHash,
    terrainBeforeRenderTileHash: nearest.terrainBeforeRenderTileHash,
    terrainStageTileHashChanged: nearest.terrainStageTileHashChanged,
    terrainStageIdentityHashChanged: nearest.terrainStageIdentityHashChanged,
    terrainStageMorphHashChanged: nearest.terrainStageMorphHashChanged,
    terrainStageEdgeMaskHashChanged: nearest.terrainStageEdgeMaskHashChanged,
    terrainAfterSimulationTileCount: nearest.terrainAfterSimulationTileCount,
    terrainBeforeRenderTileCount: nearest.terrainBeforeRenderTileCount,
    cameraTerrainHeightAtCamera: nearest.cameraTerrainHeightAtCamera,
    cameraEffectiveHeightAtCamera: nearest.cameraEffectiveHeightAtCamera,
    cameraTerrainClearanceMeters: nearest.cameraTerrainClearanceMeters,
    cameraEffectiveClearanceMeters: nearest.cameraEffectiveClearanceMeters,
    cameraTerrainHasTerrain: nearest.cameraTerrainHasTerrain,
    cameraTerrainAreaReady: nearest.cameraTerrainAreaReady,
    driverViewStepYawDeg: nearest.driverViewStepYawDeg,
    driverViewStepPitchDeg: nearest.driverViewStepPitchDeg,
    driverViewYawClamped: nearest.driverViewYawClamped,
    driverViewPitchClamped: nearest.driverViewPitchClamped,
    driverViewTargetKind: nearest.driverViewTargetKind,
    driverViewAnchorResyncChanged: nearest.driverViewAnchorResyncChanged,
    driverFireIntent: nearest.driverFireIntent,
    driverAimDot: nearest.driverAimDot,
    driverAimGatePassed: nearest.driverAimGatePassed,
    driverAimGateReason: nearest.driverAimGateReason,
    driverFireLosGatePassed: nearest.driverFireLosGatePassed,
    driverFireLosReason: nearest.driverFireLosReason,
    atMs: nearest.atMs,
    startAtMs: nearest.startAtMs,
    endAtMs: nearest.endAtMs,
    presentationContext: nearest.presentationContext,
    harnessContext: nearest.harnessContext,
  };
}

/**
 * Pick the worst-p99 runtime sample and decompose its frame. Returns undefined
 * when no sample carried a `combatBreakdown`.
 */
export function computeTailAttribution(
  samples: TailAttributionSample[],
  options?: TailAttributionOptions,
): TailAttribution | undefined {
  const withBreakdown = samples.filter((s) => s.combatBreakdown);
  if (withBreakdown.length === 0) return undefined;

  // Tail window = the sample with the highest rolling p99 (fall back to
  // maxFrame, then avgFrame, so a capture without p99 still attributes a sample).
  const score = (s: TailAttributionSample): number =>
    Number(s.p99FrameMs ?? s.maxFrameMs ?? s.avgFrameMs ?? 0);
  let tail = withBreakdown[0];
  for (const s of withBreakdown) {
    if (score(s) > score(tail)) tail = s;
  }

  const cb = tail.combatBreakdown!;
  const totalMs = Number(cb.totalMs ?? 0);
  const aiUpdateMs = Number(cb.aiUpdateMs ?? 0);
  const spatialSyncMs = Number(cb.spatialSyncMs ?? 0);
  const billboardUpdateMs = Number(cb.billboardUpdateMs ?? 0);
  const effectPoolsMs = Number(cb.effectPoolsMs ?? 0);
  const influenceMapMs = Number(cb.influenceMapMs ?? 0);
  const namedChildrenMs =
    aiUpdateMs + spatialSyncMs + billboardUpdateMs + effectPoolsMs + influenceMapMs;
  const unattributedMs = Math.max(0, totalMs - namedChildrenMs);

  const methodCounts = cb.aiMethodCounts ?? {};
  const topAiMethods = rankRecord(cb.aiMethodMs, 8).map((e) => ({
    ...e,
    calls: methodCounts[e.name] !== undefined ? Number(methodCounts[e.name]) : undefined,
  }));
  const topAiStates = rankRecord(cb.aiStateMs, 6);

  const methodMs = cb.aiMethodMs ?? {};
  const coverGridQueryMs = Number(methodMs[COVER_GRID_QUERY_KEY] ?? 0);
  const coverSearchMs = Number(methodMs[COVER_SEARCH_KEY] ?? 0);
  const findBestCoverMs = Number(methodMs[FIND_BEST_COVER_KEY] ?? 0);
  const computeFlankDestinationMs = Number(methodMs[COMPUTE_FLANK_DEST_KEY] ?? 0);
  const totalCoverMs = coverGridQueryMs + coverSearchMs + findBestCoverMs;
  const engagement = cb.closeEngagement?.engagement;

  // Frame-level Combat-vs-non-combat split from systemTop.
  const systemTop = Array.isArray(tail.systemTop)
    ? tail.systemTop.map((s) => ({
        ...s,
        name: normalizeSystemName(String(s.name ?? 'unknown')),
      }))
    : [];
  const topSystemEntry = systemTop[0] ?? null;
  const combatEntry =
    systemTop.find((s) => s.name === 'Combat') ??
    systemTop.find((s) => s.name.toLowerCase().includes('combat')) ??
    null;
  const combatSystemMs = combatEntry ? Number(combatEntry.emaMs) : 0;
  // Frame cost: prefer the explicit p99/max frame; else sum the system EMAs.
  const frameMs = Number(
    tail.p99FrameMs ??
      tail.maxFrameMs ??
      systemTop.reduce((sum, s) => sum + Number(s.emaMs ?? 0), 0),
  );
  const otherMs = Math.max(0, frameMs - combatSystemMs);
  const sampledSystemNames = new Set(systemTop.map((s) => s.name));
  const sampledSystemMs = systemTop.reduce((sum, s) => {
    if (hasParentBucket(s.name, sampledSystemNames)) {
      return sum;
    }
    const ms = Number(s.emaMs ?? 0);
    return Number.isFinite(ms) ? sum + Math.max(0, ms) : sum;
  }, 0);
  const sampledSystemResidualMs = Math.max(0, frameMs - sampledSystemMs);
  const topNonCombatSystems = systemTop
    .filter((s) => !s.name.toLowerCase().includes('combat'))
    .map((s) => {
      const ms = Number(s.emaMs ?? 0);
      return {
        name: String(s.name),
        ms: Number.isFinite(ms) ? ms : 0,
        percentOfFrame: frameMs > 0 && Number.isFinite(ms) ? ms / frameMs : 0,
      };
    });

  // "Dominates" is deliberately coarse — the question is order of magnitude.
  const coverDominatesTail = frameMs > 0 && totalCoverMs > frameMs * 0.1;
  const combatDominatesTail =
    !!topSystemEntry &&
    topSystemEntry.name.toLowerCase().includes('combat') &&
    frameMs > 0 &&
    combatSystemMs > frameMs * 0.5;

  const pct = (ms: number): string =>
    frameMs > 0 ? `${((ms / frameMs) * 100).toFixed(0)}%` : 'n/a';
  const topNonCombatSummary = topNonCombatSystems.length > 0
    ? topNonCombatSystems
        .slice(0, 3)
        .map((s) => `${s.name} ${s.ms.toFixed(1)}ms (${pct(s.ms)})`)
        .join(', ')
    : 'none in top sampled systems';
  const loopFrameBreakdown = summarizeLoopFrameBreakdown(tail.loopFrameBreakdown);
  const renderSubmissionContext = summarizeRenderSubmissionContext(tail, options);
  const sceneAttributionContext = summarizeSceneAttributionContext(tail, options);
  const presentationGapContext = summarizePresentationGapContext(tail, options);
  const loopBreakdownSummary = loopFrameBreakdown
    ? `slow-loop callback ${loopFrameBreakdown.slowestCallbackMs.toFixed(1)}ms ` +
      `(timestamp delta ${loopFrameBreakdown.slowestTimestampDeltaMs.toFixed(1)}ms), ` +
      `top loop segments: ${loopFrameBreakdown.topSegments.length > 0
        ? loopFrameBreakdown.topSegments
            .slice(0, 3)
            .map((s) => `${s.name} ${s.ms.toFixed(1)}ms`)
            .join(', ')
        : 'none'}, ` +
      `top SystemUpdater timings: ${loopFrameBreakdown.topSystemTimings.length > 0
        ? loopFrameBreakdown.topSystemTimings
            .slice(0, 3)
            .map((s) => `${s.name} ${s.lastMs.toFixed(1)}ms`)
            .join(', ')
        : 'none'}, ` +
      `top telemetry timings: ${loopFrameBreakdown.topTelemetryTimings.length > 0
        ? loopFrameBreakdown.topTelemetryTimings
            .slice(0, 4)
            .map((s) => `${s.name} ${s.lastMs.toFixed(1)}ms`)
            .join(', ')
        : 'none'}, ` +
      `unmeasured callback ${loopFrameBreakdown.unmeasuredCallbackMs.toFixed(1)}ms`
    : 'slow-loop callback breakdown unavailable';
  const renderWindowSummary = renderSubmissionContext?.nearestFrame &&
    (renderSubmissionContext.frameCountStart !== null || renderSubmissionContext.frameCountEnd !== null)
    ? `, sample window ${renderSubmissionContext.frameCountStart ?? 'n/a'}-${renderSubmissionContext.frameCountEnd ?? 'n/a'}`
    : '';
  const renderOwnerSummary = renderSubmissionContext?.nearestFrame
    ? renderSubmissionContext.nearestFrame.topCategories
        .flatMap((category) =>
          (category.topOwners ?? []).slice(0, 3).map((owner) => ({
            label: owner.ownerLabel,
            drawSubmissions: owner.drawSubmissions,
            triangles: owner.triangles,
          }))
        )
        .slice(0, 4)
    : [];
  const renderContextSummary = renderSubmissionContext?.nearestFrame
    ? `tail render frame ${renderSubmissionContext.nearestFrame.frameCount} ` +
      `(Δ${renderSubmissionContext.nearestFrame.frameCountDelta}${renderWindowSummary}), ` +
      `draw submissions ${renderSubmissionContext.nearestFrame.drawSubmissions}, ` +
      `triangles ${renderSubmissionContext.nearestFrame.triangles}, ` +
      `top render submissions: ${renderSubmissionContext.nearestFrame.topCategories.length > 0
        ? renderSubmissionContext.nearestFrame.topCategories
            .slice(0, 4)
            .map((category) =>
              `${category.category} ${category.drawSubmissions} submissions/${category.triangles} tris`
            )
            .join(', ')
        : 'none'}, ` +
      `top render triangles: ${renderSubmissionContext.nearestFrame.topTriangleCategories.length > 0
        ? renderSubmissionContext.nearestFrame.topTriangleCategories
            .slice(0, 4)
            .map((category) =>
              `${category.category} ${category.triangles} tris/${category.drawSubmissions} submissions`
            )
            .join(', ')
        : 'none'}` +
      `, top render owners: ${renderOwnerSummary.length > 0
        ? renderOwnerSummary
            .map((owner) => `${owner.label} ${owner.drawSubmissions} submissions/${owner.triangles} tris`)
            .join(', ')
        : 'none'}`
    : renderSubmissionContext
      ? `tail render context unavailable (${renderSubmissionContext.error ?? 'unknown'})`
      : 'tail render context unavailable';
  const sceneContextSummary = sceneAttributionContext?.available
    ? `${sceneAttributionContext.source === 'finalSceneAttribution' ? 'final visible scene categories' : 'visible scene categories'}: ${sceneAttributionContext.topVisibleCategories.length > 0
      ? sceneAttributionContext.topVisibleCategories
          .slice(0, 4)
          .map((category) =>
            `${category.category} ${category.visibleDrawCallLike} visible draw-like/${category.visibleTriangles} tris`
          )
          .join(', ')
      : 'none'}${sceneAttributionContext.correlation === 'run-final-uncorrelated' ? ' (run-final uncorrelated)' : ''}`
    : sceneAttributionContext
      ? `visible scene context unavailable (${sceneAttributionContext.error ?? 'unknown'})`
      : 'visible scene context unavailable';
  const gapValue = (value: string | number | boolean | null | undefined): string =>
    value === null || value === undefined ? 'n/a' : String(value);
  const gapNumber = (value: number | null, digits = 1): string =>
    typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
  const driverGapSummary = presentationGapContext?.available
    ? `driver view step ${gapNumber(presentationGapContext.driverViewStepYawDeg)}/` +
      `${gapNumber(presentationGapContext.driverViewStepPitchDeg)}deg, ` +
      `clamped=${gapValue(presentationGapContext.driverViewYawClamped)}/` +
      `${gapValue(presentationGapContext.driverViewPitchClamped)}, ` +
      `target=${gapValue(presentationGapContext.driverViewTargetKind)}, ` +
      `anchorResync=${gapValue(presentationGapContext.driverViewAnchorResyncChanged)}, ` +
      `fireIntent=${gapValue(presentationGapContext.driverFireIntent)}, ` +
      `aimDot=${gapNumber(presentationGapContext.driverAimDot, 2)}, ` +
      `aimGate=${gapValue(presentationGapContext.driverAimGatePassed)}` +
      `/${gapValue(presentationGapContext.driverAimGateReason)}, ` +
      `fireLOS=${gapValue(presentationGapContext.driverFireLosGatePassed)}` +
      `/${gapValue(presentationGapContext.driverFireLosReason)}`
    : 'driver gap context unavailable';
  const cameraTerrainSummary = presentationGapContext?.available
    ? `camera terrain clearance terrain=${gapNumber(presentationGapContext.cameraTerrainClearanceMeters, 2)}m ` +
      `effective=${gapNumber(presentationGapContext.cameraEffectiveClearanceMeters, 2)}m, ` +
      `height=${gapNumber(presentationGapContext.cameraTerrainHeightAtCamera, 2)}m ` +
      `effectiveHeight=${gapNumber(presentationGapContext.cameraEffectiveHeightAtCamera, 2)}m, ` +
      `hasTerrain=${gapValue(presentationGapContext.cameraTerrainHasTerrain)} ` +
      `areaReady=${gapValue(presentationGapContext.cameraTerrainAreaReady)}`
    : 'camera terrain context unavailable';
  const presentationContextSummary = presentationGapContext?.available
    ? `nearest presentation gap ${presentationGapContext.gapMs.toFixed(1)}ms ` +
      `(${presentationGapContext.estimatedDropped60HzFrames} dropped est, ` +
      `dropped-frame time ${gapNumber(presentationGapContext.droppedFrameTime60HzMs)}ms, ` +
      `over-budget ${gapNumber(presentationGapContext.overBudget60HzMs)}ms, ` +
      `source ${presentationGapContext.source}, ` +
      `frame Δ${presentationGapContext.frameCountDelta ?? 'n/a'}, ` +
      `terrain saturation terrain=${presentationGapContext.terrainTileSelectionSaturated ?? 'n/a'} ` +
      `terrainSync=${presentationGapContext.terrainSyncTileSelectionSaturated ?? 'n/a'}, ` +
      `terrain sync rechecked=${gapValue(presentationGapContext.terrainSyncSelectionRechecked)} ` +
      `poseStale=${gapValue(presentationGapContext.terrainSyncPoseWasStale)} ` +
      `projectionChanged=${gapValue(presentationGapContext.terrainSyncProjectionChanged)} ` +
      `submitted=${gapValue(presentationGapContext.terrainSyncBufferSubmitted)} ` +
      `class=${gapValue(presentationGapContext.terrainSyncSubmissionClassification)}, ` +
      `terrain stage afterSim=${gapValue(presentationGapContext.terrainAfterSimulationTileCount)}` +
      `/${gapValue(presentationGapContext.terrainAfterSimulationTileHash)} ` +
      `beforeRender=${gapValue(presentationGapContext.terrainBeforeRenderTileCount)}` +
      `/${gapValue(presentationGapContext.terrainBeforeRenderTileHash)} ` +
      `changed=${gapValue(presentationGapContext.terrainStageTileHashChanged)} ` +
      `(identity=${gapValue(presentationGapContext.terrainStageIdentityHashChanged)} ` +
      `morph=${gapValue(presentationGapContext.terrainStageMorphHashChanged)} ` +
      `edgeMask=${gapValue(presentationGapContext.terrainStageEdgeMaskHashChanged)}), ` +
      `${cameraTerrainSummary}, ` +
      `${driverGapSummary})`
    : 'presentation gap context unavailable';
  const conclusion =
    `Tail frame ~${frameMs.toFixed(1)}ms @ frame ${tail.frameCount}: ` +
    `cover-search ${totalCoverMs.toFixed(3)}ms (${pct(totalCoverMs)}) - ` +
    `${coverDominatesTail ? 'COVER IS A FACTOR' : 'cover is NOT the driver'}; ` +
    `Combat system ${combatSystemMs.toFixed(1)}ms (${pct(combatSystemMs)}), ` +
    `non-combat/residual ${otherMs.toFixed(1)}ms (${pct(otherMs)}), ` +
    `top non-combat sampled: ${topNonCombatSummary}, ` +
    `unassigned residual ${sampledSystemResidualMs.toFixed(1)}ms (${pct(sampledSystemResidualMs)}); ` +
    `${loopBreakdownSummary}; ` +
    `${renderContextSummary}; ${sceneContextSummary}; ${presentationContextSummary}; ` +
    `combat-phase unattributed (movement/stall) ${unattributedMs.toFixed(2)}ms. ` +
    (combatDominatesTail
      ? 'Combat dominates the tail.'
      : 'Tail is a superposition - a combat-only fix is not guaranteed to clear it.');

  return {
    sampleTs: tail.ts,
    sampleFrameCount: Number(tail.frameCount ?? 0),
    p99FrameMs: Number(tail.p99FrameMs ?? 0),
    maxFrameMs: Number(tail.maxFrameMs ?? 0),
    combat: {
      totalMs,
      aiUpdateMs,
      spatialSyncMs,
      billboardUpdateMs,
      effectPoolsMs,
      influenceMapMs,
      unattributedMs,
    },
    topAiMethods,
    topAiStates,
    coverSearch: {
      coverGridQueryMs,
      coverSearchMs,
      findBestCoverMs,
      computeFlankDestinationMs,
      totalCoverMs,
      flankCoverSearches:
        engagement?.suppressionFlankCoverSearches !== undefined
          ? Number(engagement.suppressionFlankCoverSearches)
          : undefined,
      flankCoverSearchCapSkips:
        engagement?.suppressionFlankCoverSearchCapSkips !== undefined
          ? Number(engagement.suppressionFlankCoverSearchCapSkips)
          : undefined,
    },
    combatVsOther: {
      topSystem: topSystemEntry ? topSystemEntry.name : null,
      topSystemMs: topSystemEntry ? Number(topSystemEntry.emaMs) : 0,
      combatSystemMs,
      frameMs,
      otherMs,
      topNonCombatSystems,
      sampledSystemMs,
      sampledSystemResidualMs,
    },
    loopFrameBreakdown,
    renderSubmissionContext,
    sceneAttributionContext,
    presentationGapContext,
    coverDominatesTail,
    combatDominatesTail,
    conclusion,
  };
}
