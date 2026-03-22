#!/usr/bin/env tsx

import { chromium, devices, webkit, type Browser, type BrowserContextOptions, type Page } from 'playwright';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, normalize } from 'path';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4175;
const DIST_ROOT = join(process.cwd(), 'dist');
const INDEX_PATH = join(DIST_ROOT, 'index.html');
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'mobile-ui');
const ANDROID_BASE = devices['Pixel 5'];
const IPHONE_BASE = devices['iPhone 12'];

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

type BrowserKind = 'chromium' | 'webkit';

type Viewport = {
  width: number;
  height: number;
};

type DeviceCase = {
  id: string;
  label: string;
  browserKind: BrowserKind;
  viewport: Viewport;
  contextOptions: BrowserContextOptions;
};

type Actionability = {
  selector: string;
  label: string;
  rect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  viewport: {
    width: number;
    height: number;
  };
  isVisible: boolean;
  withinViewport: boolean;
  hitProbeSupported: boolean;
  ownsHitTarget: boolean;
  pointerBlockedByAncestor: string | null;
};

type ScrollOwnerState = {
  selector: string;
  label: string;
  overflowY: string;
  scrollHeight: number;
  clientHeight: number;
  isScrollable: boolean;
};

type DeviceReport = {
  device: Pick<DeviceCase, 'id' | 'label' | 'browserKind' | 'viewport'>;
  screenshots: string[];
  pageErrors: string[];
  requestErrors: string[];
  consoleErrors: string[];
  warnings: string[];
  checks: Array<Actionability | ScrollOwnerState>;
  skipped: string[];
};

const DEFAULT_DEVICE_CASES: DeviceCase[] = [
  {
    id: 'android-390x844',
    label: 'Android Chrome Portrait',
    browserKind: 'chromium',
    viewport: { width: 390, height: 844 },
    contextOptions: {
      ...ANDROID_BASE,
      viewport: { width: 390, height: 844 },
    },
  },
  {
    id: 'android-844x390',
    label: 'Android Chrome Wide Landscape',
    browserKind: 'chromium',
    viewport: { width: 844, height: 390 },
    contextOptions: {
      ...ANDROID_BASE,
      viewport: { width: 844, height: 390 },
    },
  },
  {
    id: 'android-740x360',
    label: 'Android Chrome Short Landscape',
    browserKind: 'chromium',
    viewport: { width: 740, height: 360 },
    contextOptions: {
      ...ANDROID_BASE,
      viewport: { width: 740, height: 360 },
    },
  },
  {
    id: 'phone-667x375',
    label: 'Phone Short Landscape',
    browserKind: 'chromium',
    viewport: { width: 667, height: 375 },
    contextOptions: {
      ...ANDROID_BASE,
      viewport: { width: 667, height: 375 },
    },
  },
];

const WEBKIT_DEVICE_CASES: DeviceCase[] = [
  {
    id: 'iphone-390x844',
    label: 'iPhone Safari Portrait',
    browserKind: 'webkit',
    viewport: { width: 390, height: 844 },
    contextOptions: {
      ...IPHONE_BASE,
      viewport: { width: 390, height: 844 },
    },
  },
];

function ensureBuildExists(): void {
  if (!existsSync(INDEX_PATH)) {
    throw new Error('dist/index.html not found. Run `npm run build` before `npm run check:mobile-ui`.');
  }
}

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function parseArgs(): { mode: string; port: number; headed: boolean; includeWebkit: boolean } {
  const args = process.argv.slice(2);
  const readValue = (flag: string, fallback: string): string => {
    const index = args.findIndex((arg) => arg === `--${flag}`);
    if (index < 0 || index + 1 >= args.length) {
      return fallback;
    }
    return args[index + 1];
  };

  return {
    mode: readValue('mode', 'zone_control'),
    port: Number(readValue('port', String(DEFAULT_PORT))),
    headed: args.includes('--headed'),
    includeWebkit: args.includes('--include-webkit'),
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

async function tapSelector(page: Page, selector: string): Promise<void> {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: 120_000 });
  await locator.scrollIntoViewIfNeeded();
  await locator.tap({ timeout: 30_000 });
}

async function dispatchPointerDown(page: Page, selector: string): Promise<void> {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: 120_000 });
  await locator.evaluate((element) => {
    const event = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
      isPrimary: true,
    });
    element.dispatchEvent(event);
  });
}

