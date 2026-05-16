#!/usr/bin/env tsx

/**
 * TSL shader-cost probe (R3, tsl-shader-cost-probe).
 *
 * Boots the perf-harness build, drives mode-click to playable, calls
 * renderer.compileAsync(scene, camera), and harvests compiled GLSL + sampler/
 * uniform/instruction counts. Validates the R1 terrain biome-sampler early-out
 * (PR #211/#213) — terrain-nav-reviewer flagged this as a deferred check.
 *
 * Refs: docs/tasks/cycle-mobile-webgl2-fallback-fix.md;
 * docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md;
 * src/core/RendererBackend.ts (collectKonveyerNodeMaterialShaders);
 * src/core/bootstrap.ts (window.__tslShaderCost).
 *
 * Usage:
 *   npm run build:perf
 *   npx tsx scripts/perf-tsl-shader-cost.ts [--renderer <mode>] [--mode <m>] [--emit-glsl] [--headed]
 *
 * Pre/post comparison: check out pre-fix SHA (fd646aeb per R1 audit), re-run, diff report.json.
 * Sampler counts are portable across drivers; instruction-count is a line-count proxy.
 */

import { chromium, type Browser, type CDPSession } from 'playwright';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, normalize } from 'path';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4287;
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'cycle-mobile-webgl2-fallback-fix', 'tsl-shader-cost');
const DEFAULT_MODE = 'open_frontier';
const DEFAULT_RENDERER = 'webgpu-force-webgl';

