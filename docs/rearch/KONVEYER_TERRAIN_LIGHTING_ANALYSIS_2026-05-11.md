# KONVEYER Terrain And Lighting Analysis

Last verified: 2026-05-11

## Decision

The migration branch should pivot from "WebGPU with WebGL fallback" to strict
WebGPU-only proof. WebGL may be used as a named diagnostic comparison, but it
must not be accepted as a migration pass, fallback success, demo-readiness
claim, or default-on proof.

The game is mechanically playable on strict WebGPU on this machine, but terrain
and lighting are not visually acceptable for a demo. Open Frontier ground,
river, and foundation views are over-bright, low-tint, and low-contrast enough
to read as unfinished white terrain even while the renderer reports zero
browser errors.

## Evidence

| Run | Command | Result | Important signal |
| --- | --- | --- | --- |
| Strict WebGPU terrain visual | `npx tsx scripts/check-terrain-visual.ts --headed --port 9268 --renderer webgpu-strict` | WARN | Zero browser errors, but `terrain_ground_tone_review` rejects Open Frontier airfield/river shots. Artifact: `artifacts/perf/2026-05-11T00-26-31-266Z/projekt-143-terrain-visual-review/visual-review.md`. |
| Strict WebGPU terrain visual before guardrail | `npx tsx scripts/check-terrain-visual.ts --headed --port 9267 --renderer webgpu-strict` | PASS | Same visual problem was present, proving the previous visual gate was too weak. Artifact: `artifacts/perf/2026-05-11T00-21-20-417Z/projekt-143-terrain-visual-review/visual-review.md`. |
| Explicit WebGL diagnostic comparison | `npx tsx scripts/check-terrain-visual.ts --headed --port 9266 --renderer webgl` | WARN | Open Frontier is similarly washed out, so the terrain/lighting problem is shared, not solely a WebGPU backend break. A Shau also emits repeated `THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached.` Artifact: `artifacts/perf/2026-05-11T00-18-38-171Z/projekt-143-terrain-visual-review/visual-review.md`. |
| Open Frontier WebGPU perf capture | `npx tsx scripts/perf-capture.ts --headed --mode open_frontier --npcs 80 --duration 45 --warmup 8 --sample-interval-ms 1500 --detail-every-samples 2 --runtime-preflight false --port 9261` | WARN | Functional loop runs with zero errors after particle cleanup, but final-frame review is visually washed out. Artifact: `artifacts/perf/2026-05-11T00-12-40-838Z/summary.json`. |

Representative Open Frontier strict WebGPU metrics from the current guard:

| Shot | Luma mean | Green dominance | Edge contrast | Read |
| --- | ---: | ---: | ---: | --- |
| `airfield-foundation` | 209.97 | 0.0159 | 2.93 | Rejected: pale ground and weak terrain detail. |
| `airfield-parking` | 210.35 | 0.0257 | 3.21 | Rejected: pale pad/ground with little tint. |
| `river-oblique` | 212.31 | 0.0033 | 2.30 | Rejected: terrain/water view is nearly neutral white/grey. |
| `river-ground` | 212.20 | 0.0041 | 2.71 | Rejected: river-adjacent ground lacks readable material tone. |

## Current Pipeline

Renderer boot:

- `src/core/RendererBackend.ts` currently supports `webgl`, `webgpu`,
  `webgpu-force-webgl`, and `webgpu-strict`.
- `src/core/GameRenderer.ts` starts with a WebGL renderer, then swaps to
  `WebGPURenderer` after async init. Any WebGPU request now refuses a backend
  that resolves to WebGL.
- This is the correct proof policy for the experiment. Default migration
  validation is strict WebGPU, not fallback-tolerant WebGPU.

Lighting and atmosphere:

- `src/core/GameRenderer.ts` initializes ACES tone mapping, exposure `1.0`,
  ambient light `1.0`, directional light `2.0`, and hemisphere light `0.8`.
- `src/systems/environment/atmosphere/ScenarioAtmospherePresets.ts` drives
  scenario sun angle, sky exposure, fog density, cloud coverage, and ground
  albedo. Open Frontier is clear/noon; A Shau is dawn/light-rain and visibly
  darker.
- `src/systems/environment/WeatherAtmosphere.ts` multiplies light intensities
  and fog density by weather state. This means the current readable A Shau image
  is partly protected by rain/dawn settings, while Open Frontier exposes the
  clear/noon over-bright path.

Terrain render path:

- `src/systems/terrain/TerrainSystem.ts` creates a shared terrain material
  through `TerrainSurfaceRuntime`.
- `src/systems/terrain/TerrainBiomeRuntimeConfig.ts` maps game-mode biome ids to
  ground textures from `AssetLoader`.
- `src/systems/terrain/TerrainMaterial.ts` builds a `MeshStandardNodeMaterial`
  with custom `positionNode`, `normalNode`, `colorNode`, and `roughnessNode`.
  It disables legacy material fog and owns terrain tint/fog-like effects in the
  node graph.
- The material has no runtime visual-debug modes for "raw albedo", "normal",
  "biome slot", "surface patch", "lit color", or "fog/tint contribution", so
  screenshot failures cannot currently be traced to a specific node stage.

Validation:

- `scripts/check-terrain-visual.ts` now accepts `--renderer` and records it in
  the artifact.
- The same script now warns on high-luma, low-green, low-edge terrain views via
  `terrain_ground_tone_review`. This catches the Open Frontier problem that the
  previous nonblank/exposure checks missed.

## Research Notes

