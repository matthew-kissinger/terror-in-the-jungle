# atmosphere-day-night-cycle: animate sun direction over time

**Slug:** `atmosphere-day-night-cycle`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P1 — explicit user request from cycle-2026-04-20 playtest ("we want to have a day and night cycle... it does not get dark").
**Playtest required:** YES.
**Estimated risk:** medium — touches the static-preset model from cycle-2026-04-20; needs to coexist with per-scenario tuning.
**Budget:** ≤ 250 LOC.
**Files touched:**

- Modified: `src/systems/environment/AtmosphereSystem.ts` (advance sun direction over time in `update()`; add a per-scenario "TOD cycle" mode).
- Modified: `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts` (extend each preset with a `todCycle?: { dayLengthSeconds, startHour }` block; default static).
- Modified: `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` (re-bake CPU LUT when sun direction changes more than a tolerance; current code bakes once per scenario boot).

Do NOT touch: the renderer's lighting setup (`AtmosphereSystem.applyToRenderer` already drives lights every frame from `getSunDirection`/`getSunColor` — animating the source direction "just works" downstream).

## Why this task exists

`docs/ATMOSPHERE.md` v1 explicitly froze sun direction per scenario ("All presets are static per-scenario in v1"). User playtest 2026-04-20: "it looks good during the day but I do not see it getting dark." Time to lift that restriction.

The wiring already exists end-to-end — moonLight + hemisphere + WaterSystem.sun + sky dome all derive from `AtmosphereSystem.sunDirection`. We just need to animate that direction.

The expensive bit: `HosekWilkieSkyBackend` bakes a CPU-side LUT for fog/hemisphere CPU reads when sun direction changes. The cycle-2026-04-20 backend bakes once per scenario boot. Animating the sun means re-baking — but baking takes a few ms and we can amortize across frames or only bake when sun moved more than a threshold.

## Required reading first

- `docs/ATMOSPHERE.md` — design doc; v2 roadmap mentions TOD cycle.
- `src/systems/environment/AtmosphereSystem.ts` (post-cycle-2026-04-20 state) — `update()`, `applyScenarioPreset`, `applyToRenderer`, `applyFogColor`.
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` — backend's `update(dt, sunDirection)` and where the LUT bake lives.
- `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts` — preset shape.
- `docs/blocks/*` — any block doc covering scenario lifecycle (the dayLength might want to be configurable per game-mode).

## Target state

1. `AtmospherePreset` gets an optional `todCycle?: { dayLengthSeconds: number; startHour: number; minSunElevationDeg?: number; maxSunElevationDeg?: number }`. When absent, sun stays static at the configured `sunAzimuth` / `sunElevation` (current behavior).
2. `AtmosphereSystem.update(dt)` advances internal `simulationTimeSeconds`. If the active preset has `todCycle`, recompute `sunDirection` from time (azimuth sweep across the day; elevation curve from min to max with a sine-like shape).
3. Sun never drops below the configured `minSunElevationDeg` (default e.g. -10°). Below ~-6° the analytic Hosek/Preetham formulas produce NaN/black; clamp before that.
4. `HosekWilkieSkyBackend.update(dt, sunDirection)` re-bakes the CPU LUT only when sun direction changed by > ~0.5° (a few ms cost; amortized to once per ~5 seconds at default day-length).
5. Per-scenario default day-length: combat120 = static (no cycle, perf-neutral baseline); ashau / openfrontier / tdm / zc = cycle, e.g. dayLengthSeconds = 600 (10 min cycle) so playtests see TOD movement.
6. Lighting tracks: hemisphere + moonLight + water specular all visibly evolve with sun direction.

## Steps

1. Read all of "Required reading first." Confirm cycle-2026-04-20's `applyToRenderer` already updates lights every frame from `sunDirection` — no additional wiring needed.
2. Add `todCycle` to `AtmospherePreset` type + extend ash au / openfrontier / tdm / zc preset entries (combat120 stays static).
3. Add internal `simulationTimeSeconds` to `AtmosphereSystem`; advance in `update(dt)`; recompute `sunDirection` when `todCycle` is set.
4. Add the LUT-rebake threshold to `HosekWilkieSkyBackend.update(dt, sunDirection)` so re-bakes are cheap.
5. Boot dev; observe the sun moving across the sky in ashau / openfrontier / tdm / zc; confirm combat120 stays static.
6. Capture a 4-shot timelapse of one scenario (start of day, noon, dusk, near-dark) for the screenshot gate.

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/atmosphere-day-night-cycle/`:

- `ashau-cycle-t0.png`, `ashau-cycle-tnoon.png`, `ashau-cycle-tdusk.png`, `ashau-cycle-tnight.png` — same camera framing, captured at 25%, 50%, 75%, 95% of the day cycle.
- `combat120-noon.png` — confirms combat120 stays at noon (perf-neutral baseline).

## Exit criteria

- Sun direction visibly evolves over a configurable day length in ashau / openfrontier / tdm / zc.
- combat120 sun direction is static (perf baselines stay valid).
- Hemisphere / moonLight color tracks the sun direction; visible darkening near dusk.
- `npm run test:run` green; new tests covering: `todCycle === undefined → sun static`, `todCycle set → sun direction evolves with simulated time`, `LUT rebake threshold respected`.
- `combat120` perf smoke unchanged.

## Non-goals

- Do not implement a stars / moon-night scene (sun simply clamps near the horizon; below-horizon visuals are the next-cycle task).
- Do not animate weather state alongside TOD.
- Do not replace the static per-scenario sun azimuth in combat120 — perf baselines depend on it.

## Hard stops

- Fence change → STOP.
- LUT rebake cost blows the World group budget → STOP, raise the threshold or amortize across frames.
- Sun-below-horizon produces NaN / black sky → STOP, tighten the clamp.
- Pair with `post-tone-mapping-aces`: without tone-mapping, dawn/dusk warmth still won't read. If tone-mapping isn't merged yet, you can land but the visual demonstration will be muted.
