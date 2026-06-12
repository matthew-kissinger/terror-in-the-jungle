# war-asset-import-pipeline

Foundation task of `cycle-2026-06-11-war-asset-repaint`. Brings the 108-asset
pixel-forge repaint package into TIJ through a generalized, idempotent import
pipeline instead of the package's blind `copy-to-tij.ps1` (do NOT run that
script). Required reading: `docs/rearch/WAR_ASSET_REPAINT_AUDIT_2026-06-11.md`
and the GLB policy section of `docs/ASSET_ACCEPTANCE_STANDARD.md`. Every other
task in this cycle consumes this task's outputs.

## Files touched

- `scripts/import-war-catalog.ts` (new; generalize patterns from
  `scripts/import-pixel-forge-aircraft.ts` — axis-wrap node, provenance,
  structural read)
- `scripts/asset-import/rig-grafts.json` (new; per-slug joint-graft + node
  metadata specs)
- `package.json` (`assets:import-war-catalog` script)
- `src/config/generated/warAssetCatalog.ts` (generated output; no SPDX header
  — generated files are exempt per relicense policy)
- `src/systems/assets/modelPaths.ts` (becomes re-export of the generated
  catalog; existing exported names must keep compiling — single writer rule:
  only THIS task edits modelPaths this cycle)
- `public/models/**` (normalized GLBs; new `public/models/animals/`)
- `docs/asset-provenance/repaint-2026-06/` (new; import records + REROLL_REQUESTS.md)
- `docs/ASSET_MANIFEST.md`, `public/models/UPDATED_MODELS.md` (regenerate or
  retire — verify current content first)

## Scope

1. Importer reads the package dir (`--source`, default
   `C:\Users\Mattm\X\games-3d\pixel-forge\war-assets\_repaint-2026-06`) + its
   `manifest.json`; per-class axis wrap per the audit memo conventions table
   (weapons/aircraft/buildings/structures/props/animals +X→+Z, ground vehicles
   +X→−Z) using the proven quaternion-wrap-node pattern; measures world bbox
   (decode positions from buffers when accessor min/max missing — artillery-pit),
   tris, materials, minY.
2. Joint grafts from `rig-grafts.json`: m48 `Joint_Turret` (turret/cupola/MG/
   searchlight meshes) + `Joint_MainGun` (Mesh_Barrel/BoreEvacuator/
   MuzzleBrake*); canonical `Joint_MainRotor`/`Joint_TailRotor` on uh1/uh1c/ah1
   and `Joint_Propeller*` on a1/ac47/oh6 etc. (reparent hub+blade meshes, pivot
   at hub bounds-center); per-weapon `magazineNodes`/`muzzleNodes` metadata
   (m16: Mesh_MagSeg1-3 + Mesh_MagFloor + decals; verify each weapon from node
   dump). Record grafted joints + spin axes in the catalog.
3. Budget triage per the audit policy → status PASS / EXCEPTION / REJECT per
   asset. REJECTs keep the current GLB on disk and get a REROLL_REQUESTS.md
   entry (reason + target budget). Expected reject set is in the memo; if
   measurement disagrees, follow measurement and say so in the PR.
4. Emit `warAssetCatalog.ts`: per-slug `{ class, path, forward, dims, tris,
   sizeKB, materials, budgetStatus, joints?, magazineNodes?, muzzleNodes? }` +
   class-grouped path constants; rewrite `modelPaths.ts` as a compatible
   re-export. Keep the generated file within `lint:budget` rules (add a
   generated-file exemption in `scripts/lint-source-budget.ts` if needed).
5. Run the import; commit normalized GLBs + provenance records (provider,
   model, source ts, hand-edit notes carried from source `.provenance.json`,
   applied normalization, graft summary) into
   `docs/asset-provenance/repaint-2026-06/`.

## Non-goals

- No runtime/loader code changes (cutover tasks own those). No placement
  profile edits. No deletion of `PixelForgePropCatalog.ts` (known dead code,
  out of scope). No re-roll of rejected assets (pixel-forge side owns that).

## Acceptance

- [ ] `npm run assets:import-war-catalog` is idempotent (second run: zero
      byte-level diffs) and prints a per-asset table (slug, axis applied,
      dims, tris, status).
- [ ] 100 GLBs normalized into `public/models/` (108 minus expected rejects),
      `models/animals/` exists; rejected slugs verifiably keep prior bytes.
- [ ] Spot-proof in PR: post-import m48 is Z-long with `Joint_Turret`/
      `Joint_MainGun` present; m16a1 is Z-long with magazine metadata; uh1c has
      canonical rotor joints.
- [ ] `npm run typecheck && npm run lint && npm run test:run && npm run build`
      green; knip clean (catalog consumed via modelPaths re-export).
- [ ] PR opened against `master` linking this brief + the audit memo.

## Round 2 / Dependencies

- Blocks: every other task in this cycle (R2/R3 dispatch waits for merge).
