# cycle-2026-04-23-debug-and-test-modes — Plan

**Cycle ID:** `cycle-2026-04-23-debug-and-test-modes`
**Opens:** 2026-04-23 (intended for a single autonomous session; may dispatch same-day once the 2026-04-22 human playtest completes).
**Shape:** 4 tasks across two sequential rounds — foundation + three disjoint additions.

## Why this cycle exists

After the `cycle-2026-04-22-heap-and-polish` close we have three lingering diagnostic gaps:

1. **Iterating on system issues requires re-entering a full game.** There is already a `?mode=flight-test` bypass (`src/dev/flightTestScene.ts`) that boots an isolated physics scene with a flat ground plane — useful for probe-level physics work but not for "can I feel this fix in authentic terrain / atmosphere?". The human playtest flow has no launcher for test scenarios that share the real engine stack but suppress combat/objective pressure.
2. **Debug overlays are hand-wired.** `PerformanceOverlay` / `TimeIndicator` / `LogOverlay` each mount to `document.body` independently. F1–F4 each toggle one. Adding a new debug panel means a new top-level overlay class + a new keybind + a hand-wired mount. A registry pattern would let system-specific panels plug in without keybind churn.
3. **Playtest feedback capture is out-of-band.** The human uses `Win+Shift+S` + a markdown doc (`docs/playtest/PLAYTEST_<date>.md`). An F9-style capture that grabs a screenshot + text annotation in-game and writes to a session-scoped local dir would make iteration tighter.

These three problems share a theme (diagnostic surface area for development iteration) and split into disjoint subsystems, so they fit a small parallel cycle.

## Tasks in this cycle

Each has a brief at `docs/tasks/<slug>.md`.

