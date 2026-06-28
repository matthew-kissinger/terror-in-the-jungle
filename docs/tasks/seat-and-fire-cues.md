<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 1) -->
# seat-and-fire-cues

The owner entered the AC-47 and thought he was a gunner who couldn't fire, never
found the pilot, and couldn't tell how to switch seats — because nothing on the
HUD says which seat you are in, that `F` swaps seats (tank / door-gun heli), or
that aircraft fire on `LMB` only once airborne (`FixedWingModel.ts:836` silently
no-ops on the runway). This makes multi-crew + armed vehicles legible. Builds on
`control-hints-hud`.

## Files touched

- `src/ui/hud/FixedWingHUD.ts`
- `src/systems/vehicle/FixedWingModel.ts` (airborne-gate feedback signal only)
- `src/ui/hud/HudControlHints.ts` (seat/fire context from Phase-1 task)
- `*.test.ts` (new)

## Scope

1. Current-seat label whenever the player is in any multi-seat craft
   (pilot / gunner / door-gun / driver).
2. "F: swap seat" cue shown only when the active craft actually has a second
   enterable seat (tank driver↔gunner, door-gun helis) — not on jeeps.
3. "LMB: fire" cue on armed seats; when a fixed-wing fire input is rejected for
   being on the ground, show a transient "Airborne to fire" instead of nothing.
4. Clarify the AC-47: the player IS the pilot; RMB is the broadside-gun camera.

## Non-goals

- Adding a dedicated seat-swap keybind or changing the F overload (that is a
  Phase-2 concern in `tank-exit-and-seatswap`; here, only surface what exists).
- New weapons, new firing logic, or removing the airborne gate.

## Acceptance

- [ ] Seat label + correct cues appear in tank, door-gun heli, and AC-47
      (Playwright smoke screenshots).
- [ ] Ground fixed-wing fire attempt shows the airborne hint, not silence.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- Depends on: `control-hints-hud` (shared HUD surface).
