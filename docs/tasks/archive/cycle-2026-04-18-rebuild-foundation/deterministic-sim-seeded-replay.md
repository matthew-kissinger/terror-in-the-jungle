# Task C2: Deterministic sim — audit fix + seeded-replay prototype

**Phase:** C (rebuild R&D, runs on validated foundation)
**Depends on:** A4 merged (agent/player API makes input capture clean)
**Blocks:** reliable perf regression testing, agent training, bug-repro replays
**Playtest required:** no (infrastructure)
**Estimated risk:** medium — touches many systems' RNG sources
**Files touched:** new `src/core/SeededRandom.ts`, new `src/core/ReplayRecorder.ts`
+ `ReplayPlayer.ts`, surgical edits across systems to route RNG through the
seeded source, tests.

## Goal

Land deterministic single-machine replay for a 30-second session: record input +
seed, play back, compare final state. Fix the top ~20 non-determinism sources
catalogued in the E5 spike. Ship the seeded RNG + replay infrastructure; keep
cross-machine determinism out of scope.

## Background

From the E5 spike memo on `origin/spike/E5-deterministic-sim`:

- ~200 non-determinism sources catalogued (wall-clock, `Math.random`,
  `performance.now` in sim logic, iteration-order of `Set`/`Map`).
- Prototype showed a 30-second seeded replay converges to within a small
  epsilon on the same machine.
- Status: prototype-more. Full fix is O(weeks); this task lands the *path*
  and the top-20 sources.

## Required reading first

- `docs/TESTING.md`.
- `docs/INTERFACE_FENCE.md` — replay touches several systems; avoid fence
  changes.
- **On branch `origin/spike/E5-deterministic-sim`:**
  - `docs/rearch/E5-deterministic-sim.md` — memo + cataloged sources.
  - Any prototype RNG/replay code on the spike branch.
- `src/systems/combat/` RNG usage (sparsely grepped for `Math.random`).
- `src/core/GameEngine.ts`, `SimulationScheduler.ts` — where the replay clock
  and input pump live.

## Steps

1. Fetch E5 spike; read the memo. Extract the list of the top-20 offenders
   (weighted by frame frequency + behavioral impact).
2. Implement `SeededRandom` (xoroshiro128** or similar — match the spike if it
   chose one). Export `random()`, `randomInt(n)`, `pick(arr)`, `shuffle(arr)`.
3. Replace the top-20 `Math.random` / iteration-order sources with
   `SeededRandom` calls. Each replacement is its own small commit for rollback
   clarity.
4. Implement `ReplayRecorder`: captures input frames + seed at session start.
   Output is a typed data blob, not a file format yet.
5. Implement `ReplayPlayer`: takes a blob, drives the sim from captured
   inputs, asserts final state matches recorded final state within tolerance.
6. L3 integration test: 30-second scripted session, record → play → compare.
   Must converge within the declared tolerance.
7. CI flag: a new `npm run test:determinism` that runs the replay test on the
   top-3 scripted scenarios. Advisory on CI this pass; upgrade to required
   once stable.
8. Document the remaining ~180 offenders in
   `docs/rearch/C2-determinism-open-sources.md` so the next pass has a
   prioritized list.

## Exit criteria

- 30-second seeded replay converges within tolerance on the same machine.
- Top-20 non-determinism sources replaced.
- `npm run test:determinism` added and passes locally.
- `docs/rearch/C2-determinism-open-sources.md` lists remaining work.
- `combat120` p99 delta < 5% vs baseline (seeded RNG should be ≈free).
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- Cross-machine determinism (different FPU behavior). Single-machine only.
- Full 200-source replacement. 20 this pass; the rest queued.
- Networking / rollback. The replay blob is local-only.
- Byte-exact state comparison. Small epsilon (< 0.1m position, < 1° attitude,
  < 1 HP health) is the tolerance.

## Hard stops

- Fence change required: stop. Replay should ride on existing surfaces.
- Replay test doesn't converge within tolerance on the spike's 30-second
  session: stop and surface. Don't ship a flaky test.
- Perf regression > 5% from seeded RNG: stop; cached RNG is the likely culprit,
  surface for review.
