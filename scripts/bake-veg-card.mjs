// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger
//
// Standalone ground-CARD baker for the engine-agnostic vegetation library.
//
// WHY A CARD (not an octahedral impostor): dense ground cover (ferns, taro,
// rice) never warrants a multi-frame octahedral atlas — past ~12-25m a low plant
// is indistinguishable from a single flat alpha quad. This tool bakes ONE
// front-view alpha card (+ a view-space normal map) from a normalized GLB. The
// runtime instances that card on a shared geometry/atlas (optionally as a
// perpendicular cross-quad reusing the same atlas), so thousands of plants cost
// one draw + one texture instead of one GLB clone each.
//
// Mirrors scripts/bake-vegetation-impostor.mjs (Playwright + offscreen WebGL,
// deterministic, prints a clear OK marker) but captures a SINGLE frame and is
// SELF-HOSTED: it spins up a tiny node:http static server for public/ on a free
// port so the GLB + the throwaway three.js bake page are same-origin (the bare
// 'three' specifier needs an import map resolved to a served path, and node has
// no http-server binary). It writes public/_bake/ at startup and removes it on
// exit.
//
// Usage:
//   node scripts/bake-veg-card.mjs
//   node scripts/bake-veg-card.mjs --ids understory-fern,taro-elephant-ear,rice-paddy
//   node scripts/bake-veg-card.mjs --ids understory-fern --tile 512 --elevation 12
//
// For each id it writes, under public/assets/vegetation/<id>/card/:
//   atlas.base-color.png   front-view unlit base colour, alpha = silhouette
//   atlas.normal.png       view-space normal map (RGB), same framing
//   metadata.json          worldSize [w,h] + bounds + capture params (for the catalog)
// and prints the captured worldSize/bounds (for the descriptor) to stdout.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

const IDS = arg('ids', 'understory-fern,taro-elephant-ear,rice-paddy')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_TILE = Number(arg('tile', '512'));
const ELEVATION_DEG = Number(arg('elevation', '12'));
const TIMEOUT = 120_000;

const PUBLIC = resolve(process.cwd(), 'public');
const BAKE_DIR = join(PUBLIC, '_bake');
const VENDOR = join(BAKE_DIR, 'vendor', 'three');
const NM = resolve(process.cwd(), 'node_modules', 'three');

const CONTENT_TYPES = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.html': 'text/html; charset=utf-8',
  '.bin': 'application/octet-stream',
};

const BAKE_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script type="importmap">
{ "imports": {
  "three": "/_bake/vendor/three/build/three.module.js",
  "three/addons/": "/_bake/vendor/three/examples/jsm/"
} }
</scr` + `ipt>
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
    vertexColors: Boolean(s && s.vertexColors),
    transparent: Boolean(s && s.transparent) || Number((s && s.opacity) ?? 1) < 1,
    opacity: Number((s && s.opacity) ?? 1),
    alphaTest: Number((s && s.alphaTest) ?? 0),
    side: (s && s.side) || THREE.DoubleSide,
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
function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { alpha: true }); ctx.clearRect(0, 0, w, h); return { canvas: c, ctx };
}
function alphaBleedCanvas(canvas, passes = 32) {
  const ctx = canvas.getContext('2d', { alpha: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  let colored = new Uint8Array(canvas.width * canvas.height);
  for (let p = 0, i = 0; p < colored.length; p++, i += 4) colored[p] = data[i + 3] > 0 ? 1 : 0;
  for (let pass = 0; pass < passes; pass++) {
    let filled = 0;
    const next = new Uint8ClampedArray(data);
    const nextColored = new Uint8Array(colored);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const p = y * canvas.width + x;
        if (colored[p]) continue;
        let r = 0, g = 0, b = 0, count = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const ny = y + oy;
          if (ny < 0 || ny >= canvas.height) continue;
          for (let ox = -1; ox <= 1; ox++) {
            if (ox === 0 && oy === 0) continue;
            const nx = x + ox;
            if (nx < 0 || nx >= canvas.width) continue;
            const np = ny * canvas.width + nx;
            if (!colored[np]) continue;
            const ni = np * 4;
            r += data[ni]; g += data[ni + 1]; b += data[ni + 2]; count++;
          }
        }
        if (count > 0) {
          const i = p * 4;
          next[i] = Math.round(r / count);
          next[i + 1] = Math.round(g / count);
          next[i + 2] = Math.round(b / count);
          nextColored[p] = 1;
          filled++;
        }
      }
    }
    if (filled === 0) break;
    data.set(next);
    colored = nextColored;
  }
  ctx.putImageData(image, 0, 0);
}
window.__bakeCard = async function (cfg) {
  const { url, maxTile, elevationDeg } = cfg;
  const root = await loadModel(url);
  normalizeForPlacement(root);
  root.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; c.frustumCulled = false; } });
  box.setFromObject(root); box.getCenter(center); box.getSize(size);
  const planeWidth = Math.max(Math.hypot(size.x, size.z), 0.1);
  const planeHeight = Math.max(size.y, 0.1);
  const radius = Math.max(size.length() * 0.5, 0.1);

  // Tile sized to the plane aspect so the texture maps 1:1 onto the runtime card
  // (longest side == maxTile). Even dimensions keep GPU samplers happy.
  let cardW; let cardH;
  if (planeWidth >= planeHeight) { cardW = maxTile; cardH = Math.max(16, Math.round(maxTile * planeHeight / planeWidth)); }
  else { cardH = maxTile; cardW = Math.max(16, Math.round(maxTile * planeWidth / planeHeight)); }
  cardW -= cardW % 2; cardH -= cardH % 2;

  const scene = new THREE.Scene(); scene.add(root);
  const pad = 1.06;
  const camera = new THREE.OrthographicCamera(
    -planeWidth * pad * 0.5, planeWidth * pad * 0.5, planeHeight * pad * 0.5, -planeHeight * pad * 0.5,
    0.01, Math.max(radius * 10, 100));
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(cardW, cardH, false);
  renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  // Front view (asset forward is -Z), lifted by elevationDeg so a low plant reads.
  const elev = THREE.MathUtils.degToRad(elevationDeg);
  const horiz = Math.cos(elev);
  direction.set(0, Math.sin(elev), horiz).normalize();
  const distance = Math.max(radius * 4, 8);
  target.fromArray([center.x, center.y, center.z]);
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.up.set(0, 1, 0); camera.lookAt(target); camera.updateMatrixWorld(true);

  const baseCanvas = makeCanvas(cardW, cardH);
  const normalCanvas = makeCanvas(cardW, cardH);

  const restore = applyBaseColorMaterials(root);
  renderer.clear(true, true, true); renderer.render(scene, camera);
  baseCanvas.ctx.drawImage(renderer.domElement, 0, 0, cardW, cardH);
  restore();

  const nMat = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
  scene.overrideMaterial = nMat;
  renderer.clear(true, true, true); renderer.render(scene, camera);
  normalCanvas.ctx.drawImage(renderer.domElement, 0, 0, cardW, cardH);
  scene.overrideMaterial = null; nMat.dispose();

  alphaBleedCanvas(baseCanvas.canvas);
  alphaBleedCanvas(normalCanvas.canvas);
  renderer.dispose(); renderer.domElement.remove(); scene.remove(root);
  return {
    baseColorPng: baseCanvas.canvas.toDataURL('image/png'),
    normalPng: normalCanvas.canvas.toDataURL('image/png'),
    worldSize: [planeWidth, planeHeight],
    tileSize: [cardW, cardH],
    bounds: { center: [center.x, center.y, center.z], size: [size.x, size.y, size.z], radius },
    elevationDeg,
  };
};
window.__cardBakerReady = true;
</scr` + `ipt></body></html>
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
  writeFileSync(join(BAKE_DIR, 'card-bake.html'), BAKE_HTML, 'utf-8');
}

