import * as THREE from 'three';
import { Faction, Alliance } from '../systems/combat/types';
import { GameMode, GameModeConfig, WeatherState } from './gameModeTypes';

// Team Deathmatch - Pure combat mode
export const TEAM_DEATHMATCH_CONFIG: GameModeConfig = {
  id: GameMode.TEAM_DEATHMATCH,
  name: 'Team Deathmatch',
  description: 'Pure tactical combat. First team to reach the kill target wins. No zones, no bleed, just skill.',

  worldSize: 400,
  chunkRenderDistance: 6,
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

  features: [
    // US firebase at deployment area
    {
      id: 'firebase_us_hq',
      kind: 'firebase' as const,
      name: 'US Firebase HQ',
      position: new THREE.Vector3(0, 0, -145),
      placement: { yaw: Math.PI },
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
      prefabId: 'firebase_hq_small' as const,
    },
    // NVA trail base at OPFOR deployment
    {
      id: 'nva_trail_base',
      kind: 'firebase' as const,
      name: 'NVA Trail Base',
      position: new THREE.Vector3(0, 0, 145),
      placement: { yaw: 0 },
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
    // Village near map center
    {
      id: 'center_village',
      kind: 'village' as const,
      name: 'Central Village',
      position: new THREE.Vector3(-30, 0, 0),
      placement: { yaw: Math.PI * 0.2 },
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
    // Supply depot near east flank
    {
      id: 'supply_depot_east',
      kind: 'road' as const,
      name: 'East Supply Depot',
      position: new THREE.Vector3(80, 0, 30),
      placement: { yaw: Math.PI * 0.1 },
      footprint: { shape: 'circle' as const, radius: 16 },
      terrain: {
        flatten: true,
        flatRadius: 10,
        blendRadius: 16,
        samplingRadius: 10,
        targetHeightMode: 'max' as const,
      },
      vegetation: { clear: true, exclusionRadius: 18 },
      surface: { kind: 'packed_earth' as const, innerRadius: 10, outerRadius: 14 },
      prefabId: 'crossing_outpost_small' as const,
    },
  ],

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
      name: 'NVA Deployment',
      position: new THREE.Vector3(0, 0, 150),
      radius: 30,
      isHomeBase: true,
      owner: Faction.NVA,
      ticketBleedRate: 0
    }
  ],
  factionMix: {
    [Alliance.BLUFOR]: [Faction.US],
    [Alliance.OPFOR]: [Faction.NVA],
  }
};
