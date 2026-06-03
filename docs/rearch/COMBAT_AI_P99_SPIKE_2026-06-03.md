# Combat AI p99 Anchor — Spike Memo (DEFEKT-3)

Date: 2026-06-03
Type: investigation + design memo (NO implementation in this pass)
Directive: DEFEKT-3 — "Combat AI p99 anchor" (`open (O(1) path wired; perf unproven)`)
Success criterion (from `docs/DIRECTIVES.md:30`): *"Sync cover search in `AIStateEngage.initiateSquadSuppression` no longer dominates p99; combat120 p99 ≤35ms PASS."*

> **One-line finding:** the cover-search half of DEFEKT-3 is effectively **already met** in steady state (O(1) grid wired, capped, off the hot path). The open half — *proving* combat120 p99 ≤35ms — is a **measurement problem**, and the honest top combat-side lever for the p99 *tail* is the **NPC terrain-stall oscillation in `CombatantMovement`** (mis-attributed to "Combat"), not the cover search. This memo proposes a baseline-free, per-method-attribution measurement plan plus the next stall-cost levers.

---

## Current state — what is actually wired

### CoverSpatialGrid is wired into prod combat, O(1)-average, capped, and behind a fallback

- The concrete grid lives in `src/systems/combat/ai/CoverSpatialGrid.ts`. It is a CPU uniform 8 m grid (`COVER_GRID_CELL_SIZE = 8`, `CoverSpatialGrid.ts:29`). `queryNearest` only visits cells overlapping the query-disk AABB (`forEachCandidateInRadius`, `CoverSpatialGrid.ts:244-264`) — O(1) average for a bounded radius and bounded cover density. `queryWithLOS` then LOS-gates each candidate via a single terrain raycast (`CoverSpatialGrid.ts:193-214`, `hasLineOfSight` at `:266-281`).
- The production bridge is `CombatCoverGridProvider` (`src/systems/combat/ai/CombatCoverGridProvider.ts`). It is constructed and wired in `CombatantAI` ctor: `new CombatCoverGridProvider(this.coverSystem)` (`CombatantAI.ts:185`) → `this.engageHandler.setCoverGridQuery(this.coverGridProvider)` (`CombatantAI.ts:197`).
- The consumer is `AIStateEngage.initiateSquadSuppression()` (`AIStateEngage.ts:863-993`). The flank-cover fast path queries the grid first (`AIStateEngage.ts:936-946`); on a miss it falls back to `coverSystem.findBestCover` (the SAME candidate source the grid is populated from — `AICoverSystem.collectCoverCandidates`, `AICoverSystem.ts:170-209`), and only the no-coverSystem edge uses the legacy `findNearestCover` scan (`AIStateEngage.ts:956-966`).

### The cover search is bounded three ways — it structurally cannot dominate p99 anymore

1. **Per-suppression cap of 2 searches:** `MAX_FLANK_COVER_SEARCHES_PER_SUPPRESSION = 2` (`AIStateEngage.ts:146`); checked at `:926` and `:956`. A squad suppression performs at most 2 cover lookups total, not one per member.
2. **Destination reuse skip:** if a flanker's existing destination is within `FLANK_DESTINATION_REUSE_RADIUS_SQ` (12 m²), the search is skipped entirely (`AIStateEngage.ts:919-925`).
3. **Per-frame budget of 8 in the underlying scan:** `AICoverSystem.MAX_COVER_SEARCHES_PER_FRAME = 8` (`AICoverSystem.ts:47`); `findBestCover` early-returns `null` past it (`:70-73`). Chunk cover spots are cached 5 s (`CACHE_TTL_MS`, `:44`) and capped at 8/chunk (`:45`).
4. **Suppression itself is rate-limited:** `SUPPRESSION_COOLDOWN_MS = 10000` per squad (`AIStateEngage.ts:49`, gate at `:845-846`), and only fires for squads ≥3 within 30–80 m (`:843`, `:849`).
5. **Grid refresh is TTL-amortized:** `CombatCoverGridProvider.refreshRegion` re-collects candidates at most once/sec per 8 m region (`REGION_REFRESH_TTL_MS = 1000`, `CombatCoverGridProvider.ts:51`, gate at `:115`). So the residual `collectCoverCandidates` scan (which itself walks chunks, `AICoverSystem.ts:177-186`) runs ~1×/s/region, not per query.

