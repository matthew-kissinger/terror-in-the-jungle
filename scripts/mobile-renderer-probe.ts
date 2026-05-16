#!/usr/bin/env tsx

/**
 * Mobile renderer probe — read-only.
 *
 * Reports which renderer mobile actually constructs in production:
 *   - navigator.gpu presence
 *   - WebGPU adapter info from `navigator.gpu.requestAdapter()`
 *   - the renderer-backend capabilities snapshot exposed by `?diag=1`
 *   - whether the start button renders without a fatal overlay
 *
 * Ships behind the dev-only `?diag=1` query the runtime already gates on
 * (see `src/core/bootstrap.ts:165`). Adds no production runtime cost.
 *
 * Authored for the `mobile-renderer-mode-truth` (R1) memo in
 * cycle-2026-05-16-mobile-webgpu-and-sky-recovery and intended to be
 * reusable by the follow-up fix cycle.
 *
 * Usage:
 *   npm run build
 *   npx tsx scripts/mobile-renderer-probe.ts                 # full matrix
 *   npx tsx scripts/mobile-renderer-probe.ts --device pixel5 # single device
 *   npx tsx scripts/mobile-renderer-probe.ts --headed        # for screenshots
 *
 * Limitations:
 *   - Uses Chrome DevTools Mobile Emulation (Playwright `devices['Pixel 5']`,
 *     `devices['iPhone 12']`) + 4x CPU throttle. This is the documented
 *     fallback when a real device is not available. Real-device evidence is
 *     preferred; see the memo for the labelled-emulation caveat.
 *   - Chromium-only on the chromium side; webkit may differ in adapter
 *     availability vs real iOS Safari.
 */

import { chromium, devices, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, normalize } from 'path';

const HOST = '127.0.0.1';
const DIST_ROOT = join(process.cwd(), 'dist');
const INDEX_PATH = join(DIST_ROOT, 'index.html');
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'mobile-renderer-probe');
const START_TIMEOUT_MS = 60_000;
const STEADY_TIMEOUT_MS = 60_000;

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.f32': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
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

type ProbeScenarioName =
  | 'default-mobile'        // /?diag=1 — production default path
  | 'strict-mobile'         // /?diag=1&renderer=webgpu-strict — proof bar
  | 'force-webgl-mobile';   // /?diag=1&renderer=webgl — old WebGL renderer

interface ProbeScenario {
  name: ProbeScenarioName;
  query: string;
  description: string;
}

interface DeviceCase {
  id: string;
  label: string;
  userAgentHint: string;
  contextOptions: Parameters<Browser['newContext']>[0];
  cpuThrottle: number;
}

interface NavigatorGpuSnapshot {
  hasNavigatorGpu: boolean;
  adapterRequested: boolean;
  adapterAvailable: boolean | null;
  adapterDescription: string | null;
  adapterVendor: string | null;
  adapterArchitecture: string | null;
  adapterDevice: string | null;
  adapterFeatures: string[];
  adapterError: string | null;
}

interface ScenarioResult {
  scenario: ProbeScenarioName;
  url: string;
  startVisible: boolean;
  fatalVisible: boolean;
  fatalText: string | null;
  rendererClassName: string | null;
  rendererBackendIsWebGPU: boolean | null;
  rendererBackendIsWebGL: boolean | null;
  navigatorGpu: NavigatorGpuSnapshot;
  capabilities: unknown;
  consoleErrors: string[];
  pageErrors: string[];
  notes: string[];
  screenshotPath: string | null;
}

interface DeviceReport {
  device: { id: string; label: string; userAgentHint: string; cpuThrottle: number };
  userAgent: string | null;
  results: ScenarioResult[];
}

const SCENARIOS: ProbeScenario[] = [
  {
    name: 'default-mobile',
    query: '?diag=1',
    description: 'Production default: webgpu mode with WebGL2 fallback allowed.',
  },
  {
    name: 'strict-mobile',
    query: '?diag=1&renderer=webgpu-strict',
    description: 'Strict WebGPU: refuses to fall back, fails loudly if denied.',
  },
  {
    name: 'force-webgl-mobile',
    query: '?diag=1&renderer=webgl',
    description: 'Explicit pre-migration WebGLRenderer path for comparison.',
  },
];

const PIXEL5_BASE = devices['Pixel 5'];
const IPHONE12_BASE = devices['iPhone 12'];

