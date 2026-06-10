# delete-orphan-modules

Known-orphaned modules ship in the repo (some in the bundle): the
Konveyer compute spike directory under src rendering (KonveyerComputeCarrier,
KonveyerInstancedSlice + tests), `TerrainWorkerPool.generateChunk` + the
worker 'generate' branch (zero prod callers, confirmed in #353's review),
unwired probe scripts, and the knip.ignore ledger entries that exist only to
paper over them (PixelForgePropCatalog.ts, NpcM2HBAdapter.ts, audit-archive
scripts). Delete what is verifiably dead and shrink the knip.ignore list.
(Campaign: `docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 5 —
the large retired-code-deletion kind allowed past the 400-net rule.)

## Files touched

- `src/rendering/Konveyer*.ts(.test.ts)` (delete)
- `src/systems/terrain/TerrainWorkerPool.ts` + `src/workers/terrain.worker.ts`
  (generateChunk + 'generate' branch)
- orphans currently in `package.json` knip.ignore (verify each, delete dead
  ones, remove their ignore entries)
- `scripts/` unwired probe scripts listed in knip.ignore (delete)

## Scope

1. For EACH candidate: verify zero prod references (grep + knip) BEFORE
   deleting. If a candidate turns out to be referenced (e.g.
   `TankGunnerAdapter` — it was touched by Phase 1/2 work and is exercised by
   seated-fire tests — or `NpcM2HBAdapter`), KEEP it and say so in the report.
   The consultation's orphan list is a lead, not a verdict.
2. Delete the verified-dead modules + their tests + their knip.ignore entries.
3. Run `npm run knip:ci` after — it must pass with a strictly smaller ignore
   list.

## Non-goals

- Deleting anything reachable from prod or referenced by live tests.
- The mockups (prune-prod-mockups owns those) and water remnants
  (purge-water-remnants owns those).
- E-track spike tags / archived docs.

## Acceptance

- [ ] Per-candidate verdict table in the PR (deleted vs kept-with-reason).
- [ ] `npm run knip:ci` passes with a smaller ignore list.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief; net LOC deleted
      reported.
