# Profiling Harness

Last updated: 2026-03-17

Mission linkage:
- `docs/ARCHITECTURE_RECOVERY_PLAN.md`

## Primary Commands

- Baseline update from latest artifact: `npm run perf:update-baseline`
- Legacy baseline wrapper: `npm run perf:baseline -- --scenario combat120`
- Default capture (headed): `npm run perf:capture`
- Headless capture: `npm run perf:capture:headless`
- Deep debug capture: `npm run perf:capture -- --deep-cdp`
- Quick smoke test: `npm run perf:quick`
- Combat throughput: `npm run perf:capture:combat120`
- Zone control: `npm run perf:capture:zonecontrol`
- Team deathmatch: `npm run perf:capture:teamdeathmatch`
- Open Frontier short: `npm run perf:capture:openfrontier:short`
- A Shau short: `npm run perf:capture:ashau:short`
- 30-minute soak: `npm run perf:capture:frontier30m`
- Production startup benchmark: `npm run perf:startup:openfrontier`
- Analyze latest: `npm run perf:analyze:latest`
- Compare against tracked baselines: `npm run perf:compare`
- Update baseline snapshot: `npm run perf:update-baseline`

Tracked comparison scenarios:
- `combat120`
- `openfrontier:short` (internal baseline key: `openFrontier`)
- `ashau:short` (internal baseline key: `ashau`)
- `frontier30m`

## Scenario Controls

Set via env vars (or equivalent CLI flags):

- `PERF_MODE=ai_sandbox|zone_control|team_deathmatch|open_frontier|a_shau_valley`
- `PERF_DURATION`, `PERF_WARMUP`, `PERF_NPCS`, `PERF_PORT`
- `PERF_COMBAT=1|0`
- `PERF_ACTIVE_PLAYER=1|0`
- `PERF_ACTIVE_TOP_UP_HEALTH=1|0`
- `PERF_ACTIVE_AUTO_RESPAWN=1|0`
- `PERF_ALLOW_WARP_RECOVERY=1|0`
- `PERF_COMPRESS_FRONTLINE=1|0`
- `PERF_FRONTLINE_TRIGGER_DISTANCE`
- `PERF_FRONTLINE_COMPRESSED_PER_FACTION`
- `PERF_MOVEMENT_DECISION_INTERVAL_MS`

Sampling/observer controls:
- `PERF_SAMPLE_INTERVAL_MS`
- `PERF_DETAIL_EVERY_SAMPLES`
- `PERF_DEEP_CDP=1|0`
- `PERF_PREWARM=1|0`
- `PERF_RUNTIME_PREFLIGHT=1|0`
- `PERF_RUNTIME_PREFLIGHT_TIMEOUT`

## Artifacts

Each run writes to `artifacts/perf/<timestamp>/`:

- `summary.json`
- `validation.json`
- `startup-timeline.json`
- `runtime-samples.json`
- `movement-artifacts.json`
- `movement-terrain-context.json`
- `movement-viewer.html`
- `console.json`
- optional deep files: `cpu-profile.cpuprofile`, `heap-sampling.json`, `chrome-trace.json`, `playwright-trace.zip`
- `final-frame.png`

`perf-startup-ui.ts` writes a separate artifact shape under `artifacts/perf/<timestamp>/startup-ui-<mode>/`:

- `summary.json`
- `startup-marks.json`
- `console.json`

`runtime-samples.json` is the authoritative per-sample artifact for:
- frame timing (`avg`, `p95`, `p99`, max, hitch counts)
- heap snapshots from `performance.memory`
- `renderer.info` counters (`drawCalls`, `triangles`, `geometries`, `textures`, `programs`)
- harness-only movement telemetry:
  - player support-surface quality (`avgSupportNormalY`, `avgSupportNormalDelta`)
  - player uphill/downhill samples, terrain blocks, slides, walkability transitions
  - player pinned-area dwell events (`pinnedAreaEvents`, `pinnedSamples`, pinned duration/radius aggregates)
  - NPC movement intent counts, contour activations, backtrack activations, arrival counts
  - NPC low-progress counts and LOD breakdowns
  - NPC pinned-area dwell counts and LOD breakdowns (`pinnedByLod`) to catch ditch/cliff jitter that still moves too much to look "stationary" in coarse counters
- browser-stall totals (`longtask`, `long-animation-frame`)
- harness-only `SystemUpdater.*` user-timing totals
- `browserStalls.totals` are cumulative from page start, not reset per sample. For tail attribution, prefer `userTimingByName.*.maxDurationMs` or diff adjacent totals instead of treating each sample total as an instantaneous cost.

Planned next-step movement artifacts:
- `movement-artifacts.json` now contains the first low-cost artifact layer:
  - sparse world-grid occupancy / pressure bins for player and NPC movement
  - hotspot cells for pinned/backtrack/terrain-blocked/contour events
  - sampled player and selected NPC tracks
- `movement-terrain-context.json` captures the gameplay-surface terrain context needed to review movement against elevation and stamped flow paths.
- `movement-viewer.html` is a self-contained artifact viewer emitted by `perf-capture.ts`:
  - topo/elevation backdrop
  - trail/corridor overlays
  - occupancy heat
  - hotspot layers
  - sampled track playback
- next viewer-oriented additions should stay terrain-relative:
  - contour/elevation overlays derived from the gameplay height surface
  - squad-anchor or cohort summaries where they add signal over raw NPC tracks

