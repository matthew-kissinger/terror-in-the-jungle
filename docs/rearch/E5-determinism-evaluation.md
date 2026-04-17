# E5 — Deterministic simulation + replay: evaluation

Branch: `spike/E5-deterministic-sim`
Date: 2026-04-16
Author: E5 spike executor
Status: Decision memo — requires human go/no-go call before any Batch F follow-up.

## 1. Question

Is it worth the engineering cost to make the simulation deterministic enough
to replay a session from a seed + input log, on a single machine?

Out of scope: cross-machine determinism (different browser / FPU / hardware).

## 2. Audit summary (headline)

See `E5-nondeterminism-audit.md` for the full catalogue. Headline:

- **161 `Math.random()` call sites** in 45 non-test source files. Of those,
  ~100-110 sit in LOGIC paths (combat, AI, spawn, strategy, ballistics,
  air support, weather triggers). The rest are cosmetic (particles, audio).
- **90 `Date.now()` call sites** in 44 files. ~60 are in LOGIC (cooldowns,
  timers, respawn windows, cover TTL). The remainder are UI / save-game
  timestamps.
- **150 `performance.now()` call sites** in 43 files. Dominated by
  telemetry (~120). The ~30 LOGIC cases follow the same
  `(now - startTime) / 1000` shape as the `Date.now()` LOGIC set.
- **One variable-dt outer tick loop** in `GameEngineLoop.ts`, driven by
  `THREE.Timer` + `requestAnimationFrame` timestamps. `FixedStepRunner`
  exists but only wraps three consumers (player movement, helicopter
  physics, fixed-wing physics).
- **Five hot-path `Map` iterations** that are deterministic today because
  insertions are sequenced, but the property is unenforced and silently
  breakable.
- **One async source** (terrain worker) that does not currently bleed into
  gameplay state but would if reused.

Net: ~**200 logic-relevant call sites, ~50 files, one loop architecture
change.** Not 200 independent fixes — most collapse under two abstractions
(a seeded RNG and a sim-time clock).

## 3. Prototype result

Files (throwaway, on spike branch only):

- `spike/E5-determinism/seeded-rng.ts` — mulberry32 seeded PRNG.
- `spike/E5-determinism/replay-prototype.ts` — a deliberately small
  record-and-replay harness that runs two variants of an equivalent tick
  loop for 30 simulated seconds (1800 ticks @ 60 Hz, 16 entities).

### 3.1 Variant A — the current game's shape

Uses `Math.random()` for wander jitter + hit rolls. Uses `Date.now()` for
`lastHitTickAt`. No seed, no sim clock.

Two back-to-back runs with the same scripted input:

```
run 1 checksum len: 427
run 2 checksum len: 427
identical?          NO
```

Positions and health differ between runs after 1800 ticks. As expected.

### 3.2 Variant B — the post-determinism shape

Same tick logic, but:
- RNG calls go through `createRng(seed)`.
- Timestamps derive from the tick index (`simTimeMs = tick * (1000/60)`),
  not `Date.now()`.
- `deltaTime` is fixed at `1/60`.

Two runs with seed `12345` — and a third with seed `99999` as a sanity
check:

```
same seed identical?    YES
diff seed differs?      YES
```

Byte-for-byte identical final state for same-seed replays. Different seed
produces a different trajectory, confirming the RNG is actually contributing
(not just dead code).

### 3.3 What the prototype shows (and deliberately doesn't)

**Shows:**
- A ~60-line code change (seeded RNG + fixed dt + sim-time) is enough to
  make an equivalent-complexity slice go from "never replayable" to
  "byte-identical replay."
- The two abstractions collapse: one RNG seam handles every `Math.random`
  LOGIC site; one `simTimeMs` seam handles every `Date.now` and
  `performance.now` LOGIC site.
- The final state diff is a useful oracle. Checksum comparison over
  positions + health is trivial and decisive.

**Doesn't show:**
- Whether the real game's 45+-file RNG surface is tractable to thread in
  one pass. The prototype skips the plumbing burden entirely.
- Whether Three.js internal temps (matrix decompose, quaternion ops) hold
  on a real sim graph. They almost certainly do within one build, but
  that assumption is untested at scale.
- Whether async terrain streaming can stay cleanly out of gameplay writes.
- Whether the physics sub-step in `FixedStepRunner` is bit-stable across
  many frames. Suspected yes (the implementation is trivially
  deterministic); not verified.

## 4. Cost estimate (full implementation)

### 4.1 Structural work

