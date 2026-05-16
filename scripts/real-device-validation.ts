#!/usr/bin/env tsx

/**
 * Real-device validation harness for `cycle-mobile-webgl2-fallback-fix`.
 *
 * Extends `scripts/mobile-renderer-probe.ts` with a Playwright remote-debug
 * device-targeting mode so the owner can attach a real Android Chrome or iOS
 * Safari device and capture the same shape of evidence the emulation harness
 * captures — `resolvedBackend`, adapter info, 60 s steady-state `avgFps`,
 * top-3 system-breakdown buckets.
 *
 * R3 merge-gate task under autonomous-loop posture. Real-device walk-through
 * is deferred to the owner; this script is the artefact this task ships.
 * Emulation smoke from `scripts/perf-startup-mobile.ts` stands in for the
 * cycle merge gate. Full attach procedure (both Android and iOS) is in
 * `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/cycle-close-validation.md`.
 *
 * Modes:
 *   --device=android-chrome-debug --ws-endpoint=ws://... (CDP attach)
 *   --device=ios-safari-manual --ios-input=path/to.json   (owner-paste)
 *   --device=pixel5-emulation                              (autonomous fallback)
 *   --device=iphone12-emulation                            (autonomous fallback)
 *
 * Artefacts under artifacts/cycle-mobile-webgl2-fallback-fix/real-device-validation/<ts>/<device-id>/.
 * Limitation: iOS Safari has no CDP endpoint; numbers come from Remote Inspector paste.
 */

import { chromium, devices, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, normalize } from 'path';

const HOST = '0.0.0.0';
const ARTIFACT_ROOT = join(
  process.cwd(),
  'artifacts',
  'cycle-mobile-webgl2-fallback-fix',
  'real-device-validation',
);
const START_TIMEOUT_MS = 180_000;
const STEADY_STATE_DEFAULT_MS = 60_000;
const BREAKDOWN_INTERVAL_MS = 1_000;

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

type DeviceId =
  | 'android-chrome-debug'   // CDP attach via chrome://inspect + ws endpoint
  | 'ios-safari-manual'      // Owner pastes Safari Remote Inspector numbers
  | 'pixel5-emulation'       // Fallback to emulation (mirrors mobile-renderer-probe.ts)
  | 'iphone12-emulation';

interface RuntimeFlags {
  deviceId: DeviceId;
  wsEndpoint: string | null;
  iosInput: string | null;
  port: number;
  steadyStateMs: number;
  distRoot: string;
}

interface AdapterSnapshot {
  hasNavigatorGpu: boolean;
  adapterAvailable: boolean | null;
  adapterVendor: string | null;
  adapterArchitecture: string | null;
  adapterDescription: string | null;
}

interface SteadyStateSummary {
  sampleCount: number;
  avgFps: number;
  avgFrameMs: number;
  topSystems: Array<{ name: string; avgEmaMs: number; maxPeakMs: number }>;
}

interface ValidationReport {
  createdAt: string;
  cycleId: string;
  taskSlug: string;
  device: { id: DeviceId; label: string; capture: 'cdp' | 'emulation' | 'manual-owner-paste' };
  resolvedBackend: string | null;
  rendererClassName: string | null;
  adapter: AdapterSnapshot | null;
  steadyState: SteadyStateSummary;
  ownerSignOff: 'pending' | 'playable' | 'not-playable' | null;
  notes: string[];
  screenshotPath: string | null;
  limitations: string[];
}

function readFlag(name: string): string | null {
  const args = process.argv.slice(2);
  const directIdx = args.findIndex((a) => a === `--${name}`);
  if (directIdx >= 0 && directIdx + 1 < args.length) return args[directIdx + 1];
  const eqIdx = args.findIndex((a) => a.startsWith(`--${name}=`));
  if (eqIdx >= 0) return args[eqIdx].slice(name.length + 3);
  return null;
}

