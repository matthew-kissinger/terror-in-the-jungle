import * as THREE from 'three';
import { GameSystem } from '../../types';
import { CombatantSystem } from '../combat/CombatantSystem';
import { Faction, CombatantState } from '../combat/types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { ZoneRenderer } from './ZoneRenderer';
import { ZoneCaptureLogic } from './ZoneCaptureLogic';
import { ZoneTerrainAdapter } from './ZoneTerrainAdapter';
import { GameModeConfig } from '../../config/gameModes';

export enum ZoneState {
  NEUTRAL = 'neutral',
  US_CONTROLLED = 'us_controlled',
  OPFOR_CONTROLLED = 'opfor_controlled',
  CONTESTED = 'contested'
}

export interface CaptureZone {
  id: string;
  name: string;
  position: THREE.Vector3;
  radius: number;
  height: number;

  // Ownership
  owner: Faction | null;
  state: ZoneState;
  captureProgress: number;
  captureSpeed: number;

  // Visual elements
  flagMesh?: THREE.Mesh;
  usFlagMesh?: THREE.Mesh;
  opforFlagMesh?: THREE.Mesh;
  flagPole?: THREE.Mesh;
  zoneMesh?: THREE.Mesh;
  progressRing?: THREE.Mesh;
  labelSprite?: THREE.Sprite;

  // Flag animation state
  currentFlagHeight: number;

  // Strategic value
  isHomeBase: boolean;
  ticketBleedRate: number;
}

export class ZoneManager implements GameSystem {
  private scene: THREE.Scene;
  private zones: Map<string, CaptureZone> = new Map();
  private combatantSystem?: CombatantSystem;
  private chunkManager?: ImprovedChunkManager;
  private playerPosition = new THREE.Vector3();
  private camera?: THREE.Camera;

  // Refactored modules
  private zoneRenderer: ZoneRenderer;
  private captureLogic: ZoneCaptureLogic;
  private terrainAdapter: ZoneTerrainAdapter;

  // Zone configuration
  private gameModeConfig?: GameModeConfig;

