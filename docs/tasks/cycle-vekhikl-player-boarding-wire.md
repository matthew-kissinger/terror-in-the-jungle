# Cycle: Player vehicle boarding wire-up (F key → ground / tank / watercraft / emplacement)

Last verified: 2026-05-20 (queued at insertion; pre-dispatch)

## Status

Queued at **position #1** in
[docs/CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md](../CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md).
Independent of cycles #2 and #3 in the same campaign — runs in parallel.

Opens and closes a new ID `VEKHIKL-UX-2` in CARRY_OVERS.md.

## Skip-confirm: no

Owner playtest required: load each scenario, walk near each of the five
drivable vehicle types, press F, confirm boarding. Deferred to
PLAYTEST_PENDING under autonomous-loop posture; merge gated on CI green +
Playwright capture set + a new automated harness assertion that boarding
actually seats the player.

## Concurrency cap: 5

R1 ships five independent wiring landings: PlayerInput F-key router,
PlayerController boarding handler + adapter factory, GroundVehicle
boarding path, Tank boarding path, Watercraft + Emplacement boarding
paths. R2 ships an integration test + Playwright capture set + playtest
evidence.

## Objective

**Critical bug**: every drivable vehicle the player can SEE — M151 jeep,
M48 Patton, Sampan, PBR, M2HB emplacement — is unenterable. The HUD says
"Press F to board <vehicle>" but pressing F either fires the mortar (if
one is deployed) or does nothing. None of the per-category player
adapters (`GroundVehiclePlayerAdapter`, `TankPlayerAdapter`,
`WatercraftPlayerAdapter`, `EmplacementPlayerAdapter`) are ever
constructed by production code, and no `VehicleSessionController.enterVehicle(...)`
call exists in the codebase for the `ground` / `tank` / `watercraft` /
`emplacement` categories. Only helicopter + fixed-wing have a working
boarding glue today.

Source of bug investigation: 2026-05-20 codebase audit. Full notes:

1. `src/systems/player/PlayerInput.ts:526-528` — `KeyF` is bound exclusively to
   `onMortarFire`. No vehicle-boarding callback.
2. `src/systems/player/PlayerController.ts:206-213` — `onEnterExitVehicle`
   and `onEnterExitHelicopter` both unconditionally dispatch to
   `handleEnterExitHelicopter()`. Ground/water/empl never reach the
   `VehicleSessionController`.
3. `src/systems/vehicle/{GroundVehicle,Tank,Watercraft,Emplacement}PlayerAdapter.ts`
   — each class has a full test suite but is never `new`-ed in
   production. The proximity HUD (cycle 2026-05-19) is decorative.

This cycle wires the missing glue: F-key → resolve nearest drivable
vehicle in proximity → instantiate the correct adapter → call
`VehicleSessionController.enterVehicle(<type>, <vehicleId>, ctx)` → on
exit, tear the adapter down. NPC boarding paths
(`NpcVehicleController.orderBoard`) stay untouched.

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. **Bug source**:
   - `src/systems/player/PlayerInput.ts:520-528` (current `KeyF` →
     `onMortarFire` binding).
   - `src/systems/player/PlayerInput.ts:455-456` (current `KeyE` →
     `onEnterExitVehicle` binding — helicopter only today).
   - `src/systems/player/PlayerController.ts:206-213` (current
     `onEnterExitVehicle` / `onEnterExitHelicopter` callbacks — both
     dispatch to `handleEnterExitHelicopter`).
   - `src/systems/player/PlayerController.ts:700-735` (current
     `handleEnterExitHelicopter` + `handleEnterExitFixedWing` shape —
     the pattern to mirror).
2. **Working reference (helicopter path)**:
   - `src/systems/helicopter/HelicopterInteraction.ts:9-150` (proximity
     prompt + `tryEnterHelicopter` entry).
   - `src/systems/vehicle/VehicleSessionController.ts:15-100`
     (`enterVehicle(type, id, ctx)` + `exitVehicle(mode)` shape).
