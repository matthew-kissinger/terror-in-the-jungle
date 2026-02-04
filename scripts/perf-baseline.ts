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

// Regression thresholds
const THRESHOLDS = {
  avgFrameMs: { warn: 0.10, fail: 0.25 },      // 10% warn, 25% fail
  p95FrameMs: { warn: 0.15, fail: 0.30 },      // 15% warn, 30% fail
  drawCalls: { warn: 0.15, fail: 0.30 },       // 15% warn, 30% fail
  triangles: { warn: 0.15, fail: 0.30 },       // 15% warn, 30% fail
  overBudgetPercent: { warn: 0.20, fail: 0.50 }, // 20% warn, 50% fail (absolute increase)
};

interface SandboxMetrics {
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

async function startDevServer(): Promise<ChildProcess> {
  console.log(`\n🚀 Starting dev server on port ${DEV_SERVER_PORT}...`);

  const server = spawn('npm', ['run', 'dev', '--', '--port', String(DEV_SERVER_PORT), '--host'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: true
  });

  // Wait for server to be ready
  return new Promise((resolve, reject) => {
    let output = '';

    const timeout = setTimeout(() => {
      server.kill();
      reject(new Error('Dev server startup timeout'));
    }, 30000);

    server.stdout?.on('data', (data) => {
      output += data.toString();
      if (output.includes('Local:') || output.includes('localhost')) {
        clearTimeout(timeout);
        console.log('✅ Dev server ready');
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
  console.log('\n🛑 Stopping dev server...');

  return new Promise((resolve) => {
    if (!server.pid) {
      resolve();
      return;
    }

    server.on('exit', () => {
      console.log('✅ Dev server stopped');
      resolve();
    });

    // Kill process tree (handles child processes)
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch (err) {
      // If that fails, try regular kill
      server.kill('SIGTERM');
    }

    // Force kill after 5 seconds
    setTimeout(() => {
      try {
        if (server.pid) {
          process.kill(-server.pid, 'SIGKILL');
        }
      } catch (err) {
        // Ignore
      }
      resolve();
    }, 5000);
  });
}

async function runBenchmark(): Promise<void> {
  let server: ChildProcess | null = null;
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Start dev server
    server = await startDevServer();

    // Wait a bit for server to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Launch browser
    console.log('\n🌐 Launching browser...');
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

    // Listen to console logs
    page.on('console', msg => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        console.log(`[Browser ${type}]`, msg.text());
      }
    });

    // Set viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Navigate to sandbox mode
    const url = `http://localhost:${DEV_SERVER_PORT}/?sandbox=true&npcs=${NPC_COUNT}&autostart=true&duration=${TEST_DURATION_SECONDS}`;
    console.log(`📍 Navigating to: ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for game to initialize
    console.log('⏳ Waiting for game initialization...');
    await page.waitForFunction(() => {
      return (window as any).sandboxMetrics !== undefined;
    }, { timeout: 15000 });

    // Wait for meaningful frame count (game fully loaded and running)
    console.log('⏳ Waiting for game to fully load and start rendering...');

    // Poll frameCount to monitor progress
    let lastFrameCount = 0;
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const frameCount = await page.evaluate(() => {
        const metrics = (window as any).sandboxMetrics;
        return metrics ? metrics.frameCount : 0;
      });
      console.log(`   Frame count after ${(i+1)*5}s: ${frameCount}`);

      if (frameCount > 30) {
        console.log('   ✓ Game is rendering, proceeding with test');
        break;
      }

      if (frameCount === lastFrameCount && i > 0) {
        console.log('   ⚠ Frame count not increasing, game may be stuck');
      }
      lastFrameCount = frameCount;
    }

    console.log(`\n🎮 Running sandbox for ${TEST_DURATION_SECONDS} seconds with ${NPC_COUNT} NPCs...`);
    console.log('   (metrics are collected continuously)');

    // Wait for test duration + buffer
    await new Promise(resolve => setTimeout(resolve, (TEST_DURATION_SECONDS + 5) * 1000));

    // Collect metrics
    console.log('\n📊 Collecting metrics...');

    const sandboxMetrics = await page.evaluate(() => {
      return (window as any).sandboxMetrics.getSnapshot();
    }) as SandboxMetrics;

    const perfReport = await page.evaluate(() => {
      return (window as any).perf.report();
    }) as PerformanceReport;

    const rendererStats = await page.evaluate(() => {
      const renderer = (window as any).__sandboxRenderer;
      if (!renderer) return null;
      return renderer.getPerformanceStats();
    }) as RendererStats | null;

    // Load previous baseline
    const previousBaseline = loadBaseline();

    // Print report
    printReport(sandboxMetrics, perfReport, rendererStats);

    // Compare with baseline and save new baseline
    const hasRegression = compareAndSaveBaseline(sandboxMetrics, perfReport, rendererStats, previousBaseline);

    // Exit with error code if regression detected
    if (hasRegression) {
      console.log('\n❌ Performance regression detected! Exiting with code 1.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
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
  sandbox: SandboxMetrics,
  perf: PerformanceReport,
  renderer: RendererStats | null
): void {
  console.log('\n' + '='.repeat(70));
  console.log('PERFORMANCE BASELINE REPORT');
  console.log('='.repeat(70));

  console.log('\n📈 FRAME TIMING');
  console.log(`   Frames rendered:     ${sandbox.frameCount}`);
  console.log(`   Average frame time:  ${sandbox.avgFrameMs.toFixed(2)} ms`);
  console.log(`   P95 frame time:      ${sandbox.p95FrameMs.toFixed(2)} ms`);
  console.log(`   Average FPS:         ${(1000 / sandbox.avgFrameMs).toFixed(1)}`);
  console.log(`   Frames over budget:  ${perf.overBudgetPercent.toFixed(1)}%`);

  console.log('\n🎯 COMBAT STATS');
  console.log(`   Active combatants:   ${sandbox.combatantCount}`);
  console.log(`   Currently firing:    ${sandbox.firingCount}`);
  console.log(`   Currently engaging:  ${sandbox.engagingCount}`);
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
  sandbox: SandboxMetrics,
  perf: PerformanceReport,
  renderer: RendererStats | null,
  previousBaseline: BaselineMetrics | null
): boolean {
  const currentMetrics: BaselineMetrics = {
    lastRun: new Date().toISOString(),
    metrics: {
      avgFrameMs: sandbox.avgFrameMs,
      p95FrameMs: sandbox.p95FrameMs,
      overBudgetPercent: perf.overBudgetPercent,
      drawCalls: renderer?.drawCalls ?? 0,
      triangles: renderer?.triangles ?? 0,
      frameCount: sandbox.frameCount,
      combatantCount: sandbox.combatantCount,
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
