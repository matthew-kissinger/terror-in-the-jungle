# asset-gallery-route

In-engine review surface for the full war-asset catalog. The owner reviews
repaint assets in-engine (orientation, scale vs a 1.8m human reference,
materials under the lighting rig) and uses it to flag re-rolls; the cycle uses
it as screenshot acceptance evidence; net-new assets with no gameplay consumer
yet (boats, transport aircraft, new weapons) become observable instead of dead
files. Part of `cycle-2026-06-11-war-asset-repaint`; read
`docs/rearch/WAR_ASSET_REPAINT_AUDIT_2026-06-11.md` first.

## Files touched

- `src/dev/assetGallery/AssetGalleryApp.ts` (+ siblings as needed, new)
- Entry wiring: follow the `/mockups/` route precedent (find how the UI
  bake-off route was exposed; mirror that mechanism — dev/perf builds only,
  not the retail path)
- `scripts/check-asset-gallery.ts` (new; Playwright per-asset screenshot pass)
- `package.json` (`check:asset-gallery`)
- `knip` config only if the route entry needs an ignore (knip.ignore is
  load-bearing — additive entry only)

## Scope

1. Gallery page enumerates `src/config/generated/warAssetCatalog.ts`
   (class-grouped list; click → load GLB via the shared `modelLoader`
   singleton). Orbit camera, neutral ground plane, 1.8m human-height reference
   post, forward-axis arrow gizmo (+Z, or −Z for ground vehicles per catalog
   `forward`).
2. Per-asset info chip: slug, class, dims, tris, sizeKB, materials,
   budgetStatus (EXCEPTION/REJECT visibly flagged), grafted joints. Assets
   with `budgetStatus: REJECT` still listed (load from package path is NOT
   required — render the flag + reason only).
3. `scripts/check-asset-gallery.ts`: headed/headless Playwright walk that
   screenshots every catalog asset to
   `artifacts/asset-gallery/<run-ts>/<class>/<slug>.png` and fails on console
   errors or missing meshes. This is the cycle's visual-evidence generator.
4. Joint sanity overlay: toggle that spins `Joint_MainRotor`/`Joint_TailRotor`/
   `Joint_Propeller*`/`Joint_Turret`/`Joint_MainGun` when present, so graft
   pivots are verifiable per-asset without flying the aircraft.

## Non-goals

- Not a runtime spawner in live game modes; no worldbuilder console changes.
- No retail-bundle exposure decisions beyond the /mockups precedent.
- No asset edits; render what the catalog says, flag what looks wrong.

## Acceptance

- [ ] Gallery loads every non-REJECT catalog asset with zero console errors;
      `npm run check:asset-gallery` produces the full screenshot set.
- [ ] Rotor/turret spin toggle visibly rotates grafted pivots on uh1-huey,
      uh1c-gunship, ah1-cobra, a1-skyraider, m48-patton (screenshot or short
      note per asset in PR).
- [ ] Orientation spot-check recorded in PR: command-tent and aid-station
      ridge axes + entrance direction (audit memo flags the package's own
      hand-fix notes as suspect here).
- [ ] `npm run lint && npm run test:run && npm run build` green; retail build
      does not grow by the gallery code path.
- [ ] PR opened against `master` with link to this brief.

## Round 2 / Dependencies

- Depends on: `war-asset-import-pipeline`.
