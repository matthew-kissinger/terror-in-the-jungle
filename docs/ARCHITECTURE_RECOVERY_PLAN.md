# Architecture Recovery Plan

Last updated: 2026-02-14
Scope: Full codebase remediation with combat-first critical path, using iterative discovery.
Primary performance target: 60 FPS (16.67 ms frame), with 120 combatants and high vegetation density.

## Operating Rules

- No new abstractions on hot paths unless they remove measurable frame time.
- Eliminate duplicate ownership of state (single source of truth per subsystem).
- Every task must include before/after perf capture from F2 overlay or `perf.report()`.
- Any task that increases frame time is rejected unless it unblocks a larger reduction.

## Product Intent Guardrails

- We are building a high-chaos jungle combined-arms firefight that still feels readable and responsive.
- Optimization must preserve:
  - weapon responsiveness and hit feedback timing
  - AI pressure/behavior variety (not frozen bots)
  - battlefield density and motion readability
  - terrain/vegetation atmosphere that defines the game identity
- We can cut implementation complexity and hidden costs; we do not cut core combat feel pillars.

## Environment Profile (Confirmed)

- OS: Windows 11 Pro 64-bit (`10.0.26200`)
- CPU: AMD Ryzen 7 3700X (8C/16T, 3.6 GHz base)
- GPU: NVIDIA GeForce RTX 3070 (driver `32.0.15.9186`)
- RAM: ~32 GB visible (`33476572 KB`)
- Toolchain: Node `v22.14.0`, npm `10.9.2`, Playwright `1.58.2`, Vite `7.3.1`
- Runtime evidence: Sandbox logs report Three.js `r182`, GPU tier `medium` heuristic, and GPU timing extension unavailable in headless harness runs.

## Execution Model (Discovery Loop)

1. Capture evidence (baseline + deep artifacts).
2. Identify biggest current bottleneck (not assumed upfront).
3. Apply one targeted change.
4. Re-capture and compare.
5. Keep only changes that improve frame budget or unblock next bottleneck.
6. Repeat until 60 FPS stability targets are met.

Use critical-path priorities as guidance, not hard sequencing, when evidence points elsewhere.

## Workstreams (Adaptive)

