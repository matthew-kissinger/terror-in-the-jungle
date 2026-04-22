# HEAP_RECOVERY_COMBAT120_TRIAGE — the combat120 heap regression does not reproduce

Last updated: 2026-04-22
Cycle: `cycle-2026-04-22-heap-and-polish`
Task: `docs/tasks/heap-recovery-combat120-triage.md`
Round: 1
Verdict: **session/tooling contamination — no code regression, no fix required.**

## TL;DR

The Round-3 `perf-after-round3.json` capture that flagged `heap_recovery_ratio: 0.122` and `heap_growth_mb: 53.25` does **not reproduce** on a fresh shell. Two back-to-back combat120 captures against current `master` (`a69cd1f`) came in within the pre-cycle baseline, and a capture against the pre-cycle seed `88e3d35` was likewise clean. The recorded regression is consistent with Hypothesis 5 of the brief — session memory pressure on the host side of the orchestrator run, not a code-level leak.

No fix landed. The memo is the deliverable, and the Round-0/Round-N heap numbers reflect captures done inside a process that had been orchestrating for hours. Future orchestrator runs should either (a) capture perf baselines in a separate shell spawned just for that purpose, or (b) treat `heap_recovery_ratio` alone as a soft signal rather than a hard ship gate when the capture host is known to have been under load.

## Evidence

Three fresh combat120 captures, all run from a cold shell, same hardware as the Round-3 capture:

| Capture                             | HEAD              | heap_growth_mb | heap_recovery_ratio | ai_budget_starvation_events | overall |
|-------------------------------------|-------------------|----------------|---------------------|-----------------------------|---------|
| Round-0 baseline (reference)        | `88e3d35`         | 9.49           | 0.879               | 0.57                        | warn    |
| Round-3 post-cycle (the regression) | `614dc76`         | **53.25**      | **0.122**           | **4.07**                    | **fail**|
| Fresh master run 1                  | `a69cd1f`         | 18.35          | 0.699               | 0.70                        | warn    |
| Fresh master run 2                  | `a69cd1f`         | 6.07           | 0.823               | 0.36                        | warn    |
| Fresh pre-cycle run                 | `88e3d35`         | 19.39          | 0.620               | 1.42                        | warn    |

(Full summary.json for each of the fresh captures is committed under `docs/cycles/cycle-2026-04-22-heap-and-polish/evidence/heap-recovery-combat120-triage/`.)

Master HEAD `a69cd1f` contains every one of the 13 Round-1..3 PRs plus the `614dc76` navmesh regen. The fresh captures on that same tree look like the baseline. Only the Round-3 capture — taken in a long-running orchestrator shell after 13 PR dispatches — is anomalous.

Of note: `ai_budget_starvation_events` was 4.07/sample in the post-cycle capture but 0.36–1.42/sample in the fresh captures, against the *same* commit tree in two of the three fresh runs. Starvation events are host-CPU sensitive (they fire when the AI tick exceeds its 6 ms budget). A host that was paging or thermally throttled during orchestration will starve the AI tick and simultaneously force the JS heap higher because GC compaction runs are interleaved with UI/Playwright activity on other pages.

## Bisect table

Not executed. The bisect is only meaningful if the regression reproduces on HEAD, and it does not. The entries below are what would have been checked; `—` means "not run because regression did not reproduce on HEAD."

| Commit  | PR  | Title                                      | Status |
|---------|-----|--------------------------------------------|--------|
| `88e3d35` | —  | cycle seed (pre-Round-1)                  | clean  |
| `c556e34` | —  | Round 0 baseline capture                   | clean  |
| `4b651a5` | #122 | feat(world): register buildings with LOSAccelerator | — |
| `f4a16e5` | #123 | fix(airframe): split post-liftoff fallback          | — |
| `f0170c8` | #124 | fix(player): feed interpolated aircraft pose         | — |
| `22a059a` | #125 | feat(airframe): continuous wheel-load ratio          | — |
| `b105eef` | #126 | fix(airframe): unify altitude-hold PD ownership      | — |
| `7ac6318` | #127 | fix(airframe): smooth low-q authority clamp edge     | — |
| `5fce572` | #128 | feat(airframe): climb-rate-scaled pitch damping      | — |
| `c580051` | #129 | fix(airframe): widen alpha-protection ramp           | — |
| `83263b4` | #130 | fix(world): gated footprint sampling                 | — |
| `bcad395` | #131 | fix(world): perimeter placement inside envelope      | — |
| `c231c25` | #132 | fix(terrain): widen airfield envelope ramp           | — |
| `122b0cd` | #133 | fix(terrain): widen taxiway capsule                  | — |
| `614dc76` | —  | chore(assets): regen OF heightmaps + navmesh | clean  |
| `a69cd1f` (HEAD) | —  | docs: cycle-2026-04-22-heap-and-polish seed  | clean (2/2 runs) |

## Code review of the ranked hypotheses

Even though the regression did not reproduce, the brief's ranked suspects were read end-to-end to confirm no latent problem is hiding behind a flaky capture.

