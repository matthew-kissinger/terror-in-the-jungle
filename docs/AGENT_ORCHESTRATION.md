# Agent Orchestration — Runbook

Last updated: 2026-04-20

This file is the master runbook for multi-agent cycles in this repo. It has
three parts:

1. **Operating model + dispatch / merge patterns.** Durable across cycles.
2. **Cycle lifecycle.** Conventions for task IDs, cycle IDs, and the
   end-of-cycle ritual. Durable across cycles.
3. **Current cycle.** Reset every cycle. Past cycles live in
   `docs/BACKLOG.md` "Recently Completed" and their briefs under
   `docs/tasks/archive/<cycle-id>/`.

If you are the orchestrator, read this file top to bottom. If you are an
executor, read only the task brief the orchestrator hands you plus the required
reading inside it.

## Operating model

- **The main Claude Code session plays the orchestrator role.** Subagents
  cannot reliably spawn further subagents in this harness (they do not receive
  an `Agent` tool regardless of what frontmatter claims). The 2026-04-17
  drift-correction run worked because the main session WAS the orchestrator.
  Do not try to spawn an "orchestrator" subagent — the run will deadlock at
  dispatch.
- **Executors are subagents.** Each is spawned with
  `subagent_type="executor"`, `isolation="worktree"`, and the full task-brief
  contents as the prompt.
- **Reviewers are subagents.** `combat-reviewer` on PRs touching
  `src/systems/combat/**`, `terrain-nav-reviewer` on PRs touching terrain or
  nav paths.
- **Perf analyst is a subagent.** Run after each round to diff perf vs
  baseline.
- **Concurrency cap:** default 5 parallel executors. The current cycle can
  override.

## Cycle lifecycle

The project runs multi-task cycles through this runbook. The cycle-specific
section (below) is reset at the start of every cycle; the rest of this file
is durable across cycles.

**Task IDs are descriptive slugs, not phase letters.** Use
`plane-test-harness`, not `A1`. Phase letters were retired on 2026-04-18
after two consecutive cycles claimed fresh A/B/C prefixes and queued a
`D1` for the next one — linear, and the alphabet doesn't scale. A cycle
can have as many tasks as its DAG requires without running out of letters.

**Cycle IDs are dated slugs.** Format: `cycle-YYYY-MM-DD-<slug>`, e.g.
`cycle-2026-04-18-rebuild-foundation`. The cycle ID is the archive
subfolder name and the section header in `docs/BACKLOG.md` when the cycle
closes.

**Branches follow the slug.** `task/<slug>`, no letter prefix. Commit
first-line format: `<type>(<scope>): <summary> (<slug>)`.

**Dependencies** are declared via `addBlockedBy` on task slugs inside the
current cycle's DAG (see the "Dependencies" subsection of "Current cycle").

**End-of-cycle ritual** (run as the last orchestrator action, or as a
standalone bookkeeping pass):

1. Move each merged brief from `docs/tasks/<slug>.md` →
   `docs/tasks/archive/<cycle-id>/<slug>.md`.
2. Append a `## Recently Completed (<cycle-id>)` section to
   `docs/BACKLOG.md` with PR list, one-line summaries, and follow-ups.
3. Reset the "Current cycle" section below to the empty stub.
4. Commit with message `docs: close <cycle-id>`.

The stub template under "Current cycle" is what the next cycle fills in.

## Current cycle: cycle-2026-04-22-flight-rebuild-overnight

### Cycle ID

`cycle-2026-04-22-flight-rebuild-overnight`

### Why this cycle exists

Autonomous overnight run that ships Tier 0-3 code fixes for fixed-wing feel and airfield placement, plus a Tier 4 design memo for the continuous-contact contract. Full plan + per-task briefs live in [docs/FLIGHT_REBUILD_ORCHESTRATION.md](FLIGHT_REBUILD_ORCHESTRATION.md); cycle directory is [docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/](cycles/cycle-2026-04-22-flight-rebuild-overnight/).

### Tasks in this cycle

