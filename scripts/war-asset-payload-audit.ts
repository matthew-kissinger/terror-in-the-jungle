#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { warAssetCatalog, type WarAssetBudgetStatus } from '../src/config/generated/warAssetCatalog';

const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const GLB_MAGIC = 'glTF';
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');
const MODELS_ROOT = join(process.cwd(), 'public', 'models');
const MIB = 1024 * 1024;
const LARGE_GLB_BYTES = 512 * 1024;
const LARGE_IMAGE_BYTES = 256 * 1024;
const MANY_MATERIALS = 8;
const MANY_PRIMITIVES = 24;

type GlbBufferView = {
  byteOffset?: number;
  byteLength?: number;
};

type GlbAccessor = {
  bufferView?: number;
};

type GlbImage = {
  name?: string;
  mimeType?: string;
  bufferView?: number;
  uri?: string;
};

type GlbTexture = {
  source?: number;
  extensions?: Record<string, unknown>;
};

type GlbPrimitive = {
  indices?: number;
  attributes?: Record<string, number>;
  targets?: Array<Record<string, number>>;
  material?: number;
};

type GlbJson = {
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  buffers?: Array<{ byteLength?: number; uri?: string }>;
  bufferViews?: GlbBufferView[];
  accessors?: GlbAccessor[];
  images?: GlbImage[];
  textures?: GlbTexture[];
  materials?: unknown[];
  meshes?: Array<{ primitives?: GlbPrimitive[] }>;
};

export type WarAssetPayloadEntry = {
  slug: string;
  class: string;
  path: string;
  budgetStatus: WarAssetBudgetStatus;
  exists: boolean;
  fileBytes: number;
  declaredBufferBytes: number;
  accessorBufferBytes: number;
  embeddedImageBytes: number;
  embeddedCompressedTextureBytes: number;
  externalImageCount: number;
  imageCount: number;
  textureCount: number;
  materialCount: number;
  primitiveCount: number;
  meshCount: number;
  extensionsUsed: string[];
  extensionsRequired: string[];
  imageMimeBytes: Record<string, number>;
  flags: string[];
  parseError: string | null;
};

type WarAssetPayloadReport = {
  createdAt: string;
  source: string;
  summary: {
    totalAssets: number;
    parsedAssets: number;
    missingAssets: number;
    parseErrors: number;
    totalFileBytes: number;
    totalFileMiB: number;
    totalDeclaredBufferBytes: number;
    totalAccessorBufferBytes: number;
    totalEmbeddedImageBytes: number;
    totalEmbeddedImageMiB: number;
    totalEmbeddedCompressedTextureBytes: number;
    assetsWithImages: number;
    assetsWithCompressedTexturePath: number;
    assetsWithBasisuExtension: number;
    assetsWithKtx2Images: number;
    assetsWithUncompressedEmbeddedImages: number;
    byBudgetStatus: Record<WarAssetBudgetStatus, {
      count: number;
      fileBytes: number;
      embeddedImageBytes: number;
      materialCount: number;
      primitiveCount: number;
    }>;
    imageMimeBytes: Record<string, number>;
  };
  topFileBytes: WarAssetPayloadEntry[];
  topEmbeddedImageBytes: WarAssetPayloadEntry[];
  topMaterialCounts: WarAssetPayloadEntry[];
  topPrimitiveCounts: WarAssetPayloadEntry[];
  flaggedEntries: WarAssetPayloadEntry[];
  entries: WarAssetPayloadEntry[];
};

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function bytesToMiB(bytes: number): number {
  return Number((bytes / MIB).toFixed(2));
}

function addBytes(target: Record<string, number>, key: string, bytes: number): void {
  target[key] = (target[key] ?? 0) + bytes;
}

function readDataUriBytes(uri: string): number {
  const comma = uri.indexOf(',');
  if (comma < 0) return 0;
  const header = uri.slice(0, comma).toLowerCase();
  const payload = uri.slice(comma + 1);
  if (!header.includes(';base64')) {
    return Buffer.byteLength(decodeURIComponent(payload), 'utf-8');
  }
  return Buffer.from(payload, 'base64').length;
}

function imageMime(image: GlbImage): string {
  if (image.mimeType) return image.mimeType.toLowerCase();
  const uri = image.uri?.toLowerCase() ?? '';
  if (uri.startsWith('data:')) {
    const semi = uri.indexOf(';');
    const comma = uri.indexOf(',');
    const end = semi >= 0 ? semi : comma;
    return end > 5 ? uri.slice(5, end) : 'unknown';
  }
  if (uri.endsWith('.png')) return 'image/png';
  if (uri.endsWith('.jpg') || uri.endsWith('.jpeg')) return 'image/jpeg';
  if (uri.endsWith('.webp')) return 'image/webp';
  if (uri.endsWith('.ktx2')) return 'image/ktx2';
  return 'unknown';
}

