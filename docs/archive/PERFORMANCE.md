# Performance & Profiling

Last updated: 2026-05-07

## Stable-Ground Perf Posture

The 2026-05-02 stabilization pass does not refresh baselines or tune runtime
performance. Its perf goal is release confidence: keep `validate:full` as the
authoritative local gate, treat hosted CI perf as advisory, and record any
quiet-machine limitation as PASS/WARN instead of hiding it. Baseline refreshes
remain a separate task.

Latest positive stabilization proof is the headed combat120 sparse ground-marker
tagging packet at
`artifacts/perf/2026-05-07T17-28-02-506Z/projekt-143-ground-marker-tagging-proof/ground-marker-tagging-proof.json`.
Paired KB-METRIK measurement-path packet is
`artifacts/perf/2026-05-07T17-28-02-506Z/projekt-143-measurement-path-inspection/measurement-path-inspection.json`.
The sparse rebuilt source capture is status `ok`, validation `warn`,
measurement trust WARN, avg `16.19ms`, p99 `34.20ms`, max-frame `100.00ms`,
heap end-growth `6.51MB`, and heap recovery `86.2%`. `perf:compare --
--scenario combat120` now selects this latest status-ok capture and fails with
`6 pass, 1 warn, 1 fail`: avg WARN and max-frame FAIL. Baseline refresh remains
blocked. Raw-probe evidence records p95 `30ms`, avg `28.93ms`, max `348ms`,
and `3/87` raw probes over `75ms`; the prior 17:19 packet rejected per-sample
render-submission drain with p95 `218ms` and `59000325` render-submission bytes.
Latest accepted
measurement-PASS owner packet remains
`artifacts/perf/2026-05-07T16-23-11-889Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`.

The 2026-05-07 stabilization evidence chain is not a clean perf sign-off. The
2026-05-07
STABILIZAT-1 rerun of `npm run perf:capture:combat120` initially failed
validation with avg frame `94.34ms`, peak p99 `100.00ms`, frames >50ms
`86.78%`, over-budget samples `100%`, Combat top >16.67ms in `100%` of
samples, heap peak-growth `257.69MB` FAIL, and measurement trust WARN. DEFEKT-3
then reduced close-actor render dominance and corrected the capture metric
window. A standard repeatability capture keeps measurement trust PASS but fails
validation on heap recovery: avg frame `19.27ms`, peak p99 `36.70ms`, frames
>50ms `0.06%`, over-budget `0.33%`, heap end-growth `40.45MB` WARN, heap
peak-growth `47.49MB` WARN, and heap recovery `14.8%` FAIL. A current
close-model-disabled diagnostic clears the numeric thresholds with measurement
trust PASS: avg `14.21ms`, peak p99 `33.40ms`, heap end-growth `-14.97MB`,
and heap recovery `155.7%`. The accepted production pool-bound capture keeps
close GLB actors enabled and records validation WARN with measurement trust
PASS: avg `17.50ms`, peak p99 `34.20ms`, heap end-growth `4.64MB`, and heap
recovery `87.6%`. A follow-up production repeatability capture remains
measurement-trusted but still blocks baseline refresh: avg `17.36ms`, peak p99
`34.50ms`, heap end-growth `13.94MB`, and heap recovery `70.6%`. Latest
heap diagnostic:
`artifacts/perf/2026-05-07T05-47-22-079Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`.
The subsequent terrain-stall warning-bound pass reduces logged recovery warnings
from `343` to `21`, but the standard combat120 capture still fails validation
with measurement trust PASS: avg `17.85ms`, peak p99 `78.10ms`, heap end-growth
`16.26MB`, heap peak-growth `38.15MB`, and heap recovery `57.4%`. Latest
warning-bound evidence:
`artifacts/perf/2026-05-07T05-54-31-155Z/projekt-143-stuck-warning-bound/summary.json`.
The deep-CDP attribution captures are profiler evidence only, not baseline
candidates. The production-bundle packet records `213136` allocation samples
and `6898.73MB` sampled self-size volume but keeps some owners minified. The
dev-shape source attribution packet records `132238` allocation samples and
`4275.84MB` sampled self-size volume; top categories are
`three_renderer_math_and_skinning` (`53.08%`), `terrain_height_sampling`
(`10.15%`), `browser_or_unknown` (`10.00%`),
`native_array_string_or_eval_churn` (`8.91%`),
`combatant_renderer_runtime` (`6.30%`), and
`combat_movement_terrain_queries` (`4.14%`). Top source URL owners are
`three.module`, native churn, `CombatantRenderer.ts`,
`GameplaySurfaceSampling.ts`, `CombatantMovement.ts`, `HeightQueryCache.ts`,
and `InfluenceMapComputations.ts`. Attribution evidence:
`artifacts/perf/2026-05-07T06-18-22-151Z/projekt-143-heap-sampling-attribution/summary.json`.
The close-model material-state bound prevents steady close GLB opacity updates
from marking materials dirty every frame. The next standard combat120 artifact
`artifacts/perf/2026-05-07T06-24-48-025Z` records validation PASS and
measurement trust PASS: avg `16.99ms`, peak p99 `34.30ms`, heap end-growth
`16.26MB`, heap peak-growth `44.23MB`, and heap recovery `63.2%`. The codex
heap end-growth criterion remains missed. The heap sidecar
`artifacts/perf/2026-05-07T06-27-39-705Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`
classifies the remaining heap as `retained_or_unrecovered_peak`. `perf:compare -- --scenario combat120` now skips non-capture artifact directories and reaches
the correct artifact, but reports `6 pass, 1 warn, 1 fail`; the fail is
`maxFrameMs` at `100.00ms`. Baseline refresh remains blocked.

The latest repeat capture with WebGL upload attribution,
`artifacts/perf/2026-05-07T06-36-34-481Z`, records validation WARN and
measurement trust PASS: avg `17.15ms`, peak p99 `34.20ms`, heap end-growth
`-19.39MB`, heap peak-growth `22.89MB`, heap recovery `184.7%`, and peak
max-frame `100.00ms`. The heap sidecar
`artifacts/perf/2026-05-07T06-39-17-152Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`
classifies heap as `transient_gc_wave`. The max-frame sidecar
`artifacts/perf/2026-05-07T06-41-29-405Z/projekt-143-maxframe-diagnostic/maxframe-diagnostic.json`
classifies the first max-frame event as
`longtask_without_webgl_upload_or_system-timing_owner`; WebGL texture upload
max is only `0.1ms`, while the paired long task is `167ms`. `perf:compare -- --scenario combat120`
now reports `6 pass, 0 warn, 2 fail` on the latest artifact: `avgFrameMs`
`17.15ms` and `maxFrameMs` `100.00ms`.

The follow-up deep-CDP attribution packet
`artifacts/perf/2026-05-07T06-46-38-609Z` writes CPU and heap profiles but is
not baseline evidence. It remains measurement-trusted and fails validation
under profiler overhead: avg `22.49ms`, peak p99 `79.80ms`, heap end-growth
`6.60MB`, heap recovery `87.5%`, and max frame `100.00ms`. Heap sidecar:
`artifacts/perf/2026-05-07T06-50-10-651Z/projekt-143-heap-sampling-attribution/summary.json`.
CPU sidecars:
`artifacts/perf/2026-05-07T06-52-40-345Z/projekt-143-cpu-profile-attribution/cpu-profile-attribution.json`
and
`artifacts/perf/2026-05-07T06-52-40-297Z/projekt-143-cpu-profile-attribution/cpu-profile-attribution.json`.
Production CPU ownership is dominated by
`three_matrix_skinning_and_scenegraph` (`67.60%`), then
`gameplay_bundle_other` (`6.70%`), `system_update_timing` (`5.63%`), and
`terrain_height_sampling` (`3.30%`). The source-shaped profile maps the next
action to close-model scenegraph/render work, combat runtime, and terrain-height
sampling. No `perf-baselines.json` refresh is authorized.
`perf:compare -- --scenario combat120` now excludes failed diagnostic captures
before auto-selecting the latest successful capture, so the compare gate still
targets `artifacts/perf/2026-05-07T06-36-34-481Z` and reports `6 pass, 0 warn,
2 fail`.

The close-model overflow-bound packet
`artifacts/perf/2026-05-07T07-00-28-388Z/projekt-143-close-model-overflow-bound/summary.json`
adds a per-update guard for repeated close-model overflow reports. The standard
combat120 artifact remains production-shaped with close GLB actors enabled and
records validation WARN with measurement trust PASS: avg `17.14ms`, peak p99
`34.50ms`, heap end-growth `-5.08MB`, heap peak-growth `29.85MB`, heap
recovery `117.0%`, visible close-NPC GLB draw-call-like `56`, and visible NPC
impostor instances `106`. `perf:compare -- --scenario combat120` now
auto-selects this artifact and fails with `6 pass, 0 warn, 2 fail` on
`avgFrameMs` `17.14ms` and `maxFrameMs` `100.00ms`. Baseline refresh remains
blocked.

The prior post-distribution max-frame attribution sidecar
`artifacts/perf/2026-05-07T09-41-19-775Z/projekt-143-max-frame-attribution/max-frame-attribution.json`
consumes the latest status-ok combat120 capture after the target-distribution
stability-bound change. The source artifact records validation WARN and
measurement trust PASS: avg `15.47ms`, peak p99 `34.30ms`, max-frame
`100.00ms`, heap end-growth `-2.30MB`, heap recovery `106.4%`, and AI budget
starvation `0.98` PASS. The first peak is sample index `5`: runtime frame-event
frame `392` at `100ms`, long task `127ms`, long-animation-frame `126.7ms`,
blocking `76.73ms`, WebGL texture-upload max `17.9ms`, and top user timing
`SystemUpdater.Combat` at `7.8ms`. The sidecar classifies the event as
`mixed_or_insufficient_attribution` with low confidence.
`perf:compare -- --scenario combat120` remains red with `6 pass, 1 warn, 1
fail`; `avgFrameMs` is WARN and `maxFrameMs` remains the failing comparison
gate. This is max-frame owner evidence only. It does not prove a fix or
authorize baseline refresh.

The prior focused max-frame trace probe
`artifacts/perf/2026-05-07T10-02-39-414Z/projekt-143-max-frame-trace-probe/trace-probe.json`
uses `perf-capture.ts --deep-cdp --trace-window-start-ms 26000
--trace-window-duration-ms 9000` to collect a lower-level trace window after
the trusted attribution packet. The capture writes `chrome-trace.json`
(`5739628` bytes, `24539` events, `9994.77ms` span), CPU profile, and heap
sampling. It is not regression evidence: validation FAIL, measurement trust
FAIL, probe average `1388.82ms`, probe p95 `1549.00ms`, avg frame `100.00ms`,
and frames >50ms `100%`. The sidecar classifies the packet as
`trace_captured_under_untrusted_deep_cdp_gpu_commit_stalls`; longest trace event
is `RunTask` `2544.94ms`, GPU-like max is `2517.15ms`, render/commit-like max
is `2513.04ms`, GC-like count is `76`, and GC-like max is `0.90ms`. The packet
separates GC from the trace-window stall class, but it does not prove a
production owner or authorize baseline refresh.

The prior trace-overhead isolation packet
`artifacts/perf/2026-05-07T10-18-11-490Z/projekt-143-trace-overhead-isolation/isolation.json`
adds `perf-capture.ts --cdp-profiler <true|false>` and
`--cdp-heap-sampling <true|false>` switches, then compares the trace-only
focused capture against an identical no-CDP control. The trace-only packet
suppresses CPU profile and heap sampling and writes `chrome-trace.json`
(`4310406` bytes, `18464` events), but it still FAILS validation and measurement
trust with probe avg `1704.13ms`, p95 `1829.00ms`, samples `15`, and avg frame
`100.00ms`. The no-CDP control also FAILS the same short/headless seed-42 shape
with probe avg `1639.11ms`, p95 `1779.00ms`, samples `18`, and avg frame
`100.00ms`. Classification is `control_capture_shape_untrusted_before_trace`.
The packet proves the short/headless trace shape is not an acceptable owner
proof chain.

The prior production-shaped trace-overhead isolation packet
`artifacts/perf/2026-05-07T10-32-39-527Z/projekt-143-trace-overhead-isolation/isolation.json`
uses headed combat120 seed `2718`, starts the focused trace at capture-window
zero, and suppresses CPU profile plus heap sampling. The trace capture writes
`chrome-trace.json` (`149320928` bytes, `704069` events, `12323.96ms` span).
Measurement trust PASSES with probe avg `19.39ms`, probe p95 `29.00ms`, and no
missed samples; runtime validation still FAILS on `9.25s` frame-progress stall
and `60.00ms` peak p99. The max-frame trace sidecar classifies
`focused_trace_only_measurement_trusted` and records the first `100ms` max
frame event at frame `22`, page time `24141.6ms`; longest trace event is
`RunTask` `163.26ms`, GPU-like max is `52.85ms`, render/commit-like max is
`1.01ms`, and GC-like max is `9.39ms`. The isolation sidecar compares against the trusted
non-trace control `artifacts/perf/2026-05-07T09-41-19-775Z`, records probe
deltas avg `+1.46ms` and p95 `+2.00ms`, and classifies
`trace_collection_overhead_not_detected`. This is owner-review evidence only:
it rules out Chrome trace collection as the measured overhead owner, but it does
not prove a runtime fix or authorize baseline refresh.

The prior production-shaped trace-boundary attribution packet
`artifacts/perf/2026-05-07T10-32-39-527Z/projekt-143-trace-boundary-attribution/boundary-attribution.json`
consumes the same trace-only capture and classifies
`runtime_combat_spike_plus_late_raf_gpu_clusters` with medium confidence.
Runtime frame events report `6` unique frames at or above `50ms`: first boundary
frame `5` at page time `23745.9ms` for `60ms`, max boundary frame `22` at
`100ms`, and `SystemUpdater.Combat` max `136.4ms` in the same observer window.
Console evidence records `[AI spike]` `133.1ms` for `combatant_12` in
`patrolling`, plus a `138.0ms` slow frame attributed to `Combat(136.4ms)`.
Chrome trace records renderer-main `FunctionCall` `161.84ms` at
`index-DgRsSaJr.js:1736:12289`, GPU command-buffer
`ThreadControllerImpl::RunTask` `52.86ms`, and trace-start
`CpuProfiler::StartProfiling` `131.33ms` isolated as trace-internal. This is
owner-review evidence only: it does not assign the minified bundle callsite to a
TypeScript source file, prove a runtime fix, or authorize baseline refresh.

The prior bundle-callsite resolution packet
`artifacts/perf/2026-05-07T10-58-00-876Z/projekt-143-bundle-callsite-resolution/callsite-resolution.json`
consumes the trace-boundary packet and resolves the renderer-main
`FunctionCall` source `index-DgRsSaJr.js:1736:12289` to the
`GameEngineLoop.animate` / `RenderMain` boundary. Vite sourcemaps are disabled
(`sourcemap: false`), the perf bundle has no `sourceMappingURL`, and no
adjacent `.map` file exists. Static resolution still matches
`dist-perf/build-assets/index-DgRsSaJr.js` (`1002733` bytes), finds `8/11`
readable minified-loop markers in the callsite window, and scores
`src/core/GameEngineLoop.ts` at `11/11` source anchors: `updateSystems`,
`timeScale.postDispatch`, atmosphere sync, GPU timing, `beginFrameStats`,
`RenderMain`, and scene render. This narrows the late renderer trace cluster to
the main-loop render boundary. It does not assign the first game-side Combat
spike to a CombatantAI method, prove a runtime fix, or authorize baseline
refresh.

The prior AI method-attribution packet
`artifacts/perf/2026-05-07T11-09-31-428Z/projekt-143-ai-method-attribution/ai-method-attribution.json`
consumes a fresh headed standard combat120 capture at
`artifacts/perf/2026-05-07T11-09-31-428Z`. The capture is status-ok, validation
WARN, and measurement-trusted; `perf:compare -- --scenario combat120` reports
`6 pass, 1 warn, 1 fail` with avg frame `15.23ms` WARN and `maxFrameMs`
`100.00ms` FAIL. Runtime samples number `88`; `82` carry
`combatBreakdown.aiMethodMs` and `16` carry `combatBreakdown.aiSlowestUpdate`.
The frame-event ring reports `3` unique >=`50ms` frames. The max boundary frame
`523` records `100ms`, but its leaders are `SystemUpdater.Combat:7.2ms`,
`SystemUpdater.Other:0.8ms`, and AI method entries only
`state.alert:0.1ms`, `state.engaging:0.1ms`. Aggregate AI method leaders are
`state.engaging:44.7ms`, `state.patrolling:32.7ms`,
`patrol.canSeeTarget:25.6ms`, and `patrol.findNearestEnemy:6.1ms`; the slowest
sampled update is `9.4ms` in `state.engaging`. No console `[AI spike]` line
reproduces. The packet classifies
`combat_ai_runtime_method_surface_captured_no_console_spike` and directs the
next max-frame packet toward non-AI browser, render, or harness-boundary
isolation before AI behavior changes.

The prior browser-boundary attribution packet
`artifacts/perf/2026-05-07T11-09-31-428Z/projekt-143-browser-boundary-attribution/browser-boundary-attribution.json`
consumes the same status-ok, measurement-trusted combat120 capture and
classifies the residual max-frame blocker as
`browser_longtask_loaf_without_instrumented_system_ai_or_webgl_owner` with high
confidence. The boundary ring reports `3` unique >=`50ms` frames. Max boundary
frame `523` records `100ms`, long task `177ms`, long-animation-frame `177.4ms`,
blocking `127.28ms`, WebGL upload `0.1ms`, top user timing
`SystemUpdater.Combat:7.2ms`, and AI method leaders `state.alert:0.1ms` and
`state.engaging:0.1ms`. Console counts are `[AI spike]` `0`, AI-budget warnings
`18`, slow frames `6`, system-budget warnings `11`, and terrain-stall signals
`21`. This is diagnostic owner evidence only. It does not prove a fix or
authorize baseline refresh; it sends the next max-frame action to focused
browser/native render-present or main-thread task-slice attribution.

The prior corrected trace-category packet
`artifacts/perf/2026-05-07T11-32-00-011Z/projekt-143-max-frame-trace-probe/trace-probe.json`
uses the focused trace-only command with CPU profiling and heap sampling
disabled. The pre-fix control at `artifacts/perf/2026-05-07T11-28-18-728Z`
still captured `CpuProfiler::StartProfiling` at `144.45ms`; `perf-capture.ts`
now excludes `disabled-by-default-v8.cpu_profiler` unless `--cdp-profiler` is
enabled. The corrected packet is measurement-trusted but validation-failed:
avg `17.03ms`, peak p99 `65.50ms`, max-frame `100ms`, heap end-growth
`2.67MB`, heap recovery `92.6%`, `46999648` trace bytes, `216933` trace events,
longest trace event `RunTask` at `29.8ms`, GC-like max `10.28ms`, GPU-like max
`3.02ms`, and no long trace-start instrumentation event. The paired
trace-boundary sidecar
`artifacts/perf/2026-05-07T11-32-00-011Z/projekt-143-trace-boundary-attribution/boundary-attribution.json`
classifies `trace_boundary_owner_unresolved`: `4` runtime frames reach or
exceed `50ms`, no console combat-AI spike reaches `50ms`, no renderer-main
RAF/FunctionCall boundary exceeds `50ms`, and no GPU command-buffer boundary
exceeds `40ms`. This proves the focused trace harness category contract; it
does not authorize baseline refresh. `perf:compare -- --scenario combat120`
currently selects the latest status-ok capture at
`artifacts/perf/2026-05-07T11-28-18-728Z` and fails with `5 pass, 1 warn, 2
fail`: avg `16.43ms` WARN, p99 `46.00ms` FAIL, and max-frame `100.00ms` FAIL.

The prior bundle-callsite resolution packet
`artifacts/perf/2026-05-07T11-45-11-238Z/projekt-143-bundle-callsite-resolution/callsite-resolution.json`
consumes the corrected trace-boundary packet and resolves the current
source-bearing renderer-main event from `rendererMainTop`. It parses
`index-BsYYgvZn.js:1736:12289`, matches `dist-perf/build-assets/index-BsYYgvZn.js`
(`1005347` bytes), records `sourcemap: false`, no `sourceMappingURL`, and no
adjacent `.map` file, then maps the bundle window to
`src/core/GameEngineLoop.ts` with `11/11` loop anchors. Classification is
`bundle_callsite_resolved_to_game_engine_loop_render_boundary` with medium
confidence. This assigns the trace bundle callsite to the `GameEngineLoop` /
`RenderMain` boundary, not directly to Combat AI state code, and it does not
authorize baseline refresh.

The prior DEFEKT-3 repeatability/max-frame packet
`artifacts/perf/2026-05-07T14-29-53-738Z/projekt-143-max-frame-attribution/max-frame-attribution.json`
consumes the fresh headed repeatability capture at
`artifacts/perf/2026-05-07T14-29-53-738Z` plus avg-frame, combat-phase,
suppression cover-cache, and suppression raycast-cost sidecars. The capture is
status-ok, validation-WARN, and measurement-trusted. It records avg `15.14ms`,
peak p99 `33.90ms`, max-frame `100.00ms`, frames >50ms `0.03%`, over-budget
`0.04%`, heap end-growth `12.61MB`, heap peak-growth `55.18MB`, and heap
recovery `77.2%`. `perf:compare -- --scenario combat120` selects this capture
and fails with `6 pass, 1 warn, 1 fail`: avg `15.14ms` WARN and max-frame
`100.00ms` FAIL. The suppression sidecar still classifies
`suppression_raycast_score_gate_reduces_raycastTerrain_under_two_search_cap`
with high confidence and records `404` score-gate skips, `100` terrain
raycasts, and raycasts per uncached search `7.51 -> 1.961`. The max-frame
sidecar classifies `browser_native_gc_or_uninstrumented_render_present` with
high confidence: first peak sample index `7`, runtime frame event `509` at
`100ms`, long task `286ms`, long-animation-frame `290.5ms`, blocking
`236.08ms`, WebGL upload max `0.1ms`, and top user timing
`SystemUpdater.Combat` at `7.8ms`. Baseline refresh remains blocked.

