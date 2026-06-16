// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Logger } from '../../../utils/Logger';
import { createBillboardNodeMaterial, type BillboardNodeMaterial } from './BillboardNodeMaterial';
import { isLightingRigEnabled, lightingRigBindings } from '../../environment/LightingRig';
import type { BillboardLighting, GPUVegetationConfig } from './BillboardTypes';

export type { BillboardLighting, GPUVegetationConfig } from './BillboardTypes';

const DEFAULT_BILLBOARD_FOG_DENSITY = 0.00055;
const MAX_BILLBOARD_FOG_DENSITY = 0.002;

const clamp = (value: number, min: number, max: number): number => (
  Math.min(max, Math.max(min, value))
);

export class GPUBillboardVegetation {
  private geometry: THREE.InstancedBufferGeometry;
  private material: BillboardNodeMaterial;
  private mesh: THREE.Mesh;
  private scene: THREE.Scene;

  // Instance data arrays
  private positions: Float32Array;
  private scales: Float32Array;
  private rotations: Float32Array;

  // Attributes
  private positionAttribute: THREE.InstancedBufferAttribute;
  private scaleAttribute: THREE.InstancedBufferAttribute;
  private rotationAttribute: THREE.InstancedBufferAttribute;

  private maxInstances: number;
  private highWaterMark = 0;
  private liveCount = 0;
  private freeSlots: Set<number> = new Set();
  private warnedCapacity = false;

  // Pending update flags for batching
  private pendingPositionUpdate = false;
  private pendingScaleUpdate = false;
  private pendingRotationUpdate = false;
  private positionDirtyStart = Number.POSITIVE_INFINITY;
  private positionDirtyEnd = -1;
  private scaleDirtyStart = Number.POSITIVE_INFINITY;
  private scaleDirtyEnd = -1;
  private rotationDirtyStart = Number.POSITIVE_INFINITY;
  private rotationDirtyEnd = -1;

  constructor(scene: THREE.Scene, config: GPUVegetationConfig) {
    this.scene = scene;
    this.maxInstances = config.maxInstances;
    const alphaCrop = config.imposterAtlas?.alphaCrop ?? { minU: 0, minV: 0, maxU: 1, maxV: 1 };

    // Create plane geometry for billboard
    const planeGeometry = new THREE.PlaneGeometry(config.width, config.height);

    // Convert to InstancedBufferGeometry
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setIndex(planeGeometry.index);
    Object.entries(planeGeometry.attributes).forEach(([name, attribute]) => {
      this.geometry.setAttribute(name, attribute);
    });
    this.geometry.instanceCount = 0;
    planeGeometry.dispose();

    // Initialize instance arrays
    this.positions = new Float32Array(this.maxInstances * 3);
    this.scales = new Float32Array(this.maxInstances * 2);
    this.rotations = new Float32Array(this.maxInstances);

    // Create instance attributes
    this.positionAttribute = new THREE.InstancedBufferAttribute(this.positions, 3);
    this.scaleAttribute = new THREE.InstancedBufferAttribute(this.scales, 2);
    this.rotationAttribute = new THREE.InstancedBufferAttribute(this.rotations, 1);

    // Set dynamic for updates
    this.positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.scaleAttribute.setUsage(THREE.DynamicDrawUsage);
    this.rotationAttribute.setUsage(THREE.DynamicDrawUsage);

    // Add attributes to geometry
    this.geometry.setAttribute('instancePosition', this.positionAttribute);
    this.geometry.setAttribute('instanceScale', this.scaleAttribute);
    this.geometry.setAttribute('instanceRotation', this.rotationAttribute);

    this.material = createBillboardNodeMaterial(
      config,
      alphaCrop,
      this.positionAttribute,
      this.scaleAttribute,
      this.rotationAttribute,
    );

    // Create mesh
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false; // Disable frustum culling for instanced geometry
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.matrixWorldAutoUpdate = false;
    this.scene.add(this.mesh);
  }

