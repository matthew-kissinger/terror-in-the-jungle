# Playtest memo — cycle-2026-06-28-arsenal-expansion (Phase 4, Field Readiness)

> **Automated gates complete; owner feel-walk pending.** Closed under
> `posture: autonomous-loop` (CAMPAIGN_2026-06-28-field-readiness, Phase 4).
> Merged on CI green; perf A/B PASS. Phase 4 adds the NVA marksman + SKS the
> owner asked for (wiring cataloged GLBs, not new art) + makes the ammo-load a
> real tradeoff. The mechanics are unit-test-proven; the *feel* (weapon balance,
> the mag-tradeoff direction) is the owner's call.

## What shipped (3 PRs, all merged to master, all `fence_change: no`)

| Task | PR | Merge | Change |
|---|---|---|---|
| marksman-rifle-class | [#442](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/442) | `5a3508af` | new MARKSMAN/DMR runtime weapon type (OPFOR NVA/VC), Dragunov SVD rig, own GunplayCore spec, deeper ADS optical zoom |
| sks-rifle-wiring | [#443](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/443) | `0a60cad2` | new SKS semi-auto runtime weapon type (OPFOR NVA/VC), iron sights, spec between AK and DMR |
| ammo-load-tradeoff | [#441](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/441) | `5aa16198` | EXTENDED/HEAVY ammo loads now cost ADS-transition time (1.0/1.15/1.30) — no longer strictly better |

## Spec values (for the balance walk)

- **Marksman/DMR**: rpm 80 (vs rifle 700), damageNear/Far 75/55 (vs 34/24), falloff 40-120m, headshot ×2.2, baseSpread 0.18 / bloom 0.08 (vs 0.8/0.25), ADS FOV divisor 2.6 (vs shared 1.3), 10-round mag / 60 reserve.
- **SKS**: rpm 200 (semi-auto cadence, between AK 700 and DMR 80), damageNear/Far 45/32, recoil 0.95, baseSpread 0.45, falloff 30-90m, iron-sight ADS (1.3×), 10-round mag / 80 reserve.
- **Ammo-load handling penalty**: STANDARD 1.0 (unchanged) < EXTENDED 1.15 (~15% slower ADS) < HEAVY 1.30 (~30% slower ADS); reserve multiplier unchanged (1.0/1.5/2.0); magazine size unchanged.

## Automated evidence

- **Behavior tests** (not implementation-mirror) for both weapons (`MarksmanWeaponClass.test.ts`, `SksWeaponClass.test.ts`): NVA/VC pools include them / US+ARVN do not; each has a faction preset; spec deltas verified (marksman out-damages + slower than rifle; SKS sits between AK and marksman near AND far, slower than AK / faster than DMR); switching to the runtime type lands its core; per-weapon ADS values resolve distinct.
- **ammo-load** (`LoadoutTypes.ammoLoad.test.ts`, `WeaponAnimations.test.ts`, `LoadoutService.test.ts`): handling factor pure + monotonic (STD 1.0 < EXT < HVY), ADS provably slower under HEAVY, STANDARD unchanged, factor clamped ≥1.0 so a bad value can never speed ADS up.
- **combat120 perf A/B PASS** (same-machine, seed 2718): pre-Phase-4 `1b561ccd` steady-state p99 **33.60ms** → R1 `5a3508af` **34.45ms** (+2.53%) → full Phase-4 `0a60cad2` **31.65ms** (−5.80% vs baseline). Both rounds under the +5% HALT line. **Reachability:** both new weapons are OPFOR player-loadout-only; the ai_sandbox bot fires the default US rifle and never equips them — confirmed by flat renderer counters (program/geometry ceiling unchanged, no new weapon mesh enters the scene). The deltas are machine noise, not feature cost. Absolute numbers non-quiet-machine (`measurement_trust:warn`); A/B delta + reachability are the signal.

## What the owner should walk (live feel — the actual gate)

1. **Deploy as NVA** (OPFOR) and pick the **Marksman** preset: the Dragunov should equip, ADS should zoom deeper than the rifle, and it should hit hard + slow — a precision weapon, not a spray gun.
2. **Deploy as NVA** and pick the **SKS**: semi-auto cadence (faster than the DMR, slower than the AK), iron sights, moderate punch — does it feel like a distinct mid-tier rifle?
3. **Confirm BLUFOR (US/ARVN) does NOT see the marksman or SKS** in the armory.
4. **Ammo-load tradeoff**: equip EXTENDED then HEAVY and ADS — aim-down-sights should feel progressively slower vs STANDARD. **OWNER DECISION:** keep this tradeoff, retune the penalty, OR collapse the three loads to one. (The default added a downside; the collapse-to-one alternative is the owner's call.)

## Notes

- No reviewer scope (weapon/loadout/UI, no `src/systems/combat/**` or terrain/nav).
- **Brief-gap correction during the cycle:** a new `LoadoutWeapon` enum value compile-breaks the exhaustive `Record<LoadoutWeapon,...>` tables (`WeaponSwitching.RUNTIME_WEAPON_MAP`, `ArmoryPreviewConfig` legacy+kiln) + needs `WeaponAmmo` plumbing to be selectable — the marksman executor found this empirically and the brief Files-touched was amended before re-dispatch. Not part of the walk.
- **Budget-ratchet admission:** `WeaponRigManager.ts` crossed 700 LOC (699→735) adding the SKS runtime type; admitted to the grandfather list with a split target (extract the per-weapon spec/core/rig registry) per the sanctioned ratchet — orchestrator note in `docs/CARRY_OVERS.md`, no new carry-over.
- Owner decision still open: the ammo-load final direction (tradeoff vs collapse).
