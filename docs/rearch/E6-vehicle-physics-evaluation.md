# E6 — Vehicle physics rebuild: evaluation

Branch: `spike/E6-vehicle-physics-rebuild`
Date: 2026-04-16
Author: E6 spike executor
Status: Decision memo. Requires human go/no-go call before any Batch F work.

Companion: `docs/rearch/E6-vehicle-physics-design.md` (design proposal + audit).

## 1. Question

Should the fixed-wing flight model be rebuilt as one coherent system, rather
than the current four-layer arrangement (`FixedWingPhysics` +
`FixedWingControlLaw` + `FixedWingPlayerAdapter` + `FixedWingConfigs`)? If
yes, what does the replacement look like?

## 2. Measurement

Prototype in `spike/E6-airframe/` — a unified `Airframe` class with a single
`step(intent, terrain, dt)` entrypoint, one config schema, explicit `raw` vs
`assist` tiers, and a swept-collision hook.

| Scenario | Current (production) | Unified (prototype) |
|----------|----------------------|---------------------|
| Arrow-up visible pitch on frame 1 (ground, zero speed) | 0° (smoothstep-gated) | 5.1° |
| Climb into a 60% grade ridge ~400 m ahead | Passes through (point-sample collision) | Clamps on slope at the sweep intersection |
| Full right stick 1 s → center → time to wings-level (assist) | 1.5–2 s, with occasional over-shoot and re-level cycle | 1.22 s, monotonic |
| Full right stick 1 s → center → time to wings-level (raw) | N/A (current has no pure raw mode; `direct_stick` is a mix) | Never (correct — raw has no autolevel by definition) |
| Frame cost per tick | ~0.8–1.0 µs (current FixedWingPhysics, no swept collision) | ~1.2 µs (unified, swept collision included) |
| Total runtime files owning flight behavior | 4 core + 2 support | 1 core + 1 config file per aircraft |

Additional audit findings from `E6-vehicle-physics-design.md` §1:

- **9 cross-file invariants** currently implicit — including a sign-flip on
  `rollCommand` between raw and assist tiers, two separate liftoff paths,
  three overlapping phase enums, and two hidden modes (`pilotMode` and
  `orbitHold`) that cross all four files.
- **4 concrete cross-vehicle state bleeds** verified between helicopter and
  fixed-wing adapters — most notably `PlayerCamera.flightMouseControlEnabled`
  never reset on adapter exit, producing different plane-handling behavior
  after a prior helicopter session. Claim B from the task brief is real.
- **Claim A (arrow-key wiring bug) is NOT real.** The signal does reach
  the physics layer. The "unresponsive" feel is a smoothstep authority gate
  inside `stepGrounded` — a perception/design problem the rebuild fixes by
  deleting the gate.

Prototype cost: ~600 lines of new code (`airframe.ts` + `scenario.ts`),
produced and runnable without touching production code. Full port cost
estimated below.

## 3. Cost estimate

### 3.1 To full implementation (Batch F, if approved)

| Work | Rough cost |
|------|-----------:|
| Land `Airframe` + types + Skyraider config behind feature flag | 2 days |
| Shadow-run instrumentation (optional, helps confidence) | 1 day |
| Port F-4 and AC-47 configs (data migration, not logic) | 0.5 day |
| NPC pilot path on `Airframe` (currently unused for fixed-wing) | 0.5 day |
| Playtest + tuning pass (arcade-feel calibration) | 2 days incl. real pilot hours |
| Migrate HUD/camera/animation to read unified snapshot | 1 day |
| Delete legacy path + tests after one release cycle | 0.5 day |
| Contingency (production integration always finds ugliness) | 2 days |
| **Total** | **~10 engineer-days** |

### 3.2 To not do it

The status quo has a slow tax:

- Every future fix to fixed-wing feel requires touching 2–3 files and
  re-deriving the ground/airborne invariant by hand. 1–2 hours overhead
  per small change.
- Each new aircraft costs a `FIXED_WING_CONFIGS` entry AND coordination
  with `PILOT_TUNING` AND often a `FixedWingOperationInfo` entry. The
  friction is why the three we have feel same-y.
- Cross-vehicle bleeds surface as "it's weird after I flew a Huey"
  bug reports. Hard to repro, hard to pin down.
- Collision pass-through is a perennial -1 on the playtest sheet.

Cumulative cost of ~2 surgical fixes/quarter for the life of the project,
each ~0.5 day, is roughly equivalent to the rebuild budget inside 5
quarters — but without ever actually solving the class of problem.

