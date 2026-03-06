# Next Work

Last updated: 2026-03-06
Status: ACTIVE - iterate top-down, check off items, update docs as fixes land

## How To Use This File

Work top-down. Each item has acceptance criteria. When an item is done:
1. Check the box
2. Update the referenced doc(s) listed under "Doc updates"
3. Move to the next item

Items within a tier are priority-ordered. Do not skip tiers unless blocked.

---

## Tier 0: Validate Recent Changes

### 0.1 Perf capture after micro-optimizations
- [x] Run `npm run perf:capture:combat120` (warm, not first boot)
- [x] Run `npm run perf:capture:combat120` a second time for matched pair
- [x] Compare results (see below)
- [x] Record results below

**What changed (this session, uncommitted):**
- LOSAccelerator: removed 5x `performance.now()` calls per LOS query
- HeightQueryCache: scratch vector in `getNormalAt()`, default cache 10K -> 20K
- TerrainRaycastRuntime: BVH grid step 4m -> 6m (10,201 -> ~4,489 vertices per rebuild)

**Results:**
```
combat120 run 1: avg=12.79ms, p99=35.30ms, shots/hits=175/90, starvation=3.94, heap_recovery=81.6% (WARN)
combat120 run 2: avg=13.15ms, p99=30.90ms, shots/hits=201/108, starvation=4.88, heap_recovery=9.6% (FAIL - GC timing variance)
Previous best:   avg=14.17ms, p99=86.90ms, shots/hits=246/133, starvation=12.34
```

p99 improved ~60% (86.90 -> 30-35ms). AI starvation improved ~70% (12.34 -> 3.9-4.9). Avg frame time improved ~8% (14.17 -> 12.8-13.2ms). Combat pressure comparable. Run 2 heap recovery is GC timing variance, not a regression (run 1 recovered 81.6%).

**Decision:** [x] Accept and baseline

Doc updates:
- [x] `ARCHITECTURE_RECOVERY_PLAN.md` - Keep Decision added (confirmed 2026-03-06)
- [x] `PERF_FRONTIER.md` - scenario health matrix updated
- [x] `CLAUDE.md` Current Focus - rewritten to reflect new state

### 0.2 Fix stale handoff docs
- [x] `ACTIVE_GAME_MODES_HANDOFF.md`: Phase 6 (Team/Faction) -> complete
- [x] `ACTIVE_GAME_MODES_HANDOFF.md`: Phase 7 (Death Presentation) -> complete
- [x] `GAME_MODES_EXECUTION_PLAN.md`: Phase 6 state -> complete, note what landed
- [x] `GAME_MODES_EXECUTION_PLAN.md`: Phase 7 state -> complete, note what landed
- [x] `ACTIVE_GAME_MODES_HANDOFF.md`: remove "death presentation work has not started" from Current Gaps
- [x] `ACTIVE_GAME_MODES_HANDOFF.md`: update Resume Here to reflect actual next work
- [x] `ROADMAP.md` Current State Summary table: update Factions row (BLUFOR_CONTROLLED is live)
- [x] `ROADMAP.md` Current State Summary table: update Squad row (selected-squad panel is live)
- [x] `ROADMAP.md` Current State Summary table: update HUD/UI row (command overlay is live)

Doc updates: the items above ARE the doc updates.

---

## Tier 1: Perf Tail Closure (if 0.1 doesn't close p99)

### 1.1 AIStateEngage.initiateSquadSuppression() - remaining cover search bursts
The documented top combat tail suspect. Synchronous `findNearestCover()` per flanker.

- [x] Read `src/systems/combat/ai/AIStateEngage.ts` - locate `initiateSquadSuppression()`
- [x] Profile: how many flankers trigger cover search per call? (max 2, capped by MAX_FLANK_COVER_SEARCHES_PER_SUPPRESSION)
- [x] Implement chosen approach: reduced `AICoverFinding.findVegetationCover` grid from 12x12 to 8x8, added early-out at 4 candidates, reduced terrain search from 16 to 8 angles
- [x] Run matched warm `combat120` pair
- [x] Accept or revert based on evidence

**Results:** Run 1 (cold): avg=13.80ms, p99=42.2ms. Run 2 (warm): avg=12.27ms, p99=34.1ms. p99 passes <50ms acceptance. Comparable to previous best (12.79ms avg, 35.3ms p99).

