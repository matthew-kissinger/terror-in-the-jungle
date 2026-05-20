# Cycle: Motor pool layout reflow + Open Frontier M48 deduplication

Last verified: 2026-05-20 (queued at insertion; pre-dispatch)

## Status

Queued at **position #3** in
[docs/CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md](../CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md).
Independent of cycles #1 and #2 — runs in parallel.

Opens and closes a new ID `VEKHIKL-LAYOUT-1` in CARRY_OVERS.md.

## Skip-confirm: no

Owner playtest required: load Open Frontier, walk to the airfield Main
Motor Pool, confirm vehicles are spread out and not clipping; confirm
exactly ONE M48 is visible at the motor pool and no duplicate at the
FOB. Deferred to PLAYTEST_PENDING under autonomous-loop posture; merge
gated on CI green + Playwright capture pair (pre/post).

## Concurrency cap: 2

R1 ships two independent landings: prefab reflow + scenario M48
relocation. R2 ships capture set + playtest evidence.

## Objective

Two related issues observed in the 2026-05-20 owner walk of
`terror-in-the-jungle.pages.dev`:

**Issue A — motor pool clutter.** The `motor_pool_heavy` prefab
(`src/systems/world/WorldFeaturePrefabs.ts:164-177`) crams the four
ground vehicles into a 4 m-deep strip at z ∈ [10, 14]:

| Vehicle | offset (x, z) | yaw | approx hull |
|---|---|---|---|
| M35 truck | (-18, 12) | 90° | 6.7 × 2.4 m |
| M151 jeep | (-4, 13) | 81° | 3.4 × 1.6 m |
| M113 APC | (12, 10) | 104° | 4.9 × 2.7 m |
| M48 Patton | (24, 14) | 108° | 7.5 × 3.6 m |

Layout problems:
- All vehicles in one row, all facing roughly the same direction (yaw
  spread 27°), all in a 4 m z-band. Reads as a rigid parking strip.
- M48 at x=24 with a 7.5 m hull (half-length 3.75 m at yaw 108°)
  pushes its front edge to z ≈ 10.25 — basically nose-to-tail with
  the M113 at (12, 10). Functionally non-blocking because they're 12 m
  apart in X, but at oblique angles it reads as overlap.
- The M48 (24, 14) sticks out east further than the GENERATOR_SHED at
  (20, -4) that should be framing the lot.
- Crates (AMMO/SUPPLY/FUEL) line up directly behind at z=20, reinforcing
  the "two rigid rows" look.

**Issue B — Open Frontier M48 duplicate.** Two M48s spawn on OF:
- The `motor_pool_heavy` prefab places an M48 model at the airfield
  motor pool (155, 0, -1195) as a static dressing prop — this is the
  one the owner sees at the airfield.
- The scenario spawn table (`M48TankSpawn.ts:117`,
  `m48-config.ts:47`) places a separate real `Tank` IVehicle instance
  at `(-995, 0, -760)` near the West FOB. This is the one NPCs can
  gunner; it is the only "real" M48 in the OF scene.

The prefab M48 is visual-only; if the player walks up to it they see
a tank but can't board it (and after cycle #1 of this campaign lands,
the proximity prompt won't fire because the prefab placement is not
registered with VehicleManager). The scenario M48 is at a different
spot, with no visual connection to the motor pool.

This cycle:
1. Reflows `motor_pool_heavy` to give each vehicle clear footprint
   space, varied facings, and z-stagger.
2. Relocates the OF scenario M48 from `(-995, -760)` to a spot inside
   the new motor-pool layout — replacing the static prefab dressing
   tank with the real Tank IVehicle. The dressing tank is removed from
   the prefab to avoid the duplicate.

After this cycle:
- OF has exactly ONE M48 visible — the real Tank instance, parked at
  the motor pool, boardable via the F-key path landed in cycle #1 of
  this campaign.
- The motor pool reads as a working motor pool, not a "vehicles in a
  warehouse parking lot" lineup.

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. **The current motor pool prefab:**
   - `src/systems/world/WorldFeaturePrefabs.ts:164-177`
     (`motor_pool_heavy` placements).
   - `src/systems/world/WorldFeaturePrefabs.ts:155-163`
     (`motor_pool_small` — a smaller variant for comparison; also has
     M151 + M35 + M113 in tighter layout).
