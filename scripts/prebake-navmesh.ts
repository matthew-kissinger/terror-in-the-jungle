/**
 * Pre-bake navmesh binaries and heightmap grids for all game mode seed variants.
 * Runs at build time via `npm run navmesh:generate`.
 * Validates connectivity and fails the build if home bases are disconnected.
 */

import * as THREE from 'three';
import { init, exportNavMesh, importNavMesh, NavMeshQuery } from '@recast-navigation/core';
import { generateSoloNavMesh } from '@recast-navigation/generators';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import { OPEN_FRONTIER_CONFIG } from '../src/config/OpenFrontierConfig';
import { ZONE_CONTROL_CONFIG } from '../src/config/ZoneControlConfig';
import { TEAM_DEATHMATCH_CONFIG } from '../src/config/TeamDeathmatchConfig';
import { getMapVariants } from '../src/config/MapSeedRegistry';
import { GameMode } from '../src/config/gameModeTypes';
import { NoiseHeightProvider } from '../src/systems/terrain/NoiseHeightProvider';
import { StampedHeightProvider } from '../src/systems/terrain/StampedHeightProvider';
import { compileTerrainFeatures } from '../src/systems/terrain/TerrainFeatureCompiler';
import { buildHeightfieldMesh } from '../src/systems/navigation/NavmeshHeightfieldBuilder';
import { computeTerrainSurfaceGridSize } from '../src/systems/terrain/TerrainSurfaceRuntime';
import { computeNavmeshBakeSignature } from '../src/systems/navigation/NavmeshBakeSignature';
import { buildNavmeshFeatureObstacleMeshes } from '../src/systems/navigation/NavmeshFeatureObstacles';
import type { GameModeConfig } from '../src/config/gameModeTypes';

// ── Recast params (must match NavmeshSystem) ─────────────────────────

const AGENT_RADIUS = 0.5;
const AGENT_HEIGHT = 3.0;
const WALKABLE_SLOPE_ANGLE = 45;
const WALKABLE_CLIMB = 0.6;
interface ModeEntry {
  id: string;
  mode: GameMode;
  config: GameModeConfig;
  /** Cell sizes to try, from finest to coarsest. First to pass connectivity wins. */
  csOptions: number[];
}

const MODES: ModeEntry[] = [
  { id: 'open_frontier', mode: GameMode.OPEN_FRONTIER, config: OPEN_FRONTIER_CONFIG, csOptions: [2.0, 1.5] },
  { id: 'zone_control', mode: GameMode.ZONE_CONTROL, config: ZONE_CONTROL_CONFIG, csOptions: [1.0] },
  { id: 'tdm', mode: GameMode.TEAM_DEATHMATCH, config: TEAM_DEATHMATCH_CONFIG, csOptions: [1.0] },
];

const NAVMESH_DIR = resolve(import.meta.dirname!, '..', 'public', 'data', 'navmesh');
const HEIGHTMAP_DIR = resolve(import.meta.dirname!, '..', 'public', 'data', 'heightmaps');
const BAKE_MANIFEST_PATH = resolve(NAVMESH_DIR, 'bake-manifest.json');
const QUERY_HALF_EXTENTS = { x: 5, y: 50, z: 5 };

interface ExpectedBakeEntry {
  modeId: string;
  seed: number;
  navmeshAsset: string;
  heightmapAsset: string;
  navmeshPath: string;
  heightmapPath: string;
  signature: string;
  worldSize: number;
  heightmapGridSize: number;
  csOptions: number[];
}

interface BakeManifestEntry {
  modeId: string;
  seed: number;
  signature: string;
  navmeshAsset: string;
  heightmapAsset: string;
  worldSize: number;
  heightmapGridSize: number;
  csOptions: number[];
}

