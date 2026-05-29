<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# cover-grid-wiring

Closes a "not fully implemented" gap and chips at DEFEKT-3 (combat AI p99
~34ms). `CoverSpatialGrid` offers an O(1) cover query, but production never
injects it: only tests call `AIStateEngage.setCoverGridQuery`, so prod combat
falls back to the synchronous 2-search-cap scan. Wire the O(1) grid into the
production combat init path so engaged NPCs query the grid instead of scanning.

## Files touched

- `src/systems/combat/ai/AIStateEngage.ts` (consume injected grid query in prod)
- the production combat init/wiring site that constructs `AIStateEngage`
  (executor locates; inject `setCoverGridQuery` there)
- `src/systems/combat/**` cover-grid construction/update as needed
- sibling `*.test.ts` updates

## Scope

1. Construct + update the `CoverSpatialGrid` in the production combat path and
   inject its query via `setCoverGridQuery` (today only tests do this).
2. Route engaged-state cover selection through the O(1) grid; keep the
   2-search scan only as an explicit fallback when the grid is absent.
3. Preserve cover-choice sanity; this changes WHICH cover NPCs pick.

## Non-goals

- Redesigning cover scoring / suppression logic.
- Async cover search or job-system work (DEFEKT-3 full fix is separate).
- Touching non-combat systems.

## Acceptance

- [ ] Prod init injects the grid query (a non-test `setCoverGridQuery` call
      exists); fallback path retained + tested.
- [ ] combat120 p99 NOT regressed >5% vs baseline (perf-analyst); improvement
      expected. Capture before/after.
- [ ] `combat-reviewer` APPROVE, explicitly on cover-choice equivalence/sanity.
- [ ] `npm run lint && npm run test:run && npm run build` pass.

## Round 2 / Dependencies

- Reviewer: `combat-reviewer` + perf-analyst (behavior + perf sensitive).
- Riskiest R1 task: ships a combat-behavior change under deferred playtest.
- If a fenced interface must change: STOP and surface.
