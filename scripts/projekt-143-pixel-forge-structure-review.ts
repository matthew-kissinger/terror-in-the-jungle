#!/usr/bin/env tsx

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import sharp from 'sharp';

type ReviewStatus = 'pass' | 'warn' | 'fail';

interface ModelEntry {
  id: string;
  file: string;
  exists: boolean;
  bytes: number;
  triangles: number | null;
  meshCount: number | null;
  primitiveCount: number | null;
  materialCount: number | null;
  textureCount: number | null;
  nodeCount: number | null;
  animationCount: number | null;
  optimizationRisk: string;
  optimizationReasons: string[];
  role: string;
  status: string;
  notes: string[];
}

interface TerrainAssetInventory {
  status?: string;
  summary?: Record<string, unknown>;
  pixelForgeGalleryBuildingCandidates?: ModelEntry[];
  pixelForgeGalleryGroundVehicleCandidates?: ModelEntry[];
}

interface ReviewEntry extends ModelEntry {
  kind: 'building' | 'ground-vehicle';
  gridFile: string | null;
  gridExists: boolean;
  gridBytes: number;
  generatedGridFile: string | null;
  generatedGridBytes: number;
  reviewGridFile: string | null;
  reviewGridSource: 'pixel-forge-validation' | 'generated-artifact' | 'missing';
}

interface StructureReview {
  createdAt: string;
  source: 'projekt-143-pixel-forge-structure-review';
  status: ReviewStatus;
  inputs: {
    terrainAssetInventory: string | null;
    pixelForgeRoot: string;
    validationGridRoot: string;
  };
  summary: {
    buildingCandidates: number;
    buildingGridCoverage: number;
    groundVehicleCandidates: number;
    groundVehicleGridCoverage: number;
    missingBuildingGrids: number;
    missingGroundVehicleGrids: number;
    orphanBuildingGrids: number;
    orphanGroundVehicleGrids: number;
    generatedGroundVehicleGrids: number;
    highOrMediumOptimizationRisk: number;
  };
  files: {
    json: string;
    markdown: string;
    contactSheet: string | null;
  };
  buildingCandidates: ReviewEntry[];
  groundVehicleCandidates: ReviewEntry[];
  orphanValidationGrids: string[];
  findings: string[];
  nextRequiredWork: string[];
  nonClaims: string[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const PIXEL_FORGE_ROOT = process.env.PIXEL_FORGE_ROOT
  ? process.env.PIXEL_FORGE_ROOT
  : join(process.cwd(), '..', 'pixel-forge');
const GRID_ROOT = join(PIXEL_FORGE_ROOT, 'war-assets', 'validation', '_grids');
const OUTPUT_NAME = 'projekt-143-pixel-forge-structure-review';
const RENDER_MISSING_GROUND_VEHICLES = process.argv.includes('--render-missing-ground-vehicles');
const RENDER_CELL = 400;
const RENDER_PAD = 6;
const RENDER_LABEL_H = 22;
const RENDER_TITLE_H = 32;
const RENDER_VIEWS: Array<{ name: string; pos: [number, number, number] }> = [
  { name: 'Front', pos: [1, 0, 0] },
  { name: 'Right', pos: [0, 0, 1] },
  { name: 'Back', pos: [-1, 0, 0] },
  { name: 'Left', pos: [0, 0, -1] },
  { name: 'Top', pos: [0, 1, 0.0001] },
  { name: '3/4', pos: [0.7, 0.5, 0.7] },
];

const RENDER_PAGE = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: #1a1a1a; }
  #app { width: ${RENDER_CELL}px; height: ${RENDER_CELL}px; }
</style>
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.184.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.184.0/examples/jsm/"
  }
}
</script>
</head>
<body>
<div id="app"></div>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const app = document.getElementById('app');
const W = ${RENDER_CELL}, H = ${RENDER_CELL};
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.AmbientLight(0xffffff, 0.25));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(1.5, 2, 1);
scene.add(key);
const camera = new THREE.PerspectiveCamera(35, W / H, 0.01, 200);

let root = null;
let boundsRadius = 1;
let boundsCenter = new THREE.Vector3();

