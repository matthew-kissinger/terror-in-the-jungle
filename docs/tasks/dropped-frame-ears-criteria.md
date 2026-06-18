# Dropped-Frame EARS Criteria

Draft scaffold for STABILIZAT-4. Use this to keep future agent loops pointed at
the same finish line. These criteria are intentionally quantitative where the
repo already has a sensor, and explicitly marked as owner-alignment where the
threshold still needs human judgement.

EARS key:
- Ubiquitous: always true.
- Event-driven: when a trigger happens, the system must respond.
- State-driven: while a state is active, the system must hold an invariant.
- Unwanted behavior: if a bad condition occurs, the system must handle it.
- Complex: combines trigger and state.

## Completion Lane

Unless the owner explicitly changes this, a completion candidate means all of:

- Scenario set: Open Frontier and A Shau.
- Capture shape: headed, WebGPU, quiet-machine attested, seeded, default
  representative content, active combat.
- No content-reduction flags: no disabled wildlife, no disabled terrain
  shadows, no disabled terrain skirts, no reduced vegetation density, no
  reduced draw distance, no weakened combat, no shortened terrain, no
  frontline compression, and no diagnostic-only bypasses. Visible raindrop
  particles and precipitation terrain wetness are explicitly out of scope for
  this dropped-frame lane as of 2026-06-17; weather state, fog/cloud/lighting
  intent, storm/lightning logic, map content, combat, wildlife, terrain, and
  vegetation remain in scope. Restore rain through a GPU/compute path before
  treating rain visuals/wetness as part of this perf goal again.
- Sky, cloud, sun, fog, and atmosphere implementation details are not sacred.
  If profiling or owner-visible quality shows the current Hosek/Wilkie sky,
  cloud, fog, or sun treatment is both expensive and unattractive, a
  replacement or simplification is aligned when it improves visual quality and
  frame pacing without reducing gameplay readability, terrain stability, or
  scenario mood.
  Owner feedback on 2026-06-17 calls the current atmosphere/cloud read weak and
  the visible sun shader unattractive; future agents should treat that as a
  valid quality signal, not just a subjective aside. The current branch defaults
  the visual dome to a per-fragment TSL path, so do not assume the older
  128x64 baked-texture regression memo is current proof. Measure first, then
  simplify or replace if it lowers dropped-frame tails or provides a clear
  same-cost quality win.
- Fog changes must be evaluated as visual and gameplay authority, not only as
  `scene.fog.density`. The current implementation can spend fog cost in terrain
  far-canopy tint/haze, foliage billboard fog, NPC-impostor fog, scene
  FogExp2, weather density modulation, and aircraft fog-distance culling. A
  valid optimization can simplify or replace those paths when evidence shows a
  frame-pacing win, but it must not hide terrain/CDLOD cracks, weaken target or
  vehicle readability, or change culling semantics without explicit proof.
  Current harness support tags the sky dome under the `atmosphere` render
  category and records sky-refresh diagnostic stats in runtime samples; this
  still does not isolate every shader/material fog path inside `RenderMain`.
- Local sky references to check before inventing a new path:
  `pixel-forge/examples/three-js/examples/jsm/objects/SkyMesh.js`,
  `pixel-forge/examples/three-js/examples/webgpu_sky.html`,
  `game-field-kits/kits/atmosphere-starter/src/atmosphere.ts`, and
  `sds/docs/archive/research/sun-sky-atmosphere-perf-spike-2026-05-16.md`.
  No local `threejsroadmap` folder was found in the quick targeted search; if
  the owner meant a different path, add it here.
- Required artifacts: `summary.json`, `validation.json`,
  `presentation-epochs.json`, browser stall entries when present,
  render-submission samples when present, final frame, and driver final state.
- Release proof after local pass: `npm run validate:fast`, relevant perf/full
  evidence, merge/shepherd to `master`, exact-head CI, deploy, live release
  verification, and owner playtest for visual/game-feel acceptance.

