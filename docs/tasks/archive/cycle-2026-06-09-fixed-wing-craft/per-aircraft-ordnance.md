<!-- cycle-2026-06-09-fixed-wing-craft R2; follows fixedwing-gunsight (PR #370) -->
# per-aircraft-ordnance

The three airframes (A-1 Skyraider, F-4 Phantom, AC-47 Spooky) are today one
identical nose hitscan — the largest single piece of missing craft identity
(the AVIATSIYA-5/6 deferral). This task differentiates them, headlined by the
AC-47's signature broadside battery replacing its nose cannon. See
`docs/CAMPAIGN_2026-06-09-craft-specialization.md` Phase 2.

## Files touched

- `src/systems/vehicle/FixedWingModel.ts` (+ existing tests) — per-airframe
  weapon config; grandfathered at loc 1155, do NOT grow past the snapshot:
  extract the weapon-delivery code into a new module if needed
- New weapon-delivery module under `src/systems/vehicle/` if extraction is
  needed (+ sibling test)
- `src/ui/hud/FixedWingHUD.ts` (+ test) — weapon name + per-weapon ammo on
  the existing counter (builds on PR #370's readout)
- `src/systems/vehicle/FixedWingPlayerAdapter.ts` (+ test) — wiring only

## Scope

1. Per-airframe weapon tables (data-driven, one config block per airframe):
   A-1 — 4x 20mm wing cannons (paired convergence, higher per-burst damage,
   tighter spread than today); F-4 — nose 20mm rotary (high rate, large
   magazine, current behavior tuned); AC-47 — REMOVE the nose gun; 3x 7.62
   minigun broadside firing 90° left of the nose (the signature orbit-fire
   geometry), generous magazine, tracer-heavy.
2. Fire-path geometry honors the table: origin offsets + fire direction per
   airframe (broadside = left-perpendicular in airframe space); spread and
   cadence from the table; existing hitscan/damage primitives unchanged.
3. HUD: weapon name + ammo from the table (capacity getter per airframe —
   extends PR #370's `getWeaponAmmoCapacity` shape).
4. Reticle stays the PR #370 reflector for nose/wing guns; for the AC-47,
   the reticle remains forward (the broadside aiming view is the sibling
   `fixedwing-camera-fit` task — do not build a side-view here).
5. L2/L3 tests: per-airframe fire direction (broadside fires ~90° left),
   per-airframe ammo capacities, NPC/AI fixed-wing paths unaffected
   (existing strafing behavior keeps working for all three).

## Non-goals

- No bombs/rockets (a future ordnance cycle; guns only this task).
- No camera changes (sibling `fixedwing-camera-fit`).
- No damage-model changes (reuse the existing hitscan damage path).
- No NPC AI retuning (AI keeps its current strafe behavior; broadside AI
  orbit logic is a follow-up if AI flies the AC-47).

## Acceptance

- [ ] Each airframe fires per its table (direction, spread, cadence,
      magazine); tests prove the AC-47 broadside geometry and that the A-1
      and F-4 remain forward-firing.
- [ ] `npm run lint && npm run test:run && npm run build && npm run
      lint:budget` pass; no `src/types/SystemInterfaces.ts` diff.
- [ ] PR against `master` linking this brief; combat-reviewer gates if any
      `src/systems/combat/**` file is touched (likely not — hitscan
      primitives live vehicle-side; confirm in the report).

## Round 2 / Dependencies

- Depends on: `fixedwing-gunsight` (merged #370).
- Blocks: `fixedwing-camera-fit` (same files; serialized).
