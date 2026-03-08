import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { prepareModelForPlacement } from './ModelPlacementUtils';
import { StructureModels } from './modelPaths';

describe('prepareModelForPlacement', () => {
  it('grounds and centers a sandbag model while normalizing height', () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1.2, 0.8),
      new THREE.MeshBasicMaterial()
    );
    group.add(mesh);

    const prepared = prepareModelForPlacement(group, StructureModels.SANDBAG_WALL);

    expect(prepared.size.y).toBeCloseTo(1.4, 2);
    expect(prepared.bounds.min.y).toBeCloseTo(0, 4);
    expect(prepared.bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(0, 4);
    expect(prepared.bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(0, 4);
  });
});
