# Projekt Objekt-143 Recovery Ledger

Last updated: 2026-05-04

This ledger tracks the recovery operation opened after field reports of
startup stalls, frame-time regressions, imposter visual mismatches, vegetation
horizon loss, grenade spikes, profiler distrust, and the WebGL/WebGPU strategy
question. It is the project control record for this recovery program; broader
current-state truth remains in [STATE_OF_REPO.md](STATE_OF_REPO.md).

## Operating Rule

Evidence before opinion. Measurement before decision. No bureau is allowed to
claim a fix until the telemetry path can show what changed and whether the
measurement itself was trustworthy.

## Phase Status

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 1 - Inspectorate of Foundations | SIGNED 2026-05-02 | Read-only audit completed against code, docs, live Pages state, GitHub Actions, perf artifacts, and static asset inventory. |
| Phase 2 - Specialist Bureaus | ACTIVE | Cycle 1 baseline bundle is filed with WARN status. The initial docs/tooling release deployed at `806d5fa43d63854dd80496a67e8aaef4a741c627`; the follow-up agent-DX release deployed at `f68f09afdd537d4cbe3db3ab5f10d90a13944e6e`; release-DX hardening deployed at `5f46713d101f6fea974da6d77f303c95df58000c`; Cycle 2 aircraft delivery deployed at `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`. Exact production SHA remains `/asset-manifest.json`. Cycle 2 visual/runtime proof is evidence-complete PASS through `artifacts/perf/2026-05-03T16-48-58-020Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`, with KB-CULL renderer/category proof at `artifacts/perf/2026-05-03T10-21-12-603Z/projekt-143-culling-proof/summary.json` and KB-OPTIK matched proof refreshed after the selected-lighting luma slice at `artifacts/perf/2026-05-03T16-48-28-452Z/projekt-143-optics-scale-proof/summary.json`. Commit `b7bcd0e25b09f89c8f2416d8ec1b3c7a7cd4abc9` drops the NPC runtime target to `2.95m` and adds generated per-tile imposter crop maps; commit `1395198da4db95611457ecde769b611e3d36354e` adds faction imposter material tuning. Matched visible-height ratios improved from the Cycle 2 before range `0.52-0.54x` to `0.861-0.895x`, and selected-lighting luma delta now ranges `-0.44%` to `0.36%`. No perf improvement, final visual parity, aircraft-scale acceptance, or production parity is claimed. KB-METRIK remains first and blocks optimization claims from other bureaus. |
| Phase 3 - Multi-Cycle Engineering Plan | KB-CULL OWNER BASELINE READY 2026-05-04 | Dependency-aware cycle plan exists below. Cycle 3 readiness is mechanically summarized by `artifacts/perf/2026-05-04T00-14-47-283Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`, and the refreshed KB-OPTIK decision packet is filed at `artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json`. Commit `5792bafb7abd51c12dcf715a395a9c1d8c91c8ad` adds the NPC imposter atmosphere/fog uniform path; near-stress expanded proof at `artifacts/perf/2026-05-03T18-46-14-291Z/projekt-143-optik-expanded-proof/summary.json` reduces luma from `-53.57%` to `104.58%` down to `-11.31%` to `9.03%`, inside the `+/-12%` band, but still flags `10/40` 8.5m perspective visible-height samples. Commit `5b053711cece65b5915ea786acc56e4a8ea22736` adds the runtime LOD-edge camera profile set and routing; committed-sha LOD-edge proof at `artifacts/perf/2026-05-03T19-02-38-432Z/projekt-143-optik-expanded-proof/summary.json` is PASS with `0/40` flags, visible-height ratio `0.855-0.895`, and luma `-6.94%` to `9.77%`. KB-LOAD has a giantPalm-only upload warmup that reduces WebGL upload totals but does not prove startup-latency improvement. KB-EFFECTS low-load grenade first-use closeout is evidence-complete for the unlit pooled explosion path at `artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json`: measurement trust PASS, no trigger/post-trigger browser stall, detonation max `30.2ms`, near-trigger main-scene render max `23.6ms`, and grenade frag JS `1.5ms` total. KB-TERRAIN has a clean-HEAD fresh perf-build elevated screenshot/perf-before baseline at `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`; it is ready for a far-horizon branch but does not accept any canopy or distance-policy remediation. KB-CULL now has a clean-HEAD owner-path baseline at `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`; it selects large-mode world static features plus visible helicopters as the first representative branch path and keeps close-NPC pool residency diagnostic-only. KB-OPTIK still needs a near-stress visual-exception/human-review decision or a deliberate switch to KB-LOAD/KB-TERRAIN/KB-CULL. No culling/HLOD remediation is accepted yet. |

## Shipped Cycle 0 State

Cycle 0 evidence payload shipped on `master` at
`475aa7792c51823184c454a0b63852e79da2285d` through manual Deploy workflow run
`25262818886`. Live Pages `/asset-manifest.json` returned that payload SHA,
`/`, `/sw.js`, `/asset-manifest.json`, the A Shau R2 DEM URL, hashed JS/CSS,
and Recast WASM assets returned `200`, and a live browser smoke reached the
Zone Control deploy UI with no console, page, request, or retry-panel failures.
Doc-only release-state commits may advance `master`; the live
`/asset-manifest.json` remains the current deployed SHA source of truth.

Shipped payload:

- Measurement trust and scene attribution in `scripts/perf-capture.ts`.
- Startup UI evidence expansion in `scripts/perf-startup-ui.ts` and
  `scripts/perf-browser-observers.js`: long tasks, long animation frames, CPU
  profiles, WebGL texture-upload attribution, source URLs, and summary upload
  totals.
- Stable retail startup labels in `src/core/SystemInitializer.ts`.
- Live-entry user-timing marks in `src/core/LiveEntryActivator.ts`; the bounded
  frame-yield guard did not fix the stall and must be treated as observability,
  not remediation.
- Pixel Forge texture acceptance audit in
  `scripts/pixel-forge-texture-audit.ts`, exposed through
  `npm run check:pixel-forge-textures`.
- Grenade-spike attribution in `src/systems/weapons/GrenadeEffects.ts` and
  `scripts/perf-grenade-spike.ts`, exposed through
  `npm run perf:grenade-spike`.
- Pixel Forge imposter optics audit in
  `scripts/pixel-forge-imposter-optics-audit.ts`, exposed through
  `npm run check:pixel-forge-optics`.
- Vegetation horizon audit in `scripts/vegetation-horizon-audit.ts`, exposed
  through `npm run check:vegetation-horizon`.
- WebGL/WebGPU strategy audit in `scripts/webgpu-strategy-audit.ts`, exposed
  through `npm run check:webgpu-strategy`.
- Cycle 0 static evidence suite in `scripts/projekt-143-evidence-suite.ts`,
  exposed through `npm run check:projekt-143`.
- Recovery ledger and current-state documentation updates.

Explicitly not ready to ship as a fix:

- Any downscale/regeneration of Pixel Forge textures.
- Any removal of vegetation normal maps.
- Any grenade-spike remediation claim.
- Any imposter brightness, size, or atlas-regeneration remediation claim.
- Any distant-canopy or barren-horizon remediation claim.
- Any Open Frontier startup performance claim.
- Any WebGPU migration implementation.
- Any Phase 3 remediation execution.

## Phase 1 State Of The Project

### Source And Deployment Truth

- Current source truth at Phase 1 sign-off: `master` and `origin/master` at
  `5fd4ba34e28c4840b0f72e1a0475881d050122a1`.
- Latest live Pages manifest checked on 2026-05-02 reported the same SHA:
  `https://terror-in-the-jungle.pages.dev/asset-manifest.json`.
- Latest manual Deploy workflow checked on 2026-05-02: run `25247508549`,
  successful for `5fd4ba34e28c4840b0f72e1a0475881d050122a1`.
- Local `dist/` and `dist-perf/` were stale during the Phase 1 audit and
  pointed at `f99181a0bf8a6b2a8684fc1ae3796022c16aad22`. They were refreshed
  during the 2026-05-02 KB-METRIK/KB-LOAD continuation and now write manifests
  for `5fd4ba34e28c4840b0f72e1a0475881d050122a1`. They remain local evidence,
  not production truth.

### Runtime Architecture As Found

- Renderer: WebGL-only runtime through `THREE.WebGLRenderer` in
  `src/core/GameRenderer.ts`; ACES tone mapping and sRGB output are active.
  No deployable WebGPU renderer path was found.
- Render loop: `src/core/GameEngineLoop.ts` updates systems, renders the main
  scene, then renders weapon and grenade overlays. There is no centralized
  render graph or scene-owner inventory.
- Terrain: CDLOD instanced terrain with CPU quadtree selection and shader
  displacement. This path has real tile culling, but `CDLODQuadtree.selectTiles`
  still returns a copied array in the hot path.
- Vegetation: Pixel Forge vegetation is imposter-only. Runtime culling is
  terrain-cell residency plus shader distance fade, not Three object frustum
  culling. There is no outer canopy layer for elevated cameras.
- NPC rendering: close Pixel Forge GLBs inside 64m with a global 128 close
  cap; mid/far animated imposters out to a hard 400m render cutoff. Close GLB
  meshes and imposter buckets disable Three object frustum culling.
- Static world features: buildings and structures load through
  `WorldFeatureSystem`, are optimized per placement, snapped to terrain, and
  stay resident for the mode. No explicit distance, sector, or HLOD culling was
  found for static feature objects.
- Effects: combat effects are mostly pooled. Fresh KB-EFFECTS instrumentation
  reproduces a first-use grenade detonation stall, but attributes the
  measured grenade JS work to about 1ms rather than particle, damage, audio, or
  scene-add/remove cost.

### Tooling Trust Assessment

- Existing tools include `perf-capture.ts`, `perf-compare.ts`,
  `perf-startup-ui.ts`, `mode-load-profiler.ts`, `asset-load-analyzer.ts`,
  `memory-growth-tracker.ts`, browser long-task observers, renderer stats,
  frame/system timing telemetry, and opt-in GPU timer queries.
- The latest local `combat120` artifact,
  `artifacts/perf/2026-05-02T07-29-13-476Z`, failed hard with avg/p99 frame
  time at 100ms and Combat over budget in every sample.
- That same artifact reported harness probe round-trip average `123.96ms`,
  making the measurement path itself suspect. Until KB-METRIK certifies
  measurement trust, perf numbers from this artifact carry an asterisk.
- GitHub Actions perf remains advisory because the perf capture and compare
  steps continue on error under Xvfb.

### Suspect Asset Inventory

Static GLB/PNG parse only; no per-class runtime draw-call attribution exists
yet.

| Asset Class | Count | Static Size | Static Cost | Culling Status |
| --- | ---: | ---: | ---: | --- |
| Helicopters | 3 GLBs | 440 KB | 224 primitives / 3,384 tris | Distance/fog render visibility; no per-part LOD beyond batching/static optimization. |
| Buildings | 12 GLBs | 721 KB | 400 primitives / 5,704 tris | No explicit distance/HLOD culling found. |
| Structures | 34 GLBs | 1.59 MB | 824 primitives / 14,620 tris | Same static feature path as buildings. |
| Close NPC GLBs | 4 GLBs | 2.98 MB | 27 primitives / 2,662 tris / 8 animations each | Close pool inside 64m, global cap 128. |
| NPC imposters | 32 PNG atlases + 32 JSON | 19.6 MB PNG | all atlases `2688x1344` | Instanced buckets, `frustumCulled=false`, 400m render cutoff. |
| Vegetation imposters | 7 species, 14 PNGs + 7 JSON | 6.96 MB PNG | up to `4096x2048` | Cell residency plus shader fade; no distant canopy replacement. |

### Phase 1 Signed Finding

The project is not beyond recovery, but it has crossed into a state where
optimization without attribution would be self-deception. The immediate blocker
is measurement credibility. The current artifacts can show that a frame is bad;
they cannot reliably assign cost to helicopters, buildings, vegetation
imposters, NPC imposters, combat effects, startup work, shader compilation, or
harness overhead.

## Phase 2 / Cycle 1 Baseline Certification

