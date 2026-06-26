// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  isHelicopterAnimatedRotorMesh,
  optimizeRotorJointDrawCalls,
  repairKnownAircraftRotorGeometry,
} from './HelicopterGeometry';
import { AircraftModels, warAssetCatalog } from '../assets/modelPaths';

function makeMesh(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );
  mesh.name = name;
  return mesh;
}

describe('HelicopterGeometry rotor exclusion', () => {
  // Behavior: a rotor mesh must stay out of the static draw-call batch so its
  // grafted pivot can spin it. The repaint GLBs hang the blades under the
  // canonical grafted pivots Joint_MainRotor / Joint_TailRotor (no baked clips),
  // so exclusion keys off (a) a tagged rotor pivot ancestor or (b) a canonical
  // rotor joint ancestor — not on fuzzy blade names that no longer exist.

  it('keeps meshes under a canonical grafted rotor joint out of static batching', () => {
    for (const jointName of ['Joint_MainRotor', 'Joint_TailRotor']) {
      const joint = new THREE.Group();
      joint.name = jointName;
      const blade = makeMesh('Mesh_Blade');
      joint.add(blade);

      // The joint node itself and its blade children are rotor meshes.
      expect(isHelicopterAnimatedRotorMesh(blade)).toBe(true);
    }
  });

  it('keeps meshes under a tagged rotor pivot out of static batching', () => {
    for (const rotorType of ['mainBlades', 'tailBlades'] as const) {
      const rotorRoot = new THREE.Group();
      rotorRoot.userData.type = rotorType;
      const unnamedBlade = makeMesh('BladeSegment');
      rotorRoot.add(unnamedBlade);

      expect(isHelicopterAnimatedRotorMesh(unnamedBlade)).toBe(true);
    }
  });

  it('does not classify fuselage meshes as animated rotor parts', () => {
    expect(isHelicopterAnimatedRotorMesh(makeMesh('Mesh_Fuselage_Main'))).toBe(false);
  });

  it('does not classify a tail-boom mesh outside any rotor pivot as a rotor part', () => {
    const fuselage = new THREE.Group();
    fuselage.name = 'Fuselage';
    const tailBoom = makeMesh('Mesh_TailBoom');
    fuselage.add(tailBoom);

    expect(isHelicopterAnimatedRotorMesh(tailBoom)).toBe(false);
  });

  it('batches compatible rotor child meshes without losing the rotor pivot contract', () => {
    const root = new THREE.Group();
    const joint = new THREE.Group();
    joint.name = 'Joint_MainRotor';
    joint.userData.type = 'mainBlades';
    joint.userData.spinAxis = 'y';
    joint.add(makeMesh('Blade_A'));
    joint.add(makeMesh('Blade_B'));
    root.add(joint);

    optimizeRotorJointDrawCalls(root, 'UH1_HUEY');

    const meshes: THREE.Mesh[] = [];
    joint.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshes.push(child);
      }
    });
    expect(meshes).toHaveLength(1);
    expect(meshes[0].userData.generatedOptimizedMesh).toBe(true);
    expect(joint.userData.type).toBe('mainBlades');
    expect(isHelicopterAnimatedRotorMesh(meshes[0])).toBe(true);
  });

  it('repairs the known-bad UH-1H repaint main rotor while preserving the joint pivot', () => {
    const root = new THREE.Group();
    const joint = new THREE.Group();
    joint.name = 'Joint_MainRotor';
    joint.userData.type = 'mainBlades';
    joint.userData.spinAxis = 'y';
    joint.position.set(1, 3, 2);
    joint.add(makeMesh('Mesh_RotorHub'));
    joint.add(makeMesh('Mesh_BladeFwd'));
    joint.add(makeMesh('Mesh_BladeAft'));
    joint.add(makeMesh('Mesh_StabBar'));
    joint.add(makeMesh('Mesh_StabWeightR'));
    joint.add(makeMesh('Mesh_StabWeightL'));
    root.add(joint);

    repairKnownAircraftRotorGeometry(root, 'UH1_HUEY');

    expect(joint.getObjectByName('Mesh_BladeFwd')).toBeUndefined();
    expect(joint.getObjectByName('Mesh_BladeAft')).toBeUndefined();
    expect(joint.getObjectByName('Mesh_StabBar')).toBeUndefined();
    expect(joint.getObjectByName('Mesh_StabWeightR')).toBeUndefined();
    expect(joint.getObjectByName('Mesh_StabWeightL')).toBeUndefined();
    expect(joint.position.toArray()).toEqual([1, 3, 2]);

    const repaired = joint.getObjectByName('Mesh_UH1RuntimeMainRotorBlades');
    expect(repaired).toBeInstanceOf(THREE.Mesh);
    expect(isHelicopterAnimatedRotorMesh(repaired as THREE.Mesh)).toBe(true);

    const box = new THREE.Box3().setFromObject(repaired!);
    const size = new THREE.Vector3();
    box.getSize(size);
    expect(size.x).toBeGreaterThan(10);
    expect(size.y).toBeLessThan(0.1);
    expect(size.z).toBeLessThan(0.5);
  });

  it('does not alter non-Huey rotor geometry during the UH-1H repair pass', () => {
    const root = new THREE.Group();
    const joint = new THREE.Group();
    joint.name = 'Joint_MainRotor';
    joint.userData.type = 'mainBlades';
    joint.add(makeMesh('Mesh_BladeFwd'));
    root.add(joint);

    repairKnownAircraftRotorGeometry(root, 'AH1_COBRA');

    expect(joint.getObjectByName('Mesh_BladeFwd')).toBeDefined();
    expect(joint.getObjectByName('Mesh_UH1RuntimeMainRotorBlades')).toBeUndefined();
  });
});

describe('flyable helicopter rotor-joint contract', () => {
  // The static-GLB cutover spins rotors off the importer-grafted pivots, so each
  // flyable rotorcraft must declare a main + tail rotor joint with a spin axis
  // the animation system understands. Without this the airframe silently falls
  // back to synthetic blades (a visible regression), so guard the catalog data.
  //
  // The default-shipped art (kiln-war-2026-06): the Kiln UH-1H transport + AH-1G
  // Cobra, plus the UH-1C gunship which is HELD on legacy art (its Kiln GLB is
  // half-scale). These are exactly the GLBs `createHelicopterGeometry` loads
  // under the default `__aircraftArt`.
  const slugFor = (path: string) => (path.split('/').pop() ?? path).replace(/\.glb$/i, '');
  const SPINNABLE_AXES = new Set(['x', 'y', 'z']);

  for (const path of [AircraftModels.UH_1H_HUEY_TRANSPORT, AircraftModels.UH1C_GUNSHIP, AircraftModels.AH_1G_COBRA_ATTACK]) {
    const slug = slugFor(path);

    it(`${slug} declares a spinnable main + tail rotor joint`, () => {
      const entry = warAssetCatalog[slug];
      expect(entry, `catalog entry for ${slug}`).toBeDefined();

      const main = entry.joints?.find((j) => j.type === 'mainBlades');
      const tail = entry.joints?.find((j) => j.type === 'tailBlades');

      expect(main, `${slug} main rotor joint`).toBeDefined();
      expect(tail, `${slug} tail rotor joint`).toBeDefined();
      expect(SPINNABLE_AXES.has(main!.spinAxis as string)).toBe(true);
      expect(SPINNABLE_AXES.has(tail!.spinAxis as string)).toBe(true);
    });
  }
});
