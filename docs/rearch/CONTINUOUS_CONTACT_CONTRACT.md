# Continuous Contact Contract

Branch: `task/continuous-contact-contract-memo`
Cycle: `cycle-2026-04-22-flight-rebuild-overnight` (Round 4)
Date: 2026-04-22
Author: Round 4 memo executor
Status: Design proposal. Paper only. No source-code changes in this PR. Intended
as morning-review input; a follow-up implementation cycle is gated on human
approval.

## 1. Problem statement

Seven consecutive cycles have iterated on the fixed-wing feel, and the
2026-04-22 overnight cycle (`cycle-2026-04-22-flight-rebuild-overnight`) landed
twelve code-change PRs (#122 through #133) that individually close out the
surface symptoms: buildings get registered with the LOS accelerator, airframe
sweep responds to upward terrain contact, altitude-hold is unified, the liftoff
gate is replaced with a continuous wheel-load ratio, PlayerController reads
interpolated pose, the alpha-protection band is soft, the climb-rate pitch
damper quenches phugoid, authority scale has a soft floor, airfield perimeters
sit inside the flat envelope, airfield props sample their footprint, the
envelope ramp is twice as wide with a stronger grade, and taxiway capsules
extend past the painted tarmac.

Each of those fixes is a symptom treatment. The four symptom classes they
targeted map to one structural gap:

1. **Sticky takeoff** — the aircraft was gated on a discrete boolean
   (`weightOnWheels`) that flipped at `forwardSpeed >= Vr * LIFTOFF_MIN_SPEED_RATIO`
   with `cmd.elevator > threshold`. Below the gate, pitch input had zero effect
   on trajectory. Round 1 task 4 replaced the gate with a continuous
   `wheelLoad = clamp((Vr - fwdSpeed) / Vr, 0, 1)` ratio that fades pitch
   authority, friction, and lift contribution smoothly
   (`src/systems/vehicle/airframe/Airframe.ts:421-491`).

2. **Tick-back-and-forth mid-flight** — `FixedWingModel.update()` copied the
   interpolated pose to `group` but fed the raw physics pose to
   `PlayerController.updatePlayerPosition`. Three time bases for one aircraft.
   Round 1 task 5 made all external consumers read the interpolated pose from
   `Airframe.getInterpolatedState()` (`src/systems/vehicle/airframe/Airframe.ts:147-172`).

3. **Terrain / building phase-through for ~1 s post-takeoff** — two parts. The
   airframe sweep only saw terrain chunks; `LOSAccelerator.registerChunk`
   (`src/systems/combat/LOSAccelerator.ts:35`) did not accept static building
   meshes. Round 1 task 1 added `registerStaticObstacle`
   (`LOSAccelerator.ts:68-77`) and wired it into `WorldFeatureSystem.spawnFeature`
   after `freezeTransform` (`WorldFeatureSystem.ts:265-291`). The second part
   was the post-liftoff grace window suppressing *upward* terrain contact in
   addition to the intended downward descent-bounce case. Round 1 task 2 split
   the fallback into directional branches.

4. **NPC leap / hypersprint across the low-LOD boundary and the
   distant-culled resume** — the LOD manager amortizes per-tick simulation dt
   across staggered frames; low-LOD NPCs can produce multi-meter logical jumps.
   Distant-culled NPCs reset to `DISTANT_CULLED_DEFAULT_Y = 3` and then snap to
   real terrain at +50 m. Rendered verbatim, both look like teleport.
   `CombatantRenderInterpolator` (`src/systems/combat/CombatantRenderInterpolator.ts`)
   added a two-tier speed cap that eases large Y deltas in at 2 m/s and small
   deltas at `NPC_MAX_SPEED`. The leap symptom was addressed by render-side
   interpolation, not by fixing the underlying authority gap.

**What Round 1–3 did not do.** Each fix is a local repair in one subsystem.
The airframe now sees buildings but NPCs still do not. NPC rendered position is
interpolated but aircraft, heli, player, NPC, and prop placement all have
different rules for what "contact" means, where the sweep is performed, what
registry it queries, and what it does on hit. The next time we add a new
dynamic body (VTOL? player-driven tank? amphibious boat?) or a new kind of
static obstacle (tree BVH? destructible wall?) we will re-discover whichever
rule is missing in that combination. This memo proposes a single contract that
forecloses that re-discovery.

## 2. Current contact disciplines

One paragraph per subsystem. Each describes *what it actually does today*
after the Round 1–3 merges.

### 2.1 Airframe (fixed-wing)

Authoritative file: `src/systems/vehicle/airframe/Airframe.ts`.

The airframe steps at `AIRFRAME_FIXED_STEP` internally
(`Airframe.ts:250-262`). Each step:
(a) samples terrain at current XZ for height and normal (`stepOnce`, line 277);
(b) integrates ground or air (`integrateGround` at 406 or `integrateAir` at
497-757);
(c) while airborne, sweeps `_from -> _to` against `terrain.sweep` and on hit
clamps to the hit point, kills downward velocity, and touches down
(`Airframe.ts:378-395`);
(d) while on wheels, re-samples terrain at the post-move XZ and re-snaps Y via
`syncGroundContactAtCurrentPosition` (line 369-370, 490-495).

The sweep calls `terrain.sweep(from, to)`, which in the production adapter
(`src/systems/vehicle/airframe/terrainProbe.ts:117-139`) first hits
`terrain.raycastTerrain` (BVH over LOSAccelerator's cache, which since Round 1
task 1 contains both terrain chunks and static building meshes) and falls back
to a 24-step heightfield bisection with 6-step refinement. Interpolated pose
for external consumers is produced by lerping/slerping `previousPosition ->
position` and `previousQuaternion -> quaternion` by `accumulator /
AIRFRAME_FIXED_STEP` (`Airframe.ts:147-172`).

This is the only subsystem that treats contact as a first-class concept:
explicit sweep per step, explicit previous/current pose, explicit on-hit
response.

### 2.2 NPC low-LOD movement

Authoritative files: `src/systems/combat/CombatantMovement.ts`,
`src/systems/combat/CombatantMovementStates.ts`.

Low-LOD combatants run through `updateCombatantBasic` inside
`CombatantLODManager`. dt is amortized across stagger gaps
(`CombatantLODManager.ts:511-526`); a single update can apply up to ~3 s of
simulation in one shot. The movement code calls `syncTerrainHeight` and
`terrainManager.getHeightAt`-style point samples. There is no sweep. A combatant
that crosses a low ridge in a single amortized step can end up on the far side
without the movement system ever seeing the ridge.

Collision with other combatants is resolved via `SpatialGridManager` queries,
not a sweep; the grid sees "close entities" but not "obstacle geometry
between a->b." Buildings are invisible to NPC movement entirely — the navmesh
is built once from terrain and static placements, and the movement code reads
only the navmesh path plus point-sampled terrain.

### 2.3 NPC high-LOD movement

Same `CombatantMovement.ts` / `CombatantMovementStates.ts`, but dt is either
the real frame delta or clamped to `MAX_DELTA_TIME = 0.1`
(`CombatantMovement.ts:32`). Same point-sample terrain discipline, same absent
sweep. The practical difference vs. low-LOD is that the step size is small
enough (sprint speed ~6 m/s * 16 ms = ~0.1 m) that a missed ridge is rare —
not impossible, just rare.

### 2.4 Distant-culled NPC

`CombatantLODManager.simulateDistantAI` (`CombatantLODManager.ts:772-832`)
applies `DISTANT_SIM_SPEED * DISTANT_SIM_TIME_STEP = 4 * 30 = 120 m` of
translation in a single call, every 45 s. Direction is either the first
navmesh waypoint toward the target zone or a direct beeline. No terrain-height
tracking during the move — the XZ is advanced, then `position.y` is snapped to
`DISTANT_CULLED_DEFAULT_Y = 3`, then `combatantMovement.syncTerrainHeight` is
called to correct Y. This is the source of the "NPC leap" symptom:
`CombatantRenderInterpolator` catches the multi-meter Y discontinuity and
eases it in at 2 m/s (`CombatantRenderInterpolator.ts:24-25`).

No sweep. No building awareness. The navmesh path provides direction but not
step-by-step collision.

### 2.5 Helicopter

Authoritative file: `src/systems/helicopter/HelicopterModel.ts`.

Reads `LOSAccelerator` for some purposes and `terrainManager.registerCollisionObject`
for others. Does not share the airframe's swept-collision path. Contact
discipline is "point-sample terrain height for ground kiss, tolerate
interpenetration with buildings at low speed." Out of scope for this cycle but
listed here because the contract should unify it.

### 2.6 Prop placement (airfield and general world features)

Authoritative files: `src/systems/world/WorldFeatureSystem.ts`,
`src/systems/terrain/TerrainFeatureCompiler.ts`,
`src/systems/world/AirfieldLayoutGenerator.ts`.

Three tiers of placement, post-Round-3:

- **Surface placements** (runway, apron, taxiway capsules) — stamped into the
  heightmap at compile time via `flatten_capsule` / `flatten_rect` stamps
  (`TerrainFeatureCompiler.ts:183-402`). The envelope stamp at `innerRadius
  +12 m` (Round 3 task 11, `TerrainFeatureCompiler.ts:402`) blends native
  terrain into the flat zone; taxiways get `TAXIWAY_EXTRA_PAD` so the painted
  tarmac is fully inside the guaranteed-flat band (Round 3 task 12).

- **Airfield perimeter props** — `AirfieldLayoutGenerator.ts` clamps
  `perimDist` to `airfieldEnvelopeInnerLateral(template) - 8` (Round 3 task 9);
  per-prop Y comes from the 9-point footprint solver
  `scoreTerrainPlacementCandidate` (`WorldFeatureSystem.ts:535-580`) rather
  than a single centroid sample (Round 3 task 10 gated the old
  `skipFlatSearch` branch).

- **General world props** — `resolveTerrainPlacement` (`WorldFeatureSystem.ts:471-522`)
  runs the 9-point footprint solver with ring-search candidates, picks the
  best-scoring spot within the ring, snaps Y to its min-or-center sample.

After Round 3 the airfield perimeter agrees with the general path. There is
still no single rule for "when is a placement candidate unsafe to place,"
and there is still no post-placement sweep against registered dynamic actors
(a prop spawned under an already-flying aircraft is not the current scenario,
but the contract should address it).

## 3. Proposed contract

Three rules. Every dynamic or static body that participates in ground- or
obstacle-contact lives under these rules without exception.

### Rule (a) — Swept motion

> Any actor translating within a single simulation step with
> `|velocity| * dt > CONTACT_SWEEP_THRESHOLD_M` MUST sweep its motion vector
> against the ContactSweepRegistry and respond to the first hit before
> committing its new position.

Corollary: `CONTACT_SWEEP_THRESHOLD_M` is small enough that the rule fires for
every airborne aircraft and for any amortized NPC step that crosses a nontrivial
gap. Suggested value: `0.25 m` (smaller than any prop's half-footprint, larger
than steady-state NPC steps at 60 Hz). Sub-threshold steps fall back to
point-sample at current XZ — unchanged from today.

The airframe already satisfies this rule for the airborne path. The NPC paths
do not. Distant-culled does not. The rule is the minimal formulation that
makes "phase-through" a class of bug the architecture cannot express.

### Rule (b) — Render-interpolated pose

> Any simulated body rendered to screen MUST expose both previous and current
> authoritative pose and MUST compute its rendered transform as
> `lerp(prev, current, alpha)` where `alpha = accumulator / dt`. External
> consumers (camera, HUD, PlayerController, aim, NPC targeting) read the
> rendered (interpolated) pose, never the raw physics pose.

Corollary: the body's simulation step is responsible for calling
`capturePreviousPose()` before integrating. The render frame provides `alpha`
externally. This is the pattern `Airframe.getInterpolatedState` already
implements; `CombatantRenderInterpolator` implements a cousin with per-entity
speed caps because the simulation does not provide per-step prev/current.
Under the contract, the simulation provides prev/current and the render-side
cap becomes a safety net, not the mechanism.

The rule eliminates "raw pose read by external consumer" as a class of bug.
Round 1 task 5 closed this for the aircraft → PlayerController seam. The same
discipline should apply to NPC → squad HUD readouts, player → death cam,
vehicle → minimap.

### Rule (c) — Footprint-sampled placement

> Any prop placed on the heightmap MUST sample its full footprint at spawn
> time (at minimum a 9-point stencil: center, axis-aligned cardinals, corners
> at 0.7 * sampleRadius), reject placement if the sampled slope exceeds
> `MAX_PLACEMENT_SLOPE_DEG` or the height-span exceeds
> `MAX_PLACEMENT_HEIGHT_SPAN_M`, and snap Y to the min-corner sample (so no
> corner floats) or flatten the underlying heightmap stamp (so no corner
> sinks).

Corollary: the existing `scoreTerrainPlacementCandidate` satisfies the sampling
and scoring half of this rule. Today nothing enforces rejection on score =
`POSITIVE_INFINITY` except the fallback to centroid-Y; under the contract,
rejection is mandatory and the spawn path must handle "no valid candidate in
ring-search" by either dropping the placement or escalating to a flatten
stamp. Round 3 task 10's "gated skipFlatSearch" variant is a concrete
in-progress implementation.

**Why these three and no more?** The three bug classes Rounds 1–3 treated
each collapse onto exactly one rule:
- sticky takeoff / phase-through / terrain penetration → rule (a);
- tick-back-and-forth / rendered-pose drift / NPC leap → rule (b);
- float/sink foundations / unsafe dispersal placements → rule (c).
A fourth rule would be a fourth class of bug we have not seen. Add one only if
one shows up.

## 4. API shapes

All paths below are target paths for the future implementation cycle. None
exist today.

### 4.1 ContactSweepRegistry

```ts
// src/systems/contact/ContactSweepRegistry.ts (NEW)

export interface ContactSweepHit {
  hit: true;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  source: 'terrain' | 'static' | 'dynamic';
  sourceId?: string;
}

export interface ContactSweepRegistry {
  registerStatic(id: string, mesh: THREE.Mesh): void;
  unregisterStatic(id: string): void;
  registerDynamic(id: string, getBounds: () => THREE.Box3): void;
  unregisterDynamic(id: string): void;
  sweep(
    from: THREE.Vector3,
    to: THREE.Vector3,
    options?: { ignoreIds?: ReadonlySet<string>; maxDistance?: number },
  ): ContactSweepHit | null;
}
```

Implementation shares the BVH cache `LOSAccelerator` already owns
(`LOSAccelerator.ts:25`). `registerStatic` is literally today's
`registerStaticObstacle`. `registerDynamic` is new: aircraft, helicopters,
vehicles register their AABB lazily (callback returns a fresh bounds per
sweep, so it picks up current pose without a per-frame registration roundtrip).

Renaming `LOSAccelerator` is out of scope for the implementation cycle;
`ContactSweepRegistry` becomes a thin facade over the existing cache so both
LOS and contact queries share one BVH pass.

### 4.2 Airframe consumer

No change in the airframe's existing sweep call-site
(`Airframe.ts:378-395`) other than the type of `terrain.sweep`'s return value
(`ContactSweepHit` instead of the current anonymous struct). The fallback
heightfield bisection inside `terrainProbe.ts` continues to run when the BVH
misses. On hit, the airframe reads `hit.source` to disambiguate terrain from
building contact — useful for damage scaling in a future crash model but not
required for contract compliance.

### 4.3 CombatantMovement consumer

Inside `CombatantMovement.updateMovement`, replace the direct-assignment step
(`combatant.position.copy(newPos)`) with:

```ts
const from = combatant.position.clone();
const to = _scratch.copy(combatant.position).add(delta);
if (delta.lengthSq() > CONTACT_SWEEP_THRESHOLD_M_SQ) {
  const hit = contactRegistry.sweep(from, to, { ignoreIds: SELF });
  if (hit) {
    combatant.position.copy(hit.point).addScaledVector(hit.normal, NPC_CONTACT_OFFSET_M);
    combatant.velocity.reflectOr(zeroInto: hit.normal);
    return;
  }
}
combatant.position.copy(to);
```

The sweep cost is bounded: a low-LOD NPC running the sweep on every amortized
step (every ~5–45 frames) adds on the order of hundreds of extra BVH queries
per second across the whole NPC population, which is within the existing
`LOSAccelerator` budget.

Distant-culled `simulateDistantAI` needs the same treatment. A 120-m
translation that sweeps at 10-m increments (13 sub-sweeps) is still cheap at
45-second cadence.

### 4.4 WorldFeatureSystem consumer

Placement paths all resolve through a single helper:

```ts
resolvePlacement(worldX: number, worldZ: number, object: THREE.Object3D): PlacementResult | null;
```

Returns `null` when the best candidate inside the search ring fails the slope
and height-span gates. Caller handles `null` explicitly — either drops the
placement, requests an envelope stamp, or retries with a relaxed tier. The
current `resolveTerrainPlacement` becomes the "tier 2 (full ring search)"
implementation behind this helper; `skipFlatSearch` becomes "tier 1 (centroid
only, for interior placements within an envelope)" and is only legal when the
caller has already proven the envelope is flat there.

