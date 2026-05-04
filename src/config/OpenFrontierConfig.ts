import * as THREE from 'three';
import { Faction, Alliance } from '../systems/combat/types';
import { GameMode, GameModeConfig, WeatherState } from './gameModeTypes';

// Open Frontier - Large scale mode
export const OPEN_FRONTIER_CONFIG: GameModeConfig = {
  id: GameMode.OPEN_FRONTIER,
  name: 'Open Frontier',
  description: 'Large-scale warfare across 10 zones. Spawn at any controlled position and fight for map dominance.',

  worldSize: 3200, // ~2x2 miles
  chunkRenderDistance: 10,
  terrainSeed: 42,
  navmeshAsset: '/data/navmesh/open_frontier-42.bin',
  terrain: {
    defaultBiome: 'denseJungle',
    biomeRules: [
      { biomeId: 'tallGrass',  elevationMax: 5,  slopeMax: 10, elevationBlendWidth: 4, priority: 2 },
      { biomeId: 'riverbank',  elevationMax: 1,  slopeMax: 15, elevationBlendWidth: 3, priority: 5 },
    ],
  },
  terrainFlow: {
    enabled: true,
    routeStamping: 'full',
    routeWidth: 22,
    routeBlend: 8,
    routeSpacing: 24,
    routeSurface: 'jungle_trail',
    routePriority: 56,
    zoneShoulderPadding: 14,
    zoneShoulderBlend: 18,
    zoneShoulderGradeStrength: 0.14,
    homeBaseShoulderTargetHeightMode: 'max',
    connectObjectivePairs: true,
    maxRoutesPerAnchor: 4,
  },
  weather: {
    enabled: true,
    initialState: WeatherState.CLEAR,
    transitionChance: 0.2,
    cycleDuration: { min: 5, max: 15 }
  },

  maxTickets: 1000,
  matchDuration: 900, // 15 minutes
  deathPenalty: 3,

  playerCanSpawnAtZones: true,
  respawnTime: 10,
  spawnProtectionDuration: 3,

  maxCombatants: 120,
  squadSize: { min: 4, max: 8 },
  reinforcementInterval: 30,

  captureRadius: 25,
  captureSpeed: 5,

  minimapScale: 800,
  viewDistance: 300,

  features: [
    {
      id: 'helipad_main',
      kind: 'helipad',
      name: 'Main Helipad',
      position: new THREE.Vector3(40, 0, -1400),
      aircraft: 'UH1_HUEY',
      footprint: { shape: 'circle', radius: 12 },
      terrain: {
        flatten: true,
        flatRadius: 8,
        blendRadius: 13,
        samplingRadius: 8,
        targetHeightMode: 'max',
      },
      vegetation: {
        clear: true,
        exclusionRadius: 13,
      },
      surface: {
        kind: 'packed_earth',
        innerRadius: 8,
        outerRadius: 12.5,
      },
    },
    {
      id: 'helipad_west',
      kind: 'helipad',
      name: 'West Helipad',
      position: new THREE.Vector3(-960, 0, -800),
      aircraft: 'UH1C_GUNSHIP',
      footprint: { shape: 'circle', radius: 12 },
      terrain: {
        flatten: true,
        flatRadius: 8,
        blendRadius: 13,
        samplingRadius: 8,
        targetHeightMode: 'max',
      },
      vegetation: {
        clear: true,
        exclusionRadius: 13,
      },
      surface: {
        kind: 'packed_earth',
        innerRadius: 8,
        outerRadius: 12.5,
      },
    },
    {
      id: 'helipad_east',
      kind: 'helipad',
      name: 'East Helipad',
      position: new THREE.Vector3(1040, 0, -800),
      aircraft: 'AH1_COBRA',
      footprint: { shape: 'circle', radius: 12 },
      terrain: {
        flatten: true,
        flatRadius: 8,
        blendRadius: 13,
        samplingRadius: 8,
        targetHeightMode: 'max',
      },
      vegetation: {
        clear: true,
        exclusionRadius: 13,
      },
      surface: {
        kind: 'packed_earth',
        innerRadius: 8,
        outerRadius: 12.5,
      },
    },
    {
      id: 'fob_west_build_now',
      kind: 'firebase',
      name: 'West FOB Compound',
      position: new THREE.Vector3(-1025, 0, -760),
      placement: { yaw: Math.PI },
      footprint: { shape: 'circle', radius: 26 },
      terrain: {
        flatten: true,
        flatRadius: 18,
        blendRadius: 28,
        samplingRadius: 18,
        targetHeightMode: 'max',
      },
      vegetation: {
        clear: true,
        exclusionRadius: 30,
      },
      surface: {
        kind: 'packed_earth',
        innerRadius: 18,
        outerRadius: 24,
      },
      prefabId: 'firebase_us_small',
    },
    {
      id: 'airfield_main',
      kind: 'airfield',
      name: 'Main Airfield',
      position: new THREE.Vector3(320, 0, -1230),
      placement: { yaw: Math.PI * 0.5 },
      templateId: 'us_airbase',
      footprint: { shape: 'circle', radius: 270 },
      terrain: {
        flatten: true,
        gradeStrength: 0.22,
        targetHeightMode: 'center',
      },
      vegetation: {
        clear: true,
        exclusionRadius: 290,
      },
    },
    {
      id: 'airfield_motor_pool',
      kind: 'firebase',
      name: 'Main Motor Pool',
      position: new THREE.Vector3(110, 0, -1090),
      placement: { yaw: Math.PI * 0.48 },
      footprint: { shape: 'circle', radius: 36 },
      terrain: {
        flatten: true,
        flatRadius: 24,
        blendRadius: 38,
        samplingRadius: 22,
        targetHeightMode: 'max',
      },
      vegetation: {
        clear: true,
        exclusionRadius: 40,
      },
      surface: {
        kind: 'packed_earth',
        innerRadius: 24,
        outerRadius: 34,
      },
      prefabId: 'motor_pool_heavy',
    },
    {
      id: 'village_cluster_main',
      kind: 'village',
      name: 'Central Village Cluster',
      position: new THREE.Vector3(-600, 0, 0),
      placement: { yaw: Math.PI * 0.2 },
      footprint: { shape: 'circle', radius: 24 },
      terrain: {
        flatten: true,
        flatRadius: 12,
        blendRadius: 24,
        samplingRadius: 16,
        targetHeightMode: 'average',
      },
      vegetation: {
        clear: true,
        exclusionRadius: 24,
      },
      surface: {
        kind: 'packed_earth',
        innerRadius: 10,
        outerRadius: 18,
      },
      prefabId: 'village_cluster_small',
    },
    {
      id: 'supply_depot_main',
      kind: 'road',
      name: 'Supply Depot Compound',
      position: new THREE.Vector3(-800, 0, -200),
      placement: { yaw: Math.PI * 0.1 },
      footprint: { shape: 'circle', radius: 22 },
      terrain: {
        flatten: true,
        flatRadius: 14,
        blendRadius: 22,
        samplingRadius: 14,
        targetHeightMode: 'max',
      },
      vegetation: {
        clear: true,
        exclusionRadius: 24,
      },
      surface: {
        kind: 'packed_earth',
        innerRadius: 14,
        outerRadius: 20,
      },
      prefabId: 'supply_depot_small',
    },
  ],

  helipads: [
    { id: 'helipad_main', position: new THREE.Vector3(40, 0, -1400), aircraft: 'UH1_HUEY' },
    { id: 'helipad_west', position: new THREE.Vector3(-960, 0, -800), aircraft: 'UH1C_GUNSHIP' },
    { id: 'helipad_east', position: new THREE.Vector3(1040, 0, -800), aircraft: 'AH1_COBRA' },
  ],

  zones: [
    // US HQs
    {
      id: 'us_hq_main',
      name: 'US Main HQ',
      position: new THREE.Vector3(0, 0, -1400),
      radius: 30,
      isHomeBase: true,
      owner: Faction.US,
      ticketBleedRate: 0
    },
    {
      id: 'us_hq_west',
      name: 'US West FOB',
      position: new THREE.Vector3(-1000, 0, -800),
      radius: 25,
      isHomeBase: true,
      owner: Faction.US,
      ticketBleedRate: 0
    },
    {
      id: 'us_hq_east',
      name: 'US East FOB',
      position: new THREE.Vector3(1000, 0, -800),
      radius: 25,
      isHomeBase: true,
      owner: Faction.US,
      ticketBleedRate: 0
    },

    // OPFOR HQs
    {
      id: 'opfor_hq_main',
      name: 'NVA Main HQ',
      position: new THREE.Vector3(0, 0, 1400),
      radius: 30,
      isHomeBase: true,
      owner: Faction.NVA,
      ticketBleedRate: 0
    },
    {
      id: 'opfor_hq_west',
      name: 'NVA West FOB',
      position: new THREE.Vector3(-1000, 0, 800),
      radius: 25,
      isHomeBase: true,
      owner: Faction.NVA,
      ticketBleedRate: 0
    },
    {
      id: 'opfor_hq_east',
      name: 'NVA East FOB',
      position: new THREE.Vector3(1000, 0, 800),
      radius: 25,
      isHomeBase: true,
      owner: Faction.NVA,
      ticketBleedRate: 0
    },

    // Capture Zones - Strategic positions across the map
    {
      id: 'zone_village',
      name: 'Village',
      position: new THREE.Vector3(-600, 0, 0),
      radius: 25,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 2
    },
    {
      id: 'zone_crossroads',
      name: 'Crossroads',
      position: new THREE.Vector3(0, 0, 0),
      radius: 25,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 3 // Most valuable
    },
    {
      id: 'zone_outpost',
      name: 'Outpost',
      position: new THREE.Vector3(600, 0, 0),
      radius: 25,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 2
    },
    {
      id: 'zone_ridge',
      name: 'Ridge',
      position: new THREE.Vector3(-400, 0, -400),
      radius: 25,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 1
    },
    {
      id: 'zone_valley',
      name: 'Valley',
      position: new THREE.Vector3(400, 0, -400),
      radius: 25,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 1
    },
    {
      id: 'zone_hilltop',
      name: 'Hilltop',
      position: new THREE.Vector3(-400, 0, 400),
      radius: 25,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 1
    },
    {
      id: 'zone_ruins',
      name: 'Ruins',
      position: new THREE.Vector3(400, 0, 400),
      radius: 25,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 1
    },
    {
      id: 'zone_bridge_north',
      name: 'North Bridge',
      position: new THREE.Vector3(0, 0, -600),
      radius: 25,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 2
    },
    {
      id: 'zone_bridge_south',
      name: 'South Bridge',
      position: new THREE.Vector3(0, 0, 600),
      radius: 25,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 2
    },
    {
      id: 'zone_depot',
      name: 'Supply Depot',
      position: new THREE.Vector3(-800, 0, -200),
      radius: 25,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 2
    }
  ],
  factionMix: {
    [Alliance.BLUFOR]: [Faction.US, Faction.ARVN],
    [Alliance.OPFOR]: [Faction.NVA, Faction.VC],
  }
};