function parseFlags(): RuntimeFlags {
  const deviceIdRaw = readFlag('device') ?? 'pixel5-emulation';
  const validIds: DeviceId[] = [
    'android-chrome-debug',
    'ios-safari-manual',
    'pixel5-emulation',
    'iphone12-emulation',
  ];
  if (!validIds.includes(deviceIdRaw as DeviceId)) {
    throw new Error(`Unknown --device "${deviceIdRaw}". Known: ${validIds.join(', ')}`);
  }
  const distRootArg = readFlag('dist-root');
  let distRoot = distRootArg && distRootArg.length > 0 ? distRootArg : join(process.cwd(), 'dist-perf');
  if (!existsSync(join(distRoot, 'index.html'))) {
    const fallback = join(process.cwd(), 'dist');
    if (existsSync(join(fallback, 'index.html'))) {
      console.warn('[real-device-validation] dist-perf missing; falling back to dist. window.perf may be unavailable.');
      distRoot = fallback;
    } else {
      throw new Error('Neither dist-perf/index.html nor dist/index.html exist. Run `npm run build:perf` (preferred) or `npm run build` first.');
    }
  }
  return {
    deviceId: deviceIdRaw as DeviceId,
    wsEndpoint: readFlag('ws-endpoint'),
    iosInput: readFlag('ios-input'),
    port: Number(readFlag('port') ?? '4276'),
    steadyStateMs: Number(readFlag('steady-state-ms') ?? String(STEADY_STATE_DEFAULT_MS)),
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
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const filePath = resolveFilePath(distRoot, decodeURIComponent(url.pathname));
  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const stats = statSync(filePath);
  const finalPath = stats.isDirectory() ? join(filePath, 'index.html') : filePath;
  if (!existsSync(finalPath)) { res.writeHead(404); res.end('Not found'); return; }
  const body = readFileSync(finalPath);
  const contentType = MIME_TYPES[extname(finalPath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(body);
}

async function probeAdapter(page: Page): Promise<AdapterSnapshot> {
  return page.evaluate(async () => {
    const nav = navigator as Navigator & {
      gpu?: {
        requestAdapter?: (opts?: { powerPreference?: 'low-power' | 'high-performance' }) => Promise<{
          info?: { description?: string; vendor?: string; architecture?: string };
        } | null>;
      };
    };
    const out = {
      hasNavigatorGpu: !!nav.gpu,
      adapterAvailable: null as boolean | null,
      adapterVendor: null as string | null,
      adapterArchitecture: null as string | null,
      adapterDescription: null as string | null,
    };
    if (!nav.gpu?.requestAdapter) return out;
    try {
      const adapter = await nav.gpu.requestAdapter({ powerPreference: 'low-power' });
      out.adapterAvailable = !!adapter;
      if (adapter?.info) {
        out.adapterVendor = adapter.info.vendor ?? null;
        out.adapterArchitecture = adapter.info.architecture ?? null;
        out.adapterDescription = adapter.info.description ?? null;
      }
    } catch {
      out.adapterAvailable = false;
    }
    return out;
  });
}

async function probeBackend(page: Page): Promise<{ resolvedBackend: string | null; rendererClassName: string | null }> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __engine?: { renderer?: { renderer?: { constructor?: { name?: string } } } };
      __rendererBackendCapabilities?: () => { resolvedBackend?: string } | null;
    };
    const caps = w.__rendererBackendCapabilities?.() ?? null;
    return {
      resolvedBackend: caps?.resolvedBackend ?? null,
      rendererClassName: w.__engine?.renderer?.renderer?.constructor?.name ?? null,
    };
  });
}

