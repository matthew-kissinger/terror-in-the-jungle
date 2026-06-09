# fire-gate-ordering

`tryFireWeapon` calls `gunCore.registerShot()` BEFORE the terrain-blocked and
raycast-budget gates, so a shot that never happens still consumes fire-rate
cooldown and accumulates bloom — NPCs behind cover or over budget fire slower
and less accurately than designed once the gates kick in. Move shot
registration after the gates. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 3.)

## Files touched

- `src/systems/combat/CombatantCombat.ts` (tryFireWeapon)
- sibling behavior test (extended)

## Scope

1. Reorder `tryFireWeapon` so `gunCore.registerShot()` (and any other
   fire-rate/bloom mutation) happens only after the terrain-blocked and
   raycast-budget gates pass — an aborted shot leaves fire-rate and bloom
   untouched.
2. Behavior test: a terrain-blocked attempt does not advance the fire-rate
   clock or bloom; the next unblocked attempt fires immediately.

## Non-goals

- Changing the gates themselves (LOS semantics, budget thresholds).
- Fire-rate/bloom tuning values.
- DEFEKT-6 (fire-through-terrain authority) — separate directive.

## Acceptance

- [ ] Test above passes; the cooldown-eaten-by-aborted-shot repro fails on
      master first (state before/after in your report).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
- [ ] combat-reviewer signs off pre-merge.
