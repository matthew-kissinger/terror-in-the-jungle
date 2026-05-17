# Cycle: Sun & Atmosphere Overhaul (TSL Per-Fragment Preetham + AGX Tonemap + Night-Red Fix)

Last verified: 2026-05-17 (queued at insertion; pre-dispatch)

## Status

Queued at **position #12** in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md)
(inserted between cycle #11 `cycle-defekt-4-npc-route-quality` and
the renumbered cycle #13 `cycle-stabilizat-1-baselines-refresh` on
2026-05-17). Closes a new ID `KB-SKY-DEEP` (visual-quality follow-up
to the cycle #1 `KB-SKY-BLAND` close) and the HosekWilkieSkyBackend
half of carry-over `konveyer-large-file-splits`.

**Hard ordering**: this cycle must land BEFORE cycle #13
`cycle-stabilizat-1-baselines-refresh`. The expected +0.3-1.0ms p99
cost from per-fragment dome rendering needs to land first so the
baseline refresh absorbs it as the new normal. If this cycle landed
AFTER #13, the next cycle to ship would see the new sky cost as a
5% p99 regression and trigger the campaign hard-stop. Rationale in
[docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md](../rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md)
Section 5.

## Skip-confirm: no

Owner playtest required across the 5 scenarios × 4 times-of-day
matrix (20 shots). Defer to PLAYTEST_PENDING under autonomous-loop
posture; merge gated on CI green + reviewer APPROVE + Playwright
smoke screenshots.

## Concurrency cap: 4

R1 ships the standalone night-red fix + the AGX tonemap swap + the
TSL fragment-shader sky port (these are large but independent or
near-independent). R2 ships the sun-disc tuning + per-scenario
exposure recalibration + playtest evidence.

## Objective

Port `HosekWilkieSkyBackend.evaluateAnalytic` (currently CPU JS
running per-rebake on a 256×128 LUT, then sampled per-fragment by a
`MeshBasicMaterial`) into a **TSL fragment node** wired to the dome
(`MeshBasicNodeMaterial.colorNode`); restore the per-fragment
Preetham gradient + HDR sun-disc the pre-merge GLSL had; retire the
256×128 LUT for *visual* purposes (keep a tiny 32×8 CPU LUT for
fog/hemisphere readers only); swap the renderer tonemap from
`THREE.ACESFilmicToneMapping` to `THREE.AgXToneMapping`; fix the
night-red bug via an elevation-keyed sun↔moon color blend;
recalibrate per-scenario `toneMappingExposure` and `preset.exposure`
values to compensate for AGX vs ACES rolloff. Spawn no new
`WebGLRenderTarget` (preserves the cycle-voda-1 mobile no-RT win).

The user's 2026-05-16 visual feedback after the three cycle #1
R1 PRs merged: "sun is not visually present", "night atmosphere is
red", "midday is white-greyish-blue with no variety". The cycle #1
fixes addressed the *dome carrier* (HDR LUT, `toneMapped:false`,
additive sun-disc sprite); this cycle addresses the *signal* —
restoring per-fragment dome shading, fixing the structural night-red
bug at its one-line cause, and giving midday the saturation and
horizon-zenith variety the bake-and-stretch LUT cannot deliver.

Source authority for scope, math, perf targets, and acceptance
criteria:
[docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md](../rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md)
(spike memo; read end-to-end before dispatch).

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. [docs/rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md](../rearch/SUN_AND_ATMOSPHERE_VISION_2026-05-16.md)
   — **authoritative scope memo**. Read all six sections plus the
   citations index. Section 3 candidate F is the chosen approach;
   candidate G (AGX) is the tonemap call. Section 4 enumerates
   acceptance criteria per time-of-day. Section 6 owner-defaults
   are pre-baked into this brief.
2. `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`
   (entire file, 807 LOC) — the port target. Lines `761-874`
   `evaluateAnalytic` is the CPU JS to translate to TSL. Lines
   `711-729` `bakeLUT()` sun-color path is the night-red bug
   location. Lines `9-13` LUT dimensions become `32×8` for fog/
   hemisphere readers only.
3. `src/systems/environment/AtmosphereSystem.ts` — consumer of the
   sky backend; lines `41-42` are the downstream `compressSky*`
   caps; lines `454-455` are the `moonLight.color.copy(sunColor)`
   wiring (the bug bleeds here); lines `200-204` are the
   `forceTimeOfDay` WorldBuilder override (the playtest matrix uses
   this).
4. `src/systems/environment/atmosphere/SunDiscMesh.ts` — the
   additive sprite from cycle #1 R1. Per the spike Section 3, this
   becomes unnecessary once the dome has an in-shader HDR sun-disc
   pin-point (the pre-merge `vSunE * 19000.0 * Fex * sundisc`
   path); the sprite stays as a back-out fallback gated on the same
   dev-flag as the bake-and-stretch path.
5. `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts:191-282`
   — all five preset definitions; exposures need per-scenario
   recalibration after the AGX swap.
6. `src/core/GameRenderer.ts:145-146` — `toneMapping` + `toneMappingExposure`
   site for the AGX swap.
7. `.claude/skills/webgpu-threejs-tsl` — verify `THREE.AgXToneMapping`
   availability in Three.js r184; if r184 ships only
   `THREE.NeutralToneMapping` (Khronos PBR Neutral), fall back to
   that per Section 4 of the spike memo.
8. `cycle-sky-visual-restore` archive at
   `docs/tasks/archive/cycle-sky-visual-restore/cycle-sky-visual-restore.md`
   — the predecessor cycle that landed the cycle #1 R1 fixes
   (`2118177f`, `3455fa96`, `9e1ce7c7`); this cycle builds on them.
9. `perf-baselines.json` — combat120 p99 currently 33.4 ms vs pass
   threshold 38.41 ms (5 ms slack). The +0.3-1.0 ms p99 budget
   target lives inside this slack.

## Critical Process Notes

1. **The TSL sky port and the AGX tonemap swap are independent.**
   Either can land first or in parallel. The orchestrator should
   dispatch them as separate R1 tasks so a single back-out is cheap.
2. **The night-red fix is a one-line cause** (per spike Section 1
   observation 2; spike Section 3 last paragraph). It can ship as a
   standalone R1 task without depending on the TSL port. Keep the
   change isolated to `HosekWilkieSkyBackend.ts:711-729` so the
   diff is reviewable in isolation.
3. **No new `WebGLRenderTarget`** anywhere in this cycle.
   Bruneton's precomputed-scattering candidate (spike Section 3
   candidate B) was explicitly rejected for this constraint.