const DEFAULT_DEVICES: DeviceCase[] = [
  {
    id: 'pixel5',
    label: 'Android Chrome (Pixel 5 emulation)',
    userAgentHint: 'Pixel 5 / Android 11 / Chrome',
    cpuThrottle: 4,
    contextOptions: PIXEL5_BASE,
  },
  {
    id: 'iphone12',
    label: 'iOS Safari (iPhone 12 emulation, Chromium engine)',
    userAgentHint: 'iPhone 12 / iOS 14 (note: Chromium user-agent only — real Safari differs)',
    cpuThrottle: 4,
    contextOptions: IPHONE12_BASE,
  },
];

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readFlagValue(name: string): string | null {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx < 0 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

function ensureBuildExists(): void {
  if (!existsSync(INDEX_PATH)) {
    throw new Error('dist/index.html not found. Run `npm run build` before this probe.');
  }
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function resolveFilePath(pathname: string): string | null {
  const relativePath = pathname === '/' || pathname.length === 0 ? 'index.html' : pathname.replace(/^\//, '');
  const resolved = normalize(join(DIST_ROOT, relativePath));
  if (!resolved.startsWith(normalize(DIST_ROOT))) return null;
  return resolved;
}

function serveFile(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  const filePath = resolveFilePath(url.pathname);
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

function resolveListeningPort(server: ReturnType<typeof createServer>): number {
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to resolve listening port.');
  }
  return addr.port;
}

async function probeNavigatorGpu(page: Page): Promise<NavigatorGpuSnapshot> {
  return page.evaluate(async () => {
    const result = {
      hasNavigatorGpu: false,
      adapterRequested: false,
      adapterAvailable: null as boolean | null,
      adapterDescription: null as string | null,
      adapterVendor: null as string | null,
      adapterArchitecture: null as string | null,
      adapterDevice: null as string | null,
      adapterFeatures: [] as string[],
      adapterError: null as string | null,
    };
    const nav = navigator as Navigator & {
      gpu?: {
        requestAdapter?: (opts?: { powerPreference?: 'low-power' | 'high-performance' }) => Promise<{
          features?: Iterable<string>;
          info?: { description?: string; device?: string; vendor?: string; architecture?: string };
        } | null>;
      };
    };
    result.hasNavigatorGpu = !!nav.gpu;
    if (!nav.gpu?.requestAdapter) return result;
    result.adapterRequested = true;
    try {
      const adapter = await nav.gpu.requestAdapter({ powerPreference: 'low-power' });
      result.adapterAvailable = Boolean(adapter);
      if (adapter) {
        result.adapterDescription = adapter.info?.description ?? null;
        result.adapterVendor = adapter.info?.vendor ?? null;
        result.adapterArchitecture = adapter.info?.architecture ?? null;
        result.adapterDevice = adapter.info?.device ?? null;
        result.adapterFeatures = Array.from(adapter.features ?? []).sort();
      }
    } catch (err) {
      result.adapterError = err instanceof Error ? err.message : String(err);
    }
    return result;
  });
}

async function probeRendererBackend(page: Page): Promise<{
  rendererClassName: string | null;
  rendererBackendIsWebGPU: boolean | null;
  rendererBackendIsWebGL: boolean | null;
  capabilities: unknown;
}> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __engine?: {
        renderer?: {
          renderer?: {
            constructor?: { name?: string };
            isWebGPURenderer?: boolean;
            backend?: { isWebGPUBackend?: boolean; isWebGLBackend?: boolean };
          };
        };
      };
      __rendererBackendCapabilities?: () => unknown;
    };
    const renderer = w.__engine?.renderer?.renderer;
    const capabilities = w.__rendererBackendCapabilities?.() ?? null;
    return {
      rendererClassName: renderer?.constructor?.name ?? null,
      rendererBackendIsWebGPU: renderer?.backend?.isWebGPUBackend ?? null,
      rendererBackendIsWebGL: renderer?.backend?.isWebGLBackend ?? null,
      capabilities,
    };
  });
}