| Phase | Work | Estimate |
|-------|------|---------:|
| 1. Introduce `SimClock` (a central sim-time counter, ticks + ms, reset on session start). Inject into a few core systems behind an interface. | seam creation, zero behavior change | 0.5-1 day |
| 2. Introduce `SimRng` (seeded, split into `sim` and `cosmetic` streams). Document the rule: sim systems take `SimRng`, effect pools use the cosmetic stream or keep raw `Math.random`. | seam creation | 0.5 day |
| 3. Replace variable-dt outer loop with tick-driven loop during replay. Production keeps current variable-dt but measures delta against sim clock when recording. `FixedStepRunner` usage extended to combat/weapons/AI outermost. | invasive; risk of feel regressions | 2-3 days |
| 4. Systematic find-and-replace of the ~100-110 `Math.random()` LOGIC sites with injected `SimRng`. Tests must cover determinism as a property. | large but mechanical | 2-3 days |
| 5. Systematic replacement of the ~60 `Date.now()` LOGIC sites and ~30 `performance.now()` LOGIC sites with `simClock.nowMs()`. | mechanical, lots of touch points | 1-2 days |
| 6. Record/replay harness: input buffer, seed capture, position/health checksum comparison, divergence bisection. Wire into CI as a nightly. | new testing infra | 1-2 days |
| 7. Lock iteration-order expectations in test (property: "replaying same inputs twice produces same final state" at L3 scenario level). | tests | 0.5 day |

**Floor: ~7 focused days. Realistic: 2-3 weeks given surrounding work,
interruptions, and at least one unexpected iceberg.**

The bulk of the work is item 4. It is not hard, but it is wide — 35-40
files each want a constructor change or a new parameter threaded through
a call chain. Most of those chains already carry `deltaTime`, so the
thread is already in place.

### 4.2 Risk hotspots

- **Combatant-spawn RNG.** `SpawnPositionCalculator` has 8 rolls per spawn
  decision. Threading one `SimRng` through without changing spawn behavior
  requires careful attention to call order. Easy to silently reorder the
  sequence and change spawn positions by 3 meters game-wide.
- **Cover cache.** `AICoverSystem` uses Map iteration at scale. Currently
  order-safe because of how insertions happen; proving this under a replay
  contract needs a test.
- **Flight model.** `FixedWingPhysics` + `HelicopterPhysics` already use
  `FixedStepRunner`, but they read real `performance.now()` for some
  animation-phase terms and read from `Date.now()`-driven interaction
  lockouts. Those are replay-visible because the player can see them.
- **Tests.** ~60 test files already use `Date.now()` or `Math.random()` in
  fixtures. Most are harmless; a few (marked test-file hits in the audit)
  actively mock `Math.random` and would need reconciliation.

### 4.3 Reversibility

- `SimRng` is reversible. Remove the parameter, tests pass with
  `Math.random()` again.
- `SimClock` is reversible. Remove the param, `Date.now()` comes back.
- The tick-driven replay loop is reversible — it only activates when a
  replay file is loaded.
- The fence on `SystemInterfaces.ts` is **not** touched by this work.
  Internal constructors change; no fenced method signature does. This was
  checked explicitly.

**Bottom line: the change is mechanical, mostly constructors, no fence
breakage.** It's wide, not deep. Can be undone in an afternoon if we
decide it's not worth carrying.

## 5. Value estimate

Four benefits were enumerated in `REARCHITECTURE.md` E5. Scored with
today's information:

### 5.1 Reliable perf regression testing — HIGH value

Current perf baselines (`scripts/perf-capture.ts`) already stress a scripted
scenario (combat120, frontier30m, etc.) but the numbers drift across runs.
Some of that drift is machine noise; an unknown fraction is sim-state drift
(different spawn positions, different hit rolls, different cover paths —
different p95). A deterministic sim would eliminate the second source
entirely.

**This is the strongest argument.** It directly improves the fidelity of a
tool we already invested in.

### 5.2 Bug repro — HIGH value

"Here is the 30-second replay that reproduces the stall at 127 NPCs." That
is transformative for diagnosing the remaining P0 combat AI p99 spike
(current state per `docs/BACKLOG.md`). Without determinism, stall
investigations are time-boxed against flakiness.

### 5.3 Agent training (if E4 lands) — MEDIUM value

An agent-as-player API (E4) benefits from a replayable environment for
training and for measuring agent behavior. It is not a hard blocker — many
RL environments are non-deterministic — but it makes the surface cleaner.
Weight depends on whether E4 lands.

### 5.4 Future networking rollback — LOW-MEDIUM value, long horizon

Real rollback netcode needs bit-for-bit determinism across machines, which
is explicitly out of scope here. Single-machine determinism is a
prerequisite but nowhere near sufficient. Useful signal, not a decisive
argument today.

### 5.5 Unlisted upside

