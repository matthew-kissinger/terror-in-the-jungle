// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Faction } from '../combat/types';
import { Tank } from './Tank';
import type { TankTurretConfig } from './TankTurret';
import { T54_HULL_DIMENSIONS, T54_PHYSICS_CONFIG, T54_SPAWN_OFFSETS } from '../../config/vehicles/t54-config';
import { applyT54TankGlbVisual } from './VehicleGlbVisuals';
import type { VehicleManager } from './VehicleManager';

/**
 * T-54 main-battle chassis mesh + scenario-spawn glue. The NVA / Soviet armor
 * sibling of `M48TankSpawn` — same `Tank` IVehicle + `TrackedVehiclePhysics`
 * skid-steer model, faction-flipped to NVA. Mirrors the M48 shape exactly:
 *
 *   - Procedural mesh shipped in source so the scenario spawn is not blocked
 *     on the GLB loader; `applyT54TankGlbVisual` then swaps in the Kiln
 *     `t-54-main-battle.glb` asynchronously (hull on the chassis, Joint_Turret /
 *     Joint_MainGun re-seated on the TankTurret rig), keeping the procedural
 *     mesh only as a load-failure fallback. `?vehicleArt=legacy` reverts to the
 *     jointless `t54-tank.glb`, which keeps the procedural turret.
 *   - Static spawn table per scenario (Open Frontier NVA Main HQ + A Shau
 *     Dong So NVA Trail Base).
 *   - `resolvePosition` callback so the caller can snap the spawn anchor to
 *     terrain through the runtime terrain provider.
 *
 * Hierarchy built by `buildT54ChassisMesh`:
 *   chassisRoot (positioned in world)
 *   ├── hull box (the main armored body)
 *   ├── track L / track R boxes
 *
 * The turret + barrel meshes are NOT part of the chassis mesh. They are
 * mounted onto the `TankTurret` rig nodes (yaw + pitch) by
 * `mountT54TurretMeshes` after the `Tank` (and its turret) is constructed,
 * so the turret traverses and the barrel elevates with crew aim instead of
 * being a static cosmetic stand-in.
 *
 * The mesh has no physics meaning — `TrackedVehiclePhysics` owns the
 * simulation; the mesh is just a visible proxy.
 */

/**
 * The T-54's 100 mm D-10T gun is a touch longer than the M48's 90 mm M41,
 * so the turret's barrel-tip fire origin sits 5.5 m forward of the trunnion
 * (the M48 default is 5.0 m). `mountT54TurretMeshes` centres the procedural
 * barrel to put its muzzle at this same tip so the rendered gun lines up with
 * the cannon's fire origin + aim direction.
 */
const T54_BARREL_TIP_OFFSET_Z = -5.5;

const T54_TURRET_CONFIG: Partial<TankTurretConfig> = {
  barrelTipLocalOffset: new THREE.Vector3(0, 0, T54_BARREL_TIP_OFFSET_Z),
};

export function buildT54ChassisMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 't54_chassis_root';
  root.userData.perfCategory = 'ground_vehicles';

  const { length, width, height } = T54_HULL_DIMENSIONS;

  // Hull: rough armored box, Soviet olive. Sits on its tracks with the
  // chassis origin at the track contact patch (matches the
  // TrackedVehiclePhysics axleOffset convention — origin Y on the
  // ground, hull body lifted half its height + a small clearance).
  const hullGeom = new THREE.BoxGeometry(width, height * 0.55, length);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x404a33, flatShading: true });
  const hull = new THREE.Mesh(hullGeom, hullMat);
  hull.position.y = height * 0.275 + 0.45;
  hull.name = 't54_hull';
  root.add(hull);

  // Tracks: two long boxes flanking the hull, darker.
  const trackGeom = new THREE.BoxGeometry(width * 0.16, 0.6, length * 1.02);
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x1a1a18, flatShading: true });
  const trackL = new THREE.Mesh(trackGeom, trackMat);
  trackL.position.set(-width * 0.42, 0.3, 0);
  root.add(trackL);
  const trackR = new THREE.Mesh(trackGeom, trackMat);
  trackR.position.set(+width * 0.42, 0.3, 0);
  root.add(trackR);

  return root;
}

