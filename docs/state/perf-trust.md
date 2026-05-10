# Perf Measurement-Chain Trust Status

Last verified: 2026-05-10

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
