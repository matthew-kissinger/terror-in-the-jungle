# Task: phase-f-determinism-pilot

Last verified: 2026-05-09

Cycle: `cycle-2026-05-16-phase-f-ecs-and-cover-rearch` (F4)

## Goal

Establish single-machine determinism for the combat hot path. Add `SimClock`
and `SimRng` infrastructure. Record + replay a 30-second combat scenario
byte-identical (combatant positions + zone state hash).

## Why

Plan reference: Phase 4 § F4. Resumes [docs/rearch/E5 (deterministic-sim
spike)] memo intent — Phase E never landed it.

Determinism unlocks:
- Reliable perf regression testing (same scenario → same numbers)
- Agent training (Phase E4) without noise
- Bug repro ("here's the replay")
- Rollback for networking (future)

## Required reading first

- `docs/REARCHITECTURE.md` E5 section
- `src/core/SeededRandom.test.ts` (existing seeded random tests — establishes the test pattern)
- `src/core/ReplayRecorder.test.ts` and `ReplayPlayer.test.ts` — existing replay shells (may already exist as Phase E5 stubs)
- `docs/CARRY_OVERS.md` — note that this doesn't close any current carry-over but unlocks new ones

## Files touched

### Created (or extended if E5 stubs exist)

- `src/core/SimClock.ts` — deterministic clock that wraps `performance.now()` calls in the combat hot path (≤200 LOC)
- `src/core/SimRng.ts` — seeded RNG that wraps `Math.random()` callers (≤150 LOC)
- `src/core/ReplayRecorder.ts` — captures inputs + initial state to JSON (≤300 LOC)
- `src/core/ReplayPlayer.ts` — replays from JSON; verifies frame-by-frame state hash (≤300 LOC)
- Each + `*.test.ts`

### Modified

- All combat hot-path callers of `performance.now()` and `Math.random()` route through `SimClock` / `SimRng`. Use `npm run grep "performance.now\|Math.random"` to enumerate.
- `package.json` — add `npm run test:determinism` scaffold (already exists per current package.json — extend)

## Steps

1. `npm ci --prefer-offline`.
2. Audit: enumerate every call to `performance.now()` and `Math.random()` in `src/systems/combat/`. List them.
3. For each call: refactor to use `SimClock.now()` / `SimRng.next()`.
4. Author `ReplayRecorder` — captures input events + seed at session start; appends inputs per frame.
5. Author `ReplayPlayer` — given the JSON, replays inputs against a fresh engine, asserts frame-N state hash matches.
6. Add a 30-second combat scenario as the "determinism pilot": deterministic seed, 120 NPCs, AI Sandbox.
7. Record once. Replay 5 times. All 5 must produce byte-identical state hashes.
8. **If replay diverges:** identify the first divergence frame. Trace back to the source of non-determinism. Fix or document.

## Verification

- `npm run test:determinism` — green (existing tests + new SimClock + SimRng + Replay tests)
- `npm run perf:capture:combat120` after the SimClock refactor — p99 within ±2% (no regression from indirection)
- Determinism pilot script: record once, replay 5 times — all byte-identical state hashes

## Non-goals

- Do NOT migrate non-combat hot paths (UI animations, terrain streaming, etc.) — combat only.
- Do NOT attempt cross-machine determinism — single-machine only.
- Do NOT block on Phase F1 outcome (works on either OOP or ECS combatants).

## Branch + PR

- Branch: `task/phase-f-determinism-pilot`
- Commit: `feat(core): single-machine determinism — SimClock + SimRng + Replay (phase-f-determinism-pilot)`

## Reviewer: none required (core infra; no combat or terrain logic changed)
## Playtest required: no