## 5. Migration plan

Ordering is set by dependency, not importance.

1. **Introduce `ContactSweepRegistry` as a facade over `LOSAccelerator`.**
   ~150 LOC. No consumer migration. New tests for `sweep` return shape and
   dynamic-body bounds refresh. Ships with zero behaviour change (all
   callers still use `LOSAccelerator` directly).

2. **Migrate the airframe.** ~50 LOC. Replace the `terrain.sweep` return type
   in `AirframeTerrainProbe`. Rebuild `createRuntimeTerrainProbe` to delegate
   to `ContactSweepRegistry` instead of `terrain.raycastTerrain`. The airframe
   is already contract-compliant; this step is type unification and a small
   flag for `source === 'static'` damage differentiation later.

3. **Migrate NPC low-LOD movement.** ~200 LOC. Add the sweep check to
   `CombatantMovement.updateMovement` and
   `CombatantMovementStates.updateAdvancingMovement`. Define
   `CONTACT_SWEEP_THRESHOLD_M`. Tests for (a) low-LOD amortized step crosses a
   building, sweep fires, NPC stops at the face; (b) high-LOD step of 0.1 m
   does not fire the sweep, performance is unchanged.

4. **Migrate distant-culled NPC.** ~100 LOC. `simulateDistantAI` walks the
   120-m translation in sub-sweeps, stops at first hit, continues on next
   interval. Tests for building-in-path and terrain-rise-in-path.

