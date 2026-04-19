# harness-lifecycle-halt-on-match-end: stop perf capture when the match ends

**Slug:** `harness-lifecycle-halt-on-match-end`
**Priority:** P1 — blocks reliable `frontier30m` soak captures and pollutes short captures whenever the bot finishes a game mode faster than the capture duration.
**Playtest required:** no (observability + lifecycle fix)
**Budget:** ≤ 150 LOC.
**Files touched:**
- `scripts/perf-active-driver.cjs` (detect match-end via engine state; signal halt)
- `scripts/perf-capture.ts` (react to halt signal; finalize capture early)
- Tests for both

## Symptom

User observed (2026-04-19 playtest of PR #96): the bot reached the in-game victory screen during a perf capture, but the harness kept running in the post-match state. The browser window still showed the victory screen while the capture clock continued. `frontier30m` (a 30-min soak on open_frontier) is especially exposed because matches can end well inside the duration, after which the bot is driving the UI rather than the combat pipe.

## Root cause (hypothesis)

The harness driver (`scripts/perf-active-driver.cjs`) ticks the PlayerBot regardless of `gameModeManager` state. The bot's state machine has no `MATCH_ENDED` state — it continues PATROL/ADVANCE/ENGAGE against whatever `findNearestEnemy` returns, which in the post-match state may be nothing or may be stale pointers. The capture in `scripts/perf-capture.ts` runs for a fixed duration regardless of what the engine thinks.

## Fix sketch

1. **Detect match-end in the driver.** Read `systems.gameModeManager?.isMatchEnded()` (or equivalent — audit the real API surface). If true, transition the bot to a new `MATCH_ENDED` terminal state that emits `moveForward=0, firePrimary=false, aimTarget=null`.
2. **Signal halt to the capture.** `perf-capture.ts` polls `systems.gameModeManager.isMatchEnded()` at the sample interval; when true, finalize the capture 2 seconds later (enough for tail frames to flush) rather than continuing to the configured duration.
3. **Log the halt.** Surface `match_ended_at_ms` and `match_outcome` (victory / defeat / draw) in `summary.json` so the memo writer for baseline refreshes can report how much of the capture was in-match vs post-match.
4. **Regression test.** A test that simulates match-end at t=30s on a 90s capture config: assert the capture finalizes at ~32s with `match_ended_at_ms ≈ 30000`.

## Exit criteria

- Capture finalizes within 3s of match-end being set on `gameModeManager`.
- Capture artifact includes `match_ended_at_ms` when applicable.
- Bot's `MATCH_ENDED` state emits zero movement/fire intent.
- Regression test passes.
- Lint / test:run / build green.

## Non-goals

- Do not rewrite the bot's state machine beyond adding MATCH_ENDED.
- Do not change match-win-condition logic in `gameModeManager`.
- Do not change the capture-duration arguments; this is an early-halt, not a duration change.

## Hard stops

- `gameModeManager` does not expose an `isMatchEnded` equivalent → propose exposing one (not on `SystemInterfaces.ts` unless unavoidable) or escalate.
- Fence change → STOP.
