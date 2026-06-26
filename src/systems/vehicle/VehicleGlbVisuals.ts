// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { modelLoader } from '../assets/ModelLoader';
import { optimizeStaticModelDrawCalls } from '../assets/ModelDrawCallOptimizer';
import { GroundVehicleModels } from '../assets/modelPaths';
import { Logger } from '../../utils/Logger';
import { vehicleArtMode } from '../../config/vehicleArt';
import type { VehicleArtMode } from '../../config/vehicleArt';

/**
 * Async GLB visual upgrade for the drivable ground vehicles.
 *
 * The scenario spawns stay synchronous (procedural placeholder mesh, stable
 * vehicle id, physics independent of visuals — the contract the VEKHIKL cycle
 * briefs required); these helpers then replace the placeholder geometry with
 * the shipped GLB art once the model resolves. On any load or asset-shape
 * failure the procedural placeholder simply stays — the same fallback the
 * original briefs allowed, now pointed the right way around.
 *
 * Which GLB pair loads is chosen by the `vehicleArtMode()` kill-switch: the new
 * Kiln war-asset heroes (M151 MUTT + M48 Patton main-battle) by default, or the
 * legacy GLBs via `?vehicleArt=legacy` / `window.__vehicleArt = 'legacy'`.
 *
 * Both GLB pairs come through the war-asset import pipeline, which wraps the
 * source +X-forward art in a `TIJ_AxisNormalize` node (a +90° Y rotation) so the
 * loaded scene
 * presents -Z-forward with the ground plane at y=0 — matching the
 * GroundVehiclePhysics / TrackedVehiclePhysics chassis conventions. Because
 * the whole GLB keeps that wrapper, the m151 swap needs no yaw or grounding
 * correction.
 *
 * The m48 swap is the exception: it lifts the importer-grafted
 * `Joint_Turret` / `Joint_MainGun` out from *under* the axis wrapper to seat
 * them on the live turret rig. Detaching them with `removeFromParent()` would
 * drop the wrapper's 90° rotation and leave the turret + barrel pointing along
 * the source +X axis (i.e. out the tank's side). We therefore re-seat with
 * `Object3D.attach()`, which preserves each joint's world transform — wrapper
 * rotation included — by baking it into the joint's new local transform under
 * the rig node. The rig sits at rest (zero yaw/pitch) when the GLB resolves,
 * so the baked rest pose is correct and runtime traverse/elevation composes on
 * top of it.
 */

/** Loader seam for tests; production callers use the shared modelLoader. */
export interface VehicleModelLoader {
  loadModel(relativePath: string): Promise<THREE.Group>;
}

/**
 * Minimal structural view of `Tank` needed to re-seat the GLB turret parts
 * on the articulation rig (keeps this module testable without a full Tank).
 */
export interface TurretRigSource {
  getTurret(): {
    getYawNode(): THREE.Object3D;
    getPitchNode(): THREE.Object3D;
  };
}

/** Procedural turret parts mounted on the rig by `mountM48TurretMeshes`. */
const PROCEDURAL_M48_TURRET_MESHES = ['m48_turret', 'm48_turret_ring', 'm48_cupola'] as const;
const PROCEDURAL_M48_GUN_MESHES = ['m48_mantlet', 'm48_barrel', 'm48_muzzle_brake'] as const;
/** Procedural turret parts mounted on the rig by `mountT54TurretMeshes`. */
const PROCEDURAL_T54_TURRET_MESHES = ['t54_turret', 't54_turret_ring', 't54_cupola'] as const;
const PROCEDURAL_T54_GUN_MESHES = ['t54_mantlet', 't54_barrel', 't54_muzzle_brake'] as const;

