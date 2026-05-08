import type { GameEngine } from '../../../core/GameEngine';
import { Alliance, Faction } from '../../../systems/combat/types';
import { NpcLodConfig } from '../../../config/CombatantConfig';
import type { PaneLike, TuningState } from '../LiveTuningPanel';

/**
 * Combat folder: global combat-mute toggle + read-only faction counts +
 * the LOD/perception knobs that gate distant-NPC unfreeze and squad/stuck
 * watchdogs (see docs/tasks/npc-unfreeze-and-stuck.md). Knobs write through
 * to `NpcLodConfig` so changes apply on the next tick without restart.
 */

const COMBAT_MUTED_KEY = 'combat.muted';
const COMBAT_BLUFOR_COUNT_KEY = 'combat.bluforAlive';
const COMBAT_OPFOR_COUNT_KEY = 'combat.opforAlive';
const LOD_VISUAL_VEL_KEY = 'combat.lod.visualOnlyIntegrateVelocity';
const LOD_REJOIN_TIMEOUT_KEY = 'combat.lod.rejoinTimeoutMs';
const LOD_SQUAD_STALE_KEY = 'combat.lod.squadFollowStaleMs';
const LOD_CULLED_INTERVAL_KEY = 'combat.lod.culledDistantSimIntervalMs';

interface WarFacade {
  isEnabled(): boolean;
  setEnabled?(v: boolean): void;
  getAliveCount(faction: Faction): number;
}

export function captureCombatDefaults(engine: GameEngine): TuningState {
  const war = tryGetWar(engine);
  return {
    [COMBAT_MUTED_KEY]: war ? !war.isEnabled() : false,
    [COMBAT_BLUFOR_COUNT_KEY]: countAlliance(engine, Alliance.BLUFOR),
    [COMBAT_OPFOR_COUNT_KEY]: countAlliance(engine, Alliance.OPFOR),
    [LOD_VISUAL_VEL_KEY]: NpcLodConfig.visualOnlyIntegrateVelocity,
    [LOD_REJOIN_TIMEOUT_KEY]: NpcLodConfig.rejoinTimeoutMs,
    [LOD_SQUAD_STALE_KEY]: NpcLodConfig.squadFollowStaleMs,
    [LOD_CULLED_INTERVAL_KEY]: NpcLodConfig.culledDistantSimIntervalMs,
  };
}

export function applyCombatState(engine: GameEngine, state: TuningState): void {
  const war = tryGetWar(engine);
  if (war && typeof war.setEnabled === 'function') {
    war.setEnabled(state[COMBAT_MUTED_KEY] !== true);
  }
  if (typeof state[LOD_VISUAL_VEL_KEY] === 'boolean') {
    NpcLodConfig.visualOnlyIntegrateVelocity = state[LOD_VISUAL_VEL_KEY] as boolean;
  }
  if (typeof state[LOD_REJOIN_TIMEOUT_KEY] === 'number') {
    NpcLodConfig.rejoinTimeoutMs = state[LOD_REJOIN_TIMEOUT_KEY] as number;
  }
  if (typeof state[LOD_SQUAD_STALE_KEY] === 'number') {
    NpcLodConfig.squadFollowStaleMs = state[LOD_SQUAD_STALE_KEY] as number;
  }
  if (typeof state[LOD_CULLED_INTERVAL_KEY] === 'number') {
    NpcLodConfig.culledDistantSimIntervalMs = state[LOD_CULLED_INTERVAL_KEY] as number;
  }
}

export function bindCombatKnobs(
  pane: PaneLike,
  engine: GameEngine,
  state: TuningState,
  onChange: () => void,
): void {
  const folder = pane.addFolder({ title: 'Combat', expanded: false });
  folder.addBinding(state, COMBAT_MUTED_KEY, { label: 'mute combat' }).on('change', onChange);
  folder.addBinding(state, COMBAT_BLUFOR_COUNT_KEY, { label: 'BLUFOR alive', readonly: true });
  folder.addBinding(state, COMBAT_OPFOR_COUNT_KEY, { label: 'OPFOR alive', readonly: true });
  folder
    .addBinding(state, LOD_VISUAL_VEL_KEY, { label: 'visual-only integrate vel' })
    .on('change', onChange);
  folder
    .addBinding(state, LOD_REJOIN_TIMEOUT_KEY, { label: 'rejoin timeout (ms)', min: 1000, max: 30000, step: 250 })
    .on('change', onChange);
  folder
    .addBinding(state, LOD_SQUAD_STALE_KEY, { label: 'squad follow stale (ms)', min: 1000, max: 30000, step: 250 })
    .on('change', onChange);
  folder
    .addBinding(state, LOD_CULLED_INTERVAL_KEY, { label: 'culled sim interval (ms)', min: 1000, max: 60000, step: 500 })
    .on('change', onChange);
  state[COMBAT_BLUFOR_COUNT_KEY] = countAlliance(engine, Alliance.BLUFOR);
  state[COMBAT_OPFOR_COUNT_KEY] = countAlliance(engine, Alliance.OPFOR);
}

function countAlliance(engine: GameEngine, alliance: Alliance): number {
  const war = tryGetWar(engine);
  if (!war) return 0;
  if (alliance === Alliance.BLUFOR) {
    return (war.getAliveCount(Faction.US) ?? 0) + (war.getAliveCount(Faction.ARVN) ?? 0);
  }
  return (war.getAliveCount(Faction.NVA) ?? 0) + (war.getAliveCount(Faction.VC) ?? 0);
}

function tryGetWar(engine: GameEngine): WarFacade | null {
  try { return engine.systemManager.warSimulator as unknown as WarFacade; }
  catch { return null; }
}
