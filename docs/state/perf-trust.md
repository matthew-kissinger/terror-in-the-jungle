# Perf Measurement-Chain Trust Status

Last updated: 2026-06-03

> **Update 2026-06-03 (combat-p99-attribution landed; recommend SPLIT DEFEKT-3):**
> the `combat-p99-attribution` cycle landed the measurement + the one built-but-
> disabled combat lever, and **proved the cover search is not the p99 driver**:
> - **Per-method tail attribution** now ships in every capture's `summary.json`
>   as `tailAttribution` (pure logic in `scripts/perf-tail-attribution.ts`,
>   unit-tested). For the worst-p99 sample it decomposes the frame from the
>   timers the capture already records: cover timers
>   (`engage.suppression.initiate.coverSearch`/`coverGridQuery`/
>   `engage.cover.findBestCover`), the Combat-phase **unattributed residual**
>   (`totalMs` − named children = where the contour terrain-stall movement cost
>   hides, since movement is billed to the Combat phase but not to a named
>   `aiMethodMs` timer), the top `aiStateMs` (`state.advancing`), and the
>   frame-level Combat-vs-render/Other split. It emits `coverDominatesTail` /
>   `combatDominatesTail` verdict flags. Baseline-free — answers "where is the
>   tail?" from one run.
> - **Cover-search cost microbench** (`src/systems/combat/ai/CoverSearch.bench.test.ts`)
>   measures the search in isolation at realistic density: median
>   `findBestCover` ≈0.008 ms, `queryWithLOS` ≈0.015 ms (53 candidates indexed),
>   and the **entire 8-search/frame budget ≈0.06 ms** — ~0.4% of a 16.67 ms
>   frame, ~600× below a 35 ms p99 frame. The cover search structurally cannot
>   anchor the tail. DEFEKT-3 clause 1 ("no longer dominates p99") is **met**.
> - **Contour height-sample dedupe** in `CombatantMovement`: the contour rescore
>   sampled `getTerrainHeight` at the NPC's *current* position up to 4× per tick
>   (two `scoreContourDirection` passes + `computeDirectionalSpeedFactor` + the
>   `isForwardBlocked` gate). A per-tick memo keyed on exact `(x,z)` collapses
>   them to one query. Byte-identical (pure function of `(x,z)`) — proven by a
>   determinism test asserting an identical, reproducible trajectory and a
>   start-coord-sampled-once-per-tick spy.
> - **`crowdStallStaggerEnabled` flipped default ON** (`src/config/CombatantConfig.ts`):
>   the 50%-cadence coast for contour-stalled, crowded high-LOD NPCs. The only
>   intended default behavior change; arms only on the stalled+crowded high-LOD
>   path. Movement-feel sign-off deferred to `docs/PLAYTEST_PENDING.md`.
> - **Recommended outcome — SPLIT.** The cover-search half of DEFEKT-3 is proven
>   met. The residual combat-billed tail is the NPC terrain-stall movement storm
>   (the Combat-phase unattributed residual + `state.advancing`), and the bad
>   frame remains a superposition with ~+2.9 ms uninstrumented render/Other —
>   so a combat-only fix is **not guaranteed** to clear 35 ms. Recommend marking
>   the cover-search criterion met and spinning the movement-stall tail into a
>   new directive (proposed slug `combat-movement-stall-tail`) plus the
>   render/Other half into render attribution (a KONVEYER axis). Full suite
>   green; frame-time ≤35ms certification stays deferred to the STABILIZAT-1
>   quiet box (this cycle cannot run a headed capture on a quiet machine).

> **Update 2026-06-02 (baseline file removed):**

