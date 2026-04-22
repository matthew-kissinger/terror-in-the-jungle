#!/usr/bin/env tsx

import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Socket } from 'net';
import { localAppUrl } from './app-url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MemorySnapshot = {
  heapUsedMB: number;
  heapTotalMB: number;
  geometries: number;
  textures: number;
  programs: number;
};

type Sample = {
  elapsedSec: number;
  heapUsedMB: number;
  geometries: number;
  textures: number;
  combatantCount: number;
};

type Leak = {
  type: string;
  severity: 'warn' | 'fail';
  details: string;
};

type MemoryReport = {
  timestamp: string;
  mode: string;
  durationSeconds: number;
  baseline: MemorySnapshot;
  final: MemorySnapshot;
  growthRatePerMinute: { heapPercent: number; geometries: number; textures: number };
  samples: Sample[];
  leaks: Leak[];
  overall: 'pass' | 'warn' | 'fail';
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEV_SERVER_PORT = 9100;
const SAMPLE_INTERVAL_MS = 30_000;
const STABILIZATION_SECONDS = 10;
const STARTUP_TIMEOUT_MS = 120_000;
const DEV_SERVER_STARTUP_TIMEOUT_MS = 30_000;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'memory');

// Leak thresholds
const HEAP_GROWTH_WARN_PER_MIN = 10; // percent
const HEAP_GROWTH_FAIL_PER_MIN = 20; // percent

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function logStep(msg: string): void {
  console.log(`[${nowIso()}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    }, DEV_SERVER_STARTUP_TIMEOUT_MS);

    server.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
      if (!resolved && (output.includes('Local:') || output.includes('localhost'))) {
        resolved = true;
        clearTimeout(timeout);
        logStep('Dev server ready');
        resolve(server);
      }
    });

    server.stderr?.on('data', (data: Buffer) => {
      console.error('[dev-server]', data.toString().trim());
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Page evaluation helpers
// ---------------------------------------------------------------------------

async function readMemorySnapshot(page: Page): Promise<MemorySnapshot> {
  return page.evaluate(() => {
    const perf = (performance as any).memory;
    // Prefer __rendererInfo() (read-only snapshot), fall back to __renderer.info
    const rendererInfoFn = (window as any).__rendererInfo;
    let geometries = 0, textures = 0, programs = 0;
    if (typeof rendererInfoFn === 'function') {
      const ri = rendererInfoFn();
      geometries = ri.geometries ?? 0;
      textures = ri.textures ?? 0;
      programs = ri.programs ?? 0;
    } else {
      const renderer = (window as any).__renderer;
      const info = renderer?.info;
      geometries = info?.memory?.geometries ?? 0;
      textures = info?.memory?.textures ?? 0;
      programs = info?.programs?.length ?? 0;
    }
    return {
      heapUsedMB: perf ? perf.usedJSHeapSize / (1024 * 1024) : 0,
      heapTotalMB: perf ? perf.totalJSHeapSize / (1024 * 1024) : 0,
      geometries,
      textures,
      programs,
    };
  });
}

async function readCombatantCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const metrics = (window as any).__metrics;
    if (metrics && typeof metrics.getSnapshot === 'function') {
      const snap = metrics.getSnapshot();
      return snap?.combatantCount ?? 0;
    }
    return 0;
  });
}

async function waitForEngineReady(page: Page): Promise<void> {
  logStep('Waiting for engine to be ready...');
  const start = Date.now();
  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    const ready = await page.evaluate(() => {
      const engine = (window as any).__engine;
      return Boolean(engine);
    });
    if (ready) {
      logStep('Engine detected');
      return;
    }
    await sleep(500);
  }
  throw new Error('Engine did not become available within timeout');
}

async function startGameMode(page: Page, mode: string): Promise<void> {
  logStep(`Starting game mode: ${mode}`);
  const result = await page.evaluate((m: string) => {
    const engine = (window as any).__engine;
    if (!engine || typeof engine.startGameWithMode !== 'function') {
      return { ok: false, reason: 'engine unavailable or startGameWithMode missing' };
    }
    try {
      engine.startGameWithMode(m);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }, mode);

  if (!result.ok) {
    throw new Error(`Failed to start mode ${mode}: ${result.reason}`);
  }

  // Wait for game to actually start
  const start = Date.now();
  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    const state = await page.evaluate(() => {
      const engine = (window as any).__engine;
      return {
        gameStarted: Boolean(engine?.gameStarted),
        briefingVisible: Boolean(document.querySelector('[data-ref="beginBtn"]')),
      };
    });

    // Dismiss mission briefing if present
    if (state.briefingVisible) {
      await page.evaluate(() => {
        const btn = document.querySelector('[data-ref="beginBtn"]') as HTMLButtonElement | null;
        btn?.click();
      });
      logStep('Mission briefing dismissed');
    }

    if (state.gameStarted) {
      logStep('Game started successfully');
      return;
    }
    await sleep(500);
  }
  throw new Error(`Game mode ${mode} did not start within timeout`);
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function analyzeLeaks(
  baseline: MemorySnapshot,
  final: MemorySnapshot,
  samples: Sample[],
  durationMinutes: number,
): { leaks: Leak[]; growthRatePerMinute: MemoryReport['growthRatePerMinute'] } {
  const leaks: Leak[] = [];

  // Heap growth rate
  const heapGrowthPercent = baseline.heapUsedMB > 0
    ? ((final.heapUsedMB - baseline.heapUsedMB) / baseline.heapUsedMB) * 100
    : 0;
  const heapPercentPerMinute = durationMinutes > 0 ? heapGrowthPercent / durationMinutes : 0;

  if (heapPercentPerMinute > HEAP_GROWTH_FAIL_PER_MIN) {
    leaks.push({
      type: 'js_heap',
      severity: 'fail',
      details: `JS heap growing ${heapPercentPerMinute.toFixed(1)}%/min (threshold: ${HEAP_GROWTH_FAIL_PER_MIN}%). `
        + `Baseline: ${baseline.heapUsedMB.toFixed(1)}MB, Final: ${final.heapUsedMB.toFixed(1)}MB`,
    });
  } else if (heapPercentPerMinute > HEAP_GROWTH_WARN_PER_MIN) {
    leaks.push({
      type: 'js_heap',
      severity: 'warn',
      details: `JS heap growing ${heapPercentPerMinute.toFixed(1)}%/min (threshold: ${HEAP_GROWTH_WARN_PER_MIN}%). `
        + `Baseline: ${baseline.heapUsedMB.toFixed(1)}MB, Final: ${final.heapUsedMB.toFixed(1)}MB`,
    });
  }

  // Geometry growth rate
  const geoGrowth = final.geometries - baseline.geometries;
  const geoPerMinute = durationMinutes > 0 ? geoGrowth / durationMinutes : 0;

  // Check if combatant count is stable but geometry count is rising
  if (samples.length >= 3) {
    const combatantCounts = samples.map((s) => s.combatantCount);
    const combatantStdDev = stdDev(combatantCounts);
    const combatantMean = mean(combatantCounts);
    const combatantStable = combatantMean === 0 || (combatantStdDev / combatantMean) < 0.15;

    if (combatantStable && geoGrowth > 5) {
      leaks.push({
        type: 'geometry',
        severity: geoGrowth > 20 ? 'fail' : 'warn',
        details: `Geometry count increased by ${geoGrowth} (${baseline.geometries} -> ${final.geometries}) `
          + `while combatant count was stable (~${combatantMean.toFixed(0)}). Possible geometry leak.`,
      });
    }
  }

  // Texture monotonic increase check
  const textureCounts = samples.map((s) => s.textures);
  if (textureCounts.length >= 3) {
    let monotonic = true;
    for (let i = 1; i < textureCounts.length; i++) {
      if (textureCounts[i] < textureCounts[i - 1]) {
        monotonic = false;
        break;
      }
    }
    const textureGrowth = final.textures - baseline.textures;
    if (monotonic && textureGrowth > 5) {
      leaks.push({
        type: 'texture',
        severity: textureGrowth > 20 ? 'fail' : 'warn',
        details: `Texture count monotonically increased by ${textureGrowth} `
          + `(${baseline.textures} -> ${final.textures}). Possible texture leak.`,
      });
    }
  }

  // Texture growth rate
  const texPerMinute = durationMinutes > 0
    ? (final.textures - baseline.textures) / durationMinutes
    : 0;

  return {
    leaks,
    growthRatePerMinute: {
      heapPercent: Math.round(heapPercentPerMinute * 100) / 100,
      geometries: Math.round(geoPerMinute * 100) / 100,
      textures: Math.round(texPerMinute * 100) / 100,
    },
  };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function overallStatus(leaks: Leak[]): 'pass' | 'warn' | 'fail' {
  if (leaks.some((l) => l.severity === 'fail')) return 'fail';
  if (leaks.some((l) => l.severity === 'warn')) return 'warn';
  return 'pass';
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { mode: string; duration: number; headed: boolean; port: number } {
  const args = process.argv.slice(2);
  let mode = 'tdm';
  let duration = 120;
  let headed = false;
  let port = DEV_SERVER_PORT;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mode':
        mode = args[++i];
        break;
      case '--duration':
        duration = parseInt(args[++i], 10);
        break;
      case '--headed':
        headed = true;
        break;
      case '--port':
        port = parseInt(args[++i], 10);
        break;
    }
  }

  return { mode, duration, headed, port };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { mode, duration, headed, port } = parseArgs();

  logStep(`Memory growth tracker starting`);
  logStep(`  Mode: ${mode}, Duration: ${duration}s, Headed: ${headed}, Port: ${port}`);

  // Ensure artifact directory
  mkdirSync(ARTIFACT_ROOT, { recursive: true });

  // Start or reuse dev server
  let devServer: ChildProcess | null = null;
  const portAlreadyOpen = await isPortOpen(port);
  if (portAlreadyOpen) {
    logStep(`Port ${port} already open - reusing existing dev server`);
  } else {
    devServer = await startDevServer(port);
  }

  let browser;
  try {
    // Launch browser with performance.memory access
    browser = await chromium.launch({
      headless: !headed,
      args: [
        '--enable-precise-memory-info',
        '--js-flags=--expose-gc',
        '--no-sandbox',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    // Suppress console noise
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('KHR_parallel_shader_compile') &&
            !text.includes('send was called before connect') &&
            !text.includes('@vite/client')) {
          console.error('[console-error]', text.slice(0, 200));
        }
      }
    });
    page.on('pageerror', (err) => {
      console.error('[page-error]', err.message);
    });

    // Navigate and wait for load
    const url = localAppUrl({ port, query: { perf: true } });
    logStep(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'commit', timeout: 60_000 });

    // Wait for engine
    await waitForEngineReady(page);

    // Start game mode
    await startGameMode(page, mode);

    // Stabilization period
    logStep(`Stabilization period: ${STABILIZATION_SECONDS}s`);
    await sleep(STABILIZATION_SECONDS * 1000);

    // Take baseline
    const baseline = await readMemorySnapshot(page);
    const baselineCombatants = await readCombatantCount(page);
    logStep(`Baseline - Heap: ${baseline.heapUsedMB.toFixed(1)}MB, `
      + `Geo: ${baseline.geometries}, Tex: ${baseline.textures}, Prog: ${baseline.programs}, `
      + `Combatants: ${baselineCombatants}`);

    // Sample loop
    const samples: Sample[] = [];
    const sampleCount = Math.floor(duration / (SAMPLE_INTERVAL_MS / 1000));
    const startTime = Date.now();

    for (let i = 0; i < sampleCount; i++) {
      await sleep(SAMPLE_INTERVAL_MS);
      const elapsed = (Date.now() - startTime) / 1000;

      const snap = await readMemorySnapshot(page);
      const combatants = await readCombatantCount(page);

      const sample: Sample = {
        elapsedSec: Math.round(elapsed),
        heapUsedMB: Math.round(snap.heapUsedMB * 100) / 100,
        geometries: snap.geometries,
        textures: snap.textures,
        combatantCount: combatants,
      };
      samples.push(sample);

      logStep(`Sample ${i + 1}/${sampleCount} - `
        + `Heap: ${sample.heapUsedMB.toFixed(1)}MB, `
        + `Geo: ${sample.geometries}, Tex: ${sample.textures}, `
        + `Combatants: ${sample.combatantCount}`);
    }

    // Final snapshot
    const final = await readMemorySnapshot(page);
    const actualDuration = (Date.now() - startTime) / 1000;
    const durationMinutes = actualDuration / 60;

    logStep(`Final - Heap: ${final.heapUsedMB.toFixed(1)}MB, `
      + `Geo: ${final.geometries}, Tex: ${final.textures}, Prog: ${final.programs}`);

    // Analysis
    const { leaks, growthRatePerMinute } = analyzeLeaks(baseline, final, samples, durationMinutes);
    const overall = overallStatus(leaks);

    // Build report
    const report: MemoryReport = {
      timestamp: nowIso(),
      mode,
      durationSeconds: Math.round(actualDuration),
      baseline: roundSnapshot(baseline),
      final: roundSnapshot(final),
      growthRatePerMinute,
      samples,
      leaks,
      overall,
    };

    // Write report
    const filename = `memory-${mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = join(ARTIFACT_ROOT, filename);
    writeFileSync(filepath, JSON.stringify(report, null, 2));
    logStep(`Report written to ${filepath}`);

    // Console summary
    console.log('\n--- Memory Growth Report ---');
    console.log(`Mode: ${mode}`);
    console.log(`Duration: ${Math.round(actualDuration)}s`);
    console.log(`Heap: ${baseline.heapUsedMB.toFixed(1)}MB -> ${final.heapUsedMB.toFixed(1)}MB `
      + `(${growthRatePerMinute.heapPercent.toFixed(1)}%/min)`);
    console.log(`Geometries: ${baseline.geometries} -> ${final.geometries} `
      + `(${growthRatePerMinute.geometries.toFixed(1)}/min)`);
    console.log(`Textures: ${baseline.textures} -> ${final.textures} `
      + `(${growthRatePerMinute.textures.toFixed(1)}/min)`);
    console.log(`Programs: ${baseline.programs} -> ${final.programs}`);

    if (leaks.length > 0) {
      console.log('\nLeaks detected:');
      for (const leak of leaks) {
        console.log(`  [${leak.severity.toUpperCase()}] ${leak.type}: ${leak.details}`);
      }
    } else {
      console.log('\nNo leaks detected.');
    }

    console.log(`\nOverall: ${overall.toUpperCase()}`);
    console.log('----------------------------\n');

    // Exit code
    if (overall === 'fail') {
      process.exitCode = 1;
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (devServer) {
      devServer.kill();
    }
  }
}

function roundSnapshot(snap: MemorySnapshot): MemorySnapshot {
  return {
    heapUsedMB: Math.round(snap.heapUsedMB * 100) / 100,
    heapTotalMB: Math.round(snap.heapTotalMB * 100) / 100,
    geometries: snap.geometries,
    textures: snap.textures,
    programs: snap.programs,
  };
}

main().catch((err) => {
  console.error('Memory growth tracker failed:', err);
  process.exit(1);
});
