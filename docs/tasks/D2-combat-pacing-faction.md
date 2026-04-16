# Task D2: Combat pacing & faction doctrine starter

**Phase:** D (serial, after D1 merged)
**Depends on:** D1
**Blocks:** nothing in this run
**Playtest required:** yes (this changes combat feel)
**Estimated risk:** high (pacing is game-feel heavy, can go wrong)
**Files touched:** `src/systems/combat/ai/**`, possibly `src/systems/strategy/**` (A Shau doctrine), new `docs/COMBAT.md` updates

## Goal

Take a first, scoped step toward faction doctrine: VC / NVA / US / ARVN should not all behave identically. Land one observable differentiation per faction without overhauling the AI state machine.

## Required reading first

- `docs/COMBAT.md` (from D1).
- `docs/TESTING.md`, `docs/INTERFACE_FENCE.md`.
- `docs/BACKLOG.md` — faction doctrine section.
- Existing AI state: `src/systems/combat/ai/AIState*.ts`.
- Strategic layer (A Shau): `src/systems/strategy/**`.

## Proposed scope (pick ONE differentiation per faction, aim small)

- **VC:** prefer concealment, fire from cover, retreat faster under suppression. (guerrilla)
- **NVA:** closer formations, commit to assaults, slower to retreat. (conventional)
- **US:** combined arms — prioritize calling for helicopter / air support when available. (doctrine uses existing helicopter/fixed-wing)
- **ARVN:** hybrid; lean on US support, solid defense of held positions.

One small tunable per faction. Examples: "suppression threshold before retreat" is lower for VC, higher for NVA. That's a constant per faction, one location.

## Required reading (deeper)

- `src/systems/combat/ai/AIStateEngage.ts`
- `src/systems/combat/ai/AIStateDefend.ts`
- Any existing faction-specific config in `src/config/`.

## Steps

1. Propose the single differentiation per faction in a design note first, comment in the PR description.
2. Land the minimum code change to make each faction observably different in one dimension.
3. Do not introduce a new state machine, new AI behaviors, or a new squad doctrine system. Thin parameter layer.
4. Behavior test: VC retreats at a lower suppression threshold than NVA under identical conditions. Confirm.

## Verification

- `npm run lint`, `npm run test:run`, `npm run build` green.
- Perf captures show no regression.
- **Playtest:** spawn one of each faction vs the player. Observe that each behaves visibly differently in the one dimension you chose.

## Non-goals

- **Do not introduce a new AI framework.** Thin parameter layer only.
- Do not add utility-AI, GOAP, behavior trees, or any planning system.
- Do not touch vehicle AI or pilot AI.
- Do not expand scope to ~15 doctrine parameters. One per faction.

## Exit criteria

- One observable differentiation per faction lands.
- No regressions in existing scenarios.
- PR titled `feat(combat): scoped faction doctrine starter (D2)`.
- PR body describes exactly what differentiates each faction.
- Flagged **playtest-pending**.
