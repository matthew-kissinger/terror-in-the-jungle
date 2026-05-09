# Task: zone-decoupling-batch-c-owners

Last verified: 2026-05-09

Cycle: `cycle-2026-05-10-zone-manager-decoupling` (Phase 2, Round 2)

## Goal

Final consumer batch + cleanup. Migrate PlayerRespawn (last
state-driven consumer) and remove the `setZoneManager` adapter shims
left by batches A and B. Update `docs/ARCHITECTURE.md` fan-in heatmap.

## Required reading first

- `docs/rearch/zone-manager-decoupling.md`
- `src/systems/player/PlayerRespawnManager.ts`
- `docs/ARCHITECTURE.md` (the "Coupling Heatmap" section)

## Files touched

- `src/systems/player/PlayerRespawnManager.ts` — migrate to IZoneQuery + events
- All composers that wired `setZoneManager(zm)` — drop the legacy adapter shims; rename setter sites to `setZoneQuery(zoneManager)` (since ZoneManager implements IZoneQuery, the same instance flows through)
- `docs/ARCHITECTURE.md` — update ZoneManager fan-in row from 11 to ≤5; add IZoneQuery row
- `scripts/lint-source-budget.ts` — remove `src/systems/world/ZoneManager.ts` from `GRANDFATHER` (Phase 2 closes this entry)

## Steps

1. `npm ci --prefer-offline`.
2. Migrate PlayerRespawnManager (IZoneQuery + event subscription).
3. Drop the `setZoneManager` adapter shims left in batches A/B's consumers. Each composer that used `setZoneManager(zm)` calls `setZoneQuery(zm)` instead — same instance, ZoneManager's `implements IZoneQuery` lets it flow.
4. Verify ZoneManager direct imports under `src/`: `grep -rn "import.*ZoneManager.*from" src/` — should be ≤5 (the implementer file itself, the composer that constructs it, and any ZoneManager-internal helpers).
5. Update `docs/ARCHITECTURE.md` fan-in heatmap. ZoneManager drops out of top-3.
6. Remove `src/systems/world/ZoneManager.ts` from `scripts/lint-source-budget.ts` `GRANDFATHER` map.
7. Run the **parity test**: `src/integration/scenarios/zone-decoupling-parity.test.ts`. (This test should be created by zone-manager-design-memo if not already; if it doesn't exist, this task creates it as part of the migration.)
8. Run lint, typecheck, test:run, combat120 perf compare.
9. Run a 10-min playtest covering: zone capture, ticket drain, respawn, war-sim updates.

## Verification

- `grep -c "import.*ZoneManager.*from" src/` ≤ 5
- ZoneManager fan-in in `docs/ARCHITECTURE.md` ≤20
- ZoneManager NOT in `scripts/lint-source-budget.ts` GRANDFATHER
- Parity test passes byte-identical at frame 3,600
- combat120 p99 within ±2%
- Playtest signoff

## Reviewer: combat-reviewer pre-merge

## Playtest required: yes (10-min)

## Branch + PR

- Branch: `task/zone-decoupling-batch-c-owners`
- Commit: `refactor(world+player): zone-decoupling batch C — PlayerRespawn + adapter cleanup (zone-decoupling-batch-c-owners)`