4. **No fence change.** None of the targeted files
   (`HosekWilkieSkyBackend.ts`, `AtmosphereSystem.ts`,
   `SunDiscMesh.ts`, `ScenarioAtmospherePresets.ts`,
   `GameRenderer.ts`) cross the `src/types/SystemInterfaces.ts`
   fence. If an executor proposes a `[interface-change]`, halt and
   surface.
5. **Mobile-ui CI matrix must stay green.** Cycle #2 fixed the
   30-minute mobile-ui timeout via the `47c42216` matrix-fan-out.
   This cycle's per-fragment dome runs on every fragment of the
   visible upper hemisphere — verify the mobile-emulation perf
   probes hold against `cycle-mobile-webgl2-fallback-fix`'s
   measured baselines (Pixel 5 23.68 avgFps, iPhone 12 28.30 avgFps;
   per `docs/PLAYTEST_PENDING.md`).
6. **Mobile sky-refresh cadence stays at 8 s** (`AtmosphereSystem.ts:59`).
   The 32×8 CPU LUT for fog/hemisphere readers is what gets re-baked
   on the cadence; the per-fragment dome shading is per-frame on
   the GPU regardless of cadence.
7. **Owner-default decisions from spike Section 6 are pre-baked**
   into this brief's Acceptance Criteria. Owner can override before
   cycle dispatch by editing this brief (see "Open Questions" below
   for the explicit list).
8. **Visual parity merge gate**: WebGPU vs WebGL2 fallback shot
   pairs at the same scenario+TOD must read identically to the
   human eye; pixel-sampled key points (zenith, horizon-mid,
   sun-disc-center, anti-sun-horizon) must differ by < 5% per
   channel.