**Is there a residual synchronous scan?** Yes, but tightly amortized: (a) the grid-miss fallback `findBestCover` is synchronous, but capped at ≤2/suppression and ≤8/frame; (b) `refreshRegion`'s `collectCoverCandidates` is synchronous but TTL-gated to ~1/s/region. Neither is on the per-tick-per-NPC hot path. The `coverGridQuery.queryWithLOS` call does one raycast per LOS-valid candidate within 30 m — bounded by cover density, not NPC count.

### Every cover-search step is already individually instrumented

`AIStateEngage` wraps each cover step in `measureEngageMethod(name, fn)` (`:792-794`), which routes to `CombatantAI.withAiMethodTiming` (`CombatantAI.ts:192`, `:583-591`). Named timers that land in `aiMethodMs`:
- `engage.suppression.initiate.coverGridQuery` (`AIStateEngage.ts:937`)
- `engage.suppression.initiate.coverSearch` (`:957`)
- `engage.cover.findBestCover` (`:419`, `:561`)
- `engage.suppression.initiate.computeFlankDestination` (`:906`)

Plus grid hit/miss counters in `CloseEngagementTelemetry` (`suppressionFlankCoverGridHits/Misses`, `AIStateEngage.ts:73-74`, `:941`/`:944`), surfaced through `CombatantProfiler` (`:41-42`) into the perf artifact's `combatBreakdown.closeEngagement.engagement` (`scripts/perf-capture.ts:96-114`). **The cover search's exact per-frame ms cost is already measurable from a single capture, no baseline required.** This is load-bearing for the plan below.

---

## The real problem — reconciling DEFEKT-3 with the superposition finding

Three independent signals agree that the cover search is no longer the p99 driver:

1. **The directive's own status** (`DIRECTIVES.md:30`): "O(1) path wired; perf unproven." The wiring is done; only the proof is missing.
2. **`docs/state/perf-trust.md:42-46`** (2026-05-31): the synchronous cover search is "REMEDIATED ... DEFEKT-3's combat120 p99 PASS is pending the STABILIZAT-1 baseline refresh, not further cover-search work."
3. **`docs/state/perf-trust.md:18-40`** (2026-06-01): differencing the `2026-06-01T17-13-43-711Z` samples shows the late-run spike is a **superposition** — `SystemUpdater.Combat` +2.0 ms (movement/AI stall storm) **and** uninstrumented render/"Other" +2.9 ms — with `combat_budget_dominance = 0`. **Movement cost is mis-attributed to Combat** (Navigation phase ≈0.01 ms). The convergence-stall fix already shipped (`task/combat-convergence-stall-fix`): contour-side caching, stale-route serving on budget exhaustion, default-on dispersal, opt-in stagger.

### Why "Combat" looks heavy but the cover search is innocent

`CombatantMovement` runs inside the **Combat** update phase (`SystemUpdateSchedule.ts:42` → `phase: 'Combat'`), so terrain-solver stall cost is billed to Combat, not Navigation. The dominant per-tick cost for a stalled NPC is terrain height sampling in the contour solver:

- `chooseContourDirection` (`CombatantMovement.ts:1064-1083`) scores left/right contour candidates; each `scoreContourDirection` (`:1102-1130`) samples terrain height + the support normal (`getTerrainHeight` ×2 + `sampleSupportNormal`, `:1108-1118`). The comment at `:1059-1063` names this "the dominant terrain-sampling cost for a contour-stalled NPC at convergence." It is cached only `NPC_CONTOUR_RESCORE_INTERVAL_MS = 200` ms (`:77`).
- The stall **oscillation** is structural: `evaluateTerrainStallReroute` (`:570-603`) only invalidates the cached path after `NPC_CONTOUR_STALL_REROUTE_MS = 1200` ms of sustained low-progress contour activation, and `movementContourSign` adds only a +0.25 hysteresis bonus (`:1126-1128`), so the chosen side can flip — net XZ oscillates around the waypoint (`:556-561`). `StuckDetector` is a 600 ms-granularity guardrail (`STUCK_CHECK_INTERVAL_MS = 600`, `StuckDetector.ts:8`) that escalates contour→backtrack→hold (`:208-219`); under a frontline collapse many NPCs enter this loop simultaneously ("fire en masse but oscillate").

