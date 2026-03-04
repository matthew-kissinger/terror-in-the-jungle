import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { GameModeManager } from '../world/GameModeManager';
import { modelLoader } from '../assets/ModelLoader';
import { StructureModels } from '../assets/modelPaths';

export interface HelipadInfo {
  id: string;
  position: THREE.Vector3;
  aircraft: string;
  faction: string;
}

export class HelipadSystem implements GameSystem {
  private scene: THREE.Scene;
  private terrainManager?: ITerrainRuntime;
  private vegetationSystem?: { clearArea?: (x: number, z: number, radius: number) => void; addExclusionZone?: (x: number, z: number, radius: number) => void };
  private gameModeManager?: GameModeManager;
  private helipads: Map<string, THREE.Group> = new Map();
  private helipadMeta: Map<string, HelipadInfo> = new Map();
  private onHelipadsCreatedCallback?: (helipads: HelipadInfo[]) => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async init(): Promise<void> {
    Logger.info('helicopter', 'Initializing Helipad System...');
  }

  setTerrainManager(terrainManager: ITerrainRuntime): void {
    this.terrainManager = terrainManager;
  }

  setVegetationSystem(vegetationSystem: { clearArea?: (x: number, z: number, radius: number) => void; addExclusionZone?: (x: number, z: number, radius: number) => void }): void {
    this.vegetationSystem = vegetationSystem;
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
  }

  onHelipadsCreated(callback: (helipads: HelipadInfo[]) => void): void {
    this.onHelipadsCreatedCallback = callback;
  }

  createHelipadWhenReady(): void {
    if (!this.isCreatingHelipads && this.helipads.size === 0) {
      void this.createAllHelipads();
    }
  }

  private isCreatingHelipads = false;

  private async createAllHelipads(): Promise<void> {
    if (!this.terrainManager) {
      Logger.warn('helicopter', 'Cannot create helipads - terrain manager not available');
      return;
    }
    if (!this.gameModeManager) {
      Logger.warn('helicopter', 'Cannot create helipads - game mode manager not available');
      return;
    }
    if (this.isCreatingHelipads) return;
    this.isCreatingHelipads = true;

    try {
      const currentConfig = this.gameModeManager.getCurrentConfig();
      const configHelipads = currentConfig.helipads ?? [];

      if (configHelipads.length === 0) {
        Logger.info('helicopter', `No helipads configured for mode "${currentConfig.id}"`);
        return;
      }

      await Promise.all(configHelipads.map(cfg => this.createHelipad(cfg.id, cfg.position, cfg.aircraft)));

      if (this.onHelipadsCreatedCallback && this.helipadMeta.size > 0) {
        this.onHelipadsCreatedCallback(this.getAllHelipads());
      }
    } finally {
      this.isCreatingHelipads = false;
    }
  }

  private async createHelipad(id: string, configPosition: THREE.Vector3, aircraft: string): Promise<void> {
    if (!this.terrainManager) return;
    if (this.helipads.has(id)) return;

    const helipadPosition = configPosition.clone();

    // Find the highest terrain point within the platform area
    const platformRadius = 12;
    const maxHeight = this.findMaxTerrainHeight(helipadPosition.x, helipadPosition.z, platformRadius);
    helipadPosition.y = maxHeight + 0.1; // Flush with terrain

    const helipad = await this.loadHelipadModel();
    helipad.position.copy(helipadPosition);

    this.scene.add(helipad);
    this.helipads.set(id, helipad);
    this.helipadMeta.set(id, { id, position: helipadPosition.clone(), aircraft, faction: 'US' });

    // Register helipad for collision detection
    this.terrainManager.registerCollisionObject(id, helipad);

    // Clear vegetation around helipad
    this.clearVegetationArea(helipadPosition.x, helipadPosition.z, platformRadius + 1);

    Logger.info('helicopter', `Created helipad "${id}" at (${helipadPosition.x.toFixed(0)}, ${helipadPosition.y.toFixed(1)}, ${helipadPosition.z.toFixed(0)}) aircraft=${aircraft}`);
  }

