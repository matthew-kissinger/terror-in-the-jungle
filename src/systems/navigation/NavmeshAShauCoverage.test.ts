// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';
import { init, importNavMesh, NavMeshQuery } from '@recast-navigation/core';
import { A_SHAU_VALLEY_CONFIG } from '../../config/AShauValleyConfig';

/**
 * Behavior: the prebaked A Shau navmesh covers the full battlefield, so an NPC
 * route query between two points OUTSIDE the old anchor-window bounds returns a
 * navmesh path instead of falling back to beeline movement on steep DEM terrain.
 *
 * The "anchor window" was the only region the runtime tiled navmesh covered:
 * the bounding box of the scenario zones plus a 2-tile margin. For A Shau that
 * window spans roughly X [-8168, 8889], Z [-8839, 8883] inside a world that runs
 * to +/-10568 on each axis — so the ~1.7km perimeter band beyond the outermost
 * zones was UNCOVERED, and combatants there beelined uphill.
 *
 * Both probe points below sit at Z = -9600 (south perimeter band, well past the
 * window's Z floor of -8839). On master (no prebaked A Shau asset) this asset
 * does not exist and the test is skipped/fails the existence guard; once the
 * A Shau navmesh is prebaked, the path query succeeds.
 */

const ASHAU_NAVMESH_PATH = resolve(
  import.meta.dirname!,
  '..',
  '..',
  '..',
  'public',
  'data',
  'navmesh',
  'a_shau_valley.bin',
);

// Old anchor-window south floor for A Shau (zone-bbox.minZ - 2*256m margin),
// computed from A_SHAU_VALLEY_CONFIG zones. Probe points are chosen to sit
// south of this line so they fall outside the historical coverage.
const OLD_ANCHOR_WINDOW_Z_FLOOR = -8839;

// Two points in the southern perimeter band, both outside the old anchor window.
// Verified on the prebaked tiled mesh to snap onto walkable polygons and to be
// mutually reachable (multi-waypoint navmesh path).
const PROBE_A = new THREE.Vector3(6000, 0, -9600);
const PROBE_B = new THREE.Vector3(8500, 0, -9200);

describe('A Shau navmesh full-battlefield coverage', () => {
  const assetExists = existsSync(ASHAU_NAVMESH_PATH);

  beforeAll(async () => {
    if (assetExists) {
      await init();
    }
  });

  it('places the probe points outside the old anchor window', () => {
    // Sanity: the test only proves something if the probes are genuinely beyond
    // the region the runtime tiled navmesh used to cover.
    expect(PROBE_A.z).toBeLessThan(OLD_ANCHOR_WINDOW_Z_FLOOR);
    expect(PROBE_B.z).toBeLessThan(OLD_ANCHOR_WINDOW_Z_FLOOR);
  });

  it('has a prebaked A Shau navmesh asset and wires it into the mode config', () => {
    expect(assetExists).toBe(true);
    expect(A_SHAU_VALLEY_CONFIG.navmeshAsset).toBe('/data/navmesh/a_shau_valley.bin');
  });

  it('returns a navmesh path (not a beeline) between two points outside the old anchor window', () => {
    // Guarded so the suite stays green on a checkout without the gitignored DEM
    // (the asset is committed, but defend against a partial tree anyway).
    if (!assetExists) {
      throw new Error(
        `Prebaked A Shau navmesh missing at ${ASHAU_NAVMESH_PATH}. ` +
        'Run `npm run navmesh:generate` (requires the gitignored A Shau DEM).',
      );
    }

    const buffer = readFileSync(ASHAU_NAVMESH_PATH);
    const navMeshData = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const imported = importNavMesh(navMeshData);
    const query = new NavMeshQuery(imported.navMesh, { maxNodes: 4096 });

    // A Shau relief spans ~373m-1902m. The probes carry Y=0 (the test must not
    // depend on the gitignored DEM to know the true elevation), so the vertical
    // search half-extent is set above the full relief to find the ground poly.
    const SEARCH = { x: 40, y: 2400, z: 40 };
    query.defaultQueryHalfExtents = { ...SEARCH };

    const snapA = query.findClosestPoint(
      { x: PROBE_A.x, y: PROBE_A.y, z: PROBE_A.z },
      { halfExtents: { ...SEARCH } },
    );
    const snapB = query.findClosestPoint(
      { x: PROBE_B.x, y: PROBE_B.y, z: PROBE_B.z },
      { halfExtents: { ...SEARCH } },
    );

    // Both probes must land on the navmesh — proof the perimeter band is covered.
    expect(snapA.success && snapA.polyRef !== 0).toBe(true);
    expect(snapB.success && snapB.polyRef !== 0).toBe(true);

    const pathResult = query.computePath(snapA.point, snapB.point);

    query.destroy();
    imported.navMesh.destroy();

    // A real navmesh path (>= 2 waypoints) rather than a null/beeline fallback.
    expect(pathResult.success).toBe(true);
    expect(pathResult.path.length).toBeGreaterThanOrEqual(2);
  });
});
