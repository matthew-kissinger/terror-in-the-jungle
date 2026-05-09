#!/usr/bin/env tsx

import { chromium, type Browser } from 'playwright';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, normalize, resolve } from 'path';

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

type MetricSummary = {
  average: number;
  median: number;
  p95: number;
  min: number;
  max: number;
};

type WebglTextureUploadEntry = {
  operation: string;
  duration: number;
  target: string;
  width: number;
  height: number;
  sourceType: string;
  sourceUrl: string;
  byteLength: number;
};

type WebglLargestUpload = {
  sourceUrl: string;
  operation: string;
  target: string;
  width: number;
  height: number;
  sourceType: string;
  sampleCount: number;
  runCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  averageDurationMs: number;
};

type WebglUploadSummary = {
  count: number;
  averageCount: number;
  totalDurationMs: number;
  averageTotalDurationMs: number;
  maxDurationMs: number;
  averageMaxDurationMs: number;
  countSummary: MetricSummary;
  totalDurationSummaryMs: MetricSummary;
  maxDurationSummaryMs: MetricSummary;
  largestUploads: WebglLargestUpload[];
};

type CandidateFlags = {
  disableVegetationNormals: boolean;
  useVegetationCandidates: boolean;
  vegetationCandidateImportPlan: string | null;
  vegetationCandidateReplacementCount: number;
};

type CandidateImportPlanItem = {
  runtime?: {
    color?: string | null;
    normal?: string | null;
    meta?: string | null;
  };
  candidate?: {
    color?: string | null;
    normal?: string | null;
    meta?: string | null;
  };
};

type CandidateImportPlan = {
  status?: string;
  importState?: string;
  items?: CandidateImportPlanItem[];
};

type CandidateAssetMap = Map<string, string>;

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
  candidateFlags: CandidateFlags;
  averagesMs: Record<string, number>;
  summary: {
    modeClickToPlayableMs: MetricSummary;
    deployClickToPlayableMs: MetricSummary;
    webglTextureUploadCount: MetricSummary;
    webglTextureUploadTotalDurationMs: MetricSummary;
    webglTextureUploadMaxDurationMs: MetricSummary;
  };
  webglUploadSummary: WebglUploadSummary;
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
    browserStalls: {
      longTaskCount: number;
      longTaskMaxDurationMs: number;
      longAnimationFrameCount: number;
      longAnimationFrameMaxDurationMs: number;
      webglTextureUploadCount: number;
      webglTextureUploadTotalDurationMs: number;
      webglTextureUploadMaxDurationMs: number;
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

function parseArgs(): { mode: string; runs: number; port: number; headed: boolean; useVegetationCandidates: boolean; vegetationCandidateImportPlan: string | null; candidateFlags: CandidateFlags } {
  const args = process.argv.slice(2);
  const readValue = (flag: string, fallback: string): string => {
    const index = args.findIndex((arg) => arg === `--${flag}`);
    if (index < 0 || index + 1 >= args.length) {
      return fallback;
    }
    return args[index + 1];
  };

  const useVegetationCandidates = args.includes('--use-vegetation-candidates');
  const vegetationCandidateImportPlan = readValue('vegetation-candidate-import-plan', '');

  return {
    mode: readValue('mode', 'open_frontier'),
    runs: Number(readValue('runs', String(DEFAULT_RUNS))),
    port: Number(readValue('port', String(DEFAULT_PORT))),
    headed: args.includes('--headed'),
    useVegetationCandidates,
    vegetationCandidateImportPlan: vegetationCandidateImportPlan || null,
    candidateFlags: {
      disableVegetationNormals: args.includes('--disable-vegetation-normals'),
      useVegetationCandidates,
      vegetationCandidateImportPlan: null,
      vegetationCandidateReplacementCount: 0,
    },
  };
}

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else files.push(path);
  }
  return files;
}

function latestFile(files: string[], predicate: (path: string) => boolean): string | null {
  const matches = files.filter(predicate);
  matches.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matches[0] ?? null;
}

function latestVegetationCandidateImportPlan(): string | null {
  return latestFile(
    walkFiles(ARTIFACT_ROOT),
    (path) => path.endsWith(join('projekt-143-vegetation-candidate-import-plan', 'import-plan.json')),
  );
}

