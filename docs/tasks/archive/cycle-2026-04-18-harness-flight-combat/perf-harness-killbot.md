# perf-harness-killbot: rule-only NSRL-shaped killbot driver

**Slug:** `perf-harness-killbot`
**Cycle:** `cycle-2026-04-18-harness-flight-combat`
**Round:** 2b (hotfix; blocks Round 3 `perf-baseline-refresh`)
**Depends on:** `perf-harness-redesign` (merged at `b850dc2`)
**Blocks (in this cycle):** `perf-baseline-refresh` (open_frontier and frontier30m can't rebaseline until the driver actually engages and hits)
**Playtest required:** yes — merge-gated on eyeball confirmation (same as `perf-harness-redesign`)
**Estimated risk:** low-to-medium — surgical fixes on existing driver anchored to named research primitives
**Files touched:** `scripts/perf-active-driver.cjs` (primary), possibly `scripts/perf-capture.ts` (constants export), possibly one inlined reference to `PLAYER_EYE_HEIGHT` from `src/systems/player/constants.ts` (or wherever it lives)

## Why this task exists

Post-merge playtest evidence on the `perf-harness-redesign` driver (PR #90) showed three concrete failure modes on open-field modes (open_frontier and a_shau_valley):

1. **Shots fire into the ground.** Camera position in the driver is set to player *feet* via `syncCameraPosition(camera, ctrl, playerPos)`, but the real game camera is at `player.feet + PLAYER_EYE_HEIGHT`. The driver computes yaw/pitch from the wrong origin; when the game's actual weapon fires from the real eye, the aim vector tilts downward and the bullet hits terrain between the player and the enemy.
2. **Bobbling back and forth.** The gradient probe deflects per-tick toward gentler slopes, but without a committed heading it picks different deflections on consecutive ticks — oscillation. Combined with step-clamped camera rotation (`MAX_YAW_STEP=0.11 rad/tick`, ~14 ticks to rotate 90°), the driver cannot close on moving targets.
3. **Never locking a target.** `findNearestOpfor` re-runs every 450ms. On 900m perception with 120 NPCs in motion, "nearest" flips constantly. Driver re-aims, re-paths, never commits.

Executor evidence from the `perf-baseline-refresh` hard stop: openfrontier:short (180s, 120 NPCs) recorded **341 movement transitions + 339 gradient deflections but 0 shots, 0 hits**. Every sample's probe reason was `target_out_of_range`. The driver moved a lot; it never engaged.

The user's design directive: **emergent efficient killbot, properly integrated with the engine, no cheating (no teleport spam, no magic aim).** The killbot should be a gun-turret-on-a-path-follower, not a simulated human. combat120 stays as-is (it already works); this task fixes the open-field modes.

## Required reading first

### Research primitives (understand the shape, do not copy code)

- **[Training Interactive Agent in Large FPS Game Map with Rule-enhanced Reinforcement Learning, Tencent 2024, arxiv:2410.04936](https://arxiv.org/abs/2410.04936)** — NSRL architecture deployed in Arena Breakout since early 2024. Key design choice: **navmesh + rule-based shooting (not learned) + RL only for high-level decisions.** We have no RL — the killbot is just the rule-based core of NSRL (navmesh for movement, deterministic shooting rules). This is a production-tested hybrid; we take the rule-based half.
- **[Human-like Bots for Tactical Shooters Using Compute-Efficient Sensors, Dec 2024, arxiv:2501.00078](https://arxiv.org/abs/2501.00078)** — VALORANT-like bot design using ray-cast sensors (not pixel input). We consume the game's existing terrain / navmesh / LOS probes directly.
- **[Adaptive Lookahead Pure-Pursuit for Autonomous Racing, arxiv:2111.08873](https://arxiv.org/pdf/2111.08873)** and **[Regulated Pure Pursuit for Robot Path Tracking, arxiv:2305.20026](https://arxiv.org/pdf/2305.20026)** — pure-pursuit with adaptive lookahead distance. Fixed-lookahead pure-pursuit oscillates on tight paths; adaptive variants solve it.
- **[A Comprehensive Survey of PID and Pure Pursuit Control Algorithms, arxiv:2409.09848](https://arxiv.org/abs/2409.09848)** — confirms pure-pursuit is the right geometric path-follower for this class of problem.
- **Reynolds 1999 — Steering Behaviors for Autonomous Characters** (referenced pattern: seek + arrive + obstacle-avoid as weighted vector sum, not switching).
- **Dave Mark 2015 — "Building a Better Centaur: AI at Massive Scale" (GDC)** — utility scoring with hysteresis for target commitment.
- **Buckland 2004 — Programming Game AI by Example** (combat FSM: scan → lock → approach → engage → kill → scan).

### Code

- `scripts/perf-active-driver.cjs` (1755+ LOC imperative driver; live on master). Focus:
  - `syncCameraPosition` (line ~417) — the eye-height bug
  - `clampAimY` (line ~783) — distance-based pitch clamp, may constrain aim on slopes
  - Main decision loop (line ~1190 onward) — target selection, movement state transitions, fire gate
  - `findNearestOpfor`, `predictTargetPoint`, `syncCameraAim`, `mouseDown`/`mouseUp`
  - The 4-layer terrain stack added by PR #90 (navmesh waypoints, gradient probe, stuck teleport, terrain profile) — preserve the navmesh + teleport layers; downgrade the gradient probe to last-resort-only.
- `src/systems/player/PlayerMovement.ts` — search for `PLAYER_EYE_HEIGHT` export/constant. The driver must consume this, not hardcode 1.7.
- `src/systems/navigation/NavmeshSystem.ts` — `queryPath(start, end): THREE.Vector3[] | null`.
- `src/systems/combat/` — quick scan to find `BULLET_SPEED` or weapon muzzle velocity constants for lead calculation.
- `docs/TESTING.md`, `docs/INTERFACE_FENCE.md`.

## Target state — rule-only NSRL architecture

Five primitives compose the killbot. Each is a small change on the existing driver, not a new module.

### 1. Perception layer (consume existing game primitives)

No new sensors. Re-use:
- `NavmeshSystem.queryPath(eye, target)` for macro routing.
- `terrainSystem.getHeightAt(x, z)` for gradient probe (downgraded to last-resort).
- `getPlayerShotRay` + a terrain raycast for LOS gating (already in driver).
- `combatants[]` filtered by opposing faction for the target pool.

### 2. Target selection — utility lock with hysteresis

State:

```js
state.targetLock = {
  combatantId: null,
  lockedAtMs: 0,
  lastScore: 0,
  lastSeenMs: 0,
};
```

Per decision tick (raise cadence to ~200ms on open fields; 450ms is too slow):

```js
function utility(t, playerPos) {
  const dist = distance(playerPos, t.position);
  const visibility = hasLOS(playerPos, t.position) ? 1 : 0.3;  // reduced but not zero; still a candidate
  const threat = (t.isEngagingUs ? 2 : 1);
  return visibility * (1 / (dist + 1)) * threat;
}

// Commit rules:
if (state.targetLock.combatantId) {
  const current = lookup(state.targetLock.combatantId);
  if (!current || !current.alive) lockTo(null);   // dead / out of map
  else if (distance(playerPos, current.position) > perceptionRange) lockTo(null);  // out of range
  else {
    const currScore = utility(current, playerPos);
    const candidates = findOpforInRange(playerPos, perceptionRange);
    const best = candidates.sort((a, b) => utility(b) - utility(a))[0];
    if (best && best.id !== current.id && utility(best, playerPos) > currScore * 1.3) {
      lockTo(best);   // hysteresis: new target must beat current by 30%
    }
    // else: keep lock on current
  }
} else {
  // no lock — pick best available
  const candidates = findOpforInRange(playerPos, perceptionRange);
  if (candidates.length > 0) lockTo(candidates.sort((a, b) => utility(b) - utility(a))[0]);
}
```

30% hysteresis is the Dave Mark IAUS standard; avoids rapid flipping between similar-scored candidates.

### 3. Path following — regulated pure pursuit

Plan a path to the locked target every ~3s or on lock change:

```js
state.path = navmesh.queryPath(eye, lockedTarget.position);  // Vector3[]
state.pathPlannedAt = now;
```

Each tick, find the lookahead point along the path:

```js
function adaptiveLookahead(speed) {
  // From adaptive-lookahead pure-pursuit papers: scale with speed + clamp.
  return clamp(8 + 0.05 * speed, 5, 20);  // metres
}

const lookaheadDist = adaptiveLookahead(playerSpeed);
const lookaheadPt = pointAlongPath(state.path, distanceFromStart + lookaheadDist);
```

Drive WASD toward `lookaheadPt` heading. The pure-pursuit geometry naturally smooths the path; no per-tick oscillation between "W" and "A/D" because the lookahead point shifts continuously.

When the path is `null` (navmesh unavailable or player off-mesh), fall back to the gradient probe from PR #90 — but only as last resort. If the navmesh gives a valid path, TRUST IT; do not second-guess via gradient probe.

### 4. Aim — eye-height snap with velocity lead

Fix the camera-at-feet bug first:

```js
function syncCameraPositionAtEye(camera, ctrl, playerPos) {
  const eye = {
    x: playerPos.x,
    y: playerPos.y + PLAYER_EYE_HEIGHT,   // 1.7m typical
    z: playerPos.z,
  };
  camera.position.copy(eye);
  // ...
}
```

Aim solution at the real eye, with predictive lead:

```js
const BULLET_SPEED = 400;   // m/s — confirm from combat weapon config; placeholder OK if not exposed

function aimSolution(eye, target) {
  const dist = Math.hypot(target.position.x - eye.x, target.position.z - eye.z);
  const tFlight = dist / BULLET_SPEED;

  // Lead the target by its velocity over expected bullet time.
  const aimPt = {
    x: target.position.x + (target.velocity?.x ?? 0) * tFlight,
    y: target.position.y + TARGET_CHEST_HEIGHT + (target.velocity?.y ?? 0) * tFlight,
    z: target.position.z + (target.velocity?.z ?? 0) * tFlight,
  };

  const horizontalDist = Math.hypot(aimPt.x - eye.x, aimPt.z - eye.z);
  return {
    yaw: Math.atan2(aimPt.x - eye.x, -(aimPt.z - eye.z)),
    pitch: Math.atan2(aimPt.y - eye.y, horizontalDist),
    aimPoint: aimPt,
    aimError: angularDistance(currentYaw, currentPitch, yaw, pitch),
  };
}
```

**Snap the camera directly — no MAX_YAW_STEP clamp.** Reasoning: this is a machine, not a wrist. The NSRL paper explicitly kept shooting rule-based "to ensure controllability"; step-clamping is a cosmetic simulation of human input that produces aim-lag failures. The harness is measurement infrastructure; it should aim optimally.

Remove or heavily constrain `clampAimY`. If a slope-level constraint is needed at all, use it only to reject impossible aims (player facing a wall can't aim through it), not to throttle normal engagement aim.

### 5. Fire gate — safe + committed

Fire if and only if:

```
- target locked and alive
- aim_error < 3° (not 0; tolerance for lead-prediction inaccuracy)
- LOS ray from eye to aimPoint is clear (terrain raycast)
- aim pitch > -25°  OR  dist < 10m   (never into ground at range)
- ammo ready (respect reload state)
```

No distance upper bound for fire on open-field modes. A long-range shot that misses is still a "shot fired" — the validator cares about signal; the LOS + pitch safety gates prevent the "firing into ground" and "firing through terrain" bugs.

On any fail, do NOT fire this tick. Next tick re-evaluates. The existing `firingUntil` / `transitionHoldMs` logic throttles fire-start frequency; keep it.

### 6. Combat FSM (collapses existing movement states)

The existing driver has informal states (`movementState`, `targetVisible`, `firingHeld`). Formalize into an explicit enum on `state.combat`:

```
SCAN     — no lock; slow yaw sweep; transition to LOCK on opfor-detected in perception
LOCK     — evaluating candidates; transitions immediately to APPROACH once locked
APPROACH — has lock, out of fire range or LOS blocked; path-follow toward target; fire if opportune
ENGAGE   — has lock, in LOS, aim_error < 3°; fire continuously while conditions hold
(target down / lost) → SCAN
```

**No RETREAT or COVER state on the killbot.** Per user directive: fearless. The existing SEEKING_COVER logic (from the aggressive-patch perf-harness-redesign PR) stays in the driver but never triggers when the target-lock is active — it was a fallback for "don't know what to do" cases which shouldn't arise.

## Steps

1. Read the required-reading research abstracts + all code files. Build a scratchpad of the 6–8 edit points in `perf-active-driver.cjs`.
2. **Baseline gate.** On current master (`8379fac`), run `npm run build:perf` + `npm run perf:capture:openfrontier:short`. Confirm it still records ≤1 shot — this is your pre-fix proof.
3. **Fix camera-at-feet.** Wire `PLAYER_EYE_HEIGHT` constant access from the game systems. Update `syncCameraPosition` to add the eye offset. Run a short combat120 smoke capture (30s) — confirm `shots_fired > 10` with reasonable hit rate. This single fix alone should improve firing-into-ground observability.
4. **Replace step-clamped rotation with snap.** Replace the `MAX_YAW_STEP` / `MAX_PITCH_STEP` clamp block with direct assignment of the aim solution's yaw/pitch to `camera.rotation.y` / `camera.rotation.x` and the `cameraController`. Preserve the `firingUntil` / `transitionHoldMs` logic that throttles fire-start frequency — that's per-fire timing, not rotation speed.
5. **Implement target-lock with utility + hysteresis.** Add the state fields + per-tick scoring per the target-selection snippet. Gate on `aggressiveMode: true` in the mode profile (set for `open_frontier` and `a_shau_valley` only; combat120 stays nearest-each-tick to preserve its existing behavior).
6. **Implement aim solution with lead + snap.** Compute yaw/pitch from the eye-height origin with velocity-lead. Snap directly. Tighten or remove `clampAimY` on open-field modes.
7. **Implement pure-pursuit lookahead.** Replace the direct-to-target aim in the movement-heading computation with lookahead-along-path. Adaptive lookahead from the cited papers. Downgrade gradient probe to last-resort (only when `path == null`).
8. **Implement fire gate refinement.** Add the 4 conditions (aim_error, LOS, pitch safety, ammo-ready). Reject-on-fail; retry next tick.
9. **Formalize combat FSM.** Add the 4-state enum and transitions. Existing state variables can remain; the enum just makes the flow explicit for tests and logs.
10. **Behavior tests.** At minimum:
    - Utility + hysteresis: target A has utility 1.0, target B arrives with utility 1.2 → stay on A; B reaches 1.31 → switch. L2 against scripted observations.
    - Aim solution: eye=(0, 1.7, 0), target=(10, 0, 0), velocity=(0, 0, 0) → pitch ≈ atan2(-1.7+1.2, 10) ≈ -2.86° (looks slightly down at target chest from eye height). Verify the math.
    - Fire gate pitch safety: aim_pitch = -30°, dist = 20m → fire rejected. aim_pitch = -30°, dist = 5m → fire allowed.
    - Pure-pursuit lookahead: path with sharp bend, lookahead stays clamped in [5, 20].
    - Camera-at-eye: after `syncCameraPositionAtEye`, `camera.position.y === playerPos.y + PLAYER_EYE_HEIGHT`.
11. **Smoke captures.** All 5 modes, short durations (30–60s each). Record `shots_fired`, `hits`, `max_stuck_seconds`. combat120 must stay at shots > 50. open_frontier and a_shau_valley must move from 0 to > 60 shots, > 4 hits. If not, tune before shipping.
12. `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf` green.
13. **Live playtest headed.** `npm run perf:capture:openfrontier:short --headed`. Watch. The driver should:
    - Lock on an enemy within 1–2 seconds of visibility
    - Sprint along a navmesh-planned path toward that enemy
    - Fire on first LOS with aim at chest height (not ground)
    - Keep firing while LOS holds and aim_error stays low
    - Re-lock to a new target only after the current is dead or out of sight
    - Not oscillate left/right on open ground
    Record 3–4 observations in the PR description.

## Exit criteria

- openfrontier:short (180s, 120 NPCs): `validation.overall = 'pass'`, `shots_fired > 60`, `hits > 4`, `max_stuck < 8s`
- a_shau_valley:short (180s, 60 NPCs): `validation.overall = 'pass'`, `shots_fired > 60`, `hits > 4`, `max_stuck < 8s`
- combat120 (seed 2718, 90s): `shots_fired > 50`, `hits > 5` (no regression from the 169/92 on PR #90)
- frontier30m: short smoke (5 min) shows engagement begins; full 30min run deferred to `perf-baseline-refresh`
- Behavior tests for all 5 primitives (utility, aim, fire gate, pure-pursuit, camera) pass
- Live playtest evidence in PR description: lock, sprint, fire-on-LOS, no muddling
- `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf` green

## Non-goals

- No new declarative module under `src/dev/harness/`. This is an imperative-driver edit.
- No ML / RL / learned components. Rule-based only (NSRL rule-core; the learned layer from the NSRL paper is deliberately excluded).
- No changes to `src/systems/combat/**` NPC AI, weapons, or damage resolution.
- No changes to `src/systems/navigation/**` (consume `queryPath` as-is).
- No changes to player movement physics, weapon reload timing, or camera controller base behavior.
- No replay / deterministic-seed work. That stays on master as primitives; not consumed here.
- No `frontier30m` full rebaseline during this task — that's the perf-baseline-refresh cycle closer.
- No fence changes.
- No changes to combat120 mode profile (currently works; keep it).

## Hard stops

- Baseline gate: pre-fix openfrontier:short does NOT record 0 shots (it records > 10) → STOP; the regression premise is wrong; surface to orchestrator.
- combat120 regression: after changes, combat120 shots drops below 50 → STOP; mode-gate is leaking the open-field aggressive logic into ai_sandbox.
- openfrontier:short still records 0 shots after all 5 primitives land and tuning → STOP. Problem is deeper than architecture; surface for deeper investigation (possibly a target.position, navmesh, or LOS-probe bug outside the driver's scope).
- Player starts firing through terrain on open field → STOP. LOS gate is broken; the PR #90 LOS probe must remain active through this change.
- Player fires straight down at close enemies → STOP. The `-25° or distance < 10m` safety gate isn't wired correctly.
- Diff exceeds ~500 LOC net → STOP; propose tighter brief. The primitives are small; scope drift means abstractions we don't need.
- Any proposed fence change → STOP.
- Any proposal to build a new declarative harness module → STOP; that path was walked and reverted in PR #89.

## Rationale — why this shape, not another

Three alternatives were considered and rejected:

**ML imitation learning** ([arxiv:2501.00078](https://arxiv.org/abs/2501.00078) approach). Requires a training pipeline, labeled human trajectories, inference-time model shipping. Out of scope for a perf harness.

**Pure RL** ([arxiv:2410.04936](https://arxiv.org/abs/2410.04936) learns high-level decisions). Same objection: training infrastructure + non-deterministic inference. Also: the NSRL paper itself explicitly kept shooting rule-based because RL firing is uncontrollable in production. We have that same objection at 10x strength — we are measurement infrastructure; we need determinism.

**More aggressive profile tuning on the existing step-clamped rotation + nearest-each-tick selection.** The previous iteration of this brief tried this; would produce more movement and zero shots, per the failure evidence. The three bugs (eye-height, step-clamp, no-lock) compound; profile numbers can't paper over them.

The rule-only NSRL shape is the simplest architecture that production-grade tactical-shooter bots actually use (Tencent deployed it commercially in early 2024). Our "killbot" is that architecture minus the RL layer. We get determinism, we get correct behavior, we get a driver anchored in published research instead of ad-hoc tuning.
