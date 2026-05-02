#!/usr/bin/env tsx

import { chromium, type Browser } from 'playwright';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, normalize } from 'path';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4174;
const DIST_ROOT = join(process.cwd(), 'dist');
const INDEX_PATH = join(DIST_ROOT, 'index.html');
const OBSERVER_SCRIPT_PATH = join(process.cwd(), 'scripts', 'perf-browser-observers.js');
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const DEFAULT_RUNS = 3;

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

type StartupMark = {
  name: string;
  atMs: number;
  sinceStartMs: number;
};

type StartupSnapshot = {
  startedAtMs: number;
  totalElapsedMs: number;
  marks: StartupMark[];
} | null;

type ConsoleEntry = {
  type: string;
  text: string;
};

type BrowserStallsSnapshot = {
  support?: Record<string, boolean>;
  totals?: Record<string, unknown>;
  recent?: Record<string, unknown>;
} | null;

type CpuProfileSnapshot = unknown;

type BenchmarkRun = {
  iteration: number;
  timings: {
    pageLoadToStartVisible: number;
    startClickToModeVisible: number;
    modeClickToDeployVisible: number;
    modeClickToDeployReady: number;
    deployReadyToDeployClick: number;
    deployClickToPlayable: number;
    modeClickToPlayable: number;
  };
  selectedSpawn: string;
  startup: StartupSnapshot;
  consoleEntries: ConsoleEntry[];
  pageErrors: string[];
  requestErrors: string[];
  browserStalls: BrowserStallsSnapshot;
  cpuProfile: CpuProfileSnapshot;
};

type Summary = {
  createdAt: string;
  mode: string;
  runs: number;
  url: string;
  averagesMs: Record<string, number>;
  perRun: Array<{
    iteration: number;
    timings: BenchmarkRun['timings'];
    selectedSpawn: string;
    startupMarkCount: number;
    totalElapsedMs: number | null;
    errorCounts: {
      pageErrors: number;
      requestErrors: number;
    };
  }>;
};

