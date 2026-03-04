# Perf Frontier

Last updated: 2026-03-04
Scope: Phase 1 measurement, harness validation, baseline capture state, and Phase 2 bottleneck analysis.

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

## Phase 2 Analysis Snapshot (2026-03-04)

### Deep `combat120` capture

- Artifact: `2026-03-04T13-27-30-341Z` (`npx tsx scripts/perf-capture.ts --headed --mode ai_sandbox --npcs 120 --duration 90 --warmup 15 --deep-cdp`)
- Result: behavior-valid but still fails `peak_p99_frame_ms` (`100ms`) and AI starvation (`34.31` average events/sample).
- Startup remained valid (`startup_threshold_seconds=9`), so the artifact is useful for hot-path diagnosis rather than harness repair.
- `console.json` localizes the worst spikes to `CombatantLODManager.updateCombatantFull()` calling `CombatantAI.updateAI()`:
  - `[AI spike] 217.2ms ... state=suppressing`
  - `[AI spike] 258.3ms ... state=advancing`
  - `[AI full-update spike] total=258.6ms ai=258.3 move=0.0 combat=0.0 render=0.0 spatial=0.0`
  - `[LOD spike] total=261.0ms ... high=261.0 ... counts(h/m/l/c)=94/0/0/0`
- Deep user-timing maxima match the logs: `SystemUpdater.Combat.maxDurationMs=261.1`, versus the warm baseline peak of `224.4ms`.

### CPU hot paths validated against source

- Deep CPU profile confirms the main production hotspots (excluding harness-only `withUserTiming`):
  - `HeightQueryCache.getHeightAt`: `2634.9ms`
  - `SpatialOctreeQueries.queryRadiusRecursive`: `554.1ms`
  - `CombatantLODManager.updateCombatantFull`: `401.1ms`
  - `SpatialGridManager.queryRadius`: `351.8ms`
  - `CombatantRenderer.updateBillboards`: `326.2ms`
  - `CombatantMovement.getTerrainHeightForCombatant`: `293.1ms`
  - `CombatantMovement.updateMovement`: `290.0ms`
  - `CombatantAI.updateAI`: `169.9ms`
  - `AITargetAcquisition.findNearestEnemy`: `128.9ms`
- Source validation matches the profile:
  - `CombatantLODManager.updateCombatantVisualOnly()` still performs movement, texture updates, rotation, and spatial sync on off-frames.
  - `CombatantMovement.updateMovement()` applies spacing force and terrain sampling unless explicitly disabled.
  - `AITargetAcquisition.findNearestEnemy()` and `countNearbyEnemies()` each issue `queryRadius()` scans.
  - `HeightQueryCache.getHeightAt()` still builds string keys and does `delete()` + `set()` on cache hits to maintain LRU order.

### Cross-mode tail attribution

| Scenario | Primary evidence | Dominant max-duration signal | Current interpretation |
|---|---|---:|---|
| `combat120` | Warm baseline + deep capture | `SystemUpdater.Combat=224.4ms` warm, `261.1ms` deep | High-LOD combat AI spikes are the clearest frame-tail source. Terrain still leaks into tails secondarily (`89.3ms` warm, `143.5ms` / `133.4ms` slow-frame logs). |
| `openfrontier:short` | Warm baseline | `SystemUpdater.Terrain=849.6ms` | Terrain tail spikes dominate despite low average frame time. Rendering pressure is high (`254.72` draw calls, `639,428` triangles), but the tail signature is CPU terrain work first. |
| `ashau:short` | Warm baseline | `SystemUpdater.Terrain=2225.2ms`, `SystemUpdater.WarSim=25.0ms` | A Shau is no longer blocked on contact validity. Terrain spikes are extreme, while WarSim is the steady heavy system by total time. |
| `frontier30m` | Warm soak baseline | `SystemUpdater.Terrain=869.7ms`, `SystemUpdater.Combat=280.8ms` | Soak failure is a terrain-led tail problem with combat as the secondary contributor. |

### Heap checkpoints

`runtime-samples.json` only reaches the full `t=1800s` point in the soak run, but the nearest checkpoints still show useful shape:

| Scenario | `t=0s` | `t=60s` | nearest `t=300s` | nearest `t=1800s` | Reading |
|---|---:|---:|---:|---:|---|
| `combat120` | `53.88 MB` | `50.31 MB` | `75.73 MB` at `89.3s` | `75.73 MB` at `89.3s` | Short run ends on a high wave; not enough evidence yet for a leak, but churn remains visible. |
| `openfrontier:short` | `77.18 MB` | `63.91 MB` | `86.85 MB` at `179.1s` | `86.85 MB` at `179.1s` | Similar wave pattern with elevated end-state. |
| `ashau:short` | `143.51 MB` | `115.27 MB` | `176.90 MB` at `179.5s` | `176.90 MB` at `179.5s` | Largest retained wave of the short scenarios; likely mixed terrain + strategy pressure. |
| `frontier30m` | `63.55 MB` | `91.06 MB` | `91.36 MB` at `299.5s` | `85.45 MB` at `1798.2s` | Soak does recover from peak, so the current signature looks more like churn/tail pressure than an unbounded leak. |

### Terrain-specific findings

- `TerrainSystem.update()` currently bundles `renderRuntime.update()`, `vegetationScatterer.update()`, and `raycastRuntime.updateNearFieldMesh()` into the same tick group.
- `TerrainRaycastRuntime.rebuildNearFieldMesh()` rebuilds a fresh CPU mesh when the player moves more than `50m`. At the default `radius=200` and `step=4`, that is roughly `10,201` vertices plus rebuilt indices each time.
- `CDLODQuadtree.selectTiles()` does not look heavy enough in source to explain `849-2225ms` tails by itself.
- Current evidence points to height-query cost plus near-field rebuild bursts as the first terrain suspects, not CDLOD selection alone.

### Rendering / asset pipeline findings

- `openfrontier:short` remains the highest short-run render-pressure mode (`254.72` draw calls, `639,428` triangles, `80` textures).
- `frontier30m` reaches the highest triangle load in the warm baselines (`682,198` average triangles).
- `AssetLoader` still uses `THREE.TextureLoader()` with `.webp`, `.png`, and `.jpg` assets only. There is no `KTX2Loader`, Basis/KTX2 transcode path, WebGPU renderer path, Draco, or meshopt pipeline in active use.
- This means texture compression and GPU-memory work remain viable frontier candidates, but they are not the first measured bottleneck in the current captures.

### Shader / browser diagnostics

- Deep `combat120` capture logged two startup-only `THREE.WebGLProgram` warnings for `f_sampleBiomeTextureRaw`.
- No current evidence points to steady-state shader-variant churn as the cause of the worst frame tails. Treat shader work as a secondary investigation unless a later trace shows runtime compile stalls outside startup.

### Reverted experiment: `HeightQueryCache` numeric-key LRU

- Attempted change: replace string keys + `Map.delete()/set()` hit churn with numeric quantization keys and a linked-list LRU.
- Attempt artifacts:
  - `openfrontier:short`: `2026-03-04T13-43-12-583Z`
  - warm `combat120`: `2026-03-04T13-47-56-906Z`
  - second warm `combat120` sanity check: `2026-03-04T13-50-37-624Z`
- Why it was reverted:
  - `openfrontier:short` looked materially better (`6.57ms -> 5.40ms` avg, `25.2ms -> 21.3ms` p99, `849.6ms -> 170.9ms` terrain max), but this was a single post-change run.
  - The first post-change `combat120` run at `2026-03-04T13:40:46.312Z` was cold-start polluted and should not be used for A/B.
  - The warm `combat120` pair was mixed: frame metrics improved (`15.10ms -> 14.25ms` avg, AI starvation `16.82 -> 13.09`), but heap growth/regression worsened materially (`15.73MB -> 29.53MB`, recovery `41.7% -> 8.7%`) and `SystemUpdater.Combat.maxDurationMs` increased (`224.4 -> 241.1`).
  - The second warm `combat120` rerun lost combat pressure (`80 / 41` shots / hits) and was not trustworthy as an acceptance run.
- Decision: revert the production change and keep the hotspot ranking. Revisit `HeightQueryCache` only with a lower-overhead design or after AI query reduction narrows the combat variance.

### Accepted experiment: frame-local AI neighborhood cache

