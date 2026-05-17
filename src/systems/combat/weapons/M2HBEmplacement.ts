import * as THREE from 'three';
import type { GameSystem } from '../../../types';
import type { IAudioManager } from '../../../types/SystemInterfaces';
import { Emplacement } from '../../vehicle/Emplacement';
import type { EmplacementPlayerAdapter } from '../../vehicle/EmplacementPlayerAdapter';
import type { CombatantSystem } from '../CombatantSystem';
import { TracerPool } from '../../effects/TracerPool';
import { Logger } from '../../../utils/Logger';
import { M2HBWeapon, M2HB_STATS } from './M2HBWeapon';

/**
 * M2HB emplacement system. Owns per-emplacement weapon bindings and
 * routes fire requests (player adapter or NPC) into combatant raycasts
 * + tracer/impact/audio effects. Stable R1 surfaces (`Emplacement`,
 * `EmplacementPlayerAdapter`) are NOT modified by this file.
 *
 * Companion files:
 *   - `M2HBWeapon.ts`            — per-emplacement ammo + cadence state.
 *   - `M2HBEmplacementSpawn.ts`  — procedural tripod mesh + scenario
 *                                  spawn helpers (Open Frontier US base,
 *                                  A Shau NVA bunker overlook).
 *
 * Fire-path summary:
 *   Player adapter: `update(dt)` polls `consumeFireRequest()` on the
 *     bound `EmplacementPlayerAdapter`, derives muzzle origin + barrel
 *     forward from the Emplacement's yaw/pitch, calls `tryFire()` on
 *     the weapon, and (if cycled) runs `executeShot`.
 *   NPC gunner: the sibling `emplacement-npc-gunner` task calls
 *     `tryFire(vehicleId, origin, aimDir)` directly with its own
 *     world-space origin + direction — it does NOT route through the
 *     player adapter. The fire entry method name surface is
 *     `M2HBEmplacementSystem.tryFire`.
 */

interface M2HBBinding {
  vehicleId: string;
  emplacement: Emplacement;
  weapon: M2HBWeapon;
  /** Player adapter polled for fire input (null = NPC-only emplacement). */
  playerAdapter: EmplacementPlayerAdapter | null;
  /** Tracks whether the gunner seat had an occupant last frame, for reload-on-dismount. */
  hadOccupantLastTick: boolean;
  /** Pitch rig node — recoil offset writes back to its local z each frame. */
  pitchNode: THREE.Object3D;
}

// Scratch vectors, allocated once.
const _scratchMuzzle = new THREE.Vector3();
const _scratchForward = new THREE.Vector3();
const _scratchTracerEnd = new THREE.Vector3();
const _scratchOrigin = new THREE.Vector3();

export class M2HBEmplacementSystem implements GameSystem {
  private readonly scene: THREE.Scene;
  private readonly bindings = new Map<string, M2HBBinding>();
  private readonly tracerPool: TracerPool;
  private combatantSystem?: CombatantSystem;
  private audioManager?: IAudioManager;

  constructor(scene: THREE.Scene, maxTracers = 24) {
    this.scene = scene;
    this.tracerPool = new TracerPool(scene, maxTracers);
  }

  async init(): Promise<void> {
    Logger.debug('combat', 'Initializing M2HBEmplacementSystem');
  }

  setCombatantSystem(cs: CombatantSystem): void { this.combatantSystem = cs; }
  setAudioManager(am: IAudioManager): void { this.audioManager = am; }

  /**
   * Register a weapon binding. The spawn factory in
   * `M2HBEmplacementSpawn.ts` calls this after wiring the IVehicle to
   * the VehicleManager. Player adapter may be attached later via
   * `attachPlayerAdapter`.
   */
  registerBinding(args: {
    vehicleId: string;
    emplacement: Emplacement;
    weapon: M2HBWeapon;
    pitchNode: THREE.Object3D;
    playerAdapter?: EmplacementPlayerAdapter;
  }): void {
    if (this.bindings.has(args.vehicleId)) {
      Logger.warn('combat', `M2HB binding already registered for ${args.vehicleId}; overwriting`);
    }
    this.bindings.set(args.vehicleId, {
      vehicleId: args.vehicleId,
      emplacement: args.emplacement,
      weapon: args.weapon,
      playerAdapter: args.playerAdapter ?? null,
      hadOccupantLastTick: false,
      pitchNode: args.pitchNode,
    });
  }

  attachPlayerAdapter(vehicleId: string, adapter: EmplacementPlayerAdapter): void {
    const binding = this.bindings.get(vehicleId);
    if (!binding) {
      Logger.warn('combat', `No M2HB binding for ${vehicleId}; cannot attach player adapter`);
      return;
    }
    binding.playerAdapter = adapter;
  }

  unregisterBinding(vehicleId: string): void { this.bindings.delete(vehicleId); }

