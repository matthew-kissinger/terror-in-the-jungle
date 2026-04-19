# perf-harness-redesign: terrain-aware pathing, LOS-gated fire, fail-loud validators

**Slug:** `perf-harness-redesign`
**Cycle:** `cycle-2026-04-18-harness-flight-combat`
**Depends on:** nothing in this cycle (AgentController, SeededRandom, ReplayRecorder stay on master but are NOT consumed by this task — see "Non-goals")
**Blocks (in this cycle):** `heap-regression-investigation` (wants a capture surface that actually exercises combat), `perf-baseline-refresh` (rebaseline must use the fixed harness)
**Playtest required:** yes — **merge-gated on playtest**, not the usual post-merge checklist. The reverted PR #88 would have been caught if this gate had been in place.
**Estimated risk:** medium — the terrain-navigation work is a new layer; the surrounding changes are surgical
**Files touched:** `scripts/perf-active-driver.js` (primary edits), `scripts/perf-capture.ts` (validator wiring, optional seed query param plumbing), possibly `src/config/MapSeedRegistry.ts` (adding an AI_SANDBOX harness-test variant) or a URL-param seed override, new tests under `scripts/perf-harness/` or inline.

## Why this task exists

The declarative `src/dev/harness/` approach from PR #88 (`perf-harness-architecture`) was reverted in PR #89 after a live playtest revealed:

1. The `engage-nearest-hostile` policy did not drive the player toward enemies — player stared at the ground, turned slightly, bounced back and forth.
2. NPCs moved very slowly under the harness scenario.
3. The player fired through terrain at enemies with no LOS gating.
4. combat120 capture produced `shots_fired=0`, `hits=0` over a full 90s with 120 NPCs. The new harness's own validators correctly marked the run FAIL, which is how the break surfaced.

Post-revert observation from the user: combat120 runs on procedural `ai_sandbox` terrain that is **frequently a steep hill**. The restored imperative driver issues raw WASD keys based on direction-to-target. On flat ground that works. On a steep slope it fails three ways:

1. `W` toward the hill face doesn't climb (player physics blocks ascent or forces a sideways slide).
2. The A/D "juke" logic picks perpendicular strafes that oscillate along the contour line — left/right, left/right — because both strafes point toward similar-gradient terrain.
3. There's no awareness that going *around* the hill would reach the engagement faster than trying to go *through* it.

This task fixes both the reverted declarative attempt's shortfalls AND the terrain-navigation weakness in the restored imperative driver. It keeps the driver imperative (the shape the user confirmed "worked better") and adds four principled layers for terrain-aware movement, plus LOS-gated fire, fail-loud validators, and a deterministic-seed pin for combat120.

## Required reading first

- `scripts/perf-active-driver.js` — the 1755-LOC base on master. Read `createDriver()`, `modeProfiles`, `mouseDown`/`mouseUp`, `syncCameraAim`, `findNearestOpfor`, `getPlayerShotRay`, `setHarnessPlayerPosition`, and the movement+fire loop starting ~line 1190.
- `scripts/perf-capture.ts` — `validation` handling, `summary.json` / `validation.json` writes, `--mode` / `--npcs` / query-string construction (~line 1555: `const query = sandboxMode ? ... : ...`). Understand how `status: 'failed'` flows to exit code.
- `src/systems/navigation/NavmeshSystem.ts` — exposes `queryPath(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[] | null`. This is the macro-routing surface.
- `src/systems/player/PlayerController.ts` (or wherever `actionFireStart` / `actionFireStop` live) — confirm method names haven't drifted.
- `src/systems/combat/` — path a fire intent takes from controller through weapon → shot → damage. If `actionFireStart()` resolves shots through the same LOS-aware path as real mouse fire, the "shooting through terrain" issue is the aim path, not the resolve path. The harness LOS gate addresses the aim path.
- `src/config/MapSeedRegistry.ts` — AI_SANDBOX is NOT in the registry (intentionally random; see line 45 comment). For deterministic combat120 terrain, either pass a seed via URL query param or add an AI_SANDBOX entry.
- `docs/TESTING.md` — behavior tests only.
- `docs/INTERFACE_FENCE.md` — no fence changes expected.

### What to look at but NOT build on

- `src/systems/agent/` — AgentController primitive stays on master. This task does NOT consume it.
- `src/core/SeededRandom.ts` / `ReplayRecorder.ts` / `ReplayPlayer.ts` — stay. Not consumed by this task.

## Target state — four-layer terrain-aware movement

