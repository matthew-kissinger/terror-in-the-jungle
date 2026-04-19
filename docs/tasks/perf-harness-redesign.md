# perf-harness-redesign: per-mode drivers, LOS-aware fire, fail-loud validators

**Slug:** `perf-harness-redesign`
**Cycle:** `cycle-2026-04-18-harness-flight-combat`
**Depends on:** nothing in this cycle (AgentController primitive + SeededRandom/ReplayRecorder already on master but are NOT in scope for this task — see "Non-goals")
**Blocks (in this cycle):** `heap-regression-investigation` (wants a capture surface that actually exercises combat), `perf-baseline-refresh` (rebaseline must use the fixed harness)
**Playtest required:** yes (harness IS a playtest surface; fire-path behavior must be observable live)
**Estimated risk:** low-to-medium — narrow, surgical improvements on the known-working pre-A4 imperative driver
**Files touched:** `scripts/perf-active-driver.js` (surgical edits, stay within ~1900 LOC total), `scripts/perf-capture.ts` (validator contract), new `scripts/perf-harness/validators.js` (or inline — executor's call), `src/core/bootstrap.ts` (only if agent-exposure gate needs a tweak). No `src/dev/harness/**` this time.

## Why this task exists

The declarative `src/dev/harness/` approach from PR #88 (`perf-harness-architecture`) was reverted in PR #89 after a live playtest revealed:

1. The `engage-nearest-hostile` policy did not drive the player toward enemies — player stared at the ground, turned slightly, bounced back and forth.
2. NPCs moved very slowly under the harness scenario.
3. The player fired through terrain at enemies with no LOS gating.
4. combat120 capture produced `shots_fired=0`, `hits=0` over a full 90s with 120 NPCs. The new harness's own validators correctly marked the run FAIL, which is how the break surfaced.

The older imperative `scripts/perf-active-driver.js` (1755 LOC, restored on master by PR #89) was action-oriented and produced meaningful combat activity. Its shape is worth preserving. It has the two key properties the declarative attempt lost: **per-mode tuning tables** (distances, juke style, decision cadence) and **direct method invocation** into `playerController` (not a DOM-event pipeline that can be silently disconnected).

This task upgrades the restored imperative driver with the one good idea from the reverted declarative harness (fail-loud validators) and the one new improvement the playtest exposed (LOS-aware fire gating). It does NOT introduce a new module, new DSL, or new policy/scenario/validator abstraction layer.

## Required reading first

- `scripts/perf-active-driver.js` — the 1755-LOC base. Read `createDriver()`, `modeProfiles`, `mouseDown`/`mouseUp`, `syncCameraAim`, `findNearestOpfor`, `getPlayerShotRay`, and the main movement+fire loop (~line 1190 onward). This is the file you're editing.
- `scripts/perf-capture.ts` — `validation` handling, `summary.json`/`validation.json` writes, acceptance gates (around line 1520–1700). Understand how `status: 'failed'` flows through to exit code.
- `src/systems/player/PlayerController.ts` (or wherever `actionFireStart`/`actionFireStop` live) — the exposed fire surface the driver invokes. Confirm the method names haven't drifted.
- `src/systems/combat/` — the path a fire-intent takes from the player controller through weapon → shot → damage. Specifically check: does a shot fired by `actionFireStart()` go through the same LOS-aware resolution as a real mouse-driven shot? If so, the "shooting through terrain" issue is the aim path, not the resolve path.
- `docs/TESTING.md` — behavior tests only.
- `docs/INTERFACE_FENCE.md` — no fence changes expected.

### What to look at but NOT build on

- `src/systems/agent/` — the AgentController primitive (shipped in cycle-2026-04-18-rebuild-foundation). Stays. This task does NOT consume it. The reverted harness tried to; it didn't work for reasons tied to the policy abstraction, not the primitive itself.
- `src/core/SeededRandom.ts` / `ReplayRecorder.ts` / `ReplayPlayer.ts` — stay. Not consumed by this task. (Future harness redesigns may consume them; this task is about unblocking the cycle.)

## Target state

### 1. Per-mode drivers confirmed action-oriented

The restored driver already has a `modeProfiles` table covering `ai_sandbox`, `open_frontier`, `a_shau_valley`, `zone_control`, `team_deathmatch`. Verify each mode's profile produces observable combat activity by running a short smoke capture in each and recording `shots_fired` / `hits` / `movementTransitions` in a scratch table:

```
mode                 shots_fired  hits  transitions  notes
ai_sandbox (120)        > 50      > 5    > 3
open_frontier:short     > 30      > 2    > 3
a_shau_valley:short     > 30      > 2    > 3
zone_control (60)       > 20      > 1    > 2
team_deathmatch (80)    > 30      > 2    > 2
```

If any mode produces < half these numbers, tune that mode's profile — usually `approachDistance` too aggressive (player stops moving before in range) or `maxFireDistance` too tight (fire rejected on long-range engagements). Do not retune all five unless needed; flag the observed mis-tune in PR description.

### 2. LOS-aware fire gate

The driver currently aims via `camera.lookAt(target)` which ignores terrain between camera and target. Add a terrain-occlusion probe before pulling the trigger:

```js
function hasLineOfSightToTarget(systems, playerPos, target, camera) {
  // Cast a ray from camera/eye position toward target position.
  // Use terrainSystem.raycast or existing getPlayerShotRay to check
  // whether terrain blocks the line before the target.
  // Returns true iff shot can reach target without intersecting terrain.
}
```

- If `hasLineOfSightToTarget` returns false, do NOT call `actionFireStart`. Optionally: trigger a reposition (e.g. side-strafe a short distance) to seek a clear LOS.
- If true, proceed with fire as today.
- `getPlayerShotRay(systems, camera)` already exists in the driver — reuse, extend, or replace. Read it first.

Behavior contract: when LOS is blocked, `shots_fired` should remain 0 for that frame but `movementTransitions` should increment (the driver repositions). If the harness is surrounded by terrain-blocked enemies, it's acceptable to have sub-threshold `shots_fired` for a specific capture, and the validator threshold for that mode can be tuned. But in the default scenarios, the player spawn points put hostiles in open terrain — if you see harness captures where the player is permanently blocked, the spawn logic is wrong, not the LOS gate.

### 3. Fail-loud validators

Preserve this idea from the reverted harness. Treat `validation.overall = 'fail'` as capture failure in `perf-capture.ts`. The restored `validation` infrastructure already exists in the capture script — confirm it still writes `validation.json` and that failing validators cause non-zero exit. If not, wire it.

Minimum validator set per scenario:

| Validator | Threshold (combat120) | Threshold (open_frontier:short) | Threshold (a_shau_valley:short) | Threshold (frontier30m) |
|-----------|----------------------|--------------------------------|-------------------------------|------------------------|
| `min_shots_fired` | 50 | 30 | 30 | 200 |
| `min_hits_recorded` | 5 | 2 | 2 | 20 |
| `max_stuck_seconds` | 5 | 8 | 8 | 15 |
| `min_movement_transitions` | 3 | 3 | 3 | 10 |

Start with these; executor can tune after smoke captures. If a measured value is < 60% of the threshold, the threshold is too tight — bump down to the smallest value that the measured capture passes comfortably. Document chosen values in PR description.

### 4. A4-class regression protection

Add a behavior test at `scripts/perf-harness/perf-active-driver.test.js` (or equivalent — executor's call on path) that exercises the driver's fire decision logic with a deliberately sign-flipped target-delta: the driver should aim AWAY from target, `actionFireStart` should NOT be invoked (LOS gate rejects), and the validator check on `shots_fired` would fail the capture if run live. Keep this test fast (no live browser — mock `systems.playerController`, etc.).

This is smaller than the reverted harness's sign-flip test but serves the same purpose: the A4 class of regression (invisible wrong-direction behavior) cannot reoccur silently.

## Steps

1. Read `scripts/perf-active-driver.js` in full. Build a short scratchpad of what each section does. Identify the 4–6 edit points required for this task.
2. Verify the restored driver works end-to-end: `npm run build:perf` then `npm run perf:capture:combat120`. Expect a green `validation.overall = 'pass'` with `shots_fired > 50`. If it doesn't pass on the restored driver, the revert is incomplete — STOP and escalate.
3. Run smoke captures in all 5 mode profiles (short durations OK, e.g. 30–45 sec). Record `shots_fired`, `hits`, `movementTransitions` per mode in the PR description table.
4. Add the LOS-aware fire gate (`hasLineOfSightToTarget`). Add a behavior test covering: (a) clear LOS → fire allowed, (b) terrain-blocked LOS → fire rejected.
5. Re-run all 5 smoke captures. Compare against the pre-LOS-gate values from step 3. Expected: small drop in `shots_fired` (< 20%), small rise in `movementTransitions` (< 30%). If either exceeds those bounds, the LOS gate is too strict — tune.
6. Wire fail-loud validation: confirm `validation.overall = 'fail'` makes `perf-capture.ts` exit non-zero. Add per-mode minimum validator thresholds from the table above.
7. Add the A4-regression behavior test (sign-flipped delta → no fire).
8. `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf` green.
9. **Playtest**: run `npm run perf:capture:combat120 --headed` and watch. The player should move toward enemies, engage at appropriate range, fire, take cover. No looking-at-ground, no bouncing, no shooting-through-terrain. Document one observation per mode in PR description.

## Exit criteria

- `scripts/perf-active-driver.js` retains its per-mode profile structure; total LOC is within ~±150 of the pre-revert 1755 (scope creep guard).
- `npm run perf:capture:combat120` produces `validation.overall = 'pass'` with `shots_fired > 50`, `hits > 5`.
- Smoke captures in all 5 modes produce `validation.overall = 'pass'`.
- LOS-aware fire gate rejects shots through terrain. Behavior test proves this.
- A4-class regression test proves sign-flipped aim does not fire.
- Live playtest on combat120: player visibly engages, no looking-at-ground, no shooting-through-terrain.
- `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf` green.

## Non-goals

- No rewrite of the imperative driver into a declarative DSL. If the executor reads the 1755 LOC and thinks "I can do this in 400 lines," that's the exact failure mode that produced PR #88. Stop.
- No consumption of AgentController / SeededRandom / ReplayRecorder. These stay on master as primitives; a future cycle can layer them in after this harness is proven stable.
- No new scenario types. The 5 existing mode profiles are the surface.
- No deterministic-replay feature. Capture → analyze is the flow. Replay comes later.
- No `src/dev/harness/` module. This task edits script files under `scripts/` and makes surgical changes to `src/core/bootstrap.ts` only if the existing `window.__engine` exposure gate needs a tweak.
- No new `window.__*` globals. The restored driver uses `window.__engine`; stay with it.
- No attempt to also fix the shooting-through-terrain bug if it exists in the underlying shot-resolve path. This task only adds an aim-path LOS gate in the harness driver. A separate task can investigate whether real player-driven shots also penetrate terrain — that's a combat-system bug, not a harness bug.

## Hard stops

- Restored driver fails validation on step 2 (shots_fired=0 on combat120 even without new gate) — STOP. Revert didn't restore the pre-rebuild behavior cleanly; escalate before layering changes on a broken base.
- LOS gate kills shots_fired across all modes (more than ~20% drop) — STOP. Either the gate is too strict, or most scenario spawn points are terrain-blocked (spawn bug, not harness bug).
- Live playtest still shows player looking at ground or bouncing back and forth after your edits — STOP. The mode profile tuning is wrong; don't ship a cosmetic fix.
- Any fence change to `src/types/SystemInterfaces.ts` — STOP.
- Diff exceeds ~500 LOC net — STOP, propose tighter brief. This is a surgical improvement, not a rewrite.
- Executor proposes building a new scenario/policy/validator module under `src/dev/harness/` — STOP. That path was tried and reverted.

## Rationale (why this shape, not another)

The reverted PR #88 was well-written on paper: declarative scenarios, typed configs, policy registry, fail-loud validators. But it failed because the abstraction layer between "policy emits intent" and "player weapon fires" was too thin, and the tests only exercised internal runner contracts — not the live integration with the real player controller. Policies passed unit tests; the gun still didn't go off.

The imperative driver's direct method invocation (`playerController.actionFireStart()`) is ugly but robust: if the method disappears, the driver fails loudly on the very first tick. That's the property we want to preserve. Once the harness is stable on this base, a future cycle can re-introduce abstractions — this time with live integration tests that would have caught the shots=0 case before merge.
