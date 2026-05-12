# KONVEYER Terrain, Lighting, And Scene-Parity Analysis

Last verified: 2026-05-11

## Decision

The migration branch has already pivoted from "WebGPU with WebGL fallback" to
strict WebGPU-only proof. WebGL may be used as a named diagnostic comparison,
but it must not be accepted as a migration pass, fallback success,
demo-readiness claim, or default-on proof.

The earlier Open Frontier terrain-color rejection in this memo is superseded by
the later strict WebGPU terrain visual packet. Terrain color is accepted for now
unless new evidence reopens it. The next blocker is broader scene parity:
vegetation and NPC impostors look washed or detached, sky/cloud behavior feels
camera-attached in flight, the finite map edge is visible from the air, and the
`World` frame-budget bucket is too coarse to optimize safely.

## Evidence

| Run | Command | Result | Important signal |
| --- | --- | --- | --- |
| Strict WebGPU terrain visual after repair | `npx tsx scripts/check-terrain-visual.ts --headed --port 9271 --renderer webgpu-strict` | PASS | Supersedes the earlier Open Frontier terrain-color rejection. Open Frontier and A Shau terrain checks pass with zero browser/page errors. Artifact: `artifacts/perf/2026-05-11T02-00-18-828Z/projekt-143-terrain-visual-review/visual-review.md`. |
| KONVEYER completion audit | `npm run audit:konveyer-completion` | PASS | KONVEYER-0 through KONVEYER-9 branch-review packet complete; production render blockers are zero, WebGL context use is diagnostic-only. Artifact: `artifacts/perf/2026-05-11T02-10-59-661Z/konveyer-completion-audit/completion-audit.json`. |
| Strict WebGPU terrain visual | `npx tsx scripts/check-terrain-visual.ts --headed --port 9268 --renderer webgpu-strict` | WARN | Zero browser errors, but `terrain_ground_tone_review` rejects Open Frontier airfield/river shots. Artifact: `artifacts/perf/2026-05-11T00-26-31-266Z/projekt-143-terrain-visual-review/visual-review.md`. |
| Strict WebGPU terrain visual before guardrail | `npx tsx scripts/check-terrain-visual.ts --headed --port 9267 --renderer webgpu-strict` | PASS | Same visual problem was present, proving the previous visual gate was too weak. Artifact: `artifacts/perf/2026-05-11T00-21-20-417Z/projekt-143-terrain-visual-review/visual-review.md`. |
| Explicit WebGL diagnostic comparison | `npx tsx scripts/check-terrain-visual.ts --headed --port 9266 --renderer webgl` | WARN | Open Frontier is similarly washed out, so the terrain/lighting problem is shared, not solely a WebGPU backend break. A Shau also emits repeated `THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached.` Artifact: `artifacts/perf/2026-05-11T00-18-38-171Z/projekt-143-terrain-visual-review/visual-review.md`. |
| Open Frontier WebGPU perf capture | `npx tsx scripts/perf-capture.ts --headed --mode open_frontier --npcs 80 --duration 45 --warmup 8 --sample-interval-ms 1500 --detail-every-samples 2 --runtime-preflight false --port 9261` | WARN | Functional loop runs with zero errors after particle cleanup, but final-frame review is visually washed out. Artifact: `artifacts/perf/2026-05-11T00-12-40-838Z/summary.json`. |

Representative strict WebGPU terrain metrics after the repair:

| Shot | Luma mean | Edge contrast | Renderer triangles | Read |
| --- | ---: | ---: | ---: | --- |
| Open Frontier `airfield-foundation` | 146.81 | 4.62 | 1,192,656 | Accepted for terrain-color review; still not perf acceptance. |
| Open Frontier `river-ground` | 59.62 | 3.31 | 1,366,688 | Accepted for terrain-color review; hydrology/gameplay water remains separate. |
| A Shau `player-ground` | 59.76 | 8.92 | 1,763,488 | Accepted for terrain-color review; A Shau perf remains separate. |
| A Shau `river-ground` | 52.01 | 2.50 | 2,176,050 | Accepted for terrain-color review; high triangle counters need attribution. |

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
  and fog density by weather state. This still needs parity review against
  vegetation and NPC impostor material-owned fog/lighting.
- `todCycle.startHour` exists in preset data, but the current sun-direction
  function derives phase from elapsed seconds only. KONVEYER-10 should fix or
  document that drift before tuning atmosphere by eye.

Terrain render path:

- `src/systems/terrain/TerrainSystem.ts` creates a shared terrain material
  through `TerrainSurfaceRuntime`.
- `src/systems/terrain/TerrainBiomeRuntimeConfig.ts` maps game-mode biome ids to
  ground textures from `AssetLoader`.
- `src/systems/terrain/TerrainMaterial.ts` builds a `MeshStandardNodeMaterial`
  with custom `positionNode`, `normalNode`, `colorNode`, and `roughnessNode`.
  It disables legacy material fog and owns terrain tint/fog-like effects in the
  node graph.
- Terrain color is no longer the primary blocker. Keep terrain debug stages as
  useful future observability, but prioritize vegetation/NPC/sky parity for
  the next cycle.

