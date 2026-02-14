#!/usr/bin/env tsx

import { chromium, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { execSync, spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Socket } from 'net';

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
    losCache?: { hits: number; misses: number; hitRate: number; budgetDenials: number };
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
  systemTop: Array<{ name: string; emaMs: number; peakMs: number }>;
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

type StartupDiagnostics = {
  ts: string;
  readyState: string;
  hasMetrics: boolean;
  hasEngine: boolean;
  hasPerfApi: boolean;
  bodyClassName: string;
  errorPanelVisible: boolean;
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
const DEFAULT_STARTUP_TIMEOUT_SECONDS = 60;
const DEFAULT_STARTUP_FRAME_THRESHOLD = 30;
const DEFAULT_ACTIVE_PLAYER = true;
const DEFAULT_GAME_MODE = 'ai_sandbox';
const DEFAULT_COMPRESS_FRONTLINE = true;
const DEFAULT_ALLOW_WARP_RECOVERY = false;
const DEFAULT_MOVEMENT_DECISION_INTERVAL_MS = 450;
const DEFAULT_PREWARM = true;
const DEFAULT_RUNTIME_PREFLIGHT = true;
const DEFAULT_FRONTLINE_TRIGGER_DISTANCE = 500;
const DEFAULT_MAX_COMPRESSED_PER_FACTION = 28;
const DEFAULT_SAMPLE_INTERVAL_MS = 1000;
const DEFAULT_DETAIL_EVERY_SAMPLES = 1;
const STEP_TIMEOUT_MS = 30_000;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const RUN_HARD_TIMEOUT_MS = 120_000;
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

function normalizeGameMode(mode: string): 'ai_sandbox' | 'open_frontier' | 'zone_control' | 'team_deathmatch' {
  const normalized = String(mode ?? '').trim().toLowerCase();
  if (
    normalized === 'open_frontier' ||
    normalized === 'zone_control' ||
    normalized === 'team_deathmatch' ||
    normalized === 'ai_sandbox'
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

function validateRun(
  runtimeSamples: RuntimeSample[],
  consoleEntries: ConsoleEntry[],
  durationSeconds: number,
  options?: { requireHitValidation?: boolean; sampleIntervalMs?: number }
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

  if (options?.requireHitValidation) {
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

    checks.push({
      id: 'player_shots_recorded',
      status: maxShots >= 5 ? 'pass' : maxShots > 0 ? 'warn' : 'fail',
      value: maxShots,
      message: `Recorded player shots in sim=${maxShots}`
    });

    checks.push({
      id: 'player_hits_recorded',
      status: maxHits >= 1 ? 'pass' : 'fail',
      value: maxHits,
      message: `Recorded player hits in sim=${maxHits}`
    });

    checks.push({
      id: 'player_hit_rate_peak',
      status: peakHitRate >= 0.02 ? 'pass' : peakHitRate > 0 ? 'warn' : 'fail',
      value: peakHitRate,
      message: `Peak hit rate ${(peakHitRate * 100).toFixed(2)}%`
    });
  }

  const heapSamples = runtimeSamples.filter(s => typeof s.heapUsedMb === 'number');
  if (heapSamples.length >= 2) {
    const firstHeap = heapSamples[0].heapUsedMb ?? 0;
    const lastHeap = heapSamples[heapSamples.length - 1].heapUsedMb ?? 0;
    const heapDelta = lastHeap - firstHeap;
    checks.push({
      id: 'heap_growth_mb',
      status: heapDelta < 20 ? 'pass' : heapDelta < 80 ? 'warn' : 'fail',
      value: heapDelta,
      message: `Heap growth ${heapDelta.toFixed(2)} MB over capture window`
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

async function startDevServer(port: number): Promise<ChildProcess> {
  logStep(`🚀 Starting dev server on port ${port}`);
  const server = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--host'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: true
  });

  return new Promise((resolve, reject) => {
    let output = '';
    let resolved = false;
    const timeout = setTimeout(() => {
      server.kill();
      reject(new Error('Dev server startup timeout'));
    }, STEP_TIMEOUT_MS);

    server.stdout?.on('data', (data) => {
      output += data.toString();
      if (!resolved && (output.includes('Local:') || output.includes('localhost'))) {
        resolved = true;
        clearTimeout(timeout);
        logStep('✅ Dev server ready');
        resolve(server);
      }
    });

    server.stderr?.on('data', (data) => {
      console.error('[dev-server]', data.toString().trim());
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const onDone = (open: boolean) => {
      try { socket.destroy(); } catch { /* noop */ }
      resolve(open);
    };
    socket.setTimeout(800);
    socket.once('connect', () => onDone(true));
    socket.once('error', () => onDone(false));
    socket.once('timeout', () => onDone(false));
    socket.connect(port, host);
  });
}

function cleanupPortListeners(port: number): void {
  if (process.platform !== 'win32') return;

  try {
    const output = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf-8' });
    const pids = output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.split(/\s+/))
      .filter(parts => parts.length >= 5 && parts[3] === 'LISTENING')
      .map(parts => Number(parts[4]))
      .filter(pid => Number.isFinite(pid) && pid > 0);

    for (const pid of new Set(pids)) {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
      logStep(`🧹 Cleared stale listener on :${port} (pid=${pid})`);
    }
  } catch {
    // best effort; no active listener is expected on most runs
  }
}

async function killDevServer(server: ChildProcess): Promise<void> {
  logStep('🛑 Stopping dev server');
  if (!server.pid) return;

  await new Promise<void>((resolve) => {
    server.on('exit', () => resolve());
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
    } else {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        server.kill('SIGTERM');
      }
    }
    setTimeout(resolve, 5000);
  });
  logStep('✅ Dev server stopped');
}

async function prewarmDevServer(port: number): Promise<{ totalMs: number; allOk: boolean }> {
  const start = Date.now();
  const paths = ['/', '/?sandbox=true&autostart=false'];
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
  startupTimeoutSeconds: number
): Promise<{ totalMs: number; ok: boolean; reason?: string }> {
  const start = Date.now();
  try {
    logStep(`🧪 Runtime preflight navigate ${preflightUrl}`);
    await withTimeout('preflight page.goto', page.goto(preflightUrl, { waitUntil: 'commit' }), STEP_TIMEOUT_MS);
    await withTimeout(
      'preflight wait runtime',
      page.waitForFunction(
        () => Boolean((window as any).__startupTelemetry?.getSnapshot?.() && (window as any).__metrics),
        undefined,
        { timeout: startupTimeoutSeconds * 1000 }
      ),
      startupTimeoutSeconds * 1000 + 1000
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
  let firstEngineSeenSec: number | undefined;
  let firstMetricsSeenSec: number | undefined;
  let lastStartupMark: string | undefined;
  let lastStartupMarkMs: number | undefined;
  for (let i = 0; i < maxSamples; i++) {
    await sleep(probeIntervalSeconds * 1000);
    try {
      const probe = await getStartupProbe(page);
      count = probe.frameCount;
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
      logStep(`Startup frame sample ${((i + 1) * probeIntervalSeconds)}s -> ${count} (ready=${probe.readyState} engine=${probe.hasEngine ? 1 : 0} metrics=${probe.hasMetrics ? 1 : 0} errPanel=${probe.uiErrorPanelVisible ? 1 : 0})${startupMsg}${combatMsg}`);
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

type ActiveScenarioOptions = {
  enabled: boolean;
  mode: string;
  compressFrontline: boolean;
  allowWarpRecovery: boolean;
  movementDecisionIntervalMs: number;
  frontlineTriggerDistance: number;
  maxCompressedPerFaction: number;
};

async function setupActiveScenarioDriver(page: Page, options: ActiveScenarioOptions): Promise<void> {
  if (!options.enabled) return;

  await withTimeout(
    'inject active scenario driver',
    page.addScriptTag({ path: join(process.cwd(), 'scripts', 'perf-active-driver.js') }),
    SCENARIO_SETUP_TIMEOUT_MS
  );

  const setupResult = await withTimeout(
    'active scenario setup',
    page.evaluate((opts) => (window as any).__perfHarnessDriver.start(opts), options),
    SCENARIO_SETUP_TIMEOUT_MS
  );

  logStep(
    `🎮 Active scenario driver enabled (patterns=${Number(setupResult?.movementPatternCount ?? 0)}, mode=${String(setupResult?.mode ?? options.mode)}, compressFrontline=${Boolean(setupResult?.compressFrontline)}, allowWarpRecovery=${Boolean(setupResult?.allowWarpRecovery)})`
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
      `🎮 Active driver stopped (respawns=${result.respawnCount}, frontlineCompressed=${result.frontlineCompressed}, frontlineDistance=${Number(result.frontlineDistance ?? 0).toFixed(1)}, moved=${result.frontlineMoveCount ?? 0})`
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
  const movementDecisionIntervalMs = parseNumberFlag('movement-decision-interval-ms', DEFAULT_MOVEMENT_DECISION_INTERVAL_MS);
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
  const frontlineTriggerDistance = parseNumberFlag('frontline-trigger-distance', DEFAULT_FRONTLINE_TRIGGER_DISTANCE);
  const maxCompressedPerFaction = parseNumberFlag('frontline-compressed-per-faction', DEFAULT_MAX_COMPRESSED_PER_FACTION);
  const logLevel = String(process.env.PERF_LOG_LEVEL ?? process.argv.find(a => a.startsWith('--log-level='))?.split('=')[1] ?? 'warn');
  const reuseDevServer = parseBooleanFlag('reuse-dev-server', true);
  const effectiveNpcs = enableCombat ? npcs : 0;
  const artifactDir = makeArtifactDir();
  const browserProfileDir = join(artifactDir, 'browser-profile');
  mkdirSync(browserProfileDir, { recursive: true });
  logStep(`Config duration=${durationSeconds}s warmup=${warmupSeconds}s npcs=${effectiveNpcs} (requested=${npcs}) mode=${requestedMode} startupTimeout=${startupTimeoutSeconds}s startupFrameThreshold=${startupFrameThreshold} port=${port} headed=${headed} devtools=${devtools} playwrightTrace=${playwrightTrace} deepCdp=${deepCdp} combat=${enableCombat} activePlayer=${activePlayerScenario} compressFrontline=${compressFrontline} allowWarpRecovery=${allowWarpRecovery} movementDecisionIntervalMs=${movementDecisionIntervalMs} sampleIntervalMs=${sampleIntervalMs} detailEverySamples=${detailEverySamples} prewarm=${prewarm} runtimePreflight=${runtimePreflight} reuseDevServer=${reuseDevServer}`);

  let server: ChildProcess | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let cdp: CDPSession | null = null;
  let chromeTrace = '';
  let finalFrameCount = 0;
  const consoleEntries: ConsoleEntry[] = [];
  const runtimeSamples: RuntimeSample[] = [];
  const probeRoundTripMs: number[] = [];
  const startedAt = nowIso();
  const combatParam = enableCombat ? '1' : '0';
  const autostart = requestedMode === 'ai_sandbox' ? 'true' : 'false';
  const url = `http://localhost:${port}/?sandbox=true&npcs=${effectiveNpcs}&autostart=${autostart}&duration=${durationSeconds}&combat=${combatParam}&logLevel=${encodeURIComponent(logLevel)}`;
  const preflightUrl = `http://localhost:${port}/?sandbox=true&npcs=${effectiveNpcs}&autostart=false&duration=0&combat=${combatParam}&logLevel=${encodeURIComponent(logLevel)}`;
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
  let startedDevServer = false;

  try {
    acquireRunLock();
    hardTimeout = setTimeout(() => {
      const reason = `Hard timeout reached at stage=${stage}`;
      console.error(reason);
      process.exit(1);
    }, RUN_HARD_TIMEOUT_MS);

    stage = 'start-dev-server';
    if (reuseDevServer && await isPortOpen(port)) {
      logStep(`♻ Reusing existing dev server on port ${port}`);
    } else {
      cleanupPortListeners(port);
      server = await startDevServer(port);
      startedDevServer = true;
      await sleep(2000);
    }
    if (prewarm) {
      stage = 'prewarm-dev-server';
      prewarmResult = await prewarmDevServer(port);
      logStep(`🔥 Dev-server prewarm completed in ${prewarmResult.totalMs}ms (allOk=${prewarmResult.allOk})`);
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
        '--disable-frame-rate-limit'
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
      runtimePreflightResult = await preflightRuntimePage(page, preflightUrl, startupTimeoutSeconds);
      logStep(`🧪 Runtime preflight completed in ${runtimePreflightResult.totalMs}ms (ok=${runtimePreflightResult.ok})`);
      if (!runtimePreflightResult.ok) {
        logStep(`⚠ Runtime preflight failed: ${runtimePreflightResult.reason ?? 'unknown'}`);
      }
    }

    stage = 'navigate-and-startup';
    logStep(`📍 Navigating to ${url}`);
    await withTimeout('page.goto', page.goto(url, { waitUntil: 'commit' }), STEP_TIMEOUT_MS);
    if (requestedMode !== 'ai_sandbox') {
      await withTimeout(
        'wait __engine',
        page.waitForFunction(() => Boolean((window as any).__engine), undefined, { timeout: startupTimeoutSeconds * 1000 }),
        startupTimeoutSeconds * 1000 + 1000
      );
      const modeStartResult = await safeAwait(
        `start mode ${requestedMode}`,
        page.evaluate(async (mode: string) => {
          const engine = (window as any).__engine;
          if (!engine || typeof engine.startGameWithMode !== 'function') {
            return { ok: false, reason: 'engine unavailable' };
          }
          try {
            await engine.startGameWithMode(mode);
            return { ok: true };
          } catch (error) {
            return { ok: false, reason: error instanceof Error ? error.message : String(error) };
          }
        }, requestedMode),
        STEP_TIMEOUT_MS
      );
      if (!modeStartResult || !modeStartResult.ok) {
        throw new Error(`Failed to start requested mode ${requestedMode}: ${modeStartResult?.reason ?? 'unknown'}`);
      }
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
          errorPanelVisible: Boolean(document.querySelector('.error-panel'))
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
          movementDecisionIntervalMs,
          frontlineTriggerDistance,
          maxCompressedPerFaction
        });
        activeScenarioStarted = activePlayerScenario;
      }
      await warmupRuntime(page, warmupSeconds);
      // Reset rolling metrics so sampling reflects steady-state window, not startup cost.
      await safeAwait(
        'reset in-page metrics',
        page.evaluate(() => {
          (window as any).__metrics?.reset?.();
          (window as any).perf?.reset?.();
        }),
        3000
      );
    }

    stage = 'sample-runtime';
    logStep(`🎯 Capturing profiling data for ${durationSeconds}s`);
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
          const basicValidation = perf?.validate?.();
          const report = shouldIncludeDetails ? perf?.report?.() : null;
          const combatProfile = shouldIncludeDetails ? (window as any).combatProfile?.() : null;
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
                    budgetDenials: Number(combatProfile.timing.losCache.budgetDenials ?? 0)
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
        logStep(`sample frame=${sample.frameCount} avg=${sample.avgFrameMs.toFixed(2)}ms p99=${Number(sample.p99FrameMs ?? 0).toFixed(2)}ms max=${Number(sample.maxFrameMs ?? 0).toFixed(2)}ms h50=${Number(sample.hitch50Count ?? 0)} shots=${Number(sample.shotsThisSession ?? 0)} hits=${Number(sample.hitsThisSession ?? 0)} hitRate=${(Number(sample.hitRate ?? 0) * 100).toFixed(1)}% rayDeny=${denialRatePct.toFixed(1)}% aiStarve=${aiStarve}`);
      }
    }
    if (missedSamples > 0) {
      logStep(`⚠ Missed ${missedSamples} runtime samples due to main-thread blocking`);
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
    validation = validateRun(runtimeSamples, consoleEntries, durationSeconds, {
      requireHitValidation: enableCombat && activePlayerScenario,
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
              ? 'Automated large-scale jungle firefight with scripted player movement/firing, forced ground-level engagement, and instant respawn to keep sampling in active combat.'
              : 'Automated large-scale jungle firefight with active AI squads, combat simulation, terrain streaming, and rendering load; no objective play loop focus.'
            : 'Automated sandbox flywheel with combat AI disabled for control baseline (render/terrain/harness overhead isolation).',
          systemsEmphasized: enableCombat
            ? activePlayerScenario
              ? requestedMode === 'open_frontier'
                ? ['Combat AI', 'Open-frontier zone flow', 'Player input/fire loop', 'Respawn pipeline', 'Terrain chunking', 'Core frame scheduling']
                : ['Combat AI', 'Player input/fire loop', 'Respawn pipeline', 'Terrain chunking', 'Core frame scheduling']
              : requestedMode === 'open_frontier'
                ? ['Combat AI', 'Open-frontier zone flow', 'Terrain chunking', 'Billboard rendering', 'Core frame scheduling']
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
    if (server && startedDevServer && !reuseDevServer) {
      await safeAwait('killDevServer', killDevServer(server), 12_000);
    } else if (server && startedDevServer && reuseDevServer) {
      logStep('♻ Leaving dev server running for reuse');
    }
    forceKillPlaywrightBrowsers(browserProfileDir);
    if (hardTimeout) {
      clearTimeout(hardTimeout);
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
