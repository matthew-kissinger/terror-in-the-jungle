#!/usr/bin/env tsx

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  PIXEL_FORGE_NPC_CLIPS,
  PIXEL_FORGE_NPC_FACTIONS,
  PIXEL_FORGE_TEXTURE_ASSETS,
  PIXEL_FORGE_VEGETATION_ASSETS,
  type PixelForgeVegetationAsset,
} from '../src/config/pixelForgeAssets';
import { VEGETATION_TYPES } from '../src/config/vegetationTypes';

type ImageFormat = 'png' | 'jpg' | 'webp';

type ImageDimensions = {
  width: number;
  height: number;
  format: ImageFormat;
};

type TextureKind = 'vegetation-color' | 'vegetation-normal' | 'npc-albedo';

type RemediationCandidate = {
  action: string;
  targetWidth: number;
  targetHeight: number;
  targetTileSize: number | null;
  targetEstimatedMipmappedMiB: number;
  estimatedMipmappedMiBSaved: number;
  notes: string[];
};

type TextureAuditEntry = {
  name: string;
  file: string;
  absoluteFile: string;
  category: string;
  kind: TextureKind;
  exists: boolean;
  width: number;
  height: number;
  expectedWidth: number;
  expectedHeight: number;
  format: ImageFormat | 'missing' | 'unknown';
  declaredWorldSize: number | null;
  runtimeWorldSize: number | null;
  atlasTileSize: number | null;
  pixelsPerDeclaredMeter: number | null;
  pixelsPerRuntimeMeter: number | null;
  sourceBytes: number;
  pixelCount: number;
  estimatedRgbaBytes: number;
  estimatedMipmappedRgbaBytes: number;
  estimatedMipmappedMiB: number;
  remediationCandidate: RemediationCandidate | null;
  flags: string[];
};

type GroupSummary = {
  count: number;
  sourceBytes: number;
  estimatedMipmappedRgbaBytes: number;
  estimatedMipmappedMiB: number;
  estimatedCandidateMipmappedMiB: number;
  estimatedCandidateSavingsMiB: number;
};

type TextureAuditReport = {
  createdAt: string;
  source: string;
  budgets: {
    warnTextureMiB: number;
    failTextureMiB: number;
    notes: string[];
  };
  summary: {
    totalTextures: number;
    missingTextures: number;
    flaggedTextures: number;
    totalSourceBytes: number;
    totalEstimatedMipmappedRgbaBytes: number;
    totalEstimatedMipmappedMiB: number;
    totalEstimatedCandidateMipmappedMiB: number;
    totalEstimatedCandidateSavingsMiB: number;
    scenarioEstimates: Record<string, {
      estimatedMipmappedMiB: number;
      estimatedSavingsMiB: number;
      notes: string[];
    }>;
    byKind: Record<TextureKind, GroupSummary>;
  };
  entries: TextureAuditEntry[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const PUBLIC_ASSETS_ROOT = join(process.cwd(), 'public', 'assets');
const WARN_TEXTURE_MIB = 16;
const FAIL_TEXTURE_MIB = 32;
const TARGET_VEGETATION_TILE_SIZE = 256;
const TARGET_NPC_TILE_SIZE = 64;
const TARGET_NPC_PADDED_WIDTH = 2048;
const TARGET_NPC_PADDED_HEIGHT = 1024;
const BYTES_PER_RGBA_PIXEL = 4;
const MIP_CHAIN_FACTOR = 4 / 3;
const MIB = 1024 * 1024;

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function readImageDimensions(path: string): ImageDimensions | null {
  const data = readFileSync(path);

  if (data.length >= 24 && data[0] === 0x89 && data.toString('ascii', 1, 4) === 'PNG') {
    return {
      width: data.readUInt32BE(16),
      height: data.readUInt32BE(20),
      format: 'png',
    };
  }

  if (data.length >= 10 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = data[offset + 1];
      const length = data.readUInt16BE(offset + 2);
      const isStartOfFrame =
        (marker >= 0xc0 && marker <= 0xc3)
        || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb)
        || (marker >= 0xcd && marker <= 0xcf);

      if (isStartOfFrame) {
        return {
          width: data.readUInt16BE(offset + 7),
          height: data.readUInt16BE(offset + 5),
          format: 'jpg',
        };
      }
      offset += 2 + length;
    }
  }

  if (data.length >= 30 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = data.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return {
        width: data.readUIntLE(24, 3) + 1,
        height: data.readUIntLE(27, 3) + 1,
        format: 'webp',
      };
    }
    if (chunk === 'VP8L') {
      const bits = data.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
        format: 'webp',
      };
    }
    if (chunk === 'VP8 ') {
      return {
        width: data.readUInt16LE(26) & 0x3fff,
        height: data.readUInt16LE(28) & 0x3fff,
        format: 'webp',
      };
    }
  }

  return null;
}

