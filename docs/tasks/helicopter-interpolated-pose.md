# helicopter-interpolated-pose: feed interpolated helicopter pose to PlayerController

**Slug:** `helicopter-interpolated-pose`
**Cycle:** `cycle-2026-04-22-heap-and-polish`
**Round:** 2
**Priority:** P1 — mechanical port of PR #124 (fixed-wing) to helicopter. Same tick-back-and-forth root cause, different vehicle.
**Playtest required:** NO (probe-verified via pose-continuity assertion, same pattern as PR #124).
**Estimated risk:** low — direct 1:1 port; the interpolated source is already in scope at the call site.
**Budget:** ≤150 LOC.
**Files touched:**

- Modify: `src/systems/helicopter/HelicopterModel.ts` (at line ~549; the piloted-helicopter `playerController.updatePlayerPosition(state.position)` call).
- Possibly modify: sibling call sites in the same block (lines 553 `weaponSystem.update`, 568 `doorGunner.update`) — audit per PR #124's precedent; external-surface consumers take interpolated pose, simulation-internal consumers keep raw.
- Add: Vitest L2 + L3 regressions in `src/systems/helicopter/HelicopterModel.test.ts` (file already exists, line 361 already asserts `updatePlayerPosition` was called).

## Required reading first

- `src/systems/helicopter/HelicopterModel.ts:520-590` (the piloted-helicopter update path; `helicopter.position` is already set from `physics.getInterpolatedState().position` at line 534 via `visualState.position`).
- `src/systems/helicopter/HelicopterModel.ts:549` — the raw-feed bug.
- `src/systems/vehicle/FixedWingModel.ts:365` — the PR #124 precedent (`group.position` fed to `updatePlayerPosition`).
- `src/systems/vehicle/FixedWingModel.test.ts:290-340` — the L2/L3 regression pattern PR #124 established (asserts the final `updatePlayerPosition` call argument matches the render mesh position).
- `docs/tasks/archive/cycle-2026-04-22-flight-rebuild-overnight/player-controller-interpolated-pose.md` — the original brief, for full context on the time-base alignment argument.

## Diagnosis

At `HelicopterModel.ts:534` the render mesh (`helicopter.position`) is already updated from `physics.getInterpolatedState().position`. At line 549, the piloted helicopter feeds `state.position` (the **raw** physics snapshot from `physics.getState(id)`) to `playerController.updatePlayerPosition`. Camera reads `helicopter.position` (interpolated). This is the same three-time-base alias PR #124 fixed for fixed-wing. Visible as tick-back-and-forth at high monitor refresh rates and during fast maneuvering.

## Fix

Replace `state.position` with `helicopter.position` (the already-interpolated render pose) on the `updatePlayerPosition` call at line 549. Audit sibling calls at 553 and 568:

- `weaponSystem.update(deltaTime, id, state.position, helicopter.quaternion, ...)` — the quaternion is already `helicopter.quaternion` which is interpolated (line 535: `helicopter.quaternion.copy(visualState.quaternion)`). For consistency, pass `helicopter.position` to match. Unless a unit test explicitly pins a raw-position dependency, migrate.
- `doorGunner.update(deltaTime, id, state.position, helicopter.quaternion, state.isGrounded)` — same reasoning. Migrate.

Keep `state.isGrounded` raw; it is a boolean simulation state, not a pose.

Decision per PR #124 precedent: when in doubt, pass interpolated pose to external consumers; the only legitimate raw-pose consumer is a simulation-internal computation (e.g., the aircraft's own next-tick physics step), which does not appear in this block.

## Steps

1. Read all of "Required reading first."
2. Audit every `state.position` / `state.quaternion` / `state.rotation` reference in `HelicopterModel.ts:520-590`. Classify each as render-path (migrate to `helicopter.position` / `helicopter.quaternion`) or simulation-internal (keep raw).
3. Make the migrations. Keep the diff scoped to the piloted-helicopter update path. Do NOT refactor the physics snapshot shape or the interpolation copy.
4. Add a L2 behavior test in `HelicopterModel.test.ts`: step the helicopter, assert that the last `updatePlayerPosition` argument equals the render-mesh position (see `FixedWingModel.test.ts:290-340` for the pattern).
5. Add a L3 pose-continuity test in `src/systems/helicopter/__tests__/` (create the dir if missing) or in the existing `HelicopterModel.test.ts`: step at a synthetic 144Hz render cadence, assert no zero-delta frames and smoothly monotonic progression of the piloted-helicopter player pose over 120 ticks.
6. Probe: compute a before/after pose-continuity JSON similar to PR #124's `pose-continuity.json`. Target metric: zero-delta frame count drops from N to 0. Commit to `docs/cycles/cycle-2026-04-22-heap-and-polish/evidence/helicopter-interpolated-pose/`.

## Exit criteria

- `playerController.updatePlayerPosition` on the piloted helicopter receives the interpolated pose.
- L2 + L3 regressions added and passing.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Probe evidence committed.
- No regression in fixed-wing behavior (the fix is scoped to helicopter; shared code is not touched).

## Non-goals

- Do not change `physics.getState` or `physics.getInterpolatedState` signatures.
- Do not touch `HelicopterVehicleAdapter.ts` or `HelicopterPlayerAdapter.ts` unless audit at Step 2 finds a raw-feed bug there too; in that case, note it in the report and leave for a follow-up task.
- Do not modify the helicopter rotor or audio systems; scope is pose-feed only.

## Hard stops

- Fence change (SystemInterfaces) → STOP.
- An unexpected helicopter-specific reason exists for the raw-feed (e.g., a rotor sync that depends on pre-interpolation pose) → STOP, file a memo.
- Fixed-wing regression surfaces → STOP.

## Pairs with

`a1-altitude-hold-elevator-clamp` (both in Round 2, disjoint files).
