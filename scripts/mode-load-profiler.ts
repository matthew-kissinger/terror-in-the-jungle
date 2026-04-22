#!/usr/bin/env tsx

import { chromium, type Page } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Socket } from 'net';
import { localAppUrl } from './app-url';

const DEV_SERVER_PORT = 9100;
const STARTUP_TIMEOUT_MS = 30_000;
const DEPLOY_TIMEOUT_MS = 90_000;
const SERVER_STARTUP_TIMEOUT_MS = 30_000;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'profile');

const ALL_MODES = ['tdm', 'zone_control', 'open_frontier', 'a_shau_valley'] as const;
type GameMode = (typeof ALL_MODES)[number];

interface NetworkStats {
  requestCount: number;
  totalBytes: number;
  slowestAsset: string;
  slowestMs: number;
}

interface ModeProfile {
  mode: string;
  totalLoadMs: number;
  startupMarks: Record<string, number>;
  peakHeapMB: number;
  network: NetworkStats;
}

interface ProfileResult {
  timestamp: string;
  modes: ModeProfile[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function logStep(msg: string): void {
  console.log(`[${nowIso()}] ${msg}`);
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
    }, SERVER_STARTUP_TIMEOUT_MS);

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

    server.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function killDevServer(server: ChildProcess): Promise<void> {
  logStep('Stopping dev server');
  if (!server.pid) return;

  await new Promise<void>((resolve) => {
    server.on('close', () => resolve());
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
    } else {
      server.kill('SIGTERM');
    }
    setTimeout(resolve, 3000);
  });
}

interface RequestRecord {
  url: string;
  startTime: number;
  endTime: number;
  size: number;
}

async function profileMode(
  mode: GameMode,
  port: number,
  headed: boolean,
): Promise<ModeProfile> {
  logStep(`Profiling mode: ${mode}`);

  const browser = await chromium.launch({
    headless: !headed,
    args: ['--use-angle=swiftshader', '--enable-webgl'],
  });

  const requests: RequestRecord[] = [];
  let peakHeapMB = 0;

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // Track network requests
    page.on('response', async (response) => {
      const url = response.url();
      const timing = response.request().timing();
      const startTime = timing.startTime;
      const endTime = timing.responseEnd;
      let size = 0;
      try {
        const body = await response.body();
        size = body.length;
      } catch {
        // Some responses (e.g. redirects) have no body
        const contentLength = response.headers()['content-length'];
        size = contentLength ? Number(contentLength) : 0;
      }
      requests.push({
        url: url.replace(`http://127.0.0.1:${port}`, ''),
        startTime,
        endTime,
        size,
      });
    });

    const baseUrl = localAppUrl({ port, query: { perf: true } });
    const loadStartMs = Date.now();

    // Navigate to game
    await page.goto(baseUrl, { waitUntil: 'commit', timeout: STARTUP_TIMEOUT_MS });

    // Wait for START GAME button
    await page.waitForFunction(() => {
      const startBtn = document.querySelector<HTMLButtonElement>('button[data-ref="start"]');
      const playBtn = document.querySelector<HTMLButtonElement>('button[data-ref="play"]');
      const btn = startBtn ?? playBtn;
      if (!btn) return false;
      const style = window.getComputedStyle(btn);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }, undefined, { timeout: STARTUP_TIMEOUT_MS });

    // Click START GAME
    const startButton = page.locator('button[data-ref="start"]');
    const playButton = page.locator('button[data-ref="play"]');
    const hasStart = await startButton.count() > 0;
    await (hasStart ? startButton : playButton).click();

    // Wait for mode cards, then click the target mode
    const modeCard = page.locator(`[data-mode="${mode}"]`);
    await modeCard.waitFor({ state: 'visible', timeout: 10_000 });
    await modeCard.click();

    // Wait for deploy screen or engine to be populated
    await page.waitForFunction(() => {
      const deployRoot = document.getElementById('respawn-ui');
      if (deployRoot) {
        const style = window.getComputedStyle(deployRoot);
        if (style.display !== 'none' && style.visibility !== 'hidden') return true;
      }
      return !!(window as any).__engine;
    }, undefined, { timeout: DEPLOY_TIMEOUT_MS });

    const loadEndMs = Date.now();
    const totalLoadMs = loadEndMs - loadStartMs;

    // Read startup telemetry marks
    const startupMarks = await readStartupMarks(page);

    // Read peak heap
    peakHeapMB = await readHeapMB(page);

    // Compute network stats
    const network = computeNetworkStats(requests);

    logStep(`  ${mode}: ${totalLoadMs}ms, heap=${peakHeapMB.toFixed(1)}MB, requests=${network.requestCount}`);

    return {
      mode,
      totalLoadMs,
      startupMarks,
      peakHeapMB,
      network,
    };
  } finally {
    await browser.close();
  }
}

async function readStartupMarks(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const tel = (window as any).__startupTelemetry;
    if (!tel || typeof tel.getSnapshot !== 'function') return {};
    const snap = tel.getSnapshot();
    const result: Record<string, number> = {};
    if (snap && Array.isArray(snap.marks)) {
      for (const mark of snap.marks) {
        result[mark.name] = Math.round(mark.sinceStartMs);
      }
    }
    return result;
  });
}

