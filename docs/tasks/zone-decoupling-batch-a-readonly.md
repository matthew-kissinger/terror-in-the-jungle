# Task: zone-decoupling-batch-a-readonly

Last verified: 2026-05-09

Cycle: `cycle-2026-05-10-zone-manager-decoupling` (Phase 2, Round 2)

## Goal

Migrate the 4 read-only ZoneManager consumers (HUD, Compass, Minimap,
FullMap) from holding a `ZoneManager` reference to holding an
`IZoneQuery` reference.

## Required reading first

- `docs/rearch/zone-manager-decoupling.md`
- `src/types/SystemInterfaces.ts` (IZoneQuery now landed via izone-query-fence)
- `docs/TESTING.md`

## Files touched (consumer surfaces — confirm exact paths via grep first)

- HUD: `src/ui/hud/HUDSystem.ts` and any `src/ui/hud/Compass*.ts`
- Minimap: `src/ui/MinimapSystem.ts` (or wherever the file actually lives — grep `class Minimap`)
- FullMap: `src/ui/map/FullMapSystem.ts`
- Wiring: `src/core/composers/StartupPlayerRuntimeComposer.ts` or whichever composer wires HUD/Minimap

For each consumer:
- Replace `private zoneManager: ZoneManager` with `private zoneQuery: IZoneQuery`
- Replace setter `setZoneManager(zm)` with `setZoneQuery(q)` — keep the old setter as a thin adapter for one cycle (`setZoneManager(zm) { this.setZoneQuery(zm); }`) so wiring composers don't break in this batch
- Update method calls — they should all already be on `IZoneQuery` per the design memo

## Steps

1. `npm ci --prefer-offline`.
2. Read the design memo's batch-A list. Confirm the 4 consumers are the same.
3. Migrate each consumer. Run `npm run typecheck` after each one to catch shape errors early.
4. For each consumer's tests, the setter rename may bite. Update the test mock if needed — keep behavior assertions, only change the shape of the mock.
5. Run `npm run lint`, `npm run typecheck`, `npm run test:run` — green.
6. Run `npm run perf:capture:combat120` — within ±2% of baseline.

## Verification

- `grep -l "private.*zoneManager:.*ZoneManager" src/ui/` — should NOT match HUD/Minimap/FullMap/Compass
- `grep -l "private.*zoneQuery: IZoneQuery" src/ui/` — should match all 4
- `npm run lint`, `npm run typecheck`, `npm run test:run` — green
- combat120 perf within ±2%

## Non-goals

- Do NOT migrate batch-B or batch-C consumers — separate tasks.
- Do NOT remove the legacy `setZoneManager` adapter shim. Batch-C cleans it up after all batches land.
- Do NOT touch `src/types/SystemInterfaces.ts` — fence is closed for this task.

## Branch + PR

- Branch: `task/zone-decoupling-batch-a-readonly`
- Commit: `refactor(world): zone-decoupling batch A — read-only HUD/Minimap/FullMap consumers (zone-decoupling-batch-a-readonly)`

## Reviewer: none required (UI-only consumers; no combat / terrain / nav touched)

## Playtest required: no
