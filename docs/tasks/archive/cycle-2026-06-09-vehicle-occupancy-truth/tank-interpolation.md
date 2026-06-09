# tank-interpolation

`Tank.update` renders the raw fixed-step physics pose, so the M48 visually
jitters at refresh rates above the fixed step — the same defect class as the
helicopter chase-cam jitter fixed on 2026-06-09 (`8e99caac`). This task adds
render-time interpolation to the tracked-vehicle physics. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 2.)

## Files touched

- `src/systems/vehicle/TrackedVehiclePhysics.ts`
- `src/systems/vehicle/Tank.ts`
- sibling behavior tests (extended)

## Scope

1. Add `getInterpolatedState()` to TrackedVehiclePhysics: blends previous and
   current fixed-step pose by the render-frame alpha (match the pattern the
   helicopter/fixed-wing physics already use — check how they expose it).
2. Use the interpolated state in `Tank.update` for the rendered
   position/orientation; physics state itself stays fixed-step.
3. Behavior test: with a fixed-step accumulator mid-step, the rendered pose
   lies between the previous and current physics poses (alpha blend), not
   snapped to the latest step.

## Non-goals

- Changing the fixed-step simulation rate or physics behavior.
- Wheel/track animation rework.
- Helicopter/fixed-wing/watercraft interpolation (already correct or owned
  elsewhere).

## Acceptance

- [ ] Test above passes; raw-pose rendering (the jitter signature) fails it
      on master before the fix.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Dependencies

- None (root task). Owner 120Hz feel-walk lands in PLAYTEST_PENDING at phase
  close (no 120Hz display in the loop here).
