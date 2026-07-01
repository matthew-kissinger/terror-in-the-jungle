<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# aircraft-combat-hud-and-controls

Owner-reported: aircraft combat HUD/control-hints were "not well thought
out relative to combat and weapons and firing" and don't correctly show
context-appropriate controls depending on which vehicle/aircraft you're
in. 2026-07-01 audit confirmed concrete, verified gaps (not speculation)
in `HudControlHints.ts`'s vehicle-context bucketing. Round 1 of a larger
aircraft-feel effort; lead-pipper/cockpit-camera/per-aircraft ordnance
work is explicitly deferred (see Non-goals).

## Files touched

- `src/ui/hud/HudControlHints.ts`
- `src/ui/hud/HelicopterHUD.ts`
- `src/systems/player/PlayerInput.ts` (verify only — read to confirm
  where `KeyH`'s panel-toggle binding actually lives before remapping it)
- `src/ui/hud/HudControlHints.test.ts` (or nearest existing test file —
  new/adjusted cases)
- `src/ui/hud/HelicopterHUD.test.ts` (new/adjusted cases for item 5)

## Scope

1. Split `ControlHintContext` from `'foot' | 'groundVehicle' | 'aircraft'`
   into `'foot' | 'groundVehicle' | 'helicopter' | 'fixedWing'`. Update
   `actorToContext()`'s switch so `'helicopter'` and `'plane'` resolve to
   their own bucket instead of collapsing into one. Split
   `CONTEXT_BINDS.aircraft` into two accurate lists: drop the dead
   `G: Deploy squad` row from the fixed-wing list (real key only fires in
   `isInHelicopterMode()`, transport-role-only even there — see
   `HelicopterPlayerAdapter.createHelicopterUIContext`), and correct the
   `Space` label per vehicle (`Space: Auto-hover` for helicopter vs.
   `Space: Flight assist` for fixed-wing, matching `PlayerInput.ts`'s
   actual branch).
2. Gate the `V` (AC-47 broadside/chase view) hint on the specific
   broadside-capable airframe, not the whole fixed-wing bucket — reuse
   or extend the existing `context.viewToggle` field pattern already
   special-cased in `seatHintFromContext`, so a UH-1/A-1/F-4 pilot no
   longer sees a hint for a control that does nothing on their aircraft.
3. Add the missing `H: Altitude lock` row to the helicopter list — but
   first resolve the key collision: `KeyH` is both the real altitude-lock
   toggle (helicopter-only) AND `HudControlHints`'s own panel
   show/hide toggle key. Remap the panel's own toggle to a different key
   (e.g. `KeyJ` or `Backslash`) rather than leaving the collision, since
   altitude lock is the gameplay-relevant bind.
4. Add a static row surfacing the helicopter weapon-cycle keys
   (`Digit1`/`Digit2`, gun vs. rockets) to the helicopter list — currently
   invisible anywhere in the hint UI.
5. Add a LOW-ammo color/threshold state to `HelicopterHUD`'s weapon/crew
   panel. **Not pure display-layer parity like it looks**: verified
   `HelicopterWeaponSystem.update()` pushes
   `hudSystem.setHelicopterWeaponStatus(active.config.name, active.ammo)`
   with no capacity — and that method's signature
   (`name: string, ammo: number`) is a **fenced interface** in
   `src/types/SystemInterfaces.ts` (`IHUDSystem`). Do NOT widen it.
   `active.config.ammoCapacity` already exists at the call site (used by
   the sibling `getWeaponStatus()`/`getPlayerDoorGunStatus()` methods),
   just never threaded to the HUD — so thread it via a *new*, separate,
   non-fenced setter (e.g. `HelicopterHUD.setWeaponCapacity(maxAmmo)`,
   called directly by `HelicopterWeaponSystem.ts`, bypassing
   `IHUDSystem`) rather than growing `setHelicopterWeaponStatus`. If that
   path turns out not to be clean, STOP — do not touch
   `SystemInterfaces.ts` unilaterally to make it fit; cut item 5 to its
   own Round 2 brief and say so in the PR description instead.

## Non-goals

- Fixed-wing lead pipper / CCIP gunnery aid — flagged design-heavy,
  needs its own playtest-iterated cycle (`PHASE5_FEATURE_SCOPE` item C).
- First-person/cockpit camera for either aircraft class — not what the
  owner's complaint was about; separate large feature if ever pursued.
- Named NPC maneuver routes (AVIATSIYA-6) — different subsystem
  ownership (air-support/`SpookyMission`), explicitly deferred.
- Fixed-wing secondary-ordnance weapon-cycle HUD — conditional on the
  (separately deferred) rockets/bombs projectile work landing first;
  nothing to cycle yet with one gun per airframe.
- Door-gunner seat camera/feel decisions (`PHASE5_FEATURE_SCOPE` item A).
- Any change to `src/types/SystemInterfaces.ts` — this task is achievable
  without one (see item 5); if you find yourself needing one, stop and
  surface it instead of proceeding.

## Acceptance

- [ ] A fixed-wing pilot sees zero dead hints (no `G`, no `V` unless
      AC-47) and a correctly-labeled `Space` row.
- [ ] A helicopter pilot sees `H: Altitude lock` and the weapon-cycle
      keys; the panel's own toggle key no longer collides with `H`.
- [ ] `HelicopterHUD` shows a LOW-ammo state driven by a real
      ammo/capacity ratio (not a hardcoded per-weapon guess), added
      without touching `SystemInterfaces.ts` — OR item 5 is explicitly
      cut from this PR with a follow-on brief filed, PR description says
      which.
- [ ] `git diff -- src/types/SystemInterfaces.ts` is empty.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] `npm run lint:budget` stays green.
- [ ] PR opened against `master` with link to this brief; combat-reviewer
      gates per `docs/AGENT_ORCHESTRATION.md` (touches
      `src/ui/hud/**`/weapon-adjacent HUD state).
