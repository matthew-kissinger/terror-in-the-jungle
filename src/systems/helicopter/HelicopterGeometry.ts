// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { modelLoader } from '../assets/ModelLoader';
import { optimizeStaticModelDrawCalls } from '../assets/ModelDrawCallOptimizer';
import { repairKnownAircraftRotorGeometry } from '../assets/AircraftRotorGeometryRepair';
import { AircraftModels, warAssetCatalog } from '../assets/modelPaths';
import type { WarAssetEntry, WarAssetJoint } from '../assets/modelPaths';
import { Logger } from '../../utils/Logger';

/**
 * Aircraft metadata for display and identification.
 */
interface AircraftInfo {
  modelPath: string;
  displayName: string;
  faction: string;
}

type RotorAnimationType = 'mainBlades' | 'tailBlades';
type RotorSpinAxis = 'x' | 'y' | 'z';

const HELICOPTER_PERF_CATEGORY = 'helicopters';

const AIRCRAFT_INFO: Record<string, AircraftInfo> = {
  UH1_HUEY:      { modelPath: AircraftModels.UH1_HUEY,      displayName: 'UH-1 Huey',      faction: 'US' },
  UH1C_GUNSHIP:  { modelPath: AircraftModels.UH1C_GUNSHIP,  displayName: 'UH-1C Gunship',  faction: 'US' },
  AH1_COBRA:     { modelPath: AircraftModels.AH1_COBRA,      displayName: 'AH-1 Cobra',     faction: 'US' },
  AC47_SPOOKY:   { modelPath: AircraftModels.AC47_SPOOKY,    displayName: 'AC-47 Spooky',   faction: 'US' },
  F4_PHANTOM:    { modelPath: AircraftModels.F4_PHANTOM,      displayName: 'F-4 Phantom',    faction: 'US' },
  A1_SKYRAIDER:  { modelPath: AircraftModels.A1_SKYRAIDER,    displayName: 'A-1 Skyraider',  faction: 'US' },

  // Dormant catalog registrations (cycle-2026-06-11-war-asset-repaint, scope 5).
  // These have normalized static GLBs with grafted rotor joints but no flight
  // model this cycle. They are loadable (gallery / future role systems) and
  // spin their rotors procedurally like every other rotorcraft. They are NOT in
  // AIRCRAFT_CONFIGS, so they never spawn at helipads (getAircraftConfig falls
  // back to the Huey for any key without flight physics).
  CH47_CHINOOK:           { modelPath: AircraftModels.CH47_CHINOOK,           displayName: 'CH-47 Chinook',           faction: 'US' },
  OH6_KIOWA_SCOUT:        { modelPath: AircraftModels.OH6_KIOWA_SCOUT,        displayName: 'OH-6 Kiowa Scout',        faction: 'US' },
  // hh3e is a scale re-roll advisory (audit: ~9.4m vs real ~17.6m fuselage) —
  // cataloged dormant so it is reachable once a corrected GLB lands.
  HH3E_JOLLY_GREEN_GIANT: { modelPath: AircraftModels.HH3E_JOLLY_GREEN_GIANT, displayName: 'HH-3E Jolly Green Giant', faction: 'US' },
};

/**
 * Load any aircraft GLB and wire its rotor joints for procedural spin.
 *
 * The repaint GLBs are 100% static (no baked rotor animation clips). The war
 * asset importer grafted canonical `Joint_MainRotor` / `Joint_TailRotor` pivots
 * over the blade meshes and recorded each pivot's spin axis in the generated
 * catalog (`warAssetCatalog[slug].joints`). We resolve those named pivots and
 * tag them so `HelicopterAnimation.updateRotors()` spins them off engine RPM —
 * no animation playback, no axis guessing.
 *
 * All GLBs face +Z (Y-up); rotated -90° Y so the nose faces airframe-forward.
 * The synthetic-blade fallback is kept for the case where a GLB ships with no
 * grafted rotor joint of a kind (a future asset or a partial load).
 */
