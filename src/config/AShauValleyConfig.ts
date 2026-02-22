import * as THREE from 'three';
import { Faction } from '../systems/combat/types';
import { GameMode, GameModeConfig, WeatherState } from './gameModeTypes';

/**
 * DEM metadata from a-shau-z14-9x9.f32.meta.json
 */
const DEM_WIDTH = 2304;
const DEM_HEIGHT = 2304;
const DEM_METERS_PER_PIXEL = 9;
const DEM_COVERAGE_METERS = 21136;

// Geo bounds for coordinate conversion
const GEO_BOUNDS = {
  north: 16.320139453117566,
  south: 16.130262012034756,
  west: 107.07275390625,
  east: 107.2705078125
};

/**
 * Convert lat/lon to world coordinates.
 * World origin (0,0) = center of DEM.
 * X axis = east, Z axis = south (Three.js convention).
 */
function geoToWorld(lat: number, lon: number): THREE.Vector3 {
  const centerLat = (GEO_BOUNDS.north + GEO_BOUNDS.south) / 2;
  const centerLon = (GEO_BOUNDS.west + GEO_BOUNDS.east) / 2;

  // Approximate meters per degree at this latitude
  const latScale = 111320; // meters per degree latitude
  const lonScale = 111320 * Math.cos(centerLat * Math.PI / 180);

  const x = (lon - centerLon) * lonScale;
  const z = -(lat - centerLat) * latScale; // Negate: north is -Z in Three.js

  return new THREE.Vector3(x, 0, z);
}

/**
 * A Shau Valley - Historical Vietnam War Campaign
 *
 * 21km x 21km area of the A Shau Valley, Thua Thien Province.
 * Real DEM elevation data. The valley was a critical NVA logistics corridor
 * connecting the Ho Chi Minh Trail to coastal population centers. The NVA
 * maintained base areas, supply depots, and anti-aircraft positions throughout.
 * US forces conducted repeated air assault operations to disrupt NVA logistics:
 * - 1966: SF Camp A Shau overrun by NVA regiment
 * - 1968: Operation Delaware - 1st Cavalry air assaults into valley floor
 * - 1969: Operation Apache Snow - 10 days of fighting for Hill 937 (Hamburger Hill)
 * - 1970: Firebase Ripcord - 23 days under siege, last major US battle
 *
 * Force ratio: NVA held 2-3 regiment strength (3000-6000 troops) in the valley
 * at any given time. US committed brigade-strength (1500-3000) during operations.
 * NVA advantage: fortified ridgeline positions, bunker complexes, tunnel systems.
 * US advantage: air mobility (helicopter assault), artillery, air support.
 *
 * Gameplay: The NVA begins entrenched across the valley with supply lines intact.
 * US forces assault from LZs on the eastern ridgeline. The player fights uphill
 * through triple-canopy jungle toward fortified NVA positions. The war simulator
 * drives 3000 agents in a persistent campaign across the full 21km battlefield.
 *
 * Elevation range: 373m - 1902m (1530m relief)
 * Valley floor: ~580m
 * Hill 937: 937m (center of map)
 */
