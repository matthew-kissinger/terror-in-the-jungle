# E4: Agent-as-player action / observation API — decision memo

**Spike branch:** `spike/E4-agent-player-api`
**Status:** Design memo + adapter sketch. No production code lands from this spike.
**Prototype:** not run end-to-end; adapter code is sketched inline, not shipped.
**Recommendation:** prototype-more — land a minimal slice behind an `__agent` global in a follow-up task.

---

## 1. Question

What does a structured action / observation interface look like that lets an external agent drive a player-equivalent character in this game, separate from the human keyboard/mouse/touch path?

This is both:

1. A near-term fix for `scripts/perf-active-driver.js`, which is already an agent-as-player and whose bugs (teleport, thrash, see B2) come from riding the human keystroke path.
2. A forcing function for the aspirational "game playable by agents in real time" goal. Cheap if we get the primitives right now, expensive if we bolt it on after the player surface hardens around human input only.

---

## 2. Baseline: what we have today

### 2a. How the active driver talks to the game

`scripts/perf-active-driver.js` (1,755 LOC) currently drives the player in two layers:

1. **Keystroke emulation.** `dispatchKey('keydown'|'keyup', 'KeyW')` fired at `document`, picked up by `PlayerInput.ts` as if a human were holding WASD.
2. **Direct system pokes.** `systems.playerController.setPosition(...)`, `invokePlayerAction('actionFireStart')`, `getPlayerShotRay(...)`, etc. — private-ish method calls reached through `window.__engine.systemManager`.

Everything in between — movement state selection, firing decisions, respawn logic, frontline compression — is driver-local JS.

### 2b. Why this shape generates bugs

Three pathologies fall out of the keystroke+poke shape:

- **Intent loses resolution crossing the keystroke seam.** "Move to point X" becomes "press W+A with a 450 ms dwell timer and hope the camera yaw lines up." Every frame the driver re-derives keys from an imagined state machine (`advance`/`retreat`/`sprint`/`strafe`/`hold`). B2 just patched a dwell-timer bug where cross-state transitions could flip every heartbeat — a class of bug that cannot exist in a `moveTo(position)` API because there is no "state" to flip.
- **No bounded observation surface.** The driver reaches into `combatantSystem.getAllCombatants()`, filters by faction, filters by health, filters by `player_proxy`, computes centroids, and probes terrain via `terrainSystem.raycastTerrain` + `getHeightAt`. Each new scenario or mode grows a new reach. Internal shape changes break the driver.
- **Firing coupling is backwards.** The driver reads `firstPersonWeapon.rigManager.getCurrentCore().computeShotRay(camera, spreadDeg)` to decide *if* it can hit, then emulates a mouse click. The engine already has a firing system; the driver is re-implementing hit-validity checks.

### 2c. What B2 fixed (and why that's not enough)

B2 added:
- Dwell enforcement across cross-state transitions.
- A 900 ms advance↔retreat reversal cooldown.
- `state.movementTransitions` counter exposed by `stop()`.

This stabilizes the existing shape but doesn't address the root cause: a driver that expresses intent as simulated key holds is always going to fight the human-input debounce / pointer-lock / control-context plumbing. B2 buys us runway, not a new road.

---

## 3. Proposed action space

Small, typed, bounded. Every method returns a `CommandHandle` (or `{ accepted: boolean; reason?: string }`) so the caller can see whether the command took. Method count target: ≤ 15.