function uniqueAccessorBufferViews(json: GlbJson): Set<number> {
  const views = new Set<number>();
  for (const accessor of json.accessors ?? []) {
    if (accessor.bufferView !== undefined) {
      views.add(accessor.bufferView);
    }
  }
  return views;
}

function primitiveCount(json: GlbJson): number {
  return (json.meshes ?? []).reduce((sum, mesh) => sum + (mesh.primitives?.length ?? 0), 0);
}

function hasBasisuExtension(json: GlbJson): boolean {
  if (json.extensionsUsed?.includes('KHR_texture_basisu')) return true;
  if (json.extensionsRequired?.includes('KHR_texture_basisu')) return true;
  return (json.textures ?? []).some((texture) => texture.extensions?.KHR_texture_basisu !== undefined);
}

function parseGlbJsonAndBin(data: Buffer, label: string): { json: GlbJson; binBytes: number } {
  if (data.toString('utf-8', 0, 4) !== GLB_MAGIC) {
    throw new Error(`${label} is not a binary glTF file.`);
  }

  let offset = 12;
  let json: GlbJson | null = null;
  let binBytes = 0;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = data.subarray(offset, offset + length);
    offset += length;

    if (type === JSON_CHUNK_TYPE) {
      json = JSON.parse(chunk.toString('utf-8').trim()) as GlbJson;
    } else if (type === BIN_CHUNK_TYPE) {
      binBytes += chunk.length;
    }
  }

  if (!json) {
    throw new Error(`${label} has no JSON chunk.`);
  }

  return { json, binBytes };
}

export function analyzeWarAssetPayloadBuffer(
  input: {
    slug: string;
    class: string;
    path: string;
    budgetStatus: WarAssetBudgetStatus;
    fileBytes: number;
    data: Buffer;
  },
): WarAssetPayloadEntry {
  const { json, binBytes } = parseGlbJsonAndBin(input.data, input.path);
  const bufferViews = json.bufferViews ?? [];
  const accessorViews = uniqueAccessorBufferViews(json);
  const imageViewIndices = new Set<number>();
  const imageMimeBytes: Record<string, number> = {};
  let embeddedImageBytes = 0;
  let embeddedCompressedTextureBytes = 0;
  let externalImageCount = 0;

  for (const image of json.images ?? []) {
    const mime = imageMime(image);
    let imageBytes = 0;
    if (image.bufferView !== undefined) {
      imageViewIndices.add(image.bufferView);
      imageBytes = bufferViews[image.bufferView]?.byteLength ?? 0;
    } else if (image.uri?.startsWith('data:')) {
      imageBytes = readDataUriBytes(image.uri);
    } else if (image.uri) {
      externalImageCount++;
    }

    if (imageBytes > 0) {
      embeddedImageBytes += imageBytes;
      addBytes(imageMimeBytes, mime, imageBytes);
      if (mime === 'image/ktx2' || image.uri?.toLowerCase().endsWith('.ktx2')) {
        embeddedCompressedTextureBytes += imageBytes;
      }
    }
  }

  let accessorBufferBytes = 0;
  for (const index of accessorViews) {
    accessorBufferBytes += bufferViews[index]?.byteLength ?? 0;
  }

  const extensionsUsed = [...(json.extensionsUsed ?? [])].sort();
  const extensionsRequired = [...(json.extensionsRequired ?? [])].sort();
  const basisu = hasBasisuExtension(json);
  const imageCount = json.images?.length ?? 0;
  const textureCount = json.textures?.length ?? 0;
  const materialCount = json.materials?.length ?? 0;
  const primitives = primitiveCount(json);
  const flags: string[] = [];
  const hasUncompressedEmbeddedImages = embeddedImageBytes > embeddedCompressedTextureBytes;

  if (input.budgetStatus === 'REJECT') flags.push('catalog-reject');
  if (input.fileBytes >= LARGE_GLB_BYTES) flags.push('large-glb-payload');
  if (embeddedImageBytes >= LARGE_IMAGE_BYTES) flags.push('large-embedded-image-payload');
  if (imageCount > 0 && !basisu && embeddedCompressedTextureBytes === 0) flags.push('no-ktx2-or-basisu');
  if (hasUncompressedEmbeddedImages) flags.push('uncompressed-embedded-images');
  if (externalImageCount > 0) flags.push('external-image-uris');
  if (materialCount > MANY_MATERIALS) flags.push('many-materials');
  if (primitives > MANY_PRIMITIVES) flags.push('many-primitives');

  return {
    slug: input.slug,
    class: input.class,
    path: input.path,
    budgetStatus: input.budgetStatus,
    exists: true,
    fileBytes: input.fileBytes,
    declaredBufferBytes: (json.buffers ?? []).reduce((sum, buffer) => sum + (buffer.byteLength ?? 0), 0) || binBytes,
    accessorBufferBytes,
    embeddedImageBytes,
    embeddedCompressedTextureBytes,
    externalImageCount,
    imageCount,
    textureCount,
    materialCount,
    primitiveCount: primitives,
    meshCount: json.meshes?.length ?? 0,
    extensionsUsed,
    extensionsRequired,
    imageMimeBytes,
    flags,
    parseError: null,
  };
}

