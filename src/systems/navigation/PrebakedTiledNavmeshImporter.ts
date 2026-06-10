// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { NavMesh } from '@recast-navigation/core';
import { fetchBinaryAsset, takeBinaryAssetPrefetch } from '../../utils/CompressedAssetFetch';

/**
 * Time-sliced importer for pre-baked tiled navmesh binaries.
 *
 * `importNavMesh()` from @recast-navigation/core deserializes the whole
 * binary in ONE synchronous WASM call — ~5,300 tiles for A Shau (19.4MB),
 * which blocks the main thread for tens of seconds (the "page unresponsive"
 * load freeze). The shipped `.bin` is the standard Detour tileset container
 * ("MSET"), which is per-tile by construction, so we can parse the container
 * in JS and feed tiles to `NavMesh.addTile()` in deadline-budgeted batches,
 * yielding to the renderer between batches.
 *
 * Passing the stored tileRef as `lastRef` reproduces the monolithic
 * importer's tile ref + salt assignment, so refs match an `importNavMesh()`
 * result for the same bytes (verified by the parity test).
 */

/** Detour tileset container magic 'MSET' read as a little-endian int32. */
const NAVMESHSET_MAGIC = 0x4d534554;
const NAVMESHSET_VERSION = 1;

// NavMeshSetHeader: i32 magic, i32 version, i32 numTiles, dtNavMeshParams.
// dtNavMeshParams: f32 orig[3], f32 tileWidth, f32 tileHeight, i32 maxTiles,
// i32 maxPolys. All fields 4-byte aligned — no struct padding in wasm32.
const SET_HEADER_BYTES = 12 + 28;
// NavMeshTileHeader: u32 tileRef, i32 dataSize.
const TILE_HEADER_BYTES = 8;

export interface ParsedNavMeshSetParams {
  orig: { x: number; y: number; z: number };
  tileWidth: number;
  tileHeight: number;
  maxTiles: number;
  maxPolys: number;
}

export interface ParsedNavMeshSetTile {
  tileRef: number;
  byteOffset: number;
  byteLength: number;
}

export interface ParsedNavMeshSet {
  params: ParsedNavMeshSetParams;
  tiles: ParsedNavMeshSetTile[];
}

/**
 * Parse the Detour "MSET" tileset container without copying tile payloads.
 * Returns null on any format surprise (wrong magic/version, truncated data,
 * out-of-bounds record) so the caller can fall back to the monolithic
 * importer — forward-compat guard against upstream format changes.
 */
export function parseNavMeshSet(data: Uint8Array): ParsedNavMeshSet | null {
  if (data.byteLength < SET_HEADER_BYTES) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const magic = view.getInt32(0, true);
  const version = view.getInt32(4, true);
  const numTiles = view.getInt32(8, true);
  if (magic !== NAVMESHSET_MAGIC || version !== NAVMESHSET_VERSION) return null;
  if (numTiles < 0 || numTiles > 1_000_000) return null;

  const params: ParsedNavMeshSetParams = {
    orig: {
      x: view.getFloat32(12, true),
      y: view.getFloat32(16, true),
      z: view.getFloat32(20, true),
    },
    tileWidth: view.getFloat32(24, true),
    tileHeight: view.getFloat32(28, true),
    maxTiles: view.getInt32(32, true),
    maxPolys: view.getInt32(36, true),
  };

  const tiles: ParsedNavMeshSetTile[] = [];
  let offset = SET_HEADER_BYTES;
  for (let i = 0; i < numTiles; i++) {
    if (offset + TILE_HEADER_BYTES > data.byteLength) return null;
    const tileRef = view.getUint32(offset, true);
    const dataSize = view.getInt32(offset + 4, true);
    offset += TILE_HEADER_BYTES;
    // The reference C++ importer treats a zero ref or size as end-of-set
    // (it cannot skip past an unsized payload). Mirror that exactly.
    if (tileRef === 0 || dataSize <= 0) break;
    if (offset + dataSize > data.byteLength) return null;
    tiles.push({ tileRef, byteOffset: offset, byteLength: dataSize });
    offset += dataSize;
  }
  return { params, tiles };
}

