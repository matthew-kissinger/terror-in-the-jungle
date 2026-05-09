#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { chromium, type Browser, type Page } from 'playwright';
import { NPC_PIXEL_FORGE_BASE_VISUAL_HEIGHT, NPC_PIXEL_FORGE_VISUAL_SCALE_MULTIPLIER, NPC_Y_OFFSET } from '../src/config/CombatantConfig';
import {
  PIXEL_FORGE_NPC_CLIPS,
  PIXEL_FORGE_NPC_FACTIONS,
  type PixelForgeNpcClipId,
} from '../src/config/pixelForgeAssets';
import { getPixelForgeNpcTileCropMap } from '../src/config/generated/pixelForgeNpcTileCrops';
import {
  NPC_CLOSE_MODEL_TARGET_HEIGHT,
  NPC_SPRITE_HEIGHT,
  NPC_SPRITE_RENDER_Y_OFFSET,
  NPC_SPRITE_WIDTH,
} from '../src/systems/combat/CombatantMeshFactory';
import {
  PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING,
  PIXEL_FORGE_NPC_IMPOSTER_MATERIAL_TUNING,
  PIXEL_FORGE_NPC_WEAPONS,
} from '../src/systems/combat/PixelForgeNpcRuntime';

type ReviewStatus = 'needs_human_decision' | 'accepted_exception' | 'invalid_runtime_comparison';
type ComparisonBasis = 'separate_transparent_crops' | 'runtime_equivalent_same_scene' | 'owner_explicit_exception';

type PreviousReview = {
  status?: ReviewStatus;
  comparisonBasis?: ComparisonBasis;
  html?: string;
};

type BrowserPairSummary = {
  runtimeFaction: string;
  packageFaction: string;
  clipRequested: string;
  clipApplied: string | null;
  frameIndex: number;
  poseProgress: number;
  imposterViewColumn: number;
  imposterViewRow: number;
  modelPath: string;
  texturePath: string;
  weaponPath: string;
  hasWeapon: boolean;
  closeSourceHeightMeters: number | null;
  closeRuntimeHeightMeters: number | null;
  closeSilhouetteCropDataUrl?: string;
  imposterSilhouetteCropDataUrl?: string;
  silhouetteCropViewColumn?: number;
  silhouetteCropViewRow?: number;
};

type SilhouetteStats = {
  opaquePixels: number;
  opaqueCoverage: number;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  } | null;
  centroid: { x: number; y: number } | null;
};

type SilhouetteComparison = {
  runtimeFaction: string;
  packageFaction: string;
  viewTile: { column: number; row: number };
  files: {
    closeCrop: string;
    imposterCrop: string;
    overlay: string;
  };
  close: SilhouetteStats;
  imposter: SilhouetteStats;
  metrics: {
    maskIoU: number | null;
    bboxIoU: number | null;
    opaqueCoverageRatio: number | null;
    opaqueAreaRatio: number | null;
    visibleHeightRatio: number | null;
    visibleWidthRatio: number | null;
    centroidDeltaPx: { x: number; y: number; length: number } | null;
    bboxCenterDeltaPx: { x: number; y: number; length: number } | null;
  };
};

type BrowserPayload = {
  pairs: BrowserPairSummary[];
  rendererInfo: {
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
    webglVendor: string | null;
    webglRenderer: string | null;
  } | null;
  loadErrors: string[];
};

type RuntimeReviewSummary = {
  createdAt: string;
  sourceGitSha: string;
  mode: 'projekt-143-optik-runtime-review';
  status: 'needs_human_decision';
  comparisonBasis: 'runtime_equivalent_same_scene';
  html: string;
  contactSheet: string;
  harnessHtml: string;
  invalidationReference: string | null;
  decision: string;
  ownerDecision: null;
  pairingContract: {
    clip: PixelForgeNpcClipId;
    poseProgress: number;
    frameIndex: number;
    camera: string;
    lighting: string;
    weaponSockets: string;
    closeModelTargetHeightMeters: number;
    imposterRuntimeHeightMeters: number;
    imposterRuntimeWidthMeters: number;
  };
  browser: {
    headed: boolean;
    version: string | null;
    userAgent: string | null;
  };
  pageErrors: string[];
  requestErrors: string[];
  consoleErrors: string[];
  loadErrors: string[];
  pairs: BrowserPairSummary[];
  rendererInfo: BrowserPayload['rendererInfo'];
  silhouetteComparisons: SilhouetteComparison[];
  silhouetteAggregate: {
    minMaskIoU: number | null;
    maxMaskIoU: number | null;
    minVisibleHeightRatio: number | null;
    maxVisibleHeightRatio: number | null;
    maxCentroidDeltaPx: number | null;
    maxBboxCenterDeltaPx: number | null;
  };
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const OUTPUT_NAME = 'projekt-143-optik-human-review';
const OPAQUE_ALPHA_THRESHOLD = 48;
const MATCHED_CLIP_ID: PixelForgeNpcClipId = 'walk_fight_forward';
const POSE_PROGRESS = 0.35;
const VIEWPORT = { width: 1600, height: 900 };
const FRAME_INDEX = Math.floor((PIXEL_FORGE_NPC_CLIPS.find((clip) => clip.id === MATCHED_CLIP_ID)?.framesPerClip ?? 8) * POSE_PROGRESS);

const NPC_FIXTURES = PIXEL_FORGE_NPC_FACTIONS.map((faction) => ({
  runtimeFaction: faction.runtimeFaction,
  packageFaction: faction.packageFaction,
  modelPath: `/models/${faction.modelPath}`,
  texturePath: `/assets/pixel-forge/npcs/${faction.packageFaction}/${MATCHED_CLIP_ID}/animated-albedo-packed.png`,
  weaponPath: `/models/${PIXEL_FORGE_NPC_WEAPONS[faction.primaryWeapon].modelPath}`,
  weapon: PIXEL_FORGE_NPC_WEAPONS[faction.primaryWeapon],
}));

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function gitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
}