The prior DEFEKT-3 focused trace-boundary packet
`artifacts/perf/2026-05-07T14-38-32-797Z/projekt-143-trace-boundary-attribution/boundary-attribution.json`
consumes the headed combat120 trace-only capture at
`artifacts/perf/2026-05-07T14-38-32-797Z`, the max-frame trace probe, and the
trace-overhead isolation sidecar. The capture is status-ok, validation-WARN,
and measurement-trusted, with avg `15.52ms`, peak p99 `47.60ms`, max-frame
`100.00ms`, `81` runtime samples, and `5825` final frames.
`perf:compare -- --scenario combat120` selects this packet and fails with
`5 pass, 1 warn, 2 fail`: avg `15.52ms` WARN, p99 `47.60ms` FAIL, and max-frame `100.00ms` FAIL.
The trace probe classifies `focused_trace_only_measurement_trusted`: Chrome
trace bytes `121935286`, trace events `564184`, trace span `12336.68ms`, first
>50ms runtime frame `5` at `63ms`, max runtime frame `494` at `100ms`, longest
trace event `RunTask` `31.53ms`, GPU-like max `4.09ms`,
render/commit-like max `0.58ms`, and GC-like max `10.72ms`. The isolation
sidecar records trace-vs-control probe avg/p95 deltas `0.86ms/2.00ms` against
`artifacts/perf/2026-05-07T14-29-53-738Z` and classifies
`trace_collection_overhead_not_detected`. Boundary attribution remains
`trace_boundary_owner_unresolved`: no >=50ms renderer-main RAF/FunctionCall
trace slice, no >=40ms GPU command-buffer slice, and no exact runtime/trace
clock identity. This is owner-review evidence only. It does not authorize a
baseline refresh.

The prior DEFEKT-3 bundle-callsite resolution packet
`artifacts/perf/2026-05-07T14-38-32-797Z/projekt-143-bundle-callsite-resolution/callsite-resolution.json`
consumes that trace-boundary packet and resolves the source-bearing
renderer-main `FunctionCall`. It parses `index-BLeRv-jb.js:1736:12289`, matches
`dist-perf/build-assets/index-BLeRv-jb.js` (`1011535` bytes), records
`sourcemap: false`, no `sourceMappingURL`, no adjacent `.map`, and `8/11`
readable minified-loop markers. Static anchor scoring maps the callsite window
to `src/core/GameEngineLoop.ts` with `11/11` source anchors and classifies
`bundle_callsite_resolved_to_game_engine_loop_render_boundary` with medium
confidence. This is owner-review evidence only. It assigns the traced
renderer-main boundary to `GameEngineLoop` / `RenderMain`, not directly to a
Combat AI TypeScript callsite, and it does not authorize baseline refresh.

The prior DEFEKT-3 render-boundary timing packet
`artifacts/perf/2026-05-07T14-53-44-437Z/projekt-143-render-boundary-timing/render-boundary-timing.json`
consumes a standard headed combat120 capture plus the prior callsite packet.
The capture is status-ok, validation-WARN, and measurement-trusted: avg
`16.82ms`, peak p99 `34.50ms`, max-frame `100.00ms`, heap end-growth `10.99MB`,
heap recovery `62.5%`, and `88` runtime samples. `perf:compare -- --scenario
combat120` selects this capture and fails with `6 pass, 1 warn, 1 fail`: avg
WARN and max-frame FAIL. The peak sample records frame `37` at `100ms`, long
task `120ms`, long-animation-frame `121.20ms`, blocking `71.12ms`, WebGL upload
max `0.10ms`, and peak-sample `GameEngineLoop.RenderMain.renderer.render` max
`116.10ms`. Cumulative `renderer.render` timing records count `5391`, total
`53128.10ms`, mean `9.855ms`, and max `308.90ms`. The packet classifies
`render_main_renderer_render_user_timing_contains_peak_longtask` with high
confidence. This is render-call owner evidence only. It does not split native
driver, GPU present, or browser GC internals, prove a runtime fix, or authorize
baseline refresh.

The prior DEFEKT-3 render-present subdivision packet
`artifacts/perf/2026-05-07T15-12-59-293Z/projekt-143-render-present-subdivision/render-present-subdivision.json`
consumes a fresh standard headed combat120 capture and the same-capture
render-boundary packet. The capture is status-ok, validation-WARN, and
measurement-trusted: avg `15.87ms`, peak p99 `34.00ms`, max-frame `100.00ms`,
heap end-growth `2.60MB`, heap recovery `91.1%`, and `88` runtime samples.
`perf:compare -- --scenario combat120` selects this capture and fails with `6
pass, 1 warn, 1 fail`: avg WARN and max-frame FAIL. The peak sample records
frame `1062` at `100ms`, long task `194ms`, long-animation-frame `193.80ms`,
blocking `143.80ms`, WebGL upload max `0.10ms`, and peak-sample
`GameEngineLoop.RenderMain.renderer.render` max `185.40ms`. The peak LoAF
records timing and script detail: script total `193.00ms`, script share
`0.9959`, forced style/layout `0ms`, render tail after scripts `0.80ms`, and
top script `FrameRequestCallback` in `build-assets/index-CLD_euaE.js` at source
char `993470`. The packet classifies
`loaf_script_window_dominates_renderer_render_boundary` with high confidence.
This is owner-review evidence only. It does not prove a runtime fix, split the
minified callback into source owners, or authorize baseline refresh.

The prior DEFEKT-3 RAF callback source-resolution packet
`artifacts/perf/2026-05-07T15-12-59-293Z/projekt-143-raf-callback-source-resolution/raf-callback-source-resolution.json`
consumes the same source artifact through the render-present sidecar. It maps
the LoAF `FrameRequestCallback` at `build-assets/index-CLD_euaE.js` char
`993470` to bundle line `1736`, column `12524`, enclosing scheduler `Nk`, and
target frame function `Pk`. The target window carries `18/18` loop markers,
including `requestAnimationFrame`, `updateSystems`, `RenderMain.renderer.render`,
`RenderOverlay.weapon`, `RenderOverlay.grenade`, and
`RenderOverlay.postProcessing.endFrame`. Static source scoring resolves
`13/13` anchors to `src/core/GameEngineLoop.ts`, including the RAF scheduler,
`animate`, `updateSystems`, `RenderMain.renderer.render`, and overlay render
anchors. The packet classifies
`raf_callback_resolved_to_game_engine_loop_animate_render_main` with high
confidence. This is owner-review evidence only. It does not prove a runtime
fix, split Three.WebGLRenderer internals, or authorize baseline refresh.

The prior DEFEKT-3 render scene-category subdivision packet
`artifacts/perf/2026-05-07T15-12-59-293Z/projekt-143-render-scene-category-subdivision/render-scene-category-subdivision.json`
consumes the same source artifact plus the render-boundary, render-present, and
RAF source-resolution sidecars. It records peak sample `14`, frame `1062` at
`100ms`, renderer draw calls `219`, renderer triangles `300319`,
`GameEngineLoop.RenderMain.renderer.render` max `185.40ms`, long task `194ms`,
LoAF `193.80ms`, and WebGL upload `0.10ms`. The post-sample scene census
records `115` visible draw-call-like entries and `104312` visible triangles,
reconciling only `0.5251` of peak renderer draw calls and `0.3473` of peak
renderer triangles. Terrain leads visible triangles at `0.5105` share;
`npc_close_glb` leads visible draw-call-like entries at `0.487` share;
unattributed visible draw share is `0.2261`. The packet classifies
`renderer_render_category_timing_gap_static_scene_census_only` with high
confidence. This is owner-review evidence only. It does not prove a runtime
fix, assign the stall to one render category, split Three.WebGLRenderer
internals, or authorize baseline refresh.

The current DEFEKT-3 render runtime category-attribution packet
`artifacts/perf/2026-05-07T15-50-09-399Z/projekt-143-render-runtime-category-attribution/render-runtime-category-attribution.json`
consumes a fresh headed combat120 capture with
`--runtime-scene-attribution true --runtime-scene-attribution-every-samples 2`
plus the static scene-category sidecar. The source capture is status `ok`,
validation `warn`, measurement trust PASS, avg `16.36ms`, p99 `45.00ms`,
max-frame `100.00ms`, heap end-growth `13.37MB`, and heap recovery `62.1%`.
`perf:compare -- --scenario combat120` selects it and fails with
`5 pass, 1 warn, 2 fail`: avg-frame WARN, p99 FAIL, and max-frame FAIL. The packet records
`88` runtime samples, `44` runtime scene-attribution samples, peak sample `26`,
frame `2029` at `100ms`, renderer draw calls `275`, renderer triangles
`290782`, `GameEngineLoop.RenderMain.renderer.render` max `65.80ms`, long task
`143ms`, LoAF `142.70ms`, and WebGL upload `17.30ms`. Same-sample runtime scene
census records `115` visible draw-call-like entries, `125398` visible
triangles, and `6868` visible instances, reconciling only `0.4182` of sampled
renderer draw calls and `0.4312` of sampled renderer triangles. Terrain leads
visible triangles at `0.588` share; `npc_close_glb` leads visible draw-call-like
entries at `0.487` share; `vegetation_imposters` leads visible instances at
`0.9525` share; unattributed visible draw share is `0.2261`. The packet
classifies `runtime_renderer_category_candidates_diverge_and_counters_remain_partial`
with high confidence. This is owner-review evidence only. It does not prove a
runtime fix, assign the stall to one render category, split Three.WebGLRenderer
internals, or authorize baseline refresh.

The latest DEFEKT-3 render submission category-attribution packet
`artifacts/perf/2026-05-07T16-23-11-889Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`
consumes a fresh headed combat120 capture with
`--runtime-render-submission-attribution true --runtime-render-submission-every-samples 30`
plus the opt-in category-tagged submission tracker. The source capture is
status `ok`, validation `warn`, measurement trust PASS, avg `17.31ms`, p99
`34.40ms`, max-frame `100.00ms`, heap end-growth `21.48MB`, and heap recovery
`58.7%`. `perf:compare -- --scenario combat120` selects it and fails with
`6 pass, 0 warn, 2 fail`: avg-frame FAIL and max-frame FAIL. The packet records
`88` runtime samples, `3` render-submission drain samples, peak sample `16`,
frame `1123` at `100ms`, renderer draw calls `256`, renderer triangles
`245656`, `GameEngineLoop.RenderMain.renderer.render` max `223.70ms`, long task
`230ms`, LoAF `231.70ms`, and WebGL upload `0.20ms`. The exact peak submission
frame records `132` draw submissions, `181270` triangles, and `13586`
instances, reconciling only `0.5156` of sampled renderer draw calls and
`0.7379` of sampled renderer triangles. `unattributed` leads draw submissions
at `0.3106` share, `npc_close_glb` follows at `0.2727`, `npc_imposters` follows
at `0.2424`, terrain leads triangles at `0.6101`, and
`vegetation_imposters` leads instances at `0.9591`. The packet classifies
`render_submission_category_candidates_diverge_at_peak_frame` with high
confidence. This is owner-review evidence only. It does not prove a runtime
fix, assign the stall to one render category, fully reconcile Three.WebGLRenderer
counters, or authorize baseline refresh.

The latest DEFEKT-3 source-shape corroboration packet
`artifacts/perf/2026-05-07T16-32-55-557Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`
uses the same render-submission tracker with exact-frame examples retained and
`--runtime-render-submission-every-samples 60`. The source capture is status
`ok`, validation `warn`, measurement trust WARN, avg `16.60ms`, p99 `34.10ms`,
max-frame `100.00ms`, heap end-growth `16.96MB`, and heap recovery `55.6%`.
`perf:compare -- --scenario combat120` selects this latest status-ok capture
and fails with `6 pass, 1 warn, 1 fail`: avg-frame WARN and max-frame FAIL.
The packet records `88` runtime samples, `2` render-submission drain samples,
peak sample `16`, frame `1158` at `100ms`, renderer draw calls `214`,
renderer triangles `296354`, `GameEngineLoop.RenderMain.renderer.render` max
`179.70ms`, long task `184ms`, LoAF `184.30ms`, and WebGL upload `0.10ms`.
The exact peak submission frame records `117` draw submissions, `219310`
triangles, and `13549` instances, reconciling only `0.5467` of sampled renderer
draw calls and `0.7400` of sampled renderer triangles. `unattributed` leads
draw submissions at `0.2991` share, terrain leads triangles at `0.6910`, and
`vegetation_imposters` leads instances at `0.9589`. The exact-frame
`unattributed` examples are unnamed `MeshBasicMaterial` meshes with no
`modelPath`. This is corroborating evidence only because measurement trust is
WARN. It moves the next isolation axis to missing perf-category tagging or
missing render-pass attribution; it does not replace the measurement-PASS owner
packet, prove a runtime fix, or authorize baseline refresh.

The current DEFEKT-3 unattributed render source audit
`artifacts/perf/2026-05-07T16-32-55-557Z/projekt-143-unattributed-render-source-audit/unattributed-render-source-audit.json`
consumes the source-shape packet and classifies
`combatant_ground_marker_attribution_gap` with WARN status and medium
confidence. The exact-frame unattributed examples are `MeshBasicMaterial`
meshes with no `modelPath`, and all four retained examples compute to `32`
triangles per instance. The top source candidate is
`src/systems/combat/CombatantMeshFactory.ts:418` with score `120`: the NPC
ground marker uses `RingGeometry(1.8, 3.0, 16)`, `MeshBasicMaterial`, and
`InstancedMesh`, computes to `32` triangles per instance, and has no local
`perfCategory` tag or stable `name`; `CombatantRenderer.ts` writes marker
matrices at line `1360` and marker counts at line `1392`. This is source
ownership evidence only. It does not prove a runtime fix, assign the full
`renderer.render` stall to combatant markers, complete DEFEKT-3, or authorize
baseline refresh.

The current DEFEKT-3 ground-marker tagging proof attempt
`artifacts/perf/2026-05-07T17-11-26-382Z/projekt-143-ground-marker-tagging-proof/ground-marker-tagging-proof.json`
uses a rebuilt `dist-perf` bundle after tagging the NPC ground-marker
InstancedMesh with stable name `PixelForgeNpcGroundMarker.${key}` and
`userData.perfCategory = 'npc_ground_markers'`. The low-drain rebuilt combat120
capture `artifacts/perf/2026-05-07T17-11-26-382Z` is status `ok`, validation
`warn`, measurement trust WARN, avg `18.28ms`, p99 `34.00ms`, max-frame
`100.00ms`, heap end-growth `22.52MB`, and heap recovery `70.5%`. The proof
packet compares the pre-tag source-shape packet against the rebuilt post-tag
packet: `unattributed` draw share moves `0.2991 -> 0.0609`,
`npc_ground_markers` appears at `0.1624` draw share, with `32` draw
submissions, `222` instances, and `7552` triangles, but classifies
`ground_marker_tagging_not_proven` with low confidence. The post-tag
render-submission packet still classifies
`render_submission_category_candidates_diverge_at_peak_frame` with low
confidence because the measurement path is WARN; top draw candidate is now
`npc_close_glb` at `0.4619`, top triangle candidate remains terrain at
`0.6452`, and `GameEngineLoop.RenderMain.renderer.render` max is `15.90ms`.
`perf:compare -- --scenario combat120` selects this artifact and fails with
`6 pass, 0 warn, 2 fail`: avg FAIL and max-frame FAIL. The prior positive
post-tag diagnostic proof remains
`artifacts/perf/2026-05-07T17-03-50-248Z/projekt-143-ground-marker-tagging-proof/ground-marker-tagging-proof.json`.
It does not complete DEFEKT-3, prove a runtime performance fix, promote the
post-tag packet over the measurement-PASS owner packet, or authorize baseline
refresh.

The current DEFEKT-3 measurement-path inspection packet
`artifacts/perf/2026-05-07T17-19-54-240Z/projekt-143-measurement-path-inspection/measurement-path-inspection.json`
uses a standard headed post-tag render-submission attribution capture after
`perf-capture.ts` began persisting raw `probeRoundTripSamplesMs`. The capture
is status `failed`, validation FAIL, and measurement trust FAIL, so it is not a
baseline or owner-proof candidate. It is KB-METRIK evidence: raw probe samples
number `78`, min `105ms`, p50 `156ms`, p95 `218ms`, max `226ms`, and `78/78`
samples exceed `75ms`; `runtime-render-submission-samples.json` writes
`59000325` bytes. Classification is
`per_sample_render_submission_probe_overhead_captured` with high confidence.
Do not use per-sample render-submission drain as the next proof shape. The next
owner-proof attempt should use sparse render-submission attribution with raw
probe persistence, then classify measurement trust before interpreting
draw/triangle ownership.

The current sparse DEFEKT-3 render-submission packet
`artifacts/perf/2026-05-07T17-28-02-506Z/projekt-143-ground-marker-tagging-proof/ground-marker-tagging-proof.json`
uses `runtimeRenderSubmissionEverySamples=30` and `detailEverySamples=2` with
raw probe persistence. It is status `ok`, validation WARN, and measurement trust
WARN: avg `16.19ms`, p99 `34.20ms`, max-frame `100.00ms`, heap end-growth
`6.51MB`, and heap recovery `86.2%`. The paired measurement-path packet records
raw probe p50 `21ms`, p95 `30ms`, avg `28.93ms`, max `348ms`, `3/87` probes
over `75ms`, and `3505993` render-submission bytes. The render-submission
packet captures exact peak frame `1027`; top draw candidate is
`npc_ground_markers` at `0.3232`, top triangle candidate is terrain at `0.7174`,
draw reconciliation is `0.4583`, triangle reconciliation is `0.7276`, and
`GameEngineLoop.RenderMain.renderer.render` max is `181.00ms`. The
ground-marker proof moves `unattributed` draw share `0.2991 -> 0.0202` and
records `32` marker draw submissions, `224` instances, and `7680` triangles.
This strengthens post-tag owner evidence but remains diagnostic until formal
measurement trust clears or a sparse-owner acceptance rule is explicitly
adopted.

The current avg-frame attribution sidecar
`artifacts/perf/2026-05-07T07-27-02-293Z/projekt-143-avg-frame-attribution/avg-frame-attribution.json`
uses the same rebuilt trusted standard capture and classifies the residual avg
warning as `late_combat_phase_cpu_pressure_not_renderer_or_terrain_stream_growth`.
Average frame time rises `13.15ms -> 18.44ms` from early to late capture windows
while draw calls fall `212.83 -> 191.63`, Combat total rises `4.60ms -> 5.94ms`,
AI rises `3.42ms -> 4.51ms`, shots rise `0 -> 435`, and terrain stream max
stays `0.04ms`. This is avg-frame owner evidence only. It does not prove a fix
or authorize baseline refresh.

The current combat-phase attribution sidecar
`artifacts/perf/2026-05-07T07-27-02-293Z/projekt-143-combat-phase-attribution/combat-phase-attribution.json`
uses the same trusted capture and narrows the owner to
`late_close_engagement_pressure_not_renderer_or_movement_volume`. Average frame
time rises `13.15ms -> 18.44ms`, current target distance falls
`15.49m -> 8.20m`, nearest OPFOR distance falls `14.96m -> 8.18m`, shots delta
rises `0 -> 259`, damage-taken delta rises `317.62 -> 1941.51`, draw calls
fall `212.83 -> 191.63`, and NPC movement sample delta falls
`218826 -> 170988`. This is combat-phase owner evidence only. It does not prove
a fix or authorize baseline refresh.

The current close-engagement source audit
`artifacts/perf/2026-05-07T07-56-12-331Z/projekt-143-close-engagement-source-audit/source-audit.json`
consumes the combat-phase sidecar and ranks current source owners for the next
DEFEKT-3 packet. It ranks `AIStateEngage.ts` first for the close-range engage
ladder, `AILineOfSight.ts` second for LOS miss pressure, and
`AITargetAcquisition.ts` plus `ClusterManager.ts` third for close-contact target
distribution. Existing tests cover close full-auto behavior, nearby-enemy burst
behavior, suppression transition, LOS heightfield prefilter, and target
distribution primitives. They do not prove combat120 perf ownership. The next
instrumentation must add runtime counters for close-range full-auto activations,
nearby-enemy burst triggers, suppression transitions, target-distance buckets,
and LOS miss/full-raycast/cache outcomes before tuning or baseline refresh.

The current close-engagement counter-bearing combat120 packet
`artifacts/perf/2026-05-07T08-18-45-389Z/projekt-143-close-engagement-counter-packet/counter-packet.json`
supersedes the source-only counter packet. The first post-counter capture was
rejected for counter evidence because stale `dist-perf` omitted
`combatBreakdown.closeEngagement`; after `npm run build:perf`, the trusted
capture recorded 88/88 runtime samples with close-engagement counters. The
capture is validation WARN with measurement trust PASS: avg `16.38ms`, peak p99
`34.20ms`, heap end-growth `33.25MB` WARN, heap recovery `30.3%` WARN.
`perf:compare -- --scenario combat120` remains FAIL with 5 pass, 2 warn, 1
fail; `maxFrameMs` remains `100.00ms`. The sidecar records full-window and
early/middle/late deltas before any tuning or baseline refresh.

The current close-engagement owner-attribution packet
`artifacts/perf/2026-05-07T08-29-10-043Z/projekt-143-close-engagement-owner-attribution/owner-attribution.json`
consumes the counter-bearing packet and classifies the remaining path as
`target_acquisition_distribution_fanout_with_los_execution_cost`. It ranks
`AILineOfSight.ts` first and `ClusterManager.ts` second by late-phase marker
pressure. Late-window avg frame remains `19.15ms`; LOS markers rise
`6855 -> 11044`, target-distribution markers rise `3012 -> 7131`,
target-acquisition markers fall `7710 -> 6408`, and engage markers fall
`2546 -> 2081`. This is owner evidence only, not fix evidence or baseline
authority.