Cycle 1 local source and build truth:

- Source HEAD: `cef45fcc906ebe4357009109e2186c83c2a38426`.
- Local `dist/asset-manifest.json` and `dist-perf/asset-manifest.json` both
  report `cef45fcc906ebe4357009109e2186c83c2a38426`.
- `npm run doctor` passed on Node `24.14.1`, Playwright `1.59.1`.
- `npm run check:projekt-143` passed and wrote
  `artifacts/perf/2026-05-02T22-05-00-955Z/projekt-143-evidence-suite/suite-summary.json`.
- Cycle 1 bundle certification wrote
  `artifacts/perf/2026-05-02T22-24-03-223Z/projekt-143-cycle1-benchmark-bundle/bundle-summary.json`
  plus `projekt-143-cycle1-metadata.json` sidecars into each source artifact.

Baseline bundle status: WARN. The Cycle 1 docs/tooling release was initially deployed at
`806d5fa43d63854dd80496a67e8aaef4a741c627` after CI run `25263686228` and
manual Deploy workflow run `25264091996` passed. At that release, live Pages
`/asset-manifest.json` reported that SHA; Pages shell, service worker, manifest,
representative public assets, Open Frontier navmesh/heightmap assets, the A Shau
R2 DEM URL, and Recast WASM/build assets returned `200` with the expected
cache/content headers; a live Zone Control smoke reached the deploy UI without
console, page, request, or retry failures. This verifies the docs/tooling
release only; it is not a remediation or optimization claim. Later doc-only
release-state commits may advance `master`; live `/asset-manifest.json` remains
the exact current deployed SHA source of truth.

Agent-DX follow-up: `f68f09afdd537d4cbe3db3ab5f10d90a13944e6e` added
repo-native workflow dispatch wrappers plus stable mobile UI gate state hooks.
Manual CI run `25265347136` passed lint, build, test, perf, smoke, and mobile UI;
manual Deploy workflow run `25265623981` passed; live `/asset-manifest.json`
reported `f68f09afdd537d4cbe3db3ab5f10d90a13944e6e`; live header checks and a
Zone Control browser smoke passed. This is release workflow and mobile gate
hardening only, not a rendering, asset, grenade, culling, or WebGPU remediation.
Release-DX hardening `5f46713d101f6fea974da6d77f303c95df58000c` opted the
deploy workflow's JavaScript actions into Node 24 and aligned the docs after
manual CI run `25265757159`, Deploy run `25266081872`, live manifest/header
checks, and a Zone Control browser smoke passed.

| Probe | Artifact | Trust | Result |
| --- | --- | --- | --- |
| Open Frontier startup | `artifacts/perf/2026-05-02T22-07-48-283Z/startup-ui-open-frontier` | Diagnostic startup evidence, not perf-capture trust | Three headed retail runs averaged `6180.7ms` mode-click-to-playable and `5165.0ms` deploy-click-to-playable. WebGL upload attribution and three CPU profiles are present. Largest uploads again include Pixel Forge vegetation/NPC atlases; max upload was `2780.5ms`. |
| Zone Control startup | `artifacts/perf/2026-05-02T22-08-46-576Z/startup-ui-zone-control` | Diagnostic startup evidence, not perf-capture trust | Three headed retail runs averaged `6467.7ms` mode-click-to-playable and `5312.7ms` deploy-click-to-playable. WebGL upload attribution and three CPU profiles are present. The largest upload was giantPalm albedo at `2608.2ms`. |
| combat120 | `artifacts/perf/2026-05-02T22-09-13-541Z` | FAIL (`probeAvg=149.14ms`, `probeP95=258ms`) | Frame numbers are not trusted for regression decisions. The artifact still records renderer stats, browser long tasks/LoAF entries, and scene attribution; validation failed with avg/p95/p99/max frame all clamped at `100ms`. |
| Open Frontier short | `artifacts/perf/2026-05-02T22-11-29-560Z` | PASS (`probeAvg=15.72ms`, `probeP95=26ms`, missed `0%`) | Trusted as a WARN capture: avg `23.70ms`, p95 `29.20ms`, p99 `32.70ms`, max `100ms`, 4 hitches above `50ms`, renderer stats and scene attribution present with visible-unattributed triangles at `0%`. |
| A Shau short | `artifacts/perf/2026-05-02T22-15-19-678Z` | PASS (`probeAvg=10.52ms`, `probeP95=18ms`, missed `0%`) | Trusted as a WARN capture: avg `12.04ms`, p95 `18.30ms`, p99 `31.50ms`, max `48.50ms`, no `>50ms` hitches, renderer stats and scene attribution present with visible-unattributed triangles at `0%`. |
| Low-load grenade spike | `artifacts/perf/2026-05-02T22-19-40-381Z/grenade-spike-ai-sandbox` | Diagnostic effect-attribution evidence | Two-grenade probe with `npcs=2` reproduced the first-use stall: baseline p95/p99/max `21.8/22.6/23.2ms`, detonation p95/p99/max `23.7/32.5/100ms`, one `387ms` long task and two LoAF entries. Grenade JS timing stayed small (`kb-effects.grenade.frag.total=2.5ms` total); CPU profile is present. |

Measurement-trust assessment:

- Harness overhead is acceptable for Open Frontier short and A Shau short only.
- Browser long-task and long-animation-frame observers are present in all
  browser artifacts.
- CPU profiles are present for startup UI and grenade-spike artifacts, but not
  for the steady-state perf captures because those were not run with deep CDP.
- WebGL upload attribution is present only for startup UI artifacts; it is
  intentionally disabled for steady-state and grenade runtime probes.
- Renderer stats and scene attribution are present for steady-state perf
  captures. KB-CULL can use Open Frontier and A Shau scene attribution, but not
  combat120, because combat120 measurement trust failed.

The Asset Acceptance Standard is now documented in
[ASSET_ACCEPTANCE_STANDARD.md](ASSET_ACCEPTANCE_STANDARD.md). It formalizes the
texture, mipmapped-memory, atlas-density, normal-map, triangle/draw-call,
LOD/culling, screenshot, and perf-evidence gates for Pixel Forge and other
runtime assets.

## Phase 2 Bureau Tracker

### KB-METRIK - Telemetry And Instrumentation

Status: ACTIVE.

Progress:

- 2026-05-02: `scripts/perf-capture.ts` now computes a measurement-trust
  report from harness probe round-trip time, missed runtime samples, and sample
  presence. Each capture writes `measurement-trust.json`, embeds the same report
  in `summary.json`, and adds a `measurement_trust` check to `validation.json`.
  This makes an untrusted capture visibly untrusted before its frame-time
  numbers are used for regression decisions.
- 2026-05-02: Perf capture now uses the same loopback address for server bind
  and browser navigation (`127.0.0.1`). This removes Windows `localhost`/IPv6
  ambiguity from startup evidence.
- 2026-05-02: Scene attribution is now captured as a separate
  `scene-attribution.json` artifact after the runtime sample window. It is
  intentionally outside the sample loop so asset census work cannot pollute
  frame timing or harness probe measurements. The artifact includes per-bucket
  examples and treats zero-live-instance instanced meshes as zero live
  triangles.
- 2026-05-02 evidence split:
  `artifacts/perf/2026-05-02T16-16-25-740Z` showed headless Chromium was not a
  trusted measurement environment in this session: engine frames advanced
  slowly and measurement trust failed. `artifacts/perf/2026-05-02T16-37-21-875Z`
  was a headed perf-build control with measurement trust PASS
  (`probeAvg=14.00ms`, `probeP95=17.00ms`, missed samples `0%`), avg frame
  `14.23ms`, no browser errors, heap recovery PASS, and validation WARN only
  for peak p99 `31.70ms`.
- 2026-05-02 attribution finding:
  `artifacts/perf/2026-05-02T16-37-21-875Z/scene-attribution.json` now
  classifies terrain, water, atmosphere, vegetation imposters, NPC imposters,
  close NPC GLBs, weapons, world static features, debug overlays, and remaining
  unattributed objects using actual runtime model-path prefixes and effective
  parent visibility. Visible unattributed triangles are now 244, below 1% of
  the main-scene visible triangle census in this control capture.
- 2026-05-02: Startup system-init marks now use stable `SystemRegistry` keys
  instead of constructor names. Retail minification had reduced system labels
  to names such as `Qp` and `Zh`, which made production-shaped startup
  evidence hard to interpret. The first validation capture after the patch is
  `artifacts/perf/2026-05-02T18-35-49-488Z/startup-ui-open-frontier`.
- 2026-05-02 initialization-risk finding:
  the same scene census shows that `npcs=0` still builds resident but hidden
  close-NPC pools: `npc_close_glb` has 1,360 meshes / 132,840 resident triangles
  and `weapons` has 8,480 meshes / 133,440 resident triangles, both with
  `visibleTriangles=0`. This is not a steady-state render cost in the control
  scene, but it is credible startup, memory, shader/material, and first-use
  work for KB-LOAD and KB-CULL to investigate.

Deliverables:

- Measurement-trust certification in perf artifacts.
- Reproducible benchmark scenes for `ai_sandbox`/`combat120`,
  `open_frontier`, `team_deathmatch`, `zone_control`, and `a_shau_valley`.
- CPU frame timing, system timing, browser stall, renderer stats, GPU timing,
  load-stage timing, and asset-class attribution captured in the same artifact
  family.
- Clear pass/warn/fail criteria for whether a capture is usable as evidence.

Acceptance:

- Every perf capture writes a measurement-trust artifact.
- A capture with high harness probe overhead or missed samples is marked
  untrusted before its frame-time numbers are used for regression decisions.
- At least one short non-combat control capture and one combat capture can be
  compared without relying on stale `dist` or a failed newest artifact.
- Scene attribution identifies the remaining unattributed draw/triangle cost to
  below 10% of visible scene triangles before KB-CULL uses it as certification
  evidence.

### KB-LOAD - Initialization And Cold Start

Status: FIRST SCOPED TEXTURE-UPLOAD WARMUP LANDED LOCALLY; CLOSEOUT BLOCKED ON FOLLOW-UP UPLOAD AND RESIDENCY EVIDENCE.

Progress:

- 2026-05-02: A fresh retail build passed before startup measurement. The
  generated `dist/asset-manifest.json` reports
  `5fd4ba34e28c4840b0f72e1a0475881d050122a1`.
- 2026-05-02: Retail headed startup benchmark, three runs each:
  `artifacts/perf/2026-05-02T18-30-01-826Z/startup-ui-open-frontier` and
  `artifacts/perf/2026-05-02T18-30-45-200Z/startup-ui-zone-control`.
  Open Frontier averaged `5457.3ms` from mode click to playable; Zone Control
  averaged `5288.3ms`. This supports a real post-selection delay, but the
  Open Frontier delta over Zone Control was only `169.0ms` in this sample and
  is not yet enough to certify it as the uniquely worst mode.
- 2026-05-02: The startup split points to live-entry work after deploy click,
  not only pre-deploy mode preparation. Open Frontier averaged `1156.6ms` in
  `engine-init.start-game.*` marks and `3893.2ms` from
  `engine-init.startup-flow.begin` to `interactive-ready`; Zone Control
  averaged `1177.1ms` and `3633.5ms` respectively.
- 2026-05-02: In the measured Open Frontier startup marks, the largest named
  pre-deploy stage was deploy-select setup at `453.8ms` average. Height-source,
  terrain-feature compilation, terrain config, navmesh, feature application,
  and `setGameMode` were all individually below `100ms` average. This narrows
  KB-LOAD's first investigation to live-entry spawn warming, hidden pool
  construction, shader/material first-use, and deploy selection work.
- 2026-05-02: After stable startup labels landed, a one-run Open Frontier
  retail validation at
  `artifacts/perf/2026-05-02T18-35-49-488Z/startup-ui-open-frontier` showed
  `systems.init.combatantSystem` consumed `576.9ms` during initial engine boot,
  while `systems.init.firstPersonWeapon` consumed `62.0ms` and
  `systems.init.terrainSystem` consumed `49.0ms`. This ties the hidden
  close-NPC/weapon pool evidence to the combat renderer initialization path,
  but it explains initial boot cost more directly than the post-deploy
  live-entry stall.