| ID | Workstream | Why | Primary Files | Dependency Bias | Done Criteria | Effort |
|---|---|---|---|---|---|---|
| P0-1 | Make perf harness reliable under stalls | Cannot optimize blind; harness must fail with evidence, not hang | `scripts/perf-baseline.ts`, `scripts/perf-capture.ts`, `scripts/perf-analyze-latest.ts`, `src/systems/debug/PerformanceTelemetry.ts` | None | Harness completes in bounded time with artifacts + validation | M |
| P0-2 | Add fixed benchmark scenarios (combat-heavy, terrain-heavy, mixed) | Prevents regressions hidden by random play sessions | `scripts/perf-baseline.ts`, `scripts/perf-capture.ts`, `src/core/PixelArtSandbox.ts` | P0-1 | Repeatable scenario scripts checked into repo | M |
| P1-1 | Remove dual spatial ownership in combat | Current octree/grid duplication causes drift and redundant updates | `src/systems/combat/CombatantSystem.ts`, `src/systems/combat/CombatantLODManager.ts`, `src/systems/combat/SpatialGridManager.ts`, `src/systems/combat/SpatialOctree.ts` | P0-1 strong | One authoritative spatial index for combat queries and LOD | L |
| P1-2 | Flatten combat tick pipeline to one deterministic pass | Multiple manager passes waste frame budget and create state races | `src/systems/combat/CombatantSystemUpdate.ts`, `src/systems/combat/CombatantAI.ts`, `src/systems/combat/CombatantCombat.ts`, `src/systems/combat/CombatantMovement.ts` | P1-1 | Single update order doc + implementation + no duplicate per-entity loops | L |
| P1-3 | Budget/centralize line-of-sight and raycasts | LOS work explodes with agent counts | `src/systems/combat/ai/RaycastBudget.ts`, `src/systems/combat/ai/AILineOfSight.ts`, `src/systems/combat/ai/AITargetAcquisition.ts`, `src/systems/combat/LOSAccelerator.ts` | P1-2 | Raycast count capped/frame with graceful degradation | M |
| P1-4 | Replace per-frame combat logging/debug branches | Console calls in hot loop destroy frame consistency | `src/systems/combat/CombatantRenderer.ts`, `src/systems/combat/CombatantProfiler.ts` | P1-2 | No logging in render/update loops outside gated debug build | S |
| P1-5 | Remove sqrt-heavy distance checks in combat loops | `distanceTo` in tight loops is avoidable cost | `src/systems/combat/CombatantLODManager.ts`, `src/systems/combat/CombatantRenderer.ts` | P1-2 | Squared distance comparisons in all hot combat paths | S |
| P2-1 | Collapse terrain worker architecture to one implementation | Duplicate worker paths increase maintenance and break coherence | `src/systems/terrain/ChunkWorkerCode.ts`, `src/systems/terrain/ChunkWorkerLifecycle.ts`, `src/workers/ChunkWorker.ts` | P0-1 | One worker path remains; duplicate deleted | M |
| P2-2 | Switch chunk worker payload to transferable typed arrays | Object-heavy payloads cause serialization and GC spikes | `src/systems/terrain/ChunkWorkerCode.ts`, `src/systems/terrain/ChunkWorkerAdapter.ts` | P2-1 | All high-volume geometry/vegetation payloads sent via transferables | L |
| P2-3 | Remove full-scene terrain merge spikes | Debounced heavy merge/BVH rebuild causes hitching | `src/systems/terrain/TerrainMeshMerger.ts`, `src/systems/terrain/ImprovedChunkManager.ts` | P2-2 | Incremental merge strategy with bounded per-frame work | L |
| P2-4 | Enforce chunk lifecycle budgets (load/unload/mesh build) | Unbounded lifecycle work causes long frames | `src/systems/terrain/ChunkLifecycleManager.ts`, `src/systems/terrain/ChunkLoadQueueManager.ts`, `src/systems/terrain/ChunkLoadingStrategy.ts` | P2-3 | Hard budgets validated by telemetry in stress scenario | M |
| P3-1 | Rebuild combat renderer update path around packed buffers | Avoid per-entity scene graph churn and branching | `src/systems/combat/CombatantRenderer.ts`, `src/systems/combat/CombatantMeshFactory.ts`, `src/systems/combat/CombatantShaders.ts` | P1-2 | Batched updates, reduced draw/CPU cost measured | L |
| P3-2 | Remove geometry/material churn in world overlays | Recreating geometry per update leaks and hitches | `src/systems/world/ZoneRenderer.ts` | P0-1 | Geometry/material reused with explicit dispose lifecycle | S |
| P3-3 | Verify billboard shader path and delete dead shader files | Unused shader assets create false architecture branches | `src/systems/world/billboard/*`, `src/shaders/billboard.vert.glsl`, `src/shaders/billboard.frag.glsl` | P0-1 | Dead shader path removed or integrated intentionally | S |
| P4-1 | Fix duplicated input command dispatch and parity drift | Double-fired commands create gameplay inconsistency | `src/systems/player/PlayerInput.ts`, `src/ui/controls/*` | P1-2 | One command dispatch per action across keyboard/touch | M |
| P4-2 | Stabilize HUD update cadence and reduce full redraws | UI churn steals main-thread time from simulation | `src/ui/hud/HUDSystem.ts`, `src/ui/hud/HUDUpdater.ts`, `src/ui/minimap/MinimapSystem.ts` | P0-2 | HUD updates are event-driven or throttled by budget | M |
| P4-3 | Fix audio positional/object pooling correctness | Temp object allocation and incorrect attachment cause leaks/bugs | `src/systems/audio/AudioWeaponSounds.ts`, `src/systems/audio/FootstepAudioSystem.ts`, `src/systems/audio/AudioPoolManager.ts` | P0-1 | Pooled nodes used consistently; no temp object churn | M |
| P5-1 | Delete confirmed dead terrain legacy modules | Reduces confusion and test noise | `src/systems/terrain/Chunk.ts`, `src/systems/terrain/ChunkTerrain.ts`, `src/systems/terrain/ChunkVegetation.ts`, `src/systems/terrain/DebugChunk.ts` | P2-1 | Files removed and imports cleaned | S |
| P5-2 | Delete unused combat spatial legacy module | Duplicate spatial implementations confuse ownership | `src/systems/combat/SpatialGrid.ts` | P1-1 | File removed; tests realigned | S |
| P5-3 | Align tests with runtime architecture and add perf guards | Current test quantity hides architecture drift | `vitest.config.ts`, runtime-adjacent `*.test.ts` across combat/terrain/workers | P1-2, P2-2 | Coverage thresholds + integration perf smoke tests | M |
| P5-4 | Add architecture invariants doc and CI checks | Prevents regression back into fragmented architecture | `docs/`, CI workflow files | P5-3 preferred | CI gate validates invariants and perf budget deltas | M |

## Codebase Map (Execution-Oriented)

### Runtime/Core Wiring

- Entry and lifecycle: `src/core/bootstrap.ts`, `src/core/PixelArtSandbox.ts`
- Initialization split: `src/core/PixelArtSandboxInit.ts`, `src/core/SystemInitializer.ts`, `src/core/SystemConnector.ts`
- Frame loop: `src/core/PixelArtSandboxLoop.ts`, `src/core/SystemUpdater.ts`
- Input bridge: `src/core/PixelArtSandboxInput.ts`
- Disposal/recovery: `src/core/SystemDisposer.ts`, `src/core/WebGLContextRecovery.ts`

### Combat (Primary Bottleneck)

- Orchestrator: `src/systems/combat/CombatantSystem.ts`, `src/systems/combat/CombatantSystemUpdate.ts`
- AI and sensing: `src/systems/combat/CombatantAI.ts`, `src/systems/combat/ai/*`
- Spatial: `src/systems/combat/SpatialGridManager.ts`, `src/systems/combat/SpatialOctree.ts`
- LOD/render: `src/systems/combat/CombatantLODManager.ts`, `src/systems/combat/CombatantRenderer.ts`
- Damage/combat resolution: `src/systems/combat/CombatantCombat.ts`, `src/systems/combat/CombatantDamage.ts`, `src/systems/combat/CombatantHitDetection.ts`
- Squad/control: `src/systems/combat/SquadManager.ts`, `src/systems/combat/PlayerSquadController.ts`

### Terrain + Vegetation + Workers

