// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Logger } from '../utils/Logger';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import type { GameEngine } from './GameEngine';
import type * as THREE from 'three';
import { isPerfDiagnosticsEnabled, isPerfHarnessEnabled, isPerfUserTimingEnabled } from './PerfDiagnostics';
import {
  recordPresentationCameraEpoch,
  resetPresentationEpochContext,
  type PresentationTerrainSyncEpoch,
} from './PresentationEpochRecorder';
import { summarizeVegetationDebugInfo } from './RuntimeDebugStats';

// Crash tracking for frame loop resilience
let crashCount = 0;
let lastCrashTime = 0;
const CRASH_WINDOW_MS = 5000; // 5 seconds
const MAX_CRASHES = 3;
let errorOverlayShown = false;
const LOOP_FRAME_BREAKDOWN_LIMIT = 64;
const LOOP_FRAME_BREAKDOWN_THRESHOLD_MS = 25;
const LOOP_CALLBACK_BREAKDOWN_THRESHOLD_MS = 16.67;
const LOOP_FRAME_SYSTEM_TIMING_LIMIT = 12;
const LOOP_FRAME_TELEMETRY_TIMING_LIMIT = 16;
const LOOP_PERFORMANCE_OVERLAY_TIMING_LIMIT = 12;

type LoopFrameSegments = Record<string, number>;

interface LoopSystemTimingSnapshot {
  name: string;
  lastMs: number;
  emaMs: number;
  budgetMs: number;
  overBudget: boolean;
}

interface LoopTelemetryTimingSnapshot extends LoopSystemTimingSnapshot {
  peakMs: number;
}

interface LoopFrameBreakdownEntry {
  frameCount: number | null;
  startedAtMs: number;
  endedAtMs: number;
  timestampDeltaMs: number;
  callbackDurationMs: number;
  segmentTotalMs: number;
  unmeasuredCallbackMs: number;
  segments: LoopFrameSegments;
  systemTimings: LoopSystemTimingSnapshot[];
  telemetryTimings: LoopTelemetryTimingSnapshot[];
  combatTiming?: LoopCombatTimingSnapshot;
}

interface LoopFrameBreakdownStore {
  push(entry: LoopFrameBreakdownEntry): void;
  drain(): LoopFrameBreakdownEntry[];
  getSnapshot(): LoopFrameBreakdownEntry[];
  reset(): void;
}

interface LoopCombatTimingSnapshot {
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
  engagingCount: number;
  firingCount: number;
  losCache?: {
    hits: number;
    misses: number;
    hitRate: number;
    budgetDenials: number;
    prefilterPasses: number;
    prefilterRejects: number;
    fullEvaluations: number;
    terrainRaycasts: number;
    fullEvaluationClear: number;
    fullEvaluationBlocked: number;
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
  };
}

let activeLoopFrameSegments: LoopFrameSegments | null = null;
let activeLoopFrameSegmentTotalMs = 0;

function finiteNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function shouldRecordLoopFrameBreakdown(): boolean {
  const perfHarnessBuild = import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1';
  // Plain perf captures need hitch attribution without enabling UserTiming or
  // heavy per-method diagnostics.
  return (isPerfDiagnosticsEnabled() || (perfHarnessBuild && isPerfHarnessEnabled()))
    && typeof performance !== 'undefined'
    && typeof performance.now === 'function';
}

function getLoopFrameBreakdownStore(): LoopFrameBreakdownStore | null {
  if (!shouldRecordLoopFrameBreakdown()) return null;
  const globalScope = globalThis as typeof globalThis & {
    __gameLoopFrameBreakdown?: LoopFrameBreakdownStore;
  };
  if (!globalScope.__gameLoopFrameBreakdown) {
    globalScope.__gameLoopFrameBreakdown = createLoopFrameBreakdownStore();
  }
  return globalScope.__gameLoopFrameBreakdown;
}