- 2026-05-02: Live-entry startup marks were added around hide-loading,
  player positioning, terrain chunk flush, renderer reveal, player/HUD enable,
  audio start, combat enable, background task scheduling, and `enterLive()`.
  A three-run Open Frontier startup validation at
  `artifacts/perf/2026-05-02T19-01-27-585Z/startup-ui-open-frontier` still
  averaged `5298.0ms` from mode click to playable. The live-entry span averaged
  about `3757ms`, and essentially all of it was inside
  `flush-chunk-update` after the synchronous terrain update had finished.
- 2026-05-02: The bounded frame-yield guard did not reduce the local stall.
  In the same validation, the yield still resolved through `requestAnimationFrame`
  rather than the `100ms` timeout. A follow-up one-run startup artifact with
  browser-stall capture,
  `artifacts/perf/2026-05-02T19-03-09-195Z/startup-ui-open-frontier`, recorded
  `startup-flow-total=3804.3ms`, `frame-yield-wait=3802.1ms`, and a single
  `3813ms` long task starting at `4571.2ms`. Startup marks put
  `engine-init.startup-flow.flush-chunk-update.terrain-update-end` at
  `4513.4ms` and the yield return at `8315.5ms`, so the current lead is a
  main-thread long task/page-task starvation during the yield window, not the
  terrain update call itself.
- 2026-05-02: Long-task attribution was extended with browser attribution
  arrays and per-iteration Chrome CPU profiles. The follow-up artifact
  `artifacts/perf/2026-05-02T19-11-07-930Z/startup-ui-open-frontier` measured
  `modeClickToPlayable=5535ms`, `deployClickToPlayable=4688ms`,
  `startup-flow-total=3841.7ms`, `frame-yield-wait=3838.6ms`, and a `3850ms`
  long task after terrain update. Browser long-task attribution still reported
  `unknown/window`, but the CPU profile's dominant self-time was
  `je` in `build-assets/three-DgNwuF1l.js` at `3233.9ms`. Inspecting the
  generated bundle maps that function to Three's WebGLState wrapper around
  `texSubImage2D`. Current KB-LOAD lead: live-entry is blocked by first-present
  WebGL texture upload/update work, not by synchronous terrain chunk update.
- 2026-05-02: A diagnostic WebGL texture-upload observer now wraps texture
  upload calls during startup UI captures. This is intentionally intrusive and
  must be treated as attribution evidence, not as a clean frame-time baseline.
  The first asset-named artifact,
  `artifacts/perf/2026-05-02T19-19-47-099Z/startup-ui-open-frontier`, recorded
  `webglTextureUploadCount=324`, `webglTextureUploadTotalDurationMs=3157.8ms`,
  and `webglTextureUploadMaxDurationMs=2342.3ms`. All material upload time was
  in `texSubImage2D`. The largest single upload was
  `assets/pixel-forge/vegetation/giantPalm/palm-quaternius-2/imposter.png`
  (`4096x2048`, `2342.3ms`), followed by its normal map (`48.8ms`), Pixel Forge
  vegetation imposter maps at `2048x2048`, and Pixel Forge NPC animated albedo
  atlases at `2688x1344`.
- 2026-05-02: The startup summary path now surfaces WebGL upload counts and
  durations directly in `summary.json`. Validation artifact
  `artifacts/perf/2026-05-02T19-21-53-436Z/startup-ui-open-frontier` recorded
  `webglTextureUploadCount=345`, `webglTextureUploadTotalDurationMs=2757.2ms`,
  and `webglTextureUploadMaxDurationMs=1958.0ms`; the largest upload was again
  the giantPalm imposter albedo texture.
- 2026-05-02: Static texture acceptance measurement started with
  `npm run check:pixel-forge-textures`. Artifact
  `artifacts/perf/2026-05-02T19-33-14-632Z/pixel-forge-texture-audit/texture-audit.json`
  inventories all `42` registered Pixel Forge textures from
  `src/config/pixelForgeAssets.ts`: no missing files, `38` flagged textures,
  `26,180,240` source bytes, and an estimated `781.17MiB` of uncompressed RGBA
  plus full mip chains if all registered atlases are resident. Vegetation color
  and normal atlases each account for `133.33MiB`; NPC albedo atlases account
  for `514.5MiB`. The two hard failures are giantPalm color and normal
  (`4096x2048`, `42.67MiB` each). All `28` NPC albedo atlases warn at
  `18.38MiB` each and carry non-power-of-two dimensions (`2688x1344`).
  The extended audit also records vegetation pixels per runtime meter:
  giantPalm is `81.5px/m` and bananaPlant is `108.02px/m`, while fern and
  elephantEar are compact at `2.67MiB` per atlas.
- 2026-05-02: The texture audit now emits remediation candidates, still as
  planning evidence rather than approved art changes. Applying the candidate
  targets to every flagged texture would reduce estimated mipmapped RGBA
  residency from `781.17MiB` to `373.42MiB`, a projected `407.75MiB` reduction.
  Candidate vegetation regeneration lowers `4096x2048` giantPalm atlases to
  `2048x1024` (`10.67MiB` each) and `2048x2048` mid-level atlases to
  `1024x1024` (`5.33MiB` each). Candidate NPC regeneration lowers each
  `2688x1344` animated albedo atlas to a padded `2048x1024` target
  (`10.67MiB` each) using `64px` frames.
- 2026-05-02: Scenario estimates landed in
  `artifacts/perf/2026-05-02T19-34-49-412Z/pixel-forge-texture-audit/texture-audit.json`.
  Dropping vegetation normal atlases alone estimates `647.97MiB`; regenerating
  vegetation only estimates `589.3MiB`; regenerating vegetation and dropping
  vegetation normals estimates `551.97MiB`; regenerating NPC atlases only
  estimates `565.42MiB`; applying all candidates estimates `373.42MiB`.
  These are package-level planning estimates for KB-CULL/KB-OPTIK, not a
  replacement for visual QA.
- 2026-05-03 first KB-LOAD remediation: `src/systems/assets/AssetLoader.ts`
  now exposes `warmGpuTextures()`, and `src/core/LiveEntryActivator.ts`
  uploads the current hard-fail giantPalm color/normal atlas pair behind the
  spawn loading overlay before renderer reveal. Startup telemetry now records
  `engine-init.startup-flow.texture-upload-warmup.*` marks and browser user
  timings named `kb-load.texture-upload-warmup.*`.
- 2026-05-03 paired giantPalm warmup evidence: Open Frontier before
  `artifacts/perf/2026-05-03T21-45-13-207Z/startup-ui-open-frontier` averaged
  `4685.7ms` deploy-click-to-playable and `5340.7ms` mode-click-to-playable;
  after
  `artifacts/perf/2026-05-03T22-01-10-796Z/startup-ui-open-frontier` averaged
  `4749.0ms` and `5443.3ms`. Its average WebGL upload total moved from
  `3341.0ms` to `1157.2ms`, and average max upload moved from `2390.5ms` to
  `275.4ms`. Zone Control before
  `artifacts/perf/2026-05-03T21-46-34-676Z/startup-ui-zone-control` averaged
  `4909.0ms` / `5491.0ms`; after
  `artifacts/perf/2026-05-03T22-02-28-966Z/startup-ui-zone-control` averaged
  `4939.0ms` / `5469.0ms`; average WebGL upload total moved from `3340.6ms`
  to `1229.6ms`, and average max upload moved from `2379.4ms` to `360.1ms`.
  Trust flags are present in all four artifacts: long tasks, LoAF entries,
  WebGL upload attribution, user timings, and three Chrome CPU profiles per
  artifact. This is a narrow upload-stall mitigation and attribution
  improvement, not a certified startup-latency closeout.
- 2026-05-03 negative evidence: expanding the same warmup to fanPalm was tested
  and rejected. Open Frontier
  `artifacts/perf/2026-05-03T21-54-02-583Z/startup-ui-open-frontier` regressed
  to `4904.3ms` deploy-click-to-playable, and Zone Control
  `artifacts/perf/2026-05-03T21-55-18-768Z/startup-ui-zone-control` regressed
  to `5100.7ms`. Do not broaden startup texture warmup by asset name without a
  paired before/after artifact.

Open questions:

- Which Open Frontier startup stage dominates mode-entry latency?
- How much work happens after visual readiness during the first 5-10 seconds?
- Which shaders, GLBs, terrain assets, or scene-assembly tasks should move
  behind progressive readiness?
- What is the texture policy for Pixel Forge imposter and NPC atlases: max
  dimensions, compression format, mip policy, normal-map need, and preload vs.
  deferred upload?
- Which uploads are required before truthful gameplay readiness, and which can
  move behind progressive readiness without visual popping or combat unfairness?

### KB-OPTIK - Rendering And Optics

Status: EXPANDED LUMA REMEDIATION LANDED LOCALLY; GAMEPLAY-CAMERA SILHOUETTE AND PERF IMPACT REMAIN OPEN.

Progress:

- 2026-05-02: `scripts/pixel-forge-imposter-optics-audit.ts` now audits the
  registered Pixel Forge vegetation and NPC imposter atlases against runtime
  scale contracts, metadata JSON, alpha occupancy, luma/chroma statistics, and
  shader-path notes. It writes
  `artifacts/perf/<timestamp>/pixel-forge-imposter-optics-audit/optics-audit.json`
  and is exposed as `npm run check:pixel-forge-optics`.
- 2026-05-02 evidence:
  `artifacts/perf/2026-05-02T20-54-56-960Z/pixel-forge-imposter-optics-audit/optics-audit.json`
  flagged all `28/28` runtime NPC clip atlases and `2/7` vegetation atlases.
  NPC median visible tile height is `65px` inside a `96px` tile; across clips
  it ranges `55px` to `72px`. At that point runtime impostor height was
  `4.425m`, while source metadata bbox heights produced a median
  runtime/source height ratio of `2.63x` (`2.23x` min, `2.98x` max). Runtime
  NPC impostor resolution was therefore only `21.69px/m` before the first
  target/crop remediation.
- 2026-05-02 NPC scale/resolution finding: the field report that NPC
  imposters look wrong is supported, but the first static evidence does not
  prove the runtime plane is half-sized. Instead, the runtime plane stretches
  relatively small 96px bakes more than `2x` against source bbox height, while
  the visible silhouette usually occupies less than `80%` of the tile. The
  credible failure is a bake/runtime scale contract mismatch plus low effective
  pixels per meter.
- 2026-05-02 shader-contract finding: NPC imposters, vegetation imposters, and
  close GLBs do not share one material pipeline. NPC imposters render through a
  `CombatantMeshFactory` `ShaderMaterial`, use straight alpha, apply independent
  readability/exposure/min-light constants, and do not consume the atmosphere
  lighting snapshot. Vegetation imposters render through
  `GPUBillboardVegetation` `RawShaderMaterial`, use atmosphere lighting
  uniforms, sample normal atlases for `normal-lit` profiles, and output
  premultiplied alpha through custom blending. Close GLBs use the normal Three
  material path. This is a credible explanation for brightness parity drift
  across LOD tiers even before screenshot comparison.
- 2026-05-02 vegetation optics finding: the optics audit repeats the texture
  audit's scale concern for vegetation: `bananaPlant` is oversampled at
  `108.02px/m`, and `giantPalm` is both runtime-scaled `1.75x` over declared
  source size and oversampled at `81.5px/m`. Other vegetation runtime
  pixels-per-meter values range from `18.91` to `68.45`.
- 2026-05-03 matched scale proof: `npm run
  check:projekt-143-optics-scale-proof -- --port=0` passed at
  `artifacts/perf/2026-05-03T10-39-21-420Z/projekt-143-optics-scale-proof/summary.json`.
  The proof renders the close Pixel Forge GLB and the matching NPC imposter
  shader crop in the same orthographic camera/light setup, then records visible
  silhouette height and luma/chroma deltas. In this before artifact all four
  factions shared the same `4.425m` geometry target, but the imposter visible
  silhouette was only
  `0.52-0.54x` the close-GLB visible height. The imposter crop is also darker
  by `26.59-59.06` luma. The six aircraft GLBs load at imported native scale;
  their longest-axis/current-NPC-height ratios are `2.07x-5.52x`. This proves
  the user's scale concern is real enough to route into remediation planning,
  but it does not accept any NPC, imposter, shader, atlas, or aircraft-scale
  change.
