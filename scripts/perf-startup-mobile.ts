#!/usr/bin/env tsx

/**
 * Mobile-aware sibling of `scripts/perf-startup-ui.ts`.
 *
 * Owner intent (cycle-2026-05-16-mobile-webgpu-and-sky-recovery,
 * `mobile-startup-and-frame-budget`):
 *
 * - Capture mode-click -> first playable frame on a labelled mobile-emulation
 *   profile (Chrome DevTools "iPhone 14 Pro" viewport + touch + mobile UA),
 *   with CDP CPU throttling and 4G network shaping.
 * - Capture a 60s `performanceTelemetry.systemBreakdown` poll after first
 *   playable frame for steady-state attribution.
 * - Serve `dist-perf` by preference (gates `window.perf`) and fall back to
 *   `dist` so the probe is still runnable on machines that only built the
 *   retail bundle.
 *
 * This is an emulation harness, not a real-device profiler. Real-device
 * Chrome remote-debug evidence supersedes anything captured here. Labelling
 * matters: artifacts go to
 *   artifacts/cycle-2026-05-16/mobile-startup-and-frame-budget/<timestamp>/
 * with `emulation: true` and CPU/network throttle values stamped into the
 * summary so the downstream fix cycle can tell emulation from device data.
 */

import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, normalize } from 'path';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4275;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'cycle-2026-05-16', 'mobile-startup-and-frame-budget');
const OBSERVER_SCRIPT_PATH = join(process.cwd(), 'scripts', 'perf-browser-observers.js');

// iPhone 14 Pro-ish; matches Chrome DevTools mobile emulation default size.
const DEFAULT_VIEWPORT_WIDTH = 390;
const DEFAULT_VIEWPORT_HEIGHT = 844;
const DEFAULT_DEVICE_SCALE_FACTOR = 3;
const DEFAULT_CPU_THROTTLE = 4;
// 4G profile per Chrome DevTools: 9 Mbps down, 4 Mbps up, 170ms RTT.
const DEFAULT_DOWNLOAD_KBPS = 9000;
const DEFAULT_UPLOAD_KBPS = 4000;
const DEFAULT_LATENCY_MS = 170;
const DEFAULT_MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.111 Mobile/15E148 Safari/604.1';

