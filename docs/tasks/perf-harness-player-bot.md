# perf-harness-player-bot: state-machine bot that plays the game through player controls

**Slug:** `perf-harness-player-bot`
**Cycle:** `cycle-2026-04-18-harness-flight-combat`
**Round:** 4 (replaces the abandoned `perf-openfrontier-navmesh-fix`)
**Depends on:** current master (all harness + heap + verticality fixes landed)
**Blocks (in this cycle):** Round 5 `perf-baseline-refresh` retry
**Playtest required:** YES — merge-gated on live playtest confirming the bot behaves like a focused player, not a bouncing killbot.
**Estimated risk:** medium — largest diff in the cycle. Scope is disciplined by mirroring `NPCFixedWingPilot` architecture exactly.
**Budget:** up to 1500 LOC net. Larger than the usual 400-LOC limit; explicit exception because this is a net-new subsystem with its own tests, not a bugfix. Precedent: B1 airframe consolidation was similarly large.

**Files touched (new):**
- `src/dev/harness/PlayerBot.ts` — state machine entry point (mirror `src/systems/vehicle/NPCFixedWingPilot.ts`)
- `src/dev/harness/playerBot/types.ts` — `PlayerBotState` union, `PlayerBotIntent` shape, `PlayerBotStateContext`, `PlayerBotStateStep`
- `src/dev/harness/playerBot/states.ts` — one pure `update(ctx) → StateStep` per state (mirror `src/systems/vehicle/npcPilot/states.ts`)
- `src/dev/harness/playerBot/PlayerBotController.ts` — thin intent → player controls translator
- `src/dev/harness/PlayerBot.test.ts` — behavior tests for state transitions and intent shape
- `src/dev/harness/playerBot/states.test.ts` — per-state pure-function tests
- `src/dev/harness/playerBot/PlayerBotController.test.ts` — controller translator tests

**Files touched (modified):**
- `scripts/perf-active-driver.cjs` — rewrite driver loop to instantiate `PlayerBot` and tick it; delete ad-hoc target/LOS/slope code. May drop ~1000 LOC; target final size ~500-800 LOC.
- `scripts/perf-capture.ts` — minor: expose engine handle (`window.__engine`) if not already; wire bot construction into the harness bootstrap. No change to capture flow.
- `scripts/perf-harness/perf-active-driver.test.js` — replace behavior tests with state-machine-driven expectations (bot can engage, bot cools off, bot re-acquires).
- Possibly `src/main.ts` or `src/bootstrap.ts` — only to expose new window handles IF needed. Check if existing `window.__engine` / `window.__renderer` / `window.__metrics` already surface what we need. Do NOT add new globals if the existing ones suffice.

## Why this task exists

The current harness (`scripts/perf-active-driver.cjs`, ~2500 LOC) is a single-loop imperative killbot that:

- Picks a `movementTarget` each tick (engagement centroid OR objective OR fallback anchor).
- Layers navmesh → gradient-probe → teleport for movement.
- Has its own target-cone logic, its own LOS gate (added in `perf-harness-redesign`), its own fire-trigger heuristic.
- Has NO state machine, NO objective prioritization, NO doctrine.

Live playtest observations (2026-04-19):
1. Bot shoots through terrain on slopes — its internal LOS check diverges from the combat engine's.
2. Bot bobbles on verticality — when `NavmeshSystem.queryPath` returns null (confirmed on open_frontier: `waypointsFollowed=0 / waypointReplanFailures=202` over 180s), fallback gradient-probe oscillates.
3. Bot "moves back and forth and not really having states or objectives or logic to actually help it simulate the game as if I were playing it" (direct quote).

**The diagnosis:** the harness reinvents decision logic that the NPC stack already solves correctly. NPCs don't shoot through terrain because they don't *acquire* targets through terrain — `AITargeting.findNearestEnemy` filters through `AILineOfSight.canSeeTarget` before a target is ever set. NPCs don't bobble because they fully trust navmesh above 15m. The harness should consume those primitives, not duplicate them.

**The template:** `NPCFixedWingPilot` (merged in this cycle) is architecturally clean — pure `stepState(ctx) → { intent, nextState }`, structured `FixedWingPilotIntent` value, controller layer consumes intent and drives airframe. Ground combatants are imperative/entangled, but the fixed-wing pattern is testable, replay-friendly, and bot-bindable. **That's the pattern this task ports to the ground.**

## Architecture

### Intent shape