### combat120 is a valid reproducer

`AI_SANDBOX_CONFIG` (`src/config/AiSandboxConfig.ts`) uses `squadSize {min:3,max:5}` (satisfies `SQUAD_MIN_SIZE_FOR_SUPPRESSION=3`, so suppression+cover-search fires), procedural `denseJungle` terrain with slopes (`:14-20`, triggers contour stalls), and two bases at z=±40 with a 200 m world (`:50-64`) that force a point-blank frontline convergence — exactly the "respawn + NPC terrain-stall storm + point-blank frontline collapse" the perf-trust doc blames for the tail (`perf-trust.md:53-56`). 120 NPCs via the `--npcs 120` override.

### Honest top combat-side lever

**The NPC terrain-stall oscillation, measured by per-method attribution — not the cover search.** The cover search is already remediated; spending another cycle on it would move ~0 ms. The remaining *combat-billed* p99 contribution is the contour-stall storm (~+2.0 ms on the bad frame). BUT — and this is the load-bearing honesty — the bad frame is a **superposition**: even a perfect combat-side fix leaves ~+2.9 ms of uninstrumented render/"Other", so **fixing the stall alone is not guaranteed to drop global p99 under 35 ms.** The single most valuable deliverable this cycle is therefore **measurement that attributes the tail frame by system**, so the next cycle targets the actual dominant term instead of guessing.

---

## Candidate levers — ranked by (expected p99 impact × measurability × risk)

Ranking favors levers that are *provable without a baseline* and *low-risk*, because the directive has been stuck on proof, not on ideas.

### L1 — Per-method tail attribution of the bad frame (measurement, not a code fix to combat) — TOP
- **Files:** `scripts/perf-capture.ts` (summary/attribution section ~`:1400-1510`, artifact at `:2525`/`:3920`); read-only consumers `CombatantProfiler.ts`, `CombatantAI.ts:583-591`.
- **Change shape:** add a derived "p99-window attribution" to the capture summary that, for the worst sample window, emits the top-N `aiMethodMs` entries and the Combat-vs-Other split already present in the data. No engine change — the timers and `combatBreakdown` already exist; this just surfaces them at the tail instead of only as run averages.
- **Why it helps:** turns "p99 is 45 ms, somewhere" into "p99 frame = X ms contour + Y ms LOS + Z ms cover + W ms render/Other." Directly proves whether the cover search is innocent (expected: `engage.suppression.initiate.coverSearch` ≈ sub-0.1 ms) and quantifies the stall cost.
- **How to prove:** the attribution output IS the proof. Self-validating.
- **Impact × measurability × risk:** high × very-high × very-low.

### L2 — Land `crowdStallStaggerEnabled` as default-on (or a measured A/B) — HIGH
- **Files:** `src/config/CombatantConfig.ts:97` (`crowdStallStaggerEnabled: false`); logic already implemented in `CombatantMovement.ts:265-287` and `:476-487`.
- **Change shape:** the 50%-cadence coast for contour-stalled, crowded high-LOD NPCs is fully built but gated off. Flip default (or wire a perf-harness A/B flag) and measure. Coasting skips the spacing-grid query + terrain contour solve every other tick for stalled NPCs — directly halves the dominant per-tick stall cost for the worst-case crowd.
- **Why it helps:** attacks the exact `getTerrainHeight`/`sampleSupportNormal` cost L1 will quantify, on exactly the NPCs that drive the tail.
- **How to prove:** A/B single-run delta (see Measurement plan) on `combatBreakdown.aiStateMs['state.advancing']` + contour timers + p99; plus an L2 unit test asserting the coast tick skips the solve.
- **Impact × measurability × risk:** high × high × medium (gameplay/visual — coasted NPCs must not visibly stutter; default-off today specifically to avoid that, so a playtest gate is required before default-on).

