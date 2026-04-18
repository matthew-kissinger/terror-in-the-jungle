# Task E1: ECS migration spike (bitECS)

**Phase:** E (parallel R&D track, decision memo only)
**Depends on:** Foundation
**Blocks:** Batch F planning (not this run)
**Playtest required:** no (R&D, not merged to master)
**Estimated risk:** low (throwaway branch, no master impact)
**Files touched:** throwaway branch only; deliverable is a decision memo

## Goal

Decide whether to migrate high-count entities (projectiles, combatants, or both) from the current object-graph model to a `bitECS` entity-component-system model. Produce a decision memo backed by prototype measurement data.

## Vision anchor

3,000-agent combat target. Current 120-NPC p99 already sits at ~34ms. Cache behavior of scattered-heap objects will hit a wall somewhere between 800 and 2000 entities. ECS stores components in typed arrays (struct-of-arrays), typically 10-100x better cache behavior for hot loops.

## Required reading first

- `docs/REARCHITECTURE.md` — the E1 section with decision framework.
- `docs/INTERFACE_FENCE.md` — if your prototype suggests interface changes, flag them in the memo, don't change them in the spike.
- Current `src/systems/combat/CombatantSystem.ts`, `src/systems/combat/CombatantCombat.ts`, `src/systems/combat/CombatantMovement.ts`.
- `bitECS` README and examples (installed dep? check `package.json`). If not installed, that's fine — the spike can install it in a throwaway branch.

## Steps

1. Create a throwaway branch (`spike/e1-ecs`).
2. Pick ONE subsystem to port: either projectiles or combatants (pick the smaller of the two if they're unequal).
3. Port the minimum viable slice: position + velocity + one behavior (e.g. damage application, or simple forward motion).
4. Keep the port in a new file; don't modify existing combatant/projectile code.
5. Build a microbench harness: spawn N entities, tick the system M times, measure ms/tick.
6. Run at N = 120, 500, 1000, 2000, 3000 for both OLD (current code) and NEW (bitECS port). Record.
7. Write the decision memo.

## Deliverable: decision memo

File: `docs/rearch/E1-ecs-evaluation.md` (create the `docs/rearch/` directory).

Sections:

1. **Question** (one line).
2. **Subsystem chosen** and why.
3. **Port description** (what you ported, what you stubbed out).
4. **Measurements** (throughput table at N = 120/500/1000/2000/3000, old vs new).
5. **Cost estimate** (how long to port the remaining combatant/projectile code to bitECS if we commit).
6. **Value estimate** (how much headroom does this buy us? Which vision anchors does it unlock?).
7. **Reversibility** (what's the rollback if the full port fails?).
8. **Recommendation** (do it / prototype more / defer / no, with one-sentence rationale).

## Verification

- Memo exists at the specified path.
- Measurements reproducible (include the command to run the microbench).
- Spike branch pushed but not merged.

## Non-goals

- **Do not merge the spike to master.** This is R&D.
- Do not port multiple subsystems. Pick one.
- Do not build abstractions to make bitECS look like OOP. Measure the native form.
- Do not change fenced interfaces.
- Do not update production code based on the spike.

## Exit criteria

- Decision memo committed to a throwaway branch (or submitted as a PR that lands only the memo, not the code).
- Prototype data is decisive enough for a human to make a go/no-go call.
- Orchestrator flags memo delivered and moves on. No merge to master until Batch F.
