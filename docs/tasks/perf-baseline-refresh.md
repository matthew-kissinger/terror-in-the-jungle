# perf-baseline-refresh: rebaseline all four scenarios on the new harness

**Slug:** `perf-baseline-refresh`
**Cycle:** `cycle-2026-04-19-harness-flight-combat`
**Depends on:** `perf-harness-architecture` (must capture on the new runner so baselines reflect the declarative scenario path, not the reverted imperative driver), `heap-regression-investigation` (fix must land first or we bake the leak into fresh baselines)
**Blocks (in this cycle):** nothing — this is the cycle closer
**Playtest required:** no (pure measurement)
**Estimated risk:** low — measurement + commit. Risk is operator error (capturing on a dirty working tree, accidentally baselining a degraded run).
**Files touched:** `perf-baselines.json` (rewritten via `npm run perf:update-baseline`), new `artifacts/perf/<timestamp>/` captures committed for evidence (or referenced by SHA if repo policy is to keep artifacts out of git).

## Why this task exists

`perf-baselines.json` was last updated **2026-03-06** — 45+ days before this cycle starts. Its thresholds are stale in both directions:

- Combat120 p99 is set at **100 ms**, reality (as of current captures) is **~30 ms**. The file fails-open: regressions don't fire.
- Heap growth thresholds predate the +296% combat120 regression the previous cycle surfaced. Post-fix, those thresholds will still be loose relative to the now-much-cleaner heap behavior.

The refresh was explicitly deferred from the 2026-04-18 cycle because: (1) the perf-active-driver was unreliable (A4 direction-inversion bug → revert), and (2) any baseline captured against the reverted imperative driver would be obsolete the moment the new declarative harness ships.

This task captures fresh baselines across all four scenarios using the new harness, commits them, and records the capture methodology so the next rebaseline can be reproduced.

## Required reading first

- `perf-baselines.json` — current shape. Note the per-scenario `thresholds` object with 8 metrics (`avgFrameMs`, `p95FrameMs`, `p99FrameMs`, `maxFrameMs`, `hitch50Pct`, `hitch100Pct`, `overBudgetPct`, `heapGrowthMb`) plus `lastMeasured` metadata.
- `scripts/perf-capture.ts` — post-rebuild, understand how the new runner emits `summary.json` / `validation.json` / `replay.json`. If the artifact shape changed, `perf-compare.ts` / `perf-update-baseline` may need a small adapter update.
- `scripts/perf-compare.ts` — in particular the `--update-baseline` code path (around line 100–200 in the pre-rebuild version).
- `package.json` perf scripts — confirm the 4 scenario commands still exist with same names:
  - `perf:capture:combat120` (ai_sandbox, 120 NPCs, 90s + 15s warmup)
  - `perf:capture:openfrontier:short` (open_frontier, 120 NPCs, 180s)
  - `perf:capture:ashau:short` (a_shau_valley, 60 NPCs, 180s)
  - `perf:capture:frontier30m` (open_frontier, 120 NPCs, 30-min soak)
- `docs/TESTING.md` (marginally — this task is measurement, not feature work).

## Steps

1. Confirm branch is clean and on latest master with both the harness rebuild and the heap fix merged in.
2. Run a smoke capture: `npm run perf:capture:combat120`. Verify the artifact lands with `validation.json` showing all validators pass (min-shots, min-engagements, max-stuck-seconds — these come from the harness rebuild). A failed validation means the harness is unhealthy; STOP and escalate.
3. Run all four captures **back-to-back on the same machine** to minimize cross-machine noise:
   - `npm run perf:capture:combat120`
   - `npm run perf:capture:openfrontier:short`
   - `npm run perf:capture:ashau:short`
   - `npm run perf:capture:frontier30m`
4. For each capture, run `npm run perf:compare` and record current-vs-old-baseline deltas in a scratchpad. Expect large drops on p99 (stale 100 ms → real ~30 ms on combat120) and on heap growth (post-fix).
5. Pick threshold values:
   - **pass threshold:** measured p99 × 1.15 (15% headroom for normal variance).
   - **warn threshold:** measured p99 × 1.05 (5% headroom).
   - Heap growth: measured × 1.3 (heap varies more run-to-run than frame time).
   - Hitch rates: measured + 0.5% absolute for pass, + 0.2% for warn.
   - Do not pick values tighter than the measured range — flakes will poison CI.
6. Run `npm run perf:update-baseline` to write the new thresholds. If the script supports per-scenario updates, do them one at a time so each PR section is easy to review.
7. Update `lastUpdated` in `perf-baselines.json` to today (the script should do this; verify).
8. Capture the four `artifacts/perf/<timestamp>/` directories and either (a) commit them to the repo under `docs/perf/baselines-cycle-2026-04-19/` or (b) reference them by SHA in the rearch memo — check prior convention by listing what's in `artifacts/` or `docs/perf/` on master. Default to option (b) unless the repo has historically committed artifacts.
9. Write `docs/rearch/perf-baselines-refresh-2026-04-19.md` documenting:
   - The 4 measured values per scenario (p50 / p95 / p99 / max / heap growth).
   - The chosen thresholds and the headroom multipliers.
   - Machine context (CPU model, browser version, Three.js version).
   - Any scenario that was hard to reproduce consistently — flag it so future rebaselines know where the noise is.
10. `npm run lint`, `npm run test:run`, `npm run build` green.
11. Confirm `npm run perf:compare` passes against the new baselines for a second back-to-back combat120 capture. If it fails the second time, thresholds are too tight — bump the headroom.

## Exit criteria

- `perf-baselines.json` `lastUpdated` is today's date and all 4 scenarios have refreshed thresholds.
- Second back-to-back combat120 capture passes `npm run perf:compare` cleanly.
- `docs/rearch/perf-baselines-refresh-2026-04-19.md` exists with measured values, chosen thresholds, and machine context.
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not change the perf scenario definitions (map, NPC count, duration) — those are the harness rebuild's scope if they change at all.
- Do not add new perf scenarios — this is a refresh, not expansion.
- Do not modify `scripts/perf-compare.ts` or `perf-capture.ts` beyond any tiny adapter bug exposed by running on the new harness. If a bigger fix is needed, flag and stop.
- Do not relitigate the heap regression — if the fix is on master, capture against it. If heap numbers still look bad, STOP and escalate rather than papering over with loose thresholds.

## Hard stops

- Any scenario's `validation.json` shows a validator failure — STOP. Harness is unhealthy; baseline capture would be meaningless.
- Measured p99 or heap is worse than the stale baseline said — STOP. Either the harness rebuild regressed perf, the heap fix didn't land cleanly, or the capture ran on unclean state. Investigate before committing.
- Threshold choice would loosen pass/warn boundaries vs the current `perf-baselines.json` for any metric — STOP. This task should tighten thresholds, not loosen them. A loosening means something went backward.
- Second back-to-back capture fails compare — thresholds are too tight. Bump headroom to the smallest value that makes the second capture pass; document why.