### L3 — Cache `scoreContourDirection` terrain samples within a tick / widen the rescore window adaptively — MEDIUM
- **Files:** `src/systems/combat/CombatantMovement.ts:1102-1130` (`scoreContourDirection`), `:77` (`NPC_CONTOUR_RESCORE_INTERVAL_MS`), `:1132-1160` (`computeDirectionalSpeedFactor` re-samples `getTerrainHeight` again).
- **Change shape:** `scoreContourDirection` and `computeDirectionalSpeedFactor` both call `getTerrainHeight(position)` for the *same* current position in the same tick (`:1108` and `:1137`); memoize the current-position height once per tick per NPC. Optionally lengthen the rescore interval for NPCs that have been stalled >N ms (they are committed to a side anyway, `:72-75`).
- **Why it helps:** removes redundant height samples on the hottest path; the prior cycle proved per-tick sampling reduction is the lever (`perf-trust.md:38-40`).
- **How to prove:** L1 unit test counting `getTerrainHeight` calls per tick (a spy), plus A/B contour-timer delta.
- **Impact × measurability × risk:** medium × high × medium (touches live movement math — needs strict determinism + route-quality regression coverage; DEFEKT-4 just closed here, do not reopen it).

### L4 — Quiet-machine certification capture (STABILIZAT-1 protocol) — MEDIUM (necessary, not sufficient)
- **Files:** none in `src/`; `docs/perf/scenarios.md:60-70` (capture-environment discipline) + the `perf:capture:combat120` script.
- **Change shape:** run the canonical `npm run perf:capture:combat120` on an isolated box (no other browser game / agent / bake; clamp window per `scenarios.md:62-65`) to get a clean `peak_p99_frame_ms`. The harness already emits an **absolute** baseline-free check: `peak_p99_frame_ms` status `pass<25 / warn<60` (`perf-capture.ts:1409-1414`). For the ≤35 ms criterion specifically we read the raw value (the 35 ms gate is DEFEKT-3's number, between the harness's 25/60 bands).
- **Why it helps:** the prior captures were all on a contended workstation (`perf-trust.md:35-40`, `:59`); contention, not combat, dominated avg/max. A clean run may simply pass.
- **How to prove:** it IS the certification — but only trustworthy if L1 attribution confirms the frame is combat-bound and not a machine-contention artifact.
- **Impact × measurability × risk:** unknown-but-possibly-decisive × medium (env-dependent) × low (read-only capture). Caveat: cannot run inside this spike (headed browser + quiet box required).