- Accepted change: `AITargetAcquisition` now caches the widest `queryRadius()` result per combatant for the current frame, and patrol/defend cluster-density checks reuse that cached neighborhood through `CombatantAI` / `AITargeting`.
- Primary acceptance pair:
  - warm baseline: `2026-03-04T07-50-37-054Z`
  - warm post-change: `2026-03-04T14-12-07-483Z`
- Secondary / discarded captures:
  - fresh pre-change control `2026-03-04T14-04-40-073Z` under-shot the driver (`81 / 44` shots / hits) and is not the primary A/B control.
  - first post-change run `2026-03-04T14-09-38-289Z` restarted the dev server and is flagged as cold-start data.
- Matched warm result under slightly higher combat pressure (`220 / 140` shots / hits post vs `212 / 130` baseline):
  - `avgFrameMs`: `15.10 -> 14.59`
  - `p95FrameMs`: `23.2 -> 22.6`
  - hitch `>50ms`: `1.30% -> 1.04%`
  - average over-budget time: `1.43% -> 1.08%`
  - combat-budget dominance: `8.0% -> 5.7%`
  - AI starvation: `16.82 -> 12.91` events/sample
  - long tasks: `76 -> 63`; LoAF blocking: `6104.3ms -> 4910.4ms`
  - heap end-growth: `15.73MB -> 3.64MB`
  - heap peak-growth: `26.98MB -> 10.06MB`
  - heap recovery: `41.7% -> 63.8%`
- Remaining losses / limits:
  - `peak_p99_frame_ms` still fails at `100ms`.
  - `SystemUpdater.Combat.maxDurationMs` rose slightly: `224.4ms -> 233.6ms`.
  - `SystemUpdater.Terrain.maxDurationMs` also rose slightly: `89.3ms -> 97.4ms`.
- Decision: keep. The change measurably reduces average combat pressure, starvation, and heap churn under comparable or higher load, but it does not solve the worst combat-tail spikes. The next AI slice should target high-LOD `suppressing` / `advancing` work and off-frame movement/spatial upkeep.

### Reverted experiment: disable spacing on visual-only high-LOD frames

- Attempted change: pass `disableSpacing: true` to `CombatantMovement.updateMovement()` from `CombatantLODManager.updateCombatantVisualOnly()` so staggered high-LOD off-frames keep movement/rotation/spatial sync but skip friendly-spacing queries.
- Attempt artifacts:
  - first warm post-change run: `2026-03-04T18-07-17-018Z`
  - second warm sanity rerun: `2026-03-04T18-10-35-774Z`
- Compared against accepted warm combat baseline `2026-03-04T14-12-07-483Z`, the first post-change run was not convincing:
  - headline averages moved slightly in the right direction (`avgFrameMs 14.59 -> 14.37`), but tail/stall signals regressed.
  - hitch `>50ms`: `1.04% -> 1.42%`
  - average over-budget time: `1.08% -> 1.69%`
  - combat-budget dominance: `5.7% -> 10.2%`
  - AI starvation: `12.91 -> 16.19` events/sample
  - long tasks: `63 -> 87`; LoAF blocking: `4910.4ms -> 7287.9ms`
  - end-of-run `SystemUpdater.Combat.maxDurationMs` improved slightly (`233.6ms -> 229.9ms`), but `SystemUpdater.Terrain.maxDurationMs` worsened (`97.4ms -> 119.3ms`).
- The second warm rerun under-shot badly (`54 / 32` shots / hits) while still failing the same tail checks:
  - summary `avgFrameMs=14.18`, hitch `>50ms=1.40%`, over-budget `1.53%`, combat-budget dominance `12.5%`, AI starvation `18.91`, long tasks `86`, LoAF blocking `7368.3ms`.
  - lower combat pressure plus worse tails made it unsuitable as an acceptance run and strengthened the rejection.
- Decision: revert. Friendly-spacing work on visual-only high-LOD frames is not the primary source of the remaining `combat120` tails. The next combat slice should target full-update `suppressing` / `advancing` spikes or other off-frame upkeep with tighter evidence.

### Reverted experiment: throttle advancing threat reacquisition

- Attempted change: in `AIStateMovement.handleAdvancing()`, reuse a live target and throttle `findNearestEnemy()` calls during active flank movement.
- Attempt artifacts:
  - cold-start post-change run: `2026-03-04T18-17-53-745Z`
  - warm post-change rerun: `2026-03-04T18-20-23-437Z`