async function assertActionable(page: Page, selector: string, label: string): Promise<Actionability> {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'attached', timeout: 120_000 });
  await locator.scrollIntoViewIfNeeded();

  const state = await locator.evaluate((element, payload) => {
    const el = element as HTMLElement;
    const rect = el.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const edgeTolerance = 2;
    const style = window.getComputedStyle(el);
    const centerX = Math.min(viewportWidth - 1, Math.max(1, rect.left + rect.width / 2));
    const centerY = Math.min(viewportHeight - 1, Math.max(1, rect.top + rect.height / 2));
    const hitStack = document.elementsFromPoint(centerX, centerY);
    const hitProbeSupported = !(
      hitStack.length === 1 &&
      hitStack[0] === document.documentElement
    );

    let pointerBlockedByAncestor: string | null = null;
    let node: HTMLElement | null = el;
    while (node) {
      const nodeStyle = window.getComputedStyle(node);
      if (nodeStyle.pointerEvents === 'none') {
        pointerBlockedByAncestor = node.id || node.className || node.tagName;
        break;
      }
      node = node.parentElement;
    }

    return {
      selector: payload.selector,
      label: payload.label,
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      viewport: {
        width: viewportWidth,
        height: viewportHeight,
      },
      isVisible:
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width >= 1 &&
        rect.height >= 1,
      withinViewport:
        rect.left >= -edgeTolerance &&
        rect.top >= -edgeTolerance &&
        rect.right <= viewportWidth + edgeTolerance &&
        rect.bottom <= viewportHeight + edgeTolerance,
      hitProbeSupported,
      ownsHitTarget: hitStack.some((nodeAtPoint) => nodeAtPoint === el || el.contains(nodeAtPoint)),
      pointerBlockedByAncestor,
    };
  }, { selector, label });

  if (!state.isVisible || !state.withinViewport) {
    throw new Error(
      `${label} failed actionability: ${JSON.stringify(state)}`
    );
  }

  if (!state.hitProbeSupported) {
    try {
      await locator.tap({ trial: true, timeout: 10_000 });
    } catch (error) {
      throw new Error(`${label} failed tap trial: ${String(error)}`);
    }
  } else if (!state.ownsHitTarget) {
    throw new Error(`${label} failed hit test: ${JSON.stringify(state)}`);
  }

  return state;
}

async function assertScrollOwner(page: Page, selector: string, label: string): Promise<ScrollOwnerState> {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'attached', timeout: 120_000 });
  const state = await locator.evaluate((element, payload) => {
    const el = element as HTMLElement;
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    return {
      selector: payload.selector,
      label: payload.label,
      overflowY,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      isScrollable: overflowY === 'auto' || overflowY === 'scroll',
    };
  }, { selector, label });

  if (!state.isScrollable) {
    throw new Error(`${label} is not a scroll owner: ${JSON.stringify(state)}`);
  }

  return state;
}

async function waitForHidden(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((target) => {
    const el = document.querySelector<HTMLElement>(target);
    if (!el) return true;
    const style = window.getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0;
  }, selector, { timeout: 30_000 });
}

async function waitForGameplay(page: Page): Promise<void> {
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
}