13 tasks, four sequential rounds. Each has a brief at `docs/tasks/<slug>.md`.

- Round 1 (Tier 0+1, 5 parallel): `aircraft-building-collision`, `airframe-directional-fallback`, `airframe-altitude-hold-unification`, `airframe-ground-rolling-model`, `player-controller-interpolated-pose`.
- Round 2 (Tier 2 climb, 3 parallel): `airframe-soft-alpha-protection`, `airframe-climb-rate-pitch-damper`, `airframe-authority-scale-floor`.
- Round 3 (Tier 3 airfield, 4 parallel): `airfield-perimeter-inside-envelope`, `airfield-prop-footprint-sampling`, `airfield-envelope-ramp-softening`, `airfield-taxiway-widening`.
- Round 4 (Tier 4 memo, 1 solo): `continuous-contact-contract-memo`.

### Round schedule

R1 -> R2 -> R3 -> R4 sequential. Round N dispatches only after Round N-1 is fully merged or flagged blocked. A blocked task does NOT halt the cycle. Full dispatch detail in `docs/FLIGHT_REBUILD_ORCHESTRATION.md`.

**Round 0 (orchestrator prep):** `git fetch origin && git status` (must be clean); create cycle evidence / baseline directories (already seeded in `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/`); run `npm run probe:fixed-wing` and write output to `baseline/probe-before.json`; if `baseline/perf-baseline-combat120.json` does not already exist, run `npm run perf-capture:combat120` and commit it.

### Concurrency cap

5 (within a round).

### Dependencies

```
Round 0 (probe baseline)
  -> Round 1 (5 tasks parallel)
      -> Round 2 (3 tasks parallel)
          -> Round 3 (4 tasks parallel)
              -> Round 4 (1 task solo)
```

No inter-task blocking within a round.

### Playtest policy

DEFERRED to morning. No playtest gate BLOCKS merge. Every playtest-style exit criterion is replaced by a probe-based assertion in the task brief.

### Perf policy

`npm run perf-capture:combat120` at Round 0 (if missing) and post-Round-3. p99 budget: within 5% of baseline. If exceeded, do NOT revert; record in RESULT.md for morning review.

### Failure handling (autonomous-safe)

- CI red on a task -> mark that task `blocked`, record, continue.
- Fence-change proposal (`fence_change: yes` in executor report) -> mark `blocked`, record, continue; do NOT merge.
- Probe-assertion fail post-merge -> revert the merge if possible; otherwise mark `rolled-back-pending` and surface in RESULT.md.
- Round N has >= 1 blocked task -> proceed to Round N+1.

### Visual checkpoints (orchestrator-gated)

NONE. Autonomous run.

### skip-confirm

YES. Orchestrator does NOT pause for "go" between rounds.

### Cycle-specific notes

- This is a single-session autonomous run. Orchestrator reads this section, captures Round 0 baseline, then advances R1 -> R2 -> R3 -> R4 without human intervention.
- All 13 task briefs pre-seeded under `docs/tasks/<slug>.md`. Orchestrator does NOT need to generate them from the plan.
- Post-cycle, orchestrator writes `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/RESULT.md` with the post-cycle summary template from `docs/FLIGHT_REBUILD_ORCHESTRATION.md`.
- On cycle close, archive merged briefs via `git mv docs/tasks/<slug>.md docs/tasks/archive/cycle-2026-04-22-flight-rebuild-overnight/<slug>.md` and append a "Recently Completed" section to `docs/BACKLOG.md`.
- Helicopter must not regress (scope is fixed-wing). Shared-file edits are fine; reviewer verifies heli paths untouched.

## Dispatch protocol

For each round, in a single orchestrator turn:

1. Select the next batch per the round schedule (≤ concurrency cap).
2. Send one message with N parallel `Agent` calls:
   ```
   Agent(
     subagent_type="executor",
     isolation="worktree",
     description="<slug>",
     prompt="<full task-brief contents + slug + ground rules>"
   )
   ```
