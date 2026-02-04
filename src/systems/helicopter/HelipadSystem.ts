import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { GameModeManager } from '../world/GameModeManager';

export class HelipadSystem implements GameSystem {
  private scene: THREE.Scene;
  private terrainManager?: ImprovedChunkManager;
  private vegetationSystem?: any;
  private gameModeManager?: GameModeManager;
  private helipads: Map<string, THREE.Group> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async init(): Promise<void> {
    Logger.info('helicopter', '🚁 Initializing Helipad System...');
    // Helipads will be created when terrain manager is set
  }

  setTerrainManager(terrainManager: ImprovedChunkManager): void {
    this.terrainManager = terrainManager;
    // Don't create helipad immediately - wait for terrain to be loaded
    // Will be created when needed
  }

  setVegetationSystem(vegetationSystem: any): void {
    this.vegetationSystem = vegetationSystem;
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
  }

  createHelipadWhenReady(): void {
    if (!this.helipads.has('us_helipad')) {
      this.createOpenFrontierHelipad();
    }
  }


  private createOpenFrontierHelipad(): void {
    if (!this.terrainManager) {
      Logger.warn('helicopter', '⚠️ Cannot create helipad - terrain manager not available');
      return;
    }

    // Position near US Main HQ spawn in Open Frontier mode - offset to the right (east)
    const helipadPosition = new THREE.Vector3(40, 0, -1400); // 40 units east of US Main HQ

    // Find the highest terrain point within the platform area for proper collision
    const platformRadius = 12;
    const maxHeight = this.findMaxTerrainHeight(helipadPosition.x, helipadPosition.z, platformRadius);
    helipadPosition.y = maxHeight + 0.8; // Lowered further, just slightly above terrain

    const helipad = this.createHelipadGeometry();
    helipad.position.copy(helipadPosition);

    this.scene.add(helipad);
    this.helipads.set('us_helipad', helipad);

    // Register helipad for collision detection
    if (this.terrainManager && 'registerCollisionObject' in this.terrainManager) {
      (this.terrainManager as any).registerCollisionObject('us_helipad', helipad);
    }

    // Clear vegetation in helipad area
    this.clearVegetationArea(helipadPosition.x, helipadPosition.z, platformRadius + 2);

    Logger.info('helicopter', `🚁 Created Open Frontier helipad at position (${helipadPosition.x}, ${helipadPosition.y}, ${helipadPosition.z}) - max terrain height: ${maxHeight.toFixed(2)}`);
  }

  private findMaxTerrainHeight(centerX: number, centerZ: number, radius: number): number {
    if (!this.terrainManager) return 0;

    let maxHeight = -Infinity;
    const samplePoints = 16; // Sample points around and within the circle

    // Sample the center
    maxHeight = Math.max(maxHeight, this.terrainManager.getHeightAt(centerX, centerZ));

    // Sample points in concentric circles
    for (let ring = 1; ring <= 3; ring++) {
      const ringRadius = (radius * ring) / 3;
      const pointsInRing = samplePoints * ring;

      for (let i = 0; i < pointsInRing; i++) {
        const angle = (i / pointsInRing) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * ringRadius;
        const z = centerZ + Math.sin(angle) * ringRadius;

        const height = this.terrainManager.getHeightAt(x, z);
        maxHeight = Math.max(maxHeight, height);
      }
    }

    // Sample additional points across the diameter for thoroughness
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x1 = centerX + (t - 0.5) * radius * 2;
      const z1 = centerZ;
      const x2 = centerX;
      const z2 = centerZ + (t - 0.5) * radius * 2;

      maxHeight = Math.max(maxHeight, this.terrainManager.getHeightAt(x1, z1));
      maxHeight = Math.max(maxHeight, this.terrainManager.getHeightAt(x2, z2));
    }