async function captureScreenshot(page: Page, deviceId: string, state: string, artifactDir: string, screenshots: string[]): Promise<void> {
  const screenshotPath = join(artifactDir, `${deviceId}-${state}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 0 });
  screenshots.push(screenshotPath);
}

async function maybeExerciseCommandOverlay(
  page: Page,
  report: DeviceReport,
  artifactDir: string,
): Promise<void> {
  const commandButtonSelector = '#touch-action-buttons [aria-label="CMD"]';
  report.checks.push(await assertActionable(page, commandButtonSelector, 'Gameplay command button'));
  await dispatchPointerDown(page, commandButtonSelector);
  const visible = await page.waitForSelector('.command-mode-overlay[data-visible="true"]', { timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (!visible) {
    report.skipped.push('Command overlay did not open in the current gameplay state.');
    return;
  }

  report.checks.push(await assertActionable(page, '.command-mode-overlay__close', 'Command overlay close'));
  await captureScreenshot(page, report.device.id, 'command-overlay', artifactDir, report.screenshots);
  await tapSelector(page, '.command-mode-overlay__close');
  await page.waitForSelector('.command-mode-overlay[data-visible="true"]', { state: 'hidden', timeout: 30_000 });
}

async function runDeviceCase(
  browser: Browser,
  device: DeviceCase,
  artifactDir: string,
  mode: string,
  port: number,
): Promise<DeviceReport> {
  const context = await browser.newContext(device.contextOptions);
  const page = await context.newPage();
  const report: DeviceReport = {
    device: {
      id: device.id,
      label: device.label,
      browserKind: device.browserKind,
      viewport: device.viewport,
    },
    screenshots: [],
    pageErrors: [],
    requestErrors: [],
    consoleErrors: [],
    warnings: [],
    checks: [],
    skipped: [],
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      report.consoleErrors.push(msg.text());
    } else if (msg.type() === 'warning') {
      report.warnings.push(msg.text());
    }
  });
  page.on('pageerror', (error) => {
    report.pageErrors.push(String(error?.stack ?? error));
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      report.requestErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  try {
    await page.goto(`http://${HOST}:${port}/?logLevel=info`, { waitUntil: 'networkidle', timeout: 120_000 });

    await page.waitForSelector('button[data-ref="start"]', { state: 'visible', timeout: 120_000 });
    report.checks.push(await assertActionable(page, 'button[data-ref="start"]', 'Title start button'));
    report.checks.push(await assertActionable(page, 'button[data-ref="settings"]', 'Title settings button'));
    await captureScreenshot(page, device.id, 'title', artifactDir, report.screenshots);

    await tapSelector(page, 'button[data-ref="settings"]');
    await page.waitForSelector('#settings-modal', { state: 'visible', timeout: 30_000 });
    report.checks.push(await assertActionable(page, '#settings-modal [data-ref="close"]', 'Title settings close'));
    report.checks.push(await assertScrollOwner(page, '#settings-modal [data-ref="scroll-body"]', 'Title settings scroll body'));
    await captureScreenshot(page, device.id, 'title-settings', artifactDir, report.screenshots);
    await dispatchPointerDown(page, '#settings-modal [data-ref="close"]');
    await waitForHidden(page, '#settings-modal');

    await tapSelector(page, 'button[data-ref="start"]');
    await page.waitForSelector(`[data-mode="${mode}"]`, { state: 'visible', timeout: 120_000 });
    report.checks.push(await assertActionable(page, '[data-ref="back"]', 'Mode select back button'));

    const availableModes = await page.locator('[data-mode]').evaluateAll((elements) =>
      elements
        .map((element) => (element as HTMLElement).dataset.mode ?? '')
        .filter((value) => value.length > 0)
    );
    for (const availableMode of availableModes) {
      report.checks.push(
        await assertActionable(page, `[data-mode="${availableMode}"]`, `Mode card ${availableMode}`)
      );
    }
    await captureScreenshot(page, device.id, 'mode-select', artifactDir, report.screenshots);

    await tapSelector(page, '[data-ref="back"]');
    await page.waitForSelector('button[data-ref="start"]', { state: 'visible', timeout: 30_000 });
    report.checks.push(await assertActionable(page, 'button[data-ref="start"]', 'Title start button after back'));

    await tapSelector(page, 'button[data-ref="start"]');
    await page.waitForSelector(`[data-mode="${mode}"]`, { state: 'visible', timeout: 30_000 });
    await tapSelector(page, `[data-mode="${mode}"]`);

    await page.waitForSelector('#respawn-ui', { state: 'visible', timeout: 120_000 });
    const secondaryVisible = await page.locator('#respawn-secondary-button').isVisible().catch(() => false);
    if (secondaryVisible) {
      report.checks.push(await assertActionable(page, '#respawn-secondary-button', 'Deploy secondary action'));
    }
    report.checks.push(await assertScrollOwner(page, '#respawn-side-scroll', 'Deploy side scroll body'));
    await captureScreenshot(page, device.id, 'deploy', artifactDir, report.screenshots);

    await page.waitForFunction(() => {
      const button = document.querySelector<HTMLButtonElement>('#respawn-button');
      return !!button && !button.disabled;
    }, undefined, { timeout: 120_000 });
    report.checks.push(await assertActionable(page, '#respawn-button', 'Deploy primary action'));

    await tapSelector(page, '#respawn-button');
    await waitForGameplay(page);
    report.checks.push(await assertActionable(page, '#touch-menu-btn', 'Gameplay menu button'));
    report.checks.push(await assertActionable(page, '#touch-action-buttons [aria-label="MAP"]', 'Gameplay map button'));
    await captureScreenshot(page, device.id, 'gameplay', artifactDir, report.screenshots);

    await dispatchPointerDown(page, '#touch-action-buttons [aria-label="MAP"]');
    await page.waitForSelector('.full-map-container.visible', { state: 'visible', timeout: 30_000 });
    report.checks.push(await assertActionable(page, '.map-close-button', 'Full map close button'));
    await captureScreenshot(page, device.id, 'full-map', artifactDir, report.screenshots);
    await dispatchPointerDown(page, '.map-close-button');
    await page.waitForSelector('.full-map-container.visible', { state: 'hidden', timeout: 30_000 });

    await maybeExerciseCommandOverlay(page, report, artifactDir);

    await dispatchPointerDown(page, '#touch-menu-btn');
    await page.waitForSelector('#settings-modal', { state: 'visible', timeout: 30_000 });
    report.checks.push(await assertActionable(page, '#settings-modal [data-ref="close"]', 'Gameplay settings close'));
    report.checks.push(await assertScrollOwner(page, '#settings-modal [data-ref="scroll-body"]', 'Gameplay settings scroll body'));
    await captureScreenshot(page, device.id, 'gameplay-settings', artifactDir, report.screenshots);
    await dispatchPointerDown(page, '#settings-modal [data-ref="close"]');
    await waitForHidden(page, '#settings-modal');

    return report;
  } finally {
    await context.close();
  }
}

