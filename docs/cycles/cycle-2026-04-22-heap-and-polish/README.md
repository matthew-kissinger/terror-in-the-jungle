# cycle-2026-04-22-heap-and-polish — Plan

**Cycle ID:** `cycle-2026-04-22-heap-and-polish`
**Opened:** 2026-04-22 (intended for a morning-after autonomous session following the close of `cycle-2026-04-22-flight-rebuild-overnight`).
**Shape:** small polish cycle — 3 tasks across two sequential rounds. Autonomous-safe.

## Why this cycle exists

The prior cycle (`cycle-2026-04-22-flight-rebuild-overnight`, closed in commit `c7866bf`) landed the fixed-wing + airfield fixes but surfaced three follow-ups that belong in a tight next pass:

1. **Heap-recovery regression in combat120.** The post-Round-3 perf capture went from `heap_growth_mb` 9.5 → 53.2 MB and `heap_recovery_ratio` 0.88 → 0.12 vs the Round-0 baseline. The p99 frame-time gate (≤5%) is GREEN (+2.7%), so the cycle correctly did not block on this — but it is the single most important unknown left in the tree, and it showed up *after* thirteen simultaneous merges landed, so there is no bisect data. Root cause is a direct investigation.
2. **Helicopter PlayerController pose feed.** PR #124 fixed `FixedWingModel.ts:365` to feed interpolated pose to `PlayerController`. `HelicopterModel.ts:549` has the exact same raw-vs-interpolated bug against `state.position` and was flagged out-of-scope by the executor. The interpolated source (`helicopter.position`) is already in scope at line 534 of the same function.
3. **A-1 Skyraider altitude-hold recapture regression.** PR #126 (altitude-hold unification) engages the Airframe PD in normal flight, but its `±0.15` elevator clamp at `Airframe.ts:347-348` saturates for the Skyraider's high thrust-to-weight at cruise throttle. Recapture-after-pitch-release regressed 175m → 463m for A-1; F-4/AC-47 improved. Brief forbade gain retuning so the regression landed as a trade; now is the right time to fix the clamp per-aircraft.

## Tasks in this cycle

Each has a brief at `docs/tasks/<slug>.md`.

- **Round 1 (solo, P0):** `heap-recovery-combat120-triage`
- **Round 2 (2 parallel, P1):**
  - `helicopter-interpolated-pose`
  - `a1-altitude-hold-elevator-clamp`

## Round schedule

```
Round 0 (orchestrator prep)
  -> Round 1 (1 task solo)
      -> Round 2 (2 tasks parallel)
```

No inter-task blocking within Round 2 (they touch different files and subsystems).

## Round 0 (orchestrator prep)

1. `git fetch origin && git status` (must be clean; behind → fast-forward pull).
2. Reuse the Round-3 perf capture from the prior cycle as the heap baseline — it is the "as-merged" state. File: `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/perf-after-round3.json` (+ `perf-after-round3-validation.json`). No fresh capture required at Round 0.
3. Confirm baseline rehashed numbers for reference (for the RESULT summary): avg=14.21ms, p99=34.50ms, heap_growth=53.25MB, heap_recovery_ratio=0.12.
4. Create this cycle's `evidence/` dir (already present; leave empty).

## Concurrency cap

2 (only Round 2 has parallelism).

## Dependencies

```
Round 0
  -> heap-recovery-combat120-triage (solo)
      -> helicopter-interpolated-pose  ┐
      -> a1-altitude-hold-elevator-clamp ┘ parallel
```

Round 2 does NOT block on Round 1's fix landing; a diagnostic memo from Round 1 is sufficient to unblock Round 2.

## Playtest policy

DEFERRED. No playtest gate BLOCKS merge. Playtest-recommended PRs are flagged in RESULT.md.

## Perf policy

- **Baseline:** `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/perf-after-round3.json` (the as-merged state at cycle close).
- **Gate:** post-Round-2 `npm run perf:capture:combat120`. Two thresholds:
  - p99 frame time within 5% of baseline (same as prior cycle).
  - `heap_recovery_ratio` ≥ 0.5 (tighter than the default; this cycle's explicit purpose includes heap). If the triage task lands a fix, expect recovery back toward the pre-cycle baseline of 0.88. If it's memo-only, this gate may still fail — that is acceptable; record in RESULT.md.

## Failure handling (autonomous-safe)

Same as the prior cycle:
- CI red on a task → mark `blocked`, record, continue.
- Fence-change proposal (`fence_change: yes`) → mark `blocked`, record, DO NOT merge.
- Probe-assertion fail post-merge → revert if possible; otherwise `rolled-back-pending` in RESULT.md.

## Visual checkpoints (orchestrator-gated)

NONE. Autonomous run.

## skip-confirm

YES. Orchestrator does NOT pause between rounds.

## Cycle-specific notes

- `heap-recovery-combat120-triage` is an investigative P0: the executor may deliver EITHER a targeted code fix OR a diagnostic memo at `docs/rearch/HEAP_RECOVERY_COMBAT120_TRIAGE.md`. Pick the higher-confidence option. A memo is not a failure; it unblocks a future targeted fix with the bisect data in hand.
- `helicopter-interpolated-pose` mirrors PR #124. Executor should keep the diff tight (≤100 LOC) and copy the `FixedWingModel.test.ts` behavior-test pattern (L2 + L3) for the helicopter side.
- `a1-altitude-hold-elevator-clamp` should add a per-aircraft `altitudeHoldElevatorClamp` to `FixedWingConfigs.ts` (default 0.15, A-1 at 0.30-0.35 based on probe). Widen the clamp at `Airframe.ts:347-348` to read from config instead of the literal.
- Helicopter must not regress (scope touches HelicopterModel.ts). terrain-nav-reviewer is NOT needed for any of these tasks (combat-reviewer also not needed); reviewer rules per `docs/AGENT_ORCHESTRATION.md` do not trigger.

## Post-cycle ritual

Standard (per `docs/AGENT_ORCHESTRATION.md` "Cycle lifecycle"):
1. `git mv docs/tasks/<slug>.md docs/tasks/archive/cycle-2026-04-22-heap-and-polish/<slug>.md` for each merged brief.
2. Append `## Recently Completed (cycle-2026-04-22-heap-and-polish, <date>)` to `docs/BACKLOG.md`.
3. Reset "Current cycle" in `docs/AGENT_ORCHESTRATION.md` to the empty stub.
4. Write `docs/cycles/cycle-2026-04-22-heap-and-polish/RESULT.md`.
5. Commit as `docs: close cycle-2026-04-22-heap-and-polish`.
