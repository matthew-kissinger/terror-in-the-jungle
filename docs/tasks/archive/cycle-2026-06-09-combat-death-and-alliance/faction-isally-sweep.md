# faction-isally-sweep

Several combat/world systems compare raw faction equality instead of the
canonical `isAlly` helper, so faction-alliance semantics silently diverge:
suppression counts allied near-misses as hostile, cluster spacing groups
enemies, and zone ownership checks misread allies. Sweep them onto `isAlly`.
(Campaign: `docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 3.)

## Files touched

- `src/systems/combat/CombatantSuppression.ts` (trackNearMisses)
- `src/systems/combat/ClusterManager.ts` (spacing/cluster grouping)
- `src/systems/world/ZoneCaptureLogic.ts` (owner checks)
- sibling behavior tests (extended)

## Scope

1. Replace raw faction-equality comparisons with the canonical `isAlly`
   helper in the three call sites above (find the helper the rest of combat
   uses — do not invent a new one).
2. Behavior test per site: an allied-but-different-faction pair is treated
   as allied (no suppression from ally near-miss; clustered with allies;
   zone ownership respects alliance).

## Non-goals

- Changing what factions ARE allied (alliance table stays as-is).
- The death pipeline (combat-death-unification owns those files).
- IFF for vehicle/air weapons (already landed in prior cycles).

## Acceptance

- [ ] Tests above pass; at least one fails on master demonstrating the
      raw-equality misread (state which in your report).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
- [ ] combat-reviewer signs off pre-merge.