9. **TSL → WebGL2 translation risk**: if the translated GLSL is
   >2× the op count of a hand-port, ship a parallel `ShaderMaterial`
   GLSL implementation gated on `renderer.isWebGPURenderer === false`.
   This is the documented back-out path A from spike Section 4.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `night-red-fix`, `agx-tonemap-swap`, `tsl-preetham-fragment-port` | 3 | Three independent landings. Night-red is ~10 LOC + tests; AGX is a ~5 LOC renderer change + scenario-preset exposure tweaks; TSL port is the large one (~400-600 LOC TSL + sibling test + parity test against CPU `evaluateAnalytic`). |
| 2 | `sun-disc-and-aureole-tuning`, `per-scenario-exposure-recalibration`, `sun-and-atmosphere-playtest-evidence` | 3 | Disc tuning composes with the in-shader HDR pin-point from R1; exposure tuning depends on AGX landing; playtest captures use the WorldBuilder force-TOD flow. |

## Task Scope

### night-red-fix (R1)

Standalone fix for the bug identified in spike Section 1
observation 2. One-place fix in `HosekWilkieSkyBackend.bakeLUT()`.

**Files touched:**
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`
  (lines `711-729` — replace peak-normalisation + luma-floor with
  elevation-keyed sun↔moon blend).
- Sibling test (extend existing `HosekWilkieSkyBackend.test.ts`
  with a night-red regression test).

**Method:**
1. In the sun-color path after `computeTransmittance(sunDirection, sunColor)`,
   compute `sunElevationRad = asin(clamp(sunDirection.y, -1, 1))`.
2. Define `MOON_COLOR = new THREE.Color(0.18, 0.20, 0.30)` (cool
   moonlight blue per spike Section 2 vision and Section 4 night
   target).
3. Define civil-twilight band: `TWILIGHT_UPPER_RAD = THREE.MathUtils.degToRad(-2)`,
   `TWILIGHT_LOWER_RAD = THREE.MathUtils.degToRad(-8)`. (Owner-default
   per spike Section 6 question 2 recommendation (b).)
4. Replace the peak-normalisation + luma-floor with an
   elevation-keyed `THREE.Color.lerpColors(sunColorRaw, MOON_COLOR, t)`
   where `t = smoothstep(TWILIGHT_UPPER_RAD, TWILIGHT_LOWER_RAD, sunElevationRad)`
   (so `t=0` at `-2°` keeps the warm Fex-derived color and `t=1` at
   `-8°` and below is pure moon-cool). The peak-normalisation +
   luma-floor are then applied to the blended color, NOT the raw
   Fex output.
5. Result: `sunColor` reads warm at golden-hour, red-shifted in
   civil twilight (the "vibe" band), cool moonlight at deep night.
6. Commit message: `fix(atmosphere): elevation-keyed sun↔moon color blend kills night-red bleed (night-red-fix)`.

**Acceptance:**
- Lint + tests + build green.
- New behavior test: at `sunDirection.y = sin(deg2rad(-10°))`,
  resulting `sunColor` reads cool: `r < 0.5 * max(g, b)`.
- New behavior test: at `sunDirection.y = sin(deg2rad(-5°))`,
  resulting `sunColor` retains warm Fex-derived red-shift (vibe
  band).
- Existing `HosekWilkieSkyBackend.test.ts` cases pass byte-identical.

### agx-tonemap-swap (R1)

Switch the renderer tonemap from `THREE.ACESFilmicToneMapping` to
`THREE.AgXToneMapping` per spike Section 3 candidate G; recalibrate
`renderer.toneMappingExposure` at the renderer init site only.
Per-scenario `preset.exposure` recalibration is the separate R2
task `per-scenario-exposure-recalibration`.

**Files touched:**
- `src/core/GameRenderer.ts` (lines `145-146`).
- Possibly a new `src/core/RendererToneMapping.ts` if the
  per-renderer-mode tonemap availability check grows past 5 LOC.
- Sibling test.

**Method:**
1. Read the webgpu-threejs-tsl skill ref to confirm
   `THREE.AgXToneMapping` is exposed in r184. If yes, set it. If
   not (regression in r184 only), fall back to
   `THREE.NeutralToneMapping` (Khronos PBR Neutral) per spike
   Section 4.
2. `renderer.toneMappingExposure = 1.0` as the new default (was
   `1.0` already, but the per-scenario `preset.exposure` will be
   recalibrated in R2 to ride on the new AGX/Neutral rolloff).
3. Keep ACES available as a runtime-toggleable option via
   `WorldBuilder` dev console for owner playtest A/B (per spike
   Section 4 "Keybind preset switches"). The dev-flag wiring is a
   ~30 LOC addition.
4. Commit message: `feat(renderer): switch to AGX tonemap; ACES toggleable via WorldBuilder (agx-tonemap-swap)`.

**Acceptance:**
- Lint + tests + build green.
- Behavior test asserts `renderer.toneMapping === THREE.AgXToneMapping`
  (or `THREE.NeutralToneMapping` fallback) after init.
- WorldBuilder console toggles to ACES at runtime (smoke test).
- No perf regression on `combat120` p99 (AGX adds ~1 cycle per
  fragment in screen-final; negligible).

### tsl-preetham-fragment-port (R1)

The large task. Port `HosekWilkieSkyBackend.evaluateAnalytic` (~70
LOC of CPU JS Preetham math) to a TSL fragment node graph; replace
the dome's `MeshBasicMaterial(map: lutTexture)` with
`MeshBasicNodeMaterial(colorNode: tslPreethamNode)`; embed the
HDR sun-disc pin-point (`vSunE * 19000.0 * Fex * sundisc`) inside
the fragment node so the additive `SunDiscMesh` sprite becomes
optional; retain a 32×8 CPU LUT for fog/hemisphere readers via the
existing `sample()` accessor.

**Files touched:**
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`
  (LUT dimensions `9-13` shrink from `256×128` to `32×8`; the
  per-fragment compositing loop in `refreshSkyTexture` `490-587`
  shrinks to the 32×8 path; the dome material in `249` becomes
  `MeshBasicNodeMaterial`).