function createLoopFrameBreakdownStore(): LoopFrameBreakdownStore {
  const entries = new Array<LoopFrameBreakdownEntry>(LOOP_FRAME_BREAKDOWN_LIMIT);
  let startIndex = 0;
  let entryCount = 0;

  const snapshot = (): LoopFrameBreakdownEntry[] => {
    const output = new Array<LoopFrameBreakdownEntry>(entryCount);
    for (let index = 0; index < entryCount; index++) {
      output[index] = entries[(startIndex + index) % LOOP_FRAME_BREAKDOWN_LIMIT];
    }
    return output;
  };

  return {
    push(entry: LoopFrameBreakdownEntry): void {
      if (entryCount < LOOP_FRAME_BREAKDOWN_LIMIT) {
        entries[(startIndex + entryCount) % LOOP_FRAME_BREAKDOWN_LIMIT] = entry;
        entryCount += 1;
        return;
      }
      entries[startIndex] = entry;
      startIndex = (startIndex + 1) % LOOP_FRAME_BREAKDOWN_LIMIT;
    },
    drain(): LoopFrameBreakdownEntry[] {
      const output = snapshot();
      entryCount = 0;
      startIndex = 0;
      return output;
    },
    getSnapshot(): LoopFrameBreakdownEntry[] {
      return snapshot();
    },
    reset(): void {
      entryCount = 0;
      startIndex = 0;
    }
  };
}

function addLoopFrameSegment(name: string, durationMs: number): void {
  if (!activeLoopFrameSegments || durationMs < 0 || !Number.isFinite(durationMs)) {
    return;
  }
  activeLoopFrameSegments[name] = (activeLoopFrameSegments[name] ?? 0) + durationMs;
  activeLoopFrameSegmentTotalMs += durationMs;
}

function captureSystemTimingSnapshot(engine: GameEngine): LoopSystemTimingSnapshot[] {
  try {
    const snapshot: LoopSystemTimingSnapshot[] = [];
    for (const timing of engine.systemManager.getTopSystemTimingsByLast(LOOP_FRAME_SYSTEM_TIMING_LIMIT)) {
      const lastMs = Number.isFinite(timing.lastMs) ? timing.lastMs : timing.timeMs;
      if (!Number.isFinite(lastMs) || lastMs < 0) continue;
      const emaMs = Number.isFinite(timing.emaMs) ? timing.emaMs : timing.timeMs;
      const budgetMs = Number.isFinite(timing.budgetMs) ? timing.budgetMs : 0;
      snapshot.push({
        name: timing.name,
        lastMs,
        emaMs,
        budgetMs,
        overBudget: budgetMs > 0 && lastMs > budgetMs,
      });
      if (snapshot.length >= LOOP_FRAME_SYSTEM_TIMING_LIMIT) break;
    }
    return snapshot;
  } catch {
    return [];
  }
}

function captureTelemetryTimingSnapshot(): LoopTelemetryTimingSnapshot[] {
  try {
    const snapshot: LoopTelemetryTimingSnapshot[] = [];
    for (const timing of performanceTelemetry.getTopSystemBreakdownByLast(LOOP_FRAME_TELEMETRY_TIMING_LIMIT)) {
      const lastMs = Number.isFinite(timing.lastMs) ? timing.lastMs : 0;
      if (!Number.isFinite(lastMs) || lastMs < 0) continue;
      const emaMs = Number.isFinite(timing.emaMs) ? timing.emaMs : lastMs;
      const budgetMs = Number.isFinite(timing.budgetMs) ? timing.budgetMs : 0;
      const peakMs = Number.isFinite(timing.peakMs) ? timing.peakMs : lastMs;
      snapshot.push({
        name: timing.name,
        lastMs,
        emaMs,
        peakMs,
        budgetMs,
        overBudget: budgetMs > 0 && lastMs > budgetMs,
      });
    }
    return snapshot;
  } catch {
    return [];
  }
}

