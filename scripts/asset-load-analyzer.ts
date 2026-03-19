#!/usr/bin/env tsx

import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Socket } from 'net';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AssetCategory =
  | 'terrain'
  | 'texture'
  | 'icon'
  | 'model'
  | 'audio'
  | 'script'
  | 'style'
  | 'wasm'
  | 'other';

type CapturedRequest = {
  url: string;
  status: number;
  category: AssetCategory;
  sizeBytes: number;
  durationMs: number;
  cached: boolean;
  contentType: string;
};

type Issue = {
  type: 'failed' | 'slow' | 'duplicate';
  url: string;
  details: string;
};

type CategorySummary = {
  count: number;
  totalBytes: number;
  avgMs: number;
};

type AssetReport = {
  timestamp: string;
  mode: string;
  summary: {
    totalRequests: number;
    totalBytes: number;
    byCategory: Record<string, CategorySummary>;
  };
  issues: Issue[];
  requests: CapturedRequest[];
  overall: 'pass' | 'warn' | 'fail';
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEV_SERVER_PORT = 9100;
const STEP_TIMEOUT_MS = 60_000;
const ASSET_SETTLE_MS = 10_000;
const SLOW_THRESHOLD_MS = 2000;

const VALID_MODES = [
  'tdm',
  'open_frontier',
  'zone_control',
  'ai_sandbox',
  'a_shau_valley',
] as const;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function logStep(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
  } else {
    server.kill('SIGTERM');
  }
  await sleep(500);
}

// ---------------------------------------------------------------------------
// Categorization
// ---------------------------------------------------------------------------

function categorizeUrl(url: string): AssetCategory {
  const lower = url.toLowerCase();

  if (/\.f32(\?|$)/.test(lower) || lower.includes('dem') || lower.includes('heightmap')) {
    return 'terrain';
  }
  if (lower.includes('/icons/')) {
    return 'icon';
  }
  if (/\.(png|jpg|jpeg|webp)(\?|$)/.test(lower)) {
    return 'texture';
  }
  if (/\.(glb|gltf)(\?|$)/.test(lower)) {
    return 'model';
  }
  if (/\.(ogg|wav|mp3)(\?|$)/.test(lower)) {
    return 'audio';
  }
  if (/\.(js|ts|mjs)(\?|$)/.test(lower)) {
    return 'script';
  }
  if (/\.css(\?|$)/.test(lower)) {
    return 'style';
  }
  if (/\.wasm(\?|$)/.test(lower)) {
    return 'wasm';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { mode: string; headed: boolean; port: number } {
  const args = process.argv.slice(2);
  let mode = 'tdm';
  let headed = false;
  let port = DEV_SERVER_PORT;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      mode = args[++i];
    } else if (args[i] === '--headed') {
      headed = true;
    } else if (args[i] === '--port' && args[i + 1]) {
      port = Number(args[++i]);
    }
  }

  const normalizedMode = mode.trim().toLowerCase();
  if (!VALID_MODES.includes(normalizedMode as any)) {
    console.error(`Invalid mode: ${mode}. Valid modes: ${VALID_MODES.join(', ')}`);
    process.exit(1);
  }

  return { mode: normalizedMode, headed, port };
}

// ---------------------------------------------------------------------------
// Game startup helpers
// ---------------------------------------------------------------------------

async function waitForEngine(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__engine), undefined, {
    timeout: timeoutMs,
  });
}

