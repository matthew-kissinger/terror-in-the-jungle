# cycle-2026-04-23-debug-and-test-modes — Plan

**Cycle ID:** `cycle-2026-04-23-debug-and-test-modes`
**Opens:** 2026-04-23 (intended for a single autonomous session before the next intense human playtest).
**Shape:** 8 tasks across three rounds — a "cracked team" diagnostic toolkit + engine-reuse foundation.

## Why this cycle exists

The human is about to playtest intensely. The current diagnostic surface is thin: `F1-F4` gives four hand-wired overlays (`PerformanceOverlay`, `TimeIndicator`, `LogOverlay`, plus runtime stats); there is no registry, no live parameter tuning, no free-fly camera, no click-to-inspect, no time control, no world-overlay visualization, no screenshot capture workflow, and no standalone terrain editing surface. To drill into "why does this feel like that?" the player has to exit the game, edit source, rebuild, and re-enter. This cycle lands the full "observe, tune, drill, freeze, visualize, capture, generalize" stack in one autonomous pass so the playtest after it can actually diagnose issues instead of just surfacing them.

Secondary: the game is converging toward a reusable engine. A terrain-parameter sandbox + an engine-trajectory memo seed that path without committing to it.

## Tasks in this cycle

Each has a brief at `docs/tasks/<slug>.md`.

**Round 1 (2 parallel — foundation + research):**
- `debug-hud-registry` (P0) — registry + master toggle (backtick), migrate existing F1-F4 overlays, seed 4 new panels (vehicle-state, combat-state, current-mode, per-system frame-budget breakdown).
- `engine-trajectory-memo` (P2) — pure-research memo. Executor surveys current lib stack + architecture vs the 2026-04 Three.js + game-engine ecosystem; writes `docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md` with concrete recommendations for multi-location/multi-game reuse.

**Round 2 (3 parallel — diagnostic tools):**
- `live-tuning-panel` (P0) — Tweakpane-backed dev-only panel. Curated first-pass knobs for flight, atmosphere, and combat. localStorage persist + preset export.
- `free-fly-camera-and-entity-inspector` (P0) — Hold `V` to detach camera; click any entity to open Entity Inspector panel with full state tree (position, velocity, AI state, squad, orders, LOD tier, health, last-decision log).
- `time-control-overlay` (P1) — Pause / step-frame / slow-mo / fast-forward bound to the main-loop `deltaTime` multiplier. Keybinds: `Space` pause, `.` step, `,`/`;` slower/faster.

**Round 3 (3 parallel — observation + capture + engine-reuse):**
- `world-overlay-debugger` (P1) — Registry for 3D scene overlays with independent toggles. Seed overlays: navmesh wireframe, LOS rays (color-coded), squad-influence heatmap, combatant-LOD-tier tints, aircraft contact capsules, terrain chunk boundaries.
- `playtest-capture-overlay` (P1) — F9 captures `renderer.domElement.toBlob()` + annotation modal + **bundled live-tuning-panel state JSON**. Session-scoped to `artifacts/playtest/session-<ts>/`. `preserveDrawingBuffer: true` fix as Step 0.
- `terrain-param-sandbox` (P1) — New `?mode=terrain-sandbox`. Tweakpane noise/erosion/amplitude params. Live heightmap preview. Export button → heightmap PNG + `MapSeedRegistry`-compatible JSON. Engine-reuse groundwork.

## Round schedule

```
Round 0 (orchestrator prep)
  -> Round 1 (2 parallel: foundation + research)
      -> Round 2 (3 parallel: tuning + inspector + time control)
          -> Round 3 (3 parallel: overlays + capture + terrain sandbox)
```

R2 and R3 do NOT block on R1's registry in the strict sense — the panels registered by R2 and R3 will self-mount as a fallback if they complete before the registry, and migrate to the registry on next change. This preserves parallelism. R3 does benefit from `live-tuning-panel` shipping in R2 (`playtest-capture-overlay` bundles tuning state); that's a soft dependency that naturally falls out of the R2→R3 sequencing.

## Round 0 (orchestrator prep)

1. `git fetch origin && git status` (must be clean; fast-forward if behind).
2. Install `tweakpane` as a dependency: `npm install tweakpane` (or add to package.json + npm ci). Validate `npm run test:run` still green after install. This unblocks `live-tuning-panel` and `terrain-param-sandbox`.
3. Capture a fresh `npm run perf:capture:combat120` baseline at cycle-open HEAD. Commit summary + validation to `docs/cycles/cycle-2026-04-23-debug-and-test-modes/baseline/`. Prior cycle flagged the inherited baseline as an outlier; this cycle gates against its own fresh reference.