- **Round 1 (solo, P0):** `debug-hud-registry` — unify the F1-F4 overlays under a registry pattern with a single master-toggle keybind (`` ` `` / backtick); seed 2–3 new panels (vehicle-state, combat-state, current-mode) so future additions are trivial.
- **Round 2 (3 parallel, P1):**
  - `test-mode-launcher` — extend `GameMode` + `GameModeDefinition` with a "test mode" class; add a dev-only launcher entry in the main menu; wire URL-query shortcuts. Seeds entries for `airfield-sandbox` and a stub `combat-sandbox`.
  - `airfield-sandbox-mode` — new `GameModeDefinition` (`AIRFIELD_SANDBOX`): spawn at `main_airbase` parking adjacent to a claimable A-1 Skyraider; enemy AI muted (no active combat director); no objective timer; real terrain + atmosphere. Primary use: flight feel iteration in authentic environment.
  - `playtest-capture-overlay` — F9 keybind captures `renderer.domElement.toBlob()` + opens a lightweight text-annotation prompt; writes both to `artifacts/playtest/session-<timestamp>/<sequence>.{png,md}` (gitignored). No file-save permission prompt; writes via `File System Access API` if available, falls back to download-anchor.

## Round schedule

```
Round 0 (orchestrator prep)
  -> Round 1 (debug-hud-registry, solo)
      -> Round 2 (test-mode-launcher, airfield-sandbox-mode, playtest-capture-overlay; 3 parallel)
```

R2 does NOT block on R1 merging — the R2 tasks touch disjoint files and do not consume the registry. If debug-hud-registry lands first, R2 panels can register against it; if not, they mount independently (as today) and a fast-follow migration is trivial.

## Round 0 (orchestrator prep)

1. `git fetch origin && git status` (must be clean; fast-forward if behind).
2. **Fresh baseline capture** — `cycle-2026-04-22-heap-and-polish` closed with the inherited baseline flagged as an outlier. Capture `npm run perf:capture:combat120` at cycle-open HEAD and commit the `summary.json` + `validation.json` to `docs/cycles/cycle-2026-04-23-debug-and-test-modes/baseline/`. This cycle's perf gate uses this fresh capture, not the inherited one.
3. Confirm `docs/cycles/cycle-2026-04-23-debug-and-test-modes/baseline/` and `evidence/` dirs exist.

## Concurrency cap

3 (only Round 2 has parallelism).

## Dependencies

```
Round 0 (fresh baseline)
  -> debug-hud-registry (solo)
      -> test-mode-launcher        ┐
      -> airfield-sandbox-mode     ├─ parallel (disjoint files)
      -> playtest-capture-overlay  ┘
```

## Playtest policy

DEFERRED. No playtest gate BLOCKS merge. The `airfield-sandbox-mode` and `playtest-capture-overlay` tasks are worth a human playtest pass post-merge (flagged in RESULT.md under "Playtest recommended"), but the cycle itself is probe/screenshot-verified.

## Perf policy

- **Baseline:** the fresh capture from Round 0 (committed to `baseline/perf-baseline-combat120.json`).
- **Gate:** post-Round-2 `npm run perf:capture:combat120`. p99 within 5% of Round-0 baseline. `heap_recovery_ratio` ≥ 0.5 (softer than last cycle since none of these tasks touch load-bearing runtime code).

## Failure handling (autonomous-safe)

Same pattern as prior cycles:
- CI red on a task → mark `blocked`, record, continue.
- Fence-change proposal (`fence_change: yes`) → mark `blocked`, DO NOT merge.
- Probe/screenshot-assertion fail post-merge → revert if possible; otherwise `rolled-back-pending` in RESULT.md.

## Visual checkpoints (orchestrator-gated)

NONE. Autonomous run. Screenshot deliverables are cycle evidence, not orchestrator gates.

## skip-confirm

YES. Orchestrator does NOT pause between rounds.

## Cycle-specific notes

- **`debug-hud-registry` MUST preserve current F1–F4 behavior.** The existing keybinds are muscle memory; the registry adds a master toggle on backtick and the ability for panels to self-register, but F1=Performance F2=runtime-stats F3=Log F4=Time stays intact.
- **`test-mode-launcher` must NOT break existing `?mode=flight-test`.** `src/dev/flightTestScene.ts` is the isolated-physics bypass and stays. The new launcher is for full-engine test scenarios that share the real stack.
- **`airfield-sandbox-mode` suppresses enemy AI via the existing director config**, not by hacking combat subsystems. If the executor finds they need to edit `src/systems/combat/**` to implement "no enemy AI," STOP — that's scope creep, file a finding, switch to a config-only approach (e.g., `director.enabled = false` or faction mix with only BLUFOR).
- **`playtest-capture-overlay`** writes to `artifacts/playtest/` which MUST be added to `.gitignore` if not already caught by the `artifacts/` wildcard (it is — `artifacts/` is ignored — but confirm).
- **Reviewers:** `airfield-sandbox-mode` touches `src/config/gameModeDefinitions.ts` and likely `src/core/ModeStartupPreparer.ts`; if either diff extends into `src/systems/combat/**` or `src/systems/terrain/**`, spawn the matching reviewer. `debug-hud-registry` touches `src/ui/**` + `src/core/GameEngine*` — no reviewer scope. `test-mode-launcher` touches `src/config/**` + `src/core/ModeStartupPreparer.ts` — no reviewer scope. `playtest-capture-overlay` touches `src/ui/**` + `src/systems/input/**` — no reviewer scope.

## Post-cycle ritual

Standard (per `docs/AGENT_ORCHESTRATION.md` "Cycle lifecycle"):
1. `git mv docs/tasks/<slug>.md docs/tasks/archive/cycle-2026-04-23-debug-and-test-modes/<slug>.md` for each merged brief.
2. Append `## Recently Completed (cycle-2026-04-23-debug-and-test-modes, <date>)` to `docs/BACKLOG.md`.
3. Reset "Current cycle" in `docs/AGENT_ORCHESTRATION.md` to the empty stub.
4. Write `docs/cycles/cycle-2026-04-23-debug-and-test-modes/RESULT.md`.
5. Commit as `docs: close cycle-2026-04-23-debug-and-test-modes`.

## Out of scope (flagged for future)

- Asset replacement + LOD imposter generation pipeline — tracked as a standing workstream in `docs/BACKLOG.md`, not a task in this cycle.
- More test modes (combat-sandbox, atmosphere-preview, NPC-ai-stress, terrain-streaming-stress) — the `test-mode-launcher` brief stubs out the registry so adding modes later is one-file changes; a dedicated "test-mode-suite" cycle can come after this one lands.
