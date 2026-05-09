#!/usr/bin/env tsx

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

type CheckStatus = 'pass' | 'warn' | 'fail' | 'deferred';

type ProbeConfig = {
  runBrowser: boolean;
  headed: boolean;
  port: number;
  outputDir: string;
  checkLiveHeaders: boolean;
  liveUrl: string;
};

type NamedCheck = {
  name: string;
  status: CheckStatus;
  detail: string;
};

type BrowserPageCapability = {
  url: string;
  userAgent: string;
  isSecureContext: boolean;
  crossOriginIsolated: boolean;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  devicePixelRatio: number;
  viewport: {
    innerWidth: number;
    innerHeight: number;
    outerWidth: number;
    outerHeight: number;
    screenWidth: number;
    screenHeight: number;
    screenAvailWidth: number;
    screenAvailHeight: number;
  };
  sharedArrayBuffer: {
    available: boolean;
    atomicsAvailable: boolean;
    atomicsWaitAsyncAvailable: boolean;
  };
  offscreenCanvas: {
    available: boolean;
    webgl2ContextAvailable: boolean;
    htmlCanvasTransferAvailable: boolean;
  };
  webgl2: {
    available: boolean;
    vendor: string | null;
    renderer: string | null;
    version: string | null;
    shadingLanguageVersion: string | null;
    extensions: string[];
    hasDisjointTimerQueryWebgl2: boolean;
    hasDebugRendererInfo: boolean;
  };
  webgpu: {
    navigatorGpuAvailable: boolean;
    adapterAvailable: boolean;
    adapterName: string | null;
    adapterFeatures: string[];
    adapterLimits: Record<string, number | string | boolean | null>;
    error: string | null;
  };
};

type HeaderContract = {
  status: CheckStatus;
  localHeadersFile: {
    path: string;
    exists: boolean;
    coop: string | null;
    coep: string | null;
    crossOriginIsolationConfigured: boolean;
  };
  live: {
    checked: boolean;
    url: string;
    statusCode: number | null;
    coop: string | null;
    coep: string | null;
    cacheControl: string | null;
    accessControlAllowOrigin: string | null;
    crossOriginIsolationHeadersPresent: boolean | null;
    error: string | null;
  };
};

