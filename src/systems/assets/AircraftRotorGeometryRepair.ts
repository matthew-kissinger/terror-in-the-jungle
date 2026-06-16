// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { AircraftModels } from './modelPaths';

const UH1_REPAIRED_MAIN_ROTOR_DIAMETER_M = 10.8;
const UH1_REPAIRED_MAIN_ROTOR_CHORD_M = 0.32;
const UH1_REPAIRED_MAIN_ROTOR_THICKNESS_M = 0.06;

const UH1_IDENTIFIERS = new Set([
  'uh1_huey',
  'uh1-huey',
  AircraftModels.UH1_HUEY.toLowerCase(),
]);

/**
 * Targeted runtime repair for known-bad repaint rotor geometry.
 *
 * The 2026-06 UH-1H source keeps a canonical `Joint_MainRotor`, but its blade
 * meshes are broad diagonal chunks (`Mesh_BladeFwd` / `Mesh_BladeAft`) plus an
 * over-visible stabilizer bar and end weights. In-game this reads as detached
 * blade pieces near the Open Frontier starter helipad. Keep the accepted joint
 * contract and hub, but replace only those blade meshes with a clean two-blade
 * bar under the same pivot so procedural rotor spin still uses the
 * catalog-declared joint.
 */
export function repairKnownAircraftRotorGeometry(root: THREE.Object3D, aircraftKeyOrModelPath: string): void {
  if (!isUh1HueyIdentifier(aircraftKeyOrModelPath)) return;

  const mainRotor = root.getObjectByName('Joint_MainRotor');
  if (!mainRotor) return;

  const bladeMaterial = findFirstRotorMaterial(mainRotor);
  const namesToRemove = new Set([
    'mesh_bladefwd',
    'mesh_bladeaft',
    'mesh_stabbar',
    'mesh_stabweightr',
    'mesh_stabweightl',
  ]);
  const childrenToRemove = mainRotor.children.filter((child) => namesToRemove.has(child.name.toLowerCase()));
  for (const child of childrenToRemove) {
    child.removeFromParent();
    disposeGeometryOnly(child);
  }

  if (mainRotor.getObjectByName('Mesh_UH1RuntimeMainRotorBlades')) return;

  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(
      UH1_REPAIRED_MAIN_ROTOR_DIAMETER_M,
      UH1_REPAIRED_MAIN_ROTOR_THICKNESS_M,
      UH1_REPAIRED_MAIN_ROTOR_CHORD_M,
    ),
    bladeMaterial ?? new THREE.MeshStandardMaterial({
      color: 0x202423,
      roughness: 0.85,
      metalness: 0.15,
    }),
  );
  blade.name = 'Mesh_UH1RuntimeMainRotorBlades';
  blade.castShadow = true;
  blade.receiveShadow = false;
  blade.userData.runtimeRotorRepair = 'uh1-main-rotor';
  mainRotor.add(blade);
}

function isUh1HueyIdentifier(identifier: string): boolean {
  const normalized = identifier.replace(/\\/g, '/').toLowerCase();
  const basename = normalized.split('/').pop()?.replace(/\.glb$/i, '') ?? normalized;
  return UH1_IDENTIFIERS.has(normalized) || UH1_IDENTIFIERS.has(basename);
}

function findFirstRotorMaterial(root: THREE.Object3D): THREE.Material | null {
  let material: THREE.Material | null = null;
  root.traverse((child) => {
    if (material) return;
    if (!(child instanceof THREE.Mesh) && (child as THREE.Object3D & { isMesh?: boolean }).isMesh !== true) return;
    const meshMaterial = (child as THREE.Mesh).material;
    material = Array.isArray(meshMaterial) ? meshMaterial[0] ?? null : meshMaterial;
  });
  return material;
}

function disposeGeometryOnly(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && (child as THREE.Object3D & { isMesh?: boolean }).isMesh !== true) return;
    (child as THREE.Mesh).geometry.dispose();
  });
}