function missingEntry(slug: string, cls: string, path: string, status: WarAssetBudgetStatus): WarAssetPayloadEntry {
  return {
    slug,
    class: cls,
    path,
    budgetStatus: status,
    exists: false,
    fileBytes: 0,
    declaredBufferBytes: 0,
    accessorBufferBytes: 0,
    embeddedImageBytes: 0,
    embeddedCompressedTextureBytes: 0,
    externalImageCount: 0,
    imageCount: 0,
    textureCount: 0,
    materialCount: 0,
    primitiveCount: 0,
    meshCount: 0,
    extensionsUsed: [],
    extensionsRequired: [],
    imageMimeBytes: {},
    flags: ['missing-file'],
    parseError: 'missing-file',
  };
}

function parseErrorEntry(
  slug: string,
  cls: string,
  path: string,
  status: WarAssetBudgetStatus,
  fileBytes: number,
  error: unknown,
): WarAssetPayloadEntry {
  return {
    ...missingEntry(slug, cls, path, status),
    exists: true,
    fileBytes,
    flags: ['parse-error'],
    parseError: error instanceof Error ? error.message : String(error),
  };
}

export function summarizeWarAssetPayloadEntries(entries: WarAssetPayloadEntry[]): WarAssetPayloadReport['summary'] {
  const imageMimeBytes: Record<string, number> = {};
  const byBudgetStatus: WarAssetPayloadReport['summary']['byBudgetStatus'] = {
    PASS: { count: 0, fileBytes: 0, embeddedImageBytes: 0, materialCount: 0, primitiveCount: 0 },
    EXCEPTION: { count: 0, fileBytes: 0, embeddedImageBytes: 0, materialCount: 0, primitiveCount: 0 },
    REJECT: { count: 0, fileBytes: 0, embeddedImageBytes: 0, materialCount: 0, primitiveCount: 0 },
  };

  let assetsWithBasisuExtension = 0;
  let assetsWithKtx2Images = 0;
  let assetsWithCompressedTexturePath = 0;
  let assetsWithUncompressedEmbeddedImages = 0;

  for (const entry of entries) {
    const status = byBudgetStatus[entry.budgetStatus];
    status.count++;
    status.fileBytes += entry.fileBytes;
    status.embeddedImageBytes += entry.embeddedImageBytes;
    status.materialCount += entry.materialCount;
    status.primitiveCount += entry.primitiveCount;

    for (const [mime, bytes] of Object.entries(entry.imageMimeBytes)) {
      addBytes(imageMimeBytes, mime, bytes);
    }

    const hasBasisu = entry.extensionsUsed.includes('KHR_texture_basisu')
      || entry.extensionsRequired.includes('KHR_texture_basisu');
    const hasKtx2 = (entry.imageMimeBytes['image/ktx2'] ?? 0) > 0;
    if (hasBasisu) assetsWithBasisuExtension++;
    if (hasKtx2) assetsWithKtx2Images++;
    if (hasBasisu || hasKtx2 || entry.embeddedCompressedTextureBytes > 0) assetsWithCompressedTexturePath++;
    if (entry.embeddedImageBytes > entry.embeddedCompressedTextureBytes) assetsWithUncompressedEmbeddedImages++;
  }

  const parsedAssets = entries.filter((entry) => entry.exists && !entry.parseError).length;
  const totalFileBytes = entries.reduce((sum, entry) => sum + entry.fileBytes, 0);
  const totalEmbeddedImageBytes = entries.reduce((sum, entry) => sum + entry.embeddedImageBytes, 0);

  return {
    totalAssets: entries.length,
    parsedAssets,
    missingAssets: entries.filter((entry) => !entry.exists).length,
    parseErrors: entries.filter((entry) => entry.parseError && entry.parseError !== 'missing-file').length,
    totalFileBytes,
    totalFileMiB: bytesToMiB(totalFileBytes),
    totalDeclaredBufferBytes: entries.reduce((sum, entry) => sum + entry.declaredBufferBytes, 0),
    totalAccessorBufferBytes: entries.reduce((sum, entry) => sum + entry.accessorBufferBytes, 0),
    totalEmbeddedImageBytes,
    totalEmbeddedImageMiB: bytesToMiB(totalEmbeddedImageBytes),
    totalEmbeddedCompressedTextureBytes: entries.reduce((sum, entry) => sum + entry.embeddedCompressedTextureBytes, 0),
    assetsWithImages: entries.filter((entry) => entry.imageCount > 0).length,
    assetsWithCompressedTexturePath,
    assetsWithBasisuExtension,
    assetsWithKtx2Images,
    assetsWithUncompressedEmbeddedImages,
    byBudgetStatus,
    imageMimeBytes,
  };
}

