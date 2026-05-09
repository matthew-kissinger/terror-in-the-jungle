# Perf Baselines

Last verified: 2026-05-09

Tracked baselines, refresh rules, and current scenario health. Comparison data
lives in `perf-baselines.json` at repo root; this doc explains policy and
status.

## Tracked baselines

`perf-baselines.json` tracks: `combat120`, `openfrontier:short`,
`ashau:short`, `frontier30m`. Other scenarios are diagnostic only and do not
gate `perf:compare`.

The current tracked baselines were refreshed on **2026-04-20** after the
atmosphere/airfield/harness cycle. The DEFEKT-1 audit at
`scripts/projekt-143-stale-baseline-audit.ts` classifies all four scenarios as
stale-by-age but currently `0/4` as refresh-eligible because every recent
capture either fails validation or fails measurement trust.

`frontier30m` script semantics were corrected in Cycle 2 to use
`--match-duration 3600 --disable-victory true`, but the tracked baseline is
still the older capture from before that fix. Refresh it only from a
quiet-machine perf session after the audit reports strict eligibility.

## Pre-drift-correction reference

Pre drift-correction baseline for `combat120` (2026-04-16T23:06):
avg 17.08 ms, p99 34.40 ms, max 47.30 ms.

Use this when judging whether a candidate refresh is regression vs progress.

## Current scenario health

Status as of 2026-05-09. Source: latest `perf:compare` selection on each
scenario, plus the DEFEKT-1 stale-baseline audit.

| Scenario | Status | Avg | p99 | Notes |
|----------|--------|----:|----:|-------|
| `combat120` | FAIL | 16.19 ms* | 34.20 ms* | Latest status-ok capture is validation WARN, measurement trust WARN; max-frame `100.00 ms` is the hard fail. STABILIZAT-1 carry-over. |
| `openfrontier:short` | WARN | 8.33 ms | 32.7 ms | Heap growth WARN at `20.64 MB`; baseline refresh blocked. |
| `ashau:short` | FAIL | 5.67 ms | 19.6 ms | Validation PASS, measurement trust PASS; max-frame `100.00 ms` fails the compare gate. |
| `frontier30m` | FAIL | 6.57 ms | 100.0 ms | Latest soak failed validation; tracked baseline predates the non-terminal-soak fix and is stale. |

`combat120` values marked with `*` come from the latest status-ok but
validation-WARN capture selected by `perf:compare`. Current scenario rows are
gate status, not accepted replacement baselines.

For the DEFEKT-3 / STABILIZAT-1 narrative chain (close-actor render dominance,
LOS cadence bounds, suppression cover-cache, etc.), see the cycle archives
under `docs/cycles/` and the carry-over registry in `docs/CARRY_OVERS.md`. The
pre-split full diagnostic chain is preserved in
`docs/archive/PERFORMANCE.md`.

## Refresh procedure

1. Verify the machine is quiet (no other browser games, no overnight repo
   agents, no asset bakes). See [scenarios.md](scenarios.md) "Capture
   environment discipline".
2. `npm run build:perf` — fresh perf bundle. A stale `dist-perf/` is the most
   common reason a capture's runtime samples disagree with source.
3. Capture the scenario: `npm run perf:capture:<scenario>`.
4. Verify `summary.json` has `status: "ok"` and
   `measurementTrust.status: "pass"`. If either fails, the capture is
   diagnostic only — do not promote.
5. Run `npm run perf:compare -- --scenario <scenario>`. All gates must be
   `pass` (or `warn` if you intend to widen the baseline window).
6. Run `npm run check:projekt-143-stale-baseline-audit -- --as-of <today>`.
   The scenario must classify as `eligible`, not `stale_by_age` or
   `blocked_by_validation`.
7. Capture twice more for repeatability. All three captures must pass the
   compare gate.
8. `npm run perf:update-baseline -- --scenario <scenario> --artifact <dir>`
   updates `perf-baselines.json` from the latest capture only after every
   gate above is green.
9. Commit `perf-baselines.json` with a message referencing the carry-over the
   refresh closes (typically STABILIZAT-1 for `combat120`).

Heap criteria for STABILIZAT-1 baseline-refresh eligibility (combat120):
avg `<= 17 ms`, p99 `<= 35 ms`, heap end-growth `<= 10 MB`.

## Why not just refresh after every cycle

Baselines are the contract that lets `perf:compare` flag regressions. If they
drift up after every cycle, the regression signal vanishes. The grandfather
case is open carry-overs (STABILIZAT-1, DEFEKT-3) where the steady-state
numbers exceed the criteria but the gameplay is acceptable; in that case the
baseline stays old and the cycle ships behind a Tweakpane flag or an explicit
exception note in `docs/CARRY_OVERS.md`.

## perf:compare details

`perf:compare` always prints PASS/WARN/FAIL rows. `FAIL` is locally blocking
when invoked through `validate:full`; hosted CI keeps the artifacts and
reports the failure without blocking deploy. `WARN` is reported but
non-blocking by default so recovered-but-not-yet-rebaselined scenarios still
surface in logs. Use `perf:compare:strict` or `--fail-on-warn` to make
warnings block locally.

`peak_max_frame_ms` classification: pass `< 120`, warn `120-299`,
fail `>= 300`.

`perf:compare` auto-selects the latest capture for the scenario and skips
non-capture artifact directories (audits, decision packets, etc.). Failed
diagnostic captures are excluded from auto-selection. Pass `--artifact <dir>`
to compare a specific capture.
