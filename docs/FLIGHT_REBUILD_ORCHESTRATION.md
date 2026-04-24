# Flight Rebuild - Multi-Cycle Orchestration Plan

Last updated: 2026-04-24 (historical plan; superseded by architecture recovery board)

This plan coordinated an earlier fixed-wing flight remediation effort. It is
kept as historical evidence and task-shaping context, not as current truth. For
the live recovery board and current validation state, use
[ARCHITECTURE_RECOVERY.md](ARCHITECTURE_RECOVERY.md) and
[STATE_OF_REPO.md](STATE_OF_REPO.md).

The plan is executable via `/orchestrate` once the user seeds the active cycle's section into `docs/AGENT_ORCHESTRATION.md`'s "Current cycle" slot. Two operating modes are supported:

- **Interactive mode** - orchestrator pauses for "go" + human playtest gates.
- **Autonomous overnight mode** - orchestrator dispatches all cycles unattended, merges on CI + probe green, defers human video review to next morning. See "Autonomous overnight protocol" near the bottom.

## Repo pulse at plan finalization (2026-04-22)

Validated against current master (`8c6b8ca fix(terrain): stabilize NPC and aircraft ground contact`, HEAD).

- In-flight swept terrain collision IS implemented: `src/systems/vehicle/airframe/Airframe.ts:348-365` invokes `terrain.sweep(_from, _to)`; runtime probe at `src/systems/vehicle/airframe/terrainProbe.ts:75-140` does a proper BVH raycast with heightfield-bisection fallback (6 substeps). Aircraft-vs-terrain is NOT the pressing bug for airborne contact. Aircraft-vs-buildings still is.
- The post-liftoff fallback at `Airframe.ts:587-620` suppresses the airborne ground clamp for 60 ticks (`postLiftoffGraceTicks`) AND requires `TOUCHDOWN_LATCH_TICKS = 10` (`Airframe.ts:42`) consecutive guarded ticks. Both gates protect against descent bounce, both suppress the response to upward terrain contact during that window - still a bug, scope intact.
- `syncGroundContactAtCurrentPosition` (`Airframe.ts:490-495`) HAS been committed in `8c6b8ca` and is called from line 339 after `integrateGround` while still on wheels. It re-samples height at the post-move XZ and re-snaps Y. On uneven runways this is a second per-tick clamp; whether it contributes meaningful jitter depends on local terrain texture and is best evaluated via probe, not assumed.
- The two PD diagnosis is CORRECTED: `buildCommand.ts:64-81` is the LIVE altitude-hold path in normal piloted flight (because `altitudeHoldTarget` stays null - it is only set in `Airframe.resetAirborne`, not in the normal ground-to-air liftoff path). `Airframe.ts:300-321` is the dormant path. They do not actively compete; they cover disjoint conditions. Task 3 scope is updated to reflect this.
- Buildings are still NOT registered with `LOSAccelerator` (`LOSAccelerator.ts:29` only accepts terrain chunk meshes). Airframe sweep cannot see buildings. Task 1 scope intact.
- PlayerController feed still uses raw physics pose at `FixedWingModel.ts:359` while the rendered mesh uses interpolated pose at line 337-339. Task 5 scope intact.
- Airfield envelope `outerRadius = innerRadius + 6` (6 m hard ramp) confirmed at `TerrainFeatureCompiler.ts:372`. The in-file comment at lines 345-350 explicitly acknowledges "perimeter structures at radius ~240m fall inside the graded shoulder" - the diagnosis is already documented in the code, not resolved.
- `skipFlatSearch: true` branch at `WorldFeatureSystem.ts:200-202` confirmed. Single-centroid Y for airfield props, no footprint sampling.
- Available probe scripts: `scripts/fixed-wing-runtime-probe.ts`, `scripts/engine-health-probe.ts`, `scripts/hud-state-probe.ts`, `scripts/state-coverage-probe.ts`, `scripts/terrain-stream-probe.ts`. These are the automated gates for autonomous mode.

---

## Why this plan exists

Seven consecutive cycles have iterated on aircraft feel without closing out the core symptoms. The 2026-04-21 diagnostic pass (four parallel research streams: flight subsystem, airfield terrain, external arcade-flight best practices, NPC terrain coupling) produced a unified diagnosis:

1. **Aircraft has no building-collision pathway.** `LOSAccelerator.registerChunk` registers terrain meshes only. The airframe sweep cannot see buildings. Not a timing bug - a missing feature. Every post-takeoff "phase through" symptom reduces to this. See `src/systems/vehicle/FixedWingModel.ts:466`, `src/systems/combat/LOSAccelerator.ts:29`.
2. **Terrain phase-through for ~1 s post-takeoff** comes from the post-liftoff grace window (60 ticks) that suppresses the airborne ground-clamp fallback *including for upward terrain penetration*. The grace was designed for the descent case only. See `src/systems/vehicle/airframe/Airframe.ts:587-620`.
3. **Sticky takeoff** is a discrete-gate plus deadband plus lerp cascade. Below Vr, pitch has literally zero effect on trajectory (`Airframe.ts:442-474`). Past cycles have tuned the gate constant (0.6 to 0.4 to 0.25) without changing the architecture; the stickiness survives every tuning.
4. **Tick-back-and-forth mid-flight** is fixed-step / render-Hz aliasing amplified by a split pose feed: the camera reads the interpolated pose (`FixedWingModel.ts:337`) while PlayerController reads the raw physics pose (`FixedWingModel.ts:359`). Three different time bases for one aircraft.
5. **Climb rocking** is phugoid + hard-bounded alpha protection + an authority-scale clamp with a discontinuous edge.
6. **Airfield foundations float/sink** because perimeter props at ~240 m land ~2 m outside the 238 m flat envelope, on a 6 m hard ramp (`src/systems/terrain/TerrainFeatureCompiler.ts:369-380`), and airfield placements use single-centroid Y via `skipFlatSearch: true` (`src/systems/world/WorldFeatureSystem.ts:200-202`) on 2.5x-scaled models.

This plan addresses (1)-(6) in a staged sequence that respects architectural dependencies and prior-cycle lessons.

---

## Guiding principles (from prior-cycle post-mortems)

Every rule below exists because a prior cycle violated it and paid for it.

1. **Never ship two structural changes in one cycle.** The post-2026-04-18 drift showed that when the liftoff gate, terrain probe, and render interpolator changed in the same cycle, nobody could tell which change owned which feel regression. One cycle = one architectural idea.
2. **Baseline first, always.** `aircraft-ground-physics-tuning` on 2026-04-20 shipped without a before-video. Verification depended on memory of the prior feel. From now on: every playtest-required cycle starts with a frozen 30-second video capture of the current behaviour *before any code change*.
3. **Symptom-based acceptance criteria, not code-based.** "Rotate at Vr, no ground contact in first 3 s of climb" is testable. "Fixed the liftoff gate" is not.
4. **Do not pre-tune downstream symptoms.** If Fix A is expected to resolve Symptom B as a side-effect, do not also tune Symptom B in the same PR. Let the side-effect land, measure, then decide if follow-up tuning is needed. This is what `aircraft-ground-physics-tuning`'s "Re-evaluate control feel after the bounce fix lands, don't pre-tune" rule was protecting against.
5. **Small diffs, tight budgets.** Hard budget per task is 500 LOC net. Anything over is a decomposition failure, not a justified exception.
6. **Interface-fence discipline.** Any change to `src/types/SystemInterfaces.ts` requires `[interface-change]` PR title and human approval. See `docs/INTERFACE_FENCE.md`.
7. **Screenshot / video evidence required for playtest-required merges.** Committed to `docs/cycles/<cycle-id>/screenshots/<slug>/`. No feel sign-off without visual artifacts.
8. **Harness bots reuse NPC primitives.** Do not reinvent LOS / targeting / navmesh code inside perf harness drivers. (From memory: `feedback_harness_reuses_npc_primitives.md`.)
9. **Dead-code hygiene stays green.** `npm run deadcode` must not regress inside a cycle. Move-not-delete requires cleanup.
10. **Cloudflare deploy spot-check after GLB / public-asset changes.** See `docs/DEPLOY_WORKFLOW.md`.

---

## Overnight-run structure (one cycle, four rounds)

For autonomous overnight execution, the four tiers collapse into a SINGLE cycle with four sequential rounds. This lets `/orchestrate` run the whole thing in one session without requiring the user to re-seed AGENT_ORCHESTRATION.md between cycles.

| Round | Tier | Goal | Tasks | Blast radius |
|---|---|---|---|---|
| 1 | Tier 0+1 | Correctness + takeoff feel | 5 | Airframe.ts, buildCommand.ts, FixedWingModel.ts, LOSAccelerator.ts, WorldFeatureSystem.ts |
| 2 | Tier 2 | Climb stability | 3 | Airframe.ts, buildCommand.ts |
| 3 | Tier 3 | Airfield placement | 4 | TerrainFeatureCompiler.ts, AirfieldLayoutGenerator.ts, WorldFeatureSystem.ts |
| 4 | Tier 4 | Continuous-contact design memo (paper only) | 1 | `docs/rearch/CONTINUOUS_CONTACT_CONTRACT.md` |

Round 4 (memo) does NOT implement the architectural rearchitecture. That's a post-morning human-review cycle. What the overnight run ships is the design memo so the user has it to read with coffee.