The current LOS/distribution separation packet
`artifacts/perf/2026-05-07T08-39-12-950Z/projekt-143-los-distribution-separation/separation.json`
consumes the owner-attribution packet and classifies the path as
`coupled_distribution_scheduling_with_separate_los_execution`. Source anchors
show `AITargetAcquisition.ts` and `ClusterManager.ts` do not call LOS directly;
`AILineOfSight.ts` and state handlers carry LOS execution. Early/middle/late
distribution scheduling deltas are `3012/4658/7131`; LOS execution deltas are
`6855/7889/11044`; late LOS full evaluations per distribution call are
`1.174`; `losExecutionVsDistributionSchedulingDelta` correlation is `0.871`.
This is separation evidence only, not a performance fix or baseline authority.

The target-distribution stability-bound packet
`artifacts/perf/2026-05-07T09-43-39-502Z/projekt-143-target-distribution-stability-bound/target-distribution-stability-bound.json`
binds the source change in `ClusterManager.ts`, targeted ClusterManager/patrol/AI
tests, the follow-up callsite packet, and the follow-up measurement-trusted
capture at `artifacts/perf/2026-05-07T09-41-19-775Z`. The source change holds a
still-valid distributed target for `500ms`. Late-window assignment churn moves
`4016 -> 425`, `patrolDetection` moves `3947 -> 674`, LOS full evaluations move
`5202 -> 1655`, and late-window avg frame moves `19.92ms -> 17.22ms`. The
post-change capture records validation WARN, avg `15.47ms`, peak p99 `34.30ms`,
max-frame `100.00ms`, heap end-growth `-2.30MB`, heap recovery `106.4%`, and
measurement trust PASS. `perf:compare -- --scenario combat120` reports `6 pass,
1 warn, 1 fail`; `avgFrameMs` is WARN and `maxFrameMs` remains FAIL.

The prior post-distribution max-frame attribution packet
`artifacts/perf/2026-05-07T09-41-19-775Z/projekt-143-max-frame-attribution/max-frame-attribution.json`
consumes the same combat120 capture and records first peak sample index `5`,
runtime frame-event frame `392` at `100ms`, long task `127ms`,
long-animation-frame `126.7ms`, blocking `76.73ms`, WebGL texture-upload max
`17.9ms`, and top user timing `SystemUpdater.Combat` at `7.8ms`. Classification
is `mixed_or_insufficient_attribution` with low confidence. The next bounded
packet is a focused CDP trace/render-present/GC probe around this frame
boundary; baseline refresh remains blocked.

## Build targets

Three Vite build targets exist, differing only in whether the perf-harness
diagnostic hooks are compiled in:

| Target | Command | Output | Harness surface | Use |
|--------|---------|--------|-----------------|-----|
| dev    | `npm run dev`        | — (HMR server) | yes   | Local development and live iteration |
| retail | `npm run build`      | `dist/`        | no    | What ships to Cloudflare Pages |
| perf   | `npm run build:perf` | `dist-perf/`   | yes   | Prod-shape bundle measured by perf captures |

The `perf` target is the retail build plus the diagnostic hooks the harness
drives (`window.__engine`, `window.__metrics`, `window.advanceTime`,
`window.combatProfile`, `window.perf`, etc.). `VITE_PERF_HARNESS=1` is set at
build time; Vite constant-folds `import.meta.env.VITE_PERF_HARNESS === '1'`,
so retail builds dead-code-eliminate the hook branches.

Retail and perf builds do not emit `.gz` or `.br` sidecar files. Cloudflare
Pages handles visitor-facing compression for JavaScript, CSS, JSON, fonts, and
WASM, so local build artifacts and deploy uploads stay limited to canonical
assets.

Why measure the `perf` build instead of `dev`:

- Fidelity. Minification, tree-shaking, and chunk splitting change both code
  shape and frame cost. Numbers from a dev bundle overstate production work
  per frame.
- Stability. Vite's dev HMR websocket has been observed to rot under repeated
  headless captures ("send was called before connect"). The preview-served
  bundle is stateless.

Why not measure the `retail` bundle directly: the harness driver needs the
diagnostic globals to coordinate warmup, read frame metrics, and inspect
combat state. The `perf` bundle keeps everything else identical.

`perf:capture` and `fixed-wing-runtime-probe` default to the `perf` target.
Use `--server-mode dev` to debug against source maps; use
`--server-mode retail` if you want to preview the ship bundle (the capture
driver will time out waiting for `__engine`, which is the point — it proves
retail has zero harness surface).

## Commands

```bash
npm run build:perf                  # Build the perf-harness bundle to dist-perf/
npm run preview:perf                # Preview dist-perf/ (harness-ready preview)
npm run perf:capture                # Default headed capture
npm run perf:capture:headless       # Headless capture
npm run perf:capture:combat120      # 120 NPC combat stress test
npm run perf:capture:zonecontrol    # Zone control scenario
npm run perf:capture:teamdeathmatch # TDM scenario
npm run perf:capture:openfrontier:short  # Open Frontier short
npm run perf:capture:ashau:short    # A Shau short
npm run perf:capture:frontier30m    # 30-minute soak test
npm run perf:grenade-spike          # KB-EFFECTS grenade first-use probe
npm run perf:quick                  # Quick smoke (not a baseline)
npm run perf:compare                # Compare latest vs tracked baselines
npm run perf:compare:strict         # Same compare, but fail on warnings too
npm run perf:update-baseline        # Update baselines from latest capture
npm run perf:analyze:latest         # Analyze most recent artifacts
npm run perf:startup:openfrontier   # Production startup benchmark
npm run check:pixel-forge-optics    # KB-OPTIK imposter optics audit
npm run check:vegetation-horizon    # KB-TERRAIN vegetation horizon audit
npm run check:webgpu-strategy       # KB-STRATEGIE WebGL/WebGPU audit
npm run check:projekt-143-platform-capabilities # KB-STRATEGIE guarded browser platform probe
npm run check:projekt-143           # Cycle 0 static evidence suite
npm run check:projekt-143-cycle1-bundle -- <artifact dirs>  # Cycle 1 benchmark bundle sidecars
npm run check:projekt-143-culling-proof  # Cycle 2 headed renderer/category proof
npm run check:projekt-143-culling-baseline # Cycle 3 culling owner-path before packet
npm run check:projekt-143-terrain-baseline # Cycle 3 elevated horizon screenshot/perf-before proof
npm run check:projekt-143-terrain-distribution # Ground material/vegetation distribution audit
npm run check:projekt-143-terrain-placement # Terrain feature footprint/foundation audit
npm run check:projekt-143-terrain-assets # Terrain texture/foliage/building candidate inventory
npm run check:projekt-143-terrain-routes # Route/trail smoothing and surface policy audit
npm run check:projekt-143-cycle2-proof  # Cycle 2 visual/runtime proof status
npm run check:projekt-143-cycle3-kickoff # Cycle 3 remediation readiness matrix
npm run check:projekt-143-optik-decision # KB-OPTIK NPC/vehicle scale decision packet
npm run check:projekt-143-optik-expanded # KB-OPTIK expanded lighting/gameplay-camera proof
npm run check:projekt-143-vegetation-normal-proof # KB-LOAD/OPTIK vegetation normal-map A/B proof
npm run check:projekt-143-load-branch # KB-LOAD next texture branch selector
npm run check:projekt-143-pixel-forge-vegetation-readiness # KB-LOAD Pixel Forge selected-branch readiness audit
npm run check:projekt-143-max-frame-attribution -- --artifact <artifact dir> # DEFEKT-3 max-frame owner sidecar
npm run check:projekt-143-max-frame-trace-probe -- --artifact <artifact dir> # DEFEKT-3 focused max-frame CDP trace sidecar
npm run check:projekt-143-trace-overhead-isolation -- --trace <artifact dir> --control <artifact dir> # DEFEKT-3 trace/control trust packet
npm run check:projekt-143-trace-boundary-attribution -- --artifact <artifact dir> # DEFEKT-3 runtime/trace boundary attribution
npm run check:projekt-143-bundle-callsite-resolution -- --artifact <artifact dir> # DEFEKT-3 bundle callsite source-resolution packet
npm run check:projekt-143-render-boundary-timing -- --artifact <artifact dir> # DEFEKT-3 render-boundary user-timing packet
npm run check:projekt-143-render-present-subdivision -- --artifact <artifact dir> # DEFEKT-3 LoAF render-present subdivision packet
npm run check:projekt-143-raf-callback-source-resolution -- --artifact <artifact dir> # DEFEKT-3 RAF callback source-resolution packet
npm run check:projekt-143-render-scene-category-subdivision -- --artifact <artifact dir> # DEFEKT-3 render scene-category subdivision packet
npm run check:projekt-143-render-runtime-category-attribution -- --artifact <artifact dir> # DEFEKT-3 runtime render-category attribution packet
npm run check:projekt-143-render-submission-category-attribution -- --artifact <artifact dir> # DEFEKT-3 render-submission category attribution packet
npm run check:projekt-143-measurement-path-inspection -- --artifact <artifact dir> # DEFEKT-3 measurement path raw-probe inspection
npm run check:doc-drift -- --as-of YYYY-MM-DD # DEFEKT-2 doc/code/artifact reference drift gate
npm run check:projekt-143-stale-baseline-audit -- --as-of YYYY-MM-DD # DEFEKT-1 tracked-baseline eligibility audit
npm run check:projekt-143-svyaz-neutral-command # SVYAZ-1 neutral-command source/test audit
npm run check:projekt-143-ux-respawn # UX-1 respawn/deploy source/test audit
npm run check:projekt-143-ux-respawn-browser # UX-1 respawn/deploy desktop/mobile browser proof
npm run check:projekt-143-arkhiv-supporting-docs # ARKHIV-1 supporting-doc disposition audit
npm run check:projekt-143-arkhiv-backlog-consolidation # ARKHIV-2 backlog consolidation audit
npm run check:projekt-143-arkhiv-spike-memos # ARKHIV-3 spike memo ref/fold audit
npm run check:projekt-143-dizayn-vision-charter # DIZAYN-1 charter surface audit
npm run check:projekt-143-dizayn-art-direction-gate # DIZAYN-2 art-direction gate audit
npm run check:projekt-143-aviatsiya-helicopter-parity # AVIATSIYA-3 helicopter parity memo audit
npm run check:projekt-143-ai-method-attribution -- --artifact <artifact dir> # DEFEKT-3 AI method timing attribution
npm run check:projekt-143-cover-search-attribution -- --artifact <artifact dir> # DEFEKT-3 cover-search internal timing attribution
npm run check:projekt-143-cover-raycast-cadence -- --artifact <artifact dir> # DEFEKT-3 cover-search raycast cadence
npm run check:projekt-143-cover-cache-locality -- --artifact <artifact dir> # DEFEKT-3 cover-cache caller locality review
npm run check:projekt-143-suppression-cover-cache -- --artifact <artifact dir> # DEFEKT-3 suppression cover-cache skip attribution review
npm run check:projekt-143-suppression-raycast-cost -- --artifact <artifact dir> # DEFEKT-3 suppression raycast-cost review
npm run check:projekt-143-browser-boundary-attribution -- --artifact <artifact dir> # DEFEKT-3 browser boundary attribution
npm run check:projekt-143-avg-frame-attribution -- --artifact <artifact dir> # DEFEKT-3 avg-frame owner sidecar
npm run check:projekt-143-combat-phase-attribution -- --artifact <artifact dir> # DEFEKT-3 combat-phase owner sidecar
npm run check:projekt-143-close-engagement-source-audit -- --combat-phase <sidecar json> # DEFEKT-3 source-owner audit
npm run check:projekt-143-close-engagement-counter-packet # DEFEKT-3 counter instrumentation packet
npm run check:projekt-143-close-engagement-owner-attribution # DEFEKT-3 counter-bearing owner attribution
npm run check:projekt-143-los-distribution-separation # DEFEKT-3 LOS/distribution separation
npm run check:projekt-143-los-callsite-cadence # DEFEKT-3 LOS state-handler callsite cadence
npm run check:projekt-143-engage-suppression-cadence-bound # DEFEKT-3 engage-suppression cadence before/after packet
npm run check:projekt-143-patrol-detection-cadence-bound # DEFEKT-3 patrol-detection cadence before/after packet
npm run check:projekt-143-seeking-cover-cadence-bound # DEFEKT-3 seeking-cover cadence before/after packet
npm run check:projekt-143-target-distribution-stability-bound # DEFEKT-3 target-distribution stability before/after packet
```

Startup UI benchmarks are retail-build measurements, not perf-harness frame
captures. They measure operator-visible phases from title screen through
deploy and playable HUD, and they are useful for KB-LOAD mode-entry evidence.
They do not write `measurement-trust.json`, do not expose per-frame runtime
samples, and do not replace `perf-capture.ts` for steady-state frame claims.

## Scenarios

| Scenario | Mode | Duration | NPCs | Purpose |
|----------|------|----------|-----:|---------|
| `combat120` | AI Sandbox | 90s | 120 | Combat stress, primary regression target |
| `openfrontier:short` | Open Frontier | 180s | 120 | Terrain + draw call pressure |
| `ashau:short` | A Shau Valley | 180s | 60 | Strategy stack + heap peaks |
| `frontier30m` | Open Frontier | 30min | 120 | Long-tail stability soak |
| `zonecontrol` | Zone Control | 120s | 60 | Small-map gameplay |
| `teamdeathmatch` | TDM | 120s | 80 | Kill-race scenario |

Tracked baselines: `combat120`, `openfrontier:short`, `ashau:short`, `frontier30m`.

`frontier30m` uses perf-harness-only URL overrides from `scripts/perf-capture.ts`:
`perfMatchDuration=3600` keeps Open Frontier in its combat phase for the full
capture window, and `perfDisableVictory=1` prevents time-limit, ticket, or
total-control victory screens from turning the second half into a menu soak.
These overrides are gated to dev/perf-harness builds and do not ship in the
retail build path.

## Environment Variables

```bash
PERF_MODE=ai_sandbox|zone_control|team_deathmatch|open_frontier|a_shau_valley
PERF_DURATION=<seconds>     PERF_WARMUP=<seconds>     PERF_NPCS=<count>
PERF_COMBAT=1|0             PERF_ACTIVE_PLAYER=1|0    PERF_PORT=<port>
PERF_DEEP_CDP=1|0           PERF_PREWARM=1|0          PERF_SAMPLE_INTERVAL_MS=<ms>
```

## Capture Environment Discipline

Headed perf captures now launch Chromium with a fixed `1920x1080` viewport,
`--window-position=0,0`, `--window-size=1920,1080`, and
`--force-device-scale-factor=1` / `deviceScaleFactor: 1`. This is intended to
avoid the owner-reported multi-monitor span contaminating frame-time and
compositor behavior.

Do not refresh baselines or accept Projekt performance evidence while another
browser game, browser-test agent, SDS repo overnight agent, or asset bake is
active on the same device. Before any headed or GPU-heavy capture, do a
lightweight process/resource check for browser, Node, and Bun workloads. If the
same stale resource-consuming processes remain after roughly three hours, clean
them up before resuming resource-heavy Projekt work, then run one final process
check before capture.

## Artifacts

Each run writes to `artifacts/perf/<timestamp>/`:

| File | Contents |
|------|----------|
| `summary.json` | Pass/warn/fail result, frame timing stats |
| `validation.json` | Gate results (combat, heap, hitches) |
| `measurement-trust.json` | Harness self-certification from probe round-trip, missed samples, and sample presence |
| `scene-attribution.json` | Post-sample scene census by approximate asset/system category |
| `runtime-samples.json` | Per-sample frame timing, heap, renderer.info, system timing |
| `movement-artifacts.json` | Occupancy cells, hotspots, sampled tracks |
| `movement-terrain-context.json` | Gameplay surface context for viewer |
| `movement-viewer.html` | Self-contained terrain-relative movement viewer |
| `startup-timeline.json` | Boot phase timing |
| `console.json` | Console messages captured during run |
| `final-frame.png` | Screenshot at end of capture |

Optional deep artifacts: `cpu-profile.cpuprofile`, `heap-sampling.json`, `chrome-trace.json`.

`perf-startup-ui.ts` writes its own retail startup artifacts under
`artifacts/perf/<timestamp>/startup-ui-<mode>/`: `summary.json`,
`startup-marks.json`, `browser-stalls.json`, `console.json`, and
`cpu-profile-iteration-N.cpuprofile`. Treat those artifacts as startup and
UI-readiness evidence only. `browser-stalls.json` also includes diagnostic
WebGL texture-upload attribution during startup UI runs; those wrapped WebGL
calls are useful for asset ownership, but the resulting run is not an
uncontaminated frame-time baseline. `summary.json` repeats the compact upload
metrics as median/p95 aggregates and carries `webglUploadSummary.largestUploads`
with relative asset paths, dimensions, sample counts, and max upload durations
so Projekt KB-LOAD can name current residency targets without digging into raw
observer output.

For KB-LOAD candidate proof runs, `perf-startup-ui.ts` also supports
`--disable-vegetation-normals`. That flag injects
`window.__KB_LOAD_DISABLE_VEGETATION_NORMALS__ = true` before app startup, so
`GPUBillboardSystem` skips vegetation normal-map binding and uses hemisphere
vegetation shading only for that run. Candidate summaries record
`candidateFlags.disableVegetationNormals=true` and are written to
`startup-ui-<mode>-vegetation-normals-disabled/`. Treat those folders as
candidate evidence only; the default runtime path and default kickoff baseline
selection still use `startup-ui-<mode>/`.

`projekt-143-vegetation-normal-proof.ts` is the visual companion for that
startup candidate. It force-builds the perf target by default, captures
default normal-lit vegetation and no-normal vegetation at fixed Open Frontier
and Zone Control camera anchors, writes a contact sheet plus pair deltas, and
reports WARN until a future PASS or owner-accepted visual result exists. As of
the latest Projekt 143 refresh, WARN means the no-normal path is rejected for
default policy and default vegetation normal maps remain active.

`perf-grenade-spike.ts` writes KB-EFFECTS artifacts under
`artifacts/perf/<timestamp>/grenade-spike-<mode>/`: `summary.json`,
`baseline-snapshot.json`, `detonation-snapshot.json`, `render-attribution.json`,
`console.json`, and `cpu-profile.cpuprofile`. The `summary.json` includes a
compact `measurementTrust` block and browser-stall summaries for handoff. The
probe disables the diagnostic WebGL texture-upload observer because that
startup tracer wraps hot WebGL calls and would contaminate sustained runtime
grenade attribution. The grenade probe does install its own scoped render/frame
attribution around main-scene, weapon, grenade-overlay, and update phases; it
also supports a pre-trigger settle window so browser stalls that begin before
the live grenade trigger can be classified instead of mistaken for detonation
work.

`pixel-forge-imposter-optics-audit.ts` writes KB-OPTIK artifacts under
`artifacts/perf/<timestamp>/pixel-forge-imposter-optics-audit/`. The audit is
static metadata and image analysis: it does not replace screenshot comparison,
but it catches bake/runtime scale mismatches, low effective pixels per meter,
alpha occupancy, atlas luma/chroma, and divergent shader contracts.

`projekt-143-optics-scale-proof.ts` writes matched KB-OPTIK visual evidence
under `artifacts/perf/<timestamp>/projekt-143-optics-scale-proof/`. It renders
the current close Pixel Forge GLBs and matching NPC imposter shader crops in the
same orthographic camera/light setup, records projected geometry height,
rendered visible silhouette height, luma/chroma deltas, and a same-scale lineup
with the six aircraft GLBs at imported native scale. PASS means the evidence is
complete enough for review; it is not an imposter, NPC-scale, aircraft-scale, or
shader remediation claim.

`projekt-143-cycle1-benchmark-bundle.ts` writes a Cycle 1 certification bundle
under `artifacts/perf/<timestamp>/projekt-143-cycle1-benchmark-bundle/` and a
`projekt-143-cycle1-metadata.json` sidecar into each source artifact directory.
Those sidecars record commit SHA, mode, timing windows, warmup policy,
browser/runtime metadata, instrumentation flags, renderer/scene evidence, and
measurement-trust status.

`projekt-143-cycle2-proof-suite.ts` writes a Cycle 2 visual/runtime proof
status bundle. It pairs the latest runtime screenshot summary, static optics
and horizon audits, Open Frontier/A Shau scene attribution, and the latest
`projekt-143-culling-proof` and `projekt-143-optics-scale-proof` summaries when
present. The command is non-strict by default and may return `WARN` while proof
surfaces are incomplete; use `--strict` once Cycle 2 is ready to become a
blocking gate.

`projekt-143-cycle3-kickoff.ts` writes a remediation readiness matrix under
`artifacts/perf/<timestamp>/projekt-143-cycle3-kickoff/`. It reads the latest
Cycle 2 proof, KB-OPTIK scale proof, texture audit, Open Frontier and Zone
Control startup evidence, Open Frontier/combat120/A Shau perf summaries,
grenade probe, vegetation horizon audit, terrain horizon baseline, and culling
proof plus owner baseline, then classifies candidate Cycle 3 branches as
`evidence_complete`, `ready_for_branch`, `needs_decision`, `needs_baseline`, or
`blocked`. This is an agent-DX handoff command; it does not approve or apply
any remediation.

