# Task: campaign-archive-and-reset

Last verified: 2026-05-09

Cycle: `cycle-2026-05-17-phase-5-new-normal` (R2)

## Goal

Final cleanup of the campaign: archive all 9 cycle briefs + the campaign
manifest, reset `docs/AGENT_ORCHESTRATION.md` "Current cycle" to the
empty stub.

## Files touched

### Moved (git mv)

- `docs/tasks/cycle-2026-05-09-phase-0-foundation.md` → `docs/tasks/archive/campaign-2026-05-09/cycle-2026-05-09-phase-0-foundation.md`
- ... (all 9 cycle briefs)
- All per-cycle task briefs → `docs/tasks/archive/campaign-2026-05-09/<task-slug>.md`
- `docs/CAMPAIGN_2026-05-09.md` → `docs/archive/CAMPAIGN_2026-05-09.md`

### Modified

- `docs/AGENT_ORCHESTRATION.md` — reset "Current cycle" section to `none (between cycles)`. Note last closed campaign: `campaign-2026-05-09`.
- `docs/BACKLOG.md` — append "Recently Completed" entry for `campaign-2026-05-09` (single line summary)

## Steps

1. `git mv` all archived files. Preserve history.
2. Reset AGENT_ORCHESTRATION.md "Current cycle".
3. Append BACKLOG entry.
4. Verify nothing in `docs/` outside `docs/archive/` references the moved campaign manifest. (The campaign-closeout-summary lives in `docs/cycles/campaign-2026-05-09/RESULT.md` and stays.)

## Verification

- `ls docs/tasks/cycle-2026-05-*.md` returns nothing (all moved)
- `ls docs/CAMPAIGN_2026-05-09.md` returns "no such file"
- `ls docs/archive/CAMPAIGN_2026-05-09.md` returns the archived file
- `grep "Current cycle:" docs/AGENT_ORCHESTRATION.md` shows `none (between cycles)`

## Branch + PR

- Branch: `task/campaign-archive-and-reset`
- Commit: `docs: archive campaign-2026-05-09 + reset cycle pointer (campaign-archive-and-reset)`

## Reviewer: none required
## Playtest required: no