Rounds 1 → 2 → 3 → 4 are dispatched sequentially. Round N dispatches only after Round N-1 is fully merged (or any failed tasks flagged blocked). This avoids Airframe.ts rebase hell between R1 and R2. R3 touches different files but is kept sequential for deterministic failure isolation.

**Cycle ID:** `cycle-2026-04-22-flight-rebuild-overnight`
**Total budget:** ~13 tasks, ~3-5 hours autonomous.
**Concurrency cap:** 5 parallel executors within a round.

---

## Baseline capture (ONE-TIME, Round 0 of the overnight cycle)

Before Round 1 dispatches, record the current behaviour. Without this, nothing inside the cycle can be evaluated. Two variants, pick one based on operating mode:

### Variant A - Autonomous (probe-only, overnight-safe)

No human required. Orchestrator captures before-state automatically and reuses across cycles.

**Deliverables (commit to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/baseline/`):**

1. `probe-before.json` - output of `npm run probe:fixed-wing` (or equivalent script name; verify in `package.json`). Captures takeoff time, rotation altitude, phase-through events, descent bounce signatures across A-1, F-4, AC-47 runs.
2. `altitude-trace-before.json` - probe extension that logs per-tick `altitudeAGL`, `verticalSpeedMs`, `forwardSpeed`, `weightOnWheels`, `phase`, `sweep.hit` for 10 s post-rotation for each aircraft. Write the extension as a small addition to the probe script if it does not yet emit these.
3. `perf-baseline-combat120.json` - fresh `npm run perf-capture:combat120` on a quiet machine. User captures this manually before handing off to overnight run.
4. `airfield-heightmap-slice-before.json` - probe extension: samples heightmap across the main airbase envelope (every 2 m on a grid of the airfield footprint) and writes a CSV / JSON. Detects the 6 m hard-ramp signature numerically.

### Variant B - Human-assisted (for feel sign-off)

Deferred to post-run. The user runs these the morning after the autonomous cycle completes, compares against the after-state videos captured post-Cycle-1. Optional if Variant A is trusted.

1. `a1-takeoff-before.webm` - 30 s clip from player-controlled A-1 takeoff on main airbase runway.
2. `f4-takeoff-before.webm` - same for F-4.
3. `climb-rock-before.webm` - 30 s clip of hands-off climb at full throttle, pitch 15 deg.
4. `airfield-overview-before.png` - wide shot of main airbase from fixed elevated cam.

Baseline is done in one pass, not per-cycle. Cycles 2-4 reuse these artifacts.

---

## Cycle: cycle-2026-04-22-flight-rebuild-overnight

### Purpose

One autonomous overnight run that lands Tier 0 (correctness), Tier 1 (takeoff feel), Tier 2 (climb stability), Tier 3 (airfield placement), and the Tier 4 design memo. Does NOT implement Tier 4 architecture - the memo is the deliverable so the user can review it with coffee.

### Tasks in this cycle (13 total)

**Round 1 - Tier 0 + Tier 1 (5 parallel):**
1. `aircraft-building-collision` - register buildings with LOSAccelerator so the airframe sweep sees them.
2. `airframe-directional-fallback` - split the post-liftoff grace into upward vs downward rules.
3. `airframe-altitude-hold-unification` - wire altitudeHoldTarget capture into the normal liftoff path (or retire the vestigial Airframe.ts PD; executor decides after probing).
4. `airframe-ground-rolling-model` - continuous wheel-load ratio + ground-friction taper + evaluate syncGroundContactAtCurrentPosition.
5. `player-controller-interpolated-pose` - feed interpolated pose to PlayerController.

**Round 2 - Tier 2 climb (3 parallel):**
6. `airframe-soft-alpha-protection` - smoothstep AoA authority scale from hard cap to gradient.
7. `airframe-climb-rate-pitch-damper` - add `-k * pitchRate` torque during positive vertical speed.
8. `airframe-authority-scale-floor` - raise and soften the dynamic-pressure authority floor.

**Round 3 - Tier 3 airfield (4 parallel):**
9. `airfield-perimeter-inside-envelope` - pull perimeter placement inside `innerLateral - 8m`.
10. `airfield-prop-footprint-sampling` - run the 9-point footprint solver on perimeter-zone airfield placements.
11. `airfield-envelope-ramp-softening` - widen `outerRadius = innerRadius + 12` and bump `gradeStrength` to ~0.65.
12. `airfield-taxiway-widening` - extend taxiway capsule innerRadius +2 m beyond painted width.

**Round 4 - Tier 4 design memo (1 solo):**
13. `continuous-contact-contract-memo` - write `docs/rearch/CONTINUOUS_CONTACT_CONTRACT.md`.

### Round schedule

**Round 0 (orchestrator, not a dispatched agent):** capture probe baseline per "Baseline capture - Variant A." Write `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/baseline/probe-before.json` and `airfield-heightmap-slice-before.json`. Must complete before Round 1.

**Round 1:** dispatch tasks 1-5 in parallel. Both Airframe tasks (2, 3, 4) edit the same file in disjoint sections (`integrateAir`, altitude-hold block, `integrateGround`). Executors rebase on merge; whichever wins first forces the others to resolve small conflicts locally.

Advance to Round 2 when all Round 1 tasks are merged OR flagged blocked. A blocked task does NOT halt the cycle; it is recorded in the post-run summary.

**Round 2:** dispatch tasks 6-8 in parallel. All three edit Airframe.ts and/or buildCommand.ts. Same rebase-on-merge pattern.

**Round 3:** dispatch tasks 9-12 in parallel. Tasks touch different files (TerrainFeatureCompiler.ts, AirfieldLayoutGenerator.ts, WorldFeatureSystem.ts) so rebase surface is minimal.

**Round 4:** dispatch task 13 solo. Memo writer.

### Concurrency cap

5 parallel executors within a round. Cycle gates on round completion, not per-task.

### skip-confirm

**YES.** Orchestrator does NOT wait for "go" between rounds. Each round advances automatically on prior-round completion. This is the critical autonomy directive.

### Dependencies

```
Round 0 (probe baseline)
  -> Round 1 (aircraft-building-collision, airframe-directional-fallback,
              airframe-altitude-hold-unification, airframe-ground-rolling-model,
              player-controller-interpolated-pose)
      -> Round 2 (airframe-soft-alpha-protection, airframe-climb-rate-pitch-damper,
                  airframe-authority-scale-floor)
          -> Round 3 (airfield-perimeter-inside-envelope, airfield-prop-footprint-sampling,
                      airfield-envelope-ramp-softening, airfield-taxiway-widening)
              -> Round 4 (continuous-contact-contract-memo)
```

No inter-task blocking within a round.

### Playtest policy - DEFERRED to morning

No playtest gate BLOCKS merge in this cycle. Every playtest-style exit criterion is replaced by a probe-based assertion in the task brief. Human playtest happens when the user wakes up, against the after-state captured post-Round-3.

Each playtest-relevant task ship a before/after probe JSON diff (per-task or shared) to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/evidence/<slug>/`. The morning review compares these.

### Perf policy

- `npm run perf-capture:combat120` runs once at Round 0 (baseline) and once post-Round-3. Budget: p99 within 5% of baseline across the full cycle.
- If post-Round-3 p99 exceeds budget, do NOT revert. Record in summary for morning review; user decides.

### Failure handling (autonomous-safe)

- **CI red on a task** -> mark that task `blocked`, record in summary, continue the cycle. Do NOT halt the round or the cycle.
- **Interface-fence proposal from an executor** -> mark that task `blocked` with `fence_change: yes`, record, continue. Do NOT merge; the user reviews the proposal in the morning.
- **Probe assertion fails post-merge** -> revert the merge via `gh pr merge --rebase` revert commit, mark task `rolled-back`, record, continue. (Practical note: if the orchestrator cannot autonomously revert, mark `rolled-back-pending` and surface at summary time.)
- **Round N has ≥ 1 blocked task** -> proceed to Round N+1 anyway. Downstream tasks that genuinely depend on the blocked one are the exception; those must be skipped and noted.

### Visual checkpoints

**None blocking.** After-state evidence is automatically captured as probe JSON at end of Round 1 and Round 3. Screenshots / videos are morning-review deliverables the user captures manually, not cycle gates.

### Cycle-specific notes

- **The WIP `syncGroundContactAtCurrentPosition` has already landed** as part of commit `8c6b8ca` (2026-04-22). `airframe-ground-rolling-model` does NOT revert it wholesale; instead, that task evaluates via probe whether it contributes to rollout jitter on uneven runways and either keeps it, guards it (only re-snap when normal is within slope tolerance), or removes it with a regression assertion.
- **Helicopter must not regress.** All changes are scoped to the fixed-wing path. If a change necessarily edits a shared file, reviewer verifies heli feel via manual spawn (post-run, not blocking).
- **Three.js upgrade status is not confirmed in master as of 2026-04-22.** Prior-cycle memory referenced a parallel upgrade; no merge conflict signal in recent commits. Executor: if you hit a Three.js API mismatch mid-task, stop and surface; do not auto-upgrade.

---

### Task briefs (inline - Rounds 1 through 4)

Each section below is a complete executor-ready brief. At dispatch time, either:
- (a) paste the section into `docs/tasks/<slug>.md` and dispatch the executor with a reference to it, or
- (b) dispatch the executor with the section's contents as the full prompt.

---

#### Task 1: aircraft-building-collision

**Slug:** `aircraft-building-collision`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Priority:** P0 - the single highest-leverage correctness fix in the cycle. One change, eliminates the "phase through buildings after takeoff" symptom permanently.
**Playtest required:** NO (probe-verified via sweep-hit assertion).
**Estimated risk:** low - additive registration, no existing behaviour changes.
**Budget:** <=200 LOC.
**Files touched:**
- Read: `src/systems/combat/LOSAccelerator.ts`, `src/systems/vehicle/airframe/terrainProbe.ts`, `src/systems/terrain/TerrainQueries.ts`, `src/systems/world/WorldFeatureSystem.ts`.
- Modify: `WorldFeatureSystem.ts` (or wherever buildings finalize spawn) to call `LOSAccelerator.registerChunk` (or the most appropriate public registration API) for building meshes; possibly a small addition in `LOSAccelerator.ts` if building registration needs a distinct scope.

Do NOT touch: `FixedWingModel.ts`, `Airframe.ts`. The airframe sweep already queries through `raycastTerrain` via `LOSAccelerator.checkLineOfSight`. Adding buildings to the accelerator is sufficient; no client-side airframe change needed.

##### Required reading first

- `src/systems/combat/LOSAccelerator.ts` end-to-end. Identify the registration surface, scope semantics (what is a "chunk"), and whether static building meshes need their own registry.
- `src/systems/vehicle/airframe/terrainProbe.ts:75-140` - verify the sweep path actually returns hits from the accelerator, not only from a terrain-specific query.
- `src/systems/terrain/TerrainQueries.ts:109-121` (`raycastTerrain`) - confirm it dispatches through the accelerator and will pick up new registrations.
- `src/systems/world/WorldFeatureSystem.ts` - how buildings are spawned, when `freezeTransform` runs, where the right hook for registration lives.

##### Diagnosis

From the 2026-04-21 diagnostic: `LOSAccelerator.registerChunk` in `src/systems/combat/LOSAccelerator.ts:29` registers terrain chunk meshes only. Buildings are never registered with any system the airframe consults. `FixedWingModel.ts:466` registers the aircraft as a dynamic collision object *for others to see*, but that is one-way; nothing reads that record during the airframe's own sweep.

##### Fix

Register every spawned static building mesh with the accelerator at spawn time (immediately after `prepareModelForPlacement`). Use the same registration API that terrain chunks use, or add a sibling API (`registerStaticObstacle`) if the semantics differ (terrain chunks can re-stream; buildings are frozen).

##### Steps

1. Read all of "Required reading first."
2. Determine whether `registerChunk` accepts static meshes or if a new `registerStaticObstacle` method is needed. If new, match its signature and internal data structures to `registerChunk`; do not invent a parallel index.
3. Add the registration call in the building spawn path (probably `WorldFeatureSystem.spawnFeature` after `freezeTransform`). Register only meaningful collidable meshes (not decorative props below some footprint threshold - defer that filter to a constant).
4. Add a deregistration path if buildings can be despawned mid-match. (If they can't, skip and add a comment.)
5. Add a Vitest unit covering: an aircraft sweep from before a building to past it returns a hit at the building's near face.
6. Manual check: dev boot, spawn in an aircraft, deliberately fly into the nearest building. Observe that the sweep reports contact.

##### Screenshot evidence (required for merge)

Commit to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/screenshots/aircraft-building-collision/`:
- `sweep-hit-debug.png` - dev overlay showing the sweep ray terminating on a building face.
- `before-after-phase-through.webm` - short clip: before (phase through hangar) vs after (contact registered).

##### Exit criteria

- Airframe sweep reports building contact when the prev->next segment intersects any registered building mesh.
- At least one hangar and one tower confirmed collidable in dev.
- No regression in `combat120` perf smoke (p99 within 5% of baseline).
- No change in NPC navigation (navmesh is independent of this).
- `npm run lint`, `npm run test:run`, `npm run build` green.

##### Non-goals

- Do not implement crash physics or damage (the sweep reporting contact is the whole deliverable; how the airframe responds to that contact is a separate concern).
- Do not register trees or small vegetation (footprint threshold out of scope).
- Do not change the accelerator's spatial data structure.

##### Hard stops

- Fence change -> STOP.
- Accelerator registration signature change that other callers would need to migrate -> STOP, file separate prep task.
- Perf p99 regresses > 5% -> STOP, investigate BVH cost before merging.

##### Pairs with

`airframe-directional-fallback` (the two together mean aircraft see both terrain and buildings correctly post-rotation).

---

#### Task 2: airframe-directional-fallback

**Slug:** `airframe-directional-fallback`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Priority:** P0 - removes the "phase through terrain for 1 second after takeoff" symptom.
**Playtest required:** NO (probe-verified via per-tick `altitudeAGL` vs terrain trace).
**Estimated risk:** medium - touches the fallback logic that prior cycles worked around; must not reintroduce the descent-side bounce the grace window was added to prevent.
**Budget:** <=200 LOC.
**Files touched:**
- Modify: `src/systems/vehicle/airframe/Airframe.ts` (the post-liftoff fallback at approximately lines 587-620 and the `descentLatchTicks` constant).

##### Required reading first

- `src/systems/vehicle/airframe/Airframe.ts:442-474` (liftoff gate).
- `src/systems/vehicle/airframe/Airframe.ts:587-620` (post-liftoff fallback + descent latch).
- `src/systems/vehicle/airframe/terrainProbe.ts:75-140` (the sweep the fallback uses).
- Prior task brief: `docs/tasks/archive/cycle-2026-04-21-atmosphere-polish-and-fixes/aircraft-ground-physics-tuning.md` - explains why the grace window exists (descent-side bounce prevention).

##### Diagnosis

The post-liftoff fallback treats all ground contact as a false positive for `postLiftoffGraceTicks` (60, ~1 s at 60 Hz). The grace was designed for the descent case: aircraft just left the runway, airborne flag flipped, fallback would snap it back down if momentarily under threshold. But the same suppression hides upward terrain contact - when the aircraft climbs over rising terrain and the sweep reports intersection, the latch ignores it. Result: ~1 s of phase-through after rotation.

##### Fix

Split the post-liftoff suppression into two directional rules:

- **Downward contact** (sweep reports ground under the aircraft, `vy <= 0`): keep the existing 60-tick grace. This is the descent-bounce case the grace was designed for.
- **Upward / forward penetration** (sweep reports terrain *above* the aircraft's floor Y at the swept segment's end, regardless of `vy`): **do not suppress**. Clamp Y to terrain height + clearance immediately, zero out the component of velocity pointing into the terrain, continue.

##### Steps

1. Read all of "Required reading first."
2. Add a Logger trace in the fallback path that logs: `altitudeAgl`, `vy`, `fallbackFired`, `direction` (up/down), `ticksSinceLiftoff`. Dev-boot and capture an A-1 takeoff over rising terrain; confirm the phase-through coincides with upward contact being suppressed.
3. Refactor the fallback into two branches:
   ```
   if (sweep.hitsTerrainBelow && vy <= 0) {
     // existing descent-latch behaviour
     if (descentLatchTicks-- <= 0) { snapDown(); }
   } else if (sweep.hitsTerrainAbove || forwardPenetration) {
     // new: always respond, no grace
     snapUp();
     zeroInwardVelocity();
   }
   ```
4. Keep the `postLiftoffGraceTicks` constant but rename it to `descentLatchGraceTicks` to reflect its now-specific purpose.
5. Add Vitest regression:
   - "aircraft climbing over rising terrain immediately within post-liftoff window does not phase through" - set up an airframe at altitude 5 m above a rising ramp, step, assert `position.y > terrainHeight` after each step.
   - "aircraft descending within post-liftoff grace does not snap down prematurely" - preserve the existing test behaviour.
6. Dev boot, take off A-1 from the main airbase, confirm no visible phase-through over rising terrain between runway and first valley crossing.

##### Screenshot evidence (required for merge)

- `before-after-terrain-phase.webm` - 15 s clip, side-by-side or sequential.
- `altitude-trace-before-after.png` - strip chart showing aircraft altitude vs terrain altitude across post-liftoff window; before has visible under-terrain excursion, after does not.

##### Exit criteria

- A-1, F-4, and AC-47 each take off from main_airbase and cross at least 500 m of downrange terrain including at least one rise without any visible terrain penetration.
- Descent-side bounce not reintroduced: manual test of cutting throttle at 10 m AGL within the grace window does not snap the aircraft back to runway.
- Vitest regression passes.
- `npm run lint`, `npm run test:run`, `npm run build` green.

##### Non-goals

- Do not change the liftoff gate (that's `airframe-ground-rolling-model`).
- Do not change the sweep implementation (that is out of scope for this cycle; see the Round 4 design memo for the architectural path).
- Do not tune `gearClearanceM` or `liftoffClearanceM`.

##### Hard stops

- Descent-side bounce reintroduced in any form -> STOP.
- Fix requires changing `AirframeTerrainProbe`'s API -> STOP, surface (interface-fence risk).
- Fence change -> STOP.

##### Pairs with

`aircraft-building-collision` (together, aircraft respects both terrain and buildings post-takeoff), `airframe-ground-rolling-model` (both touch the same file; coordinate rebase).

---

#### Task 3: airframe-altitude-hold-unification

**Slug:** `airframe-altitude-hold-unification`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Priority:** P1 - removes a latent inconsistency: two PD implementations for the same concept, each active in disjoint conditions, neither aware of the other.
**Playtest required:** NO (probe-verified).
**Estimated risk:** medium - touches altitude-hold behaviour; a wrong pick here could make hands-off cruise oscillate or sag.
**Budget:** <=250 LOC.
**Files touched:**
- Modify: `src/systems/vehicle/airframe/Airframe.ts` (altitude-hold block at approximately lines 114, 191, 220-224, 300-321), and/or `src/systems/vehicle/airframe/buildCommand.ts` (cruise-hold block at 64-81).

##### Required reading first

- `src/systems/vehicle/airframe/Airframe.ts:114` (`altitudeHoldTarget` field), `:191` (cleared in `resetToGround`), `:220-224` (set in `resetAirborne`), `:300-321` (PD that fires only when target is set).
- `src/systems/vehicle/airframe/buildCommand.ts:64-81` (cruise-hold PD that runs when target is null, i.e. every normal piloted flight).
- `src/systems/vehicle/airframe/Airframe.ts:442-474` (liftoff gate - critical because this is where the airframe transitions weightOnWheels from true to false in the normal path, and NO code here sets altitudeHoldTarget).

##### Diagnosis (corrected 2026-04-22)

The two altitude-hold PD loops do NOT actively compete. They cover disjoint conditions:

- `buildCommand.ts:64-81` fires when: tier is assist, airborne, pitch stick neutral (< 0.05). This runs in normal piloted flight because `altitudeHoldTarget` is never set during a ground-to-air liftoff (only `resetAirborne` sets it).
- `Airframe.ts:300-321` fires when: same three conditions AND `altitudeHoldTarget !== null`. This runs for test fixtures and any spawn path that invokes `resetAirborne` directly.

The bug is not that they compete; it is that:
1. Normal player flight always uses the weaker buildCommand PD (a vs-damping + trim-return pair with `assistPitchP * 0.25`).
2. The stronger Airframe PD (`-altErr*0.015 - vs*0.06 - pitchRate*0.05`, explicitly tuned for "real autopilot backbone") is never engaged in normal flight because no code captures `altitudeHoldTarget` at liftoff.
3. Debugging is confusing: a future reader sees two PD implementations and assumes they compete.

##### Fix (executor picks one, probe-verifies)

**Option A (preferred)** - wire `altitudeHoldTarget` capture into the normal liftoff path. In `integrateGround`'s liftoff block (approximately lines 452-473), when `weightOnWheels` flips false, capture `this.altitudeHoldTarget = this.position.y + some_climb_margin` (the margin puts it above current altitude so the aircraft climbs to target, not descends). The Airframe PD then takes over hands-off cruise in all conditions. Delete the duplicate buildCommand block or leave it as a fallback for `tier === 'raw'` (current code already excludes raw at line 32).
**Option B (fallback)** - delete the `Airframe.ts:300-321` block as vestigial. Clean up `altitudeHoldTarget` field and its set/clear sites. buildCommand becomes the single PD.

Executor decides A vs B based on probe result: run `npm run probe:fixed-wing` in cruise scenario before and after each option; whichever gives tighter altitude-hold without oscillation wins.

##### Steps

1. Read all of "Required reading first."
2. Add Logger trace at both PD sites logging which fired this tick. Boot `npm run probe:fixed-wing`, confirm the diagnosis: only buildCommand fires in a normal player-initiated takeoff; only Airframe fires in a `resetAirborne`-initiated scenario.
3. Implement Option A first. Probe cruise hold. If stable over 60 seconds and tighter than Option B's baseline, commit Option A.
4. If Option A shows instability or regression, revert and implement Option B.
5. Add Vitest regression: "assist tier, airborne, hands-off, altitude at t+60s is within ±5 m of target."
6. Write `evidence/airframe-altitude-hold-unification/before.json` and `.../after.json` probe captures to the cycle evidence folder.

##### Exit criteria

- `npm run probe:fixed-wing` cruise scenario reports altitude deviation < 5 m over 60 s hands-off. Baseline allowed up to ~8-12 m depending on aircraft.
- No oscillation in the altitude trace (no sign-flips at > 0.3 Hz within the cruise window).
- `Airframe.test.ts`, `NPCFixedWingPilot.test.ts` pass. Regression test added.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Probe before / after JSON committed.

##### Non-goals

- Do not retune PD gains beyond what the unification requires.
- Do not change the `orbit` command path in buildCommand.

##### Hard stops

- Probe shows worse altitude-hold than baseline under both A and B -> STOP, mark blocked, surface; the assumption behind this task is wrong.
- Fence change -> STOP.

---

#### Task 4: airframe-ground-rolling-model

**Slug:** `airframe-ground-rolling-model`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Priority:** P0 - the "sticky takeoff" root fix. Replaces the discrete liftoff gate with a continuous wheel-load model.
**Playtest required:** NO (probe-verified).
**Estimated risk:** high - structural change to the most-tuned subsystem in the flight model. Every prior cycle tuned constants around the existing gate; this brief changes the architecture.
**Budget:** <=400 LOC net.
**Files touched:**
- Modify: `src/systems/vehicle/airframe/Airframe.ts` (`integrateGround` at 376-488, the liftoff transition block at 442-474, and the landed `syncGroundContactAtCurrentPosition` at 338-340 + 490-495).
- Optionally modify: `src/systems/vehicle/airframe/configs.ts` only if a per-aircraft tuning scalar is newly required; default behaviour should be correct without config changes.

Do NOT touch: `integrateAir`, the post-liftoff fallback (`airframe-directional-fallback` owns that), or `buildCommand.ts` (task 3 owns that).

##### Required reading first

- `src/systems/vehicle/airframe/Airframe.ts:376-488` (`integrateGround`).
- `src/systems/vehicle/airframe/Airframe.ts:442-474` (liftoff gate).
- `src/systems/vehicle/airframe/Airframe.ts:338-340` and `:490-495` (WIP `syncGroundContactAtCurrentPosition`).
- External reference: [brihernandez/ArcadeJetFlightExample (README)](https://github.com/brihernandez/ArcadeJetFlightExample) - canonical arcade ground-friction taper.
- [FSX ground friction thread](https://forums.flightsimulator.com/t/please-fix-the-ground-physics-friction-inertia-etc/455009) - exactly this stickiness symptom in a different engine.
- Prior task brief: `docs/tasks/archive/cycle-2026-04-21-atmosphere-polish-and-fixes/aircraft-ground-physics-tuning.md`.

##### Diagnosis

- Liftoff is a discrete boolean: either `weightOnWheels` is true (pitch has zero effect on trajectory; only `groundPitch` lerps a visual target) or false (airborne). Below Vr, no matter what the pilot inputs, trajectory is locked to the ground. Prior cycles tuned `LIFTOFF_WEIGHT_RATIO` (0.6 -> 0.4 -> 0.25) and `rotationReady` threshold (0.9 -> 0.85) but the gate architecture is unchanged.
- Ground friction (`rollingResistance`, `lateralFriction`) is constant until the gate flips; then zero. This produces the "suddenly flies" feel.
- `syncGroundContactAtCurrentPosition` (landed in `8c6b8ca`, `Airframe.ts:339`, `:490-495`) re-samples terrain at the post-integrate XZ and re-snaps Y. On uneven runways this is a second per-tick clamp whose contribution to rollout jitter needs to be measured, not assumed.

##### Fix (three sub-changes, composed)

1. **Continuous wheel-load ratio.** Introduce `wheelLoad = clamp((Vr - forwardSpeed) / Vr, 0, 1)`. Thrust, lateral friction, and pitch authority all multiply by the ratio: pitch authority scales with `(1 - wheelLoad)`, friction scales with `wheelLoad`. At 0.85*Vr you get 15% air authority, not 0%. The player feels the nose taking bite as speed builds.
2. **Ground-friction taper.** Same ratio. Friction coefficient multiplied by `wheelLoad`. At Vr, friction is zero.
3. **Evaluate `syncGroundContactAtCurrentPosition` via probe.** Add a probe assertion "rollout vertical position between t=1s and t=3s is monotonic-or-stationary" (Y never drops more than `gearClearanceM` within a consecutive 50 ms window). If the assertion fails with the sync present, either remove the sync (delete lines 338-340 and 490-495), guard it (only re-snap when the post-move terrain-normal-difference is under a slope threshold), or reduce its authority (50% blend toward the re-sampled Y rather than a hard snap). Whichever option passes the probe wins.

##### Steps

1. Read all of "Required reading first."
2. Confirm probe baseline from Round 0 exists; if not, fail early with a `blocked` report.
3. Implement the continuous `wheelLoad` ratio. Apply to pitch authority first. Probe A-1 takeoff; confirm pitch authority is nonzero at `forwardSpeed = 0.85 * Vr`.
4. Apply `wheelLoad` to friction. Probe A-1 again; confirm acceleration curve on rollout has no sudden step at the gate.
5. Preserve the liftoff vertical-impulse nudge (`velocity.addScaledVector(up, Math.max(4.5, newFwd * 0.12))` at line 464-466) - it rides on top of the new model and still prevents ground-scrape at the moment of rotation.
6. Evaluate the `syncGroundContactAtCurrentPosition` question. Use the probe's per-tick `altitudeAGL` trace.
7. Add Vitest regressions:
   - "pitch input at 0.85*Vr produces nonzero vertical acceleration" (was zero under the old gate).
   - "lateral friction is zero at `forwardSpeed = Vr`" (was nonzero in the frame before the gate flip under the old model).
   - "rollout vertical position between t=1s and t=3s does not drop more than `gearClearanceM` in any 50 ms window."
8. Write probe before / after JSON to `evidence/airframe-ground-rolling-model/`.

##### Exit criteria

- A-1, F-4, AC-47 each take off from main_airbase with progressive pitch authority below Vr and no sudden gate transition in the probe altitude trace.
- Rollout vertical position monotonic-or-stationary (no sync double-clamp jitter) per the probe assertion above.
- `combat120` perf p99 within 5% of baseline.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Probe before / after JSON committed.

##### Non-goals

- Do not pre-tune control feel after liftoff (that is what `airframe-directional-fallback` plus the natural feel of the continuous model delivers; re-evaluate during morning review, file follow-up if needed).
- Do not change `integrateAir`.
- Do not change per-aircraft lift coefficients.
- Do not reintroduce any discrete `weightOnWheels` check in the force path (the flag can remain as state metadata; force equations must use `wheelLoad`).

##### Hard stops

- Pitch authority change breaks cruise feel or altitude-hold probe stability -> STOP.
- Removing / guarding the sync causes a visible rollout descent-below-terrain artifact in the probe -> STOP; keep the sync and guard more conservatively.
- Fence change -> STOP.

##### Pairs with

`airframe-directional-fallback` (both touch Airframe.ts; coordinate rebase). `airframe-altitude-hold-unification` (both touch Airframe.ts but disjoint sections).

---

#### Task 5: player-controller-interpolated-pose

**Slug:** `player-controller-interpolated-pose`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Priority:** P0 - the "tick back and forth" root fix; unifies the three time bases.
**Playtest required:** NO (probe-verified via pose-continuity assertion).
**Estimated risk:** medium - changes what the PlayerController and HUD read. If any downstream consumer depended on raw-physics precision (e.g. aim solver), it may need updating.
**Budget:** <=250 LOC.
**Files touched:**
- Modify: `src/systems/vehicle/FixedWingModel.ts` (specifically the PlayerController feed at approximately line 359).
- Possibly modify: `src/systems/player/PlayerController.ts`, `src/systems/player/PlayerCamera.ts`, any HUD consumer that reads from one of these.

##### Required reading first

- `src/systems/vehicle/FixedWingModel.ts:320-370` (the step + render copy + PlayerController feed).
- `src/systems/vehicle/airframe/Airframe.ts:131-156` (`getInterpolatedState`).
- `src/systems/player/PlayerController.ts` - especially any method that takes an aircraft position and what it uses it for.
- `src/systems/player/PlayerCamera.ts:262-269` - the camera lerp; confirm it is downstream of the new pose source.

##### Diagnosis

`FixedWingModel.update()` copies the interpolated pose to `group` (line 337) but feeds `airframe.getPosition()` (raw physics) to `playerController.updatePlayerPosition` (line 359). Camera reads the interpolated pose via `group.position`. Aim, collision, HUD readouts may read whatever PlayerController stores. Three time bases for one aircraft, aliased by the fixed-step sawtooth. Visible as tick-back-and-forth, especially at high speed and at high monitor refresh rates.

##### Fix

Feed `airframe.getInterpolatedState().position` (and quaternion) to every downstream consumer. Raw physics pose is internal to Airframe; external callers always get the interpolated pose.

##### Steps

1. Read all of "Required reading first."
2. Audit every call site of `airframe.getPosition()` and `airframe.getRotation()` / `getQuaternion()` outside `Airframe` itself. Each one is a candidate for migration.
3. Change `FixedWingModel.update()` line 359 and siblings to pass the interpolated pose.
4. If any call site genuinely needs raw physics state (e.g. a simulation-internal consumer), leave it and add a code comment explaining why.
5. Verify camera behaviour: `group.position` is already interpolated, so no change required there.
6. Dev boot at 144 Hz (the user's monitor is 143 Hz). Look for the pre-fix tick-back-and-forth at speed; confirm it is gone.
7. Add Vitest that exercises the public surface: step the airframe 120 times, read via `getInterpolatedState()` on each tick, assert position continuity (no discontinuities > some small epsilon given fixed input).

##### Screenshot evidence (required for merge)

- `high-speed-jitter-before-after.webm` - side view of AC-47 at max speed, before (visible tick) and after (smooth).

##### Exit criteria

- No visible tick-back-and-forth at 144 Hz at any cruise speed.
- HUD readouts remain stable (no new flicker).
- Helicopter feel unchanged (scope is fixed-wing only; if helicopter passes through the same consumer, verify manually).
- `npm run lint`, `npm run test:run`, `npm run build` green.

##### Non-goals

- Do not change the accumulator or the fixed-step value.
- Do not refactor PlayerController broadly.
- Do not touch camera smoothing (a separate concern; if climb rock persists after Round 2, file a follow-up for morning review).

##### Hard stops

- An aim or collision consumer reads position at a phase offset that breaks once switched to interpolated -> STOP, decide per-consumer.
- Fence change (SystemInterfaces) -> STOP.
- Helicopter regressions surface -> STOP.

##### Pairs with

None directly; independent of the other Round 1 tasks.

---

---

#### Task 6: airframe-soft-alpha-protection

**Slug:** `airframe-soft-alpha-protection`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Priority:** P1 - reduces climb rocking by replacing a boundary-limit oscillator with a smooth gradient.
**Playtest required:** NO (probe-verified).
**Estimated risk:** low - the current alpha protection already uses `smoothstep` from `alphaStall - 5` to `alphaStall - 1`, but the protection is binary in effect: nose-up elevator is scaled by `alphaFactor`, and `alphaFactor` ramps from 1.0 to 0.0 but the threshold band is narrow (4 deg). Widening and re-curving is low-risk tuning.
**Budget:** <=100 LOC.
**Files touched:**
- Modify: `src/systems/vehicle/airframe/Airframe.ts:506-513` (alpha-protection block).

##### Required reading first

- `src/systems/vehicle/airframe/Airframe.ts:497-532` (integrateAir authority + alpha-protection + base restoring moments).

##### Fix

Widen the protection band from 4 deg (stall-5 to stall-1) to 8 deg (stall-8 to stall+1), keeping `smoothstep` for the ramp but with asymmetric bounds that allow partial response even at stall. Alternatively, use a soft tanh: `alphaFactor = 0.5 * (1 - tanh((absAlphaDeg - alphaStallDeg) / 3))`. Executor probe-compares the two and picks the one that produces less peak-to-peak vertical oscillation in hands-off climb.

##### Steps

1. Read `Airframe.ts:497-532`.
2. Implement widened smoothstep variant. Probe: A-1 full throttle, pitch held at +0.8 elevator (hard pull), 60 s climb; measure peak-to-peak vertical oscillation amplitude in the AGL trace.
3. If variant A amplitude > 1 m, swap to tanh variant, probe again.
4. Commit the winning variant with a regression Vitest: "aircraft at full aft stick with alpha within 2 deg of stall does not cycle authority from 0 to full between consecutive ticks."
5. Probe before/after JSON to `evidence/airframe-soft-alpha-protection/`.

##### Exit criteria

- Climb vertical-speed RMS oscillation reduced relative to baseline by at least 50%.
- Stall protection still prevents actual stall (airspeed stays above `stallSpeedMs * 0.95` under hard pull).
- `npm run lint`, `npm run test:run`, `npm run build` green.

##### Non-goals

- Do not change `alphaStallDeg` or `alphaMaxDeg` in configs.
- Do not touch the elevator authority scale (`authority.elevator`).

##### Hard stops

- Aircraft actually stalls mid-climb at full throttle -> STOP, narrow the band back.
- Fence change -> STOP.

---

#### Task 7: airframe-climb-rate-pitch-damper

**Slug:** `airframe-climb-rate-pitch-damper`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Priority:** P1 - kills phugoid (speed-altitude coupling oscillation) in climb by damping pitch rate more aggressively when climbing.
**Playtest required:** NO (probe-verified).
**Estimated risk:** low - adds a damping term; conservative failure mode is less responsive pitch, not instability.
**Budget:** <=100 LOC.
**Files touched:**
- Modify: `src/systems/vehicle/airframe/Airframe.ts:528-532` (pitchAccel term) or `src/systems/vehicle/airframe/configs.ts` to add a per-aircraft `climbPitchDampScale`.

##### Required reading first

- `src/systems/vehicle/airframe/Airframe.ts:497-557` (integrateAir rotation section).
- External reference: phugoid mode damping - the standard aerodynamic fix is to add pitch-rate proportional damping that scales with climb rate so cruise stays crisp.

##### Fix

In `integrateAir`, compute `climbFactor = smoothstep(velocity.y, 0, 5)` (0 to 1 over 0 to 5 m/s climb). Scale `pitchDamp` by `1 + climbFactor * climbDampBonus` where `climbDampBonus` is ~1.5. Damping is effectively 2.5x at 5+ m/s climb, 1x in cruise / descent. Place the addition just before the `pitchAccel` computation at line 528.

##### Steps

1. Read `integrateAir` carefully.
2. Add `climbFactor` + boosted damping. Probe A-1 hands-off climb at full throttle: peak-to-peak vertical oscillation amplitude.
3. Probe cruise (hands-off level flight at trim speed): confirm no regression in pitch responsiveness.
4. Add Vitest regression: "A-1 hands-off climb at full throttle does not oscillate > 1 m peak-to-peak over 30 s."
5. Probe before/after JSON.

##### Exit criteria

- Climb vertical-speed RMS oscillation reduced by at least 50% relative to baseline.
- Cruise pitch response (step input to 10 deg pitch, time-to-90%) within 10% of baseline.
- `npm run lint`, `npm run test:run`, `npm run build` green.

##### Non-goals

- Do not retune `stability.pitchDamp` directly (that affects cruise too).
- Do not change `authority.maxPitchRate`.

##### Hard stops

- Cruise pitch response degrades > 10% -> STOP, lower `climbDampBonus`.
- Fence change -> STOP.

---

#### Task 8: airframe-authority-scale-floor

**Slug:** `airframe-authority-scale-floor`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Priority:** P2 - softens a discontinuity at the low-speed end of the authority clamp that contributes to climb-rock (control character changes at the clamp edge).
**Playtest required:** NO (probe-verified).
**Estimated risk:** low - single constant change with a smoothstep addition.
**Budget:** <=80 LOC.
**Files touched:**
- Modify: `src/systems/vehicle/airframe/Airframe.ts:503-504` (authorityScale clamp).

##### Required reading first

- `src/systems/vehicle/airframe/Airframe.ts:503-504` (`const authorityScale = THREE.MathUtils.clamp(a.dynamicPressure / qRef, 0.15, 2.2)`).

##### Fix

Replace the `clamp(x, 0.15, 2.2)` with a `smoothstep`-blended floor: `smoothstep(x, 0.10, 0.30) * (1 - floor) + floor`, where `floor = 0.30`. So at `x < 0.10`, authority is at the floor (0.30); at `x > 0.30`, authority is the full `x`; between, smooth blend. Remove the discontinuity at the old clamp edge. High-side clamp stays at 2.2.

##### Steps

1. Implement the floor blend.
2. Probe A-1 low-speed climb (at `forwardSpeed` just above Vr): confirm control response is smooth as dynamic pressure changes.
3. Probe high-speed run (at `0.9 * maxSpeedMs`): confirm no change in authority at high end.
4. Vitest regression: "authorityScale is continuous in dynamic pressure (derivative within a bounded range)."
5. Probe before/after JSON.

##### Exit criteria

- Climb rocking amplitude reduced further vs baseline.
- No change in high-speed handling.
- `npm run lint`, `npm run test:run`, `npm run build` green.

##### Non-goals

- Do not change the high-side clamp.
- Do not touch individual `authority.elevator / aileron / rudder` coefficients.

##### Hard stops

- Fence change -> STOP.

---

#### Task 9: airfield-perimeter-inside-envelope

**Slug:** `airfield-perimeter-inside-envelope`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Priority:** P0 - resolves "building foundations float / sink" at airfield perimeter by pulling the placement radius inside the flat envelope.
**Playtest required:** NO (probe-verified via heightmap slice).
**Estimated risk:** low - one constant / formula change in the layout generator.
**Budget:** <=100 LOC.
**Files touched:**
- Modify: `src/systems/world/AirfieldLayoutGenerator.ts` (perimeter placement distance computation).

##### Required reading first

- `src/systems/world/AirfieldLayoutGenerator.ts` full file - focus on where `perimDist` or perimeter-zone placements resolve their radius.
- `src/systems/terrain/TerrainFeatureCompiler.ts:339-402` (envelope stamp construction). Note: `innerLateral = lateralReach + AIRFIELD_ENVELOPE_STRUCTURE_BUFFER_M`.

##### Fix

Compute `perimDist = min(originalPerimDist, envelopeInnerLateral - 8)`. The -8 m provides a clearance margin inside the flat zone. If `envelopeInnerLateral` is not exposed to the layout generator, add an exported helper function from `TerrainFeatureCompiler` (or better: centralize the constant in `AirfieldTemplates.ts` or a shared module). Do not duplicate the computation.

##### Steps

1. Identify where `perimDist` is set in `AirfieldLayoutGenerator`.
2. Expose `AIRFIELD_ENVELOPE_STRUCTURE_BUFFER_M` and the `maxLateralSurfaceReach(template)` helper from `TerrainFeatureCompiler` (or factor out to a shared file).
3. Clamp `perimDist` to `innerLateral - 8`.
4. Write probe `airfield-heightmap-slice-after.json` and compare against baseline: perimeter placement Y values should be within 0.5 m of envelope target height.
5. Vitest regression: "for us_airbase template, perimeter placement at max radius lands inside envelope `innerLateral`."

##### Exit criteria

- Perimeter placement at main_airbase lands inside the flat zone (verified via probe heightmap slice).
- `npm run lint`, `npm run test:run`, `npm run build` green.

##### Non-goals

- Do not change `STRUCTURE_SCALE` or any per-model constants.
- Do not change the envelope geometry itself (that's task 11).

##### Hard stops

- Clamping reduces perimeter structure count below the template's `structureCount` minimum -> STOP, reassess (perhaps shrink spacing instead of clamping radius).
- Fence change -> STOP.

---

#### Task 10: airfield-prop-footprint-sampling

**Slug:** `airfield-prop-footprint-sampling`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Priority:** P1 - resolves residual foundation float/sink on slope-crossing footprints even inside the envelope.
**Playtest required:** NO (probe-verified).
**Estimated risk:** medium - changes how airfield props resolve Y; a bug here could sink props into the ground.
**Budget:** <=200 LOC.
**Files touched:**
- Modify: `src/systems/world/WorldFeatureSystem.ts:200-202` (the `skipFlatSearch` branch) and/or `src/systems/world/AirfieldLayoutGenerator.ts` (if `skipFlatSearch` is authored there).

##### Required reading first

- `src/systems/world/WorldFeatureSystem.ts:143-230` (spawnFeature).
- `src/systems/world/WorldFeatureSystem.ts:469-549` (`resolveTerrainPlacement`, the 9-point footprint solver that airfield props currently skip).

##### Fix

Replace the binary `skipFlatSearch ? centroid-Y : resolveTerrainPlacement(...)` with a tier system:
- Airfield runway / apron / taxiway surfaces: centroid Y (current behaviour); these are on the flattest part of the stamp.
- Airfield perimeter / dispersal structures: full `resolveTerrainPlacement` footprint solver. The flag on placement becomes `placementTier: 'surface' | 'structure' | 'perimeter'` with defaults derived from zone.

Alternative minimal fix: keep the flag but gate it: `skipFlatSearch` only skips the footprint if the structure is inside `envelopeInnerLateral * 0.6` (truly interior). Outside that, fall through to `resolveTerrainPlacement`.

Executor picks the minimal option that makes the probe pass.

##### Steps

1. Read both files.
2. Implement the minimal "gated skipFlatSearch" variant. Dev boot; inspect perimeter tower foundations visually via dev cam.
3. If foundations still float/sink, extend to full footprint solver.
4. Probe: compute a foundation-clearance score for each placed structure = distance between object bottom and underlying terrain at 4 corners. Assert all perimeter structures have score < 0.3 m at all corners.
5. Regression Vitest on the resolver branch selection.

##### Exit criteria

- Perimeter structure foundation-clearance probe score < 0.3 m at all corners.
- `npm run lint`, `npm run test:run`, `npm run build` green.

##### Non-goals

- Do not touch `freezeTransform` or collision registration.
- Do not migrate non-airfield features.

##### Hard stops

- Some perimeter structures now fail to place (resolver rejects) -> STOP, lower slope threshold in resolver or reduce structure count, record in summary.
- Fence change -> STOP.

---

#### Task 11: airfield-envelope-ramp-softening

**Slug:** `airfield-envelope-ramp-softening`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Priority:** P1 - replaces the 6 m hard ramp at the flat-edge with a wider, softer blend. Addresses the residual "ring of sloped hillside" around airfields.
**Playtest required:** NO (probe-verified via heightmap slice).
**Estimated risk:** low - two constant changes; easy to revert.
**Budget:** <=50 LOC.
**Files touched:**
- Modify: `src/systems/terrain/TerrainFeatureCompiler.ts:372-379` (the envelope `outerRadius`, `gradeRadius`, `gradeStrength` computation) and the `AIRFIELD_ENVELOPE_GRADE_RAMP_M` / `AIRFIELD_ENVELOPE_GRADE_STRENGTH` constants.

##### Required reading first

- `src/systems/terrain/TerrainFeatureCompiler.ts:339-402` (envelope stamp builder).

##### Fix

Two constant changes:
- `outerRadius = innerRadius + 12` (up from +6): doubles the hard-ramp width.
- `AIRFIELD_ENVELOPE_GRADE_STRENGTH` raised from its current value (~0.45 per diagnosis) to 0.65: the graded shoulder actually blends native terrain.

##### Steps

1. Change the two constants.
2. Probe heightmap slice: confirm the 6 m hard ramp is now 12 m, and shoulder blend produces a visible 2/3 reduction of native slope at `gradeRadius / 2`.
3. Vitest regression: stamp evaluated at `innerRadius + 6` returns a height within 0.3 m of `innerRadius + 0` target (was >1 m mismatch at 6 m hard ramp edge under native-cliff conditions).

##### Exit criteria

- Envelope transition confirmed soft via probe heightmap slice.
- No runway flatness regression at `innerRadius` (stamp still produces a pad at target height).
- `npm run lint`, `npm run test:run`, `npm run build` green.

##### Non-goals

- Do not change `AIRFIELD_ENVELOPE_STRUCTURE_BUFFER_M` (task 9 owns that).
- Do not change the rect-stamp grade (authored tuning).

##### Hard stops

- Softer shoulder leaves visible hillside inside perimeter placement radius -> confirm task 9 pulled perimeter inside; if that task failed, stop and queue reconciliation.
- Fence change -> STOP.

---

#### Task 12: airfield-taxiway-widening

**Slug:** `airfield-taxiway-widening`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Priority:** P2 - small quality fix; ensures painted taxiway sits inside guaranteed-flat ground.
**Playtest required:** NO (probe-verified).
**Estimated risk:** low.
**Budget:** <=50 LOC.
**Files touched:**
- Modify: `src/systems/terrain/TerrainFeatureCompiler.ts` (the `compileGeneratedTerrainStamps` capsule sizing, approximately lines 280-302).

##### Required reading first

- `src/systems/terrain/TerrainFeatureCompiler.ts:183-312` (full rect-to-capsule stamp compilation).

##### Fix

When emitting a taxiway capsule from a rect, set `innerRadius = min(width, length)/2 + innerPadding(1.5m) + TAXIWAY_EXTRA_PAD(2m)`. The extra 2 m ensures the visual tarmac paint (`surfacePatches`) is fully inside the flat band.

##### Steps

1. Identify the capsule sizing code in `compileGeneratedTerrainStamps`.
2. Add `TAXIWAY_EXTRA_PAD = 2` constant. Apply only when the source rect type is `taxiway` (not runway / apron).
3. Probe heightmap slice across a main_airbase taxiway; confirm full painted width sits on flat ground.
4. Vitest regression: taxiway rect width 12 m produces capsule with `innerRadius >= 12 / 2 + 1.5 + 2 = 9.5 m`.

##### Exit criteria

- Probe confirms all taxiway paint sits inside flat zone.
- `npm run lint`, `npm run test:run`, `npm run build` green.

##### Non-goals

- Do not change runway or apron capsule sizing.
- Do not change `RectTerrainSurfacePatch` semantics.

##### Hard stops

- Fence change -> STOP.

---

#### Task 13: continuous-contact-contract-memo

**Slug:** `continuous-contact-contract-memo`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Priority:** P1 - design output only; enables Cycle 4-equivalent architectural work in a future human-gated cycle.
**Playtest required:** NO (memo is text).
**Estimated risk:** none - no code.
**Budget:** no LOC cap; memo length ~1500-2500 words.
**Files touched:**
- Create: `docs/rearch/CONTINUOUS_CONTACT_CONTRACT.md`.

##### Purpose

Capture the unified contact-contract proposal so the human can review it with coffee and decide whether to open a follow-up implementation cycle.

##### Required reading first

- `docs/FLIGHT_REBUILD_ORCHESTRATION.md` "Why this plan exists" and "Repo pulse" sections (source of truth for the diagnosis).
- `docs/rearch/` existing memos for format precedent (e.g. `docs/rearch/E6-vehicle-physics-design.md` if present).
- `src/systems/vehicle/airframe/Airframe.ts`, `src/systems/vehicle/airframe/terrainProbe.ts`, `src/systems/combat/CombatantMovement.ts`, `src/systems/combat/CombatantLODManager.ts`, `src/systems/combat/CombatantRenderInterpolator.ts`, `src/systems/world/WorldFeatureSystem.ts`, `src/systems/terrain/TerrainFeatureCompiler.ts` - enough to describe each subsystem's current contact discipline accurately.

##### Memo structure

1. **Problem statement** - cite the four symptom classes this plan addressed (sticky takeoff, tick-back-and-forth, phase-through, NPC leap). Note that Round 1-3 of this cycle treated the symptoms; this memo proposes the architectural fix so the class of bug cannot re-emerge.
2. **Current contact disciplines** - one paragraph each for airframe, NPC low-LOD, NPC high-LOD, distant-culled NPC, prop placement. Cite file:line.
3. **Proposed contract** - three rules: (a) any actor translating with `|velocity| * dt > threshold` sweeps its motion vector against registered obstacles; (b) any simulated body rendered to screen exposes `prev / current` pose and renders at `alpha = accumulator / dt`; (c) any prop placed on heightmap samples its full footprint, rejects unsafe slopes, and snaps to min-corner or flattens before place.
4. **API shapes** - what `ContactSweepRegistry.registerStatic(mesh)` would look like, how `Airframe` / `CombatantMovement` / `WorldFeatureSystem` consume it.
5. **Migration plan** - ordering: introduce the BVH + registry; migrate airframe (already partly migrated); migrate NPC low-LOD path; migrate prop placement. Estimate LOC per migration.
6. **Risk and rollback** - what breaks if the BVH is wrong; per-migration rollback strategy.
7. **Scope estimate for implementation cycle** - task count, parallelism, expected time.
8. **Open questions** - things the human needs to decide before implementation starts.

##### Steps

1. Read Required reading.
2. Draft the memo. Lean on the diagnosis already in `docs/FLIGHT_REBUILD_ORCHESTRATION.md`; do not re-derive.
3. Commit as `docs/rearch/CONTINUOUS_CONTACT_CONTRACT.md` on a branch `task/continuous-contact-contract-memo`.
4. Open PR. CI runs lint on markdown if configured; otherwise lint is vacuous for this task.

##### Exit criteria

- Memo exists at the path above.
- Memo has all 8 sections.
- No new source files committed.
- `npm run lint`, `npm run test:run`, `npm run build` green (should be unchanged).

##### Non-goals

- Do not write any source code.
- Do not modify the orchestration plan or AGENT_ORCHESTRATION.md.

##### Hard stops

- Author realizes the contract cannot be expressed cleanly as three rules -> STOP, surface. The memo is still useful as a problem framing even without a proposal.

---

## Post-cycle summary template (orchestrator prints at end of run)

When the orchestrator finishes Round 4 (or gets stuck earlier), it writes this summary into `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/RESULT.md` and also prints it to terminal:

```
Cycle: cycle-2026-04-22-flight-rebuild-overnight
Started: <ISO timestamp>
Ended:   <ISO timestamp>

Round 1 (Tier 0+1 correctness + takeoff feel): 5/5 merged | blocked: <count> | failed: <count>
Round 2 (Tier 2 climb stability):              3/3 merged | blocked: <count> | failed: <count>
Round 3 (Tier 3 airfield placement):           4/4 merged | blocked: <count> | failed: <count>
Round 4 (Tier 4 design memo):                  1/1 merged | blocked: <count> | failed: <count>

PR URLs:
  [R1] aircraft-building-collision:             <url>
  [R1] airframe-directional-fallback:           <url>
  [R1] airframe-altitude-hold-unification:      <url>
  [R1] airframe-ground-rolling-model:           <url>
  [R1] player-controller-interpolated-pose:     <url>
  [R2] airframe-soft-alpha-protection:          <url>
  [R2] airframe-climb-rate-pitch-damper:        <url>
  [R2] airframe-authority-scale-floor:          <url>
  [R3] airfield-perimeter-inside-envelope:      <url>
  [R3] airfield-prop-footprint-sampling:        <url>
  [R3] airfield-envelope-ramp-softening:        <url>
  [R3] airfield-taxiway-widening:               <url>
  [R4] continuous-contact-contract-memo:        <url>

Probe acceptance deltas (cycle-2026-04-22-flight-rebuild-overnight/evidence/):
  Building sweep-hit coverage:          before=0%         after=<result>
  Terrain post-liftoff phase-through:   before=<ms>       after=<ms>
  Pitch authority at 0.85*Vr:           before=0          after=<fraction>
  Rollout Y monotonicity violations:    before=<count>    after=<count>
  Pose-continuity drift at 144 Hz:      before=<max>      after=<max>
  Climb vertical-speed RMS oscillation: before=<m/s>      after=<m/s>
  Airfield perimeter clearance score:   before=<max m>    after=<max m>
  Heightmap hard-ramp width at edge:    before=6m         after=<m>

Perf deltas:
  combat120:
    p95: <ms> (delta <pct>%)
    p99: <ms> (delta <pct>%)

Blocked / failed tasks:
  <slug>: <one-line cause>

Morning review pack for human:
  - Watch A-1 takeoff on main_airbase with the deployed build.
  - Spot-check Ta Bat + A Luoi airfields visually.
  - Read docs/rearch/CONTINUOUS_CONTACT_CONTRACT.md.
  - Decide: open cycle-2026-04-XX-continuous-contact-implementation? y/n.
```

---

## Autonomous overnight protocol (how to run)

Goal: the user opens a fresh Claude Code session before bed, runs `/orchestrate`, goes to sleep; wakes up to merged PRs, probe evidence, and a summary to read.

### Prep (user does before starting the overnight session, or the session's orchestrator does as Round 0)

1. `git checkout master && git pull` - ensure starting point is clean master.
2. `git status` - confirm no uncommitted edits that would taint worktrees. If dirty, stash first.
3. Confirm `.env` / local config is good for probe runs: `npm run probe:fixed-wing` runs cleanly once manually. If the probe fails on master, the whole cycle will fail; fix the probe first.
4. Capture `npm run perf-capture:combat120` once on a quiet machine. Commit to `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/baseline/perf-baseline-combat120.json`. Manually running this once is simpler than trying to automate it on a machine that might not be quiet.

### Seeding AGENT_ORCHESTRATION.md (one-time edit, can be scripted)

Replace the "## Current cycle" section of `docs/AGENT_ORCHESTRATION.md` with:

```markdown
## Current cycle: cycle-2026-04-22-flight-rebuild-overnight

### Cycle ID

`cycle-2026-04-22-flight-rebuild-overnight`

### Why this cycle exists

See `docs/FLIGHT_REBUILD_ORCHESTRATION.md`. This cycle ships Tiers 0-3 as code and Tier 4 as a design memo, autonomously overnight. Orchestrator runs all four rounds sequentially without human gates.

### Tasks in this cycle

See "Tasks in this cycle" section of `docs/FLIGHT_REBUILD_ORCHESTRATION.md`.

### Round schedule

See "Round schedule" section of `docs/FLIGHT_REBUILD_ORCHESTRATION.md`. Four rounds, 5 / 3 / 4 / 1 tasks.

### Concurrency cap

5 (within a round).

### Dependencies

See "Dependencies" section of `docs/FLIGHT_REBUILD_ORCHESTRATION.md`.

### Playtest policy

DEFERRED to morning. No playtest gates block merge.

### Perf policy

`combat120` captured at Round 0 and post-Round-3. p99 budget = within 5% of baseline.

### Failure handling

CI red / fence change / probe-assertion fail = mark task blocked-or-rolled-back and continue. Round N proceeds with whatever R(N-1) produced. See `docs/FLIGHT_REBUILD_ORCHESTRATION.md` "Failure handling (autonomous-safe)" section.

### Visual checkpoints (orchestrator-gated)

NONE. Autonomous run.

### skip-confirm

YES. Orchestrator does NOT pause for "go" between rounds.

### Cycle-specific notes

- This is a single-session autonomous run. On start, orchestrator reads this cycle, seeds TaskCreate, captures Round 0 baseline, then advances R1 -> R2 -> R3 -> R4 without human intervention.
- Task briefs live in `docs/tasks/<slug>.md` for all 13 tasks. Orchestrator creates them from the inline briefs in `docs/FLIGHT_REBUILD_ORCHESTRATION.md` if they do not already exist (one-time seed-from-plan step).
- Post-cycle, orchestrator writes `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/RESULT.md` with the summary template from `docs/FLIGHT_REBUILD_ORCHESTRATION.md`.
```

### Single-command overnight invocation

User types this into a fresh Claude Code session and walks away:

```
/orchestrate
```

The main Claude Code session is the orchestrator. It:

1. **Reads** `.claude/agents/orchestrator.md` and `docs/AGENT_ORCHESTRATION.md`.
2. **Prep step (Round 0):**
   - `git fetch origin && git status` - must be clean.
   - **Seed task briefs**: for each of the 13 slugs listed in the "Current cycle" section, if `docs/tasks/<slug>.md` does not exist, copy the corresponding brief from the "Task briefs (inline)" section of `docs/FLIGHT_REBUILD_ORCHESTRATION.md` into that file. This lets executors read a single-file brief.
   - Create `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/{baseline,evidence,screenshots}/` directories (empty files placeholder is fine).
   - Run `npm run probe:fixed-wing`; capture output to `baseline/probe-before.json`.
   - Commit `docs: seed cycle-2026-04-22-flight-rebuild-overnight` on master (or on a branch if master is protected — prefer branch `setup/<cycle-id>` with a PR that merges before Round 1 dispatches).
3. **Dispatch Round 1** (5 parallel `Agent(subagent_type=executor, isolation=worktree, ...)` calls, one message).
4. **Wait for each Round 1 executor**:
   - Monitor CI via `gh pr checks <url> --watch` or polled `gh pr view --json statusCheckRollup,mergeable`.
   - On CI green: run `combat-reviewer` if diff touches `src/systems/combat/**`; run `terrain-nav-reviewer` if diff touches terrain/nav; `gh pr merge --rebase`. Mark `completed`.
   - On CI red: mark `blocked`, record in a running summary buffer, continue with remaining Round 1 tasks.
   - On fence-change: mark `blocked` with `fence_change: yes`, continue.
5. **When all Round 1 tasks are completed-or-blocked:**
   - Run `perf-analyst` on `combat120` for a mid-cycle check. Record delta.
   - **Immediately advance to Round 2** (no user confirmation; `skip-confirm: YES`).
6. **Repeat steps 3-5 for Round 2, Round 3.**
7. **Round 4** (design memo): dispatch solo. Merge on CI green. No reviewer needed (markdown).
8. **Post-cycle:**
   - Write `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/RESULT.md` with the summary template.
   - Archive merged briefs: `git mv docs/tasks/<slug>.md docs/tasks/archive/cycle-2026-04-22-flight-rebuild-overnight/<slug>.md` for each merged task.
   - Append a "Recently Completed" section to `docs/BACKLOG.md` with PR list + per-task one-liners.
   - Reset the "Current cycle" stub in `docs/AGENT_ORCHESTRATION.md`.
   - Commit `docs: close cycle-2026-04-22-flight-rebuild-overnight`.
9. **Print the RESULT.md summary** to the terminal as the final message so the user sees it at the top of their session in the morning.

### What the user does in the morning

1. Read the terminal output (summary is the last message, or `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/RESULT.md`).
2. `git log --oneline -20` - see what merged.
3. Boot `npm run dev`, test A-1 takeoff on main_airbase: rotation progressive, no phase-through, no tick at speed. Climb hands-off: no phugoid. Fly to Ta Bat / A Luoi: airfield perimeter foundations sit on flat ground.
4. Read `docs/rearch/CONTINUOUS_CONTACT_CONTRACT.md` to decide next cycle.
5. If something regressed subjectively, revert the specific PR (all PRs are single-purpose and small; easy to drop one).

### If the orchestrator gets stuck

Failure modes that would legitimately halt the cycle:

- `gh` CLI not authenticated -> orchestrator fails at first dispatch. User fixes in the morning.
- Node / npm environment broken -> probe fails at Round 0, orchestrator halts. User fixes in the morning.
- Persistent CI failure unrelated to the task (e.g. flaky test not our fault) -> orchestrator marks all downstream tasks blocked and still writes RESULT.md.
- `docs/AGENT_ORCHESTRATION.md` "Current cycle" stub not updated -> orchestrator halts at step 1. User seeds and retries.

The orchestrator never silently gives up - there is always a written RESULT.md reporting what happened.

---

## References

- Diagnostic synthesis that seeded this plan: conversation 2026-04-21 (four parallel research agents; four reports on flight subsystem, airfield terrain, external best practices, NPC terrain coupling).
- Operating manual: `docs/AGENT_ORCHESTRATION.md`.
- Orchestrator playbook: `.claude/agents/orchestrator.md`.
- Orchestrate command: `.claude/commands/orchestrate.md`.
- Test contract: `docs/TESTING.md`.
- Interface fence: `docs/INTERFACE_FENCE.md`.
- Playtest checklist: `docs/PLAYTEST_CHECKLIST.md`.
- Active backlog: `docs/BACKLOG.md`.
- Deploy workflow: `docs/DEPLOY_WORKFLOW.md`.
- Prior cycle README (for comparison): `docs/cycles/cycle-2026-04-21-stabilization-reset/README.md`.
- Key prior task briefs (patterns + context):
  - `docs/tasks/archive/cycle-2026-04-21-atmosphere-polish-and-fixes/aircraft-ground-physics-tuning.md`
  - `docs/tasks/archive/cycle-2026-04-21-atmosphere-polish-and-fixes/airfield-terrain-flattening.md`
  - `docs/tasks/archive/cycle-2026-04-21-atmosphere-polish-and-fixes/npc-and-player-leap-fix.md`

External references (from 2026-04-21 research sweep):

- [brihernandez/ArcadeJetFlightExample](https://github.com/brihernandez/ArcadeJetFlightExample) - canonical arcade-flight pattern (target rates + high drag + friction taper).
- [Glenn Fiedler - Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/) - the fixed-step + interpolation contract.
- [Glenn Fiedler - Physics in 3D](https://gafferongames.com/post/physics_in_3d/) - quaternion integration; renormalize every step.
- [Zeux - Approximating slerp](https://zeux.io/2015/07/23/approximating-slerp/) - NLERP for render interpolation.
- [Rapier - Rigid-body CCD](https://rapier.rs/docs/user_guides/javascript/rigid_body_ccd/) - continuous collision detection reference.
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) - the static-obstacle BVH for Cycle 4.
- [Kacper Szwajka - GPU Procedural Placement on Terrain](https://medium.com/@kacper.szwajka842/gpu-run-time-procedural-placement-on-terrain-cc874e39bbfb) - slope-aware footprint sampling.