Terrain-flow note:
- gameplay-surface corridor shaping now uses continuous route capsules, so when reviewing `movement-artifacts.json`, treat repeated pinned/backtrack hotspots along a stamped trail as a policy-tuning signal (`routeWidth` / `routeBlend` / `routeSpacing` / shoulder settings), not as proof that corridor shaping is absent.

These should remain harness-only and aggregated.
Do not turn perf capture into a raw per-frame all-agent replay dump.

## Validation Gates

Automated checks include:
- frame progression/sample completeness
- mean/tail/max frame timing (`avg`, `p99`, max frame)
- hitch ratios (`>50ms`, `>100ms`)
- over-budget ratio
- combat shot/hit sanity (mode-aware)
- heap behavior (`heap_growth_mb`, `heap_peak_growth_mb`, `heap_recovery_ratio`)
- runtime UI contamination (`.error-panel`)

Current `peak_max_frame_ms` classification:
- pass `<120`
- warn `120-299`
- fail `>=300`

## Recommended Loop

1. Run one scenario capture.
2. Analyze latest artifact.
3. Change one thing.
4. Re-run same scenario.
5. Keep only evidence-backed improvements.

Baseline discipline:
- `perf:quick` is a smoke capture, not a committed baseline scenario.
- Use `perf:capture:combat120` + `perf:compare -- --scenario combat120` for the primary regression loop.
- `validate:full` now runs the committed `combat120` capture before comparing against baselines.

## Diagnostics Semantics

- Perf diagnostics are enabled only for capture URLs that include `?perf=1`.
- Diagnostics globals and user-timing spans are additionally gated by `import.meta.env.DEV`.
- Startup benchmarking is now split:
  - `perf-capture.ts` remains the dev-only runtime/combat harness.
  - `perf-startup-ui.ts` is the authoritative public-build startup benchmark for `mode click -> deploy ready` and `mode click -> playable`.
- `scripts/perf-browser-observers.js` installs `PerformanceObserver` listeners for `longtask` and `long-animation-frame` during harness runs only.
- `scripts/perf-active-driver.js` provides the harness-only active-player driver used by `perf-capture.ts` for movement, aiming, firing, and pressure-maintenance loops.
- `window.perf.getMovement()` is now the light-weight movement telemetry accessor for harness sampling. Use it when movement quality matters without requiring full `perf.report()` detail samples.
- `window.perf.getMovementArtifacts()` is the harness-only artifact accessor. `perf-capture.ts` snapshots it into `movement-artifacts.json` near the end of a run so offline viewers do not need to reconstruct flow from runtime samples.
- `perf-capture.ts` also emits `movement-terrain-context.json` and a self-contained `movement-viewer.html` so movement review can happen directly from artifacts.
- `SystemUpdater` emits `performance.mark()` / `performance.measure()` spans during perf captures so tick-group totals can be recovered from the artifact without shipping overlay/debug code.
- `GameRenderer` snapshots `renderer.info` once per frame for harness sampling; this data is recorded in artifacts, not rendered to gameplay UI.
- March 4, 2026 tail attribution used temporary local AI probes (`aiPhaseMs` snapshots plus spike-phase log suffixes) to localize rare `combat120` spikes. Those probes were removed after capture so no extra AI diagnostics ship in the current branch.

## Driver Expectations

- The active driver must simulate movement, looking, and firing. Zero-shot or zero-hit runs are invalid unless the scenario explicitly disables combat.
- If `perf-capture.ts` enables active-player mode, both harness helper scripts must be present: `perf-browser-observers.js` for browser diagnostics and `perf-active-driver.js` for the player-action loop.
- Large-map modes may reposition the player to keep contact pressure realistic, but camera and player transforms must be resynchronized before aiming/firing.
- `a_shau:short` requires live contact near high-elevation terrain. A regression here often means either materialization ordering drift or a spatial-query/world-bounds failure.

## Known Caveats

- Treat the first capture after a fresh boot as cold-start data and discard or label it accordingly.
- `systemTop` inside `runtime-samples.json` is a quick snapshot, not the authoritative budget breakdown in every mode. Use `browserStalls.totals.userTimingByName` for phase analysis.
- The March 4, 2026 AI attribution artifacts are still valid evidence, but the temporary probe fields and spike-phase log suffixes are not present in the current branch. Re-add them only behind harness-only gating if deeper tail attribution is needed again.
- In recent `combat120` runs with frontline compression enabled, active-driver movement can stay near zero while combat remains valid. For acceptance comparisons, match warm startup quality and compare shots/hits alongside frame/tail metrics to avoid false wins from reduced pressure.
- Active-driver shutdown telemetry now includes `ammoRefills` and `healthTopUps` counters to help validate sustained pressure behavior on long runs; these are harness-only diagnostics.
- Active-driver shutdown `moved` is the frontline-compression combatant move count, not literal player distance traveled.
- Chromium-only browser diagnostics (`longtask`, `long-animation-frame`) are valid for harness evidence but must remain out of production builds.
- If a future movement artifact viewer is added, keep it artifact-driven or harness-only. Do not add deck.gl, heavy playback UI, or full trace storage to the shipping runtime without separate evidence.
- When movement hotspots need investigation, open `movement-viewer.html` first instead of inferring terrain failures from hotspot counts alone.

## Guardrails

- Prefer headed captures on this machine for primary comparisons.
- Use deep CDP for diagnosis, not default pass/fail loops.
- Keep harness-only behavior out of normal gameplay validation.
- After any harness/diagnostics edit, re-run `npm run validate` and confirm the production bundle contains no perf globals or observer code.
