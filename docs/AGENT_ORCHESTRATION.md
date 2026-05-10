# Agent Orchestration — Runbook

Last verified: 2026-05-09 (Phase 0 realignment: reviewer-pre-merge, cycle stoplist, carry-over discipline)

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

### Cycle-name stoplist (Phase 0 rule, enforced by `scripts/cycle-validate.ts`)

New cycle slugs **cannot** contain any of these substrings: `polish`,
`cleanup`, `drift-correction`, `stabilization-reset`, `debug-cleanup`,
`housekeeping`, `tidy`, `chore-only`. Each cycle must close one
user-observable gap or feature; doctor-doc work happens inside a feature
cycle, not as its own. Run `npx tsx scripts/cycle-validate.ts <slug>` before
seeding a new cycle to verify.

### Carry-over discipline

`docs/CARRY_OVERS.md` is the single source of truth for unresolved items.
At cycle close, the orchestrator measures active count vs. cycle-start. If
the count grew, the cycle is **INCOMPLETE**; the cycle ID is reused with a
`-2` suffix until the count holds or shrinks. Carry-overs open ≥5 cycles are
red-flagged and must be named in the next cycle's plan.

### Campaign auto-advance (Phase 0 + realignment plan, 2026-05-09)

A **campaign** is an ordered sequence of cycles queued in
[docs/CAMPAIGN_2026-05-09.md](CAMPAIGN_2026-05-09.md). When the active
campaign declares `auto-advance: yes`, the orchestrator chains cycles
without human input:

1. Run the current cycle's dispatch loop normally.
2. At end-of-cycle, run the ritual (move briefs, append BACKLOG, refresh
   `docs/CARRY_OVERS.md` via `npm run check:cycle -- <slug> --close`).
3. Read the campaign manifest. If a `next-cycle` is queued and not
   gated by a hard-stop, update this file's "Current cycle" section to
   point at the next cycle's brief and **continue without prompting**.
4. Hard-stops still surface and halt the campaign:
   - Fence-change proposal in any executor report
   - >2 CI red or blocked tasks in a single round
   - Perf regression >5% p99 on `combat120` after any round
   - Carry-over count grew during a cycle (cycle becomes INCOMPLETE; campaign halts)
   - Any executor reports `isolation=worktree` failure
5. Hard-stops surface as: print the failure summary, set "Current cycle"
   in this file to the **failed** cycle (with status `INCOMPLETE` /
   `BLOCKED`), and halt. The human resumes the campaign manually.

Without `auto-advance: yes`, the orchestrator stops after each cycle close
and waits for the next `/orchestrate` invocation. That's the legacy
single-cycle pattern.

**End-of-cycle ritual** (run as the last orchestrator action, or as a
standalone bookkeeping pass):

1. Move each merged brief from `docs/tasks/<slug>.md` →
   `docs/tasks/archive/<cycle-id>/<slug>.md`.
2. Append a `## Recently Completed (<cycle-id>)` section to
   `docs/BACKLOG.md` with PR list, one-line summaries, and follow-ups.
3. Reset the "Current cycle" section below to the empty stub.
4. Commit with message `docs: close <cycle-id>`.

The stub template under "Current cycle" is what the next cycle fills in.

## Current cycle: cycle-2026-05-09-cdlod-edge-morph

**Hot-fix cycle, inserted ahead of Phase 2.5** to address a P1
user-reported visual regression: white seam cracks at terrain
chunk borders from helicopter altitude on A Shau (screenshot
2026-05-09). The Stage D1+D2 fix from `terrain-cdlod-seam`
(cycle-2026-05-08) closed same-LOD parity but explicitly deferred
the LOD-transition T-junction case. This cycle ships the canonical
Strugar-style fix.

**Cycle brief:** [docs/tasks/cycle-2026-05-09-cdlod-edge-morph.md](tasks/cycle-2026-05-09-cdlod-edge-morph.md)

**Task brief:** [docs/tasks/cdlod-edge-morph.md](tasks/cdlod-edge-morph.md)
— full diagnosis with line citations, three-stage plan, hard stops,
rollback plan, sources from CDLOD literature.

