#!/usr/bin/env tsx

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import {
  PIXEL_FORGE_NPC_CLIPS,
  PIXEL_FORGE_NPC_FACTIONS,
  PIXEL_FORGE_VEGETATION_ASSETS,
  type PixelForgeNpcClipAsset,
  type PixelForgeNpcFactionAsset,
  type PixelForgeVegetationAsset,
} from '../src/config/pixelForgeAssets';
import { VEGETATION_TYPES } from '../src/config/vegetationTypes';
import {
  NPC_CLOSE_MODEL_TARGET_HEIGHT,
  NPC_SPRITE_HEIGHT,
  NPC_SPRITE_RENDER_Y_OFFSET,
  NPC_SPRITE_WIDTH,
} from '../src/systems/combat/CombatantMeshFactory';

type Quantiles = {
  min: number;
  p05: number;
  median: number;
  p95: number;
  max: number;
};

type ImageAlphaStats = {
  width: number;
  height: number;
  sampledPixels: number;
  opaquePixels: number;
  opaqueCoverage: number;
  meanOpaqueLuma: number | null;
  meanOpaqueChroma: number | null;
  meanOpaqueAlpha: number | null;
};

type TileAlphaStats = {
  tileCount: number;
  nonEmptyTileCount: number;
  visibleHeightPx: Quantiles | null;
  visibleWidthPx: Quantiles | null;
  opaqueCoverage: Quantiles | null;
  meanOpaqueLuma: Quantiles | null;
};

type NpcOpticsEntry = {
  faction: string;
  packageFaction: string;
  clip: string;
  texturePath: string;
  metaPath: string;
  textureExists: boolean;
  metaExists: boolean;
  atlasWidth: number;
  atlasHeight: number;
  expectedAtlasWidth: number;
  expectedAtlasHeight: number;
  tileSize: number;
  sourceTriangles: number | null;
  sourceBboxHeightMeters: number | null;
  runtimePlaneWidthMeters: number;
  runtimePlaneHeightMeters: number;
  runtimeToSourceHeightRatio: number | null;
  medianVisibleTileHeightPx: number | null;
  medianVisibleRuntimeHeightMeters: number | null;
  runtimePixelsPerMeter: number;
  sourcePixelsPerMeter: number | null;
  imageStats: ImageAlphaStats | null;
  tileStats: TileAlphaStats | null;
  flags: string[];
};

type VegetationOpticsEntry = {
  id: string;
  tier: string;
  shaderProfile: string;
  texturePath: string;
  normalPath: string;
  metaPath: string;
  textureExists: boolean;
  normalExists: boolean;
  metaExists: boolean;
  atlasWidth: number;
  atlasHeight: number;
  expectedAtlasWidth: number;
  expectedAtlasHeight: number;
  tileSize: number;
  sourceBboxHeightMeters: number | null;
  declaredWorldSizeMeters: number;
  runtimeSizeMeters: number | null;
  runtimeToDeclaredSizeRatio: number | null;
  medianVisibleTileHeightPx: number | null;
  runtimePixelsPerMeter: number | null;
  imageStats: ImageAlphaStats | null;
  tileStats: TileAlphaStats | null;
  flags: string[];
};

