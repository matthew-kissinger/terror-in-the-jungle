# Agent Orchestration — Runbook

Last verified: 2026-05-12 (KONVEYER materialization rearch cycle queued; scene-parity cycle closed atmosphere CPU collapse)

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

## Current cycle: cycle-2026-05-13-konveyer-materialization-rearch (Phase F continuation)

**Current branch:** `exp/konveyer-webgpu-migration`

**Pickup point:** `origin/exp/konveyer-webgpu-migration` HEAD (currently
`1b31379c` — slice 15 idempotent `setCloudCoverage`). Use the branch
head, not a frozen SHA.

**Cycle brief:** [docs/tasks/cycle-2026-05-13-konveyer-materialization-rearch.md](tasks/cycle-2026-05-13-konveyer-materialization-rearch.md)

**Parent campaign brief:** [docs/tasks/konveyer-full-autonomous-migration.md](tasks/konveyer-full-autonomous-migration.md)

**Skip-confirm: YES.** Autonomous continuation on the experimental
branch. Hard stops still force a halt-and-surface (fenced-interface
change, `perf-baselines.json` refresh, `master` merge, production
deploy, WebGL-fallback acceptance, A Shau p99 regression past 33 ms,
carry-over growth).

**Campaign auto-advance:** PAUSED. Experimental-branch work. Cycle
closes on the review packet update; next cycle selection waits for
owner approval.

The predecessor cycle
[cycle-2026-05-11-konveyer-scene-parity](tasks/cycle-2026-05-11-konveyer-scene-parity.md)
closed the scene-parity arc and shipped slices 9-15: perf-window
gate, system-timings attribution, atmosphere sub-attribution, terrain
roughness floor, LUT refresh, DataTexture + 2s timer, refresh-counter
diagnostic, and idempotent `setCloudCoverage`. **Atmosphere CPU
collapsed from 5-6 ms to <1 ms across all five modes**; A Shau
worst-case 5.99 ms → 0.52 ms. Combat (1.5-6.5 ms) is now the
relatively-largest CPU contributor.

### Round schedule

| Round | Tasks (parallel) | Cap |
|-------|------------------|-----|
| 1 | `konveyer-combat-sub-attribution`, `konveyer-materialization-lane-rename`, `konveyer-sky-refresh-investigate` | 3 |
| 2 | `konveyer-cover-spatial-grid`, `konveyer-render-silhouette-lane` | 2 |
| 3 | `konveyer-squad-aggregated-strategic-sim`, `konveyer-budget-arbiter-v2` | 2 |
| 4 | `konveyer-render-cluster-lane`, `konveyer-strict-webgpu-cross-mode-proof-v2`, `konveyer-docs-review-packet-v2` | 3 |

### Tasks in this cycle

