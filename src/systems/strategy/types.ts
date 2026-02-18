import { Faction } from '../combat/types';

export enum AgentTier {
  MATERIALIZED = 'materialized',  // Full CombatantSystem entity with AI, rendering, combat
  SIMULATED = 'simulated',        // Lightweight position lerp, no rendering
  STRATEGIC = 'strategic'         // Squad-level counter only, no individual position updates
}

/**
 * Lightweight agent record (~120 bytes). The WarSimulator owns 3000 of these.
 * Uses plain numbers instead of Vector3 to avoid GC pressure.
 */
export interface StrategicAgent {
  id: string;
  faction: Faction;
  x: number;
  z: number;
  y: number;
  health: number;
  alive: boolean;
  tier: AgentTier;
  squadId: string;
  isLeader: boolean;
  destX: number;
  destZ: number;
  speed: number;
  combatState: 'idle' | 'moving' | 'fighting' | 'dead';
  combatantId?: string;  // set when materialized -> links to CombatantSystem entity
}

/**
 * Strategic squad record. ~100 squads for 3000 agents at 8-12 per squad.
 */
export interface StrategicSquad {
  id: string;
  faction: Faction;
  members: string[];       // agent IDs
  leaderId: string;
  x: number;
  z: number;
  objectiveZoneId?: string;
  objectiveX: number;
  objectiveZ: number;
  stance: 'attack' | 'defend' | 'patrol' | 'retreat' | 'reinforce';
  strength: number;         // 0-1 ratio of alive members
  combatActive: boolean;    // true if engaged with enemy squad
  lastCombatTime: number;   // timestamp of last abstract combat tick
}

/**
 * Events emitted by the WarSimulator for the feedback system to consume.
 * All events include enough data for HUD messages, audio cues, and map indicators.
 */
export type WarEvent =
  | { type: 'zone_captured'; zoneId: string; zoneName: string; faction: Faction; timestamp: number }
  | { type: 'zone_contested'; zoneId: string; zoneName: string; timestamp: number }
  | { type: 'zone_lost'; zoneId: string; zoneName: string; faction: Faction; timestamp: number }
  | { type: 'squad_engaged'; squadId: string; enemySquadId: string; x: number; z: number; timestamp: number }
  | { type: 'squad_wiped'; squadId: string; faction: Faction; timestamp: number }
  | { type: 'reinforcements_arriving'; faction: Faction; zoneId: string; zoneName: string; count: number; timestamp: number }
  | { type: 'major_battle'; x: number; z: number; intensity: number; timestamp: number }
  | { type: 'faction_advantage'; faction: Faction; ratio: number; timestamp: number }
  | { type: 'agent_killed'; agentId: string; faction: Faction; x: number; z: number; timestamp: number };

/**
 * Serializable snapshot of the entire war state for save/load.
 * ~360KB JSON for 3000 agents.
 */
export interface WarState {
  schemaVersion: number;
  timestamp: number;
  gameMode: string;
  elapsedTime: number;
  agents: StrategicAgent[];
  squads: StrategicSquad[];
  factions: Record<string, { tickets: number; kills: number; deaths: number }>;
  zones: Array<{ id: string; owner: string | null; captureProgress: number }>;
  player: { x: number; y: number; z: number; health: number; kills: number; deaths: number };
}