- 2026-05-03 first KB-OPTIK remediation: commit
  `b7bcd0e25b09f89c8f2416d8ec1b3c7a7cd4abc9` drops the shared Pixel Forge NPC
  runtime target from `4.425m` to the approved `2.95m` base target, derives the
  billboard grounding offset from `NPC_Y_OFFSET`, and adds generated per-tile
  crop maps for upright NPC imposter atlases. The crop maps are regenerated by
  `npm run assets:generate-npc-crops` and verified by
  `npm run check:pixel-forge-npc-crops`, now part of `validate:fast`.
- 2026-05-03 post-remediation proof: `npm run
  check:projekt-143-optics-scale-proof -- --port=0` passed at
  `artifacts/perf/2026-05-03T16-13-34-596Z/projekt-143-optics-scale-proof/summary.json`
  with `sourceGitSha`
  `b7bcd0e25b09f89c8f2416d8ec1b3c7a7cd4abc9`. Matched visible-height ratios
  are now `0.895` (US), `0.895` (ARVN), `0.863` (NVA), and `0.861` (VC),
  inside the first-remediation `+/-15%` proof band. The same proof keeps luma
  flags open: imposter crops remain `-26.94` to `-59.29` darker than close GLB
  crops. This is scale/crop remediation evidence only; it is not shader/luma,
  performance, aircraft-scale, human-scale, or production parity acceptance.
- 2026-05-03 selected-lighting luma slice: commit
  `1395198da4db95611457ecde769b611e3d36354e` adds per-faction imposter
  material tuning and updates the matched proof/decision tools to record luma
  deltas as a percentage of the matched close-GLB crop. The committed proof at
  `artifacts/perf/2026-05-03T16-48-28-452Z/projekt-143-optics-scale-proof/summary.json`
  has `sourceGitSha` `1395198da4db95611457ecde769b611e3d36354e`, visible-height
  ratios `0.895` (US), `0.895` (ARVN), `0.863` (NVA), and `0.861` (VC), and
  selected-lighting luma deltas `-0.13%` (US), `-0.44%` (ARVN), `0.36%`
  (NVA), and `-0.08%` (VC). This closes the single-lighting luma branch only;
  it is not final NPC visual parity, gameplay-camera acceptance, performance
  acceptance, aircraft-scale acceptance, human playtest signoff, or production
  parity.
- 2026-05-03 expanded KB-OPTIK proof: commit
  `57d873e7f305fb528e7570232a291950e89c6ade` adds
  `npm run check:projekt-143-optik-expanded`, which captures matched close-GLB
  and imposter crops across five lighting profiles (`midday-selected`,
  `dawn-warm-low`, `dusk-cool-low`, `haze-overcast`, `storm-low-contrast`) and
  two camera profiles (`matched-orthographic`, `gameplay-front-perspective`).
  The trusted artifact at
  `artifacts/perf/2026-05-03T17-26-45-106Z/projekt-143-optik-expanded-proof/summary.json`
  has measurement-trust PASS with `0` browser, page, request, and load errors.
  It captures `40` samples and returns WARN: visible-height ratio range is
  `0.844-0.895`, luma delta range is `-53.57%` to `104.58%`, and `34/40`
  samples are flagged. The selected midday orthographic profile remains clean,
  so this does not invalidate the selected-lighting remediation; it proves the
  remaining problem is the lighting/material contract outside that profile.
- 2026-05-03 expanded-luma remediation: commit
  `5792bafb7abd51c12dcf715a395a9c1d8c91c8ad` forwards the scene lighting/fog
  snapshot into NPC imposter shader uniforms and updates the expanded proof to
  exercise that runtime contract. The committed-sha artifact at
  `artifacts/perf/2026-05-03T18-46-14-291Z/projekt-143-optik-expanded-proof/summary.json`
  has measurement-trust PASS with `0` browser, page, request, and load errors.
  It captures `40` samples and returns WARN: expanded luma delta now ranges
  `-11.31%` to `9.03%`, inside the `+/-12%` band, but `10/40` samples still
  flag because gameplay-perspective visible-height ratios remain below the
  `0.85` floor for NVA/VC and for some perspective framings. This is luma
  remediation evidence only; it is not final gameplay-camera visual parity,
  performance improvement, human-playtest signoff, or production parity.
- 2026-05-03 runtime LOD-edge proof routing: commit
  `5b053711cece65b5915ea786acc56e4a8ea22736` adds a
  `--camera-profile-set=runtime-lod-edge` option to the expanded proof and
  updates the KB-OPTIK decision/kickoff scripts so the newest LOD-edge artifact
  cannot hide the earlier near-stress WARN. The committed-sha artifact at
  `artifacts/perf/2026-05-03T19-02-38-432Z/projekt-143-optik-expanded-proof/summary.json`
  has measurement-trust PASS and status PASS: `40` samples, `0` flags,
  visible-height ratio `0.855-0.895`, and luma delta `-6.94%` to `9.77%`.
  This proves the current runtime LOD-edge camera set is inside mechanical
  bands; it does not close human visual review or the 8.5m near-stress
  exception.

Root-cause hypotheses:

1. The before state stretched `96px` NPC imposter tiles to a `4.425m` runtime
   plane while the alpha silhouette often occupied only `55-72px`. The first
   remediation now uses the `2.95m` target plus per-tile upright crop maps.
   Source atlases are still `96px`; selected and expanded luma are aligned
   after the imposter atmosphere pass. Runtime LOD-edge perspective now passes,
   so the remaining KB-OPTIK decision is whether to document the 8.5m
   near-stress silhouette exception, run human visual review, or explicitly
   request another crop/geometry pass despite LOD-edge evidence.
2. NPC brightness parity could not be fixed by one exposure number; the first
   luma remediation now forwards atmosphere lighting/fog into the NPC imposter
   shader. Remaining KB-OPTIK work is the gameplay-perspective silhouette
   mismatch, not expanded lighting luma.
3. Vegetation brightness parity is entangled with normal-lit versus hemisphere
   profiles, premultiplied-alpha output, and current runtime scale exceptions.

Ranked remediations:

1. Define a unified imposter material contract before tuning constants:
   explicit color space, tone mapping/output transform expectation, alpha mode,
   atmosphere inputs, minimum light floor, exposure, and normal-map semantics.
2. Treat the generated per-tile crop map as the first runtime fix. If a later
   branch regenerates NPC imposters, preserve at least `80px` visible actor
   height per tile after crop and record effective pixels-per-meter.
3. Use and extend the runtime visual comparison harness that places close GLB
   and imposter versions of the same faction/clip/pose under the same camera
   and light setup, then measures projected bounds and sampled luma deltas.
4. Treat vegetation normal-map removal/downscale as blocked until KB-OPTIK
   screenshot evidence proves hemisphere-only or lower-resolution atlases meet
   brightness and silhouette acceptance.

Acceptance:

- First scale/crop/luma remediation status: matched visible-height ratios now
  land within the `+/-15%` first-remediation proof band, but not all factions
  are within a stricter `+/-10%` final-polish band. Selected-lighting and
  expanded lighting luma are inside the `+/-12%` proof band after commit
  `5792bafb7abd51c12dcf715a395a9c1d8c91c8ad`. Runtime LOD-edge expanded
  proof is inside both visible-height and luma bands after commit
  `5b053711cece65b5915ea786acc56e4a8ea22736`; the 8.5m near-stress WARN is a
  visual-decision/human-review item, not a measured LOD-edge failure.
- NPC close GLB versus imposter screenshot rig reports projected actor-height
  delta within `+/-15%` for the first remediation, and within `+/-10%` before
  final visual sign-off unless a documented visual exception exists.
- Mean opaque luma delta between matched close GLB and imposter crops stays
  within `+/-12%` under midday, dawn/dusk, haze, and storm snapshots.
- Runtime NPC imposter package reaches at least `32px/m` effective visible
  resolution or documents a visual exception accepted by human review.
- Vegetation candidate atlases retain silhouette readability and brightness
  parity in elevated and ground cameras before KB-CULL accepts lower texture
  budgets as ship-ready.

### KB-TERRAIN - Distant Terrain And Vegetation

Status: MATERIAL/VEGETATION PASS STARTED; FAR-HORIZON AND A SHAU PERF REMAIN BLOCKED.

Progress:

- 2026-05-02: `scripts/vegetation-horizon-audit.ts` now compares actual mode
  camera far planes, terrain visual extents, CDLOD range inputs, vegetation
  cell residency, registered vegetation shader fade/max distances, and per-mode
  biome palettes. It writes
  `artifacts/perf/<timestamp>/vegetation-horizon-audit/horizon-audit.json` and
  is exposed as `npm run check:vegetation-horizon`.
- 2026-05-02 evidence:
  `artifacts/perf/2026-05-02T21-29-15-593Z/vegetation-horizon-audit/horizon-audit.json`
  reports a global vegetation registry max draw distance of `600m` and max
  fade start of `500m`. The vegetation scatterer residency square reaches
  `832m` on-axis and `1176.63m` to the corner, so large-mode horizon loss is
  currently shader-distance limited before it is cell-residency limited.
- 2026-05-02 mode findings: Open Frontier has an estimated exposed terrain
  band of `396.79m` beyond visible vegetation under the audit samples; A Shau
  Valley has an estimated `3399.2m` band because its camera far plane is
  `4000m` while vegetation still disappears at `600m`. Zone Control's visual
  extent can exceed vegetation by `160m`; AI Sandbox and TDM are terrain-extent
  limited and do not expose a large in-map barren band in this static model.
- 2026-05-04 owner visual target: the terrain and vegetation remediation goal
  now explicitly includes ground material balance and close vegetation scale,
  not only far-horizon canopy. Most traversable ground should read as jungle
  green rather than gravel; if green appears mainly on hill or mountain sides,
  inspect terrain material distribution for an inverted slope/biome mask or
  weighting issue while preserving the existing texture variety. Tiny palm
  placements should be scaled up, ferns should sit higher and larger instead
  of being sunk into the ground, big palms such as `giantPalm`/`fanPalm` should
  be more numerous, ground vegetation density should increase, and bamboo
  should shift from a dominant continuous forest to scattered dense clusters.
  This is target definition only; no texture, scale, or vegetation distribution
  remediation is accepted without before/after screenshots and perf evidence.
