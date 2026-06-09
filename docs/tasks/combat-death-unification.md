# combat-death-unification

Combatant death is handled by three racing owners: rifle kills resolve in
CombatantDamage, explosion kills in CombatantSystemDamage, and cleanup races
between the LOD manager and spawn manager — with no leader promotion or
empty-squad deletion anywhere, and explosion damage scanning all combatants
O(N). One death pipeline, owned by one module. This is the Phase 3 keystone:
land it before any future combat work compounds the race. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 3.)

## Files touched

- `src/systems/combat/CombatantDamage.ts`
- `src/systems/combat/CombatantSystemDamage.ts`
- `src/systems/combat/CombatantLODManager.ts`
- `src/systems/combat/CombatantSpawnManager.ts`
- sibling behavior tests (new or extended)

## Scope

1. One `handleCombatantDeath(target, attacker, cause)` owned by ONE module;
   rifle (CombatantDamage) and explosion (CombatantSystemDamage) kills both
   route through it.
2. Add leader promotion (squad leader dies → surviving member promoted) and
   empty-squad deletion (last member dies → squad removed) in that handler.
3. Explosion damage queries `spatialGridManager.queryRadius`, not a full
   O(N) combatant scan.
4. Decide body-persistence ONCE in the unified handler; remove the competing
   cleanup paths so exactly one owner despawns bodies.
5. L3 repro-first tests: same-target rifle vs explosion death produce
   identical squad bookkeeping; leader death promotes; last-death deletes
   squad; explosion radius query hits only in-radius combatants.

## Non-goals

- AI behavior/timing changes (`ai-timing-gate` owns CombatantAI; you share
  CombatantLODManager with it — merges are serialized, expect a rebase).
- Damage numbers, TTK, or weapon tuning changes.
- Kill-feed/UI changes beyond keeping existing events firing once.

## Acceptance

- [ ] Tests above pass; double-cleanup/no-promotion repro fails on master
      first (state before/after in your report).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
- [ ] combat-reviewer signs off pre-merge.

## Size flag

L — the one large task this cycle. If you pass ~400 net lines, split into
death-core (handler + routing) now and explosion-route/persistence follow-up,
and say so in your report rather than overrunning.