3. **The HUD prompt that already works**:
   - `src/systems/vehicle/GroundVehicleProximityChecker.ts:9-177`
     (prompt show/hide, `lastShownVehicleId` cache,
     `findNearestDrivable` 6 m radius, drivable-category set, prompt
     copy resolver). Already wired into the per-frame loop; needs a
     companion **boarding intent** consumer.
4. **Adapter classes to instantiate (each is fully tested but never
   constructed today)**:
   - `src/systems/vehicle/GroundVehiclePlayerAdapter.ts:78` (M151).
   - `src/systems/vehicle/TankPlayerAdapter.ts:73` (M48 chassis).
   - `src/systems/vehicle/TankGunnerAdapter.ts:82` (M48 gunner seat —
     follow-up swap from pilot).
   - `src/systems/vehicle/WatercraftPlayerAdapter.ts:109` (Sampan + PBR
     pilot).
   - `src/systems/vehicle/EmplacementPlayerAdapter.ts:69` (M2HB tripod).
5. **VehicleManager lookups**:
   - `src/systems/vehicle/VehicleManager.ts:88` `getGroundVehicleByOccupant`.
   - `src/systems/vehicle/VehicleManager.ts:99` `getEmplacementByOccupant`.
   - `src/systems/vehicle/VehicleManager.ts:218` `getTankByOccupant`.
   - `src/systems/vehicle/VehicleManager.ts:262` `getWatercraftByOccupant`.
   - `getVehiclesInRadius`, `getAllVehicles` (existing).
6. **Composer**:
   - `src/core/OperationalRuntimeComposer.ts:240-490` (where the
     ground/tank/water/empl scenario spawns are wired today; the
     player-adapter factory should land in the same composer).
   - `src/core/StartupPlayerRuntimeComposer.ts` (where compass + minimap
     + fullmap vehicle queries are wired — same composer should expose
     the boarding intent surface to `PlayerController`).
7. **Tests for shape reference (do NOT mirror, behavior tests only)**:
   - `src/systems/vehicle/GroundVehiclePlayerAdapter.test.ts`
   - `src/systems/vehicle/TankPlayerAdapter.test.ts`
   - `src/systems/vehicle/WatercraftPlayerAdapter.test.ts`
   - `src/systems/vehicle/EmplacementPlayerAdapter.test.ts`
   - `src/systems/vehicle/GroundVehicleProximityChecker.test.ts`
8. **HUD prompt copy authority**:
   - `src/systems/vehicle/GroundVehicleProximityChecker.ts:45-67`
     `resolveVehiclePromptCopy` — current copies say "Press F to …".
     This cycle either keeps F or flips them to "Press E" (see Open
     Questions below).

## Critical Process Notes

1. **No new player-adapter classes.** The four adapters already exist
   and have full test coverage. The work is _wiring_ them — constructing
   them at boarding time, handing them to `VehicleSessionController`,
   and tearing them down on exit.
2. **No fence change.** `IVehicle`, `VehicleManager`, `PlayerVehicleAdapter`
   interfaces stay as-is. Any proposed change to
   `src/types/SystemInterfaces.ts` → halt.
3. **NPC boarding is untouched.** `NpcVehicleController.orderBoard` and
   `AIStateEngage.npcVehicleBoarding` continue to work for NPC tank
   gunners + M2HB NPCs. Their tests should pass byte-identical.
4. **F-key mortar fire stays available** when no vehicle is in proximity
   AND the player is not seated. The boarding router gates the binding;
   it does not steal it.
5. **Boarding picks the same vehicle the HUD prompt is showing.** The
   `GroundVehicleProximityChecker.lastShownVehicleId` is the
   load-bearing source. Do NOT re-run a separate proximity query in the
   boarding handler; reuse the checker's resolved id so prompt and
   intent always match.
6. **No new HUD copy.** Reuse `resolveVehiclePromptCopy`'s output. If
   the key flips to E, update the resolver's copy in the
   `PlayerInput`-aligned PR.
7. **No worker / persistence changes.** Boarding is in-process state.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `vekhikl-board-input-router`, `vekhikl-board-controller-factory`, `vekhikl-board-ground-adapter-wire`, `vekhikl-board-tank-adapter-wire`, `vekhikl-board-watercraft-and-emplacement-wire` | 5 | Five independent landings; shared interface contract authored in #1 (input router) and consumed by #3-#5 (adapter wires). #2 is the composer-side factory + handler. |
| 2 | `vekhikl-board-integration-test-and-playtest-evidence` | 1 | Single L3 integration test + Playwright capture set + playtest doc. |

