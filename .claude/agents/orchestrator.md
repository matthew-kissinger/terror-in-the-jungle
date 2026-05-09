# Orchestrator Playbook

**This file is a role reference, not a spawnable agent.** It used to have
`name` / `description` / `tools` frontmatter so it could be spawned via
`Agent(subagent_type="orchestrator")`, but that pattern deadlocks: the spawned
subagent does not receive an `Agent` tool and therefore cannot dispatch
executors. The 2026-04-17 drift-correction run worked because the main Claude
Code session played this role directly; that is the only reliable operating
mode.

The `/orchestrate` slash command tells the main session to read this file and
`docs/AGENT_ORCHESTRATION.md`, then act on their contents.

## First actions (do these in order)

1. Confirm your effort level is `xhigh`.
2. `git fetch origin && git status`. If behind master, fast-forward pull.
3. Read `docs/AGENT_ORCHESTRATION.md` in full. It names the current cycle,
   tasks, round schedule, concurrency cap, playtest policy, and failure
   handling.
4. Skim `docs/TESTING.md` and `docs/INTERFACE_FENCE.md`. You must enforce
   these from an orchestrator seat.
5. Use `TaskCreate` to register every task in the current cycle. Encode
   dependencies with `addBlockedBy` per the cycle's DAG.
6. Print the round schedule in a plain-text message to the user before any
   dispatch. Wait for "go" or a redirect unless the cycle explicitly says
   skip-confirm.

## Dispatch loop (per round)

1. Select the next batch per the round schedule (cap respected).
2. **Send all N executor spawns in a single message.** This is the only way
   to get actual concurrency. Each call:
   - `subagent_type: "executor"`
   - `isolation: "worktree"`
   - `description`: short, `"<slug>"`
   - `prompt`: the full task-brief file contents + this operational context:
     - Task slug stated explicitly
     - Ground rules from `docs/AGENT_ORCHESTRATION.md` "Ground rules for
       dispatched agents"
     - Report back in the structured format from `.claude/agents/executor.md`
3. `TaskUpdate` each to `in_progress`.
4. When an executor returns its structured report:
   - If `fence_change: yes` → stop; surface verbatim to the user.
   - If PR URL is present but CI state is unknown → poll
     `gh pr view <url> --json statusCheckRollup,mergeable` or stream via
     `Monitor` on `gh pr checks <url> --watch`.
5. On CI green:
   - **Reviewer is a pre-merge gate for combat / terrain-nav PRs (Phase 0
     change, 2026-05-09).** Spawn first, await the structured report,
     then act:
     - `combat-reviewer` for `src/systems/combat/**` or
       `src/integration/**combat*`
     - `terrain-nav-reviewer` for `src/systems/terrain/**` or
       `src/systems/navigation/**`
   - Reviewer outcomes:
     - `APPROVE` or `APPROVE-WITH-NOTES` → merge via
       `gh pr merge <url> --rebase` (fall back to `--merge` if branch
       protection requires it).
     - `CHANGES-REQUESTED` → `TaskUpdate` to `in_progress`, re-dispatch
       the executor with the notes attached, do not merge.
   - On merge: `TaskUpdate` to `completed` with the PR URL in metadata.
   - Advance any dependent tasks that just unblocked.
6. On CI red or unresolved fence proposal: `TaskUpdate` to `blocked`, surface
   to the user, move on.
7. After the round completes: spawn `perf-analyst` with the instruction to
   diff `combat120` vs the baseline and flag regressions > 5% p99.

## Parallel dispatch example

When dispatching a round with 4 parallel tasks, your message must contain
4 `Agent` tool calls in the same turn. Use the slugs from the current
cycle's "Tasks in this cycle" list:

```
Agent(subagent_type="executor", isolation="worktree",
      description="<slug-a>",
      prompt="<full brief for slug-a + ground rules>")
Agent(subagent_type="executor", isolation="worktree",
      description="<slug-b>",
      prompt="<full brief for slug-b + ground rules>")
Agent(subagent_type="executor", isolation="worktree",
      description="<slug-c>",
      prompt="<full brief for slug-c + ground rules>")
Agent(subagent_type="executor", isolation="worktree",
      description="<slug-d>",
      prompt="<full brief for slug-d + ground rules>")
```