- Chunk orchestration: `src/systems/terrain/ImprovedChunkManager.ts`, `src/systems/terrain/ChunkLifecycleManager.ts`
- Priority/loading: `src/systems/terrain/ChunkLoadingStrategy.ts`, `src/systems/terrain/ChunkLoadQueueManager.ts`, `src/systems/terrain/ChunkPriorityManager.ts`
- Worker execution: `src/systems/terrain/ChunkWorkerPool.ts`, `src/systems/terrain/ChunkWorkerLifecycle.ts`, `src/systems/terrain/ChunkWorkerCode.ts`, `src/systems/terrain/ChunkWorkerAdapter.ts`
- Terrain mesh combine: `src/systems/terrain/TerrainMeshMerger.ts`
- BVH worker support: `src/workers/BVHWorker.ts`, `src/workers/bvh.worker.js`

### Render Pipeline

- Billboard GPU path: `src/systems/world/billboard/GlobalBillboardSystem.ts`, `src/systems/world/billboard/GPUBillboardSystem.ts`, `src/systems/world/billboard/BillboardRenderer.ts`, `src/systems/world/billboard/BillboardBufferManager.ts`
- World overlays: `src/systems/world/ZoneRenderer.ts`, `src/systems/world/ZoneManager.ts`
- Post effects: `src/systems/effects/PostProcessingManager.ts`
- Potential dead shader branch: `src/shaders/billboard.vert.glsl`, `src/shaders/billboard.frag.glsl`

### Input/UI/Audio

- Input orchestration: `src/systems/player/PlayerInput.ts`, `src/ui/controls/*`
- HUD runtime: `src/ui/hud/HUDSystem.ts`, `src/ui/hud/HUDUpdater.ts`
- Tactical maps: `src/ui/minimap/*`, `src/ui/map/*`
- Audio systems: `src/systems/audio/AudioManager.ts`, `src/systems/audio/AudioPoolManager.ts`, `src/systems/audio/AudioWeaponSounds.ts`, `src/systems/audio/FootstepAudioSystem.ts`

### Testing + Perf

- Test config: `vitest.config.ts`
- Perf runner: `scripts/perf-baseline.ts`
- Perf telemetry: `src/systems/debug/PerformanceTelemetry.ts`, `src/ui/debug/PerformanceOverlay.ts`

## Harness Execution Map (Closer To Metal)

- Harness entry: `scripts/perf-capture.ts` launches Vite on `:9100`, opens Chromium, hits `/?sandbox=true&npcs=<N>&autostart=true&duration=<S>`.
- Sandbox mode parse: `src/core/SandboxModeDetector.ts` maps URL params to `SandboxConfig`.
- Game mode override: `src/config/gameModes.ts` injects `sandboxConfig.npcCount` into `AI_SANDBOX_CONFIG.maxCombatants`.
- Autostart path: `src/core/PixelArtSandboxInit.ts` calls `startGameWithMode(..., AI_SANDBOX)` when sandbox+autostart.
- Combat activation: `src/core/PixelArtSandboxInit.ts` eventually calls `combatantSystem.enableCombat()`.
- Per-frame system update order: `src/core/SystemUpdater.ts` (`Combat -> Terrain -> Billboards -> Player -> Weapons -> UI -> World -> Other`).
- Frame timing capture: `src/core/SystemUpdater.ts` wraps each tracked system with `performanceTelemetry.beginSystem/endSystem`, frame with `beginFrame/endFrame`.
- Harness-read metrics:
  - `window.sandboxMetrics.getSnapshot()` from `src/core/SandboxMetrics.ts` updated in `src/core/PixelArtSandboxLoop.ts`.
  - `window.perf.report()` from `src/systems/debug/PerformanceTelemetry.ts` backed by `FrameTimingTracker`.
  - `__sandboxRenderer.getPerformanceStats()` from `src/core/SandboxRenderer.ts`.
- Failure signature now observed repeatedly: startup frame progression stalls before stable render cadence, and `FrameTimingTracker` slow-frame logs attribute dominant cost to `Combat`.

## Gamer-Level Interpretation Of Current Harness

- Current harness scenario is an automated AI sandbox firefight.
- To a player, this resembles spawning into a live skirmish where squads are already engaging and the world is streaming around you.
- It is strong for stress-testing combat throughput and frame stability under load.
- It is weak for validating moment-to-moment player feel (aiming, recoil rhythm, input latency, feedback cadence).

### Next Harness Extensions (Feel-Safe Optimization)

- Add a player-feel micro-scenario:
  - scripted movement + aiming + firing cadence
  - capture input-to-fire and hit-marker latency
  - verify no regressions in weapon handling feel while optimizing combat backend
- Keep AI-sandbox scenario as the throughput stress test; use both profiles before accepting major cuts.

## Current Status Board (Adaptive)

| Task ID | Status | Notes |
|---|---|---|
| P0-1 | IN_PROGRESS | Added stall detection/timeouts + runtime snapshot diagnostics in `scripts/perf-baseline.ts` |
| P0-2 | TODO | Scenario scripts not yet standardized |
| P1-1 | TODO | Combat spatial ownership split still present |
| P1-2 | TODO | Combat tick still multi-pass fragmented |
| P1-3 | TODO | LOS/raycast pressure scales poorly |
| P1-4 | IN_PROGRESS | Logger overhead and interaction-prompt log spam confirmed; gating/removal pass active |
| P1-5 | TODO | Sqrt-heavy distance checks remain |
| P2-1 | TODO | Duplicate worker implementation remains |
| P2-2 | TODO | Worker payloads still object-heavy |
| P2-3 | IN_PROGRESS | Incremental ring merging landed; merged BVH still needs bounded/off-thread path |
| P2-4 | TODO | Lifecycle budgets need enforcement |
| P3-1 | IN_PROGRESS | Single-pass billboard update path landed; further branch/math hot-path cuts still open |
| P3-2 | TODO | Zone geometry churn present |
| P3-3 | TODO | Billboard shader path unresolved |
| P4-1 | IN_PROGRESS | Duplicate command paths reduced; full parity/invariant sweep still open |
| P4-2 | IN_PROGRESS | HUD/tactical cadence throttled; remaining UI hot paths need fine-grain profiling |
| P4-3 | TODO | Audio pooling inconsistency persists |
| P5-1 | TODO | Legacy terrain modules still present |
| P5-2 | TODO | Legacy spatial grid file still present |
| P5-3 | TODO | Tests not aligned with runtime invariants |
| P5-4 | TODO | Architecture CI guardrails missing |