5. **Migrate prop placement.** ~200 LOC. `resolvePlacement` becomes the single
   entry point for `WorldFeatureSystem.spawnFeature`. Null-return contract.
   Tests for (a) perimeter prop on slope rejects and ring-searches, (b)
   interior prop uses skipFlatSearch and succeeds, (c) nowhere-valid drops the
   placement and logs a warning.

6. **Migrate helicopter (optional).** ~150 LOC. Bring `HelicopterModel` onto
   the swept path. Low priority: helicopter has not been implicated in the
   reported symptoms. Deferred unless the morning review surfaces a heli bug.

Total net new: ~700 LOC across ~5 tasks, each under the 400-LOC per-task
budget convention. Parallelism: tasks 2, 3, 5 can run after task 1 lands; task
4 depends on task 3's shared helpers landing first. A 5-task cycle, 3 in
parallel then 1 solo then 1 optional, fits comfortably in a single overnight
run.

## 6. Risk and rollback

### BVH correctness

The sole shared risk across the migration is the BVH itself. Today
`LOSAccelerator` correctly handles terrain chunks and, after Round 1 task 1,
static building meshes. It has not been stressed by dynamic-body registration,
and a bug in the dynamic-bounds path produces the worst kind of failure: a
sweep that returns a false hit, silently clamping the airframe or an NPC to a
spurious point.

