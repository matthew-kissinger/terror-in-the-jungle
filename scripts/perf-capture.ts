#!/usr/bin/env tsx

import { chromium, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
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

type ConsoleEntry = {
  ts: string;
  type: string;
  text: string;
};

type RuntimeSample = {
  ts: string;
  frameCount: number;
  avgFrameMs: number;
  p95FrameMs: number;
  p99FrameMs?: number;
  maxFrameMs?: number;
  hitch33Count?: number;
  hitch50Count?: number;
  hitch100Count?: number;
  combatantCount: number;
  overBudgetPercent: number;
  shotsThisSession?: number;
  hitsThisSession?: number;
  hitRate?: number;
  heapUsedMb?: number;
  heapTotalMb?: number;
  uiErrorPanelVisible?: boolean;
  combatBreakdown?: {
    totalMs: number;
    aiUpdateMs: number;
    spatialSyncMs: number;
    billboardUpdateMs: number;
    effectPoolsMs: number;
    influenceMapMs: number;
    aiStateMs?: Record<string, number>;
    losCache?: {
      hits: number;
      misses: number;
      hitRate: number;
      budgetDenials: number;
      prefilterPasses?: number;
      prefilterRejects?: number;
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
      totalExhaustedFrames: number;
      totalRequested: number;
      totalDenied: number;
      saturationRate: number;
      denialRate: number;
    };
    aiScheduling?: {
      frameCounter: number;
      intervalScale: number;
      aiBudgetMs: number;
      staggeredSkips: number;
      highFullUpdates: number;
      mediumFullUpdates: number;
      maxHighFullUpdatesPerFrame: number;
      maxMediumFullUpdatesPerFrame: number;
      aiBudgetExceededEvents: number;
      aiSevereOverBudgetEvents: number;
    };
  };
  renderer?: {
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
  };
  browserStalls?: {
    support: {
      longtask: boolean;
      longAnimationFrame: boolean;
      userTiming: boolean;
    };
    totals: {
      longTaskCount: number;
      longTaskTotalDurationMs: number;
      longTaskMaxDurationMs: number;
      longAnimationFrameCount: number;
      longAnimationFrameTotalDurationMs: number;
      longAnimationFrameMaxDurationMs: number;
      longAnimationFrameBlockingDurationMs: number;
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
        entries: Array<{ name: string; startTime: number; duration: number }>;
      };
      longAnimationFrames: {
        count: number;
        totalDurationMs: number;
        maxDurationMs: number;
        blockingDurationMs: number;
        entries: Array<{ startTime: number; duration: number; blockingDuration: number }>;
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
  harnessDriver?: {
    mode: string;
    movementState: string;
    targetVisible: boolean;
    respawnCount: number;
    ammoRefillCount: number;
    healthTopUpCount: number;
    lastShotAt: number;
    lastFireProbe?: Record<string, unknown> | null;
  };
};

type CaptureSummary = {
  startedAt: string;
  endedAt: string;
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
  };
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
};

type MovementViewerPayload = {
  movementArtifacts: MovementArtifactReportForViewer;
  terrainContext: MovementTerrainOverlayArtifact;
};

type StartupDiagnostics = {
  ts: string;
  readyState: string;
  hasMetrics: boolean;
  hasEngine: boolean;
  hasPerfApi: boolean;
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

const DEV_SERVER_PORT = 9100;
const DEFAULT_DURATION_SECONDS = 90;
const DEFAULT_WARMUP_SECONDS = 15;
const DEFAULT_NPCS = 60;
const DEFAULT_STARTUP_TIMEOUT_SECONDS = 120;
const DEFAULT_STARTUP_FRAME_THRESHOLD = 30;
const DEFAULT_ACTIVE_PLAYER = true;
const DEFAULT_GAME_MODE = 'ai_sandbox';
const DEFAULT_COMPRESS_FRONTLINE = true;
const DEFAULT_ALLOW_WARP_RECOVERY = false;
const DEFAULT_ACTIVE_TOP_UP_HEALTH = true;
const DEFAULT_ACTIVE_AUTO_RESPAWN = true;
const DEFAULT_MOVEMENT_DECISION_INTERVAL_MS = 450;
const DEFAULT_PREWARM = true;
const DEFAULT_RUNTIME_PREFLIGHT = false;
const DEFAULT_RUNTIME_PREFLIGHT_TIMEOUT_SECONDS = 8;
const DEFAULT_SANDBOX_MODE = false;
const DEFAULT_FRONTLINE_TRIGGER_DISTANCE = 500;
const DEFAULT_MAX_COMPRESSED_PER_FACTION = 28;
const DEFAULT_SAMPLE_INTERVAL_MS = 1000;
const DEFAULT_DETAIL_EVERY_SAMPLES = 1;
const STEP_TIMEOUT_MS = 30_000;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const MIN_RUN_HARD_TIMEOUT_MS = 120_000;
const LOCK_FILE = join(process.cwd(), 'tmp', 'perf-capture.lock');
const CDP_STOP_TIMEOUT_MS = 3_000;
const TRACE_STOP_TIMEOUT_MS = 5_000;
const SCENARIO_SETUP_TIMEOUT_MS = 10_000;

function nowIso(): string {
  return new Date().toISOString();
}

function logStep(msg: string): void {
  console.log(`[${nowIso()}] ${msg}`);
}

async function safeAwait<T>(label: string, promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  try {
    return await withTimeout(label, promise, timeoutMs);
  } catch (error) {
    logStep(`⚠ ${label} failed/timed out: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
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

function validateRun(
  runtimeSamples: RuntimeSample[],
  consoleEntries: ConsoleEntry[],
  durationSeconds: number,
  options?: { hitValidation?: 'strict' | 'relaxed' | 'critical' | 'off'; sampleIntervalMs?: number }
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
  const hitch50Percent = finalFrameCount > 0 ? (finalHitch50 / finalFrameCount) * 100 : 0;
  const hitch100Percent = finalFrameCount > 0 ? (finalHitch100 / finalFrameCount) * 100 : 0;

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
    const maxShots = shotSamples.length > 0
      ? Math.max(...shotSamples.map(s => Number(s.shotsThisSession ?? 0)))
      : 0;
    const maxHits = shotSamples.length > 0
      ? Math.max(...shotSamples.map(s => Number(s.hitsThisSession ?? 0)))
      : 0;
    const peakHitRate = shotSamples.length > 0
      ? Math.max(...shotSamples.map(s => Number(s.hitRate ?? 0)))
      : 0;

    const strict = hitValidationMode === 'strict';
    const isBehaviorCritical = hitValidationMode === 'strict' || hitValidationMode === 'critical';
    checks.push({
      id: 'player_shots_recorded',
      status: isBehaviorCritical
        ? (maxShots >= 5 ? 'pass' : maxShots > 0 ? 'warn' : 'fail')
        : (maxShots >= 3 ? 'pass' : 'warn'),
      value: maxShots,
      message: `Recorded player shots in sim=${maxShots}`
    });

    checks.push({
      id: 'player_hits_recorded',
      status: isBehaviorCritical
        ? (maxHits >= 1 ? 'pass' : 'fail')
        : (maxHits >= 1 ? 'pass' : 'warn'),
      value: maxHits,
      message: `Recorded player hits in sim=${maxHits}`
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
    const url = `http://localhost:${port}${path}`;
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
  let count = 0;
  let rafTicks = 0;
  let firstEngineSeenSec: number | undefined;
  let firstMetricsSeenSec: number | undefined;
  let lastStartupMark: string | undefined;
  let lastStartupMarkMs: number | undefined;
  let stalledGameplaySamples = 0;
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
      }
    } catch {
      // If early runtime globals are not available yet, keep probing until timeout.
      count = 0;
    }
    if (count > frameThreshold) {
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

  throw new Error(
    `Failed to start requested mode ${requestedMode}: timeout` +
    ` (phase=${finalModeState?.phase ?? 'unknown'}, gameStarted=${finalModeState?.gameStarted ? 1 : 0},` +
    ` gameStartPending=${finalModeState?.gameStartPending ? 1 : 0}, briefingVisible=${finalModeState?.briefingVisible ? 1 : 0})`
  );
}

type ActiveScenarioOptions = {
  enabled: boolean;
  mode: string;
  compressFrontline: boolean;
  allowWarpRecovery: boolean;
  topUpHealth: boolean;
  autoRespawn: boolean;
  movementDecisionIntervalMs: number;
  frontlineTriggerDistance: number;
  maxCompressedPerFaction: number;
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
      page.addScriptTag({ path: join(process.cwd(), 'scripts', 'perf-active-driver.js') }),
      SCENARIO_SETUP_TIMEOUT_MS
    );
  }

  const setupResult = await withTimeout(
    'active scenario setup',
    page.evaluate((opts) => (window as any).__perfHarnessDriver.start(opts), options),
    SCENARIO_SETUP_TIMEOUT_MS
  );

  logStep(
    `🎮 Active scenario driver enabled (patterns=${Number(setupResult?.movementPatternCount ?? 0)}, mode=${String(setupResult?.mode ?? options.mode)}, compressFrontline=${Boolean(setupResult?.compressFrontline)}, allowWarpRecovery=${Boolean(setupResult?.allowWarpRecovery)}, topUpHealth=${Boolean(setupResult?.topUpHealth)}, autoRespawn=${Boolean(setupResult?.autoRespawn)})`
  );
}

async function stopActiveScenarioDriver(page: Page): Promise<void> {
  const result = await safeAwait(
    'stop active scenario driver',
    page.evaluate(() => (window as any).__perfHarnessDriver?.stop?.() ?? null),
    SCENARIO_SETUP_TIMEOUT_MS
  );

  if (result) {
    logStep(
      `🎮 Active driver stopped (respawns=${result.respawnCount}, ammoRefills=${result.ammoRefillCount ?? 0}, healthTopUps=${result.healthTopUpCount ?? 0}, frontlineCompressed=${result.frontlineCompressed}, frontlineDistance=${Number(result.frontlineDistance ?? 0).toFixed(1)}, moved=${result.frontlineMoveCount ?? 0}, capturedZones=${result.capturedZoneCount ?? 0}, movementTransitions=${Number(result.movementTransitions ?? 0)})`
    );
  }
}

async function startChromeTracing(cdp: CDPSession): Promise<void> {
  await cdp.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    categories: [
      '-*',
      'devtools.timeline',
      'toplevel',
      'v8',
      'blink.user_timing',
      'disabled-by-default-v8.cpu_profiler',
      'disabled-by-default-devtools.timeline'
    ].join(',')
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
  const prewarm = parseBooleanFlag('prewarm', DEFAULT_PREWARM);
  const runtimePreflight = parseBooleanFlag('runtime-preflight', DEFAULT_RUNTIME_PREFLIGHT);
  const sandboxMode = parseBooleanFlag(
    'sandbox',
    requestedMode === 'ai_sandbox' ? true : DEFAULT_SANDBOX_MODE
  );
  const frontlineTriggerDistance = parseNumberFlag('frontline-trigger-distance', DEFAULT_FRONTLINE_TRIGGER_DISTANCE);
  const maxCompressedPerFaction = parseNumberFlag('frontline-compressed-per-faction', DEFAULT_MAX_COMPRESSED_PER_FACTION);
  const logLevel = String(process.env.PERF_LOG_LEVEL ?? process.argv.find(a => a.startsWith('--log-level='))?.split('=')[1] ?? 'warn');
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
  const effectiveNpcs = enableCombat ? npcs : 0;
  const artifactDir = makeArtifactDir();
  const browserProfileDir = join(artifactDir, 'browser-profile');
  mkdirSync(browserProfileDir, { recursive: true });
  logStep(`Config duration=${durationSeconds}s warmup=${warmupSeconds}s npcs=${effectiveNpcs} (requested=${npcs}) mode=${requestedMode} sandbox=${sandboxMode} startupTimeout=${startupTimeoutSeconds}s startupFrameThreshold=${startupFrameThreshold} runtimePreflightTimeout=${runtimePreflightTimeoutSeconds}s port=${port} headed=${headed} devtools=${devtools} playwrightTrace=${playwrightTrace} deepCdp=${deepCdp} combat=${enableCombat} activePlayer=${activePlayerScenario} compressFrontline=${compressFrontline} allowWarpRecovery=${allowWarpRecovery} activeTopUpHealth=${activeTopUpHealth} activeAutoRespawn=${activeAutoRespawn} movementDecisionIntervalMs=${movementDecisionIntervalMs} losHeightPrefilter=${losHeightPrefilter} sampleIntervalMs=${sampleIntervalMs} detailEverySamples=${detailEverySamples} prewarm=${prewarm} runtimePreflight=${runtimePreflight} reuseServer=${reuseServer} serverMode=${serverMode}`);

  let server: ServerHandle | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let cdp: CDPSession | null = null;
  let chromeTrace = '';
  let finalFrameCount = 0;
  const consoleEntries: ConsoleEntry[] = [];
  const runtimeSamples: RuntimeSample[] = [];
  let movementArtifacts: MovementArtifactReportForViewer | null = null;
  let movementViewerPayload: MovementViewerPayload | null = null;
  const probeRoundTripMs: number[] = [];
  const startedAt = nowIso();
  const combatParam = enableCombat ? '1' : '0';
  const autostart = requestedMode === 'ai_sandbox' ? 'true' : 'false';
  const losPrefilterParam = losHeightPrefilter ? '1' : '0';
  const uiTransitionsParam = '0';
  const diagnosticsQuery = 'perf=1';
  const query = sandboxMode
    ? `?sandbox=true&${diagnosticsQuery}&uiTransitions=${uiTransitionsParam}&npcs=${effectiveNpcs}&autostart=${autostart}&duration=${durationSeconds}&combat=${combatParam}&logLevel=${encodeURIComponent(logLevel)}&losHeightPrefilter=${losPrefilterParam}`
    : `?${diagnosticsQuery}&uiTransitions=${uiTransitionsParam}&logLevel=${encodeURIComponent(logLevel)}&losHeightPrefilter=${losPrefilterParam}`;
  const url = `http://localhost:${port}/${query}`;
  const preflightUrl = `http://localhost:${port}/?${diagnosticsQuery}&uiTransitions=${uiTransitionsParam}`;
  const primaryPath = new URL(url).pathname + new URL(url).search;
  const prewarmPaths = sandboxMode
    ? [
        `/?${diagnosticsQuery}&uiTransitions=${uiTransitionsParam}`,
        `/?sandbox=true&${diagnosticsQuery}&uiTransitions=${uiTransitionsParam}&autostart=false`,
        primaryPath.replace(`duration=${durationSeconds}`, 'duration=0')
      ]
    : [`/?${diagnosticsQuery}&uiTransitions=${uiTransitionsParam}`, primaryPath];
  const runHardTimeoutMs = Math.max(
    MIN_RUN_HARD_TIMEOUT_MS,
    (startupTimeoutSeconds + warmupSeconds + durationSeconds + 90) * 1000
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
  let activeScenarioStarted = false;
  let cdpStarted = false;
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
    hardTimeout = setTimeout(() => {
      const reason = `Hard timeout reached at stage=${stage}`;
      console.error(reason);
      emergencyShutdown(reason);
      process.exit(1);
    }, runHardTimeoutMs);

    stage = 'start-server';
    if (reuseServer && await isPortOpen(port)) {
      logStep(`♻ Reusing existing server on port ${port} (mode=${serverMode})`);
    } else {
      cleanupPortListeners(port, logStep);
      server = await startServer({
        mode: serverMode,
        port,
        host: '127.0.0.1',
        startupTimeoutMs: STEP_TIMEOUT_MS,
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
      devtools: headed && devtools,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-frame-rate-limit',
        '--enable-precise-memory-info',
      ],
      viewport: { width: 1920, height: 1080 }
    });
    stage = 'start-playwright-trace';
    if (playwrightTrace) {
      await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
      playwrightTracingStarted = true;
    }

    stage = 'open-page';
    page = context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(navTimeoutMs);
    await withTimeout(
      'install browser perf observers',
      page.addInitScript({ path: join(process.cwd(), 'scripts', 'perf-browser-observers.js') }),
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
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
      await cdp.send('HeapProfiler.enable');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await cdp.send('Profiler.start');
      await startChromeTracing(cdp);
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
        page.evaluate(() => ({
          ts: new Date().toISOString(),
          readyState: document.readyState,
          hasMetrics: Boolean((window as any).__metrics),
          hasEngine: Boolean((window as any).__engine),
          hasPerfApi: Boolean((window as any).perf?.report),
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
        })),
        3_000
      );
    } else {
      if (enableCombat) {
        await setupActiveScenarioDriver(page, {
          enabled: activePlayerScenario,
          mode: requestedMode,
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
      await warmupRuntime(page, warmupSeconds);
      // Reset rolling metrics so sampling reflects steady-state window, not startup cost.
      await safeAwait(
        'reset in-page metrics',
        page.evaluate(() => {
          (window as any).__metrics?.reset?.();
          (window as any).perf?.reset?.();
          (window as any).__perfHarnessObservers?.reset?.();
        }),
        3000
      );
      if (activePlayerScenario) {
        await stopActiveScenarioDriver(page);
        await setupActiveScenarioDriver(page, {
          enabled: true,
          mode: requestedMode,
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
    }

    const startMs = Date.now();
    let missedSamples = 0;
    let sampleTick = 0;
    while (Date.now() - startMs < durationSeconds * 1000) {
      await sleep(sampleIntervalMs);
      let sample: RuntimeSample | null = null;
      try {
        const probeStart = Date.now();
        const includeDetails = sampleTick % detailEverySamples === 0;
        const raw = await withTimeout('runtime sample', page.evaluate((shouldIncludeDetails: boolean) => {
          const metrics = (window as any).__metrics;
          const perf = (window as any).perf;
          const engine = (window as any).__engine;
          const renderer = (window as any).__renderer;
          const rendererStats = renderer?.getPerformanceStats?.();
          const browserStalls = (window as any).__perfHarnessObservers?.drain?.() ?? null;
          const basicValidation = perf?.validate?.();
          const report = shouldIncludeDetails ? perf?.report?.() : null;
          const movement = perf?.getMovement?.() ?? report?.movement ?? null;
          const combatProfile = shouldIncludeDetails ? (window as any).combatProfile?.() : null;
          const terrainStreams = shouldIncludeDetails
            ? engine?.systemManager?.terrainSystem?.getStreamingMetrics?.() ?? null
            : null;
          const harnessDriver = shouldIncludeDetails
            ? (window as any).__perfHarnessDriverState?.getDebugSnapshot?.() ?? null
            : null;
          const memory = (performance as any).memory;
          const snapshot = metrics?.getSnapshot?.();
          return {
            frameCount: Number(snapshot?.frameCount ?? 0),
            avgFrameMs: Number(snapshot?.avgFrameMs ?? 0),
            p95FrameMs: Number(snapshot?.p95FrameMs ?? 0),
            p99FrameMs: Number(snapshot?.p99FrameMs ?? 0),
            maxFrameMs: Number(snapshot?.maxFrameMs ?? 0),
            hitch33Count: Number(snapshot?.hitch33Count ?? 0),
            hitch50Count: Number(snapshot?.hitch50Count ?? 0),
            hitch100Count: Number(snapshot?.hitch100Count ?? 0),
            combatantCount: Number(snapshot?.combatantCount ?? 0),
            overBudgetPercent: Number(basicValidation?.frameBudget?.overBudgetPercent ?? report?.overBudgetPercent ?? 0),
            shotsThisSession: Number(basicValidation?.hitDetection?.shotsThisSession ?? report?.hitDetection?.shotsThisSession ?? 0),
            hitsThisSession: Number(basicValidation?.hitDetection?.hitsThisSession ?? report?.hitDetection?.hitsThisSession ?? 0),
            hitRate: Number(basicValidation?.hitDetection?.hitRate ?? report?.hitDetection?.hitRate ?? 0),
            heapUsedMb: memory?.usedJSHeapSize ? Number(memory.usedJSHeapSize) / (1024 * 1024) : undefined,
            heapTotalMb: memory?.totalJSHeapSize ? Number(memory.totalJSHeapSize) / (1024 * 1024) : undefined,
            uiErrorPanelVisible: Boolean(document.querySelector('.error-panel')),
            renderer: rendererStats ? {
              drawCalls: Number(rendererStats.drawCalls ?? 0),
              triangles: Number(rendererStats.triangles ?? 0),
              geometries: Number(rendererStats.geometries ?? 0),
              textures: Number(rendererStats.textures ?? 0),
              programs: Number(rendererStats.programs ?? 0)
            } : undefined,
            browserStalls: browserStalls ? {
              support: {
                longtask: Boolean(browserStalls.support?.longtask),
                longAnimationFrame: Boolean(browserStalls.support?.longAnimationFrame),
                userTiming: Boolean(browserStalls.support?.measure)
              },
              totals: {
                longTaskCount: Number(browserStalls.totals?.longTaskCount ?? 0),
                longTaskTotalDurationMs: Number(browserStalls.totals?.longTaskTotalDurationMs ?? 0),
                longTaskMaxDurationMs: Number(browserStalls.totals?.longTaskMaxDurationMs ?? 0),
                longAnimationFrameCount: Number(browserStalls.totals?.longAnimationFrameCount ?? 0),
                longAnimationFrameTotalDurationMs: Number(browserStalls.totals?.longAnimationFrameTotalDurationMs ?? 0),
                longAnimationFrameMaxDurationMs: Number(browserStalls.totals?.longAnimationFrameMaxDurationMs ?? 0),
                longAnimationFrameBlockingDurationMs: Number(browserStalls.totals?.longAnimationFrameBlockingDurationMs ?? 0),
                userTimingByName: browserStalls.totals?.userTimingByName && typeof browserStalls.totals.userTimingByName === 'object'
                  ? Object.fromEntries(
                      Object.entries(browserStalls.totals.userTimingByName).map(([name, value]: [string, any]) => [
                        String(name),
                        {
                          count: Number(value?.count ?? 0),
                          totalDurationMs: Number(value?.totalDurationMs ?? 0),
                          maxDurationMs: Number(value?.maxDurationMs ?? 0)
                        }
                      ])
                    )
                  : undefined
              },
              recent: {
                longTasks: {
                  count: Number(browserStalls.recent?.longTasks?.count ?? 0),
                  totalDurationMs: Number(browserStalls.recent?.longTasks?.totalDurationMs ?? 0),
                  maxDurationMs: Number(browserStalls.recent?.longTasks?.maxDurationMs ?? 0),
                  entries: Array.isArray(browserStalls.recent?.longTasks?.entries)
                    ? browserStalls.recent.longTasks.entries.map((entry: any) => ({
                        name: String(entry.name ?? 'longtask'),
                        startTime: Number(entry.startTime ?? 0),
                        duration: Number(entry.duration ?? 0)
                      }))
                    : []
                },
                longAnimationFrames: {
                  count: Number(browserStalls.recent?.longAnimationFrames?.count ?? 0),
                  totalDurationMs: Number(browserStalls.recent?.longAnimationFrames?.totalDurationMs ?? 0),
                  maxDurationMs: Number(browserStalls.recent?.longAnimationFrames?.maxDurationMs ?? 0),
                  blockingDurationMs: Number(browserStalls.recent?.longAnimationFrames?.blockingDurationMs ?? 0),
                  entries: Array.isArray(browserStalls.recent?.longAnimationFrames?.entries)
                    ? browserStalls.recent.longAnimationFrames.entries.map((entry: any) => ({
                        startTime: Number(entry.startTime ?? 0),
                        duration: Number(entry.duration ?? 0),
                        blockingDuration: Number(entry.blockingDuration ?? 0)
                      }))
                    : []
                },
                userTimingByName: browserStalls.recent?.userTimingByName && typeof browserStalls.recent.userTimingByName === 'object'
                  ? Object.fromEntries(
                      Object.entries(browserStalls.recent.userTimingByName).map(([name, value]: [string, any]) => [
                        String(name),
                        {
                          count: Number(value?.count ?? 0),
                          totalDurationMs: Number(value?.totalDurationMs ?? 0),
                          maxDurationMs: Number(value?.maxDurationMs ?? 0)
                        }
                      ])
                    )
                  : undefined
              }
            } : undefined,
            terrainStreams: Array.isArray(terrainStreams)
              ? terrainStreams.map((stream: any) => ({
                  name: String(stream?.name ?? 'unknown'),
                  budgetMs: Number(stream?.budgetMs ?? 0),
                  timeMs: Number(stream?.timeMs ?? 0),
                  pendingUnits: Number(stream?.pendingUnits ?? 0),
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
                  effectPoolsMs: Number(combatProfile.timing.effectPoolsMs ?? 0),
                  influenceMapMs: Number(combatProfile.timing.influenceMapMs ?? 0),
                  aiStateMs: typeof combatProfile.timing.aiStateMs === 'object' ? combatProfile.timing.aiStateMs : undefined,
                  losCache: combatProfile.timing.losCache ? {
                    hits: Number(combatProfile.timing.losCache.hits ?? 0),
                    misses: Number(combatProfile.timing.losCache.misses ?? 0),
                    hitRate: Number(combatProfile.timing.losCache.hitRate ?? 0),
                    budgetDenials: Number(combatProfile.timing.losCache.budgetDenials ?? 0),
                    prefilterPasses: Number(combatProfile.timing.losCache.prefilterPasses ?? 0),
                    prefilterRejects: Number(combatProfile.timing.losCache.prefilterRejects ?? 0)
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
                    totalExhaustedFrames: Number(combatProfile.timing.combatFireRaycastBudget.totalExhaustedFrames ?? 0),
                    totalRequested: Number(combatProfile.timing.combatFireRaycastBudget.totalRequested ?? 0),
                    totalDenied: Number(combatProfile.timing.combatFireRaycastBudget.totalDenied ?? 0),
                    saturationRate: Number(combatProfile.timing.combatFireRaycastBudget.saturationRate ?? 0),
                    denialRate: Number(combatProfile.timing.combatFireRaycastBudget.denialRate ?? 0)
                  } : undefined,
                  aiScheduling: combatProfile.timing.aiScheduling ? {
                    frameCounter: Number(combatProfile.timing.aiScheduling.frameCounter ?? 0),
                    intervalScale: Number(combatProfile.timing.aiScheduling.intervalScale ?? 1),
                    aiBudgetMs: Number(combatProfile.timing.aiScheduling.aiBudgetMs ?? 0),
                    staggeredSkips: Number(combatProfile.timing.aiScheduling.staggeredSkips ?? 0),
                    highFullUpdates: Number(combatProfile.timing.aiScheduling.highFullUpdates ?? 0),
                    mediumFullUpdates: Number(combatProfile.timing.aiScheduling.mediumFullUpdates ?? 0),
                    maxHighFullUpdatesPerFrame: Number(combatProfile.timing.aiScheduling.maxHighFullUpdatesPerFrame ?? 0),
                    maxMediumFullUpdatesPerFrame: Number(combatProfile.timing.aiScheduling.maxMediumFullUpdatesPerFrame ?? 0),
                    aiBudgetExceededEvents: Number(combatProfile.timing.aiScheduling.aiBudgetExceededEvents ?? 0),
                    aiSevereOverBudgetEvents: Number(combatProfile.timing.aiScheduling.aiSevereOverBudgetEvents ?? 0)
                  } : undefined
                }
              : undefined,
            harnessDriver: harnessDriver ? {
              mode: String(harnessDriver.mode ?? ''),
              movementState: String(harnessDriver.movementState ?? ''),
              targetVisible: Boolean(harnessDriver.targetVisible),
              respawnCount: Number(harnessDriver.respawnCount ?? 0),
              ammoRefillCount: Number(harnessDriver.ammoRefillCount ?? 0),
              healthTopUpCount: Number(harnessDriver.healthTopUpCount ?? 0),
              lastShotAt: Number(harnessDriver.lastShotAt ?? 0),
              lastFireProbe: harnessDriver.lastFireProbe && typeof harnessDriver.lastFireProbe === 'object'
                ? harnessDriver.lastFireProbe
                : null
            } : undefined,
            systemTop: Array.isArray(report?.systemBreakdown)
              ? report.systemBreakdown.slice(0, 3).map((s: any) => ({
                  name: String(s.name ?? 'unknown'),
                  emaMs: Number(s.emaMs ?? 0),
                  peakMs: Number(s.peakMs ?? 0)
                }))
              : []
          };
        }, includeDetails), 8000);
        probeRoundTripMs.push(Date.now() - probeStart);
        sample = { ts: nowIso(), ...raw };
        sampleTick++;
      } catch {
        missedSamples++;
        sampleTick++;
      }

      if (sample) {
        runtimeSamples.push(sample);
        finalFrameCount = sample.frameCount;
        const denialRatePct = Number(sample.combatBreakdown?.raycastBudget?.denialRate ?? 0) * 100;
        const aiStarve = Number(sample.combatBreakdown?.aiScheduling?.aiBudgetExceededEvents ?? 0);
        const drawCalls = Number(sample.renderer?.drawCalls ?? 0);
        const triangles = Number(sample.renderer?.triangles ?? 0);
        const recentLongTasks = Number(sample.browserStalls?.recent?.longTasks?.count ?? 0);
        const recentLoafs = Number(sample.browserStalls?.recent?.longAnimationFrames?.count ?? 0);
        const topTerrainStream = Array.isArray(sample.terrainStreams) && sample.terrainStreams.length > 0
          ? [...sample.terrainStreams].sort((a, b) => {
              const pendingDelta = Number(b.pendingUnits ?? 0) - Number(a.pendingUnits ?? 0);
              if (pendingDelta !== 0) return pendingDelta;
              return Number(b.timeMs ?? 0) - Number(a.timeMs ?? 0);
            })[0]
          : null;
        const driverReason = typeof sample.harnessDriver?.lastFireProbe?.reason === 'string'
          ? String(sample.harnessDriver?.lastFireProbe?.reason)
          : '';
        const driverMovement = sample.harnessDriver?.movementState ? String(sample.harnessDriver.movementState) : '';
        const driverSuffix = driverReason || driverMovement
          ? ` driver=${driverMovement || 'unknown'} probe=${driverReason || 'unknown'}`
          : '';
        const terrainSuffix = topTerrainStream
          ? ` terrain=${topTerrainStream.name}:${Number(topTerrainStream.timeMs ?? 0).toFixed(2)}ms/${Number(topTerrainStream.budgetMs ?? 0).toFixed(2)}ms pending=${Number(topTerrainStream.pendingUnits ?? 0)}`
          : '';
        logStep(`sample frame=${sample.frameCount} avg=${sample.avgFrameMs.toFixed(2)}ms p99=${Number(sample.p99FrameMs ?? 0).toFixed(2)}ms max=${Number(sample.maxFrameMs ?? 0).toFixed(2)}ms h50=${Number(sample.hitch50Count ?? 0)} shots=${Number(sample.shotsThisSession ?? 0)} hits=${Number(sample.hitsThisSession ?? 0)} hitRate=${(Number(sample.hitRate ?? 0) * 100).toFixed(1)}% draw=${drawCalls} tri=${triangles} rayDeny=${denialRatePct.toFixed(1)}% aiStarve=${aiStarve} longTasks=${recentLongTasks} loafs=${recentLoafs}${terrainSuffix}${driverSuffix}`);
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

    stage = 'stop-cdp';
    let cpuProfile: any = null;
    let heapProfile: any = null;
    const shouldAttemptHeavyCdpShutdown = startupState.started && missedSamples === 0;
    if (cdpStarted && cdp && shouldAttemptHeavyCdpShutdown) {
      try {
        cpuProfile = await withTimeout('Profiler.stop', cdp.send('Profiler.stop'), CDP_STOP_TIMEOUT_MS);
      } catch (error) {
        logStep(`⚠ Profiler.stop failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      try {
        heapProfile = await withTimeout('HeapProfiler.stopSampling', cdp.send('HeapProfiler.stopSampling'), CDP_STOP_TIMEOUT_MS);
      } catch (error) {
        logStep(`⚠ HeapProfiler.stopSampling failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      try {
        chromeTrace = await stopChromeTracing(cdp);
      } catch (error) {
        logStep(`⚠ stopChromeTracing failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (cdpStarted) {
      logStep('⚠ Skipping heavy CDP shutdown capture due unstable startup or blocked runtime samples');
    }
    const hitValidationMode: 'strict' | 'relaxed' | 'critical' | 'off' =
      enableCombat && activePlayerScenario
        ? (requestedMode === 'open_frontier' ? 'critical' : requestedMode === 'a_shau_valley' ? 'relaxed' : 'strict')
        : 'off';
    validation = validateRun(runtimeSamples, consoleEntries, durationSeconds, {
      hitValidation: hitValidationMode,
      sampleIntervalMs
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

    stage = 'write-artifacts';
    if (page) {
      movementViewerPayload = await safeAwait(
        'movement-viewer-payload',
        captureMovementViewerPayload(page),
        10_000
      );
      movementArtifacts = movementViewerPayload?.movementArtifacts ?? null;
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
    writeFileSync(join(artifactDir, 'validation.json'), JSON.stringify(validation, null, 2), 'utf-8');
    if (startupDiagnostics) {
      writeFileSync(join(artifactDir, 'startup-diagnostics.json'), JSON.stringify(startupDiagnostics, null, 2), 'utf-8');
    }
    if (startupTimeline) {
      writeFileSync(join(artifactDir, 'startup-timeline.json'), JSON.stringify(startupTimeline, null, 2), 'utf-8');
    }

    if (startupState.started) {
      await safeAwait('page.screenshot', page.screenshot({ path: join(artifactDir, 'final-frame.png'), fullPage: false }), 3_000);
    }
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
      if (page) {
        writeFileSync(join(artifactDir, 'console.json'), JSON.stringify(consoleEntries, null, 2), 'utf-8');
        writeFileSync(join(artifactDir, 'runtime-samples.json'), JSON.stringify(runtimeSamples, null, 2), 'utf-8');
      }
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
        writeFileSync(join(artifactDir, 'validation.json'), JSON.stringify(validation, null, 2), 'utf-8');
      }
      const summary: CaptureSummary = {
        startedAt,
        endedAt: nowIso(),
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
          detailEverySamples
        },
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
        }
      };
      writeFileSync(join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
      console.log(`\nArtifacts: ${artifactDir}`);
    } catch {
      // best effort only
    }
    stage = 'cleanup-context';
    if (page && activeScenarioStarted) {
      await stopActiveScenarioDriver(page);
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