type OpticsAuditReport = {
  createdAt: string;
  source: string;
  runtimeContracts: {
    npc: {
      planeWidthMeters: number;
      planeHeightMeters: number;
      closeModelTargetHeightMeters: number;
      renderYOffsetMeters: number;
      shaderNotes: string[];
    };
    vegetation: {
      shaderNotes: string[];
    };
  };
  summary: {
    npcEntries: number;
    npcFlaggedEntries: number;
    vegetationEntries: number;
    vegetationFlaggedEntries: number;
    npcMedianVisibleTileHeightPx: Quantiles | null;
    npcRuntimeToSourceHeightRatio: Quantiles | null;
    npcRuntimePixelsPerMeter: number;
    vegetationRuntimePixelsPerMeter: Quantiles | null;
  };
  npcEntries: NpcOpticsEntry[];
  vegetationEntries: VegetationOpticsEntry[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const PUBLIC_ASSETS_ROOT = join(process.cwd(), 'public', 'assets');
const OPAQUE_ALPHA_THRESHOLD = 48;

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function roundMetric(value: number | null | undefined, digits = 2): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Number(value.toFixed(digits));
}

function quantiles(values: number[], digits = 2): Quantiles | null {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const pick = (p: number): number => finite[Math.min(finite.length - 1, Math.floor((finite.length - 1) * p))];
  return {
    min: roundMetric(pick(0), digits) ?? 0,
    p05: roundMetric(pick(0.05), digits) ?? 0,
    median: roundMetric(pick(0.5), digits) ?? 0,
    p95: roundMetric(pick(0.95), digits) ?? 0,
    max: roundMetric(pick(1), digits) ?? 0,
  };
}

async function readRgba(path: string): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function pixelLuma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function pixelChroma(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

async function computeImageAlphaStats(path: string): Promise<ImageAlphaStats> {
  const { data, width, height } = await readRgba(path);
  let opaquePixels = 0;
  let lumaSum = 0;
  let chromaSum = 0;
  let alphaSum = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3];
    if (alpha <= OPAQUE_ALPHA_THRESHOLD) continue;
    opaquePixels++;
    lumaSum += pixelLuma(data[offset], data[offset + 1], data[offset + 2]);
    chromaSum += pixelChroma(data[offset], data[offset + 1], data[offset + 2]);
    alphaSum += alpha;
  }

  return {
    width,
    height,
    sampledPixels: width * height,
    opaquePixels,
    opaqueCoverage: roundMetric(opaquePixels / Math.max(1, width * height), 4) ?? 0,
    meanOpaqueLuma: opaquePixels > 0 ? roundMetric(lumaSum / opaquePixels, 2) : null,
    meanOpaqueChroma: opaquePixels > 0 ? roundMetric(chromaSum / opaquePixels, 2) : null,
    meanOpaqueAlpha: opaquePixels > 0 ? roundMetric(alphaSum / opaquePixels, 2) : null,
  };
}