**Mitigation:** `registerDynamic` ships behind a feature flag for the first
implementation cycle. Dynamic registration is off; only static sweeps happen.
Dynamic support lands in a follow-on cycle with its own before/after probe
evidence.

### Per-migration rollback

1. **Registry facade:** trivially revertable; it is additive. Rollback = drop
   the facade file, no consumer dependency.
2. **Airframe type unification:** revertable by reinstating the anonymous
   return struct. All behaviour is preserved through the facade.
3. **NPC low-LOD sweep:** rollback = guard the sweep behind
   `if (ENABLE_NPC_CONTACT_SWEEP)` with the flag off. NPCs revert to today's
   behaviour. Leave the flag in for a cycle to collect telemetry.
4. **Distant-culled sweep:** same pattern. Flag off = beeline as today.
5. **Prop placement null-contract:** rollback = restore the fallback-to-centroid
   path in `resolvePlacement`. Prop data is regenerated on each mode load so
   there is no persisted state to clean up.

### False-hit risk in production

If the BVH disagrees with the terrain heightfield (the existing dual path in
`terrainProbe.ts`), the airframe already has a heightfield-bisection fallback
that catches the miss. Extending the fallback to the NPC path is not free —
bisection over the heightfield is ~6 extra `getHeightAt` samples per sweep —
but it is bounded. Alternative: if the BVH path returns a hit that fails a
subsequent point-sample sanity check at the hit point, log once and fall
through.