function buildReport(entries: WarAssetPayloadEntry[]): WarAssetPayloadReport {
  const top = (
    key: keyof Pick<WarAssetPayloadEntry, 'fileBytes' | 'embeddedImageBytes' | 'materialCount' | 'primitiveCount'>,
  ) => [...entries]
    .sort((a, b) => Number(b[key]) - Number(a[key]))
    .slice(0, 12);

  return {
    createdAt: new Date().toISOString(),
    source: 'src/config/generated/warAssetCatalog.ts + public/models GLB payloads',
    summary: summarizeWarAssetPayloadEntries(entries),
    topFileBytes: top('fileBytes'),
    topEmbeddedImageBytes: top('embeddedImageBytes'),
    topMaterialCounts: top('materialCount'),
    topPrimitiveCounts: top('primitiveCount'),
    flaggedEntries: entries
      .filter((entry) => entry.flags.length > 0)
      .sort((a, b) => b.flags.length - a.flags.length || b.fileBytes - a.fileBytes),
    entries,
  };
}

function analyzeCatalog(): WarAssetPayloadEntry[] {
  return Object.values(warAssetCatalog)
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((asset) => {
      const absolutePath = join(MODELS_ROOT, asset.path);
      if (!existsSync(absolutePath)) {
        return missingEntry(asset.slug, asset.class, asset.path, asset.budgetStatus);
      }

      const fileBytes = statSync(absolutePath).size;
      try {
        return analyzeWarAssetPayloadBuffer({
          slug: asset.slug,
          class: asset.class,
          path: asset.path,
          budgetStatus: asset.budgetStatus,
          fileBytes,
          data: readFileSync(absolutePath),
        });
      } catch (error) {
        return parseErrorEntry(asset.slug, asset.class, asset.path, asset.budgetStatus, fileBytes, error);
      }
    });
}

function writeReport(report: WarAssetPayloadReport): string {
  const artifactDir = join(ARTIFACT_ROOT, timestampSlug(), 'war-asset-payload-audit');
  mkdirSync(artifactDir, { recursive: true });
  const outputPath = join(artifactDir, 'war-asset-payload-audit.json');
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
  return outputPath;
}

function printReport(report: WarAssetPayloadReport, outputPath: string): void {
  const { summary } = report;
  console.log(`War asset payload audit written: ${outputPath}`);
  console.log(`Assets: ${summary.totalAssets} (${summary.parsedAssets} parsed, ${summary.missingAssets} missing, ${summary.parseErrors} parse errors)`);
  console.log(`GLB payload: ${summary.totalFileMiB} MiB`);
  console.log(`Embedded images: ${summary.totalEmbeddedImageMiB} MiB across ${summary.assetsWithImages} assets`);
  console.log(`Compressed texture path: ${summary.assetsWithCompressedTexturePath} assets (${summary.assetsWithBasisuExtension} KHR_texture_basisu, ${summary.assetsWithKtx2Images} image/ktx2)`);
  console.log(`Uncompressed embedded images: ${summary.assetsWithUncompressedEmbeddedImages} assets`);

  const topFlags = report.flaggedEntries.slice(0, 12);
  if (topFlags.length > 0) {
    console.log('Top flagged assets:');
    for (const entry of topFlags) {
      console.log([
        `${(entry.fileBytes / 1024).toFixed(1)} KiB`,
        `${entry.embeddedImageBytes > 0 ? `${(entry.embeddedImageBytes / 1024).toFixed(1)} KiB images` : 'no embedded images'}`,
        `${entry.materialCount} materials`,
        `${entry.primitiveCount} primitives`,
        entry.path,
        entry.flags.join(','),
      ].join('\t'));
    }
  }
}

function main(): void {
  const report = buildReport(analyzeCatalog());
  const outputPath = writeReport(report);
  printReport(report, outputPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
