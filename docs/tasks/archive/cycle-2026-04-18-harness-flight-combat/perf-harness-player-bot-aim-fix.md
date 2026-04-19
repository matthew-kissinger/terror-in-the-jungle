# perf-harness-player-bot-aim-fix: use camera.lookAt() instead of hand-rolled yaw math; strip defensive states

**Slug:** `perf-harness-player-bot-aim-fix`
**Cycle:** `cycle-2026-04-18-harness-flight-combat`
**Round:** 7 (consolidates killed Round 6; replaces stopped Round 6 brief)
**Depends on:** `perf-harness-player-bot` (PR #95, merged)
**Blocks (in this cycle):** Round 8 `perf-baseline-refresh` (cycle closer)
**Playtest required:** YES — merge-gated on live playtest confirming the bot faces enemies, pushes toward them, fires, and hits.
**Estimated risk:** low-to-medium — the fix is mechanical (switch to lookAt + wire a dormant aim-dot gate + strip already-specced defensive states). The risk is incomplete propagation between the TS bot and the CJS driver.
**Budget:** 400 LOC net (mostly deletions + one new lookAt helper + one regression test).

**Files touched:**
- `src/dev/harness/playerBot/states.ts` — delete `yawToward`/`pitchToward` helpers; delete SEEK_COVER + RETREAT state functions; rewrite ENGAGE to push + fire; raise LOS height 1.2 → 1.7; states write `aimTarget: {x,y,z}` instead of computing yaw/pitch.
- `src/dev/harness/playerBot/types.ts` — add `aimTarget: {x,y,z} | null` to `PlayerBotIntent`; remove `aimYaw`/`aimPitch` (or keep as fallback — see "Intent contract" below); remove SEEK_COVER + RETREAT from `PlayerBotState` union; drop cover/retreat/suppression config fields from `PlayerBotConfig`.
- `src/dev/harness/playerBot/PlayerBotController.ts` — rewrite aim path: when `aimTarget` is set, use `camera.lookAt()` pattern to convert point → yaw/pitch, then lerp + apply via `setInfantryViewAngles`. Wire `evaluateFireDecision` (aim-dot gate) before `fireStart()`.
- `src/dev/harness/playerBot/states.test.ts`, `src/dev/harness/PlayerBot.test.ts`, `src/dev/harness/playerBot/PlayerBotController.test.ts` — delete tests for removed states; add regression test for yaw convention (see "Regression test" below).
- `scripts/perf-active-driver.cjs` — parallel mirror: delete SEEK_COVER + RETREAT, rewrite ENGAGE, replace hand-rolled yaw math with `camera.lookAt()` pattern, wire `evaluateFireDecision` into the fire path.
- `scripts/perf-harness/perf-active-driver.test.js` — update state-machine tests.

## Why this task exists

The `perf-harness-player-bot` (PR #95) shipped with TWO bugs that produce the "bot fires 243 shots, lands 0 hits" behavior user observed in live playtest:

### Bug #1 — sign error in hand-rolled yaw math

`src/dev/harness/playerBot/states.ts:35-39` defines:

```typescript
export function yawToward(from: BotVec3, to: BotVec3): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.atan2(dx, -dz);
}
```

The comment at line 33 claims "forward = (sin(yaw), 0, -cos(yaw))". **That's not the THREE.js convention.** Apply Three.js's Y-rotation matrix to the default camera forward `(0, 0, -1)`:

```
Ry(θ) · (0, 0, -1)ᵀ = (-sin(θ), 0, -cos(θ))ᵀ
```

So the correct formula is `forward(yaw) = (-sin(yaw), 0, -cos(yaw))` (**negative** sin), and bearing-to-yaw is `atan2(-dx, -dz)`. The bot's formula puts the camera at π−yaw instead of yaw — mirrored across the Z axis.

Symptom: for a target directly east of the player (dx=+10, dz=0):
- Bot computes yaw = `atan2(10, 0) = +π/2`
- Three.js interprets yaw = +π/2 as forward = `(-sin(π/2), 0, -cos(π/2)) = (-1, 0, 0)` — facing WEST.

Every state that calls `yawToward` inherits this. The camera points away from targets, the weapon raycasts in the wrong direction, and `applyMovementIntent({forward:1})` translates to movement along `camera.getWorldDirection()` which is also the wrong direction.

Matches user observation verbatim: "moving in the opposite direction of the battle, firing level into nowhere."

### Bug #2 — defensive states bail out before firing

`updateEngage` at `states.ts:167-173` checks `retreatHealthFraction` / `coverHealthFraction` / `coverSuppressionScore` BEFORE the fire branch. Any tick where the bot has taken damage transitions to RETREAT or SEEK_COVER, and the fire intent is never set. User direction from previous task: "reference the NPCs, don't become like them" — the harness bot should push aggressively, not flee.

Also: `states.ts:201-203` sets `moveForward = -1` when target is "too close." Players push in for kills; they don't back up.

### Why the OLD killbot didn't have these bugs

At commit 37da280 (reverted/superseded by PR #95), the old killbot used `camera.lookAt(aimX, aimY, aimZ)` then read back `camera.rotation.y/x` (lines 1693-1694). That's the pattern used by every other camera consumer in the repo: `PlayerCamera`, `DeathCamSystem`, `MortarCamera`, `SpectatorCamera`, `flightTestScene`. The old killbot let THREE.js do the math.

PR #95 replaced `camera.lookAt()` with hand-rolled `atan2(dx, -dz)` math based on a documentation assertion that doesn't match Three.js's actual rotation convention. That's the core mistake this task reverses.

## Intent contract

Change `PlayerBotIntent` from "bot writes an angle" to "bot writes a target point":

```typescript
export interface PlayerBotIntent {
  moveForward: number;
  moveStrafe: number;
  sprint: boolean;
  crouch: boolean;
  jump: boolean;

  // NEW: bot writes WHERE to look; controller converts via camera.lookAt().
  // null = hold current view angles.
  aimTarget: { x: number; y: number; z: number } | null;
  aimLerpRate: number;  // kept; controller still lerps between frames

  firePrimary: boolean;
  reload: boolean;
}
```

Rationale: states (which are pure functions of context) should not be responsible for knowing Three.js's rotation convention. They know where the target is. The controller, which has access to the actual camera object, knows how to point it.

Delete `aimYaw` and `aimPitch` from the intent. If any test mocks them, update to use `aimTarget`.

`yawToward` and `pitchToward` are deleted. Their only correct consumer is gone.

`retreatYaw` is deleted (it's for RETREAT which is also deleted).

## Target state machine (5 states)

Final state set:

- **PATROL** — no target known. Set `aimTarget = objective.position` (or a roam anchor), `moveForward = 1`, sprint when far. Scan for enemies. Transition to ALERT when `findNearestEnemy()` returns a target.
- **ALERT** — enemy known, may not be visible yet. Set `aimTarget = aimPointForTarget(target)`. Walk-pace forward. Transition to ENGAGE when `canSeeTarget && dist <= maxFireDistance`.
- **ENGAGE** — target visible, in range. Set `aimTarget = aimPointForTarget(target)`. Fire continuously. Small strafe. `moveForward = 1` when dist > `pushInDistance`, else 0. **Never −1.** No health checks. No suppression checks.
- **ADVANCE** — target known, not visible OR out of range. Set `aimTarget = aimPointForTarget(target)` (keep eyes on). `moveForward = 1`, `sprint = true` when far. Return to ENGAGE when `canSeeTarget && dist <= maxFireDistance`.
- **RESPAWN_WAIT** — dead. `aimTarget = null`. No-op until `health > 0`, then PATROL.

Delete: `SEEK_COVER`, `RETREAT`, and everything they reference (`coverHealthFraction`, `retreatHealthFraction`, `coverSuppressionScore`, `suppressionScore` consumption).

## Controller rewrite — lookAt path

```typescript
// PlayerBotController.ts — pseudocode for the aim path

interface PlayerBotControllerTarget {
  applyMovementIntent(...): void;
  getCamera(): THREE.PerspectiveCamera;       // NEW — the camera itself
  setViewAngles(yaw: number, pitch: number): void;
  fireStart(): void;
  fireStop(): void;
  reloadWeapon(): void;
}

apply(intent: PlayerBotIntent): PlayerBotControllerApplyResult {
  // ... movement identical to today ...

  if (intent.aimTarget) {
    const camera = this.target.getCamera();
    const eyePos = camera.getWorldPosition(_tmpEyePos);
    // Point the camera via lookAt; THREE.js handles rotation-order math.
    camera.lookAt(intent.aimTarget.x, intent.aimTarget.y, intent.aimTarget.z);
    const targetYaw = camera.rotation.y;
    const targetPitch = camera.rotation.x;
    // camera.rotation is now at the lookAt target. Lerp from lastYaw/Pitch.
    const yawNext = lerpAngle(this.lastYaw, targetYaw, intent.aimLerpRate);
    const pitchNext = lerp(this.lastPitch, targetPitch, intent.aimLerpRate);
    // Re-apply the lerped value (this overwrites lookAt's exact pointing).
    this.target.setViewAngles(yawNext, pitchNext);
    this.lastYaw = yawNext;
    this.lastPitch = pitchNext;
  }
  // else: hold angles; don't touch the camera.

  // Fire path with aim-dot gate.
  if (intent.reload) { /* ... unchanged ... */ }
  else if (intent.firePrimary) {
    // Last-line defense — verify camera actually points at aimTarget.
    if (intent.aimTarget) {
      const camera = this.target.getCamera();
      const forward = camera.getWorldDirection(_tmpForward);
      const toTarget = _tmpToTarget.subVectors(aimTargetVec, camera.getWorldPosition(_tmpEyePos)).normalize();
      const aimDot = forward.dot(toTarget);
      if (aimDot < 0.8) { /* suppress fire this tick */ return ...; }
    }
    if (!this.firingHeld) { this.target.fireStart(); this.firingHeld = true; }
    // ...
  }
}
```

Key points:
- `camera.lookAt()` does the rotation-order math; we never hand-roll yaw again.
- The aim-dot gate (0.8 cosine ≈ 37° cone) is the "one-line defense against future convention regressions." It's already exported from the driver as `evaluateFireDecision`; wire it.
- If `aimLerpRate = 1`, lookAt → lerp with rate 1 is effectively "point exactly at target." If `aimLerpRate < 1`, we get smooth slewing. Tests should pin behavior at both rates.

## CJS mirror

Everything above must land in `scripts/perf-active-driver.cjs` too. Specifically:
- Replace the current `applyIntent` (around lines 1257-1305) with a version that uses the camera the driver already holds (the `systems.playerController.getCamera()` handle).
- Delete the CJS mirrors of SEEK_COVER, RETREAT, and associated config.
- Wire the existing `evaluateFireDecision` function (defined at line 28, currently dead code — verified via grep, never called) as the aim-dot gate before `pc.fireStart()`.
- Grep for `moveForward = -1` and `atan2(dx, -dz)` in the CJS driver; zero remaining occurrences at the end.

## Regression tests (both TS and CJS sides)

### Test 1 — yaw convention

```typescript
it('camera.getWorldDirection matches aim target after apply', () => {
  const camera = makeTestCamera();
  camera.position.set(0, 0, 0);
  const controller = new PlayerBotController({ ...mockTarget, getCamera: () => camera });
  const intent = { ...idle, aimTarget: { x: 10, y: 0, z: 0 }, aimLerpRate: 1 };
  controller.apply(intent);
  const forward = camera.getWorldDirection(new THREE.Vector3());
  expect(forward.x).toBeCloseTo(1, 2);   // facing +X
  expect(forward.z).toBeCloseTo(0, 2);
});
```

Repeat for: target at −X, +Z, −Z, and a diagonal. All four cardinal directions + one off-axis. If any fail, the lookAt wiring is wrong.

### Test 2 — aim-dot gate blocks misaligned fire

```typescript
it('suppresses fire when camera does not point at aim target', () => {
  const camera = makeTestCamera();
  camera.rotation.y = 0;   // facing -Z
  const controller = new PlayerBotController(mockTargetWithCamera(camera));
  const intent = { ...idle, aimTarget: { x: 10, y: 0, z: 0 }, firePrimary: true, aimLerpRate: 0.05 };
  const result = controller.apply(intent);
  // After apply, camera yaw has barely moved from 0 toward target (lerp rate 0.05).
  // aimDot should be below 0.8 → fire is suppressed.
  expect(result.fired).toBe(false);
});
```

### Test 3 — no backward movement in ENGAGE

```typescript
it('ENGAGE does not emit moveForward < 0', () => {
  for (let dist = 1; dist <= 100; dist += 5) {
    const ctx = makeEngageCtxWithTargetAtDistance(dist);
    const step = updateEngage(ctx);
    expect(step.intent.moveForward).toBeGreaterThanOrEqual(0);
  }
});
```

## Mandatory capture validation

After implementation and lint/test/build green:

```
npm run perf:capture:combat120
```

Read `artifacts/perf/<timestamp>/summary.json` (or whatever the validator emits) and confirm:

- `shots > 50`
- **`hits > 20`** — **this is the hard gate. If hits < 20, STOP. Do not open a PR.**
- state histogram shows time in `ENGAGE` > 10% of capture
- `waypointsFollowedCount > 0` (not openfrontier-specific; just confirming the bot moves via navmesh)

If `hits < 20` after the fix, the aim path is still broken differently. Do not ship.

Optionally run `openfrontier:short` as a secondary check.

## Required reading

1. `src/dev/harness/playerBot/states.ts` — current implementation.
2. `src/dev/harness/playerBot/types.ts` — intent + state union + config.
3. `src/dev/harness/playerBot/PlayerBotController.ts` — current aim path.
4. `scripts/perf-active-driver.cjs:28-68 evaluateFireDecision` — the dormant aim-dot gate to wire up.
5. `scripts/perf-active-driver.cjs:1257-1305 applyIntent` — the current fire-after-setViewAngles path to replace.
6. Commit `37da280` (old killbot) — `git show 37da280:scripts/perf-active-driver.cjs` around lines 559, 1690-1725 for the reference camera.lookAt pattern.
7. `src/systems/player/PlayerCamera.ts:270-295 setInfantryViewAngles` — the method the controller calls AFTER lookAt to apply the lerped angles (preserves compatibility with `isInHelicopter/isInFixedWing` guards).
8. `docs/TESTING.md` — behavior tests only.
9. `docs/INTERFACE_FENCE.md` — fence check. Adding `getCamera()` to the controller's target interface is fine; it's not on the engine-level `SystemInterfaces.ts` fence.

## Steps

1. Read required files. Map every `yawToward`, `pitchToward`, `retreatYaw`, `SEEK_COVER`, `RETREAT` reference across TS and CJS.
2. Update `types.ts`: add `aimTarget`, drop `aimYaw`/`aimPitch`, drop cover/retreat state members and config fields.
3. Update `states.ts`: delete `yawToward`/`pitchToward`/`retreatYaw`/`updateSeekCover`/`updateRetreat`. Update all remaining state functions to write `aimTarget` (the point) rather than angles. Rewrite `updateEngage` per the behavior spec. Raise `TARGET_CHEST_HEIGHT` → `TARGET_LOS_HEIGHT = 1.7` (aligns with engine NPC-to-NPC LOS).
4. Update `PlayerBotController.ts`: accept `getCamera()` in the target interface. Rewrite `apply` aim path using `camera.lookAt()`. Wire the aim-dot gate before `fireStart()`.
5. Propagate all changes to `scripts/perf-active-driver.cjs`. Grep for `atan2(dx, -dz)` and `moveForward = -1` — both should hit zero after.
6. Update all affected tests (TS + CJS). Add the three regression tests in "Regression tests" above.
7. `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf` green.
8. Run combat120 smoke capture. If `hits < 20`, STOP and diagnose. Do NOT open a PR with a broken fire path again.
9. Open PR with capture summary (shots/hits/time-in-ENGAGE) in the description.

## Exit criteria

- `PlayerBotState` union has exactly 5 members: PATROL, ALERT, ENGAGE, ADVANCE, RESPAWN_WAIT.
- No references to `yawToward`/`pitchToward`/`retreatYaw`/`SEEK_COVER`/`RETREAT`/`moveForward = -1`/`retreatHealthFraction`/`coverHealthFraction`/`coverSuppressionScore` in either TS or CJS.
- `camera.lookAt` is used for aim conversion; there are no `Math.atan2(dx, -dz)` or `Math.atan2(dx, dz)` calls in the aim path of either TS or CJS.
- Aim-dot gate is wired: `evaluateFireDecision` (or an equivalent check) is called before `fireStart()`. Not dead code.
- `TARGET_LOS_HEIGHT = 1.7`.
- Three regression tests pass.
- combat120 smoke capture: `shots > 50`, `hits > 20`, time-in-ENGAGE > 10%.
- Lint / test:run / build / build:perf green.
- Live playtest confirmation from human reviewer.
- Diff < 400 LOC net.

## Non-goals

- No changes to NPC combat AI.
- No changes to `evaluateFireDecision`'s internal logic (wire it only; do not modify it).
- No new states.
- No changes to `perf-baselines.json` (Round 8 handles that).
- No changes to `SystemInterfaces.ts`.
- No cover-seeking, no retreat, no suppression-driven decisions — regardless of how "realistic" they feel. This bot is a perf-harness player surrogate, not a soldier.
- No mouse-motion simulation (`mousemove` events). The controller uses `setInfantryViewAngles` directly — same as today.

## Hard stops

- Fence change → STOP.
- combat120 smoke capture `hits < 20` after the fix → STOP. Fire path is still broken. Do not ship.
- Three regression tests don't all pass → STOP. The lookAt wiring is wrong; diagnose before merging.
- `camera.lookAt()` starts producing wrong results in tests because rotation order isn't `YXZ` → STOP; the controller may need to temporarily set rotation order.
- Removing RETREAT/SEEK_COVER breaks a test that depends on them for an unrelated assertion → STOP; flag the entanglement.
- Diff > 400 LOC → STOP. This is mostly deletions; growth means scope slip.

## Rationale — one task, three fixes

The three fixes (aim convention, defensive-state removal, aim-dot gate wiring) ship together because:

- Aim alone doesn't help if the bot still flees on damage — hits=0 stays at hits=0 because ENGAGE is never reached.
- Defensive-state removal alone doesn't help if aim is wrong — bot fires 243 shots, still lands 0.
- Aim-dot gate is a one-line safety net that would have caught both Round 6's silent-fire-no-hit bug and future regressions of the same class. Cheap and diagnostic.

Splitting these would land one at a time and each would look like it fixed nothing until all three were in. Ship them together.

## References

- PR #95 (the breakage). Commit `11edbdd`.
- Commit `37da280` (old killbot). Contains the correct `camera.lookAt` pattern at lines 1690-1725.
- `docs/tasks/perf-harness-player-bot.md` (archived) — the brief that specified the cautious behavior.
- `memory/feedback_harness_reuses_npc_primitives.md` — the principle this task enforces: consume engine math (lookAt), don't reinvent it.
- User direction (2026-04-19 live playtest): "moving in the opposite direction of the battle, firing level into nowhere. there are core primitives that are improperly mapped aligned and documented likely or maybe something else or a combination of things."
