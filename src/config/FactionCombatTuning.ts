import { Faction } from '../systems/combat/types';

/**
 * Per-faction AI doctrine parameters. Expand this interface when adding new
 * differentiators; every call site reads through getFactionCombatTuning(faction).
 * Thin data layer — when the utility-AI layer lands (Phase F per docs/rearch/E3),
 * this table becomes the input to the utility scorer without rewriting consumers.
 */
export interface FactionCombatTuning {
  /**
   * Cumulative panic level at which AIStateEngage triggers full-auto + shorter
   * burst pause. Lower = panics sooner (guerrilla). Higher = committed (conventional).
   */
  panicThreshold: number;
}

export const FACTION_COMBAT_TUNING: Record<Faction, FactionCombatTuning> = {
  [Faction.VC]:   { panicThreshold: 0.35 }, // guerrilla: panic + cover sooner
  [Faction.NVA]:  { panicThreshold: 0.70 }, // conventional: committed, slower to panic
  [Faction.US]:   { panicThreshold: 0.55 }, // trained: steady
  [Faction.ARVN]: { panicThreshold: 0.45 }, // hybrid: slightly quicker than US
};

export function getFactionCombatTuning(faction: Faction): FactionCombatTuning {
  return FACTION_COMBAT_TUNING[faction];
}
