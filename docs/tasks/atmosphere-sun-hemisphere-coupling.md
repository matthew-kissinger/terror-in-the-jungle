# atmosphere-sun-hemisphere-coupling: drive lights from the atmosphere model

**Slug:** `atmosphere-sun-hemisphere-coupling`
**Cycle:** `cycle-2026-04-20-atmosphere-foundation` *(placeholder — confirm at cycle start)*
**Depends on:** `atmosphere-hosek-wilkie-sky` (needs `getSunDirection`, `getSunColor`, zenith/horizon samples)
**Blocks:** nothing in this cycle
**Playtest required:** yes (light direction + color are game-feel)
**Estimated risk:** medium — unfreezes `moonLight` position; shadow frustum must follow; night-time lighting invariants
**Budget:** ≤ 300 LOC
**Files touched:**

Modified: `src/core/GameRenderer.ts` (`setupLighting()` — stop `freezeTransform`ing moonLight; let `AtmosphereSystem` drive position + color each frame; update hemisphere sky/ground colors from sky zenith/horizon)

Modified: `src/systems/environment/WeatherAtmosphere.ts` (scalar intensity multipliers for weather still apply AFTER the atmosphere-driven base color — storm still dims the sun, lightning still flashes; order: `atmosphere → weather multiplier → final uniform`)

Modified: `src/systems/water/WaterSystem.ts` (the stub `sun` vector at line ~32 finally gets a real source; point it at `AtmosphereSystem.getSunDirection`)

Do NOT touch: shadow map size / shadow blur / shadow camera aspect ratios — only the frustum center/follow logic. The existing GPU-tier gates (1024 vs 2048, 2 vs 4 samples) stay.

## Why this task exists

Lights are currently frozen (`freezeTransform` on moonLight at `(0, 80, -50)`) with a hardcoded warm cornsilk color (`0xfffacd`). Hemisphere is `0x87ceeb` sky / `0x4a6b3a` ground, static. Weather scalar-multiplies intensity only. That's a dead end for atmosphere work.

After this task: sun direction + color come from the Hosek-Wilkie model. Dawn is warm-orange directionally; noon is white and high; dusk is warm and low. Hemisphere sky color matches the zenith sample; hemisphere ground tint follows the sun-transmittance-shaded terrain. Weather still modulates on top (storm dims, lightning flashes).

See `docs/ATMOSPHERE.md` "Immediate wins" #3–#5.

## Required reading first

- `src/core/GameRenderer.ts` — full lighting setup; `freezeTransform` pattern; shadow camera frustum (±100m or ±70m per GPU tier); the `update(dt)` hook if it exists, otherwise find the per-frame injection point.
- `src/systems/environment/WeatherAtmosphere.ts` — ordering of weather intensity multipliers; the underwater override; lightning flash mechanics (`WeatherLightning.ts`).
- `src/systems/environment/AtmosphereSystem.ts` — the sources: `getSunDirection`, `getSunColor`, `getZenithColor`, `getHorizonColor`.
- `src/systems/water/WaterSystem.ts` — the stub sun vector that finally gets a real value.
- `docs/COMBAT.md` — if combat or NPC AI reads light direction (e.g. shadow visibility for stealth), note and preserve.

## Target state

1. `moonLight` (the directional light) is no longer `freezeTransform`ed. Each frame, its `position` is set from `atmosphere.getSunDirection() * 500` (or similar large radius); its `color` is set from `atmosphere.getSunColor()`; its `target.position` stays at origin (or follows the player for shadow frustum stability).
2. Shadow camera recenters on the active player (follow camera) each frame so shadows stay sharp near the player regardless of sun angle. Frustum extents stay on the GPU-tier gates.
3. `hemisphereLight.color` ← `atmosphere.getZenithColor()`, `hemisphereLight.groundColor` ← darkened `atmosphere.getHorizonColor()` (ground-bounce approximation).
4. `WeatherAtmosphere.ts` ordering:
   - Atmosphere base drives sun direction + color + hemisphere.
   - Weather applies intensity scalars AFTER (storm × 0.4, heavy_rain × 0.6, light_rain × 0.8).
   - Lightning flash still briefly boosts sun/ambient and tints fog — kept as-is, just operating on top of the new base.
5. `WaterSystem`'s `sun` vector uses `atmosphere.getSunDirection()`. Water reflections follow the sun.
6. Per-scenario TOD presets (from `atmosphere-hosek-wilkie-sky`) produce distinctly different lighting: `ashau:short` has warm low sun from the east, `openfrontier` has white high sun, `tdm` has warm low sun from the west. Playtest sanity-check confirms this.
7. No visible regression in combat shadow quality or NPC silhouette read.

## Steps

1. Read all files in "Required reading first." Note any code that assumes `moonLight.position.y > 0` (night lighting paths) and confirm sun-below-horizon handling is sane (clamp sun dir, or let the atmosphere model handle it gracefully — night is not a v1 scenario).
2. Remove `freezeTransform(moonLight)` from `GameRenderer.setupLighting()`. Add a per-frame hook (or extend an existing one) that updates moonLight position, color, and shadow frustum center from `AtmosphereSystem`.
3. Update `hemisphereLight.color` and `hemisphereLight.groundColor` each frame from `AtmosphereSystem` zenith/horizon samples.
4. Reorder `WeatherAtmosphere` so weather applies as a multiplier ON TOP of the atmosphere-driven base. Keep the underwater override as a final clamp.
5. Wire `WaterSystem.sun` to `AtmosphereSystem.getSunDirection()`.
6. Validate shadows: in each scenario, take a screenshot of a player-adjacent structure at the configured TOD — shadow direction should match the sun azimuth.
7. `npm run validate:fast` green. `combat120` perf smoke within WARN bound.

## Exit criteria

- `moonLight.position` and `moonLight.color` update each frame from `AtmosphereSystem`; `freezeTransform(moonLight)` is removed.
- `hemisphereLight.color` / `hemisphereLight.groundColor` update from zenith/horizon samples each frame.
- `WaterSystem.sun` tracks the atmosphere sun direction (water reflections are now preset-correct).
- `WeatherAtmosphere` still produces the correct storm-dim / lightning-flash behavior (no visible regression in storm state captures).
- Per-scenario lighting is visually distinct: `ashau:short` dawn reads as a dawn; `openfrontier` noon reads as noon; `tdm` dusk reads as dusk.
- `npm run test:run` green; shadow quality and frame times unchanged from master on the `combat120` baseline.

## Non-goals

- Do not add a live time-of-day cycle. All scenarios use static presets.
- Do not implement PMREM IBL for weapons/vehicles. That's v2 (Combo E).
- Do not change shadow map size, blur samples, or the GPU-tier gate — only the frustum-follow logic.
- Do not touch `AmbientLight` — it stays as a very small flat fill; hemisphere does the directional ambient work.

## Hard stops

- If removing `freezeTransform` breaks any performance assumption (e.g. Three.js re-uploads matrices each frame), STOP and confirm the cost is within the `World` 1.0ms budget. Alternative: update only when the atmosphere state changes (per-scenario, static in v1 → once at boot).
- If shadow frustum follow introduces popping or stutter, STOP and fall back to the old static frustum for v1 — ship sun/color animation without shadow-follow.
- If `WeatherSystem` storm behavior visibly regresses, STOP. Weather is shipped and playtested; no regressions allowed.