## Task Scope

### vekhikl-board-input-router (R1)

PlayerInput-side context-aware F-key router.

**Files touched:**
- `src/systems/player/PlayerInput.ts` — refactor the `KeyF` handler so
  it picks `onBoardNearestVehicle` over `onMortarFire` when a drivable
  is in proximity AND the player is not seated.
- `src/systems/player/PlayerInput.test.ts` — new sibling test (or
  extend existing).

**Method:**
1. Add a new callback `onBoardNearestVehicle?: () => boolean` to
   `PlayerInputCallbacks` — returns `true` if boarding fired (i.e. the
   F press was consumed by boarding), `false` otherwise.
2. In the `KeyF` handler (`PlayerInput.ts:526-528`):
   ```ts
   if (!this.isInFlightVehicle() && event.code === 'KeyF') {
     const consumed = this.callbacks.onBoardNearestVehicle?.();
     if (!consumed) {
       this.callbacks.onMortarFire?.();
     }
   }
   ```
3. Update the `KeyF` doc-comment to call out the dispatch order
   (boarding first, mortar fallback).
4. Touch input (mobile): mirror the same priority in
   `GamepadManager.ts`'s X-button `onInteract` and the touch
   `TouchInteractionButton` — boarding first, helicopter second,
   mortar third. Confirm the existing helicopter E dispatch order
   stays correct.
5. **Behavior test:** mock `onBoardNearestVehicle` returning `true` →
   `onMortarFire` not called. Mock it returning `false` →
   `onMortarFire` called. Mock it `undefined` (no callback registered)
   → `onMortarFire` called (back-compat for unit tests that don't
   wire the new callback).
6. Commit message: `feat(player): F-key boarding router with mortar fallback (vekhikl-board-input-router)`.

**Acceptance:**
- Lint + tests + build green.
- Existing `PlayerInput.test.ts` cases still pass byte-identical for
  inputs that don't touch F.
- New cases cover the three branches (board-consumes, board-declines,
  no-board-callback).
- No fence change.

### vekhikl-board-controller-factory (R1)

PlayerController-side boarding handler + per-category adapter factory.

**Files touched:**
- `src/systems/player/PlayerController.ts` — new
  `handleBoardNearestVehicle()` method + binding into
  `onBoardNearestVehicle` callback.
- `src/systems/vehicle/PlayerVehicleAdapterFactory.ts` — new module
  housing the per-category factory + lifecycle ownership.
- `src/core/StartupPlayerRuntimeComposer.ts` — wire the factory into
  `PlayerController` construction (mirror the
  `createCompassVehicleQuery` pattern landed in PR #285 for the
  compass-vehicle wiring).
- `src/systems/player/PlayerController.test.ts` + new
  `PlayerVehicleAdapterFactory.test.ts`.

**Method:**
1. Author `PlayerVehicleAdapterFactory`:
   ```ts
   export interface PlayerVehicleAdapterFactory {
     // Returns `true` if a vehicle was boarded.
     tryBoardNearest(playerId: string): boolean;
     // Exits via the existing VehicleSessionController; mirror the
     // helicopter exit path.
     tryExit(): boolean;
   }
   ```
2. The implementation reads `GroundVehicleProximityChecker.lastShownVehicleId`
   (expose a public getter for it; the checker already caches the id).
3. Resolve the IVehicle from `VehicleManager.findById(id)` (or the
   existing `getVehiclesInRadius` filter — cheapest is a new
   `VehicleManager.findById(id)` helper).