async function pollSteadyState(page: Page, durationMs: number): Promise<SteadyStateSummary> {
  type Sample = { fps: number; avgFrameMs: number; systems: Array<{ name: string; emaMs: number; peakMs: number }> };
  const samples: Sample[] = [];
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    const sample = await page.evaluate(() => {
      const perf = (window as unknown as { perf?: { report?: () => unknown } }).perf;
      if (!perf?.report) return null;
      const r = perf.report() as { fps?: number; avgFrameMs?: number; systemBreakdown?: Array<{ name?: string; emaMs?: number; peakMs?: number }> };
      return {
        fps: Number(r?.fps ?? 0),
        avgFrameMs: Number(r?.avgFrameMs ?? 0),
        systems: Array.isArray(r?.systemBreakdown)
          ? r.systemBreakdown.map((s) => ({
              name: String(s.name ?? ''),
              emaMs: Number(s.emaMs ?? 0),
              peakMs: Number(s.peakMs ?? 0),
            }))
          : [],
      };
    });
    if (sample) samples.push(sample);
    await page.waitForTimeout(BREAKDOWN_INTERVAL_MS);
  }
  if (samples.length === 0) {
    return { sampleCount: 0, avgFps: 0, avgFrameMs: 0, topSystems: [] };
  }
  const avgFps = Number((samples.reduce((s, x) => s + x.fps, 0) / samples.length).toFixed(2));
  const avgFrameMs = Number((samples.reduce((s, x) => s + x.avgFrameMs, 0) / samples.length).toFixed(3));
  const accum = new Map<string, { emaSum: number; maxPeak: number; n: number }>();
  for (const s of samples) {
    for (const sys of s.systems) {
      const cur = accum.get(sys.name) ?? { emaSum: 0, maxPeak: 0, n: 0 };
      cur.emaSum += sys.emaMs;
      cur.maxPeak = Math.max(cur.maxPeak, sys.peakMs);
      cur.n += 1;
      accum.set(sys.name, cur);
    }
  }
  const topSystems = Array.from(accum.entries())
    .map(([name, a]) => ({ name, avgEmaMs: Number((a.emaSum / a.n).toFixed(3)), maxPeakMs: Number(a.maxPeak.toFixed(3)) }))
    .sort((a, b) => b.avgEmaMs - a.avgEmaMs)
    .slice(0, 3);
  return { sampleCount: samples.length, avgFps, avgFrameMs, topSystems };
}

async function captureFromBrowser(flags: RuntimeFlags, browser: Browser, contextOptions: Parameters<Browser['newContext']>[0], deviceLabel: string, captureKind: 'cdp' | 'emulation', artifactDir: string): Promise<ValidationReport> {
  const context: BrowserContext = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const notes: string[] = [];
  let screenshotPath: string | null = null;
  let adapter: AdapterSnapshot | null = null;
  let backendInfo: Awaited<ReturnType<typeof probeBackend>> = { resolvedBackend: null, rendererClassName: null };
  let steady: SteadyStateSummary = { sampleCount: 0, avgFps: 0, avgFrameMs: 0, topSystems: [] };

  try {
    const url = `http://${flags.deviceId === 'android-chrome-debug' ? '127.0.0.1' : '127.0.0.1'}:${flags.port}/?diag=1&perf=1`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: START_TIMEOUT_MS });
    adapter = await probeAdapter(page);

    // Drive to the playable state. For emulation we follow the perf-startup-mobile shape.
    try {
      await page.waitForSelector('button[data-ref="start"]', { state: 'visible', timeout: START_TIMEOUT_MS });
      await page.click('button[data-ref="start"]');
      await page.waitForSelector('[data-mode="open_frontier"]', { state: 'visible', timeout: START_TIMEOUT_MS });
      await page.click('[data-mode="open_frontier"]');
      await page.waitForFunction(() => {
        const hud = document.querySelector('#game-hud-root');
        return hud?.getAttribute('data-phase') === 'playing';
      }, undefined, { timeout: START_TIMEOUT_MS });
    } catch (e) {
      notes.push(`mode-click flow failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    backendInfo = await probeBackend(page);
    steady = await pollSteadyState(page, flags.steadyStateMs);

    const shotPath = join(artifactDir, 'screenshot.png');
    try {
      await page.screenshot({ path: shotPath, fullPage: false, timeout: 0 });
      screenshotPath = shotPath;
    } catch (e) {
      notes.push(`screenshot failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }

  return {
    createdAt: new Date().toISOString(),
    cycleId: 'cycle-mobile-webgl2-fallback-fix',
    taskSlug: 'real-device-validation-harness',
    device: { id: flags.deviceId, label: deviceLabel, capture: captureKind },
    resolvedBackend: backendInfo.resolvedBackend,
    rendererClassName: backendInfo.rendererClassName,
    adapter,
    steadyState: steady,
    ownerSignOff: captureKind === 'cdp' ? 'pending' : null,
    notes,
    screenshotPath,
    limitations: captureKind === 'emulation'
      ? ['Chromium emulation; not a real device. Real-device walk-through pending in docs/PLAYTEST_PENDING.md.']
      : ['CDP attach via chrome://inspect remote-debug. WebGPU adapter discrimination uses navigator.gpu.requestAdapter().info.'],
  };
}

