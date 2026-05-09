# Task: navmesh-system-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-15-telemetry-warsim-navmesh-split` (R1)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/navigation/NavmeshSystem.ts` (789 LOC) into 3 helpers.

## Files touched

- New: `src/systems/navigation/NavmeshLoader.ts` — load + bake invalidation (≤300 LOC)
- New: `src/systems/navigation/NavmeshQuery.ts` — pathfinding queries (≤300 LOC)
- New: `src/systems/navigation/NavmeshMovementAdapter.ts` (may already exist — refactor if so) — NPC-driver adapter (≤300 LOC)
- Each + `*.test.ts`
- Modified: `NavmeshSystem.ts` — orchestrator ≤300 LOC
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template. **DEFEKT-4** (NPC route quality, navmesh crowd disabled, terrain
solver stalls) is the open carry-over. This split SHOULD make DEFEKT-4 easier
to fix later but does NOT fix it here. Verify via playtest that NPC routing
behavior is unchanged.

## Reviewer: terrain-nav-reviewer pre-merge
## Playtest required: yes (A Shau Valley NPC routing)

## Branch + PR

- Branch: `task/navmesh-system-split`
- Commit: `refactor(navigation): split NavmeshSystem into 3 helpers (navmesh-system-split)`
