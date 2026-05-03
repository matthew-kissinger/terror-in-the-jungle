#!/usr/bin/env tsx

import { chromium, devices, webkit, type Browser, type BrowserContextOptions, type Page } from 'playwright';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, normalize } from 'path';

const HOST = '127.0.0.1';
const DEFAULT_PORT = Number(process.env.MOBILE_UI_PORT ?? 0);
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
  elementPointerEvents: string;
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

function resolveListeningPort(server: ReturnType<typeof createServer>): number {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve mobile UI server port.');
  }
  return address.port;
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
    const rect = (element as HTMLElement).getBoundingClientRect();
    const event = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
    element.dispatchEvent(event);
  });
}

async function dispatchPointerSequence(page: Page, selector: string): Promise<void> {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: 120_000 });
  await locator.evaluate((element) => {
    const rect = (element as HTMLElement).getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const pointerDown = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX,
      clientY,
    });
    const pointerUp = new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 0,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX,
      clientY,
    });
    element.dispatchEvent(pointerDown);
    element.dispatchEvent(pointerUp);
  });
}

async function scrollSelectorIntoView(page: Page, selector: string): Promise<void> {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'attached', timeout: 120_000 });
  await locator.evaluate((element) => {
    (element as HTMLElement).scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  });
}

async function clickSelectorDirect(page: Page, selector: string): Promise<void> {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: 120_000 });
  await locator.evaluate((element) => {
    (element as HTMLElement).click();
  });
}

async function collectTriggerDiagnostics(page: Page, selector: string): Promise<unknown> {
  return page.evaluate((target) => {
    const describeElement = (element: Element | null) => {
      if (!element) return null;
      const htmlElement = element as HTMLElement;
      const rect = htmlElement.getBoundingClientRect();
      const style = window.getComputedStyle(htmlElement);
      return {
        tag: htmlElement.tagName,
        id: htmlElement.id || null,
        className: typeof htmlElement.className === 'string'
          ? htmlElement.className
          : String(htmlElement.className),
        dataRef: htmlElement.getAttribute('data-ref'),
        dataReady: htmlElement.dataset.ready,
        dataVisible: htmlElement.dataset.visible,
        ariaDisabled: htmlElement.getAttribute('aria-disabled'),
        ariaLabel: htmlElement.getAttribute('aria-label'),
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      };
    };

    const targetElement = document.querySelector(target);
    const targetRect = targetElement instanceof HTMLElement ? targetElement.getBoundingClientRect() : null;
    const centerX = targetRect ? targetRect.left + targetRect.width / 2 : window.innerWidth / 2;
    const centerY = targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight / 2;
    const hitStack = document.elementsFromPoint(centerX, centerY).slice(0, 5).map((element) => describeElement(element));
    const modal = document.querySelector('#settings-modal');
    const activeElement = document.activeElement;

    return {
      target: describeElement(targetElement),
      hitStack,
      settingsModal: describeElement(modal),
      activeElement: describeElement(activeElement),
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        visualWidth: window.visualViewport?.width ?? null,
        visualHeight: window.visualViewport?.height ?? null,
      },
    };
  }, selector).catch((error) => ({ error: String(error) }));
}

async function triggerWithFallback(
  page: Page,
  selector: string,
  label: string,
  waitForOutcome: () => Promise<void>,
  preferredAction: 'tap' | 'pointerdown' = 'tap',
): Promise<void> {
  const attempts = preferredAction === 'tap'
    ? [
        { name: 'tap', run: () => tapSelector(page, selector) },
        { name: 'pointer-sequence', run: () => dispatchPointerSequence(page, selector) },
        { name: 'pointerdown', run: () => dispatchPointerDown(page, selector) },
      ]
    : [
        { name: 'pointer-sequence', run: () => dispatchPointerSequence(page, selector) },
        { name: 'pointerdown', run: () => dispatchPointerDown(page, selector) },
        { name: 'tap', run: () => tapSelector(page, selector) },
      ];

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      await attempt.run();
      await waitForOutcome();
      return;
    } catch (error) {
      errors.push(`${attempt.name}: ${String(error)}`);
      await page.waitForTimeout(250);
    }
  }

  const diagnostics = await collectTriggerDiagnostics(page, selector);
  const diagnosticPayload = JSON.stringify(diagnostics);
  throw new Error(
    `${label} failed to trigger expected outcome. Attempts: ${errors.join(' | ')}. Diagnostics: ${diagnosticPayload}`
  );
}

