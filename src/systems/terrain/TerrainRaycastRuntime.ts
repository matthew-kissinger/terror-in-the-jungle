import * as THREE from 'three';
import { LOSAccelerator } from '../combat/LOSAccelerator';

/**
 * Owns the near-field BVH terrain mesh used for terrain raycasts and LOS acceleration.
 */
export class TerrainRaycastRuntime {
  private readonly losAccelerator: LOSAccelerator;
  private bvhMesh: THREE.Mesh | null = null;
  private readonly lastBvhCenter = new THREE.Vector3(NaN, NaN, NaN);
  private gridWidth = 0;
  private positionBuffer: Float32Array | null = null;

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
    const gridW = halfSteps * 2 + 1;
    this.ensureMeshBuffers(gridW);

    const geometry = this.bvhMesh!.geometry as THREE.BufferGeometry;
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = this.positionBuffer!;

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
    positionAttr.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    this.losAccelerator.registerChunk('bvh_nearfield', this.bvhMesh!);
    this.lastBvhCenter.copy(center);
  }

  private ensureMeshBuffers(gridW: number): void {
    if (this.bvhMesh && this.gridWidth === gridW && this.positionBuffer) {
      return;
    }

    if (this.bvhMesh) {
      this.losAccelerator.unregisterChunk('bvh_nearfield');
      this.bvhMesh.geometry.dispose();
    }

    this.gridWidth = gridW;
    const vertexCount = gridW * gridW;
    this.positionBuffer = new Float32Array(vertexCount * 3);
    const indexCount = (gridW - 1) * (gridW - 1) * 6;
    const indices = vertexCount > 65535
      ? new Uint32Array(indexCount)
      : new Uint16Array(indexCount);

    let ii = 0;
    for (let iz = 0; iz < gridW - 1; iz++) {
      for (let ix = 0; ix < gridW - 1; ix++) {
        const tl = iz * gridW + ix;
        const tr = tl + 1;
        const bl = (iz + 1) * gridW + ix;
        const br = bl + 1;
        indices[ii++] = tl;
        indices[ii++] = bl;
        indices[ii++] = tr;
        indices[ii++] = tr;
        indices[ii++] = bl;
        indices[ii++] = br;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positionBuffer, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    this.bvhMesh = new THREE.Mesh(geometry);
    this.bvhMesh.visible = false;
  }
}