Executable scaffold:

- Run `npm run check:dropped-frame-ears -- --dir artifacts/perf/<a-shau-capture> --dir artifacts/perf/<open-frontier-capture> --strict`
  before calling a dropped-frame candidate complete.
- Preferred local capture commands for the completion lane are
  `npm run perf:capture:ashau:ears -- --quiet-machine-attested` and
  `npm run perf:capture:openfrontier:ears -- --quiet-machine-attested`.
  Only pass `--quiet-machine-attested` when the machine is actually reserved
  for the run. The scripts force headed strict WebGPU, render-submission
  attribution, and `--compress-frontline false`.
- Without `--dir`, the checker evaluates the latest `artifacts/perf/*`
  capture only. That is useful for triage but cannot pass the completion lane
  unless the required Open Frontier + A Shau artifact pair is supplied.
- The checker intentionally rejects content-reduction flags and classifies
  failed trust, WebGPU fallback, missing real combat, missing required files,
  failed rAF gates, severe busy quiet-machine snapshots, and harness-equivalence
  warnings as diagnostic rather than completion evidence. Warning-band GPU
  background activity is recorded as sensor context instead of automatically
  invalidating an otherwise trusted headed WebGPU capture; agents must still
  report it and corroborate any surprising result.
- A Shau captures can vary naturally because the driver does not always reach
  sustained combat or close-model pressure on every run. Materialization and
  combat-frame claims require sustained pressure evidence from runtime samples,
  not just a peak shot/hit or candidate count, because otherwise one run can
  look better or worse simply from route/contact variance.
- A passing checker result is still local artifact proof only. Owner playtest,
  terrain/camera visual acceptance, exact-head CI, deploy, and
  `check:live-release` remain required before production completion.

## EARS Requirements

