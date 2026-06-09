# combat-death-body-persistence

Round 2 split of `combat-death-unification` (#349, `541d2c53`): the death
pipeline now owns AI-attributed damage deaths, but body cleanup still races —
`CombatantLODManager.updateDeathAnimations` and the
`CombatantSpawnManager.manageSpawning` sweep both despawn bodies, and
player-squad RIFLE respawns + player-rifle-killed squad reconciliation today
depend on that sweep. Make the LOD manager the sole body-despawn owner without
breaking either dependency. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 3 R2.)

## Files touched

- `src/systems/combat/CombatantLODManager.ts` (sole despawn owner)
- `src/systems/combat/CombatantSpawnManager.ts` (delete the racing sweep)
- `src/systems/combat/CombatantSystem.ts` (wire respawn/squad hooks)
- `src/systems/combat/CombatantDamage.ts` (hook setter; player-rifle squads)
- `src/systems/combat/CombatantCombat.ts` (only if routing player-kill squads
  through applyDamage requires passing squads — keep minimal)
- sibling behavior tests (new or extended)

## Scope

1. `CombatantLODManager.updateDeathAnimations` becomes the SOLE body-despawn
   owner (animated deaths + terminal `DEAD && !isDying` stragglers).
2. Delete the racing cleanup sweep in `CombatantSpawnManager.manageSpawning`.
3. Before deleting it, rehome what the sweep load-bears today: (a) player-squad
   rifle deaths queue their respawn via the pipeline's existing
   `queueRespawn`/`isPlayerControlledSquad` hooks (wire through
   CombatantSystem + a setter on CombatantDamage); (b) player-rifle-killed
   NPCs (CombatantCombat passes `squads: undefined`) still get squad
   bookkeeping — route them through the pipeline rather than silently losing
   reconciliation.
4. L3 repro-first tests: exactly-once despawn per body (no double-despawn,
   no immortal body); player-squad rifle death still respawns; player-rifle
   kill still prunes/promotes the victim's squad.

## Non-goals

- Changing body-persistence timing players see (keep current despawn delays).
- AI behavior/timing (ai-timing-gate landed; rebase over it in
  CombatantLODManager).
- RespawnManager queue mechanics beyond consuming existing surfaces.

## Acceptance

- [ ] Tests above pass; the double-owner race (or sweep-dependency break) is
      demonstrated on master first (state before/after in your report).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
- [ ] combat-reviewer signs off pre-merge.