function expectedDimensionsForTexture(name: string): { width: number; height: number; kind: TextureKind } {
  const vegetation = PIXEL_FORGE_VEGETATION_ASSETS.find(
    (asset) => asset.textureName === name || asset.normalTextureName === name,
  );
  if (vegetation) {
    return {
      width: vegetation.tilesX * vegetation.tileSize,
      height: vegetation.tilesY * vegetation.tileSize,
      kind: vegetation.normalTextureName === name ? 'vegetation-normal' : 'vegetation-color',
    };
  }

  const npcClip = PIXEL_FORGE_NPC_CLIPS.find((clip) => name.endsWith(`.${clip.id}.color`));
  if (!npcClip) {
    return { width: 0, height: 0, kind: 'npc-albedo' };
  }

  return {
    width: npcClip.viewGridX * npcClip.framesX * npcClip.tileSize,
    height: npcClip.viewGridY * npcClip.framesY * npcClip.tileSize,
    kind: 'npc-albedo',
  };
}

function vegetationForTexture(name: string): PixelForgeVegetationAsset | undefined {
  return PIXEL_FORGE_VEGETATION_ASSETS.find(
    (asset) => asset.textureName === name || asset.normalTextureName === name,
  );
}

function runtimeSizeForVegetation(id: string): number | null {
  const runtime = VEGETATION_TYPES.find((type) => type.id === id);
  return runtime?.size ?? null;
}

function roundedMetric(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(2));
}

function estimateMipmappedMiB(width: number, height: number): number {
  return Number(((width * height * BYTES_PER_RGBA_PIXEL * MIP_CHAIN_FACTOR) / MIB).toFixed(2));
}

function buildRemediationCandidate(
  kind: TextureKind,
  currentMiB: number,
  vegetation: PixelForgeVegetationAsset | undefined,
  runtimeWorldSize: number | null,
  flags: string[],
): RemediationCandidate | null {
  if (flags.length === 0) {
    return null;
  }

  if (vegetation) {
    const targetWidth = vegetation.tilesX * TARGET_VEGETATION_TILE_SIZE;
    const targetHeight = vegetation.tilesY * TARGET_VEGETATION_TILE_SIZE;
    const targetMiB = estimateMipmappedMiB(targetWidth, targetHeight);
    const targetPixelsPerRuntimeMeter = runtimeWorldSize
      ? Number((TARGET_VEGETATION_TILE_SIZE / runtimeWorldSize).toFixed(2))
      : null;

    return {
      action: 'regenerate-vegetation-atlas',
      targetWidth,
      targetHeight,
      targetTileSize: TARGET_VEGETATION_TILE_SIZE,
      targetEstimatedMipmappedMiB: targetMiB,
      estimatedMipmappedMiBSaved: Number(Math.max(0, currentMiB - targetMiB).toFixed(2)),
      notes: [
        `Regenerate ${kind} atlas at ${TARGET_VEGETATION_TILE_SIZE}px tiles while preserving ${vegetation.tilesX}x${vegetation.tilesY} layout.`,
        targetPixelsPerRuntimeMeter === null
          ? 'Runtime pixels-per-meter unavailable.'
          : `Target density would be ${targetPixelsPerRuntimeMeter}px per runtime meter.`,
        vegetation.normalTextureName
          ? 'If this is a normal atlas, validate normal-lit quality against hemisphere-only fallback before accepting the upload cost.'
          : 'Validate albedo edge bleed and color-space metadata after regeneration.',
      ],
    };
  }

  if (kind === 'npc-albedo') {
    const targetMiB = estimateMipmappedMiB(TARGET_NPC_PADDED_WIDTH, TARGET_NPC_PADDED_HEIGHT);
    return {
      action: 'regenerate-npc-atlas',
      targetWidth: TARGET_NPC_PADDED_WIDTH,
      targetHeight: TARGET_NPC_PADDED_HEIGHT,
      targetTileSize: TARGET_NPC_TILE_SIZE,
      targetEstimatedMipmappedMiB: targetMiB,
      estimatedMipmappedMiBSaved: Number(Math.max(0, currentMiB - targetMiB).toFixed(2)),
      notes: [
        `Regenerate animated NPC atlas with ${TARGET_NPC_TILE_SIZE}px frames, then pad to ${TARGET_NPC_PADDED_WIDTH}x${TARGET_NPC_PADDED_HEIGHT} if mipmapped power-of-two upload remains required.`,
        'This keeps the 7x7 view grid and 4x2 frame sheet contract while reducing per-atlas residency below the current warning threshold.',
      ],
    };
  }

  return null;
}

