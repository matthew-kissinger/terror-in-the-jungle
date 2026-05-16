# Cycle: VODA-2 Buoyancy / Swimming / Wading

Last verified: 2026-05-16

## Status

Queued at position #7 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
Closes `VODA-2`. **Blocked on VODA-1** (visual surface must be
accepted first). Blocks `cycle-voda-3-watercraft` (watercraft uses
buoyancy + swim/wade contracts).

## Skip-confirm: no

Owner playtest required.

## Concurrency cap: 4

R1 ships physics + player-state consumers; R2 ships wade visuals +
playtest.

## Objective

Wire `WaterSystem.sampleWaterInteraction` into physics and player
state:

1. **Rivers from hydrology channels carry visible flow** (handed off
   from VODA-1; this cycle adds the gameplay effect — current pushes
   floating bodies + swimmer downstream).
2. **Buoyancy physics for floating bodies** (NPCs, dropped weapons,
   future watercraft hulls).
3. **Player swimming** with animation, stamina, breath, surfacing.
4. **Wading and foot-splash visuals at the bank.**

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. [docs/DIRECTIVES.md](../DIRECTIVES.md) VODA-2 row.
2. `src/systems/environment/WaterSystem.ts:350`
   `sampleWaterInteraction(position, opts)` — the contract surface.
   Returns `{source, surfaceY, depth, submerged, immersion01,
   buoyancyScalar}`.
3. `src/systems/player/PlayerMovement.ts` — current movement
   integration; swimming/wading hooks land here.
4. `src/systems/player/PlayerHealthSystem.ts` — breath/stamina
   model lives near here.
5. `src/systems/combat/CombatantMovement.ts` (or equivalent) — NPC
   movement for wade behavior.
6. Cycle #5 close evidence (paired pre/post water screenshots) —
   the visual baseline this cycle's gameplay rides on.

## Critical Process Notes

1. **Block on VODA-1 close.** Orchestrator must verify cycle #5 is
   `done` before dispatching this cycle. If campaign manifest shows
   cycle #5 not done, halt.
2. **`sampleWaterInteraction` contract is stable.** Do not modify
   the public API; consume it.
3. **Owner playtest required.** Wade speed, swim feel, breath
   timer, surfacing all need touch.
4. **`combat-reviewer` is pre-merge gate** for tasks touching
   `src/systems/combat/**`.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `buoyancy-physics`, `player-swim-and-breath`, `npc-wade-behavior` | 3 | Physics + player swim + NPC wade. Independent. |
| 2 | `wade-foot-splash-visuals`, `river-flow-gameplay-current`, `voda-2-playtest-evidence` | 3 | Visuals + flow + playtest. |

## Task Scope

### buoyancy-physics (R1)

Add buoyancy for floating bodies (NPCs, dropped weapons,
future-watercraft-hulls) via `WaterSystem.sampleWaterInteraction`.

**Files touched:**
- New: `src/systems/environment/water/BuoyancyForce.ts` (~250 LOC).
- New sibling test.

**Method:**
1. `applyBuoyancyForce(body, dt, waterSystem)` reads
   `sampleWaterInteraction(body.position)`. If `submerged`, applies
   upward force proportional to `buoyancyScalar` × body volume × g.
2. Damping in water (denser medium).
3. Behavior tests: body floats at neutral, sinks under heavy mass,
   surfaces from depth, oscillates with critical damping.
4. Commit message: `feat(water): buoyancy force using sampleWaterInteraction (buoyancy-physics)`.

**Acceptance:**
- Tests + build green.
- Behavior tests cover neutral float, sink, surface, dampened
  oscillation.

### player-swim-and-breath (R1)

Player swimming with animation, stamina, breath, surfacing.

**Files touched:**
- `src/systems/player/PlayerMovement.ts` — branch on
  `sampleWaterInteraction(playerPos).submerged` → swim mode.
- `src/systems/player/PlayerHealthSystem.ts` — breath timer.
- Possibly new: `src/systems/player/PlayerSwimState.ts`
  (~200 LOC).
- New sibling test.

**Method:**
1. Swim mode: 3D movement (WASD + Space up + Ctrl down), no
   gravity, drag proportional to depth.
2. Stamina drains while swimming; regens while walking.
3. Breath timer: starts when head submerged (sample at head
   position); player gasps + takes damage if held > 45 s; gauge in
   HUD.
4. Surfacing: when `submerged === false` after being submerged,
   transition back to walk mode.
5. Anim: existing player rig — swim cycle if asset present, else
   wade cycle adapted.
6. Commit message: `feat(player): swimming + breath using sampleWaterInteraction (player-swim-and-breath)`.

