import type { GameEngine } from '../../../core/GameEngine';
import { Alliance, Faction } from '../../../systems/combat/types';
import { NpcLodConfig } from '../../../config/CombatantConfig';
import { PixelForgeNpcDistanceConfig } from '../../../systems/combat/PixelForgeNpcRuntime';
import type { PaneLike, TuningState } from '../LiveTuningPanel';

/**
 * Combat folder: global combat-mute toggle + read-only faction counts +
 * the LOD/perception knobs that gate distant-NPC unfreeze and squad/stuck
 * watchdogs (see docs/tasks/npc-unfreeze-and-stuck.md). The PixelForge
 * subfolder exposes the most common impostor / close-model tunables (see
 * docs/tasks/npc-imposter-distance-priority.md). All knobs write through
 * to their live config object so changes apply on the next tick without
 * restart.
 */

const COMBAT_MUTED_KEY = 'combat.muted';
const COMBAT_BLUFOR_COUNT_KEY = 'combat.bluforAlive';
const COMBAT_OPFOR_COUNT_KEY = 'combat.opforAlive';
const LOD_VISUAL_VEL_KEY = 'combat.lod.visualOnlyIntegrateVelocity';
const LOD_REJOIN_TIMEOUT_KEY = 'combat.lod.rejoinTimeoutMs';
const LOD_SQUAD_STALE_KEY = 'combat.lod.squadFollowStaleMs';
const LOD_CULLED_INTERVAL_KEY = 'combat.lod.culledDistantSimIntervalMs';

const PF_CLOSE_DISTANCE_KEY = 'combat.pixelForge.closeModelDistanceMeters';
const PF_ON_SCREEN_WEIGHT_KEY = 'combat.pixelForge.onScreenWeight';
const PF_SQUAD_WEIGHT_KEY = 'combat.pixelForge.squadWeight';
const PF_RECENTLY_VISIBLE_MS_KEY = 'combat.pixelForge.recentlyVisibleMs';

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
    [PF_CLOSE_DISTANCE_KEY]: PixelForgeNpcDistanceConfig.closeModelDistanceMeters,
    [PF_ON_SCREEN_WEIGHT_KEY]: PixelForgeNpcDistanceConfig.onScreenWeight,
    [PF_SQUAD_WEIGHT_KEY]: PixelForgeNpcDistanceConfig.squadWeight,
    [PF_RECENTLY_VISIBLE_MS_KEY]: PixelForgeNpcDistanceConfig.recentlyVisibleMs,
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
  const closeDistance = state[PF_CLOSE_DISTANCE_KEY];
  if (typeof closeDistance === 'number' && Number.isFinite(closeDistance)) {
    PixelForgeNpcDistanceConfig.closeModelDistanceMeters = closeDistance;
  }
  const onScreenWeight = state[PF_ON_SCREEN_WEIGHT_KEY];
  if (typeof onScreenWeight === 'number' && Number.isFinite(onScreenWeight)) {
    PixelForgeNpcDistanceConfig.onScreenWeight = onScreenWeight;
  }
  const squadWeight = state[PF_SQUAD_WEIGHT_KEY];
  if (typeof squadWeight === 'number' && Number.isFinite(squadWeight)) {
    PixelForgeNpcDistanceConfig.squadWeight = squadWeight;
  }
  const recentlyVisibleMs = state[PF_RECENTLY_VISIBLE_MS_KEY];
  if (typeof recentlyVisibleMs === 'number' && Number.isFinite(recentlyVisibleMs)) {
    PixelForgeNpcDistanceConfig.recentlyVisibleMs = recentlyVisibleMs;
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

  const pixelForge = (typeof folder.addFolder === 'function')
    ? folder.addFolder({ title: 'PixelForge', expanded: false })
    : folder;
  pixelForge
    .addBinding(state, PF_CLOSE_DISTANCE_KEY, { label: 'close-model dist (m)', min: 64, max: 200, step: 4 })
    .on('change', onChange);
  pixelForge
    .addBinding(state, PF_ON_SCREEN_WEIGHT_KEY, { label: 'on-screen weight', min: 0, max: 50, step: 1 })
    .on('change', onChange);
  pixelForge
    .addBinding(state, PF_SQUAD_WEIGHT_KEY, { label: 'squad weight', min: 0, max: 50, step: 1 })
    .on('change', onChange);
  pixelForge
    .addBinding(state, PF_RECENTLY_VISIBLE_MS_KEY, { label: 'recently visible (ms)', min: 0, max: 3000, step: 100 })
    .on('change', onChange);
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
