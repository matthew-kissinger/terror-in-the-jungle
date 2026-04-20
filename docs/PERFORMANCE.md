# Performance & Profiling

Last updated: 2026-04-19

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
- Tracked baselines in `perf-baselines.json` are still stale (`lastUpdated: 2026-03-06`). Fresh local `combat120` evidence exists, but the four tracked scenarios still need a coordinated refresh.
- **Known validation drift on 2026-04-19:** `scripts/fixed-wing-runtime-probe.ts` is currently out of sync with the post-Airframe `FixedWingModel` API and throws `model.getPhysics is not a function`. Treat it as broken until repaired; do not cite it as a passing gate.

## Validation Gates

Automated checks: frame progression, mean/tail frame timing, hitch ratios (>50ms, >100ms), over-budget ratio, combat shot/hit sanity, heap behavior (growth, peak, recovery), runtime UI contamination.

`perf:compare` always prints PASS/WARN/FAIL rows. `FAIL` remains locally blocking when you use `validate:full`, while hosted CI keeps the artifacts and reports the failure without blocking deploy. `WARN` is reported but non-blocking by default so recovered-but-not-yet-rebaselined scenarios still surface in logs. Use `perf:compare:strict` or `--fail-on-warn` when you want warnings to fail locally.

`peak_max_frame_ms` classification: pass <120, warn 120-299, fail >=300.

## Current Scenario Health

Only `combat120` has a fresh local post-PR #96 capture as of 2026-04-19. The
other tracked scenarios below still need baseline refresh work after the
harness/player-bot changes.

| Scenario | Status | Avg | p99 | Notes |
|----------|--------|----:|----:|-------|
| `combat120` | WARN | ~14.7ms | ~33.8ms | Fresh local capture on 2026-04-19 (`artifacts/perf/2026-04-19T22-44-23-057Z`). p95 `32.6ms`, p99 `33.8ms`, heap end-growth `20.35MB`, heap peak-growth `41.64MB`. |
| `openfrontier:short` | WARN | ~9.9ms | ~29.6ms | Last accepted short capture is still 2026-04-07. Renderer/hit-reg regressions recovered, but scenario refresh is still pending after later harness/player-bot work. |
| `ashau:short` | WARN | ~9ms | ~26ms | Last tracked warm numbers are still pre-refresh; WarSim remains the dominant budget risk. |
| `frontier30m` | PASS* | ~6.5ms | ~29ms | Long-soak baseline is stale; refresh is blocked behind harness lifecycle/pathing follow-ups. |

*frontier30m p99 includes rare GC/OS outliers, not game code.

Pre drift-correction baseline for `combat120` (2026-04-16T23:06): avg 17.08ms, p99 34.40ms, max 47.30ms.

## Known Bottlenecks

1. **Combat AI tails** - cover search is budget-capped to 6/frame via `CoverSearchBudget`, but p95/p99 still in WARN range due to per-search cost (sandbag iteration + vegetation grid + terrain probes).
2. **Open Frontier renderer tails** - the latest short capture (`artifacts/perf/2026-04-07T04-01-01-963Z`) passes mean/p95/hitch gates, but `p99FrameMs` still warns at `29.60ms` and heap peak-growth still warns at `35.13MB`. The mode is stable again, but not yet back to the March 4 renderer baseline.
3. **NPC terrain stalling** - movement solver still produces stalls on steep terrain. `StuckDetector` escalation was made reachable in B3 (2026-04-17) by tracking the goal anchor independently of the backtrack anchor, so the 4-attempt abandon / hold path now actually fires instead of being reset on every anchor flip.

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
