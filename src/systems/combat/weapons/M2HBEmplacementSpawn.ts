import * as THREE from 'three';
import { Faction } from '../types';
import { Emplacement } from '../../vehicle/Emplacement';
import type { VehicleManager } from '../../vehicle/VehicleManager';
import { M2HBEmplacementSystem } from './M2HBEmplacement';
import { M2HBWeapon } from './M2HBWeapon';

/**
 * Procedural tripod rig + scenario-spawn glue for the M2HB emplacement.
 *
 * Split out of `M2HBEmplacement.ts` to keep that file within the
 * weapon-component LOC budget. The mesh is procedural rather than a
 * GLB so the cycle is not blocked on the `m2hb-tripod.glb` asset
 * called out in the brief — it can be swapped for the GLB later
 * without touching the weapon component or the system.
 *
 * Hierarchy created by `buildM2HBTripod`:
 *   tripodRoot (positioned in world)
 *   └── yokeMesh, leg meshes
 *   └── yawNode   (rotation.y written by Emplacement)
 *       └── pitchNode  (rotation.x written by Emplacement;
 *                       position.z written by M2HBEmplacementSystem
 *                       for recoil)
 *           └── receiver, barrel, spade-grip meshes
 */

export function buildM2HBTripod(): {
  root: THREE.Group;
  yawNode: THREE.Object3D;
  pitchNode: THREE.Object3D;
} {
  const root = new THREE.Group();
  root.name = 'm2hb_tripod_root';

  // Tripod base — three legs in a tetrahedral spread, dark olive.
  const legGeom = new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x3a4030, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(legGeom, legMat);
    const angle = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(angle) * 0.25, 0.55, Math.sin(angle) * 0.25);
    leg.rotation.z = Math.cos(angle) * 0.35;
    leg.rotation.x = Math.sin(angle) * 0.35;
    root.add(leg);
  }

  // Yoke at the top of the tripod (where the gun pintle sits).
  const yokeGeom = new THREE.CylinderGeometry(0.12, 0.18, 0.18, 8);
  const yoke = new THREE.Mesh(yokeGeom, legMat);
  yoke.position.y = 1.05;
  root.add(yoke);

  // Yaw node: rotates around world Y at the yoke height.
  const yawNode = new THREE.Object3D();
  yawNode.position.y = 1.18;
  yawNode.name = 'm2hb_yaw';
  root.add(yawNode);

  // Pitch node: rotates around local X; this is where recoil-z writes.
  const pitchNode = new THREE.Object3D();
  pitchNode.name = 'm2hb_pitch';
  yawNode.add(pitchNode);

  // Receiver block (the M2HB's box body).
  const receiverGeom = new THREE.BoxGeometry(0.18, 0.18, 0.5);
  const receiverMat = new THREE.MeshStandardMaterial({ color: 0x2a2a26, flatShading: true });
  const receiver = new THREE.Mesh(receiverGeom, receiverMat);
  receiver.position.z = -0.05;
  pitchNode.add(receiver);

  // Barrel (forward of receiver). Cylinder default axis is Y; rotate
  // so it lies along -Z (barrel forward).
  const barrelGeom = new THREE.CylinderGeometry(0.025, 0.03, 1.15, 8);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a18, flatShading: true });
  const barrel = new THREE.Mesh(barrelGeom, barrelMat);
  barrel.rotation.x = Math.PI * 0.5;
  barrel.position.z = -0.75;
  pitchNode.add(barrel);

  // Spade-grips (the gunner's handles, behind receiver).
  const gripGeom = new THREE.BoxGeometry(0.18, 0.22, 0.04);
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x141414, flatShading: true });
  const grip = new THREE.Mesh(gripGeom, gripMat);
  grip.position.z = 0.28;
  pitchNode.add(grip);

  return { root, yawNode, pitchNode };
}

export interface CreateM2HBEmplacementOptions {
  vehicleId: string;
  position: THREE.Vector3;
  faction: Faction;
  /** Override yaw (radians) for the tripod placement. */
  initialYaw?: number;
}

/**
 * Build a complete M2HB emplacement (mesh + Emplacement + Weapon),
 * register the IVehicle with the VehicleManager, and register the
 * weapon binding with the M2HBEmplacementSystem.
 */