  getBindingCount(): number { return this.bindings.size; }

  getWeapon(vehicleId: string): M2HBWeapon | null {
    return this.bindings.get(vehicleId)?.weapon ?? null;
  }

  /**
   * NPC-fire entry point. Callers (the `emplacement-npc-gunner`
   * sibling task) invoke this with an explicit world-space origin +
   * aim direction. If the weapon cycled a round the system spawns
   * tracer / impact / audio effects against the registered
   * combatantSystem and returns true.
   */
  tryFire(vehicleId: string, origin: THREE.Vector3, aimDir: THREE.Vector3): boolean {
    const binding = this.bindings.get(vehicleId);
    if (!binding) return false;
    if (!binding.weapon.tryFire()) return false;
    this.executeShot(binding, origin, aimDir);
    return true;
  }

  // ────────── Per-frame ──────────

  update(deltaTime: number): void {
    for (const binding of this.bindings.values()) {
      binding.weapon.update(deltaTime);
      this.updateRecoilRig(binding);
      this.updateReloadOnDismount(binding);

      const adapter = binding.playerAdapter;
      if (!adapter) continue;
      if (adapter.getActiveEmplacementId() !== binding.vehicleId) continue;

      const wantsFire = adapter.consumeFireRequest();
      if (!wantsFire) continue;

      this.computeMuzzleOrigin(binding, _scratchOrigin);
      this.computeBarrelForward(binding.emplacement, _scratchForward);
      if (binding.weapon.tryFire()) {
        this.executeShot(binding, _scratchOrigin, _scratchForward);
      }
    }
    this.tracerPool.update();
  }

  dispose(): void {
    this.bindings.clear();
    this.tracerPool.dispose();
  }

  // ────────── Internals ──────────

  private updateRecoilRig(binding: M2HBBinding): void {
    // Recoil pulls the pitch-rig along its local -Z. The Emplacement's
    // slew code writes pitch into rotation.x; position.z is ours.
    binding.pitchNode.position.z = -binding.weapon.getRecoilOffsetM();
  }

  private updateReloadOnDismount(binding: M2HBBinding): void {
    const gunnerSeat = binding.emplacement.getSeats().find(s => s.role === 'gunner');
    const hasOccupant = gunnerSeat?.occupantId != null;
    if (binding.hadOccupantLastTick && !hasOccupant) {
      // Gunner just left — refill the belt for the next mount.
      binding.weapon.reload();
    }
    binding.hadOccupantLastTick = hasOccupant;
  }

  private executeShot(binding: M2HBBinding, origin: THREE.Vector3, aimDir: THREE.Vector3): void {
    const ray = new THREE.Ray(origin.clone(), aimDir.clone().normalize());
    let hitPoint: THREE.Vector3 | null = null;
    let hitNormal: THREE.Vector3 | null = null;

    if (this.combatantSystem) {
      const result = this.combatantSystem.handlePlayerShot(ray, () => M2HB_STATS.damagePerRound, 'rifle');
      if (result.hit) {
        hitPoint = result.point.clone();
        hitNormal = ray.direction.clone().negate();
      }
    }

    if (binding.weapon.consumeTracerFlag()) {
      const end = hitPoint ?? _scratchTracerEnd.copy(origin).addScaledVector(ray.direction, M2HB_STATS.maxRangeM);
      this.tracerPool.spawn(origin, end, M2HB_STATS.tracerLifetimeMs);
    }

    if (hitPoint && hitNormal && this.combatantSystem?.impactEffectsPool) {
      this.combatantSystem.impactEffectsPool.spawn(hitPoint, hitNormal);
    }

    if (this.audioManager && binding.weapon.consumeAudioGate()) {
      this.audioManager.play(M2HB_STATS.audioCue, origin.clone(), 0.7);
    }
  }

  private computeBarrelForward(emp: Emplacement, out: THREE.Vector3): void {
    // Same convention as the player adapter's `computeBarrelCamera`:
    // yaw=0,pitch=0 → world -Z. Yaw rotates around Y, pitch around local X.
    const yaw = emp.getYaw();
    const pitch = emp.getPitch();
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    out.set(-sy * cp, sp, -cy * cp);
  }

  private computeMuzzleOrigin(binding: M2HBBinding, out: THREE.Vector3): void {
    _scratchMuzzle.copy(binding.emplacement.getPosition());
    this.computeBarrelForward(binding.emplacement, _scratchForward);
    out.copy(_scratchMuzzle);
    out.y += 0.95; // sights line, matches Emplacement gunner-seat localOffset Y
    out.addScaledVector(_scratchForward, 0.6);
  }
}

// Re-export weapon component for callers that import this file as the
// single entry point.
export { M2HBWeapon, M2HB_STATS } from './M2HBWeapon';
export type { M2HBWeaponSnapshot } from './M2HBWeapon';