- New: `src/systems/environment/atmosphere/HosekWilkieTslNode.ts`
  (~400-500 LOC TSL `Fn` graph implementing the per-fragment
  Preetham + in-shader HDR sun-disc).
- New sibling test (the TSL node graph tested via CPU-side
  numerical evaluation if the TSL `Fn` supports it; otherwise a
  parity test that renders the node to a 64-direction render target
  and reads back).
- Updated existing test in `HosekWilkieSkyBackend.test.ts` to
  reflect the new 32×8 LUT dimensions.

**Method:**
1. Port `evaluateAnalytic` (`761-874`) to TSL `Fn` per the
   webgpu-threejs-tsl skill reference. Use `Fn`, `Loop`, `mix`,
   `pow`, `exp`, `vec3`, `vec2`, `attribute`, `uniform`. Inputs:
   sun direction uniform, turbidity uniform, ground-albedo uniform,
   per-fragment view direction (computed from `normalize(positionWorld.xyz - cameraPosition.xyz)`).
2. The in-shader sun-disc pin-point lives inside the same fragment
   node: `mix(skyColor, sunDiscColor, smoothstep(SUN_DISC_INNER, SUN_DISC_OUTER, sunDot))`.
   `SUN_DISC_INNER`/`OUTER` are uniforms; defaults from sibling
   task `sun-disc-and-aureole-tuning` (R2). Use `vSunE * 19000.0 * Fex * sundisc`
   shape per spike Section 1 observation 1 and Section 3 candidate
   F discussion.
3. Replace `MeshBasicMaterial(map: lutTexture)` with
   `MeshBasicNodeMaterial({ colorNode: tslPreethamNode, toneMapped: false,
   side: THREE.BackSide, depthWrite: false, depthTest: false })`.
   Dome geometry + `renderOrder = -1` + camera-follow logic stay.
4. Shrink the CPU LUT from `256×128 = 32k texels` to `32×8 = 256
   texels`. The CPU LUT is now ONLY consumed by `sample()` (fog +
   hemisphere readers). `refreshSkyTexture` shrinks accordingly.
   Slice-14 telemetry (`getRefreshStatsForDebug`) stays.
5. Add a TSL/CPU parity test: pick 64 directions on the sphere,
   render the dome to an offscreen target at those directions, read
   back, compare to CPU `evaluateAnalytic` at the same directions.
   Per-direction RGB delta target: < 0.05 per channel.
