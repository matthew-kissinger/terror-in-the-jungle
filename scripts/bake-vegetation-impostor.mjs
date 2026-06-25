// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger
//
// Standalone octahedral impostor baker for the engine-agnostic vegetation library.
//
// WHY STANDALONE: scripts/bake-static-impostor-atlases.ts is archetype-driven — it
// only bakes GLBs registered in the FENCED src/config/staticImpostorArchetypes.ts and
// loads them from the engine's /models/ route. Baking a vegetation-library asset
// through it would require registering the asset in that fenced engine registry, which
// the vegetation-library task forbids. This tool reuses the SAME orthographic
// azimuth x elevation capture math (MeshBasicMaterial base color + MeshNormalMaterial
// + MeshDepthMaterial passes into an N-column x M-row atlas) but drives it against a
// GLB served straight from public/assets/vegetation/<id>/ by the standalone
// http-server at :8765 — no engine registry, no fenced files touched.
//
// SELF-CONTAINED: at startup it writes a tiny throwaway three.js bake page plus a
// same-origin copy of the three.js modules it needs into public/_bake/ (the plain
// http-server does NOT serve /node_modules, and bare 'three' specifiers need an
// import map resolved to a served path). It removes public/_bake/ on exit.
//
// PREREQUISITE: the dev http-server must be serving public/ at the --base origin
// (default http://localhost:8765).
//
// Usage:
//   node scripts/bake-vegetation-impostor.mjs \
//     --url http://localhost:8765/assets/vegetation/jungle-tree/jungle-tree.glb \
//     --out public/assets/vegetation/jungle-tree/impostor \
//     --columns 8 --rows 3 --tile 256
//
// Writes atlas.base-color.png, atlas.normal.png, atlas.depth.png and metadata.json
// into --out, and prints the captured mesh bounds (for the descriptor) to stdout.

import { chromium } from 'playwright';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

const BASE = arg('base', 'http://localhost:8765');
const MODEL_URL = arg('url', `${BASE}/assets/vegetation/jungle-tree/jungle-tree.glb`);
const OUT_DIR = resolve(process.cwd(), arg('out', 'public/assets/vegetation/jungle-tree/impostor'));
const COLUMNS = Number(arg('columns', '8'));
const ROWS = Number(arg('rows', '3'));
const TILE = Number(arg('tile', '256'));
const TIMEOUT = 120_000;

const PUBLIC = resolve(process.cwd(), 'public');
const BAKE_DIR = join(PUBLIC, '_bake');
const VENDOR = join(BAKE_DIR, 'vendor', 'three');
const NM = resolve(process.cwd(), 'node_modules', 'three');

// Elevation rows from grazing to near-overhead, reported in metadata.
const ELEVATION_ROWS_DEG = [14, 43, 72];

const BAKE_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script type="importmap">
{ "imports": {
  "three": "/_bake/vendor/three/build/three.module.js",
  "three/addons/": "/_bake/vendor/three/examples/jsm/"
} }
</scr`+`ipt>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const box = new THREE.Box3();
const center = new THREE.Vector3();
const size = new THREE.Vector3();
const direction = new THREE.Vector3();
const target = new THREE.Vector3();