window.__loadGlb = async (dataUrl) => {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(dataUrl, (gltf) => {
      if (root) scene.remove(root);
      root = gltf.scene;
      scene.add(root);
      const box = new THREE.Box3().setFromObject(root);
      boundsCenter = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      boundsRadius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
      root.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const material of mats) {
            material.side = THREE.FrontSide;
            material.needsUpdate = true;
          }
        }
      });
      resolve({ ok: true });
    }, undefined, (error) => reject(error));
  });
};

window.__renderFromDir = (dir) => {
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const dist = (boundsRadius / Math.tan((35 * Math.PI) / 360)) * 1.8;
  camera.position.copy(boundsCenter).addScaledVector(d, dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(boundsCenter);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
};

window.__ready = true;
</script>
</body></html>`;

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function latestFile(paths: string[], predicate: (path: string) => boolean): string | null {
  return paths
    .filter(predicate)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .at(0) ?? null;
}

function readJson<T>(path: string | null): T | null {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function gridPath(kind: 'building' | 'ground-vehicle', id: string): string {
  const prefix = kind === 'building' ? 'building' : 'ground';
  return join(GRID_ROOT, `${prefix}-${id}-grid.png`);
}

function reviewEntry(kind: 'building' | 'ground-vehicle', entry: ModelEntry): ReviewEntry {
  const grid = gridPath(kind, entry.id);
  const gridExists = existsSync(grid);
  return {
    ...entry,
    kind,
    gridFile: rel(grid),
    gridExists,
    gridBytes: gridExists ? statSync(grid).size : 0,
    generatedGridFile: null,
    generatedGridBytes: 0,
    reviewGridFile: gridExists ? rel(grid) : null,
    reviewGridSource: gridExists ? 'pixel-forge-validation' : 'missing',
  };
}

function hydrateGeneratedGroundVehicleGridsFromLatestReport(vehicles: ReviewEntry[], artifactFiles: string[]): void {
  const latestReview = latestFile(
    artifactFiles,
    (path) => path.endsWith(join(OUTPUT_NAME, 'structure-review.json')),
  );
  const previous = readJson<StructureReview>(latestReview);
  if (!previous) return;

  const generatedById = new Map<string, ReviewEntry>();
  for (const entry of previous.groundVehicleCandidates ?? []) {
    if (entry.reviewGridSource !== 'generated-artifact') continue;
    if (!entry.generatedGridFile) continue;
    if (!existsSync(join(process.cwd(), entry.generatedGridFile))) continue;
    generatedById.set(entry.id, entry);
  }

  for (const entry of vehicles) {
    if (entry.gridExists) continue;
    const generated = generatedById.get(entry.id);
    if (!generated?.generatedGridFile) continue;
    entry.generatedGridFile = generated.generatedGridFile;
    entry.generatedGridBytes = generated.generatedGridBytes;
    entry.reviewGridFile = generated.generatedGridFile;
    entry.reviewGridSource = 'generated-artifact';
  }
}

function titleCase(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

async function labelSvg(text: string, width: number, height: number, bg = '#111', fg = '#ccc', size = 14): Promise<Buffer> {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <rect width="${width}" height="${height}" fill="${bg}"/>
       <text x="${width / 2}" y="${height / 2 + size / 3}" fill="${fg}" text-anchor="middle" font-family="Segoe UI, monospace, sans-serif" font-size="${size}" font-weight="600">${xmlEscape(text)}</text>
     </svg>`
  );
}