function captureCombatTimingSnapshot(engine: GameEngine): LoopCombatTimingSnapshot | undefined {
  try {
    const profile = engine.systemManager.combatantSystem?.getCombatProfile?.();
    const timing = profile?.timing;
    if (!timing) return undefined;

    return {
      totalMs: finiteNumber(timing.totalMs),
      aiUpdateMs: finiteNumber(timing.aiUpdateMs),
      spatialSyncMs: finiteNumber(timing.spatialSyncMs),
      billboardUpdateMs: finiteNumber(timing.billboardUpdateMs),
      billboardProfile: timing.billboardProfile ? {
        walkFrameMs: finiteNumber(timing.billboardProfile.walkFrameMs),
        closeModelMs: finiteNumber(timing.billboardProfile.closeModelMs),
        bucketResetMs: finiteNumber(timing.billboardProfile.bucketResetMs),
        impostorWriteMs: finiteNumber(timing.billboardProfile.impostorWriteMs),
        finalizeMs: finiteNumber(timing.billboardProfile.finalizeMs),
        hitboxDebugMs: finiteNumber(timing.billboardProfile.hitboxDebugMs),
        materializationEventsMs: finiteNumber(timing.billboardProfile.materializationEventsMs),
        shaderUniformMs: finiteNumber(timing.billboardProfile.shaderUniformMs),
      } : undefined,
      effectPoolsMs: finiteNumber(timing.effectPoolsMs),
      influenceMapMs: finiteNumber(timing.influenceMapMs),
      engagingCount: finiteNumber(timing.engagingCount),
      firingCount: finiteNumber(timing.firingCount),
      losCache: timing.losCache ? {
        hits: finiteNumber(timing.losCache.hits),
        misses: finiteNumber(timing.losCache.misses),
        hitRate: finiteNumber(timing.losCache.hitRate),
        budgetDenials: finiteNumber(timing.losCache.budgetDenials),
        prefilterPasses: finiteNumber(timing.losCache.prefilterPasses),
        prefilterRejects: finiteNumber(timing.losCache.prefilterRejects),
        fullEvaluations: finiteNumber(timing.losCache.fullEvaluations),
        terrainRaycasts: finiteNumber(timing.losCache.terrainRaycasts),
        fullEvaluationClear: finiteNumber(timing.losCache.fullEvaluationClear),
        fullEvaluationBlocked: finiteNumber(timing.losCache.fullEvaluationBlocked),
      } : undefined,
      raycastBudget: timing.raycastBudget ? {
        maxPerFrame: finiteNumber(timing.raycastBudget.maxPerFrame),
        usedThisFrame: finiteNumber(timing.raycastBudget.usedThisFrame),
        deniedThisFrame: finiteNumber(timing.raycastBudget.deniedThisFrame),
        totalExhaustedFrames: finiteNumber(timing.raycastBudget.totalExhaustedFrames),
        totalRequested: finiteNumber(timing.raycastBudget.totalRequested),
        totalDenied: finiteNumber(timing.raycastBudget.totalDenied),
        saturationRate: finiteNumber(timing.raycastBudget.saturationRate),
        denialRate: finiteNumber(timing.raycastBudget.denialRate),
      } : undefined,
      combatFireRaycastBudget: timing.combatFireRaycastBudget ? {
        maxPerFrame: finiteNumber(timing.combatFireRaycastBudget.maxPerFrame),
        usedThisFrame: finiteNumber(timing.combatFireRaycastBudget.usedThisFrame),
        deniedThisFrame: finiteNumber(timing.combatFireRaycastBudget.deniedThisFrame),
        terrainBlockedThisFrame: finiteNumber(timing.combatFireRaycastBudget.terrainBlockedThisFrame),
        totalExhaustedFrames: finiteNumber(timing.combatFireRaycastBudget.totalExhaustedFrames),
        totalRequested: finiteNumber(timing.combatFireRaycastBudget.totalRequested),
        totalDenied: finiteNumber(timing.combatFireRaycastBudget.totalDenied),
        totalTerrainBlocked: finiteNumber(timing.combatFireRaycastBudget.totalTerrainBlocked),
        saturationRate: finiteNumber(timing.combatFireRaycastBudget.saturationRate),
        denialRate: finiteNumber(timing.combatFireRaycastBudget.denialRate),
        terrainBlockRate: finiteNumber(timing.combatFireRaycastBudget.terrainBlockRate),
      } : undefined,
      aiScheduling: timing.aiScheduling ? {
        frameCounter: finiteNumber(timing.aiScheduling.frameCounter),
        intervalScale: finiteNumber(timing.aiScheduling.intervalScale, 1),
        aiBudgetMs: finiteNumber(timing.aiScheduling.aiBudgetMs),
        staggeredSkips: finiteNumber(timing.aiScheduling.staggeredSkips),
        highFullUpdates: finiteNumber(timing.aiScheduling.highFullUpdates),
        mediumFullUpdates: finiteNumber(timing.aiScheduling.mediumFullUpdates),
        projectedHighFullUpdateDeferrals: finiteNumber(timing.aiScheduling.projectedHighFullUpdateDeferrals),
        highFullUpdateCostEmaMs: finiteNumber(timing.aiScheduling.highFullUpdateCostEmaMs),
        highFullUpdateCostPeakMs: finiteNumber(timing.aiScheduling.highFullUpdateCostPeakMs),
        maxHighFullUpdatesPerFrame: finiteNumber(timing.aiScheduling.maxHighFullUpdatesPerFrame),
        maxMediumFullUpdatesPerFrame: finiteNumber(timing.aiScheduling.maxMediumFullUpdatesPerFrame),
        aiBudgetExceededEvents: finiteNumber(timing.aiScheduling.aiBudgetExceededEvents),
        aiSevereOverBudgetEvents: finiteNumber(timing.aiScheduling.aiSevereOverBudgetEvents),
      } : undefined,
    };
  } catch {
    return undefined;
  }
}