function createEntry(asset: (typeof PIXEL_FORGE_TEXTURE_ASSETS)[number]): TextureAuditEntry {
  const absoluteFile = join(PUBLIC_ASSETS_ROOT, asset.file);
  const exists = existsSync(absoluteFile);
  const expected = expectedDimensionsForTexture(asset.name);
  const vegetation = vegetationForTexture(asset.name);
  const runtimeWorldSize = vegetation ? runtimeSizeForVegetation(vegetation.id) : null;
  const pixelsPerDeclaredMeter = vegetation ? vegetation.tileSize / vegetation.worldSize : null;
  const pixelsPerRuntimeMeter = vegetation && runtimeWorldSize ? vegetation.tileSize / runtimeWorldSize : null;

  if (!exists) {
    return {
      name: asset.name,
      file: asset.file,
      absoluteFile,
      category: asset.category,
      kind: expected.kind,
      exists: false,
      width: 0,
      height: 0,
      expectedWidth: expected.width,
      expectedHeight: expected.height,
      format: 'missing',
      declaredWorldSize: vegetation?.worldSize ?? null,
      runtimeWorldSize,
      atlasTileSize: vegetation?.tileSize ?? null,
      pixelsPerDeclaredMeter: roundedMetric(pixelsPerDeclaredMeter),
      pixelsPerRuntimeMeter: roundedMetric(pixelsPerRuntimeMeter),
      sourceBytes: 0,
      pixelCount: 0,
      estimatedRgbaBytes: 0,
      estimatedMipmappedRgbaBytes: 0,
      estimatedMipmappedMiB: 0,
      remediationCandidate: null,
      flags: ['missing-file'],
    };
  }

  const dimensions = readImageDimensions(absoluteFile);
  const sourceBytes = statSync(absoluteFile).size;
  const width = dimensions?.width ?? 0;
  const height = dimensions?.height ?? 0;
  const pixelCount = width * height;
  const estimatedRgbaBytes = pixelCount * BYTES_PER_RGBA_PIXEL;
  const estimatedMipmappedRgbaBytes = Math.round(estimatedRgbaBytes * MIP_CHAIN_FACTOR);
  const estimatedMipmappedMiB = Number((estimatedMipmappedRgbaBytes / MIB).toFixed(2));
  const flags: string[] = [];

  if (!dimensions) {
    flags.push('unknown-image-format');
  }
  if (expected.width && expected.height && (width !== expected.width || height !== expected.height)) {
    flags.push(`dimension-mismatch-expected-${expected.width}x${expected.height}`);
  }
  if (!isPowerOfTwo(width) || !isPowerOfTwo(height)) {
    flags.push('non-power-of-two-dimensions');
  }
  if (estimatedMipmappedMiB >= FAIL_TEXTURE_MIB) {
    flags.push(`fail-over-${FAIL_TEXTURE_MIB}MiB-mipmapped-rgba`);
  } else if (estimatedMipmappedMiB >= WARN_TEXTURE_MIB) {
    flags.push(`warn-over-${WARN_TEXTURE_MIB}MiB-mipmapped-rgba`);
  }
  if (pixelsPerRuntimeMeter !== null && pixelsPerRuntimeMeter > 80) {
    flags.push('warn-over-80px-per-runtime-meter');
  }
  const remediationCandidate = buildRemediationCandidate(
    expected.kind,
    estimatedMipmappedMiB,
    vegetation,
    runtimeWorldSize,
    flags,
  );

  return {
    name: asset.name,
    file: asset.file,
    absoluteFile,
    category: asset.category,
    kind: expected.kind,
    exists: true,
    width,
    height,
    expectedWidth: expected.width,
    expectedHeight: expected.height,
    format: dimensions?.format ?? 'unknown',
    declaredWorldSize: vegetation?.worldSize ?? null,
    runtimeWorldSize,
    atlasTileSize: vegetation?.tileSize ?? null,
    pixelsPerDeclaredMeter: roundedMetric(pixelsPerDeclaredMeter),
    pixelsPerRuntimeMeter: roundedMetric(pixelsPerRuntimeMeter),
    sourceBytes,
    pixelCount,
    estimatedRgbaBytes,
    estimatedMipmappedRgbaBytes,
    estimatedMipmappedMiB,
    remediationCandidate,
    flags,
  };
}

