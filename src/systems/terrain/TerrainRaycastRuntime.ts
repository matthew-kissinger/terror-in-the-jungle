import * as THREE from 'three';
import { LOSAccelerator } from '../combat/LOSAccelerator';

/**
 * Owns the near-field BVH terrain mesh used for terrain raycasts and LOS acceleration.
 */
export class TerrainRaycastRuntime {
  private readonly losAccelerator: LOSAccelerator;
  private bvhMesh: THREE.Mesh | null = null;
  private readonly lastBvhCenter = new THREE.Vector3(NaN, NaN, NaN);
  private readonly targetBvhCenter = new THREE.Vector3(NaN, NaN, NaN);
  private gridWidth = 0;
  private positionBuffer: Float32Array | null = null;
  private halfSteps = 0;
  private rebuildStep = 6;
  private pendingRowIndex = 0;
  private pendingRows = 0;
  private rebuildQueued = false;

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
    maxRowsPerFrame: number = 12,
  ): boolean {
    const thresholdSq = rebuildThreshold * rebuildThreshold;
    const hasCommittedCenter = Number.isFinite(this.lastBvhCenter.x) && Number.isFinite(this.lastBvhCenter.z);
    const dx = center.x - this.lastBvhCenter.x;
    const dz = center.z - this.lastBvhCenter.z;
    const targetDx = center.x - this.targetBvhCenter.x;
    const targetDz = center.z - this.targetBvhCenter.z;

    if (this.rebuildQueued) {
      if (targetDx * targetDx + targetDz * targetDz > thresholdSq) {
        this.queueNearFieldRebuild(center, radius);
      }
    } else if (!hasCommittedCenter || dx * dx + dz * dz > thresholdSq) {
      this.queueNearFieldRebuild(center, radius);
    }

    return this.processPendingWork(getHeightAt, maxRowsPerFrame);
  }

  forceRebuildNearFieldMesh(
    center: THREE.Vector3,
    radius: number,
    getHeightAt: (x: number, z: number) => number,
  ): void {
    this.queueNearFieldRebuild(center, radius);
    this.processPendingWork(getHeightAt, Math.max(1, this.pendingRows));
  }

  dispose(): void {
    if (this.bvhMesh) {
      this.losAccelerator.unregisterChunk('bvh_nearfield');
      this.bvhMesh.geometry.dispose();
      this.bvhMesh = null;
    }
    this.losAccelerator.clear();
  }

  isReadyForPosition(center: THREE.Vector3, coverageRadius: number): boolean {
    if (!this.bvhMesh || this.rebuildQueued) {
      return false;
    }
    const dx = center.x - this.lastBvhCenter.x;
    const dz = center.z - this.lastBvhCenter.z;
    return dx * dx + dz * dz <= coverageRadius * coverageRadius;
  }

  getPendingRowCount(): number {
    return this.pendingRows;
  }

  private queueNearFieldRebuild(
    center: THREE.Vector3,
    radius: number,
  ): void {
    this.rebuildStep = 6;
    this.halfSteps = Math.ceil(radius / this.rebuildStep);
    const gridW = this.halfSteps * 2 + 1;
    this.ensureMeshBuffers(gridW);
    this.targetBvhCenter.copy(center);
    this.pendingRowIndex = 0;
    this.pendingRows = gridW;
    this.rebuildQueued = true;
  }

  private processPendingWork(
    getHeightAt: (x: number, z: number) => number,
    maxRowsPerFrame: number,
  ): boolean {
    if (!this.rebuildQueued || !this.bvhMesh || !this.positionBuffer) {
      return false;
    }

    const gridW = this.gridWidth;
    const geometry = this.bvhMesh!.geometry as THREE.BufferGeometry;
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = this.positionBuffer!;
    const rowsToProcess = Math.max(1, Math.min(maxRowsPerFrame, this.pendingRows));
    const startRow = this.pendingRowIndex;
    const endRow = Math.min(gridW, startRow + rowsToProcess);

    for (let iz = startRow; iz < endRow; iz++) {
      for (let ix = 0; ix < gridW; ix++) {
        const wx = this.targetBvhCenter.x + (ix - this.halfSteps) * this.rebuildStep;
        const wz = this.targetBvhCenter.z + (iz - this.halfSteps) * this.rebuildStep;
        const wy = getHeightAt(wx, wz);
        const vi = iz * gridW + ix;
        positions[vi * 3] = wx;
        positions[vi * 3 + 1] = wy;
        positions[vi * 3 + 2] = wz;
      }
    }
    positionAttr.needsUpdate = true;
    this.pendingRowIndex = endRow;
    this.pendingRows = Math.max(0, gridW - endRow);

    if (this.pendingRows === 0) {
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.losAccelerator.registerChunk('bvh_nearfield', this.bvhMesh!);
      this.lastBvhCenter.copy(this.targetBvhCenter);
      this.rebuildQueued = false;
    }

    return true;
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
