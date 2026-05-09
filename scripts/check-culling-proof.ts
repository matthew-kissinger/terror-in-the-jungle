#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import {
  PROJEKT_143_REQUIRED_SCENE_CATEGORIES,
  PROJEKT_143_SCENE_ATTRIBUTION_EVALUATE_SOURCE,
  type SceneAttributionEntry,
} from './audit-archive/scene-attribution';

type CheckStatus = 'pass' | 'warn' | 'fail';

type FixtureAsset = {
  id: string;
  category: string;
  path: string;
  kind: 'glb' | 'shader-proxy';
  fixtureLongestAxisMeters?: number;
};

type RendererInfo = {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  webglVendor: string | null;
  webglRenderer: string | null;
};

type CategoryCoverage = {
  category: string;
  present: boolean;
  visibleTriangles: number;
  drawCallLike: number;
};

type MeasurementTrust = {
  status: CheckStatus;
  summary: string;
  flags: {
    browserErrors: number;
    browserWarnings: number;
    pageErrors: number;
    requestFailures: number;
    longTasksCaptured: boolean;
    longTaskCount: number;
    loafCaptured: boolean;
    loafCount: number;
    cpuProfileCaptured: boolean;
    rendererStatsCaptured: boolean;
    sceneAttributionCaptured: boolean;
    requiredCategoriesVisible: boolean;
    webglRendererCaptured: boolean;
    probeRoundTripAvgMs: number;
    probeRoundTripP95Ms: number;
    probeRoundTripMaxMs: number;
  };
};

type ProofSummary = {
  createdAt: string;
  sourceGitSha: string;
  mode: 'cycle2-culling-scene-attribution-proof';
  status: CheckStatus;
  url: string;
  artifactDir: string;
  viewport: { width: number; height: number };
  browser: {
    headed: boolean;
    version: string | null;
    userAgent: string | null;
  };
  fixture: {
    assets: FixtureAsset[];
    notes: string[];
  };
  files: {
    summary: string;
    markdown: string;
    screenshot: string;
    sceneAttribution: string;
    rendererInfo: string;
    cpuProfile: string | null;
  };
  rendererInfo: RendererInfo | null;
  categoryCoverage: CategoryCoverage[];
  browserErrors: string[];
  browserWarnings: string[];
  pageErrors: string[];
  requestFailures: string[];
  measurementTrust: MeasurementTrust;
};

const DEFAULT_PORT = 9231;
const VIEWPORT = { width: 1600, height: 900 };
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-culling-proof';
const FIXTURE_ASSETS: FixtureAsset[] = [
  {
    id: 'sandbag-wall-static-feature',
    category: 'world_static_features',
    path: '/models/structures/sandbag-wall.glb',
    kind: 'glb',
    fixtureLongestAxisMeters: 3.4,
  },
  {
    id: 'a1-skyraider-fixed-wing',
    category: 'fixed_wing_aircraft',
    path: '/models/vehicles/aircraft/a1-skyraider.glb',
    kind: 'glb',
    fixtureLongestAxisMeters: 4.8,
  },
  {
    id: 'uh1-huey-helicopter',
    category: 'helicopters',
    path: '/models/vehicles/aircraft/uh1-huey.glb',
    kind: 'glb',
    fixtureLongestAxisMeters: 4.3,
  },
  {
    id: 'us-army-close-npc',
    category: 'npc_close_glb',
    path: '/models/npcs/pixel-forge-v1/usArmy.glb',
    kind: 'glb',
    fixtureLongestAxisMeters: 3.6,
  },
  {
    id: 'vegetation-imposter-shader-proxy',
    category: 'vegetation_imposters',
    path: 'shader:vegetationExposure+imposterAtlasEnabled',
    kind: 'shader-proxy',
  },
  {
    id: 'npc-imposter-shader-proxy',
    category: 'npc_imposters',
    path: 'shader:npcExposure+clipDuration',
    kind: 'shader-proxy',
  },
];

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

