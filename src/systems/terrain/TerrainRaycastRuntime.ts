import * as THREE from 'three';
import { LOSAccelerator } from '../combat/LOSAccelerator';

/**
 * Owns the near-field BVH terrain mesh used for terrain raycasts and LOS acceleration.
 */
export class TerrainRaycastRuntime {
  private readonly losAccelerator: LOSAccelerator;
  private bvhMesh: THREE.Mesh | null = null;
  private readonly lastBvhCenter = new THREE.Vector3(NaN, NaN, NaN);

  constructor(losAccelerator: LOSAccelerator) {
    this.losAccelerator = losAccelerator;
  }

  getLOSAccelerator(): LOSAccelerator {
    return this.losAccelerator;
  }

  updateNearFieldMesh(
    center: THREE.Vector3,
    radius: number,
    rebuildThreshold: number,
    getHeightAt: (x: number, z: number) => number,
  ): void {
    const dx = center.x - this.lastBvhCenter.x;
    const dz = center.z - this.lastBvhCenter.z;
    if (dx * dx + dz * dz <= rebuildThreshold * rebuildThreshold) {
      return;
    }

    this.rebuildNearFieldMesh(center, radius, getHeightAt);
  }

  forceRebuildNearFieldMesh(
    center: THREE.Vector3,
    radius: number,
    getHeightAt: (x: number, z: number) => number,
  ): void {
    this.lastBvhCenter.set(NaN, NaN, NaN);
    this.rebuildNearFieldMesh(center, radius, getHeightAt);
  }

  dispose(): void {
    if (this.bvhMesh) {
      this.losAccelerator.unregisterChunk('bvh_nearfield');
      this.bvhMesh.geometry.dispose();
      this.bvhMesh = null;
    }
    this.losAccelerator.clear();
  }

  private rebuildNearFieldMesh(
    center: THREE.Vector3,
    radius: number,
    getHeightAt: (x: number, z: number) => number,
  ): void {
    const step = 4;
    const halfSteps = Math.ceil(radius / step);

    if (this.bvhMesh) {
      this.losAccelerator.unregisterChunk('bvh_nearfield');
      this.bvhMesh.geometry.dispose();
    }

    const gridW = halfSteps * 2 + 1;
    const vertexCount = gridW * gridW;
    const positions = new Float32Array(vertexCount * 3);
    const indices: number[] = [];

    let vi = 0;
    for (let iz = 0; iz < gridW; iz++) {
      for (let ix = 0; ix < gridW; ix++) {
        const wx = center.x + (ix - halfSteps) * step;
        const wz = center.z + (iz - halfSteps) * step;
        const wy = getHeightAt(wx, wz);
        positions[vi * 3] = wx;
        positions[vi * 3 + 1] = wy;
        positions[vi * 3 + 2] = wz;
        vi++;
      }
    }

    for (let iz = 0; iz < gridW - 1; iz++) {
      for (let ix = 0; ix < gridW - 1; ix++) {
        const tl = iz * gridW + ix;
        const tr = tl + 1;
        const bl = (iz + 1) * gridW + ix;
        const br = bl + 1;
        indices.push(tl, bl, tr, tr, bl, br);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    this.bvhMesh = new THREE.Mesh(geometry);
    this.bvhMesh.visible = false;

    this.losAccelerator.registerChunk('bvh_nearfield', this.bvhMesh);
    this.lastBvhCenter.copy(center);
  }
}
