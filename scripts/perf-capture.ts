#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { chromium, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { execFileSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'node:module';
import {
  cleanupPortListeners,
  isPortOpen,
  parseServerModeArg,
  startServer,
  stopServer,
  type ServerHandle,
  type ServerMode,
} from './preview-server';
import {
  renderMovementArtifactViewerHtml,
  type MovementArtifactReportForViewer,
  type MovementTerrainOverlayArtifact,
} from './perfMovementViewerTemplate';
import {
  summarizePresentationGapContexts,
  type PresentationGapContextSummary,
} from './perf-presentation-gap-summary';
import { terrainStageBufferVisibleChanged } from './perf-terrain-stage-classification';
import { computeTailAttribution, type TailAttribution } from './perf-tail-attribution';
import {
  PROJEKT_143_RENDER_SUBMISSION_ATTRIBUTION_INSTALL_SOURCE,
  PROJEKT_143_RENDER_SUBMISSION_ATTRIBUTION_RESET_SOURCE,
  PROJEKT_143_SCENE_ATTRIBUTION_EVALUATE_SOURCE,
} from './audit-archive/scene-attribution';

type ConsoleEntry = {
  ts: string;
  type: string;
  text: string;
};

type RuntimeFrameEventSample = {
  frameCount: number;
  frameMs: number;
  atMs: number;
  previousMaxFrameMs: number;
  newMax: boolean;
  hitch33: boolean;
  hitch50: boolean;
  hitch100: boolean;
};

type ShotVisualCapture = {
  ts: string;
  sampleIndex: number;
  sampleElapsedMs: number;
  frameCount: number;
  reason: string;
  file: string;
  routeSnapDistanceMeters?: number;
  routeSnapDeltaMs?: number;
  terrainRecoveryDeltaMs?: number;
  presentationGapDeltaMs?: number;
  latestShotEpoch?: Record<string, unknown>;
  latestRouteSnapEpoch?: Record<string, unknown>;
  latestTerrainRecoveryEvent?: Record<string, unknown>;
  latestPresentationGap?: PresentationGapContextSummary['latest'][number];
};

type ShotVisualCaptureTrigger = Omit<ShotVisualCapture, 'ts' | 'sampleIndex' | 'sampleElapsedMs' | 'frameCount' | 'file'> & {
  key: string;
};

type ShotVisualCaptureState = {
  enabled: boolean;
  maxCaptures: number;
  cooldownMs: number;
  artifactDir: string;
  captures: ShotVisualCapture[];
  seenKeys: Set<string>;
  lastCaptureElapsedMs: number;
};

type LoopFrameBreakdownSample = {
  frameCount: number | null;
  startedAtMs: number;
  endedAtMs: number;
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
  combatTiming?: Record<string, unknown>;
};

type RuntimeCloseModelTransitionWindow = {
  total: number;
  firstObservation: number;
  toCloseGlb: number;
  toImpostor: number;
  toCulled: number;
  fromCloseGlb: number;
  byTransition: Record<string, number>;
  byReason: Record<string, number>;
};

type RuntimeCloseModelStats = {
  closeRadiusMeters: number;
  closeModelActiveCap: number;
  promotionBudgetPerFrame: number;
  promotionsThisFrame: number;
  replacementsThisFrame: number;
  candidatesWithinCloseRadius: number;
  renderedCloseModels: number;
  activeCloseModels: number;
  fallbackCount: number;
  fallbackCounts: Record<string, number>;
  nearestFallbackDistanceMeters: number | null;
  farthestFallbackDistanceMeters: number | null;
  poolLoads: number;
  poolTargets: Record<string, number>;
  poolAvailable: Record<string, number>;
  transitionWindow?: RuntimeCloseModelTransitionWindow;
};

type RuntimeVegetationTypeStats = {
  active: number;
  highWater: number;
  free: number;
};

type RuntimeVegetationStats = {
  activeTotal: number;
  reservedTotal: number;
  freeTotal: number;
  chunksTracked: number;
  byType: Record<string, RuntimeVegetationTypeStats>;
};

type RuntimeWeatherStats = {
  configEnabled: boolean;
  visualRainEnabled: boolean;
  surfaceWetnessEnabled: boolean;
  currentState: string;
  targetState: string;
  transitionProgress: number;
  cycleTimer: number;
  rainCount: number;
  activeRainCount: number;
  rainVisible: boolean;
  rainOpacity: number;
  rainInactive: boolean;
  surfaceWetness: number;
  rainMatrixElementsPerFrame: number;
  rainMatrixBytesPerFrame: number;
};

type RuntimeSample = {
  ts: string;
  pagePerformanceNowMs?: number;
  pageWallNowMs?: number;
  frameCount: number;
  avgFrameMs: number;
  p95FrameMs: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  hitch33Count?: number;
  hitch50Count?: number;
  hitch100Count?: number;
  frameEvents?: RuntimeFrameEventSample[];
  loopFrameBreakdown?: LoopFrameBreakdownSample[];
  combatantCount: number;
  overBudgetPercent: number;
  shotsThisSession?: number;
  hitsThisSession?: number;
  hitRate?: number;
  heapUsedMb?: number;
  heapTotalMb?: number;
  uiErrorPanelVisible?: boolean;
  closeModelStats?: RuntimeCloseModelStats;
  vegetation?: RuntimeVegetationStats;
  weather?: RuntimeWeatherStats;
  terrainRecoveryEvents?: Record<string, unknown>[];
  materializationTierEvents?: Record<string, unknown>[];
  combatBreakdown?: {
    totalMs: number;
    aiUpdateMs: number;
    spatialSyncMs: number;
    billboardUpdateMs: number;
    billboardProfile?: {
      walkFrameMs: number;
      closeModelMs: number;
      bucketResetMs: number;
      impostorWriteMs: number;
      finalizeMs: number;
      hitboxDebugMs: number;
      materializationEventsMs: number;
      shaderUniformMs: number;
    };
    effectPoolsMs: number;
    influenceMapMs: number;
    aiStateMs?: Record<string, number>;
    aiMethodMs?: Record<string, number>;
    aiMethodCounts?: Record<string, number>;
    aiMethodTotalCounts?: Record<string, number>;
    aiSlowestUpdate?: {
      combatantId: string;
      stateAtStart: string;
      stateAtEnd: string;
      lodLevel: string;
      totalMs: number;
      methodMs: Record<string, number>;
      methodCounts?: Record<string, number>;
    } | null;
    losCache?: {
      hits: number;
      misses: number;
      hitRate: number;
      budgetDenials: number;
      prefilterPasses?: number;
      prefilterRejects?: number;
      fullEvaluations?: number;
      terrainRaycasts?: number;
      fullEvaluationClear?: number;
      fullEvaluationBlocked?: number;
    };
    closeEngagement?: {
      engagement?: {
        closeRangeFullAutoActivations: number;
        nearbyEnemyBurstTriggers: number;
        suppressionTransitions: number;
        nearbyEnemyCountSamples: number;
        nearbyEnemyCountTotal: number;
        nearbyEnemyCountMax: number;
        suppressionFlankDestinationComputations?: number;
        suppressionFlankCoverSearches?: number;
        suppressionFlankCoverSearchReuseSkips?: number;
        suppressionFlankCoverSearchCapSkips?: number;
        targetDistanceBuckets?: Record<string, number>;
      };
      targetAcquisition?: Record<string, number>;
      targetDistribution?: Record<string, number>;
      lineOfSight?: Record<string, number>;
      losCallsites?: Record<string, Record<string, number>>;
    };
    raycastBudget?: {
      maxPerFrame: number;
      usedThisFrame: number;
      deniedThisFrame: number;
      totalExhaustedFrames: number;
      totalRequested: number;
      totalDenied: number;
      saturationRate: number;
      denialRate: number;
    };
    combatFireRaycastBudget?: {
      maxPerFrame: number;
      usedThisFrame: number;
      deniedThisFrame: number;
      terrainBlockedThisFrame: number;
      totalExhaustedFrames: number;
      totalRequested: number;
      totalDenied: number;
      totalTerrainBlocked: number;
      saturationRate: number;
      denialRate: number;
      terrainBlockRate: number;
    };
    aiScheduling?: {
      frameCounter: number;
      intervalScale: number;
      aiBudgetMs: number;
      staggeredSkips: number;
      highFullUpdates: number;
      mediumFullUpdates: number;
      projectedHighFullUpdateDeferrals: number;
      highFullUpdateCostEmaMs: number;
      highFullUpdateCostPeakMs: number;
      maxHighFullUpdatesPerFrame: number;
      maxMediumFullUpdatesPerFrame: number;
      aiBudgetExceededEvents: number;
      aiSevereOverBudgetEvents: number;
      simLaneTransitions?: {
        total: number;
        towardHigherFidelity: number;
        towardLowerFidelity: number;
        toHigh: number;
        toMedium: number;
        toLow: number;
        toCulled: number;
        fromHigh: number;
        fromMedium: number;
        fromLow: number;
        fromCulled: number;
        byTransition: Record<string, number>;
        maxRenderedLagMeters: number;
        maxRenderedHorizontalLagMeters: number;
        maxRenderedVerticalLagMeters: number;
        maxTransitionRenderedLagMeters: number;
        sampledRenderedLagCount: number;
      };
    };
  };
  renderer?: {
    drawCalls: number;
    drawCallsSinceLastSample?: number | null;
    drawCallsPerFrameSinceLastSample?: number | null;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
  };
  rendererBackend?: {
    requestedMode: string;
    resolvedBackend: string;
    initStatus: string;
    strictWebGPU: boolean;
  };
  gpu?: {
    available: boolean;
    gpuTimeMs: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
  };
  sceneAttribution?: SceneAttributionEntry[] | null;
  sceneAttributionError?: string | null;
  renderSubmissions?: RuntimeRenderSubmissionDrain | null;
  renderSubmissionError?: string | null;
  browserStalls?: {
    support: {
      longtask: boolean;
      longAnimationFrame: boolean;
      userTiming: boolean;
      webglTextureUpload?: boolean;
      rafCadence?: boolean;
      resourceTiming?: boolean;
    };
    totals: {
      longTaskCount: number;
      longTaskTotalDurationMs: number;
      longTaskMaxDurationMs: number;
      longAnimationFrameCount: number;
      longAnimationFrameTotalDurationMs: number;
      longAnimationFrameMaxDurationMs: number;
      longAnimationFrameBlockingDurationMs: number;
      resourceCount?: number;
      resourceTotalDurationMs?: number;
      resourceMaxDurationMs?: number;
      resourceTransferSizeBytes?: number;
      webglTextureUploadCount?: number;
      webglTextureUploadTotalDurationMs?: number;
      webglTextureUploadMaxDurationMs?: number;
      webglTextureUploadByOperation?: Record<string, {
        count: number;
        totalDurationMs: number;
        maxDurationMs: number;
      }>;
      rafCadence?: {
        intervalCount: number;
        totalGapMs: number;
        maxGapMs: number;
        avgGapMs: number;
        stutter25Count: number;
        hitch33Count: number;
        hitch50Count: number;
        hitch100Count: number;
        overBudget60HzMs: number;
        droppedFrameTime60HzMs: number;
        estimatedDropped60HzFrames: number;
      };
      userTimingByName?: Record<string, {
        count: number;
        totalDurationMs: number;
        maxDurationMs: number;
      }>;
    };
    recent: {
      longTasks: {
        count: number;
        totalDurationMs: number;
        maxDurationMs: number;
        entries: Array<{
          name: string;
          startTime: number;
          duration: number;
          attribution?: Array<{
            name: string;
            entryType: string;
            startTime: number;
            duration: number;
            containerType: string;
            containerSrc: string;
            containerId: string;
            containerName: string;
          }>;
        }>;
      };
      webglTextureUploadTop?: Array<{
        operation: string;
        startTime: number;
        duration: number;
        target: string;
        textureId: number;
        width: number;
        height: number;
        sourceType: string;
        sourceUrl: string;
        sourceWidth: number;
        sourceHeight: number;
        byteLength: number;
      }>;
      longAnimationFrames: {
        count: number;
        totalDurationMs: number;
        maxDurationMs: number;
        blockingDurationMs: number;
        entries: Array<{
          startTime: number;
          duration: number;
          blockingDuration: number;
          renderStart: number;
          styleAndLayoutStart: number;
          firstUIEventTimestamp: number;
          scripts: Array<{
            name: string;
            invoker: string;
            invokerType: string;
            sourceURL: string;
            sourceFunctionName: string;
            sourceCharPosition: number;
            windowAttribution: string;
            executionStart: number;
            duration: number;
            pauseDuration: number;
            forcedStyleAndLayoutDuration: number;
          }>;
        }>;
      };
      resources?: {
        count: number;
        totalDurationMs: number;
        maxDurationMs: number;
        transferSizeBytes: number;
        entries: Array<{
          name: string;
          initiatorType: string;
          startTime: number;
          responseEnd: number;
          duration: number;
          transferSize: number;
          encodedBodySize: number;
          decodedBodySize: number;
          renderBlockingStatus: string;
        }>;
      };
      rafCadence?: {
        count: number;
        estimatedDropped60HzFrames: number;
        overBudget60HzMs: number;
        droppedFrameTime60HzMs: number;
        maxGapMs: number;
        entries: Array<{
          atMs: number;
          gapMs: number;
          estimatedDropped60HzFrames: number;
          overBudget60HzMs: number;
          droppedFrameTime60HzMs: number;
          stutter25: boolean;
          hitch33: boolean;
          hitch50: boolean;
          hitch100: boolean;
          presentationContext?: Record<string, unknown> | null;
          harnessContext?: Record<string, unknown> | null;
        }>;
      };
      userTimingByName?: Record<string, {
        count: number;
        totalDurationMs: number;
        maxDurationMs: number;
      }>;
    };
  };
  terrainStreams?: Array<{
    name: string;
    budgetMs: number;
    timeMs: number;
    pendingUnits: number;
    debug?: Record<string, unknown>;
  }>;
  movement?: {
    player: {
      samples: number;
      groundedSamples: number;
      uphillSamples: number;
      downhillSamples: number;
      blockedByTerrain: number;
      slideSamples: number;
      walkabilityTransitions: number;
      pinnedAreaEvents: number;
      pinnedSamples: number;
      avgPinnedSeconds: number;
      maxPinnedSeconds: number;
      avgPinnedRadius: number;
      avgSupportNormalY: number;
      avgSupportNormalDelta: number;
      avgRequestedSpeed: number;
      avgActualSpeed: number;
    };
    npc: {
      samples: number;
      contourActivations: number;
      backtrackActivations: number;
      arrivalCount: number;
      lowProgressEvents: number;
      pinnedAreaEvents: number;
      pinnedSamples: number;
      avgPinnedSeconds: number;
      maxPinnedSeconds: number;
      avgPinnedRadius: number;
      avgProgressPerSample: number;
      byIntent: Record<string, number>;
      samplesByLod: Record<string, number>;
      lowProgressByLod: Record<string, number>;
      pinnedByLod: Record<string, number>;
    };
  };
  systemTop: Array<{ name: string; emaMs: number; peakMs: number }>;
  systemBreakdown: Array<{
    name: string;
    budgetMs: number;
    lastMs: number;
    emaMs: number;
    peakMs: number;
  }>;
  harnessDriver?: {
    mode: string;
    // `botState` is the canonical bot state-machine label
    // (PATROL/ALERT/ENGAGE/ADVANCE/RESPAWN_WAIT). `movementState` is
    // kept as an alias for backward compatibility with older capture
    // artifacts; readers should prefer `botState`.
    botState: string;
    movementState: string;
    driverSeed?: number | null;
    movementDecisionIntervalMs?: number | null;
    targetVisible: boolean;
    respawnCount: number;
    ammoRefillCount: number;
    healthTopUpCount: number;
    frontlineCompressed?: boolean | null;
    frontlineDistance?: number | null;
    frontlineMoveCount?: number | null;
    lastShotAt: number;
    lastFireProbe?: Record<string, unknown> | null;
    // perf-harness-redesign surfaces. All optional: older capture artifacts
    // replayed through this script must still parse.
    terrainProfile?: string;
    maxGradient?: number;
    stuckTimeoutSec?: number;
    losRejectedShots?: number;
    losUnknownTargetChecks?: number;
    fireUnknownLosRejectedShots?: number;
    lastTargetLosStatus?: string | null;
    lastTargetLosReason?: string | null;
    lastFireLosStatus?: string | null;
    lastFireLosReason?: string | null;
    lastCurrentTargetLive?: boolean | null;
    lastCurrentTargetHealth?: number | null;
    lastCurrentTargetState?: string | null;
    shotEpochs?: Record<string, unknown>[];
    aimDotGateRejectedShots?: number;
    fireStartRejected?: number;
    runtimeShotPreviewRejectedShots?: number;
    runtimeShotPreviewAimSettlingShots?: number;
    runtimeShotPreviewTerrainBlockedShots?: number;
    runtimeShotPreviewUnavailableShots?: number;
    runtimeShotPreviewMissShots?: number;
    runtimeShotPreviewWrongTargetShots?: number;
    lastRuntimeShotPreviewStatus?: string | null;
    lastRuntimeShotPreviewReason?: string | null;
    lastRuntimeShotPreviewHitTargetId?: string | null;
    lastRuntimeShotPreviewExpectedInSpatialCandidates?: boolean | null;
    droppedDeadTargetLocks?: number;
    firingRetargets?: number;
    firingRetargetFireStops?: number;
    firingRetargetEpochs?: Record<string, unknown>[];
    shotsFired?: number;
    reloadsIssued?: number;
    stuckTeleportCount?: number;
    maxStuckSeconds?: number;
    maxViewYawStepDeg?: number;
    maxViewPitchStepDeg?: number;
    lastViewStepYawDeg?: number;
    lastViewStepPitchDeg?: number;
    lastRequestedViewYawDeltaDeg?: number;
    lastRequestedViewPitchDeltaDeg?: number;
    lastRemainingViewYawErrorDeg?: number;
    lastRemainingViewPitchErrorDeg?: number;
    lastViewYawClamped?: boolean | null;
    lastViewPitchClamped?: boolean | null;
    lastViewTargetKind?: string | null;
    lastViewAnchorResyncChanged?: boolean | null;
    lastViewAnchorResyncYawDeg?: number | null;
    lastViewAnchorResyncPitchDeg?: number | null;
    lastViewUpdateAtMs?: number | null;
    lastAimDot?: number | null;
    lastFireIntent?: boolean | null;
    lastAimGatePassed?: boolean | null;
    lastAimGateReason?: string | null;
    lastFireLosGatePassed?: boolean | null;
    viewSlewClampCount?: number;
    viewAnchorResyncCount?: number;
    maxRequestedViewYawDeltaDeg?: number;
    maxRequestedViewPitchDeltaDeg?: number;
    maxRemainingViewYawErrorDeg?: number;
    maxRemainingViewPitchErrorDeg?: number;
    maxViewAnchorResyncYawDeg?: number;
    maxViewAnchorResyncPitchDeg?: number;
    largeViewTurnCount?: number;
    maxAimMovementDivergenceDeg?: number;
    aimMovementDivergenceSamples?: number;
    aimMovementDivergenceOver45Count?: number;
    gradientProbeDeflections?: number;
    waypointsFollowedCount?: number;
    waypointReplanFailures?: number;
    waypointCount?: number;
    waypointIdx?: number;
    routeTargetResets?: number;
    routeNoProgressResets?: number;
    movementTransitions?: number;
    objectiveKind?: string | null;
    objectiveDistance?: number | null;
    objectiveZoneId?: string | null;
    nearestOpforDistance?: number | null;
    nearestPerceivedEnemyDistance?: number | null;
    currentTargetDistance?: number | null;
    pathTargetKind?: string | null;
    pathTargetDistance?: number | null;
    pathQueryStatus?: string | null;
    pathLength?: number | null;
    pathFailureReason?: string | null;
    pathQueryDistance?: number | null;
    pathStartSnapped?: boolean | null;
    pathEndSnapped?: boolean | null;
    pathStartSnapDistance?: number | null;
    pathEndSnapDistance?: number | null;
    maxPathStartSnapDistance?: number | null;
    maxPathEndSnapDistance?: number | null;
    untrustedPathSnapCount?: number | null;
    routeSnapEpochs?: Record<string, unknown>[];
    routeProgressDistance?: number | null;
    routeProgressAgeMs?: number | null;
    routeProgressTravelMeters?: number | null;
    firstObjectiveDistance?: number | null;
    minObjectiveDistance?: number | null;
    objectiveDistanceClosed?: number | null;
    playerDistanceMoved?: number | null;
    movementIntentCalls?: number | null;
    nonZeroMovementIntentCalls?: number | null;
    worldMovementIntentCalls?: number | null;
    cameraMovementIntentCalls?: number | null;
    nonZeroWorldMovementIntentCalls?: number | null;
    nonZeroCameraMovementIntentCalls?: number | null;
    lastMovementIntent?: Record<string, unknown> | null;
    lastNonZeroMovementIntent?: Record<string, unknown> | null;
    runtimeLiveness?: {
      engineFrameCount: number;
      harnessRafTicks: number;
      documentHidden: boolean | null;
      visibilityState: string | null;
      gameStarted: boolean;
      playerInHelicopter: boolean;
      playerInFixedWing: boolean;
      playerInVehicle: boolean;
      playerSpectating: boolean;
      playerPositionX: number | null;
      playerPositionY: number | null;
      playerPositionZ: number | null;
      playerVelocityX: number;
      playerVelocityY: number;
      playerVelocityZ: number;
      playerMovementSamples: number;
      playerAvgRequestedSpeed: number;
      playerAvgActualSpeed: number;
      playerBlockedByTerrain: number;
      terrainHeightAtPlayer: number | null;
      effectiveHeightAtPlayer: number | null;
      collisionHeightDeltaAtPlayer: number | null;
      collisionContributorsAtPlayer: Array<Record<string, unknown>>;
      playerMovementDebug: Record<string, unknown> | null;
    } | null;
    weaponHarness?: Record<string, unknown> | null;
    perceptionRange?: number | null;
    // Match-end lifecycle (harness-lifecycle-halt-on-match-end). Wall-clock ms
    // at which the harness driver first observed the match end; null while the
    // match is still active. Drives early capture finalization.
    matchEndedAtMs?: number | null;
    matchOutcome?: 'victory' | 'defeat' | 'draw' | null;
    // harness-stats-accuracy-damage-wiring: combat rollups from
    // PlayerStatsTracker.
    damageDealt?: number;
    damageTaken?: number;
    kills?: number;
    accuracy?: number;
    engineShotsFired?: number;
    engineShotsHit?: number;
    stateHistogramMs?: Record<string, number>;
  };
};

type HarnessDriverFinal = {
  respawnCount: number;
  driverSeed?: number | null;
  movementDecisionIntervalMs?: number | null;
  ammoRefillCount: number;
  healthTopUpCount: number;
  frontlineCompressed?: boolean | null;
  frontlineDistance?: number | null;
  frontlineMoveCount?: number | null;
  movementTransitions: number;
  losRejectedShots: number;
  losUnknownTargetChecks: number;
  fireUnknownLosRejectedShots: number;
  lastTargetLosStatus?: string | null;
  lastTargetLosReason?: string | null;
  lastFireLosStatus?: string | null;
  lastFireLosReason?: string | null;
  lastCurrentTargetLive?: boolean | null;
  lastCurrentTargetHealth?: number | null;
  lastCurrentTargetState?: string | null;
  shotEpochs?: Record<string, unknown>[];
  aimDotGateRejectedShots: number;
  fireStartRejected: number;
  runtimeShotPreviewRejectedShots?: number;
  runtimeShotPreviewAimSettlingShots?: number;
  runtimeShotPreviewTerrainBlockedShots?: number;
  runtimeShotPreviewUnavailableShots?: number;
  runtimeShotPreviewMissShots?: number;
  runtimeShotPreviewWrongTargetShots?: number;
  lastRuntimeShotPreviewStatus?: string | null;
  lastRuntimeShotPreviewReason?: string | null;
  lastRuntimeShotPreviewHitTargetId?: string | null;
  lastRuntimeShotPreviewExpectedInSpatialCandidates?: boolean | null;
  droppedDeadTargetLocks: number;
  firingRetargets: number;
  firingRetargetFireStops: number;
  firingRetargetEpochs?: Record<string, unknown>[];
  waypointsFollowedCount: number;
  waypointReplanFailures: number;
  routeTargetResets?: number;
  routeNoProgressResets?: number;
  shotsFired: number;
  reloadsIssued: number;
  maxViewYawStepDeg?: number;
  maxViewPitchStepDeg?: number;
  lastViewStepYawDeg?: number;
  lastViewStepPitchDeg?: number;
  lastRequestedViewYawDeltaDeg?: number;
  lastRequestedViewPitchDeltaDeg?: number;
  lastRemainingViewYawErrorDeg?: number;
  lastRemainingViewPitchErrorDeg?: number;
  lastViewYawClamped?: boolean | null;
  lastViewPitchClamped?: boolean | null;
  lastViewTargetKind?: string | null;
  lastViewAnchorResyncChanged?: boolean | null;
  lastViewAnchorResyncYawDeg?: number | null;
  lastViewAnchorResyncPitchDeg?: number | null;
  lastViewUpdateAtMs?: number | null;
  lastAimDot?: number | null;
  lastFireIntent?: boolean | null;
  lastAimGatePassed?: boolean | null;
  lastAimGateReason?: string | null;
  lastFireLosGatePassed?: boolean | null;
  viewSlewClampCount?: number;
  viewAnchorResyncCount?: number;
  maxRequestedViewYawDeltaDeg?: number;
  maxRequestedViewPitchDeltaDeg?: number;
  maxRemainingViewYawErrorDeg?: number;
  maxRemainingViewPitchErrorDeg?: number;
  maxViewAnchorResyncYawDeg?: number;
  maxViewAnchorResyncPitchDeg?: number;
  largeViewTurnCount?: number;
  maxAimMovementDivergenceDeg?: number;
  aimMovementDivergenceSamples?: number;
  aimMovementDivergenceOver45Count?: number;
  weaponHarness?: Record<string, unknown> | null;
  // Final values surfaced by the active driver's stop() call. These
  // are the canonical end-of-run combat numbers; the runtime-samples
  // stream contains per-sample readings of the same counters but they
  // may flicker as PlayerStatsTracker is reset on respawn.
  damageDealt: number;
  damageTaken: number;
  kills: number;
  accuracy: number;
  engineShotsFired: number;
  engineShotsHit: number;
  botState: string;
  stateHistogramMs: Record<string, number>;
  objectiveKind?: string | null;
  objectiveDistance?: number | null;
  objectiveZoneId?: string | null;
  nearestOpforDistance?: number | null;
  nearestPerceivedEnemyDistance?: number | null;
  currentTargetDistance?: number | null;
  pathTargetKind?: string | null;
  pathTargetDistance?: number | null;
  pathQueryStatus?: string | null;
  pathLength?: number | null;
  pathFailureReason?: string | null;
  pathQueryDistance?: number | null;
  pathStartSnapped?: boolean | null;
  pathEndSnapped?: boolean | null;
  pathStartSnapDistance?: number | null;
  pathEndSnapDistance?: number | null;
  maxPathStartSnapDistance?: number | null;
  maxPathEndSnapDistance?: number | null;
  untrustedPathSnapCount?: number | null;
  routeSnapEpochs?: Record<string, unknown>[];
  routeProgressDistance?: number | null;
  routeProgressAgeMs?: number | null;
  routeProgressTravelMeters?: number | null;
  firstObjectiveDistance?: number | null;
  minObjectiveDistance?: number | null;
  objectiveDistanceClosed?: number | null;
  playerDistanceMoved?: number | null;
  movementIntentCalls?: number | null;
  nonZeroMovementIntentCalls?: number | null;
  worldMovementIntentCalls?: number | null;
  cameraMovementIntentCalls?: number | null;
  nonZeroWorldMovementIntentCalls?: number | null;
  nonZeroCameraMovementIntentCalls?: number | null;
  lastMovementIntent?: Record<string, unknown> | null;
  lastNonZeroMovementIntent?: Record<string, unknown> | null;
  runtimeLiveness?: RuntimeSample['harnessDriver'] extends infer Driver
    ? Driver extends { runtimeLiveness?: infer Liveness }
      ? Liveness
      : never
    : never;
  perceptionRange?: number | null;
};

type CaptureSummary = {
  startedAt: string;
  endedAt: string;
  sourceGitSha: string;
  sourceGitStatus: string[];
  captureEnvironment: {
    quietMachineAttested: boolean;
    quietMachineAttestationSource?: string;
    quietMachineSnapshot?: QuietMachineSnapshot;
  };
  durationSeconds: number;
  npcs: number;
  requestedNpcs: number;
  url: string;
  status: 'ok' | 'failed';
  failureReason?: string;
  finalFrameCount: number;
  artifactDir: string;
  validation: ValidationReport;
  lastStage?: string;
  scenario: {
    mode: string;
    requestedMode: string;
    playerExperience: string;
    systemsEmphasized: string[];
  };
  harnessOverhead: {
    probeRoundTripAvgMs: number;
    probeRoundTripP95Ms: number;
    sampleCount: number;
    sampleIntervalMs: number;
    detailEverySamples: number;
    missedSampleErrors?: Record<string, number>;
  };
  measurementTrust: MeasurementTrustReport;
  rendererBackend?: RuntimeSample['rendererBackend'];
  gpuTiming?: GpuTimingSummary;
  droppedFrameMetrics?: DroppedFrameSummary;
  renderSubmissionMetrics?: RenderSubmissionSummary;
  materializationTierMetrics?: MaterializationTierEventSummary;
  simLaneTransitionMetrics?: SimLaneTransitionSummary;
  closeModelEnvelope?: CloseModelEnvelopeSummary;
  presentationGapContexts?: PresentationGapContextSummary;
  sceneAttribution?: SceneAttributionEntry[];
  startupTiming?: {
    firstEngineSeenSec?: number;
    firstMetricsSeenSec?: number;
    thresholdReachedSec?: number;
    lastStartupMark?: string;
    lastStartupMarkMs?: number;
  };
  toolchain?: {
    prewarmEnabled: boolean;
    prewarmTotalMs: number;
    prewarmAllOk: boolean;
    runtimePreflightEnabled: boolean;
    runtimePreflightMs: number;
    runtimePreflightOk: boolean;
  };
  perfRuntime?: {
    matchDurationSeconds?: number;
    presentationContextCapture: boolean;
    weatherStateOverride?: string;
    frontlineCompressionRequested: boolean;
    victoryConditionsDisabled: boolean;
    npcCloseModelsDisabled: boolean;
    terrainShadowsDisabled: boolean;
    terrainShadowPassMode: 'bounded-default' | 'bounded-requested' | 'full-diagnostic';
    terrainFullShadowPassEnabled: boolean;
    boundedTerrainShadowPassEnabled: boolean;
    boundedTerrainShadowPassRequested: boolean;
    terrainForceInstanceUploadEnabled: boolean;
    terrainHeightAwareFrustumRequested: boolean;
    terrainHeightAwareFrustumDisabled: boolean;
    terrainHeightAwareFrustumEnabled?: boolean;
    terrainHeightBoundsSource?: string;
    terrainHeightBoundsTests?: number;
    terrainHeightBoundsFallbacks?: number;
    terrainHeightBoundsRejectedNodes?: number;
    terrainPlayableWorldSize?: number;
    terrainVisualWorldSize?: number;
    terrainVisualMargin?: number;
    terrainMaxLODLevels?: number;
    terrainLodRange0?: number;
    terrainLodRangeLast?: number;
    terrainLod0VertexSpacing?: number;
    terrainFullSkirtsRequested: boolean;
    terrainSparseSkirtsRequested: boolean;
    terrainSkirtsDisabled: boolean;
    terrainFarCanopyTintDisabled: boolean;
    terrainLowSunOcclusionDisabled: boolean;
    wildlifeDisabled: boolean;
  };
  // Match-end lifecycle (harness-lifecycle-halt-on-match-end).
  // matchEndedAtMs is wall-clock-ms-since-capture-start when the harness
  // observed match end; null/undefined when the match was still live at the
  // configured duration. Memo writers compare against durationSeconds*1000 to
  // report in-match vs post-match coverage.
  matchEndedAtMs?: number | null;
  matchOutcome?: 'victory' | 'defeat' | 'draw' | null;
  // harness-stats-accuracy-damage-wiring: end-of-run combat rollups
  // (kills, damage dealt/taken, accuracy, state histogram) lifted from
  // the active driver's stop() call. Optional: only present when the
  // active player scenario was enabled and the stop call returned data.
  harnessDriverFinal?: HarnessDriverFinal;
  terrainRecoveryEvents?: Record<string, unknown>[];
  materializationTierEvents?: Record<string, unknown>[];
  shotVisualCaptures?: ShotVisualCapture[];
  // combat-p99-tail-attribution (DEFEKT-3): per-method attribution of the
  // single worst-p99 sample window, computed from the existing combatBreakdown
  // timers. Baseline-free — answers "where is the tail frame's time?" from one
  // capture. Undefined when no sample carried a combatBreakdown. Type +
  // implementation live in ./perf-tail-attribution.
  tailAttribution?: TailAttribution;
};

type QuietMachineSnapshot = {
  checkedAt: string;
  status: 'pass' | 'warn' | 'fail';
  cpu?: {
    source: string;
    avgPercent: number;
    maxPercent: number;
    samples: number[];
  };
  gpu?: {
    source: string;
    available: boolean;
    loadClass?: 'idle' | 'background' | 'busy';
    utilizationPercent?: number;
    memoryUtilizationPercent?: number;
    memoryUsedMiB?: number;
    memoryTotalMiB?: number;
    memoryUsedPercent?: number;
  };
  warnings: string[];
};

type DroppedFrameSummary = {
  engine: {
    frameCount: number;
    hitch33Count: number;
    hitch50Count: number;
    hitch100Count: number;
    hitch33Percent: number;
    hitch50Percent: number;
    hitch100Percent: number;
  };
  browserRaf?: {
    intervalCount: number;
    totalGapMs: number;
    avgGapMs: number;
    maxGapMs: number;
    stutter25Count: number;
    hitch33Count: number;
    hitch50Count: number;
    hitch100Count: number;
    stutter25Percent: number;
    hitch33Percent: number;
    overBudget60HzMs: number;
    overBudget60HzMsPerSecond: number;
    droppedFrameTime60HzMs: number;
    droppedFrameTime60HzMsPerSecond: number;
    estimatedDropped60HzFrames: number;
    estimatedDropped60HzFramesPerSecond: number;
  };
  observers?: {
    longTaskCount: number;
    longTaskTotalDurationMs: number;
    longTaskMaxDurationMs: number;
    longAnimationFrameCount: number;
    longAnimationFrameTotalDurationMs: number;
    longAnimationFrameMaxDurationMs: number;
    longAnimationFrameBlockingDurationMs: number;
    webglTextureUploadCount?: number;
    webglTextureUploadTotalDurationMs?: number;
    webglTextureUploadMaxDurationMs?: number;
  };
};

type GpuTimingSummary = {
  requested: boolean;
  queryEnabled: boolean;
  sampleCount: number;
  availableSamples: number;
  latest?: RuntimeSample['gpu'];
  avgGpuTimeMs?: number;
  peakGpuTimeMs?: number;
  rendererBackend?: RuntimeSample['rendererBackend'];
};

type RenderSubmissionSummary = {
  sampleCount: number;
  latest?: {
    mode?: string;
    rawFrameCount?: number;
    frameCountStart: number | null;
    frameCountEnd: number | null;
    topCategories: RuntimeRenderSubmissionCategory[];
    unattributed?: RuntimeRenderSubmissionCategory;
  };
  peakFrame?: {
    frameCount: number;
    drawSubmissions: number;
    triangles: number;
    topCategories: RuntimeRenderSubmissionCategory[];
    unattributed?: RuntimeRenderSubmissionCategory;
  };
};

type MaterializationTierEventSummary = {
  sampleCount: number;
  totalEvents: number;
  byTransition: Record<string, number>;
  byReason: Record<string, number>;
  byToRender: Record<string, number>;
  transitionWindowTotalEvents: number;
  transitionWindowByTransition: Record<string, number>;
  transitionWindowByReason: Record<string, number>;
  peakSample?: {
    ts: string;
    frameCount: number;
    eventCount: number;
    byTransition: Record<string, number>;
    byReason: Record<string, number>;
  };
  peakTransitionWindowSample?: {
    ts: string;
    frameCount: number;
    eventCount: number;
    byTransition: Record<string, number>;
    byReason: Record<string, number>;
  };
};

type SimLaneTransitionStats = NonNullable<
  NonNullable<NonNullable<RuntimeSample['combatBreakdown']>['aiScheduling']>['simLaneTransitions']
>;

type SimLaneTransitionSummary = {
  sampleCount: number;
  samplesWithTransitions: number;
  totalTransitions: number;
  towardHigherFidelity: number;
  towardLowerFidelity: number;
  byTransition: Record<string, number>;
  peakTransitionSample?: {
    ts: string;
    frameCount: number;
    total: number;
    towardHigherFidelity: number;
    towardLowerFidelity: number;
    byTransition: Record<string, number>;
    maxRenderedLagMeters: number;
    maxTransitionRenderedLagMeters: number;
  };
  maxRenderedLagMeters: number;
  maxRenderedHorizontalLagMeters: number;
  maxRenderedVerticalLagMeters: number;
  maxTransitionRenderedLagMeters: number;
};

type CloseModelEnvelopeSummary = {
  sampleCount: number;
  samplesWithCandidates: number;
  samplesWithRenderedCloseModels: number;
  peakCandidatesWithinCloseRadius: number;
  peakRenderedCloseModels: number;
  peakActiveCloseModels: number;
  peakFallbackCount: number;
  peakPromotionsThisFrame: number;
  peakReplacementsThisFrame: number;
  promotionBudgetPerFrame: number | null;
};

type ShotPresentationContextStats = {
  shotEpochCount: number;
  contextCount: number;
  maxCameraYawDeltaDeg: number;
  maxCameraPitchDeltaDeg: number;
  maxCameraPositionDeltaMeters: number;
  minClearanceMeters: number | null;
  minEffectiveClearanceMeters: number | null;
  terrainHashChurnEvents: number;
  terrainIdentityChurnEvents: number;
  terrainEdgeMaskChurnEvents: number;
  terrainMorphOnlyChurnEvents: number;
  terrainUnsyncedBufferVisibleChurnEvents: number;
  terrainNotReadyEvents: number;
};

type MovementViewerPayload = {
  movementArtifacts: MovementArtifactReportForViewer;
  terrainContext: MovementTerrainOverlayArtifact;
};

type StartupDiagnostics = {
  ts: string;
  readyState: string;
  frameCount: number;
  hasMetrics: boolean;
  hasEngine: boolean;
  hasPerfApi: boolean;
  rendererBackend?: RuntimeSample['rendererBackend'];
  bodyClassName: string;
  errorPanelVisible: boolean;
  gameStarted: boolean;
  startupPhase: string | null;
  rafTicks: number;
  hidden: boolean;
  visibilityState: string;
  activeViewTransition: boolean;
  uiTransitionEnabled: boolean;
  uiTransitionReason: string | null;
};

type ValidationCheckStatus = 'pass' | 'warn' | 'fail';

type ValidationCheck = {
  id: string;
  status: ValidationCheckStatus;
  value: number;
  message: string;
};

type ValidationReport = {
  overall: ValidationCheckStatus;
  checks: ValidationCheck[];
};

type MeasurementTrustReport = {
  status: ValidationCheckStatus;
  probeRoundTripAvgMs: number;
  probeRoundTripP95Ms: number;
  probeRoundTripMaxMs: number;
  probeRoundTripSamplesMs: number[];
  sampleCount: number;
  missedSamples: number;
  missedSampleRate: number;
  sampleIntervalMs: number;
  detailEverySamples: number;
  rendererBackend?: RuntimeSample['rendererBackend'];
  checks: ValidationCheck[];
  summary: string;
};

type SceneAttributionEntry = {
  category: string;
  objects: number;
  visibleObjects: number;
  meshes: number;
  visibleMeshes?: number;
  instancedMeshes: number;
  visibleInstancedMeshes?: number;
  drawCallLike: number;
  visibleDrawCallLike?: number;
  instances: number;
  visibleInstances?: number;
  triangles: number;
  visibleTriangles: number;
  materials: number;
  geometries: number;
  examples?: Array<{
    nameChain: string;
    type: string;
    modelPath: string | null;
    materialType: string | null;
    triangles: number;
    instances: number;
    effectivelyVisible: boolean;
  }>;
  visibleExamples?: Array<{
    nameChain: string;
    type: string;
    modelPath: string | null;
    materialType: string | null;
    triangles: number;
    instances: number;
  }>;
};

type RuntimeSceneAttributionSample = {
  sampleIndex: number;
  ts: string;
  frameCount: number;
  maxFrameMs: number | null;
  renderer: RuntimeSample['renderer'] | null;
  sceneAttribution: SceneAttributionEntry[] | null;
  sceneAttributionError: string | null;
};

type RuntimeRenderSubmissionCategory = {
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
};

type RuntimeRenderSubmissionFrame = {
  frameCount: number;
  firstAtMs: number;
  lastAtMs: number;
  drawSubmissions: number;
  triangles: number;
  instances: number;
  passTypes?: Record<string, number>;
  categories: RuntimeRenderSubmissionCategory[];
};

type RuntimeRenderSubmissionDrain = {
  mode?: string;
  installedCount: number;
  installPasses: number;
  rawFrameCount?: number;
  frameCountStart: number | null;
  frameCountEnd: number | null;
  frames: RuntimeRenderSubmissionFrame[];
  totals: RuntimeRenderSubmissionCategory[];
  errors?: string[];
};

type RuntimeRenderSubmissionSample = {
  sampleIndex: number;
  ts: string;
  frameCount: number;
  maxFrameMs: number | null;
  renderer: RuntimeSample['renderer'] | null;
  renderSubmissions: RuntimeRenderSubmissionDrain | null;
  renderSubmissionError: string | null;
};

const DEV_SERVER_PORT = 9100;
const DEFAULT_DURATION_SECONDS = 90;
const DEFAULT_WARMUP_SECONDS = 15;
const DEFAULT_NPCS = 60;
const DEFAULT_STARTUP_TIMEOUT_SECONDS = 120;
const DEFAULT_STARTUP_FRAME_THRESHOLD = 30;
const DEFAULT_ACTIVE_PLAYER = true;
const DEFAULT_GAME_MODE = 'ai_sandbox';
const DEFAULT_COMPRESS_FRONTLINE = false;
const DEFAULT_ALLOW_WARP_RECOVERY = false;
const DEFAULT_ACTIVE_TOP_UP_HEALTH = true;
const DEFAULT_ACTIVE_AUTO_RESPAWN = true;
const DEFAULT_MOVEMENT_DECISION_INTERVAL_MS = 250;
const DEFAULT_PREWARM = true;
const DEFAULT_RUNTIME_PREFLIGHT = false;
const DEFAULT_RUNTIME_PREFLIGHT_TIMEOUT_SECONDS = 8;
const DEFAULT_SANDBOX_MODE = false;
const DEFAULT_FRONTLINE_TRIGGER_DISTANCE = 500;
const DEFAULT_MAX_COMPRESSED_PER_FACTION = 28;
const DEFAULT_SAMPLE_INTERVAL_MS = 1000;
const DEFAULT_DETAIL_EVERY_SAMPLES = 1;
const DEFAULT_PRESSURE_READY_TIMEOUT_SECONDS = 120;
const PRESSURE_READY_POLL_MS = 1000;
const PRESSURE_READY_CONSECUTIVE_SAMPLES = 2;
const SHOT_VISUAL_CORRELATION_WINDOW_MS = 3000;
const SHOT_VISUAL_PRESENTATION_GAP_WINDOW_MS = 500;
const SHOT_VISUAL_ROUTE_SNAP_THRESHOLD_M = 12;
const STEP_TIMEOUT_MS = 30_000;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const MIN_RUN_HARD_TIMEOUT_MS = 120_000;
const LOCK_FILE = join(process.cwd(), 'tmp', 'perf-capture.lock');
const CDP_STOP_TIMEOUT_MS = 10_000;
const TRACE_STOP_TIMEOUT_MS = 15_000;
const SCENARIO_SETUP_TIMEOUT_MS = 10_000;
const POST_CAPTURE_HARD_TIMEOUT_MS = 120_000;
const PERF_SERVER_HOST = '127.0.0.1';
const PAGE_EVALUATE_HELPER_SHIM_SOURCE = `
(() => {
  if (typeof globalThis.__name !== 'function') {
    globalThis.__name = function(target) { return target; };
  }
})();
`;
// harness-lifecycle-halt-on-match-end: load the pure helpers from the driver's
// CJS surface so the regression test (scripts/perf-harness/...) and the live
// capture both consume the same `shouldFinalizeAfterMatchEnd` definition. The
// alternative (a TS-side helper) would force the test to import this file,
// which pulls in playwright + auto-runs runCapture() at module load.
const lifecycleRequire = createRequire(import.meta.url);
const { shouldFinalizeAfterMatchEnd, MATCH_END_TAIL_MS } = lifecycleRequire('./perf-active-driver.cjs') as {
  shouldFinalizeAfterMatchEnd: (matchEndedAtMs: number | null | undefined, nowMs: number, tailMs?: number) => boolean;
  MATCH_END_TAIL_MS: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function logStep(msg: string): void {
  console.log(`[${nowIso()}] ${msg}`);
}

function gitOutputOrFallback(args: string[], fallback: string): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function currentGitSha(): string {
  return gitOutputOrFallback(['rev-parse', 'HEAD'], 'unknown');
}

function gitStatus(): string[] {
  const output = gitOutputOrFallback(['status', '--short'], '');
  return output.split(/\r?\n/).filter(Boolean);
}

async function safeAwait<T>(label: string, promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  try {
    return await withTimeout(label, promise, timeoutMs);
  } catch (error) {
    logStep(`⚠ ${label} failed/timed out: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function installPageEvaluateHelperShim(context: BrowserContext): Promise<void> {
  // tsx/esbuild can serialize page.evaluate callbacks with a `__name` helper
  // that exists in Node but not in the browser page context.
  await withTimeout(
    'install page evaluate helper shim',
    context.addInitScript({ content: PAGE_EVALUATE_HELPER_SHIM_SOURCE }),
    STEP_TIMEOUT_MS
  );
}

async function ensurePageEvaluateHelperShim(page: Page): Promise<void> {
  await withTimeout(
    'ensure page evaluate helper shim',
    page.evaluate(PAGE_EVALUATE_HELPER_SHIM_SOURCE),
    5_000
  );
}

async function foregroundCapturePage(page: Page): Promise<void> {
  await safeAwait('page.bringToFront', page.bringToFront(), 3_000);
  await safeAwait(
    'page focus',
    page.evaluate(() => {
      window.focus();
      if (document.body instanceof HTMLElement) {
        document.body.focus({ preventScroll: true });
      }
    }),
    3_000
  );
}

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireRunLock(): void {
  mkdirSync(join(process.cwd(), 'tmp'), { recursive: true });
  if (existsSync(LOCK_FILE)) {
    try {
      const raw = readFileSync(LOCK_FILE, 'utf-8');
      const current = JSON.parse(raw) as { pid?: number; startedAt?: string };
      if (current.pid && isPidAlive(current.pid)) {
        throw new Error(`perf capture already running (pid=${current.pid}, startedAt=${current.startedAt ?? 'unknown'})`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('perf capture already running')) {
        throw error;
      }
    }
  }
  writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: nowIso() }, null, 2), 'utf-8');
}

function releaseRunLock(): void {
  if (existsSync(LOCK_FILE)) {
    try {
      unlinkSync(LOCK_FILE);
    } catch {
      // best effort
    }
  }
}

function forceKillPlaywrightBrowsers(userDataDir: string): void {
  if (process.platform !== 'win32') return;
  try {
    const escapedPath = userDataDir.replace(/\\/g, '\\\\').replace(/'/g, "''");
    const psScript = [
      "$targets = Get-CimInstance Win32_Process | Where-Object {",
      "  ($_.Name -in @('chrome.exe','msedge.exe')) -and ($_.CommandLine -like '*" + escapedPath + "*')",
      "};",
      "$targets | Select-Object -ExpandProperty ProcessId"
    ].join(' ');

    const collector = spawn('powershell', ['-NoProfile', '-Command', psScript], { shell: true });
    let output = '';
    collector.stdout.on('data', (d) => {
      output += d.toString();
    });
    collector.on('exit', () => {
      const pids = output
        .split(/\r?\n/)
        .map(v => Number(v.trim()))
        .filter(v => Number.isFinite(v) && v > 0);
      for (const pid of pids) {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
      }
      if (pids.length > 0) {
        logStep(`🧹 Forced cleanup of ${pids.length} Playwright browser processes`);
      }
    });
  } catch {
    // best effort
  }
}

function parseNumberFlag(name: string, fallback: number): number {
  const envName = name.toUpperCase().replace(/-/g, '_');
  const envKeys = [
    `PERF_${envName}`,
    `npm_config_${name}`
  ];
  for (const key of envKeys) {
    const raw = process.env[key];
    if (raw !== undefined) {
      const value = Number(raw);
      if (Number.isFinite(value)) return value;
    }
  }

  const eqArg = process.argv.find(a => a.startsWith(`--${name}=`));
  if (eqArg) {
    const value = Number(eqArg.split('=')[1]);
    return Number.isFinite(value) ? value : fallback;
  }

  const key = `--${name}`;
  const index = process.argv.indexOf(key);
  if (index >= 0 && index + 1 < process.argv.length) {
    const value = Number(process.argv[index + 1]);
    return Number.isFinite(value) ? value : fallback;
  }

  return fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function objectArray(value: unknown, limit = 32): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const rawMax = Math.floor(limit);
  const max = Number.isFinite(rawMax) ? Math.max(1, rawMax) : value.length;
  const start = Math.max(0, value.length - max);
  const entries: Record<string, unknown>[] = [];
  for (let index = start; index < value.length; index += 1) {
    const entry = objectOrNull(value[index]);
    if (entry) entries.push(entry);
  }
  return entries;
}

function latestObject(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return objectOrNull(value[value.length - 1]);
}

function latestString(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const entry = value[index];
    if (typeof entry === 'string') return entry;
  }
  return null;
}

function eventNumber(event: Record<string, unknown> | null, key: string): number | null {
  if (!event) return null;
  return nullableNumber(event[key]);
}

function eventSampleTimeMs(sample: RuntimeSample, event: Record<string, unknown> | null, key = 'atMs'): number | null {
  const atMs = eventNumber(event, key);
  if (atMs === null) return null;
  const pagePerformanceNowMs = nullableNumber(sample.pagePerformanceNowMs);
  const pageWallNowMs = nullableNumber(sample.pageWallNowMs);
  if (
    atMs > 1_000_000_000 &&
    pagePerformanceNowMs !== null &&
    pageWallNowMs !== null
  ) {
    return pagePerformanceNowMs - (pageWallNowMs - atMs);
  }
  return atMs;
}

function eventString(event: Record<string, unknown> | null, key: string): string | null {
  if (!event) return null;
  const value = event[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function routeSnapDistanceMeters(event: Record<string, unknown> | null): number {
  if (!event) return 0;
  return Math.max(
    eventNumber(event, 'pathStartSnapDistance') ?? 0,
    eventNumber(event, 'pathEndSnapDistance') ?? 0,
    eventNumber(event, 'startSnapDistance') ?? 0,
    eventNumber(event, 'endSnapDistance') ?? 0
  );
}

function formatNullableMeters(value: number | null): string {
  return value === null ? 'na' : `${value.toFixed(2)}m`;
}

function nearestPresentationGapToSampleTime(
  sample: RuntimeSample,
  atMs: number | null,
): { gap: PresentationGapContextSummary['latest'][number]; deltaMs?: number } | null {
  const entries = sample.browserStalls?.recent?.rafCadence?.entries ?? [];
  let nearest: { gap: PresentationGapContextSummary['latest'][number]; deltaMs?: number } | null = null;
  for (const entry of entries) {
    const gapMs = Number(entry.gapMs ?? 0);
    if (!Number.isFinite(gapMs) || gapMs <= 0) continue;
    const gap: PresentationGapContextSummary['latest'][number] = {
      atMs: Number(entry.atMs ?? 0),
      gapMs,
      estimatedDropped60HzFrames: Number(entry.estimatedDropped60HzFrames ?? 0),
      overBudget60HzMs: Number(entry.overBudget60HzMs ?? 0),
      droppedFrameTime60HzMs: Number(entry.droppedFrameTime60HzMs ?? 0),
      presentationContext: objectOrNull(entry.presentationContext),
      harnessContext: objectOrNull(entry.harnessContext),
      sampleTs: sample.ts,
      sampleFrameCount: sample.frameCount,
    };
    const gapAtMs = nullableNumber(gap.atMs);
    const deltaMs = atMs !== null && gapAtMs !== null
      ? Math.abs(gapAtMs - atMs)
      : undefined;
    if (!nearest) {
      nearest = { gap, deltaMs };
      continue;
    }
    const nearestScore = nearest.deltaMs ?? Number.POSITIVE_INFINITY;
    const score = deltaMs ?? Number.POSITIVE_INFINITY;
    if (score < nearestScore || (score === nearestScore && gap.gapMs > nearest.gap.gapMs)) {
      nearest = { gap, deltaMs };
    }
  }
  return nearest;
}

function eventKey(kind: string, event: Record<string, unknown>): string {
  const atMs = eventNumber(event, 'atMs');
  const id = eventString(event, 'targetId')
    ?? eventString(event, 'combatantId')
    ?? eventString(event, 'pathTargetKind')
    ?? eventString(event, 'status')
    ?? 'unknown';
  return `${kind}:${Number.isFinite(atMs) ? atMs!.toFixed(1) : 'na'}:${id}`;
}

function sanitizeFilePart(value: string): string {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized.length > 0 ? sanitized : 'capture';
}

function selectShotVisualCaptureTrigger(sample: RuntimeSample): ShotVisualCaptureTrigger | null {
  const latestShotEpoch = latestObject(sample.harnessDriver?.shotEpochs);
  const latestRouteSnapEpoch = latestObject(sample.harnessDriver?.routeSnapEpochs);
  const latestTerrainRecoveryEvent = latestObject(sample.terrainRecoveryEvents);
  if (!latestShotEpoch && !latestRouteSnapEpoch && !latestTerrainRecoveryEvent) return null;

  const shotAtMs = eventSampleTimeMs(sample, latestShotEpoch);
  const routeAtMs = eventSampleTimeMs(sample, latestRouteSnapEpoch);
  const recoveryAtMs = eventSampleTimeMs(sample, latestTerrainRecoveryEvent);
  const shotRouteSnapDistance = routeSnapDistanceMeters(latestShotEpoch);
  const epochRouteSnapDistance = routeSnapDistanceMeters(latestRouteSnapEpoch);
  const maxRouteSnapDistance = Math.max(shotRouteSnapDistance, epochRouteSnapDistance);
  const routeSnapDeltaMs = shotAtMs !== null && routeAtMs !== null
    ? Math.abs(shotAtMs - routeAtMs)
    : undefined;
  const terrainRecoveryDeltaMs = shotAtMs !== null && recoveryAtMs !== null
    ? Math.abs(shotAtMs - recoveryAtMs)
    : undefined;
  const nearestPresentationGap = nearestPresentationGapToSampleTime(
    sample,
    shotAtMs ?? routeAtMs ?? recoveryAtMs
  );
  const presentationGapDeltaMs = nearestPresentationGap?.deltaMs;
  const presentationGapNearShot = latestShotEpoch !== null
    && presentationGapDeltaMs !== undefined
    && presentationGapDeltaMs <= SHOT_VISUAL_PRESENTATION_GAP_WINDOW_MS;

  let reason: string | null = null;
  let keyEvent: Record<string, unknown> | null = latestShotEpoch ?? latestRouteSnapEpoch ?? latestTerrainRecoveryEvent;
  let keyKind = 'visual';
  if (
    latestShotEpoch &&
    routeSnapDeltaMs !== undefined &&
    routeSnapDeltaMs <= SHOT_VISUAL_CORRELATION_WINDOW_MS &&
    maxRouteSnapDistance >= SHOT_VISUAL_ROUTE_SNAP_THRESHOLD_M
  ) {
    reason = 'shot_route_snap';
    keyEvent = latestShotEpoch;
    keyKind = 'shot-route';
  } else if (
    latestShotEpoch &&
    terrainRecoveryDeltaMs !== undefined &&
    terrainRecoveryDeltaMs <= SHOT_VISUAL_CORRELATION_WINDOW_MS
  ) {
    reason = 'shot_terrain_recovery';
    keyEvent = latestShotEpoch;
    keyKind = 'shot-recovery';
  } else if (presentationGapNearShot) {
    reason = 'shot_presentation_gap';
    keyEvent = latestShotEpoch;
    keyKind = 'shot-presentation';
  } else if (latestShotEpoch && shotRouteSnapDistance >= SHOT_VISUAL_ROUTE_SNAP_THRESHOLD_M) {
    reason = 'shot_path_snap';
    keyEvent = latestShotEpoch;
    keyKind = 'shot-path';
  } else if (latestRouteSnapEpoch && epochRouteSnapDistance >= SHOT_VISUAL_ROUTE_SNAP_THRESHOLD_M) {
    reason = 'route_snap';
    keyEvent = latestRouteSnapEpoch;
    keyKind = 'route';
  } else if (latestShotEpoch) {
    reason = 'shot_epoch';
    keyEvent = latestShotEpoch;
    keyKind = 'shot';
  }

  if (!reason || !keyEvent) return null;

  return {
    key: eventKey(keyKind, keyEvent),
    reason,
    routeSnapDistanceMeters: maxRouteSnapDistance > 0 ? maxRouteSnapDistance : undefined,
    routeSnapDeltaMs,
    terrainRecoveryDeltaMs,
    presentationGapDeltaMs,
    latestShotEpoch: latestShotEpoch ?? undefined,
    latestRouteSnapEpoch: latestRouteSnapEpoch ?? undefined,
    latestTerrainRecoveryEvent: latestTerrainRecoveryEvent ?? undefined,
    latestPresentationGap: nearestPresentationGap?.gap
  };
}

function writeShotVisualCaptureManifest(state: ShotVisualCaptureState): void {
  if (state.captures.length === 0) return;
  writeFileSync(
    join(state.artifactDir, 'shot-visual-captures.json'),
    JSON.stringify(state.captures, null, 2),
    'utf-8'
  );
}

async function maybeCaptureShotVisualFrame(
  page: Page,
  sample: RuntimeSample,
  sampleIndex: number,
  sampleElapsedMs: number,
  state: ShotVisualCaptureState
): Promise<void> {
  if (!state.enabled || state.maxCaptures <= 0 || state.captures.length >= state.maxCaptures) return;
  const trigger = selectShotVisualCaptureTrigger(sample);
  if (!trigger || state.seenKeys.has(trigger.key)) return;
  if (state.lastCaptureElapsedMs >= 0 && sampleElapsedMs - state.lastCaptureElapsedMs < state.cooldownMs) return;

  state.seenKeys.add(trigger.key);
  mkdirSync(join(state.artifactDir, 'shot-visual-captures'), { recursive: true });
  const ordinal = String(state.captures.length + 1).padStart(2, '0');
  const file = join('shot-visual-captures', `${ordinal}-${sanitizeFilePart(trigger.reason)}.png`);
  const screenshot = await safeAwait(
    'page.screenshot.shot-visual',
    page.screenshot({ path: join(state.artifactDir, file), fullPage: false }),
    3_000
  );
  if (!screenshot) return;

  state.lastCaptureElapsedMs = sampleElapsedMs;
  state.captures.push({
    ts: nowIso(),
    sampleIndex,
    sampleElapsedMs,
    frameCount: sample.frameCount,
    reason: trigger.reason,
    file,
    routeSnapDistanceMeters: trigger.routeSnapDistanceMeters,
    routeSnapDeltaMs: trigger.routeSnapDeltaMs,
    terrainRecoveryDeltaMs: trigger.terrainRecoveryDeltaMs,
    presentationGapDeltaMs: trigger.presentationGapDeltaMs,
    latestShotEpoch: trigger.latestShotEpoch,
    latestRouteSnapEpoch: trigger.latestRouteSnapEpoch,
    latestTerrainRecoveryEvent: trigger.latestTerrainRecoveryEvent,
    latestPresentationGap: trigger.latestPresentationGap
  });
  writeShotVisualCaptureManifest(state);
  logStep(`📸 Shot visual capture ${ordinal}/${state.maxCaptures}: ${trigger.reason} -> ${file}`);
}

function normalizeRuntimeLiveness(value: unknown): NonNullable<RuntimeSample['harnessDriver']>['runtimeLiveness'] {
  const raw = objectOrNull(value);
  if (!raw) return null;
  return {
    engineFrameCount: Number(raw.engineFrameCount ?? 0),
    harnessRafTicks: Number(raw.harnessRafTicks ?? 0),
    documentHidden: typeof raw.documentHidden === 'boolean' ? raw.documentHidden : null,
    visibilityState: typeof raw.visibilityState === 'string' ? raw.visibilityState : null,
    gameStarted: Boolean(raw.gameStarted),
    playerInHelicopter: Boolean(raw.playerInHelicopter),
    playerInFixedWing: Boolean(raw.playerInFixedWing),
    playerInVehicle: Boolean(raw.playerInVehicle),
    playerSpectating: Boolean(raw.playerSpectating),
    playerPositionX: nullableNumber(raw.playerPositionX),
    playerPositionY: nullableNumber(raw.playerPositionY),
    playerPositionZ: nullableNumber(raw.playerPositionZ),
    playerVelocityX: Number(raw.playerVelocityX ?? 0),
    playerVelocityY: Number(raw.playerVelocityY ?? 0),
    playerVelocityZ: Number(raw.playerVelocityZ ?? 0),
    playerMovementSamples: Number(raw.playerMovementSamples ?? 0),
    playerAvgRequestedSpeed: Number(raw.playerAvgRequestedSpeed ?? 0),
    playerAvgActualSpeed: Number(raw.playerAvgActualSpeed ?? 0),
    playerBlockedByTerrain: Number(raw.playerBlockedByTerrain ?? 0),
    terrainHeightAtPlayer: nullableNumber(raw.terrainHeightAtPlayer),
    effectiveHeightAtPlayer: nullableNumber(raw.effectiveHeightAtPlayer),
    collisionHeightDeltaAtPlayer: nullableNumber(raw.collisionHeightDeltaAtPlayer),
    collisionContributorsAtPlayer: Array.isArray(raw.collisionContributorsAtPlayer)
      ? raw.collisionContributorsAtPlayer.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      : [],
    playerMovementDebug: objectOrNull(raw.playerMovementDebug),
  };
}

function parseBooleanFlag(name: string, fallback: boolean): boolean {
  const envName = name.toUpperCase().replace(/-/g, '_');
  const envKeys = [
    `PERF_${envName}`,
    `npm_config_${name}`
  ];
  for (const key of envKeys) {
    const raw = process.env[key];
    if (raw !== undefined) {
      const normalized = String(raw).toLowerCase();
      if (normalized === '1' || normalized === 'true') return true;
      if (normalized === '0' || normalized === 'false') return false;
    }
  }

  const eqArg = process.argv.find(a => a.startsWith(`--${name}=`));
  if (eqArg) {
    const value = eqArg.split('=')[1].toLowerCase();
    if (value === '1' || value === 'true') return true;
    if (value === '0' || value === 'false') return false;
  }

  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx >= 0) {
    const next = process.argv[idx + 1]?.toLowerCase();
    if (next === '1' || next === 'true') return true;
    if (next === '0' || next === 'false') return false;
    return true;
  }

  if (process.argv.includes(`--no-${name}`)) return false;
  return fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function roundQuietMetric(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

const QUIET_CPU_AVG_FAIL_PERCENT = 15;
const QUIET_CPU_MAX_FAIL_PERCENT = 35;
const QUIET_GPU_WARN_PERCENT = 10;
const QUIET_GPU_FAIL_PERCENT = 35;
const QUIET_GPU_MEMORY_WARN_PERCENT = 75;
const QUIET_GPU_MEMORY_FAIL_PERCENT = 90;

function captureQuietMachineSnapshot(): QuietMachineSnapshot {
  const warnings: string[] = [];
  const failures: string[] = [];
  let cpu: QuietMachineSnapshot['cpu'];
  let gpu: QuietMachineSnapshot['gpu'];

  try {
    const cpuJson = execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      "$samples = Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 5; " +
        "$values = @($samples.CounterSamples | ForEach-Object { [double]$_.CookedValue }); " +
        "$avg = ($values | Measure-Object -Average).Average; " +
        "$max = ($values | Measure-Object -Maximum).Maximum; " +
        "[pscustomobject]@{ avg=$avg; max=$max; samples=$values } | ConvertTo-Json -Compress",
    ], { encoding: 'utf-8', timeout: 8000 }).trim();
    const parsed = JSON.parse(cpuJson) as { avg?: number; max?: number; samples?: number[] | number };
    const samples = Array.isArray(parsed.samples)
      ? parsed.samples
      : typeof parsed.samples === 'number'
        ? [parsed.samples]
        : [];
    cpu = {
      source: 'powershell:Get-Counter Processor(_Total) % Processor Time',
      avgPercent: roundQuietMetric(Number(parsed.avg ?? 0)),
      maxPercent: roundQuietMetric(Number(parsed.max ?? 0)),
      samples: samples.map((value) => roundQuietMetric(Number(value))),
    };
  } catch (error) {
    warnings.push(`CPU quiet snapshot unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const gpuCsv = execFileSync('nvidia-smi', [
      '--query-gpu=utilization.gpu,utilization.memory,memory.used,memory.total',
      '--format=csv,noheader,nounits',
    ], { encoding: 'utf-8', timeout: 5000 }).trim();
    const firstLine = gpuCsv.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
    const [utilizationRaw, memoryUtilRaw, memoryUsedRaw, memoryTotalRaw] = firstLine.split(',').map((part) => part.trim());
    const utilizationPercent = roundQuietMetric(Number(utilizationRaw));
    const memoryUsedMiB = roundQuietMetric(Number(memoryUsedRaw));
    const memoryTotalMiB = roundQuietMetric(Number(memoryTotalRaw));
    const memoryUsedPercent = memoryTotalMiB > 0
      ? roundQuietMetric((memoryUsedMiB / memoryTotalMiB) * 100)
      : undefined;
    gpu = {
      source: 'nvidia-smi utilization.gpu,utilization.memory,memory.used,memory.total',
      available: true,
      loadClass: utilizationPercent > QUIET_GPU_FAIL_PERCENT
        ? 'busy'
        : utilizationPercent > QUIET_GPU_WARN_PERCENT
          ? 'background'
          : 'idle',
      utilizationPercent,
      memoryUtilizationPercent: roundQuietMetric(Number(memoryUtilRaw)),
      memoryUsedMiB,
      memoryTotalMiB,
      memoryUsedPercent,
    };
  } catch {
    gpu = {
      source: 'nvidia-smi',
      available: false,
    };
    warnings.push('GPU quiet snapshot unavailable: nvidia-smi failed or is not installed');
  }

  if (!cpu) {
    return {
      checkedAt: nowIso(),
      status: 'warn',
      gpu,
      warnings,
    };
  }

  if (cpu.avgPercent > QUIET_CPU_AVG_FAIL_PERCENT || cpu.maxPercent > QUIET_CPU_MAX_FAIL_PERCENT) {
    failures.push(`CPU was busy during quiet snapshot: avg=${cpu.avgPercent}% max=${cpu.maxPercent}%`);
  }
  if (gpu?.available) {
    const gpuUtilization = Number(gpu.utilizationPercent ?? 0);
    if (gpuUtilization > QUIET_GPU_FAIL_PERCENT) {
      failures.push(`GPU was busy during quiet snapshot: utilization=${gpu.utilizationPercent}%`);
    } else if (gpuUtilization > QUIET_GPU_WARN_PERCENT) {
      warnings.push(`GPU background activity during quiet snapshot: utilization=${gpu.utilizationPercent}%`);
    }
    const memoryUsedPercent = Number(gpu.memoryUsedPercent ?? 0);
    if (memoryUsedPercent > QUIET_GPU_MEMORY_FAIL_PERCENT) {
      failures.push(`GPU memory pressure during quiet snapshot: used=${gpu.memoryUsedMiB}MiB/${gpu.memoryTotalMiB}MiB (${gpu.memoryUsedPercent}%)`);
    } else if (memoryUsedPercent > QUIET_GPU_MEMORY_WARN_PERCENT) {
      warnings.push(`GPU memory pressure warning during quiet snapshot: used=${gpu.memoryUsedMiB}MiB/${gpu.memoryTotalMiB}MiB (${gpu.memoryUsedPercent}%)`);
    }
  }

  const status: QuietMachineSnapshot['status'] = failures.length > 0
    ? 'fail'
    : warnings.length > 0
      ? 'warn'
      : 'pass';
  return {
    checkedAt: nowIso(),
    status,
    cpu,
    gpu,
    warnings: [...warnings, ...failures],
  };
}

function parseStringFlag(name: string, fallback: string): string {
  const envName = name.toUpperCase().replace(/-/g, '_');
  const envKeys = [
    `PERF_${envName}`,
    `npm_config_${name}`
  ];
  for (const key of envKeys) {
    const raw = process.env[key];
    if (raw !== undefined) return String(raw);
  }

  const eqArg = process.argv.find(a => a.startsWith(`--${name}=`));
  if (eqArg) return String(eqArg.split('=')[1] ?? fallback);

  const key = `--${name}`;
  const index = process.argv.indexOf(key);
  if (index >= 0 && index + 1 < process.argv.length) {
    return String(process.argv[index + 1]);
  }

  return fallback;
}

type WeatherStateOverride = 'default' | 'clear' | 'light_rain' | 'heavy_rain' | 'storm';

function parseWeatherStateOverride(raw: string): WeatherStateOverride {
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === 'default' ||
    normalized === 'clear' ||
    normalized === 'light_rain' ||
    normalized === 'heavy_rain' ||
    normalized === 'storm'
  ) {
    return normalized;
  }

  throw new Error(
    `Invalid --weather-state=${raw}. Expected default, clear, light_rain, heavy_rain, or storm.`
  );
}

function printUsage(): void {
  console.log(`Usage: npx tsx scripts/perf-capture.ts [options]

Common options:
  --mode <ai_sandbox|open_frontier|zone_control|team_deathmatch|a_shau_valley>
  --npcs <count>
  --duration <seconds>
  --warmup <seconds>
  --seed <number>
  --driver-seed <number>
  --sample-interval-ms <ms>
  --detail-every-samples <count>
  --runtime-scene-attribution <true|false>
  --runtime-scene-attribution-every-samples <count>
  --runtime-render-submission-attribution <true|false>
  --runtime-render-submission-every-samples <count>
  --runtime-render-submission-mode <full|summary>
  --presentation-context-capture <true|false> Diagnostic A/B: keep rAF counters but skip rich per-gap context cloning
  --pressure-ready-warmup <true|false> Wait for contact/materialization pressure before measured window
  --pressure-ready-timeout <seconds>
  --weather-state <default|clear|light_rain|heavy_rain|storm> Diagnostic A/B: force weather after mode start; rejected by dropped-frame EARS unless default
  --quiet-machine-attested       Assert the machine was reserved for this capture; also accepted via TIJ_QUIET_MACHINE=1
  --runtime-preflight <true|false>
  --renderer <webgpu-strict|webgpu|webgl>
  --compress-frontline <true|false> Diagnostic shortcut that repositions combatants near the player; default false
  --gpu-timing
  --disable-npc-close-models
  --disable-terrain-shadows
  --bounded-terrain-shadow-pass     Legacy label; bounded terrain shadow casting is now the default
  --terrain-full-shadow-pass        Diagnostic A/B: submit all terrain tiles to the shadow pass
  --terrain-force-instance-upload
  --terrain-height-aware-frustum    Diagnostic A/B: opt into heuristic height-aware CDLOD frustum culling
  --disable-terrain-height-aware-frustum Legacy no-op; conservative CDLOD bounds are now the default
  --terrain-full-skirts             Diagnostic A/B: legacy full-perimeter terrain skirts
  --terrain-sparse-skirts           Explicit adaptive edge-skirt request; default production path, rejected for completion artifacts when flag-driven
  --disable-terrain-skirts           Diagnostic A/B: interior terrain grid only; not a gameplay candidate
  --disable-terrain-far-canopy-tint
  --disable-terrain-low-sun-occlusion
  --disable-wildlife
  --vegetation-density-scale <0..1>
  --deep-diagnostics
  --deep-cdp
  --cdp-profiler <true|false>
  --cdp-heap-sampling <true|false>
  --shot-visual-capture
  --shot-visual-capture-max <count>
  --shot-visual-capture-cooldown-ms <ms>
  --trace-window-start-ms <ms>
  --trace-window-duration-ms <ms>
  --server-mode <perf|dev|preview>
  --headed
  --help

Examples:
  npx tsx scripts/perf-capture.ts --mode open_frontier --npcs 120 --duration 90 --warmup 15 --seed 42
  npx tsx scripts/perf-capture.ts --mode a_shau_valley --duration 120 --warmup 20 --headed
`);
}

function normalizeGameMode(mode: string): 'ai_sandbox' | 'open_frontier' | 'zone_control' | 'team_deathmatch' | 'a_shau_valley' {
  const normalized = String(mode ?? '').trim().toLowerCase();
  if (
    normalized === 'open_frontier' ||
    normalized === 'zone_control' ||
    normalized === 'team_deathmatch' ||
    normalized === 'ai_sandbox' ||
    normalized === 'a_shau_valley'
  ) {
    return normalized;
  }
  return 'ai_sandbox';
}

function makeArtifactDir(): string {
  const stamp = nowIso().replace(/[:.]/g, '-');
  const dir = join(ARTIFACT_ROOT, stamp);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function getOverallStatus(checks: ValidationCheck[]): ValidationCheckStatus {
  if (checks.some(c => c.status === 'fail')) return 'fail';
  if (checks.some(c => c.status === 'warn')) return 'warn';
  return 'pass';
}

function computeMaxFrameStallSeconds(samples: RuntimeSample[]): number {
  if (samples.length < 2) return 0;
  let maxStall = 0;
  let stallStart = Date.parse(samples[0].ts);

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    if (curr.frameCount > prev.frameCount) {
      const stalledMs = Date.parse(curr.ts) - stallStart;
      if (stalledMs > maxStall) maxStall = stalledMs;
      stallStart = Date.parse(curr.ts);
    }
  }

  const tailMs = Date.parse(samples[samples.length - 1].ts) - stallStart;
  if (tailMs > maxStall) maxStall = tailMs;
  return maxStall / 1000;
}

// combat-p99-tail-attribution (DEFEKT-3, L1): `computeTailAttribution` +
// `TailAttribution` live in ./perf-tail-attribution so they are unit-testable
// without importing this script (which runs a real capture on import).

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
}

function finiteAverage(values: Array<number | undefined>): number | null {
  const finite = values.filter((value): value is number => Number.isFinite(value));
  return finite.length > 0 ? average(finite) : null;
}

function latestLoopSegmentMs(sample: RuntimeSample, segmentName: string): number | undefined {
  const breakdown = sample.loopFrameBreakdown;
  if (!Array.isArray(breakdown) || breakdown.length === 0) return undefined;

  for (let i = breakdown.length - 1; i >= 0; i--) {
    const segmentMs = Number(breakdown[i]?.segments?.[segmentName]);
    if (Number.isFinite(segmentMs)) return segmentMs;
  }
  return undefined;
}

function computeRuntimeTrend(samples: RuntimeSample[]): {
  windowSize: number;
  earlyAvgFrameMs: number;
  lateAvgFrameMs: number;
  frameGrowthRatio: number;
  earlyRenderMainMs: number | null;
  lateRenderMainMs: number | null;
  renderMainGrowthRatio: number | null;
  earlyTriangles: number | null;
  lateTriangles: number | null;
  triangleGrowthRatio: number | null;
  earlyDrawCallsPerFrame: number | null;
  lateDrawCallsPerFrame: number | null;
  drawCallsPerFrameGrowthRatio: number | null;
  earlyVegetationReserved: number | null;
  lateVegetationReserved: number | null;
  earlyVegetationFree: number | null;
  lateVegetationFree: number | null;
  earlyActiveRainCount: number | null;
  lateActiveRainCount: number | null;
} | null {
  if (samples.length < 8) return null;

  const windowSize = Math.max(3, Math.min(8, Math.floor(samples.length * 0.2)));
  const early = samples.slice(0, windowSize);
  const late = samples.slice(-windowSize);
  const earlyAvgFrameMs = average(early.map(s => Number(s.avgFrameMs ?? 0)));
  const lateAvgFrameMs = average(late.map(s => Number(s.avgFrameMs ?? 0)));
  const earlyRenderMainMs = finiteAverage(early.map(s => latestLoopSegmentMs(s, 'RenderMain.renderer.render')));
  const lateRenderMainMs = finiteAverage(late.map(s => latestLoopSegmentMs(s, 'RenderMain.renderer.render')));
  const earlyTriangles = finiteAverage(early.map(s => s.renderer ? Number(s.renderer.triangles ?? 0) : undefined));
  const lateTriangles = finiteAverage(late.map(s => s.renderer ? Number(s.renderer.triangles ?? 0) : undefined));
  const earlyDrawCallsPerFrame = finiteAverage(early.map(s => (
    typeof s.renderer?.drawCallsPerFrameSinceLastSample === 'number'
      ? s.renderer.drawCallsPerFrameSinceLastSample
      : undefined
  )));
  const lateDrawCallsPerFrame = finiteAverage(late.map(s => (
    typeof s.renderer?.drawCallsPerFrameSinceLastSample === 'number'
      ? s.renderer.drawCallsPerFrameSinceLastSample
      : undefined
  )));
  const earlyVegetationReserved = finiteAverage(early.map(s => s.vegetation ? Number(s.vegetation.reservedTotal ?? 0) : undefined));
  const lateVegetationReserved = finiteAverage(late.map(s => s.vegetation ? Number(s.vegetation.reservedTotal ?? 0) : undefined));
  const earlyVegetationFree = finiteAverage(early.map(s => s.vegetation ? Number(s.vegetation.freeTotal ?? 0) : undefined));
  const lateVegetationFree = finiteAverage(late.map(s => s.vegetation ? Number(s.vegetation.freeTotal ?? 0) : undefined));
  const earlyActiveRainCount = finiteAverage(early.map(s => s.weather ? Number(s.weather.activeRainCount ?? 0) : undefined));
  const lateActiveRainCount = finiteAverage(late.map(s => s.weather ? Number(s.weather.activeRainCount ?? 0) : undefined));
  const ratio = (lateValue: number | null, earlyValue: number | null): number | null => {
    if (lateValue === null || earlyValue === null || earlyValue <= 0) return null;
    return lateValue / earlyValue;
  };

  return {
    windowSize,
    earlyAvgFrameMs,
    lateAvgFrameMs,
    frameGrowthRatio: earlyAvgFrameMs > 0 ? lateAvgFrameMs / earlyAvgFrameMs : 0,
    earlyRenderMainMs,
    lateRenderMainMs,
    renderMainGrowthRatio: ratio(lateRenderMainMs, earlyRenderMainMs),
    earlyTriangles,
    lateTriangles,
    triangleGrowthRatio: ratio(lateTriangles, earlyTriangles),
    earlyDrawCallsPerFrame,
    lateDrawCallsPerFrame,
    drawCallsPerFrameGrowthRatio: ratio(lateDrawCallsPerFrame, earlyDrawCallsPerFrame),
    earlyVegetationReserved,
    lateVegetationReserved,
    earlyVegetationFree,
    lateVegetationFree,
    earlyActiveRainCount,
    lateActiveRainCount,
  };
}

function computeMeasurementTrust(options: {
  probeRoundTripMs: number[];
  runtimeSampleCount: number;
  missedSamples: number;
  sampleIntervalMs: number;
  detailEverySamples: number;
  rendererBackend?: RuntimeSample['rendererBackend'];
  headed?: boolean;
  scenarioMode?: string;
  rendererMode?: string;
}): MeasurementTrustReport {
  const probeRoundTripAvgMs = average(options.probeRoundTripMs);
  const probeRoundTripP95Ms = percentile(options.probeRoundTripMs, 0.95);
  const probeRoundTripMaxMs = options.probeRoundTripMs.length > 0
    ? Math.max(...options.probeRoundTripMs)
    : 0;
  const totalSampleAttempts = options.runtimeSampleCount + options.missedSamples;
  const missedSampleRate = totalSampleAttempts > 0
    ? options.missedSamples / totalSampleAttempts
    : 0;

  const checks: ValidationCheck[] = [
    {
      id: 'measurement_probe_avg_ms',
      status: probeRoundTripAvgMs <= 25 ? 'pass' : probeRoundTripAvgMs <= 75 ? 'warn' : 'fail',
      value: probeRoundTripAvgMs,
      message: `Harness probe average round-trip ${probeRoundTripAvgMs.toFixed(2)}ms`
    },
    {
      id: 'measurement_probe_p95_ms',
      status: probeRoundTripP95Ms <= 75 ? 'pass' : probeRoundTripP95Ms <= 150 ? 'warn' : 'fail',
      value: probeRoundTripP95Ms,
      message: `Harness probe p95 round-trip ${probeRoundTripP95Ms.toFixed(2)}ms`
    },
    {
      id: 'measurement_missed_sample_rate',
      status: missedSampleRate <= 0.05 ? 'pass' : missedSampleRate <= 0.15 ? 'warn' : 'fail',
      value: missedSampleRate,
      message: `Missed ${(missedSampleRate * 100).toFixed(1)}% of runtime sample attempts`
    },
    {
      id: 'measurement_samples_present',
      status: options.runtimeSampleCount > 0 ? 'pass' : 'fail',
      value: options.runtimeSampleCount,
      message: `Collected ${options.runtimeSampleCount} trusted-window runtime samples`
    }
  ];
  const rendererCheck = rendererBackendTrustCheck({
    rendererBackend: options.rendererBackend,
    headed: Boolean(options.headed),
    scenarioMode: options.scenarioMode ?? '',
    rendererMode: options.rendererMode ?? ''
  });
  if (rendererCheck) checks.push(rendererCheck);
  const status = getOverallStatus(checks);
  const summary = status === 'pass'
    ? 'Measurement path certified for regression comparison.'
    : status === 'warn'
      ? 'Measurement path is usable with caution; corroborate before baseline decisions.'
      : 'Measurement path is not trusted for performance regression decisions.';

  return {
    status,
    probeRoundTripAvgMs,
    probeRoundTripP95Ms,
    probeRoundTripMaxMs,
    probeRoundTripSamplesMs: [...options.probeRoundTripMs],
    sampleCount: options.probeRoundTripMs.length,
    missedSamples: options.missedSamples,
    missedSampleRate,
    sampleIntervalMs: options.sampleIntervalMs,
    detailEverySamples: options.detailEverySamples,
    rendererBackend: options.rendererBackend,
    checks,
    summary
  };
}

function rendererBackendTrustCheck(options: {
  rendererBackend?: RuntimeSample['rendererBackend'];
  headed: boolean;
  scenarioMode: string;
  rendererMode: string;
}): ValidationCheck {
  const explicitWebgl = options.rendererMode.toLowerCase() === 'webgl';
  const largeTerrainScenario = options.scenarioMode === 'open_frontier' || options.scenarioMode === 'a_shau_valley';
  const backend = options.rendererBackend;
  if (!backend) {
    return {
      id: 'measurement_renderer_backend',
      status: 'warn',
      value: 0,
      message: 'Renderer backend unavailable in runtime samples; corroborate before baseline decisions.'
    };
  }

  const resolvedBackend = String(backend.resolvedBackend ?? 'unknown');
  if (resolvedBackend === 'webgpu-webgl-fallback' && largeTerrainScenario && !options.headed && !explicitWebgl) {
    return {
      id: 'measurement_renderer_backend',
      status: 'fail',
      value: 0,
      message: `${options.scenarioMode} captured headless in WebGPU-unavailable WebGL fallback; not trusted for dropped-frame regression decisions.`
    };
  }
  if (resolvedBackend === 'webgpu-webgl-fallback' && !explicitWebgl) {
    return {
      id: 'measurement_renderer_backend',
      status: 'warn',
      value: 0.5,
      message: `Captured in WebGPU-unavailable WebGL fallback (${options.headed ? 'headed' : 'headless'}); compare only against matching backend evidence.`
    };
  }
  return {
    id: 'measurement_renderer_backend',
    status: 'pass',
    value: 1,
    message: `Renderer backend ${resolvedBackend} accepted for this capture.`
  };
}

function measurementTrustValidationCheck(report: MeasurementTrustReport): ValidationCheck {
  return {
    id: 'measurement_trust',
    status: report.status,
    value: report.probeRoundTripP95Ms,
    message: `${report.summary} probeAvg=${report.probeRoundTripAvgMs.toFixed(2)}ms probeP95=${report.probeRoundTripP95Ms.toFixed(2)}ms missed=${(report.missedSampleRate * 100).toFixed(1)}%`
  };
}

function chooseContourStep(heightRange: number): number {
  if (heightRange > 220) return 30;
  if (heightRange > 120) return 20;
  if (heightRange > 60) return 10;
  if (heightRange > 24) return 5;
  return 2;
}

async function captureMovementViewerPayload(page: Page): Promise<MovementViewerPayload | null> {
  const [movementArtifacts, terrainContext] = await Promise.all([
    safeAwait(
      'movement-artifacts',
      page.evaluate(() => (window as any).perf?.getMovementArtifacts?.() ?? null),
      3_000
    ),
    safeAwait(
      'movement-terrain-context',
      page.evaluate(() => {
        const engine = (window as any).__engine;
        const systems = engine?.systemManager;
        const terrain = systems?.terrainSystem;
        const gameModeManager = systems?.gameModeManager;
        if (!terrain || !gameModeManager) {
          return null;
        }

        const config = gameModeManager.getCurrentConfig?.();
        const worldSize = Number(
          config?.worldSize
          ?? terrain.getPlayableWorldSize?.()
          ?? terrain.getWorldSize?.()
          ?? 0
        );
        if (!Number.isFinite(worldSize) || worldSize <= 0) {
          return null;
        }

        const mode = String(config?.id ?? gameModeManager.getCurrentMode?.() ?? 'unknown');
        const resolution = worldSize > 10000 ? 52 : worldSize > 3000 ? 68 : 84;
        const samples: number[] = [];
        let minHeight = Number.POSITIVE_INFINITY;
        let maxHeight = Number.NEGATIVE_INFINITY;
        for (let row = 0; row <= resolution; row++) {
          for (let col = 0; col <= resolution; col++) {
            const normalizedX = col / resolution;
            const normalizedZ = row / resolution;
            const worldX = worldSize * 0.5 - normalizedX * worldSize;
            const worldZ = worldSize * 0.5 - normalizedZ * worldSize;
            const height = Number(terrain.getHeightAt(worldX, worldZ) ?? 0);
            samples.push(height);
            if (height < minHeight) minHeight = height;
            if (height > maxHeight) maxHeight = height;
          }
        }

        const flowPaths = (terrain.getTerrainFlowPaths?.() ?? []).map((path: any) => ({
          id: String(path.id ?? ''),
          width: Number(path.width ?? 0),
          surface: String(path.surface ?? ''),
          points: Array.isArray(path.points)
            ? path.points.map((point: any) => ({
                x: Number(point.x ?? 0),
                z: Number(point.z ?? 0),
              }))
            : [],
        }));

        const zones = Array.isArray(config?.zones)
          ? config.zones.map((zone: any) => ({
              id: String(zone.id ?? ''),
              name: String(zone.name ?? ''),
              x: Number(zone.position?.x ?? 0),
              z: Number(zone.position?.z ?? 0),
              radius: Number(zone.radius ?? 0),
              isHomeBase: Boolean(zone.isHomeBase),
            }))
          : [];

        return {
          mode,
          worldSize,
          resolution,
          minHeight: Number.isFinite(minHeight) ? minHeight : 0,
          maxHeight: Number.isFinite(maxHeight) ? maxHeight : 0,
          heights: samples,
          flowPaths,
          zones,
        };
      }),
      8_000
    ),
  ]);

  if (!movementArtifacts || !terrainContext) {
    return null;
  }

  const normalizedMovement = movementArtifacts as MovementArtifactReportForViewer;
  const terrain = terrainContext as Omit<MovementTerrainOverlayArtifact, 'contourStep'>;
  const contourStep = chooseContourStep(Math.max(1, terrain.maxHeight - terrain.minHeight));
  return {
    movementArtifacts: normalizedMovement,
    terrainContext: {
      ...terrain,
      contourStep,
    },
  };
}

async function captureSceneAttribution(page: Page): Promise<SceneAttributionEntry[] | null> {
  return page.evaluate(PROJEKT_143_SCENE_ATTRIBUTION_EVALUATE_SOURCE) as Promise<SceneAttributionEntry[] | null>;
}

function collectRuntimeSceneAttributionSamples(runtimeSamples: RuntimeSample[]): RuntimeSceneAttributionSample[] {
  return runtimeSamples.flatMap((sample, sampleIndex) => {
    if (typeof sample.sceneAttribution === 'undefined' && !sample.sceneAttributionError) {
      return [];
    }

    return [{
      sampleIndex,
      ts: sample.ts,
      frameCount: sample.frameCount,
      maxFrameMs: typeof sample.maxFrameMs === 'number' ? sample.maxFrameMs : null,
      renderer: sample.renderer ?? null,
      sceneAttribution: sample.sceneAttribution ?? null,
      sceneAttributionError: sample.sceneAttributionError ?? null
    }];
  });
}

function collectRuntimeRenderSubmissionSamples(runtimeSamples: RuntimeSample[]): RuntimeRenderSubmissionSample[] {
  return runtimeSamples.flatMap((sample, sampleIndex) => {
    if (typeof sample.renderSubmissions === 'undefined' && !sample.renderSubmissionError) {
      return [];
    }

    return [{
      sampleIndex,
      ts: sample.ts,
      frameCount: sample.frameCount,
      maxFrameMs: typeof sample.maxFrameMs === 'number' ? sample.maxFrameMs : null,
      renderer: sample.renderer ?? null,
      renderSubmissions: sample.renderSubmissions ?? null,
      renderSubmissionError: sample.renderSubmissionError ?? null
    }];
  });
}

function summarizeDroppedFrames(runtimeSamples: RuntimeSample[], durationSeconds: number): DroppedFrameSummary | undefined {
  const lastSample = runtimeSamples[runtimeSamples.length - 1];
  if (!lastSample) {
    return undefined;
  }

  const frameCount = Number(lastSample.frameCount ?? 0);
  const hitch33Count = Number(lastSample.hitch33Count ?? 0);
  const hitch50Count = Number(lastSample.hitch50Count ?? 0);
  const hitch100Count = Number(lastSample.hitch100Count ?? 0);
  const percent = (count: number, total: number): number => total > 0 ? (count / total) * 100 : 0;
  const rafCadence = lastSample.browserStalls?.totals?.rafCadence;
  const browserRaf = rafCadence
    ? (() => {
        const intervalCount = Number(rafCadence.intervalCount ?? 0);
        const stutter25Count = Number(rafCadence.stutter25Count ?? 0);
        const hitch33Count = Number(rafCadence.hitch33Count ?? 0);
        const overBudget60HzMs = Number(rafCadence.overBudget60HzMs ?? 0);
        const droppedFrameTime60HzMs = Number(rafCadence.droppedFrameTime60HzMs ?? 0);
        const estimatedDropped60HzFrames = Number(rafCadence.estimatedDropped60HzFrames ?? 0);
        return {
          intervalCount,
          totalGapMs: Number(rafCadence.totalGapMs ?? 0),
          avgGapMs: Number(rafCadence.avgGapMs ?? 0),
          maxGapMs: Number(rafCadence.maxGapMs ?? 0),
          stutter25Count,
          hitch33Count,
          hitch50Count: Number(rafCadence.hitch50Count ?? 0),
          hitch100Count: Number(rafCadence.hitch100Count ?? 0),
          stutter25Percent: percent(stutter25Count, intervalCount),
          hitch33Percent: percent(hitch33Count, intervalCount),
          overBudget60HzMs,
          overBudget60HzMsPerSecond: durationSeconds > 0
            ? overBudget60HzMs / durationSeconds
            : 0,
          droppedFrameTime60HzMs,
          droppedFrameTime60HzMsPerSecond: durationSeconds > 0
            ? droppedFrameTime60HzMs / durationSeconds
            : 0,
          estimatedDropped60HzFrames,
          estimatedDropped60HzFramesPerSecond: durationSeconds > 0
            ? estimatedDropped60HzFrames / durationSeconds
            : 0
        };
      })()
    : undefined;
  const stalls = lastSample.browserStalls?.totals;
  const observers = stalls
    ? {
        longTaskCount: Number(stalls.longTaskCount ?? 0),
        longTaskTotalDurationMs: Number(stalls.longTaskTotalDurationMs ?? 0),
        longTaskMaxDurationMs: Number(stalls.longTaskMaxDurationMs ?? 0),
        longAnimationFrameCount: Number(stalls.longAnimationFrameCount ?? 0),
        longAnimationFrameTotalDurationMs: Number(stalls.longAnimationFrameTotalDurationMs ?? 0),
        longAnimationFrameMaxDurationMs: Number(stalls.longAnimationFrameMaxDurationMs ?? 0),
        longAnimationFrameBlockingDurationMs: Number(stalls.longAnimationFrameBlockingDurationMs ?? 0),
        webglTextureUploadCount: typeof stalls.webglTextureUploadCount === 'number' ? stalls.webglTextureUploadCount : undefined,
        webglTextureUploadTotalDurationMs: typeof stalls.webglTextureUploadTotalDurationMs === 'number' ? stalls.webglTextureUploadTotalDurationMs : undefined,
        webglTextureUploadMaxDurationMs: typeof stalls.webglTextureUploadMaxDurationMs === 'number' ? stalls.webglTextureUploadMaxDurationMs : undefined
      }
    : undefined;

  return {
    engine: {
      frameCount,
      hitch33Count,
      hitch50Count,
      hitch100Count,
      hitch33Percent: percent(hitch33Count, frameCount),
      hitch50Percent: percent(hitch50Count, frameCount),
      hitch100Percent: percent(hitch100Count, frameCount)
    },
    browserRaf,
    observers
  };
}

function compactRenderSubmissionCategory(
  category: RuntimeRenderSubmissionCategory | undefined
): RuntimeRenderSubmissionCategory | undefined {
  if (!category) {
    return undefined;
  }

  return {
    category: category.category,
    drawSubmissions: category.drawSubmissions,
    triangles: category.triangles,
    instances: category.instances,
    meshes: category.meshes,
    materials: category.materials,
    geometries: category.geometries,
    passTypes: category.passTypes,
    topOwners: category.topOwners?.slice(0, 6),
    examples: category.examples?.slice(0, 4)
  };
}

function summarizeRenderSubmissions(runtimeSamples: RuntimeSample[]): RenderSubmissionSummary | undefined {
  const samples = collectRuntimeRenderSubmissionSamples(runtimeSamples)
    .filter((sample): sample is RuntimeRenderSubmissionSample & { renderSubmissions: RuntimeRenderSubmissionDrain } => (
      sample.renderSubmissions !== null
    ));
  if (samples.length === 0) {
    return undefined;
  }

  const latest = samples[samples.length - 1].renderSubmissions;
  let peakFrame: RuntimeRenderSubmissionFrame | undefined;
  for (const sample of samples) {
    for (const frame of sample.renderSubmissions.frames) {
      if (!peakFrame || frame.drawSubmissions > peakFrame.drawSubmissions) {
        peakFrame = frame;
      }
    }
  }

  const latestTopCategories = latest.totals
    .slice()
    .sort((a, b) => b.drawSubmissions - a.drawSubmissions || b.triangles - a.triangles)
    .slice(0, 8)
    .map((category) => compactRenderSubmissionCategory(category))
    .filter((category): category is RuntimeRenderSubmissionCategory => Boolean(category));
  const latestUnattributed = compactRenderSubmissionCategory(
    latest.totals.find((category) => category.category === 'unattributed')
  );
  const peakFrameTopCategories = peakFrame?.categories
    .slice()
    .sort((a, b) => b.drawSubmissions - a.drawSubmissions || b.triangles - a.triangles)
    .slice(0, 8)
    .map((category) => compactRenderSubmissionCategory(category))
    .filter((category): category is RuntimeRenderSubmissionCategory => Boolean(category));
  const peakFrameUnattributed = compactRenderSubmissionCategory(
    peakFrame?.categories.find((category) => category.category === 'unattributed')
  );

  return {
    sampleCount: samples.length,
    latest: {
      mode: latest.mode,
      rawFrameCount: latest.rawFrameCount,
      frameCountStart: latest.frameCountStart,
      frameCountEnd: latest.frameCountEnd,
      topCategories: latestTopCategories,
      unattributed: latestUnattributed
    },
    peakFrame: peakFrame
      ? {
          frameCount: peakFrame.frameCount,
          drawSubmissions: peakFrame.drawSubmissions,
          triangles: peakFrame.triangles,
          topCategories: peakFrameTopCategories ?? [],
          unattributed: peakFrameUnattributed
        }
      : undefined
  };
}

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function mergeNumericRecordCounts(target: Record<string, number>, source: unknown): void {
  const record = objectOrNull(source);
  if (!record) return;
  for (const [key, value] of Object.entries(record)) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n) || n <= 0) continue;
    target[key] = (target[key] ?? 0) + n;
  }
}

function summarizeMaterializationTierEvents(runtimeSamples: RuntimeSample[]): MaterializationTierEventSummary | undefined {
  const inspectedSamples = runtimeSamples
    .filter((sample) => Array.isArray(sample.materializationTierEvents))
    .map((sample) => ({
      ts: sample.ts,
      frameCount: sample.frameCount,
      events: objectArray(sample.materializationTierEvents, 512),
    }));
  if (inspectedSamples.length === 0) {
    return undefined;
  }
  const samplesWithEvents = inspectedSamples.filter((sample) => sample.events.length > 0);

  const byTransition: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const byToRender: Record<string, number> = {};
  const transitionWindowByTransition: Record<string, number> = {};
  const transitionWindowByReason: Record<string, number> = {};
  let totalEvents = 0;
  let transitionWindowTotalEvents = 0;
  let peakSample: MaterializationTierEventSummary['peakSample'];
  let peakTransitionWindowSample: MaterializationTierEventSummary['peakTransitionWindowSample'];

  for (const sample of samplesWithEvents) {
    const sampleByTransition: Record<string, number> = {};
    const sampleByReason: Record<string, number> = {};
    for (const event of sample.events) {
      const fromRender = typeof event.fromRender === 'string' ? event.fromRender : 'null';
      const toRender = typeof event.toRender === 'string' ? event.toRender : 'unknown';
      const reason = typeof event.reason === 'string' ? event.reason : 'unknown';
      const transition = `${fromRender}->${toRender}`;
      incrementCount(byTransition, transition);
      incrementCount(byReason, reason);
      incrementCount(byToRender, toRender);
      incrementCount(sampleByTransition, transition);
      incrementCount(sampleByReason, reason);
      totalEvents++;
    }

    if (!peakSample || sample.events.length > peakSample.eventCount) {
      peakSample = {
        ts: sample.ts,
        frameCount: sample.frameCount,
        eventCount: sample.events.length,
        byTransition: sampleByTransition,
        byReason: sampleByReason,
      };
    }
  }

  for (const sample of runtimeSamples) {
    const transitionWindow = sample.closeModelStats?.transitionWindow;
    if (!transitionWindow) continue;
    const eventCount = Number(transitionWindow.total ?? 0);
    if (!Number.isFinite(eventCount) || eventCount <= 0) continue;
    transitionWindowTotalEvents += eventCount;
    mergeNumericRecordCounts(transitionWindowByTransition, transitionWindow.byTransition);
    mergeNumericRecordCounts(transitionWindowByReason, transitionWindow.byReason);
    if (!peakTransitionWindowSample || eventCount > peakTransitionWindowSample.eventCount) {
      peakTransitionWindowSample = {
        ts: sample.ts,
        frameCount: sample.frameCount,
        eventCount,
        byTransition: { ...transitionWindow.byTransition },
        byReason: { ...transitionWindow.byReason },
      };
    }
  }

  return {
    sampleCount: inspectedSamples.length,
    totalEvents,
    byTransition,
    byReason,
    byToRender,
    transitionWindowTotalEvents,
    transitionWindowByTransition,
    transitionWindowByReason,
    peakSample,
    peakTransitionWindowSample,
  };
}

function summarizeSimLaneTransitions(runtimeSamples: RuntimeSample[]): SimLaneTransitionSummary | undefined {
  const samples = runtimeSamples
    .map((sample) => ({
      ts: sample.ts,
      frameCount: sample.frameCount,
      transitions: sample.combatBreakdown?.aiScheduling?.simLaneTransitions,
    }))
    .filter((sample): sample is { ts: string; frameCount: number; transitions: SimLaneTransitionStats } =>
      Boolean(sample.transitions));
  if (samples.length === 0) {
    return undefined;
  }

  const byTransition: Record<string, number> = {};
  let totalTransitions = 0;
  let towardHigherFidelity = 0;
  let towardLowerFidelity = 0;
  let maxRenderedLagMeters = 0;
  let maxRenderedHorizontalLagMeters = 0;
  let maxRenderedVerticalLagMeters = 0;
  let maxTransitionRenderedLagMeters = 0;
  let peakTransitionSample: SimLaneTransitionSummary['peakTransitionSample'];

  for (const sample of samples) {
    const transitions = sample.transitions;
    const total = Number(transitions.total ?? 0);
    totalTransitions += total;
    towardHigherFidelity += Number(transitions.towardHigherFidelity ?? 0);
    towardLowerFidelity += Number(transitions.towardLowerFidelity ?? 0);
    mergeNumericRecordCounts(byTransition, transitions.byTransition);

    maxRenderedLagMeters = Math.max(maxRenderedLagMeters, Number(transitions.maxRenderedLagMeters ?? 0));
    maxRenderedHorizontalLagMeters = Math.max(
      maxRenderedHorizontalLagMeters,
      Number(transitions.maxRenderedHorizontalLagMeters ?? 0),
    );
    maxRenderedVerticalLagMeters = Math.max(
      maxRenderedVerticalLagMeters,
      Number(transitions.maxRenderedVerticalLagMeters ?? 0),
    );
    maxTransitionRenderedLagMeters = Math.max(
      maxTransitionRenderedLagMeters,
      Number(transitions.maxTransitionRenderedLagMeters ?? 0),
    );

    if (total > 0 && (!peakTransitionSample || total > peakTransitionSample.total)) {
      peakTransitionSample = {
        ts: sample.ts,
        frameCount: sample.frameCount,
        total,
        towardHigherFidelity: Number(transitions.towardHigherFidelity ?? 0),
        towardLowerFidelity: Number(transitions.towardLowerFidelity ?? 0),
        byTransition: { ...transitions.byTransition },
        maxRenderedLagMeters: Number(transitions.maxRenderedLagMeters ?? 0),
        maxTransitionRenderedLagMeters: Number(transitions.maxTransitionRenderedLagMeters ?? 0),
      };
    }
  }

  return {
    sampleCount: samples.length,
    samplesWithTransitions: samples.filter((sample) => Number(sample.transitions.total ?? 0) > 0).length,
    totalTransitions,
    towardHigherFidelity,
    towardLowerFidelity,
    byTransition,
    peakTransitionSample,
    maxRenderedLagMeters,
    maxRenderedHorizontalLagMeters,
    maxRenderedVerticalLagMeters,
    maxTransitionRenderedLagMeters,
  };
}

function summarizeCloseModelEnvelope(runtimeSamples: RuntimeSample[]): CloseModelEnvelopeSummary | undefined {
  const samples = runtimeSamples
    .map((sample) => sample.closeModelStats)
    .filter((stats): stats is RuntimeCloseModelStats => Boolean(stats));
  if (samples.length === 0) {
    return undefined;
  }

  return {
    sampleCount: samples.length,
    samplesWithCandidates: samples.filter((stats) => stats.candidatesWithinCloseRadius > 0).length,
    samplesWithRenderedCloseModels: samples.filter((stats) => stats.renderedCloseModels > 0).length,
    peakCandidatesWithinCloseRadius: Math.max(...samples.map((stats) => stats.candidatesWithinCloseRadius)),
    peakRenderedCloseModels: Math.max(...samples.map((stats) => stats.renderedCloseModels)),
    peakActiveCloseModels: Math.max(...samples.map((stats) => stats.activeCloseModels)),
    peakFallbackCount: Math.max(...samples.map((stats) => stats.fallbackCount)),
    peakPromotionsThisFrame: Math.max(...samples.map((stats) => stats.promotionsThisFrame)),
    peakReplacementsThisFrame: Math.max(...samples.map((stats) => stats.replacementsThisFrame)),
    promotionBudgetPerFrame: samples.find((stats) => stats.promotionBudgetPerFrame > 0)?.promotionBudgetPerFrame ?? null,
  };
}

function collectHarnessShotEpochs(
  runtimeSamples: RuntimeSample[],
  harnessDriverFinal?: HarnessDriverFinal | null,
): Record<string, unknown>[] {
  const byKey = new Map<string, Record<string, unknown>>();
  const addEpoch = (epoch: Record<string, unknown>): void => {
    byKey.set(eventKey('shot', epoch), epoch);
  };
  for (const sample of runtimeSamples) {
    for (const epoch of objectArray(sample.harnessDriver?.shotEpochs, 64)) {
      addEpoch(epoch);
    }
  }
  for (const epoch of objectArray(harnessDriverFinal?.shotEpochs, 64)) {
    addEpoch(epoch);
  }
  return [...byKey.values()];
}

function collectShotTerrainEpochs(context: Record<string, unknown>): Record<string, unknown>[] {
  const terrainEpochs: Record<string, unknown>[] = [];
  const latestTerrain = objectOrNull(context.terrain);
  if (latestTerrain) terrainEpochs.push(latestTerrain);
  const terrainByStage = objectOrNull(context.terrainByStage);
  if (terrainByStage) {
    for (const value of Object.values(terrainByStage)) {
      const terrain = objectOrNull(value);
      if (terrain) terrainEpochs.push(terrain);
    }
  }
  return terrainEpochs;
}

function shotTerrainStageBufferVisibleChanged(context: Record<string, unknown>): boolean {
  return terrainStageBufferVisibleChanged(context.terrainByStage);
}

function summarizeShotPresentationContexts(
  shotEpochs: Record<string, unknown>[],
): ShotPresentationContextStats | null {
  if (shotEpochs.length === 0) return null;
  let contextCount = 0;
  let maxCameraYawDeltaDeg = 0;
  let maxCameraPitchDeltaDeg = 0;
  let maxCameraPositionDeltaMeters = 0;
  let minClearanceMeters: number | null = null;
  let minEffectiveClearanceMeters: number | null = null;
  let terrainHashChurnEvents = 0;
  let terrainIdentityChurnEvents = 0;
  let terrainEdgeMaskChurnEvents = 0;
  let terrainMorphOnlyChurnEvents = 0;
  let terrainUnsyncedBufferVisibleChurnEvents = 0;
  let terrainNotReadyEvents = 0;

  for (const epoch of shotEpochs) {
    const context = objectOrNull(epoch.presentationContext);
    if (!context) continue;
    contextCount++;

    const cameraEpochs = Array.isArray(context.cameraEpochs)
      ? context.cameraEpochs
      : [];
    for (const cameraEpoch of cameraEpochs) {
      const camera = objectOrNull(cameraEpoch);
      const delta = objectOrNull(camera?.deltaFromPrevious);
      if (!delta) continue;
      const yaw = Math.abs(Number(delta.yawDeg ?? 0));
      const pitch = Math.abs(Number(delta.pitchDeg ?? 0));
      const position = Math.abs(Number(delta.positionMeters ?? 0));
      if (Number.isFinite(yaw)) maxCameraYawDeltaDeg = Math.max(maxCameraYawDeltaDeg, yaw);
      if (Number.isFinite(pitch)) maxCameraPitchDeltaDeg = Math.max(maxCameraPitchDeltaDeg, pitch);
      if (Number.isFinite(position)) maxCameraPositionDeltaMeters = Math.max(maxCameraPositionDeltaMeters, position);
    }

    const terrainHashes = new Set<string>();
    const terrainIdentityHashes = new Set<string>();
    const terrainMorphHashes = new Set<string>();
    const terrainEdgeMaskHashes = new Set<string>();
    if (shotTerrainStageBufferVisibleChanged(context)) {
      const terrainSync = objectOrNull(context.terrainSync);
      if (terrainSync?.terrainBufferSubmitted !== true) {
        terrainUnsyncedBufferVisibleChurnEvents++;
      }
    }
    for (const terrain of collectShotTerrainEpochs(context)) {
      if (typeof terrain.tileHash === 'string' && terrain.tileHash.length > 0) {
        terrainHashes.add(terrain.tileHash);
      }
      if (typeof terrain.tileIdentityHash === 'string' && terrain.tileIdentityHash.length > 0) {
        terrainIdentityHashes.add(terrain.tileIdentityHash);
      }
      if (typeof terrain.morphHash === 'string' && terrain.morphHash.length > 0) {
        terrainMorphHashes.add(terrain.morphHash);
      }
      if (typeof terrain.edgeMaskHash === 'string' && terrain.edgeMaskHash.length > 0) {
        terrainEdgeMaskHashes.add(terrain.edgeMaskHash);
      }
      const sample = objectOrNull(terrain.cameraSample);
      if (!sample) continue;
      const clearance = nullableNumber(sample.clearanceMeters);
      const effectiveClearance = nullableNumber(sample.effectiveClearanceMeters);
      if (clearance !== null) {
        minClearanceMeters = minClearanceMeters === null
          ? clearance
          : Math.min(minClearanceMeters, clearance);
      }
      if (effectiveClearance !== null) {
        minEffectiveClearanceMeters = minEffectiveClearanceMeters === null
          ? effectiveClearance
          : Math.min(minEffectiveClearanceMeters, effectiveClearance);
      }
      if (sample.hasTerrain === false || sample.areaReady === false) {
        terrainNotReadyEvents++;
      }
    }
    if (terrainHashes.size > 1) {
      terrainHashChurnEvents++;
      const identityChanged = terrainIdentityHashes.size > 1;
      const edgeMaskChanged = terrainEdgeMaskHashes.size > 1;
      if (identityChanged) terrainIdentityChurnEvents++;
      if (edgeMaskChanged) terrainEdgeMaskChurnEvents++;
      if (!identityChanged && !edgeMaskChanged && terrainMorphHashes.size > 1) {
        terrainMorphOnlyChurnEvents++;
      }
    }
  }

  return {
    shotEpochCount: shotEpochs.length,
    contextCount,
    maxCameraYawDeltaDeg,
    maxCameraPitchDeltaDeg,
    maxCameraPositionDeltaMeters,
    minClearanceMeters,
    minEffectiveClearanceMeters,
    terrainHashChurnEvents,
    terrainIdentityChurnEvents,
    terrainEdgeMaskChurnEvents,
    terrainMorphOnlyChurnEvents,
    terrainUnsyncedBufferVisibleChurnEvents,
    terrainNotReadyEvents,
  };
}

function latestRendererBackend(runtimeSamples: RuntimeSample[]): RuntimeSample['rendererBackend'] | undefined {
  for (let i = runtimeSamples.length - 1; i >= 0; i--) {
    if (runtimeSamples[i].rendererBackend) {
      return runtimeSamples[i].rendererBackend;
    }
  }
  return undefined;
}

function latestTerrainRenderDebug(runtimeSamples: RuntimeSample[]): Record<string, unknown> | undefined {
  for (let i = runtimeSamples.length - 1; i >= 0; i--) {
    const streams = runtimeSamples[i].terrainStreams;
    if (!Array.isArray(streams)) {
      continue;
    }
    const renderStream = streams.find((stream) => stream.name === 'render');
    if (renderStream?.debug) {
      return renderStream.debug;
    }
  }
  return undefined;
}

function terrainDebugNumber(debug: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = debug?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function summarizeGpuTiming(
  runtimeSamples: RuntimeSample[],
  requested: boolean,
  queryEnabled: boolean,
): GpuTimingSummary | undefined {
  if (!requested) {
    return undefined;
  }

  const samples = runtimeSamples
    .map((sample) => sample.gpu)
    .filter((gpu): gpu is NonNullable<RuntimeSample['gpu']> => Boolean(gpu));
  const availableSamples = samples.filter((gpu) => gpu.available);
  const gpuTimes = availableSamples
    .map((gpu) => Number(gpu.gpuTimeMs ?? 0))
    .filter((value) => Number.isFinite(value));

  return {
    requested,
    queryEnabled,
    sampleCount: samples.length,
    availableSamples: availableSamples.length,
    latest: samples[samples.length - 1],
    avgGpuTimeMs: gpuTimes.length > 0 ? average(gpuTimes) : undefined,
    peakGpuTimeMs: gpuTimes.length > 0 ? Math.max(...gpuTimes) : undefined,
    rendererBackend: latestRendererBackend(runtimeSamples)
  };
}

type HarnessModeThresholds = {
  minShotsFired: number;
  minHitsRecorded: number;
  maxStuckSeconds: number;
  minMovementTransitions: number;
  referenceDurationSeconds?: number;
};

/**
 * Per-mode validator thresholds for the harness-driven play loop.
 * Starter values chosen to be achievable by the fixed driver with headroom
 * (per perf-harness-redesign brief). Tune after smoke captures; record the
 * chosen values in PR description.
 */
const HARNESS_MODE_THRESHOLDS: Record<string, HarnessModeThresholds> = {
  ai_sandbox: {
    minShotsFired: 50,
    minHitsRecorded: 5,
    maxStuckSeconds: 5,
    minMovementTransitions: 3,
    referenceDurationSeconds: 90
  },
  open_frontier: {
    minShotsFired: 30,
    minHitsRecorded: 2,
    maxStuckSeconds: 8,
    minMovementTransitions: 3,
    referenceDurationSeconds: 180
  },
  a_shau_valley: {
    minShotsFired: 30,
    minHitsRecorded: 2,
    maxStuckSeconds: 8,
    minMovementTransitions: 3,
    referenceDurationSeconds: 180
  },
  // zone_control and team_deathmatch exercise capture-point behaviour (player
  // often inside an LOS-limited objective or moving between zones), so shot
  // counts are structurally lower than ai_sandbox's pure engagement. Floors
  // here match observed behaviour at the scenario's stock duration; see the
  // perf-harness-redesign PR description for measurements.
  zone_control: {
    minShotsFired: 15,
    minHitsRecorded: 1,
    maxStuckSeconds: 8,
    minMovementTransitions: 3,
    referenceDurationSeconds: 120
  },
  team_deathmatch: {
    minShotsFired: 15,
    minHitsRecorded: 1,
    maxStuckSeconds: 8,
    minMovementTransitions: 3,
    referenceDurationSeconds: 120
  }
};

/**
 * Long captures (e.g. frontier30m = 1800s) need higher floor expectations.
 * Scale up shots/hits/transitions while holding per-event ceilings fixed.
 */
function scaleModeThresholdsForDuration(
  base: HarnessModeThresholds,
  durationSeconds: number
): HarnessModeThresholds {
  // Scale off each mode's stock capture duration. Open Frontier and A Shau
  // use 180s completion-lane captures; scaling them from combat120's 90s
  // cadence doubled the shot floor and turned route-heavy same-experience
  // captures into false harness failures.
  const referenceDurationSeconds = Number.isFinite(Number(base.referenceDurationSeconds)) && Number(base.referenceDurationSeconds) > 0
    ? Number(base.referenceDurationSeconds)
    : 90;
  const scale = Math.max(1, durationSeconds / referenceDurationSeconds);
  return {
    minShotsFired: Math.round(base.minShotsFired * scale),
    minHitsRecorded: Math.round(base.minHitsRecorded * scale),
    maxStuckSeconds: base.maxStuckSeconds,
    minMovementTransitions: Math.round(base.minMovementTransitions * scale),
    referenceDurationSeconds
  };
}

function pressureReadyWarmupValidationCheck(result: PressureReadyWarmupResult): ValidationCheck {
  const elapsedSeconds = result.elapsedMs / 1000;
  if (result.status === 'ready') {
    return {
      id: 'pressure_ready_warmup',
      status: 'pass',
      value: elapsedSeconds,
      message: `Pressure-ready warmup passed in ${elapsedSeconds.toFixed(1)}s (${result.reason}, samples=${result.samples})`
    };
  }

  const status: ValidationCheckStatus = result.status === 'timeout' || result.status === 'unavailable'
    ? 'fail'
    : 'warn';
  return {
    id: 'pressure_ready_warmup',
    status,
    value: elapsedSeconds,
    message: `Pressure-ready warmup ${result.status} after ${elapsedSeconds.toFixed(1)}s (${result.reason}, samples=${result.samples}); measured window may not represent combat/materialization pressure`
  };
}

function addPressureReadyWarmupValidation(
  validation: ValidationReport,
  result: PressureReadyWarmupResult
): void {
  if (!result.requested) return;
  validation.checks.push(pressureReadyWarmupValidationCheck(result));
  validation.overall = getOverallStatus(validation.checks);
}

function validateRun(
  runtimeSamples: RuntimeSample[],
  consoleEntries: ConsoleEntry[],
  durationSeconds: number,
  options?: {
    hitValidation?: 'strict' | 'relaxed' | 'critical' | 'off';
    sampleIntervalMs?: number;
    modeThresholds?: HarnessModeThresholds | null;
    harnessDriverFinal?: HarnessDriverFinal | null;
    requireCloseModelEnvelope?: boolean;
  }
): ValidationReport {
  const checks: ValidationCheck[] = [];
  const sampleCount = runtimeSamples.length;
  const sampleIntervalMs = Math.max(100, Number(options?.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS));
  const expectedSamples = durationSeconds * (1000 / sampleIntervalMs);
  const minExpectedSamples = Math.max(5, Math.floor(expectedSamples * 0.8));
  const sampleStatus: ValidationCheckStatus = sampleCount >= minExpectedSamples
    ? 'pass'
    : sampleCount === 0
      ? 'fail'
      : 'warn';
  checks.push({
    id: 'samples_collected',
    status: sampleStatus,
    value: sampleCount,
    message: `Collected ${sampleCount} runtime samples; expected at least ${minExpectedSamples}`
  });

  const firstFrame = runtimeSamples[0]?.frameCount ?? 0;
  const lastFrame = runtimeSamples[runtimeSamples.length - 1]?.frameCount ?? 0;
  const frameDelta = lastFrame - firstFrame;
  const frameProgressStatus: ValidationCheckStatus = frameDelta > durationSeconds * 10
    ? 'pass'
    : frameDelta > durationSeconds * 2
      ? 'warn'
      : sampleCount === 0
        ? 'fail'
        : 'warn';
  checks.push({
    id: 'frame_progress',
    status: frameProgressStatus,
    value: frameDelta,
    message: `Frame progression delta=${frameDelta} over ${durationSeconds}s`
  });

  const maxStallSec = computeMaxFrameStallSeconds(runtimeSamples);
  checks.push({
    id: 'max_frame_stall_seconds',
    status: maxStallSec < 3 ? 'pass' : maxStallSec < 8 ? 'warn' : 'fail',
    value: maxStallSec,
    message: `Longest frame progression stall ${maxStallSec.toFixed(2)}s`
  });

  const avgFrameMs = average(runtimeSamples.map(s => s.avgFrameMs));
  checks.push({
    id: 'avg_frame_ms',
    status: avgFrameMs < 25 ? 'pass' : avgFrameMs < 80 ? 'warn' : 'fail',
    value: avgFrameMs,
    message: `Average frame time ${avgFrameMs.toFixed(2)}ms`
  });

  const runtimeTrend = computeRuntimeTrend(runtimeSamples);
  if (runtimeTrend) {
    const frameTrendStatus: ValidationCheckStatus =
      runtimeTrend.frameGrowthRatio >= 1.6 && runtimeTrend.lateAvgFrameMs >= 45
        ? 'fail'
        : runtimeTrend.frameGrowthRatio >= 1.25 && runtimeTrend.lateAvgFrameMs >= 30
          ? 'warn'
          : 'pass';
    checks.push({
      id: 'runtime_frame_time_trend',
      status: frameTrendStatus,
      value: runtimeTrend.frameGrowthRatio,
      message: `Frame-time trend early=${runtimeTrend.earlyAvgFrameMs.toFixed(2)}ms late=${runtimeTrend.lateAvgFrameMs.toFixed(2)}ms ratio=${runtimeTrend.frameGrowthRatio.toFixed(2)}x over ${runtimeTrend.windowSize}-sample windows`
    });

    if (runtimeTrend.renderMainGrowthRatio !== null && runtimeTrend.earlyRenderMainMs !== null && runtimeTrend.lateRenderMainMs !== null) {
      const trianglesStable = runtimeTrend.triangleGrowthRatio === null || runtimeTrend.triangleGrowthRatio <= 1.15;
      const renderTrendStatus: ValidationCheckStatus =
        trianglesStable && runtimeTrend.renderMainGrowthRatio >= 1.8 && runtimeTrend.lateRenderMainMs >= 35
          ? 'fail'
          : runtimeTrend.renderMainGrowthRatio >= 1.35 && runtimeTrend.lateRenderMainMs >= 25
            ? 'warn'
            : 'pass';
      checks.push({
        id: 'runtime_render_main_time_trend',
        status: renderTrendStatus,
        value: runtimeTrend.renderMainGrowthRatio,
        message: `RenderMain.renderer.render trend early=${runtimeTrend.earlyRenderMainMs.toFixed(2)}ms late=${runtimeTrend.lateRenderMainMs.toFixed(2)}ms ratio=${runtimeTrend.renderMainGrowthRatio.toFixed(2)}x; triangles early=${runtimeTrend.earlyTriangles?.toFixed(0) ?? 'n/a'} late=${runtimeTrend.lateTriangles?.toFixed(0) ?? 'n/a'} ratio=${runtimeTrend.triangleGrowthRatio?.toFixed(2) ?? 'n/a'}x; renderer.info draw/frame early=${runtimeTrend.earlyDrawCallsPerFrame?.toFixed(1) ?? 'n/a'} late=${runtimeTrend.lateDrawCallsPerFrame?.toFixed(1) ?? 'n/a'} ratio=${runtimeTrend.drawCallsPerFrameGrowthRatio?.toFixed(2) ?? 'n/a'}x; vegetation reserved/free early=${runtimeTrend.earlyVegetationReserved?.toFixed(0) ?? 'n/a'}/${runtimeTrend.earlyVegetationFree?.toFixed(0) ?? 'n/a'} late=${runtimeTrend.lateVegetationReserved?.toFixed(0) ?? 'n/a'}/${runtimeTrend.lateVegetationFree?.toFixed(0) ?? 'n/a'}; rain active early=${runtimeTrend.earlyActiveRainCount?.toFixed(0) ?? 'n/a'} late=${runtimeTrend.lateActiveRainCount?.toFixed(0) ?? 'n/a'}`
      });
    }
  }

  const peakP99FrameMs = runtimeSamples.length > 0
    ? Math.max(...runtimeSamples.map(s => Number(s.p99FrameMs ?? 0)))
    : 0;
  checks.push({
    id: 'peak_p99_frame_ms',
    status: peakP99FrameMs < 25 ? 'pass' : peakP99FrameMs < 60 ? 'warn' : 'fail',
    value: peakP99FrameMs,
    message: `Peak p99 frame time ${peakP99FrameMs.toFixed(2)}ms`
  });

  const peakMaxFrameMs = runtimeSamples.length > 0
    ? Math.max(...runtimeSamples.map(s => Number(s.maxFrameMs ?? 0)))
    : 0;
  checks.push({
    id: 'peak_max_frame_ms',
    status: peakMaxFrameMs < 120 ? 'pass' : peakMaxFrameMs < 300 ? 'warn' : 'fail',
    value: peakMaxFrameMs,
    message: `Peak max-frame sample ${peakMaxFrameMs.toFixed(2)}ms`
  });

  const lastSample = runtimeSamples[runtimeSamples.length - 1];
  const finalFrameCount = Number(lastSample?.frameCount ?? 0);
  const finalHitch33 = Number(lastSample?.hitch33Count ?? 0);
  const finalHitch50 = Number(lastSample?.hitch50Count ?? 0);
  const finalHitch100 = Number(lastSample?.hitch100Count ?? 0);
  const hitch33Percent = finalFrameCount > 0 ? (finalHitch33 / finalFrameCount) * 100 : 0;
  const hitch50Percent = finalFrameCount > 0 ? (finalHitch50 / finalFrameCount) * 100 : 0;
  const hitch100Percent = finalFrameCount > 0 ? (finalHitch100 / finalFrameCount) * 100 : 0;

  checks.push({
    id: 'hitch_33ms_percent',
    status: hitch33Percent < 0.25 ? 'pass' : hitch33Percent < 1.0 ? 'warn' : 'fail',
    value: hitch33Percent,
    message: `Frames >33ms ${hitch33Percent.toFixed(2)}% (${finalHitch33}/${finalFrameCount})`
  });

  checks.push({
    id: 'hitch_50ms_percent',
    status: hitch50Percent < 0.5 ? 'pass' : hitch50Percent < 2.0 ? 'warn' : 'fail',
    value: hitch50Percent,
    message: `Frames >50ms ${hitch50Percent.toFixed(2)}% (${finalHitch50}/${finalFrameCount})`
  });

  checks.push({
    id: 'hitch_100ms_percent',
    status: hitch100Percent < 0.1 ? 'pass' : hitch100Percent < 0.5 ? 'warn' : 'fail',
    value: hitch100Percent,
    message: `Frames >100ms ${hitch100Percent.toFixed(2)}% (${finalHitch100}/${finalFrameCount})`
  });

  const finalRafCadence = lastSample?.browserStalls?.totals?.rafCadence;
  if (finalRafCadence) {
    const rafIntervalCount = Number(finalRafCadence.intervalCount ?? 0);
    const rafStutter25Count = Number(finalRafCadence.stutter25Count ?? 0);
    const rafHitch33Count = Number(finalRafCadence.hitch33Count ?? 0);
    const rafDropped60HzFrames = Number(finalRafCadence.estimatedDropped60HzFrames ?? 0);
    const rafDroppedFrameTime60HzMs = Number(finalRafCadence.droppedFrameTime60HzMs ?? 0);
    const rafStutter25Percent = rafIntervalCount > 0 ? (rafStutter25Count / rafIntervalCount) * 100 : 0;
    const rafHitch33Percent = rafIntervalCount > 0 ? (rafHitch33Count / rafIntervalCount) * 100 : 0;
    const rafDroppedPerSecond = durationSeconds > 0 ? rafDropped60HzFrames / durationSeconds : 0;
    const rafDroppedFrameTimePerSecond = durationSeconds > 0
      ? rafDroppedFrameTime60HzMs / durationSeconds
      : 0;

    checks.push({
      id: 'raf_stutter_25ms_percent',
      status: rafStutter25Percent < 0.5 ? 'pass' : rafStutter25Percent < 2.0 ? 'warn' : 'fail',
      value: rafStutter25Percent,
      message: `Browser rAF gaps >25ms ${rafStutter25Percent.toFixed(2)}% (${rafStutter25Count}/${rafIntervalCount})`
    });

    checks.push({
      id: 'raf_hitch_33ms_percent',
      status: rafHitch33Percent < 0.25 ? 'pass' : rafHitch33Percent < 1.0 ? 'warn' : 'fail',
      value: rafHitch33Percent,
      message: `Browser rAF gaps >33ms ${rafHitch33Percent.toFixed(2)}% (${rafHitch33Count}/${rafIntervalCount})`
    });

    checks.push({
      id: 'raf_estimated_dropped_60hz_frames_per_second',
      status: rafDroppedPerSecond < 0.1 ? 'pass' : rafDroppedPerSecond < 0.5 ? 'warn' : 'fail',
      value: rafDroppedPerSecond,
      message: `Estimated dropped 60Hz presentation frames ${rafDropped60HzFrames} over ${durationSeconds}s (${rafDroppedPerSecond.toFixed(2)}/s)`
    });

    checks.push({
      id: 'raf_dropped_frame_time_60hz_ms_per_second',
      status: rafDroppedFrameTimePerSecond < 1 ? 'pass' : rafDroppedFrameTimePerSecond < 5 ? 'warn' : 'fail',
      value: rafDroppedFrameTimePerSecond,
      message: `Dropped-frame time over 60Hz budget ${rafDroppedFrameTime60HzMs.toFixed(1)}ms over ${durationSeconds}s (${rafDroppedFrameTimePerSecond.toFixed(2)}ms/s)`
    });
  }

  const avgOverBudget = average(runtimeSamples.map(s => s.overBudgetPercent));
  checks.push({
    id: 'over_budget_percent',
    status: avgOverBudget < 20 ? 'pass' : avgOverBudget < 60 ? 'warn' : 'fail',
    value: avgOverBudget,
    message: `Average over-budget percent ${avgOverBudget.toFixed(2)}%`
  });

  const errorCount = consoleEntries.filter(e => e.type === 'error' || e.type === 'pageerror' || e.type === 'crash').length;
  checks.push({
    id: 'console_errors',
    status: errorCount === 0 ? 'pass' : errorCount <= 3 ? 'warn' : 'fail',
    value: errorCount,
    message: `Captured ${errorCount} browser errors/pageerrors/crashes`
  });

  const uiErrorPanelVisible = runtimeSamples.some(s => s.uiErrorPanelVisible);
  checks.push({
    id: 'ui_error_panel_visible',
    status: uiErrorPanelVisible ? 'fail' : 'pass',
    value: uiErrorPanelVisible ? 1 : 0,
    message: uiErrorPanelVisible
      ? 'Loading/init error panel appeared during runtime capture'
      : 'No loading/init error panel appeared during capture'
  });

  const combatHeavySamples = runtimeSamples.filter(s => {
    const top = s.systemTop[0];
    return top && top.name.toLowerCase().includes('combat') && top.emaMs > 16.67;
  }).length;
  const combatHeavyRatio = sampleCount > 0 ? combatHeavySamples / sampleCount : 0;
  checks.push({
    id: 'combat_budget_dominance',
    status: combatHeavyRatio < 0.2 ? 'pass' : combatHeavyRatio < 0.5 ? 'warn' : 'fail',
    value: combatHeavyRatio,
    message: `Combat was top >16.67ms in ${(combatHeavyRatio * 100).toFixed(1)}% of samples`
  });

  const withRaycastStats = runtimeSamples.filter(s => s.combatBreakdown?.raycastBudget);
  if (withRaycastStats.length > 0) {
    const avgRaycastDenialRate = average(withRaycastStats.map(s => Number(s.combatBreakdown?.raycastBudget?.denialRate ?? 0)));
    checks.push({
      id: 'raycast_denial_rate',
      status: avgRaycastDenialRate < 0.15 ? 'pass' : avgRaycastDenialRate < 0.4 ? 'warn' : 'fail',
      value: avgRaycastDenialRate,
      message: `Average LOS raycast denial rate ${(avgRaycastDenialRate * 100).toFixed(1)}%`
    });
  }

  const withAiSchedulingStats = runtimeSamples.filter(s => s.combatBreakdown?.aiScheduling);
  if (withAiSchedulingStats.length > 0) {
    const avgAIBudgetExceededEvents = average(withAiSchedulingStats.map(s => Number(s.combatBreakdown?.aiScheduling?.aiBudgetExceededEvents ?? 0)));
    checks.push({
      id: 'ai_budget_starvation_events',
      status: avgAIBudgetExceededEvents < 4 ? 'pass' : avgAIBudgetExceededEvents < 12 ? 'warn' : 'fail',
      value: avgAIBudgetExceededEvents,
      message: `Average per-sample AI budget starvation events ${avgAIBudgetExceededEvents.toFixed(2)}`
    });
  }

  const hitValidationMode = options?.hitValidation ?? 'off';
  if (hitValidationMode !== 'off') {
    const shotSamples = runtimeSamples.filter(s => typeof s.shotsThisSession === 'number');
    const driverShotSamples = runtimeSamples
      .map(s => Number(s.harnessDriver?.engineShotsFired))
      .filter(Number.isFinite);
    const driverHitSamples = runtimeSamples
      .map(s => Number(s.harnessDriver?.engineShotsHit))
      .filter(Number.isFinite);
    const finalDriverShots = Number(options?.harnessDriverFinal?.engineShotsFired);
    const finalDriverHits = Number(options?.harnessDriverFinal?.engineShotsHit);
    const maxShots = shotSamples.length > 0
      ? Math.max(...shotSamples.map(s => Number(s.shotsThisSession ?? 0)))
      : 0;
    const maxEngineShots = Math.max(
      maxShots,
      driverShotSamples.length > 0 ? Math.max(...driverShotSamples) : 0,
      Number.isFinite(finalDriverShots) ? finalDriverShots : 0
    );
    const maxHits = shotSamples.length > 0
      ? Math.max(...shotSamples.map(s => Number(s.hitsThisSession ?? 0)))
      : 0;
    const maxEngineHits = Math.max(
      maxHits,
      driverHitSamples.length > 0 ? Math.max(...driverHitSamples) : 0,
      Number.isFinite(finalDriverHits) ? finalDriverHits : 0
    );
    const peakSampleHitRate = shotSamples.length > 0
      ? Math.max(...shotSamples.map(s => Number(s.hitRate ?? 0)))
      : 0;
    const finalDriverHitRate = Number.isFinite(finalDriverShots) && finalDriverShots > 0 && Number.isFinite(finalDriverHits)
      ? finalDriverHits / finalDriverShots
      : 0;
    const peakHitRate = Math.max(peakSampleHitRate, finalDriverHitRate);

    const isBehaviorCritical = hitValidationMode === 'strict' || hitValidationMode === 'critical';
    checks.push({
      id: 'player_shots_recorded',
      status: isBehaviorCritical
        ? (maxEngineShots >= 5 ? 'pass' : maxEngineShots > 0 ? 'warn' : 'fail')
        : (maxEngineShots >= 3 ? 'pass' : 'warn'),
      value: maxEngineShots,
      message: `Recorded player shots in sim=${maxEngineShots}`
    });

    checks.push({
      id: 'player_hits_recorded',
      status: isBehaviorCritical
        ? (maxEngineHits >= 1 ? 'pass' : 'fail')
        : (maxEngineHits >= 1 ? 'pass' : 'warn'),
      value: maxEngineHits,
      message: `Recorded player hits in sim=${maxEngineHits}`
    });

    checks.push({
      id: 'player_hit_rate_peak',
      status: isBehaviorCritical
        ? (peakHitRate >= 0.02 ? 'pass' : peakHitRate > 0 ? 'warn' : 'fail')
        : (peakHitRate >= 0.01 ? 'pass' : 'warn'),
      value: peakHitRate,
      message: `Peak hit rate ${(peakHitRate * 100).toFixed(2)}%`
    });
  }

  if (options?.requireCloseModelEnvelope) {
    const envelope = summarizeCloseModelEnvelope(runtimeSamples);
    const peakCandidates = envelope?.peakCandidatesWithinCloseRadius ?? 0;
    const samplesWithCandidates = envelope?.samplesWithCandidates ?? 0;
    const peakRendered = envelope?.peakRenderedCloseModels ?? 0;
    const materializationPressureObserved =
      peakCandidates >= 4
      && samplesWithCandidates >= 2
      && peakRendered >= 2;
    checks.push({
      id: 'npc_materialization_pressure',
      status: materializationPressureObserved ? 'pass' : 'warn',
      value: peakCandidates,
      message: materializationPressureObserved
        ? `NPC close-model materialization pressure observed (peak candidates=${peakCandidates}, peak rendered=${peakRendered}, samplesWithCandidates=${samplesWithCandidates})`
        : `NPC close-model materialization pressure was thin (peak candidates=${peakCandidates}, peak rendered=${peakRendered}, samplesWithCandidates=${samplesWithCandidates}); this run is diagnostic for materialization pacing and may reflect A Shau route/contact variance`
    });
  }

  const heapSamples = runtimeSamples.filter(s => typeof s.heapUsedMb === 'number');
  if (heapSamples.length >= 2) {
    const baselineCount = Math.min(3, heapSamples.length);
    const baselineValues = heapSamples.slice(0, baselineCount).map(s => Number(s.heapUsedMb ?? 0));
    const baselineHeap = average(baselineValues);
    const lastHeap = Number(heapSamples[heapSamples.length - 1].heapUsedMb ?? 0);
    const peakHeap = Math.max(...heapSamples.map(s => Number(s.heapUsedMb ?? 0)));
    const endDelta = lastHeap - baselineHeap;
    const peakDelta = peakHeap - baselineHeap;
    const recoveredMb = Math.max(0, peakHeap - lastHeap);
    const recoveredRatio = peakDelta > 0 ? recoveredMb / peakDelta : 1;

    checks.push({
      id: 'heap_growth_mb',
      status: endDelta < 20 ? 'pass' : endDelta < 80 ? 'warn' : 'fail',
      value: endDelta,
      message: `Heap end-growth ${endDelta.toFixed(2)} MB (baseline=${baselineHeap.toFixed(2)} MB, end=${lastHeap.toFixed(2)} MB)`
    });

    checks.push({
      id: 'heap_peak_growth_mb',
      status: peakDelta < 35 ? 'pass' : peakDelta < 120 ? 'warn' : 'fail',
      value: peakDelta,
      message: `Heap peak-growth ${peakDelta.toFixed(2)} MB (peak=${peakHeap.toFixed(2)} MB)`
    });

    checks.push({
      id: 'heap_recovery_ratio',
      status: recoveredRatio >= 0.5 ? 'pass' : recoveredRatio >= 0.25 ? 'warn' : 'fail',
      value: recoveredRatio,
      message: `Heap recovery ${(recoveredRatio * 100).toFixed(1)}% from peak (${recoveredMb.toFixed(2)} MB reclaimed before end)`
    });
  }

  // GPU resource trend analysis: detect monotonic growth in geometries/textures
  const rendererSamples = runtimeSamples.filter(s => s.renderer && typeof s.renderer.geometries === 'number');
  if (rendererSamples.length >= 4) {
    const geoValues = rendererSamples.map(s => s.renderer!.geometries);
    const texValues = rendererSamples.map(s => s.renderer!.textures);

    const isMonotonic = (values: number[]): boolean => {
      let increases = 0;
      for (let i = 1; i < values.length; i++) {
        if (values[i] > values[i - 1]) increases++;
      }
      // Monotonic if >80% of transitions are increases
      return increases / (values.length - 1) > 0.8;
    };

    const geoGrowth = geoValues[geoValues.length - 1] - geoValues[0];
    const texGrowth = texValues[texValues.length - 1] - texValues[0];

    if (isMonotonic(geoValues) && geoGrowth > 10) {
      checks.push({
        id: 'gpu_geometry_leak',
        status: 'warn',
        value: geoGrowth,
        message: `Monotonic geometry growth: ${geoValues[0]} -> ${geoValues[geoValues.length - 1]} (+${geoGrowth})`
      });
    }

    if (isMonotonic(texValues) && texGrowth > 5) {
      checks.push({
        id: 'gpu_texture_leak',
        status: 'warn',
        value: texGrowth,
        message: `Monotonic texture growth: ${texValues[0]} -> ${texValues[texValues.length - 1]} (+${texGrowth})`
      });
    }
  }

  // Per-mode harness validators (perf-harness-redesign). These are fail-loud:
  // if the driver fails to produce shots/hits or gets stuck beyond the scenario
  // tolerance, validation.overall flips to fail and the capture script exits
  // non-zero. This is the gate that should have caught PR #88's regression.
  const modeThresholds = options?.modeThresholds ?? null;
  if (modeThresholds) {
    const shotSamples = runtimeSamples.filter(s => typeof s.shotsThisSession === 'number');
    const lastShotSample = shotSamples.length > 0 ? shotSamples[shotSamples.length - 1] : null;
    const sampleFinalShots = lastShotSample ? Number(lastShotSample.shotsThisSession ?? 0) : 0;
    const sampleFinalHits = lastShotSample ? Number(lastShotSample.hitsThisSession ?? 0) : 0;
    const driverShotSamples = runtimeSamples
      .map(s => Number(s.harnessDriver?.engineShotsFired))
      .filter(Number.isFinite);
    const driverHitSamples = runtimeSamples
      .map(s => Number(s.harnessDriver?.engineShotsHit))
      .filter(Number.isFinite);
    const finalDriverShots = Number(options?.harnessDriverFinal?.engineShotsFired);
    const finalDriverHits = Number(options?.harnessDriverFinal?.engineShotsHit);
    const finalShots = Math.max(
      sampleFinalShots,
      driverShotSamples.length > 0 ? driverShotSamples[driverShotSamples.length - 1] : 0,
      Number.isFinite(finalDriverShots) ? finalDriverShots : 0
    );
    const finalHits = Math.max(
      sampleFinalHits,
      driverHitSamples.length > 0 ? driverHitSamples[driverHitSamples.length - 1] : 0,
      Number.isFinite(finalDriverHits) ? finalDriverHits : 0
    );
    const maxStuckSeconds = runtimeSamples.reduce((max, s) => {
      const v = Number(s.harnessDriver?.maxStuckSeconds ?? 0);
      return v > max ? v : max;
    }, 0);
    const finalTransitions = runtimeSamples.reduce((max, s) => {
      const v = Number(s.harnessDriver?.movementTransitions ?? 0);
      return v > max ? v : max;
    }, 0);

    checks.push({
      id: 'harness_min_shots_fired',
      status: finalShots >= modeThresholds.minShotsFired
        ? 'pass'
        : finalShots >= Math.floor(modeThresholds.minShotsFired * 0.5)
          ? 'warn'
          : 'fail',
      value: finalShots,
      message: `Harness player shots=${finalShots} (min=${modeThresholds.minShotsFired})`
    });
    checks.push({
      id: 'harness_min_hits_recorded',
      status: finalHits >= modeThresholds.minHitsRecorded
        ? 'pass'
        : finalHits >= Math.floor(modeThresholds.minHitsRecorded * 0.5)
          ? 'warn'
          : 'fail',
      value: finalHits,
      message: `Harness player hits=${finalHits} (min=${modeThresholds.minHitsRecorded})`
    });
    const runtimePreviewRejectedSamples = runtimeSamples
      .map(s => Number(s.harnessDriver?.runtimeShotPreviewRejectedShots))
      .filter(Number.isFinite);
    const runtimePreviewAimSettlingSamples = runtimeSamples
      .map(s => Number(s.harnessDriver?.runtimeShotPreviewAimSettlingShots))
      .filter(Number.isFinite);
    const runtimePreviewTerrainBlockedSamples = runtimeSamples
      .map(s => Number(s.harnessDriver?.runtimeShotPreviewTerrainBlockedShots))
      .filter(Number.isFinite);
    const runtimePreviewMissSamples = runtimeSamples
      .map(s => Number(s.harnessDriver?.runtimeShotPreviewMissShots))
      .filter(Number.isFinite);
    const runtimePreviewUnavailableSamples = runtimeSamples
      .map(s => Number(s.harnessDriver?.runtimeShotPreviewUnavailableShots))
      .filter(Number.isFinite);
    const runtimePreviewWrongTargetSamples = runtimeSamples
      .map(s => Number(s.harnessDriver?.runtimeShotPreviewWrongTargetShots))
      .filter(Number.isFinite);
    const finalPreviewRejected = Number(options?.harnessDriverFinal?.runtimeShotPreviewRejectedShots);
    const finalPreviewAimSettling = Number(options?.harnessDriverFinal?.runtimeShotPreviewAimSettlingShots);
    const finalPreviewTerrainBlocked = Number(options?.harnessDriverFinal?.runtimeShotPreviewTerrainBlockedShots);
    const finalPreviewMiss = Number(options?.harnessDriverFinal?.runtimeShotPreviewMissShots);
    const finalPreviewUnavailable = Number(options?.harnessDriverFinal?.runtimeShotPreviewUnavailableShots);
    const finalPreviewWrongTarget = Number(options?.harnessDriverFinal?.runtimeShotPreviewWrongTargetShots);
    const runtimePreviewRejected = Math.max(
      runtimePreviewRejectedSamples.length > 0 ? Math.max(...runtimePreviewRejectedSamples) : 0,
      Number.isFinite(finalPreviewRejected) ? finalPreviewRejected : 0,
    );
    const runtimePreviewAimSettling = Math.max(
      runtimePreviewAimSettlingSamples.length > 0 ? Math.max(...runtimePreviewAimSettlingSamples) : 0,
      Number.isFinite(finalPreviewAimSettling) ? finalPreviewAimSettling : 0,
    );
    const runtimePreviewTerrainBlocked = Math.max(
      runtimePreviewTerrainBlockedSamples.length > 0 ? Math.max(...runtimePreviewTerrainBlockedSamples) : 0,
      Number.isFinite(finalPreviewTerrainBlocked) ? finalPreviewTerrainBlocked : 0,
    );
    const runtimePreviewMiss = Math.max(
      runtimePreviewMissSamples.length > 0 ? Math.max(...runtimePreviewMissSamples) : 0,
      Number.isFinite(finalPreviewMiss) ? finalPreviewMiss : 0,
    );
    const runtimePreviewUnavailable = Math.max(
      runtimePreviewUnavailableSamples.length > 0 ? Math.max(...runtimePreviewUnavailableSamples) : 0,
      Number.isFinite(finalPreviewUnavailable) ? finalPreviewUnavailable : 0,
    );
    const runtimePreviewWrongTarget = Math.max(
      runtimePreviewWrongTargetSamples.length > 0 ? Math.max(...runtimePreviewWrongTargetSamples) : 0,
      Number.isFinite(finalPreviewWrongTarget) ? finalPreviewWrongTarget : 0,
    );
    const lastRuntimePreviewStatus = typeof options?.harnessDriverFinal?.lastRuntimeShotPreviewStatus === 'string'
      ? options.harnessDriverFinal.lastRuntimeShotPreviewStatus
      : latestString(runtimeSamples.map(s => s.harnessDriver?.lastRuntimeShotPreviewStatus));
    const lastRuntimePreviewReason = typeof options?.harnessDriverFinal?.lastRuntimeShotPreviewReason === 'string'
      ? options.harnessDriverFinal.lastRuntimeShotPreviewReason
      : latestString(runtimeSamples.map(s => s.harnessDriver?.lastRuntimeShotPreviewReason));
    const runtimePreviewObserved = runtimePreviewRejectedSamples.length > 0
      || Number.isFinite(finalPreviewRejected)
      || runtimePreviewAimSettlingSamples.length > 0
      || Number.isFinite(finalPreviewAimSettling)
      || runtimePreviewTerrainBlockedSamples.length > 0
      || Number.isFinite(finalPreviewTerrainBlocked)
      || runtimeSamples.some(s => s.harnessDriver?.lastRuntimeShotPreviewStatus !== undefined);
    checks.push({
      id: 'harness_runtime_shot_preview_trust',
      status: !runtimePreviewObserved
        ? 'warn'
        : runtimePreviewRejected === 0
          ? 'pass'
          : finalShots < modeThresholds.minShotsFired
            ? 'fail'
            : 'warn',
      value: runtimePreviewRejected,
      message: runtimePreviewObserved
        ? `Runtime shot preview rejected ${runtimePreviewRejected} fire intents (aimSettling=${runtimePreviewAimSettling}, terrainBlocked=${runtimePreviewTerrainBlocked}, miss=${runtimePreviewMiss}, unavailable=${runtimePreviewUnavailable}, wrongTarget=${runtimePreviewWrongTarget}); last=${lastRuntimePreviewStatus ?? 'n/a'}/${lastRuntimePreviewReason ?? 'n/a'}`
        : 'Runtime shot preview counters missing; cannot prove the driver fires only when the player-shot resolver can hit',
    });
    checks.push({
      id: 'harness_max_stuck_seconds',
      status: maxStuckSeconds <= modeThresholds.maxStuckSeconds
        ? 'pass'
        : maxStuckSeconds <= modeThresholds.maxStuckSeconds * 1.5
          ? 'warn'
          : 'fail',
      value: maxStuckSeconds,
      message: `Max harness stuck duration ${maxStuckSeconds.toFixed(1)}s (max=${modeThresholds.maxStuckSeconds}s)`
    });
    // Movement transitions are mainly a liveness signal — a declarative driver
    // that never pressed WASD produced 0 here in PR #88.
    if (finalTransitions > 0) {
      checks.push({
        id: 'harness_min_movement_transitions',
        status: finalTransitions >= modeThresholds.minMovementTransitions
          ? 'pass'
          : finalTransitions >= Math.floor(modeThresholds.minMovementTransitions * 0.5)
            ? 'warn'
            : 'fail',
        value: finalTransitions,
        message: `Harness movement transitions=${finalTransitions} (min=${modeThresholds.minMovementTransitions})`
      });
    }
  }

  const routeSnapStartDistances = runtimeSamples
    .map(s => Number(s.harnessDriver?.maxPathStartSnapDistance ?? s.harnessDriver?.pathStartSnapDistance))
    .filter(Number.isFinite);
  const routeSnapEndDistances = runtimeSamples
    .map(s => Number(s.harnessDriver?.maxPathEndSnapDistance ?? s.harnessDriver?.pathEndSnapDistance))
    .filter(Number.isFinite);
  const finalMaxStartSnap = Number(options?.harnessDriverFinal?.maxPathStartSnapDistance);
  const finalMaxEndSnap = Number(options?.harnessDriverFinal?.maxPathEndSnapDistance);
  if (Number.isFinite(finalMaxStartSnap)) routeSnapStartDistances.push(finalMaxStartSnap);
  if (Number.isFinite(finalMaxEndSnap)) routeSnapEndDistances.push(finalMaxEndSnap);
  const maxRouteSnapDistance = Math.max(
    0,
    routeSnapStartDistances.length > 0 ? Math.max(...routeSnapStartDistances) : 0,
    routeSnapEndDistances.length > 0 ? Math.max(...routeSnapEndDistances) : 0
  );
  const sampleUntrustedSnapCount = runtimeSamples.reduce((max, s) => {
    const v = Number(s.harnessDriver?.untrustedPathSnapCount ?? 0);
    return Number.isFinite(v) && v > max ? v : max;
  }, 0);
  const finalUntrustedSnapCount = Number(options?.harnessDriverFinal?.untrustedPathSnapCount);
  const untrustedSnapCount = Math.max(
    sampleUntrustedSnapCount,
    Number.isFinite(finalUntrustedSnapCount) ? finalUntrustedSnapCount : 0
  );
  const harnessRouteSnapObserved = !!options?.harnessDriverFinal
    || runtimeSamples.some(s => !!s.harnessDriver);
  if (harnessRouteSnapObserved || maxRouteSnapDistance > 0 || untrustedSnapCount > 0) {
    checks.push({
      id: 'harness_route_snap_trust',
      status: untrustedSnapCount === 0 && maxRouteSnapDistance <= 24 ? 'pass' : 'warn',
      value: maxRouteSnapDistance,
      message: `Harness max navmesh route snap ${maxRouteSnapDistance.toFixed(1)}m; untrusted snapped paths rejected=${untrustedSnapCount}`
    });
  }

  const routeProgressTravelMeters = Math.max(
    0,
    ...runtimeSamples
      .map(s => Number(s.harnessDriver?.routeProgressTravelMeters))
      .filter(Number.isFinite),
    Number.isFinite(Number(options?.harnessDriverFinal?.routeProgressTravelMeters))
      ? Number(options?.harnessDriverFinal?.routeProgressTravelMeters)
      : 0
  );
  const finalObjectiveDistanceClosed = Number(options?.harnessDriverFinal?.objectiveDistanceClosed);
  const objectiveDistanceClosed = Number.isFinite(finalObjectiveDistanceClosed)
    ? finalObjectiveDistanceClosed
    : (() => {
        const values = runtimeSamples
          .map(s => Number(s.harnessDriver?.objectiveDistanceClosed))
          .filter(Number.isFinite);
        return values.length > 0 ? values[values.length - 1] : 0;
      })();
  const finalRouteProgressAgeMs = Number(options?.harnessDriverFinal?.routeProgressAgeMs);
  const routeProgressAgeMs = Math.max(
    0,
    ...runtimeSamples
      .map(s => Number(s.harnessDriver?.routeProgressAgeMs))
      .filter(Number.isFinite),
    Number.isFinite(finalRouteProgressAgeMs) ? finalRouteProgressAgeMs : 0
  );
  if (
    routeProgressTravelMeters > 0
    || Math.abs(objectiveDistanceClosed) > 0
    || routeProgressAgeMs > 0
  ) {
    const movedWithoutClosure =
      routeProgressTravelMeters >= 25
      && objectiveDistanceClosed <= 0
      && routeProgressAgeMs >= 6000;
    checks.push({
      id: 'harness_route_progress_trust',
      status: movedWithoutClosure ? 'warn' : 'pass',
      value: objectiveDistanceClosed,
      message: `Harness route progress closed=${objectiveDistanceClosed.toFixed(1)}m after ${routeProgressTravelMeters.toFixed(1)}m travel; route age=${(routeProgressAgeMs / 1000).toFixed(1)}s`
    });
  }

  const hasHarnessSamples = runtimeSamples.some(s => !!s.harnessDriver) || !!options?.harnessDriverFinal;
  if (hasHarnessSamples) {
    const finalFrontlineMoveCount = Number(options?.harnessDriverFinal?.frontlineMoveCount);
    const finalFrontlineDistance = Number(options?.harnessDriverFinal?.frontlineDistance);
    const finalFrontlineCompressed = options?.harnessDriverFinal?.frontlineCompressed === true;
    if (options?.harnessDriverFinal) {
      const movedActors = Number.isFinite(finalFrontlineMoveCount) ? finalFrontlineMoveCount : 0;
      const distance = Number.isFinite(finalFrontlineDistance) ? finalFrontlineDistance : 0;
      checks.push({
        id: 'harness_frontline_compression_equivalence',
        status: movedActors > 0 ? 'warn' : 'pass',
        value: movedActors,
        message: `Harness frontline compression compressed=${finalFrontlineCompressed ? 1 : 0}; movedActors=${movedActors}; distance=${distance.toFixed(1)}m`
      });
    }

    const sampleWorldMovementCalls = runtimeSamples.reduce((max, s) => {
      const v = Number(s.harnessDriver?.worldMovementIntentCalls ?? 0);
      return Number.isFinite(v) && v > max ? v : max;
    }, 0);
    const sampleCameraMovementCalls = runtimeSamples.reduce((max, s) => {
      const v = Number(s.harnessDriver?.cameraMovementIntentCalls ?? 0);
      return Number.isFinite(v) && v > max ? v : max;
    }, 0);
    const sampleNonZeroWorldMovementCalls = runtimeSamples.reduce((max, s) => {
      const v = Number(s.harnessDriver?.nonZeroWorldMovementIntentCalls ?? 0);
      return Number.isFinite(v) && v > max ? v : max;
    }, 0);
    const sampleNonZeroCameraMovementCalls = runtimeSamples.reduce((max, s) => {
      const v = Number(s.harnessDriver?.nonZeroCameraMovementIntentCalls ?? 0);
      return Number.isFinite(v) && v > max ? v : max;
    }, 0);
    const finalWorldMovementCalls = Number(options?.harnessDriverFinal?.worldMovementIntentCalls);
    const finalCameraMovementCalls = Number(options?.harnessDriverFinal?.cameraMovementIntentCalls);
    const finalNonZeroWorldMovementCalls = Number(options?.harnessDriverFinal?.nonZeroWorldMovementIntentCalls);
    const finalNonZeroCameraMovementCalls = Number(options?.harnessDriverFinal?.nonZeroCameraMovementIntentCalls);
    const worldMovementCalls = Math.max(
      sampleWorldMovementCalls,
      Number.isFinite(finalWorldMovementCalls) ? finalWorldMovementCalls : 0
    );
    const cameraMovementCalls = Math.max(
      sampleCameraMovementCalls,
      Number.isFinite(finalCameraMovementCalls) ? finalCameraMovementCalls : 0
    );
    const nonZeroWorldMovementCalls = Math.max(
      sampleNonZeroWorldMovementCalls,
      Number.isFinite(finalNonZeroWorldMovementCalls) ? finalNonZeroWorldMovementCalls : 0
    );
    const nonZeroCameraMovementCalls = Math.max(
      sampleNonZeroCameraMovementCalls,
      Number.isFinite(finalNonZeroCameraMovementCalls) ? finalNonZeroCameraMovementCalls : 0
    );
    if (worldMovementCalls > 0 || cameraMovementCalls > 0) {
      checks.push({
        id: 'harness_movement_mode_equivalence',
        status: worldMovementCalls > 0 ? 'warn' : 'pass',
        value: worldMovementCalls,
        message: `Harness movement modes world=${worldMovementCalls} camera=${cameraMovementCalls}; nonZeroWorld=${nonZeroWorldMovementCalls}; nonZeroCamera=${nonZeroCameraMovementCalls}`
      });
    }

    const sampleUnknownTargetChecks = runtimeSamples.reduce((max, s) => {
      const v = Number(s.harnessDriver?.losUnknownTargetChecks ?? 0);
      return Number.isFinite(v) && v > max ? v : max;
    }, 0);
    const sampleUnknownFireLos = runtimeSamples.reduce((max, s) => {
      const v = Number(s.harnessDriver?.fireUnknownLosRejectedShots ?? 0);
      return Number.isFinite(v) && v > max ? v : max;
    }, 0);
    const finalUnknownTargetChecks = Number(options?.harnessDriverFinal?.losUnknownTargetChecks);
    const finalUnknownFireLos = Number(options?.harnessDriverFinal?.fireUnknownLosRejectedShots);
    const unknownTargetChecks = Math.max(
      sampleUnknownTargetChecks,
      Number.isFinite(finalUnknownTargetChecks) ? finalUnknownTargetChecks : 0
    );
    const unknownFireLos = Math.max(
      sampleUnknownFireLos,
      Number.isFinite(finalUnknownFireLos) ? finalUnknownFireLos : 0
    );
    checks.push({
      id: 'harness_terrain_los_trust',
      status: unknownFireLos === 0 && unknownTargetChecks === 0
        ? 'pass'
        : unknownFireLos > 0
          ? 'fail'
          : 'warn',
      value: unknownFireLos,
      message: `Harness terrain LOS unknown target checks=${unknownTargetChecks}; unknown fire rejections=${unknownFireLos}`
    });
  }

  const aimMoveDivergenceValues = runtimeSamples
    .map(s => Number(s.harnessDriver?.maxAimMovementDivergenceDeg))
    .filter(Number.isFinite);
  const finalAimMoveDivergence = Number(options?.harnessDriverFinal?.maxAimMovementDivergenceDeg);
  if (Number.isFinite(finalAimMoveDivergence)) aimMoveDivergenceValues.push(finalAimMoveDivergence);
  const maxAimMovementDivergence = aimMoveDivergenceValues.length > 0
    ? Math.max(...aimMoveDivergenceValues)
    : 0;
  const sampleAimMovementSamples = runtimeSamples.reduce((max, s) => {
    const v = Number(s.harnessDriver?.aimMovementDivergenceSamples ?? 0);
    return Number.isFinite(v) && v > max ? v : max;
  }, 0);
  const sampleAimMovementOver45 = runtimeSamples.reduce((max, s) => {
    const v = Number(s.harnessDriver?.aimMovementDivergenceOver45Count ?? 0);
    return Number.isFinite(v) && v > max ? v : max;
  }, 0);
  const finalAimMovementSamples = Number(options?.harnessDriverFinal?.aimMovementDivergenceSamples);
  const finalAimMovementOver45 = Number(options?.harnessDriverFinal?.aimMovementDivergenceOver45Count);
  const aimMovementSamples = Math.max(
    sampleAimMovementSamples,
    Number.isFinite(finalAimMovementSamples) ? finalAimMovementSamples : 0
  );
  const aimMovementOver45 = Math.max(
    sampleAimMovementOver45,
    Number.isFinite(finalAimMovementOver45) ? finalAimMovementOver45 : 0
  );
  if (aimMovementSamples > 0) {
    const divergenceRatio = aimMovementOver45 / aimMovementSamples;
    const mechanicallyClean = maxAimMovementDivergence <= 45 && aimMovementOver45 === 0;
    checks.push({
      id: 'harness_aim_movement_equivalence',
      status: mechanicallyClean ? 'pass' : 'warn',
      value: maxAimMovementDivergence,
      message: `Harness max aim/movement divergence ${maxAimMovementDivergence.toFixed(1)}deg; over45=${aimMovementOver45}/${aimMovementSamples} (${(divergenceRatio * 100).toFixed(1)}%)`
    });
  }

  const maxRequestedViewYawDeltaValues = runtimeSamples
    .map(s => Number(s.harnessDriver?.maxRequestedViewYawDeltaDeg))
    .filter(Number.isFinite);
  const maxRequestedViewPitchDeltaValues = runtimeSamples
    .map(s => Number(s.harnessDriver?.maxRequestedViewPitchDeltaDeg))
    .filter(Number.isFinite);
  const maxRemainingViewYawErrorValues = runtimeSamples
    .map(s => Number(s.harnessDriver?.maxRemainingViewYawErrorDeg))
    .filter(Number.isFinite);
  const maxRemainingViewPitchErrorValues = runtimeSamples
    .map(s => Number(s.harnessDriver?.maxRemainingViewPitchErrorDeg))
    .filter(Number.isFinite);
  const finalMaxRequestedViewYawDelta = Number(options?.harnessDriverFinal?.maxRequestedViewYawDeltaDeg);
  const finalMaxRequestedViewPitchDelta = Number(options?.harnessDriverFinal?.maxRequestedViewPitchDeltaDeg);
  const finalMaxRemainingViewYawError = Number(options?.harnessDriverFinal?.maxRemainingViewYawErrorDeg);
  const finalMaxRemainingViewPitchError = Number(options?.harnessDriverFinal?.maxRemainingViewPitchErrorDeg);
  if (Number.isFinite(finalMaxRequestedViewYawDelta)) maxRequestedViewYawDeltaValues.push(finalMaxRequestedViewYawDelta);
  if (Number.isFinite(finalMaxRequestedViewPitchDelta)) maxRequestedViewPitchDeltaValues.push(finalMaxRequestedViewPitchDelta);
  if (Number.isFinite(finalMaxRemainingViewYawError)) maxRemainingViewYawErrorValues.push(finalMaxRemainingViewYawError);
  if (Number.isFinite(finalMaxRemainingViewPitchError)) maxRemainingViewPitchErrorValues.push(finalMaxRemainingViewPitchError);
  const maxRequestedViewYawDelta = maxRequestedViewYawDeltaValues.length > 0
    ? Math.max(...maxRequestedViewYawDeltaValues)
    : 0;
  const maxRequestedViewPitchDelta = maxRequestedViewPitchDeltaValues.length > 0
    ? Math.max(...maxRequestedViewPitchDeltaValues)
    : 0;
  const maxRemainingViewYawError = maxRemainingViewYawErrorValues.length > 0
    ? Math.max(...maxRemainingViewYawErrorValues)
    : 0;
  const maxRemainingViewPitchError = maxRemainingViewPitchErrorValues.length > 0
    ? Math.max(...maxRemainingViewPitchErrorValues)
    : 0;
  const finalLargeViewTurnCount = Number(options?.harnessDriverFinal?.largeViewTurnCount);
  const sampleLargeViewTurnCount = runtimeSamples.reduce((max, s) => {
    const v = Number(s.harnessDriver?.largeViewTurnCount ?? 0);
    return Number.isFinite(v) && v > max ? v : max;
  }, 0);
  const largeViewTurnCount = Math.max(
    sampleLargeViewTurnCount,
    Number.isFinite(finalLargeViewTurnCount) ? finalLargeViewTurnCount : 0
  );
  if (
    maxRequestedViewYawDelta > 0
    || maxRequestedViewPitchDelta > 0
    || maxRemainingViewYawError > 0
    || maxRemainingViewPitchError > 0
  ) {
    const hasLargeRequest = largeViewTurnCount > 0
      || maxRequestedViewYawDelta > 45
      || maxRequestedViewPitchDelta > 45
      || maxRemainingViewYawError > 30
      || maxRemainingViewPitchError > 15;
    checks.push({
      id: 'harness_view_slew_request_equivalence',
      status: hasLargeRequest ? 'warn' : 'pass',
      value: Math.max(maxRequestedViewYawDelta, maxRequestedViewPitchDelta),
      message: `Harness requested view delta yaw=${maxRequestedViewYawDelta.toFixed(1)}deg pitch=${maxRequestedViewPitchDelta.toFixed(1)}deg; remaining yaw=${maxRemainingViewYawError.toFixed(1)}deg pitch=${maxRemainingViewPitchError.toFixed(1)}deg; largeRequests=${largeViewTurnCount}`
    });
  }

  const shotPresentationStats = summarizeShotPresentationContexts(
    collectHarnessShotEpochs(runtimeSamples, options?.harnessDriverFinal)
  );
  if (shotPresentationStats && shotPresentationStats.shotEpochCount > 0) {
    const minShotClearance = shotPresentationStats.minEffectiveClearanceMeters
      ?? shotPresentationStats.minClearanceMeters;
    const shotContextAnomaly =
      shotPresentationStats.contextCount === 0
      || shotPresentationStats.maxCameraYawDeltaDeg > 30
      || shotPresentationStats.maxCameraPitchDeltaDeg > 15
      || shotPresentationStats.maxCameraPositionDeltaMeters > 2
      || (minShotClearance !== null && minShotClearance < 0.75)
      || shotPresentationStats.terrainUnsyncedBufferVisibleChurnEvents > 0
      || shotPresentationStats.terrainNotReadyEvents > 0;
    checks.push({
      id: 'harness_shot_presentation_context_equivalence',
      status: shotContextAnomaly ? 'warn' : 'pass',
      value: shotPresentationStats.contextCount,
      message: `Shot presentation contexts=${shotPresentationStats.contextCount}/${shotPresentationStats.shotEpochCount}; cameraDelta yaw=${shotPresentationStats.maxCameraYawDeltaDeg.toFixed(1)}deg pitch=${shotPresentationStats.maxCameraPitchDeltaDeg.toFixed(1)}deg pos=${shotPresentationStats.maxCameraPositionDeltaMeters.toFixed(2)}m; minClearance=${formatNullableMeters(shotPresentationStats.minClearanceMeters)} effective=${formatNullableMeters(shotPresentationStats.minEffectiveClearanceMeters)}; terrainHashChurn=${shotPresentationStats.terrainHashChurnEvents} identity=${shotPresentationStats.terrainIdentityChurnEvents} edgeMask=${shotPresentationStats.terrainEdgeMaskChurnEvents} morphOnly=${shotPresentationStats.terrainMorphOnlyChurnEvents} unsyncedBufferVisible=${shotPresentationStats.terrainUnsyncedBufferVisibleChurnEvents}; terrainNotReady=${shotPresentationStats.terrainNotReadyEvents}`
    });
  }

  return {
    overall: getOverallStatus(checks),
    checks
  };
}

async function withTimeout<T>(label: string, promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Force GC via CDP and return heap measurement.
 * Double-collects with a brief gap for finalizers.
 */
async function forceGCAndMeasureHeap(
  cdp: CDPSession,
  page: Page
): Promise<{ heapUsedMb: number; heapTotalMb: number }> {
  try {
    await cdp.send('HeapProfiler.collectGarbage');
    await sleep(100);
    await cdp.send('HeapProfiler.collectGarbage');
    await sleep(50);
  } catch {
    // CDP may not support HeapProfiler.collectGarbage in all contexts
  }
  const memory = await page.evaluate(() => {
    const mem = (performance as any).memory;
    return {
      heapUsedMb: mem?.usedJSHeapSize ? Number(mem.usedJSHeapSize) / (1024 * 1024) : 0,
      heapTotalMb: mem?.totalJSHeapSize ? Number(mem.totalJSHeapSize) / (1024 * 1024) : 0,
    };
  });
  return memory;
}

async function prewarmDevServer(port: number, paths: string[]): Promise<{ totalMs: number; allOk: boolean }> {
  const start = Date.now();
  let allOk = true;

  for (const path of paths) {
    const url = `http://${PERF_SERVER_HOST}:${port}${path}`;
    const stepStart = Date.now();
    try {
      const res = await withTimeout(
        `prewarm ${path}`,
        fetch(url, { cache: 'no-store' as RequestCache }),
        STEP_TIMEOUT_MS
      );
      if (!res.ok) {
        allOk = false;
        logStep(`⚠ prewarm ${path} -> HTTP ${res.status}`);
      } else {
        logStep(`🔥 prewarm ${path} in ${Date.now() - stepStart}ms`);
      }
    } catch (error) {
      allOk = false;
      logStep(`⚠ prewarm ${path} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { totalMs: Date.now() - start, allOk };
}

async function preflightRuntimePage(
  page: Page,
  preflightUrl: string,
  startupTimeoutSeconds: number,
  runtimePreflightTimeoutSeconds: number
): Promise<{ totalMs: number; ok: boolean; reason?: string }> {
  const start = Date.now();
  const timeoutMs = Math.max(
    1000,
    Math.min(startupTimeoutSeconds * 1000, runtimePreflightTimeoutSeconds * 1000)
  );
  const navTimeoutMs = Math.max(STEP_TIMEOUT_MS, startupTimeoutSeconds * 1000 + 5000);
  try {
    logStep(`🧪 Runtime preflight navigate ${preflightUrl}`);
    await withTimeout('preflight page.goto', page.goto(preflightUrl, { waitUntil: 'commit' }), navTimeoutMs);
    await withTimeout(
      'preflight wait runtime',
      page.waitForFunction(
        () => {
          const startup = (window as any).__startupTelemetry?.getSnapshot?.();
          const hasStartupMark = Boolean(startup?.marks?.length);
          return hasStartupMark || document.readyState === 'complete';
        },
        undefined,
        { timeout: timeoutMs }
      ),
      timeoutMs + 1000
    );
    const snapshot = await safeAwait(
      'preflight startup snapshot',
      page.evaluate(() => (window as any).__startupTelemetry?.getSnapshot?.() ?? null),
      3000
    );
    if (snapshot?.marks?.length) {
      const last = snapshot.marks[snapshot.marks.length - 1];
      logStep(`🧪 Runtime preflight ready at ${Number(last?.sinceStartMs ?? 0).toFixed(0)}ms (mark=${String(last?.name ?? 'unknown')})`);
    }
    return { totalMs: Date.now() - start, ok: true };
  } catch (error) {
    return {
      totalMs: Date.now() - start,
      ok: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

async function getFrameCount(page: Page): Promise<number> {
  return withTimeout('frame count', page.evaluate(() => {
    const metrics = (window as any).__metrics;
    return metrics ? Number(metrics.frameCount ?? 0) : 0;
  }), 8000);
}

async function getStartupProbe(page: Page): Promise<{
  frameCount: number;
  hasEngine: boolean;
  hasMetrics: boolean;
  readyState: string;
  uiErrorPanelVisible: boolean;
  gameStarted: boolean;
  startupPhase: string | null;
  rafTicks: number;
  hidden: boolean;
  visibilityState: string;
  activeViewTransition: boolean;
  uiTransitionEnabled: boolean;
  uiTransitionReason: string | null;
  startupElapsedMs?: number;
  startupLastMark?: string;
  startupLastMarkMs?: number;
  combatTotalMs?: number;
  combatAiMs?: number;
  combatSpatialMs?: number;
  combatBillboardMs?: number;
  combatAiStateTop?: string;
  combatAiStateTopMs?: number;
}> {
  return withTimeout('startup probe', page.evaluate(() => {
    const metrics = (window as any).__metrics;
    const engine = (window as any).__engine;
    const startup = (window as any).__startupTelemetry?.getSnapshot?.();
    const combatProfile = (window as any).combatProfile?.();
    const startupPhase = typeof engine?.startupFlow?.getState === 'function'
      ? String(engine.startupFlow.getState().phase ?? '')
      : null;
    let combatAiStateTop: string | undefined;
    let combatAiStateTopMs: number | undefined;
    const aiStateMs = combatProfile?.timing?.aiStateMs;
    if (aiStateMs && typeof aiStateMs === 'object') {
      const entries = Object.entries(aiStateMs as Record<string, number>).sort((a, b) => Number(b[1]) - Number(a[1]));
      if (entries.length > 0) {
        combatAiStateTop = entries[0][0];
        combatAiStateTopMs = Number(entries[0][1]);
      }
    }
    return {
      frameCount: metrics ? Number(metrics.frameCount ?? 0) : 0,
      hasEngine: Boolean(engine),
      hasMetrics: Boolean(metrics),
      readyState: document.readyState,
      uiErrorPanelVisible: Boolean(document.querySelector('.error-panel')),
      gameStarted: Boolean(engine?.gameStarted),
      startupPhase,
      rafTicks: Number((window as any).__perfHarnessRaf?.ticks ?? 0),
      hidden: document.hidden,
      visibilityState: document.visibilityState,
      activeViewTransition: Boolean((document as Document & { activeViewTransition?: unknown }).activeViewTransition),
      uiTransitionEnabled: Boolean(
        (document as Document & {
          uiTransitionState?: { enabled?: unknown };
        }).uiTransitionState?.enabled
      ),
      uiTransitionReason: (() => {
        const reason = (document as Document & {
          uiTransitionState?: { reason?: unknown };
        }).uiTransitionState?.reason;
        return typeof reason === 'string' ? reason : null;
      })(),
      startupElapsedMs: startup ? Number(startup.totalElapsedMs ?? 0) : undefined,
      startupLastMark: startup?.marks?.length ? String(startup.marks[startup.marks.length - 1].name ?? '') : undefined,
      startupLastMarkMs: startup?.marks?.length ? Number(startup.marks[startup.marks.length - 1].sinceStartMs ?? 0) : undefined,
      combatTotalMs: combatProfile?.timing ? Number(combatProfile.timing.totalMs ?? 0) : undefined,
      combatAiMs: combatProfile?.timing ? Number(combatProfile.timing.aiUpdateMs ?? 0) : undefined,
      combatSpatialMs: combatProfile?.timing ? Number(combatProfile.timing.spatialSyncMs ?? 0) : undefined,
      combatBillboardMs: combatProfile?.timing ? Number(combatProfile.timing.billboardUpdateMs ?? 0) : undefined,
      combatAiStateTop,
      combatAiStateTopMs
    };
  }), 8000);
}

async function waitForRendering(
  page: Page,
  maxStartupSeconds: number,
  frameThreshold: number
): Promise<{
  started: boolean;
  lastFrameCount: number;
  reason?: string;
  firstEngineSeenSec?: number;
  firstMetricsSeenSec?: number;
  thresholdReachedSec?: number;
  lastStartupMark?: string;
  lastStartupMarkMs?: number;
}> {
  logStep('⏳ Waiting for startup frame progression');

  const probeIntervalSeconds = 3;
  const maxSamples = Math.max(1, Math.ceil(maxStartupSeconds / probeIntervalSeconds));
  const minLiveFrameRateFps = 8;
  const minLiveProgressWindowSeconds = 9;
  let count = 0;
  let rafTicks = 0;
  let firstEngineSeenSec: number | undefined;
  let firstMetricsSeenSec: number | undefined;
  let lastStartupMark: string | undefined;
  let lastStartupMarkMs: number | undefined;
  let stalledGameplaySamples = 0;
  const liveProgressWindow: Array<{ seconds: number; frameCount: number }> = [];
  let liveProgressWindowHead = 0;
  for (let i = 0; i < maxSamples; i++) {
    await sleep(probeIntervalSeconds * 1000);
    try {
      const probe = await getStartupProbe(page);
      const frameDelta = probe.frameCount - count;
      const rafDelta = probe.rafTicks - rafTicks;
      count = probe.frameCount;
      rafTicks = probe.rafTicks;
      if (probe.hasEngine && firstEngineSeenSec === undefined) {
        firstEngineSeenSec = (i + 1) * probeIntervalSeconds;
      }
      if (probe.hasMetrics && firstMetricsSeenSec === undefined) {
        firstMetricsSeenSec = (i + 1) * probeIntervalSeconds;
      }
      lastStartupMark = probe.startupLastMark;
      lastStartupMarkMs = probe.startupLastMarkMs;
      const combatMsg = probe.combatTotalMs !== undefined
        ? ` combat(total=${probe.combatTotalMs.toFixed(1)} ai=${(probe.combatAiMs ?? 0).toFixed(1)} spatial=${(probe.combatSpatialMs ?? 0).toFixed(1)} billboard=${(probe.combatBillboardMs ?? 0).toFixed(1)} aiTop=${probe.combatAiStateTop ?? 'n/a'}:${(probe.combatAiStateTopMs ?? 0).toFixed(1)})`
        : '';
      const startupMsg = probe.startupLastMark
        ? ` startup(mark=${probe.startupLastMark}@${Number(probe.startupLastMarkMs ?? 0).toFixed(0)}ms total=${Number(probe.startupElapsedMs ?? 0).toFixed(0)}ms)`
        : '';
      logStep(
        `Startup frame sample ${((i + 1) * probeIntervalSeconds)}s -> ${count} `
        + `(raf=${probe.rafTicks} ready=${probe.readyState} phase=${probe.startupPhase ?? 'unknown'} `
        + `started=${probe.gameStarted ? 1 : 0} hidden=${probe.hidden ? 1 : 0} `
        + `visibility=${probe.visibilityState} transition=${probe.activeViewTransition ? 1 : 0} `
        + `uiTransitions=${probe.uiTransitionEnabled ? 1 : 0}:${probe.uiTransitionReason ?? 'none'} `
        + `engine=${probe.hasEngine ? 1 : 0} metrics=${probe.hasMetrics ? 1 : 0} errPanel=${probe.uiErrorPanelVisible ? 1 : 0})`
        + `${startupMsg}${combatMsg}`
      );
      if (probe.gameStarted && probe.frameCount > 0) {
        const elapsedSeconds = (i + 1) * probeIntervalSeconds;
        liveProgressWindow.push({ seconds: elapsedSeconds, frameCount: probe.frameCount });
        while (
          liveProgressWindow.length - liveProgressWindowHead > 1
          && elapsedSeconds - liveProgressWindow[liveProgressWindowHead].seconds > minLiveProgressWindowSeconds
        ) {
          liveProgressWindowHead++;
        }
        if (liveProgressWindowHead > 16 && liveProgressWindowHead * 2 > liveProgressWindow.length) {
          const retainedLiveProgressSamples = liveProgressWindow.length - liveProgressWindowHead;
          for (let j = 0; j < retainedLiveProgressSamples; j++) {
            liveProgressWindow[j] = liveProgressWindow[j + liveProgressWindowHead];
          }
          liveProgressWindow.length = retainedLiveProgressSamples;
          liveProgressWindowHead = 0;
        }
        stalledGameplaySamples = frameDelta <= 0 && rafDelta <= 0
          ? stalledGameplaySamples + 1
          : 0;
        if (stalledGameplaySamples >= 2) {
          return {
            started: false,
            lastFrameCount: probe.frameCount,
            reason: `Gameplay startup stalled after activation (frameCount=${probe.frameCount}, rafTicks=${probe.rafTicks}, phase=${probe.startupPhase ?? 'unknown'}, hidden=${probe.hidden}, visibility=${probe.visibilityState}, activeViewTransition=${probe.activeViewTransition}, uiTransitionEnabled=${probe.uiTransitionEnabled}, uiTransitionReason=${probe.uiTransitionReason ?? 'none'})`,
            firstEngineSeenSec,
            firstMetricsSeenSec,
            lastStartupMark,
            lastStartupMarkMs
          };
        }
        const firstLiveSample = liveProgressWindow[liveProgressWindowHead];
        const liveElapsedSeconds = elapsedSeconds - firstLiveSample.seconds;
        const liveFrameDelta = probe.frameCount - firstLiveSample.frameCount;
        if (probe.frameCount >= frameThreshold) {
          return {
            started: true,
            lastFrameCount: count,
            firstEngineSeenSec,
            firstMetricsSeenSec,
            thresholdReachedSec: elapsedSeconds,
            lastStartupMark,
            lastStartupMarkMs
          };
        }
        if (liveElapsedSeconds >= minLiveProgressWindowSeconds) {
          const liveFrameRate = liveFrameDelta / liveElapsedSeconds;
          if (liveFrameRate < minLiveFrameRateFps) {
            return {
              started: false,
              lastFrameCount: probe.frameCount,
              reason: `Gameplay startup is live but frame progress is too slow (${liveFrameRate.toFixed(2)} fps over ${liveElapsedSeconds.toFixed(1)}s, frameCount=${probe.frameCount}, threshold=${frameThreshold}, phase=${probe.startupPhase ?? 'unknown'}, hidden=${probe.hidden}, visibility=${probe.visibilityState})`,
              firstEngineSeenSec,
              firstMetricsSeenSec,
              lastStartupMark,
              lastStartupMarkMs
            };
          }
        }
      }
    } catch {
      // If early runtime globals are not available yet, keep probing until timeout.
      count = 0;
    }
    if (count >= frameThreshold) {
      return {
        started: true,
        lastFrameCount: count,
        firstEngineSeenSec,
        firstMetricsSeenSec,
        thresholdReachedSec: (i + 1) * probeIntervalSeconds,
        lastStartupMark,
        lastStartupMarkMs
      };
    }
  }
  return {
    started: false,
    lastFrameCount: count,
    reason: `Rendering did not start (frameCount=${count}, threshold=${frameThreshold}, timeout=${maxStartupSeconds}s)`,
    firstEngineSeenSec,
    firstMetricsSeenSec,
    lastStartupMark,
    lastStartupMarkMs
  };
}

async function warmupRuntime(page: Page, warmupSeconds: number): Promise<void> {
  if (warmupSeconds <= 0) return;
  logStep(`🔥 Warmup window ${warmupSeconds}s`);
  const start = Date.now();
  while (Date.now() - start < warmupSeconds * 1000) {
    await sleep(1000);
    const frameCount = await safeAwait('warmup frame count', getFrameCount(page), 3000);
    if (frameCount !== null) {
      logStep(`warmup frame=${frameCount}`);
    }
  }
}

async function applyWeatherStateOverride(
  page: Page,
  weatherStateOverride: WeatherStateOverride
): Promise<void> {
  if (weatherStateOverride === 'default') return;

  const result = await withTimeout(
    `apply weather override ${weatherStateOverride}`,
    page.evaluate((state) => {
      const weather = (window as any).__engine?.systemManager?.weatherSystem;
      if (!weather || typeof weather.setWeatherState !== 'function') {
        return { ok: false, reason: 'weatherSystem unavailable' };
      }
      weather.setWeatherState(state, true);
      weather.update?.(0);
      return {
        ok: true,
        debug: weather.getDebugInfo?.() ?? null,
      };
    }, weatherStateOverride),
    5000
  );

  if (!result?.ok) {
    throw new Error(`Failed to apply weather override ${weatherStateOverride}: ${result?.reason ?? 'unknown'}`);
  }
  logStep(`☔ Weather diagnostic override applied (${weatherStateOverride}, debug=${JSON.stringify(result.debug ?? null)})`);
}

async function dismissMissionBriefingIfPresent(page: Page): Promise<boolean> {
  const dismissed = await safeAwait(
    'dismiss mission briefing',
    page.evaluate(() => {
      const btn = document.querySelector('[data-ref="beginBtn"]') as HTMLButtonElement | null;
      if (!btn) return false;
      btn.click();
      return true;
    }),
    3000
  );
  return dismissed === true;
}

async function startRequestedMode(page: Page, requestedMode: string, startupTimeoutSeconds: number): Promise<void> {
  await withTimeout(
    'wait __engine',
    page.waitForFunction(() => Boolean((window as any).__engine), undefined, { timeout: startupTimeoutSeconds * 1000 }),
    startupTimeoutSeconds * 1000 + 1000
  );

  const modeStartResult = await safeAwait(
    `kick mode ${requestedMode}`,
    page.evaluate((mode: string) => {
      const w = window as any;
      const engine = w.__engine;
      if (!engine || typeof engine.startGameWithMode !== 'function') {
        return { ok: false, reason: 'engine unavailable' };
      }

      const existing = w.__perfHarnessModeStart;
      if (existing?.mode === mode && !existing.result) {
        return { ok: true, reused: true };
      }

      const startState: {
        mode: string;
        result: { ok: boolean; reason?: string } | null;
      } = {
        mode,
        result: null,
      };
      w.__perfHarnessModeStart = startState;

      Promise.resolve()
        .then(() => engine.startGameWithMode(mode))
        .then(() => {
          startState.result = { ok: true };
        })
        .catch((error) => {
          startState.result = {
            ok: false,
            reason: error instanceof Error ? error.message : String(error),
          };
        });

      return { ok: true };
    }, requestedMode),
    STEP_TIMEOUT_MS
  );

  if (!modeStartResult?.ok) {
    throw new Error(`Failed to start requested mode ${requestedMode}: ${modeStartResult?.reason ?? 'unknown'}`);
  }

  const deadline = Date.now() + Math.max(startupTimeoutSeconds * 1000, STEP_TIMEOUT_MS);
  let missionBriefingDismissed = false;

  while (Date.now() < deadline) {
    if (!missionBriefingDismissed && await dismissMissionBriefingIfPresent(page)) {
      missionBriefingDismissed = true;
      logStep('🪂 Mission briefing dismissed for harness startup');
    }

    const modeState = await safeAwait(
      `poll mode ${requestedMode} start`,
      page.evaluate(() => {
        const w = window as any;
        const engine = w.__engine;
        const flowState = engine?.startupFlow?.getState?.() ?? null;
        return {
          result: w.__perfHarnessModeStart?.result ?? null,
          gameStarted: Boolean(engine?.gameStarted),
          gameStartPending: Boolean(engine?.gameStartPending),
          phase: String(flowState?.phase ?? ''),
          briefingVisible: Boolean(document.querySelector('[data-ref="beginBtn"]')),
          errorPanelVisible: Boolean(document.querySelector('.error-panel')),
        };
      }),
      3000
    );

    if (modeState?.result && !modeState.result.ok) {
      throw new Error(`Failed to start requested mode ${requestedMode}: ${modeState.result.reason ?? 'unknown'}`);
    }

    if (modeState?.gameStarted || modeState?.phase === 'live') {
      return;
    }

    await sleep(250);
  }

  const finalModeState = await safeAwait(
    `final mode ${requestedMode} start state`,
    page.evaluate(() => {
      const w = window as any;
      const engine = w.__engine;
      const flowState = engine?.startupFlow?.getState?.() ?? null;
      return {
        result: w.__perfHarnessModeStart?.result ?? null,
        gameStarted: Boolean(engine?.gameStarted),
        gameStartPending: Boolean(engine?.gameStartPending),
        phase: String(flowState?.phase ?? ''),
        briefingVisible: Boolean(document.querySelector('[data-ref="beginBtn"]')),
      };
    }),
    3000
  );

  if (finalModeState?.gameStarted || finalModeState?.phase === 'live') {
    logStep(
      `⚠ Mode ${requestedMode} reached live state after poll timeouts; continuing ` +
      `(phase=${finalModeState.phase ?? 'unknown'}, gameStarted=${finalModeState.gameStarted ? 1 : 0})`
    );
    return;
  }

  throw new Error(
    `Failed to start requested mode ${requestedMode}: timeout` +
    ` (phase=${finalModeState?.phase ?? 'unknown'}, gameStarted=${finalModeState?.gameStarted ? 1 : 0},` +
    ` gameStartPending=${finalModeState?.gameStartPending ? 1 : 0}, briefingVisible=${finalModeState?.briefingVisible ? 1 : 0})`
  );
}

type ActiveScenarioOptions = {
  enabled: boolean;
  mode: string;
  driverSeed: number | null;
  compressFrontline: boolean;
  allowWarpRecovery: boolean;
  topUpHealth: boolean;
  autoRespawn: boolean;
  movementDecisionIntervalMs: number;
  frontlineTriggerDistance: number;
  maxCompressedPerFaction: number;
};

type PressureReadyWarmupStatus = 'disabled' | 'ready' | 'timeout' | 'unavailable';

type PressureReadyWarmupSnapshot = {
  ready: boolean;
  reason: string;
  closeCandidates: number;
  renderedCloseModels: number;
  activeCloseModels: number;
  engineShotsFired: number;
  engineShotsHit: number;
  botState: string | null;
  currentTargetDistance: number | null;
  nearestPerceivedEnemyDistance: number | null;
  nearestOpforDistance: number | null;
  objectiveKind: string | null;
  objectiveDistance: number | null;
};

type PressureReadyWarmupResult = {
  requested: boolean;
  status: PressureReadyWarmupStatus;
  timeoutSeconds: number;
  elapsedMs: number;
  samples: number;
  consecutiveReadySamples: number;
  reason: string;
  lastSnapshot: PressureReadyWarmupSnapshot | null;
};

async function setupActiveScenarioDriver(page: Page, options: ActiveScenarioOptions): Promise<void> {
  if (!options.enabled) return;

  const driverInstalled = await safeAwait(
    'check active scenario driver',
    page.evaluate(() => Boolean((window as any).__perfHarnessDriver?.start)),
    SCENARIO_SETUP_TIMEOUT_MS
  );
  if (!driverInstalled) {
    await withTimeout(
      'inject active scenario driver',
      page.addScriptTag({ path: join(process.cwd(), 'scripts', 'perf-active-driver.cjs') }),
      SCENARIO_SETUP_TIMEOUT_MS
    );
  }

  const setupResult = await withTimeout(
    'active scenario setup',
    page.evaluate((opts) => (window as any).__perfHarnessDriver.start(opts), options),
    SCENARIO_SETUP_TIMEOUT_MS
  );

  logStep(
    `🎮 Active scenario driver enabled (patterns=${Number(setupResult?.movementPatternCount ?? 0)}, mode=${String(setupResult?.mode ?? options.mode)}, driverSeed=${setupResult?.driverSeed ?? options.driverSeed ?? 'none'}, driverIntervalMs=${Number(setupResult?.movementDecisionIntervalMs ?? options.movementDecisionIntervalMs)}, compressFrontline=${Boolean(setupResult?.compressFrontline)}, allowWarpRecovery=${Boolean(setupResult?.allowWarpRecovery)}, topUpHealth=${Boolean(setupResult?.topUpHealth)}, autoRespawn=${Boolean(setupResult?.autoRespawn)})`
  );
}

async function waitForPressureReadyWarmup(
  page: Page,
  options: {
    requested: boolean;
    timeoutSeconds: number;
    activePlayerScenario: boolean;
    enableCombat: boolean;
  }
): Promise<PressureReadyWarmupResult> {
  const timeoutSeconds = Math.max(0, Number(options.timeoutSeconds ?? 0));
  if (!options.requested) {
    return {
      requested: false,
      status: 'disabled',
      timeoutSeconds,
      elapsedMs: 0,
      samples: 0,
      consecutiveReadySamples: 0,
      reason: 'disabled',
      lastSnapshot: null,
    };
  }

  if (!options.enableCombat || !options.activePlayerScenario) {
    return {
      requested: true,
      status: 'unavailable',
      timeoutSeconds,
      elapsedMs: 0,
      samples: 0,
      consecutiveReadySamples: 0,
      reason: 'requires active combat driver',
      lastSnapshot: null,
    };
  }

  logStep(
    `🎯 Pressure-ready warmup waiting up to ${timeoutSeconds}s ` +
    `for ${PRESSURE_READY_CONSECUTIVE_SAMPLES} consecutive contact/materialization samples`
  );

  const startedAt = Date.now();
  const deadline = startedAt + timeoutSeconds * 1000;
  let samples = 0;
  let consecutiveReadySamples = 0;
  let lastSnapshot: PressureReadyWarmupSnapshot | null = null;

  while (Date.now() <= deadline) {
    const snapshot = await safeAwait(
      'pressure-ready warmup probe',
      page.evaluate(() => {
        const nullableNumber = (value: unknown): number | null => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        };
        const engine = (window as any).__engine;
        const combatantRenderer = engine?.systemManager?.combatantSystem?.combatantRenderer;
        const closeModelStats = combatantRenderer?.getCloseModelRuntimeStats?.({ drainTransitionWindow: false }) ?? null;
        const driverState = (window as any).__perfHarnessDriverState?.getDebugSnapshot?.() ?? null;
        const driverCounters =
          (window as any).__perfHarnessDriverState?.getCountersSnapshot?.()
          ?? (window as any).__perfHarnessDriver?.getCountersSnapshot?.()
          ?? null;

        const closeCandidates = Number(closeModelStats?.candidatesWithinCloseRadius ?? 0);
        const renderedCloseModels = Number(closeModelStats?.renderedCloseModels ?? 0);
        const activeCloseModels = Number(closeModelStats?.activeCloseModels ?? 0);
        const engineShotsFired = Number(driverState?.engineShotsFired ?? driverCounters?.engineShotsFired ?? 0);
        const engineShotsHit = Number(driverState?.engineShotsHit ?? driverCounters?.engineShotsHit ?? 0);
        const botState = typeof driverState?.botState === 'string'
          ? driverState.botState
          : typeof driverState?.movementState === 'string'
            ? driverState.movementState
            : null;
        const currentTargetDistance = nullableNumber(driverState?.currentTargetDistance);
        const nearestPerceivedEnemyDistance = nullableNumber(driverState?.nearestPerceivedEnemyDistance);
        const nearestOpforDistance = nullableNumber(driverState?.nearestOpforDistance);
        const objectiveKind = typeof driverState?.objectiveKind === 'string' ? driverState.objectiveKind : null;
        const objectiveDistance = nullableNumber(driverState?.objectiveDistance);

        let reason = 'not-ready';
        let ready = false;
        if (closeCandidates >= 2 && renderedCloseModels >= 1) {
          ready = true;
          reason = 'close-model-pressure';
        } else if (engineShotsFired > 0) {
          ready = true;
          reason = 'live-fire';
        } else if (botState === 'ENGAGE' && currentTargetDistance !== null && currentTargetDistance <= 220) {
          ready = true;
          reason = 'engage-target-distance';
        } else if (nearestPerceivedEnemyDistance !== null && nearestPerceivedEnemyDistance <= 180) {
          ready = true;
          reason = 'near-perceived-enemy';
        }

        return {
          ready,
          reason,
          closeCandidates,
          renderedCloseModels,
          activeCloseModels,
          engineShotsFired,
          engineShotsHit,
          botState,
          currentTargetDistance,
          nearestPerceivedEnemyDistance,
          nearestOpforDistance,
          objectiveKind,
          objectiveDistance,
        } satisfies PressureReadyWarmupSnapshot;
      }),
      3000
    );

    samples++;
    lastSnapshot = snapshot;
    if (snapshot?.ready) {
      consecutiveReadySamples++;
    } else {
      consecutiveReadySamples = 0;
    }

    if (consecutiveReadySamples >= PRESSURE_READY_CONSECUTIVE_SAMPLES) {
      const elapsedMs = Date.now() - startedAt;
      logStep(
        `🎯 Pressure-ready warmup passed after ${(elapsedMs / 1000).toFixed(1)}s ` +
        `(reason=${snapshot?.reason ?? 'unknown'}, close=${snapshot?.renderedCloseModels ?? 0}/${snapshot?.closeCandidates ?? 0}, ` +
        `shots=${snapshot?.engineShotsFired ?? 0}, state=${snapshot?.botState ?? 'unknown'})`
      );
      return {
        requested: true,
        status: 'ready',
        timeoutSeconds,
        elapsedMs,
        samples,
        consecutiveReadySamples,
        reason: snapshot?.reason ?? 'ready',
        lastSnapshot,
      };
    }

    if (Date.now() >= deadline) break;
    await page.waitForTimeout(PRESSURE_READY_POLL_MS);
  }

  const elapsedMs = Date.now() - startedAt;
  logStep(
    `⚠ Pressure-ready warmup timed out after ${(elapsedMs / 1000).toFixed(1)}s ` +
    `(lastReason=${lastSnapshot?.reason ?? 'none'}, close=${lastSnapshot?.renderedCloseModels ?? 0}/${lastSnapshot?.closeCandidates ?? 0}, ` +
    `shots=${lastSnapshot?.engineShotsFired ?? 0}, state=${lastSnapshot?.botState ?? 'unknown'}, ` +
    `objective=${lastSnapshot?.objectiveKind ?? 'unknown'}:${lastSnapshot?.objectiveDistance ?? 'n/a'}m)`
  );
  return {
    requested: true,
    status: 'timeout',
    timeoutSeconds,
    elapsedMs,
    samples,
    consecutiveReadySamples,
    reason: lastSnapshot?.reason ?? 'timeout',
    lastSnapshot,
  };
}

async function stopActiveScenarioDriver(page: Page): Promise<HarnessDriverFinal | null> {
  const result = await safeAwait(
    'stop active scenario driver',
    page.evaluate(() => (window as any).__perfHarnessDriver?.stop?.() ?? null),
    SCENARIO_SETUP_TIMEOUT_MS
  );

  if (!result) return null;

  const runtimeLiveness = normalizeRuntimeLiveness(result.runtimeLiveness);
  logStep(
    `🎮 Active driver stopped (respawns=${result.respawnCount}, driverIntervalMs=${Number(result.movementDecisionIntervalMs ?? 0)}, ammoRefills=${result.ammoRefillCount ?? 0}, healthTopUps=${result.healthTopUpCount ?? 0}, frontlineCompressed=${result.frontlineCompressed}, frontlineDistance=${Number(result.frontlineDistance ?? 0).toFixed(1)}, moved=${result.frontlineMoveCount ?? 0}, capturedZones=${result.capturedZoneCount ?? 0}, movementTransitions=${Number(result.movementTransitions ?? 0)}, losRejectedShots=${Number(result.losRejectedShots ?? 0)}, losUnknown=${Number(result.losUnknownTargetChecks ?? 0)}/${Number(result.fireUnknownLosRejectedShots ?? 0)}, deadTargetDrops=${Number(result.droppedDeadTargetLocks ?? 0)}, firingRetargets=${Number(result.firingRetargets ?? 0)}, retargetFireStops=${Number(result.firingRetargetFireStops ?? 0)}, stuckTeleports=${Number(result.stuckTeleportCount ?? 0)}, stuckWaypointSkips=${Number(result.stuckWaypointSkips ?? 0)}, routeTargetResets=${Number(result.routeTargetResets ?? 0)}, routeNoProgressResets=${Number(result.routeNoProgressResets ?? 0)}, routeSnap=${Number(result.maxPathStartSnapDistance ?? 0).toFixed(1)}/${Number(result.maxPathEndSnapDistance ?? 0).toFixed(1)}m rejected=${Number(result.untrustedPathSnapCount ?? 0)}, maxStuckSec=${Number(result.maxStuckSeconds ?? 0).toFixed(1)}, maxYawStepDeg=${Number(result.maxViewYawStepDeg ?? 0).toFixed(1)}, maxPitchStepDeg=${Number(result.maxViewPitchStepDeg ?? 0).toFixed(1)}, viewSlewClamps=${Number(result.viewSlewClampCount ?? 0)}, viewAnchorResync=${Number(result.viewAnchorResyncCount ?? 0)} max=${Number(result.maxViewAnchorResyncYawDeg ?? 0).toFixed(1)}/${Number(result.maxViewAnchorResyncPitchDeg ?? 0).toFixed(1)}deg, maxAimMoveDivDeg=${Number(result.maxAimMovementDivergenceDeg ?? 0).toFixed(1)}, gradientDeflections=${Number(result.gradientProbeDeflections ?? 0)}, waypointsFollowed=${Number(result.waypointsFollowedCount ?? 0)}, waypointReplanFailures=${Number(result.waypointReplanFailures ?? 0)}, intent=${Number(result.nonZeroMovementIntentCalls ?? 0)}/${Number(result.movementIntentCalls ?? 0)}, engineFrames=${Number(runtimeLiveness?.engineFrameCount ?? 0)}, raf=${Number(runtimeLiveness?.harnessRafTicks ?? 0)}, playerMoveSamples=${Number(runtimeLiveness?.playerMovementSamples ?? 0)}, kills=${Number(result.kills ?? 0)}, damageDealt=${Number(result.damageDealt ?? 0).toFixed(1)}, damageTaken=${Number(result.damageTaken ?? 0).toFixed(1)}, accuracy=${(Number(result.accuracy ?? 0) * 100).toFixed(1)}%)`
  );

  return {
    respawnCount: Number(result.respawnCount ?? 0),
    driverSeed: nullableNumber(result.driverSeed),
    movementDecisionIntervalMs: nullableNumber(result.movementDecisionIntervalMs),
    ammoRefillCount: Number(result.ammoRefillCount ?? 0),
    healthTopUpCount: Number(result.healthTopUpCount ?? 0),
    frontlineCompressed: typeof result.frontlineCompressed === 'boolean' ? result.frontlineCompressed : null,
    frontlineDistance: nullableNumber(result.frontlineDistance),
    frontlineMoveCount: nullableNumber(result.frontlineMoveCount),
    movementTransitions: Number(result.movementTransitions ?? 0),
    losRejectedShots: Number(result.losRejectedShots ?? 0),
    losUnknownTargetChecks: Number(result.losUnknownTargetChecks ?? 0),
    fireUnknownLosRejectedShots: Number(result.fireUnknownLosRejectedShots ?? 0),
    lastTargetLosStatus: typeof result.lastTargetLosStatus === 'string' ? result.lastTargetLosStatus : null,
    lastTargetLosReason: typeof result.lastTargetLosReason === 'string' ? result.lastTargetLosReason : null,
    lastFireLosStatus: typeof result.lastFireLosStatus === 'string' ? result.lastFireLosStatus : null,
    lastFireLosReason: typeof result.lastFireLosReason === 'string' ? result.lastFireLosReason : null,
    lastCurrentTargetLive: typeof result.lastCurrentTargetLive === 'boolean' ? result.lastCurrentTargetLive : null,
    lastCurrentTargetHealth: nullableNumber(result.lastCurrentTargetHealth),
    lastCurrentTargetState: typeof result.lastCurrentTargetState === 'string' ? result.lastCurrentTargetState : null,
    shotEpochs: objectArray(result.shotEpochs),
    aimDotGateRejectedShots: Number(result.aimDotGateRejectedShots ?? 0),
    fireStartRejected: Number(result.fireStartRejected ?? 0),
    runtimeShotPreviewRejectedShots: Number(result.runtimeShotPreviewRejectedShots ?? 0),
    runtimeShotPreviewAimSettlingShots: Number(result.runtimeShotPreviewAimSettlingShots ?? 0),
    runtimeShotPreviewTerrainBlockedShots: Number(result.runtimeShotPreviewTerrainBlockedShots ?? 0),
    runtimeShotPreviewUnavailableShots: Number(result.runtimeShotPreviewUnavailableShots ?? 0),
    runtimeShotPreviewMissShots: Number(result.runtimeShotPreviewMissShots ?? 0),
    runtimeShotPreviewWrongTargetShots: Number(result.runtimeShotPreviewWrongTargetShots ?? 0),
    lastRuntimeShotPreviewStatus: typeof result.lastRuntimeShotPreviewStatus === 'string'
      ? result.lastRuntimeShotPreviewStatus
      : null,
    lastRuntimeShotPreviewReason: typeof result.lastRuntimeShotPreviewReason === 'string'
      ? result.lastRuntimeShotPreviewReason
      : null,
    lastRuntimeShotPreviewHitTargetId: typeof result.lastRuntimeShotPreviewHitTargetId === 'string'
      ? result.lastRuntimeShotPreviewHitTargetId
      : null,
    lastRuntimeShotPreviewExpectedInSpatialCandidates: typeof result.lastRuntimeShotPreviewExpectedInSpatialCandidates === 'boolean'
      ? result.lastRuntimeShotPreviewExpectedInSpatialCandidates
      : null,
    droppedDeadTargetLocks: Number(result.droppedDeadTargetLocks ?? 0),
    firingRetargets: Number(result.firingRetargets ?? 0),
    firingRetargetFireStops: Number(result.firingRetargetFireStops ?? 0),
    firingRetargetEpochs: objectArray(result.firingRetargetEpochs),
    waypointsFollowedCount: Number(result.waypointsFollowedCount ?? 0),
    waypointReplanFailures: Number(result.waypointReplanFailures ?? 0),
    routeTargetResets: Number(result.routeTargetResets ?? 0),
    routeNoProgressResets: Number(result.routeNoProgressResets ?? 0),
    shotsFired: Number(result.shotsFired ?? 0),
    reloadsIssued: Number(result.reloadsIssued ?? 0),
    maxViewYawStepDeg: Number(result.maxViewYawStepDeg ?? 0),
    maxViewPitchStepDeg: Number(result.maxViewPitchStepDeg ?? 0),
    lastViewStepYawDeg: Number(result.lastViewStepYawDeg ?? 0),
    lastViewStepPitchDeg: Number(result.lastViewStepPitchDeg ?? 0),
    lastRequestedViewYawDeltaDeg: Number(result.lastRequestedViewYawDeltaDeg ?? 0),
    lastRequestedViewPitchDeltaDeg: Number(result.lastRequestedViewPitchDeltaDeg ?? 0),
    lastRemainingViewYawErrorDeg: Number(result.lastRemainingViewYawErrorDeg ?? 0),
    lastRemainingViewPitchErrorDeg: Number(result.lastRemainingViewPitchErrorDeg ?? 0),
    lastViewYawClamped: typeof result.lastViewYawClamped === 'boolean' ? result.lastViewYawClamped : null,
    lastViewPitchClamped: typeof result.lastViewPitchClamped === 'boolean' ? result.lastViewPitchClamped : null,
    lastViewTargetKind: typeof result.lastViewTargetKind === 'string' ? result.lastViewTargetKind : null,
    lastViewAnchorResyncChanged: typeof result.lastViewAnchorResyncChanged === 'boolean'
      ? result.lastViewAnchorResyncChanged
      : null,
    lastViewAnchorResyncYawDeg: nullableNumber(result.lastViewAnchorResyncYawDeg),
    lastViewAnchorResyncPitchDeg: nullableNumber(result.lastViewAnchorResyncPitchDeg),
    lastViewUpdateAtMs: nullableNumber(result.lastViewUpdateAtMs),
    lastAimDot: nullableNumber(result.lastAimDot),
    lastFireIntent: typeof result.lastFireIntent === 'boolean' ? result.lastFireIntent : null,
    lastAimGatePassed: typeof result.lastAimGatePassed === 'boolean' ? result.lastAimGatePassed : null,
    lastAimGateReason: typeof result.lastAimGateReason === 'string' ? result.lastAimGateReason : null,
    lastFireLosGatePassed: typeof result.lastFireLosGatePassed === 'boolean'
      ? result.lastFireLosGatePassed
      : null,
    viewSlewClampCount: Number(result.viewSlewClampCount ?? 0),
    viewAnchorResyncCount: Number(result.viewAnchorResyncCount ?? 0),
    maxRequestedViewYawDeltaDeg: Number(result.maxRequestedViewYawDeltaDeg ?? 0),
    maxRequestedViewPitchDeltaDeg: Number(result.maxRequestedViewPitchDeltaDeg ?? 0),
    maxRemainingViewYawErrorDeg: Number(result.maxRemainingViewYawErrorDeg ?? 0),
    maxRemainingViewPitchErrorDeg: Number(result.maxRemainingViewPitchErrorDeg ?? 0),
    maxViewAnchorResyncYawDeg: Number(result.maxViewAnchorResyncYawDeg ?? 0),
    maxViewAnchorResyncPitchDeg: Number(result.maxViewAnchorResyncPitchDeg ?? 0),
    largeViewTurnCount: Number(result.largeViewTurnCount ?? 0),
    maxAimMovementDivergenceDeg: Number(result.maxAimMovementDivergenceDeg ?? 0),
    aimMovementDivergenceSamples: Number(result.aimMovementDivergenceSamples ?? 0),
    aimMovementDivergenceOver45Count: Number(result.aimMovementDivergenceOver45Count ?? 0),
    weaponHarness: objectOrNull(result.weaponHarness),
    damageDealt: Number(result.damageDealt ?? 0),
    damageTaken: Number(result.damageTaken ?? 0),
    kills: Number(result.kills ?? 0),
    accuracy: Number(result.accuracy ?? 0),
    engineShotsFired: Number(result.engineShotsFired ?? 0),
    engineShotsHit: Number(result.engineShotsHit ?? 0),
    botState: String(result.botState ?? result.combatState ?? ''),
    stateHistogramMs: result.stateHistogramMs && typeof result.stateHistogramMs === 'object'
      ? Object.fromEntries(
          Object.entries(result.stateHistogramMs).map(([k, v]) => [String(k), Number(v ?? 0)])
        )
      : {},
    objectiveKind: typeof result.objectiveKind === 'string'
      ? result.objectiveKind
      : null,
    objectiveDistance: nullableNumber(result.objectiveDistance),
    objectiveZoneId: typeof result.objectiveZoneId === 'string'
      ? result.objectiveZoneId
      : null,
    nearestOpforDistance: nullableNumber(result.nearestOpforDistance),
    nearestPerceivedEnemyDistance: nullableNumber(result.nearestPerceivedEnemyDistance),
    currentTargetDistance: nullableNumber(result.currentTargetDistance),
    pathTargetKind: typeof result.pathTargetKind === 'string'
      ? result.pathTargetKind
      : null,
    pathTargetDistance: nullableNumber(result.pathTargetDistance),
    pathQueryStatus: typeof result.pathQueryStatus === 'string'
      ? result.pathQueryStatus
      : null,
    pathLength: nullableNumber(result.pathLength),
    pathFailureReason: typeof result.pathFailureReason === 'string'
      ? result.pathFailureReason
      : null,
    pathQueryDistance: nullableNumber(result.pathQueryDistance),
    pathStartSnapped: typeof result.pathStartSnapped === 'boolean'
      ? result.pathStartSnapped
      : null,
    pathEndSnapped: typeof result.pathEndSnapped === 'boolean'
      ? result.pathEndSnapped
      : null,
    pathStartSnapDistance: nullableNumber(result.pathStartSnapDistance),
    pathEndSnapDistance: nullableNumber(result.pathEndSnapDistance),
    maxPathStartSnapDistance: nullableNumber(result.maxPathStartSnapDistance),
    maxPathEndSnapDistance: nullableNumber(result.maxPathEndSnapDistance),
    untrustedPathSnapCount: nullableNumber(result.untrustedPathSnapCount),
    routeSnapEpochs: objectArray(result.routeSnapEpochs),
    routeProgressDistance: nullableNumber(result.routeProgressDistance),
    routeProgressAgeMs: nullableNumber(result.routeProgressAgeMs),
    routeProgressTravelMeters: nullableNumber(result.routeProgressTravelMeters),
    firstObjectiveDistance: nullableNumber(result.firstObjectiveDistance),
    minObjectiveDistance: nullableNumber(result.minObjectiveDistance),
    objectiveDistanceClosed: nullableNumber(result.objectiveDistanceClosed),
    playerDistanceMoved: nullableNumber(result.playerDistanceMoved),
    movementIntentCalls: nullableNumber(result.movementIntentCalls),
    nonZeroMovementIntentCalls: nullableNumber(result.nonZeroMovementIntentCalls),
    worldMovementIntentCalls: nullableNumber(result.worldMovementIntentCalls),
    cameraMovementIntentCalls: nullableNumber(result.cameraMovementIntentCalls),
    nonZeroWorldMovementIntentCalls: nullableNumber(result.nonZeroWorldMovementIntentCalls),
    nonZeroCameraMovementIntentCalls: nullableNumber(result.nonZeroCameraMovementIntentCalls),
    lastMovementIntent: objectOrNull(result.lastMovementIntent),
    lastNonZeroMovementIntent: objectOrNull(result.lastNonZeroMovementIntent),
    runtimeLiveness,
    perceptionRange: nullableNumber(result.perceptionRange),
  };
}

async function startChromeTracing(
  cdp: CDPSession,
  options: { includeV8CpuProfiler: boolean }
): Promise<void> {
  const categories = [
    '-*',
    'devtools.timeline',
    'toplevel',
    'v8',
    'blink.user_timing',
    'disabled-by-default-devtools.timeline'
  ];
  if (options.includeV8CpuProfiler) {
    categories.push('disabled-by-default-v8.cpu_profiler');
  }
  await cdp.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    categories: categories.join(',')
  });
}

async function stopChromeTracing(cdp: CDPSession): Promise<string> {
  const traceChunks: string[] = [];
  cdp.on('Tracing.dataCollected', (event: any) => {
    if (Array.isArray(event.value)) {
      for (const item of event.value) {
        traceChunks.push(JSON.stringify(item));
      }
    }
  });

  const streamHandlePromise = new Promise<string>((resolve) => {
    cdp.once('Tracing.tracingComplete', async (event: any) => {
      resolve(event.stream as string);
    });
  });

  await cdp.send('Tracing.end');
  const stream = await withTimeout('Tracing.tracingComplete', streamHandlePromise, TRACE_STOP_TIMEOUT_MS);

  // Prefer stream content if present.
  let streamData = '';
  while (true) {
    const readResult = await withTimeout('IO.read', cdp.send('IO.read', { handle: stream }), TRACE_STOP_TIMEOUT_MS);
    if (typeof readResult.data === 'string') {
      streamData += readResult.data;
    }
    if (readResult.eof) break;
  }
  await withTimeout('IO.close', cdp.send('IO.close', { handle: stream }), TRACE_STOP_TIMEOUT_MS);
  return streamData.length > 0 ? streamData : `{"traceEvents":[${traceChunks.join(',')}]}`;
}

async function runCapture(): Promise<void> {
  if (hasFlag('help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  const durationSeconds = parseNumberFlag('duration', DEFAULT_DURATION_SECONDS);
  const warmupSeconds = parseNumberFlag('warmup', DEFAULT_WARMUP_SECONDS);
  const npcs = parseNumberFlag('npcs', DEFAULT_NPCS);
  const startupTimeoutSeconds = parseNumberFlag('startup-timeout', DEFAULT_STARTUP_TIMEOUT_SECONDS);
  const startupFrameThreshold = parseNumberFlag('startup-frame-threshold', DEFAULT_STARTUP_FRAME_THRESHOLD);
  const runtimePreflightTimeoutSeconds = parseNumberFlag('runtime-preflight-timeout', DEFAULT_RUNTIME_PREFLIGHT_TIMEOUT_SECONDS);
  const port = parseNumberFlag('port', DEV_SERVER_PORT);
  const headed = hasFlag('headed');
  const devtools = hasFlag('devtools');
  const playwrightTrace = hasFlag('playwright-trace') || process.env.PERF_PLAYWRIGHT_TRACE === '1';
  const deepCdp = hasFlag('deep-cdp') || process.env.PERF_DEEP_CDP === '1';
  const deepDiagnostics = parseBooleanFlag('deep-diagnostics', false);
  const shotVisualCapture = parseBooleanFlag('shot-visual-capture', false);
  const shotVisualCaptureMax = Math.max(0, Math.floor(parseNumberFlag('shot-visual-capture-max', 6)));
  const shotVisualCaptureCooldownMs = Math.max(0, Math.floor(parseNumberFlag('shot-visual-capture-cooldown-ms', 750)));
  const gpuTiming = parseBooleanFlag('gpu-timing', false);
  const cdpProfiler = deepCdp && parseBooleanFlag('cdp-profiler', true);
  const cdpHeapSampling = deepCdp && parseBooleanFlag('cdp-heap-sampling', true);
  const traceWindowStartMsArg = parseNumberFlag('trace-window-start-ms', Number.NaN);
  const traceWindowDurationMsArg = parseNumberFlag('trace-window-duration-ms', Number.NaN);
  const traceWindowStartMs = deepCdp && Number.isFinite(traceWindowStartMsArg) && traceWindowStartMsArg >= 0
    ? Math.floor(traceWindowStartMsArg)
    : null;
  const traceWindowDurationMs = traceWindowStartMs !== null
    && Number.isFinite(traceWindowDurationMsArg)
    && traceWindowDurationMsArg > 0
    ? Math.floor(traceWindowDurationMsArg)
    : null;
  const focusedChromeTrace = traceWindowStartMs !== null && traceWindowDurationMs !== null;
  const traceWindowLabel = focusedChromeTrace
    ? `${traceWindowStartMs!}-${traceWindowStartMs! + traceWindowDurationMs!}ms`
    : 'full';
  const enableCombat = parseBooleanFlag('combat', true);
  const requestedMode = normalizeGameMode(parseStringFlag('mode', DEFAULT_GAME_MODE));
  const activePlayerScenario = parseBooleanFlag('active-player', DEFAULT_ACTIVE_PLAYER);
  const compressFrontline = parseBooleanFlag('compress-frontline', DEFAULT_COMPRESS_FRONTLINE);
  const allowWarpRecovery = parseBooleanFlag('allow-warp-recovery', DEFAULT_ALLOW_WARP_RECOVERY);
  const activeTopUpHealth = parseBooleanFlag('active-top-up-health', DEFAULT_ACTIVE_TOP_UP_HEALTH);
  const activeAutoRespawn = parseBooleanFlag('active-auto-respawn', DEFAULT_ACTIVE_AUTO_RESPAWN);
  const movementDecisionIntervalMs = parseNumberFlag('movement-decision-interval-ms', DEFAULT_MOVEMENT_DECISION_INTERVAL_MS);
  const losHeightPrefilter = parseBooleanFlag('los-height-prefilter', false);
  const sampleIntervalMs = Math.max(250, parseNumberFlag('sample-interval-ms', DEFAULT_SAMPLE_INTERVAL_MS));
  const detailEverySamples = Math.max(
    1,
    parseNumberFlag(
      'detail-every-samples',
      durationSeconds >= 900 ? 5 : DEFAULT_DETAIL_EVERY_SAMPLES
    )
  );
  const runtimeSceneAttribution = parseBooleanFlag('runtime-scene-attribution', false);
  const runtimeSceneAttributionEverySamples = Math.max(
    1,
    parseNumberFlag('runtime-scene-attribution-every-samples', detailEverySamples)
  );
  const runtimeRenderSubmissionAttribution = parseBooleanFlag('runtime-render-submission-attribution', false);
  const runtimeRenderSubmissionEverySamples = Math.max(
    1,
    parseNumberFlag('runtime-render-submission-every-samples', detailEverySamples)
  );
  const runtimeRenderSubmissionMode = parseStringFlag('runtime-render-submission-mode', 'full').toLowerCase() === 'summary'
    ? 'summary'
    : 'full';
  const presentationContextCapture = parseBooleanFlag('presentation-context-capture', true);
  const pressureReadyWarmup = parseBooleanFlag('pressure-ready-warmup', false);
  const pressureReadyTimeoutSeconds = Math.max(
    0,
    parseNumberFlag('pressure-ready-timeout', DEFAULT_PRESSURE_READY_TIMEOUT_SECONDS)
  );
  const weatherStateOverride = parseWeatherStateOverride(parseStringFlag('weather-state', 'default'));
  const prewarm = parseBooleanFlag('prewarm', DEFAULT_PREWARM);
  const runtimePreflight = parseBooleanFlag('runtime-preflight', DEFAULT_RUNTIME_PREFLIGHT);
  const matchDurationArg = parseNumberFlag('match-duration', Number.NaN);
  const perfMatchDurationSeconds = Number.isFinite(matchDurationArg) && matchDurationArg > 0
    ? Math.ceil(matchDurationArg)
    : null;
  const disableVictory = parseBooleanFlag('disable-victory', false);
  const disableNpcCloseModels = parseBooleanFlag('disable-npc-close-models', false);
  const disableTerrainShadows = parseBooleanFlag('disable-terrain-shadows', false);
  const boundedTerrainShadowPass = parseBooleanFlag('bounded-terrain-shadow-pass', false);
  const terrainFullShadowPass = parseBooleanFlag('terrain-full-shadow-pass', false);
  const terrainShadowPassMode = terrainFullShadowPass
    ? 'full-diagnostic'
    : boundedTerrainShadowPass
      ? 'bounded-requested'
      : 'bounded-default';
  const terrainForceInstanceUpload = parseBooleanFlag('terrain-force-instance-upload', false);
  const terrainHeightAwareFrustum = parseBooleanFlag('terrain-height-aware-frustum', false);
  const disableTerrainHeightAwareFrustum = parseBooleanFlag('disable-terrain-height-aware-frustum', false);
  const terrainFullSkirts = parseBooleanFlag('terrain-full-skirts', false);
  const terrainSparseSkirts = parseBooleanFlag('terrain-sparse-skirts', false);
  const disableTerrainSkirts = parseBooleanFlag('disable-terrain-skirts', false);
  const disableTerrainFarCanopyTint = parseBooleanFlag('disable-terrain-far-canopy-tint', false);
  const disableTerrainLowSunOcclusion = parseBooleanFlag('disable-terrain-low-sun-occlusion', false);
  const disableWildlife = parseBooleanFlag('disable-wildlife', false);
  const vegetationDensityScaleArg = parseNumberFlag('vegetation-density-scale', Number.NaN);
  const vegetationDensityScale = Number.isFinite(vegetationDensityScaleArg)
    ? Math.max(0, Math.min(1, vegetationDensityScaleArg))
    : null;
  const sandboxMode = parseBooleanFlag(
    'sandbox',
    requestedMode === 'ai_sandbox' ? true : DEFAULT_SANDBOX_MODE
  );
  const frontlineTriggerDistance = parseNumberFlag('frontline-trigger-distance', DEFAULT_FRONTLINE_TRIGGER_DISTANCE);
  const maxCompressedPerFaction = parseNumberFlag('frontline-compressed-per-faction', DEFAULT_MAX_COMPRESSED_PER_FACTION);
  // Optional map-terrain seed pin (perf-harness-redesign). When present, the URL
  // query gains &seed=<n>; sandbox mode reads it and overrides the random
  // AI_SANDBOX terrain seed so combat120 captures are reproducible and we can
  // curate a fair engagement landscape (not a pathological steep hill).
  const seedArg = parseNumberFlag('seed', Number.NaN);
  const seedPin = Number.isFinite(seedArg) && seedArg >= 0 ? Math.floor(seedArg) : null;
  const driverSeedArg = parseNumberFlag('driver-seed', Number.NaN);
  const driverSeed = Number.isFinite(driverSeedArg) && driverSeedArg >= 0
    ? Math.floor(driverSeedArg)
    : null;
  const logLevel = String(process.env.PERF_LOG_LEVEL ?? process.argv.find(a => a.startsWith('--log-level='))?.split('=')[1] ?? 'warn');
  const rendererMode = parseStringFlag('renderer', '').trim();
  const gpuTimingQueryEnabled = gpuTiming && rendererMode.toLowerCase() === 'webgl';
  // Default OFF: fresh spawn + explicit teardown per run. Opt in with --reuse-server
  // (or --reuse-dev-server for back-compat) when iterating locally.
  const reuseServer = parseBooleanFlag('reuse-server', parseBooleanFlag('reuse-dev-server', false));
  // Default 'perf': preview the purpose-built perf-harness bundle (prod-shape,
  // minified, tree-shaken, but with diagnostic hooks compiled in via
  // VITE_PERF_HARNESS=1). See docs/PERFORMANCE.md "Build targets" and
  // scripts/preview-server.ts for the full story. 'dev' is retained for
  // debugging against source maps. 'retail' previews the ship bundle (no
  // harness surface — will fail to drive, but useful for bundle inspection).
  const serverMode: ServerMode = parseServerModeArg(process.argv, 'perf');
  // Force a fresh perf/retail build per capture by default so we never drive a
  // stale dist-perf. A stale bundle makes Vite preview's SPA fallback serve
  // index.html (text/html, 200) for a since-renamed dynamic-import/worker chunk,
  // which the browser refuses to execute as a module -> net::ERR_FAILED boot
  // failure. Matches the sibling capture scripts (check-terrain-baseline,
  // capture-atmosphere-recovery-shots). 'dev' uses Vite HMR (no dist), and
  // --no-build reuses the existing dist-perf for fast local iteration.
  const forceServerBuild = serverMode !== 'dev' && !hasFlag('no-build');
  const effectiveNpcs = enableCombat ? npcs : 0;
  const artifactDir = makeArtifactDir();
  const browserProfileDir = join(artifactDir, 'browser-profile');
  mkdirSync(browserProfileDir, { recursive: true });
  const shotVisualCaptureState: ShotVisualCaptureState = {
    enabled: shotVisualCapture && shotVisualCaptureMax > 0,
    maxCaptures: shotVisualCaptureMax,
    cooldownMs: shotVisualCaptureCooldownMs,
    artifactDir,
    captures: [],
    seenKeys: new Set<string>(),
    lastCaptureElapsedMs: -1
  };
  logStep(`Config duration=${durationSeconds}s warmup=${warmupSeconds}s npcs=${effectiveNpcs} (requested=${npcs}) mode=${requestedMode} sandbox=${sandboxMode} seedPin=${seedPin ?? 'none'} driverSeed=${driverSeed ?? 'none'} startupTimeout=${startupTimeoutSeconds}s startupFrameThreshold=${startupFrameThreshold} runtimePreflightTimeout=${runtimePreflightTimeoutSeconds}s port=${port} headed=${headed} devtools=${devtools} playwrightTrace=${playwrightTrace} deepCdp=${deepCdp} deepDiagnostics=${deepDiagnostics} shotVisualCapture=${shotVisualCapture} shotVisualCaptureMax=${shotVisualCaptureMax} shotVisualCaptureCooldownMs=${shotVisualCaptureCooldownMs} gpuTiming=${gpuTiming} gpuTimingQuery=${gpuTimingQueryEnabled} cdpProfiler=${cdpProfiler} cdpHeapSampling=${cdpHeapSampling} traceWindow=${traceWindowLabel} combat=${enableCombat} activePlayer=${activePlayerScenario} compressFrontline=${compressFrontline} allowWarpRecovery=${allowWarpRecovery} activeTopUpHealth=${activeTopUpHealth} activeAutoRespawn=${activeAutoRespawn} movementDecisionIntervalMs=${movementDecisionIntervalMs} losHeightPrefilter=${losHeightPrefilter} sampleIntervalMs=${sampleIntervalMs} detailEverySamples=${detailEverySamples} runtimeSceneAttribution=${runtimeSceneAttribution} runtimeSceneAttributionEverySamples=${runtimeSceneAttributionEverySamples} runtimeRenderSubmissionAttribution=${runtimeRenderSubmissionAttribution} runtimeRenderSubmissionEverySamples=${runtimeRenderSubmissionEverySamples} runtimeRenderSubmissionMode=${runtimeRenderSubmissionMode} presentationContextCapture=${presentationContextCapture} pressureReadyWarmup=${pressureReadyWarmup} pressureReadyTimeout=${pressureReadyTimeoutSeconds}s weatherState=${weatherStateOverride} prewarm=${prewarm} runtimePreflight=${runtimePreflight} matchDurationOverride=${perfMatchDurationSeconds ?? 'none'} renderer=${rendererMode || 'default'} disableVictory=${disableVictory} disableNpcCloseModels=${disableNpcCloseModels} disableTerrainShadows=${disableTerrainShadows} terrainShadowPassMode=${terrainShadowPassMode} boundedTerrainShadowPass=${boundedTerrainShadowPass} terrainFullShadowPass=${terrainFullShadowPass} terrainForceInstanceUpload=${terrainForceInstanceUpload} terrainHeightAwareFrustum=${terrainHeightAwareFrustum} disableTerrainHeightAwareFrustum=${disableTerrainHeightAwareFrustum} terrainFullSkirts=${terrainFullSkirts} terrainSparseSkirts=${terrainSparseSkirts} disableTerrainSkirts=${disableTerrainSkirts} disableTerrainFarCanopyTint=${disableTerrainFarCanopyTint} disableTerrainLowSunOcclusion=${disableTerrainLowSunOcclusion} disableWildlife=${disableWildlife} vegetationDensityScale=${vegetationDensityScale ?? 'default'} reuseServer=${reuseServer} serverMode=${serverMode} forceServerBuild=${forceServerBuild}`);
  if (shotVisualCaptureState.enabled) {
    logStep('Shot visual capture is diagnostic-only and will perturb timing; do not use this run as a baseline.');
  }
  if (weatherStateOverride !== 'default') {
    logStep('Weather-state override is diagnostic-only and dropped-frame EARS will reject this artifact for completion.');
  }
  if (gpuTiming && !gpuTimingQueryEnabled) {
    logStep('GPU timing requested, but not injected because the runtime GPU query path only supports explicit --renderer webgl captures.');
  }

  let server: ServerHandle | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let cdp: CDPSession | null = null;
  let chromeTrace = '';
  let finalFrameCount = 0;
  const consoleEntries: ConsoleEntry[] = [];
  const runtimeSamples: RuntimeSample[] = [];
  let previousRendererDrawCalls: number | null = null;
  let previousRendererFrameCount: number | null = null;
  let finalPresentationEpochs: Record<string, unknown>[] = [];
  let movementArtifacts: MovementArtifactReportForViewer | null = null;
  let movementViewerPayload: MovementViewerPayload | null = null;
  let sceneAttribution: SceneAttributionEntry[] | null = null;
  const probeRoundTripMs: number[] = [];
  let missedSamples = 0;
  const missedSampleErrors: Record<string, number> = {};
  let measurementTrust: MeasurementTrustReport | null = null;
  const startedAt = nowIso();
  const sourceGitSha = currentGitSha();
  const sourceGitStatus = gitStatus();
  const quietMachineAttested =
    process.env.TIJ_QUIET_MACHINE === '1'
    || parseBooleanFlag('quiet-machine-attested', false);
  const quietMachineSnapshot = quietMachineAttested
    ? captureQuietMachineSnapshot()
    : undefined;
  const captureEnvironment = {
    quietMachineAttested,
    quietMachineAttestationSource: quietMachineAttested
      ? process.env.TIJ_QUIET_MACHINE === '1'
        ? 'TIJ_QUIET_MACHINE=1'
        : '--quiet-machine-attested'
      : undefined,
    quietMachineSnapshot,
  };
  if (quietMachineSnapshot) {
    logStep(
      `Quiet-machine snapshot ${quietMachineSnapshot.status}` +
      ` cpuAvg=${quietMachineSnapshot.cpu?.avgPercent ?? 'n/a'}%` +
      ` cpuMax=${quietMachineSnapshot.cpu?.maxPercent ?? 'n/a'}%` +
      ` gpu=${quietMachineSnapshot.gpu?.available ? `${quietMachineSnapshot.gpu.utilizationPercent}%/${quietMachineSnapshot.gpu.loadClass ?? 'unknown'}` : 'n/a'}`
    );
  }
  const combatParam = enableCombat ? '1' : '0';
  const autostart = requestedMode === 'ai_sandbox' ? 'true' : 'false';
  const losPrefilterParam = losHeightPrefilter ? '1' : '0';
  const uiTransitionsParam = '0';
  const diagnosticsQuery = deepDiagnostics ? 'perf=1&diagnostics=1' : 'perf=1';
  const gpuTimingQuery = gpuTimingQueryEnabled ? '&gpuTiming=1' : '';
  const rendererQuery = rendererMode ? `&renderer=${encodeURIComponent(rendererMode)}` : '';
  const seedQuery = seedPin !== null ? `&seed=${seedPin}` : '';
  const matchDurationQuery = perfMatchDurationSeconds !== null
    ? `&perfMatchDuration=${perfMatchDurationSeconds}`
    : '';
  const disableVictoryQuery = disableVictory ? '&perfDisableVictory=1' : '';
  const disableNpcCloseModelsQuery = disableNpcCloseModels ? '&perfDisableNpcCloseModels=1' : '';
  const disableTerrainShadowsQuery = disableTerrainShadows ? '&perfDisableTerrainShadows=1' : '';
  const boundedTerrainShadowPassQuery = boundedTerrainShadowPass ? '&perfBoundedTerrainShadowPass=1' : '';
  const terrainFullShadowPassQuery = terrainFullShadowPass ? '&terrainFullShadowPass=1' : '';
  const terrainForceInstanceUploadQuery = terrainForceInstanceUpload ? '&terrainForceInstanceUpload=1' : '';
  const terrainHeightAwareFrustumQuery = terrainHeightAwareFrustum ? '&terrainEnableHeightAwareFrustum=1' : '';
  const disableTerrainHeightAwareFrustumQuery = '';
  const terrainFullSkirtsQuery = terrainFullSkirts ? '&terrainFullTerrainSkirts=1' : '';
  const terrainSparseSkirtsQuery = terrainSparseSkirts ? '&terrainSparseTerrainSkirts=1' : '';
  const disableTerrainSkirtsQuery = disableTerrainSkirts ? '&perfDisableTerrainSkirts=1' : '';
  const disableTerrainFarCanopyTintQuery = disableTerrainFarCanopyTint ? '&perfDisableTerrainFarCanopyTint=1' : '';
  const disableTerrainLowSunOcclusionQuery = disableTerrainLowSunOcclusion ? '&perfDisableTerrainLowSunOcclusion=1' : '';
  const disableWildlifeQuery = disableWildlife ? '&perfDisableWildlife=1' : '';
  const vegetationDensityScaleQuery = vegetationDensityScale !== null
    ? `&perfVegetationDensityScale=${vegetationDensityScale}`
    : '';
  const perfRuntimeQuery = `${matchDurationQuery}${disableVictoryQuery}${disableNpcCloseModelsQuery}${disableTerrainShadowsQuery}${boundedTerrainShadowPassQuery}${terrainFullShadowPassQuery}${terrainForceInstanceUploadQuery}${terrainHeightAwareFrustumQuery}${disableTerrainHeightAwareFrustumQuery}${terrainFullSkirtsQuery}${terrainSparseSkirtsQuery}${disableTerrainSkirtsQuery}${disableTerrainFarCanopyTintQuery}${disableTerrainLowSunOcclusionQuery}${disableWildlifeQuery}${vegetationDensityScaleQuery}`;
  const query = sandboxMode
    ? `?sandbox=true&${diagnosticsQuery}&uiTransitions=${uiTransitionsParam}&npcs=${effectiveNpcs}&autostart=${autostart}&duration=${durationSeconds}&combat=${combatParam}&logLevel=${encodeURIComponent(logLevel)}&losHeightPrefilter=${losPrefilterParam}${rendererQuery}${seedQuery}${gpuTimingQuery}${perfRuntimeQuery}`
    : `?${diagnosticsQuery}&uiTransitions=${uiTransitionsParam}&logLevel=${encodeURIComponent(logLevel)}&losHeightPrefilter=${losPrefilterParam}${rendererQuery}${seedQuery}${gpuTimingQuery}${perfRuntimeQuery}`;
  const url = `http://${PERF_SERVER_HOST}:${port}/${query}`;
  const preflightUrl = `http://${PERF_SERVER_HOST}:${port}/?${diagnosticsQuery}&uiTransitions=${uiTransitionsParam}${rendererQuery}${gpuTimingQuery}`;
  const primaryPath = new URL(url).pathname + new URL(url).search;
  const prewarmPaths = sandboxMode
    ? [
        `/?${diagnosticsQuery}&uiTransitions=${uiTransitionsParam}${gpuTimingQuery}`,
        `/?sandbox=true&${diagnosticsQuery}&uiTransitions=${uiTransitionsParam}${gpuTimingQuery}&autostart=false`,
        primaryPath.replace(`duration=${durationSeconds}`, 'duration=0')
      ]
    : [`/?${diagnosticsQuery}&uiTransitions=${uiTransitionsParam}${gpuTimingQuery}`, primaryPath];
  const runHardTimeoutMs = Math.max(
    MIN_RUN_HARD_TIMEOUT_MS,
    (
      startupTimeoutSeconds
      + warmupSeconds
      + (pressureReadyWarmup ? pressureReadyTimeoutSeconds : 0)
      + durationSeconds
      + 90
    ) * 1000
  );
  const navTimeoutMs = Math.max(STEP_TIMEOUT_MS, startupTimeoutSeconds * 1000 + 5000);
  let failureReason: string | undefined;
  let validation: ValidationReport = { overall: 'warn', checks: [] };
  let startupState: {
    started: boolean;
    lastFrameCount: number;
    reason?: string;
    firstEngineSeenSec?: number;
    firstMetricsSeenSec?: number;
    thresholdReachedSec?: number;
    lastStartupMark?: string;
    lastStartupMarkMs?: number;
  } = { started: false, lastFrameCount: 0 };
  let prewarmResult = { totalMs: 0, allOk: true };
  let runtimePreflightResult: { totalMs: number; ok: boolean; reason?: string } = { totalMs: 0, ok: true };
  let startupDiagnostics: StartupDiagnostics | null = null;
  let startupTimeline: any = null;
  let pressureReadyWarmupResult: PressureReadyWarmupResult = {
    requested: pressureReadyWarmup,
    status: pressureReadyWarmup ? 'unavailable' : 'disabled',
    timeoutSeconds: pressureReadyTimeoutSeconds,
    elapsedMs: 0,
    samples: 0,
    consecutiveReadySamples: 0,
    reason: pressureReadyWarmup ? 'not-started' : 'disabled',
    lastSnapshot: null,
  };
  // harness-lifecycle-halt-on-match-end: hoisted out of the sample loop so the
  // finally-block summary writer can pick them up even on early failure.
  let matchEndedAtRelMs: number | null = null;
  let matchOutcome: 'victory' | 'defeat' | 'draw' | null = null;
  let activeScenarioStarted = false;
  let harnessDriverFinal: HarnessDriverFinal | null = null;
  let cdpStarted = false;
  let chromeTracingStarted = false;
  let chromeTracingStopped = false;
  let playwrightTracingStarted = false;
  let stage = 'init';
  let hardTimeout: NodeJS.Timeout | null = null;
  let startedServer = false;
  let emergencyArtifactsWritten = false;
  let signalHandlersInstalled = false;

  const writeEmergencyArtifacts = (reason: string): void => {
    if (emergencyArtifactsWritten) return;
    emergencyArtifactsWritten = true;

    try {
      const emergencyValidation: ValidationReport = validation.checks.length > 0
        ? validation
        : {
            overall: 'fail',
            checks: [
              {
                id: 'capture_completed',
                status: 'fail',
                value: 0,
                message: reason
              }
            ]
          };
      writeFileSync(join(artifactDir, 'console.json'), JSON.stringify(consoleEntries, null, 2), 'utf-8');
      writeFileSync(join(artifactDir, 'runtime-samples.json'), JSON.stringify(runtimeSamples, null, 2), 'utf-8');
      writeFileSync(join(artifactDir, 'validation.json'), JSON.stringify(emergencyValidation, null, 2), 'utf-8');
      writeFileSync(join(artifactDir, 'summary.json'), JSON.stringify({
        startedAt,
        endedAt: nowIso(),
        sourceGitSha,
        sourceGitStatus,
        captureEnvironment,
        durationSeconds,
        npcs: effectiveNpcs,
        requestedNpcs: npcs,
        url,
        status: 'failed',
        failureReason: reason,
        finalFrameCount,
        artifactDir,
        validation: emergencyValidation,
        lastStage: stage,
        scenario: {
          mode: startupState.started ? requestedMode : 'unknown',
          requestedMode
        }
      }, null, 2), 'utf-8');
    } catch {
      // best effort
    }
  };

  const emergencyShutdown = (reason: string): void => {
    failureReason ??= reason;
    writeEmergencyArtifacts(reason);
    forceKillPlaywrightBrowsers(browserProfileDir);
    if (server && startedServer && !reuseServer) {
      try {
        void stopServer(server);
      } catch {
        // best effort
      }
    }
    if (hardTimeout) {
      clearTimeout(hardTimeout);
      hardTimeout = null;
    }
    releaseRunLock();
  };

  const armHardTimeout = (timeoutMs: number): void => {
    if (hardTimeout) {
      clearTimeout(hardTimeout);
    }
    hardTimeout = setTimeout(() => {
      const reason = `Hard timeout reached at stage=${stage}`;
      console.error(reason);
      emergencyShutdown(reason);
      process.exit(1);
    }, timeoutMs);
  };

  const handleProcessSignal = (signal: NodeJS.Signals): void => {
    const reason = `Capture interrupted by ${signal} at stage=${stage}`;
    console.error(reason);
    emergencyShutdown(reason);
    process.exit(1);
  };

  try {
    acquireRunLock();
    process.once('SIGINT', handleProcessSignal);
    process.once('SIGTERM', handleProcessSignal);
    signalHandlersInstalled = true;
    armHardTimeout(runHardTimeoutMs);

    stage = 'start-server';
    if (reuseServer && await isPortOpen(port)) {
      logStep(`♻ Reusing existing server on port ${port} (mode=${serverMode})`);
    } else {
      cleanupPortListeners(port, logStep);
      server = await startServer({
        mode: serverMode,
        port,
        host: PERF_SERVER_HOST,
        startupTimeoutMs: STEP_TIMEOUT_MS,
        forceBuild: forceServerBuild,
        stdio: 'pipe',
        log: logStep,
        onStderr: (chunk) => console.error(`[${serverMode}-server]`, chunk.trim()),
      });
      startedServer = true;
      await sleep(2000);
    }
    if (prewarm) {
      stage = 'prewarm-server';
      prewarmResult = await prewarmDevServer(port, prewarmPaths);
      logStep(`🔥 Server prewarm completed in ${prewarmResult.totalMs}ms (allOk=${prewarmResult.allOk})`);
    }

    stage = 'launch-browser';
    logStep(`🌐 Launching browser (${headed ? 'headed' : 'headless'})`);
    context = await chromium.launchPersistentContext(browserProfileDir, {
      headless: !headed,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-frame-rate-limit',
        '--enable-precise-memory-info',
        '--window-position=0,0',
        '--window-size=1920,1080',
        '--force-device-scale-factor=1',
        ...(headed && devtools ? ['--auto-open-devtools-for-tabs'] : []),
        ...(rendererMode.toLowerCase().includes('webgpu') ? ['--enable-unsafe-webgpu'] : []),
      ],
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    await installPageEvaluateHelperShim(context);
    stage = 'start-playwright-trace';
    if (playwrightTrace) {
      await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
      playwrightTracingStarted = true;
    }

    stage = 'open-page';
    page = context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(navTimeoutMs);
    await ensurePageEvaluateHelperShim(page);
    await withTimeout(
      'configure browser perf observers',
      page.addInitScript({
        content: `window.__TIJ_PERF_CAPTURE_PRESENTATION_CONTEXT__ = ${presentationContextCapture ? 'true' : 'false'};`
      }),
      STEP_TIMEOUT_MS
    );
    await withTimeout(
      'install browser perf observers',
      page.addInitScript({ path: join(process.cwd(), 'scripts', 'perf-browser-observers.js') }),
      STEP_TIMEOUT_MS
    );
    await withTimeout(
      'install browser sample helpers',
      page.addInitScript({
        content: `
          (() => {
            const nullableNumber = function(value) {
              if (value === null || value === undefined || value === '') return null;
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : null;
            };
            const objectOrNull = function(value) {
              return value && typeof value === 'object' ? value : null;
            };
            const objectArray = function(value, limit = 32) {
              if (!Array.isArray(value)) return [];
              const max = Math.max(1, Math.floor(Number(limit) || 32));
              const start = Math.max(0, value.length - max);
              const entries = [];
              for (let index = start; index < value.length; index += 1) {
                const entry = objectOrNull(value[index]);
                if (entry) entries.push(entry);
              }
              return entries;
            };
            const finiteNumber = function(value, fallback = 0) {
              const parsed = Number(value);
              return Number.isFinite(parsed) ? parsed : fallback;
            };
            const compactString = function(value, limit = 220) {
              const text = String(value ?? '');
              return text.length > limit ? text.slice(0, limit) + '...' : text;
            };
            const uniqueObjects = function(groups, limit = 32, keyFor) {
              const out = [];
              const seen = new Set();
              for (const group of groups) {
                if (!Array.isArray(group)) continue;
                for (const entry of group) {
                  if (!entry || typeof entry !== 'object') continue;
                  const key = typeof keyFor === 'function' ? keyFor(entry) : null;
                  const identity = key ?? entry;
                  if (seen.has(identity)) continue;
                  seen.add(identity);
                  out.push(entry);
                  if (out.length >= limit) return out;
                }
              }
              return out;
            };
            const topByNumber = function(value, limit, scorer) {
              if (!Array.isArray(value)) return [];
              return value
                .filter((entry) => Boolean(entry && typeof entry === 'object'))
                .slice()
                .sort((a, b) => finiteNumber(scorer(b)) - finiteNumber(scorer(a)))
                .slice(0, Math.max(0, Math.floor(Number(limit) || 0)));
            };
            const compactNumberRecord = function(value, limit = 16) {
              if (!value || typeof value !== 'object') return {};
              return Object.fromEntries(
                Object.entries(value)
                  .map(([name, raw]) => [String(name), finiteNumber(raw)])
                  .filter(([, numberValue]) => Number.isFinite(numberValue))
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .slice(0, Math.max(1, Math.floor(Number(limit) || 16)))
              );
            };
            const compactTimingBuckets = function(value, limit = 32) {
              if (!value || typeof value !== 'object') return undefined;
              const entries = Object.entries(value)
                .map(([name, raw]) => {
                  const bucket = raw && typeof raw === 'object' ? raw : {};
                  return [
                    String(name),
                    {
                      count: finiteNumber(bucket.count),
                      totalDurationMs: finiteNumber(bucket.totalDurationMs),
                      maxDurationMs: finiteNumber(bucket.maxDurationMs)
                    }
                  ];
                })
                .sort((a, b) => finiteNumber(b[1].totalDurationMs) - finiteNumber(a[1].totalDurationMs))
                .slice(0, Math.max(1, Math.floor(Number(limit) || 32)));
              return Object.fromEntries(entries);
            };
            const compactJsonValue = function(value, depth = 0, options = {}) {
              const maxDepth = Math.max(1, Math.floor(Number(options.maxDepth) || 5));
              const arrayLimit = Math.max(1, Math.floor(Number(options.arrayLimit) || 8));
              const entryLimit = Math.max(1, Math.floor(Number(options.entryLimit) || 48));
              const stringLimit = Math.max(32, Math.floor(Number(options.stringLimit) || 220));
              if (value === null || value === undefined) return value ?? null;
              const type = typeof value;
              if (type === 'number' || type === 'boolean') return value;
              if (type === 'string') return compactString(value, stringLimit);
              if (type !== 'object') return null;
              if (depth >= maxDepth) {
                return Array.isArray(value)
                  ? { truncatedArray: true, length: value.length }
                  : { truncatedObject: true };
              }
              if (Array.isArray(value)) {
                const start = Math.max(0, value.length - arrayLimit);
                return value
                  .slice(start)
                  .map((entry) => compactJsonValue(entry, depth + 1, options));
              }
              const output = {};
              let count = 0;
              for (const [key, child] of Object.entries(value)) {
                if (count >= entryLimit) break;
                output[String(key)] = compactJsonValue(child, depth + 1, options);
                count += 1;
              }
              return output;
            };
            const compactDiagnosticObject = function(value, options) {
              if (!value || typeof value !== 'object') return null;
              return compactJsonValue(value, 0, options ?? {
                maxDepth: 5,
                arrayLimit: 8,
                entryLimit: 48,
                stringLimit: 220
              });
            };
            const compactDiagnosticArray = function(value, limit = 12, options) {
              return objectArray(value, limit)
                .map((entry) => compactDiagnosticObject(entry, options))
                .filter((entry) => Boolean(entry && typeof entry === 'object'));
            };
            const selectImportantRafEntries = function(value, limit = 16) {
              const entries = objectArray(value, 32);
              return uniqueObjects([
                entries.slice(-8),
                topByNumber(entries, 12, (entry) => Number(entry.gapMs ?? 0)),
                topByNumber(entries, 8, (entry) => Number(entry.droppedFrameTime60HzMs ?? 0))
              ], limit, (entry) => {
                const atMs = Number(entry.atMs ?? entry.endAtMs ?? 0);
                const gapMs = Number(entry.gapMs ?? 0);
                return Number.isFinite(atMs) ? 'raf:' + atMs.toFixed(3) + ':' + gapMs.toFixed(3) : null;
              }).sort((a, b) => finiteNumber(a.atMs ?? a.endAtMs) - finiteNumber(b.atMs ?? b.endAtMs));
            };
            const selectImportantLoopFrames = function(value, limit = 16) {
              const entries = objectArray(value, 64);
              return uniqueObjects([
                entries.slice(-4),
                topByNumber(entries, 12, (entry) => Number(entry.callbackDurationMs ?? 0)),
                topByNumber(entries, 8, (entry) => Number(entry.timestampDeltaMs ?? 0)),
                topByNumber(entries, 6, (entry) => Number(entry.unmeasuredCallbackMs ?? 0))
              ], limit, (entry) => {
                const frameCount = Number(entry.frameCount ?? NaN);
                if (Number.isFinite(frameCount)) return 'loop-frame:' + frameCount;
                const startedAtMs = Number(entry.startedAtMs ?? 0);
                return Number.isFinite(startedAtMs) ? 'loop-start:' + startedAtMs.toFixed(3) : null;
              }).sort((a, b) => finiteNumber(a.startedAtMs ?? a.frameCount) - finiteNumber(b.startedAtMs ?? b.frameCount));
            };
            const compactRenderSubmissionCategory = function(category, ownerLimit = 4, exampleLimit = 2) {
              if (!category || typeof category !== 'object') return null;
              return {
                category: String(category.category ?? 'unattributed'),
                drawSubmissions: finiteNumber(category.drawSubmissions),
                triangles: finiteNumber(category.triangles),
                instances: finiteNumber(category.instances),
                meshes: finiteNumber(category.meshes),
                materials: finiteNumber(category.materials),
                geometries: finiteNumber(category.geometries),
                passTypes: compactNumberRecord(category.passTypes, 8),
                topOwners: ownerLimit > 0 && Array.isArray(category.topOwners)
                  ? category.topOwners.slice(0, ownerLimit).map((owner) => ({
                      ownerKey: compactString(owner?.ownerKey ?? 'unknown', 160),
                      ownerLabel: compactString(owner?.ownerLabel ?? owner?.ownerKey ?? 'unknown', 160),
                      ownerType: owner?.ownerType === null || owner?.ownerType === undefined
                        ? null
                        : compactString(owner.ownerType, 80),
                      drawSubmissions: finiteNumber(owner?.drawSubmissions),
                      triangles: finiteNumber(owner?.triangles),
                      instances: finiteNumber(owner?.instances),
                      meshes: finiteNumber(owner?.meshes)
                    }))
                  : undefined,
                examples: exampleLimit > 0 && Array.isArray(category.examples)
                  ? category.examples.slice(0, exampleLimit).map((example) => ({
                      nameChain: compactString(example?.nameChain ?? '', 180),
                      type: compactString(example?.type ?? '', 80),
                      modelPath: example?.modelPath === null || example?.modelPath === undefined
                        ? null
                        : compactString(example.modelPath, 180),
                      ownerKey: example?.ownerKey === null || example?.ownerKey === undefined
                        ? null
                        : compactString(example.ownerKey, 120),
                      ownerLabel: example?.ownerLabel === null || example?.ownerLabel === undefined
                        ? null
                        : compactString(example.ownerLabel, 120),
                      ownerType: example?.ownerType === null || example?.ownerType === undefined
                        ? null
                        : compactString(example.ownerType, 80),
                      materialType: example?.materialType === null || example?.materialType === undefined
                        ? null
                        : compactString(example.materialType, 80),
                      passType: example?.passType === undefined ? undefined : compactString(example.passType, 80),
                      triangles: finiteNumber(example?.triangles),
                      instances: finiteNumber(example?.instances)
                    }))
                  : undefined
              };
            };
            const selectImportantRenderCategories = function(value, limit = 16) {
              const entries = objectArray(value, 96);
              const unattributed = entries.filter((entry) => String(entry.category ?? '') === 'unattributed');
              return uniqueObjects([
                topByNumber(entries, 12, (entry) => Number(entry.drawSubmissions ?? 0)),
                topByNumber(entries, 12, (entry) => Number(entry.triangles ?? 0)),
                unattributed
              ], limit, (entry) => 'category:' + String(entry.category ?? 'unattributed'));
            };
            const renderFrameAnchorMs = function(frame) {
              const first = Number(frame?.firstAtMs ?? NaN);
              const last = Number(frame?.lastAtMs ?? NaN);
              if (Number.isFinite(first) && Number.isFinite(last)) return (first + last) / 2;
              if (Number.isFinite(last)) return last;
              if (Number.isFinite(first)) return first;
              return null;
            };
            const selectImportantRenderFrames = function(frames, rafEntries, limit = 32) {
              const entries = objectArray(frames, 128);
              const gapEntries = selectImportantRafEntries(rafEntries, 8);
              const nearestToGaps = [];
              for (const gap of gapEntries) {
                const anchor = Number(gap.atMs ?? gap.endAtMs ?? NaN);
                if (!Number.isFinite(anchor)) continue;
                let best = null;
                let bestDelta = Number.POSITIVE_INFINITY;
                for (const frame of entries) {
                  const frameAnchor = renderFrameAnchorMs(frame);
                  if (frameAnchor === null) continue;
                  const delta = Math.abs(frameAnchor - anchor);
                  if (delta < bestDelta) {
                    best = frame;
                    bestDelta = delta;
                  }
                }
                if (best) nearestToGaps.push(best);
              }
              return uniqueObjects([
                nearestToGaps,
                entries.slice(-4),
                topByNumber(entries, 6, (entry) => Number(entry.drawSubmissions ?? 0)),
                topByNumber(entries, 6, (entry) => Number(entry.triangles ?? 0))
              ], limit, (entry) => {
                const frameCount = Number(entry.frameCount ?? NaN);
                return Number.isFinite(frameCount) ? 'render-frame:' + frameCount : null;
              }).sort((a, b) => finiteNumber(a.frameCount) - finiteNumber(b.frameCount));
            };
            const compactRenderSubmissionDrain = function(value, rafEntries) {
              if (!value || typeof value !== 'object') return null;
              return {
                mode: value.mode === undefined ? undefined : String(value.mode),
                installedCount: finiteNumber(value.installedCount),
                installPasses: finiteNumber(value.installPasses),
                rawFrameCount: value.rawFrameCount === undefined ? undefined : finiteNumber(value.rawFrameCount),
                frameCountStart: nullableNumber(value.frameCountStart),
                frameCountEnd: nullableNumber(value.frameCountEnd),
                frames: selectImportantRenderFrames(value.frames, rafEntries, 8).map((frame) => ({
                  frameCount: finiteNumber(frame.frameCount),
                  firstAtMs: finiteNumber(frame.firstAtMs),
                  lastAtMs: finiteNumber(frame.lastAtMs),
                  drawSubmissions: finiteNumber(frame.drawSubmissions),
                  triangles: finiteNumber(frame.triangles),
                  instances: finiteNumber(frame.instances),
                  passTypes: compactNumberRecord(frame.passTypes, 8),
                  categories: selectImportantRenderCategories(frame.categories, 8)
                    .map((category) => compactRenderSubmissionCategory(category, 2, 0))
                    .filter(Boolean)
                })),
                totals: selectImportantRenderCategories(value.totals, 10)
                  .map((category) => compactRenderSubmissionCategory(category, 4, 1))
                  .filter(Boolean),
                errors: Array.isArray(value.errors)
                  ? value.errors.slice(0, 8).map((entry) => compactString(entry, 220))
                  : undefined
              };
            };
            const normalizeRuntimeLiveness = function(value) {
              const raw = objectOrNull(value);
              if (!raw) return null;
              return {
                engineFrameCount: Number(raw.engineFrameCount ?? 0),
                harnessRafTicks: Number(raw.harnessRafTicks ?? 0),
                documentHidden: typeof raw.documentHidden === 'boolean' ? raw.documentHidden : null,
                visibilityState: typeof raw.visibilityState === 'string' ? raw.visibilityState : null,
                gameStarted: Boolean(raw.gameStarted),
                playerInHelicopter: Boolean(raw.playerInHelicopter),
                playerInFixedWing: Boolean(raw.playerInFixedWing),
                playerInVehicle: Boolean(raw.playerInVehicle),
                playerSpectating: Boolean(raw.playerSpectating),
                playerPositionX: nullableNumber(raw.playerPositionX),
                playerPositionY: nullableNumber(raw.playerPositionY),
                playerPositionZ: nullableNumber(raw.playerPositionZ),
                playerVelocityX: Number(raw.playerVelocityX ?? 0),
                playerVelocityY: Number(raw.playerVelocityY ?? 0),
                playerVelocityZ: Number(raw.playerVelocityZ ?? 0),
                playerMovementSamples: Number(raw.playerMovementSamples ?? 0),
                playerAvgRequestedSpeed: Number(raw.playerAvgRequestedSpeed ?? 0),
                playerAvgActualSpeed: Number(raw.playerAvgActualSpeed ?? 0),
                playerBlockedByTerrain: Number(raw.playerBlockedByTerrain ?? 0),
                terrainHeightAtPlayer: nullableNumber(raw.terrainHeightAtPlayer),
                effectiveHeightAtPlayer: nullableNumber(raw.effectiveHeightAtPlayer),
                collisionHeightDeltaAtPlayer: nullableNumber(raw.collisionHeightDeltaAtPlayer),
                collisionContributorsAtPlayer: Array.isArray(raw.collisionContributorsAtPlayer)
                  ? raw.collisionContributorsAtPlayer
                      .filter((entry) => Boolean(entry && typeof entry === 'object'))
                      .slice(0, 4)
                      .map((entry) => compactDiagnosticObject(entry, { maxDepth: 3, arrayLimit: 4, entryLimit: 24, stringLimit: 160 }))
                  : [],
                playerMovementDebug: compactDiagnosticObject(raw.playerMovementDebug, { maxDepth: 4, arrayLimit: 4, entryLimit: 32, stringLimit: 180 }),
              };
            };
            window.__perfCaptureHarnessHelpers = {
              nullableNumber,
              objectOrNull,
              objectArray,
              compactDiagnosticObject,
              compactDiagnosticArray,
              compactNumberRecord,
              compactTimingBuckets,
              selectImportantLoopFrames,
              selectImportantRafEntries,
              topByNumber,
              compactRenderSubmissionDrain,
              normalizeRuntimeLiveness,
            };
          })();
        `,
      }),
      STEP_TIMEOUT_MS
    );
    await withTimeout(
      'install rAF startup monitor',
      page.addInitScript({
        content: `
          (() => {
            const globalScope = window;
            globalScope.__perfHarnessRaf = { ticks: 0 };
            const tick = () => {
              if (globalScope.__perfHarnessRaf) {
                globalScope.__perfHarnessRaf.ticks += 1;
              }
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          })();
        `,
      }),
      STEP_TIMEOUT_MS
    );
    page.on('console', msg => {
      const entry = { ts: nowIso(), type: msg.type(), text: msg.text() };
      consoleEntries.push(entry);
      if (entry.type === 'error' || entry.type === 'warning') {
        console.log(`[Browser ${entry.type}] ${entry.text}`);
      }
    });
    page.on('pageerror', err => {
      const detail = err.stack ? `${err.message}\n${err.stack}` : err.message;
      const entry = { ts: nowIso(), type: 'pageerror', text: detail };
      consoleEntries.push(entry);
      console.log(`[Browser pageerror] ${detail}`);
    });
    page.on('crash', () => {
      const entry = { ts: nowIso(), type: 'crash', text: 'Page crashed' };
      consoleEntries.push(entry);
      console.log('[Browser crash] Page crashed');
    });

    if (deepCdp) {
      stage = 'start-cdp';
      cdp = await context.newCDPSession(page);
      if (cdpProfiler) {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
        await cdp.send('Profiler.start');
      }
      if (cdpHeapSampling) {
        await cdp.send('HeapProfiler.enable');
        await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      }
      if (!focusedChromeTrace) {
        await startChromeTracing(cdp, { includeV8CpuProfiler: cdpProfiler });
        chromeTracingStarted = true;
      }
      cdpStarted = true;
    }

    if (runtimePreflight) {
      stage = 'runtime-preflight';
      const preflightPage = await context.newPage();
      preflightPage.setDefaultTimeout(STEP_TIMEOUT_MS);
      runtimePreflightResult = await preflightRuntimePage(preflightPage, preflightUrl, startupTimeoutSeconds, runtimePreflightTimeoutSeconds);
      await safeAwait('preflight page close', preflightPage.close({ runBeforeUnload: false }), 3000);
      logStep(`🧪 Runtime preflight completed in ${runtimePreflightResult.totalMs}ms (ok=${runtimePreflightResult.ok})`);
      if (!runtimePreflightResult.ok) {
        logStep(`⚠ Runtime preflight failed: ${runtimePreflightResult.reason ?? 'unknown'}`);
      }
    }

    stage = 'navigate-and-startup';
    logStep(`📍 Navigating to ${url}`);
    await withTimeout('page.goto', page.goto(url, { waitUntil: 'commit' }), navTimeoutMs);
    await ensurePageEvaluateHelperShim(page);
    await foregroundCapturePage(page);
    if (requestedMode !== 'ai_sandbox') {
      await startRequestedMode(page, requestedMode, startupTimeoutSeconds);
      await foregroundCapturePage(page);
    }
    startupState = await waitForRendering(page, startupTimeoutSeconds, startupFrameThreshold);
    startupTimeline = await safeAwait(
      'startup timeline snapshot',
      page.evaluate(() => (window as any).__startupTelemetry?.getSnapshot?.() ?? null),
      3000
    );
    if (!startupState.started) {
      logStep(`⚠ Startup did not stabilize: ${startupState.reason ?? 'unknown'}`);
      startupDiagnostics = await safeAwait(
        'startup diagnostics',
        page.evaluate(() => {
          const rendererBackend = (window as any).__renderer?.getRendererBackendCapabilities?.();
          return {
            ts: new Date().toISOString(),
            readyState: document.readyState,
            frameCount: Number((window as any).__metrics?.frameCount ?? 0),
            hasMetrics: Boolean((window as any).__metrics),
            hasEngine: Boolean((window as any).__engine),
            hasPerfApi: Boolean((window as any).perf?.report),
            rendererBackend: rendererBackend ? {
              requestedMode: String(rendererBackend.requestedMode ?? 'unknown'),
              resolvedBackend: String(rendererBackend.resolvedBackend ?? 'unknown'),
              initStatus: String(rendererBackend.initStatus ?? 'unknown'),
              strictWebGPU: Boolean(rendererBackend.strictWebGPU)
            } : undefined,
            bodyClassName: document.body?.className ?? '',
            errorPanelVisible: Boolean(document.querySelector('.error-panel')),
            gameStarted: Boolean((window as any).__engine?.gameStarted),
            startupPhase: typeof (window as any).__engine?.startupFlow?.getState === 'function'
              ? String((window as any).__engine.startupFlow.getState().phase ?? '')
              : null,
            rafTicks: Number((window as any).__perfHarnessRaf?.ticks ?? 0),
            hidden: document.hidden,
            visibilityState: document.visibilityState,
            activeViewTransition: Boolean((document as Document & { activeViewTransition?: unknown }).activeViewTransition),
            uiTransitionEnabled: Boolean(
              (document as Document & {
                uiTransitionState?: { enabled?: unknown };
              }).uiTransitionState?.enabled
            ),
            uiTransitionReason: (() => {
              const reason = (document as Document & {
                uiTransitionState?: { reason?: unknown };
              }).uiTransitionState?.reason;
              return typeof reason === 'string' ? reason : null;
            })()
          };
        }),
        3_000
      );
      validation = {
        overall: 'fail',
        checks: [
          {
            id: 'startup_stabilized',
            status: 'fail',
            value: startupState.lastFrameCount,
            message: startupState.reason ?? 'Startup rendering did not stabilize'
          }
        ]
      };
      measurementTrust = computeMeasurementTrust({
        probeRoundTripMs,
        runtimeSampleCount: runtimeSamples.length,
        missedSamples,
        sampleIntervalMs,
        detailEverySamples,
        rendererBackend: startupDiagnostics?.rendererBackend ?? latestRendererBackend(runtimeSamples),
        headed,
        scenarioMode: requestedMode,
        rendererMode
      });
      validation.checks.push(measurementTrustValidationCheck(measurementTrust));
      validation.overall = getOverallStatus(validation.checks);
      if (startupDiagnostics) {
        writeFileSync(join(artifactDir, 'startup-diagnostics.json'), JSON.stringify(startupDiagnostics, null, 2), 'utf-8');
      }
      if (startupTimeline) {
        writeFileSync(join(artifactDir, 'startup-timeline.json'), JSON.stringify(startupTimeline, null, 2), 'utf-8');
      }
      await safeAwait(
        'page.screenshot.startup-failed',
        page.screenshot({ path: join(artifactDir, 'startup-failed-frame.png'), fullPage: false, timeout: 10_000 }),
        12_000
      );
      throw new Error(`Startup did not stabilize: ${startupState.reason ?? 'unknown'}`);
    } else {
      await applyWeatherStateOverride(page, weatherStateOverride);
      if (enableCombat) {
        await setupActiveScenarioDriver(page, {
          enabled: activePlayerScenario,
          mode: requestedMode,
          driverSeed,
          compressFrontline,
          allowWarpRecovery,
          topUpHealth: activeTopUpHealth,
          autoRespawn: activeAutoRespawn,
          movementDecisionIntervalMs,
          frontlineTriggerDistance,
          maxCompressedPerFaction
        });
        activeScenarioStarted = activePlayerScenario;
      }
      await foregroundCapturePage(page);
      if (runtimeRenderSubmissionAttribution) {
        const installResult = await safeAwait(
          'install render submission attribution',
          page.evaluate(PROJEKT_143_RENDER_SUBMISSION_ATTRIBUTION_INSTALL_SOURCE),
          10_000
        );
        logStep(`🎯 Render submission attribution installed (${JSON.stringify(installResult)})`);
      }
      await warmupRuntime(page, warmupSeconds);
      pressureReadyWarmupResult = await waitForPressureReadyWarmup(page, {
        requested: pressureReadyWarmup,
        timeoutSeconds: pressureReadyTimeoutSeconds,
        activePlayerScenario,
        enableCombat,
      });
      if (activePlayerScenario) {
        await stopActiveScenarioDriver(page);
        await setupActiveScenarioDriver(page, {
          enabled: true,
          mode: requestedMode,
          driverSeed,
          compressFrontline,
          allowWarpRecovery,
          topUpHealth: activeTopUpHealth,
          autoRespawn: activeAutoRespawn,
          movementDecisionIntervalMs,
          frontlineTriggerDistance,
          maxCompressedPerFaction
        });
      }
      await foregroundCapturePage(page);
      // Reset rolling metrics after the active driver is live so sampling
      // reflects the steady-state window, not startup or harness restart cost.
      await safeAwait(
        'reset in-page metrics',
        page.evaluate(() => {
          (window as any).__metrics?.reset?.();
          (window as any).perf?.reset?.();
          (window as any).__perfHarnessObservers?.reset?.();
          (window as any).__gameLoopFrameBreakdown?.reset?.();
          (window as any).__materializationTierEvents?.({ clear: true, limit: 1 });
          (window as any).__engine?.systemManager?.combatantSystem?.combatantRenderer
            ?.getCloseModelRuntimeStats?.({ drainTransitionWindow: true });
          (window as any).__engine?.systemManager?.combatantSystem?.clearRecentTerrainRecoveryEvents?.();
        }),
        3000
      );
      if (runtimeRenderSubmissionAttribution) {
        const resetResult = await safeAwait(
          'reset render submission attribution',
          page.evaluate(PROJEKT_143_RENDER_SUBMISSION_ATTRIBUTION_RESET_SOURCE),
          10_000
        );
        logStep(`🎯 Render submission attribution reset (${JSON.stringify(resetResult)})`);
      }
      await foregroundCapturePage(page);
    }

    stage = 'sample-runtime';
    logStep(`🎯 Capturing profiling data for ${durationSeconds}s`);

    // Force GC before baseline heap measurement for reliable recovery ratios
    if (cdpStarted && cdp && page) {
      try {
        const gcBaseline = await forceGCAndMeasureHeap(cdp, page);
        logStep(`📊 Forced-GC baseline heap: ${gcBaseline.heapUsedMb.toFixed(2)} MB`);
      } catch {
        logStep('⚠ Forced GC baseline measurement failed');
      }
      // CDP's explicit baseline GC is harness work. Reset rolling frame,
      // browser-observer, and loop-breakdown metrics again so the first
      // runtime sample is not polluted by the heap-baseline collection.
      await safeAwait(
        'reset post-gc in-page metrics',
        page.evaluate(() => {
          (window as any).__metrics?.reset?.();
          (window as any).perf?.reset?.();
          (window as any).__perfHarnessObservers?.reset?.();
          (window as any).__gameLoopFrameBreakdown?.reset?.();
          (window as any).__materializationTierEvents?.({ clear: true, limit: 1 });
          (window as any).__engine?.systemManager?.combatantSystem?.combatantRenderer
            ?.getCloseModelRuntimeStats?.({ drainTransitionWindow: true });
          (window as any).__engine?.systemManager?.combatantSystem?.clearRecentTerrainRecoveryEvents?.();
        }),
        3000
      );
    }

    const startMs = Date.now();
    let sampleTick = 0;
    while (Date.now() - startMs < durationSeconds * 1000) {
      const elapsedMs = Date.now() - startMs;
      if (
        cdpStarted
        && cdp
        && focusedChromeTrace
        && !chromeTracingStarted
        && traceWindowStartMs !== null
        && elapsedMs >= traceWindowStartMs
      ) {
        try {
          await startChromeTracing(cdp, { includeV8CpuProfiler: cdpProfiler });
          chromeTracingStarted = true;
          logStep(`🎞 Focused Chrome trace started at +${elapsedMs}ms`);
        } catch (error) {
          logStep(`⚠ focused Chrome trace start failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (
        cdpStarted
        && cdp
        && focusedChromeTrace
        && chromeTracingStarted
        && !chromeTracingStopped
        && traceWindowStartMs !== null
        && traceWindowDurationMs !== null
        && elapsedMs >= traceWindowStartMs + traceWindowDurationMs
      ) {
        try {
          chromeTrace = await stopChromeTracing(cdp);
          chromeTracingStopped = true;
          logStep(`🎞 Focused Chrome trace stopped at +${elapsedMs}ms (${chromeTrace.length} bytes)`);
        } catch (error) {
          logStep(`⚠ focused Chrome trace stop failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      await sleep(sampleIntervalMs);
      let sample: RuntimeSample | null = null;
      try {
        const probeStart = Date.now();
        const includeDetails = sampleTick % detailEverySamples === 0;
        const shouldCaptureSceneAttribution = runtimeSceneAttribution
          && sampleTick % runtimeSceneAttributionEverySamples === 0;
        const shouldCaptureRenderSubmissions = runtimeRenderSubmissionAttribution
          && sampleTick % runtimeRenderSubmissionEverySamples === 0;
        const raw = await withTimeout('runtime sample', page.evaluate((options: {
          shouldIncludeDetails: boolean;
          shouldCaptureSceneAttribution: boolean;
          shouldCaptureRenderSubmissions: boolean;
          renderSubmissionMode: string;
          sceneAttributionEvaluateSource: string;
        }) => {
          const shouldIncludeDetails = options.shouldIncludeDetails;
          const metrics = (window as any).__metrics;
          const perf = (window as any).perf;
          const engine = (window as any).__engine;
          const renderer = (window as any).__renderer;
          const rendererStats = renderer?.getPerformanceStats?.();
          const rendererBackend = renderer?.getRendererBackendCapabilities?.();
          const browserStalls = (window as any).__perfHarnessObservers?.drain?.() ?? null;
          const basicValidation = perf?.validate?.();
          const report = shouldIncludeDetails ? perf?.report?.() : null;
          const movement = perf?.getMovement?.() ?? report?.movement ?? null;
          const combatProfile = shouldIncludeDetails ? (window as any).combatProfile?.() : null;
          let closeModelStats: any = null;
          try {
            const combatantRenderer = engine?.systemManager?.combatantSystem?.combatantRenderer;
            closeModelStats = combatantRenderer?.getCloseModelRuntimeStats?.({ drainTransitionWindow: true })
              ?? (window as any).npcMaterializationProfile?.(0)?.closeModelStats
              ?? null;
          } catch {
            closeModelStats = null;
          }
          const terrainStreams = shouldIncludeDetails
            ? engine?.systemManager?.terrainSystem?.getStreamingMetrics?.() ?? null
            : null;
          const vegetationDebug = shouldIncludeDetails
            ? engine?.systemManager?.globalBillboardSystem?.getDebugInfo?.() ?? null
            : null;
          const weatherDebug = shouldIncludeDetails
            ? engine?.systemManager?.weatherSystem?.getDebugInfo?.() ?? null
            : null;
          const terrainRecoveryEvents = shouldIncludeDetails
            ? engine?.systemManager?.combatantSystem?.getRecentTerrainRecoveryEvents?.() ?? null
            : null;
          const materializationTierEvents = (window as any).__materializationTierEvents?.({ clear: true, limit: 256 }) ?? [];
          const harnessCounters =
            (window as any).__perfHarnessDriverState?.getCountersSnapshot?.()
            ?? (window as any).__perfHarnessDriver?.getCountersSnapshot?.()
            ?? null;
          const harnessDriver = shouldIncludeDetails
            ? (window as any).__perfHarnessDriverState?.getDebugSnapshot?.() ?? null
            : null;
          const memory = (performance as any).memory;
          const snapshot = metrics?.getSnapshot?.();
          const sampleHelpers = (window as any).__perfCaptureHarnessHelpers;
          const nullableNumber = sampleHelpers.nullableNumber;
          const compactDiagnosticObject = sampleHelpers.compactDiagnosticObject;
          const compactDiagnosticArray = sampleHelpers.compactDiagnosticArray;
          const compactNumberRecord = sampleHelpers.compactNumberRecord;
          const compactTimingBuckets = sampleHelpers.compactTimingBuckets;
          const selectImportantLoopFrames = sampleHelpers.selectImportantLoopFrames;
          const selectImportantRafEntries = sampleHelpers.selectImportantRafEntries;
          const topByNumber = sampleHelpers.topByNumber;
          const compactRenderSubmissionDrain = sampleHelpers.compactRenderSubmissionDrain;
          const normalizeRuntimeLiveness = sampleHelpers.normalizeRuntimeLiveness;
          const rawFrameEvents = Array.isArray(snapshot?.frameEvents)
            ? snapshot.frameEvents
            : [];
          const frameEvents: RuntimeFrameEventSample[] = [];
          const frameEventStart = Math.max(0, rawFrameEvents.length - 64);
          for (let frameEventIndex = frameEventStart; frameEventIndex < rawFrameEvents.length; frameEventIndex++) {
            const entry = rawFrameEvents[frameEventIndex];
            frameEvents.push({
              frameCount: Number(entry?.frameCount ?? 0),
              frameMs: Number(entry?.frameMs ?? 0),
              atMs: Number(entry?.atMs ?? 0),
              previousMaxFrameMs: Number(entry?.previousMaxFrameMs ?? 0),
              newMax: Boolean(entry?.newMax),
              hitch33: Boolean(entry?.hitch33),
              hitch50: Boolean(entry?.hitch50),
              hitch100: Boolean(entry?.hitch100)
            });
          }
          const rawLoopFrameBreakdown = (window as any).__gameLoopFrameBreakdown?.drain?.() ?? [];
          const loopFrameBreakdown: LoopFrameBreakdownSample[] = [];
          if (Array.isArray(rawLoopFrameBreakdown)) {
            const selectedLoopFrameBreakdown = selectImportantLoopFrames(rawLoopFrameBreakdown, 6);
            for (const entry of selectedLoopFrameBreakdown) {
                const rawSegments = entry?.segments && typeof entry.segments === 'object'
                  ? entry.segments
                  : {};
                const rawSystemTimings = Array.isArray(entry?.systemTimings)
                  ? entry.systemTimings
                  : [];
                const rawTelemetryTimings = Array.isArray(entry?.telemetryTimings)
                  ? entry.telemetryTimings
                  : [];
                loopFrameBreakdown.push({
                  frameCount: Number.isFinite(Number(entry?.frameCount)) ? Number(entry.frameCount) : null,
                  startedAtMs: Number(entry?.startedAtMs ?? 0),
                  endedAtMs: Number(entry?.endedAtMs ?? 0),
                  timestampDeltaMs: Number(entry?.timestampDeltaMs ?? 0),
                  callbackDurationMs: Number(entry?.callbackDurationMs ?? 0),
                  segmentTotalMs: Number(entry?.segmentTotalMs ?? 0),
                  unmeasuredCallbackMs: Number(entry?.unmeasuredCallbackMs ?? 0),
                  segments: compactNumberRecord(rawSegments, 16),
                  systemTimings: topByNumber(
                    rawSystemTimings
                      .map((timing: any) => ({
                      name: String(timing?.name ?? 'unknown'),
                      lastMs: Number(timing?.lastMs ?? 0),
                      emaMs: Number(timing?.emaMs ?? timing?.timeMs ?? 0),
                      budgetMs: Number(timing?.budgetMs ?? 0),
                      overBudget: Boolean(timing?.overBudget)
                    }))
                      .filter((timing: any) =>
                      Number.isFinite(timing.lastMs) &&
                      Number.isFinite(timing.emaMs) &&
                      Number.isFinite(timing.budgetMs)
                      ),
                    8,
                    (timing: any) => Math.max(Math.abs(Number(timing.lastMs ?? 0)), Math.abs(Number(timing.emaMs ?? 0)))
                  ),
                  telemetryTimings: topByNumber(
                    rawTelemetryTimings
                      .map((timing: any) => ({
                      name: String(timing?.name ?? 'unknown'),
                      lastMs: Number(timing?.lastMs ?? 0),
                      emaMs: Number(timing?.emaMs ?? timing?.timeMs ?? 0),
                      peakMs: Number(timing?.peakMs ?? timing?.lastMs ?? 0),
                      budgetMs: Number(timing?.budgetMs ?? 0),
                      overBudget: Boolean(timing?.overBudget)
                    }))
                      .filter((timing: any) =>
                      Number.isFinite(timing.lastMs) &&
                      Number.isFinite(timing.emaMs) &&
                      Number.isFinite(timing.peakMs) &&
                      Number.isFinite(timing.budgetMs)
                      ),
                    8,
                    (timing: any) => Math.max(Math.abs(Number(timing.lastMs ?? 0)), Math.abs(Number(timing.peakMs ?? 0)))
                  ),
                  combatTiming: undefined
                });
            }
          }
          const normalizeVegetationDebug = (debug: any) => {
            if (!debug || typeof debug !== 'object') return undefined;
            const byType: Record<string, { active: number; highWater: number; free: number }> = {};
            let activeTotal = 0;
            let reservedTotal = 0;
            let freeTotal = 0;
            const ensureType = (typeId: string) => {
              byType[typeId] ??= { active: 0, highWater: 0, free: 0 };
              return byType[typeId];
            };
            for (const [key, rawValue] of Object.entries(debug)) {
              const value = Number(rawValue ?? 0);
              if (!Number.isFinite(value)) continue;
              if (key.endsWith('Active')) {
                const stats = ensureType(key.slice(0, -'Active'.length));
                stats.active = value;
                activeTotal += value;
              } else if (key.endsWith('HighWater')) {
                const stats = ensureType(key.slice(0, -'HighWater'.length));
                stats.highWater = value;
                reservedTotal += value;
              } else if (key.endsWith('Free')) {
                const stats = ensureType(key.slice(0, -'Free'.length));
                stats.free = value;
                freeTotal += value;
              }
            }
            return {
              activeTotal,
              reservedTotal,
              freeTotal,
              chunksTracked: Number(debug.chunksTracked ?? 0),
              byType
            };
          };
          const normalizeWeatherDebug = (debug: any) => {
            if (!debug || typeof debug !== 'object') return undefined;
            return {
              configEnabled: Boolean(debug.configEnabled),
              visualRainEnabled: Boolean(debug.visualRainEnabled),
              surfaceWetnessEnabled: Boolean(debug.surfaceWetnessEnabled),
              currentState: String(debug.currentState ?? 'unknown'),
              targetState: String(debug.targetState ?? 'unknown'),
              transitionProgress: Number(debug.transitionProgress ?? 0),
              cycleTimer: Number(debug.cycleTimer ?? 0),
              rainCount: Number(debug.rainCount ?? 0),
              activeRainCount: Number(debug.activeRainCount ?? 0),
              rainVisible: Boolean(debug.rainVisible),
              rainOpacity: Number(debug.rainOpacity ?? 0),
              rainInactive: Boolean(debug.rainInactive),
              surfaceWetness: Number(debug.surfaceWetness ?? 0),
              rainMatrixElementsPerFrame: Number(debug.rainMatrixElementsPerFrame ?? 0),
              rainMatrixBytesPerFrame: Number(debug.rainMatrixBytesPerFrame ?? 0)
            };
          };
          const harnessEngineShots = Number(harnessCounters?.engineShotsFired ?? harnessDriver?.engineShotsFired);
          const harnessEngineHits = Number(harnessCounters?.engineShotsHit ?? harnessDriver?.engineShotsHit);
          const reportShots = Number(basicValidation?.hitDetection?.shotsThisSession ?? report?.hitDetection?.shotsThisSession ?? 0);
          const reportHits = Number(basicValidation?.hitDetection?.hitsThisSession ?? report?.hitDetection?.hitsThisSession ?? 0);
          const shotsThisSession = Number.isFinite(harnessEngineShots)
            ? harnessEngineShots
            : reportShots;
          const hitsThisSession = Number.isFinite(harnessEngineHits)
            ? harnessEngineHits
            : reportHits;
          const hitRate = shotsThisSession > 0
            ? hitsThisSession / shotsThisSession
            : Number(basicValidation?.hitDetection?.hitRate ?? report?.hitDetection?.hitRate ?? 0);
          let sceneAttribution: any[] | null = null;
          let sceneAttributionError: string | null = null;
          let renderSubmissions: any | null = null;
          let renderSubmissionError: string | null = null;
          if (options.shouldCaptureSceneAttribution) {
            try {
              const rawSceneAttribution = Function(
                `"use strict"; return (${options.sceneAttributionEvaluateSource});`
              )();
              if (Array.isArray(rawSceneAttribution)) {
                sceneAttribution = rawSceneAttribution.map((entry: any) => ({
                  category: String(entry?.category ?? 'unattributed'),
                  objects: Number(entry?.objects ?? 0),
                  visibleObjects: Number(entry?.visibleObjects ?? 0),
                  meshes: Number(entry?.meshes ?? 0),
                  visibleMeshes: Number(entry?.visibleMeshes ?? 0),
                  instancedMeshes: Number(entry?.instancedMeshes ?? 0),
                  visibleInstancedMeshes: Number(entry?.visibleInstancedMeshes ?? 0),
                  drawCallLike: Number(entry?.drawCallLike ?? 0),
                  visibleDrawCallLike: Number(entry?.visibleDrawCallLike ?? 0),
                  instances: Number(entry?.instances ?? 0),
                  visibleInstances: Number(entry?.visibleInstances ?? 0),
                  triangles: Number(entry?.triangles ?? 0),
                  visibleTriangles: Number(entry?.visibleTriangles ?? 0),
                  materials: Number(entry?.materials ?? 0),
                  geometries: Number(entry?.geometries ?? 0)
                }));
              } else {
                sceneAttributionError = rawSceneAttribution === null
                  ? 'scene_attribution_unavailable'
                  : 'scene_attribution_non_array';
              }
            } catch (error) {
              sceneAttributionError = error instanceof Error ? error.message : String(error);
            }
          }
          if (options.shouldCaptureRenderSubmissions) {
            try {
              const tracker = (window as any).__projekt143RenderSubmissionAttribution;
              tracker?.install?.();
              const rawRenderSubmissions = options.renderSubmissionMode === 'summary'
                ? tracker?.drainSummary?.() ?? tracker?.drain?.() ?? null
                : tracker?.drain?.() ?? null;
              if (rawRenderSubmissions && typeof rawRenderSubmissions === 'object' && !rawRenderSubmissions.error) {
                renderSubmissions = compactRenderSubmissionDrain(
                  rawRenderSubmissions,
                  browserStalls?.recent?.rafCadence?.entries
                );
              } else {
                renderSubmissionError = String(rawRenderSubmissions?.error ?? 'render_submission_tracker_unavailable');
              }
            } catch (error) {
              renderSubmissionError = error instanceof Error ? error.message : String(error);
            }
          }
          return {
            pagePerformanceNowMs: Number(performance.now()),
            pageWallNowMs: Date.now(),
            frameCount: Number(snapshot?.frameCount ?? 0),
            avgFrameMs: Number(snapshot?.avgFrameMs ?? 0),
            p95FrameMs: Number(snapshot?.p95FrameMs ?? 0),
            p99FrameMs: Number(snapshot?.p99FrameMs ?? 0),
            maxFrameMs: Number(snapshot?.maxFrameMs ?? 0),
            hitch33Count: Number(snapshot?.hitch33Count ?? 0),
            hitch50Count: Number(snapshot?.hitch50Count ?? 0),
            hitch100Count: Number(snapshot?.hitch100Count ?? 0),
            frameEvents,
            loopFrameBreakdown,
            combatantCount: Number(snapshot?.combatantCount ?? 0),
            overBudgetPercent: Number(basicValidation?.frameBudget?.overBudgetPercent ?? report?.overBudgetPercent ?? 0),
            shotsThisSession,
            hitsThisSession,
            hitRate,
            heapUsedMb: memory?.usedJSHeapSize ? Number(memory.usedJSHeapSize) / (1024 * 1024) : undefined,
            heapTotalMb: memory?.totalJSHeapSize ? Number(memory.totalJSHeapSize) / (1024 * 1024) : undefined,
            uiErrorPanelVisible: Boolean(document.querySelector('.error-panel')),
            vegetation: normalizeVegetationDebug(vegetationDebug),
            weather: normalizeWeatherDebug(weatherDebug),
            closeModelStats: closeModelStats && typeof closeModelStats === 'object'
              ? {
                closeRadiusMeters: Number(closeModelStats.closeRadiusMeters ?? 0),
                closeModelActiveCap: Number(closeModelStats.closeModelActiveCap ?? 0),
                promotionBudgetPerFrame: Number(closeModelStats.promotionBudgetPerFrame ?? 0),
                promotionsThisFrame: Number(closeModelStats.promotionsThisFrame ?? 0),
                replacementsThisFrame: Number(closeModelStats.replacementsThisFrame ?? 0),
                candidatesWithinCloseRadius: Number(closeModelStats.candidatesWithinCloseRadius ?? 0),
                renderedCloseModels: Number(closeModelStats.renderedCloseModels ?? 0),
                activeCloseModels: Number(closeModelStats.activeCloseModels ?? 0),
                fallbackCount: Number(closeModelStats.fallbackCount ?? 0),
                fallbackCounts: closeModelStats.fallbackCounts && typeof closeModelStats.fallbackCounts === 'object'
                  ? Object.fromEntries(
                      Object.entries(closeModelStats.fallbackCounts).map(([key, value]: [string, any]) => [
                        String(key),
                        Number(value ?? 0)
                      ])
                    )
                  : {},
                nearestFallbackDistanceMeters: nullableNumber(closeModelStats.nearestFallbackDistanceMeters),
                farthestFallbackDistanceMeters: nullableNumber(closeModelStats.farthestFallbackDistanceMeters),
                poolLoads: Number(closeModelStats.poolLoads ?? 0),
                poolTargets: closeModelStats.poolTargets && typeof closeModelStats.poolTargets === 'object'
                  ? Object.fromEntries(
                      Object.entries(closeModelStats.poolTargets).map(([key, value]: [string, any]) => [
                        String(key),
                        Number(value ?? 0)
                      ])
                    )
                  : {},
                poolAvailable: closeModelStats.poolAvailable && typeof closeModelStats.poolAvailable === 'object'
                  ? Object.fromEntries(
                      Object.entries(closeModelStats.poolAvailable).map(([key, value]: [string, any]) => [
                        String(key),
                        Number(value ?? 0)
                      ])
                    )
                  : {},
                transitionWindow: closeModelStats.transitionWindow && typeof closeModelStats.transitionWindow === 'object'
                  ? {
                    total: Number(closeModelStats.transitionWindow.total ?? 0),
                    firstObservation: Number(closeModelStats.transitionWindow.firstObservation ?? 0),
                    toCloseGlb: Number(closeModelStats.transitionWindow.toCloseGlb ?? 0),
                    toImpostor: Number(closeModelStats.transitionWindow.toImpostor ?? 0),
                    toCulled: Number(closeModelStats.transitionWindow.toCulled ?? 0),
                    fromCloseGlb: Number(closeModelStats.transitionWindow.fromCloseGlb ?? 0),
                    byTransition: closeModelStats.transitionWindow.byTransition && typeof closeModelStats.transitionWindow.byTransition === 'object'
                      ? Object.fromEntries(
                          Object.entries(closeModelStats.transitionWindow.byTransition).map(([key, value]: [string, any]) => [
                            String(key),
                            Number(value ?? 0)
                          ])
                        )
                      : {},
                    byReason: closeModelStats.transitionWindow.byReason && typeof closeModelStats.transitionWindow.byReason === 'object'
                      ? Object.fromEntries(
                          Object.entries(closeModelStats.transitionWindow.byReason).map(([key, value]: [string, any]) => [
                            String(key),
                            Number(value ?? 0)
                          ])
                        )
                      : {}
                  }
                  : undefined
              }
              : undefined,
            terrainRecoveryEvents: compactDiagnosticArray(
              terrainRecoveryEvents,
              32,
              { maxDepth: 4, arrayLimit: 4, entryLimit: 48, stringLimit: 180 }
            ),
            materializationTierEvents: compactDiagnosticArray(
              materializationTierEvents,
              128,
              { maxDepth: 4, arrayLimit: 4, entryLimit: 48, stringLimit: 180 }
            ),
            renderer: rendererStats ? {
              drawCalls: Number(rendererStats.drawCalls ?? 0),
              triangles: Number(rendererStats.triangles ?? 0),
              geometries: Number(rendererStats.geometries ?? 0),
              textures: Number(rendererStats.textures ?? 0),
              programs: Number(rendererStats.programs ?? 0)
            } : undefined,
            rendererBackend: rendererBackend ? {
              requestedMode: String(rendererBackend.requestedMode ?? 'unknown'),
              resolvedBackend: String(rendererBackend.resolvedBackend ?? 'unknown'),
              initStatus: String(rendererBackend.initStatus ?? 'unknown'),
              strictWebGPU: Boolean(rendererBackend.strictWebGPU)
            } : undefined,
            gpu: report?.gpu ? {
              available: Boolean(report.gpu.available),
              gpuTimeMs: Number(report.gpu.gpuTimeMs ?? 0),
              drawCalls: Number(report.gpu.drawCalls ?? 0),
              triangles: Number(report.gpu.triangles ?? 0),
              geometries: Number(report.gpu.geometries ?? 0),
              textures: Number(report.gpu.textures ?? 0),
              programs: Number(report.gpu.programs ?? 0)
            } : undefined,
            ...(options.shouldCaptureSceneAttribution || sceneAttributionError
              ? {
                  sceneAttribution,
                  sceneAttributionError
                }
              : {}),
            ...(options.shouldCaptureRenderSubmissions || renderSubmissionError
              ? {
                  renderSubmissions,
                  renderSubmissionError
                }
              : {}),
            browserStalls: browserStalls ? {
              support: {
                longtask: Boolean(browserStalls.support?.longtask),
                longAnimationFrame: Boolean(browserStalls.support?.longAnimationFrame),
                userTiming: Boolean(browserStalls.support?.measure),
                webglTextureUpload: Boolean(browserStalls.support?.webglTextureUpload),
                rafCadence: Boolean(browserStalls.support?.rafCadence),
                resourceTiming: Boolean(browserStalls.support?.resourceTiming)
              },
              totals: {
                longTaskCount: Number(browserStalls.totals?.longTaskCount ?? 0),
                longTaskTotalDurationMs: Number(browserStalls.totals?.longTaskTotalDurationMs ?? 0),
                longTaskMaxDurationMs: Number(browserStalls.totals?.longTaskMaxDurationMs ?? 0),
                longAnimationFrameCount: Number(browserStalls.totals?.longAnimationFrameCount ?? 0),
                longAnimationFrameTotalDurationMs: Number(browserStalls.totals?.longAnimationFrameTotalDurationMs ?? 0),
                longAnimationFrameMaxDurationMs: Number(browserStalls.totals?.longAnimationFrameMaxDurationMs ?? 0),
                longAnimationFrameBlockingDurationMs: Number(browserStalls.totals?.longAnimationFrameBlockingDurationMs ?? 0),
                resourceCount: Number(browserStalls.totals?.resourceCount ?? 0),
                resourceTotalDurationMs: Number(browserStalls.totals?.resourceTotalDurationMs ?? 0),
                resourceMaxDurationMs: Number(browserStalls.totals?.resourceMaxDurationMs ?? 0),
                resourceTransferSizeBytes: Number(browserStalls.totals?.resourceTransferSizeBytes ?? 0),
                webglTextureUploadCount: Number(browserStalls.totals?.webglTextureUploadCount ?? 0),
                webglTextureUploadTotalDurationMs: Number(browserStalls.totals?.webglTextureUploadTotalDurationMs ?? 0),
                webglTextureUploadMaxDurationMs: Number(browserStalls.totals?.webglTextureUploadMaxDurationMs ?? 0),
                webglTextureUploadByOperation: browserStalls.totals?.webglTextureUploadByOperation && typeof browserStalls.totals.webglTextureUploadByOperation === 'object'
                  ? compactTimingBuckets(browserStalls.totals.webglTextureUploadByOperation, 16)
                  : undefined,
                rafCadence: browserStalls.totals?.rafCadence && typeof browserStalls.totals.rafCadence === 'object'
                  ? {
                      intervalCount: Number(browserStalls.totals.rafCadence.intervalCount ?? 0),
                      totalGapMs: Number(browserStalls.totals.rafCadence.totalGapMs ?? 0),
                      maxGapMs: Number(browserStalls.totals.rafCadence.maxGapMs ?? 0),
                      avgGapMs: Number(browserStalls.totals.rafCadence.avgGapMs ?? 0),
                      stutter25Count: Number(browserStalls.totals.rafCadence.stutter25Count ?? 0),
                      hitch33Count: Number(browserStalls.totals.rafCadence.hitch33Count ?? 0),
                      hitch50Count: Number(browserStalls.totals.rafCadence.hitch50Count ?? 0),
                      hitch100Count: Number(browserStalls.totals.rafCadence.hitch100Count ?? 0),
                      overBudget60HzMs: Number(browserStalls.totals.rafCadence.overBudget60HzMs ?? 0),
                      droppedFrameTime60HzMs: Number(browserStalls.totals.rafCadence.droppedFrameTime60HzMs ?? 0),
                      estimatedDropped60HzFrames: Number(browserStalls.totals.rafCadence.estimatedDropped60HzFrames ?? 0)
                    }
                  : undefined,
                userTimingByName: browserStalls.totals?.userTimingByName && typeof browserStalls.totals.userTimingByName === 'object'
                  ? compactTimingBuckets(browserStalls.totals.userTimingByName, 32)
                  : undefined
              },
              recent: {
                longTasks: {
                  count: Number(browserStalls.recent?.longTasks?.count ?? 0),
                  totalDurationMs: Number(browserStalls.recent?.longTasks?.totalDurationMs ?? 0),
                  maxDurationMs: Number(browserStalls.recent?.longTasks?.maxDurationMs ?? 0),
                  entries: Array.isArray(browserStalls.recent?.longTasks?.entries)
                    ? topByNumber(browserStalls.recent.longTasks.entries, 8, (entry: any) => Number(entry.duration ?? 0)).map((entry: any) => ({
                        name: String(entry.name ?? 'longtask'),
                        startTime: Number(entry.startTime ?? 0),
                        duration: Number(entry.duration ?? 0),
                        attribution: Array.isArray(entry.attribution)
                          ? entry.attribution.slice(0, 8).map((item: any) => ({
                              name: String(item.name ?? ''),
                              entryType: String(item.entryType ?? ''),
                              startTime: Number(item.startTime ?? 0),
                              duration: Number(item.duration ?? 0),
                              containerType: String(item.containerType ?? ''),
                              containerSrc: String(item.containerSrc ?? ''),
                              containerId: String(item.containerId ?? ''),
                              containerName: String(item.containerName ?? '')
                            }))
                          : []
                      }))
                    : []
                },
                webglTextureUploadTop: Array.isArray(browserStalls.recent?.webglTextureUploadTop)
                  ? browserStalls.recent.webglTextureUploadTop.slice(0, 8).map((entry: any) => ({
                      operation: String(entry.operation ?? ''),
                      startTime: Number(entry.startTime ?? 0),
                      duration: Number(entry.duration ?? 0),
                      target: String(entry.target ?? ''),
                      textureId: Number(entry.textureId ?? 0),
                      width: Number(entry.width ?? 0),
                      height: Number(entry.height ?? 0),
                      sourceType: String(entry.sourceType ?? ''),
                      sourceUrl: String(entry.sourceUrl ?? ''),
                      sourceWidth: Number(entry.sourceWidth ?? 0),
                      sourceHeight: Number(entry.sourceHeight ?? 0),
                      byteLength: Number(entry.byteLength ?? 0)
                    }))
                  : [],
                longAnimationFrames: {
                  count: Number(browserStalls.recent?.longAnimationFrames?.count ?? 0),
                  totalDurationMs: Number(browserStalls.recent?.longAnimationFrames?.totalDurationMs ?? 0),
                  maxDurationMs: Number(browserStalls.recent?.longAnimationFrames?.maxDurationMs ?? 0),
                  blockingDurationMs: Number(browserStalls.recent?.longAnimationFrames?.blockingDurationMs ?? 0),
                  entries: Array.isArray(browserStalls.recent?.longAnimationFrames?.entries)
                    ? topByNumber(browserStalls.recent.longAnimationFrames.entries, 8, (entry: any) => Number(entry.duration ?? 0)).map((entry: any) => ({
                        startTime: Number(entry.startTime ?? 0),
                        duration: Number(entry.duration ?? 0),
                        blockingDuration: Number(entry.blockingDuration ?? 0),
                        renderStart: Number(entry.renderStart ?? 0),
                        styleAndLayoutStart: Number(entry.styleAndLayoutStart ?? 0),
                        firstUIEventTimestamp: Number(entry.firstUIEventTimestamp ?? 0),
                        scripts: Array.isArray(entry.scripts)
                          ? entry.scripts.slice(0, 8).map((script: any) => ({
                              name: String(script.name ?? ''),
                              invoker: String(script.invoker ?? ''),
                              invokerType: String(script.invokerType ?? ''),
                              sourceURL: String(script.sourceURL ?? ''),
                              sourceFunctionName: String(script.sourceFunctionName ?? ''),
                              sourceCharPosition: Number(script.sourceCharPosition ?? 0),
                              windowAttribution: String(script.windowAttribution ?? ''),
                              executionStart: Number(script.executionStart ?? 0),
                              duration: Number(script.duration ?? 0),
                              pauseDuration: Number(script.pauseDuration ?? 0),
                              forcedStyleAndLayoutDuration: Number(script.forcedStyleAndLayoutDuration ?? 0)
                            }))
                          : []
                      }))
                    : []
                },
                resources: browserStalls.recent?.resources && typeof browserStalls.recent.resources === 'object'
                  ? {
                      count: Number(browserStalls.recent.resources.count ?? 0),
                      totalDurationMs: Number(browserStalls.recent.resources.totalDurationMs ?? 0),
                      maxDurationMs: Number(browserStalls.recent.resources.maxDurationMs ?? 0),
                      transferSizeBytes: Number(browserStalls.recent.resources.transferSizeBytes ?? 0),
                      entries: Array.isArray(browserStalls.recent.resources.entries)
                        ? browserStalls.recent.resources.entries.slice(0, 16).map((entry: any) => ({
                            name: String(entry.name ?? ''),
                            initiatorType: String(entry.initiatorType ?? ''),
                            startTime: Number(entry.startTime ?? 0),
                            responseEnd: Number(entry.responseEnd ?? 0),
                            duration: Number(entry.duration ?? 0),
                            transferSize: Number(entry.transferSize ?? 0),
                            encodedBodySize: Number(entry.encodedBodySize ?? 0),
                            decodedBodySize: Number(entry.decodedBodySize ?? 0),
                            renderBlockingStatus: String(entry.renderBlockingStatus ?? '')
                          }))
                        : []
                    }
                  : undefined,
                rafCadence: browserStalls.recent?.rafCadence && typeof browserStalls.recent.rafCadence === 'object'
                  ? {
                      count: Number(browserStalls.recent.rafCadence.count ?? 0),
                      estimatedDropped60HzFrames: Number(browserStalls.recent.rafCadence.estimatedDropped60HzFrames ?? 0),
                      overBudget60HzMs: Number(browserStalls.recent.rafCadence.overBudget60HzMs ?? 0),
                      droppedFrameTime60HzMs: Number(browserStalls.recent.rafCadence.droppedFrameTime60HzMs ?? 0),
                      maxGapMs: Number(browserStalls.recent.rafCadence.maxGapMs ?? 0),
                      entries: Array.isArray(browserStalls.recent.rafCadence.entries)
                        ? selectImportantRafEntries(browserStalls.recent.rafCadence.entries, 2).map((entry: any) => ({
                            atMs: Number(entry.atMs ?? 0),
                            gapMs: Number(entry.gapMs ?? 0),
                            estimatedDropped60HzFrames: Number(entry.estimatedDropped60HzFrames ?? 0),
                            overBudget60HzMs: Number(entry.overBudget60HzMs ?? 0),
                            droppedFrameTime60HzMs: Number(entry.droppedFrameTime60HzMs ?? 0),
                            stutter25: Boolean(entry.stutter25),
                            hitch33: Boolean(entry.hitch33),
                            hitch50: Boolean(entry.hitch50),
                            hitch100: Boolean(entry.hitch100),
                            presentationContext: compactDiagnosticObject(entry.presentationContext, { maxDepth: 4, arrayLimit: 2, entryLimit: 36, stringLimit: 160 }),
                            harnessContext: compactDiagnosticObject(entry.harnessContext, { maxDepth: 4, arrayLimit: 2, entryLimit: 36, stringLimit: 160 })
                          }))
                        : []
                    }
                  : undefined,
                userTimingByName: browserStalls.recent?.userTimingByName && typeof browserStalls.recent.userTimingByName === 'object'
                  ? compactTimingBuckets(browserStalls.recent.userTimingByName, 32)
                  : undefined
              }
            } : undefined,
            terrainStreams: Array.isArray(terrainStreams)
              ? terrainStreams.map((stream: any) => ({
                  name: String(stream?.name ?? 'unknown'),
                  budgetMs: Number(stream?.budgetMs ?? 0),
                  timeMs: Number(stream?.timeMs ?? 0),
                  pendingUnits: Number(stream?.pendingUnits ?? 0),
                  ...(stream?.debug && typeof stream.debug === 'object'
                    ? { debug: stream.debug as Record<string, unknown> }
                    : {}),
                }))
              : undefined,
            movement: movement ? {
              player: {
                samples: Number(movement.player?.samples ?? 0),
                groundedSamples: Number(movement.player?.groundedSamples ?? 0),
                uphillSamples: Number(movement.player?.uphillSamples ?? 0),
                downhillSamples: Number(movement.player?.downhillSamples ?? 0),
                blockedByTerrain: Number(movement.player?.blockedByTerrain ?? 0),
                slideSamples: Number(movement.player?.slideSamples ?? 0),
                walkabilityTransitions: Number(movement.player?.walkabilityTransitions ?? 0),
                pinnedAreaEvents: Number(movement.player?.pinnedAreaEvents ?? 0),
                pinnedSamples: Number(movement.player?.pinnedSamples ?? 0),
                avgPinnedSeconds: Number(movement.player?.avgPinnedSeconds ?? 0),
                maxPinnedSeconds: Number(movement.player?.maxPinnedSeconds ?? 0),
                avgPinnedRadius: Number(movement.player?.avgPinnedRadius ?? 0),
                avgSupportNormalY: Number(movement.player?.avgSupportNormalY ?? 1),
                avgSupportNormalDelta: Number(movement.player?.avgSupportNormalDelta ?? 0),
                avgRequestedSpeed: Number(movement.player?.avgRequestedSpeed ?? 0),
                avgActualSpeed: Number(movement.player?.avgActualSpeed ?? 0)
              },
              npc: {
                samples: Number(movement.npc?.samples ?? 0),
                contourActivations: Number(movement.npc?.contourActivations ?? 0),
                backtrackActivations: Number(movement.npc?.backtrackActivations ?? 0),
                arrivalCount: Number(movement.npc?.arrivalCount ?? 0),
                lowProgressEvents: Number(movement.npc?.lowProgressEvents ?? 0),
                pinnedAreaEvents: Number(movement.npc?.pinnedAreaEvents ?? 0),
                pinnedSamples: Number(movement.npc?.pinnedSamples ?? 0),
                avgPinnedSeconds: Number(movement.npc?.avgPinnedSeconds ?? 0),
                maxPinnedSeconds: Number(movement.npc?.maxPinnedSeconds ?? 0),
                avgPinnedRadius: Number(movement.npc?.avgPinnedRadius ?? 0),
                avgProgressPerSample: Number(movement.npc?.avgProgressPerSample ?? 0),
                byIntent: movement.npc?.byIntent && typeof movement.npc.byIntent === 'object'
                  ? Object.fromEntries(
                      Object.entries(movement.npc.byIntent).map(([key, value]: [string, unknown]) => [
                        String(key),
                        Number(value ?? 0)
                      ])
                    )
                  : {},
                samplesByLod: movement.npc?.samplesByLod && typeof movement.npc.samplesByLod === 'object'
                  ? Object.fromEntries(
                      Object.entries(movement.npc.samplesByLod).map(([key, value]: [string, unknown]) => [
                        String(key),
                        Number(value ?? 0)
                      ])
                    )
                  : {},
                lowProgressByLod: movement.npc?.lowProgressByLod && typeof movement.npc.lowProgressByLod === 'object'
                  ? Object.fromEntries(
                      Object.entries(movement.npc.lowProgressByLod).map(([key, value]: [string, unknown]) => [
                        String(key),
                        Number(value ?? 0)
                      ])
                    )
                  : {},
                pinnedByLod: movement.npc?.pinnedByLod && typeof movement.npc.pinnedByLod === 'object'
                  ? Object.fromEntries(
                      Object.entries(movement.npc.pinnedByLod).map(([key, value]: [string, unknown]) => [
                        String(key),
                        Number(value ?? 0)
                      ])
                    )
                  : {}
              }
            } : undefined,
            combatBreakdown: combatProfile?.timing
              ? {
                  totalMs: Number(combatProfile.timing.totalMs ?? 0),
                  aiUpdateMs: Number(combatProfile.timing.aiUpdateMs ?? 0),
                  spatialSyncMs: Number(combatProfile.timing.spatialSyncMs ?? 0),
                  billboardUpdateMs: Number(combatProfile.timing.billboardUpdateMs ?? 0),
                  billboardProfile: combatProfile.timing.billboardProfile ? {
                    walkFrameMs: Number(combatProfile.timing.billboardProfile.walkFrameMs ?? 0),
                    closeModelMs: Number(combatProfile.timing.billboardProfile.closeModelMs ?? 0),
                    bucketResetMs: Number(combatProfile.timing.billboardProfile.bucketResetMs ?? 0),
                    impostorWriteMs: Number(combatProfile.timing.billboardProfile.impostorWriteMs ?? 0),
                    finalizeMs: Number(combatProfile.timing.billboardProfile.finalizeMs ?? 0),
                    hitboxDebugMs: Number(combatProfile.timing.billboardProfile.hitboxDebugMs ?? 0),
                    materializationEventsMs: Number(combatProfile.timing.billboardProfile.materializationEventsMs ?? 0),
                    shaderUniformMs: Number(combatProfile.timing.billboardProfile.shaderUniformMs ?? 0)
                  } : undefined,
                  effectPoolsMs: Number(combatProfile.timing.effectPoolsMs ?? 0),
                  influenceMapMs: Number(combatProfile.timing.influenceMapMs ?? 0),
                  aiStateMs: typeof combatProfile.timing.aiStateMs === 'object'
                    ? compactNumberRecord(combatProfile.timing.aiStateMs, 32)
                    : undefined,
                  aiMethodMs: typeof combatProfile.timing.aiMethodMs === 'object'
                    ? compactNumberRecord(combatProfile.timing.aiMethodMs, 48)
                    : undefined,
                  aiMethodCounts: typeof combatProfile.timing.aiMethodCounts === 'object'
                    ? compactNumberRecord(combatProfile.timing.aiMethodCounts, 48)
                    : undefined,
                  aiMethodTotalCounts: typeof combatProfile.timing.aiMethodTotalCounts === 'object'
                    ? compactNumberRecord(combatProfile.timing.aiMethodTotalCounts, 48)
                    : undefined,
                  aiSlowestUpdate: combatProfile.timing.aiSlowestUpdate && typeof combatProfile.timing.aiSlowestUpdate === 'object'
                    ? {
                        combatantId: String(combatProfile.timing.aiSlowestUpdate.combatantId ?? 'unknown'),
                        stateAtStart: String(combatProfile.timing.aiSlowestUpdate.stateAtStart ?? 'unknown'),
                        stateAtEnd: String(combatProfile.timing.aiSlowestUpdate.stateAtEnd ?? 'unknown'),
                        lodLevel: String(combatProfile.timing.aiSlowestUpdate.lodLevel ?? 'unknown'),
                        totalMs: Number(combatProfile.timing.aiSlowestUpdate.totalMs ?? 0),
                        methodMs: typeof combatProfile.timing.aiSlowestUpdate.methodMs === 'object'
                          ? compactNumberRecord(combatProfile.timing.aiSlowestUpdate.methodMs, 24)
                          : {},
                        methodCounts: typeof combatProfile.timing.aiSlowestUpdate.methodCounts === 'object'
                          ? compactNumberRecord(combatProfile.timing.aiSlowestUpdate.methodCounts, 24)
                          : {}
                      }
                    : null,
                  losCache: combatProfile.timing.losCache ? {
                    hits: Number(combatProfile.timing.losCache.hits ?? 0),
                    misses: Number(combatProfile.timing.losCache.misses ?? 0),
                    hitRate: Number(combatProfile.timing.losCache.hitRate ?? 0),
                    budgetDenials: Number(combatProfile.timing.losCache.budgetDenials ?? 0),
                    prefilterPasses: Number(combatProfile.timing.losCache.prefilterPasses ?? 0),
                    prefilterRejects: Number(combatProfile.timing.losCache.prefilterRejects ?? 0),
                    fullEvaluations: Number(combatProfile.timing.losCache.fullEvaluations ?? 0),
                    terrainRaycasts: Number(combatProfile.timing.losCache.terrainRaycasts ?? 0),
                    fullEvaluationClear: Number(combatProfile.timing.losCache.fullEvaluationClear ?? 0),
                    fullEvaluationBlocked: Number(combatProfile.timing.losCache.fullEvaluationBlocked ?? 0)
                  } : undefined,
                  closeEngagement: combatProfile.timing.closeEngagement ? {
                    engagement: combatProfile.timing.closeEngagement.engagement ? {
                      closeRangeFullAutoActivations: Number(combatProfile.timing.closeEngagement.engagement.closeRangeFullAutoActivations ?? 0),
                      nearbyEnemyBurstTriggers: Number(combatProfile.timing.closeEngagement.engagement.nearbyEnemyBurstTriggers ?? 0),
                      suppressionTransitions: Number(combatProfile.timing.closeEngagement.engagement.suppressionTransitions ?? 0),
                      nearbyEnemyCountSamples: Number(combatProfile.timing.closeEngagement.engagement.nearbyEnemyCountSamples ?? 0),
                      nearbyEnemyCountTotal: Number(combatProfile.timing.closeEngagement.engagement.nearbyEnemyCountTotal ?? 0),
                      nearbyEnemyCountMax: Number(combatProfile.timing.closeEngagement.engagement.nearbyEnemyCountMax ?? 0),
                      suppressionFlankDestinationComputations: Number(combatProfile.timing.closeEngagement.engagement.suppressionFlankDestinationComputations ?? 0),
                      suppressionFlankCoverSearches: Number(combatProfile.timing.closeEngagement.engagement.suppressionFlankCoverSearches ?? 0),
                      suppressionFlankCoverSearchReuseSkips: Number(combatProfile.timing.closeEngagement.engagement.suppressionFlankCoverSearchReuseSkips ?? 0),
                      suppressionFlankCoverSearchCapSkips: Number(combatProfile.timing.closeEngagement.engagement.suppressionFlankCoverSearchCapSkips ?? 0),
                      targetDistanceBuckets: Object.fromEntries(
                        Object.entries(combatProfile.timing.closeEngagement.engagement.targetDistanceBuckets ?? {}).map(([key, value]) => [
                          key,
                          Number(value ?? 0)
                        ])
                      )
                    } : undefined,
                    targetAcquisition: Object.fromEntries(
                      Object.entries(combatProfile.timing.closeEngagement.targetAcquisition ?? {}).map(([key, value]) => [
                        key,
                        Number(value ?? 0)
                      ])
                    ),
                    targetDistribution: Object.fromEntries(
                      Object.entries(combatProfile.timing.closeEngagement.targetDistribution ?? {}).map(([key, value]) => [
                        key,
                        Number(value ?? 0)
                      ])
                    ),
                    lineOfSight: Object.fromEntries(
                      Object.entries(combatProfile.timing.closeEngagement.lineOfSight ?? {}).map(([key, value]) => [
                        key,
                        Number(value ?? 0)
                      ])
                    ),
                    losCallsites: Object.fromEntries(
                      Object.entries(combatProfile.timing.closeEngagement.losCallsites ?? {}).map(([key, value]) => [
                        key,
                        Object.fromEntries(
                          Object.entries(value ?? {}).map(([metricKey, metricValue]) => [
                            metricKey,
                            Number(metricValue ?? 0)
                          ])
                        )
                      ])
                    )
                  } : undefined,
                  raycastBudget: combatProfile.timing.raycastBudget ? {
                    maxPerFrame: Number(combatProfile.timing.raycastBudget.maxPerFrame ?? 0),
                    usedThisFrame: Number(combatProfile.timing.raycastBudget.usedThisFrame ?? 0),
                    deniedThisFrame: Number(combatProfile.timing.raycastBudget.deniedThisFrame ?? 0),
                    totalExhaustedFrames: Number(combatProfile.timing.raycastBudget.totalExhaustedFrames ?? 0),
                    totalRequested: Number(combatProfile.timing.raycastBudget.totalRequested ?? 0),
                    totalDenied: Number(combatProfile.timing.raycastBudget.totalDenied ?? 0),
                    saturationRate: Number(combatProfile.timing.raycastBudget.saturationRate ?? 0),
                    denialRate: Number(combatProfile.timing.raycastBudget.denialRate ?? 0)
                  } : undefined,
                  combatFireRaycastBudget: combatProfile.timing.combatFireRaycastBudget ? {
                    maxPerFrame: Number(combatProfile.timing.combatFireRaycastBudget.maxPerFrame ?? 0),
                    usedThisFrame: Number(combatProfile.timing.combatFireRaycastBudget.usedThisFrame ?? 0),
                    deniedThisFrame: Number(combatProfile.timing.combatFireRaycastBudget.deniedThisFrame ?? 0),
                    terrainBlockedThisFrame: Number(combatProfile.timing.combatFireRaycastBudget.terrainBlockedThisFrame ?? 0),
                    totalExhaustedFrames: Number(combatProfile.timing.combatFireRaycastBudget.totalExhaustedFrames ?? 0),
                    totalRequested: Number(combatProfile.timing.combatFireRaycastBudget.totalRequested ?? 0),
                    totalDenied: Number(combatProfile.timing.combatFireRaycastBudget.totalDenied ?? 0),
                    totalTerrainBlocked: Number(combatProfile.timing.combatFireRaycastBudget.totalTerrainBlocked ?? 0),
                    saturationRate: Number(combatProfile.timing.combatFireRaycastBudget.saturationRate ?? 0),
                    denialRate: Number(combatProfile.timing.combatFireRaycastBudget.denialRate ?? 0),
                    terrainBlockRate: Number(combatProfile.timing.combatFireRaycastBudget.terrainBlockRate ?? 0)
                  } : undefined,
                  aiScheduling: combatProfile.timing.aiScheduling ? {
                    frameCounter: Number(combatProfile.timing.aiScheduling.frameCounter ?? 0),
                    intervalScale: Number(combatProfile.timing.aiScheduling.intervalScale ?? 1),
                    aiBudgetMs: Number(combatProfile.timing.aiScheduling.aiBudgetMs ?? 0),
                    staggeredSkips: Number(combatProfile.timing.aiScheduling.staggeredSkips ?? 0),
                    highFullUpdates: Number(combatProfile.timing.aiScheduling.highFullUpdates ?? 0),
                    mediumFullUpdates: Number(combatProfile.timing.aiScheduling.mediumFullUpdates ?? 0),
                    projectedHighFullUpdateDeferrals: Number(combatProfile.timing.aiScheduling.projectedHighFullUpdateDeferrals ?? 0),
                    highFullUpdateCostEmaMs: Number(combatProfile.timing.aiScheduling.highFullUpdateCostEmaMs ?? 0),
                    highFullUpdateCostPeakMs: Number(combatProfile.timing.aiScheduling.highFullUpdateCostPeakMs ?? 0),
                    maxHighFullUpdatesPerFrame: Number(combatProfile.timing.aiScheduling.maxHighFullUpdatesPerFrame ?? 0),
                    maxMediumFullUpdatesPerFrame: Number(combatProfile.timing.aiScheduling.maxMediumFullUpdatesPerFrame ?? 0),
                    aiBudgetExceededEvents: Number(combatProfile.timing.aiScheduling.aiBudgetExceededEvents ?? 0),
                    aiSevereOverBudgetEvents: Number(combatProfile.timing.aiScheduling.aiSevereOverBudgetEvents ?? 0),
                    simLaneTransitions: combatProfile.timing.aiScheduling.simLaneTransitions
                      && typeof combatProfile.timing.aiScheduling.simLaneTransitions === 'object'
                      ? {
                          total: Number(combatProfile.timing.aiScheduling.simLaneTransitions.total ?? 0),
                          towardHigherFidelity: Number(combatProfile.timing.aiScheduling.simLaneTransitions.towardHigherFidelity ?? 0),
                          towardLowerFidelity: Number(combatProfile.timing.aiScheduling.simLaneTransitions.towardLowerFidelity ?? 0),
                          toHigh: Number(combatProfile.timing.aiScheduling.simLaneTransitions.toHigh ?? 0),
                          toMedium: Number(combatProfile.timing.aiScheduling.simLaneTransitions.toMedium ?? 0),
                          toLow: Number(combatProfile.timing.aiScheduling.simLaneTransitions.toLow ?? 0),
                          toCulled: Number(combatProfile.timing.aiScheduling.simLaneTransitions.toCulled ?? 0),
                          fromHigh: Number(combatProfile.timing.aiScheduling.simLaneTransitions.fromHigh ?? 0),
                          fromMedium: Number(combatProfile.timing.aiScheduling.simLaneTransitions.fromMedium ?? 0),
                          fromLow: Number(combatProfile.timing.aiScheduling.simLaneTransitions.fromLow ?? 0),
                          fromCulled: Number(combatProfile.timing.aiScheduling.simLaneTransitions.fromCulled ?? 0),
                          byTransition: combatProfile.timing.aiScheduling.simLaneTransitions.byTransition
                            && typeof combatProfile.timing.aiScheduling.simLaneTransitions.byTransition === 'object'
                            ? Object.fromEntries(
                                Object.entries(combatProfile.timing.aiScheduling.simLaneTransitions.byTransition).map(([key, value]: [string, unknown]) => [
                                  String(key),
                                  Number(value ?? 0)
                                ])
                              )
                            : {},
                          maxRenderedLagMeters: Number(combatProfile.timing.aiScheduling.simLaneTransitions.maxRenderedLagMeters ?? 0),
                          maxRenderedHorizontalLagMeters: Number(combatProfile.timing.aiScheduling.simLaneTransitions.maxRenderedHorizontalLagMeters ?? 0),
                          maxRenderedVerticalLagMeters: Number(combatProfile.timing.aiScheduling.simLaneTransitions.maxRenderedVerticalLagMeters ?? 0),
                          maxTransitionRenderedLagMeters: Number(combatProfile.timing.aiScheduling.simLaneTransitions.maxTransitionRenderedLagMeters ?? 0),
                          sampledRenderedLagCount: Number(combatProfile.timing.aiScheduling.simLaneTransitions.sampledRenderedLagCount ?? 0)
                        }
                      : undefined
                  } : undefined
                }
              : undefined,
            harnessDriver: harnessDriver ? {
              mode: String(harnessDriver.mode ?? ''),
              driverSeed: nullableNumber(harnessDriver.driverSeed),
              movementDecisionIntervalMs: nullableNumber(harnessDriver.movementDecisionIntervalMs),
              // Driver exposes the canonical bot state machine label
              // under `botState`; older artifacts may have only had
              // `movementState`. Read both and prefer `botState`.
              botState: String(harnessDriver.botState ?? harnessDriver.movementState ?? ''),
              movementState: String(harnessDriver.botState ?? harnessDriver.movementState ?? ''),
              targetVisible: Boolean(harnessDriver.targetVisible),
              respawnCount: Number(harnessDriver.respawnCount ?? 0),
              ammoRefillCount: Number(harnessDriver.ammoRefillCount ?? 0),
              healthTopUpCount: Number(harnessDriver.healthTopUpCount ?? 0),
              lastShotAt: Number(harnessDriver.lastShotAt ?? 0),
              lastFireProbe: harnessDriver.lastFireProbe && typeof harnessDriver.lastFireProbe === 'object'
                ? compactDiagnosticObject(harnessDriver.lastFireProbe, { maxDepth: 3, arrayLimit: 4, entryLimit: 24, stringLimit: 160 })
                : null,
              terrainProfile: typeof harnessDriver.terrainProfile === 'string'
                ? harnessDriver.terrainProfile
                : undefined,
              maxGradient: Number.isFinite(Number(harnessDriver.maxGradient))
                ? Number(harnessDriver.maxGradient)
                : undefined,
              stuckTimeoutSec: Number.isFinite(Number(harnessDriver.stuckTimeoutSec))
                ? Number(harnessDriver.stuckTimeoutSec)
                : undefined,
              losRejectedShots: Number(harnessDriver.losRejectedShots ?? 0),
              losUnknownTargetChecks: Number(harnessDriver.losUnknownTargetChecks ?? 0),
              fireUnknownLosRejectedShots: Number(harnessDriver.fireUnknownLosRejectedShots ?? 0),
              lastTargetLosStatus: typeof harnessDriver.lastTargetLosStatus === 'string'
                ? harnessDriver.lastTargetLosStatus
                : null,
              lastTargetLosReason: typeof harnessDriver.lastTargetLosReason === 'string'
                ? harnessDriver.lastTargetLosReason
                : null,
              lastFireLosStatus: typeof harnessDriver.lastFireLosStatus === 'string'
                ? harnessDriver.lastFireLosStatus
                : null,
              lastFireLosReason: typeof harnessDriver.lastFireLosReason === 'string'
                ? harnessDriver.lastFireLosReason
                : null,
              lastCurrentTargetLive: typeof harnessDriver.lastCurrentTargetLive === 'boolean'
                ? harnessDriver.lastCurrentTargetLive
                : null,
              lastCurrentTargetHealth: nullableNumber(harnessDriver.lastCurrentTargetHealth),
              lastCurrentTargetState: typeof harnessDriver.lastCurrentTargetState === 'string'
                ? harnessDriver.lastCurrentTargetState
                : null,
              shotEpochs: compactDiagnosticArray(
                harnessDriver.shotEpochs,
                2,
                { maxDepth: 4, arrayLimit: 2, entryLimit: 40, stringLimit: 160 }
              ),
              aimDotGateRejectedShots: Number(harnessDriver.aimDotGateRejectedShots ?? 0),
              fireStartRejected: Number(harnessDriver.fireStartRejected ?? 0),
              runtimeShotPreviewRejectedShots: Number(harnessDriver.runtimeShotPreviewRejectedShots ?? 0),
              runtimeShotPreviewAimSettlingShots: Number(harnessDriver.runtimeShotPreviewAimSettlingShots ?? 0),
              runtimeShotPreviewTerrainBlockedShots: Number(harnessDriver.runtimeShotPreviewTerrainBlockedShots ?? 0),
              runtimeShotPreviewUnavailableShots: Number(harnessDriver.runtimeShotPreviewUnavailableShots ?? 0),
              runtimeShotPreviewMissShots: Number(harnessDriver.runtimeShotPreviewMissShots ?? 0),
              runtimeShotPreviewWrongTargetShots: Number(harnessDriver.runtimeShotPreviewWrongTargetShots ?? 0),
              lastRuntimeShotPreviewStatus: typeof harnessDriver.lastRuntimeShotPreviewStatus === 'string'
                ? harnessDriver.lastRuntimeShotPreviewStatus
                : null,
              lastRuntimeShotPreviewReason: typeof harnessDriver.lastRuntimeShotPreviewReason === 'string'
                ? harnessDriver.lastRuntimeShotPreviewReason
                : null,
              lastRuntimeShotPreviewHitTargetId: typeof harnessDriver.lastRuntimeShotPreviewHitTargetId === 'string'
                ? harnessDriver.lastRuntimeShotPreviewHitTargetId
                : null,
              lastRuntimeShotPreviewExpectedInSpatialCandidates: typeof harnessDriver.lastRuntimeShotPreviewExpectedInSpatialCandidates === 'boolean'
                ? harnessDriver.lastRuntimeShotPreviewExpectedInSpatialCandidates
                : null,
              droppedDeadTargetLocks: Number(harnessDriver.droppedDeadTargetLocks ?? 0),
              firingRetargets: Number(harnessDriver.firingRetargets ?? 0),
              firingRetargetFireStops: Number(harnessDriver.firingRetargetFireStops ?? 0),
              firingRetargetEpochs: compactDiagnosticArray(
                harnessDriver.firingRetargetEpochs,
                8,
                { maxDepth: 4, arrayLimit: 4, entryLimit: 48, stringLimit: 180 }
              ),
              shotsFired: Number(harnessDriver.shotsFired ?? 0),
              reloadsIssued: Number(harnessDriver.reloadsIssued ?? 0),
              stuckTeleportCount: Number(harnessDriver.stuckTeleportCount ?? 0),
              maxStuckSeconds: Number(harnessDriver.maxStuckSeconds ?? 0),
              maxViewYawStepDeg: Number(harnessDriver.maxViewYawStepDeg ?? 0),
              maxViewPitchStepDeg: Number(harnessDriver.maxViewPitchStepDeg ?? 0),
              lastViewStepYawDeg: Number(harnessDriver.lastViewStepYawDeg ?? 0),
              lastViewStepPitchDeg: Number(harnessDriver.lastViewStepPitchDeg ?? 0),
              lastRequestedViewYawDeltaDeg: Number(harnessDriver.lastRequestedViewYawDeltaDeg ?? 0),
              lastRequestedViewPitchDeltaDeg: Number(harnessDriver.lastRequestedViewPitchDeltaDeg ?? 0),
              lastRemainingViewYawErrorDeg: Number(harnessDriver.lastRemainingViewYawErrorDeg ?? 0),
              lastRemainingViewPitchErrorDeg: Number(harnessDriver.lastRemainingViewPitchErrorDeg ?? 0),
              lastViewYawClamped: typeof harnessDriver.lastViewYawClamped === 'boolean'
                ? harnessDriver.lastViewYawClamped
                : null,
              lastViewPitchClamped: typeof harnessDriver.lastViewPitchClamped === 'boolean'
                ? harnessDriver.lastViewPitchClamped
                : null,
              lastViewTargetKind: typeof harnessDriver.lastViewTargetKind === 'string'
                ? harnessDriver.lastViewTargetKind
                : null,
              lastViewAnchorResyncChanged: typeof harnessDriver.lastViewAnchorResyncChanged === 'boolean'
                ? harnessDriver.lastViewAnchorResyncChanged
                : null,
              lastViewAnchorResyncYawDeg: nullableNumber(harnessDriver.lastViewAnchorResyncYawDeg),
              lastViewAnchorResyncPitchDeg: nullableNumber(harnessDriver.lastViewAnchorResyncPitchDeg),
              lastViewUpdateAtMs: nullableNumber(harnessDriver.lastViewUpdateAtMs),
              lastAimDot: nullableNumber(harnessDriver.lastAimDot),
              lastFireIntent: typeof harnessDriver.lastFireIntent === 'boolean'
                ? harnessDriver.lastFireIntent
                : null,
              lastAimGatePassed: typeof harnessDriver.lastAimGatePassed === 'boolean'
                ? harnessDriver.lastAimGatePassed
                : null,
              lastAimGateReason: typeof harnessDriver.lastAimGateReason === 'string'
                ? harnessDriver.lastAimGateReason
                : null,
              lastFireLosGatePassed: typeof harnessDriver.lastFireLosGatePassed === 'boolean'
                ? harnessDriver.lastFireLosGatePassed
                : null,
              viewSlewClampCount: Number(harnessDriver.viewSlewClampCount ?? 0),
              viewAnchorResyncCount: Number(harnessDriver.viewAnchorResyncCount ?? 0),
              maxRequestedViewYawDeltaDeg: Number(harnessDriver.maxRequestedViewYawDeltaDeg ?? 0),
              maxRequestedViewPitchDeltaDeg: Number(harnessDriver.maxRequestedViewPitchDeltaDeg ?? 0),
              maxRemainingViewYawErrorDeg: Number(harnessDriver.maxRemainingViewYawErrorDeg ?? 0),
              maxRemainingViewPitchErrorDeg: Number(harnessDriver.maxRemainingViewPitchErrorDeg ?? 0),
              maxViewAnchorResyncYawDeg: Number(harnessDriver.maxViewAnchorResyncYawDeg ?? 0),
              maxViewAnchorResyncPitchDeg: Number(harnessDriver.maxViewAnchorResyncPitchDeg ?? 0),
              largeViewTurnCount: Number(harnessDriver.largeViewTurnCount ?? 0),
              maxAimMovementDivergenceDeg: Number(harnessDriver.maxAimMovementDivergenceDeg ?? 0),
              aimMovementDivergenceSamples: Number(harnessDriver.aimMovementDivergenceSamples ?? 0),
              aimMovementDivergenceOver45Count: Number(harnessDriver.aimMovementDivergenceOver45Count ?? 0),
              gradientProbeDeflections: Number(harnessDriver.gradientProbeDeflections ?? 0),
              waypointsFollowedCount: Number(harnessDriver.waypointsFollowedCount ?? 0),
              waypointReplanFailures: Number(harnessDriver.waypointReplanFailures ?? 0),
              waypointCount: Number(harnessDriver.waypointCount ?? 0),
              waypointIdx: Number(harnessDriver.waypointIdx ?? 0),
              routeTargetResets: Number(harnessDriver.routeTargetResets ?? 0),
              routeNoProgressResets: Number(harnessDriver.routeNoProgressResets ?? 0),
              movementTransitions: Number(harnessDriver.movementTransitions ?? 0),
              objectiveKind: typeof harnessDriver.objectiveKind === 'string'
                ? harnessDriver.objectiveKind
                : null,
              objectiveDistance: nullableNumber(harnessDriver.objectiveDistance),
              objectiveZoneId: typeof harnessDriver.objectiveZoneId === 'string'
                ? harnessDriver.objectiveZoneId
                : null,
              nearestOpforDistance: nullableNumber(harnessDriver.nearestOpforDistance),
              nearestPerceivedEnemyDistance: nullableNumber(harnessDriver.nearestPerceivedEnemyDistance),
              currentTargetDistance: nullableNumber(harnessDriver.currentTargetDistance),
              pathTargetKind: typeof harnessDriver.pathTargetKind === 'string'
                ? harnessDriver.pathTargetKind
                : null,
              pathTargetDistance: nullableNumber(harnessDriver.pathTargetDistance),
              pathQueryStatus: typeof harnessDriver.pathQueryStatus === 'string'
                ? harnessDriver.pathQueryStatus
                : null,
              pathLength: nullableNumber(harnessDriver.pathLength),
              pathFailureReason: typeof harnessDriver.pathFailureReason === 'string'
                ? harnessDriver.pathFailureReason
                : null,
              pathQueryDistance: nullableNumber(harnessDriver.pathQueryDistance),
              pathStartSnapped: typeof harnessDriver.pathStartSnapped === 'boolean'
                ? harnessDriver.pathStartSnapped
                : null,
              pathEndSnapped: typeof harnessDriver.pathEndSnapped === 'boolean'
                ? harnessDriver.pathEndSnapped
                : null,
              pathStartSnapDistance: nullableNumber(harnessDriver.pathStartSnapDistance),
              pathEndSnapDistance: nullableNumber(harnessDriver.pathEndSnapDistance),
              maxPathStartSnapDistance: nullableNumber(harnessDriver.maxPathStartSnapDistance),
              maxPathEndSnapDistance: nullableNumber(harnessDriver.maxPathEndSnapDistance),
              untrustedPathSnapCount: nullableNumber(harnessDriver.untrustedPathSnapCount),
              routeSnapEpochs: compactDiagnosticArray(
                harnessDriver.routeSnapEpochs,
                8,
                { maxDepth: 4, arrayLimit: 4, entryLimit: 48, stringLimit: 180 }
              ),
              routeProgressDistance: nullableNumber(harnessDriver.routeProgressDistance),
              routeProgressAgeMs: nullableNumber(harnessDriver.routeProgressAgeMs),
              routeProgressTravelMeters: nullableNumber(harnessDriver.routeProgressTravelMeters),
              firstObjectiveDistance: nullableNumber(harnessDriver.firstObjectiveDistance),
              minObjectiveDistance: nullableNumber(harnessDriver.minObjectiveDistance),
              objectiveDistanceClosed: nullableNumber(harnessDriver.objectiveDistanceClosed),
              playerDistanceMoved: nullableNumber(harnessDriver.playerDistanceMoved),
              movementIntentCalls: nullableNumber(harnessDriver.movementIntentCalls),
              nonZeroMovementIntentCalls: nullableNumber(harnessDriver.nonZeroMovementIntentCalls),
              lastMovementIntent: compactDiagnosticObject(
                harnessDriver.lastMovementIntent,
                { maxDepth: 4, arrayLimit: 4, entryLimit: 32, stringLimit: 160 }
              ),
              lastNonZeroMovementIntent: compactDiagnosticObject(
                harnessDriver.lastNonZeroMovementIntent,
                { maxDepth: 4, arrayLimit: 4, entryLimit: 32, stringLimit: 160 }
              ),
              runtimeLiveness: normalizeRuntimeLiveness(harnessDriver.runtimeLiveness),
              weaponHarness: compactDiagnosticObject(
                harnessDriver.weaponHarness,
                { maxDepth: 4, arrayLimit: 4, entryLimit: 48, stringLimit: 180 }
              ),
              perceptionRange: nullableNumber(harnessDriver.perceptionRange),
              matchEndedAtMs: nullableNumber(harnessDriver.matchEndedAtMs),
              matchOutcome: typeof harnessDriver.matchOutcome === 'string'
                ? (harnessDriver.matchOutcome as 'victory' | 'defeat' | 'draw')
                : null,
              damageDealt: Number(harnessDriver.damageDealt ?? 0),
              damageTaken: Number(harnessDriver.damageTaken ?? 0),
              kills: Number(harnessDriver.kills ?? 0),
              accuracy: Number(harnessDriver.accuracy ?? 0),
              engineShotsFired: Number(harnessDriver.engineShotsFired ?? 0),
              engineShotsHit: Number(harnessDriver.engineShotsHit ?? 0),
              stateHistogramMs: harnessDriver.stateHistogramMs && typeof harnessDriver.stateHistogramMs === 'object'
                ? Object.fromEntries(
                    Object.entries(harnessDriver.stateHistogramMs).map(([k, v]: [string, any]) => [
                      String(k),
                      Number(v ?? 0)
                    ])
                  )
                : {}
            } : undefined,
            systemTop: Array.isArray(report?.systemBreakdown)
              ? report.systemBreakdown.slice(0, 8).map((s: any) => ({
                  name: String(s.name ?? 'unknown'),
                  emaMs: Number(s.emaMs ?? 0),
                  peakMs: Number(s.peakMs ?? 0)
                }))
              : [],
            systemBreakdown: Array.isArray(report?.systemBreakdown)
              ? report.systemBreakdown.map((s: any) => ({
                  name: String(s.name ?? 'unknown'),
                  budgetMs: Number(s.budgetMs ?? 0),
                  lastMs: Number(s.lastMs ?? 0),
                  emaMs: Number(s.emaMs ?? 0),
                  peakMs: Number(s.peakMs ?? 0)
                }))
              : []
          };
        }, {
          shouldIncludeDetails: includeDetails,
          shouldCaptureSceneAttribution,
          shouldCaptureRenderSubmissions,
          renderSubmissionMode: runtimeRenderSubmissionMode,
          sceneAttributionEvaluateSource: PROJEKT_143_SCENE_ATTRIBUTION_EVALUATE_SOURCE
        }), 8000);
        probeRoundTripMs.push(Date.now() - probeStart);
        sample = { ts: nowIso(), ...raw };
        sampleTick++;
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        const message = (rawMessage.split('\n')[0] || 'unknown runtime sample error').slice(0, 220);
        missedSampleErrors[message] = (missedSampleErrors[message] ?? 0) + 1;
        if (missedSamples < 3 || missedSamples % 5 === 4) {
          logStep(`⚠ Runtime sample missed: ${message}`);
        }
        missedSamples++;
        sampleTick++;
      }

      if (sample) {
        if (sample.renderer) {
          const rendererDrawCalls = Number(sample.renderer.drawCalls ?? 0);
          const rendererFrameCount = Number(sample.frameCount ?? 0);
          if (Number.isFinite(rendererDrawCalls)) {
            sample.renderer.drawCallsSinceLastSample =
              previousRendererDrawCalls !== null && rendererDrawCalls >= previousRendererDrawCalls
                ? rendererDrawCalls - previousRendererDrawCalls
                : null;
            const frameDelta = previousRendererFrameCount !== null && Number.isFinite(rendererFrameCount)
              ? rendererFrameCount - previousRendererFrameCount
              : 0;
            sample.renderer.drawCallsPerFrameSinceLastSample =
              sample.renderer.drawCallsSinceLastSample !== null && frameDelta > 0
                ? sample.renderer.drawCallsSinceLastSample / frameDelta
                : null;
            previousRendererDrawCalls = rendererDrawCalls;
            previousRendererFrameCount = rendererFrameCount;
          }
        }
        runtimeSamples.push(sample);
        finalFrameCount = sample.frameCount;
        await maybeCaptureShotVisualFrame(
          page,
          sample,
          runtimeSamples.length - 1,
          elapsedMs,
          shotVisualCaptureState
        );
        const denialRatePct = Number(sample.combatBreakdown?.raycastBudget?.denialRate ?? 0) * 100;
        const aiStarve = Number(sample.combatBreakdown?.aiScheduling?.aiBudgetExceededEvents ?? 0);
        const drawCalls = Number(sample.renderer?.drawCalls ?? 0);
        const drawCallsSinceLastSample = nullableNumber(sample.renderer?.drawCallsSinceLastSample);
        const drawCallsPerFrame = nullableNumber(sample.renderer?.drawCallsPerFrameSinceLastSample);
        const drawCallsSuffix = drawCallsSinceLastSample !== null
          ? `drawRaw=${drawCalls} drawDelta=${drawCallsSinceLastSample}${drawCallsPerFrame !== null ? ` drawPerFrame=${drawCallsPerFrame.toFixed(1)}` : ''}`
          : `drawRaw=${drawCalls}`;
        const triangles = Number(sample.renderer?.triangles ?? 0);
        const recentLongTasks = Number(sample.browserStalls?.recent?.longTasks?.count ?? 0);
        const recentLoafs = Number(sample.browserStalls?.recent?.longAnimationFrames?.count ?? 0);
        const recentResources = sample.browserStalls?.recent?.resources;
        const recentRafCadence = sample.browserStalls?.recent?.rafCadence;
        const rafCadence = sample.browserStalls?.totals?.rafCadence;
        const combatFireBudget = sample.combatBreakdown?.combatFireRaycastBudget;
        const fireTerrainBlockedFrame = Number(combatFireBudget?.terrainBlockedThisFrame ?? 0);
        const fireTerrainBlockedTotal = Number(combatFireBudget?.totalTerrainBlocked ?? 0);
        const fireTerrainBlockRatePct = Number(combatFireBudget?.terrainBlockRate ?? 0) * 100;
        const vegetation = sample.vegetation;
        let vegetationSuffix = '';
        if (vegetation) {
          const topVegetationTypes = Object.entries(vegetation.byType ?? {})
            .map(([type, stats]) => ({ type, active: Number(stats.active ?? 0) }))
            .filter(entry => entry.active > 0)
            .sort((a, b) => b.active - a.active)
            .slice(0, 3)
            .map(entry => `${entry.type}:${entry.active}`);
          vegetationSuffix = ` veg=${Number(vegetation.activeTotal ?? 0)}/${Number(vegetation.reservedTotal ?? 0)} chunks=${Number(vegetation.chunksTracked ?? 0)}${topVegetationTypes.length > 0 ? ` top=${topVegetationTypes.join(',')}` : ''}`;
        }
        const weather = sample.weather;
        const weatherSuffix = weather
          ? ` weather=${weather.currentState}->${weather.targetState} visualRain=${weather.visualRainEnabled ? 'on' : 'off'} wetness=${weather.surfaceWetnessEnabled ? 'on' : 'off'} rain=${Number(weather.activeRainCount ?? 0)}/${Number(weather.rainCount ?? 0)} opacity=${Number(weather.rainOpacity ?? 0).toFixed(2)} wet=${Number(weather.surfaceWetness ?? 0).toFixed(2)} upload=${(Number(weather.rainMatrixBytesPerFrame ?? 0) / 1024).toFixed(1)}KB`
          : '';
        const rafStutter25Count = Number(rafCadence?.stutter25Count ?? 0);
        const rafHitch33Count = Number(rafCadence?.hitch33Count ?? 0);
        const rafDropped60HzFrames = Number(rafCadence?.estimatedDropped60HzFrames ?? 0);
        const rafDroppedFrameTime60HzMs = Number(rafCadence?.droppedFrameTime60HzMs ?? 0);
        const rafMaxGapMs = Number(rafCadence?.maxGapMs ?? 0);
        const recentRafCount = Number(recentRafCadence?.count ?? 0);
        const recentRafDropped60HzFrames = Number(recentRafCadence?.estimatedDropped60HzFrames ?? 0);
        const recentRafDroppedFrameTime60HzMs = Number(recentRafCadence?.droppedFrameTime60HzMs ?? 0);
        const recentRafMaxGapMs = Number(recentRafCadence?.maxGapMs ?? 0);
        const engineShots = Number(sample.harnessDriver?.engineShotsFired ?? sample.shotsThisSession ?? 0);
        const engineHits = Number(sample.harnessDriver?.engineShotsHit ?? sample.hitsThisSession ?? 0);
        const engineHitRate = engineShots > 0
          ? engineHits / engineShots
          : Number(sample.hitRate ?? 0);
        const triggerShots = Number(sample.harnessDriver?.shotsFired ?? 0);
        const closeStats = sample.closeModelStats;
        let topTerrainStream: NonNullable<RuntimeSample['terrainStreams']>[number] | null = null;
        if (Array.isArray(sample.terrainStreams)) {
          for (const stream of sample.terrainStreams) {
            if (!topTerrainStream) {
              topTerrainStream = stream;
              continue;
            }
            const pendingDelta = Number(stream.pendingUnits ?? 0) - Number(topTerrainStream.pendingUnits ?? 0);
            if (
              pendingDelta > 0 ||
              (pendingDelta === 0 && Number(stream.timeMs ?? 0) > Number(topTerrainStream.timeMs ?? 0))
            ) {
              topTerrainStream = stream;
            }
          }
        }
        const driverReason = typeof sample.harnessDriver?.lastFireProbe?.reason === 'string'
          ? String(sample.harnessDriver?.lastFireProbe?.reason)
          : typeof sample.harnessDriver?.lastFireProbe?.losStatus === 'string'
            ? `los:${String(sample.harnessDriver.lastFireProbe.losStatus)}`
            : typeof sample.harnessDriver?.lastFireLosStatus === 'string'
              ? `los:${sample.harnessDriver.lastFireLosStatus}`
              : '';
        const driverMovement = sample.harnessDriver?.botState
          ? String(sample.harnessDriver.botState)
          : sample.harnessDriver?.movementState
            ? String(sample.harnessDriver.movementState)
            : '';
        const objectiveKind = typeof sample.harnessDriver?.objectiveKind === 'string'
          ? sample.harnessDriver.objectiveKind
          : '';
        const objectiveDistance = Number(sample.harnessDriver?.objectiveDistance);
        const nearestOpforDistance = Number(sample.harnessDriver?.nearestOpforDistance);
        const perceivedDistance = Number(sample.harnessDriver?.nearestPerceivedEnemyDistance);
        const pathTargetKind = typeof sample.harnessDriver?.pathTargetKind === 'string'
          ? sample.harnessDriver.pathTargetKind
          : '';
        const pathTargetDistance = Number(sample.harnessDriver?.pathTargetDistance);
        const pathQueryStatus = typeof sample.harnessDriver?.pathQueryStatus === 'string'
          ? sample.harnessDriver.pathQueryStatus
          : '';
        const pathFailureReason = typeof sample.harnessDriver?.pathFailureReason === 'string'
          ? sample.harnessDriver.pathFailureReason
          : '';
        const pathStartSnapDistance = nullableNumber(sample.harnessDriver?.pathStartSnapDistance);
        const pathEndSnapDistance = nullableNumber(sample.harnessDriver?.pathEndSnapDistance);
        const objectiveSuffix = objectiveKind
          ? ` obj=${objectiveKind}:${Number.isFinite(objectiveDistance) ? objectiveDistance.toFixed(0) : 'na'}m`
          : '';
        const opforSuffix = Number.isFinite(nearestOpforDistance)
          ? ` opfor=${nearestOpforDistance.toFixed(0)}m`
          : '';
        const perceivedSuffix = Number.isFinite(perceivedDistance)
          ? ` perceived=${perceivedDistance.toFixed(0)}m`
          : '';
        const pathSuffix = pathTargetKind || pathQueryStatus
          ? ` path=${pathTargetKind || 'unknown'}:${Number.isFinite(pathTargetDistance) ? pathTargetDistance.toFixed(0) : 'na'}m/${pathQueryStatus || 'unknown'}`
          : '';
        const pathFailureSuffix = pathFailureReason
          ? ` reason=${pathFailureReason}`
          : '';
        const pathSnapSuffix = pathFailureReason && (pathStartSnapDistance !== null || pathEndSnapDistance !== null)
          ? ` snap=${pathStartSnapDistance !== null ? pathStartSnapDistance.toFixed(1) : 'na'}/${pathEndSnapDistance !== null ? pathEndSnapDistance.toFixed(1) : 'na'}m`
          : '';
        const losUnknownTargetChecks = Number(sample.harnessDriver?.losUnknownTargetChecks ?? 0);
        const fireUnknownLosRejectedShots = Number(sample.harnessDriver?.fireUnknownLosRejectedShots ?? 0);
        const losUnknownSuffix = losUnknownTargetChecks > 0 || fireUnknownLosRejectedShots > 0
          ? ` losUnknown=${losUnknownTargetChecks}/${fireUnknownLosRejectedShots}`
          : '';
        const driverSuffix = driverReason || driverMovement || objectiveSuffix || opforSuffix || perceivedSuffix || pathSuffix || pathFailureSuffix
          ? ` driver=${driverMovement || 'unknown'} probe=${driverReason || 'none'}${objectiveSuffix}${opforSuffix}${perceivedSuffix}${pathSuffix}${pathFailureSuffix}${pathSnapSuffix}${losUnknownSuffix}`
          : '';
        const terrainSuffix = topTerrainStream
          ? ` terrain=${topTerrainStream.name}:${Number(topTerrainStream.timeMs ?? 0).toFixed(2)}ms/${Number(topTerrainStream.budgetMs ?? 0).toFixed(2)}ms pending=${Number(topTerrainStream.pendingUnits ?? 0)}`
          : '';
        const renderTerrainStream = Array.isArray(sample.terrainStreams)
          ? sample.terrainStreams.find(stream => stream.name === 'render')
          : null;
        const renderTerrainDebug = renderTerrainStream?.debug as Record<string, unknown> | undefined;
        const lateSyncSubmissions = Number(renderTerrainDebug?.lateSyncInstanceSubmissions ?? 0);
        const terrainSyncSuffix = renderTerrainDebug && lateSyncSubmissions > 0
          ? ` terrainSync=late:${lateSyncSubmissions} same=${Number(renderTerrainDebug.lateSyncSameIdentitySubmissions ?? 0)} dyn=${Number(renderTerrainDebug.lateSyncDynamicsChangedSubmissions ?? 0)} tile=${Number(renderTerrainDebug.lateSyncTileSetChangedSubmissions ?? 0)} lastSel=${Number(renderTerrainDebug.lastSelectionMs ?? 0).toFixed(2)}ms lastUpload=${Number(renderTerrainDebug.lastUpdateInstancesMs ?? 0).toFixed(2)}ms`
          : '';
        const heightAwareTerrainSuffix = renderTerrainDebug?.heightAwareFrustumEnabled === true
          ? ` terrainHA=${String(renderTerrainDebug.heightBoundsSource ?? 'unknown')} rej:${Number(renderTerrainDebug.selectionHeightBoundsRejectedNodes ?? 0)}/${Number(renderTerrainDebug.selectionFrustumRejectedNodes ?? 0)} tests=${Number(renderTerrainDebug.selectionHeightBoundsTests ?? 0)} fallbacks=${Number(renderTerrainDebug.selectionHeightBoundsFallbacks ?? 0)}`
          : '';
        const closeModelSuffix = closeStats
          ? ` close=${closeStats.renderedCloseModels}/${closeStats.candidatesWithinCloseRadius} active=${closeStats.activeCloseModels}/${closeStats.closeModelActiveCap} promo=${closeStats.promotionsThisFrame}/${closeStats.promotionBudgetPerFrame} repl=${closeStats.replacementsThisFrame} fallback=${closeStats.fallbackCount} poolLoads=${closeStats.poolLoads}`
          : '';
        const simLaneTransitions = sample.combatBreakdown?.aiScheduling?.simLaneTransitions;
        const simLaneSuffix = simLaneTransitions
          && (simLaneTransitions.total > 0 || simLaneTransitions.maxRenderedLagMeters > 0)
          ? ` simLane=${simLaneTransitions.total} up=${simLaneTransitions.towardHigherFidelity} down=${simLaneTransitions.towardLowerFidelity} lag=${simLaneTransitions.maxRenderedLagMeters.toFixed(1)}m transLag=${simLaneTransitions.maxTransitionRenderedLagMeters.toFixed(1)}m`
          : '';
        const resourceEntries = Array.isArray(recentResources?.entries) ? recentResources.entries : [];
        const latestResource = resourceEntries.length > 0
          ? resourceEntries[resourceEntries.length - 1]
          : null;
        const latestResourceName = latestResource?.name
          ? latestResource.name.split('/').pop()?.slice(0, 48) ?? ''
          : '';
        const resourceSuffix = Number(recentResources?.count ?? 0) > 0
          ? ` res=${Number(recentResources?.count ?? 0)} max=${Number(recentResources?.maxDurationMs ?? 0).toFixed(1)}ms${latestResourceName ? ` last=${latestResourceName}` : ''}`
          : '';
        const recentRafSuffix = recentRafCount > 0
          ? ` rafRecent=${recentRafCount}/${recentRafDropped60HzFrames}/${recentRafDroppedFrameTime60HzMs.toFixed(1)}ms@${recentRafMaxGapMs.toFixed(1)}ms`
          : '';
        const gpuSuffix = gpuTiming && sample.gpu
          ? ` gpu=${sample.gpu.available ? `${sample.gpu.gpuTimeMs.toFixed(2)}ms` : 'unavailable'} backend=${sample.rendererBackend?.resolvedBackend ?? 'unknown'}`
          : '';
        const fireTerrainBlockSuffix = fireTerrainBlockedFrame > 0 || fireTerrainBlockedTotal > 0
          ? ` fireTerrainBlock=${fireTerrainBlockedFrame}/${fireTerrainBlockedTotal} ${fireTerrainBlockRatePct.toFixed(1)}%`
          : '';
        logStep(`sample frame=${sample.frameCount} avg=${sample.avgFrameMs.toFixed(2)}ms p99=${Number(sample.p99FrameMs ?? 0).toFixed(2)}ms max=${Number(sample.maxFrameMs ?? 0).toFixed(2)}ms h33=${Number(sample.hitch33Count ?? 0)} h50=${Number(sample.hitch50Count ?? 0)} raf25=${rafStutter25Count} raf33=${rafHitch33Count} rafDrop60=${rafDropped60HzFrames} rafDropTime60=${rafDroppedFrameTime60HzMs.toFixed(1)}ms rafMax=${rafMaxGapMs.toFixed(1)}ms${recentRafSuffix} shots=${engineShots} hits=${engineHits} hitRate=${(engineHitRate * 100).toFixed(1)}% trigger=${triggerShots} ${drawCallsSuffix} tri=${triangles}${gpuSuffix} rayDeny=${denialRatePct.toFixed(1)}%${fireTerrainBlockSuffix} aiStarve=${aiStarve}${simLaneSuffix} longTasks=${recentLongTasks} loafs=${recentLoafs}${resourceSuffix}${terrainSuffix}${terrainSyncSuffix}${heightAwareTerrainSuffix}${vegetationSuffix}${weatherSuffix}${closeModelSuffix}${driverSuffix}`);
        // harness-lifecycle-halt-on-match-end: latch the first match-end
        // observation, then break the loop after MATCH_END_TAIL_MS so we
        // finalize close to the moment the engine declared a winner instead
        // of running on into the victory screen.
        const reportedMatchEnded = sample.harnessDriver?.matchEndedAtMs;
        if (matchEndedAtRelMs === null && typeof reportedMatchEnded === 'number' && Number.isFinite(reportedMatchEnded)) {
          matchEndedAtRelMs = Math.max(0, Date.now() - startMs);
          matchOutcome = sample.harnessDriver?.matchOutcome ?? 'draw';
          logStep(`🏁 Match ended at t=${(matchEndedAtRelMs / 1000).toFixed(1)}s (outcome=${matchOutcome}); finalizing in ${(MATCH_END_TAIL_MS / 1000).toFixed(1)}s`);
        }
        if (shouldFinalizeAfterMatchEnd(matchEndedAtRelMs, Date.now() - startMs)) {
          break;
        }
      }
    }
    if (missedSamples > 0) {
      logStep(`⚠ Missed ${missedSamples} runtime samples due to main-thread blocking`);
    }

    // Force GC before final heap measurement for reliable recovery ratios
    if (cdpStarted && cdp && page && runtimeSamples.length > 0) {
      try {
        const gcFinal = await forceGCAndMeasureHeap(cdp, page);
        logStep(`📊 Forced-GC final heap: ${gcFinal.heapUsedMb.toFixed(2)} MB`);
        // Override last sample's heap values with GC'd measurement
        const lastSample = runtimeSamples[runtimeSamples.length - 1];
        lastSample.heapUsedMb = gcFinal.heapUsedMb;
        lastSample.heapTotalMb = gcFinal.heapTotalMb;
      } catch {
        logStep('⚠ Forced GC final measurement failed');
      }
    }

    // Stop the active scenario driver here (before CDP teardown) so we
    // can capture its final combat stats — kills, damage dealt/taken,
    // accuracy, state histogram — into summary.json. The cleanup-context
    // stage in finally{} also tries to stop, but by then
    // `__perfHarnessDriverState` is null and that call is a no-op.
    if (page && activeScenarioStarted && !harnessDriverFinal) {
      harnessDriverFinal = await stopActiveScenarioDriver(page);
    }

    stage = 'stop-cdp';
    let cpuProfile: any = null;
    let heapProfile: any = null;
    const shouldAttemptHeavyCdpShutdown = startupState.started && missedSamples === 0;
    if (cdpStarted && cdp && shouldAttemptHeavyCdpShutdown) {
      if (cdpProfiler) {
        try {
          cpuProfile = await withTimeout('Profiler.stop', cdp.send('Profiler.stop'), CDP_STOP_TIMEOUT_MS);
        } catch (error) {
          logStep(`⚠ Profiler.stop failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (cdpHeapSampling) {
        try {
          heapProfile = await withTimeout('HeapProfiler.stopSampling', cdp.send('HeapProfiler.stopSampling'), CDP_STOP_TIMEOUT_MS);
        } catch (error) {
          logStep(`⚠ HeapProfiler.stopSampling failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (chromeTracingStarted && !chromeTracingStopped) {
        try {
          chromeTrace = await stopChromeTracing(cdp);
          chromeTracingStopped = true;
        } catch (error) {
          logStep(`⚠ stopChromeTracing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } else if (cdpStarted) {
      logStep('⚠ Skipping heavy CDP shutdown capture due unstable startup or blocked runtime samples');
    }
    const hitValidationMode: 'strict' | 'relaxed' | 'critical' | 'off' =
      enableCombat && activePlayerScenario
        ? (requestedMode === 'open_frontier' ? 'critical' : requestedMode === 'a_shau_valley' ? 'relaxed' : 'strict')
        : 'off';
    const baseModeThresholds = enableCombat && activePlayerScenario
      ? HARNESS_MODE_THRESHOLDS[requestedMode] ?? null
      : null;
    const modeThresholds = baseModeThresholds
      ? scaleModeThresholdsForDuration(baseModeThresholds, durationSeconds)
      : null;
    validation = validateRun(runtimeSamples, consoleEntries, durationSeconds, {
      hitValidation: hitValidationMode,
      sampleIntervalMs,
      modeThresholds,
      harnessDriverFinal,
      requireCloseModelEnvelope: enableCombat
        && activePlayerScenario
        && !disableNpcCloseModels
        && (requestedMode === 'open_frontier' || requestedMode === 'a_shau_valley')
    });
    if (!startupState.started) {
      validation.checks.push({
        id: 'startup_stabilized',
        status: 'fail',
        value: startupState.lastFrameCount,
        message: startupState.reason ?? 'Startup rendering did not stabilize'
      });
      validation.overall = 'fail';
    } else {
      if (typeof startupState.thresholdReachedSec === 'number') {
        const sec = startupState.thresholdReachedSec;
        validation.checks.push({
          id: 'startup_threshold_seconds',
          status: sec < 10 ? 'pass' : sec < 25 ? 'warn' : 'warn',
          value: sec,
          message: `Startup frame threshold reached in ${sec.toFixed(1)}s`
        });
      }
      if (runtimePreflight && runtimePreflightResult.totalMs > 0) {
        const sec = runtimePreflightResult.totalMs / 1000;
        validation.checks.push({
          id: 'toolchain_prewarm_seconds',
          status: sec < 10 ? 'pass' : sec < 30 ? 'warn' : 'warn',
          value: sec,
          message: `Runtime preflight cold cost ${sec.toFixed(1)}s (toolchain/runtime warmup)`
        });
      }
      validation.overall = getOverallStatus(validation.checks);
    }
    addPressureReadyWarmupValidation(validation, pressureReadyWarmupResult);
    measurementTrust = computeMeasurementTrust({
      probeRoundTripMs,
      runtimeSampleCount: runtimeSamples.length,
      missedSamples,
      sampleIntervalMs,
      detailEverySamples,
      rendererBackend: latestRendererBackend(runtimeSamples),
      headed,
      scenarioMode: requestedMode,
      rendererMode
    });
    validation.checks.push(measurementTrustValidationCheck(measurementTrust));
    validation.overall = getOverallStatus(validation.checks);

    armHardTimeout(POST_CAPTURE_HARD_TIMEOUT_MS);
    stage = 'write-artifacts';
    if (page) {
      movementViewerPayload = await safeAwait(
        'movement-viewer-payload',
        captureMovementViewerPayload(page),
        10_000
      );
      movementArtifacts = movementViewerPayload?.movementArtifacts ?? null;
      sceneAttribution = await safeAwait(
        'scene-attribution',
        captureSceneAttribution(page),
        10_000
      );
      if (sceneAttribution) {
        writeFileSync(join(artifactDir, 'scene-attribution.json'), JSON.stringify(sceneAttribution, null, 2), 'utf-8');
      }
      if (movementArtifacts) {
        writeFileSync(join(artifactDir, 'movement-artifacts.json'), JSON.stringify(movementArtifacts, null, 2), 'utf-8');
      }
      if (movementViewerPayload?.terrainContext) {
        writeFileSync(join(artifactDir, 'movement-terrain-context.json'), JSON.stringify(movementViewerPayload.terrainContext, null, 2), 'utf-8');
        writeFileSync(
          join(artifactDir, 'movement-viewer.html'),
          renderMovementArtifactViewerHtml(movementViewerPayload.movementArtifacts, movementViewerPayload.terrainContext),
          'utf-8'
        );
      }
    }
    if (cpuProfile?.profile) {
      writeFileSync(join(artifactDir, 'cpu-profile.cpuprofile'), JSON.stringify(cpuProfile.profile, null, 2), 'utf-8');
    }
    if (heapProfile?.profile) {
      writeFileSync(join(artifactDir, 'heap-sampling.json'), JSON.stringify(heapProfile.profile, null, 2), 'utf-8');
    }
    if (chromeTrace.length > 0) {
      writeFileSync(join(artifactDir, 'chrome-trace.json'), chromeTrace, 'utf-8');
    }
    if (measurementTrust) {
      writeFileSync(join(artifactDir, 'measurement-trust.json'), JSON.stringify(measurementTrust, null, 2), 'utf-8');
    }
    writeFileSync(join(artifactDir, 'validation.json'), JSON.stringify(validation, null, 2), 'utf-8');
    if (startupDiagnostics) {
      writeFileSync(join(artifactDir, 'startup-diagnostics.json'), JSON.stringify(startupDiagnostics, null, 2), 'utf-8');
    }
    if (startupTimeline) {
      writeFileSync(join(artifactDir, 'startup-timeline.json'), JSON.stringify(startupTimeline, null, 2), 'utf-8');
    }

    const screenshotPath = join(artifactDir, startupState.started ? 'final-frame.png' : 'startup-failed-frame.png');
    await safeAwait(
      startupState.started ? 'page.screenshot' : 'page.screenshot.startup-failed',
      page.screenshot({ path: screenshotPath, fullPage: false }),
      3_000
    );
    stage = 'stop-playwright-trace';
    if (playwrightTracingStarted) {
      await safeAwait('context.tracing.stop', context.tracing.stop({ path: join(artifactDir, 'playwright-trace.zip') }), 10_000);
    }
    if (validation.overall === 'fail') {
      throw new Error('Validation failed (see validation.json)');
    }
  } catch (error) {
    failureReason = error instanceof Error ? error.message : String(error);
    logStep(`❌ Capture failed: ${failureReason}`);
  } finally {
    stage = 'finalize';
    try {
      if (!measurementTrust) {
        measurementTrust = computeMeasurementTrust({
          probeRoundTripMs,
          runtimeSampleCount: runtimeSamples.length,
          missedSamples,
          sampleIntervalMs,
          detailEverySamples,
          rendererBackend: startupDiagnostics?.rendererBackend ?? latestRendererBackend(runtimeSamples),
          headed,
          scenarioMode: requestedMode,
          rendererMode
        });
      }
      if (page) {
        finalPresentationEpochs = await safeAwait(
          'presentation-epochs',
          page.evaluate(() => {
            const epochs = (window as any).__perfHarnessObservers?.getPresentationEpochs?.({ limit: 4096 }) ?? [];
            return Array.isArray(epochs) ? epochs : [];
          }) as Promise<Record<string, unknown>[]>,
          3_000
        ) ?? finalPresentationEpochs;
        if (finalPresentationEpochs.length > 0) {
          writeFileSync(
            join(artifactDir, 'presentation-epochs.json'),
            JSON.stringify(finalPresentationEpochs, null, 2),
            'utf-8'
          );
        }
        writeFileSync(join(artifactDir, 'console.json'), JSON.stringify(consoleEntries, null, 2), 'utf-8');
        writeFileSync(join(artifactDir, 'runtime-samples.json'), JSON.stringify(runtimeSamples, null, 2), 'utf-8');
        const runtimeSceneAttributionSamples = collectRuntimeSceneAttributionSamples(runtimeSamples);
        if (runtimeSceneAttributionSamples.length > 0) {
          writeFileSync(
            join(artifactDir, 'runtime-scene-attribution-samples.json'),
            JSON.stringify(runtimeSceneAttributionSamples, null, 2),
            'utf-8'
          );
        }
        const runtimeRenderSubmissionSamples = collectRuntimeRenderSubmissionSamples(runtimeSamples);
        if (runtimeRenderSubmissionSamples.length > 0) {
          writeFileSync(
            join(artifactDir, 'runtime-render-submission-samples.json'),
            JSON.stringify(runtimeRenderSubmissionSamples, null, 2),
            'utf-8'
          );
        }
      }
      writeFileSync(join(artifactDir, 'measurement-trust.json'), JSON.stringify(measurementTrust, null, 2), 'utf-8');
      if (validation.checks.length === 0) {
        validation = {
          overall: 'fail',
          checks: [
            {
              id: 'capture_completed',
              status: 'fail',
              value: 0,
              message: failureReason ?? 'Capture failed before validation'
            },
            {
              id: 'samples_collected',
              status: runtimeSamples.length > 0 ? 'warn' : 'fail',
              value: runtimeSamples.length,
              message: `Collected ${runtimeSamples.length} runtime samples`
            }
          ]
        };
      }
      if (!validation.checks.some(check => check.id === 'measurement_trust')) {
        validation.checks.push(measurementTrustValidationCheck(measurementTrust));
        validation.overall = getOverallStatus(validation.checks);
      }
      writeFileSync(join(artifactDir, 'validation.json'), JSON.stringify(validation, null, 2), 'utf-8');
      writeShotVisualCaptureManifest(shotVisualCaptureState);
      const latestTerrainRecoveryEvents = objectArray(
        runtimeSamples[runtimeSamples.length - 1]?.terrainRecoveryEvents,
        64,
      );
      const latestMaterializationTierEvents = objectArray(
        runtimeSamples[runtimeSamples.length - 1]?.materializationTierEvents,
        128,
      );
      const latestTerrainDebug = latestTerrainRenderDebug(runtimeSamples);
      const runtimeTerrainHeightAwareFrustum = typeof latestTerrainDebug?.heightAwareFrustumEnabled === 'boolean'
        ? Boolean(latestTerrainDebug.heightAwareFrustumEnabled)
        : undefined;
      const runtimeTerrainHeightBoundsSource = typeof latestTerrainDebug?.heightBoundsSource === 'string'
        ? latestTerrainDebug.heightBoundsSource
        : undefined;
      const runtimeTerrainHeightBoundsTests = terrainDebugNumber(latestTerrainDebug, 'selectionHeightBoundsTests');
      const runtimeTerrainHeightBoundsFallbacks = terrainDebugNumber(latestTerrainDebug, 'selectionHeightBoundsFallbacks');
      const runtimeTerrainHeightBoundsRejectedNodes = terrainDebugNumber(latestTerrainDebug, 'selectionHeightBoundsRejectedNodes');
      const runtimeTerrainPlayableWorldSize = terrainDebugNumber(latestTerrainDebug, 'playableWorldSize');
      const runtimeTerrainVisualWorldSize = terrainDebugNumber(latestTerrainDebug, 'visualWorldSize');
      const runtimeTerrainVisualMargin = terrainDebugNumber(latestTerrainDebug, 'visualMargin');
      const runtimeTerrainMaxLODLevels = terrainDebugNumber(latestTerrainDebug, 'maxLODLevels');
      const runtimeTerrainLodRange0 = terrainDebugNumber(latestTerrainDebug, 'lodRange0');
      const runtimeTerrainLodRangeLast = terrainDebugNumber(latestTerrainDebug, 'lodRangeLast');
      const runtimeTerrainLod0VertexSpacing = terrainDebugNumber(latestTerrainDebug, 'lod0VertexSpacing');
      const summary: CaptureSummary = {
        startedAt,
        endedAt: nowIso(),
        sourceGitSha,
        sourceGitStatus,
        captureEnvironment,
        durationSeconds,
        npcs: effectiveNpcs,
        requestedNpcs: npcs,
        url,
        status: failureReason ? 'failed' : 'ok',
        failureReason,
        finalFrameCount,
        artifactDir,
        validation,
        lastStage: stage,
        scenario: {
          mode: startupState.started ? requestedMode : 'unknown',
          requestedMode,
          playerExperience: enableCombat
            ? activePlayerScenario
              ? requestedMode === 'a_shau_valley'
                ? 'Automated valley-scale mil-sim firefight with scripted movement/fire behavior over long travel corridors; active harness can be configured for realistic damage/death handling.'
                : 'Automated large-scale jungle firefight with scripted player movement/firing, forced ground-level engagement, and instant respawn to keep sampling in active combat.'
              : 'Automated large-scale jungle firefight with active AI squads, combat simulation, terrain streaming, and rendering load; no objective play loop focus.'
            : 'Automated sandbox flywheel with combat AI disabled for control baseline (render/terrain/harness overhead isolation).',
          systemsEmphasized: enableCombat
            ? activePlayerScenario
              ? requestedMode === 'open_frontier' || requestedMode === 'a_shau_valley'
                ? ['Combat AI', 'Large-world objective flow', 'Player input/fire loop', 'Respawn pipeline', 'Terrain chunking', 'Core frame scheduling']
                : ['Combat AI', 'Player input/fire loop', 'Respawn pipeline', 'Terrain chunking', 'Core frame scheduling']
              : requestedMode === 'open_frontier' || requestedMode === 'a_shau_valley'
                ? ['Combat AI', 'Large-world objective flow', 'Terrain chunking', 'Billboard rendering', 'Core frame scheduling']
                : ['Combat AI', 'Combat updates', 'Terrain chunking', 'Billboard rendering', 'Core frame scheduling']
            : ['Terrain chunking', 'Billboard rendering', 'Core frame scheduling', 'Harness overhead baseline']
        },
        harnessOverhead: {
          probeRoundTripAvgMs: average(probeRoundTripMs),
          probeRoundTripP95Ms: percentile(probeRoundTripMs, 0.95),
          sampleCount: probeRoundTripMs.length,
          sampleIntervalMs,
          detailEverySamples,
          missedSampleErrors: Object.keys(missedSampleErrors).length > 0 ? missedSampleErrors : undefined
        },
        measurementTrust,
        rendererBackend: latestRendererBackend(runtimeSamples),
        gpuTiming: summarizeGpuTiming(runtimeSamples, gpuTiming, gpuTimingQueryEnabled),
        droppedFrameMetrics: summarizeDroppedFrames(runtimeSamples, durationSeconds),
        renderSubmissionMetrics: summarizeRenderSubmissions(runtimeSamples),
        materializationTierMetrics: summarizeMaterializationTierEvents(runtimeSamples),
        simLaneTransitionMetrics: summarizeSimLaneTransitions(runtimeSamples),
        closeModelEnvelope: summarizeCloseModelEnvelope(runtimeSamples),
        presentationGapContexts: summarizePresentationGapContexts(
          runtimeSamples,
          finalPresentationEpochs,
          { finalSceneAttribution: sceneAttribution },
        ),
        sceneAttribution: sceneAttribution ?? undefined,
        startupTiming: {
          firstEngineSeenSec: startupState.firstEngineSeenSec,
          firstMetricsSeenSec: startupState.firstMetricsSeenSec,
          thresholdReachedSec: startupState.thresholdReachedSec,
          lastStartupMark: startupState.lastStartupMark,
          lastStartupMarkMs: startupState.lastStartupMarkMs
        },
        toolchain: {
          prewarmEnabled: prewarm,
          prewarmTotalMs: prewarmResult.totalMs,
          prewarmAllOk: prewarmResult.allOk,
          runtimePreflightEnabled: runtimePreflight,
          runtimePreflightMs: runtimePreflightResult.totalMs,
          runtimePreflightOk: runtimePreflightResult.ok
        },
        perfRuntime: {
          matchDurationSeconds: perfMatchDurationSeconds ?? undefined,
          presentationContextCapture,
          pressureReadyWarmupRequested: pressureReadyWarmupResult.requested,
          pressureReadyWarmupStatus: pressureReadyWarmupResult.status,
          pressureReadyWarmupTimeoutSeconds: pressureReadyWarmupResult.timeoutSeconds,
          pressureReadyWarmupElapsedMs: pressureReadyWarmupResult.elapsedMs,
          pressureReadyWarmupSamples: pressureReadyWarmupResult.samples,
          pressureReadyWarmupConsecutiveReadySamples: pressureReadyWarmupResult.consecutiveReadySamples,
          pressureReadyWarmupReason: pressureReadyWarmupResult.reason,
          pressureReadyWarmupLastSnapshot: pressureReadyWarmupResult.lastSnapshot ?? undefined,
          weatherStateOverride: weatherStateOverride === 'default' ? undefined : weatherStateOverride,
          frontlineCompressionRequested: compressFrontline,
          victoryConditionsDisabled: disableVictory,
          npcCloseModelsDisabled: disableNpcCloseModels,
          terrainShadowsDisabled: disableTerrainShadows,
          terrainShadowPassMode,
          terrainFullShadowPassEnabled: terrainFullShadowPass,
          boundedTerrainShadowPassEnabled: !terrainFullShadowPass,
          boundedTerrainShadowPassRequested: boundedTerrainShadowPass,
          terrainForceInstanceUploadEnabled: terrainForceInstanceUpload,
          terrainHeightAwareFrustumRequested: terrainHeightAwareFrustum,
          terrainHeightAwareFrustumDisabled: disableTerrainHeightAwareFrustum,
          terrainHeightAwareFrustumEnabled: runtimeTerrainHeightAwareFrustum,
          terrainHeightBoundsSource: runtimeTerrainHeightBoundsSource,
          terrainHeightBoundsTests: runtimeTerrainHeightBoundsTests,
          terrainHeightBoundsFallbacks: runtimeTerrainHeightBoundsFallbacks,
          terrainHeightBoundsRejectedNodes: runtimeTerrainHeightBoundsRejectedNodes,
          terrainPlayableWorldSize: runtimeTerrainPlayableWorldSize,
          terrainVisualWorldSize: runtimeTerrainVisualWorldSize,
          terrainVisualMargin: runtimeTerrainVisualMargin,
          terrainMaxLODLevels: runtimeTerrainMaxLODLevels,
          terrainLodRange0: runtimeTerrainLodRange0,
          terrainLodRangeLast: runtimeTerrainLodRangeLast,
          terrainLod0VertexSpacing: runtimeTerrainLod0VertexSpacing,
          terrainFullSkirtsRequested: terrainFullSkirts,
          terrainSparseSkirtsRequested: terrainSparseSkirts,
          terrainSkirtsDisabled: disableTerrainSkirts,
          terrainFarCanopyTintDisabled: disableTerrainFarCanopyTint,
          terrainLowSunOcclusionDisabled: disableTerrainLowSunOcclusion,
          wildlifeDisabled: disableWildlife
        },
        matchEndedAtMs: matchEndedAtRelMs,
        matchOutcome: matchOutcome,
        harnessDriverFinal: harnessDriverFinal ?? undefined,
        terrainRecoveryEvents: latestTerrainRecoveryEvents.length > 0
          ? latestTerrainRecoveryEvents
          : undefined,
        materializationTierEvents: latestMaterializationTierEvents.length > 0
          ? latestMaterializationTierEvents
          : undefined,
        shotVisualCaptures: shotVisualCaptureState.captures.length > 0
          ? shotVisualCaptureState.captures
          : undefined,
        tailAttribution: computeTailAttribution(runtimeSamples, {
          presentationEpochs: finalPresentationEpochs,
          finalSceneAttribution: sceneAttribution,
          runtimeSamples
        })
      };
      writeFileSync(join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
      if (summary.tailAttribution) {
        console.log(`\n[tail-attribution] ${summary.tailAttribution.conclusion}`);
      }
      console.log(`\nArtifacts: ${artifactDir}`);
    } catch {
      // best effort only
    }
    stage = 'cleanup-context';
    // The early stop above (before stop-cdp) usually catches the
    // driver. If we got here without one (e.g. an early throw before
    // the early-stop point), make sure the in-page driver is torn down
    // so the next run doesn't inherit it.
    if (page && activeScenarioStarted && !harnessDriverFinal) {
      harnessDriverFinal = await stopActiveScenarioDriver(page);
    }
    if (context) {
      await safeAwait('context.close', context.close(), 10_000);
    }
    stage = 'cleanup-server';
    if (server && startedServer && !reuseServer) {
      await safeAwait('stopServer', stopServer(server), 12_000);
    } else if (server && startedServer && reuseServer) {
      logStep(`♻ Leaving ${serverMode} server running for reuse`);
    }
    forceKillPlaywrightBrowsers(browserProfileDir);
    if (hardTimeout) {
      clearTimeout(hardTimeout);
    }
    if (signalHandlersInstalled) {
      process.off('SIGINT', handleProcessSignal);
      process.off('SIGTERM', handleProcessSignal);
    }
    releaseRunLock();
  }

  if (failureReason) throw new Error(failureReason);
}

runCapture()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Capture failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