function loadModel(url) {
  return new Promise((res, rej) => loader.load(url, (g) => res(g.scene), undefined, rej));
}
function normalizeForPlacement(root) {
  root.updateMatrixWorld(true);
  box.setFromObject(root); box.getCenter(center);
  root.position.x -= center.x; root.position.z -= center.z; root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
}
function materialArray(m) { return Array.isArray(m) ? m : [m]; }
function makeBaseColorMaterial(s) {
  const m = new THREE.MeshBasicMaterial({
    color: s && s.color instanceof THREE.Color ? s.color : new THREE.Color(0xffffff),
    map: (s && s.map) || null,
    transparent: Boolean(s && s.transparent) || Number((s && s.opacity) ?? 1) < 1,
    opacity: Number((s && s.opacity) ?? 1),
    alphaTest: Number((s && s.alphaTest) ?? 0),
    side: (s && s.side) || THREE.FrontSide,
    depthWrite: s ? s.depthWrite : true, depthTest: s ? s.depthTest : true,
  });
  if (m.transparent && m.alphaTest === 0) m.alphaTest = 0.35;
  return m;
}
function applyBaseColorMaterials(root) {
  const recs = [];
  root.traverse((c) => {
    if (!c.isMesh) return;
    recs.push({ mesh: c, material: c.material });
    const conv = materialArray(c.material).map(makeBaseColorMaterial);
    c.material = Array.isArray(c.material) ? conv : conv[0];
  });
  return () => { for (const r of recs) { const t = materialArray(r.mesh.material); r.mesh.material = r.material; for (const x of t) x.dispose(); } };
}
function makeAtlasCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { alpha: true }); ctx.clearRect(0, 0, w, h); return { canvas: c, ctx };
}
function elevationForRow(row, rows) {
  if (rows <= 1) return THREE.MathUtils.degToRad(35);
  const high = THREE.MathUtils.degToRad(72), low = THREE.MathUtils.degToRad(14);
  return high + (low - high) * (row / (rows - 1));
}
function drawAtlasPass(o) {
  const { scene, renderer, camera, sourceCanvas, atlas, columns, rows, tileW, tileH, bounds } = o;
  const distance = Math.max(bounds.radius * 4, 8);
  for (let row = 0; row < rows; row++) {
    const elev = elevationForRow(row, rows), horiz = Math.cos(elev);
    for (let col = 0; col < columns; col++) {
      const az = (col / columns) * Math.PI * 2;
      direction.set(Math.cos(az) * horiz, Math.sin(elev), Math.sin(az) * horiz).normalize();
      target.fromArray(bounds.center);
      camera.position.copy(target).addScaledVector(direction, distance);
      camera.up.set(0, 1, 0); camera.lookAt(target); camera.updateMatrixWorld(true);
      renderer.clear(true, true, true); renderer.render(scene, camera);
      atlas.ctx.drawImage(sourceCanvas, col * tileW, row * tileH, tileW, tileH);
    }
  }
}
window.__bakeImpostor = async function (cfg) {
  const { url, columns, rows, tileW, tileH } = cfg;
  const atlasW = columns * tileW, atlasH = rows * tileH;
  const root = await loadModel(url);
  normalizeForPlacement(root);
  root.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; c.frustumCulled = false; } });
  box.setFromObject(root); box.getCenter(center); box.getSize(size);
  const planeWidth = Math.max(Math.hypot(size.x, size.z), 0.1);
  const planeHeight = Math.max(size.y, 0.1);
  const pad = 1.08;
  const radius = Math.max(size.length() * 0.5, 0.1);
  const scene = new THREE.Scene(); scene.add(root);
  const camera = new THREE.OrthographicCamera(
    -planeWidth * pad * 0.5, planeWidth * pad * 0.5, planeHeight * pad * 0.5, -planeHeight * pad * 0.5,
    0.01, Math.max(radius * 10, 100));
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(tileW, tileH, false);
  renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);
  const baseAtlas = makeAtlasCanvas(atlasW, atlasH);
  const normalAtlas = makeAtlasCanvas(atlasW, atlasH);
  const depthAtlas = makeAtlasCanvas(atlasW, atlasH);
  const bounds = { center: [center.x, center.y, center.z], size: [size.x, size.y, size.z], radius };
  const shared = { scene, renderer, camera, sourceCanvas: renderer.domElement, columns, rows, tileW, tileH, bounds };
  const restore = applyBaseColorMaterials(root);
  drawAtlasPass({ ...shared, atlas: baseAtlas }); restore();
  const nMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  scene.overrideMaterial = nMat; drawAtlasPass({ ...shared, atlas: normalAtlas }); nMat.dispose();
  const dMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking, side: THREE.DoubleSide });
  scene.overrideMaterial = dMat; drawAtlasPass({ ...shared, atlas: depthAtlas }); dMat.dispose();
  scene.overrideMaterial = null;
  renderer.dispose(); renderer.domElement.remove(); scene.remove(root);
  return {
    baseColorPng: baseAtlas.canvas.toDataURL('image/png'),
    normalPng: normalAtlas.canvas.toDataURL('image/png'),
    depthPng: depthAtlas.canvas.toDataURL('image/png'),
    bounds, atlasSize: [atlasW, atlasH], tileSize: [tileW, tileH], columns, rows,
  };
};
window.__impostorBakerReady = true;
</scr`+`ipt></body></html>
`;

function writeScratch() {
  rmSync(BAKE_DIR, { recursive: true, force: true });
  mkdirSync(join(VENDOR, 'build'), { recursive: true });
  mkdirSync(join(VENDOR, 'examples', 'jsm', 'loaders'), { recursive: true });
  mkdirSync(join(VENDOR, 'examples', 'jsm', 'utils'), { recursive: true });
  cpSync(join(NM, 'build', 'three.module.js'), join(VENDOR, 'build', 'three.module.js'));
  cpSync(join(NM, 'build', 'three.core.js'), join(VENDOR, 'build', 'three.core.js'));
  cpSync(join(NM, 'examples', 'jsm', 'loaders', 'GLTFLoader.js'), join(VENDOR, 'examples', 'jsm', 'loaders', 'GLTFLoader.js'));
  cpSync(join(NM, 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js'), join(VENDOR, 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js'));
  cpSync(join(NM, 'examples', 'jsm', 'utils', 'SkeletonUtils.js'), join(VENDOR, 'examples', 'jsm', 'utils', 'SkeletonUtils.js'));
  writeFileSync(join(BAKE_DIR, 'impostor-bake.html'), BAKE_HTML, 'utf-8');
}

function writeDataUrlPng(dataUrl, path) {
  writeFileSync(path, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

async function main() {
  writeScratch();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[page:error] ${m.text()}`); });
  page.on('pageerror', (e) => console.error(`[pageerror] ${e.message}`));
  try {
    await page.goto(`${BASE}/_bake/impostor-bake.html`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForFunction(() => Boolean(window.__impostorBakerReady), undefined, { timeout: TIMEOUT });
    const result = await page.evaluate((c) => window.__bakeImpostor(c), { url: MODEL_URL, columns: COLUMNS, rows: ROWS, tileW: TILE, tileH: TILE });

    mkdirSync(OUT_DIR, { recursive: true });
    writeDataUrlPng(result.baseColorPng, join(OUT_DIR, 'atlas.base-color.png'));
    writeDataUrlPng(result.normalPng, join(OUT_DIR, 'atlas.normal.png'));
    writeDataUrlPng(result.depthPng, join(OUT_DIR, 'atlas.depth.png'));
    writeFileSync(join(OUT_DIR, 'metadata.json'), `${JSON.stringify({
      generator: 'scripts/bake-vegetation-impostor.mjs',
      generatedAt: new Date().toISOString(),
      modelUrl: MODEL_URL,
      columns: result.columns, rows: result.rows,
      tileSize: result.tileSize, atlasSize: result.atlasSize,
      projection: 'octahedral-upper-hemisphere',
      elevationRowsDeg: ELEVATION_ROWS_DEG.slice(0, result.rows),
      bounds: result.bounds,
    }, null, 2)}\n`, 'utf-8');

    console.log('BAKE_OK');
    console.log(JSON.stringify({ bounds: result.bounds, atlasSize: result.atlasSize, out: OUT_DIR }, null, 2));
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    rmSync(BAKE_DIR, { recursive: true, force: true });
  }
}

main().catch((e) => {
  rmSync(BAKE_DIR, { recursive: true, force: true });
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
