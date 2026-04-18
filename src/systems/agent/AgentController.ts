/**
 * AgentController — typed action + observation adapter.
 *
 * Translates structured `AgentAction`s into direct method calls on the
 * concrete player and combatant systems (via the small structural ports in
 * `AgentPlayerPort.ts`). Replaces the keystroke-emulation internals of
 * `scripts/perf-active-driver.js` with direct `applyMovementIntent` calls.
 *
 * Design memo: docs/rearch/E4-agent-player-api.md (spike/E4-agent-player-api).
 * No fence changes: all ports are structural; no `src/types/SystemInterfaces.ts`
 * edits.
 */

import type {
  AgentAction,
  AgentObservation,
  AgentPerception,
  CommandHandle,
  ObjectiveSnapshot,
  OwnStateSnapshot,
  Vec3,
  VisibleEntity,
} from './AgentTypes';
import {
  DEFAULT_PERCEPTION,
  acceptedHandle,
  rejectedHandle,
} from './AgentTypes';
import type {
  AgentControllerDeps,
  PlayerControlPort,
  PortCombatant,
  ReadVec3,
} from './AgentPlayerPort';
import { toVec3Copy } from './AgentPlayerPort';

interface FireIntent {
  target: string | Vec3;
  mode: 'single' | 'burst' | 'hold';
  startedTick: number;
}

interface MoveIntent {
  target: Vec3;
  stance: 'walk' | 'sprint' | 'crouch';
  tolerance: number;
}

/**
 * One AgentController drives one player. It holds no global state.
 * Intent-continuous: re-issuing the same `move-to` each tick is the expected
 * pattern; there is no internal state machine to flap.
 */
export class AgentController {
  private readonly player: PlayerControlPort;
  private readonly deps: AgentControllerDeps;
  private readonly now: () => number;

  private tickCounter = 0;
  private nextHandleId = 1;
  private perception: AgentPerception = { ...DEFAULT_PERCEPTION };

  private activeMove: MoveIntent | null = null;
  private activeFire: FireIntent | null = null;

