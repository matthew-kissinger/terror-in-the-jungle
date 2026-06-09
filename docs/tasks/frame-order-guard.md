# frame-order-guard

The 2026-06-09 helicopter-jitter fix proved the SystemUpdater Vehicles-before-
Player order is load-bearing for high-refresh smoothness (`8e99caac`), but
nothing guards it — a reorder like `454c1fec` can silently reintroduce frame
desync. This task adds a behavior test locking the schedule. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 1.)

## Files touched

- `src/core/SystemUpdater.ts` (read; minimal exposure only if needed)
- `src/core/SystemUpdateSchedule.ts` (read)
- `src/core/SystemUpdateOrder.test.ts` (new)

## Scope

1. Test asserting the vehicle-phase systems (helicopterModel, vehicleManager,
   fixedWingModel) are NOT reachable via SystemUpdater's generic 'Other'
   update loop (i.e. they update exactly once, in the vehicle phase).
2. Test asserting `SYSTEM_UPDATE_SCHEDULE` order matches the actual imperative
   call order in `updateSystems` (vehicle phase before player phase).
3. If asserting this requires exposing internals, prefer a minimal readonly
   accessor or exported schedule constant over restructuring the updater.

## Non-goals

- Changing the update order itself (it is already correct post-`8e99caac`).
- Refactoring SystemUpdater's dispatch/telemetry machinery.
- Guarding phases other than the vehicle→player ordering and the
  'Other'-loop exclusion named above.

## Acceptance

- [ ] New test fails if a vehicle-phase system is added to the 'Other' loop or
      the vehicle/player phases are swapped (verify by temporary mutation
      locally, then revert).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Dependencies

- None (root task). No reviewer gate (core, not combat/terrain).