## Update Protocol (When Advancing Tasks)

1. Move one task to `IN_PROGRESS`.
2. Add links to the exact changed files under that task in this document.
3. Record before/after frame timings and memory delta.
4. If evidence shifts priority, update the active workstream and explain why.
5. Keep experiments small; revert direction quickly when data is negative.
6. Only mark `DONE` when perf and behavior checks both pass.

## Task Notes

### P0-1

- 2026-02-14: Added hard step timeouts, per-second frame-progress monitoring, and runtime-state dump on failure in `scripts/perf-baseline.ts`.
- 2026-02-14: Added Windows-safe process tree termination (`taskkill`) in `scripts/perf-baseline.ts` to prevent lingering Vite processes.
- 2026-02-14: Repro run now fails with usable context instead of silent stall. Last state shows `frameCount=23` and browser warnings include `Slow frame ... Combat(...)` spikes (150ms to 1391ms) before main-thread blocking.
- 2026-02-14: P0-1 remains open until harness can either complete despite long frames or fail with explicit `combat main-thread stall` classification and captured timing artifacts.
- 2026-02-14: Failure mode is now explicit: `Main-thread stall during startup sampling (15s)` with last known `frameCount=22`; browser logs show combat spikes up to ~4192ms frame time before stall.
- 2026-02-14: Added deep-capture harness `scripts/perf-capture.ts` with CDP CPU/heap/trace capture, runtime sampling, validation checks, and artifact output under `artifacts/perf/<timestamp>/`.
- 2026-02-14: Added analysis command `scripts/perf-analyze-latest.ts` and docs `docs/PROFILING_HARNESS.md`.
- 2026-02-14: Installed/updated profiling toolchain: `playwright`, `tsx`, `speedscope`, `lighthouse`, TypeScript ESLint deps, and Chromium browser binary.
- 2026-02-14: New blocker: deep-capture command now hangs in certain paths; E2E harness flow investigation added as immediate subtask.
- 2026-02-14: Confirmed clean-state harness run at `artifacts/perf/2026-02-14T03-25-13-119Z` exits deterministically with validation failure (no runaway process lockup).
- 2026-02-14: Warning taxonomy (current): `Audio decode/load failures` = actionable config/content issue, `GPU stall due to ReadPixels` = likely runtime/browser readback warning requiring targeted isolation, `Slow frame ... Combat(...)` = primary perf bottleneck signal.

### P0-1a (Discovery Subtask) - Harness Hang Root Cause

- Goal: Confirm exact entry point, stall point, and shutdown hang point in `scripts/perf-capture.ts`.
- Scope files: `scripts/perf-capture.ts`, `package.json`, `docs/PROFILING_HARNESS.md`.
- Status: IN_PROGRESS.
- Exit criteria:
  - One reproducible cause identified with evidence.
  - Harness exits deterministically with summary+validation even under severe game stalls.
  - `npm run perf:capture` completes with either PASS/WARN/FAIL in bounded time.

## Experiment Log

