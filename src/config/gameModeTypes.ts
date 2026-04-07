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

export interface ScaleConfig {
  aiEngagementRange?: number;       // default 150
  lodHighRange?: number;            // default 200
  lodMediumRange?: number;          // default 400
  lodLowRange?: number;             // default 600
  influenceMapGridSize?: number;    // default 64
  spatialBounds?: number;           // default 4000 (SpatialGridManager)
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
  /** Faction composition per alliance. If omitted, defaults to US vs NVA. */
  factionMix?: {
    [Alliance.BLUFOR]: Faction[];
    [Alliance.OPFOR]: Faction[];
  };
}

type MapFeatureKind = 'helipad' | 'airfield' | 'firebase' | 'village' | 'road';
type TerrainFeatureSurfaceKind = 'packed_earth' | 'runway' | 'dirt_road' | 'gravel_road' | 'jungle_trail';
type TerrainFeatureTargetHeightMode = 'center' | 'average' | 'max';
type AirfieldTemplateId = 'us_airbase' | 'forward_strip';
type MapFeaturePrefabId =
  | 'firebase_us_small'
  | 'firebase_us_medium'
  | 'firebase_artillery_small'
  | 'firebase_hq_small'
  | 'nva_bunker_cluster_small'
  | 'nva_aa_site_small'
  | 'nva_tunnel_camp_small'
  | 'nva_trail_base_small'
  | 'village_cluster_small'
  | 'village_market_small'
  | 'village_riverside_small'
  | 'village_damaged_small'
  | 'supply_depot_small'
  | 'bridge_checkpoint_small'
  | 'crossing_outpost_small'
  | 'motor_pool_small'
  | 'motor_pool_heavy'
  | 'trail_checkpoint_small'
  | 'airstrip_rough_small'
  | 'airfield_support_compound_small';

export interface StaticModelPlacementConfig {
  id?: string;
  modelPath: string;
  offset: THREE.Vector3;
  yaw?: number;
  uniformScale?: number;
  terrainSnap?: boolean;
  /** Snap to terrain height at exact position without searching for flatter ground nearby. */
  skipFlatSearch?: boolean;
  heightOffset?: number;
  registerCollision?: boolean;
}

export interface MapFeatureCircleFootprint {
  shape: 'circle';
  radius: number;
}

export interface MapFeatureRectFootprint {
  shape: 'rect';
  width: number;
  length: number;
}

interface MapFeatureStripFootprint {
  shape: 'strip';
  width: number;
  length: number;
}

interface MapFeaturePolygonFootprint {
  shape: 'polygon';
  points: Array<{ x: number; z: number }>;
}

type MapFeatureFootprint =
  | MapFeatureCircleFootprint
  | MapFeatureRectFootprint
  | MapFeatureStripFootprint
  | MapFeaturePolygonFootprint;

interface TerrainFeaturePlacement {
  yaw?: number;
}

interface TerrainFeatureStampPolicy {
  flatten?: boolean;
  flatRadius?: number;
  blendRadius?: number;
  gradeRadius?: number;
  gradeStrength?: number;
  samplingRadius?: number;
  targetHeightMode?: TerrainFeatureTargetHeightMode;
  heightOffset?: number;
  priority?: number;
}

interface TerrainFeatureVegetationPolicy {
  clear?: boolean;
  exclusionRadius?: number;
}

interface TerrainFeatureSurfacePolicy {
  kind: TerrainFeatureSurfaceKind;
  innerRadius?: number;
  outerRadius?: number;
  width?: number;
  length?: number;
  blend?: number;
}

export interface TerrainFlowPolicyConfig {
  enabled: boolean;
  routeStamping?: 'full' | 'map_only';
  routeWidth?: number;
  routeBlend?: number;
  routeSpacing?: number;
  routeSurface?: TerrainFeatureSurfaceKind;
  routePriority?: number;
  routeTerrainWidthScale?: number;
  routeGradeStrength?: number;
  routeTargetHeightMode?: 'center' | 'average' | 'max';
  zoneShoulderPadding?: number;
  zoneShoulderBlend?: number;
  zoneShoulderGradeStrength?: number;
  zoneShoulderTargetHeightMode?: 'center' | 'average' | 'max';
  homeBaseShoulderTargetHeightMode?: 'center' | 'average' | 'max';
  connectObjectivePairs?: boolean;
  maxRoutesPerAnchor?: number;
}