3. Mark each task `in_progress` with `TaskUpdate`.
4. When an executor returns:
   - Read the structured report.
   - If `fence_change: yes` → stop; surface to human.
   - If PR URL present but CI state unknown → poll
     `gh pr view <url> --json statusCheckRollup,mergeable` or stream via
     `Monitor` on `gh pr checks <url> --watch`.
5. On CI green:
   - Spawn `combat-reviewer` if the diff touches `src/systems/combat/**`.
   - Spawn `terrain-nav-reviewer` if the diff touches terrain/nav.
   - Merge via `gh pr merge <url> --rebase` (fast-forward preferred; fall
     back to `--merge` only if branch protection blocks rebase).
   - `TaskUpdate` to `completed` with the PR URL.
   - Advance any dependent tasks that just unblocked.
6. On CI red: `TaskUpdate` to `blocked`; do not retry.

## Merge protocol

- **Preferred:** rebase-merge via `gh pr merge --rebase`.
- **Fallback:** `--merge` if branch protection requires it.
- **Never:** force-push to master. Never squash without explicit instruction.
- **Branch cleanup:** `gh pr merge --rebase` auto-deletes the branch if
  configured; otherwise leave the branch, it's cheap.

## Reviewer invocation rules

- Combat PRs: touch any file under `src/systems/combat/**` or any test under
  `src/integration/**combat*` → `combat-reviewer`.
- Terrain / nav PRs: touch any file under `src/systems/terrain/**` or
  `src/systems/navigation/**` → `terrain-nav-reviewer`.
- The reviewer reads the diff, reports findings to the orchestrator, and does
  not block merge unless it flags a fence change or scope violation.

## Ground rules for dispatched agents

Every task brief ends up in an executor prompt along with these:

1. Read `docs/TESTING.md` before writing tests. Behavior tests only.
2. Read `docs/INTERFACE_FENCE.md` before touching
   `src/types/SystemInterfaces.ts`. Any proposed fence change → stop and
   surface.
3. Small diffs. If you pass ~500 lines net and you are not deleting retired
   code (B1 is the one task that can go larger), stop and reassess.
4. Do not modify files outside the task's `Files touched` scope.
5. Verify locally before pushing: `npm run lint`, `npm run test:run`,
   `npm run build`.
6. Branch: `task/<slug>`. Commit first line:
   `<type>(<scope>): <summary> (<slug>)`.
7. Never push to master directly.
8. Report back in the structured format from `.claude/agents/executor.md`.

## End-of-run summary format

Print this verbatim at cycle end, substituting the current cycle's values:

```
Cycle: <cycle-id>
Dates: <start> → <end>

Round 1: X/N merged | blocked | failed
Round 2: X/M merged
...

PR URLs:
  <slug>: <url>
  <slug>: <url>
  ...

Cycle-specific acceptance results (if any — e.g. integration-test before/after):
  <test name>: <before> → <after>

Perf deltas:
  combat120:
    p95: <ms> (Δ ±<%>)
    p99: <ms> (Δ ±<%>)
  <other-scenario>:
    p95: <ms> (Δ ±<%>)
    p99: <ms> (Δ ±<%>)

Playtest recommended: <slug>, <slug>, ...

Blocked / failed tasks:
  <slug>: <one-line cause>

Next cycle recommendation:
  <one-line>
```

## References

- Executor role spec: `.claude/agents/executor.md`
- Orchestrator playbook: `.claude/agents/orchestrator.md`
- Interface fence rules: `docs/INTERFACE_FENCE.md`
- Test contract: `docs/TESTING.md`
- Playtest checklist: `docs/PLAYTEST_CHECKLIST.md`
- Current backlog: `docs/BACKLOG.md`
- Past-cycle briefs: `docs/tasks/archive/<cycle-id>/`
- E-track spike memos (still referenced by Phase F candidates in the
  backlog): `origin/spike/E2-rendering-at-scale`,
  `spike/E3-combat-ai-paradigm`, `spike/E4-agent-player-api`,
  `spike/E5-deterministic-sim`, `spike/E6-vehicle-physics-rebuild`
