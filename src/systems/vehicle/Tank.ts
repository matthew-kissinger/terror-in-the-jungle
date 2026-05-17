import * as THREE from 'three';
import { Faction } from '../combat/types';
import type { IVehicle, SeatRole, VehicleSeat } from './IVehicle';
import {
  TrackedVehiclePhysics,
  type TrackedVehiclePhysicsConfig,
} from './TrackedVehiclePhysics';
import { TankTurret, type TankTurretConfig } from './TankTurret';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';

/**
 * HP-band ladder per cycle-vekhikl-4-tank-turret-and-cannon §"tank-damage-states (R2)":
 *   100% → 'healthy'     (no damage decoration)
 *    66% → 'damaged'     (light smoke wisps)
 *    33% → 'critical'    (heavy smoke + scattered hull dings; substate triggers enabled)
 *     0% → 'wrecked'     (flame + heavy smoke; vehicle disabled, no further interaction)
 */
export type HpBand = 'healthy' | 'damaged' | 'critical' | 'wrecked';

/** Damage type passed to `applyDamage`; biases substate selection at < critical HP. */
export type TankDamageType = 'AP' | 'HEAT' | 'HE';

/** Substate triggered by a critical-HP hit. Combinations stack on the same vehicle. */
export type TankSubstate = 'tracks-blown' | 'turret-jammed' | 'engine-killed';

export interface TankSubstateFlags {
  tracksBlown: boolean;
  turretJammed: boolean;
  engineKilled: boolean;
}

export interface TankDamageResult {
  /** New HP value after the hit (0..maxHp). */
  newHp: number;
  /** Set when this hit crossed an HP band threshold. */
  bandTransition?: HpBand;
  /** Set when this hit triggered a substate roll. */
  substateTriggered?: TankSubstate;
}

export interface TankDamageConfig {
  maxHp: number;
  /** HP fraction triggering 'damaged' (default 0.66 ⇒ <= 66%). */
  damagedThreshold: number;
  /** HP fraction triggering 'critical' (default 0.33 ⇒ <= 33%). */
  criticalThreshold: number;
  /**
   * Base probability scaling for substate rolls at critical HP. A hit
   * deals `damage` HP loss; trigger probability is
   * `min(1, substateBaseChance * damage / maxHp)` (so a single hit that
   * removes ~maxHp * substateBaseChance is almost certain to trigger
   * something; smaller hits are proportionally rarer).
   */
  substateBaseChance: number;
}

export const DEFAULT_TANK_DAMAGE_CONFIG: TankDamageConfig = {
  maxHp: 1000,
  damagedThreshold: 0.66,
  criticalThreshold: 0.33,
  // 0.4 means a hit that wipes 40% of maxHp will roll trigger with p=0.16
  // (1.0 * 0.4). Combined with the bias table this lands a couple of
  // substates over a typical critical-HP firefight without making every
  // single shot a system-killer.
  substateBaseChance: 1.0,
};

/**
 * Per-damage-type substate weight table. Each row sums to ~1.0; weights
 * are normalized at draw time (only across substates not already
 * triggered). Rationale per task brief:
 *
 *   - AP (penetrating, single point of damage) biases toward turret +
 *     engine — high-velocity through-hits disable internals.
 *   - HEAT (shaped charge, plasma jet) biases toward tracks + engine
 *     and is the most "everything catches fire" type.
 *   - HE (high explosive, surface blast) biases toward tracks — track
 *     pins / bogies are the soft mechanical bits closest to the surface.
 */
const SUBSTATE_BIAS: Record<TankDamageType, Record<TankSubstate, number>> = {
  AP:   { 'turret-jammed': 0.45, 'engine-killed': 0.45, 'tracks-blown': 0.10 },
  HEAT: { 'tracks-blown': 0.40, 'engine-killed': 0.40, 'turret-jammed': 0.20 },
  HE:   { 'tracks-blown': 0.65, 'engine-killed': 0.20, 'turret-jammed': 0.15 },
};

