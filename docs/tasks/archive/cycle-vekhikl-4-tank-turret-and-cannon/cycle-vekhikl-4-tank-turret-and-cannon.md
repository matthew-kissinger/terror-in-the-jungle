# Cycle: VEKHIKL-4 Tank Turret + Cannon + Ballistic Solver

Last verified: 2026-05-16

## Status

Queued at position #9 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
Closes `VEKHIKL-3+4` (turret + cannon half of VEKHIKL-3 lands here
along with VEKHIKL-4). **Blocked on cycle #8** (turret mounts onto
the chassis surface).

## Skip-confirm: no

Owner playtest required.

## Concurrency cap: 5

R1 ships turret rig + cannon + projectile; R2 ships ballistic
solver (Rust→WASM pilot) + AI gunner + damage states + playtest.

## Objective

Add the three primitives the tank needs to be a combat platform:

1. **Turret rig** with capped yaw + barrel pitch slew.
2. **Gunner seat** that reuses the helicopter seat-swap pattern and
   routes NPC gunner fire through the existing `CombatantAI`
   target-acquisition pipeline.
3. **Ballistic main-cannon projectile** (`TankCannonProjectile`)
   with gravity-only arc, arming distance, damage-type resolution.
4. **Damage HP bands** with three visual transitions + tracks-blown
   immobilization state (chassis blown — already in cycle #8 — plus
   turret-jammed + engine-killed bands).
5. **Rust → WASM pilot**: the ballistic solver is the named first
   Rust→WASM pilot per
   `docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` +
   `docs/rearch/TANK_SYSTEMS_2026-05-13.md`.

Source memos:
[docs/rearch/TANK_SYSTEMS_2026-05-13.md](../rearch/TANK_SYSTEMS_2026-05-13.md)
and
[docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md](../rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md).

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. [docs/rearch/TANK_SYSTEMS_2026-05-13.md](../rearch/TANK_SYSTEMS_2026-05-13.md)
   — turret + cannon + damage architecture brief.
2. [docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md](../rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md)
   — Rust→WASM pilot rationale.
3. `src/systems/vehicle/Tank.ts` — written in cycle #8; this cycle
   extends it.
4. `src/systems/vehicle/TrackedVehiclePhysics.ts` — chassis from
   cycle #8.
5. `src/systems/helicopter/HelicopterDoorGunner.ts:35` —
   crew-served pattern.
6. `src/systems/combat/CombatantBallistics.ts` — rifle hitscan.
7. `src/systems/combat/MortarBallistics.ts:22` — gravity-only arc
   template (mortar is the closest existing model).
8. `src/systems/combat/ai/CombatantAI.ts` — NPC gunner pipeline.

## Critical Process Notes

1. **Rust→WASM pilot is exploratory.** Per
   `BROWSER_RUNTIME_PRIMITIVES`, this is the first Rust→WASM pilot
   — not a default for the rest of the codebase. The ballistic
   solver was chosen because it's pure-math + hot + bounded
   surface. If the pilot doesn't produce a clear win (≥3x faster
   ballistic trajectory eval vs. TS), revert to TS-only and
   document why.
2. **`combat-reviewer` is pre-merge gate** for all combat-touching
   tasks.
3. **Owner playtest required.** Cannon feel, projectile travel
   visible, damage bands visually distinct.
4. **No fence change.** `SeatRole = 'pilot' | 'gunner' |
   'passenger'` already supports the gunner seat.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `tank-turret-rig`, `tank-cannon-projectile`, `tank-gunner-seat-adapter` | 3 | Turret + cannon + gunner adapter. Independent file targets. |
| 2 | `tank-ballistic-solver-wasm-pilot`, `tank-damage-states`, `tank-ai-gunner-route`, `vekhikl-4-playtest-evidence` | 4 | WASM pilot + damage + AI + playtest. |

## Task Scope

### tank-turret-rig (R1)

Author the turret + barrel rig with capped yaw + barrel pitch slew.

**Files touched:**
- New: `src/systems/vehicle/TankTurret.ts` (~300 LOC).
- New sibling test.

**Method:**
1. Turret state: `yaw`, `barrelPitch`, `yawSlewRate`,
   `barrelPitchSlewRate`.
2. Yaw: 360° unconstrained; slew capped (e.g., 30°/s).
3. Barrel pitch: capped to [-10°, +20°]; slew capped (e.g., 8°/s).
4. Mount onto `Tank.ts` chassis (parent-child relationship for
   transform).
