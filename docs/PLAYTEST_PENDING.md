# Playtest Pending

Last verified: 2026-05-16

Single-source sink for cycles that closed under
`posture: autonomous-loop` (per
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](CAMPAIGN_2026-05-13-POST-WEBGPU.md))
and merged on CI green + reviewer APPROVE without the owner-playtest
gate firing.

The orchestrator appends a row here at every cycle close that had a
playtest-required task. The owner walks the deferred items in batches
after the campaign completes (or mid-campaign during a planned
break).

If a deferred playtest rejects the merged work, the owner opens a
follow-up cycle (or a single hotfix task) — the merged commit is
NOT reverted automatically.

## Active deferrals

(Empty until the autonomous loop closes its first playtest-gated
cycle. The orchestrator appends rows here as cycles close.)

| Cycle slug | Close commit | What to walk | Playwright smoke screenshots | Notes |
|------------|--------------|--------------|------------------------------|-------|

## Walk-through protocol (for the owner)

1. Pull master.
2. For each row above:
   - Open the Playwright smoke screenshots under
     `artifacts/cycle-<slug>/playtest-evidence/`.
   - Spin up dev preview (`npm run dev`) and walk the feature's
     golden path manually.
   - If the feature reads "right":
     - Move the row to the "Walked & accepted" section below with a
       date and a one-line note.
   - If the feature reads "wrong":
     - Move the row to "Walked & rejected" below with a one-line
       cause.
     - Open a follow-up cycle brief at
       `docs/tasks/cycle-<slug>-fix.md` and queue it in the active
       campaign manifest.

## Walked & accepted

(Empty.)

## Walked & rejected

(Empty.)

## Reference

- [.claude/agents/orchestrator.md](../.claude/agents/orchestrator.md)
  §"Autonomous-loop posture" — defines what triggers an append here.
- [docs/AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md)
  §"Autonomous-loop posture" — cross-tool view of the same rules.
- [docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](CAMPAIGN_2026-05-13-POST-WEBGPU.md)
  — current campaign manifest declaring `posture: autonomous-loop`.
- [GOAL_DIRECTIVE.md](../GOAL_DIRECTIVE.md) — the `/goal` directive
  string for invoking the autonomous loop.