4. Dispatch by category:
   - `ground` and id `m151_*` → construct
     `GroundVehiclePlayerAdapter`, register with
     `VehicleSessionController.registerAdapter('ground', adapter)`,
     then `enterVehicle('ground', id, ctx)`.
   - `ground` AND id `m48_*` (tank chassis is `category='ground'` per
     `Tank.ts`) → `TankPlayerAdapter` + `enterVehicle('tank', id, ctx)`.
     Defer the pilot↔gunner seat swap to a follow-up — pilot only this
     cycle.
   - `watercraft` (sampan + PBR) → `WatercraftPlayerAdapter` +
     `enterVehicle('watercraft', id, ctx)`. PBR's M2HB twin mounts
     follow the existing emplacement entry path — this cycle wires the
     pilot seat only.
   - `emplacement` → `EmplacementPlayerAdapter` +
     `enterVehicle('emplacement', id, ctx)`.
5. Build a `VehicleTransitionContext`:
   - `vehiclePosition = vehicle.getPosition()`.
   - `playerPositionAtTransition = this.playerState.position.clone()`.
   - `cameraSnapshot` from current camera.
6. Exit path (mirror the helicopter handler):
   - If `vehicleSessionManager.isInVehicle()` and the player is not
     in a flight vehicle → call the matching adapter's
     `onPlayerExit(reason)` and
     `VehicleSessionController.exitVehicle('voluntary')`.
   - F can be reused for exit OR exit can be on a different key (the
     helicopter uses E for both). **Default: F to enter, F to exit**
     (mirror helicopter on E); the router checks
     `isInVehicle()` first and routes F → exit if seated.
7. **Behavior tests:**
   - `tryBoardNearest` with no proximity prompt → no-op, returns false.
   - `tryBoardNearest` with M151 prompt → `enterVehicle('ground', id, _)`
     called, returns true.
   - `tryBoardNearest` with M48 prompt → `enterVehicle('tank', id, _)`
     called, returns true.
   - Sampan, PBR, M2HB analogues.
   - `tryExit` while seated → matching `exitVehicle('voluntary')`
     fires; player position lands at adapter's exit anchor.
8. Commit message: `feat(vehicle): player vehicle adapter factory + boarding handler (vekhikl-board-controller-factory)`.

**Acceptance:**
- Lint + tests + build green.
- All five vehicle category branches covered.
- `PlayerController.test.ts` proves the F-key callback ends up at
  `handleBoardNearestVehicle`.
- Factory test proves correct adapter class is constructed per category
  + id pattern.
- No fence change.

### vekhikl-board-ground-adapter-wire (R1)

End-to-end M151 jeep boarding path.

**Files touched:**
- `src/systems/vehicle/GroundVehiclePlayerAdapter.ts` — only if a
  constructor signature mismatch surfaces; preferred zero source
  change.
- `src/integration/vehicle/m151-board.test.ts` (new L3 scenario test).

**Method:**
1. Take a real `GroundVehicle` instance + a real `PlayerController` in
   the L3 scenario. Confirm `tryBoardNearest` end-to-end seats the
   player and `controls` propagate via the adapter's `processInput`.
2. Drive forward 3 m, exit, confirm player ends up beside the chassis
   (not under it).
3. Confirm the proximity prompt hides on entry, returns on exit if
   still within 6 m.
4. Behavior test only (no implementation mirror).
5. Commit message: `feat(vehicle): wire M151 jeep player boarding end-to-end (vekhikl-board-ground-adapter-wire)`.

**Acceptance:**
- L3 test passes.
- No fence change.
- No source change to `GroundVehiclePlayerAdapter` if not strictly
  needed (factory + composer should be the only new wires).

### vekhikl-board-tank-adapter-wire (R1)

End-to-end M48 Patton (pilot seat) boarding path.

**Files touched:**
- `src/integration/vehicle/m48-board.test.ts` (new L3 scenario test).
- `src/systems/vehicle/TankPlayerAdapter.ts` — only if a constructor
  signature mismatch surfaces.

**Method:**
1. Real `Tank` instance + factory + boarding handler. Confirm F-press
   seats the player at the pilot seat.
2. Drive 5 m with skid-steer inputs (`W` throttle, `A`/`D` turn).
   Exit. Player ejects to the side of the hull.
3. Pilot ↔ gunner swap is **out of scope** this cycle; add a NEXT
   note in the playtest doc.
4. Commit message: `feat(vehicle): wire M48 Patton pilot boarding end-to-end (vekhikl-board-tank-adapter-wire)`.

