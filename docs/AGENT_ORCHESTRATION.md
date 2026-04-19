# Agent Orchestration — Runbook

Last updated: 2026-04-18

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

## Current cycle: harness + flight cleanup + combat expansion

### Cycle ID

`cycle-2026-04-18-harness-flight-combat`

### Why this cycle exists

Three independent strands converged on the same cycle:

1. **Harness debt.** The 2026-04-18 cycle closed with the perf-active-driver reverted after A4's rewrite introduced a direction-inversion bug. This cycle's first Round 1 attempt (`perf-harness-architecture`, PR #88) tried to replace the imperative driver with a declarative scenario/policy/validator architecture — merged on CI green, but live playtest revealed the policy didn't drive the player toward enemies, NPCs moved slowly, the player shot through terrain, and combat120 captures recorded 0 shots over 90s. PR #89 reverted #88. The replacement task `perf-harness-redesign` keeps the restored imperative driver and adds surgical improvements (LOS-aware fire gate, fail-loud validators, A4-regression guard).
2. **Flight debt.** B1 shipped the unified `Airframe` module but kept `FixedWingPhysics.ts` as a 422-LOC compat shim. `b1-flight-cutover` deletes it and fans the 5 remaining callers through to direct `Airframe` usage. `npc-fixed-wing-pilot-ai` is the first live NPC consumer of the post-cutover API — concrete validation that the primitive is good.
3. **Combat growth.** C1 shipped a VC-only utility canary; `utility-ai-doctrine-expansion` flips all four factions to utility-AI with response curves and new action families, closes the `RETREATING` orphan state, and makes faction differentiation observable. `heap-regression-investigation` and `perf-baseline-refresh` keep the perf signal trustworthy across the expansion.

### Tasks in this cycle

All briefs under `docs/tasks/` with matching slug names.

- **`perf-harness-redesign`** — surgically upgrade the restored imperative `scripts/perf-active-driver.js` with (a) LOS-aware fire gate so the harness doesn't shoot through terrain, (b) fail-loud validators that treat `validation.overall = 'fail'` as capture failure, (c) an A4-class regression guard (sign-flipped aim → no fire), (d) verified per-mode action levels (shots/hits/transitions > threshold in all 5 mode profiles). No new declarative module; keeps the imperative driver. Supersedes the reverted `perf-harness-architecture` (PR #88 merged + reverted by PR #89 in this cycle).
- **`b1-flight-cutover`** — *(merged in Round 1, PR #86.)* Deleted `FixedWingPhysics.ts` shim; wired 5 callers (FixedWingModel, NPCFlightController, flightTestScene, integration tests) directly to `Airframe`.
- **`utility-ai-doctrine-expansion`** — *(merged in Round 1, PR #87.)* Expanded `FactionCombatTuning` with response curves, action-weight multipliers, morale decay. Flipped all 4 factions to utility-AI. Added `repositionAction` + `holdAction`. Closed `RETREATING` orphan state with minimal `AIStateRetreat`.
- **`heap-regression-investigation`** — bisect the +296% combat120 heap growth from the 2026-04-18 cycle. Likely suspects: `ReplayRecorder` buffering without session gate; per-tick utility-context allocation. Fix + rearch memo. Uses the redesigned harness for clean repro.
- **`npc-fixed-wing-pilot-ai`** — author `NPCFixedWingPilot` (state machine + PD control loops) that emits `FixedWingPilotIntent` against the post-cutover `Airframe`. One NPC aircraft spawns in at least one game mode with a mission (takeoff → waypoint → RTB → landing).
- **`perf-baseline-refresh`** — recapture `combat120`, `openfrontier:short`, `ashau:short`, `frontier30m` on the redesigned harness after the heap fix. Rewrite `perf-baselines.json` with realistic thresholds; stale p99=100ms → measured ~30ms. *(Round 3 attempt 2026-04-19 stopped at hard stop #1 on openfrontier — `waypointsFollowed=0 / waypointReplanFailures=202`, p99 = 63ms > 60ms validator floor. Root cause: `NavmeshSystem.queryPath` returns null on every driver re-plan on open_frontier. Spawned Round 4 `perf-openfrontier-navmesh-fix`.)*
- **`perf-openfrontier-navmesh-fix`** — ABANDONED pre-merge (2026-04-19). Dispatched as Round 4, killed mid-investigation after live playtest revealed the deeper issue: even with a working navmesh query the driver doesn't simulate gameplay (no states, no objectives, shoots through terrain because it reinvents LOS). Brief retained in git for context.
- **`perf-harness-player-bot`** — *(merged in Round 4, PR #95.)* Built `PlayerBotStateMachine` + `PlayerBotIntent` + controller shim mirroring `NPCFixedWingPilot`. Consumes `terrainSystem.raycastTerrain`, `NavmeshSystem.queryPath` + `findNearestPoint`. 7 states: PATROL/ALERT/ENGAGE/ADVANCE/SEEK_COVER/RETREAT/RESPAWN_WAIT. Live playtest post-merge revealed the state machine inherited NPC *cautiousness* (retreat-on-damage, back-off-when-close) and the bot never actually fired in engagements — conflating "reference NPC primitives" with "adopt NPC behavior." Followed up by `perf-harness-player-bot-aggressive`.
- **`perf-harness-player-bot-aggressive`** — ABANDONED pre-merge (2026-04-19). Dispatched as Round 6, killed because user playtest revealed the bot was firing 243 shots / 0 hits — aim is mechanically broken, deeper than just defensive-state behavior. Consolidated into `perf-harness-player-bot-aim-fix`.
- **`perf-harness-player-bot-aim-fix`** — Round 7, replaces Round 6. Root cause: PR #95's `yawToward` uses `atan2(dx, -dz)` with a comment claiming `forward = (sin(yaw), 0, -cos(yaw))` — but THREE.js convention is `forward = (-sin(yaw), 0, -cos(yaw))`, so the bot points the camera 180° mirrored (camera faces west when target is east). Old killbot sidestepped this by using `camera.lookAt()`. Fix: switch to lookAt pattern, wire the dormant `evaluateFireDecision` aim-dot gate, strip SEEK_COVER + RETREAT (Round 6 work), raise LOS height 1.2 → 1.7. Mandatory combat120 smoke capture with `hits > 20` before PR opens. 400 LOC budget; playtest-gated.

### Round schedule

- **Round 1 (3 parallel) — LANDED.** `perf-harness-architecture` ✗ reverted (PR #88 → PR #89), `b1-flight-cutover` ✓ merged (PR #86), `utility-ai-doctrine-expansion` ✓ merged (PR #87).
- **Round 1b (1, solo) — ACTIVE.** `perf-harness-redesign`. Blocks Round 2's `heap-regression-investigation` and Round 3's `perf-baseline-refresh`. Solo so its playtest (the task's key acceptance signal) gets full attention.
- **Round 2 (2 parallel):** `heap-regression-investigation`, `npc-fixed-wing-pilot-ai`. Heap investigation uses the redesigned harness for clean repro. NPC pilot wants the post-cutover `Airframe` surface (already on master).
- **Round 3 (1) — ATTEMPTED, STOPPED.** `perf-baseline-refresh`. Rebaseline on the redesigned harness with the heap fix in place. Hit hard stop on openfrontier:short validator fail (p99 63ms > 60ms floor). Will retry after Round 4.
- **Round 4 — ABANDONED.** `perf-openfrontier-navmesh-fix` dispatched, killed mid-investigation after live playtest revealed the killbot driver's shallow behavior was a deeper issue than navmesh alone.
- **Round 4 (replacement, 1 solo) — LANDED.** `perf-harness-player-bot` (PR #95). State-machine bot consuming NPC primitives. Merged, but post-merge playtest exposed a behavioral regression (bot retreats, never fires) that required Round 6.
- **Round 5 — ABANDONED.** `perf-baseline-refresh` retry dispatched but killed ~immediately; captures off a retreating bot would be worse than useless.
- **Round 6 — ABANDONED.** `perf-harness-player-bot-aggressive` dispatched, killed mid-run. Executor's own combat120 smoke reported `shots=243 / hits=0` — aim is structurally broken (not just defensive-states). Consolidated into Round 7.
- **Round 7 (1, solo) — ACTIVE.** `perf-harness-player-bot-aim-fix`. Switch aim path from hand-rolled `atan2` math to `camera.lookAt()` (the pattern used by every other camera consumer in the repo). Wire dormant `evaluateFireDecision` aim-dot gate. Strip SEEK_COVER + RETREAT. Hard merge gate: combat120 smoke `hits > 20`.
- **Round 8 (1):** `perf-baseline-refresh` third retry. Cycle closer.

### Concurrency cap

3 parallel executors (override of the default 5). Rationale: harness rebuild and flight cutover are both large-ish; keeping the round narrow reduces merge-queue thrash and makes CI red easier to triage.

### Dependencies

`addBlockedBy` by slug:

- `perf-harness-redesign` — no blockers (Round 1b).
- `b1-flight-cutover` — no blockers. *(merged.)*
- `utility-ai-doctrine-expansion` — no blockers. *(merged.)*
- `heap-regression-investigation` — blocked by `perf-harness-redesign` (clean combat-exercising repro surface).
- `npc-fixed-wing-pilot-ai` — blocked by `b1-flight-cutover` (consumes direct Airframe API). *(unblocked; ready for Round 2.)*
- `perf-baseline-refresh` — blocked by `perf-harness-redesign` AND `heap-regression-investigation` AND `perf-harness-player-bot` *(Round 4 replacement; killbot-architectural pivot)*.
- `perf-openfrontier-navmesh-fix` — ABANDONED. Superseded by `perf-harness-player-bot`.
- `perf-harness-player-bot` — no blockers (builds on all merged Round 1-3 harness work).

### Playtest policy

- `perf-harness-redesign` — yes (harness IS a playtest surface; live combat120 capture must show player engaging, not looking at ground or bouncing).
- `b1-flight-cutover` — yes (flight feel must be identical pre/post). *(Merged; post-merge playtest recommended.)*
- `utility-ai-doctrine-expansion` — yes (faction differentiation observable or the task is a dud). *(Merged; post-merge playtest recommended.)*
- `heap-regression-investigation` — no (infra / debugging).
- `npc-fixed-wing-pilot-ai` — yes (observable: NPC aircraft takes off, flies, lands).
- `perf-baseline-refresh` — no (measurement).

Playtest-required PRs still merge on CI green per cycle-lifecycle policy. Flag them under "Playtest recommended" in end-of-run summary; human runs the checklist after the cycle lands. **Exception this cycle:** `perf-harness-redesign` merges only after a human playtest confirms the player is visibly engaging in combat120 — the reverted PR #88 would have been caught earlier if this gate had been in place.

### Perf policy

- After Round 1: full perf diff (`combat120`). Result from landed Round 1 (post-revert): avg ~15ms, distribution p99 ~34ms — flat vs pre-rebuild. No frame-time regression; cycle unblocked for Round 1b.
- After Round 1b: confirm `validation.overall = 'pass'` on combat120 with `shots_fired > 50`, `hits > 5`. This is the gate that failed post-#88 and drove the revert.
- After Round 2: `combat120` diff again. Expect heap growth to drop (`heap-regression-investigation`) — if it doesn't, the fix didn't land.
- End-of-cycle: `perf-baseline-refresh` IS the perf action. It writes the new baselines as its PR content.
- Do not run `perf:update-baseline` in Round 1, 1b, or 2. Only Round 3 updates baselines.

### Failure handling

- Any fence-change proposal → stop that task, surface to human.
- Any CI red the executor can't resolve in-scope → stop that task, do not auto-retry, move to next round.
- If Round 1 returns ≥ 2 tasks blocked or failed → stop the cycle. The round's premise is wrong. *(R1 met this bar with 0 blocked tasks; the harness issue surfaced post-merge at the perf gate.)*
- If `perf-harness-redesign` playtest shows the player still looking-at-ground / bouncing / shooting-through-terrain → mark blocked, do not merge on CI green alone. This is a case where merged-but-broken is worse than unmerged — the cost of another merge-and-revert is higher than the cost of waiting.
- If `heap-regression-investigation` dead-ends (no commit clearly flagged) → mark blocked, proceed to Round 3 with the stale-but-unchanged baseline flag recorded in the end-of-run summary.
- If `npc-fixed-wing-pilot-ai` playtest shows the NPC aircraft augers in consistently → mark blocked, do not merge on CI green alone.
- Playtest-recommended tasks (other than `perf-harness-redesign` and `npc-fixed-wing-pilot-ai`): merge on CI green; human playtest is post-merge checklist, not a merge gate.

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
