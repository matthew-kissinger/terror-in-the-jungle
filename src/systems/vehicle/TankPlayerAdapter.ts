import * as THREE from 'three';
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
import type { SeatRole } from './IVehicle';
import type { Tank } from './Tank';

// ── Tank chassis control tuning ──
const TOUCH_DEADZONE = 0.1;
const DEFAULT_EXIT_SIDE_OFFSET_M = 3.0; // metres to the +X side of chassis on dismount fallback

function createTankUIContext(): VehicleUIContext {
  // Reuse 'car' / 'groundVehicle' HUD bucket — VehicleKind doesn't have a
  // dedicated 'tank' yet, and the chassis-only slice has no turret HUD.
  // Cycle #9 (turret + cannon) can introduce a 'tank' HUD variant if
  // needed; deferring keeps the fence change pressure off this cycle.
  return {
    kind: 'car',
    role: 'pilot',
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

const _scratchSide = new THREE.Vector3();

/**
 * Tank player adapter (M48 Patton chassis slice).
 *
 * Mirrors `GroundVehiclePlayerAdapter` (cycle #4) in shape and lifecycle
 * but substitutes Ackermann steering with skid-steer track-differential
 * input. Per the TANK_SYSTEMS memo, tanks are a sibling — not subclass —
 * of the wheeled chassis: same enter/exit/HUD plumbing, different
 * locomotion contract.
 *
 * Input mapping (cycle-vekhikl-3-tank-chassis):
 *   W / S      -> throttle axis (+1 forward, -1 reverse)
 *   A / D      -> turn axis (D = +1 turns right; track-differential, not steer angle)
 *   Space      -> brake (held = 1)
 *   F (handled by VehicleSessionController) -> enter / exit
 *
 * The player seat role is `'pilot'` (matches the IVehicle seat-role taxonomy
 * for the driver of a multi-seat ground vehicle). The turret + gunner seat
 * come in cycle #9.
 *
 * Camera: external orbit-tank (third-person). Same follow math as the
 * jeep adapter — distance + height tuned slightly larger for chassis size.
 * Turret first-person camera lands in cycle #9.
 *
 * The adapter binds to a concrete `Tank` instance at construction time,
 * mirroring the `EmplacementPlayerAdapter` (real Emplacement instance, no
 * registry indirection). The earlier sibling-PR stub `ITankModel` was
 * dropped on master-merge in favor of the real Tank surface.
 */
export class TankPlayerAdapter implements PlayerVehicleAdapter {
  readonly vehicleType = 'tank';
  // Tanks share the gameplay input context (movement + weapon-fire
  // suppression handled by the session controller via VehicleUIContext).
  readonly inputContext: InputContext = 'gameplay';

  // Player seat for the driver position. Kept public so the session
  // controller / integration layer can read it without reaching into
  // internals when planning seat assignments.
  readonly playerSeat: SeatRole = 'pilot';

  // Third-person follow tuning — wider/higher than the jeep to clear the
  // turret silhouette (will collide with the turret rig in cycle #9 if
  // these are too tight; chosen conservatively now).
  cameraDistance = 12;
  cameraHeight = 5.5;
  cameraLookHeight = 2.0;

  // Smoothed control axes, forwarded each frame into the tank via
  // Tank.setControls(throttle, turn, brake).
  private controls = {
    throttleAxis: 0,
    turnAxis: 0,
    brake: false,
  };

  private readonly model: Tank;
  private mounted = false;

  constructor(model: Tank) {
    this.model = model;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onEnter(ctx: VehicleTransitionContext): void {
    this.resetControlState();
    this.mounted = true;

    // Player out of infantry motion, snapped onto the driver hatch.
    ctx.playerState.velocity.set(0, 0, 0);
    ctx.playerState.isRunning = false;
    ctx.setPosition(ctx.position, 'tank.enter');

    // Tanks are ground vehicles — clear any leftover flight bookkeeping
    // (same defensive pattern the jeep adapter uses).
    if (typeof ctx.input.setFlightVehicleMode === 'function') {
      ctx.input.setFlightVehicleMode('none');
    } else {
      ctx.input.setInHelicopter(false);
    }
    if ('setInputContext' in ctx.input) {
      (ctx.input as any).setInputContext('gameplay');
    }

    // Save infantry look angles so the camera restores cleanly on exit.
    ctx.cameraController.saveInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.setVehicleContext?.(createTankUIContext());

    if (ctx.gameRenderer) {
      ctx.gameRenderer.setCrosshairMode('infantry');
    }

    // Re-acquire pointer lock so mouse-look (free orbital) keeps working.
    if (typeof ctx.input.relockPointer === 'function') {
      ctx.input.relockPointer();
    }
  }

  onExit(ctx: VehicleTransitionContext): void {
    ctx.setPosition(ctx.position, 'tank.exit');

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

    // Park the chassis: zero the driver inputs so the tank coasts to a
    // stop under the physics layer's drag rather than carrying the
    // player's last throttle into the unattended state.
    this.model.setControls(0, 0, true);

    this.mounted = false;
    this.resetControlState();
  }

  getExitPlan(_ctx: VehicleTransitionContext, _options: VehicleExitOptions): VehicleExitPlan {
    // Default: eject on the +X side of the chassis (driver hatch clear of
    // the engine deck). M48 is ~3.6 m wide so a 3 m sideways step lands
    // the player just past the track skirt. Direction respects the tank's
    // current yaw so the player doesn't land in the engine deck after a
    // turn.
    _scratchSide.set(DEFAULT_EXIT_SIDE_OFFSET_M, 0, 0).applyQuaternion(this.model.quaternion);
    const exitPos = this.model.position.clone().add(_scratchSide);
    return {
      canExit: true,
      mode: 'normal',
      position: exitPos,
    };
  }

  update(ctx: VehicleUpdateContext): void {
    if (!this.mounted) return;

    this.readInputs(ctx.input);

    // Forward intent through the Tank, which delegates straight through
    // to the TrackedVehiclePhysics layer. Signature is positional:
    // setControls(throttleAxis, turnAxis, brake).
    this.model.setControls(
      this.controls.throttleAxis,
      this.controls.turnAxis,
      this.controls.brake,
    );

    // Update HUD widgets for ground vehicles (forward speed readout).
    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    if (hudSystem) {
      // Reuse the elevation slot for ground vehicles as a generic readout —
      // the helicopter HUD uses it for AGL; here, m/s forward speed.
      hudSystem.updateElevation?.(this.model.getForwardSpeed());
    }
  }

  /**
   * Step the tank's physics with terrain. Called by the integration layer
   * once per frame (or by tests) so the adapter never needs its own
   * `ITerrainRuntime` reference. Mirrors Tank.update(dt) but with explicit
   * terrain wiring — Tank reads its own `terrain` field set via
   * `setTerrain`, so the adapter just forwards the integration step.
   */
  stepPhysics(deltaTime: number, terrain: ITerrainRuntime | null): void {
    if (!this.mounted) return;
    this.model.setTerrain(terrain);
    this.model.update(deltaTime);
  }

  resetControlState(): void {
    this.controls.throttleAxis = 0;
    this.controls.turnAxis = 0;
    this.controls.brake = false;
  }

  // ── Accessors (for integration + tests) ────────────────────────────────────

  getControls(): Readonly<{ throttleAxis: number; turnAxis: number; brake: boolean }> {
    return this.controls;
  }

  /** Returns the bound tank's vehicleId while mounted, else null. */
  getActiveVehicleId(): string | null {
    return this.mounted ? this.model.id : null;
  }

  /**
   * Compute a third-person orbit-tank camera pose for the active chassis.
   * Writes into the provided vectors and returns true on success. Camera
   * sits `cameraDistance` behind the chassis (along chassis-local +Z =
   * world-back when quaternion is identity) and `cameraHeight` above its
   * position, looking at the chassis center + `cameraLookHeight`.
   *
   * Mirrors `GroundVehiclePlayerAdapter.computeThirdPersonCamera`. The
   * turret first-person camera (cycle #9) will be a sibling helper, not
   * a replacement.
   */
  computeThirdPersonCamera(
    outPosition: THREE.Vector3,
    outLookTarget: THREE.Vector3,
  ): boolean {
    if (!this.mounted) return false;

    // TrackedVehiclePhysics uses local -Z as forward; +Z is behind the chassis.
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.model.quaternion);
    outPosition.copy(this.model.position).addScaledVector(back, this.cameraDistance);
    outPosition.y += this.cameraHeight;
    outLookTarget.copy(this.model.position);
    outLookTarget.y += this.cameraLookHeight;
    return true;
  }

  // ── Input plumbing ─────────────────────────────────────────────────────────

  private readInputs(input: PlayerInput): void {
    const touch = input.getTouchControls?.();
    const hasTouch = !!touch;

    // --- Throttle axis (W = +1, S = -1) ---
    let throttle = 0;
    if (hasTouch) {
      const move = input.getTouchMovementVector();
      if (Math.abs(move.z) > TOUCH_DEADZONE) {
        // Touch joystick: -z is forward (matches helicopter / jeep convention).
        throttle = THREE.MathUtils.clamp(-move.z, -1, 1);
      }
    } else if (input.isKeyPressed('keyw')) {
      throttle = 1;
    } else if (input.isKeyPressed('keys')) {
      throttle = -1;
    }
    this.controls.throttleAxis = throttle;

    // --- Turn axis (D = +1, A = -1) — track-differential, NOT a steer angle ---
    // TrackedVehiclePhysics composes left/right track commands as:
    //   leftCmd  = clamp(throttle - turn, -1, +1)
    //   rightCmd = clamp(throttle + turn, -1, +1)
    // So a normalized turn of +1 (D) at zero throttle pivots the chassis
    // to the right; +1 turn with +1 throttle saturates the right track at
    // full forward while the left track idles, producing a wide right arc.
    let turn = 0;
    if (hasTouch) {
      const move = input.getTouchMovementVector();
      if (Math.abs(move.x) > TOUCH_DEADZONE) {
        turn = THREE.MathUtils.clamp(move.x, -1, 1);
      }
    } else if (input.isKeyPressed('keyd')) {
      turn = 1;
    } else if (input.isKeyPressed('keya')) {
      turn = -1;
    }
    this.controls.turnAxis = turn;

    // --- Brake (Space, held) ---
    this.controls.brake = input.isKeyPressed('space');
  }
}
