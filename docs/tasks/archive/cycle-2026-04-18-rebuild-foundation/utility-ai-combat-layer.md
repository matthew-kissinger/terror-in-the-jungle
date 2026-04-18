# Task C1: Utility-AI combat layer prototype

**Phase:** C (rebuild R&D, runs on validated foundation)
**Depends on:** A1-A4 merged (validated infra), B1 merged (stable flight so
combat tests aren't flaky from vehicle noise)
**Blocks:** richer per-faction doctrine (beyond D2's panic-threshold lookup)
**Playtest required:** yes (combat rhythm)
**Estimated risk:** medium — introduces a new layer atop existing state
machines; must not regress current behavior
**Files touched:** new `src/systems/combat/ai/utility/` module, opt-in hook in
one or two AI state handlers, faction configs.

## Goal

Land a minimum utility-AI layer that can express 2-3 doctrine scenarios the
current state machines can't — without tearing out the state machines. The
layer scores candidate actions per tick and feeds the winner back into the
existing state machine as a high-level intent. Keep scope deliberately narrow:
this is the prototype that proves the paradigm can co-exist with today's code.

## Background

From the E3 spike memo on `origin/spike/E3-combat-ai-paradigm`:

- State machines can't cleanly express: "VC squad withdraws when friendly
  suppression reaches threshold AND terrain cover is available in the
  withdrawal direction"; "NVA platoon coordinates flank-suppression + flank-
  maneuver."
- Prototype showed utility-AI reads cleanly for these. Status: prototype-more.

D2 (merged 2026-04-17) landed `FACTION_COMBAT_TUNING[faction].panicThreshold` —
that's the ceiling of what a lookup table can do. Anything richer (multi-squad
coordination, terrain-aware retreat) needs a scoring layer.

## Required reading first

- `docs/COMBAT.md` — current combat subsystem shape.
- `docs/TESTING.md` — behavior tests; no phase-name or score-value assertions.
- `docs/INTERFACE_FENCE.md`.
- **On branch `origin/spike/E3-combat-ai-paradigm`:**
  - `docs/rearch/E3-combat-ai-evaluation.md` — memo + prototype data.
  - Prototype code from the spike — lift what's clean.
- `src/systems/combat/AIStateEngage.ts`, `AIStateDefend.ts`, `AIStatePatrol.ts`
  — where the utility-AI hook lands.
- `src/config/FactionCombatTuning.ts` — the pattern utility scoring extends.

## Steps

1. Fetch E3 spike; read memo.
2. Scaffold `src/systems/combat/ai/utility/`. Export `UtilityScorer`,
   `UtilityAction` (data: id, pre-conditions, score function, apply function).
3. Implement 3 doctrine scenarios from the E3 memo as utility actions. Start
   with VC fire-and-fade, then NVA coordinated suppression, then a third
   the memo picks out.
4. Wire `UtilityScorer.pick(context)` into `AIStateEngage.handleEngaging` as an
   opt-in branch gated by a faction config flag
   (`FACTION_COMBAT_TUNING[faction].useUtilityAI`). Default OFF for every
   faction. Flip ON for VC only in this PR, as the canary.
5. Behavior tests: scripted scenario asserts that VC with utility ON retreats
   earlier under terrain cover than VC with utility OFF. Measure the delta,
   assert direction (not exact magnitude).
6. Perf: `combat120` p99 delta < 5% with utility ON for VC.
7. Playtest: human confirms VC feels observably more canny than baseline,
   without feeling scripted.

## Exit criteria

- `src/systems/combat/ai/utility/` lands with 3 utility actions.
- VC faction uses utility-AI for 1 doctrine (fire-and-fade). NVA and US
  unchanged.
- Behavior test passes; delta between utility-on vs utility-off is measurable
  and in the expected direction.
- `combat120` p99 delta < 5%.
- Human playtest note in PR: "VC feels different, still fair."
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- No full rewrite of state machines — utility-AI sits ABOVE them and feeds
  intents.
- No NVA / US doctrine yet — VC-only canary this pass. Opens the door for
  next-cycle follow-on.
- No GOAP or behavior trees — utility scoring only.

## Hard stops

- Fence change required: stop.
- Perf regression > 5%: stop.
- The E3 memo's prototype is missing or was re-evaluated as unfit: stop and
  surface; don't re-litigate the paradigm without a decision.
