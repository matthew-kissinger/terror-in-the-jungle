// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { LOSAccelerator } from '../combat/LOSAccelerator';

/**
 * One side of the double-buffered near-field terrain mesh. The runtime keeps
 * two of these: a `front` slab that queries raycast against (always a complete,
 * self-consistent snapshot) and a `back` slab that an in-progress rebuild
 * writes height rows into. The two are swapped atomically only once the back
 * slab is fully rewritten, so a query issued mid-rebuild can never observe a
 * hybrid of old and new triangles.
 */
interface MeshSlab {
  mesh: THREE.Mesh;
  positionBuffer: Float32Array;
  gridWidth: number;
}

/**
 * Owns the near-field BVH terrain mesh used for terrain raycasts and LOS acceleration.
 *
 * The rebuild is incremental (a handful of grid rows per frame), so it spans
 * multiple frames during which terrain LOS / fire-authority raycasts keep
 * firing. To keep those queries consistent, rewrites land in a back slab and
 * the registered (queried) front slab is only replaced once the rebuild
 * completes. See `MeshSlab`.
 */
export class TerrainRaycastRuntime {
  private readonly losAccelerator: LOSAccelerator;
  // `frontSlab` is the snapshot queries read; `backSlab` receives the rebuild.
  private frontSlab: MeshSlab | null = null;
  private backSlab: MeshSlab | null = null;
  private readonly lastBvhCenter = new THREE.Vector3(NaN, NaN, NaN);
  private readonly targetBvhCenter = new THREE.Vector3(NaN, NaN, NaN);
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
    if (this.frontSlab) {
      this.losAccelerator.unregisterChunk('bvh_nearfield');
      this.frontSlab.mesh.geometry.dispose();
      this.frontSlab = null;
    }
    if (this.backSlab) {
      this.backSlab.mesh.geometry.dispose();
      this.backSlab = null;
    }
    this.losAccelerator.clear();
  }

  isReadyForPosition(center: THREE.Vector3, coverageRadius: number): boolean {
    if (!this.frontSlab || this.rebuildQueued) {
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
    this.ensureBackSlab(gridW);
    this.targetBvhCenter.copy(center);
    this.pendingRowIndex = 0;
    this.pendingRows = gridW;
    this.rebuildQueued = true;
  }

  private processPendingWork(
    getHeightAt: (x: number, z: number) => number,
    maxRowsPerFrame: number,
  ): boolean {
    if (!this.rebuildQueued || !this.backSlab) {
      return false;
    }

    const back = this.backSlab;
    const gridW = back.gridWidth;
    const geometry = back.mesh.geometry as THREE.BufferGeometry;
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = back.positionBuffer;
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
      // Back slab is now a complete snapshot — finalize its bounds and swap it
      // in front so queries pick it up atomically. Until this line runs, every
      // raycast saw the previous, fully-consistent front slab.
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.swapInBackSlab();
      this.lastBvhCenter.copy(this.targetBvhCenter);
      this.rebuildQueued = false;
    }

    return true;
  }

  /**
   * Promote the freshly rebuilt back slab to front and register it for LOS.
   * The old front slab (if any) becomes the back slab to be reused next
   * rebuild, so steady-state allocates no new geometry. `registerChunk`
   * replaces the `bvh_nearfield` cache entry by key, so the swap is atomic
   * from a query's perspective: it reads either the old mesh or the new one,
   * never a half-written buffer.
   */
  private swapInBackSlab(): void {
    const newFront = this.backSlab!;
    this.backSlab = this.frontSlab;
    this.frontSlab = newFront;
    this.losAccelerator.registerChunk('bvh_nearfield', newFront.mesh);
  }

  /**
   * Ensure the back slab exists and matches the requested grid width. The back
   * slab is the only buffer the rebuild writes into; the front slab is left
   * untouched so in-flight queries stay consistent. When the grid width
   * changes (rare — only when coverage radius changes) the back slab geometry
   * is rebuilt from scratch.
   */
  private ensureBackSlab(gridW: number): void {
    if (this.backSlab && this.backSlab.gridWidth === gridW) {
      return;
    }

    if (this.backSlab) {
      this.backSlab.mesh.geometry.dispose();
      this.backSlab = null;
    }

    this.backSlab = this.createSlab(gridW);
  }

  private createSlab(gridW: number): MeshSlab {
    const vertexCount = gridW * gridW;
    const positionBuffer = new Float32Array(vertexCount * 3);
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
    geometry.setAttribute('position', new THREE.BufferAttribute(positionBuffer, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const mesh = new THREE.Mesh(geometry);
    mesh.visible = false;

    return { mesh, positionBuffer, gridWidth: gridW };
  }
}
