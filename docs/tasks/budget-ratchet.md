# budget-ratchet

`scripts/lint-source-budget.ts` grandfathers oversized files but lets them keep
growing — and some annotations are stale (e.g. CombatantRenderer noted at "219
methods" when it now has 78), so the lint understates real progress and cannot
catch backsliding. This task turns the grandfather list into a ratchet.
(Campaign: `docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 1;
blocks `ci-gate-consolidation` which makes `lint:budget` a blocking CI job.)

## Files touched

- `scripts/lint-source-budget.ts`
- sibling test for the ratchet logic (new, pure L1)

## Scope

1. Add a "no growth past grandfathered snapshot" rule: each grandfathered entry
   records its snapshot LOC/method-count; the lint FAILs if a grandfathered
   file exceeds its snapshot (shrinking updates are allowed/encouraged).
2. Refresh all stale grandfather annotations to current measured values
   (CombatantRenderer 219→78 methods is the known example; re-measure all).
3. Keep the existing ≤700 LOC / ≤50 public-method rule for non-grandfathered
   files unchanged.

## Non-goals

- Shrinking any grandfathered file (that is feature-cycle work, not lint work).
- Changing the budget thresholds themselves.
- Wiring the lint into CI — that is `ci-gate-consolidation`.

## Acceptance

- [ ] `npm run lint:budget` passes on current master (snapshot = current
      reality, zero FAILs).
- [ ] L1 test: a synthetic grandfathered entry over its snapshot FAILs; at or
      under its snapshot passes.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Dependencies

- Blocks: `ci-gate-consolidation` (CI can only gate on a lint that passes).
