import * as THREE from 'three';
import { Faction } from '../combat/types';
import type { IVehicle, SeatRole, VehicleSeat } from './IVehicle';

/**
 * Fixed weapon emplacement (e.g. M2HB on tripod or sandbag platform).
 *
 * Design notes (per docs/tasks/cycle-vekhikl-2-stationary-weapons.md):
 *
 *  - Category `'emplacement'` — static; no chassis physics, no integration loop.
 *    The tripod is parented to the world; only the barrel rotates. This is the
 *    deliberate "no new physics library" path called out in the cycle hard-stops.
 *
 *  - Two-seat layout (`'gunner'` + `'passenger'`):
 *    - Seat 0 (`'gunner'`): the operator behind the spade-grips. Mouse drives
 *      barrel yaw + pitch through the player adapter, NPC drives it through
 *      `CombatantAI` target acquisition.
 *    - Seat 1 (`'passenger'`): historically the "A-gunner" / ammo handler who
 *      feeds belts and clears stoppages. We expose the seat now so future NPC
 *      logic (assist scoring, reload-on-dismount) can hook in without touching
 *      this surface again.
 *
 *    A single-seat first cut was on the table; the two-seat layout costs only
 *    one extra `VehicleSeat` literal and lets `enterVehicle('player', 'gunner')`
 *    select the spade-grip seat deterministically when an NPC ammo handler is
 *    already mounted. Matches the multi-role pattern in `GroundVehicle`.
 *
 *  - Barrel rig: yaw (around tripod Y axis) and pitch (around the barrel's
 *    local X axis) are stored as scalars and applied to two `THREE.Object3D`
 *    nodes inside the tripod hierarchy. Slew rates are capped per second so
 *    aim commands don't snap instantaneously; this gives the M2HB its
 *    characteristic crew-served swing weight and matches how
 *    `HelicopterDoorGunner` paces fire commands. Yaw is unlimited (the tripod
 *    swivels 360°); pitch is clamped to the M2HB's mechanical envelope
 *    (-10° depression to +60° elevation).
 */

const DEG = Math.PI / 180;

export interface EmplacementConfig {
  /**
   * Max yaw slew, radians per second. Default 80°/s — matches a trained
   * gunner's traverse rate on a tripod-mounted .50 cal.
   */
  yawSlewRate?: number;
  /**
   * Max pitch slew, radians per second. Default 60°/s — pitch is slower than
   * yaw on most crew-served tripods because the elevation screw is hand-cranked.
   */
  pitchSlewRate?: number;
  /**
   * Pitch limits in radians (min, max). Default M2HB envelope: -10° to +60°.
   */
  pitchLimits?: { min: number; max: number };
  /**
   * Yaw limits in radians (min, max). Default `null` = 360° traverse.
   * Sandbag-platform emplacements with overhead cover may want a limited arc.
   */
  yawLimits?: { min: number; max: number } | null;
}

const DEFAULT_CONFIG: Required<Omit<EmplacementConfig, 'yawLimits'>> & { yawLimits: { min: number; max: number } | null } = {
  yawSlewRate: 80 * DEG,
  pitchSlewRate: 60 * DEG,
  pitchLimits: { min: -10 * DEG, max: 60 * DEG },
  yawLimits: null,
};

const DEFAULT_SEATS: VehicleSeat[] = [
  // Gunner: behind the spade grips, slightly elevated.
  { index: 0, role: 'gunner', occupantId: null, localOffset: new THREE.Vector3(0, 0.9, -0.6), exitOffset: new THREE.Vector3(0, 0, -1.8) },
  // Ammo handler: to the gunner's left, lower (kneeling at the ready-box).
  { index: 1, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(-0.7, 0.5, -0.4), exitOffset: new THREE.Vector3(-1.8, 0, -0.4) },
];

function clampAngle(value: number, limits: { min: number; max: number } | null): number {
  if (!limits) return value;
  if (value < limits.min) return limits.min;
  if (value > limits.max) return limits.max;
  return value;
}

