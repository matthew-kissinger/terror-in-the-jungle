#!/usr/bin/env tsx

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { PIXEL_FORGE_VEGETATION_ASSETS, type PixelForgeVegetationAsset } from '../src/config/pixelForgeAssets';
import { VEGETATION_TYPES, type VegetationTypeConfig } from '../src/config/vegetationTypes';

type AuditStatus = 'pass' | 'fail';

interface LowAngleTileGrounding {
  azimuthColumn: number;
  bottomPaddingPx: number;
  bottomPaddingMeters: number;
  visibleBaseMeters: number;
}

interface VegetationGroundingEntry {
  id: string;
  variant: string;
  tier: string;
  placement: string;
  texturePath: string;
  textureExists: boolean;
  runtimeSizeMeters: number;
  runtimeYOffsetMeters: number;
  lowAngleRow: number;
  maxSlopeDeg: number | null;
  visibleBaseMinMeters: number | null;
  visibleBaseMeanMeters: number | null;
  visibleBaseMaxMeters: number | null;
  lowAngleTiles: LowAngleTileGrounding[];
  slopeGuard: string;
  flags: string[];
}

interface VegetationGroundingAudit {
  createdAt: string;
  source: 'vegetation-grounding-audit';
  status: AuditStatus;
  thresholds: {
    alphaThreshold: number;
    minVisibleBaseMeters: number;
    maxVisibleBaseMeters: number;
    lowMidlevelSizeMeters: number;
    lowMidlevelMaxSlopeDeg: number;
    randomGroundCoverMaxSlopeDeg: number;
    randomMidlevelMaxSlopeDeg: number;
  };
  summary: {
    runtimeSpecies: number;
    flaggedSpecies: number;
  };
  entries: VegetationGroundingEntry[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const PUBLIC_ASSETS_ROOT = join(process.cwd(), 'public', 'assets');
const ALPHA_THRESHOLD = 48;
const MIN_VISIBLE_BASE_METERS = -0.3;
const MAX_VISIBLE_BASE_METERS = 0.35;
const LOW_MIDLEVEL_SIZE_METERS = 6;
const LOW_MIDLEVEL_MAX_SLOPE_DEG = 20;
const RANDOM_GROUND_COVER_MAX_SLOPE_DEG = 25;
const RANDOM_MIDLEVEL_MAX_SLOPE_DEG = 30;

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function roundMetric(value: number | null | undefined, digits = 3): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function readRgba(path: string): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function slopeGuardFor(type: VegetationTypeConfig): string {
  if (type.tier === 'canopy') return 'generator-canopy-slope-cap';
  if (type.tier === 'midLevel' && type.placement === 'poisson') return 'generator-midlevel-poisson-slope-cap';
  if (type.maxSlopeDeg !== undefined) return `type-max-slope-${type.maxSlopeDeg}`;
  return 'none';
}

async function auditEntry(
  asset: PixelForgeVegetationAsset,
  type: VegetationTypeConfig,
): Promise<VegetationGroundingEntry> {
  const texturePath = join(PUBLIC_ASSETS_ROOT, asset.colorFile);
  const textureExists = existsSync(texturePath);
  const flags: string[] = [];
  const lowAngleTiles: LowAngleTileGrounding[] = [];

  if (!textureExists) {
    flags.push('missing-texture');
  } else {
    const { data, width, height } = await readRgba(texturePath);
    const lowAngleRow = asset.tilesY - 1;

    for (let tileX = 0; tileX < asset.tilesX; tileX++) {
      let maxY = -1;
      for (let y = 0; y < asset.tileSize; y++) {
        const py = lowAngleRow * asset.tileSize + y;
        if (py >= height) continue;
        for (let x = 0; x < asset.tileSize; x++) {
          const px = tileX * asset.tileSize + x;
          if (px >= width) continue;
          const alpha = data[(py * width + px) * 4 + 3];
          if (alpha > ALPHA_THRESHOLD) {
            maxY = Math.max(maxY, y);
          }
        }
      }

      if (maxY < 0) {
        flags.push(`empty-low-angle-tile-${tileX}`);
        continue;
      }

      const bottomPaddingPx = asset.tileSize - 1 - maxY;
      const bottomPaddingMeters = (bottomPaddingPx / asset.tileSize) * type.size;
      const visibleBaseMeters = type.yOffset - type.size * 0.5 + bottomPaddingMeters;
      lowAngleTiles.push({
        azimuthColumn: tileX,
        bottomPaddingPx,
        bottomPaddingMeters: roundMetric(bottomPaddingMeters) ?? 0,
        visibleBaseMeters: roundMetric(visibleBaseMeters) ?? 0,
      });
    }
  }

  const visibleBases = lowAngleTiles.map((tile) => tile.visibleBaseMeters);
  const visibleBaseMinMeters = visibleBases.length > 0 ? Math.min(...visibleBases) : null;
  const visibleBaseMeanMeters = mean(visibleBases);
  const visibleBaseMaxMeters = visibleBases.length > 0 ? Math.max(...visibleBases) : null;

  if (visibleBaseMinMeters !== null && visibleBaseMinMeters < MIN_VISIBLE_BASE_METERS) {
    flags.push('visible-base-below-terrain');
  }
  if (visibleBaseMaxMeters !== null && visibleBaseMaxMeters > MAX_VISIBLE_BASE_METERS) {
    flags.push('visible-base-floating-above-terrain');
  }

  const lowMidlevelLeaf =
    type.tier === 'midLevel' &&
    type.placement === 'random' &&
    type.size <= LOW_MIDLEVEL_SIZE_METERS;
  if (lowMidlevelLeaf && (type.maxSlopeDeg === undefined || type.maxSlopeDeg > LOW_MIDLEVEL_MAX_SLOPE_DEG)) {
    flags.push('low-midlevel-leaf-missing-slope-cap');
  }
  const randomGroundCover = type.tier === 'groundCover' && type.placement === 'random';
  if (
    randomGroundCover &&
    (type.maxSlopeDeg === undefined || type.maxSlopeDeg > RANDOM_GROUND_COVER_MAX_SLOPE_DEG)
  ) {
    flags.push('random-ground-cover-missing-slope-cap');
  }
  const randomMidlevel = type.tier === 'midLevel' && type.placement === 'random';
  if (
    randomMidlevel &&
    (type.maxSlopeDeg === undefined || type.maxSlopeDeg > RANDOM_MIDLEVEL_MAX_SLOPE_DEG)
  ) {
    flags.push('random-midlevel-missing-slope-cap');
  }

  return {
    id: type.id,
    variant: asset.variant,
    tier: type.tier,
    placement: type.placement,
    texturePath: relative(process.cwd(), texturePath).replace(/\\/g, '/'),
    textureExists,
    runtimeSizeMeters: roundMetric(type.size) ?? 0,
    runtimeYOffsetMeters: roundMetric(type.yOffset) ?? 0,
    lowAngleRow: asset.tilesY - 1,
    maxSlopeDeg: type.maxSlopeDeg ?? null,
    visibleBaseMinMeters: roundMetric(visibleBaseMinMeters),
    visibleBaseMeanMeters: roundMetric(visibleBaseMeanMeters),
    visibleBaseMaxMeters: roundMetric(visibleBaseMaxMeters),
    lowAngleTiles,
    slopeGuard: slopeGuardFor(type),
    flags,
  };
}

function writeMarkdown(audit: VegetationGroundingAudit, path: string): void {
  const lines = [
    '# Vegetation Grounding Audit',
    '',
    `Generated: ${audit.createdAt}`,
    `Status: ${audit.status.toUpperCase()}`,
    '',
    '| Species | Tier | Placement | Visible base min/mean/max (m) | Slope guard | Flags |',
    '|---|---|---|---:|---|---|',
    ...audit.entries.map((entry) => [
      entry.id,
      entry.tier,
      entry.placement,
      `${entry.visibleBaseMinMeters ?? 'n/a'} / ${entry.visibleBaseMeanMeters ?? 'n/a'} / ${entry.visibleBaseMaxMeters ?? 'n/a'}`,
      entry.slopeGuard,
      entry.flags.length > 0 ? entry.flags.join(', ') : 'none',
    ].join(' | ')).map((row) => `| ${row} |`),
    '',
    'The visible base is computed from the actual low-angle imposter alpha row against the runtime billboard size and y-offset.',
  ];
  writeFileSync(path, `${lines.join('\n')}\n`);
}

async function main(): Promise<void> {
  const entries: VegetationGroundingEntry[] = [];

  for (const type of VEGETATION_TYPES) {
    const asset = PIXEL_FORGE_VEGETATION_ASSETS.find((candidate) => candidate.id === type.id);
    if (!asset) {
      entries.push({
        id: type.id,
        variant: 'missing-registry-entry',
        tier: type.tier,
        placement: type.placement,
        texturePath: '',
        textureExists: false,
        runtimeSizeMeters: roundMetric(type.size) ?? 0,
        runtimeYOffsetMeters: roundMetric(type.yOffset) ?? 0,
        lowAngleRow: -1,
        maxSlopeDeg: type.maxSlopeDeg ?? null,
        visibleBaseMinMeters: null,
        visibleBaseMeanMeters: null,
        visibleBaseMaxMeters: null,
        lowAngleTiles: [],
        slopeGuard: slopeGuardFor(type),
        flags: ['missing-pixel-forge-asset-registry-entry'],
      });
      continue;
    }
    entries.push(await auditEntry(asset, type));
  }

  const flaggedSpecies = entries.filter((entry) => entry.flags.length > 0).length;
  const audit: VegetationGroundingAudit = {
    createdAt: new Date().toISOString(),
    source: 'vegetation-grounding-audit',
    status: flaggedSpecies > 0 ? 'fail' : 'pass',
    thresholds: {
      alphaThreshold: ALPHA_THRESHOLD,
      minVisibleBaseMeters: MIN_VISIBLE_BASE_METERS,
      maxVisibleBaseMeters: MAX_VISIBLE_BASE_METERS,
      lowMidlevelSizeMeters: LOW_MIDLEVEL_SIZE_METERS,
      lowMidlevelMaxSlopeDeg: LOW_MIDLEVEL_MAX_SLOPE_DEG,
      randomGroundCoverMaxSlopeDeg: RANDOM_GROUND_COVER_MAX_SLOPE_DEG,
      randomMidlevelMaxSlopeDeg: RANDOM_MIDLEVEL_MAX_SLOPE_DEG,
    },
    summary: {
      runtimeSpecies: entries.length,
      flaggedSpecies,
    },
    entries,
  };

  const outputDir = join(ARTIFACT_ROOT, timestampSlug(), 'vegetation-grounding-audit');
  mkdirSync(outputDir, { recursive: true });
  const summaryJson = join(outputDir, 'summary.json');
  const summaryMd = join(outputDir, 'summary.md');
  writeFileSync(summaryJson, `${JSON.stringify(audit, null, 2)}\n`);
  writeMarkdown(audit, summaryMd);

  console.log(`Vegetation grounding audit ${audit.status.toUpperCase()}: ${relative(process.cwd(), summaryJson)}`);
  if (audit.status === 'fail') {
    for (const entry of entries.filter((candidate) => candidate.flags.length > 0)) {
      console.error(`${entry.id}: ${entry.flags.join(', ')}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