interface BakeManifest {
  schemaVersion: 1;
  generator: 'scripts/prebake-navmesh.ts';
  entries: BakeManifestEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function buildRecastConfig(worldSize: number, cs: number): Record<string, number> {
  const isLargeWorld = worldSize > 1600;
  const ch = isLargeWorld ? 0.4 : 0.2;
  return {
    cs,
    ch,
    walkableSlopeAngle: WALKABLE_SLOPE_ANGLE,
    walkableHeight: Math.ceil(AGENT_HEIGHT / ch),
    walkableClimb: Math.ceil(WALKABLE_CLIMB / ch),
    walkableRadius: Math.ceil(AGENT_RADIUS / cs),
    maxEdgeLen: isLargeWorld ? 24 : 12,
    maxSimplificationError: 1.3,
    minRegionArea: isLargeWorld ? 16 : 8,
    mergeRegionArea: isLargeWorld ? 40 : 20,
    maxVertsPerPoly: 6,
    detailSampleDist: isLargeWorld ? 12 : 6,
    detailSampleMaxError: 1,
  };
}

function buildBakeSignature(mode: ModeEntry, seed: number): string {
  const config = mode.config;
  return computeNavmeshBakeSignature({
    modeId: mode.id,
    gameMode: mode.mode,
    seed,
    worldSize: config.worldSize,
    heightmapGridSize: computeTerrainSurfaceGridSize(config.worldSize),
    recastConfigs: mode.csOptions.map(cs => buildRecastConfig(config.worldSize, cs)),
    terrain: config.terrain ?? null,
    terrainFlow: config.terrainFlow ?? null,
    features: config.features ?? [],
    zones: config.zones ?? [],
  });
}

function getModeSeeds(mode: ModeEntry): number[] {
  const variants = getMapVariants(mode.mode);
  return variants.length > 0
    ? variants.map(v => v.seed)
    : (typeof mode.config.terrainSeed === 'number' ? [mode.config.terrainSeed] : []);
}

function buildExpectedBakeEntries(): ExpectedBakeEntry[] {
  const entries: ExpectedBakeEntry[] = [];
  for (const mode of MODES) {
    for (const seed of getModeSeeds(mode)) {
      const navmeshAsset = `/data/navmesh/${mode.id}-${seed}.bin`;
      const heightmapAsset = `/data/heightmaps/${mode.id}-${seed}.f32`;
      entries.push({
        modeId: mode.id,
        seed,
        navmeshAsset,
        heightmapAsset,
        navmeshPath: resolve(NAVMESH_DIR, `${mode.id}-${seed}.bin`),
        heightmapPath: resolve(HEIGHTMAP_DIR, `${mode.id}-${seed}.f32`),
        signature: buildBakeSignature(mode, seed),
        worldSize: mode.config.worldSize,
        heightmapGridSize: computeTerrainSurfaceGridSize(mode.config.worldSize),
        csOptions: [...mode.csOptions],
      });
    }
  }
  return entries;
}

function readBakeManifest(): BakeManifest | null {
  if (!existsSync(BAKE_MANIFEST_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(BAKE_MANIFEST_PATH, 'utf8')) as BakeManifest;
  } catch {
    return null;
  }
}

function getBakeManifestIssues(expectedEntries: ExpectedBakeEntry[]): string[] {
  const issues: string[] = [];
  for (const entry of expectedEntries) {
    if (!existsSync(entry.navmeshPath)) {
      issues.push(`missing navmesh ${entry.navmeshAsset}`);
    }
    if (!existsSync(entry.heightmapPath)) {
      issues.push(`missing heightmap ${entry.heightmapAsset}`);
    }
  }

  const manifest = readBakeManifest();
  if (!manifest) {
    issues.push('missing or unreadable navmesh bake manifest');
    return issues;
  }

  const entriesByKey = new Map(
    manifest.entries.map(entry => [`${entry.modeId}:${entry.seed}`, entry]),
  );
  for (const expected of expectedEntries) {
    const manifestEntry = entriesByKey.get(`${expected.modeId}:${expected.seed}`);
    if (!manifestEntry) {
      issues.push(`missing manifest entry ${expected.modeId}:${expected.seed}`);
      continue;
    }
    if (manifestEntry.signature !== expected.signature) {
      issues.push(`stale manifest signature ${expected.modeId}:${expected.seed}`);
    }
    if (
      manifestEntry.navmeshAsset !== expected.navmeshAsset ||
      manifestEntry.heightmapAsset !== expected.heightmapAsset
    ) {
      issues.push(`stale asset paths ${expected.modeId}:${expected.seed}`);
    }
  }
  return issues;
}

function writeBakeManifest(expectedEntries: ExpectedBakeEntry[]): void {
  const manifest: BakeManifest = {
    schemaVersion: 1,
    generator: 'scripts/prebake-navmesh.ts',
    entries: expectedEntries.map((entry): BakeManifestEntry => ({
      modeId: entry.modeId,
      seed: entry.seed,
      signature: entry.signature,
      navmeshAsset: entry.navmeshAsset,
      heightmapAsset: entry.heightmapAsset,
      worldSize: entry.worldSize,
      heightmapGridSize: entry.heightmapGridSize,
      csOptions: entry.csOptions,
    })),
  };
  writeFileSync(BAKE_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Build heightfield + obstacle meshes, extract raw arrays for Recast.
 */
function buildInputGeometry(
  config: GameModeConfig,
  getHeight: (x: number, z: number) => number,
  hfCellSize: number,
): { positions: Float32Array; indices: Uint32Array; dispose: () => void } {
  const worldSize = config.worldSize;
  const halfSize = worldSize / 2;

  // Heightfield mesh
  const hfGeometry = buildHeightfieldMesh(getHeight, -halfSize, -halfSize, worldSize, worldSize, hfCellSize);
  const hfMesh = new THREE.Mesh(hfGeometry);
  const meshes: THREE.Mesh[] = [hfMesh];

  meshes.push(...buildNavmeshFeatureObstacleMeshes(config.features, getHeight));

  // Extract combined positions/indices
  let totalVerts = 0;
  let totalIdx = 0;
  for (const mesh of meshes) {
    mesh.updateMatrixWorld(true);
    totalVerts += mesh.geometry.getAttribute('position').count;
    const idx = mesh.geometry.getIndex();
    if (idx) totalIdx += idx.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIdx);
  let pOff = 0;
  let iOff = 0;
  let vOff = 0;
  const v = new THREE.Vector3();

  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const idx = mesh.geometry.getIndex()!;

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      positions[pOff++] = v.x;
      positions[pOff++] = v.y;
      positions[pOff++] = v.z;
    }

    for (let i = 0; i < idx.count; i++) {
      indices[iOff++] = idx.getX(i) + vOff;
    }

    vOff += pos.count;
  }

  return {
    positions,
    indices,
    dispose: () => { for (const m of meshes) m.geometry.dispose(); },
  };
}

/**
 * Bake a heightmap grid matching what TerrainSurfaceRuntime produces at runtime.
 */
function bakeHeightmapGrid(
  getHeight: (x: number, z: number) => number,
  worldSize: number,
): { data: Float32Array; gridSize: number } {
  const gridSize = computeTerrainSurfaceGridSize(worldSize);
  const data = new Float32Array(gridSize * gridSize);
  const halfWorld = worldSize / 2;
  const step = worldSize / (gridSize - 1);

  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const worldX = -halfWorld + x * step;
      const worldZ = -halfWorld + z * step;
      data[z * gridSize + x] = getHeight(worldX, worldZ);
    }
  }

  return { data, gridSize };
}

