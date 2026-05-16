import * as THREE from 'three';
import type { GroundVehicleControls, GroundVehiclePhysics } from './GroundVehiclePhysics';
import type { ITerrainRuntime, IHUDSystem } from '../../types/SystemInterfaces';
import type { PlayerInput } from '../player/PlayerInput';
import type {
  PlayerVehicleAdapter,
  VehicleExitOptions,
  VehicleExitPlan,
  VehicleTransitionContext,
  VehicleUpdateContext,
} from './PlayerVehicleAdapter';
import type { InputContext } from '../input/InputContextManager';
import type { VehicleUIContext } from '../../ui/layout/types';

// ── Ground-vehicle control tuning ──
const TOUCH_DEADZONE = 0.1;
const DEFAULT_BRAKE_PEDAL = 1.0;

/**
 * Minimal contract the adapter needs from the integration layer. The
 * integration task (`m151-jeep-integration`) wires the concrete
 * `GroundVehicle` + `GroundVehiclePhysics` instance to satisfy this.
 *
 * Kept local to avoid leaking a new fenced interface; the helicopter
 * adapter follows the same pattern via `IHelicopterModel`.
 */
export interface IGroundVehicleModel {
  /** Returns true and writes world-space position when the vehicle exists. */
  getVehiclePositionTo(vehicleId: string, target: THREE.Vector3): boolean;
  /** Returns true and writes world-space orientation when the vehicle exists. */
  getVehicleQuaternionTo(vehicleId: string, target: THREE.Quaternion): boolean;
  /** Returns the live physics instance for the named vehicle, or null. */
  getPhysics(vehicleId: string): GroundVehiclePhysics | null;
  /** Computes where to eject the player on a normal exit. */
  getPlayerExitPlan?(vehicleId: string): VehicleExitPlan | null;
  /** Toggles the engine on entry/exit so RPM spools up/down cosmetically. */
  setEngineActive?(vehicleId: string, active: boolean): void;
}

function createGroundUIContext(): VehicleUIContext {
  return {
    kind: 'car',
    role: 'driver',
    hudVariant: 'groundVehicle',
    weaponCount: 0,
    capabilities: {
      canExit: true,
      canFirePrimary: false,
      canCycleWeapons: false,
      canFreeLook: true,
      canStabilize: false,
      canDeploySquad: false,
      canOpenMap: true,
      canOpenCommand: true,
    },
  };
}

const _scratchVec = new THREE.Vector3();

/**
 * Ground-vehicle player adapter (M151 jeep MVP).
 *
 * Mirrors the shape of `HelicopterPlayerAdapter`: owns control state,
 * orchestrates enter/exit/update lifecycle, and forwards keyboard /
 * touch inputs into `GroundVehiclePhysics.setControls()`.
 *
 * Input mapping (per cycle-vekhikl-1-jeep-drivable):
 *   W / S      -> throttle  (+1 forward, -1 reverse)
 *   A / D      -> steer     (full-lock at `maxSteer` configured on physics)
 *   Space      -> brake     (1.0 when held)
 *   F (handled by VehicleSessionController) -> enter / exit
 *
 * Camera: third-person follow. The adapter exposes a pose helper
 * (`computeThirdPersonCamera`) the `PlayerCamera` integration consumes;
 * no new generalized camera primitive is introduced here.
 */
export class GroundVehiclePlayerAdapter implements PlayerVehicleAdapter {
  readonly vehicleType = 'ground';
  // No dedicated 'ground' input context today; gameplay context permits
  // movement keys + fire suppression as needed by the session controller.
  readonly inputContext: InputContext = 'gameplay';

  // Third-person follow tuning (jeep-sized; tank/truck adapters may override).
  cameraDistance = 7;
  cameraHeight = 3.2;
  cameraLookHeight = 1.2;

  private controls: GroundVehicleControls = {
    throttle: 0,
    steerAngle: 0,
    brake: 0,
    handbrake: false,
  };

  private readonly model: IGroundVehicleModel;
  private activeVehicleId: string | null = null;
  private activePhysics: GroundVehiclePhysics | null = null;

