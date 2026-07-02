<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# grenade-cook-wire

The grenade cooking mechanic was fully built but dormant: `GrenadeSystem.startCooking`
had zero production callers, so the whole chain (pin-pull SFX, fuse beeps, the COOKING
meter readout, `explodeInHand`) was unreachable, and `explodeInHand`'s damage branch was a
log-only stub. Owner decision F2 (campaign manifest
`docs/CAMPAIGN_2026-07-02-greenlight-followthrough.md`): wire it — R cooks while the grenade
is aimed, and the in-hand detonation routes real lethal self-damage through
`PlayerHealthSystem`. Depends on the wave-1 player-explosion symmetry already on master.

## Files touched

- `src/systems/player/PlayerCombatController.ts` (+ test) — R routes to `startCooking` while aiming a frag
- `src/systems/weapons/GrenadeSystem.ts` (+ test) — real in-hand explosion + `player_killed`
- `src/systems/weapons/GrenadeArcRenderer.ts` — drop the log-only stub; cooking keeps cosmetics only
- `src/core/GameplayRuntimeComposer.ts` (+ test) — wire `setPlayerHealthSystem` into the grenade system
- `src/ui/hud/GrenadeMeter.ts` + `.module.css` — one-line "R: Cook" pin-pull hint
- `docs/tasks/grenade-cook-wire.md` (new)

## Scope

1. INPUT: `PlayerCombatController.reload()` (the KeyR path) pulls the pin via
   `grenadeSystem.startCooking()` when a real frag is actively aimed; otherwise falls through
   to the weapon reload. The grenade slot has no magazine, so this steals nothing. Cancelling
   aim after the pin is pulled is not offered — the throw happens on release regardless.
2. IN-HAND EXPLOSION: when the fuse expires in hand, `GrenadeSystem.explodeInHand` applies a
   guaranteed-lethal `takeDamage` (no 0.75 self-scale — an in-hand frag is unsurvivable),
   emits `player_killed` sourced `own_grenade_cooked`, then runs the standard
   `applyExplosionDamage` at the player's position so nearby NPCs take blast damage. The
   direct kill runs first so the standard explosion's own-ordnance self-hit is a no-op.
3. FEEDBACK: beeps + COOKING readout already fire once wired; added a one-line "R: Cook" hint
   to the grenade meter (hidden once the fuse is running).

## Non-goals

- Gamepad / touch cook input (keyboard-only for now — gap noted in PR).
- Any change to thrown-grenade physics, power, or uncooked behavior (kept byte-identical).
- No fence change (`SystemInterfaces.ts` untouched).

## Acceptance

- [ ] R cooks only while aiming a frag; R outside aiming reloads as before.
- [ ] Fuse expiry in hand kills the player + emits `player_killed`; nearby NPCs take blast
      damage; cooked throw detonates earlier by the cooked duration; uncooked unchanged.
- [ ] `npm run typecheck && npm run lint && npm run test:run -- <touched paths>` pass.
- [ ] PR opened against `master` with link to this brief + proposed PLAYTEST_PENDING row.
- [ ] combat-reviewer signs off pre-merge.
