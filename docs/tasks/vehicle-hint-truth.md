<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# vehicle-hint-truth

Fixes six verified control-hint defects where the on-screen legend lied about
the binds a crewed vehicle actually responds to, plus the severe touch trap
where the EXIT button swaps seats instead of dismounting (making dismount
impossible on touch in a tank). Players in M2HB emplacements, tank gunner
stations, strike planes, boats, and door-gun gunships saw dead throttle/steer
rows, false `F: swap seat` cues that dismount when followed, RMB gun-cam notes
that only the AC-47 honors, and a stale `SEAT: PILOT` label while manning a door
gun. Adds the touch SEAT button so the tank gunner seat and the door gun are
reachable without a keyboard (manifest H1-A / H4; H2 partial = kill the keyboard
hint on the touch bar). Follow-on `hint-table-and-touch-strings` owns the
declarative per-vehicle table + per-vehicle touch verbs.

## Files touched

- `src/ui/hud/HudControlHints.ts` — new `turret` legend; seat-cue gating
- `src/ui/layout/types.ts` — additive `secondSeat?` / `seat?` on VehicleUIContext
- `src/systems/vehicle/TankPlayerAdapter.ts` — set `secondSeat` on both contexts
- `src/systems/vehicle/HelicopterPlayerAdapter.ts` — re-push seat on door-gun swap
- `src/systems/player/PlayerController.ts` — `onExplicitVehicleExit` wiring
- `src/systems/player/PlayerInput.ts` — touch EXIT / SEAT routing
- `src/ui/controls/TouchControls.ts` + `.module.css` — SEAT/EXIT callbacks; drop hint CSS
- `src/ui/controls/VehicleActionBar.ts` — SEAT button; remove keyboard hint row
- matching `*.test.ts` for each

## Scope

1. Turret legend: map ActorMode `turret` to a new `turret` context (Aim / Fire /
   Exit / radio / scoreboard), not the ground-vehicle chassis binds.
2. Gate `F: swap seat` cue + touch SEAT on additive `secondSeat` (tank crews
   only) — not the bare `role`, which single-seat M2HB / boats also report.
3. Plane RMB gun-cam note gated on `viewToggle` (AC-47 only).
4. Door-gun swap re-pushes the vehicle context with the live `seat` so the
   legend reads `SEAT: DOOR GUN` / `F: back to pilot`.
5. Touch EXIT routes to explicit dismount (never seat-swap); add touch SEAT
   button wired to seat-swap (tank) / door-gun toggle (gunship); drop the
   keyboard `TANK_CONTROLS_HINT` row from the touch bar.

## Non-goals

- The declarative per-vehicle hint table + per-vehicle touch-verb strings
  (follow-on `hint-table-and-touch-strings`).
- Boat legend identity (deferred) and gamepad hint variants (skipped).
- No fence edits: `secondSeat` / `seat` are additive-optional on the unfenced
  `layout/types.ts` VehicleUIContext, never `SystemInterfaces.ts`.

## Non-goals guardrails

- `TANK_CONTROLS_HINT` stays exported (deploy-screen loadout still uses it);
  only its render on the touch bar is removed.

## Acceptance

- [ ] `npm run typecheck && npm run lint && npm run lint:budget` pass.
- [ ] Focused tests for every touched file pass (`npm run test:run -- <paths>`).
- [ ] PR opened against `master` with link to this brief + playtest row.