- **Test flakiness goes down.** Several existing L2/L3 tests occasionally
  flake because they re-spawn combatants with random positions. A shared
  seeded RNG fixture would eliminate that class of flake. Hard to measure
  the win in advance but worth noting.

## 6. Cost vs value

**Cost: ~7-15 day range, mechanical, reversible.**

**Value: two HIGH-value unlocks (perf regression, bug repro), one
conditional MEDIUM (agent training), one distant LOW-MEDIUM (netcode).**

Per the decision rule in `REARCHITECTURE.md`: "if cost is <1 week of
focused work AND at least 2 listed benefits are high-value, invest."

- Two high-value benefits: **yes.**
- <1 week of focused work: **probably not.** The realistic lower bound is
  around 7 days, and only if done in one focused push with no surrounding
  surgery in combat/AI. In calendar time, 2-3 weeks is more honest.

So the strict decision rule says "scope smaller or defer." The rule,
however, was written before the audit. What the audit reveals is that the
cost is dominated by wide mechanical changes to files that are already
under active surgical work (B-track combat cleanup). That suggests a third
option.

## 7. Recommendation

**Prototype more, then invest in a smaller scope.**

Specifically:

1. **Build the seams in a tiny PR (~0.5 day).** `SimClock` and `SimRng`
   classes, checked-in, unused by production code. No fence change.
   Tests cover the abstractions themselves.
2. **Pick the highest-value consumer and convert it end-to-end.** My
   candidate: the projectile + ballistic-spread path (`GunplayCore`,
   `CombatantBallistics`, `CombatantCombat`). Small surface, high sim
   impact, and touches the ballistics module that is already scheduled
   for surgical review per the backlog. Measure: do same-seed replays of
   a 10-second firefight produce identical hit/miss sequences? This is a
   ~2-3 day scope.
3. **If that converges cleanly, commit to the broader pass in a named
   Phase F task.** The blocker has never been conceptual difficulty; it's
   diff width and test-concurrency with B-track combat work. A Phase F
   rollout that coordinates with B-track reduces conflict risk.
4. **If it diverges, the prototype itself still catches ~30% of the
   ballistic-flake surface.** Not a loss.

### What to NOT do

- **Do not attempt the full ~15-day pass as a single PR.** The diff width
  would guarantee conflicts with in-flight combat work and playtests.
- **Do not change any fenced interface.** None of this requires it. If a
  future version wants to expose `SimClock` on a fenced contract, that is
  a separate `[interface-change]` conversation.
- **Do not try to reach cross-machine determinism.** Explicit non-goal.
  The prototype shows single-machine is enough for the HIGH-value cases.

## 8. Reversibility

- `SimClock` / `SimRng`: constructors. Fully reversible in minutes per
  system.
- Replay-driven outer loop: opt-in (load a `.replay.json` to activate).
  Production loop unchanged when no replay is loaded.
- Iteration-order property tests: additive. Can be deleted without
  affecting production.

**No fenced interface change required. No rearchitecting required.
Pure plumbing.**

## 9. Open questions (for the decision session)

1. Does the B-track combat cleanup want to absorb the `SimRng` threading
   while it's already rewriting ballistic paths, or does it want E5 to
   stay out of the way? This is a coordination call, not a technical
   call.
2. If perf regression testing is the killer app, should the first
   deliverable be "deterministic combat120 capture" rather than "general
   replay"? That is a smaller, sharper, shippable scope.
3. Does the project have appetite for a nightly CI gate of "replay
   consistency"? Cost ~30 seconds of CI time, catches regressions that
   neither lint nor unit tests see.

## 10. Appendix — grep reproductions

Commands used (run from repo root, on this spike branch):

```bash
# Total sim non-determinism surface:
git grep -c 'Math\.random'   -- 'src/**/*.ts' ':!src/**/*.test.ts'
git grep -c 'Date\.now'      -- 'src/**/*.ts' ':!src/**/*.test.ts'
git grep -c 'performance\.now' -- 'src/**/*.ts' ':!src/**/*.test.ts'

# Variable-dt loop location:
git grep -n 'clock\.getDelta' -- 'src/core/GameEngineLoop.ts'

# Existing seeded PRNG infrastructure (mulberry32):
git grep -n 'mulberry32' -- src

# Fixed-step existing consumers:
git grep -n 'new FixedStepRunner' -- src
```

Raw totals at time of audit:

```
Math.random       — 161 sites, 45 files
Date.now          —  90 sites, 44 files
performance.now   — 150 sites, 43 files
```

Prototype exit:

```
$ npx tsx spike/E5-determinism/replay-prototype.ts
...
same seed identical?    YES
diff seed differs?      YES
```
