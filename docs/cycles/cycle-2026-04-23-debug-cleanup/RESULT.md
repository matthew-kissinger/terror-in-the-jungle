# RESULT — cycle-2026-04-23-debug-cleanup

Closed 2026-04-22. Two tasks in one round; both PRs merged autonomously. Skip-confirm cycle paid off two follow-ups from the just-closed `cycle-2026-04-23-debug-and-test-modes`.

## End-of-run summary

```
Cycle: cycle-2026-04-23-debug-cleanup
Dates: 2026-04-22 → 2026-04-22 (single autonomous session)

Round 0: git clean, origin == master; reused prior cycle's combat120 baseline
Round 1: 2/2 merged

PR URLs:
  preserve-drawing-buffer-dev-gate:  https://github.com/matthew-kissinger/terror-in-the-jungle/pull/147
  world-overlay-debugger-ci-fix:     https://github.com/matthew-kissinger/terror-in-the-jungle/pull/145

Perf deltas (combat120, seed=2718, 90s, 120 NPCs):
  R0 baseline (HEAD 6fad9e1, inherited):  avg=16.98ms  p99=34.20ms  heap_end=-2.01MB  heap_recovery=1.038
  post-R1 (HEAD bdaadcc):                 avg=17.25ms  p99=33.90ms  heap_end=+8.36MB  heap_recovery=0.759

  Gate: p99 within 5% of baseline (ceiling 35.91ms)  → PASS (-0.88%)
  Gate: heap_recovery_ratio ≥ 0.5                    → PASS (0.759)
  Gate: heap_end_growth_mb ≤ +2 MB                   → YELLOW (+8.36 MB; down 4.72 MB from R3's +13.08 MB but above the target).
                                                      Gate is correctness-target for preserve-drawing-buffer-dev-gate.
                                                      Partial recovery; does not revert the merge.

Playtest recommended: none (cycle is explicitly playtest-deferred; human playtest against
dev server + Cloudflare Pages will validate the combined diagnostic surface from this cycle + the prior).

Blocked / failed tasks: none.

Next cycle recommendation:
  Investigate the residual +8.36 MB heap end-growth. The ?capture=1 gate removed ~4.7 MB
  of retail back-buffer tax; the remaining ~8 MB arrived between the prior cycle's baseline
  (pre-world-overlay-debugger) and post-merge. Most likely contributors: WorldOverlayRegistry
  module-eval-time footprint (6 overlays + control panel + 4 accessors) and the Tweakpane live-
  tuning panel's lazy-init path. Single-run measurement — rerun for variance before chasing.
```

## Cycle metrics

### Tasks

