# Task: zone-manager-design-memo

Last verified: 2026-05-09

Cycle: `cycle-2026-05-10-zone-manager-decoupling` (Phase 2, Round 1)

## Goal

Author the design memo `docs/rearch/zone-manager-decoupling.md` that
catalogs all 11 fan-in callers of `ZoneManager`, classifies their calls,
and proposes the `IZoneQuery` interface shape and the batched migration.

## Why

ZoneManager has fan-in 52 — highest in the repo. Splitting Combat /
HUD / FullMap god-modules in Phase 3 will re-create the coupling
without this decoupling first. The memo is the design artifact the
`izone-query-fence` PR cites.

## Required reading first

- `src/systems/world/ZoneManager.ts` (full)
- `src/types/SystemInterfaces.ts` (the fence — note its current shape)
- `docs/INTERFACE_FENCE.md` (PR convention)
- `docs/ARCHITECTURE.md` (fan-in heatmap, communication patterns)

## Files touched

- New: `docs/rearch/zone-manager-decoupling.md` (≤400 LOC, with
  `Last verified: <today>` header)

## Steps

1. Grep for direct ZoneManager imports under `src/`. List all files.
2. For each file, list the methods called on the ZoneManager reference.
3. **Classify each call:**
   - `state-mutation` — caller mutates ZoneManager state (capture, etc.) → ZoneManager keeps; rename caller's path to event-publish if possible
   - `state-read` — caller reads zone state (getZoneAt, getZoneInfo, etc.) → migrate to `IZoneQuery`
   - `event-driven` — caller subscribes to "zone X captured" or similar → migrate to GameEventBus subscription
4. Define `IZoneQuery` interface — read-only methods only. Recommended starter shape:
   ```ts
   export interface IZoneQuery {
     getZoneAt(position: THREE.Vector3): ZoneInfo | undefined;
     getZoneById(id: string): ZoneInfo | undefined;
     getAllZones(): readonly ZoneInfo[];
     getCapturableZones(): readonly ZoneInfo[];
   }
   ```
   The actual shape comes from the audit. Validate against ALL state-read
   call sites to make sure nothing's missed.
5. Define the migration batches:
   - **Batch A (readonly):** HUD, Compass, Minimap, FullMap — straight swap
   - **Batch B (state-driven):** Combat, Tickets, WarSim — events + IZoneQuery
   - **Batch C (owners):** PlayerRespawn, ZoneManager-internal — last
6. Document the parity test plan — what scenario, what assertions.

## Verification

- `wc -l docs/rearch/zone-manager-decoupling.md` ≤400
- The memo answers: how many caller sites? Per-site classification? IZoneQuery shape? Migration batches? Parity test plan?
- `npm run lint:docs` — no new failures

## Non-goals

- Do NOT modify `src/types/SystemInterfaces.ts` — that's `izone-query-fence`'s job
- Do NOT modify any consumer file — that's the batch tasks' job
- Do NOT rewrite ZoneManager itself

## Branch + PR

- Branch: `task/zone-manager-design-memo`
- Commit: `docs(rearch): zone-manager decoupling memo (zone-manager-design-memo)`

## Playtest required: no