function normalizeRequestKey(pathname: string): string {
  return decodeURIComponent(pathname).replace(/^\/+/, '').replaceAll('\\', '/');
}

function runtimePathToRequestKey(runtimePath: string | null | undefined): string | null {
  if (!runtimePath) return null;
  return runtimePath.replace(/^public[\\/]/, '').replace(/^\/+/, '').replaceAll('\\', '/');
}

function addCandidateMapping(
  map: CandidateAssetMap,
  runtimePath: string | null | undefined,
  candidatePath: string | null | undefined,
): void {
  const requestKey = runtimePathToRequestKey(runtimePath);
  if (!requestKey || !candidatePath) return;
  const resolvedCandidate = resolve(process.cwd(), candidatePath);
  if (!existsSync(resolvedCandidate)) return;
  map.set(requestKey, resolvedCandidate);
}

function loadVegetationCandidateAssetMap(importPlanPath: string | null): { map: CandidateAssetMap; importPlanPath: string | null } {
  const resolvedImportPlanPath = importPlanPath
    ? resolve(process.cwd(), importPlanPath)
    : latestVegetationCandidateImportPlan();
  const map: CandidateAssetMap = new Map();
  if (!resolvedImportPlanPath || !existsSync(resolvedImportPlanPath)) {
    throw new Error('Vegetation candidate import plan not found. Run npx tsx scripts/audit-archive/vegetation-candidate-import-plan.ts first or pass --vegetation-candidate-import-plan <path>.');
  }

  const importPlan = JSON.parse(readFileSync(resolvedImportPlanPath, 'utf-8')) as CandidateImportPlan;
  if (importPlan.status !== 'pass' || !['dry_run_ready', 'applied'].includes(String(importPlan.importState))) {
    throw new Error(`Vegetation candidate import plan is not usable for proof substitution: status=${importPlan.status ?? 'missing'} importState=${importPlan.importState ?? 'missing'}`);
  }

  for (const item of importPlan.items ?? []) {
    addCandidateMapping(map, item.runtime?.color, item.candidate?.color);
    addCandidateMapping(map, item.runtime?.normal, item.candidate?.normal);
    addCandidateMapping(map, item.runtime?.meta, item.candidate?.meta);
  }

  if (map.size === 0) {
    throw new Error('Vegetation candidate import plan produced zero runtime asset substitutions.');
  }

  return { map, importPlanPath: resolvedImportPlanPath };
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

function serveFile(filePath: string, res: ServerResponse): void {
  const body = readFileSync(filePath);
  const contentType = MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(body);
}

function serveDist(req: IncomingMessage, res: ServerResponse, candidateAssetMap: CandidateAssetMap): void {
  const requestUrl = new URL(req.url ?? '/', `http://${HOST}`);
  const candidateFile = candidateAssetMap.get(normalizeRequestKey(requestUrl.pathname));
  if (candidateFile && existsSync(candidateFile)) {
    serveFile(candidateFile, res);
    return;
  }

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

  serveFile(finalPath, res);
}

async function runBenchmarkIteration(
  browser: Browser,
  iteration: number,
  mode: string,
  port: number,
  candidateFlags: CandidateFlags,
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
    if (candidateFlags.disableVegetationNormals) {
      await page.addInitScript({
        content: 'window.__KB_LOAD_DISABLE_VEGETATION_NORMALS__ = true;',
      });
    }
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
    }, undefined, {
      timeout: 120_000,
      // Do not use rAF polling for the readiness gate. A delayed compositor
      // frame is useful evidence, but it must not hide that the live-entry DOM
      // state is already playable.
      polling: 50,
    });
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

function roundMetric(value: number): number {
  return Number(value.toFixed(3));
}

function metricSummary(values: number[]): MetricSummary {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) {
    return { average: 0, median: 0, p95: 0, min: 0, max: 0 };
  }

  const percentile = (fraction: number): number => {
    const index = Math.min(finite.length - 1, Math.max(0, Math.ceil(finite.length * fraction) - 1));
    return finite[index];
  };

  const middle = Math.floor(finite.length / 2);
  const median = finite.length % 2 === 0
    ? (finite[middle - 1] + finite[middle]) / 2
    : finite[middle];

  return {
    average: roundMetric(finite.reduce((sum, value) => sum + value, 0) / finite.length),
    median: roundMetric(median),
    p95: roundMetric(percentile(0.95)),
    min: roundMetric(finite[0]),
    max: roundMetric(finite[finite.length - 1]),
  };
}

