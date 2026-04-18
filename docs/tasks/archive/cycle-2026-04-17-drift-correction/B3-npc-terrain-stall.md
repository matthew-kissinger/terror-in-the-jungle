# Task B3: NPC terrain stall loop mitigation

**Phase:** B (parallel)
**Depends on:** Foundation
**Blocks:** D1
**Playtest required:** yes (affects observable NPC behavior)
**Estimated risk:** medium
**Files touched:** `src/systems/combat/CombatantMovement.ts`, `src/systems/combat/StuckDetector.ts` (if present), matching tests

## Problem

Per `docs/BACKLOG.md`: *"NPC movement: getting stuck on slopes, navmesh crowd disabled, terrain-aware solver has stall loops."* Perf logs from combat120 and Open Frontier show frequent warnings like:

```
[combat] NPC combatant_179 stalled on terrain, backtracking to last good progress point
```

Observable symptom: NPCs visibly freeze on slopes or bounce between two points, cannot reach objectives or engage.

## Goal

Eliminate or drastically reduce the terrain-stall loop. NPCs that encounter a slope they can't climb should find an alternate path or fail gracefully (e.g. give up the objective and reroute) instead of oscillating.

## Required reading first

- `docs/TESTING.md`, `docs/INTERFACE_FENCE.md`.
- `src/systems/combat/CombatantMovement.ts` (main movement solver).
- `src/systems/combat/StuckDetector.ts` (if exists) — the current mitigation uses a 4-attempt cap + 15s hold cooldown per memory notes.
- Nav system interaction: `src/systems/navigation/**/*.ts`.

## Suggested investigation

1. What condition triggers "stalled on terrain"? (slope too steep? target position unreachable? navmesh hole?)
2. How does the backtrack point get selected? Is it sometimes the same as the unreachable target, causing immediate re-stall?
3. Does the NPC ever query the navmesh for an alternate path after stalling? Or does it just retry the same route?
4. Is there a case where the navmesh says "walkable" but the terrain-aware solver says "too steep"? Mismatch between data sources.

## Proposed fix shape (implementer should validate before implementing)

Possible angles, implementer picks one or combines:

- **Re-query navmesh after stall:** on stall, mark the current target as unreachable for this NPC and query nav for a different path.
- **Escalate to abandon:** after N stalls on the same objective, the NPC abandons the objective and defaults to defend/hold nearest valid cover.
- **Slope-pre-check:** before committing to a path, sample slope along path; if any segment exceeds walkable threshold, reject the path at plan time.
- **Capped retry with decay:** log-weighted backoff on backtrack attempts, eventual terminal state "held position, observing."

Keep the fix scoped. Don't rewrite the movement solver wholesale.

## Verification

- `npm run lint`, `npm run test:run`, `npm run build` green.
- Behavior test: an NPC given an unreachable objective does not oscillate — it either reroutes or transitions to a hold state within a bounded number of ticks.
- Perf capture: run `npm run perf:capture:combat120` and `npm run perf:capture:openfrontier:short`. Stall warning count per capture should drop significantly (report before/after).
- **Playtest:** observe NPC behavior on sloped terrain (hills near objectives). NPCs should not visibly freeze or bounce.

## Non-goals

- Do not rewrite navigation. Work within existing nav surface.
- Do not touch navmesh prebake.
- Do not change fenced interfaces.
- Do not expand scope to crowd management (navmesh crowd is disabled; leave it).

## Exit criteria

- Stall warning rate reduced by at least 60% in a standard perf capture.
- NPC observable behavior improved (per playtest).
- PR titled `fix(combat): reduce NPC terrain-stall oscillation (B3)`.
- PR body includes before/after stall rate and a playtest note.
- Flagged **playtest-pending**.
