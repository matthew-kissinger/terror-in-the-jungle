import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { isHelicopterAnimatedRotorMesh } from './HelicopterGeometry';

function makeMesh(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );
  mesh.name = name;
  return mesh;
}

describe('HelicopterGeometry rotor exclusion', () => {
  it('keeps MR/TR blade and hub meshes out of static batching', () => {
    const rotorNames = [
      'Mesh_MRBlade1',
      'Mesh_MRBlade2',
      'Mesh_MRTip1',
      'Mesh_MRHub',
      'Mesh_TRBlade1',
      'Mesh_TRBlade2',
      'Mesh_TRHubDisc',
      'Mesh_RotorMast',
    ];

    for (const rotorName of rotorNames) {
      expect(isHelicopterAnimatedRotorMesh(makeMesh(rotorName))).toBe(true);
    }
  });

  it('keeps meshes under tagged rotor roots out of static batching', () => {
    const rotorRoot = new THREE.Group();
    rotorRoot.userData.type = 'mainBlades';
    const unnamedBlade = makeMesh('BladeSegment');
    rotorRoot.add(unnamedBlade);

    expect(isHelicopterAnimatedRotorMesh(unnamedBlade)).toBe(true);
  });

  it('does not classify fuselage meshes as animated rotor parts', () => {
    expect(isHelicopterAnimatedRotorMesh(makeMesh('Mesh_Fuselage_Main'))).toBe(false);
  });
});