```typescript
// src/dev/harness/playerBot/types.ts

export type PlayerBotState =
  | 'PATROL'        // no target; move toward objective
  | 'ALERT'         // heard/spotted something; orient + advance cautiously
  | 'ENGAGE'        // target visible + in-range; fire + strafe
  | 'ADVANCE'       // target known, not visible or out-of-range; close the gap on navmesh
  | 'SEEK_COVER'    // under fire, health < threshold OR suppression high
  | 'RETREAT'       // health critical, break contact
  | 'RESPAWN_WAIT'; // dead, wait for respawn

export interface PlayerBotIntent {
  // Movement — bot writes normalized axis values; controller translates to WASD.
  moveForward: number;   // -1 (back) .. 0 .. 1 (forward)
  moveStrafe: number;    // -1 (left) .. 0 .. 1 (right)
  sprint: boolean;
  crouch: boolean;
  jump: boolean;         // rare; only for small ledges

  // Aim — bot writes absolute yaw/pitch targets; controller slews camera.
  aimYaw: number;        // radians, world-space
  aimPitch: number;      // radians, ±1.4 max
  aimLerpRate: number;   // 0..1, how fast the controller snaps toward the target

  // Fire — bot writes intent; controller debounces and handles magazine/reload.
  firePrimary: boolean;
  reload: boolean;
}

export interface PlayerBotStateContext {
  now: number;                                   // ms timestamp
  state: PlayerBotState;
  timeInStateMs: number;
  eyePos: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  health: number;                                // 0..100
  suppressionScore: number;                      // 0..1, from combat engine if available, else 0
  lastDamageMs: number;
  magazine: { current: number; max: number };
  // Primitives consumed from the engine (NOT reinvented)
  findNearestEnemy: () => { id: string; position: { x: number; y: number; z: number } } | null;
  canSeeTarget: (targetPos: { x: number; y: number; z: number }) => boolean;
  queryPath: (from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) => Array<{ x: number; y: number; z: number }> | null;
  findNearestNavmeshPoint: (point: { x: number; y: number; z: number }) => { x: number; y: number; z: number } | null;
  getObjective: () => { position: { x: number; y: number; z: number }; priority: number } | null;
  // Slope probe (for the rare fallback case; not used when navmesh succeeds)
  sampleHeight: (x: number, z: number) => number;
}

export interface PlayerBotStateStep {
  intent: PlayerBotIntent;
  nextState: PlayerBotState | null;   // null = stay in current state
  resetTimeInState: boolean;
}
```

### State functions (pure)

Mirror `src/systems/vehicle/npcPilot/states.ts` layout. Each state is a free function `(ctx: PlayerBotStateContext) => PlayerBotStateStep`. No shared mutable state.

Minimum viable behaviors:

- **PATROL**: call `findNearestEnemy()` every tick. If null, `queryPath` toward `getObjective()` (or a fixed roam anchor if no objective). Emit moveForward=1, no fire. Transition to `ALERT` if enemy found.
- **ALERT**: face toward enemy, slow advance. If `canSeeTarget` returns true, transition to `ENGAGE`. If target moved out of perception (nearest enemy now different or null), back to `PATROL`.
- **ENGAGE**: full aim lock, fire when reticle within tolerance. Small lateral strafe to simulate player dodge (see note below). Transition to `ADVANCE` if target out of range OR LOS lost. Transition to `SEEK_COVER` if health < 60 OR suppression > 0.5.
- **ADVANCE**: `queryPath` to target last-known position. Follow pure-pursuit lookahead (keep the `perf-harness-verticality-and-sizing` PATH_TRUST_TTL_MS invariant — when path is fresh, trust it absolutely). Transition back to `ENGAGE` when `canSeeTarget` returns true.
- **SEEK_COVER**: path toward nearest cover anchor. If none found in 2s, fall through to `RETREAT`. Re-engage if contact lost during cover move.
- **RETREAT**: path AWAY from last-known enemy position, bearing ±135° from enemy bearing. Return to `PATROL` after 5s of no damage.
- **RESPAWN_WAIT**: no movement, no fire. Transition to `PATROL` when health > 0 again.

### Strafe note

ENGAGE should emit a small ±0.3 moveStrafe alternating every 600-900ms. This is the "simulate a player" lever — adds perf load (player movement + combat) without being a cheat. Not a combat mechanic, just realism.

### Controller translator

