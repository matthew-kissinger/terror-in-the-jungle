# Task: izone-query-fence

Last verified: 2026-05-09

Cycle: `cycle-2026-05-10-zone-manager-decoupling` (Phase 2, Round 1)

## Goal

Add `IZoneQuery` (read-only zone-state interface) to the fenced
interfaces in `src/types/SystemInterfaces.ts`. **This is an
`[interface-change]` PR** per `docs/INTERFACE_FENCE.md`.

## Why

The Phase 2 design memo establishes that ZoneManager's read surface is
heavily called from 11+ consumers. Migrating those consumers to a
read-only `IZoneQuery` reduces ZoneManager's fan-in from 52 to ≤20.

## Required reading first

- `docs/rearch/zone-manager-decoupling.md` (the design memo from `zone-manager-design-memo`)
- `src/types/SystemInterfaces.ts` (current fence)
- `docs/INTERFACE_FENCE.md` (PR convention — required marker, etc.)
- `src/systems/world/ZoneManager.ts` (to validate the IZoneQuery method shapes match real implementations)

## Files touched

### Modified

- `src/types/SystemInterfaces.ts` — add `IZoneQuery` interface, add it to the fence header comment list
- `src/systems/world/ZoneManager.ts` — `class ZoneManager implements IZoneQuery` (zero behavior change; just declare the implementation)
- `docs/INTERFACE_FENCE.md` — add `IZoneQuery` to the "What is fenced" section

## Steps

1. `npm ci --prefer-offline`.
2. Read the design memo. Note the proposed `IZoneQuery` shape.
3. Validate the shape against ZoneManager's actual public methods. Each method on `IZoneQuery` must already exist on ZoneManager with a compatible signature.
4. Add `IZoneQuery` to `src/types/SystemInterfaces.ts`. Place it in alphabetic order with the other fenced interfaces. JSDoc each method.
5. Make ZoneManager implement it: `export class ZoneManager implements IZoneQuery { ... }`. The compiler will complain if any method shape mismatches — fix only the shape, do not change behavior.
6. Add `IZoneQuery` to the listed fenced interfaces in `docs/INTERFACE_FENCE.md`.
7. Run `npm run check:fence -- --pr-title "[interface-change] feat(types): add IZoneQuery (izone-query-fence)"` — must pass once you commit with that title.
8. Run `npm run lint`, `npm run typecheck`, `npm run test:run` — all green.

## Verification

- `grep "IZoneQuery" src/types/SystemInterfaces.ts` — present
- `grep "implements.*IZoneQuery" src/systems/world/ZoneManager.ts` — present
- `npm run check:fence` — passes (commit subject must contain `[interface-change]`)
- `npm run typecheck` — clean
- `npm run test:run` — green

## Non-goals

- Do NOT migrate any consumer to use `IZoneQuery`. That's the batch tasks.
- Do NOT remove any method from ZoneManager. The interface is additive.
- Do NOT add methods to ZoneManager that aren't already there. If `IZoneQuery` requires a method ZoneManager doesn't have, the design memo was wrong — escalate.

## Branch + PR

- Branch: `task/izone-query-fence`
- Commit: `[interface-change] feat(types): add IZoneQuery read-only zone-state interface (izone-query-fence)`
- PR title same.
- PR description: cite the design memo path, list ZoneManager as the only implementer for now, note the migration plan (batches A/B/C in this same cycle).

## Reviewer

- terrain-nav-reviewer pre-merge (the `world/` boundary is closer to terrain than combat; either reviewer is fine, but Phase 0 rule maps it through terrain-nav-reviewer because ZoneManager is the world-state owner).
- HUMAN APPROVAL also required per `docs/INTERFACE_FENCE.md` for fence changes. The human is the campaign owner.

## Playtest required: no

## Estimated diff size

≤50 lines source. Within budget.
