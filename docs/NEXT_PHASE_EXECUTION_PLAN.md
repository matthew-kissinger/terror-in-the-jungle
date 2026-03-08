# Next Phase Execution Plan

Last updated: 2026-03-08

## Objective

Finish the transition from "mostly working" to "mechanically honest and clearly tunable" across terrain, A Shau gameplay flow, visual content, and profiling/tooling.

This plan is intentionally execution-oriented. Each track has:
- a product goal
- a technical goal
- concrete implementation steps
- acceptance criteria

## Current baseline

- Spawn/deploy flow is functionally correct across active modes.
- Open Frontier now defaults to the correct main transport helipad.
- A Shau initial deploy defaults to `Tactical Insertion`.
- Terrain runtime now has separate render / vegetation / collision streams.
- Collision queue-reset bug was fixed; collision backlog now drains.
- Vegetation remains the dominant terrain-side stream in current probes.

## Track 1: Vegetation Runtime

Status: In progress

### Goals

- Reduce vegetation cell activation cost so it no longer dominates terrain streaming.
- Make vegetation scheduling honest under frame pressure.
- Preserve visual richness without large boundary spikes.

### Phase 1A: Remove avoidable generation waste

Status: In progress

Tasks:
- [x] Add terrain stream metrics to perf artifacts so vegetation can be measured separately.
- [x] Reduce vegetation scheduler throughput from 2 adds/frame to 1 add/frame.
- [x] Cache Poisson sample templates for repeated cell generation profiles.
- [x] Add deterministic per-cell variation on top of cached templates.
- [x] Add focused generator tests for cache reuse and varied cell offsets.

Acceptance:
- Cached-template path is covered by tests.
- Direct stream probe shows lower vegetation generation cost than the uncached path.

### Phase 1B: Make scheduler adaptive

Status: In progress

Tasks:
- [x] Add vegetation shedding policy for frame pressure.
- [x] Allow zero-add frames when frame time is already unhealthy.
- [x] Keep removals more aggressive than additions to avoid runaway backlog.
- [x] Surface vegetation queue backlog and last stream time in the debug overlay.

Acceptance:
- Vegetation stream backlog can grow and recover predictably.
- Frame-pressure conditions reduce vegetation work instead of blindly continuing.

### Phase 1C: If still hot, change representation

Status: In progress

Tasks:
- [x] Decide whether distant mid-level vegetation should downgrade to a cheaper representation.
- [x] Evaluate staged activation: residency first, full billboard population second.
- [ ] Evaluate chunk/cell generation caching if runtime generation remains too expensive.

Decision gate:
- If vegetation remains the top traversal tail after scheduler tuning, move to staged activation or representation split.

Decision:
- Traversal probes in both A Shau and Open Frontier now show low vegetation stream time but non-draining vegetation backlog under forced cell crossings.
- That means the next fix is no longer budget tuning. It is staged activation or a cheaper distant representation so residency demand can be satisfied honestly.

## Track 2: A Shau Product Pass

Status: Pending

### Goals

- Make A Shau feel like a war-zone insertion, not just a correct spawn screen.
- Improve player comprehension on entry and during early traversal.

### Phase 2A: Insertion readability

Tasks:
- [ ] Add explicit insertion-type language in the deploy summary.
- [ ] Distinguish tactical, safer-LZ, and aggressive forward insertion in UI/policy.
- [ ] Review A Shau default insertion bias against current objective pressure.

Acceptance:
- Player can tell why the default insertion was chosen.
- Alternate insertion styles are understandable and intentional.

### Phase 2B: Objective and war-state readability

Tasks:
- [ ] Improve first-entry guidance for A Shau.
- [ ] Surface active pressure / front-line direction more clearly.
- [ ] Review minimap/full-map intelligence split for the mode.

Acceptance:
- Early A Shau play answers: where am I, what is happening, where should I push?

## Track 3: Terrain Runtime Honesty

Status: In progress

### Goals

- Remove misleading or stale terrain-era contracts.
- Expose truthful stream state in both tooling and live debugging.

Tasks:
- [x] Surface terrain stream metrics in the real-time performance overlay.
- [x] Surface terrain stream metrics in F1 console diagnostics.
- [ ] Remove/rename stale chunk-era config that no longer controls runtime behavior.
- [ ] Decide whether worker pool APIs are real runtime dependencies or legacy compatibility.

Acceptance:
- Debug surfaces show stream backlog and cost directly.
- Config names match the actual runtime model.

## Track 4: Content Scaling

Status: In progress

### Goals

- Improve large-map readability and vegetation silhouette quality.
- Make key biome elements read correctly at gameplay distances.

