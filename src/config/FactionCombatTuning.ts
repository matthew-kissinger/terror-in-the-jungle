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
  /**
   * Opt-in to the utility-AI scoring layer (C1 canary). When true, AIStateEngage
   * consults UtilityScorer before its default engage/seek-cover ladder and may
   * route high-level intents (fire-and-fade, coordinate-suppression, request-support)
   * back into the existing state machine. Default false — the scorer is a
   * prototype and only VC ships it in the C1 canary.
   */
  useUtilityAI: boolean;
}

export const FACTION_COMBAT_TUNING: Record<Faction, FactionCombatTuning> = {
  [Faction.VC]:   { panicThreshold: 0.35, useUtilityAI: true },  // guerrilla: panic + cover sooner; utility-AI canary
  [Faction.NVA]:  { panicThreshold: 0.70, useUtilityAI: false }, // conventional: committed, slower to panic
  [Faction.US]:   { panicThreshold: 0.55, useUtilityAI: false }, // trained: steady
  [Faction.ARVN]: { panicThreshold: 0.45, useUtilityAI: false }, // hybrid: slightly quicker than US
};

export function getFactionCombatTuning(faction: Faction): FactionCombatTuning {
  return FACTION_COMBAT_TUNING[faction];
}