## 7. Scope estimate for implementation cycle

| Task | Parallelism | Estimated LOC | Est. wall time |
|---|---|---|---|
| T1: `ContactSweepRegistry` facade | solo | 150 | 45 min |
| T2: Airframe type unification | after T1 | 50 | 25 min |
| T3: NPC low-LOD sweep | after T1 | 200 | 90 min |
| T4: Distant-culled sweep | after T3 | 100 | 45 min |
| T5: Prop placement null-contract | after T1 | 200 | 75 min |
| T6: Helicopter sweep (optional) | after T1 | 150 | 60 min |
| Memo + post-cycle summary | orchestrator | — | 15 min |

Five mandatory tasks, one optional. Autonomous overnight cycle fits in
3–4 hours with one round-0 probe baseline capture, one round of T1 solo, one
round of T2 + T3 + T5 parallel, one round of T4 solo, and an optional T6 in
the morning slot. Total PR count: 5–6. Orchestrator pattern matches
`cycle-2026-04-22-flight-rebuild-overnight`'s four-round structure.

**Probe acceptance additions** (for the implementation cycle's evidence
folder, not this memo):

- NPC contact-sweep coverage: percentage of low-LOD amortized steps larger
  than `CONTACT_SWEEP_THRESHOLD_M` that execute a sweep call. Target: 100%.
