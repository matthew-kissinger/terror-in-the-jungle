import type { GameSystem } from '../types';
import type { SimulationGroupId } from './SimulationScheduler';
import type { SystemKeyToType } from './SystemRegistry';

type SystemUpdatePhase =
  | 'Combat'
  | 'Terrain'
  | 'Navigation'
  | 'Billboards'
  | 'Vehicles'
  | 'Player'
  | 'Weapons'
  | 'HUD'
  | 'TacticalUI'
  | 'WarSim'
  | 'AirSupport'
  | 'ModeRuntime'
  | 'World';

type SystemUpdateMode =
  | 'direct-update'
  | 'cadenced-update'
  | 'runtime-hook'
  | 'state-sync';

type ScheduledSystemKey = keyof SystemKeyToType;

interface SystemUpdateScheduleEntry {
  readonly key: ScheduledSystemKey;
  readonly mode: SystemUpdateMode;
}

interface SystemUpdatePhaseDefinition {
  readonly phase: SystemUpdatePhase;
  readonly budgetMs: number;
  readonly cadence?: SimulationGroupId;
  readonly systems: readonly SystemUpdateScheduleEntry[];
}

export const SYSTEM_UPDATE_SCHEDULE: readonly SystemUpdatePhaseDefinition[] = [
  {
    phase: 'Combat',
    budgetMs: 5.0,
    systems: [
      { key: 'combatantSystem', mode: 'direct-update' },
    ],
  },
  {
    phase: 'Terrain',
    budgetMs: 2.0,
    systems: [
      { key: 'terrainSystem', mode: 'direct-update' },
    ],
  },
  {
    phase: 'Navigation',
    budgetMs: 2.0,
    systems: [
      { key: 'navmeshSystem', mode: 'direct-update' },
    ],
  },
  {
    phase: 'Billboards',
    budgetMs: 2.0,
    systems: [
      { key: 'globalBillboardSystem', mode: 'direct-update' },
    ],
  },
  {
    phase: 'Vehicles',
    budgetMs: 1.0,
    systems: [
      { key: 'helicopterModel', mode: 'direct-update' },
      { key: 'fixedWingModel', mode: 'direct-update' },
      { key: 'vehicleManager', mode: 'direct-update' },
    ],
  },
  {
    phase: 'Player',
    budgetMs: 1.0,
    systems: [
      { key: 'playerController', mode: 'direct-update' },
      { key: 'firstPersonWeapon', mode: 'direct-update' },
    ],
  },
  {
    phase: 'Weapons',
    budgetMs: 1.0,
    systems: [
      { key: 'grenadeSystem', mode: 'direct-update' },
      { key: 'mortarSystem', mode: 'direct-update' },
      { key: 'sandbagSystem', mode: 'direct-update' },
      { key: 'ammoSupplySystem', mode: 'direct-update' },
    ],
  },
  {
    phase: 'HUD',
    budgetMs: 1.0,
    systems: [
      { key: 'hudSystem', mode: 'direct-update' },
    ],
  },
  {
    phase: 'TacticalUI',
    budgetMs: 0.5,
    cadence: 'tactical_ui',
    systems: [
      { key: 'minimapSystem', mode: 'cadenced-update' },
      { key: 'compassSystem', mode: 'cadenced-update' },
      { key: 'fullMapSystem', mode: 'cadenced-update' },
    ],
  },
  {
    phase: 'WarSim',
    budgetMs: 2.0,
    cadence: 'war_sim',
    systems: [
      { key: 'warSimulator', mode: 'cadenced-update' },
      { key: 'strategicFeedback', mode: 'state-sync' },
    ],
  },
  {
    phase: 'AirSupport',
    budgetMs: 1.0,
    cadence: 'air_support',
    systems: [
      { key: 'airSupportManager', mode: 'cadenced-update' },
      { key: 'aaEmplacementSystem', mode: 'cadenced-update' },
      { key: 'npcVehicleController', mode: 'cadenced-update' },
    ],
  },
  {
    phase: 'ModeRuntime',
    budgetMs: 0.2,
    cadence: 'mode_runtime',
    systems: [
      { key: 'gameModeManager', mode: 'runtime-hook' },
    ],
  },
  {
    phase: 'World',
    budgetMs: 1.0,
    cadence: 'world_state',
    systems: [
      { key: 'zoneManager', mode: 'cadenced-update' },
      { key: 'ticketSystem', mode: 'cadenced-update' },
      { key: 'weatherSystem', mode: 'cadenced-update' },
      { key: 'atmosphereSystem', mode: 'cadenced-update' },
      { key: 'waterSystem', mode: 'cadenced-update' },
    ],
  },
] as const;

export const TRACKED_SYSTEM_KEYS: readonly ScheduledSystemKey[] = [
  ...new Set(SYSTEM_UPDATE_SCHEDULE.flatMap(group => group.systems.map(system => system.key))),
];

export const SYSTEM_UPDATE_BUDGET_MS = Object.fromEntries(
  SYSTEM_UPDATE_SCHEDULE.map(group => [group.phase, group.budgetMs]),
) as Record<SystemUpdatePhase, number>;

export function collectTrackedSystems(refs: Partial<SystemKeyToType>): ReadonlySet<GameSystem> {
  const systems = new Set<GameSystem>();

  for (const key of TRACKED_SYSTEM_KEYS) {
    const system = refs[key] as GameSystem | undefined;
    if (system) systems.add(system);
  }

  return systems;
}