Tasks:
- [x] Increase palm and coconut tree silhouette scale.
- [ ] Run visual balance pass for palms against canopy trees.
- [ ] Review A Shau and Open Frontier landmark readability.
- [ ] Tune LZ / helipad authored spaces to feel deliberate.

Acceptance:
- Palms read distinctly taller than surrounding mid-level vegetation.
- Important landmarks remain legible at combat/travel distances.

## Track 5: Tooling

Status: In progress

### Goals

- Shorten iteration loop for perf and gameplay validation.
- Make failure modes obvious instead of hidden in raw artifacts.

Tasks:
- [x] Add terrain stream metrics to perf captures.
- [x] Teach analyzer to skip incomplete/empty latest artifacts.
- [x] Add a dedicated short terrain-stream probe script or preset.
- [x] Route terrain probe startup through sandbox autostart instead of the interactive deploy flow.
- [x] Add automatic flags for non-draining terrain queues.
- [x] Add headed validation recipe for A Shau traversal and vegetation-heavy crossings.

Acceptance:
- A terrain-focused probe can be run without hand-editing commands.
- Analyzer can point to the dominant terrain stream directly.

Validation recipe:
- Static probe: `npm run perf:terrain-probe:ashau`
- Traversal probe: `npm run perf:terrain-probe:ashau:traverse`
- Frontier traversal comparison: `npm run perf:terrain-probe:frontier:traverse`
- When headless perf capture is needed for broader system context, use `npx tsx scripts/perf-capture.ts --mode a_shau_valley --npcs 60 --duration 60 --warmup 10 --sample-interval-ms 1000 --detail-every-samples 1 --runtime-preflight false`, but do not treat the resulting frame cadence as acceptance-quality on this machine.

## Recommended execution order

1. Finish Track 1 Phase 1A.
2. Add Track 3 debug/overlay visibility so live tuning is easier.
3. Run headed/manual A Shau traversal once the stream surfaces are visible.
4. Decide whether Track 1 needs scheduler tuning only or a representation change.
5. Start Track 2 product pass once terrain tail behavior is clearer.

## Progress log

- 2026-03-08: Collision queue-reset bug fixed; direct probe confirmed collision pending rows now drain to zero.
- 2026-03-08: Vegetation throughput tuned from 2 adds/frame to 1 add/frame; direct probe reduced vegetation stream cost materially but it remains the dominant terrain stream.
- 2026-03-08: Palm, coconut, and areca silhouettes increased for stronger large-map readability.
- 2026-03-08: Cached Poisson sampling landed in `ChunkVegetationGenerator` with focused tests for cache reuse and per-cell deterministic offsets.
- 2026-03-08: Post-cache A Shau terrain probe at [artifacts/perf/terrain-stream-probe-ashau-post-cache.json](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/perf/terrain-stream-probe-ashau-post-cache.json) showed vegetation at roughly `0.96-1.04ms`, down from the earlier tuned-but-uncached `1.41-1.59ms` range.
- 2026-03-08: Terrain stream metrics now show in the live performance overlay and F1 console diagnostics.
- 2026-03-08: Added dedicated terrain probe command `npm run perf:terrain-probe:ashau` for short stream-focused captures.
- 2026-03-08: TerrainSystem vegetation scheduling now yields under frame pressure. Severe frames (`>=24ms`) do zero vegetation additions and prioritize removals; moderate frames (`>=18ms`) only allow additions every other frame. Covered in `TerrainSystem.test.ts`.
- 2026-03-08: `perf-analyze-latest.ts` now emits terrain queue flags when stream backlogs do not drain or a stream spends most sampled frames over budget.
- 2026-03-08: Terrain probe harness was hardened: fixed Playwright timeout wiring, disabled bogus AI sandbox autostart races, and switched startup readiness to frame-progress observation instead of awaiting the full mode-start promise.
- 2026-03-08: Added traversal-mode terrain probes for forced cell crossings. A Shau traversal probe [terrain-stream-probe-a_shau_valley-2026-03-08T08-22-53-348Z.json](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/perf/terrain-stream-probe-a_shau_valley-2026-03-08T08-22-53-348Z.json) and Open Frontier traversal probe [terrain-stream-probe-open_frontier-2026-03-08T08-22-52-784Z.json](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/perf/terrain-stream-probe-open_frontier-2026-03-08T08-22-52-784Z.json) show collision backlog fluctuating but partially draining, while vegetation backlog grows from `158` to roughly `169` under traversal.
- 2026-03-08: Short A Shau perf capture [2026-03-08T08-16-36-725Z](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/perf/2026-03-08T08-16-36-725Z) remained invalid for frame-acceptance in headless mode on this machine, but it confirmed the active scenario driver is not generating meaningful traversal (`moved=0`), so terrain traversal validation should use the explicit probe scripts instead.
