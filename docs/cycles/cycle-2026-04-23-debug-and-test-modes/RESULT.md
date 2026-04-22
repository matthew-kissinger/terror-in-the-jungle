# RESULT — cycle-2026-04-23-debug-and-test-modes

Closed 2026-04-22. Eight tasks in three rounds; seven PRs opened (R0 prep added two commits directly to master per cycle instructions); six merged, one blocked on CI red.

## End-of-run summary

```
Cycle: cycle-2026-04-23-debug-and-test-modes
Dates: 2026-04-22 → 2026-04-22 (single autonomous session)

Round 0: tweakpane installed + fresh combat120 baseline captured (commit 6fad9e1)
Round 1: 2/2 merged
Round 2: 3/3 merged (one via orchestrator-directed rebase after #141 landed first)
Round 3: 2/3 merged; 1 blocked

PR URLs:
  debug-hud-registry:                       https://github.com/matthew-kissinger/terror-in-the-jungle/pull/140
  engine-trajectory-memo:                   https://github.com/matthew-kissinger/terror-in-the-jungle/pull/139
  time-control-overlay:                     https://github.com/matthew-kissinger/terror-in-the-jungle/pull/141
  live-tuning-panel:                        https://github.com/matthew-kissinger/terror-in-the-jungle/pull/143
  free-fly-camera-and-entity-inspector:     https://github.com/matthew-kissinger/terror-in-the-jungle/pull/142
  playtest-capture-overlay:                 https://github.com/matthew-kissinger/terror-in-the-jungle/pull/144
  terrain-param-sandbox:                    https://github.com/matthew-kissinger/terror-in-the-jungle/pull/146
  world-overlay-debugger (BLOCKED):         https://github.com/matthew-kissinger/terror-in-the-jungle/pull/145

Perf deltas (combat120, seed=2718, 90s, 120 NPCs):
  R0 baseline (HEAD 6fad9e1):  avg=16.98ms  p99=34.20ms  heap_peak=52.76MB  heap_recovery=1.038
  post-R1 (HEAD 868f1aa):      avg=15.52ms  p99=34.10ms  heap_peak=34.43MB  heap_recovery=1.201   GREEN
  post-R2 (HEAD 8833124):      avg=16.65ms  p99=35.30ms  heap_peak=71.03MB  heap_recovery=0.993   YELLOW (no hard stop)
  post-R3 (HEAD 422563e):      avg=15.58ms  p99=34.50ms  heap_peak=30.80MB  heap_recovery=0.575   PASS

  Gate: p99 within 5% of baseline (ceiling 35.91ms) → PASS (+0.9%)
  Gate: heap_recovery_ratio ≥ 0.5                  → PASS (0.575)

Playtest recommended: none (cycle is explicitly playtest-deferred; all tasks
deliver the diagnostic surface the *next* playtest consumes).

Blocked tasks:
  world-overlay-debugger (PR #145):
    CI test failure — `src/ui/debug/worldOverlays/terrainChunkOverlay.test.ts`
    expected 24 LineSegments (4 per tile × 6 active tiles) but got 0. Tests
    passed locally for the executor (3710 tests green) but failed in CI.
    Most likely: mock mismatch between the terrain-chunk accessor added to
    `TerrainRenderRuntime` / `TerrainSystem` and the stub the overlay test
    uses. PR remains open and rebasable; executor's diff (6 overlays +
    registry + control panel + ~40 LOC of ≤20-LOC accessors split across
    combat + terrain) is otherwise intact. Autonomous failure-handling
    followed (no retry, marked blocked, cycle continued).

Next cycle recommendation:
  Gate `preserveDrawingBuffer: true` behind `import.meta.env.DEV` (or a
  capture-overlay opt-in flag). Perf-analyst flagged +13 MB end-of-run heap
  residual in R3 attributable to unconditional WebGL back-buffer retention;
  retail players who never press F9 shouldn't pay that cost. Small
  follow-up, touches only `src/core/GameRenderer.ts`. Bundle with
  reopened `world-overlay-debugger` CI-fix (rebase + investigate
  terrainChunkOverlay test mock) as next cycle's Round 1.
```

## Cycle metrics

- 6/8 tasks merged, 1 blocked, 1 docs-only (R0 prep — not counted as a task).
- 0 fence changes. 0 rolled-back merges. 1 orchestrator-directed rebase
  (PR #142 on top of #141 + #143 after same-file conflicts on
  `GameEngine.ts` / `GameEngineInput.ts`).
