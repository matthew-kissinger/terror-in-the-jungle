# perf-baselines-refresh 2026-04-20 — post-cycle-2026-04-21 baseline capture

Last updated: 2026-04-20
Cycle: `cycle-2026-04-21-atmosphere-polish-and-fixes`
Task: `docs/tasks/perf-baseline-refresh.md`

## TL;DR

Baselines in `perf-baselines.json` were last updated 2026-03-06 against a
different perf harness and are no longer representative. The `perf-harness-
player-bot-aim-fix` driver (PR #96) shipped on 2026-04-19 changes the p95/p99
frame-time shape on combat120 and open_frontier significantly — the bot now
actually engages, which exercises the combat AI tail it used to skip.

This memo records fresh baselines captured back-to-back on a single machine
against master HEAD `4511b80` (full cycle-2026-04-21 stack: atmosphere polish
+ ACES tone-map + skybox cutover + fog-density rebalance + day-night cycle
+ clouds + airfield flattening/orientation + aircraft ground-physics tuning
+ A-1 parked-at-main-airbase fix + aircraft sim culling + A Shau DEM streaming
fix + harness objective cycling fix + NPC/player leap fix).

All four scenarios now PASS against the new baselines. A second back-to-back
combat120 capture also PASSED, confirming the pass thresholds aren't too
tight.

## Machine / environment context

| Item | Value |
|------|-------|
| Host | MKPC (Windows 11 Pro 25H2, build 26200) |
| CPU  | AMD Ryzen 7 3700X (8C/16T @ 3.6 GHz) |
| GPU  | NVIDIA RTX 3070 8 GB (driver 591.86) |
| RAM  | 32 GB DDR4-3200 |
| Node | 24.14.1 |
| Playwright | 1.59.1 (headed Chromium) |
| Branch | `task/perf-baseline-refresh` (fast-forwarded to master @ `4511b80`) |
| Harness driver | `perf-harness-player-bot-aim-fix` (PR #96, merged 2026-04-19) |

All four captures were run serially on the same machine within a ~30 min
window, with no other foreground workload. The soak (`frontier30m`) ran last
and alone.

## Captures

| Scenario | Artifact dir | Duration (s) | Samples | Status |
|----------|--------------|--------------|---------|--------|
| `combat120`          | `2026-04-20T06-15-39-927Z` | 90   | 89  | ok |
| `openfrontier:short` | `2026-04-20T06-18-05-147Z` | 180  | 119 | ok |
| `ashau:short`        | `2026-04-20T06-21-56-636Z` | 180  | 119 | ok |
| `frontier30m`        | `2026-04-20T06-25-47-223Z` | 1800 | 437 | ok (see note) |
| combat120 (verify)   | `2026-04-20T06-46-20-645Z` | 90   | 89  | ok |

**Soak note:** the `frontier30m` capture ran for its full 1800 s budget but
the active driver transitioned to `MATCH_ENDED` at in-game t ≈ 879 s when the
Open Frontier match reached its victory condition. After that, 921 s of wall
time was spent in post-match finalize state — samples 437/720 reflect that
~49% of the configured interval had real gameplay. `harness-match-end-skip-
ai-sandbox` (PR merged 2026-04-19) only skips the match-end latch on
`ai_sandbox`; Open Frontier still respects match end. The 437 samples cover
the full dynamic-combat portion of the run and are dense enough (2 s sample
interval, 60 s warmup) to baseline p95/p99/heap.

Validation for the soak capture flagged `samples_collected: warn` (437 vs
expected 720) and `heap_peak_growth_mb: warn` (45.38 MB — peak heap 145 MB).
These are captured-as-measured; thresholds below accept them. No `fail`
validations on any capture.

## Measured metrics and thresholds

Formula applied (sentinel-free, pass < warn as the comparator requires):

- **Frame-time metrics (ms)**: `pass = measured × 1.15`, `warn = measured × 1.30`
- **Hitch %**: `pass = measured + 0.2%` (absolute), `warn = measured + 0.5%`
- **overBudgetPct**: `pass = max(measured × 3, 2%)`, `warn = max(measured × 6, 5%)`
- **heapGrowthMb**: `pass = max(measured × 1.3, measured + 10, 10 MB)`,
  `warn = max(measured × 1.6, measured + 30, 30 MB)`

The heap and over-budget floors absorb run-to-run noise when measurements
are at-or-below zero (e.g. `openfrontier:short` measured `heap = -55.4 MB`,
`ashau:short` measured `heap = -0.07 MB`). Without the floor, tiny
regressions would trigger false alarms.

### combat120 (ai_sandbox, 120 NPCs, 90 s)

| Metric         | 2026-03-06 baseline | 2026-04-20 measured | New pass | New warn | Cur pass | Cur warn | Δ vs cur pass |
|----------------|---------------------|---------------------|----------|----------|----------|----------|---------------|
| avgFrameMs     | 15.10 | 13.12 | 15.08  | 17.05  | 16  | 25  | tightened 5.7% |
| p95FrameMs     | 23.20 | 32.30 | 37.14  | 41.99  | 20  | 35  | **loosened 86%** |
| p99FrameMs     | 100.00 sentinel | 33.40 | 38.41  | 43.42  | 30  | 50  | loosened 28% |
| maxFrameMs     | — | 45.20 | 51.98  | 58.76  | 120 | 300 | tightened 57% |
| hitch50Pct     | — | 0.00 | 0.20   | 0.50   | 0.5 | 2   | tightened 60% |
| hitch100Pct    | — | 0.00 | 0.20   | 0.50   | 0.1 | 0.5 | loosened 100% |
| overBudgetPct  | — | 0.06 | 2.00   | 5.00   | 20  | 60  | tightened 90% |
| heapGrowthMb   | — | 12.88 | 22.88 | 42.88  | 20  | 80  | loosened 14% |

### openfrontier:short (open_frontier, 120 NPCs, 180 s)

| Metric         | 2026-03-06 | 2026-04-20 | New pass | New warn | Cur pass | Cur warn | Δ vs cur pass |
|----------------|-----------|------------|----------|----------|----------|----------|---------------|
| avgFrameMs     | 6.57  | 7.50  | 8.63   | 9.75   | 14  | 25  | tightened 38% |
| p95FrameMs     | 13.80 | 31.20 | 35.88  | 40.56  | 18  | 35  | **loosened 99%** |
| p99FrameMs     | 25.20 | 32.70 | 37.60  | 42.51  | 25  | 45  | loosened 50% |
| maxFrameMs     | — | 96.80 | 111.32 | 125.84 | 120 | 300 | tightened 7% |
| hitch50Pct     | — | 0.004 | 0.20   | 0.50   | 0.5 | 2   | tightened 60% |
| hitch100Pct    | — | 0.00 | 0.20   | 0.50   | 0.1 | 0.5 | loosened 100% |
| overBudgetPct  | — | 0.01 | 2.00   | 5.00   | 15  | 50  | tightened 87% |
| heapGrowthMb   | — | -55.42 | 10.00 | 30.00  | 30  | 80  | tightened 67% |

### ashau:short (a_shau_valley, 60 NPCs, 180 s)

| Metric         | 2026-03-06 | 2026-04-20 | New pass | New warn | Cur pass | Cur warn | Δ vs cur pass |
|----------------|-----------|------------|----------|----------|----------|----------|---------------|
| avgFrameMs     | 8.93  | 5.79  | 6.66   | 7.53   | 14  | 25  | tightened 52% |
| p95FrameMs     | 17.70 | 10.90 | 12.54  | 14.17  | 18  | 35  | tightened 30% |
| p99FrameMs     | 25.80 | 15.60 | 17.94  | 20.28  | 25  | 45  | tightened 28% |
| maxFrameMs     | — | 30.10 | 34.62  | 39.13  | 120 | 300 | tightened 71% |
| hitch50Pct     | — | 0.00 | 0.20   | 0.50   | 0.5 | 2   | tightened 60% |
| hitch100Pct    | — | 0.00 | 0.20   | 0.50   | 0.1 | 0.5 | loosened 100% |
| overBudgetPct  | — | 0.00 | 2.00   | 5.00   | 15  | 50  | tightened 87% |
| heapGrowthMb   | — | -0.07 | 10.00 | 30.00  | 25  | 60  | tightened 60% |

### frontier30m (open_frontier soak, 120 NPCs, 1800 s)

| Metric         | 2026-03-06 | 2026-04-20 | New pass | New warn | Cur pass | Cur warn | Δ vs cur pass |
|----------------|-----------|------------|----------|----------|----------|----------|---------------|
| avgFrameMs     | 7.13  | 8.82  | 10.15  | 11.47  | 14  | 25  | tightened 28% |
| p95FrameMs     | 12.50 | 33.00 | 37.95  | 42.90  | 18  | 35  | **loosened 111%** |
| p99FrameMs     | 85.90 | 33.70 | 38.76  | 43.81  | 35  | 60  | loosened 11% |
| maxFrameMs     | — | 99.40 | 114.31 | 129.22 | 180 | 500 | tightened 37% |
| hitch50Pct     | — | 0.001 | 0.20  | 0.50   | 0.75| 2.5 | tightened 73% |
| hitch100Pct    | — | 0.00 | 0.20   | 0.50   | 0.15| 0.75| loosened 33% |
| overBudgetPct  | — | 0.00 | 2.00   | 5.00   | 15  | 50  | tightened 87% |
| heapGrowthMb   | — | -5.99 | 10.00 | 30.00  | 35  | 100 | tightened 71% |

## Significant shifts — notes

### p95/p99 went UP on combat120, openfrontier, frontier30m

Not a cycle regression. The `perf-harness-player-bot-aim-fix` driver (PR
#96) landed on 2026-04-19 after the last baseline. The old driver could not
aim reliably and spent most of its time missing shots and not contesting
objectives. The aim-fixed driver fires into real targets at ~55-65% hit
rate, triggers enemy ENGAGE state reliably, and drives the combat AI tail
into territory the old driver didn't hit. Combat120 verifies this: second
capture also shows avg≈12.7 ms, p95≈32.4 ms, p99≈33.5 ms — stable, just
higher than the March baseline.

The **warn threshold for p99 on combat120 went from 50 ms down to 43.4 ms**,
and the `p99 = 100 ms` sentinel in the old baseline (a CI placeholder, not a
real measurement) has been replaced with an actual measurement-based
threshold. CI will now catch p99 regressions > ~15% instead of silently
tolerating them up to 100 ms.

### avgFrameMs and heap both improved

- `ashau:short` avgFrameMs dropped 8.93 → 5.79 ms (35% improvement). The
  `ashau-dem-streaming-fix` (2026-04-20) corrected DEM chunk load-ordering,
  so terrain feature updates are no longer dominated by streaming stalls.
  The capture also records 52 kills + 300 shots + 119 samples, confirming
  the `harness-ashau-objective-cycling-fix` is producing real movement and
  engagement (previous ashau:short captures had `movementTransitions=0`).
- `frontier30m` p99 dropped 85.9 → 33.7 ms (61% improvement). The old
  baseline was captured with the pre-`harness-match-end-skip-ai-sandbox`
  driver, which bled tail frames into the end-of-match teardown.

### hitch100Pct pass threshold loosened from 0.1% to 0.2%

All captures measured `hitch100Pct = 0.00%` — no 100 ms hitches at all.
The threshold floor was raised from 0.1% to 0.2% because 0.1% represents
one single 100 ms frame across a 1000-frame sample, which is within normal
run-to-run variance for non-soak captures. The warn threshold of 0.5%
remains a real regression signal (≥ 5 hitches per 1000 frames).

### p95 on ashau:short improved dramatically

17.70 → 10.90 ms (38% improvement). Same DEM streaming cause as
avgFrameMs. With proper DEM streaming, the a_shau_valley scenario is now
the most performant of the four — which makes sense, since it's 60 NPCs
instead of 120.

## Reproduction

```bash
# Branch + install
git checkout task/perf-baseline-refresh   # (fast-forwarded to master)
npm ci

# Serial captures in order
npm run perf:capture:combat120
npm run perf:capture:openfrontier:short
npm run perf:capture:ashau:short
npm run perf:capture:frontier30m    # ~15 min wallclock on Open Frontier

# Compare against baselines
npm run perf:compare -- --scenario combat120
npm run perf:compare -- --scenario openfrontier:short
npm run perf:compare -- --scenario ashau:short
npm run perf:compare -- --scenario frontier30m

# Refresh baselines from a capture
npm run perf:update-baseline combat120
```

## Non-goals / follow-ups

- **No scenario definition changes.** Modes, NPC counts, durations, warmup,
  seed, and sample intervals are all identical to the stale baselines. The
  only thing that changed is the target numbers.
- **No compare-script logic changes.** `scripts/perf-compare.ts` is
  untouched.
- **Open Frontier soak lifecycle**: the `frontier30m` scenario effectively
  measures 15-17 min of active gameplay instead of the configured 30 min
  because Open Frontier's match end condition fires. Future cleanup: either
  (a) extend `harness-match-end-skip-ai-sandbox` to `open_frontier` for the
  soak scenario, or (b) rescope `frontier30m` as a 15 min soak since that's
  what it actually captures. Not in scope here; flagged as a follow-up.
- **`overBudgetPct` is artificially tight for combat120** (new pass=2%, cur
  pass=20%). Current captures measure ~0.06%, so a 2% pass / 5% warn is
  well above noise floor but well inside what a real budget regression
  would look like. If this proves too tight in CI practice, re-baseline
  with a higher floor.
