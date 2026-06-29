<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 4) -->
# sks-rifle-wiring

From the 2026-06-28 owner walk: the NVA wants a semi-auto rifle. The `sks` GLB is
already in the generated `warAssetCatalog` but unused — WIRING, not new art. Add
the SKS as a semi-auto OPFOR rifle option, reusing the rig-registry pattern that
`marksman-rifle-class` establishes. **Builds on `marksman-rifle-class`** (shared
`LoadoutWeapon`/rig registry) — rebase onto it; serialize the merge.

## Files touched

- `src/ui/loadout/LoadoutTypes.ts` (new `LoadoutWeapon` value + NVA/VC pool entry)
- `src/systems/weapons/GunplayCore.ts` (a `WeaponSpec` for the SKS)
- `src/systems/player/weapon/WeaponRigManager.ts` (rig art entry + load the new rig)
- `src/systems/assets/modelPaths.ts` (expose the SKS model path from the catalog, if not already)
- `*.test.ts` (new)

## Scope

1. Add an SKS `LoadoutWeapon` enum value to the `Faction.NVA` (and `Faction.VC`)
   pool `weapons` array; keep it off the BLUFOR pools.
2. Give it a `GunplayCore` `WeaponSpec` tuned as a semi-auto rifle: moderate
   `rpm` (capped, slower than full-auto AK), moderate damage, modest recoil —
   distinct from both the AK assault rifle and the marksman DMR.
3. Add the rig slot keyed off the cataloged `sks` slug, mirroring the
   `marksman-rifle-class` rig-registry change (same art-table + load pattern;
   warAssetCatalog is GENERATED — do not hand-edit).

## Non-goals

- New art / Kiln re-roll (the GLB exists).
- A real semi-auto fire-control system (low rpm conveys the cadence).
- BLUFOR availability; touching the Dragunov/marksman spec.

## Acceptance

- [ ] NVA can deploy the SKS; it loads the SKS rig; its spec reads distinct from
      the AK and the DMR. Behavior test asserts pool membership (NVA yes / US no)
      + the SKS spec differs from the AK and marksman specs.
- [ ] `npm run lint && npm run lint:budget && npm run test:run && npm run build` green.
- [ ] PR linking this brief; `combat-reviewer` if it touches `src/systems/combat/**`; owner walk → PLAYTEST_PENDING.

## Dependencies

- **Depends on `marksman-rifle-class`** (shared rig registry + `LoadoutWeapon`
  additions). Rebase onto its merge; serialize so the second rebases cleanly.
- Reviewer: `combat-reviewer` only if it touches `src/systems/combat/**` (likely not).
