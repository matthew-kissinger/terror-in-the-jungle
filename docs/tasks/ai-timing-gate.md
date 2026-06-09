# ai-timing-gate

CombatantAI pays diagnostic overhead on every tick in production:
`withAiMethodTiming` wrappers + a per-update `{...methodMs}` object spread,
per-tick lambda allocations in `updateAI`, and
`computeDynamicIntervalMsFromDistanceSq` re-deriving `estimateGPUTier` /
`isMobileGPU` / `getWorldSize` per call. Gate diagnostics behind the
perf-diagnostics flag and hoist the per-tick work — this is the cycle's
measurable combat120 lever. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 3.)

## Files touched

- `src/systems/combat/CombatantAI.ts`
- `src/systems/combat/CombatantLODManager.ts`
- sibling behavior tests (extended)

## Scope

1. Gate `withAiMethodTiming` and the per-update `{...methodMs}` spread behind
   the existing perf-diagnostics flag (find the flag the perf harness sets;
   default OFF in prod). Diagnostics output must be unchanged when ON.
2. Hoist per-tick lambda allocations out of `CombatantAI.updateAI` (member
   closures or static helpers — allocation-free steady-state ticks).
3. Cache `estimateGPUTier` / `isMobileGPU` / `getWorldSize` results out of
   `computeDynamicIntervalMsFromDistanceSq` (compute once / on-change, not
   per call).
4. Behavior test: with diagnostics OFF, no timing wrapper executes and AI
   decisions are byte-identical; with ON, methodMs still populates.

## Non-goals

- AI behavior/decision changes (intervals produce the same values, just
  cached).
- The death pipeline (combat-death-unification shares CombatantLODManager —
  merges serialized, expect a rebase).
- perf-capture harness changes.

## Acceptance

- [ ] Tests above pass.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
- [ ] combat-reviewer signs off pre-merge.
