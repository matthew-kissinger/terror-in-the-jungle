# Performance & Profiling

Last updated: 2026-04-03

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
npm run perf:compare:strict         # Same compare, but fail on warnings too
npm run perf:update-baseline        # Update baselines from latest capture
npm run perf:analyze:latest         # Analyze most recent artifacts
npm run perf:startup:openfrontier   # Production startup benchmark
```

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

`summary.json`, `validation.json`, `console.json`, and `runtime-samples.json` are written on best effort failure paths as well, so a blocked run still leaves enough evidence to diagnose startup regressions.

## Harness Status

- **Resolved on 2026-04-02:** the Playwright perf harness freeze at `frameCount=1` was caused by same-document View Transitions on the live-entry path. Menu-only transitions can still use `document.startViewTransition()`, but live-entry now bypasses it and perf/sandbox runs explicitly force `uiTransitions=0`.
- Harness startup probes now capture `rafTicks`, page visibility, startup phase, and active view-transition state so browser scheduling failures are distinguishable from game-loop failures.
- GitHub-hosted CI perf remains advisory. The harness is now trustworthy locally, but the hosted Linux/Xvfb environment still exhibits non-representative browser scheduling and GPU readback stalls during `combat120`, so authoritative perf gating stays with local/self-run `validate:full`.
- Full scenario health should be re-baselined after this fix. The table below reflects the last accepted warm measurements before the harness freeze was corrected.

## Validation Gates

Automated checks: frame progression, mean/tail frame timing, hitch ratios (>50ms, >100ms), over-budget ratio, combat shot/hit sanity, heap behavior (growth, peak, recovery), runtime UI contamination.

`perf:compare` always prints PASS/WARN/FAIL rows. `FAIL` remains locally blocking when you use `validate:full`, while hosted CI keeps the artifacts and reports the failure without blocking deploy. `WARN` is reported but non-blocking by default so recovered-but-not-yet-rebaselined scenarios still surface in logs. Use `perf:compare:strict` or `--fail-on-warn` when you want warnings to fail locally.

`peak_max_frame_ms` classification: pass <120, warn 120-299, fail >=300.

## Current Scenario Health

| Scenario | Status | Avg | p99 | Notes |
|----------|--------|----:|----:|-------|
| `combat120` | WARN | ~14ms | ~33ms | Cover search budget-capped; max spike 50ms (was 59ms) |
| `openfrontier:short` | WARN | ~6.5ms | ~25ms | Draw call pressure highest here |
| `ashau:short` | WARN | ~9ms | ~26ms | WarSim dominates tick budget |
| `frontier30m` | PASS* | ~6.5ms | ~29ms | Terrain-led tails solved; rare GC outliers |

*frontier30m p99 includes rare GC/OS outliers, not game code.

## Known Bottlenecks

1. **Combat AI tails** - cover search is budget-capped to 6/frame via `CoverSearchBudget`, but p95/p99 still in WARN range due to per-search cost (sandbag iteration + vegetation grid + terrain probes).
2. **Open Frontier draw calls** - highest draw-call and triangle throughput of any scenario (~255 avg calls).
3. **NPC terrain stalling** - movement solver still produces stalls on steep terrain; `StuckDetector` now caps at 4 backtrack attempts then holds position (15s cooldown).

## Resolved Bottlenecks

1. **Cover search frame spikes** (2026-04-03) - `findNearestCover()` had no per-frame limit, allowing 44+ searches/frame during heavy combat. Added `CoverSearchBudget` (6/frame cap, mirrors `RaycastBudget` pattern). Eliminated 5 of 6 `Vector3.clone()` sites in `AICoverFinding` using scratch vectors and pre-allocated vegetation buffer. Heap growth dropped from 15.4MB to net negative. Max frame spike cut from 59ms to 50ms.
2. **Infinite NPC backtrack loops** (2026-04-03) - `StuckDetector` had no retry limit; 30+ NPCs would cycle backtrack-stall-backtrack forever, burning navmesh queries and terrain scoring every 1.2s. Added `MAX_CONSECUTIVE_BACKTRACKS = 4` with 'hold' action: NPC stops movement but continues combat. Resets after anchor change or 15s cooldown.
3. **Binary AI degradation cliff** (2026-04-03) - `CombatantLODManager` budget cascade restructured from nested checks to flat severe -> exceeded -> stagger. `SystemUpdater` budget warning threshold tightened from 150% to 120% with 5s cooldown (was 10s).
4. **Perf harness startup freeze** (2026-04-02) - Playwright captures could reach `engine-init.startup-flow.interactive-ready` and then stop at `frameCount=1`. Root cause was `GameUI.hide()` using `document.startViewTransition()` during live-entry while the renderer was being revealed. Fixed by disabling view transitions on the live-entry path and for perf/sandbox automation.
2. **Effect pool scene.add/remove thrashing** (2026-04-01) - TracerPool, ImpactEffectsPool, ExplosionEffectsPool, and SmokeCloudSystem all added/removed objects from the scene graph on every spawn/expire cycle. Fixed by adding all pooled objects at construction and toggling `visible`. Extracted `EffectPool<T>` base class to share the pool lifecycle pattern.
3. **Grenade/explosion first-use stall, partial** (2026-04-02) - Scene graph thrashing was removed and startup warmup now uses a hidden live effect spawn instead of relying on `renderer.compile()` alone. Re-baseline cold-start captures are still required before treating this as fully closed.

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
- Perf harness runs also set `?uiTransitions=0` to avoid browser transition/screenshot interactions during live-entry.
- `SystemUpdater` emits `performance.mark()`/`performance.measure()` during captures only.
- Browser stall observers (`longtask`, `long-animation-frame`) are Chromium-only, harness-only.
- `perf-startup-ui.ts` is the public-build startup benchmark (separate from runtime harness).
