#!/usr/bin/env tsx

import { chromium } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Socket } from 'net';
import { localAppUrl } from './app-url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SubsystemStatus = 'pass' | 'warn' | 'fail';

type SubsystemResult = {
  name: string;
  status: SubsystemStatus;
  metrics: Record<string, number>;
  details?: string;
};

type ProbeReport = {
  timestamp: string;
  mode: string;
  durationSeconds: number;
  subsystems: SubsystemResult[];
  overall: SubsystemStatus;
  startupTiming?: Record<string, unknown>;
  consoleSummary: { errors: number; warnings: number };
  samples: Record<string, unknown>[];
};

type MetricsSnapshot = {
  frameCount: number;
  avgFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  maxFrameMs: number;
  hitch33Count: number;
  hitch50Count: number;
  hitch100Count: number;
  combatantCount: number;
  firingCount: number;
  engagingCount: number;
};

type PerfReport = {
  topSystems?: Array<{ name: string; emaMs: number; peakMs: number }>;
  spatialGrid?: Record<string, unknown>;
  hitDetection?: Record<string, unknown>;
  gpu?: Record<string, unknown>;
};

type CombatProfile = {
  aiStateMs?: Record<string, number>;
  losCache?: { hits: number; misses: number; hitRate: number; budgetDenials: number };
  raycastBudget?: { saturationRate: number; denialRate: number };
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEV_SERVER_PORT = 9100;
const STEP_TIMEOUT_MS = 30_000;
const STARTUP_TIMEOUT_MS = 120_000;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'probe');

const AVAILABLE_MODES = ['tdm', 'zone_control', 'open_frontier', 'a_shau_valley'] as const;
type GameMode = (typeof AVAILABLE_MODES)[number];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function logStep(msg: string): void {
  console.log(`[${nowIso()}] ${msg}`);
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseStringFlag(name: string, fallback: string): string {
  const eqArg = process.argv.find(a => a.startsWith(`--${name}=`));
  if (eqArg) return String(eqArg.split('=')[1] ?? fallback);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < process.argv.length) {
    return String(process.argv[index + 1]);
  }
  return fallback;
}