async function captureIosManual(flags: RuntimeFlags): Promise<ValidationReport> {
  if (!flags.iosInput || !existsSync(flags.iosInput)) {
    throw new Error(`--ios-input file required and must exist. Got: ${flags.iosInput}`);
  }
  const raw = JSON.parse(readFileSync(flags.iosInput, 'utf-8')) as {
    resolvedBackend?: string;
    rendererClassName?: string;
    adapter?: AdapterSnapshot;
    avgFps?: number;
    avgFrameMs?: number;
    topSystems?: Array<{ name: string; avgEmaMs: number; maxPeakMs: number }>;
    ownerSignOff?: 'playable' | 'not-playable';
    notes?: string[];
  };
  return {
    createdAt: new Date().toISOString(),
    cycleId: 'cycle-mobile-webgl2-fallback-fix',
    taskSlug: 'real-device-validation-harness',
    device: { id: 'ios-safari-manual', label: 'iOS Safari (owner-paste from Remote Inspector)', capture: 'manual-owner-paste' },
    resolvedBackend: raw.resolvedBackend ?? null,
    rendererClassName: raw.rendererClassName ?? null,
    adapter: raw.adapter ?? null,
    steadyState: {
      sampleCount: 0,
      avgFps: raw.avgFps ?? 0,
      avgFrameMs: raw.avgFrameMs ?? 0,
      topSystems: raw.topSystems ?? [],
    },
    ownerSignOff: raw.ownerSignOff ?? 'pending',
    notes: raw.notes ?? [],
    screenshotPath: null,
    limitations: ['iOS Safari has no CDP. Numbers are owner-pasted from Safari Remote Inspector.'],
  };
}

function writeReport(report: ValidationReport, artifactDir: string): { jsonPath: string; mdPath: string } {
  mkdirSync(artifactDir, { recursive: true });
  const jsonPath = join(artifactDir, 'report.json');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  const md: string[] = [];
  md.push(`# Real-device validation: ${report.device.label}`);
  md.push('');
  md.push(`- Cycle: \`${report.cycleId}\``);
  md.push(`- Task: \`${report.taskSlug}\``);
  md.push(`- Capture kind: \`${report.device.capture}\``);
  md.push(`- Created: ${report.createdAt}`);
  md.push('');
  md.push('## Backend');
  md.push('');
  md.push(`- resolvedBackend: \`${report.resolvedBackend ?? 'n/a'}\``);
  md.push(`- rendererClassName: \`${report.rendererClassName ?? 'n/a'}\``);
  if (report.adapter) {
    md.push(`- navigator.gpu: ${report.adapter.hasNavigatorGpu ? 'present' : 'absent'}`);
    md.push(`- adapter: ${report.adapter.adapterAvailable === true ? 'granted' : report.adapter.adapterAvailable === false ? 'denied' : 'not requested'}`);
    md.push(`- adapter.info.vendor: \`${report.adapter.adapterVendor ?? 'null'}\``);
    md.push(`- adapter.info.architecture: \`${report.adapter.adapterArchitecture ?? 'null'}\``);
    md.push(`- adapter.info.description: \`${report.adapter.adapterDescription ?? 'null'}\``);
  }
  md.push('');
  md.push('## Steady state (60 s)');
  md.push('');
  md.push(`- avgFps: ${report.steadyState.avgFps}`);
  md.push(`- avgFrameMs: ${report.steadyState.avgFrameMs}`);
  md.push(`- sampleCount: ${report.steadyState.sampleCount}`);
  md.push('');
  md.push('| System | avg EMA (ms) | max peak (ms) |');
  md.push('|--------|--------------|---------------|');
  for (const s of report.steadyState.topSystems) {
    md.push(`| \`${s.name}\` | ${s.avgEmaMs} | ${s.maxPeakMs} |`);
  }
  md.push('');
  md.push('## Owner sign-off');
  md.push('');
  md.push(`- ownerSignOff: \`${report.ownerSignOff ?? 'pending'}\``);
  if (report.notes.length) {
    md.push('');
    md.push('## Notes');
    md.push('');
    for (const n of report.notes) md.push(`- ${n}`);
  }
  md.push('');
  md.push('## Limitations');
  md.push('');
  for (const l of report.limitations) md.push(`- ${l}`);
  md.push('');
  const mdPath = join(artifactDir, 'report.md');
  writeFileSync(mdPath, `${md.join('\n')}\n`);
  return { jsonPath, mdPath };
}

