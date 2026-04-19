# perf-harness-verticality-and-sizing: slope hookup, pitch range, body sizing

**Slug:** `perf-harness-verticality-and-sizing`
**Cycle:** `cycle-2026-04-18-harness-flight-combat`
**Round:** 2c (second hotfix; blocks Round 3 `perf-baseline-refresh`)
**Depends on:** `perf-harness-killbot` (PR #93)
**Blocks (in this cycle):** `perf-baseline-refresh`
**Playtest required:** yes — merge-gated on eyeball confirmation
**Estimated risk:** low-to-medium — touches global sizing/speed constants + harness driver slope integration
**Files touched:**
- `src/systems/combat/CombatantMovementStates.ts` (NPC speed cap)
- `src/systems/combat/CombatantMeshFactory.ts` (NPC sprite size)
- `src/systems/player/PlayerMovement.ts` (eye-height constant, if we raise it)
- `scripts/perf-active-driver.cjs` (slope-aware pathing + pitch-range verification)
- Possibly `src/systems/player/SlopePhysics.ts` (export slopeDot for driver consumption)
- Tests for each change

## Why this task exists

Playtest of the killbot driver (PR #93) surfaced five residual issues that the NSRL rule-core shape did not address. All five are observable in-engine; all five are within the existing system primitives; none need ML.

1. **NPCs are too fast.** `ADVANCING_TRAVERSE_SPEED = 8 m/s` is ~80% of player max (`PLAYER_WALK_SPEED = 10 m/s`), and there is no separate player sprint. The player cannot close on a retreating/repositioning NPC, so the harness can't engage one reliably. User directive: "limit NPCs to player max sprint speed."
2. **Player feels too small.** `PLAYER_EYE_HEIGHT = 2` paired with NPC billboard of `PlaneGeometry(5, 7)` produces a 3.5:1 NPC-height-to-player-eye ratio. NPCs look like giants; player feels small.
3. **Player stalls on steep slopes and oscillates.** The driver's Layer 2 gradient probe uses a mode-specific `maxGradient` that does not match the actual player physics `SlopePhysics.slopeDot = 0.7` (≈ 45°). The navmesh `WALKABLE_SLOPE_ANGLE = 45°` matches physics, but the driver's per-mode probe diverges.
4. **Aiming up/down is unreliable on vertical terrain.** Targets on ridges above or below the player are often engaged incorrectly — pitch may be clamped (see `clampAimY`), or camera pitch is limited elsewhere. Full-range pitch aim was not explicitly verified in PR #93.
5. **Bobbling persists in steep areas.** Even with pure-pursuit lookahead + navmesh waypoints, the driver falls back to Layer 2 gradient probe when the path is null or stale, and Layer 2 picks direction by per-tick gradient, which oscillates. The path-trust invariant from the killbot brief was not tight enough.

User directive: "we have more verticality than most games, lots of slopes the player cannot climb. Can we hook that into the harness properly? Aiming up/down and navigating verticality has been an issue."

The principle: **the harness driver should consume the same slope/pitch contracts the actual player physics uses.** Today the driver has its own ad-hoc `maxGradient` per mode; the actual game uses `SlopePhysics.slopeDot` and the navmesh uses `WALKABLE_SLOPE_ANGLE`. These should be the same number, consumed in one place.

## What we already have (what to hook, not reinvent)

Existing constants and systems — research this before editing:

| Surface | Value | Where |
|---------|-------|-------|
| Player eye height | 2 (current) | `src/systems/player/PlayerMovement.ts:40` — `PLAYER_EYE_HEIGHT` |
| Player crouch eye height | exists | `PLAYER_CROUCH_EYE_HEIGHT` in same file |
| Player max speed | 10 m/s | `src/systems/player/PlayerController.ts:50` — `PLAYER_WALK_SPEED` |
| NPC sprite geometry | 5 × 7 (w × h) | `src/systems/combat/CombatantMeshFactory.ts:113` — `PlaneGeometry(5, 7)` |
| NPC advancing speed | 8 m/s | `src/systems/combat/CombatantMovementStates.ts:17` — `ADVANCING_TRAVERSE_SPEED` |
| NPC defend speed | 6 m/s | `src/systems/combat/CombatantMovementStates.ts:22` — `DEFEND_SPEED` |
| NPC patrol speed | 5 m/s | `src/systems/combat/CombatantMovementStates.ts:13` — `PATROL_CLOSE_SPEED` |
| Player physics slope-dot | 0.7 (≈ 45°) | `src/systems/player/SlopePhysics.ts` — `slopeDot` |
| Navmesh walkable slope | 45° | `src/systems/navigation/NavmeshSystem.ts:31` — `WALKABLE_SLOPE_ANGLE` |
| Navmesh walkable climb step | 0.6m | `src/systems/navigation/NavmeshSystem.ts:33` — `WALKABLE_CLIMB` |
| Safe NPC spawn max slope | 0.38 rad (~22°) | `src/systems/combat/SpawnPositionCalculator.ts:17` — `SAFE_SPAWN_MAX_SLOPE` |
| Terrain height sampling | `terrain.getHeightAt(x, z)` | existing |
| Navmesh pathing | `NavmeshSystem.queryPath(start, end)` | existing, already consumed in driver |

**The numbers are there.** The task is mostly to (a) adjust 3 constants, (b) make the driver consume the physics slope constant instead of its own, (c) tighten the navmesh-trust invariant so we don't fall back to Layer 2 when we shouldn't, (d) verify aim pitch is truly unconstrained on open-field modes.

## Target state

### 1. NPC speed cap

Set all NPC movement speeds ≤ `PLAYER_WALK_SPEED - 2` (provides a 20% margin so player can always close). Proposed:

```js
// src/systems/combat/CombatantMovementStates.ts
const PATROL_CLOSE_SPEED = 4;         // was 5, kept low
const ADVANCING_TRAVERSE_SPEED = 7;   // was 8, cap at player-max - 3
const DEFEND_SPEED = 5;               // was 6
```

Add a cross-file invariant comment referencing `PLAYER_WALK_SPEED = 10`: "NPC speeds MUST stay ≤ PLAYER_WALK_SPEED - 2 = 8 so player can close engagement distance."

Add a behavior test: `ADVANCING_TRAVERSE_SPEED < PLAYER_WALK_SPEED - 1`. Fails if someone bumps NPC speed above the margin.

### 2. Player eye-height raise + NPC body-size reduction

**Player eye:** raise from 2m to 2.2m (tall adult military eye). Pair with a small `PLAYER_CROUCH_EYE_HEIGHT` bump if the crouch delta was proportional.

**NPC billboard:** reduce from `PlaneGeometry(5, 7)` to `PlaneGeometry(3.2, 4.5)`. A realistic human silhouette on a 5w × 7h billboard is ~50% of the billboard height (i.e. sprite shows person at 3.5m tall — too big). 3.2w × 4.5h with silhouette ratio ~55% = ~2.5m tall apparent, which is still slightly larger than life for depth perception but no longer dwarfs the player.

Verify `BILLBOARD_HEIGHT = 1.5` in `WeaponPickupSystem` still reads correctly after the sprite change (that's for weapons, not combatants — should be unaffected).

Add behavior tests:
- `PLAYER_EYE_HEIGHT >= 2` (regression floor — do not lower)
- NPC sprite-height / player-eye-height ratio < 2.5 (anti-giant test)

### 3. Slope-aware driver — hook the player physics slope constant

The driver's Layer 2 gradient probe currently uses per-mode `maxGradient` numbers (e.g. 0.55 for ai_sandbox, 0.45 for open_frontier). These are ad-hoc — they do not match `SlopePhysics.slopeDot = 0.7` (≈ cos(45°)) or `WALKABLE_SLOPE_ANGLE = 45°`.

**Change:** Export `PLAYER_MAX_CLIMB_ANGLE_RAD = Math.acos(0.7)` (≈ 0.795 rad, ≈ 45.57°) from `src/systems/player/SlopePhysics.ts` (or wherever `slopeDot` lives). The driver consumes this as the single source of truth.

Replace the per-mode `maxGradient` field with a derived value: at probe time, if `Math.abs(atan2(rise, lookahead)) > PLAYER_MAX_CLIMB_ANGLE_RAD`, the slope is impassable. No per-mode override.

The navmesh already bakes at 45°, so a path from `queryPath` is guaranteed climbable-by-physics. **Path trust invariant:** when a navmesh path is non-null and < 5s old, the driver MUST follow the lookahead point on the path; do NOT consult the gradient probe. The probe is only for the fallback case (path null or stale).

Add a behavior test: scripted navmesh returns a valid path; the driver issues WASD toward the lookahead even if intermediate terrain samples show high gradient. The probe does not override the path.

### 4. Aim pitch full range

Audit the aim pipeline for pitch clamps:

- `clampAimY` in driver (line 783) — remove for open_frontier/a_shau_valley (already removed via early-return), verify it's also not clamping on other modes aggressively.
- `camera.rotation.x` — Three.js will accept ±π/2; PlayerController may impose its own cap.
- `cameraController.pitch` — check for a clamp in `PlayerCamera.ts` or wherever pitch is stored.

**Target:** pitch range of ±80° (leaves 10° safety margin from gimbal lock) accessible to the driver on all modes, with the `-25° + distance > 10m` safety gate preserved for ground-fire.

Add a behavior test: scripted target at +30° elevation → aim solution produces pitch ≈ +0.52 rad and this value survives all clamp layers.

### 5. Tighten path-trust invariant in driver

In the killbot driver's main loop, replace the current "use path if available, else fall back to gradient probe" logic with:

```js
const path = state.path;
const pathAgeMs = now - state.pathPlannedAt;
const pathValid = path && pathAgeMs < PATH_TRUST_TTL_MS && path.length >= 2;

if (pathValid) {
  // Trust the path. Pure-pursuit lookahead. Do not consult gradient probe.
  const lookaheadPt = pointAlongPath(path, distanceAlong + adaptiveLookahead(speed));
  const heading = headingToward(eye, lookaheadPt);
  // drive WASD toward heading; snap camera yaw if aggressiveMode
} else {
  // Fallback ONLY: no path or stale.
  // Layer 2 gradient probe picks a heading. This is expected to be rare.
  const headingFromProbe = chooseHeadingByGradient(systems, eye, targetBearing, PLAYER_MAX_CLIMB_ANGLE_RAD);
  if (!headingFromProbe) { /* stuck; layer 3 teleport */ }
}
```

`PATH_TRUST_TTL_MS = 5000` (from the killbot brief). Re-plan when expired.

Add a behavior test: driver with fresh path issues WASD toward lookahead; driver with stale path (> 5s) re-queries navmesh; driver with null path falls through to probe.

## Steps

1. Read all files in the "What we already have" table. Map the 4-5 constant edits.
2. Change NPC speeds in `CombatantMovementStates.ts`; add behavior test asserting the invariant. Run `npm run test:run`; existing combat movement tests should still pass (speeds are already in use).
3. Change `PLAYER_EYE_HEIGHT` to 2.2 (if CROUCH height scales, bump proportionally). Change NPC `PlaneGeometry` to 3.2 × 4.5. Add the two size ratio behavior tests.
4. Export `PLAYER_MAX_CLIMB_ANGLE_RAD` from `SlopePhysics.ts` (or new `PlayerConstants.ts` if cleaner). Thread into driver; remove per-mode `maxGradient`. Add behavior test.
5. Audit aim pitch path; remove any non-safety clamp; verify full ±80° is reachable. Add behavior test.
6. Tighten path-trust invariant in driver. Add behavior test.
7. Smoke captures in all 5 modes (60s each). Record shots / hits / transitions / stuck_seconds.
8. `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf` green.
9. **Live playtest headed.** Watch combat120 AND openfrontier:short. Confirm:
   - NPCs no longer outrun player
   - Player feels taller / NPCs feel right-sized
   - Driver doesn't stall on steep slopes
   - Pitch up/down targets engaged reliably
   Record 3-4 observations per mode in PR description.

## Exit criteria

- NPC speeds: max advancing speed ≤ 7 m/s (hard cap). Behavior test asserts invariant.
- Player eye height ≥ 2.2m. Behavior test asserts floor.
- NPC sprite size ratio to player eye-height: < 2.5. Behavior test asserts ceiling.
- Driver consumes `PLAYER_MAX_CLIMB_ANGLE_RAD` from SlopePhysics; no per-mode `maxGradient` ad-hoc constants. Behavior test asserts consumption.
- Aim pitch: ±80° full range accessible on open-field modes. Behavior test verifies.
- Path-trust invariant: driver with fresh path does NOT consult gradient probe. Behavior test verifies.
- All 5 mode smoke captures pass their harness validators.
- combat120 regression guard: shots > 50 (no regression from PR #93's result).
- Live playtest evidence: NPC speed feels right, player height feels right, no stalls on slopes, vertical aim works.
- `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf` green.

## Non-goals

- No fundamental change to `SlopePhysics` behavior. Export the constant; do not change the physics.
- No change to navmesh generation parameters. `WALKABLE_SLOPE_ANGLE = 45°` stays.
- No change to combat AI firing / damage / cover-search / LOS beyond what's already scoped.
- No new mode profiles. 5 existing modes stay.
- No NPC AI rewrite. Only speed constants change.
- No new declarative module under `src/dev/harness/`.
- No ML, no RL, no new abstractions.
- No cheats in the harness (no position-teleport spam, no magic aim override).
- Fence changes are NOT expected; stop and surface if one becomes tempting.

## Hard stops

- NPC speed cap breaks existing AI behavior tests → STOP and investigate. Likely a test asserting specific velocity values; update alongside the constant change.
- `PLAYER_EYE_HEIGHT` raise breaks first-person rendering (clipping into geometry, camera inside head) → STOP. The number may need to be smaller.
- NPC sprite shrink makes NPCs invisible or hit detection fails → STOP. Hit detection uses collider, not sprite, but verify.
- `PLAYER_MAX_CLIMB_ANGLE_RAD` export causes circular import → move constant to a new `PlayerConstants.ts` used by both.
- Removing per-mode `maxGradient` makes combat120 regress (shots < 50) → STOP; mode-gate the fallback differently.
- Path-trust invariant makes the driver go off-map or get stuck in unreachable terrain → STOP; navmesh coverage may have gaps; note and continue with stuck-teleport backup.
- Aim pitch range increase triggers weapon recoil/accuracy bugs at extreme pitches → STOP; weapon system may not be tested for ±80° shots.
- Diff > 400 LOC net → STOP; propose tighter brief.
- Any fence change → STOP.

## Rationale — why this is one task, not five

All five symptoms share a common root: **the harness driver does not consume the engine's own physics/sizing contracts.** Fixing them together keeps the "what the engine says" = "what the driver uses" invariant in one PR. Splitting into five tiny PRs would optimize for diff-size but hurt the shared-contract story.

The fixes are also small: 4 constant edits, 1 slope-constant export, 1 driver invariant tightening, 1 aim-pitch audit. ~400 LOC total estimate. Tests are ~120 of that.

## References

- Tencent NSRL ([arxiv:2410.04936](https://arxiv.org/abs/2410.04936)) — navmesh + rule-core architecture. The path-trust invariant comes directly from "navmesh provides valid traversal paths before RL operates." The driver must trust navmesh paths the same way.
- Reynolds 1999 — Steering behaviors. The fallback gradient probe is a local obstacle-avoidance behavior; it should not override macro path.
- `docs/MOVEMENT_NAV_CHECKIN.md` (if it exists) — movement workstream notes.
- Previous cycle briefs: `docs/tasks/perf-harness-redesign.md`, `docs/tasks/perf-harness-killbot.md` (predecessors; same file).
