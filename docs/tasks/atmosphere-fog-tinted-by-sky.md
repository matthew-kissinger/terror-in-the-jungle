# atmosphere-fog-tinted-by-sky: fog color sampled from sky at view direction

**Slug:** `atmosphere-fog-tinted-by-sky`
**Cycle:** `cycle-2026-04-20-atmosphere-foundation` *(placeholder — confirm at cycle start)*
**Depends on:** `atmosphere-hosek-wilkie-sky` (needs `ISkyRuntime.getSkyColorAtDirection` to return sensible values)
**Blocks:** nothing in this cycle
**Playtest required:** yes (the horizon seam is the observable)
**Estimated risk:** low-medium — FogExp2 color must be scene-wide one-color, so this task introduces a custom fog shader patch on terrain/sprite materials
**Budget:** ≤ 300 LOC
**Files touched:**

Modified: `src/core/GameRenderer.ts` (stop using the constant `0x5a7a6a` fog color; feed from `AtmosphereSystem`), material shaders that currently use `THREE.FogExp2` via `scene.fog` — fog color becomes per-pixel via a small `onBeforeCompile` hook OR a shared uniform on a unified fog include

Modified: `src/systems/environment/WeatherAtmosphere.ts` (stop writing directly to `scene.fog.color`; forward weather fog-tint intent into `AtmosphereSystem` instead; storm still darkens via the sky state)

Do NOT touch: the `FogExp2` density math or distance formula. Only the color changes. Do NOT add a post-process fog pass.

## Why this task exists

Today: `scene.fog.color = 0x5a7a6a` (constant green-grey) and `scene.background = 0x5a7a6a` (same color). The horizon seam hides ONLY because those two constants match. The moment `atmosphere-hosek-wilkie-sky` lands, the sky will gradient from deep blue zenith to warm horizon at dawn — and the constant fog will punch a visible hard line at the terrain edge.

Fix: sample the sky color at the pixel's view direction and use it as the fog color. Then fog → sky is seamless at every sun angle, every weather state, forever.

See `docs/ATMOSPHERE.md` "Immediate wins" #2.

## Required reading first

- `src/core/GameRenderer.ts` — where fog is constructed (lines ~95–96); where `configureForWorldSize` tunes density per scenario.
- `src/systems/environment/WeatherAtmosphere.ts` — currently mutates `scene.fog.color` in underwater + storm paths. The underwater override (`0x003344`) must keep working.
- `src/systems/environment/AtmosphereSystem.ts` — `getSkyColorAtDirection` is the input.
- Three.js fog `onBeforeCompile` patterns — there's no built-in "fog color from uniform per-pixel", so this involves a small shader patch that reads a uniform (pre-sampled sky color via CPU LUT) OR a two-lobe approximation (zenith/horizon) per pixel in the fog blend.
- `docs/INTERFACE_FENCE.md` — `IGameRenderer.fog` is fenced. Changing `fog` from `THREE.FogExp2` to a custom subclass WOULD be a fence change. Stay on `THREE.FogExp2` and mutate its color uniform each frame (or emit via onBeforeCompile) to avoid an `[interface-change]` PR.

## Target state

1. `GameRenderer` no longer sets a constant fog color. Each frame, it reads the zenith + horizon colors from `AtmosphereSystem` (`ISkyRuntime`) and writes them into a shared fog uniform consumed by terrain, sprite, and combatant material shaders.
2. Fog color per pixel = lerp(horizon, zenith, `smoothstep(0, 0.6, view.y)`) — a cheap 2-color approximation. The full per-pixel `getSkyColorAtDirection` sampler is exposed but not necessary for the fog shader — a 2-lobe blend is visually identical for fog falloff.
3. The horizon seam disappears in all 5 scenarios at their configured TOD (ashau dawn, openfrontier noon, tdm dusk, zc golden hour, combat120 noon).
4. `WeatherAtmosphere`:
   - STORM still darkens the fog (multiplies the sky-sampled color downward).
   - LIGHT_RAIN / HEAVY_RAIN still thickens density (existing behavior preserved).
   - Underwater override (`0x003344`, density `0.04`) still works — takes priority over sky-sampled color.
5. No fence change: `IGameRenderer.fog` still returns `THREE.FogExp2`.

## Steps

1. Read all files listed in "Required reading first." Confirm which materials currently consume fog (`scene.fog` is read by any material with `fog: true` — terrain, sprites, combatant instanced meshes).
2. Write a fog-color include / `onBeforeCompile` patch that replaces the single `fogColor` uniform with a `uniform vec3 uSkyZenith, uSkyHorizon` pair and evaluates the lerp per-pixel.
3. Hook `GameRenderer.update(dt)` (or an equivalent per-frame hook) to copy `atmosphere.getZenithColor() / getHorizonColor()` into those uniforms.
4. Move the weather fog-color mutation paths in `WeatherAtmosphere` to forward intent into `AtmosphereSystem` (storm → darken factor; underwater → hard override). Keep density mutation where it is.
5. `npm run validate:fast` green. Visual smoke: all 5 scenarios; screenshot the horizon at each.
6. Explicit check: spin the player 360° at ground level in `ashau:short` at dawn — the fog should transition seamlessly into sky without a visible edge at any camera angle.

## Exit criteria

- The horizon seam is invisible at ground level in all 5 scenarios.
- Storm fog is visibly darker than clear fog (weather chain still modulates atmosphere).
- Underwater fog color override (`0x003344`) still works when `WeatherSystem.isUnderwater`.
- `IGameRenderer.fog` is still `THREE.FogExp2` — no fence change.
- `npm run test:run` green; `combat120` perf smoke within current WARN bound.

## Non-goals

- Do not replace `FogExp2` with a Hillaire aerial-perspective model. That's v2 (Combo E) territory.
- Do not add height-fog. Separate future task.
- Do not add volumetric fog / froxel grid. Far-future.
- Do not move fog computation to a post-process pass.

## Hard stops

- If this turns into a fence change on `IGameRenderer.fog`, STOP. Find a way to stay on `THREE.FogExp2` with a uniform swap — or escalate for `[interface-change]` approval.
- If the 2-color fog approximation produces a visible discontinuity at the horizon for ANY preset, STOP and either add a third midband color sample or escalate to the full per-pixel `getSkyColorAtDirection` sampler.