  // Add instances for a chunk
  addInstances(instances: Array<{position: THREE.Vector3, scale: THREE.Vector3, rotation: number}>): number[] {
    if (instances.length === 0) return [];
    
    const allocatedIndices: number[] = [];
    const startLiveCount = this.liveCount;

    for (const instance of instances) {
      let index: number;

      if (this.freeSlots.size > 0) {
        // Get any free slot (Set iteration is efficient for this)
        const it = this.freeSlots.values();
        index = it.next().value as number;
        this.freeSlots.delete(index);
      } else {
        if (this.highWaterMark >= this.maxInstances) {
          if (!this.warnedCapacity) {
            Logger.warn('vegetation', `Max instances reached (${this.highWaterMark}/${this.maxInstances})`);
            this.warnedCapacity = true;
          }
          break;
        }
        index = this.highWaterMark;
        this.highWaterMark++;
      }

      const i3 = index * 3;
      const i2 = index * 2;

      this.positions[i3] = instance.position.x;
      this.positions[i3 + 1] = instance.position.y;
      this.positions[i3 + 2] = instance.position.z;

      this.scales[i2] = instance.scale.x;
      this.scales[i2 + 1] = instance.scale.y;

      this.rotations[index] = instance.rotation;

      allocatedIndices.push(index);
      this.liveCount++;
      this.markPositionDirty(index);
      this.markScaleDirty(index);
      this.markRotationDirty(index);
    }

    if (allocatedIndices.length > 0) {
      this.pendingPositionUpdate = true;
      this.pendingScaleUpdate = true;
      this.pendingRotationUpdate = true;
    }

    this.geometry.instanceCount = this.highWaterMark;
    this.mesh.visible = this.liveCount > 0;

    const addedCount = this.liveCount - startLiveCount;
    if (addedCount > 0) {
      Logger.debug('vegetation', `Allocated ${addedCount} instances (${startLiveCount} → ${this.liveCount} / ${this.maxInstances})`);
    }

    return allocatedIndices;
  }

  // Remove instances by indices
  removeInstances(indices: number[]): void {
    if (indices.length === 0) return;
    
    let removedCount = 0;
    for (const index of indices) {
      if (index >= this.highWaterMark) continue;

      const i2 = index * 2;
      if (this.scales[i2] === 0 && this.scales[i2 + 1] === 0) {
        continue;
      }

      this.scales[i2] = 0;
      this.scales[i2 + 1] = 0;
      this.freeSlots.add(index);
      if (this.liveCount > 0) {
        this.liveCount--;
      }
      this.markScaleDirty(index);
      removedCount++;
    }

    if (removedCount > 0) {
      this.pendingScaleUpdate = true;
      this.compactHighWaterMark();
    }

    Logger.debug('vegetation', `Freed ${indices.length} instances (live=${this.liveCount}, reserved=${this.highWaterMark})`);
  }

  private compactHighWaterMark(): void {
    let compacted = false;
    while (this.highWaterMark > 0) {
      const lastIndex = this.highWaterMark - 1;
      const i2 = lastIndex * 2;
      if (this.scales[i2] === 0 && this.scales[i2 + 1] === 0) {
        this.highWaterMark--;
        this.freeSlots.delete(lastIndex);
        compacted = true;
      } else {
        break;
      }
    }

    if (compacted) {
      this.geometry.instanceCount = this.highWaterMark;
    }
    this.mesh.visible = this.liveCount > 0;
    
    if (this.highWaterMark < this.maxInstances) {
      this.warnedCapacity = false;
    }
  }

  // Get instance positions for area clearing
  getInstancePositions(): Float32Array {
    return this.positions;
  }

  // Reset all instances (for full cleanup)
  reset(): void {
    const previousHighWaterMark = this.highWaterMark;
    this.highWaterMark = 0;
    this.liveCount = 0;
    this.freeSlots.clear();
    this.geometry.instanceCount = 0;
    this.mesh.visible = false;
    if (previousHighWaterMark > 0) {
      this.markPositionRangeDirty(0, previousHighWaterMark - 1);
      this.markScaleRangeDirty(0, previousHighWaterMark - 1);
      this.markRotationRangeDirty(0, previousHighWaterMark - 1);
    } else {
      this.markPositionRangeDirty(0, this.maxInstances - 1);
      this.markScaleRangeDirty(0, this.maxInstances - 1);
      this.markRotationRangeDirty(0, this.maxInstances - 1);
    }
    this.pendingPositionUpdate = true;
    this.pendingScaleUpdate = true;
    this.pendingRotationUpdate = true;
  }

