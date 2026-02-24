import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { modelLoader } from '../assets/ModelLoader';
import { StructureModels } from '../assets/modelPaths';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { InventoryManager } from '../player/InventoryManager';
import { TicketSystem } from '../world/TicketSystem';

/** Height of a sandbag wall in world units (used for placement Y offset). */
export const SANDBAG_HEIGHT = 2.4;

interface PlacedSandbag {
  id: string;
  mesh: THREE.Object3D;
  bounds: THREE.Box3;
  position: THREE.Vector3;
}

export class SandbagSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private chunkManager?: ImprovedChunkManager;
  private inventoryManager?: InventoryManager;
  private ticketSystem?: TicketSystem;

  private sandbags: PlacedSandbag[] = [];
  private nextSandbagId = 0;
  private readonly MAX_SANDBAGS = 10;
  private readonly MIN_SPACING = 3;
  private readonly MAX_SLOPE_DEGREES = 30;
  private readonly MAX_WATER_HEIGHT = 1.0;

  private placementPreview?: THREE.Object3D;
  private previewVisible = false;
  private previewPosition = new THREE.Vector3();
  private previewRotation = 0;
  private additionalRotation = 0; // For manual rotation adjustments
  private placementValid = false;
  private pulseTime = 0;
  private previewReady = false;

  private raycaster = new THREE.Raycaster();

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    chunkManager?: ImprovedChunkManager
  ) {
    this.scene = scene;
    this.camera = camera;
    this.chunkManager = chunkManager;
  }

  async init(): Promise<void> {
    Logger.info('weapons', 'Initializing Sandbag System...');
    await this.createPlacementPreview();
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
      this.disposeObject3D(sandbag.mesh);
    });
    this.sandbags = [];

    if (this.placementPreview) {
      this.scene.remove(this.placementPreview);
      this.disposeObject3D(this.placementPreview);
    }
  }

  private disposeObject3D(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
  }

  private async createPlacementPreview(): Promise<void> {
    try {
      const scene = await modelLoader.loadModel(StructureModels.SANDBAG_WALL);

      // Replace all materials with translucent green for preview
      const previewMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.5,
        emissive: 0x00ff00,
        emissiveIntensity: 0.2
      });

      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = previewMaterial;
        }
      });

      this.placementPreview = scene;
      this.placementPreview.visible = false;
      this.scene.add(this.placementPreview);
      this.previewReady = true;
    } catch (err) {
      Logger.warn('weapons', 'Failed to load sandbag preview model', err);
    }
  }

  updatePreviewPosition(camera: THREE.Camera): void {
    if (!this.placementPreview || !this.previewReady) return;

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);

    const distance = 2.5;
    this.previewPosition.copy(camera.position).add(direction.multiplyScalar(distance));

    const groundHeight = this.getGroundHeight(this.previewPosition.x, this.previewPosition.z);
    this.previewPosition.y = groundHeight + SANDBAG_HEIGHT / 2;

    // Calculate rotation to align with player facing direction (not perpendicular)
    const playerYaw = Math.atan2(direction.x, direction.z);
    this.previewRotation = playerYaw + this.additionalRotation;

    this.placementValid = this.isPlacementValid(this.previewPosition);

    // Update preview material color (valid = green, invalid = red)
    const colorHex = this.placementValid ? 0x00ff00 : 0xff0000;
    this.placementPreview.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.color.setHex(colorHex);
        child.material.emissive.setHex(colorHex);
      }
    });

    this.placementPreview.position.copy(this.previewPosition);
    this.placementPreview.rotation.y = this.previewRotation;
  }

  private updatePreviewPulse(deltaTime: number): void {
    if (!this.placementPreview || !this.previewReady) return;

    this.pulseTime += deltaTime;

    // Breathing effect: opacity oscillates between 0.3 and 0.7
    const breathe = Math.sin(this.pulseTime * 3) * 0.2 + 0.5;
    this.placementPreview.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.opacity = breathe;
      }
    });

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
    if (this.ticketSystem && !this.ticketSystem.isGameActive()) return false;
    if (!this.placementValid || !this.inventoryManager) {
      Logger.info('weapons', ' Cannot place sandbag: invalid position or no inventory');
      return false;
    }

    if (!this.inventoryManager.canUseSandbag()) {
      Logger.info('weapons', ' No sandbags remaining');
      return false;
    }

    // Async load a fresh GLB clone for placement
    const pos = this.previewPosition.clone();
    const rotY = this.placementPreview?.rotation.y ?? 0;
    void this.placeSandbagAsync(pos, rotY);

    this.inventoryManager.useSandbag();
    return true;
  }

  private async placeSandbagAsync(pos: THREE.Vector3, rotY: number): Promise<void> {
    try {
      const sandbagModel = await modelLoader.loadModel(StructureModels.SANDBAG_WALL);
      sandbagModel.position.copy(pos);
      sandbagModel.rotation.y = rotY;

      // Enable shadows
      sandbagModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.scene.add(sandbagModel);

      const bounds = new THREE.Box3().setFromObject(sandbagModel);

      const sandbag: PlacedSandbag = {
        id: `sandbag_${this.nextSandbagId++}`,
        mesh: sandbagModel,
        bounds: bounds,
        position: pos.clone()
      };

      this.sandbags.push(sandbag);

      Logger.info('weapons', `Sandbag placed at (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}). Total: ${this.sandbags.length}/${this.MAX_SANDBAGS}`);
    } catch (err) {
      Logger.warn('weapons', 'Failed to load sandbag model for placement', err);
    }
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

    const objects = this.sandbags.map(s => s.mesh);
    const intersections = this.raycaster.intersectObjects(objects, true);

    return intersections.length > 0;
  }

  getRayIntersectionPoint(ray: THREE.Ray): THREE.Vector3 | null {
    this.raycaster.ray.copy(ray);

    const objects = this.sandbags.map(s => s.mesh);
    const intersections = this.raycaster.intersectObjects(objects, true);

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
    const testPoint = position;

    for (const sandbag of this.sandbags) {
      sandbag.bounds.setFromObject(sandbag.mesh);

      const b = sandbag.bounds;

      // Check horizontal overlap (expanded by player radius)
      if (testPoint.x >= b.min.x - radius && testPoint.x <= b.max.x + radius &&
          testPoint.z >= b.min.z - radius && testPoint.z <= b.max.z + radius) {
        // Block if player feet are below sandbag top (wall collision)
        // Allow passage if player is standing on top (feet above top surface)
        if (testPoint.y < b.max.y) {
          return true;
        }
      }
    }
    return false;
  }

  /** Returns the top surface height if the player is directly above a sandbag, else null. */
  getStandingHeight(x: number, z: number): number | null {
    let maxTop: number | null = null;
    for (const sandbag of this.sandbags) {
      sandbag.bounds.setFromObject(sandbag.mesh);
      const b = sandbag.bounds;
      if (x >= b.min.x && x <= b.max.x &&
          z >= b.min.z && z <= b.max.z) {
        const top = b.max.y;
        if (maxTop === null || top > maxTop) {
          maxTop = top;
        }
      }
    }
    return maxTop;
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

  setTicketSystem(ticketSystem: TicketSystem): void {
    this.ticketSystem = ticketSystem;
  }

  getSandbagCount(): number {
    return this.sandbags.length;
  }
}
