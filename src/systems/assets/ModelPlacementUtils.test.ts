// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { prepareModelForPlacement } from './ModelPlacementUtils';
import { AircraftModels, StructureModels } from './modelPaths';

describe('prepareModelForPlacement', () => {
  it('grounds and centers a sandbag model while normalizing height', () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1.2, 0.8),
      new THREE.MeshBasicMaterial()
    );
    group.add(mesh);

    const prepared = prepareModelForPlacement(group, StructureModels.SANDBAG_WALL);

    expect(prepared.size.y).toBeCloseTo(2.8, 2);
    expect(prepared.bounds.min.y).toBeCloseTo(0, 4);
    expect(prepared.bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0, 4);
    expect(prepared.bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(0, 4);
  });

  it('repairs the static UH-1H rotor before generic world-feature placement', () => {
    const group = new THREE.Group();
    const rotorJoint = new THREE.Group();
    rotorJoint.name = 'Joint_MainRotor';

    for (const name of ['Mesh_BladeFwd', 'Mesh_BladeAft', 'Mesh_StabBar', 'Mesh_StabWeightR', 'Mesh_StabWeightL']) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.name = name;
      rotorJoint.add(mesh);
    }

    group.add(rotorJoint);

    const prepared = prepareModelForPlacement(group, AircraftModels.UH1_HUEY);

    expect(rotorJoint.getObjectByName('Mesh_BladeFwd')).toBeUndefined();
    expect(rotorJoint.getObjectByName('Mesh_StabBar')).toBeUndefined();
    const repairedBlade = rotorJoint.getObjectByName('Mesh_UH1RuntimeMainRotorBlades') as THREE.Mesh | undefined;
    expect(repairedBlade).toBeDefined();
    expect(repairedBlade?.userData.runtimeRotorRepair).toBe('uh1-main-rotor');
    expect(prepared.size.x).toBeGreaterThan(10);
  });
});
