# tank-cannon-wiring

`TankPlayerAdapter.setCannonSystem` and `M2HBEmplacement.attachPlayerAdapter`
have zero prod callers — the player tank cannon and M2HB emplacement can never
actually fire, even now that Phase 1's real-mouse-input restored the LMB input
path. This task wires both in the operational composer so seated LMB fire goes
live end-to-end. (Campaign:
`docs/CAMPAIGN_2026-06-09-consultation-remediation.md`, Phase 2; completes the
Phase 1 exit-gate smoke clause.)

## Files touched

- `src/core/OperationalRuntimeComposer.ts` (or the actual prod composition
  point — `src/systems/vehicle/M48TankSpawn.ts` constructs prod Tanks; follow
  the wiring from there and name the true site in your report)
- `src/systems/vehicle/TankPlayerAdapter.ts`
- `src/systems/combat/weapons/M2HBEmplacement.ts`
- sibling behavior tests (new or extended)

## Scope

1. Wire `setCannonSystem` so the player-driven M48's cannon system is attached
   when the tank session starts (and detached/cleaned on exit/dispose).
2. Wire `M2HBEmplacement.attachPlayerAdapter` at the prod composition point so
   a player mounting an M2HB attaches the adapter (and detaches on dismount).
3. L3 repro-first test: player seated in tank/emplacement + held LMB →
   cannon/M2HB fire path actually invoked (shot registered), release → stops.

## Non-goals

- New weapon behavior, damage tuning, or FX changes.
- NPC gunner paths (already wired via orderBoard).
- Input-layer changes (Phase 1 landed them).

## Acceptance

- [ ] Repro-first test demonstrates the fire path was dead on master (zero
      prod callers) and is live after wiring.
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
- [ ] combat-reviewer signs off pre-merge (touches `src/systems/combat/**`).

## Dependencies

- Depends on: real-mouse-input (Phase 1 — merged, `040337e7`).