function approach(current: number, target: number, maxStep: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

export class Emplacement implements IVehicle {
  readonly category = 'emplacement' as const;
  readonly faction: Faction;

  private readonly seats: VehicleSeat[];
  private readonly config: Required<Omit<EmplacementConfig, 'yawLimits'>> & { yawLimits: { min: number; max: number } | null };

  // Barrel rig state.
  private yaw = 0;
  private pitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;

  // Optional rig nodes the adapter can hand us at construction time. We hold
  // weak references and only write to them when present; tests can omit them.
  private readonly yawNode: THREE.Object3D | null;
  private readonly pitchNode: THREE.Object3D | null;

  private destroyed = false;
  private readonly zeroVelocity = new THREE.Vector3();

  constructor(
    readonly vehicleId: string,
    private readonly object: THREE.Object3D,
    faction: Faction = Faction.US,
    options: {
      seats?: VehicleSeat[];
      config?: EmplacementConfig;
      yawNode?: THREE.Object3D;
      pitchNode?: THREE.Object3D;
    } = {},
  ) {
    this.faction = faction;
    this.seats = (options.seats ?? DEFAULT_SEATS).map((seat) => ({
      ...seat,
      localOffset: seat.localOffset.clone(),
      exitOffset: seat.exitOffset.clone(),
    }));
    this.config = {
      yawSlewRate: options.config?.yawSlewRate ?? DEFAULT_CONFIG.yawSlewRate,
      pitchSlewRate: options.config?.pitchSlewRate ?? DEFAULT_CONFIG.pitchSlewRate,
      pitchLimits: options.config?.pitchLimits ?? DEFAULT_CONFIG.pitchLimits,
      yawLimits: options.config?.yawLimits === undefined ? DEFAULT_CONFIG.yawLimits : options.config.yawLimits,
    };
    this.yawNode = options.yawNode ?? null;
    this.pitchNode = options.pitchNode ?? null;
  }

  // ---------- Aim API ----------

  /**
   * Request a new barrel aim. Yaw is along the tripod's Y axis, pitch is the
   * barrel's local X axis (positive = elevation). Inputs are clamped to the
   * configured limits before being recorded as the slew target; `update(dt)`
   * walks the current angles toward the target at the configured slew rates.
   */
  setAim(targetYaw: number, targetPitch: number): void {
    this.targetYaw = clampAngle(targetYaw, this.config.yawLimits);
    this.targetPitch = clampAngle(targetPitch, this.config.pitchLimits);
  }

  /** Current barrel yaw in radians (after slew, after any clamping). */
  getYaw(): number {
    return this.yaw;
  }

  /** Current barrel pitch in radians (after slew, after any clamping). */
  getPitch(): number {
    return this.pitch;
  }

  /** Target aim the slew is converging toward. Useful for HUD lead-indicators. */
  getTargetAim(): { yaw: number; pitch: number } {
    return { yaw: this.targetYaw, pitch: this.targetPitch };
  }

  /** Per-second slew limits the emplacement was configured with. */
  getSlewRates(): { yaw: number; pitch: number } {
    return { yaw: this.config.yawSlewRate, pitch: this.config.pitchSlewRate };
  }

  /** Hard limits on barrel pitch (mechanical envelope). */
  getPitchLimits(): { min: number; max: number } {
    return { ...this.config.pitchLimits };
  }

  /** Hard limits on barrel yaw, or `null` for full 360° traverse. */
  getYawLimits(): { min: number; max: number } | null {
    return this.config.yawLimits ? { ...this.config.yawLimits } : null;
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

  getOccupant(seatIndex: number): string | null {
    return this.seats[seatIndex]?.occupantId ?? null;
  }

  /**
   * Emplacements have no pilot; for IVehicle parity we treat the gunner as the
   * "pilot" so callers asking "who's driving this thing" get the right answer.
   */
  getPilotId(): string | null {
    return this.seats.find(seat => seat.role === 'gunner')?.occupantId ?? null;
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

  /**
   * Emplacements are static. Returning a fresh zero vector (not a shared
   * instance) keeps callers safe to mutate the result.
   */
  getVelocity(): THREE.Vector3 {
    return this.zeroVelocity.clone();
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  getHealthPercent(): number {
    return this.destroyed ? 0 : 1;
  }

  // ---------- Per-frame slew ----------

  /**
   * Walk the barrel aim toward the requested target at the configured slew
   * rates. There is no chassis integration; the tripod itself never moves.
   */
  update(dt: number): void {
    if (this.destroyed || dt <= 0) return;

    const maxYawStep = this.config.yawSlewRate * dt;
    const maxPitchStep = this.config.pitchSlewRate * dt;

    this.yaw = approach(this.yaw, this.targetYaw, maxYawStep);
    this.pitch = approach(this.pitch, this.targetPitch, maxPitchStep);

    // Write through to the rig nodes if the adapter supplied them.
    if (this.yawNode) this.yawNode.rotation.y = this.yaw;
    if (this.pitchNode) this.pitchNode.rotation.x = this.pitch;
  }

  dispose(): void {
    this.destroyed = true;
    this.object.removeFromParent();
  }
}