/**
 * Drivable ground-vehicle hero art kill-switch.
 *
 * Defaults to the Kiln war-asset art (cycle kiln-war-2026-06): the M151 MUTT and
 * the M48 Patton main-battle GLBs (both importer-normalized neg-z-forward,
 * ground-at-origin, exposing the same `Joint_Turret` / `Joint_MainGun` rig
 * joints the M48 re-seat path already targets). Opt back to the legacy GLBs at
 * runtime with `?vehicleArt=legacy` or `window.__vehicleArt = 'legacy'` (read at
 * swap time). No window (SSR / node tests) resolves to legacy so headless
 * fixtures stay deterministic; production callers pass nothing and pick up the
 * browser flag.
 */
// vehicleArtMode + VehicleArtMode are the single source of truth in
// src/config/vehicleArt.ts (shared with WorldFeaturePrefabs' placement art
// resolution); imported above for the hero-GLB swap below and re-exported here
// for existing callers + tests.
export { vehicleArtMode };
export type { VehicleArtMode };

/** Drivable-hero GLB paths per art mode (kiln = new Kiln war-asset art). */
const M151_MODEL_BY_ART: Record<VehicleArtMode, string> = {
  kiln: GroundVehicleModels.M151_MUTT,
  legacy: GroundVehicleModels.M151_JEEP,
};
const M48_MODEL_BY_ART: Record<VehicleArtMode, string> = {
  kiln: GroundVehicleModels.M48_PATTON_MAIN_BATTLE,
  legacy: GroundVehicleModels.M48_PATTON,
};
/**
 * NVA T-54 main-battle GLB paths per art mode. The Kiln `t-54-main-battle.glb`
 * carries the same `Joint_Turret` / `Joint_MainGun` rig the M48 re-seat path
 * targets; the legacy `t54-tank.glb` has NO joints, so `?vehicleArt=legacy`
 * keeps the procedural turret (the re-seat bails on the missing joints).
 */
const T54_MODEL_BY_ART: Record<VehicleArtMode, string> = {
  kiln: GroundVehicleModels.T_54_MAIN_BATTLE,
  legacy: GroundVehicleModels.T54_TANK,
};

/**
 * Runtime uniform scale applied to the loaded M151 GLB so its wheels sit on the
 * chassis footprint the procedural placeholder + physics define. The Kiln MUTT
 * measures 3.0m long vs the legacy jeep's ~3.5m, so it needs a ~+15% bump to
 * present at the same on-ground size; the legacy jeep keeps its tuned 1.15.
 */
const M151_SCALE_BY_ART: Record<VehicleArtMode, number> = {
  kiln: 1.32,
  legacy: 1.15,
};
const GROUND_VEHICLE_PERF_CATEGORY = 'ground_vehicles';
const M151_BODY_OPTIMIZED_RESOURCE_KEY = 'm151BodyOptimizedGeneratedResource';
const M48_HULL_OPTIMIZED_RESOURCE_KEY = 'm48HullOptimizedGeneratedResource';
const M48_TURRET_OPTIMIZED_RESOURCE_KEY = 'm48TurretOptimizedGeneratedResource';
const M48_GUN_OPTIMIZED_RESOURCE_KEY = 'm48GunOptimizedGeneratedResource';
const T54_HULL_OPTIMIZED_RESOURCE_KEY = 't54HullOptimizedGeneratedResource';
const T54_TURRET_OPTIMIZED_RESOURCE_KEY = 't54TurretOptimizedGeneratedResource';
const T54_GUN_OPTIMIZED_RESOURCE_KEY = 't54GunOptimizedGeneratedResource';

function enableShadows(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
}

function markGroundVehiclePerfCategory(root: THREE.Object3D): void {
  root.userData.perfCategory = GROUND_VEHICLE_PERF_CATEGORY;
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.userData.perfCategory = GROUND_VEHICLE_PERF_CATEGORY;
    }
  });
}

/**
 * Draw-call-optimizer batch metadata for one rigid tank subtree (static hull,
 * turret joint, or gun joint). Parameterizes the merge so the M48 + T-54 share
 * one optimizer while keeping their own per-asset userData keys + batch
 * prefixes (the values the draw-call proof tests assert on).
 */
