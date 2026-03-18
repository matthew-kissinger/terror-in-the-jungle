#!/usr/bin/env tsx

import { chromium } from 'playwright';
import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, readFileSync, statSync } from 'fs';
import { extname, join, normalize } from 'path';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PROD_SMOKE_PORT ?? 4173);
const BASE_PATH = '/terror-in-the-jungle';
const DIST_ROOT = join(process.cwd(), 'dist');
const INDEX_PATH = join(DIST_ROOT, 'index.html');
const START_TIMEOUT_MS = 90_000;
const POST_PLAY_TIMEOUT_MS = 60_000;

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

type SmokeResult = {
  consoleErrors: string[];
  pageErrors: string[];
  requestErrors: string[];
  currentUrl: string;
  menuText: string | null;
  bodyText: string;
  deployUiVisible: boolean;
  errorPanelVisible: boolean;
};

function ensureBuildExists(): void {
  if (!existsSync(INDEX_PATH)) {
    throw new Error('dist/index.html not found. Run `npm run build` before `npm run smoke:prod`.');
  }
}

function resolveFilePath(pathname: string): string | null {
  const trimmed = pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) : pathname;
  const relativePath = trimmed === '/' || trimmed.length === 0 ? 'index.html' : trimmed.replace(/^\//, '');
  const resolved = normalize(join(DIST_ROOT, relativePath));
  if (!resolved.startsWith(normalize(DIST_ROOT))) {
    return null;
  }
  return resolved;
}

function serveFile(req: IncomingMessage, res: ServerResponse): void {
  const requestUrl = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const pathname = requestUrl.pathname;
  if (!pathname.startsWith(BASE_PATH)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Not found: ${pathname}`);
    return;
  }

  const filePath = resolveFilePath(pathname);
  if (!filePath || !existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Not found: ${pathname}`);
    return;
  }

  const stats = statSync(filePath);
  const finalPath = stats.isDirectory() ? join(filePath, 'index.html') : filePath;
  if (!existsSync(finalPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Not found: ${pathname}`);
    return;
  }

  const body = readFileSync(finalPath);
  const contentType = MIME_TYPES[extname(finalPath).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(body);
}

async function runSmoke(): Promise<SmokeResult> {
  const server = createServer(serveFile);
  await new Promise<void>((resolve) => server.listen(PORT, HOST, resolve));

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestErrors: string[] = [];

  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-webgl'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
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

    await page.goto(`http://${HOST}:${PORT}${BASE_PATH}/`, { waitUntil: 'domcontentloaded', timeout: START_TIMEOUT_MS });

    // Wait for START GAME button on TitleScreen (new flow)
    // Falls back to old data-ref="play" for backward compatibility
    await page.waitForFunction(() => {
      const startBtn = document.querySelector<HTMLButtonElement>('button[data-ref="start"]');
      const playBtn = document.querySelector<HTMLButtonElement>('button[data-ref="play"]');
      const btn = startBtn ?? playBtn;
      if (!btn) return false;
      const style = window.getComputedStyle(btn);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }, undefined, { timeout: START_TIMEOUT_MS });

    const startButton = page.locator('button[data-ref="start"]');
    const playButton = page.locator('button[data-ref="play"]');
    const menuButton = await startButton.isVisible() ? startButton : playButton;
    const menuText = await menuButton.textContent();

    // Click START GAME -> opens ModeSelectScreen
    await menuButton.click();

    // Click first mode card (Zone Control) to start the game
    const modeCard = page.locator('[data-mode]').first();
    await modeCard.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await modeCard.isVisible()) {
      await modeCard.click();
    }

    const deployUi = page.locator('#respawn-ui');
    const errorPanel = page.locator('[data-action="retry"]');
    await page.waitForFunction(() => {
      const deployRoot = document.getElementById('respawn-ui');
      const retryButton = document.querySelector('[data-action="retry"]');
      if (retryButton) return true;
      if (!deployRoot) return false;
      const style = window.getComputedStyle(deployRoot);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }, undefined, { timeout: POST_PLAY_TIMEOUT_MS });

    const deployUiVisible = await deployUi.isVisible().catch(() => false);
    const errorPanelVisible = await errorPanel.isVisible().catch(() => false);

    return {
      consoleErrors,
      pageErrors,
      requestErrors,
      currentUrl: page.url(),
      menuText,
      bodyText: await page.locator('body').innerText(),
      deployUiVisible,
      errorPanelVisible,
    };
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function main(): Promise<void> {
  ensureBuildExists();
  const result = await runSmoke();

  const fatalConsoleErrors = result.consoleErrors.filter((entry) =>
    !entry.includes('KHR_parallel_shader_compile')
  );
  const failures = [
    ...fatalConsoleErrors.map((entry) => `Console error: ${entry}`),
    ...result.pageErrors.map((entry) => `Page error: ${entry}`),
    ...result.requestErrors.map((entry) => `Request error: ${entry}`),
  ];

  if (result.errorPanelVisible) {
    failures.push('Start or deploy flow surfaced the retry error panel.');
  }
  if (!result.deployUiVisible) {
    failures.push('Play did not transition to a visible deploy UI.');
  }

  if (failures.length > 0) {
    console.error('Production smoke failed.');
    console.error(`URL: ${result.currentUrl}`);
    console.error(`Menu button: ${result.menuText ?? 'unknown'}`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error('Body snapshot:');
    console.error(result.bodyText);
    process.exit(1);
  }

  console.log(`Production smoke passed at ${result.currentUrl}`);
  console.log(`Menu button: ${result.menuText ?? 'unknown'}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