```typescript
// src/dev/harness/playerBot/PlayerBotController.ts

export class PlayerBotController {
  constructor(private playerController: any, private camera: any, private weapon: any) {}

  apply(intent: PlayerBotIntent, now: number) {
    // Movement: translate axis values to WASD boolean keys on the input adapter
    this.setKey('KeyW', intent.moveForward > 0.3);
    this.setKey('KeyS', intent.moveForward < -0.3);
    this.setKey('KeyD', intent.moveStrafe > 0.3);
    this.setKey('KeyA', intent.moveStrafe < -0.3);
    this.setKey('ShiftLeft', intent.sprint);
    this.setKey('ControlLeft', intent.crouch);
    this.setKey('Space', intent.jump);

    // Aim: slew camera yaw/pitch toward intent targets
    const dt = this.lastApply ? (now - this.lastApply) / 1000 : 0.016;
    const slew = Math.min(intent.aimLerpRate, 1);
    this.camera.setYaw(lerpAngle(this.camera.yaw, intent.aimYaw, slew));
    this.camera.setPitch(lerp(this.camera.pitch, intent.aimPitch, slew));
    this.lastApply = now;

    // Fire: trigger primary weapon if intent is live AND we're within the fire-eligible window
    if (intent.firePrimary) this.weapon.triggerDown();
    else this.weapon.triggerUp();
    if (intent.reload) this.weapon.reload();
  }
  // ... setKey via existing InputSystem surface; check src/systems/input/ for the right API
}
```

