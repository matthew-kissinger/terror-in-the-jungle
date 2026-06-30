// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GameMode, type GameModeConfig, type TerrainFlowPolicyConfig } from '../../config/gameModeTypes';
import { Faction } from '../combat/types';
import { compileTerrainFeatures } from './TerrainFeatureCompiler';
import { compileTerrainFlow, routeCorridorExclusionZones } from './TerrainFlowCompiler';
import type { TerrainExclusionZone, TerrainFlowPath } from './TerrainFeatureTypes';

// Behavior tests for the route veg-exclusion corridor (route-corridor-exclusion).
//
// The owner playtest found trees growing straight down the centerline of the
// gray strategic "trail" patches. The compiler now traces a circular exclusion
// corridor along each compiled route so the scatterers skip the trail. These
// tests assert the OBSERVABLE contract: a candidate ON the centerline is
// excluded (falls inside an emitted zone) while one well off the route is not.
// We do NOT assert on the corridor sample spacing or radius constants — those
// are tuning knobs. We assert the caller-visible inclusion behavior, which is
// exactly the predicate both scatterers run in `isExcluded`.

function makeModeConfig(terrainFlow: TerrainFlowPolicyConfig): GameModeConfig {
  // Two zones far apart so the planner emits a real multi-segment route running
  // roughly along z = 0 through the world center.
  return {
    id: GameMode.A_SHAU_VALLEY,
    name: 'Route Exclusion Test',
    description: 'test',
    worldSize: 2000,
    chunkRenderDistance: 4,
    maxTickets: 100,
    matchDuration: 60,
    deathPenalty: 1,
    playerCanSpawnAtZones: true,
    respawnTime: 5,
    spawnProtectionDuration: 2,
    maxCombatants: 20,
    squadSize: { min: 4, max: 6 },
    reinforcementInterval: 30,
    zones: [
      {
        id: 'us_home',
        name: 'US HQ',
        position: new THREE.Vector3(-400, 0, 0),
        radius: 40,
        isHomeBase: true,
        owner: Faction.US,
        ticketBleedRate: 0,
      },
      {
        id: 'objective_a',
        name: 'Objective A',
        position: new THREE.Vector3(400, 0, 0),
        radius: 30,
        isHomeBase: false,
        owner: null,
        ticketBleedRate: 1,
      },
    ],
    captureRadius: 25,
    captureSpeed: 5,
    minimapScale: 400,
    viewDistance: 200,
    terrainFlow,
  };
}

const BASE_POLICY: TerrainFlowPolicyConfig = {
  enabled: true,
  routeStamping: 'full',
  routeWidth: 22,
  routeBlend: 8,
  routeSpacing: 24,
  routeSurface: 'jungle_trail',
  routeGradeStrength: 0.08,
};

const FLAT_HEIGHT = () => 100;

/** The exact predicate both scatterers use in `isExcluded`. */
function isExcluded(zones: ReadonlyArray<TerrainExclusionZone>, x: number, z: number): boolean {
  for (const zone of zones) {
    const dx = x - zone.x;
    const dz = z - zone.z;
    if (dx * dx + dz * dz <= zone.radius * zone.radius) return true;
  }
  return false;
}

/** Midpoint of the polyline segment whose endpoints straddle the most travel. */
function centerlineSample(path: TerrainFlowPath): { x: number; z: number } {
  const mid = Math.floor(path.points.length / 2);
  const a = path.points[Math.max(0, mid - 1)];
  const b = path.points[mid];
  return { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
}

describe('TerrainFlowCompiler route veg-exclusion corridor', () => {
  it('emits exclusion zones tracing each compiled route', () => {
    const result = compileTerrainFlow(makeModeConfig({ ...BASE_POLICY }), FLAT_HEIGHT);

    expect(result.flowPaths.length).toBeGreaterThan(0);
    expect(result.vegetationExclusionZones.length).toBeGreaterThan(0);
    // Corridor zones are attributed to the route that emitted them.
    const routeId = result.flowPaths[0]!.id;
    expect(
      result.vegetationExclusionZones.some((zone) => zone.sourceId === routeId),
    ).toBe(true);
  });

  it('excludes a candidate on the route centerline but not one well off the route', () => {
    const result = compileTerrainFlow(makeModeConfig({ ...BASE_POLICY }), FLAT_HEIGHT);
    const zones = result.vegetationExclusionZones;
    const path = result.flowPaths[0]!;

    // A point sitting on the trail centerline must be excluded.
    const onTrail = centerlineSample(path);
    expect(isExcluded(zones, onTrail.x, onTrail.z)).toBe(true);

    // A point pushed far to the side of the same centerline sample must NOT be
    // excluded — the corridor clears the trail, not the flanking jungle.
    const offRoute = { x: onTrail.x, z: onTrail.z + path.width * 5 };
    expect(isExcluded(zones, offRoute.x, offRoute.z)).toBe(false);
  });

  it('feeds the corridors into the same vegetationExclusionZones stream as POIs', () => {
    // The full public compile path is what production wires into
    // TerrainSystem.setExclusionZones -> both scatterers. The route corridors
    // must arrive on that same stream so ground cards and GLB heroes both skip
    // the trail without any new plumbing.
    const compiled = compileTerrainFeatures(makeModeConfig({ ...BASE_POLICY }), FLAT_HEIGHT);

    expect(compiled.flowPaths.length).toBeGreaterThan(0);
    const routeId = compiled.flowPaths[0]!.id;
    const onTrail = centerlineSample(compiled.flowPaths[0]!);

    expect(
      compiled.vegetationExclusionZones.some((zone) => zone.sourceId === routeId),
    ).toBe(true);
    expect(isExcluded(compiled.vegetationExclusionZones, onTrail.x, onTrail.z)).toBe(true);
  });
});

describe('routeCorridorExclusionZones (centerline coverage)', () => {
  it('covers the whole centerline so no point along it slips between samples', () => {
    // A straight 100m centerline. Every point sampled along it must fall inside
    // at least one emitted zone (the corridor has no gaps), and a point a full
    // route-width to the side must fall outside it.
    const width = 20;
    const points = [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
    ];
    const zones = routeCorridorExclusionZones(points, width, 'route');

    expect(zones.length).toBeGreaterThan(0);
    for (let x = 0; x <= 100; x += 1) {
      expect(isExcluded(zones, x, 0)).toBe(true);
    }
    // A point a full route-width off the line is clear.
    expect(isExcluded(zones, 50, width)).toBe(false);
  });

  it('returns no zones for an empty centerline', () => {
    expect(routeCorridorExclusionZones([], 20, 'route')).toEqual([]);
  });
});
