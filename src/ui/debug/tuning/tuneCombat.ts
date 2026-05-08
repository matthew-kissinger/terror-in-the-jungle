import type { GameEngine } from '../../../core/GameEngine';
import { Alliance, Faction } from '../../../systems/combat/types';
import { PixelForgeNpcDistanceConfig } from '../../../systems/combat/PixelForgeNpcRuntime';
import type { PaneLike, TuningState } from '../LiveTuningPanel';

/**
 * Combat folder: global combat-mute toggle + read-only faction counts.
 * Mute drives `WarSimulator.setEnabled(!muted)` (a small additive setter,
 * ≤10 LOC per the cycle brief). BLUFOR/OPFOR counts are not live-settable
 * (agents spawn via pipeline at configure time); we surface them as
 * read-only monitors so `getState()` reflects the current headcount.
 *
 * The PixelForge subfolder exposes the most common impostor / close-model
 * tunables. They write directly to `PixelForgeNpcDistanceConfig`, which the
 * renderer reads on every selection / cadence pass.
 */

const COMBAT_MUTED_KEY = 'combat.muted';
const COMBAT_BLUFOR_COUNT_KEY = 'combat.bluforAlive';
const COMBAT_OPFOR_COUNT_KEY = 'combat.opforAlive';

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
