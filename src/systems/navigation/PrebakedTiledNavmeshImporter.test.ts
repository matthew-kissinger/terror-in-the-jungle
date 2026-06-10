// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';
import * as recastCore from '@recast-navigation/core';
import { parseNavMeshSet, importNavMeshSliced } from './PrebakedTiledNavmeshImporter';

/**
 * Behavior: the time-sliced pre-baked importer produces a NavMesh identical
 * to the monolithic `importNavMesh()` for the same bytes (verified by
 * re-export byte equality — tile refs and salts must match for the exports
 * to be identical), while yielding between deadline-budgeted batches so the
 * main thread never blocks for the whole import.
 */

const NAVMESH_DIR = resolve(
  import.meta.dirname!,
  '..', '..', '..', 'public', 'data', 'navmesh',
);
const SMALL_BIN = resolve(NAVMESH_DIR, 'open_frontier-137.bin');
const ASHAU_BIN = resolve(NAVMESH_DIR, 'a_shau_valley.bin');

function readBin(path: string): Uint8Array {
  const buffer = readFileSync(path);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/** Build a minimal synthetic MSET container for parser-only tests. */
function syntheticSet(opts: {
  magic?: number;
  version?: number;
  tiles?: { tileRef: number; data: Uint8Array }[];
}): Uint8Array {
  const tiles = opts.tiles ?? [];
  const tileBytes = tiles.reduce((sum, t) => sum + 8 + t.data.byteLength, 0);
  const out = new Uint8Array(40 + tileBytes);
  const view = new DataView(out.buffer);
  view.setInt32(0, opts.magic ?? 0x4d534554, true);
  view.setInt32(4, opts.version ?? 1, true);
  view.setInt32(8, tiles.length, true);
  // dtNavMeshParams: orig(3 floats), tileWidth, tileHeight, maxTiles, maxPolys
  view.setFloat32(12, -100, true);
  view.setFloat32(16, 0, true);
  view.setFloat32(20, -100, true);
  view.setFloat32(24, 64, true);
  view.setFloat32(28, 64, true);
  view.setInt32(32, 128, true);
  view.setInt32(36, 256, true);
  let offset = 40;
  for (const tile of tiles) {
    view.setUint32(offset, tile.tileRef, true);
    view.setInt32(offset + 4, tile.data.byteLength, true);
    out.set(tile.data, offset + 8);
    offset += 8 + tile.data.byteLength;
  }
  return out;
}

// ── L1: container parser (no WASM) ──────────────────────────────────

describe('parseNavMeshSet', () => {
  it('parses header params and per-tile records without copying payloads', () => {
    const data = syntheticSet({
      tiles: [
        { tileRef: 0x400000, data: new Uint8Array([1, 2, 3, 4]) },
        { tileRef: 0x400001, data: new Uint8Array([5, 6]) },
      ],
    });
    const parsed = parseNavMeshSet(data);
    expect(parsed).not.toBeNull();
    expect(parsed!.params.orig.x).toBe(-100);
    expect(parsed!.params.tileWidth).toBe(64);
    expect(parsed!.params.maxTiles).toBe(128);
    expect(parsed!.params.maxPolys).toBe(256);
    expect(parsed!.tiles).toHaveLength(2);
    expect(parsed!.tiles[0]).toEqual({ tileRef: 0x400000, byteOffset: 48, byteLength: 4 });
    expect(parsed!.tiles[1]).toEqual({ tileRef: 0x400001, byteOffset: 60, byteLength: 2 });
  });

  it('rejects wrong magic and wrong version', () => {
    expect(parseNavMeshSet(syntheticSet({ magic: 0x12345678 }))).toBeNull();
    expect(parseNavMeshSet(syntheticSet({ version: 2 }))).toBeNull();
  });

  it('rejects truncated containers instead of reading out of bounds', () => {
    const data = syntheticSet({
      tiles: [{ tileRef: 0x400000, data: new Uint8Array(16) }],
    });
    expect(parseNavMeshSet(data.subarray(0, 20))).toBeNull();          // mid-header
    expect(parseNavMeshSet(data.subarray(0, 44))).toBeNull();          // mid-tile-header
    expect(parseNavMeshSet(data.subarray(0, data.length - 4))).toBeNull(); // mid-payload
  });

  it('treats a zero-ref record as end-of-set like the reference C++ importer', () => {
    const data = syntheticSet({
      tiles: [
        { tileRef: 0x400000, data: new Uint8Array([1]) },
        { tileRef: 0, data: new Uint8Array([9, 9]) },
      ],
    });
    const parsed = parseNavMeshSet(data);
    expect(parsed).not.toBeNull();
    expect(parsed!.tiles).toHaveLength(1);
    expect(parsed!.tiles[0].tileRef).toBe(0x400000);
  });

  it('works on a view into a larger buffer (non-zero byteOffset)', () => {
    const inner = syntheticSet({
      tiles: [{ tileRef: 0x400000, data: new Uint8Array([1, 2, 3]) }],
    });
    const padded = new Uint8Array(inner.length + 16);
    padded.set(inner, 16);
    const parsed = parseNavMeshSet(padded.subarray(16));
    expect(parsed).not.toBeNull();
    expect(parsed!.tiles).toHaveLength(1);
  });
});

// ── Parity vs monolithic importNavMesh (real WASM, real assets) ─────

describe('importNavMeshSliced parity', () => {
  const smallExists = existsSync(SMALL_BIN);
  const ashauExists = existsSync(ASHAU_BIN);

  beforeAll(async () => {
    if (smallExists || ashauExists) {
      await recastCore.init();
    }
  });

  it('produces a byte-identical re-export for a small pre-baked navmesh', async () => {
    if (!smallExists) throw new Error(`Missing committed asset: ${SMALL_BIN}`);
    const data = readBin(SMALL_BIN);

    const monolithic = recastCore.importNavMesh(data).navMesh;
    const monolithicExport = recastCore.exportNavMesh(monolithic);

    const progress: Array<[number, number]> = [];
    const sliced = await importNavMeshSliced(data, recastCore, {
      budgetMs: 0, // force a yield after every tile to exercise the slicing path
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(sliced).not.toBeNull();
    const slicedExport = recastCore.exportNavMesh(sliced!);

    expect(slicedExport.byteLength).toBe(monolithicExport.byteLength);
    expect(Buffer.from(slicedExport).equals(Buffer.from(monolithicExport))).toBe(true);

    const totals = new Set(progress.map(([, total]) => total));
    expect(totals.size).toBe(1);
    expect(progress[progress.length - 1][0]).toBe(progress[progress.length - 1][1]);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i][0]).toBeGreaterThan(progress[i - 1][0]);
    }

    monolithic.destroy();
    sliced!.destroy();
  });

  it('produces a byte-identical re-export for the 5,326-tile A Shau navmesh', async () => {
    if (!ashauExists) throw new Error(`Missing committed asset: ${ASHAU_BIN}`);
    const data = readBin(ASHAU_BIN);

    const parsed = parseNavMeshSet(data);
    expect(parsed).not.toBeNull();
    expect(parsed!.tiles.length).toBeGreaterThan(5000);

    const monolithic = recastCore.importNavMesh(data).navMesh;
    const monolithicExport = recastCore.exportNavMesh(monolithic);

    const sliced = await importNavMeshSliced(data, recastCore, {
      // Default 8ms budget; provide an immediate yield so the test does not
      // pay real frame delays for hundreds of batches.
      yieldFn: () => Promise.resolve(),
    });
    expect(sliced).not.toBeNull();
    const slicedExport = recastCore.exportNavMesh(sliced!);

    expect(slicedExport.byteLength).toBe(monolithicExport.byteLength);
    expect(Buffer.from(slicedExport).equals(Buffer.from(monolithicExport))).toBe(true);

    monolithic.destroy();
    sliced!.destroy();
  });

  it('returns null (caller falls back to monolithic import) on a non-MSET payload', async () => {
    const sliced = await importNavMeshSliced(new Uint8Array([1, 2, 3, 4, 5]), recastCore, {});
    expect(sliced).toBeNull();
  });
});