`projekt-143-optik-decision-packet.ts` writes a KB-OPTIK decision packet under
`artifacts/perf/<timestamp>/projekt-143-optik-decision-packet/`. It consumes the
trusted matched scale proof, records the current NPC target, base `2.95m`
target, imposter visible-height ratio, luma delta, and aircraft longest-axis
ratios. After the 2026-05-03 first remediation, it recognizes the `2.95m`
target drop plus per-tile crop map as complete for this slice. After commit
`1395198da4db95611457ecde769b611e3d36354e`, it also recognizes
selected-lighting luma parity as inside the matched proof band and recommends
expanded lighting/gameplay-camera coverage or switching the next remediation
slot to KB-LOAD/KB-TERRAIN/KB-CULL.
After commit `57d873e7f305fb528e7570232a291950e89c6ade`, it consumes the
expanded proof and recommends targeted lighting/material-contract remediation
or switching bureaus when expanded coverage is trusted but flagged.
After commit `b24c23bfdbd027458a4d3e27155158723a32f4ad`, it distinguishes
expanded-luma success from gameplay-camera silhouette flags and recommends
`target-gameplay-camera-silhouette-or-switch-bureau` when luma is inside band
but visible-height ratios still warn.
After commit `5b053711cece65b5915ea786acc56e4a8ea22736`, it reads the latest
near-stress expanded proof and runtime LOD-edge expanded proof separately. If
near-stress still flags but LOD-edge passes, it recommends
`document-near-stress-silhouette-exception-or-switch-bureau`.
Aircraft resizing remains rejected as the next response unless a separate
vehicle-scale proof is opened.

`projekt-143-optik-expanded-proof.ts` writes a headed KB-OPTIK expanded proof
under `artifacts/perf/<timestamp>/projekt-143-optik-expanded-proof/`. It
renders matched close-GLB/imposter crops for all four Pixel Forge NPC factions
across five lighting profiles and two camera profiles. Pass
`--camera-profile-set=runtime-lod-edge` to replace the 8.5m near-stress
perspective camera with the 64m close-model cutoff camera. The artifact includes
`summary.json`, `summary.md`, per-sample close/imposter PNGs, browser/runtime
metadata, renderer stats, and strict measurement-trust flags. WARN means the
capture is trusted but the expanded visual bands are not closed; FAIL means do
not use the numbers.
The committed-sha artifact
`artifacts/perf/2026-05-03T18-46-14-291Z/projekt-143-optik-expanded-proof/summary.json`
records commit `5792bafb7abd51c12dcf715a395a9c1d8c91c8ad`, measurement trust
PASS, luma delta range `-11.31%` to `9.03%`, and `10/40` remaining flags from
8.5m near-stress visible-height ratios. Runtime LOD-edge after evidence at
`artifacts/perf/2026-05-03T19-02-38-432Z/projekt-143-optik-expanded-proof/summary.json`
records commit `5b053711cece65b5915ea786acc56e4a8ea22736`, measurement trust
PASS, status PASS, `0/40` flags, visible-height ratio `0.855-0.895`, and luma
delta `-6.94%` to `9.77%`. Treat the near-stress WARN as a visual-exception or
human-review decision, not a measured runtime LOD-edge failure.

`projekt-143-culling-proof.ts` writes a headed deterministic renderer/category
fixture under `artifacts/perf/<timestamp>/projekt-143-culling-proof/`. It uses
current runtime GLBs for static features, fixed-wing aircraft, helicopters, and
close Pixel Forge NPCs, plus shader-uniform proxies for vegetation and NPC
imposter categories. The artifact includes `summary.json`, `summary.md`,
`scene-attribution.json`, `renderer-info.json`, `cpu-profile.json`, and a
fixture screenshot. It is not a gameplay perf baseline and does not certify
visual parity; it exists so KB-CULL has trusted draw-call/triangle attribution
without repeating untrusted combat-heavy AI Sandbox captures. The npm command
runs headed by default because headless Chromium produced a lost WebGL context
and zero renderer counters on 2026-05-03. The fixture screenshot is also not a
runtime scale proof: GLB assets are scaled by longest bounding-box axis to keep
all required categories visible in one camera. Use matched KB-OPTIK screenshots,
not this fixture, to judge whether NPCs are too large or vehicles are too small.

`projekt-143-culling-owner-baseline.ts` writes a KB-CULL owner-path before
packet under
`artifacts/perf/<timestamp>/projekt-143-culling-owner-baseline/`. It consumes
the headed culling proof, trusted Open Frontier and A Shau perf summaries,
scene attribution, renderer runtime samples, and the latest AI Sandbox combat
diagnostic. The first clean-HEAD PASS artifact is
`artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`.
It selects `large-mode-world-static-and-visible-helicopters` because trusted
large-mode captures contain representative draw-call/triangle telemetry for
`world_static_features` and visible `helicopters`: Open Frontier owner
draw-call-like `388`, A Shau owner draw-call-like `719`, visible unattributed
triangles `4.729%` / `5.943%`, and total draw-call ceilings `1037` / `785`.
Close-NPC and weapon pool residency remains diagnostic-only because the visible
combat artifact still fails measurement trust. This is before evidence, not a
culling/HLOD improvement claim.

After the 2026-05-04 shared static-feature batching pass, the refreshed owner
packet is
`artifacts/perf/2026-05-04T14-22-32-048Z/projekt-143-culling-owner-baseline/summary.json`.
It consumes fresh trusted Open Frontier and A Shau captures after
`WorldFeatureSystem` moved static placements under one
`WorldStaticFeatureBatchRoot` and batched compatible meshes across placement
boundaries. The selected owner draw-call-like totals move to Open Frontier
`261` and A Shau `307`. The supporting after captures are
`artifacts/perf/2026-05-04T14-13-30-766Z/summary.json` and
`artifacts/perf/2026-05-04T14-17-44-361Z/summary.json`. Treat this as
static-feature layer draw-call reduction only: Open Frontier total renderer
max is mixed by visible close NPCs/weapons, and A Shau still needs separate
terrain/nav/runtime acceptance.

`projekt-143-terrain-horizon-baseline.ts` writes an elevated KB-TERRAIN before
baseline under
`artifacts/perf/<timestamp>/projekt-143-terrain-horizon-baseline/`. It
force-builds the perf target by default, serves the perf bundle, captures
Open Frontier and A Shau `horizon-elevated` plus `horizon-high-oblique`
screenshots, and records browser metadata, warmup policy, renderer stats,
terrain readiness, vegetation active counters, nonblank ground-band image
checks, latest trusted Open Frontier/A Shau perf summaries, the vegetation
horizon audit, and the culling proof. The first fresh-build artifact is
`artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`.
It is a before baseline for a future far-horizon branch, not an accepted
far-canopy implementation. Future after evidence must rerun this command and
matched Open Frontier/A Shau perf captures; the current guardrails are Open
Frontier p95 `<=43.5ms` and draw calls `<=1141`, A Shau p95 `<=40.9ms` and
draw calls `<=864`.

`projekt-143-terrain-distribution-audit.ts` writes a KB-TERRAIN static
material distribution audit under
`artifacts/perf/<timestamp>/projekt-143-terrain-distribution-audit/`. It
samples each shipped mode's terrain provider and records CPU biome
classification, shader-primary material distribution, flat/steep material
distribution, estimated vegetation density, and cliff-rock accent eligibility.
The 2026-05-04 material pass artifact is
`artifacts/perf/2026-05-04T02-02-26-811Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`:
flat ground is `100%` jungle-like primary material in all modes, Open Frontier
is `99.99%` jungle-like overall, A Shau is `100%`, and steep-side rock-accent
coverage passes in all modes. The WARN status is expected because AI Sandbox is
sampled with fixed fallback seed `42` when its production config requests a
random seed. This audit is not a screenshot, performance, vegetation-density,
or final art acceptance gate.
After the first vegetation scale/distribution pass and the bamboo-clustering
follow-up, the latest distribution artifact is
`artifacts/perf/2026-05-04T10-53-17-067Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`.
It includes clustered-vegetation coverage estimates; use them as static
guidance only, because runtime screenshots and perf captures remain the
authority for visual density and frame-time impact. The current bamboo target
is dense grove pockets, not random individual scatter and not a continuous
bamboo forest.

`projekt-143-terrain-placement-audit.ts` writes a KB-TERRAIN
placement/foundation audit under
`artifacts/perf/<timestamp>/projekt-143-terrain-placement-audit/`. It samples
flattened airfield, firebase, and support features before and after terrain
stamps, including generated airfield placements, to catch foundations and
runway footprints that hang off hills. The initial 2026-05-04 artifact failed
Open Frontier `airfield_main` and A Shau `tabat_airstrip`; the latest passing
artifact is
`artifacts/perf/2026-05-04T10-53-17-143Z/projekt-143-terrain-placement-audit/terrain-placement-audit.json`.
This is placement-shape evidence only. A Shau after-placement perf evidence at
`artifacts/perf/2026-05-04T04-14-35-401Z/summary.json` no longer logs the Ta
Bat steep-footprint warning, but it remains WARN and does not accept route,
nav, vehicle usability, or final static feature layout.

`projekt-143-terrain-asset-inventory.ts` writes a KB-TERRAIN static asset
inventory under
`artifacts/perf/<timestamp>/projekt-143-terrain-asset-inventory/`. It
enumerates terrain WebP ground textures, runtime biome usage, Pixel Forge
ground-cover/trail prop candidates, existing building/structure candidates,
runtime Pixel Forge vegetation, and blocked Pixel Forge vegetation. The first
artifact is
`artifacts/perf/2026-05-04T11-43-52-912Z/projekt-143-terrain-asset-inventory/terrain-asset-inventory.json`:
`12` terrain textures, `5` green-ground variants, `4` trail/cleared/disturbed
variants, `5` Pixel Forge ground-cover prop candidates, `12` building
candidates, `7` runtime vegetation species, and `6` still-blocked vegetation
species. WARN is expected because this is an inventory and shortlist input,
not runtime import or visual/perf acceptance.

`summary.json`, `validation.json`, `measurement-trust.json`, `console.json`,
and `runtime-samples.json` are written on best effort failure paths as well, so
a blocked run still leaves enough evidence to diagnose startup regressions.

## Harness Status

- **Resource contention caveat (2026-05-06):** current owner reports include
  other browser/game agents and an SDS repo overnight Claude shift on the same
  device. Treat local headed/GPU-heavy captures as blocked until a lightweight
  process check shows the machine is quiet. The harness window clamp should
  reduce monitor-span noise, but it does not make a busy machine acceptable for
  perf acceptance.
- **NPC recovery follow-up (2026-05-06):** `CombatantMovement` now rejects
  zero-distance navmesh backtrack snaps and prefers last-good navmesh progress
  before scored terrain fallback. A Shau after evidence
  `artifacts/perf/2026-05-06T04-46-26-097Z/summary.json` clears the shot gate
  with `240` validation player shots / `170` hits, but remains WARN on p99,
  heap peak, and repeated terrain backtracking. Open Frontier
  `artifacts/perf/2026-05-06T04-51-35-039Z/summary.json` remains WARN and
  points toward active-driver route/engagement behavior. The rejected
  frontline-compression run
  `artifacts/perf/2026-05-06T04-58-04-461Z/summary.json` failed validation and
  was reverted.
- **Active-driver route-overlay follow-up (2026-05-06):** the perf driver now
  carries a `movementTarget` for navmesh overlay points. While the bot is
  moving and not firing, the controller faces that route point instead of the
  far enemy/objective aim target, which matches the camera-relative movement
  contract and addresses the "player stops after a few minutes" failure shape
  seen in Open Frontier. Validation so far includes focused CPU tests:
  `npx vitest run src/dev/harness/playerBot/PlayerBotController.test.ts
  src/dev/harness/playerBot/states.test.ts src/dev/harness/PlayerBot.test.ts
  scripts/perf-harness/perf-active-driver.test.js` and `npm run typecheck`
  pass. A headless Open Frontier diagnostic after the patch,
  `artifacts/perf/2026-05-06T06-18-15-743Z/summary.json`, failed validation and
  measurement trust, but it improved the specific route-stuck telemetry versus
  `artifacts/perf/2026-05-06T06-04-57-681Z/summary.json`: max harness stuck
  `176.1s -> 0s`, player `blockedByTerrain 275 -> 0`, and
  `avgActualSpeed 0 -> 8.82m/s`. Combat still fired `0` shots and stayed in
  PATROL, so the driver now also prefers a nearest-live-OPFOR patrol objective
  in aggressive large-map profiles before falling back to capture-zone routing.
  The capture stream now also records `objectiveKind`, `objectiveDistance`,
  `nearestOpforDistance`, `nearestPerceivedEnemyDistance`, and
  `perceptionRange`, plus path target kind/distance and last query status, so
  the next diagnostic can separate objective routing, perception range, and
  nav/path failure. `npm run check:projekt-143-active-driver-diagnostic` reads
  the resulting runtime samples and prefers the newest telemetry-bearing
  capture when no artifact is passed. This is harness proof routing and
  telemetry, not gameplay AI. A quiet-machine Open Frontier/A Shau rerun is
  still required before claiming runtime movement, combat, or perf acceptance.
  The first resource-clean headed Open Frontier rerun with telemetry,
  `artifacts/perf/2026-05-06T07-38-14-932Z/summary.json`, has measurement
  trust PASS but validation FAIL: the bot records `nearest_opfor` objectives,
  enters ADVANCE, and sees a perceived target around `724m`, but path queries
  remain `failed`, the target never reaches fire range, and shots stay `0`.
  Two follow-up path-planning experiments are rejected diagnostic artifacts:
  `artifacts/perf/2026-05-06T07-45-35-107Z/summary.json` briefly produced
  `ok` path queries but regressed p99 and still fired `0` shots, while
  `artifacts/perf/2026-05-06T07-51-32-551Z/summary.json` and the confirmation
  run `artifacts/perf/2026-05-06T07-54-19-080Z/summary.json` missed all runtime
  samples and fail measurement trust.
- **Active-driver terrain/contact and combat-front proof (2026-05-06):**
  retained fixes now address the next failure layer without accepting the
  rejected path-planning experiments. `perf-capture.ts` injects browser runtime
  helpers as raw page-init script content, so telemetry sampling no longer
  fails on browser-scope helper references. `TerrainQueries.getEffectiveHeightAt()`
  now limits effective ground to low/standable static support surfaces and
  explicit helipads; tall generic or dynamic collision bounds still block
  collisions but no longer lift the player's target ground. The Open Frontier
  active driver can also place a capped player-anchored combat front and sync
  combatant logical positions, rendered positions, and spatial-grid entries.
  The headed 20s proof
  `artifacts/perf/2026-05-06T08-52-31-466Z/summary.json` has measurement trust
  PASS and validation WARN. Active gates pass (`33` shots, `19` hits, `6`
  kills, max stuck `0.5s`, `19` movement transitions), and the paired
  diagnostic
  `artifacts/perf/2026-05-06T08-52-31-466Z/projekt-143-active-driver-diagnostic/active-driver-diagnostic.json`
  is PASS with `playerBlockedByTerrain=0`, `collisionHeightDeltaAtPlayer=0`,
  and `blockReason=none`. Do not promote this to baseline or KB-TERRAIN
  acceptance: p99 `53.50ms`, average frame `26.37ms`, hitch50 `0.94%`, and
  heap peak growth `77.85MB` remain WARN, the run is short, and A Shau still
  needs route/nav-quality acceptance.
- **Close-model frustum-culling proof (2026-05-06):** the full-duration
  Open Frontier active-driver path exposed the next KB-CULL failure layer.
  Before evidence
  `artifacts/perf/2026-05-06T09-06-03-544Z/summary.json` has measurement trust
  PASS but validation FAIL: average frame `31.08ms`, p99 `65.90ms`, hitch50
  `3.78%`, and scene attribution dominated by close weapons / close NPC GLBs.
  `CombatantRenderer` now keeps close Pixel Forge NPC body and weapon meshes
  eligible for renderer frustum culling and computes missing bounding spheres
  instead of forcing every close-model child to render off-camera. Focused
  `CombatantRenderer` tests, `npm run typecheck`, and `npm run build:perf`
  pass. After evidence
  `artifacts/perf/2026-05-06T09-09-45-715Z/summary.json` is Open Frontier
  validation WARN with measurement trust PASS, p99 `47.90ms`, hitch50 `0.04%`,
  heap peak growth `6.69MB`, `81` shots / `45` hits, and active-driver
  diagnostic PASS. Matched A Shau after evidence
  `artifacts/perf/2026-05-06T09-11-34-037Z/summary.json` is validation WARN
  with measurement trust PASS, p99 `26.70ms`, hitch50 `0%`, heap peak growth
  `27.81MB`, `171` shots / `95` hits, and active-driver diagnostic PASS. This
  accepts only a scoped close-model culling/runtime-liveness slice; broad
  HLOD/culling and KB-TERRAIN visual/hydrology closeout remain open.
- **Active-player killbot caveat (2026-05-04):** shorter Pixel Forge NPCs
  changed the target-height contract. The local bot and CJS driver now aim at
  the visual chest proxy and can use rendered target anchors. The fresh
  post-fix Open Frontier capture
  `artifacts/perf/2026-05-04T11-35-07-274Z/summary.json` records `120` player
  shots, `43` hits, and `9` kills, so the zero-hit target-height failure is no
  longer current. Treat that artifact as hit-contract evidence only: another
  browser game was running on and off during the capture, so frame-time/heap
  metrics may be skewed and must not refresh baselines or support perf
  acceptance.
- **Resolved on 2026-04-02:** the Playwright perf harness freeze at `frameCount=1` was caused by same-document View Transitions on the live-entry path. Menu-only transitions can still use `document.startViewTransition()`, but live-entry now bypasses it and perf/sandbox runs explicitly force `uiTransitions=0`.
- Harness startup probes now capture `rafTicks`, page visibility, startup phase, and active view-transition state so browser scheduling failures are distinguishable from game-loop failures.
- GitHub-hosted CI perf remains advisory. The harness is now trustworthy locally, but the hosted Linux/Xvfb environment still exhibits non-representative browser scheduling and GPU readback stalls during `combat120`, so authoritative perf gating stays with local/self-run `validate:full`.
- Tracked baselines in `perf-baselines.json` were refreshed on 2026-04-20 after the atmosphere/airfield/harness cycle. `npm run perf:compare -- --scenario combat120` passed 8/8 checks against those baselines on 2026-04-24 after a clean standalone combat120 capture.
- **Fixed-wing browser gate restored and expanded on 2026-04-21:** `npm run probe:fixed-wing` rebuilds the selected preview target, boots Open Frontier, waits for each requested aircraft to spawn, and validates A-1, F-4, and AC-47 takeoff, climb, AC-47 orbit hold, player/NPC handoff, and short-final approach setup.
- Cycle 2 treats fixed-wing feel as a separate product gate. The browser probe
  proves control-flow correctness; it does not prove high-speed feel, altitude
  damping, camera smoothness, or render interpolation quality. Pair any
  fixed-wing feel change with the playtest checklist.
- The first Cycle 2 fixed-wing feel patch adds Airframe pose interpolation plus
  elapsed-time fixed-wing camera/look/FOV smoothing. `npm run probe:fixed-wing`
  passes, but human playtest and quiet-machine perf validation remain open.
- `frontier30m` soak semantics were corrected in Cycle 2: the npm script now
  passes `--match-duration 3600 --disable-victory true`, which keeps Open
  Frontier non-terminal for the 30-minute capture. The tracked baseline below is
  still the old 2026-04-20 run until a quiet-machine refresh is captured.
- 2026-04-24 architecture-recovery perf gate: `npm run validate:full` passed
  the unit/build portions but the first `combat120` capture failed one
  heap-recovery check. A standalone rerun of
  `npm run perf:capture:combat120` then passed with warnings at
  `artifacts/perf/2026-04-24T05-49-45-656Z`, and
  `npm run perf:compare -- --scenario combat120` passed 8/8 checks. Treat this
  as PASS/WARN until a quiet-machine full validation run refreshes heap
  confidence.
- 2026-05-02 stable-ground rerun: `npm run validate:full` passed tests/build
  but failed combat120 frame-time gates at
  `artifacts/perf/2026-05-02T07-29-13-476Z`. This is a stronger perf-confidence
  warning than the April heap-only run and must be rerun on a quiet machine
  before claiming combat120 perf sign-off or refreshing baselines.
- 2026-05-07 STABILIZAT-1 rerun: `npm run perf:capture:combat120` wrote
  `artifacts/perf/2026-05-07T04-11-20-627Z` and failed validation. Avg frame
  was `94.34ms`, peak p99 `100.00ms`, frames >50ms `86.78%`, over-budget
  samples `100%`, Combat dominated every sample over 16.67ms, heap end-growth
  was `29.88MB` WARN, heap peak-growth was `257.69MB` FAIL, heap recovery was
  `88.4%` PASS, and measurement trust was WARN. Do not refresh
  `perf-baselines.json` from this artifact.
- 2026-05-07 DEFEKT-3 remediation: close-actor render remediation plus the
  metric-window correction moved the standard `npm run perf:capture:combat120`
  command to validation WARN with measurement trust PASS at
  `artifacts/perf/2026-05-07T05-00-06-198Z/projekt-143-tail-window-remediation/summary.json`.
  Avg frame is `19.24ms`, peak p99 is `37.70ms`, heap end-growth is `25.28MB`
  WARN, and heap peak-growth is `61.13MB` WARN. This is not baseline-quality
  evidence because STABILIZAT-1 requires avg `<=17ms`, p99 `<=35ms`, and heap
  end-growth `<=10MB`.
- 2026-05-07 DEFEKT-3 repeatability check: the next standard
  `npm run perf:capture:combat120` command failed validation while measurement
  trust remained PASS at
  `artifacts/perf/2026-05-07T05-10-12-139Z/projekt-143-repeatability-check/summary.json`.
  Avg frame was `19.27ms`, peak p99 was `36.70ms`, heap end-growth was
  `40.45MB` WARN, heap peak-growth was `47.49MB` WARN, and heap recovery was
  `14.8%` FAIL. This confirms that frame-time gains are real but the
  STABILIZAT-1 heap criteria are not repeatably clean.
