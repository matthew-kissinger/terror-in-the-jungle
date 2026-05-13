# Task: quarterly-review-checklist

Last verified: 2026-05-09

Cycle: `cycle-2026-05-17-phase-5-new-normal` (R1)

## Goal

Author `docs/QUARTERLY_REVIEW.md` — 1-page audit checklist for the next
12-week review (i.e. the next campaign-style realignment). Captures the
audit shape that produced this campaign's plan.

## Files touched

### Created

- `docs/QUARTERLY_REVIEW.md` (≤200 LOC) with:
  1. Audit dataset to gather: source LOC distribution, fan-in heatmap, doc LOC, ceremony surface (`check:*` count, artifacts/ size), carry-over count, cycles since last review
  2. The 9 god-module / drift / cycle-sync questions to ask
  3. The decision-framework template: 4 questions to the human (vision honesty, scope ambition, code surgery appetite, cadence)
  4. Threshold triggers: when to schedule the next quarterly (file count growth >20% / carry-overs >12 / cycle housekeeping ratio >30% / etc.)
  5. Output: a campaign-style plan saved to `~/.claude/plans/<name>.md` and a campaign manifest at `docs/CAMPAIGN_<date>.md`

## Verification

- File exists, ≤200 LOC, dated header.

## Branch + PR

- Branch: `task/quarterly-review-checklist`
- Commit: `docs: quarterly-review checklist (quarterly-review-checklist)`

## Reviewer: none required
## Playtest required: no
