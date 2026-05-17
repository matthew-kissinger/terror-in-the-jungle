import * as THREE from 'three';

/**
 * Tank turret rig (cycle-vekhikl-4-tank-turret-and-cannon R1).
 *
 * Source memo: docs/rearch/TANK_SYSTEMS_2026-05-13.md §"Turret rig".
 *
 * The turret is an independent rig parented under the chassis `Object3D`.
 * Two angular state variables (yaw + barrel pitch) are integrated each
 * frame at a capped slew rate so aim commands can never snap
 * instantaneously — the M48's hydraulic traverse and hand-cranked
 * elevation are crew-served weapons feel, and the slew cap is what
 * sells that. Yaw is unconstrained (full 360° traverse, wrap-around);
 * pitch is clamped to the mechanical envelope of the M48 main cannon
 * (-10° depression to +20° elevation per the cycle brief).
 *
 * Mounting model:
 *
 *   chassis Object3D (owned by Tank)
 *   └── yawNode    (rotates around local Y; created by this class)
 *       └── pitchNode  (rotates around local X; created by this class)
 *           └── barrel tip is `barrelTipLocalOffset` in pitchNode-local
 *
 * The class owns the two `Object3D` nodes it creates and inserts into the
 * chassis hierarchy. `dispose()` removes them. Visual meshes (turret
 * cylinder, barrel cylinder, breech, etc.) can be parented under the
 * `yawNode` / `pitchNode` accessors by the spawn code or a later GLB
 * loader; this class deliberately does not render anything itself — it
 * is a pure transform rig.
 *
 * Per docs/INTERFACE_FENCE.md: this is a new internal type. No fenced
 * interface is touched.
 */

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

export interface TankTurretConfig {
  /** Max yaw slew, radians per second. Default ~30°/s (M48 hydraulic). */
  yawSlewRate: number;
  /** Max barrel pitch slew, radians per second. Default ~8°/s. */
  barrelPitchSlewRate: number;
  /**
   * Pitch limits in radians (min, max). Default M48 envelope:
   * -10° (depression) to +20° (elevation).
   */
  pitchLimits: { min: number; max: number };
  /**
   * Local-space offset from the pitchNode origin to the muzzle tip, in
   * pitchNode-local frame. Default points along chassis-forward (-Z) at
   * a barrel length of 5 m, matching the M48 90 mm M41 barrel.
   * Y offset lifts the muzzle above the turret-ring origin.
   */
  barrelTipLocalOffset: THREE.Vector3;
  /**
   * Local-space offset of the yawNode (the turret-ring centre) from the
   * chassis origin. Default raises the turret to the M48 ring height.
   */
  yawNodeLocalOffset: THREE.Vector3;
  /**
   * Local-space offset of the pitchNode (the trunnion centre) from the
   * yawNode origin. Default offsets slightly forward of the turret ring
   * so barrel pitch rotates around the trunnion, not the ring centre.
   */
  pitchNodeLocalOffset: THREE.Vector3;
}

export const DEFAULT_TANK_TURRET_CONFIG: TankTurretConfig = {
  yawSlewRate: 30 * DEG,
  barrelPitchSlewRate: 8 * DEG,
  pitchLimits: { min: -10 * DEG, max: 20 * DEG },
  // Muzzle is 5 m forward of the trunnion along chassis-local -Z.
  barrelTipLocalOffset: new THREE.Vector3(0, 0, -5),
  // Turret ring sits ~1.7 m above the chassis origin (M48 hull plus a
  // small cosmetic stand-in). Tunable per spawn.
  yawNodeLocalOffset: new THREE.Vector3(0, 1.7, 0),
  // Trunnion slightly forward of the ring centre.
  pitchNodeLocalOffset: new THREE.Vector3(0, 0.45, -0.3),
};

const _scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _scratchQuat = new THREE.Quaternion();
const _scratchForward = new THREE.Vector3(0, 0, -1);

/**
 * Wrap an angle to the (-PI, PI] range. Used so slew rate caps measure
 * the *shortest* path from current to target yaw, not the unwound delta.
 */