export async function createHelicopterGeometry(
  aircraftKey: string,
  helicopterId: string,
): Promise<THREE.Group> {
  const info = AIRCRAFT_INFO[aircraftKey];
  if (!info) {
    Logger.warn('helicopter', `Unknown aircraft key "${aircraftKey}", falling back to UH1_HUEY`);
  }
  const { modelPath, displayName, faction } = info ?? AIRCRAFT_INFO.UH1_HUEY;

  const { scene } = await modelLoader.loadAnimatedModel(modelPath);

  // Rotate GLB -90 degrees so nose faces forward in game space
  scene.rotation.y = -Math.PI / 2;

  const helicopterGroup = new THREE.Group();
  helicopterGroup.add(scene);

  wireRotorJoints(scene, helicopterGroup, modelPath);
  repairKnownAircraftRotorGeometry(scene, aircraftKey);
  optimizeRotorJointDrawCalls(scene, aircraftKey);
  optimizeAircraftScene(scene, aircraftKey);

  helicopterGroup.userData = {
    type: 'helicopter',
    model: displayName,
    faction,
    id: helicopterId,
    perfCategory: HELICOPTER_PERF_CATEGORY,
  };
  markAircraftPerfCategory(helicopterGroup);

  return helicopterGroup;
}

// ─── Rotor wiring ─────────────────────────────────────────────────────────

/**
 * Tag the grafted rotor pivots so the animation system spins them. Reads the
 * spin contract (joint name + type + axis) from the generated catalog rather
 * than inferring it from animation tracks or fuzzy name matching. Falls back to
 * synthetic blades only when the catalog declares no rotor joint of a kind or
 * the named pivot is missing from the loaded scene.
 */
function wireRotorJoints(
  scene: THREE.Group,
  helicopterGroup: THREE.Group,
  modelPath: string,
): void {
  const rotorJoints = getCatalogRotorJoints(modelPath);
  const nodesByName = indexNodesByName(scene);

  let taggedMain = false;
  let taggedTail = false;

  for (const joint of rotorJoints) {
    const node = nodesByName.get(joint.name.toLowerCase());
    if (!node) {
      Logger.warn(
        'helicopter',
        `Catalog rotor joint "${joint.name}" not found in ${modelPath}; using synthetic fallback`,
      );
      continue;
    }
    node.userData.type = joint.type;
    node.userData.spinAxis = joint.spinAxis ?? defaultSpinAxis(joint.type);
    if (joint.type === 'mainBlades') taggedMain = true;
    if (joint.type === 'tailBlades') taggedTail = true;
  }

  // Synthetic fallbacks: only when no real pivot of that kind was tagged.
  if (!taggedMain) {
    const mainBlades = createSyntheticMainRotor();
    mainBlades.userData.spinAxis = 'y';
    mainBlades.position.set(0, 4.5, 0);
    helicopterGroup.add(mainBlades);
    Logger.debug('helicopter', 'Added synthetic main rotor blades');
  }
  if (!taggedTail) {
    const tailBlades = createSyntheticTailRotor();
    tailBlades.userData.spinAxis = 'z';
    tailBlades.position.set(-6, 2.5, 0);
    helicopterGroup.add(tailBlades);
    Logger.debug('helicopter', 'Added synthetic tail rotor blades');
  }
}

/**
 * Resolve the rotor joints (mainBlades / tailBlades) for a model path from the
 * generated war-asset catalog. The catalog is keyed by slug == GLB basename.
 */
function getCatalogRotorJoints(modelPath: string): Array<WarAssetJoint & { type: RotorAnimationType }> {
  const entry = getCatalogEntry(modelPath);
  if (!entry?.joints) return [];
  return entry.joints.filter(
    (joint): joint is WarAssetJoint & { type: RotorAnimationType } =>
      joint.type === 'mainBlades' || joint.type === 'tailBlades',
  );
}

function getCatalogEntry(modelPath: string): WarAssetEntry | undefined {
  const slug = slugFromModelPath(modelPath);
  return warAssetCatalog[slug];
}

/** Derive the catalog slug (== GLB basename without extension) from a path. */
function slugFromModelPath(modelPath: string): string {
  const base = modelPath.split('/').pop() ?? modelPath;
  return base.replace(/\.glb$/i, '');
}

function indexNodesByName(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((child) => {
    const key = child.name.toLowerCase();
    if (key && !byName.has(key)) {
      byName.set(key, child);
    }
  });
  return byName;
}

