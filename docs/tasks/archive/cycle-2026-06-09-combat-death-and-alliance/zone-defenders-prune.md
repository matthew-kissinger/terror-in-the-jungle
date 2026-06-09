# zone-defenders-prune

`AIStatePatrol.zoneDefenders` Sets accumulate dead/removed combatant ids and
never shed them, so zones permanently "look defended" and starve of fresh
defenders as a match runs — late-game zones go undefended because slots are
held by the dead. Sweep stale ids out. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 3.)

## Files touched

- `src/systems/combat/ai/AIStatePatrol.ts`
- sibling behavior test (extended)

## Scope

1. Remove a combatant's id from any `zoneDefenders` Set when it dies or is
   removed/despawned (hook the cheapest reliable signal — death event,
   periodic sweep against liveness, or both; justify the choice in a
   comment).
2. Behavior test: fill a zone's defender slots, kill the defenders, assert
   new combatants can claim defender slots (no permanent starvation).

## Non-goals

- Patrol/defend behavior tuning (slot counts, radii unchanged).
- The unified death handler internals (combat-death-unification owns it; if
  you need a death signal, consume an existing event, don't add a pipeline).

## Acceptance

- [ ] Test above passes; the starvation repro fails on master first (state
      before/after in your report).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
- [ ] combat-reviewer signs off pre-merge.