function wrapAnglePi(a: number): number {
  let x = a % TWO_PI;
  if (x > Math.PI) x -= TWO_PI;
  else if (x <= -Math.PI) x += TWO_PI;
  return x;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Walk `current` toward `target` by at most `maxStep`. Returns the new
 * value; if the delta is within `maxStep`, returns `target` directly.
 */
function approachLinear(current: number, target: number, maxStep: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

/**
 * Walk `current` yaw toward `target` along the *shortest* angular path,
 * by at most `maxStep`. Result is wrapped to (-PI, PI].
 */
function approachAngular(current: number, target: number, maxStep: number): number {
  const shortest = wrapAnglePi(target - current);
  if (Math.abs(shortest) <= maxStep) {
    return wrapAnglePi(target);
  }
  return wrapAnglePi(current + Math.sign(shortest) * maxStep);
}

export class TankTurret {
  private readonly config: TankTurretConfig;
  private readonly chassis: THREE.Object3D;
  private readonly yawNode: THREE.Object3D;
  private readonly pitchNode: THREE.Object3D;

  private yaw = 0;
  private barrelPitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;
  private disposed = false;
  private jammed = false;

  constructor(parentChassis: THREE.Object3D, config: Partial<TankTurretConfig> = {}) {
    this.chassis = parentChassis;
    this.config = {
      yawSlewRate: config.yawSlewRate ?? DEFAULT_TANK_TURRET_CONFIG.yawSlewRate,
      barrelPitchSlewRate:
        config.barrelPitchSlewRate ?? DEFAULT_TANK_TURRET_CONFIG.barrelPitchSlewRate,
      pitchLimits: config.pitchLimits
        ? { min: config.pitchLimits.min, max: config.pitchLimits.max }
        : { ...DEFAULT_TANK_TURRET_CONFIG.pitchLimits },
      barrelTipLocalOffset: (config.barrelTipLocalOffset ?? DEFAULT_TANK_TURRET_CONFIG.barrelTipLocalOffset).clone(),
      yawNodeLocalOffset: (config.yawNodeLocalOffset ?? DEFAULT_TANK_TURRET_CONFIG.yawNodeLocalOffset).clone(),
      pitchNodeLocalOffset: (config.pitchNodeLocalOffset ?? DEFAULT_TANK_TURRET_CONFIG.pitchNodeLocalOffset).clone(),
    };

    // Build the parent-child rig and attach it to the chassis. We always
    // own these nodes — they are not optional parameters, because the
    // public API guarantees that turret transforms are reflected in the
    // scene graph (the gunner camera + cannon spawn points read from
    // these nodes' world matrices in the R1 sibling tasks).
    this.yawNode = new THREE.Object3D();
    this.yawNode.name = 'tank_turret_yaw';
    this.yawNode.position.copy(this.config.yawNodeLocalOffset);
    this.chassis.add(this.yawNode);

    this.pitchNode = new THREE.Object3D();
    this.pitchNode.name = 'tank_turret_pitch';
    this.pitchNode.position.copy(this.config.pitchNodeLocalOffset);
    this.yawNode.add(this.pitchNode);
  }

  // ---------- Aim API ----------

  /**
   * Request a turret yaw target (radians, relative to chassis frame).
   * Yaw is unconstrained — any value is accepted; the integrator slews
   * along the shortest angular path and wraps to (-PI, PI].
   *
   * No-op when the turret is jammed (see `setJammed`): the target is
   * held at its last value so the barrel settles at the previously
   * commanded pose and refuses to track new aim commands.
   */
  setTargetYaw(yawRad: number): void {
    if (this.jammed) return;
    this.targetYaw = wrapAnglePi(yawRad);
  }

  /**
   * Request a barrel-pitch target (radians; positive elevation, negative
   * depression). Clamped to the configured mechanical envelope.
   *
   * No-op when the turret is jammed.
   */
  setTargetPitch(pitchRad: number): void {
    if (this.jammed) return;
    this.targetPitch = clamp(pitchRad, this.config.pitchLimits.min, this.config.pitchLimits.max);
  }

  /**
   * Damage-state hook (cycle-vekhikl-4-tank-turret-and-cannon R2,
   * `tank-damage-states`). When set, subsequent `setTargetYaw` /
   * `setTargetPitch` calls become no-ops: aim targets freeze at their
   * last commanded value and the barrel settles to that pose. Current
   * pose is **not** zeroed — the barrel stays where the gunner last
   * pointed it, mirroring a real turret with a hydraulic-traverse
   * mechanical failure.
   *
   * Idempotent. Flipping back to `false` resumes normal slewing toward
   * the (now stale) targets; callers can then issue fresh aim commands.
   */
  setJammed(jammed: boolean): void {
    this.jammed = jammed;
  }

  /** Whether the turret traverse / elevation drive is jammed. */
  isJammed(): boolean {
    return this.jammed;
  }

  /** Current turret yaw (radians, wrapped to (-PI, PI]). */
  getYaw(): number {
    return this.yaw;
  }

  /** Current barrel pitch (radians). */
  getPitch(): number {
    return this.barrelPitch;
  }

  /** Current target yaw (radians, wrapped to (-PI, PI]). */
  getTargetYaw(): number {
    return this.targetYaw;
  }

  /** Current target pitch (radians, after envelope clamp). */
  getTargetPitch(): number {
    return this.targetPitch;
  }

  /** Yaw limits — `null` for unconstrained 360° traverse. */
  getYawLimits(): { min: number; max: number } | null {
    return null;
  }

  /** Hard limits on barrel pitch (mechanical envelope). */
  getPitchLimits(): { min: number; max: number } {
    return { min: this.config.pitchLimits.min, max: this.config.pitchLimits.max };
  }

  /** Per-second slew limits the turret was configured with. */
  getSlewRates(): { yaw: number; pitch: number } {
    return { yaw: this.config.yawSlewRate, pitch: this.config.barrelPitchSlewRate };
  }

  // ---------- Scene-graph accessors ----------

  /** Yaw node (rotates around chassis-local Y). Mount turret meshes here. */
  getYawNode(): THREE.Object3D {
    return this.yawNode;
  }

  /** Pitch node (rotates around yaw-local X). Mount barrel/breech meshes here. */
  getPitchNode(): THREE.Object3D {
    return this.pitchNode;
  }

  // ---------- World-space queries ----------

  /**
   * Write the world-space position of the barrel tip into `target`. The
   * tip is the configured `barrelTipLocalOffset` in pitchNode-local frame
   * transformed by the chassis quaternion × turret yaw × barrel pitch.
   * Callers must ensure parent world matrices are up-to-date (e.g. by
   * stepping the scene or calling `chassis.updateMatrixWorld(true)`);
   * the tank's per-frame update writes the chassis pose so this is
   * almost always already true after `Tank.update()`.
   */
  getBarrelTipWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    this.pitchNode.updateWorldMatrix(true, false);
    target.copy(this.config.barrelTipLocalOffset).applyMatrix4(this.pitchNode.matrixWorld);
    return target;
  }

  /**
   * Write the world-space unit vector along the barrel (muzzle-forward)
   * into `target`. Direction is `pitchNode-local -Z` transformed through
   * the world matrix and normalized.
   */
  getBarrelDirectionWorld(target: THREE.Vector3): THREE.Vector3 {
    this.pitchNode.updateWorldMatrix(true, false);
    // World rotation of pitchNode applied to local-forward (-Z).
    this.pitchNode.getWorldQuaternion(_scratchQuat);
    target.copy(_scratchForward).applyQuaternion(_scratchQuat).normalize();
    return target;
  }

  // ---------- Per-frame integration ----------

  /**
   * Slew toward the requested yaw + pitch targets at the configured
   * slew rates, then write the integrated angles to the scene-graph
   * nodes. Calling with `dt <= 0` is a no-op; calling after `dispose()`
   * is a no-op.
   */
  update(dt: number): void {
    if (this.disposed || dt <= 0) return;

    const maxYawStep = this.config.yawSlewRate * dt;
    const maxPitchStep = this.config.barrelPitchSlewRate * dt;

    this.yaw = approachAngular(this.yaw, this.targetYaw, maxYawStep);
    this.barrelPitch = approachLinear(this.barrelPitch, this.targetPitch, maxPitchStep);

    // Hard-clamp pitch defensively (defends against config changes mid-run
    // — e.g. damage states that tighten the envelope).
    this.barrelPitch = clamp(this.barrelPitch, this.config.pitchLimits.min, this.config.pitchLimits.max);

    // Write to scene-graph nodes. Use Euler with YXZ order so yaw spins
    // around chassis-Y and pitch tilts around the post-yaw X axis. Two
    // setRotationFromEuler calls (one per node) keep the math local to
    // each level of the parent-child hierarchy.
    _scratchEuler.set(0, this.yaw, 0, 'YXZ');
    this.yawNode.quaternion.setFromEuler(_scratchEuler);
    _scratchEuler.set(this.barrelPitch, 0, 0, 'YXZ');
    this.pitchNode.quaternion.setFromEuler(_scratchEuler);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Detach from chassis hierarchy; if a caller parented meshes under
    // yawNode / pitchNode, those follow the detach (intentional —
    // disposing the turret disposes the rig).
    this.pitchNode.removeFromParent();
    this.yawNode.removeFromParent();
  }
}