    return maxHeight;
  }

  private clearVegetationArea(centerX: number, centerZ: number, radius: number): void {
    if (!this.vegetationSystem) {
      Logger.info('helicopter', '🚁 No vegetation system available for clearing');
      return;
    }

    // Try to clear vegetation if the system supports it
    if (typeof this.vegetationSystem.clearArea === 'function') {
      this.vegetationSystem.clearArea(centerX, centerZ, radius);
      Logger.info('helicopter', `🚁 Cleared vegetation in ${radius}m radius around helipad`);
    } else if (typeof this.vegetationSystem.addExclusionZone === 'function') {
      this.vegetationSystem.addExclusionZone(centerX, centerZ, radius);
      Logger.info('helicopter', `🚁 Added vegetation exclusion zone around helipad`);
    } else {
      Logger.info('helicopter', '🚁 Vegetation system does not support area clearing');
    }
  }

  private createHelipadGeometry(): THREE.Group {
    const helipadGroup = new THREE.Group();

    // Main circular platform - concrete gray to contrast with olive drab helicopter
    const platformRadius = 12;
    const platformGeometry = new THREE.CylinderGeometry(platformRadius, platformRadius, 0.3, 32);
    const platformMaterial = new THREE.MeshLambertMaterial({
      color: 0x888888, // Light concrete gray (was 0x333333 dark gray)
      transparent: false,
      opacity: 1.0
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.receiveShadow = true;
    helipadGroup.add(platform);

    // White circle border
    const borderGeometry = new THREE.RingGeometry(platformRadius - 0.5, platformRadius, 32);
    const borderMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: false,
      opacity: 1.0
    });
    const border = new THREE.Mesh(borderGeometry, borderMaterial);
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.16;
    helipadGroup.add(border);

    // Center 'H' marking
    const hGeometry = new THREE.PlaneGeometry(6, 8);
    const hMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: false,
      opacity: 1.0
    });

    // Create H shape using two rectangles
    // Vertical bars
    const leftBar = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 8),
      hMaterial.clone()
    );
    leftBar.rotation.x = -Math.PI / 2;
    leftBar.position.set(-2, 0.17, 0);
    helipadGroup.add(leftBar);

    const rightBar = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 8),
      hMaterial.clone()
    );
    rightBar.rotation.x = -Math.PI / 2;
    rightBar.position.set(2, 0.17, 0);
    helipadGroup.add(rightBar);

    // Horizontal cross bar
    const crossBar = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 1.5),
      hMaterial.clone()
    );
    crossBar.rotation.x = -Math.PI / 2;
    crossBar.position.set(0, 0.17, 0);
    helipadGroup.add(crossBar);

    // Add support pillars - match concrete theme
    const pillarGeometry = new THREE.CylinderGeometry(0.8, 0.8, 8, 8);
    const pillarMaterial = new THREE.MeshLambertMaterial({
      color: 0x777777 // Slightly darker concrete gray for pillars
    });

    // Place 4 support pillars
    const pillarPositions = [
      [-6, -4, -6],
      [6, -4, -6],
      [6, -4, 6],
      [-6, -4, 6]
    ];

    pillarPositions.forEach(([x, y, z]) => {
      const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial.clone());
      pillar.position.set(x, y, z);
      helipadGroup.add(pillar);
    });

    // Add some perimeter lights (small spheres)
    const lightGeometry = new THREE.SphereGeometry(0.4, 8, 6);
    const lightMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00
    });

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const lightX = Math.cos(angle) * (platformRadius - 1);
      const lightZ = Math.sin(angle) * (platformRadius - 1);

      const light = new THREE.Mesh(lightGeometry, lightMaterial.clone());
      light.position.set(lightX, 0.5, lightZ);
      helipadGroup.add(light);
    }

    helipadGroup.userData = {
      type: 'helipad',
      faction: 'US',
      id: 'us_helipad'
    };

    return helipadGroup;
  }

  getHelipadPosition(id: string): THREE.Vector3 | null {
    const helipad = this.helipads.get(id);
    return helipad ? helipad.position.clone() : null;
  }

  getAllHelipads(): Array<{ id: string; position: THREE.Vector3; faction: string }> {
    const result: Array<{ id: string; position: THREE.Vector3; faction: string }> = [];

    this.helipads.forEach((helipad, id) => {
      result.push({
        id,
        position: helipad.position.clone(),
        faction: helipad.userData.faction || 'unknown'
      });
    });

    return result;
  }

  update(deltaTime: number): void {
    // Create helipad ONLY in Open Frontier mode
    if (!this.helipads.has('us_helipad') && this.terrainManager && this.gameModeManager) {
      const currentConfig = this.gameModeManager.getCurrentConfig();
      const isOpenFrontier = currentConfig.id === 'open_frontier';

      if (isOpenFrontier) {
        // Open Frontier mode only: at (40, 0, -1400)
        const openFrontierX = 40;
        const openFrontierZ = -1400;
        const testHeight = this.terrainManager.getHeightAt(openFrontierX, openFrontierZ);

        // More robust terrain loading check - ensure terrain chunk is actually loaded
        const helipadWorldPos = new THREE.Vector3(openFrontierX, 0, openFrontierZ);
        const chunk = this.terrainManager.getChunkAt(helipadWorldPos);
        const isChunkLoaded = chunk !== undefined;

        // Create helipad when terrain is properly loaded (height > -100 indicates valid terrain data)
        if ((testHeight > -100 && isChunkLoaded) || testHeight > 0) {
          Logger.info('helicopter', `🚁 Open Frontier mode detected - creating helipad at (${openFrontierX}, ${openFrontierZ}) - terrain height: ${testHeight.toFixed(2)}, chunk loaded: ${isChunkLoaded}`);
          this.createOpenFrontierHelipad();
        }
      }
      // No helicopter in Zone Control mode
    }

    // Future: Could add blinking lights animation here
  }

  dispose(): void {
    this.helipads.forEach(helipad => {
      this.scene.remove(helipad);
      // Dispose of all geometries and materials
      helipad.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });
    this.helipads.clear();
    Logger.info('helicopter', '🧹 HelipadSystem disposed');
  }
}