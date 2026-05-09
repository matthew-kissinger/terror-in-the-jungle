# Task: zone-decoupling-batch-b-state-driven

Last verified: 2026-05-09

Cycle: `cycle-2026-05-10-zone-manager-decoupling` (Phase 2, Round 2)

## Goal

Migrate the 3 state-driven ZoneManager consumers (Combat, Tickets,
WarSimulator) to use `IZoneQuery` for reads + GameEventBus
subscriptions for state-change events.

## Required reading first

- `docs/rearch/zone-manager-decoupling.md` (batch B classification)
- `src/types/SystemInterfaces.ts` (IZoneQuery)
- `src/core/GameEventBus.ts` (event publish + subscribe shape)
- `src/systems/world/ZoneManager.ts` (verify it's already publishing the events the consumers need; if not, this brief expands)

## Files touched

- `src/systems/combat/CombatantSystem.ts` (or whichever combat file imports ZoneManager — grep first)
- `src/systems/world/TicketSystem.ts`
- `src/systems/strategy/WarSimulator.ts`

For each:
- Replace `ZoneManager` field with `IZoneQuery`
- Replace per-frame state polls (`isZoneCaptured(id)`) with event-subscription state cache
- Subscribe to events ZoneManager publishes (e.g. `'zone:captured'`, `'zone:contested'`)

## Steps

1. `npm ci --prefer-offline`.
2. Inspect ZoneManager: does it currently publish events on capture / contest / loss? List them.
3. If a needed event is missing, **add it as part of this task** (within ZoneManager only — no fence change). Document in the PR.
4. For each consumer:
   - Replace direct ZoneManager calls with IZoneQuery (reads) + event subscription (state changes)
   - Maintain a local cache of last-known state, updated on event
5. Run lint, typecheck, test:run.
6. Run combat120 perf — within ±2%.
7. **Run a 5-minute manual playtest** — capture a zone in OF / TDM / Zone Control. Confirm tickets drain, combat AI responds, war-sim updates count.

## Verification

- `grep -l "ZoneManager" src/systems/combat src/systems/world/TicketSystem.ts src/systems/strategy/WarSimulator.ts` — should not match (only IZoneQuery + GameEventBus)
- `npm run perf:capture:combat120` p99 ±2%
- Playtest signoff in PR description

## Reviewer: combat-reviewer pre-merge (touches combat/strategy/tickets — combat-reviewer scope)

## Playtest required: yes (5-min zone-capture playtest)

## Branch + PR

- Branch: `task/zone-decoupling-batch-b-state-driven`
- Commit: `refactor(world+combat): zone-decoupling batch B — events + IZoneQuery for Combat/Tickets/WarSim (zone-decoupling-batch-b-state-driven)`