function recordLoopFrameBreakdown(
  engine: GameEngine,
  startedAtMs: number,
  endedAtMs: number,
  timestampDeltaMs: number,
  callbackDurationMs: number,
  segments: LoopFrameSegments,
  segmentTotalMs: number
): void {
  if (
    timestampDeltaMs < LOOP_FRAME_BREAKDOWN_THRESHOLD_MS
    && callbackDurationMs < LOOP_CALLBACK_BREAKDOWN_THRESHOLD_MS
  ) {
    return;
  }

  const store = getLoopFrameBreakdownStore();
  if (!store) return;
  let frameCount: number | null = null;
  try {
    frameCount = engine.runtimeMetrics?.getFrameCount?.()
      ?? engine.runtimeMetrics?.getSnapshot?.().frameCount
      ?? null;
  } catch {
    frameCount = null;
  }
  store.push({
    frameCount,
    startedAtMs,
    endedAtMs,
    timestampDeltaMs,
    callbackDurationMs,
    segmentTotalMs,
    unmeasuredCallbackMs: Math.max(0, callbackDurationMs - segmentTotalMs),
    segments: { ...segments },
    systemTimings: captureSystemTimingSnapshot(engine),
    telemetryTimings: captureTelemetryTimingSnapshot(),
    combatTiming: captureCombatTimingSnapshot(engine),
  });
}

function withLoopUserTiming<T>(name: string, fn: () => T): T {
  const collectUserTiming = isPerfUserTimingEnabled();
  const collectFrameBreakdown = activeLoopFrameSegments !== null
    && typeof performance !== 'undefined'
    && typeof performance.now === 'function';

  if (!collectUserTiming && !collectFrameBreakdown) {
    return fn();
  }

  const measureName = `GameEngineLoop.${name}`;
  const startMark = `${measureName}.start`;
  const endMark = `${measureName}.end`;
  const segmentStartMs = collectFrameBreakdown ? performance.now() : 0;

  if (collectUserTiming) {
    performance.mark(startMark);
  }
  try {
    return fn();
  } finally {
    if (collectFrameBreakdown) {
      addLoopFrameSegment(name, performance.now() - segmentStartMs);
    }
    if (collectUserTiming) {
      performance.mark(endMark);
      performance.measure(measureName, startMark, endMark);
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
    }
  }
}

function withTelemetrySystem<T>(name: string, fn: () => T): T {
  performanceTelemetry.beginSystem(name);
  try {
    return fn();
  } finally {
    performanceTelemetry.endSystem(name);
  }
}

export function start(engine: GameEngine): void {
  if (engine.isLoopRunning || engine.isDisposed) {
    return;
  }

  engine.isLoopRunning = true;
  scheduleNextFrame(engine);
}

