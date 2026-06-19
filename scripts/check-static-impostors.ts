#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Static authored-asset impostor smoke proof.
 *
 * Builds a deterministic browser fixture from the registered static impostor
 * archetypes, renders authored meshes and promoted impostors, then records:
 * - draw-call / triangle deltas
 * - screenshot SSIM at the promotion-boundary view
 *
 * Output: artifacts/static-impostors/<timestamp>/
 */

import { chromium, type Browser, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { getStaticImpostorArchetypes } from '../src/config/staticImpostorArchetypes';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9239;
const STARTUP_TIMEOUT_MS = 120_000;
const VIEWPORT = { width: 960, height: 540 };
const SSIM_THRESHOLD = 0.9;
const SYSTEM_CHROME_CANDIDATES = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
] as const;

interface RenderStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
}

interface BrowserSmokeResult {
  baseline: {
    dense: RenderStats;
    parity: RenderStats;
    densePng: string;
    parityPng: string;
  };
  candidate: {
    dense: RenderStats;
    parity: RenderStats;
    densePng: string;
    parityPng: string;
    debugInfo: unknown;
  };
}

interface StaticImpostorSmokeReport {
  status: 'PASS' | 'FAIL';
  generatedAt: string;
  machineNote: string;
  thresholds: {
    ssim: number;
  };
  metrics: {
    dense: {
      baseline: RenderStats;
      candidate: RenderStats;
      drawCallDelta: number;
      triangleDelta: number;
      drawCallReductionPercent: number;
      triangleReductionPercent: number;
    };
    promotionBoundary: {
      ssim: number;
      baseline: RenderStats;
      candidate: RenderStats;
    };
  };
  files: {
    baselineDense: string;
    candidateDense: string;
    baselinePromotionBoundary: string;
    candidatePromotionBoundary: string;
    summary: string;
  };
  notes: string[];
}

