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

## Current cycle: cycle-2026-04-23-debug-and-test-modes

### Cycle ID

`cycle-2026-04-23-debug-and-test-modes`

### Why this cycle exists

Iterating on system issues requires re-entering a full game and fighting combat pressure while trying to diagnose a specific subsystem. The existing `?mode=flight-test` (isolated physics scene) is too far removed from authentic engine state for flight-feel work. Debug overlays (F1-F4) are hand-wired so adding a new panel for vehicle-state / combat-state / current-mode means a new top-level overlay class + a new keybind. And playtest feedback capture happens out-of-band in `Win+Shift+S` + a markdown doc. This cycle lands the three foundations that close all three gaps: a debug-HUD registry with a master toggle, a launcher for full-engine test/sandbox modes, a concrete `airfield-sandbox` mode, and an F9 screenshot+annotation capture. Full plan in [docs/cycles/cycle-2026-04-23-debug-and-test-modes/README.md](cycles/cycle-2026-04-23-debug-and-test-modes/README.md).

### Tasks in this cycle

4 tasks, two rounds. Each has a brief at `docs/tasks/<slug>.md`.

- Round 1 (solo, P0): `debug-hud-registry` — unify F1-F4 overlays under a registry with a master-toggle (backtick); seed 3 new panels (vehicle-state, combat-state, current-mode).
- Round 2 (3 parallel, P1):
  - `test-mode-launcher` — extend `GameMode` enum + main-menu UI for test modes; seed `AIRFIELD_SANDBOX` + `COMBAT_SANDBOX` stub; URL + menu routing.
  - `airfield-sandbox-mode` — fill in `AIRFIELD_SANDBOX` content: spawn at `main_airbase`, aircraft claimable, enemy AI muted via composition-level config, no objective pressure.
  - `playtest-capture-overlay` — F9 captures `renderer.domElement.toBlob()` + an annotation prompt; writes session-scoped `.png` + `.md` to `artifacts/playtest/`.

### Round schedule

R0 (fresh baseline) → R1 (solo) → R2 (3 parallel). R2 does NOT block on R1 landing; R2 touches disjoint files.

**Round 0 (orchestrator prep):** `git fetch origin && git status` (must be clean); capture a fresh `npm run perf:capture:combat120` and commit to `docs/cycles/cycle-2026-04-23-debug-and-test-modes/baseline/` (prior cycle flagged the inherited baseline as an outlier; this cycle uses a fresh one).

### Concurrency cap

3 (only Round 2 has parallelism).

### Dependencies

```
Round 0 (fresh baseline capture)
  -> debug-hud-registry (solo)
      -> test-mode-launcher         ┐
      -> airfield-sandbox-mode      ├─ parallel (disjoint files)
      -> playtest-capture-overlay   ┘
```

### Playtest policy

DEFERRED. No playtest gate BLOCKS merge. `airfield-sandbox-mode` and `playtest-capture-overlay` are worth a human pass post-merge — flag in RESULT.md under "Playtest recommended."

### Perf policy

- **Baseline:** Round-0 fresh capture (`baseline/perf-baseline-combat120.json`), not the prior cycle's outlier baseline.
- **Gate:** post-Round-2 `npm run perf:capture:combat120`. p99 within 5% of Round-0 baseline; `heap_recovery_ratio` ≥ 0.5.

### Failure handling (autonomous-safe)

- CI red on a task → mark `blocked`, record, continue.
- Fence-change proposal (`fence_change: yes`) → mark `blocked`, record, DO NOT merge.
- Probe/screenshot-assertion fail post-merge → revert if possible; otherwise `rolled-back-pending` in RESULT.md.

### Visual checkpoints (orchestrator-gated)

NONE. Autonomous run. Screenshots are cycle evidence, not orchestrator gates.

### skip-confirm

YES. Orchestrator does NOT pause between rounds.

### Cycle-specific notes

- **F1-F4 keybind muscle memory preserved.** `debug-hud-registry` adds a new master-toggle on backtick; F1=Performance F2=runtime-stats F3=Log F4=Time must still toggle their original panels.
- **`?mode=flight-test` is NOT replaced.** The isolated-physics bypass in `src/dev/flightTestScene.ts` stays for probe/physics work. `test-mode-launcher` adds full-engine test modes that DO use the normal launch flow.
- **`airfield-sandbox-mode` must suppress combat via composition-level config, NOT by editing `src/systems/combat/**`.** If the executor finds the composer doesn't honor a top-level `warSimulator.enabled=false`, STOP and file a finding.
- **Reviewers:** `airfield-sandbox-mode` may touch `src/core/ModeStartupPreparer.ts` + `src/config/gameModeDefinitions.ts`; if the diff ends up inside `src/systems/combat/**` or `src/systems/terrain/**`, spawn the matching reviewer. The other three tasks touch `src/ui/**`, `src/core/GameEngine*`, `src/systems/input/**`, `src/config/**` — no reviewer scope.

### Pre-flight acknowledgement

The prior cycle, `cycle-2026-04-22-heap-and-polish`, closed on 2026-04-22 with 4 merged PRs (#135–#138). See `docs/BACKLOG.md` "Recently Completed (cycle-2026-04-22-heap-and-polish, 2026-04-22)" and `docs/cycles/cycle-2026-04-22-heap-and-polish/RESULT.md`.

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
