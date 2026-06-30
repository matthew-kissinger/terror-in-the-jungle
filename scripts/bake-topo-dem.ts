// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Bake coarse topographic DEMs for the 3D orbital map.
 *
 * The orbital relief mesh CPU-displaces a 64-128² grid. Rather than re-clip
 * NASADEM from OpenTopography (no network / credentials in CI), this script
 * DOWNSAMPLES the height `.f32` DEMs ALREADY committed to the repo:
 *   - seeded maps: public/data/heightmaps/<mode>-<seed>.f32 (1024² or 256²),
 *   - A Shau big-map: public/data/vietnam/big-map/a-shau-z14-9x9.f32 (2304²,
 *     NASADEM-derived, public-domain/CC0) WHEN it is present locally (this DEM
 *     is .gitignored as a large binary; the seeded maps cover CI).
 *
 * For each input it writes:
 *   - public/data/heightmaps/<name>-topo-<size>.f32  (coarse Float32Array grid)
 *   - the same path + `.json` sidecar (min/max/worldSize/provenance).
 *
 * Generated `.f32` carry NO SPDX header; their NASADEM public-domain provenance
 * is recorded in docs/asset-provenance/ + THIRD-PARTY-ASSETS.md.
 *
 * Usage:
 *   npx tsx scripts/bake-topo-dem.ts                 # bake all present inputs
 *   npx tsx scripts/bake-topo-dem.ts --size 96       # override coarse grid size
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  downsampleHeightGrid,
  type HeightGrid,
} from '../src/ui/map/orbital/OrbitalTopoMeshBuilder';

const repoRoot = process.cwd();
const HEIGHTMAP_DIR = join(repoRoot, 'public', 'data', 'heightmaps');

interface BakeInput {
  /** Output base name, e.g. 'a-shau-topo' or 'open_frontier-42-topo'. */
  name: string;
  /** Absolute path to the source `.f32`. */
  source: string;
  /** World extent (metres) the source DEM spans. */
  worldSize: number;
  provenance: string;
}

const ASHAU_WORLD_SIZE = 21000; // ~21km A Shau DEM footprint
const OPEN_FRONTIER_WORLD_SIZE = 3200;
const SMALL_WORLD_SIZE = 1600;

/** Candidate inputs; only those whose source exists on disk are baked. */
function candidateInputs(): BakeInput[] {
  const inputs: BakeInput[] = [
    {
      name: 'a-shau-topo',
      source: join(repoRoot, 'public', 'data', 'vietnam', 'big-map', 'a-shau-z14-9x9.f32'),
      worldSize: ASHAU_WORLD_SIZE,
      provenance: 'NASADEM (public-domain / CC0) A Shau Valley z14 9x9 clip, downsampled.',
    },
  ];
  const seeded: Array<{ mode: string; seed: number; worldSize: number }> = [
    { mode: 'open_frontier', seed: 42, worldSize: OPEN_FRONTIER_WORLD_SIZE },
    { mode: 'zone_control', seed: 42, worldSize: SMALL_WORLD_SIZE },
    { mode: 'tdm', seed: 42, worldSize: SMALL_WORLD_SIZE },
  ];
  for (const s of seeded) {
    inputs.push({
      name: `${s.mode}-${s.seed}-topo`,
      source: join(HEIGHTMAP_DIR, `${s.mode}-${s.seed}.f32`),
      worldSize: s.worldSize,
      provenance: `Procedurally generated seed DEM (${s.mode}-${s.seed}), downsampled.`,
    });
  }
  return inputs;
}

function loadF32(path: string): HeightGrid | null {
  const buf = readFileSync(path);
  const floats = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const gridSize = Math.round(Math.sqrt(floats.length));
  if (gridSize < 2 || gridSize * gridSize !== floats.length) return null;
  // worldSize is filled in by the caller; placeholder here.
  return { data: new Float32Array(floats), gridSize, worldSize: 0 };
}

function gridStats(grid: HeightGrid): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < grid.data.length; i++) {
    const h = grid.data[i];
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return { min, max };
}

function bake(input: BakeInput, targetSize: number): boolean {
  if (!existsSync(input.source)) {
    console.log(`[bake-topo-dem] skip (source absent): ${input.source}`);
    return false;
  }
  const source = loadF32(input.source);
  if (!source) {
    console.warn(`[bake-topo-dem] not a square f32 grid: ${input.source}`);
    return false;
  }
  source.worldSize = input.worldSize;
  const coarse = downsampleHeightGrid(source, targetSize);
  const { min, max } = gridStats(coarse);

  const outDir = HEIGHTMAP_DIR;
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outF32 = join(outDir, `${input.name}-${targetSize}.f32`);
  const outJson = `${outF32}.json`;

  const bytes = Buffer.from(coarse.data.buffer, coarse.data.byteOffset, coarse.data.byteLength);
  writeFileSync(outF32, bytes);
  writeFileSync(
    outJson,
    JSON.stringify(
      {
        gridSize: coarse.gridSize,
        worldSize: input.worldSize,
        minHeight: min,
        maxHeight: max,
        sourceGridSize: source.gridSize,
        provenance: input.provenance,
        license: 'NASADEM public-domain / CC0 (A Shau); procedural (seeded maps)',
        bakedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    `[bake-topo-dem] ${input.name}: ${source.gridSize}² -> ${coarse.gridSize}² ` +
      `(${min.toFixed(1)}..${max.toFixed(1)}m) -> ${join('public', 'data', 'heightmaps', `${input.name}-${targetSize}.f32`)}`,
  );
  return true;
}

function main(): void {
  const sizeArg = process.argv.indexOf('--size');
  const targetSize = sizeArg >= 0 ? Math.max(16, Math.min(128, Number(process.argv[sizeArg + 1]))) : 96;
  // Ensure the output dir resolves even from a fresh checkout.
  void dirname(HEIGHTMAP_DIR);

  let baked = 0;
  for (const input of candidateInputs()) {
    if (bake(input, targetSize)) baked++;
  }
  console.log(`[bake-topo-dem] baked ${baked} coarse topo DEM(s) at ${targetSize}².`);
}

main();
