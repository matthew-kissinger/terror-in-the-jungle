// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { modelLoader } from '../assets/ModelLoader';
import { GroundVehicleModels } from '../assets/modelPaths';

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
 * Both GLBs come through the war-asset import pipeline
 * (cycle-2026-06-11-war-asset-repaint), which wraps the source +X-forward art
 * in a `TIJ_AxisNormalize` node (a +90° Y rotation) so the loaded scene
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
const PROCEDURAL_TURRET_MESHES = ['m48_turret', 'm48_turret_ring', 'm48_cupola'] as const;
const PROCEDURAL_GUN_MESHES = ['m48_mantlet', 'm48_barrel', 'm48_muzzle_brake'] as const;
const M151_RUNTIME_VISUAL_SCALE = 1.15;

function enableShadows(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
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
): Promise<boolean> {
  let glb: THREE.Group;
  try {
    glb = await loader.loadModel(GroundVehicleModels.M151_JEEP);
  } catch {
    return false; // keep the procedural placeholder
  }
  glb.name = 'm151_glb_visual';
  glb.scale.setScalar(M151_RUNTIME_VISUAL_SCALE);
  enableShadows(glb);
  removeProceduralMeshes(chassisRoot);
  chassisRoot.add(glb);
  return true;
}

/**
 * Swap the drivable M48's procedural meshes for `m48-patton.glb`, re-seating
 * the articulated parts on the Tank's turret rig:
 *
 *  - `Joint_Turret` (turret bulk + cupola + searchlight + hatches) mounts on
 *    the rig yaw node so crew aim traverses the GLB turret around the
 *    turret-ring pivot the cannon math already uses.
 *  - `Joint_MainGun` (mantlet + barrel + muzzle brake) mounts on the rig
 *    pitch node so the rendered barrel elevates around the rig trunnion.
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
 * (load failure or unexpected asset shape).
 */
export async function applyM48TankGlbVisual(
  chassisRoot: THREE.Group,
  tank: TurretRigSource,
  loader: VehicleModelLoader = modelLoader,
): Promise<boolean> {
  let glb: THREE.Group;
  try {
    glb = await loader.loadModel(GroundVehicleModels.M48_PATTON);
  } catch {
    return false; // keep the procedural placeholder
  }
  const turretJoint = glb.getObjectByName('Joint_Turret');
  const gunJoint = glb.getObjectByName('Joint_MainGun');
  if (!turretJoint || !gunJoint) return false; // unexpected asset shape

  enableShadows(glb);
  const rig = tank.getTurret();
  const yawNode = rig.getYawNode();
  const pitchNode = rig.getPitchNode();

  // Swap the hull GLB onto the chassis first so the joints share the rig's
  // world frame, then refresh world matrices so `attach` reads correct poses.
  // Procedural hull/tracks come off the chassis root; procedural turret + gun
  // parts come off the rig nodes.
  removeProceduralMeshes(chassisRoot);
  for (const name of PROCEDURAL_TURRET_MESHES) yawNode.getObjectByName(name)?.removeFromParent();
  for (const name of PROCEDURAL_GUN_MESHES) pitchNode.getObjectByName(name)?.removeFromParent();

  glb.name = 'm48_glb_visual';
  chassisRoot.add(glb);
  chassisRoot.updateWorldMatrix(false, true);

  // `attach` preserves world transform across the re-parent, baking the
  // axis-normalize rotation into each joint's new local transform. The rig is
  // at rest here, so the baked pose is the correct turret/gun rest orientation
  // and runtime yaw/pitch compose on top of it.
  yawNode.attach(turretJoint);
  pitchNode.attach(gunJoint);
  return true;
}