async function stitchRenderedGrid(cells: Array<{ name: string; png: Buffer }>, title: string, outPath: string): Promise<void> {
  const columns = 3;
  const rows = 2;
  const width = columns * RENDER_CELL + (columns + 1) * RENDER_PAD;
  const height = RENDER_TITLE_H + rows * (RENDER_CELL + RENDER_LABEL_H) + (rows + 1) * RENDER_PAD;
  const composites: sharp.OverlayOptions[] = [
    { input: await labelSvg(title, width, RENDER_TITLE_H, '#222', '#eaeaea', 16), top: 0, left: 0 },
  ];

  for (let index = 0; index < cells.length; index++) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellX = RENDER_PAD + column * (RENDER_CELL + RENDER_PAD);
    const cellY = RENDER_TITLE_H + RENDER_PAD + row * (RENDER_CELL + RENDER_LABEL_H + RENDER_PAD);
    composites.push({ input: cells[index]!.png, top: cellY, left: cellX });
    composites.push({
      input: await labelSvg(cells[index]!.name, RENDER_CELL, RENDER_LABEL_H, '#0e0e0e', '#9aa', 12),
      top: cellY + RENDER_CELL,
      left: cellX,
    });
  }

  await sharp({
    create: { width, height, channels: 4, background: { r: 32, g: 32, b: 32, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toFile(outPath);
}

async function renderGeneratedGroundVehicleGrids(vehicles: ReviewEntry[], outputDir: string): Promise<void> {
  const missing = vehicles.filter((entry) => !entry.gridExists && entry.exists && entry.file.endsWith('.glb'));
  if (missing.length === 0) return;

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: RENDER_CELL, height: RENDER_CELL }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.setContent(RENDER_PAGE);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, { timeout: 30_000 });

    for (const entry of missing) {
      const absoluteGlb = join(process.cwd(), entry.file);
      const bytes = readFileSync(absoluteGlb);
      const dataUrl = `data:model/gltf-binary;base64,${bytes.toString('base64')}`;
      await page.evaluate((url) => (window as unknown as { __loadGlb: (glbUrl: string) => Promise<unknown> }).__loadGlb(url), dataUrl);
      const cells: Array<{ name: string; png: Buffer }> = [];
      for (const view of RENDER_VIEWS) {
        const dataPng = await page.evaluate(
          (pos) => (window as unknown as { __renderFromDir: (dir: [number, number, number]) => string }).__renderFromDir(pos),
          view.pos,
        );
        cells.push({ name: view.name, png: Buffer.from(dataPng.split(',')[1] ?? '', 'base64') });
      }
      const outPath = join(outputDir, `ground-${entry.id}-generated-grid.png`);
      await stitchRenderedGrid(cells, titleCase(basename(entry.file, extname(entry.file))), outPath);
      entry.generatedGridFile = rel(outPath);
      entry.generatedGridBytes = statSync(outPath).size;
      entry.reviewGridFile = entry.generatedGridFile;
      entry.reviewGridSource = 'generated-artifact';
    }
  } finally {
    await browser.close();
  }
}

function slugFromGrid(file: string, prefix: string): string {
  return basename(file, '-grid.png').replace(`${prefix}-`, '');
}

