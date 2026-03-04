# Perf Frontier

Last updated: 2026-03-04
Scope: Phase 1 measurement, harness validation, and baseline capture state.

## Phase 1 Status

- Orientation complete: required docs, block maps, runtime landmarks, and harness scripts reviewed against source.
- Harness is behavior-valid in all required Phase 1 scenarios: `combat120`, `openfrontier:short`, `ashau:short`, and `frontier30m` all produced non-zero shots/hits and valid sample streams.
- Profiling toolchain is active for harness runs: `renderer.info`, `PerformanceObserver("longtask")`, `PerformanceObserver("long-animation-frame")`, and `performance.measure()` totals from `SystemUpdater`.
- Production isolation is enforced through `import.meta.env.DEV` + `?perf=1` gating for diagnostics globals and user-timing collection. Re-verified on 2026-03-04 after the latest harness edits.

## Accepted Harness / Measurement Fixes

- Keep: `SystemUpdater` emits harness-only `performance.mark()` / `performance.measure()` spans so tick-group totals can be recovered from runtime artifacts.
- Keep: browser-stall observers live in `scripts/perf-browser-observers.js` and are injected only by perf captures.
- Keep: per-sample `renderer.info` snapshots from `GameRenderer` so draw-call, triangle, texture, and geometry counts are captured without shipping debug UI.
- Keep: perf telemetry remains enabled for diagnostics captures even when gameplay-facing debug systems are stripped.
- Keep: `MaterializationPipeline` now materializes nearest squads first so the player reaches live contact sooner in A Shau captures.
- Keep: `SpatialOctree` world bounds now scale vertically with world size. The previous fixed Y bounds (`-50..100`) dropped high-elevation A Shau combatants from hit-detection queries.
- Keep: perf driver now synchronizes player/camera state after teleports, fast-forwards A Shau setup, and uses mode-aware movement/fire behavior.

## Known Measurement Caveats

- Treat the first capture after a fresh browser/server boot as cold-start data. Do not use it for A/B decisions unless explicitly labeled.
- `runtime-samples.json -> systemTop` is useful for quick inspection but not authoritative in every mode. For phase analysis, prefer `browserStalls.totals.userTimingByName`.
- `longtask` and `long-animation-frame` are Chromium diagnostics only and remain harness-only evidence, not gameplay code.

## Warm Baselines Captured 2026-03-04

| Scenario | Artifact | Result | Avg / P95 / P99 ms | Heap end / peak MB | Shots / hits | Avg draw calls | Avg triangles | Max textures | Browser stalls |
|---|---|---|---|---|---|---:|---:|---:|---|
| `ashau:short` | `2026-03-04T07-46-50-552Z` | WARN | `8.93 / 17.70 / 25.80` | `30.31 / 73.70` | `270 / 150` | 118.19 | 332,363 | 72 | `23` long tasks (`2240ms` max), `24` LoAFs (`5561ms` blocking) |
| `combat120` | `2026-03-04T07-50-37-054Z` | FAIL, behavior-valid | `15.10 / 23.20 / 100.00` | `15.73 / 26.98` | `212 / 130` | 192.81 | 263,598 | 63 | `76` long tasks (`234ms` max), `76` LoAFs (`6104ms` blocking) |
| `openfrontier:short` | `2026-03-04T07-52-39-767Z` | WARN | `6.57 / 13.80 / 25.20` | `21.24 / 31.23` | `43 / 32` | 254.72 | 639,428 | 80 | `86` long tasks (`858ms` max), `86` LoAFs (`7546ms` blocking) |
| `frontier30m` | `2026-03-04T07-57-32-230Z` | FAIL, behavior-valid | `7.13 / 12.50 / 85.90` | `14.04 / 36.67` | `156 / 85` | 155.08 | 682,198 | 80 | `500` long tasks (`877ms` max), `497` LoAFs (`40506ms` blocking) |

## Tick-Group Evidence Snapshot

- `combat120`: `Combat=32816ms` dominates by a wide margin. `combatBreakdown.aiUpdate` averages `16.45ms`, and validation fails on AI budget starvation (`16.82` average events/sample).
- `openfrontier:short`: `Terrain=11688ms`, `Combat=10584ms`, `Player=4279ms`. This mode has the highest draw-call pressure in the short captures (`254.72` average calls).
- `ashau:short`: `WarSim=43492ms`, `Combat=19000ms`, `Terrain=6883ms`, `World=6598ms`. Average frame time is acceptable, but heap peaks remain large and browser stalls are still visible.
- `frontier30m`: `Terrain=64890ms`, `Combat=64653ms`, `Player=40204ms`, `World=24976ms`. Average frame time stays low while tail behavior fails, so this is a stability/tail problem rather than a throughput problem.

## Ranked Phase 2 Targets

1. `combat120` combat AI starvation and p99 tails. This is the clearest single-system bottleneck and the best first optimization target.
2. `open_frontier` tail spikes under terrain/render load. Draw calls and triangle throughput are highest here, and browser-stall totals stay elevated despite good averages.
3. `frontier30m` long-tail stability. The soak failure is driven by recurrent long tasks / LoAF blocking, not by mean frame time.
4. `a_shau_valley` WarSim cost and heap peaks. The scenario is finally behavior-valid, so Phase 2 can measure the strategy stack instead of fighting harness validity.

## Phase 2 Entry Conditions

- Run `npm run test:run`, `npm run validate`, and a production bundle scan after any harness or diagnostics edit.
- Use the artifact IDs above as the pre-change baselines until newer warm captures are explicitly promoted.
- Do not evaluate WebGPU, WASM, workers, or new spatial structures until the measured bottleneck for a scenario is named first.

## Validation Snapshot (2026-03-04)

- `npm run test:run`: pass (`2956` tests passed, `2` skipped).
- `npm run validate`: pass (`test:run` + production build).
- Production bundle scan: no matches for perf globals, observer hooks, or `SystemUpdater.*` timing labels in `dist/assets`.
- Source console scan: raw console usage in shipping code is limited to fatal bootstrap errors in `src/main.ts` / `src/core/bootstrap.ts` plus the centralized `Logger` implementation.