**Acceptance:**
- L3 test passes.
- Pilot seat works; gunner-swap deferred to follow-up.
- No fence change.

### vekhikl-board-watercraft-and-emplacement-wire (R1)

End-to-end Sampan, PBR (pilot), and M2HB tripod boarding paths.

**Files touched:**
- `src/integration/vehicle/sampan-board.test.ts` (new).
- `src/integration/vehicle/pbr-pilot-board.test.ts` (new).
- `src/integration/vehicle/m2hb-board.test.ts` (new).

**Method:**
1. Sampan: spawn at the A Shau scenario sampan position, factory
   handles boarding via `WatercraftPlayerAdapter`. Drive 5 m via
   throttle, exit at riverbank.
2. PBR: spawn at the OF or A Shau scenario PBR position. Pilot seat
   via factory; M2HB twin mounts NOT wired this cycle — the existing
   PBR-emplacement-child wiring covers gunner seats via the
   `EmplacementPlayerAdapter` once we wire that. Document the
   pilot-only scope.
3. M2HB: spawn at the OF FOB scenario emplacement. Factory mounts the
   gunner via `EmplacementPlayerAdapter`. Slew + fire path is already
   wired by cycle vekhikl-2; this cycle only proves the mount.
4. Commit message: `feat(vehicle): wire watercraft + emplacement boarding end-to-end (vekhikl-board-watercraft-and-emplacement-wire)`.

**Acceptance:**
- Three L3 tests pass (sampan, pbr-pilot, m2hb).
- PBR gunner-seat swap to the M2HB mounts is out of scope; deferred.
- No fence change.

### vekhikl-board-integration-test-and-playtest-evidence (R2, merge gate)

Cross-category integration test + Playwright captures.

**Files touched:**
- `src/integration/vehicle/board-five-types.test.ts` — one L3 test
  iterating across {M151, M48, Sampan, PBR, M2HB} and asserting
  boarding works for each.
- `docs/playtests/cycle-vekhikl-player-boarding-wire.md` — new
  playtest memo.
- `scripts/capture-vekhikl-player-boarding-shots.ts` — new capture
  script: spawn near each vehicle, fire F, capture pre-press + post-
  press + post-exit frames per vehicle type.
- Append to `docs/PLAYTEST_PENDING.md`.

**Method:**
1. The L3 test mounts the full vehicle subsystem with a real composer
   harness and walks the five categories.
2. The capture script reuses
   `scripts/capture-vehicle-wayfinding-shots.ts` skeleton — same
   per-vehicle iteration, additional pre/post/exit frames.
3. Memo lists the deferred owner walk: "drive each vehicle for 10 s,
   exit, confirm camera + position transitions are sane."
4. Commit message: `docs(vehicle): player boarding playtest evidence + integration test (vekhikl-board-integration-test-and-playtest-evidence) (playtest-deferred)`.

**Acceptance:**
- L3 integration test passes.
- 15 captures committed (5 vehicles × 3 frames: pre-press, post-press,
  post-exit).
- Playtest doc + PLAYTEST_PENDING row landed.

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- Any task proposes wrapping `IVehicle.enterVehicle(...)` in a new
  abstraction that bypasses `VehicleSessionController` → halt; the
  session controller is the gate.
- Any task proposes a new per-adapter input event bus (route inputs
  through the adapter's existing `processInput`/`onPlayerInput` method
  per the working helicopter pattern) → halt.
- L3 integration test pass requires the L1/L2 sibling tests to also
  pass; if an L1 test goes red because the adapter constructor changed
  shape, halt and re-scope.
- F-key router lands but the mortar fallback breaks → halt; mortar
  must continue to fire when no boarding candidate is in proximity.

## Reviewer Policy

- **No mandatory `combat-reviewer`** — no combat AI code change. The
  M2HB fire path was already wired by cycle vekhikl-2; this cycle only
  mounts the gunner.
- **No mandatory `terrain-nav-reviewer`** — no terrain or nav touches.
- Orchestrator reviews for: factory lifecycle correctness (adapter
  construction site, teardown on exit, no leaked references), no fence
  leak, F-key mortar fallback intact.