6. Dev-flag back-out: gate the new TSL dome behind
   `WorldBuilder.skyBackendMode = 'tsl' | 'lut-bake'`; default
   `'tsl'`; if mobile or owner picks `lut-bake`, ship the old
   256×128 LUT + `MeshBasicMaterial` path as fallback.
7. Commit message: `feat(atmosphere): TSL per-fragment Preetham + in-shader HDR sun-disc; 32×8 CPU LUT for fog readers (tsl-preetham-fragment-port)`.

**Acceptance:**
- Lint + tests + build green.
- TSL/CPU parity test passes (< 0.05 per-channel delta at 64
  directions).
- WebGPU vs WebGL2 visual parity proven by Playwright capture pair
  at noon Open Frontier; pixel-sampled zenith + horizon + sun-disc
  centers differ by < 5% per channel.
- `combat120` p99 stays inside +1.0 ms budget (current 33.4 ms;
  threshold 38.41 ms; max acceptable post-port 34.4 ms).
- `openfrontier:short` p99 stays inside +1.0 ms budget (current
  32.7 ms; threshold 41.99 ms).
- Mobile sky-refresh cadence stays at 8 s and the 32×8 CPU LUT
  bake completes inside the existing `refreshSkyTexture` budget
  with margin.
- Net memory: 0 MB new (the 256×128 half-float `DataTexture` is
  freed; the 32×8 LUT is smaller; net change is a small reduction).
- If TSL→WebGL2 translation produces a fat shader (>2× hand-port
  op count): ship the back-out path A parallel `ShaderMaterial`
  GLSL gated on `!renderer.isWebGPURenderer`. Document in commit
  message + cycle close memo.

### sun-disc-and-aureole-tuning (R2)

Tune the in-shader HDR sun-disc parameters (size, falloff, aureole
radius, mie band stretching at low sun) and decide whether the
additive `SunDiscMesh` sprite from cycle #1 stays as a fallback or
is retired.

**Files touched:**
- `src/systems/environment/atmosphere/HosekWilkieTslNode.ts` (the
  R1 TSL graph) — tune the disc-related uniforms and defaults.
- `src/systems/environment/atmosphere/SunDiscMesh.ts` — gate behind
  a `useAdditiveSunSprite` flag default `false`; retain as
  back-out only.

**Method:**
1. Default disc apparent diameter: **3-5°** (owner-default per
   spike Section 6 question 3 recommendation; ~70-120 px in 1080p
   90°-hFOV). Configurable via a single constant per spike
   Section 4 "Sun screen-space behavior".
2. HDR glare/bloom radius: 6-10° at noon, stretching to 15-30° at
   low sun (mie band). Implementation: a second `smoothstep` outside
   the disc-inner falloff that adds a softer additive contribution.
3. Behind-cloud occlusion: **out of scope** this cycle (per spike
   Section 4 explicit deferral). Cloud-fidelity carries to a later
   cycle.
4. ADS-toward-sun glare: **out of scope** this cycle (gameplay
   feature; queue as follow-up per spike Section 4 explicit
   deferral and Section 6 question 5 recommendation).
5. Retire the additive `SunDiscMesh` sprite by default; keep the
   code path behind `WorldBuilder.useAdditiveSunSprite` flag for
   A/B back-out.
6. Commit message: `feat(atmosphere): tune in-shader HDR sun-disc; retire additive sprite by default (sun-disc-and-aureole-tuning)`.

**Acceptance:**
- Lint + tests + build green.
- Playwright capture at noon Open Frontier shows the sun reading
  as a `3-5°` pearl with visible aureole.
- Playwright capture at golden hour shows the mie-band stretching.
- WorldBuilder toggle re-enables the additive sprite for back-out
  verification (smoke test).

### per-scenario-exposure-recalibration (R2)

After AGX lands, the existing per-scenario `preset.exposure` values
(0.16-0.22 currently) likely need bumping by 20-50% to compensate
for AGX's softer rolloff. Tune via the WorldBuilder force-TOD
playtest matrix.

**Files touched:**
- `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts`
  (lines `191-282`, per-scenario `exposure` field on all five
  presets).
- `src/systems/environment/AtmosphereSystem.ts` (lines `41-42`,
  `SKY_LIGHT_MAX_COMPONENT` / `SKY_FOG_MAX_COMPONENT` may need
  bumping if the downstream caps clip the new AGX range).

