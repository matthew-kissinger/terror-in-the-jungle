# Engine Remediation Plan

Last updated: 2026-03-09

## Objective

Fix deploy/spawn correctness first, then replace the terrain runtime with an honest budgeted streaming model. This document is the execution checklist and gets updated as milestones land.

## Milestones

### Milestone 1: Spawn And Deploy Correctness

Status: Complete

Goals:
- Make deploy and respawn maps render runtime-provided spawn points instead of re-deriving rules locally.
- Fix A Shau insertion preselection so it can target the intended insertion area instead of silently collapsing to the wrong fallback.
- Hide unsupported future OPFOR player entry for now instead of exposing a partially wired path.
- Remove hard-coded US player squad spawning assumptions.

Work items:
- [x] Add a shared spawn-point model owned by `PlayerRespawnManager`.
- [x] Pass spawn data and map extents into the map UI through `RespawnMapController`.
- [x] Use a single deploy map implementation for all modes.
- [x] Add A Shau insertion classes and preselection heuristics.
- [x] Gate player launch selection to BLUFOR for now.
- [x] Remove hard-coded US player squad spawning assumptions.

Validation:
- Deploy map extents match mode world size.
- A Shau initial deploy defaults to a valid tactical insertion/LZ choice.
- Respawn map cannot present spawn points the runtime would reject.
- Unsupported factions are not selectable from the start screen.

Progress notes:
- Shared spawn points now drive the deploy map instead of UI-local spawnability rules.
- A Shau initial deploy adds a tactical insertion point and preselects it by policy.
- Focused tests now pass for `gameModeDefinitions`, `GameModeManager`, and `PlayerRespawnManager`.

### Milestone 2: Terrain Streaming Scheduler

Status: Complete

Goals:
- Replace threshold-triggered synchronous terrain work with budgeted queues.
- Introduce real local readiness semantics instead of global initialization flags.

Work items:
- [x] Add a terrain streaming scheduler with explicit stream budgets.
- [x] Split terrain work into render, collision, and vegetation streams.
- [x] Surface per-stream metrics and queue depth for debugging.
- [x] Replace global terrain-ready checks with local area-ready queries.

Validation:
- Terrain update path respects per-frame work budgets.
- Readiness checks reflect local tile residency instead of world bounds.

Progress notes:
- Terrain update now runs through explicit `render`, `vegetation`, and `collision` streams.
- Local readiness now uses collision coverage around a requested position instead of global initialization.
- Build and focused terrain/player/mode tests are passing after the scheduler integration.

### Milestone 3: Collision Streaming

Status: Complete (incremental row rebuild sufficient; queue-reset bug fixed, backlog drains to 0)

Goals:
- Replace full near-field collision mesh rebuilds with incremental tile residency and bounded rebuild work.

Work items:
- [x] Queue collision rebuild work when the player moves beyond the rebuild threshold.
- [x] Rebuild the near-field mesh incrementally over multiple frames instead of in one burst.
- [ ] Replace the row-based incremental mesh with true collision tile residency if needed after profiling.

Validation:
- Collision remains continuous while moving.
- Movement no longer triggers a full collision rebuild burst.

### Milestone 4: Vegetation Streaming

Status: Complete (adaptive shedding, Poisson caching, throughput tuning landed; remaining backlog is representation issue, not scheduler)

Goals:
- Remove synchronous vegetation bursts on cell boundary crossings.

Work items:
- [x] Queue vegetation activation/removal work.
- [x] Prioritize nearby cells and defer outer rings.
- [ ] Add adaptive shedding based on frame pressure after live profiling.

Validation:
- Vegetation activation cost is spread across frames.
- Traversal across cell boundaries no longer creates large spikes.

### Milestone 5: Contract Cleanup

Status: Pending

Goals:
- Remove stale config and misleading terrain APIs after the new path is stable.

Work items:
- Clean up fake chunk-era knobs.
- Replace fake readiness semantics.
- Align docs and debug labels with the actual runtime.

