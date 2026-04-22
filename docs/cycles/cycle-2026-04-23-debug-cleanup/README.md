# cycle-2026-04-23-debug-cleanup — Plan

**Cycle ID:** `cycle-2026-04-23-debug-cleanup`
**Opened:** 2026-04-22 (follow-up to `cycle-2026-04-23-debug-and-test-modes`; intended for a short autonomous session when the human returns after playtesting the new diagnostic surface).
**Shape:** minimal cleanup cycle — 2 tasks, one round, parallel. Autonomous-safe.

## Why this cycle exists

Two follow-ups from the just-closed `cycle-2026-04-23-debug-and-test-modes` want to be paid off before the next feature cycle starts:

1. **`preserveDrawingBuffer: true` on `WebGLRenderer` is unconditional.** PR #144 (playtest-capture-overlay) required this for F9 capture to work. Post-merge perf-analyst measured `heap_end_growth = +13.08 MB` on retail vs baseline's `-2.01 MB` — pure tax on players who never press F9. Trivial gate: `import.meta.env.DEV || ?capture=1`.
2. **PR #145 `world-overlay-debugger` is blocked on a CI-only test failure.** The executor's self-report shows 3710 tests green locally; CI's test step failed `src/ui/debug/worldOverlays/terrainChunkOverlay.test.ts > renders four line segments per active CDLOD tile` with `expected +0 to be 24`. The six overlays (navmesh / LOS / squad influence / LOD tier / aircraft contact / terrain chunks) are genuinely useful for the upcoming playtest and should not sit indefinitely. Most likely root cause is a mock stub ordering issue in the CI environment; fix is probably < 10 LOC in the test file.

## Tasks in this cycle

Each has a brief at `docs/tasks/<slug>.md`.

- **Round 1 (2 parallel, both disjoint):**
  - `preserve-drawing-buffer-dev-gate` (P0, ≤60 LOC) — gate the flag behind DEV or `?capture=1`.
  - `world-overlay-debugger-ci-fix` (P1, ≤50 LOC test delta) — rebase PR #145 + fix the terrainChunkOverlay test.

## Round schedule

```
Round 0 (orchestrator prep — optional; no deps to install, no baseline to recapture)
  -> Round 1 (2 parallel)
       -> post-Round-1 perf gate (combat120 heap_end_growth + p99)
```

**Round 0 (orchestrator prep):** `git fetch origin && git status` (must be clean). No `npm install` needed (Tweakpane already on master). No fresh Round-0 baseline needed — reuse `docs/cycles/cycle-2026-04-23-debug-and-test-modes/baseline/combat120-baseline-summary.json` as the reference point, since master HEAD has not drifted.

## Concurrency cap

2 (Round 1 uses both slots; no other rounds).

## Dependencies

```
Round 0 (sanity check)
  -> preserve-drawing-buffer-dev-gate  ┐
  -> world-overlay-debugger-ci-fix     ┘─ R1 parallel (fully disjoint file sets)
```

No soft deps between the two.

## Playtest policy

DEFERRED. No playtest gate BLOCKS merge. The human will playtest dev server + Cloudflare Pages AFTER this cycle merges, using the diagnostic surface shipped in the prior cycle plus the corrected retail heap behavior + world-overlay visualizations.

## Perf policy

- **Baseline:** inherited from `cycle-2026-04-23-debug-and-test-modes` R0 capture (`docs/cycles/cycle-2026-04-23-debug-and-test-modes/baseline/combat120-baseline-summary.json`). avg=16.98ms, p99=34.20ms, heap_end_growth=-2.01 MB, heap_recovery=1.038.
- **Gate:** post-Round-1 `npm run perf:capture:combat120`. Three thresholds:
  - p99 within 5% of baseline.
  - `heap_recovery_ratio` ≥ 0.5.
  - `heap_end_growth_mb` ≤ +2 MB (should move the R3 +13 MB back toward baseline; this is the gate for task 1's correctness).

## Failure handling (autonomous-safe)

- CI red on a task → mark `blocked`, record, continue.
- Fence-change proposal (`fence_change: yes`) → mark `blocked`, record, DO NOT merge.
- `world-overlay-debugger-ci-fix` >50 LOC fix or second CI red after the first push → STOP that task, mark blocked, cycle degrades to single-task. PR #145 stays open for a future dedicated pass.

## Visual checkpoints (orchestrator-gated)

NONE. Autonomous run.

## skip-confirm

YES. Orchestrator does NOT pause between R0 sanity check and R1 dispatch.

## Cycle-specific notes

- **No reviewers expected.** Task 1 touches only `src/core/GameRenderer.ts`; Task 2 touches only `src/ui/debug/worldOverlays/terrainChunkOverlay.test.ts` (and possibly 1–2 lines of `TerrainRenderRuntime.ts`). Neither triggers combat-reviewer or terrain-nav-reviewer on its own. PR #145's original content already landed past reviewer scope and the fix is diagnostic, not functional.
- **Task 2's hard stop is real.** If the CI-fix requires accessor rework, do NOT iterate past 50 LOC — leave PR #145 blocked for a future cycle. The cleanup cycle's job is not to rescue arbitrarily hard blocks.
- **Both tasks are additive**. No retired code to delete, no feature flags to flip, no rollout needed.

## Pre-flight acknowledgement

The prior cycle, `cycle-2026-04-23-debug-and-test-modes`, closed on 2026-04-22 with 6 merged PRs (#139–#144, #146) and 1 blocked PR (#145, rebasable — addressed by this cycle's task 2). See `docs/BACKLOG.md` "Recently Completed (cycle-2026-04-23-debug-and-test-modes, 2026-04-22)" and `docs/cycles/cycle-2026-04-23-debug-and-test-modes/RESULT.md`.
