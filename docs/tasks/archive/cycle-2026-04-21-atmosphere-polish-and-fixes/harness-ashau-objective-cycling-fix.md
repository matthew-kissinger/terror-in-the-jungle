# harness-ashau-objective-cycling-fix: bot loops between captured zone and itself in ashau

**Slug:** `harness-ashau-objective-cycling-fix`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P1 — corrupts ashau perf captures (bot is stuck so harness measures dormant sim).
**Playtest required:** YES.
**Estimated risk:** medium — touches harness driver objective selector + stuck recovery.
**Budget:** ≤ 250 LOC.
**Files touched:**

- Investigate: `scripts/perf-active-driver.cjs` (objective selector, stuck-teleport, the `bot-pathing-pit-and-steep-uphill` heuristics); `src/dev/harness/playerBot/states.ts` if the bot's logical state machine has objective filtering.
- Modify: the objective selector / stuck-teleport target picker to skip already-captured zones in zone-control modes.

## Symptoms (orchestrator playtest 2026-04-20)

User reported: "the player harness got stuck teleporting moving back and forth between an already captured position in ashau mode a minute in so not much has happened after it started and got into some conflict. maybe mode config is set incorrectly for ashau or not handled or wired correctly."

Pattern: bot reaches zone, captures it, then triggers stuck-recovery teleport which puts it BACK at the same captured zone, loops. Suggests the stuck-teleport target picker doesn't filter out already-owned zones, OR the objective selector hands out the same captured zone repeatedly.

This may be related to but distinct from `bot-pathing-pit-and-steep-uphill` (PR #98) which added pit-escape teleporting. The pit-escape may be the wrong fix for "stuck because no new objective."

## Required reading first

- `scripts/perf-active-driver.cjs` (full file is ~1900 LOC; focus on objective selection — `getObjective`, `pickNextZone`, etc. — plus the new `detectPitTrap` / `stuckTeleportCount` paths from PR #98).
- `src/dev/harness/playerBot/states.ts` — if there's a logical objective-selection layer above the driver.
- The zone-control mode objective system (find via grep for `capturedBy` or `ownerFaction` or whatever the zone state shape is).
- Cycle-2026-04-20 archive: `docs/tasks/archive/cycle-2026-04-20-atmosphere-foundation/bot-pathing-pit-and-steep-uphill.md` for context on what PR #98 changed.

## Hypothesis (verify)

The stuck-teleport (`stuckTeleportCount` increments at `perf-active-driver.cjs:1457`) targets the current waypoint. After zone capture, the current waypoint is the just-captured zone (still in the active path until objective selector hands out a new one). Teleport puts bot at zone center; bot tries to "capture" already-owned zone; logical state stays "PATROL"; stuck timer fires again; loop.

Fix: gate the stuck-teleport on "is the current target objective still valid for me to act on" (in zone-control: not already owned by my faction). If invalid, force objective re-selection BEFORE teleporting.

## Steps

1. Reproduce: `npm run perf:capture:ashau:short` (after `ashau-dem-streaming-fix` lands so the terrain works); observe console / summary for the loop.
2. Read the objective selector and stuck-teleport paths.
3. Add a defensive `currentObjectiveIsStillActionable()` check before the stuck-teleport fires; if false, force re-select.
4. Add a regression test that simulates a zone-capture-then-immediate-stuck and asserts the bot picks a different zone for the next objective.
5. Confirm `npm run perf:capture:ashau:short` produces a capture where the bot makes meaningful progress (multiple zones captured or at least multiple movementTransitions across the duration).

## Exit criteria

- `npm run perf:capture:ashau:short` does not exhibit the back-and-forth loop in a 180 s capture.
- `summary.json.harnessDriverFinal.movementTransitions > 5` and `kills > 0` (or comparable signal of meaningful play).
- Bot can capture multiple zones in sequence in zone-control modes.
- Regression test pinning the "stuck on captured zone → re-select" behavior.
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not redesign the objective system in the engine.
- Do not change navmesh / pathing — this is purely about the harness driver's intent layer.
- Do not change zone-capture mechanics.

## Hard stops

- Fence change → STOP.
- Fix requires modifying engine code (zone capture, ticket system) → STOP.
- This needs `ashau-dem-streaming-fix` to land first to be testable. If that's not merged, defer this task.