export function stop(engine: GameEngine): void {
  engine.isLoopRunning = false;
  if (engine.animationFrameId !== null) {
    cancelAnimationFrame(engine.animationFrameId);
    engine.animationFrameId = null;
  }
}

export function resetState(): void {
  crashCount = 0;
  lastCrashTime = 0;
  errorOverlayShown = false;
  getLoopFrameBreakdownStore()?.reset();
  resetPresentationEpochContext();
}

function scheduleNextFrame(engine: GameEngine): void {
  if (!engine.isLoopRunning || engine.isDisposed) {
    engine.animationFrameId = null;
    return;
  }

  engine.animationFrameId = requestAnimationFrame((timestamp) => animate(engine, timestamp));
}

/**
 * Main game loop animation frame
 */
export function animate(engine: GameEngine, timestamp?: number): void {
  if (!engine.isLoopRunning || engine.isDisposed) {
    engine.animationFrameId = null;
    return;
  }

  engine.animationFrameId = null;
  const collectLoopFrameBreakdown = shouldRecordLoopFrameBreakdown();
  const previousLoopFrameSegments = activeLoopFrameSegments;
  const previousLoopFrameSegmentTotalMs = activeLoopFrameSegmentTotalMs;
  const loopFrameSegments = collectLoopFrameBreakdown ? Object.create(null) as LoopFrameSegments : null;
  const loopStartedAtMs = collectLoopFrameBreakdown ? performance.now() : 0;
  let timestampDeltaMs = 0;
  if (loopFrameSegments) {
    activeLoopFrameSegments = loopFrameSegments;
    activeLoopFrameSegmentTotalMs = 0;
  }

  try {
    if (!engine.isInitialized || !engine.gameStarted) {
      return;
    }

    // Skip rendering while WebGL context is lost
    if (engine.contextLost) {
      return;
    }

    engine.clock.update(timestamp);
    const rawDelta = Math.min(engine.clock.getDelta(), 0.1);
    // Single hook point for pause / slow-mo / fast-forward. Systems that read
    // performance.now() directly will bypass this multiplier — see PR notes
    // for the current bypass list.
    const scale = engine.timeScale.get();
    const deltaTime = rawDelta * scale;
    engine.lastFrameDelta = deltaTime;
    timestampDeltaMs = deltaTime * 1000;
    const presentationFrameCount = (engine.runtimeMetrics?.getFrameCount?.() ?? 0) + 1;

    recordPresentationEpoch(engine, 'before-simulation', presentationFrameCount);

    // Update all systems
    withLoopUserTiming('Simulation.updateSystems', () => {
      engine.systemManager.updateSystems(deltaTime, engine.gameStarted);
    });
    recordPresentationEpoch(engine, 'after-simulation', presentationFrameCount, true);
    withLoopUserTiming('Simulation.timeScalePostDispatch', () => {
      engine.timeScale.postDispatch();
    });

    // Free-fly debug camera: updates independently of player/vehicle input.
    withLoopUserTiming('Camera.freeFly', () => {
      engine.freeFlyCamera?.update(deltaTime, engine.freeFlyInput);
    });

    // Keep the analytic `AtmosphereSystem` dome glued to the active camera
    // so it never z-fights terrain or clips when pilots climb past the dome
    // radius. The override camera (if set) drives the dome too so free-fly
    // doesn't see a mismatched horizon.
    const activeCamera = engine.renderer.getActiveCamera();
    const cameraPos = activeCamera.position;
    withLoopUserTiming('World.atmosphereSync', () => {
      engine.systemManager.atmosphereSystem.syncDomePosition(cameraPos);
      const terrainSystem = engine.systemManager.terrainSystem;
      if (terrainSystem && typeof terrainSystem.getHeightAt === 'function') {
        engine.systemManager.atmosphereSystem.setTerrainYAtCamera(
          terrainSystem.getHeightAt(cameraPos.x, cameraPos.z)
        );
      }
    });

    // Check if mortar is deployed and using mortar camera view
    const mortarSystem = engine.systemManager.mortarSystem;
    const usingMortarCamera = mortarSystem?.isUsingMortarCamera() ?? false;
    const mortarCamera = mortarSystem?.getMortarCamera();
    const renderCamera = usingMortarCamera && mortarCamera ? mortarCamera : activeCamera;
    let terrainRenderSelectionSync: PresentationTerrainSyncEpoch | null = null;
    if (typeof engine.systemManager.terrainSystem?.syncRenderSelectionForCamera === 'function') {
      withLoopUserTiming('RenderMain.terrainCameraSync', () => {
        terrainRenderSelectionSync = engine.systemManager.terrainSystem
          .syncRenderSelectionForCamera(renderCamera);
      });
    }
    recordPresentationEpoch(
      engine,
      'before-render',
      presentationFrameCount,
      true,
      usingMortarCamera && mortarCamera ? 'mortar' : undefined,
      renderCamera,
      false,
      terrainRenderSelectionSync,
    );

    // Collect GPU timing from previous frame
    withLoopUserTiming('RenderMain.collectGPUTime', () => {
      performanceTelemetry.collectGPUTime();
    });

    withLoopUserTiming('RenderMain.beginFrameStats', () => {
      engine.renderer.beginFrameStats();
    });
    performanceTelemetry.beginSystem('RenderMain');
    performanceTelemetry.beginGPUTimer();

    const pp = engine.renderer.postProcessing;
    const renderer = engine.renderer.renderer;

    // Begin post-processing frame (redirects all rendering to low-res target)
    if (pp && !usingMortarCamera) {
      withLoopUserTiming('RenderMain.postProcessing.beginFrame', () => {
        withTelemetrySystem('RenderMain.PostProcessingBegin', () => {
          pp.beginFrame();
        });
      });
    }

    // Render the main scene
    withLoopUserTiming('RenderMain.renderer.render', () => {
      withTelemetrySystem('RenderMain.Renderer', () => {
        if (usingMortarCamera && mortarCamera) {
          renderer.render(engine.renderer.scene, mortarCamera);
        } else {
          renderer.render(engine.renderer.scene, activeCamera);
        }
      });
    });

    withLoopUserTiming('RenderMain.endGPUTimer', () => {
      performanceTelemetry.endGPUTimer();
    });
    performanceTelemetry.endSystem('RenderMain');

    // Render weapon + grenade overlays (into the same post-processing target)
    performanceTelemetry.beginSystem('RenderOverlay');
    if (!usingMortarCamera) {
      if (engine.systemManager.firstPersonWeapon) {
        withLoopUserTiming('RenderOverlay.weapon', () => {
          withTelemetrySystem('RenderOverlay.Weapon', () => {
            engine.systemManager.firstPersonWeapon?.renderWeapon(renderer);
          });
        });
      }

      const currentAutoClear = renderer.autoClear;
      renderer.autoClear = false;

      if (
        engine.systemManager.grenadeSystem
        && engine.systemManager.inventoryManager
        && engine.systemManager.grenadeSystem.canRenderOverlay()
      ) {
        const grenadeScene = engine.systemManager.grenadeSystem.getGrenadeOverlayScene();
        const grenadeCamera = engine.systemManager.grenadeSystem.getGrenadeOverlayCamera();
        if (grenadeScene && grenadeCamera) {
          withLoopUserTiming('RenderOverlay.grenade', () => {
            withTelemetrySystem('RenderOverlay.Grenade', () => {
              renderer.clearDepth();
              renderer.render(grenadeScene, grenadeCamera);
            });
          });
        }
      }

      renderer.autoClear = currentAutoClear;
    }

    // End post-processing frame (blits low-res target to screen with retro effect)
    if (pp && !usingMortarCamera) {
      withLoopUserTiming('RenderOverlay.postProcessing.endFrame', () => {
        withTelemetrySystem('RenderOverlay.PostProcessingEnd', () => {
          pp.endFrame();
        });
      });
    }

    performanceTelemetry.endSystem('RenderOverlay');

    recordPresentationEpoch(
      engine,
      'after-render',
      presentationFrameCount,
      false,
      usingMortarCamera && mortarCamera ? 'mortar' : undefined,
      renderCamera,
      true,
    );

    withLoopUserTiming('FrameTail.runtimeMetrics', () => {
      withTelemetrySystem('FrameTail.RuntimeMetrics', () => {
        updateRuntimeMetrics(engine, deltaTime);
      });
    });
    withLoopUserTiming('FrameTail.performanceOverlay', () => {
      withTelemetrySystem('FrameTail.PerformanceOverlay', () => {
        updatePerformanceOverlay(engine, deltaTime);
      });
    });
    withLoopUserTiming('FrameTail.logOverlay', () => {
      withTelemetrySystem('FrameTail.LogOverlay', () => {
        updateLogOverlay(engine);
      });
    });
    if (engine.debugHud.isMasterVisible()) {
      withLoopUserTiming('FrameTail.debugHud', () => {
        withTelemetrySystem('FrameTail.DebugHud', () => {
          engine.debugHud.update(deltaTime);
        });
      });
    }
    withLoopUserTiming('FrameTail.worldOverlays', () => {
      withTelemetrySystem('FrameTail.WorldOverlays', () => {
        engine.renderer.worldOverlays?.update(deltaTime);
      });
    });
    // Any successful frame clears crash streak so only consecutive failures escalate.
    if (crashCount > 0) {
      crashCount = 0;
      lastCrashTime = 0;
    }
  } catch (error) {
    // Handle frame loop crash
    Logger.error('frame-loop', 'Frame loop error:', error);

    const now = Date.now();

    // Reset crash count if outside crash window
    if (now - lastCrashTime > CRASH_WINDOW_MS) {
      crashCount = 0;
    }

    crashCount++;
    lastCrashTime = now;

    // If too many crashes in short time, show error overlay
    if (crashCount >= MAX_CRASHES && !errorOverlayShown) {
      errorOverlayShown = true;
      showFrameLoopError(engine, error);
    }

    // Continue the loop - don't let a single crash stop the game
  } finally {
    if (loopFrameSegments) {
      const loopEndedAtMs = performance.now();
      recordLoopFrameBreakdown(
        engine,
        loopStartedAtMs,
        loopEndedAtMs,
        timestampDeltaMs,
        loopEndedAtMs - loopStartedAtMs,
        loopFrameSegments,
        activeLoopFrameSegmentTotalMs
      );
      activeLoopFrameSegments = previousLoopFrameSegments;
      activeLoopFrameSegmentTotalMs = previousLoopFrameSegmentTotalMs;
    }
    scheduleNextFrame(engine);
  }
}

