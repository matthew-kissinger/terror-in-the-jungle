# Task: helicopter-model-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-14-fixed-wing-and-airframe-tests` (R2)

Follow [docs/tasks/_split-template.md](_split-template.md).

## Goal

Split `src/systems/helicopter/HelicopterModel.ts` (704 LOC) into 2
helpers. **Preserve the 2026-05-08 rotor-axis fix** (Cobra `z` for tail rotor,
Huey `z`, UH-1C Gunship `z`).

## Required reading

- `_split-template.md`
- `src/systems/helicopter/HelicopterModel.ts`
- `src/systems/helicopter/HelicopterAnimation.ts`
- `src/types/SystemInterfaces.ts` — `IHelicopterModel` is fenced; do NOT change it

## Files touched

- New: `src/systems/helicopter/helicopter/HelicopterStateMachine.ts` — flight assist tiers, altitude-lock, rotor-spin coordination (≤400 LOC)
- New: `src/systems/helicopter/helicopter/HelicopterDamageModel.ts` — damage application, passenger management (≤300 LOC)
- Each + `*.test.ts`
- Modified: `HelicopterModel.ts` — orchestrator ≤300 LOC, still `implements IHelicopterModel`
- Modified: `scripts/lint-source-budget.ts` — remove from GRANDFATHER

## Verification

Per template. **Manual rotor-axis check:** In playtest, spawn each of the
3 helicopters (Huey, UH-1C, Cobra) and visually confirm tail rotors spin
on the correct axis. AVIATSIYA-1 / DEFEKT-5 carry-over remains in the
`needs_human_decision` state regardless — this task verifies no regression,
not human acceptance.

## Reviewer: none required
## Playtest required: yes (helicopter rotor visual + flight feel)

## Branch + PR

- Branch: `task/helicopter-model-split`
- Commit: `refactor(helicopter): split HelicopterModel into stateMachine + damageModel (helicopter-model-split)`
