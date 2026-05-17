# Sun & Atmosphere Vision Spike — 2026-05-16

Last verified: 2026-05-16 (post `cycle-sky-visual-restore` merge; pre cycle #6 dispatch)
Status: research + vision memo. **No code modified.**

## TL;DR

1. The three R1 PRs that just merged (`2118177f`, `3455fa96`, `9e1ce7c7`) fixed the *dome carrier* (HDR LUT, `toneMapped:false`, additive sun-disc sprite) but left the *signal* unchanged — the LUT still bakes a Preetham-shape gradient at 256x128 onto a `MeshBasicMaterial` with no in-shader sun, no aerial perspective, no horizon glow gradient, and a `sunColor` path that goes pure red when the sun drops below the horizon.
2. The sun is barely visible because the disc sprite is a single 28-unit billboard with a soft canvas radial gradient; it composites at `(sunColor * elevation-keyed multiplier)` — at noon that is a small pearl with no aureole/bloom; from the player's normal yaw (looking south/level) the sun off-azimuth is just empty pale sky.
3. Night-red is `bakeLUT()`'s `computeTransmittance` returning Fex with R survives, G/B annihilated by the long optical path through `groundAlbedo` bounce — then peak-normalised and floored at `(0.2, 0.1, 0.05)` — and this red `sunColor` drives `moonLight.color`, hemisphere ground tint, AND the LUT's per-direction sky bake. It's a real bug with a one-line cause; the *vibe* is recoverable as a "pre-dawn fog" preset.
4. **Recommendation:** port `HosekWilkieSkyBackend.evaluateAnalytic` (CPU JS) into a single TSL fragment node graph wired to the dome (`MeshBasicNodeMaterial` / `colorNode`), restore the per-fragment Preetham gradient + HDR sun-disc the pre-merge GLSL had, retire the 256x128 baked LUT for *visual* purposes (keep a tiny 32x8 CPU LUT for fog/hemisphere readers only), and recalibrate `toneMappingExposure` plus the night-sun-color floor. Run cycle #13 (this spike's fix) **between #11 and #12** so the perf baseline refresh captures the new sky cost as the new normal.

## Section 1 — Current state audit

### What just merged (the three R1 PRs)

- **`2118177f` — `sky-dome-tonemap-and-lut-resolution`** — added `toneMapped: false` to the dome's `MeshBasicMaterial` (`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:249`) and bumped `SKY_TEXTURE_WIDTH/HEIGHT` from 128x64 to 256x128 (`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:9-10`). Conservative middle option per the brief.
- **`3455fa96` — `sky-hdr-bake-restore`** — swapped the LUT storage from `Uint8Array` (sqrt-gamma + clamp01 + *255) to `Uint16Array` of `THREE.DataUtils.toHalfFloat` patterns. Texture is now `THREE.HalfFloatType` RGBA, `LinearSRGBColorSpace`. Lifted the `evaluateAnalytic` post-exposure clamp from `[0, 8]` to `[0, 64]` (`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:869-873`).
- **`9e1ce7c7` — `sky-sun-disc-restore`** — new `SunDiscMesh` class (`src/systems/environment/atmosphere/SunDiscMesh.ts`). Single `PlaneGeometry(28, 28)` quad at `sunDirection * 500 * 0.99` from the camera, with a canvas-built radial gradient `CanvasTexture`, `MeshBasicMaterial{ additive, toneMapped: false, depthWrite/Test: false }`. Billboards each frame; hides when `sunDirection.y < 0`. Intensity multiplier: `HDR_FLOOR_MULTIPLIER=1.5` to `HDR_PEAK_MULTIPLIER=8.0`, scaled by `elevation^2` (`src/systems/environment/atmosphere/SunDiscMesh.ts:172-184`).

### Why the user still sees the three problems

#### Observation 1 — "Sun is not visually present"

Three specific causes:

1. **The disc is small and unbloomed.** `DEFAULT_DISC_SIZE = 28` units on a `domeRadius = 500` sphere (`src/systems/environment/atmosphere/SunDiscMesh.ts:35`). That's a half-angle of `atan(14/500) ≈ 1.6°` — about 3.2° diameter, ~3x the real sun's apparent diameter (0.53°). It reads "big enough to find if you look right at it" but there is no surrounding bloom, no halo, no godrays, no chromatic aureole. The radial gradient inside the texture is the *only* falloff (`src/systems/environment/atmosphere/SunDiscMesh.ts:74-83`). The post-processing path is a documented no-op (`src/systems/effects/PostProcessingManager.ts:11-44` per `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/webgl-fallback-pipeline-diff.md:58-61`), so there is no scene-side bloom to amplify it.

2. **The dome paints no in-shader sun.** The 256x128 baked LUT composites a `mixSunDisc` lerp into peak-normalised `sunColor` (`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:610-618`) — `sunDot <= 0.9992` returns immediately, and inside the disc the color lerps toward a `peak-1.0`-normalised sunColor. At 256x128 the disc covers ~3 texels horizontally; bilinear filtering smears it to ~5-8 screen pixels. The pre-merge fragment shader ran `vSunE * 19000.0 * Fex * sundisc` per fragment (cited at `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/sky-visual-and-cost-regression.md:100-105`). That HDR pin-point is gone from the dome; the additive sprite is a poor stand-in because it has no in-context HDR aureole.

3. **No glance-cue rim light.** The directional `moonLight` (`src/core/GameRenderer.ts:178`) is the only sun-direction primitive. Terrain and combatants get hit by it for lambertian shading, but there is no specular highlight pass, no rim-light pass, no fresnel sun-tinted bias on vegetation. So even when the sun *is* in the player's frustum, nearby geometry gives no "this is the sun direction" hint beyond a slight luminance gradient.

#### Observation 2 — "Night atmosphere is red"

The full chain, with the smoking gun:

1. `bakeLUT()` ends each rebake with `computeTransmittance(sunDirection, sunColor)` (`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:717`).
2. `computeTransmittance` (`HosekWilkieSkyBackend.ts:736-754`) — for a sub-horizon sun, `direction.y` is negative, `upDot = max(0, dy) = 0`, `zenithAngle = π/2`, `invDenom = 0.15 * (93.885)^-1.253 ≈ 0.00075`, so `invLen ≈ 1330`, `sR ≈ 1.1e7`, `sM ≈ 1.7e6`. Plug into `exp(-(totalRayleigh*rayleighCoeff*sR + MieConst*totalMieScale*mieCoefficient*sM))` — the R channel uses `totalRayleigh[0] = 5.8e-6` (large wavelength, low scattering) and survives at maybe `1e-30`; G uses `1.36e-5`, B uses `3.03e-5`, both go to `exp(-huge) = 0`.
3. After `computeTransmittance` the code peak-normalises (`HosekWilkieSkyBackend.ts:718-719`): `peak = max(r, g, b, 1e-4)`. The R survivor (even at `1e-30`) divides into itself = `1.0`, G/B become `0/r ≈ 0`. So `sunColor = (1, 0, 0)`.
4. The luma floor (`HosekWilkieSkyBackend.ts:722-729`) catches `luma = 0.2126 * 1 + 0 + 0 = 0.21` which is `>= 0.1`, so the floor *does not fire*. The color stays at `(1, 0, 0)` — pure red.
5. This `sunColor` then drives:
   - `moonLight.color` (`AtmosphereSystem.ts:454-455`) — terrain and combatants get lit pure red from the "sun".
   - `hemisphereLight.groundColor = horizonColor * HEMISPHERE_GROUND_DARKEN` — and `horizonColor` is the bake-time horizon-ring average, which at night is dominated by the same red-shifted Rayleigh path (`HosekWilkieSkyBackend.ts:692-708`).
   - The LUT's per-direction bake via `evaluateAnalytic`, which uses `betaR[*] * rayleighPhase * (1 - fexR)` — the `(1 - fexR)` factor for R is `1 - 0` = 1, for G,B `1 - 0` = 1 too, so the linear term is roughly equal across channels — *but* the `horizonMix` blend pulls in `lowR/G/B = pow(sunE * (...) * fexR, 0.5)` where Fex is the red-only chromaticity, so the horizon ring inherits the red bias.

   So: red sky, red fog, red light on the terrain. **One-line cause:** `HosekWilkieSkyBackend.ts:719` peak-normalisation collapses a near-zero-everywhere extinction vector to `(1, 0, 0)`.

The owner's "I like the vibe" instinct is correct — controlled red-tint at *pre-dawn / post-sunset* is the iconic "blood-red horizon over the jungle" look. The bug is that it stays red through *deep night* and across the *whole sky*, not just the horizon, and it bleeds into directional-light color so geometry reads tinted instead of cool-moonlit.

#### Observation 3 — "Midday is white-greyish-blue with no variety"

Three causes:

1. **Preset exposure is intentionally tame.** `openfrontier` exposure is `0.22` (`src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts:223`), `combat120` is `0.22` (`:275`), `ashau` is `0.18` (`:204`). After the `evaluateAnalytic` flow these multiply the linear radiance. With `compressSkyRadianceForRenderer` capping fog/hemisphere readers to `SKY_LIGHT_MAX_COMPONENT=0.84` and `SKY_FOG_MAX_COMPONENT=0.74` (`AtmosphereSystem.ts:41-42`), the *downstream-visible* color is double-clamped to a low-saturation range. The dome itself bypasses these caps (it gets the full half-float radiance) — but the *visual reference* the player sees (fog tint matching distant terrain, hemisphere fill on near surfaces) is everywhere capped. So the *whole scene* reads pale.

2. **`renderer.toneMappingExposure = 1.0`** (`src/core/GameRenderer.ts:146`). ACES at exposure 1.0 with the half-float sky bake means the dome already bypasses ACES (`toneMapped: false`) — but *terrain and everything else* doesn't. ACES on a relatively-low-radiance scene (because preset exposure is low) crushes saturation toward midgrey. The pre-merge shader-based sky pre-tonemap was *brighter* than what's in the bake now, even after the HDR fix.

3. **The midday sky gradient has no horizon-zenith variety.** The LUT is `LUT_AZIMUTH_BINS=32 x LUT_ELEVATION_BINS=8` (`HosekWilkieSkyBackend.ts:12-13`). At noon, `sunDirection.y ≈ 0.95`, and the shape `pow(max(0, 1 - sunY), 5) ≈ pow(0.05, 5) ≈ 3e-7` means `horizonMix ≈ 0` (`HosekWilkieSkyBackend.ts:832`), so the `lowR/G/B` term is ignored — the entire sky becomes the `linRb/linGb/linBb` term only. The `Lin` term itself is roughly proportional to `(1 - Fex)` per channel — at noon Fex is high (short optical path, low extinction), so `(1 - Fex)` is small and uniform across channels. **There is no horizon glow at noon by construction** of the Preetham model; the saturated zenith vs warm horizon contrast is a *low-sun* feature. Combine with point 1 (low exposure) and point 2 (ACES on a low-radiance fill), and noon collapses to "pale uniform off-white-blue". This is structurally correct Preetham math; what's missing is *aerial perspective* (Rayleigh haze accumulating with depth — a separate calculation the analytic dome cannot do) and *a real per-fragment shader* that would let the zenith hold deeper saturated blue.

### Other current-state notes

- **Dome refresh cadence:** every 2 s by default (`SKY_TEXTURE_REFRESH_SECONDS`, `HosekWilkieSkyBackend.ts:34`), 8 s on mobile (`AtmosphereSystem.ts:59`). The 256x128 = 32k-texel CPU compositing loop fires inside `refreshSkyTexture` (`HosekWilkieSkyBackend.ts:490-587`). Slice-14 telemetry already wired (`getRefreshStatsForDebug`).
- **Aerial perspective / horizon glow at low-sun:** present in `evaluateAnalytic` via the `horizonMix = pow(max(0, 1 - sunY), 5)` blend (`HosekWilkieSkyBackend.ts:832`), so dawn/dusk *does* get a warm horizon — but the gradient lives in the 256x128 LUT, not at fragment resolution.
- **Tonemap:** `renderer.toneMapping = THREE.ACESFilmicToneMapping; toneMappingExposure = 1.0` (`GameRenderer.ts:145-146`). Dome bypasses it (`toneMapped: false`). Sun-disc sprite bypasses it. All other content runs through it.
- **Sky-cycle exists.** Per-scenario presets have `todCycle` (`ScenarioAtmospherePresets.ts:206-264`); `WorldBuilder` dev console can force time-of-day (`AtmosphereSystem.ts:200-204`). So dawn/noon/dusk/night sweeps are testable.
- **Playtest evidence** (filenames only; do not load bytes):
  - `artifacts/cycle-sky-visual-restore/playtest-evidence/sky-dome-tonemap-and-lut-resolution-noon.png`
  - `artifacts/cycle-sky-visual-restore/playtest-evidence/sky-hdr-bake-restore-webgl.png`
  - `artifacts/cycle-sky-visual-restore/playtest-evidence/sky-hdr-bake-restore-webgpu.png`
  - `artifacts/cycle-sky-visual-restore/playtest-evidence/sky-sun-disc-restore-nadir.png`
  - `artifacts/cycle-sky-visual-restore/playtest-evidence/sky-sun-disc-restore-noon.png`

## Section 2 — Vision

The sky is one of the four primitives the player reads every frame, alongside terrain, vegetation, and combatants. In a Vietnam jungle game at 16°N latitude, the atmosphere has to do three things: **anchor a sense of place** (Southeast-Asian tropical sky, not generic Three.js demo blue), **read as a glance-cue** (player can tell sun direction without HUD — east at dawn, overhead at noon, west at dusk), and **set mood per time-of-day** that survives both the WebGPU and WebGL2-fallback paths byte-similar enough that pre-rendered evidence doesn't go stale per cycle.

**The sun is a character, not a coordinate.** At noon a saturated 0.5°-disc white-hot pearl with a 4°-radius cyan-tinted halo dissolves into a high zenith. Glance up while holding fire toward the sun and the ADS reticle gets a *glare overlay* — visibility loss is gameplay. Hide behind a tree and the canopy backlights into rim-lit translucent green. At golden hour the disc shifts to warm yellow-orange, the aureole stretches into a horizontal mie-scatter band, the upwind silhouettes of combatants get a 1-pixel rim of orange edge-light. At dusk the disc reddens, the haze gets denser, and the "Vietnam blood-orange horizon over the canopy" reads as a place-anchored memory. At true night the sun is gone and the sky becomes a deep navy zenith with a single moonlight directional and a hemisphere-fill skewed cool — *not* red.

**Pre-dawn / post-sunset is where the user's "red night" should live, calibrated.** The current bug is uncontrolled — Fex collapses to `(1, 0, 0)` at `dy < 0` and stays there through full night. The keeper aesthetic is the 12-15 minutes per simulated day around `sunElevation = -3° to -8°` (civil twilight) where the sky is genuinely red-shifted because shorter wavelengths refract out below the horizon. A calibrated "pre-dawn fog" preset enforces this: during civil twilight, sun color blends from `(0.95, 0.5, 0.3)` (golden-hour amber) at `0°` through `(0.95, 0.25, 0.15)` (deep blood-orange) at `-5°` to `(0.15, 0.18, 0.28)` (cool moonlight blue) at `-8°` and below. The user gets their blood-jungle horizon for ~30s of real-time per simulated day, then night reads correctly cool. Outside that band the current bug is fixed.

**Midday is "no variety" because Preetham analytic math is correct for what it models.** The real fix is per-fragment rendering of the dome (instead of a bake-and-stretch LUT), so the smooth gradient holds at 1080p resolution and a higher-res Preetham + a small set of tweaks (sun-direction-coupled saturation lift at zenith, mie-band stretching, ground-bounce green tint from jungle albedo at the horizon ring) gives the variety the current 256x128 LUT cannot. The dome math doesn't have to grow — the *delivery mechanism* does. Concrete adjectives the cycle should match: **Vietnam noon** = pale tropical-blue zenith → cyan-white halo around a real disc-shaped sun → warm yellow-white near-horizon haze with green tint from canopy bounce. **Vietnam golden hour** = saturated cobalt zenith → warm cyan band → orange aureole stretched along the horizon → mie-scattered red below. **Vietnam dusk** = deep teal zenith → blood-orange band, narrow → blackening base ridge silhouette. **Vietnam night** = navy zenith → near-black horizon → moon-fill bias cool. **Vietnam dawn** = cobalt zenith → pale gold ribbon → A Shau ridge picked out by golden-hour sidelight, canopy backlit.

**Combat readability over fidelity, always.** If a fragment shader port costs >1.5 ms on combat120 p99, the dome reverts to bake-and-stretch. The vision is achievable inside our budget; if it isn't, we ship the lesser version and document the gap.

## Section 3 — Proper engine approach

### Candidates surveyed

**A. Three.js built-in `Sky` (Preetham).** What we already use (effectively). The pre-merge `HosekWilkieSkyBackend.ts` already shipped Preetham GLSL inside its `ShaderMaterial`. Post-merge that GLSL was deleted (commit `8f3d560b`) and replaced with `MeshBasicMaterial + DataTexture`. **Gain:** zero implementation cost, restores pre-merge look exactly. **Pay:** does not solve aerial-perspective or the night-sun-color bug; not TSL — re-introduces a `ShaderMaterial` that the WebGPURenderer translates as a foreign object, regressing the "TSL-only" architectural goal of the KONVEYER migration. Three's built-in `THREE.Sky` is also Preetham-only and an unmaintained example, not core.

**B. Bruneton precomputed atmospheric scattering.** State-of-the-art for time-of-day skies. Pre-bakes 4D LUTs (transmittance, single-scattering, multiple-scattering, irradiance) at scenario boot. Used by Unity HDRP, Unreal, and several WebGPU demos. **Gain:** physically correct aerial perspective, automatic dusk/dawn warmth, proper night sky (no red bug), supports per-pixel scattering for distant geometry. **Pay:** 4 render targets for the precompute (~512x512 each) violates the cycle-voda-1 hard-stop "no new WebGLRenderTarget" — though those targets are compute-only and could be substituted with `StorageTexture` writes on WebGPU. WebGL2 fallback would still need an offscreen bake step. Implementation complexity = ~1500 LOC TSL + bake orchestration. **Reject** for this cycle: violates the no-RT cycle-hard-stop, too large for a single cycle.

**C. Hosek-Wilkie analytic sky model (true coefficient pipeline, not the Preetham approximation we mislabel as Hosek-Wilkie).** Drop-in upgrade to Preetham; better night/twilight handling, better turbidity response. **Gain:** modest visual upgrade, no LUT changes. **Pay:** doesn't solve fragment-resolution problem; still needs the dome-render fix. **Reject as standalone** — but the per-channel coefficient improvements are worth folding into the TSL port (candidate F below).

**D. HDR cubemap rotation / time-of-day blend.** Pre-bake 8 HDR cubemaps (dawn/morning/noon/afternoon/golden/dusk/twilight/night), blend between them at simulated time. **Gain:** beautiful results, simplest renderer-side code, no math. **Pay:** ~24 MB of textures per scenario (8 cubemaps × ~3 MB each at 1024² HDR); 5 scenarios = ~120 MB asset budget — way past our mobile-bundle ceiling. Also fights `WorldBuilder.forceTimeOfDay` (which expects continuous sweep). **Reject** for the asset budget.

**E. Custom physically-loose model: separate sun-disc pass + sphere shader for sky + small Rayleigh approximation.** Three small pieces, no precompute, no LUTs. **Gain:** small code, predictable cost. **Pay:** less physically grounded; means recreating from scratch what `evaluateAnalytic` already correctly computes. **Reject** — we already have the math, the bug is in delivery.

**F. Port `evaluateAnalytic` to TSL fragment node, dome becomes per-fragment-shaded again (no LUT for visuals); keep a tiny 32x8 CPU LUT for fog/hemisphere readers.** This is the "do what the pre-merge shader did, but in TSL on the new renderer." Replace `MeshBasicMaterial(map: lutTexture)` with `MeshBasicNodeMaterial(colorNode: tslPreethamNode)`. The CPU `evaluateAnalytic` is ~70 lines of math — ports cleanly to TSL (`Fn`, `Loop`, `mix`, `pow`, `exp`). The sun-disc lives inside the fragment node as `vSunE * 19000.0 * Fex * sundisc` HDR pin-point (with `tonemapped: false`); no separate sprite needed. Mie aureole, horizon glow, and Rayleigh phase all live in the fragment naturally — they don't suffer from texel quantisation. **Gain:** restores pre-merge visual fidelity, fixes the "no sun in sky" and "no horizon glow at noon" symptoms, makes night-red fixable by adding a `mix(sunColor, moonColor, smoothstep(0, -8°, elevation))` blend in one shader location, keeps the LUT cheap (32x8 = 96 floats) for fog/hemisphere readers that need CPU access. TSL-native, so WebGPU and WebGL2-fallback share the same node graph (the WebGL2 backend of WebGPURenderer translates it to GLSL). **Pay:** the dome becomes per-fragment again — adds back the cost that the bake-and-stretch path removed. Per `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/sky-visual-and-cost-regression.md:299-311`, the pre-merge per-fragment GLSL was the cheap part of the budget (a few ALU ops + no texture fetches), and only *terrain* and *NPC impostors* dominate fragment cost on the WebGL2 fallback. So the cost should be small. Risk: TSL → GLSL translation may add ALU overhead vs hand-written GLSL.

**G. For tonemap: switch ACES → AGX or Khronos PBR Neutral.** Both are mid-2024 production replacements for ACES. **AGX** (used by Blender, popular in WebGPU work) keeps better hue accuracy and doesn't desaturate hot highlights — directly addresses observation 3. **Khronos PBR Neutral** is the new glTF default. **Three.js r184 ships both** as `THREE.AgXToneMapping` and `THREE.NeutralToneMapping` (per release notes; verify in skill ref). **Gain:** noon stops collapsing to midgrey, sun-disc hue holds, sunset gold reads as gold not mustard. **Pay:** changes the look of *every* surface in the game — terrain, NPCs, weapons. Cycle would need owner playtest matrix across all scenarios.

### Recommendation: **Candidate F + Candidate G**

**Port `evaluateAnalytic` to a TSL fragment node and switch tonemap to AGX.**

The reasoning:

- **Aesthetic fit:** Per-fragment Preetham fixes the resolution problem (smooth gradient at 1080p), restores the HDR sun-disc pearl (the additive sprite becomes unnecessary), and naturally supports the dawn/noon/golden/dusk variety the user asked for. AGX preserves hue and saturation under exposure shifts — directly addresses "midday is grey-white-blue with no variety". The night-red bug becomes a one-place fix: a single TSL `mix()` between Rayleigh-derived sunColor and a hard-coded `moonColor=vec3(0.18, 0.20, 0.30)` keyed on elevation.

- **Engine fit:** TSL nodes target both `WebGPURenderer` (native WebGPU) and its internal WebGL2 backend. We already ship three TSL node materials (terrain, NPC impostors, vegetation billboards per `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md:11-18`); adding a fourth is consistent with the post-KONVEYER architecture. `MeshBasicNodeMaterial` + `colorNode` is the simplest possible TSL surface. The dome geometry, `renderOrder = -1`, `BackSide`, `depthWrite/Test: false` machinery stays. No `WebGLRenderTarget` introduced — preserves the cycle-voda-1 hard-stop.

- **Perf budget fit:** Sky dome covers ~1-1.5M visible fragments at 1080p (the lower hemisphere is terrain-occluded). The pre-merge fragment cost was the cheap budget item per `sky-visual-and-cost-regression.md:281-298`: ~6 transcendentals + 3 ALU vec3 muls per fragment, no texture fetches. On `combat120` (current p99 = 33.4 ms vs threshold 38.41 ms — 5 ms slack) and `openfrontier:short` (p99 = 32.7 ms vs 41.99 ms — 9 ms slack), this fits. The 32x32 CPU LUT (replacing 256x128) reduces the bake CPU cost by ~64×. **Expected combat120 impact:** +0.3 to +0.8 ms p99, well inside slack. Net cost may even drop (less CPU bake work, more GPU per-frame work; modern GPUs can absorb this). AGX adds ~1 cycle per fragment in the screen-final pass vs ACES; negligible.

- **Risk + back-out:**
  - *Risk 1:* TSL → WebGL2 translation introduces ALU overhead vs hand-written GLSL. *Mitigation:* compile and inspect the translated GLSL at cycle scoping; fall back to `Hand-written ShaderMaterial GLSL` (back-out path A) if translation is fat.
  - *Risk 2:* AGX shifts the look of everything; owner rejects the new terrain/NPC color. *Mitigation:* keep ACES as a runtime-toggleable option via `WorldBuilder` until owner accepts. *Back-out:* revert the renderer tonemap setting in one line; the TSL sky port is orthogonal.
  - *Risk 3:* Per-fragment dome adds cost on mobile. *Mitigation:* the bake-and-stretch LUT path is retained as a dev-flag-toggleable fallback; mobile-gated. *Back-out:* flip the mobile flag.
  - *Risk 4:* The CPU LUT shrunk to 32x32 still serves fog/hemisphere readers, but if the per-fragment dome and the CPU LUT drift visibly (because they're sampling different math precision), the horizon seam returns. *Mitigation:* the TSL fragment node and CPU `evaluateAnalytic` use the *same source math*; cycle ships a parity test comparing CPU LUT vs GPU readback at 64 directions.

The **night-red fix** is independent of the tonemap and the TSL port — it can also ship as a tiny standalone task in the same cycle: in `bakeLUT()` lines 715-729, replace the peak-normalisation + luma-floor with an elevation-keyed blend between the Fex-derived sun color (when `sunDirection.y > sin(8°)`) and a hard `moonColor` (when `sunDirection.y < sin(-8°)`), with a smooth crossfade through civil twilight. ~10 LOC. Standalone and back-outable.

## Section 4 — Acceptance criteria for cycle #13

### Visual targets (per time-of-day, all scenarios)

**Noon (sunElevation ≈ 75°, `openfrontier` + `combat120`):**
- Zenith reads cobalt-saturated blue at HSL `(210°, 70%, 50%)` ±5% per channel.
- Sun disc reads as a circular pearl, ~3-5° apparent diameter (slightly larger than real sun for gameplay readability), with a 6-10° cyan-tinted halo, no hard edge.
- Horizon ring picks up a warm cyan-white haze, distinct from zenith — at least 15% lightness delta zenith-to-horizon.
- Looking *toward* the sun while ADSing produces a glare effect (ADS reticle gains a screen-space white overlay around the disc).

**Golden hour (sunElevation ≈ 22°, `zc`):**
- Sky gradient picks up a warm-cool stratification — orange/amber band 15-30° above the horizon, transitioning to teal at zenith.
- Sun disc reads warm yellow-amber, ~4-5° diameter, with elongated horizontal mie-scatter aureole.
- Combatants and vegetation on the player-toward-sun side read backlit (rim-lit edges in the sun's hue).

**Dusk (sunElevation ≈ 6°, `tdm`):**
- Horizon band reads blood-orange / vermillion at HSL `(15-25°, 75%, 50%)`.
- Sun disc reads red-orange, larger and softer than noon (atmospheric refraction visual).
- Distant ridges silhouette black against the warm band.

**Twilight / pre-dawn (sunElevation = -5° to -2°):**
- The "keeper red" sits here — controlled blood-red horizon, dimming to navy zenith.
- Combat lighting reads cool-shifted (moonlight dominates), NOT red-tinted on terrain.
- This is the *intentional* red-vibe band.

**Night (sunElevation < -8°):**
- Zenith reads deep navy at HSL `(225°, 60%, 15%)`.
- Horizon reads near-black with a hint of cool blue at the cardinal horizon points.
- `moonLight.color` reads cool: `(0.18, 0.20, 0.30)` ± 5% per channel — NO red bleed.
- Hemisphere ground tint reads neutral-cool. The current red-everywhere bug is gone.

**Dawn (sunElevation 0° to 10°, `ashau`):**
- Mirror of dusk but cooler-shifted (post-twilight transitioning to morning gold).
- A Shau ridgeline silhouetted against pale gold ribbon, canopy backlit, ridges hold full detail through the haze (preserve the cycle-2026-04-20 fog-density rebalance work).

### Sun screen-space behavior

- Visible disc: angular diameter 3-5° at noon (~70-120 px on a 1080p frame, hFOV 90°). Tunable via a single constant; not magic.
- HDR glare/bloom radius: 6-10° at noon, stretching horizontally to 15-30° at low sun (mie-band).
- Behind-cloud occlusion: out of scope for this cycle (cloud-fidelity carries to a later cycle).
- ADS-toward-sun glare: out of scope this cycle (gameplay feature; queue as a follow-up).

### Tonemap operator + EV calibration

- Switch `renderer.toneMapping` from `THREE.ACESFilmicToneMapping` to `THREE.AgXToneMapping` (verify availability in r184 via webgpu-threejs-tsl skill ref; if AGX not in r184, fall back to `THREE.NeutralToneMapping` / Khronos PBR Neutral).
- `toneMappingExposure` recalibrated per scenario: start at `1.0` and tune per playtest matrix; document the new per-scenario exposure as a comment in `ScenarioAtmospherePresets.ts`.
- Per-scenario `preset.exposure` (currently 0.16-0.22) may need bumping by 20-50% to compensate for AGX vs ACES rolloff; tune via the WorldBuilder force-TOD flow during playtest.

### Test / evidence shape

- **Playwright captures** at all 5 scenarios × 4 times-of-day (noon, golden, dusk, twilight, dawn) = 20 shots. Reuse `scripts/capture-hosek-wilkie-shots.ts` framework; add `--tod=<noon|golden|dusk|twilight|dawn>` flag that sets `forceTimeOfDay` via the WorldBuilder hook.
- **Pre/post comparison**: `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/openfrontier-noon-pre-merge.png` is the *cited reference visual target* for noon Open Frontier saturation/sun-presence/cloud-structure.
- **Night-red regression test**: take screenshot at `forceTimeOfDay = 0.0` (midnight) on each scenario. Pixel-sample the moonLight color via a Playwright `evaluate` call to `renderer.moonLight.color.toArray()`. Assert: `r < 0.5 * max(g, b)` (i.e. NOT red-dominant).
- **Parity test**: TSL fragment node sampled at 64 directions (via offscreen render-and-readback) vs CPU `evaluateAnalytic` at the same 64 directions. Assert per-direction RGB delta < 0.05 per channel.
- **Keybind preset switches**: extend WorldBuilder `\` console with `[T]onemap: ACES | AGX | Neutral` toggle to A/B during playtest.
- **Owner walk**: existing `\` + `Shift+\` flows for force-TOD and sky-seam highlight already in place.

### Perf budget

- Max frame-time impact on `combat120` p99: **+1.0 ms** (current p99 = 33.4 ms, threshold = 38.41 ms — 5 ms slack; we use up to 20% of slack and reserve the rest).
- Max frame-time impact on `openfrontier:short` p99: **+1.0 ms** (current 32.7 ms, threshold 41.99 ms — 9 ms slack).
- Max memory budget: **0 MB net new** (the 32x32 CPU LUT replaces the 256x128 LUT; the 256x128 half-float `DataTexture` is freed; net change is a small reduction).
- Sky-refresh cadence on mobile: stays at 8 s (`AtmosphereSystem.ts:59`); since the dome is now per-fragment-shaded, the "refresh" only re-bakes the 32x32 CPU LUT for fog/hemisphere readers — cheap.

### Fallback plan if WebGPU drifts vs WebGL2

- Visual parity is a merge gate: shot pairs between `?renderer=webgpu` and `?renderer=webgl` at the same scenario+TOD must read identically to the human eye, and pixel-sampled key points (zenith, horizon-mid, sun-disc-center, anti-sun-horizon) must differ by < 5% per channel.
- If TSL → WebGL2 translation produces a fat fragment shader (>2x the GLSL op count of a hand-port), back-out path: ship a parallel `ShaderMaterial` GLSL implementation gated on `renderer.isWebGPURenderer === false`. Costs +200 LOC of duplicated GLSL but guarantees fallback-path perf.
- If AGX vs ACES drift produces visibly different scene colors between renderer modes (shouldn't — both are post-render passes — but verify), keep both tonemaps available and switch per resolved backend.

## Section 5 — Parallelization map for the active campaign

Current pointer: cycle #6 (`cycle-vekhikl-2-stationary-weapons`). Remaining queue is #7-#12.

| # | Cycle | Conflict with sky/atmo work | Parallel-safe? |
|---|-------|----------------------------|----------------|
| 7 | `cycle-voda-2-buoyancy-swimming-wading` | None. Water shader landed in cycle #5; cycle #7 wires `WaterSystem.sampleWaterInteraction` into physics + player state — pure simulation, no shader work. The underwater-fog override is already isolated in `AtmosphereSystem.applyFogColor` and won't be touched. | **YES.** Parallel-safe. |
| 8 | `cycle-vekhikl-3-tank-chassis` | None. Skid-steer locomotion + ground-conform. Pure vehicle physics. | **YES.** Parallel-safe. |
| 9 | `cycle-vekhikl-4-tank-turret-and-cannon` | Minor: muzzle flash + tracer lighting could benefit from sun-aware additive blending (so a daytime tracer reads as bright-against-sky vs. a nighttime tracer reads as bright-against-dark). Not a code conflict — tracer effects pull from `AtmosphereSystem.getSunColor()` if they want. | **YES, with optional dependency.** Tank can ship without sun-aware tracers; the integration is a one-line read in `TracerPool`. |
| 10 | `cycle-voda-3-watercraft` | **Material conflict:** water surface specular cubemap uses sun direction. The new water shader landed in #5 reads `ISkyRuntime.getSunDirection()` already (or should — check). If cycle #13 changes how `sunDirection` is computed (it doesn't), or how the sun *renders* (it does), water specular highlight visuals shift. | **YES, but VISUAL coupling.** Both cycles touch sky+sun; #13 should land *before* #10 so the water specular visual evidence captures the new sky. If #13 lands after, water specular shots in #10 evidence become stale. |
| 11 | `cycle-defekt-4-npc-route-quality` | None. Pure AI/nav work. | **YES.** Parallel-safe. |
| 12 | `cycle-stabilizat-1-baselines-refresh` | **CRITICAL CONFLICT.** Refreshes `perf-baselines.json` for combat120 + openfrontier:short. If cycle #13 lands *after* #12, the refreshed baseline doesn't include the +0.3-1.0 ms p99 impact from per-fragment sky rendering, and the next cycle that ships will see #13's cost as a "5% p99 regression" and trigger the hard-stop. If cycle #13 lands *before* #12, the refresh captures the new sky cost as the new normal — correct behavior. | **NO. Hard ordering: #13 BEFORE #12.** |

### Recommendation

**Insert cycle #13 (`cycle-sun-atmosphere-tsl-port-and-agx-tonemap`) between cycle #11 and cycle #12** (i.e., position #12, pushing the current #12 to position #13). This ensures:

- Visual coupling with #10 watercraft is captured pre-#13-merge (water specular shots in #10 use the *current* sky; the new sky is for the cycle #13's own evidence).
- Perf baseline refresh in (now-#13) `cycle-stabilizat-1-baselines-refresh` runs *after* the sky cost is in master, so the baseline includes the new normal.
- All vehicle and water cycles ship on the current (post-R1) sky, which is "acceptable but bland"; cycle #13 then upgrades the visual quality without retroactively invalidating any vehicle/water playtest evidence.

If the owner wants the sun-atmosphere visual *earlier* in the campaign (so vehicle/water cycles' playtest evidence already shows the new sky), the alternative slot is **before cycle #10** (after #9, push current #10-#12 down). The trade is that #10 watercraft has to verify against the new sky during its own playtest, but #10 hasn't been authored yet so this is a clean dependency rather than an evidence-invalidation.

## Section 6 — Open questions for the owner

1. **AGX vs ACES vs Neutral — owner aesthetic call.** AGX preserves saturation on highlights (sun pearl reads bright-but-coloured, not bright-but-white) and is increasingly the production default outside film VFX. Khronos PBR Neutral is the glTF spec default and more conservative. ACES (current) is the most "cinematic" but desaturates hot highlights. Owner picks one as the cycle target; cycle ships A/B WorldBuilder toggle so the call can be deferred to playtest, but the *default committed value* needs an owner call before merge. Recommendation: **AGX**.

2. **Keep night-red entirely or keep a calibrated "pre-dawn fog" preset?** Two options:
   - (a) Lose night-red entirely. Sun color blends cleanly to moon-cool below `-2°` elevation. Simpler. Loses the user's "vibe".
   - (b) Keep a calibrated civil-twilight red band (`-2°` to `-8°` elevation), then transition to cool moonlight below. Preserves the vibe as an *intentional* feature, restricted to ~30s of real-time per simulated day. Recommendation: **(b)**.

3. **Sun disc size — realistic (0.5°) or gameplay-readable (3-5°)?** The real sun is ~0.5° in diameter; in a 1080p 90°-hFOV frame that's ~12 px. The user says "I don't even see the sun usually" — a 12-px disc with no bloom is invisible at most yaws. A 70-120 px disc is "find it instantly without looking for it". For a combat game, gameplay readability wins; cycle should ship 3-5° + tunable. Recommendation: **3-5°** (gameplay-readable). Confirm.

4. **Per-fragment TSL dome — accept the ~0.5-1.0ms p99 cost on combat120, or keep the bake-and-stretch path with the current "bland" look?** The recommendation accepts the cost (5 ms slack on combat120 covers it). But if the owner is rigid on "zero perf regression until #12 baselines refresh", we ship as a `WorldBuilder` dev-flag-only feature this cycle and graduate to production after the baseline refresh. Recommendation: **accept the cost** (insert cycle #13 before #12 so the baseline refresh absorbs it; see Section 5).

5. **Sun-aware rim light / specular pass (gameplay glance-cue) — scope into cycle #13 or separate cycle?** The vision section identifies this as a key "sun reads as direction" cue. Implementation = per-material `onBeforeCompile` injection for terrain + NPC impostors + vegetation + helicopter + weapon. Cross-cuts every material in the game. Recommendation: **separate cycle (#14 or later)**; cycle #13 stays scoped to the sky dome + sun-disc + tonemap. Confirm.

## Citations index

### Code references (post-merge HEAD)
- `src/systems/environment/AtmosphereSystem.ts:41-42` — `SKY_LIGHT_MAX_COMPONENT=0.84`, `SKY_FOG_MAX_COMPONENT=0.74` downstream caps.
- `src/systems/environment/AtmosphereSystem.ts:59` — `MOBILE_SKY_REFRESH_SECONDS=8`.
- `src/systems/environment/AtmosphereSystem.ts:200-204` — `WorldBuilder.forceTimeOfDay` override.
- `src/systems/environment/AtmosphereSystem.ts:454-455` — `moonLight.color.copy(sunColor)`.
- `src/systems/environment/AtmosphereSystem.ts:507-510` — `updateSunDisc()` per-frame call.
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:9-13` — `SKY_TEXTURE_WIDTH/HEIGHT=256x128`, `LUT_AZIMUTH_BINS=32`, `LUT_ELEVATION_BINS=8`.
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:34` — `SKY_TEXTURE_REFRESH_SECONDS=2.0`.
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:249` — `toneMapped: false` (R1 fix).
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:490-587` — `refreshSkyTexture` (32k-texel CPU compositing loop).
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:610-618` — `mixSunDisc` (the dome's in-LUT disc).
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:692-708` — `bakeLUT()` zenith + horizon ring computation.
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:711-729` — `bakeLUT()` sun-color path **(night-red bug location)**.
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:736-754` — `computeTransmittance` (Fex computation that collapses to (1,0,0) at sub-horizon).
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:761-874` — `evaluateAnalytic` (Preetham CPU math to port to TSL).
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:832` — `horizonMix = pow(max(0, 1 - sunY), 5)` (the "noon has no horizon glow" structural cause).
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:869-873` — radiance clamp to `[0, 64]` (R1 fix).
- `src/systems/environment/atmosphere/SunDiscMesh.ts:35` — `DEFAULT_DISC_SIZE=28` (~3.2° apparent).
- `src/systems/environment/atmosphere/SunDiscMesh.ts:49-51` — `HDR_PEAK_MULTIPLIER=8.0`, `HDR_FLOOR_MULTIPLIER=1.5`.
- `src/systems/environment/atmosphere/SunDiscMesh.ts:74-83` — radial gradient (the only sun "falloff").
- `src/systems/environment/atmosphere/SunDiscMesh.ts:107-116` — material flags (`additive, toneMapped: false, depthWrite/Test: false`).
- `src/systems/environment/atmosphere/SunDiscMesh.ts:172-184` — `peakFactor = HDR_FLOOR + (PEAK - FLOOR) * elev^2`.
- `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts:191-282` — all five scenario presets (exposures 0.16-0.22, turbidities 3.0-7.0).
- `src/core/GameRenderer.ts:145-146` — `toneMapping = ACESFilmicToneMapping`, `toneMappingExposure = 1.0`.
- `src/core/GameRenderer.ts:178` — `moonLight = new THREE.DirectionalLight(0xfffacd, 2.0)`.
- `src/core/GameRenderer.ts:214-218` — `hemisphereLight` construction.
- `src/systems/effects/PostProcessingManager.ts:11-44` — no-op shim (no scene bloom available).

### Commit references
- `1df141ca` — KONVEYER merge (master adopted WebGPU + TSL); 2026-05-13.
- `79103082` — immediate pre-merge SHA (canonical reference for "pre-merge sky").
- `2118177f` — R1: `sky-dome-tonemap-and-lut-resolution` (2026-05-16).
- `3455fa96` — R1: `sky-hdr-bake-restore` (2026-05-16).
- `9e1ce7c7` — R1: `sky-sun-disc-restore` (2026-05-16).
- `4aec731e` — `strictWebGPU=false` default gate (post-merge fix).
- `09d0b562` — KONVEYER refactor: retire CloudLayer (cited in spike memo).
- `8f3d560b` — KONVEYER refactor: standard-material sky dome (the cause of the bake-and-stretch path).
- `88e30d02` — KONVEYER fix: `compressSkyRadianceForRenderer` cap.

### Memo references
- `docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md` — R2 alignment memo, parent of `cycle-sky-visual-restore` brief.
- `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/sky-visual-and-cost-regression.md` — the R1 spike that named the four compounding losses.
- `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md` — TSL material inventory; sky is **not** a TSL material (`MeshBasicMaterial` only); confirms cycle #13 adds the 4th TSL material to the engine.
- `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/webgl-fallback-pipeline-diff.md` — WebGL2 fallback path diff; confirms TSL-translated GLSL is the renderer-mode reality on mobile.
- `docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md` — 12-cycle campaign manifest; current pointer = cycle #6.
- `docs/PLAYTEST_PENDING.md` — deferred owner-walk list including `cycle-sky-visual-restore` first row (still open).
- `docs/tasks/archive/cycle-sky-visual-restore/cycle-sky-visual-restore.md` — the just-closed cycle brief.
- `perf-baselines.json` — combat120 p99 = 33.4 ms (pass = 38.41 ms; 5 ms slack).
