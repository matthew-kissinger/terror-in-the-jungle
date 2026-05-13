# Cycle: cycle-2026-05-17-phase-5-new-normal

Last verified: 2026-05-09

Status: queued (Phase 5 / steady state; cycle 9 of 9 — campaign closing)

This cycle is the **closeout + steady-state transition**. After Phase F
(cycle 8) lands, the campaign's substantive work is done. Phase 5 codifies
the new normal and unlocks ground-vehicle work for the next campaign.

## Skip-confirm: yes

## Concurrency cap: 3

## Round schedule

### Round 1 — parallel

| Slug | Reviewer | Notes |
|------|----------|-------|
| `campaign-closeout-summary` | none | Author the campaign retrospective at `docs/cycles/campaign-2026-05-09/RESULT.md` |
| `vehkikl-1-jeep-spike` | none | Spike `M151 jeep` — minimal driving runtime over terrain. Spike, not full integration. |
| `quarterly-review-checklist` | none | Author `docs/QUARTERLY_REVIEW.md` — 1-page audit checklist for the next 12-week review |

### Round 2 — sequential

| Slug | Reviewer | Notes |
|------|----------|-------|
| `vision-sentence-final` | none | Update README + AGENTS + ROADMAP with the post-Phase-F vision sentence (whatever the actual verified frontier is — 1,000 if F3 met targets, 200+ if not) |
| `campaign-archive-and-reset` | none | Move all 9 cycle briefs to `docs/tasks/archive/campaign-2026-05-09/`; reset `docs/AGENT_ORCHESTRATION.md` "Current cycle" to `none (between cycles)` |

## Tasks in this cycle

- [campaign-closeout-summary](campaign-closeout-summary.md)
- [vekhikl-1-jeep-spike](vekhikl-1-jeep-spike.md)
- [quarterly-review-checklist](quarterly-review-checklist.md)
- [vision-sentence-final](vision-sentence-final.md)
- [campaign-archive-and-reset](campaign-archive-and-reset.md)

## Cycle-level success criteria

1. `docs/cycles/campaign-2026-05-09/RESULT.md` summarizes the 9-cycle campaign: what landed, what didn't, perf delta, carry-overs closed, carry-overs opened
2. M151 jeep spike runs in dev preview (drives over terrain, basic enter/exit) — not playtest-signed-off, but demonstrably real
3. `docs/QUARTERLY_REVIEW.md` exists with a 1-page checklist
4. Vision sentence reflects the actual verified frontier
5. All 9 cycle briefs archived; campaign manifest's last cycle marked `done`
6. `docs/AGENT_ORCHESTRATION.md` "Current cycle" reset to `none`

## End-of-cycle ritual + auto-advance

**Auto-advance: NO.** This is the final cycle of the campaign. After it
closes, the orchestrator stops. The next `/orchestrate` invocation runs
whatever the next manually-seeded cycle is — likely a focused
ground-vehicle cycle expanding on the M151 spike, or a UX cycle picking up
deferred UX-1/2/3/4 work.