5. Commit message: `feat(vehicle): TankTurret rig with capped slew (tank-turret-rig)`.

**Acceptance:**
- Tests + build green.
- Behavior tests: slew capping, pitch clamping, yaw unconstrained.

### tank-cannon-projectile (R1)

Author `TankCannonProjectile` with gravity-only arc, arming
distance, damage-type resolution.

**Files touched:**
- New: `src/systems/combat/projectiles/TankCannonProjectile.ts`
  (~350 LOC).
- New sibling test.

**Method:**
1. Spawn at barrel tip; initial velocity along barrel direction
   × muzzle velocity (M48 90 mm M41 ~600 m/s; tune for feel —
   target ~400 m/s for visible travel).
2. Gravity-only arc (mirrors `MortarBallistics.ts:22`).
3. Arming distance: 20 m (no damage in close range — safety against
   accidental crew kills).
4. Damage type resolution: AP vs HEAT vs HE — at MVP, single round
   type (AP); the resolution function exists for future shell types.
5. Impact: explosion effect (existing
   `ExplosionEffectsPool`) + damage in radius via existing
   damage-application path.
6. Commit message: `feat(combat): TankCannonProjectile gravity arc + arming (tank-cannon-projectile)`.

**Acceptance:**
- Tests + build green.
- `combat-reviewer` APPROVE.
- Behavior tests: launch, arc, gravity, impact, arming distance.

**Reviewer gate: `combat-reviewer` required pre-merge.**

### tank-gunner-seat-adapter (R1)

Author `TankGunnerAdapter.ts` that reuses the helicopter seat-swap
pattern.

**Files touched:**
- New: `src/systems/vehicle/TankGunnerAdapter.ts` (~250 LOC).
- New sibling test.

**Method:**
1. Player seats via existing
   `IVehicle.enterVehicle(_, 'gunner')`.
