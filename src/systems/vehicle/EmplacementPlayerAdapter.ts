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

// ── Emplacement aim / camera tuning ──
const MOUSE_AIM_SENSITIVITY = 0.0022; // radians per mouse-pixel (yaw + pitch)
const TOUCH_AIM_DEADZONE = 0.05;
const TOUCH_AIM_SENSITIVITY = 1.6; // radians/sec at full deflection
const DEFAULT_EXIT_OFFSET_M = 1.8; // metres to the +X side of mount on dismount
const DEFAULT_CAMERA_FORWARD_OFFSET = 0.15; // metres ahead of mount along barrel
const DEFAULT_CAMERA_UP_OFFSET = 0.05; // metres above mount (eye-line on sights)

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IEmplacementModel — STUB CONTRACT (to be removed when sibling lands)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Local structural interface describing the surface the parallel R1 task
 * `emplacement-vehicle-surface` will ship via the new
 * `src/systems/vehicle/Emplacement.ts` class. This adapter is built
 * against this stub so the two R1 PRs can land independently and then
 * be wired together in R2 (`m2hb-weapon-integration`).
 *
 * SWAP PROCEDURE (when sibling lands):
 *   1. Delete this `IEmplacementModel` interface block.
 *   2. Replace `import type { ... }` consumers below with the concrete
 *      class from `./Emplacement` if its shape matches; otherwise keep
 *      this local structural type but reference the concrete class in
 *      tests.
 *   3. Update `m2hb-weapon-integration` (R2) to also expose
 *      `setEngaging(active)` / `fire()` if not present.
 *
 * Kept local (not in `src/types/SystemInterfaces.ts`) per
 * `docs/INTERFACE_FENCE.md` default posture: no fence change required.
 * Mirrors `IGroundVehicleModel` (cycle #4) and `IHelicopterModel`
 * (HelicopterPlayerAdapter) patterns.
 */
export interface IEmplacementModel {
  /** Current barrel yaw + pitch in radians (world-space yaw, local pitch). */
  getYawPitch(emplacementId: string): { yaw: number; pitch: number } | null;

  /**
   * Apply a slew delta to the barrel. Implementation is expected to
   * clamp by its configured slew-rate caps (per brief: "capped slew
   * rates") and yaw / pitch travel limits.
   */
  applyAimDelta(emplacementId: string, deltaYaw: number, deltaPitch: number): void;

  /**
   * World-space mount point — the gunner's eye position when seated.
   * The adapter pins the camera here and looks along the barrel.
   */
  getMountPoint(emplacementId: string, target: THREE.Vector3): boolean;

  /**
   * Optional. World-space forward direction the barrel is currently
   * pointing. When omitted, the adapter derives forward from
   * `getYawPitch()` assuming Y-up + yaw-around-Y + pitch-around-local-X.
   */
  getBarrelForward?(emplacementId: string, target: THREE.Vector3): boolean;

  /** Optional. Where to eject the player on a normal exit. */
  getPlayerExitPlan?(emplacementId: string): VehicleExitPlan | null;

  /** Optional. Hint sent on enter/exit so the model can play idle/engaged anims. */
  setEngaging?(emplacementId: string, active: boolean): void;
}

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
 * input into the emplacement model. Firing input is surfaced via
 * `consumeFireRequest()` for the R2 weapon integration to consume; this
 * adapter does not call any weapon API directly.
 *
 * Input mapping:
 *   Mouse XY   -> yaw / pitch slew (model clamps to its slew-rate caps)
 *   Left-click / Space -> fire (set as latched request; R2 wiring reads it)
 *   F (handled by VehicleSessionController) -> mount / dismount
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

  private readonly model: IEmplacementModel;
  private activeEmplacementId: string | null = null;
  private fireRequested = false;

  constructor(model: IEmplacementModel) {
    this.model = model;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onEnter(ctx: VehicleTransitionContext): void {
    this.resetControlState();
    this.activeEmplacementId = ctx.vehicleId;

    // Take the player off their feet and snap them onto the gunner seat.
    ctx.playerState.velocity.set(0, 0, 0);
    ctx.playerState.isRunning = false;
    const seatPos = _scratchMount;
    const onSeat = this.model.getMountPoint(ctx.vehicleId, seatPos);
    const enterPos = onSeat ? seatPos.clone() : ctx.position;
    ctx.setPosition(enterPos, 'emplacement.enter');

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

    this.model.setEngaging?.(ctx.vehicleId, true);

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

    if (this.activeEmplacementId) {
      this.model.setEngaging?.(this.activeEmplacementId, false);
    }
    this.activeEmplacementId = null;
    this.resetControlState();
  }

  getExitPlan(ctx: VehicleTransitionContext, _options: VehicleExitOptions): VehicleExitPlan {
    const modelPlan = this.model.getPlayerExitPlan?.(ctx.vehicleId);
    if (modelPlan) return modelPlan;

    // Default: eject the gunner DEFAULT_EXIT_OFFSET_M metres to the +X
    // side of the mount point. Falls back to ctx.position when the
    // mount cannot be resolved (e.g. force_cleanup path).
    const exitPos = ctx.position.clone();
    if (this.model.getMountPoint(ctx.vehicleId, _scratchMount)) {
      exitPos.copy(_scratchMount);
      exitPos.x += DEFAULT_EXIT_OFFSET_M;
    }
    return {
      canExit: true,
      mode: 'normal',
      position: exitPos,
    };
  }

  update(ctx: VehicleUpdateContext): void {
    if (!this.activeEmplacementId) return;

    this.readAimInput(ctx.input, ctx.deltaTime);
    this.readFireInput(ctx.input);
  }

  resetControlState(): void {
    this.fireRequested = false;
  }

  // ── Public accessors (for integration + tests) ─────────────────────────────

  getActiveEmplacementId(): string | null {
    return this.activeEmplacementId;
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
    if (!this.activeEmplacementId) return false;
    if (!this.model.getMountPoint(this.activeEmplacementId, _scratchMount)) {
      return false;
    }

    // Derive forward: prefer the model's authoritative direction; fall
    // back to a yaw/pitch composition when not provided.
    let haveForward = false;
    if (this.model.getBarrelForward) {
      haveForward = this.model.getBarrelForward(this.activeEmplacementId, _scratchForward);
    }
    if (!haveForward) {
      const yp = this.model.getYawPitch(this.activeEmplacementId);
      if (!yp) return false;
      // Y-up, yaw around Y, pitch around local X. Forward when yaw=0,
      // pitch=0 is world -Z (Three.js convention).
      const cp = Math.cos(yp.pitch);
      const sp = Math.sin(yp.pitch);
      const cy = Math.cos(yp.yaw);
      const sy = Math.sin(yp.yaw);
      _scratchForward.set(-sy * cp, sp, -cy * cp);
      haveForward = true;
    }

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
    if (!this.activeEmplacementId) return;

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
      this.model.applyAimDelta(this.activeEmplacementId, dYaw, dPitch);
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