## Acceptance Criteria (cycle close)

**Boarding works for all five categories:**
- M151 jeep: F to enter pilot, F to exit. Drive controls propagate.
- M48 Patton: F to enter pilot, F to exit. Skid-steer controls
  propagate. Gunner swap deferred.
- Sampan: F to enter pilot, F to exit. Throttle + rudder propagate.
- PBR: F to enter pilot, F to exit. Throttle + rudder propagate.
  M2HB mounts handled by existing emplacement entry once cycle's wire
  ships (gunner swap deferred).
- M2HB tripod: F to mount, F to dismount. Slew + fire path works.

**Mortar fallback:**
- F still fires the mortar when no vehicle is in proximity AND no
  vehicle is seated.

**Tests:**
- Five L3 integration tests pass.
- New L1/L2 tests in the factory + input router pass.
- All existing vehicle adapter test files pass byte-identical.

**Playtest evidence:**
- 15+ Playwright captures committed under
  `artifacts/cycle-vekhikl-player-boarding-wire/playtest-evidence/`.

**Other:**
- All R1 + R2 task PRs merged.
- Owner playtest sign-off recorded (deferred under autonomous-loop).
- No fence change.
- `VEKHIKL-UX-2` opened + closed in CARRY_OVERS.md.
- The mortar fallback path documented in
  `docs/playtests/cycle-vekhikl-player-boarding-wire.md`.

## Out of Scope

- **Pilot ↔ gunner seat swap on M48** — separate follow-up task.
- **PBR pilot ↔ gunner seat swap to M2HB twin mounts** — separate
  follow-up task.
- **New vehicle types** (M113 APC, M35 truck, T-54) — that's the
  `cycle-vekhikl-5-fleet-expansion` hold-list cycle.
- **HUD prompt copy rework** beyond fixing the key glyph if the cycle
  decides to flip F → E.
- **Mortar input rework** (keep mortar fire on F via the fallback
  router).
- **NPC boarding paths** — `NpcVehicleController.orderBoard` stays
  untouched.
- Touching `src/systems/combat/**`, `src/systems/terrain/**`,
  `src/systems/navigation/**`.
- Fence touches.

## Open Questions (owner-default decisions pre-baked)

1. **F or E for boarding?** **Default: F (no key change).** Mortar
   fire stays on F via the fallback router. Rationale:
   - The HUD prompt copy already says "Press F to board <vehicle>"
     across the codebase; changing to E means changing 5+ prompt
     strings and migrating the helicopter from E.
   - F is consistent with the existing PBR + tank + sampan player
     adapter docstrings ("F (handled by VehicleSessionController) ->
     enter / exit").
   - The mortar fallback is non-destructive; F-press with no vehicle
     in range works exactly as today.
   If owner prefers E, the change is mechanical: flip the prompt
   resolver string + flip the input router from `KeyF` to `KeyE`.
2. **What happens if the player presses F while seated in a flight
   vehicle?** **Default: F is ignored** (today's `!isInFlightVehicle()`
   gate stays; flight vehicles use E for exit).
3. **Should boarding through the M2HB tripod replace the helicopter E
   path or coexist?** **Default: coexist.** Helicopter E stays; the
   new F-router only handles ground/water/empl. They never collide
   because flight vehicles are excluded from the proximity prompt
   per `GroundVehicleProximityChecker.DRIVABLE_CATEGORIES`.
4. **Where does the player exit to?** **Default: each adapter's
   existing `onPlayerExit` anchor** (already implemented in every
   adapter — see `GroundVehiclePlayerAdapter.ts:180-210` and analogues).
5. **Camera transition on entry / exit?** **Default: each adapter's
   existing `computeThirdPersonCamera` / `computeBarrelCamera`
   (already implemented; this cycle does NOT touch camera code).

## Carry-over impact

- New ID: `VEKHIKL-UX-2`. Cycle-open ID — opens at cycle launch, closes
  at cycle close.
- No hold-list additions; the follow-ups (M48 gunner swap, PBR gunner
  swap) are captured as inline NEXT notes in the cycle close memo.

Net cycle delta on active carry-over count: 0.