/**
 * Show an error overlay for repeated frame loop crashes
 */
function showFrameLoopError(engine: GameEngine, error: unknown): void {
  // In harness/sandbox mode keep running and log, do not block testing with fatal overlay.
  if (engine.sandboxEnabled) {
    Logger.error('frame-loop', 'Suppressed fatal frame-loop overlay in sandbox mode:', error);
    return;
  }

  const errorMessage = error instanceof Error
    ? `${error.message}\n\nThe game encountered ${crashCount} errors within ${CRASH_WINDOW_MS / 1000} seconds.`
    : `The game encountered ${crashCount} errors within ${CRASH_WINDOW_MS / 1000} seconds.`;

  engine.loadingScreen.showError(
    'Game Error - Multiple Crashes',
    errorMessage
  );
}

function recordPresentationEpoch(
  engine: GameEngine,
  stage: 'before-simulation' | 'after-simulation' | 'before-render' | 'after-render',
  frameCount: number,
  includeTerrain = false,
  cameraSourceOverride?: string,
  cameraOverride?: THREE.Camera,
  includeRendererStats = false,
  terrainSync?: PresentationTerrainSyncEpoch | null,
): void {
  const camera = cameraOverride ?? engine.renderer.getActiveCamera();
  try {
    recordPresentationCameraEpoch({
      stage,
      frameCount,
      camera,
      cameraSource: cameraSourceOverride ?? (camera === engine.renderer.camera ? 'main' : 'override'),
      terrain: includeTerrain ? engine.systemManager.terrainSystem : null,
      terrainSync,
      rendererStats: includeRendererStats ? engine.renderer.getPerformanceStats() : null,
    });
  } catch {
    // Diagnostics must never take down the gameplay frame.
  }
}