function createGroupSummary(entries: TextureAuditEntry[], kind: TextureKind): GroupSummary {
  const filtered = entries.filter((entry) => entry.kind === kind);
  const sourceBytes = filtered.reduce((sum, entry) => sum + entry.sourceBytes, 0);
  const estimatedMipmappedRgbaBytes = filtered.reduce((sum, entry) => sum + entry.estimatedMipmappedRgbaBytes, 0);
  const estimatedMipmappedMiB = estimatedMipmappedRgbaBytes / MIB;
  const estimatedCandidateMipmappedMiB = filtered.reduce(
    (sum, entry) => sum + (entry.remediationCandidate?.targetEstimatedMipmappedMiB ?? entry.estimatedMipmappedMiB),
    0,
  );

  return {
    count: filtered.length,
    sourceBytes,
    estimatedMipmappedRgbaBytes,
    estimatedMipmappedMiB: Number(estimatedMipmappedMiB.toFixed(2)),
    estimatedCandidateMipmappedMiB: Number(estimatedCandidateMipmappedMiB.toFixed(2)),
    estimatedCandidateSavingsMiB: Number((estimatedMipmappedMiB - estimatedCandidateMipmappedMiB).toFixed(2)),
  };
}

function sumMiB(entries: TextureAuditEntry[], selector: (entry: TextureAuditEntry) => number): number {
  return Number(entries.reduce((sum, entry) => sum + selector(entry), 0).toFixed(2));
}

function buildScenarioEstimates(entries: TextureAuditEntry[], currentTotalMiB: number): TextureAuditReport['summary']['scenarioEstimates'] {
  const keepCurrent = (entry: TextureAuditEntry) => entry.estimatedMipmappedMiB;
  const useCandidate = (entry: TextureAuditEntry) => (
    entry.remediationCandidate?.targetEstimatedMipmappedMiB ?? entry.estimatedMipmappedMiB
  );

  const vegetationCandidateMiB = sumMiB(entries, (entry) => (
    entry.kind === 'vegetation-color' || entry.kind === 'vegetation-normal' ? useCandidate(entry) : keepCurrent(entry)
  ));
  const vegetationCandidateNoNormalsMiB = sumMiB(entries, (entry) => {
    if (entry.kind === 'vegetation-normal') return 0;
    if (entry.kind === 'vegetation-color') return useCandidate(entry);
    return keepCurrent(entry);
  });
  const npcCandidateMiB = sumMiB(entries, (entry) => (
    entry.kind === 'npc-albedo' ? useCandidate(entry) : keepCurrent(entry)
  ));
  const noVegetationNormalsMiB = sumMiB(entries, (entry) => (
    entry.kind === 'vegetation-normal' ? 0 : keepCurrent(entry)
  ));
  const allCandidatesMiB = sumMiB(entries, useCandidate);

  return {
    noVegetationNormals: {
      estimatedMipmappedMiB: noVegetationNormalsMiB,
      estimatedSavingsMiB: Number((currentTotalMiB - noVegetationNormalsMiB).toFixed(2)),
      notes: [
        'Drops all vegetation normal atlases while keeping current albedo and NPC atlas sizes.',
        'Requires visual comparison against normal-lit vegetation before runtime acceptance.',
      ],
    },
    vegetationCandidatesOnly: {
      estimatedMipmappedMiB: vegetationCandidateMiB,
      estimatedSavingsMiB: Number((currentTotalMiB - vegetationCandidateMiB).toFixed(2)),
      notes: [
        'Regenerates flagged vegetation color and normal atlases to candidate tile sizes.',
        'Leaves NPC animated albedo atlases at current dimensions.',
      ],
    },
    vegetationCandidatesNoNormals: {
      estimatedMipmappedMiB: vegetationCandidateNoNormalsMiB,
      estimatedSavingsMiB: Number((currentTotalMiB - vegetationCandidateNoNormalsMiB).toFixed(2)),
      notes: [
        'Regenerates vegetation albedo atlases to candidate tile sizes and drops vegetation normal atlases.',
        'Highest vegetation-side savings, but requires explicit lighting/fidelity review.',
      ],
    },
    npcCandidatesOnly: {
      estimatedMipmappedMiB: npcCandidateMiB,
      estimatedSavingsMiB: Number((currentTotalMiB - npcCandidateMiB).toFixed(2)),
      notes: [
        'Regenerates NPC animated albedo atlases to the candidate 64px-frame padded target.',
        'Leaves vegetation atlases unchanged.',
      ],
    },
    allCandidates: {
      estimatedMipmappedMiB: allCandidatesMiB,
      estimatedSavingsMiB: Number((currentTotalMiB - allCandidatesMiB).toFixed(2)),
      notes: [
        'Applies every per-texture remediation candidate while retaining vegetation normal atlases at candidate size.',
        'This is the current full-regeneration planning estimate, not a visual acceptance result.',
      ],
    },
  };
}