/**
 * Tank IVehicle implementation. Sibling of `GroundVehicle` (the wheeled
 * M151 jeep) per docs/rearch/TANK_SYSTEMS_2026-05-13.md §"Integration
 * surface": both implement `category = 'ground'`, but the tank composes
 * `TrackedVehiclePhysics` (skid-steer) instead of `GroundVehiclePhysics`
 * (Ackermann). No subclass.
 *
 * The chassis-slice ships only the driver seat hookup the cycle brief
 * calls out; the gunner seat is declared up front so the player-adapter
 * and cycle #9 turret work can mount onto it without changing this
 * surface. Loader + commander are exposed as passenger seats with no
 * functional binding, mirroring `DEFAULT_M151_SEATS`.
 *
 * Sibling-PR coordination: the parallel `tank-player-adapter` task
 * built `TankPlayerAdapter` against a structural `ITankModel` stub.
 * This class satisfies that stub:
 *
 *   readonly id, position, quaternion, category: 'ground'
 *   setControls(throttleAxis, turnAxis, brake): void
 *   getSeats(): Array<{ role: SeatRole; exitOffset: THREE.Vector3 }>
 *   occupy(seatRole, occupantId): boolean
 *   release(seatRole): void
 *   getForwardSpeed(): number
 *
 * After this PR + the adapter PR merge, the adapter swaps its local
 * stub for the real `Tank` import.
 */

const DEFAULT_M48_SEATS: VehicleSeat[] = [
  // Driver: front-left of the hull (M48 driver's hatch on the left of
  // the glacis), seated, exits to the front-left of the chassis.
  { index: 0, role: 'pilot', occupantId: null, localOffset: new THREE.Vector3(-0.6, 1.4, -2.2), exitOffset: new THREE.Vector3(-2.6, 0, -2.2) },
  // Gunner: turret-mounted. Position is the turret-ring centre; the
  // cycle #9 turret rig will refine to "right of the breech."
  { index: 1, role: 'gunner', occupantId: null, localOffset: new THREE.Vector3(0.4, 2.2, 0.0), exitOffset: new THREE.Vector3(2.6, 0, 0) },
  // Loader: left of the breech, no functional binding in v1.
  { index: 2, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(-0.4, 2.2, 0.4), exitOffset: new THREE.Vector3(-2.6, 0, 0.4) },
  // Commander: turret-roof cupola, no functional binding in v1.
  { index: 3, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(0.4, 2.6, 0.4), exitOffset: new THREE.Vector3(2.6, 0, 0.4) },
];

const _scratchPos = new THREE.Vector3();

export class Tank implements IVehicle {
  readonly category = 'ground' as const;
  readonly faction: Faction;
  private readonly seats: VehicleSeat[];
  private readonly velocity = new THREE.Vector3();
  private destroyed = false;
  private readonly physics: TrackedVehiclePhysics;
  private readonly turret: TankTurret;
  private terrain: ITerrainRuntime | null = null;

  /** HP state machine (R2, `tank-damage-states`). */
  private readonly damageConfig: TankDamageConfig;
  private hp: number;
  private band: HpBand = 'healthy';
  /**
   * Random source for substate rolls. Defaults to `Math.random`; tests
   * inject a seeded generator so substate triggers are deterministic.
   */
  private readonly rng: () => number;
  /**
   * Optional listener fired on every HP-band transition. Wired by the
   * playtest task or a follow-up cycle to attach actual smoke / fire
   * VFX. Kept as a callback (not a direct VFX import) so this file
   * stays free of rendering deps — see PR description.
   */
  private bandTransitionListener: ((band: HpBand) => void) | null = null;
  /**
   * Optional listener fired when a substate triggers. Same callback
   * rationale as `bandTransitionListener`.
   */
  private substateListener: ((substate: TankSubstate) => void) | null = null;