```ts
// src/systems/agent/AgentActionAPI.ts (proposed)

import type { Vector3Like } from 'three';

/** Opaque identifier for entities exposed via the observation API. */
export type AgentEntityId = string;

/** Handle returned by every action; lets the caller track or cancel. */
export interface CommandHandle {
  readonly id: number;
  readonly accepted: boolean;
  readonly reason?:
    | 'rejected_controls_disabled'
    | 'rejected_in_vehicle'
    | 'rejected_not_in_vehicle'
    | 'rejected_invalid_target'
    | 'rejected_stabilization_window'
    | 'rejected_cooldown'
    | 'queued'
    | 'active';
  cancel(): void;
}

export interface AgentActionAPI {
  // ── Movement ────────────────────────────────────────────────────────────

  /**
   * Navigate toward `target`. Engine handles pathing, slope probing, footstep
   * audio, sandbag avoidance. Replaces WASD emulation.
   *
   * If `stance` is 'sprint' the engine enables run when safe (not ADS, not
   * crouching); otherwise it picks walk/crouch based on recent damage events
   * unless overridden.
   */
  moveTo(target: Vector3Like, opts?: {
    stance?: 'walk' | 'sprint' | 'crouch';
    tolerance?: number;  // meters; command completes when within this radius
    cancelOnContact?: boolean; // stop if a visible enemy enters perception
  }): CommandHandle;

  /** Stop any active move. Equivalent to `moveTo(currentPosition)` but cheaper. */
  stopMoving(): CommandHandle;

  /**
   * Point the camera/weapon at a world-space bearing. Pitch optional; if
   * omitted, engine preserves current pitch. Rate-limited at the engine edge;
   * no yaw-jerk per tick.
   */
  faceBearing(yawRad: number, pitchRad?: number): CommandHandle;

  /** Look at a world-space point with current weapon. Lead/drop not included. */
  lookAt(target: Vector3Like): CommandHandle;

  // ── Combat ──────────────────────────────────────────────────────────────

  /**
   * Fire at an entity id or world-space point. Engine computes lead based on
   * target velocity if entity id given. If target id is dead or out of range
   * at the moment of trigger-pull, command resolves with `reason: 'rejected_invalid_target'`.
   *
   * `mode` controls trigger semantics:
   *  - 'single' = one shot (good for pistol/bolt).
   *  - 'burst'  = engine-controlled short burst (3-5 rounds).
   *  - 'hold'   = full-auto until `ceaseFire()` or cancel.
   */
  fireAt(target: AgentEntityId | Vector3Like, mode: 'single' | 'burst' | 'hold'): CommandHandle;

  ceaseFire(): void;

  /** Reload current weapon. Fire-during-reload rules mirror the human path. */
  reload(): CommandHandle;

  /** Switch weapon slot (primary / secondary / grenade / etc.). */
  selectWeapon(slot: WeaponSlot): CommandHandle;

  // ── Tactical ────────────────────────────────────────────────────────────

  /** Move to a cover entity (engine picks the approach point). */
  takeCover(coverId: AgentEntityId): CommandHandle;

  /** Throw a grenade toward a point with a given power (0..1). */
  throwGrenade(target: Vector3Like, power: number): CommandHandle;

  // ── Vehicle ─────────────────────────────────────────────────────────────

  enterVehicle(vehicleId: AgentEntityId): CommandHandle;
  exitVehicle(): CommandHandle;

  /** Vehicle stick / throttle / yaw in [-1, 1]. No-op when not in vehicle. */
  vehicleInput(axes: {
    pitch?: number;
    roll?: number;
    yaw?: number;
    throttle?: number;
  }): CommandHandle;

  // ── Squad / support (optional; useful for scripted scenarios) ──────────

  callSupport(type: 'rally' | 'airstrike' | 'mortar' | 'resupply', target?: Vector3Like): CommandHandle;
}
```

**Method count:** 13 (moveTo, stopMoving, faceBearing, lookAt, fireAt, ceaseFire, reload, selectWeapon, takeCover, throwGrenade, enterVehicle, exitVehicle, vehicleInput) + 1 (callSupport).

Under the 20-method decision-rule ceiling.

**Non-goals for v1:**

- Mortar aim adjustments (pitch/yaw fine control). Too specific for a first slice; falls back to `vehicleInput`-style adaptation later.
- Squad command inputs (`issueSquadCommand`). Separate API, different consumer.
- Settings / menu / scoreboard toggles. Never relevant to an agent.

---

## 4. Proposed observation space

Bounded, snapshot-per-tick, serializable. No Three.js objects leak across the seam — everything reduces to numbers and strings. Single call returns the full frame.

