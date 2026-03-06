import * as THREE from 'three';
import { Faction, Alliance } from '../systems/combat/types';
import { TerrainConfig } from './biomes';

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
  visualMargin?: number; // Extra render-only terrain/vegetation overflow beyond playable bounds
  chunkRenderDistance: number;
  chunkSize?: number; // Chunk size in world units (default 64)
  weather?: WeatherConfig;

  // Terrain seed for procedural noise modes. Ignored when heightSource is DEM.
  // 'random' = new seed each match (default for procedural modes).
  // A number = deterministic, same terrain every time.
  terrainSeed?: number | 'random';

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

  // Terrain biome / vegetation configuration
  terrain?: TerrainConfig;

  // Helipad placements - where helicopters spawn on the map
  helipads?: Array<{
    id: string;
    position: THREE.Vector3;
    aircraft: string; // key from AircraftModels (e.g. 'UH1_HUEY')
  }>;

  // Optional war simulator for persistent large-scale battles
  warSimulator?: WarSimulatorConfig;

  // Faction composition per alliance. Defines which factions spawn on each side.
  // If omitted, defaults to { blufor: [US], opfor: [VC] }.
  factionMix?: {
    [Alliance.BLUFOR]: Faction[];
    [Alliance.OPFOR]: Faction[];
  };
}

export type ObjectivePolicyKind = 'zone_control' | 'deathmatch' | 'sandbox' | 'warfront';
export type DeployFlow = 'standard' | 'frontier' | 'air_assault' | 'sandbox';
export type DeployMapVariant = 'standard' | 'frontier';
export type InitialSpawnRule = 'homebase' | 'forward_insertion' | 'origin';
export type RespawnFallbackRule = 'homebase' | 'pressure_front';
export type ContactAssistStyle = 'none' | 'pressure_front';
export type StrategicLayerMode = 'none' | 'optional' | 'required';
export type CommandSurface = 'radial' | 'hybrid' | 'overlay';
export type CommandScale = 'squad' | 'platoon' | 'company' | 'battalion';
export type TeamComposition = 'single_faction' | 'alliance_mix';

export interface ObjectivePolicyConfig {
  kind: ObjectivePolicyKind;
  usesZones: boolean;
  usesTickets: boolean;
  usesWarSimulator: boolean;
}

export interface DeployPolicyConfig {
  flow: DeployFlow;
  mapVariant: DeployMapVariant;
  allowSpawnSelection: boolean;
  allowLoadoutEditingOnRespawn: boolean;
}

export interface RespawnPolicyConfig {
  allowControlledZoneSpawns: boolean;
  initialSpawnRule: InitialSpawnRule;
  fallbackRule: RespawnFallbackRule;
  contactAssistStyle: ContactAssistStyle;
}

export interface MapIntelPolicyConfig {
  tacticalRangeOverride: number | null;
  showStrategicAgentsOnMinimap: boolean;
  showStrategicAgentsOnFullMap: boolean;
  strategicLayer: StrategicLayerMode;
}

export interface CommandProfileConfig {
  quickCommands: boolean;
  surface: CommandSurface;
  scale: CommandScale;
}

export interface TeamRulesConfig {
  ownershipModel: 'alliance';
  composition: TeamComposition;
  playableAlliances: Alliance[];
}

export interface GameModePolicies {
  objective: ObjectivePolicyConfig;
  deploy: DeployPolicyConfig;
  respawn: RespawnPolicyConfig;
  mapIntel: MapIntelPolicyConfig;
  command: CommandProfileConfig;
  teamRules: TeamRulesConfig;
}

export interface GameModeDefinition {
  id: GameMode;
  config: GameModeConfig;
  policies: GameModePolicies;
}

export interface GameLaunchSelection {
  mode: GameMode;
  alliance: Alliance;
  faction: Faction;
}