> **Update 2026-06-02 (baseline file removed):** `perf-baselines.json` has been
> deleted from the repo and is intended to stay gone. The historical narrative
> below repeatedly says a capture "cannot refresh `perf-baselines.json`" or that
> "baseline refresh remains blocked" — that framing assumed a tracked baseline
> existed but was gated. There is now **no tracked baseline at all**: with the
> file absent, `npm run perf:compare` prints the latest capture's raw metrics
> and exits 0 (no PASS/WARN/FAIL gating), and the CI perf job's `perf:compare`
> step is `continue-on-error` (advisory). Re-establishing a baseline means
> *creating* the file via `npm run perf:update-baseline`, not "refreshing" an
> existing pin. Read every "refresh blocked" / "cannot refresh baseline"
> statement below as historical context for the now-superseded STABILIZAT-1
> refresh premise. See [docs/perf/baselines.md](../perf/baselines.md).

> **Update 2026-06-01 (convergence-stall fix landed):** the combat120 p99 tail
> root cause was traced and the **combat-side lever shipped** in
> `fix(combat): cut NPC convergence terrain-stall cost + oscillation`
> (`task/combat-convergence-stall-fix`). The earlier "tail traces to NPC
> terrain-stalls" framing holds but was sharpened: differencing the
> `2026-06-01T17-13-43-711Z` runtime samples shows the late-run spike is a
> **superposition** — `SystemUpdater.Combat` per-frame +2.0 ms (movement/AI; the
> stall storm) *and* uninstrumented render/"Other" +2.9 ms — not Combat alone
> (`combat_budget_dominance` = 0). Movement cost is misattributed to Combat, not
> Navigation (≈0.01 ms). DEFEKT-4's recovery mechanisms fire en masse at the
> crush but **oscillate** (contour ↔ backtrack) rather than resolving. The fix:
> (1) cache the contour side ~200 ms so a stalled NPC stops re-sampling the
> support normal twice/tick (the dominant uncached `getHeightAt` cost), (2) serve
> the stale nav route when the per-frame query budget is exhausted instead of
> dropping to a blocked direct-push, (3) disperse a held-and-crowded NPC away
> from the crush (default on, playtest-pending), (4) opt-in crowd-stall movement
> stagger (default off). Full test suite green (5260). **Frame-time certification
> is deferred to the STABILIZAT-1 quiet-machine refresh** — local re-captures ran
> on a contended workstation (probe round-trip 19.7→23.6 ms, +20%; sim trajectory
> diverged to a denser convergence), so avg/max are dominated by machine
> contention. Across three captures p99 was directionally comparable-or-better
> (45.6 → 44.0 → 39.0 ms); the per-tick sampling reduction is proven by the
> contour-cache unit test, not by these noisy aggregates.

> **Update 2026-05-31:** the synchronous cover search described below is
> REMEDIATED — the O(1) `CoverSpatialGrid` is wired into prod combat
> (`CombatantAI.ts:185,197`; `AIStateEngage` threads `spatialGrid` through
> suppression). DEFEKT-3's combat120 p99 PASS is pending the STABILIZAT-1
> baseline refresh, not further cover-search work.
>
> **Update 2026-06-01:** a fresh **measurement-trust PASS** combat120 capture
> (`artifacts/perf/2026-06-01T17-13-43-711Z`, RTX 3070 / WebGPU, 5447 frames)
> reports `perf:compare` **6 pass / 1 warn / 1 fail**: p95 33.10 ms PASS, max
> 49.50 ms PASS, heap −0.05 MB PASS, avg 16.60 ms WARN, **p99 45.60 ms FAIL**.
> The p99 fail is a *late-run tail*, not steady state: p99 held ~31–34 ms for
> ~85 of 90 s, then a respawn + an NPC terrain-stall storm + a point-blank
> frontline collapse spiked the global p99. **The combat120 tail now traces to
> NPC terrain-stalls (the stuck-on-slopes movement carry-over), not the cover
> search** — which the spatial-grid wiring did relieve in steady state. Baseline
> was **not** refreshed (a FAILing capture cannot reset the gate); STABILIZAT-1
> stays blocked pending a quiet-machine pass that clears the gates. Capture done
> on a non-isolated workstation, so treat as directional evidence.

Current trust state of the combat120 perf baseline and the chain of evidence
behind STABILIZAT-1 (combat120 baseline refresh blocked) and DEFEKT-3
(combat AI p99 — synchronous cover search in
`AIStateEngage.initiateSquadSuppression`). Companion docs:

- [docs/state/CURRENT.md](CURRENT.md) — current truth top-level
- [docs/CARRY_OVERS.md](../CARRY_OVERS.md) — STABILIZAT-1 / DEFEKT-3 entries
- [docs/PERFORMANCE.md](../PERFORMANCE.md) — full performance docs (Phase 1
  split target; see `perf-doc-split` task)
- `docs/archive/STATE_OF_REPO.md` — pre-Phase-1 detailed audit prose

## TL;DR

- **combat120 baseline refresh: BLOCKED.** A fresh 2026-05-10 local capture
  after the cover-cache first slice still fails the comparison gates
  (`avgFrameMs`, `p99FrameMs`, `maxFrameMs`). It is evidence, not a baseline
  refresh.
- **Owner attribution: PARTIAL.** Render-submission category attribution
  reconciles ~44% of sampled draw calls and ~43% of triangles to named
  owners; the remaining unattributed share moved from 0.30 to 0.02 after the
  `npc_ground_markers` `userData.perfCategory` source edit.
- **DEFEKT-3 root cause: synchronous cover search.** Anchored in
  `AIStateEngage.initiateSquadSuppression()`. The 2026-05-10 TTL cache first
  slice is behavior-green but does not close the perf gate; the next real
  closeout remains `CoverQueryService` → precomputed field + worker fallback.

## What "measurement trust" means

`scripts/perf-capture.ts` records measurement-trust evidence on every
capture: per-sample probe round-trip times, render-submission drain bytes,
and post-sample scene attribution. A capture earns measurement trust PASS
when probe overhead is bounded, drain bytes are within budget, and the
runtime sample count is sufficient to support tail-latency claims. Without
trust PASS, a capture is owner-review evidence only — it cannot refresh
`perf-baselines.json` and it cannot certify a fix.

The audit chain itself is gated by the same trust contract: a measurement
WARN packet that classifies an owner is still classified as
"owner_review_only" no matter how high the per-check confidence is.

## Latest measurement-trust state

The currently controlling production-shaped owner packet for regression
comparison is the measurement-PASS packet at
`artifacts/perf/2026-05-07T16-23-11-889Z/projekt-143-render-submission-category-attribution/render-submission-category-attribution.json`.

The latest sparse owner-review acceptance audit is
`artifacts/perf/2026-05-07T22-29-58-460Z/projekt-143-sparse-owner-acceptance-audit/sparse-owner-acceptance-audit.json`
(PASS, 8/8 criteria passing, classification
`sparse_owner_review_accepted`, raw probe over-75 rate `0.0345`, over-150
rate `0.0345`, and avg-without-max delta `3.37ms`). Formal measurement
trust remains WARN because probe avg is `28.93ms` and three raw probes
exceed `75ms`.

`perf:compare -- --scenario combat120` against this capture reports
`6 pass, 1 warn, 1 fail`: avg frame `16.19ms` WARN, p99 `34.20ms` PASS,
max-frame `100.00ms` FAIL, heap end-growth `6.51MB`, heap recovery `86.2%`.

The latest local release-stewardship combat120 capture is
`artifacts/perf/2026-05-10T10-45-07-263Z`. `npm run perf:compare` reports
`5 pass, 0 warn, 3 fail`: avg frame `20.15ms` FAIL, p95 `36.20ms` PASS,
p99 `47.10ms` FAIL, max-frame `100.00ms` FAIL, heap growth `2.23MB` PASS.

The 2026-05-10 manual CI redeploy validation exposed a CI-specific perf
artifact failure at
`artifacts/github/25629236699/2026-05-10T12-54-10-984Z`: the capture hard
timed out during `navigate-and-startup` with `finalFrameCount: 0`. CI perf is
intentionally advisory, so the workflow can still go green; the workflow now
emits an explicit perf advisory summary/warning for this case. This does not
unblock STABILIZAT-1 and must not be treated as a baseline refresh.