```ts
export interface AgentObservation {
  /** Monotonic tick counter; stable across reconnects. */
  tick: number;

  /** Engine wall-clock in ms. Use `tick` for logic, `timeMs` for UX. */
  timeMs: number;

  ownState: {
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    yawRad: number;
    pitchRad: number;
    health: number;        // 0..1 normalized
    healthAbs: number;     // raw hp for exact thresholds
    ammoInMag: number;
    ammoReserve: number;
    currentWeapon: WeaponSlot;
    stance: 'standing' | 'crouching' | 'prone';
    isReloading: boolean;
    isRunning: boolean;
    isFiring: boolean;
    isGrounded: boolean;
    inVehicle: {
      id: AgentEntityId;
      type: 'helicopter' | 'fixed_wing' | 'ground';
    } | null;
    faction: Faction;
  };

  /**
   * Entities the agent "sees". Engine applies cone + range + occlusion so the
   * agent never sees through terrain. No raw combatant list leakage.
   */
  visibleEntities: Array<{
    id: AgentEntityId;
    kind: 'combatant' | 'vehicle' | 'cover' | 'objective_pickup';
    faction?: Faction;
    position: { x: number; y: number; z: number };
    velocity?: { x: number; y: number; z: number };
    healthFrac?: number;      // 0..1 if applicable
    distance: number;         // meters from ownState.position
    bearingRad: number;       // relative to ownState.yawRad
    lastSeenTickDelta: 0;     // always 0 for currently-visible; memory lives in agent
  }>;

  /** Audible-only contacts (gunfire, footsteps) inside a wider radius. */
  audibleContacts: Array<{
    kind: 'gunfire' | 'explosion' | 'footstep' | 'vehicle';
    position: { x: number; y: number; z: number };
    loudness: number;     // 0..1
    ageMs: number;        // ms since event
  }>;

  /** Known objectives (zones, flags). Always full list regardless of LOS. */
  objectives: Array<{
    id: AgentEntityId;
    kind: 'zone' | 'homebase' | 'rally';
    position: { x: number; y: number; z: number };
    radius: number;
    owner: Faction | 'contested' | 'neutral';
    captureProgress: number;  // 0..1
  }>;

  /** Recent damage taken / dealt since last observation tick. Bounded. */
  damageEvents: Array<{
    kind: 'taken' | 'dealt' | 'kill' | 'death';
    sourceId?: AgentEntityId;
    targetId?: AgentEntityId;
    amount: number;
    position?: { x: number; y: number; z: number };
    tickDelta: number;   // ticks ago
  }>;

  /** Outcomes of commands issued since the last observation. */
  commandResolutions: Array<{
    handleId: number;
    status: 'completed' | 'failed' | 'canceled' | 'superseded';
    reason?: string;
  }>;
}

export interface AgentObservationAPI {
  /** Latest frame snapshot. Allocates a fresh plain object (safe to keep). */
  observe(): AgentObservation;

  /**
   * Subscribe to per-tick pushes instead of polling. Engine calls `fn` at
   * the end of each logic tick while the subscription is active.
   */
  onTick(fn: (obs: AgentObservation) => void): () => void;

  /** Configure perception radius / cone. */
  setPerception(opts: {
    visionRangeM?: number;       // default 220
    visionConeRad?: number;      // default Math.PI (full 180deg; typical human)
    hearingRangeM?: number;      // default 450
    maxVisibleEntities?: number; // default 48
  }): void;
}
```

**Size budget per tick:**

- `visibleEntities`: capped at 48 (was unbounded via `combatantSystem.getAllCombatants()` in the current driver).
- `audibleContacts`: capped at 24.
- `objectives`: bounded by zone count (≤ 10 in all current modes).
- `damageEvents`: capped at 16 (ring buffer behavior).
- `commandResolutions`: bounded by command-issue rate (≤ handful per tick).

A single observation frame in the worst case is a few kB of JSON — negligible for in-process, and small enough to survive an RPC seam later if we ever want one (non-goal for this spike).

---

## 5. Adapter sketch

The adapter sits on top of `PlayerController` and is the one place that translates structured actions into the existing player surface. New file, no fence change required (see §9).

