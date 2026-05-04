# Performance & Profiling

Last updated: 2026-05-04

## Stable-Ground Perf Posture

The 2026-05-02 stabilization pass does not refresh baselines or tune runtime
performance. Its perf goal is release confidence: keep `validate:full` as the
authoritative local gate, treat hosted CI perf as advisory, and record any
quiet-machine limitation as PASS/WARN instead of hiding it. Baseline refreshes
remain a separate task.

Current stabilization evidence is not a clean perf sign-off: on 2026-05-02,
`npm run validate:full` passed unit/build stages but failed during
`perf:capture:combat120` with avg frame 100.00ms, p99 100.00ms, 100% frames
over 50ms, and Combat over budget in every sample. Browser/page errors were
`0`, heap end-growth passed, and shot/hit sanity passed. Artifact:
`artifacts/perf/2026-05-02T07-29-13-476Z/validation.json`.

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
npm run check:projekt-143           # Cycle 0 static evidence suite
npm run check:projekt-143-cycle1-bundle -- <artifact dirs>  # Cycle 1 benchmark bundle sidecars
npm run check:projekt-143-culling-proof  # Cycle 2 headed renderer/category proof
npm run check:projekt-143-culling-baseline # Cycle 3 culling owner-path before packet
npm run check:projekt-143-terrain-baseline # Cycle 3 elevated horizon screenshot/perf-before proof
npm run check:projekt-143-terrain-distribution # Ground material/vegetation distribution audit
npm run check:projekt-143-terrain-placement # Terrain feature footprint/foundation audit
npm run check:projekt-143-cycle2-proof  # Cycle 2 visual/runtime proof status
npm run check:projekt-143-cycle3-kickoff # Cycle 3 remediation readiness matrix
npm run check:projekt-143-optik-decision # KB-OPTIK NPC/vehicle scale decision packet
npm run check:projekt-143-optik-expanded # KB-OPTIK expanded lighting/gameplay-camera proof
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
uncontaminated frame-time baseline.

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

`summary.json`, `validation.json`, `measurement-trust.json`, `console.json`,
and `runtime-samples.json` are written on best effort failure paths as well, so
a blocked run still leaves enough evidence to diagnose startup regressions.

## Harness Status

- **Active-player killbot caveat (2026-05-04):** shorter Pixel Forge NPCs
  changed the target-height contract. The local bot and CJS driver now aim at
  the visual chest proxy and can use rendered target anchors, but the latest
  full Open Frontier active-player capture
  `artifacts/perf/2026-05-04T10-36-41-205Z/summary.json` still recorded zero
  hits. Do not accept active-player perf claims from killbot captures until a
  fresh post-fix capture records hits.
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

All tracked scenarios have 2026-04-20 baselines. The `frontier30m` script has
now been fixed to run as a non-terminal Open Frontier soak, but the tracked
baseline is still the older semantically compromised capture where Open
Frontier reached victory around 879s. Refresh it only from a quiet-machine
perf session.

| Scenario | Status | Avg | p99 | Notes |
|----------|--------|----:|----:|-------|
| `combat120` | WARN | 100.00ms | 100.00ms | Latest 2026-05-02 stabilization capture `2026-05-02T07-29-13-476Z` failed frame-time validation while unit/build and browser-error gates passed. Previous clean standalone capture remains `2026-04-24T05-49-45-656Z`; rerun on a quiet machine before baseline refresh or perf sign-off. |
| `openfrontier:short` | PASS | 7.50ms | 32.7ms | 2026-04-20 artifact `2026-04-20T06-18-05-147Z`; large-world short capture. |
| `ashau:short` | PASS | 5.79ms | 15.6ms | 2026-04-20 artifact `2026-04-20T06-21-56-636Z`; strategy stack + DEM short capture. |
| `frontier30m` | PASS* | 8.82ms | 33.7ms | 2026-04-20 artifact `2026-04-20T06-25-47-223Z`; baseline predates the non-terminal soak fix and ended early at victory. |

*`frontier30m` script semantics are fixed as of Cycle 2; the baseline still needs a quiet-machine refresh.

Pre drift-correction baseline for `combat120` (2026-04-16T23:06): avg 17.08ms, p99 34.40ms, max 47.30ms.

## Known Bottlenecks

0. **Cycle 2 fixed-wing feel and interpolation** - first-pass render/camera
   smoothing is implemented and probed. Human playtest still needs to determine
   whether any remaining stiffness or porpoise is an airframe damping/control
   law issue. Do not refresh perf baselines from sessions with background games
   or other GPU-heavy apps running.
1. **Combat AI tails** - cover search is budget-capped to 6/frame via `CoverSearchBudget`, but p95/p99 still in WARN range due to per-search cost (sandbag iteration + vegetation grid + terrain probes).
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
6. **KB-CULL first owner path is selected, not fixed** - the clean owner
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
   Close-NPC/weapon pool residency remains diagnostic-only until combat stress
   measurement trust passes.
7. **NPC terrain stalling** - movement solver still produces stalls on steep terrain. `StuckDetector` escalation was made reachable in B3 (2026-04-17) by tracking the goal anchor independently of the backtrack anchor, so the 4-attempt abandon / hold path now actually fires instead of being reset on every anchor flip.

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
