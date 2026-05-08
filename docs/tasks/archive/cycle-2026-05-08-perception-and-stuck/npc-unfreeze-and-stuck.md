# npc-unfreeze-and-stuck: visible NPC movement at distance + squad/stuck deadlock breakers

**Slug:** `npc-unfreeze-and-stuck`
**Cycle:** `cycle-2026-05-08-perception-and-stuck`
**Round:** 1
**Priority:** P0 — user-reported gameplay regression. Distant NPC clusters appear frozen until camera approaches; stuck leaders anchor whole squads.
**Playtest required:** YES
**Estimated risk:** medium — touches LOD scheduler hot path and squad following logic. All behavior changes gated by config flags for instant rollback.
**Budget:** ≤400 LOC including tests.

## Files touched

- Modify: `src/systems/combat/CombatantLODManager.ts` — Layers 1, 4 (visual-only velocity integration; configurable distant-sim interval).
- Modify: `src/systems/combat/CombatantMovementStates.ts` — Layer 2 follower watchdog at lines 91-118.
- Modify: `src/systems/combat/CombatantMovementCommands.ts` — Layer 2 rejoin timestamp + timeout in `handleRejoiningMovement`.
- Modify: `src/systems/combat/ai/AIStatePatrol.ts` — Layer 2 rejoin timeout at line 66 (engagement gate).
- Modify: `src/systems/combat/StuckDetector.ts` — no behavior change; only update its callers.
- Modify: `src/systems/combat/types.ts` — add optional `rejoinStartedAtMs?: number` to `Combatant`; `leaderIdleSinceMs?: number` to `Squad`.
- Modify: `src/config/CombatantConfig.ts` — add `NpcLodConfig` named export.
- Modify: `src/ui/debug/tuning/tuneCombat.ts` — surface the new tunables in the existing Tweakpane Combat folder so the user can A/B at runtime.
- Add: `src/systems/combat/CombatantLODManager.visualVelocityIntegration.test.ts` (or extend existing test file if it covers the LOD path) — behavior tests for Layer 1.
- Add: `src/systems/combat/CombatantMovementStates.followerWatchdog.test.ts` (or extend existing) — behavior tests for Layer 2 follower watchdog.
- Modify or extend: existing `StuckDetector.test.ts` callers' tests for Layer 3.

Caller grep first — `Grep "checkAndRecover"` — and update each call site that currently ignores 'hold'.

## Required reading first

- `docs/TESTING.md` — behavior tests only.
- `docs/INTERFACE_FENCE.md` — confirm `src/types/SystemInterfaces.ts` is NOT in your scope (it is not).
- `src/systems/combat/CombatantLODManager.ts` lines 35-115 (constants), 350-510 (bucket loops).
- `src/systems/combat/CombatantMovementStates.ts` lines 1-200.
- `src/systems/combat/CombatantMovementCommands.ts` (full file — find `handleRejoiningMovement` and the `isRejoiningSquad = true` set sites).
- `src/systems/combat/ai/AIStatePatrol.ts` lines 1-110.
- `src/systems/combat/StuckDetector.ts` (full file).
- `src/systems/combat/types.ts` lines 100-210.
- `src/config/CombatantConfig.ts` (full file — small).
- `src/ui/debug/tuning/tuneCombat.ts` (full file — small) — the pattern you must follow when wiring new knobs.
- `src/ui/debug/LiveTuningPanel.ts` — to see how the `tuneCombat` module is registered (you do NOT modify this; you mirror its `bindXxxKnobs` / `captureXxxDefaults` / `applyXxxState` pattern).

## Diagnosis

The user observes distant NPC groups standing still and "waking up" when the camera approaches. Three independent contributing causes, all confirmed in code:

1. **Visual-only path zeros velocity.** `CombatantLODManager.ts:382-387` — when `isAIBudgetExceeded`, high-LOD combatants get `updateCombatantVisualOnly()`. The medium-bucket equivalent at `:423` calls `updateCombatantBasic()`. Neither integrates the cached `velocity * dt`, so visually they sit still until the next full tick. Off-stagger high-LOD frames also take this path (`:401`).
2. **Culled distant sim too sparse.** `CombatantLODManager.ts:107` — `CULLED_DISTANT_SIM_INTERVAL_MS = 45000`. Beyond `lowLODRange` units only nudge along their waypoint every 45 s.
3. **Squad-leader idle propagation + rejoin without timeout.** `CombatantMovementStates.ts:91-118` — followers within `SQUAD_FOLLOW_DISTANCE=6 m` clamp to `velocity.set(0,0,0)` when the leader has no destination. `:79-82` short-circuits movement to `handleRejoiningMovement`. `AIStatePatrol.ts:66` short-circuits engagement on `isRejoiningSquad`. None of these have a timeout.
4. **StuckDetector emits 'hold' but callers do not exit state.** `StuckDetector.ts:209-219` returns `'hold'` after `MAX_CONSECUTIVE_BACKTRACKS=4`. Callers respond by holding; nobody clears `destinationPoint` or forces a re-target.

## Fix

### Layer 1 — visual-only velocity integration (config-gated)

In `CombatantLODManager.ts`, modify `updateCombatantVisualOnly` (search for the function — it lives in this file). When `NpcLodConfig.visualOnlyIntegrateVelocity` is true AND `combatant.velocity.lengthSq() > NpcLodConfig.idleEpsilonSq` AND `combatant.destinationPoint` is set AND the combatant is not already at its destination (use `DESTINATION_ARRIVAL_RADIUS` from `CombatantMovementStates.ts` as the reference; if not exported, a 5 m fallback is fine — but prefer exporting and reusing): integrate `combatant.position.x += combatant.velocity.x * deltaTime; combatant.position.z += combatant.velocity.z * deltaTime;`. Do NOT modify `position.y` — let the existing terrain Y-snap on the next visual or full tick correct height. Apply the same logic to the medium bucket's `updateCombatantBasic` budget-exceeded path (line 423-427) when it falls through.

Cost target: ≤ 0.05 ms for 3000 combatants. Verify by diff with the perf capture in the verification section.

### Layer 2 — rejoin timeout + squad watchdog (config-gated)

- Add `rejoinStartedAtMs?: number` to `Combatant` in `types.ts`.
- Add `leaderIdleSinceMs?: number` to `Squad` in `types.ts`.
- In `CombatantMovementCommands.ts`, find every place that sets `isRejoiningSquad = true` and stamp `rejoinStartedAtMs = performance.now()`. In `handleRejoiningMovement`, at the top: if `combatant.rejoinStartedAtMs && performance.now() - combatant.rejoinStartedAtMs > NpcLodConfig.rejoinTimeoutMs`, clear `isRejoiningSquad = false`, clear `rejoinStartedAtMs`, and `return` so the caller falls through to normal patrol on next tick.
- In `AIStatePatrol.ts:66`, same timeout check before the early return.
- For the follower watchdog: in `CombatantMovementStates.ts`, the leader's idle state is observable via `leader.velocity.lengthSq() < NpcLodConfig.idleEpsilonSq`. Track `squad.leaderIdleSinceMs`: when leader is idle and `leaderIdleSinceMs == null`, set to `now`. When leader is moving, clear it. (Do this in the follower path inside `updatePatrolMovement` — when you fetch the leader, also update its idle stamp on the squad. This avoids needing a new SquadManager hook.)
- At the `velocity.set(0,0,0)` line (`:114`): if `squad.leaderIdleSinceMs && now - squad.leaderIdleSinceMs > NpcLodConfig.squadFollowStaleMs`, the follower clears its `destinationPoint`, sets its own `lastZoneEvalTime = 0` so the leader-style block at `:120-189` re-scores zones for it on this tick (you can either fall through to that block by restructuring the function, OR call a small helper that runs the leader-style targeting logic with `combatant.position` as the reference). When the leader moves again the watchdog resets and follower returns to follower behavior next tick.

### Layer 3 — StuckDetector → forced state exit

Grep `checkAndRecover` and find every call site. When the result is `'hold'`, the caller must additionally:

- `combatant.destinationPoint = undefined;`
- `combatant.target = null;`
- `combatant.state = CombatantState.PATROLLING;`
- `combatant.lastZoneEvalTime = 0;`

Do NOT change `StuckDetector` itself — the detector's emission is correct; the bug is at the callers.

### Layer 4 — distant-sim cadence config-driven

