import * as THREE from 'three';
import { BillboardInstance } from '../../../types';
import { VegetationMeshes } from './BillboardVegetationTypes';
import { Logger } from '../../../utils/Logger';

export interface ChunkInstances {
  start: number;
  count: number;
  instances: BillboardInstance[];
}

export type VegetationType = 'fern' | 'elephantEar' | 'fanPalm' |
                             'coconut' | 'areca' | 'dipterocarp' | 'banyan';

export class BillboardInstanceManager {
  private meshes: VegetationMeshes;
  private chunkInstances: Map<string, Map<string, ChunkInstances>> = new Map();

  // Allocation tracking
  private allocationIndices: Map<VegetationType, number> = new Map([
    ['dipterocarp', 0],
    ['banyan', 0],
    ['coconut', 0],
    ['areca', 0],
    ['fern', 0],
    ['fanPalm', 0],
    ['elephantEar', 0]
  ]);

  private freeSlots: Map<VegetationType, number[]> = new Map([
    ['dipterocarp', []],
    ['banyan', []],
    ['coconut', []],
    ['areca', []],
    ['fern', []],
    ['fanPalm', []],
    ['elephantEar', []]
  ]);

  private readonly maxInstances: Map<VegetationType, number> = new Map([
    ['fern', 80000],        // Original working value
    ['elephantEar', 15000], // Original working value
    ['fanPalm', 10000],     // Original working value
    ['coconut', 8000],      // Original working value
    ['areca', 15000],       // Original working value
    ['dipterocarp', 3000],  // Original working value
    ['banyan', 3000]        // Original working value
  ]);

  constructor(meshes: VegetationMeshes) {
    this.meshes = meshes;
  }

  addChunkInstances(
    chunkKey: string,
    fernInstances?: BillboardInstance[],
    elephantEarInstances?: BillboardInstance[],
    fanPalmInstances?: BillboardInstance[],
    coconutInstances?: BillboardInstance[],
    arecaInstances?: BillboardInstance[],
    dipterocarpInstances?: BillboardInstance[],
    banyanInstances?: BillboardInstance[]
  ): void {
    if (!this.chunkInstances.has(chunkKey)) {
      this.chunkInstances.set(chunkKey, new Map());
    }

    const chunkData = this.chunkInstances.get(chunkKey)!;

    // Process each vegetation type
    const instanceSets: [VegetationType, BillboardInstance[] | undefined][] = [
      ['fern', fernInstances],
      ['elephantEar', elephantEarInstances],
      ['fanPalm', fanPalmInstances],
      ['coconut', coconutInstances],
      ['areca', arecaInstances],
      ['dipterocarp', dipterocarpInstances],
      ['banyan', banyanInstances]
    ];

    for (const [type, instances] of instanceSets) {
      if (instances && instances.length > 0) {
        const allocation = this.allocateInstances(instances, type);
        if (allocation) {
          chunkData.set(type, allocation);
          this.updateInstanceMatrices(type, allocation);
        }
      }
    }

    const counts = instanceSets
      .map(([type, inst]) => `${inst?.length || 0} ${type}`)
      .join(', ');
    Logger.debug('vegetation', `Added instances for chunk ${chunkKey}: ${counts}`);
  }

  removeChunkInstances(chunkKey: string): void {
    const chunkData = this.chunkInstances.get(chunkKey);
    if (!chunkData) return;

    // Properly deallocate all instances for this chunk
    chunkData.forEach((allocation, type) => {
      this.deallocateInstances(allocation, type as VegetationType);
    });

    this.chunkInstances.delete(chunkKey);

    // Compact free slots after removal to prevent fragmentation
    for (const type of this.allocationIndices.keys()) {
      if (this.freeSlots.get(type)!.length > 100) { // Only compact if significant fragmentation
        this.compactFreeSlots(type);
      }
    }

    Logger.debug('vegetation', `Removed instances for chunk ${chunkKey}`);
  }

