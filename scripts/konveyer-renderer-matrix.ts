#!/usr/bin/env tsx

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join, normalize } from 'path';
import { chromium } from 'playwright';

const HOST = '127.0.0.1';
const DIST_ROOT = join(process.cwd(), 'dist');
const INDEX_PATH = join(DIST_ROOT, 'index.html');
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const START_TIMEOUT_MS = 45_000;
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

type RendererBackendCapabilitiesSnapshot = {
  requestedMode?: string;
  resolvedBackend?: string;
  initStatus?: string;
  strictWebGPU?: boolean;
  error?: string | null;
  notes?: string[];
};

type RendererMatrixScenario = {
  name: 'default-webgl' | 'webgpu-force-webgl' | 'webgpu-strict';
  query: string;
};

type RendererMatrixResult = {
  name: RendererMatrixScenario['name'];
  url: string;
  status: 'pass' | 'fail';
  expected: string;
  startVisible: boolean;
  fatalVisible: boolean;
  fatalText: string | null;
  bodyText: string;
  capabilities: RendererBackendCapabilitiesSnapshot | null;
  consoleErrors: string[];
  pageErrors: string[];
  failures: string[];
};

type RendererMatrixArtifact = {
  createdAt: string;
  source: string;
  userAgent: string | null;
  results: RendererMatrixResult[];
  nonClaims: string[];
};

const scenarios: RendererMatrixScenario[] = [
  { name: 'default-webgl', query: '?diag=1' },
  { name: 'webgpu-force-webgl', query: '?diag=1&renderer=webgpu-force-webgl' },
  { name: 'webgpu-strict', query: '?diag=1&renderer=webgpu-strict' },
];

let activePort = 0;

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function ensureBuildExists(): void {
  if (!existsSync(INDEX_PATH)) {
    throw new Error('dist/index.html not found. Run `npm run build` before `check:konveyer-renderer-matrix`.');
  }
}

