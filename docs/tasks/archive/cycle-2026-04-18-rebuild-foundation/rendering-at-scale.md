# Task A3: Rendering at scale — fix maxInstances silent drop + raise the cap

**Phase:** A (foundation)
**Depends on:** nothing
**Blocks:** future high-count scenarios (500+ visible combatants per bucket)
**Playtest required:** no (render-count fix; combat feel unchanged)
**Estimated risk:** low — bounded fix plus cap increase
**Files touched:** `src/systems/combat/CombatantMeshFactory.ts`, possibly
`src/systems/combat/CombatantLODManager.ts` callers, new unit test.

## Goal

Remove the silent-drop behavior when a bucket's combatant count exceeds the
instance-mesh capacity, and raise the cap so that realistic scale scenarios
don't lose units off-screen. Land a small fix now; the larger GPU-driven
rendering question stays as an E-memo and a Phase-C candidate.

## Background

From `docs/BACKLOG.md` Known Issue #2:

> `CombatantMeshFactory` uses `maxInstances = 120`; any bucket that exceeds 120
> silently drops the overflow.

The E2 spike memo on `origin/spike/E2-rendering-at-scale` covers the full
GPU-driven path design. This task is the minimal production fix that makes the
current renderer correct at 500+ per bucket and surfaces a clear signal if
capacity is exceeded, so we find out from logs rather than from a bug report.

## Required reading first

- `docs/TESTING.md`.
- `docs/BACKLOG.md` Known Issue #2.
- **On branch `origin/spike/E2-rendering-at-scale`:**
  - `docs/rearch/E2-rendering-evaluation.md` — stress-test results and
    threshold data. Inform where the new cap should sit.
- `src/systems/combat/CombatantMeshFactory.ts` — the hard-coded 120.
- `src/systems/combat/CombatantLODManager.ts` — bucket sizing, how many
  combatants can realistically land in a single bucket at peak.

## Steps

1. Trace the overflow path. Confirm whether `addCombatant` returns a failure
   signal or silently discards. If silent, fix it.
2. Raise the cap. Pick a value justified by the E2 memo's measurements (likely
   500 or 1000 for near-LOD; 3000 for far-LOD is plausible per instance-mesh
   perf data). Do NOT pick arbitrary round numbers without justification.
3. If the cap is exceeded at runtime, log a single warning per bucket per
   second (not per frame) naming the bucket and the overflow count. No silent
   drops.
4. Unit test: create a mesh factory, add N+1 combatants, assert the N+1th is
   either accepted (if cap was raised enough) or rejected with a logged
   warning, never silently dropped.
5. Perf capture: `combat120` must not regress. Also run a synthetic scenario
   with 500 combatants in a single bucket to prove the raised cap holds up.

## Exit criteria

- No silent drops possible. All overflows either accepted or logged.
- Cap value has a comment citing the E2 memo measurement.
- `combat120` p99 delta < +5%.
- Synthetic 500-per-bucket scenario runs without visible rendering errors.
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- No GPU-driven renderer. That's a larger question the E2 memo addresses; it's
  not this task.
- No change to LOD bucket sizing logic — just the per-bucket capacity.
- No WebGPU migration.

## Hard stops

- If the "raise the cap" change requires a fence change (e.g. new methods on
  `IGameRenderer`), stop and surface.
- If perf regresses > 5% at the raised cap, stop — surface with data.