/** Tiny static file server for public/ — no dependency, correct content types. */
function startStaticServer() {
  const server = createServer((req, res) => {
    try {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = url.replace(/^\/+/, '');
      const filePath = resolve(PUBLIC, rel);
      // Contain to public/ — reject path traversal.
      if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); res.end('forbidden'); return; }
      const body = readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((res) => {
    server.listen(0, '127.0.0.1', () => res({ server, port: server.address().port }));
  });
}

function writeDataUrlPng(dataUrl, path) {
  writeFileSync(path, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
}

async function main() {
  writeScratch();
  const { server, port } = await startStaticServer();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[page:error] ${m.text()}`); });
  page.on('pageerror', (e) => console.error(`[pageerror] ${e.message}`));

  const results = [];
  try {
    await page.goto(`${base}/_bake/card-bake.html`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    await page.waitForFunction(() => Boolean(window.__cardBakerReady), undefined, { timeout: TIMEOUT });

    for (const id of IDS) {
      const modelUrl = `${base}/assets/vegetation/${id}/${id}.glb`;
      const outDir = resolve(PUBLIC, 'assets', 'vegetation', id, 'card');
      const result = await page.evaluate(
        (c) => window.__bakeCard(c),
        { url: modelUrl, maxTile: MAX_TILE, elevationDeg: ELEVATION_DEG },
      );

      mkdirSync(outDir, { recursive: true });
      writeDataUrlPng(result.baseColorPng, join(outDir, 'atlas.base-color.png'));
      writeDataUrlPng(result.normalPng, join(outDir, 'atlas.normal.png'));
      writeFileSync(join(outDir, 'metadata.json'), `${JSON.stringify({
        generator: 'scripts/bake-veg-card.mjs',
        generatedAt: new Date().toISOString(),
        id,
        modelUrl: `/assets/vegetation/${id}/${id}.glb`,
        projection: 'single-front-card',
        crossQuadCapable: true,
        elevationDeg: result.elevationDeg,
        worldSize: result.worldSize,
        tileSize: result.tileSize,
        bounds: result.bounds,
      }, null, 2)}\n`, 'utf-8');

      results.push({ id, worldSize: result.worldSize, tileSize: result.tileSize, bounds: result.bounds });
      console.log(`  baked ${id}: ${result.tileSize[0]}x${result.tileSize[1]} card, world ${result.worldSize[0].toFixed(2)}x${result.worldSize[1].toFixed(2)}m`);
    }

    console.log('CARD_BAKE_OK');
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    server.close();
    rmSync(BAKE_DIR, { recursive: true, force: true });
  }
}

main().catch((e) => {
  rmSync(BAKE_DIR, { recursive: true, force: true });
  console.error(e && e.stack ? e.stack : String(e));
  process.exit(1);
});
