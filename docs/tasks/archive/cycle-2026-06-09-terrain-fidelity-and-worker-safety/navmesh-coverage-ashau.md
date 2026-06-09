# navmesh-coverage-ashau

A Shau navmesh coverage is anchor-window-only, so NPCs outside the covered
window fall back to beeline movement on steep DEM terrain — a major
contributor to stuck-on-slope. The navmesh worker already supports offloaded
generation but is unused for tiled coverage, and A Shau has no prebaked
navmesh. Offload tiled generation and prebake A Shau. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 4. Depends on
`gameplay-heightmap-resolution` — bake against the corrected grid.)

## Files touched

- `src/systems/navigation/NavmeshSystem.ts`
- `scripts/prebake-navmesh.ts`
- sibling behavior tests (extended)

## Scope

1. Route tiled navmesh generation through the existing worker path (it
   exists, unused for tiled) so coverage extends beyond the anchor window
   without main-thread stalls.
2. Extend `scripts/prebake-navmesh.ts` to prebake A Shau tiles; assets follow
   the existing skip-if-exists convention.
3. Behavior test: a route query between two points outside the old anchor
   window (on prebaked A Shau tiles) returns a navmesh path, not a beeline
   fallback.
4. Report navmesh asset size delta and bake time.

## Non-goals

- Movement-solver/steering changes (campaign checkpoint decides after
  re-measure).
- Other maps' prebakes (conventions must keep working; only A Shau gets new
  tiles).
- Crowd re-enable (still disabled; out of scope).

## Acceptance

- [ ] Test above passes; the beeline-outside-window repro demonstrated on
      master first.
- [ ] `npm run lint && npm run test:run && npm run build` all pass; prebake
      script runs green for A Shau.
- [ ] PR opened against `master` with link to this brief.
- [ ] terrain-nav-reviewer signs off pre-merge.