interface TankSubtreeDrawCallSpec {
  /** userData key on the optimized root holding the optimizer result summary. */
  resultKey: string;
  /** userData flag stamped on each generated merged mesh. */
  resourceKey: string;
  /** Batch-name prefix for the generated merged meshes. */
  batchNamePrefix: string;
  /** Warning logged when the optimizer throws (kept asset-specific for triage). */
  warning: string;
  /** Meshes for which this returns true stay un-merged (e.g. named muzzle anchors). */
  excludeMesh?: (mesh: THREE.Mesh) => boolean;
}

/**
 * Merge a rigid tank subtree's compatible meshes into batched draw calls. Used
 * for the static hull (a `THREE.Group`) and for the re-seated turret / gun
 * joints (`THREE.Object3D`). Failures are swallowed with a warning — the
 * un-optimized meshes simply render as-is.
 */
function optimizeTankSubtreeDrawCalls(root: THREE.Object3D, spec: TankSubtreeDrawCallSpec): void {
  try {
    const result = optimizeStaticModelDrawCalls(root, {
      batchNamePrefix: spec.batchNamePrefix,
      strategy: 'merge',
      minBucketSize: 2,
      excludeMesh: spec.excludeMesh,
    });
    root.userData[spec.resultKey] = result;
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.generatedOptimizedMesh === true) {
        child.userData.perfCategory = GROUND_VEHICLE_PERF_CATEGORY;
        child.userData[spec.resourceKey] = true;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  } catch (error) {
    Logger.warn('vehicle', spec.warning, error);
  }
}

function optimizeM151StaticBodyDrawCalls(glb: THREE.Group): void {
  try {
    const result = optimizeStaticModelDrawCalls(glb, {
      batchNamePrefix: 'm151_body',
      strategy: 'merge',
      minBucketSize: 2,
    });
    glb.userData.m151BodyDrawCallOptimization = result;
    glb.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.generatedOptimizedMesh === true) {
        child.userData.perfCategory = GROUND_VEHICLE_PERF_CATEGORY;
        child.userData[M151_BODY_OPTIMIZED_RESOURCE_KEY] = true;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  } catch (error) {
    Logger.warn('vehicle', 'Failed to optimize M151 static body draw calls', error);
  }
}

/** Remove the procedural placeholder meshes (direct Mesh children) from a chassis root. */
function removeProceduralMeshes(chassisRoot: THREE.Group): void {
  for (const child of [...chassisRoot.children]) {
    if ((child as THREE.Mesh).isMesh) chassisRoot.remove(child);
  }
}

/**
 * Swap the drivable M151's procedural box mesh for `m151-jeep.glb`.
 * Resolves true when the GLB is in place, false when the procedural
 * placeholder was kept (load failure).
 */
export async function applyM151JeepGlbVisual(
  chassisRoot: THREE.Group,
  loader: VehicleModelLoader = modelLoader,
  artMode: VehicleArtMode = vehicleArtMode(),
): Promise<boolean> {
  let glb: THREE.Group;
  try {
    glb = await loader.loadModel(M151_MODEL_BY_ART[artMode]);
  } catch {
    return false; // keep the procedural placeholder
  }
  glb.name = 'm151_glb_visual';
  glb.scale.setScalar(M151_SCALE_BY_ART[artMode]);
  enableShadows(glb);
  markGroundVehiclePerfCategory(glb);
  optimizeM151StaticBodyDrawCalls(glb);
  removeProceduralMeshes(chassisRoot);
  chassisRoot.add(glb);
  return true;
}

/**
 * Per-asset spec for the articulated-tank GLB swap. The only things that
 * differ between the M48 Patton and the NVA T-54 are the GLB paths, the
 * loaded-scene name, the procedural mesh-name sets to strip off the rig, and
 * the draw-call batch metadata — everything else (the joint re-seat, the
 * axis-wrapper-preserving `attach`, the hull swap) is identical.
 */