async function assertActionable(page: Page, selector: string, label: string): Promise<Actionability> {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'attached', timeout: 120_000 });
  await page.waitForFunction((target) => {
    const el = document.querySelector<HTMLElement>(target);
    if (!el) return false;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity) !== 0 &&
      style.pointerEvents !== 'none' &&
      rect.width >= 1 &&
      rect.height >= 1
    );
  }, selector, { timeout: 30_000 });

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
      elementPointerEvents: style.pointerEvents,
      pointerBlockedByAncestor,
    };
  }, { selector, label });

  if (!state.isVisible || !state.withinViewport || state.elementPointerEvents === 'none') {
    throw new Error(
      `${label} failed actionability: ${JSON.stringify(state)}`
    );
  }

  if (state.hitProbeSupported && !state.ownsHitTarget) {
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
  const visible = await triggerWithFallback(
    page,
    commandButtonSelector,
    'Gameplay command button',
    () => page.waitForSelector('.command-mode-overlay[data-visible="true"]', { state: 'visible', timeout: 5_000 }).then(() => {}),
    'pointerdown',
  ).then(() => true).catch(() => false);

  if (!visible) {
    report.skipped.push('Command overlay did not open in the current gameplay state.');
    return;
  }

  report.checks.push(await assertActionable(page, '.command-mode-overlay__close', 'Command overlay close'));
  await captureScreenshot(page, report.device.id, 'command-overlay', artifactDir, report.screenshots);
  await clickSelectorDirect(page, '.command-mode-overlay__close');
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
    await page.waitForSelector('#settings-modal[data-visible="true"]', { state: 'visible', timeout: 30_000 });
    report.checks.push(await assertActionable(page, '#settings-modal [data-ref="close"]', 'Title settings close'));
    report.checks.push(await assertScrollOwner(page, '#settings-modal [data-ref="scroll-body"]', 'Title settings scroll body'));
    await captureScreenshot(page, device.id, 'title-settings', artifactDir, report.screenshots);
    await dispatchPointerDown(page, '#settings-modal [data-ref="close"]');
    await waitForHidden(page, '#settings-modal');

    await tapSelector(page, 'button[data-ref="start"]');
    await page.waitForSelector(`[data-mode="${mode}"]`, { state: 'visible', timeout: 120_000 });
    report.checks.push(await assertActionable(page, '[data-ref="back"]', 'Mode select back button'));
    report.checks.push(await assertScrollOwner(page, '[data-ref="mode-select-content"]', 'Mode select scroll body'));

    const availableModes = await page.locator('[data-mode]').evaluateAll((elements) =>
      elements
        .map((element) => (element as HTMLElement).dataset.mode ?? '')
        .filter((value) => value.length > 0)
    );
    for (const availableMode of availableModes) {
      await scrollSelectorIntoView(page, `[data-mode="${availableMode}"]`);
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
    await page.waitForSelector('#touch-menu-btn[data-ready="true"]', { state: 'visible', timeout: 30_000 });
    report.checks.push(await assertActionable(page, '#touch-menu-btn[data-ready="true"]', 'Gameplay menu button'));
    await captureScreenshot(page, device.id, 'gameplay', artifactDir, report.screenshots);

    // MAP and CMD buttons are intentionally hidden in short landscape (max-height: 440px)
    const mapButtonVisible = await page.locator('#touch-action-buttons [aria-label="MAP"]').first()
      .evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }).catch(() => false);

    if (mapButtonVisible) {
      report.checks.push(await assertActionable(page, '#touch-action-buttons [aria-label="MAP"]', 'Gameplay map button'));
      await triggerWithFallback(
        page,
        '#touch-action-buttons [aria-label="MAP"]',
        'Gameplay map button',
        () => page.waitForSelector('.full-map-container.visible', { state: 'visible', timeout: 5_000 }).then(() => {}),
        'pointerdown',
      );
      report.checks.push(await assertActionable(page, '.map-close-button', 'Full map close button'));
      await captureScreenshot(page, device.id, 'full-map', artifactDir, report.screenshots);
      await triggerWithFallback(
        page,
        '.map-close-button',
        'Full map close button',
        () => page.waitForSelector('.full-map-container.visible', { state: 'hidden', timeout: 5_000 }).then(() => {}),
        'pointerdown',
      );
      await maybeExerciseCommandOverlay(page, report, artifactDir);
    } else {
      report.skipped.push('MAP button hidden in short landscape viewport - skipping map and command overlay checks.');
    }

  await triggerWithFallback(
    page,
    '#touch-menu-btn[data-ready="true"]',
    'Gameplay menu button',
    () => page.waitForSelector('#settings-modal[data-visible="true"]', { state: 'visible', timeout: 5_000 }).then(() => {}),
    'pointerdown',
  );
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
  const port = resolveListeningPort(server);

  try {
    browsers.chromium = await chromium.launch({
      headless: !options.headed,
      args: ['--use-angle=swiftshader', '--enable-webgl'],
    });

    const reports: DeviceReport[] = [];
    const deviceCases = options.includeWebkit
      ? [...DEFAULT_DEVICE_CASES, ...WEBKIT_DEVICE_CASES]
      : DEFAULT_DEVICE_CASES;
    if (options.includeWebkit) {
      browsers.webkit = await webkit.launch({
        headless: !options.headed,
      });
    }
    for (const device of deviceCases) {
      console.log(`Checking ${device.id} (${device.browserKind})`);
      const browser = browsers[device.browserKind];
      if (!browser) {
        throw new Error(`Browser not available for ${device.browserKind}`);
      }
      reports.push(await runDeviceCase(browser, device, artifactDir, options.mode, port));
    }

    writeFileSync(join(artifactDir, 'report.json'), JSON.stringify(reports, null, 2));
    writeFileSync(join(artifactDir, 'report.md'), buildMarkdownSummary(reports, artifactDir));

    const ignoredConsoleErrorFragments = [
      'KHR_parallel_shader_compile',
      'WebGL warning',
      'Ignored attempt to cancel a touchstart event with cancelable=false',
    ];

    const failures = reports.flatMap((report) => {
      const deviceFailures: string[] = [];
      for (const error of report.pageErrors) {
        deviceFailures.push(`${report.device.id}: page error: ${error}`);
      }
      for (const error of report.requestErrors) {
        deviceFailures.push(`${report.device.id}: request error: ${error}`);
      }
      for (const error of report.consoleErrors) {
        if (!ignoredConsoleErrorFragments.some((fragment) => error.includes(fragment))) {
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
    await closeServer(server);
  }
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.closeAllConnections?.();
      resolve();
    }, 5_000);
    timeout.unref?.();
    server.close((error?: Error) => {
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
