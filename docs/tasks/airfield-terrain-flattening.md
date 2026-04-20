# airfield-terrain-flattening: airfields need flat ground; bumps + cliff foundations break aircraft

**Slug:** `airfield-terrain-flattening`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P0 — root cause of repeated aircraft-takeoff failures across multiple cycles. Airframes ground-physics assumes a flat runway; bumps + sloped runway sections break it.
**Playtest required:** YES (bumpy ground + cliff edges visible).
**Estimated risk:** medium — touches the procedural placer + terrain feature compiler.
**Budget:** ≤ 400 LOC.
**Files touched:**

- Investigate: `src/systems/world/AirfieldLayoutGenerator.ts`, `src/systems/world/AirfieldTemplates.ts`, `src/systems/terrain/TerrainFeatureCompiler.ts`, the runway/apron `AirfieldSurfaceRect` consumer that flattens terrain (search for `flatten` or `placeAirfield`).
- Modify: the flattening pass to (a) cover the full airfield footprint including runway, taxiways, aprons, and structure-foundation bounding boxes; (b) refuse to place an airfield within N meters of a cliff edge (terrain slope > threshold) — pick a different candidate site instead.

## Symptoms (orchestrator playtest 2026-04-20)

User playtest, paraphrased:
- "the current airfield still has lots of issues like not a proper runway and taxi area"
- "there are still random bumps around and in the airfield"
- "airfield bases or buildings in general are still extending their foundations over the sides of cliffs in some places"

Combined with prior cycles' aircraft work: takeoff "kinda worked if we get enough speed and fly off a hill" — i.e. takeoff currently relies on hill-launch, which is a tell that the runway itself is not flat enough for the airframe to gather speed.

## Required reading first

- `src/systems/world/AirfieldLayoutGenerator.ts` (full file) — current placement + flattening logic.
- `src/systems/world/AirfieldTemplates.ts` (the runway/apron/taxiway rect definitions are at lines 38-48 — `AirfieldSurfaceRect` interface).
- `src/systems/terrain/TerrainFeatureCompiler.ts` — how runway flattening is consumed by the terrain mesh / vegetation scatter.
- `src/systems/world/WorldFeatureSystem.ts` — orchestrates feature placement.
- The chunk-streaming path: when does flattening apply (build-time vs runtime per-chunk)?

## Hypothesis (verify)

Two related bugs:

1. **Flattening footprint too small.** Currently flattens the runway rect but not the surrounding apron / taxiways / approach corridor / structure foundations. Needs a UNION of all airfield surfaces + a buffer.
2. **Site selection ignores slope.** Procedural placement picks a candidate spot without checking whether the underlying terrain has slope > N degrees within the footprint. When the candidate is on a hillside, flattening produces vertical cliffs at the airfield edge ("foundations over cliffs").

Fix:
- Extend the placer to compute a slope-stat over the candidate footprint; reject candidates above a threshold.
- Extend the flattening pass to cover the full footprint with a smooth blend at the edges (no hard cliff).

## Steps

1. Read all of "Required reading first."
2. In `npm run dev`, generate several `open_frontier` and `tdm` worlds with the same seed; observe airfield placement and bumps.
3. Add temporary Logger trace in the placer that logs slope statistics per candidate site.
4. Implement slope-rejection + extended flattening footprint.
5. Verify on multiple seeds that no airfield places on a cliff and no bumps appear in the runway / taxiway / apron.

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/airfield-terrain-flattening/`:

- `openfrontier-airfield-overview.png` — wide shot of airfield from a fixed elevated camera; runway should look flat, no cliffs at edges.
- `tdm-airfield-overview.png` — same.
- `openfrontier-runway-closeup.png` — ground-level runway shot; no visible bumps along the runway centerline.

## Exit criteria

- All airfields generated across 5 seeds per scenario have a flat runway + apron + taxiway with no visible bumps.
- No airfield's structure foundations extend over cliff edges.
- Aircraft can roll the full runway length without vertical position discontinuities.
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Do not redesign the airfield template schema.
- Do not change aircraft ground-physics tuning (separate `aircraft-ground-physics-tuning` task).
- Do not change runway dimensions globally — fix the placement / flattening only.

## Hard stops

- Fence change → STOP.
- Fix requires changing the navmesh baker → STOP, file separate task.
- Slope-rejection rejects 100% of candidates → STOP, lower threshold.

## Pairs with

`airfield-aircraft-orientation` (parking yaws), `aircraft-ground-physics-tuning` (airframe ground roll), `aircraft-a1-spawn-regression` (specific A-1 missing). All four together are the airfield/flight foundation theme of this cycle.