async function runScenario(
  context: BrowserContext,
  baseUrl: string,
  scenario: ProbeScenario,
  artifactDir: string,
  deviceId: string,
  cpuThrottle: number,
): Promise<ScenarioResult> {
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const notes: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (e) => {
    pageErrors.push(String(e?.stack ?? e));
  });

  // Apply CPU throttle via CDP. WebKit context (Playwright bundles its own
  // engine) does not expose CDP, so skip throttle there and document it.
  let cdpSession = null as Awaited<ReturnType<BrowserContext['newCDPSession']>> | null;
  try {
    cdpSession = await context.newCDPSession(page);
    await cdpSession.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
    notes.push(`CPU throttle x${cpuThrottle} applied via CDP.`);
  } catch (e) {
    notes.push(`CPU throttle skipped: ${e instanceof Error ? e.message : String(e)}`);
  }

  const url = `${baseUrl}/${scenario.query}`;
  let startVisible = false;
  let fatalVisible = false;
  let fatalText: string | null = null;
  let navigatorGpu: NavigatorGpuSnapshot = {
    hasNavigatorGpu: false,
    adapterRequested: false,
    adapterAvailable: null,
    adapterDescription: null,
    adapterVendor: null,
    adapterArchitecture: null,
    adapterDevice: null,
    adapterFeatures: [],
    adapterError: null,
  };
  let backend: Awaited<ReturnType<typeof probeRendererBackend>> = {
    rendererClassName: null,
    rendererBackendIsWebGPU: null,
    rendererBackendIsWebGL: null,
    capabilities: null,
  };
  let screenshotPath: string | null = null;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: START_TIMEOUT_MS });
    // Probe navigator.gpu before the renderer init swallows the adapter.
    navigatorGpu = await probeNavigatorGpu(page);

    await page
      .waitForFunction(() => {
        const start = document.querySelector<HTMLButtonElement>('button[data-ref="start"]')
          ?? document.querySelector<HTMLButtonElement>('button[data-ref="play"]');
        const fatal = document.body.innerText.includes('Failed to initialize');
        if (start) {
          const style = window.getComputedStyle(start);
          const rect = start.getBoundingClientRect();
          const visible = style.display !== 'none'
            && style.visibility !== 'hidden'
            && rect.width > 0
            && rect.height > 0;
          if (visible) return true;
        }
        return fatal;
      }, undefined, { timeout: STEADY_TIMEOUT_MS })
      .catch(() => undefined);

    startVisible = await page
      .evaluate(() => {
        const btn = document.querySelector<HTMLButtonElement>('button[data-ref="start"]')
          ?? document.querySelector<HTMLButtonElement>('button[data-ref="play"]');
        if (!btn) return false;
        const style = window.getComputedStyle(btn);
        const rect = btn.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      })
      .catch(() => false);
    fatalVisible = await page.locator('text=Failed to initialize').isVisible().catch(() => false);
    if (fatalVisible) {
      fatalText = (await page.locator('body').innerText().catch(() => '')) || null;
    }

    backend = await probeRendererBackend(page);

    const shotPath = join(artifactDir, `${deviceId}-${scenario.name}.png`);
    try {
      await page.screenshot({ path: shotPath, fullPage: false, timeout: 0 });
      screenshotPath = shotPath;
    } catch (e) {
      notes.push(`Screenshot failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  } finally {
    try {
      await cdpSession?.detach();
    } catch {
      // ignore
    }
    await page.close();
  }

  return {
    scenario: scenario.name,
    url,
    startVisible,
    fatalVisible,
    fatalText,
    rendererClassName: backend.rendererClassName,
    rendererBackendIsWebGPU: backend.rendererBackendIsWebGPU,
    rendererBackendIsWebGL: backend.rendererBackendIsWebGL,
    navigatorGpu,
    capabilities: backend.capabilities,
    consoleErrors,
    pageErrors,
    notes,
    screenshotPath,
  };
}

async function runDevice(
  browser: Browser,
  baseUrl: string,
  device: DeviceCase,
  artifactDir: string,
  scenarios: ProbeScenario[],
): Promise<DeviceReport> {
  const context = await browser.newContext(device.contextOptions);
  let userAgent: string | null = null;
  try {
    const probePage = await context.newPage();
    userAgent = await probePage.evaluate(() => navigator.userAgent).catch(() => null);
    await probePage.close();

    const results: ScenarioResult[] = [];
    for (const scenario of scenarios) {
      console.log(`  ${device.id} :: ${scenario.name}`);
      const result = await runScenario(context, baseUrl, scenario, artifactDir, device.id, device.cpuThrottle);
      results.push(result);
    }
    return {
      device: {
        id: device.id,
        label: device.label,
        userAgentHint: device.userAgentHint,
        cpuThrottle: device.cpuThrottle,
      },
      userAgent,
      results,
    };
  } finally {
    await context.close();
  }
}

function summarize(report: DeviceReport): string[] {
  const lines: string[] = [];
  lines.push(`### ${report.device.label}`);
  lines.push('');
  lines.push(`User-Agent: \`${report.userAgent ?? '(unknown)'}\``);
  lines.push(`CPU throttle: x${report.device.cpuThrottle}`);
  lines.push('');
  for (const r of report.results) {
    lines.push(`#### scenario: \`${r.scenario}\``);
    lines.push('');
    const gpu = r.navigatorGpu;
    lines.push(`- navigator.gpu: ${gpu.hasNavigatorGpu ? 'present' : 'absent'}`);
    lines.push(`- adapter: ${gpu.adapterAvailable === true ? 'granted' : gpu.adapterAvailable === false ? 'denied' : 'not requested'}`);
    if (gpu.adapterDescription || gpu.adapterVendor || gpu.adapterDevice) {
      lines.push(`- adapter.info.description: \`${gpu.adapterDescription ?? 'null'}\``);
      lines.push(`- adapter.info.vendor: \`${gpu.adapterVendor ?? 'null'}\``);
      lines.push(`- adapter.info.architecture: \`${gpu.adapterArchitecture ?? 'null'}\``);
    }
    if (gpu.adapterError) lines.push(`- adapter probe error: \`${gpu.adapterError}\``);
    lines.push(`- renderer class: \`${r.rendererClassName ?? '(no engine constructed)'}\``);
    lines.push(`- backend.isWebGPUBackend: \`${r.rendererBackendIsWebGPU}\``);
    lines.push(`- backend.isWebGLBackend: \`${r.rendererBackendIsWebGL}\``);
    const caps = r.capabilities as null | { resolvedBackend?: string; initStatus?: string; requestedMode?: string };
    if (caps) {
      lines.push(`- capabilities.requestedMode: \`${caps.requestedMode}\``);
      lines.push(`- capabilities.resolvedBackend: \`${caps.resolvedBackend}\``);
      lines.push(`- capabilities.initStatus: \`${caps.initStatus}\``);
    }
    lines.push(`- start button visible: ${r.startVisible}`);
    lines.push(`- fatal overlay: ${r.fatalVisible}`);
    if (r.pageErrors.length) {
      lines.push(`- page errors: ${r.pageErrors.length}`);
    }
    if (r.consoleErrors.length) {
      lines.push(`- console errors: ${r.consoleErrors.length}`);
    }
    if (r.screenshotPath) lines.push(`- screenshot: \`${r.screenshotPath.replaceAll('\\', '/')}\``);
    lines.push('');
  }
  return lines;
}

async function main(): Promise<void> {
  ensureBuildExists();
  const headed = hasFlag('--headed');
  const deviceFilter = readFlagValue('device');
  const deviceCases = deviceFilter
    ? DEFAULT_DEVICES.filter((d) => d.id === deviceFilter)
    : DEFAULT_DEVICES;
  if (deviceCases.length === 0) {
    throw new Error(`Unknown --device "${deviceFilter}". Known: ${DEFAULT_DEVICES.map((d) => d.id).join(', ')}`);
  }

  const artifactDir = join(ARTIFACT_ROOT, timestampSlug());
  mkdirSync(artifactDir, { recursive: true });

  const server = createServer(serveFile);
  await new Promise<void>((resolve) => server.listen(0, HOST, resolve));
  const port = resolveListeningPort(server);
  const baseUrl = `http://${HOST}:${port}`;

  // WebGPU on Chromium requires `--enable-unsafe-webgpu` on Linux/Win;
  // also enable swiftshader so the non-WebGPU path still has a backend.
  const browser = await chromium.launch({
    headless: !headed,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-webgpu'],
  });

  try {
    const reports: DeviceReport[] = [];
    for (const device of deviceCases) {
      console.log(`Device ${device.id} (${device.label})`);
      reports.push(await runDevice(browser, baseUrl, device, artifactDir, SCENARIOS));
    }

    const reportJson = {
      createdAt: new Date().toISOString(),
      source: 'scripts/mobile-renderer-probe.ts',
      baseUrl,
      headed,
      reports,
      limitations: [
        'Chrome DevTools Mobile Emulation (Playwright devices) — not a real device.',
        'CPU throttle applied via CDP (Chromium only).',
        'iPhone 12 case runs under Chromium engine; real iOS Safari may differ.',
        'navigator.gpu in Chromium on Linux may be unavailable without --enable-unsafe-webgpu.',
      ],
    };
    const jsonPath = join(artifactDir, 'report.json');
    writeFileSync(jsonPath, `${JSON.stringify(reportJson, null, 2)}\n`);

    const md: string[] = [];
    md.push('# Mobile renderer probe report');
    md.push('');
    md.push(`Generated: ${reportJson.createdAt}`);
    md.push('');
    md.push('## Limitations');
    md.push('');
    for (const l of reportJson.limitations) md.push(`- ${l}`);
    md.push('');
    for (const r of reports) md.push(...summarize(r));
    writeFileSync(join(artifactDir, 'report.md'), `${md.join('\n')}\n`);

    console.log(`Wrote ${jsonPath}`);
    for (const r of reports) {
      for (const s of r.results) {
        const caps = s.capabilities as null | { resolvedBackend?: string };
        console.log(`${r.device.id}/${s.scenario}: class=${s.rendererClassName} backend=${caps?.resolvedBackend ?? 'n/a'} start=${s.startVisible} fatal=${s.fatalVisible}`);
      }
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