export function createM2HBEmplacement(
  scene: THREE.Scene,
  vehicleManager: VehicleManager,
  m2hbSystem: M2HBEmplacementSystem,
  options: CreateM2HBEmplacementOptions,
): { emplacement: Emplacement; weapon: M2HBWeapon; root: THREE.Group } {
  const { root, yawNode, pitchNode } = buildM2HBTripod();
  root.position.copy(options.position);
  if (options.initialYaw !== undefined) root.rotation.y = options.initialYaw;
  scene.add(root);

  const emplacement = new Emplacement(options.vehicleId, root, options.faction, {
    yawNode,
    pitchNode,
  });
  const weapon = new M2HBWeapon();

  vehicleManager.register(emplacement);
  m2hbSystem.registerBinding({
    vehicleId: options.vehicleId,
    emplacement,
    weapon,
    pitchNode,
  });

  return { emplacement, weapon, root };
}

/**
 * Default scenario spawn points for the two cycle-VEKHIKL-2
 * emplacements. Positions are picked to land near the existing US base
 * (`fob_west_build_now` on Open Frontier, centre at (-1025, 0, -760))
 * and the A Shau NVA bunker overlook (`hill937_bunker_cluster`).
 *
 * Y is left at 0; the spawn caller should snap-to-terrain via the
 * runtime terrain provider before handing off to
 * `createM2HBEmplacement` if a terrain reference is available. If no
 * terrain provider is available the tripod sits at y=0 and is visually
 * offset on flat terrain only — acceptable for the cycle MVP.
 */
export const M2HB_SCENARIO_SPAWNS: Record<'open_frontier' | 'a_shau_valley', {
  vehicleId: string;
  position: THREE.Vector3;
  faction: Faction;
  initialYaw: number;
}> = {
  // Open Frontier: US-side, ~18 m forward of the FOB centre at
  // (-1025, 0, -760), aimed outward (north toward the contested map).
  open_frontier: {
    vehicleId: 'm2hb_emp_of_us_fob',
    position: new THREE.Vector3(-1025, 0, -742),
    faction: Faction.US,
    initialYaw: 0,
  },
  // A Shau: NVA-side, ~14 m forward of the Hill 937 bunker overlook.
  // The geo-to-world bunker centre resolves at runtime; we encode the
  // logical anchor here and let `resolvePosition` translate at spawn
  // time so we don't bake the projection result into source.
  a_shau_valley: {
    vehicleId: 'm2hb_emp_ashau_nva_bunker',
    position: new THREE.Vector3(0, 0, 14),
    faction: Faction.NVA,
    initialYaw: Math.PI,
  },
};

export type M2HBScenarioMode = keyof typeof M2HB_SCENARIO_SPAWNS;

export function spawnScenarioM2HBEmplacements(args: {
  modes: M2HBScenarioMode[];
  scene: THREE.Scene;
  vehicleManager: VehicleManager;
  m2hbSystem: M2HBEmplacementSystem;
  /**
   * Optional resolver to translate the spawn-table's logical position
   * into a final world-space point (e.g. snap to terrain height,
   * project an A Shau geo-to-world anchor). Defaults to returning
   * the table position unchanged.
   */
  resolvePosition?: (mode: M2HBScenarioMode, base: THREE.Vector3) => THREE.Vector3;
}): Array<{ vehicleId: string; emplacement: Emplacement; weapon: M2HBWeapon; root: THREE.Group }> {
  const spawned: Array<{ vehicleId: string; emplacement: Emplacement; weapon: M2HBWeapon; root: THREE.Group }> = [];
  for (const mode of args.modes) {
    const def = M2HB_SCENARIO_SPAWNS[mode];
    const position = args.resolvePosition ? args.resolvePosition(mode, def.position) : def.position;
    const parts = createM2HBEmplacement(args.scene, args.vehicleManager, args.m2hbSystem, {
      vehicleId: def.vehicleId,
      position,
      faction: def.faction,
      initialYaw: def.initialYaw,
    });
    spawned.push({ vehicleId: def.vehicleId, ...parts });
  }
  return spawned;
}
