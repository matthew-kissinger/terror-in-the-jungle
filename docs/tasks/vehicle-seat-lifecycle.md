# vehicle-seat-lifecycle

Some enter/exit paths bypass the IVehicle seat model: `handleEscape` /
`requestVehicleExit` end the player's session without releasing the seat, and
`HelicopterInteraction.tryEnterHelicopter` starts a heli session without calling
`HelicopterVehicleAdapter.enterVehicle()`. Result: seat ghosts — a vehicle whose
`getPilotId()` disagrees with reality, blocking re-boarding and confusing NPC
boarding. This task routes ALL enter/exit through the seat model. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 2.)

## Files touched

- `src/systems/player/PlayerController.ts` (handleEscape / requestVehicleExit)
- `src/systems/helicopter/HelicopterInteraction.ts` (tryEnterHelicopter)
- `src/systems/vehicle/PlayerVehicleAdapterFactory.ts`
- `src/systems/vehicle/VehicleSessionController.ts`
- sibling behavior tests for the touched systems (new or extended)

## Scope

1. Every player exit path (F, Escape, requestVehicleExit, death/respawn if it
   ends a session) releases the occupied IVehicle seat exactly once.
2. `HelicopterInteraction.tryEnterHelicopter` enters through
   `HelicopterVehicleAdapter.enterVehicle()` so the heli's seat state is true.
3. L3 repro-first test: board → exit via Escape → vehicle reports the seat
   free and `getPilotId()` null; re-board succeeds into the same seat.
4. L3 test: heli enter via interaction → adapter/vehicle seat state shows the
   player as pilot (no `getPilotId()===null` desync while flying).

## Non-goals

- Syncing playerState.position to the chassis (dependent task
  `vehicle-player-position-sync` owns that — do not start it here).
- NPC boarding logic changes.
- Seat-swap features (owner-gated `cycle-vekhikl-seat-swaps`).

## Acceptance

- [ ] Repro-first tests above pass; the Escape-exit seat-ghost repro fails on
      master before the fix (state the before/after in your report).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Dependencies

- Blocks: `vehicle-player-position-sync` (shares VehicleSessionController;
  serialized to avoid worktree merge pain).