2. Mouse drives turret yaw + barrel pitch (within cap).
3. LMB fires cannon (cycle #9 R2 wires `tank-cannon-projectile`).
4. Camera: gunner sight first-person (down barrel sights).
5. Pilot seat → gunner seat swap: existing `enterVehicle` accepts
   the role.
6. Commit message: `feat(vehicle): TankGunnerAdapter for player gunner seat (tank-gunner-seat-adapter)`.

**Acceptance:**
- Tests + build green.
- Behavior tests: seat enter/exit, input forward, pilot-gunner
  swap.

### tank-ballistic-solver-wasm-pilot (R2)

Rust→WASM ballistic-solver pilot.

**Files touched:**
- New: `rust/tank-ballistic-solver/` (Cargo crate with one
  function: `solveTrajectory(velocity, angle, target)`).
- New: build script in `scripts/build-wasm-ballistic-solver.sh`
  (or equivalent on Windows-friendly tooling).
- New: `src/systems/combat/projectiles/TankBallisticSolver.ts` —
  TS wrapper that loads the WASM module.
- `src/systems/combat/projectiles/TankCannonProjectile.ts` — use
  WASM solver for AI gunner lead-prediction; TS path stays for
  player (immediate input — no solver needed).

**Method:**
1. Rust crate exposes `solveTrajectory(v: f32, angle: f32,
   targetX: f32, targetY: f32, targetZ: f32, gravity: f32) ->
   Vec<TrajectorySample>` (single function).
2. Compile to WASM via `wasm-pack build --target web`.
3. TS wrapper loads via `await import('./tank-ballistic-solver.wasm')`
   dynamically.
4. Benchmark: TS-only baseline vs WASM-backed.
5. **Pilot success bar:** WASM must produce ≥3x speedup on the
   trajectory eval hot path. If less, document the result and
   revert to TS-only (the pilot conclusion is data, not commitment).
6. Commit message: `feat(combat): Rust->WASM ballistic solver pilot (tank-ballistic-solver-wasm-pilot)`.

**Acceptance:**
- Tests + build green.
- `combat-reviewer` APPROVE.
- Benchmark recorded in PR description.
- Pilot success bar evaluated honestly (don't ship a WASM module
  that's slower than TS).

**Reviewer gate: `combat-reviewer` required pre-merge.**

### tank-damage-states (R2)

HP bands with three visual transitions + turret-jammed +
engine-killed states.

**Files touched:**
- `src/systems/vehicle/Tank.ts` — HP bands + state machine.
- `src/systems/vehicle/TankTurret.ts` — disable on turret-jammed.
- `src/systems/vehicle/TrackedVehiclePhysics.ts` — already has
  tracks-blown from cycle #8; extend with engine-killed.
- New sibling tests.

**Method:**
1. HP bands: 100% / 66% / 33% / 0% with three visual transitions
   (smoke wisps → smoke plume → on-fire → wreck).
2. Random hit at < 33% HP can trigger one of three substate
   transitions: tracks-blown (immobilize), turret-jammed (no
   slew), engine-killed (no throttle).
3. Combinations possible (all three can fire on the same vehicle
   if hits land in the right places).
4. Commit message: `feat(vehicle): tank HP bands + substates (tank-damage-states)`.

**Acceptance:**
- Tests + build green.
- `combat-reviewer` APPROVE.
- Owner playtest verifies visual transitions are distinct.

**Reviewer gate: `combat-reviewer` required pre-merge.**

### tank-ai-gunner-route (R2)

NPC gunner uses the existing `CombatantAI` target-acquisition
pipeline; fires cannon using lead-prediction from the WASM solver.

**Files touched:**
- `src/systems/combat/ai/CombatantAI.ts` — add tank-mounted state
  branch.
- New sibling test.

**Method:**
1. NPC gunner mounted on a friendly tank uses
   `CombatantAI.acquireTarget(scene)` as if rifle-armed.
2. On target lock, instead of hitscan, NPC computes lead via the
   ballistic solver, slews turret to that lead position, fires
   when within turret cone tolerance.
3. NPC gunner does not pilot the tank simultaneously (pilot AI is
   separate); for MVP, NPCs default to gunner-only on parked
   tanks.
4. Commit message: `feat(combat): NPC tank gunner with lead prediction (tank-ai-gunner-route)`.

**Acceptance:**
- Tests + build green.
- `combat-reviewer` APPROVE.
- Dev preview: NPC gunner on parked tank fires at approaching
  enemy.

**Reviewer gate: `combat-reviewer` required pre-merge.**

### vekhikl-4-playtest-evidence (R2, merge gate)

Owner playtest.

**Files touched:**
- New: `docs/playtests/cycle-vekhikl-4-tank-turret-and-cannon.md`.

**Method:**
1. Owner mounts M48 in pilot seat, drives, then swaps to gunner.
2. Owner aims cannon, fires at static target, observes projectile
   arc + impact.
3. Owner takes hits from enemy AT; observes HP-band visual
   transitions.
4. Owner triggers each substate (tracks-blown / turret-jammed /
   engine-killed) via developer command + observes effect.
5. Owner observes NPC tank gunner engagement in dev preview.

**Acceptance:**
- Owner sign-off recorded.
- WASM pilot conclusion recorded in playtest memo (kept, reverted,
  or further investigation needed).

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- WASM pilot adds ≥600 KB gzipped to the bundle AND fails the ≥3x
  speedup bar → halt and surface (the size cost crosses the
  Rapier-evaluation gate per `ENGINE_TRAJECTORY` addendum and
  needs owner direction).
- Owner playtest rejects twice → halt.
- Any new external physics library → halt.

## Reviewer Policy

- `combat-reviewer` pre-merge gate for tank-cannon-projectile,
  tank-ballistic-solver-wasm-pilot, tank-damage-states,
  tank-ai-gunner-route.
- Orchestrator reviews other PRs.

## Acceptance Criteria (cycle close)

- All R1 + R2 task PRs merged.
- M48 fully combat-capable: drive, gun, take damage, observe
  transitions.
- Owner playtest sign-off.
- WASM pilot outcome documented (kept or reverted).
- No fence change.
- No perf regression > 5% p99 on `combat120` (tank combat is more
  expensive than rifle combat; budget pre-allocated per memo).
- `VEKHIKL-3` + `VEKHIKL-4` directives in `docs/DIRECTIVES.md`
  move to Closed with this cycle's close-commit SHA.

## Out of Scope

- T-54, M113, other tracked vehicles — future cycles.
- Coax MG on the turret — future cycle (M2HB-style emplacement
  pattern from cycle #6 can be adapted).
- Multi-shell types (HEAT, HE, smoke) — single AP round at MVP.
- Vehicle-vs-vehicle penetration tables — single AP, single damage
  curve.
- Multiplayer / lobby — out of scope across the campaign.
- Touching `src/systems/terrain/**`, `src/systems/navigation/**`.

## Carry-over impact

VEKHIKL-3 + VEKHIKL-4 live in `docs/DIRECTIVES.md`. Both close
here.

Net cycle delta: 0 active-list; +2 directives closed.