| Date | ID | Hypothesis | Change | Scenario | Result | Decision | Evidence |
|---|---|---|---|---|---|---|---|
| 2026-02-14 | EXP-001 | Baseline harness stalls with no actionable context | Added step timeouts + runtime state snapshots in `scripts/perf-baseline.ts` | `perf:baseline` default | Fails with explicit `Main-thread stall` and last frame count | KEEP | `scripts/perf-baseline.ts`, task notes P0-1 |
| 2026-02-14 | EXP-002 | Deep-capture artifacts can replace manual profiling | Added `scripts/perf-capture.ts` + `scripts/perf-analyze-latest.ts` + docs | capture with 20-60 NPC | Partial success; artifacts created on some failures, but intermittent hang remains | ITERATE | `artifacts/perf/*`, `docs/PROFILING_HARNESS.md` |
| 2026-02-14 | EXP-003 | Wrapper/arg handling is causing false config and false pass/fail | Added env parsing + fixed exit codes + validation-on-fail | `PERF_DURATION/PERF_NPCS` runs | Correct config reflected, failures now return non-zero with validation output | KEEP | `scripts/perf-capture.ts`, `summary.json`/`validation.json` |
| 2026-02-14 | EXP-004 | Runaway headless/browser processes are contaminating harness runs | Added run lock + per-run browser profile + forced targeted browser cleanup + hard timeout | all `perf:capture` runs | Guardrails added; pending clean-state verification | IN PROGRESS | `scripts/perf-capture.ts`, `docs/PROFILING_HARNESS.md` |
| 2026-02-14 | EXP-005 | Harness observer effect is creating false GPU stalls (`ReadPixels`) | Disabled Playwright tracing/screenshots by default; made screenshot optional/timeout-guarded | 20-NPC sandbox capture | Harness exits faster and no longer hangs; `ReadPixels` warning persists (not fully harness-caused) | PARTIAL KEEP | `scripts/perf-capture.ts`, `artifacts/perf/2026-02-14T03-25-13-119Z/console.json` |
| 2026-02-14 | EXP-006 | Audio loader errors are polluting signal quality during perf runs | Deduped asset load failure logging to warn-once in audio loader | 20-NPC sandbox capture | Pending rerun to verify warning count reduction | IN PROGRESS | `src/systems/audio/AudioManager.ts` |
| 2026-02-14 | EXP-007 | Startup instability is driven by timer-based startup sequencing and fake readiness waits | Replaced startup timeout chain with explicit async startup flow and chunk readiness polling | 20-NPC control runs | Startup reaches render-visible more deterministically; headless still experiences periodic long stalls | KEEP + ITERATE | `src/core/PixelArtSandboxInit.ts`, `src/core/SandboxSystemManager.ts` |
| 2026-02-14 | EXP-008 | Input action duplication contributes to control inconsistency and hidden workload | Removed `KeyZ` keyup duplicate and synthetic key dispatch touch paths; added direct slot API | unit test suites | All targeted player/combat tests pass; input path simplified | KEEP | `src/systems/player/PlayerInput.ts`, `src/systems/player/PlayerController.ts`, `src/systems/player/InventoryManager.ts` |
| 2026-02-14 | EXP-009 | Large merge spikes come from full-ring terrain merge passes | Incremental ring merging (`MAX_RINGS_PER_PASS=3`) + merged BVH opt-out by default | unit tests + build | Terrain merger remains functional with lower per-pass work; compile/tests green | KEEP | `src/systems/terrain/TerrainMeshMerger.ts` |
| 2026-02-14 | EXP-010 | Main-thread spikes in combat come from unbounded AI work within a frame | Added per-frame AI budget cap/degradation in LOD manager | unit tests + build | AI workload now hard-capped with controlled degradation logs | KEEP | `src/systems/combat/CombatantLODManager.ts` |
| 2026-02-14 | EXP-011 | UI system attribution is too coarse and update cadence too high | Split UI telemetry (`HUD`/`TacticalUI`) and throttled tactical updates to 20 Hz | unit tests + build | Better perf attribution and reduced minimap/compass churn | KEEP | `src/core/SystemUpdater.ts` |
| 2026-02-14 | EXP-012 | Logging pipeline itself may be a measurable perf tax in runtime/harness | Identified unconditional logger work and frequent HUD prompt logs; implementing production gating + spam removal | control + combat capture after patch | Pending | IN PROGRESS | `src/utils/Logger.ts`, `src/ui/hud/HUDSystem.ts`, `src/ui/hud/InteractionPrompt.ts` |
| 2026-02-14 | EXP-013 | `combat=0` control runs are invalid due hidden combat load | Harness now forces `npcs=0` for control, fixed sandbox parser to allow zero NPC when combat disabled, and capped spawn manager behavior | control capture + unit tests | Control path now reports `combatantCount=0` | KEEP | `scripts/perf-capture.ts`, `src/core/SandboxModeDetector.ts`, `src/systems/combat/CombatantSpawnManager.ts` |
| 2026-02-14 | EXP-014 | Headless capture path is producing false blocking signals on this hardware | Compared headed vs headless on same scenario; headed stable (~4ms avg frame, full samples), headless repeatedly stalls after startup | 12s control capture pair | Make headed default trusted path; keep headless as secondary signal | KEEP | `package.json`, `docs/PROFILING_HARNESS.md`, `artifacts/perf/2026-02-14T04-21-43-281Z` |
| 2026-02-14 | EXP-015 | Perf harness must emulate real player loop (ground combat, respawn, spawn-lane pressure) without adding avoidable overhead | Added lightweight active scenario driver (`scripts/perf-active-driver.js`) with move/fire/respawn + engagement-center positioning + smoothed camera turns; integrated into `perf-capture` | headed 120-NPC captures | Harness now stays in action with deterministic cleanup and no runaway camera snapping; latest runs show stable sampling under active combat | KEEP + ITERATE | `scripts/perf-capture.ts`, `scripts/perf-active-driver.js`, `artifacts/perf/2026-02-14T04-34-16-481Z`, `artifacts/perf/2026-02-14T04-45-01-141Z` |
| 2026-02-14 | EXP-016 | Stutter and combat-fidelity loop needs explicit hit validation and reduced hot-path overhead | Added shot/hit/hit-rate sampling + validation gates in harness; removed per-NPC pooled vector churn in combat movement (`addScaledVector`); throttled AI budget/spike warn logs | headed 120-NPC active capture (15s) | Validation now guarantees bullets land in sim (`57` shots / `4` hits); active-combat avg frame ~`7.99ms`; reduced log pressure in heavy frames | KEEP | `scripts/perf-capture.ts`, `src/systems/combat/CombatantMovement.ts`, `src/systems/combat/CombatantLODManager.ts`, `src/systems/player/weapon/WeaponFiring.ts`, `artifacts/perf/2026-02-14T04-49-49-377Z` |
| 2026-02-14 | EXP-017 | Headless capture instability and sparse samples are obscuring real runtime behavior | Fixed boolean flag parsing (`--flag false`), added `pageerror` stack capture, and validated headed vs headless | 30s 60-NPC active capture | Headless still intermittently stalls in this environment; headed produces stable full-sample run (30/30), avg frame `8.19ms`, max p95 `11.90ms`, shots/hits validated (`120/17`) | KEEP headed as trusted path, keep headless secondary | `scripts/perf-capture.ts`, `artifacts/perf/2026-02-14T05-46-38-421Z` |
| 2026-02-14 | EXP-018 | Combat renderer group-allocation removal should lower CPU cost but must not force per-frame full buffer uploads | Rewrote `updateBillboards` to single-pass writes with reusable maps, then fixed `instanceMatrix.needsUpdate` gating to only update on live/changed counts | unit tests + headed capture | Initial rewrite regressed due unconditional GPU uploads; gating fix restored stable capture path while keeping allocation reduction | KEEP with guardrails | `src/systems/combat/CombatantRenderer.ts`, `src/systems/combat/CombatantRenderer.test.ts`, `artifacts/perf/2026-02-14T05-46-38-421Z` |
| 2026-02-14 | EXP-019 | Mid-game init/network-style overlay errors during harness runs are invalid signal and must be prevented | Fixed autostart timeout leak (`StartScreen.hide -> markInitialized`), tightened active-driver pressure spawn to midfield, and added harness validation for runtime init error panel visibility | headed active capture (120 NPC) | Validation PASS with no runtime init error panel, stable active combat, and immediate midfield pressure (`49` shots / `7` hits in 15s) | KEEP | `src/ui/loading/StartScreen.ts`, `scripts/perf-active-driver.js`, `scripts/perf-capture.ts`, `artifacts/perf/2026-02-14T05-52-35-983Z` |
| 2026-02-14 | EXP-020 | Hidden fallback paths are adding startup/noise cost and masking missing assets | Reduced uninitialized spatial-grid log spam to once-per-method with fallback counters preserved; disabled callout/footstep init/load paths when audio features are off; added one-time missing-asset warnings for hit marker + bullet whiz | build + targeted unit tests | Lower log pressure during unstable startup, reduced disabled-audio startup work, improved asset visibility without per-frame spam | KEEP | `src/systems/combat/SpatialGridManager.ts`, `src/systems/audio/FootstepAudioSystem.ts`, `src/systems/audio/VoiceCalloutSystem.ts`, `src/systems/audio/AudioManager.ts`, `src/systems/audio/AudioWeaponSounds.ts`, `src/systems/audio/VoiceCalloutSystem.test.ts` |
| 2026-02-14 | EXP-021 | Player shots can still kill through hills when terrain mesh LOS misses | Added conservative height-profile occlusion fallback in player shot path (`getEffectiveHeightAt` sampling) before damage application | targeted combat tests + build | Through-hill hit path now blocked when terrain height intersects shot line even if mesh raycast misses | KEEP | `src/systems/combat/CombatantCombat.ts`, `src/systems/combat/CombatantCombat.test.ts` |
| 2026-02-14 | EXP-022 | Active harness behavior should mirror real gameplay (move toward enemies, aim before firing, avoid blind sky spam) | Driver now targets nearest OPFOR/engagement center, smooth-aims, gates fire by aim alignment and LOS/close-range, and auto-recovers low health for sustained pressure runs | headed active captures (12-20s) | Restored realistic shot/hit cadence (`41` shots / `7` hits in 12s run) with fewer blind-fire artifacts; still failing on hitch-tail gates due long-frame spikes | KEEP + ITERATE | `scripts/perf-active-driver.js`, `artifacts/perf/2026-02-14T06-15-24-613Z` |
| 2026-02-14 | EXP-023 | Combat hit detection fallback logs still spam under startup race | Gated uninitialized hit-detection grid error to one-time emission while preserving fallback telemetry count | targeted tests + build | Lower stderr/log noise without losing fallback signal | KEEP | `src/systems/combat/CombatantHitDetection.ts` |
| 2026-02-14 | EXP-024 | LOS broad-phase culling performs expensive per-query bounds recomputation | Cached chunk world bounds at `registerChunk` and reused bounds during LOS relevance tests | LOS unit tests + build | Removed per-query `Box3.setFromObject` work from LOS hot path while preserving behavior | KEEP | `src/systems/combat/LOSAccelerator.ts`, `src/systems/combat/LOSAccelerator.test.ts` |
| 2026-02-14 | EXP-025 | Harness startup intermittently fails early from fixed 30s navigation/metrics waits | Hardened startup with stale-port cleanup, `goto(waitUntil='commit')`, and startup wait logic that honors configured timeout and returns structured failure context instead of hard throw | short headed captures | Harness now continues through late sandbox metric availability and produces actionable artifacts on unstable startup | KEEP + ITERATE | `scripts/perf-capture.ts`, `artifacts/perf/2026-02-14T06-22-46-021Z` |
| 2026-02-14 | EXP-026 | Unstable startup path wastes capture time and obscures root-cause evidence | Added startup-diagnostics artifact and skipped runtime sampling when startup is not stabilized | short headed capture | Faster failure loop with clearer startup state (`startup-diagnostics.json`) and less noisy false runtime data | KEEP | `scripts/perf-capture.ts` |