Baseline refresh remains blocked. The next bounded source target is the
remaining owner split across `npc_close_glb` draw submissions,
`npc_ground_markers` draw submissions, and terrain triangle dominance —
not further probe-drain reduction, suppression raycast cost, GPU present,
or baseline refresh.

## Open owner axes

These are the open attribution axes; each has a published audit packet,
none yet refresh the baseline:

- **render-submission category attribution**: `unattributed` draw share
  moved `0.2991 → 0.0202` after the `npc_ground_markers` source-edit; the
  remaining axes are `npc_close_glb` draw submissions vs.
  `npc_ground_markers` draw submissions vs. terrain triangle dominance.
- **terrain contribution**: terrain owns `0.7174` of submitted triangles
  through `2` draw submissions (CDLOD InstancedMesh, default `33`-vertex
  tile resolution). Terrain-shadow off does **not** improve timing — do
  not disable terrain shadows as the DEFEKT-3 fix.
- **render pass-metadata**: capture peak frame `3035`, frame pass types
  `main:124, shadow:1`, terrain triangle share `0.7095`. Renderer
  reconciliation `0.7022 / 0.9987` (draw / triangles).
- **close-engagement owner**: late-phase pressure ranks
  `AILineOfSight.ts` first and `ClusterManager.ts` second. Late LOS full
  evaluations per distribution call: `1.174`. LOS/distribution delta
  correlation: `0.871`.

Each of those axes requires runtime counters before further tuning or
baseline refresh.

## DEFEKT-3 trail

The accepted production close-model pool-bound remediation
(`artifacts/perf/2026-05-07T05-26-55-636Z`) keeps close GLB actors enabled
while bounding resource growth: active close GLB actors cap at `8`, the
per-faction pool cap is coupled to that active cap, initial per-faction
pool seed is `4`, top-up batch is `2`. Standard `npm run perf:capture:combat120`
records validation WARN with measurement trust PASS: avg `17.50ms`, peak
p99 `34.20ms`, frames >50ms `0.02%`, heap end-growth `4.64MB`, heap
recovery `87.6%`.

Subsequent repeatability captures hover near the codex `<=17ms` avg-frame
gate but still miss it by 0.36 – 0.50 ms, and `maxFrameMs` returns to
`100.00ms` repeatedly. The peak max-frame events classify as
`browser_native_gc_or_uninstrumented_render_present` or
`browser_longtask_loaf_without_instrumented_system_ai_or_webgl_owner` —
both with low-to-medium owner confidence under the current harness.

The measurement-path packet at
`artifacts/perf/2026-05-07T17-19-54-240Z/projekt-143-measurement-path-inspection/measurement-path-inspection.json`
classifies `per_sample_render_submission_probe_overhead_captured` with
high confidence: `78/78` raw probes exceed `75ms`, p95 `218ms`, per-sample
render-submission drain writes `59000325` bytes. The sparse rerun avoids
that overhead class.

## What does NOT count as a fix

- Disabling terrain shadows (control vs shadow-off avg/p99
  `17.57/34.3ms` vs `20.49/45.3ms`; max-frame `100ms` in both).
- Disabling close NPC models (validation moves FAIL → WARN, but removes
  the production close-actor visual contract).
- Per-sample render-submission drain (probe-overhead class proven by the
  failed `17:19` packet).
- Trace-only captures under deep-CDP (`probe avg 1388ms`, validation
  FAIL, measurement trust FAIL).

## Closeout plan

Phase 4 F2 is the engineering closeout for DEFEKT-3:
`CoverQueryService` becomes a precomputed cover field with worker
fallback, removing the synchronous cover search from
`AIStateEngage.initiateSquadSuppression`. The 2026-05-10 TTL cache slice is
documented at [docs/rearch/cover-query-precompute.md](../rearch/cover-query-precompute.md);
do not spend another pass on blind TTL tuning without cache-hit counters.

STABILIZAT-1 unblock is paired with the Phase 0 artifact-prune CI plus a
quiet-machine baseline refresh. Until that lands, every perf claim carries
the measurement-trust qualifier above.
