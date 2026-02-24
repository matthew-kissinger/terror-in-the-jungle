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
  terrain: {
    defaultBiome: 'denseJungle',
    biomeRules: [
      { biomeId: 'highland',   elevationMin: 15, slopeMax: 45, priority: 3 },
      { biomeId: 'cleared',    elevationMin: 18, slopeMax: 8,  priority: 4 },
      { biomeId: 'tallGrass',  elevationMax: 5,  slopeMax: 10, priority: 2 },
      { biomeId: 'riverbank',  elevationMax: 1,  slopeMax: 15, priority: 5 },
      { biomeId: 'denseJungle', elevationMax: 15, priority: 1 },
    ],
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