async function main(): Promise<void> {
  const flags = parseFlags();
  const baseTs = timestampSlug();
  const artifactDir = join(ARTIFACT_ROOT, baseTs, flags.deviceId);

  // iOS Safari path is data-only; no Playwright needed.
  if (flags.deviceId === 'ios-safari-manual') {
    const report = await captureIosManual(flags);
    const { jsonPath, mdPath } = writeReport(report, artifactDir);
    console.log(`Wrote ${jsonPath}`);
    console.log(`Wrote ${mdPath}`);
    return;
  }

  // Real-device CDP attach. Owner has the device on chrome://inspect and a
  // ws endpoint extracted from /json/version. We connect over CDP and let
  // the device serve the dev preview itself. For this harness we still
  // launch the local dist-perf server; the device reaches it via
  // `adb reverse` or LAN URL.
  const server = createServer((req, res) => serveDist(req, res, flags.distRoot));
  await new Promise<void>((resolve) => server.listen(flags.port, HOST, resolve));
  console.log(`[real-device-validation] dist-perf served on http://${HOST}:${flags.port}`);
  console.log('[real-device-validation] If using --device=android-chrome-debug, run `adb reverse tcp:' + flags.port + ' tcp:' + flags.port + '` on the desktop before opening Chrome on the phone.');

  let browser: Browser;
  let deviceLabel: string;
  let contextOptions: Parameters<Browser['newContext']>[0];
  let captureKind: 'cdp' | 'emulation';

  if (flags.deviceId === 'android-chrome-debug') {
    if (!flags.wsEndpoint) {
      throw new Error('--ws-endpoint is required for --device=android-chrome-debug. See script header for chrome://inspect remote-debug instructions.');
    }
    browser = await chromium.connectOverCDP(flags.wsEndpoint);
    deviceLabel = 'Android Chrome (real device via CDP remote-debug)';
    contextOptions = {};
    captureKind = 'cdp';
  } else {
    browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-webgpu'],
    });
    if (flags.deviceId === 'pixel5-emulation') {
      deviceLabel = 'Android Chrome (Pixel 5 emulation, autonomous-loop fallback)';
      contextOptions = devices['Pixel 5'];
    } else {
      deviceLabel = 'iOS Safari (iPhone 12 emulation, Chromium engine, autonomous-loop fallback)';
      contextOptions = devices['iPhone 12'];
    }
    captureKind = 'emulation';
  }

  try {
    const report = await captureFromBrowser(flags, browser, contextOptions, deviceLabel, captureKind, artifactDir);
    const { jsonPath, mdPath } = writeReport(report, artifactDir);
    console.log(`Wrote ${jsonPath}`);
    console.log(`Wrote ${mdPath}`);
    console.log(`device=${report.device.id} resolvedBackend=${report.resolvedBackend} avgFps=${report.steadyState.avgFps} (${report.steadyState.sampleCount} samples)`);
  } finally {
    await browser.close().catch(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
