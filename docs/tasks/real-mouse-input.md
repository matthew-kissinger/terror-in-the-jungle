# real-mouse-input

Tank cannon, M2HB emplacement, and tank gunner seats read fire input through
duck-typed probes (`isMouseButtonPressed` / `getMouseButton`) that no prod input
class implements — so LMB never fires from those seats. This task adds real
mouse-button state to the input layer and deletes the dead probes, unblocking
Phase 2's `tank-cannon-wiring` (campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 1).

## Files touched

- `src/systems/input/InputManager.ts`
- `src/systems/player/PlayerInput.ts`
- `src/systems/vehicle/TankPlayerAdapter.ts` (readFireInput)
- `src/systems/vehicle/EmplacementPlayerAdapter.ts` (readFireInput)
- `src/systems/vehicle/TankGunnerAdapter.ts` (readFireInput)
- sibling `*.test.ts` for the input change (new or extended)

## Scope

1. Track real mouse-button down/up state in the input layer (InputManager or
   PlayerInput — pick the one that already owns pointer events) and expose a
   queryable accessor for "is mouse button N currently pressed".
2. Rewrite the three adapters' `readFireInput` to consume that accessor.
3. Delete the duck-typed `isMouseButtonPressed` / `getMouseButton` probe code
   paths entirely (no fallback retained).
4. L3 repro-first test: a simulated LMB press while seated in the
   tank/emplacement adapter yields fire intent true; release yields false.

## Non-goals

- Wiring `setCannonSystem` / `M2HBEmplacement.attachPlayerAdapter` into the
  composer — that is Phase 2 `tank-cannon-wiring`.
- Touch/gamepad fire-input changes (keyboard/gamepad paths stay as-is).
- Any rework of infantry weapon fire input (`FirstPersonWeapon` path).

## Acceptance

- [ ] No occurrence of `isMouseButtonPressed` or `getMouseButton` duck-probes
      remains under `src/systems/vehicle/` (grep clean).
- [ ] New/extended behavior test passes: seated fire intent follows real mouse
      button state.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Dependencies / Fence watch

- Blocks: Phase 2 `tank-cannon-wiring` (cross-phase, satisfied by barrier).
- **FENCE:** if the accessor must land on `IPlayerController` in
  `src/types/SystemInterfaces.ts`, STOP — report `fence_change: yes` with the
  proposed signature. Do not edit the fence without `[interface-change]`
  approval (campaign hard-stop, by design).
