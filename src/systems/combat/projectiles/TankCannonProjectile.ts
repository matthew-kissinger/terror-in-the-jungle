import * as THREE from 'three';
import { Faction } from '../types';
import type { CombatantSystem } from '../CombatantSystem';
import type { ExplosionEffectsPool } from '../../effects/ExplosionEffectsPool';
import { Logger } from '../../../utils/Logger';

/**
 * Tank main-cannon ballistic projectile system. Sibling to
 * `MortarBallistics` (the closest existing gravity-only template) but
 * shipped as a self-contained pooled launcher rather than a per-round
 * physics helper: callers do not own the projectile mesh, they just call
 * `launch()` with an origin + barrel direction and the system takes over.
 *
 * Method (per `docs/tasks/cycle-vekhikl-4-tank-turret-and-cannon.md`
 * §"tank-cannon-projectile (R1)"):
 *   1. Spawn at barrel tip; initial velocity = barrel direction *
 *      muzzleSpeed (configurable; ~400 m/s in v1 for visible travel).
 *   2. Gravity-only arc (mirrors `MortarBallistics.computeTrajectory`,
 *      explicit Euler, GRAVITY = -9.8 m/s^2).
 *   3. Arming distance 20 m. If impact distance < ARMING_DISTANCE_M
 *      the round is a dud — visual lifecycle ends but no damage and no
 *      explosion are emitted. Prevents accidental crew kills.
 *   4. Damage type resolver returns `{ maxDamage, radius }` for one of
 *      `'AP' | 'HEAT' | 'HE'`. MVP ships a single AP profile; the
 *      resolver fn exists so future shell types drop in without
 *      changing this file's shape.
 *   5. On armed impact: the projectile spawns an explosion via the
 *      injected `ExplosionEffectsPool` and routes damage through
 *      `CombatantSystem.applyExplosionDamage()` with the shooter's
 *      faction — the shared handler honours kill-tickets, kill-assist
 *      tracking, squad-member-removal, kill-feed entries, and the
 *      `npc_killed` event-bus emission, so tank kills get the same
 *      attribution as grenades + air-support. Friendly-fire is
 *      filtered inside the shared handler when `shooterFaction`
 *      is provided (additive-only signature change).
 *
 * The class is the NPC fire entry point: `launch()` is the same method
 * the player adapter and the AI gunner (cycle #9 R2 task
 * `tank-ai-gunner-route`) both call — pattern mirrors
 * `M2HBEmplacementSystem.tryFire`.
 *
 * Pooling: ~16 slots, meshes added to the scene at construction and
 * toggled visible. No per-shot allocation, no `Math.random`.
 */

export type TankAmmoType = 'AP' | 'HEAT' | 'HE';

export interface TankCannonProjectileLaunch {
  /** Barrel tip world position. */
  origin: THREE.Vector3;
  /** Barrel direction (normalized inside `launch()`). */
  direction: THREE.Vector3;
  /** Muzzle velocity in m/s. M48 90mm M41 historical ~600 m/s; ~400 m/s gives visible travel. */
  muzzleSpeed: number;
  ammoType: TankAmmoType;
  /** Shooter id used for damage attribution + friendly-fire exclusion via attacker lookup. */
  shooterId: string;
  /** Shooter faction; combatants whose faction is allied with this are skipped on radial damage. */
  shooterFaction: Faction;
}

export interface TankAmmoDamageProfile {
  maxDamage: number;
  radius: number;
}

export interface TankCannonProjectileSnapshot {
  id: string;
  ammoType: TankAmmoType;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  distanceTraveled: number;
  isArmed: boolean;
  isActive: boolean;
}

export const TANK_CANNON_CONSTANTS = Object.freeze({
  /** Explicit-Euler integration gravity (m/s^2). Matches `MortarBallistics.GRAVITY`. */
  GRAVITY: -9.8,
  /** Min travel before the fuse is considered armed. < this and impact is a no-damage dud. */
  ARMING_DISTANCE_M: 20,
  /** Self-destruct fuse to prevent orphan projectiles flying off-map. */
  MAX_FLIGHT_TIME_S: 12,
  /** Default pool size. Tuned for a single tank firing every ~5-8 s. */
  DEFAULT_POOL_SIZE: 16,
  /** Tracer mesh radius. Cosmetic. */
  TRACER_RADIUS: 0.12,
  /** Tracer mesh length. Cosmetic. */
  TRACER_LENGTH: 0.7,
} as const);