```ts
// src/systems/agent/AgentPlayerAdapter.ts (sketch; not implemented)

import type { AgentActionAPI, AgentObservationAPI, CommandHandle, AgentObservation } from './AgentActionAPI';
import type { PlayerController } from '../player/PlayerController';
import type { CombatantSystem } from '../combat/CombatantSystem';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import type { ZoneManager } from '../world/ZoneManager';

export class AgentPlayerAdapter implements AgentActionAPI, AgentObservationAPI {
  private nextHandleId = 1;
  private activeMove: ActiveMove | null = null;
  private activeFire: ActiveFire | null = null;
  private commandResolutions: AgentObservation['commandResolutions'] = [];
  private damageEvents: AgentObservation['damageEvents'] = [];
  private perception = { visionRangeM: 220, visionConeRad: Math.PI, hearingRangeM: 450, maxVisibleEntities: 48 };
  private tick = 0;

  constructor(
    private readonly player: PlayerController,
    private readonly combatants: CombatantSystem,
    private readonly terrain: ITerrainRuntime,
    private readonly zones: ZoneManager,
    // plus hooks we already have: damageEventBus, audioLocator, etc.
  ) {}

  // Called from GameEngine's main update after PlayerController.update().
  update(deltaTime: number): void {
    this.tick++;
    this.stepActiveMove(deltaTime);
    this.stepActiveFire(deltaTime);
    // drain pending resolutions / damage events into their ring buffers
  }

  // ── AgentActionAPI ────────────────────────────────────────────────────

  moveTo(target, opts = {}): CommandHandle {
    const id = this.nextHandleId++;
    // Pre-flight: reject during spawn stabilization window, during vehicle
    // lock, etc. Matches PlayerController.setPosition guards.
    if (this.player.isSpawnStabilizing()) {
      return this.rejected(id, 'rejected_stabilization_window');
    }
    this.activeMove = {
      id,
      target: { ...target },
      stance: opts.stance ?? 'walk',
      tolerance: opts.tolerance ?? 2.0,
      cancelOnContact: opts.cancelOnContact ?? false,
    };
    return this.accepted(id);
  }

  faceBearing(yawRad, pitchRad): CommandHandle {
    const id = this.nextHandleId++;
    this.player.setViewAngles(yawRad, pitchRad ?? this.player.getPitch());
    return this.accepted(id, 'completed');
  }

  fireAt(target, mode): CommandHandle {
    const id = this.nextHandleId++;
    this.activeFire = { id, target, mode, startedAtTick: this.tick };
    // Firing is step-driven so 'hold' stays consistent with weapon cycle rate.
    return this.accepted(id, 'active');
  }

  ceaseFire(): void {
    if (this.activeFire) {
      this.player.actionFireStop(); // engine already exposes this as private; adapter sits inside boundary
      this.resolve(this.activeFire.id, 'completed');
      this.activeFire = null;
    }
  }

  enterVehicle(vehicleId): CommandHandle {
    const id = this.nextHandleId++;
    // Adapter knows about HelicopterModel / FixedWingModel indirectly via
    // PlayerController; no new reach into engine internals.
    const ok = this.player.requestEnterVehicle(vehicleId);
    return this.accepted(id, ok ? 'completed' : 'rejected_invalid_target');
  }

  // ... exitVehicle, vehicleInput, reload, selectWeapon, takeCover,
  // throwGrenade, callSupport, stopMoving, lookAt similar.

  // ── Per-tick steppers ─────────────────────────────────────────────────

  private stepActiveMove(dt: number): void {
    const m = this.activeMove;
    if (!m) return;
    const pos = this.player.getPosition();
    const dx = m.target.x - pos.x;
    const dz = m.target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= m.tolerance) {
      this.player.applyMovementIntent({ forward: 0, strafe: 0, sprint: false });
      this.resolve(m.id, 'completed');
      this.activeMove = null;
      return;
    }
    // Convert world-space intent to local-space movement relative to the
    // player's current yaw. PlayerController already owns the WASD-derived
    // intent vector; we set it directly instead of dispatching keys.
    const yaw = this.player.getYaw();
    const targetBearing = Math.atan2(dx, dz); // +z is forward in world
    const delta = normalizeAngle(targetBearing - yaw);
    const forward = Math.cos(delta);
    const strafe = Math.sin(delta);
    this.player.applyMovementIntent({
      forward,
      strafe,
      sprint: m.stance === 'sprint',
    });
    // Slope-safe fallback: if PlayerMovement reports zero-progress for N
    // ticks, nudge the target or fail the command (no silent thrash).
  }

  private stepActiveFire(dt: number): void {
    const f = this.activeFire;
    if (!f) return;
    const targetPos = typeof f.target === 'string'
      ? this.combatants.getPosition(f.target)
      : f.target;
    if (!targetPos) { this.resolve(f.id, 'failed', 'rejected_invalid_target'); this.activeFire = null; return; }
    // Aim first. Engine owns sway/recoil; adapter only sets desired aim.
    const ownPos = this.player.getPosition();
    const yaw = Math.atan2(targetPos.x - ownPos.x, targetPos.z - ownPos.z);
    const pitch = -Math.atan2(targetPos.y - ownPos.y, Math.hypot(targetPos.x - ownPos.x, targetPos.z - ownPos.z));
    this.player.setViewAngles(yaw, pitch);
    // Trigger semantics handled inside engine (burst timer, full-auto loop).
    if (f.mode === 'single' || f.mode === 'burst' || f.mode === 'hold') {
      this.player.actionFireStart(); // idempotent
    }
    if (f.mode === 'single') {
      this.player.actionFireStop();
      this.resolve(f.id, 'completed');
      this.activeFire = null;
    }
    // 'burst' and 'hold' resolved by ceaseFire or by ammo depletion.
  }

  // ── AgentObservationAPI ───────────────────────────────────────────────

  observe(): AgentObservation {
    const pos = this.player.getPosition();
    const yaw = this.player.getYaw();
    const visible = this.combatants.query({
      origin: pos,
      yaw,
      rangeM: this.perception.visionRangeM,
      coneRad: this.perception.visionConeRad,
      maxResults: this.perception.maxVisibleEntities,
      // Engine does occlusion via existing terrain raycast, but only once per
      // query call — not N times from the driver.
    });
    return {
      tick: this.tick,
      timeMs: performance.now(),
      ownState: this.snapshotOwnState(),
      visibleEntities: visible.map(toEntitySnapshot),
      audibleContacts: this.drainAudibleContacts(),
      objectives: this.zones.getAllZones().map(toObjectiveSnapshot),
      damageEvents: this.damageEvents.slice(),
      commandResolutions: this.commandResolutions.splice(0),
    };
  }

  // subscribe via onTick just queues a callback; update() calls them.
}

interface ActiveMove { id: number; target: {x:number;y:number;z:number}; stance: 'walk'|'sprint'|'crouch'; tolerance: number; cancelOnContact: boolean; }
interface ActiveFire { id: number; target: string | {x:number;y:number;z:number}; mode: 'single'|'burst'|'hold'; startedAtTick: number; }
```

