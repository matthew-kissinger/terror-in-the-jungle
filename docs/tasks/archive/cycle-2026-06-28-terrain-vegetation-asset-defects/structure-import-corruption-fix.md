<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 3) -->
# structure-import-corruption-fix

From the 2026-06-28 owner playtest + asset audit: two legacy structure GLBs read
as corrupted in-world. Prime suspects: `barracks-tent.glb` (jumbled mesh — a
likely double importer transform) and `aid-station.glb` (missing the left-roof
submesh). Re-import them cleanly through the war-catalog importer and confirm via
the `/gallery` dev route.

## Files touched

- `scripts/import-war-catalog.ts` (only if a real importer defect is found — see below)
- `public/models/structures/barracks-tent.glb`, `aid-station.glb` (re-imported outputs)
- `*.test.ts` (structural validation if the importer is touched)

## Scope

1. Diagnose each GLB: inspect node/transform structure and submeshes (the prior
   repaint cycle hit mixed-indexing + double-transform classes of importer bug —
   check for those first). Use the no-deps JSON-chunk inspection method, not a
   new dependency.
2. If the corruption is in the SOURCE asset, re-import it cleanly (idempotent
   importer run) and commit the corrected GLB. If it is an IMPORTER defect (e.g.
   a double transform applied to tents), fix the importer and re-import — and add
   a structural test so the class can't regress.
3. Verify both structures render correctly on `/gallery` (orientation, complete
   submeshes, no jumble).

## Non-goals

- Re-rolling/regenerating art in Kiln (that is a human step; see `asset-reroll-requests`).
- Touching non-corrupted structures or the world placements.
- Aircraft/vehicle/vegetation assets.

## Acceptance

- [ ] `barracks-tent.glb` renders un-jumbled and `aid-station.glb` has its full
      roof on `/gallery` (note the before/after in the PR; gallery is the gate).
- [ ] If the importer was changed, a structural test guards the fixed class.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- Root (no blockers). No reviewer (importer + assets, not combat/terrain/nav).