**Method:**
1. Spin up WorldBuilder dev console; sweep `forceTimeOfDay` across
   `[0.0, 0.25, 0.5, 0.75]` (midnight, dawn, noon, dusk) on each
   of the five scenarios.
2. Per scenario, find the exposure value that makes the new TSL
   dome read at the spike Section 4 visual targets (HSL ranges
   listed per time-of-day).
3. Document the new per-scenario exposure as a code comment in
   `ScenarioAtmospherePresets.ts` explaining the AGX vs ACES delta.
4. If the downstream `SKY_LIGHT_MAX_COMPONENT` / `SKY_FOG_MAX_COMPONENT`
   caps still clip the AGX range visibly, bump them; document the
   change reason.
5. Commit message: `tune(atmosphere): per-scenario exposure recalibration for AGX rolloff (per-scenario-exposure-recalibration)`.

**Acceptance:**
- Lint + tests + build green.
- 20 Playwright captures (5 scenarios × 4 TOD) — see playtest
  evidence task — show scenes inside the spike Section 4 HSL
  targets per TOD.

### sun-and-atmosphere-playtest-evidence (R2, merge gate)

Owner playtest matrix + Playwright smoke capture under
autonomous-loop posture.

**Files touched:**
- New: `docs/playtests/cycle-sun-and-atmosphere-overhaul.md`.
- New: `scripts/capture-sun-and-atmosphere-shots.ts` (extend the
  existing `scripts/capture-hosek-wilkie-shots.ts` framework per
  spike Section 4 "Test / evidence shape"; add `--tod=<noon|golden|dusk|twilight|dawn>`
  flag that sets `forceTimeOfDay` via the WorldBuilder hook).
- Append to `docs/PLAYTEST_PENDING.md`.

**Method:**
1. Capture 5 scenarios × 4 times-of-day = 20 shots: noon, golden
   (sunElevation ~22°), dusk (~6°), twilight (-5°), dawn (mirror
   of dusk).
2. Capture at WebGPU + WebGL2 fallback for at least one scenario
   to prove visual parity (4 shots; 5×2 = 10 if doing all
   scenarios).
3. Night-red regression: take screenshot at `forceTimeOfDay = 0.0`
   (midnight) on each scenario; pixel-sample `renderer.moonLight.color`
   via Playwright `evaluate`; assert `r < 0.5 * max(g, b)`.
4. Comparison reference: `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/openfrontier-noon-pre-merge.png`
   for noon Open Frontier saturation/sun-presence/cloud-structure.
5. Write the playtest doc + the PLAYTEST_PENDING row with full
   walk-list per spike Section 4.
6. Commit message: `docs(sun-and-atmosphere): playtest evidence + capture script (sun-and-atmosphere-playtest-evidence) (playtest-deferred)`.

**Acceptance:**
- Lint + tests + build green.
- 20 + parity + 5 night-red regression screenshots committed under
  `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/`.
- Night-red regression assertion passes on all 5 scenarios.
- WebGPU/WebGL2 parity holds (< 5% per-channel delta at sampled
  key points).
- Playtest doc + PLAYTEST_PENDING row landed.

## Hard Stops

Standard:
- Fenced-interface change → halt and surface. None of the targeted
  files cross the fence; if an executor proposes one, the diff is
  off-scope.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- Any new `WebGLRenderTarget` introduced anywhere in the diff →
  halt (cycle-voda-1 mobile no-RT win is load-bearing).
- TSL → WebGL2 translation produces a fragment shader >2× the
  hand-port op count → ship back-out path A (parallel
  `ShaderMaterial` GLSL gated on `!renderer.isWebGPURenderer`),
  document, do NOT halt unless the back-out also overshoots
  budget.
- Per-fragment dome adds > 1.0 ms p99 on `combat120` after R1
  lands (against the current 33.4 ms baseline) → halt; reassess
  with mobile-gated dev-flag fallback to the bake-and-stretch
  path.
- Visual parity WebGPU vs WebGL2 fails (> 5% per-channel delta at
  sampled key points) at merge time → halt; iterate the parallel
  GLSL implementation until parity holds.
