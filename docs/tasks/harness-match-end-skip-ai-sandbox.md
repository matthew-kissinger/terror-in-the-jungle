# harness-match-end-skip-ai-sandbox: don't latch match-end on ai_sandbox

**Slug:** `harness-match-end-skip-ai-sandbox`
**Cycle:** `cycle-2026-04-20-atmosphere-foundation` *(close-out fix)*
**Priority:** P0 — blocks `perf-baseline-refresh` from running combat120.
**Playtest required:** no
**Budget:** ≤ 50 LOC.
**Files touched:**
- `scripts/perf-active-driver.cjs` (gate `detectMatchEnded` on mode, or
  add a per-mode override so ai_sandbox is excluded)
- `scripts/perf-harness/perf-active-driver.test.js` (regression tests)

## Symptom (orchestrator-observed 2026-04-20)

`perf-baseline-refresh` executor ran `npm run perf:capture:combat120` against
post-Round-3 master. Match-end latched at t=1.0s with `outcome=draw`,
capture finalized at 3.6s wall-clock with 3 samples (vs requested 72).
Validation failed (`harness_min_shots_fired=7`, `samples_collected=3`,
`heap_recovery_ratio=0`).

Capture log line:
```
[2026-04-20T02:51:56.074Z] 🏁 Match ended at t=1.0s (outcome=draw); finalizing in 2.0s
```

## Root cause

`scripts/perf-active-driver.cjs:406-409` — `detectMatchEnded(gameState)`
returns `true` when `gameState.phase === 'ENDED'` OR
`gameState.gameActive === false`.

For `ai_sandbox` mode, `TicketSystem` reports `phase === 'ENDED'` from
the start (no tickets, no faction objective, "no winner = draw"). The
match-end latch fires on the very first sample tick of the harness,
ending the capture immediately. PR #99's verification was unit tests of
pure helpers, not a live combat120 capture, so this regression slipped
through CI.

## Fix sketch

Gate `detectMatchEnded` on the requested capture mode. The simplest
shape: pass `mode` (or a boolean `hasWinCondition`) into the
`detectMatchEnded` call site in the driver tick, and return `false`
immediately for `ai_sandbox`.

Mode is already known to the driver (it's threaded through
`scenarioConfig` / `harnessProfile`). Pick whichever ergonomic plumbing
is cheapest:

1. Add a `hasWinCondition: boolean` to the per-mode profile config; pass
   to `detectMatchEnded` as a third argument or read from state.
2. OR: hardcode the mode skiplist inside `detectMatchEnded` itself
   (`if (mode === 'ai_sandbox') return false;`). Less clean but smaller.

Either works. Behavior tests must cover:

- `ai_sandbox` with `phase==='ENDED'` → returns `false` (capture continues).
- `open_frontier` with `phase==='ENDED'` and `winner` set → returns `true`.
- `team_deathmatch` with `gameActive===false` → returns `true`.
- `zone_control` with `phase==='SETUP'` → returns `false`.

## Exit criteria

- `detectMatchEnded` returns `false` for `ai_sandbox` regardless of
  `phase` / `gameActive`.
- `npm run perf:capture:combat120` runs to completion (~90s + 15s warmup,
  ~72 samples collected, `validation.json.overall === 'pass'` or `'warn'`,
  not `'fail'`).
- New unit tests in `scripts/perf-harness/perf-active-driver.test.js` pin
  the per-mode behavior.
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not fix the underlying `TicketSystem` ai_sandbox lifecycle. That's
  pre-existing engine state and is out of scope here.
- Do not change the `MATCH_ENDED` bot state, the capture's tail-window
  flush logic, or the `summary.json` shape.
- Do not change the win-condition logic for the other three modes.

## Hard stops

- Fix requires touching `src/types/SystemInterfaces.ts` → STOP, fence change.
- Fix requires changing engine code (TicketSystem, GameModeManager) → STOP,
  this is a harness-only fix.
- Fresh combat120 capture STILL ends early after the fix → STOP and
  investigate; the latch is on something other than `detectMatchEnded`.