function defaultSpinAxis(type: RotorAnimationType): RotorSpinAxis {
  return type === 'mainBlades' ? 'y' : 'z';
}

function optimizeAircraftScene(scene: THREE.Group, aircraftKey: string): void {
  const result = optimizeStaticModelDrawCalls(scene, {
    batchNamePrefix: `${aircraftKey.toLowerCase()}_static`,
    excludeMesh: (mesh) => isHelicopterAnimatedRotorMesh(mesh),
  });

  if (result.sourceMeshCount > 0) {
    Logger.info(
      'helicopter',
      `Optimized ${aircraftKey} draw calls: ${result.sourceMeshCount} leaf meshes -> ${result.mergedMeshCount} batches`,
    );
  }
}

export function optimizeRotorJointDrawCalls(root: THREE.Object3D, aircraftKey: string): void {
  const rotorRoots: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (child.userData.type === 'mainBlades' || child.userData.type === 'tailBlades') {
      rotorRoots.push(child);
    }
  });

  for (const rotorRoot of rotorRoots) {
    const result = optimizeStaticModelDrawCalls(rotorRoot, {
      batchNamePrefix: `${aircraftKey.toLowerCase()}_${String(rotorRoot.userData.type).toLowerCase()}`,
      minBucketSize: 2,
    });
    if (result.mergedMeshCount > 0) {
      Logger.debug(
        'helicopter',
        `Optimized ${aircraftKey} ${String(rotorRoot.userData.type)} rotor: ${result.sourceMeshCount} leaf meshes -> ${result.mergedMeshCount} batch(es)`,
      );
    }
  }
}

export { repairKnownAircraftRotorGeometry } from '../assets/AircraftRotorGeometryRepair';

function markAircraftPerfCategory(root: THREE.Object3D): void {
  root.traverse((child) => {
    child.userData.perfCategory ??= HELICOPTER_PERF_CATEGORY;
  });
}

/**
 * A mesh belongs to a spinning rotor when any ancestor is a tagged rotor pivot
 * (userData.type) or carries a canonical grafted rotor joint name. Such meshes
 * must stay out of the static draw-call batch so the pivot can spin them.
 */
export function isHelicopterAnimatedRotorMesh(mesh: THREE.Mesh): boolean {
  let current: THREE.Object3D | null = mesh;
  while (current) {
    if (current.userData.type === 'mainBlades' || current.userData.type === 'tailBlades') {
      return true;
    }
    if (isCanonicalRotorJointName(current.name)) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isCanonicalRotorJointName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === 'joint_mainrotor' || lower === 'joint_tailrotor';
}

// ─── Synthetic fallback rotors ────────────────────────────────────────────

function createSyntheticMainRotor(): THREE.Group {
  const bladesGroup = new THREE.Group();
  bladesGroup.userData = { type: 'mainBlades' };

  const blackMetal = 0x222222;
  const bladeGeometry = new THREE.BoxGeometry(8.5, 0.06, 0.28);
  const bladeMaterial = new THREE.MeshLambertMaterial({ color: blackMetal });

  const blade1 = new THREE.Mesh(bladeGeometry, bladeMaterial);
  bladesGroup.add(blade1);

  const blade2 = new THREE.Mesh(bladeGeometry, bladeMaterial);
  blade2.rotation.y = Math.PI / 2;
  bladesGroup.add(blade2);

  return bladesGroup;
}

function createSyntheticTailRotor(): THREE.Group {
  const bladesGroup = new THREE.Group();
  bladesGroup.userData = { type: 'tailBlades' };

  const blackMetal = 0x222222;
  const bladeGeometry = new THREE.BoxGeometry(0.04, 1.4, 0.06);
  const bladeMaterial = new THREE.MeshLambertMaterial({ color: blackMetal });

  const blade1 = new THREE.Mesh(bladeGeometry, bladeMaterial);
  blade1.position.set(0, 0.7, 0);
  bladesGroup.add(blade1);

  const blade2 = new THREE.Mesh(bladeGeometry, bladeMaterial);
  blade2.position.set(0, -0.7, 0);
  bladesGroup.add(blade2);

  return bladesGroup;
}