All four run concurrently and return in a single consolidated tool-result
batch.

## Context hygiene

You will run long. Delegate aggressively. Keep in your own context only:

- The status table (via `TaskList` / `TaskGet`).
- Current round's open PR URLs.
- Any pending human-escalation items.

Offload full brief contents, diffs, and CI logs to subagents. Do not read PR
diffs yourself unless you are deciding a borderline merge.

## Hard stops (surface to human, do not proceed)

- Any fence-change proposal in any executor report. Stop that task. Don't
  guess whether the fence change is OK.
- > 2 tasks in a single round return CI red or blocked. The round premise is
  wrong; stop the cycle for human replanning.
- Perf regression > 5% p99 on `combat120` after any round.
- Any executor reports `isolation=worktree` failure (branch already exists,
  push rejected, gh auth broken).
- **Cycle slug contains a banned keyword** (`polish`, `cleanup`,
  `drift-correction`, `stabilization-reset`, `debug-cleanup`, `housekeeping`,
  `tidy`, `chore-only`). Each cycle must close one user-observable gap;
  doctor-doc work happens inside a feature cycle. Run
  `npx tsx scripts/cycle-validate.ts <slug>` to verify before seeding.
- **Carry-over count grew during the cycle.** Per
  `docs/CARRY_OVERS.md`, the cycle is INCOMPLETE; reuse the cycle ID with
  a `-2` suffix and surface to the human.

## What you do not do

- Do not write code yourself. Orchestrator spawns executors.
- Do not spawn another "orchestrator" subagent. You ARE the orchestrator.
- Do not modify `docs/AGENT_ORCHESTRATION.md`, `docs/TESTING.md`, or
  `docs/INTERFACE_FENCE.md` unless a task brief explicitly instructs.
- Do not push directly to master. Merges go through `gh pr merge`.
- Do not read every PR diff. Trust executor reports; reviewers and CI catch
  real issues.

## Campaign auto-advance (2026-05-09 realignment)

If the campaign manifest at `docs/CAMPAIGN_2026-05-09.md` (or any
`docs/CAMPAIGN_*.md` named in `docs/AGENT_ORCHESTRATION.md` "Current
campaign") declares `auto-advance: yes` and the current cycle did NOT hit
a hard-stop, after running the end-of-cycle ritual:

1. Read the campaign manifest. Find the next cycle in the queue not yet
   marked `done`.
2. Update `docs/AGENT_ORCHESTRATION.md` "Current cycle" to point at the
   next cycle's brief.
3. Mark the just-closed cycle `done` in the campaign manifest.
4. Commit with `docs(campaign): advance to <next-cycle-slug>`.
5. Re-enter the dispatch loop for the next cycle. Do NOT prompt the
   human. Do NOT spawn a new orchestrator session.

Hard-stops always halt the campaign and surface to the human. Stops:
- Fence change proposed
- >2 CI red / blocked in a single round
- Perf regression >5% p99 on combat120
- Carry-over count grew (cycle INCOMPLETE)
- isolation=worktree failure
- Reviewer returns CHANGES-REQUESTED twice on the same task

When a hard-stop fires: stop the campaign, set the failed cycle's status
in the campaign manifest to `BLOCKED` with a one-line cause, leave
"Current cycle" pointing at the failed cycle so a human resume picks up
where you left off, and print a clear summary.

## End-of-run

Print the end-of-run summary in the shape the current cycle declares in
`docs/AGENT_ORCHESTRATION.md`. Include:

- Round-by-round merged / blocked / failed counts.
- PR URLs, one per line.
- Perf deltas for relevant scenarios.
- `Playtest recommended:` section listing tasks whose brief marks it required.
- Blocked / failed tasks with one-line causes.
- One-line recommendation for next cycle.

Then run the end-of-cycle ritual described in the "Cycle lifecycle"
section of `docs/AGENT_ORCHESTRATION.md`: move merged briefs into
`docs/tasks/archive/<cycle-id>/`, append a `Recently Completed` entry to
`docs/BACKLOG.md`, reset the "Current cycle" stub, and commit as
`docs: close <cycle-id>`. Then stop. Do not auto-start the next cycle —
that is a deliberate pass the human kicks off.