function orphanValidationGrids(buildings: ReviewEntry[], vehicles: ReviewEntry[]): string[] {
  if (!existsSync(GRID_ROOT)) return [];
  const buildingIds = new Set(buildings.map((entry) => entry.id));
  const vehicleIds = new Set(vehicles.map((entry) => entry.id));
  return readdirSync(GRID_ROOT)
    .filter((file) => file.endsWith('-grid.png'))
    .filter((file) => {
      if (file.startsWith('building-')) return !buildingIds.has(slugFromGrid(file, 'building'));
      if (file.startsWith('ground-')) return !vehicleIds.has(slugFromGrid(file, 'ground'));
      return false;
    })
    .map((file) => rel(join(GRID_ROOT, file)) ?? file)
    .sort((a, b) => a.localeCompare(b));
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function writeContactSheet(entries: ReviewEntry[], outputPath: string): Promise<string | null> {
  const visible = entries.filter((entry) => entry.reviewGridSource !== 'missing' && entry.reviewGridFile);
  if (visible.length === 0) return null;

  const tileWidth = 300;
  const tileHeight = 260;
  const labelHeight = 34;
  const gap = 16;
  const columns = Math.min(4, visible.length);
  const rows = Math.ceil(visible.length / columns);
  const width = columns * tileWidth + (columns + 1) * gap;
  const height = rows * tileHeight + (rows + 1) * gap;
  const composites: sharp.OverlayOptions[] = [];

  for (let index = 0; index < visible.length; index++) {
    const entry = visible[index];
    const source = join(process.cwd(), entry.reviewGridFile ?? '');
    const x = gap + (index % columns) * (tileWidth + gap);
    const y = gap + Math.floor(index / columns) * (tileHeight + gap);
    const image = await sharp(source)
      .resize({
        width: tileWidth,
        height: tileHeight - labelHeight,
        fit: 'contain',
        background: { r: 10, g: 16, b: 22, alpha: 1 },
      })
      .png()
      .toBuffer();
    const label = Buffer.from(`
      <svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#17202b"/>
        <text x="10" y="22" font-family="Arial, sans-serif" font-size="15" fill="#e5edf4">${xmlEscape(entry.id)}</text>
      </svg>
    `);
    composites.push({ input: label, left: x, top: y });
    composites.push({ input: image, left: x, top: y + labelHeight });
  }

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 8, g: 12, b: 18, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
  return outputPath;
}

function markdown(report: StructureReview): string {
  const table = (entries: ReviewEntry[]) => [
    '| ID | Tris | Meshes | Primitives | Materials | Risk | Grid |',
    '| --- | ---: | ---: | ---: | ---: | --- | --- |',
    ...entries.map((entry) => [
      entry.id,
      entry.triangles ?? 'n/a',
      entry.meshCount ?? 'n/a',
      entry.primitiveCount ?? 'n/a',
      entry.materialCount ?? 'n/a',
      entry.optimizationRisk,
      entry.gridExists ? entry.gridFile : 'missing',
    ].join(' | ')).map((row) => `| ${row} |`),
  ];

  return [
    '# Projekt 143 Pixel Forge Structure Review',
    '',
    `Status: ${report.status.toUpperCase()}`,
    '',
    `Terrain asset inventory: ${report.inputs.terrainAssetInventory ?? 'missing'}`,
    `Contact sheet: ${report.files.contactSheet ?? 'none'}`,
    '',
    '## Findings',
    '',
    ...report.findings.map((finding) => `- ${finding}`),
    '',
    '## Building Gallery Candidates',
    '',
    ...table(report.buildingCandidates),
    '',
    '## Ground Vehicle Gallery Candidates',
    '',
    ...table(report.groundVehicleCandidates),
    '',
    '## Orphan Validation Grids',
    '',
    ...(report.orphanValidationGrids.length > 0
      ? report.orphanValidationGrids.map((grid) => `- ${grid}`)
      : ['- None']),
    '',
    '## Next Required Work',
    '',
    ...report.nextRequiredWork.map((work) => `- ${work}`),
    '',
    '## Non-Claims',
    '',
    ...report.nonClaims.map((claim) => `- ${claim}`),
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const artifactFiles = walkFiles(ARTIFACT_ROOT);
  const inventoryPath = latestFile(
    artifactFiles,
    (path) => path.endsWith(join('projekt-143-terrain-asset-inventory', 'terrain-asset-inventory.json')),
  );
  const inventory = readJson<TerrainAssetInventory>(inventoryPath);
  const buildings = (inventory?.pixelForgeGalleryBuildingCandidates ?? []).map((entry) => reviewEntry('building', entry));
  const vehicles = (inventory?.pixelForgeGalleryGroundVehicleCandidates ?? []).map((entry) => reviewEntry('ground-vehicle', entry));
  if (!RENDER_MISSING_GROUND_VEHICLES) {
    hydrateGeneratedGroundVehicleGridsFromLatestReport(vehicles, artifactFiles);
  }
  const orphans = orphanValidationGrids(buildings, vehicles);
  const highOrMedium = [...buildings, ...vehicles].filter((entry) =>
    entry.optimizationRisk === 'high' || entry.optimizationRisk === 'medium'
  ).length;

  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'structure-review.json');
  const markdownPath = join(outputDir, 'structure-review.md');
  const contactSheetPath = join(outputDir, 'structure-contact-sheet.png');
  if (RENDER_MISSING_GROUND_VEHICLES) {
    await renderGeneratedGroundVehicleGrids(vehicles, outputDir);
  }

  const reviewMissingBuildingGrids = buildings.filter((entry) => entry.reviewGridSource === 'missing').length;
  const reviewMissingGroundVehicleGrids = vehicles.filter((entry) => entry.reviewGridSource === 'missing').length;
  const generatedGroundVehicleGrids = vehicles.filter((entry) => entry.reviewGridSource === 'generated-artifact').length;
  const contactSheet = await writeContactSheet([...buildings, ...vehicles], contactSheetPath);
  const status: ReviewStatus = inventory
    ? (reviewMissingBuildingGrids + reviewMissingGroundVehicleGrids > 0 ? 'warn' : 'pass')
    : 'fail';

  const report: StructureReview = {
    createdAt: new Date().toISOString(),
    source: 'projekt-143-pixel-forge-structure-review',
    status,
    inputs: {
      terrainAssetInventory: rel(inventoryPath),
      pixelForgeRoot: rel(PIXEL_FORGE_ROOT) ?? PIXEL_FORGE_ROOT,
      validationGridRoot: rel(GRID_ROOT) ?? GRID_ROOT,
    },
    summary: {
      buildingCandidates: buildings.length,
      buildingGridCoverage: buildings.filter((entry) => entry.reviewGridSource !== 'missing').length,
      groundVehicleCandidates: vehicles.length,
      groundVehicleGridCoverage: vehicles.filter((entry) => entry.reviewGridSource !== 'missing').length,
      missingBuildingGrids: reviewMissingBuildingGrids,
      missingGroundVehicleGrids: reviewMissingGroundVehicleGrids,
      orphanBuildingGrids: orphans.filter((grid) => grid.includes('/building-')).length,
      orphanGroundVehicleGrids: orphans.filter((grid) => grid.includes('/ground-')).length,
      generatedGroundVehicleGrids,
      highOrMediumOptimizationRisk: highOrMedium,
    },
    files: {
      json: rel(jsonPath) ?? jsonPath,
      markdown: rel(markdownPath) ?? markdownPath,
      contactSheet: rel(contactSheet),
    },
    buildingCandidates: buildings,
    groundVehicleCandidates: vehicles,
    orphanValidationGrids: orphans,
    findings: [
      `${buildings.filter((entry) => entry.reviewGridSource !== 'missing').length}/${buildings.length} Pixel Forge building candidates have review grids.`,
      `${vehicles.filter((entry) => entry.reviewGridSource !== 'missing').length}/${vehicles.length} Pixel Forge ground-vehicle candidates have review grids.`,
      generatedGroundVehicleGrids > 0
        ? `${generatedGroundVehicleGrids} ground-vehicle grids are available as TIJ-generated artifacts from current Pixel Forge GLBs without mutating Pixel Forge war-assets.`
        : `${vehicles.filter((entry) => entry.gridExists).length}/${vehicles.length} ground-vehicle grids are existing Pixel Forge validation grids.`,
      `${highOrMedium} Pixel Forge structure/vehicle gallery candidates are medium/high optimization risk, mostly from mesh/material/primitive fragmentation.`,
      'Ground vehicles still need wheel/contact/pivot checks before they can support future driving work.',
    ],
    nextRequiredWork: [
      'Human review the building contact sheet before selecting any replacement set.',
      generatedGroundVehicleGrids > 0
        ? 'Promote generated ground-vehicle grids back to Pixel Forge validation only after owner review; do not treat generated source-gallery grids as driving acceptance.'
        : 'Regenerate or add validation grids for current Pixel Forge ground-vehicle GLBs.',
      'Run runtime side-by-side screenshots in TIJ after any candidate import; static Pixel Forge grids are not enough.',
      'Define foundation footprint/collision proxies and future driving-surface contact policy before swapping buildings or vehicles broadly.',
    ],
    nonClaims: [
      'No Pixel Forge building or ground vehicle is imported into TIJ by this review.',
      'No replacement, driving, collision, LOD, HLOD, or runtime performance acceptance is claimed.',
      'Existing Pixel Forge validation grids are source-gallery evidence only, not in-game placement proof.',
    ],
  };

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  writeFileSync(markdownPath, markdown(report), 'utf-8');

  console.log(`Projekt 143 Pixel Forge structure review ${report.status.toUpperCase()}: ${rel(jsonPath)}`);
  console.log(
    `- buildings grids=${report.summary.buildingGridCoverage}/${report.summary.buildingCandidates}, ground vehicles grids=${report.summary.groundVehicleGridCoverage}/${report.summary.groundVehicleCandidates}`,
  );
  console.log(`- contact sheet=${report.files.contactSheet ?? 'none'}`);

  if (report.status === 'fail') process.exitCode = 1;
}

main().catch((error) => {
  console.error('projekt-143-pixel-forge-structure-review failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
