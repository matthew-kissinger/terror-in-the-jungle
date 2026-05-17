import * as THREE from 'three';
import type { IHUDSystem } from '../../types/SystemInterfaces';
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
import type { Emplacement } from './Emplacement';

// ── Emplacement aim / camera tuning ──
const MOUSE_AIM_SENSITIVITY = 0.0022; // radians per mouse-pixel (yaw + pitch)
const TOUCH_AIM_DEADZONE = 0.05;
const TOUCH_AIM_SENSITIVITY = 1.6; // radians/sec at full deflection
const DEFAULT_EXIT_OFFSET_M = 1.8; // metres to the +X side of mount on dismount fallback
const DEFAULT_CAMERA_FORWARD_OFFSET = 0.15; // metres ahead of mount along barrel
const DEFAULT_CAMERA_UP_OFFSET = 0.05; // metres above mount (eye-line on sights)

function createEmplacementUIContext(): VehicleUIContext {
  return {
    kind: 'turret',
    role: 'gunner',
    hudVariant: 'turret',
    weaponCount: 1,
    capabilities: {
      canExit: true,
      canFirePrimary: true,
      canCycleWeapons: false,
      canFreeLook: false, // barrel-locked POV
      canStabilize: false,
      canDeploySquad: false,
      canOpenMap: true,
      canOpenCommand: true,
    },
  };
}

const _scratchMount = new THREE.Vector3();
const _scratchForward = new THREE.Vector3();

/**
 * Emplacement (stationary heavy-weapon) player adapter — M2HB tripod MVP.
 *
 * Mirrors `GroundVehiclePlayerAdapter` and `HelicopterPlayerAdapter`:
 * owns control state, orchestrates enter/exit/update, and forwards aim
 * input into the bound `Emplacement` instance. Firing input is surfaced
 * via `consumeFireRequest()` for the R2 weapon integration to consume;
 * this adapter does not call any weapon API directly.
 *
 * Input mapping:
 *   Mouse XY            -> yaw / pitch slew (model clamps to its slew-rate caps)
 *   Left-click / Space  -> fire (latched request; R2 wiring reads it)
 *   F (handled by VehicleSessionController) -> mount / dismount
 *
 * The adapter holds a per-instance `Emplacement` (assigned at construction
 * time by the integration layer). Aim is forwarded by accumulating deltas
 * against the model's current target aim and calling `setAim()` — the
 * Emplacement owns slew rate caps and pitch/yaw envelope clamping.
 *
 * Camera: first-person, pinned to the emplacement mount point and
 * looking along the barrel. The integration layer reads
 * `computeBarrelCamera()` to drive `PlayerCamera`.
 */
export class EmplacementPlayerAdapter implements PlayerVehicleAdapter {
  readonly vehicleType = 'emplacement';
  // Emplacements share the gameplay input context; weapon-fire suppression
  // is handled by the session controller via the VehicleUIContext.
  readonly inputContext: InputContext = 'gameplay';

  // Aim sensitivity (mutable so the integration layer / settings can retune).
  mouseSensitivity = MOUSE_AIM_SENSITIVITY;
  cameraForwardOffset = DEFAULT_CAMERA_FORWARD_OFFSET;
  cameraUpOffset = DEFAULT_CAMERA_UP_OFFSET;

  private readonly model: Emplacement;
  private mounted = false;
  private fireRequested = false;