- 2026-05-07 DEFEKT-3 heap close-model isolation: the current worktree rerun
  with `--disable-npc-close-models` wrote
  `artifacts/perf/2026-05-07T05-19-21-519Z/projekt-143-heap-close-model-isolation/summary.json`.
  It is diagnostic-only, but it isolates the blocker. Validation is WARN,
  measurement trust is PASS, avg frame is `14.21ms`, peak p99 is `33.40ms`,
  heap end-growth is `-14.97MB`, and heap recovery is `155.7%`. Production
  repeat texture count moved `199 -> 309`; close-model isolation moved
  `52 -> 54`. Production repeat geometry count moved `238 -> 272`;
  close-model isolation moved `203 -> 231`. The next production remediation
  belongs to close-model pool/resource bounds while preserving visual
  acceptance.
- 2026-05-07 DEFEKT-3 production pool bound: active close GLB actors now cap at
  `8`, per-faction pool cap is coupled to that active cap, initial per-faction
  seed is `4`, and top-up batch is `2`. The standard
  `npm run perf:capture:combat120` artifact
  `artifacts/perf/2026-05-07T05-26-55-636Z/projekt-143-close-model-pool-bound/summary.json`
  is validation WARN with measurement trust PASS. Avg frame is `17.50ms`, peak
  p99 is `34.20ms`, heap end-growth is `4.64MB`, heap recovery is `87.6%`,
  texture count moves `137 -> 165`, visible weapon draw-call-like count is `8`,
  and visible close-NPC GLB draw-call-like count is `56`. This is the accepted
  production remediation. A later scheduler trim artifact
  `artifacts/perf/2026-05-07T05-30-03-496Z` was rejected and reverted because
  avg frame and heap recovery worsened.
- 2026-05-07 STABILIZAT-1 pool-bound repeatability check: the next standard
  `npm run perf:capture:combat120` artifact
  `artifacts/perf/2026-05-07T05-38-56-942Z/projekt-143-pool-bound-repeatability/summary.json`
  is validation WARN with measurement trust PASS. Avg frame is `17.36ms`, peak
  p99 is `34.50ms`, heap end-growth is `13.94MB`, heap recovery is `70.6%`,
  texture count moves `136 -> 166`, geometry count moves `218 -> 256`, visible
  weapon draw-call-like count is `8`, and visible close-NPC GLB draw-call-like
  count is `56`. Baseline refresh remains blocked because avg frame misses the
  codex `<=17ms` gate and heap end-growth misses the `<=10MB` gate.
- 2026-05-07 DEFEKT-3 residual heap diagnostic: the diagnostic packet
  `artifacts/perf/2026-05-07T05-47-22-079Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`
  consumes the trusted pool-bound repeatability artifact and classifies the
  residual heap shape as `transient_gc_wave` from
  `short_lived_runtime_allocations_after_renderer_resources_stabilized`.
  Renderer resources stabilize after peak: textures move `+30` from start to
  peak and `+0` peak to end; geometries move `+32` start to peak and `+6` peak
  to end. The diagnostic records peak heap `131.74MB`, end heap `98.31MB`,
  reclaimed ratio `0.776`, `343` terrain-stall backtracking console signals,
  `19` AI-budget warnings, and `15` system-budget warnings. It does not prove a
  heap fix or authorize a baseline refresh.
- 2026-05-07 DEFEKT-3 terrain-stall warning bound: the packet
  `artifacts/perf/2026-05-07T05-54-31-155Z/projekt-143-stuck-warning-bound/summary.json`
  records the callsite rate limiter for terrain-stall recovery warnings. The
  next standard `npm run perf:capture:combat120` artifact
  `artifacts/perf/2026-05-07T05-54-31-155Z` remains measurement-trusted but
  fails validation: avg `17.85ms`, peak p99 `78.10ms`, heap end-growth
  `16.26MB`, heap peak-growth `38.15MB`, and heap recovery `57.4%`. Console
  terrain-stall backtracking signals fall from `343` to `21`, with `20`
  suppression-summary lines proving the limiter activated. This is warning-churn
  reduction evidence only; it does not authorize a baseline refresh.
- 2026-05-07 DEFEKT-3 deep-CDP heap sampling attribution: the packet
  `artifacts/perf/2026-05-07T06-18-22-151Z/projekt-143-heap-sampling-attribution/summary.json`
  consumes the failed-but-trusted dev-shape deep-CDP capture
  `artifacts/perf/2026-05-07T06-13-38-855Z` and its `heap-sampling.json`. The
  capture fails validation with avg `21.42ms`, peak p99 `85.70ms`, heap
  end-growth `1.02MB`, heap peak-growth `42.49MB`, and heap recovery `97.6%`.
  The profile records `132238` allocation samples and `4275.84MB` sampled
  self-size volume. Top categories are `three_renderer_math_and_skinning`
  (`53.08%`), `terrain_height_sampling` (`10.15%`), `browser_or_unknown`
  (`10.00%`), `native_array_string_or_eval_churn` (`8.91%`),
  `combatant_renderer_runtime` (`6.30%`), and
  `combat_movement_terrain_queries` (`4.14%`). Top source URLs are
  `three.module`, native churn, `CombatantRenderer.ts`,
  `GameplaySurfaceSampling.ts`, `CombatantMovement.ts`, `HeightQueryCache.ts`,
  and `InfluenceMapComputations.ts`. This is allocation ownership evidence
  only; profiler overhead makes it unsuitable for baseline refresh.
- 2026-05-07 DEFEKT-3 close-model material-state bound: steady close GLB opacity
  updates no longer force `material.needsUpdate` on every frame. The standard
  combat120 artifact `artifacts/perf/2026-05-07T06-24-48-025Z` records
  validation PASS and measurement trust PASS: avg `16.99ms`, peak p99
  `34.30ms`, heap end-growth `16.26MB`, heap peak-growth `44.23MB`, and heap
  recovery `63.2%`. The companion diagnostic
  `artifacts/perf/2026-05-07T06-27-39-705Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`
  classifies the remaining heap as `retained_or_unrecovered_peak`. The
  comparison gate now filters non-capture evidence folders before selecting the
  latest artifact, but `npm run perf:compare -- --scenario combat120` still
  fails with `6 pass, 1 warn, 1 fail` because `maxFrameMs` is `100.00ms`.
  This is accepted progress, not baseline evidence.
- 2026-05-07 DEFEKT-3 max-frame attribution packet: `perf-capture.ts` now
  persists bounded WebGL texture-upload attribution from the existing browser
  observer into `runtime-samples.json`. The latest combat120 artifact
  `artifacts/perf/2026-05-07T06-36-34-481Z` records validation WARN and
  measurement trust PASS with avg `17.15ms`, peak p99 `34.20ms`, heap
  end-growth `-19.39MB`, and heap recovery `184.7%`. The max-frame sidecar
  `artifacts/perf/2026-05-07T06-41-29-405Z/projekt-143-maxframe-diagnostic/maxframe-diagnostic.json`
  classifies the first `100.00ms` max-frame event as
  `longtask_without_webgl_upload_or_system-timing_owner`: long task `167ms`,
  long-animation-frame `169.7ms`, WebGL upload max `0.1ms`, and max observed
  system timing `9.2ms`. The latest compare gate reports `6 pass, 0 warn, 2
  fail`; failures are avg frame and max frame, so baseline refresh remains
  unauthorized.
- 2026-05-07 DEFEKT-3 CPU/heap attribution packet: the focused deep-CDP
  production capture `artifacts/perf/2026-05-07T06-46-38-609Z` emits
  `cpu-profile.cpuprofile` and `heap-sampling.json`; `chrome-trace.json` did
  not write because trace shutdown timed out. Measurement trust passes, but
  validation fails under profiler overhead with avg `22.49ms`, peak p99
  `79.80ms`, heap end-growth `6.60MB`, and max frame `100.00ms`. The heap
  sidecar
  `artifacts/perf/2026-05-07T06-50-10-651Z/projekt-143-heap-sampling-attribution/summary.json`
  records `205766` allocation samples and `6660.98MB` sampled self-size volume.
  The production CPU sidecar
  `artifacts/perf/2026-05-07T06-52-40-345Z/projekt-143-cpu-profile-attribution/cpu-profile-attribution.json`
  records five long-task samples and six >50ms hitch events; CPU self-time is
  led by `three_matrix_skinning_and_scenegraph` (`67.60%`),
  `gameplay_bundle_other` (`6.70%`), `system_update_timing` (`5.63%`), and
  `terrain_height_sampling` (`3.30%`). The source-shaped CPU sidecar
  `artifacts/perf/2026-05-07T06-52-40-297Z/projekt-143-cpu-profile-attribution/cpu-profile-attribution.json`
  maps the same class of work to Three scenegraph/render-program paths,
  `CombatantRenderer.ts`, `CombatantMovement.ts`, `CombatantLODManager.ts`,
  `HeightQueryCache.ts`, and `GameplaySurfaceSampling.ts`. This is owner
  attribution only; no baseline refresh or broad cap is authorized. The compare
  selector excludes failed diagnostic captures, so this packet does not displace
  the latest successful standard artifact for `perf:compare`.
- 2026-05-07 DEFEKT-3 close-model overflow bound: `CombatantRenderer` now
  reports repeated close-model overflow once per pool/reason during an update
  pass, while keeping overflow actors on impostor fallback. The packet
  `artifacts/perf/2026-05-07T07-00-28-388Z/projekt-143-close-model-overflow-bound/summary.json`
  records targeted renderer-test coverage and the standard combat120 capture.
  Validation is WARN and measurement trust is PASS: avg `17.14ms`, peak p99
  `34.50ms`, heap end-growth `-5.08MB`, heap peak-growth `29.85MB`, heap
  recovery `117.0%`, visible close-NPC GLB draw-call-like `56`, visible weapon
  draw-call-like `8`, visible NPC impostor instances `106`, textures
  `137 -> 166`, and geometries `224 -> 257`. `perf:compare -- --scenario
  combat120` auto-selects this capture and still fails with `6 pass, 0 warn, 2
  fail` on avg frame and max frame. This is accepted progress, not baseline
  evidence.
- 2026-05-07 DEFEKT-3 RuntimeMetrics frame-event ring: `RuntimeMetrics` now
  records a bounded frame-event ring for hitch/new-peak frames, and
  `perf-capture.ts` persists it into `runtime-samples.json`. The accepted
  packet requires a fresh `npm run build:perf` before capture; the stale-build
  `07-24-02` capture did not contain frame events and remains rejected as
  directive evidence. The rebuilt capture
  `artifacts/perf/2026-05-07T07-27-02-293Z` records validation WARN and
  measurement trust PASS: avg `15.88ms`, peak p99 `34.40ms`, heap end-growth
  `14.75MB`, heap recovery `64.6%`, and max-frame `100ms`. The sidecar
  `artifacts/perf/2026-05-07T07-27-02-293Z/projekt-143-max-frame-attribution/max-frame-attribution.json`
  classifies the first peak as
  `browser_long_animation_frame_without_instrumented_system_or_webgl_owner`:
  sample index `7`, runtime event frame `540`, frame event `100ms`, long task
  `0ms`, long-animation-frame `175.8ms`, blocking `125.78ms`, WebGL upload max
  `0.1ms`, and top user timing `SystemUpdater.Combat` at `9.4ms`. It does not
  prove a runtime fix or baseline eligibility.
- 2026-05-07 DEFEKT-3 avg-frame attribution packet: the sidecar
  `artifacts/perf/2026-05-07T07-27-02-293Z/projekt-143-avg-frame-attribution/avg-frame-attribution.json`
  consumes the rebuilt trusted standard capture and classifies the residual avg
  warning as `late_combat_phase_cpu_pressure_not_renderer_or_terrain_stream_growth`.
  Early/middle/late avg frame is `13.15/15.95/18.44ms`; Combat total is
  `4.60/5.62/5.94ms`; AI is `3.42/4.25/4.51ms`; draw calls are
  `212.83/195.31/191.63`; shots are `0/165/435`; terrain stream max is
  `0.04ms`. It directs the next remediation toward late engagement-phase Combat
  CPU pressure, not renderer or terrain stream growth.
- 2026-05-07 DEFEKT-3 combat-phase attribution packet: the sidecar
  `artifacts/perf/2026-05-07T07-27-02-293Z/projekt-143-combat-phase-attribution/combat-phase-attribution.json`
  consumes the rebuilt trusted standard capture and narrows the owner to
  `late_close_engagement_pressure_not_renderer_or_movement_volume`. Avg frame
  rises `13.15ms -> 18.44ms`; current target distance falls `15.49m -> 8.20m`;
  nearest OPFOR distance falls `14.96m -> 8.18m`; shots delta rises `0 -> 259`;
  damage-taken delta rises `317.62 -> 1941.51`; draw calls fall
  `212.83 -> 191.63`; NPC movement sample delta falls `218826 -> 170988`.
  It directs the next remediation toward `AIStateEngage`, `AITargeting` LOS
  miss paths, and close-contact target distribution before further visual caps.
- 2026-05-07 DEFEKT-3 close-engagement source audit: the sidecar
  `artifacts/perf/2026-05-07T07-56-12-331Z/projekt-143-close-engagement-source-audit/source-audit.json`
  consumes the combat-phase packet and ranks current source owners. It assigns
  owner rank one to `AIStateEngage.ts`, rank two to `AILineOfSight.ts`, and
  rank three to `AITargetAcquisition.ts` plus `ClusterManager.ts`. The next
  accepted packet must add runtime counters for close-range full-auto
  activations, nearby-enemy burst triggers, suppression transitions,
  target-distance buckets, and LOS miss/full-raycast/cache outcomes before
  tuning, visual caps, or baseline refresh.
- 2026-05-07 DEFEKT-3 close-engagement counter packet: the sidecar
  `artifacts/perf/2026-05-07T08-09-18-293Z/projekt-143-close-engagement-counter-packet/counter-packet.json`
  lands the required counters and perf-capture serialization. It records source
  and test anchors for close-range full-auto activations, nearby-enemy burst
  triggers, suppression transitions, target-distance buckets, LOS
  cache/full-evaluation/raycast outcomes, target-acquisition counts, and
  target-distribution churn. Status is WARN because it does not include a
  trusted runtime capture with counter deltas.
- 2026-05-07 DEFEKT-3 counter-bearing combat120 packet: after the perf bundle
  rebuild, `npm run perf:capture:combat120` wrote
  `artifacts/perf/2026-05-07T08-18-45-389Z`, and the counter packet command wrote
  `artifacts/perf/2026-05-07T08-18-45-389Z/projekt-143-close-engagement-counter-packet/counter-packet.json`.
  It proves 88/88 close-engagement runtime samples and early/middle/late
  counter deltas. It does not authorize baseline refresh because validation is
  WARN and `perf:compare -- --scenario combat120` still fails max frame.
- 2026-05-07 DEFEKT-3 close-engagement owner attribution: the sidecar
  `artifacts/perf/2026-05-07T08-29-10-043Z/projekt-143-close-engagement-owner-attribution/owner-attribution.json`
  consumes the counter-bearing capture and ranks the current owner path as
  `AILineOfSight.ts`, `ClusterManager.ts`, `AITargetAcquisition.ts`, then
  `AIStateEngage.ts`. Late avg frame is `19.15ms`; LOS markers rise
  `6855 -> 11044`; target-distribution markers rise `3012 -> 7131`. This
  directs the next bounded source work toward LOS full-evaluation pressure and
  target-distribution scheduling. It does not prove a fix or authorize baseline
  refresh.
- 2026-05-07 DEFEKT-3 LOS/distribution separation: the sidecar
  `artifacts/perf/2026-05-07T08-39-12-950Z/projekt-143-los-distribution-separation/separation.json`
  consumes the owner-attribution packet and separates scheduling from execution.
  `AITargetAcquisition.ts` and `ClusterManager.ts` have no direct LOS reference;
  `AILineOfSight.ts`, `AIStateEngage.ts`, `AIStatePatrol.ts`, and
  `AIStateDefend.ts` carry the visibility execution path. Late distribution
  scheduling delta is `7131`, late LOS execution delta is `11044`, and
  LOS/distribution delta correlation is `0.871`. The next accepted source work
  is LOS cadence instrumentation or a bounded target-assignment stability
  diagnostic, not visual caps or baseline refresh.
- 2026-05-07 DEFEKT-3 LOS callsite cadence: the sidecar
  `artifacts/perf/2026-05-07T08-54-41-861Z/projekt-143-los-callsite-cadence/callsite-cadence.json`
  consumes the fresh trusted capture at `artifacts/perf/2026-05-07T08-52-29-162Z`
  and ranks runtime state-handler LOS cadence. The late window records
  `engageSuppressionCheck=3504`, `patrolDetection=2352`, and
  `seekingCoverValidation=181` call deltas while avg frame is `19.03ms`.
  `perf:compare -- --scenario combat120` remains red with `6 pass, 0 warn, 2
  fail`, so the next source packet should target `engageSuppressionCheck`
  cadence first and leave baseline refresh blocked.
- 2026-05-07 DEFEKT-3 engage-suppression cadence bound: the sidecar
  `artifacts/perf/2026-05-07T09-07-10-904Z/projekt-143-engage-suppression-cadence-bound/engage-suppression-cadence-bound.json`
  binds the `AIStateEngage.ts` 250ms positive-visibility reuse change and the
  follow-up runtime packet
  `artifacts/perf/2026-05-07T09-04-32-678Z/projekt-143-los-callsite-cadence/callsite-cadence.json`.
  Late `engageSuppressionCheck` calls move `3504 -> 1131`, while
  `patrolDetection` moves `2352 -> 3146`. The post-change capture is
  measurement-trusted but validation FAIL on heap recovery, so the next bounded
  source target is `patrolDetection` fanout and baseline refresh remains blocked.
- 2026-05-07 DEFEKT-3 patrol-detection cadence bound: the sidecar
  `artifacts/perf/2026-05-07T09-19-05-797Z/projekt-143-patrol-detection-cadence-bound/patrol-detection-cadence-bound.json`
  binds the `AIStatePatrol.ts` 250ms LOS reuse change and the follow-up runtime
  packet
  `artifacts/perf/2026-05-07T09-15-29-196Z/projekt-143-los-callsite-cadence/callsite-cadence.json`.
  Late `patrolDetection` calls move `3146 -> 1088`, while
  `engageSuppressionCheck` moves `1131 -> 748` and `seekingCoverValidation`
  rises `206 -> 578`. The post-change capture is status-ok, validation WARN,
  and measurement-trusted; `perf:compare -- --scenario combat120` still fails
  max frame with `6 pass, 1 warn, 1 fail`, so baseline refresh remains blocked.
- 2026-05-07 DEFEKT-3 seeking-cover cadence bound: the sidecar
  `artifacts/perf/2026-05-07T09-29-40-761Z/projekt-143-seeking-cover-cadence-bound/seeking-cover-cadence-bound.json`
  binds the `AIStateMovement.ts` 250ms positive-visibility reuse change and the
  follow-up runtime packet
  `artifacts/perf/2026-05-07T09-27-45-538Z/projekt-143-los-callsite-cadence/callsite-cadence.json`.
  Late `seekingCoverValidation` calls move `578 -> 33`, while
  `patrolDetection` rises `1088 -> 3947` and `engageSuppressionCheck` rises
  `748 -> 1161`. The post-change capture is status-ok, validation WARN, and
  measurement-trusted; `perf:compare -- --scenario combat120` still fails max
  frame with `6 pass, 1 warn, 1 fail`, so baseline refresh remains blocked.
- 2026-05-07 DEFEKT-3 target-distribution stability bound: the sidecar
  `artifacts/perf/2026-05-07T09-43-39-502Z/projekt-143-target-distribution-stability-bound/target-distribution-stability-bound.json`
  binds the `ClusterManager.ts` 500ms stable-target window and the follow-up
  runtime packet
  `artifacts/perf/2026-05-07T09-43-39-494Z/projekt-143-los-callsite-cadence/callsite-cadence.json`.
  Late assignment churn moves `4016 -> 425`, `patrolDetection` moves
  `3947 -> 674`, LOS full evaluations move `5202 -> 1655`, and late avg frame
  moves `19.92ms -> 17.22ms`. The post-change capture is status-ok, validation
  WARN, and measurement-trusted; `perf:compare -- --scenario combat120` still
  fails max frame with `6 pass, 1 warn, 1 fail`, so baseline refresh remains
  blocked.
- 2026-05-07 DEFEKT-3 post-distribution max-frame attribution: the sidecar
  `artifacts/perf/2026-05-07T09-41-19-775Z/projekt-143-max-frame-attribution/max-frame-attribution.json`
  consumes the same status-ok capture after the target-distribution stability
  bound. The capture records avg `15.47ms`, peak p99 `34.30ms`, max-frame
  `100.00ms`, heap end-growth `-2.30MB`, heap recovery `106.4%`, validation
  WARN, and measurement trust PASS. The first peak sample is index `5`; runtime
  frame-event frame `392` records `100ms`, long task is `127ms`,
  long-animation-frame is `126.7ms`, blocking is `76.73ms`, WebGL upload max is
  `17.9ms`, and top user timing is `SystemUpdater.Combat` at `7.8ms`.
  Classification is `mixed_or_insufficient_attribution` with low confidence.
  This directs the next packet to a focused CDP trace/render-present/GC probe;
  it is not baseline authority.
- 2026-05-07 DEFEKT-3 focused max-frame trace probe: `perf-capture.ts` now
  supports opt-in focused Chrome trace windows through `--trace-window-start-ms`
  and `--trace-window-duration-ms`. The diagnostic capture
  `artifacts/perf/2026-05-07T10-02-39-414Z` used a `26000-35000ms` trace window
  and wrote `chrome-trace.json`, `cpu-profile.cpuprofile`, and
  `heap-sampling.json`. The sidecar
  `artifacts/perf/2026-05-07T10-02-39-414Z/projekt-143-max-frame-trace-probe/trace-probe.json`
  classifies the packet as
  `trace_captured_under_untrusted_deep_cdp_gpu_commit_stalls`. The capture is
  not baseline authority: validation FAIL, measurement trust FAIL, probe avg
  `1388.82ms`, probe p95 `1549.00ms`, avg frame `100.00ms`, and frames >50ms
  `100%`. The trace still gives lower-level separation evidence: `24539` trace
  events, `9994.77ms` span, longest `RunTask` `2544.94ms`, GPU-like max
  `2517.15ms`, render/commit-like max `2513.04ms`, GC-like count `76`, and
  GC-like max `0.90ms`. Next evidence must reduce CDP overhead or isolate trace
  from full CPU/heap profiling before owner proof.
