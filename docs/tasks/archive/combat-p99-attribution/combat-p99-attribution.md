<!-- 80 LOC cap. Spike: docs/rearch/COMBAT_AI_P99_SPIKE_2026-06-03.md -->
# combat-p99-attribution

Advances DEFEKT-3. The spike found the cover search is NOT the p99 driver —
`CoverSpatialGrid` is wired + triple-capped + already timed. The real tail is NPC
terrain-stall oscillation in `CombatantMovement`, and the bad frame is a
superposition (Combat +2.0 / render-Other +2.9 per `state/perf-trust.md`), so no
combat fix alone guarantees ≤35ms. This cycle PROVES where the tail is and pulls
the one built-but-disabled combat lever. Honest outcome: likely SPLIT DEFEKT-3
into a movement-stall follow-up rather than certify ≤35ms on a contended box.
Spike: `docs/rearch/COMBAT_AI_P99_SPIKE_2026-06-03.md`.

## Scope decision (owner, 2026-06-03)

- Flip `crowdStallStaggerEnabled` (`CombatantConfig.ts:97`) default ON for the p99
  benefit. This changes crowd behavior at chokepoints → gated on owner
  movement-feel playtest before close.

## Files touched (per spike)

- `scripts/perf-capture.ts` (tail attribution from `combatBreakdown`)
- `src/.../SystemUpdater.ts` / combat method timers (per-method attribution)
- `src/.../CombatantMovement.ts` (contour height-sample dedupe)
- `src/.../CombatantConfig.ts` (stagger default ON)
- `*.test.ts` (microbench + determinism)

## R1 (parallel)

1. `combat-p99-tail-attribution` — per-method tail attribution from a single run's `combatBreakdown`.
2. `cover-search-cost-microbench` — deterministic proof cover-search timers ≈0.
3. `contour-height-sample-dedupe` — dedupe the uncached per-tick contour rescore hotspot.

## R2

4. `crowd-stall-stagger-enable` — flip default ON (dep: attribution shows the lever helps);
   strict determinism + DEFEKT-4 route-quality regression coverage.
5. `combat120-quiet-certification` — measurement-protocol doc + quiet-box capture (carries STABILIZAT-1 framing).

## Non-goals

- No fenced-interface change. `CoverSpatialGrid` consumes `ITerrainRuntime.raycastTerrain`
  as-is; keep height-memoization consumer-side (do NOT add a batched terrain-sample
  method to the fence).
- No rewrite of the DEFEKT-4 movement solver beyond the stagger flag + height dedupe.

## Acceptance

- [ ] Tail attribution + microbench prove where the time goes (cover ≈0); contour dedupe
      lands with determinism tests.
- [ ] `crowdStallStaggerEnabled` default ON with A/B p99 delta recorded; DEFEKT-3 either
      advances toward ≤35ms or is SPLIT with a named movement-stall follow-up directive.
- [ ] `npm run lint && npm run test:run && npm run build` green. Owner movement-feel
      playtest — deferred to `docs/PLAYTEST_PENDING.md`.
