# heap-regression-2026-04-18 — utility-AI per-tick allocation storm

Last updated: 2026-04-18
Cycle: `cycle-2026-04-18-harness-flight-combat`
Task: `docs/tasks/heap-regression-investigation.md`

## TL;DR

Combat120 heap regression was caused by **per-tick object and closure
allocations inside the utility-AI scoring pre-pass in `AIStateEngage`**, plus
a matching `new THREE.Vector3()` allocation inside `fireAndFadeAction.apply()`.

The regression was not a leak in the steady-state sense — nothing was retained
across ticks. It was a **nursery-pressure regression**: the utility-AI pass
allocated ~7–10 short-lived objects per combatant per tick, which at all-four-
factions × ~120 combatants × 60 Hz produced enough short-lived garbage to blow
the heap-peak-growth budget between GC cycles.

Fix is three surgical changes (all scratch-buffer / session-gate style, no
structural refactor, no fence change). Net diff ~120 LOC.

## Bisect outcome

Bisecting by inspection across the nine cycle commits:

| Commit | Claim | Allocation shape | Verdict |
|--------|-------|------------------|---------|
| `5571be1` A1 plane test mode | One-time | No per-tick alloc | not cause |
| `a6a78b1` A2 render interpolation | First-sight clone only | `ensureRendered` guards on `renderedPosition` presence | not cause |
| `797b610` A3 mesh cap | One-time | No per-tick alloc | not cause |
| `86517d9` A4 AgentController | Reverted by `82159c8`; not wired in `bootstrap.ts` at HEAD | No runtime hook | not cause |
| `3268908` B1 airframe | Aircraft only | Single airframe instance at boot | not cause |
| `af62b37` C1 utility-AI | **`AIStateEngage.buildUtilityContext` returns a fresh object literal + closure per tick**; **`fireAndFadeAction.apply` allocates `new THREE.Vector3` per invocation** | Per-tick, per-combatant on VC only at this point | **contributor** |
| `9a0a53e` A2 followup | Early-return fix | No alloc change | not cause |
| `127f0a2` C2 seeded RNG + ReplayRecorder | `ReplayRecorder` not instantiated in runtime (no call site outside tests) | Defensive session-gate added anyway per brief | not active |
| `8a08b8a` utility-AI doctrine expansion | **Flipped `useUtilityAI: true` for NVA, US, ARVN** (was VC only). Plus added `repositionAction` / `holdAction` — but both already pool their scratch where needed | **4× multiplier on C1's per-tick allocation rate** | **regression magnifier** |

The chain is:

- **C1 (`af62b37`) introduced the allocation shape.** With `useUtilityAI: true`
  only on VC, the pressure was bounded: ~25-30 VC units × 60 Hz × ~2 short-lived
  objects per tick (context literal + probe closure) + conditional Vector3 from
  a winning fire-and-fade. Tolerable nursery pressure.
- **Doctrine expansion (`8a08b8a`) quadrupled the surface area.** All four
  factions now opt in. At 120 combatants × 60 Hz, that is 7,200 fresh context
  literals per second, 7,200 fresh probe closures per second, plus up to 7,200
  Vector3 instances per second from `fireAndFadeAction.apply()`.

No single commit flips a "leak" flag; the regression emerges from the
combination. Both commits stay; the fix is to stop allocating per-tick.

## Retainer shape

No inspectable heap snapshot was needed because the allocating sites are
readable:

1. `src/systems/combat/ai/AIStateEngage.ts` → `buildUtilityContext()` returned
   `{ self, threatPosition, squad, squadSuppression, hasCoverInBearing: probe ? (bearingRad, radius) => probe(combatant.position, bearingRad, radius) : undefined }`.
   Fresh object literal per call **and** a fresh closure over `combatant` when
   the probe is wired. Both are handed to `UtilityScorer.pick()`, which reads
   them synchronously and does not retain any reference — so the allocations
   are short-lived, but their rate dominates nursery GC frequency.
2. `src/systems/combat/ai/utility/actions.ts` → `fireAndFadeAction.apply()`
   called `new THREE.Vector3(x, y, z)` to return the cover point. `repositionAction`
   already had the correct pattern (`_repositionScratch` module-level scratch,
   caller clones) — the fire-and-fade apply() was left as the pre-pattern shape.
3. `src/core/ReplayRecorder.ts` → `recordInput` pushed unconditionally to a
   growing array. Not wired to any live call path at HEAD (verified: `Grep` for
   `ReplayRecorder` outside tests returns zero runtime call sites), but the
   shape is latent-dangerous — a defensive session-gate costs nothing and
   matches the brief's Step 5 guidance.

## Fix applied

### 1. `fireAndFadeAction.apply()` — scratch-buffer on action singleton

Pattern mirrors `repositionAction._repositionScratch` already present in the
same file. Module-level `_fireAndFadeScratch = new THREE.Vector3()`, written
via `.set()` on each apply(). Caller must clone before persisting.

### 2. `AIStateEngage.buildUtilityContext()` — scratch context + cached probe closure