  constructor(
    readonly vehicleId: string,
    private readonly object: THREE.Object3D,
    faction: Faction = Faction.US,
    seats: VehicleSeat[] = DEFAULT_M48_SEATS,
    physicsConfig?: Partial<TrackedVehiclePhysicsConfig>,
    turretConfig?: Partial<TankTurretConfig>,
    damageConfig?: Partial<TankDamageConfig>,
    rng: () => number = Math.random,
  ) {
    this.faction = faction;
    this.seats = seats.map((seat) => ({
      ...seat,
      localOffset: seat.localOffset.clone(),
      exitOffset: seat.exitOffset.clone(),
    }));

    this.damageConfig = { ...DEFAULT_TANK_DAMAGE_CONFIG, ...(damageConfig ?? {}) };
    this.hp = this.damageConfig.maxHp;
    this.rng = rng;

    // Seed physics state from the object's current world transform so
    // the first update doesn't snap the chassis to the origin — same
    // pattern GroundVehicle uses for the M151.
    object.getWorldPosition(_scratchPos);
    this.physics = new TrackedVehiclePhysics(_scratchPos, physicsConfig);
    if (object.quaternion) {
      this.physics.setQuaternion(object.quaternion);
    }

    // Mount the turret rig as a child of the chassis object. The turret
    // owns its yaw + pitch nodes and parents them under `object`; cycle
    // #9 sibling tasks (gunner adapter, cannon projectile) read its
    // world-space barrel transform.
    this.turret = new TankTurret(this.object, turretConfig);
  }

  // ---------- ITankModel structural shape (sibling-PR coordination) ----------

  /** Stable id alias the adapter uses (mirrors `vehicleId`). */
  get id(): string {
    return this.vehicleId;
  }

  /** Live world-space position reference (matches the rendered object). */
  get position(): THREE.Vector3 {
    return this.object.position;
  }

  /** Live world-space orientation reference. */
  get quaternion(): THREE.Quaternion {
    return this.object.quaternion;
  }

  // ---------- Terrain wiring ----------

  setTerrain(terrain: ITerrainRuntime | null): void {
    this.terrain = terrain;
    if (terrain && typeof terrain.getPlayableWorldSize === 'function') {
      const worldSize = terrain.getPlayableWorldSize();
      if (Number.isFinite(worldSize) && worldSize > 0) {
        this.physics.setWorldHalfExtent(worldSize * 0.5);
      }
    }
  }

  // ---------- Physics access (for adapters / NPC drivers) ----------

  getPhysics(): TrackedVehiclePhysics {
    return this.physics;
  }

  /** Turret rig (cycle #9 R1). Owned by this Tank; mounted on the chassis. */
  getTurret(): TankTurret {
    return this.turret;
  }

  /**
   * Skid-steer driver input. Delegates straight through to the physics
   * layer so the adapter never has to know about `TrackedVehiclePhysics`.
   */
  setControls(throttleAxis: number, turnAxis: number, brake: boolean): void {
    this.physics.setControls(throttleAxis, turnAxis, brake);
  }

  setTracksBlown(blown: boolean): void {
    this.physics.setTracksBlown(blown);
  }

  // ---------- Seating ----------

  getSeats(): readonly VehicleSeat[] {
    return this.seats;
  }

  enterVehicle(occupantId: string, preferredRole?: SeatRole): number | null {
    const seat = this.seats.find(candidate =>
      candidate.occupantId === null && (!preferredRole || candidate.role === preferredRole)
    ) ?? this.seats.find(candidate => candidate.occupantId === null);

    if (!seat) return null;
    seat.occupantId = occupantId;
    return seat.index;
  }

  exitVehicle(occupantId: string): THREE.Vector3 | null {
    const seat = this.seats.find(candidate => candidate.occupantId === occupantId);
    if (!seat) return null;
    seat.occupantId = null;
    return this.getPosition().add(seat.exitOffset);
  }

  /** Role-based seat occupy used by `TankPlayerAdapter` (ITankModel). */
  occupy(seatRole: SeatRole, occupantId: string): boolean {
    return this.enterVehicle(occupantId, seatRole) !== null;
  }

  /** Role-based seat release used by `TankPlayerAdapter` (ITankModel). */
  release(seatRole: SeatRole): void {
    const seat = this.seats.find(candidate => candidate.role === seatRole && candidate.occupantId !== null);
    if (seat) seat.occupantId = null;
  }

