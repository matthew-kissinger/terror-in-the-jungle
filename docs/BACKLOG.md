# Backlog

Last updated: 2026-05-04

## Stable-Ground Follow-Up

The 2026-05-02 stabilization pass freezes feature work until release parity is
restored and documented. Current priority is ops/drift, not new runtime
capability.

- Deploy the final accepted `master` SHA after CI is green, then verify live
  `/asset-manifest.json`, `/sw.js`, Pages headers, R2 DEM headers, Recast WASM,
  Zone Control browser smoke, and one A Shau startup path.
- Keep `game-field-kits` reproducible: if TIJ file dependencies or CI checkout
  scripts change, validate both repos and the deploy-key checkout path.
- Review retained unmerged task/spike branches in batches. Delete only branches
  that are merged, superseded by current code/docs, or intentionally archived;
  preserve unique work until it is either imported or explicitly rejected.
- Keep root-level asset/review drops outside the TIJ repo root. Import assets
  only through the reviewed Pixel Forge/runtime pipeline.
- Refresh performance confidence on a quiet machine. `validate:full` remains
  authoritative locally; hosted CI perf is advisory. The 2026-05-02
  stabilization run failed local combat120 frame-time gates after unit/build
  stages passed, with artifact
  `artifacts/perf/2026-05-02T07-29-13-476Z/validation.json`.

## Standing workstreams

### Pixel Forge asset replacement + LOD/impostor pipeline (active)

Parallel to orchestrated cycles, the human is progressively replacing
placeholder / low-quality 3D models, textures, and effects with improved assets
- some hand-authored, some sourced externally. The 2026-04-26 Pixel Forge pass
has now cut NPC and vegetation runtime visuals over to new assets only:
approved vegetation species use manifest-backed impostor color/normal atlases,
close NPCs use skinned GLBs with weapons, and mid/far NPCs use animated
impostor atlases. Old root-level vegetation WebP files and old faction sprite
WebP files are no longer valid runtime or shipped assets.

**Scope (tracked, not cycle-gated):**
- Keep `npm run check:pixel-forge-cutover` green so old NPC sprites, old
  NPC source-soldier PNGs, old vegetation assets, blocked species IDs, and
  rejected handoff paths cannot drift back into runtime or shipped output.
- Next polish pass should keep gameplay-facing combat feel ahead of more asset
  churn. Hit registration now uses shared Pixel Forge visual hit proxies for
  close GLBs, impostors, and the player character, plus an isolated Pixel Forge
  GLB gun range at `?mode=gun-range`; human playtest still needs to
  judge crosshair feel, projected barrel tracer feedback, close NPC camera
  occlusion/collision feel, and whether the current 1.5x Pixel Forge NPC scale
  feels right in live fights.
- Finish visual tuning from human playtest: vegetation close opacity,
  lighting/readability, wind feel, high-speed atlas snapping, faction marker
  style, NPC background separation, and close/far impostor readability.
- Palm/tree quality is not final. Current runtime guards avoid the worst
  `giantPalm` and `coconut` atlas snapping, but a higher-quality pass should
  evaluate close mesh vegetation LODs or a hybrid trunk-mesh/canopy-impostor
  path instead of trying to solve tall asymmetric palms with flat billboards
  alone.
- Measure static building/prop culling before changing residency. The user has
  flagged that buildings appear to stay visible indefinitely; first add
  renderer-category evidence, then decide whether distance culling, HLOD, or
  batching policy needs to change.
- Integrate Pixel Forge props through `PixelForgePropCatalog` and placement
  profiles. Props are not fallback substitutes for missing vegetation/NPC
  species.
- For future assets, prefer reproducible generated impostor packages with
  explicit atlas metadata, color-space declarations, normal-space declarations,
  edge bleed/crop bounds, and runtime validation.

**Notes for future orchestrated cycles:**
- If a future cycle needs to touch model loading, LOD switching, vegetation
  scattering, or prop placement, check this workstream first because the Pixel
  Forge manifest and validator now define the allowed runtime asset surface.
- Tooling preference: headless Three.js render/package passes (`npm run` script)
  over external DCC; keep atlas packages reproducible and testable.
- When a cycle's RESULT calls out "asset worth replacing" findings from a
  playtest doc, append to the per-session inventory table and the Pixel Forge
  intake notes; do not spawn a separate cycle unless the batch is large enough
  to justify a renderer/pipeline pass.

### Playtest feedback docs

Per-session fillable docs live under `docs/playtest/PLAYTEST_<date>.md`. Each session's notes roll up to the next cycle's planning pass. See `docs/playtest/PLAYTEST_2026-04-22.md` for the template shape.

## Active Recovery Board

Architecture recovery is the current stabilization board. The items below
describe the code state being promoted to `master`; archived cycle sections
remain historical evidence.

Completed in the current recovery pass:
- Cycle 0 control board: [ARCHITECTURE_RECOVERY.md](ARCHITECTURE_RECOVERY.md).
- Vehicle session authority: `VehicleSessionController` owns player vehicle
  enter, exit, emergency eject, switching, and derived `PlayerState` flags.
- Model/session split: fixed-wing and helicopter models provide exit facts;
  adapters expose optional `getExitPlan()`; the session controller finalizes
  the transition.
- Touch action-bar EXIT wiring is covered at the UI orchestration layer and
  routes through the generic vehicle enter/exit callback.
- Keyboard `KeyE` and gamepad interact routing are covered at the `PlayerInput`
  callback layer and prefer the generic vehicle enter/exit callback.
- `HelicopterModel.exitHelicopter()` now routes through the session-aware
  `requestVehicleExit()` path when available, keeping `HelicopterInteraction`
  as legacy fallback.
- Fixed-wing probe path: player/NPC handoff now exits through the keyboard
  `KeyE` path instead of a direct private call.
- Fixed-wing probe path: in-flight emergency bailout now exits through keyboard
  `KeyE` while airborne and then re-enters/resets for the existing handoff
  validation.
- AC-47 orbit hold was stabilized enough for the browser fixed-wing probe to
  pass after the session refactor.
- Cycle 3 first pass: `SystemUpdateSchedule` now declares the current
  `SystemUpdater` phases, budgets, cadence groups, and scheduled system keys.
  The `Other` fallback derives its tracked-system exclusion set from that
  metadata, including `navmeshSystem`, `npcVehicleController`, and the
  `gameModeManager` runtime hook, so adding those systems to the generic system
  list cannot silently double-update them.
- Cycle 4 first pass: `TouchControls` now derives vehicle/touch flight layout
  from presentation `VehicleUIContext` instead of public touch-mode mutators.
  The vehicle action bar remains capability-driven, and actor mode alone is no
  longer enough for touch controls to independently enter aircraft mode.
- Cycle 5 first pass: `CombatantSystem` now owns the current spatial index
  dependency for the combat world and injects it into `CombatantLODManager`.
  The LOD manager no longer imports the global `spatialGridManager` singleton
  directly, and regression coverage proves LOD position sync plus AI update
  dependency flow use the injected grid.
- Cycle 5 actor-height follow-up: NPC and player positions now use the same
  eye-level actor-anchor contract. `NPC_Y_OFFSET` matches `PLAYER_EYE_HEIGHT`,
  `CombatantBodyMetrics` owns muzzle/center-mass/eye derivation, and
  ballistics, LOS, fire occlusion, hit zones, tracers, death effects, and
  respawn/deploy tests no longer depend on scattered vertical magic offsets.
  The NPC billboard plane is also reduced from `3.2m x 4.5m` to `2.0m x 2.8m`
  and render-shifted down so visible sprite feet stay near terrain and the
  visible head stays near the actor eye anchor. The remaining question is
  human visual/art feel, not hidden combat math.
- Cycle 6 first pass: helicopter squad deployment now queries the runtime
  terrain surface and uses effective/collision-aware height when available.
  `NavmeshSystem` now receives `terrainSystem` from `SystemConnector` and
  samples navmesh heightfields, obstacle placement, and connectivity
  representative heights through the runtime terrain source instead of direct
  `HeightQueryCache` access.
- Cycle 7 first pass: `scripts/fixed-wing-runtime-probe.ts` now writes
  incremental summaries after each aircraft scenario and records structured
  failure rows plus best-effort failure screenshots when a browser/scenario
  failure interrupts the run.

Validation completed in the current recovery pass:
- targeted vehicle/session contract tests - PASS
- targeted touch vehicle-exit callback tests - PASS
- targeted keyboard/gamepad vehicle-exit callback tests - PASS
- targeted helicopter model/session exit tests - PASS
- `npm run validate:fast` - PASS
- `npm run check:mobile-ui` - PASS
- `npm run build` - PASS
- `npm run probe:fixed-wing` - PASS, including takeoff, approach, in-flight
  bailout, and player/NPC handoff

Remaining gates before human sign-off / next release pass:
- Human playtest of grounded exit, in-flight fixed-wing emergency bailout,
  helicopter entry/exit, respawn/death cleanup, AC-47 orbit feel, A Shau
  forward-strip taxi/takeoff, pointer-lock fallback, and touch/mobile exit
  feel is deferred until the end of all current recovery cycles per user
  direction on 2026-04-23.
- 2026-04-23 playtest findings now routed into the cycle board:
  - Cycle 1 closure: current fixes now preserve airborne bailout height,
    clear held input on vehicle exit, and provide a pointer-lock rejection
    fallback. Automated tests/probe pass; human playtest is still required.
  - Cycle 2 vehicle feel: current rotor lifecycle patch now lets exited
    helicopters spool down to stopped and increases flight-RPM visual speed.
    Human playtest still decides whether blurred-disc or GLB work is needed.
  - Cycle 2/6 bridge: current airfield datum patch now gives generated
    runway, taxiway, apron, filler, and envelope stamps one shared target
    height on sloped sites. Human playtest still needs to confirm the A Shau
    taxi/runway route feels usable; Cycle 6 still owns full terrain/collision
    runtime unification.
  - Cycle 2 fixed-wing follow-up: AC-47 orbit hold had a roll-error sign bug
    that the browser probe caught after the terrain patch. The current fix
    restores AC-47 orbit probe success and adds transient roll/stall-margin
    coverage.
  - Atmosphere/perf follow-up: capture A Shau/Open Frontier fog/cloud
    readability and airfield draw-call/collision/LOS cost before tuning assets.
  - Combat scale/aiming follow-up: current code fixes the vertical contract
    behind NPCs appearing to fire above the player and shrinks the actual NPC
    billboard container. Human playtest still needs to confirm NPC billboard
    scale, tracer start height, hit feedback, and whether player/NPC silhouettes
    feel matched in ground FPS combat.
- Broader local gates completed on 2026-04-24: `npm run validate:fast`
  (243 files, 3789 tests), `npm run build`, `npm run smoke:prod`,
  `npm run evidence:atmosphere`,
  `npm run probe:fixed-wing`, `npm run check:states`,
  `npm run check:hud`, `npm run check:mobile-ui`, `npm run doctor`,
  `npm run deadcode`, and `git diff --check`. `npm run validate:full`
  passed unit/build portions but the first combat120 capture failed one heap
  recovery check; a standalone rerun of `npm run perf:capture:combat120`
  passed with warnings and `npm run perf:compare -- --scenario combat120`
  passed 8/8. Treat this release perf gate as PASS/WARN until a quiet-machine
  full validation rerun refreshes the heap signal.
