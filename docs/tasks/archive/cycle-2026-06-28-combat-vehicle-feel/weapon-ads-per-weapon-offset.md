<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 2) -->
# weapon-ads-per-weapon-offset

Feel/occlusion bug from the 2026-06-28 owner playtest: aiming down sights with
the bulky M60 puts the weapon body across the sight line — the single global ADS
offset (`adsPosition` ≈ `y:-0.44`) was hand-tuned for the M16 and does not suit
the taller/longer guns. This adds a per-weapon ADS offset so each gun's sight
line is clear when aiming. **Cross-phase: this shares `WeaponAnimations` /
`WeaponRigManager` with Phase 4's marksman/SKS work — keep the change additive
and localized so Phase 4 rebases cleanly.**

## Files touched

- `src/systems/player/weapon/WeaponAnimations.ts` (~line 46 — ADS offset source)
- `src/systems/player/weapon/WeaponModel.ts` (per-weapon offset plumbing)
- `src/systems/player/weapon/WeaponRigManager.ts` (per-weapon offset table/lookup)
- `*.test.ts` (assert per-weapon offsets resolve distinctly)

## Scope

1. Replace the single global ADS `adsPosition` with a per-weapon offset:
   keep the M16's current value as the default, add a clear, separate offset for
   the M60 (and any other gun whose sight is occluded) so the sight line is clear.
2. Resolve the offset by weapon id/type through the existing rig/animation path
   (no new system); fall back to the global default when a weapon has no override.
3. Do not change hip pose, recoil, or ADS timing — only the ADS *position* offset.

## Non-goals

- New weapons (that is Phase 4 `marksman-rifle-class` / `sks-rifle-wiring`).
- Retuning recoil/spread/RPM (GunplayCore) — offset only.
- Changing the global default for the M16 (it was correct).

## Acceptance

- [ ] A `WeaponAnimations`/`WeaponRigManager` test asserts distinct ADS offsets
      resolve per weapon (M16 default vs M60 override) and that an
      override-less weapon falls back to the default.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR opened against `master` linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- Root (no blockers). **Unblocks/serializes-with Phase 4** (shared
  `WeaponAnimations`/`WeaponRigManager`); Phase 4 merges rebase onto this.