Validation:

- `scripts/check-terrain-visual.ts` now accepts `--renderer` and records it in
  the artifact.
- The same script now warns on high-luma, low-green, low-edge terrain views via
  `terrain_ground_tone_review`. This catches the Open Frontier problem that the
  previous nonblank/exposure checks missed.
- The validator remains a terrain-color packet only. It does not prove
  vegetation/NPC parity, full A Shau perf, finite-map edge quality, or
  production rollout readiness.

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

1. The strict WebGPU proof policy is now correct: default and strict WebGPU
   must resolve to the WebGPU backend, while WebGL remains named diagnostic
   evidence only.
2. The earlier broad terrain-color issue is currently closed by the later
   terrain visual repair. Do not churn terrain color unless new captures fail
   the terrain packet again, but treat source texture outliers separately.
   The 2026-05-11 `tall-grass.webp` correction is an example: fix an obviously
   non-Vietnam asset at the source instead of hiding it in shader code.
3. Rest-of-scene washout is likely a material-model parity problem, not one
   global exposure knob. Terrain, vegetation, NPC impostors, close GLBs, water,
   and sky now use different mixes of PBR, `MeshBasicNodeMaterial`, manual
   atmosphere tint, manual fog, readability lift, and tone mapping.
4. Vegetation has explicit desaturation/exposure/light clamps in its node graph.
   NPC impostors have readability/parity/exposure/fog boosts. Those were useful
   to regain readability but can now over-lift the scene under strict WebGPU.
5. `World` over-budget reports are not actionable until atmosphere, weather,
   water, zone, and ticket work are timed separately.
6. High triangle counts need attribution before optimization. Existing terrain
   review shots already show 1M+ renderer triangle counters, and skyward
   reports may include CDLOD selection, shadow submissions, vegetation, or
   renderer-info aggregation.
7. The sky dome is camera-followed to avoid clipping. That is defensible for a
   distant sky, but clouds baked into that dome can feel player-attached during
   flight.
8. Zone Control and similar finite maps use visual margins, not a horizon
   solution. Sharp air-visible edges are expected until a terrain apron,
   low-res far ring, edge fade, or flight constraint is chosen.

## KONVEYER-10 Implementation Path

### 1. Decompose the `World` budget

- Add or expose sub-timings for atmosphere sky texture refresh, atmosphere
  light/fog application, weather updates, water updates, and zone/ticket work.
- Keep the existing `World` bucket for continuity, but make the child timings
  visible in runtime samples and perf summaries.
- Do not optimize from the aggregate `World` label alone.

### 2. Add vegetation and NPC parity observability

- Add strict-WebGPU visual/debug evidence for vegetation: raw atlas, alpha/crop,
  material lighting, fog contribution, and final output.
- Add the same staged evidence for Pixel Forge NPC impostors.
- Compare impostors to close GLBs where possible so "readable" does not become
  "washed out."
- Keep broad terrain color as a regression target, not the tuning target; fix
  individual source assets when visual review identifies a real palette miss.

### 3. Correct atmosphere drift before tuning by eye

- Fix or document `todCycle.startHour` so scenario labels like dawn/noon/dusk
  match the runtime sun phase.
- Recheck Open Frontier, Team Deathmatch, Zone Control, combat120, and A Shau
  after the sun-phase decision.
- Keep cloud coverage and fog density changes tied to artifacts, not subjective
  single screenshots.

### 4. Attribute skyward triangles

- Capture skyward renderer counters with scene attribution and pass separation
  before changing CDLOD, shadows, or vegetation density.
- Record active CDLOD tile count, terrain triangles, vegetation instances,
  world-feature visibility, and shadow/overlay contribution.
- If renderer counters aggregate passes differently under WebGPU, document that
  before setting triangle-count success thresholds.

### 5. Choose sky/cloud and finite-edge strategies

- Keep the far sky safe from clipping, but make cloud perception stable during
  flight. Candidate approaches: world/altitude-anchored cloud layer, dome UVs
  derived from world position, or reduced cloud motion/coverage in flight.
- For small maps, choose a finite-edge strategy before polishing camera flight:
  terrain apron, low-res far ring, edge fade, flight clamp, or a documented
  equivalent.

### 6. Build acceptance gates around scene truth

Minimum strict WebGPU scene-parity gate:

- default and `renderer=webgpu-strict` both resolve `webgpu`
- vegetation/NPC parity artifacts captured in at least Open Frontier and A Shau
- `World` child timings present in runtime samples
- skyward triangle attribution artifact linked
- Zone Control finite-edge decision documented
- Open Frontier, Zone Control, Team Deathmatch, combat120, and A Shau short
  captures linked with zero browser/page errors
- human review packet explicitly states remaining visual risks

## Do Not Do

- Do not declare visual parity from WebGL fallback.
- Do not reopen terrain-color tuning unless the strict terrain packet fails.
- Do not optimize from aggregate `World` timing alone.
- Do not hide the finite terrain edge with undocumented fog-only tuning.
- Do not merge or deploy this branch before KONVEYER-10 evidence is reviewed.
