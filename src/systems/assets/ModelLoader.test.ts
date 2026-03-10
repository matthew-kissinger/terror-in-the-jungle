import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ModelLoader } from './ModelLoader';

describe('ModelLoader', () => {
  let geometry: THREE.BoxGeometry;
  let material: THREE.MeshBasicMaterial;

  beforeEach(() => {
    geometry = new THREE.BoxGeometry(1, 1, 1);
    material = new THREE.MeshBasicMaterial();

    vi.spyOn(GLTFLoader.prototype, 'load').mockImplementation(((_url, onLoad) => {
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(geometry, material));
      onLoad?.({ scene, animations: [] } as any);
      return {} as any;
    }) as GLTFLoader['load']);
  });

  it('marks loaded clones as shared instances', async () => {
    const loader = new ModelLoader();

    const instance = await loader.loadModel('structures/test.glb');

    expect(loader.isSharedInstance(instance)).toBe(true);
  });

  it('disposeInstance() detaches a clone without disposing shared geometry/materials', async () => {
    const loader = new ModelLoader();
    const parent = new THREE.Group();
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');

    const instance = await loader.loadModel('structures/test.glb');
    parent.add(instance);

    loader.disposeInstance(instance);

    expect(parent.children).toHaveLength(0);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });
});
