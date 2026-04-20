# perf-baseline-refresh: rebaseline all four scenarios against the aim-fixed player bot

**Slug:** `perf-baseline-refresh`
**Cycle:** *(next cycle — carried forward from `cycle-2026-04-18-harness-flight-combat`)*
**Priority:** P0 — baselines have been stale since 2026-03-06. Combat120 p99 threshold is set at a 100ms sentinel but measured reality is ~35ms; CI won't catch regressions until this lands.
**Depends on:** Nothing — the aim-fixed bot is on master (PR #96).
**Playtest required:** no (measurement only)
**Budget:** ≤ 200 LOC (mostly JSON + a memo).
**Files touched:**
- `perf-baselines.json` (rewritten via `npm run perf:update-baseline` or by hand)
- `docs/rearch/perf-baselines-refresh-<date>.md` (new memo)

## Why this task carries forward

This task was queued, dispatched, and stopped three times during `cycle-2026-04-18-harness-flight-combat`:

- **Round 3** (2026-04-19 morning): captured against killbot; openfrontier:short failed validator (p99=63ms > 60ms floor, `waypointsFollowed=0`).
- **Round 5**: dispatched then killed immediately after user playtest showed PR #95's bot was retreating.
- **Round 8**: dispatched against the aim-fixed bot; executor hit a 500 API error mid-run and produced zero usable captures.

As of PR #96 the bot works — combat120 smoke in that PR's verification reports `shots=420, hits=221, 52.6% hit rate`, and user observed the bot reaching victory in live playtest. The prerequisite is met; only the measurement-and-commit step remains.

## Scope

Same as the archived brief under `docs/tasks/archive/cycle-2026-04-18-harness-flight-combat/perf-baseline-refresh.md`:

1. Run all 4 captures back-to-back on the same machine.
2. Pick thresholds: pass = measured × 1.15, warn = measured × 1.05, heap × 1.3, hitch + 0.5% absolute (pass) / + 0.2% (warn).
3. Rewrite `perf-baselines.json`. Do NOT loosen vs current thresholds for any metric.
4. Write a memo at `docs/rearch/perf-baselines-refresh-<date>.md` with measured values, chosen thresholds, machine context, and an explicit note that captures were taken against the `perf-harness-player-bot-aim-fix` driver (PR #96).
5. Confirm a second back-to-back combat120 capture passes `npm run perf:compare` against the new baselines.

## Consider running alongside

Three follow-ups filed during the same cycle that make baseline reruns cheaper and more trustworthy:

- `harness-lifecycle-halt-on-match-end` — harness currently keeps running past the in-game victory screen. If this lands first, `frontier30m` becomes easier to wrangle (the bot won't keep "playing" in a post-game state during the soak).
- `bot-pathing-pit-and-steep-uphill` — bot gets stuck in pits / over-paths on steep-uphill-to-objective. Fixes here will shift openfrontier and ashau numbers and change what "baseline" means. Arguably land this FIRST so baselines reflect the improved pathing.
- `harness-stats-accuracy-damage-wiring` — accuracy and damage stats are not surfaced. Landing before this task means the memo can report hit rate + damage per scenario as part of the capture evidence.

Decide cycle ordering based on how much pathing is expected to move. If pathing fix is small, land it first and capture baselines against it. If pathing is medium/large, split into two cycles: baseline-against-current-master first, re-baseline-against-pathed-bot later.

## Non-goals

Same as archived brief. No new scenarios; no scenario-definition changes; no compare-script logic changes beyond tiny adapter fixes.

## Hard stops

Same as archived brief. Any validator fails → STOP. Measured worse than stale → STOP. Threshold choice loosens → STOP.
