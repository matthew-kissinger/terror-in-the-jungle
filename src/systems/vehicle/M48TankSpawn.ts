// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
 *   - Static spawn table per scenario (Open Frontier airfield Main
 *     Motor Pool bay + A Shau valley road).
 *   - `resolvePosition` callback so the caller can snap the spawn
 *     anchor to terrain through the runtime terrain provider.
 *
 * Hierarchy built by `buildM48ChassisMesh`:
 *   chassisRoot (positioned in world)
 *   ├── hull box (the main armored body)
 *   ├── track L / track R boxes
 *
 * The turret + barrel meshes are NOT part of the chassis mesh. They are
 * mounted onto the `TankTurret` rig nodes (yaw + pitch) by
 * `mountM48TurretMeshes` after the `Tank` (and its turret) is constructed,
 * so the turret traverses and the barrel elevates with crew aim instead of
 * being a static cosmetic stand-in.
 *
 * The mesh has no physics meaning — `TrackedVehiclePhysics` owns the
 * simulation; the mesh is just a visible proxy.
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
  hull.name = 'm48_hull';
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

  return root;
}

/**
 * Mount the rotating turret + barrel geometry onto a Tank's `TankTurret`
 * rig. The turret bulk parents under the yaw node (traverses with yaw) and
 * the barrel + mantlet parent under the pitch node (elevates with the
 * barrel). The TankTurret's `barrelTipLocalOffset` points -5 m along
 * pitchNode-local -Z, so the barrel mesh is centred at -2.5 m to put its
 * muzzle at that tip — keeping the rendered barrel aligned with the
 * cannon's fire origin + aim direction.
 *
 * Idempotent enough for spawn use: it adds named meshes once per Tank. The
 * meshes follow the rig on `dispose()` because the turret detaches its
 * nodes (which carry these children) from the chassis.
 */
export function mountM48TurretMeshes(tank: Tank): void {
  const turretRig = tank.getTurret();
  const yawNode = turretRig.getYawNode();
  const pitchNode = turretRig.getPitchNode();

  const turretMat = new THREE.MeshStandardMaterial({ color: 0x3d4631, flatShading: true });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a18, flatShading: true });

  // Turret bulk: a rounded cast-steel body. A flattened sphere reads as the
  // M48's distinctive elliptical turret far better than a plain cylinder,
  // and a low cylindrical ring under it seats it on the turret ring.
  const turretBody = new THREE.Mesh(
    new THREE.SphereGeometry(1.55, 14, 10),
    turretMat,
  );
  turretBody.scale.set(1.0, 0.55, 1.25); // squashed + elongated fore-aft
  turretBody.position.set(0, 0.35, -0.1);
  turretBody.name = 'm48_turret';
  yawNode.add(turretBody);

  const turretRing = new THREE.Mesh(
    new THREE.CylinderGeometry(1.45, 1.6, 0.4, 16),
    turretMat,
  );
  turretRing.position.set(0, 0.05, 0);
  turretRing.name = 'm48_turret_ring';
  yawNode.add(turretRing);

  // Commander cupola on the turret roof (cosmetic detail, traverses w/ turret).
  const cupola = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.5, 0.45, 10),
    turretMat,
  );
  cupola.position.set(0.5, 0.85, 0.45);
  cupola.name = 'm48_cupola';
  yawNode.add(cupola);

  // Mantlet: the gun shield where the barrel exits the turret face. Parents
  // under the pitch node so it tilts with the barrel.
  const mantlet = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.7, 0.5),
    steelMat,
  );
  mantlet.position.set(0, 0, -0.9);
  mantlet.name = 'm48_mantlet';
  pitchNode.add(mantlet);

  // Barrel: 90mm M41 main gun. Centred at -2.5 m along pitch-local -Z so
  // the muzzle lands at the turret's -5 m barrel-tip offset.
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.13, 5.0, 12),
    steelMat,
  );
  barrel.rotation.x = Math.PI * 0.5; // cylinder +Y -> local -Z
  barrel.position.set(0, 0, -2.5);
  barrel.name = 'm48_barrel';
  pitchNode.add(barrel);

  // Muzzle brake: short fatter sleeve at the barrel tip.
  const muzzleBrake = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.5, 12),
    steelMat,
  );
  muzzleBrake.rotation.x = Math.PI * 0.5;
  muzzleBrake.position.set(0, 0, -4.85);
  muzzleBrake.name = 'm48_muzzle_brake';
  pitchNode.add(muzzleBrake);
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
  // Mount the rotating turret + barrel onto the Tank's turret rig so the
  // gunner's aim visibly traverses + elevates the cannon.
  mountM48TurretMeshes(tank);
  vehicleManager.register(tank);
  return { tank, root };
}

/**
 * Primary M48 scenario spawn table. Coordinates come from
 * `M48_SPAWN_OFFSETS`; Y is left at 0 and the spawn caller should
 * snap-to-terrain via the runtime terrain provider before handing off
 * to `createM48Tank`.
 *
 * The Open Frontier entry now lands inside the airfield Main Motor
 * Pool bay (per cycle-motor-pool-reflow-and-tank-dedup), not the
 * West FOB anchor used by the cycle-VEKHIKL-3 initial drop. The
 * sibling `motor-pool-heavy-reflow` task removes the dressing M48
 * prop from the prefab, so this Tank IVehicle is the only M48
 * rendered in the US motor pool.
 */
export interface M48ScenarioSpawnDefinition {
  vehicleId: string;
  position: THREE.Vector3;
  faction: Faction;
  initialYaw: number;
}

export const M48_SCENARIO_SPAWNS: Record<'open_frontier' | 'a_shau_valley', M48ScenarioSpawnDefinition> = {
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

/**
 * Full per-mode tank fleet. Keeps `M48_SCENARIO_SPAWNS` as the legacy
 * primary-US lookup while the scenario spawn path fields both factions.
 */
export const M48_SCENARIO_SPAWN_GROUPS: Record<M48ScenarioMode, readonly M48ScenarioSpawnDefinition[]> = {
  open_frontier: [
    M48_SCENARIO_SPAWNS.open_frontier,
    {
      vehicleId: 'm48_tank_of_nva_main_hq',
      position: new THREE.Vector3(
        M48_SPAWN_OFFSETS.open_frontier_opfor.x,
        0,
        M48_SPAWN_OFFSETS.open_frontier_opfor.z,
      ),
      faction: Faction.NVA,
      initialYaw: M48_SPAWN_OFFSETS.open_frontier_opfor.yaw,
    },
  ],
  a_shau_valley: [
    M48_SCENARIO_SPAWNS.a_shau_valley,
    {
      vehicleId: 'm48_tank_ashau_nva_dongso',
      position: new THREE.Vector3(
        M48_SPAWN_OFFSETS.a_shau_valley_opfor.x,
        0,
        M48_SPAWN_OFFSETS.a_shau_valley_opfor.z,
      ),
      faction: Faction.NVA,
      initialYaw: M48_SPAWN_OFFSETS.a_shau_valley_opfor.yaw,
    },
  ],
};

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
    for (const def of M48_SCENARIO_SPAWN_GROUPS[mode]) {
      const position = args.resolvePosition ? args.resolvePosition(mode, def.position) : def.position;
      const parts = createM48Tank(args.scene, args.vehicleManager, {
        vehicleId: def.vehicleId,
        position,
        faction: def.faction,
        initialYaw: def.initialYaw,
      });
      spawned.push({ vehicleId: def.vehicleId, ...parts });
    }
  }
  return spawned;
}
