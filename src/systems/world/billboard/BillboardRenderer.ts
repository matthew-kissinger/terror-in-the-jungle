import * as THREE from 'three';
import { VegetationMeshes } from './BillboardVegetationTypes';
import { ChunkInstances, VegetationType, BillboardInstanceManager } from './BillboardInstanceManager';

const _cameraPosition = new THREE.Vector3();
const _chunkCenter = new THREE.Vector3();
const _direction = new THREE.Vector3();

export class BillboardRenderer {
  private camera: THREE.Camera;
  private meshes: VegetationMeshes;
  private instanceManager: BillboardInstanceManager;

  private lastCameraPosition: THREE.Vector3;
  private readonly updateThreshold = 0.1;
  private dummy = new THREE.Object3D();

  constructor(
    camera: THREE.Camera,
    meshes: VegetationMeshes,
    instanceManager: BillboardInstanceManager
  ) {
    this.camera = camera;
    this.meshes = meshes;
    this.instanceManager = instanceManager;
    this.lastCameraPosition = _cameraPosition.clone();
  }

  update(_deltaTime: number): void {
    const cameraPosition = _cameraPosition;
    this.camera.getWorldPosition(cameraPosition);

    // Only update if camera moved significantly
    if (cameraPosition.distanceTo(this.lastCameraPosition) > this.updateThreshold) {
      this.updateAllBillboards(cameraPosition);
      this.lastCameraPosition.copy(cameraPosition);
    }
  }

  private updateAllBillboards(cameraPosition: THREE.Vector3): void {
    const chunkInstances = this.instanceManager.getChunkInstances();

    chunkInstances.forEach((chunkData, chunkKey) => {
      // Parse chunk position for distance check
      const [chunkX, chunkZ] = chunkKey.split(',').map(Number);
      const chunkCenter = _chunkCenter.set(
        chunkX * 64 + 32, // Assuming chunk size 64
        0,
        chunkZ * 64 + 32
      );

      // Only skip very distant chunks
      const distanceToCamera = chunkCenter.distanceTo(cameraPosition);
      if (distanceToCamera > 800) {
        return;
      }

      // Update all vegetation types
      const vegetationTypes: VegetationType[] = [
        'fern', 'elephantEar', 'fanPalm',
        'coconut', 'areca', 'dipterocarp', 'banyan'
      ];

      for (const type of vegetationTypes) {
        const data = chunkData.get(type);
        if (data) {
          this.updateBillboardRotations(data, cameraPosition, type);
        }
      }
    });

    // Mark all matrices for update
    this.markAllMatricesForUpdate();
  }

  private updateBillboardRotations(
    allocation: ChunkInstances,
    cameraPosition: THREE.Vector3,
    type: VegetationType
  ): void {
    const instanceMesh = this.instanceManager.getMeshForType(type);
    if (!instanceMesh) return;

    for (let i = 0; i < allocation.count; i++) {
      const instance = allocation.instances[i];
      const matrixIndex = allocation.start + i;

      // Only cull by distance, not frustum (to prevent popping)
      const distanceToCamera = instance.position.distanceTo(cameraPosition);
      if (distanceToCamera > 500) {
        continue;
      }

      // Calculate rotation to face camera (Y-axis only for vertical billboards)
      const direction = _direction.subVectors(cameraPosition, instance.position);
      direction.y = 0; // Keep billboards vertical
      direction.normalize();

      const targetRotation = Math.atan2(direction.x, direction.z);

      // Only update if rotation changed significantly
      if (Math.abs(targetRotation - instance.rotation) > 0.1) {
        instance.rotation = targetRotation;

        this.dummy.position.copy(instance.position);
        this.dummy.rotation.set(0, instance.rotation, 0);
        this.dummy.scale.copy(instance.scale);
        this.dummy.updateMatrix();

        instanceMesh.setMatrixAt(matrixIndex, this.dummy.matrix);
      }
    }
  }

  private markAllMatricesForUpdate(): void {
    Object.values(this.meshes).forEach(mesh => {
      if (mesh) {
        mesh.instanceMatrix.needsUpdate = true;
      }
    });
  }
}