Validation:
- Terrain config names match real runtime behavior.
- Debug output no longer suggests obsolete worker/chunk behavior.

## Current execution notes

- Milestones 1-4 are complete. All streaming work items landed.
- Collision streaming uses incremental row rebuild (queue-reset bug fixed, backlog drains to 0).
- Vegetation streaming uses adaptive shedding + Poisson caching (instantaneous cost ~1ms, but backlog still grows under traversal - a representation issue, not scheduler cost).
- Milestone 5 (contract cleanup) is the remaining open work.

## Next

### Phase 1: Runtime Profiling And Validation

Status: In progress

Goals:
- Measure whether the new queued terrain path materially reduces traversal spikes in live play.
- Validate A Shau initial insertion, respawn behavior, and map presentation in the actual game.

Tasks:
- Run A Shau Valley manual playtest from fresh launch through initial deploy.
- Traverse across multiple vegetation and collision update boundaries on foot and by helicopter.
- Capture frame timing and terrain stream behavior for `render`, `vegetation`, and `collision`.
- Verify that `Tactical Insertion` is selected by default and that fallback selections still behave correctly.

Exit criteria:
- No obvious flat-fallback spawn on A Shau initial deploy.
- Terrain spikes while moving are reduced enough to identify the remaining dominant stream.
- We have concrete evidence for whether collision or vegetation is still the main tail-latency source.