type RecastCore = Pick<
  typeof import('@recast-navigation/core'),
  'NavMesh' | 'NavMeshParams' | 'UnsignedCharArray' | 'Detour' | 'statusFailed'
>;

export interface SlicedImportOptions {
  /** Max main-thread time per batch before yielding. */
  budgetMs?: number;
  onProgress?: (tilesAdded: number, totalTiles: number) => void;
  /** Yield between batches; defaults to a macrotask (rAF when available). */
  yieldFn?: () => Promise<void>;
}

function defaultYield(): Promise<void> {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Import a pre-baked tiled navmesh in deadline-budgeted batches.
 * Returns null if the container can't be parsed or any tile fails to add;
 * a partially-built NavMesh is destroyed before returning (DT_TILE_FREE_DATA
 * tiles are freed by the dtNavMesh destructor).
 */
export async function importNavMeshSliced(
  data: Uint8Array,
  core: RecastCore,
  options: SlicedImportOptions = {},
): Promise<NavMesh | null> {
  const parsed = parseNavMeshSet(data);
  if (!parsed) return null;

  const budgetMs = options.budgetMs ?? 8;
  const yieldFn = options.yieldFn ?? defaultYield;

  const navMesh = new core.NavMesh();
  if (!navMesh.initTiled(core.NavMeshParams.create(parsed.params))) {
    navMesh.destroy();
    return null;
  }

  const total = parsed.tiles.length;
  let sliceStart = performance.now();
  for (let i = 0; i < total; i++) {
    const tile = parsed.tiles[i];
    const tileData = new core.UnsignedCharArray();
    // subarray() widens to Uint8Array<ArrayBufferLike>; copy() reads, never
    // shares, the buffer, so the narrower ArrayBuffer view type is safe.
    tileData.copy(
      data.subarray(tile.byteOffset, tile.byteOffset + tile.byteLength) as Uint8Array<ArrayBuffer>,
    );
    const result = navMesh.addTile(tileData, core.Detour.DT_TILE_FREE_DATA, tile.tileRef);
    if (core.statusFailed(result.status)) {
      // On failure Detour did not take ownership — free the heap copy,
      // then tear down whatever was built so the caller can fall back.
      tileData.destroy();
      navMesh.destroy();
      return null;
    }
    if (performance.now() - sliceStart >= budgetMs && i + 1 < total) {
      options.onProgress?.(i + 1, total);
      await yieldFn();
      sliceStart = performance.now();
    }
  }
  options.onProgress?.(total, total);
  return navMesh;
}

export interface PrebakedNavmeshLoadHooks {
  core: RecastCore;
  /** Monolithic importNavMesh — forward-compat fallback for non-MSET payloads. */
  importNavMeshFallback: (data: Uint8Array) => { navMesh: NavMesh };
  onTileProgress?: (tilesAdded: number, totalTiles: number) => void;
  /** Telemetry mark sink; receives suffixes like "fetch.begin". */
  mark: (name: string) => void;
  warn: (message: string) => void;
}

/**
 * Fetch a pre-baked navmesh asset and import it time-sliced.
 * Returns null when the fetch fails (caller decides whether that's fatal).
 */
export async function fetchAndImportPrebakedNavmesh(
  assetUrl: string,
  hooks: PrebakedNavmeshLoadHooks,
): Promise<NavMesh | null> {
  hooks.mark('fetch.begin');
  // Consume the mode-startup prefetch when one is in flight (started before
  // the DEM transfer so the two downloads overlap), else fetch now. Either
  // path prefers the gzip sidecar.
  const data = await (takeBinaryAssetPrefetch(assetUrl) ?? fetchBinaryAsset(assetUrl));
  if (!data) {
    hooks.warn(`fetch failed: ${assetUrl}`);
    return null;
  }
  hooks.mark('fetch.end');

  hooks.mark('import.begin');
  let navMesh = await importNavMeshSliced(data, hooks.core, {
    onProgress: hooks.onTileProgress,
  });
  if (!navMesh) {
    hooks.warn('sliced import unavailable for this asset; using monolithic import');
    navMesh = hooks.importNavMeshFallback(data).navMesh;
  }
  hooks.mark('import.end');
  return navMesh;
}