  constructor(model: IGroundVehicleModel) {
    this.model = model;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onEnter(ctx: VehicleTransitionContext): void {
    this.resetControlState();
    this.activeVehicleId = ctx.vehicleId;
    this.activePhysics = this.model.getPhysics(ctx.vehicleId);

    // Take the player out of infantry motion and snap them onto the seat.
    ctx.playerState.velocity.set(0, 0, 0);
    ctx.playerState.isRunning = false;
    ctx.setPosition(ctx.position, 'ground-vehicle.enter');

    // Ground vehicles share the gameplay input context. Mark any flight
    // mode bookkeeping off so leftover heli/plane flags do not linger.
    if (typeof ctx.input.setFlightVehicleMode === 'function') {
      ctx.input.setFlightVehicleMode('none');
    } else {
      ctx.input.setInHelicopter(false);
    }
    if ('setInputContext' in ctx.input) {
      (ctx.input as any).setInputContext('gameplay');
    }

    // Save infantry angles so look direction restores cleanly on exit.
    ctx.cameraController.saveInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.setVehicleContext?.(createGroundUIContext());

    if (ctx.gameRenderer) {
      ctx.gameRenderer.setCrosshairMode('infantry');
    }

    this.model.setEngineActive?.(ctx.vehicleId, true);

    // Re-acquire pointer lock so mouse-look (free orbital) keeps working.
    if (typeof ctx.input.relockPointer === 'function') {
      ctx.input.relockPointer();
    }
  }

  onExit(ctx: VehicleTransitionContext): void {
    const exitPos = ctx.position;
    ctx.setPosition(exitPos, 'ground-vehicle.exit');

    if (typeof ctx.input.setFlightVehicleMode === 'function') {
      ctx.input.setFlightVehicleMode('none');
    } else {
      ctx.input.setInHelicopter(false);
    }
    if ('setInputContext' in ctx.input) {
      (ctx.input as any).setInputContext('gameplay');
    }
    ctx.cameraController?.restoreInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.setVehicleContext?.(null);

    if (ctx.gameRenderer) {
      ctx.gameRenderer.setCrosshairMode('infantry');
    }

    if (this.activeVehicleId) {
      this.model.setEngineActive?.(this.activeVehicleId, false);
    }
    this.activeVehicleId = null;
    this.activePhysics = null;
    this.resetControlState();
  }

  getExitPlan(ctx: VehicleTransitionContext, _options: VehicleExitOptions): VehicleExitPlan {
    const modelPlan = this.model.getPlayerExitPlan?.(ctx.vehicleId);
    if (modelPlan) {
      return modelPlan;
    }
    // Default: eject on the +X side of the chassis (driver's left in our
    // M151 seat layout — passenger door clear). Fallback to ctx.position
    // when we cannot resolve the vehicle pose (e.g. force_cleanup path).
    const exitPos = ctx.position.clone();
    const pos = _scratchVec;
    if (this.model.getVehiclePositionTo(ctx.vehicleId, pos)) {
      const quat = new THREE.Quaternion();
      if (this.model.getVehicleQuaternionTo(ctx.vehicleId, quat)) {
        const sideOffset = new THREE.Vector3(2.0, 0, 0).applyQuaternion(quat);
        exitPos.copy(pos).add(sideOffset);
      } else {
        exitPos.copy(pos);
        exitPos.x += 2.0;
      }
    }
    return {
      canExit: true,
      mode: 'normal',
      position: exitPos,
    };
  }

  update(ctx: VehicleUpdateContext): void {
    if (!this.activeVehicleId) return;

    this.readInputs(ctx.input);

    // Forward smoothed intent to the physics instance, then advance the sim.
    if (this.activePhysics) {
      this.activePhysics.setControls(this.controls);
      // The session controller drives one update per frame; PhysicsManager
      // owns the actual terrain reference, so we forward null here and let
      // the integration layer call step(dt, terrain) on a dedicated update
      // pass when needed. This keeps the adapter terrain-agnostic.
    }

    // Update HUD widgets for ground vehicles (speedometer + simple status).
    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    if (hudSystem && this.activePhysics) {
      const speed = this.activePhysics.getGroundSpeed();
      const heading = this.activePhysics.getHeading();
      // Reuse the elevation slot for ground vehicles as a generic readout —
      // the helicopter HUD path uses it for AGL; here, m/s ground speed.
      hudSystem.updateElevation?.(speed);
      void heading;
    }
  }

  /**
   * Step the physics with terrain. Called by the integration layer once
   * per frame (or by tests) so the adapter never needs an `ITerrainRuntime`
   * reference of its own.
   */
  stepPhysics(deltaTime: number, terrain: ITerrainRuntime | null): void {
    if (this.activePhysics) {
      this.activePhysics.update(deltaTime, terrain);
    }
  }

  resetControlState(): void {
    this.controls.throttle = 0;
    this.controls.steerAngle = 0;
    this.controls.brake = 0;
    this.controls.handbrake = false;
  }

  // ── Accessors (for integration + tests) ────────────────────────────────────

  getControls(): Readonly<GroundVehicleControls> {
    return this.controls;
  }

  getActiveVehicleId(): string | null {
    return this.activeVehicleId;
  }

  getActivePhysics(): GroundVehiclePhysics | null {
    return this.activePhysics;
  }

  /**
   * Compute a third-person follow camera pose for the active vehicle.
   * Writes into the provided vectors and returns true on success.
   * Camera sits `cameraDistance` behind the chassis and `cameraHeight`
   * above its position, looking at the chassis center + `cameraLookHeight`.
   *
   * Mirrors the helicopter follow-camera math in `PlayerCamera`; lives on
   * the adapter so the integration layer can swap in a generalized
   * primitive later without re-doing pose math.
   */
  computeThirdPersonCamera(
    outPosition: THREE.Vector3,
    outLookTarget: THREE.Vector3,
  ): boolean {
    if (!this.activeVehicleId) return false;

    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    if (!this.model.getVehiclePositionTo(this.activeVehicleId, pos)) return false;
    if (!this.model.getVehicleQuaternionTo(this.activeVehicleId, quat)) return false;

    // GroundVehiclePhysics uses local -Z as forward; +Z is behind the chassis.
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
    outPosition.copy(pos).addScaledVector(back, this.cameraDistance);
    outPosition.y += this.cameraHeight;
    outLookTarget.copy(pos);
    outLookTarget.y += this.cameraLookHeight;
    return true;
  }

  // ── Input plumbing ─────────────────────────────────────────────────────────

  private readInputs(input: PlayerInput): void {
    const touch = input.getTouchControls?.();
    const hasTouch = !!touch;

    // --- Throttle ---
    let throttle = 0;
    if (hasTouch) {
      const move = input.getTouchMovementVector();
      if (Math.abs(move.z) > TOUCH_DEADZONE) {
        // Touch joystick: -z is forward (matches helicopter convention).
        throttle = THREE.MathUtils.clamp(-move.z, -1, 1);
      }
    } else if (input.isKeyPressed('keyw')) {
      throttle = 1;
    } else if (input.isKeyPressed('keys')) {
      throttle = -1;
    }
    this.controls.throttle = throttle;

    // --- Steering ---
    let steerNorm = 0;
    if (hasTouch) {
      const move = input.getTouchMovementVector();
      if (Math.abs(move.x) > TOUCH_DEADZONE) {
        steerNorm = THREE.MathUtils.clamp(move.x, -1, 1);
      }
    } else if (input.isKeyPressed('keya')) {
      steerNorm = -1;
    } else if (input.isKeyPressed('keyd')) {
      steerNorm = 1;
    }
    // Physics layer applies its own max-steer clamp; we pass an angle equal
    // to the normalized magnitude. The physics setControls clamps to maxSteer.
    if (this.activePhysics) {
      // Resolve maxSteer through a private field is awkward; we send a
      // generously large value and let GroundVehiclePhysics.setControls clamp.
      this.controls.steerAngle = steerNorm * Math.PI; // clamped downstream
    } else {
      this.controls.steerAngle = steerNorm * 0.6; // sensible default for tests
    }

    // --- Brake ---
    this.controls.brake = input.isKeyPressed('space') ? DEFAULT_BRAKE_PEDAL : 0;

    // --- Handbrake (reserved for future; not bound this MVP cycle) ---
    this.controls.handbrake = false;
  }
}