Progress notes:
- 2026-03-08: Ran automated A Shau harness capture at [artifacts/perf/2026-03-08T07-03-24-123Z](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/perf/2026-03-08T07-03-24-123Z).
- Result: invalid for perf acceptance on this machine in headless mode. The harness produced `avgFrameMs=100`, `peak_p99_frame_ms=100`, `hitch_50ms_percent=100%`, and `over_budget_percent=79.5%`, which indicates timer/cadence contamination rather than a trustworthy steady-state frame profile.
- Even with that contamination, the artifact is still useful for directional diagnosis:
- `SystemUpdater.Terrain` remained the dominant timed bucket with `maxDurationMs=206.5ms`.
- `SystemUpdater.Combat` spiked secondarily with `maxDurationMs=106.4ms`.
- The run recorded player shots/hits and no runtime error panel, so the mode did enter and remain functionally active.
- Important limitation: the perf harness starts modes via `engine.startGameWithMode(...)`, so it does not validate the new deploy UI flow or confirm that `Tactical Insertion` is selected from the actual deploy screen.
- Important limitation: an Open Frontier run launched in parallel collided on the same artifact timestamp and should be discarded as evidence. Re-run sequentially if needed.
- 2026-03-08: Ran direct Playwright UI validation against the real start-screen and deploy-screen flow in headless mode.
- Result: deploy UI path is functionally correct for A Shau.
- Evidence:
- Start-screen selection exposed only `BLUFOR` and factions `US`, `ARVN`, which matches the temporary launch gating decision.
- Play button label read `PLAN INSERTION US -- A SHAU VALLEY`.
- Deploy screen became visible with header `AIR ASSAULT STAGING`.
- Selected insertion title was `SELECTED INSERTION ZONE`.
- Selected insertion defaulted to `Tactical Insertion`.
- Deploy map rendered with a live canvas.
- Validation screenshot written to [artifacts/ui-validation/ashau-deploy-validation.png](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/ui-validation/ashau-deploy-validation.png).
- 2026-03-08: Ran cross-mode deploy-path validation for Zone Control, Open Frontier, Team Deathmatch, and A Shau. Results saved to [artifacts/ui-validation/mode-deploy-validation.json](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/ui-validation/mode-deploy-validation.json).
- Result summary:
- Zone Control: deploy UI opened correctly and defaulted to `US Base`.
- Team Deathmatch: deploy UI opened correctly and defaulted to `US Deployment`.
- Open Frontier: initial validation showed an HQ fallback instead of a helipad, which exposed a real wiring gap.
- Cause: initial deploy happened before `HelipadSystem` had created runtime helipad objects, so deploy-time spawn selection could not see helipads.
- Fix: deploy-time helipad fallback now sources configured helipads from the current mode config when runtime helipads are not yet populated.
- Re-validation after fix: Open Frontier now defaults to a helipad through the real start flow. Evidence screenshot written to [artifacts/ui-validation/open_frontier-deploy-validation-after-helipad-fallback.png](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/ui-validation/open_frontier-deploy-validation-after-helipad-fallback.png).
- 2026-03-08: Tightened Open Frontier helipad preference so frontier initial deploy favors the main transport pad instead of whichever helipad wins incidental sort order.
- Fix: helipad spawn-point priority now explicitly prefers `helipad_main`, then transport-oriented `UH1` aircraft, while keeping the existing fallback for modes without that semantic metadata.
- Focused validation:
- `PlayerRespawnManager.test.ts` now covers frontier initial deploy selecting `helipad_main` before runtime helipads exist.
- Real browser validation now defaults Open Frontier to `Helipad: UH1 HUEY`. Evidence screenshot written to [artifacts/ui-validation/open_frontier-deploy-validation-main-helipad.png](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/ui-validation/open_frontier-deploy-validation-main-helipad.png), with capture metadata in [artifacts/ui-validation/open_frontier-deploy-validation-main-helipad.json](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/ui-validation/open_frontier-deploy-validation-main-helipad.json).
- 2026-03-08: Extended the perf capture/analyzer path to include terrain stream metrics (`render`, `vegetation`, `collision`) so capture artifacts now show stream budget use and queue backlog instead of only coarse `SystemUpdater.Terrain` timing.
- Stream-aware headless capture at [artifacts/perf/2026-03-08T07-29-20-812Z](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/perf/2026-03-08T07-29-20-812Z) is still invalid for frame-time acceptance, but it produced a useful directional signal:
- `collision` averaged `0.11ms / 0.80ms` yet stayed pinned at `61` pending rows.
- `vegetation` averaged `1.19ms / 0.80ms`, peaked at `5.17ms`, and was over budget in `33.3%` of sampled frames.
- Inspection of the collision runtime found a real logic bug: `TerrainRaycastRuntime.updateNearFieldMesh()` re-queued in-flight rebuilds every frame, resetting `pendingRows` instead of letting the queue drain.
- Fix landed and is covered by `TerrainRaycastRuntime.test.ts`: queued collision rebuilds now continue draining unless the target center actually moves far enough to require a new rebuild.
- Post-fix direct terrain stream probe written to [artifacts/perf/terrain-stream-probe-ashau-post-fix.json](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/perf/terrain-stream-probe-ashau-post-fix.json) confirmed the collision backlog now drains to `0`, shifting the remaining dominant terrain stream to vegetation.
- Follow-up tuning reduced vegetation add throughput from `2` cells/frame to `1` cell/frame in the terrain scheduler.
- Tuned probe written to [artifacts/perf/terrain-stream-probe-ashau-post-fix-tuned.json](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/perf/terrain-stream-probe-ashau-post-fix-tuned.json) shows vegetation dropping from roughly `3.1ms` to `1.4-1.6ms` per sampled frame while collision remains effectively idle when not rebuilding.
- Adaptive vegetation shedding now backs vegetation additions off entirely on severe frames and limits adds to every other frame on moderate-pressure frames, while keeping removals more aggressive so the queue can recover.
- Terrain probe startup is now stable enough to reuse: it disables sandbox autostart races, uses correct Playwright timeout wiring, and waits for actual frame progression instead of trusting the mode-start promise.
- Forced traversal probes are now available and materially more useful than the old headless active-driver path:
- A Shau traversal probe [terrain-stream-probe-a_shau_valley-2026-03-08T08-22-53-348Z.json](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/perf/terrain-stream-probe-a_shau_valley-2026-03-08T08-22-53-348Z.json)
- Open Frontier traversal probe [terrain-stream-probe-open_frontier-2026-03-08T08-22-52-784Z.json](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/perf/terrain-stream-probe-open_frontier-2026-03-08T08-22-52-784Z.json)
- Those traversal probes show the key end-of-night result:
- `collision` now spikes moderately during forced movement but does partially drain (`61 -> 45/37` depending on path), so it is no longer the clearly broken stream.
- `vegetation` stays cheap in instantaneous time but its pending queue climbs from `158` to roughly `169` under traversal instead of draining, which means the remaining problem is residency pressure/representation honesty, not just scheduler cost.
- Short headless perf capture at [artifacts/perf/2026-03-08T08-16-36-725Z](/C:/Users/Mattm/X/games-3d/terror-in-the-jungle/artifacts/perf/2026-03-08T08-16-36-725Z) is still invalid for frame acceptance on this machine, and also showed the active scenario driver was not generating meaningful A Shau traversal (`moved=0`).