/**
 * Mount the rotating turret + barrel geometry onto a Tank's `TankTurret`
 * rig. The turret bulk parents under the yaw node (traverses with yaw) and
 * the barrel + mantlet parent under the pitch node (elevates with the
 * barrel). The TankTurret's `barrelTipLocalOffset` points -5.5 m along
 * pitchNode-local -Z (the 100 mm gun length), so the barrel mesh is centred
 * at -2.75 m to put its muzzle at that tip — keeping the rendered barrel
 * aligned with the cannon's fire origin + aim direction.
 *
 * Idempotent enough for spawn use: it adds named meshes once per Tank. The
 * meshes follow the rig on `dispose()` because the turret detaches its
 * nodes (which carry these children) from the chassis.
 */
export function mountT54TurretMeshes(tank: Tank): void {
  const turretRig = tank.getTurret();
  const yawNode = turretRig.getYawNode();
  const pitchNode = turretRig.getPitchNode();

  const turretMat = new THREE.MeshStandardMaterial({ color: 0x404a33, flatShading: true });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a18, flatShading: true });

  // Turret bulk: the T-54's signature low cast-steel dome. A near-symmetric
  // flattened sphere reads as the rounded turret far better than the M48's
  // elongated cast shape, and a low cylindrical ring under it seats it on the
  // turret ring.
  const turretBody = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 16, 12),
    turretMat,
  );
  turretBody.scale.set(1.0, 0.5, 1.05); // shallow dome, faintly elongated fore-aft
  turretBody.position.set(0, 0.3, -0.05);
  turretBody.name = 't54_turret';
  turretBody.userData.perfCategory = 'ground_vehicles';
  yawNode.add(turretBody);

  const turretRing = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.5, 0.35, 16),
    turretMat,
  );
  turretRing.position.set(0, 0.05, 0);
  turretRing.name = 't54_turret_ring';
  turretRing.userData.perfCategory = 'ground_vehicles';
  yawNode.add(turretRing);

  // Commander cupola on the turret roof, offset to the left as on the real
  // T-54 (cosmetic detail, traverses w/ turret).
  const cupola = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.46, 0.4, 10),
    turretMat,
  );
  cupola.position.set(-0.4, 0.7, 0.2);
  cupola.name = 't54_cupola';
  cupola.userData.perfCategory = 'ground_vehicles';
  yawNode.add(cupola);

  // Mantlet: the gun shield where the barrel exits the turret face. Parents
  // under the pitch node so it tilts with the barrel.
  const mantlet = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, 0.6, 0.5),
    steelMat,
  );
  mantlet.position.set(0, 0, -0.85);
  mantlet.name = 't54_mantlet';
  mantlet.userData.perfCategory = 'ground_vehicles';
  pitchNode.add(mantlet);

  // Barrel: 100 mm D-10T main gun. Centred at -2.75 m along pitch-local -Z so
  // the muzzle lands at the turret's -5.5 m barrel-tip offset.
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.135, 5.5, 12),
    steelMat,
  );
  barrel.rotation.x = Math.PI * 0.5; // cylinder +Y -> local -Z
  barrel.position.set(0, 0, -2.75);
  barrel.name = 't54_barrel';
  barrel.userData.perfCategory = 'ground_vehicles';
  pitchNode.add(barrel);

  // Muzzle: short fatter sleeve at the barrel tip (the D-10T is a plain
  // bore-evacuator gun with no brake, but the sleeve keeps the silhouette
  // and gives weapon-effect anchors a "muzzle" named mesh).
  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.5, 12),
    steelMat,
  );
  muzzle.rotation.x = Math.PI * 0.5;
  muzzle.position.set(0, 0, -5.35);
  muzzle.name = 't54_muzzle_brake';
  muzzle.userData.perfCategory = 'ground_vehicles';
  pitchNode.add(muzzle);
}

