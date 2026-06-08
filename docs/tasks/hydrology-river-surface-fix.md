<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# hydrology-river-surface-fix

Superseded for planning by
`docs/tasks/terrain-vehicle-water-foundation-reset.md`. The owner provided
concrete defects on 2026-06-07: rivers cut off by terrain, stamp-created
trenches/high walls, and water reading as a raised ribbon. Treat that as a
foundation reset, not a one-off surface-height polish pass.

Originally closed the owner-reported "there are still issues with hydrology."
The terrain-compositor cycle closed 2026-05-27 claiming to fix OF "water on
walls"; the owner has now rejected the abstraction itself. Keep this brief only
as a narrow child if the reset still needs `WatercraftPhysics.isUnderBridge`.

2026-06-07 R1/R2 note: local runtime proof briefly improved hydrology
mesh/query diagnostics, but owner feedback rejected the terrain-following
surface model. Open Frontier and A Shau now move accepted gameplay water to
authored level/depth basin bodies (`water_body` samples, carved bathymetry
stamps, filled `level-depth-water-bodies` mesh). Keep hydrology as
drainage/material input or as a narrow child for bridge-clearance work, not as
the close criterion.

## Files touched (provisional - confirm at Wave 0)

- `src/systems/environment/water/HydrologyRiverSurface.ts`
- `src/systems/terrain/compositor/**` (if the defect is compose-side)
- `src/systems/vehicle/WatercraftPhysics.ts` (`isUnderBridge`)
- sibling `*.test.ts`

## Scope

1. Characterize the concrete 2026-06-07 defects with repro poses: terrain
   cutoffs, trench/wall banks, and ribbon water.
2. Implement `WatercraftPhysics.isUnderBridge` (currently a stub) so watercraft
   clearance under bridges is correct.

## Non-goals

- Re-running the full terrain-compositor design (only fix the observed defect).
- CDLOD / skirts / edge-morph rework.
- Replacing the new level/depth water-body authority.

## Acceptance

- [ ] The observed defect no longer reproduces on the Wave 0 repro pose.
- [ ] A Shau hydrology unchanged (regression sentinel).
- [ ] `isUnderBridge` returns correct state with a covering test.
- [ ] `terrain-nav-reviewer` APPROVE; water/combat capture within +5%.
- [ ] `npm run lint && npm run test:run && npm run build` pass.

## Round 2 / Dependencies

- Reviewer: `terrain-nav-reviewer` (terrain/water path).
- Scope gated on the orchestrator's Wave 0 walk; see cycle brief Wave 0.