function buildReport(): TextureAuditReport {
  const entries = PIXEL_FORGE_TEXTURE_ASSETS.map(createEntry)
    .sort((a, b) => b.estimatedMipmappedRgbaBytes - a.estimatedMipmappedRgbaBytes);
  const totalSourceBytes = entries.reduce((sum, entry) => sum + entry.sourceBytes, 0);
  const totalEstimatedMipmappedRgbaBytes = entries.reduce((sum, entry) => sum + entry.estimatedMipmappedRgbaBytes, 0);
  const totalEstimatedMipmappedMiB = Number((totalEstimatedMipmappedRgbaBytes / MIB).toFixed(2));
  const totalEstimatedCandidateMipmappedMiB = entries.reduce(
    (sum, entry) => sum + (entry.remediationCandidate?.targetEstimatedMipmappedMiB ?? entry.estimatedMipmappedMiB),
    0,
  );

  return {
    createdAt: new Date().toISOString(),
    source: 'src/config/pixelForgeAssets.ts',
    budgets: {
      warnTextureMiB: WARN_TEXTURE_MIB,
      failTextureMiB: FAIL_TEXTURE_MIB,
      notes: [
        'Pixel Forge billboard and impostor textures currently use LinearMipmapLinearFilter with generateMipmaps=true.',
        'Budget flags estimate uncompressed RGBA plus a full mip chain; source PNG byte size is not a GPU residency proxy.',
        'The thresholds are an acceptance-standard draft seeded by the Objekt-143 startup texture-upload evidence, not a final art-direction rule.',
      ],
    },
    summary: {
      totalTextures: entries.length,
      missingTextures: entries.filter((entry) => !entry.exists).length,
      flaggedTextures: entries.filter((entry) => entry.flags.length > 0).length,
      totalSourceBytes,
      totalEstimatedMipmappedRgbaBytes,
      totalEstimatedMipmappedMiB,
      totalEstimatedCandidateMipmappedMiB: Number(totalEstimatedCandidateMipmappedMiB.toFixed(2)),
      totalEstimatedCandidateSavingsMiB: Number(
        (totalEstimatedMipmappedMiB - totalEstimatedCandidateMipmappedMiB).toFixed(2),
      ),
      scenarioEstimates: buildScenarioEstimates(entries, totalEstimatedMipmappedMiB),
      byKind: {
        'vegetation-color': createGroupSummary(entries, 'vegetation-color'),
        'vegetation-normal': createGroupSummary(entries, 'vegetation-normal'),
        'npc-albedo': createGroupSummary(entries, 'npc-albedo'),
      },
    },
    entries,
  };
}

function main(): void {
  const report = buildReport();
  const artifactDir = join(ARTIFACT_ROOT, timestampSlug(), 'pixel-forge-texture-audit');
  mkdirSync(artifactDir, { recursive: true });
  const outputPath = join(artifactDir, 'texture-audit.json');
  writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`Pixel Forge texture audit written: ${outputPath}`);
  console.log(`Textures: ${report.summary.totalTextures}`);
  console.log(`Flagged: ${report.summary.flaggedTextures}`);
  console.log(`Estimated mipmapped RGBA: ${report.summary.totalEstimatedMipmappedMiB} MiB`);
  console.log(`Candidate estimate: ${report.summary.totalEstimatedCandidateMipmappedMiB} MiB`);
  console.log(`Candidate savings: ${report.summary.totalEstimatedCandidateSavingsMiB} MiB`);
  console.log(`Scenario estimates: ${Object.entries(report.summary.scenarioEstimates).map(([name, estimate]) => `${name}=${estimate.estimatedMipmappedMiB} MiB`).join(', ')}`);
  for (const entry of report.entries.slice(0, 10)) {
    const candidate = entry.remediationCandidate
      ? ` -> ${entry.remediationCandidate.targetWidth}x${entry.remediationCandidate.targetHeight} (${entry.remediationCandidate.targetEstimatedMipmappedMiB.toFixed(2)} MiB)`
      : '';
    console.log(`${entry.estimatedMipmappedMiB.toFixed(2)} MiB\t${entry.width}x${entry.height}${candidate}\t${entry.name}\t${entry.flags.join(',')}`);
  }

  if (PIXEL_FORGE_NPC_FACTIONS.length === 0) {
    throw new Error('Pixel Forge NPC faction registry is empty');
  }
}

main();