- Why it was reverted:
  - the first post-change capture restarted the dev server and did not hit the startup frame threshold until `24s`, so it is cold-start data only.
  - the warm rerun improved the headline mean (`avgFrameMs 14.59 -> 13.54`) but materially reduced combat pressure (`220 / 140 -> 90 / 53` shots / hits), which makes it unacceptable as a gameplay-preserving change.
  - the warm rerun also worsened the tail and stall signals that matter:
    - hitch `>50ms`: `1.04% -> 1.39%`
    - average over-budget time: `1.08% -> 1.54%`
    - combat-budget dominance: `5.7% -> 15.9%`
    - AI starvation: `12.91 -> 14.44` events/sample
    - long tasks: `63 -> 88`; LoAF blocking: `4910.4ms -> 9624.4ms`
    - `SystemUpdater.Combat.maxDurationMs`: `233.6ms -> 255.6ms`
- Decision: revert. Throttling advancing threat reacquisition traded away combat activity before it reduced the actual `combat120` tails.

### March 4 diagnostic attribution: `suppressing` / `advancing` spikes are really suppression-init work

- Diagnostic instrumentation added:
  - dev-only `aiPhaseMs` snapshots on `combatProfile.timing`
  - dev-only phase suffixes on `[AI spike]` / `[AI full-update spike]`
  - dev-only `[AI engage spike]` logs inside `AIStateEngage.handleEngaging()`
- Diagnostic artifacts:
  - full combat capture with sampled AI phases: `2026-03-04T18-30-45-251Z`
  - short spike-attribution run: `2026-03-04T18-35-30-494Z`
  - short engage-subphase run: `2026-03-04T18-39-02-145Z`
- What the evidence says:
  - sampled `aiPhaseMs` from `2026-03-04T18-30-45-251Z` showed steady-state `handler.suppressing` is effectively zero while `handler.engaging` dominates. That means the rare spike labels were being misread from transition end-state, not true hot-path ownership.
  - `2026-03-04T18-35-30-494Z` confirmed that direct `[AI spike]` events logged as `state=suppressing` / `state=advancing` actually carried `phases=handler.engaging:...`.
  - `2026-03-04T18-39-02-145Z` then localized the engaging spikes further: repeated `[AI engage spike]` logs were dominated by `suppression.initiate` at `65-214ms`, with only trace time in `suppression.shouldInitiate`, `nearbyEnemies`, `flank.shouldInitiate`, or outer cover checks.
  - Representative examples from `2026-03-04T18-39-02-145Z`:
    - `combatant_73`: `202.2ms`, `state=suppressing`, `phases=suppression.initiate:201.8`
    - `combatant_20`: `164.0ms`, `state=advancing`, `phases=suppression.initiate:163.7`
    - `combatant_88`: `120.5ms`, `state=suppressing`, `phases=suppression.initiate:120.0, cover.findBest:0.4, nearbyEnemies:0.1`
- Source-backed inference:
  - Inside `AIStateEngage.initiateSquadSuppression()`, the only repeated expensive substep is the per-flanker `findNearestCover({ ...member, position: flankingPos }, targetPos)` call.
  - `AICoverFinding.findNearestCover()` does a broad search over sandbags, a vegetation grid, and terrain raycasts. Running that synchronously for multiple flankers in one squad-initiation burst is the most credible explanation for the `65-214ms` spikes.
- Probe cleanup: the temporary AI attribution fields/log suffixes were removed after these captures and the production bundle was re-scanned clean. The artifacts above remain the source of truth for this diagnosis.
- Decision: do not touch gameplay cadence again until this suppression-init cover-search path is addressed. The next combat optimization slice should target that synchronous cover search directly, not state throttling.

### Accepted experiment: suppression-init flank probe elevation fix + spread removal

- Accepted code change in `AIStateEngage.initiateSquadSuppression()`:
  - flank probe Y now uses `member.position.y` instead of hardcoded `0`
  - per-flanker `findNearestCover()` probe now reuses a tiny `{ position }` object instead of `{ ...member, position: flankingPos }` spread allocation
- Why this target:
  - diagnostics localized rare tails to synchronous per-flanker suppression-init cover search
  - hardcoded `y=0` widened vegetation/elevation candidate checks in `AICoverFinding.findNearestCover()` on non-flat terrain, and object spreading added avoidable churn in the hot loop
