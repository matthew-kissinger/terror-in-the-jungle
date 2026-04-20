# fog-density-rebalance: tune per-scenario fog density now that fog color tracks sky

**Slug:** `fog-density-rebalance`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P1 — distant terrain reads as flat white in cycle-2026-04-20 ship-gate captures and live playtest.
**Playtest required:** YES (visual observable).
**Estimated risk:** low — adjustment to `fogDensity` constants per scenario in `GameRenderer.configureForWorldSize` or a per-scenario preset.
**Budget:** ≤ 100 LOC.
**Files touched:**

- Investigate: `src/core/GameRenderer.ts` (where fog density is set per scenario), `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts` (per-scenario atmosphere presets — possibly a natural home for fog-density tuning), `src/systems/environment/AtmosphereSystem.ts` (post cycle-2026-04-20, this owns `applyFogColor`).
- Modify: probably `GameRenderer.ts` for the per-scenario density values + a comment explaining the rebalance, OR add a `fogDensity` field to `AtmospherePreset` so density tracks alongside color.

## Why this task exists

Pre-cycle-2026-04-20: `scene.fog.color = 0x5a7a6a` (constant green-grey) + per-scenario density (~0.0007 to ~0.0015 typical). Worked fine because the fog color matched the dim ambient.

Post-cycle-2026-04-20: `AtmosphereSystem.applyFogColor` writes the analytic sky's HORIZON color into `fog.color` each frame. The horizon analytic value is bright (close to white in noon presets, warm-orange in dawn/dusk). The previous density was tuned for a dark fog color; with a bright fog color and the same density, distant terrain saturates to near-white.

User playtest 2026-04-20 (paraphrased): "terrain far away looks white ground instead of foggy area... the fog is good but it makes the terrain look too white and brightly colored."

The sky-color match is correct (kills the seam). The DENSITY is what needs to come down so the fog doesn't dominate.

## Required reading first

- `src/core/GameRenderer.ts` — find `configureForWorldSize` and per-scenario fog density. Note the current values per mode.
- `src/systems/environment/AtmosphereSystem.ts` (`applyFogColor` private method) — confirm it does NOT mutate density.
- `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts` — see whether per-scenario presets are a clean home for the rebalanced density.
- `src/systems/environment/WeatherAtmosphere.ts` — `updateAtmosphere` modulates `renderer.fog.density`. Confirm any rebalance here doesn't break weather state transitions.
- The ship-gate `_orchestrator/after-round-3/README.md` for the visual baseline.
- Pair with `post-tone-mapping-aces`: tone-mapping fixes the "color too saturated" half; this task fixes the "fog reaches too far" half. Both land before the new fog look reads correctly.

## Hypothesis (verify)

Cut the per-scenario fog density by ~30-50% across the board, OR move density into `ScenarioAtmospherePresets.ts` so dawn / dusk / noon each have their own density tuned visually. The latter is the better long-term home — fog density and sky color are now coupled.

## Steps

1. Read all of "Required reading first."
2. In `npm run dev`, observe distant terrain in each of the 5 scenarios. Note the depth at which terrain dissolves into fog.
3. Reduce the density per scenario (or per preset) by a fixed factor, observe whether the distance reads correctly. Iterate.
4. Confirm with the atmosphere stack: storm darkening still works; underwater override (density 0.04) still works; lightning flash still tints density correctly.
5. `npm run validate:fast` green.

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/fog-density-rebalance/`:

- `combat120-noon.png` — distant terrain visible through gentle haze, not white.
- `ashau-dawn.png` — distant ridgelines visible.
- `openfrontier-noon.png` — distant terrain visible.
- `combat120-storm.png` — fog visibly thicker than clear; storm modulation preserved.
- `combat120-underwater.png` — underwater override (teal, density 0.04) preserved.

## Exit criteria

- Distant terrain reads as terrain in fog, not flat white, in all 5 scenarios.
- Storm + underwater overrides still work.
- `npm run test:run` green.
- `combat120` perf smoke within WARN bound.

## Non-goals

- Do not change fog COLOR logic (`AtmosphereSystem.applyFogColor` stays).
- Do not switch from `FogExp2` to a height-fog or volumetric model.
- Do not add a runtime SettingsManager fog slider.

## Hard stops

- Fence change → STOP.
- Reducing density breaks the seam-match (terrain edge becomes visible again) → STOP, raise density slightly.
- This task lands BEFORE `post-tone-mapping-aces` and tone-map issue dominates → STOP, sequence with tone-map first.