Three.js documents `WebGPURenderer` as a renderer that tries WebGPU first but
can automatically use a WebGL2 backend when WebGPU is unavailable. It also
documents `forceWebGL` as an explicit way to force that backend.

Three.js' WebGPU manual says `ShaderMaterial`, `RawShaderMaterial`, and
`onBeforeCompile()` customizations are not supported by `WebGPURenderer`; those
paths must move to node materials and TSL. The same manual says the renderer is
still experimental and that some scenes may still perform better on
`WebGLRenderer`.

TSL is the right material direction for this branch because it is designed to
generate WGSL for WebGPU and GLSL for WebGL2 from one graph, but that
cross-backend capability is exactly why fallback must be separated from proof.
A graph compiling to GLSL does not prove the WebGPU backend, WebGPU limits, or
WGSL behavior.

Three.js also documents that `Material.toneMapped` is ignored under
`WebGPURenderer`; all materials are honored by tone mapping. Engineers should
not try to solve this by opting individual terrain materials out of tone
mapping on the WebGPU path.

Sources:

- Three.js WebGPURenderer docs: https://threejs.org/docs/pages/WebGPURenderer.html
- Three.js WebGPURenderer manual: https://threejs.org/manual/en/webgpurenderer
- Three.js TSL specification: https://threejs.org/docs/TSL.html
- Three.js ShaderMaterial docs: https://threejs.org/docs/pages/ShaderMaterial.html
- Three.js Material docs: https://threejs.org/docs/pages/Material.html

## Root Cause Assessment

1. Open Frontier terrain/lighting is a shared calibration failure, not just a
   WebGPU backend failure. Strict WebGPU and explicit WebGL both show the same
   over-bright Open Frontier terrain.
2. The previous visual proof was too permissive. It treated nonblank terrain as
   acceptable and missed high-luma/low-tint terrain surfaces.
3. The default/fallback renderer policy is now actively harmful to migration
   truth. It can make a renderer pass mean "WebGPU path requested" instead of
   "WebGPU backend rendered this scene."
4. The terrain material lacks stage-level observability. The team cannot yet
   tell from one capture whether the failure is texture color space, biome
   selection, surface-patch tint, PBR lighting, tone mapping, far-canopy tint,
   or a TSL graph issue.
5. Explicit WebGL fallback is not a safe comfort path for this branch. The A
   Shau WebGL comparison emits repeated uniform-group warnings with node
   materials, which is consistent with a migration surface that has outgrown
   WebGL proof.

## Implementation Path

### 1. Make the experiment strict WebGPU-only

- Change the migration branch default to strict WebGPU proof. `webgpu` should
  either mean strict WebGPU or be retired in favor of `webgpu-strict`.
- Remove `webgpu-force-webgl` from acceptance matrices. If retained, label it
  `diagnostic-webgl-backend` and keep it out of completion audits.
- Treat `?renderer=webgl` as a separate legacy diagnostic, not a supported
  migration fallback.
- Update `scripts/konveyer-renderer-matrix.ts` and
  `scripts/konveyer-completion-audit.ts` so fallback success fails the
  migration packet.

### 2. Add terrain material debug stages

Add a strict-WebGPU-only terrain debug mode controlled by a query param such as
`?terrainDebug=albedo|normal|biome|surface|lit|fog|final`.

Required outputs:

- `albedo`: raw biome texture sample before lighting/tint.
- `biome`: false-color biome slot classification.
- `surface`: false-color feature surface weights.
- `normal`: world normal visualization.
- `lit`: MeshStandard lighting without far-canopy/fog-like terrain tint.
- `final`: shipping terrain color.

The validator should capture all modes in strict WebGPU and write per-shot
luma, green dominance, and edge contrast.

### 3. Recalibrate terrain and atmosphere from measurements

- Audit ground texture color spaces. Terrain albedo textures should have an
  explicit color-space contract; height, normal, and mask textures should stay
  linear.
- Measure raw terrain albedo on GPU before changing light values. Do not tune
  lights until the albedo/debug stages prove the sampled color is sane.
- Rebalance Open Frontier first because it is the clear/noon case that exposes
  the failure. A Shau should remain a regression target, not the tuning source.
- Revisit global light intensities in `GameRenderer` and scenario exposure in
  `ScenarioAtmospherePresets` as a single calibration pass. The current
  ambient/directional/hemisphere stack is likely too blunt for terrain under
  WebGPU node materials.
- Revisit feature-surface colors for runway, packed earth, roads, and river
  shoulders after base terrain albedo is proven.

### 4. Build acceptance gates around visual truth

Minimum strict WebGPU terrain gate before demo-ready claims:

- `browser_errors_clear=PASS`
- `terrain_ground_tone_review=PASS`
- Open Frontier and A Shau both captured in strict WebGPU
- no fallback backend in renderer capabilities
- artifact contact sheet reviewed by a human

Minimum playability gate after terrain/lighting is corrected:

- Open Frontier 60-90s active capture, strict WebGPU, no errors
- Zone Control and Team Deathmatch short captures, strict WebGPU, no errors
- A Shau short capture, strict WebGPU, no errors
- HUD/mobile checks only after the rendering issue is fixed, because current
  visuals are not acceptable enough to make UI polish the bottleneck

## Do Not Do

- Do not declare visual parity from WebGL fallback.
- Do not accept nonblank terrain as terrain-art acceptance.
- Do not tune only screenshots without adding terrain debug stages.
- Do not hide WebGPU failures behind `WebGPURenderer`'s WebGL2 backend.
- Do not merge or deploy this branch while Open Frontier terrain reads as white.
