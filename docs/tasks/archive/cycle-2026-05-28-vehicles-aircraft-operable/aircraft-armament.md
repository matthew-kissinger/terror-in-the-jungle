<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# aircraft-armament

Closes the owner-reported "our aircraft combat and weaponry have not been
tested" gap; they also do not work end-to-end. `HelicopterWeaponSystem.
initWeapons` filters out `firingMode:'crew'` mounts, so the Huey M60 door guns
are never registered and never fire even when manned. Fixed-wing aircraft have
no armament: `FixedWingModel` / `FixedWingPlayerAdapter` hardcode `weaponCount:0`.
The pilot fire paths (`fireHitscan`, `fireProjectile`) already work but do NOT
check faction: they damage friendly AND enemy NPCs alike (owner-reported). This
task feeds the dead weapons and adds friend-or-foe filtering so aircraft guns
only damage enemies.

## Files touched

- `src/systems/helicopter/HelicopterWeaponSystem.ts` (crew door-gun fire path + IFF)
- `src/systems/vehicle/FixedWingModel.ts` (forward armament definition)
- `src/systems/vehicle/FixedWingPlayerAdapter.ts` (weaponCount + fire wiring)
- sibling `*.test.ts` for the fixed-wing weapon + the IFF filter (new surfaces)

## Scope

1. Let crew-served door guns fire when the seat is manned (player gunner or AI
   crew) instead of filtering `firingMode:'crew'` out of `initWeapons`; keep
   them inert when unmanned.
2. Add forward fixed-wing armament (gun and/or rockets): real `weaponCount`,
   muzzle transforms, fire wired to the existing fire paths.
3. Tracers + damage register for both; reuse NPC/weapon primitives (do not
   reinvent LOS/targeting/damage).
4. Friend-or-foe: aircraft weapon hits damage ONLY enemy NPCs, never friendlies
   or the player's own faction. Reuse the existing NPC faction/target-validation
   primitives; do not reinvent the IFF check.

## Non-goals

- New aircraft types or flight-model changes.
- Helicopter camera / control (already works).
- Rebalancing existing pilot weapons.

## Acceptance

- [ ] Test: fixed-wing `weaponCount > 0` and the fire path produces a shot;
      crew door gun fires only when manned.
- [ ] Test: a friendly NPC in the line of fire takes ZERO damage from any
      aircraft weapon; only enemy NPCs are hit (the owner-reported friendly-fire bug).
- [ ] Playwright smoke: Huey door gun fires; fixed-wing forward gun fires;
      tracers visible; a nearby friendly is NOT hit. Screenshots to the cycle
      playtest-evidence dir.
- [ ] combat120 p99 within +5% (perf-analyst).
- [ ] `npm run lint && npm run test:run && npm run build` pass.
- [ ] `combat-reviewer` APPROVE pre-merge.

## Round 2 / Dependencies

- Reviewer: `combat-reviewer` (weapons/damage + IFF).
- If `IFirstPersonWeapon` / `IHelicopterModel` (fenced) must change: STOP and surface.
