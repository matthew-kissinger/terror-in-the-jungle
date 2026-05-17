# Cycle: VEKHIKL-2 Stationary Weapons

Last verified: 2026-05-16

## Status

Queued at position #6 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
Closes `VEKHIKL-2`. Builds on VEKHIKL-1's seat-occupant +
PlayerVehicleAdapter surface.

## Skip-confirm: no

Owner playtest required (player-facing feature).

## Concurrency cap: 4

R1 ships emplacement physics + adapter; R2 ships M2HB integration +
NPC gunner support + playtest.

## Objective

Ship fixed weapon emplacements (M2HB .50-cal heavy machine gun
mounted on a tripod or sandbag platform) that the player can mount
via the existing `IVehicle` seat-occupant surface. NPC gunners can
also occupy via the existing `CombatantAI` target-acquisition
pipeline.

**Scope is one emplacement family** — M2HB on tripod + sandbag
platforms. Other emplacements (Mk-19, M60 nest, ZPU AA, MK60 mortar
pit) follow in future cycles.

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. [docs/DIRECTIVES.md](../DIRECTIVES.md) VEKHIKL-2 row.
2. `src/systems/vehicle/IVehicle.ts` — `VehicleCategory` (extend if
   needed), `SeatRole` (`'pilot' | 'gunner' | 'passenger'`).
3. `src/systems/helicopter/HelicopterDoorGunner.ts:35` — crew-served
   weapon pattern (closest existing reference).
4. `src/systems/combat/CombatantBallistics.ts` — rifle-scale
   ballistics; M2HB extends this with higher RPM + heavier round.
5. `src/systems/combat/ai/CombatantAI.ts` — target-acquisition
   pipeline that NPC gunners hook into.