type ProbeSummary = {
  createdAt: string;
  source: 'Projekt Objekt-143 browser platform capability probe';
  status: CheckStatus;
  config: {
    runBrowser: boolean;
    headed: boolean;
    resourceGuard: {
      projekt143PlatformBrowserReady: boolean;
      note: string;
    };
  };
  artifactDir: string;
  files: {
    summary: string;
    markdown: string;
  };
  browser: {
    version: string | null;
    plain: BrowserPageCapability | null;
    isolated: BrowserPageCapability | null;
  };
  headerContract: HeaderContract;
  checks: NamedCheck[];
  nextActions: string[];
  nonClaims: string[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-platform-capability-probe';
const DEFAULT_PORT = 9243;
const DEFAULT_LIVE_URL = 'https://terror-in-the-jungle.pages.dev/';
const HEADERS_PATH = join(process.cwd(), 'public', '_headers');
const VIEWPORT = { width: 1920, height: 1080 };
const WEBGPU_LIMIT_NAMES = [
  'maxTextureDimension1D',
  'maxTextureDimension2D',
  'maxTextureDimension3D',
  'maxTextureArrayLayers',
  'maxBindGroups',
  'maxBindingsPerBindGroup',
  'maxBufferSize',
  'maxStorageBufferBindingSize',
  'maxUniformBufferBindingSize',
  'maxVertexBuffers',
  'maxVertexAttributes',
  'maxInterStageShaderComponents',
  'maxComputeWorkgroupStorageSize',
  'maxComputeInvocationsPerWorkgroup',
  'maxComputeWorkgroupSizeX',
  'maxComputeWorkgroupSizeY',
  'maxComputeWorkgroupSizeZ',
  'maxComputeWorkgroupsPerDimension',
] as const;

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parsePort(): number {
  const raw = argValue('--port');
  if (!raw) return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid --port value: ${raw}`);
  }
  return parsed;
}

function parseConfig(): ProbeConfig {
  const outputDir = argValue('--out-dir') ?? join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  return {
    runBrowser: hasFlag('--run-browser') || process.env.PROJEKT_143_PLATFORM_BROWSER_READY === '1',
    headed: !hasFlag('--headless'),
    port: parsePort(),
    outputDir,
    checkLiveHeaders: hasFlag('--check-live-headers') || process.env.PROJEKT_143_PLATFORM_LIVE_HEADERS === '1',
    liveUrl: argValue('--live-url') ?? process.env.PROJEKT_143_PLATFORM_LIVE_URL ?? DEFAULT_LIVE_URL,
  };
}

function rel(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function html(): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>Projekt 143 Platform Probe</title></head>',
    '<body><main id="probe-root">Projekt 143 Platform Probe</main></body>',
    '</html>',
  ].join('');
}

function valueFromHeadersFile(source: string, name: string): string | null {
  const regex = new RegExp(`^\\s*${name}\\s*:\\s*(.+)$`, 'im');
  return source.match(regex)?.[1]?.trim() ?? null;
}

function isolationConfigured(coop: string | null, coep: string | null): boolean {
  return coop?.toLowerCase() === 'same-origin'
    && (coep?.toLowerCase() === 'credentialless' || coep?.toLowerCase() === 'require-corp');
}

async function collectHeaderContract(config: ProbeConfig): Promise<HeaderContract> {
  const localSource = existsSync(HEADERS_PATH) ? readFileSync(HEADERS_PATH, 'utf8') : '';
  const localCoop = localSource ? valueFromHeadersFile(localSource, 'Cross-Origin-Opener-Policy') : null;
  const localCoep = localSource ? valueFromHeadersFile(localSource, 'Cross-Origin-Embedder-Policy') : null;
  const localConfigured = isolationConfigured(localCoop, localCoep);
  const live: HeaderContract['live'] = {
    checked: config.checkLiveHeaders,
    url: config.liveUrl,
    statusCode: null,
    coop: null,
    coep: null,
    cacheControl: null,
    accessControlAllowOrigin: null,
    crossOriginIsolationHeadersPresent: null,
    error: null,
  };

  if (config.checkLiveHeaders) {
    try {
      const response = await fetch(config.liveUrl, { method: 'HEAD' });
      live.statusCode = response.status;
      live.coop = response.headers.get('cross-origin-opener-policy');
      live.coep = response.headers.get('cross-origin-embedder-policy');
      live.cacheControl = response.headers.get('cache-control');
      live.accessControlAllowOrigin = response.headers.get('access-control-allow-origin');
      live.crossOriginIsolationHeadersPresent = isolationConfigured(live.coop, live.coep);
    } catch (error) {
      live.error = error instanceof Error ? error.message : String(error);
      live.crossOriginIsolationHeadersPresent = false;
    }
  }

  const status: CheckStatus = !existsSync(HEADERS_PATH) || !localConfigured
    ? 'fail'
    : config.checkLiveHeaders && live.crossOriginIsolationHeadersPresent !== true
      ? 'warn'
      : 'pass';

  return {
    status,
    localHeadersFile: {
      path: rel(HEADERS_PATH),
      exists: existsSync(HEADERS_PATH),
      coop: localCoop,
      coep: localCoep,
      crossOriginIsolationConfigured: localConfigured,
    },
    live,
  };
}

function serveProbePage(port: number): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = request.url ?? '/';
    if (url.startsWith('/isolated')) {
      response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(html());
  });

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolvePromise({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolvePromise) => {
    server.close(() => resolvePromise());
  });
}

async function collectPageCapability(page: Page, url: string): Promise<BrowserPageCapability> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page.evaluate(async (limitNames) => {
    type NavigatorWithMaybeGpu = Navigator & {
      gpu?: {
        requestAdapter?: () => Promise<{
          features?: Iterable<string>;
          limits?: Record<string, unknown>;
          info?: { description?: string; device?: string; vendor?: string };
        } | null>;
      };
      deviceMemory?: number;
    };
    type DebugRendererInfo = {
      UNMASKED_VENDOR_WEBGL: number;
      UNMASKED_RENDERER_WEBGL: number;
    };

    const nav = navigator as NavigatorWithMaybeGpu;
    const sharedArrayBufferAvailable = typeof SharedArrayBuffer !== 'undefined';
    const atomicsWaitAsync = typeof Atomics !== 'undefined' && 'waitAsync' in Atomics;
    const offscreenAvailable = typeof OffscreenCanvas !== 'undefined';
    let offscreenWebgl2 = false;
    if (offscreenAvailable) {
      try {
        const offscreen = new OffscreenCanvas(16, 16);
        offscreenWebgl2 = Boolean(offscreen.getContext('webgl2'));
      } catch {
        offscreenWebgl2 = false;
      }
    }

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    const extensions = gl?.getSupportedExtensions() ?? [];
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info') as DebugRendererInfo | null;
    const vendor = gl
      ? String(gl.getParameter(debugInfo?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR))
      : null;
    const renderer = gl
      ? String(gl.getParameter(debugInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER))
      : null;
    const version = gl ? String(gl.getParameter(gl.VERSION)) : null;
    const shadingLanguageVersion = gl ? String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)) : null;

    let adapterAvailable = false;
    let adapterName: string | null = null;
    let adapterFeatures: string[] = [];
    const adapterLimits: Record<string, number | string | boolean | null> = {};
    let webgpuError: string | null = null;
    if (nav.gpu?.requestAdapter) {
      try {
        const adapter = await nav.gpu.requestAdapter();
        adapterAvailable = Boolean(adapter);
        adapterFeatures = Array.from(adapter?.features ?? []).sort();
        const info = adapter?.info;
        adapterName = info?.description ?? info?.device ?? info?.vendor ?? null;
        const limits = adapter?.limits ?? {};
        for (const name of limitNames) {
          const value = limits[name];
          if (
            typeof value === 'number'
            || typeof value === 'string'
            || typeof value === 'boolean'
          ) {
            adapterLimits[name] = value;
          } else {
            adapterLimits[name] = null;
          }
        }
      } catch (error) {
        webgpuError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      url: window.location.href,
      userAgent: navigator.userAgent,
      isSecureContext: window.isSecureContext,
      crossOriginIsolated: window.crossOriginIsolated,
      hardwareConcurrency: Number.isFinite(navigator.hardwareConcurrency)
        ? navigator.hardwareConcurrency
        : null,
      deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
      devicePixelRatio: window.devicePixelRatio,
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        screenAvailWidth: window.screen.availWidth,
        screenAvailHeight: window.screen.availHeight,
      },
      sharedArrayBuffer: {
        available: sharedArrayBufferAvailable,
        atomicsAvailable: typeof Atomics !== 'undefined',
        atomicsWaitAsyncAvailable: atomicsWaitAsync,
      },
      offscreenCanvas: {
        available: offscreenAvailable,
        webgl2ContextAvailable: offscreenWebgl2,
        htmlCanvasTransferAvailable: 'transferControlToOffscreen' in HTMLCanvasElement.prototype,
      },
      webgl2: {
        available: Boolean(gl),
        vendor,
        renderer,
        version,
        shadingLanguageVersion,
        extensions,
        hasDisjointTimerQueryWebgl2: extensions.includes('EXT_disjoint_timer_query_webgl2'),
        hasDebugRendererInfo: Boolean(debugInfo),
      },
      webgpu: {
        navigatorGpuAvailable: Boolean(nav.gpu),
        adapterAvailable,
        adapterName,
        adapterFeatures,
        adapterLimits,
        error: webgpuError,
      },
    };
  }, [...WEBGPU_LIMIT_NAMES]);
}

function makeDeferredSummary(config: ProbeConfig, headerContract: HeaderContract): ProbeSummary {
  const summaryPath = join(config.outputDir, 'summary.json');
  const markdownPath = join(config.outputDir, 'README.md');
  return {
    createdAt: new Date().toISOString(),
    source: 'Projekt Objekt-143 browser platform capability probe',
    status: 'deferred',
    config: {
      runBrowser: false,
      headed: config.headed,
      resourceGuard: {
        projekt143PlatformBrowserReady: process.env.PROJEKT_143_PLATFORM_BROWSER_READY === '1',
        note: 'Default run did not open a browser. Use --run-browser only after the local resource window is quiet.',
      },
    },
    artifactDir: rel(config.outputDir),
    files: {
      summary: rel(summaryPath),
      markdown: rel(markdownPath),
    },
    browser: {
      version: null,
      plain: null,
      isolated: null,
    },
    headerContract,
    checks: [
      {
        name: 'cross-origin-isolation-headers',
        status: headerContract.status,
        detail: headerContract.live.checked
          ? `local configured=${headerContract.localHeadersFile.crossOriginIsolationConfigured}; live configured=${headerContract.live.crossOriginIsolationHeadersPresent}.`
          : `local configured=${headerContract.localHeadersFile.crossOriginIsolationConfigured}; live headers not checked.`,
      },
      {
        name: 'browser-capability-probe',
        status: 'deferred',
        detail: 'No browser was launched because --run-browser was not provided.',
      },
    ],
    nextActions: [
      'After other browser/game agents are closed, rerun with --run-browser --headed --check-live-headers.',
      'Compare plain and cross-origin-isolated pages before planning WASM threads or SharedArrayBuffer work.',
      'Use WebGPU adapter limits as input to a contained renderer spike only after current WebGL blockers are stable.',
    ],
    nonClaims: [
      'No WebGPU, worker-renderer, or WASM-thread migration is approved by this artifact.',
      'No runtime performance claim is made without Open Frontier and A Shau perf evidence.',
      'No production support claim is made until live Pages headers and browser behavior are checked.',
    ],
  };
}

function statusFromChecks(checks: NamedCheck[]): CheckStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  if (checks.some((check) => check.status === 'deferred')) return 'deferred';
  return 'pass';
}

function buildChecks(plain: BrowserPageCapability, isolated: BrowserPageCapability): NamedCheck[] {
  return [
    {
      name: 'webgl2',
      status: isolated.webgl2.available ? 'pass' : 'fail',
      detail: isolated.webgl2.available
        ? `WebGL2 available via ${isolated.webgl2.renderer ?? 'unknown renderer'}.`
        : 'WebGL2 context creation failed.',
    },
    {
      name: 'webgl-gpu-timer',
      status: isolated.webgl2.hasDisjointTimerQueryWebgl2 ? 'pass' : 'warn',
      detail: isolated.webgl2.hasDisjointTimerQueryWebgl2
        ? 'EXT_disjoint_timer_query_webgl2 is available.'
        : 'EXT_disjoint_timer_query_webgl2 is not available in the probed context.',
    },
    {
      name: 'webgpu-adapter',
      status: isolated.webgpu.adapterAvailable ? 'pass' : 'warn',
      detail: isolated.webgpu.adapterAvailable
        ? `WebGPU adapter available with ${isolated.webgpu.adapterFeatures.length} feature flags.`
        : `No WebGPU adapter returned${isolated.webgpu.error ? `: ${isolated.webgpu.error}` : '.'}`,
    },
    {
      name: 'offscreen-canvas-webgl2',
      status: isolated.offscreenCanvas.available && isolated.offscreenCanvas.webgl2ContextAvailable ? 'pass' : 'warn',
      detail: isolated.offscreenCanvas.webgl2ContextAvailable
        ? 'OffscreenCanvas can create a WebGL2 context.'
        : 'OffscreenCanvas WebGL2 context is unavailable.',
    },
    {
      name: 'shared-array-buffer-isolation',
      status: isolated.crossOriginIsolated && isolated.sharedArrayBuffer.available ? 'pass' : 'warn',
      detail: isolated.crossOriginIsolated && isolated.sharedArrayBuffer.available
        ? 'COOP/COEP isolated page exposes SharedArrayBuffer.'
        : 'COOP/COEP isolation or SharedArrayBuffer availability is missing.',
    },
    {
      name: 'plain-vs-isolated-sab-delta',
      status: !plain.sharedArrayBuffer.available && isolated.sharedArrayBuffer.available ? 'pass' : 'warn',
      detail: `plain SharedArrayBuffer=${plain.sharedArrayBuffer.available}; isolated SharedArrayBuffer=${isolated.sharedArrayBuffer.available}.`,
    },
    {
      name: 'fixed-viewport',
      status: isolated.viewport.innerWidth === VIEWPORT.width && isolated.viewport.innerHeight === VIEWPORT.height
        ? 'pass'
        : 'warn',
      detail: `inner viewport ${isolated.viewport.innerWidth}x${isolated.viewport.innerHeight}; expected ${VIEWPORT.width}x${VIEWPORT.height}.`,
    },
  ];
}

async function runBrowserProbe(config: ProbeConfig, headerContract: HeaderContract): Promise<ProbeSummary> {
  let server: Server | null = null;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  const summaryPath = join(config.outputDir, 'summary.json');
  const markdownPath = join(config.outputDir, 'README.md');
  try {
    const served = await serveProbePage(config.port);
    server = served.server;
    browser = await chromium.launch({
      headless: !config.headed,
      args: [
        '--window-position=0,0',
        '--window-size=1920,1080',
        '--force-device-scale-factor=1',
      ],
    });
    context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const plain = await collectPageCapability(page, `${served.baseUrl}/plain`);
    const isolated = await collectPageCapability(page, `${served.baseUrl}/isolated`);
    const checks = buildChecks(plain, isolated);
    const browserVersion = browser.version();
    return {
      createdAt: new Date().toISOString(),
      source: 'Projekt Objekt-143 browser platform capability probe',
      status: statusFromChecks(checks),
      config: {
        runBrowser: true,
        headed: config.headed,
        resourceGuard: {
          projekt143PlatformBrowserReady: process.env.PROJEKT_143_PLATFORM_BROWSER_READY === '1',
          note: 'Browser probe was run. Only accept this artifact if the local resource/process check was quiet first.',
        },
      },
      artifactDir: rel(config.outputDir),
      files: {
        summary: rel(summaryPath),
        markdown: rel(markdownPath),
      },
      browser: {
        version: browserVersion,
        plain,
        isolated,
      },
      headerContract,
      checks,
      nextActions: [
        'Use WebGL2 extension and GPU timer support to decide whether GPU timing should be enabled in perf captures.',
        'Use isolated-page SharedArrayBuffer results before planning WASM threads or worker simulation.',
        'Use WebGPU adapter limits only for a contained spike, not as permission to migrate the renderer.',
      ],
      nonClaims: [
        'This probe does not load the game runtime or certify Open Frontier or A Shau performance.',
        'This probe does not approve WebGPU, worker rendering, or WASM-thread migration.',
        'This probe does not prove production Pages headers unless it is repeated against production URLs.',
      ],
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    if (server) {
      await closeServer(server).catch(() => undefined);
    }
  }
}

function writeMarkdown(summary: ProbeSummary): void {
  const lines = [
    '# Projekt Objekt-143 Platform Capability Probe',
    '',
    `Status: ${summary.status}`,
    `Created: ${summary.createdAt}`,
    `Browser run: ${summary.config.runBrowser ? 'yes' : 'no'}`,
    `Headed: ${summary.config.headed ? 'yes' : 'no'}`,
    '',
    '## Checks',
    '',
    ...summary.checks.map((check) => `- ${check.status.toUpperCase()} ${check.name}: ${check.detail}`),
    '',
    '## Browser',
    '',
    `Version: ${summary.browser.version ?? 'not probed'}`,
    `WebGL renderer: ${summary.browser.isolated?.webgl2.renderer ?? 'not probed'}`,
    `WebGPU adapter: ${summary.browser.isolated?.webgpu.adapterAvailable ? 'available' : 'not available or not probed'}`,
    `SharedArrayBuffer isolated: ${summary.browser.isolated?.sharedArrayBuffer.available ?? false}`,
    '',
    '## Header Contract',
    '',
    `Local _headers status: ${summary.headerContract.localHeadersFile.crossOriginIsolationConfigured ? 'configured' : 'missing'}`,
    `Local COOP: ${summary.headerContract.localHeadersFile.coop ?? 'missing'}`,
    `Local COEP: ${summary.headerContract.localHeadersFile.coep ?? 'missing'}`,
    `Live checked: ${summary.headerContract.live.checked ? 'yes' : 'no'}`,
    `Live COOP: ${summary.headerContract.live.coop ?? 'not checked'}`,
    `Live COEP: ${summary.headerContract.live.coep ?? 'not checked'}`,
    '',
    '## Non-Claims',
    '',
    ...summary.nonClaims.map((claim) => `- ${claim}`),
    '',
  ];
  writeFileSync(join(process.cwd(), summary.files.markdown), `${lines.join('\n')}\n`, 'utf8');
}

async function main(): Promise<void> {
  const config = parseConfig();
  mkdirSync(config.outputDir, { recursive: true });
  const headerContract = await collectHeaderContract(config);

  const summary = config.runBrowser
    ? await runBrowserProbe(config, headerContract)
    : makeDeferredSummary(config, headerContract);

  writeJson(join(config.outputDir, 'summary.json'), summary);
  writeMarkdown(summary);

  console.log(`status=${summary.status}`);
  console.log(`artifact=${summary.artifactDir}`);
  console.log(`browserRun=${summary.config.runBrowser}`);
  console.log(`webglRenderer=${summary.browser.isolated?.webgl2.renderer ?? 'not_probed'}`);
  console.log(`webgpuAdapter=${summary.browser.isolated?.webgpu.adapterAvailable ?? false}`);
  console.log(`sharedArrayBufferIsolated=${summary.browser.isolated?.sharedArrayBuffer.available ?? false}`);
  console.log(`headerContract=${summary.headerContract.status}`);
  console.log(`liveHeaderChecked=${summary.headerContract.live.checked}`);
  console.log(`liveCrossOriginIsolationHeaders=${summary.headerContract.live.crossOriginIsolationHeadersPresent ?? false}`);

  if (summary.status === 'fail') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