Conclusion:
- Automated headless capture on this machine is good enough for coarse failure smoke only, not for acceptance of traversal/frame-budget improvements.
- Deploy/start flow for A Shau is now validated through the actual UI path.
- Deploy/start flow is now validated across all active game modes.
- Spawn wiring is functionally correct across active modes, including a semantically correct default Open Frontier helipad.
- The collision stream had a real queue-reset bug; that bug is now fixed and no longer appears to be the primary terrain tail source in follow-up probes.
- Vegetation is now the remaining terrain architecture problem. Its instantaneous cost is materially lower after caching and scheduling fixes, but its queue still does not drain honestly under traversal.
- The next terrain change should be staged vegetation activation or a cheaper distant representation split, not another small budget tweak.
- Headed/manual play is still valuable, but it is no longer the only way to inspect traversal behavior because the forced traversal probes now produce repeatable evidence.

### Phase 2: Vegetation Residency Rewrite Decision

Status: Ready

Goals:
- Make vegetation residency honest under traversal, not just cheap per frame.

Tasks:
- Implement staged activation so residency can complete before full billboard population.
- Or split distant/mid vegetation to a cheaper representation that satisfies backlog faster.
- Re-run forced traversal probes in A Shau and Open Frontier after each prototype.

Exit criteria:
- Vegetation pending queue drains or stabilizes under traversal instead of monotonically growing.
- Terrain stream spikes remain bounded while crossing multiple cell boundaries.

### Phase 3: Budget Tuning

Status: Deferred until Phase 2

Goals:
- Tune stream budgets using actual runtime data instead of guesses.

Tasks:
- Adjust `renderUpdateBudgetMs`, `collisionUpdateBudgetMs`, and `vegetationUpdateBudgetMs`.
- Tune collision row batch size and vegetation add/remove throughput.
- Re-test in A Shau and Open Frontier after each adjustment.

Exit criteria:
- Stable traversal with acceptable p95 and improved p99 frame time.
- No starvation in collision or vegetation queues during sustained movement.

### Phase 4: Collision Rewrite Decision Gate

Status: Blocked on Phase 2 and Phase 3

Decision:
- If incremental row rebuilding is sufficient after tuning, keep it and clean up the API surface.
- If collision remains the top source of traversal spikes, replace it with true collision tile residency and incremental BVH assembly.

Decision inputs:
- Live profiling data
- Queue backlog behavior
- Remaining p99 spikes in traversal-heavy scenarios

## Immediate next action

- Prototype staged vegetation activation or distant vegetation representation split.
- Use `npm run perf:terrain-probe:ashau:traverse` and `npm run perf:terrain-probe:frontier:traverse` as the primary regression checks for backlog behavior.
- Keep headed/manual A Shau play as a secondary validation pass for feel and visuals once the vegetation residency model changes.

## Near-term polish

- If future modes need multiple semantically distinct insertion pads, move the current frontier-specific helipad heuristic to explicit config metadata instead of relying on `id`/aircraft naming.
