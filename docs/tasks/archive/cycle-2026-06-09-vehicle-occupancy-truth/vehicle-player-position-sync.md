# vehicle-player-position-sync

While driving a ground vehicle (or seated in an emplacement), `playerState.position`
stays parked at the boarding spot — heli/fixed-wing sessions already sync it to
the chassis. Terrain chunk streaming, AI targeting, zone capture, and the
minimap all read that stale position: drive 500m and the world stops streaming
around you, NPCs shoot at where you boarded, and zone presence is wrong. This
task syncs the player position to the chassis for ground/water/emplacement
sessions. (Campaign: `docs/CAMPAIGN_2026-06-09-consultation-remediation.md`,
Phase 2.)

## Files touched

- `src/systems/vehicle/VehicleSessionController.ts` (preferred central site in
  its update; or per-adapter update() if the central site can't see the chassis)
- ground/water/emplacement adapter files under `src/systems/vehicle/` as needed
- sibling behavior tests (new or extended)

## Scope

1. During an active ground/water/emplacement session, sync
   `playerState.position` to the vehicle chassis each update (mirror what the
   heli/fixed-wing sessions already do — find and follow that pattern).
2. On exit, the player position is the dismount point (not the boarding spot).
3. L3 repro-first test: board a vehicle, move the chassis 500m, assert
   `playerState.position` tracks the chassis; consumers (e.g. zone capture or
   streaming center) see the moved position.

## Non-goals

- Camera changes (`watercraft-camera` owns the watercraft follow-cam).
- Seat lifecycle changes (landed in `vehicle-seat-lifecycle`).
- NPC passenger position sync.

## Acceptance

- [ ] Repro-first test fails on master (position parked at boarding spot),
      passes after.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Dependencies

- Depends on: `vehicle-seat-lifecycle` (shares VehicleSessionController —
  rebase on its merge).
- Blocks: `watercraft-camera`.