  private findMaxTerrainHeight(centerX: number, centerZ: number, radius: number): number {
    if (!this.terrainManager) return 0;

    let maxHeight = -Infinity;
    const samplePoints = 16;

    maxHeight = Math.max(maxHeight, this.terrainManager.getHeightAt(centerX, centerZ));

    for (let ring = 1; ring <= 3; ring++) {
      const ringRadius = (radius * ring) / 3;
      const pointsInRing = samplePoints * ring;
      for (let i = 0; i < pointsInRing; i++) {
        const angle = (i / pointsInRing) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * ringRadius;
        const z = centerZ + Math.sin(angle) * ringRadius;
        maxHeight = Math.max(maxHeight, this.terrainManager.getHeightAt(x, z));
      }
    }

    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      maxHeight = Math.max(maxHeight, this.terrainManager.getHeightAt(centerX + (t - 0.5) * radius * 2, centerZ));
      maxHeight = Math.max(maxHeight, this.terrainManager.getHeightAt(centerX, centerZ + (t - 0.5) * radius * 2));
    }

    return maxHeight;
  }

  private clearVegetationArea(centerX: number, centerZ: number, radius: number): void {
    if (!this.vegetationSystem) return;

    if (typeof this.vegetationSystem.clearArea === 'function') {
      this.vegetationSystem.clearArea(centerX, centerZ, radius);
    } else if (typeof this.vegetationSystem.addExclusionZone === 'function') {
      this.vegetationSystem.addExclusionZone(centerX, centerZ, radius);
    }
  }

  private async loadHelipadModel(): Promise<THREE.Group> {
    const scene = await modelLoader.loadModel(StructureModels.HELIPAD);

    const helipadGroup = new THREE.Group();
    helipadGroup.add(scene);

    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.receiveShadow = true;
      }
    });

    helipadGroup.userData = {
      type: 'helipad',
      faction: 'US',
    };

    return helipadGroup;
  }

  getHelipadPosition(id: string): THREE.Vector3 | null {
    const helipad = this.helipads.get(id);
    return helipad ? helipad.position.clone() : null;
  }

  getHelipadInfo(id: string): HelipadInfo | undefined {
    return this.helipadMeta.get(id);
  }

  getAllHelipads(): HelipadInfo[] {
    return Array.from(this.helipadMeta.values());
  }

  update(_deltaTime: number): void {
    if (this.helipads.size > 0 || this.isCreatingHelipads || !this.terrainManager || !this.gameModeManager) return;

    const currentConfig = this.gameModeManager.getCurrentConfig();
    const supportsHelipad = currentConfig.id === 'open_frontier' || currentConfig.id === 'a_shau_valley';
    if (!supportsHelipad) return;
    if (!currentConfig.helipads || currentConfig.helipads.length === 0) return;

    // Check if terrain is loaded at the first helipad position
    const configHelipads = currentConfig.helipads;
    const checkPos = configHelipads[0].position;
    const testHeight = this.terrainManager.getHeightAt(checkPos.x, checkPos.z);
    const hasTerrain = this.terrainManager.isTerrainReady() && this.terrainManager.hasTerrainAt(checkPos.x, checkPos.z);

    if ((testHeight > -100 && hasTerrain) || testHeight > 0) {
      Logger.info('helicopter', `${currentConfig.name} mode - creating ${configHelipads.length} helipads`);
      void this.createAllHelipads();
    }
  }

  dispose(): void {
    this.helipads.forEach((helipad, id) => {
      this.scene.remove(helipad);
      if (this.terrainManager) {
        this.terrainManager.unregisterCollisionObject(id);
      }
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
    this.helipadMeta.clear();
    Logger.info('helicopter', 'HelipadSystem disposed');
  }
}