export const A_SHAU_VALLEY_CONFIG: GameModeConfig = {
  id: GameMode.A_SHAU_VALLEY,
  name: 'A Shau Valley',
  description: 'Historical Vietnam campaign. 3000 soldiers fight across 21km of real terrain. Persistent war with save/resume.',

  worldSize: DEM_COVERAGE_METERS,
  chunkRenderDistance: 6,
  chunkSize: 256,
  weather: {
    enabled: true,
    initialState: WeatherState.LIGHT_RAIN,
    transitionChance: 0.3,
    cycleDuration: { min: 3, max: 10 }
  },

  heightSource: {
    type: 'dem',
    path: 'data/vietnam/big-map/a-shau-z14-9x9.f32',
    width: DEM_WIDTH,
    height: DEM_HEIGHT,
    metersPerPixel: DEM_METERS_PER_PIXEL
  },

  // Renderer overrides for tall terrain
  cameraFar: 4000,
  fogDensity: 0.001,
  shadowFar: 500,
  waterEnabled: false, // No global water plane - area has streams, not lakes

  // Campaign tickets - high count for extended persistent play
  maxTickets: 5000,
  matchDuration: 3600, // 60 minutes (save/resume makes this a session length, not match length)
  deathPenalty: 2,

  playerCanSpawnAtZones: true,
  respawnTime: 12,
  spawnProtectionDuration: 4,

  // maxCombatants is for the CombatantSystem (materialized only).
  // The WarSimulator handles the full 3000 agents above this.
  maxCombatants: 60,
  squadSize: { min: 8, max: 12 },
  reinforcementInterval: 60,

  captureRadius: 50,
  captureSpeed: 3.5,

  minimapScale: 3000,
  viewDistance: 600,

  // Scale overrides for 21km battlefield
  scaleConfig: {
    aiEngagementRange: 200,
    aiVisualRange: 180,
    lodHighRange: 300,
    lodMediumRange: 600,
    lodLowRange: 1000,
    patrolRadius: 60,
    spawnRadius: { min: 30, max: 80 },
    influenceMapGridSize: 128,
    spatialBounds: 22000
  },

  // War simulator: 3000 agents, persistent campaign
  // NVA has slight numerical advantage reflecting their entrenched position.
  // US compensates through materialized combat quality (better AI skill profiles).
  warSimulator: {
    enabled: true,
    totalAgents: 3000,
    agentsPerFaction: 1500,
    materializationRadius: 800,
    dematerializationRadius: 900,   // 100m hysteresis prevents thrashing
    simulatedRadius: 3000,
    abstractCombatInterval: 2000,
    directorUpdateInterval: 5000,
    maxMaterialized: 60,
    squadSize: { min: 8, max: 12 },
    reinforcementCooldown: 90
  },

  zones: [
    // ===== US Landing Zones (eastern ridgeline) =====
    // US forces insert via helicopter to LZs on the eastern side,
    // then push west/northwest into the valley.

    {
      id: 'us_base',
      name: 'LZ Goodman',
      position: geoToWorld(16.23, 107.15),
      radius: 45,
      isHomeBase: true,
      owner: Faction.US,
      ticketBleedRate: 0
    },
    {
      id: 'us_hq_east',
      name: 'LZ Stallion',
      position: geoToWorld(16.24, 107.20),
      radius: 40,
      isHomeBase: true,
      owner: Faction.US,
      ticketBleedRate: 0
    },
    {
      id: 'us_hq_south',
      name: 'LZ Eagle',
      position: geoToWorld(16.17, 107.19),
      radius: 35,
      isHomeBase: true,
      owner: Faction.US,
      ticketBleedRate: 0
    },

    // ===== NVA Base Areas (western mountains + valley floor) =====
    // The NVA maintained base areas along the Laotian border (west)
    // and controlled the valley floor supply corridor.

    {
      id: 'opfor_hq_main',
      name: 'Base Area 611',
      position: geoToWorld(16.25, 107.10),
      radius: 50,
      isHomeBase: true,
      owner: Faction.OPFOR,
      ticketBleedRate: 0
    },
    {
      id: 'opfor_hq_north',
      name: 'Base Area 607',
      position: geoToWorld(16.30, 107.12),
      radius: 45,
      isHomeBase: true,
      owner: Faction.OPFOR,
      ticketBleedRate: 0
    },
    {
      id: 'opfor_hq_south',
      name: 'NVA Supply Depot',
      position: geoToWorld(16.15, 107.10),
      radius: 40,
      isHomeBase: true,
      owner: Faction.OPFOR,
      ticketBleedRate: 0
    },

    // ===== Strategic Objectives =====
    // These are the contested positions that drove the real battles.
    // Capturing them cuts NVA supply lines and establishes US presence.

    // Hill 937 (Hamburger Hill) - the most iconic objective.
    // Steep jungle-covered ridgeline. NVA had fortified bunker complex.
    // Took 10 assaults over 10 days in May 1969.
    {
      id: 'zone_hill937',
      name: 'Hill 937 (Hamburger Hill)',
      position: geoToWorld(16.233, 107.177),
      radius: 60,
      isHomeBase: false,
      owner: null,                   // Contested - the central prize
      ticketBleedRate: 6
    },

    // Ta Bat Airfield - old French airstrip on valley floor.
    // Key logistics node. NVA used it as a staging area.
    {
      id: 'zone_tabat',
      name: 'Ta Bat Airfield',
      position: geoToWorld(16.27, 107.16),
      radius: 50,
      isHomeBase: false,
      owner: Faction.OPFOR,          // NVA controls valley floor
      ticketBleedRate: 4
    },

    // A Luoi Airfield - another French-era strip, further south.
    // Operation Delaware's primary objective in 1968.
    {
      id: 'zone_aluoi',
      name: 'A Luoi Airfield',
      position: geoToWorld(16.20, 107.19),
      radius: 45,
      isHomeBase: false,
      owner: null,                   // Contested - valley floor fight
      ticketBleedRate: 4
    },

    // Firebase Ripcord - hilltop firebase, site of the 1970 siege.
    // Overlooks the valley; critical for artillery support.
    {
      id: 'zone_ripcord',
      name: 'Firebase Ripcord',
      position: geoToWorld(16.17, 107.23),
      radius: 40,
      isHomeBase: false,
      owner: Faction.US,             // US established firebase
      ticketBleedRate: 4
    },

    // Firebase Blaze - ridgeline firebase supporting operations.
    {
      id: 'zone_blaze',
      name: 'Firebase Blaze',
      position: geoToWorld(16.22, 107.25),
      radius: 35,
      isHomeBase: false,
      owner: Faction.US,             // US established firebase
      ticketBleedRate: 3
    },

    // SF Camp A Shau - the original Special Forces camp overrun in 1966.
    // On the valley floor near the southern end.
    {
      id: 'zone_sf_camp',
      name: 'SF Camp A Shau',
      position: geoToWorld(16.16, 107.14),
      radius: 40,
      isHomeBase: false,
      owner: Faction.OPFOR,          // NVA overran it in 1966
      ticketBleedRate: 3
    },

    // LZ Pepper - helicopter landing zone on eastern approach.
    {
      id: 'zone_pepper',
      name: 'LZ Pepper',
      position: geoToWorld(16.21, 107.22),
      radius: 35,
      isHomeBase: false,
      owner: Faction.US,             // US controls eastern approach
      ticketBleedRate: 2
    },

    // Tiger Mountain - dominating terrain feature, NVA observation post.
    {
      id: 'zone_tiger',
      name: 'Tiger Mountain',
      position: geoToWorld(16.19, 107.13),
      radius: 40,
      isHomeBase: false,
      owner: Faction.OPFOR,
      ticketBleedRate: 3
    },

    // Dong So Ridge - northern ridgeline overlooking valley.
    {
      id: 'zone_dong_so',
      name: 'Dong So Ridge',
      position: geoToWorld(16.26, 107.25),
      radius: 35,
      isHomeBase: false,
      owner: Faction.US,             // US controls eastern ridgeline
      ticketBleedRate: 2
    },

    // NVA Trail Junction - where Ho Chi Minh Trail branches enter the valley.
    // Capturing this cuts NVA reinforcement flow.
    {
      id: 'zone_trail_junction',
      name: 'Trail Junction',
      position: geoToWorld(16.22, 107.11),
      radius: 45,
      isHomeBase: false,
      owner: Faction.OPFOR,
      ticketBleedRate: 5
    },

    // Hill 996 - ridgeline position north of Hamburger Hill.
    // NVA used it to stage counterattacks during Apache Snow.
    {
      id: 'zone_hill996',
      name: 'Hill 996',
      position: geoToWorld(16.25, 107.18),
      radius: 35,
      isHomeBase: false,
      owner: Faction.OPFOR,
      ticketBleedRate: 3
    },

    // Firebase Cannon - northern firebase supporting operations.
    {
      id: 'zone_cannon',
      name: 'Firebase Cannon',
      position: geoToWorld(16.28, 107.22),
      radius: 35,
      isHomeBase: false,
      owner: null,                   // Contested from the start
      ticketBleedRate: 2
    }
  ]
};
