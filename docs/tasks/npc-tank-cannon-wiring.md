<!-- cycle-2026-06-09-ground-gunnery-craft R1 -->
# npc-tank-cannon-wiring

Carried follow-up from the consultation-remediation campaign: NPC M48 tanks
never fire their cannon in prod. The full firing route already exists and is
tested — `TankAIGunnerRoute` (lead prediction, turret slew, cone+reload
gates) is called from `CombatantAI`'s tank-gunner branch — but the prod
composition never binds a cannon system / ballistic solver to it, so the
route is dormant. Player tank combat is one-way; this makes it two-way so the
ground-gunnery slice is testable against live opposition. See
`docs/CAMPAIGN_2026-06-09-craft-specialization.md` Phase 1.

## Files touched

- `src/core/StartupPlayerRuntimeComposer.ts` (or the composition point you
  trace as correct — note its `ensureCannon()` already lazily constructs the
  shared `TankCannonProjectileSystem` for the *player* gunner path)
- `src/systems/combat/CombatantAI.ts` (only if a missing injection point
  forces it — prefer composition-side wiring)
- New/extended L3 test under `src/integration/`

## Scope

1. Trace why `CombatantAI.tankGunnerRoute` stays null/dormant in prod (what
   dependency injection is missing: cannon system, `TankBallisticSolver`,
   or the route construction itself).
2. Bind the shared `TankCannonProjectileSystem` + solver to the NPC
   tank-gunner route at the prod composition point, reusing the same pooled
   projectile system the player gunner gets (no second pool).
3. Ensure damage attribution flows through the existing projectile system →
   `CombatantDeathPipeline` path (no new damage code).
4. L3 scenario test: an NPC-crewed M48 with an enemy combatant in range and
   line of sight fires a cannon projectile within N seconds and the
   projectile applies damage. Repro-first: assert it does NOT fire on master
   composition, then wire, then assert it does.

## Non-goals

- No changes to `TankAIGunnerRoute` logic (tuning cone/reload is out).
- No reticle/HUD work (sibling tasks own that).
- No NPC M2HB / emplacement AI changes.
- No new projectile or damage systems.

## Acceptance

- [ ] L3 test proves NPC cannon fire + damage attribution end-to-end.
- [ ] Player-gunner path unaffected (existing `m48-board` /
      `seated-weapon-fire` integration tests stay green).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief; combat-reviewer
      gates merge (touches `src/systems/combat/**` or its composition).

## Round 2 / Dependencies

- Independent root; pairs with `tank-gunner-sight` at the Phase 1 exit gate
  (owner takes return fire while using the new sight).