function resolveFilePath(pathname: string): string | null {
  const relativePath = pathname === '/' || pathname.length === 0 ? 'index.html' : pathname.replace(/^\//, '');
  const resolved = normalize(join(DIST_ROOT, relativePath));
  if (!resolved.startsWith(normalize(DIST_ROOT))) {
    return null;
  }
  return resolved;
}

function serveFile(req: IncomingMessage, res: ServerResponse): void {
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

function resolveListeningPort(server: ReturnType<typeof createServer>): number {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve KONVEYER renderer matrix server port.');
  }
  return address.port;
}

function expectedForScenario(name: RendererMatrixScenario['name']): string {
  if (name === 'default-webgl') return 'Start screen with resolvedBackend=webgl.';
  if (name === 'webgpu-force-webgl') return 'Start screen with explicit WebGPURenderer WebGL backend or fallback-webgl status.';
  return 'Strict WebGPU either resolves backend=webgpu or shows a fatal strict WebGPU failure; fallback success is not allowed.';
}

function evaluateScenario(result: Omit<RendererMatrixResult, 'status' | 'expected' | 'failures'>): RendererMatrixResult {
  const failures: string[] = [];
  const capabilities = result.capabilities;

  if (result.name === 'default-webgl') {
    if (!result.startVisible) failures.push('Default WebGL did not reach the start screen.');
    if (result.fatalVisible) failures.push('Default WebGL showed the fatal overlay.');
    if (capabilities?.resolvedBackend !== 'webgl') {
      failures.push(`Default WebGL resolved backend ${capabilities?.resolvedBackend ?? 'missing'}.`);
    }
  } else if (result.name === 'webgpu-force-webgl') {
    if (!result.startVisible) failures.push('Forced WebGL backend did not reach the start screen.');
    if (result.fatalVisible) failures.push('Forced WebGL backend showed the fatal overlay.');
    if (capabilities?.requestedMode !== 'webgpu-force-webgl') {
      failures.push(`Forced backend requested mode ${capabilities?.requestedMode ?? 'missing'}.`);
    }
    const explicitFallback = capabilities?.resolvedBackend === 'webgpu-webgl-fallback'
      || capabilities?.initStatus === 'fallback-webgl';
    if (!explicitFallback) {
      failures.push(`Forced backend did not report explicit fallback; resolved=${capabilities?.resolvedBackend ?? 'missing'} status=${capabilities?.initStatus ?? 'missing'}.`);
    }
  } else {
    const strictPassed = result.startVisible
      && capabilities?.requestedMode === 'webgpu-strict'
      && capabilities.resolvedBackend === 'webgpu';
    const strictFailedLoudly = result.fatalVisible
      && (result.fatalText?.toLowerCase().includes('webgpu') ?? false);
    if (!strictPassed && !strictFailedLoudly) {
      failures.push('Strict WebGPU neither resolved backend=webgpu nor failed loudly with a WebGPU fatal overlay.');
    }
    if (capabilities?.resolvedBackend === 'webgpu-webgl-fallback' || capabilities?.initStatus === 'fallback-webgl') {
      failures.push('Strict WebGPU reported fallback success, which is not allowed for migration proof.');
    }
  }

  failures.push(...result.pageErrors.map((entry) => `Page error: ${entry}`));
  return {
    ...result,
    expected: expectedForScenario(result.name),
    status: failures.length === 0 ? 'pass' : 'fail',
    failures,
  };
}

async function runScenario(baseUrl: string, scenario: RendererMatrixScenario): Promise<RendererMatrixResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-webgpu'],
  });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(String(error?.stack ?? error));
    });

    const url = `${baseUrl}/${scenario.query}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: START_TIMEOUT_MS });
    await page.waitForFunction(() => {
      const startButton = document.querySelector<HTMLButtonElement>('button[data-ref="start"]');
      const playButton = document.querySelector<HTMLButtonElement>('button[data-ref="play"]');
      const button = startButton ?? playButton;
      const startVisible = button
        ? window.getComputedStyle(button).display !== 'none'
          && window.getComputedStyle(button).visibility !== 'hidden'
          && button.getBoundingClientRect().width > 0
          && button.getBoundingClientRect().height > 0
        : false;
      const fatal = document.body.innerText.includes('Failed to initialize');
      return startVisible || fatal;
    }, undefined, { timeout: START_TIMEOUT_MS }).catch(() => undefined);

    const startVisible = await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('button[data-ref="start"]')
        ?? document.querySelector<HTMLButtonElement>('button[data-ref="play"]');
      if (!button) return false;
      const style = window.getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    }).catch(() => false);
    const fatalVisible = await page.locator('text=Failed to initialize').isVisible().catch(() => false);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const fatalText = fatalVisible ? bodyText : null;
    const capabilities = await page.evaluate(() => {
      const globalScope = window as unknown as {
        __rendererBackendCapabilities?: () => RendererBackendCapabilitiesSnapshot;
      };
      return globalScope.__rendererBackendCapabilities?.() ?? null;
    }).catch(() => null);

    return evaluateScenario({
      name: scenario.name,
      url,
      startVisible,
      fatalVisible,
      fatalText,
      bodyText,
      capabilities,
      consoleErrors,
      pageErrors,
    });
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  ensureBuildExists();
  const server = createServer(serveFile);
  await new Promise<void>((resolve) => server.listen(0, HOST, resolve));
  activePort = resolveListeningPort(server);

  try {
    const baseUrl = `http://${HOST}:${activePort}`;
    const results: RendererMatrixResult[] = [];
    let userAgent: string | null = null;
    for (const scenario of scenarios) {
      const result = await runScenario(baseUrl, scenario);
      results.push(result);
      userAgent ??= await chromium.launch({ headless: true })
        .then(async (browser) => {
          const page = await browser.newPage();
          const ua = await page.evaluate(() => navigator.userAgent);
          await browser.close();
          return ua;
        })
        .catch(() => null);
    }

    const artifact: RendererMatrixArtifact = {
      createdAt: new Date().toISOString(),
      source: 'scripts/konveyer-renderer-matrix.ts',
      userAgent,
      results,
      nonClaims: [
        'This matrix proves built-app backend selection behavior, not full visual parity.',
        'Strict WebGPU pass requires resolvedBackend=webgpu; fallback success is rejected.',
        'A strict loud-failure result on this machine means headed hardware WebGPU proof is still required before default-on review.',
      ],
    };

    const artifactDir = join(ARTIFACT_ROOT, timestampSlug(), 'konveyer-renderer-matrix');
    mkdirSync(artifactDir, { recursive: true });
    const artifactPath = join(artifactDir, 'matrix.json');
    writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);

    console.log(`KONVEYER renderer matrix written to ${artifactPath}`);
    for (const result of results) {
      console.log(`${result.name}: ${result.status} (${result.capabilities?.resolvedBackend ?? 'no-capabilities'})`);
      for (const failure of result.failures) {
        console.log(`  - ${failure}`);
      }
    }

    if (results.some((result) => result.status === 'fail')) {
      process.exit(1);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