interface ArticulatedTankGlbSpec {
  /** GLB paths per art mode (kiln hero / legacy fallback). */
  modelByArt: Record<VehicleArtMode, string>;
  /** Name assigned to the loaded GLB root. */
  glbName: string;
  /** Procedural turret meshes the spawn mounted on the yaw node (stripped on swap). */
  proceduralTurretMeshes: readonly string[];
  /** Procedural gun meshes the spawn mounted on the pitch node (stripped on swap). */
  proceduralGunMeshes: readonly string[];
  /** Draw-call batch metadata for the static hull subtree. */
  hull: TankSubtreeDrawCallSpec;
  /** Draw-call batch metadata for the re-seated turret joint. */
  turret: TankSubtreeDrawCallSpec;
  /** Draw-call batch metadata for the re-seated gun joint. */
  gun: TankSubtreeDrawCallSpec;
}

/**
 * Swap a drivable tank's procedural meshes for its GLB hero art, re-seating
 * the articulated parts on the Tank's turret rig:
 *
 *  - `Joint_Turret` (turret bulk + cupola + hatches) mounts on the rig yaw
 *    node so crew aim traverses the GLB turret around the turret-ring pivot
 *    the cannon math already uses.
 *  - `Joint_MainGun` (mantlet + barrel + muzzle) mounts on the rig pitch node
 *    so the rendered barrel elevates around the rig trunnion.
 *  - The remaining GLB content (hull + tracks + wheels) replaces the
 *    procedural hull boxes on the chassis root.
 *
 * Both joints are re-seated with `Object3D.attach()` so their world transform
 * (including the import pipeline's axis-normalize rotation) survives the move
 * out from under the GLB wrapper. `attach` needs current world matrices, so
 * the GLB is added to the chassis — sharing the rig's frame — and the chassis
 * world matrix is refreshed before the joints move.
 *
 * Resolves true on success; false keeps every procedural mesh in place
 * (load failure or unexpected asset shape — e.g. the legacy jointless GLB).
 */
async function applyArticulatedTankGlbVisual(
  chassisRoot: THREE.Group,
  tank: TurretRigSource,
  spec: ArticulatedTankGlbSpec,
  loader: VehicleModelLoader,
  artMode: VehicleArtMode,
): Promise<boolean> {
  let glb: THREE.Group;
  try {
    glb = await loader.loadModel(spec.modelByArt[artMode]);
  } catch {
    return false; // keep the procedural placeholder
  }
  const turretJoint = glb.getObjectByName('Joint_Turret');
  const gunJoint = glb.getObjectByName('Joint_MainGun');
  if (!turretJoint || !gunJoint) return false; // unexpected asset shape

  enableShadows(glb);
  markGroundVehiclePerfCategory(chassisRoot);
  markGroundVehiclePerfCategory(glb);
  const rig = tank.getTurret();
  const yawNode = rig.getYawNode();
  const pitchNode = rig.getPitchNode();

  // Swap the hull GLB onto the chassis first so the joints share the rig's
  // world frame, then refresh world matrices so `attach` reads correct poses.
  // Procedural hull/tracks come off the chassis root; procedural turret + gun
  // parts come off the rig nodes.
  removeProceduralMeshes(chassisRoot);
  for (const name of spec.proceduralTurretMeshes) yawNode.getObjectByName(name)?.removeFromParent();
  for (const name of spec.proceduralGunMeshes) pitchNode.getObjectByName(name)?.removeFromParent();

  glb.name = spec.glbName;
  chassisRoot.add(glb);
  chassisRoot.updateWorldMatrix(false, true);

  // `attach` preserves world transform across the re-parent, baking the
  // axis-normalize rotation into each joint's new local transform. The rig is
  // at rest here, so the baked pose is the correct turret/gun rest orientation
  // and runtime yaw/pitch compose on top of it.
  yawNode.attach(turretJoint);
  pitchNode.attach(gunJoint);
  markGroundVehiclePerfCategory(turretJoint);
  markGroundVehiclePerfCategory(gunJoint);
  optimizeTankSubtreeDrawCalls(glb, spec.hull);
  optimizeTankSubtreeDrawCalls(turretJoint, spec.turret);
  optimizeTankSubtreeDrawCalls(gunJoint, spec.gun);
  return true;
}

