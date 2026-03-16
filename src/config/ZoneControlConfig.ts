import * as THREE from 'three';
import { Faction, Alliance } from '../systems/combat/types';
import { GameMode, GameModeConfig, WeatherState } from './gameModeTypes';

// Zone Control - widened layout with more staging depth and less base crowding:
//
//            US Base / Firebase (0, -180)
//           /              \
//      Alpha                Charlie
//  (-230, -20)              (230, 20)
//           \              /
//            \            /
//              Bravo
//             (0, 135)
//           /              \
//      OPFOR Base / Bunkers (0, 290)
//
// This creates longer approaches, more flank depth, and a less cramped opening fight.
export const ZONE_CONTROL_CONFIG: GameModeConfig = {
  id: GameMode.ZONE_CONTROL,
  name: 'Zone Control',
  description: 'Fast-paced combat over 3 strategic zones. Control the majority to drain enemy tickets.',

  worldSize: 800,
  visualMargin: 360,
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

  minimapScale: 520,
  viewDistance: 220,

  features: [
    // US firebase near home base
    {
      id: 'firebase_us',
      kind: 'firebase' as const,
      name: 'US Firebase',
      position: new THREE.Vector3(0, 0, -180),
      placement: { yaw: Math.PI },
      footprint: { shape: 'circle' as const, radius: 42 },
      terrain: {
        flatten: true,
        flatRadius: 28,
        blendRadius: 72,
        samplingRadius: 24,
        targetHeightMode: 'average' as const,
      },
      vegetation: { clear: true, exclusionRadius: 48 },
      surface: { kind: 'packed_earth' as const, innerRadius: 28, outerRadius: 38 },
      prefabId: 'firebase_us_medium' as const,
    },
    // NVA bunker cluster at OPFOR base
    {
      id: 'nva_bunkers',
      kind: 'firebase' as const,
      name: 'NVA Bunker Cluster',
      position: new THREE.Vector3(0, 0, 290),
      placement: { yaw: 0 },
      footprint: { shape: 'circle' as const, radius: 30 },
      terrain: {
        flatten: true,
        flatRadius: 28,
        blendRadius: 60,
        samplingRadius: 24,
        targetHeightMode: 'average' as const,
      },
      vegetation: { clear: true, exclusionRadius: 38 },
      surface: { kind: 'packed_earth' as const, innerRadius: 28, outerRadius: 36 },
      prefabId: 'nva_bunker_cluster_small' as const,
    },
    // Village near zone Alpha (west)
    {
      id: 'village_alpha',
      kind: 'village' as const,
      name: 'West Village',
      position: new THREE.Vector3(-220, 0, -10),
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
      position: new THREE.Vector3(10, 0, 130),
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
      position: new THREE.Vector3(220, 0, 20),
      placement: { yaw: -Math.PI * 0.3 },
      footprint: { shape: 'circle' as const, radius: 18 },
      terrain: {
        flatten: true,
        flatRadius: 14,
        blendRadius: 32,
        samplingRadius: 14,
        targetHeightMode: 'average' as const,
      },
      vegetation: { clear: true, exclusionRadius: 24 },
      surface: { kind: 'packed_earth' as const, innerRadius: 14, outerRadius: 20 },
      prefabId: 'nva_trail_base_small' as const,
    },
  ],

  zones: [
    // US Base - pushed back further
    {
      id: 'us_base',
      name: 'US Base',
      position: new THREE.Vector3(0, 0, -180),
      radius: 36,
      isHomeBase: true,
      owner: Faction.US,
      ticketBleedRate: 0
    },
    // OPFOR Base - pushed back further
    {
      id: 'opfor_base',
      name: 'OPFOR Base',
      position: new THREE.Vector3(0, 0, 290),
      radius: 36,
      isHomeBase: true,
      owner: Faction.VC,
      ticketBleedRate: 0
    },
    // Capture Zones - staggered layout, wider apart
    {
      id: 'zone_alpha',
      name: 'Alpha',
      position: new THREE.Vector3(-230, 0, -20),
      radius: 20,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 1
    },
    {
      id: 'zone_bravo',
      name: 'Bravo',
      position: new THREE.Vector3(0, 0, 135),
      radius: 20,
      isHomeBase: false,
      owner: null,
      ticketBleedRate: 2
    },
    {
      id: 'zone_charlie',
      name: 'Charlie',
      position: new THREE.Vector3(230, 0, 20),
      radius: 20,
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