async function readHeapMB(page: Page): Promise<number> {
  return page.evaluate(() => {
    const mem = (performance as any).memory;
    if (!mem) return 0;
    return Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
  });
}

function computeNetworkStats(requests: RequestRecord[]): NetworkStats {
  if (requests.length === 0) {
    return { requestCount: 0, totalBytes: 0, slowestAsset: 'n/a', slowestMs: 0 };
  }

  let totalBytes = 0;
  let slowestAsset = '';
  let slowestMs = 0;

  for (const req of requests) {
    totalBytes += req.size;
    const duration = req.endTime - req.startTime;
    if (duration > slowestMs) {
      slowestMs = duration;
      slowestAsset = req.url;
    }
  }

  return {
    requestCount: requests.length,
    totalBytes,
    slowestAsset,
    slowestMs: Math.round(slowestMs),
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return '...' + str.slice(str.length - maxLen + 3);
}

function printTable(profiles: ModeProfile[]): void {
  const modeW = 20;
  const loadW = 12;
  const heapW = 12;
  const reqW = 10;
  const slowW = 40;

  const header = [
    'Mode'.padEnd(modeW),
    'Load Time'.padEnd(loadW),
    'Heap Peak'.padEnd(heapW),
    'Requests'.padEnd(reqW),
    'Slowest Asset',
  ].join(' | ');

  const separator = [
    '-'.repeat(modeW),
    '-'.repeat(loadW),
    '-'.repeat(heapW),
    '-'.repeat(reqW),
    '-'.repeat(slowW),
  ].join('-+-');

  console.log('');
  console.log(header);
  console.log(separator);

  for (const p of profiles) {
    const slowLabel = p.network.slowestAsset !== 'n/a'
      ? `${truncate(p.network.slowestAsset, 28)} (${formatMs(p.network.slowestMs)})`
      : 'n/a';
    const row = [
      p.mode.padEnd(modeW),
      formatMs(p.totalLoadMs).padEnd(loadW),
      `${p.peakHeapMB.toFixed(0)} MB`.padEnd(heapW),
      String(p.network.requestCount).padEnd(reqW),
      slowLabel,
    ].join(' | ');
    console.log(row);
  }
  console.log('');

  // Print startup marks breakdown per mode
  for (const p of profiles) {
    const markEntries = Object.entries(p.startupMarks);
    if (markEntries.length > 0) {
      console.log(`  ${p.mode} startup marks:`);
      for (const [name, ms] of markEntries) {
        console.log(`    ${name}: ${formatMs(ms)}`);
      }
      console.log('');
    }
  }
}

function parseArgs(): { headed: boolean; port: number; modes: GameMode[] } {
  const args = process.argv.slice(2);
  let headed = false;
  let port = DEV_SERVER_PORT;
  let modes: GameMode[] = [...ALL_MODES];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--headed') {
      headed = true;
    } else if (arg === '--port' && i + 1 < args.length) {
      port = Number(args[++i]);
      if (!Number.isFinite(port) || port <= 0) {
        console.error(`Invalid port: ${args[i]}`);
        process.exit(1);
      }
    } else if (arg === '--mode' && i + 1 < args.length) {
      const modeArg = args[++i] as GameMode;
      if (!ALL_MODES.includes(modeArg)) {
        console.error(`Unknown mode: ${modeArg}. Valid modes: ${ALL_MODES.join(', ')}`);
        process.exit(1);
      }
      modes = [modeArg];
    }
  }

  return { headed, port, modes };
}

async function main(): Promise<void> {
  const { headed, port, modes } = parseArgs();
  logStep(`Mode load profiler starting (modes: ${modes.join(', ')}, port: ${port}, headed: ${headed})`);

  // Start or reuse dev server
  let devServer: ChildProcess | null = null;
  const alreadyRunning = await isPortOpen(port);
  if (alreadyRunning) {
    logStep(`Reusing existing server on port ${port}`);
  } else {
    devServer = await startDevServer(port);
    // Give it a moment to stabilize
    await new Promise((r) => setTimeout(r, 1000));
  }

  const profiles: ModeProfile[] = [];

  try {
    for (const mode of modes) {
      try {
        const profile = await profileMode(mode, port, headed);
        profiles.push(profile);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logStep(`FAILED to profile ${mode}: ${msg}`);
        profiles.push({
          mode,
          totalLoadMs: -1,
          startupMarks: {},
          peakHeapMB: 0,
          network: { requestCount: 0, totalBytes: 0, slowestAsset: 'error', slowestMs: 0 },
        });
      }
    }
  } finally {
    if (devServer) {
      await killDevServer(devServer);
    }
  }

  // Print comparison table
  printTable(profiles);

  // Write JSON artifact
  const result: ProfileResult = {
    timestamp: nowIso(),
    modes: profiles,
  };

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(ARTIFACT_ROOT, ts);
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, 'mode-load-profile.json');
  writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
  logStep(`Results written to ${jsonPath}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