| id | kind | EARS statement | Quantitative pass signal | Evidence |
|---|---|---|---|---|
| ST4-PERF-001 | Ubiquitous | The game shall reduce player-visible dropped-frame time without making Open Frontier or A Shau smaller, emptier, less alive, less visible, or less stressful. | Both required scenarios pass the rAF and dropped-frame gates with default representative content. | `summary.json`, `validation.json`, final frame, owner playtest |
| ST4-PERF-002 | Complex | When running a completion-lane capture while the machine is quiet, the harness shall accept the run only if measurement trust passes. | `measurementTrust.status == "pass"`, quiet-machine attestation is recorded, and the ambient CPU/GPU snapshot does not report severe busy-machine failure. Moderate background GPU activity may be a warning-band sensor context, not proof by itself. | `summary.json`, measurement trust section |
| ST4-PERF-003 | Complex | When running a completion-lane capture while WebGPU is expected, the harness shall reject silent fallback as completion evidence. | Renderer backend resolves to the accepted WebGPU path; fallback captures are diagnostic unless explicitly scoped. | `summary.json`, `perfRuntime`, validation warnings |
| ST4-PERF-004 | Complex | When running a completion-lane capture while active combat is required, the driver shall produce real fire, hits, and enemy-state progression across the sampled window. | Mode-scaled shot/hit thresholds pass and `active_combat_sustained_contact` passes: runtime samples show at least 3 shot-increase samples and at least 5% of shot-counter samples include new shots. Zero-shot, no-contact, or burst-only runs are diagnostic only. | `summary.json`, `runtime-samples.json`, driver final state, validation |
| ST4-PERF-005 | Ubiquitous | The harness shall fail completion if the capture uses a content-reduction or visual-degradation flag. | No forbidden flag is present in `perfRuntime` or URL params. | `summary.json`, `perfRuntime`, capture command |
| ST4-PERF-006 | Ubiquitous | The rAF gate shall be treated as the primary player-visible frame-pacing contract. | `rAF >25ms <0.5%`, `rAF >33ms <0.25%`, estimated dropped 60 Hz frames `<0.1/s`, dropped-frame time `<1ms/s`. | `validation.json`, `summary.json` |
| ST4-PERF-007 | Unwanted behavior | If a capture fails measurement trust, the agent shall classify all perf deltas from that run as diagnostic only. | Reports use "diagnostic" language and do not mark a candidate as a proven win. | handoff docs, `progress.md` |
| ST4-PERF-008 | Unwanted behavior | If metrics improve while same-experience invariants regress, the agent shall reject the change as a goal failure. | No accepted candidate reduces combat pressure, map size, terrain/vegetation readability, wildlife where enabled, weather state/atmosphere, war assets, draw distance, or normal player flow. Visible raindrop particles and precipitation wetness are the owner-approved exceptions for this lane and must be tracked as a compute/GPU restoration follow-up. | diff review, final frame/samples, owner playtest |
| ST4-PERF-009 | State-driven | While A Shau is being used as the worst-case scenario, terrain/CDLOD/camera glitch evidence shall remain in scope until resolved or disproven. | No sky-ribbon, backface, underside, white-gap, or camera-clipping symptom in normal play or captured evidence. | final frame, sampled screenshots, owner playtest |
| ST4-PERF-010 | Event-driven | When a terrain/CDLOD optimization changes geometry, skirts, culling, shadow bounds, morph cadence, or submission cadence, the agent shall record what exact visual and gameplay invariants are preserved. | Candidate note names preserved map scale, LOD range, seam coverage, height sampling, shadows, vegetation, weather, combat, and player flow. | handoff docs, PR/commit message |
| ST4-PERF-011 | Event-driven | When render tails remain dominated by `RenderMain.renderer.render`, the next loop shall prioritize render-side attribution before simulation micro-optimization. | Tail report includes terrain, vegetation, world-static, NPC, wildlife, shadow, and overlay categories where available. | tail attribution, render-submission samples |
| ST4-PERF-012 | Event-driven | When the harness reports route snaps, world-space movement, large unresolved view turns, shot-presentation anomalies, or frontline compression, the agent shall treat the capture as suspect unless those warnings are explicitly explained. | No material equivalence warnings in completion-lane captures, or a written owner-approved exception. | `validation.json`, driver final state |
| ST4-PERF-013 | Unwanted behavior | If a proposed fix is a diagnostic bypass, the repo shall keep it opt-in and prevent it from being reported as shipped gameplay. | Flags such as legacy full skirts, disabled skirts, disabled shadows, or forced upload modes are documented as diagnostic unless promoted with structural proof and owner acceptance. | code flags, docs |
| ST4-PERF-014 | Complex | When a local candidate passes static validation while runtime proof is missing, the agent shall call it source-stable but unproven. | `validate:fast` and relevant focused checks pass, but STABILIZAT-4 remains open. | command output, `docs/DIRECTIVES.md` |
| ST4-PERF-015 | Complex | When both required scenarios pass locally while default content is preserved, the agent shall run release proof before claiming production completion. | Exact-head CI, deploy, `check:live-release`, and owner playtest pass. | CI/deploy URLs, release proof JSON |
| ST4-PERF-016 | Event-driven | When an agent evaluates saved dropped-frame artifacts, the repo shall provide an executable artifact classifier instead of relying on hand-scanned summaries. | `npm run check:dropped-frame-ears -- --dir <ashau> --dir <openfrontier> --strict` exits 0 only when both scenarios pass the EARS completion artifact gate. | `scripts/check-dropped-frame-ears.ts`, CLI output |
| ST4-PERF-017 | Complex | When a candidate claims to improve NPC materialization or close-combat frame pacing, the harness shall distinguish real close-model pressure from low-contact A Shau route variance. | `npc_materialization_pressure` and `npc_materialization_sustained_contact` pass: close candidates and rendered close models appear across at least 3 runtime close-model samples and at least 10% of close-model samples. Thin or burst-only contact captures remain diagnostic for materialization even when aggregate combat passes. | `validation.json`, `summary.closeModelEnvelope`, `runtime-samples.json` |
| ST4-PERF-018 | Unwanted behavior | If close-model pools load during the measured runtime of a materialization candidate, the harness shall keep the artifact diagnostic even when aggregate materialization pressure is present. | `npc_close_model_runtime_pool_loads_clear` passes: runtime samples include close-model stats and `poolLoads == 0` across measured play. | `runtime-samples.json`, `scripts/check-dropped-frame-ears.ts` |
| ST4-PERF-019 | Unwanted behavior | If active close models are sampled but tier-transition telemetry is missing, the harness shall not claim materialization-transition stutter is understood or fixed. | `npc_materialization_transition_telemetry` passes: when close models are active/rendered, `materializationTierEvents`, `summary.materializationTierMetrics.totalEvents`, or drained `closeModelStats.transitionWindow` / `summary.materializationTierMetrics.transitionWindowTotalEvents` includes at least one transition. | `runtime-samples.json`, `summary.materializationTierMetrics`, `scripts/check-dropped-frame-ears.ts` |
| ST4-PERF-020 | Event-driven | When sky, cloud, sun, fog, or atmosphere rendering contributes to frame tails or visibly degrades the game, the agent may replace or simplify that implementation instead of preserving shader parity. | `atmosphere_cpu_sync_tail` stays below warning threshold, or candidate notes show the new path improves or preserves scenario mood, terrain readability, NPC/vehicle readability, and owner-visible quality while reducing measured render/presentation cost. Shader-side fog/sky cost can still hide inside `RenderMain.renderer.render`, so a low CPU-sync value is not proof that fog is free. | render attribution, `runtime-samples.json`, final frame/screenshot evidence, owner playtest |
| ST4-PERF-021 | Unwanted behavior | If a `RenderMain.renderer.render` tail coincides with sudden renderer-memory growth, the agent shall treat asset or material GPU residency as unproven even when CPU-side pool-load counters are zero. | Candidate evidence shows no large texture/geometry/program jump around render-tail epochs, or the resources are intentionally warmed during pre-reveal startup with startup marks naming the warmup path. | `runtime-samples.json`, renderer memory counters, startup marks |
| ST4-PERF-022 | Event-driven | When the owner suspects fog or atmosphere is hurting performance, the harness shall surface measured atmosphere CPU-sync, sky-refresh, and render-category evidence before changing visuals. | `check:dropped-frame-ears` reports `atmosphere_cpu_sync_tail`; values `>=4ms` are warning-band suspects and values `>=16ms` keep the artifact diagnostic until the atmosphere/fog authority chain is measured or simplified. Runtime samples include `atmosphereSkyRefresh`, and render-submission attribution can see the sky dome under category `atmosphere`. | `scripts/check-dropped-frame-ears.ts`, `scripts/perf-capture.ts`, `runtime-samples.json`, render-submission samples |
| ST4-PERF-023 | Complex | A Shau and Open Frontier EARS captures shall not start the measured completion window while the active driver is still in a low-contact route-only approach. | Packaged EARS captures use `--pressure-ready-warmup true --pressure-ready-timeout 120`; `pressure_ready_measurement_window` passes only when the timed window begins after live fire or an active runtime-shot-preview hit, with pre-window driver shots/hits subtracted from measured counters. Timeout artifacts remain diagnostic for routing/contact, not perf completion. This is not frontline compression and does not reduce NPC count, vegetation, map size, or default gameplay content. | `package.json`, `summary.perfRuntime`, `validation.json`, `scripts/check-dropped-frame-ears.ts` |
| ST4-PERF-024 | Unwanted behavior | If combat fire is mostly terrain-blocked during a claimed pressure window, the artifact shall stay diagnostic because it is not sampling valid combat pressure. | `combat_fire_terrain_block_rate` passes below 25%, warns from 25-50%, and fails at 50% or higher once at least 10 combat-fire terrain checks were requested. High blocked rates point to target/route/LOS geometry that must be fixed before trusting dropped-frame completion evidence. | `runtime-samples.json`, `validation.json`, `scripts/check-dropped-frame-ears.ts` |
| ST4-PERF-025 | Unwanted behavior | If occluded combat-front routing repeatedly snaps exact enemy endpoints far off the navmesh, the harness shall route movement to trusted approach anchors instead of hiding the mismatch by loosening snap limits. | `harness_route_snap_trust` remains pass/warn based on the 24m trusted snap limit, and artifacts surface `combatApproachRouteCount` so a candidate can prove the driver used approach routing without frontline compression, enemy teleporting, or direct terrain pursuit through hills. | `validation.json`, `runtime-samples.json`, driver final state |
| ST4-PERF-026 | State-driven | While the active perf driver owns the infantry player during a playing-phase capture, the native HUD shall still show health and ammo so human observation and artifacts agree about survivability/ammo state. | `harness_hud_vitals_visible` passes: playing samples with `perfDriverActive=true` have mounted, visible health and ammo elements. Hidden vitals make the artifact suspect even if frame metrics improve. | `validation.json`, `runtime-samples.json`, final frame |