The current driver has one movement layer: "WASD toward target direction." This task stacks four layers on top of the existing driver, in priority order. Each layer cascades: if a higher layer can't make progress, the next layer down takes over.

### Layer 1 — Macro routing via navmesh waypoints

At scenario start and every 5s thereafter (or when stuck), compute a path from current position to the engagement center via `NavmeshSystem.queryPath(playerPos, engagementCenter)`. If a path is returned, store the waypoint list. The driver's movement loop follows waypoints: aim keys toward the *next waypoint*, not directly at the final target. Advance to the next waypoint when within 4m of the current one.

If `queryPath` returns null (e.g. player off-navmesh after a respawn-teleport), fall back to Layer 2 until the next re-plan.

**Key pragmatic choice:** the navmesh is built for NPCs, not the player. NPC agent radius and physics may differ slightly from the player's. Use the waypoint list as a *guide* for direction — not as a rigid rails-movement constraint. Layer 2 does the actual per-tick heading choice within the waypoint leg.

### Layer 2 — Micro steering via terrain-gradient probe

On each decision tick (~450ms), given current heading toward next waypoint (or target if Layer 1 has no path), sample terrain height at `lookAhead = 8m` in 5 candidate directions:
- `ahead` (direction to waypoint)
- `ahead ± 45°`
- `ahead ± 90°`

For each candidate, compute gradient as `(heightAt(probePoint) - currentHeight) / lookAhead`. Pick the candidate that:
1. Advances toward the waypoint (positive dot-product with waypoint bearing), AND
2. Has `|gradient| < maxGradient` (see Layer 4 per-mode tuning; default ≈ 0.45 ≈ 24°).

If all 5 candidates exceed `maxGradient`, flag stuck (→ Layer 3). If multiple candidates pass, prefer the one with smallest `|gradient|` (stay on gentle terrain).

Translate chosen heading to WASD: the existing driver has the mapping (`KeyW` forward, `KeyA`/`KeyD` strafe, yaw via `syncCameraAim`). Re-use it.

### Layer 3 — Stuck detection → teleport recovery