- Cycle 3 implementation gate passed on 2026-04-23: `npm run typecheck`,
  `npm run lint`, `npm run test:quick`, and `npm run build`.
- Cycle 4 automated gate passed on 2026-04-23: targeted UI/input suites,
  `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check:hud`,
  `npm run check:mobile-ui`, and `npm run test:quick`.
- Cycle 5 first-pass validation passed on 2026-04-23: targeted combat
  ownership suites and `npm run typecheck`.
- Cycle 6 first-pass targeted validation passed on 2026-04-23: targeted
  terrain/navigation/helicopter/composer suites and `npm run typecheck`.
- Cycle 6 broad gate passed on 2026-04-23: `npm run lint`,
  `npm run test:quick`, `npm run build`, and a clean rerun of
  `npm run probe:fixed-wing`. The first fixed-wing probe attempt closed the
  browser during AC-47 and left partial artifacts, which is now routed to Cycle
  7 harness productization.
- Next recovery follow-up is Cycle 7 harness productization after Cycle 6 broad
  gate and fixed-wing probe. Keep it to diagnostic/probe trust, real user paths,
  and useful failure artifacts.
- Cycle 7 first-pass validation so far: `npm run typecheck` and `npm run lint`
  passed after the fixed-wing probe summary writer change. The post-patch
  `npm run probe:fixed-wing` rerun passed and wrote `status: "passed"` to the
  fixed-wing probe summary. `npm run check:states` and `npm run check:hud`
  also passed.
- Next recovery follow-up is Cycle 8 dead-code/docs/guardrails. Keep it to
  evidence-backed cleanup and local subsystem rules; do not delete code based
  on dead-code tool output alone.
- Cycle 8 first pass is complete: `npm run deadcode` is clean
  after classifying retained flight evidence probes, archived evidence scripts,
  and Cloudflare deploy tooling; local-only helper exports were made private;
  terrain/combat/UI/scripts guardrails now capture current ownership rules.
  `npm run typecheck`, `npm run lint`, `npm run test:quick`, and
  `npm run build` also passed.
- 2026-04-24 follow-up gates added after user review:
  - Cycle 9: clouds/fog/readability across all five modes. Current
    evidence: `npm run evidence:atmosphere` attempts ground, sky-coverage, and
    aircraft views for all five modes, and the current artifact is
    `artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T13-08-25-253Z/`.
    All five modes are wired and measurable through sky-dome clouds; the old
    `CloudLayer` plane is hidden so it no longer draws the hard horizon divider.
    The sky shader now uses a seamless cloud-deck projection instead of
    azimuth-wrapped UVs, so A Shau/TDM/ZC read as broken cloud layers and Open
    Frontier/combat120 read as lighter scattered-cloud presets. Cloud art is
    still not human-signed off. The latest run reports `0` browser errors,
    cloud follow `true`, terrain ready at camera, and no terrain/water clipping
    flags in all five modes. A Shau has DEM-backed atmosphere evidence with
    disabled water state. The artifact records A Shau
    representative-base nav
    connectivity as passing, but route/NPC movement quality still needs
    play-path validation against the explicit static-tiled nav path.
    Terrain/camera clipping and water rendering are tracked separately:
    clipping can expose the global water plane, while water quality/hydrology
    remains its own render backlog item. `tabat_airstrip` remains steep, and
    Open Frontier also reports a separate steep `airfield_main` warning.
  - Cycle 10: fallback retirement. Remove or make explicit silent fallbacks
    that can hide bad wiring, especially required A Shau DEM/asset resolution,
    terrain, air support, LOS, and spatial singleton compatibility. The local
    preview manifest blocker is fixed by generating `asset-manifest.json` during
    `build` and `build:perf`; the old TileCache fallback path has been removed.
    The current blocker is proving A Shau route/NPC movement quality beyond the
    representative-base connectivity gate, with startup hard-failing if no
    navmesh is generated or pre-baked.
    Do not skip A Shau, and do not close the cycle without an all-mode
    regression pass.
  - NPC locomotion follow-up: `NPC_MAX_SPEED` now caps infantry at 6m/s and
    visible high/medium LOD NPCs are clamped near grounded Y to reduce hover.
    Remaining work is route quality, not another hidden speed bump: validate
    navmesh-guided long-range movement before re-enabling route guidance in
    `CombatantMovement`.
  - Release/docs gate: before push/deploy, rerun all-mode local evidence and
    then bridge local-vs-deployed truth through live Pages/R2/WASM/service-worker
    header checks. A local perf-preview pass is not automatically live-site
    truth.
  - Cycle 11: airfield surface authority. Terrain stamps share one datum, but
    stands/taxi/runway helper metadata still need one runtime surface truth.
  - Cycle 12: render/LOD/culling/water perf. Measure airfield draw calls,
    triangles, collision registrations, LOS obstacles, water/hydrology visuals,
    object pop-in, and aircraft/building visibility before replacing assets or
    adding imposters.

## Recently Completed (cycle-2026-04-23-debug-cleanup, 2026-04-22)

Two merged PRs in one round, single autonomous session; both follow-ups from the just-closed `cycle-2026-04-23-debug-and-test-modes`. Briefs archived under `docs/tasks/archive/cycle-2026-04-23-debug-cleanup/`. Full retrospective at `docs/cycles/cycle-2026-04-23-debug-cleanup/RESULT.md`.

### Round 1 (2 parallel)
- **PR #147 `preserve-drawing-buffer-dev-gate`** — extracted `shouldPreserveDrawingBuffer()` helper in `src/core/GameRenderer.ts`; returns `true` in dev, `true` on retail with `?capture=1`, `false` otherwise. Wired into the `WebGLRenderer` constructor. Retail bundle DCE verified: the minified helper is a pure URL-param check with the DEV branch tree-shaken. Behavior test covers all four branches. Diff 83 LOC vs ≤60 LOC budget (28 prod + 55 test) — envelope mildly over, well inside 500-LOC small-diff rule.
- **PR #145 `world-overlay-debugger` (rebased + CI-fixed)** — unblocked the six world overlays (navmesh / LOS / squad influence / LOD tier / aircraft contact / terrain chunks) that had been stuck on a CI-only test red. Root cause was in the overlay source, not the test: `terrainChunkOverlay` throttled `update()` to 4 Hz using `performance.now() - lastUpdateMs < 250` with `lastUpdateMs` initialized to `0`, so a fresh-process Vitest cold-start bailed on the first call and `drawRange` stayed 0. Fix: initialize to `Number.NEGATIVE_INFINITY` so first call always runs. 1-line delta in `src/ui/debug/worldOverlays/terrainChunkOverlay.ts`; rebase on master was CLEAN; CI all green on rerun.

### Perf (combat120, seed=2718, 90s, 120 NPCs)
- R0 baseline (HEAD 6fad9e1, inherited): avg=16.98ms  p99=34.20ms  heap_end=-2.01MB  heap_recovery=1.038
- post-R1 (HEAD bdaadcc):                 avg=17.25ms  p99=33.90ms  heap_end=+8.36MB  heap_recovery=0.759
- **p99 gate:** -0.88% vs baseline → PASS. **heap_recovery gate:** 0.759 → PASS. **heap_end_growth gate (≤+2 MB):** YELLOW — +8.36 MB is a ~4.7 MB improvement over R3's +13.08 MB (preserve-drawing-buffer gate released its back-buffer tax) but did not return to baseline's near-zero. Residual likely includes `WorldOverlayRegistry` module-eval-time footprint; single-run variance also in play. Not a revert trigger.

### Follow-ups for next cycle
- **Investigate residual +8.36 MB heap end-growth.** The `?capture=1` gate pulled ~4.7 MB out of the retail residual; the remaining ~8 MB is probably `WorldOverlayRegistry` boot allocations (6 overlay modules + control panel + 4 accessors). First step is a variance read — rerun combat120 once or twice to confirm the residual is systematic, not single-run noise. Then audit overlay registry boot-time `new` calls and lazy-init the ones that aren't free.
- **PlaytestCaptureManager preserveDrawingBuffer guard (optional).** Brief's Section 3 flagged a console.warn in `PlaytestCaptureManager.capture()` when `preserveDrawingBuffer === false` so Cloudflare testers who hit F9 without `?capture=1` get a clear signal instead of silent blank PNGs. Trivially small; bundle with any other capture-surface work.

## Recently Completed (cycle-2026-04-23-debug-and-test-modes, 2026-04-22)