- 2026-05-04 ground-material distribution pass:
  `scripts/projekt-143-terrain-distribution-audit.ts` is exposed as
  `npm run check:projekt-143-terrain-distribution` and records CPU biome,
  shader-primary material, flat/steep ground material, estimated vegetation
  density, and cliff-rock accent eligibility for all shipped modes. The final
  static artifact for this pass is
  `artifacts/perf/2026-05-04T02-02-26-811Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
  It reports all modes at `100%` flat jungle-like primary ground, Open
  Frontier at `99.99%` overall jungle-like primary ground, A Shau at `100%`,
  and steep-side rock-accent eligibility above the audit floor in every mode.
  The remaining WARN is expected evidence hygiene: AI Sandbox has
  `terrainSeed: random` and is sampled with fixed fallback seed `42`.
- 2026-05-04 implementation note: the broad procedural `highland` elevation
  cap, Open Frontier generic `cleared` cap, and A Shau generic
  highland/cleared/bamboo elevation belts are no longer primary terrain
  classification rules. `highland` remains available to the terrain material as
  a cliff/hillside accent layer through `cliffRockBiomeSlot`, with the shader
  using slope-gated rock blending instead of grey/brown mountaintop caps. The
  fresh perf-build screenshot proof after the pass is
  `artifacts/perf/2026-05-04T02-06-49-928Z/projekt-143-terrain-horizon-baseline/summary.json`
  and passed with `4/4` screenshots, renderer/terrain/vegetation telemetry,
  and `0` browser/page/scenario errors. Human visual review is still required:
  A Shau distant ridges remain muted under current atmosphere/fog, so this is a
  material-distribution correction, not final A Shau art direction acceptance.
- 2026-05-04 vegetation scale and bamboo-distribution pass: `fern` and
  `giantPalm` runtime scale/grounding were adjusted, `fanPalm`, `coconut`, and
  `giantPalm` densities were raised, and `bambooGrove` now has a large-scale
  cluster mask so bamboo can form dense pockets without filling every
  mid-level Poisson candidate. The latest static distribution artifact is
  `artifacts/perf/2026-05-04T02-41-29-573Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  bamboo estimated share falls to about `1.45-1.52%` across shipped modes while
  all flat-ground jungle-like material checks remain at `100%` and Open
  Frontier remains `99.99%` jungle-like overall. The fresh perf-build elevated
  screenshot proof after this pass is
  `artifacts/perf/2026-05-04T02-41-37-056Z/projekt-143-terrain-horizon-baseline/summary.json`
  and passes with `4/4` screenshots and `0` browser/page/scenario errors.
  Open Frontier after capture
  `artifacts/perf/2026-05-04T02-45-03-756Z/summary.json` is measurement-trusted
  but still validation WARN (`avg=24.26ms`, `peakP99=49.90ms`,
  `hitch50=0.13%`, vegetation active instances `46,247`). A Shau is not
  accepted: `artifacts/perf/2026-05-04T02-48-58-787Z/summary.json` failed
  validation despite measurement trust PASS (`peakP99=93.90ms`,
  `hitch50=2.49%`, movement transitions `2`), and rerun
  `artifacts/perf/2026-05-04T02-53-54-886Z/summary.json` failed with
  measurement trust WARN. Both A Shau runs still log the `tabat_airstrip`
  steep-footprint warning (`112.1m` vertical span across a `320m` runway
  footprint), which opened the placement/foundation/route preset problem as a
  live blocker rather than a cosmetic follow-up.
- 2026-05-04 bamboo-clustering follow-up: the first cluster mask still left
  bamboo visually scattered because clustered mid-level species were sharing
  the same Poisson spacing/grid as palms. `ChunkVegetationGenerator` now splits
  clustered mid-level Poisson species into a per-type pass, so `bambooGrove`
  can use tighter local spacing inside noise-selected grove pockets without
  being thinned by the palm grid. The latest static distribution artifact is
  `artifacts/perf/2026-05-04T10-53-17-067Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`;
  it keeps flat jungle-like primary ground at `100%` in every mode and lowers
  bamboo estimated share to about `1.0-1.05%` across shipped modes. This still
  needs screenshot/human review for visual grove readability and for whether
  ferns are now too large or too bright at ground level.
- 2026-05-04 terrain placement/foundation audit:
  `scripts/projekt-143-terrain-placement-audit.ts` is exposed as
  `npm run check:projekt-143-terrain-placement` and measures native source
  slope span plus stamped core span for flattened airfield, firebase, and
  support features. The initial artifact
  `artifacts/perf/2026-05-04T04-04-19-128Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`
  failed `airfield_main` (`43.3m` source span) and `tabat_airstrip`
  (`112.11m` source span). After relocating/reorienting Open Frontier and Ta
  Bat features onto flatter terrain, the latest passing audit is
  `artifacts/perf/2026-05-04T10-53-17-143Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`:
  `airfield_main` is `5.24m`, `tabat_airstrip` is `9.18m`, and the support
  footprints are below the fail threshold. A Shau after-placement perf evidence
  at `artifacts/perf/2026-05-04T04-14-35-401Z/summary.json` is
  measurement-trusted/WARN and no longer logs the Ta Bat steep-footprint
  warning, but it is not A Shau acceptance because terrain-stall/recovery and
  movement-transition warnings still need a route/nav/gameplay pass.
- 2026-05-04 active-player harness blocker: the perf "killbot" was still
  shooting at an old target-height contract after the Pixel Forge NPCs were
  shortened to `2.95m`. The TypeScript bot and CJS perf driver now aim at the
  visual chest proxy below the eye-level actor anchor and prefer rendered
  target anchors when the live driver supplies them. Unit evidence covers the
  height contract, and the fresh post-fix Open Frontier capture
  `artifacts/perf/2026-05-04T11-35-07-274Z/summary.json` records `120` player
  shots, `43` hits, and `9` kills, replacing the earlier zero-hit failure at
  `artifacts/perf/2026-05-04T10-36-41-205Z/summary.json`. Treat the new
  artifact as active-player hit-contract evidence only: the owner reported
  another browser game was running on and off during the capture, so the
  frame-time and heap numbers are potentially skewed and must not be used for
  perf acceptance or baseline refresh.
- 2026-05-04 owner world-placement target: the later KB-TERRAIN/KB-CULL scope
  also includes terrain-aligned static placement. Buildings, HQs, vehicles,
  and airfield/support presets should not hang foundations off hill edges or
  rely on poorly sampled random placement. The likely path is to audit and
  align terrain stamps, airfield templates, firebase/HQ presets, vehicle
  parking, and generated feature footprints before swapping assets. Pixel Forge
  has multiple building iterations that should be shortlisted for visual fit,
  triangle/draw-call cost, collision/foundation footprint, and LOD/HLOD
  readiness before any runtime replacement.
- 2026-05-04 owner texture/route target: later KB-TERRAIN work should also
  inventory existing TIJ and Pixel Forge ground, grass, path, trail, foliage,
  and cover texture/asset candidates before inventing new content. The goal is
  richer ground variety, custom grass/ground foliage and cover where useful,
  and route/trail surfaces that read worn-in, smoother, and more vehicle-usable
  for future driving instead of arbitrary grey gravel or decorative paths.
- 2026-05-04 low-resource terrain asset inventory:
  `scripts/projekt-143-terrain-asset-inventory.ts` is exposed as
  `npm run check:projekt-143-terrain-assets` and writes
  `artifacts/perf/2026-05-04T11-43-52-912Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`.
  It records `12` terrain WebP textures, including `5` green-ground variants
  and `4` trail/cleared/disturbed variants, plus `5` Pixel Forge
  ground-cover/trail prop candidates, `12` existing building candidates, `7`
  runtime Pixel Forge vegetation species, and `6` blocked Pixel Forge
  vegetation species. This closes the "look into existing texture/assets"
  inventory step without browser/perf work. It does not accept any new runtime
  asset; visual, footprint, collision, draw-call, texture residency, and
  LOD/HLOD review are still required before import or placement changes.

Root-cause hypotheses:

1. The field report is credible for Open Frontier and especially A Shau: CDLOD
   terrain and camera far planes can show terrain well past the current
   vegetation imposter tier.
2. Increasing the scatterer cell radius alone will not solve the large-mode
   horizon because the active shader fades vegetation to zero by `600m`.
3. Raising existing Pixel Forge billboard max distances would increase overdraw
   and texture reliance without solving the need for a cheap far-canopy
   representation.

Ranked remediations:

1. Add a low-cost outer canopy representation for large/elevated-camera modes:
   sparse GPU-instanced canopy cards beyond the current `600m` vegetation tier,
   blended with terrain albedo/roughness tint so the far band reads as jungle
   mass rather than individual plants.
2. Keep current Pixel Forge imposters as the near/mid vegetation layer and
   avoid increasing their max distance until draw-call, overdraw, and texture
   upload budgets are measured.
3. Use terrain-texture vegetation tinting as the fallback minimum for the
   farthest band if card density cannot meet frame-time budgets.
4. Audit and shortlist existing TIJ/Pixel Forge ground textures, grass/foliage
   assets, cover props, and path/trail materials before making custom assets;
   route stamps should become smoother, worn-in surfaces with vehicle usability
   in mind.
5. Defer virtual texturing or full low-poly cluster forests until WebGL/WebGPU
   strategy and memory budgets are decided.

Acceptance:

- Elevated-camera screenshots for Open Frontier and A Shau show no barren
  terrain band between the `600m` near/mid vegetation tier and the visible
  terrain horizon.
- Ground-level and elevated screenshots show the majority jungle floor reading
  green/vegetated, with gravel/rock retained only where intentionally exposed.
  Evidence must cover Open Frontier and A Shau and must preserve the existing
  terrain texture variety instead of replacing it with a flat tint.
- Vegetation review confirms palms and ferns are properly grounded and scaled,
  large palms and ground cover are visibly more present, and bamboo appears as
  scattered dense pockets rather than the dominant forest layer.
- Static feature review confirms airfields, HQs, buildings, support compounds,
  and parked vehicles sit on shaped terrain pads with no hanging foundations or
  hill-edge overhangs. Pixel Forge building candidates must pass the Asset
  Acceptance Standard and a placement/foundation screenshot review before they
  replace shipped structures.
- Trail/route review confirms paths use intentional worn-in dirt, mud, grass,
  or packed-earth materials from existing/project-approved assets where
  possible, and that their terrain stamps are smooth enough to support future
  vehicle movement without fighting route shoulders or building pads.
- Open Frontier and A Shau perf captures show the outer-canopy layer adds no
  more than `1.5ms` to p95 frame time and no more than `10%` renderer draw-call
  growth against matched post-warmup captures.
- Far-canopy luma in dawn, midday, and haze snapshots stays within `+/-15%` of
  near vegetation after fog/atmosphere mixing.
- The new layer is toggleable per mode and can be reverted independently from
  Pixel Forge atlas regeneration.

Open questions:

- What is the cheapest acceptable high-altitude canopy representation:
  extended imposter rings, low-poly clusters, instanced cards, terrain tinting,
  or a hybrid?
- What memory and draw-call budget is available for the outer vegetation layer?
- What A Shau camera profiles should be treated as authoritative: player
  infantry, helicopter, fixed-wing, free-fly debug, or strategy overview?
- Which existing TIJ or Pixel Forge ground/path/foliage/cover textures are
  production-worthy, and where do we need custom grass, ground-cover, or trail
  assets instead?
- Which route surfaces should become future vehicle paths, and what slope,
  width, shoulder, and smoothing constraints should those trail stamps obey?

### KB-CULL - Culling And Asset Discipline

Status: ASSET ACCEPTANCE STANDARD LANDED; CATEGORY/DRAW-CALL PROOF PASS;
REMEDIATION STILL BLOCKED ON BEFORE/AFTER EVIDENCE.

Progress:

- 2026-05-02: `scripts/pixel-forge-texture-audit.ts` and
  `npm run check:pixel-forge-textures` establish the first mechanical Pixel
  Forge texture acceptance gate. The current draft thresholds flag any
  mipmapped RGBA estimate at or above `16MiB` and fail any single texture at or
  above `32MiB`. These thresholds are seeded by the measured Open Frontier
  `texSubImage2D` startup stall and are not a final art rule. They are intended
  to prevent future asset drops from silently adding multi-second first-present
  uploads.
- 2026-05-02 Cycle 1: the Asset Acceptance Standard is landed in
  [ASSET_ACCEPTANCE_STANDARD.md](ASSET_ACCEPTANCE_STANDARD.md). It keeps the
  current texture thresholds as mechanical gates, adds atlas density,
  normal-map, triangle/draw-call, LOD/culling, screenshot, and perf-evidence
  requirements, and documents `npm run check:projekt-143-cycle1-bundle` as the
  benchmark sidecar/bundle certifier.
- 2026-05-03 Cycle 2: `npm run check:projekt-143-culling-proof` now provides a
  deterministic headed WebGL proof for renderer category attribution. The PASS
  artifact at
  `artifacts/perf/2026-05-03T09-35-13-554Z/projekt-143-culling-proof/summary.json`
  records nonzero renderer counters, CPU profile capture, browser
  long-task/LoAF capture, and required category coverage for static features,
  aircraft, vegetation imposters, NPC imposters, and close Pixel Forge NPC GLBs.
  This certifies the attribution path for KB-CULL; it is not an optimization or
  visual parity claim.