function parsePort(): number {
  const raw = argValue('--port');
  if (!raw) return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid --port value: ${raw}`);
  }
  return parsed;
}

function parseOutputDir(): string {
  const raw = argValue('--out-dir');
  if (raw) return raw;
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return join(ARTIFACT_ROOT, stamp, OUTPUT_NAME);
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.glb':
      return 'model/gltf-binary';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.wasm':
      return 'application/wasm';
    default:
      return 'application/octet-stream';
  }
}

function resolveStaticPath(pathname: string): string | null {
  const root = process.cwd();
  const decoded = decodeURIComponent(pathname);
  const trimmed = decoded.replace(/^\/+/, '');
  const basePath = decoded.startsWith('/models/') || decoded.startsWith('/assets/')
    ? resolve(root, 'public', trimmed)
    : resolve(root, trimmed);
  const safeRoot = root.endsWith(sep) ? root : `${root}${sep}`;
  if (basePath !== root && !basePath.startsWith(safeRoot)) {
    return null;
  }
  return basePath;
}

function serveFile(file: string, res: ServerResponse): void {
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'content-type': contentType(file),
    'cache-control': 'no-store',
  });
  res.end(readFileSync(file));
}

function proofHtml(): string {
  const fixtureJson = JSON.stringify(FIXTURE_ASSETS);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Projekt 143 Culling Proof</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #0b0d0f; }
    canvas { display: block; width: 100vw; height: 100vh; }
  </style>
  <script type="importmap">
    { "imports": { "three": "/node_modules/three/build/three.module.js" } }
  </script>
</head>
<body>
  <script>
    (() => {
      window.__projekt143PerfEntries = { longTasks: [], loafs: [], observerErrors: [] };
      const supported = PerformanceObserver.supportedEntryTypes || [];
      const observe = (type, target) => {
        if (!supported.includes(type)) return;
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              target.push({
                name: entry.name,
                entryType: entry.entryType,
                startTime: entry.startTime,
                duration: entry.duration
              });
            }
          }).observe({ type, buffered: true });
        } catch (error) {
          window.__projekt143PerfEntries.observerErrors.push(String(error));
        }
      };
      observe('longtask', window.__projekt143PerfEntries.longTasks);
      observe('long-animation-frame', window.__projekt143PerfEntries.loafs);
    })();
  </script>
  <script type="module">
    import * as THREE from 'three';
    import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

    const fixtureAssets = ${fixtureJson};
    const scene = new THREE.Scene();
    scene.name = 'Projekt143CullingProofScene';
    scene.background = new THREE.Color(0x11161c);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 8, 32);
    camera.lookAt(0, 2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.info.autoReset = false;
    document.body.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xdbe9ff, 0x2e271d, 2.0);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(12, 22, 18);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 12),
      new THREE.MeshBasicMaterial({ color: 0x26342a, side: THREE.DoubleSide })
    );
    ground.name = 'Projekt143FixtureGround';
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, 0.2);
    scene.add(ground);

    const loader = new GLTFLoader();
    const placements = {
      'world_static_features': { x: -13, z: 0, yaw: -0.15 },
      'fixed_wing_aircraft': { x: -6, z: 0, yaw: 0.25 },
      'helicopters': { x: 0, z: 0, yaw: -0.35 },
      'npc_close_glb': { x: 6.1, z: 0, yaw: 0 },
    };

    function rendererInfo() {
      const gl = renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
        webglVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
        webglRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null
      };
    }

    function renderFrameForStats() {
      renderer.info.reset();
      renderer.render(scene, camera);
      return rendererInfo();
    }

    window.__renderer = {
      scene,
      renderer,
      camera,
      renderFrameForStats,
      getPerformanceStats: rendererInfo
    };

    function fitAndPlace(root, asset) {
      const placement = placements[asset.category] || { x: 0, z: 0, yaw: 0 };
      root.name = asset.id;
      root.userData.modelPath = asset.path;
      root.rotation.y = placement.yaw;
      root.updateMatrixWorld(true);
      const initialBox = new THREE.Box3().setFromObject(root);
      const size = initialBox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      root.scale.multiplyScalar((asset.fixtureLongestAxisMeters || 4) / maxDim);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const center = box.getCenter(new THREE.Vector3());
      root.position.x += placement.x - center.x;
      root.position.y += -box.min.y;
      root.position.z += placement.z - center.z;
      root.traverse((child) => {
        child.frustumCulled = true;
      });
      scene.add(root);
      root.updateMatrixWorld(true);
      const finalBox = new THREE.Box3().setFromObject(root);
      return {
        id: asset.id,
        category: asset.category,
        path: asset.path,
        min: finalBox.min.toArray(),
        max: finalBox.max.toArray()
      };
    }

    function makeVegetationProxy() {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          vegetationExposure: { value: 1 },
          imposterAtlasEnabled: { value: 1 }
        },
        vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'void main(){ gl_FragColor = vec4(0.22, 0.55, 0.24, 1.0); }',
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.4), material);
      mesh.name = 'Projekt143VegetationImposterProxy';
      mesh.position.set(10.2, 2.18, 0);
      scene.add(mesh);
      return {
        id: 'vegetation-imposter-shader-proxy',
        category: 'vegetation_imposters',
        path: 'shader:vegetationExposure+imposterAtlasEnabled'
      };
    }

    function makeNpcImposterProxy() {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          npcExposure: { value: 1 },
          clipDuration: { value: 1.1 }
        },
        vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
        fragmentShader: 'void main(){ gl_FragColor = vec4(0.48, 0.41, 0.28, 1.0); }',
        side: THREE.DoubleSide
      });
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 2.2), material, 2);
      mesh.name = 'Projekt143NpcImposterProxy';
      const matrix = new THREE.Matrix4();
      matrix.makeTranslation(13.1, 1.08, -0.6);
      mesh.setMatrixAt(0, matrix);
      matrix.makeTranslation(14.1, 1.08, 0.7);
      mesh.setMatrixAt(1, matrix);
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      return {
        id: 'npc-imposter-shader-proxy',
        category: 'npc_imposters',
        path: 'shader:npcExposure+clipDuration',
        instances: 2
      };
    }

    async function boot() {
      const loaded = [];
      for (const asset of fixtureAssets.filter((entry) => entry.kind === 'glb')) {
        const gltf = await loader.loadAsync(asset.path);
        loaded.push(fitAndPlace(gltf.scene, asset));
      }
      loaded.push(makeVegetationProxy());
      loaded.push(makeNpcImposterProxy());
      for (let i = 0; i < 4; i++) {
        renderer.render(scene, camera);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      renderer.render(scene, camera);
      window.__projekt143CullingProofReady = {
        ok: true,
        loaded,
        scaleContract: {
          kind: 'fixture-only',
          note: 'Assets are scaled by longest bounding-box axis only to keep every renderer category visible in one camera. This screenshot is not runtime visual scale evidence.'
        },
        rendererInfo: renderFrameForStats(),
        perfEntries: window.__projekt143PerfEntries,
        userAgent: navigator.userAgent
      };
    }

    boot().catch((error) => {
      console.error(error);
      window.__projekt143CullingProofReady = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null
      };
    });
  </script>
</body>
</html>`;
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(proofHtml());
    return;
  }
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204, { 'cache-control': 'no-store' });
    res.end();
    return;
  }
  const file = resolveStaticPath(url.pathname);
  if (!file) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  serveFile(file, res);
}