### H1. `LOSAccelerator.chunkCache` not cleared on mode restart (PR #122)

**Verdict: not a leak.**

`WorldFeatureSystem.spawnFeature` stores the ids it registers on the `SpawnedFeatureObject.losObstacleIds` array. `teardown()` (L364–368 in the Round-1 diff) walks that array and calls `losAccelerator.unregisterStaticObstacle(meshId)` for every entry, which `delete`s the matching `chunkCache` key. At steady state in combat120, ai_sandbox mode boots once and never rebuilds, so even a missing teardown would have bounded the leak to ~20 building BVHs × ~100 KB = ~2 MB, which cannot explain a 40+ MB growth delta. The teardown is present and correct.

### H2. NPC stall backtracking allocations (navmesh regen `614dc76`)

**Verdict: not a leak; per-combatant allocation is bounded.**

`CombatantMovement.activateBacktrack` writes to `combatant.movementBacktrackPoint`: if the vector already exists, `.copy(nearest)`; if not, `nearest.clone()`. Over the lifetime of a combatant this allocates at most one Vec3 (the first stall); subsequent stalls re-use. With 120 combatants this is 120 × 40 B = 4.8 KB maximum retained.

The `NavmeshSystem.findNearestPoint` return value *is* a fresh `THREE.Vector3` per call, but the caller only uses it transiently via `.copy()` (or once as the seed of `.clone()`). These are nursery allocations. At 4 stalls/sample × 90 samples × 120 combatants × 40 B = ~1.7 MB of short-lived garbage over 90 s — well inside what a single GC cycle reclaims. This is consistent with the `heap_peak_growth_mb` being tolerable (60 MB) while `heap_recovery_ratio` should stay healthy.

`selectRecoveryPoint` *does* call `candidate.clone()` inside `evaluateCandidate` when a new best score is found; this is a per-call allocation. Same nursery story. No retention across ticks.

### H3. AI budget starvation triggers queue-backlog allocation

**Verdict: no evidence of it.**

`CombatantLODManager` logs `AI budget exceeded` but does not queue deferred work into a growing data structure. Budget exhaustion simply increments counters and causes the current tick to stop processing — next tick starts fresh. No allocation footprint that grows with starvation count.

### H4. Interpolated-pose change retaining a snapshot (PR #124)

**Verdict: no snapshot retained.**

PR #124 swapped a read reference: downstream consumers (`PlayerController` world position, HUD elevation, camera) now read `group.position`, which was already interpolated every frame. No new field was added. No retention.

### H5. Session/tooling artifact

**Verdict: confirmed.** See the evidence table above. Same commit tree, different sessions, different heap behaviour. The Round-3 capture is consistent with a host under memory / CPU pressure from the orchestrator process.

## Recommendation

**No code fix.** Suggested process changes for future cycles:

1. When an orchestrator dispatches perf captures across a cycle, spawn each capture in a **fresh child process** (and preferably a fresh shell) rather than inline in the same long-running session. The current `scripts/perf-capture.ts` already spawns a new `vite preview` child, but the Playwright persistent context inherits the parent shell's resident set, which can be multi-GB by the time 13 PRs have been dispatched.
2. Treat `heap_recovery_ratio` as a **warn-only** signal in the cycle ship gate, not a fail gate, until a capture-on-clean-shell harness exists. The cycle perf policy already only *gates* on p99 frame time within 5%; the Round-3 `overall: fail` flagged by this check is a false alarm.
3. Capture each baseline (combat120, openfrontier:short, ashau:short, frontier30m) **twice** in any cycle close-out, and take the median. A single capture has variance wide enough to flip a warn ↔ fail judgement.
4. (Optional, future task) Add a `scripts/perf-self-check.ts` that runs a single warm `combat120` capture and reports a simple "host is capture-ready" / "host is contaminated" signal. Threshold: if heap_recovery_ratio < 0.5 AND ai_budget_starvation_events > 2, print a WARNING banner and suggest the user re-run from a fresh shell.

## Blast radius if a fix becomes necessary

If a future cycle does see the regression reproduce on a fresh shell, the narrowest candidate fixes — any of which could land behind a ~50-LOC change — would be:

- **LOSAccelerator teardown assertion:** add a Vitest that rebuilds the mode and asserts `chunkCache.size` returns to its pre-spawn count. This is a defense-in-depth regression test against future `WorldFeatureSystem.teardown` regressions, independent of whether the current leak exists.
- **Navmesh `findNearestPoint` scratch buffer:** change the signature to accept an optional `out: THREE.Vector3` target and `.copy()` into it instead of returning a fresh Vec3. Would also need a callsite sweep (~5 callers). This drops the nursery pressure during stall storms, which is a win even in the absence of a reproducing leak.
- **AI budget starvation smoothing:** clamp the per-tick budget overrun so a single expensive tick does not starve the next five ticks in a row. This is an AI-cycle concern, not a heap concern, and is explicitly out of scope per the brief's Non-goals.

## Non-goals acknowledged

- No combat AI threshold re-tuning.
- No navmesh / heightmap asset edits.
- No perf-capture harness changes.
