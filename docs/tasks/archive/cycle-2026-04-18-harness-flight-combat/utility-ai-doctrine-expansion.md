# utility-ai-doctrine-expansion: per-faction response curves and scored actions

**Slug:** `utility-ai-doctrine-expansion`
**Cycle:** `cycle-2026-04-18-harness-flight-combat`
**Depends on:** nothing in this cycle (C1 utility-AI starter already on master)
**Blocks (in this cycle):** nothing
**Playtest required:** yes (observable: each faction feels different under fire — VC fade fast, NVA hold longer, US advance more aggressively, ARVN cohere or break)
**Estimated risk:** medium — the shape of the scoring pipeline is established; risk is tuning divergence (one faction becomes strictly better than another, or a response curve produces a runaway).
**Files touched:** `src/config/FactionCombatTuning.ts` (major expansion), `src/systems/combat/ai/utility/UtilityScorer.ts` (response-curve support), `src/systems/combat/ai/utility/actions.ts` (2-3 new scored actions), `src/systems/combat/ai/AIStateEngage.ts` (enable utility for all factions on a gate; react to new action intents), possibly one or two new or fleshed-out state handlers (e.g. `AIStateRetreat` for the orphan RETREATING state). New tests for each response curve and each new action.

## Why this task exists

C1 (2026-04-18) shipped an opt-in utility-AI scorer gated per-faction:

```ts
// src/config/FactionCombatTuning.ts — current
export interface FactionCombatTuning {
  panicThreshold: number;
  useUtilityAI: boolean;
}
export const FACTION_COMBAT_TUNING = {
  [Faction.VC]:   { panicThreshold: 0.35, useUtilityAI: true },
  [Faction.NVA]:  { panicThreshold: 0.70, useUtilityAI: false },
  [Faction.US]:   { panicThreshold: 0.55, useUtilityAI: false },
  [Faction.ARVN]: { panicThreshold: 0.45, useUtilityAI: false },
};
```

VC is the canary. NVA / US / ARVN still run the legacy state machine. One action is wired (`fireAndFadeAction`); two are scaffolded but not acted on (`coordinateSuppressionAction`, `requestSupportAction`).

This task expands in three directions:

1. **Response curves, not scalar thresholds.** `panicThreshold` is a hard cutoff. Real doctrine differentiation wants continuous response — how quickly morale decays, how sharply threat converts to flee-score, how steep the ammo-reserve → retreat curve is.
2. **More scored action families.** Beyond engage+panic: reposition (flank/fall-back-to-cover/advance-to-contact), suppress (area fire), regroup (rally to leader), hold (dig in at objective). Adding 2-3 in this task; the rest are follow-ups.
3. **Utility-on for all factions.** Flip `useUtilityAI: true` for NVA/US/ARVN with starter-tuned doctrines. VC stays the aggressive fade-in-small-groups canary; NVA is the rigid-hold foil; US is the fire-and-maneuver foil; ARVN is the variable-cohesion foil.

Secondary: the orphan `CombatantState.RETREATING` state (declared in `src/systems/combat/types.ts`, no handler) is a natural target — a new `reposition` action can transition into it, and a minimal `AIStateRetreat` handler gives doctrine expansion something observable.

## Required reading first

- `src/config/FactionCombatTuning.ts` — current shape.
- `src/systems/combat/ai/utility/UtilityScorer.ts` — scoring pipeline. What does `pick(context, scorables)` do today? Where do consideration weights live?
- `src/systems/combat/ai/utility/actions.ts` — existing action implementations. Note `fireAndFadeAction.apply()` allocation pattern (see `heap-regression-investigation` — pool any new `THREE.Vector3` allocations in action `apply()`).
- `src/systems/combat/ai/AIStateEngage.ts` `handleEngaging` — where `buildUtilityContext` is built and `utilityScorer.pick` is invoked. The expansion preserves this shape; don't move the invocation site.
- `src/systems/combat/ai/AIStateDefend.ts`, `AIStatePatrol.ts`, `AIStateMovement.ts` — other state handlers; know which are faction-aware today (research says none are).
- `src/systems/combat/types.ts` — `CombatantState` enum; confirm `IDLE` and `RETREATING` have no current handlers. `RETREATING` is the immediate target; `IDLE` is not scoped here.
- `src/systems/combat/ai/AIFlankingSystem.ts` — hardcoded squad-tactics timers (MIN_SQUAD_SIZE=3, FLANK_COOLDOWN_MS=15s, SUPPRESSION_DURATION_MS=4s, MAX_FLANK_CASUALTIES=2, FLANK_TIMEOUT_MS=20s). These stay hardcoded in this task — a follow-up task will parametrize them. **Do not widen scope into AIFlankingSystem here**.
- `docs/TESTING.md`.
- `docs/INTERFACE_FENCE.md`.