export interface CreateT54TankOptions {
  vehicleId: string;
  position: THREE.Vector3;
  faction: Faction;
  /** Override yaw (radians) for the chassis placement. */
  initialYaw?: number;
}

/**
 * Build a complete T-54 tank (procedural mesh + Tank IVehicle) and
 * register it with the VehicleManager.
 */
export function createT54Tank(
  scene: THREE.Scene,
  vehicleManager: VehicleManager,
  options: CreateT54TankOptions,
): { tank: Tank; root: THREE.Group } {
  const root = buildT54ChassisMesh();
  root.position.copy(options.position);
  if (options.initialYaw !== undefined) root.rotation.y = options.initialYaw;
  scene.add(root);

  const tank = new Tank(
    options.vehicleId,
    root,
    options.faction,
    undefined,
    T54_PHYSICS_CONFIG,
    T54_TURRET_CONFIG,
  );
  // Mount the rotating turret + barrel onto the Tank's turret rig so the
  // gunner's aim visibly traverses + elevates the cannon.
  mountT54TurretMeshes(tank);
  vehicleManager.register(tank);
  // Fire-and-forget visual upgrade; the procedural meshes stay on failure.
  void applyT54TankGlbVisual(root, tank);
  return { tank, root };
}

/**
 * Primary T-54 scenario spawn table. Coordinates come from
 * `T54_SPAWN_OFFSETS`; Y is left at 0 and the spawn caller should
 * snap-to-terrain via the runtime terrain provider before handing off
 * to `createT54Tank`.
 *
 * The NVA fields T-54s where the M48 table previously fielded NVA Pattons
 * (NVA Main HQ on Open Frontier, Dong So NVA Trail Base on A Shau); the US
 * keeps its own M48 anchors, so there is no NVA M48 / T-54 overlap.
 */
export interface T54ScenarioSpawnDefinition {
  vehicleId: string;
  position: THREE.Vector3;
  faction: Faction;
  initialYaw: number;
}

export type T54ScenarioMode = 'open_frontier' | 'a_shau_valley';

export const T54_SCENARIO_SPAWN_GROUPS: Record<T54ScenarioMode, readonly T54ScenarioSpawnDefinition[]> = {
  open_frontier: [
    {
      vehicleId: 't54_tank_of_nva_main_hq',
      position: new THREE.Vector3(T54_SPAWN_OFFSETS.open_frontier.x, 0, T54_SPAWN_OFFSETS.open_frontier.z),
      faction: Faction.NVA,
      initialYaw: T54_SPAWN_OFFSETS.open_frontier.yaw,
    },
  ],
  a_shau_valley: [
    {
      vehicleId: 't54_tank_ashau_nva_dongso',
      position: new THREE.Vector3(T54_SPAWN_OFFSETS.a_shau_valley.x, 0, T54_SPAWN_OFFSETS.a_shau_valley.z),
      faction: Faction.NVA,
      initialYaw: T54_SPAWN_OFFSETS.a_shau_valley.yaw,
    },
  ],
};

export function spawnScenarioT54Tanks(args: {
  modes: T54ScenarioMode[];
  scene: THREE.Scene;
  vehicleManager: VehicleManager;
  /**
   * Optional resolver to translate the spawn-table's logical position
   * into a final world-space point (e.g. snap to terrain height).
   * Defaults to returning the table position unchanged.
   */
  resolvePosition?: (mode: T54ScenarioMode, base: THREE.Vector3) => THREE.Vector3;
}): Array<{ vehicleId: string; tank: Tank; root: THREE.Group }> {
  const spawned: Array<{ vehicleId: string; tank: Tank; root: THREE.Group }> = [];
  for (const mode of args.modes) {
    for (const def of T54_SCENARIO_SPAWN_GROUPS[mode]) {
      const position = args.resolvePosition ? args.resolvePosition(mode, def.position) : def.position;
      const parts = createT54Tank(args.scene, args.vehicleManager, {
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
