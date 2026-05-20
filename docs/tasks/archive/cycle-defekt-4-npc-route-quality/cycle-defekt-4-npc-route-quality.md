# Cycle: DEFEKT-4 NPC Route Quality

Last verified: 2026-05-16

## Status

Queued at position #11 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
Closes `DEFEKT-4` (NPC route-follow quality: slope-stuck, navmesh
crowd disabled, terrain solver stalls). Active carry-over since
cycle-2026-04-17.

## Skip-confirm: yes

Campaign auto-advance.

## Concurrency cap: 3

R1 ships slope-stuck fix + navmesh crowd re-enable; R2 ships
terrain-solver stall fix.

## Objective

Close the three threads behind DEFEKT-4:

1. **Slope-stuck:** NPCs get pinned on inclines past the
   slope-stall threshold, can't recover.
2. **Navmesh crowd disabled:** the Recast crowd surface is wired but
   disabled because of a prior regression; this cycle re-enables
   and validates.
3. **Terrain-aware solver stall loops:** the slope-aware movement
   solver has stall-loop modes that cause perceptible
   stop-and-go on rough terrain.

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. [docs/CARRY_OVERS.md](../CARRY_OVERS.md) DEFEKT-4 row.
2. [docs/MOVEMENT_NAV_CHECKIN.md](../MOVEMENT_NAV_CHECKIN.md) — the
   movement/navigation workstream tracker.
3. `src/systems/navigation/NavmeshSystem.ts` — primary file.
4. `src/systems/combat/CombatantMovement.ts` (or
   `src/systems/navigation/` equivalent) — NPC route-follow.
5. `src/systems/navigation/terrain-aware-solver.ts` (or similar
   name) — slope solver.
6. `docs/blocks/navigation.md` (if exists) — subsystem doc.
7. `src/systems/combat/StuckDetector.ts` (closed cycle-2026-05-08;
   verify the state-exit hook still fires correctly per
   `memory/project_perception_and_stuck_2026-05-08.md`).

## Critical Process Notes

1. **`terrain-nav-reviewer` is pre-merge gate** for all tasks
   (every touched file is under `src/systems/navigation/**`).
2. **No fence change.** `INavmesh` consumer surface is fenced.
3. **No deterministic regression.** Existing seeded movement
   scenarios must produce the same output (or differences
   explicitly documented).

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `npc-slope-stuck-recovery`, `navmesh-crowd-reenable` | 2 | Independent. |
| 2 | `terrain-solver-stall-fix` | 1 | After R1 — needs the re-enabled crowd to validate against. |

## Task Scope

### npc-slope-stuck-recovery (R1)

NPCs pinned on inclines past slope-stall threshold can recover
(reverse, re-route, or yield to gravity slide).

**Files touched:**
- `src/systems/combat/CombatantMovement.ts` (or
  navigation/movement equivalent).
- New sibling test.

**Method:**
1. When NPC speed has been below epsilon for > 1.5 s while on a
   slope > stall threshold: trigger recovery state.
2. Recovery state: yield to gravity slide downhill until on
   walkable slope, then re-acquire pathing target.
3. Behavior test: NPC placed on steep slope, observe recovery
   transition within budget.
4. Commit message: `fix(navigation): NPC slope-stuck recovery state (npc-slope-stuck-recovery)`.

**Acceptance:**
- Tests + build green.
- `terrain-nav-reviewer` APPROVE.

**Reviewer gate: `terrain-nav-reviewer` required pre-merge.**

### navmesh-crowd-reenable (R1)

Re-enable Recast crowd surface; validate against the prior
regression that disabled it.

**Files touched:**
- `src/systems/navigation/NavmeshSystem.ts` — flip the crowd-enable
  flag (search for the existing disable site).
- New sibling test verifying crowd-enabled behavior.

**Method:**
1. Find the previous disable site (likely a comment + boolean flag
   in `NavmeshSystem.ts` or `NavmeshConfig.ts`).
2. Re-read the regression note (probably in
   `docs/MOVEMENT_NAV_CHECKIN.md` or
   `docs/CARRY_OVERS.md` — there should be a one-line cause).
3. Re-enable. Validate that the regression doesn't reappear via a
   scenario test.
4. Verify performance: crowd-enabled adds ≤2 ms to `combat120`
   nav step.
5. Commit message: `feat(navigation): re-enable Recast crowd surface (navmesh-crowd-reenable)`.

**Acceptance:**
- Tests + build green.
- `terrain-nav-reviewer` APPROVE.
- Scenario test catches the prior regression if disable is
  re-applied.
- Perf budget: ≤2 ms additional per nav step.

**Reviewer gate: `terrain-nav-reviewer` required pre-merge.**

### terrain-solver-stall-fix (R2)

The slope-aware solver has stall-loop modes; fix the loop modes
that cause perceptible stop-and-go on rough terrain.

**Files touched:**
- `src/systems/navigation/terrain-aware-solver.ts` (or equivalent
  per code grep).
- New sibling test.

**Method:**
1. Run a movement-replay scenario across A Shau valley (rough
   terrain). Identify the stall-loop pattern (likely a
   reachability-check that fires repeatedly without progress).
2. Fix the loop: either a small `lastProgressPosition` check that
   triggers re-route when no progress, or a different ordering of
   the slope vs. distance checks.
3. Behavior test: NPC moves across rough terrain without stall
   loops.
4. Commit message: `fix(navigation): terrain-solver stall-loop modes (terrain-solver-stall-fix)`.

**Acceptance:**
- Tests + build green.
- `terrain-nav-reviewer` APPROVE.
- Scenario test: NPC traverses A Shau valley without
  stop-and-go.

**Reviewer gate: `terrain-nav-reviewer` required pre-merge.**

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- `navmesh-crowd-reenable` reproduces the prior regression → halt.
- Perf regression > 5% p99 on `combat120` from any task → halt.
- Determinism regression → halt.

## Reviewer Policy

- `terrain-nav-reviewer` pre-merge gate for all tasks.

## Acceptance Criteria (cycle close)

- All R1 + R2 task PRs merged.
- DEFEKT-4 visibly closed: NPCs no longer pin on slopes, navmesh
  crowd re-enabled and validated, no stall loops on A Shau
  traversal.
- No fence change.
- No perf regression > 5% p99 on `combat120`.
- `DEFEKT-4` row in `docs/CARRY_OVERS.md` moves from Active to
  Closed.

## Out of Scope

- Major navmesh refactor (NavmeshSystem split / Phase 3 R5) —
  separate cycle if needed.
- AI behavior changes beyond movement (target selection, etc.).
- Touching `src/systems/combat/**` (only the movement consumer
  surface, gated by reviewer).
- Fenced-interface touches.

## Carry-over impact

| Action | When | Active count |
|--------|------|--------------:|
| Close DEFEKT-4 | cycle close | (prior count) − 1 |

Net cycle delta: −1.
