#!/usr/bin/env tsx

/**
 * Performance baseline measurement script
 *
 * Launches the game in AI sandbox mode and captures frame time metrics.
 * Use this to establish a performance baseline and detect regressions.
 */

import { chromium, type Browser, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DEV_SERVER_PORT = 9100;
const TEST_DURATION_SECONDS = 30;
const NPC_COUNT = 40;
const BASELINE_FILE = join(process.cwd(), 'perf-baselines.json');
const STEP_TIMEOUT_MS = 30_000;
const METRIC_COLLECTION_TIMEOUT_MS = 8_000;
const FRAME_PROGRESS_STALL_MS = 12_000;

// Regression thresholds
const THRESHOLDS = {
  avgFrameMs: { warn: 0.10, fail: 0.25 },      // 10% warn, 25% fail
  p95FrameMs: { warn: 0.15, fail: 0.30 },      // 15% warn, 30% fail
  drawCalls: { warn: 0.15, fail: 0.30 },       // 15% warn, 30% fail
  triangles: { warn: 0.15, fail: 0.30 },       // 15% warn, 30% fail
  overBudgetPercent: { warn: 0.20, fail: 0.50 }, // 20% warn, 50% fail (absolute increase)
};

interface RuntimeMetrics {
  frameCount: number;
  avgFrameMs: number;
  p95FrameMs: number;
  combatantCount: number;
  firingCount: number;
  engagingCount: number;
}

interface PerformanceReport {
  fps: number;
  avgFrameMs: number;
  overBudgetPercent: number;
  systemBreakdown: Array<{
    name: string;
    budgetMs: number;
    lastMs: number;
    emaMs: number;
    peakMs: number;
  }>;
  spatialGrid: {
    initialized: boolean;
    entityCount: number;
    queriesThisFrame: number;
    avgQueryTimeMs: number;
    fallbackCount: number;
    lastSyncMs: number;
  };
  hitDetection: {
    shotsThisSession: number;
    hitsThisSession: number;
    hitRate: number;
  };
  gpu: {
    supported: boolean;
    avgGpuMs: number;
    p95GpuMs: number;
    sampleCount: number;
  };
}

interface RendererStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}

interface BaselineMetrics {
  lastRun: string;
  metrics: {
    avgFrameMs: number;
    p95FrameMs: number;
    overBudgetPercent: number;
    drawCalls: number;
    triangles: number;
    frameCount: number;
    combatantCount: number;
  };
}

interface ComparisonResult {
  metric: string;
  baseline: number;
  current: number;
  change: number;
  changePercent: number;
  status: 'pass' | 'warn' | 'fail';
  threshold?: { warn: number; fail: number };
}

