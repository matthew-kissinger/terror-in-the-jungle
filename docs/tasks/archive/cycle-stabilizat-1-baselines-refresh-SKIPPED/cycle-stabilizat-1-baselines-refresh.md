# Cycle: STABILIZAT-1 Perf Baselines Refresh

Last verified: 2026-05-16

## Status

Queued at position #12 (final) in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
Closes `STABILIZAT-1` and `DEFEKT-1`. Runs last so the baseline
captures the cumulative effect of the post-WebGPU feature work.

## Skip-confirm: yes

Campaign auto-advance.

## Concurrency cap: 2

R1 ships the refresh + validation.

## Objective

Refresh `perf-baselines.json` against the post-feature-work master.
The experimental-branch policy block on baseline refresh lifted at
master merge on 2026-05-13; the actual refresh has not run since.
This cycle re-captures `combat120` + `openfrontier:short` +
`ashau:steady-pose` p99 against the post-WebGPU + post-feature
master and writes the new bar.

Source carry-over: `STABILIZAT-1` (combat120 baseline refresh
blocked, measurement trust WARN). Open 7 cycles as of 2026-05-16.

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. [docs/CARRY_OVERS.md](../CARRY_OVERS.md) STABILIZAT-1 row.
2. `perf-baselines.json` — current baseline (likely from
   `cycle-2026-04-21-stabilization-reset`).
3. `scripts/perf-capture.ts` and `scripts/perf-compare.ts` (or
   equivalent) — capture + compare driver.
4. `scripts/check-perf-baseline.ts` (or equivalent) — the CI gate.
5. [docs/PERFORMANCE.md](../PERFORMANCE.md) (if exists) — baseline
   refresh protocol.
6. [docs/perf/](../perf/) — perf docs directory.

## Critical Process Notes

1. **Quiet-machine capture.** Per the STABILIZAT-1 note: refresh on
   a quiet machine (no concurrent worktrees, no other heavy
   processes). The host-contention perf-taint observed in cycle
   #0 must not contaminate this refresh.
2. **5 runs per scenario; record median.** Single-run captures are
   too noisy for baseline.
3. **Compare against pre-WebGPU baseline.** Any p99 regression
   past +5% from the pre-WebGPU master baseline triggers an
   investigation cycle ahead of refresh acceptance (per campaign
   hard stop).
4. **Pair with artifact-prune.** Old perf artifacts under
   `artifacts/perf/` accumulate; this cycle's R1 task includes a
   prune pass.
5. **`perf-analyst` runs at cycle close** to confirm the new
   baseline reads correctly against itself.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `perf-baselines-recapture`, `perf-artifact-prune` | 2 | Capture + prune. Independent. |

No R2 — single-round cycle.

## Task Scope

### perf-baselines-recapture (R1)

Refresh `perf-baselines.json` against current master.

**Files touched:**
- `perf-baselines.json` — the baseline file.
- Possibly `scripts/perf-capture.ts` if the capture driver needs
  tuning for the new scenes (water surface shader from VODA-1
  changes the perf profile).

**Method:**
1. Verify machine is quiet (no other worktrees, no IDE compile, no
   background tasks).
2. Run `combat120` capture 5 times. Record median + p95 + p99.
3. Run `openfrontier:short` capture 5 times.
4. Run `ashau:steady-pose` capture 5 times.
5. Compare medians against pre-WebGPU baseline. If any p99 > +5%,
   halt and surface to owner (this is a campaign hard stop and
   probably indicates a feature-cycle regression slipped through).
6. Write new baseline to `perf-baselines.json`.
7. Update CI gate thresholds if needed.
8. Commit message: `perf(baselines): refresh perf-baselines.json against post-WebGPU + feature master (perf-baselines-recapture)`.

**Acceptance:**
- Tests + build green.
- Median + p95 + p99 recorded for each scenario.
- Pre-vs-post comparison committed in PR description.
- No p99 regression > 5% vs pre-WebGPU baseline (or surfaced).

### perf-artifact-prune (R1)

Prune old perf artifacts under `artifacts/perf/` and
`artifacts/cycle-*/` to keep the repo lean.

**Files touched:**
- `scripts/artifact-prune.ts` (existing) — confirm running with
  current retention policy.
- `artifacts/perf/` — bulk deletion of older artifacts (keep last
  N per scenario per the existing prune policy).

**Method:**
1. Run `npx tsx scripts/artifact-prune.ts --apply`.
2. Verify retained artifacts are the ones the prune policy says to
   keep (most recent N per scenario, all baselines pinned).
3. Commit message: `chore(perf): prune old perf artifacts (perf-artifact-prune)`.

**Acceptance:**
- Artifact size delta committed in PR description.
- No baseline-pinned artifacts removed.

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- `combat120` p99 regression > +5% vs pre-WebGPU baseline → halt
  and surface. The campaign's cumulative feature work shouldn't
  regress past +5% — if it does, that's a signal that one or more
  prior cycles' perf gates didn't catch a real regression.
- Capture noise too high to read (p99 variance > 20% between
  runs) → halt; the machine isn't quiet enough.

## Reviewer Policy

- No mandatory reviewer (perf-analyst runs at cycle close, not as
  pre-merge gate for this cycle).
- Orchestrator reviews each PR.

## Acceptance Criteria (cycle close)

- All R1 task PRs merged.
- `perf-baselines.json` updated with post-campaign median + p95 +
  p99 for all three named scenarios.
- Pre-vs-post comparison memo committed.
- Old perf artifacts pruned; baseline-pinned artifacts retained.
- `STABILIZAT-1` row in `docs/CARRY_OVERS.md` moves from Active to
  Closed.
- `DEFEKT-1` (baseline drift) marked complete in
  `docs/DIRECTIVES.md`.

## Out of Scope

- Adding new perf scenarios (the named three are sufficient).
- Re-architecting the perf-capture pipeline.
- Touching `src/systems/**` product code.
- Fenced-interface touches.

## Carry-over impact

| Action | When | Active count |
|--------|------|--------------:|
| Close STABILIZAT-1 | cycle close | (prior count) − 1 |

Net cycle delta: −1.

## Campaign close

This is the final cycle in the
`CAMPAIGN_2026-05-13-POST-WEBGPU.md` queue. When it closes, the
orchestrator marks the campaign manifest's status as `COMPLETED`,
prints the campaign-level summary, and stops. Auto-advance does not
continue to a new campaign without explicit owner direction.

The campaign-level summary should include:
- Total cycles merged: 12.
- Carry-overs closed: KB-SKY-BLAND (fix), KB-MOBILE-WEBGPU (fix),
  DEFEKT-3, DEFEKT-4, STABILIZAT-1, DEFEKT-1, plus the VODA-1
  water-shader-side close of `konveyer-large-file-splits`.
- Directives closed: VEKHIKL-1, VEKHIKL-2, VEKHIKL-3, VEKHIKL-4,
  VODA-1, VODA-2, VODA-3.
- Active carry-over count delta: starts at 9 (after cycle-2026-05-16
  close), drops by ~5 to ~4 by campaign end.
- Final perf baseline.
- Owner-playtest sign-offs across feature cycles.

After campaign close, the next campaign manifest gets opened on
owner direction. Likely candidates:
- Multiplayer / lobby slice (out of scope for this campaign).
- Additional vehicles (T-54, M113, Cobra import,
  AVIATSIYA-3/4/5/6/7).
- Squad commands + air-support radio (SVYAZ-1 through SVYAZ-4).
- Deploy / loadout / spawn-flow polish (UX-1 through UX-4).