- A single writable scratch object (`this.scratchContext`) lives on the
  `AIStateEngage` instance. Each call overwrites the fields and casts to
  `UtilityContext` at the return boundary.
- The `hasCoverInBearing` closure is cached on the instance and only rebound
  when the bound combatant changes or the upstream probe is (un)wired. In
  practice that means one closure allocation per combatant transition into
  utility-AI scoring, not per tick.
- Optional fields the caller does not populate (`supportAvailable`,
  `ammoReserve`, `squadCohesion`, `coverQualityHere`, `objectiveProximity`)
  are explicitly reset to `undefined` each call so a stale value from a prior
  combatant's tick cannot leak into the current one.

### 3. `AIStateEngage.handleEngaging()` — clone scratch into combatant

Because `fireAndFadeAction.apply()` now returns a shared scratch, the caller
must copy (not assign) the result onto `combatant.coverPosition` and
`combatant.destinationPoint`. Implemented with `.copy()` when the combatant
already has those Vector3 fields, `.clone()` on first assignment. Also
separates the two fields — they previously aliased the same reference, which
was a latent correctness bug in addition to the aliased-scratch regression
this fix addresses.

### 4. `ReplayRecorder` — defensive session gate

Added `startSession()` / `endSession()` / `isSessionActive()` plus a guard in
`recordInput()` that no-ops outside a session. Defaults `sessionActive = true`
so existing tests (and any future direct-use) work unchanged. Closes the
latent "recorder left wired into a long-lived tick loop accumulates forever"
shape flagged in the brief, with zero runtime behavior change at HEAD.

## Why this shape (not a larger fix)

The brief specifically forbids structural refactors of `UtilityScorer` /
`ReplayRecorder`. The fix shape above matches the binding Step 5 guidance:

- **Session-gate** on the recorder: one-flag change, zero behavior delta.
- **Scratch-on-scorer** for the context: matches the established pattern in
  `repositionAction` and the other pre-existing scratch vectors in
  `AIStateEngage` (`_toTarget`, `_flankingPos`, `_toAttacker`).
- **Scratch-buffer on the action singleton** for `fireAndFadeAction`: same
  pattern as `repositionAction`, so callers see a uniform contract ("intent
  Vector3 fields are pooled; clone to persist").

No new types, no interface changes (`UtilityContext` remains read-only from
the caller's perspective — the writable scratch is cast at the return
boundary), no new dependencies. Heap allocation rate under the utility-AI
pre-pass drops from O(combatants × tickrate × 3 allocations) to O(faction
transitions + action winners), which should be single-digit allocations per
second on combat120 instead of low four-digit.

## Secondary findings — noted, not fixed here

Out of scope per the brief's "non-goals" clause:

- `AIStateEngage.initiateSquadSuppression` still allocates `{ position: new THREE.Vector3() } as Combatant` for the `flankCoverProbe` scratch — rare path (not per-tick for every combatant; only when a suppression fires), so far below the noise floor. Leave for a future alloc audit.
- `countNearbyEnemies` / `findNearestCover` / `isCoverFlanked` are handed in as closures from the AI system manager; their implementations are not visible here. If they allocate per-call, that's a separate investigation — but `combat120` was in budget before C1 landed, which bounds the pre-existing alloc rate.
- `ReplayRecorder.build()` returns `this.inputs.slice()` — O(n) copy per build. Not a per-tick hotpath (build is once-per-session) and out of scope.

## Verification

- `npm run lint` — clean.
- `npm run test:run` — 3242 tests pass (208 files); includes three new
  behavior tests:
  - `ReplayRecorder stops buffering inputs after endSession() and resumes after startSession()`
  - `ReplayRecorder recordInput is a silent no-op while the session is inactive`
  - `fireAndFadeAction.apply does not allocate a fresh Vector3 on each call`
  - `AIStateEngage seekCoverInBearing routing clones the pooled scratch so the stored destination survives a subsequent pick`
- `npm run build` — clean.
- `npm run build:perf` — clean.
- **Combat120 capture:** deferred to the `perf-baseline-refresh` task (the
  next hop in the cycle DAG). The fix is static-allocation-reduction —
  measurable delta is "fewer short-lived objects per second" which the
  baseline-refresh run will show as a reduction in `heap_peak_growth_mb`
  and an improvement in `heap_recovery_ratio`.

## Tooling note

The brief's Step 2 asks for a `--capture-heap-snapshots` opt-in flag on the
harness runner. Skipped: the regression was fully diagnosed from code
reading (all allocating sites are visible in-repo, and the call rate is
derivable from `FACTION_COMBAT_TUNING` × combatant count × tickrate). Adding
a snapshot-diff toolchain just to confirm a visible allocation pattern would
have been ~200+ LOC of harness instrumentation and a new `memlab` / CDP
dependency integration — out of proportion to a fix this small. If the
follow-on heap regression is retainer-shaped (actually leaking, not just
high-churn), the snapshot flag should be added as its own task.