2. **Where the prefab is placed:**
   - `src/config/OpenFrontierConfig.ts:200-223`
     (`airfield_motor_pool` feature, prefabId `motor_pool_heavy`,
     footprint radius 36 m at position `(155, 0, -1195)`).
   - `src/config/AShauValleyConfig.ts:360-380` — A Shau Main Motor
     Pool, also `motor_pool_heavy`. Any prefab change affects both
     scenarios.
3. **OF scenario M48 spawn:**
   - `src/config/vehicles/m48-config.ts:45-50`
     (`M48_SPAWN_OFFSETS.open_frontier` = `{ x: -995, z: -760, yaw: 0 }`,
     "Open Frontier: US base — ~30 m east of the FOB centre at
     `(-1025, 0, -760)`").
   - `src/systems/vehicle/M48TankSpawn.ts:116-121` (the open_frontier
     scenario spawn row).
4. **Vehicle hull dimensions (do NOT change):**
   - `src/config/vehicles/m48-config.ts` — `M48_HULL_DIMENSIONS`.
   - `src/systems/vehicle/GroundVehicle.ts:26` — `M151_PHYSICS_CONFIG`.
5. **Collision registration path:**
   - `src/systems/world/WorldFeatureSystem.ts:340-360` — where prefab
     placements get registered for collision; the
     `registerGroundVehiclePlacement` call at line 343 ALSO registers
     the M151 with VehicleManager. The M48 in `motor_pool_heavy` is
     currently NOT routed through `registerGroundVehiclePlacement`
     because the prefab placement contract doesn't know about
     scenario-spawn vehicles — the prefab M48 is a pure visual.
6. **A Shau M48 scenario spawn (do NOT change):**
   - `M48_SPAWN_OFFSETS.a_shau_valley` and the A Shau motor pool
     placement coexist. A Shau has its own arrangement; this cycle is
     OF-only. The A Shau prefab + scenario M48 setup is owner-accepted
     per cycle-vekhikl-3 playtest evidence.

## Critical Process Notes

1. **A Shau is untouched.** Both the prefab change and the OF scenario
   M48 relocation must NOT change A Shau visuals. The prefab change
   ripples to A Shau because `motor_pool_heavy` is used there too —
   resolve by either (a) keeping placements visually equivalent on A
   Shau via A Shau playtest evidence comparison, OR (b) splitting
   `motor_pool_heavy` into `motor_pool_heavy_of` + `motor_pool_heavy_ashau`
   if the reflow diverges enough.
2. **No new vehicle types.** That's the `cycle-vekhikl-5-fleet-expansion`
   hold-list cycle.
3. **The prefab M48 visual prop is removed in OF.** If kept (to match
   the A Shau layout), the OF executor must verify the proximity prompt
   doesn't fire near it (since it's not a VehicleManager-registered
   instance) — but this leaves the "two M48s in OF" optics problem.
   **Default: remove the prefab M48 entry from `motor_pool_heavy` and
   spawn the real Tank IVehicle at the same world-space anchor via the
   relocated `M48_SPAWN_OFFSETS.open_frontier`.**
4. **Backwards compat:** all existing world-feature tests that assert
   on motor_pool_heavy placements must be updated or split.
5. **No fence change.** WorldFeaturePrefab / M48TankSpawn shapes stay
   as-is.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `motor-pool-heavy-reflow`, `of-tank-relocate-to-motor-pool` | 2 | Two independent landings. |
| 2 | `motor-pool-and-tank-dedup-playtest-evidence` | 1 | Single playtest PR. |

## Task Scope

### motor-pool-heavy-reflow (R1)

Rework the `motor_pool_heavy` prefab layout.

**Files touched:**
- `src/systems/world/WorldFeaturePrefabs.ts` — rewrite the
  `motor_pool_heavy` placements. Optionally split into
  `motor_pool_heavy_of` + `motor_pool_heavy_ashau` if the reflow can't
  satisfy both scenarios.
- `src/config/OpenFrontierConfig.ts` — if the prefab is split,
  update the `airfield_motor_pool` feature's `prefabId`.
- `src/config/AShauValleyConfig.ts` — if split, update analogously.
- `src/systems/world/WorldFeaturePrefabs.test.ts` — update.
- `src/systems/world/WorldFeatureSystem.test.ts` — update if any
  placement-count assertion changes.

