<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 6) -->
# tasking-director-mvp

From the 2026-06-28 owner decision ("build an opt-in tasking director"). This is
the conservative MVP built per `tasking-director-spike`'s recommendation: 2-3
opt-in task types read from live zone/war state, surfaced as a HUD task card with
explicit opt-in, rewarding score/impact — so A Shau has a "what should I do"
loop. **Builds on `tasking-director-spike`** (implement its recommended scope).
**Split into two PRs if the net diff exceeds 400 LOC** (system first, HUD card
second).

## Files touched

- `src/systems/missions/TaskingDirector.ts` (new — derive tasks from live state)
- `src/systems/missions/TaskingDirector.test.ts` (new)
- `src/ui/hud/HudTaskCard.ts` (new — opt-in task card) + `HUDSystem.ts` wiring
- `src/ui/hud/HudTaskCard.test.ts` (new)

## Scope

1. Implement 2-3 opt-in task types (capture / defend / destroy) derived from the
   live `WarSimulator`/zone state via the read paths named in the spike — no new
   strategy simulation, no per-frame hot path.
2. Surface the active task as a HUD task card with EXPLICIT opt-in (accept /
   decline / clear); reward = score/impact on completion.
3. Keep the new system behind its own module surface — do NOT widen the fenced
   `SystemInterfaces.ts`; reuse existing read paths into strategy/zone state.

## Non-goals

- Replacing the always-on war/zone systems — the director is opt-in and additive.
- The premiere BR mode + healing/looting (those are design docs this phase).
- Any change to `WarSimulator`/zone-capture rules — read-only.

## Acceptance

- [ ] Opting in surfaces a task card; the 2-3 task types resolve from live
      zone/war state; completion grants the reward. Behavior test asserts a task
      is derived from a zone/war snapshot and that opt-in/complete transitions
      fire (no live-sim rewrite).
- [ ] `npm run lint && npm run lint:budget && npm run test:run && npm run build` green.
- [ ] If net diff > 400 LOC, ship as two PRs (system, then HUD card) and note the
      split in the PR body; or document a deferral if it exceeds the conservative
      MVP scope.
- [ ] PR(s) linking this brief; owner walk → PLAYTEST_PENDING.

## Dependencies

- **Depends on `tasking-director-spike`** (implements its recommendation).
- Reviewer: `combat-reviewer` ONLY if the diff touches `src/systems/combat/**`
  (it should not — `src/systems/missions/*` is a new surface reading strategy state).