- 2026-05-04 Cycle 3: `npm run check:projekt-143-culling-baseline` writes a
  KB-CULL owner-path before packet. The clean-HEAD PASS artifact at
  `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`
  selects `large-mode-world-static-and-visible-helicopters` because trusted
  Open Frontier and A Shau captures both contain nonzero draw-call/triangle
  telemetry for `world_static_features` and visible `helicopters`. It records
  Open Frontier owner draw-call-like `388`, A Shau owner draw-call-like `719`,
  visible unattributed percentages `4.729%` and `5.943%`, and total draw-call
  ceilings `1037` / `785`. Close-NPC and weapon pool residency remains a
  diagnostic-only candidate until combat stress measurement trust passes.
- 2026-05-04 rejected candidate: a static helicopter distance-cull prototype
  against `WorldFeatureSystem` was not accepted. The targeted Vitest slice
  passed before rejection, but the trusted Open Frontier after capture at
  `artifacts/perf/2026-05-04T00-55-00-501Z/summary.json` failed validation
  with `peak_p99_frame_ms=64.70ms`, and the selected owner draw-call-like path
  did not improve: `world_static_features` stayed `349`, visible `helicopters`
  stayed `39`, and combined owner draw-call-like remained `388`. A Shau after
  capture was skipped because the first required guardrail already failed. No
  culling/HLOD remediation or perf win is accepted from this attempt.

Open questions:

- Which asset classes are actually submitted and drawn by distance after a
  proposed culling/HLOD change?
- What static asset acceptance standard prevents future unmeasured regressions?
- Which Pixel Forge atlases can be compressed, downscaled, split by faction or
  readiness tier, or deferred without breaking imposter quality?

### KB-EFFECTS - Combat Effects

Status: LOW-LOAD FIRST-USE STALL REMOVED; TRUSTED CLOSEOUT EVIDENCE FILED; STRESS ADVISORY REMAINS.

Progress:

- 2026-05-02: `src/systems/weapons/GrenadeEffects.ts` now emits dev/perf-build
  user timings for frag detonation total time and step costs:
  explosion-pool spawn, impact-pool spawn, audio, damage, camera shake, and
  event dispatch. The marks are diagnostic only and do not change grenade
  behavior.
- 2026-05-02: `scripts/perf-grenade-spike.ts` now launches a perf-build AI
  Sandbox probe, waits through warmup, records a baseline frame window,
  triggers live grenade projectiles through `grenadeSystem.spawnProjectile`,
  records the detonation window, and writes `summary.json`,
  `baseline-snapshot.json`, `detonation-snapshot.json`, `console.json`, and a
  Chrome CPU profile. It is exposed as `npm run perf:grenade-spike`.
- 2026-05-02: The grenade probe disables the diagnostic WebGL texture-upload
  observer through `window.__perfHarnessDisableWebglTextureUploadObserver`.
  That observer remains appropriate for startup attribution, but wrapping every
  WebGL texture call contaminates sustained runtime captures.
- 2026-05-02 low-load reproduction:
  `artifacts/perf/2026-05-02T20-21-05-603Z/grenade-spike-ai-sandbox` ran
  headed with `npcs=2`, two grenades, a 120-frame baseline window, and a
  273-frame detonation window. Baseline p95/p99/max were
  `22.6ms / 23.6ms / 25.0ms`; detonation p95/p99/max were
  `25.7ms / 30.6ms / 100.0ms`, with two `>50ms` hitches. The first trigger
  landed at `17619.1ms` and coincided with a `379ms` long task plus a
  `380.5ms` long animation frame. The second trigger at `19129.9ms` did not
  produce a matching long task. This supports a first-use stall, not a
  per-detonation steady cost.
- 2026-05-02 step attribution from the same artifact: two grenade detonations
  measured `kb-effects.grenade.frag.total` at `1.4ms` total with `1.0ms` max.
  `spawnProjectile` measured `0.6ms` total / `0.4ms` max. Explosion-pool,
  impact-pool, audio, damage, camera-shake, and event-dispatch timings were all
  sub-millisecond. The measured JS detonation path is not large enough to
  explain the browser stall.
- 2026-05-02 CPU-profile lead from the same artifact: top aggregate self-time
  buckets were Three/WebGL render and first-use program work, including
  `updateMatrixWorld` at about `2500ms`, minified Three function `h` at
  `772.8ms`, `(program)` at `497.5ms`, `multiplyMatrices` at `444.3ms`,
  `getProgramInfoLog` at `334.6ms`, and `renderBufferDirect` at `116.8ms`.
  The current lead is first visible explosion render/program/material work,
  not combat damage, audio decode, physics broadphase, or effect object
  allocation.
- 2026-05-02 120-NPC load check:
  `artifacts/perf/2026-05-02T20-19-04-818Z/grenade-spike-ai-sandbox` shows the
  stress scene is already saturated before grenade detonation: the 120-frame
  baseline took `29.5s`, every sampled frame was clamped at `100ms`, and
  Combat EMA was about `40ms`. The grenade JS path still measured only
  `1.2ms`, but this scene is not a valid grenade-isolation benchmark until
  baseline combat/render frame time recovers.
- 2026-05-03 current-HEAD low-load refresh:
  `artifacts/perf/2026-05-03T22-09-54-365Z/grenade-spike-ai-sandbox` reran the
  headed two-grenade probe with `npcs=2`, `baselineFrames=120`,
  `postFrames=240`, `warmupMs=10000`, and CPU profile capture present. It
  reproduced the first-use stall: baseline p95/max `22.6ms / 24.2ms`,
  detonation p95/max `22.5ms / 100.0ms`, max-frame delta `75.8ms`, one
  `379ms` long task, and two long-animation-frame entries. Grenade JS remained
  small: `kb-effects.grenade.frag.total=1.4ms` total / `0.9ms` max and
  `spawnProjectile=0.6ms` total / `0.4ms` max.
- 2026-05-03 rejected warmup attempts: explosion-only visible render warmup
  `artifacts/perf/2026-05-03T22-12-40-344Z/grenade-spike-ai-sandbox` still hit
  detonation max `100.0ms`, max-frame delta `73.7ms`, one `397ms` long task,
  and two long-animation-frame entries. Full frag render-path warmup
  `artifacts/perf/2026-05-03T22-16-26-287Z/grenade-spike-ai-sandbox` still hit
  detonation max `100.0ms`, max-frame delta `72.5ms`, one `387ms` long task,
  and two long-animation-frame entries. Culling-forced full frag warmup
  `artifacts/perf/2026-05-03T22-18-02-801Z/grenade-spike-ai-sandbox` still hit
  detonation max `100.0ms`, max-frame delta `75.3ms`, one `373ms` long task,
  and two long-animation-frame entries. The runtime warmup code was reverted
  and no grenade remediation was landed.
- 2026-05-03 render attribution before remediation:
  `artifacts/perf/2026-05-03T22-36-46-874Z/grenade-spike-ai-sandbox`
  wrapped main scene, weapon, grenade overlay, and update phases around the
  low-load two-grenade probe. It confirmed the first trigger hit a
  trigger-adjacent `webgl.render.main-scene` call at `380ms`, plus a nested
  `178.2ms` main-scene render call. The first-use scene child count was
  `1379`, one above the `1378` baseline, and the CPU profile again pointed at
  Three/WebGL program and render work including `(program)`,
  `updateMatrixWorld`, and `getProgramInfoLog`. This made the dynamic
  explosion light/program-state path the first actionable culprit.
- 2026-05-03 first-principles remediation:
  `ExplosionEffectsPool` no longer creates, pools, adds, positions, fades, or
  disposes `THREE.PointLight` instances for grenade explosions. Grenade
  explosions are now unlit pooled visuals: flash sprite, smoke/fire/debris
  `Points`, and shockwave ring. `ExplosionEffectsPool.test.ts` asserts that
  pool construction/spawn adds no `THREE.PointLight` and still makes a flash
  sprite visible.
- 2026-05-03 post-remediation evidence:
  `artifacts/perf/2026-05-03T23-04-07-778Z/grenade-spike-ai-sandbox` reran the
  perf-build low-load two-grenade probe after the unlit explosion change,
  rAF-scheduled trigger, and compact measurement-trust summary patch. Baseline
  p95/max were `36.1ms / 48.1ms`; detonation p95/max were
  `31.0ms / 100.0ms`. This run is noisier than the preceding post-remediation
  check at `artifacts/perf/2026-05-03T22-57-28-665Z/grenade-spike-ai-sandbox`,
  but it preserves the actionable signal: browser long tasks stayed at `0`,
  trigger-adjacent render attribution showed no main-scene render call above
  `29.5ms`, and grenade frag JS stayed small at
  `kb-effects.grenade.frag.total=2.0ms` total / `1.4ms` max. Measurement trust
  is `warn`: CPU profile, long-task observer, LoAF observer, disabled upload
  observer, and render attribution are present, but one long animation frame
  starts before the first trigger while the detonation window still reports a
  `100.0ms` max frame. That blocks full KB-EFFECTS closeout as a frame-metric
  classification gap rather than rejecting the unlit explosion architecture.
- 2026-05-03 measurement-trust closeout:
  `artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox` moves the
  final observer and frame-metric reset into the same `requestAnimationFrame`
  callback that spawns the first live grenade. Measurement trust is PASS:
  CPU profile, long-task observer, LoAF observer, disabled upload observer, and
  render attribution are present. The run records `0` browser long tasks,
  `0` trigger/post-trigger LoAFs, one classified pre-trigger LoAF,
  detonation p95/max `24.3ms / 30.2ms`, max-frame delta `2.6ms`, no
  `>50ms` hitch delta, near-trigger main-scene render max `23.6ms`, and
  `kb-effects.grenade.frag.total=1.5ms` total / `0.9ms` max. This closes the
  low-load grenade first-use stall for the unlit pooled explosion path. It
  does not close saturated combat120 or future visual-polish changes.

Root-cause hypotheses:

1. The trigger-adjacent long task was caused by first-use render/program-state
   churn from the dynamic explosion `PointLight` path, not grenade damage,
   audio, physics broadphase, or particle JS.
2. The prior `100.0ms` detonation max frame was inherited from pre-trigger
   frame scheduling; in-frame arming/reset now classifies pre-trigger LoAF
   delivery separately and removes that metric from grenade-trigger evidence.
3. The current 120-NPC AI Sandbox is over budget before the grenade and cannot
   isolate detonation cost until KB-METRIK/KB-CULL/KB-LOAD reduce baseline
   saturation.

Ranked remediations:

1. Preserve the unlit pooled explosion architecture. Do not reintroduce dynamic
   explosion lights or other per-detonation scene-light state transitions.
2. If explosion visual polish is needed, add it through shader-stable unlit
   sprites, particles, rings, or texture-atlas work with matched before/after
   render attribution.
3. Keep the 120-NPC grenade check advisory until the baseline window reaches
   at least p95 `<33ms`; otherwise the grenade signal remains hidden inside the
   already-failed combat frame budget.

Acceptance:

- Low-load two-grenade probe: no long task above `50ms` within `+/-250ms` of
  either trigger after warmup, and first/second detonation p95 delta below
  `3ms` over matched frame windows.
- Render attribution: no trigger-adjacent main-scene render call above `50ms`.
- Measurement trust: any remaining LoAF or `100ms` frame max is classified as
  trigger-caused or pre-trigger harness/browser contamination.
- Stress grenade probe: only considered valid after its pre-detonation
  baseline p95 is below `33ms` and measurement trust passes.

Low-load verdict: PASS for the unlit pooled explosion path at
`artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox/summary.json`.

### KB-STRATEGIE - WebGL Versus WebGPU

Status: BRIEF FILED; RECOMMENDATION IS REINFORCE WEBGL, DEFER WEBGPU MIGRATION.

Progress:

- 2026-05-02: `scripts/webgpu-strategy-audit.ts` now records active renderer
  usage, active WebGPU source matches, WebGL-specific type/context
  dependencies, migration-blocker patterns, current combatant bucket capacity,
  and retained E2 spike evidence. It writes
  `artifacts/perf/<timestamp>/webgpu-strategy-audit/strategy-audit.json` and is
  exposed as `npm run check:webgpu-strategy`.
