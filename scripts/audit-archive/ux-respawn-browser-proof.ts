#!/usr/bin/env tsx

import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, normalize } from 'path';
import { execFileSync } from 'child_process';

const HOST = '127.0.0.1';
const DEFAULT_PORT = Number(process.env.UX_RESPAWN_PROOF_PORT ?? 0);
const DIST_ROOT = join(process.cwd(), 'dist');
const INDEX_PATH = join(DIST_ROOT, 'index.html');
const OUTPUT_NAME = 'projekt-143-ux-respawn-browser-proof';
const START_TIMEOUT_MS = 120_000;
let activePort = DEFAULT_PORT;

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

type CaseId = 'desktop-1440x900' | 'mobile-390x844';
type CheckStatus = 'PASS' | 'WARN' | 'FAIL';
type ProofStatus = 'pass' | 'warn' | 'fail';

type DeviceCase = {
  id: CaseId;
  label: string;
  contextOptions: BrowserContextOptions;
};

type SpawnOption = {
  id: string | null;
  kind: string | null;
  className: string | null;
  label: string;
  ariaPressed: string | null;
  rect: {
    width: number;
    height: number;
  };
};

type LayoutRect = {
  id: string;
  top: number;
  bottom: number;
  height: number;
  scrollTop?: number;
  scrollHeight?: number;
  clientHeight?: number;
};

type DeviceProof = {
  id: CaseId;
  label: string;
  url: string;
  screenshot: string;
  screenshots: string[];
  consoleErrors: string[];
  pageErrors: string[];
  requestErrors: string[];
  visible: boolean;
  text: string;
  allianceVisible: boolean;
  spawnOptions: SpawnOption[];
  selectedSpawn: string;
  decisionMetric: string;
  deployButtonEnabled: boolean;
  minimumSpawnOptionHeightPx: number | null;
  layoutRects: LayoutRect[];
};

type ProofCheck = {
  id: string;
  status: CheckStatus;
  summary: string;
  evidence: string;
};

type ProofReport = {
  createdAt: string;
  sourceGitSha: string;
  mode: typeof OUTPUT_NAME;
  directive: 'UX-1';
  status: ProofStatus;
  summary: {
    cases: number;
    pass: number;
    warn: number;
    fail: number;
    desktopVisible: boolean;
    mobileVisible: boolean;
    spawnOptionsVisibleBoth: boolean;
    allianceVisibleBoth: boolean;
    decisionMetricVisibleBoth: boolean;
    browserErrorCount: number;
  };
  checks: ProofCheck[];
  devices: DeviceProof[];
  currentContract: string[];
  nonClaims: string[];
  files: {
    summary: string;
    screenshots: string[];
  };
};

const DEVICE_CASES: DeviceCase[] = [
  {
    id: 'desktop-1440x900',
    label: 'Desktop Chromium 1440x900',
    contextOptions: {
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
  },
  {
    id: 'mobile-390x844',
    label: 'Mobile Chromium 390x844',
    contextOptions: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Mobile Safari/537.36',
    },
  },
];

function rel(path: string): string {
  return path.replace(process.cwd(), '').replace(/^[\\/]/, '').replaceAll('\\', '/');
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function outputDir(): string {
  return join(process.cwd(), 'artifacts', 'perf', timestampSlug(), OUTPUT_NAME);
}

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function ensureBuildExists(): void {
  if (!existsSync(INDEX_PATH)) {
    throw new Error('dist/index.html not found. Run `npm run build` before UX-1 browser proof.');
  }
}

function resolveListeningPort(server: ReturnType<typeof createServer>): number {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve UX-1 proof server port.');
  }
  return address.port;
}

