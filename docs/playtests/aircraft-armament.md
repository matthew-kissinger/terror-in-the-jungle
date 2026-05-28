# Playtest: aircraft-armament

Cycle: `cycle-2026-05-28-vehicles-aircraft-operable`
Task slug: `aircraft-armament`
Branch: `task/aircraft-armament`
Reviewer: `combat-reviewer`

Closes the owner-reported "aircraft combat and weaponry have not been
tested / do not work end-to-end" gap, in three parts:

1. Crew-served Huey M60 door guns are now registered in
   `HelicopterWeaponSystem` (previously `firingMode:'crew'` mounts were
   filtered out of `initWeapons` entirely) and fire only when the seat is
   manned and the helicopter is airborne.
2. Fixed-wing aircraft now mount a forward nose cannon
   (`weaponCount > 0`, real muzzle transform, fire wired through the
   adapter's trigger surface). Previously `FixedWingModel` /
   `FixedWingPlayerAdapter` hardcoded `weaponCount:0`.
3. Friend-or-foe filtering: every aircraft hitscan shot now threads its
   owning `Faction` through the shared `CombatantSystem.handlePlayerShot`
   -> `CombatantHitDetection.raycastCombatants` path, which already skips
   allies via `isAlly(combatant.faction, shooterFaction)`. The player's
   gunship/aircraft fire as `Faction.US`, so US/ARVN combatants take ZERO
   damage from aircraft weapons; only OPFOR is hit.

## Autonomous-loop deferral notice

Under the cycle brief's declared `posture: autonomous-loop`
(`docs/tasks/cycle-2026-05-28-vehicles-aircraft-operable.md`), the
playtest-required gate for this task is **deferred** to
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md) per the orchestrator's
autonomous-loop override (see
[.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md)
§"Autonomous-loop posture" and
[docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md)). The
orchestrator appends the PLAYTEST_PENDING row and runs the cycle-wide
Playwright capture at cycle close; the owner walks the punch list below
in a batch sweep.

This memo is flagged **automated smoke; owner walk-through pending**.
The IFF behavior (the load-bearing owner-reported friendly-fire bug) is
covered by deterministic unit tests rather than a screenshot, since
"a friendly takes zero damage" is a damage-resolution assertion, not a
visual one. See "Automated coverage" below.

## Automated coverage (stands in for the smoke run)

The deterministic behavior the brief's acceptance calls out is exercised
by unit/L2 tests, all green under `npm run test:run`:

- `src/systems/helicopter/HelicopterWeaponSystem.test.ts`
  - Crew door gun is registered (not dropped) and carries its own ammo
    pool (`getCrewWeaponCount`, `getCrewAmmo`).
  - Door gun stays inert while the seat is unmanned, and while manned but
    grounded; fires once manned AND airborne.
  - Aircraft fire threads the owning faction to `handlePlayerShot`
    (OPFOR gunship fires as `Faction.NVA`; player gunship defaults to
    `Faction.US`) so the shared IFF filter spares the shooter's allies.
- `src/systems/vehicle/FixedWingModel.test.ts`
  - `getWeaponCount > 0` after creation; the forward gun fires through
    `handlePlayerShot` while airborne and draws down its ammo; it does
    NOT strafe while parked; it stops on trigger release.
  - The fire path passes `Faction.US` (player) so friendlies are spared.
- `src/systems/vehicle/FixedWingPlayerAdapter.test.ts`
  - Advertises the cannon as firable (`weaponCount > 0`,
    `canFirePrimary: true`) on entry; routes the fire trigger to the
    model only while seated; releases the trigger on cockpit exit.

The friendly-zero-damage IFF primitive itself
(`raycastCombatants` skipping `isAlly` combatants) is covered at the
hit-detection layer in
`src/systems/combat/CombatantHitDetection.test.ts`. This task threads the
aircraft weapon's faction into that primitive; the aircraft-level tests
above assert the faction is actually passed.

## What the owner should walk (deferred punch list)

1. **Huey door gun fires when manned.** Board/spawn a UH-1 with a crewed
   door-gun seat, get airborne, confirm the M60 door gun engages nearby
   enemies with visible tracers. Confirm it is silent while parked on the
   pad and when the seat is unmanned.
2. **Fixed-wing forward gun fires.** Pilot a fixed-wing aircraft (A-1 /
   F-4), get airborne, hold the fire trigger (LMB), confirm the nose
   cannon fires forward along the airframe axis with visible tracers and
   that ammo draws down. Confirm it does not fire while parked on the
   apron.
3. **Friend-or-foe (the owner-reported bug).** Fly an aircraft over a
   mixed firefight with friendly (US/ARVN) and enemy (NVA/VC) NPCs in the
   line of fire. Confirm aircraft weapon hits damage ONLY enemies; a
   friendly directly under the gun takes ZERO damage.
4. **Tracers visible.** Confirm tracers render for both the door gun and
   the forward cannon.

## Known integration seam (for the orchestrator / keystone)

The fixed-wing fire trigger is wired through
`FixedWingPlayerAdapter.startFiring()/stopFiring()` (forwarding to
`FixedWingModel`), which is the in-scope fire-control surface for this
task. The final one-line route from the player fire input
(`PlayerCombatController.beginFire/endFire`, keyed today only on
`playerState.isInHelicopter`) into the fixed-wing adapter is NOT in this
task's `Files touched` scope. It belongs with the keystone
`vehicle-occupancy-camera` task, which owns `PlayerCamera` + the vehicle
adapters and wires the analogous tank fire-control routing. Until that
branch lands the `isInFixedWing` fire branch in `beginFire/endFire`, the
fixed-wing cannon is fully implemented and unit-tested at the
model+adapter layer but not yet reachable from a live mouse click. The
helicopter door-gun and IFF changes are fully wired in prod.