  // Zone tracking
  private occupants: Map<string, { us: number; opfor: number }> = new Map();
  private previousZoneState: Map<string, Faction | null> = new Map();
  private hudSystem?: any;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.zoneRenderer = new ZoneRenderer(scene);
    this.captureLogic = new ZoneCaptureLogic();
    this.terrainAdapter = new ZoneTerrainAdapter();
  }

  async init(): Promise<void> {
    console.log('🚩 Initializing Zone Manager...');
    console.log('⏳ Zone Manager initialized, waiting for ChunkManager connection...');
  }

  private createDefaultZones(): void {
    if (!this.gameModeConfig) {
      // Default Zone Control configuration if no mode is set
      const usBasePos = this.terrainAdapter.findSuitableZonePosition(new THREE.Vector3(0, 0, -50), 30);
      const opforBasePos = this.terrainAdapter.findSuitableZonePosition(new THREE.Vector3(0, 0, 145), 30);

      // US Home Base (uncapturable)
      this.createZone({
        id: 'us_base',
        name: 'US Base',
        position: usBasePos,
        owner: Faction.US,
        isHomeBase: true,
        ticketBleedRate: 0
      });

    // OPFOR Home Base (uncapturable)
    this.createZone({
      id: 'opfor_base',
      name: 'OPFOR Base',
      position: opforBasePos,
      owner: Faction.OPFOR,
      isHomeBase: true,
      ticketBleedRate: 0
    });

    // Capturable zones
    const alphaPos = this.terrainAdapter.findSuitableZonePosition(new THREE.Vector3(-120, 0, 50), 40);
    this.createZone({
      id: 'zone_alpha',
      name: 'Alpha',
      position: alphaPos,
      owner: null,
      isHomeBase: false,
      ticketBleedRate: 1
    });

    const bravoPos = this.terrainAdapter.findSuitableZonePosition(new THREE.Vector3(0, 0, 50), 40);
    this.createZone({
      id: 'zone_bravo',
      name: 'Bravo',
      position: bravoPos,
      owner: null,
      isHomeBase: false,
      ticketBleedRate: 2 // Center zone more valuable
    });

    const charliePos = this.terrainAdapter.findSuitableZonePosition(new THREE.Vector3(120, 0, 50), 40);
    this.createZone({
      id: 'zone_charlie',
      name: 'Charlie',
      position: charliePos,
      owner: null,
      isHomeBase: false,
      ticketBleedRate: 1
    });
    }
  }

  private createZone(config: {
    id: string;
    name: string;
    position: THREE.Vector3;
    radius?: number;
    owner: Faction | null;
    isHomeBase: boolean;
    ticketBleedRate: number;
  }): void {
    const zone: CaptureZone = {
      id: config.id,
      name: config.name,
      position: config.position.clone(),
      radius: config.radius || (this.gameModeConfig?.captureRadius || 15),
      height: 20,
      owner: config.owner,
      state: config.owner ?
        (config.owner === Faction.US ? ZoneState.US_CONTROLLED : ZoneState.OPFOR_CONTROLLED) :
        ZoneState.NEUTRAL,
      captureProgress: config.owner ? 100 : 0,
      captureSpeed: this.gameModeConfig?.captureSpeed || 1,
      isHomeBase: config.isHomeBase,
      ticketBleedRate: config.ticketBleedRate,
      currentFlagHeight: 0
    };

    console.log(`📍 Creating zone "${zone.name}" at position (${zone.position.x.toFixed(1)}, ${zone.position.y.toFixed(1)}, ${zone.position.z.toFixed(1)})`);

    // Create visual representation
    this.zoneRenderer.createZoneVisuals(zone);

    // Initialize occupant tracking
    this.occupants.set(zone.id, { us: 0, opfor: 0 });

    this.zones.set(zone.id, zone);
  }

  private updateZonePositions(): void {
    if (!this.chunkManager) return;

    this.zones.forEach(zone => {
      const terrainHeight = this.terrainAdapter.getTerrainHeight(zone.position.x, zone.position.z);
      this.zoneRenderer.updateZonePositions(zone, terrainHeight);
    });
  }

  private updateZoneOccupants(): void {
    // Clear occupant counts
    this.zones.forEach(zone => {
      this.occupants.set(zone.id, { us: 0, opfor: 0 });
    });

    // Check player position
    this.zones.forEach(zone => {
      const distance = this.playerPosition.distanceTo(zone.position);
      if (distance <= zone.radius) {
        const occupants = this.occupants.get(zone.id)!;
        occupants.us += 1; // Player is always US
      }
    });

    // Check combatant positions
    if (this.combatantSystem) {
      const combatants = this.combatantSystem.getAllCombatants();
      combatants.forEach(combatant => {
        // Skip dead combatants only
        if ((combatant as any).state === CombatantState.DEAD || (combatant as any).state === 'dead') return;

        this.zones.forEach(zone => {
          const distance = combatant.position.distanceTo(zone.position);
          if (distance <= zone.radius) {
            const occupants = this.occupants.get(zone.id)!;
            if (combatant.faction === Faction.US) {
              occupants.us += 1;
            } else if (combatant.faction === Faction.OPFOR) {
              occupants.opfor += 1;
            }
          }
        });
      });
    }
  }

  update(deltaTime: number): void {
    // Update player position
    if (this.camera) {
      this.camera.getWorldPosition(this.playerPosition);
    }

    // Update zone positions to match terrain height
    this.updateZonePositions();

    // Update who's in each zone
    this.updateZoneOccupants();

    // Update each zone based on occupants
    this.zones.forEach(zone => {
      const occupants = this.occupants.get(zone.id);
      if (!occupants) return;

      // Track previous state to detect captures
      const previousOwner = this.previousZoneState.get(zone.id);

      // Update capture state
      this.captureLogic.updateZoneCaptureState(zone, occupants, deltaTime);

      // Detect capture by US (player faction)
      if (previousOwner !== Faction.US && zone.owner === Faction.US && !zone.isHomeBase) {
        if (this.hudSystem && typeof this.hudSystem.addZoneCapture === 'function') {
          this.hudSystem.addZoneCapture();
        }
      }

      // Update previous state for next frame
      this.previousZoneState.set(zone.id, zone.owner);

      // Update visuals
      this.zoneRenderer.updateZoneVisuals(zone, occupants);
    });

    // Animate flags
    this.zoneRenderer.animateFlags(this.zones);
  }

  // Public API

  updateOccupants(zoneId: string, usCount: number, opforCount: number): void {
    const occupants = this.occupants.get(zoneId);
    if (occupants) {
      occupants.us = usCount;
      occupants.opfor = opforCount;
    }
  }

  getZoneAtPosition(position: THREE.Vector3): CaptureZone | null {
    for (const zone of this.zones.values()) {
      const distance = position.distanceTo(zone.position);
      if (distance <= zone.radius) {
        return zone;
      }
    }
    return null;
  }

  getAllZones(): CaptureZone[] {
    return Array.from(this.zones.values());
  }

  getZonesByOwner(faction: Faction): CaptureZone[] {
    return Array.from(this.zones.values()).filter(z => z.owner === faction);
  }

  getTicketBleedRate(): { us: number; opfor: number } {
    return this.captureLogic.calculateTicketBleedRate(this.zones);
  }

  getNearestCapturableZone(position: THREE.Vector3, faction?: Faction): CaptureZone | null {
    let nearest: CaptureZone | null = null;
    let minDistance = Infinity;

    this.zones.forEach(zone => {
      if (zone.isHomeBase) return;
      if (faction && zone.owner === faction) return;

      const distance = position.distanceTo(zone.position);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = zone;
      }
    });

    return nearest;
  }

  initializeZones(): void {
    if (this.zones.size === 0 && this.chunkManager) {
      console.log('🚩 Creating zones with terrain mapping...');
      this.createDefaultZones();
      console.log(`✅ Zones created with terrain mapping: ${this.zones.size} zones`);
    }
  }

  // Setters

  setGameModeConfig(config: GameModeConfig): void {
    this.gameModeConfig = config;
    this.clearAllZones();
    this.createZonesFromConfig();
  }

  private clearAllZones(): void {
    this.zones.forEach(zone => {
      this.zoneRenderer.disposeZoneVisuals(zone);
    });
    this.zones.clear();
    this.occupants.clear();
  }

  private createZonesFromConfig(): void {
    if (!this.gameModeConfig) return;

    console.log(`🎮 Creating zones for game mode: ${this.gameModeConfig.name}`);

    for (const zoneConfig of this.gameModeConfig.zones) {
      const position = this.terrainAdapter.findSuitableZonePosition(
        zoneConfig.position,
        zoneConfig.radius
      );

      this.createZone({
        id: zoneConfig.id,
        name: zoneConfig.name,
        position: position,
        radius: zoneConfig.radius,
        owner: zoneConfig.owner,
        isHomeBase: zoneConfig.isHomeBase,
        ticketBleedRate: zoneConfig.ticketBleedRate
      });
    }

    console.log(`✅ Created ${this.zones.size} zones for ${this.gameModeConfig.name}`);
  }

  setCombatantSystem(system: CombatantSystem): void {
    this.combatantSystem = system;
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
    this.terrainAdapter.setChunkManager(chunkManager);
    console.log('🔗 ChunkManager connected to ZoneManager');
  }

  setHUDSystem(hudSystem: any): void {
    this.hudSystem = hudSystem;
  }

  dispose(): void {
    // Clean up visuals
    this.zones.forEach(zone => {
      this.zoneRenderer.disposeZoneVisuals(zone);
    });

    // Dispose renderer
    this.zoneRenderer.dispose();

    this.zones.clear();
    this.occupants.clear();

    console.log('🧹 Zone Manager disposed');
  }
}