/**
 * Updates runtime metrics
 */
function updateRuntimeMetrics(engine: GameEngine, deltaTime: number): void {
  if (!engine.runtimeMetrics) return;

  engine.runtimeMetrics.updateFrame(deltaTime);

  const combatSystem = engine.systemManager.combatantSystem;
  if (!combatSystem) return;

  const combatStats = combatSystem.getCombatStats();
  const combatProfile = combatSystem.getCombatProfile();
  engine.runtimeMetrics.updateCombatStats({
    combatantCount: combatStats.total,
    firingCount: combatProfile.timing.firingCount,
    engagingCount: combatProfile.timing.engagingCount
  });
}

/**
 * Updates the real-time performance overlay data
 */
function updatePerformanceOverlay(engine: GameEngine, deltaTime: number): void {
  if (!engine.performanceOverlay.isVisible()) return;

  const perfStats = engine.renderer.getPerformanceStats();
  const debugInfo = engine.systemManager.globalBillboardSystem.getDebugInfo();
  const combatStats = engine.systemManager.combatantSystem.getCombatStats();
  const terrainManager = engine.systemManager.terrainSystem;
  const workerStats = terrainManager.getWorkerStats?.();
  const activeTerrainTiles = terrainManager.getActiveTerrainTileCount();
  const terrainStreams = terrainManager.getStreamingMetrics?.() ?? [];
  const fps = 1 / Math.max(0.0001, deltaTime);
  const logStats = Logger.getStats();
  const combatTelemetry = engine.systemManager.combatantSystem
    ? engine.systemManager.combatantSystem.getTelemetry()
    : {
        lastMs: 0,
        emaMs: 0,
        lodHigh: 0,
        lodMedium: 0,
        lodLow: 0,
        lodCulled: 0,
        combatantCount: 0,
        octree: { nodes: 0, maxDepth: 0, avgEntitiesPerLeaf: 0 }
      };
  const vegetation = summarizeVegetationDebugInfo(debugInfo);

  // Get system timings from system manager
  const systemTimings = engine.systemManager.getTopSystemTimingsByLast(LOOP_PERFORMANCE_OVERLAY_TIMING_LIMIT);

  // Get GPU telemetry
  const gpuTelemetry = performanceTelemetry.getGPUTelemetry();

  engine.performanceOverlay.updateStats({
    fps,
    frameTimeMs: deltaTime * 1000,
    drawCalls: perfStats.drawCalls,
    triangles: perfStats.triangles,
    terrainReady: terrainManager.isTerrainReady(),
    activeTerrainTiles,
    terrainWorkerQueue: workerStats?.queueLength ?? 0,
    terrainBusyWorkers: workerStats?.busyWorkers ?? 0,
    terrainTotalWorkers: workerStats?.totalWorkers ?? 0,
    terrainStreams,
    usCombatants: combatStats.us,
    opforCombatants: combatStats.opfor,
    vegetationActive: vegetation.active,
    vegetationReserved: vegetation.reserved,
    suppressedLogs: logStats.suppressedTotal,
    geometries: perfStats.geometries,
    textures: perfStats.textures,
    programs: perfStats.programs,
    combatLastMs: combatTelemetry.lastMs,
    combatEmaMs: combatTelemetry.emaMs,
    combatLodHigh: combatTelemetry.lodHigh,
    combatLodMedium: combatTelemetry.lodMedium,
    combatLodLow: combatTelemetry.lodLow,
    combatLodCulled: combatTelemetry.lodCulled,
    combatantCount: combatTelemetry.combatantCount,
    systemTimings,
    gpuTimeMs: gpuTelemetry.gpuTimeMs,
    gpuTimingAvailable: gpuTelemetry.available
  });
}

/**
 * Updates the log overlay with recent log entries
 */
function updateLogOverlay(engine: GameEngine): void {
  if (!engine.logOverlay.isVisible()) return;

  const recent = Logger.getRecent(12);
  engine.logOverlay.updateEntries(recent);
}
