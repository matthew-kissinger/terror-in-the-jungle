import * as THREE from 'three';
import { Faction } from '../systems/combat/types';
import { GameMode, GameModeConfig, WeatherState } from './gameModeTypes';

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
  chunkRenderDistance: 8,  // Increased to push terrain edge further with height fog
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

  maxCombatants: 20,  // 10v10
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
