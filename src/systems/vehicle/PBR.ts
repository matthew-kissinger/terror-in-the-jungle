import * as THREE from 'three';
import { Faction } from '../combat/types';
import type { IVehicle, SeatRole, VehicleSeat } from './IVehicle';
import {
  WatercraftPhysics,
  type WatercraftPhysicsConfig,
} from './WatercraftPhysics';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { Emplacement } from './Emplacement';
import type {
  PlayerVehicleAdapter,
  VehicleExitOptions,
  VehicleExitPlan,
  VehicleTransitionContext,
  VehicleUpdateContext,
} from './PlayerVehicleAdapter';

/**
 * PBR (Patrol Boat River) — US riverine craft, twin M2HB mounts.
 *
 * Authoritative scope: docs/tasks/cycle-voda-3-watercraft.md
 * §"pbr-integration (R2)".
 *
 * Architecture notes:
 *
 *   - Category `'watercraft'` — composes `WatercraftPhysics` (cycle #10 R1).
 *     Same IVehicle surface as Tank / GroundVehicle / Emplacement. The
 *     PBR owns its hull physics; the manager calls `update(dt)` each
 *     frame and the integrated pose is written to the chassis Object3D.
 *
 *   - Two M2HB mounts (forward + aft). Each mount is a real `Emplacement`
 *     instance constructed at PBR construction time and parented to the
 *     PBR hull's Object3D via `THREE.Object3D.add`. Because `Emplacement`
 *     resolves its position with `getWorldPosition()` and its rotation
 *     with `getWorldQuaternion()`, world-space queries (combatant
 *     raycasts, muzzle origin) compose the hull transform automatically
 *     — no changes to `Emplacement.ts` are required.
 *
 *   - Seats: the PBR exposes `pilot` (driver) + 2 `gunner` seats (one
 *     per mount) + 1 `passenger`. Driver seat is owned by the PBR
 *     directly; the gunner seats also live on the child Emplacement
 *     vehicles so the existing `EmplacementPlayerAdapter` + NPC-gunner
 *     fire path work without modification. The PBR's own gunner seats
 *     are exposed for IVehicle parity (`getSeats`) and for HUD /
 *     scenario-spawn callers that need to enumerate the boat's seat
 *     map without traversing into the mount sub-vehicles.
 *
 *   - The mounts are NOT registered with the `VehicleManager` from
 *     inside this class — the spawn helper in `PBRSpawn.ts` does that
 *     after construction so the manager-registration order stays in one
 *     place (mirrors how M2HBEmplacementSpawn registers the spawned
 *     emplacement with both the VehicleManager and the
 *     M2HBEmplacementSystem in one call). The PBR exposes the mounts
 *     via `getMounts()` so the spawn helper can wire them.
 *
 * Sibling-PR coordination: the parallel `sampan-integration` task is
 * authoring `WatercraftPlayerAdapter`. Until it merges, this file
 * declares a local-scope `IWatercraftPlayerAdapter` interface that
 * mirrors the expected adapter surface; the actual import swaps in a
 * follow-up PR. The PBR class itself does NOT depend on the adapter
 * at all (the adapter binds to the PBR via its IVehicle surface —
 * `getPilotId`, `enterVehicle`, etc.); the local interface only exists
 * for the future driver-adapter wiring to satisfy `tsc --noEmit` if a
 * test wants to type-check a PBR-bound adapter against the contract.
 */

// ---------- Stub-then-swap: local adapter interface ----------

/**
 * Local-scope mirror of the sibling `WatercraftPlayerAdapter`'s public
 * surface. Aligned with `PlayerVehicleAdapter` so the swap PR can
 * simply replace this with `import type { WatercraftPlayerAdapter } from
 * './WatercraftPlayerAdapter'`. Fields mirror the existing tank / jeep
 * adapter shapes:
 *
 *   - `onEnter` / `onExit`           - transition lifecycle
 *   - `update`                       - per-frame input → physics forwarding
 *   - `getExitPlan` (optional)       - exit policy + placement
 *   - `resetControlState`            - defensive cleanup
 *
 * Exported because the cycle brief calls for the type to be reachable
 * by any test that wants to bind a PBR to a future adapter; not exported
 * elsewhere in the runtime.
 */