- Artifacts:
  - warm pre-change control: `2026-03-04T18-56-58-892Z`
  - warm post-change run 1: `2026-03-04T19-00-58-280Z`
  - warm post-change run 2 (sanity rerun): `2026-03-04T19-03-09-563Z`
- Result summary:
  - pre `2026-03-04T18-56-58-892Z`: `avgFrameMs=14.37`, `hitch>50=1.21%`, `overBudget=1.41%`, `aiStarve=22.01`, `SystemUpdater.Combat.max=259.7ms`, `longTasks=74`, shots/hits `90/66`
  - post1 `2026-03-04T19-00-58-280Z`: `avgFrameMs=13.95`, `hitch>50=0.72%`, `overBudget=0.87%`, `aiStarve=7.53`, `SystemUpdater.Combat.max=218.6ms`, `longTasks=47`, shots/hits `120/68`
  - post2 `2026-03-04T19-03-09-563Z`: `avgFrameMs=14.13`, `hitch>50=0.48%`, `overBudget=0.70%`, `aiStarve=11.40`, `SystemUpdater.Combat.max=182.3ms`, `longTasks=31`, shots/hits `90/49`
- Read:
  - both warm post-change captures improved combat-tail/stall signals versus the matched warm pre-control, including lower `SystemUpdater.Combat.maxDurationMs`
  - one rerun (`post2`) also dropped `peak_p99_frame_ms` from fail (`100ms`) to warn (`59.8ms`)
  - combat pressure still varies (`shots/hits` drift and `moved=0` in active-driver logs), so treat this as an accepted incremental win, not final closure of combat tails
- Decision: keep. This is a low-risk, behavior-preserving hot-path cleanup with consistent positive tail movement.

## Validation Snapshot (2026-03-04)

- `npm run test:run`: pass (`2960` tests passed, `2` skipped).
- `npm run validate`: pass (`test:run` + production build).
- Production bundle scan: no matches for perf globals, observer hooks, or `SystemUpdater.*` timing labels in `dist/assets`.
- Source console scan: raw console usage in shipping code is limited to fatal bootstrap errors in `src/main.ts` / `src/core/bootstrap.ts` plus the centralized `Logger` implementation.

## Ranked Phase 2 Targets

1. `combat120` high-LOD AI spikes still rooted in `AIStateEngage.initiateSquadSuppression()`. The elevation/probe cleanup lowered tails, but rare `100ms` p99 events still appear in some warm runs.
2. `HeightQueryCache.getHeightAt()` keying and hit cost. This remains a cross-cutting hotspot for combat and terrain paths even after AI query consolidation.
3. Harness pressure normalization for `combat120` acceptance loops (`shots/hits` comparability when active-driver movement remains compressed).
4. `TerrainRaycastRuntime` near-field rebuild bursts and the terrain height-sampling path in `open_frontier`, `frontier30m`, and `a_shau_valley`.
5. A Shau `WarSim` steady-state cost and large heap waves once terrain tails are reduced enough to isolate strategy work more cleanly.
6. GPU/asset pipeline work (`KTX2`, atlasing, WebGPU/BatchedMesh) after the current CPU bottlenecks are re-measured.

## Frontier Technology Fit (Measured, Not Adopted)

- High-fit, low-friction now:
  - reduce or defer the remaining synchronous per-flanker cover search cost inside `AIStateEngage.initiateSquadSuppression()`
  - budget or amortize suppression-init cover lookups across frames without changing tactical outcomes
  - if deeper attribution is needed, re-add the March 4 AI probes behind harness-only gating and remove them again after capture
  - data-oriented keying / lower-churn cache strategy for `HeightQueryCache`
  - scheduling or throttling around near-field terrain rebuild work
- Medium-fit after JS-level cleanup:
  - worker offload for terrain rebuild or WarSim batch work if either still exceeds `4ms/frame` after local optimizations
  - KTX2/Basis texture compression for memory pressure and startup decode cost
- Deferred until evidence says rendering is the limit:
  - WebGPU renderer migration
  - BatchedMesh expansion purely for throughput
  - WASM hot-path replacement for combat or strategy loops
  - navmesh / recast adoption