  getOccupant(seatIndex: number): string | null {
    return this.seats[seatIndex]?.occupantId ?? null;
  }

  getPilotId(): string | null {
    return this.seats.find(seat => seat.role === 'pilot')?.occupantId ?? null;
  }

  hasFreeSeats(role?: SeatRole): boolean {
    return this.seats.some(seat => seat.occupantId === null && (!role || seat.role === role));
  }

  // ---------- Pose / state ----------

  getPosition(): THREE.Vector3 {
    return this.object.getWorldPosition(new THREE.Vector3());
  }

  getQuaternion(): THREE.Quaternion {
    return this.object.getWorldQuaternion(new THREE.Quaternion());
  }

  getVelocity(): THREE.Vector3 {
    return this.velocity.clone();
  }

  /** Forward-axis speed (m/s) used by the adapter's HUD readout. */
  getForwardSpeed(): number {
    return this.physics.getForwardSpeed();
  }

  isDestroyed(): boolean {
    return this.destroyed || this.band === 'wrecked';
  }

  getHealthPercent(): number {
    if (this.destroyed) return 0;
    return this.hp / this.damageConfig.maxHp;
  }

  // ---------- HP bands + substates (R2, `tank-damage-states`) ----------

  /** Current HP value (0..maxHp). Mostly for debugging / HUD. */
  getHp(): number {
    return this.hp;
  }

  /** Maximum HP, frozen at construction from the damage config. */
  getMaxHp(): number {
    return this.damageConfig.maxHp;
  }

  /** Current HP band (`'healthy' | 'damaged' | 'critical' | 'wrecked'`). */
  getHpBand(): HpBand {
    return this.band;
  }

  /** Snapshot of the three substate flags. */
  getSubstates(): TankSubstateFlags {
    return {
      tracksBlown: this.physics.isTracksBlown(),
      turretJammed: this.turret.isJammed(),
      engineKilled: this.physics.isEngineKilled(),
    };
  }

  /**
   * Register a one-shot listener for HP-band transitions. The playtest
   * task or a follow-up cycle wires this to particle / decal VFX; this
   * class deliberately does not import any rendering deps so the damage
   * machine stays unit-testable. Pass `null` to clear.
   */
  setBandTransitionListener(listener: ((band: HpBand) => void) | null): void {
    this.bandTransitionListener = listener;
  }

  /** Register a listener for substate triggers (see `setBandTransitionListener`). */
  setSubstateListener(listener: ((substate: TankSubstate) => void) | null): void {
    this.substateListener = listener;
  }

  /**
   * Apply a damage event to the tank. Returns a result describing the
   * new HP, the band transition (if the hit crossed a threshold) and
   * the substate trigger (if the random roll fired at critical HP).
   *
   * Wrecked tanks are inert: subsequent `applyDamage` calls are no-ops
   * that return `{ newHp: 0 }` with no transition / substate.
   *
   * The `hitPoint` argument is currently passed-through metadata so the
   * future projectile→Tank routing path can attribute hits per chassis
   * region (left track vs. right track vs. turret). The current
   * implementation does not vary damage by region; the parameter is in
   * the signature so callers don't break when region-aware damage lands
   * later in the cycle.
   */
  applyDamage(
    amount: number,
    _hitPoint: THREE.Vector3,
    damageType: TankDamageType,
  ): TankDamageResult {
    if (this.band === 'wrecked' || amount <= 0) {
      return { newHp: this.hp };
    }

    const prevBand = this.band;
    this.hp = Math.max(0, this.hp - amount);

    const newBand = this.computeBand(this.hp);
    let bandTransition: HpBand | undefined;
    if (newBand !== prevBand) {
      this.band = newBand;
      bandTransition = newBand;
      this.fireBandTransition(newBand);
      // Wrecked is terminal: pin throttle off (engine dies on kill) so
      // the chassis bleeds down even if no other substate triggered.
      if (newBand === 'wrecked') {
        this.physics.setEngineKilled(true);
        this.turret.setJammed(true);
        return { newHp: this.hp, bandTransition };
      }
    }

    // Substate rolls only at < critical HP and only while there's still
    // a substate that hasn't already triggered.
    let substateTriggered: TankSubstate | undefined;
    if (this.band === 'critical') {
      substateTriggered = this.maybeTriggerSubstate(amount, damageType);
    }

    return { newHp: this.hp, bandTransition, substateTriggered };
  }