async function startGameMode(page: Page, mode: string): Promise<void> {
  const result = await page.evaluate((m: string) => {
    const w = window as any;
    const engine = w.__engine;
    if (!engine || typeof engine.startGameWithMode !== 'function') {
      return { ok: false, reason: 'engine unavailable' };
    }

    const startState: { mode: string; result: { ok: boolean; reason?: string } | null } = {
      mode: m,
      result: null,
    };
    w.__perfHarnessModeStart = startState;

    Promise.resolve()
      .then(() => engine.startGameWithMode(m))
      .then(() => { startState.result = { ok: true }; })
      .catch((error: unknown) => {
        startState.result = {
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      });

    return { ok: true };
  }, mode);

  if (!result?.ok) {
    throw new Error(`Failed to start mode ${mode}: ${result?.reason ?? 'unknown'}`);
  }
}

async function waitForGameplay(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  // Dismiss mission briefing if present
  while (Date.now() < deadline) {
    const dismissed = await page.evaluate(() => {
      const overlay = document.querySelector('.mission-briefing-overlay') as HTMLElement | null;
      if (overlay && overlay.offsetParent !== null) {
        const btn = overlay.querySelector('button');
        if (btn) { btn.click(); return true; }
      }
      return false;
    }).catch(() => false);
    if (dismissed) {
      logStep('Dismissed mission briefing');
    }

    // Check for deploy UI and click spawn
    const deployVisible = await page.evaluate(() => {
      const deploy = document.querySelector('.deploy-screen') as HTMLElement | null;
      if (deploy && deploy.offsetParent !== null) {
        const btn = deploy.querySelector('button.deploy-btn, button.spawn-btn, button[class*="deploy"], button[class*="spawn"]');
        if (btn) { (btn as HTMLElement).click(); return 'clicked'; }
        return 'visible';
      }
      return 'hidden';
    }).catch(() => 'error');
    if (deployVisible === 'clicked') {
      logStep('Clicked deploy/spawn button');
    }

    // Check if gameplay is running
    const playing = await page.evaluate(() => {
      const w = window as any;
      const state = w.__perfHarnessModeStart;
      if (state?.result && !state.result.ok) return 'failed';
      const metrics = w.__metrics;
      if (metrics?.frameCount > 10) return 'playing';
      return 'waiting';
    }).catch(() => 'waiting');

    if (playing === 'playing') {
      logStep('Gameplay detected');
      return;
    }
    if (playing === 'failed') {
      throw new Error('Game mode start failed');
    }

    await sleep(500);
  }

  logStep('Gameplay wait timed out, proceeding with capture anyway');
}

// ---------------------------------------------------------------------------
// Request tracking
// ---------------------------------------------------------------------------

function setupRequestTracking(page: Page): { getRequests: () => CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  const requestTimings = new Map<string, number>();

  page.on('request', (request) => {
    requestTimings.set(request.url(), Date.now());
  });

  page.on('response', async (response) => {
    const url = response.url();
    const startTime = requestTimings.get(url) ?? Date.now();
    const durationMs = Date.now() - startTime;
    const status = response.status();
    const headers = response.headers();
    const contentType = headers['content-type'] ?? '';
    const cached = status === 304 || headers['x-cache'] === 'HIT' || headers['cf-cache-status'] === 'HIT';

    let sizeBytes = 0;
    try {
      const body = await response.body();
      sizeBytes = body.length;
    } catch {
      // Body may be unavailable for redirects, etc.
    }

    captured.push({
      url,
      status,
      category: categorizeUrl(url),
      sizeBytes,
      durationMs,
      cached,
      contentType,
    });
  });

  return { getRequests: () => [...captured] };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function analyzeRequests(requests: CapturedRequest[]): { issues: Issue[]; byCategory: Record<string, CategorySummary> } {
  const issues: Issue[] = [];
  const urlCounts = new Map<string, number>();
  const byCategory: Record<string, CategorySummary> = {};

  for (const req of requests) {
    // Count duplicates
    urlCounts.set(req.url, (urlCounts.get(req.url) ?? 0) + 1);

    // Flag failed requests
    if (req.status >= 400) {
      issues.push({
        type: 'failed',
        url: req.url,
        details: `HTTP ${req.status}`,
      });
    }

    // Flag slow loads
    if (req.durationMs > SLOW_THRESHOLD_MS) {
      issues.push({
        type: 'slow',
        url: req.url,
        details: `${req.durationMs}ms (threshold: ${SLOW_THRESHOLD_MS}ms)`,
      });
    }

    // Accumulate category stats
    if (!byCategory[req.category]) {
      byCategory[req.category] = { count: 0, totalBytes: 0, avgMs: 0 };
    }
    const cat = byCategory[req.category];
    cat.totalBytes += req.sizeBytes;
    cat.avgMs = (cat.avgMs * cat.count + req.durationMs) / (cat.count + 1);
    cat.count += 1;
  }

  // Flag duplicates
  for (const [url, count] of urlCounts) {
    if (count > 1) {
      issues.push({
        type: 'duplicate',
        url,
        details: `Fetched ${count} times`,
      });
    }
  }

  // Round avgMs
  for (const cat of Object.values(byCategory)) {
    cat.avgMs = Math.round(cat.avgMs * 10) / 10;
  }

  return { issues, byCategory };
}

function determineOverall(issues: Issue[]): 'pass' | 'warn' | 'fail' {
  const hasFailed = issues.some(i => i.type === 'failed');
  if (hasFailed) return 'fail';
  if (issues.length > 0) return 'warn';
  return 'pass';
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function printSummary(report: AssetReport): void {
  console.log('\n' + '='.repeat(72));
  console.log(`Asset Load Analysis - ${report.mode}`);
  console.log(`Timestamp: ${report.timestamp}`);
  console.log('='.repeat(72));

  console.log(`\nTotal requests: ${report.summary.totalRequests}`);
  console.log(`Total size: ${formatBytes(report.summary.totalBytes)}`);

  // Category table
  console.log('\n  Category     | Count | Total Size   | Avg Time');
  console.log('  ' + '-'.repeat(56));

  const categories = Object.entries(report.summary.byCategory)
    .sort((a, b) => b[1].totalBytes - a[1].totalBytes);

  for (const [cat, stats] of categories) {
    const name = cat.padEnd(12);
    const count = String(stats.count).padStart(5);
    const size = formatBytes(stats.totalBytes).padStart(12);
    const avg = `${stats.avgMs.toFixed(1)}ms`.padStart(10);
    console.log(`  ${name} | ${count} | ${size} | ${avg}`);
  }

  // Issues
  if (report.issues.length > 0) {
    console.log(`\nIssues (${report.issues.length}):`);
    const grouped = { failed: [] as Issue[], slow: [] as Issue[], duplicate: [] as Issue[] };
    for (const issue of report.issues) {
      grouped[issue.type].push(issue);
    }

    for (const [type, items] of Object.entries(grouped)) {
      if (items.length === 0) continue;
      console.log(`\n  [${type.toUpperCase()}] (${items.length})`);
      for (const item of items.slice(0, 10)) {
        const shortUrl = item.url.length > 80 ? '...' + item.url.slice(-77) : item.url;
        console.log(`    ${shortUrl}`);
        console.log(`      ${item.details}`);
      }
      if (items.length > 10) {
        console.log(`    ... and ${items.length - 10} more`);
      }
    }
  } else {
    console.log('\nNo issues found.');
  }

  console.log(`\nOverall: ${report.overall.toUpperCase()}`);
  console.log('='.repeat(72) + '\n');
}

function writeReport(report: AssetReport): string {
  const outDir = join(process.cwd(), 'artifacts', 'assets');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const ts = report.timestamp.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  const filename = `asset-report_${report.mode}_${ts}.json`;
  const outPath = join(outDir, filename);
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  return outPath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { mode, headed, port } = parseArgs();

  logStep(`Asset load analyzer: mode=${mode}, headed=${headed}, port=${port}`);

  let server: ChildProcess | null = null;
  let startedDevServer = false;

  try {
    // Start or reuse dev server
    if (await isPortOpen(port)) {
      logStep(`Reusing existing dev server on port ${port}`);
    } else {
      server = await startDevServer(port);
      startedDevServer = true;
      await sleep(2000);
    }

    // Launch browser
    logStep('Launching browser');
    const browser = await chromium.launch({ headless: !headed });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    // Set up request tracking before navigation
    const { getRequests } = setupRequestTracking(page);

    // Navigate
    const url = `http://localhost:${port}/terror-in-the-jungle/?perf=1`;
    logStep(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'commit', timeout: STEP_TIMEOUT_MS });

    // Wait for engine
    logStep('Waiting for engine');
    await waitForEngine(page, STEP_TIMEOUT_MS);

    // Start game mode
    logStep(`Starting game mode: ${mode}`);
    await startGameMode(page, mode);

    // Wait for gameplay
    logStep('Waiting for gameplay');
    await waitForGameplay(page, STEP_TIMEOUT_MS);

    // Let assets settle
    logStep(`Waiting ${ASSET_SETTLE_MS / 1000}s for assets to load`);
    await sleep(ASSET_SETTLE_MS);

    // Collect and analyze
    const requests = getRequests();
    logStep(`Captured ${requests.length} requests`);

    const { issues, byCategory } = analyzeRequests(requests);
    const totalBytes = requests.reduce((sum, r) => sum + r.sizeBytes, 0);

    const report: AssetReport = {
      timestamp: new Date().toISOString(),
      mode,
      summary: {
        totalRequests: requests.length,
        totalBytes,
        byCategory,
      },
      issues,
      requests,
      overall: determineOverall(issues),
    };

    // Output
    printSummary(report);
    const outPath = writeReport(report);
    logStep(`Report written to ${outPath}`);

    // Cleanup browser
    await browser.close();
  } finally {
    if (startedDevServer && server) {
      await killDevServer(server);
    }
  }
}

main().catch((err) => {
  console.error('Asset load analyzer failed:', err);
  process.exit(1);
});