Six merged PRs across three rounds plus a dedicated R0 prep commit, in a single autonomous session. One task blocked on CI red and did NOT merge (world-overlay-debugger, PR #145 remains open for rebase). Briefs archived under `docs/tasks/archive/cycle-2026-04-23-debug-and-test-modes/`. Full retrospective at `docs/cycles/cycle-2026-04-23-debug-and-test-modes/RESULT.md`.

### Round 0 (orchestrator prep)
- **commit 6fad9e1 `chore(cycle): R0 prep for cycle-2026-04-23-debug-and-test-modes`** — `npm install tweakpane` + fresh combat120 baseline capture committed to `docs/cycles/.../baseline/`. avg=16.98ms, p99=34.2ms, heap_recovery=1.038.

### Round 1 (2 parallel)
- **PR #140 `debug-hud-registry`** — `DebugHudRegistry` + `DebugPanel` interface; backtick (`` ` ``) master toggle; three existing overlays (PerformanceOverlay / TimeIndicator / LogOverlay) migrated; four new panels seeded (VehicleStatePanel @ 10Hz, CombatStatePanel, CurrentModePanel, FrameBudgetPanel @ 5Hz). F1-F4 behavior preserved via `registry.togglePanel()`. No additive combat accessors needed — `CombatantSystem.getCombatStats()` / `.getTelemetry()` already covered the read surface.
- **PR #139 `engine-trajectory-memo`** — 3847-word memo at `docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md` covering stack snapshot, what-we-reinvented, fence review, multi-location reuse blast-radius, recommended sequence, anti-recommendations, immediate-vs-long-term table. Flagged the stale r183 references in MEMORY.md and CLAUDE.md as trivial next-cycle cleanup.

### Round 2 (3 parallel — required orchestrator-directed rebase on one branch)
- **PR #141 `time-control-overlay`** — `TimeScale` (0 / 0.1 / 0.25 / 0.5 / 1 / 2 / 4) threaded through `GameEngineLoop.dispatch` at a single hook point; `Backspace` for pause (both `Space` = jump and `P` = post-processing were taken), `.` step, `,` slow, `;` fast. `TimeControlPanel` registered with the HUD registry. Executor flagged 14 systems that read `performance.now()` directly and bypass the scale (GPUBillboardSystem, GunplayCore, AmmoSupplySystem, AmmoManager, TerrainStreamingScheduler, TerrainWorkerPool, WarSimulator, StrategicFeedback, ShotCommand, PlayerController, NavmeshSystem, TracerPool, ImpactEffectsPool, ExplosionEffectsPool, AILineOfSight); not a blocker but follow-up material.
- **PR #143 `live-tuning-panel`** — Tweakpane panel (backslash `\` toggle) with Flight / Clouds / Atmosphere / Combat / Weather folders; localStorage persist + named-preset save/load/export. `LiveTuningPanel.getState()` exposes the values dictionary for the capture overlay to bundle. Retail DCE verified: zero `tweakpane` bytes in `dist/`. Dropped the `altitudeHoldPGain`/`DGain`/`pitchDamperGain` knobs listed in the brief — those fields do not exist on `FixedWingPhysicsConfig` (Airframe uses hardcoded PD gains); per the brief's "hide knob if target not available" rule.
- **PR #142 `free-fly-camera-and-entity-inspector`** — `V` toggles a detached free-fly camera, `B` reattaches; mouse-click while free-flying raycasts and opens the `EntityInspectorPanel` on the hit entity. Per-type inspectors for Combatant / Vehicle / Prop / Player. Follow mode tracks the selected entity. **Required orchestrator-directed rebase** on top of #141+#143 after same-file conflicts on `GameEngine.ts` / `GameEngineInput.ts`; rebase executor returned CLEAN with 3702 tests green and `--force-with-lease`-pushed the resolved branch. No combat or vehicle accessors needed — `getAllCombatants`, `getVehicle`, `getAllVehicles`, `Combatant` already covered every field. 20-LOC cap stayed unspent.

### Round 3 (3 parallel)
- **PR #144 `playtest-capture-overlay`** — `preserveDrawingBuffer: true` on `WebGLRenderer` (unconditional; perf-analyst recommends gating behind `import.meta.env.DEV` in a follow-up). F9 captures the current frame, opens a centered modal with a thumbnail + annotation textarea; Submit writes PNG + MD (+ bundled tuning-state JSON) via `showSaveFilePicker` → `<a download>` fallback. Session-scoped directory naming. Executor could not capture a real PNG from the headless env; committed a README with the human-playtest capture procedure as the evidence placeholder.
- **PR #146 `terrain-param-sandbox`** — new `?mode=terrain-sandbox` URL bypass (sibling to `?mode=flight-test`). Isolated scene with orbit camera + Tweakpane noise/shape/preview params + heightmap PNG export + MapSeedRegistry JSON export + clipboard-copy of the registry entry literal. DEV-gated via `import.meta.env.DEV`; retail DCE verified. **CDLOD terrain was too coupled to `GameEngine` to extract** inside the 500-LOC budget; fell back to `FALLBACK_STATIC_MESH` as the hard-stop escape hatch prescribed — scoped to a single generated mesh. Sandbox uses the shared `NoiseGenerator` Perlin primitive directly; the main-game `NoiseHeightProvider.calculateHeight` is a multi-band (continental + ridges + valleys + hills + water carving) composition, not a parameterized fBm, so no extract-shared-helper refactor fit.
- **PR #145 `world-overlay-debugger` (BLOCKED — CI test red)** — six overlays (navmesh wireframe, LOS rays, squad influence, LOD tier, aircraft contact, terrain chunks) + `WorldOverlayRegistry` + control panel. `Shift+\` master toggle. Additive read-only accessors in `LOSAccelerator` (+11 LOC), `InfluenceMapSystem` (+9 LOC), `TerrainRenderRuntime` (+14 LOC), `TerrainSystem` (+5 LOC) — all within the ≤20 LOC per-file cap. Gated overlay hotkeys (N/L/I/T/C/X) to only fire when master is visible (T and C collide with air-support bindings). **Test failure in CI only:** `src/ui/debug/worldOverlays/terrainChunkOverlay.test.ts` expected 24 LineSegments (4 per tile × 6 active tiles) but got 0. Executor reported 3710 tests green locally — mock mismatch between the new terrain-chunk accessor and the overlay test stub is the most likely root cause. PR remains open for rebase + CI-fix as a next-cycle Round 1 candidate. Autonomous failure-handling followed (no retry, marked blocked, cycle continued).

### Perf (combat120, seed=2718, 90s, 120 NPCs)
- R0 baseline (HEAD 6fad9e1):  avg=16.98ms  p99=34.20ms  heap_peak=52.76MB  heap_recovery=1.038
- post-R1 (HEAD 868f1aa):      avg=15.52ms  p99=34.10ms  heap_peak=34.43MB  heap_recovery=1.201   GREEN
- post-R2 (HEAD 8833124):      avg=16.65ms  p99=35.30ms  heap_peak=71.03MB  heap_recovery=0.993   YELLOW (no hard stop)
- post-R3 (HEAD 422563e):      avg=15.58ms  p99=34.50ms  heap_peak=30.80MB  heap_recovery=0.575   PASS
- **Final gate:** p99 +0.88% vs baseline (ceiling +5.0%) → PASS; heap_recovery 0.575 (floor 0.5) → PASS. The R2 heap-peak WARN was workload-driven (R2 capture had 1 respawn + 88 kills; R3 settled back to lowest peak of the cycle).

### Follow-ups for next cycle
- **Rebase + CI-fix PR #145 `world-overlay-debugger`** — investigate the `terrainChunkOverlay.test.ts` mock mismatch; most likely the accessor stub shape vs the overlay's assumed `Iterable<tile>` contract. Worth bundling with the DEV-gate follow-up below as a Round 1 pair.
- **Gate `preserveDrawingBuffer: true` behind `import.meta.env.DEV`** — +13 MB heap residual in R3 attributable to retained WebGL back-buffer; retail players pay the cost for a dev-only feature (F9 capture). Touches only `src/core/GameRenderer.ts`.
- **MEMORY.md / CLAUDE.md refresh** — both still say `three@0.183 / r183` while `package.json` pins `^0.184.0` (flagged by engine-trajectory memo).
- **Time-control scaled-delta audit** — 14 systems bypass the `TimeScale` multiplier (see RESULT.md for the full list). Addressing these would make pause / slow-mo / fast-forward behave correctly end-to-end. Not a single-cycle task; scoped to a few systems at a time.
- **AC-47 low-pitch takeoff single-bounce** (carried over from prior cycles).
- **Helicopter parity audit** for `HelicopterVehicleAdapter` / `HelicopterPlayerAdapter` (carried over).
- **Asset replacement + LOD-imposter pipeline** (standing workstream).

### Cycle metrics
- 6/8 tasks merged. 1 blocked (world-overlay-debugger, CI test red). 1 orchestrator-directed rebase (free-fly on top of time-control + live-tuning). 0 reviewer spawns (anticipated reviewers did not fire — entity-inspector didn't need combat accessors; terrain-param-sandbox fell back to static mesh and stayed out of `src/systems/terrain/**`; world-overlay-debugger was blocked before reviewer dispatch). 0 fence changes. 0 rolled-back merges. 0 direct-to-master commits beyond the explicit R0 prep.
- Wallclock: ~15:48 UTC R0 prep → ~18:00 UTC cycle close. Single ~2h12m autonomous session.

## Recently Completed (cycle-2026-04-22-heap-and-polish, 2026-04-22)

Four merged PRs across two sequential rounds — small polish follow-up to `cycle-2026-04-22-flight-rebuild-overnight`, closed in a single autonomous session without rollback or manual intervention. Briefs archived under `docs/tasks/archive/cycle-2026-04-22-heap-and-polish/`. Per-cycle evidence + RESULT at `docs/cycles/cycle-2026-04-22-heap-and-polish/`.

### Round 1 (solo, P0)
- **PR #135 `heap-recovery-combat120-triage`** — Triage memo at `docs/rearch/HEAP_RECOVERY_COMBAT120_TRIAGE.md`. Executor ran three fresh `perf:capture:combat120` samples (2 at post-prior-cycle HEAD `a69cd1f`, 1 at pre-cycle seed `88e3d35`) — all came in within baseline envelope (heap_growth 6.07–19.39 MB, heap_recovery_ratio 0.62–0.82, ai_budget_starvation 0.36–1.42/sample). The Round-3-close regression (53.25 MB / 0.12 / 4.07) did not reproduce. Root cause attributed to orchestrator-session host pressure (Hypothesis 5 in the brief's diagnosis table). No code fix landed; memo-only deliverable with three committed captures.

### Round 2 (3 parallel, P1)
- **PR #136 `helicopter-interpolated-pose`** — Mechanical port of PR #124 from fixed-wing to helicopter. `HelicopterModel.ts:549` (playerController), `:553` (weaponSystem), `:568` (doorGunner) migrated from raw `state.position` to interpolated `helicopter.position`; `state.isGrounded` stayed raw. L2 + L3 behavior tests added. Pose-continuity probe reproduced the fixed-wing precedent's 141 -> 0 zero-delta frame collapse. Three-call-site audit matched the brief's prediction exactly.
- **PR #137 `a1-altitude-hold-elevator-clamp`** — Per-aircraft `altitudeHoldElevatorClamp` threaded through `FixedWingPhysicsConfig -> FixedWingTypes.airframeConfigFromLegacy -> airframe/types.AirframeConfig.feel -> Airframe.ts`. F-4 + AC-47 stay at 0.15 (no change); A-1 Skyraider tightens to **0.22** after probe sweep. **Surprise:** brief's suggested 0.30-0.40 range induced dive-and-not-recover divergence rather than closing the recapture regression — root-cause diagnosis in the brief was wrong (the observed behavior is gain instability at wider clamp, not saturation). Per-aircraft field solves the symptom regardless; 0.22 brings A-1 recapture-after-pitch-release inside the 100m criterion without altering the other two aircraft.
- **PR #138 `cloud-audit-and-polish`** — `CloudLayer` shader upgraded: 3 -> 5 octave fbm, `lowerEdge = mix(1.0, -0.4, coverage)` (widened from -0.2), `upperEdge = lowerEdge + 0.35`, large-scale modulator `0.5 + 0.5 * smoothstep(0.20, 0.70, fbm(bigUv))` (the `0.5 +` floor was added after first-iteration screenshots showed openfrontier/combat120 getting worse by punching out large clear holes), and animated drift via `uTimeSeconds` + 10 m/s NE wind. Per-scenario rebalance: openfrontier 0.10 -> 0.25, combat120 0.20 -> 0.30, ashau 0.40 -> 0.55, zc 0.30 -> 0.45, tdm 0.60 -> 0.70. Optional `cloudScaleMetersPerFeature` added (openfrontier 1400m, ashau 700m, others 900m). 10 PNGs (before/after across 5 modes) committed under `evidence/cloud-audit-and-polish/`. The cloud executor's worktree hung `perf:capture:combat120` in `menu_ready` through 54+s across three attempts — orthogonal to the PR (no code path through cloud shader on startup; reproduced with src stashed). Flagged environmental, not regression.

### Perf (combat120 at cycle-close HEAD 7130564 vs inherited baseline perf-after-round3.json)
- avg: 14.21 -> 14.04 ms (-1.20%)
- p99 (peak per-sample): 34.50 -> 33.80 ms (-2.03%) — inside 5% gate.
- p95 (peak per-sample): 32.90 -> 32.50 ms (-1.22%)
- max frame: 52.10 -> 46.50 ms (-10.75%); hitch_50ms = 0.000% (was 0.031%)
- heap_growth_mb: +53.25 -> -1.86 (net shrink)
- heap_peak_growth_mb: 60.61 -> 47.41 (-13.20 MB)
- heap_recovery_ratio: 0.122 -> 1.039 — clears ≥0.5 gate by wide margin.
- ai_budget_starvation: 4.07/sample -> 3.07/sample (-24.59%)

Four independent samples (3 triage-captures + 1 post-merge perf-analyst) all land in the healthy band. The Round-3-close baseline stands as the outlier; heap regression did not persist in code.

### Follow-ups for next cycle
- Baseline recalibration: inherited "perf-after-round3" is itself an outlier; next cycle should capture a fresh combat120 at whatever its opening HEAD is and use that as its reference rather than this cycle's inherited baseline.
- Shader cost verification on a sky-dominated scenario (`openfrontier:short` or `ashau:short`) — combat120's ai_sandbox framing under-samples the cloud plane's pixel budget, so the "no measurable frame cost" result is scenario-limited.
- A-1 altitude-hold PD gain pass: the per-aircraft clamp closed the symptom, but 0.30+ destabilizing behavior indicates the underlying PD gains are the real long-term issue. Out of scope for this cycle; right follow-up is a Skyraider-specific gain tune next time a flight cycle opens.
- AC-47 low-pitch takeoff single-bounce (carried over from cycle-2026-04-21 and cycle-2026-04-22-flight-rebuild-overnight).
- Helicopter parity audit for `HelicopterVehicleAdapter` / `HelicopterPlayerAdapter` — executor flagged as out-of-scope audit targets; dedicated pass still open.
- Investigate the `menu_ready` hang in worktree perf captures — not reproduced in the main checkout, but blocked one of this cycle's in-worktree perf probes.

### Cycle metrics
- 4/4 tasks merged. 0 blocked, 0 rolled back, 0 manual orchestrator interventions, 0 direct-to-master commits, 0 reviewer spawns.
- Wallclock: ~12:05 UTC (Round 1 dispatch) -> ~13:40 UTC (cycle close). Single ~1h35m session.
- All executor reports declared `fence_change: no`.



Historical cycle-close sections below preserve what was true when those cycles
closed. Current open work lives in the P0/P1/P2/P3 sections plus Known Issues /
Known Bugs.

## Current Cycle: cycle-2026-04-21-stabilization-reset

The next work is stabilization before feature expansion. Cycle 0 closed the
repo truth/control-plane work: Node/toolchain alignment, local probe URL repair,
fixed-wing probe repair, dead-code cleanup, deploy freshness hardening, and
stale worktree/branch cleanup.

Plan: [docs/cycles/cycle-2026-04-21-stabilization-reset/README.md](cycles/cycle-2026-04-21-stabilization-reset/README.md)

### Cycle sequence

1. **Truth and gates** — done. Align Node/toolchain truth, repair local diagnostic
   URLs, restore the fixed-wing runtime probe, refresh stale docs, clean
   dead-code output, harden Cloudflare/browser freshness, and clean nested
   worktrees.
2. **Vehicle and flight alignment** — done for correctness gates. Fixed-wing
   config ownership, runway/climb/approach probes, AC-47 orbit-hold validation,
   player/NPC handoff checks, and cross-vehicle flight mouse reset are done.
   Aircraft feel is not signed off; it intentionally moves to Cycle 2.
3. **Flight feel, terrain contact, perf, and bundle** — active. Investigate
   fixed-wing stiffness, altitude bounce/porpoise, visual shake, and
   interpolation/camera smoothing; keep nearby NPCs visually grounded on
   hillsides; keep fixed-wing takeoff/liftoff from clipping through rising
   terrain; reduce large startup chunks; refresh `frontier30m` after its
   non-terminal soak fix; keep dead-code hygiene clean as bundle and vehicle
   work move files.
4. **Combat and navigation quality** — return to terrain/pathing stalls,
   squad-suppression consolidation, and remaining combat-state cleanup.

## Recently Completed (cycle-2026-04-22-flight-rebuild-overnight, 2026-04-22)

Thirteen merged PRs across four sequential rounds — the full planned cycle landed without rollback in a single autonomous overnight run. Briefs archived under `docs/tasks/archive/cycle-2026-04-22-flight-rebuild-overnight/`. Plan + per-task briefs lived in `docs/FLIGHT_REBUILD_ORCHESTRATION.md`; per-cycle evidence under `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/`.

### Tier 0 + Tier 1 (Round 1, 5 PRs)
- **PR #122 `aircraft-building-collision`** — `LOSAccelerator` gained `registerStaticObstacle` / `unregisterStaticObstacle` namespaced sibling APIs that share `chunkCache` with terrain. `WorldFeatureSystem` registers spawned building meshes (footprint ≥3m) post-`freezeTransform` via a feature-detected setter wired in `OperationalRuntimeComposer`. Aircraft sweep now reports building contact via `raycastTerrain → LOSAccelerator.checkLineOfSight`.
- **PR #123 `airframe-directional-fallback`** — Post-liftoff fallback split into directional branches: downward contact keeps the descent-latch grace, upward/forward terrain penetration responds immediately (clamps Y, zeroes inward velocity). Renamed `descentLatchGraceTicks`. Two L3 regressions added.
- **PR #124 `player-controller-interpolated-pose`** — `FixedWingModel.update()` now feeds `group.position` (interpolated) to `PlayerController` instead of `airframe.getPosition()` (raw). Probe-quantified: 144Hz pose-continuity sawtooth eliminated (141→0 zero-delta frames, relStddev 1.19→0.03 over 240 samples). HelicopterModel.ts:549 has the same bug — flagged as follow-up, out of scope for this cycle.
- **PR #125 `airframe-ground-rolling-model`** — Discrete liftoff gate replaced with continuous `wheelLoad = clamp((Vr - forwardSpeed)/Vr, 0, 1)`. Pitch authority scales with `(1 - wheelLoad)`, lateral friction scales with `wheelLoad`. New `LIFTOFF_MIN_SPEED_RATIO=0.35` blocks taxi-speed accidental commits. `syncGroundContactAtCurrentPosition` retained — probe confirmed no rollout drift contribution.
- **PR #126 `airframe-altitude-hold-unification`** — Option A: `altitudeHoldTarget` captured at liftoff so the Airframe PD takes hands-off cruise in all conditions; the duplicate `buildCommand.ts` block was removed for neutral-stick assist. Recapture-after-pitch-release: F-4 / AC-47 improved; A-1 Skyraider regresses 175m → 463m at cruise throttle (its tighter ±0.15 elevator clamp saturates against high T/W). Latent gain-tune follow-up flagged.

### Tier 2 climb-stability (Round 2, 3 PRs)
- **PR #127 `airframe-authority-scale-floor`** — `clamp(qNorm, 0.15, 2.2)` replaced with `lerp(0.30, qNorm, smoothstep(qNorm, 0.10, 0.30))` (then `min(_, 2.2)`). Removes the C0 discontinuity at the low-q clamp edge. Continuous derivative through the blend window. (Brief's literal formula was wrong; executor implemented the described intent.)
- **PR #128 `airframe-climb-rate-pitch-damper`** — Climb-rate-scaled pitch damping added just before `pitchAccel`. Window shifted from the brief's 0→5 m/s to 5→12 m/s after probe showed PD recapture transients (vy peaks 2.5–6.6 m/s) tripped the 0→5 window and broke existing tests. Climb vs RMS reduced 60%; cruise pitch response unchanged.
- **PR #129 `airframe-soft-alpha-protection`** — Variant B (tanh) won over variant A (widened smoothstep): `alphaFactor = 0.5 * (1 - tanh((|alpha| - alphaStall) / 3))`. Removes the bang-bang oscillator at the protection band edge. Stall protection preserved (airspeed > stallSpeedMs * 0.95). Bookkeeping completed by orchestrator after the executor stopped one tool-call short of `git push`.

### Tier 3 airfield (Round 3, 4 PRs)
- **PR #130 `airfield-prop-footprint-sampling`** — Zone-based `skipFlatSearch` gating in `AirfieldLayoutGenerator`: interior zones (`runway_side`, `dispersal`) keep the centroid-Y fast path; perimeter zones route through `WorldFeatureSystem.resolveTerrainPlacement`'s 9-point footprint solver. Cleaner than the alternative `envelopeInnerLateral * 0.6` gate.
- **PR #131 `airfield-perimeter-inside-envelope`** — `AIRFIELD_ENVELOPE_STRUCTURE_BUFFER_M` and `airfieldEnvelopeInnerLateral(template)` exposed from `TerrainFeatureCompiler`; `AirfieldLayoutGenerator` clamps `perimDist = min(original, innerLateral - 8)`. Discovery: `us_airbase` perimeter (240m vs `innerLateral`=289m) was already inside; `forward_strip` (160m vs 140m) was the actually-drifting template. Manual rebase + retest after Round 3 merges.
- **PR #132 `airfield-envelope-ramp-softening`** — `outerRadius = innerRadius + 12` (was +6) and `AIRFIELD_ENVELOPE_GRADE_STRENGTH = 0.65` (was 0.45). Triggered the post-merge OF heightmap + navmesh regen below.
- **PR #133 `airfield-taxiway-widening`** — `TAXIWAY_EXTRA_PAD = 2m` added to taxiway-only capsule sizing (`min(width,length)/2 + innerPadding(1.5) + 2`). 12m taxiway flat band now 9.5m (was 7.5m); 3.5m margin beyond paint half-width. Runway/apron capsule sizing unchanged.

### Tier 4 design memo (Round 4, 1 PR)
- **PR #134 `continuous-contact-contract-memo`** — `docs/rearch/CONTINUOUS_CONTACT_CONTRACT.md` (~2200 words, 8 sections + symptom/rule/PR mapping appendix). Proposes `ContactSweepRegistry` BVH unifying airframe + NPC LOD + prop placement contact discipline so the four symptom classes treated this cycle cannot re-emerge. Awaits human review before opening an implementation cycle.

### Orchestrator-level chores (post-Round-3)
- `chore(assets): regenerate OF heightmaps + navmesh after airfield envelope changes` (commit 614dc76, master direct) — terrain-nav-reviewer flagged that PR #132 + #133 mutate stamp geometry that flows through `prebake-navmesh.ts` for OF. Re-baked all five OF seeds (42/137/2718/31415/65537); ZC and TDM bakes were also re-run but produced no diff.
- `chore(cycle-2026-04-22): capture Round 0 baselines` (commit c556e34, master direct) — orchestrator-prep step from the cycle plan.

### Perf
combat120 baseline → post-Round-3:
- avg: 13.91 → 14.21 ms (+2.2%)
- p99: 33.60 → 34.50 ms (+2.7%) — within 5% budget
- max: 46.80 → 52.10 ms (+11.3%, a single 52.1ms outlier; hitch_50ms = 0.03% = 2 frames)
- heap_growth: 9.5 → 53.2 MB ⚠️ heap_recovery_ratio: 0.88 → 0.12 — the validation `overall: fail` is from heap recovery, not frame time. Cycle policy explicitly only gates on p99; heap is flagged for morning review.

### Follow-ups for next cycle
- Heap-recovery regression in combat120: 53MB end-growth and 12% peak recovery (was 9MB / 88%). Could be NPC stalls + AI budget starvation events (4.07 avg/sample) or one of the Round 1-3 changes.
- HelicopterModel.ts:549 has the same raw-vs-interpolated PlayerController feed as PR #124 fixed for fixed-wing.
- A-1 Skyraider altitude-hold recapture regresses at cruise throttle under PR #126; brief explicitly forbade gain retuning. Future task should expand `±0.15` elevator clamp.
- AC-47 low-pitch takeoff still single-bounces (carried over from cycle-2026-04-21).
- "Playtest recommended" (per executor reports): `airframe-directional-fallback` would benefit from a manual A-1 / F-4 / AC-47 takeoff trace before relying on the change in production scenarios.

### Cycle metrics
- 13/13 tasks merged. 0 blocked, 0 rolled back.
- 1 manual rebase (PR #131 vs PRs #130 + #132).
- 1 orchestrator-level cleanup (PR #129 commit/push).
- Reviewers: combat-reviewer on PR #122 (merge); terrain-nav-reviewer on PRs #131/#132 (merge, regen flagged).
- Wallclock: ~02:25 (Round 0 baseline) → ~02:42 ET (Round 4 merge), single overnight session.

## Recently Completed (cycle-2026-04-21-atmosphere-polish-and-fixes, 2026-04-20)

Sixteen merged PRs across five dispatch rounds — the full planned cycle landed without rollback. Briefs archived under `docs/tasks/archive/cycle-2026-04-21-atmosphere-polish-and-fixes/`. Cycle ran in a single ~3h30m orchestrated burst.

### Atmosphere polish
- **PR #107 `post-tone-mapping-aces`** — ACES filmic tone-map inserted in the `PostProcessingManager` blit fragment shader before the 24-level quantize + Bayer dither. Warm dawn/dusk/golden-hour hues no longer clip to white; retro stipple aesthetic preserved. 4 ship-gate PNGs committed.
- **PR #115 `fog-density-rebalance`** — per-scenario `fogDensity` moved into `AtmospherePreset`; `WeatherSystem.refreshAtmosphereBaseline()` added so storm/rain modulators track the new preset baseline. Five framings show haze depth instead of white-out.
- **PR #109 `vegetation-alpha-edge-fix`** — raised `alphaTest` in billboard fragment shader to 0.25 and scaled the fog mix by `texColor.a` to kill the halo under premultiplied-alpha output. Diagnostic confirmed the asset pipeline was already clean; the artefact was runtime-material.
- **PR #111 `vegetation-fog-and-lighting-parity`** — added `sunColor`/`skyColor`/`groundColor`/`lightingEnabled` uniforms to the vegetation `RawShaderMaterial` and drove them from the atmosphere snapshot each frame. Foliage now tracks TOD/weather the same way terrain does.
- **PR #113 `atmosphere-day-night-cycle`** — new optional `AtmosphereTodCycle` preset block; ashau/openfrontier/tdm/zc cycle over 600s real time, combat120 stays static. `HosekWilkieSkyBackend` gates LUT re-bake on 0.5° sun delta for cheap updates. `getSunDirection()` / `getSunColor()` signatures preserved for the cloud task.
- **PR #108 `skybox-cutover-no-fallbacks`** — deleted `Skybox.ts`, `NullSkyBackend.ts`, and `skybox.png`. `AtmosphereSystem` constructor now instantiates `HosekWilkieSkyBackend` directly with a combat120 bootstrap preset. Tests rewritten as behavior assertions. Net -245 lines.
- **PR #119 `cloud-runtime-implementation`** — new `CloudLayer` horizontal plane at `terrainY + 1200m` AGL with procedural fbm shader; sun-lit underbelly; world-space UV so clouds drift overhead on player motion; edge-on alpha-fade within ±100m of base. Per-scenario `cloudCoverageDefault`; `WeatherAtmosphere` lerps coverage on STORM/HEAVY_RAIN/LIGHT_RAIN; `ICloudRuntime` getters/setters now return real values.

### Airfield / aircraft foundation
- **PR #112 `airfield-terrain-flattening`** — discovered airfields are hand-authored (not procedural), so added an extended flattening envelope stamp per airfield with graded shoulder covering dispersal + perimeter, plus dev-time warning when authored vertical span exceeds threshold.
- **PR #117 `airfield-aircraft-orientation`** — parking yaws computed at spawn time from the first non-coincident taxi-route waypoint (`points[0]` is the stand itself, so the hypothesis needed an eps-0.5m offset). Behaviour test covers main_airbase + forward strip.
- **PR #106 `aircraft-a1-spawn-regression`** — removed the `npcAutoFlight: { kind: 'ferry' }` field from the A-1 Skyraider parking spot; A-1 stays parked and claimable by the player. Regression test pins the "no auto-departure" invariant for all three main_airbase aircraft.
- **PR #116 `aircraft-simulation-culling`** — new `shouldSimulateAirVehicle()` helper; `FixedWingModel.update()` gates `airframe.step()` and NPC pilot tick on camera distance + hysteresis for parked + unpiloted airborne aircraft. Player-piloted and airborne-NPC continue to simulate. Velocity zeroed on cull transition so resume state is valid.
- **PR #120 `aircraft-ground-physics-tuning`** — post-liftoff ground-clamp oscillation fixed via composite of three candidates: `liftoffClearanceM` 0.2→0.5, 10-tick sustained-descent latch before re-clamp, liftoff impulse bumped 3.0→4.5 m/s. A-1/F-4 bounce-free; AC-47 low-pitch takeoff still single-bounces (aerodynamic authority floor, out of scope).

### Content + harness
- **PR #110 `ashau-dem-streaming-fix`** — hardened the DEM loader in `ModeStartupPreparer` to reject HTML/empty/wrong-size payloads and fail loudly when the runtime DEM is absent. Path tightened to leading-slash absolute form. The 2026-04-21 deploy validation later confirmed fresh GitHub deploys need a real asset-delivery pipeline for the primary A Shau runtime files.
- **PR #114 `npc-and-player-leap-fix`** — two independent root causes: `CombatantRenderInterpolator` gained a separate vertical-velocity clamp lower than the horizontal cap (absorbs the +50m catch-up when LOD promotes a distant-culled combatant that was parked at `DISTANT_CULLED_DEFAULT_Y=3m`); `PlayerMovement` grounded clamp got a rate-limit so walking into a parked-aircraft bbox or cliff seam no longer launches the camera.
- **PR #118 `harness-ashau-objective-cycling-fix`** — extracted `pickObjectiveZone` pure helper from `scripts/perf-active-driver.cjs`; lexicographic sort (priority class → distance) replaces the old "hand back the same captured zone" path. Eight behavior tests pin the regression.
- **PR #121 `perf-baseline-refresh`** — all four scenarios rebaselined against the cycle end-state. Memo at `docs/rearch/perf-baselines-refresh-2026-04-20.md` documents measured values, threshold formula (pass = measured × 1.15, warn = measured × 1.30), and explicit loosen/tighten deltas vs the stale 2026-03-06 baseline. Frontier30m reached victory condition at ~879s (Open Frontier); 437 samples covered the dynamic-combat portion.

### Cycle mechanics
- Two rebases resolved in-orchestrator (not re-dispatched): PR #115 against #113 (both touched `ScenarioAtmospherePresets` / `AtmosphereSystem`) and PR #119 against #115/#113/#120 (preset + system + weather overlap). Both were mechanical union-merges of additive fields; local typecheck validated before force-push.
- Reviewer agents (combat-reviewer on #114, terrain-nav-reviewer on #112) read the local master worktree rather than the PR branch and reported false negatives for "file doesn't show the described change." Diff on the PR itself confirmed changes were present; merged anyway. Worth wiring the reviewer to `git diff origin/<branch>` directly in future cycles.
- All five rounds dispatched sequentially; no hard-stops triggered (no fence-change proposals, no perf regressions > 5% p99, no > 2-red rounds). Worktree branch cleanup fails cosmetically because each worktree still references its branch — benign.

### Follow-ups filed (new briefs to consider next cycle)
- A Shau DEM distribution (CI + fresh clone): move the primary 21 MB runtime binary and rivers JSON to the Cloudflare R2 manifest pipeline in `docs/CLOUDFLARE_STACK.md`. Do not rely on local-only `public/data/vietnam/` files in GitHub deploys.
- `frontier30m` harness soak currently hits Open Frontier victory at ~15min and stops producing capture samples for the remaining half of the window. `harness-match-end-skip-ai-sandbox` (cycle-2026-04-20) only covers ai_sandbox; extend to open_frontier or revise the soak to a non-terminal mode.
- Screenshot evidence committed by the executors for tasks that need live `npm run dev` (cloud-runtime, aircraft-simulation-culling, several atmosphere shots) is incomplete — marked as playtest deliverables. Human playtest pass queued.
- Reviewer agents should read the PR diff directly, not the local worktree.
- AC-47 low-pitch takeoff single-bounce is an aerodynamic authority issue, not a ground-clamp one. File `aircraft-low-pitch-authority-tuning` if it becomes a gameplay blocker.

## Recently Completed (cycle-2026-04-20-atmosphere-foundation, 2026-04-20)

Nine merged PRs (atmosphere stack v1 + Round-1 polish + close-out fix). One task deferred. Briefs archived under `docs/tasks/archive/cycle-2026-04-20-atmosphere-foundation/`. Cycle ran in a single ~5-hour orchestrated burst.

- **PR #97 `atmosphere-interface-fence`** — added `ISkyRuntime` + `ICloudRuntime` to `SystemInterfaces.ts`; stood up `AtmosphereSystem` shell with `NullSkyBackend`. Architectural seam for the rest of the atmosphere stack. Fence ADDITION, not modification.
- **PR #98 `bot-pathing-pit-and-steep-uphill`** — driver-only heuristics: `shouldAdvanceWaypoint` (3D proximity), `isSteepClimbWaypoint`, `shouldFastReplan` (suppress fast re-plan during climb), `detectPitTrap`. 21 new behavior tests. **Playtest recommended** — fix follows hypothesis exactly but couldn't be live-tested from worktree.
- **PR #99 `harness-lifecycle-halt-on-match-end`** — perf capture finalizes ~2s after engine reports match end. Used `TicketSystem.getGameState()` instead of adding to fenced interface. Introduced regression: `detectMatchEnded` fired immediately for `ai_sandbox` mode (no win condition); fixed in PR #105.
- **PR #100 `harness-stats-accuracy-damage-wiring`** — accuracy / damage-dealt / damage-taken / kills / state histogram now in `summary.json` under `harnessDriverFinal`. Bot-state snapshot field name aliased for backward compat. Budget overshoot (+261 LOC vs ≤150) accepted: most was type defs + behavior tests.
- **PR #101 `post-bayer-dither`** — 4×4 Bayer ordered-dither offset before the 24-level color quantize in `PostProcessingManager`. Banding visibly broken into retro stipple pattern; aesthetic preserved. Screenshots committed.
- **PR #102 `atmosphere-hosek-wilkie-sky`** — analytic Hosek-Wilkie-shaped sky dome (Preetham fallback per brief allowance). `HosekWilkieSkyBackend` with CPU LUT + per-scenario `ScenarioAtmospherePresets`. Replaces the legacy `Skybox` PNG load gated behind `AtmosphereSystem.ownsSkyDome()`. Budget overshoot (657 vs ≤500 LOC) accepted (CPU LUT + Preetham math required).
- **PR #103 `atmosphere-fog-tinted-by-sky`** — `AtmosphereSystem.applyFogColor` writes per-frame sky-driven fog color into `THREE.FogExp2`. New `FogTintIntentReceiver` interface for `WeatherAtmosphere` to forward storm-darken + underwater-override intent. Horizon seam visibly gone in `combat120-noon` ship-gate capture.
- **PR #104 `atmosphere-sun-hemisphere-coupling`** — `moonLight` no longer `freezeTransform`'d; per-frame position + color from `AtmosphereSystem.getSunDirection/getSunColor`. Hemisphere sky/ground colors track zenith/horizon. `WaterSystem.sun` finally has a real source. Shadow frustum follows player when target set.
- **PR #105 `harness-match-end-skip-ai-sandbox`** — close-out fix: gate `detectMatchEnded` on mode (skip `ai_sandbox`); emit `matchEndedAtMs` undefined when unset (latent perf-capture.ts `Number(null) === 0` bug masked). Live combat120 capture validation now passes.

### Deferred to cycle-2026-04-21

- **`perf-baseline-refresh`** — first attempt hard-stopped on PR #99's match-end regression (fixed by #105). Second attempt hard-stopped on two grounds: (a) `ashau:short` capture had `movementTransitions=0`, `waypointReplanFailures=200`, `harness_min_shots_fired=0` (bot dormant — DEM didn't load + objective-cycling loop), (b) measured `combat120 p95` was +41.8% and `openfrontier:short p95` was +132.6% over stale baseline (mostly because the new harness actually drives combat vs. the dormant baseline; needs disentangling, not a blind re-bake). Carries forward.

### Cycle-specific harness additions

- New per-task screenshot-evidence gate: every visible-change task brief includes a "Screenshot evidence (required for merge)" section; orchestrator (main session) reviews PNGs via Read-tool before merge. Tracked in `docs/cycles/cycle-2026-04-20-atmosphere-foundation/screenshots/<slug>/` with `_master/` (pre-cycle baselines) and `_orchestrator/<checkpoint>/` (between-round combo captures).

### Visible state at cycle close (orchestrator playtest 2026-04-20)

- ✅ Sky-fog seam gone in `combat120-noon` ship-gate.
- ✅ Per-scenario sky gradient differentiation visible at zenith.
- ❌ Per-preset TOD warmth (dawn / dusk) does NOT visually read — post-process clips bright sun-direction in-scattering to white. Math correct, visual blocked by 24-level quantize without tone-mapping. Brief `post-tone-mapping-aces` queued.
- ❌ Distant terrain reads near-white through fog (fog density was tuned for the old constant fog color). Brief `fog-density-rebalance` queued.
- ❌ Vegetation has white/blue alpha-edge outlines (was hidden by old dark fog). Brief `vegetation-alpha-edge-fix` queued.
- ❌ Vegetation lights/fogs differently from terrain (likely separate material path). Brief `vegetation-fog-and-lighting-parity` queued.
- ❌ NPCs and harness-driven player visibly "leap into the air." `CombatantRenderInterpolator` exists but symptom persists — root cause may be upstream (terrain-not-streamed Y jumps) or interpolator vertical clamp too permissive. Brief `npc-and-player-leap-fix` queued.
- ❌ `ashau:short` terrain renders flat — DEM file is present at `public/data/vietnam/big-map/a-shau-z14-9x9.f32` but loader fails (`RangeError: byte length should be a multiple of 4`). Brief `ashau-dem-streaming-fix` queued.
- ❌ Ashau bot loops between captured zone and itself (stuck-recovery teleports onto already-owned zone). Brief `harness-ashau-objective-cycling-fix` queued.
- ❌ Aircraft systemic regressions (multi-cycle): A-1 missing on runway, all aircraft only take off via hill-launch, runway has random bumps, taxiways orientation off, foundations over cliffs. Split into 4 briefs: `airfield-terrain-flattening`, `airfield-aircraft-orientation`, `aircraft-ground-physics-tuning`, `aircraft-a1-spawn-regression`.
- 📋 Day/night cycle requested (currently static per-scenario per design). Brief `atmosphere-day-night-cycle` queued.
- 📋 No clouds (ICloudRuntime is a stub). User wants clouds with flight-aware cloud base. Brief `cloud-runtime-implementation` queued.
- 📋 Legacy fallbacks still present: `Skybox.ts`, `NullSkyBackend.ts`, `skybox.png`. User preference: no fallbacks. Brief `skybox-cutover-no-fallbacks` queued.

### Lessons (codified)

- Append-only multi-PR conflict resolution within the orchestrator (instead of round-tripping to executors) is workable when the diffs are mechanical. Used 3× in this cycle.
- Pre-cycle prod deploy stale. Recommend deploying current master before user playtest so observations are against the same code the executors built on.
- Static-preset atmosphere model exposed the post-process clamp problem — visible only AFTER the upstream stack landed. Tone-mapping should have shipped alongside the analytic sky, not behind it.

## Recently Completed (cycle-2026-04-18-harness-flight-combat, 2026-04-18 → 2026-04-19)

Seven merged PRs, two rounds abandoned pre-merge, one round replaced mid-cycle. Briefs archived under `docs/tasks/archive/cycle-2026-04-18-harness-flight-combat/`.

- **PR #86 `b1-flight-cutover`** — deleted the `FixedWingPhysics` shim; 5 callers now consume `Airframe` directly.
- **PR #87 `utility-ai-doctrine-expansion`** — per-faction response curves + reposition/hold actions; closed the RETREATING orphan state.
- **PR #88 `perf-harness-architecture`** — declarative scenario runner. **Reverted by PR #89** after live playtest showed the policy didn't drive the player toward enemies.
- **PR #90 `perf-harness-redesign`** — 4-layer imperative terrain-aware driver with LOS gate and per-mode validators. Replaced the reverted declarative runner.
- **PR #91 `heap-regression-investigation`** — pooled utility-AI per-tick allocations; killed the +296% combat120 heap growth from the prior cycle.
- **PR #92 `npc-fixed-wing-pilot-ai`** — NPC fixed-wing pilot state machine + airfield integration. First live consumer of the post-cutover `Airframe` surface.
- **PR #93 `perf-harness-killbot`** — rule-only NSRL-style killbot driver with navmesh + pure-pursuit. Superseded later in the cycle by the state-machine bot.
- **PR #94 `perf-harness-verticality-and-sizing`** — NPC speed cap, player eye-height raise (2→2.2), NPC billboard shrink (5×7→3.2×4.5), exported `PLAYER_MAX_CLIMB_ANGLE_RAD`, path-trust invariant.
- **PR #95 `perf-harness-player-bot`** — state-machine bot (PlayerBotIntent + controller) mirroring NPCFixedWingPilot. **Shipped a behavior regression** (retreats on damage, hits=0 in live playtest) fixed by PR #96.
- **PR #96 `perf-harness-player-bot-aim-fix`** — root-caused the PR #95 regression to a yaw-convention bug (`atan2(dx, -dz)` in a Three.js world where `forward = (-sin(yaw), 0, -cos(yaw))`). Switched aim path to `camera.lookAt()` matching the rest of the codebase. Wired the dormant `evaluateFireDecision` aim-dot gate. Stripped SEEK_COVER + RETREAT. Combat120 smoke: `shots=420, hits=221, 52.6% hit rate`. User confirmed live playtest: bot reached victory.

### Abandoned rounds

- `perf-openfrontier-navmesh-fix` (narrow navmesh-null bug investigation) — killed mid-run after deeper architectural gap surfaced.
- `perf-harness-player-bot-aggressive` (defensive-state strip) — killed mid-run after executor's own smoke revealed the deeper aim convention bug.
- `perf-baseline-refresh` Round 3, 5, 8 attempts — Round 3 stopped on openfrontier validator fail (killbot artifact), Round 5 stopped because the bot was retreating, Round 8 died on a transient 500 API error before producing captures. Baseline refresh carries into next cycle.

### Follow-ups filed (new briefs under `docs/tasks/`)

- `perf-baseline-refresh` (P0) — carried forward.
- `harness-lifecycle-halt-on-match-end` (P1) — harness kept running past in-game victory screen during PR #96 playtest.
- `bot-pathing-pit-and-steep-uphill` (P1) — bot over-paths on steep direct-uphill-to-objective, and gets trapped in pit geometry.
- `harness-stats-accuracy-damage-wiring` (P2) — accuracy / damage-dealt / damage-taken / kills not surfaced in `summary.json`; state histogram disconnect between `harnessDriver.getDebugSnapshot().botState` and `perf-capture.ts`'s `movementState` read.

### Lessons (codified)

- `memory/feedback_harness_reuses_npc_primitives.md` — reference NPC primitives (LOS, targeting, navmesh), but do NOT inherit NPC cautiousness (SEEK_COVER, RETREAT). Harness bot plays like a focused human, not a cautious AI soldier.
- Hand-rolled yaw math for camera-pointing is fragile; match the codebase's existing `camera.lookAt()` pattern (used by `PlayerCamera`, `DeathCamSystem`, `MortarCamera`, `SpectatorCamera`, `flightTestScene`, old killbot).
- Wire `evaluateFireDecision`-style aim-dot gates into fire paths; they catch entire classes of future convention regressions automatically.

## Cycle conventions (2026-04-18)

Phase-letter task IDs (A/B/C/D/E/F) are retired. Every cycle starts from
the "Current cycle" stub in
[AGENT_ORCHESTRATION.md](AGENT_ORCHESTRATION.md), uses descriptive slugs
for task IDs (`plane-test-harness`, not `A1`), and identifies itself with
a dated slug: `cycle-YYYY-MM-DD-<slug>`. Closed-cycle briefs live under
`docs/tasks/archive/<cycle-id>/`. See the "Cycle lifecycle" section of
the runbook for the end-of-cycle ritual.


## P0 - Performance Blockers

- [x] Investigate fixed-wing flight feel before adding more vehicles: stiff
  controls, altitude bounce/porpoise after climb, visual shake at speed, and
  whether fixed-wing render/camera interpolation should mirror the helicopter
  interpolation path. Initial evidence pointed at raw fixed-wing pose exposure
  to render/camera consumers.
- [x] Implement the first fixed-wing feel fix set: Airframe interpolated pose,
  FixedWingModel visual-pose rendering/queries, and elapsed-time fixed-wing
  camera/look/FOV smoothing. `npm run probe:fixed-wing` passes; human playtest
  remains the feel gate.
- [ ] Re-run the human playtest checklist after fixed-wing feel changes. Passing
  `npm run probe:fixed-wing` is required evidence, but it is not a feel sign-off.
- [ ] Reduce initial JS bundle. Recent production builds still emit large
  chunks (`index`, `three`, and `ui` all above the desired startup footprint).
- [x] Fix `frontier30m` soak semantics. The script now passes
  `--match-duration 3600 --disable-victory true`, which applies perf-only
  Open Frontier lifecycle overrides and keeps the 30-minute capture
  non-terminal. The 2026-04-20 baseline still predates this fix.
- [x] Remove build-time `.gz`/`.br` sidecar generation from Vite. Cloudflare
  handles visitor-facing compression for Pages assets, so the deploy upload no
  longer carries redundant precompressed files.
- [ ] Keep refreshed perf baselines current after stabilization work. The
  2026-04-20 refresh is valid for the post-atmosphere cycle, but Node/runtime
  alignment must be settled before treating future comparisons as apples to
  apples.

## P0 - Repo truth and validation

- [x] Align Node/toolchain truth across `.nvmrc`, CI, docs, and perf evidence.
- [x] Repair stale local diagnostic URL assumptions and keep probes on the
  current Vite root route.
- [x] Restore `scripts/fixed-wing-runtime-probe.ts` as a maintained browser
  validation gate.
- [x] Refresh stale docs after the atmosphere/cloud/airfield/perf cycle.
- [x] Triage and clean `npm run deadcode`.
- [x] Harden deploy freshness by splitting Vite output to `/build-assets/`,
  revalidating stable public assets and GLBs, and bumping the service worker
  cache to drop stale `titj-v1` entries.
- [x] Clean locked nested worktrees and stale task branches after confirming
  they contain no unmerged work.

## P0 - Deploy freshness and asset delivery

- [x] After the 2026-04-21 manual Cloudflare deploy, verify live headers for `/`,
  `/sw.js`, `/build-assets/*`, `/assets/*`, `/models/*`, navmesh, heightmaps,
  and A Shau JSON using `docs/DEPLOY_WORKFLOW.md`. This caught a real deploy
  gap: A Shau runtime data is local-only/gitignored, so live
  `/data/vietnam/a-shau-rivers.json` returned the SPA HTML shell.
- [x] Stand up the first Cloudflare-native asset delivery path in
  `docs/CLOUDFLARE_STACK.md`: prod/preview R2 buckets, CORS, temporary public
  `r2.dev` endpoint, immutable content-addressed A Shau DEM/rivers objects,
  generated `asset-manifest.json`, R2 manifest uploads, runtime DEM manifest
  resolution, and deploy-workflow upload validation before Pages deploy.
- [ ] Replace the temporary R2 `r2.dev` endpoint with a custom asset domain,
  then rerun live Pages + R2 header validation after the next manual deploy.
- [ ] Add a cross-browser live fresh-load gate for Chrome/Edge and Firefox,
  with a manual Safari/iOS check when service worker or GLB paths change.
- [ ] Move GLBs into the same content-addressed manifest pipeline after terrain
  delivery is stable, so model files can become immutable without risking stale
  in-place updates.

## P1 - Gameplay (carry-forward)

- [x] Expand browser-level aircraft validation beyond takeoff into climb and
  short-final approach setup for A-1, F-4, and AC-47.
- [x] Expand browser-level aircraft validation into AC-47 player orbit hold.
- [x] Expand browser-level aircraft validation into player/NPC fixed-wing
  handoff states.
- [x] Branch-local: update player/NPC fixed-wing handoff validation to use the
  real keyboard exit path through `VehicleSessionController`.
- [ ] Expand and validate live NPC fixed-wing missions beyond the current `FixedWingModel.attachNPCPilot()` / world-feature / air-support path.
- [ ] NPC helicopter transport missions (takeoff, fly to LZ, deploy, RTB).
- [ ] Ground vehicles (M151 jeep first - GLB exists, need driving runtime).
- [ ] Weapon sound variants (2-3 per weapon type) + impact/body/headshot sounds.
- [ ] Stationary weapons (M2 .50 cal emplacements, NPC manning).
- [ ] Faction AI doctrines - keep expanding the `FACTION_COMBAT_TUNING` lookup with stance/engagement/retreat parameters.

## P2 - Content & Polish (carry-forward)

- [ ] Vegetation billboard remakes.
- [ ] Terrain texture improvements.
- [ ] Road network generation (splines, intersections, pathfinding).
- [ ] Wire additional DEM maps as game modes (Ia Drang, Khe Sanh).
- [ ] Music/soundtrack.
- [ ] Re-capture `openfrontier:short` after the 2026-04-02 air-vehicle batching + visibility pass and decide whether aircraft/helicopter far-LOD meshes are still needed.

## P3 - Architecture

- [ ] Terrain contract cleanup: remove stale chunk-era config names, debug labels
- [ ] Decide: remaining connector bursts -> constructor/runtime dependency objects vs grouped setters
- [ ] Split tracked tick groups into smaller declared groups where cadence can differ safely
- [ ] Move more world/strategy/passive-UI work behind scheduler contracts
- [ ] Continue identifying deploy-only UI/runtime that can defer without touching menu path

## Far Horizon

- Hydrology system / water engine (river system, swimming, depth rendering, watercraft physics)
- Watercraft (PBR, sampan - GLBs exist, blocked on water engine)
- Multiplayer/networking
- Destructible structures
- Survival/roguelite mode
- Campaign system
- Theater-scale maps (tiled DEM)
- ECS evaluation for combat entities (see `docs/rearch/E1-ecs-evaluation.md` on `spike/E1-ecs` - deferred)

## Research references (external repos worth cloning into `examples/` for pattern study)

- **prose.md + peer prose-format repos** — clone into `examples/prose-main/` (gitignored) for reference on how they structure declarative runtime configs, policy/plugin registration, and orchestration/execution patterns. Findings inform the queued `perf-harness-architecture` brief and future multi-agent cycles. Write notes to `docs/rearch/prose-research.md` if patterns generalize.

## Known Issues (flagged, deferred)

1. **Orphan `IDLE` AI state.** `CombatantState.RETREATING` now has `AIStateRetreat`; `IDLE` still exists mainly for fixtures / respawn edges and can still fall through if left live at tick time.
2. **Duplicate squad-suppression mutation paths.** `AIFlankingSystem`, `AIStateEngage.initiateSquadSuppression`, and `applySquadCommandOverride` are three parallel paths that can mutate squad command state. Consolidation deferred to Phase F utility-AI design (E3 memo).
3. **Vehicle session recovery is implemented, but not human-signed-off.** `VehicleSessionController` removes the known split session authority, but human aircraft enter/exit playtest still needs to happen before it is treated as closed.
4. **Fixed-wing feel is not yet human-signed off.** Cycle 2 now has a first-pass interpolation/camera smoothing patch for the reported stiff controls, altitude bounce/porpoise perception, visible screen shake at speed, plus an AC-47 orbit-hold sign fix. `npm run probe:fixed-wing` passes for A-1, F-4, and AC-47, but a human still needs to run the playtest checklist before more vehicle types are added.
5. **Pointer lock has an embedded-browser fallback, but usability is not playtest-signed.** `PlayerInput` and `GameEngineInput` now share the `document.body` lock target, and `pointerlockerror` activates an unlocked mouse-look fallback. A normal browser remains the cleanest FPS playtest path until the fallback is human-verified.
6. **Airfield height authority is partially repaired, not fully unified.** Branch-local terrain stamps now share one generated airfield datum on sloped sites, covering the obvious runway/taxi/apron mismatch. `WorldFeatureSystem`, `FixedWingModel`, terrain queries, collision, and probes still need a Cycle 6 terrain/collision runtime owner so staging and gameplay cannot drift again.
7. **Helicopter rotor lifecycle has a stopped/spool-down fix, but no high-RPM blur sign-off.** Engine active/stopped state now lets exited helicopters stop at `engineRPM = 0`, and animation speed was raised. Human playtest decides whether the GLB pivots, authored nodes, or missing blurred-disc representation are the next limitation.
8. **Atmosphere v1 can hide playtest evidence.** Cycle 9 now has comparison
   captures for all five modes and reduced fog density. Visible clouds now come
   from the sky-dome pass, and the old `CloudLayer` plane is hidden so it cannot
   create the hard horizon divider / "one tile" artifact. A Shau now has
   DEM-backed screenshots, disabled water state, and no browser errors in the
   latest atmosphere run. The artifact now records representative-base
   snap/connectivity/path success, but route/NPC movement quality remains a
   Cycle 10 blocker because the representative gate is not the same as a live
   movement sign-off. The earlier disconnected-home-base warning stopped after
   A Shau terrain-flow shoulders were enabled.
9. **NPC route-follow quality is not signed off.** Infantry is now slower and nearby render Y is grounded, but long-range `CombatantMovement` navmesh route guidance is still disabled pending validation. If NPCs still surge, climb badly, or hover after this pass, investigate LOD/update cadence and navmesh route following rather than raising movement speeds again.
10. **Live production freshness is a recurring release gate.** The 2026-04-26 Pixel Forge cutover release was manually deployed, header-checked, and live-smoked at commit `c70d6d74f689b99ae97513e842b40248923c62c2`, so the current `/build-assets/`, `/models/*`, Pixel Forge NPC/vegetation public assets, and service-worker behavior are live. Repeat the manifest/header/live-smoke check after every push intended for player testing.
11. **Cycle 3 scheduler recovery has a first pass, not a full declarative scheduler migration.** `SystemUpdateSchedule` now removes the duplicate tracked-system exclusion authority from `SystemUpdater`, but the broader manual phase order is still preserved until a future parity-backed migration.
12. **Cycle 4 UI/input boundary has a first pass, not human sign-off.** Touch vehicle controls now derive from presentation `VehicleUIContext`, but the final human playtest still needs to confirm touch/mobile aircraft exit and pointer-lock fallback usability.
13. **Cycle 5 combat spatial ownership has a first pass, not full data-store recovery.** `CombatantLODManager` now receives the spatial grid from `CombatantSystem` instead of importing the singleton directly, but combat hot state is still an object map and scale/perf sign-off still needs combat scenario and perf-tail validation.
14. **Cycle 6 terrain/collision authority has a first pass, not full terrain-collision runtime unification.** Helicopter squad deploy and navmesh generation now use runtime terrain, but `WorldFeatureSystem` still has a direct `LOSAccelerator` static-obstacle hook and `PlayerMovement` still has a no-runtime fallback to `HeightQueryCache`.
15. **Cycle 7 harness productization has a first pass, not final diagnostic API design.** Fixed-wing probe summaries are now incremental, but broad `window.__engine` access still needs a deliberate diagnostic API decision before the harness is considered productized.
16. **2026-05-02 combat120 perf confidence is not clean.** The stabilization
   run passed `doctor`, `validate:fast`, `build`, `smoke:prod`,
   `check:mobile-ui`, `probe:fixed-wing`, and `evidence:atmosphere`, but
   `validate:full` failed inside `perf:capture:combat120` with avg/p99 at
   100.00ms, 100% of frames over 50ms, and Combat over budget in 100% of
   samples. Because the branch is docs/ops-only and the capture had `0`
   browser/page errors, treat this as a quiet-machine rerun and perf-triage
   item before any baseline refresh.
17. **Projekt Objekt-143 KB-TERRAIN has before evidence, not a fix.** The
   fresh-build baseline at
   `artifacts/perf/2026-05-04T00-02-01-922Z/projekt-143-terrain-horizon-baseline/summary.json`
   captures elevated Open Frontier/A Shau horizon screenshots and linked
   perf-before guardrails. A far-canopy or distance-policy branch is now
   ready to start, but it still needs matched after screenshots plus Open
   Frontier/A Shau p95 and draw-call deltas before closure.
18. **Projekt Objekt-143 KB-CULL still lacks an owner-path baseline.** The
   deterministic renderer/category proof is trusted, but the first actual
   culling/HLOD branch must choose one owner path and capture representative
   before/after renderer telemetry. Do not certify culling from static
   inventory or the proof screenshot alone.

## Known Bugs

1. Main production/perf chunks are still heavy (`index ~851kB`, `three ~734kB`, `ui ~449kB`) even though startup is stable. Precompressed sidecar generation has been removed, but real chunk splitting remains open.
2. `frontier30m` script semantics are fixed, but the tracked baseline still predates the non-terminal soak path. Refresh this only from a quiet-machine perf session.
3. Low-load grenade/explosion cold-start hitch is closed for the unlit pooled
   explosion path: render attribution pinned the trigger-adjacent long task to
   dynamic explosion `PointLight` churn, and the trusted follow-up probe has
   `0` trigger/post-trigger LoAFs, `0` long tasks, and detonation max `30.2ms`.
   Remaining grenade risk is stress-scene validation once the 120-NPC baseline
   is trustworthy, plus fresh evidence for any future explosion visual polish.
4. Branch-local vehicle exit UX fixes still need human confirmation:
   in-flight fixed-wing bailout now preserves altitude, and vehicle-session
   cleanup clears held input, but the final recovery playtest must confirm
   bailout feel and no stuck-forward infantry movement.

## Architecture Debt

1. SystemManager ceremony - adding a new system touches SystemInitializer + composers.
2. PlayerController setter methods (reduced after vehicle adapter refactor and `VehicleSessionController`; model/camera setters still duplicated).
3. Variable deltaTime physics (no fixed timestep for grenade/NPC/particle systems; player, helicopter, and fixed-wing use FixedStepRunner).
4. Mixed UI paradigms (~50 files with raw createElement alongside UIComponent + CSS Modules).

## Phase F Candidates (planning input from E memos)

E-track spike memos were kept on `spike/E*` branches and never merged. Pull each branch to read its memo.

- **Utility-AI combat layer.** Informed by D2's `FACTION_COMBAT_TUNING` lookup pattern. Memo: `docs/rearch/E3-combat-ai-evaluation.md` on `spike/E3-combat-ai-paradigm`.
- **Render-side position interpolation for LOD'd combatants.** Unblocks the hypersprint fix that F1 could not safely ship. Cross-references `CombatantLODManager.ts` dt amortization.
- **Agent/player API unification.** 1755-LOC driver potentially rewritable to ~150 LOC. Memo: `docs/rearch/E4-agent-player-api.md` on `spike/E4-agent-player-api`. Status: prototype-more.
- **Deterministic sim + seeded replay.** Proven in spike; ~200 non-determinism sources catalogued. Memo: `docs/rearch/E5-deterministic-sim.md` on `spike/E5-deterministic-sim`. Status: prototype-more.
- **Vehicle physics rebuild.** Airframe spike confirmed broader rebuild questions. The cross-vehicle flight mouse bleed it flagged was fixed in Cycle 1, but the rebuild remains prototype-more. Memo: `docs/rearch/E6-vehicle-physics-evaluation.md` on `spike/E6-vehicle-physics-rebuild`.
- **Rendering at scale.** E2 deferred overall. The old `maxInstances = 120` silent-drop it flagged has since been surfaced and the capacity raised, but true large-N behavior is still unproven. Memo: `docs/rearch/E2-rendering-evaluation.md` on `spike/E2-rendering-at-scale`.
- **ECS evaluation.** Deferred - bitECS came in ~0.97x at N=3000; V8 already inlines Vector3 shapes well enough. Memo: `docs/rearch/E1-ecs-evaluation.md` (also on master) and `spike/E1-ecs`.

## Recently Completed (cycle-2026-04-18-rebuild-foundation)

Nine commits on master between `9a0a53e` and `127f0a2`, seven merged PRs
plus an A2 root-cause followup and an A4 perf-driver revert. Briefs are
archived under `docs/tasks/archive/cycle-2026-04-18-rebuild-foundation/`
with letter prefixes dropped (slug convention).

- **plane-test-harness** (`5571be1`) — isolated `?mode=flight-test` scene
  plus L3 integration harness at
  `src/systems/vehicle/__tests__/fixedWing.integration.test.ts`. Single
  source of truth for fixed-wing flight validation going forward.
- **render-position-interpolation** (`a6a78b1`) — new
  `CombatantRenderInterpolator` splits logical vs rendered position for
  LOD'd combatants. Fixes NPC hypersprint teleport under LOD dt
  amortization without changing sim behavior.
- **render-interpolation-followup** (`9a0a53e`) — root-cause fix in
  `CombatantLODManager` culled-loop: `return` → `continue` so a
  mid-bucket early-out no longer drops every combatant behind it.
  Removed the defensive try/finally scaffolding that was masking the
  symptom.
- **rendering-at-scale** (`797b610`) — raised `CombatantMeshFactory`
  instance cap and surfaced overflow instead of silently dropping past
  120. Addresses the silent-drop listed under Known Issues.
- **agent-player-api** (`86517d9` + revert `82159c8`) — typed
  `AgentController` / `AgentAction` / `AgentObservation` primitive
  landed under `src/systems/agent/`. Accompanying rewrite of
  `scripts/perf-active-driver.js` introduced a direction-inversion
  regression in combat120 perf captures and was reverted to the
  pre-cycle 1755-LOC driver. The primitive itself stays and will be
  consumed by the next cycle's harness rebuild.
- **vehicle-physics-rebuild** (`3268908`) — unified `Airframe` module
  with swept collision and explicit raw/assist control laws, backing the
  A1 integration tests. `FixedWingPhysics` / `FixedWingControlLaw` /
  `FixedWingConfigs` kept as thin compat shims to avoid an 18+ caller
  cascade; full cutover queued as a follow-up. `FixedWingPlayerAdapter`
  not rewritten in this cycle.
- **utility-ai-combat-layer** (`af62b37`) — opt-in `UtilityScorer`
  pre-pass in `AIStateEngage.handleEngaging`, gated on
  `FACTION_COMBAT_TUNING[faction].useUtilityAI`. VC faction canary
  enabled; NVA / US / ARVN still run the existing state machine
  unchanged.
- **deterministic-sim-seeded-replay** (`127f0a2`) — `SeededRandom`
  (xoroshiro128++) plus `ReplayRecorder` / `ReplayPlayer`. A 30s replay
  converges byte-identical on tick-space input; open non-determinism
  sources catalogued in `docs/rearch/C2-determinism-open-sources.md`.
  Falls back to `Math.random()` when no replay session is active, so
  existing code paths are untouched.

### Historical follow-ups carried forward at cycle close (some later resolved in subsequent cycles)

- **Heap growth regression** on combat120 (~+296% vs baseline during the
  cycle) — investigate whether a specific round introduced it.
- **`perf-baselines.json` is stale.** p99=100ms in-file; reality is
  closer to 30ms. Refresh after the next cycle's harness rebuild so
  baselines reflect the new measurement methodology.
- **B1 full cutover.** Delete `FixedWingPhysics` /
  `FixedWingControlLaw` / `FixedWingConfigs`, rewrite
  `FixedWingPlayerAdapter`, fan out through the 18+ callers.
- **perf-harness-architecture** — brief already written at
  `docs/tasks/perf-harness-architecture.md`, staged for the next cycle.
  Replaces the keystroke-emulation active-driver with declarative
  scenario / policy / validator architecture on top of the
  `AgentController` primitive.

## Recently Completed (2026-04-17 drift-correction run)

Sixteen PRs merged across A/B/C/D tracks plus two F-track UI fixes. One PR (F1) was closed as obsolete-on-master.

- **B1** (#57) - wired player-as-attacker into NPC damage path. `CombatantCombat.ts` / `CombatantDamage.ts` now propagate a `_playerAttackerProxy` mirroring the existing `_playerTarget` pattern, so NPC suppression / panic / threat-bearing fires on player shots.
- **B2** (#63) - `scripts/perf-active-driver.js` dwell-timer fix.
- **B3** (#67) - `StuckDetector` escalation now tracks goal anchors independently of backtrack anchors, so the 4-attempt abandon path is reachable instead of being reset on every anchor flip.
- **A1-A5** (#66 / #62 / #64 / #65 / #68) - vehicle / nav / terrain / UI / combat test triage. Large deletions, no behavior change.
- **C1** (#61) - perf-build target via `VITE_PERF_HARNESS=1`; new `build:perf` / `preview:perf` scripts; `scripts/preview-server.ts` helper. Default perf-capture server mode is now `preview`.
- **C2** (#58) - `recast-navigation` WASM alias dedupe (`@recast-navigation/wasm` -> `@recast-navigation/wasm/wasm`). Saves ~212kB gzip across main and worker chunks.
- **C3** (#59) - new `docs/DEPLOY_WORKFLOW.md`; fixed a real Cloudflare Pages duplicate `Cache-Control` bug via `public/_headers`.
- **C4** (#60) - dev-server lifecycle hardening (port kill, explicit teardown, PID logging) around perf captures.
- **D1** (#69) - new `docs/COMBAT.md` documenting the combat subsystem. Concluded the combat tree is adequately bounded; no code refactor.
- **D2** (#74) - new `src/config/FactionCombatTuning.ts`. `FACTION_COMBAT_TUNING[faction]` lookup with per-faction `panicThreshold`, consumed in `AIStateEngage.handleEngaging`. First observable per-faction differentiation (VC panics sooner than NVA).
- **F2** (#70) + **F2b** (#73) - amber/jungle boot splash in `index.html`; residual blue eliminated from `src/core/LoadingUI.css` and `src/ui/loading/MissionBriefing.module.css`.

**Closed / shelved:** F1 (#71) was closed. Its dt clamp would have broken LOD amortization, and the speed-ceiling bypasses it targeted had already been fixed on master. The real hypersprint cause is logged under Known Issues above.

## Recently Completed (2026-04-06)

- [x] VehicleStateManager: single source of truth for player vehicle state with adapter pattern
- [x] Fixed-wing physics: ground stabilization, thrust speed gate, F-4 TWR correction, resetToGround on enter
- [x] Helicopter perf: door gunner restricted to piloted only, idle rotor animation skip
- [x] Vehicle control state decoupled from PlayerMovement (~550 lines removed)
