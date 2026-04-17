# E5 — Deterministic simulation + replay: decision memo

Branch: `spike/E5-deterministic-sim`
Date: 2026-04-16
Status: Decision memo — requires human go/no-go call before any Batch F follow-up.

Sibling artifacts on this branch:
- `E5-nondeterminism-audit.md` — per-file catalogue of every non-determinism source.
- `E5-determinism-evaluation.md` — fuller cost/value writeup.
- `spike/E5-determinism/seeded-rng.ts`, `spike/E5-determinism/replay-prototype.ts` — throwaway prototype demonstrating divergence vs. convergence.

## 1. Question

Is it worth the engineering cost to make the simulation deterministic enough
to replay a session from a seed + input log, on a single machine? (Cross-
machine determinism is out of scope.)

## 2. Non-determinism audit (headline)

Counts across non-test `src/**/*.ts` (commands in the evaluation memo
appendix):

| Source                | Files | Total sites | LOGIC sites (est.) |
|-----------------------|------:|------------:|-------------------:|
| `Math.random()`       |    45 |         161 |             ~100-110 |
| `Date.now()`          |    44 |          90 |               ~60 |
| `performance.now()`   |    43 |         150 |               ~30 |
| Variable-dt outer loop|     1 |           1 |                  1 |
| `Map`/`Set` hot paths |     5 |           5 | Safe today; unenforced |
| Async worker writes   |     1 |           1 | Terrain only; no sim bleed |

**~200 LOGIC call sites across ~50 files.** Full per-file catalogue in
`E5-nondeterminism-audit.md`.

Structural observations:

- The outer tick loop runs on `requestAnimationFrame` timestamp →
  `THREE.Timer` → variable `deltaTime` (see `GameEngineLoop.ts:65-66`).
  `FixedStepRunner` exists but only wraps player movement and vehicle
  physics; combat, AI, weapons, strategy, air support all integrate on the
  variable outer delta.
- `SimulationScheduler` already time-slices several groups (`tactical_ui`,
  `war_sim`, `air_support`, `world_state`, `mode_runtime`). Deterministic
  inputs into it are deterministic outputs.
- A seeded PRNG (mulberry32) already exists in `AirfieldLayoutGenerator` and
  `FirebaseLayoutGenerator`. The pattern is proven in the codebase — it
  just isn't reused for sim RNG.
- No `crypto.randomUUID()`, no async RNG sources, no worker writes into
  gameplay state. That is the hardest class of non-determinism, and we
  don't have it.

## 3. Prototype result

Prototype location: `spike/E5-determinism/`. Run via `npx tsx
spike/E5-determinism/replay-prototype.ts`.

Two tick-loop variants, each run for 30 simulated seconds (1800 ticks @ 60 Hz,
16 entities) against an identical scripted input sequence:

**Variant A** — mirrors the real game's shape (`Math.random()` for wander
and hit rolls, `Date.now()` for timestamps). Two back-to-back runs:

```
identical?          NO
```

**Variant B** — same tick, but:
- RNG calls route through `createRng(seed)`.
- Timestamps derive from tick index, not wall clock.
- `deltaTime` fixed at `1/60`.

Two runs with `seed=12345`, plus one with `seed=99999`:

```
same seed identical?    YES
diff seed differs?      YES
```

Byte-for-byte identical final-state checksum (positions + health) for
same-seed replays. The delta across abstractions is ~60 lines.

Caveat: the prototype demonstrates the *pattern*. It does not prove the
real game's wider surface is tractable in one pass — only that the two
abstractions (seeded RNG, sim-time clock) are the right shape.

## 4. Cost estimate

Structural work, broken into reversible phases:

| Phase | Work | Days |
|-------|------|-----:|
| 1 | `SimClock` + `SimRng` seams, zero production callers | 0.5-1 |
| 2 | Replay harness (input capture, seed, checksum diff, CI hook) | 1-2 |
| 3 | Fixed-step extension to combat/weapons/AI outer loop, gated on replay mode | 2-3 |
| 4 | Thread `SimRng` through ~100-110 `Math.random()` LOGIC sites | 2-3 |
| 5 | Thread `SimClock.nowMs()` through ~90 timer LOGIC sites | 1-2 |
| 6 | Iteration-order property tests | 0.5 |

**Floor ~7 focused days; realistic 2-3 weeks** given coordination with
in-flight B-track combat surgery. Mechanical, not conceptual. No fenced
interface change required.

### Risk hotspots

- `SpawnPositionCalculator` threads 8 RNG calls per decision — sequence
  order must be preserved exactly to keep spawn behavior identical.
