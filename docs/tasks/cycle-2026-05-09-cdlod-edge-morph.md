# Cycle: cycle-2026-05-09-cdlod-edge-morph

Last verified: 2026-05-09

Status: ready for `/orchestrate` (hot-fix cycle, inserted ahead of Phase 2.5
to address a P1 user-reported visual regression).

## Why this cycle

User reported (2026-05-09) visible white seam cracks at terrain chunk
borders from helicopter altitude on A Shau (screenshot
`C:\Users\Mattm\Downloads\terrain artifacting.png`). The Stage D1+D2 fix
from `terrain-cdlod-seam` (cycle-2026-05-08) closed same-LOD parity but
explicitly deferred the LOD-transition T-junction case ("Stage D3
deferred — gated on visual review of D1+D2 at A Shau north ridgeline").
Visual review confirms residual cracks exclusively at LOD-transition
edges. This cycle ships the canonical Strugar-style CDLOD fix:
per-edge force-morph at coarser-neighbor edges + correction of the
shader's snap-grid math. Skirts stay as belt-and-suspenders.

Comprehensive context, diagnosis with line citations, and how-others-do-it
research are in the task brief: [cdlod-edge-morph](cdlod-edge-morph.md).

## Skip-confirm

Recommended **YES skip-confirm.** This is a single-task cycle with no
manual human gate. The Stage 0 diagnosis pre-check is OPTIONAL (60-second
human pre-flight); if the human has already captured before-screenshots
or chooses to skip them, the orchestrator dispatches the executor
immediately. Stage 5 post-impl visual A/B is the real signal and runs
after merge.

## Concurrency cap

1 (single task in this cycle).

## Round schedule

### Round 1 — single executor

| # | Slug | Reviewer | Playtest? |
|---|------|----------|-----------|
| 1 | `cdlod-edge-morph` | `terrain-nav-reviewer` (touches `src/systems/terrain/**`) | YES (visual A/B at A Shau north ridgeline) |

## Dependencies

None — single task. Three internal stages (snap-math, edge-mask,
shader force-morph) are sequenced inside the task itself across three
commits.

## Tasks in this cycle

- [cdlod-edge-morph](cdlod-edge-morph.md) — fix LOD-transition seam
  cracks via per-edge `edgeMorphMask` attribute + shader force-morph +
  corrected `parentStep = 2/(N-1)` snap math. Three commits, ≤500 LOC
  source + ≤300 LOC tests.

## Cycle-level success criteria

All of:

1. `task/cdlod-edge-morph` merged via rebase. PR description names the
   user-observable gap (visible terrain seam regression).
2. `npm run validate:fast` clean (lint + tests + build).
3. New tests green: snap-math parity, edge-mask correctness at
   LOD-transition, shader morph parity at LOD-transition.
4. Existing same-LOD parity test (`CDLODQuadtree.test.ts:130`) stays
   green — non-regression for the predecessor Stage D1 fix.
5. `combat120` p99 within ±2% of pre-cycle baseline (no regression from
   the new neighbor-pass + shader branches).
6. Visual A/B at A Shau north ridgeline (helicopter altitude, screenshot
   coordinate from the original report): white cracks gone or near-zero.
   Save before/after PNGs into `artifacts/cdlod-edge-morph/{before,after}/`.
7. `Shift+\` → `Y` seam overlay red-line count drops by ≥80% at the same
   camera position.
8. `/playtest` golden path through Open Frontier, Zone Control, A Shau
   scenarios — no new visual artifacts (e.g. visible "snap" pop on flat
   ground when crossing a morph zone).
9. `terrain-nav-reviewer` returns APPROVE or APPROVE-WITH-NOTES before
   merge (Phase 0 reviewer pre-merge gate applies — `src/systems/terrain/**`
   is in scope).
10. Carry-over count holds at 12 or drops (no new carry-overs filed
    unless Stage 3 follow-up needed).

## Hard rules for this cycle

1. **No fence changes.** `ITerrainRuntime` is fenced and not touched.
   The new `edgeMorphMask` lives on `CDLODTile` (internal), not on a
   fenced interface.
2. **No source-tree changes outside the task's `Files touched`.** The
   reviewer will reject scope creep.
3. **WebGL2 assumed.** Verify in `vite.config.*` before coding. If
   WebGL1 is in scope, swap the packed-int attribute for 4 float
   attributes per the brief's contingency.
4. **Stage 1 (snap-math) commits first, alone, and stays green.** It's
   the lowest-risk piece and the easiest to revert if anything regresses.
5. **Hard-stop on perf:** > 5% combat120 p99 regression → revert.
6. **Hard-stop on selection-time perf:** > 0.1ms regression in
   `CDLODQuadtree.selectTiles` → defer Stage 2 (edge-mask) and ship
   Stage 1 alone. Report.

## Reviewer policy

- `terrain-nav-reviewer` gates merge (Phase 0 pre-merge rule —
  `src/systems/terrain/**` in scope). Outcomes:
  - APPROVE → orchestrator merges.
  - APPROVE-WITH-NOTES → orchestrator merges; notes captured here.
  - CHANGES-REQUESTED → orchestrator re-dispatches executor with notes.
- No `combat-reviewer` (no `src/systems/combat/**` touch).

## Post-merge verification (orchestrator owns)

After the merge step:

1. Pull master locally; `npm run validate:fast` clean.
2. `npx tsx scripts/perf-capture.ts combat120` (or equivalent perf-capture
   slash command if available); diff against `perf-baselines.json`. p99
   within ±2%.
3. Print "human visual A/B required at A Shau north ridgeline; save
   `artifacts/cdlod-edge-morph/after/*.png`." Do not auto-close the
   cycle until the human confirms or 24 hr elapse.

## End-of-cycle ritual

Per [docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md). After PR
merges and visual A/B confirms:

1. `npx tsx scripts/cycle-validate.ts cycle-2026-05-09-cdlod-edge-morph --close`
2. Move both briefs (`cdlod-edge-morph.md` + this file) to
   `docs/tasks/archive/cycle-2026-05-09-cdlod-edge-morph/`.
3. Append `## Recently Completed (cycle-2026-05-09-cdlod-edge-morph)`
   to `docs/BACKLOG.md` with the PR URL, one-line summary, and any
   Stage-3 follow-up carry-over (only if visual A/B shows residual cracks
   that warrant a `cdlod-skirt-tighten` follow-up).
4. Update `docs/AGENT_ORCHESTRATION.md` "Last closed cycle" + "Current
   cycle" stub → point back at Phase 2.5 (`cycle-2026-05-10-stabilization-fixes`),
   which is unchanged and still ready.
5. Update `docs/CAMPAIGN_2026-05-09.md`: mark this cycle done; queue
   re-points at Phase 2.5 next.
6. Carry-over delta should be ≥ 0 net (no new carry-overs unless Stage 3
   follow-up filed).
7. Commit as `docs: close cycle-2026-05-09-cdlod-edge-morph`.

## Rollback plan

If post-merge visual A/B shows the fix didn't work (or a new visual
artifact appears) and a fix-forward is not obvious within 30 min:

- Revert the merged PR via `gh pr revert <PR#>`. Preferred over a
  follow-up patch — restores the predecessor `terrain-cdlod-seam`
  behavior cleanly.
- File a carry-over for the failed approach with notes on what visual
  signal triggered the revert (screenshots in
  `artifacts/cdlod-edge-morph/revert/`).
- The three-commit structure inside the task (snap-math /
  quadtree+attribute / shader+force-morph) lets a partial revert keep
  Stage 1 alone if Stage 2 turns out to be the problem.
