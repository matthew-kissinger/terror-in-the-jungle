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

## Current cycle: cycle-2026-04-22-heap-and-polish

### Cycle ID

`cycle-2026-04-22-heap-and-polish`

### Why this cycle exists

Follow-up polish pass after `cycle-2026-04-22-flight-rebuild-overnight`. Four items surfaced at cycle close or during setup that belong in a tight next pass: (1) combat120 heap-recovery regression (9MB→53MB end-growth; 88%→12% peak recovery); (2) helicopter `PlayerController.updatePlayerPosition` feeds raw physics pose — the same bug PR #124 fixed for fixed-wing; (3) A-1 Skyraider altitude-hold recapture regressed at cruise throttle under PR #126 because the `±0.15` elevator clamp saturates for its thrust-to-weight; (4) user-reported playtest: clouds only visible in A Shau mode and look like "one tile above" — `CloudLayer` shader threshold + coverage defaults leave openfrontier/combat120 reading as empty sky. Full plan in [docs/cycles/cycle-2026-04-22-heap-and-polish/README.md](cycles/cycle-2026-04-22-heap-and-polish/README.md).

### Tasks in this cycle

4 tasks, two rounds. Each has a brief at `docs/tasks/<slug>.md`.

- Round 1 (solo, P0): `heap-recovery-combat120-triage` — investigate the heap regression; deliver a diagnostic memo, optionally a targeted fix if root cause is small + high-confidence.
- Round 2 (3 parallel, P1): `helicopter-interpolated-pose`, `a1-altitude-hold-elevator-clamp`, `cloud-audit-and-polish`.

### Round schedule

R0 (orchestrator prep) → R1 (solo) → R2 (2 parallel). Round 2 does NOT block on Round 1 landing a fix — a memo from Round 1 is sufficient to unblock.

**Round 0 (orchestrator prep):** `git fetch origin && git status` (must be clean); baseline for heap/perf gating inherits `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/perf-after-round3.json`; no fresh Round-0 capture required.

### Concurrency cap

3 (only Round 2 has parallelism).

### Dependencies

```
Round 0 (baseline inherited from prior cycle close)
  -> heap-recovery-combat120-triage (solo)
      -> helicopter-interpolated-pose          ┐
      -> a1-altitude-hold-elevator-clamp       ├─ parallel (disjoint subsystems)
      -> cloud-audit-and-polish                ┘
```

### Playtest policy

DEFERRED. No playtest gate BLOCKS merge. Any playtest-recommended PRs are flagged in RESULT.md.

### Perf policy

Post-Round-2 `npm run perf:capture:combat120`. Two thresholds:
- p99 frame time within 5% of the inherited baseline (same rule as prior cycle).
- `heap_recovery_ratio` ≥ 0.5. If the triage task lands a fix, aim to recover toward the pre-cycle 0.88. If it is memo-only, this gate may still fail — record in RESULT.md and do NOT revert.

### Failure handling (autonomous-safe)

- CI red on a task → mark `blocked`, record, continue.
- Fence-change proposal (`fence_change: yes`) → mark `blocked`, record, DO NOT merge.
- Probe-assertion fail post-merge → revert the merge if possible; otherwise `rolled-back-pending` in RESULT.md.

### Visual checkpoints (orchestrator-gated)

NONE. Autonomous run.

### skip-confirm

YES. Orchestrator does NOT pause for "go" between rounds.

### Cycle-specific notes

- Triage task (`heap-recovery-combat120-triage`) has a memo-only escape hatch. The executor delivers either a fix OR `docs/rearch/HEAP_RECOVERY_COMBAT120_TRIAGE.md` with the bisect table; pick whichever is higher-confidence.
- `cloud-audit-and-polish` has the same escape hatch: if the before-screenshot phase reveals an architectural bug (`CloudLayer` not in scene for some modes, `setTerrainYAtCamera` returning NaN, etc.) the executor writes `docs/rearch/CLOUD_ARCHITECTURAL_ISSUE.md` and STOPS, punting the fix to a dedicated cycle. If screenshots confirm the preliminary diagnosis (threshold + coverage tuning), the fix lands.
- No reviewers trigger for this cycle: tasks touch `src/systems/helicopter/**`, `src/systems/vehicle/airframe/**`, `src/systems/environment/**`. None of these match `src/systems/combat/**` (combat-reviewer) or `src/systems/terrain/**`/`src/systems/navigation/**` (terrain-nav-reviewer). If the heap-triage task lands a fix that touches `src/systems/combat/**`, spawn `combat-reviewer`.
- Helicopter must not regress (scope is helicopter/fixed-wing-config only). The helicopter task is a direct port of PR #124; the clamp task touches only Airframe + FixedWingConfigs. The cloud task touches only `AtmosphereSystem` + `CloudLayer` + `ScenarioAtmospherePresets`.
- Three.js upgrade to 0.184 has landed (commit `7b74b3a`). Cloud shader work is no longer consult-only.

### Pre-flight acknowledgement

The prior cycle, `cycle-2026-04-22-flight-rebuild-overnight`, closed at commit `c7866bf` with 13 merged PRs (#122–#134). See `docs/BACKLOG.md` "Recently Completed (cycle-2026-04-22-flight-rebuild-overnight, 2026-04-22)" and `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/RESULT.md`.

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