- Mobile-emulation perf probes (Pixel 5, iPhone 12) regress past
  cycle #2's measured baselines (23.68 avgFps, 28.30 avgFps) by
  more than 10% → halt; mobile-gate the per-fragment dome behind
  the dev-flag default `'lut-bake'` for mobile.
- Owner playtest rejects R2 twice → halt (deferred under
  autonomous-loop; orchestrator proceeds, owner sweeps later).
- Carry-over count growth during cycle → halt; cycle becomes
  INCOMPLETE per the campaign hard-stop.

## Reviewer Policy

- **No mandatory `combat-reviewer`** — no `src/systems/combat/**`
  touches expected.
- **No mandatory `terrain-nav-reviewer`** — no `src/systems/terrain/**`
  or `src/systems/navigation/**` touches expected.
- Orchestrator reviews all PRs for: surface integrity (no fence
  leak), perf budget compliance, visual parity at the WebGPU /
  WebGL2 merge gate, mobile-ui CI matrix green.
- **Optional perf-analyst pre-merge gate** for
  `tsl-preetham-fragment-port` — given the per-fragment cost claim,
  spawn `perf-analyst` to compare `combat120` + `openfrontier:short`
  against baseline after the TSL port lands but before merge.

## Acceptance Criteria (cycle close)

Per spike Section 4 — all of these must hold at cycle close.

**Visual targets (per time-of-day, all scenarios):**
- **Noon**: cobalt-saturated zenith (HSL `(210°, 70%, 50%)` ±5%
  per channel); 3-5° pearl sun-disc with 6-10° cyan-tinted halo;
  ≥ 15% lightness delta zenith-to-horizon.
- **Golden hour**: warm-cool stratification — orange/amber band
  15-30° above horizon, teal at zenith; backlit rim on
  combatants/vegetation toward sun.
- **Dusk**: blood-orange / vermillion horizon band (HSL `(15-25°, 75%, 50%)`);
  red-orange sun-disc larger and softer than noon; distant ridges
  silhouette black.
- **Twilight (sunElevation -5° to -2°)**: the intentional
  "keeper red" vibe band; controlled blood-red horizon, dimming to
  navy zenith; combat lighting reads cool-shifted (moonlight
  dominates), NOT red-tinted on terrain.
- **Night (sunElevation < -8°)**: deep navy zenith (HSL `(225°, 60%, 15%)`);
  near-black horizon with hint of cool blue; `moonLight.color`
  reads cool `(0.18, 0.20, 0.30)` ±5% per channel — **NO red bleed**;
  hemisphere ground tint reads neutral-cool.
- **Dawn**: mirror of dusk but cooler-shifted; A Shau ridgeline
  silhouetted against pale gold ribbon; canopy backlit; ridges
  hold full detail through the haze (preserve cycle-2026-04-20
  fog-density rebalance).

**Tonemap + EV:**
- `renderer.toneMapping === THREE.AgXToneMapping` (or
  `THREE.NeutralToneMapping` fallback if r184 lacks AGX) by
  default; ACES available via WorldBuilder dev console.
- `toneMappingExposure = 1.0` default; per-scenario `preset.exposure`
  recalibrated (commented per delta vs ACES).

**Sun screen-space behavior:**
- Visible disc: 3-5° apparent diameter at noon (70-120 px on 1080p
  90°-hFOV).
- HDR glare/bloom radius: 6-10° at noon → 15-30° at low sun.
- Behind-cloud occlusion: out of scope (later cycle).
- ADS-toward-sun glare: out of scope (later cycle).

**Test / evidence:**
- 20 Playwright captures (5 scenarios × 4 TOD).
- Night-red regression: `r < 0.5 * max(g, b)` on `moonLight.color`
  at midnight, all 5 scenarios.
- TSL/CPU parity test: < 0.05 per-channel delta at 64 sampled
  directions.
- WebGPU/WebGL2 parity: < 5% per-channel delta at sampled key
  points (zenith, horizon-mid, sun-disc-center, anti-sun-horizon).

**Perf budget:**
- `combat120` p99 ≤ 34.4 ms (current 33.4 ms + 1.0 ms max).
- `openfrontier:short` p99 ≤ 33.7 ms (current 32.7 ms + 1.0 ms
  max).
- 0 MB net new memory (32×8 LUT replaces 256×128 LUT).
- Mobile sky-refresh cadence unchanged at 8 s.

