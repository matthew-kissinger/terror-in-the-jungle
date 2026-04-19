# perf-harness-player-bot-aggressive: strip NPC cautiousness, fix fire path

**Slug:** `perf-harness-player-bot-aggressive`
**Cycle:** `cycle-2026-04-18-harness-flight-combat`
**Round:** 6 (second pass on the player bot; replaces the stopped Round 5 attempt)
**Depends on:** `perf-harness-player-bot` (PR #95) — this task edits that code.
**Blocks (in this cycle):** Round 7 `perf-baseline-refresh` (cycle closer)
**Playtest required:** YES — merge-gated on live playtest showing the bot aggressively engages and kills.
**Estimated risk:** low — mostly deletions + 3 targeted fixes. The architecture is right; the *behavior* was wrong.
**Budget:** 300 LOC net (most of the diff is deletions).
**Files touched:**
- `src/dev/harness/playerBot/states.ts` (delete SEEK_COVER + RETREAT state functions; rewrite ENGAGE; fix TARGET_CHEST_HEIGHT)
- `src/dev/harness/playerBot/types.ts` (remove SEEK_COVER/RETREAT from `PlayerBotState` union; drop cover/retreat config fields)
- `src/dev/harness/playerBot/states.test.ts` (delete tests for removed states; update ENGAGE tests)
- `src/dev/harness/PlayerBot.ts` (if it dispatches to the removed state handlers, simplify)
- `src/dev/harness/PlayerBot.test.ts` (update for new state set)
- `scripts/perf-active-driver.cjs` (the parallel JS mirror — strip same states, rewrite ENGAGE equivalent, fix LOS height offset)
- `scripts/perf-harness/perf-active-driver.test.js` (update state-machine tests)

## Why this task exists

PR #95 shipped the `PlayerBot` state machine, but user playtest of the merged code surfaced three fundamental behavior bugs:

1. **Bot moves backward instead of attacking.** `updateEngage` in `src/dev/harness/playerBot/states.ts:201-203` sets `moveForward = -1` when target is "too close." Players don't back off — they push in for kills.
2. **Bot flees at the first sign of damage.** `updateEngage:165-173` has health/suppression bail-outs *before* the fire branch. Any NPC damaging the bot triggers a transition to `RETREAT` or `SEEK_COVER` before the fire intent is ever set. Direct user observation: "i saw a harness run where the user never even shot any enemy players."
3. **Bot aim doesn't align with NPC hit geometry.** `TARGET_CHEST_HEIGHT = 1.2` (states.ts:54) was written when NPC billboard was 5×7; post-PR #94 the billboard is 3.2×4.5. The raycast-to-chest is now effectively below target center, so terrain raycasts terminate on terrain bumps before reaching the NPC. Engine NPC-to-NPC LOS uses eye-to-eye at 1.7 (`AILineOfSight.ts:202-204`).

Root cause: PR #95's brief said "mirror the NPC state set, trimmed." That direction conflated two orthogonal concerns — the harness bot should consume NPC *primitives* (LOS, targeting, navmesh) so it doesn't reinvent engine semantics, but it should NOT inherit NPC *behavior* (cover-seeking, retreat-on-suppression, cautious distance-keeping). A focused human player pushes into combat; an NPC combatant is tuned for survival and tactical retreat. The harness needs the first mode, not the second.

## Target state machine

Final state set (5 states, no defensive ones):

- **PATROL** — no target known. Sprint toward nearest objective (or roam anchor if no objective). Scan for enemies each tick.
- **ALERT** — enemy known but not visible. Orient toward last-known position, advance at walk pace. Transition to ENGAGE when LOS becomes true.
- **ENGAGE** — target visible, in-range. Fire continuously. Keep aim locked. Lateral strafe for realism. `moveForward = 0` (hold ground) OR `moveForward = 1` (push in — see behavior spec below). Never `-1`. No health checks. No suppression checks.
- **ADVANCE** — target known, not visible OR out of range. Path toward target via navmesh (`queryPath` with `findNearestPoint` snap). Sprint. Return to ENGAGE when `canSeeTarget` resolves true and distance ≤ `maxFireDistance`.
- **RESPAWN_WAIT** — dead. No-op until `health > 0`, then PATROL.

Delete: `SEEK_COVER`, `RETREAT`. All associated config (`retreatHealthFraction`, `coverHealthFraction`, `coverSuppressionScore`, `suppressionScore` consumption — already dead code per the combat-reviewer).

## ENGAGE behavior spec

```typescript
function updateEngage(ctx: PlayerBotStateContext): PlayerBotStateStep {
  const intent = createIdlePlayerBotIntent();
  intent.aimLerpRate = ctx.config.aimLerpRate;

  const target = ctx.currentTarget ?? ctx.findNearestEnemy();
  if (!target) {
    intent.aimYaw = ctx.yaw;
    intent.aimPitch = ctx.pitch;
    return { intent, nextState: 'PATROL', resetTimeInState: true };
  }

  const aimPt = aimPointForTarget(target);
  intent.aimYaw = yawToward(ctx.eyePos, aimPt);
  intent.aimPitch = pitchToward(ctx.eyePos, aimPt);

  const visible = ctx.canSeeTarget(aimPt);   // raycast TO the aim point, not target.position
  const dist = horizontalDistance(ctx.eyePos, target.position);
  if (!visible || dist > ctx.config.maxFireDistance) {
    return { intent, nextState: 'ADVANCE', resetTimeInState: true };
  }

  // Magazine management.
  if (ctx.magazine.current <= 0) {
    intent.reload = true;
  } else {
    intent.firePrimary = true;
  }

  // Player-style push. Keep closing distance until very close, then hold.
  const pushInDistance = ctx.config.pushInDistance ?? 25;  // push in until within 25m
  intent.moveForward = dist > pushInDistance ? 1 : 0;
  intent.sprint = false;  // no sprint while firing; realistic player recoil discipline

  // Dodge strafe for realism (same lever that already exists).
  intent.moveStrafe = engageStrafeIntent(
    ctx.timeInStateMs,
    ctx.config.engageStrafePeriodMs,
    ctx.config.engageStrafeAmplitude,
  );

  return { intent, nextState: null, resetTimeInState: false };
}
```

Key differences from PR #95:
- No health/suppression bail-outs.
- `canSeeTarget(aimPt)` — raycast to the aim point, not `target.position`. This is the second LOS fix (below).
- `moveForward = 1` when far, `0` when within push-in distance. Never `-1`.
- `sprint = false` — no sprinting while firing (player-style).

## LOS fix — raycast to aim point, not target ground position

Change `TARGET_CHEST_HEIGHT` → `TARGET_LOS_HEIGHT`, raise to **1.7** (matches the engine's NPC eye-to-eye at `AILineOfSight.ts:202-204`). Also: the LOS check in `updateEngage` currently passes `target.position` (ground level); change it to pass `aimPointForTarget(target)` so the raycast goes to the same height the bot aims at. This removes the terrain-bump-between-player-and-target false-negative pattern.

Propagate the same fix to the CJS mirror in `scripts/perf-active-driver.cjs` (the `canSeeTarget` closure and any target-height constants).

## Instrumentation assertion — fire gate must resolve at least once

Add a behavior test in `PlayerBot.test.ts`: scripted scenario with 1 visible enemy within range and full magazine, ticked for N frames, expect `firePrimary = true` to have been emitted at least once. If this test fails on master today with the ENGAGE rewrite, the fire path is still broken — fail loud.

Separately, add a runtime assertion in the bot's `stop()` stats: if the capture ran for > 30s AND the bot reached ENGAGE at least once AND magazine never dropped below max AND reload was never requested — that's the "never fired" signature. Log a warning but don't crash the capture.

## PlayerController wiring sanity check

The controller adapter at `src/dev/harness/playerBot/PlayerBotController.ts` calls `target.fireStart()` / `fireStop()` / `reloadWeapon()` / `applyMovementIntent()` / `setViewAngles()`. Verify these are the actual PlayerController public methods (at `src/systems/player/PlayerController.ts:632` and surrounding) — I believe they are (grepped during brief authoring). If they are not, the bot's intent never reaches the weapon system; that would also explain zero shots. Low probability given test coverage, but flag any mismatch.

## Required reading

1. `src/dev/harness/playerBot/states.ts` — current implementation. Delete SEEK_COVER + RETREAT; rewrite ENGAGE.
2. `src/dev/harness/playerBot/types.ts` — `PlayerBotState` union and `PlayerBotConfig` fields.
3. `src/systems/combat/ai/AILineOfSight.ts:108 canSeeTarget`, `:197-213 evaluateFullLOS` — the eye-to-eye terrain raycast; 1.7 eye height.
4. `src/systems/player/PlayerController.ts:632-657` — fireStart/fireStop/reloadWeapon/setViewAngles public surface.
5. `scripts/perf-active-driver.cjs` — find the JS mirror of the state machine; apply same changes. Grep for `'SEEK_COVER'`, `'RETREAT'`, `moveForward = -1`, `retreatHealth`.
6. `docs/TESTING.md` — behavior tests only.
7. `docs/INTERFACE_FENCE.md` — fence check (no changes expected).

## Steps

1. Read all required files. Map all occurrences of `SEEK_COVER`, `RETREAT`, `coverHealthFraction`, `retreatHealthFraction`, `coverSuppressionScore`, `suppressionScore` in both TS and CJS.
2. Delete `updateSeekCover` and `updateRetreat` in `states.ts`. Remove their entries from the state dispatcher.
3. Delete the corresponding PlayerBotState enum members in `types.ts` and all config fields for cover/retreat/suppression.
4. Rewrite `updateEngage` per the spec above. Remove health bail-outs. Change `moveForward = -1` to the push-in logic. Change `canSeeTarget(target.position)` to `canSeeTarget(aimPointForTarget(target))`.
5. Rename `TARGET_CHEST_HEIGHT = 1.2` to `TARGET_LOS_HEIGHT = 1.7` in `states.ts`. Update `aimPointForTarget`.
6. Propagate all changes to `scripts/perf-active-driver.cjs` (parallel mirror).
7. Delete tests for removed states. Rewrite `updateEngage` tests for the new behavior (fires when visible + in-range, transitions to ADVANCE when not visible, pushes forward when far, never backs off).
8. Add the "fire gate must resolve once" behavior test described above.
9. Run `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf`. All green.
10. Run a combat120 smoke capture (`npm run perf:capture:combat120`). Report `shots`, `hits`, time-in-ENGAGE from the state histogram, and whether `firePrimary` ever resolved true. Acceptance floor: **shots > 50, hits > 5, time-in-ENGAGE > 10% of capture**.
11. Run an openfrontier:short smoke capture. Acceptance: same floor + `waypointsFollowed > 50`.
12. **Live playtest headed.** Watch combat120 for 60 seconds. Confirm:
    - Bot faces enemies, aim tracks, fires continuously during engagements.
    - Bot pushes toward enemies, does not back away.
    - Bot does not visibly "flee" on taking damage — it keeps fighting or dies trying.
    - Bot achieves at least 1 confirmed kill within 90s.

## Exit criteria

- `PlayerBotState` union contains only: PATROL, ALERT, ENGAGE, ADVANCE, RESPAWN_WAIT.
- `states.ts` has no references to `retreatHealthFraction`, `coverHealthFraction`, `coverSuppressionScore`, or `suppressionScore`.
- `states.ts` and `perf-active-driver.cjs` have NO `moveForward = -1` anywhere.
- `TARGET_LOS_HEIGHT = 1.7` (or the constant is named something else but is 1.7).
- `canSeeTarget` is called with the aim point (1.7 above target), not the target ground position.
- combat120 smoke: shots > 50, hits > 5, time-in-ENGAGE > 10% of 90s.
- openfrontier:short smoke: shots > 20, hits > 3, `waypointsFollowed > 50`.
- Live playtest (PR reviewer / user) confirms aggressive engagement behavior.
- Lint / test:run / build / build:perf green.
- Diff < 300 LOC net.

## Non-goals

- No new engagement tactics (cover-fire, flanking, grenade-use). Just fire + push.
- No aim-convergence dot-product gate (combat-reviewer nit). `aimLerpRate: 1` already makes this a snap. Address if follow-up shows missed shots.
- No new states. 5 states is the ceiling.
- No changes to NPC combat. Bot reads NPC state; NPCs don't read bot state.
- No changes to `perf-baselines.json`. That's Round 7.
- No changes to `SystemInterfaces.ts`.

## Hard stops

- Fence change → STOP.
- Removing defensive states breaks a test that can't be updated in-scope (e.g. a test depends on RETREAT's exact behavior unrelated to this task) → STOP; something is entangled.
- combat120 smoke capture shots < 20 after the fix → STOP. The fire path is broken differently than expected; do not merge. Diagnose first.
- Bot consistently dies before firing → STOP. The aggression pendulum swung too far; add minimal dodge behavior but do NOT re-introduce RETREAT/SEEK_COVER.
- Diff > 300 LOC → STOP. Mostly deletions; if the diff is growing, something's wrong.

## References

- PR #95 (perf-harness-player-bot) — the state machine this task edits.
- `docs/tasks/perf-harness-player-bot.md` — the brief that specified the cautious behavior; retained in git for context.
- Combat-reviewer findings on PR #95 (conversational): flagged sandbag/smoke omission, epsilon mismatch, TS/CJS drift. Non-blocking but worth a second look if follow-up time allows.
- User direction (2026-04-19 post-PR-#95 playtest): "i wanted to reference the npcs not become like them." Codified in `memory/feedback_harness_reuses_npc_primitives.md`.