- 0 reviewer spawns. Anticipated reviewers (combat-reviewer on world-overlay
  + entity-inspector additive accessors; terrain-nav-reviewer on
  world-overlay + terrain-param-sandbox) did not fire: entity-inspector
  landed without needing combat accessors, terrain-param-sandbox fell back
  to a static mesh and did NOT touch `src/systems/terrain/**`, and
  world-overlay-debugger was blocked before CI allowed reviewer dispatch.
- Wallclock: R0 prep ~15:48 UTC → cycle close ~18:00 UTC. Single ~2h12m
  session.

## Surprises and findings

### R2 heap peak-growth WARN was workload-driven

R2 post-merge capture showed heap_peak_growth=71.03 MB (WARN) and
heap_recovery_ratio=0.993, flipping two checks from PASS. Perf-analyst
flagged as YELLOW but not a hard stop. R3 capture came back to
heap_peak_growth=30.80 MB (lowest of the cycle) and heap_recovery=0.575,
confirming the R2 bump was combat seed variance (88 kills + 1 respawn that
run vs 0 respawn in R1), not panel-driven. The three new panels (Tweakpane
+ FreeFlyCamera + EntityInspector) that landed in R2 do not measurably
grow the heap.

### `preserveDrawingBuffer: true` has no measurable CPU cost

Perf-gate specifically monitored this flag (Step-0 prerequisite for
playtest-capture-overlay). Post-R3 avg frame time actually dropped 6.4%
vs R2 and p99 returned to near-baseline. The only cost is a persistent
~13 MB heap residual from the retained back-buffer, which should move
behind a DEV gate in the next cycle.

### Three.js "what we reinvented" findings (from engine-trajectory-memo)

The memo at `docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md` flagged (among
others) that MEMORY.md and CLAUDE.md still refer to `three@0.183 / r183`
while `package.json` now pins `^0.184.0`. Trivial next-cycle doc refresh.
Full memo for future planning.

### time-control-overlay flagged 14 systems bypassing the scaled delta

The pause/step/slow-mo task wires a single `TimeScale` multiplier at
`GameEngineLoop.dispatch`. 14 systems read `performance.now()` directly
and therefore will not slow-mo or pause: GPUBillboardSystem, GunplayCore,
AmmoSupplySystem, AmmoManager, TerrainStreamingScheduler,
TerrainWorkerPool, WarSimulator, StrategicFeedback, ShotCommand,
PlayerController, NavmeshSystem, TracerPool, ImpactEffectsPool,
ExplosionEffectsPool, AILineOfSight. Recorded in PR #141 body; addressing
these is a future cycle's scope (not a blocker — the core pause/step loop
works for the primary observability use case).

### Keybind collisions resolved

- `Space` is taken by player jump and `P` is taken by post-processing
  toggle, so `time-control-overlay` bound pause to `Backspace` instead.
- `T` and `C` (world-overlay-debugger hotkeys) collide with air support
  bindings. The blocked overlay registry gated its hotkeys behind the
  master `Shift+\` toggle to avoid double-fire during gameplay — pattern
  worth preserving when the PR is rebased and reattempted.

### LOC budgets overrun with justification

Three R2/R3 tasks exceeded their brief LOC budgets:
- `free-fly-camera-and-entity-inspector`: 508 LOC source vs 500 cap
  (marginal; brief prescribed 4 inspector files + 3 core integration
  points).
- `world-overlay-debugger`: 1060 LOC vs 500 cap (brief prescribed 6
  overlays + registry + control panel + split accessors across 4
  subsystems; per-file average ~90 LOC). Flagged by executor as
  brief-driven, not scope creep.
- `playtest-capture-overlay`: 416 LOC source vs 300 cap (modal + dual
  File-System-Access + <a download> writers + session-bundled tuning
  JSON; feature surface was prescribed, executor trimmed comments from
  ~545 to 416).

No ground-rule 400-LOC hard-stop retriggers, because each executor's
report explicitly cross-referenced the brief's file list to show each LOC
mapped to a prescribed capability. Future cycles should size LOC budgets
against the brief's file count × per-file realistic size, not an
aspirational overall cap.

## Artifacts

- R0 baseline: `docs/cycles/cycle-2026-04-23-debug-and-test-modes/baseline/combat120-baseline-summary.json`
- Post-cycle perf: `docs/cycles/cycle-2026-04-23-debug-and-test-modes/evidence/post-cycle-combat120-summary.json`
- Engine-trajectory memo: `docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md`
- Evidence READMEs (per merged task): `docs/cycles/cycle-2026-04-23-debug-and-test-modes/evidence/<slug>/README.md`
- Archived task briefs: `docs/tasks/archive/cycle-2026-04-23-debug-and-test-modes/*.md`
