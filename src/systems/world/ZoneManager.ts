import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { GameSystem } from '../../types';
import { CombatantSystem } from '../combat/CombatantSystem';
import { Faction, CombatantState } from '../combat/types';
import { spatialGridManager, SpatialGridManager } from '../combat/SpatialGridManager';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { ZoneRenderer } from './ZoneRenderer';
import { ZoneCaptureLogic } from './ZoneCaptureLogic';
import { ZoneTerrainAdapter } from './ZoneTerrainAdapter';
import { ZoneInitializer } from './ZoneInitializer';
import { GameModeConfig } from '../../config/gameModes';
import { IHUDSystem } from '../../types/SystemInterfaces';

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
  private spatialGridManager: SpatialGridManager = spatialGridManager;
  private playerPosition = new THREE.Vector3();
  private camera?: THREE.Camera;

  // Refactored modules
  private zoneRenderer: ZoneRenderer;
  private captureLogic: ZoneCaptureLogic;
  private terrainAdapter: ZoneTerrainAdapter;
  private zoneInitializer: ZoneInitializer;

  // Zone configuration
  private gameModeConfig?: GameModeConfig;

  // Zone tracking
  private occupants: Map<string, { us: number; opfor: number }> = new Map();
  private previousZoneState: Map<string, Faction | null> = new Map();
  private hudSystem?: IHUDSystem;

  // Optimization: Throttle occupant updates
  private lastOccupantUpdateTime = 0;
  private readonly OCCUPANT_UPDATE_INTERVAL = 0.1; // 100ms update rate for zone occupants

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.zoneRenderer = new ZoneRenderer(scene);
    this.captureLogic = new ZoneCaptureLogic();
    this.terrainAdapter = new ZoneTerrainAdapter();
    this.zoneInitializer = new ZoneInitializer(this.terrainAdapter, this.zoneRenderer);
  }

  async init(): Promise<void> {
    Logger.info('world', ' Initializing Zone Manager...');
    Logger.info('world', ' Zone Manager initialized, waiting for ChunkManager connection...');
  }


  private updateZonePositions(): void {
    if (!this.chunkManager) return;

    this.zones.forEach(zone => {
      const terrainHeight = this.terrainAdapter.getTerrainHeight(zone.position.x, zone.position.z);
      this.zoneRenderer.updateZonePositions(zone, terrainHeight);
    });
  }

  private updateZoneOccupants(): void {
    if (!this.combatantSystem) {
      // Fallback: Check only player position if combatant system not connected
      for (const zone of this.zones.values()) {
        const occupants = { us: 0, opfor: 0 };
        if (this.playerPosition.distanceTo(zone.position) <= zone.radius) {
          occupants.us = 1;
        }
        this.occupants.set(zone.id, occupants);
      }
      return;
    }

    const combatants = this.combatantSystem.combatants;

    // Use spatial grid to query combatants near each zone - O(zones * nearby_entities)
    for (const zone of this.zones.values()) {
      const occupants = { us: 0, opfor: 0 };

      // Optimized spatial query: find combatant IDs within zone radius
      // Note: This includes the 'player_proxy' which correctly counts the player as Faction.US
      const nearbyIds = this.spatialGridManager.queryRadius(zone.position, zone.radius);
      
      for (const id of nearbyIds) {
        const combatant = combatants.get(id);
        if (!combatant) continue;

        // Skip dead combatants (state can be enum or string depending on version)
        if (combatant.state === CombatantState.DEAD || (combatant as any).state === 'dead') continue;

        if (combatant.faction === Faction.US) {
          occupants.us++;
        } else if (combatant.faction === Faction.OPFOR) {
          occupants.opfor++;
        }
      }

      this.occupants.set(zone.id, occupants);
    }
  }

  update(deltaTime: number): void {
    // Update player position
    if (this.camera) {
      this.camera.getWorldPosition(this.playerPosition);
    }

    // Update zone positions to match terrain height
    this.updateZonePositions();

    // Update who's in each zone (throttled for performance)
    this.lastOccupantUpdateTime += deltaTime;
    if (this.lastOccupantUpdateTime >= this.OCCUPANT_UPDATE_INTERVAL) {
      this.updateZoneOccupants();
      this.lastOccupantUpdateTime = 0;
    }

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
          this.hudSystem.addZoneCapture(zone.name, false);
        }
      }

      // Detect zone lost by US (captured by OPFOR)
      if (previousOwner === Faction.US && zone.owner === Faction.OPFOR && !zone.isHomeBase) {
        if (this.hudSystem && typeof this.hudSystem.addZoneCapture === 'function') {
          this.hudSystem.addZoneCapture(zone.name, true);
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
      Logger.info('world', ' Creating zones with terrain mapping...');
      this.zoneInitializer.createDefaultZones(this.zones, this.occupants);
      Logger.info('world', ` Zones created with terrain mapping: ${this.zones.size} zones`);
    }
  }

  // Setters

  setGameModeConfig(config: GameModeConfig): void {
    this.gameModeConfig = config;
    this.zoneInitializer.setGameModeConfig(config);
    this.clearAllZones();
    this.zoneInitializer.createZonesFromConfig(this.zones, this.occupants);
  }

  private clearAllZones(): void {
    this.zones.forEach(zone => {
      this.zoneRenderer.disposeZoneVisuals(zone);
    });
    this.zones.clear();
    this.occupants.clear();
  }


  setCombatantSystem(system: CombatantSystem): void {
    this.combatantSystem = system;
  }

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  setChunkManager(chunkManager: ImprovedChunkManager): void {
    this.chunkManager = chunkManager;
    this.terrainAdapter.setChunkManager();
    Logger.info('world', 'ChunkManager connected to ZoneManager');
  }

  setSpatialGridManager(manager: SpatialGridManager): void {
    this.spatialGridManager = manager;
  }

  setHUDSystem(hudSystem: IHUDSystem): void {
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

    Logger.info('world', 'Zone Manager disposed');
  }
}
