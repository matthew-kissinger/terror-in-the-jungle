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

## Current cycle: `cycle-2026-04-21-atmosphere-polish-and-fixes` *(draft — confirm at kickoff)*

### Cycle ID

`cycle-2026-04-21-atmosphere-polish-and-fixes`

### Why this cycle exists

`cycle-2026-04-20-atmosphere-foundation` shipped the sky/sun/fog stack but exposed a tail of visual + content + harness issues that were either pre-existing or surfaced by the new analytic sky:

- Post-process clips warm hues to white (no tone-mapping); fog reads too white at distance; vegetation has alpha-edge fringes; vegetation responds to lighting differently than terrain.
- Ashau DEM not loading (terrain renders flat); ashau bot loops between captured zones.
- NPCs and harness player visibly leap into the air.
- Aircraft systemic regressions (multi-cycle): A-1 missing on runway, all aircraft only take off via hill-launch, runway has bumps, taxi orientations off, foundations over cliffs.
- User wants day/night cycle + clouds (with helicopter flight envelope clearance).
- User wants legacy fallbacks deleted (Skybox.ts / NullSkyBackend / skybox.png).
- `perf-baseline-refresh` carries forward (deferred from prior cycle).

This cycle is the polish + fix pass that makes the atmosphere foundation actually look right and gets the airfield/flight content working.

### Tasks in this cycle

Atmosphere polish (visual completion of the prior cycle):

- **`post-tone-mapping-aces`** (P0) — ACES tone-map before quantize. Brief: `docs/tasks/post-tone-mapping-aces.md`.
- **`fog-density-rebalance`** (P1) — distant terrain reads white; rebalance per-scenario fog density. Brief: `docs/tasks/fog-density-rebalance.md`.
- **`vegetation-alpha-edge-fix`** (P1) — white/blue alpha-fringe on vegetation. Brief: `docs/tasks/vegetation-alpha-edge-fix.md`.
- **`vegetation-fog-and-lighting-parity`** (P1) — vegetation reacts differently to fog/lighting than terrain. Brief: `docs/tasks/vegetation-fog-and-lighting-parity.md`.
- **`atmosphere-day-night-cycle`** (P1) — animate sun direction over time. Brief: `docs/tasks/atmosphere-day-night-cycle.md`.
- **`skybox-cutover-no-fallbacks`** (P1) — delete legacy Skybox.ts / NullSkyBackend / skybox.png. Brief: `docs/tasks/skybox-cutover-no-fallbacks.md`.
- **`cloud-runtime-implementation`** (P2) — implement ICloudRuntime stub with high-altitude cloud band (helicopter-aware). Brief: `docs/tasks/cloud-runtime-implementation.md`.

Aircraft / airfield foundation (multi-system fix):

