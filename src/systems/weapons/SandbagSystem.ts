import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ProgrammaticExplosivesFactory } from './ProgrammaticExplosivesFactory';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { InventoryManager } from '../player/InventoryManager';

interface PlacedSandbag {
  id: string;
  mesh: THREE.Mesh;
  bounds: THREE.Box3;
  position: THREE.Vector3;
}

export class SandbagSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private chunkManager?: ImprovedChunkManager;
  private inventoryManager?: InventoryManager;

  private sandbags: PlacedSandbag[] = [];
  private nextSandbagId = 0;
  private readonly MAX_SANDBAGS = 10;
  private readonly MIN_SPACING = 3;
  private readonly MAX_SLOPE_DEGREES = 30;
  private readonly MAX_WATER_HEIGHT = 1.0;

  private placementPreview?: THREE.Mesh;
  private previewVisible = false;
  private previewPosition = new THREE.Vector3();
  private previewRotation = 0;
  private additionalRotation = 0; // For manual rotation adjustments
  private placementValid = false;
  private pulseTime = 0;

  private raycaster = new THREE.Raycaster();

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    chunkManager?: ImprovedChunkManager
  ) {
    this.scene = scene;
    this.camera = camera;
    this.chunkManager = chunkManager;

    this.createPlacementPreview();
  }

  async init(): Promise<void> {
    Logger.info('weapons', '🟫 Initializing Sandbag System...');
  }

  update(deltaTime: number): void {
    if (this.previewVisible && this.placementPreview) {
      this.updatePreviewPosition(this.camera);
      this.updatePreviewPulse(deltaTime);
    }
  }

  dispose(): void {
    this.sandbags.forEach(sandbag => {
      this.scene.remove(sandbag.mesh);
      sandbag.mesh.geometry.dispose();
      if (sandbag.mesh.material instanceof THREE.Material) {
        sandbag.mesh.material.dispose();
      }
    });
    this.sandbags = [];

    if (this.placementPreview) {
      this.scene.remove(this.placementPreview);
      this.placementPreview.geometry.dispose();
      if (this.placementPreview.material instanceof THREE.Material) {
        this.placementPreview.material.dispose();
      }
    }
  }

  private createPlacementPreview(): void {
    const sandbagMesh = ProgrammaticExplosivesFactory.createSandbag();

    const previewMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.5,
      emissive: 0x00ff00,
      emissiveIntensity: 0.2
    });

    this.placementPreview = new THREE.Mesh(sandbagMesh.geometry, previewMaterial);
    this.placementPreview.visible = false;
    this.scene.add(this.placementPreview);
  }

  updatePreviewPosition(camera: THREE.Camera): void {
    if (!this.placementPreview) return;

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    const distance = 2.5;
    this.previewPosition.copy(camera.position).add(direction.multiplyScalar(distance));

    const groundHeight = this.getGroundHeight(this.previewPosition.x, this.previewPosition.z);
    this.previewPosition.y = groundHeight + 1.5; // Increased height offset

    // Calculate rotation to align with player facing direction (not perpendicular)
    const playerYaw = Math.atan2(direction.x, direction.z);
    // Don't add 90 degrees - align with view direction for proper blocking
    this.previewRotation = playerYaw + this.additionalRotation;

    this.placementValid = this.isPlacementValid(this.previewPosition);

    if (this.placementPreview.material instanceof THREE.MeshStandardMaterial) {
      if (this.placementValid) {
        this.placementPreview.material.color.setHex(0x00ff00);
        this.placementPreview.material.emissive.setHex(0x00ff00);
      } else {
        this.placementPreview.material.color.setHex(0xff0000);
        this.placementPreview.material.emissive.setHex(0xff0000);
      }
    }

    this.placementPreview.position.copy(this.previewPosition);
    this.placementPreview.rotation.y = this.previewRotation;
  }

  private updatePreviewPulse(deltaTime: number): void {
    if (!this.placementPreview || this.placementPreview.material instanceof THREE.MeshStandardMaterial === false) {
      return;
    }

    this.pulseTime += deltaTime;
    const material = this.placementPreview.material as THREE.MeshStandardMaterial;

    // Breathing effect: opacity oscillates between 0.3 and 0.7
    const breathe = Math.sin(this.pulseTime * 3) * 0.2 + 0.5;
    material.opacity = breathe;

    // Reset pulse time every 2 seconds to avoid floating point issues
    if (this.pulseTime > 6.28) {
      this.pulseTime = 0;
    }
  }

  private getTerrainSlope(position: THREE.Vector3): number {
    if (!this.chunkManager) return 0;

    // Sample height at 4 points around the placement position
    const sampleDistance = 0.5;
    const h1 = this.getGroundHeight(position.x + sampleDistance, position.z);
    const h2 = this.getGroundHeight(position.x - sampleDistance, position.z);
    const h3 = this.getGroundHeight(position.x, position.z + sampleDistance);
    const h4 = this.getGroundHeight(position.x, position.z - sampleDistance);

    // Calculate slope vectors
    const slopeX = Math.abs(h1 - h2) / (2 * sampleDistance);
    const slopeZ = Math.abs(h3 - h4) / (2 * sampleDistance);

    // Max slope in degrees
    const maxSlope = Math.max(slopeX, slopeZ);
    return Math.atan(maxSlope) * (180 / Math.PI);
  }

  private isInWater(position: THREE.Vector3): boolean {
    // Water is simulated at y = 0 height
    // Check if position would be underwater
    return position.y < this.MAX_WATER_HEIGHT;
  }

  private isPlacementValid(position: THREE.Vector3): boolean {
    // Check inventory
    if (!this.inventoryManager || !this.inventoryManager.canUseSandbag()) {
      return false;
    }

    // Check max sandbags
    if (this.sandbags.length >= this.MAX_SANDBAGS) {
      return false;
    }

    // Check spacing from existing sandbags
    for (const sandbag of this.sandbags) {
      const distance = position.distanceTo(sandbag.position);
      if (distance < this.MIN_SPACING) {
        return false;
      }
    }

    // Check slope
    const slope = this.getTerrainSlope(position);
    if (slope > this.MAX_SLOPE_DEGREES) {
      return false;
    }

    // Check water
    if (this.isInWater(position)) {
      return false;
    }

    return true;
  }

  placeSandbag(): boolean {
    if (!this.placementValid || !this.inventoryManager) {
      Logger.info('weapons', ' Cannot place sandbag: invalid position or no inventory');
      return false;
    }

    if (!this.inventoryManager.canUseSandbag()) {
      Logger.info('weapons', ' No sandbags remaining');
      return false;
    }

    const sandbagMesh = ProgrammaticExplosivesFactory.createSandbag();
    sandbagMesh.position.copy(this.previewPosition);
    sandbagMesh.rotation.y = this.placementPreview!.rotation.y;
    this.scene.add(sandbagMesh);

    const bounds = new THREE.Box3().setFromObject(sandbagMesh);

    const sandbag: PlacedSandbag = {
      id: `sandbag_${this.nextSandbagId++}`,
      mesh: sandbagMesh,
      bounds: bounds,
      position: this.previewPosition.clone()
    };

    this.sandbags.push(sandbag);

    this.inventoryManager.useSandbag();

    Logger.info('weapons', `🟫 Sandbag placed at (${this.previewPosition.x.toFixed(1)}, ${this.previewPosition.z.toFixed(1)}). Total: ${this.sandbags.length}/${this.MAX_SANDBAGS}`);

    return true;
  }

  showPlacementPreview(show: boolean): void {
    this.previewVisible = show;
    if (this.placementPreview) {
      this.placementPreview.visible = show;
    }
    if (show) {
      this.additionalRotation = 0; // Reset manual rotation
      this.pulseTime = 0; // Reset pulse animation
    }
  }

  rotatePlacementPreview(delta: number): void {
    if (!this.previewVisible) return;
    this.additionalRotation += delta;
  }

  checkRayIntersection(ray: THREE.Ray): boolean {
    this.raycaster.ray.copy(ray);

    const meshes = this.sandbags.map(s => s.mesh);
    const intersections = this.raycaster.intersectObjects(meshes, false);

    return intersections.length > 0;
  }

  getRayIntersectionPoint(ray: THREE.Ray): THREE.Vector3 | null {
    this.raycaster.ray.copy(ray);

    const meshes = this.sandbags.map(s => s.mesh);
    const intersections = this.raycaster.intersectObjects(meshes, false);

    if (intersections.length > 0) {
      return intersections[0].point;
    }

    return null;
  }

  getSandbagBounds(): THREE.Box3[] {
    // Update bounds in case sandbags have moved or rotated
    this.sandbags.forEach(s => {
      s.bounds.setFromObject(s.mesh);
    });
    return this.sandbags.map(s => s.bounds);
  }

  checkCollision(position: THREE.Vector3, radius: number = 0.5): boolean {
    // Check if a position collides with any sandbag
    const testPoint = new THREE.Vector3(position.x, position.y, position.z);

    for (const sandbag of this.sandbags) {
      // Update bounds for accurate collision
      sandbag.bounds.setFromObject(sandbag.mesh);

      // Expand bounds slightly for player radius
      const expandedBounds = sandbag.bounds.clone();
      expandedBounds.min.x -= radius;
      expandedBounds.min.z -= radius;
      expandedBounds.max.x += radius;
      expandedBounds.max.z += radius;

      // Check if position is within bounds horizontally
      if (testPoint.x >= expandedBounds.min.x && testPoint.x <= expandedBounds.max.x &&
          testPoint.z >= expandedBounds.min.z && testPoint.z <= expandedBounds.max.z) {
        // Check if player is at a height where they would collide
        if (testPoint.y < expandedBounds.max.y + 1) { // Can step over if high enough
          return true;
        }
      }
    }
    return false;
  }

  private getGroundHeight(x: number, z: number): number {
    if (this.chunkManager) {
      return this.chunkManager.getEffectiveHeightAt(x, z);
    }
    return 0;
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager;
  }

  getSandbagCount(): number {
    return this.sandbags.length;
  }
}