### External reference

- **Dave Mark, "Building a Better Centaur: AI at Massive Scale" (GDC 2015)** — still the reference for IAUS at scale: https://archive.org/details/GDC2015Mark
- **GameAIPro Online Edition, Ch 12 — "Squad Coordination in Days Gone"** — Frontline + Confidence concepts; Confidence is the direct analogue of per-faction morale decay rate: http://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter12_Squad_Coordination_in_Days_Gone.pdf
- **GameAIPro2 Ch 30 — "Modular Tactical Influence Maps"** (Mark) — influence layers that feed utility scorers: http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter30_Modular_Tactical_Influence_Maps.pdf
- **apoch/curvature** — IAUS editor; data model worth reading: https://github.com/apoch/curvature
- **DreamersIncStudios/ECS-IAUS-sytstem** — closest reference to a data-oriented IAUS implementation: https://github.com/DreamersIncStudios/ECS-IAUS-sytstem

Key concept: **a doctrine is a named bundle of scalar response-curve parameters and action-weight multipliers applied on top of a shared decision graph**. Every unit runs the same code; the data table differs. This is the extension path — not new classes per faction.

## Target state

### Expanded `FactionCombatTuning.ts` shape (proposed; executor may refine)

```ts
export interface FactionCombatTuning {
  // Legacy
  panicThreshold: number;       // kept for backward compat with non-utility callers
  useUtilityAI: boolean;        // flipped true for all four factions by end of this task

  // Morale / response
  moraleDecayPerSec: number;      // how fast squad confidence decays under fire
  moraleRecoveryPerSec: number;   // how fast it returns when not under fire
  ammoAnxietyCurve: ResponseCurve; // ammo-reserve → retreat-score input

  // Action weight multipliers (applied over base utility scores)
  actionWeights: {
    engage: number;        // baseline 1.0
    fireAndFade: number;   // VC high, US low
    suppress: number;      // US high, VC low
    reposition: number;    // all > 0
    regroup: number;       // ARVN high, NVA low
    hold: number;          // NVA high, VC low
  };

  // Frontline elasticity — how much the squad yields ground under pressure
  frontlineElasticityM: number;
}

export interface ResponseCurve {
  kind: 'logistic' | 'linear' | 'quadratic';
  midpoint: number;        // inflection at this input [0..1]
  steepness: number;       // rate of change at midpoint
}
```

### Action families to add in this task (pick 2 of 3)

Executor picks the 2 with best observable impact in playtest; the 3rd is queued as a follow-up.

1. **`repositionAction`** — score: low squad-confidence + high threat-at-current-pos + available-cover-behind. On win: transition combatant to `RETREATING` state, movement-target = nearest cover behind the threat bearing. This makes `RETREATING` a real state (closes the orphan-state gap).
2. **`suppressAction`** — score: ammo-reserve > threshold + enemy-density-in-cone + squad-size >= 2. On win: fire burst at area, no LOS required; costs ammo fast. Faction-differentiating: US weighs this high (fire-and-maneuver doctrine), VC weighs it low (ambush-fade doctrine).
3. **`holdAction`** — score: cover-quality-at-pos + objective-proximity + squad-confidence. On win: stay put, suppress if LOS, do not reposition. NVA weighs high; VC weighs low.

### Minimal `AIStateRetreat` handler

If `repositionAction` is picked (it should be — closes the orphan), author a minimal handler: move to target cover position at movement-speed, transition back to `ENGAGING` when cover reached OR threat bearing changes by >90° OR squad confidence recovers. Test coverage: transition-in, transition-out under each guard.

