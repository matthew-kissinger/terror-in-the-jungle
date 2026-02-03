import * as THREE from 'three';
import { Faction } from '../systems/combat/types';
import { GameMode, GameModeConfig, WeatherState } from './gameModeTypes';

// AI Sandbox - Automated combat stress test mode
export const AI_SANDBOX_CONFIG: GameModeConfig = {
  id: GameMode.AI_SANDBOX,
  name: 'AI Sandbox',
  description: 'Automated AI combat sandbox for performance testing. No zones, no tickets, pure combat.',

  worldSize: 200,
  chunkRenderDistance: 4,
  weather: {
    enabled: false,
    initialState: WeatherState.CLEAR,
    transitionChance: 0,
    cycleDuration: { min: 0, max: 0 }
  },

  maxTickets: 99999,
  matchDuration: 3600, // 1 hour (effectively unlimited for tests)
  deathPenalty: 0,

  playerCanSpawnAtZones: false,
  respawnTime: 1,
  spawnProtectionDuration: 0,

  maxCombatants: 40, // Overridden via URL params in sandbox mode
  squadSize: { min: 3, max: 5 },
  reinforcementInterval: 10,

  captureRadius: 0,
  captureSpeed: 0,

  minimapScale: 200,
  viewDistance: 120,

  zones: [
    {
      id: 'us_base',
      name: 'US Base',
      position: new THREE.Vector3(0, 0, -40),
      radius: 20,
      isHomeBase: true,
      owner: Faction.US,
      ticketBleedRate: 0
    },
    {
      id: 'opfor_base',
      name: 'OPFOR Base',
      position: new THREE.Vector3(0, 0, 40),
      radius: 20,
      isHomeBase: true,
      owner: Faction.OPFOR,
      ticketBleedRate: 0
    }
  ]
};