function numericStallMetric(run: BenchmarkRun, key: string): number {
  const value = run.browserStalls?.totals?.[key];
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeSourceUrl(sourceUrl: string): string {
  if (sourceUrl.length === 0) {
    return '';
  }

  try {
    const parsed = new URL(sourceUrl);
    return decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  } catch {
    return sourceUrl.replace(/^\/+/, '');
  }
}

function webglTopUploads(run: BenchmarkRun): WebglTextureUploadEntry[] {
  const recent = run.browserStalls?.recent;
  const topUploads = Array.isArray(recent?.webglTextureUploadTop)
    ? recent.webglTextureUploadTop
    : [];

  return topUploads
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      operation: stringValue(entry.operation),
      duration: numberValue(entry.duration),
      target: stringValue(entry.target),
      width: numberValue(entry.width),
      height: numberValue(entry.height),
      sourceType: stringValue(entry.sourceType),
      sourceUrl: normalizeSourceUrl(stringValue(entry.sourceUrl)),
      byteLength: numberValue(entry.byteLength),
    }))
    .filter((entry) => entry.duration > 0);
}

function buildWebglUploadSummary(runs: BenchmarkRun[]): WebglUploadSummary {
  const countValues = runs.map((run) => numericStallMetric(run, 'webglTextureUploadCount'));
  const totalDurationValues = runs.map((run) => numericStallMetric(run, 'webglTextureUploadTotalDurationMs'));
  const maxDurationValues = runs.map((run) => numericStallMetric(run, 'webglTextureUploadMaxDurationMs'));
  const countSummary = metricSummary(countValues);
  const totalDurationSummary = metricSummary(totalDurationValues);
  const maxDurationSummary = metricSummary(maxDurationValues);
  const buckets = new Map<string, WebglLargestUpload & { runIterations: Set<number> }>();

  for (const run of runs) {
    for (const upload of webglTopUploads(run)) {
      const sourceUrl = upload.sourceUrl.length > 0 ? upload.sourceUrl : '(inline-or-unknown)';
      const key = [
        sourceUrl,
        upload.operation,
        upload.target,
        upload.width,
        upload.height,
        upload.sourceType,
      ].join('|');
      const existing = buckets.get(key);
      if (existing) {
        existing.sampleCount += 1;
        existing.totalDurationMs = roundMetric(existing.totalDurationMs + upload.duration);
        existing.maxDurationMs = roundMetric(Math.max(existing.maxDurationMs, upload.duration));
        existing.averageDurationMs = roundMetric(existing.totalDurationMs / existing.sampleCount);
        existing.runIterations.add(run.iteration);
        existing.runCount = existing.runIterations.size;
      } else {
        buckets.set(key, {
          sourceUrl,
          operation: upload.operation,
          target: upload.target,
          width: upload.width,
          height: upload.height,
          sourceType: upload.sourceType,
          sampleCount: 1,
          runCount: 1,
          totalDurationMs: roundMetric(upload.duration),
          maxDurationMs: roundMetric(upload.duration),
          averageDurationMs: roundMetric(upload.duration),
          runIterations: new Set([run.iteration]),
        });
      }
    }
  }

  const largestUploads = Array.from(buckets.values())
    .map(({ runIterations: _runIterations, ...upload }) => upload)
    .sort((a, b) => b.maxDurationMs - a.maxDurationMs || b.totalDurationMs - a.totalDurationMs)
    .slice(0, 12);

  return {
    count: roundMetric(countValues.reduce((sum, value) => sum + value, 0)),
    averageCount: countSummary.average,
    totalDurationMs: roundMetric(totalDurationValues.reduce((sum, value) => sum + value, 0)),
    averageTotalDurationMs: totalDurationSummary.average,
    maxDurationMs: maxDurationSummary.max,
    averageMaxDurationMs: maxDurationSummary.average,
    countSummary,
    totalDurationSummaryMs: totalDurationSummary,
    maxDurationSummaryMs: maxDurationSummary,
    largestUploads,
  };
}