### L5 — Synthetic micro-benchmark of the cover search (disprove, don't fix) — LOW priority, LOW cost
- **Files:** a new L1 vitest bench (proposed name CoverSearch.bench.test.ts) under `src/systems/combat/ai/`; exercises `CombatCoverGridProvider.queryWithLOS` + `AICoverSystem.findBestCover` at realistic candidate density.
- **Why it helps:** nails the upper bound on cover-search cost per call in isolation, closing the "is it really cheap?" question permanently and cheaply.
- **How to prove:** assert median call cost under a threshold (e.g. <0.05 ms with N cover spots) on the dev box. Coarse (JIT/GC noise) but sufficient to confirm order-of-magnitude.
- **Impact × measurability × risk:** low (it won't move p99) × medium × very-low. Include as a one-task confirmation, not a fix.

**Explicitly NOT levers** (per `perf-trust.md:187-196`): disabling terrain shadows, disabling close NPC models, per-sample render-submission drain, deep-CDP trace captures. Do not propose these.

---

## Measurement plan — proving progress WITHOUT a tracked baseline

`perf-baselines.json` is gone and intended to stay gone (`perf-trust.md:5-16`); `perf:compare` is non-gating raw-metrics. So we prove via **absolute thresholds + per-method attribution + single-run A/B deltas**, never via a stored baseline diff.

1. **Absolute harness gates (already exist, baseline-free).** `peak_p99_frame_ms` (`perf-capture.ts:1409-1414`), `hitch_50ms_percent` (`:1434-1439`), `combat_budget_dominance` (`:1474-1484`). DEFEKT-3's bar is the raw `peak_p99_frame_ms ≤ 35`. These need no baseline — they are hardcoded.

2. **Per-method tail attribution (L1).** From one capture's `runtimeSamples[*].combatBreakdown.aiMethodMs` + `.aiStateMs`, isolate the worst-p99 window and rank methods. This *proves which system owns the tail frame* from a single run. The cover timers (`engage.suppression.initiate.coverSearch`/`coverGridQuery`) being ~0 confirms DEFEKT-3's first clause directly; the contour/advancing cost being dominant confirms the real lever.

3. **Single-run A/B frame-time deltas for code levers (L2/L3).** Because absolute numbers are machine-contended, prove a *change* via two captures on the same box back-to-back with the same `--seed 2718` (`perf-capture:combat120` pins it; `scenarios.md:35`): control vs. lever-on. Report the delta in (a) the relevant `aiMethodMs`/`aiStateMs` entry and (b) `peak_p99_frame_ms`. A consistent negative delta across a couple of pairs is the proof, independent of the box's absolute speed. Prefer wiring the lever behind a perf-harness URL/env flag so both arms run from one build (the harness already threads flags like `--los-height-prefilter`, see `package.json` `perf:capture:combat120:losprefilter`).

4. **Deterministic unit proof of the per-tick reduction (L2/L3/L5).** The prior cycle certified its sampling cut with a *unit test*, not aggregates (`perf-trust.md:38-40`). Mirror that: L1 tests that spy on `getTerrainHeight`/the contour solve and assert call-count reductions. This is the most robust proof because it is immune to machine noise.

5. **Quiet-machine certification (L4).** Final ≤35 ms read on an isolated box, trusted only if (2) shows the frame is combat-bound.

**Acceptance for closing DEFEKT-3:** clause 1 ("no longer dominates p99") is proven by (2)+(5) — cover timers negligible in the tail window. Clause 2 ("p99 ≤35ms PASS") is proven by (1)+(5). If (5) still exceeds 35 ms with the tail dominated by uninstrumented render/Other, DEFEKT-3 should be **split**: mark the combat-side criterion met and spin the render/Other tail into a new directive (it is not a combat problem). That honest split is a legitimate cycle outcome.

---

## Task breakdown (descriptive slugs; R1 parallel / R2 after R1)

### R1 — parallel (independent, mostly measurement + isolated config)
- **`combat-p99-tail-attribution`** (L1): extend `scripts/perf-capture.ts` summary to emit per-method `aiMethodMs`/`aiStateMs` ranking for the worst-p99 sample window + the Combat-vs-Other split. Read-only against engine; touches only the harness script. Deliverable: a reproducible attribution table in `summary.json`.
- **`cover-search-cost-microbench`** (L5): add `CoverSearch.bench.test.ts` (L1) asserting `queryWithLOS` + `findBestCover` median cost under threshold at realistic density. Confirms/refutes cover-search innocence in isolation.
- **`contour-height-sample-dedupe`** (L3, the cheap half): memoize current-position `getTerrainHeight` once per tick across `scoreContourDirection` + `computeDirectionalSpeedFactor` in `CombatantMovement.ts`. Ship with an L1 spy test counting height calls/tick. (Determinism-preserving; no behavior change, only call-count.)

### R2 — after R1 (need attribution + dedupe landed first)
- **`crowd-stall-stagger-enable`** (L2): flip `crowdStallStaggerEnabled` on (or wire a perf-harness A/B flag), add the L2 coast-skips-solve test, and run the R1 attribution harness as the A/B proof. Gated on a playtest of NPC visual smoothness before default-on (the flag is off today specifically to protect that).
- **`combat120-quiet-certification`** (L4): on a quiet box, run `perf:capture:combat120` and record the raw `peak_p99_frame_ms` against the ≤35 ms bar, with the R1 attribution confirming the frame is combat-bound. If render/Other dominates the residual tail, file the split directive. (No `src/` change; certification + docs only.)

Each task is a single focused change. R1 has no interdependencies; R2 consumes R1's harness + dedupe.

---

## Fence implications

- **No task touches the fenced `src/types/SystemInterfaces.ts`.** Confirmed: `CoverSpatialGrid` and `CombatCoverGridProvider` are explicitly internal to `src/systems/combat/ai/**` and depend on the concrete classes, not a fenced interface (`CoverSpatialGrid.ts:24-27`, `CombatCoverGridProvider.ts:38-40`).
- `CoverSpatialGrid` *imports* `ITerrainRuntime` and calls `raycastTerrain` (`CoverSpatialGrid.ts:2`, `:276`; the method is fenced at `SystemInterfaces.ts:245`). All proposed levers **consume** that method as-is; **none add/alter** an `ITerrainRuntime` member. So no `[interface-change]` PR/approval is required.
- If any task were to need a new `ITerrainRuntime` query (none currently planned), it would require an `[interface-change]` title + human approval per `docs/INTERFACE_FENCE.md`. **Flagging proactively: keep L3's height memoization on the consumer side (cache the result of existing calls); do NOT add a batched terrain-sample method to the fenced interface** without escalating.

---

## Test strategy (per `docs/TESTING.md` four-layer contract)

- **L1 (pure):**
  - `cover-search-cost-microbench` median-cost bench (R1).
  - `contour-height-sample-dedupe` — spy on `getTerrainHeight`, assert reduced calls/tick with identical chosen direction (determinism preserved).
  - `crowd-stall-stagger-enable` — assert a coasted tick advances velocity + re-grounds and skips the spacing/contour solve (extends `CombatantMovement.test.ts` / `npcUnfreezeAndStuck.test.ts`).
  - Existing determinism coverage in `CoverSpatialGrid.test.ts` + `CombatCoverGridProvider.test.ts` guards the cover path against regression.
- **L2 (single-system):** `CombatantMovement` stall-recovery scenario — N crowded NPCs on a slope reach their goal within a bounded tick budget with stagger on vs off; assert no NPC enters an unbounded contour↔backtrack loop and route quality (path length / arrival) is non-regressed (reuse DEFEKT-4's route-quality assertions so that closure isn't reopened).
- **L3 (small scenario):** a small squad-suppression + convergence integration (extend `src/integration/combat/cover-grid-suppression.test.ts`) — assert grid hit/miss telemetry is sane and the cover search stays ≤2/suppression with the levers on.
- **L4 (full engine):** the `combat120` capture itself (`perf:capture:combat120`) — the R1 attribution + R2 quiet certification. This is the integration proof and the directive's acceptance evidence.

**Correctness proof:** L1 determinism + route-quality non-regression (no oscillation, no stuck NPCs, identical cover selection). **Non-regression proof:** full suite green (currently 5,260 tests per `perf-trust.md:34`) + the A/B p99 delta not going positive.

---

## Risks & open questions

1. **Superposition risk (biggest):** even a perfect contour-stall fix may not drop global p99 ≤35 ms because ~+2.9 ms is uninstrumented render/"Other" (`perf-trust.md:24-27`). The plan explicitly hedges this with the L1 attribution and the "split the directive" acceptance branch. Do not promise p99 PASS from combat work alone.
2. **Measurement-noise risk:** the dev box is busy (the user's own notes + `perf-trust.md:59` flag contention). Absolute avg/max are unreliable here; the plan leans on unit-test call-count proofs + same-box A/B deltas, with the absolute ≤35 ms read deferred to a quiet box this spike cannot provision.
3. **Stagger visual risk:** `crowdStallStaggerEnabled` is default-off by design; coasting could read as stutter. Default-on must be playtest-gated, not merged blind.
4. **DEFEKT-4 reopening risk:** L3 edits live in the just-closed movement/route-quality area. Strict determinism + route-quality regression coverage is mandatory; a behavior change (not just a perf change) here would reopen DEFEKT-4.
5. **Open: where exactly is the +2.9 ms render/Other?** Not resolved in this spike (out of combat scope). The L1 attribution will at least bound the Combat share; the render/Other half likely belongs to KONVEYER/render attribution work, not DEFEKT-3.
6. **Open: does the grid-miss fallback ever spike under a respawn burst?** `collectCoverCandidates` is TTL-gated 1/s/region, but a respawn that touches many fresh regions in one frame could batch several refreshes. L1 attribution should watch `engage.suppression.initiate.coverSearch` + the refresh cost at respawn frames specifically; if it shows up, a per-frame refresh-region budget (mirroring `MAX_COVER_SEARCHES_PER_FRAME`) is a cheap follow-up — but only if the data demands it.
7. **Open: `Math.random()` in flank-destination + `findSuitableZonePosition`** (`AIStateEngage.ts:909`) makes some suppression geometry non-deterministic, which slightly complicates exact A/B reproduction (seed pins spawns, not these draws). Acceptable for delta-of-aggregates proof; noted so nobody expects frame-identical A/B traces.
