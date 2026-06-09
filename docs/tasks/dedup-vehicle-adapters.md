# dedup-vehicle-adapters

The player vehicle adapters (ground, tank, watercraft, emplacement, heli,
fixed-wing — under `src/systems/vehicle/`) duplicate ~300 deletable lines:
flight-bookkeeping clears, view-angle save/restore, HUD context push/pop, and
WASD axis reads. Now that Phases 2 and 4 stabilized this code, extract a
BaseVehicleAdapter / shared helpers. Runs AFTER delete-orphan-modules so the
surviving adapter set is known. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 5.)

## Files touched

- the surviving `*PlayerAdapter.ts` files under `src/systems/vehicle/`
  (+ `TankGunnerAdapter.ts` if it survived delete-orphan-modules)
- new base/helper module under `src/systems/vehicle/`
- sibling tests (must keep passing unchanged where possible)

## Scope

1. Extract shared helpers (or a BaseVehicleAdapter) for: flight-bookkeeping
   clear, infantry view-angle save/restore, HUD vehicle-context enter/exit,
   WASD/space axis reads. Behavior byte-identical — this is a deletion
   refactor, not a redesign.
2. Collapse the adapters onto the shared code; target ~300 lines net deleted
   across the adapters (report actual).
3. Existing adapter behavior tests (SeatedMouseFire, seat lifecycle, position
   sync, watercraft camera, board-five-types integration) must pass
   UNCHANGED — they are the safety net proving the refactor is behavioral
   no-op. Do not rewrite them to fit the refactor.

## Non-goals

- Behavior changes of any kind (exit positions, camera, fire paths).
- The IVehicle side (vehicle models/physics).
- The Escape-exit detach-hook asymmetry noted by the Phase 2 reviewer —
  if the refactor makes unifying it trivial and test-provable, you may
  include it; otherwise leave it and note it.

## Acceptance

- [ ] Existing vehicle tests pass without modification (list any that needed
      changes and justify each — mock-shape-only changes acceptable).
- [ ] Net adapter LOC reduction reported.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
