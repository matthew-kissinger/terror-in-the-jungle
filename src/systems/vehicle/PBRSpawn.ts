import * as THREE from 'three';
import { Faction } from '../combat/types';
import { Emplacement } from './Emplacement';
import { PBR, PBR_HULL_DIMENSIONS, PBR_MOUNT_OFFSETS, type PBRMount } from './PBR';
import { buildM2HBTripod } from '../combat/weapons/M2HBEmplacementSpawn';
import { M2HBWeapon } from '../combat/weapons/M2HBWeapon';
import type { M2HBEmplacementSystem } from '../combat/weapons/M2HBEmplacement';
import type { VehicleManager } from './VehicleManager';

/**
 * Procedural PBR (Patrol Boat River) hull mesh + scenario-spawn glue.
 *
 * The brief asks for `src/scenarios/pbr-aShauRiver-spawn.ts`, but the
 * existing pattern (`M48TankSpawn.ts`, `M2HBEmplacementSpawn.ts`)
 * colocates the spawn helper next to the vehicle file under
 * `src/systems/vehicle/`. Following the established convention keeps
 * the scenario-spawn discoverability consistent with the cycle-#6/#8
 * predecessors and avoids creating a new top-level directory just for
 * this file.
 *
 * Hierarchy created by `buildPBRHullMesh`:
 *   hullRoot (positioned in world; chassis-forward = -Z)
 *   ├── hullBox  (the main armored hull)
 *   ├── cabin    (the helm + radar mast silhouette block)
 *   ├── mount_fwd  (procedural M2HB tripod, parented child)
 *   └── mount_aft  (procedural M2HB tripod, parented child)
 *
 * The two M2HB mounts are *real* `Emplacement` instances. They are
 * registered as their own IVehicles in the VehicleManager so the
 * existing `EmplacementPlayerAdapter` + NPC-gunner fire path work
 * without modification. Each mount's tripod root is parented to the
 * PBR hull's Object3D via `THREE.Object3D.add`, so when the PBR moves
 * the mounts follow (world-space queries on the Emplacement compose
 * through the hull transform automatically via `getWorldPosition` /
 * `getWorldQuaternion`).
 */

export function buildPBRHullMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'pbr_hull_root';

  const { length, beam, height } = PBR_HULL_DIMENSIONS;

  // Hull: olive-drab armored deck box. Chassis origin sits at the deck
  // waterline; the hull body extends down half its visible height (so
  // the boat *visually* sits in the water rather than perched above it).
  const hullGeom = new THREE.BoxGeometry(beam, height, length);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x4a5240, flatShading: true });
  const hull = new THREE.Mesh(hullGeom, hullMat);
  hull.position.y = 0;
  hull.name = 'pbr_hull';
  root.add(hull);

  // Cabin / helm silhouette (the boxy structure amidships above the deck).
  const cabinGeom = new THREE.BoxGeometry(beam * 0.55, height * 0.7, length * 0.20);
  const cabin = new THREE.Mesh(cabinGeom, hullMat);
  cabin.position.set(0, height * 0.5 + height * 0.35, 0);
  cabin.name = 'pbr_cabin';
  root.add(cabin);

  return root;
}

export interface CreatePBROptions {
  vehicleId: string;
  position: THREE.Vector3;
  faction: Faction;
  /** Override yaw (radians) for the hull placement. */
  initialYaw?: number;
}

/**
 * Build a complete PBR (procedural mesh + PBR IVehicle + two child
 * M2HB emplacements) and register all three IVehicles with the
 * VehicleManager. The two emplacements are also registered with the
 * M2HBEmplacementSystem so they participate in the weapon-fire path.
 *
 * Returned mount IDs follow the convention `<pbrVehicleId>_mount_fwd`
 * and `<pbrVehicleId>_mount_aft` so the scenario / mode-change wiring
 * can address them individually for HUD or NPC-gunner targeting.
 */