Each task scope is defined in
[the cycle brief](tasks/cycle-2026-05-13-konveyer-materialization-rearch.md#task-scope).

- `konveyer-combat-sub-attribution` — wrap `CombatantSystem.update`
  internal `profiler.profiling.*` blocks with
  `performanceTelemetry.beginSystem('Combat.Influence' | 'Combat.AI' |
  'Combat.Billboards' | 'Combat.Effects')`. Probe-side capture of the
  child breakdown. Diagnostic input for `konveyer-cover-spatial-grid`.
- `konveyer-materialization-lane-rename` — pure refactor:
  `Combatant.lodLevel` → `simLane`; introduce `renderLane`. No behavior
  change. Surface for v2 arbiter.
- `konveyer-sky-refresh-investigate` — diagnose why sky refresh still
  fires 5-10×/sec post slice 15 (`LUT_REBAKE_COS_THRESHOLD` on small
  sun motion in `todCycle` modes). Expected ~0.4 ms saving.
- `konveyer-cover-spatial-grid` — replace synchronous BVH cover search
  in `AIStateEngage.initiateSquadSuppression` with 8 m uniform spatial
  grid (primitive-spike target 2.b). Reuses existing `SpatialGrid`
  infrastructure. Closes DEFEKT-3 surface. ~1-2 ms saving.
- `konveyer-render-silhouette-lane` — single-sprite, single-tone, no-
  animation billboard tier between impostor and culled. Lets A Shau
  read as populated from flight-altitude views.
- `konveyer-squad-aggregated-strategic-sim` — per-squad CULLED-tier
  tick via `SquadManager` + `WarSimulator`. O(squads), not O(entities).
  The 3,000-combatant scaling primitive.
- `konveyer-budget-arbiter-v2` — single function consuming camera
  frustum, active-zone list, frame budget, sorted candidates → assigns
  `simLane` + `renderLane` per combatant with explicit budget
  accounting. Composes silhouette/cluster with close-GLB.
- `konveyer-render-cluster-lane` — one billboard per squad with
  squad-count badge, beyond silhouette range. `Combatant` records
  persist as strategic state, just not draws.
- `konveyer-strict-webgpu-cross-mode-proof-v2` — multi-mode strict
  WebGPU evidence packet covering R1-R4 together. A Shau p99 must hold
  ≤33 ms.
- `konveyer-docs-review-packet-v2` — update review packet, primitive
  spikes doc, and `docs/state/CURRENT.md` with post-cycle state.

### Current checkpoint for next agent

Remote branch `origin/exp/konveyer-webgpu-migration` is the pickup
branch. Branch head is `1b31379c` (slice 15). The atmosphere arc is
closed; total Atmosphere CPU is now <1 ms across all five modes (A Shau
worst-case 5.99 ms → 0.52 ms over slices 9-15).

The single most important process discipline for this cycle:

> **Run `npm run build:perf` before every probe run after touching
> source.** The crop probe uses `vite preview --outDir dist-perf`
> against the pre-built bundle. Source changes are NOT auto-rebuilt.
> Without the rebuild, your measurements are meaningless. Slice 14
> spent ~30 minutes debugging this exact gap — do not repeat.

The probe also requires `--headed` to reach WebGPU on this workstation
(headless adapter resolves to swiftshader/CPU). Probe entrypoint:
`scripts/konveyer-asset-crop-probe.ts`.

Predecessor evidence (slice 15 baseline for delta tables):
`artifacts/perf/2026-05-12T20-46-15-213Z/konveyer-asset-crop-probe/asset-crop-probe.json`.

### Dependencies

```
combat-sub-attribution      ─┐
materialization-lane-rename ─┼─→ cover-spatial-grid       ─┐
sky-refresh-investigate     ─┘  render-silhouette-lane     │
                                                           ↓
                          squad-aggregated-strategic-sim ──┐
                          budget-arbiter-v2 ───────────────┤
                                                           ↓
                          render-cluster-lane ─────────────┼─→ strict-webgpu-cross-mode-proof-v2 ─→ docs-review-packet-v2
```

### Reviewer policy

- `combat-reviewer` on touches to `src/systems/combat/**` or
  `src/integration/**combat*` — applies to combat sub-attribution,
  cover spatial grid, budget arbiter v2, and likely the silhouette /
  cluster lanes.
- `terrain-nav-reviewer` on touches to `src/systems/terrain/**` or
  `src/systems/navigation/**` — none expected this cycle, but the
  policy still applies.
- `perf-analyst` after `konveyer-strict-webgpu-cross-mode-proof-v2`
  publishes the multi-mode artifact.

### Cycle-level success criteria

Full list in
[the cycle brief](tasks/cycle-2026-05-13-konveyer-materialization-rearch.md#cycle-level-success-criteria).
Headline criteria:

1. Combat sub-attribution shipped — probe shows
   `Combat.{Influence,AI,Billboards,Effects}` across all five modes.
2. Lane-rename refactor shipped — `simLane` + `renderLane` are
   canonical; no behavior change.
3. Cover-search spatial grid shipped — Combat aggregate drops ≥1.0 ms
   on `ai_sandbox` and `a_shau_valley`; AI behavior unchanged.
4. Silhouette + cluster lanes shipped — A Shau and flight-altitude
   views read as populated.
5. Squad-aggregated strategic sim shipped — CULLED tier scales
   O(squads); strategic-spawn cadence holds.
6. Budget arbiter v2 shipped — single function emitting both lanes
   with explicit budget accounting.
7. Strict-WebGPU multi-mode proof passes — all five modes; p99 ≤33 ms
   held across cycle.
8. Review packet updated.

### Out of scope (parked / blocked)

These remain blocked on owner decisions and do NOT progress this cycle:

- A Shau finite-edge (KONVEYER-12) — owner DEM/boundary decision.
- Cloud representation — art/representation decision.
- Vegetation + NPC asset acceptance — Pixel Forge pipeline decision.
- Water shader / art / physics (VODA-1/2/3).
- Terrain / fire authority (DEFEKT-6) — shared-authority pass.
- Startup stamped-heightmap rebake (~48 ms one-time, not runtime-gating).
- TSL fragment-shader sky port — Atmosphere is <1 ms; saving ~0.4 ms,
  parked unless a regression resurfaces it.

### Last closed cycle

`cycle-2026-05-11-konveyer-scene-parity` (KONVEYER-10) shipped the
scene-parity arc + slices 9-15 (perf attribution, terrain roughness
fix, atmosphere CPU collapse). See `docs/state/CURRENT.md` for the
slice-by-slice evidence chain. KONVEYER-0..9 ledger:
[docs/rearch/KONVEYER_PARITY_2026-05-10.md](rearch/KONVEYER_PARITY_2026-05-10.md).

Carry-overs still open: see [docs/CARRY_OVERS.md](CARRY_OVERS.md).
KONVEYER-10 remains active as the WebGPU rollout-gating carry-over
(closes when the master-merge decision lands, separate from this
cycle).

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
