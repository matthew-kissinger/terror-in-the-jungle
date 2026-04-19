# perf-openfrontier-navmesh-fix: driver queryPath returns null on open_frontier

**Slug:** `perf-openfrontier-navmesh-fix`
**Cycle:** `cycle-2026-04-18-harness-flight-combat`
**Round:** 4 (extension; blocks Round 3 retry of `perf-baseline-refresh`)
**Depends on:** `perf-harness-verticality-and-sizing` (PR #94 — tightened the path-trust invariant; the null-path degradation is what this task now addresses)
**Blocks (in this cycle):** `perf-baseline-refresh` (Round 3; cycle closer)
**Playtest required:** no (diagnosis + surgical fix)
**Estimated risk:** low-to-medium — touches harness-side navmesh usage and possibly capture-side asset-warm waiting. No combat/AI code change.
**Files touched:**
- `scripts/perf-active-driver.cjs` (instrumentation + possibly snap-to-navmesh before first query)
- `scripts/perf-capture.ts` (possibly: wait for navmesh-ready signal before starting warmup)
- Possibly `src/systems/navigation/NavmeshSystem.ts` (ready-signal export if not already there; fence-check first)
- Tests for any behavior change

## Why this task exists

The Round 3 `perf-baseline-refresh` executor (2026-04-19) ran 4 back-to-back captures on the redesigned harness. Three completed; `openfrontier:short` **failed** the `peak_p99_frame_ms` validator at 63.3ms (validator floor 60ms). Root cause surfaced in the driver's debug counters:

```
waypointReplanFailures = 202
waypointsFollowedCount   = 0
```

On `open_frontier`, `NavmeshSystem.queryPath(start, end)` returns null on every driver re-plan throughout the 180s capture. Layer 1 (navmesh pure-pursuit) never activates; the driver falls through to Layer 2 gradient-probe exclusively, which oscillates along slopes and produces hitch-class frame spikes (0.84% of frames > 50ms).

This has been **latent since `perf-harness-redesign` (PR #90) merged on 2026-04-19**. The stale baselines (p99 = 100ms sentinel, unchanged since 2026-03-06) masked it until the Round 3 rebaseline attempted to write a realistic threshold.

Three of the four perf scenarios are unaffected:
- `combat120` (map `ai_sandbox`, seed 2718) — passes, avg 16ms / p99 34ms. Flat map, no navmesh dependence in practice.
- `ashau:short` (map `a_shau_valley`) — passes, p99 13.8ms.
- `frontier30m` (same map as openfrontier) — not captured; would almost certainly hit the same wall.

## Known facts (don't re-investigate these)

- Prebaked navmeshes exist on disk for `open_frontier` seeds 42, 137, 2718, 31415, 65537:
  ```
  public/data/navmesh/open_frontier-*.bin
  ```
- The harness command is `--mode open_frontier --npcs 120 --duration 180 --warmup 20 --sample-interval-ms 1500 ... --runtime-preflight false`. No `--seed` flag, so the mode picks a seed from `MapSeedRegistry`.
- `NavmeshSystem.queryPath` (`src/systems/navigation/NavmeshSystem.ts:687`) returns null if `this.navMeshQuery` is null OR `computePath(...).success === false` OR `result.path.length === 0`.
- Driver call site (`scripts/perf-active-driver.cjs:1118-1137`): `planWaypoints` is guarded against null `navmeshSystem`/missing `queryPath`, wraps `computePath` in `try`, returns null on any failure without logging.
- Driver re-plan throttle (`scripts/perf-active-driver.cjs:1843-1862`): per-mode `waypointReplanIntervalMs` default 5000, with a 750ms fallback window when the path is exhausted. So "202 failures in 180s" ≈ one failure per 0.9s on average — consistent with the 750ms fast-path triggering repeatedly because `state.waypoints` stays null.

## Likely root causes (ranked)

Rank these yourself after instrumentation, but this is my prior:

1. **Harness-picked seed is not in the prebaked list.** `MapSeedRegistry` may return a seed outside `{42, 137, 2718, 31415, 65537}`; the runtime then falls back to live navmesh generation (or gives up). If live gen is slow/async and the harness starts the capture before it's ready, every early `queryPath` call returns null, and whatever "hot cache" mechanism does exist may never populate because the harness keeps querying before the bake finishes. **Cheapest test:** pin the capture command to `--seed 42` (or another prebaked seed) and re-run. If it fixes, the root cause is seed selection.
2. **Navmesh loaded but `navMeshQuery` is not initialized at first query.** The prebake loads, but `navMeshQuery` (the recast-wrapper handle) is set later than the driver's first query. Driver queries at t=warmup+0s; navmesh could still be async-initializing.
3. **Player spawn is off-mesh.** Harness teleports the player to a start position that's not on the navmesh (off-terrain, on a water tile, on a too-steep slope). `findClosestPoint` would succeed but `computePath` fails because start-poly is invalid. **Diagnostic:** log `isPointOnNavmesh(playerPos)` on first query fail.
4. **End point (engagement anchor / objective) is off-mesh.** Symmetrical to (3) but for the query target.

A quick sanity check for (1): the `combat120` seed is pinned to `2718`, and `ai_sandbox` has a trivial navmesh. `ashau:short` passes with no pinned seed — `a_shau_valley` has no prebaked navmeshes in `public/data/navmesh/` (only OF/ZC/TDM are prebaked there), so a_shau must be generating navmesh live and succeeding. That suggests live-gen is not the blocker by itself; something about OF specifically is.

## Steps

1. Reproduce. Run `npm run perf:capture:openfrontier:short` once. Confirm `waypointReplanFailures > 100 / waypointsFollowed == 0` in the capture's `replay.json` (or driver debug snapshot). Note the seed the harness picked.
2. Instrument `planWaypoints` (`scripts/perf-active-driver.cjs:1118`) to log on first N failures:
   - `systems.navmeshSystem.isPointOnNavmesh(startVec)` — is start on mesh?
   - `systems.navmeshSystem.isPointOnNavmesh(endVec)` — is end on mesh?
   - Whether `navmeshSystem.navMeshQuery` is truthy (add an `isReady()` helper if not already present; if needed, export via the existing nav system public surface — **not via SystemInterfaces.ts unless you check the fence first**).
   - Log only the first 3 failures per capture to keep console noise low.
3. Pick the quickest disprove/confirm for each ranked cause:
   - **Cause 1:** pin `--seed 42` in the package.json command, re-run. If passes → seed selection is the bug. Fix: either (a) pin the capture to a prebaked seed (preferred; keeps baseline reproducible), or (b) ensure `MapSeedRegistry` only returns seeds with prebakes when the harness requests them.
   - **Cause 2:** if seeds 42, 137, ... all still fail, log `navMeshQuery` readiness. If null at first query, add a `waitForReady()` gate either in the driver's first query path or in the capture's warmup phase (before the driver starts ticking). Capture-side wait is cleaner because it keeps the driver simple.
   - **Cause 3/4:** if mesh is ready and seeds are prebaked but queries still fail, log start/end polys. Fix: add `findNearestPoint` snap before `queryPath` in `planWaypoints`. If the snapped point is within a few meters, use it as the start; if further, it's a real off-mesh spawn problem for the capture-side to address.
4. Land the smallest fix that makes `openfrontier:short` produce `waypointsFollowedCount > 50` and `validation.overall != 'fail'` on a single run.
5. Verify on the other open_frontier-dependent scenario: also run `npm run perf:capture:frontier30m` smoke for the first 90 seconds (or do a manual early-stop after 2 minutes if the full 30-min run isn't worth the time). If the short run shows same waypoint health, ship.
6. `npm run lint`, `npm run test:run`, `npm run build` green.
7. Do **not** run `perf:update-baseline`. That is Round 3's job after this fix lands.

## Exit criteria

- `openfrontier:short` 180s capture shows `waypointsFollowedCount > 50`.
- `openfrontier:short` `validation.overall != 'fail'` (warn is acceptable — baseline threshold choice is Round 3's job).
- `ashau:short` and `combat120` still pass (regression guard — don't break what's working).
- One behavior test added if code changes warrant (e.g. "planWaypoints returns a path when navmesh is ready and start/end are on-mesh" or "capture waits for navmesh ready before warmup").
- Fix is ≤ 150 LOC net. This is a surgical bugfix; if it grows bigger, scope is wrong.
- PR body includes: ranked causes, which one proved out, before/after driver counters (`waypointsFollowedCount`, `waypointReplanFailures`, peak p99).

## Non-goals

- Do not rework the `MapSeedRegistry` policy. If the fix is to pin a seed in the capture command, that's one line in `package.json`.
- Do not change the 60ms p99 validator threshold in `scripts/perf-capture.ts:819`. Making it scenario-aware is a separate task.
- Do not touch combat AI, weapon systems, or factions. The bug is in the driver/capture harness or in navmesh warm-up, not in gameplay code.
- Do not add retry loops that mask the bug. If queryPath returns null, the fix either gets the mesh ready or the points on-mesh — not "try again and hope."
- Do not modify `perf-baselines.json`. Round 3 handles that.
- Do not expand `src/types/SystemInterfaces.ts`. If you need a nav-ready signal and the interface doesn't expose it, expose it on the `NavmeshSystem` class directly — same worked for `planWaypoints` consuming `queryPath` today (not fenced).

## Hard stops

- Fix requires changing `SystemInterfaces.ts` → STOP and surface.
- Fix requires rearchitecting the `MapSeedRegistry` → STOP; propose a narrower task.
- Fix requires loosening the 60ms validator → STOP; the validator is correct, the driver needs a working path.
- `openfrontier:short` still fails after the instrumented diagnosis (no cause from the ranked list proves out) → STOP; report findings, propose Round 5.
- Diff > 150 LOC → STOP; scope is wrong.
- Any cause-3/cause-4 fix would require moving the harness start position → STOP and check whether a capture-side spawn change changes the baselines' meaning; escalate.

## References

- Round 3 report (inline in the conversation that dispatched this task).
- `scripts/perf-active-driver.cjs:1118` (planWaypoints), `:1843` (re-plan throttle), `:2122` (driver-stop log that surfaced the counter).
- `src/systems/navigation/NavmeshSystem.ts:687` (queryPath), `:708` (findNearestPoint), `:724` (isPointOnNavmesh).
- `public/data/navmesh/open_frontier-*.bin` (prebaked seeds 42, 137, 2718, 31415, 65537).
- `src/config/MapSeedRegistry.ts` (seed rotation).
- Stale-baseline context: `perf-baselines.json` lastUpdated 2026-03-06; combat120 p99 set to 100ms sentinel.