**Method:**
1. Design constraint: each vehicle must have ≥ 1.5 m clearance to any
   other vehicle's bounding box at the placement yaw. Compute via
   `hull_half_length × cos(yaw) + hull_half_width × sin(yaw)` for each
   axis.
2. Recommended layout (illustrative; executor may iterate):
   - M48 Patton: own bay, push east to `(28, 0, 22)` yaw `Math.PI * 0.55`
     (~99° → roughly perpendicular to lot, hull along Z). Now sits
     forward of the warehouse, no longer flush with the generator
     shed.
   - M113 APC: `(10, 0, 18)` yaw `Math.PI * 0.6` (108°). Z-staggered
     ~4 m forward of M48.
   - M151 jeep: `(-2, 0, 8)` yaw `Math.PI * 0.4` (72°). Set apart
     from the heavies, closer to the warehouse, distinctive yaw.
   - M35 truck: `(-16, 0, 14)` yaw `Math.PI * 0.5` (90°). Stays west
     side near generator-shed line.
3. Move the crate row off the parking strip — push to east of the
   warehouse:
   - AMMO_CRATE → `(-22, 0, 0)`.
   - SUPPLY_CRATE → `(-22, 0, 4)`.
   - FUEL_DRUM → `(-22, 0, -4)`.
   The crates now flank the comms tower instead of forming a second
   row behind the vehicles.
4. Remove the `M48_PATTON` entry from the prefab placements (covered
   by sibling task `of-tank-relocate-to-motor-pool` — that task spawns
   the real Tank IVehicle at the same anchor; the dressing prefab M48
   is no longer needed).
5. Verify the placements all sit inside the prefab footprint radius
   (36 m at OF; 36 m at A Shau).
6. Behavior test asserts: each pair of vehicles has ≥ 1.5 m
   bounding-box clearance.
7. Commit message: `feat(world): motor_pool_heavy reflow with bays + staggered yaws (motor-pool-heavy-reflow)`.

**Acceptance:**
- Lint + tests + build green.
- Layout behavior test passes (≥ 1.5 m clearance).
- A Shau motor pool capture compared pre/post — no visual regression
  flagged.
- No fence change.

### of-tank-relocate-to-motor-pool (R1)

Move the OF scenario M48 anchor to the motor pool; remove dressing
prefab M48 (handled by sibling reflow task).

**Files touched:**
- `src/config/vehicles/m48-config.ts` — update
  `M48_SPAWN_OFFSETS.open_frontier` to the motor pool anchor.
- `src/systems/vehicle/M48TankSpawn.ts` — update doc-comments
  referring to "US FOB" anchor.
- `src/config/OpenFrontierConfig.ts` — confirm motor pool anchor
  position; consider rotating the scenario M48 yaw to match the
  prefab bay's facing.
- Sibling tests.

**Method:**
1. New OF M48 spawn coord: motor pool anchor `(155, 0, -1195)` +
   offset for the M48's bay slot in the reflowed prefab. Roughly
   `(155 + 28, 0, -1195 + 22) = (183, 0, -1173)`, yaw `Math.PI * 0.55`.
2. Sibling reflow task must NOT include the prefab M48 placement (so
   only the real Tank IVehicle renders here).
3. Update `M48TankSpawn.ts:118` doc-comment to reflect the new
   anchor.
4. Behavior test asserts: `M48_SCENARIO_SPAWNS.open_frontier.position`
   reads the motor pool's `(183, 0, -1173)` (or whatever the bay
   anchor lands at).
5. Commit message: `feat(vehicle): relocate OF M48 to motor pool bay (of-tank-relocate-to-motor-pool)`.

**Acceptance:**
- Lint + tests + build green.
- Scenario spawn test passes.
- The real Tank IVehicle renders at the motor pool; no duplicate dressing
  tank because the sibling reflow task removes it.
- A Shau M48 spawn unchanged.
- No fence change.

### motor-pool-and-tank-dedup-playtest-evidence (R2, merge gate)

Capture set + playtest doc.

**Files touched:**
- `scripts/capture-motor-pool-shots.ts` — new capture script.
- `docs/playtests/cycle-motor-pool-reflow-and-tank-dedup.md` —
  new memo.
- Append to `docs/PLAYTEST_PENDING.md`.

