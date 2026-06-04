// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Faction } from '../combat/types';
import { Sampan, SAMPAN_HULL_DIMENSIONS } from './Sampan';
import type { VehicleManager } from './VehicleManager';

/**
 * Procedural Sampan hull mesh + scenario-spawn glue. Mirrors the
 * shape of `M48TankSpawn`:
 *
 *   - Procedural mesh shipped in source so the scenario spawn is not
 *     blocked on the GLB loader. `public/models/vehicles/watercraft/sampan.glb`
 *     does exist, but loading it is asynchronous; the procedural
 *     fallback keeps this PR synchronous and isolates the integration
 *     from the loader contract. A future cycle can swap in the GLB
 *     without touching the IVehicle / WatercraftPhysics surface.
 *   - Static spawn table per scenario (Open Frontier river + A Shau
 *     valley river).
 *   - `resolvePosition` callback so the caller can snap the spawn
 *     anchor to the water surface through a runtime water-sampler.
 *
 * Hierarchy built by `buildSampanHullMesh`:
 *   hullRoot (positioned in world)
 *   ├── hull box (the main wooden body, dark)
 *   └── gunwale strip (the upper rim, lighter, for visual readability)
 */

export function buildSampanHullMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'sampan_hull_root';

  const { length, beam, freeboard } = SAMPAN_HULL_DIMENSIONS;

  // Hull: long shallow box, dark wood color. Origin sits at the keel
  // so the WatercraftPhysics sample points (FL/FR/RL/RR + center at
  // y=0 in local) line up with the bottom of the boat. The visible
  // body is lifted half the freeboard so the hull box straddles the
  // origin without poking below it.
  const hullGeom = new THREE.BoxGeometry(beam, freeboard * 0.7, length);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, flatShading: true });
  const hull = new THREE.Mesh(hullGeom, hullMat);
  hull.position.y = freeboard * 0.35;
  root.add(hull);

  // Gunwale strip: lighter wood, sits above the hull as the rim.
  // Cosmetic only — gives the boat a readable silhouette against
  // the water at distance.
  const gunwaleGeom = new THREE.BoxGeometry(beam * 1.04, freeboard * 0.08, length * 1.02);
  const gunwaleMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, flatShading: true });
  const gunwale = new THREE.Mesh(gunwaleGeom, gunwaleMat);
  gunwale.position.y = freeboard * 0.7;
  root.add(gunwale);

  return root;
}

export interface CreateSampanOptions {
  vehicleId: string;
  position: THREE.Vector3;
  faction: Faction;
  /** Override yaw (radians) for the hull placement. */
  initialYaw?: number;
}

/**
 * Build a complete Sampan (procedural mesh + Sampan IVehicle) and
 * register it with the VehicleManager.
 */
export function createSampan(
  scene: THREE.Scene,
  vehicleManager: VehicleManager,
  options: CreateSampanOptions,
): { sampan: Sampan; root: THREE.Group } {
  const root = buildSampanHullMesh();
  root.position.copy(options.position);
  if (options.initialYaw !== undefined) root.rotation.y = options.initialYaw;
  scene.add(root);

  const sampan = new Sampan(options.vehicleId, root, options.faction);
  vehicleManager.register(sampan);
  return { sampan, root };
}

/**
 * Default scenario spawn table for the cycle-VODA-3 sampan
 * placements. Coordinates are picked along navigable hydrology
 * channels per the cycle brief — the caller is expected to snap the
 * Y component to the water surface (or terrain bank) through the
 * runtime sampler before constructing the hull, the same way the
 * M48 spawn snaps to terrain height.
 *
 * Coordinate rationale:
 *   - `open_frontier`: (-324, 0, 384) is the midpoint sample on the
 *     highest-accumulation seeded hydrology channel in
 *     `open_frontier-42-hydrology.json`. The old (-200, 0, 100) anchor
 *     was hundreds of meters off the actual ribbon, so the hull could
 *     silently fall back to terrain.
 *   - `a_shau_valley`: (-6895, 0, 4835) lies on the largest hydrology
 *     channel in the A Shau bake (accumulation 32944 cells; channel
 *     length 21.6 km). The point is deterministic, NVA-friendly
 *     (~7.6 km from Base Area 611, ~7.4 km from US LZ Goodman) and
 *     guaranteed wet against `a_shau_valley-hydrology.json`. The
 *     previous (60, 0, 80) coords were ~1.8 km away from the nearest
 *     channel, so the boat sat on dry dirt. The resolver snap (when
 *     supplied) handles the actual water-surface Y from the bake
 *     (channel elevation ~501 m at this point).
 */
export const SAMPAN_SCENARIO_SPAWNS: Record<'open_frontier' | 'a_shau_valley', {
  vehicleId: string;
  position: THREE.Vector3;
  faction: Faction;
  initialYaw: number;
}> = {
  open_frontier: {
    vehicleId: 'sampan_open_frontier_river',
    position: new THREE.Vector3(-324, 0, 384),
    faction: Faction.VC,
    initialYaw: Math.PI * 0.5,
  },
  a_shau_valley: {
    vehicleId: 'sampan_ashau_valley_river',
    position: new THREE.Vector3(-6895, 0, 4835),
    faction: Faction.NVA,
    initialYaw: Math.PI * 0.25,
  },
};

export type SampanScenarioMode = keyof typeof SAMPAN_SCENARIO_SPAWNS;

export function spawnScenarioSampans(args: {
  modes: SampanScenarioMode[];
  scene: THREE.Scene;
  vehicleManager: VehicleManager;
  /**
   * Optional resolver to translate the spawn-table's logical position
   * into a final world-space point (e.g. snap Y to water surface
   * height). Defaults to returning the table position unchanged.
   */
  resolvePosition?: (mode: SampanScenarioMode, base: THREE.Vector3) => THREE.Vector3;
}): Array<{ vehicleId: string; sampan: Sampan; root: THREE.Group }> {
  const spawned: Array<{ vehicleId: string; sampan: Sampan; root: THREE.Group }> = [];
  for (const mode of args.modes) {
    const def = SAMPAN_SCENARIO_SPAWNS[mode];
    const position = args.resolvePosition ? args.resolvePosition(mode, def.position) : def.position;
    const parts = createSampan(args.scene, args.vehicleManager, {
      vehicleId: def.vehicleId,
      position,
      faction: def.faction,
      initialYaw: def.initialYaw,
    });
    spawned.push({ vehicleId: def.vehicleId, ...parts });
  }
  return spawned;
}