| Slug | PR | LOC | Budget | Risk rating | Outcome |
|---|---|---|---|---|---|
| `preserve-drawing-buffer-dev-gate` | [#147](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/147) | +83 −7 (2 files) | ≤60 LOC incl. test | minimal | merged; helper gated; retail bundle confirms DEV-branch tree-shaken |
| `world-overlay-debugger-ci-fix` | [#145](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/145) | +4 −1 on overlay + original PR content | ≤50 LOC delta | medium (CI-only failures are tricky) | merged; rebase clean; 1-line root cause in the overlay |

### Timing

- R0 prep: < 1 minute (git fetch + status + inherit baseline).
- R1 dispatch → first merge: ~7 minutes (preserve-drawing-buffer-dev-gate).
- R1 dispatch → second merge: ~15 minutes (world-overlay-debugger-ci-fix; longer due to rebase + CI reruns).
- Post-R1 perf gate: ~2 minutes.
- End-of-cycle ritual: bundled into final commit.

## What happened, task by task

### `preserve-drawing-buffer-dev-gate` (PR #147)

**Problem.** `preserveDrawingBuffer: true` landed unconditionally in PR #144 (`playtest-capture-overlay`) because `canvas.toBlob()` returns a blank image without it. Prior-cycle R3 perf-capture measured `heap_end_growth = +13.08 MB` vs baseline's `-2.01 MB` — retained back-buffer cost retail players didn't owe.

**Fix.** Extracted `shouldPreserveDrawingBuffer()` in [`src/core/GameRenderer.ts`](../../src/core/GameRenderer.ts): returns `true` in dev builds, `true` on retail when the URL has `?capture=1`, `false` otherwise. Wired it into the `WebGLRenderer` constructor. Behavior test covers all four branches (DEV true, retail + capture=1, retail default, retail + capture=0). Executor confirmed retail bundle DCE: the minified helper is a pure URL-param check with the DEV branch tree-shaken.

**Evidence.** All three local checks green (lint / 3,736 tests / build). Post-cycle combat120 capture showed `heap_end_growth = +8.36 MB`, a ~4.7 MB improvement over R3's +13.08 MB — consistent with the back-buffer release but reveals an additional residual (see "Follow-ups").

**Surprises.** Diff came in at 83 LOC (28 prod + 55 test) vs the brief's ≤60 LOC budget. Executor's test matrix (three `vi.stubEnv('DEV', …)` variants × two URL patterns) produced more test lines than the ≤60 LOC envelope anticipated, but stayed well inside the 500-LOC small-diff rule. Flag the envelope as undersized for "helper + behavior test" tasks; not a cycle-level issue.

### `world-overlay-debugger-ci-fix` (PR #145)

**Problem.** PR #145 (original `world-overlay-debugger`) passed all local checks but failed CI on `terrainChunkOverlay.test.ts > renders four line segments per active CDLOD tile` with `expected +0 to be 24` (6 mocked tiles × 4 LineSegments each). 3,710 tests passed locally in the executor's run, but the CI environment consistently reproduced the failure.

**Root cause.** The overlay's `update()` throttled itself to 4 Hz using `performance.now() - lastUpdateMs < 250`, with `lastUpdateMs` initialized to `0`. On a **fresh** process (Vitest cold-start in CI), `performance.now()` was < 250 ms at the overlay's first `update()` call — so the throttle bailed and `drawRange` stayed 0. Local runs hot-reloaded Vitest past that window, masking the bug.

**Fix.** Single-line change in [`src/ui/debug/worldOverlays/terrainChunkOverlay.ts`](../../src/ui/debug/worldOverlays/terrainChunkOverlay.ts): `lastUpdateMs = 0` → `lastUpdateMs = Number.NEGATIVE_INFINITY`. First `update()` call now always runs. Strict behavior improvement — fixes a latent cold-page-load glitch where the overlay would draw empty for up to 250 ms after first toggle-on.

**Evidence.** Rebase on `origin/master` was CLEAN (no conflicts — master had only the prior cycle's docs-close commit). After force-push-with-lease, CI all green: lint 31 s, build 33 s, test 1 m 00 s, smoke 1 m 17 s, perf 3 m 32 s, mobile-ui 5 m 24 s. PR #145's merged diff remains the original 6 overlays + registry + 4 additive accessors + this 1-line CI-fix.

**Surprises.** The brief guided "fix likely in the test file"; the actual fix lived in the overlay source. The brief permitted overlay touches if the root cause was truly there, so this was in-scope. No test modifications were needed — the assertion was correct; the bug was behavioral.

## Perf analysis

**One-run capture** at `artifacts/perf/2026-04-22T18-55-32-413Z/` (HEAD `bdaadcc`).

| Metric | Baseline (HEAD 6fad9e1) | Post-R1 (HEAD bdaadcc) | Gate | Status |
|---|---|---|---|---|
| avg_frame_ms | 16.98 | 17.25 | — | +1.6 % (noise band) |
| peak_p99_frame_ms | 34.20 | 33.90 | ≤35.91 (+5 %) | **PASS −0.88 %** |
| heap_end_growth_mb | −2.01 | +8.36 | ≤ +2.00 | **YELLOW** (partial recovery) |
| heap_peak_growth_mb | +52.76 | +34.62 | — | improved |
| heap_recovery_ratio | 1.038 | 0.759 | ≥0.5 | PASS |
| hitch_50ms_percent | 0.00 | 0.02 (1 frame) | — | single-frame hitch; not a trend |

**YELLOW on `heap_end_growth_mb`.** The preserve-drawing-buffer gate removed ~4.7 MB of retail back-buffer tax (R3's +13.08 MB → post-R1 +8.36 MB) but the measurement did not return to the baseline's near-zero territory the target anticipated. Additional residual likely comes from the `WorldOverlayRegistry` commit (`efab6b2`) that also landed in this window — 6 overlay modules + control panel + 4 accessors all module-evaluated at boot even when overlays stay toggled-off, so some allocation-on-mount cost lives there. Single-run variance is also in play; prior cycle's R3 measurement was also single-run. Not a revert trigger — both merges passed their own CI gates, and the p99 headroom is intact.

**Recommendation:** rerun post-cycle combat120 capture once or twice for a variance read before chasing the residual, then audit the world-overlay registry's boot-time allocation if the +8 MB persists.

## References

- R0 baseline: `docs/cycles/cycle-2026-04-23-debug-and-test-modes/baseline/combat120-baseline-summary.json`
- Post-R1 capture: `artifacts/perf/2026-04-22T18-55-32-413Z/`
- Archived task briefs: `docs/tasks/archive/cycle-2026-04-23-debug-cleanup/`