Track horizontal player position over a rolling 5s window. If horizontal displacement < 2m and the driver has issued movement commands consistently over that window, mark stuck. Options in order:
1. Re-plan (call Layer 1's `queryPath` again; maybe the previous plan was stale).
2. If re-plan fails or produces the same impassable first waypoint, teleport to the next waypoint via `setHarnessPlayerPosition(systems, nextWaypoint, 'harness.recovery.stuck')`.
3. If no waypoints, teleport to engagement center (existing behavior for `harness.recovery.frontline_start`).

Teleport is the last resort but the existing driver already uses it for frontline recovery; the new code just adds "stuck on steep terrain" as another trigger.

### Layer 4 — Scenario-level terrain contract

Extend the existing `modeProfiles` object with a `terrainProfile` field:

```js
modeProfiles = {
  ai_sandbox: {
    // ... existing fields ...
    terrainProfile: 'mountainous',
    maxGradient: 0.55,           // 28° — steeper allowed since the map is hilly
    stuckTimeoutSec: 4,          // shorter — teleport sooner on steep terrain
    waypointReplanIntervalMs: 3500,
    combatSeedPin: 'AI_SANDBOX_COMBAT120_v1',  // see seed-pinning note below
  },
  open_frontier: { ..., terrainProfile: 'rolling', maxGradient: 0.45, stuckTimeoutSec: 6, waypointReplanIntervalMs: 5000 },
  a_shau_valley: { ..., terrainProfile: 'mountainous', maxGradient: 0.60, stuckTimeoutSec: 5, waypointReplanIntervalMs: 4000 },
  zone_control: { ..., terrainProfile: 'rolling', maxGradient: 0.45, stuckTimeoutSec: 6 },
  team_deathmatch: { ..., terrainProfile: 'flat', maxGradient: 0.35, stuckTimeoutSec: 8 },
};
```

`stuckTimeoutSec` and `maxGradient` values above are starter proposals; tune after smoke captures.

### Seed pinning for combat120 (scenario-side, not driver-side)

The AI_SANDBOX map is random per seed; procedural hilly layouts are common. To make combat120 capture reproducible AND avoid pathological terrain, pin the seed in the `perf:capture:combat120` script. Two shapes — executor's call:

**Option A — URL query param.** Add `&seed=12345` to the combat120 URL in `scripts/perf-capture.ts`. Verify the game reads `?seed=` and respects it for AI_SANDBOX layout. Simpler; no registry change.

**Option B — MapSeedRegistry entry.** Add an `AI_SANDBOX` variant block to `src/config/MapSeedRegistry.ts` with one pre-baked seed selected for flatter engagement terrain. Requires running `scripts/prebake-navmesh.ts` for that seed. More invasive.

Prefer Option A unless the game's AI_SANDBOX path ignores `?seed=`. Pick the concrete seed number after a few smoke captures — choose one that shows `shots_fired > 50` with the least post-fix tuning. Record the seed choice in PR description.

### LOS-aware fire gate (on top of the 4 layers)

Before calling `actionFireStart`, probe the shot ray for terrain occlusion:

```js
function hasLineOfSightToTarget(systems, cameraPos, targetPos) {
  // Use existing getPlayerShotRay or a fresh terrain raycast.
  // Return true iff the ray from cameraPos to targetPos does not
  // intersect terrain before reaching targetPos.
}
```

If LOS blocked, do NOT call `actionFireStart`. Increment a `los_rejected_shots` counter. The movement layers above will likely have already repositioned the player to find LOS; if not, the stuck-teleport will.

### Fail-loud validators

Keep the restored driver's `validation.json` output. Treat `validation.overall = 'fail'` as capture failure in `perf-capture.ts`. Confirm non-zero exit on fail.

Per-mode validator thresholds (starter values; tune after smoke captures):

| Validator | combat120 | open_frontier:short | a_shau_valley:short | frontier30m |
|-----------|-----------|---------------------|---------------------|-------------|
| `min_shots_fired` | 50 | 30 | 30 | 200 |
| `min_hits_recorded` | 5 | 2 | 2 | 20 |
| `max_stuck_seconds` | 5 | 8 | 8 | 15 |
| `min_movement_transitions` | 3 | 3 | 3 | 10 |

Thresholds should be achievable by the fixed driver with ~30% headroom. Document chosen values in PR description.

### A4-class regression guard

Behavior test at `scripts/perf-harness/perf-active-driver.test.js` (executor's call on exact path): with a mocked `systems.playerController`, exercise the fire decision with a sign-flipped target-delta. Expect: `actionFireStart` is NOT invoked; `los_rejected_shots` or a similar counter rises. This is the guard against the A4 class of silent-wrong-direction regression.

## Steps

1. Read all "Required reading first" files. Build a scratchpad of the 4-6 edit points in `perf-active-driver.js` required for this task.
2. **Baseline gate (hard).** On current master (c480609), run `npm run build:perf` + `npm run perf:capture:combat120`. Expect `validation.overall = 'pass'` with `shots_fired > 50`. If it doesn't pass, the revert is broken — STOP and escalate. The baseline capture is proof the imperative driver at least produces shots on its current AI_SANDBOX seed.
3. Smoke captures in all 5 modes (30–45s each). Record `shots_fired`, `hits`, `movementTransitions`, `max_stuck_seconds` per mode. Identify the worst performer; that's where Layer 1+2 will show the most improvement.
4. Implement Layer 4 (scenario terrain contract). Extend `modeProfiles` with `terrainProfile`, `maxGradient`, `stuckTimeoutSec`, `waypointReplanIntervalMs`, `combatSeedPin` (where applicable).
5. Implement Layer 3 (stuck detection → teleport). Extend the existing rolling-position tracker. Add "stuck-on-steep-terrain" as a new `setHarnessPlayerPosition` trigger reason.
6. Implement Layer 2 (terrain-gradient probe). Add `chooseHeadingByGradient(systems, from, towardBearing, maxGrad)` function. Wire it between the existing direction-to-target computation and the WASD key press logic.
7. Implement Layer 1 (navmesh waypoints). Add `planWaypoints(systems, playerPos, target)` wrapping `NavmeshSystem.queryPath`. Store waypoint list on driver state. Movement loop now aims toward `currentWaypoint` instead of `finalTarget`.
8. Implement seed pinning (Option A preferred). Pass `&seed=<chosen>` in `scripts/perf-capture.ts` for combat120. Pick the seed after smoke-capturing 3–5 candidates on the updated driver; choose the one where the fixed driver achieves highest `shots_fired` with least tuning.
9. Implement LOS-aware fire gate. Add `hasLineOfSightToTarget`. Call it before `actionFireStart`.
10. Wire fail-loud validators in `perf-capture.ts`. Confirm `validation.overall = 'fail'` produces non-zero exit.
11. Add the A4-class regression test.
12. Run full smoke-capture sweep (all 5 modes, plus combat120 on the pinned seed). Tune thresholds to measured × 0.7 for pass, measured × 0.5 for warn.
13. `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf` green.
14. **Live playtest (`npm run perf:capture:combat120 --headed`).** You cannot eyeball the browser window, but you CAN record in your PR report:
    - Did `shots_fired > 50`? Exact value.
    - Did `hits_recorded > 5`? Exact value.
    - Did `max_stuck_seconds` stay under threshold? Exact value.
    - Did any `los_rejected_shots` counter rise (proves the LOS gate engages)?
    - Did any `harness.recovery.stuck` reasons appear in the console log? (One or two is fine; many means the terrain layers aren't keeping up — tune.)
    The orchestrator will escalate the actual eyeball playtest to the human before merge.

## Exit criteria

- `scripts/perf-active-driver.js` stays imperative; no new module created under `src/dev/harness/`.
- Total LOC net change within ~+700 (the 4-layer terrain work is the bulk; original brief's ~500 budget is raised to reflect scope).
- `npm run perf:capture:combat120` (on pinned seed) produces `validation.overall = 'pass'` with `shots_fired > 50`, `hits > 5`, `max_stuck_seconds < 5`.
- Smoke captures in all 5 modes pass their per-mode thresholds.
- LOS-aware fire gate rejects shots through terrain. Behavior test proves this.
- A4-class regression test proves sign-flipped aim does not fire.
- Live capture evidence in PR description: shots, hits, stuck-seconds, LOS-rejected count, teleport-recovery reasons.
- `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf` green.

## Non-goals

- No rewrite of the imperative driver into a declarative DSL. This is the non-negotiable scope fence.
- No consumption of AgentController / SeededRandom / ReplayRecorder.
- No new `src/dev/harness/` module.
- No deterministic-replay feature. Capture → analyze is the flow; replay comes later.
- No new `window.__*` globals. Stay on `window.__engine`.
- No fix for underlying combat shot-resolution (if real mouse fire also penetrates terrain, that's a separate task — the harness LOS gate is aim-path only).
- No new mode profiles. The 5 existing modes are the surface.
- No changes to NPC combat AI, weapons, terrain system, or navmesh system. `NavmeshSystem.queryPath` is consumed as-is.
- No new npc / player input primitives.

## Hard stops

- Restored driver fails Step 2's baseline gate (`shots_fired=0` even before your changes) → STOP. The revert is incomplete.
- LOS gate drops `shots_fired` by > 20% across all modes → STOP. Either the gate is too strict, or spawn points are terrain-blocked (spawn bug, not harness bug).
- Navmesh `queryPath` returns null consistently (player-spawn is outside navmesh coverage) → STOP and flag. Either the navmesh is wrong or the spawn is; not the harness's problem to fix.
- Layer 2 gradient probe causes `max_stuck_seconds > mode.stuckTimeoutSec * 2` across multiple modes → STOP. The probe is bad; tune `maxGradient` or the lookahead distance; if still broken, the underlying logic is wrong.
- Playtest capture evidence shows `shots_fired < 30` on combat120 after all tuning → STOP. The redesign didn't deliver; surface to orchestrator for replanning.
- Diff exceeds ~700 LOC net → STOP. This is large for a single-task PR but bounded by the terrain-work scope; going past means scope drift.
- Executor proposes building a new scenario/policy/validator module under `src/dev/harness/` → STOP. That path is walked.
- Any fence change to `src/types/SystemInterfaces.ts` → STOP.

## Rationale (why this shape, not another)

Three alternatives were considered and rejected:

- **Full declarative rewrite (PR #88's approach).** Rejected by user after live playtest showed the policy abstraction lost the action-oriented driver behavior. The imperative driver is brittle but its directness is robust: if `actionFireStart` disappears, the driver breaks on the first tick.
- **Pre-baked harness-only test arena.** Add a flat `ai_sandbox_harness` map variant to MapSeedRegistry. Rejected as the sole strategy because the harness should be able to exercise arbitrary maps eventually; building in seed pinning as a *convenience* (not a *necessity*) via Option A URL param is the right shape. A future cycle can add formal seed registry entries.
- **Navmesh-only movement (skip the gradient probe).** Would work if the navmesh perfectly matched player traversability. It doesn't — agent radius differs, and the navmesh is bake-once while the player has different physics. The gradient probe is the safety net that makes the navmesh guidance robust.

The 4-layer shape is deliberately pragmatic: navmesh for the macro question ("where do I roughly go?"), gradient probe for the micro question ("what direction is least-steep toward there?"), teleport for the emergency escape, and terrain profile as the mode-specific tuning knob. Each layer has a clear fallback when the layer above fails.
