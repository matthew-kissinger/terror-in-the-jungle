#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Offline hemi-octahedral-ish static impostor atlas baker for authored assets.
 *
 * The baker captures registered static GLB archetypes from the upper hemisphere
 * only: azimuth frames around the object and elevation rows from low-to-high
 * camera angles. It writes base-color, normal, and depth atlases plus metadata
 * under `public/assets/static-impostors/<slug>/`.
 *
 * Usage:
 *   npm run assets:bake-static-impostors
 *   npm run assets:bake-static-impostors -- --only fuel-drum,guard-tower
 */

import { chromium, type Browser, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getStaticImpostorArchetypes,
  type StaticImpostorArchetype,
} from '../src/config/staticImpostorArchetypes';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9238;
const STARTUP_TIMEOUT_MS = 120_000;
const OUT_ROOT = join(process.cwd(), 'public', 'assets', 'static-impostors');
const SYSTEM_CHROME_CANDIDATES = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
] as const;

interface BakeAtlasResult {
  slug: string;
  modelPath: string;
  baseColorPng: string;
  normalPng: string;
  depthPng: string;
  metadata: {
    generator: string;
    generatedAt: string;
    slug: string;
    modelPath: string;
    atlasSize: readonly [number, number];
    tileSize: readonly [number, number];
    columns: number;
    rows: number;
    azimuthFrames: number;
    elevationFrames: number;
    planePaddingScale: number;
    bounds: {
      center: [number, number, number];
      size: [number, number, number];
      radius: number;
      plane: { width: number; height: number };
    };
    maps: StaticImpostorArchetype['maps'];
  };
}

