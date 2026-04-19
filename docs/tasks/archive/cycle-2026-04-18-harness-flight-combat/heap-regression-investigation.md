# heap-regression-investigation: bisect the +296% combat120 heap growth

**Slug:** `heap-regression-investigation`
**Cycle:** `cycle-2026-04-18-harness-flight-combat`
**Depends on:** `perf-harness-architecture` (need a clean repro under the new declarative harness; the old imperative driver is being replaced in the same cycle, so writing a bisection harness against it would be throwaway work)
**Blocks (in this cycle):** `perf-baseline-refresh` (don't bake the regression into fresh baselines)
**Playtest required:** no (infra / debugging)
**Estimated risk:** low-to-medium — mostly investigation. Fixes may be small (session-gate the replay recorder; pool the utility context) or structural (pool per-combatant scratch buffers).
**Files touched:** high-probability targets are `src/core/ReplayRecorder.ts`, `src/systems/combat/ai/AIStateEngage.ts` (utility context allocation), `src/systems/combat/ai/utility/*` (action `apply()` allocations). Actual files touched depends on what the bisect surfaces. New artifact: `docs/rearch/heap-regression-2026-04-18.md` documenting the bisect result and fix rationale.

## Why this task exists

combat120 captures during the 2026-04-18 rebuild-foundation cycle showed **+296% heap growth** vs the prior baseline. The 8.8MB steady-state growth budget from before the cycle is blown past, but no single commit has been identified as the culprit — the only signal is "end-of-cycle total was much worse than pre-cycle total."

Nine commits shipped in the cycle. Research during cycle setup flagged these as the most plausible heap-growth contributors:

1. **C2 seeded RNG + ReplayRecorder** (`127f0a2`) — `ReplayRecorder.recordInput(tick, input)` pushes to a private `inputs: ReplayInputFrame<I>[]` array with no visible guard against pass-through mode. If the recorder is instantiated at boot and receives frames even outside a replay session, the array grows unbounded — exactly the "steady growth that looks like a leak" shape.
2. **C1 utility-AI scoring layer** (`af62b37`) — `buildUtilityContext()` is called per-tick per-combatant in `AIStateEngage.handleEngaging` (currently VC only, but scaling). If it allocates a context object each invocation, that's ~120 combatants × 60Hz × per-tick objects = a lot of short-lived allocations that stress the nursery.
3. **A2 render interpolation** (`a6a78b1`) — `CombatantRenderInterpolator.ensureRendered()` clones `combatant.position` on first sight. Per-new-combatant, not per-tick; only a problem if combatants respawn constantly.
4. **A4 AgentController** (`86517d9`; driver reverted in `82159c8`) — the primitive stays on master. If anything instantiates `AgentAction` objects per-tick somewhere, it's worth ruling out. The perf-active-driver that exercised this was reverted, but `bootstrap.ts` exposure gates might have left hooks active.

Rendering-at-scale and B1 airframe are unlikely heap sources (one-time buffer allocations) but should be ruled out by the bisect, not assumed innocent.

## Required reading first

- `perf-baselines.json` — current `heapGrowthMb` / `heapPeakGrowthMb` thresholds per scenario. Know what "in budget" means for combat120.
- `scripts/perf-capture.ts` — how `heapUsedMb` / `heapTotalMb` get sampled today (via `performance.memory`, forced GC via CDP `HeapProfiler`).
- `scripts/perf-compare.ts` — how the comparison treats heap metrics.
- `src/core/ReplayRecorder.ts` — full file. Look for session gating. If there is none, this is very likely the regression.
- `src/systems/combat/ai/AIStateEngage.ts` around `handleEngaging` and `buildUtilityContext` — how often is a fresh context allocated? Is it pooled?
- `src/systems/combat/ai/utility/UtilityScorer.ts` and `actions.ts` — per-action `apply()` allocations (e.g. `new THREE.Vector3()` in `fireAndFadeAction.apply()`).
- `src/systems/combat/CombatantLODManager.ts`, `CombatantRenderInterpolator.ts` — existing scratch-vector patterns; confirm the interpolator's `ensureRendered` is truly first-sight-only.
- `docs/TESTING.md`.
- `docs/INTERFACE_FENCE.md`.

## Bisection workflow

Use the new `perf-harness-architecture` runner as the repro surface (that's why this task blocks on it). Steps:

1. **Install memlab** (`npm i -D memlab` or use the Playwright-CDP route — see below). Decide which tool you're using and note it in the rearch memo.
2. **Build a fixed-duration heap-snapshot capture mode** for the new harness. The runner already boots Playwright; add an opt-in flag `--capture-heap-snapshots` that:
   - Runs warmup (15s).
   - Forces GC via CDP `HeapProfiler.collectGarbage` + `page.evaluate(() => performance.measureUserAgentSpecificMemory?.())` where available.
   - Takes baseline snapshot.
   - Runs scenario (60s).
   - Forces GC again.
   - Takes final snapshot.
   - Writes both to `artifacts/heap/<timestamp>/`.
3. **Bisect** across the 9 cycle commits (`5571be1..127f0a2`). `git bisect run` driven by a script that checks `final.heapUsed - baseline.heapUsed > threshold`. Threshold: 15 MB for combat120 (budget + 50% slack — we're looking for the regression, not drift).
4. **For the flagged commit(s):** diff the snapshots by constructor name. Expected buckets to inspect: `Array`, `Float32Array`, `THREE.Vector3`, `Map`, `Set`, custom class names like `ReplayInputFrame` / `UtilityContext`. The retainer trace from the fix candidate should point at the owning structure.
5. **Write the fix.** Fix kind depends on the finding:
   - If `ReplayRecorder.inputs` grows unboundedly: add a session-active gate (`if (!this.session) return;`) in `recordInput`. Plus tests: recorder accumulates inputs only between `startSession()` / `endSession()`.
   - If `UtilityContext` allocates per-tick: pool one context per combatant on the combatant record, or one scratch context on the scorer and reset fields per-call. Prefer the scratch-on-scorer shape — matches the existing scratch-vector pattern in other combat code.
   - If `fireAndFadeAction.apply()` allocates `new THREE.Vector3()` per invocation: reuse a scratch `THREE.Vector3` on the action instance. Actions are singletons in the registry, so this is safe.
   - If the culprit is unexpected (e.g. a texture cache, an event-listener leak, a material clone): document the retainer trace and propose the smallest fix that closes the leak without architectural rewrite.
6. **Verify.** Re-run the bisect repro. Heap growth must be at or below the pre-cycle baseline (8.8 MB steady-state). Capture a fresh `artifacts/heap/<timestamp>/` snapshot pair showing the drop.
7. **Write the rearch memo** at `docs/rearch/heap-regression-2026-04-18.md`:
   - Commit bisected as the cause.
   - Retainer trace / snapshot class-name diff.
   - Fix applied and why it's the right shape (not the largest possible fix).
   - Any secondary findings (other suspect allocations worth queueing, not fixed here).

## External reference

- **memlab** (Facebook) — Puppeteer-driven heap-snapshot diff tooling. Integrates with Playwright via a custom runner. https://facebook.github.io/memlab/
- **byt3bl33d3r/playwright-heap-snapshot** — Playwright + CDP `HeapProfiler.takeHeapSnapshot`, queryable. https://github.com/byt3bl33d3r/playwright-heap-snapshot
- **Three.js InstancedMesh disposal patterns** — worth eliminating as a false lead; `geometry.dispose()` does NOT free `instanceMatrix`/`instanceColor`. https://discourse.threejs.org/t/proper-cleanup-dispose-of-instancedmesh-instancematrix/21205
- **Three.js TSL `StackNode` leak (#31644)** — open issue, only relevant if any TSL materials are used. Rule out.

## Exit criteria

- A single commit (or a short list, if multiple contributors) is identified as the regression origin.
- The fix reduces combat120 `heapGrowthMb` to within the pre-cycle budget (8.8 MB steady-state, verified across two back-to-back captures).
- `docs/rearch/heap-regression-2026-04-18.md` documents the bisect, the retainer trace summary, and the fix rationale.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Behavior tests covering the fix (e.g. "ReplayRecorder only buffers when a session is active") exist.

## Non-goals

- Do not refactor `ReplayRecorder` / `UtilityScorer` structure beyond the minimum needed to close the leak. This is a bisect + fix, not a redesign.
- Do not hunt for *other* regressions. If the snapshot diff surfaces something secondary (e.g. a minor `new Array()` per-tick elsewhere), note it in the rearch memo and move on.
- Do not modify `perf-baselines.json` — the `perf-baseline-refresh` task follows this one and will rebaseline after the fix lands.
- Do not change the perf-capture CLI flags or artifact shape beyond the opt-in `--capture-heap-snapshots` addition.

## Hard stops

- Bisect dead-ends (no commit clearly flagged; regression appears to be emergent across multiple commits) — STOP. Write what you found, flag for a second pair of eyes. Don't guess.
- Fix proposal requires touching `src/types/SystemInterfaces.ts` — STOP (fence).
- Fix proposal requires >400 LOC net — STOP. The regression is almost certainly a small oversight (missing session check, missing scratch reuse); >400 lines suggests scope drift.
- memlab / playwright-heap-snapshot both fail to integrate — fall back to raw CDP `HeapProfiler` calls from the existing Playwright perf-capture. Note the tooling gap in the memo.
