# atmosphere-hosek-wilkie-sky: first sky backend — analytic dome

**Slug:** `atmosphere-hosek-wilkie-sky`
**Cycle:** `cycle-2026-04-20-atmosphere-foundation` *(placeholder — confirm at cycle start)*
**Depends on:** `atmosphere-interface-fence` (needs `ISkyRuntime` + `ISkyBackend`)
**Blocks (in this cycle):** `atmosphere-fog-tinted-by-sky`, `atmosphere-sun-hemisphere-coupling`
**Playtest required:** yes (visible change — sky dome gets real gradients)
**Estimated risk:** medium — new shader material, skybox cutover path
**Budget:** ≤ 500 LOC (shader + backend + per-scenario preset table)
**Files touched:**

New: `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`, `src/systems/environment/atmosphere/hosekWilkie.glsl.ts` (vertex + fragment shader source as a string export), `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts`

Modified: `src/systems/environment/AtmosphereSystem.ts` (own the dome mesh; switch backend from `NullSkyBackend` to `HosekWilkieSkyBackend` when preset requests it), `src/systems/environment/Skybox.ts` (deprecation log: "Skybox is superseded by AtmosphereSystem; this class will be removed in a future release"), `src/core/GameEngineInit.ts` (stop loading the equirect `skybox` asset when `AtmosphereSystem` owns the dome)

Do NOT touch: `WeatherAtmosphere.ts`, `GameRenderer.setupLighting()` (fog tint and light coupling are separate briefs in this cycle).

## Why this task exists

v1 first backend from the "Combo G architecture, Combo A first backend" plan in `docs/ATMOSPHERE.md`. Replaces the static equirectangular skybox PNG with an analytic Hosek-Wilkie sky dome driven by sun position and a small set of physical parameters (turbidity, ground albedo). Gives us:

- Real sun color at the sun direction (feeds `getSunColor` on `ISkyRuntime`).
- Smooth zenith → horizon gradient (feeds `getZenithColor`, `getHorizonColor`, `getSkyColorAtDirection`).
- Per-scenario time-of-day (ashau = dawn, openfrontier = noon, tdm = dusk, zc = golden hour) via a static preset table.

Three.js ships `examples/jsm/objects/Sky.js` (Preetham analytic model). Hosek-Wilkie is a newer/better model especially at low sun — implementation is short (~100 LOC of shader math) and reference implementations exist (e.g. `andrewwillmott/sun-sky`). Executor may use the Three Preetham `Sky` as a fallback starting point if Hosek-Wilkie porting blows the budget.

## Required reading first

- `docs/ATMOSPHERE.md` — design rationale, v1 scope, budget.
- `src/systems/environment/AtmosphereSystem.ts` — the shell from `atmosphere-interface-fence`.
- `src/systems/environment/atmosphere/NullSkyBackend.ts` — defines the `ISkyBackend` contract the new backend must satisfy.
- `src/systems/environment/Skybox.ts` — 500-unit sphere, camera-following, BackSide, `renderOrder = -1`, `depthWrite/depthTest = false`. Replicate this mesh setup inside `AtmosphereSystem`.
- `src/config/MapSeedRegistry.ts` — the pattern `ScenarioAtmospherePresets.ts` should follow (static table keyed by scenario id).
- `three/examples/jsm/objects/Sky.js` — Preetham reference if Hosek-Wilkie port stalls.

## Target state

1. `HosekWilkieSkyBackend` implements `ISkyBackend`. Holds the dome mesh (500-unit sphere, BackSide, camera-following, `renderOrder = -1`), a `ShaderMaterial` with Hosek-Wilkie vert+frag, and uniforms for sun direction, turbidity, ground albedo, and a normalization factor.
2. `hosekWilkie.glsl.ts` exports vertex + fragment shader source strings. Fragment computes radiance at the pixel view direction using Hosek-Wilkie coefficients for the current sun elevation, turbidity, and ground albedo.
3. `AtmosphereSystem.update(dt)` advances the backend: recomputes sun direction if the current scenario preset animates (v1 all presets are static per-scenario, so `update` is a no-op until a future cycle adds a TOD cycle).
4. `AtmosphereSystem.getSkyColorAtDirection(dir, out)` returns the shader output sampled on the CPU side for fog/hemisphere readers. CPU eval can be a lower-precision analytic — a 32×8 CPU-side LUT baked at backend init is acceptable.
5. `ScenarioAtmospherePresets.ts` is a `Record<ScenarioId, AtmospherePreset>` with sun azimuth/elevation, turbidity, and ground albedo for: `ashau` (dawn), `openfrontier` (noon), `tdm` (dusk), `zc` (golden hour), `combat120` (noon — perf-neutral for baselines).
6. When `AtmosphereSystem` boots with a scenario preset that requests `HosekWilkieSkyBackend`, the existing `Skybox` PNG asset loading is skipped (logged as "skipped: AtmosphereSystem owns the dome") and `AtmosphereSystem` installs its own dome.
7. `Skybox` remains in the codebase but emits a one-shot deprecation `console.warn` on construction.

