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
 * Both GLBs are authored -Z-forward with the ground plane at y=0 (verified
 * against their node tables on 2026-06-10), matching the
 * GroundVehiclePhysics / TrackedVehiclePhysics chassis conventions, so no
 * yaw or grounding correction is applied.
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
  enableShadows(glb);
  removeProceduralMeshes(chassisRoot);
  chassisRoot.add(glb);
  return true;
}

/**
 * Swap the drivable M48's procedural meshes for `m48-patton.glb`, re-seating
 * the articulated parts on the Tank's turret rig:
 *
 *  - `Joint_Turret` (turret bulk + cupola + searchlight) mounts on the rig
 *    yaw node with its translation zeroed, so crew aim traverses the GLB
 *    turret around the turret-ring pivot the cannon math already uses.
 *  - `Joint_MainGun` (mantlet + barrel) mounts on the rig pitch node. Its
 *    authored offset relative to the turret ring is preserved (minus the
 *    pitch node's own local offset) so the rendered barrel keeps the
 *    authored mantlet placement while elevating around the rig trunnion.
 *  - The remaining GLB content (hull + tracks + exhausts) replaces the
 *    procedural hull boxes on the chassis root.
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

  // Authored gun-pivot offset relative to the turret ring; re-expressed in
  // pitch-node-local space so the barrel keeps its authored placement while
  // pitching around the rig trunnion.
  const gunLocal = gunJoint.position.clone().sub(pitchNode.position);
  gunJoint.removeFromParent();
  gunJoint.position.copy(gunLocal);
  turretJoint.removeFromParent();
  turretJoint.position.set(0, 0, 0);

  // Only swap once the split succeeded: procedural hull/tracks off the
  // chassis root, procedural turret + gun parts off the rig nodes.
  removeProceduralMeshes(chassisRoot);
  for (const name of PROCEDURAL_TURRET_MESHES) yawNode.getObjectByName(name)?.removeFromParent();
  for (const name of PROCEDURAL_GUN_MESHES) pitchNode.getObjectByName(name)?.removeFromParent();

  glb.name = 'm48_glb_visual';
  chassisRoot.add(glb);
  yawNode.add(turretJoint);
  pitchNode.add(gunJoint);
  return true;
}