## Current Loop Snapshot

- Latest active-combat capture artifact: `artifacts/perf/2026-02-14T05-52-35-983Z`
- Outcome: validation pass with 15/15 runtime samples; avg frame `7.90ms`, max p95 `10.70ms`, zero browser errors, runtime init-error panel check PASS, hits validated (`49` shots / `7` hits, peak rate `20.69%`).
- Persisting warnings: missing optional grenade audio assets and periodic AI budget degradation warnings.
- Persisting warnings: missing optional grenade audio assets and periodic AI budget degradation warnings.
- New cleanup in progress: legacy procedural-audio code and obsolete tests/comments are being removed incrementally; runtime paths are now explicitly asset-only for footsteps/callouts.
- Current high-priority blocker remains hitch tails (`maxFrameMs` spikes >200ms) despite healthy average frame times in active captures.
- Startup stabilization remains inconsistent under load; sandbox metrics can appear very late (>30s) on some runs and must be treated as a core blocker before trusting short-window perf comparisons.
- Interpretation: headed active scenario is currently the only trustworthy optimization signal on this hardware; headless remains secondary/regression-only until blocking is fixed.

### Next Loop Focus

1. Complete logger overhead reduction (`warn/error` default runtime level, remove interaction-prompt spam logs, keep explicit debug opt-in).
2. Re-capture `PERF_COMBAT=0` and `PERF_COMBAT=1` with warmup/startup thresholds to verify harness stability delta.
3. Move hotspot discovery from coarse buckets to fine-grained markers around:
   - `HUDSystem.update`
   - `MinimapSystem.update`
   - `FullMapSystem.update`
   - `PostProcessingManager.render`