- 2026-05-07 DEFEKT-3 trace-overhead isolation: `perf-capture.ts` now supports
  `--cdp-profiler <true|false>` and `--cdp-heap-sampling <true|false>`. The
  trace-only capture `artifacts/perf/2026-05-07T10-18-11-490Z` suppresses CPU
  profile and heap sampling and writes `chrome-trace.json`, but validation and
  measurement trust still FAIL. The no-CDP control
  `artifacts/perf/2026-05-07T10-22-24-265Z` also FAILS the same short/headless
  seed-42 shape. The sidecar
  `artifacts/perf/2026-05-07T10-18-11-490Z/projekt-143-trace-overhead-isolation/isolation.json`
  classifies the result as `control_capture_shape_untrusted_before_trace` with
  high confidence. The next trace packet must use the production-shaped
  combat120 harness before owner proof.
- 2026-05-07 DEFEKT-3 production-shaped trace-overhead isolation: headed
  combat120 seed `2718` at `artifacts/perf/2026-05-07T10-32-39-527Z` writes
  `chrome-trace.json` only (`149320928` bytes, `704069` events,
  `12323.96ms` span) with CPU profile and heap sampling suppressed. Measurement
  trust PASSES: probe avg `19.39ms`, probe p95 `29.00ms`, missed samples
  `0.0%`. Runtime validation still FAILS on `9.25s` frame-progress stall and
  `60.00ms` peak p99. The max-frame trace sidecar classifies
  `focused_trace_only_measurement_trusted` and records the first `100ms` max
  frame event at frame `22`, page time `24141.6ms`; longest trace event is
  `RunTask` `163.26ms`, GPU-like max `52.85ms`, render/commit-like max
  `1.01ms`, and GC-like max `9.39ms`. The isolation sidecar
  `artifacts/perf/2026-05-07T10-32-39-527Z/projekt-143-trace-overhead-isolation/isolation.json`
  compares against trusted control `artifacts/perf/2026-05-07T09-41-19-775Z`
  and classifies `trace_collection_overhead_not_detected`; Chrome trace
  collection is not the measured stall owner, and baseline refresh remains
  blocked by `maxFrameMs`.
- 2026-05-07 DEFEKT-3 AI method attribution: `CombatantAI` now exports
  per-frame method timing and slowest-update samples, and `perf-capture.ts`
  records them under `combatBreakdown.aiMethodMs` and
  `combatBreakdown.aiSlowestUpdate`. The standard combat120 capture
  `artifacts/perf/2026-05-07T11-09-31-428Z` is status-ok, validation WARN, and
  measurement-trusted. The sidecar
  `artifacts/perf/2026-05-07T11-09-31-428Z/projekt-143-ai-method-attribution/ai-method-attribution.json`
  records `82/88` runtime samples with method timing, no console `[AI spike]`,
  and a `100ms` max-frame boundary whose AI method leaders are only `0.1ms`.
  `perf:compare -- --scenario combat120` reports `6 pass, 1 warn, 1 fail`, so
  baseline refresh remains blocked.
- 2026-05-07 DEFEKT-3 corrected trace-category packet: focused trace-only
  capture with `--cdp-profiler false --cdp-heap-sampling false` no longer
  enables the V8 CPU profiler trace category. The pre-fix packet
  `artifacts/perf/2026-05-07T11-28-18-728Z/projekt-143-max-frame-trace-probe/trace-probe.json`
  recorded `CpuProfiler::StartProfiling` at `144.45ms`; the corrected packet
  `artifacts/perf/2026-05-07T11-32-00-011Z/projekt-143-max-frame-trace-probe/trace-probe.json`
  records no long trace-start instrumentation event. The corrected capture is
  measurement-trusted but validation-failed, with avg `17.03ms`, peak p99
  `65.50ms`, heap end-growth `2.67MB`, heap recovery `92.6%`, `216933` trace
  events, and longest trace event `RunTask` at `29.8ms`. The paired
  trace-boundary sidecar classifies `trace_boundary_owner_unresolved`; no
  baseline refresh is authorized. Current `perf:compare -- --scenario
  combat120` selects `artifacts/perf/2026-05-07T11-28-18-728Z` and fails with
  `5 pass, 1 warn, 2 fail`.
- 2026-05-07 DEFEKT-3 corrected bundle-callsite resolution: the sidecar
  `scripts/projekt-143-bundle-callsite-resolution.ts` now consumes
  `rendererMainTop` when the corrected trace packet has no renderer-main event
  above `50ms`. Packet
  `artifacts/perf/2026-05-07T11-45-11-238Z/projekt-143-bundle-callsite-resolution/callsite-resolution.json`
  resolves `index-BsYYgvZn.js:1736:12289` to `src/core/GameEngineLoop.ts`
  with `11/11` loop anchors, records absent sourcemaps, and classifies the
  owner as `bundle_callsite_resolved_to_game_engine_loop_render_boundary`.
  This is owner-review evidence only; it does not prove a runtime fix or assign
  the remaining Combat timing to a Combat AI callsite.
- 2026-05-07 DEFEKT-3 CombatAI source timing: `CombatantSystem` now emits
  `CombatAI.*` user-timing measures under the existing perf diagnostics gate,
  and the AI method-attribution sidecar reports those timings beside
  `combatBreakdown.aiMethodMs`. The standard headed combat120 capture
  `artifacts/perf/2026-05-07T11-54-40-005Z` is status-ok, validation-WARN, and
  measurement-trusted. Packet
  `artifacts/perf/2026-05-07T11-54-40-005Z/projekt-143-ai-method-attribution/ai-method-attribution.json`
  classifies `combat_ai_user_timing_and_method_surface_captured_no_console_spike`
  with low confidence. Leaders are `CombatAI.frame.total:31.4ms`,
  `CombatAI.method.state.engaging:30.4ms`, and
  `CombatAI.slowest.engaging.high:30.3ms`; aggregate method leaders are
  `state.patrolling:41.4ms`, `state.engaging:40.7ms`, and
  `patrol.canSeeTarget:34.7ms`. `perf:compare -- --scenario combat120` fails
  with `6 pass, 0 warn, 2 fail`, so baseline refresh remains blocked.
- 2026-05-07 DEFEKT-3 CombatAI engage-subphase timing: `AIStateEngage` now
  emits nested diagnostic timings through the existing `CombatAI.*` method
  profiler. The standard headed combat120 capture
  `artifacts/perf/2026-05-07T12-05-22-025Z` is status-ok, validation-WARN, and
  measurement-trusted. Packet
  `artifacts/perf/2026-05-07T12-05-22-025Z/projekt-143-ai-method-attribution/ai-method-attribution.json`
  classifies `combat_ai_user_timing_and_method_surface_captured_no_console_spike`
  with low confidence. Leaders are `CombatAI.frame.total:35.9ms`,
  `CombatAI.method.state.engaging:33.9ms`,
  `CombatAI.method.engage.suppression.initiate:33.6ms`, and
  `CombatAI.method.engage.suppression.lineOfSight:5ms`; aggregate method
  leaders are `state.engaging:46.3ms`,
  `engage.suppression.lineOfSight:25.6ms`, and
  `engage.suppression.initiate:13.7ms`. `perf:compare -- --scenario combat120`
  fails with `6 pass, 1 warn, 1 fail`, so baseline refresh remains blocked.
- 2026-05-07 DEFEKT-3 CombatAI suppression-initiation subphase timing:
  `AIStateEngage.initiateSquadSuppression` now emits diagnostic timings for
  suppressor assignment, flank destination computation, flank cover search,
  flanker assignment, and suppression logging. The standard headed combat120
  capture `artifacts/perf/2026-05-07T12-18-13-491Z` is status-ok,
  validation-WARN, and measurement-trusted. Packet
  `artifacts/perf/2026-05-07T12-18-13-491Z/projekt-143-ai-method-attribution/ai-method-attribution.json`
  classifies `combat_ai_user_timing_and_method_surface_captured_no_console_spike`
  with low confidence. Leaders are `CombatAI.frame.total:30ms`,
  `CombatAI.method.state.engaging:29ms`,
  `CombatAI.method.engage.suppression.initiate:28.9ms`, and
  `CombatAI.method.engage.suppression.initiate.coverSearch:28.9ms`; aggregate
  method leaders are `state.patrolling:39ms`, `state.engaging:37ms`,
  `patrol.canSeeTarget:31.5ms`, and `engage.suppression.lineOfSight:29.4ms`.
  `perf:compare -- --scenario combat120` fails with `7 pass, 0 warn, 1 fail`,
  so baseline refresh remains blocked.
- 2026-05-07 DEFEKT-3 suppression raycast score-gate review:
  `scripts/projekt-143-suppression-raycast-cost-review.ts` consumes the fresh
  counter-bearing combat120 artifact, the prior cost packet, and the suppression
  cover-cache packet, then proves the cap-preserved sorted score-gate raycast
  reduction. Packet
  `artifacts/perf/2026-05-07T14-17-57-778Z/projekt-143-suppression-raycast-cost-review/suppression-raycast-cost-review.json`
  records suppression cover searches `54`, uncached searches `54`, cache hits
  `0`, height queries `1296`, cover tests `79`, score-gate checks `529`,
  score-gate skips `450`, terrain raycasts `79`, raycasts per uncached search
  `1.463`, raycasts per suppression search `1.463`, raycast reach rate `0.061`,
  and high-confidence classification
  `suppression_raycast_score_gate_reduces_raycastTerrain_under_two_search_cap`.
  The before/after comparison moves raycasts per uncached search `7.51 -> 1.463`.
- 2026-05-07 DEFEKT-3 repeatability/max-frame packet: the follow-up headed
  combat120 capture at `artifacts/perf/2026-05-07T14-29-53-738Z` is status-ok,
  validation-WARN, and measurement-trusted, but `perf:compare -- --scenario
  combat120` fails with `6 pass, 1 warn, 1 fail`: avg `15.14ms` WARN and
  max-frame `100.00ms` FAIL. The max-frame sidecar
  `artifacts/perf/2026-05-07T14-29-53-738Z/projekt-143-max-frame-attribution/max-frame-attribution.json`
  classifies `browser_native_gc_or_uninstrumented_render_present` with high
  confidence. The repeated suppression raycast-cost sidecar records `404`
  score-gate skips, `100` terrain raycasts, and raycasts per uncached search
  `7.51 -> 1.961`; suppression raycast cost is no longer the next owner.
- 2026-05-07 DEFEKT-3 focused trace-boundary packet: the headed combat120
  trace-only capture at `artifacts/perf/2026-05-07T14-38-32-797Z` is status-ok,
  validation-WARN, and measurement-trusted. `perf:compare -- --scenario
  combat120` now selects it and fails with `5 pass, 1 warn, 2 fail`: avg
  `15.52ms` WARN, p99 `47.60ms` FAIL, and max-frame `100.00ms` FAIL. The trace
  probe
  `artifacts/perf/2026-05-07T14-38-32-797Z/projekt-143-max-frame-trace-probe/trace-probe.json`
  classifies `focused_trace_only_measurement_trusted`; the isolation packet
  `artifacts/perf/2026-05-07T14-38-32-797Z/projekt-143-trace-overhead-isolation/isolation.json`
  classifies `trace_collection_overhead_not_detected` against the non-trace
  control `artifacts/perf/2026-05-07T14-29-53-738Z`; the boundary packet
  `artifacts/perf/2026-05-07T14-38-32-797Z/projekt-143-trace-boundary-attribution/boundary-attribution.json`
  remains `trace_boundary_owner_unresolved`. Baseline refresh remains blocked.
- 2026-05-07 DEFEKT-3 bundle-callsite resolution:
  `artifacts/perf/2026-05-07T14-38-32-797Z/projekt-143-bundle-callsite-resolution/callsite-resolution.json`
  consumes the same trace-boundary packet and resolves
  `index-BLeRv-jb.js:1736:12289` to `src/core/GameEngineLoop.ts` /
  `RenderMain` with `11/11` source anchors, no sourcemap, and medium-confidence
  `bundle_callsite_resolved_to_game_engine_loop_render_boundary`. This advances
  source-boundary ownership only; it does not prove a runtime fix or authorize
  baseline refresh.
- 2026-05-07 DEFEKT-3 render-boundary timing:
  `artifacts/perf/2026-05-07T14-53-44-437Z/projekt-143-render-boundary-timing/render-boundary-timing.json`
  consumes a standard headed combat120 capture and classifies
  `render_main_renderer_render_user_timing_contains_peak_longtask` with high
  confidence. The source capture is status-ok, validation-WARN, and
  measurement-trusted: avg `16.82ms`, p99 `34.50ms`, max-frame `100.00ms`, heap
  end-growth `10.99MB`, and heap recovery `62.5%`. `perf:compare -- --scenario
  combat120` fails with `6 pass, 1 warn, 1 fail`; max-frame remains the hard
  blocker. Peak frame `37` records `100ms`, long task `120ms`, LoAF `121.20ms`,
  WebGL upload `0.10ms`, and peak-sample `GameEngineLoop.RenderMain.renderer.render`
  max `116.10ms`. Cumulative `renderer.render` max is `308.90ms`. This packet
  moves the next action to lower-level renderer/present or browser-task
  subdivision; it does not authorize baseline refresh.
- 2026-05-07 DEFEKT-3 suppression cover-cache review:
  `scripts/projekt-143-suppression-cover-cache-review.ts` consumes the fresh
  counter-bearing combat120 artifact plus the cache-locality packet and proves
  the skip-reason split. Packet
  `artifacts/perf/2026-05-07T13-44-30-139Z/projekt-143-suppression-cover-cache-review/suppression-cover-cache-review.json`
  records suppression initiations `28`, flank-destination computations `60`,
  suppression cover searches `50`, assign-flanker calls `60`, search-skip-or-cap
  delta `10`, destination-reuse skips `0`, max-search-cap skips `10`, terrain
  raycasts `368`, and high-confidence classification
  `suppression_cover_skip_reasons_countered`.
- 2026-05-07 DEFEKT-3 cover-cache locality review:
  `scripts/projekt-143-cover-cache-locality-review.ts` consumes the fresh
  counted combat120 artifact and proves the zero-cache-hit class is caller
  locality under `engage.suppression.initiate.coverSearch`, not a generic
  same-frame cache-width failure. Packet
  `artifacts/perf/2026-05-07T13-26-30-853Z/projekt-143-cover-cache-locality-review/cover-cache-locality-review.json`
  records cache stores/hits `46/0`, suppression flank cover searches `46`,
  normal fallback AICoverFinding searches `0`, active `engage.cover.findBestCover`
  calls `1384`, terrain raycasts `231`, and high-confidence classification
  `cover_cache_miss_explained_by_suppression_flank_unique_probe_path`.
- 2026-05-07 DEFEKT-3 cover-raycast cadence: `scripts/projekt-143-cover-raycast-cadence.ts` and `CombatantAI` method-total counters now quantify raw `AICoverFinding` raycast/cache cadence. Fresh counted artifact `artifacts/perf/2026-05-07T13-13-32-364Z/projekt-143-cover-raycast-cadence/cover-raycast-cadence.json` records `231` raw raycast calls, `0` cache hits, `46` cache stores, and compare `6 pass, 0 warn, 2 fail`; baseline refresh remains blocked.
- 2026-05-07 DEFEKT-3 cover-search raycast attribution:
  `AICoverFinding` now exposes diagnostic timings for terrain cover-test height
  gate, distance, eye setup, direction, terrain raycast, and hit result under
  the existing terrain cover-test label.
  The standard headed combat120 capture
  `artifacts/perf/2026-05-07T12-53-55-417Z` is status-ok, validation-WARN, and
  measurement-trusted. Packet
  `artifacts/perf/2026-05-07T12-53-55-417Z/projekt-143-cover-search-attribution/cover-search-attribution.json`
  classifies `cover_search_internal_owner_terrainScan.coverTest.raycastTerrain` with medium
  confidence. `1/88` samples carry internal cover timing labels. The top
  internal cover method is `cover.findNearestCover.terrainScan:27.5ms`; top
  terrain-scan submethod is `cover.findNearestCover.terrainScan.coverTest:27.4ms`;
  top terrain cover-test submethod is
  `cover.findNearestCover.terrainScan.coverTest.raycastTerrain:27.1ms`. Top
  inclusive cover leaders are `cover.findNearestCover.terrainScan:27.5ms`,
  `engage.suppression.initiate.coverSearch:27.5ms`,
  `cover.findNearestCover.terrainScan.coverTest:27.4ms`, and
  `cover.findNearestCover.terrainScan.coverTest.raycastTerrain:27.1ms`.
  `perf:compare -- --scenario combat120` fails with `6 pass, 1 warn, 1 fail`,
  so baseline refresh remains blocked.
- 2026-05-02 KB-METRIK first patch: `perf-capture.ts` now writes
  `measurement-trust.json`, embeds `measurementTrust` in `summary.json`, and
  adds a `measurement_trust` check to `validation.json`. A capture with no
  runtime samples, missed samples, or high harness probe round-trip is marked
  untrusted before its frame-time numbers are used for regression decisions.
- 2026-05-02 KB-METRIK continuation: perf capture now binds and navigates via
  `127.0.0.1`, avoiding Windows `localhost` ambiguity. It also writes
  `scene-attribution.json` after sampling, not during sampling, so object census
  work cannot distort frame timing. Headless Chromium was explicitly separated
  from headed evidence in this session: headless captures failed measurement
  trust, while a headed perf-build control at
  `artifacts/perf/2026-05-02T16-37-21-875Z` passed measurement trust
  (`probeAvg=14.00ms`, `probeP95=17.00ms`, missed samples `0%`) with avg frame
  `14.23ms`, no browser errors, heap recovery PASS, and only a p99 warning.
- 2026-05-02 scene-attribution status: the artifact now includes example and
  visible-example meshes per bucket, uses effective parent visibility, counts
  zero-live-instance instanced meshes as zero live triangles, and classifies the
  actual runtime path prefixes for Pixel Forge NPCs/weapons plus water and
  atmosphere. In the latest control capture, visible unattributed triangles are
  244, below 1% of the main-scene visible triangle census.
- 2026-05-02 scene-residency finding: even with `npcs=0`, the control capture
  shows hidden resident close-NPC pools: `npc_close_glb` contributes 1,360
  resident meshes / 132,840 resident triangles and `weapons` contributes 8,480
  resident meshes / 133,440 resident triangles, both effectively invisible.
  Treat this as startup/memory/first-use evidence for KB-LOAD and KB-CULL, not
  as current-frame visible render cost.
- 2026-05-02 KB-LOAD measurement opened: after a fresh `npm run build`, retail
  headed startup benchmarks ran three iterations for Open Frontier and Zone
  Control. Open Frontier averaged 5457.3ms from mode click to playable at
  `artifacts/perf/2026-05-02T18-30-01-826Z/startup-ui-open-frontier`; Zone
  Control averaged 5288.3ms at
  `artifacts/perf/2026-05-02T18-30-45-200Z/startup-ui-zone-control`. The
  operator-visible stall is real, but the Open Frontier lead over Zone Control
  was only 169.0ms in this sample. In both modes, most measured post-selection
  time sits after deploy click in live entry, not in the named pre-deploy
  terrain/navmesh stages.
- 2026-05-02 startup label fix: `SystemInitializer` now emits
  `systems.init.<registryKey>.*` marks instead of constructor-name marks, because
  production minification made the previous retail labels unreadable. The
  validation startup artifact
  `artifacts/perf/2026-05-02T18-35-49-488Z/startup-ui-open-frontier` confirms
  stable labels such as `systems.init.combatantSystem` and measured
  `combatantSystem` init at 576.9ms in that one run.
- 2026-05-02 live-entry instrumentation: `LiveEntryActivator` now emits named
  marks for hide-loading, player positioning, terrain chunk flush, renderer
  reveal, player/HUD enable, audio start, combat enable, background task
  scheduling, and `enterLive()`. Startup UI benchmarks now install the existing
  browser-stall observer, preserve long-task/long-animation-frame attribution,
  and write `browser-stalls.json` plus per-run Chrome CPU profiles.
- 2026-05-02 live-entry finding: after those marks landed, Open Frontier still
  averaged 5298.0ms from mode click to playable over three runs at
  `artifacts/perf/2026-05-02T19-01-27-585Z/startup-ui-open-frontier`. The
  measured live-entry span averaged about 3757ms, almost entirely inside
  `flush-chunk-update` after the synchronous terrain update had ended. The
  observer-enabled artifact
  `artifacts/perf/2026-05-02T19-03-09-195Z/startup-ui-open-frontier` recorded a
  3813ms long task during that yield window. A later CPU-profiled artifact at
  `artifacts/perf/2026-05-02T19-11-07-930Z/startup-ui-open-frontier` recorded a
  3850ms long task and attributed the dominant CPU self-time to Three's
  WebGLState `texSubImage2D` wrapper (`3233.9ms`). Treat the next KB-LOAD target
  as first-present texture upload attribution and residency policy, not generic
  terrain update cost.
- 2026-05-02 texture-upload attribution: after adding diagnostic WebGL upload
  wrapping and source URL capture, the headed Open Frontier artifact
  `artifacts/perf/2026-05-02T19-19-47-099Z/startup-ui-open-frontier` recorded
  324 texture upload calls, `3157.8ms` total upload wrapper time, and a
  `2342.3ms` max `texSubImage2D`. The largest upload was
  `assets/pixel-forge/vegetation/giantPalm/palm-quaternius-2/imposter.png`
  at `4096x2048`; the rest of the high-cost list is dominated by Pixel Forge
  vegetation imposter maps and `2688x1344` NPC animated albedo atlases. This
  artifact is diagnostic; do not compare its timing directly against unwrapped
  startup runs.
