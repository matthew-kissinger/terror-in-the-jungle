# task/radio-smoke-hardening

Cycle: cycle-2026-07-02-greenlight-followthrough (manifest R1/R2/R3)
Reviewer: combat-reviewer

## Goal

Close the verified edge defects around the radio -> smoke-marker -> fire-support
flow. The happy path is correct and test-covered; do NOT restructure it. The
removed target-method ring (Aim Mark / Throw Smoke / Use Active Smoke) is
owner-rejected with a do-not-restore clause; none of it comes back.

## Scope (fixes)

1. **Cancel funnel.** Route the weapon-swap smoke-cancel through the single
   `handleWeaponSlotChange` funnel (`PlayerController`), so number-key /
   weapon-pill / weapon-bar / gamepad-grenade slot changes all cancel an armed
   smoke marker, not just the touch `onWeaponSlotChange` callback. Keep the
   existing `onWeaponSlotChange` cancel so same-slot reselect still cancels.
2. **Vehicle suppression.** When infantry actions are suppressed for a ground
   vehicle, cancel an armed smoke marker (one-shot, idempotent). Heli / fixed-wing
   toss preserved.
3. **Begin-rejection feedback.** Replace the invisible `AirSupportRadioMenu`
   status echo with a visible `FireMissionBanner` UNAVAILABLE flash, and delete
   the dead `AirSupportRadioMenu` surface (+ css + test) plus vestigial
   `setHasSmokeMark` / `getActiveSmokeMark` plumbing.
4. **MARKER OUT state.** Show a "MARKER OUT — waiting for smoke" prompt state
   from throw-release until `target_mark_set`.
5. **Death/respawn.** Cancel throw mode and abort any active designation when the
   player dies (`disableControls`).
6. **Too-far hint.** Change the fixed-target designate hint when the gate is
   out_of_range (LMB is a no-op there) to "TOO FAR — move closer".
7. **Tri-marking deletion (R3).** Remove the Smoke / Willie Pete / Grid
   marking-selector catalog entries + overlay selector wiring; dial stays
   hardcoded 'smoke'. Fix the overlay fire-support panel sub-copy.
8. **Double smoke cloud.** Skip the commit-time smoke cloud when the designation
   came from a smoke-marker fixed target (the canister already spawned one).

## Non-goals

- No restructure of the happy path; no reintroduction of the target-method ring.
- No fence change (`SystemInterfaces.ts` untouched).
- No change to the runtime `AirSupportTargetMarking` type (still flows to
  `AirSupportManager.requestSupport`); only the UI selector is removed.

## Validation

`npm run typecheck`, `npm run lint`, `npm run lint:budget`, and focused
`npm run test:run` for the touched suites (CommandInputManager, CommandRadioMenu,
PlayerController, StrikeDesignationController, AirSupportRadioCatalog,
CommandSmokeMarkerFlow).

## Budget note (for the orchestrator)

`PlayerController.ts` grandfather snapshot raised 1222 -> 1227 LOC in
`scripts/lint-source-budget.ts` (+5 LOC: the slot-change cancel funnel,
ground-vehicle suppression cancel, and `abortRadioTargeting` on death). R3 split
target unchanged. Please record this ratchet re-base in `docs/CARRY_OVERS.md`
(executors may not edit that file).
