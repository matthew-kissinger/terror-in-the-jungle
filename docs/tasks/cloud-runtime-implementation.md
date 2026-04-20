# cloud-runtime-implementation: implement ICloudRuntime with a high-altitude cloud band

**Slug:** `cloud-runtime-implementation`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P2 — `ICloudRuntime` is currently a stub interface added in cycle-2026-04-20's PR #97 with no consumer.
**Playtest required:** YES.
**Estimated risk:** medium — new render path; budget-sensitive; flight-aware.
**Budget:** ≤ 400 LOC.
**Files touched:**

- New: `src/systems/environment/atmosphere/CloudLayer.ts`.
- Modified: `src/systems/environment/AtmosphereSystem.ts` to own the cloud layer (parallel to the sky dome), return real values from `getCoverage()` / `setCoverage()`, and wire weather-state cloudiness into coverage.
- Modified: `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts` to add per-scenario default cloud coverage + cloud-base altitude.

Do NOT touch: SystemInterfaces (`ICloudRuntime` is already there).

## Why this task exists

`docs/ATMOSPHERE.md` lists clouds as a v1+ scope element. PR #97 added the `ICloudRuntime` interface but no implementation. User explicitly asked for clouds at cycle-2026-04-20 close-out: "maybe we can add in clouds next pass too."

Critical constraint the user flagged: **this game has both fixed-wing aircraft and helicopters.** Cloud layer must not block their flight envelope or look broken from cockpit altitude. Concrete rules:
- Cloud BASE altitude must be at least 800 m AGL (typical helicopter cruise is 100-300m AGL; CAS aircraft engagement altitude is up to 600m). Below the cloud base, sky is clear; above the base, the cloud layer is visible.
- Cloud layer should be visually plausible from BELOW (looking up at cumulus underbellies, lit by sun) AND from above (looking down on tops, lit by sun, with a flat-ish horizon line).
- Don't obscure the sun disc — let sun shaft through gaps in coverage.

## Required reading first

- `docs/ATMOSPHERE.md` (cloud roadmap).
- `src/types/SystemInterfaces.ts` — `ICloudRuntime` shape.
- `src/systems/environment/AtmosphereSystem.ts` — current `getCoverage()` / `setCoverage()` (stubs).
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` — for the dome mesh / shader pattern.
- `src/systems/environment/WeatherAtmosphere.ts` — STORM should imply higher coverage.
- `src/systems/vehicle/airframe/configs.ts` — confirm typical aircraft cruise altitudes (constraints for cloud-base).
- `src/systems/helicopter/HelicopterModel.ts` (or wherever helicopter altitude logic lives) — helicopter flight envelope.

## Target state

Pick a concrete render approach:

1. **3D layered planes** (cheapest, looks "ok" from below): a horizontal plane mesh at the cloud-base altitude, large enough to fill view at flight altitude (e.g. 4 km × 4 km, BackSide-style billboard), with a procedural Perlin/Worley + noise cloud shader. Coverage uniform animates the cloud density. Sun direction passed in for cheap "lit cumulus" tint. Sun-disc visibility preserved by alpha mask in cloud-thin areas.
2. **Billboard cumulus** (richer from cockpit): N world-space billboards at varying altitudes within a cloud band (800-1500m AGL); coverage controls visible count.

Default to (1) for v1 unless executor demonstrates (2) within budget. (1) is also better for low-altitude players (looking up sees a flat-ish underside, which is the dominant viewing angle from ground).

Concrete defaults:

- `cloudBaseAltitude: 800` (above max helicopter typical altitude).
- `cloudThickness: 200` (so tops at ~1000m).
- Per-scenario coverage:
  - `combat120`: 0.2 (light scattered).
  - `ashau`: 0.4 (jungle valley overcast).
  - `openfrontier`: 0.1 (clear).
  - `tdm`: 0.6 (overcast dusk).
  - `zc`: 0.3 (broken golden-hour clouds).
- Weather override:
  - STORM: coverage → 1.0, cloud color darkens.
  - HEAVY_RAIN: coverage → 0.85.
  - LIGHT_RAIN: coverage → 0.6.
  - CLEAR: returns to preset default.

## Steps

1. Read all of "Required reading first."
2. Implement `CloudLayer` with the chosen render path. Mesh follows the camera horizontally (don't recompute world-space; just translate XZ each frame with the camera so the cloud shader's UV doesn't reveal the trick).
3. Wire `AtmosphereSystem` to own + forward.
4. Wire weather-state cloudiness.
5. Per-scenario preset extensions.
6. Verify in `npm run dev`: ground-level looking up shows clouds; flying through at 500m AGL shows clear sky below + clouds above at 800m+; flying through at 1000m AGL puts the cloud layer at eye level (this is the sketchy view; verify it doesn't look broken).
7. Verify perf via `npm run perf:capture:combat120` — must stay within WARN bound.

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/cloud-runtime-implementation/`:

- One shot per scenario showing the per-scenario default coverage from ground level.
- `combat120-storm-clouds.png` — heavy coverage during storm.
- `flight-through-clouds.png` — view from inside an aircraft cockpit at cruise altitude (or just position the player camera at 1000m AGL and look forward) to confirm the cloud layer reads from above.
- `helicopter-altitude-clear.png` — view at typical helicopter altitude (200m AGL) looking up — should show clear sky beneath the cloud base.

## Exit criteria

- `AtmosphereSystem.getCoverage()` returns the live coverage; `setCoverage()` actually changes the visible cloud field.
- Each scenario boots with its preset default coverage.
- STORM weather pushes coverage near 1.0; clear returns to preset.
- Cloud base never below 800m AGL (helicopter flight envelope safe).
- Sun disc visible through low-coverage gaps.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- `combat120` perf smoke within WARN bound.

## Non-goals

- Do not implement volumetric (raymarched froxel) clouds.
- Do not implement shadow-casting clouds (sun shadow stays from terrain only).
- Do not animate clouds over time (parallel-cycle work, alongside `atmosphere-day-night-cycle`).
- Do not animate cloud-base altitude (static per scenario).

## Hard stops

- Fence change → STOP.
- Cloud render blows the World group budget → STOP, simplify the shader.
- Sun-occluded cloud math produces NaN → STOP, clamp.
- Cloud layer visibly intersects the helicopter flight envelope (player or AI helo flies INTO clouds at typical altitude) → STOP, raise cloud base.
