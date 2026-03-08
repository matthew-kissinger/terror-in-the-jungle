import * as THREE from 'three';
import { Faction, Alliance } from '../systems/combat/types';
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

  worldSize: 500,
  visualMargin: 320,
  chunkRenderDistance: 5,
  terrainSeed: 'random',
  terrain: {
    defaultBiome: 'denseJungle',
    biomeRules: [
      { biomeId: 'highland',   elevationMin: 15, slopeMax: 45, priority: 3 },
      { biomeId: 'tallGrass',  elevationMax: 5,  slopeMax: 10, priority: 2 },
      { biomeId: 'denseJungle', elevationMax: 15, priority: 1 },
    ],
  },
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
  captureSpeed: 7,

  minimapScale: 400,
  viewDistance: 180,

  features: [
    // US firebase near home base
    {
      id: 'firebase_us',
      kind: 'firebase' as const,
      name: 'US Firebase',
      position: new THREE.Vector3(0, 0, -95),
      placement: { yaw: Math.PI },
      footprint: { shape: 'circle' as const, radius: 26 },
      terrain: {
        flatten: true,
        flatRadius: 18,
        blendRadius: 28,
        samplingRadius: 18,
        targetHeightMode: 'max' as const,
      },
      vegetation: { clear: true, exclusionRadius: 30 },
      surface: { kind: 'packed_earth' as const, innerRadius: 18, outerRadius: 24 },
      prefabId: 'firebase_us_small' as const,
    },
    // NVA bunker cluster at OPFOR base
    {
      id: 'nva_bunkers',
      kind: 'firebase' as const,
      name: 'NVA Bunker Cluster',
      position: new THREE.Vector3(0, 0, 215),
      placement: { yaw: 0 },
      footprint: { shape: 'circle' as const, radius: 22 },
      terrain: {
        flatten: true,
        flatRadius: 14,
        blendRadius: 22,
        samplingRadius: 14,
        targetHeightMode: 'max' as const,
      },
      vegetation: { clear: true, exclusionRadius: 24 },
      surface: { kind: 'packed_earth' as const, innerRadius: 14, outerRadius: 20 },
      prefabId: 'nva_bunker_cluster_small' as const,
    },
    // Village near zone Alpha (west)
    {
      id: 'village_alpha',
      kind: 'village' as const,
      name: 'West Village',
      position: new THREE.Vector3(-145, 0, 5),
      placement: { yaw: Math.PI * 0.3 },
      footprint: { shape: 'circle' as const, radius: 20 },
      terrain: {
        flatten: true,
        flatRadius: 10,
        blendRadius: 20,
        samplingRadius: 12,
        targetHeightMode: 'average' as const,
      },
      vegetation: { clear: true, exclusionRadius: 22 },
      surface: { kind: 'packed_earth' as const, innerRadius: 10, outerRadius: 16 },
      prefabId: 'village_cluster_small' as const,
    },
    // Trail checkpoint near Bravo (center-south)
    {
      id: 'trail_bravo',
      kind: 'road' as const,
      name: 'Bravo Trail Post',
      position: new THREE.Vector3(5, 0, 95),
      placement: { yaw: Math.PI * 0.5 },
      footprint: { shape: 'circle' as const, radius: 14 },
      terrain: {
        flatten: true,
        flatRadius: 8,
        blendRadius: 14,
        samplingRadius: 8,
        targetHeightMode: 'average' as const,
      },
      vegetation: { clear: true, exclusionRadius: 16 },
      surface: { kind: 'packed_earth' as const, innerRadius: 8, outerRadius: 12 },
      prefabId: 'trail_checkpoint_small' as const,
    },
    // NVA trail base near Charlie (east)
    {
      id: 'nva_trail_charlie',
      kind: 'firebase' as const,
      name: 'East Trail Base',
      position: new THREE.Vector3(145, 0, 5),
      placement: { yaw: -Math.PI * 0.3 },
      footprint: { shape: 'circle' as const, radius: 18 },
      terrain: {
        flatten: true,
        flatRadius: 12,
        blendRadius: 18,
        samplingRadius: 12,
        targetHeightMode: 'max' as const,
      },
      vegetation: { clear: true, exclusionRadius: 20 },
      surface: { kind: 'packed_earth' as const, innerRadius: 12, outerRadius: 16 },
      prefabId: 'nva_trail_base_small' as const,
    },
  ],

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
      owner: Faction.VC,
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
  ],
  factionMix: {
    [Alliance.BLUFOR]: [Faction.US],
    [Alliance.OPFOR]: [Faction.VC],
  }
};
