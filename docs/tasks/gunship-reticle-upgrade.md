<!-- cycle-2026-06-09-helicopter-craft R2; follows door-gun-seat -->
# gunship-reticle-upgrade

The AH-1 Cobra owns the campaign's only pre-existing reticle (static pipper,
gun + rocket icons). This task upgrades it to a real attack sight: a
rocket-fall lead cue (CCIP-lite) and per-weapon reticle states, with ammo /
weapon-select surfaced in the heli HUD. See
`docs/CAMPAIGN_2026-06-09-craft-specialization.md` Phase 3.

## Files touched

- `src/ui/hud/CrosshairSystem.ts` (+ module CSS + test) — `helicopter_attack`
  mode: per-weapon reticle states (gun vs rockets) + a vertically-offset
  CCIP rocket-fall cue element the renderer can position
- `src/systems/helicopter/HelicopterWeaponSystem.ts` (+ test) — expose
  rocket ballistic params + ammo/selected-weapon state (read-only getters)
- `src/ui/hud/HelicopterHUD.ts` (+ test) — ammo + selected-weapon readout
  (FJ language)
- `src/systems/vehicle/HelicopterPlayerAdapter.ts` (+ test) — per-frame cue
  update wiring (compute the CCIP offset; push to the crosshair/HUD via
  existing non-fenced seams)

## Scope

1. CCIP-lite rocket cue: from current airspeed + attitude + the rocket's
   muzzle speed/gravity (use the values the existing rocket fire path
   integrates with — no new ballistics), compute the predicted fall point
   and offset the rocket cue vertically below the boresight pipper.
   Deterministic helper + unit tests (level hover → small drop; nose-down
   dive → cue converges toward pipper).
2. Per-weapon reticle states: gun selected → gun pipper prominent; rockets
   selected → rocket cue prominent (the existing weapon-cycle input drives
   it; trace where weapon selection lives).
3. HelicopterHUD: selected weapon name + remaining ammo (rockets count;
   minigun state) from existing weapon state — display only.
4. Mode set/restore unchanged (helicopter_attack already wired on entry).
5. L2 tests per scope item.

## Non-goals

- No door-gun changes (landed in `door-gun-seat`).
- No transport-variant HUD work (sibling `heli-hud-consolidation`).
- No weapon/damage/ballistics changes — read-only consumption.
- No fenced-interface changes (`IHUDSystem` heli methods are fenced; use
  the concrete non-fenced seams like the fixed-wing ammo path did).

## Acceptance

- [ ] Rocket cue offsets correctly per the deterministic tests; weapon
      cycle swaps reticle prominence; HUD shows weapon + ammo live.
- [ ] `npm run lint && npm run test:run && npm run build && npm run
      lint:budget` pass; no `src/types/SystemInterfaces.ts` diff.
- [ ] PR against `master` linking this brief.

## Round 2 / Dependencies

- Depends on: `door-gun-seat` (merged — shared heli files).
- Sibling: `heli-hud-consolidation` (dispatch after this merges).
