# Perf Regression Playbook

Last verified: 2026-05-09

How to investigate a perf regression. Distilled from the DEFEKT-3 /
STABILIZAT-1 chain captured in `docs/archive/PERFORMANCE.md`. Read
[scenarios.md](scenarios.md) and [baselines.md](baselines.md) before starting.

## Validation gates

`perf-capture.ts` runs these automated checks and writes the results to
`validation.json`:

- Frame progression (no long stalls during sampling).
- Mean / tail frame timing (avg, p95, p99, max).
- Hitch ratios above `>50 ms` and `>100 ms`.
- Over-budget sample ratio (any sample above the per-system budget).
- Combat shot/hit sanity (player + bot).
- Heap behavior (end-growth, peak-growth, recovery percentage).
- Runtime UI contamination (transitions, screenshot interactions).

A capture's `summary.json` reports overall `status`. A capture's
`measurement-trust.json` reports whether the harness self-certified — probe
round-trip latency, missed sample ratio, and sample presence. **A capture
without `measurementTrust.status: pass` is not allowed to claim regression
or improvement.**

## Investigation workflow

1. **Capture.** `npm run perf:capture:<scenario>`. Use the same scenario the
   regression was reported on. Avoid the temptation to switch scenarios mid
   investigation.
2. **Trust check first.** Open `measurement-trust.json`. If it is WARN or
   FAIL, fix the harness/machine condition before reading frame numbers.
3. **Analyze the latest artifact.** `npm run perf:analyze:latest` for a
   one-screen summary. Inspect `summary.json` for status, gate breakdowns,
   and combat breakdown.
4. **Change one thing.**
5. **Re-capture the same scenario.**
6. **Compare.** `npm run perf:compare`. Keep only evidence-backed
   improvements.

Treat the first capture after a fresh boot as cold-start data. Use matched
warm pairs for A/B decisions.

For world-feature, asset, aircraft, or collision-query changes, pair
`npm run perf:capture:openfrontier:short` with
`npm run perf:compare -- --scenario openfrontier:short`. `combat120` alone
will not catch Open Frontier's staging and large-world regressions.

## Common regression classes

The DEFEKT-3 chain in `docs/archive/PERFORMANCE.md` worked through these in
order. Use it as a checklist when an avg/p99/max-frame regression appears.

### 1. Close-actor render dominance

Symptoms: avg frame >`18 ms`, Combat-phase contribution >`5 ms`, draw calls
in the thousands, visible `npc_close_glb` and `weapons` instances dominate
`scene-attribution.json`.

Investigation: check `combatBreakdown` in `summary.json` and the
`runtime-samples.json` `renderer.info` per-sample drift. Compare against a
diagnostic capture with `--disable-npc-close-models` (URL flag
`perfDisableNpcCloseModels=1`). If the disabled run clears thresholds and
the enabled run does not, the close-model resource/upload path is the owner.

Production remediation: `CombatantRenderer` pool caps, weapon-mesh merge,
material-state bound (don't mark `material.needsUpdate` every frame for
opacity changes), overflow-bound (collapse repeated overflow logs).

### 2. AI cadence pressure

Symptoms: late-window avg frame rises while early/mid is fine; LOS markers
or target-distribution markers grow late; `[AI spike]` console line.

Investigation: look at `combatBreakdown.aiMethodMs` aggregate leaders
(`state.engaging`, `state.patrolling`, `patrol.canSeeTarget`,
`patrol.findNearestEnemy`) and the slowest sampled update.
`scripts/audit-archive/los-callsite-cadence.ts` produces a per-callsite
cadence sidecar; `scripts/audit-archive/engage-suppression-cadence-bound.ts`
and the related `*-cadence-bound.ts` packets prove before/after for
state-handler LOS reuse changes.

Production remediation: 250 ms positive-visibility reuse in
`AIStateEngage` / `AIStatePatrol` / `AIStateMovement`; 500 ms stable-target
window in `ClusterManager`. Each landed change must move the cadence counters
without regressing the others.

### 3. Cover-search raycast cost

Symptoms: aggregate `cover.findNearestCover.terrainScan.coverTest.raycastTerrain`
high in `combatBreakdown.aiMethodMs`; raycasts-per-uncached-search above 2.

Investigation: `scripts/audit-archive/cover-search-attribution.ts`,
`scripts/audit-archive/suppression-cover-cache-review.ts`,
`scripts/audit-archive/suppression-raycast-cost-review.ts`. Look for
score-gate skips and cache hits.

Production remediation: sorted score-gate raycast reduction in
`AICoverFinding`; suppression cover-search cap; cover-cache locality fix
(see `engage.suppression.initiate.coverSearch` skip-reason split).

### 4. Heap growth / poor recovery

Symptoms: heap end-growth above `10 MB`, heap peak-growth above `40 MB`,
heap recovery below `60 %`. Frame numbers may pass.

