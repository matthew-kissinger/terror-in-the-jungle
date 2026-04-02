# Performance & Profiling

Last updated: 2026-04-01

## Commands

```bash
npm run perf:capture                # Default headed capture
npm run perf:capture:headless       # Headless capture
npm run perf:capture:combat120      # 120 NPC combat stress test
npm run perf:capture:zonecontrol    # Zone control scenario
npm run perf:capture:teamdeathmatch # TDM scenario
npm run perf:capture:openfrontier:short  # Open Frontier short
npm run perf:capture:ashau:short    # A Shau short
npm run perf:capture:frontier30m    # 30-minute soak test
npm run perf:quick                  # Quick smoke (not a baseline)
npm run perf:compare                # Compare latest vs tracked baselines
npm run perf:update-baseline        # Update baselines from latest capture
npm run perf:analyze:latest         # Analyze most recent artifacts
npm run perf:startup:openfrontier   # Production startup benchmark
```

## Scenarios

| Scenario | Mode | Duration | NPCs | Purpose |
|----------|------|----------|-----:|---------|
| `combat120` | AI Sandbox | 120s | 120 | Combat stress, primary regression target |
| `openfrontier:short` | Open Frontier | 60s | 120 | Terrain + draw call pressure |
| `ashau:short` | A Shau Valley | 60s | 60 | Strategy stack + heap peaks |
| `frontier30m` | Open Frontier | 30min | 120 | Long-tail stability soak |
| `zonecontrol` | Zone Control | 60s | 20 | Small-map gameplay |
| `teamdeathmatch` | TDM | 60s | 30 | Kill-race scenario |

Tracked baselines: `combat120`, `openfrontier:short`, `ashau:short`, `frontier30m`.

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
| `runtime-samples.json` | Per-sample frame timing, heap, renderer.info, system timing |
| `movement-artifacts.json` | Occupancy cells, hotspots, sampled tracks |
| `movement-terrain-context.json` | Gameplay surface context for viewer |
| `movement-viewer.html` | Self-contained terrain-relative movement viewer |
| `startup-timeline.json` | Boot phase timing |
| `console.json` | Console messages captured during run |
| `final-frame.png` | Screenshot at end of capture |

Optional deep artifacts: `cpu-profile.cpuprofile`, `heap-sampling.json`, `chrome-trace.json`.

## Validation Gates

Automated checks: frame progression, mean/tail frame timing, hitch ratios (>50ms, >100ms), over-budget ratio, combat shot/hit sanity, heap behavior (growth, peak, recovery), runtime UI contamination.

`peak_max_frame_ms` classification: pass <120, warn 120-299, fail >=300.

## Current Scenario Health

| Scenario | Status | Avg | p99 | Notes |
|----------|--------|----:|----:|-------|
| `combat120` | WARN | ~12-13ms | ~30-35ms | AI cover search is top remaining bottleneck |
| `openfrontier:short` | WARN | ~6.5ms | ~25ms | Draw call pressure highest here |
| `ashau:short` | WARN | ~9ms | ~26ms | WarSim dominates tick budget |
| `frontier30m` | PASS* | ~6.5ms | ~29ms | Terrain-led tails solved; rare GC outliers |

*frontier30m p99 includes rare GC/OS outliers, not game code.

## Known Bottlenecks

1. **Combat AI tails** - `AIStateEngage.initiateSquadSuppression()` synchronous cover search. Grid reduced to 8x8 with early-out but still the top combat tail.
2. **Open Frontier draw calls** - highest draw-call and triangle throughput of any scenario (~255 avg calls).
3. **Heap churn in heavy combat** - `HeightQueryCache` string-key generation and eviction on terrain/movement paths.

## Resolved Bottlenecks

1. **Grenade/explosion first-use stall** (2026-04-01) - First grenade explosion caused a multi-frame freeze from synchronous GPU shader compilation + scene graph thrashing. Fixed by: keeping all pooled effect objects in the scene permanently (toggle `visible` instead of `scene.add/remove`), sharing grenade geometry/materials, reducing frag impact effects (15->5), and pre-warming effect shaders at startup via `renderer.compile()`.
2. **Effect pool scene.add/remove thrashing** (2026-04-01) - TracerPool, ImpactEffectsPool, ExplosionEffectsPool, and SmokeCloudSystem all added/removed objects from the scene graph on every spawn/expire cycle. Fixed by adding all pooled objects at construction and toggling `visible`. Extracted `EffectPool<T>` base class to share the pool lifecycle pattern.

## Workflow

1. Capture: `npm run perf:capture:combat120`
2. Analyze: `npm run perf:analyze:latest`
3. Change one thing
4. Re-capture same scenario
5. Compare: `npm run perf:compare`
6. Keep only evidence-backed improvements

Treat first capture after fresh boot as cold-start data. Use matched warm pairs for A/B decisions.

## Diagnostics

- Perf diagnostics gated behind `import.meta.env.DEV` + `?perf=1` URL param.
- `SystemUpdater` emits `performance.mark()`/`performance.measure()` during captures only.
- Browser stall observers (`longtask`, `long-animation-frame`) are Chromium-only, harness-only.
- `perf-startup-ui.ts` is the public-build startup benchmark (separate from runtime harness).