export interface IWatercraftPlayerAdapter extends PlayerVehicleAdapter {
  readonly vehicleType: 'watercraft';
  onEnter(ctx: VehicleTransitionContext): void;
  onExit(ctx: VehicleTransitionContext): void;
  update(ctx: VehicleUpdateContext): void;
  getExitPlan?(ctx: VehicleTransitionContext, options: VehicleExitOptions): VehicleExitPlan;
  resetControlState(): void;
}

// ---------- PBR tuning (per brief) ----------

/**
 * PBR Mk II rough envelope:
 *   - Length ~9.4 m, beam ~3 m, draft ~0.6 m (loaded).
 *   - Displacement ~6.5 t crew, fuel + armament; loaded ~7-8 t.
 *   - Twin GM 6V53N diesels driving Jacuzzi water-jets.
 *   - Top speed ~25 kn (~13 m/s) loaded.
 *   - Turn radius ~12-15 m at speed.
 *
 * The brief stat block targets a *playful* boat — more responsive than
 * a real PBR (which is sluggish loaded) so the player gets a "fast
 * armed gunboat" feel rather than a freighter. Engine power, drag, and
 * rudder authority are picked to give:
 *
 *   - Throttle → ~7 m/s steady-state at full throttle on flat water.
 *   - Full rudder → ~50° heading change in 2 s at cruise.
 *   - Mass 3000 kg sized so 1200 N thrust gives a snappy 0.4 m/s² accel.
 *   - Displacement 3.5 m³ so the hull floats with ~30 cm freeboard at
 *     the standard 1.2 m hull-column immersion clamp.
 */
export const PBR_PHYSICS_CONFIG: Partial<WatercraftPhysicsConfig> = {
  mass: 3000,
  hullDisplacement: 3.5,
  enginePower: 1200,
  rudderAuthority: 0.9,
  dragCoefficient: 1.6,
  bridgeClearance: 2.4,
};

/** Hull dimensions (m). Drives mesh size + hull sample layout. */
export const PBR_HULL_DIMENSIONS = {
  length: 9.4,
  beam: 3.0,
  /** Visual height above the waterline (m), for the silhouette mesh. */
  height: 1.2,
} as const;

/**
 * Default four-corner hull sample layout in local space (FL/FR/RL/RR).
 * Chassis-forward is -Z (matches `GroundVehiclePhysics` convention used
 * by `WatercraftPhysics` `getForwardSpeed`).
 */
export function buildPBRHullSamples(): THREE.Vector3[] {
  const halfL = PBR_HULL_DIMENSIONS.length / 2;
  const halfB = PBR_HULL_DIMENSIONS.beam / 2;
  return [
    new THREE.Vector3(-halfB, 0, -halfL), // FL (bow port)
    new THREE.Vector3(+halfB, 0, -halfL), // FR (bow starboard)
    new THREE.Vector3(-halfB, 0, +halfL), // RL (stern port)
    new THREE.Vector3(+halfB, 0, +halfL), // RR (stern starboard)
  ];
}

/**
 * Local-space offsets for the two M2HB mounts. Forward mount sits in
 * the open well-deck near the bow; aft mount sits on the stern over
 * the engine compartment. Y is mount-base height above the chassis
 * origin (deck level).
 */
export const PBR_MOUNT_OFFSETS = {
  forward: new THREE.Vector3(0, 0.6, -3.0),
  aft:     new THREE.Vector3(0, 0.6, +3.0),
} as const;

// ---------- Seat layout ----------