**Important:** the controller must use whatever key-injection surface `PlayerController`/`InputSystem` already exposes. Do NOT dispatch raw DOM KeyboardEvents unless nothing else works. Check `src/systems/input/` for an existing `setKey`/`overrideInput` API; if absent, add the minimum-viable method to `InputSystem` (not to `SystemInterfaces.ts` — the input adapter isn't on the fence).

### Engine handle surface

The driver already consumes `systems.playerController`, `systems.navmeshSystem`, `systems.terrainSystem`. Verify it also has access to `systems.combatAI` (the `CombatantAI` instance or equivalent) — that exposes `canSeeTarget` and `findNearestEnemy` as public methods (`CombatantAI.ts:393, 402`). If not already on the window handle, expose it through the same pattern as the others. Do not fence-change.

## Required reading (first)

Before touching a file:

1. `src/systems/vehicle/NPCFixedWingPilot.ts` (~250 LOC) + `src/systems/vehicle/npcPilot/states.ts` + `src/systems/vehicle/npcPilot/types.ts` — this is the architectural template. Read cover-to-cover. Your player bot should feel like the ground-combat sibling of this.
2. `src/systems/combat/ai/AILineOfSight.ts` (`canSeeTarget` at :108) — the LOS check that NPCs use.
3. `src/systems/combat/ai/AITargetAcquisition.ts` + `CombatantAI.ts:393-408` — how NPCs find targets.
4. `src/systems/navigation/NavmeshSystem.ts:687 queryPath`, `:708 findNearestPoint`, `:724 isPointOnNavmesh` — the nav primitives. Use `findNearestPoint` to snap the player's position before calling `queryPath` — this solves the open_frontier null-path issue caught in Round 3 as a side effect.
5. `scripts/perf-active-driver.cjs` — specifically the `planWaypoints` (:1118), the re-plan logic (:1843), and the fire gate (grep for `firePrimary` / `triggerDown`). You'll replace most of this.
6. `docs/TESTING.md` — behavior tests only. Do NOT pin intent values; assert state transitions and invariants.
7. `docs/INTERFACE_FENCE.md` — fence is at `src/types/SystemInterfaces.ts`. None of the NPC primitives you're consuming are on the fence. DO NOT put `PlayerBotIntent` or the bot class on the fence.

## Steps

1. Read the required-reading list. Map the 4 NPC primitives (canSeeTarget, findNearestEnemy, queryPath, findNearestPoint) to existing surfaces; confirm they're reachable from the harness via `window.__engine` (or whatever the driver uses today to get `systems`).
2. Author `src/dev/harness/playerBot/types.ts` (~80 LOC). Start with the interfaces in the Architecture section. Adjust as needed.
3. Author `src/dev/harness/playerBot/states.ts` (~400-500 LOC across 7 states). Each state is a pure function. Write state-level tests alongside (`states.test.ts`).
4. Author `src/dev/harness/PlayerBot.ts` (~150 LOC). Ties state functions together; holds `state`, `timeInState`, step loop. Mirror `NPCFixedWingPilot.ts` structure.
5. Author `src/dev/harness/playerBot/PlayerBotController.ts` (~100 LOC). Intent → player controls translator.
6. Rewrite `scripts/perf-active-driver.cjs` driver loop to instantiate bot + controller, tick bot each frame, apply intent. Delete the old target/LOS/fire/slope code. Expected net delta: -600 to -1000 LOC in the driver (new code lives in `src/dev/harness/`).
7. Port the mode-specific tuning (e.g. `aggressiveMode` for open_frontier + a_shau_valley) into per-state or per-bot config. Don't lose it.
8. Update `scripts/perf-harness/perf-active-driver.test.js` to assert state-machine behaviors: "bot reaches ENGAGE within 30s when enemy is reachable on navmesh", "bot does not fire during PATROL", "bot re-plans path when target moves > 20m", etc.
9. Smoke captures on all 5 modes (60s each). Record state-distribution histogram (time in ENGAGE vs ADVANCE vs PATROL etc.) in addition to shots/hits/transitions.
10. `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf` green.
11. **Live playtest headed.** Watch combat120 AND openfrontier:short. Acceptance gates:
    - Bot engages targets through line-of-sight, does NOT fire through hills or trees.
    - Bot climbs slopes via navmesh paths, does NOT oscillate back-and-forth on steep terrain.
    - Bot spends observable time in multiple states (not 100% PATROL).
    - Bot reaches at least one kill on combat120 within 90s.

## Exit criteria

- `combat120` 90s capture: bot spends > 20% of time in ENGAGE, records ≥ 1 kill, peak p99 ≤ 50ms, shots > 50, hits > 5.
- `openfrontier:short` 180s capture: `waypointsFollowed > 50` (was 0 in Round 3), `waypointReplanFailures < 50`, `validation.overall != 'fail'`.
- `ashau:short`, `zonecontrol`, `teamdeathmatch` smoke captures produce non-degenerate state distributions (at minimum: PATROL + ADVANCE + ENGAGE each > 5%).
- Live playtest confirms: no shoot-through-terrain, no slope bobble, observable state variety.
- Unit tests: each state has at least 2 behavior tests pinning entry/exit conditions. Controller has a test asserting intent → key-press mapping.
- `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf` green.

## Non-goals

- No combat AI tuning. You're building a *harness bot*, not NPC AI. If you find an NPC bug along the way, file it separately.
- No new objectives system. Use the existing objective/capture surfaces; if none is reachable from the harness, fall back to roam anchors.
- No replay hook this task. The bot is pure-function-friendly so replay falls out for free, but explicit replay wiring is future work.
- No ML / RL anywhere. State machines are authored by hand.
- No declarative scenario DSL (that was the reverted `perf-harness-architecture` shape; don't resurrect it).
- No changes to `perf-baselines.json`. Round 5 handles that.
- No changes to `SystemInterfaces.ts`.

## Hard stops

- Any fence change → STOP.
- Consuming `canSeeTarget` or `findNearestEnemy` requires changes to their signatures → STOP; scope was wrong.
- Rewriting the driver causes `combat120` to regress on shots/hits vs PR #94 numbers (avg ~15ms, shots ~350, hits ~240) → STOP; the bot is less effective than the old killbot, something's wrong.
- Bot reaches ENGAGE state on combat120 but never fires → STOP; aim slew or fire gate is broken.
- Bot cannot path on openfrontier even after `findNearestPoint` snap → the navmesh has a real bake gap; STOP and propose a diagnostic task.
- Diff exceeds 1500 LOC net → STOP; reassess scope. Consider splitting into "bot + types + tests" landing first, controller/driver-rewrite as a follow-up.
- Playtest reveals the bot gets stuck on a specific map feature (water, fence, vehicle) → STOP; this is the "I need bot-level collision handling" signal, which is out of scope.

## Rationale — why this replaces the navmesh-fix task

Round 4's original brief (`perf-openfrontier-navmesh-fix`) was narrow: fix why `queryPath` returns null on open_frontier. It would have landed ≤ 150 LOC and unblocked Round 5. But the underlying problem the user surfaced is that **even when the driver works, it doesn't simulate gameplay.** A state-machine bot consuming NPC primitives fixes the symptom (shoot-through-terrain, slope bobble) AND the architectural gap. The null-path issue gets solved for free when the bot uses `findNearestPoint` to snap to the mesh before querying — the same pattern NPCs use.

The killbot driver served its purpose (forced combat through a broken harness for a few days while real bugs got caught). It was always a placeholder. Ship the real bot.

## References

- `NPCFixedWingPilot` pattern — the architectural template.
- `docs/tasks/perf-harness-killbot.md` — the NSRL rule-only predecessor, superseded here.
- `docs/tasks/perf-harness-verticality-and-sizing.md` — PATH_TRUST_TTL_MS invariant from §5; preserve it.
- `docs/tasks/perf-openfrontier-navmesh-fix.md` — the narrow Round 4 brief this supersedes; retained in git history for context on why the architectural pivot happened.
- Round 3 executor report (conversational, not checked in) — the `waypointsFollowed=0` counter that triggered the pivot.