## Candidate Classification

- Proven win: completion-lane A Shau and Open Frontier captures pass trust,
  pass rAF/dropped-frame gates, preserve same-experience invariants, and ship
  through release proof.
- Source-stable candidate: focused tests, typecheck/lint/build, and
  `validate:fast` pass, but trusted completion-lane captures are missing.
- Diagnostic signal: a run or probe explains direction but fails trust, lacks
  combat, lacks close-model materialization pressure for a materialization
  claim, has active close models but missing tier-transition telemetry, uses a
  diagnostic flag, falls back renderer, or has material harness equivalence
  warnings.
- Rejected path: the change fails same-experience invariants, does not move
  trusted dropped-frame evidence, or relies on a harness bypass.

## Next Quantitative Gaps

These are not blockers for keeping the current scaffold, but they are the next
places where future loops should replace judgement with numbers:

- Same-experience content counters for vegetation, wildlife, static world
  features, terrain draw distance, and combatant representation per scenario.
- A WebGPU CPU/GPU/presentation split around failing rAF epochs.
- A fog/material-family A/B sensor that distinguishes scene fog, terrain
  far-canopy tint/haze, billboard fog, NPC-impostor fog, and aircraft
  fog-distance culling before accepting a shader-side fog simplification. The
  current `atmosphere_cpu_sync_tail`, sky-refresh stats, and sky-dome
  `atmosphere` render category narrow attribution, but they still do not
  isolate every fragment/material fog path inside `RenderMain.renderer.render`.
- A sky/cloud/sun/fog replacement spike against Three.js/WebGPU examples or
  local reference code if atmosphere or fog shows up in render tails or remains
  visually unacceptable after the rain burn.
- Pressure-ready warmup tells us whether the measured window started under
  active current live fire or runtime-shot-preview-ready combat pressure; it
  does not by itself prove sustained pressure across the full measured window.
  Keep the sustained combat, combat-fire terrain-block, route-snap, and
  close-model EARS gates active.
- Promotion of `presentationGapContexts.materialization` and drained
  `closeModelStats.transitionWindow` from diagnostic summary into pass/fail
  budgets once a trusted paired capture establishes acceptable close-GLB
  transition and draw/material pressure.
- Pixel Forge texture residency/upload timing that works for WebGPU, not only
  WebGL-style upload observers.
- Renderer-memory jump attribution around render-main tails, including
  textures, geometries, and programs, so first-visible WebGPU resource uploads
  cannot hide behind healthy CPU-side pool-load counters.
- A screenshot or pixel-stability regression lane for the terrain/camera
  glitch class.
- A typed/replayable driver path that reduces CJS active-driver drift from the
  real player controller.