const BROWSER_BAKER_SOURCE = String.raw`
import * as THREE from '/node_modules/three/build/three.module.js';
import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const box = new THREE.Box3();
const center = new THREE.Vector3();
const size = new THREE.Vector3();
const direction = new THREE.Vector3();
const target = new THREE.Vector3();

function loadModel(modelPath) {
  return new Promise((resolve, reject) => {
    loader.load(
      '/models/' + modelPath,
      (gltf) => resolve(gltf.scene),
      undefined,
      (error) => reject(error),
    );
  });
}

function normalizeForPlacement(root) {
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  box.getCenter(center);
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
}

function materialArray(material) {
  return Array.isArray(material) ? material : [material];
}

function makeBaseColorMaterial(source) {
  const material = new THREE.MeshBasicMaterial({
    color: source?.color instanceof THREE.Color ? source.color : new THREE.Color(0xffffff),
    map: source?.map ?? null,
    vertexColors: Boolean(source?.vertexColors),
    transparent: Boolean(source?.transparent) || Number(source?.opacity ?? 1) < 1,
    opacity: Number(source?.opacity ?? 1),
    alphaTest: Number(source?.alphaTest ?? 0),
    side: source?.side ?? THREE.FrontSide,
    depthWrite: source?.depthWrite ?? true,
    depthTest: source?.depthTest ?? true,
  });
  material.name = 'StaticImpostorBake_BaseColor';
  return material;
}

function applyBaseColorMaterials(root) {
  const records = [];
  root.traverse((child) => {
    if (!child.isMesh) return;
    records.push({ mesh: child, material: child.material });
    const converted = materialArray(child.material).map((material) => makeBaseColorMaterial(material));
    child.material = Array.isArray(child.material) ? converted : converted[0];
  });
  return () => {
    for (const record of records) {
      const temporary = materialArray(record.mesh.material);
      record.mesh.material = record.material;
      for (const material of temporary) material.dispose();
    }
  };
}

function makeAtlasCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('2D atlas canvas unavailable');
  ctx.clearRect(0, 0, width, height);
  return { canvas, ctx };
}

function elevationForRow(row, rows) {
  if (rows <= 1) return THREE.MathUtils.degToRad(35);
  const high = THREE.MathUtils.degToRad(72);
  const low = THREE.MathUtils.degToRad(14);
  return high + (low - high) * (row / (rows - 1));
}

function drawAtlasPass(options) {
  const {
    scene,
    renderer,
    camera,
    sourceCanvas,
    atlas,
    archetype,
    bounds,
  } = options;
  const columns = archetype.columns;
  const rows = archetype.rows;
  const tileWidth = archetype.tileSize[0];
  const tileHeight = archetype.tileSize[1];
  const radius = bounds.radius;
  const distance = Math.max(radius * 4, 8);

  for (let row = 0; row < rows; row++) {
    const elevation = elevationForRow(row, rows);
    const horizontal = Math.cos(elevation);
    for (let column = 0; column < columns; column++) {
      const azimuth = (column / columns) * Math.PI * 2;
      direction.set(
        Math.cos(azimuth) * horizontal,
        Math.sin(elevation),
        Math.sin(azimuth) * horizontal,
      ).normalize();
      target.fromArray(bounds.center);
      camera.position.copy(target).addScaledVector(direction, distance);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
      camera.updateMatrixWorld(true);

      renderer.clear(true, true, true);
      renderer.render(scene, camera);
      atlas.ctx.drawImage(sourceCanvas, column * tileWidth, row * tileHeight, tileWidth, tileHeight);
    }
  }
}

window.__bakeStaticImpostor = async function bakeStaticImpostor(archetype) {
  const tileWidth = archetype.tileSize[0];
  const tileHeight = archetype.tileSize[1];
  const atlasWidth = archetype.atlasSize[0];
  const atlasHeight = archetype.atlasSize[1];
  if (atlasWidth > archetype.maxTextureSize || atlasHeight > archetype.maxTextureSize) {
    throw new Error('atlas exceeds maxTextureSize for ' + archetype.slug);
  }

  const root = await loadModel(archetype.modelPath);
  normalizeForPlacement(root);
  root.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = false;
    }
  });
  box.setFromObject(root);
  box.getCenter(center);
  box.getSize(size);

  const horizontalPlaneWidth = Math.hypot(size.x, size.z);
  const planeWidth = Math.max(horizontalPlaneWidth, 0.1);
  const planeHeight = Math.max(size.y, 0.1);
  const paddedWidth = planeWidth * archetype.planePaddingScale;
  const paddedHeight = planeHeight * archetype.planePaddingScale;
  const radius = Math.max(size.length() * 0.5, 0.1);

  const scene = new THREE.Scene();
  scene.add(root);
  const camera = new THREE.OrthographicCamera(
    -paddedWidth * 0.5,
    paddedWidth * 0.5,
    paddedHeight * 0.5,
    -paddedHeight * 0.5,
    0.01,
    Math.max(radius * 10, 100),
  );
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(tileWidth, tileHeight, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const baseAtlas = makeAtlasCanvas(atlasWidth, atlasHeight);
  const normalAtlas = makeAtlasCanvas(atlasWidth, atlasHeight);
  const depthAtlas = makeAtlasCanvas(atlasWidth, atlasHeight);
  const bounds = {
    center: [center.x, center.y, center.z],
    size: [size.x, size.y, size.z],
    radius,
    plane: { width: planeWidth, height: planeHeight },
  };
  const shared = { scene, renderer, camera, sourceCanvas: renderer.domElement, archetype, bounds };

  const restore = applyBaseColorMaterials(root);
  drawAtlasPass({ ...shared, atlas: baseAtlas });
  restore();

  const normalMaterial = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  scene.overrideMaterial = normalMaterial;
  drawAtlasPass({ ...shared, atlas: normalAtlas });
  normalMaterial.dispose();

  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.BasicDepthPacking,
    side: THREE.DoubleSide,
  });
  scene.overrideMaterial = depthMaterial;
  drawAtlasPass({ ...shared, atlas: depthAtlas });
  depthMaterial.dispose();
  scene.overrideMaterial = null;

  renderer.dispose();
  renderer.domElement.remove();
  scene.remove(root);

  return {
    slug: archetype.slug,
    modelPath: archetype.modelPath,
    baseColorPng: baseAtlas.canvas.toDataURL('image/png'),
    normalPng: normalAtlas.canvas.toDataURL('image/png'),
    depthPng: depthAtlas.canvas.toDataURL('image/png'),
    metadata: {
      generator: 'scripts/bake-static-impostor-atlases.ts',
      generatedAt: new Date().toISOString(),
      slug: archetype.slug,
      modelPath: archetype.modelPath,
      atlasSize: archetype.atlasSize,
      tileSize: archetype.tileSize,
      columns: archetype.columns,
      rows: archetype.rows,
      azimuthFrames: archetype.azimuthFrames,
      elevationFrames: archetype.elevationFrames,
      planePaddingScale: archetype.planePaddingScale,
      bounds,
      maps: archetype.maps,
    },
  };
};
window.__staticImpostorBakerReady = true;
`;

