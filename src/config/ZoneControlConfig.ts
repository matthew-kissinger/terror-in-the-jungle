import * as THREE from 'three';
import { Faction, Alliance } from '../systems/combat/types';
import { GameMode, GameModeConfig, WeatherState } from './gameModeTypes';

// Zone Control - widened layout with more staging depth and less base crowding:
//
//            US Base / Firebase (-50, -180)
//           /              \
//      Alpha                Charlie
//  (-220, 30)               (170, -30)
//           \              /
//            \            /
//              Bravo
//             (0, 135)
//           /              \
//      OPFOR Base / Bunkers (-30, 330)
//
// This creates longer approaches, more flank depth, and a less cramped opening fight.
export const ZONE_CONTROL_CONFIG: GameModeConfig = {
  id: GameMode.ZONE_CONTROL,
  name: 'Zone Control',
  description: 'Fast-paced combat over 3 strategic zones. Control the majority to drain enemy tickets.',

  worldSize: 800,
  visualMargin: 1600,
  chunkRenderDistance: 5,
  terrainSeed: 42,
  navmeshAsset: '/data/navmesh/zone_control-42.bin',
  terrain: {
    defaultBiome: 'denseJungle',
    biomeRules: [
      { biomeId: 'tallGrass',  elevationMax: 5,  slopeMax: 10, elevationBlendWidth: 4, priority: 2 },
    ],
  },
  terrainFlow: {
    enabled: true,
    routeStamping: 'full',
    routeWidth: 18,
    routeBlend: 8,
    routeSpacing: 18,
    routeSurface: 'jungle_trail',
    routePriority: 56,
    routeTerrainWidthScale: 0.42,
    routeGradeStrength: 0.07,
    routeTargetHeightMode: 'center',
    zoneShoulderPadding: 26,
    zoneShoulderBlend: 30,
    zoneShoulderGradeStrength: 0.2,
    homeBaseShoulderTargetHeightMode: 'max',
    connectObjectivePairs: true,
    maxRoutesPerAnchor: 3,
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
      position: new THREE.Vector3(-50, 0, -180),
      placement: { yaw: Math.PI },
      footprint: { shape: 'circle' as const, radius: 42 },
      terrain: {
        flatten: true,
        flatRadius: 30,
        blendRadius: 82,
        gradeRadius: 112,
        gradeStrength: 0.18,
        samplingRadius: 28,
        targetHeightMode: 'max' as const,
      },
      vegetation: { clear: true, exclusionRadius: 48 },
      surface: { kind: 'packed_earth' as const, innerRadius: 30, outerRadius: 40 },
      prefabId: 'firebase_us_medium' as const,
    },
    // NVA bunker cluster at OPFOR base
    {
      id: 'nva_bunkers',
      kind: 'firebase' as const,
      name: 'NVA Bunker Cluster',
      position: new THREE.Vector3(-30, 0, 330),
      placement: { yaw: 0 },
      footprint: { shape: 'circle' as const, radius: 30 },
      terrain: {
        flatten: true,
        flatRadius: 34,
        blendRadius: 86,
        gradeRadius: 118,
        gradeStrength: 0.2,
        samplingRadius: 30,
        targetHeightMode: 'max' as const,
      },
      vegetation: { clear: true, exclusionRadius: 44 },
      surface: { kind: 'packed_earth' as const, innerRadius: 34, outerRadius: 44 },
      prefabId: 'nva_bunker_cluster_small' as const,
    },
    // OPFOR egress shoulder to keep the first route from dumping squads over the HQ lip
    {
      id: 'trail_opfor_egress',
      kind: 'road' as const,
      name: 'OPFOR Egress Trail',
      position: new THREE.Vector3(18, 0, 224),
      placement: { yaw: Math.PI * 0.5 },
      footprint: { shape: 'circle' as const, radius: 18 },
      terrain: {
        flatten: true,
        flatRadius: 10,
        blendRadius: 28,
        gradeRadius: 32,
        gradeStrength: 0.14,
        samplingRadius: 14,
        targetHeightMode: 'max' as const,
        priority: 115,
      },
      vegetation: { clear: true, exclusionRadius: 20 },
      surface: { kind: 'jungle_trail' as const, innerRadius: 10, outerRadius: 16 },
      prefabId: 'trail_checkpoint_small' as const,
    },
    // Mid-slope saddle so the first Bravo approach follows a climbable shoulder
    {
      id: 'trail_bravo_saddle',
      kind: 'road' as const,
      name: 'Bravo Saddle',
      position: new THREE.Vector3(20, 0, 184),
      placement: { yaw: Math.PI * 0.5 },
      footprint: { shape: 'circle' as const, radius: 16 },
      terrain: {
        flatten: true,
        flatRadius: 8,
        blendRadius: 24,
        gradeRadius: 38,
        gradeStrength: 0.12,
        samplingRadius: 12,
        targetHeightMode: 'center' as const,
      },
      vegetation: { clear: true, exclusionRadius: 18 },
      surface: { kind: 'jungle_trail' as const, innerRadius: 8, outerRadius: 14 },
      prefabId: 'trail_checkpoint_small' as const,
    },
    // Village near zone Alpha (west)
    {
      id: 'village_alpha',
      kind: 'village' as const,
      name: 'West Village',
      position: new THREE.Vector3(-220, 0, 30),
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
      position: new THREE.Vector3(170, 0, -30),
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
      position: new THREE.Vector3(-50, 0, -180),
      radius: 36,
      isHomeBase: true,
      owner: Faction.US,
      ticketBleedRate: 0
    },
    // OPFOR Base - pushed back further
    {
      id: 'opfor_base',
      name: 'OPFOR Base',
      position: new THREE.Vector3(-30, 0, 330),
      radius: 36,
      isHomeBase: true,
      owner: Faction.VC,
      ticketBleedRate: 0
    },
    // Capture Zones - staggered layout, wider apart
    {
      id: 'zone_alpha',
      name: 'Alpha',
      position: new THREE.Vector3(-220, 0, 30),
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
      position: new THREE.Vector3(170, 0, -30),
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