/** Keep named muzzle meshes addressable for barrel/muzzle proof + weapon-effect anchors. */
const excludeMuzzleMesh = (mesh: THREE.Mesh): boolean => mesh.name.toLowerCase().includes('muzzle');

const M48_GLB_SPEC: ArticulatedTankGlbSpec = {
  modelByArt: M48_MODEL_BY_ART,
  glbName: 'm48_glb_visual',
  proceduralTurretMeshes: PROCEDURAL_M48_TURRET_MESHES,
  proceduralGunMeshes: PROCEDURAL_M48_GUN_MESHES,
  hull: {
    resultKey: 'm48HullDrawCallOptimization',
    resourceKey: M48_HULL_OPTIMIZED_RESOURCE_KEY,
    batchNamePrefix: 'm48_hull',
    warning: 'Failed to optimize M48 static hull draw calls',
  },
  turret: {
    resultKey: 'm48TurretDrawCallOptimization',
    resourceKey: M48_TURRET_OPTIMIZED_RESOURCE_KEY,
    batchNamePrefix: 'm48_turret',
    warning: 'Failed to optimize M48 turret draw calls',
  },
  gun: {
    resultKey: 'm48GunDrawCallOptimization',
    resourceKey: M48_GUN_OPTIMIZED_RESOURCE_KEY,
    batchNamePrefix: 'm48_gun',
    warning: 'Failed to optimize M48 gun draw calls',
    excludeMesh: excludeMuzzleMesh,
  },
};

const T54_GLB_SPEC: ArticulatedTankGlbSpec = {
  modelByArt: T54_MODEL_BY_ART,
  glbName: 't54_glb_visual',
  proceduralTurretMeshes: PROCEDURAL_T54_TURRET_MESHES,
  proceduralGunMeshes: PROCEDURAL_T54_GUN_MESHES,
  hull: {
    resultKey: 't54HullDrawCallOptimization',
    resourceKey: T54_HULL_OPTIMIZED_RESOURCE_KEY,
    batchNamePrefix: 't54_hull',
    warning: 'Failed to optimize T-54 static hull draw calls',
  },
  turret: {
    resultKey: 't54TurretDrawCallOptimization',
    resourceKey: T54_TURRET_OPTIMIZED_RESOURCE_KEY,
    batchNamePrefix: 't54_turret',
    warning: 'Failed to optimize T-54 turret draw calls',
  },
  gun: {
    resultKey: 't54GunDrawCallOptimization',
    resourceKey: T54_GUN_OPTIMIZED_RESOURCE_KEY,
    batchNamePrefix: 't54_gun',
    warning: 'Failed to optimize T-54 gun draw calls',
    excludeMesh: excludeMuzzleMesh,
  },
};

/** Swap the drivable M48's procedural meshes for the Kiln `m48-patton` GLB. */
export function applyM48TankGlbVisual(
  chassisRoot: THREE.Group,
  tank: TurretRigSource,
  loader: VehicleModelLoader = modelLoader,
  artMode: VehicleArtMode = vehicleArtMode(),
): Promise<boolean> {
  return applyArticulatedTankGlbVisual(chassisRoot, tank, M48_GLB_SPEC, loader, artMode);
}

/** Swap the drivable NVA T-54's procedural meshes for the Kiln `t-54-main-battle` GLB. */
export function applyT54TankGlbVisual(
  chassisRoot: THREE.Group,
  tank: TurretRigSource,
  loader: VehicleModelLoader = modelLoader,
  artMode: VehicleArtMode = vehicleArtMode(),
): Promise<boolean> {
  return applyArticulatedTankGlbVisual(chassisRoot, tank, T54_GLB_SPEC, loader, artMode);
}