- **`airfield-terrain-flattening`** (P0) — flatten airfield footprint properly; reject cliff-edge candidate sites. Brief: `docs/tasks/airfield-terrain-flattening.md`.
- **`airfield-aircraft-orientation`** (P1) — parking yaws must align with taxi-route entry. Brief: `docs/tasks/airfield-aircraft-orientation.md`.
- **`aircraft-ground-physics-tuning`** (P0) — fix takeoff porpoising / bouncing on ground-clamp oscillation in `Airframe.ts:522-540` post-liftoff fallback. Brief: `docs/tasks/aircraft-ground-physics-tuning.md`. *(Repurposed 2026-04-20 after recon — original "throttle/lift/friction tuning" hypothesis was wrong; root cause is airborne ground-clamp.)*
- **`aircraft-a1-spawn-regression`** (P1) — keep A-1 Skyraider parked at main_airbase by removing its NPC ferry mission. Brief: `docs/tasks/aircraft-a1-spawn-regression.md`. *(Repurposed 2026-04-20 — A-1 isn't missing; it auto-ferries off at boot.)*
- **`aircraft-simulation-culling`** (P2) — skip `airframe.step()` for unpiloted, off-screen aircraft beyond render-cull distance; no LOD mesh. Brief: `docs/tasks/aircraft-simulation-culling.md`.

Content + harness fixes:

- **`ashau-dem-streaming-fix`** (P0) — A Shau Valley DEM file present but loader fails. Brief: `docs/tasks/ashau-dem-streaming-fix.md`.
- **`harness-ashau-objective-cycling-fix`** (P1) — bot loops between captured zone and itself. Brief: `docs/tasks/harness-ashau-objective-cycling-fix.md`.
- **`npc-and-player-leap-fix`** (P0) — NPCs + harness player visibly leap into the air. Brief: `docs/tasks/npc-and-player-leap-fix.md`.

Carry-forward:

- **`perf-baseline-refresh`** (P0) — rebaseline all 4 scenarios after the above land. Brief: `docs/tasks/perf-baseline-refresh.md`.

### Round schedule

15 tasks across 5 rounds, 5-parallel cap.

- **Round 1 (5 parallel — independent):**
  - `post-tone-mapping-aces`
  - `vegetation-alpha-edge-fix`
  - `skybox-cutover-no-fallbacks`
  - `ashau-dem-streaming-fix`
  - `aircraft-a1-spawn-regression` *(repurposed; small config-only diff)*
- **Round 2 (5 parallel — fan out from Round 1):**
  - `fog-density-rebalance` (after `post-tone-mapping-aces`)
  - `vegetation-fog-and-lighting-parity` (after `post-tone-mapping-aces`)
  - `airfield-terrain-flattening`
  - `npc-and-player-leap-fix`
  - `atmosphere-day-night-cycle`
- **Round 3 (4 parallel):**
  - `airfield-aircraft-orientation` (after `airfield-terrain-flattening`)
  - `harness-ashau-objective-cycling-fix` (after `ashau-dem-streaming-fix`)
  - `cloud-runtime-implementation` (after `post-tone-mapping-aces` + `fog-density-rebalance` + `atmosphere-day-night-cycle` — needs live sun direction)
  - `aircraft-simulation-culling` *(independent; new task added 2026-04-20)*
- **Round 4 (1):**
  - `aircraft-ground-physics-tuning` (after `airfield-terrain-flattening` so testable on a real flat runway)
- **Round 5 (1):**
  - `perf-baseline-refresh` (after `harness-ashau-objective-cycling-fix` + `npc-and-player-leap-fix` so baselines are stable)

### Concurrency cap

Default 5. No override.

### Dependencies

```
post-tone-mapping-aces                (blocks: fog-density-rebalance, vegetation-fog-and-lighting-parity, cloud-runtime-implementation)
fog-density-rebalance                 (blocked by: post-tone-mapping-aces; blocks: cloud-runtime-implementation)
vegetation-alpha-edge-fix             (independent)
vegetation-fog-and-lighting-parity    (blocked by: post-tone-mapping-aces)
atmosphere-day-night-cycle            (blocks: cloud-runtime-implementation — must merge first so cloud reads live sun direction)
skybox-cutover-no-fallbacks           (independent)
cloud-runtime-implementation          (blocked by: post-tone-mapping-aces, fog-density-rebalance, atmosphere-day-night-cycle)
airfield-terrain-flattening           (blocks: airfield-aircraft-orientation, aircraft-ground-physics-tuning)
airfield-aircraft-orientation         (blocked by: airfield-terrain-flattening)
aircraft-ground-physics-tuning        (blocked by: airfield-terrain-flattening) [repurposed: takeoff bounce fix]
aircraft-a1-spawn-regression          (independent) [repurposed: keep A-1 parked]
aircraft-simulation-culling           (independent) [NEW 2026-04-20]
ashau-dem-streaming-fix               (blocks: harness-ashau-objective-cycling-fix)
harness-ashau-objective-cycling-fix   (blocked by: ashau-dem-streaming-fix; blocks: perf-baseline-refresh)
npc-and-player-leap-fix               (blocks: perf-baseline-refresh)
perf-baseline-refresh                 (blocked by: harness-ashau-objective-cycling-fix, npc-and-player-leap-fix)
```

### Playtest policy

- `post-tone-mapping-aces`, `fog-density-rebalance`, `vegetation-alpha-edge-fix`, `vegetation-fog-and-lighting-parity`, `atmosphere-day-night-cycle`, `cloud-runtime-implementation`: **required** (visual observables).
- `airfield-*`, `aircraft-*`, `ashau-dem-streaming-fix`, `harness-ashau-objective-cycling-fix`, `npc-and-player-leap-fix`: **required** (behavioral).
- `skybox-cutover-no-fallbacks`: required (visual smoke that all 5 scenarios still boot to a sky).
- `perf-baseline-refresh`: not required (measurement only).

### Perf policy

- `combat120` smoke on every PR before merge.
- After Round 4 merges, `perf-baseline-refresh` produces fresh baselines reflecting the cycle end-state. Don't loosen thresholds.
- `cloud-runtime-implementation` perf-watch: cloud render must stay within `World` group budget.
- `aircraft-ground-physics-tuning` perf-watch: airframe physics changes shouldn't move combat120 (no aircraft active in that scenario).

### Failure handling

- Fence-change escalation per `docs/INTERFACE_FENCE.md`. None expected this cycle.
- `airfield-terrain-flattening` slope-rejection rejects 100% of candidates → STOP, lower threshold.
- Sun-below-horizon math (day-night) produces NaN → clamp.
- Cloud layer intersects helicopter envelope → raise cloud base.
- `post-tone-mapping-aces` makes the retro look softer → STOP, reconsider curve.

### Visual checkpoints (orchestrator-gated)

Same screenshot-gate flow as cycle-2026-04-20: per-task PNGs in `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/<slug>/`; orchestrator reviews via Read tool before merge.

Combo captures by orchestrator into `_orchestrator/<checkpoint>/`:

- **Pre-cycle:** capture all 5 scenarios at the cycle-2026-04-20 ship-gate framings as the baseline (in fact reuse `cycle-2026-04-20-atmosphere-foundation/screenshots/_orchestrator/after-round-3/`).
- **After Round 1:** confirm tone-map fixes warm hues, alpha-edge fringe gone, ashau DEM loads.
- **After Round 2:** confirm fog density tuned, vegetation parity, airfield flat, no leaps, day-night cycle visible.
- **After Round 3:** confirm taxi orientation, ashau bot mobile, clouds rendering at flight envelope.
- **After Round 4:** aircraft takeoff from flat runway demonstrably working.
- **After Round 5:** perf-baselines refreshed.

### Cycle-specific notes

- User explicitly noted aircraft + helicopter content → cloud-runtime-implementation must keep cloud base above helicopter cruise altitude.
- User explicitly asked for "no fallbacks if possible" → `skybox-cutover-no-fallbacks` is the cycle's commitment to that.
- Recommendation: deploy current master to prod (`gh workflow run deploy.yml`) BEFORE running the overnight cycle so user observations are against the same code the executors will be building from.

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
