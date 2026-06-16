// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { isHelicopterAnimatedRotorMesh, optimizeRotorJointDrawCalls } from './HelicopterGeometry';
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
});

describe('repaint helicopter rotor-joint contract', () => {
  // The static-GLB cutover spins rotors off the importer-grafted pivots, so each
  // flyable rotorcraft must declare a main + tail rotor joint with a spin axis
  // the animation system understands. Without this the airframe silently falls
  // back to synthetic blades (a visible regression), so guard the catalog data.
  const slugFor = (path: string) => (path.split('/').pop() ?? path).replace(/\.glb$/i, '');
  const SPINNABLE_AXES = new Set(['x', 'y', 'z']);

  for (const path of [AircraftModels.UH1_HUEY, AircraftModels.UH1C_GUNSHIP, AircraftModels.AH1_COBRA]) {
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