**Method:**
1. Capture pre/post pair for OF motor pool wide shot:
   `of-motor-pool-pre.png`, `of-motor-pool-post.png`.
2. Capture pre/post pair for A Shau motor pool to prove no regression:
   `ashau-motor-pool-pre.png`, `ashau-motor-pool-post.png`.
3. Capture OF FOB area to confirm no M48 there now:
   `of-fob-no-tank.png`.
4. Capture proximity-prompt check at the relocated OF M48:
   `of-motor-pool-tank-prompt.png` (requires the cycle #1 boarding
   wire being in the build; if not, prompt may not render — note in
   memo).
5. Memo lists owner walk: load OF, navigate to motor pool, confirm
   one M48 (not two), confirm spacing reads, confirm A Shau motor
   pool unchanged.
6. Append PLAYTEST_PENDING row.
7. Commit message: `docs(world): motor pool reflow + OF tank dedup playtest evidence (motor-pool-and-tank-dedup-playtest-evidence) (playtest-deferred)`.

**Acceptance:**
- 5+ Playwright captures committed.
- Playtest memo + PLAYTEST_PENDING row landed.
- No fence change.

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- A Shau motor pool visual regresses (pre/post diff > minor) → halt;
  split the prefab to avoid the regression.
- Reflow places any vehicle outside the prefab footprint radius (36 m)
  → halt; tighten the placements.
- Scenario M48 relocates but the dressing M48 prefab entry is left in
  place (resulting in two M48s in OF) → halt; the reflow task must
  remove the dressing tank.

## Reviewer Policy

- **No mandatory `combat-reviewer`** — no combat code change.
- **No mandatory `terrain-nav-reviewer`** — no terrain or nav touches.
- Orchestrator reviews for: A Shau no-regression, no fence leak, the
  prefab clearance test reads correctly.

## Acceptance Criteria (cycle close)

**Layout:**
- `motor_pool_heavy` placements have ≥ 1.5 m clearance per behavior
  test.
- Each vehicle has a distinctive yaw (yaw spread ≥ 60° across the
  four vehicles).
- Crate row moved off the parking strip.

**Dedup:**
- Exactly one M48 visible in OF — the real Tank IVehicle at the motor
  pool.
- No dressing M48 in OF motor pool prefab.
- A Shau M48 setup unchanged (prefab dressing + scenario spawn co-exist
  as today).

**Tests:**
- Layout behavior test passes.
- Scenario spawn test passes.
- A Shau motor pool placements byte-identical (or visual capture proves
  no regression if the prefab is split).

**Playtest evidence:**
- 5+ Playwright captures committed.

**Other:**
- All R1 + R2 task PRs merged.
- Owner playtest sign-off recorded (deferred under autonomous-loop).
- No fence change.
- `VEKHIKL-LAYOUT-1` opened + closed in CARRY_OVERS.md.

## Out of Scope

- New vehicle types (M113, M35, T-54) — `cycle-vekhikl-5-fleet-expansion`
  hold-list cycle.
- Other motor pools (`motor_pool_small`, `airstrip_rough_small`, etc.)
  — they have different problems; this cycle is `motor_pool_heavy` only.
- A Shau visual reflow.
- Touching `src/systems/combat/**`, `src/systems/terrain/**`,
  `src/systems/navigation/**`.
- Fence touches.

## Open Questions (owner-default decisions pre-baked)

1. **Split `motor_pool_heavy` into per-scenario variants or keep
   shared?** **Default: keep shared; reflow must not regress A Shau.**
   If the reflow can't satisfy both, split into
   `motor_pool_heavy_of` + `motor_pool_heavy_ashau`.
2. **Where exactly does the real OF M48 land?** **Default: motor pool
   bay anchor `(183, 0, -1173)` yaw `Math.PI * 0.55`.** Executor may
   iterate to match the reflow's M48 bay coordinate.
3. **Does the OF FOB area still need a tank?** **Default: no.** The
   real Tank IVehicle moves to the motor pool. If the owner wants a
   second tank at the FOB, queue a follow-up to add a second OF M48
   scenario entry — out of scope here.

## Carry-over impact

- New ID: `VEKHIKL-LAYOUT-1`. Cycle-open ID.
- No hold-list additions.

Net cycle delta on active carry-over count: 0.
