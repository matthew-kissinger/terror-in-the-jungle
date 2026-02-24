import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
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
  private terrainManager?: ImprovedChunkManager;
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

  setTerrainManager(terrainManager: ImprovedChunkManager): void {
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
    if (this.isCreatingHelipads) return;
    this.isCreatingHelipads = true;

    const currentConfig = this.gameModeManager?.getCurrentConfig();
    const configHelipads = currentConfig?.helipads;

    if (configHelipads && configHelipads.length > 0) {
      // Create helipads from game mode config
      await Promise.all(configHelipads.map(cfg => this.createHelipad(cfg.id, cfg.position, cfg.aircraft)));
    } else {
      // Legacy fallback: single helipad at anchor position
      const pos = this.getHelipadAnchorPosition();
      await this.createHelipad('us_helipad', pos, 'UH1_HUEY');
    }

    this.isCreatingHelipads = false;

    // Notify map systems about helipad positions
    if (this.onHelipadsCreatedCallback && this.helipadMeta.size > 0) {
      this.onHelipadsCreatedCallback(this.getAllHelipads());
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

  private getHelipadAnchorPosition(): THREE.Vector3 {
    const currentConfig = this.gameModeManager?.getCurrentConfig();
    if (currentConfig && Array.isArray(currentConfig.zones)) {
      const usHomeBases = currentConfig.zones.filter(z => z.isHomeBase && z.owner === 'US');
      if (usHomeBases.length > 0) {
        const preferred = usHomeBases.find(z => z.id.includes('main') || z.id === 'us_base') ?? usHomeBases[0];
        return new THREE.Vector3(preferred.position.x + 40, preferred.position.y, preferred.position.z);
      }
    }
    return new THREE.Vector3(40, 0, -1400);
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

    // Check if terrain is loaded at the first helipad position
    const configHelipads = currentConfig.helipads;
    const checkPos = configHelipads?.[0]?.position ?? this.getHelipadAnchorPosition();
    const testHeight = this.terrainManager.getHeightAt(checkPos.x, checkPos.z);
    const chunk = this.terrainManager.getChunkAt(new THREE.Vector3(checkPos.x, 0, checkPos.z));
    const isChunkLoaded = chunk !== undefined;

    if ((testHeight > -100 && isChunkLoaded) || testHeight > 0) {
      Logger.info('helicopter', `${currentConfig.name} mode - creating ${configHelipads?.length ?? 1} helipads`);
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
