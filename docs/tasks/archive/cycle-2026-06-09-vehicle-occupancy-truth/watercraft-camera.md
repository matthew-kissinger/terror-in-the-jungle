# watercraft-camera

`WatercraftPlayerAdapter` computes a third-person camera
(`computeThirdPersonCamera`) that is unreachable: `setVehicleFollowCamera` is
never wired in its onEnter/onExit, so a player boarding a boat keeps the
infantry camera. Boats are dormant post water-scorch (Sampan/PBR retained, not
spawned), but the adapter is kept correct so watercraft return working when
water is reworked. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 2.)

## Files touched

- `src/systems/vehicle/WatercraftPlayerAdapter.ts`
- sibling behavior test (extended)

## Scope

1. Wire `setVehicleFollowCamera` in `WatercraftPlayerAdapter.onEnter` (engage
   the third-person follow camera) and `onExit` (restore infantry camera) —
   mirror how the ground-vehicle adapters wire theirs.
2. Behavior test: enter → follow camera engaged with the adapter's computed
   third-person pose; exit → infantry camera restored.

## Non-goals

- Re-enabling boat spawns or any water/hydrology work (deferred to a future
  terrain/world-gen cycle per the 2026-06-09 scorch).
- Camera tuning of `computeThirdPersonCamera` itself.
- Other adapters' cameras.

## Acceptance

- [ ] Test above passes; on master the follow camera is provably never engaged
      for watercraft (state the repro in your report).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Dependencies

- Depends on: `vehicle-player-position-sync` (same-file adjacency —
  rebase on its merge).