## Concurrency cap

3 (Round 1 uses 2; Round 2 uses 3; Round 3 uses 3).

## Dependencies

```
Round 0 (tweakpane install + fresh baseline)
  -> debug-hud-registry            ┐
  -> engine-trajectory-memo        ┘─ R1 parallel (disjoint)
       -> live-tuning-panel        ┐
       -> free-fly-cam + inspector ├─ R2 parallel (disjoint)
       -> time-control-overlay     ┘
            -> world-overlay-debugger      ┐
            -> playtest-capture-overlay    ├─ R3 parallel (disjoint)
            -> terrain-param-sandbox       ┘
```

## Playtest policy

DEFERRED. No playtest gate BLOCKS merge. Any playtest-recommended PRs are flagged in RESULT.md. The entire point of this cycle is to enable the *next* playtest, not to be gated on one.

## Perf policy

- **Baseline:** Round-0 fresh capture (`baseline/perf-baseline-combat120.json`).
- **Gate:** post-Round-3 `npm run perf:capture:combat120`. Two thresholds:
  - p99 within 5% of Round-0 baseline (standard rule).
  - `heap_recovery_ratio` ≥ 0.5 (standard rule).

The `preserveDrawingBuffer: true` change from `playtest-capture-overlay` is the most likely source of any regression; if p99 exceeds budget, the hard-stop path is to gate the flag behind `import.meta.env.DEV`.

## Failure handling (autonomous-safe)

- CI red on a task → mark `blocked`, record, continue.
- Fence-change proposal (`fence_change: yes`) → mark `blocked`, record, DO NOT merge.
- Probe-assertion fail post-merge → revert if possible; otherwise `rolled-back-pending` in RESULT.md.
- Perf regression > 5% p99 on `combat120` after any round → flag; do NOT revert automatically unless the gate is a hard failure per cycle policy.

## Visual checkpoints (orchestrator-gated)

NONE. Autonomous run.

## skip-confirm

YES. Orchestrator does NOT pause between rounds.

## Cycle-specific notes

- **Tweakpane lib add.** First-time add of a non-Three runtime library. Gate all Tweakpane imports behind `import.meta.env.DEV`; Vite dead-code-eliminates them in retail builds. Retail bundle cost: zero.
- **Needle DevTools Chrome extension.** Separate from code — install once locally for scene-graph inspection; auto-detects the Three.js scene with zero integration work. NOT an npm package; do NOT add `@needle-tools/*` to dependencies (their npm runtime forks three@0.145.4; we're on r184).
- **Combat-reviewer permissive for narrow accessors.** `debug-hud-registry` (combat-state panel) and `free-fly-camera-and-entity-inspector` (combatant drill-in) may each add ≤20 LOC of additive read-only accessors to `src/systems/combat/**`. That touches combat-reviewer scope — reviewer spawns, reads the diff, and merges. Do NOT expand beyond the 20-LOC additive-accessor budget without escalating.
- **Terrain sandbox is heightmap-gen-only this cycle.** Brush sculpting / zone placement / navmesh re-bake belongs in a dedicated future cycle once `terrain-param-sandbox` reveals what that tooling needs.
- **Airfield-sandbox-mode deferred.** The combat-mute toggle in `live-tuning-panel` covers most of the flight-feel iteration value; the instant-cockpit spawn is a small follow-up task after this cycle lands.

## Pre-flight acknowledgement

The prior cycle, `cycle-2026-04-22-heap-and-polish`, closed on 2026-04-22 with 4 merged PRs (#135–#138). See `docs/BACKLOG.md` "Recently Completed (cycle-2026-04-22-heap-and-polish, 2026-04-22)" and `docs/cycles/cycle-2026-04-22-heap-and-polish/RESULT.md`.

## Post-cycle ritual

Standard (per `docs/AGENT_ORCHESTRATION.md` "Cycle lifecycle"):
1. `git mv docs/tasks/<slug>.md docs/tasks/archive/cycle-2026-04-23-debug-and-test-modes/<slug>.md` for each merged brief.
2. Append `## Recently Completed (cycle-2026-04-23-debug-and-test-modes, <date>)` to `docs/BACKLOG.md`.
3. Reset "Current cycle" in `docs/AGENT_ORCHESTRATION.md` to the empty stub.
4. Write `docs/cycles/cycle-2026-04-23-debug-and-test-modes/RESULT.md`.
5. Commit as `docs: close cycle-2026-04-23-debug-and-test-modes`.