- 2026-05-02 summary validation: after adding WebGL upload fields to
  `summary.json`, the headed artifact
  `artifacts/perf/2026-05-02T19-21-53-436Z/startup-ui-open-frontier` wrote
  `webglTextureUploadCount=345`, `webglTextureUploadTotalDurationMs=2757.2ms`,
  and `webglTextureUploadMaxDurationMs=1958.0ms`. The largest upload was again
  `assets/pixel-forge/vegetation/giantPalm/palm-quaternius-2/imposter.png`.
- 2026-05-02 texture inventory gate: `npm run check:pixel-forge-textures`
  writes `artifacts/perf/<timestamp>/pixel-forge-texture-audit/texture-audit.json`.
  The current artifact
  `artifacts/perf/2026-05-02T19-33-14-632Z/pixel-forge-texture-audit/texture-audit.json`
  inventories all 42 registered Pixel Forge textures with no missing files,
  38 flagged textures, 26,180,240 source bytes, and 781.17MiB estimated
  mipmapped RGBA residency. The audit flags giantPalm color and normal atlases
  as hard failures at 42.67MiB each and all 28 NPC albedo atlases as warning
  textures at 18.38MiB each. It also flags vegetation oversampling above
  80 pixels per runtime meter: giantPalm is 81.5px/m and bananaPlant is
  108.02px/m. Its candidate-size projection reduces estimated residency to
  373.42MiB, saving 407.75MiB if every flagged texture is regenerated to the
  proposed target. Scenario estimates in
  `artifacts/perf/2026-05-02T19-34-49-412Z/pixel-forge-texture-audit/texture-audit.json`
  are: no vegetation normals `647.97MiB`, vegetation candidates only
  `589.3MiB`, vegetation candidates without normals `551.97MiB`, NPC candidates
  only `565.42MiB`, all candidates `373.42MiB`. This is planning evidence, not
  a visual sign-off.
- 2026-05-02 KB-EFFECTS grenade-spike probe: `npm run perf:grenade-spike`
  records matched baseline and detonation windows plus frag detonation user
  timings. The low-load two-grenade artifact
  `artifacts/perf/2026-05-02T20-21-05-603Z/grenade-spike-ai-sandbox` reproduced
  a first-use stall: baseline p95/p99/max were `22.6ms / 23.6ms / 25.0ms`,
  detonation p95/p99/max were `25.7ms / 30.6ms / 100.0ms`, and the first
  trigger aligned with a `379ms` long task and `380.5ms` long animation frame.
  Two grenade detonations measured only `1.4ms` total JS frag work with
  sub-millisecond pool, audio, damage, camera-shake, and event steps. The CPU
  profile points at first visible Three/WebGL render and program work
  (`updateMatrixWorld`, `getProgramInfoLog`, `renderBufferDirect`), not at the
  grenade gameplay code. The 120-NPC artifact
  `artifacts/perf/2026-05-02T20-19-04-818Z/grenade-spike-ai-sandbox` is not a
  valid isolation capture because its baseline is already saturated at
  `100ms` frames before detonation.
- 2026-05-03 KB-EFFECTS low-load refresh and rejected warmups: current-HEAD
  before evidence
  `artifacts/perf/2026-05-03T22-09-54-365Z/grenade-spike-ai-sandbox`
  reproduced the first-use stall with baseline p95/max `22.6ms / 24.2ms`,
  detonation p95/max `22.5ms / 100.0ms`, max-frame delta `75.8ms`, one
  `379ms` long task, two LoAF entries, CPU profile present, and
  `kb-effects.grenade.frag.total=1.4ms` total / `0.9ms` max. Three matched
  visible warmup attempts were rejected and reverted:
  `artifacts/perf/2026-05-03T22-12-40-344Z/grenade-spike-ai-sandbox`
  explosion-only warmup still hit detonation max `100.0ms` and a `397ms` long
  task,
  `artifacts/perf/2026-05-03T22-16-26-287Z/grenade-spike-ai-sandbox`
  full frag render-path warmup still hit detonation max `100.0ms` and a
  `387ms` long task, and
  `artifacts/perf/2026-05-03T22-18-02-801Z/grenade-spike-ai-sandbox`
  culling-forced full frag warmup still hit detonation max `100.0ms` and a
  `373ms` long task. No grenade remediation is claimed; the next KB-EFFECTS
  branch must add render-frame attribution before another warmup.
- 2026-05-03 KB-EFFECTS render attribution and first unlit explosion
  remediation: before remediation,
  `artifacts/perf/2026-05-03T22-36-46-874Z/grenade-spike-ai-sandbox`
  attributed the first trigger to a `380ms` `webgl.render.main-scene` call and
  nested `178.2ms` main-scene render work while dynamic explosion
  `PointLight` instances were still pooled in the scene. After removing
  grenade explosion `PointLight` creation/pooling entirely,
  `artifacts/perf/2026-05-03T23-04-07-778Z/grenade-spike-ai-sandbox` recorded
  baseline p95/max `36.1ms / 48.1ms`, detonation p95/max
  `31.0ms / 100.0ms`, `0` browser long tasks, trigger-adjacent main-scene
  render max `29.5ms`, and `kb-effects.grenade.frag.total=2.0ms` total /
  `1.4ms` max. This final schema-refresh run is noisier than
  `artifacts/perf/2026-05-03T22-57-28-665Z/grenade-spike-ai-sandbox`, but both
  artifacts remove the `300ms+` trigger-adjacent render call. This is accepted
  as first remediation evidence for the dynamic light render/program stall, not
  final KB-EFFECTS closeout: measurement trust is `warn` because the latest
  artifact still has one pre-trigger LoAF and a `100.0ms` max frame to
  classify.
- 2026-05-03 KB-EFFECTS trust closeout:
  `artifacts/perf/2026-05-03T23-25-20-507Z/grenade-spike-ai-sandbox` moved
  final observer/frame-metric arming into the first live grenade's
  `requestAnimationFrame` callback. The low-load two-grenade probe is PASS for
  measurement trust: CPU profile, browser long-task observer, LoAF observer,
  disabled WebGL upload observer, and render attribution are all present.
  Baseline p95/max are `23.5ms / 27.6ms`; detonation p95/max are
  `24.3ms / 30.2ms`; max-frame delta is `2.6ms`; hitch50 delta is `0`;
  detonation long tasks are `0`; trigger/post-trigger LoAF count is `0`;
  near-trigger main-scene render max is `23.6ms`; and
  `kb-effects.grenade.frag.total=1.5ms` total / `0.9ms` max. This closes the
  low-load grenade first-use stall for the unlit pooled explosion path. It
  does not close saturated combat120 grenade behavior or future explosion
  visual-polish changes.
- 2026-05-02 KB-OPTIK imposter optics audit:
  `npm run check:pixel-forge-optics` wrote
  `artifacts/perf/2026-05-02T20-54-56-960Z/pixel-forge-imposter-optics-audit/optics-audit.json`.
  It flagged `28/28` runtime NPC atlases and `2/7` vegetation atlases. NPC
  median visible tile height is `65px` inside a `96px` tile, runtime/source
  height ratio median is `2.63x`, and runtime effective resolution is only
  `21.69px/m`. The audit also records the shader-contract split: NPC imposters
  use a separate straight-alpha `ShaderMaterial`, vegetation uses a
  premultiplied atmosphere-aware `RawShaderMaterial`, and close GLBs use the
  regular Three material path. Treat this as root-cause evidence for
  brightness/size investigation, not as visual sign-off.
- 2026-05-02 KB-TERRAIN vegetation horizon audit:
  `npm run check:vegetation-horizon` wrote
  `artifacts/perf/2026-05-02T21-29-15-593Z/vegetation-horizon-audit/horizon-audit.json`.
  It compares camera far planes, visual terrain extents, vegetation cell
  residency, biome palettes, and shader fade/max distances. The registry max
  vegetation draw distance is `600m`, while scatterer residency reaches
  `832m` on-axis and `1176.63m` at the cell-square corner, so large-mode
  horizon loss is shader-distance limited before it is scatterer-limited.
  Open Frontier exposes an estimated `396.79m` terrain band beyond visible
  vegetation; A Shau exposes `3399.2m` because its camera far plane is `4000m`.
  Treat this as static coverage evidence; a runtime elevated-camera screenshot
  harness is still required before accepting a far-canopy implementation.
- 2026-05-02 KB-STRATEGIE WebGL/WebGPU audit:
  `npm run check:webgpu-strategy` wrote
  `artifacts/perf/2026-05-02T21-37-39-757Z/webgpu-strategy-audit/strategy-audit.json`.
  Active runtime source has `0` WebGPU matches, `5` WebGL renderer entrypoints
  including dev/viewer tools, and `94` migration-blocker matches across custom
  shader/material/post-processing/WebGL-context usage. The retained E2 spike
  measured a keyed-instanced NPC-shaped path at about `2.02ms` avg for `3000`
  instances and recommended deferring WebGPU migration. Treat WebGPU as a
  post-stabilization spike target, not a current perf remediation.
- 2026-05-06 KB-STRATEGIE near-metal platform-track refresh:
  `npm run check:webgpu-strategy` wrote
  `artifacts/perf/2026-05-06T05-53-35-718Z/webgpu-strategy-audit/strategy-audit.json`
  through the refreshed static Projekt suite. Active runtime source still has
  `0` WebGPU matches; the broader repo now has `12` WebGL renderer entrypoints
  including proof/review tools and `113` migration-blocker matches. The new
  `nearMetalPlatformTrack` inventories existing GPU timing, device-class,
  OffscreenCanvas, SharedArrayBuffer, cross-origin isolation, and worker-render
  source hooks, then records browser capability probing as a guarded follow-up
  path rather than runtime evidence.
  The audit excludes Projekt tooling self-references, including the completion
  audit and platform probe, so `activeWebgpuSourceMatches=0` reflects runtime
  source instead of routing-tool field names.
  The guarded browser probe command is now
  `npm run check:projekt-143-platform-capabilities`. The headless browser run at
  `artifacts/perf/2026-05-06T06-03-26-013Z/projekt-143-platform-capability-probe/summary.json`
  is WARN inventory: WebGL2 is available through SwiftShader,
  `EXT_disjoint_timer_query_webgl2` is unavailable, `navigator.gpu` has no
  WebGPU adapter, OffscreenCanvas WebGL2 and isolated SharedArrayBuffer pass,
  and local `_headers` plus live Pages COOP/COEP headers pass. Prefer a headed
  hardware-backed quiet-machine rerun before any architecture decision. This is
  a read-only platform-utilization path, not migration approval.
- 2026-05-02 Cycle 0 static evidence suite:
  `npm run check:projekt-143` wrote
  `artifacts/perf/2026-05-02T22-05-00-955Z/projekt-143-evidence-suite/suite-summary.json`.
  The suite passed KB-CULL texture audit, KB-OPTIK imposter optics audit,
  KB-TERRAIN vegetation horizon audit, and KB-STRATEGIE WebGPU audit. It does
  not run `perf:grenade-spike`; that remains a separate headed runtime probe.
- 2026-05-02 Cycle 1 baseline bundle:
  `npm run check:projekt-143-cycle1-bundle -- ...` wrote
  `artifacts/perf/2026-05-02T22-24-03-223Z/projekt-143-cycle1-benchmark-bundle/bundle-summary.json`
  for source HEAD `cef45fcc906ebe4357009109e2186c83c2a38426`, with local
  retail and perf manifests reporting the same SHA. The bundle status is
  WARN: Open Frontier short and A Shau short passed measurement trust, startup
  UI and grenade-spike artifacts are diagnostic by design, and combat120 failed
  measurement trust with `probeAvg=149.14ms` / `probeP95=258ms`. Do not use the
  combat120 frame-time numbers for regression decisions until a trusted rerun
  exists.
- 2026-05-02 Cycle 1 startup evidence: headed retail Open Frontier startup
  wrote
  `artifacts/perf/2026-05-02T22-07-48-283Z/startup-ui-open-frontier` and
  averaged `6180.7ms` mode-click-to-playable, while Zone Control wrote
  `artifacts/perf/2026-05-02T22-08-46-576Z/startup-ui-zone-control` and
  averaged `6467.7ms`. Both include WebGL upload attribution and three CPU
  profiles. The largest upload in both modes remains Pixel Forge vegetation,
  especially giantPalm albedo.
- 2026-05-03 KB-LOAD first runtime warmup: `AssetLoader.warmGpuTextures()`
  uploads the giantPalm color/normal pair before renderer reveal and emits
  `kb-load.texture-upload-warmup.*` user timings. Paired headed retail
  artifacts are:
  `artifacts/perf/2026-05-03T21-45-13-207Z/startup-ui-open-frontier` ->
  `artifacts/perf/2026-05-03T22-01-10-796Z/startup-ui-open-frontier`, and
  `artifacts/perf/2026-05-03T21-46-34-676Z/startup-ui-zone-control` ->
  `artifacts/perf/2026-05-03T22-02-28-966Z/startup-ui-zone-control`.
  Open Frontier deploy-click-to-playable moved `4685.7ms` to `4749.0ms`,
  while WebGL upload total/max averages moved `3341.0/2390.5ms` to
  `1157.2/275.4ms`. Zone Control deploy-click-to-playable moved `4909.0ms`
  to `4939.0ms`, while WebGL upload total/max averages moved
  `3340.6/2379.4ms` to `1229.6/360.1ms`. A fanPalm expansion artifact was
  worse in both modes and was not kept:
  `artifacts/perf/2026-05-03T21-54-02-583Z/startup-ui-open-frontier` and
  `artifacts/perf/2026-05-03T21-55-18-768Z/startup-ui-zone-control`.
  Treat this as partial startup-upload remediation plus next-target evidence,
  not as a startup-latency win, clean frame-time baseline, or production parity
  proof.
- 2026-05-05 KB-LOAD vegetation-normal proof mode: `perf-startup-ui.ts`
  gained `--disable-vegetation-normals`, which writes candidate folders under
  `startup-ui-<mode>-vegetation-normals-disabled/` and keeps default startup
  baselines separate. Open Frontier candidate proof
  `artifacts/perf/2026-05-05T05-31-24-775Z/startup-ui-open-frontier-vegetation-normals-disabled/summary.json`
  averaged `4420ms` mode-click-to-playable and `3741.333ms`
  deploy-click-to-playable, but the upload table is noisy because an
  `(inline-or-unknown)` upload reached `1736.4ms`. Zone Control candidate proof
  `artifacts/perf/2026-05-05T05-28-07-843Z/startup-ui-zone-control-vegetation-normals-disabled/summary.json`
  averaged `3203.667ms` mode-click-to-playable, `2631.667ms`
  deploy-click-to-playable, `767.467ms` WebGL upload total, and `492.667`
  upload calls. This is not an accepted art or runtime policy change; vegetation
  normal-map removal is rejected for default policy while the latest visual
  proof remains WARN.
- 2026-05-05 KB-LOAD/OPTIK vegetation-normal visual proof:
  `npm run check:projekt-143-vegetation-normal-proof` wrote
  `artifacts/perf/2026-05-05T12-15-23-150Z/projekt-143-vegetation-normal-proof/summary.json`
  and contact sheet
  `artifacts/perf/2026-05-05T12-15-23-150Z/projekt-143-vegetation-normal-proof/contact-sheet.png`.
  It captured `8/8` screenshots, `4/4` default-versus-no-normal pairs,
  renderer stats, vegetation counters, and `0` browser/page/request failures.
  Mechanical deltas stayed inside the review band with max mean absolute RGB
  delta `15.595` and max absolute mean luma delta `8.284%`, but the proof is
  WARN until human visual review accepts the contact sheet. A later
  2026-05-06 refresh exceeded the review band, so default runtime policy stays
  on vegetation normal maps unless a future PASS or owner-accepted proof
  replaces that result.
- 2026-05-02 Cycle 1 trusted steady-state evidence: Open Frontier short wrote
  `artifacts/perf/2026-05-02T22-11-29-560Z` with measurement trust PASS,
  avg/p95/p99/max `23.70/29.20/32.70/100ms`, 4 hitches above `50ms`, renderer
  stats, and scene attribution with `0%` visible unattributed triangles. A Shau
  short wrote `artifacts/perf/2026-05-02T22-15-19-678Z` with measurement trust
  PASS, avg/p95/p99/max `12.04/18.30/31.50/48.50ms`, no `>50ms` hitches,
  renderer stats, and scene attribution with `0%` visible unattributed
  triangles.
- 2026-05-02 Cycle 1 grenade-spike evidence:
  `artifacts/perf/2026-05-02T22-19-40-381Z/grenade-spike-ai-sandbox` used
  `npcs=2` and two grenades after warmup. It still reproduced the first-use
  stall: baseline p95/p99/max `21.8/22.6/23.2ms`, detonation p95/p99/max
  `23.7/32.5/100ms`, one `387ms` long task, two LoAF entries, and
  `kb-effects.grenade.frag.total=2.5ms` total. CPU profile is present; no
  grenade remediation is claimed.

## Validation Gates

Automated checks: frame progression, mean/tail frame timing, hitch ratios (>50ms, >100ms), over-budget ratio, combat shot/hit sanity, heap behavior (growth, peak, recovery), runtime UI contamination.

`perf:compare` always prints PASS/WARN/FAIL rows. `FAIL` remains locally blocking when you use `validate:full`, while hosted CI keeps the artifacts and reports the failure without blocking deploy. `WARN` is reported but non-blocking by default so recovered-but-not-yet-rebaselined scenarios still surface in logs. Use `perf:compare:strict` or `--fail-on-warn` when you want warnings to fail locally.

`peak_max_frame_ms` classification: pass <120, warn 120-299, fail >=300.

## Current Scenario Health

All tracked scenarios have 2026-04-20 baselines. The DEFEKT-1 audit at
`artifacts/perf/2026-05-07T18-32-07-183Z/projekt-143-stale-baseline-audit/stale-baseline-audit.json`
classifies `0/4` scenarios as refresh-eligible and `4/4` as stale by age. The
`frontier30m` script has now been fixed to run as a non-terminal Open Frontier
soak, but the tracked baseline is still the older semantically compromised
capture where Open Frontier reached victory around 879s. Refresh it only from a
quiet-machine perf session after the audit reports strict eligibility.

| Scenario | Status | Avg | p99 | Notes |
|----------|--------|----:|----:|-------|
| `combat120` | FAIL | 16.19ms* | 34.20ms* | Latest status-ok capture `2026-05-07T17-28-02-506Z` is validation WARN and measurement trust WARN. The sparse ground-marker tagging proof at `2026-05-07T17-28-02-506Z/projekt-143-ground-marker-tagging-proof` records `unattributed` draw share movement `0.2991 -> 0.0202` and new `npc_ground_markers` draw share `0.3232` after the rebuilt source tagged `PixelForgeNpcGroundMarker.${key}` with `userData.perfCategory = 'npc_ground_markers'`. The paired KB-METRIK packet records raw probe p95 `30ms`, avg `28.93ms`, max `348ms`, `3/87` samples over `75ms`, and `3505993` render-submission bytes, avoiding the per-sample overhead class proven by `2026-05-07T17-19-54-240Z`. The latest accepted measurement-PASS owner packet remains `2026-05-07T16-23-11-889Z/projekt-143-render-submission-category-attribution`. `perf:compare -- --scenario combat120` selects `2026-05-07T17-28-02-506Z` and fails with `6 pass, 1 warn, 1 fail`: avg `16.19ms` WARN and max-frame `100.00ms` FAIL. Baseline refresh remains blocked. |
| `openfrontier:short` | WARN | 8.33ms | 32.7ms | Latest detected capture `2026-05-06T22-39-50-930Z` has validation WARN and comparison `7 pass, 1 warn, 0 fail`; heap growth is WARN at `20.64MB`. Baseline refresh remains blocked. |
| `ashau:short` | FAIL | 5.67ms | 19.6ms | Latest detected capture `2026-05-06T22-44-28-979Z` has validation PASS and measurement trust PASS but comparison `5 pass, 2 warn, 1 fail`; max-frame `100.00ms` fails. Baseline refresh remains blocked. |
| `frontier30m` | FAIL | 6.57ms | 100.0ms | Latest detected soak capture `2026-03-06T19-56-21-207Z` is failed, validation FAIL, and not refresh-eligible. The tracked 2026-04-20 baseline predates the non-terminal soak fix and remains stale. |

- `combat120` values marked with `*` come from the latest status-ok but validation-WARN capture selected by `perf:compare`; the current selected capture is post-tag attribution movement proof with measurement trust WARN, not a baseline-eligible capture.
- Current scenario status rows are gate status, not accepted replacement baselines.

*`frontier30m` script semantics are fixed as of Cycle 2; the baseline still needs a quiet-machine refresh.

Pre drift-correction baseline for `combat120` (2026-04-16T23:06): avg 17.08ms, p99 34.40ms, max 47.30ms.

## Known Bottlenecks

0. **Cycle 2 fixed-wing feel and interpolation** - first-pass render/camera
   smoothing is implemented and probed. Human playtest still needs to determine
   whether any remaining stiffness or porpoise is an airframe damping/control
   law issue. Do not refresh perf baselines from sessions with background games
   or other GPU-heavy apps running.