function buildMarkdownSummary(reports: DeviceReport[], artifactDir: string): string {
  const lines: string[] = [];
  lines.push('# Mobile UI Check');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Artifacts: ${artifactDir.replaceAll('\\', '/')}`);
  lines.push('');
  lines.push('| Device | Browser | Checks | Skipped | Page Errors | Request Errors | Console Errors |');
  lines.push('|---|---|---:|---:|---:|---:|---:|');
  for (const report of reports) {
    lines.push(
      `| ${report.device.label} | ${report.device.browserKind} | ${report.checks.length} | ${report.skipped.length} | ${report.pageErrors.length} | ${report.requestErrors.length} | ${report.consoleErrors.length} |`
    );
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('- Actionability checks require the control to be fully inside the visual viewport and to own the hit target at its center point.');
  lines.push('- Screenshots cover the built-app flow: title, title settings, mode select, deploy, gameplay, full map, command overlay when available, and gameplay settings.');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  ensureBuildExists();
  const options = parseArgs();
  const artifactDir = join(ARTIFACT_ROOT, timestampSlug(), 'mobile-ui-check');
  mkdirSync(artifactDir, { recursive: true });

  const browsers: Partial<Record<BrowserKind, Browser>> = {};
  const server = createServer(serveDist);
  await new Promise<void>((resolve) => server.listen(options.port, HOST, resolve));

  try {
    browsers.chromium = await chromium.launch({
      headless: !options.headed,
      args: ['--use-angle=swiftshader', '--enable-webgl'],
    });
    browsers.webkit = await webkit.launch({
      headless: !options.headed,
    });

    const reports: DeviceReport[] = [];
    const deviceCases = options.includeWebkit
      ? [...DEFAULT_DEVICE_CASES, ...WEBKIT_DEVICE_CASES]
      : DEFAULT_DEVICE_CASES;
    for (const device of deviceCases) {
      console.log(`Checking ${device.id} (${device.browserKind})`);
      const browser = browsers[device.browserKind];
      if (!browser) {
        throw new Error(`Browser not available for ${device.browserKind}`);
      }
      reports.push(await runDeviceCase(browser, device, artifactDir, options.mode, options.port));
    }

    writeFileSync(join(artifactDir, 'report.json'), JSON.stringify(reports, null, 2));
    writeFileSync(join(artifactDir, 'report.md'), buildMarkdownSummary(reports, artifactDir));

    const failures = reports.flatMap((report) => {
      const deviceFailures: string[] = [];
      for (const error of report.pageErrors) {
        deviceFailures.push(`${report.device.id}: page error: ${error}`);
      }
      for (const error of report.requestErrors) {
        deviceFailures.push(`${report.device.id}: request error: ${error}`);
      }
      for (const error of report.consoleErrors) {
        if (!error.includes('KHR_parallel_shader_compile') && !error.includes('WebGL warning')) {
          deviceFailures.push(`${report.device.id}: console error: ${error}`);
        }
      }
      return deviceFailures;
    });

    if (failures.length > 0) {
      throw new Error(`Mobile UI check failed:\n${failures.join('\n')}`);
    }

    console.log(`Mobile UI check complete: ${artifactDir}`);
  } finally {
    await Promise.all([
      browsers.chromium?.close(),
      browsers.webkit?.close(),
    ]);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