## Steps

1. Read everything in "Required reading first." Confirm `ISkyBackend` contract is stable enough.
2. Port Hosek-Wilkie vert+frag into `hosekWilkie.glsl.ts`. Reference `andrewwillmott/sun-sky` for coefficients; keep the shader simple — turbidity is a single uniform, ground albedo is a single vec3.
3. Implement `HosekWilkieSkyBackend`. Dome mesh follows the `Skybox.ts` recipe exactly (500u, BackSide, camera-following each frame, `renderOrder = -1`, `depthWrite/depthTest = false`).
4. CPU-side sampler: a small LUT baked from the analytic model at init. 32 azimuth × 8 elevation is enough for fog + hemisphere readers. Re-bake when sun direction changes (not every frame — once at scenario boot in v1).
5. Write `ScenarioAtmospherePresets.ts`. Keep TOD choices tasteful — dawn ashau is iconic Vietnam War imagery; noon openfrontier matches the current perf-capture conditions so `combat120` baseline deltas stay interpretable.
6. Gate `GameEngineInit` asset load: if the scenario preset uses `HosekWilkieSkyBackend`, skip `skybox` PNG loading.
7. `npm run validate:fast` green. Visual smoke: `npm run dev` through all 5 scenarios, observe sky gradients.
8. Capture a before/after screenshot for each scenario; attach to the PR.

## Exit criteria

- All 5 scenarios render with a Hosek-Wilkie sky when their preset requests it; `combat120` renders at noon (perf-neutral); `ashau:short` renders at dawn.
- `AtmosphereSystem.getSunColor` and `*.getSkyColorAtDirection` return sensible values (sun is warmer at lower elevation; zenith is deeper blue at noon than dawn).
- `Skybox.ts` is not deleted but logs its deprecation on construction.
- No `npm run test:run` regression. `combat120` perf smoke within the current WARN bound (≤ ~16ms avg, ≤ ~35ms p99).
- Pilots can fly up and the dome follows the camera — no clipping on climb.

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-20-atmosphere-foundation/screenshots/atmosphere-hosek-wilkie-sky/`. Orchestrator gates merge on visual review.

Required shots (one per scenario, ground-level camera, framed toward the sun azimuth so the sky gradient + sun position are both visible):

- `combat120-noon.png`
- `ashau-dawn.png`
- `openfrontier-noon.png`
- `tdm-dusk.png`
- `zc-golden-hour.png`

The horizon seam between sky and the constant-color fog WILL be visibly bad in these shots — that's expected (`atmosphere-fog-tinted-by-sky` fixes it next round). Reviewer is checking sky gradient quality, sun position, and color temperature per preset; not the seam.

Add a `README.md` in the screenshots dir naming the camera/yaw/pitch used so the fog-tinted PR can re-shoot from the same framing.

## Non-goals

- Do not animate the sun during a match. All presets are static per-scenario in v1.
- Do not drive fog color from the sky — that's `atmosphere-fog-tinted-by-sky`.
- Do not drive hemisphere/ambient from the sky — that's `atmosphere-sun-hemisphere-coupling`.
- Do not delete `Skybox.ts` — deprecation log only.
- Do not add a SettingsManager quality toggle — first-backend shipping straight.

## Hard stops

- If the perf budget (`World` group, 1.0ms shared with weather) is broken on any tier, STOP. Options: lower shader precision, drop to 16-level CPU LUT, or fall back to Three's Preetham `Sky` example.
- If any Hosek-Wilkie coefficient path produces NaN/Inf at extreme sun elevation, STOP and clamp elevation. Preset tables must not produce broken math.
