import * as THREE from 'three';

/** Freeze an object tree so matrices are never auto-recomputed. Call AFTER final positioning. */
export function freezeTransform(object: THREE.Object3D): void {
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    child.matrixAutoUpdate = false;
    child.matrixWorldAutoUpdate = false;
  });
}