6. `cycle-vekhikl-1-jeep-drivable` (cycle #4) — predecessor
   chassis/adapter surface this cycle reuses.
7. M2HB tripod GLB: `public/models/weapons/static/m2hb-tripod.glb`
   (if exists; else flagged in R1 task as asset-missing).

## Critical Process Notes

1. **No new physics library.** The tripod is a static collider; the
   M2HB barrel is a rotation rig parented to it.
2. **Reuse `IVehicle` seat surface.** Emplacements are
   `VehicleCategory = 'emplacement'` (new value — confirm fence
   policy with orchestrator; if requires fence change, halt and
   surface).
3. **Owner playtest required.** Mount/dismount feel, recoil feel,
   NPC gunner aggressiveness.
4. **`combat-reviewer` is pre-merge gate** for tasks touching
   `src/systems/combat/**`.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `emplacement-vehicle-surface`, `emplacement-player-adapter` | 2 | Surface + adapter. Adapter depends on surface; serialize within R1. |
| 2 | `m2hb-weapon-integration`, `emplacement-npc-gunner`, `vekhikl-2-playtest-evidence` | 3 | M2HB wiring + NPC gunner + playtest. |

## Task Scope

### emplacement-vehicle-surface (R1)

Author the `Emplacement` IVehicle implementation.

**Files touched:**
- New: `src/systems/vehicle/Emplacement.ts` (~250 LOC).
- `src/systems/vehicle/IVehicle.ts` — extend `VehicleCategory` with
  `'emplacement'` IF this is non-fenced; if fenced, halt and surface
  to orchestrator.
- New sibling test.

**Method:**
1. Implement `IVehicle` with category `'emplacement'`, two seats
   (`'gunner'` + `'passenger'` for ammo handler — or single
   `'gunner'` for first cut).
2. Fixed position (no integration loop — static).
3. Barrel yaw + pitch state with capped slew rates.
4. Commit message: `feat(vehicle): Emplacement IVehicle for stationary weapons (emplacement-vehicle-surface)`.

**Acceptance:**
- Tests + build green.
- Behavior tests: seat enter/exit, barrel slew clamping, two-seat
  scenarios.
- No fence change (if surface requires fence change, halt).

### emplacement-player-adapter (R1)

`PlayerVehicleAdapter` for emplacements: mount, aim, fire, dismount.

**Files touched:**
- New: `src/systems/vehicle/EmplacementPlayerAdapter.ts` (~250 LOC).
- New sibling test.

**Method:**
1. Mirror `GroundVehiclePlayerAdapter` shape from VEKHIKL-1.
2. Mouse drives barrel yaw + pitch (capped).
3. Camera: first-person looking down the barrel sights.
4. `F` mounts/dismounts.
5. Commit message: `feat(vehicle): EmplacementPlayerAdapter (emplacement-player-adapter)`.

**Acceptance:**
- Tests + build green.
- Behavior tests cover mount, dismount, input forward.

### m2hb-weapon-integration (R2)

Wire the M2HB weapon onto the emplacement + register fire/ammo
flow.

**Files touched:**
- New: `src/systems/combat/weapons/M2HBEmplacement.ts` (~300 LOC).
- `src/systems/combat/CombatantBallistics.ts` — extend if needed
  for the heavier round (or factor out shared ballistic params).
- `src/systems/vehicle/VehicleManager.ts` — register emplacements.

**Method:**
1. M2HB stats: 575 RPM, 23 g M33 ball at 887 m/s, 0.50-cal
   penetration profile.
2. Barrel recoil offset (small).
3. Tracer every 5th round (existing tracer system).
4. Ammo: belt-fed (250-round box); reload on dismount.
5. Spawn one M2HB emplacement on Open Frontier (US base) +
   one on A Shau (NVA bunker overlook).
6. Commit message: `feat(combat): M2HB emplacement weapon integration (m2hb-weapon-integration)`.

**Acceptance:**
- Tests + build green.
- `combat-reviewer` APPROVE.
- M2HB visible at spawn on both modes.
- Firing produces expected RPM + tracer cadence in dev preview
  smoke test.

**Reviewer gate: `combat-reviewer` required pre-merge.**

### emplacement-npc-gunner (R2)

NPC squad-AI can occupy emplacements and use them per the existing
`CombatantAI` target-acquisition pipeline.

**Files touched:**
- `src/systems/combat/ai/CombatantAI.ts` — add `seek-emplacement`
  state when nearby + enemy in range.
- New sibling test.

**Method:**
1. AI scoring: an unoccupied friendly-faction emplacement within
   8 m of an NPC's current cover position adds an
   `mount-emplacement` action with high reward when enemies are in
   the emplacement's field of fire.
2. While mounted, NPC fires at existing target-acquisition output.
3. Dismount when ammo depleted or target out of cone for >5 s.
4. Commit message: `feat(combat): NPC gunners mount emplacements (emplacement-npc-gunner)`.

**Acceptance:**
- Tests + build green.
- `combat-reviewer` APPROVE.
- In dev preview, an NPC near an emplacement with enemies in cone
  mounts it within ~5 s.

**Reviewer gate: `combat-reviewer` required pre-merge.**

### vekhikl-2-playtest-evidence (R2, merge gate)

Owner playtest.

**Files touched:**
- New: `docs/playtests/cycle-vekhikl-2-stationary-weapons.md`.

**Method:**
1. Owner approaches an M2HB emplacement, mounts, aims, fires,
   reloads, dismounts.
2. Owner observes an NPC gunner mounting an emplacement in combat
   on each mode.
3. Owner records: feel, recoil response, sights alignment, NPC
   aggressiveness.

**Acceptance:**
- Owner sign-off recorded.

## Hard Stops

Standard:
- Fenced-interface change → halt (if `IVehicle.ts` change requires
  the fence-change protocol, surface to owner).
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- Extending `VehicleCategory` requires `[interface-change]` —
  halt and surface, do not proceed.
- Owner playtest rejects twice → halt.

## Reviewer Policy

- `combat-reviewer` pre-merge gate for tasks touching
  `src/systems/combat/**`.
- Orchestrator reviews other PRs.

## Acceptance Criteria (cycle close)

- All R1 + R2 task PRs merged.
- Owner playtest sign-off.
- M2HB emplacements live on Open Frontier + A Shau.
- NPC gunners observably use emplacements in combat.
- No fence change (or fence change explicitly approved by owner
  via `[interface-change]` protocol).
- No perf regression > 5% p99 on `combat120`.
- `VEKHIKL-2` directive in `docs/DIRECTIVES.md` moves to Closed.

## Out of Scope

- Mk-19, M60 nest, ZPU AA, MK60 mortar pit, other emplacement
  families — separate future cycles.
- Destructible emplacements — future cycle.
- Vehicle-mounted weapons (Cobra/Huey door gun beyond existing,
  jeep-mounted, tank coax) — separate future cycle.
- Touching `src/systems/terrain/**`, `src/systems/navigation/**`.

## Carry-over impact

VEKHIKL-2 lives in `docs/DIRECTIVES.md`. Closing doesn't touch the
carry-over active count.

Net cycle delta: 0 active-list count; +1 directive closed.
