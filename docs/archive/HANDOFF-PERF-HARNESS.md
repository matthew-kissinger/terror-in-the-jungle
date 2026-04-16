# Engineering Note: Perf Harness Recovery and Remaining Warmup Work

**Date**: 2026-04-02  
**Status**: Root cause validated and fix landed  
**Priority**: Follow-up capture + re-baseline

## Perf Harness Freeze

### Validated root cause

- The Playwright perf harness freeze at `frameCount=1` was **not** a generic `requestAnimationFrame` or Chromium failure.
- Blank-page rAF and minimal WebGL both continued to tick under the same Playwright launch arguments.
- The freeze happened only after live-entry completed.
- The triggering condition was `GameUI.hide()` using `document.startViewTransition()` while the live renderer was being shown.
- Disabling `document.startViewTransition()` before sandbox start restored normal frame progression immediately.

### Implemented fix

- `GameUI` now uses an explicit transition policy.
- Menu-to-menu transitions can still use View Transitions when supported.
- Live-entry always bypasses View Transitions.
- Perf and sandbox runs default to `uiTransitions=0`, and the perf harness now appends that query param explicitly.
- Startup probes now record:
  - `rafTicks`
  - `gameStarted`
  - startup phase
  - `document.hidden`
  - `document.visibilityState`
  - `document.activeViewTransition`

### Key files

- `src/ui/screens/GameUI.ts`
- `src/ui/engine/UITransitions.ts`
- `scripts/perf-capture.ts`

## Harness Robustness

- The harness now writes best-effort failure artifacts (`summary.json`, `validation.json`, `console.json`, `runtime-samples.json`) on emergency shutdown paths.
- `SIGINT`, `SIGTERM`, and the internal hard-timeout path now release the run lock and write a failed summary before exit.
- CI perf capture is a blocking gate again; deploy now depends on the perf job.

## Grenade First-Use Stall

### Current state

- The earlier scene-graph thrash fix remains in place.
- Startup warmup no longer relies only on `renderer.compile()` / `compileAsync()`.
- Live-entry now spawns one hidden explosion and one hidden impact effect below ground to warm the real GPU path.

### What remains

- Re-run cold-start captures and verify whether the first visible grenade hitch is gone.
- If cold-start evidence still shows a hitch, profile the first explosion path specifically:
  - texture upload timing from `ExplosionTextures.ts`
  - first material/program activation in explosion/impact effect factories
  - one-time buffer uploads on pooled particle geometries

## Notes

- A previous hypothesis about reusing the same Playwright browser profile between captures was incorrect. `scripts/perf-capture.ts` creates a fresh profile under each artifact directory.
- A previous watchdog experiment in `GameEngineLoop.ts` was intentionally not kept; the validated fix is at the UI/live-entry boundary, not in the core frame loop.