function buildSummary(mode: string, runs: BenchmarkRun[], url: string, candidateFlags: CandidateFlags): Summary {
  const webglUploadSummary = buildWebglUploadSummary(runs);
  return {
    createdAt: new Date().toISOString(),
    mode,
    runs: runs.length,
    url,
    candidateFlags,
    averagesMs: {
      pageLoadToStartVisible: averageMetric(runs, 'pageLoadToStartVisible'),
      startClickToModeVisible: averageMetric(runs, 'startClickToModeVisible'),
      modeClickToDeployVisible: averageMetric(runs, 'modeClickToDeployVisible'),
      modeClickToDeployReady: averageMetric(runs, 'modeClickToDeployReady'),
      deployReadyToDeployClick: averageMetric(runs, 'deployReadyToDeployClick'),
      deployClickToPlayable: averageMetric(runs, 'deployClickToPlayable'),
      modeClickToPlayable: averageMetric(runs, 'modeClickToPlayable'),
    },
    summary: {
      modeClickToPlayableMs: metricSummary(runs.map((run) => run.timings.modeClickToPlayable)),
      deployClickToPlayableMs: metricSummary(runs.map((run) => run.timings.deployClickToPlayable)),
      webglTextureUploadCount: webglUploadSummary.countSummary,
      webglTextureUploadTotalDurationMs: webglUploadSummary.totalDurationSummaryMs,
      webglTextureUploadMaxDurationMs: webglUploadSummary.maxDurationSummaryMs,
    },
    webglUploadSummary,
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
        longTaskCount: numericStallMetric(run, 'longTaskCount'),
        longTaskMaxDurationMs: numericStallMetric(run, 'longTaskMaxDurationMs'),
        longAnimationFrameCount: numericStallMetric(run, 'longAnimationFrameCount'),
        longAnimationFrameMaxDurationMs: numericStallMetric(run, 'longAnimationFrameMaxDurationMs'),
        webglTextureUploadCount: numericStallMetric(run, 'webglTextureUploadCount'),
        webglTextureUploadTotalDurationMs: numericStallMetric(run, 'webglTextureUploadTotalDurationMs'),
        webglTextureUploadMaxDurationMs: numericStallMetric(run, 'webglTextureUploadMaxDurationMs'),
      },
    })),
  };
}

async function main(): Promise<void> {
  ensureBuildExists();
  const options = parseArgs();
  let candidateAssetMap: CandidateAssetMap = new Map();
  if (options.useVegetationCandidates) {
    const candidate = loadVegetationCandidateAssetMap(options.vegetationCandidateImportPlan);
    candidateAssetMap = candidate.map;
    options.candidateFlags.vegetationCandidateImportPlan = candidate.importPlanPath
      ? normalize(candidate.importPlanPath).replaceAll('\\', '/')
      : null;
    options.candidateFlags.vegetationCandidateReplacementCount = candidateAssetMap.size;
  }
  const browser = await chromium.launch({
    headless: !options.headed,
    args: ['--use-angle=swiftshader', '--enable-webgl'],
  });
  const server = createServer((req, res) => serveDist(req, res, candidateAssetMap));

  await new Promise<void>((resolve) => server.listen(options.port, HOST, resolve));

  try {
    const runs: BenchmarkRun[] = [];
    for (let iteration = 1; iteration <= options.runs; iteration++) {
      runs.push(await runBenchmarkIteration(browser, iteration, options.mode, options.port, options.candidateFlags));
    }

    const candidateSuffix = [
      options.candidateFlags.disableVegetationNormals ? 'vegetation-normals-disabled' : '',
      options.candidateFlags.useVegetationCandidates ? 'vegetation-candidates' : '',
    ].filter(Boolean).join('-');
    const artifactDir = join(
      ARTIFACT_ROOT,
      timestampSlug(),
      `startup-ui-${options.mode.replaceAll('_', '-')}${candidateSuffix ? `-${candidateSuffix}` : ''}`,
    );
    mkdirSync(artifactDir, { recursive: true });

    const summary = buildSummary(
      options.mode,
      runs,
      `http://${HOST}:${options.port}/?logLevel=info`,
      options.candidateFlags
    );
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