async function computeTileAlphaStats(
  path: string,
  tileSize: number,
  columns: number,
  rows: number,
): Promise<TileAlphaStats> {
  const { data, width, height } = await readRgba(path);
  const visibleHeights: number[] = [];
  const visibleWidths: number[] = [];
  const coverages: number[] = [];
  const meanLumas: number[] = [];
  const totalTiles = columns * rows;

  for (let tileY = 0; tileY < rows; tileY++) {
    for (let tileX = 0; tileX < columns; tileX++) {
      let minX = tileSize;
      let minY = tileSize;
      let maxX = -1;
      let maxY = -1;
      let opaquePixels = 0;
      let lumaSum = 0;

      for (let y = 0; y < tileSize; y++) {
        const py = tileY * tileSize + y;
        if (py >= height) continue;
        for (let x = 0; x < tileSize; x++) {
          const px = tileX * tileSize + x;
          if (px >= width) continue;
          const offset = (py * width + px) * 4;
          const alpha = data[offset + 3];
          if (alpha <= OPAQUE_ALPHA_THRESHOLD) continue;
          opaquePixels++;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          lumaSum += pixelLuma(data[offset], data[offset + 1], data[offset + 2]);
        }
      }

      if (opaquePixels === 0) continue;
      visibleHeights.push(maxY - minY + 1);
      visibleWidths.push(maxX - minX + 1);
      coverages.push(opaquePixels / (tileSize * tileSize));
      meanLumas.push(lumaSum / opaquePixels);
    }
  }

  return {
    tileCount: totalTiles,
    nonEmptyTileCount: visibleHeights.length,
    visibleHeightPx: quantiles(visibleHeights),
    visibleWidthPx: quantiles(visibleWidths),
    opaqueCoverage: quantiles(coverages, 4),
    meanOpaqueLuma: quantiles(meanLumas),
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readMetaNumber(meta: unknown, path: string[]): number | null {
  let current: unknown = meta;
  for (const part of path) {
    if (!current || typeof current !== 'object' || !(part in current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : null;
}

function runtimeVegetationSize(id: string): number | null {
  const runtime = VEGETATION_TYPES.find((type) => type.id === id);
  return runtime?.size ?? null;
}

function npcTexturePath(faction: PixelForgeNpcFactionAsset, clip: PixelForgeNpcClipAsset): string {
  return join(
    PUBLIC_ASSETS_ROOT,
    'pixel-forge',
    'npcs',
    faction.packageFaction,
    clip.id,
    'animated-albedo-packed.png',
  );
}

function npcMetaPath(faction: PixelForgeNpcFactionAsset, clip: PixelForgeNpcClipAsset): string {
  return join(
    PUBLIC_ASSETS_ROOT,
    'pixel-forge',
    'npcs',
    faction.packageFaction,
    clip.id,
    'animated-imposter.json',
  );
}

async function auditNpcEntry(
  faction: PixelForgeNpcFactionAsset,
  clip: PixelForgeNpcClipAsset,
): Promise<NpcOpticsEntry> {
  const texturePath = npcTexturePath(faction, clip);
  const metaPath = npcMetaPath(faction, clip);
  const textureExists = existsSync(texturePath);
  const metaExists = existsSync(metaPath);
  const expectedAtlasWidth = clip.viewGridX * clip.framesX * clip.tileSize;
  const expectedAtlasHeight = clip.viewGridY * clip.framesY * clip.tileSize;
  const flags: string[] = [];

  let sourceBboxHeightMeters: number | null = null;
  let sourceTriangles: number | null = null;
  let atlasWidth = 0;
  let atlasHeight = 0;
  if (metaExists) {
    const meta = readJson(metaPath);
    sourceBboxHeightMeters = readMetaNumber(meta, ['bbox', 'worldSize']);
    sourceTriangles = readMetaNumber(meta, ['source', 'tris']);
    atlasWidth = readMetaNumber(meta, ['textures', 'color', 'width']) ?? 0;
    atlasHeight = readMetaNumber(meta, ['textures', 'color', 'height']) ?? 0;
  } else {
    flags.push('missing-metadata');
  }

  if (!textureExists) flags.push('missing-texture');
  if (atlasWidth !== expectedAtlasWidth || atlasHeight !== expectedAtlasHeight) {
    flags.push('atlas-dimensions-mismatch-registry');
  }

  let imageStats: ImageAlphaStats | null = null;
  let tileStats: TileAlphaStats | null = null;
  if (textureExists) {
    imageStats = await computeImageAlphaStats(texturePath);
    tileStats = await computeTileAlphaStats(
      texturePath,
      clip.tileSize,
      clip.viewGridX * clip.framesX,
      clip.viewGridY * clip.framesY,
    );
  }

  const runtimeToSourceHeightRatio = sourceBboxHeightMeters
    ? NPC_SPRITE_HEIGHT / sourceBboxHeightMeters
    : null;
  const medianVisibleTileHeightPx = tileStats?.visibleHeightPx?.median ?? null;
  const medianVisibleRuntimeHeightMeters = medianVisibleTileHeightPx === null
    ? null
    : NPC_SPRITE_HEIGHT * (medianVisibleTileHeightPx / clip.tileSize);
  const runtimePixelsPerMeter = clip.tileSize / NPC_SPRITE_HEIGHT;
  const sourcePixelsPerMeter = sourceBboxHeightMeters && medianVisibleTileHeightPx !== null
    ? medianVisibleTileHeightPx / sourceBboxHeightMeters
    : null;

  if (runtimeToSourceHeightRatio !== null && runtimeToSourceHeightRatio > 2) {
    flags.push('runtime-plane-stretches-bake-height-over-2x');
  }
  if (medianVisibleTileHeightPx !== null && medianVisibleTileHeightPx < clip.tileSize * 0.8) {
    flags.push('visible-silhouette-uses-less-than-80pct-tile-height');
  }
  if (runtimePixelsPerMeter < 24) {
    flags.push('runtime-pixels-per-meter-below-24');
  }
  if ((imageStats?.meanOpaqueLuma ?? 255) < 55) {
    flags.push('low-opaque-luma');
  }

  return {
    faction: faction.runtimeFaction,
    packageFaction: faction.packageFaction,
    clip: clip.id,
    texturePath,
    metaPath,
    textureExists,
    metaExists,
    atlasWidth,
    atlasHeight,
    expectedAtlasWidth,
    expectedAtlasHeight,
    tileSize: clip.tileSize,
    sourceTriangles,
    sourceBboxHeightMeters: roundMetric(sourceBboxHeightMeters, 3),
    runtimePlaneWidthMeters: NPC_SPRITE_WIDTH,
    runtimePlaneHeightMeters: NPC_SPRITE_HEIGHT,
    runtimeToSourceHeightRatio: roundMetric(runtimeToSourceHeightRatio, 2),
    medianVisibleTileHeightPx,
    medianVisibleRuntimeHeightMeters: roundMetric(medianVisibleRuntimeHeightMeters, 2),
    runtimePixelsPerMeter: roundMetric(runtimePixelsPerMeter, 2) ?? runtimePixelsPerMeter,
    sourcePixelsPerMeter: roundMetric(sourcePixelsPerMeter, 2),
    imageStats,
    tileStats,
    flags,
  };
}

async function auditVegetationEntry(asset: PixelForgeVegetationAsset): Promise<VegetationOpticsEntry> {
  const texturePath = join(PUBLIC_ASSETS_ROOT, asset.colorFile);
  const normalPath = join(PUBLIC_ASSETS_ROOT, asset.normalFile);
  const metaPath = join(PUBLIC_ASSETS_ROOT, asset.sourceMetaFile);
  const textureExists = existsSync(texturePath);
  const normalExists = existsSync(normalPath);
  const metaExists = existsSync(metaPath);
  const expectedAtlasWidth = asset.tilesX * asset.tileSize;
  const expectedAtlasHeight = asset.tilesY * asset.tileSize;
  const flags: string[] = [];
  const runtimeSizeMeters = runtimeVegetationSize(asset.id);
  let sourceBboxHeightMeters: number | null = null;
  let atlasWidth = 0;
  let atlasHeight = 0;

  if (metaExists) {
    const meta = readJson(metaPath);
    const minY = readMetaNumber(meta, ['bbox', 'min', '1']);
    const maxY = readMetaNumber(meta, ['bbox', 'max', '1']);
    sourceBboxHeightMeters = minY !== null && maxY !== null ? maxY - minY : readMetaNumber(meta, ['worldSize']);
    atlasWidth = readMetaNumber(meta, ['atlasWidth']) ?? 0;
    atlasHeight = readMetaNumber(meta, ['atlasHeight']) ?? 0;
  } else {
    flags.push('missing-metadata');
  }

  if (!textureExists) flags.push('missing-texture');
  if (!normalExists && asset.shaderProfile === 'normal-lit') flags.push('missing-normal-texture');
  if (atlasWidth !== expectedAtlasWidth || atlasHeight !== expectedAtlasHeight) {
    flags.push('atlas-dimensions-mismatch-registry');
  }

  let imageStats: ImageAlphaStats | null = null;
  let tileStats: TileAlphaStats | null = null;
  if (textureExists) {
    imageStats = await computeImageAlphaStats(texturePath);
    tileStats = await computeTileAlphaStats(texturePath, asset.tileSize, asset.tilesX, asset.tilesY);
  }

  const medianVisibleTileHeightPx = tileStats?.visibleHeightPx?.median ?? null;
  const runtimeToDeclaredSizeRatio = runtimeSizeMeters === null ? null : runtimeSizeMeters / asset.worldSize;
  const runtimePixelsPerMeter = runtimeSizeMeters === null ? null : asset.tileSize / runtimeSizeMeters;

  if (runtimeToDeclaredSizeRatio !== null && runtimeToDeclaredSizeRatio > 1.5) {
    flags.push('runtime-size-scales-source-over-1p5x');
  }
  if (runtimePixelsPerMeter !== null && runtimePixelsPerMeter > 80) {
    flags.push('vegetation-oversampled-above-80px-per-meter');
  }
  if ((imageStats?.meanOpaqueLuma ?? 255) < 55) {
    flags.push('low-opaque-luma');
  }
  if (asset.shaderProfile === 'normal-lit' && !asset.normalFile) {
    flags.push('normal-lit-without-normal-file');
  }

  return {
    id: asset.id,
    tier: asset.tier,
    shaderProfile: asset.shaderProfile,
    texturePath,
    normalPath,
    metaPath,
    textureExists,
    normalExists,
    metaExists,
    atlasWidth,
    atlasHeight,
    expectedAtlasWidth,
    expectedAtlasHeight,
    tileSize: asset.tileSize,
    sourceBboxHeightMeters: roundMetric(sourceBboxHeightMeters, 3),
    declaredWorldSizeMeters: asset.worldSize,
    runtimeSizeMeters: roundMetric(runtimeSizeMeters, 3),
    runtimeToDeclaredSizeRatio: roundMetric(runtimeToDeclaredSizeRatio, 2),
    medianVisibleTileHeightPx,
    runtimePixelsPerMeter: roundMetric(runtimePixelsPerMeter, 2),
    imageStats,
    tileStats,
    flags,
  };
}

async function main(): Promise<void> {
  const npcEntries: NpcOpticsEntry[] = [];
  for (const faction of PIXEL_FORGE_NPC_FACTIONS) {
    for (const clip of PIXEL_FORGE_NPC_CLIPS) {
      npcEntries.push(await auditNpcEntry(faction, clip));
    }
  }

  const vegetationEntries: VegetationOpticsEntry[] = [];
  for (const asset of PIXEL_FORGE_VEGETATION_ASSETS) {
    vegetationEntries.push(await auditVegetationEntry(asset));
  }

  const report: OpticsAuditReport = {
    createdAt: new Date().toISOString(),
    source: 'scripts/pixel-forge-imposter-optics-audit.ts',
    runtimeContracts: {
      npc: {
        planeWidthMeters: NPC_SPRITE_WIDTH,
        planeHeightMeters: NPC_SPRITE_HEIGHT,
        closeModelTargetHeightMeters: NPC_CLOSE_MODEL_TARGET_HEIGHT,
        renderYOffsetMeters: NPC_SPRITE_RENDER_Y_OFFSET,
        shaderNotes: [
          'NPC impostors render through CombatantMeshFactory ShaderMaterial, not the Three standard/PBR material path used by close GLBs.',
          'NPC impostor shader applies readability, exposure, min light, and top light constants, then outputs straight alpha.',
          'NPC impostor shader does not consume the atmosphere lighting snapshot used by vegetation billboards.',
        ],
      },
      vegetation: {
        shaderNotes: [
          'Vegetation impostors render through GPUBillboardVegetation RawShaderMaterial with atmosphere lighting uniforms.',
          'Vegetation shader outputs premultiplied alpha and uses custom One/OneMinusSrcAlpha blending.',
          'Normal-lit vegetation samples capture-view normal atlases; hemisphere ground-cover does not.',
        ],
      },
    },
    summary: {
      npcEntries: npcEntries.length,
      npcFlaggedEntries: npcEntries.filter((entry) => entry.flags.length > 0).length,
      vegetationEntries: vegetationEntries.length,
      vegetationFlaggedEntries: vegetationEntries.filter((entry) => entry.flags.length > 0).length,
      npcMedianVisibleTileHeightPx: quantiles(
        npcEntries
          .map((entry) => entry.medianVisibleTileHeightPx)
          .filter((value): value is number => value !== null),
      ),
      npcRuntimeToSourceHeightRatio: quantiles(
        npcEntries
          .map((entry) => entry.runtimeToSourceHeightRatio)
          .filter((value): value is number => value !== null),
      ),
      npcRuntimePixelsPerMeter: roundMetric(PIXEL_FORGE_NPC_CLIPS[0].tileSize / NPC_SPRITE_HEIGHT, 2)
        ?? PIXEL_FORGE_NPC_CLIPS[0].tileSize / NPC_SPRITE_HEIGHT,
      vegetationRuntimePixelsPerMeter: quantiles(
        vegetationEntries
          .map((entry) => entry.runtimePixelsPerMeter)
          .filter((value): value is number => value !== null),
      ),
    },
    npcEntries,
    vegetationEntries,
  };

  const artifactDir = join(ARTIFACT_ROOT, timestampSlug(), 'pixel-forge-imposter-optics-audit');
  mkdirSync(artifactDir, { recursive: true });
  const reportPath = join(artifactDir, 'optics-audit.json');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Pixel Forge imposter optics audit wrote ${reportPath}`);
  console.log(
    `NPC flagged ${report.summary.npcFlaggedEntries}/${report.summary.npcEntries}; `
    + `vegetation flagged ${report.summary.vegetationFlaggedEntries}/${report.summary.vegetationEntries}`,
  );
  console.log(
    `NPC median tile visible height=${report.summary.npcMedianVisibleTileHeightPx?.median ?? 'n/a'}px; `
    + `runtime/source height ratio median=${report.summary.npcRuntimeToSourceHeightRatio?.median ?? 'n/a'}; `
    + `runtime pixels/m=${report.summary.npcRuntimePixelsPerMeter}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