async function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolveListen, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address() as AddressInfo;
      resolveListen(address.port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function startServer(preferredPort: number): Promise<{ server: Server; port: number }> {
  const attempts = preferredPort === 0 ? [0] : Array.from({ length: 16 }, (_, index) => preferredPort + index);
  let lastError: Error | null = null;
  for (const port of attempts) {
    const server = createServer(handleRequest);
    try {
      const actualPort = await listen(server, port);
      return { server, port: actualPort };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      server.close();
    }
  }
  throw lastError ?? new Error('Failed to bind proof server');
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose) => {
    server.close(() => resolveClose());
  });
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function probeRoundTrip(page: Page, samples = 20): Promise<number[]> {
  const results: number[] = [];
  for (let i = 0; i < samples; i++) {
    const started = performance.now();
    await page.evaluate(() => performance.now());
    results.push(Number((performance.now() - started).toFixed(2)));
  }
  return results;
}

function categoryCoverage(sceneAttribution: SceneAttributionEntry[] | null): CategoryCoverage[] {
  const byCategory = new Map((sceneAttribution ?? []).map((entry) => [entry.category, entry]));
  return PROJEKT_143_REQUIRED_SCENE_CATEGORIES.map((category) => {
    const entry = byCategory.get(category);
    return {
      category,
      present: Boolean(entry),
      visibleTriangles: Number(entry?.visibleTriangles ?? 0),
      drawCallLike: Number(entry?.drawCallLike ?? 0),
    };
  });
}

