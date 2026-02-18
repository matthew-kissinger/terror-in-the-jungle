import * as THREE from 'three';
import { Faction } from '../systems/combat/types';

export enum GameMode {
  ZONE_CONTROL = 'zone_control',
  OPEN_FRONTIER = 'open_frontier',
  TEAM_DEATHMATCH = 'tdm',
  AI_SANDBOX = 'ai_sandbox',
  A_SHAU_VALLEY = 'a_shau_valley'
}

export enum WeatherState {
  CLEAR = 'clear',
  LIGHT_RAIN = 'light_rain',
  HEAVY_RAIN = 'heavy_rain',
  STORM = 'storm'
}

export interface WeatherConfig {
  enabled: boolean;
  initialState: WeatherState;
  transitionChance: number; // 0-1 chance per minute
  cycleDuration: { min: number; max: number }; // minutes
}

export interface ZoneConfig {
  id: string;
  name: string;
  position: THREE.Vector3;
  radius: number;
  isHomeBase: boolean;
  owner: Faction | null;
  ticketBleedRate: number;
}

export interface SpawnPoint {
  id: string;
  position: THREE.Vector3;
  faction: Faction;
  isHQ: boolean;
}

export interface ScaleConfig {
  aiEngagementRange?: number;       // default 150
  aiVisualRange?: number;           // default 130
  lodHighRange?: number;            // default 200
  lodMediumRange?: number;          // default 400
  lodLowRange?: number;             // default 600
  patrolRadius?: number;            // default 20
  spawnRadius?: { min: number; max: number }; // default {20, 50}
  influenceMapGridSize?: number;    // default 64
  spatialBounds?: number;           // default 4000 (SpatialOctree/GridManager)
}

export interface WarSimulatorConfig {
  enabled: boolean;
  totalAgents: number;
  agentsPerFaction: number;
  materializationRadius: number;    // meters
  dematerializationRadius: number;  // meters (should be > materializationRadius for hysteresis)
  simulatedRadius: number;          // meters
  abstractCombatInterval: number;   // ms
  directorUpdateInterval: number;   // ms
  maxMaterialized: number;          // hard cap
  squadSize: { min: number; max: number };
  reinforcementCooldown: number;    // seconds
}

export interface GameModeConfig {
  id: GameMode;
  name: string;
  description: string;

  // World settings
  worldSize: number;
  chunkRenderDistance: number;
  chunkSize?: number; // Chunk size in world units (default 64)
  weather?: WeatherConfig;

  // Optional DEM terrain source (if absent, use procedural noise)
  heightSource?: {
    type: 'dem';
    path: string;           // e.g. 'data/vietnam/big-map/a-shau-z14-9x9.f32'
    width: number;          // grid pixels
    height: number;         // grid pixels
    metersPerPixel: number;
  };

  // Optional renderer overrides for large/tall terrain
  cameraFar?: number;
  fogDensity?: number;
  shadowFar?: number;
  waterEnabled?: boolean; // Default true; set false to disable global water plane

  // Match settings
  maxTickets: number;
  matchDuration: number; // seconds
  deathPenalty: number; // tickets lost per death

  // Spawning
  playerCanSpawnAtZones: boolean;
  respawnTime: number;
  spawnProtectionDuration: number;

  // Combat
  maxCombatants: number;
  squadSize: { min: number; max: number };
  reinforcementInterval: number;

  // Zones
  zones: ZoneConfig[];
  captureRadius: number;
  captureSpeed: number;

  // Visual settings
  minimapScale: number;
  viewDistance: number;

  // Optional scale overrides for large maps
  scaleConfig?: ScaleConfig;

  // Optional war simulator for persistent large-scale battles
  warSimulator?: WarSimulatorConfig;
}
