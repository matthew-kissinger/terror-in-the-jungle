<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# hydrology-river-surface-fix

Closes the owner-reported "there are still issues with hydrology." The
terrain-compositor cycle closed 2026-05-27 claiming to fix OF "water on walls";
the owner still sees a hydrology defect. SCOPE IS WAVE-0-PENDING: the
orchestrator drives the build, characterizes the exact defect (compositor fix
fell short vs a different bug), and fills Scope item 1 below before dispatch.
Also implements the `WatercraftPhysics.isUnderBridge` stub.

## Files touched (provisional - confirm at Wave 0)

- `src/systems/environment/water/HydrologyRiverSurface.ts`
- `src/systems/terrain/compositor/**` (if the defect is compose-side)
- `src/systems/vehicle/WatercraftPhysics.ts` (`isUnderBridge`)
- sibling `*.test.ts`

## Scope

1. (WAVE-0-PENDING) Fix the specific hydrology defect the orchestrator observes;
   written here after the Wave 0 walk. DO NOT DISPATCH until this bullet names a
   concrete, observed defect + a repro pose.
2. Implement `WatercraftPhysics.isUnderBridge` (currently a stub) so watercraft
   clearance under bridges is correct.

## Non-goals

- Re-running the full terrain-compositor design (only fix the observed defect).
- CDLOD / skirts / edge-morph rework.
- A Shau changes (regression sentinel; must stay NO-OP).

## Acceptance

- [ ] The observed defect no longer reproduces on the Wave 0 repro pose.
- [ ] A Shau hydrology unchanged (regression sentinel).
- [ ] `isUnderBridge` returns correct state with a covering test.
- [ ] `terrain-nav-reviewer` APPROVE; water/combat capture within +5%.
- [ ] `npm run lint && npm run test:run && npm run build` pass.

## Round 2 / Dependencies

- Reviewer: `terrain-nav-reviewer` (terrain/water path).
- Scope gated on the orchestrator's Wave 0 walk; see cycle brief Wave 0.
