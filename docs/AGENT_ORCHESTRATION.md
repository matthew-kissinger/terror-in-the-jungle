# Agent Orchestration — Runbook

Last verified: 2026-05-11 (KONVEYER-10 scene-parity cycle selected)

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

## Current cycle: cycle-2026-05-11-konveyer-scene-parity (KONVEYER-10)

**Current branch:** `exp/konveyer-webgpu-migration`

**Cycle brief:** [docs/tasks/cycle-2026-05-11-konveyer-scene-parity.md](tasks/cycle-2026-05-11-konveyer-scene-parity.md)

**Parent campaign brief:** [docs/tasks/konveyer-full-autonomous-migration.md](tasks/konveyer-full-autonomous-migration.md)

**Skip-confirm: NO.** Human review is still required before merging to
`master`, deploying, updating performance baselines, changing fenced
interfaces, or accepting any WebGL/fallback route as rollout-compatible.

**Campaign auto-advance:** PAUSED. This is experimental branch work. Do
not auto-advance into `master` or production deploy without a fresh human
approval step.

KONVEYER-0 through KONVEYER-9 branch-review evidence exists on the WebGPU
migration branch: strict WebGPU startup proof, TSL/WebGPU renderer ports,
zero current production render blockers in the completion audit, and
accepted terrain ground tone. The current blocker is not terrain color.
KONVEYER-10 owns rest-of-scene parity and performance attribution:
vegetation/NPC washout, atmosphere/lighting drift, sky/cloud anchoring,
World-frame-budget decomposition, skyward high-triangle attribution, and
finite-map edge presentation.

### Round schedule

| Round | Tasks (parallel) | Cap |
|-------|------------------|-----|
| 1 | `world-budget-attribution`, `vegetation-npc-parity-probes`, `skyward-triangle-attribution` | 3 |
| 2 | `atmosphere-sky-anchor`, `finite-map-edge-strategy` | 2 |
| 3 | `strict-webgpu-cross-mode-proof`, `docs-review-packet` | 2 |

### Tasks in this cycle

Each task scope is defined in
[the cycle brief](tasks/cycle-2026-05-11-konveyer-scene-parity.md#task-scope).

- `world-budget-attribution` - split `World` timing into terrain,
  vegetation, feature placement, sky/cloud/water, and residual buckets.
- `vegetation-npc-parity-probes` - capture material, exposure, lighting,
  and representation evidence for vegetation and NPC impostor/GLB washout.
- `skyward-triangle-attribution` - identify why looking upward can report
  roughly 1.5M triangles and whether renderer-info accounting or real draws
  are responsible.
- `atmosphere-sky-anchor` - decide and prove the sky/cloud anchoring model
  so it no longer reads as terrain-traveling scenery. First slice is the
  camera-followed dome plus world/altitude-projected cloud deck proved in
  `artifacts/perf/2026-05-11T21-11-29-948Z/konveyer-scene-parity/scene-parity.json`;
  final cloud art/weather representation remains open.
- `finite-map-edge-strategy` - propose and prototype the sharp terrain-edge
  treatment for finite maps such as Zone Control.
- `strict-webgpu-cross-mode-proof` - prove the candidate on strict WebGPU
  across Open Frontier, TDM, Zone Control, A Shau, and combat120.
- `water-hydrology-bridge` - connect the KONVEYER scene-architecture review to
  VODA by proving hydrology meshes, water queries, and the first interaction
  sample without accepting final shader/art/physics.
- `docs-review-packet` - close the cycle with source-of-truth docs and a
  reviewer-ready packet.

### Dependencies

```
world-budget-attribution      ─┐
vegetation-npc-parity-probes  ├─→ strict-webgpu-cross-mode-proof ─→ docs-review-packet
skyward-triangle-attribution  ─┘
atmosphere-sky-anchor         ─┐
finite-map-edge-strategy      ─┘
```

### Reviewer policy

Use `terrain-nav-reviewer` for terrain-edge, CDLOD, terrain visibility, or
navigation-adjacent edits. Use `combat-reviewer` if NPC materialization,
combatant renderer, impostor, or close-GLB behavior changes. Run perf
analysis after the cross-mode proof packet, not before the attribution
tasks are in place.

### Cycle-level success criteria

Full list in
[the cycle brief](tasks/cycle-2026-05-11-konveyer-scene-parity.md#success-criteria).
Highlights: strict WebGPU only; no fallback acceptance; terrain color
remains accepted; rest-of-scene parity has visual evidence; `World` budget
is decomposed; skyward triangle count has an owner; sky/cloud anchoring and
finite-map edge strategy are explicit; cross-mode evidence is attached.

### Last closed cycle

The relevant predecessor is the KONVEYER branch-review pass, not the
older master stabilization campaign. KONVEYER-0 through KONVEYER-9 closed
the first experimental migration review route with branch-local evidence,
but did not certify production rollout. See
[docs/state/recent-cycles.md](state/recent-cycles.md#konveyer-branch-review-2026-05-11-experimental-not-deployed)
and [docs/rearch/KONVEYER_PARITY_2026-05-10.md](rearch/KONVEYER_PARITY_2026-05-10.md#konveyer-10-next-cycle-scene-parity-and-frame-budget-attribution).

Carry-overs still open: see [docs/CARRY_OVERS.md](CARRY_OVERS.md).
KONVEYER-10 has been added as the active WebGPU rollout-gating carry-over.

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