/**
 * Validate navmesh connectivity via union-find over home-base path queries.
 */
function validateConnectivity(
  navMeshData: Uint8Array,
  homeBases: Array<{ name: string; x: number; z: number; radius: number }>,
  getHeight: (x: number, z: number) => number,
): { connected: boolean; islands: string[][] } {
  const imported = importNavMesh(navMeshData);
  const query = new NavMeshQuery(imported.navMesh, { maxNodes: 2048 });
  query.defaultQueryHalfExtents = { ...QUERY_HALF_EXTENTS };

  const points = homeBases.map((b) => {
    const raw = { x: b.x, y: getHeight(b.x, b.z), z: b.z };
    const searchRadius = Math.max(b.radius + 20, 60);
    const snapped = query.findClosestPoint(raw, {
      halfExtents: { x: searchRadius, y: 50, z: searchRadius },
    });
    return {
      name: b.name,
      pos: snapped.success && snapped.polyRef !== 0 ? snapped.point : raw,
    };
  });

  // Union-find
  const parent = points.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (find(i) === find(j)) continue;
      const result = query.computePath(points[i].pos, points[j].pos);
      if (result.success && result.path.length > 0) {
        union(i, j);
      }
    }
  }

  // Group into islands
  const groups = new Map<number, string[]>();
  for (let i = 0; i < points.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(points[i].name);
  }

  const islands = [...groups.values()];
  query.destroy();
  imported.navMesh.destroy();

  return { connected: islands.length === 1, islands };
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const expectedEntries = buildExpectedBakeEntries();
  const manifestIssues = getBakeManifestIssues(expectedEntries);
  if (expectedEntries.length > 0 && manifestIssues.length === 0) {
    console.log(`All ${expectedEntries.length * 2} pre-baked assets match the navmesh bake manifest; skipping generation.`);
    console.log('Run with --force to regenerate.');
    if (!process.argv.includes('--force')) {
      return;
    }
  } else if (!process.argv.includes('--force')) {
    console.log('Pre-baked assets need regeneration:');
    for (const issue of manifestIssues.slice(0, 12)) {
      console.log(`- ${issue}`);
    }
    if (manifestIssues.length > 12) {
      console.log(`- ... ${manifestIssues.length - 12} more`);
    }
  }

  console.log('Initializing Recast WASM...');
  await init();
  console.log('Recast WASM ready.\n');

  for (const dir of [NAVMESH_DIR, HEIGHTMAP_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  let failures = 0;
  let totalNavmeshes = 0;
  let totalHeightmaps = 0;

  for (const mode of MODES) {
    const config = mode.config;
    const seeds = getModeSeeds(mode);

    if (seeds.length === 0) {
      console.log(`Skipping ${mode.id} (no fixed seeds)`);
      continue;
    }

    console.log(`\n${'#'.repeat(60)}`);
    console.log(`Mode: ${mode.id} | worldSize=${config.worldSize} | ${seeds.length} seed(s): [${seeds.join(', ')}]`);
    console.log('#'.repeat(60));

    const homeBases = (config.zones ?? [])
      .filter(z => z.isHomeBase)
      .map(z => ({ name: z.name, x: z.position.x, z: z.position.z, radius: z.radius }));

    if (homeBases.length < 2) {
      console.log(`  Warning: fewer than 2 home bases, skipping connectivity check`);
    }

    for (const seed of seeds) {
      console.log(`\n  ${'='.repeat(50)}`);
      console.log(`  Seed: ${seed}`);
      console.log(`  ${'='.repeat(50)}`);

      // 1. Create height provider chain
      const noiseProvider = new NoiseHeightProvider(seed);
      const compiled = compileTerrainFeatures(config, (x, z) => noiseProvider.getHeightAt(x, z));
      const heightProvider = compiled.stamps.length > 0
        ? new StampedHeightProvider(noiseProvider, compiled.stamps)
        : noiseProvider;
      const getHeight = (x: number, z: number) => heightProvider.getHeightAt(x, z);

      // 2. Bake heightmap grid
      const hmStart = performance.now();
      const hm = bakeHeightmapGrid(getHeight, config.worldSize);
      const hmTime = performance.now() - hmStart;
      const hmFile = `${mode.id}-${seed}.f32`;
      const hmPath = resolve(HEIGHTMAP_DIR, hmFile);
      writeFileSync(hmPath, Buffer.from(hm.data.buffer));
      console.log(`  Heightmap: ${hm.gridSize}x${hm.gridSize} = ${(hm.data.byteLength / 1024).toFixed(0)}KB (${hmTime.toFixed(0)}ms)`);
      console.log(`  Written: public/data/heightmaps/${hmFile}`);
      totalHeightmaps++;

      // 3. Try each cs option until connectivity passes
      let navSuccess = false;
      for (const cs of mode.csOptions) {
        const hfCellSize = Math.max(cs, 2.0);
        const recastConfig = buildRecastConfig(config.worldSize, cs);

        const voxelCols = Math.ceil(config.worldSize / cs) ** 2;
        const estMB = (voxelCols * 8 / (1024 * 1024)).toFixed(1);
        console.log(`\n  Trying cs=${cs} (${voxelCols.toLocaleString()} voxel columns, ~${estMB}MB est.)`);
        console.log(`  Heightfield sampling: ${hfCellSize}m`);

        // Build geometry
        const start = performance.now();
        const input = buildInputGeometry(config, getHeight, hfCellSize);
        const geoTime = performance.now() - start;
        console.log(`  Geometry: ${(input.positions.length / 3).toLocaleString()} verts, ${(input.indices.length / 3).toLocaleString()} tris (${geoTime.toFixed(0)}ms)`);

        // Generate navmesh
        const genStart = performance.now();
        const result = generateSoloNavMesh(input.positions, input.indices, recastConfig);
        const genTime = performance.now() - genStart;

        if (!result.success || !result.navMesh) {
          console.log(`  FAILED: navmesh generation failed (${genTime.toFixed(0)}ms)`);
          input.dispose();
          continue;
        }

        const navMeshData = exportNavMesh(result.navMesh);
        result.navMesh.destroy();
        input.dispose();

        console.log(`  Generated: ${(navMeshData.byteLength / 1024).toFixed(1)}KB (${genTime.toFixed(0)}ms)`);

        // Validate connectivity
        if (homeBases.length >= 2) {
          const conn = validateConnectivity(navMeshData, homeBases, getHeight);
          if (!conn.connected) {
            console.log(`  DISCONNECTED: ${conn.islands.length} islands:`);
            for (const island of conn.islands) {
              console.log(`    - [${island.join(', ')}]`);
            }
            continue;
          }
          console.log(`  Connectivity: PASS (${homeBases.length} home bases connected)`);
        }

        // Write binary
        const outFile = `${mode.id}-${seed}.bin`;
        const outPath = resolve(NAVMESH_DIR, outFile);
        writeFileSync(outPath, navMeshData);
        console.log(`  Written: public/data/navmesh/${outFile} (${(navMeshData.byteLength / 1024).toFixed(1)}KB)`);
        totalNavmeshes++;
        navSuccess = true;
        break;
      }

      if (!navSuccess) {
        console.error(`\n  ERROR: No cs value produced a connected navmesh for ${mode.id} seed=${seed}`);
        failures++;
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Totals: ${totalNavmeshes} navmeshes, ${totalHeightmaps} heightmaps`);
  if (failures > 0) {
    console.error(`FAILED: ${failures} variant(s) have disconnected navmeshes`);
    process.exit(1);
  }
  writeBakeManifest(expectedEntries);
  console.log(`Manifest: public/data/navmesh/bake-manifest.json (${expectedEntries.length} entries)`);
  console.log('All map data pre-baked and validated.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
