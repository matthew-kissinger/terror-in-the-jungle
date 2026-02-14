# Profiling Harness

Last updated: 2026-02-14

## Installed Tooling

- `playwright` (latest) with Chromium
- Chrome DevTools Protocol capture via Playwright CDP session
- `speedscope` for CPU profile inspection (`.cpuprofile`)
- `lighthouse` (Node-compatible version) for optional page-level audits

## Commands

- Baseline run (regression-focused):  
  `npm run perf:baseline`
- Deep capture run (trace + CPU + heap + runtime samples):  
  `npm run perf:capture -- --deep-cdp`
- Low-overhead runtime capture (recommended default for optimization loops):  
  `npm run perf:capture`
- Headless capture (secondary regression signal; less reliable on this machine):  
  `npm run perf:capture:headless`
- Deep capture with visible browser:  
  `npm run perf:capture:headed`
- Deep capture with Chrome DevTools auto-opened:  
  `npm run perf:capture:devtools`
- Optional Playwright trace bundle (off by default to avoid observer-effect stalls):  
  `npm run perf:capture -- --playwright-trace`
- Analyze latest capture bundle quickly:  
  `npm run perf:analyze:latest`

Parameter overrides (reliable on Windows shells):

- `PERF_DURATION=<seconds>`
- `PERF_WARMUP=<seconds>`
- `PERF_NPCS=<count>`
- `PERF_PORT=<port>`
- `PERF_COMBAT=1|0` (`0` = control run with combat AI disabled)
- `PERF_STARTUP_TIMEOUT=<seconds>`
- `PERF_STARTUP_FRAME_THRESHOLD=<count>`
- `PERF_DEEP_CDP=1` (enable CPU/heap/trace CDP collection; off by default to reduce observer effect)
- `PERF_ACTIVE_PLAYER=1|0` (default `1`; scripted movement/fire/respawn loop)
- `PERF_COMPRESS_FRONTLINE=1|0` (default `1`; optionally pulls squads closer when spawns are far apart)
- `PERF_FRONTLINE_TRIGGER_DISTANCE=<meters>` (default `500`)
- `PERF_FRONTLINE_COMPRESSED_PER_FACTION=<count>` (default `28`)

CLI note:
- Boolean flags now correctly parse both `--flag=false` and `--flag false` forms.

## Capture Artifacts

Each run writes to `artifacts/perf/<timestamp>/`:

- `summary.json`
- `validation.json`
- `runtime-samples.json`
- `console.json`
- `cpu-profile.cpuprofile`
- `heap-sampling.json`
- `chrome-trace.json`
- `playwright-trace.zip`
- `final-frame.png`

`summary.json` now includes harness probe round-trip overhead (`avg/p95`) so run-to-run comparisons can account for observer cost.

## Validation Checks (Automated)

- Sample completeness
- Frame progression during capture
- Maximum frame stall window
- Average frame time
- Peak p99 frame time
- Peak max frame time (hitch spike detector)
- Hitch percentages (`>50ms`, `>100ms`)
- Over-budget frame ratio
- Browser error rate
- Combat budget dominance ratio
- Active-combat shot/hit validation:
  - player shots recorded
  - at least one player hit recorded
  - non-zero peak hit rate in sample window
- Runtime UI contamination guard:
  - fail if loading/init `.error-panel` appears during sample window

If validation fails, the command returns non-zero so CI/local gates can catch it.
This now includes stutter-tail failures, not just mean frame-time failures.

Current `peak_max_frame_ms` classification:
- `pass < 120ms`
- `warn 120-299ms`
- `fail >= 300ms`

Reason:
- `__metrics.maxFrameMs` is a rolling max since reset. A single early one-off stall can remain visible for the full capture window even when hitch-rate and p99 are healthy.
- Severe spikes still fail, but isolated spikes now warn.

## Runaway Process Guardrails

- Single-run lock file: `tmp/perf-capture.lock` (prevents concurrent capture runs).
- Dedicated browser profile per run: `artifacts/perf/<timestamp>/browser-profile`.
- Forced browser cleanup on exit for processes tied to that profile.
- Hard run timeout in harness to avoid indefinite hangs.
- Playwright trace screenshots/snapshots are disabled by default to reduce `ReadPixels`-driven GPU stalls during perf runs.
- `pageerror` capture now stores stack traces in `console.json` for direct crash-site triage.

## Optimization Loop

1. Run `npm run perf:capture -- --duration=90 --npcs=120`.
   Alternative: `$env:PERF_DURATION='90'; $env:PERF_NPCS='120'; npm run perf:capture`
2. Run `npm run perf:analyze:latest` to identify primary bottleneck.
3. Implement one focused optimization change.
4. Re-run capture and compare validation + sample metrics.
5. Keep change only if frame budget and stall checks improve.

## Scenario Semantics

- `PERF_COMBAT=0` now forces a true control path in the harness URL:
  - `combat=0`
  - `npcs=0` (ignores requested NPC count for this run)
- Harness also appends `logLevel=warn` to reduce console-observer overhead during captures.
- Runtime logging default is now host-aware:
  - `localhost`/`127.0.0.1`/`::1`: no forced production clamp.
  - GitHub Pages hosts (`*.github.io`): default minimum logger level clamps to `error` unless explicitly overridden (`LOG_LEVEL`, `window.__LOG_LEVEL__`, localStorage/query param).
- Combat capture now defaults to an active player scenario:
  - scripted ground movement + burst fire
  - movement constrained around live engagement center (no blind HQ run-through)
  - spawn/respawn insertion biased near midpoint lane between HQs (slight own-side offset)
  - auto-respawn when dead (no long dead-time in sample window)
  - smoothed camera retargeting (avoids artificial fast-turn billboard stress)
  - optional frontline compression to reduce long spawn-to-contact delay
- Capture trust mode:
  - Default `perf:capture` runs headed because headed results are currently stable/representative on this hardware.
  - Use `perf:capture:headless` only as a secondary signal until headless blocking is resolved.
  - Latest confirmation run: `artifacts/perf/2026-02-14T06-44-17-739Z` (20 samples, avg `7.47ms`, validation `WARN` only for peak max-frame and heap growth).