- Building-vs-NPC collision events: count of NPC positions that fall inside a
  registered building AABB, pre- vs. post-migration. Target: 0 after.
- Distant-culled phase-through: same assertion, 120-m translation vs. known
  mountain ridges.
- Prop rejection rate: fraction of attempted placements returning `null` under
  the new resolver. Expected non-zero (that is the point); flagged for spot-
  check so we do not regress airfield prop counts below template minima.

## 8. Open questions

The user needs to decide these before the implementation cycle dispatches.

1. **Dynamic-body registration — ship-on or ship-off?** Proposed default: off.
   Static sweeps cover 100% of the reported symptom classes. Dynamic sweeps
   (aircraft-vs-aircraft, aircraft-vs-NPC, NPC-vs-aircraft) unlock future
   features (mid-air collision, NPCs respecting aircraft taxi paths) but also
   open the false-hit risk above. Decide: do we spend a cycle enabling
   dynamic, or leave it behind the flag until a concrete need surfaces?

2. **Helicopter in or out of the first implementation cycle?** Proposed
   default: out. Heli has not been implicated in the Rounds 1–3 symptoms. But
   bringing it in costs ~150 LOC and closes the contract across the full
   vehicle surface; leaving it out means a follow-on cycle later.

3. **`CONTACT_SWEEP_THRESHOLD_M` tuning.** Proposed 0.25 m. Too small = extra
   sweeps for no benefit; too large = legitimate slow NPCs occasionally
   crossing thin walls. Recommend a probe pass during T3 to measure actual
   step-size distribution and pick the value empirically.