1. **Combat120 close-actor render dominance** - the 2026-05-07 DEFEKT-3
   isolation at
   `artifacts/perf/2026-05-07T04-28-10-437Z/projekt-143-close-npc-isolation/summary.json`
   disables close GLB actors through `perfDisableNpcCloseModels=1` and moves the
   standard 120-NPC AI Sandbox capture from validation FAIL to validation WARN
   with measurement trust PASS. Average frame time moves `94.34ms` to `18.98ms`,
   Combat avg `24.96ms` to `5.14ms`, billboard/render avg `14.32ms` to
   `0.54ms`, average draw calls `3680.91` to `247.14`, visible weapon
   draw-call-like entries `2768` to `0`, visible close-NPC GLB draw-call-like
   entries `476` to `0`, and close-model pool-empty warnings `165` to `0`.
   The first production-path remediation at
   `artifacts/perf/2026-05-07T04-51-00-922Z/projekt-143-close-actor-remediation/summary.json`
   merges attached weapon clones, caps active close GLB actors at `16`, keeps
   overflow actors on impostor fallback, and lowers desktop high/medium AI
   full-update caps to `12/16`. That standard capture passes measurement trust
   and clears AI starvation, Combat dominance, heap, hitch-rate, and
   over-budget checks, with avg frame `19.82ms`, Combat avg `5.93ms`, AI avg
   `3.82ms`, billboard/render avg `2.05ms`, draw-call avg `286.72`, visible
   weapon draw-call-like `16`, visible close-NPC GLB draw-call-like `112`, and
   pool-empty warnings `0`. It still fails baseline eligibility because peak
   p99 remains `70.50ms` and avg frame remains above the STABILIZAT-1
   `≤17ms` criterion. The metric-window remediation at
   `artifacts/perf/2026-05-07T05-00-06-198Z/projekt-143-tail-window-remediation/summary.json`
   moves metrics and browser-stall observer reset after the active driver
   restart; the standard capture now exits validation WARN with measurement
   trust PASS. It records avg frame `19.24ms`, peak p99 `37.70ms`, Combat avg
   `6.44ms`, AI avg `4.41ms`, billboard/render avg `2.00ms`, draw-call avg
   `227.65`, visible weapon draw-call-like `16`, visible close-NPC GLB
   draw-call-like `112`, and pool-empty warnings `0`. It still is not
   baseline-quality: avg frame misses `≤17ms`, p99 misses `≤35ms`, and heap
   end-growth is `25.28MB` against the `≤10MB` criterion. Next evidence belongs
   to steady-state avg/heap reduction and close-actor visual acceptance, not a
   baseline refresh. The repeatability check at
   `artifacts/perf/2026-05-07T05-10-12-139Z/projekt-143-repeatability-check/summary.json`
   keeps measurement trust PASS and records avg frame `19.27ms`, peak p99
   `36.70ms`, Combat avg `5.55ms`, AI avg `3.52ms`, billboard/render avg
   `1.99ms`, and draw-call avg `241.24`, but validation returns to FAIL on heap
   recovery `14.8%`. Heap end-growth is `40.45MB`; heap peak-growth is
   `47.49MB`. The active blocker is now repeatable heap cleanliness plus the
   remaining avg/p99 gap, not close-render draw-call dominance. The follow-up
   close-model-disabled diagnostic at
   `artifacts/perf/2026-05-07T05-19-21-519Z/projekt-143-heap-close-model-isolation/summary.json`
   clears avg, p99, heap end-growth, and heap recovery thresholds on the
   current harness. This narrows the production blocker to the close-model
   resource/upload path. It does not authorize a baseline refresh because
   `perfDisableNpcCloseModels=1` removes the production close-actor visual
   contract. The accepted production pool-bound artifact at
   `artifacts/perf/2026-05-07T05-26-55-636Z/projekt-143-close-model-pool-bound/summary.json`
   keeps close GLB actors enabled, records visible weapon draw-call-like `8`,
   visible close-NPC GLB draw-call-like `56`, and visible NPC impostor
   instances `105`, and moves heap recovery to PASS. Avg frame remains
   `17.50ms`, so STABILIZAT-1 is still open. The repeatability artifact at
   `artifacts/perf/2026-05-07T05-38-56-942Z/projekt-143-pool-bound-repeatability/summary.json`
   remains measurement-trusted and records avg frame `17.36ms`, peak p99
   `34.50ms`, heap end-growth `13.94MB`, and heap recovery `70.6%`. The
   residual heap diagnostic at
   `artifacts/perf/2026-05-07T05-47-22-079Z/projekt-143-perf-heap-diagnostic/heap-diagnostic.json`
   classifies the heap shape as a recovering transient allocation wave after
   renderer resources stabilized, with `343` terrain-stall backtracking console
   signals during the capture. The warning-bound packet at
   `artifacts/perf/2026-05-07T05-54-31-155Z/projekt-143-stuck-warning-bound/summary.json`
   reduces terrain-stall warning churn from `343` lines to `21`, but the
   follow-up standard capture fails validation with peak p99 `78.10ms`, avg
   `17.85ms`, and heap end-growth `16.26MB`. The baseline blocker is still
   combat runtime allocation/frame-tail evidence, not retained renderer-resource
   growth. The dev-shape deep-CDP packet at
   `artifacts/perf/2026-05-07T06-18-22-151Z/projekt-143-heap-sampling-attribution/summary.json`
   makes the next inspection concrete: three.js math/skinning churn dominates
   sampled volume, while named gameplay owners include `CombatantRenderer.ts`,
   `GameplaySurfaceSampling.ts`, `CombatantMovement.ts`, `HeightQueryCache.ts`,
   and `InfluenceMapComputations.ts`.
2. **Open Frontier renderer tails** - the latest short capture (`artifacts/perf/2026-04-07T04-01-01-963Z`) passes mean/p95/hitch gates, but `p99FrameMs` still warns at `29.60ms` and heap peak-growth still warns at `35.13MB`. The mode is stable again, but not yet back to the March 4 renderer baseline.
3. **Grenade first-use render/program stall** - KB-EFFECTS attributed the
   low-load first-use long task to the dynamic explosion `PointLight`
   render/program path, removed that path locally, and closed the low-load
   trust gap with in-frame observer/metric arming. The trusted low-load probe
   has `0` browser long tasks, `0` trigger/post-trigger LoAFs, no
   trigger-adjacent main-scene render call above `23.6ms`, and detonation max
   `30.2ms`. Preserve the unlit pooled path; any future visual polish or
   stress-scene claim needs fresh matched render attribution.
4. **NPC imposter expanded visual parity** - the first KB-OPTIK remediation
   dropped the shared NPC runtime target to `2.95m` and added generated
   per-tile crop maps for upright NPC imposter atlases. The selected-lighting
   luma slice then added per-faction imposter material tuning. The refreshed matched
   proof at
   `artifacts/perf/2026-05-03T16-48-28-452Z/projekt-143-optics-scale-proof/summary.json`
   improved visible-height ratios from the before range `0.52-0.54x` to
   `0.861-0.895x`, inside the first-remediation `+/-15%` band, and selected
   setup luma delta is now `-0.44%` to `0.36%`. Commit
   `5792bafb7abd51c12dcf715a395a9c1d8c91c8ad` then forwards scene
   lighting/fog into NPC imposter shader uniforms. The expanded proof at
   `artifacts/perf/2026-05-03T18-46-14-291Z/projekt-143-optik-expanded-proof/summary.json`
   is measurement-trusted but WARN: luma is now in band at `-11.31%` to
   `9.03%`, while `10/40` samples still flag on 8.5m near-stress
   visible-height ratios. Runtime LOD-edge proof at
   `artifacts/perf/2026-05-03T19-02-38-432Z/projekt-143-optik-expanded-proof/summary.json`
   is measurement-trusted PASS with `0/40` flags. Current lead: luma/material
   parity is no longer the blocker, and the runtime LOD-edge camera is inside
   band; the remaining KB-OPTIK decision is near-stress exception/human review
   or deliberate switch to KB-LOAD/KB-TERRAIN/KB-CULL.
   Do not claim full visual parity or performance improvement.
5. **Large-mode vegetation horizon gap** - static KB-TERRAIN evidence shows
   current Pixel Forge vegetation disappears by `600m`, while Open Frontier
   and A Shau terrain remains visible beyond that range. Cycle 3 now has a
   fresh-build elevated screenshot/perf-before baseline at
   `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`.
   The current lead is a missing outer canopy tier, not a scatterer residency
   bug; no far-canopy remediation is accepted yet. The KB-TERRAIN goal now
   also includes ground material and vegetation distribution correction:
   most traversable ground should read jungle green rather than gravel, a
   possible inverted slope/biome material weighting should be checked if green
   appears mainly on hillsides, palms and ferns need scale/grounding review,
   large palms and ground vegetation should be more present, and bamboo should
   become scattered dense clusters rather than the dominant forest layer.
   The first material-distribution pass is captured at
   `artifacts/perf/2026-05-04T02-02-26-811Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
   and the matching screenshot proof at
   `artifacts/perf/2026-05-04T02-06-49-928Z/projekt-143-terrain-horizon-baseline/summary.json`;
   this corrects the broad elevation-cap material rules but does not accept
   final A Shau atmosphere/color, vegetation scale/density, or far-canopy
   work. The later terrain/world-placement goal also includes shaped pads for
   buildings, HQs, airfields, support compounds, and parked vehicles so
   foundations do not hang off hills, plus a Pixel Forge building candidate
   shortlist that must pass visual and performance acceptance before import.
   It also includes an inventory of TIJ and Pixel Forge ground/path/trail,
   grass, foliage, and cover assets for richer terrain variety, plus worn-in
   smoothed route surfaces that can become vehicle-usable paths in future.
   The follow-up vegetation pass is recorded by
   `artifacts/perf/2026-05-04T02-41-29-573Z/projekt-143-terrain-distribution-audit/terrain-distribution-audit.json`
   and
   `artifacts/perf/2026-05-04T02-41-37-056Z/projekt-143-terrain-horizon-baseline/summary.json`.
   Open Frontier after capture
   `artifacts/perf/2026-05-04T02-45-03-756Z/summary.json` is
   measurement-trusted but WARN. A Shau after capture
   `artifacts/perf/2026-05-04T02-48-58-787Z/summary.json` failed validation,
   and rerun `artifacts/perf/2026-05-04T02-53-54-886Z/summary.json` also
   failed; both runs still surface the `tabat_airstrip` steep-footprint
   warning. Do not treat this vegetation pass as an A Shau perf or placement
   acceptance gate.
6. **KB-CULL first owner path has a partial static-feature reduction, not a
   closeout** - the clean owner
   baseline at
   `artifacts/perf/2026-05-04T00-14-23-014Z/projekt-143-culling-owner-baseline/summary.json`
   selects large-mode world static features and visible helicopters. The
   current guardrails are Open Frontier owner draw-call-like below `388`,
   A Shau owner draw-call-like below `719`, total draw calls not above
   `1037` / `785`, and visible unattributed triangles below `10%`.
   A 2026-05-04 static helicopter distance-cull prototype was rejected after
   `artifacts/perf/2026-05-04T00-55-00-501Z/summary.json`: measurement trust
   passed, but Open Frontier validation failed and owner draw-call-like stayed
   `388`.
   The later shared static-feature root/batching pass has trusted after
   evidence at
   `artifacts/perf/2026-05-04T14-22-32-048Z/projekt-143-culling-owner-baseline/summary.json`
   and lowers the selected owner draw-call-like to `261` Open Frontier /
   `307` A Shau. Treat that as static-feature draw-call reduction only:
   Open Frontier total renderer max is mixed by close-NPC/weapon visibility,
   and A Shau still needs terrain/nav/runtime acceptance.
   Close-NPC/weapon pool residency remains diagnostic-only until combat stress
   measurement trust passes.
7. **NPC terrain stalling** - movement solver still produces stalls on steep terrain. `StuckDetector` escalation was made reachable in B3 (2026-04-17) by tracking the goal anchor independently of the backtrack anchor, so the 4-attempt abandon / hold path now actually fires instead of being reset on every anchor flip. The 2026-05-06 NPC navmesh recovery follow-up removes a no-op current-position snap, which improves A Shau combat evidence, but repeated backtracking still remains and Open Frontier active-driver routing still needs diagnosis.

## Resolved Bottlenecks

1. **Open Frontier collision-height CPU tax** (2026-04-07) - `TerrainQueries.getEffectiveHeightAt()` scanned every registered collision object and rebuilt bounds on each query. New staged aircraft/vehicle props turned that into a hot-path regression across placement, movement, and combat queries. Static collision registrations now cache bounds, while moving aircraft register as dynamic and recompute only their own bounds.
2. **Open Frontier hit-registration mismatch** (2026-04-07) - Open Frontier combatants were still being inserted into a Zone Control-sized combat spatial grid after mode switches, which clamped far-field positions and caused local `raycastCombatants()` queries to miss nearby enemies. `GameModeManager` now reapplies `combatantSystem.setSpatialBounds(config.worldSize)` before reseed/spawn. The recovery capture records `234` player shots and `131` hits with a peak hit rate of `70.83%`.
3. **Open Frontier staged-prop draw-call spike** (2026-04-07) - generic world-feature placements were bypassing the existing aircraft batching path and were added as raw cloned scene graphs. `ModelDrawCallOptimizer` now merges materially-identical static submeshes by signature rather than material UUID, and `WorldFeatureSystem` applies that optimization to static staged placements as they load.
4. **Air-vehicle mesh overhead** (2026-04-02) - helicopter and fixed-wing GLBs were authored as many tiny meshes, so a handful of staged aircraft cost far more draw calls than their triangle counts justified. Added `ModelDrawCallOptimizer` to batch static sub-meshes by material at load time while preserving rotor/propeller nodes, and added `AirVehicleVisibility` so far aircraft/helicopters stop rendering beyond useful fog/camera range. Local asset checks reduced representative aircraft mesh counts from `83 -> 13` (Huey), `115 -> 18` (Skyraider), and `96 -> 14` (Phantom).
5. **Cover search frame spikes** (2026-04-03) - `findNearestCover()` had no per-frame limit, allowing 44+ searches/frame during heavy combat. Added `CoverSearchBudget` (6/frame cap, mirrors `RaycastBudget` pattern). Eliminated 5 of 6 `Vector3.clone()` sites in `AICoverFinding` using scratch vectors and pre-allocated vegetation buffer. Heap growth dropped from 15.4MB to net negative. Max frame spike cut from 59ms to 50ms.
6. **Infinite NPC backtrack loops** (2026-04-03) - `StuckDetector` had no retry limit; 30+ NPCs would cycle backtrack-stall-backtrack forever, burning navmesh queries and terrain scoring every 1.2s. Added `MAX_CONSECUTIVE_BACKTRACKS = 4` with 'hold' action: NPC stops movement but continues combat. Resets after anchor change or 15s cooldown.
7. **Binary AI degradation cliff** (2026-04-03) - `CombatantLODManager` budget cascade restructured from nested checks to flat severe -> exceeded -> stagger. `SystemUpdater` budget warning threshold tightened from 150% to 120% with 5s cooldown (was 10s).
8. **Perf harness startup freeze** (2026-04-02) - Playwright captures could reach `engine-init.startup-flow.interactive-ready` and then stop at `frameCount=1`. Root cause was `GameUI.hide()` using `document.startViewTransition()` during live-entry while the renderer was being revealed. Fixed by disabling view transitions on the live-entry path and for perf/sandbox automation.
9. **Effect pool scene.add/remove thrashing** (2026-04-01) - TracerPool, ImpactEffectsPool, ExplosionEffectsPool, and SmokeCloudSystem all added/removed objects from the scene graph on every spawn/expire cycle. Fixed by adding all pooled objects at construction and toggling `visible`. Extracted `EffectPool<T>` base class to share the pool lifecycle pattern.
10. **Grenade/explosion first-use stall, partial** (2026-04-02) - Scene graph thrashing was removed and startup warmup now uses a hidden live effect spawn instead of relying on `renderer.compile()` alone. Re-baseline cold-start captures are still required before treating this as fully closed.
11. **Helicopter idle per-frame cost** (2026-04-06) - Door gunner AI ran targeting/firing for every visible helicopter, not just the piloted one. Restricted to piloted only. Rotor animation skipped for grounded helicopters with `engineRPM === 0`.
12. **Fixed-wing ground-to-air pop** (2026-04-06) - Parked aircraft could instantly transition to airborne on first simulation tick due to terrain height mismatch. Added 3-tick ground stabilization clamp. F-4 Phantom TWR corrected (180kN -> 155kN). Thrust gated by airspeed smoothstep. Physics reset on player entry.
13. **Fixed-wing self-lift on entry** (2026-04-07) - plane placement/update sampled `getEffectiveHeightAt()` and could treat the aircraft's own collision bounds as terrain support. Fixed-wing placement and terrain sampling now use raw terrain height, while aircraft collision registration remains available to other systems through the dynamic collision path.
14. **NPC combat response gap** (B1, 2026-04-17) - `CombatantCombat.ts:310` player-shot path was passing `attacker=undefined` into `CombatantDamage`, so NPC AI suppression / panic / threat-bearing signals never fired on player hits. Fixed by wiring a `_playerAttackerProxy` through the damage path, mirroring the existing `_playerTarget` pattern in `AITargetAcquisition`.
15. **NPC terrain-stall escalation unreachable** (B3, 2026-04-17) - `StuckDetector` had a 4-attempt abandon path, but `recoveryCount` was reset every time the movement anchor flipped between the backtrack anchor and the goal anchor, so escalation never triggered. Introduced explicit goal-anchor tracking so the counter escalates independently of anchor flips.
16. **Perf captures ran against dev-mode** (C1, 2026-04-17) - captures were running against Vite dev-server (HMR, unminified), so numbers overstated real work per frame and the dev HMR websocket intermittently rotted (`send was called before connect`) mid-run. New `npm run build:perf` target produces a prod-shape bundle to `dist-perf/` with `VITE_PERF_HARNESS=1` set at build time; `perf:capture` and `fixed-wing-runtime-probe` default to previewing that bundle. Retail `npm run build` ships zero harness surface because Vite constant-folds `import.meta.env.VITE_PERF_HARNESS === '1'` and DCE's the hook branches.

## Workflow

1. Capture: `npm run perf:capture:combat120`
2. Analyze: `npm run perf:analyze:latest`
3. Change one thing
4. Re-capture same scenario
5. Compare: `npm run perf:compare`
6. Keep only evidence-backed improvements

Treat first capture after fresh boot as cold-start data. Use matched warm pairs for A/B decisions.

For world-feature, asset, aircraft, or collision-query changes, pair `npm run perf:capture:openfrontier:short` with `npm run perf:compare -- --scenario openfrontier:short` before considering the work done. `combat120` alone will not catch Open Frontier's staging and large-world regressions.

Perf and browser probes can pin pre-baked terrain modes with `?seed=<n>`.
`npm run probe:fixed-wing` uses Open Frontier seed `42` by default so airfield
coverage is deterministic instead of dependent on random seed rotation. General
Open Frontier perf captures keep their existing scenario semantics unless a
specific seed is passed for an A/B pair.

For Pixel Forge aircraft GLB replacement, use
`npm run assets:import-pixel-forge-aircraft` instead of direct copies. The
importer records provenance, preserves embedded animation tracks, and wraps
source `+X`-forward aircraft into TIJ's public `+Z`-forward aircraft storage
contract. Acceptance still requires standalone viewer screenshots,
`npm run probe:fixed-wing`, and Open Frontier/A Shau renderer stats before any
optimization claim. The 2026-05-03 aircraft import was delivered at
`afa9247f1ec36a9a98dedb50595a9f6e0bc81a33` after manual CI run `25274278013`,
Deploy run `25274649157`, live `/asset-manifest.json` verification, Pages/R2
header checks, and a live Zone Control browser smoke; that is delivery parity,
not aircraft-feel or performance-improvement certification.

Pixel Forge aircraft GLBs may load with a mix of interleaved and regular
`BufferAttribute` layouts from `GLTFLoader`. TIJ's
`ModelDrawCallOptimizer` wrapper deinterleaves attributes before passing static
meshes to the reusable optimizer so Three.js batching does not emit
`mergeAttributes()` console errors.

Cycle 2 KB-CULL close-NPC/NPC-imposter certification needs trusted renderer
attribution. Combat-heavy AI Sandbox captures can expose those categories, but
they are not a valid certification path when measurement trust fails. The
2026-05-03 focused 60-NPC diagnostic artifact
`artifacts/perf/2026-05-03T09-13-00-811Z` recorded visible `npc_close_glb` and
`npc_imposters`, but failed `measurement_trust` (`probeAvg=96.62ms`,
`probeP95=211ms`), so it remains diagnostic-only. The headed deterministic
proof at
`artifacts/perf/2026-05-03T09-35-13-554Z/projekt-143-culling-proof/summary.json`
captured renderer stats (`133` draw calls, `4,887` triangles), CPU profile,
scene attribution, browser long-task/LoAF entries, and all required renderer
categories with trusted probe overhead (`probeP95=1.96ms`). Pair it with
`npm run check:projekt-143-cycle2-proof`; KB-OPTIK still needs matched
close-GLB/imposter screenshots before imposter fixes can be accepted.

## Diagnostics

- Perf diagnostics gated behind `import.meta.env.DEV` + `?perf=1` URL param at runtime, OR `import.meta.env.VITE_PERF_HARNESS === '1'` at build time (see `npm run build:perf`). Retail `npm run build` ships ZERO harness surface - the hook branches are dead-code-eliminated.
- Perf harness runs also set `?uiTransitions=0` to avoid browser transition/screenshot interactions during live-entry.
- `SystemUpdater` emits `performance.mark()`/`performance.measure()` during captures only.
- Browser stall observers (`longtask`, `long-animation-frame`) are Chromium-only, harness-only.
- `perf-startup-ui.ts` is the public-build startup benchmark (separate from runtime harness).

## External References

- Three.js `InstancedMesh` docs: https://threejs.org/docs/pages/InstancedMesh.html
- Three.js `BatchedMesh` docs: https://threejs.org/docs/pages/BatchedMesh.html
- Three.js optimization manual, "Optimize Lots of Objects": https://threejs.org/manual/en/optimize-lots-of-objects.html
- glTF Transform docs: https://gltf-transform.dev/
- meshoptimizer / `gltfpack` docs: https://meshoptimizer.org/gltf/
- `three-mesh-bvh` repository: https://github.com/gkjohnson/three-mesh-bvh
- FCL paper on BVH and broad-phase collision/proximity queries: https://gamma.cs.unc.edu/FCL/fcl_docs/webpage/pdfs/fcl_icra2012.pdf
