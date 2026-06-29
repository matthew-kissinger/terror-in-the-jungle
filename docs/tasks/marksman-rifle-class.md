<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 4) -->
# marksman-rifle-class

From the 2026-06-28 owner walk: the NVA has no long-range/marksman option. The
`dragunov-svd` GLB is already in the generated `warAssetCatalog` but unused — this
is WIRING a new weapon class, not new art. Add a marksman/DMR `LoadoutWeapon`
(higher damage, optical zoom, slower RPM) available to OPFOR (NVA/VC), using the
cataloged Dragunov GLB. **Cross-phase note:** the per-weapon ADS-offset table from
Phase 2 (`weapon-ads-per-weapon-offset`, already merged) is the pattern to EXTEND
for this weapon's offset + zoom — do not duplicate it.

## Files touched

- `src/ui/loadout/LoadoutTypes.ts` (new `LoadoutWeapon` value + NVA/VC pool entry + a preset)
- `src/systems/weapons/GunplayCore.ts` (a `WeaponSpec` for the marksman)
- `src/systems/player/weapon/WeaponRigManager.ts` (rig art entry + load the new rig)
- `src/systems/player/weapon/WeaponAnimations.ts` (per-weapon ADS offset + deeper optical zoom)
- `src/systems/assets/modelPaths.ts` (expose the Dragunov model path from the catalog, if not already)
- `*.test.ts` (new)

## Scope

1. Add a marksman/DMR `LoadoutWeapon` enum value and add it to the `Faction.NVA`
   (and `Faction.VC`) pool `weapons` array + one preset; keep it OFF the
   BLUFOR (US/ARVN) pools.
2. Give it a `GunplayCore` `WeaponSpec`: slower `rpm`, higher `damageNear/Far`,
   tighter `baseSpreadDeg`/`bloomPerShotDeg` than the assault rifle (a precise,
   slow cadence — semi-auto feel via low rpm, NOT a new fire-control system).
3. Add the rig slot in `WeaponRigManager` keyed off the cataloged `dragunov-svd`
   slug (mirror the existing `legacy`/`kiln` art-table + `prepareWeaponRig` +
   Promise.all load pattern; the warAssetCatalog is GENERATED — do not hand-edit).
4. Extend the Phase-2 per-weapon ADS-offset table in `WeaponAnimations` with the
   DMR's offset AND a deeper optical zoom (tighter ADS FOV than the shared
   `baseFOV/1.3`) — the "scope" feel. Keep other weapons unchanged.

## Non-goals

- New art / Kiln re-roll (the GLB exists).
- A real scope overlay/picture-in-picture, bullet drop, or a new fire-control
  mode — FOV zoom + spec tuning only.
- BLUFOR marksman, or touching `sks` (that is `sks-rifle-wiring`).

## Acceptance

- [ ] NVA can deploy the marksman; it loads the Dragunov rig; ADS zooms tighter
      and the spec reads slower-RPM/higher-damage than the rifle. Behavior test
      asserts the pool membership (NVA yes / US no) + the spec deltas + the
      per-weapon ADS values resolve distinct from the rifle default.
- [ ] `npm run lint && npm run lint:budget && npm run test:run && npm run build` green.
- [ ] PR linking this brief; `combat-reviewer` if the diff touches `src/systems/combat/**`; owner walk → PLAYTEST_PENDING.

## Dependencies

- Root. **Blocks `sks-rifle-wiring`** (shared rig registry — serialize the merges).
- Reviewer: `combat-reviewer` only if it touches `src/systems/combat/**` (likely not — weapon/loadout scope).