Investigation: `scripts/audit-archive/perf-heap-diagnostic.ts` classifies the
shape — `transient_gc_wave`, `retained_or_unrecovered_peak`, etc. Pair with
deep-CDP heap sampling
(`PERF_DEEP_CDP=1` or `--cdp-heap-sampling true`) and run
`scripts/audit-archive/heap-sampling-attribution.ts`. Top owners over the long
term: `three.module` (math/skinning), `CombatantRenderer.ts`,
`GameplaySurfaceSampling.ts`, `CombatantMovement.ts`, `HeightQueryCache.ts`,
`InfluenceMapComputations.ts`.

Profiler overhead can fail validation on its own; treat profiler captures as
allocation-ownership evidence, never as baseline candidates.

### 5. Max-frame spikes (`100 ms` LoAF without owner)

Symptoms: avg / p99 fine but `maxFrameMs = 100.00 ms` blocks the compare
gate. `runtime-samples.json` shows long task `~150 ms`, LoAF
`~150 ms`, blocking `~100 ms`, WebGL upload `<1 ms`, top user timing
`SystemUpdater.Combat` only `~7 ms`.

Investigation: `scripts/audit-archive/max-frame-attribution.ts` then
`scripts/audit-archive/render-boundary-timing.ts`,
`scripts/audit-archive/render-present-subdivision.ts`, and
`scripts/audit-archive/raf-callback-source-resolution.ts`. Focused trace
windows are available via `perf-capture.ts --trace-window-start-ms <ms>
--trace-window-duration-ms <ms>` with CPU profiler and heap sampling
suppressed (`--cdp-profiler false --cdp-heap-sampling false`) so trace
overhead is not the owner. Verify with
`scripts/audit-archive/trace-overhead-isolation.ts` against a non-trace
control.

The bundle callsite usually resolves to
`src/core/GameEngineLoop.ts` / `RenderMain` (Vite has `sourcemap: false` for
the perf bundle, so the resolution is by anchor matching, not source map).
Common owner classification:
`browser_long_animation_frame_without_instrumented_system_or_webgl_owner` —
investigate native render-present, GC pressure, or main-thread task slicing
before changing AI behavior.

### 6. Open Frontier renderer tails

Symptoms: short capture passes mean/p95/hitch but `p99FrameMs` warns
near `30 ms` and heap peak-growth warns near `35 MB`. Mode is stable but
not at March-2026 renderer baseline.

Investigation: check `renderer.info` drift across the capture, scene
attribution growth (especially `world_static_features`), and the active
driver's path-failure count. The 2026-05-04 shared static-feature batching
(`WorldStaticFeatureBatchRoot` in `WorldFeatureSystem`) lowered selected
owner draw-call-like to ~261 OF / ~307 A Shau.

### 7. NPC terrain stalling

Symptoms: harness `blockedByTerrain` count rises, `avgActualSpeed` drops,
`StuckDetector` console signals grow; combat may continue but movement
visibly bounces.

Investigation: see also `docs/MOVEMENT_NAV_CHECKIN.md`. Check
`movement-artifacts.json` and `movement-viewer.html`. The 2026-05-06
`CombatantMovement` patch rejects zero-distance navmesh backtrack snaps and
prefers last-good navmesh progress before scored terrain fallback;
`StuckDetector` 4-attempt abandon path requires goal-anchor tracking
independent of backtrack-anchor flips.

## Diagnostic packets and decision packets

The archived diagnostic scripts under `scripts/audit-archive/*.ts` produce
narrow packets that consume an existing capture and write a sidecar JSON inside
the same artifact directory. Run them with `-- --artifact <artifact dir>`.
They never modify the source capture; they classify it. Retained package
commands now use plain `check:*` names; see `package.json` and
[README.md](README.md) "Capture commands".

A diagnostic packet's `status: pass` does not authorize a baseline refresh.
Baseline refreshes follow the procedure in
[baselines.md](baselines.md) "Refresh procedure".

## When to give up and ship behind a flag

If a regression cannot be cleanly attributed within one cycle and is not a
gameplay blocker, document it in `docs/CARRY_OVERS.md`, ship the new code
behind a Tweakpane runtime flag, and leave the existing baseline in place.
This is how STABILIZAT-1 has stayed open across multiple cycles without
blocking unrelated work.

## Resolved bottleneck history

Past bottleneck closures and accepted remediations are in
`docs/archive/PERFORMANCE.md` "Resolved Bottlenecks" (entries from 2026-04-01
through 2026-04-17 covering effect pool thrashing, cover-search frame
spikes, infinite NPC backtrack loops, AI degradation cliff, harness startup
freeze, helicopter idle cost, fixed-wing pop, NPC combat response gap, and
the move from dev to perf bundle measurement).