**Skip-confirm: YES.** Single-task cycle, no manual human gate. Stage 0
(diagnosis pre-check via the existing `Shift+\` → `Y` seam overlay) is
OPTIONAL human pre-flight; if skipped, Stage 5 post-impl visual A/B is
the gate.

**Campaign auto-advance:** PAUSED (per
[docs/CAMPAIGN_2026-05-09.md](CAMPAIGN_2026-05-09.md)). After this
hot-fix cycle closes, the orchestrator stops; "Current cycle" is
restored to point at Phase 2.5 (`cycle-2026-05-10-stabilization-fixes`),
which is unchanged and still ready.

### Round schedule

| Round | Tasks (parallel) | Cap |
|-------|------------------|-----|
| 1 | `cdlod-edge-morph` | 1 |

### Tasks in this cycle

Each brief is in `docs/tasks/<slug>.md`:

- [cdlod-edge-morph](tasks/cdlod-edge-morph.md) — fix LOD-transition seam cracks via per-edge `edgeMorphMask` instanced attribute + shader force-morph + corrected `parentStep = 2/(N-1)` snap math. Three commits (snap-math / quadtree+attribute / shader+force-morph), ≤500 LOC source + ≤300 LOC tests.

### Dependencies

None — single task. Three internal stages are sequenced inside the task
itself across three commits.

### Reviewer policy

- **`terrain-nav-reviewer` gates merge** (Phase 0 pre-merge rule — touches `src/systems/terrain/**`).
- No `combat-reviewer` (no combat surface touched).

### Cycle-level success criteria

See [the cycle brief](tasks/cycle-2026-05-09-cdlod-edge-morph.md#cycle-level-success-criteria)
for the 10-point list. Highlights:

- Visual A/B at A Shau north ridgeline (helicopter altitude): white cracks gone or near-zero
- `Shift+\` → `Y` seam overlay red-line count drops ≥80% at the same camera position
- `combat120` p99 within ±2% of pre-cycle baseline
- Same-LOD parity test (`CDLODQuadtree.test.ts:130`) stays green — non-regression for predecessor Stage D1
- New tests green: snap-math parity, edge-mask correctness, shader morph parity at LOD-transition
- Carry-over count holds at 12 or drops (no new carry-overs unless Stage 3 follow-up filed)
- `terrain-nav-reviewer` APPROVE or APPROVE-WITH-NOTES before merge

### Next cycle (queued, undispatched)

`cycle-2026-05-10-stabilization-fixes` (Phase 2.5, ready). Bundles 4
Cloudflare-audit fixes (PostCSS CVE bump, `_headers` file, SEO
essentials, Web Analytics enablement). Resumes after this hot-fix
closes; brief at [docs/tasks/cycle-2026-05-10-stabilization-fixes.md](tasks/cycle-2026-05-10-stabilization-fixes.md).

### Last closed cycle

`cycle-2026-05-10-zone-manager-decoupling` closed 2026-05-09 with 5 PRs
merged ([#173](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/173),
[#174](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/174),
[#175](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/175),
[#176](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/176),
[#177](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/177)).
Phase 2 added `IZoneQuery` to the fenced interfaces (PR #174,
terrain-nav-reviewer APPROVE), then migrated 11 ZoneManager consumers
(HUD/Compass/Minimap/FullMap, Combat/Tickets/WarSim, PlayerRespawn +
CommandInputManager) to either the read-only interface or a
GameEventBus-driven event cache. ZoneManager fan-in 52 → 17 read / 5
concrete (the 5 are the deferred weapons cluster). ZoneManager removed
from `scripts/lint-source-budget.ts` GRANDFATHER. combat-reviewer +
terrain-nav-reviewer all APPROVE / APPROVE-WITH-NOTES. Cycle retro:
[docs/BACKLOG.md](BACKLOG.md) "Recently Completed (cycle-2026-05-10-...)".

3 new carry-overs filed at the stabilization checkpoint:
`cloudflare-stabilization-followups`, `weapons-cluster-zonemanager-migration`,
`perf-doc-script-paths-drift`. Active count 9 → 12 (at the ≤12 rule limit).
Phase 2.5 (this cycle) closes `cloudflare-stabilization-followups`,
returning the active count to 11.

Carry-overs from prior cycles still open (legacy 7 + 2 from Phase 1 close +
3 from Phase 2 stabilization checkpoint = 12, see
[docs/CARRY_OVERS.md](CARRY_OVERS.md)): DEFEKT-3 (combat AI p99),
DEFEKT-4 (NPC route quality), STABILIZAT-1 (combat120 baseline refresh),
AVIATSIYA-1 / DEFEKT-5 (visual review pending), AVIATSIYA-2 (AC-47 takeoff
bounce), AVIATSIYA-3 (helicopter parity audit), KB-LOAD residual,
artifact-prune-baseline-pin-fix, worldbuilder-oneshotkills-wiring,
cloudflare-stabilization-followups (closes when this cycle closes),
weapons-cluster-zonemanager-migration, perf-doc-script-paths-drift.

### Last closed cycle

`cycle-2026-05-10-zone-manager-decoupling` closed 2026-05-09 with 5 PRs
merged ([#173](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/173),
[#174](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/174),
[#175](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/175),
[#176](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/176),
[#177](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/177)).
Phase 2 added `IZoneQuery` to the fenced interfaces (PR #174,
terrain-nav-reviewer APPROVE), then migrated 11 ZoneManager consumers
(HUD/Compass/Minimap/FullMap, Combat/Tickets/WarSim, PlayerRespawn +
CommandInputManager) to either the read-only interface or a
GameEventBus-driven event cache. ZoneManager fan-in 52 → 17 read / 5
concrete (the 5 are the deferred weapons cluster). ZoneManager removed
from `scripts/lint-source-budget.ts` GRANDFATHER. combat-reviewer +
terrain-nav-reviewer all APPROVE / APPROVE-WITH-NOTES. Cycle retro:
[docs/BACKLOG.md](BACKLOG.md) "Recently Completed (cycle-2026-05-10-...)".

3 new carry-overs filed at the stabilization checkpoint:
`cloudflare-stabilization-followups`, `weapons-cluster-zonemanager-migration`,
`perf-doc-script-paths-drift`. Active count 9 → 12 (at the ≤12 rule limit).

Carry-overs from prior cycles still open (legacy 7 + 2 from Phase 1 close +
3 from Phase 2 stabilization checkpoint = 12, see
[docs/CARRY_OVERS.md](CARRY_OVERS.md)): DEFEKT-3 (combat AI p99),
DEFEKT-4 (NPC route quality), STABILIZAT-1 (combat120 baseline refresh),
AVIATSIYA-1 / DEFEKT-5 (visual review pending), AVIATSIYA-2 (AC-47 takeoff
bounce), AVIATSIYA-3 (helicopter parity audit), KB-LOAD residual,
artifact-prune-baseline-pin-fix, worldbuilder-oneshotkills-wiring,
cloudflare-stabilization-followups, weapons-cluster-zonemanager-migration,
perf-doc-script-paths-drift.

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
   - **Reviewer runs BEFORE merge for combat / terrain-nav PRs (Phase 0
     change, 2026-05-09).** Spawn `combat-reviewer` if the diff touches
     `src/systems/combat/**`; spawn `terrain-nav-reviewer` if the diff
     touches `src/systems/terrain/**` or `src/systems/navigation/**`. CI
     green is necessary, not sufficient; the reviewer report must read
     APPROVE or APPROVE-WITH-NOTES before the merge step.
   - If reviewer returns CHANGES-REQUESTED: `TaskUpdate` to `in_progress`,
     re-dispatch the executor with the reviewer notes, do not merge.
   - On reviewer APPROVE / APPROVE-WITH-NOTES: merge via
     `gh pr merge <url> --rebase` (fast-forward preferred; fall back to
     `--merge` only if branch protection blocks rebase).
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
- The reviewer reads the diff, reports findings to the orchestrator. As of
  Phase 0 (2026-05-09), the reviewer **runs before merge and gates merge**
  for combat / terrain-nav PRs. Outcomes:
  - `APPROVE` → orchestrator merges.
  - `APPROVE-WITH-NOTES` → orchestrator merges; notes captured in cycle
    retro for follow-up.
  - `CHANGES-REQUESTED` → orchestrator re-dispatches the executor with the
    notes, does not merge.

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
   `npm run build`. New rules as of Phase 0 (2026-05-09):
   - Files ≤700 LOC and ≤50 public methods (grandfathered exceptions
     listed in `eslint.config.js`).
   - New `src/systems/**/*.ts` requires a sibling `*.test.ts`.
   - PR description names a closed carry-over by ID (from
     `docs/CARRY_OVERS.md`) OR the user-observable gap shipped.
   - Touch to `src/types/SystemInterfaces.ts` requires `[interface-change]`
     in PR title and commit message; pre-flight via
     `npx tsx scripts/check-fence.ts`.
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