const MIME_TYPES: Record<string, string> = {
  '.br': 'application/octet-stream',
  '.css': 'text/css; charset=utf-8',
  '.f32': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.gz': 'application/octet-stream',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

interface ProbeOptions {
  mode: string;
  port: number;
  headed: boolean;
  cpuThrottle: number;
  steadyStateMs: number;
  systemBreakdownIntervalMs: number;
  viewportWidth: number;
  viewportHeight: number;
  deviceScaleFactor: number;
  userAgent: string;
  downloadKbps: number;
  uploadKbps: number;
  latencyMs: number;
  distRoot: string;
}

function parseArgs(): ProbeOptions {
  const args = process.argv.slice(2);
  const read = (flag: string, fallback: string): string => {
    const idx = args.findIndex((a) => a === `--${flag}`);
    if (idx < 0 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
  };

  const distRootArg = read('dist-root', '');
  let distRoot = distRootArg.length > 0 ? distRootArg : join(process.cwd(), 'dist-perf');
  if (!existsSync(join(distRoot, 'index.html'))) {
    const fallback = join(process.cwd(), 'dist');
    if (existsSync(join(fallback, 'index.html'))) {
      // eslint-disable-next-line no-console
      console.warn(`[perf-startup-mobile] dist-perf missing, falling back to dist; window.perf will be unavailable.`);
      distRoot = fallback;
    } else {
      throw new Error('Neither dist-perf/index.html nor dist/index.html exist. Run `npm run build:perf` (preferred) or `npm run build` first.');
    }
  }

  return {
    mode: read('mode', 'open_frontier'),
    port: Number(read('port', String(DEFAULT_PORT))),
    headed: args.includes('--headed'),
    cpuThrottle: Number(read('cpu-throttle', String(DEFAULT_CPU_THROTTLE))),
    steadyStateMs: Number(read('steady-state-ms', '60000')),
    systemBreakdownIntervalMs: Number(read('breakdown-interval-ms', '1000')),
    viewportWidth: Number(read('viewport-width', String(DEFAULT_VIEWPORT_WIDTH))),
    viewportHeight: Number(read('viewport-height', String(DEFAULT_VIEWPORT_HEIGHT))),
    deviceScaleFactor: Number(read('device-scale-factor', String(DEFAULT_DEVICE_SCALE_FACTOR))),
    userAgent: read('user-agent', DEFAULT_MOBILE_UA),
    downloadKbps: Number(read('download-kbps', String(DEFAULT_DOWNLOAD_KBPS))),
    uploadKbps: Number(read('upload-kbps', String(DEFAULT_UPLOAD_KBPS))),
    latencyMs: Number(read('latency-ms', String(DEFAULT_LATENCY_MS))),
    distRoot,
  };
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function resolveFilePath(distRoot: string, pathname: string): string | null {
  const relative = pathname === '/' || pathname.length === 0 ? 'index.html' : pathname.replace(/^\//, '');
  const resolved = normalize(join(distRoot, relative));
  if (!resolved.startsWith(normalize(distRoot))) return null;
  return resolved;
}

function serveDist(req: IncomingMessage, res: ServerResponse, distRoot: string): void {
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  const filePath = resolveFilePath(distRoot, decodeURIComponent(url.pathname));
  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Not found: ${url.pathname}`);
    return;
  }
  const stats = statSync(filePath);
  const finalPath = stats.isDirectory() ? join(filePath, 'index.html') : filePath;
  if (!existsSync(finalPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Not found: ${url.pathname}`);
    return;
  }
  const body = readFileSync(finalPath);
  const contentType = MIME_TYPES[extname(finalPath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(body);
}

async function applyMobileEmulation(
  context: BrowserContext,
  page: Page,
  cdp: CDPSession,
  opts: ProbeOptions,
): Promise<void> {
  await context.setExtraHTTPHeaders({ 'user-agent': opts.userAgent });
  await page.setViewportSize({ width: opts.viewportWidth, height: opts.viewportHeight });
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: opts.viewportWidth,
    height: opts.viewportHeight,
    deviceScaleFactor: opts.deviceScaleFactor,
    mobile: true,
    screenWidth: opts.viewportWidth,
    screenHeight: opts.viewportHeight,
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.cpuThrottle });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: opts.latencyMs,
    downloadThroughput: Math.round((opts.downloadKbps * 1024) / 8),
    uploadThroughput: Math.round((opts.uploadKbps * 1024) / 8),
    connectionType: 'cellular4g',
  });
}

interface StartupSnapshot {
  startedAtMs: number;
  totalElapsedMs: number;
  marks: Array<{ name: string; atMs: number; sinceStartMs: number }>;
}

interface SystemTimingSample {
  tMs: number;
  fps: number;
  avgFrameMs: number;
  overBudgetPercent: number;
  systems: Array<{ name: string; emaMs: number; lastMs: number; peakMs: number; budgetMs: number }>;
}

async function pollSystemBreakdown(
  page: Page,
  durationMs: number,
  intervalMs: number,
): Promise<SystemTimingSample[]> {
  const samples: SystemTimingSample[] = [];
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    const sample = await page.evaluate(() => {
      const perf = (window as any).perf;
      if (!perf || typeof perf.report !== 'function') {
        return null;
      }
      const report = perf.report();
      return {
        tMs: performance.now(),
        fps: Number(report?.fps ?? 0),
        avgFrameMs: Number(report?.avgFrameMs ?? 0),
        overBudgetPercent: Number(report?.overBudgetPercent ?? 0),
        systems: Array.isArray(report?.systemBreakdown)
          ? report.systemBreakdown.map((s: any) => ({
              name: String(s.name ?? ''),
              emaMs: Number(s.emaMs ?? 0),
              lastMs: Number(s.lastMs ?? 0),
              peakMs: Number(s.peakMs ?? 0),
              budgetMs: Number(s.budgetMs ?? 0),
            }))
          : [],
      };
    });
    if (sample) {
      samples.push(sample);
    }
    await page.waitForTimeout(intervalMs);
  }
  return samples;
}