  constructor(deps: AgentControllerDeps) {
    this.player = deps.player;
    this.deps = deps;
    this.now = deps.now ?? ((): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  setPerception(partial: Partial<AgentPerception>): void {
    this.perception = { ...this.perception, ...partial };
  }

  getPerception(): AgentPerception {
    return { ...this.perception };
  }

  /**
   * Issue a structured action. Rejected commands do not mutate player state.
   */
  apply(action: AgentAction): CommandHandle {
    const handleId = this.nextHandleId++;
    if (this.player.isPlayerDead()) {
      return rejectedHandle(handleId, 'rejected_player_dead');
    }

    switch (action.kind) {
      case 'move-to':
        return this.applyMoveTo(handleId, action);
      case 'stop-moving':
        this.activeMove = null;
        this.player.applyMovementIntent({ forward: 0, strafe: 0, sprint: false });
        return acceptedHandle(handleId);
      case 'face-bearing':
        this.player.setViewAngles(action.yawRad, action.pitchRad ?? this.player.getPitch());
        return acceptedHandle(handleId);
      case 'look-at':
        this.applyLookAt(action.target);
        return acceptedHandle(handleId);
      case 'fire-at':
        return this.applyFireAt(handleId, action.target, action.mode);
      case 'cease-fire':
        this.activeFire = null;
        this.player.fireStop();
        return acceptedHandle(handleId);
      case 'reload':
        this.player.reload();
        return acceptedHandle(handleId);
      case 'take-cover':
        // Best-effort; engine has no cover-graph on the player path today.
        return acceptedHandle(handleId);
      case 'enter-vehicle': {
        if (this.player.isInVehicle()) {
          return rejectedHandle(handleId, 'rejected_in_vehicle');
        }
        const entered = this.player.tryEnterNearbyVehicle();
        return entered === null
          ? rejectedHandle(handleId, 'rejected_invalid_target')
          : acceptedHandle(handleId);
      }
      case 'exit-vehicle': {
        if (!this.player.isInVehicle()) {
          return rejectedHandle(handleId, 'rejected_not_in_vehicle');
        }
        const ok = this.player.tryExitVehicle();
        return ok ? acceptedHandle(handleId) : rejectedHandle(handleId, 'rejected_invalid_target');
      }
      case 'call-support':
        return acceptedHandle(handleId);
      default: {
        const _exhaustive: never = action;
        return rejectedHandle(handleId, 'rejected_invalid_target');
      }
    }
  }

  /** Advance per-tick steppers; call once per game tick after apply(). */
  step(): void {
    this.tickCounter++;
    this.stepActiveMove();
    this.stepActiveFire();
  }

  observe(): AgentObservation {
    const pos = this.player.getPosition();
    const yaw = this.player.getYaw();
    return {
      tick: this.tickCounter,
      timeMs: this.now(),
      ownState: this.snapshotOwnState(),
      visibleEntities: this.queryVisibleEntities(pos, yaw),
      objectives: this.snapshotObjectives(),
    };
  }

  /** Release active intents so the player stops moving/firing. */
  release(): void {
    this.activeMove = null;
    this.activeFire = null;
    this.player.applyMovementIntent({ forward: 0, strafe: 0, sprint: false });
    this.player.fireStop();
  }

  // ── Apply helpers ─────────────────────────────────────────────────────

  private applyMoveTo(
    handleId: number,
    action: Extract<AgentAction, { kind: 'move-to' }>,
  ): CommandHandle {
    this.activeMove = {
      target: { x: action.target.x, y: action.target.y, z: action.target.z },
      stance: action.stance ?? 'walk',
      tolerance: action.tolerance ?? 2,
    };
    // First-step synchronously so single-tick tests see the intent.
    this.stepActiveMove();
    return acceptedHandle(handleId);
  }

  private applyLookAt(target: Vec3): void {
    const p = this.player.getPosition();
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const dy = target.y - p.y;
    const yaw = Math.atan2(dx, dz);
    const horiz = Math.hypot(dx, dz);
    const pitch = -Math.atan2(dy, horiz || 1);
    this.player.setViewAngles(yaw, pitch);
  }

  private applyFireAt(
    handleId: number,
    target: string | Vec3,
    mode: 'single' | 'burst' | 'hold',
  ): CommandHandle {
    const resolved = this.resolveFireTarget(target);
    if (!resolved) {
      return rejectedHandle(handleId, 'rejected_invalid_target');
    }
    this.activeFire = { target, mode, startedTick: this.tickCounter };
    this.stepActiveFire(resolved);
    if (mode === 'single') {
      this.player.fireStop();
      this.activeFire = null;
    }
    return acceptedHandle(handleId);
  }

  private resolveFireTarget(target: string | Vec3): Vec3 | null {
    if (typeof target === 'string') {
      const combatant = this.deps.combatants.getCombatantById(target);
      if (!combatant || combatant.health <= 0 || combatant.state === 'dead' || combatant.isDying) {
        return null;
      }
      return toVec3Copy(combatant.position);
    }
    return { x: target.x, y: target.y, z: target.z };
  }

  // ── Per-tick steppers ─────────────────────────────────────────────────

  private stepActiveMove(): void {
    const m = this.activeMove;
    if (!m) return;
    const pos = this.player.getPosition();
    const dx = m.target.x - pos.x;
    const dz = m.target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (!Number.isFinite(dist) || dist <= m.tolerance) {
      this.player.applyMovementIntent({ forward: 0, strafe: 0, sprint: false });
      this.activeMove = null;
      return;
    }
    // Convert world-space target bearing into camera-relative forward/strafe.
    // Matches PlayerMovement's convention: +forward is along camera, +strafe
    // is to camera-right.
    const yaw = this.player.getYaw();
    const targetBearing = Math.atan2(dx, dz);
    const delta = normalizeAngle(targetBearing - yaw);
    this.player.applyMovementIntent({
      forward: Math.cos(delta),
      strafe: Math.sin(delta),
      sprint: m.stance === 'sprint',
    });
  }

  private stepActiveFire(resolvedOverride?: Vec3): void {
    const f = this.activeFire;
    if (!f) return;
    const resolved = resolvedOverride ?? this.resolveFireTarget(f.target);
    if (!resolved) {
      this.player.fireStop();
      this.activeFire = null;
      return;
    }
    const p = this.player.getPosition();
    const dx = resolved.x - p.x;
    const dz = resolved.z - p.z;
    const dy = resolved.y - p.y;
    const yaw = Math.atan2(dx, dz);
    const horiz = Math.hypot(dx, dz);
    const pitch = -Math.atan2(dy, horiz || 1);
    this.player.setViewAngles(yaw, pitch);
    this.player.fireStart();
  }

  // ── Observation helpers ───────────────────────────────────────────────

  private snapshotOwnState(): OwnStateSnapshot {
    const pos = this.player.getPosition();
    const vel = this.player.getVelocity();
    const health = this.player.getHealth();
    const ammo = this.player.getAmmoState();
    const maxHp = health.maxHp > 0 ? health.maxHp : 100;
    return {
      position: toVec3Copy(pos),
      velocity: toVec3Copy(vel),
      yawRad: this.player.getYaw(),
      pitchRad: this.player.getPitch(),
      healthAbs: health.hp,
      healthFrac: health.hp > 0 ? Math.max(0, Math.min(1, health.hp / maxHp)) : 0,
      ammoInMag: ammo.magazine,
      ammoReserve: ammo.reserve,
      stance: this.player.isCrouching() ? 'crouching' : 'standing',
      isRunning: this.player.isRunning(),
      isGrounded: this.player.isGrounded(),
      isDead: this.player.isPlayerDead(),
      inVehicle: this.player.isInVehicle() ? { id: '', type: 'ground' } : null,
      faction: this.player.getFaction(),
    };
  }

  private queryVisibleEntities(pos: ReadVec3, yaw: number): VisibleEntity[] {
    const out: VisibleEntity[] = [];
    const range2 = this.perception.visionRangeM * this.perception.visionRangeM;
    const cone = this.perception.visionConeRad;
    const max = this.perception.maxVisibleEntities;
    const all = this.deps.combatants.getAllCombatants();
    const useCone = cone < Math.PI * 2 - 1e-6;
    const halfCone = cone * 0.5;
    for (let i = 0; i < all.length && out.length < max; i++) {
      const c = all[i];
      if (!c || c.id === 'player_proxy' || c.id === 'PLAYER') continue;
      if (c.health <= 0 || c.state === 'dead' || c.isDying) continue;
      const dx = c.position.x - pos.x;
      const dz = c.position.z - pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > range2) continue;
      const bearing = normalizeAngle(Math.atan2(dx, dz) - yaw);
      if (useCone && Math.abs(bearing) > halfCone) continue;
      out.push(combatantToVisible(c, Math.sqrt(d2), bearing));
    }
    return out;
  }

  private snapshotObjectives(): ObjectiveSnapshot[] {
    const zones = this.deps.zones?.getZones() ?? [];
    const out: ObjectiveSnapshot[] = [];
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      out.push({
        id: z.id,
        kind: z.isHomeBase ? 'homebase' : 'zone',
        position: toVec3Copy(z.position),
        radius: z.radius,
        owner: z.owner,
        captureProgress: z.captureProgress ?? 0,
      });
    }
    return out;
  }
}

function normalizeAngle(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

function combatantToVisible(c: PortCombatant, distance: number, bearing: number): VisibleEntity {
  return {
    id: c.id,
    kind: 'combatant',
    faction: c.faction,
    position: toVec3Copy(c.position),
    velocity: c.velocity ? toVec3Copy(c.velocity) : undefined,
    healthFrac:
      c.maxHealth && c.maxHealth > 0
        ? Math.max(0, Math.min(1, c.health / c.maxHealth))
        : undefined,
    distance,
    bearingRad: bearing,
  };
}
