#!/usr/bin/env tsx

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import sharp from 'sharp';
import {
  PIXEL_FORGE_NPC_CLIPS,
  PIXEL_FORGE_NPC_FACTIONS,
  type PixelForgeNpcClipAsset,
  type PixelForgeNpcClipId,
} from '../src/config/pixelForgeAssets';

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type Quantiles = {
  min: number;
  p05: number;
  median: number;
  p95: number;
  max: number;
};

type RgbaImage = {
  data: Buffer;
  width: number;
  height: number;
};

type ClipCropMap = {
  clipId: PixelForgeNpcClipId;
  width: number;
  height: number;
  tileSize: number;
  alphaThreshold: number;
  paddingPx: number;
  uncropped: boolean;
  data: number[];
  summary: {
    sourceVisibleHeightPx: Quantiles | null;
    cropHeightUv: Quantiles | null;
    cropWidthUv: Quantiles | null;
  };
};

const OUTPUT_PATH = join(process.cwd(), 'src', 'config', 'generated', 'pixelForgeNpcTileCrops.ts');
const PUBLIC_ASSETS_ROOT = join(process.cwd(), 'public', 'assets');
const OPAQUE_ALPHA_THRESHOLD = 48;
const UPRIGHT_CROP_PADDING_PX = 3;
const UNCROPPED_CLIPS = new Set<PixelForgeNpcClipId>(['death_fall_back', 'dead_pose']);

function roundMetric(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function quantiles(values: number[], digits = 4): Quantiles | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const pick = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
  return {
    min: roundMetric(pick(0), digits),
    p05: roundMetric(pick(0.05), digits),
    median: roundMetric(pick(0.5), digits),
    p95: roundMetric(pick(0.95), digits),
    max: roundMetric(pick(1), digits),
  };
}

