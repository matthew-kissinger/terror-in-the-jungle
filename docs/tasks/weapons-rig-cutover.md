# weapons-rig-cutover

Cut the first-person rig, NPC third-person weapons, and the M2HB emplacement
visual over to the normalized repaint weapon GLBs (9 replacements). The user
sees the new weapon models in-hand, on NPCs, and on emplacements with reload/
muzzle behavior intact. Part of `cycle-2026-06-11-war-asset-repaint`; read
`docs/rearch/WAR_ASSET_REPAINT_AUDIT_2026-06-11.md` (breaks #1, #4) first.

## Files touched

- `src/systems/player/weapon/WeaponRigManager.ts`
- `src/systems/combat/PixelForgeNpcRuntime.ts`
- `src/systems/combat/CombatantRenderer.ts` (only if socket plumbing requires)
- M2HB emplacement visual + jeep/PBR mount offsets (locate via
  `VehicleManager` M2HB spawn path; m2-browning dims roughly doubled)
- Sibling tests for changed `src/systems/**` files

## Scope

1. `WeaponRigManager`: keep the +Z-forward load rotation (importer normalized
   to +Z); replace the `'magazine'` substring search with catalog
   `magazineNodes` per weapon (`warAssetCatalog`); replace the muzzle-name
   priority list with catalog `muzzleNodes` (fallback: bbox max-Z marker as
   today). Verify per-weapon view scale factors (1.5/1.7) against measured
   real-scale dims — lengths are near-identical to old, so expect no change,
   but verify on-screen.
2. Reload animation: magazine group must contain exactly the catalog magazine
   nodes (m16: MagSeg1-3+MagFloor+decals; NOT Mesh_Magwell). Verify visually
   for all 7 first-person weapons (m16a1, ak47, ithaca37, m3-grease-gun,
   m1911, m60, m79).
3. `PixelForgeNpcRuntime`: re-derive m16a1/ak47 grip/support/muzzle/stock node
   lists + pitch trim + forward hold offset for the new node vocabularies; NPC
   hold must read correctly at close range.
4. M2HB: re-seat emplacement/mount visual for the ~2x-larger m2-browning
   (tripod now in-model — check double-tripod with the emplacement base);
   barrel muzzle/tracer origin from catalog muzzleNodes.
5. RPG7/M79 projectile spawn origins re-verified (muzzle node rename).

## Non-goals

- No new weapons (m14/sks/dragunov/rpd/kbar/claymore-clicker are catalog-only
  this cycle; loadout wiring is a deferred follow-up cycle).
- No ballistics/tuning changes; no `LoadoutTypes.ts` changes; no fence files.

## Acceptance

- [ ] In-game screenshot per first-person weapon (7) + one NPC close-model
      holding m16a1 and one holding ak47 + one manned M2HB emplacement, all
      correctly oriented/scaled, committed to
      `artifacts/cycle-war-asset-repaint/weapons/`.
- [ ] Reload visibly moves only the magazine on all 7 (note per weapon in PR).
- [ ] `npm run check:visual-integrity` passes.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR opened against `master`; combat-reviewer gate applies
      (`src/systems/combat/**` touched).

## Round 2 / Dependencies

- Depends on: `war-asset-import-pipeline`.