function argValue(name: string): string | null {
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

function parsePort(): number {
  const raw = argValue('--port');
  if (!raw) return 0;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid --port value: ${raw}`);
  }
  return parsed;
}

function parseOutputDir(): string {
  const raw = argValue('--out-dir');
  return raw ? resolve(raw) : join(ARTIFACT_ROOT, timestampSlug(), OUTPUT_NAME);
}

function rel(path: string | null): string | null {
  return path ? relative(process.cwd(), path).replaceAll('\\', '/') : null;
}

function walkFiles(root: string, predicate: (path: string) => boolean, results: string[] = []): string[] {
  if (!existsSync(root)) return results;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(path, predicate, results);
    } else if (predicate(path)) {
      results.push(path);
    }
  }
  return results;
}

function latestFile(root: string, predicate: (path: string) => boolean): string | null {
  const matches = walkFiles(root, predicate);
  matches.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matches[0] ?? null;
}

function readJson<T>(path: string | null): T | null {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function round(value: number | null | undefined, digits = 3): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function writeDataUrlPng(dataUrl: string, file: string): void {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  writeFileSync(file, Buffer.from(base64, 'base64'));
}

function relRequired(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function bboxCenter(stats: SilhouetteStats): { x: number; y: number } | null {
  if (!stats.bounds) return null;
  return {
    x: stats.bounds.minX + stats.bounds.width / 2,
    y: stats.bounds.minY + stats.bounds.height / 2,
  };
}

function delta(a: { x: number; y: number } | null, b: { x: number; y: number } | null): { x: number; y: number; length: number } | null {
  if (!a || !b) return null;
  const x = b.x - a.x;
  const y = b.y - a.y;
  return { x: round(x, 2) ?? 0, y: round(y, 2) ?? 0, length: round(Math.hypot(x, y), 2) ?? 0 };
}

function bboxIoU(a: SilhouetteStats['bounds'], b: SilhouetteStats['bounds']): number | null {
  if (!a || !b) return null;
  const intersectionWidth = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) + 1);
  const intersectionHeight = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) + 1);
  const intersection = intersectionWidth * intersectionHeight;
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  return round(intersection / Math.max(1, areaA + areaB - intersection), 4);
}

async function silhouetteStats(file: string): Promise<{ stats: SilhouetteStats; mask: Uint8Array; width: number; height: number }> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(info.width * info.height);
  let opaquePixels = 0;
  let sumX = 0;
  let sumY = 0;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha <= OPAQUE_ALPHA_THRESHOLD) continue;
      const index = y * info.width + x;
      mask[index] = 1;
      opaquePixels++;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const bounds = opaquePixels > 0
    ? { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null;
  return {
    mask,
    width: info.width,
    height: info.height,
    stats: {
      opaquePixels,
      opaqueCoverage: round(opaquePixels / Math.max(1, info.width * info.height), 5) ?? 0,
      bounds,
      centroid: opaquePixels > 0
        ? { x: round(sumX / opaquePixels, 2) ?? 0, y: round(sumY / opaquePixels, 2) ?? 0 }
        : null,
    },
  };
}

async function writeSilhouetteOverlay(
  closeMask: Uint8Array,
  imposterMask: Uint8Array,
  width: number,
  height: number,
  file: string,
): Promise<{ maskIoU: number | null }> {
  const pixels = Buffer.alloc(width * height * 4);
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < closeMask.length; i++) {
    const close = closeMask[i] > 0;
    const imposter = imposterMask[i] > 0;
    if (close || imposter) union++;
    if (close && imposter) intersection++;
    const offset = i * 4;
    if (close && imposter) {
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = 255;
    } else if (close) {
      pixels[offset] = 255;
      pixels[offset + 1] = 68;
      pixels[offset + 2] = 68;
      pixels[offset + 3] = 255;
    } else if (imposter) {
      pixels[offset] = 68;
      pixels[offset + 1] = 220;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = 255;
    } else {
      pixels[offset] = 14;
      pixels[offset + 1] = 17;
      pixels[offset + 2] = 14;
      pixels[offset + 3] = 255;
    }
  }
  await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toFile(file);
  return { maskIoU: union > 0 ? round(intersection / union, 4) : null };
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
    case '.webp':
      return 'image/webp';
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

function createStaticServer(port: number): Promise<{ server: Server; url: string }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const file = resolveStaticPath(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
    if (!file) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    serveFile(file, res);
  });
  return new Promise((resolveServer) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolveServer({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function buildSilhouetteComparisons(pairs: BrowserPairSummary[], outputDir: string): Promise<SilhouetteComparison[]> {
  const comparisons: SilhouetteComparison[] = [];
  for (const pair of pairs) {
    if (!pair.closeSilhouetteCropDataUrl || !pair.imposterSilhouetteCropDataUrl) continue;
    const prefix = `${pair.packageFaction}-${pair.clipRequested}-frame${pair.frameIndex}`;
    const closeFile = join(outputDir, `${prefix}-close-silhouette.png`);
    const imposterFile = join(outputDir, `${prefix}-imposter-silhouette.png`);
    const overlayFile = join(outputDir, `${prefix}-silhouette-overlay.png`);
    writeDataUrlPng(pair.closeSilhouetteCropDataUrl, closeFile);
    writeDataUrlPng(pair.imposterSilhouetteCropDataUrl, imposterFile);
    const close = await silhouetteStats(closeFile);
    const imposter = await silhouetteStats(imposterFile);
    const overlay = await writeSilhouetteOverlay(close.mask, imposter.mask, close.width, close.height, overlayFile);
    const closeBounds = close.stats.bounds;
    const imposterBounds = imposter.stats.bounds;
    comparisons.push({
      runtimeFaction: pair.runtimeFaction,
      packageFaction: pair.packageFaction,
      viewTile: {
        column: pair.silhouetteCropViewColumn ?? pair.imposterViewColumn,
        row: pair.silhouetteCropViewRow ?? pair.imposterViewRow,
      },
      files: {
        closeCrop: relRequired(closeFile),
        imposterCrop: relRequired(imposterFile),
        overlay: relRequired(overlayFile),
      },
      close: close.stats,
      imposter: imposter.stats,
      metrics: {
        maskIoU: overlay.maskIoU,
        bboxIoU: bboxIoU(closeBounds, imposterBounds),
        opaqueCoverageRatio: close.stats.opaqueCoverage > 0
          ? round(imposter.stats.opaqueCoverage / close.stats.opaqueCoverage, 4)
          : null,
        opaqueAreaRatio: close.stats.opaquePixels > 0
          ? round(imposter.stats.opaquePixels / close.stats.opaquePixels, 4)
          : null,
        visibleHeightRatio: closeBounds && imposterBounds ? round(imposterBounds.height / closeBounds.height, 4) : null,
        visibleWidthRatio: closeBounds && imposterBounds ? round(imposterBounds.width / closeBounds.width, 4) : null,
        centroidDeltaPx: delta(close.stats.centroid, imposter.stats.centroid),
        bboxCenterDeltaPx: delta(bboxCenter(close.stats), bboxCenter(imposter.stats)),
      },
    });
  }
  return comparisons;
}

function buildSilhouetteAggregate(comparisons: SilhouetteComparison[]): RuntimeReviewSummary['silhouetteAggregate'] {
  const finite = (values: Array<number | null | undefined>): number[] =>
    values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const range = (values: number[], fn: (...items: number[]) => number): number | null =>
    values.length > 0 ? round(fn(...values), 4) : null;
  const maskIoU = finite(comparisons.map((entry) => entry.metrics.maskIoU));
  const heightRatios = finite(comparisons.map((entry) => entry.metrics.visibleHeightRatio));
  const centroidDeltas = finite(comparisons.map((entry) => entry.metrics.centroidDeltaPx?.length));
  const bboxCenterDeltas = finite(comparisons.map((entry) => entry.metrics.bboxCenterDeltaPx?.length));
  return {
    minMaskIoU: range(maskIoU, Math.min),
    maxMaskIoU: range(maskIoU, Math.max),
    minVisibleHeightRatio: range(heightRatios, Math.min),
    maxVisibleHeightRatio: range(heightRatios, Math.max),
    maxCentroidDeltaPx: range(centroidDeltas, Math.max),
    maxBboxCenterDeltaPx: range(bboxCenterDeltas, Math.max),
  };
}

function stripPairPayload(pair: BrowserPairSummary): BrowserPairSummary {
  const {
    closeSilhouetteCropDataUrl: _closeSilhouetteCropDataUrl,
    imposterSilhouetteCropDataUrl: _imposterSilhouetteCropDataUrl,
    ...summary
  } = pair;
  return summary;
}

function harnessHtml(): string {
  const matchedClip = PIXEL_FORGE_NPC_CLIPS.find((clip) => clip.id === MATCHED_CLIP_ID);
  const cropMap = getPixelForgeNpcTileCropMap(MATCHED_CLIP_ID);
  const payload = JSON.stringify({
    npcFixtures: NPC_FIXTURES,
    closeMaterialTuning: PIXEL_FORGE_NPC_CLOSE_MATERIAL_TUNING,
    imposterMaterialTuning: PIXEL_FORGE_NPC_IMPOSTER_MATERIAL_TUNING,
    clip: matchedClip,
    clipId: MATCHED_CLIP_ID,
    poseProgress: POSE_PROGRESS,
    frameIndex: FRAME_INDEX,
    cropMap,
    npcSpriteWidth: NPC_SPRITE_WIDTH,
    npcSpriteHeight: NPC_SPRITE_HEIGHT,
    npcCloseModelTargetHeight: NPC_CLOSE_MODEL_TARGET_HEIGHT,
    npcRenderYOffset: NPC_SPRITE_RENDER_Y_OFFSET,
    npcActorAnchorY: NPC_Y_OFFSET,
  });

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>Projekt 143 Runtime-Equivalent NPC Review Harness</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #121812; color: #f2f2e9; font-family: Arial, sans-serif; }
    canvas { display: block; width: 100vw; height: 100vh; }
    .overlay { position: fixed; left: 20px; right: 20px; top: 16px; display: flex; justify-content: space-between; gap: 16px; pointer-events: none; }
    .panel { background: rgba(10, 12, 10, 0.78); border: 1px solid rgba(220, 220, 200, 0.22); padding: 10px 12px; max-width: 760px; }
    .title { font-weight: 700; font-size: 16px; margin-bottom: 4px; }
    .copy { font-size: 12px; line-height: 1.35; color: #d7d9c8; }
    .labels { position: fixed; left: 5%; right: 5%; top: 112px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; pointer-events: none; }
    .label { background: rgba(10, 12, 10, 0.76); border: 1px solid rgba(220, 220, 200, 0.18); padding: 7px 8px; font-size: 12px; text-align: center; }
  </style>
  <script type="importmap">
    { "imports": { "three": "/node_modules/three/build/three.module.js" } }
  </script>
</head>
<body>
  <div class="overlay">
    <div class="panel">
      <div class="title">Runtime-Equivalent NPC Review</div>
      <div class="copy">Each pair uses the same faction, clip, pose progress, weapon config, target height, camera, lighting, and crop map. Left is animated close GLB with runtime weapon socketing; right is runtime shader impostor.</div>
    </div>
    <div class="panel">
      <div class="copy">Clip: ${MATCHED_CLIP_ID}<br>Pose progress: ${POSE_PROGRESS}<br>Frame: ${FRAME_INDEX}<br>Basis: runtime_equivalent_same_scene</div>
    </div>
  </div>
  <div class="labels">
    ${NPC_FIXTURES.map((fixture) => `<div class="label">${fixture.runtimeFaction}<br>GLB + weapon / impostor</div>`).join('')}
  </div>
  <script type="module">
    import * as THREE from 'three';
    import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
    import { clone as cloneSkeleton } from '/node_modules/three/examples/jsm/utils/SkeletonUtils.js';

    const contract = ${payload};
    const loader = new GLTFLoader();
    const loadErrors = [];
    const rootMotionClips = new Set(['patrol_walk', 'traverse_run', 'advance_fire', 'walk_fight_forward']);

    function loadGltf(path) {
      return new Promise((resolve, reject) => loader.load(path, resolve, undefined, reject));
    }

    function loadTexture(path) {
      return new Promise((resolve, reject) => new THREE.TextureLoader().load(path, resolve, undefined, reject));
    }

    function materialToken(materialName) {
      const parts = String(materialName || '').split('_');
      return parts[parts.length - 1];
    }

    function tuneCloseModelMaterials(root, packageFaction) {
      const tuning = contract.closeMaterialTuning[packageFaction] || {};
      root.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const tuned = materials.map((material) => {
          const cloned = material.clone();
          if (cloned.isMeshStandardMaterial) {
            const token = materialToken(cloned.name);
            if (Object.prototype.hasOwnProperty.call(tuning, token)) {
              cloned.color.setHex(tuning[token]);
            }
            const isUniformSurface = token === 'uniform' || token === 'trousers' || token === 'headgear' || token === 'accent';
            if (isUniformSurface) {
              cloned.color.offsetHSL(0, 0.08, 0.1);
            }
            cloned.emissive.copy(cloned.color).multiplyScalar(isUniformSurface ? 0.16 : 0.06);
            cloned.emissiveIntensity = isUniformSurface ? 0.28 : 0.1;
            cloned.roughness = Math.max(cloned.roughness, 0.9);
            cloned.metalness = 0;
            cloned.needsUpdate = true;
          }
          return cloned;
        });
        child.material = Array.isArray(child.material) ? tuned : tuned[0];
      });
    }

    function isHipsPositionTrack(track) {
      const normalized = track.name.toLowerCase().replace(/mixamorig:/g, '');
      return /(^|[/.])hips\\.position$/.test(normalized);
    }

    function sanitizeAnimationClip(clip) {
      const sanitized = clip.clone();
      if (!rootMotionClips.has(sanitized.name)) return sanitized;
      sanitized.tracks = sanitized.tracks.map((track) => {
        const cloned = track.clone();
        if (!isHipsPositionTrack(cloned) || cloned.getValueSize() < 3 || cloned.times.length < 2) return cloned;
        const times = cloned.times;
        const values = cloned.values;
        const firstIndex = 0;
        const lastIndex = (times.length - 1) * 3;
        const netX = values[lastIndex] - values[firstIndex];
        const netZ = values[lastIndex + 2] - values[firstIndex + 2];
        const duration = times[times.length - 1] - times[0];
        if (!Number.isFinite(duration) || duration <= 0 || Math.hypot(netX, netZ) < 0.00001) return cloned;
        for (let i = 0; i < times.length; i++) {
          const progress = (times[i] - times[0]) / duration;
          const valueIndex = i * 3;
          values[valueIndex] -= netX * progress;
          values[valueIndex + 2] -= netZ * progress;
        }
        return cloned;
      });
      return sanitized;
    }

    function boxMetrics(root) {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      return { box, size };
    }

    function findNamed(root, names) {
      for (const name of names) {
        let found;
        root.traverse((child) => {
          if (!found && child.name === name) found = child;
        });
        if (found) return found;
      }
      return undefined;
    }

    function centerOfObject(root, object) {
      if (!object) return undefined;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) return undefined;
      return root.worldToLocal(box.getCenter(new THREE.Vector3()));
    }

    function normalizeWeaponRoot(root, weapon) {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const longAxis = Math.max(size.x, size.y, size.z) || 1;
      const scale = weapon.lengthMeters / longAxis;
      root.scale.setScalar(scale);
      const gripObject = findNamed(root, weapon.gripNames);
      const supportObject = findNamed(root, weapon.supportNames);
      const muzzleObject = findNamed(root, weapon.muzzleNames);
      const stockObject = findNamed(root, weapon.stockNames);
      const grip = centerOfObject(root, gripObject) || new THREE.Vector3();
      const support = centerOfObject(root, supportObject);
      const muzzle = centerOfObject(root, muzzleObject);
      const stock = centerOfObject(root, stockObject);
      const muzzleDirection = muzzle ? muzzle.clone().sub(grip) : new THREE.Vector3(1, 0, 0);
      const alignment = muzzleDirection.lengthSq() > 0.0001
        ? new THREE.Quaternion().setFromUnitVectors(muzzleDirection.normalize(), new THREE.Vector3(1, 0, 0))
        : new THREE.Quaternion();
      root.quaternion.copy(alignment);
      const transformLocal = (point) => point.clone().multiplyScalar(scale).applyQuaternion(root.quaternion);
      const transformedGrip = transformLocal(grip);
      root.position.copy(transformedGrip.multiplyScalar(-1));
      root.userData.stockOffset = stock ? transformLocal(stock).sub(transformLocal(grip)) : new THREE.Vector3(-0.28, 0.04, 0);
      root.userData.supportOffset = support ? transformLocal(support).sub(transformLocal(grip)) : new THREE.Vector3(0.28, 0.02, 0);
      root.updateMatrixWorld(true);
    }

    function collectBones(root) {
      const bones = new Map();
      root.traverse((child) => {
        if (child.isBone) bones.set(child.name, child);
      });
      return bones;
    }

    function getBoneWorldPosition(instance, name) {
      const bone = instance.bones.get(name);
      return bone ? bone.getWorldPosition(new THREE.Vector3()) : undefined;
    }

    function getRootForward(root) {
      const quaternion = root.getWorldQuaternion(new THREE.Quaternion());
      return new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
    }

    function getBodyForward(instance) {
      const body = instance.bones.get('Hips') || instance.bones.get('Spine') || instance.root;
      const quaternion = body.getWorldQuaternion(new THREE.Quaternion());
      return new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
    }

    function getWeaponOffset(root, key, fallback) {
      const value = root.userData[key];
      return value && value.isVector3 ? value.clone() : fallback;
    }

    function setBoneDirectionWorld(bone, directionWorld) {
      if (!bone.parent) return;
      const direction = directionWorld.clone().normalize();
      if (direction.lengthSq() < 0.0001) return;
      const parentInv = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      const targetLocal = direction.applyQuaternion(parentInv).normalize();
      bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetLocal);
      bone.updateMatrixWorld(true);
    }

    function solveArmToTarget(instance, side, target, axes) {
      const upper = instance.bones.get(side + 'Arm');
      const fore = instance.bones.get(side + 'ForeArm');
      const hand = instance.bones.get(side + 'Hand');
      if (!upper || !fore || !hand) return;
      instance.root.updateMatrixWorld(true);
      const shoulder = upper.getWorldPosition(new THREE.Vector3());
      const elbowNow = fore.getWorldPosition(new THREE.Vector3());
      const handNow = hand.getWorldPosition(new THREE.Vector3());
      const upperLength = Math.max(0.001, shoulder.distanceTo(elbowNow));
      const foreLength = Math.max(0.001, elbowNow.distanceTo(handNow));
      const reach = Math.max(0.08, upperLength + foreLength - 0.025);
      const targetVector = target.clone().sub(shoulder);
      const distance = targetVector.length();
      if (distance < 0.001) return;
      const direction = targetVector.clone().normalize();
      const clampedTarget = distance > reach ? shoulder.clone().add(direction.clone().multiplyScalar(reach)) : target.clone();
      const clampedDistance = Math.min(distance, reach);
      const sideSign = side === 'Right' ? 1 : -1;
      const pole = shoulder.clone()
        .add(axes.cleanUp.clone().multiplyScalar(-0.24))
        .add(axes.actorRight.clone().multiplyScalar(0.22 * sideSign))
        .add(axes.forward.clone().multiplyScalar(0.04));
      let planeNormal = direction.clone().cross(pole.clone().sub(shoulder)).normalize();
      if (planeNormal.lengthSq() < 0.0001) {
        planeNormal = axes.actorRight.clone().multiplyScalar(sideSign);
      }
      const bendDirection = planeNormal.clone().cross(direction).normalize();
      const along = (upperLength * upperLength - foreLength * foreLength + clampedDistance * clampedDistance) / (2 * clampedDistance);
      const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
      const elbow = shoulder.clone()
        .add(direction.clone().multiplyScalar(along))
        .add(bendDirection.multiplyScalar(height));
      setBoneDirectionWorld(upper, elbow.clone().sub(shoulder));
      instance.root.updateMatrixWorld(true);
      const elbowWorld = fore.getWorldPosition(new THREE.Vector3());
      setBoneDirectionWorld(fore, clampedTarget.clone().sub(elbowWorld));
      instance.root.updateMatrixWorld(true);
    }

    function updateWeaponSocket(instance) {
      const right = getBoneWorldPosition(instance, 'RightHand');
      const leftShoulder = getBoneWorldPosition(instance, 'LeftArm') || getBoneWorldPosition(instance, 'LeftShoulder');
      const rightShoulder = getBoneWorldPosition(instance, 'RightArm') || getBoneWorldPosition(instance, 'RightShoulder');
      if (!right) {
        instance.hasWeapon = false;
        return;
      }
      const up = new THREE.Vector3(0, 1, 0);
      const travelForward = getRootForward(instance.root);
      travelForward.y = 0;
      if (travelForward.lengthSq() < 0.0001) travelForward.set(0, 0, 1);
      travelForward.normalize();
      const torsoForward = getBodyForward(instance);
      torsoForward.y = 0;
      if (torsoForward.lengthSq() < 0.0001) torsoForward.set(0, 0, 1);
      torsoForward.normalize();
      const forward = instance.weaponConfig.socketMode === 'shouldered-forward' ? travelForward : torsoForward;
      let actorRight = new THREE.Vector3().crossVectors(forward, up).normalize();
      if (leftShoulder && rightShoulder) {
        const shoulderSpan = rightShoulder.clone().sub(leftShoulder);
        shoulderSpan.y = 0;
        if (shoulderSpan.lengthSq() > 0.0001) {
          shoulderSpan.normalize();
          if (shoulderSpan.dot(actorRight) < 0) shoulderSpan.multiplyScalar(-1);
          actorRight = shoulderSpan;
        }
      }
      const cleanUp = new THREE.Vector3().crossVectors(actorRight, forward).normalize();
      const worldMatrix = new THREE.Matrix4().makeBasis(forward, cleanUp, actorRight);
      const worldQuaternion = new THREE.Quaternion().setFromRotationMatrix(worldMatrix);
      if (instance.weaponConfig.pitchTrimDeg) {
        worldQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(instance.weaponConfig.pitchTrimDeg)));
      }
      const parent = instance.weaponPivot.parent || instance.root;
      parent.updateMatrixWorld(true);
      const parentQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
      instance.weaponPivot.quaternion.copy(parentQuaternion.invert().multiply(worldQuaternion));
      const shoulder = rightShoulder || right;
      const shoulderCenter = leftShoulder && rightShoulder ? leftShoulder.clone().lerp(rightShoulder, 0.5) : shoulder.clone().sub(actorRight.clone().multiplyScalar(0.12));
      const shoulderPocket = shoulder.clone().lerp(shoulderCenter, 0.42).add(cleanUp.clone().multiplyScalar(-0.035));
      const stockOffset = getWeaponOffset(instance.weaponRoot, 'stockOffset', new THREE.Vector3(-0.28, 0.04, 0));
      const stockWorldOffset = stockOffset.applyQuaternion(worldQuaternion);
      const stockAnchoredGrip = shoulderPocket.clone()
        .add(forward.clone().multiplyScalar(instance.weaponConfig.forwardHold + instance.weaponConfig.gripOffset))
        .sub(stockWorldOffset);
      const desiredWorldPosition = stockAnchoredGrip.add(actorRight.clone().multiplyScalar(0.006));
      instance.weaponPivot.position.copy(parent.worldToLocal(desiredWorldPosition.clone()));
      instance.weaponPivot.updateMatrixWorld(true);
      const supportOffset = getWeaponOffset(instance.weaponRoot, 'supportOffset', new THREE.Vector3(0.28, 0.02, 0));
      const supportTarget = desiredWorldPosition.clone().add(supportOffset.applyQuaternion(worldQuaternion));
      const axes = { forward, cleanUp, actorRight };
      solveArmToTarget(instance, 'Right', desiredWorldPosition, axes);
      solveArmToTarget(instance, 'Left', supportTarget, axes);
      instance.root.updateMatrixWorld(true);
      instance.weaponPivot.updateMatrixWorld(true);
      instance.hasWeapon = true;
    }

    function octahedralViewTileForDirection(localX, localY, localZ) {
      const length = Math.hypot(localX, localY, localZ) || 1;
      const x = localX / length;
      const y = localY / length;
      const z = localZ / length;
      const invL1 = 1 / (Math.abs(x) + Math.abs(y) + Math.abs(z) || 1);
      let u = x * invL1;
      let v = z * invL1;
      if (y < 0) {
        const oldU = u;
        u = (1 - Math.abs(v)) * Math.sign(oldU || 1);
        v = (1 - Math.abs(oldU)) * Math.sign(v || 1);
      }
      const column = Math.min(contract.clip.viewGridX - 1, Math.max(0, Math.floor(((u + 1) * 0.5) * contract.clip.viewGridX)));
      const row = Math.min(contract.clip.viewGridY - 1, Math.max(0, Math.floor(((1 - v) * 0.5) * contract.clip.viewGridY)));
      return { column, row };
    }

    function viewTileForCamera(actorAnchor, camera, rootYaw) {
      const cameraVector = camera.isOrthographicCamera
        ? camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-1)
        : new THREE.Vector3(
            camera.position.x - actorAnchor.x,
            camera.position.y - actorAnchor.y,
            camera.position.z - actorAnchor.z,
          );
      const dx = cameraVector.x;
      const dy = cameraVector.y;
      const dz = cameraVector.z;
      const cos = Math.cos(rootYaw);
      const sin = Math.sin(rootYaw);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      return octahedralViewTileForDirection(localX, dy, localZ);
    }

    function makeReviewLights(scene) {
      scene.add(new THREE.HemisphereLight(0xdce9d2, 0x3d4634, 1.65));
      const sun = new THREE.DirectionalLight(0xffe1b0, 1.35);
      sun.position.set(6, 9, 8);
      scene.add(sun);
    }

    function setImposterTile(mesh, tile) {
      mesh.traverse((child) => {
        if (!child.isMesh) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          const uniforms = material && material.uniforms;
          if (!uniforms || !uniforms.viewColumn || !uniforms.viewRow) continue;
          uniforms.viewColumn.value = tile.column;
          uniforms.viewRow.value = tile.row;
        }
      });
    }

    function syncImposterTileForCamera(mesh, camera) {
      const tile = viewTileForCamera(
        new THREE.Vector3(mesh.position.x, contract.npcActorAnchorY, mesh.position.z),
        camera,
        0,
      );
      setImposterTile(mesh, tile);
      return tile;
    }

    function renderSilhouetteCrop(object, kind) {
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(512, 512, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      const scene = new THREE.Scene();
      makeReviewLights(scene);
      const camera = new THREE.OrthographicCamera(-2.2, 2.2, 3.35, -0.45, 0.1, 80);
      camera.position.set(0, 1.55, 18);
      camera.lookAt(0, 1.55, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      const originalPosition = object.position.clone();
      object.position.x = 0;
      object.position.z = 0;
      let viewTile = null;
      if (kind === 'imposter') {
        viewTile = syncImposterTileForCamera(object, camera);
        orientImposterToCamera(object, camera);
      }
      scene.add(object);
      object.updateMatrixWorld(true);
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      scene.remove(object);
      object.position.copy(originalPosition);
      object.updateMatrixWorld(true);
      renderer.dispose();
      return { dataUrl, viewTile };
    }

    function createNpcImposterMaterial(texture, packageFaction, viewTile) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      const clip = contract.clip;
      const tuning = contract.imposterMaterialTuning[packageFaction] || contract.imposterMaterialTuning.usArmy;
      const cropMap = contract.cropMap;
      const cropTexture = new THREE.DataTexture(Uint8Array.from(cropMap.data), cropMap.width, cropMap.height, THREE.RGBAFormat, THREE.UnsignedByteType);
      cropTexture.name = 'Projekt143.NPC.' + contract.clipId + '.tileCropMap';
      cropTexture.generateMipmaps = false;
      cropTexture.minFilter = THREE.NearestFilter;
      cropTexture.magFilter = THREE.NearestFilter;
      cropTexture.wrapS = THREE.ClampToEdgeWrapping;
      cropTexture.wrapT = THREE.ClampToEdgeWrapping;
      cropTexture.flipY = false;
      cropTexture.needsUpdate = true;
      return new THREE.ShaderMaterial({
        uniforms: {
          map: { value: texture },
          viewGrid: { value: new THREE.Vector2(clip.viewGridX, clip.viewGridY) },
          frameGrid: { value: new THREE.Vector2(clip.framesX, clip.framesY) },
          tileCropMap: { value: cropTexture },
          tileCropMapSize: { value: new THREE.Vector2(cropMap.width, cropMap.height) },
          viewColumn: { value: viewTile.column },
          viewRow: { value: viewTile.row },
          frameIndex: { value: contract.frameIndex },
          combatState: { value: 0.25 },
          readabilityColor: { value: new THREE.Color(0.0, 0.5, 1.0) },
          readabilityStrength: { value: tuning.readabilityStrength },
          npcExposure: { value: tuning.npcExposure },
          minNpcLight: { value: tuning.minNpcLight },
          npcTopLight: { value: tuning.npcTopLight },
          horizontalCropExpansion: { value: tuning.horizontalCropExpansion },
          parityScale: { value: tuning.parityScale },
          parityLift: { value: tuning.parityLift },
          paritySaturation: { value: tuning.paritySaturation },
        },
        vertexShader: \`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        \`,
        fragmentShader: \`
          uniform sampler2D map;
          uniform vec2 viewGrid;
          uniform vec2 frameGrid;
          uniform float viewColumn;
          uniform float viewRow;
          uniform float frameIndex;
          uniform float combatState;
          uniform vec3 readabilityColor;
          uniform float readabilityStrength;
          uniform float npcExposure;
          uniform float minNpcLight;
          uniform float npcTopLight;
          uniform float horizontalCropExpansion;
          uniform sampler2D tileCropMap;
          uniform vec2 tileCropMapSize;
          uniform float parityScale;
          uniform float parityLift;
          uniform float paritySaturation;
          varying vec2 vUv;
          void main() {
            float frameX = mod(frameIndex, frameGrid.x);
            float frameY = floor(frameIndex / frameGrid.x);
            float viewX = clamp(floor(viewColumn + 0.5), 0.0, viewGrid.x - 1.0);
            float viewY = clamp(floor(viewRow + 0.5), 0.0, viewGrid.y - 1.0);
            vec2 atlasGrid = viewGrid * frameGrid;
            vec2 tile = vec2(frameX * viewGrid.x + viewX, frameY * viewGrid.y + viewY);
            vec4 tileCrop = texture2D(tileCropMap, (tile + vec2(0.5)) / tileCropMapSize);
            float cropCenterX = (tileCrop.x + tileCrop.z) * 0.5;
            float cropHalfX = (tileCrop.z - tileCrop.x) * 0.5 * max(horizontalCropExpansion, 1.0);
            vec2 cropMin = vec2(max(0.0, cropCenterX - cropHalfX), tileCrop.y);
            vec2 cropMax = vec2(min(1.0, cropCenterX + cropHalfX), tileCrop.w);
            vec2 croppedUv = mix(cropMin, cropMax, vUv);
            vec2 sampleUv = vec2((tile.x + croppedUv.x) / atlasGrid.x, 1.0 - ((tile.y + 1.0 - croppedUv.y) / atlasGrid.y));
            vec4 texColor = texture2D(map, sampleUv);
            if (texColor.a < 0.18) discard;
            vec3 alertBoost = mix(vec3(1.0), vec3(1.12, 1.06, 0.96), clamp(combatState, 0.0, 1.0));
            vec3 npcColor = texColor.rgb * alertBoost;
            float luma = dot(npcColor, vec3(0.299, 0.587, 0.114));
            npcColor = mix(vec3(luma), npcColor, 1.22);
            npcColor = min(npcColor + vec3(0.045, 0.040, 0.030), vec3(1.0));
            vec3 readabilityLift = readabilityColor * (0.18 + 0.12 * combatState);
            npcColor = mix(npcColor, min(npcColor + readabilityLift, vec3(1.0)), readabilityStrength);
            float topLight = smoothstep(0.12, 1.0, vUv.y) * npcTopLight;
            float npcLight = max(minNpcLight, minNpcLight + topLight);
            npcColor = min(npcColor * npcExposure * npcLight, vec3(1.0));
            npcColor = min(npcColor * parityScale + vec3(parityLift), vec3(1.0));
            float parityLuma = dot(npcColor, vec3(0.299, 0.587, 0.114));
            npcColor = clamp(mix(vec3(parityLuma), npcColor, paritySaturation), 0.0, 1.0);
            gl_FragColor = vec4(npcColor, texColor.a);
          }
        \`,
        transparent: true,
        alphaTest: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
        forceSinglePass: true,
      });
    }

    function makeImposter(texture, packageFaction, viewTile) {
      const geometry = new THREE.PlaneGeometry(contract.npcSpriteWidth, contract.npcSpriteHeight);
      const material = createNpcImposterMaterial(texture, packageFaction, viewTile);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = contract.npcActorAnchorY + contract.npcRenderYOffset;
      return mesh;
    }

    function orientImposterToCamera(mesh, camera) {
      const dx = camera.position.x - mesh.position.x;
      const dz = camera.position.z - mesh.position.z;
      mesh.rotation.y = Math.atan2(dx, dz);
      mesh.updateMatrixWorld(true);
    }

    async function buildPair(fixture, x, scene, camera) {
      const [model, weaponRoot, texture] = await Promise.all([
        loadGltf(fixture.modelPath),
        loadGltf(fixture.weaponPath),
        loadTexture(fixture.texturePath),
      ]);
      const root = cloneSkeleton(model.scene);
      root.name = fixture.runtimeFaction + ' runtime-equivalent close GLB';
      root.traverse((child) => {
        child.frustumCulled = false;
      });
      tuneCloseModelMaterials(root, fixture.packageFaction);
      const weaponPivot = new THREE.Group();
      weaponPivot.name = fixture.weapon.id + '_weapon_socket';
      const weaponScene = weaponRoot.scene.clone();
      normalizeWeaponRoot(weaponScene, fixture.weapon);
      weaponPivot.add(weaponScene);
      root.add(weaponPivot);
      const mixer = new THREE.AnimationMixer(root);
      const sourceClip = model.animations.find((clip) => clip.name === contract.clipId) || model.animations[0] || null;
      let clipApplied = null;
      if (sourceClip) {
        const clip = sanitizeAnimationClip(sourceClip);
        clipApplied = clip.name;
        const action = mixer.clipAction(clip);
        action.reset().play();
        mixer.update(Math.max(0.001, clip.duration) * contract.poseProgress);
      }
      const source = boxMetrics(root);
      const height = source.size.y || 1;
      const visualScale = contract.npcCloseModelTargetHeight / height;
      root.scale.setScalar(visualScale);
      root.position.set(x - 0.82, 0, 0);
      root.updateMatrixWorld(true);
      const scaled = boxMetrics(root);
      root.position.y = -scaled.box.min.y;
      root.updateMatrixWorld(true);
      const instance = {
        root,
        weaponPivot,
        weaponRoot: weaponScene,
        weaponConfig: fixture.weapon,
        bones: collectBones(root),
        hasWeapon: false,
      };
      updateWeaponSocket(instance);
      const closeSilhouette = renderSilhouetteCrop(root, 'close');
      scene.add(root);

      const imposterAnchor = new THREE.Vector3(x + 0.82, contract.npcActorAnchorY, 0);
      const imposterViewTile = viewTileForCamera(imposterAnchor, camera, 0);
      const imposter = makeImposter(texture, fixture.packageFaction, imposterViewTile);
      imposter.name = fixture.runtimeFaction + ' runtime impostor';
      imposter.position.x = x + 0.82;
      const imposterSilhouette = renderSilhouetteCrop(imposter, 'imposter');
      setImposterTile(imposter, imposterViewTile);
      orientImposterToCamera(imposter, camera);
      scene.add(imposter);

      const finalMetrics = boxMetrics(root);
      return {
        runtimeFaction: fixture.runtimeFaction,
        packageFaction: fixture.packageFaction,
        clipRequested: contract.clipId,
        clipApplied,
        frameIndex: contract.frameIndex,
        poseProgress: contract.poseProgress,
        imposterViewColumn: imposterViewTile.column,
        imposterViewRow: imposterViewTile.row,
        closeSilhouetteCropDataUrl: closeSilhouette.dataUrl,
        imposterSilhouetteCropDataUrl: imposterSilhouette.dataUrl,
        silhouetteCropViewColumn: imposterSilhouette.viewTile ? imposterSilhouette.viewTile.column : imposterViewTile.column,
        silhouetteCropViewRow: imposterSilhouette.viewTile ? imposterSilhouette.viewTile.row : imposterViewTile.row,
        modelPath: fixture.modelPath,
        texturePath: fixture.texturePath,
        weaponPath: fixture.weaponPath,
        hasWeapon: instance.hasWeapon,
        closeSourceHeightMeters: Number(source.size.y.toFixed(4)),
        closeRuntimeHeightMeters: Number(finalMetrics.size.y.toFixed(4)),
      };
    }

    async function main() {
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      renderer.setClearColor(0x121812, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.04;
      document.body.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xdce9d2, 0x3d4634, 1.65));
      const sun = new THREE.DirectionalLight(0xffe1b0, 1.35);
      sun.position.set(6, 9, 8);
      scene.add(sun);
      const camera = new THREE.OrthographicCamera(-11.5, 11.5, 3.55, -0.35, 0.1, 80);
      camera.position.set(0, 1.55, 18);
      camera.lookAt(0, 1.55, 0);
      camera.updateProjectionMatrix();
      const ground = new THREE.GridHelper(24, 24, 0x526650, 0x273227);
      ground.position.y = 0;
      scene.add(ground);
      const actorGroup = new THREE.Group();
      scene.add(actorGroup);
      const pairs = [];
      const xs = [-8.4, -2.8, 2.8, 8.4];
      for (let i = 0; i < contract.npcFixtures.length; i++) {
        try {
          pairs.push(await buildPair(contract.npcFixtures[i], xs[i], actorGroup, camera));
        } catch (error) {
          loadErrors.push(String(error && error.stack ? error.stack : error));
        }
      }
      actorGroup.updateMatrixWorld(true);
      const actorBounds = new THREE.Box3().setFromObject(actorGroup);
      if (!actorBounds.isEmpty()) {
        const center = actorBounds.getCenter(new THREE.Vector3());
        const size = actorBounds.getSize(new THREE.Vector3());
        const halfHeight = Math.max(2.0, size.y * 0.56);
        camera.top = center.y + halfHeight;
        camera.bottom = center.y - halfHeight;
        camera.position.y = center.y;
        camera.lookAt(0, center.y, 0);
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
      window.__projekt143RuntimeReviewReady = {
        pairs,
        rendererInfo: {
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          textures: renderer.info.memory.textures,
          programs: renderer.info.programs?.length ?? 0,
          webglVendor: renderer.getContext().getParameter(renderer.getContext().VENDOR),
          webglRenderer: renderer.getContext().getParameter(renderer.getContext().RENDERER),
        },
        loadErrors,
      };
    }

    main().catch((error) => {
      window.__projekt143RuntimeReviewReady = {
        pairs: [],
        rendererInfo: null,
        loadErrors: [String(error && error.stack ? error.stack : error)],
      };
    });
  </script>
</body>
</html>`;
}

async function runBrowser(url: string, headed: boolean): Promise<{
  browserVersion: string | null;
  userAgent: string | null;
  pageErrors: string[];
  requestErrors: string[];
  consoleErrors: string[];
  payload: BrowserPayload;
  page: Page;
  browser: Browser;
}> {
  const browser = await chromium.launch({
    headless: !headed,
    args: ['--use-angle=swiftshader', '--enable-webgl'],
  });
  const page = await browser.newPage({ viewport: VIEWPORT });
  const pageErrors: string[] = [];
  const requestErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack ?? error)));
  page.on('response', (response) => {
    if (response.status() >= 400) requestErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.waitForFunction(() => Boolean((window as any).__projekt143RuntimeReviewReady), undefined, {
    timeout: 120_000,
  });
  const payload = await page.evaluate(() => (window as any).__projekt143RuntimeReviewReady as BrowserPayload);
  const userAgent = await page.evaluate(() => navigator.userAgent);
  return {
    browserVersion: browser.version(),
    userAgent,
    pageErrors,
    requestErrors,
    consoleErrors,
    payload,
    page,
    browser,
  };
}

function writeReviewHtml(report: RuntimeReviewSummary, outputDir: string, file: string): void {
  const sheetHref = relative(outputDir, join(process.cwd(), report.contactSheet)).replaceAll('\\', '/');
  const harnessHref = relative(outputDir, join(process.cwd(), report.harnessHtml)).replaceAll('\\', '/');
  const lines = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>Projekt 143 Runtime-Equivalent KB-OPTIK Review</title>',
    '  <style>',
    '    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #101410; color: #eee; }',
    '    body { margin: 0; padding: 28px; }',
    '    main { max-width: 1180px; margin: 0 auto; }',
    '    section { border: 1px solid #303830; padding: 16px; margin: 16px 0; background: #171d17; }',
    '    img { max-width: 100%; border: 1px solid #333; background: #080a08; }',
    '    code { background: #242a24; padding: 2px 5px; border-radius: 4px; }',
    '    a { color: #8bd3ff; }',
    '    table { border-collapse: collapse; width: 100%; font-size: 13px; }',
    '    th, td { border: 1px solid #303830; padding: 7px; text-align: left; }',
    '  </style>',
    '</head>',
    '<body>',
    '<main>',
    '  <h1>Projekt 143 Runtime-Equivalent KB-OPTIK Review</h1>',
    `  <p>Status: <code>${escapeHtml(report.status)}</code> | Basis: <code>${escapeHtml(report.comparisonBasis)}</code></p>`,
    '  <section>',
    '    <h2>Decision Needed</h2>',
    `    <p>${escapeHtml(report.decision)}</p>`,
    '  </section>',
    '  <section>',
    '    <h2>Contact Sheet</h2>',
    `    <p><a href="${escapeHtml(sheetHref)}">Open image</a> | <a href="${escapeHtml(harnessHref)}">Open reproducible harness</a></p>`,
    `    <img src="${escapeHtml(sheetHref)}" alt="Runtime-equivalent close GLB and impostor comparison contact sheet">`,
    '  </section>',
    '  <section>',
    '    <h2>Pairing Contract</h2>',
    `    <pre>${escapeHtml(JSON.stringify(report.pairingContract, null, 2))}</pre>`,
    '  </section>',
    '  <section>',
    '    <h2>Pair Metadata</h2>',
    '    <table>',
    '      <thead><tr><th>Faction</th><th>Clip</th><th>Frame</th><th>View Tile</th><th>Weapon</th><th>Close Height</th><th>Texture</th></tr></thead>',
    '      <tbody>',
    ...report.pairs.map((pair) =>
      `        <tr><td>${escapeHtml(pair.runtimeFaction)}</td><td>${escapeHtml(pair.clipApplied ?? 'missing')}</td><td>${pair.frameIndex}</td><td>${pair.imposterViewColumn},${pair.imposterViewRow}</td><td>${pair.hasWeapon ? 'yes' : 'no'}</td><td>${pair.closeRuntimeHeightMeters ?? 'n/a'}</td><td><code>${escapeHtml(pair.texturePath)}</code></td></tr>`
    ),
    '      </tbody>',
    '    </table>',
    '  </section>',
    '  <section>',
    '    <h2>Silhouette Alignment</h2>',
    `    <pre>${escapeHtml(JSON.stringify(report.silhouetteAggregate, null, 2))}</pre>`,
    '    <table>',
    '      <thead><tr><th>Faction</th><th>View Tile</th><th>Mask IoU</th><th>BBox IoU</th><th>Area Ratio</th><th>Height Ratio</th><th>Centroid Delta</th><th>Overlay</th></tr></thead>',
    '      <tbody>',
    ...report.silhouetteComparisons.map((entry) =>
      `        <tr><td>${escapeHtml(entry.runtimeFaction)}</td><td>${entry.viewTile.column},${entry.viewTile.row}</td><td>${entry.metrics.maskIoU ?? 'n/a'}</td><td>${entry.metrics.bboxIoU ?? 'n/a'}</td><td>${entry.metrics.opaqueAreaRatio ?? 'n/a'}</td><td>${entry.metrics.visibleHeightRatio ?? 'n/a'}</td><td>${entry.metrics.centroidDeltaPx ? `${entry.metrics.centroidDeltaPx.x}, ${entry.metrics.centroidDeltaPx.y}` : 'n/a'}</td><td><a href="${escapeHtml(relative(outputDir, join(process.cwd(), entry.files.overlay)).replaceAll('\\', '/'))}">overlay</a></td></tr>`
    ),
    '      </tbody>',
    '    </table>',
    '  </section>',
    '  <section>',
    '    <h2>Browser Diagnostics</h2>',
    `    <pre>${escapeHtml(JSON.stringify({
      pageErrors: report.pageErrors,
      requestErrors: report.requestErrors,
      consoleErrors: report.consoleErrors,
      loadErrors: report.loadErrors,
      rendererInfo: report.rendererInfo,
    }, null, 2))}</pre>`,
    '  </section>',
    '</main>',
    '</body>',
    '</html>',
  ];
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf-8');
}