  private allocateInstances(
    instances: BillboardInstance[],
    type: VegetationType
  ): ChunkInstances | null {
    const freeSlots = this.freeSlots.get(type)!;
    const maxInstances = this.maxInstances.get(type)!;
    const allocationIndex = this.allocationIndices.get(type)!;
    const instanceMesh = this.getMeshForType(type);

    if (!instanceMesh) return null;

    const requiredSlots = instances.length;
    let startIndex: number;

    // Try to use free slots first
    if (freeSlots.length >= requiredSlots) {
      startIndex = freeSlots.splice(0, requiredSlots)[0];
      freeSlots.sort((a, b) => a - b);
    } else {
      // Check if we have enough space at the end
      if (allocationIndex + requiredSlots > maxInstances) {
        Logger.warn('vegetation', ` Not enough ${type} instances available: need ${requiredSlots}, have ${maxInstances - allocationIndex} (max: ${maxInstances})`);
        // Try to compact free slots first
        this.compactFreeSlots(type);
        const compactedIndex = this.allocationIndices.get(type)!;
        if (compactedIndex + requiredSlots > maxInstances) {
          return null;
        }
        startIndex = compactedIndex;
        this.allocationIndices.set(type, compactedIndex + requiredSlots);
      } else {

        startIndex = allocationIndex;
        this.allocationIndices.set(type, allocationIndex + requiredSlots);
      }
    }

    // Update visible count
    instanceMesh.count = Math.max(instanceMesh.count, startIndex + requiredSlots);

    return {
      start: startIndex,
      count: requiredSlots,
      instances: [...instances]
    };
  }

  private deallocateInstances(allocation: ChunkInstances, type: VegetationType): void {
    const freeSlots = this.freeSlots.get(type)!;

    // Add slots back to free list
    for (let i = 0; i < allocation.count; i++) {
      freeSlots.push(allocation.start + i);
    }

    // Sort free slots for efficient reuse
    freeSlots.sort((a, b) => a - b);

    // Hide the instances by setting scale to zero
    const instanceMesh = this.getMeshForType(type);
    if (instanceMesh) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < allocation.count; i++) {
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        instanceMesh.setMatrixAt(allocation.start + i, dummy.matrix);
      }
      instanceMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateInstanceMatrices(type: VegetationType, allocation: ChunkInstances): void {
    const instanceMesh = this.getMeshForType(type);
    if (!instanceMesh) return;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < allocation.count; i++) {
      const instance = allocation.instances[i];
      const matrixIndex = allocation.start + i;

      dummy.position.copy(instance.position);
      dummy.rotation.set(0, instance.rotation, 0);
      dummy.scale.copy(instance.scale);
      dummy.updateMatrix();

      instanceMesh.setMatrixAt(matrixIndex, dummy.matrix);
    }

    instanceMesh.instanceMatrix.needsUpdate = true;
  }

  getMeshForType(type: VegetationType): THREE.InstancedMesh | undefined {
    switch (type) {
      case 'fern': return this.meshes.fernInstances;
      case 'elephantEar': return this.meshes.elephantEarInstances;
      case 'fanPalm': return this.meshes.fanPalmInstances;
      case 'coconut': return this.meshes.coconutInstances;
      case 'areca': return this.meshes.arecaInstances;
      case 'dipterocarp': return this.meshes.dipterocarpInstances;
      case 'banyan': return this.meshes.banyanInstances;
      default: return undefined;
    }
  }

  getChunkInstances(): Map<string, Map<string, ChunkInstances>> {
    return this.chunkInstances;
  }

  getInstanceCount(type: VegetationType): number {
    const instanceMesh = this.getMeshForType(type);
    return instanceMesh ? instanceMesh.count : 0;
  }

  getDebugInfo(): { [key: string]: number } {
    const info: { [key: string]: number } = {
      chunksTracked: this.chunkInstances.size
    };

    for (const [type, index] of this.allocationIndices) {
      const freeCount = this.freeSlots.get(type)?.length || 0;
      const maxCount = this.maxInstances.get(type) || 0;
      info[`${type}Used`] = index - freeCount;
      info[`${type}Max`] = maxCount;
      info[`${type}Free`] = freeCount;
    }

    return info;
  }

  private compactFreeSlots(type: VegetationType): void {
    const freeSlots = this.freeSlots.get(type)!;
    if (freeSlots.length === 0) return;

    Logger.info('vegetation', `Compacting ${type}: ${freeSlots.length} free slots`);

    // Reset allocation to 0 and clear free slots
    // This forces new allocations to start from the beginning
    this.allocationIndices.set(type, 0);
    freeSlots.length = 0;

    // Reset the instance mesh count
    const instanceMesh = this.getMeshForType(type);
    if (instanceMesh) {
      instanceMesh.count = 0;
    }
  }
}