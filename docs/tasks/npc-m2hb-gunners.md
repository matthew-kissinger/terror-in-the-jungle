<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# npc-m2hb-gunners

Two M2HB tripods spawn in prod (OF US FOB, A Shau Hill 937 NVA bunker) and the AI order/
seek/scoring machinery for NPC gunners existed and was hard-fail tested — but it had ZERO
production callers: `createNpcM2HBAdapter` was referenced only from tests/comments, the three
`AIStateEngage` setters were unwired, and even a mounted NPC would sit inert because the
IN_VEHICLE branch handled only tank gunners. Owner decision F5 (campaign manifest
`docs/CAMPAIGN_2026-07-02-greenlight-followthrough.md`) is FULL activation. Four pieces were
missing (setters alone would strand inert NPCs on tripods).

## Files touched

- `src/core/OperationalRuntimeComposer.ts` — build the adapter + forward setters + route.
- `src/systems/combat/CombatantAI.ts` — 3 forwarding setters + emplacement-gunner route wiring + IN_VEHICLE branch.
- `src/systems/combat/ai/EmplacementAIGunnerRoute.ts` (new) — mounted aim/fire/dismount route.
- `src/systems/combat/CombatantCombat.ts` / `CombatantSystem.ts` — `npcAttacker` override on `handlePlayerShot`.
- `src/systems/combat/weapons/M2HBEmplacement.ts` — thread the gunner through `tryFire`/`executeShot`.
- `src/systems/combat/weapons/NpcM2HBAdapter.ts` — resolve + pass the seated gunner; stale-comment fix.
- `src/systems/vehicle/NPCVehicleController.ts` — death seat-release.
- `src/systems/combat/ai/EmplacementSeekHelper.ts` — soft-fail the missing-binding hard-throw.
- `scripts/lint-source-budget.ts` — CombatantAI ratchet re-base (1004→1072, +68 LOC).
- Tests: `emplacement-npc-gunner-fire.test.ts` (new), `CombatantCombat.test.ts`, `EmplacementSeekHelper.test.ts`.
- Docs: `docs/directives/vekhikl-2.md`, `docs/tasks/npc-m2hb-gunners.md` (new).

## Scope

1. ACCESS PATH: forwarding setters on `CombatantAI` (`setEmplacementQuery` /
   `setEmplacementWeaponResolver` / `setNpcVehicleBoarding`) onto the private engage handler,
   wired from `wireM2HBEmplacementRuntime` via `createNpcM2HBAdapter(vm, m2hb, combatantSystem)`.
2. MOUNTED ROUTE: `EmplacementAIGunnerRoute` (sibling of `TankAIGunnerRoute`) run from the
   IN_VEHICLE branch — slew `Emplacement.setAim`, cone-gated `NpcM2HBAdapter.fire`, dismount
   via `EmplacementMountTracker.shouldDismount` → `orderDismount`.
3. ATTRIBUTION/IFF: `handlePlayerShot` gains an `npcAttacker` override; an NPC-gunner kill is
   credited to the gunner (rifle death pipeline: `gunner.kills++`, `npc_killed`), never the
   player HUD/streak/`player_kill`. Friend-foe filters on the gunner's faction.
4. DEATH SEAT-RELEASE: `updateRiding` releases a seat when its occupant is DEAD (general
   across roles — tank seats benefit too), so a killed gunner does not lock the tripod.
5. SAFETY: soft-fail the `buildEmplacementContext` missing-binding throw (log once + skip).

## Non-goals

- No fence change (`SystemInterfaces.ts` untouched).
- No new tripod scenarios; contention model unchanged (owner-accepted).
- No changes to `TankAIGunnerRoute` / tank wiring beyond the shared seat-release.

## Acceptance

- [x] NPC seeks + mounts a free friendly tripod with a threat in cone; slews + fires at a
      hostile; hits only hostiles; player kill count unaffected; dismounts when threats leave
      the cone; killed gunner frees the seat and the tripod is re-mountable.
- [x] `npm run typecheck && npm run lint && npm run test:run -- <touched paths>` pass.
- [ ] PR opened against `master` with link to this brief + proposed PLAYTEST_PENDING row.
- [ ] combat-reviewer signs off pre-merge; owner feel-walk pending (PLAYTEST_PENDING).

## Perf

combat120/AI_SANDBOX spawns zero tripods, so the perf gate is blind to this. The seek scan is
behind a 500 ms TTL cache and an allocation-free radius query (unchanged by this task).
