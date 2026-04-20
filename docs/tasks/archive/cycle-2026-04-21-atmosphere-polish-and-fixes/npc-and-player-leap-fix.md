# npc-and-player-leap-fix: NPCs and harness-driven player visibly leap into the air

**Slug:** `npc-and-player-leap-fix`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P0 — visible bug, breaks game-feel.
**Playtest required:** YES (the bug is behavioral; needs eyeball confirmation).
**Estimated risk:** medium — possibly two distinct root causes (NPC vs player) that look similar.
**Budget:** ≤ 350 LOC.
**Files touched:**

- Investigate: `src/systems/combat/CombatantRenderInterpolator.ts` (already exists, line `RENDER_MAX_SPEED_MPS = max(NPC_MAX_SPEED * 2, 18)`), `src/systems/combat/CombatantLODManager.ts` (line 558 calls `renderInterpolator.update`), `src/systems/player/PlayerMovement.ts`, `src/systems/player/SlopePhysics.ts`, the harness driver `scripts/perf-active-driver.cjs`.
- Modify: whichever file owns the actual bug — likely the interpolator's Y-axis treatment or terrain-height resolution at NPC spawn / waypoint reach.

## Symptoms (orchestrator playtest 2026-04-20)

1. **NPC combatants visibly leap into the air.** This is the "hypersprint bug" CLAUDE.md mentions as "root-caused in `CombatantLODManager` but shelved for a future render-side position-interpolation task." `CombatantRenderInterpolator` was added (it's used at `CombatantLODManager.ts:558`) but the leap is still visible — so either the interpolator's tuning is wrong, or the root cause is upstream of it (logical position itself jumps to a wrong Y when terrain isn't streamed).
2. **The harness-driven player also leaps.** This is NEW — the player runs through `PlayerMovement` / `SlopePhysics` with explicit ground-clamp logic. A player leap suggests the slope/ground-clamp logic is letting the player launch on certain terrain transitions. May be related to PR #98 `bot-pathing-pit-and-steep-uphill` (the brief notes the bot "uses a 3D-distance check" now and "detects pits" — could induce launch behavior) or to the new atmosphere-driven shadow follow target (unlikely).

The two symptoms LOOK similar but probably have different root causes. Investigate both before assuming one fix covers both.

## Required reading first

- `src/systems/combat/CombatantRenderInterpolator.ts` (full file, ~80 LOC). The existing logic clamps full Vector3 magnitude. If logical Y jumps because terrain wasn't streamed at NPC spawn / waypoint-reach, the interpolator will animate the Y catch-up across frames — visible as a "leap."
- `src/systems/combat/CombatantLODManager.ts` line 558 area for the call site, plus the LOD-stagger logic that produces the dt-amortized jumps the interpolator was added to smooth.
- `src/systems/player/PlayerMovement.ts` and `src/systems/player/SlopePhysics.ts` — player ground-clamp + slope handling.
- `scripts/perf-active-driver.cjs` — the harness driver. Did PR #98 `bot-pathing-pit-and-steep-uphill` change anything about how the bot's vertical position is set? Search for `jump` / `pit` / `teleport`.

## Hypothesis (NOT prescriptive — verify)

NPC leap:
- (a) Logical Y is being computed wrong at spawn or waypoint-reach when terrain chunk isn't streamed → snap to wrong Y → interpolator animates the catch-up. **Fix would be in the position resolver**, not the interpolator.
- (b) Interpolator's `RENDER_MAX_SPEED_MPS = max(NPC_MAX_SPEED * 2, 18)` is too permissive vertically. Add a separate vertical clamp lower than the horizontal clamp — terrain height changes are usually small per-frame, so a 2 m/s vertical clamp would absorb the leap.
- (c) The interpolator is bypassed for some combatants (check `isPassThroughState` callers; mounted/dying/IN_VEHICLE pass through unclamped).

Player leap:
- (a) Slope physics has a regression at sharp slope transitions (e.g. a discontinuity in normal vector lets vertical velocity accumulate).
- (b) `bot-pathing-pit-and-steep-uphill` (PR #98) added pit-escape and steep-climb dampener; verify pit-escape doesn't produce a launch.
- (c) Terrain chunk streaming gap places player on phantom-tall geometry briefly.

## Steps

1. Boot `npm run dev`, watch NPCs and the harness player. Capture a recording or screenshot showing the leap.
2. Add temporary Logger trace in `CombatantRenderInterpolator.advance` that fires when `Math.abs(this.scratchDelta.y) > 1.5`, logging the combatant id + position + rendered + delta. Identify the pattern (which combatants, what state, what terrain).
3. Same for player: add a temporary Logger trace where `PlayerMovement` writes a vertical position delta > 1m per frame.
4. Read the trace; identify where the upstream Y jump comes from.
5. Fix at the lowest-impact layer:
   - If logical Y jumps come from terrain-not-streamed → fix the position resolver to defer / use last-known height.
   - If logical Y is correct but interpolator over-animates Y → add a vertical clamp.
   - If player leap is slope-transition → fix slope physics edge case.
6. Re-run dev, verify no leaps for 2+ minutes of play.

## Exit criteria

- 2 minutes of NPC observation in `combat120` shows no visible NPC leap.
- 2 minutes of harness-player observation in `openfrontier:short` shows no visible player leap.
- Existing `CombatantRenderInterpolator.test.ts` (if exists) and `CombatantLODManager.test.ts` pass; add a regression test for whichever scenario reproduces the leap.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- `combat120` perf smoke unchanged within WARN bound.

## Non-goals

- Do not refactor the LOD stagger logic.
- Do not rewrite slope physics broadly — just fix the discontinuity that produces the launch.
- Do not change `NPC_MAX_SPEED` to mask the symptom.

## Hard stops

- Fence change → STOP and surface.
- Fix requires a navmesh re-bake → STOP, file separate task.
- Fix would require a SystemInterfaces change → STOP.