function parseNumberFlag(name: string, fallback: number): number {
  const raw = parseStringFlag(name, String(fallback));
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

// ---------------------------------------------------------------------------
// Dev server management
// ---------------------------------------------------------------------------

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

async function startDevServer(port: number): Promise<ChildProcess> {
  logStep(`Starting dev server on port ${port}`);
  const server = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--host'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: true,
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
        logStep('Dev server ready');
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

async function killDevServer(server: ChildProcess): Promise<void> {
  logStep('Stopping dev server');
  if (!server.pid) return;

  await new Promise<void>((resolve) => {
    server.on('exit', () => resolve());
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
    } else {
      server.kill('SIGTERM');
    }
    setTimeout(resolve, 3000);
  });
}

// ---------------------------------------------------------------------------
// Threshold evaluation
// ---------------------------------------------------------------------------

function evaluateRendering(samples: MetricsSnapshot[]): SubsystemResult {
  if (samples.length === 0) {
    return { name: 'Rendering', status: 'fail', metrics: {}, details: 'No samples collected' };
  }

  const last = samples[samples.length - 1];
  const avgFrameMs = last.avgFrameMs;
  const p99FrameMs = last.p99FrameMs;

  let status: SubsystemStatus = 'pass';
  const reasons: string[] = [];

  if (avgFrameMs >= 25) { status = 'fail'; reasons.push(`avgFrameMs=${avgFrameMs.toFixed(1)} (>=25)`); }
  else if (avgFrameMs >= 16) { status = 'warn'; reasons.push(`avgFrameMs=${avgFrameMs.toFixed(1)} (>=16)`); }

  if (p99FrameMs >= 50) { status = 'fail'; reasons.push(`p99FrameMs=${p99FrameMs.toFixed(1)} (>=50)`); }
  else if (p99FrameMs >= 33) {
    if (status !== 'fail') status = 'warn';
    reasons.push(`p99FrameMs=${p99FrameMs.toFixed(1)} (>=33)`);
  }

  return {
    name: 'Rendering',
    status,
    metrics: { avgFrameMs, p99FrameMs, maxFrameMs: last.maxFrameMs ?? 0, frameCount: last.frameCount },
    details: reasons.length > 0 ? reasons.join('; ') : undefined,
  };
}

function evaluateCombat(profiles: CombatProfile[]): SubsystemResult {
  const metrics: Record<string, number> = {};
  let status: SubsystemStatus = 'pass';
  const reasons: string[] = [];

  const validProfiles = profiles.filter(p => p.losCache);
  if (validProfiles.length === 0) {
    return { name: 'Combat', status: 'pass', metrics: {}, details: 'Skipped (no combat profile data available)' };
  }

  const lastLos = validProfiles[validProfiles.length - 1].losCache!;
  const hitRate = lastLos.hitRate * 100;
  metrics.losCacheHitRatePct = hitRate;

  if (hitRate <= 40) { status = 'fail'; reasons.push(`LOS cache hit rate ${hitRate.toFixed(1)}% (<=40%)`); }
  else if (hitRate <= 60) { status = 'warn'; reasons.push(`LOS cache hit rate ${hitRate.toFixed(1)}% (<=60%)`); }

  const validRaycast = profiles.filter(p => p.raycastBudget);
  if (validRaycast.length > 0) {
    const lastRay = validRaycast[validRaycast.length - 1].raycastBudget!;
    const satPct = lastRay.saturationRate * 100;
    metrics.raycastSaturationPct = satPct;

    if (satPct >= 95) { status = 'fail'; reasons.push(`Raycast saturation ${satPct.toFixed(1)}% (>=95%)`); }
    else if (satPct >= 80) {
      if (status !== 'fail') status = 'warn';
      reasons.push(`Raycast saturation ${satPct.toFixed(1)}% (>=80%)`);
    }
  }

  return { name: 'Combat', status, metrics, details: reasons.length > 0 ? reasons.join('; ') : undefined };
}

function evaluateAI(profiles: CombatProfile[]): SubsystemResult {
  const metrics: Record<string, number> = {};
  let status: SubsystemStatus = 'pass';
  const reasons: string[] = [];

  const validProfiles = profiles.filter(p => p.aiStateMs);
  if (validProfiles.length === 0) {
    return { name: 'AI', status: 'pass', metrics: {}, details: 'Skipped (no AI state data available)' };
  }

  // Check last profile for stuck NPCs: any single state taking >80% of total suggests stuck NPCs
  const lastAi = validProfiles[validProfiles.length - 1].aiStateMs!;
  const totalMs = Object.values(lastAi).reduce((s, v) => s + v, 0);
  if (totalMs > 0) {
    const maxStateMs = Math.max(...Object.values(lastAi));
    const maxStatePct = (maxStateMs / totalMs) * 100;
    metrics.dominantStatePct = maxStatePct;
    metrics.stateCount = Object.keys(lastAi).length;

    // Use 15% stuck threshold mapped to dominant state
    if (maxStatePct >= 85) { status = 'fail'; reasons.push(`Dominant AI state at ${maxStatePct.toFixed(1)}%`); }
    else if (maxStatePct >= 70) { status = 'warn'; reasons.push(`Dominant AI state at ${maxStatePct.toFixed(1)}%`); }
  }

  return { name: 'AI', status, metrics, details: reasons.length > 0 ? reasons.join('; ') : undefined };
}

function evaluateMemory(heapSamples: { heapUsedMb: number; ts: number }[]): SubsystemResult {
  const metrics: Record<string, number> = {};
  let status: SubsystemStatus = 'pass';
  const reasons: string[] = [];

  if (heapSamples.length < 2) {
    return { name: 'Memory', status: 'pass', metrics: {}, details: 'Insufficient heap samples' };
  }

  // Skip initial asset-loading warmup to avoid false positives.
  // For runs >15s, skip the first 10s; for shorter runs, skip 5s.
  const runStart = heapSamples[0].ts;
  const runEnd = heapSamples[heapSamples.length - 1].ts;
  const totalDurationSec = (runEnd - runStart) / 1000;
  const warmupMs = totalDurationSec > 15 ? 10_000 : 5_000;
  const warmedSamples = heapSamples.filter(s => s.ts - runStart >= warmupMs);

  if (warmedSamples.length < 2) {
    return { name: 'Memory', status: 'pass', metrics: {}, details: 'Insufficient post-warmup heap samples' };
  }

  const first = warmedSamples[0];
  const last = warmedSamples[warmedSamples.length - 1];
  const elapsedMin = (last.ts - first.ts) / 60000;

  if (elapsedMin > 0 && first.heapUsedMb > 0) {
    const growthPct = ((last.heapUsedMb - first.heapUsedMb) / first.heapUsedMb) * 100;
    const growthPerMin = growthPct / elapsedMin;
    metrics.heapGrowthPctPerMin = growthPerMin;
    metrics.heapStartMb = first.heapUsedMb;
    metrics.heapEndMb = last.heapUsedMb;
    metrics.warmupSkippedMs = warmupMs;

    if (growthPerMin >= 10) { status = 'fail'; reasons.push(`Heap growth ${growthPerMin.toFixed(1)}%/min (>=10%)`); }
    else if (growthPerMin >= 5) { status = 'warn'; reasons.push(`Heap growth ${growthPerMin.toFixed(1)}%/min (>=5%)`); }
  }

  return { name: 'Memory', status, metrics, details: reasons.length > 0 ? reasons.join('; ') : undefined };
}

function evaluateConsole(errors: number, warnings: number): SubsystemResult {
  let status: SubsystemStatus = 'pass';
  const reasons: string[] = [];

  if (errors >= 3) { status = 'fail'; reasons.push(`${errors} console errors (>=3)`); }
  else if (errors > 0) { status = 'warn'; reasons.push(`${errors} console error(s)`); }

  return {
    name: 'Console',
    status,
    metrics: { errorCount: errors, warningCount: warnings },
    details: reasons.length > 0 ? reasons.join('; ') : undefined,
  };
}

function overallStatus(subsystems: SubsystemResult[]): SubsystemStatus {
  if (subsystems.some(s => s.status === 'fail')) return 'fail';
  if (subsystems.some(s => s.status === 'warn')) return 'warn';
  return 'pass';
}

// ---------------------------------------------------------------------------
// Probe a single mode
// ---------------------------------------------------------------------------

async function probeMode(mode: GameMode, durationSec: number, port: number, headed: boolean): Promise<ProbeReport> {
  const url = localAppUrl({ port, query: { perf: true } });
  logStep(`Probing mode: ${mode} for ${durationSec}s at ${url}`);

  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];

  const browser = await chromium.launch({
    headless: !headed,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore WebGL extension warnings and Vite HMR noise
        if (!text.includes('KHR_parallel_shader_compile') &&
            !text.includes('send was called before connect') &&
            !text.includes('@vite/client')) {
          consoleErrors.push(text);
        }
      } else if (msg.type() === 'warning') {
        consoleWarnings.push(msg.text());
      }
    });
    page.on('pageerror', (error) => {
      consoleErrors.push(String(error?.stack ?? error));
    });

    // Navigate
    await page.goto(url, { waitUntil: 'commit', timeout: STARTUP_TIMEOUT_MS });

    // Wait for engine to be available
    logStep('Waiting for engine');
    await page.waitForFunction(() => {
      const w = window as unknown as Record<string, unknown>;
      return !!w.__engine;
    }, undefined, { timeout: STARTUP_TIMEOUT_MS });

    // Start game mode programmatically (same approach as perf-capture.ts)
    logStep(`Starting mode: ${mode}`);
    await page.evaluate((m: string) => {
      const engine = (window as any).__engine;
      engine.startGameWithMode(m);
    }, mode);

    // Wait for gameplay to start
    logStep('Waiting for gameplay');
    await page.waitForFunction(() => {
      const engine = (window as any).__engine;
      return engine?.gameStarted;
    }, undefined, { timeout: 60_000 });

    // Wait for metrics to populate
    await page.waitForFunction(() => {
      const w = window as unknown as Record<string, unknown>;
      return !!w.__metrics;
    }, undefined, { timeout: 10_000 });

    // Capture startup telemetry
    const startupTiming = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const telemetry = w.__startupTelemetry as { getSnapshot?: () => unknown } | undefined;
      return telemetry?.getSnapshot?.() ?? null;
    }).catch(() => null);

    logStep(`Engine ready. Running for ${durationSec}s...`);

    // Sample loop
    const metricsSamples: MetricsSnapshot[] = [];
    const combatProfiles: CombatProfile[] = [];
    const heapSamples: { heapUsedMb: number; ts: number }[] = [];
    const allSamples: Record<string, unknown>[] = [];
    let perfApiWarningLogged = false;

    const startMs = Date.now();
    const endMs = startMs + durationSec * 1000;

    while (Date.now() < endMs) {
      await sleep(1000);

      const sample = await page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        const metrics = w.__metrics as { getSnapshot?: () => Record<string, unknown> } | undefined;
        const perf = w.perf as { report?: () => unknown; getMovement?: () => unknown } | undefined;
        const combatProfileFn = w.combatProfile as (() => unknown) | undefined;

        const snapshot = metrics?.getSnapshot?.() ?? null;
        const perfReport = perf?.report?.() ?? null;
        const combat = combatProfileFn?.() ?? null;
        const movement = perf?.getMovement?.() ?? null;

        // Heap from performance.memory (Chrome-only)
        const perfMemory = (performance as unknown as Record<string, unknown>).memory as
          { usedJSHeapSize?: number; totalJSHeapSize?: number } | undefined;
        const heapUsedMb = perfMemory?.usedJSHeapSize
          ? perfMemory.usedJSHeapSize / (1024 * 1024)
          : 0;

        return { snapshot, perfReport, combat, movement, heapUsedMb, ts: Date.now() };
      }).catch(() => null);

      if (sample) {
        allSamples.push(sample as Record<string, unknown>);
        if (sample.snapshot) {
          metricsSamples.push(sample.snapshot as unknown as MetricsSnapshot);
        }
        if (sample.combat) {
          combatProfiles.push(sample.combat as CombatProfile);
        } else if (!perfApiWarningLogged && allSamples.length >= 3) {
          logStep('Perf API not yet available - combat/AI profiles may be skipped');
          perfApiWarningLogged = true;
        }
        if (sample.heapUsedMb > 0) {
          heapSamples.push({ heapUsedMb: sample.heapUsedMb, ts: sample.ts });
        }
      }
    }

    logStep(`Collected ${allSamples.length} samples`);

    // Evaluate subsystems
    const subsystems: SubsystemResult[] = [
      evaluateRendering(metricsSamples),
      evaluateCombat(combatProfiles),
      evaluateAI(combatProfiles),
      evaluateMemory(heapSamples),
      evaluateConsole(consoleErrors.length, consoleWarnings.length),
    ];

    const report: ProbeReport = {
      timestamp: nowIso(),
      mode,
      durationSeconds: durationSec,
      subsystems,
      overall: overallStatus(subsystems),
      startupTiming: (startupTiming as Record<string, unknown>) ?? undefined,
      consoleSummary: { errors: consoleErrors.length, warnings: consoleWarnings.length },
      samples: allSamples,
    };

    return report;
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Console summary table
// ---------------------------------------------------------------------------