function resolveFilePath(pathname: string): string | null {
  const relativePath = pathname === '/' || pathname.length === 0
    ? 'index.html'
    : pathname.replace(/^\//, '');
  const resolved = normalize(join(DIST_ROOT, relativePath));
  if (!resolved.startsWith(normalize(DIST_ROOT))) return null;
  return resolved;
}

function serveDist(req: IncomingMessage, res: ServerResponse): void {
  const requestUrl = new URL(req.url ?? '/', `http://${HOST}:${activePort}`);
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

async function openDeployScreen(page: Page): Promise<void> {
  await page.goto(`http://${HOST}:${activePort}/`, { waitUntil: 'domcontentloaded', timeout: START_TIMEOUT_MS });
  await page.waitForFunction(() => {
    const startButton = document.querySelector<HTMLButtonElement>('button[data-ref="start"]');
    const playButton = document.querySelector<HTMLButtonElement>('button[data-ref="play"]');
    const button = startButton ?? playButton;
    if (!button) return false;
    const style = window.getComputedStyle(button);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }, undefined, { timeout: START_TIMEOUT_MS });

  const startButton = page.locator('button[data-ref="start"], button[data-ref="play"]').first();
  await startButton.click();
  const modeCard = page.locator('[data-mode="zone_control"], [data-mode]').first();
  await modeCard.waitFor({ state: 'visible', timeout: START_TIMEOUT_MS });
  await modeCard.click();
  await page.waitForFunction(() => {
    const root = document.getElementById('respawn-ui');
    if (!root) return false;
    const style = window.getComputedStyle(root);
    const rect = root.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && rect.width > 0
      && rect.height > 0;
  }, undefined, { timeout: START_TIMEOUT_MS });
  await page.waitForFunction(() => document.querySelectorAll('#respawn-spawn-options button[data-spawn-id]').length > 0, undefined, { timeout: START_TIMEOUT_MS });
}

async function captureDevice(device: DeviceCase, outDir: string): Promise<DeviceProof> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestErrors: string[] = [];
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl'],
  });
  try {
    const context = await browser.newContext(device.contextOptions);
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('KHR_parallel_shader_compile')) {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(String(error?.stack ?? error));
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        requestErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    await openDeployScreen(page);
    await page.evaluate(() => {
      const stage = document.getElementById('respawn-stage');
      if (stage instanceof HTMLElement) stage.scrollTop = 0;
      const sideScroll = document.getElementById('respawn-side-scroll');
      if (sideScroll instanceof HTMLElement) sideScroll.scrollTop = 0;
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(150);

    const screenshotPath = join(outDir, `${device.id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const spawnOptionsPath = join(outDir, `${device.id}-spawn-options.png`);
    await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('#respawn-spawn-options button[data-spawn-id]')?.click();
    });
    await page.waitForTimeout(350);
    await page.locator('#respawn-spawn-options-panel').screenshot({ path: spawnOptionsPath });

    const dom = await page.evaluate(() => {
      const root = document.getElementById('respawn-ui');
      const rootStyle = root ? window.getComputedStyle(root) : null;
      const rootRect = root?.getBoundingClientRect();
      const spawnOptions = Array.from(document.querySelectorAll<HTMLButtonElement>('#respawn-spawn-options button[data-spawn-id]'))
        .map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            id: button.dataset.spawnId ?? null,
            kind: button.dataset.spawnKind ?? null,
            className: button.dataset.selectionClass ?? null,
            label: button.innerText.trim(),
            ariaPressed: button.getAttribute('aria-pressed'),
            rect: {
              width: rect.width,
              height: rect.height,
            },
          };
        });
      const visible = Boolean(root)
        && rootStyle?.display !== 'none'
        && rootStyle?.visibility !== 'hidden'
        && Number(rootRect?.width ?? 0) > 0
        && Number(rootRect?.height ?? 0) > 0;
      const text = root?.innerText ?? root?.textContent ?? '';
      const minimumSpawnOptionHeightPx = spawnOptions.length > 0
        ? Math.min(...spawnOptions.map((option) => option.rect.height))
        : null;
      const layoutRects = [];
      for (const id of ['respawn-map', 'respawn-side-scroll', 'respawn-selected-panel', 'respawn-spawn-options-panel', 'respawn-controls-panel']) {
        const element = document.getElementById(id);
        const rect = element?.getBoundingClientRect();
        layoutRects.push({
          id,
          top: Math.round(rect?.top ?? 0),
          bottom: Math.round(rect?.bottom ?? 0),
          height: Math.round(rect?.height ?? 0),
          scrollTop: element instanceof HTMLElement ? Math.round(element.scrollTop) : undefined,
          scrollHeight: element instanceof HTMLElement ? Math.round(element.scrollHeight) : undefined,
          clientHeight: element instanceof HTMLElement ? Math.round(element.clientHeight) : undefined,
        });
      }

      return {
        visible,
        text,
        allianceVisible: /Alliance/i.test(text) && /\b(BLUFOR|OPFOR|US|NVA)\b/i.test(text),
        spawnOptions,
        selectedSpawn: document.getElementById('selected-spawn-name')?.textContent?.trim() ?? '',
        decisionMetric: document.getElementById('respawn-decision-time')?.textContent?.trim() ?? '',
        deployButtonEnabled: !(document.getElementById('respawn-button') as HTMLButtonElement | null)?.disabled,
        minimumSpawnOptionHeightPx,
        layoutRects,
      };
    });

    await context.close();
    return {
      id: device.id,
      label: device.label,
      url: page.url(),
      screenshot: rel(screenshotPath),
      screenshots: [rel(screenshotPath), rel(spawnOptionsPath)],
      consoleErrors,
      pageErrors,
      requestErrors,
      ...dom,
    };
  } finally {
    await browser.close();
  }
}

function addCheck(checks: ProofCheck[], id: string, status: CheckStatus, summary: string, evidence: string): void {
  checks.push({ id, status, summary, evidence });
}

function statusForCounts(fail: number, warn: number): ProofStatus {
  if (fail > 0) return 'fail';
  if (warn > 0) return 'warn';
  return 'pass';
}

async function main(): Promise<void> {
  ensureBuildExists();
  const outDir = outputDir();
  mkdirSync(outDir, { recursive: true });

  const server = createServer(serveDist);
  await new Promise<void>((resolve) => server.listen(activePort, HOST, resolve));
  activePort = resolveListeningPort(server);

  try {
    const devices: DeviceProof[] = [];
    for (const deviceCase of DEVICE_CASES) {
      devices.push(await captureDevice(deviceCase, outDir));
    }

    const desktop = devices.find((device) => device.id === 'desktop-1440x900');
    const mobile = devices.find((device) => device.id === 'mobile-390x844');
    const browserErrorCount = devices.reduce(
      (total, device) => total + device.consoleErrors.length + device.pageErrors.length + device.requestErrors.length,
      0,
    );
    const spawnOptionsVisibleBoth = devices.every((device) => device.spawnOptions.length > 0);
    const allianceVisibleBoth = devices.every((device) => device.allianceVisible);
    const selectedSpawnVisibleBoth = devices.every((device) => device.selectedSpawn.length > 0 && device.selectedSpawn !== 'NONE');
    const decisionMetricVisibleBoth = devices.every((device) => /Decision time/i.test(device.decisionMetric));
    const mobileTouchHeightPass = (mobile?.minimumSpawnOptionHeightPx ?? 0) >= 44;

    const checks: ProofCheck[] = [];
    addCheck(
      checks,
      'browser-errors',
      browserErrorCount === 0 ? 'PASS' : 'FAIL',
      browserErrorCount === 0 ? 'No browser console, page, or request errors surfaced during UX-1 proof.' : 'Browser errors surfaced during UX-1 proof.',
      `${browserErrorCount} browser errors recorded`,
    );
    addCheck(
      checks,
      'desktop-respawn-visible',
      desktop?.visible ? 'PASS' : 'FAIL',
      'Desktop viewport reaches a visible #respawn-ui deploy surface.',
      desktop?.screenshot ?? 'missing desktop screenshot',
    );
    addCheck(
      checks,
      'mobile-respawn-visible',
      mobile?.visible ? 'PASS' : 'FAIL',
      'Mobile viewport reaches a visible #respawn-ui deploy surface.',
      mobile?.screenshot ?? 'missing mobile screenshot',
    );
    addCheck(
      checks,
      'alliance-visible',
      allianceVisibleBoth ? 'PASS' : 'FAIL',
      'Alliance appears on both desktop and mobile decision surfaces.',
      devices.map((device) => `${device.id}: ${device.allianceVisible ? 'alliance visible' : 'missing alliance'}`).join('; '),
    );
    addCheck(
      checks,
      'spawn-options-visible',
      spawnOptionsVisibleBoth ? 'PASS' : 'FAIL',
      'Grouped textual spawn options appear outside the canvas on both viewports.',
      devices.map((device) => `${device.id}: ${device.spawnOptions.length} option(s)`).join('; '),
    );
    addCheck(
      checks,
      'selected-spawn-state',
      selectedSpawnVisibleBoth ? 'PASS' : 'FAIL',
      'Selected-spawn state is visible after choosing a spawn option on both viewports.',
      devices.map((device) => `${device.id}: ${device.selectedSpawn || '(missing)'}`).join('; '),
    );
    addCheck(
      checks,
      'decision-metric-visible',
      decisionMetricVisibleBoth ? 'PASS' : 'FAIL',
      'Decision-time metric appears after selecting a spawn option on both viewports.',
      devices.map((device) => `${device.id}: ${device.decisionMetric || '(missing)'}`).join('; '),
    );
    addCheck(
      checks,
      'mobile-touch-height',
      mobileTouchHeightPass ? 'PASS' : 'WARN',
      'Mobile spawn option hit targets meet the 44px minimum evidence threshold.',
      `minimum mobile spawn option height=${mobile?.minimumSpawnOptionHeightPx ?? 'missing'}px`,
    );

    const fail = checks.filter((check) => check.status === 'FAIL').length;
    const warn = checks.filter((check) => check.status === 'WARN').length;
    const pass = checks.filter((check) => check.status === 'PASS').length;
    const summaryPath = join(outDir, 'ux-respawn-browser-proof.json');
    const report: ProofReport = {
      createdAt: new Date().toISOString(),
      sourceGitSha: gitSha(),
      mode: OUTPUT_NAME,
      directive: 'UX-1',
      status: statusForCounts(fail, warn),
      summary: {
        cases: devices.length,
        pass,
        warn,
        fail,
        desktopVisible: Boolean(desktop?.visible),
        mobileVisible: Boolean(mobile?.visible),
        spawnOptionsVisibleBoth,
        allianceVisibleBoth,
        decisionMetricVisibleBoth,
        browserErrorCount,
      },
      checks,
      devices,
      currentContract: [
        'Desktop and mobile Chromium reach the production-build deploy screen.',
        'Alliance, grouped spawn options, selected-spawn state, and decision timing are visible on both viewports.',
        'Screenshots are stored beside this JSON packet for KB-DIZAYN review.',
      ],
      nonClaims: [
        'This proof does not provide KB-DIZAYN visual signoff.',
        'This proof does not prove final human touch ergonomics.',
        'This proof does not prove live production deployment parity.',
        'This proof does not close UX-2, UX-3, or UX-4.',
      ],
      files: {
        summary: rel(summaryPath),
        screenshots: devices.flatMap((device) => device.screenshots),
      },
    };

    writeFileSync(summaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    console.log(`Projekt 143 UX respawn browser proof ${report.status.toUpperCase()}: ${report.files.summary}`);
    console.log(`checks=${pass} pass, ${warn} warn, ${fail} fail screenshots=${report.files.screenshots.join(', ')}`);
    if (report.status === 'fail') process.exit(1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

void main().catch((error) => {
  console.error('projekt-143-ux-respawn-browser-proof failed:', error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