**Key insight:** the adapter calls `player.applyMovementIntent({forward, strafe, sprint})` — a **new small method** on `PlayerController` that sets the same intent vector `PlayerMovement` already derives from keys each frame. This is the one production change required to unlock the design, and it is **not a fenced interface change** (see §9).

---

## 6. Active-driver rewrite sketch (using the new API)

The 1,755 LOC `perf-active-driver.js` collapses to roughly this:

```ts
// scripts/perf-active-driver-v2.ts (sketch, ~90 LOC of core logic)

import type { AgentActionAPI, AgentObservation } from '../src/systems/agent/AgentActionAPI';

export function runActiveDriver(agent: AgentActionAPI & AgentObservationAPI, mode: PerfMode) {
  const profile = profileFor(mode); // mode-specific ranges/biases; replaces modeProfiles{}

  return agent.onTick((obs) => {
    if (obs.ownState.healthAbs <= 0) {
      // PlayerRespawnManager handles respawn; driver just waits.
      return;
    }

    // Aim + fire: nearest OPFOR within max fire distance + LOS.
    const target = pickTarget(obs, profile);
    if (target) {
      agent.fireAt(target.id, 'hold');
    } else {
      agent.ceaseFire();
    }

    // Move: pick an objective point, let engine path there.
    const objective = pickObjective(obs, profile);
    if (objective) {
      agent.moveTo(objective, {
        stance: distanceTo(obs, objective) > profile.sprintDistance ? 'sprint' : 'walk',
        tolerance: 6,
        cancelOnContact: false,
      });
    }
  });
}

function pickTarget(obs: AgentObservation, profile: PerfProfile) {
  const opfor = obs.visibleEntities.filter(
    (e) => e.kind === 'combatant' && isOpforFaction(e.faction) && e.distance <= profile.maxFireDistance,
  );
  opfor.sort((a, b) => a.distance - b.distance);
  return opfor[0] ?? null;
}

function pickObjective(obs: AgentObservation, profile: PerfProfile) {
  if (profile.objectiveBias === 'zone') {
    const contested = obs.objectives.find((o) => o.owner === 'contested');
    if (contested) return contested.position;
  }
  if (profile.objectiveBias === 'enemy_mass' && obs.visibleEntities.length > 0) {
    return centroidOfOpfor(obs.visibleEntities) ?? null;
  }
  return obs.objectives.find((o) => o.owner !== obs.ownState.faction)?.position ?? null;
}
```