Replace the hardcoded `private readonly CULLED_DISTANT_SIM_INTERVAL_MS = 45000;` (line 107) with a getter that reads `NpcLodConfig.culledDistantSimIntervalMs` (default 8000). Keep the existing `CULLED_LOOP_BUDGET_MS = 1.5` guard untouched — it self-throttles under pressure.

### NpcLodConfig export

In `src/config/CombatantConfig.ts`, add:

```ts
export const NpcLodConfig = {
  visualOnlyIntegrateVelocity: true,
  idleEpsilonSq: 0.04, // (0.2 m/s)^2
  rejoinTimeoutMs: 5000,
  squadFollowStaleMs: 4000,
  culledDistantSimIntervalMs: 8000,
};
```

Plain mutable object so Tweakpane can write through it directly. Avoid `Object.freeze`.

### Tweakpane wiring

In `src/ui/debug/tuning/tuneCombat.ts`, add four new keys (`combat.lod.visualOnlyIntegrateVelocity`, `combat.lod.rejoinTimeoutMs`, `combat.lod.squadFollowStaleMs`, `combat.lod.culledDistantSimIntervalMs`). Mirror the existing `bindCombatKnobs` pattern: bind each to `state`, on change write through to `NpcLodConfig`. `captureCombatDefaults` reads the current `NpcLodConfig` values; `applyCombatState` writes `state[key]` back. Use number ranges in the addBinding options (e.g. `min: 1000, max: 30000, step: 250` for ms values) so the UI gives a slider.

## Steps

1. Read all "Required reading first" files.
2. Add `NpcLodConfig` to `CombatantConfig.ts` and the new fields to `Combatant` / `Squad` in `types.ts`.
3. Implement Layer 1 in `CombatantLODManager.ts`. Run `npm run test:run -- CombatantLODManager` to confirm existing tests still pass.
4. Implement Layer 4 (Layer 4 is one-line: turn the constant into a getter from `NpcLodConfig`). Verify.
5. Implement Layer 3 across `checkAndRecover` callers.
6. Implement Layer 2 (rejoin timeout in `CombatantMovementCommands.ts` + `AIStatePatrol.ts`; follower watchdog in `CombatantMovementStates.ts`).
7. Wire knobs into `tuneCombat.ts`.
8. Add behavior tests: visual-only velocity integration; follower watchdog promotion + revert; rejoin timeout.
9. Add an integration test under `src/systems/combat/__tests__/`: spawn a 4-NPC squad with leader stuck on a synthetic obstacle (destinationPoint that is unreachable; leader velocity stays zero); after 600 ticks at 16 ms, assert ≥ 1 follower position has moved > 2 m.
10. Run `npm run lint`, `npm run test:run`, `npm run build`. All green.
11. Commit. Branch `task/npc-unfreeze-and-stuck`.
12. Push branch. **DO NOT run `gh pr create`.** Orchestrator will integrate the branch separately.
13. Report back per the format below.

## Verification (local)

- `npm run lint`
- `npm run test:run` — full suite green; new tests included.
- `npm run build`

## Non-goals

- Do NOT touch `src/types/SystemInterfaces.ts`. Hard fence.
- Do NOT change `StuckDetector` itself.
- Do NOT change `CombatantState` enum or add new states.
- Do NOT modify zone selection logic in `CombatantMovementStates.ts:120-189` beyond what Layer 2's follower-watchdog reuse requires.
- Do NOT touch `AIStateEngage` cover-search code (separate p99 anchor, deferred).
- Do NOT add a runtime UI for cycling stuck-detection — Tweakpane sliders are the surface.

## Hard stops

- Fence change required → STOP. Report.
- Diff > 400 lines → STOP. Reassess scope.
- Existing test fails and you cannot localize the cause to your changes → STOP. Report.

## Report back

```
task_id: npc-unfreeze-and-stuck
branch: task/npc-unfreeze-and-stuck
pr_url: NONE_NO_PR_REQUESTED
files_changed: <N files, +A -D lines>
verification:
  - npm run lint: PASS
  - npm run test:run: PASS (X tests, Y ms)
  - npm run build: PASS
playtest_required: yes
surprises: <one or two lines, or "none">
fence_change: no
```