**Other:**
- All R1 + R2 task PRs merged.
- Owner playtest sign-off recorded (deferred under
  autonomous-loop).
- No fence change.
- No new `WebGLRenderTarget`.
- `KB-SKY-DEEP` (new) added to and immediately closed in
  CARRY_OVERS.md (zero-cycle visual-quality follow-up to
  KB-SKY-BLAND).
- `konveyer-large-file-splits` HosekWilkieSkyBackend half moved
  Active → Closed in CARRY_OVERS.md (the TSL port retires the
  807-LOC grandfather entry; the new modules each stay ≤ 700 LOC
  per Phase 0 file-size rule).

## Out of Scope

- Behind-cloud sun occlusion (cloud-fidelity carries to a later
  cycle).
- ADS-toward-sun glare gameplay feature (queue as follow-up cycle).
- Sun-aware rim light / specular pass cross-cutting every material
  in the game (queue as separate cycle #14 or later per spike
  Section 6 question 5 recommendation).
- Bruneton precomputed atmospheric scattering (rejected for cycle
  hard-stop on no-RT and scope size; see spike Section 3 candidate
  B).
- HDR cubemap rotation (rejected for ~120 MB asset budget; see
  spike Section 3 candidate D).
- Cloud representation / cloud-deck art direction (separate cycle
  per spike Section 1 explicit deferral).
- Touching `src/systems/combat/**`, `src/systems/terrain/**`,
  `src/systems/navigation/**`.
- Fenced-interface touches.
- Refactoring `HosekWilkieSkyBackend.ts` beyond what the TSL port
  + 32×8 LUT shrink necessitates (out-of-scope cleanup is a
  drift-correction signal).

## Open Questions (owner-default decisions pre-baked)

Per spike Section 6. Owner can override any of these by editing
this brief before cycle dispatch.

1. **AGX vs ACES vs Neutral.** **Default: AGX.** Per spike Section
   6 question 1 recommendation. Cycle ships ACES as runtime A/B
   toggle via WorldBuilder so owner can override at playtest time.
2. **Keep night-red entirely or calibrated civil-twilight band?**
   **Default: option (b) — calibrated civil-twilight red band
   (`-2°` to `-8°` elevation), then cool moon below.** Per spike
   Section 6 question 2 recommendation. Implemented in
   `night-red-fix` task as the elevation-keyed lerp.
3. **Sun disc size — realistic (0.5°) or gameplay-readable (3-5°)?**
   **Default: 3-5° (gameplay-readable).** Per spike Section 6
   question 3 recommendation. Tunable via single constant in
   `sun-disc-and-aureole-tuning`.
4. **Per-fragment TSL dome — accept the ~0.5-1.0 ms p99 cost or
   keep bake-and-stretch path?** **Default: accept the cost** (5 ms
   slack on combat120 covers it; this cycle is inserted BEFORE the
   baseline refresh to absorb it as the new normal). Per spike
   Section 6 question 4 recommendation. Back-out: `WorldBuilder.skyBackendMode`
   flag default `'tsl'`; flip to `'lut-bake'` per device if needed.
5. **Sun-aware rim light / specular pass — scope into this cycle
   or separate?** **Default: separate cycle (#14 or later).** Per
   spike Section 6 question 5 recommendation. This cycle stays
   scoped to sky dome + sun-disc + tonemap.

## Carry-over impact

- New ID: `KB-SKY-DEEP` (visual-quality follow-up to KB-SKY-BLAND
  from cycle #1; cycle-open ID — opens at cycle launch, closes at
  cycle close, lives only as a history-log entry per the cycle-#1
  precedent).
- `konveyer-large-file-splits` HosekWilkieSkyBackend half moves
  Active → Closed via this cycle (cycles open at close: ~3+;
  carry-over note column in Active table updated at cycle
  start to reflect this cycle as the closure path).

Net cycle delta on active carry-over count: -1 (closes the
HosekWilkieSkyBackend half of `konveyer-large-file-splits`,
which was the last active row remaining on that carry-over after
cycle #5 closed the WaterSystem half).

Closes: VODA-adjacent visual quality (no DIRECTIVES entry —
absorbed under the sun-and-atmosphere overhaul umbrella).
