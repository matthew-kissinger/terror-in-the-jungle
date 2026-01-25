import * as THREE from 'three';
import { Faction } from '../systems/combat/types';

export enum GameMode {
  ZONE_CONTROL = 'zone_control',
  OPEN_FRONTIER = 'open_frontier',
  TEAM_DEATHMATCH = 'tdm'
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

export interface GameModeConfig {
  id: GameMode;
  name: string;
  description: string;

  // World settings
  worldSize: number;
  chunkRenderDistance: number;
  weather?: WeatherConfig;

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
}

// Zone Control - Current smaller scale mode
// Map layout redesigned to reduce center funneling:
//
//            US Base (0, -100)
//           /              \
//      Alpha                Charlie    (staggered forward)
//    (-150, 0)              (150, 0)
//           \              /
//            \            /
//              Bravo       (pushed forward, offset from direct center path)
//             (0, 100)
//           /              \
//      OPFOR Base (0, 220)
//
// This creates multiple approach routes and prevents everything flowing through middle
export const ZONE_CONTROL_CONFIG: GameModeConfig = {
  id: GameMode.ZONE_CONTROL,
  name: 'Zone Control',
  description: 'Fast-paced combat over 3 strategic zones. Control the majority to drain enemy tickets.',

  worldSize: 500,  // Slightly larger to accommodate spread
  chunkRenderDistance: 7,
  weather: {
    enabled: true,
    initialState: WeatherState.LIGHT_RAIN,
    transitionChance: 0.3,
    cycleDuration: { min: 2, max: 5 }
  },

  maxTickets: 300,
  matchDuration: 180, // 3 minutes
  deathPenalty: 2,

  playerCanSpawnAtZones: true,
  respawnTime: 5,
  spawnProtectionDuration: 2,

  maxCombatants: 30,  // 15v15
  squadSize: { min: 2, max: 4 },
  reinforcementInterval: 20,

  captureRadius: 18,  // Slightly larger zones
  captureSpeed: 1,

  minimapScale: 400,
  viewDistance: 180,

  zones: [
    // US Base - pushed back further
    {
      id: 'us_base',
      name: 'US Base',
      position: new THREE.Vector3(0, 0, -100),
      radius: 25,
      isHomeBase: true,
      owner: Faction.US,
      ticketBleedRate: 0
    },
    // OPFOR Base - pushed back further
    {
      id: 'opfor_base',
      name: 'OPFOR Base',
      position: new THREE.Vector3(0, 0, 220),
      radius: 25,
      isHomeBase: true,
      owner: Faction.OPFOR,
      ticketBleedRate: 0
    },
    // Capture Zones - staggered layout, wider apart
    {
      id: 'zone_alpha',
      name: 'Alpha',
      position: new THREE.Vector3(-150, 0, 0),  // West flank, closer to US
      radius: 18,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 1
    },
    {
      id: 'zone_bravo',
      name: 'Bravo',
      position: new THREE.Vector3(0, 0, 100),   // Center but pushed forward toward OPFOR
      radius: 18,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 2
    },
    {
      id: 'zone_charlie',
      name: 'Charlie',
      position: new THREE.Vector3(150, 0, 0),   // East flank, closer to US
      radius: 18,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 1
    }
  ]
};

// Open Frontier - Large scale mode
export const OPEN_FRONTIER_CONFIG: GameModeConfig = {
  id: GameMode.OPEN_FRONTIER,
  name: 'Open Frontier',
  description: 'Large-scale warfare across 10 zones. Spawn at any controlled position and fight for map dominance.',

  worldSize: 3200, // ~2x2 miles
  chunkRenderDistance: 10,
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
  captureSpeed: 0.75,

  minimapScale: 800,
  viewDistance: 300,

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
      name: 'OPFOR Main HQ',
      position: new THREE.Vector3(0, 0, 1400),
      radius: 30,
      isHomeBase: true,
      owner: Faction.OPFOR,
      ticketBleedRate: 0
    },
    {
      id: 'opfor_hq_west',
      name: 'OPFOR West FOB',
      position: new THREE.Vector3(-1000, 0, 800),
      radius: 25,
      isHomeBase: true,
      owner: Faction.OPFOR,
      ticketBleedRate: 0
    },
    {
      id: 'opfor_hq_east',
      name: 'OPFOR East FOB',
      position: new THREE.Vector3(1000, 0, 800),
      radius: 25,
      isHomeBase: true,
      owner: Faction.OPFOR,
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
  ]
};

// Team Deathmatch - Pure combat mode
export const TEAM_DEATHMATCH_CONFIG: GameModeConfig = {
  id: GameMode.TEAM_DEATHMATCH,
  name: 'Team Deathmatch',
  description: 'Pure tactical combat. First team to reach the kill target wins. No zones, no bleed, just skill.',

  worldSize: 400,
  chunkRenderDistance: 6,
  weather: {
    enabled: true,
    initialState: WeatherState.CLEAR,
    transitionChance: 0.25,
    cycleDuration: { min: 3, max: 7 }
  },

  maxTickets: 75, // Using this as kill target
  matchDuration: 300, // 5 minutes
  deathPenalty: 0, // No ticket bleed on death, we track kills separately or use tickets as lives

  playerCanSpawnAtZones: false,
  respawnTime: 5,
  spawnProtectionDuration: 2,

  maxCombatants: 30, // 15v15
  squadSize: { min: 3, max: 5 },
  reinforcementInterval: 15,

  captureRadius: 0,
  captureSpeed: 0,

  minimapScale: 300,
  viewDistance: 150,

  zones: [
    // We still need bases for spawning
    {
      id: 'us_base',
      name: 'US Deployment',
      position: new THREE.Vector3(0, 0, -150),
      radius: 30,
      isHomeBase: true,
      owner: Faction.US,
      ticketBleedRate: 0
    },
    {
      id: 'opfor_base',
      name: 'OPFOR Deployment',
      position: new THREE.Vector3(0, 0, 150),
      radius: 30,
      isHomeBase: true,
      owner: Faction.OPFOR,
      ticketBleedRate: 0
    }
  ]
};

// Helper function to get config by mode
export function getGameModeConfig(mode: GameMode): GameModeConfig {
  switch (mode) {
    case GameMode.ZONE_CONTROL:
      return ZONE_CONTROL_CONFIG;
    case GameMode.OPEN_FRONTIER:
      return OPEN_FRONTIER_CONFIG;
    case GameMode.TEAM_DEATHMATCH:
      return TEAM_DEATHMATCH_CONFIG;
    default:
      return ZONE_CONTROL_CONFIG;
  }
}