function printSummaryTable(report: ProbeReport): void {
  const statusIcon = (s: SubsystemStatus): string => {
    if (s === 'pass') return 'PASS';
    if (s === 'warn') return 'WARN';
    return 'FAIL';
  };

  console.log('');
  console.log(`=== Engine Health Probe: ${report.mode} ===`);
  console.log(`Duration: ${report.durationSeconds}s | Samples: ${report.samples.length} | Overall: ${statusIcon(report.overall)}`);
  console.log('');
  console.log('  Subsystem    Status  Key Metrics');
  console.log('  ------------ ------  ----------------------------------------');

  for (const sub of report.subsystems) {
    const metricsStr = Object.entries(sub.metrics)
      .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(1) : v}`)
      .join(', ');
    const detail = sub.details ? ` -- ${sub.details}` : '';
    console.log(`  ${sub.name.padEnd(13)} ${statusIcon(sub.status).padEnd(6)}  ${metricsStr}${detail}`);
  }

  console.log('');
  if (report.consoleSummary.errors > 0) {
    console.log(`  Console errors: ${report.consoleSummary.errors}`);
  }
  if (report.consoleSummary.warnings > 0) {
    console.log(`  Console warnings: ${report.consoleSummary.warnings}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const modeArg = parseStringFlag('mode', 'tdm');
  const durationSec = parseNumberFlag('duration', 30);
  const allModes = hasFlag('all-modes');
  const headed = hasFlag('headed');
  const port = parseNumberFlag('port', DEV_SERVER_PORT);

  const modes: GameMode[] = allModes
    ? [...AVAILABLE_MODES]
    : [modeArg as GameMode];

  // Validate mode
  if (!allModes && !AVAILABLE_MODES.includes(modeArg as GameMode)) {
    console.error(`Unknown mode: ${modeArg}. Available: ${AVAILABLE_MODES.join(', ')}`);
    process.exit(1);
  }

  // Start or reuse dev server
  let devServer: ChildProcess | null = null;
  const portAlreadyOpen = await isPortOpen(port);
  if (portAlreadyOpen) {
    logStep(`Reusing existing server on port ${port}`);
  } else {
    devServer = await startDevServer(port);
  }

  mkdirSync(ARTIFACT_ROOT, { recursive: true });
  const reports: ProbeReport[] = [];
  let exitCode = 0;

  try {
    for (const mode of modes) {
      try {
        const report = await probeMode(mode, durationSec, port, headed);
        reports.push(report);
        printSummaryTable(report);

        // Write individual report
        const stamp = report.timestamp.replace(/[:.]/g, '-');
        const reportPath = join(ARTIFACT_ROOT, `${mode}-${stamp}.json`);
        writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
        logStep(`Report written: ${reportPath}`);

        if (report.overall === 'fail') exitCode = 1;
      } catch (err) {
        console.error(`Failed to probe ${mode}:`, err instanceof Error ? err.message : String(err));
        exitCode = 1;
      }
    }

    // Write combined report if multiple modes
    if (reports.length > 1) {
      const stamp = nowIso().replace(/[:.]/g, '-');
      const combinedPath = join(ARTIFACT_ROOT, `all-modes-${stamp}.json`);
      writeFileSync(combinedPath, JSON.stringify(reports, null, 2), 'utf-8');
      logStep(`Combined report written: ${combinedPath}`);
    }

    // Final summary
    if (reports.length > 0) {
      console.log('=== Final Summary ===');
      for (const r of reports) {
        const icon = r.overall === 'pass' ? 'PASS' : r.overall === 'warn' ? 'WARN' : 'FAIL';
        console.log(`  ${r.mode.padEnd(20)} ${icon}`);
      }
      console.log('');
    }
  } finally {
    if (devServer) {
      await killDevServer(devServer);
    }
  }

  process.exit(exitCode);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
