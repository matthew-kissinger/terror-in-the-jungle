# bvh-rebuild-double-buffer

TerrainRaycastRuntime rebuilds its positionBuffer in place, so LOS/raycast
queries issued mid-rebuild can read a hybrid of old and new triangles —
intermittently wrong fire-authority and AI LOS answers near terrain streaming
events. Double-buffer the rebuild so queries always see a consistent
snapshot. (Campaign: `docs/CAMPAIGN_2026-06-09-consultation-remediation.md`,
Phase 4.)

## Files touched

- `src/systems/terrain/TerrainRaycastRuntime.ts`
- sibling behavior test (new or extended)

## Scope

1. Double-buffer `positionBuffer` (write into the back buffer; atomically
   swap on rebuild completion). Queries during a rebuild read the last
   complete snapshot.
2. Behavior test: a raycast issued while a rebuild is mid-flight returns the
   same answer as against the pre-rebuild snapshot (never a hybrid); after
   swap, queries see the new geometry.

## Non-goals

- Raycast API or semantics changes (same results, just consistent).
- BVH build performance work beyond the buffering.
- DEFEKT-6 fire-authority investigation (this removes one suspect; the
  directive stays open).

## Acceptance

- [ ] Test above passes; the hybrid-read hazard demonstrated (or shown
      structurally reachable) on master first.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] Memory delta reported (second buffer cost).
- [ ] PR opened against `master` with link to this brief.
- [ ] terrain-nav-reviewer signs off pre-merge.
