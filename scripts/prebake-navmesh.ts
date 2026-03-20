/**
 * Pre-bake navmesh binaries and heightmap grids for all game mode seed variants.
 * Runs at build time via `npm run navmesh:generate`.
 * Validates connectivity and fails the build if home bases are disconnected.
 */

import * as THREE from 'three';
import { init, exportNavMesh, importNavMesh, NavMeshQuery } from '@recast-navigation/core';
import { generateSoloNavMesh } from '@recast-navigation/generators';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
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
import type { GameModeConfig } from '../src/config/gameModeTypes';

// ── Recast params (must match NavmeshSystem) ─────────────────────────

const AGENT_RADIUS = 0.5;
const AGENT_HEIGHT = 3.0;
const WALKABLE_SLOPE_ANGLE = 45;
const WALKABLE_CLIMB = 0.6;
const OBSTACLE_HEIGHT = 10.0;

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
const QUERY_HALF_EXTENTS = { x: 5, y: 50, z: 5 };

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

  // Obstacle meshes from features
  const features = config.features ?? [];
  for (const feature of features) {
    const fp = feature.footprint;
    if (!fp) continue;
    const y = getHeight(feature.position.x, feature.position.z);
    const yaw = feature.placement?.yaw ?? 0;

    if (fp.shape === 'circle') {
      const geo = new THREE.CylinderGeometry(fp.radius, fp.radius, OBSTACLE_HEIGHT, 12);
      const m = new THREE.Mesh(geo);
      m.position.set(feature.position.x, y + OBSTACLE_HEIGHT / 2, feature.position.z);
      m.updateMatrixWorld(true);
      meshes.push(m);
    } else if (fp.shape === 'rect' || fp.shape === 'strip') {
      const geo = new THREE.BoxGeometry(fp.width, OBSTACLE_HEIGHT, fp.length);
      const m = new THREE.Mesh(geo);
      m.position.set(feature.position.x, y + OBSTACLE_HEIGHT / 2, feature.position.z);
      if (yaw !== 0) m.rotation.y = yaw;
      m.updateMatrixWorld(true);
      meshes.push(m);
    }
  }

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
  homeBases: Array<{ name: string; x: number; z: number }>,
  getHeight: (x: number, z: number) => number,
): { connected: boolean; islands: string[][] } {
  const imported = importNavMesh(navMeshData);
  const query = new NavMeshQuery(imported.navMesh, { maxNodes: 2048 });
  query.defaultQueryHalfExtents = { ...QUERY_HALF_EXTENTS };

  const points = homeBases.map(b => ({
    name: b.name,
    pos: { x: b.x, y: getHeight(b.x, b.z), z: b.z },
  }));

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
    const variants = getMapVariants(mode.mode);
    // Collect seeds: registry variants + the config's fixed seed (as fallback)
    const seeds = variants.length > 0
      ? variants.map(v => v.seed)
      : (typeof config.terrainSeed === 'number' ? [config.terrainSeed] : []);

    if (seeds.length === 0) {
      console.log(`Skipping ${mode.id} (no fixed seeds)`);
      continue;
    }

    console.log(`\n${'#'.repeat(60)}`);
    console.log(`Mode: ${mode.id} | worldSize=${config.worldSize} | ${seeds.length} seed(s): [${seeds.join(', ')}]`);
    console.log('#'.repeat(60));

    const homeBases = (config.zones ?? [])
      .filter(z => z.isHomeBase)
      .map(z => ({ name: z.name, x: z.position.x, z: z.position.z }));

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
  console.log('All map data pre-baked and validated.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
