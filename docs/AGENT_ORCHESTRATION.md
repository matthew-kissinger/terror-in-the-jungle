# Agent Orchestration — Runbook

Last updated: 2026-04-22

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

## Current cycle: cycle-2026-04-23-debug-cleanup

### Cycle ID

`cycle-2026-04-23-debug-cleanup`

### Why this cycle exists

Two small follow-ups from the just-closed `cycle-2026-04-23-debug-and-test-modes` want to be paid off before the next feature cycle starts: (1) `preserveDrawingBuffer: true` on `WebGLRenderer` shipped unconditional in PR #144, costing retail players +13 MB heap residual for a feature (F9 capture) they never trigger; (2) PR #145 `world-overlay-debugger` is blocked on a CI-only test failure (`terrainChunkOverlay.test.ts` expected 24 line segments, got 0; 3710 tests green locally). The six overlays (navmesh / LOS / squad influence / LOD tier / aircraft contact / terrain chunks) are genuinely useful for the upcoming playtest and should land. Full plan in [docs/cycles/cycle-2026-04-23-debug-cleanup/README.md](cycles/cycle-2026-04-23-debug-cleanup/README.md).

### Tasks in this cycle

2 tasks, one round. Each has a brief at `docs/tasks/<slug>.md`.

- **Round 1 (2 parallel — disjoint file sets):**
  - `preserve-drawing-buffer-dev-gate` (P0, ≤60 LOC) — gate `preserveDrawingBuffer` in `src/core/GameRenderer.ts` behind `import.meta.env.DEV || ?capture=1`. Retail players who don't opt in stop paying the +13 MB heap tax; Cloudflare testers can reach F9 by adding `?capture=1` to the URL.
  - `world-overlay-debugger-ci-fix` (P1, ≤50 LOC test delta on top of the existing PR branch) — rebase `task/world-overlay-debugger` on current master, diagnose + fix the `terrainChunkOverlay.test.ts` CI-only failure (most likely a mock-stub ordering issue), re-push, merge PR #145.

### Round schedule

R0 (sanity check, no install, no fresh baseline) → R1 (2 parallel) → post-R1 perf gate.

**Round 0 (orchestrator prep):** `git fetch origin && git status` (must be clean). No `npm install` needed (Tweakpane already on master). No fresh baseline — reuse `docs/cycles/cycle-2026-04-23-debug-and-test-modes/baseline/combat120-baseline-summary.json`.

### Concurrency cap

2 (R1 uses both slots; no other rounds).

### Dependencies

```
Round 0 (sanity check)
  -> preserve-drawing-buffer-dev-gate  ┐
  -> world-overlay-debugger-ci-fix     ┘─ R1 parallel (fully disjoint file sets)
```

### Playtest policy

DEFERRED. No playtest gate BLOCKS merge. Human playtests dev server + Cloudflare Pages AFTER this cycle merges, using the diagnostic surface from the prior cycle plus the corrected retail heap behavior + world-overlay visualizations.

### Perf policy

- **Baseline:** inherited from prior cycle's R0 capture (no drift since).
- **Gate:** post-R1 `npm run perf:capture:combat120`. Three thresholds:
  - p99 within 5% of baseline (34.20 ms → ceiling 35.91 ms).
  - `heap_recovery_ratio` ≥ 0.5.
  - `heap_end_growth_mb` ≤ +2 MB (should walk the R3 +13 MB back toward baseline; this is the correctness gate for task 1).

### Failure handling (autonomous-safe)

- CI red on a task → mark `blocked`, record, continue.
- Fence-change proposal → mark `blocked`, DO NOT merge.
- `world-overlay-debugger-ci-fix` >50 LOC or second CI red after first push → STOP that task, mark blocked, cycle degrades to single-task (preserve-drawing-buffer-dev-gate still lands).

### Visual checkpoints (orchestrator-gated)

NONE. Autonomous run.

### skip-confirm

YES. Orchestrator does NOT pause between R0 sanity check and R1 dispatch.

### Cycle-specific notes

- **No reviewers expected.** Task 1 touches only `src/core/GameRenderer.ts`; task 2 touches only `src/ui/debug/worldOverlays/terrainChunkOverlay.test.ts` (+ possibly 1–2 lines of `TerrainRenderRuntime.ts`). Neither triggers combat-reviewer or terrain-nav-reviewer on its own. PR #145's original content already landed past reviewer scope; the fix is diagnostic, not functional.
- **Task 2's hard stop is real.** If the CI-fix needs accessor rework, do NOT iterate past 50 LOC — leave PR #145 blocked for a future cycle. Cleanup cycle's job is paying off small debts, not rescuing hard blocks.
- **Both tasks are additive.** No retired code to delete, no feature flags to flip, no rollout needed.

### Pre-flight acknowledgement

The prior cycle, `cycle-2026-04-23-debug-and-test-modes`, closed on 2026-04-22 with 6 merged PRs (#139, #140, #141, #142, #143, #144, #146) and 1 blocked PR (#145 `world-overlay-debugger`, CI test failure — addressed by this cycle's task 2). See `docs/BACKLOG.md` "Recently Completed (cycle-2026-04-23-debug-and-test-modes, 2026-04-22)" and `docs/cycles/cycle-2026-04-23-debug-and-test-modes/RESULT.md`.

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