const BROWSER_SMOKE_SOURCE = String.raw`
import * as THREE from '/node_modules/three/build/three.module.js';
import { WebGLNodesHandler } from '/node_modules/three/examples/jsm/tsl/WebGLNodesHandler.js';
import { modelLoader } from '/src/systems/assets/ModelLoader.ts';
import { prepareModelForPlacement } from '/src/systems/assets/ModelPlacementUtils.ts';
import { StaticImpostorSystem } from '/src/systems/world/staticImpostors/StaticImpostorSystem.ts';
import { getStaticImpostorArchetypes } from '/src/config/staticImpostorArchetypes.ts';
import { lightingRigBindings } from '/src/systems/environment/LightingRig.ts';

const STRUCTURE_SCALE = 2.5;
const DENSE_COPIES_PER_ARCHETYPE = 14;
const box = new THREE.Box3();

function configureNeutralRig() {
  lightingRigBindings.sunDirection.value.set(0, 1, 0);
  lightingRigBindings.sunRadiance.value.setRGB(0, 0, 0);
  lightingRigBindings.skyIrradiance.value.setRGB(1, 1, 1);
  lightingRigBindings.groundIrradiance.value.setRGB(1, 1, 1);
  lightingRigBindings.ambientRadiance.value.setRGB(0, 0, 0);
  lightingRigBindings.exposure.value = 1;
  lightingRigBindings.sunElevationSin.value = 1;
}

function materialArray(material) {
  return Array.isArray(material) ? material : [material];
}

function makeBaseColorMaterial(source) {
  return new THREE.MeshBasicMaterial({
    color: source?.color instanceof THREE.Color ? source.color : new THREE.Color(0xffffff),
    map: source?.map ?? null,
    transparent: Boolean(source?.transparent) || Number(source?.opacity ?? 1) < 1,
    opacity: Number(source?.opacity ?? 1),
    alphaTest: Number(source?.alphaTest ?? 0),
    side: source?.side ?? THREE.FrontSide,
    depthWrite: source?.depthWrite ?? true,
    depthTest: source?.depthTest ?? true,
  });
}

function forceBaseColorMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const materials = materialArray(child.material).map((material) => makeBaseColorMaterial(material));
    child.material = Array.isArray(child.material) ? materials : materials[0];
  });
}

async function makeObject(archetype, position) {
  const object = await modelLoader.loadModel(archetype.modelPath);
  prepareModelForPlacement(object, archetype.modelPath);
  object.scale.multiplyScalar(STRUCTURE_SCALE);
  object.position.copy(position);
  object.updateMatrixWorld(true);
  forceBaseColorMaterials(object);
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = false;
    }
  });
  return object;
}

function createRenderer() {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setNodesHandler?.(new WebGLNodesHandler());
  renderer.setPixelRatio(1);
  renderer.setSize(${VIEWPORT.width}, ${VIEWPORT.height}, false);
  renderer.setClearColor(0x6f786f, 1);
  renderer.info.autoReset = false;
  document.body.innerHTML = '';
  document.body.appendChild(renderer.domElement);
  return renderer;
}

function createCamera() {
  const camera = new THREE.PerspectiveCamera(40, ${VIEWPORT.width} / ${VIEWPORT.height}, 0.1, 900);
  camera.position.set(0, 22, 0);
  camera.lookAt(0, 7, -250);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function renderScene(renderer, scene, camera) {
  renderer.info.reset();
  renderer.render(scene, camera);
  return {
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
  };
}

async function waitForImpostors(system, expected) {
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    system.update(0.016);
    const debug = system.getDebugInfo();
    if (debug.activeImpostors >= expected) return debug;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  return system.getDebugInfo();
}

async function createDenseScene({ useImpostors }) {
  const scene = new THREE.Scene();
  const camera = createCamera();
  const renderer = createRenderer();
  const archetypes = getStaticImpostorArchetypes();
  const system = useImpostors ? new StaticImpostorSystem(scene, camera, { batchCapacity: 256 }) : null;
  let instanceIndex = 0;
  for (let archetypeIndex = 0; archetypeIndex < archetypes.length; archetypeIndex++) {
    const archetype = archetypes[archetypeIndex];
    for (let copy = 0; copy < DENSE_COPIES_PER_ARCHETYPE; copy++) {
      const x = (copy - (DENSE_COPIES_PER_ARCHETYPE - 1) * 0.5) * 7;
      const z = -250 - archetypeIndex * 12 - (copy % 3) * 4;
      const object = await makeObject(archetype, new THREE.Vector3(x, 0, z));
      scene.add(object);
      if (system) {
        system.registerInstance({
          id: 'dense_' + instanceIndex,
          modelPath: archetype.modelPath,
          object,
        });
      }
      instanceIndex++;
    }
  }
  const debugInfo = system ? await waitForImpostors(system, instanceIndex) : null;
  const stats = renderScene(renderer, scene, camera);
  const png = renderer.domElement.toDataURL('image/png');
  system?.dispose();
  renderer.dispose();
  renderer.domElement.remove();
  return { stats, png, debugInfo };
}

async function createParityScene({ useImpostors }) {
  const scene = new THREE.Scene();
  const camera = createCamera();
  const renderer = createRenderer();
  const archetype = getStaticImpostorArchetypes().find((entry) => entry.slug === 'guard-tower')
    ?? getStaticImpostorArchetypes()[0];
  const system = useImpostors ? new StaticImpostorSystem(scene, camera, { batchCapacity: 16 }) : null;
  const object = await makeObject(archetype, new THREE.Vector3(0, 0, -(archetype.promotionDistanceMeters + 8)));
  scene.add(object);
  if (system) {
    system.registerInstance({
      id: 'parity_boundary',
      modelPath: archetype.modelPath,
      object,
    });
    await waitForImpostors(system, 1);
  }
  box.setFromObject(object);
  const target = box.getCenter(new THREE.Vector3());
  camera.position.set(0, target.y + 16, target.z + archetype.promotionDistanceMeters + 8);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  system?.update(0.016);
  const stats = renderScene(renderer, scene, camera);
  const png = renderer.domElement.toDataURL('image/png');
  system?.dispose();
  renderer.dispose();
  renderer.domElement.remove();
  return { stats, png, debugInfo: system?.getDebugInfo?.() ?? null };
}

window.__runStaticImpostorSmoke = async function runStaticImpostorSmoke() {
  configureNeutralRig();
  const baselineDense = await createDenseScene({ useImpostors: false });
  const candidateDense = await createDenseScene({ useImpostors: true });
  const baselineParity = await createParityScene({ useImpostors: false });
  const candidateParity = await createParityScene({ useImpostors: true });
  return {
    baseline: {
      dense: baselineDense.stats,
      parity: baselineParity.stats,
      densePng: baselineDense.png,
      parityPng: baselineParity.png,
    },
    candidate: {
      dense: candidateDense.stats,
      parity: candidateParity.stats,
      densePng: candidateDense.png,
      parityPng: candidateParity.png,
      debugInfo: candidateDense.debugInfo,
    },
  };
};
window.__staticImpostorSmokeReady = true;
`;

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] [static-impostor-smoke] ${message}`);
}

function resolveChromiumExecutablePath(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicit && existsSync(explicit)) {
    return explicit;
  }
  return SYSTEM_CHROME_CANDIDATES.find((path) => existsSync(path));
}

function pngBufferFromDataUrl(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
}

async function preparePage(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: STARTUP_TIMEOUT_MS });
  await page.addScriptTag({ type: 'module', content: BROWSER_SMOKE_SOURCE });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __staticImpostorSmokeReady?: boolean }).__staticImpostorSmokeReady),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS },
  );
}

async function runBrowserSmoke(page: Page): Promise<BrowserSmokeResult> {
  return await page.evaluate(async () => {
    const runSmoke = (window as unknown as {
      __runStaticImpostorSmoke?: () => Promise<BrowserSmokeResult>;
    }).__runStaticImpostorSmoke;
    if (!runSmoke) {
      throw new Error('static impostor smoke fixture is not ready');
    }
    return await runSmoke();
  });
}

async function computeSsim(aPng: Buffer, bPng: Buffer): Promise<number> {
  const a = await sharp(aPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(bPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    throw new Error('SSIM inputs have different dimensions');
  }

  const pixels = a.info.width * a.info.height;
  let sumA = 0;
  let sumB = 0;
  const lumaA = new Float64Array(pixels);
  const lumaB = new Float64Array(pixels);
  for (let index = 0; index < pixels; index++) {
    const offset = index * 4;
    const ya = 0.2126 * a.data[offset] + 0.7152 * a.data[offset + 1] + 0.0722 * a.data[offset + 2];
    const yb = 0.2126 * b.data[offset] + 0.7152 * b.data[offset + 1] + 0.0722 * b.data[offset + 2];
    lumaA[index] = ya;
    lumaB[index] = yb;
    sumA += ya;
    sumB += yb;
  }
  const meanA = sumA / pixels;
  const meanB = sumB / pixels;
  let varA = 0;
  let varB = 0;
  let cov = 0;
  for (let index = 0; index < pixels; index++) {
    const da = lumaA[index] - meanA;
    const db = lumaB[index] - meanB;
    varA += da * da;
    varB += db * db;
    cov += da * db;
  }
  const denom = Math.max(1, pixels - 1);
  varA /= denom;
  varB /= denom;
  cov /= denom;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  return ((2 * meanA * meanB + c1) * (2 * cov + c2))
    / ((meanA ** 2 + meanB ** 2 + c1) * (varA + varB + c2));
}

function reductionPercent(baseline: number, candidate: number): number {
  if (baseline <= 0) {
    return 0;
  }
  return ((baseline - candidate) / baseline) * 100;
}

async function main(): Promise<void> {
  if (getStaticImpostorArchetypes().length === 0) {
    throw new Error('No static impostor archetypes are registered');
  }

  const outDir = join(process.cwd(), 'artifacts', 'static-impostors', timestampSlug());
  mkdirSync(outDir, { recursive: true });

  let server: ServerHandle | null = null;
  let browser: Browser | null = null;
  try {
    server = await startServer({
      mode: 'dev',
      port: PORT,
      startupTimeoutMs: STARTUP_TIMEOUT_MS,
      log,
    });
    const executablePath = resolveChromiumExecutablePath();
    if (executablePath) {
      log(`using Chromium executable ${executablePath}`);
    }
    browser = await chromium.launch({ headless: !process.argv.includes('--headed'), executablePath });
    const page = await browser.newPage({ viewport: VIEWPORT });
    await preparePage(page, `http://127.0.0.1:${server.port}`);
    const smoke = await runBrowserSmoke(page);

    const baselineDensePng = pngBufferFromDataUrl(smoke.baseline.densePng);
    const candidateDensePng = pngBufferFromDataUrl(smoke.candidate.densePng);
    const baselineParityPng = pngBufferFromDataUrl(smoke.baseline.parityPng);
    const candidateParityPng = pngBufferFromDataUrl(smoke.candidate.parityPng);
    const files = {
      baselineDense: join(outDir, 'baseline-dense.png'),
      candidateDense: join(outDir, 'candidate-dense.png'),
      baselinePromotionBoundary: join(outDir, 'baseline-promotion-boundary.png'),
      candidatePromotionBoundary: join(outDir, 'candidate-promotion-boundary.png'),
      summary: join(outDir, 'summary.json'),
    };
    writeFileSync(files.baselineDense, baselineDensePng);
    writeFileSync(files.candidateDense, candidateDensePng);
    writeFileSync(files.baselinePromotionBoundary, baselineParityPng);
    writeFileSync(files.candidatePromotionBoundary, candidateParityPng);

    const ssim = await computeSsim(baselineParityPng, candidateParityPng);
    const drawCallDelta = smoke.candidate.dense.drawCalls - smoke.baseline.dense.drawCalls;
    const triangleDelta = smoke.candidate.dense.triangles - smoke.baseline.dense.triangles;
    const notes = [
      'Fixture uses real authored GLBs from staticImpostorArchetypes; it does not generate vegetation or new scenery.',
      'Baseline path is authored meshes in a dense deterministic fixture; candidate path is the registered static-impostor runtime.',
      'Laptop-local smoke proof only; use same-machine before/after captures for performance claims.',
      `Candidate dense debug: ${JSON.stringify(smoke.candidate.debugInfo)}`,
    ];
    const failed = [
      drawCallDelta >= 0 ? `draw calls did not reduce (${smoke.baseline.dense.drawCalls} -> ${smoke.candidate.dense.drawCalls})` : null,
      triangleDelta >= 0 ? `triangles did not reduce (${smoke.baseline.dense.triangles} -> ${smoke.candidate.dense.triangles})` : null,
      ssim < SSIM_THRESHOLD ? `promotion-boundary SSIM ${ssim.toFixed(4)} below ${SSIM_THRESHOLD}` : null,
    ].filter((entry): entry is string => Boolean(entry));

    const report: StaticImpostorSmokeReport = {
      status: failed.length === 0 ? 'PASS' : 'FAIL',
      generatedAt: new Date().toISOString(),
      machineNote: 'Captured on the current laptop; absolute perf numbers are hardware-local.',
      thresholds: { ssim: SSIM_THRESHOLD },
      metrics: {
        dense: {
          baseline: smoke.baseline.dense,
          candidate: smoke.candidate.dense,
          drawCallDelta,
          triangleDelta,
          drawCallReductionPercent: reductionPercent(smoke.baseline.dense.drawCalls, smoke.candidate.dense.drawCalls),
          triangleReductionPercent: reductionPercent(smoke.baseline.dense.triangles, smoke.candidate.dense.triangles),
        },
        promotionBoundary: {
          ssim,
          baseline: smoke.baseline.parity,
          candidate: smoke.candidate.parity,
        },
      },
      files: {
        baselineDense: relative(process.cwd(), files.baselineDense),
        candidateDense: relative(process.cwd(), files.candidateDense),
        baselinePromotionBoundary: relative(process.cwd(), files.baselinePromotionBoundary),
        candidatePromotionBoundary: relative(process.cwd(), files.candidatePromotionBoundary),
        summary: relative(process.cwd(), files.summary),
      },
      notes: failed.length > 0 ? [...notes, ...failed] : notes,
    };
    writeFileSync(files.summary, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

    console.log(`Static impostor smoke ${report.status}: ${report.files.summary}`);
    console.log(`Draw calls: ${smoke.baseline.dense.drawCalls} -> ${smoke.candidate.dense.drawCalls}`);
    console.log(`Triangles: ${smoke.baseline.dense.triangles} -> ${smoke.candidate.dense.triangles}`);
    console.log(`Promotion-boundary SSIM: ${ssim.toFixed(4)}`);
    if (failed.length > 0) {
      process.exit(1);
    }
  } finally {
    await browser?.close().catch(() => undefined);
    if (server) {
      await stopServer(server);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
