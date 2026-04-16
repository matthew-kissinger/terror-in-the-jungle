# Task B1: NPC combat response — pass player as attacker

**Phase:** B (parallel)
**Depends on:** Foundation
**Blocks:** A2, D1
**Playtest required:** yes (this changes observable combat feel)
**Estimated risk:** medium
**Files touched:** `src/systems/combat/CombatantCombat.ts`, `src/systems/combat/CombatantDamage.ts` (if needed for attacker type), possibly `src/systems/combat/ai/AITargetAcquisition.ts`, matching tests

## Problem

Currently, the player-shot damage path in `CombatantCombat.ts` calls `applyDamage(target, damage, undefined, undefined, headshot)` with `attacker=undefined`. The NPC AI has no reference to "who shot me," so retaliation, suppression-based turning, and kill attribution logic that depends on attacker do not fire. Observable symptom: enemy NPCs (red faction) take damage from player shots but do not react — do not turn, suppress, fire back, or flee.

Secondary symptom: `KillAssistTracker.trackDamage` is skipped, so assist credit is lost on player-to-NPC chains.

Root cause confirmed pre-existing since commit `1f2748a` (Feb 3 2026 refactor split). See `src/systems/combat/CombatantCombat.ts:310` and `src/systems/combat/ai/AITargetAcquisition.ts:82-88`.

## Goal

Enemy NPCs visibly respond to being shot by the player — they orient toward the shot source, raise their suppression level, and either return fire (if they can acquire the player visually) or attempt to take cover. Allied NPCs (ARVN) behavior is unchanged.

## Required reading first

- `docs/TESTING.md` — write behavior tests, not implementation tests.
- `docs/INTERFACE_FENCE.md` — `CombatantCombat`, `CombatantDamage`, `AITargetAcquisition` are implementations, not fenced interfaces. Safe to modify.
- `src/systems/combat/CombatantCombat.ts` (especially line 310 context)
- `src/systems/combat/CombatantDamage.ts` (applyDamage + handleDeath)
- `src/systems/combat/ai/AITargetAcquisition.ts` (the `_playerTarget` pattern already exists — mirror for attacker)

## Proposed fix shape (for implementer to validate, not prescribe)

- Build a player-proxy `Combatant`-like reference with `id='PLAYER'`, `faction=playerFaction`, `position=playerPosition`, kept updated (similar to the `_playerTarget` in `AITargetAcquisition`).
- On the player-shot path in `CombatantCombat.ts:310`, pass this proxy as `attacker`.
- In `CombatantDamage.applyDamage`, the existing `target.suppressionLevel += 0.3` and `target.lastHitTime = Date.now()` already fire — verify the NPC AI state machine actually reads `lastHitTime` / `suppressionLevel` and acts on them. If not, wire a "threat bearing from attacker position" signal into the AI.
- If the AI reads `attacker.position` directly anywhere and assumes full Combatant shape, ensure the proxy satisfies the shape or gate those paths on `attacker.id !== 'PLAYER'`.
- Keep the change surgical. Do not rewrite combat AI. Do not change fenced interfaces.

## Verification

- `npm run lint`, `npm run test:run`, `npm run build` green.
- New behavior test: shooting an enemy NPC flags the target's `lastHitTime` and raises `suppressionLevel`, and the NPC's AI state transitions toward engagement / threat-orient within a small number of ticks.
- **Playtest (required):** load combat120 or Open Frontier, fire on a red-faction NPC from concealment at 30-50m. NPC should react within ~2 seconds — orient, take cover, or return fire. Allied orange NPCs should behave unchanged.

## Non-goals

- Do not fix the NPC terrain stall loop (that's B3).
- Do not overhaul faction doctrine AI.
- Do not touch the fenced interfaces.
- Do not add a new subsystem for player-as-combatant. Keep it a proxy.

## Exit criteria

- Player shots pass a non-undefined attacker.
- Red NPCs visibly react to player shots in playtest.
- New behavior test exists and passes.
- PR titled `fix(combat): wire player-as-attacker into NPC damage path (B1)`.
- PR body describes the proxy shape, the AI wiring (if any), and includes a playtest note.
- Flagged **playtest-pending** for human.