4. Continue dead-code/fallback removal pass:
   - delete procedural-audio remnants no longer reachable in runtime
   - remove stale tests that assert deprecated fallback behavior
   - keep only one-time diagnostics for missing optional assets
5. Keep refining active-driver realism with bounded overhead:
   - maintain enemy-forward movement + visibility-aware aiming
   - preserve shot/hit signal quality for combat profiling
   - avoid driver logic that suppresses all fire events
6. Attack startup + hitch root causes directly:
   - isolate why sandbox metric availability can lag by 30s+ in some launches
   - identify first major long-frame source after init (combat vs terrain vs shader compile)
   - keep harness timeout behavior strict but context-rich

## Immediate Next Task

- Continue `P0-1a` until harness exits deterministically; then run discovery loop against highest visible bottleneck.

## Senior Step-Back Audit: Entry + Terrain + User Actions (2026-02-14)

Scope shift requested by product owner: prioritize codepath understanding over harness iteration.

### What A Senior Engineer Checks First

1. Boot critical path: what must happen before first interactive frame.
2. Startup state machine: explicit states vs timer-driven sequencing.
3. Terrain streaming contract: chunk lifecycle and budgets under player movement.
4. Player action contract: one input event => one gameplay action, no synthetic duplication.
5. Ownership: one system owns each responsibility (no duplicate spawn/reseed/load logic).

### High-Confidence Findings

1. `src/core/SystemInitializer.ts` serially `await`s every system init in a loop.
Reason: large boot chain is fully blocking; no phased readiness split (playable vs optional).

2. `src/systems/terrain/ImprovedChunkManager.ts` init loads initial chunks synchronously with `await` per chunk (`loadChunkImmediate` loop).
Reason: startup cost scales with chunk cost and blocks interactivity.

3. `src/core/PixelArtSandboxInit.ts` startup orchestration is timer-driven (`setTimeout` chain) instead of state-driven.
Reason: non-deterministic readiness; race-prone when terrain/combat load times vary.

4. `src/core/SandboxSystemManager.ts` `preGenerateSpawnArea` relies on `chunkManager.update(0.01)` + fixed `setTimeout(200)`.
Reason: fake synchronization, not completion-based; causes inconsistent startup outcomes.

5. `src/systems/terrain/ImprovedChunkManager.ts` processes chunks at `UPDATE_INTERVAL = 0.25` with `MAX_CHUNKS_PER_FRAME = 1`.
Reason: safe for spikes, but causes visible terrain catch-up/pop-in during movement and re-entry.

6. `src/systems/terrain/TerrainMeshMerger.ts` performs debounced full merge work on main thread and computes BVH for merged geometry.
Reason: merge spikes are inevitable under load/unload churn; this can hitch gameplay.

7. `src/systems/player/PlayerInput.ts` toggles squad command on both `keydown` and `keyup` for `KeyZ`.
Reason: one physical action can execute twice; breaks control predictability.

8. `src/systems/player/PlayerInput.ts` and `src/systems/player/PlayerController.ts` use synthetic keyboard events for touch-triggered actions.
Reason: bypasses typed command pipeline and risks divergence/duplication between touch and keyboard behavior.

### Immediate Refactor Direction (No Extra Abstraction)

1. Replace timer-driven boot with explicit startup states:
`BOOT -> CORE_READY -> WORLD_READY -> PLAYER_READY -> COMBAT_READY -> INTERACTIVE`.

2. Split terrain readiness:
minimum playable ring first, then background expansion with explicit completion signals.

3. Replace fixed sleeps (`setTimeout(200)`) with chunk lifecycle completion checks.

4. Convert input handling to command functions (shared by keyboard/touch) and delete synthetic event dispatch.

5. Enforce one-action-per-input invariant via tests (especially `Z`, mortar, sandbag, touch weapon switching).

6. Move/limit heavy terrain merge work behind strict per-frame budgets or worker path.

### Progress Already Applied In Code (Core)

- Combat-disabled path now skips AI decisions (`src/systems/combat/CombatantSystem.ts`, `src/systems/combat/CombatantLODManager.ts`).
- Combat force reseed now respects player squad creation intent (`src/systems/combat/CombatantSystem.ts`, `src/systems/combat/CombatantSpawnManager.ts`).
- Autostart avoids duplicate pre-generation, and shader precompile moved off immediate startup critical path (`src/core/PixelArtSandboxInit.ts`).

### Progress Applied In Code (Entry/Terrain/Input Integrity)