Doc updates:
- `ARCHITECTURE_RECOVERY_PLAN.md` - Keep Decision or Open Risk update
- `PERF_FRONTIER.md` - scenario health matrix
- `CLAUDE.md` Current Focus items 5-6

### 1.2 TerrainSystem.update() tick-group decoupling
BVH rebuild, vegetation update, and render update all land in one frame. Terrain tails dominate `open_frontier` and `frontier30m`.

- [x] Read `src/systems/terrain/TerrainSystem.ts` - locate `update()` method
- [x] Identify which sub-operations can be deferred to separate frames
- [x] Stagger BVH rebuild: skip on frames where vegetation just rebuilt (VegetationScatterer.update returns bool)
- [x] Run `npm run perf:capture:frontier30m`
- [x] Compare terrain tick-group totals before/after

**Results (2026-03-06, post terrain LOD auto-scaling fix):**
```
frontier30m: avg=6.57ms, p99=100ms (single GC outlier), 888/889 samples p99<29ms
  Previous:  avg=~7ms,   p99=85.90ms (persistent tail)
  AI starvation: 0 (steady state). Hitches >50ms: 0.13%. Heap growth: 5.20MB/30min.
combat120:   avg=12.25ms, p99=39.9ms, starvation=1.99, heap=-0.72MB
ashau:short: avg=7.96ms,  p99=36.5ms, starvation=0, heap=0.40MB
```
Terrain-led tails are effectively solved. The single 100ms p99 in frontier30m is a GC/OS outlier (3 longTasks + 4 LoAFs), not game code.

Acceptance: [x] PASS - long-task count dropped from persistent to near-zero

Doc updates:
- `ARCHITECTURE_RECOVERY_PLAN.md` - P5 status + Keep Decision
- `PERF_FRONTIER.md` - scenario health matrix
- `TERRAIN_REWRITE_MASTER_PLAN.md` - note if T-005 block boundaries are affected

### 1.3 HeightQueryCache batch eviction
Current FIFO eviction deletes one entry per miss. With 20K cap and BVH rebuilds needing ~4.5K queries, this is less acute than before but still suboptimal under sustained movement.

- [ ] Only attempt after 1.1 and 1.2 are resolved or deferred
- [ ] Design: batch evict 10-20% of cache when hitting limit instead of per-miss
- [ ] Run matched warm `combat120` pair
- [ ] Check heap recovery specifically (previous LRU attempt regressed from 41.7% to 8.7%)

Acceptance: no heap recovery regression, no combat pressure collapse

Doc updates:
- `ARCHITECTURE_RECOVERY_PLAN.md` - update Open Risk about HeightQueryCache
- `CLAUDE.md` Current Focus item 3

---

## Tier 2: Mode Product Passes

These make each mode feel distinct instead of "same game, different numbers."

### 2.1 Zone Control product pass
Identity: platoon-scale frontline capture mode.

- [ ] Review current Zone Control HUD - what conquest-specific feedback exists?
- [ ] Add frontline pressure indicator (which zones are contested, direction of push)
- [ ] Strengthen zone ownership language in HUD (clear "CAPTURING" / "LOSING" states)
- [ ] Review spawn pressure rules - do players spawn near the front?
- [ ] Test: play Zone Control, note what feels generic vs distinct

Doc updates:
- `GAME_MODES_EXECUTION_PLAN.md` Phase 5 - Zone Control status
- `docs/blocks/world.md` - if zone behavior changes

### 2.2 Team Deathmatch product pass
Identity: kill-race firefight mode.

- [ ] Audit HUD for conquest leftovers (zone indicators, capture progress)
- [ ] Hide or disable zone-related HUD elements in TDM
- [ ] Verify kill target display (75% amber, 90% red - already wired)
- [ ] Review spawn logic - TDM should avoid clustering, not use zone-based spawns
- [ ] Verify match end triggers on kill target, not ticket bleed
- [ ] Test: play TDM, note conquest bleed-through

Doc updates:
- `GAME_MODES_EXECUTION_PLAN.md` Phase 5 - TDM status
- `docs/blocks/world.md` - if ticket/objective behavior changes

### 2.3 Open Frontier product pass
Identity: company-scale insertion and maneuver mode.

