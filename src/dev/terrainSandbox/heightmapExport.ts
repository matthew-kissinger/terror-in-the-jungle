/**
 * Export helpers for the terrain sandbox.
 *
 * Three artifacts per heightmap + params:
 *   - `.f32` raw Float32Array binary — same format `prebake-navmesh.ts`
 *     writes and `BakedHeightProvider` consumes. Round-trip-safe.
 *   - `.png` 8-bit grayscale visualization — for eyeballing only.
 *   - `.json` MapSeedRegistry-compatible seed entry plus sandbox params
 *     for reproducibility.
 *
 * The pure helpers are DOM-free and unit-tested.
 */

import type { GeneratedHeightmap, HeightmapParams } from './heightmapGenerator';

export interface MapSeedRegistryEntry {
  seed: number;
  navmeshAsset: string;
  heightmapAsset: string;
}

export interface SandboxExportJson {
  registryEntry: MapSeedRegistryEntry;
  params: HeightmapParams;
  meta: {
    resolution: number;
    mapSizeMeters: number;
    minHeight: number;
    maxHeight: number;
    exportedAt: string;
  };
}

export function buildRegistryEntry(params: HeightmapParams, modeId: string = 'sandbox'): MapSeedRegistryEntry {
  return {
    seed: params.seed,
    navmeshAsset: `/data/navmesh/${modeId}-${params.seed}.bin`,
    heightmapAsset: `/data/heightmaps/${modeId}-${params.seed}.f32`,
  };
}

export function buildParamsJson(
  heightmap: GeneratedHeightmap,
  params: HeightmapParams,
  modeId: string = 'sandbox',
  exportedAt: Date = new Date(),
): SandboxExportJson {
  return {
    registryEntry: buildRegistryEntry(params, modeId),
    params,
    meta: {
      resolution: heightmap.resolution,
      mapSizeMeters: heightmap.mapSizeMeters,
      minHeight: heightmap.min,
      maxHeight: heightmap.max,
      exportedAt: exportedAt.toISOString(),
    },
  };
}

/** TS object-literal form suitable for pasting into `MapSeedRegistry.ts`. */
export function formatRegistryLiteral(entry: MapSeedRegistryEntry): string {
  return (
    `    { seed: ${entry.seed},` +
    ` navmeshAsset: '${entry.navmeshAsset}',` +
    ` heightmapAsset: '${entry.heightmapAsset}' },`
  );
}

/**
 * Encode the heightmap as 8-bit grayscale PNG via the canvas API. The
 * `.f32` export carries full precision; the PNG is a visualization.
 */
export async function heightmapToPngBlob(
  heightmap: GeneratedHeightmap,
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined,
): Promise<Blob> {
  if (!doc) throw new Error('heightmapToPngBlob requires a DOM document');
  const { data, resolution, min, max } = heightmap;
  const canvas = doc.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const img = ctx.createImageData(resolution, resolution);
  const span = Math.max(1e-6, max - min);
  for (let i = 0; i < data.length; i++) {
    const g = Math.max(0, Math.min(255, Math.round(((data[i] - min) / span) * 255)));
    const p = i * 4;
    img.data[p] = g; img.data[p + 1] = g; img.data[p + 2] = g; img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null')), 'image/png');
  });
}

export function heightmapToF32Blob(heightmap: GeneratedHeightmap): Blob {
  // Copy into a plain ArrayBuffer so the Blob constructor's BlobPart type
  // accepts it (SharedArrayBuffer-backed views would be rejected).
  const copy = new Uint8Array(heightmap.data.byteLength);
  copy.set(new Uint8Array(heightmap.data.buffer, heightmap.data.byteOffset, heightmap.data.byteLength));
  return new Blob([copy.buffer], { type: 'application/octet-stream' });
}

export interface ExportBundle {
  baseName: string;
  f32: Blob;
  png: Blob;
  json: Blob;
  jsonObject: SandboxExportJson;
}

export async function buildExportBundle(
  heightmap: GeneratedHeightmap,
  params: HeightmapParams,
  now: Date = new Date(),
): Promise<ExportBundle> {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const baseName = `terrain-${params.seed}-${stamp}`;
  const jsonObject = buildParamsJson(heightmap, params, 'sandbox', now);
  const jsonBlob = new Blob([JSON.stringify(jsonObject, null, 2)], { type: 'application/json' });
  return { baseName, f32: heightmapToF32Blob(heightmap), png: await heightmapToPngBlob(heightmap), json: jsonBlob, jsonObject };
}

export function downloadExportBundle(bundle: ExportBundle, doc: Document = document): void {
  const download = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url; a.download = filename;
    doc.body.appendChild(a); a.click(); doc.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  download(bundle.f32, `${bundle.baseName}.f32`);
  download(bundle.png, `${bundle.baseName}.png`);
  download(bundle.json, `${bundle.baseName}.json`);
}

/** Best-effort clipboard write; falls back to `execCommand('copy')`. */
export async function copyToClipboard(text: string, doc: Document = document): Promise<boolean> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.clipboard?.writeText) {
    try { await nav.clipboard.writeText(text); return true; } catch { /* fall through */ }
  }
  try {
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    doc.body.appendChild(ta); ta.select();
    const ok = doc.execCommand('copy');
    doc.body.removeChild(ta);
    return ok;
  } catch { return false; }
}