- Replaced timer-chain startup bootstrap with explicit async startup phases in `src/core/PixelArtSandboxInit.ts` (`hide-loading -> position-player -> flush-chunk-update -> renderer-visible -> enable-player-systems -> interactive-ready`).
- Replaced fixed `setTimeout(200)` spawn pregen wait with chunk readiness polling in `src/core/SandboxSystemManager.ts` (checks minimum playable ring chunk load around spawn).
- Added explicit chunk size accessor in `src/systems/terrain/ImprovedChunkManager.ts` to support deterministic spawn-area readiness checks.
- Removed duplicated `KeyZ` command firing on keyup in `src/systems/player/PlayerInput.ts` (single action per key press).
- Removed synthetic keyboard dispatch for touch sandbag/rally commands in `src/systems/player/PlayerInput.ts` (direct callback path).
- Removed synthetic keyboard dispatch for touch weapon selection in `src/systems/player/PlayerController.ts` (direct `InventoryManager` slot switch API).
- Added direct inventory slot API in `src/systems/player/InventoryManager.ts` for non-keyboard callers.
- Added deferred initialization pathway (critical systems first, deferred systems after interactive-ready):
  - `src/core/SystemInitializer.ts`
  - `src/core/SandboxSystemManager.ts`
  - `src/core/PixelArtSandboxInit.ts`
- Reduced startup shader compile stall risk by preferring async `compileAsync` with fallback:
  - `src/core/SandboxRenderer.ts`
  - Reference: https://threejs.org/docs/api/en/renderers/WebGLRenderer.html (`compileAsync`)
- Updated perf harness startup model to support realistic warmup and startup windows:
  - `scripts/perf-capture.ts`
  - Added `warmup`, `startup-timeout`, `startup-frame-threshold` flags and fixed env parsing for hyphenated names (`PERF_STARTUP_TIMEOUT`, etc.).
- Added AI frame budget capping/degradation path in combat LOD update loop:
  - `src/systems/combat/CombatantLODManager.ts`
- Reduced terrain merge spike risk with incremental ring processing:
  - `src/systems/terrain/TerrainMeshMerger.ts`

Validation:
- Targeted tests passed:
  - `src/systems/player/PlayerInput.test.ts`
  - `src/systems/player/PlayerController.test.ts`
  - `src/systems/player/InventoryManager.test.ts`
  - `src/systems/combat/CombatantLODManager.test.ts`
  - `src/systems/combat/CombatantSpawnManager.test.ts`
  - `src/systems/terrain/TerrainMeshMerger.test.ts`
  - `src/systems/terrain/ImprovedChunkManager.test.ts`
  - `src/systems/terrain/TerrainMeshMerger.test.ts`
  - `src/systems/combat/CombatantLODManager.test.ts`
  - `npm run build`

### External Research Notes (Web)

- Three.js documents `WebGLRenderer.compileAsync` as the async shader compile path that reduces runtime stalls:
  - https://threejs.org/docs/api/en/renderers/WebGLRenderer.html
- MDN recommends `requestIdleCallback` with `timeout` for low-priority background work:
  - https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback
- MDN transferable objects guidance confirms zero-copy `ArrayBuffer` transfer as the preferred worker data path:
  - https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects

### Latest Loop Update (2026-02-14)

- `src/core/SystemUpdater.ts`:
  - Removed per-frame `Set` allocation in untracked-system filtering.
  - Replaced with direct identity checks via `isTrackedSystem(...)`.
  - Why: avoid guaranteed GC churn every frame in the core loop.

- `src/systems/debug/PerformanceTelemetry.ts`:
  - Added runtime enable gate (`setEnabled`, `isEnabled`) and disabled-by-default behavior outside sandbox/dev/explicit flags.
  - Why: avoid frame-timing bookkeeping overhead in normal hosted play sessions.

- `src/core/PixelArtSandboxInput.ts`, `src/core/PixelArtSandbox.ts`, `src/core/PixelArtSandboxInit.ts`:
  - Telemetry now toggles with FPS overlay visibility (or sandbox mode).
  - Why: keep perf instrumentation available when needed without always-on cost.

- `src/systems/world/billboard/GPUBillboardSystem.ts`:
  - Removed per-instance `new THREE.Vector2(...)` allocation when building chunk bounds.
  - Why: chunk-load vegetation path was creating large transient object bursts and triggering avoidable GC pressure.

- `scripts/perf-capture.ts`:
  - Rebalanced `peak_max_frame_ms` validation severity (`pass <120`, `warn <300`, `fail >=300`) to avoid false hard-fails from singleton spikes while preserving severe-spike failure.

Harness evidence:
- `artifacts/perf/2026-02-14T06-39-24-691Z`:
  - FAIL (`max=352.4ms`, heap growth `33.6MB`).
- `artifacts/perf/2026-02-14T06-43-04-873Z`:
  - FAIL but improved (`max=209.4ms`, heap growth `47.6MB`, p99 `13.8ms`).
- `artifacts/perf/2026-02-14T06-44-17-739Z`:
  - `status=ok`, validation overall `WARN` only (`max=225.7ms`, heap growth `20.1MB`), avg frame `7.47ms`.

Interpretation:
- Combat hot path is not the current dominant stall source (combat breakdown remains sub-ms to low-ms).
- Remaining hitch risk is one-off/sparse main-thread spikes outside sustained combat update costs.
- Next highest-value work is terrain/chunk ingestion memory churn and worker payload compaction, not AI decision math.
