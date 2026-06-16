# Perf Baselines

Baseline policy, refresh rules, and current scenario health.

> **Status (2026-06-02): no baseline is currently tracked.** `perf-baselines.json`
> was removed from the repo. With no baseline file present, `perf:compare` does
> **not** gate pass/fail — it prints the latest capture's raw metrics and exits
> 0 (see [`perf:compare` details](#perfcompare-details) below). Re-establishing a
> baseline means running `npm run perf:update-baseline`, which (re)creates
> `perf-baselines.json` from the latest capture. The procedure for doing that
> deliberately is in [Refresh procedure](#refresh-procedure). Everything below
> describes how a tracked baseline behaves *once one exists*; treat it as the
> contract to restore, not the current runtime state.

## Scenarios a baseline would gate

When `perf-baselines.json` exists it gates these scenarios: `combat120`,
`openfrontier:short`, `ashau:short`, `frontier30m`. Other scenarios are
diagnostic only and do not gate `perf:compare`.

The last tracked baselines (before the file was removed) were captured on
**2026-04-20** after the atmosphere/airfield/harness cycle. The DEFEKT-1
stale-baseline audit at `scripts/audit-archive/stale-baseline-audit.ts`
classified those four scenarios as stale-by-age with `0/4` refresh-eligible
because every recent capture either failed validation or failed measurement
trust. That audit now throws `perf-baselines.json is missing` until a baseline
is re-established.

`frontier30m` script semantics were corrected in Cycle 2 to use
`--match-duration 3600 --disable-victory true`; that fix postdated the last
tracked baseline. When a baseline is restored, capture `frontier30m` only from a
quiet-machine perf session after the audit reports strict eligibility.

## Pre-drift-correction reference

Pre drift-correction baseline for `combat120` (2026-04-16T23:06):
avg 17.08 ms, p99 34.40 ms, max 47.30 ms.

Use this when judging whether a candidate refresh is regression vs progress.

## Current scenario health

Last recorded gate status: **2026-05-09**, when `perf-baselines.json` was still
tracked. Source at the time: latest `perf:compare` selection on each scenario,
plus the DEFEKT-1 stale-baseline audit. These rows are retained as the
last-known gated status; with no baseline currently tracked, `perf:compare` no
longer produces PASS/WARN/FAIL rows (it prints raw metrics). Re-gating these
scenarios requires restoring a baseline per [Refresh procedure](#refresh-procedure).

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

This procedure (re-)establishes `perf-baselines.json`, which is currently
absent. On the very first run there is no baseline yet, so the compare/audit
gates in steps 5-6 have nothing to measure against — run them only once a prior
baseline exists, or to confirm a freshly written one. The non-negotiable bar in
every case is steps 1-4 (quiet machine, fresh bundle, `status: ok` +
measurement-trust `pass`) plus the manual heap/frame criteria below.

1. Verify the machine is quiet (no other browser games, no overnight repo
   agents, no asset bakes). See [scenarios.md](scenarios.md) "Capture
   environment discipline".
2. `npm run build:perf` — fresh perf bundle. A stale `dist-perf/` is the most
   common reason a capture's runtime samples disagree with source.
3. Capture the scenario: `npm run perf:capture:<scenario>`.
4. Verify `summary.json` has `status: "ok"` and
   `measurementTrust.status: "pass"`. If either fails, the capture is
   diagnostic only — do not promote.
5. (Only if a baseline already exists.) Run
   `npm run perf:compare -- --scenario <scenario>`. All gates must be `pass`
   (or `warn` if you intend to widen the baseline window). With no baseline
   present, `perf:compare` prints raw metrics and cannot gate — judge the
   capture against the manual criteria below.
6. (Only if a baseline already exists.) Run
   `npx tsx scripts/audit-archive/stale-baseline-audit.ts --as-of <today>`. The
   scenario must classify as `eligible`, not `stale_by_age` or
   `blocked_by_validation`. This audit throws `perf-baselines.json is missing`
   when no baseline file is present.
7. Capture twice more for repeatability. All three captures must clear the
   manual criteria (and the compare gate, once a baseline exists).
8. `npm run perf:update-baseline -- --scenario <scenario> --dir <timestamp>`
   writes `perf-baselines.json` from the selected capture (creating the file if
   it does not exist) only after every check above is satisfied. Omit `--dir` to
   use the latest capture.
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

**With no `perf-baselines.json` present (current state), `perf:compare` prints
the latest capture's raw metrics.** If that capture's own validation passed, it
exits 0 because there is no baseline to compare against. If the latest capture
failed validation, `perf:compare` still prints the raw metrics and failed-check
summary, then exits non-zero so failed dropped-frame evidence is not silently
bypassed by an older artifact. The behavior below applies once a baseline file
exists.

When a baseline exists, `perf:compare` prints PASS/WARN/FAIL rows per metric.
`FAIL` is locally blocking when invoked through `validate:full`; hosted CI keeps
the artifacts and reports the failure without blocking deploy. `WARN` is
reported but non-blocking by default so recovered-but-not-yet-rebaselined
scenarios still surface in logs. Use `perf:compare:strict` or `--fail-on-warn`
to make warnings block locally. Note that the CI perf job's `perf:compare` step
is `continue-on-error` (advisory) regardless.

`peak_max_frame_ms` classification: pass `< 120`, warn `120-299`,
fail `>= 300`.

`perf:compare` auto-selects the latest capture for the scenario and skips
non-capture artifact directories (audits, decision packets, etc.). Failed
captures are included in auto-selection and fail the command after printing raw
metrics, because a failed dropped-frame capture is often the evidence that needs
attention. Pass `--dir <timestamp>` to inspect a specific capture.
