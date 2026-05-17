import * as THREE from 'three';
import { Faction } from '../combat/types';
import { Tank } from './Tank';
import { M48_HULL_DIMENSIONS, M48_PHYSICS_CONFIG, M48_SPAWN_OFFSETS } from '../../config/vehicles/m48-config';
import type { VehicleManager } from './VehicleManager';

/**
 * Procedural M48 Patton chassis mesh + scenario-spawn glue. Mirrors the
 * shape of `M2HBEmplacementSpawn`:
 *
 *   - Procedural mesh shipped in source so the scenario spawn is not
 *     blocked on the GLB loader. `public/models/vehicles/ground/m48-patton.glb`
 *     does exist, but loading it is asynchronous and the cycle brief
 *     allows a procedural fallback — taking the fallback path keeps
 *     this PR synchronous and isolates the integration from the loader
 *     contract.
 *   - Static spawn table per scenario (Open Frontier US base + A Shau
 *     valley road).
 *   - `resolvePosition` callback so the caller can snap the spawn
 *     anchor to terrain through the runtime terrain provider.
 *
 * Hierarchy built by `buildM48ChassisMesh`:
 *   chassisRoot (positioned in world)
 *   ├── hull box (the main armored body)
 *   ├── turret cylinder (cosmetic stand-in; cycle #9 replaces it)
 *   └── barrel cylinder (cosmetic stand-in; cycle #9 replaces it)
 *
 * The mesh has no physics meaning — `TrackedVehiclePhysics` owns the
 * simulation; the mesh is just a visible proxy for the chassis-slice
 * playtest.
 */

export function buildM48ChassisMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'm48_chassis_root';

  const { length, width, height } = M48_HULL_DIMENSIONS;

  // Hull: rough armored box, olive-drab. Sits on its tracks with the
  // chassis origin at the track contact patch (matches the
  // TrackedVehiclePhysics axleOffset convention — origin Y on the
  // ground, hull body lifted half its height + a small clearance).
  const hullGeom = new THREE.BoxGeometry(width, height * 0.55, length);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x3d4631, flatShading: true });
  const hull = new THREE.Mesh(hullGeom, hullMat);
  hull.position.y = height * 0.275 + 0.45;
  root.add(hull);

  // Tracks: two long boxes flanking the hull, darker.
  const trackGeom = new THREE.BoxGeometry(width * 0.16, 0.65, length * 1.02);
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a18, flatShading: true });
  const trackL = new THREE.Mesh(trackGeom, trackMat);
  trackL.position.set(-width * 0.42, 0.325, 0);
  root.add(trackL);
  const trackR = new THREE.Mesh(trackGeom, trackMat);
  trackR.position.set(+width * 0.42, 0.325, 0);
  root.add(trackR);

  // Turret: cosmetic stand-in. Cycle #9 will swap for a proper rig.
  const turretGeom = new THREE.CylinderGeometry(1.4, 1.55, 0.85, 12);
  const turret = new THREE.Mesh(turretGeom, hullMat);
  turret.position.y = height * 0.55 + 0.45 + 0.45;
  turret.name = 'm48_turret_placeholder';
  root.add(turret);

  // Barrel: cosmetic stand-in along -Z (chassis-forward).
  const barrelGeom = new THREE.CylinderGeometry(0.09, 0.11, 5.0, 10);
  const barrel = new THREE.Mesh(barrelGeom, trackMat);
  barrel.rotation.x = Math.PI * 0.5;
  barrel.position.set(0, turret.position.y, -2.5);
  barrel.name = 'm48_barrel_placeholder';
  root.add(barrel);

  return root;
}

export interface CreateM48TankOptions {
  vehicleId: string;
  position: THREE.Vector3;
  faction: Faction;
  /** Override yaw (radians) for the chassis placement. */
  initialYaw?: number;
}

/**
 * Build a complete M48 tank (procedural mesh + Tank IVehicle) and
 * register it with the VehicleManager.
 */
export function createM48Tank(
  scene: THREE.Scene,
  vehicleManager: VehicleManager,
  options: CreateM48TankOptions,
): { tank: Tank; root: THREE.Group } {
  const root = buildM48ChassisMesh();
  root.position.copy(options.position);
  if (options.initialYaw !== undefined) root.rotation.y = options.initialYaw;
  scene.add(root);

  const tank = new Tank(options.vehicleId, root, options.faction, undefined, M48_PHYSICS_CONFIG);
  vehicleManager.register(tank);
  return { tank, root };
}

/**
 * Default scenario spawn table for the two cycle-VEKHIKL-3 M48
 * placements. Coordinates come from `M48_SPAWN_OFFSETS`; Y is left at
 * 0 and the spawn caller should snap-to-terrain via the runtime
 * terrain provider before handing off to `createM48Tank`.
 */
export const M48_SCENARIO_SPAWNS: Record<'open_frontier' | 'a_shau_valley', {
  vehicleId: string;
  position: THREE.Vector3;
  faction: Faction;
  initialYaw: number;
}> = {
  open_frontier: {
    vehicleId: 'm48_tank_of_us_fob',
    position: new THREE.Vector3(M48_SPAWN_OFFSETS.open_frontier.x, 0, M48_SPAWN_OFFSETS.open_frontier.z),
    faction: Faction.US,
    initialYaw: M48_SPAWN_OFFSETS.open_frontier.yaw,
  },
  a_shau_valley: {
    vehicleId: 'm48_tank_ashau_valley_road',
    position: new THREE.Vector3(M48_SPAWN_OFFSETS.a_shau_valley.x, 0, M48_SPAWN_OFFSETS.a_shau_valley.z),
    faction: Faction.US,
    initialYaw: M48_SPAWN_OFFSETS.a_shau_valley.yaw,
  },
};

export type M48ScenarioMode = keyof typeof M48_SCENARIO_SPAWNS;

export function spawnScenarioM48Tanks(args: {
  modes: M48ScenarioMode[];
  scene: THREE.Scene;
  vehicleManager: VehicleManager;
  /**
   * Optional resolver to translate the spawn-table's logical position
   * into a final world-space point (e.g. snap to terrain height).
   * Defaults to returning the table position unchanged.
   */
  resolvePosition?: (mode: M48ScenarioMode, base: THREE.Vector3) => THREE.Vector3;
}): Array<{ vehicleId: string; tank: Tank; root: THREE.Group }> {
  const spawned: Array<{ vehicleId: string; tank: Tank; root: THREE.Group }> = [];
  for (const mode of args.modes) {
    const def = M48_SCENARIO_SPAWNS[mode];
    const position = args.resolvePosition ? args.resolvePosition(mode, def.position) : def.position;
    const parts = createM48Tank(args.scene, args.vehicleManager, {
      vehicleId: def.vehicleId,
      position,
      faction: def.faction,
      initialYaw: def.initialYaw,
    });
    spawned.push({ vehicleId: def.vehicleId, ...parts });
  }
  return spawned;
}