function buildMeasurementTrust(input: {
  browserErrors: string[];
  browserWarnings: string[];
  pageErrors: string[];
  requestFailures: string[];
  perfEntries: { longTasks?: unknown[]; loafs?: unknown[] } | null;
  cpuProfileCaptured: boolean;
  rendererInfo: RendererInfo | null;
  sceneAttribution: SceneAttributionEntry[] | null;
  coverage: CategoryCoverage[];
  probeRoundTripMs: number[];
}): MeasurementTrust {
  const probeAvg = Number(average(input.probeRoundTripMs).toFixed(2));
  const probeP95 = Number(percentile(input.probeRoundTripMs, 95).toFixed(2));
  const probeMax = Number(Math.max(0, ...input.probeRoundTripMs).toFixed(2));
  const requiredCategoriesVisible = input.coverage.every((entry) => entry.present && entry.visibleTriangles > 0);
  const rendererStatsCaptured = Boolean(input.rendererInfo && input.rendererInfo.drawCalls > 0 && input.rendererInfo.triangles > 0);
  const sceneAttributionCaptured = Boolean(input.sceneAttribution?.length);
  const hardFailure = input.browserErrors.length > 0
    || input.pageErrors.length > 0
    || input.requestFailures.length > 0
    || !input.cpuProfileCaptured
    || !rendererStatsCaptured
    || !sceneAttributionCaptured
    || !requiredCategoriesVisible
    || probeP95 > 100;
  const warning = !hardFailure && probeP95 > 25;
  const status: CheckStatus = hardFailure ? 'fail' : warning ? 'warn' : 'pass';
  return {
    status,
    summary: status === 'pass'
      ? 'Dedicated proof fixture captured renderer stats, CPU profile, scene attribution, and all required categories with trusted probe overhead.'
      : status === 'warn'
        ? 'Dedicated proof fixture captured required evidence, but probe overhead is above the preferred threshold.'
        : 'Dedicated proof fixture did not capture all required trust evidence.',
    flags: {
      browserErrors: input.browserErrors.length,
      browserWarnings: input.browserWarnings.length,
      pageErrors: input.pageErrors.length,
      requestFailures: input.requestFailures.length,
      longTasksCaptured: Boolean(input.perfEntries?.longTasks),
      longTaskCount: input.perfEntries?.longTasks?.length ?? 0,
      loafCaptured: Boolean(input.perfEntries?.loafs),
      loafCount: input.perfEntries?.loafs?.length ?? 0,
      cpuProfileCaptured: input.cpuProfileCaptured,
      rendererStatsCaptured,
      sceneAttributionCaptured,
      requiredCategoriesVisible,
      webglRendererCaptured: Boolean(input.rendererInfo?.webglRenderer),
      probeRoundTripAvgMs: probeAvg,
      probeRoundTripP95Ms: probeP95,
      probeRoundTripMaxMs: probeMax,
    },
  };
}

function writeMarkdown(summary: ProofSummary, file: string): void {
  const lines = [
    '# Projekt Objekt-143 Culling Proof',
    '',
    `Generated: ${summary.createdAt}`,
    `Source SHA: ${summary.sourceGitSha}`,
    `Status: ${summary.status.toUpperCase()}`,
    '',
    '## Measurement Trust',
    '',
    `Status: ${summary.measurementTrust.status.toUpperCase()}`,
    summary.measurementTrust.summary,
    '',
    '| Flag | Value |',
    '| --- | --- |',
    ...Object.entries(summary.measurementTrust.flags).map(([key, value]) => `| ${key} | ${String(value)} |`),
    '',
    '## Category Coverage',
    '',
    '| Category | Present | Visible Triangles | Draw-Call-Like |',
    '| --- | --- | ---: | ---: |',
    ...summary.categoryCoverage.map((entry) =>
      `| ${entry.category} | ${entry.present ? 'yes' : 'no'} | ${entry.visibleTriangles} | ${entry.drawCallLike} |`
    ),
    '',
    '## Files',
    '',
    `- Screenshot: ${summary.files.screenshot}`,
    `- Scene attribution: ${summary.files.sceneAttribution}`,
    `- Renderer info: ${summary.files.rendererInfo}`,
    `- CPU profile: ${summary.files.cpuProfile ?? 'not captured'}`,
    '',
  ];
  writeFileSync(file, lines.join('\n'), 'utf-8');
}

