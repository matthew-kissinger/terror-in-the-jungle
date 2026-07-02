# task/hint-table-and-touch-strings

Campaign: greenlight-followthrough (2026-07-02), wave 3 follow-on to the wave-1
`vehicle-hint-truth` (#476) surgical fixes and the wave-2 `fixed-wing-bombs`
(#488) touch BOMB button. Manifest forks H1-B ("declarative per-vehicle table")
and H2 ("per-vehicle touch-verb strings"), plus the single owner-approved
deferred input wire from #488.

## Goal

Replace the scattered per-adapter / per-consumer control-hint branching with ONE
declarative per-vehicle-class table that drives desktop legends, seat cues, and
touch-verb strings — without regressing any of the wave-1 hint-truth fixes. Close
the deferred `PlayerInput -> PlayerController` leg of the touch BOMB button.

## What shipped

1. **`vehicleClass` discriminator** — additive-optional
   `vehicleClass?: VehicleClass` on `VehicleUIContext` (`src/ui/layout/types.ts`,
   NOT the fenced `SystemInterfaces.ts`). Union:
   `'jeep'|'truck'|'apc'|'tank'|'boat'|'emplacement'|'heli-transport'|'heli-gunship'|'plane'|'plane-broadside'`.
   Every context producer sets it from what it already knows (asset/flight config):
   - `GroundVehiclePlayerAdapter` → `jeep` (jeep/truck/apc share one legend).
   - `WatercraftPlayerAdapter` → `boat`.
   - `TankPlayerAdapter` driver + gunner → `tank`.
   - `TankGunnerAdapter` (solo direct-boarded gunner) → `emplacement` (no swap).
   - `EmplacementPlayerAdapter` → `emplacement`.
   - `HelicopterPlayerAdapter` → `heli-gunship` (gunship) / `heli-transport` (else).
   - `FixedWingPlayerAdapter` → `plane-broadside` (AC-47) / `plane` (A-1 / F-4).

2. **Declarative table** — new pure module `src/ui/hud/vehicleHintTable.ts`
   (SPDX header). `VEHICLE_HINT_TABLE: Record<VehicleClass, VehicleHintEntry>`
   maps each class → `{ legendContext, touchVerbs, seatRule, notes }`. A
   `Record` over the union is compile-time exhaustive; a runtime exhaustiveness
   test pins it too. `deriveVehicleClass(context)` resolves a legacy context that
   omits the field (backward compatibility for pre-table callers + existing tests).
   `HudControlHints.seatHintFromContext` now reads the swap rule from the table
   instead of re-deriving it inline; the exact wave-1 strings are preserved.

3. **Touch verbs** — `VehicleActionBar` reads its ACTION-button captions
   (EXIT / FIRE / SEAT / BOMB / WPN) and the dynamic STAB base (STAB / LEVEL /
   ORBIT) from the table's `touchVerbs`, single-sourcing them with the legend.
   No keyboard binds appear on the touch bar (wave-1 rule; pinned by a test).

4. **Deferred BOMB wire (#488)** — connected the final
   `PlayerInput -> PlayerController -> FixedWingPlayerAdapter.releaseBombFromTouch()`
   leg. `onFixedWingBombRelease` added to `InputCallbacks`, forwarded from the
   touch setup, wired in `PlayerController` (fixed-wing-gated), and gameplay-gated
   in the non-grandfathered `InputManager.wrapCallbacks`. PlayerInput and
   PlayerController are at their budget snapshots, so the wire is net-zero: two
   identical `onToggleFlightAssist`/`onToggleAutoHover` blocks were compressed
   (behaviour-identical) and a redundant touch-handler line collapsed to make room
   — no snapshot re-base, no new methods.

## Non-goals

- Gamepad hints (owner skipped, H5).
- Boat identity / legend redesign (deferred, H3) — boat reuses the ground legend.
- Any gameplay behaviour beyond the single BOMB input wire.
- Infantry hints: the `H: Bandage` legend row already lives in `CONTEXT_BINDS.foot`
  (healing-mvp #484); it is not a vehicle class, so it stays where it is.

## Validation

- `npm run typecheck` — PASS.
- `npm run lint` — PASS (0 errors; 1 pre-existing warning in an untouched file).
- `npm run lint:budget` — 0 failures (FixedWing/Tank adapters trimmed back to 700).
- Focused `npm run test:run -- <touched>` — all green (see PR body).

## Proposed PLAYTEST_PENDING row

touch+hints table walk — every vehicle class shows the correct desktop legend +
correct touch verbs; tank EXIT/SEAT still correct; gunship SEAT takes the door
gun; plane BOMB button drops a bomb on touch (new #488 leg); no keyboard strings
on the touch bar anywhere.