  constructor(model: Emplacement) {
    this.model = model;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onEnter(ctx: VehicleTransitionContext): void {
    this.resetControlState();
    this.mounted = true;

    // Take the player off their feet and snap them onto the gunner seat.
    ctx.playerState.velocity.set(0, 0, 0);
    ctx.playerState.isRunning = false;
    _scratchMount.copy(this.model.getPosition());
    ctx.setPosition(_scratchMount.clone(), 'emplacement.enter');

    // Emplacement is a ground-mounted system — clear any leftover flight
    // bookkeeping the same way the ground-vehicle adapter does.
    if (typeof ctx.input.setFlightVehicleMode === 'function') {
      ctx.input.setFlightVehicleMode('none');
    } else {
      ctx.input.setInHelicopter(false);
    }
    if ('setInputContext' in ctx.input) {
      (ctx.input as any).setInputContext('gameplay');
    }

    // Save infantry look angles so the camera restores cleanly on dismount.
    ctx.cameraController.saveInfantryAngles();

    const hudSystem = ctx.hudSystem as IHUDSystem | undefined;
    hudSystem?.setVehicleContext?.(createEmplacementUIContext());

    if (ctx.gameRenderer) {
      ctx.gameRenderer.setCrosshairMode('infantry');
    }

    if (typeof ctx.input.relockPointer === 'function') {
      ctx.input.relockPointer();
    }
  }

  onExit(ctx: VehicleTransitionContext): void {
    ctx.setPosition(ctx.position, 'emplacement.exit');

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

    this.mounted = false;
    this.resetControlState();
  }

  getExitPlan(_ctx: VehicleTransitionContext, _options: VehicleExitOptions): VehicleExitPlan {
    // Prefer the configured gunner-seat exit offset (Emplacement carries it
    // per-seat). Fall back to a sideways step from the mount when no
    // gunner seat exists (defensive — DEFAULT_SEATS always includes one).
    const gunnerSeat = this.model.getSeats().find(seat => seat.role === 'gunner');
    const mount = this.model.getPosition();
    const exitPos = mount.clone();
    if (gunnerSeat) {
      exitPos.add(gunnerSeat.exitOffset);
    } else {
      exitPos.x += DEFAULT_EXIT_OFFSET_M;
    }
    return {
      canExit: true,
      mode: 'normal',
      position: exitPos,
    };
  }

  update(ctx: VehicleUpdateContext): void {
    if (!this.mounted) return;

    this.readAimInput(ctx.input, ctx.deltaTime);
    this.readFireInput(ctx.input);
  }

  resetControlState(): void {
    this.fireRequested = false;
  }

  // ── Public accessors (for integration + tests) ─────────────────────────────

  /** Returns the bound emplacement's vehicleId while mounted, else null. */
  getActiveEmplacementId(): string | null {
    return this.mounted ? this.model.vehicleId : null;
  }

  /**
   * Consumes a pending fire request, returning true exactly once per
   * frame that fire input was held. The R2 weapon-integration task
   * polls this from its per-frame update; once the M2HB weapon is
   * wired, this becomes the fire trigger.
   */
  consumeFireRequest(): boolean {
    const v = this.fireRequested;
    this.fireRequested = false;
    return v;
  }

  /**
   * Compute a first-person camera pose pinned to the mount point and
   * looking along the barrel. Writes into the provided vectors and
   * returns true on success. The integration layer calls this once per
   * frame to drive `PlayerCamera`.
   */
  computeBarrelCamera(
    outPosition: THREE.Vector3,
    outLookTarget: THREE.Vector3,
  ): boolean {
    if (!this.mounted) return false;
    _scratchMount.copy(this.model.getPosition());

    // Derive forward from yaw + pitch. Y-up, yaw around Y, pitch around
    // local X. Forward when yaw=0, pitch=0 is world -Z (Three.js convention).
    const yaw = this.model.getYaw();
    const pitch = this.model.getPitch();
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    _scratchForward.set(-sy * cp, sp, -cy * cp);

    // Sit the eye at the mount, lifted slightly to the sights line, and
    // nudged a hair forward so the player's view doesn't clip the
    // breech model. Look-target is one metre out along the barrel.
    outPosition.copy(_scratchMount);
    outPosition.y += this.cameraUpOffset;
    outPosition.addScaledVector(_scratchForward, this.cameraForwardOffset);

    outLookTarget.copy(outPosition).addScaledVector(_scratchForward, 1);
    return true;
  }

  // ── Input plumbing ─────────────────────────────────────────────────────────

  private readAimInput(input: PlayerInput, deltaTime: number): void {
    if (!this.mounted) return;

    let dYaw = 0;
    let dPitch = 0;

    // Touch path: virtual right-stick steers the barrel.
    const touch = input.getTouchControls?.();
    if (touch) {
      // Reuse the cyclic input convention the helicopter adapter does;
      // touch joystick magnitudes are already in [-1, 1].
      const cyc = typeof input.getTouchFlightCyclicInput === 'function'
        ? input.getTouchFlightCyclicInput()
        : (typeof (input as any).getTouchCyclicInput === 'function'
          ? (input as any).getTouchCyclicInput()
          : { pitch: 0, roll: 0 });
      if (Math.abs(cyc.roll) > TOUCH_AIM_DEADZONE) {
        dYaw += cyc.roll * TOUCH_AIM_SENSITIVITY * deltaTime;
      }
      if (Math.abs(cyc.pitch) > TOUCH_AIM_DEADZONE) {
        dPitch += cyc.pitch * TOUCH_AIM_SENSITIVITY * deltaTime;
      }
    } else if (input.getIsPointerLocked()) {
      const m = input.getMouseMovement();
      if (m && (m.x !== 0 || m.y !== 0)) {
        // Mouse-x → yaw (right swing = +yaw to the gunner's right,
        // matching our world convention of yaw increasing CCW around Y;
        // sign flipped so right drag turns the barrel right).
        dYaw += -m.x * this.mouseSensitivity;
        // Mouse-y → pitch (up drag = look up = +pitch).
        dPitch += -m.y * this.mouseSensitivity;
        input.clearMouseMovement();
      }
    }

    if (dYaw !== 0 || dPitch !== 0) {
      // Real Emplacement uses absolute setAim; accumulate against the
      // model's current target. Emplacement clamps to pitch/yaw envelope
      // and walks toward the target at its configured slew rate.
      const cur = this.model.getTargetAim();
      this.model.setAim(cur.yaw + dYaw, cur.pitch + dPitch);
    }
  }

  private readFireInput(input: PlayerInput): void {
    // Left-click is exposed by PlayerInput via the same mouse-button
    // surface used elsewhere; fall back to Space when mouse fire is
    // unavailable (mirrors the existing infantry weapon binding).
    let fire = false;
    const anyInput = input as unknown as {
      isMouseButtonPressed?: (b: number) => boolean;
      getMouseButton?: (b: number) => boolean;
    };
    if (typeof anyInput.isMouseButtonPressed === 'function') {
      fire = anyInput.isMouseButtonPressed(0) === true;
    } else if (typeof anyInput.getMouseButton === 'function') {
      fire = anyInput.getMouseButton(0) === true;
    }
    if (!fire && typeof input.isKeyPressed === 'function') {
      fire = input.isKeyPressed('space');
    }
    if (fire) this.fireRequested = true;
  }
}
