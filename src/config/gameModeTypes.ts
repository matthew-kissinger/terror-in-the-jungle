import * as THREE from 'three';
import { Faction } from '../systems/combat/types';

export enum GameMode {
  ZONE_CONTROL = 'zone_control',
  OPEN_FRONTIER = 'open_frontier',
  TEAM_DEATHMATCH = 'tdm',
  AI_SANDBOX = 'ai_sandbox'
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