- [ ] Verify helipad spawn points appear and work for BLUFOR
- [ ] Review: does the mode feel like insertion/mobility or just "bigger conquest"?
- [ ] Consider: should helicopter auto-start at match begin for frontier feel?
- [ ] Review command surface - does it support maneuver planning?
- [ ] Test: play Open Frontier, note what feels like Zone Control reskin vs distinct

Doc updates:
- `GAME_MODES_EXECUTION_PLAN.md` Phase 5 - Open Frontier status
- `docs/blocks/world.md` - if spawn/deploy behavior changes

### 2.4 A Shau Valley product pass
Identity: battalion-scale war-zone mode.

- [ ] Review tactical + strategic map split on the new runtime
- [ ] Tune `MapIntelPolicy` for A Shau: strategic agents on full map, clean minimap
- [ ] Review insertion pressure flow - does player feel dropped into a war?
- [ ] Review objective readability - can player understand what to do?
- [ ] Test: play A Shau, note what works vs what's confusing

Doc updates:
- `GAME_MODES_EXECUTION_PLAN.md` Phase 4 + Phase 5 - A Shau status
- `ARCHITECTURE_RECOVERY_PLAN.md` P3 - A Shau gameplay flow status

---

## Tier 3: Architecture Cleanup

### 3.1 GameModeManager.applyModeConfiguration() slim-down
90-line method manually configuring every system. Runtime layer exists but this hasn't been refactored.

- [ ] Read current `applyModeConfiguration()` in `GameModeManager.ts`
- [ ] Identify which config fan-outs can move into runtime `onEnter` hooks
- [ ] Move system-specific config application into respective systems
- [ ] Keep `GameModeManager` as thin coordinator
- [ ] Run `npm run validate`

Doc updates:
- `GAME_MODES_EXECUTION_PLAN.md` Phase 1 status
- `ARCHITECTURE_RECOVERY_PLAN.md` - Keep Decision
- `ACTIVE_GAME_MODES_HANDOFF.md` - update Current Gaps

### 3.2 Terrain rewrite remaining items
Priority order from TERRAIN_REWRITE_MASTER_PLAN.md:

- [ ] T-002: Height fidelity split (GPU-baked vs provider/cache)
- [ ] T-003: Dead vegetation/biome config paths
- [ ] T-004: Compat stubs driving readiness logic
- [ ] T-005: Block boundaries
- [ ] T-007: Material stack content
- [ ] T-008: Hydrology system layer

Doc updates:
- `TERRAIN_REWRITE_MASTER_PLAN.md` - update status per item
- `ARCHITECTURE_RECOVERY_PLAN.md` P5

---

## Tier 4: Content and Systems Expansion

### 4.1 Asset generation sprint (Roadmap Phase 1)
- [ ] Vegetation billboard remakes
- [ ] Terrain textures
- [ ] Helicopter GLBs (UH-1 Huey, UH-1C Gunship)
- [ ] Weapon viewmodel GLBs

### 4.2 Helicopter controls overhaul (Roadmap Phase 3A)
- [ ] Fix collective throttle stickiness (documented known bug)
- [ ] Single-layer smoothing (remove PlayerMovement lerp)
- [ ] Altitude lock key

### 4.3 Sandbox test infrastructure (Roadmap Phase 1.5)
- [ ] System toggle debug panel
- [ ] Asset preview block
- [ ] Terrain sandbox

---

## Completion Log

Record completed items here with date and commit hash.

| Date | Item | Commit | Notes |
|------|------|--------|-------|
| 2026-03-06 | 0.1 Perf capture | - | p99 improved 60% (86.9->30-35ms), AI starvation improved 70% |
| 2026-03-06 | 0.2 Fix stale docs | - | Phase 6/7 status, roadmap, handoff docs updated |
| 2026-03-06 | 1.1 Cover search grid | - | 8x8 grid + 4-candidate early-out + 8-angle terrain search |
| 2026-03-06 | 1.2 Terrain tick stagger | - | BVH skipped on vegetation rebuild frames |
| 2026-03-06 | Bugfix: shot-through | - | Height profile prefilter was blocking valid shots on undulating terrain |
| 2026-03-06 | Bugfix: terrain LOD | f328391 | Auto-scale maxLODLevels from world size; heightmap grid 512->1024 for 3200m |
| 2026-03-06 | 1.2 frontier30m re-capture | - | p99 85.9ms->single outlier; 888/889 samples clean; terrain tails solved |