/**
 * MVP damage resolver. Returns the AP profile for every requested ammo
 * type; HEAT + HE drop in here in v2 without changing callers.
 */
export function resolveTankAmmoDamage(_ammoType: TankAmmoType): TankAmmoDamageProfile {
  // v1: AP-only. The damage curve here is a tunable starting point —
  // tested via behavior assertions on "armed impact deals damage",
  // not on the specific 200/9 numbers.
  return { maxDamage: 200, radius: 9 };
}

// Module-level scratch vectors so we never allocate during launch / step.
const _velStep = new THREE.Vector3();
const _impactPos = new THREE.Vector3();
const _dirNorm = new THREE.Vector3();
const _distVec = new THREE.Vector3();
const _orientUp = new THREE.Vector3(0, 1, 0);

interface ProjectileSlot {
  id: string;
  ammoType: TankAmmoType;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** Cumulative metres travelled since spawn. */
  distanceTraveled: number;
  /** Time-in-flight seconds (drives self-destruct fuse). */
  fuseElapsed: number;
  isActive: boolean;
  shooterId: string;
  shooterFaction: Faction;
  mesh: THREE.Mesh;
}

export class TankCannonProjectileSystem {
  private readonly scene: THREE.Scene;
  private readonly explosionPool: ExplosionEffectsPool;
  private readonly combatantSystem: CombatantSystem;
  private readonly pool: ProjectileSlot[] = [];
  private nextProjectileSerial = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    explosionPool: ExplosionEffectsPool,
    combatantSystem: CombatantSystem,
    poolSize: number = TANK_CANNON_CONSTANTS.DEFAULT_POOL_SIZE,
  ) {
    this.scene = scene;
    this.explosionPool = explosionPool;
    this.combatantSystem = combatantSystem;

    for (let i = 0; i < poolSize; i++) {
      this.pool.push(this.createSlot(i));
    }
  }

  // ────────── Public surface ──────────

  /**
   * NPC fire entry point. Acquires a free pool slot, copies origin +
   * velocity into it, and returns the projectile id. Returns `''` when
   * the pool is exhausted (cap on simultaneous in-flight rounds).
   */
  launch(launch: TankCannonProjectileLaunch): string {
    if (this.disposed) return '';
    const slot = this.acquireSlot();
    if (!slot) {
      Logger.warn('combat', 'TankCannonProjectileSystem pool exhausted; dropping shot');
      return '';
    }

    slot.id = `tank_shell_${this.nextProjectileSerial++}`;
    slot.ammoType = launch.ammoType;
    slot.shooterId = launch.shooterId;
    slot.shooterFaction = launch.shooterFaction;
    slot.position.copy(launch.origin);
    slot.distanceTraveled = 0;
    slot.fuseElapsed = 0;
    slot.isActive = true;

    _dirNorm.copy(launch.direction);
    if (_dirNorm.lengthSq() < 1e-8) {
      // Degenerate aim — treat as forward-Z to avoid NaN; still consumes a slot.
      _dirNorm.set(0, 0, -1);
    } else {
      _dirNorm.normalize();
    }
    slot.velocity.copy(_dirNorm).multiplyScalar(launch.muzzleSpeed);

    slot.mesh.position.copy(slot.position);
    this.orientMeshToVelocity(slot);
    slot.mesh.visible = true;

    return slot.id;
  }

  /**
   * Gravity step + impact detect. `terrainHeightAt(x, z)` returns the
   * world-space ground height; the integrator marks impact when
   * `position.y <= terrainHeightAt(x, z)`.
   */
  update(dt: number, terrainHeightAt: (x: number, z: number) => number): void {
    if (this.disposed) return;
    if (dt <= 0) return;

    for (const slot of this.pool) {
      if (!slot.isActive) continue;

      // Velocity update — gravity only.
      slot.velocity.y += TANK_CANNON_CONSTANTS.GRAVITY * dt;

      // Position update via scratch vector (no allocation).
      _velStep.copy(slot.velocity).multiplyScalar(dt);
      slot.position.add(_velStep);
      slot.distanceTraveled += _velStep.length();
      slot.fuseElapsed += dt;

      slot.mesh.position.copy(slot.position);
      this.orientMeshToVelocity(slot);

      // Self-destruct on orphan / off-map flight.
      if (slot.fuseElapsed >= TANK_CANNON_CONSTANTS.MAX_FLIGHT_TIME_S) {
        this.deactivate(slot);
        continue;
      }

      // Ground impact detection.
      const groundY = terrainHeightAt(slot.position.x, slot.position.z);
      if (slot.position.y <= groundY) {
        _impactPos.copy(slot.position);
        _impactPos.y = groundY;
        this.handleImpact(slot, _impactPos);
        this.deactivate(slot);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.pool) {
      this.scene.remove(slot.mesh);
      slot.mesh.geometry.dispose();
      const mat = slot.mesh.material;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else (mat as THREE.Material).dispose();
    }
    this.pool.length = 0;
  }

  // ────────── Inspection helpers (tests + diagnostics) ──────────

  /** Active projectile count. */
  getActiveCount(): number {
    let n = 0;
    for (const slot of this.pool) if (slot.isActive) n++;
    return n;
  }

  /** Snapshot for a projectile id (or null if not in flight). Allocates. */
  getSnapshot(id: string): TankCannonProjectileSnapshot | null {
    for (const slot of this.pool) {
      if (slot.isActive && slot.id === id) {
        return {
          id: slot.id,
          ammoType: slot.ammoType,
          position: slot.position.clone(),
          velocity: slot.velocity.clone(),
          distanceTraveled: slot.distanceTraveled,
          isArmed: slot.distanceTraveled >= TANK_CANNON_CONSTANTS.ARMING_DISTANCE_M,
          isActive: slot.isActive,
        };
      }
    }
    return null;
  }

  // ────────── Internals ──────────

  private createSlot(index: number): ProjectileSlot {
    const geom = new THREE.CylinderGeometry(
      TANK_CANNON_CONSTANTS.TRACER_RADIUS,
      TANK_CANNON_CONSTANTS.TRACER_RADIUS,
      TANK_CANNON_CONSTANTS.TRACER_LENGTH,
      6,
    );
    // Cylinder default axis is +Y; we want it lying along velocity (the local +Z
    // forward of the orientation helper). Pre-rotate the geometry once so the
    // per-frame `lookAt` is cheap and correct.
    geom.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd070,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = `TankCannonShell_${index}`;
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    return {
      id: '',
      ammoType: 'AP',
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      distanceTraveled: 0,
      fuseElapsed: 0,
      isActive: false,
      shooterId: '',
      shooterFaction: Faction.US,
      mesh,
    };
  }

  private acquireSlot(): ProjectileSlot | null {
    for (const slot of this.pool) {
      if (!slot.isActive) return slot;
    }
    return null;
  }

  private deactivate(slot: ProjectileSlot): void {
    slot.isActive = false;
    slot.mesh.visible = false;
  }

  private orientMeshToVelocity(slot: ProjectileSlot): void {
    // Point the cylinder along the velocity vector. Cheap lookAt against
    // (position + velocity); `_orientUp` is a stable +Y reference.
    if (slot.velocity.lengthSq() < 1e-6) return;
    _distVec.copy(slot.position).add(slot.velocity);
    slot.mesh.up.copy(_orientUp);
    slot.mesh.lookAt(_distVec);
  }

  private handleImpact(slot: ProjectileSlot, impactPos: THREE.Vector3): void {
    const armed = slot.distanceTraveled >= TANK_CANNON_CONSTANTS.ARMING_DISTANCE_M;
    if (!armed) {
      // Dud — no damage, no explosion. Visual lifecycle still ends.
      Logger.debug('combat', `Tank shell ${slot.id} impacted under arming distance; no damage`);
      return;
    }

    const profile = resolveTankAmmoDamage(slot.ammoType);

    // Visual: spawn explosion via the existing pool. We do not modify the pool.
    this.explosionPool.spawn(impactPos);

    // Damage: route through the shared `applyExplosionDamage` so kill-
    // attribution (tickets, kill counts, kill-assist tracking, squad
    // removal, kill-feed entries, `npc_killed` event) all fire the same
    // way they do for grenades / air-support. The `shooterFaction`
    // parameter (added 2026-05-17 in this cycle) filters allied units
    // out of the radial wave — same friendly-fire exclusion the inline
    // path used previously, without rebuilding death-state by hand.
    this.combatantSystem.applyExplosionDamage(
      impactPos,
      profile.radius,
      profile.maxDamage,
      slot.shooterId,
      'tank_cannon',
      slot.shooterFaction,
    );
  }
}