async function readRgba(path: string): Promise<RgbaImage> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function scanTileBounds(image: RgbaImage, tileX: number, tileY: number, tileSize: number): Bounds | null {
  let minX = tileSize;
  let minY = tileSize;
  let maxX = -1;
  let maxY = -1;
  const tileOriginX = tileX * tileSize;
  const tileOriginY = tileY * tileSize;

  for (let y = 0; y < tileSize; y++) {
    for (let x = 0; x < tileSize; x++) {
      const px = tileOriginX + x;
      const py = tileOriginY + y;
      const alpha = image.data[(py * image.width + px) * 4 + 3];
      if (alpha < OPAQUE_ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX >= 0 ? { minX, minY, maxX, maxY } : null;
}

function unionBounds(left: Bounds | null, right: Bounds | null): Bounds | null {
  if (!left) return right;
  if (!right) return left;
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
  };
}

function padBounds(bounds: Bounds, tileSize: number, paddingPx: number): Bounds {
  return {
    minX: Math.max(0, bounds.minX - paddingPx),
    minY: Math.max(0, bounds.minY - paddingPx),
    maxX: Math.min(tileSize - 1, bounds.maxX + paddingPx),
    maxY: Math.min(tileSize - 1, bounds.maxY + paddingPx),
  };
}

function encodeUv(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function encodeBounds(bounds: Bounds, tileSize: number): [number, number, number, number] {
  return [
    encodeUv(bounds.minX / tileSize),
    encodeUv(bounds.minY / tileSize),
    encodeUv((bounds.maxX + 1) / tileSize),
    encodeUv((bounds.maxY + 1) / tileSize),
  ];
}

function fullTileBounds(tileSize: number): Bounds {
  return { minX: 0, minY: 0, maxX: tileSize - 1, maxY: tileSize - 1 };
}

async function loadClipFactionImages(clip: PixelForgeNpcClipAsset): Promise<RgbaImage[]> {
  const images: RgbaImage[] = [];
  for (const faction of PIXEL_FORGE_NPC_FACTIONS) {
    const path = join(
      PUBLIC_ASSETS_ROOT,
      'pixel-forge',
      'npcs',
      faction.packageFaction,
      clip.id,
      'animated-albedo-packed.png',
    );
    if (!existsSync(path)) {
      throw new Error(`Missing Pixel Forge NPC atlas for crop generation: ${relative(process.cwd(), path)}`);
    }
    images.push(await readRgba(path));
  }
  return images;
}

async function buildClipCropMap(clip: PixelForgeNpcClipAsset): Promise<ClipCropMap> {
  const width = clip.viewGridX * clip.framesX;
  const height = clip.viewGridY * clip.framesY;
  const expectedWidthPx = width * clip.tileSize;
  const expectedHeightPx = height * clip.tileSize;
  const images = await loadClipFactionImages(clip);
  for (const image of images) {
    if (image.width !== expectedWidthPx || image.height !== expectedHeightPx) {
      throw new Error(
        `Unexpected ${clip.id} atlas dimensions: ${image.width}x${image.height}; expected ${expectedWidthPx}x${expectedHeightPx}`,
      );
    }
  }

  const uncropped = UNCROPPED_CLIPS.has(clip.id);
  const paddingPx = uncropped ? 0 : UPRIGHT_CROP_PADDING_PX;
  const data: number[] = [];
  const sourceVisibleHeights: number[] = [];
  const cropHeights: number[] = [];
  const cropWidths: number[] = [];

  for (let tileY = 0; tileY < height; tileY++) {
    for (let tileX = 0; tileX < width; tileX++) {
      let bounds: Bounds | null = null;
      for (const image of images) {
        bounds = unionBounds(bounds, scanTileBounds(image, tileX, tileY, clip.tileSize));
      }
      const sourceBounds = bounds ?? fullTileBounds(clip.tileSize);
      const cropBounds = uncropped ? fullTileBounds(clip.tileSize) : padBounds(sourceBounds, clip.tileSize, paddingPx);
      sourceVisibleHeights.push(sourceBounds.maxY - sourceBounds.minY + 1);
      cropHeights.push((cropBounds.maxY - cropBounds.minY + 1) / clip.tileSize);
      cropWidths.push((cropBounds.maxX - cropBounds.minX + 1) / clip.tileSize);
      data.push(...encodeBounds(cropBounds, clip.tileSize));
    }
  }

  return {
    clipId: clip.id,
    width,
    height,
    tileSize: clip.tileSize,
    alphaThreshold: OPAQUE_ALPHA_THRESHOLD,
    paddingPx,
    uncropped,
    data,
    summary: {
      sourceVisibleHeightPx: quantiles(sourceVisibleHeights, 2),
      cropHeightUv: quantiles(cropHeights),
      cropWidthUv: quantiles(cropWidths),
    },
  };
}

function formatNumberArray(values: readonly number[], indent = '      '): string {
  const chunks: string[] = [];
  for (let index = 0; index < values.length; index += 32) {
    chunks.push(`${indent}${values.slice(index, index + 32).join(', ')},`);
  }
  return chunks.join('\n');
}

function formatQuantiles(quantilesValue: Quantiles | null): string {
  if (!quantilesValue) return 'null';
  return `{ min: ${quantilesValue.min}, p05: ${quantilesValue.p05}, median: ${quantilesValue.median}, p95: ${quantilesValue.p95}, max: ${quantilesValue.max} }`;
}

function buildSource(maps: ClipCropMap[]): string {
  const entries = maps.map((map) => (
`  ${map.clipId}: {
    width: ${map.width},
    height: ${map.height},
    tileSize: ${map.tileSize},
    alphaThreshold: ${map.alphaThreshold},
    paddingPx: ${map.paddingPx},
    uncropped: ${map.uncropped},
    summary: {
      sourceVisibleHeightPx: ${formatQuantiles(map.summary.sourceVisibleHeightPx)},
      cropHeightUv: ${formatQuantiles(map.summary.cropHeightUv)},
      cropWidthUv: ${formatQuantiles(map.summary.cropWidthUv)},
    },
    data: [
${formatNumberArray(map.data)}
    ],
  }`
  )).join(',\n');

  return `// Generated by scripts/generate-pixel-forge-npc-tile-crops.ts. Do not edit manually.
// Stores per-atlas-tile UV crops as RGBA8: minU, minV, maxU, maxV.

import type { PixelForgeNpcClipId } from '../pixelForgeAssets';

export interface PixelForgeNpcTileCropMap {
  width: number;
  height: number;
  tileSize: number;
  alphaThreshold: number;
  paddingPx: number;
  uncropped: boolean;
  summary: {
    sourceVisibleHeightPx: { min: number; p05: number; median: number; p95: number; max: number } | null;
    cropHeightUv: { min: number; p05: number; median: number; p95: number; max: number } | null;
    cropWidthUv: { min: number; p05: number; median: number; p95: number; max: number } | null;
  };
  data: readonly number[];
}

export const PIXEL_FORGE_NPC_TILE_CROP_MAPS: Record<PixelForgeNpcClipId, PixelForgeNpcTileCropMap> = {
${entries},
};

export function getPixelForgeNpcTileCropMap(clipId: PixelForgeNpcClipId): PixelForgeNpcTileCropMap {
  return PIXEL_FORGE_NPC_TILE_CROP_MAPS[clipId];
}
`;
}

async function run(): Promise<void> {
  const maps = [];
  for (const clip of PIXEL_FORGE_NPC_CLIPS) {
    maps.push(await buildClipCropMap(clip));
  }
  const source = buildSource(maps);
  const checkOnly = process.argv.includes('--check');
  if (checkOnly) {
    const current = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, 'utf-8') : null;
    if (current !== source) {
      console.error(`Pixel Forge NPC tile crop map is stale. Run npm run assets:generate-npc-crops.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Pixel Forge NPC tile crop map is current: ${relative(process.cwd(), OUTPUT_PATH)}`);
    return;
  }

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, source, 'utf-8');
  console.log(`Wrote Pixel Forge NPC tile crop map: ${relative(process.cwd(), OUTPUT_PATH)}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
