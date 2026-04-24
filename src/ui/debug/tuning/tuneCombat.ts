import type { GameEngine } from '../../../core/GameEngine';
import { Alliance, Faction } from '../../../systems/combat/types';
import type { PaneLike, TuningState } from '../LiveTuningPanel';

/**
 * Combat folder: global combat-mute toggle + read-only faction counts.
 * Mute drives `WarSimulator.setEnabled(!muted)` (a small additive setter,
 * ≤10 LOC per the cycle brief). BLUFOR/OPFOR counts are not live-settable
 * (agents spawn via pipeline at configure time); we surface them as
 * read-only monitors so `getState()` reflects the current headcount.
 */

const COMBAT_MUTED_KEY = 'combat.muted';
const COMBAT_BLUFOR_COUNT_KEY = 'combat.bluforAlive';
const COMBAT_OPFOR_COUNT_KEY = 'combat.opforAlive';

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
  };
}

export function applyCombatState(engine: GameEngine, state: TuningState): void {
  const war = tryGetWar(engine);
  if (!war || typeof war.setEnabled !== 'function') return;
  war.setEnabled(state[COMBAT_MUTED_KEY] !== true);
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