**Acceptance:**
- Tests + build green.
- Behavior tests: swim entry, swim exit, breath drain, gasp at 45 s,
  surfacing restores mode.
- HUD shows breath gauge when submerged (verify via dev preview).

### npc-wade-behavior (R1)

NPC pathing avoids deep water unless required; wade visually slowed
in shallow.

**Files touched:**
- `src/systems/combat/CombatantMovement.ts` (or equivalent).
- Possibly `src/systems/navigation/` for cost weighting.
- New sibling test.

**Method:**
1. Navmesh cost up-weight on water tiles (already partially wired
   per existing nav; verify and extend).
2. NPC speed scales with `1 - immersion01 * 0.6` in shallow water.
3. NPC speed = swim speed in deep water (if NPCs swim — flag as
   stretch; if not, NPCs route around).
4. Behavior tests: NPC selects dry path when available; NPC slows
   in shallow ford; NPC routes around deep river when crossing
   would require swim.
5. Commit message: `feat(combat): NPC wade behavior using sampleWaterInteraction (npc-wade-behavior)`.

**Acceptance:**
- Tests + build green.
- `combat-reviewer` APPROVE.

**Reviewer gate: `combat-reviewer` required pre-merge.**

### wade-foot-splash-visuals (R2)

Foot-splash particle puffs at the bank during wade.

**Files touched:**
- New: `src/systems/effects/WadeSplashEffect.ts` (~200 LOC).
- `src/systems/player/PlayerMovement.ts` — trigger on foot impact
  while shallow.
- `src/systems/combat/CombatantMovement.ts` — same trigger for
  NPCs.

**Method:**
1. On foot impact (existing footstep audio trigger), if
   `sampleWaterInteraction(footPos).immersion01 ∈ [0.1, 0.5]`,
   spawn a small particle burst (existing particle system).
2. Use the existing impact-effects pool to avoid allocation.
3. Commit message: `feat(effects): wade foot-splash visuals (wade-foot-splash-visuals)`.

**Acceptance:**
- Tests + build green.
- In dev preview, walking at a riverbank produces splashes.
- No perf regression (uses existing pool).

### river-flow-gameplay-current (R2)

Flowing rivers push floating bodies + swimmers downstream.

**Files touched:**
- `src/systems/environment/water/BuoyancyForce.ts` — extend with
  flow-direction force from hydrology channel data.
- Possibly `src/systems/environment/WaterSystem.ts` —
  `getFlowDirectionAt(position)` helper (or extend
  `sampleWaterInteraction` to return flow).

**Method:**
1. For a position inside a hydrology channel segment, compute flow
   direction from channel start → end (already known from VODA-1
   visual work).
2. Add horizontal flow force proportional to flow magnitude × dt
   × body's drag coefficient.
3. Strong rivers visibly push the player when swimming
   perpendicular.
4. Commit message: `feat(water): river flow pushes floating bodies (river-flow-gameplay-current)`.

**Acceptance:**
- Tests + build green.
- Owner playtest: visible swim-perpendicular drift in A Shau river.

### voda-2-playtest-evidence (R2, merge gate)

Owner playtest.

**Files touched:**
- New: `docs/playtests/cycle-voda-2-buoyancy-swimming-wading.md`.

**Method:**
1. Wade across an A Shau shallow ford. Confirm slowed speed +
   splashes.
2. Swim across a deep A Shau river. Confirm stamina drain + drift
   + breath gauge.
3. Hold breath underwater past 45 s. Confirm gasp + damage.
4. Surface from depth. Confirm transition back to walk.
5. Watch an NPC patrol on A Shau. Confirm route avoids deep water.

**Acceptance:**
- Owner sign-off recorded.

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- Cycle #5 VODA-1 not closed → halt at orchestrator dispatch.
- Owner playtest rejects twice → halt.

## Reviewer Policy

- `combat-reviewer` pre-merge gate for `npc-wade-behavior`.
- Orchestrator reviews other PRs.

## Acceptance Criteria (cycle close)

- All R1 + R2 task PRs merged.
- Owner playtest sign-off.
- Swim + wade + breath all feel correct per owner.
- NPCs visibly route around deep water or wade shallow fords.
- No fence change.
- No perf regression > 5% p99 on `combat120`.
- `VODA-2` directive in `docs/DIRECTIVES.md` moves to Closed.

## Out of Scope

- Watercraft (VODA-3, cycle #10).
- Underwater combat / diving suits.
- Currents from ocean tides (no tide system yet).
- Touching `src/systems/terrain/**` (the navmesh cost-weighting
  may touch navigation — gated by reviewer).
- Fenced-interface touches.

## Carry-over impact

VODA-2 lives in `docs/DIRECTIVES.md`.

Net cycle delta: 0 active-list; +1 directive closed.