interface SteadyStateAggregate {
  sampleCount: number;
  avgFps: number;
  avgFrameMs: number;
  systems: Array<{ name: string; avgEmaMs: number; maxPeakMs: number; sampleCount: number }>;
}

function aggregateSteadyState(samples: SystemTimingSample[]): SteadyStateAggregate {
  if (samples.length === 0) {
    return { sampleCount: 0, avgFps: 0, avgFrameMs: 0, systems: [] };
  }
  const fpsSum = samples.reduce((s, x) => s + x.fps, 0);
  const frameSum = samples.reduce((s, x) => s + x.avgFrameMs, 0);
  const systemAccum = new Map<string, { emaSum: number; maxPeak: number; count: number }>();
  for (const sample of samples) {
    for (const sys of sample.systems) {
      const acc = systemAccum.get(sys.name) ?? { emaSum: 0, maxPeak: 0, count: 0 };
      acc.emaSum += sys.emaMs;
      acc.maxPeak = Math.max(acc.maxPeak, sys.peakMs);
      acc.count += 1;
      systemAccum.set(sys.name, acc);
    }
  }
  const systems = Array.from(systemAccum.entries())
    .map(([name, acc]) => ({
      name,
      avgEmaMs: Number((acc.emaSum / acc.count).toFixed(3)),
      maxPeakMs: Number(acc.maxPeak.toFixed(3)),
      sampleCount: acc.count,
    }))
    .sort((a, b) => b.avgEmaMs - a.avgEmaMs);
  return {
    sampleCount: samples.length,
    avgFps: Number((fpsSum / samples.length).toFixed(2)),
    avgFrameMs: Number((frameSum / samples.length).toFixed(3)),
    systems,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const usingPerfHarness = opts.distRoot.endsWith('dist-perf');

  const browser: Browser = await chromium.launch({
    headless: !opts.headed,
    args: ['--use-angle=swiftshader', '--enable-webgl'],
  });
  const server = createServer((req, res) => serveDist(req, res, opts.distRoot));
  await new Promise<void>((resolve) => server.listen(opts.port, HOST, resolve));

  const context = await browser.newContext({
    viewport: { width: opts.viewportWidth, height: opts.viewportHeight },
    userAgent: opts.userAgent,
    deviceScaleFactor: opts.deviceScaleFactor,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const consoleEntries: Array<{ type: string; text: string }> = [];
  const pageErrors: string[] = [];

  page.on('console', (msg) => consoleEntries.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => pageErrors.push(String(err?.stack ?? err)));

  await applyMobileEmulation(context, page, cdp, opts);
  await page.addInitScript({ content: readFileSync(OBSERVER_SCRIPT_PATH, 'utf-8') });

  try {
    const t0 = Date.now();
    // `perf=1` flips the `PerfDiagnostics.isPerfDiagnosticsEnabled()` gate so
    // `window.perf.report()` is exposed in the perf-harness build, which is
    // what the steady-state `systemBreakdown` poll reads.
    await page.goto(`http://${HOST}:${opts.port}/?logLevel=info&perf=1`, { waitUntil: 'networkidle', timeout: 180_000 });
    await page.waitForSelector('button[data-ref="start"]', { state: 'visible', timeout: 180_000 });
    const tStartVisible = Date.now();
    await page.click('button[data-ref="start"]');
    await page.waitForSelector(`[data-mode="${opts.mode}"]`, { state: 'visible', timeout: 180_000 });
    const tModeVisible = Date.now();

    const tModeClick = Date.now();
    await page.click(`[data-mode="${opts.mode}"]`);

    // With `?perf=1` the perf-harness build auto-confirms the initial deploy
    // (see `src/systems/player/PlayerRespawnManager.ts:655-661`), so the
    // deploy-UI flow short-circuits. Drive the visible/ready/click marks
    // off whatever path actually fires. We race the playable predicate
    // against the deploy-UI selector so either flow makes forward progress.
    const playableHandle = page.waitForFunction(() => {
      const hud = document.querySelector('#game-hud-root');
      const canvas = document.querySelector('canvas');
      const respawn = document.querySelector('#respawn-ui');
      const overlay = document.querySelector('.spawn-loading-overlay:not(.spawn-loading-overlay-hidden)');
      const hudPhase = hud?.getAttribute('data-phase');
      const canvasVisible = !!canvas && getComputedStyle(canvas).display !== 'none';
      const respawnHidden = !respawn || getComputedStyle(respawn).display === 'none';
      return hudPhase === 'playing' && canvasVisible && respawnHidden && !overlay;
    }, undefined, { timeout: 180_000, polling: 50 });

    let tDeployVisible = tModeClick;
    let tDeployReady = tModeClick;
    let tDeployClick = tModeClick;
    let autoConfirmed = false;
    try {
      await page.waitForSelector('#respawn-ui', { state: 'visible', timeout: 8000 });
      tDeployVisible = Date.now();
      await page.waitForFunction(() => {
        const button = document.querySelector<HTMLButtonElement>('#respawn-button');
        return !!button && !button.disabled;
      }, undefined, { timeout: 180_000 });
      tDeployReady = Date.now();
      tDeployClick = Date.now();
      await page.click('#respawn-button');
    } catch {
      // Auto-confirm path: deploy UI was skipped because perf-harness build
      // auto-confirmed the initial deploy. Deploy timing collapses to
      // `modeClickToPlayableMs`.
      autoConfirmed = true;
    }

    await playableHandle;
    const tPlayable = Date.now();

    const startup = await page.evaluate<StartupSnapshot | null>(() => {
      return (window as any).__startupTelemetry?.getSnapshot?.() ?? null;
    });

    const steadyStateSamples = usingPerfHarness
      ? await pollSystemBreakdown(page, opts.steadyStateMs, opts.systemBreakdownIntervalMs)
      : [];
    const steadyState = aggregateSteadyState(steadyStateSamples);

    const browserStalls = await page.evaluate(() => {
      return (window as any).__perfHarnessObservers?.drain?.() ?? null;
    });

    const summary = {
      createdAt: new Date().toISOString(),
      cycleId: 'cycle-2026-05-16-mobile-webgpu-and-sky-recovery',
      taskSlug: 'mobile-startup-and-frame-budget',
      emulation: {
        labeled: true,
        viewport: { width: opts.viewportWidth, height: opts.viewportHeight, deviceScaleFactor: opts.deviceScaleFactor },
        userAgent: opts.userAgent,
        cpuThrottleRate: opts.cpuThrottle,
        network: { downloadKbps: opts.downloadKbps, uploadKbps: opts.uploadKbps, latencyMs: opts.latencyMs },
        note: 'Chrome DevTools mobile emulation via Playwright + CDP. Real-device evidence supersedes this.',
      },
      mode: opts.mode,
      distRoot: opts.distRoot,
      usingPerfHarness,
      autoConfirmedDeploy: autoConfirmed,
      timings: {
        pageLoadToStartVisibleMs: tStartVisible - t0,
        startClickToModeVisibleMs: tModeVisible - tStartVisible,
        modeClickToDeployVisibleMs: tDeployVisible - tModeClick,
        modeClickToDeployReadyMs: tDeployReady - tModeClick,
        deployReadyToDeployClickMs: tDeployClick - tDeployReady,
        deployClickToPlayableMs: tPlayable - tDeployClick,
        modeClickToPlayableMs: tPlayable - tModeClick,
      },
      steadyState,
      pageErrorCount: pageErrors.length,
      consoleEntryCount: consoleEntries.length,
    };

    const artifactDir = join(ARTIFACT_ROOT, timestampSlug());
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2));
    writeFileSync(join(artifactDir, 'startup-marks.json'), JSON.stringify(startup, null, 2));
    writeFileSync(join(artifactDir, 'system-breakdown.json'), JSON.stringify(steadyStateSamples, null, 2));
    writeFileSync(join(artifactDir, 'browser-stalls.json'), JSON.stringify(browserStalls, null, 2));
    writeFileSync(
      join(artifactDir, 'console.json'),
      JSON.stringify({ consoleEntries, pageErrors }, null, 2),
    );

    // eslint-disable-next-line no-console
    console.log(`mobile-startup probe complete: ${artifactDir}`);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary.timings, null, 2));
  } finally {
    await cdp.detach().catch(() => {});
    await context.close();
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
