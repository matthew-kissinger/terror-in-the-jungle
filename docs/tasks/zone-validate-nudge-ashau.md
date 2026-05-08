# zone-validate-nudge-ashau: post-placement validate + nudge zones out of ditches (A Shau pilot)

**Slug:** `zone-validate-nudge-ashau`
**Cycle:** `cycle-2026-05-08-perception-and-stuck`
**Round:** 1
**Priority:** P1 — user reports the Zone Control zone closest to enemy HQ on A Shau is in a ditch; OPFOR NPCs route in and get stuck.
**Playtest required:** YES (visual confirm `zone_tiger` no longer sits in a ditch).
**Estimated risk:** low — runs once at world init; can be disabled per-zone via `validateTerrain: false`.
**Budget:** ≤300 LOC including tests.

## Files touched

- Modify: `src/systems/world/ZoneTerrainAdapter.ts` — extend `findSuitableZonePosition` with a local-minimum / ditch check; add a `validateAndNudge(zone, opts)` entrypoint; remove the hardcoded `Alpha zone` block at lines 56-75.
- Modify: `src/systems/world/ZoneManager.ts` — call `validateAndNudge` post-placement for any zone with `validateTerrain !== false`. Find the call site by reading the file (zone instantiation / setPosition path).
- Modify: `src/config/AShauValleyConfig.ts` — add an optional `validateTerrain?: boolean` field to the zone config shape (default true for non-HQ zones). HQ entries explicitly `validateTerrain: false`.
- Add: `src/systems/world/ZoneTerrainAdapter.test.ts` — behavior tests with a mock `ITerrainRuntime` that returns a synthetic ditch profile.
- Optional modify: `src/ui/debug/tuning/tuneCombat.ts` (or a new `tuneWorld.ts` if it doesn't exist) — surface `zoneMaxSlope` and `zoneDitchThresholdM` for live tuning. NICE-TO-HAVE; skip if budget tight.

## Required reading first

- `docs/TESTING.md`
- `docs/INTERFACE_FENCE.md` — confirm `ITerrainRuntime` is fenced; you'll only USE it, not change it.
- `src/systems/world/ZoneTerrainAdapter.ts` (full file — 107 lines).
- `src/systems/world/ZoneManager.ts` (full file).
- `src/config/AShauValleyConfig.ts` lines 540-755 (zone definitions; locate `zone_tiger`).
- `src/types/SystemInterfaces.ts` — locate `ITerrainRuntime.getHeightAt` to confirm the contract.

## Diagnosis

`ZoneTerrainAdapter.findSuitableZonePosition` (line 23) already does a 12-sample spiral flat search — but it isn't called for the hand-authored A Shau zones, and it has a fragile `Alpha zone`-specific hack at lines 56-75 keyed off `Math.abs(bestPosition.x + 120) < 10`. The user reports `zone_tiger` (closest capturable to NVA HQ "Base Area 611") sits in a depression so OPFOR NPCs route in and bunch up. `InfluenceMapComputations.ts:96-150` continues attracting NPCs to the broken zone center.

## Fix

### C1 — Generalize ZoneTerrainAdapter

Extend `findSuitableZonePosition` (or add a sibling `validateAndNudge`):

1. Sample center height + slope (existing `getHeightAt`, `calculateTerrainSlope`).
2. Compute mean height of an 8-sample ring at 25 m radius around the center.
3. If `centerSlope > zoneMaxSlope` (default 0.25) OR `centerHeight < ringMean - zoneDitchThresholdM` (default 4 m), search a 12-direction × 3-distance ring (15 m, 30 m, 45 m) for a flatter, not-lower cell. "Not lower" means the candidate's height is ≥ `centerHeight - 1 m` (small fudge avoids ping-ponging on noisy terrain).
4. If a better cell is found, log `Logger.info('world', ...)` with original→new and update `zone.position`.
5. If no better cell within 45 m, log `Logger.warn('world', ...)` and leave authored coord (don't drift across the map).
6. **Remove** the hardcoded Alpha-zone block at lines 56-75 — generalized check supersedes it. If a test in `ZoneTerrainAdapter.test.ts` (none exists today) was depending on the hack, replace it with the general behavior test.

Constants live at the top of `ZoneTerrainAdapter.ts`:

```ts
const ZONE_VALIDATE_MAX_SLOPE = 0.25;
const ZONE_VALIDATE_DITCH_THRESHOLD_M = 4;
const ZONE_VALIDATE_RING_RADIUS_M = 25;
const ZONE_VALIDATE_RING_SAMPLES = 8;
const ZONE_VALIDATE_NUDGE_DISTANCES_M = [15, 30, 45];
const ZONE_VALIDATE_NUDGE_DIRECTIONS = 12;
const ZONE_VALIDATE_HEIGHT_FUDGE_M = 1;
```

### C2 — ZoneManager wiring

In `ZoneManager.ts`, find where zones are instantiated/positioned (likely an init path that copies `position` from config). After the position is set, if `zone.validateTerrain !== false` AND a `ZoneTerrainAdapter` reference is available, call `terrainAdapter.validateAndNudge(zone)` which mutates `zone.position` in place (or returns a new vector you assign).

Some zones (HQs, fixed map landmarks) should explicitly opt out via `validateTerrain: false`. In `AShauValleyConfig.ts`, set `validateTerrain: false` on `opfor_hq_main`, `blufor_hq_main`, and any zone whose authored coordinate is sacrosanct (airfield zones, named landmarks). Default for everything else: undefined → true.

### C3 — Remove Alpha-zone hack

Lines 56-75 of `ZoneTerrainAdapter.ts` — delete. Generalized check covers Alpha now. If you discover that the Alpha zone behaves badly under the generalized check during local verification, raise `validateTerrain: false` on it as a one-line config hack (with a comment) rather than reinstating the special-case code.

## Steps

1. Read all "Required reading first" files.
2. Implement C1 in `ZoneTerrainAdapter.ts`. Keep the existing `findSuitableZonePosition` signature stable for any other callers (search uses).
3. Implement C2 in `ZoneManager.ts`.
4. Add `validateTerrain` field to A Shau zones in config. Default true everywhere except HQs and airfield zones.
5. Delete the Alpha-zone hack.
6. Write `ZoneTerrainAdapter.test.ts`:
   - Mock `ITerrainRuntime` returning a synthetic ditch profile (center 5 m below ring mean) → assert nudge moves zone to ring height.
   - Flat terrain → no movement.
   - Steep slope but no ditch → still moves.
   - No flat candidate within 45 m → leaves zone in place; warn logged.
   - Nudges stay within 45 m of original.
7. Optional: surface knobs in `tuneCombat.ts` (or new `tuneWorld.ts`).
8. `npm run lint && npm run test:run && npm run build`. Green.
9. Commit. Branch `task/zone-validate-nudge-ashau`.
10. Push branch. **DO NOT run `gh pr create`.** Orchestrator integrates separately.
11. Report.

## Verification (local)

- `npm run lint`
- `npm run test:run`
- `npm run build`
- Eyeball the log: spawn the engine in dev mode against A Shau Zone Control (or run the relevant integration test if one exists) and confirm a `Zone placed at ...` info line for `zone_tiger` with nudged coords.

## Non-goals

- Do NOT touch `TerrainFeatureCompiler` stamps. Flattening would invalidate the navmesh prebake cache.
- Do NOT modify the influence map (`InfluenceMapComputations.ts`). Nudging the zone center fixes attraction at the source.
- Do NOT generalize to all maps. Pilot is A Shau only. Open Frontier and procedural maps default to `validateTerrain: false` if their zones are confirmed safe; if not specified, default true is fine, but verify their tests don't break.
- Do NOT touch `src/types/SystemInterfaces.ts`.

## Hard stops

- Fence change required → STOP.
- A Shau navmesh hash changes (post-nudge zone positions force a re-bake) → STOP and report. We may need to ship the validator with prebake-reset coordination, which is out of scope here.
- Diff > 300 lines → STOP and reassess.

## Report back

```
task_id: zone-validate-nudge-ashau
branch: task/zone-validate-nudge-ashau
pr_url: NONE_NO_PR_REQUESTED
files_changed: <N files, +A -D lines>
verification:
  - npm run lint: PASS
  - npm run test:run: PASS (X tests, Y ms)
  - npm run build: PASS
playtest_required: yes
surprises: <one or two lines, or "none">
fence_change: no
zone_tiger_before_after: <original (x,y,z) → nudged (x,y,z), or NO_NUDGE if validator left it in place>
```