- 2026-05-02 evidence:
  `artifacts/perf/2026-05-02T21-37-39-757Z/webgpu-strategy-audit/strategy-audit.json`
  reports `three=^0.184.0`, `activeWebgpuSourceMatches=0`,
  `webglRendererEntrypoints=5`, and `migrationBlockerMatches=94`. The active
  game renderer remains `src/core/GameRenderer.ts` with
  `THREE.WebGLRenderer`; the other renderer constructors are dev/viewer tools.
- The retained E2 branch `origin/spike/E2-rendering-at-scale` is available at
  `311aded91995cddcbf9668f32681bdb16765aa15`. Its throwaway benchmark measured
  the keyed instanced NPC-shaped path at about `2.02ms` avg for `3000`
  instances and the ideal single-instanced path at `0.5ms` avg for `3000`
  instances on the reference workstation. Its recommendation was to defer
  GPU-driven rendering work and not start a WebGPU migration.
- The E2 cliff called out a `120` instance bucket cap. The current active code
  has already moved that default cap to `512` and surfaces overflow through
  `reportBucketOverflow`, so that specific E2 scale bug is no longer silent.
- External status checked 2026-05-02: the official Three.js WebGPU manual says
  `WebGPURenderer` can fall back to WebGL 2, but `ShaderMaterial`,
  `RawShaderMaterial`, `onBeforeCompile`, and old `EffectComposer` passes must
  be ported to node materials/TSL; it also still describes
  `WebGPURenderer` as experimental and `WebGLRenderer` as maintained and
  recommended for pure WebGL 2 applications:
  https://threejs.org/manual/en/webgpurenderer. Chrome's WebGPU overview
  confirms WebGPU's value for lower JS workload and advanced compute/culling
  capabilities, while MDN still marks WebGPU as not Baseline because some
  widely used browsers lack support:
  https://developer.chrome.com/docs/web-platform/webgpu/overview and
  https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API.

Assessment:

- The current WebGL foundation can carry the stabilization cycle if measured
  blockers are fixed in place. The active regressions are texture upload,
  asset budgets, imposter visual contracts, first-use effects, culling
  certification, and distant canopy representation. WebGPU does not remove
  those asset and pipeline obligations.
- A production WebGPU replacement is estimated at `6-10` calendar weeks and
  `240-400` engineer-hours. A credible dual-backend prototype is estimated at
  `3-5` calendar weeks and `120-220` engineer-hours. This estimate comes from
  the active source dependency count plus Three.js migration requirements; it
  is not a completed port measurement.
- WebGPU would unlock compute-driven terrain and vegetation culling,
  storage-buffer or compute-updated transforms, indirect draw submission, and a
  modern MRT/post-processing stack through Three WebGPU/TSL. Those are real
  long-term capabilities, not current stabilization blockers.

Recommendation:

1. Do not commit to WebGPU migration in the recovery/stabilization cycle.
2. Reinforce WebGL first: texture upload policy, asset acceptance, imposter
   parity, effect warmup, culling certification, and far-canopy representation.
3. After stabilization, run a contained WebGPU/TSL spike for one isolated
   renderer path before any point-of-no-return migration decision.

Open questions:

- Which isolated renderer path is the right post-stabilization WebGPU spike:
  far-canopy cards, terrain tile selection, or NPC imposters?
- What browser-support policy would be acceptable if a WebGPU path materially
  outperforms WebGL but still needs fallback?
- What measured WebGL failure would justify reopening the point-of-no-return
  decision before the post-stabilization spike?

## Phase 3 Multi-Cycle Engineering Plan

This plan sequences recovery so trust is restored before optimization and so
each remediation remains landable, revertable, and measurable.

### Cycle 0 - Ship The Evidence Slice

Scope:

- Land KB-METRIK measurement trust, scene attribution, startup UI attribution,
  Pixel Forge texture/optics audits, grenade-spike probe, vegetation horizon
  audit, WebGPU strategy audit, and the recovery docs.
- Do not include asset regeneration, shader tuning, far-canopy rendering, or
  WebGPU migration.
- Use `npm run check:projekt-143` as the non-browser Cycle 0 audit bundle. It
  runs KB-CULL texture audit, KB-OPTIK imposter optics audit, KB-TERRAIN
  vegetation horizon audit, and KB-STRATEGIE WebGPU strategy audit, then writes
  a suite summary artifact. Latest validation:
  `artifacts/perf/2026-05-02T22-05-00-955Z/projekt-143-evidence-suite/suite-summary.json`.

Dependencies:

- None beyond local validation. This is the foundation for all later cycles.

Acceptance:

- `npm run typecheck` passes.
- `npm run check:projekt-143` passes and writes a suite summary listing every
  static bureau audit artifact.
- `npm run check:pixel-forge-textures`, `npm run check:pixel-forge-optics`,
  `npm run check:vegetation-horizon`, and `npm run check:webgpu-strategy`
  write artifacts without errors.
- `npm run perf:grenade-spike` can reproduce or explicitly fail to reproduce a
  low-load grenade event with baseline/detonation windows.
- No doc claims describe performance or visual fixes that are not present in
  code.

Reversibility:

- Foundational, but low-risk. The slice is additive instrumentation and docs.

### Cycle 1 - Certified Baselines And Asset Policy

Scope:

- Re-run Open Frontier startup, `combat120`, Open Frontier short, A Shau short,
  and a low-load grenade probe on a quiet machine with measurement trust
  passing where applicable.
- Convert the Pixel Forge texture audit thresholds into an explicit Asset
  Acceptance Standard.
- Decide preload, deferred upload, compression, atlas-size, and normal-map
  policies from measured upload and visual evidence.

Dependencies:

- Cycle 0 tooling must be landed.
- KB-LOAD, KB-CULL, KB-OPTIK, and KB-EFFECTS all depend on KB-METRIK trust.

Acceptance:

- Open Frontier startup has at least three retail-build runs with WebGL upload
  attribution and a named largest-upload table.
- A trusted `combat120` or documented untrusted capture explains harness
  overhead before frame-time conclusions are used.
- Asset Acceptance Standard blocks single textures above the chosen MiB limit
  unless an explicit exception carries upload and visual evidence.
- Candidate texture policy estimates are paired with visual-risk notes, not
  accepted as art changes by themselves.

Reversibility:

- Foundational policy; individual thresholds remain adjustable by PR.

### Cycle 2 - Visual Runtime Proofs

Scope:

- Build matched screenshot rigs for NPC close GLB versus imposter bounds/luma.
- Add elevated Open Frontier and A Shau vegetation-horizon screenshot captures.
- Add culling/draw-call certification views for helicopters, buildings,
  static features, vegetation, close NPC GLBs, and NPC imposters.

Dependencies:

- Cycle 1 baselines and asset policy.
- KB-OPTIK cannot accept shader or atlas changes without matched screenshots.
- KB-TERRAIN cannot accept outer canopy without elevated screenshots and perf
  captures.
- KB-CULL cannot certify culling without draw-call/triangle attribution.

Acceptance:

- NPC close/imposter projected height delta is within `+/-10%` at the selected
  LOD switch distances or the exception is visually signed off.
- Mean opaque luma delta between close and imposter crops stays within
  `+/-12%` under at least midday, dawn/dusk, and haze snapshots.
- Open Frontier and A Shau elevated screenshots show the current vegetation
  horizon defect before any remediation lands.
- Draw-call and triangle attribution identify static-feature, aircraft,
  vegetation, NPC imposter, and close NPC costs to below `10%` unattributed
  visible triangles in representative captures, with a dedicated headed proof
  allowed to cover categories not visible in the representative camera windows.

Reversibility:

- Foundational validation surfaces. Screenshots and probes are additive.

Current Cycle 2 status:

- 2026-05-03: `npm run evidence:atmosphere -- --out-dir
  artifacts/perf/2026-05-03T01-00-12-099Z/projekt-143-cycle2-runtime-proof`
  refreshed all-mode runtime screenshots on source
  `5f46713d101f6fea974da6d77f303c95df58000c`. Open Frontier and A Shau each
  have ground-readability, sky-coverage, and aircraft-clouds screenshots plus
  renderer/terrain samples. This is current-condition proof, not remediation.
- 2026-05-03: `npm run check:projekt-143-cycle2-proof` was refreshed after
  the aircraft import and wrote
  `artifacts/perf/2026-05-03T09-17-01-580Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`.
  Overall status is WARN. Runtime horizon screenshots and static horizon audit
  checks passed. Scene attribution is under the `10%` unattributed visible
  triangle budget (`4.00%` Open Frontier, `6.03%` A Shau), but some required
  categories have zero visible triangles in these captures and need dedicated
  close-NPC/NPC-imposter views. Static optics evidence exists, but matched
  close-GLB/imposter screenshots are not certified yet.
- 2026-05-03: `npm run check:projekt-143-culling-proof` added the dedicated
  KB-CULL renderer/category proof that the AI Sandbox diagnostics could not
  certify. The trusted headed artifact is
  `artifacts/perf/2026-05-03T09-35-13-554Z/projekt-143-culling-proof/summary.json`.
  It records commit SHA, headed browser metadata, a fixture screenshot,
  CPU profile, browser long-task/LoAF capture, renderer stats (`133` draw
  calls, `4,887` triangles), and scene attribution for static features,
  fixed-wing aircraft, helicopters, vegetation imposters, NPC imposters, and
  close Pixel Forge NPC GLBs. Measurement trust is PASS with browser/page/
  request errors at `0` and probeP95 `1.96ms`. A headless exploratory run
  produced a lost WebGL context and zero renderer counters, so the npm script
  is headed by default. The proof screenshot is not relative scale evidence:
  fixture GLBs are scaled by longest bounding-box axis to keep all required
  categories visible in one camera. KB-OPTIK matched close-GLB/imposter
  screenshots remain the scale/parity authority.
- 2026-05-03: `npm run check:projekt-143-cycle2-proof` was refreshed again
  after the dedicated culling proof and wrote
  `artifacts/perf/2026-05-03T09-35-33-689Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`.
  Overall status remained WARN at that point because KB-OPTIK still lacked
  matched close-GLB/imposter screenshot crops. KB-CULL scene attribution is PASS:
  Open Frontier and A Shau representative captures remain below the `10%`
  unattributed visible-triangle budget, and the dedicated proof covers required
  renderer categories with trusted measurement.
- 2026-05-03: `npm run check:projekt-143-optics-scale-proof -- --port=0`
  added the matched KB-OPTIK evidence and passed at
  `artifacts/perf/2026-05-03T10-39-21-420Z/projekt-143-optics-scale-proof/summary.json`.
  It records four close-GLB/imposter crop pairs, projected geometry height,
  rendered visible silhouette height, luma/chroma deltas, same-scale aircraft
  native bounds, headed browser metadata, and measurement-trust flags. The
  evidence proved Cycle 2 had the required visual proof surface, while also
  flagging that the pre-remediation imposters rendered at only `0.52-0.54x`
  close-GLB visible height and substantially darker luma.
- 2026-05-03: `npm run check:projekt-143-cycle2-proof` now consumes the
  KB-OPTIK scale proof and passed at
  `artifacts/perf/2026-05-03T11-19-13-862Z/projekt-143-cycle2-proof-suite/cycle2-proof-summary.json`.
  PASS means the Cycle 2 evidence bundle is complete for review; it is not a
  shader, atlas, NPC-scale, vehicle-scale, culling, or performance remediation
  claim.