async function main(): Promise<void> {
  const outputDir = parseOutputDir();
  mkdirSync(outputDir, { recursive: true });

  const headed = process.argv.includes('--headed');
  const { server, port } = await startServer(parsePort());
  const url = `http://127.0.0.1:${port}/`;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let cdp: CDPSession | null = null;
  const browserErrors: string[] = [];
  const browserWarnings: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  let cpuProfileCaptured = false;

  try {
    browser = await chromium.launch({
      headless: !headed,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--enable-precise-memory-info',
      ],
    });
    context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    page.on('console', (message) => {
      const text = message.text();
      if (message.type() === 'error') browserErrors.push(text);
      if (message.type() === 'warning') browserWarnings.push(text);
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.stack ? `${error.message}\n${error.stack}` : error.message);
    });
    page.on('requestfailed', (request) => {
      if (request.resourceType() !== 'image' || !request.url().endsWith('/favicon.ico')) {
        requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`);
      }
    });

    cdp = await context.newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const ready = (window as any).__projekt143CullingProofReady;
      return ready?.ok === true || ready?.ok === false;
    });
    const ready = await page.evaluate(() => (window as any).__projekt143CullingProofReady);
    if (!ready?.ok) {
      throw new Error(`Culling proof fixture failed: ${ready?.error ?? 'unknown error'}`);
    }

    const probeRoundTripMs = await probeRoundTrip(page);
    const sceneAttribution = await page.evaluate(PROJEKT_143_SCENE_ATTRIBUTION_EVALUATE_SOURCE) as SceneAttributionEntry[] | null;
    const rendererInfo = await page.evaluate(() => {
      const proofRenderer = (window as any).__renderer;
      return proofRenderer?.renderFrameForStats?.() ?? proofRenderer?.getPerformanceStats?.() ?? null;
    }) as RendererInfo | null;
    const perfEntries = await page.evaluate(() => (window as any).__projekt143PerfEntries ?? null) as {
      longTasks?: unknown[];
      loafs?: unknown[];
    } | null;
    const userAgent = await page.evaluate(() => navigator.userAgent);

    const screenshotFile = join(outputDir, 'culling-proof.png');
    const sceneAttributionFile = join(outputDir, 'scene-attribution.json');
    const rendererInfoFile = join(outputDir, 'renderer-info.json');
    const cpuProfileFile = join(outputDir, 'cpu-profile.json');
    await page.screenshot({ path: screenshotFile, fullPage: false });
    writeFileSync(sceneAttributionFile, JSON.stringify(sceneAttribution, null, 2), 'utf-8');
    writeFileSync(rendererInfoFile, JSON.stringify(rendererInfo, null, 2), 'utf-8');

    const profileResult = await cdp.send('Profiler.stop');
    writeFileSync(cpuProfileFile, JSON.stringify(profileResult.profile ?? profileResult, null, 2), 'utf-8');
    cpuProfileCaptured = existsSync(cpuProfileFile);

    const coverage = categoryCoverage(sceneAttribution);
    const measurementTrust = buildMeasurementTrust({
      browserErrors,
      browserWarnings,
      pageErrors,
      requestFailures,
      perfEntries,
      cpuProfileCaptured,
      rendererInfo,
      sceneAttribution,
      coverage,
      probeRoundTripMs,
    });
    const summaryFile = join(outputDir, 'summary.json');
    const markdownFile = join(outputDir, 'summary.md');
    const summary: ProofSummary = {
      createdAt: new Date().toISOString(),
      sourceGitSha: gitSha(),
      mode: 'cycle2-culling-scene-attribution-proof',
      status: measurementTrust.status,
      url,
      artifactDir: rel(outputDir) ?? outputDir,
      viewport: VIEWPORT,
      browser: {
        headed,
        version: browser.version(),
        userAgent,
      },
      fixture: {
        assets: FIXTURE_ASSETS,
        notes: [
          'This is a deterministic renderer/scene-attribution proof, not a gameplay perf baseline.',
          'The fixture screenshot is not runtime scale evidence; GLB categories are scaled by longest bounding-box axis only to keep all proof categories visible in one camera.',
          'GLB categories use current runtime assets and modelPath-based classification.',
          'Imposter categories use shader-uniform proxies matching the runtime classifier until matched screenshot evidence is added.',
        ],
      },
      files: {
        summary: rel(summaryFile) ?? summaryFile,
        markdown: rel(markdownFile) ?? markdownFile,
        screenshot: rel(screenshotFile) ?? screenshotFile,
        sceneAttribution: rel(sceneAttributionFile) ?? sceneAttributionFile,
        rendererInfo: rel(rendererInfoFile) ?? rendererInfoFile,
        cpuProfile: rel(cpuProfileFile),
      },
      rendererInfo,
      categoryCoverage: coverage,
      browserErrors,
      browserWarnings,
      pageErrors,
      requestFailures,
      measurementTrust,
    };
    writeFileSync(summaryFile, JSON.stringify(summary, null, 2), 'utf-8');
    writeMarkdown(summary, markdownFile);

    console.log(`Projekt 143 culling proof ${summary.status.toUpperCase()}: ${rel(summaryFile)}`);
    for (const entry of coverage) {
      console.log(`- ${entry.category}: visibleTriangles=${entry.visibleTriangles} drawCallLike=${entry.drawCallLike}`);
    }
    if (summary.status !== 'pass' && process.argv.includes('--strict')) {
      process.exitCode = 1;
    }
  } finally {
    await cdp?.send('Profiler.stop').catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await closeServer(server);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
