<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 3) -->
# asset-reroll-requests

Documentation-only task: keep the re-roll request ledger truthful after the
2026-06-28 walk. **The UH-1 Huey + A-1 Skyraider re-rolls are ALREADY DONE** —
the owner re-rolled them in Kiln; they are imported, wired, and gallery-verified
(commit `f8c3518c`). This task records that completion and files any NEW re-roll
specs surfaced, so the ledger reflects reality. **No art generation** (Kiln/human
step). No code.

## Files touched

- `docs/asset-provenance/repaint-2026-06/REROLL_REQUESTS.md`

## Scope

1. Mark the **UH-1 Huey** and **A-1 Skyraider** entries DONE (re-rolled,
   imported, wired, gallery-verified 2026-06-28, `f8c3518c`) — do NOT re-request
   them.
2. Note that the **coconut-palm re-center** is being handled in-cycle by
   `coconut-card-crossfade` (LOD pop) — not an art re-roll.
3. File any genuinely NEW re-roll specs the campaign surfaced (e.g. the B-52D
   fuselage aspect advisory, the A-37 scale advisory) as clear, actionable rows
   for the owner's next Kiln pass — each with the asset id + the specific defect.

## Non-goals

- Generating or importing any art (human Kiln step).
- The structure GLB re-import (that is `structure-import-corruption-fix`, an
  importer fix, not a re-roll).
- Touching code or the catalog.

## Acceptance

- [ ] `REROLL_REQUESTS.md` shows UH-1 + A-1 as DONE (not pending) and lists any
      new re-roll specs with asset id + defect.
- [ ] No source/code/test changes (doc-only); `npm run lint` still green.
- [ ] PR linking this brief.

## Dependencies

- Root (no blockers). No reviewer (doc only).