- Cover/LOS cache iteration orders are deterministic today but unenforced;
  a property test is cheap insurance.
- Shader-time uniforms that read `performance.now()` — cosmetic but flagged
  because some anim curves drive hit-box transforms.

## 5. Value estimate

Against the vision anchors:

| Benefit | Value |
|---------|-------|
| Perf regression tests with same-seed sim replay (eliminates sim-state drift from the noise floor) | **HIGH** |
| Bug repro — "here's the replay that reproduces the 127-NPC stall" (directly helps the open P0 combat AI p99 issue) | **HIGH** |
| Agent training substrate (if E4 lands) | MEDIUM, conditional |
| Networking rollback (needs cross-machine — out of scope anyway) | LOW / distant |
| Test flakiness reduction as a side effect | MEDIUM, unlisted |

## 6. Reversibility

**Very high.** `SimClock` and `SimRng` are constructor parameters. Replay
loop is opt-in (activates when a `.replay.json` is loaded; otherwise the
current loop runs unchanged). Iteration-order tests are additive. Nothing in
fenced `SystemInterfaces.ts` needs to change.

If we decide later that the overhead isn't worth the maintenance cost, the
entire pass can be reverted in an afternoon.

## 7. Recommendation

**Prototype more, then invest in a smaller scope. Do NOT attempt the full
pass as a single PR.**

Concrete proposal, Phase F-sized:

1. **Tiny PR (~0.5 day):** land `SimClock` + `SimRng` seams, unused by
   production. Tests on the abstractions. No behavior change.
2. **Focused pilot (~2-3 days):** convert one high-value consumer
   end-to-end — recommended: the ballistic-spread path (`GunplayCore` +
   `CombatantBallistics` + `CombatantCombat`). Measurement: same-seed
   replay of a 10-second scripted firefight produces identical hit/miss
   sequence. If yes, the pattern generalizes. If no, the pilot catches
   ~30% of ballistic-flake surface anyway and is itself shippable.
3. **Commit to the broader pass** only after pilot data. Coordinate the
   rollout with B-track combat work so we aren't threading parameters into
   files that are being actively rewritten.
4. **First shipped feature, if we commit:** deterministic `combat120`
   perf capture. Single scenario, decisive oracle, improves a tool we
   already use daily.

Decision rule per `REARCHITECTURE.md` says "<1 week AND 2+ high-value
benefits → invest." We clear the benefits bar but not the time bar in a
strict reading. The recommendation above threads the needle: capture the
high-value perf + repro benefits with a sub-week pilot, keep a clean exit
if the pilot surprises us.

**Net recommendation: `prototype-more`.** Not "defer", not "invest now at
full scope."

## 8. Open questions (for the decision session)

1. **Coordination with B-track.** Does the combat surgery want to absorb
   the `SimRng` threading while it's already rewriting ballistic paths, or
   does it want E5 to stay out of the way until B-track drains?
2. **Scope of the first shipped feature.** Is "deterministic combat120" a
   better first product than "general replay," given that combat120 is the
   P0 pain and general replay is future-proofing?
3. **CI appetite.** ~30 seconds of CI time for a nightly replay-consistency
   gate — in or out?
4. **Stability of Three.js internal temps** across browser versions. We
   accept single-machine, but "single machine" includes auto-updating
   Chrome. Do we need a version-pin policy for perf baselines?

## 9. What NOT to do

- Do **not** attempt the full ~15-day determinism pass as a single PR.
  Width guarantees conflict with in-flight combat work.
- Do **not** change any fenced interface in `SystemInterfaces.ts`. Nothing
  here requires it.
- Do **not** try to reach cross-machine determinism. Explicit non-goal.
  Single-machine is enough for the HIGH-value cases and dodges a decade of
  IEEE 754 / WebAssembly / WebGPU determinism-vs-hardware argument.

## 10. Appendix — what the prototype actually produced

```
E5 determinism spike — record/replay prototype

Variant A (Math.random + Date.now, matches real game):
  run 1 checksum len: 427
  run 2 checksum len: 427
  identical?          NO

Variant B (seeded RNG, fixed dt, sim time from tick index):
  run 1 (seed 12345):     0:2.7252,-6.2514,-625.09|1:12.7963,-6.2398,-525.99|...
  run 2 (seed 12345):     0:2.7252,-6.2514,-625.09|1:12.7963,-6.2398,-525.99|...
  run 3 (seed 99999):     0:2.7749,-6.3012,-458.99|1:12.8650,-6.3177,-534.91|...
  same seed identical?    YES
  diff seed differs?      YES
```
