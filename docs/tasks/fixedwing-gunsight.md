<!-- cycle-2026-06-09-fixed-wing-craft R1 (Phase 2 of CAMPAIGN_2026-06-09-craft-specialization) -->
# fixedwing-gunsight

Owner verdict: no craft has a proper targeting crosshair. Fixed-wing is the
worst offender with ordnance: all three airframes (A-1, F-4, AC-47) share one
fixed forward hitscan with 2.5° spread and a hardcoded, invisible 600-round
count — aimed with no sight at all. This task gives fixed-wing a reflector
gunsight + visible ammo, using the reticle framework from Phase 1. See
`docs/CAMPAIGN_2026-06-09-craft-specialization.md` Phase 2.

## Files touched

- `src/ui/hud/CrosshairSystem.ts` (+ module CSS + test) — new `fixed_wing`
  mode (reflector-style ring + center pipper, Field Journal language)
- `src/systems/vehicle/FixedWingModel.ts` — expose ammo state (count +
  capacity getters; replace the hardcoded magic number with a named
  per-airframe field, same values for now)
- `src/ui/hud/FixedWingHUD.ts` (+ test) — ammo counter readout (FJ language)
- Wiring: wherever fixed-wing entry/exit sets the crosshair today (trace the
  fixed-wing player path; mirror the heli adapter pattern at
  `src/systems/vehicle/HelicopterPlayerAdapter.ts:105`)

## Scope

1. Add `fixed_wing` to the CrosshairMode union (additive — `src/types/`
   `SystemInterfaces.ts` must NOT be touched; same fence-clean pattern as
   reticle-framework #362).
2. Reflector-sight reticle: outer ring + center dot + short cross ticks,
   FJ-styled; visible in the fixed-wing chase/cockpit view; boresighted to
   the nose-cannon convergence direction (static alignment is fine — no
   lead computation).
3. Visible ammo: FixedWingHUD shows rounds remaining for the nose gun,
   decrementing live; LOW state under 20%. Source the count from
   FixedWingModel's real fire path (the one that today decrements the
   hidden 600).
4. Crosshair mode set on fixed-wing entry, restored to infantry on exit
   (all three airframes).
5. L2 tests: mode set/restore on enter/exit; ammo readout decrements with
   the fire path; LOW threshold.

## Non-goals

- No per-airframe ordnance differentiation (sibling `per-aircraft-ordnance`).
- No camera changes (sibling `fixedwing-camera-fit`).
- No lead-computing/CCIP pipper (static reflector only this phase).
- No ammo ECONOMY changes (count value + resupply rules unchanged).

## Acceptance

- [ ] Entering any fixed-wing shows the reflector sight + live ammo counter;
      exit restores infantry; tests prove it.
- [ ] `git diff --name-only master` does NOT include
      `src/types/SystemInterfaces.ts`.
- [ ] `npm run lint && npm run test:run && npm run build` pass; lint:budget
      green (FixedWingModel is grandfathered at 1155 — do not grow past its
      snapshot; expose getters frugally).
- [ ] PR against `master` linking this brief.

## Round 2 / Dependencies

- Blocks: `per-aircraft-ordnance` (R2 — weapon-select HUD builds on the ammo
  readout), `fixedwing-camera-fit` (R2 — sight-line alignment check).