interface TerrainFeatureGameplayPolicy {
  linkedZoneId?: string;
  spawnIds?: string[];
  owner?: Faction | null;
}

interface MapFeatureBase {
  id: string;
  kind: MapFeatureKind;
  name?: string;
  position: THREE.Vector3;
  placement?: TerrainFeaturePlacement;
  footprint?: MapFeatureFootprint;
  terrain?: TerrainFeatureStampPolicy;
  vegetation?: TerrainFeatureVegetationPolicy;
  surface?: TerrainFeatureSurfacePolicy;
  gameplay?: TerrainFeatureGameplayPolicy;
  prefabId?: MapFeaturePrefabId;
  staticPlacements?: StaticModelPlacementConfig[];
}

export interface HelipadMapFeature extends MapFeatureBase {
  kind: 'helipad';
  aircraft: string;
}

export interface AirfieldMapFeature extends MapFeatureBase {
  kind: 'airfield';
  templateId?: AirfieldTemplateId;
  seedHint?: string;
}

export interface FirebaseMapFeature extends MapFeatureBase {
  kind: 'firebase';
}

export interface VillageMapFeature extends MapFeatureBase {
  kind: 'village';
}

export interface RoadMapFeature extends MapFeatureBase {
  kind: 'road';
}

export type MapFeatureDefinition =
  | HelipadMapFeature
  | AirfieldMapFeature
  | FirebaseMapFeature
  | VillageMapFeature
  | RoadMapFeature;

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

  // Optional terrain-flow policy that derives jungle trails, softened
  // approaches, and map-visible corridor overlays from the active objective
  // topology. Intended for mode-aware route shaping, not hard lane authoring.
  terrainFlow?: TerrainFlowPolicyConfig;

  // Helipad placements - where helicopters spawn on the map
  helipads?: Array<{
    id: string;
    position: THREE.Vector3;
    aircraft: string; // key from AircraftModels (e.g. 'UH1_HUEY')
  }>;

  // Authored map features that can shape terrain, suppress vegetation, and
  // emit runtime structures. Prefer this over adding new top-level fields.
  features?: MapFeatureDefinition[];

  // Pre-baked navmesh asset path (e.g. '/data/navmesh/open_frontier-42.bin').
  // When set, the navmesh is fetched from this path instead of generated at runtime.
  navmeshAsset?: string;

  // Pre-baked heightmap asset path (e.g. '/data/heightmaps/open_frontier-42.f32').
  // When set, the heightmap Float32Array is fetched instead of sampling the noise provider.
  heightmapAsset?: string;

  // Optional war simulator for persistent large-scale battles
  warSimulator?: WarSimulatorConfig;

  // Faction composition per alliance. Defines which factions spawn on each side.
  // If omitted, defaults to { blufor: [US], opfor: [VC] }.
  factionMix?: {
    [Alliance.BLUFOR]: Faction[];
    [Alliance.OPFOR]: Faction[];
  };
}

type ObjectivePolicyKind = 'zone_control' | 'deathmatch' | 'sandbox' | 'warfront';
export type DeployFlow = 'standard' | 'frontier' | 'air_assault' | 'sandbox';
export type DeployMapVariant = 'standard' | 'frontier';
export type InitialSpawnRule = 'homebase' | 'forward_insertion' | 'origin';
export type RespawnFallbackRule = 'homebase' | 'pressure_front';
export type ContactAssistStyle = 'none' | 'pressure_front';
export type StrategicLayerMode = 'none' | 'optional' | 'required';
type CommandSurface = 'radial' | 'hybrid' | 'overlay';
export type CommandScale = 'squad' | 'platoon' | 'company' | 'battalion';
type TeamComposition = 'single_faction' | 'alliance_mix';

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