  private computeBand(hp: number): HpBand {
    const max = this.damageConfig.maxHp;
    if (hp <= 0) return 'wrecked';
    const frac = hp / max;
    if (frac <= this.damageConfig.criticalThreshold) return 'critical';
    if (frac <= this.damageConfig.damagedThreshold) return 'damaged';
    return 'healthy';
  }

  private fireBandTransition(band: HpBand): void {
    const listener = this.bandTransitionListener;
    if (listener) listener(band);
  }

  /**
   * Attempt a single substate roll. Probability is
   *   p = min(1, substateBaseChance * damage / maxHp)
   * Returns the triggered substate (or `undefined` if the roll missed or
   * if all three substates are already active).
   */
  private maybeTriggerSubstate(
    damage: number,
    damageType: TankDamageType,
  ): TankSubstate | undefined {
    const max = this.damageConfig.maxHp;
    if (max <= 0) return undefined;

    const p = Math.min(1, this.damageConfig.substateBaseChance * damage / max);
    if (this.rng() >= p) return undefined;

    // Build weight table over substates that have not already triggered.
    const flags = this.getSubstates();
    const remaining: TankSubstate[] = [];
    const weights: number[] = [];
    let totalWeight = 0;
    const bias = SUBSTATE_BIAS[damageType];
    const candidates: TankSubstate[] = ['tracks-blown', 'turret-jammed', 'engine-killed'];
    for (const sub of candidates) {
      if (this.isSubstateActive(sub, flags)) continue;
      const w = bias[sub];
      if (w <= 0) continue;
      remaining.push(sub);
      weights.push(w);
      totalWeight += w;
    }
    if (remaining.length === 0 || totalWeight <= 0) return undefined;

    // Weighted draw using a second RNG sample so the trigger decision
    // and substate-selection decision are statistically independent.
    let r = this.rng() * totalWeight;
    let pick = remaining[remaining.length - 1];
    for (let i = 0; i < remaining.length; i += 1) {
      r -= weights[i];
      if (r <= 0) {
        pick = remaining[i];
        break;
      }
    }

    this.applySubstate(pick);
    const listener = this.substateListener;
    if (listener) listener(pick);
    return pick;
  }

  private isSubstateActive(sub: TankSubstate, flags: TankSubstateFlags): boolean {
    switch (sub) {
      case 'tracks-blown': return flags.tracksBlown;
      case 'turret-jammed': return flags.turretJammed;
      case 'engine-killed': return flags.engineKilled;
    }
  }

  private applySubstate(sub: TankSubstate): void {
    switch (sub) {
      case 'tracks-blown':
        this.physics.setTracksBlown(true);
        return;
      case 'turret-jammed':
        this.turret.setJammed(true);
        return;
      case 'engine-killed':
        this.physics.setEngineKilled(true);
        return;
    }
  }

  // ---------- Per-frame integration ----------

  /**
   * Step the chassis simulation and write the integrated pose back to
   * the scene object. Safe to call without a terrain reference (the
   * physics layer treats the surface as flat-and-infinite until
   * `setTerrain` is called).
   */
  update(dt: number): void {
    if (this.destroyed || dt <= 0) return;
    this.physics.update(dt, this.terrain);

    const state = this.physics.getState();
    this.object.position.copy(state.position);
    this.object.quaternion.copy(state.quaternion);
    this.velocity.copy(state.velocity);

    // Slew the turret after the chassis pose is written so the turret's
    // world transform composes correctly off the new chassis matrix.
    this.turret.update(dt);
  }

  dispose(): void {
    this.destroyed = true;
    this.physics.dispose();
    this.turret.dispose();
    this.object.removeFromParent();
  }
}
