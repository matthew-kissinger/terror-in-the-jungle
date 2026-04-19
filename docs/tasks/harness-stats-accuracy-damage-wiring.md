# harness-stats-accuracy-damage-wiring: surface accuracy and damage in capture stats

**Slug:** `harness-stats-accuracy-damage-wiring`
**Priority:** P2 — observability gap. Not a correctness bug but makes baseline refresh memos less informative and makes the state histogram incomplete.
**Playtest required:** no
**Budget:** ≤ 150 LOC.
**Files touched:**
- `scripts/perf-active-driver.cjs` (extend stop-stats to include accuracy + damage rollups)
- `scripts/perf-capture.ts` (read and summarize new fields into `summary.json`)
- Possibly the bot's `getDebugSnapshot()` or the capture's harness-driver accessor
- Tests for the stats

## Symptoms

User playtest (2026-04-19): "some stats are wired in but like accuracy and damage were not." The harness reports `shots`, `hits`, `movementTransitions`, `waypointsFollowed`, `waypointReplanFailures` etc., but not:
- **Accuracy** = hits / shots as an explicit field per capture. Currently requires division at read time.
- **Damage dealt** per capture (sum of damage bullets landed).
- **Damage taken** per capture (damage from NPC fire).
- **Kills** (distinct from hits — a hit may or may not kill, multi-hit kills should count once).
- **State histogram** — combat-reviewer flagged in PR #95 that `harnessDriver.getDebugSnapshot().botState` is disconnected from `perf-capture.ts`'s `movementState` read. Fix this disconnect so the histogram surfaces correctly.

Additionally, the combat-reviewer on PR #96 noted a TS/CJS drift: `FIRE_AIM_DOT_THRESHOLD = 0.8` is a named constant in the TS controller but a literal `0.8` in the CJS driver. Same drift exists on `verticalThreshold: 0.45 + closeRange` (CJS only). Not critical but aligns with this task's scope.

## Scope

1. **Stats**: add `accuracy`, `damageDealt`, `damageTaken`, `kills`, `stateHistogramMs` (per-state ms accumulators) to the driver's stop-stats and surface each in `summary.json`.
2. **State histogram wiring**: fix the disconnect between `harnessDriver.getDebugSnapshot().botState` (what bot is actually in) and `perf-capture.ts`'s `movementState` read (what it currently reports). Either update the snapshot to expose a canonical `botState` field OR update the capture to read the correct field.
3. **Drift fixes** (if time permits): move the CJS `0.8` into a named constant imported from a shared spot; mirror or explicitly document the CJS-only vertical gate.

## Where to read damage from

Damage is tracked in the engine — likely on the weapon system (`CombatantBallistics` or similar) and on the player's health system. The driver needs to observe increments rather than duplicate the tracking. Consult:
- `src/systems/combat/CombatantBallistics.ts` (or wherever bullet damage is resolved) — look for a counter/event.
- `src/systems/player/PlayerHealth.ts` (or equivalent) — damage-taken events.

Prefer polling the engine's own totals each tick over hooking events; the driver already polls per-tick.

## Exit criteria

- `summary.json` includes: `accuracy` (float, hits/shots), `damageDealt`, `damageTaken`, `kills`, `stateHistogramMs` (object with per-state ms totals).
- `harnessDriver.getDebugSnapshot()` exposes the current bot state under a canonical field name that `perf-capture.ts` reads correctly.
- Round 8-style memo can quote all five metrics directly from `summary.json` without computing on the fly.
- Lint / test:run / build green.

## Non-goals

- No new engine instrumentation. Read existing counters.
- No changes to the bot's state machine.
- No changes to capture duration, mode profiles, or validation thresholds.
- Do not address the PR #96 combat-reviewer drift nits unless it's a 5-minute fix inside scope.

## Hard stops

- Fence change → STOP.
- Damage-dealt tracking requires event subscriptions not available to the harness → STOP, propose engine-side instrumentation as a prerequisite.
- State histogram wiring fix requires touching `src/types/SystemInterfaces.ts` → STOP, propose alternative.
