<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# player-explosion-damage

Today no explosion in the game touches the player: `CombatantSystemDamage.applyExplosionDamage`
only iterates NPC combatants + vehicles, and the sole production caller of
`PlayerHealthSystem.takeDamage` is NPC rifle fire. This makes danger-close ordnance
(own frags, mortar, all air-support missions, NPC tank cannon) cost-free to the player and
guts the danger-close friction on the deployed fire-mission overhaul. Owner decision F1
(campaign manifest `docs/CAMPAIGN_2026-07-02-greenlight-followthrough.md`) is FULL symmetry:
enemy ordnance 1.0x, the player's own ordnance 0.75x, spawn protection respected,
`player_killed` emitted.

## Files touched

- `src/systems/combat/CombatantSystemDamage.ts`
- `src/systems/combat/CombatantSystem.ts`
- `src/systems/combat/CombatantSystemDamage.test.ts`
- `docs/tasks/player-explosion-damage.md` (new)

## Scope

1. Add `setPlayerHealthSystem` + `setPlayerPositionSource` to `CombatantSystemDamage`; wire
   both from `CombatantSystem` (forward health-system in `setPlayerHealthSystem`, pass the
   live per-frame `playerPosition` getter in the constructor).
2. After NPC + vehicle handling in `applyExplosionDamage`, apply the SAME distance-falloff
   curve to the player, scaled by `PLAYER_SELF_EXPLOSION_SCALE = 0.75` when the attacker is
   the player (`attackerId === 'PLAYER'`), else 1.0. Route through `takeDamage(amount, blast,
   playerPos)` so indicators, shake, spawn protection, and death handling engage.
3. Skip the player when `shooterFaction` is allied with the player (friendly-fire exclusion,
   mirrors NPC/vehicle paths). Player-thrown/own-air-support omit `shooterFaction` → self-hit.
4. Emit the typed `player_killed` event with source attribution on a lethal blast.

## Non-goals

- Grenade cooking / explode-in-hand (sibling `task/grenade-cook-wire`).
- Flashbang behavior (stays cosmetic, `GrenadeEffects` untouched); smoke stays no-damage.
- Any edit to `CombatantDamage.ts` / `CombatantCombat.ts:620` (owned by `task/small-truth-fixes`).
- No fence change (`SystemInterfaces.ts` untouched).

## Acceptance

- [ ] Own frag at player's feet applies ~0.75x the NPC-equivalent amount with falloff;
      enemy mortar/tank shell = 1.0x; outside radius = 0; allied shell = 0; spawn protection
      blocks; lethal blast emits `player_killed`; no-damage blast = 0.
- [ ] `npm run typecheck && npm run lint && npm run test:run -- <touched paths>` pass.
- [ ] PR opened against `master` with link to this brief + proposed PLAYTEST_PENDING row.
- [ ] combat-reviewer signs off pre-merge.