interface RuntimeStateSnapshot {
  url: string;
  readyState: string;
  hasMetrics: boolean;
  hasPerf: boolean;
  hasRenderer: boolean;
  frameCount: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function logStep(step: string): void {
  console.log(`[${nowIso()}] ${step}`);
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
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function startDevServer(): Promise<ChildProcess> {
  logStep(`🚀 Starting dev server on port ${DEV_SERVER_PORT}`);

  const server = spawn('npm', ['run', 'dev', '--', '--port', String(DEV_SERVER_PORT), '--host'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: true
  });

  // Wait for server to be ready
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
      console.error('Dev server error:', data.toString());
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function killDevServer(server: ChildProcess): Promise<void> {
  logStep('🛑 Stopping dev server');

  return new Promise((resolve) => {
    if (!server.pid) {
      resolve();
      return;
    }

    server.on('exit', () => {
      logStep('✅ Dev server stopped');
      resolve();
    });

    // Kill process tree (handles child processes)
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
      killer.on('exit', () => {
        // best-effort, resolve path handled by listeners/timeouts
      });
    } else {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch (err) {
        // If that fails, try regular kill
        server.kill('SIGTERM');
      }
    }

    // Force kill after 5 seconds
    setTimeout(() => {
      try {
        if (server.pid) {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
          } else {
            process.kill(-server.pid, 'SIGKILL');
          }
        }
      } catch (err) {
        // Ignore
      }
      resolve();
    }, 5000);
  });
}

async function getRuntimeState(page: Page): Promise<RuntimeStateSnapshot> {
  return withTimeout(
    'runtime state snapshot',
    page.evaluate(() => {
      const runtimeMetrics = (window as any).__metrics;
      return {
        url: window.location.href,
        readyState: document.readyState,
        hasMetrics: Boolean(runtimeMetrics),
        hasPerf: Boolean((window as any).perf),
        hasRenderer: Boolean((window as any).__engineRenderer),
        frameCount: runtimeMetrics ? Number(runtimeMetrics.frameCount ?? 0) : 0
      };
    }),
    METRIC_COLLECTION_TIMEOUT_MS
  );
}

async function getRuntimeStateOrThrow(page: Page, context: string, lastKnownFrameCount: number): Promise<RuntimeStateSnapshot> {
  try {
    return await getRuntimeState(page);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Main-thread stall during ${context}: could not evaluate runtime state. Last known frameCount=${lastKnownFrameCount}. Root error: ${reason}`
    );
  }
}

async function waitForFrameProgress(
  page: Page,
  durationSeconds: number,
  onSample?: (state: RuntimeStateSnapshot) => void
): Promise<void> {
  const start = Date.now();
  const deadline = start + durationSeconds * 1000;
  let lastFrameCount = -1;
  let lastProgressAt = Date.now();

  while (Date.now() < deadline) {
    await sleep(1000);
    const state = await getRuntimeStateOrThrow(page, 'benchmark sampling', lastFrameCount);
    onSample?.(state);
    const elapsed = Math.round((Date.now() - start) / 1000);
    logStep(`⏱️  Sample t=${elapsed}s frameCount=${state.frameCount}`);

    if (state.frameCount > lastFrameCount) {
      lastFrameCount = state.frameCount;
      lastProgressAt = Date.now();
      continue;
    }

    if (Date.now() - lastProgressAt > FRAME_PROGRESS_STALL_MS) {
      throw new Error(
        `Frame progress stalled for ${FRAME_PROGRESS_STALL_MS}ms (frameCount=${state.frameCount}, url=${state.url}, readyState=${state.readyState})`
      );
    }
  }
}

async function runBenchmark(): Promise<void> {
  let server: ChildProcess | null = null;
  let browser: Browser | null = null;
  let page: Page | null = null;
  let lastRuntimeState: RuntimeStateSnapshot | null = null;

  try {
    logStep('Starting benchmark run');

    // Start dev server
    server = await startDevServer();

    // Wait a bit for server to fully initialize
    await sleep(2000);

    // Launch browser
    logStep('🌐 Launching browser');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu-vsync', // Disable vsync for uncapped fps
      ]
    });

    page = await browser.newPage();
    page.setDefaultTimeout(STEP_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(STEP_TIMEOUT_MS);

    // Listen to console logs
    page.on('console', msg => {
      const type = msg.type();
      if (type === 'error' || type === 'warning' || type === 'assert') {
        console.log(`[Browser ${type}]`, msg.text());
      }
    });
    page.on('pageerror', error => {
      console.log('[Browser pageerror]', error.message);
    });
    page.on('crash', () => {
      console.log('[Browser crash] page crashed');
    });

    // Set viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Navigate to sandbox mode
    const url = `http://localhost:${DEV_SERVER_PORT}/?sandbox=true&npcs=${NPC_COUNT}&autostart=true&duration=${TEST_DURATION_SECONDS}`;
    logStep(`📍 Navigating to: ${url}`);

    await withTimeout('page.goto', page.goto(url, { waitUntil: 'domcontentloaded' }), STEP_TIMEOUT_MS);

    // Wait for game to initialize
    logStep('⏳ Waiting for game initialization');
    await withTimeout('wait __metrics', page.waitForFunction(() => {
      return (window as any).__metrics !== undefined;
    }, { timeout: STEP_TIMEOUT_MS }), STEP_TIMEOUT_MS + 1000);
    lastRuntimeState = await getRuntimeState(page);
    logStep(`Sandbox ready: frameCount=${lastRuntimeState.frameCount}`);

    // Wait for meaningful frame count (game fully loaded and running)
    logStep('⏳ Waiting for game to start rendering');

    // Poll frameCount to monitor progress
    let renderStarted = false;
    let startupFrameCount = 0;
    for (let i = 0; i < 6; i++) {
      await sleep(5000);
      const state = await getRuntimeStateOrThrow(page, `startup sampling (${(i + 1) * 5}s)`, startupFrameCount);
      lastRuntimeState = state;
      startupFrameCount = state.frameCount;
      logStep(`Startup sample ${(i + 1) * 5}s frameCount=${state.frameCount}`);
      if (state.frameCount > 30) {
        renderStarted = true;
        logStep('✓ Rendering detected, proceeding with test');
        break;
      }
    }

    if (!renderStarted) {
      throw new Error(`Game did not reach active rendering threshold (frameCount=${startupFrameCount})`);
    }

    logStep(`🎮 Running sandbox for ${TEST_DURATION_SECONDS} seconds with ${NPC_COUNT} NPCs`);

    // Collect progress during benchmark window; fail if frame progression stalls
    await waitForFrameProgress(page, TEST_DURATION_SECONDS + 5, (state) => {
      lastRuntimeState = state;
    });

    // Collect metrics
    logStep('📊 Collecting metrics');

    const runtimeMetrics = await withTimeout('collect runtime metrics', page.evaluate(() => {
      return (window as any).__metrics.getSnapshot();
    }), METRIC_COLLECTION_TIMEOUT_MS) as RuntimeMetrics;

    const perfReport = await withTimeout('collect perf report', page.evaluate(() => {
      return (window as any).perf.report();
    }), METRIC_COLLECTION_TIMEOUT_MS) as PerformanceReport;

    const rendererStats = await withTimeout('collect renderer stats', page.evaluate(() => {
      const renderer = (window as any).__engineRenderer;
      if (!renderer) return null;
      return renderer.getPerformanceStats();
    }), METRIC_COLLECTION_TIMEOUT_MS) as RendererStats | null;

    // Load previous baseline
    const previousBaseline = loadBaseline();

    // Print report
    printReport(runtimeMetrics, perfReport, rendererStats);

    // Compare with baseline and save new baseline
    const hasRegression = compareAndSaveBaseline(runtimeMetrics, perfReport, rendererStats, previousBaseline);

    // Exit with error code if regression detected
    if (hasRegression) {
      console.log('\n❌ Performance regression detected! Exiting with code 1.\n');
      process.exit(1);
    }

  } catch (error) {
    if (page) {
      try {
        const latest = await getRuntimeState(page);
        lastRuntimeState = latest;
      } catch {
        // Keep previously captured state when page is too blocked to evaluate.
      }
    }
    console.error('\n❌ Benchmark failed:', error);
    if (lastRuntimeState) {
      console.error('Last runtime state:', lastRuntimeState);
    }
    throw error;
  } finally {
    // Cleanup
    if (page) {
      await page.close();
    }
    if (browser) {
      await browser.close();
    }
    if (server) {
      await killDevServer(server);
    }
  }
}

function printReport(
  metrics: RuntimeMetrics,
  perf: PerformanceReport,
  renderer: RendererStats | null
): void {
  console.log('\n' + '='.repeat(70));
  console.log('PERFORMANCE BASELINE REPORT');
  console.log('='.repeat(70));

  console.log('\n📈 FRAME TIMING');
  console.log(`   Frames rendered:     ${metrics.frameCount}`);
  console.log(`   Average frame time:  ${metrics.avgFrameMs.toFixed(2)} ms`);
  console.log(`   P95 frame time:      ${metrics.p95FrameMs.toFixed(2)} ms`);
  console.log(`   Average FPS:         ${(1000 / metrics.avgFrameMs).toFixed(1)}`);
  console.log(`   Frames over budget:  ${perf.overBudgetPercent.toFixed(1)}%`);

  console.log('\n🎯 COMBAT STATS');
  console.log(`   Active combatants:   ${metrics.combatantCount}`);
  console.log(`   Currently firing:    ${metrics.firingCount}`);
  console.log(`   Currently engaging:  ${metrics.engagingCount}`);
  console.log(`   Hit detection rate:  ${(perf.hitDetection.hitRate * 100).toFixed(1)}%`);
  console.log(`   Total shots:         ${perf.hitDetection.shotsThisSession}`);
  console.log(`   Total hits:          ${perf.hitDetection.hitsThisSession}`);

  if (renderer) {
    console.log('\n🎨 RENDERER STATS');
    console.log(`   Draw calls:          ${renderer.drawCalls}`);
    console.log(`   Triangles:           ${renderer.triangles.toLocaleString()}`);
    console.log(`   Geometries:          ${renderer.geometries}`);
    console.log(`   Textures:            ${renderer.textures}`);
    console.log(`   Programs:            ${renderer.programs}`);
  }

  console.log('\n🗺️  SPATIAL GRID');
  console.log(`   Initialized:         ${perf.spatialGrid.initialized ? 'YES' : 'NO'}`);
  console.log(`   Entities tracked:    ${perf.spatialGrid.entityCount}`);
  console.log(`   Avg query time:      ${perf.spatialGrid.avgQueryTimeMs.toFixed(3)} ms`);
  console.log(`   Fallback count:      ${perf.spatialGrid.fallbackCount}`);

  if (perf.gpu.supported) {
    console.log('\n🖥️  GPU TIMING');
    console.log(`   Average GPU time:    ${perf.gpu.avgGpuMs.toFixed(2)} ms`);
    console.log(`   P95 GPU time:        ${perf.gpu.p95GpuMs.toFixed(2)} ms`);
    console.log(`   Samples collected:   ${perf.gpu.sampleCount}`);
  }

  console.log('\n⚙️  TOP 5 SYSTEMS (by avg time)');
  const topSystems = perf.systemBreakdown.slice(0, 5);
  for (const sys of topSystems) {
    const budgetStatus = sys.emaMs > sys.budgetMs ? '⚠️ ' : '✓ ';
    console.log(`   ${budgetStatus} ${sys.name.padEnd(25)} ${sys.emaMs.toFixed(2)} ms (peak: ${sys.peakMs.toFixed(2)} ms)`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ Baseline measurement complete');
  console.log('='.repeat(70) + '\n');
}

function loadBaseline(): BaselineMetrics | null {
  if (!existsSync(BASELINE_FILE)) {
    console.log('📝 No previous baseline found - this will be the first baseline\n');
    return null;
  }

  try {
    const data = readFileSync(BASELINE_FILE, 'utf-8');
    const baseline = JSON.parse(data) as BaselineMetrics;
    console.log(`📊 Loaded baseline from ${new Date(baseline.lastRun).toLocaleString()}\n`);
    return baseline;
  } catch (error) {
    console.error('⚠️  Failed to load baseline file:', error);
    return null;
  }
}

function compareAndSaveBaseline(
  metrics: RuntimeMetrics,
  perf: PerformanceReport,
  renderer: RendererStats | null,
  previousBaseline: BaselineMetrics | null
): boolean {
  const currentMetrics: BaselineMetrics = {
    lastRun: new Date().toISOString(),
    metrics: {
      avgFrameMs: metrics.avgFrameMs,
      p95FrameMs: metrics.p95FrameMs,
      overBudgetPercent: perf.overBudgetPercent,
      drawCalls: renderer?.drawCalls ?? 0,
      triangles: renderer?.triangles ?? 0,
      frameCount: metrics.frameCount,
      combatantCount: metrics.combatantCount,
    }
  };

  // Save current metrics as new baseline
  try {
    writeFileSync(BASELINE_FILE, JSON.stringify(currentMetrics, null, 2), 'utf-8');
    console.log(`💾 Saved new baseline to ${BASELINE_FILE}\n`);
  } catch (error) {
    console.error('⚠️  Failed to save baseline file:', error);
  }

  // If no previous baseline, we're done
  if (!previousBaseline) {
    return false;
  }

  // Compare metrics
  console.log('='.repeat(70));
  console.log('REGRESSION ANALYSIS');
  console.log('='.repeat(70) + '\n');

  const comparisons: ComparisonResult[] = [];

  // Compare avgFrameMs
  comparisons.push(compareMetric(
    'Average Frame Time (ms)',
    previousBaseline.metrics.avgFrameMs,
    currentMetrics.metrics.avgFrameMs,
    THRESHOLDS.avgFrameMs,
    true // higher is worse
  ));

  // Compare p95FrameMs
  comparisons.push(compareMetric(
    'P95 Frame Time (ms)',
    previousBaseline.metrics.p95FrameMs,
    currentMetrics.metrics.p95FrameMs,
    THRESHOLDS.p95FrameMs,
    true
  ));

  // Compare overBudgetPercent (absolute change)
  comparisons.push(compareMetricAbsolute(
    'Over Budget Frames (%)',
    previousBaseline.metrics.overBudgetPercent,
    currentMetrics.metrics.overBudgetPercent,
    THRESHOLDS.overBudgetPercent
  ));

  if (renderer) {
    // Compare drawCalls
    comparisons.push(compareMetric(
      'Draw Calls',
      previousBaseline.metrics.drawCalls,
      currentMetrics.metrics.drawCalls,
      THRESHOLDS.drawCalls,
      true
    ));

    // Compare triangles
    comparisons.push(compareMetric(
      'Triangles',
      previousBaseline.metrics.triangles,
      currentMetrics.metrics.triangles,
      THRESHOLDS.triangles,
      true
    ));
  }

  // Print comparison table
  console.log('Metric'.padEnd(30) + 'Baseline'.padStart(12) + 'Current'.padStart(12) + 'Change'.padStart(12) + 'Status'.padStart(10));
  console.log('-'.repeat(76));

  let hasFailure = false;
  let hasWarning = false;

  for (const comp of comparisons) {
    const statusIcon = comp.status === 'pass' ? '✓' : comp.status === 'warn' ? '⚠️' : '❌';
    const changeStr = comp.changePercent !== undefined
      ? `${comp.change >= 0 ? '+' : ''}${comp.changePercent.toFixed(1)}%`
      : `${comp.change >= 0 ? '+' : ''}${comp.change.toFixed(2)}`;

    console.log(
      comp.metric.padEnd(30) +
      comp.baseline.toFixed(2).padStart(12) +
      comp.current.toFixed(2).padStart(12) +
      changeStr.padStart(12) +
      ` ${statusIcon} ${comp.status.toUpperCase()}`.padStart(10)
    );

    if (comp.status === 'fail') hasFailure = true;
    if (comp.status === 'warn') hasWarning = true;
  }

  console.log('\n' + '='.repeat(70));

  if (hasFailure) {
    console.log('❌ FAIL: One or more metrics exceeded failure threshold');
  } else if (hasWarning) {
    console.log('⚠️  WARN: One or more metrics exceeded warning threshold');
  } else {
    console.log('✅ PASS: All metrics within acceptable range');
  }

  console.log('='.repeat(70) + '\n');

  return hasFailure;
}

function compareMetric(
  name: string,
  baseline: number,
  current: number,
  threshold: { warn: number; fail: number },
  higherIsWorse: boolean
): ComparisonResult {
  const change = current - baseline;
  const changePercent = baseline !== 0 ? (change / baseline) * 100 : 0;

  let status: 'pass' | 'warn' | 'fail' = 'pass';

  // Determine regression (only if metric got worse)
  const regression = higherIsWorse ? change / baseline : -change / baseline;

  if (regression > threshold.fail) {
    status = 'fail';
  } else if (regression > threshold.warn) {
    status = 'warn';
  }

  return {
    metric: name,
    baseline,
    current,
    change,
    changePercent,
    status,
    threshold
  };
}

function compareMetricAbsolute(
  name: string,
  baseline: number,
  current: number,
  threshold: { warn: number; fail: number }
): ComparisonResult {
  const change = current - baseline;

  let status: 'pass' | 'warn' | 'fail' = 'pass';

  // Absolute change (not percentage)
  if (change > threshold.fail) {
    status = 'fail';
  } else if (change > threshold.warn) {
    status = 'warn';
  }

  return {
    metric: name,
    baseline,
    current,
    change,
    changePercent: undefined,
    status,
    threshold
  };
}

// Run benchmark
runBenchmark()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