What drops out:
- `setMovementState`, `setMovementPattern`, `REVERSAL_PAIRS`, `REVERSAL_COOLDOWN_MS`, `state.movementLockUntil`, `state.lastReversalAt`, `state.movementTransitions` — dead. Dwell / anti-flap / reversal debounce become engine concerns inside `AgentPlayerAdapter.stepActiveMove`, which cannot flap because it's not sampling a discrete state every 250 ms; it's running a continuous pursuit toward a single target.
- `dispatchKey`, `pressKey`, `releaseKey`, `setMovementPattern`, `releaseAllKeys` — dead. No more keystroke seam.
- `syncCameraAim`, `syncCameraPosition`, `setHarnessPlayerPosition('harness.ground_lock')` — dead. Engine owns grounding; adapter never teleports.
- `findClearDirection`, `probeTerrainSlope` — dead. Engine's `applyMovementIntent` already passes through `PlayerMovement` which has slope handling.
- `analyzePlayerShot`, `canLandPlayerShot`, `getPlayerShotRay`, `hasTerrainOcclusion`, `hasHeightProfileOcclusion` — dead. `fireAt` runs LOS inside the engine once per frame, not once per driver probe.
- `getEnemySpawn`, `getEngagementCenter`, `getLeadChargePoint`, `getEnemyMassPoint`, `compressFrontline` — the *policy* survives (picking where to go), but it operates on `obs.visibleEntities` and `obs.objectives`, not on a raw combatant dump.

**Estimated rewrite size:** ~150 LOC total including mode profiles and `pickObjective` variants. Down from 1,755 LOC.

---

## 7. Comparison: keystroke-emulation vs. structured-API stability

Because we have not run the prototype, this is a reasoned projection, not a measurement. Flagging clearly.

| Failure mode (current driver) | Root cause | Fixed by structured API? |
|---|---|---|
| State-machine thrash (B2 bug) | Dwell timer only gated same-state calls | Yes — no state machine; `moveTo` is a single continuous command |
| Advance↔retreat flap | 250 ms heartbeat + stale target | Yes — target is a world point; no reversal-pair concept |
| Teleport / position-snap | `setHarnessPlayerPosition('harness.ground_lock')` racing `PlayerMovement` | Yes — engine owns grounding; adapter never writes position |
| Shooting through terrain | Driver's LOS probe disagrees with engine's weapon hit | Yes — `fireAt` defers to engine's one canonical LOS |
| Stuck on slope, idle | `findClearDirection` → fallback retreat → reversal cooldown hit | Partially — engine path must handle slope; if it can't, `moveTo` reports failure once, not thrashes |
| Silent no-op when pointer locked wrong | Key dispatch swallowed by `InputContextManager` | Yes — adapter bypasses input plumbing entirely |
| Driver sees dead enemies for one tick | Driver filters `combatantSystem` directly | Yes — observation query filters at the engine edge |

Metric to compare if prototype runs: `state.movementTransitions` per minute. Baseline (post-B2) for combat120 is something we'd read off the next capture; the new API would drive that metric toward zero (because there are no movement-state transitions — just one long `moveTo` with a reassigned target every ~1 s when obs changes).

**Proxy metric that doesn't require running the prototype:** LOC and reach. The driver drops from 1,755 LOC with 40+ engine-internals references to ~150 LOC with a ≤ 20-method API surface. This is a correctness win independent of frametime: fewer seams, fewer races.

---

## 8. Cost estimate

Landing the full design in production:

| Task | Estimate |
|---|---|
| Add `PlayerController.applyMovementIntent` and `getYaw` / `getPitch` public getters | 0.5 day |
| Add `CombatantSystem.query({origin, yaw, rangeM, coneRad, maxResults})` with occlusion | 1 day |
| Write `AgentPlayerAdapter` (actions + observations + per-tick stepper) | 2 days |
| Write `AgentObservation` snapshot types + tests | 0.5 day |
| Port `perf-active-driver.js` to new API as `perf-active-driver-v2.ts` | 1 day |
| A/B it against current driver on combat120 + openfrontier:short for a week, toggle off old driver | 1 day |
| Hook `AgentPlayerAdapter` up to NPCs as a dogfooding path (optional Phase F) | ~1 week |

**Net MVP landing:** ~1 week of focused work for the adapter + perf driver port.
**Full dogfooding (NPCs driven through same API):** +1 week, but not required for the immediate payoff.