async function main(): Promise<void> {
  const headed = process.argv.includes('--headed');
  const outputDir = parseOutputDir();
  mkdirSync(outputDir, { recursive: true });
  const harnessFile = join(outputDir, 'runtime-equivalent-harness.html');
  const contactSheetFile = join(outputDir, 'runtime-equivalent-contact-sheet.png');
  const reviewHtmlFile = join(outputDir, 'index.html');
  const summaryFile = join(outputDir, 'review-summary.json');
  writeFileSync(harnessFile, harnessHtml(), 'utf-8');

  const invalidationReferencePath = latestFile(ARTIFACT_ROOT, (path) => {
    if (!path.endsWith(join(OUTPUT_NAME, 'review-summary.json'))) return false;
    return readJson<PreviousReview>(path)?.status === 'invalid_runtime_comparison';
  });
  const { server, url } = await createStaticServer(parsePort());
  let browser: Browser | null = null;
  try {
    const browserRun = await runBrowser(`${url}/${rel(harnessFile)}`, headed);
    browser = browserRun.browser;
    await browserRun.page.screenshot({ path: contactSheetFile, fullPage: true });
    const silhouetteComparisons = await buildSilhouetteComparisons(browserRun.payload.pairs, outputDir);
    const summaryPairs = browserRun.payload.pairs.map(stripPairPayload);

    const report: RuntimeReviewSummary = {
      createdAt: new Date().toISOString(),
      sourceGitSha: gitSha(),
      mode: 'projekt-143-optik-runtime-review',
      status: 'needs_human_decision',
      comparisonBasis: 'runtime_equivalent_same_scene',
      html: rel(reviewHtmlFile) ?? '',
      contactSheet: rel(contactSheetFile) ?? '',
      harnessHtml: rel(harnessFile) ?? '',
      invalidationReference: rel(invalidationReferencePath),
      decision: 'Runtime-equivalent close GLB/impostor packet is ready for owner visual review; do not close KB-OPTIK until accepted by owner or explicitly rejected with a follow-up branch.',
      ownerDecision: null,
      pairingContract: {
        clip: MATCHED_CLIP_ID,
        poseProgress: POSE_PROGRESS,
        frameIndex: FRAME_INDEX,
        camera: 'single orthographic front camera shared by all close GLB and impostor pairs',
        lighting: 'shared hemisphere plus directional light in one Three.js scene',
        weaponSockets: 'close GLBs use runtime weapon config, normalized weapon roots, runtime socket placement, and arm target solving',
        closeModelTargetHeightMeters: NPC_CLOSE_MODEL_TARGET_HEIGHT,
        imposterRuntimeHeightMeters: NPC_SPRITE_HEIGHT,
        imposterRuntimeWidthMeters: NPC_SPRITE_WIDTH,
      },
      browser: {
        headed,
        version: browserRun.browserVersion,
        userAgent: browserRun.userAgent,
      },
      pageErrors: browserRun.pageErrors,
      requestErrors: browserRun.requestErrors,
      consoleErrors: browserRun.consoleErrors,
      loadErrors: browserRun.payload.loadErrors,
      pairs: summaryPairs,
      rendererInfo: browserRun.payload.rendererInfo,
      silhouetteComparisons,
      silhouetteAggregate: buildSilhouetteAggregate(silhouetteComparisons),
    };

    writeReviewHtml(report, outputDir, reviewHtmlFile);
    writeFileSync(summaryFile, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    console.log(`Projekt 143 runtime-equivalent KB-OPTIK review ${report.status.toUpperCase()}: ${relative(process.cwd(), summaryFile)}`);
    console.log(`Contact sheet: ${relative(process.cwd(), contactSheetFile)}`);
    if (report.pageErrors.length || report.requestErrors.length || report.consoleErrors.length || report.loadErrors.length) {
      console.log('Review packet has diagnostics to inspect before owner acceptance.');
    }
  } finally {
    if (browser) await browser.close();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