- 2026-05-03: user approved moving the aircraft GLB replacement into Cycle 2.
  Six Pixel Forge aircraft GLBs were imported through
  `scripts/import-pixel-forge-aircraft.ts` rather than copied directly. The
  importer records source/provenance metadata and wraps the `+X`-forward source
  scene under `TIJ_AxisNormalize_XForward_To_ZForward` so the public runtime
  GLBs keep TIJ's `+Z`-forward storage contract. Provenance sidecars are tracked
  under `docs/asset-provenance/pixel-forge-aircraft-2026-05-02/`. Local import
  evidence:
  `artifacts/perf/2026-05-03T01-55-00-000Z/pixel-forge-aircraft-import/summary.json`.
  Standalone visual viewer evidence:
  `artifacts/perf/2026-05-03T01-58-00-000Z/pixel-forge-aircraft-viewer/summary.json`.
  `npm run probe:fixed-wing -- --boot-attempts=2` passed at
  `artifacts/fixed-wing-runtime-probe/summary.json`, covering A-1, F-4, and
  AC-47 takeoff/climb/approach/bailout/handoff. The first Open Frontier
  renderer capture exposed GLTFLoader interleaved-attribute merge errors; the
  TIJ `ModelDrawCallOptimizer` wrapper now deinterleaves geometry attributes
  before static batching, and the rerun at
  `artifacts/perf/2026-05-03T03-07-26-873Z` has measurement-trust PASS and `0`
  browser errors. A Shau renderer evidence at
  `artifacts/perf/2026-05-03T03-11-40-162Z` also has measurement-trust PASS and
  `0` browser errors. Both large-mode validations are WARN on peak p99, and
  strict `perf:compare` fails against older baselines, so there is no
  optimization claim. Local code gates for this aircraft patch now pass:
  `npm run validate:fast`, `npm run build`, and `npm run check:projekt-143`
  with the latest static evidence summary at
  `artifacts/perf/2026-05-03T11-18-46-108Z/projekt-143-evidence-suite/suite-summary.json`.
  Manual CI run `25274278013` and Deploy run `25274649157` passed. Live Pages
  `/asset-manifest.json` reported
  `afa9247f1ec36a9a98dedb50595a9f6e0bc81a33`; Pages shell, service worker,
  manifest, representative aircraft GLBs, Open Frontier navmesh/heightmap,
  hashed build assets, Recast WASM, and the A Shau R2 DEM URL returned `200`;
  a live Zone Control browser smoke reached the deploy UI with no console,
  page, request, or retry-panel failures. Remaining open gate: human
  aircraft-feel playtest.
- 2026-05-03 KB-CULL follow-up: focused AI Sandbox captures were attempted to
  expose close-NPC and NPC-imposter renderer categories:
  `artifacts/perf/2026-05-03T09-10-57-791Z` (`npcs=120`) and
  `artifacts/perf/2026-05-03T09-13-00-811Z` (`npcs=60`). Both failed validation
  and `measurement_trust`; the lower-load capture still had probeAvg `96.62ms`
  and probeP95 `211ms`. It did expose `npc_close_glb` (`39601` visible
  triangles) and `npc_imposters` (`2` visible triangles), but the artifact is
  diagnostic only. This failed path is retained as an agent-DX warning: do not
  repeat combat-heavy AI Sandbox captures for KB-CULL certification when the
  deterministic headed proof exists.
- No shader, atlas, culling, far-canopy, grenade, texture, or WebGPU remediation
  may be accepted from Cycle 2 until the relevant proof check is PASS or a
  documented exception exists.

### Cycle 3 - Measured WebGL Remediation

Scope:

- Apply the smallest reversible fixes: texture regeneration/compression or
  deferred upload, first-use explosion warmup/simplification, culling/HLOD
  fixes for static assets, and a far-canopy layer if screenshots and budgets
  justify it.

Dependencies:

- Cycle 2 visual/runtime proof must exist for the affected subsystem.
- KB-STRATEGIE keeps WebGPU migration out of this cycle.

Acceptance:

- Open Frontier mode-click-to-playable median and p95 improve against Cycle 1
  startup baselines, with upload totals and largest-upload deltas reported.
- Open Frontier and A Shau 95th-percentile frame time stay below the chosen
  scenario budget over a post-warmup capture window; no remediation may pass
  solely on mean frame time.
- Low-load grenade probe has no long task above `50ms` within `+/-250ms` of
  either warmed trigger, and first/second detonation p95 delta stays below
  `3ms`.
- Outer canopy, if landed, adds no more than `1.5ms` to p95 frame time and no
  more than `10%` renderer draw-call growth in matched large-mode captures.

Reversibility:

- Reversible remediation. Each fix must land in its own PR or bisectable commit.

Current Cycle 3 status:

- Fresh-agent handoff: `docs/PROJEKT_OBJEKT_143_HANDOFF.md` contains the
  short continuation prompt, current local repo constraints, and latest
  evidence anchors for agents taking over from a clean session.
- 2026-05-04: after the KB-CULL owner baseline pass, `npm run
  check:projekt-143-cycle3-kickoff` wrote
  `artifacts/perf/2026-05-04T00-14-47-283Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`.
  Overall status is WARN because KB-OPTIK still needs a decision. KB-OPTIK
  `npc-imposter-scale-luma-contract` is now
  `needs_decision`: the first `2.95m` target/crop remediation plus
  selected/expanded luma tuning has matched evidence inside the `+/-15%`
  height band and `+/-12%` luma band. The trusted near-stress expanded proof
  still flags `10/40` 8.5m perspective visible-height samples, while the
  runtime LOD-edge proof passes with `0/40` flags. The next KB-OPTIK choice is
  documenting that near-stress exception, running human visual review, or
  switching the next remediation slot to KB-LOAD/KB-TERRAIN/KB-CULL.
  KB-LOAD `pixel-forge-texture-upload-residency` remains
  `ready_for_branch`, now specifically for remaining uploads/residency after
  the giantPalm-only warmup reduced WebGL upload totals without proving a
  startup-latency win. KB-EFFECTS `grenade-first-use-stall` is
  `evidence_complete` for the low-load first-use stall after dynamic explosion
  `PointLight` removal and in-frame metric arming eliminated the
  trigger-adjacent `300ms+` main-scene render stall, browser long task, and
  inherited `100ms` frame metric. KB-TERRAIN
  `large-mode-vegetation-horizon` is now `ready_for_branch` after
  `npm run check:projekt-143-terrain-baseline` wrote
  `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`
  from a clean-HEAD fresh perf build. It captured `4/4` elevated Open Frontier and
  A Shau screenshots with renderer stats, terrain metrics, vegetation active
  counters, and nonblank terrain image checks, then linked trusted Open
  Frontier and A Shau perf-before baselines. Future after captures must stay
  within the recorded ceilings: Open Frontier p95 `<=43.5ms` and draw calls
  `<=1141`, A Shau p95 `<=40.9ms` and draw calls `<=864`.
  The branch goal now also includes jungle-floor material correction and
  vegetation distribution: preserve texture variety but make most ground read
  green/jungle, investigate possible inverted material distribution if green is
  appearing mainly on hillsides, scale and ground palms/ferns properly, add
  more big palms and ground vegetation, and reduce bamboo dominance into
  scattered dense clusters.
  The current local branch adds a second bamboo clustering fix that gives
  clustered mid-level vegetation its own Poisson spacing instead of sharing the
  palm grid, plus a terrain placement audit and first Open Frontier/A Shau
  airfield relocation. The latest placement audit passes and the latest
  A Shau after-placement capture no longer logs the Ta Bat steep-airfield
  warning, but A Shau remains WARN because terrain-stall/route symptoms are
  still open. The active-player harness also has a shorter-NPC visual-chest
  aim fix in unit tests and a fresh Open Frontier capture with `120` shots and
  `43` hits. Because another browser game was running on and off during that
  capture, use it to close the zero-hit hit-contract question only; do not use
  its frame-time metrics as perf acceptance.
  KB-CULL `static-feature-and-vehicle-culling-hlod` is now
  `ready_for_branch` after
  `npm run check:projekt-143-culling-baseline` wrote
  `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`.
  The selected owner path is
  `large-mode-world-static-and-visible-helicopters`; any after branch must
  improve the owner draw-call/triangle telemetry in matched Open Frontier and
  A Shau captures without regressing total renderer draw calls or visible
  unattributed percentage. Close-NPC pool residency remains diagnostic-only
  because the visible combat artifact still failed measurement trust.
  A static helicopter distance-cull candidate was rejected after
  `artifacts/perf/2026-05-04T00-55-00-501Z/summary.json` because Open Frontier
  validation failed and the owner path stayed at `388`; do not repeat that
  exact approach as a claimed KB-CULL fix without new before/after evidence.
- 2026-05-04 local follow-up validation: focused vegetation/terrain/harness
  unit tests passed, `npm run check:projekt-143-terrain-placement` PASS wrote
  `artifacts/perf/2026-05-04T10-53-17-143Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`,
  `npm run check:projekt-143-terrain-distribution` WARN wrote
  `artifacts/perf/2026-05-04T10-53-17-067Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
  with only the expected AI Sandbox fixed-fallback seed flag, and
  `npm run check:projekt-143-terrain-baseline` PASS wrote
  `artifacts/perf/2026-05-04T11-26-11-588Z/projekt-143-terrain-horizon-baseline/summary.json`.
  A low-resource terrain asset inventory pass wrote
  `artifacts/perf/2026-05-04T11-43-52-912Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`
  and is WARN by design because it is shortlist evidence, not asset
  acceptance.
  Final broad gates passed or warned as expected:
  `npm run check:projekt-143-cycle3-kickoff` WARN at
  `artifacts/perf/2026-05-04T11-29-35-677Z/projekt-143-cycle3-kickoff/cycle3-kickoff-summary.json`,
  `npm run check:projekt-143` PASS at
  `artifacts/perf/2026-05-04T11-29-35-169Z/projekt-143-evidence-suite/suite-summary.json`,
  and `npm run validate:fast` PASS (`251` files, `3860` tests). Fixed-wing
  browser probe validation is incomplete: `npm run probe:fixed-wing` first hit
  sandbox `spawn EPERM`, then the approved rerun produced only partial A-1
  success in `artifacts/fixed-wing-runtime-probe/summary.json` before timing
  out; no full fixed-wing pass is claimed.
- 2026-05-03: `npm run check:projekt-143-optik-decision` refreshed the
  decision packet at
  `artifacts/perf/2026-05-04T00-05-37-320Z/projekt-143-optik-decision-packet/decision-packet.json`.
  It now records current NPC target `2.95m`, imposter visible-height ratio
  average `0.879`, imposter luma delta percent average `-0.073`, and aircraft
  longest-axis/current-NPC average `4.52x`. It records near-stress expanded
  proof WARN with `10` flagged samples and runtime LOD-edge proof PASS with
  `0` flagged samples. The first absolute-target, crop, and selected/expanded
  luma decisions are complete for this remediation; the recommended next
  branch is
  `document-near-stress-silhouette-exception-or-switch-bureau`.
  Aircraft resizing remains rejected as the next response unless a separate
  vehicle-scale proof and playtest scope are opened.

### Cycle 4 - Strategic Spike Only

Scope:

- If WebGL remains the blocker after Cycles 1-3, run one contained WebGPU/TSL
  spike against a single isolated renderer path.
- Candidate paths: far-canopy cards, terrain tile selection, or NPC imposters.

Dependencies:

- WebGL remediations must be measured first.
- A browser-support and fallback policy must be written before migration work.

Acceptance:

- Spike compares WebGL and WebGPU versions of the same isolated path with
  frame-time, GPU-time where available, memory, visual, and browser-support
  evidence.
- No production migration starts unless the spike shows a material benefit
  that survives fallback and porting cost.

Point Of No Return:

- Full WebGPU migration is a point of no return. It requires explicit approval
  after a contained spike, not during stabilization.

## Minimum Viable Stabilization Subset

Current draft after initial bureau briefs:

1. Make perf captures self-certify measurement trust.
2. Add or formalize short benchmark captures that isolate harness overhead,
   mode startup, combat load, and renderer-only load.
3. Attribute renderer/runtime cost by subsystem and asset class.
4. Re-run `combat120` and Open Frontier startup on a fresh build with certified
   telemetry, using the 2026-05-02 retail startup split as the first KB-LOAD
   comparison point rather than a root-cause conclusion.
5. Rerun the elevated Open Frontier and A Shau vegetation-horizon baseline
   before any far-canopy after comparison; the first fresh-build baseline is
   filed at
   `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`.
6. Keep WebGPU migration out of the minimum stabilization subset; strategy
   evidence recommends reinforcing WebGL until the measured blockers are fixed.
7. Only then start remediation in KB-LOAD, KB-CULL, KB-OPTIK, and
   KB-TERRAIN. KB-EFFECTS low-load is evidence-complete; reopen it only for
   combat120/stress evidence or visual changes.
