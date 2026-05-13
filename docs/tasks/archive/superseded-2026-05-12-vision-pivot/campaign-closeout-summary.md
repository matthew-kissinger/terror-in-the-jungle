# Task: campaign-closeout-summary

Last verified: 2026-05-09

Cycle: `cycle-2026-05-17-phase-5-new-normal` (R1)

## Goal

Author `docs/cycles/campaign-2026-05-09/RESULT.md` — the campaign-level
retrospective summarizing all 9 cycles.

## Required reading first

- `docs/CAMPAIGN_2026-05-09.md` (the campaign manifest — at this point all cycles have status `done`, `BLOCKED`, or `skipped`)
- Each cycle's brief at `docs/tasks/cycle-2026-05-*.md`
- `docs/CARRY_OVERS.md` (final state — closed and remaining carry-overs)

## Files touched

### Created

- `docs/cycles/campaign-2026-05-09/RESULT.md` (≤500 LOC)

Sections (with `Last verified: <today>` header):

1. Cycle-by-cycle summary (≤2 lines each, 9 cycles)
2. Carry-overs closed: list with PR URL
3. Carry-overs still open: list with reason
4. Perf delta: combat120 p99 before vs after; combat1000 baseline if F3 succeeded
5. Source LOC: total, distribution across systems, grandfather-list final state
6. Doc LOC: total, distribution
7. Artifacts: total disk, retention rate
8. Net cycle count: started 9, closed N, blocked M, skipped K
9. Lessons learned: 3-5 bullets on what worked + what didn't
10. Next campaign seed: 1-paragraph recommendation

## Verification

- File exists at `docs/cycles/campaign-2026-05-09/RESULT.md`
- ≤500 LOC
- Has Last verified header
- All 9 cycles named
- Perf delta numbers cited from actual capture artifacts

## Non-goals

- No new code
- No new task briefs
- No archive moves (that's `campaign-archive-and-reset`)

## Branch + PR

- Branch: `task/campaign-closeout-summary`
- Commit: `docs: campaign-2026-05-09 retrospective (campaign-closeout-summary)`

## Reviewer: none required
## Playtest required: no