  // Update uniforms (called every frame)
  update(
    camera: THREE.Camera,
    time: number,
    fog?: THREE.FogExp2 | null,
    lighting?: BillboardLighting | null,
    playerWorldPosition?: THREE.Vector3 | null,
  ): void {
    // Apply batched buffer updates
    if (this.pendingPositionUpdate) {
      this.flushAttributeUpdateRange(this.positionAttribute, this.positionDirtyStart, this.positionDirtyEnd);
      this.positionDirtyStart = Number.POSITIVE_INFINITY;
      this.positionDirtyEnd = -1;
      this.pendingPositionUpdate = false;
    }
    if (this.pendingScaleUpdate) {
      this.flushAttributeUpdateRange(this.scaleAttribute, this.scaleDirtyStart, this.scaleDirtyEnd);
      this.scaleDirtyStart = Number.POSITIVE_INFINITY;
      this.scaleDirtyEnd = -1;
      this.pendingScaleUpdate = false;
    }
    if (this.pendingRotationUpdate) {
      this.flushAttributeUpdateRange(this.rotationAttribute, this.rotationDirtyStart, this.rotationDirtyEnd);
      this.rotationDirtyStart = Number.POSITIVE_INFINITY;
      this.rotationDirtyEnd = -1;
      this.pendingRotationUpdate = false;
    }

    this.material.uniforms.cameraPosition.value.copy(camera.position);
    this.material.uniforms.time.value = time;
    if (playerWorldPosition) {
      this.material.uniforms.playerWorldPosition.value.copy(playerWorldPosition);
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      this.material.uniforms.viewMatrix.value.copy(camera.matrixWorldInverse);
    }

    // Enable height fog when scene has fog (use our custom height fog parameters)
    if (fog) {
      this.material.uniforms.fogEnabled.value = true;
      // Fog color authority: on the rig path read the single rig fog color
      // (derived from the same horizon irradiance terrain/atmosphere fog uses)
      // instead of the direct `scene.fog.color` read — the memo's parallel-fog
      // flag (#2). Legacy path (flag OFF) keeps the direct read byte-identical.
      const rigFogColor = isLightingRigEnabled() ? lightingRigBindings.fogColor.value : fog.color;
      this.material.uniforms.fogColor.value.copy(rigFogColor);
      const sceneFogDensity = Number.isFinite(fog.density)
        ? fog.density
        : DEFAULT_BILLBOARD_FOG_DENSITY;
      this.material.uniforms.fogDensity.value = clamp(
        sceneFogDensity,
        0,
        MAX_BILLBOARD_FOG_DENSITY,
      );
    } else {
      this.material.uniforms.fogEnabled.value = false;
      this.material.uniforms.fogDensity.value = DEFAULT_BILLBOARD_FOG_DENSITY;
    }

    // Atmosphere lighting — forward the same sun/hemisphere colors terrain's
    // MeshStandardMaterial samples via renderer.moonLight + hemisphereLight,
    // so vegetation and terrain darken / warm together across TOD and storms.
    if (lighting) {
      this.material.uniforms.sunColor.value.copy(lighting.sunColor);
      this.material.uniforms.skyColor.value.copy(lighting.skyColor);
      this.material.uniforms.groundColor.value.copy(lighting.groundColor);
      this.material.uniforms.lightingEnabled.value = true;
    } else {
      this.material.uniforms.lightingEnabled.value = false;
    }
  }

  // Get current instance count
  getInstanceCount(): number {
    return this.liveCount;
  }

  getHighWaterMark(): number {
    return this.highWaterMark;
  }

  getFreeSlotCount(): number {
    return this.freeSlots.size;
  }

  private markPositionDirty(index: number): void {
    this.markPositionRangeDirty(index, index);
  }

  private markScaleDirty(index: number): void {
    this.markScaleRangeDirty(index, index);
  }

  private markRotationDirty(index: number): void {
    this.markRotationRangeDirty(index, index);
  }

  private markPositionRangeDirty(start: number, end: number): void {
    this.positionDirtyStart = Math.min(this.positionDirtyStart, start);
    this.positionDirtyEnd = Math.max(this.positionDirtyEnd, end);
  }

  private markScaleRangeDirty(start: number, end: number): void {
    this.scaleDirtyStart = Math.min(this.scaleDirtyStart, start);
    this.scaleDirtyEnd = Math.max(this.scaleDirtyEnd, end);
  }

  private markRotationRangeDirty(start: number, end: number): void {
    this.rotationDirtyStart = Math.min(this.rotationDirtyStart, start);
    this.rotationDirtyEnd = Math.max(this.rotationDirtyEnd, end);
  }

  private flushAttributeUpdateRange(
    attribute: THREE.InstancedBufferAttribute,
    dirtyStart: number,
    dirtyEnd: number,
  ): void {
    if (dirtyStart <= dirtyEnd && Number.isFinite(dirtyStart)) {
      if (typeof attribute.clearUpdateRanges === 'function') {
        attribute.clearUpdateRanges();
      }
      if (typeof attribute.addUpdateRange === 'function') {
        attribute.addUpdateRange(
          dirtyStart * attribute.itemSize,
          (dirtyEnd - dirtyStart + 1) * attribute.itemSize,
        );
      }
    }
    attribute.needsUpdate = true;
  }

  // Dispose resources
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.scene.remove(this.mesh);
  }
}