## Steps

1. Read all files in "Required reading first." Catalog every scalar parameter in the current utility flow that would plausibly differ per-faction.
2. Author the expanded `FactionCombatTuning` type (design above is a proposal; refine if the executor's read of `UtilityScorer.ts` reveals a cleaner shape). Add a `ResponseCurve` evaluator function (`evaluateCurve(curve, input) → score`) and test it against known-answer inputs for each of `logistic` / `linear` / `quadratic`.
3. Populate starter tunings for all 4 factions. Derive starter values from the existing `panicThreshold` values (VC 0.35 → morale decay is fast; NVA 0.70 → morale decay is slow). Playtest-tune later; first pass just needs to feel different.
4. Extend `UtilityScorer.ts` to read response curves and action-weight multipliers from the faction tuning. The scoring pipeline should look like: `raw_score_from_considerations × faction.actionWeights[action.id] → final`.
5. Implement 2 of the 3 new action families. Pick based on observable playtest impact; `repositionAction` is strongly recommended as one of the two (closes the orphan state).
6. Flip `useUtilityAI: true` for all four factions. Verify every action's `apply()` path is reachable; scaffold an action returning a no-op is fine if it's not ready.
7. If `repositionAction` ships: author `AIStateRetreat` (minimal — movement + transition guards). Register in the state-handler registry per existing pattern.
8. Behavior tests:
   - Each response curve: known-input → expected output.
   - Each new action: scripted observation → expected score ranking.
   - Each faction: two combatants in identical observation state, compare picked actions — must differ if the tuning is meaningful.
   - `AIStateRetreat` (if shipped): transition-in from `repositionAction`, transition-out under each guard.
9. Playtest `ai_sandbox` at 120 NPCs with mixed factions. Record: do VC groups fade faster? Do NVA squads hold longer? Do US squads move as fire teams? If differences aren't observable, tuning is too timid — bump faction divergences.
10. `npm run lint`, `npm run test:run`, `npm run build` green.

## Exit criteria

- `FactionCombatTuning` shape is expanded with morale, response curves, and action weights. Starter values for all 4 factions.
- 2 new scored action families shipped; 1 queued as follow-up if not picked.
- `useUtilityAI: true` for all 4 factions.
- If `repositionAction` shipped: `AIStateRetreat` handler exists; `CombatantState.RETREATING` is no longer orphan.
- Behavior tests cover response curves, new actions, and faction-differential picking.
- Playtest transcript / notes showing observable doctrine difference across factions (video or written observations).
- No perf regression in combat120 p99 (utility pre-pass already runs for VC; extending to all factions 4×s the per-tick utility cost for NPCs previously on legacy path — watch for frame-time budget overrun. If regression, propose pooling of context objects).
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not widen into `AIFlankingSystem` — its hardcoded squad-tactics timers are scope for a follow-up task.
- Do not add 4+ new action families — 2 is the cap for this task. More is scope creep.
- Do not re-architect `UtilityScorer` — extend it. If the executor finds a structural problem, note and queue, don't fix here.
- Do not parametrize weapons / ammo pools per-faction beyond what the new `ammoAnxietyCurve` already reads.
- Do not rewrite `AIStatePatrol`, `AIStateDefend`, `AIStateIdle`. Only `AIStateRetreat` is in scope, and only if `repositionAction` ships.
- Do not touch player combat logic.

## Hard stops

- A response curve produces runaway output (NaN, +Infinity, score drift) on any faction-config combination — STOP. Clamp in the evaluator before anywhere it feeds a decision.
- combat120 p99 regresses > 5% after flipping all factions to utility-AI — STOP. Profile, pool, come back.
- Any action's `apply()` allocates per-tick (e.g. `new THREE.Vector3()`) — STOP. Pool per-action-singleton scratch buffers; the `heap-regression-investigation` task is fixing this pattern elsewhere in the same cycle and we must not re-introduce it.
- Tuning differences are unobservable in playtest (all four factions feel the same) — STOP before shipping. The whole point is differentiation; cowardly starter values are worse than doing nothing.
- Fence change to `src/types/SystemInterfaces.ts` — STOP.
- Diff exceeds ~900 LOC net — STOP, propose tighter brief.
