import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { CaptureZone, ZoneState } from './ZoneManager';
import { Faction } from '../combat/types';
import { GameModeConfig } from '../../config/gameModes';
import { ZoneRenderer } from './ZoneRenderer';
import { ZoneTerrainAdapter } from './ZoneTerrainAdapter';

export class ZoneInitializer {
  private terrainAdapter: ZoneTerrainAdapter;
  private zoneRenderer: ZoneRenderer;
  private gameModeConfig?: GameModeConfig;

  constructor(
    terrainAdapter: ZoneTerrainAdapter,
    zoneRenderer: ZoneRenderer,
    gameModeConfig?: GameModeConfig
  ) {
    this.terrainAdapter = terrainAdapter;
    this.zoneRenderer = zoneRenderer;
    this.gameModeConfig = gameModeConfig;
  }

  setGameModeConfig(config: GameModeConfig): void {
    this.gameModeConfig = config;
  }

  createDefaultZones(
    zones: Map<string, CaptureZone>,
    occupants: Map<string, { us: number; opfor: number }>
  ): void {
    if (this.gameModeConfig) {
      // If game mode config exists, use it instead
      return;
    }

    // Default Zone Control configuration if no mode is set
    const usBasePos = this.terrainAdapter.findSuitableZonePosition(new THREE.Vector3(0, 0, -50), 30);
    const opforBasePos = this.terrainAdapter.findSuitableZonePosition(new THREE.Vector3(0, 0, 145), 30);

    // US Home Base (uncapturable)
    this.createZone(
      {
        id: 'us_base',
        name: 'US Base',
        position: usBasePos,
        owner: Faction.US,
        isHomeBase: true,
        ticketBleedRate: 0
      },
      zones,
      occupants
    );

    // OPFOR Home Base (uncapturable)
    this.createZone(
      {
        id: 'opfor_base',
        name: 'OPFOR Base',
        position: opforBasePos,
        owner: Faction.OPFOR,
        isHomeBase: true,
        ticketBleedRate: 0
      },
      zones,
      occupants
    );

    // Capturable zones
    const alphaPos = this.terrainAdapter.findSuitableZonePosition(new THREE.Vector3(-120, 0, 50), 40);
    this.createZone(
      {
        id: 'zone_alpha',
        name: 'Alpha',
        position: alphaPos,
        owner: null,
        isHomeBase: false,
        ticketBleedRate: 1
      },
      zones,
      occupants
    );

    const bravoPos = this.terrainAdapter.findSuitableZonePosition(new THREE.Vector3(0, 0, 50), 40);
    this.createZone(
      {
        id: 'zone_bravo',
        name: 'Bravo',
        position: bravoPos,
        owner: null,
        isHomeBase: false,
        ticketBleedRate: 2 // Center zone more valuable
      },
      zones,
      occupants
    );

    const charliePos = this.terrainAdapter.findSuitableZonePosition(new THREE.Vector3(120, 0, 50), 40);
    this.createZone(
      {
        id: 'zone_charlie',
        name: 'Charlie',
        position: charliePos,
        owner: null,
        isHomeBase: false,
        ticketBleedRate: 1
      },
      zones,
      occupants
    );
  }

  createZone(
    config: {
      id: string;
      name: string;
      position: THREE.Vector3;
      radius?: number;
      owner: Faction | null;
      isHomeBase: boolean;
      ticketBleedRate: number;
    },
    zones: Map<string, CaptureZone>,
    occupants: Map<string, { us: number; opfor: number }>
  ): void {
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

    Logger.info('world', `📍 Creating zone "${zone.name}" at position (${zone.position.x.toFixed(1)}, ${zone.position.y.toFixed(1)}, ${zone.position.z.toFixed(1)})`);

    // Create visual representation
    this.zoneRenderer.createZoneVisuals(zone);

    // Initialize occupant tracking
    occupants.set(zone.id, { us: 0, opfor: 0 });

    zones.set(zone.id, zone);
  }

  createZonesFromConfig(
    zones: Map<string, CaptureZone>,
    occupants: Map<string, { us: number; opfor: number }>
  ): void {
    if (!this.gameModeConfig) return;

    Logger.info('world', `🎮 Creating zones for game mode: ${this.gameModeConfig.name}`);

    for (const zoneConfig of this.gameModeConfig.zones) {
      const position = this.terrainAdapter.findSuitableZonePosition(
        zoneConfig.position,
        zoneConfig.radius
      );

      this.createZone(
        {
          id: zoneConfig.id,
          name: zoneConfig.name,
          position: position,
          radius: zoneConfig.radius,
          owner: zoneConfig.owner,
          isHomeBase: zoneConfig.isHomeBase,
          ticketBleedRate: zoneConfig.ticketBleedRate
        },
        zones,
        occupants
      );
    }

    Logger.info('world', `✅ Created ${zones.size} zones for ${this.gameModeConfig.name}`);
  }
}
