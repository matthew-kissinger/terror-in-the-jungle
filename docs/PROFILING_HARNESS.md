# Profiling Harness

Last updated: 2026-02-21

Mission linkage:
- `docs/PERFORMANCE_FRONTIER_MISSION.md`

## Primary Commands

- Baseline: `npm run perf:baseline`
- Default capture (headed): `npm run perf:capture`
- Headless capture: `npm run perf:capture:headless`
- Deep debug capture: `npm run perf:capture -- --deep-cdp`
- Combat throughput: `npm run perf:capture:combat120`
- Open Frontier short: `npm run perf:capture:openfrontier:short`
- A Shau short: `npm run perf:capture:ashau:short`
- 30-minute soak: `npm run perf:capture:frontier30m`
- Analyze latest: `npm run perf:analyze:latest`

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

Frontier toggles:
- `PERF_LOS_HEIGHT_PREFILTER=1|0`
- `PERF_SPATIAL_SECONDARY_SYNC=1|0`
- `PERF_SPATIAL_DEDUP_SYNC=1|0`

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
- `console.json`
- optional deep files: `cpu-profile.cpuprofile`, `heap-sampling.json`, `chrome-trace.json`, `playwright-trace.zip`
- `final-frame.png`

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

## Guardrails

- Prefer headed captures on this machine for primary comparisons.
- Use deep CDP for diagnosis, not default pass/fail loops.
- Keep harness-only behavior out of normal gameplay validation.
