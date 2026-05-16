# /goal directive (copy the block below into the /goal invocation)

Last verified: 2026-05-16

This file holds the **prime directive string** for invoking the
12-cycle autonomous campaign via the `/goal` CLI command. Copy the
block between the markers and paste it as the `/goal` argument.

The directive is self-contained: it tells a fresh agent what to do,
where to find the campaign state, what posture overrides apply, and
which hard-stops are real. The agent doesn't need to read this file
to act — the directive in the arg string carries everything.

## Directive

```
/goal Execute the 12-cycle autonomous campaign in docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md per the orchestrator protocol (.claude/agents/orchestrator.md + docs/AGENT_ORCHESTRATION.md). Posture: autonomous-loop — auto-merge on CI green + reviewer APPROVE, defer playtest-required gates to docs/PLAYTEST_PENDING.md, do NOT halt on owner-attention items. Replace owner-playtest tasks with Playwright smoke + screenshot capture. Append (playtest-deferred) to cycle-close commit subjects when playtest was deferred. Hard-stops (halt and surface ONLY for these): fence change on src/types/SystemInterfaces.ts, >2 CI red in a single round, perf regression >5% p99 on combat120, carry-over count grew during a cycle, worktree isolation failure, reviewer CHANGES-REQUESTED twice on the same task. Run from current cycle (cycle-sky-visual-restore) through cycle #12 (cycle-stabilizat-1-baselines-refresh) without prompting. At campaign close commit, print the campaign-level summary and stop.
```

## How the agent uses this

1. Reads the directive arg (above).
2. Reads `.claude/agents/orchestrator.md` for the orchestrator
   playbook (referenced in the directive).
3. Reads `docs/AGENT_ORCHESTRATION.md` for the current-cycle pointer.
4. Reads `docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md` for the queue,
   confirms `auto-advance: yes` + `posture: autonomous-loop`.
5. Reads `docs/tasks/cycle-sky-visual-restore.md` for cycle #1 scope.
6. Dispatches R1 of cycle #1 (3 parallel executors).
7. On cycle close, advances per the orchestrator's "Campaign
   auto-advance" + "Autonomous-loop posture" sections.
8. Chains through all 12 cycles unless a hard-stop fires.

## Hard-stop response

If a hard-stop fires, the agent:

1. Marks the failing cycle's row in
   `docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md` queue table as
   `BLOCKED` with a one-line cause.
2. Flips `auto-advance: yes` → `PAUSED` at the top of that file.
3. Leaves `docs/AGENT_ORCHESTRATION.md` "Current cycle" pointing at
   the failed cycle.
4. Prints the failure summary per the end-of-run format in
   `docs/AGENT_ORCHESTRATION.md`.
5. Stops.

The owner addresses the cause, flips `auto-advance: yes` back on,
and re-invokes `/goal` with the same directive — the agent resumes
at the first not-done row.

## Mid-campaign pause (manual)

To pause the autonomous loop without a hard-stop:

1. Edit `docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md`.
2. Flip `Auto-advance: yes` → `Auto-advance: PAUSED`.

The orchestrator finishes the in-flight cycle (current round
completes, current cycle closes) and stops cleanly.

## Owner walk-through (post-campaign)

When the agent reaches the campaign-close commit:

1. Pull master.
2. Open [docs/PLAYTEST_PENDING.md](docs/PLAYTEST_PENDING.md) — the
   list of deferred playtests the agent compiled along the way.
3. Walk each row per the protocol in that file.

## Notes on the directive design

- **Self-contained.** Includes the campaign manifest path, the
  posture flag, the hard-stop list, and the start + end cycle slugs.
  A fresh agent doesn't need to read any other doc except those the
  directive points at.
- **Hard-stops over-specified.** The directive enumerates them rather
  than relying on the agent to read them from the manifest, so a
  misconfigured fresh agent still respects them.
- **Posture explicit.** "Posture: autonomous-loop" is the key line —
  it triggers the playtest deferral. Without it, the cycle briefs'
  "owner playtest required" gates would halt the loop.
- **No "Co-Authored-By" tag for /goal-driven commits.** The directive
  doesn't ask for it. If you want it, add a sentence:
  "Append Co-Authored-By: Claude Opus 4.7 ... to every commit."

## Updating the directive

When the campaign queue changes (e.g., new cycle inserted at the
top, or the active campaign rotates to a new manifest), update the
directive's named start cycle to match the current `docs/AGENT_ORCHESTRATION.md`
"Current cycle" entry, then re-commit this file.