/**
 * PBR seat map. SeatRole only knows `'pilot' | 'gunner' | 'passenger'`
 * — we use the seat index + `weaponMountIndex` discriminator (already
 * on `VehicleSeat`) to distinguish forward vs aft gunner without
 * touching the fence.
 *
 * Seat order:
 *   0: pilot   (driver, helm at the cabin)
 *   1: gunner  (forward mount; weaponMountIndex 0)
 *   2: gunner  (aft mount;     weaponMountIndex 1)
 *   3: passenger (one extra rider in the well-deck)
 */
const DEFAULT_PBR_SEATS: VehicleSeat[] = [
  { index: 0, role: 'pilot', occupantId: null, localOffset: new THREE.Vector3(0, 1.2, 0.5), exitOffset: new THREE.Vector3(-2.5, 0, 0.5) },
  { index: 1, role: 'gunner', occupantId: null, localOffset: new THREE.Vector3(0, 1.4, -3.0), exitOffset: new THREE.Vector3(-2.5, 0, -3.0), weaponMountIndex: 0 },
  { index: 2, role: 'gunner', occupantId: null, localOffset: new THREE.Vector3(0, 1.4, +3.0), exitOffset: new THREE.Vector3(+2.5, 0, +3.0), weaponMountIndex: 1 },
  { index: 3, role: 'passenger', occupantId: null, localOffset: new THREE.Vector3(0.6, 1.0, 0), exitOffset: new THREE.Vector3(+2.5, 0, 0) },
];

const _scratchPos = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();

/**
 * Public surface description for the per-mount sub-vehicles. The
 * scenario-spawn helper consumes this when wiring each Emplacement
 * with the M2HBEmplacementSystem (binding the M2HBWeapon + pitchNode).
 */
export interface PBRMount {
  /** 0 = forward, 1 = aft. */
  index: number;
  /** Stable id for the VehicleManager (`<pbrId>_mount_fwd` etc.). */
  vehicleId: string;
  emplacement: Emplacement;
  /** Tripod root that lives under the PBR hull. */
  root: THREE.Group;
  /** Rig nodes the M2HBEmplacementSystem needs to drive recoil + aim. */
  yawNode: THREE.Object3D;
  pitchNode: THREE.Object3D;
  /** Local-space offset on the hull (for HUD / debug overlays). */
  localOffset: THREE.Vector3;
}

export class PBR implements IVehicle {
  readonly category = 'watercraft' as const;
  readonly faction: Faction;
  private readonly seats: VehicleSeat[];
  private readonly physics: WatercraftPhysics;
  private readonly mounts: PBRMount[];
  private terrain: ITerrainRuntime | null = null;
  private destroyed = false;
  private readonly velocity = new THREE.Vector3();

  constructor(
    readonly vehicleId: string,
    private readonly object: THREE.Object3D,
    faction: Faction = Faction.US,
    seats: VehicleSeat[] = DEFAULT_PBR_SEATS,
    physicsConfig: Partial<WatercraftPhysicsConfig> = PBR_PHYSICS_CONFIG,
    mounts?: PBRMount[],
  ) {
    this.faction = faction;
    this.seats = seats.map((seat) => ({
      ...seat,
      localOffset: seat.localOffset.clone(),
      exitOffset: seat.exitOffset.clone(),
    }));

    // Seed physics state from the placed object's world transform so the
    // first update doesn't snap the hull to the origin — same pattern the
    // Tank + GroundVehicle constructors use.
    object.getWorldPosition(_scratchPos);
    object.getWorldQuaternion(_scratchQuat);

    const cfg: WatercraftPhysicsConfig = {
      hullSamplePoints: buildPBRHullSamples(),
      hullDisplacement: physicsConfig.hullDisplacement ?? PBR_PHYSICS_CONFIG.hullDisplacement!,
      mass: physicsConfig.mass ?? PBR_PHYSICS_CONFIG.mass!,
      enginePower: physicsConfig.enginePower ?? PBR_PHYSICS_CONFIG.enginePower!,
      rudderAuthority: physicsConfig.rudderAuthority ?? PBR_PHYSICS_CONFIG.rudderAuthority!,
      dragCoefficient: physicsConfig.dragCoefficient ?? PBR_PHYSICS_CONFIG.dragCoefficient!,
      bridgeClearance: physicsConfig.bridgeClearance ?? PBR_PHYSICS_CONFIG.bridgeClearance,
      initialPosition: _scratchPos.clone(),
      initialQuaternion: _scratchQuat.clone(),
    };
    this.physics = new WatercraftPhysics(cfg);

    // Mounts are constructed externally (by the spawn helper) so the
    // tripod meshes and yaw/pitch rig nodes are built once and the
    // M2HBEmplacementSystem binding is wired in the same call. Callers
    // that don't pass mounts (e.g. unit tests of the IVehicle surface
    // in isolation) get an empty mount list, which is valid — the PBR
    // still functions as a drivable hull, the gunner seats just have
    // no firing mount behind them.
    this.mounts = mounts ?? [];
  }

