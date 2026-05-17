# Agent Orchestration — Runbook

Last verified: 2026-05-16 (12-cycle autonomous chain advanced; cycles #1-#5 closed at fd646aeb / 7931d179 / b86cf027 / 73e777cb / f14400d2 + cycle close-commit; current cycle = cycle-vekhikl-2-stationary-weapons)

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
[docs/archive/CAMPAIGN_2026-05-09.md](archive/CAMPAIGN_2026-05-09.md). When the active
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

### Autonomous-loop posture (2026-05-16, `/goal`-aligned runs)

When the campaign manifest declares **both** `auto-advance: yes` **and**
`posture: autonomous-loop`, the orchestrator runs as an unattended
all-night loop. Per-cycle playtest-required gates become deferred
(not blocking) so the owner can walk through them after the campaign
completes.

Overrides under `posture: autonomous-loop`:

1. **Owner-playtest tasks become Playwright smoke + screenshot capture.**
   The executor runs the feature's golden-path smoke, commits
   screenshots to `artifacts/cycle-<slug>/playtest-evidence/`, and
   writes a `docs/playtests/<slug>.md` memo flagged "automated smoke;
   owner walk-through pending."
2. **"Owner playtest rejects twice → halt" hard-stops are removed.**
   Replaced by "Playwright smoke errors twice → halt" (true
   automation signal only).
3. **"Real-device validation infeasible → halt" becomes a documented
   limitation, NOT a hard stop.** Merge proceeds on CI green +
   reviewer APPROVE. The cycle's close memo and
   [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md) get the deferral
   note.
4. **The orchestrator appends to
   [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md)** at every cycle
   close that had a playtest task, listing what the owner should
   walk through post-campaign.
5. **Cycle-close commits append `(playtest-deferred)`** to the subject
   line when the cycle had playtest gates, so `git log` makes
   deferred items easy to grep.

The true hard-stops (fence change, >2 CI red, perf regression > 5%
p99, carry-over growth, worktree failure, twice-rejected reviewer)
still halt the autonomous loop and surface to the human.

To exit `posture: autonomous-loop` mid-campaign: edit the campaign
manifest and remove the `posture: autonomous-loop` line (or flip
`auto-advance: yes` → `PAUSED`). The orchestrator finishes the
in-flight cycle and stops.

**End-of-cycle ritual** (run as the last orchestrator action, or as a
standalone bookkeeping pass):

1. Move each merged brief from `docs/tasks/<slug>.md` →
   `docs/tasks/archive/<cycle-id>/<slug>.md`.
2. Append a `## Recently Completed (<cycle-id>)` section to
   `docs/BACKLOG.md` with PR list, one-line summaries, and follow-ups.
3. Reset the "Current cycle" section below to the empty stub.
4. Commit with message `docs: close <cycle-id>`.

The stub template under "Current cycle" is what the next cycle fills in.

## Current cycle: cycle-vekhikl-2-stationary-weapons

**Cycle ID:** `cycle-vekhikl-2-stationary-weapons`
**Brief:** [docs/tasks/cycle-vekhikl-2-stationary-weapons.md](tasks/cycle-vekhikl-2-stationary-weapons.md)
**Skip-confirm:** yes (campaign auto-advance is `yes`; owner playtest
auto-deferred to PLAYTEST_PENDING.md under autonomous-loop posture)
**Concurrency cap:** 4

User-observable gap closed: VEKHIKL-2 — ship fixed weapon emplacements
(M2HB .50-cal heavy machine gun on tripod/sandbag) that the player
mounts via the existing `IVehicle` seat-occupant surface. NPC gunners
can also occupy via the existing `CombatantAI` target-acquisition
pipeline. Builds on VEKHIKL-1's seat-occupant + PlayerVehicleAdapter
surface.

### Round schedule

| Round | Tasks (parallel) | Cap |
|-------|------------------|-----|
| 1 | `emplacement-vehicle-surface`, `emplacement-player-adapter` | 2 |
| 2 | `m2hb-weapon-integration`, `emplacement-npc-gunner`, `vekhikl-2-playtest-evidence` | 3 |

### Dependencies

- R1: emplacement-vehicle-surface (IVehicle impl, ~250 LOC, possibly
  extends `VehicleCategory` with `'emplacement'`) + emplacement-
  player-adapter (PlayerVehicleAdapter for mount/aim/fire). Adapter
  depends on surface; the brief says "serialize within R1" — orchestrator
  can dispatch in parallel using stub-then-swap pattern (proven in #224).
- R2: m2hb-weapon-integration (M2HB ballistics + visual + sound),
  emplacement-npc-gunner (CombatantAI hook for NPCs to occupy + fire),
  vekhikl-2-playtest-evidence (owner playtest, auto-deferred under
  autonomous-loop).

### Reviewer policy

- `combat-reviewer` is a **pre-merge gate** for `m2hb-weapon-integration`
  and `emplacement-npc-gunner` (touch `src/systems/combat/**`).
- No mandatory `terrain-nav-reviewer` (no terrain/nav touches expected).
- Orchestrator reviews other PRs for surface integrity + playtest evidence.

### Hard stops (cycle-specific)

- Any task adds a new physics library (`rapier`/`cannon`/`jolt`/`ammo.js`/`physijs`)
  → halt. Tripod is a static collider; M2HB barrel is a rotation rig
  parented to it.
- If extending `VehicleCategory` requires a fence change to
  `src/types/SystemInterfaces.ts` → halt and surface (IVehicle is NOT
  in the fence list per INTERFACE_FENCE.md, so this should be safe;
  but verify the executor doesn't accidentally widen a fenced type).
- Owner playtest rejects R2 twice → halt (deferred under autonomous-loop;
  orchestrator proceeds, owner sweeps later).
- Standard: fence change, worktree isolation failure, twice-rejected reviewer.
- Campaign-wide: perf regression > 5% p99 on `combat120` (deferred to
  cycle #12 baseline refresh until that lands).

### Success criteria

See [docs/tasks/cycle-vekhikl-2-stationary-weapons.md](tasks/cycle-vekhikl-2-stationary-weapons.md)
"Acceptance Criteria (cycle close)":
- All R1 + R2 task PRs merged.
- M2HB emplacements spawnable + mountable by player + NPC gunners.
- Owner playtest sign-off recorded (deferred under autonomous-loop).
- No external physics library added.
- No fence change.
- `VEKHIKL-2` directive moves Open → code-complete.

### Out of scope

Other emplacements (Mk-19, M60 nest, ZPU AA, MK60 mortar pit — future
cycles). Helicopter-mounted M2 variants (separate cycle).
Vehicle-mounted versions (post-VEKHIKL-4 cycle). Touching
`src/systems/terrain/**`, `src/systems/navigation/**`. Fenced-interface
touches.

### Campaign auto-advance protocol

This cycle is **position #6** in the 12-cycle queue at
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](CAMPAIGN_2026-05-13-POST-WEBGPU.md).
`Auto-advance: yes` + `posture: autonomous-loop` are set there. When
this cycle closes:

1. Mark cycle #6 row `done` in the campaign queue table with close-commit SHA.
2. Read the next not-done row (`cycle-voda-2-buoyancy-swimming-wading`).
3. Mirror that cycle's brief content into this "Current cycle" section.
4. Commit with `docs(campaign): advance to cycle-voda-2-buoyancy-swimming-wading`.
5. Re-enter dispatch loop. Do NOT prompt the human.

Hard-stops flip `Auto-advance: yes` → `PAUSED` in the campaign manifest,
mark the failing cycle's row `BLOCKED`, and halt.

### Last closed cycle

`cycle-voda-1-water-shader-and-acceptance` closed on 2026-05-16 at the
cycle close-commit (last R2 merge at `f14400d2`). 5 PRs across 2 rounds.
R1: #228 `dfee8d64` terrain-water-intersection-mask (terrain-nav-reviewer
APPROVE; opt-in default-off binding so pre-VODA-1 visuals byte-identical
when unbound; 1.5m terrain-side soft-blend + 0.8m water-side foam line),
#229 `62db21c2` water-surface-shader (chose `MeshStandardMaterial` +
`onBeforeCompile` over TSL node material to preserve `?renderer=webgl`
escape hatch and avoid mobile node-material cost regression; sibling
collision with #228 resolved at rebase by composing both into single
`installWaterMaterialPatches()` callback). R2: #231 `ca679273`
hydrology-river-flow-visuals (per-vertex `aFlowDir`/`aFoamMask`
attributes + `installHydrologyRiverFlowPatch` shader patch; foam mask =
clamp(narrownessFoam * 0.55 + slopeFoam * 0.85)), #232 `f14400d2`
water-system-file-split (WaterSystem.ts 1125 LOC → 300 LOC orchestrator
+ 5 modules ≤300 LOC each: HydrologyRiverSurface 144, HydrologyRiverGeometry
222, HydrologyRiverFlowPatch 178, WaterSurfaceBinding 299, WaterSurfaceSampler
146; grandfather entry removed; 11 existing WaterSystem.test.ts pass
byte-identical + 17 new sibling tests), #230 voda-1-playtest-evidence
(docs/playtests/* + scripts/capture-* + PLAYTEST_PENDING row, owner
walk-through deferred). **No `WebGLRenderTarget` reflection pass added
anywhere** (mobile no-RT win preserved per cycle hard-stop). VODA-1
promoted to code-complete in DIRECTIVES.md. `konveyer-large-file-splits`
water half closed. Carry-over count: 8 → 8.

Concurrent branch on the side: `task/mode-startup-terrain-spike` remains
parked at 1 commit (no PR). The cycle #2 mode-startup work absorbed
some of the synchronous-bake path concerns via the asset-audio-defer
+ mobile-skip-npc-prewarm tasks; the spike's terrain-bake-in-worker
hardening criteria still live in
[docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md](rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md).

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
