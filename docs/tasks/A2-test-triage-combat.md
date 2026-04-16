# Task A2: Test triage — combat

**Phase:** A (parallel)
**Depends on:** B1 (must merge first)
**Blocks:** D1
**Playtest required:** no
**Estimated risk:** medium (combat is load-bearing; test prune must not drop real coverage)
**Files touched:** `src/systems/combat/**/*.test.ts`, possibly `src/test-utils/combat*` helpers

## Goal

Reduce implementation-mirror tests in `src/systems/combat/` by 30-50% without losing behavior coverage. Preserve coverage of: damage propagation, suppression response, target acquisition, cover search, hit registration, LOS rules, kill attribution.

## Why this task waits for B1

B1 changes the player-shot damage path: the player will be passed as an explicit `attacker` (proxy) rather than `undefined`. Tests written against the old behavior will fail. Run A2 after B1 merges so the new contract is the one under test.

## Required reading first

- `docs/TESTING.md`
- `docs/INTERFACE_FENCE.md`
- The PR that merged B1 (read its diff, understand the new attacker contract).

## Scope

Test files in `src/systems/combat/` and subfolders:
- `CombatantCombat.test.ts`
- `CombatantDamage.test.ts`
- `CombatantRenderer.test.ts`
- `CombatantMovement.test.ts` (if present)
- `RallyPointSystem.test.ts`
- `ai/AIStateEngage.test.ts`
- `ai/AIStatePatrol.test.ts`
- `ai/AIStateDefend.test.ts`
- Any other `*.test.ts` under `src/systems/combat/`

## Steps

Follow the pruning procedure in `docs/TESTING.md`:

1. Classify each `it()` block: behavior / implementation-mirror / redundant / broken.
2. Rewrite implementation-mirrors as behavior assertions where the underlying intent is real.
3. Delete pure implementation-mirrors and redundants.
4. Add (or preserve) these load-bearing behavior tests if missing:
   - Player shots pass an attacker reference and the target's last-hit metadata reflects it (new contract from B1).
   - Squad enters suppression state within N frames of taking fire.
   - NPC retargets from dead enemy to next closest within 1 AI tick.
   - Cover search respects the per-frame budget cap.
   - Kill attribution credits the correct faction and weapon.

## Verification

- `npm run lint`, `npm run test:run`, `npm run build` green.
- Manual inspection: did you preserve coverage of the bullet-point behaviors above?

## Non-goals

- Don't modify combat implementation files (except to fix a test that caught a real bug — then raise it explicitly).
- Don't touch the fenced interfaces.
- Don't expand combat to a new subsystem (that's D1).

## Exit criteria

- Test count in `src/systems/combat/` dropped by 30-50%.
- Listed behaviors still covered.
- PR titled `test: prune combat test drift (A2)`.
- PR body lists before/after counts and a section headed "Behaviors still covered" confirming the load-bearing list.