  // ---------- Mount access (for spawn / NPC gunner / HUD) ----------

  /** All emplacement mounts attached to this PBR (0 = forward, 1 = aft). */
  getMounts(): readonly PBRMount[] {
    return this.mounts;
  }

  /** Lookup by mount index. Returns null when the mount is not present. */
  getMount(index: number): PBRMount | null {
    return this.mounts.find(m => m.index === index) ?? null;
  }

  // ---------- Terrain / sampler wiring ----------

  setTerrain(terrain: ITerrainRuntime | null): void {
    this.terrain = terrain;
  }

  /**
   * Bind the water sampler used by the underlying physics. Passed
   * through to `WatercraftPhysics.setWaterSampler` — typically the
   * `WaterSystem` (which implements `BuoyancySamplerLike`). Calling
   * with `null` detaches; the hull will then have no buoyancy.
   */
  setWaterSampler(sampler: Parameters<WatercraftPhysics['setWaterSampler']>[0]): void {
    this.physics.setWaterSampler(sampler);
  }

  // ---------- Physics access (for adapters) ----------

  getPhysics(): WatercraftPhysics {
    return this.physics;
  }

  /** Driver input. throttle in [-1,1], rudder in [-1,1]. Clamps both. */
  setControls(throttle: number, rudder: number): void {
    this.physics.setControls(throttle, rudder);
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

  /** Role-based seat occupy (mirrors Tank.occupy). */
  occupy(seatRole: SeatRole, occupantId: string): boolean {
    return this.enterVehicle(occupantId, seatRole) !== null;
  }

  /** Role-based seat release (mirrors Tank.release). */
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

  /** Signed forward speed (m/s) along chassis-forward (-Z). */
  getForwardSpeed(): number {
    return this.physics.getForwardSpeed();
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  getHealthPercent(): number {
    return this.destroyed ? 0 : 1;
  }

  // ---------- Per-frame integration ----------

  /**
   * Step the hull simulation, write the integrated pose to the chassis
   * Object3D, then step each mount's slew. The mounts are children of
   * the chassis Object3D, so writing chassis pose first guarantees the
   * mount world transforms compose correctly off the new hull matrix
   * (same pattern Tank uses for its TankTurret child).
   *
   * The M2HBEmplacementSystem owns the weapon-fire path; we only step
   * the slew here. Calling update on each mount's Emplacement is also
   * safe when the M2HBEmplacementSystem itself calls into the same
   * Emplacement again later in the frame (slew is idempotent: it
   * walks current angles toward a target, no double-step issue).
   */
  update(dt: number): void {
    if (this.destroyed || dt <= 0) return;
    this.physics.update(dt, this.terrain ?? undefined);

    const state = this.physics.getState();
    this.object.position.copy(state.position);
    this.object.quaternion.copy(state.quaternion);
    this.velocity.copy(state.velocity);

    for (const mount of this.mounts) {
      mount.emplacement.update(dt);
    }
  }

  dispose(): void {
    this.destroyed = true;
    this.physics.dispose();
    for (const mount of this.mounts) {
      mount.emplacement.dispose();
    }
    this.object.removeFromParent();
  }
}