Risk concentrations:
- `CombatantSystem.query` with LOS: needs a budget or we regress combat120 p99. Solution: reuse the cover-search budget pattern (cap queries per frame, cache results one tick).
- `applyMovementIntent` must round-trip through `PlayerMovement` identically to key-derived intent, or we introduce a second drift between human and agent paths. Mitigation: add a test that asserts WASD and `applyMovementIntent({forward:1})` produce the same velocity vector.
- Observation allocation per tick: if we allocate ~5 kB of objects per observation at 60 Hz we pressure GC. Solution: ring-buffer the arrays and return views, or publish on a slower cadence (agents don't need 60 Hz; 10-20 Hz is plenty).

---

## 9. Fence-change proposal

**None required for MVP.**

All the proposed additions sit outside `src/types/SystemInterfaces.ts`:

- `AgentActionAPI` / `AgentObservationAPI` are new types in `src/systems/agent/`. Not fenced.
- `PlayerController.applyMovementIntent` is a new method on a concrete class, not an interface.
- `CombatantSystem.query` is a new method on a concrete class.

The only plausible fence touch would be if we later decided to expose `AgentPlayerAdapter` as a general-purpose system and declare `IAgentPlayerAdapter` on the fenced interface list. That's a Phase F+ decision, not this spike's.

---

## 10. Value estimate

Three payoffs, in order of near-term value:

1. **Active driver stops being a source of perf noise.** Teleport / thrash / state-flap bugs (the ones B2 just patched the latest instance of) become structurally impossible. Perf captures become more trustworthy. This unblocks the P0 "re-capture perf baselines" work item in `docs/BACKLOG.md` by removing a whole class of intermittent failures.
2. **Automated scenario testing becomes cheap.** A test file can express "player spawns at A, moves to B, fires at first visible NVA within 100 m, checks health > 50 after 10 s" in 20 LOC instead of mocking key dispatch. Useful for integration tests + playtest regressions that don't rely on feel.
3. **Aspirational "game for agents" is one merge away from a prototype.** The adapter is the RPC/network seam's counterpart; any later networked agent mounts against the same interface, with protocol in between instead of a direct call.

---

## 11. Reversibility

High. If we land the adapter and it underperforms, we revert `perf-active-driver.js` to the current keystroke shape and delete `src/systems/agent/` — nothing else in the engine depends on the adapter.

The one commitment is `PlayerController.applyMovementIntent`. Even that is trivial to leave in place and unused; it's just a public setter on the existing intent vector.

---

## 12. Recommendation

**Prototype-more** — do not land the full design in the next run, but do land a minimal slice.

Concrete next step (Phase F candidate):

- Ship `PlayerController.applyMovementIntent(forward, strafe, sprint)` behind a test that proves parity with WASD.
- Ship a minimal `AgentPlayerAdapter` exposing only `moveTo`, `faceBearing`, `fireAt/ceaseFire`, and `observe()` (subset).
- Port **only the movement half** of `perf-active-driver.js` to the new API. Leave firing on the current path.
- Run combat120 + openfrontier:short against baseline. If movement-transitions drop materially (expected: from hundreds per capture to ~zero) and p99 is not worse, expand to full API in a follow-up.

If the half-port does not meaningfully reduce movement-thrash compared to post-B2 baseline, defer. The B2 fix is good enough on its own, and the cost of the full design becomes harder to justify.

---

## 13. Prototype status (this spike)

- Not run end-to-end. Adapter code in §5 and rewrite sketch in §6 are design-level, inline-only.
- No files added under `src/`. Memo-only spike.
- Would take ~2 days focused to produce a runnable prototype on a separate branch; deferred as out of scope for the design spike per the task brief ("Design ≠ code").

---

## 14. Appendix: method counts and size budgets

- Action-space methods: **14** (under the 20-method decision rule).
- Observation-space size budget: **~5 kB JSON / tick worst case**, bounded by explicit caps on `visibleEntities` (48), `audibleContacts` (24), `damageEvents` (16).
- Active driver LOC after rewrite: **~150** (down from 1,755).
- Engine-internals reaches after rewrite: **0** (all through adapter).
- Files added in MVP landing: 3 (`AgentActionAPI.ts`, `AgentPlayerAdapter.ts`, `perf-active-driver-v2.ts`) + 1 test file.
- Fence changes: 0.