export function createPBR(
  scene: THREE.Scene,
  vehicleManager: VehicleManager,
  m2hbSystem: M2HBEmplacementSystem,
  options: CreatePBROptions,
): { pbr: PBR; root: THREE.Group; mounts: PBRMount[] } {
  const root = buildPBRHullMesh();
  root.position.copy(options.position);
  if (options.initialYaw !== undefined) root.rotation.y = options.initialYaw;
  scene.add(root);

  // Build the two mounts. Each tripod is parented to the hull root via
  // THREE.Object3D.add so its world transform composes through the hull.
  const mountSpecs: Array<{ index: number; suffix: 'fwd' | 'aft'; offset: THREE.Vector3 }> = [
    { index: 0, suffix: 'fwd', offset: PBR_MOUNT_OFFSETS.forward },
    { index: 1, suffix: 'aft', offset: PBR_MOUNT_OFFSETS.aft },
  ];

  const mounts: PBRMount[] = [];
  for (const spec of mountSpecs) {
    const { root: tripod, yawNode, pitchNode } = buildM2HBTripod();
    tripod.name = `pbr_mount_${spec.suffix}_tripod`;
    tripod.position.copy(spec.offset);
    // Aft mount faces aft (rotated 180°) so its barrel-forward at yaw=0
    // points off the stern rather than the bow. Forward mount keeps the
    // tripod's native -Z forward.
    if (spec.suffix === 'aft') tripod.rotation.y = Math.PI;
    root.add(tripod);

    const mountVehicleId = `${options.vehicleId}_mount_${spec.suffix}`;
    const emplacement = new Emplacement(mountVehicleId, tripod, options.faction, {
      yawNode,
      pitchNode,
    });
    const weapon = new M2HBWeapon();

    vehicleManager.register(emplacement);
    m2hbSystem.registerBinding({
      vehicleId: mountVehicleId,
      emplacement,
      weapon,
      pitchNode,
    });

    mounts.push({
      index: spec.index,
      vehicleId: mountVehicleId,
      emplacement,
      root: tripod,
      yawNode,
      pitchNode,
      localOffset: spec.offset.clone(),
    });
  }

  const pbr = new PBR(options.vehicleId, root, options.faction, undefined, undefined, mounts);
  vehicleManager.register(pbr);

  return { pbr, root, mounts };
}

/**
 * Default scenario spawn anchors for the PBR. Y is left at 0; the
 * spawn caller should resolve to the river-surface height through the
 * runtime water/terrain provider before constructing the PBR — same
 * pattern M2HBEmplacementSpawn + M48TankSpawn use.
 *
 * Scenarios shipped this cycle:
 *
 *   - `a_shau_valley`: (1188.9, 0, 1743.72) lands on a confirmed
 *     tributary sample in the A Shau hydrology bake. The old (80, 0,
 *     110) anchor was ~1.7 km from water.
 *   - `open_frontier`: (396, 0, 876) lands on the lower section of the
 *     highest-accumulation seeded hydrology channel, keeping the PBR
 *     near the same visible water route as the sampan.
 */
export const PBR_SCENARIO_SPAWNS: Record<'open_frontier' | 'a_shau_valley', {
  vehicleId: string;
  position: THREE.Vector3;
  faction: Faction;
  initialYaw: number;
}> = {
  open_frontier: {
    vehicleId: 'pbr_us_open_frontier',
    position: new THREE.Vector3(396, 0, 876),
    faction: Faction.US,
    initialYaw: Math.PI * 0.5,
  },
  a_shau_valley: {
    vehicleId: 'pbr_us_ashau_river',
    position: new THREE.Vector3(1188.9, 0, 1743.72),
    faction: Faction.US,
    initialYaw: 0,
  },
};

export type PBRScenarioMode = keyof typeof PBR_SCENARIO_SPAWNS;

/**
 * Spawn one PBR per requested scenario mode. The `resolvePosition`
 * callback mirrors the M2HB / M48 spawn helpers — typically a
 * water-surface or terrain-snap closure so the boat lands at the
 * river height rather than 0.
 */
export function spawnScenarioPBRs(args: {
  modes: PBRScenarioMode[];
  scene: THREE.Scene;
  vehicleManager: VehicleManager;
  m2hbSystem: M2HBEmplacementSystem;
  resolvePosition?: (mode: PBRScenarioMode, base: THREE.Vector3) => THREE.Vector3;
}): Array<{ vehicleId: string; pbr: PBR; root: THREE.Group; mounts: PBRMount[] }> {
  const spawned: Array<{ vehicleId: string; pbr: PBR; root: THREE.Group; mounts: PBRMount[] }> = [];
  for (const mode of args.modes) {
    const def = PBR_SCENARIO_SPAWNS[mode];
    const position = args.resolvePosition ? args.resolvePosition(mode, def.position) : def.position;
    const parts = createPBR(args.scene, args.vehicleManager, args.m2hbSystem, {
      vehicleId: def.vehicleId,
      position,
      faction: def.faction,
      initialYaw: def.initialYaw,
    });
    spawned.push({ vehicleId: def.vehicleId, ...parts });
  }
  return spawned;
}
