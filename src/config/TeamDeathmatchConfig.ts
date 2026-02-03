import * as THREE from 'three';
import { Faction } from '../systems/combat/types';
import { GameMode, GameModeConfig, WeatherState } from './gameModeTypes';

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