const MIME_TYPES: Record<string, string> = {
  '.br': 'application/octet-stream', '.css': 'text/css; charset=utf-8',
  '.f32': 'application/octet-stream', '.glb': 'model/gltf-binary',
  '.gz': 'application/octet-stream', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.ogg': 'audio/ogg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.wav': 'audio/wav', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

interface ProbeOptions {
  mode: string;
  rendererMode: 'webgpu' | 'webgpu-strict' | 'webgpu-force-webgl' | 'webgl';
  port: number;
  headed: boolean;
  distRoot: string;
  emitGlsl: boolean;
  steadyWaitMs: number;
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
      console.warn('[perf-tsl-shader-cost] dist-perf missing, falling back to dist (auto-confirm deploy will not fire).');
      distRoot = fallback;
    } else {
      throw new Error('Neither dist-perf/index.html nor dist/index.html exist. Run `npm run build:perf` (preferred) or `npm run build` first.');
    }
  }

  const rendererRaw = read('renderer', DEFAULT_RENDERER);
  const allowed = ['webgpu', 'webgpu-strict', 'webgpu-force-webgl', 'webgl'] as const;
  const rendererMode = allowed.includes(rendererRaw as typeof allowed[number])
    ? (rendererRaw as typeof allowed[number])
    : DEFAULT_RENDERER as typeof allowed[number];

  return {
    mode: read('mode', DEFAULT_MODE),
    rendererMode,
    port: Number(read('port', String(DEFAULT_PORT))),
    headed: args.includes('--headed'),
    emitGlsl: args.includes('--emit-glsl'),
    steadyWaitMs: Number(read('steady-wait-ms', '4000')),
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

// Mirror of `KonveyerNodeMaterialShaderRecord` (src/core/RendererBackend.ts).
interface ShaderMetrics {
  fragmentShader: string | null;
  vertexShader: string | null;
  fragmentLength: number | null;
  vertexLength: number | null;
  fragmentSamplerCount: number | null;
  fragmentUniformCount: number | null;
  fragmentInstructionCount: number | null;
  vertexSamplerCount: number | null;
  vertexUniformCount: number | null;
  vertexInstructionCount: number | null;
}

interface MaterialRecord extends ShaderMetrics {
  kind: 'material';
  marker: 'isKonveyerTerrainNodeMaterial' | 'isKonveyerNpcImpostorNodeMaterial' | 'isKonveyerBillboardNodeMaterial';
  className: string;
  materialName: string | null;
  uuid: string;
  customProgramCacheKey: string | null;
  shaderSource: 'material._latestBuilder' | 'none';
}

interface CacheRecord extends ShaderMetrics {
  kind: 'cacheEntry';
  cacheIndex: number;
}

type ShaderRecord = MaterialRecord | CacheRecord;

interface ShaderCostResult {
  error: string | null;
  records: ShaderRecord[];
}

interface BucketSummary {
  label: string;
  count: number;
  samplerRange: [number, number] | null;
  uniformRange: [number, number] | null;
  instructionRange: [number, number] | null;
}

interface ProbeReport {
  createdAt: string;
  cycleId: string;
  taskSlug: string;
  probeScript: string;
  source: { branch: string | null; head: string | null };
  options: {
    mode: string; rendererMode: ProbeOptions['rendererMode']; distRoot: string;
    emulation: { label: string; headless: boolean; note: string };
  };
  resolvedBackend: string | null;
  rendererClassName: string | null;
  rendererCompileError: string | null;
  materialCount: number;
  cacheEntryCount: number;
  perRecord: ShaderRecord[];
  cacheBuckets: BucketSummary[];
  // Headline pre/post-fix metric — R1 acceptance asks this drop >=4x.
  maxFragmentSamplerCountAcrossCache: number | null;
  pageErrors: string[];
  consoleErrors: string[];
}

function rangeOf(records: ShaderRecord[], key: 'fragmentSamplerCount' | 'fragmentUniformCount' | 'fragmentInstructionCount'): [number, number] | null {
  let lo: number | null = null;
  let hi: number | null = null;
  for (const r of records) {
    const v = r[key];
    if (v === null) continue;
    lo = lo === null ? v : Math.min(lo, v);
    hi = hi === null ? v : Math.max(hi, v);
  }
  return lo === null || hi === null ? null : [lo, hi];
}

function bucketCacheEntries(records: ShaderRecord[]): BucketSummary[] {
  // Sampler-count discriminates Konveyer cache entries (TSL mangles uniform names).
  // Pre-R1 terrain ~150+ samplers; post-R1 ~10–20; vegetation/impostor ~2–4.
  const cacheOnly = records.filter((r): r is CacheRecord => r.kind === 'cacheEntry');
  const buckets: Array<[string, (s: number) => boolean]> = [
    ['high-sampler (>=8)', (s) => s >= 8],
    ['mid-sampler (4-7)', (s) => s >= 4 && s <= 7],
    ['low-sampler (1-3)', (s) => s >= 1 && s <= 3],
    ['no-sampler (0)', (s) => s === 0],
  ];
  return buckets.map(([label, pred]) => {
    const inBucket = cacheOnly.filter((r) => r.fragmentSamplerCount !== null && pred(r.fragmentSamplerCount));
    return {
      label, count: inBucket.length,
      samplerRange: rangeOf(inBucket, 'fragmentSamplerCount'),
      uniformRange: rangeOf(inBucket, 'fragmentUniformCount'),
      instructionRange: rangeOf(inBucket, 'fragmentInstructionCount'),
    };
  });
}

async function captureGitHead(): Promise<{ branch: string | null; head: string | null }> {
  try {  // Read .git/HEAD instead of spawning git. Best-effort.
    const headPath = join(process.cwd(), '.git', 'HEAD');
    if (!existsSync(headPath)) return { branch: null, head: null };
    const headContent = readFileSync(headPath, 'utf-8').trim();
    if (headContent.startsWith('ref:')) {
      const refPath = headContent.slice(5).trim();
      const branch = refPath.replace(/^refs\/heads\//, '');
      const sha = readFileSync(join(process.cwd(), '.git', refPath), 'utf-8').trim();
      return { branch, head: sha };
    }
    return { branch: null, head: headContent };
  } catch {
    return { branch: null, head: null };
  }
}

async function main(): Promise<void> {
  const opts = parseArgs();

  // SwiftShader fills both backends when a real GPU is unavailable.
  // Mirrors scripts/mobile-renderer-probe.ts.
  const browser: Browser = await chromium.launch({
    headless: !opts.headed,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-webgpu'],
  });
  const server = createServer((req, res) => serveDist(req, res, opts.distRoot));
  await new Promise<void>((resolve) => server.listen(opts.port, HOST, resolve));

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  let cdp: CDPSession | null = null;
  try {
    cdp = await context.newCDPSession(page);
  } catch {
    cdp = null;
  }

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err?.stack ?? err)));

  const head = await captureGitHead();

  let resolvedBackend: string | null = null;
  let rendererClassName: string | null = null;
  let cost: ShaderCostResult = { error: null, records: [] };
  let rendererCompileError: string | null = null;
  try {
    // perf=1 exposes harness globals; diag=1 exposes __tslShaderCost; renderer= picks the backend.
    const url = `http://${HOST}:${opts.port}/?logLevel=info&perf=1&diag=1&renderer=${opts.rendererMode}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 180_000 });
    await page.waitForSelector('button[data-ref="start"]', { state: 'visible', timeout: 180_000 });
    await page.click('button[data-ref="start"]');
    await page.waitForSelector(`[data-mode="${opts.mode}"]`, { state: 'visible', timeout: 180_000 });
    await page.click(`[data-mode="${opts.mode}"]`);

    // Race playable-frame and deploy-UI; perf-harness build auto-confirms deploy.
    const playableHandle = page.waitForFunction(() => {
      const hud = document.querySelector('#game-hud-root');
      const canvas = document.querySelector('canvas');
      const respawn = document.querySelector('#respawn-ui');
      const overlay = document.querySelector('.spawn-loading-overlay:not(.spawn-loading-overlay-hidden)');
      const hudPhase = hud?.getAttribute('data-phase');
      const canvasVisible = !!canvas && getComputedStyle(canvas).display !== 'none';
      const respawnHidden = !respawn || getComputedStyle(respawn).display === 'none';
      return hudPhase === 'playing' && canvasVisible && respawnHidden && !overlay;
    }, undefined, { timeout: 180_000, polling: 100 });
    try {
      await page.waitForSelector('#respawn-ui', { state: 'visible', timeout: 8000 });
      await page.waitForFunction(() => {
        const button = document.querySelector<HTMLButtonElement>('#respawn-button');
        return !!button && !button.disabled;
      }, undefined, { timeout: 180_000 });
      await page.click('#respawn-button');
    } catch {
      // auto-confirm path
    }
    await playableHandle;

    // Wait for terrain CDLOD + vegetation + NPC bucket allocation;
    // TSL builders only populate after first program build (i.e. first render).
    await page.waitForTimeout(opts.steadyWaitMs);

    const capabilities = await page.evaluate(() => {
      const w = window as unknown as { __rendererBackendCapabilities?: () => unknown };
      const caps = w.__rendererBackendCapabilities?.() as { resolvedBackend?: string } | null;
      const engine = (window as any).__engine;
      const className = engine?.renderer?.renderer?.constructor?.name ?? null;
      return { resolvedBackend: caps?.resolvedBackend ?? null, className };
    });
    resolvedBackend = capabilities.resolvedBackend;
    rendererClassName = capabilities.className;

    cost = await page.evaluate(async () => {
      const probe = (window as unknown as {
        __tslShaderCost?: (opts?: { compile?: boolean }) => Promise<unknown>;
      }).__tslShaderCost;
      if (!probe) {
        return { error: '__tslShaderCost is not exposed on window (require ?diag=1 or ?perf=1 in dev/perf-harness)', records: [] };
      }
      return await probe({ compile: true }) as unknown as { error: string | null; records: unknown[] };
    }) as ShaderCostResult;
    if (cost.error) rendererCompileError = cost.error;
  } finally {
    await cdp?.detach().catch(() => undefined);
    await context.close();
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const artifactDir = join(ARTIFACT_ROOT, timestampSlug());
  mkdirSync(artifactDir, { recursive: true });

  // Drop GLSL bodies from report.json (50-200KB each); --emit-glsl writes them separately.
  const recordsForReport: ShaderRecord[] = cost.records.map((r) => ({ ...r, fragmentShader: null, vertexShader: null }));
  const materialCount = cost.records.filter((r) => r.kind === 'material').length;
  const cacheEntryCount = cost.records.filter((r) => r.kind === 'cacheEntry').length;
  const maxSampler = cost.records.reduce<number | null>((acc, r) => {
    if (r.kind !== 'cacheEntry' || r.fragmentSamplerCount === null) return acc;
    return acc === null ? r.fragmentSamplerCount : Math.max(acc, r.fragmentSamplerCount);
  }, null);

  const report: ProbeReport = {
    createdAt: new Date().toISOString(),
    cycleId: 'cycle-mobile-webgl2-fallback-fix',
    taskSlug: 'tsl-shader-cost-probe',
    probeScript: 'scripts/perf-tsl-shader-cost.ts',
    source: head,
    options: {
      mode: opts.mode,
      rendererMode: opts.rendererMode,
      distRoot: opts.distRoot,
      emulation: {
        label: 'Playwright Chromium + SwiftShader (dev workstation)',
        headless: !opts.headed,
        note: 'Sampler-count is portable across drivers; instruction-count is a line-count proxy.',
      },
    },
    resolvedBackend,
    rendererClassName,
    rendererCompileError,
    materialCount,
    cacheEntryCount,
    perRecord: recordsForReport,
    cacheBuckets: bucketCacheEntries(cost.records),
    maxFragmentSamplerCountAcrossCache: maxSampler,
    pageErrors,
    consoleErrors,
  };

  const reportPath = join(artifactDir, 'report.json');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (opts.emitGlsl) {
    const glslDir = join(artifactDir, 'glsl');
    mkdirSync(glslDir, { recursive: true });
    for (const r of cost.records) {
      const base = r.kind === 'material' ? `${r.marker}_${r.uuid.slice(0, 8)}` : `cache_${String(r.cacheIndex).padStart(3, '0')}`;
      if (r.fragmentShader) writeFileSync(join(glslDir, `${base}.frag.glsl`), r.fragmentShader);
      if (r.vertexShader) writeFileSync(join(glslDir, `${base}.vert.glsl`), r.vertexShader);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`tsl-shader-cost probe complete: ${reportPath}`);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ resolvedBackend, rendererClassName, rendererCompileError, materialCount, cacheEntryCount, maxFragmentSamplerCountAcrossCache: maxSampler, cacheBuckets: report.cacheBuckets }, null, 2));
}

void main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
