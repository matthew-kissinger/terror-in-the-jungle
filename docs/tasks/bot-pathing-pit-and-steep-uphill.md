# bot-pathing-pit-and-steep-uphill: fix over-pathing and pit traps in the harness bot

**Slug:** `bot-pathing-pit-and-steep-uphill`
**Priority:** P1 — real behavior gap the bot exhibits even on working maps.
**Playtest required:** YES (the bug is behavioral; needs eyeball confirmation that the bot climbs directly when it should and doesn't get stuck).
**Budget:** ≤ 300 LOC.
**Files touched:**
- `scripts/perf-active-driver.cjs` (re-plan decision; pit-escape heuristic)
- `src/dev/harness/playerBot/states.ts` (if the fix lives at the state-machine level; otherwise driver-only)
- Tests for both

## Symptoms (user playtest 2026-04-19)

1. **Over-pathing when objective is directly uphill.** When the next objective is a short straight line up a slope, the bot re-plans navmesh paths repeatedly and zigzags sideways instead of climbing directly. Suggests the re-plan cadence is too eager or the waypoint-advance logic is rejecting the "uphill" direction.
2. **Pit traps.** Bot descends into pit-geometry features and cannot path out. Combined with #1, the bot re-plans from inside the pit and the planner can't find an escape.

## Related context on master

- `perf-harness-verticality-and-sizing` (PR #94) exported `PLAYER_MAX_CLIMB_ANGLE_RAD = acos(0.7)` from `SlopePhysics.ts` and tightened the path-trust invariant so the driver trusts fresh navmesh paths. That helped open-field navigation but doesn't address pit-geometry or eager re-plans.
- The driver's path-trust TTL is 5000ms (PATH_TRUST_TTL_MS in `perf-active-driver.cjs`). Re-plan triggers are currently `sinceReplanMs > modeProfile.waypointReplanIntervalMs (default 5000)` OR `pathExhausted && sinceReplanMs > 750`. The 750ms fast-path may be firing too often in steep-climb geometry where waypoints advance slowly.
- The bot's fallback when `queryPath` returns null is Layer 2 gradient-probe (`chooseHeadingByGradient`) — this is the layer that zigzags on slopes.

## Hypothesis

**Over-pathing:** waypoints are being declared "advanced" because the bot is within 4m of the next waypoint (horizontal), but the waypoint is still several meters above vertically. The advance-to-next logic at `perf-active-driver.cjs:1864-1874` uses `Math.hypot(wpDx, wpDz)` (horizontal only). On steep uphill, this means the bot believes it's passed the waypoint before actually climbing to it, triggers path exhaustion, and re-plans.

**Pit traps:** navmesh likely has a pit floor as walkable, so `findNearestPoint` snaps the bot to the pit floor. `queryPath` from pit floor to anywhere outside succeeds as a navmesh query but the execution fails because the climb-out requires going over a slope the player physics rejects.

## Fix sketch

1. **Advance waypoint on 3D proximity, not just 2D horizontal.** Change line 1870 to use `Math.hypot(wpDx, wpDy, wpDz) > 4` or include a vertical tolerance. Or increase the horizontal tolerance on steep grades.
2. **Detect and escape pits.** If the bot is stuck (stuckMs > 3000) AND the current nav path goes "up and out" (vertical delta > 3m over the next N waypoints), trigger the stuck-recovery teleport earlier — don't wait for the 5000ms path-trust window.
3. **Dampen re-plan cadence on steep climbs.** If `forward-grade > 0.3` (computed same way player physics does it), raise `waypointReplanIntervalMs` to 10000 for the steep segment. The path doesn't change; the planner shouldn't re-run.

All three are small driver-side tweaks. None touch player physics, navmesh generation, or combat AI.

## Exit criteria

- Live playtest: bot climbs a straight uphill-to-objective without zigzagging. Recorded observation in PR description.
- Live playtest: bot does not get permanently stuck in a map pit; either escapes via path OR triggers teleport within 4-5s.
- openfrontier:short `waypointReplanFailures` unchanged or lower than PR #96's value.
- `stuck_seconds` average ≤ current value.
- Lint / test:run / build green.

## Non-goals

- Do not rework navmesh generation or navmesh-bake slope parameters.
- Do not change player physics.
- Do not expand the bot's state machine.
- Do not "teach" the bot about map geometry; fixes are generic to any terrain.

## Hard stops

- Fence change → STOP (not expected).
- Fix requires editing the navmesh baker → STOP; propose a separate task.
- Fix doesn't improve the pit symptom in live playtest → STOP; the root cause may be in the terrain-aware solver, not the harness.