function parseOnly(): Set<string> | null {
  const eq = process.argv.find((arg) => arg.startsWith('--only='));
  if (eq) {
    return new Set(eq.split('=')[1].split(',').map((value) => value.trim()).filter(Boolean));
  }
  const index = process.argv.indexOf('--only');
  if (index >= 0 && index + 1 < process.argv.length) {
    return new Set(process.argv[index + 1].split(',').map((value) => value.trim()).filter(Boolean));
  }
  return null;
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] [static-impostor-baker] ${message}`);
}

function writeDataUrlPng(dataUrl: string, path: string): void {
  const encoded = dataUrl.replace(/^data:image\/png;base64,/, '');
  writeFileSync(path, Buffer.from(encoded, 'base64'));
}

function resolveChromiumExecutablePath(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicit && existsSync(explicit)) {
    return explicit;
  }
  return SYSTEM_CHROME_CANDIDATES.find((path) => existsSync(path));
}

async function preparePage(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: STARTUP_TIMEOUT_MS });
  await page.addScriptTag({ type: 'module', content: BROWSER_BAKER_SOURCE });
  await page.waitForFunction(
    () => Boolean((window as unknown as { __staticImpostorBakerReady?: boolean }).__staticImpostorBakerReady),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS },
  );
}

async function bakeOne(page: Page, archetype: StaticImpostorArchetype): Promise<BakeAtlasResult> {
  return await page.evaluate(async (input) => {
    const bake = (window as unknown as {
      __bakeStaticImpostor?: (archetype: StaticImpostorArchetype) => Promise<BakeAtlasResult>;
    }).__bakeStaticImpostor;
    if (!bake) {
      throw new Error('static impostor baker is not installed');
    }
    return await bake(input);
  }, archetype);
}

function writeResult(result: BakeAtlasResult): void {
  const dir = join(OUT_ROOT, result.slug);
  mkdirSync(dir, { recursive: true });
  writeDataUrlPng(result.baseColorPng, join(dir, 'atlas.base-color.png'));
  writeDataUrlPng(result.normalPng, join(dir, 'atlas.normal.png'));
  writeDataUrlPng(result.depthPng, join(dir, 'atlas.depth.png'));
  writeFileSync(join(dir, 'metadata.json'), `${JSON.stringify(result.metadata, null, 2)}\n`, 'utf-8');
}

async function main(): Promise<void> {
  const only = parseOnly();
  const archetypes = getStaticImpostorArchetypes()
    .filter((archetype) => !only || only.has(archetype.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  if (archetypes.length === 0) {
    throw new Error('No static impostor archetypes matched the requested filter');
  }

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
    browser = await chromium.launch({
      headless: !process.argv.includes('--headed'),
      executablePath,
    });
    for (const archetype of archetypes) {
      const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
      log(`baking ${archetype.slug} (${archetype.modelPath})`);
      try {
        await preparePage(page, `http://127.0.0.1:${server.port}`);
        const result = await bakeOne(page, archetype);
        writeResult(result);
        log(`wrote ${join('public/assets/static-impostors', result.slug)}`);
      } finally {
        await page.close().catch(() => undefined);
      }
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
