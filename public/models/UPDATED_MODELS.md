# Updated Models — RETIRED

This file logged ad-hoc GLB regenerations (last entry 2026-03-16: nine tower /
bunker / M60 fixes and a first six-animal batch). Every model it described has
since been superseded by the 2026-06 pixel-forge repaint, and its tri counts,
sizes, and the proposed-but-not-yet-real `AnimalModels` registry are all stale.

Authoritative sources now:

- **Runtime model registry** — `src/systems/assets/modelPaths.ts`, a re-export
  of the generated catalog `src/config/generated/warAssetCatalog.ts`
  (`npm run assets:import-war-catalog`). The catalog carries measured dims,
  tris, on-disk forward axis, budget triage status, and grafted rig joints per
  slug. `AnimalModels` is now a real generated export.
- **Per-asset import + provenance records** —
  `docs/asset-provenance/repaint-2026-06/` (one `<slug>.provenance.json` per
  shipped GLB plus `REROLL_REQUESTS.md` for the budget rejects).
- **Catalog summary + integration status** — `docs/ASSET_MANIFEST.md`.
- **Import-pipeline rationale (the five drop-in breaks the importer corrects:
  axis, deleted rig joints, deleted animations, node-vocab drift, budget
  blowouts)** — `docs/rearch/WAR_ASSET_REPAINT_AUDIT_2026-06-11.md`.

Do not hand-edit GLB path tables or re-add per-model change logs here; re-run
the importer and let the provenance records carry the change history.