4. **`MAX_PLACEMENT_SLOPE_DEG` and `MAX_PLACEMENT_HEIGHT_SPAN_M` values.**
   Today `WORLD_FEATURE_FLAT_SPAN_TARGET` exists
   (`WorldFeatureSystem.ts:490`) but rejection is implicit (fall through to
   centroid). The contract requires explicit numbers. Recommend harvesting
   the existing constant and the airfield envelope's `gradeStrength` implied
   slope, then sanity-check against the current prop catalog.

5. **Interface fence.** `ContactSweepRegistry` adds a new exported type. It
   does not change any existing `SystemInterfaces.ts` entry, but making it an
   interface under that file triggers `[interface-change]` review. Recommend
   shipping the new interface in a fresh file
   (`src/types/ContactInterfaces.ts`) outside the fence until it has one
   cycle's worth of soak time, then promoting to `SystemInterfaces.ts` if the
   shape stabilizes.

6. **Rename `LOSAccelerator`?** With `ContactSweepRegistry` as a facade and
   LOS as one of its consumers, the name `LOSAccelerator` becomes
   historically-accurate but misleading. A rename to `BVHAccelerator` or
   `SpatialContactIndex` is a small diff but touches ~33 files. Decide
   whether to include the rename in the implementation cycle or defer to a
   cleanup cycle.

---

## Appendix: symptom → rule → Round 1–3 PR mapping

| Symptom | Contract rule | Round 1–3 PRs that symptom-treated | What the rule foreclosed |
|---|---|---|---|
| Phase through building on takeoff | (a) swept motion | #122 (`aircraft-building-collision`), #123 (`airframe-directional-fallback`) | Any dynamic actor bypassing any static obstacle |
| Terrain penetration ~1 s post-rotation | (a) swept motion | #123 (`airframe-directional-fallback`) | Grace windows that suppress contact per-direction |
| Sticky takeoff | (a) swept motion + continuous wheelLoad | #125 (`airframe-ground-rolling-model`), #127 (`airframe-authority-scale-floor`) | Discrete gates on any continuous physical quantity |
| Tick-back-and-forth | (b) render-interpolated pose | #124 (`player-controller-interpolated-pose`), #129 (`airframe-soft-alpha-protection`, indirect) | Raw physics state leaking to non-physics consumers |
| NPC leap / hypersprint | (b) render-interpolated pose | (shelved in the cycle; `CombatantRenderInterpolator` pre-existed) | Render-side interpolation as a mandatory, not opt-in, layer |
| Foundation float/sink at perimeter | (c) footprint-sampled placement | #130 (`airfield-prop-footprint-sampling`), #131 (`airfield-perimeter-inside-envelope`) | Single-centroid Y on any prop wider than a sample cell |
| Visible hillside inside perimeter | (c) footprint-sampled placement | #132 (`airfield-envelope-ramp-softening`), #133 (`airfield-taxiway-widening`) | Envelope geometry that does not cover the declared flat zone |
| Altitude-hold not engaging in normal flight | (b) single authoritative state | #126 (`airframe-altitude-hold-unification`), #128 (`airframe-climb-rate-pitch-damper`) | Two PDs covering disjoint conditions with no unifying selector |

Cross-reference: `docs/archive/FLIGHT_REBUILD_ORCHESTRATION.md` "Why this plan exists"
and "Repo pulse at plan finalization (2026-04-22)" sections.
