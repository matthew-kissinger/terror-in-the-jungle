---
description: Run the current orchestration cycle per docs/AGENT_ORCHESTRATION.md
---

**You — the current main Claude Code session — are the orchestrator.** Do not try to spawn an "orchestrator" subagent. Subagents cannot reliably spawn further subagents in this harness; if you delegate, the run deadlocks on dispatch. Play the role yourself.

## Kickoff (do these in order)

1. Confirm effort is `xhigh`.
2. Read `.claude/agents/orchestrator.md` — the orchestrator playbook (dispatch, merge, reviewer, failure, end-of-run patterns).
3. Read `docs/AGENT_ORCHESTRATION.md` fully — the **Current cycle** section names what you are running, its tasks, concurrency cap, and policies.
4. `git fetch origin && git status`. If behind master, fast-forward pull.
5. `TaskCreate` one task per brief in the current cycle. Encode dependencies with `addBlockedBy` as declared in the cycle's DAG.
6. Print the **round schedule** in plain text to the user before any dispatch. Wait for "go" (or a redirect) unless the cycle explicitly says skip-confirm.
7. Dispatch Round 1 per the playbook: one message, N parallel `Agent(subagent_type="executor", isolation="worktree", ...)` calls, where N ≤ the cycle's concurrency cap (default 5).
8. Poll CI with `gh pr view --json statusCheckRollup,mergeable` or stream via `Monitor` on `gh pr checks <url> --watch`. Do not sleep-poll.
9. On CI green: run the right reviewer (combat-reviewer / terrain-nav-reviewer) if the diff touches its scope; then `gh pr merge --rebase`. Mark task completed.
10. On CI red or fence-change proposal: stop the affected task and surface to the user. Do not auto-retry.
11. After each round: spawn `perf-analyst` to diff `perf-capture:combat120` vs baseline. Flag p99 regression > 5%.
12. End-of-run: print the summary in the shape declared by the current cycle in `docs/AGENT_ORCHESTRATION.md`.

## Defaults (overridable by the current cycle)

- Concurrency cap: 5 parallel executors.
- Playtest policy: playtest-required PRs merge on CI green; flag them in the end-of-run summary under "Playtest recommended."
- Never push to master directly — merge via `gh pr merge`.
- Never modify `docs/AGENT_ORCHESTRATION.md`, `docs/TESTING.md`, or `docs/INTERFACE_FENCE.md` unless a task brief explicitly says so.

## Why main-session-as-orchestrator

The 2026-04-17 drift-correction run (16 PRs, Batches A-D) was planned assuming subagents could spawn executors via a tool named `Agent`. In the current Claude Code harness, subagents do not receive that tool — only the top-level session does. Running the orchestration role from the main session is the only reliable dispatch path today.