## 4. Value estimate

Vision anchors (from `docs/REARCHITECTURE.md`):

| Anchor | Impact |
|--------|--------|
| Large-scale AI combat (3 000 agents) | Neutral. Fixed-wing is never high-count; 2–10 aircraft in world. |
| Stable frame-time tails under load | Small positive. Single sim class has predictable cost; swept-collision cost scales with aircraft count (~2–10) not terrain size. |
| Realistic/testable large-map scenarios | Positive. Swept collision fixes a real bug class on the 21 km DEM where ridges are aggressive. |
| Playable by agents in real time | Positive. Structured `AirframeIntent` is directly consumable by E4's agent action API. Current `FixedWingPilotIntent` has leaky "direct-stick" + "assist" mode fields that would force agents to reason about human-input artefacts. |

Playtest value is the main justification:

- Arrow-up unresponsiveness is the #1 complaint on the latest session.
- Terrain pass-through on climb-out is the #2.
- Weird-after-helicopter is a #3 most sessions mention.

All three are cured or mitigated by the rebuild. They are not cured by a
fourth surgical pass — the 24a94e7 arcade rewrite was that pass.

## 5. Reversibility

**High.** The proposed migration lands behind a feature flag from day one.
Every intermediate state keeps the legacy path working. Shadow-run
instrumentation is optional but available. If playtest says "no", flip
the flag off; the legacy path is still the executing code. Delete the
unfinished `Airframe` files.

Cost of a rollback at any stage: near-zero through Phase 3. After Phase
4 (flip) the legacy path lives alongside for one release, so rollback is
one config change. After Phase 5 (delete) the change is irreversible
without a real revert.

Contrast with, for example, an ECS migration of combat (E1): rolling
back after committing the storage format is a full rewrite. Vehicle
physics rebuild is *much* more reversible because the seam (construct
one physics object per aircraft) is narrow and boolean-gated.

## 6. Recommendation

**Prototype more — specifically, a real in-engine Skyraider port behind
a flag. Then decide.**

The headless spike is decisive on the *shape* of the replacement and the
fact that the core loop fits in one page of code at ~1.2 µs/tick. What
the headless spike cannot tell us:

- Does the Skyraider *feel* right in the actual game with real terrain
  and real camera? The arcade-feel tuning was painful to reach in
  24a94e7; redoing it against a new model requires a live pilot.
- Do the four cross-vehicle state leaks identified survive the
  migration? (Answer almost certainly yes — we should fix them at the
  same time.)
- How much of the surrounding infrastructure (HUD, animation, NPC pilot,
  airfield layout, vehicle state manager) actually touches the "wrong
  side" of the seam?

**Concrete next step (Batch F candidate, 2–3 engineer-days):**

1. Land the `Airframe` scaffolding behind `useUnifiedAirframe` = false.
2. Port Skyraider only. F-4 and AC-47 stay on legacy.
3. Add one new UI binding for tier toggle; remove the implicit
   `pilotMode` write in `FixedWingPlayerAdapter`.
4. Human playtest with the flag on, using `docs/PLAYTEST_CHECKLIST.md`
   augmented with the three acceptance criteria in the design doc
   §7.3.
5. If the playtest is positive, Batch F expands to the full migration
   on the timeline in §3. If negative, we learn what missed and flip the
   flag off; cost to date ≈ 3 days, no production regression.

This is deliberately narrower than "do the rebuild now." The spike
validates the architecture; it does not validate that the production
integration survives contact with camera shake, fog-of-war culling,
asset hot-reload, and all the other production surfaces that headless
scenarios do not touch.

## 7. Hard constraints (flagged for Batch F, not handled in spike)

- **No fence change needed** for the core rebuild. `ITerrainRuntime` already
  exposes `raycastTerrain`. If the HUD exposes a tier toggle, we may add
  one additive optional method to `IHUDSystem` — additive, optional, and
  therefore not a fence change per `docs/INTERFACE_FENCE.md`.
- **Cross-vehicle state bleed** needs a `FlightAssistService` or
  equivalent shared-owner pattern; otherwise the rebuild preserves the
  bleed. Propose handling alongside the rebuild because the simplest
  place to reset the state is the same code path that constructs the
  new `Airframe` intent builder.
- **Playtest is mandatory** per `docs/PLAYTEST_CHECKLIST.md`. This task
  changes flight feel; automated tests cannot sign it off.