function ensureBuildExists(): void {
  if (!existsSync(INDEX_PATH)) {
    throw new Error('dist/index.html not found. Run `npm run build` before `perf-startup-ui`.');
  }
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function parseArgs(): { mode: string; runs: number; port: number; headed: boolean } {
  const args = process.argv.slice(2);
  const readValue = (flag: string, fallback: string): string => {
    const index = args.findIndex((arg) => arg === `--${flag}`);
    if (index < 0 || index + 1 >= args.length) {
      return fallback;
    }
    return args[index + 1];
  };

  return {
    mode: readValue('mode', 'open_frontier'),
    runs: Number(readValue('runs', String(DEFAULT_RUNS))),
    port: Number(readValue('port', String(DEFAULT_PORT))),
    headed: args.includes('--headed'),
  };
}

function resolveFilePath(pathname: string): string | null {
  const relativePath = pathname === '/' || pathname.length === 0
    ? 'index.html'
    : pathname.replace(/^\//, '');
  const resolved = normalize(join(DIST_ROOT, relativePath));
  if (!resolved.startsWith(normalize(DIST_ROOT))) {
    return null;
  }
  return resolved;
}

function serveDist(req: IncomingMessage, res: ServerResponse): void {
  const requestUrl = new URL(req.url ?? '/', `http://${HOST}`);
  const filePath = resolveFilePath(requestUrl.pathname);
  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Not found: ${requestUrl.pathname}`);
    return;
  }

  const stats = statSync(filePath);
  const finalPath = stats.isDirectory() ? join(filePath, 'index.html') : filePath;
  if (!existsSync(finalPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Not found: ${requestUrl.pathname}`);
    return;
  }

  const body = readFileSync(finalPath);
  const contentType = MIME_TYPES[extname(finalPath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(body);
}

async function runBenchmarkIteration(
  browser: Browser,
  iteration: number,
  mode: string,
  port: number,
): Promise<BenchmarkRun> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const cdpSession = await context.newCDPSession(page);
  const consoleEntries: ConsoleEntry[] = [];
  const pageErrors: string[] = [];
  const requestErrors: string[] = [];
  let cpuProfile: CpuProfileSnapshot = null;

  page.on('console', (msg) => {
    consoleEntries.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (error) => {
    pageErrors.push(String(error?.stack ?? error));
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      requestErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  try {
    await cdpSession.send('Profiler.enable');
    await cdpSession.send('Profiler.start');
    const t0 = Date.now();
    await page.addInitScript({ content: readFileSync(OBSERVER_SCRIPT_PATH, 'utf-8') });
    await page.goto(`http://${HOST}:${port}/?logLevel=info`, { waitUntil: 'networkidle', timeout: 120_000 });
    await page.waitForSelector('button[data-ref="start"]', { state: 'visible', timeout: 120_000 });
    const tStartVisible = Date.now();

    await page.click('button[data-ref="start"]');
    await page.waitForSelector(`[data-mode="${mode}"]`, { state: 'visible', timeout: 120_000 });
    const tModeVisible = Date.now();

    const tModeClick = Date.now();
    await page.click(`[data-mode="${mode}"]`);
    await page.waitForSelector('#respawn-ui', { state: 'visible', timeout: 120_000 });
    const tDeployVisible = Date.now();

    await page.waitForFunction(() => {
      const button = document.querySelector<HTMLButtonElement>('#respawn-button');
      return !!button && !button.disabled;
    }, undefined, { timeout: 120_000 });
    const tDeployReady = Date.now();

    const selectedSpawn = await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('#respawn-button');
      return button?.textContent?.trim() ?? 'DEPLOY';
    });

    const tDeployClick = Date.now();
    await page.click('#respawn-button');

    await page.waitForFunction(() => {
      const hud = document.querySelector('#game-hud-root');
      const canvas = document.querySelector('canvas');
      const respawn = document.querySelector('#respawn-ui');
      const overlay = document.querySelector('.spawn-loading-overlay:not(.spawn-loading-overlay-hidden)');
      const hudPhase = hud?.getAttribute('data-phase');
      const canvasVisible = !!canvas && getComputedStyle(canvas).display !== 'none';
      const respawnHidden = !respawn || getComputedStyle(respawn).display === 'none';
      return hudPhase === 'playing' && canvasVisible && respawnHidden && !overlay;
    }, undefined, { timeout: 120_000 });
    const tPlayable = Date.now();

    const startup = await page.evaluate(() => {
      return (window as any).__startupTelemetry?.getSnapshot?.() ?? null;
    });
    const browserStalls = await page.evaluate(() => {
      return (window as any).__perfHarnessObservers?.drain?.() ?? null;
    });
    const profileResult = await cdpSession.send('Profiler.stop');
    cpuProfile = profileResult?.profile ?? null;

    return {
      iteration,
      timings: {
        pageLoadToStartVisible: tStartVisible - t0,
        startClickToModeVisible: tModeVisible - tStartVisible,
        modeClickToDeployVisible: tDeployVisible - tModeClick,
        modeClickToDeployReady: tDeployReady - tModeClick,
        deployReadyToDeployClick: tDeployClick - tDeployReady,
        deployClickToPlayable: tPlayable - tDeployClick,
        modeClickToPlayable: tPlayable - tModeClick,
      },
      selectedSpawn,
      startup,
      consoleEntries,
      pageErrors,
      requestErrors,
      browserStalls,
      cpuProfile,
    };
  } finally {
    try {
      if (cpuProfile === null) {
        const profileResult = await cdpSession.send('Profiler.stop');
        cpuProfile = profileResult?.profile ?? null;
      }
    } catch {
      // Profiling is diagnostic-only; startup timing artifacts remain useful
      // when Chromium refuses stop during teardown or navigation failure.
    }
    await cdpSession.detach().catch(() => {});
    await context.close();
  }
}

function averageMetric(runs: BenchmarkRun[], key: keyof BenchmarkRun['timings']): number {
  const total = runs.reduce((sum, run) => sum + run.timings[key], 0);
  return Math.round((total / runs.length) * 10) / 10;
}

function buildSummary(mode: string, runs: BenchmarkRun[], url: string): Summary {
  return {
    createdAt: new Date().toISOString(),
    mode,
    runs: runs.length,
    url,
    averagesMs: {
      pageLoadToStartVisible: averageMetric(runs, 'pageLoadToStartVisible'),
      startClickToModeVisible: averageMetric(runs, 'startClickToModeVisible'),
      modeClickToDeployVisible: averageMetric(runs, 'modeClickToDeployVisible'),
      modeClickToDeployReady: averageMetric(runs, 'modeClickToDeployReady'),
      deployReadyToDeployClick: averageMetric(runs, 'deployReadyToDeployClick'),
      deployClickToPlayable: averageMetric(runs, 'deployClickToPlayable'),
      modeClickToPlayable: averageMetric(runs, 'modeClickToPlayable'),
    },
    perRun: runs.map((run) => ({
      iteration: run.iteration,
      timings: run.timings,
      selectedSpawn: run.selectedSpawn,
      startupMarkCount: run.startup?.marks.length ?? 0,
      totalElapsedMs: run.startup?.totalElapsedMs ?? null,
      errorCounts: {
        pageErrors: run.pageErrors.length,
        requestErrors: run.requestErrors.length,
      },
      browserStalls: {
        longTaskCount: Number(run.browserStalls?.totals?.longTaskCount ?? 0),
        longTaskMaxDurationMs: Number(run.browserStalls?.totals?.longTaskMaxDurationMs ?? 0),
        longAnimationFrameCount: Number(run.browserStalls?.totals?.longAnimationFrameCount ?? 0),
        longAnimationFrameMaxDurationMs: Number(run.browserStalls?.totals?.longAnimationFrameMaxDurationMs ?? 0),
        webglTextureUploadCount: Number(run.browserStalls?.totals?.webglTextureUploadCount ?? 0),
        webglTextureUploadTotalDurationMs: Number(
          run.browserStalls?.totals?.webglTextureUploadTotalDurationMs ?? 0,
        ),
        webglTextureUploadMaxDurationMs: Number(
          run.browserStalls?.totals?.webglTextureUploadMaxDurationMs ?? 0,
        ),
      },
    })),
  };
}

async function main(): Promise<void> {
  ensureBuildExists();
  const options = parseArgs();
  const browser = await chromium.launch({
    headless: !options.headed,
    args: ['--use-angle=swiftshader', '--enable-webgl'],
  });
  const server = createServer(serveDist);

  await new Promise<void>((resolve) => server.listen(options.port, HOST, resolve));

  try {
    const runs: BenchmarkRun[] = [];
    for (let iteration = 1; iteration <= options.runs; iteration++) {
      runs.push(await runBenchmarkIteration(browser, iteration, options.mode, options.port));
    }

    const artifactDir = join(
      ARTIFACT_ROOT,
      timestampSlug(),
      `startup-ui-${options.mode.replaceAll('_', '-')}`,
    );
    mkdirSync(artifactDir, { recursive: true });

    const summary = buildSummary(options.mode, runs, `http://${HOST}:${options.port}/?logLevel=info`);
    writeFileSync(join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2));
    writeFileSync(
      join(artifactDir, 'startup-marks.json'),
      JSON.stringify(runs.map((run) => ({
        iteration: run.iteration,
        startup: run.startup,
      })), null, 2),
    );
    writeFileSync(
      join(artifactDir, 'console.json'),
      JSON.stringify(runs.map((run) => ({
        iteration: run.iteration,
        consoleEntries: run.consoleEntries,
        pageErrors: run.pageErrors,
        requestErrors: run.requestErrors,
      })), null, 2),
    );
    writeFileSync(
      join(artifactDir, 'browser-stalls.json'),
      JSON.stringify(runs.map((run) => ({
        iteration: run.iteration,
        browserStalls: run.browserStalls,
      })), null, 2),
    );
    runs.forEach((run) => {
      if (run.cpuProfile) {
        writeFileSync(
          join(artifactDir, `cpu-profile-iteration-${run.iteration}.cpuprofile`),
          JSON.stringify(run.cpuProfile),
        );
      }
    });

    console.log(`Startup benchmark complete: ${artifactDir}`);
    console.log(JSON.stringify(summary.averagesMs, null, 2));
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
