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
import type { SeatRole } from './IVehicle';
import type { Tank } from './Tank';
import { TankTurret } from './TankTurret';

// ── Turret aim / camera tuning ──
const MOUSE_AIM_SENSITIVITY = 0.0022; // radians per mouse-pixel (yaw + pitch)
const TOUCH_AIM_DEADZONE = 0.05;
const TOUCH_AIM_SENSITIVITY = 1.2; // radians/sec at full deflection (slower than M2HB — bigger gun)
const DEFAULT_EXIT_SIDE_OFFSET_M = 3.0; // metres to the +X side of chassis on dismount fallback
const DEFAULT_SIGHT_FORWARD_OFFSET = 0.25; // metres ahead of barrel tip along sight line
const DEFAULT_SIGHT_UP_OFFSET = 0.0; // metres above barrel tip (gunner sight is barrel-axis)

function createTankGunnerUIContext(): VehicleUIContext {
  // Gunner POV reuses the 'turret' HUD bucket (same as M2HB tripod); the
  // tank-specific gunner HUD lands in a follow-up cycle once the cannon
  // round counter + lead-prediction reticule exist.
  return {
    kind: 'turret',
    role: 'gunner',
    hudVariant: 'turret',
    weaponCount: 1,
    capabilities: {
      canExit: true,
      canFirePrimary: true,
      canCycleWeapons: false,
      canFreeLook: false, // barrel-locked POV (gunner sight)
      canStabilize: false,
      canDeploySquad: false,
      canOpenMap: true,
      canOpenCommand: true,
    },
  };
}

const _scratchSide = new THREE.Vector3();
const _scratchTip = new THREE.Vector3();
const _scratchDir = new THREE.Vector3();

/**
 * Tank gunner player adapter — M48 90 mm cannon seat.
 *
 * Mirrors `EmplacementPlayerAdapter` (cycle #6) in lifecycle + input shape,
 * and `TankPlayerAdapter` (cycle #8) in chassis binding. Per the cycle brief:
 *
 *   1. Player seats via existing `IVehicle.enterVehicle(_, 'gunner')`.
 *   2. Mouse drives turret yaw + barrel pitch (within cap).
 *   3. LMB fires cannon — but R2 wires `tank-cannon-projectile`. The fire
 *      input is exposed via `consumeFireRequest(): boolean` (latched once
 *      per held frame, like `EmplacementPlayerAdapter`); R2 + the
 *      `tank-ai-gunner-route` task will poll this.
 *   4. Camera: gunner sight first-person (down barrel sights).
 *   5. Pilot ↔ gunner seat swap: existing `enterVehicle` accepts the role;
 *      this adapter advertises `playerSeat = 'gunner'` so the session
 *      controller can request the right seat on enter.
 *
 * Input mapping:
 *   Mouse XY            -> turret yaw / barrel pitch slew (turret clamps)
 *   Left-click / Space  -> fire (latched request; R2 cannon wiring reads it)
 *   F (handled by VehicleSessionController) -> mount / dismount
 *
 * Camera: first-person pinned along the barrel, sitting just behind the
 * muzzle tip and looking along the barrel direction. The integration layer
 * reads `computeGunnerSightCamera()` to drive `PlayerCamera`.
 *
 * The adapter binds to a concrete `Tank` instance plus an `ITankTurretModel`
 * at construction time. The turret-model stub lets this adapter ship in
 * parallel with `tank-turret-rig`; the orchestrator-driven swap step
 * replaces `ITankTurretModel` with the real `TankTurret` once both merge.
 */
export class TankGunnerAdapter implements PlayerVehicleAdapter {
  readonly vehicleType = 'tank_gunner';
  // Gunner shares the gameplay input context; weapon-fire suppression is
  // handled by the session controller via the VehicleUIContext.
  readonly inputContext: InputContext = 'gameplay';

  // Player seat for the gunner position. Kept public so the session
  // controller / integration layer can read it when planning seat
  // assignments (pilot ↔ gunner swap goes via `enterVehicle(_, this.playerSeat)`).
  readonly playerSeat: SeatRole = 'gunner';

  // Aim sensitivity (mutable so the integration layer / settings can retune).
  mouseSensitivity = MOUSE_AIM_SENSITIVITY;
  sightForwardOffset = DEFAULT_SIGHT_FORWARD_OFFSET;
  sightUpOffset = DEFAULT_SIGHT_UP_OFFSET;

  private readonly chassis: Tank;
  private readonly turret: TankTurret;
  private mounted = false;
  private fireRequested = false;

  constructor(chassis: Tank, turret: TankTurret) {
    this.chassis = chassis;
    this.turret = turret;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  onEnter(ctx: VehicleTransitionContext): void {
    this.resetControlState();
    this.mounted = true;

    // Player out of infantry motion, snapped onto the gunner station.
    ctx.playerState.velocity.set(0, 0, 0);
    ctx.playerState.isRunning = false;
    ctx.setPosition(ctx.position, 'tank.gunner.enter');

    // Tank is a ground vehicle — clear any leftover flight bookkeeping
    // (same defensive pattern the pilot adapter uses).
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
    hudSystem?.setVehicleContext?.(createTankGunnerUIContext());

    if (ctx.gameRenderer) {
      ctx.gameRenderer.setCrosshairMode('infantry');
    }

    // Re-acquire pointer lock so mouse-look (turret aim) keeps working.
    if (typeof ctx.input.relockPointer === 'function') {
      ctx.input.relockPointer();
    }
  }

  onExit(ctx: VehicleTransitionContext): void {
    ctx.setPosition(ctx.position, 'tank.gunner.exit');

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
    // Default: eject on the +X side of the chassis (matches pilot adapter's
    // default; the +X side clears the engine deck and the track skirt).
    // Direction respects the tank's current yaw so the player doesn't land
    // inside the chassis after a turn. The gunner-seat exitOffset declared
    // in `Tank.DEFAULT_M48_SEATS` is (+2.6, 0, 0), which collapses to this
    // same side-step for an identity quaternion — we use the chassis-yaw
    // composition explicitly so any future seat-offset edits propagate.
    _scratchSide.set(DEFAULT_EXIT_SIDE_OFFSET_M, 0, 0).applyQuaternion(this.chassis.quaternion);
    const exitPos = this.chassis.position.clone().add(_scratchSide);
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

  /** Returns the bound tank's vehicleId while mounted, else null. */
  getActiveVehicleId(): string | null {
    return this.mounted ? this.chassis.id : null;
  }

  /**
   * Consumes a pending fire request, returning true exactly once per
   * frame that fire input was held. The R2 cannon-integration task
   * (`tank-cannon-projectile` wiring) polls this from its per-frame
   * update; the same surface is reused by `tank-ai-gunner-route` so
   * NPC and player fire paths converge on one contract.
   */
  consumeFireRequest(): boolean {
    const v = this.fireRequested;
    this.fireRequested = false;
    return v;
  }

  /**
   * Compute a first-person gunner-sight camera pose (eye sits just behind
   * the muzzle, looking down the barrel). Writes into the provided vectors
   * and returns true on success. The integration layer calls this once per
   * frame to drive `PlayerCamera`.
   *
   * Sourced from the turret model's `getBarrelTipWorldPosition` +
   * `getBarrelDirectionWorld` so the camera tracks the rendered turret
   * pose exactly — no double-derivation of yaw/pitch math here.
   */
  computeGunnerSightCamera(
    outPosition: THREE.Vector3,
    outLookTarget: THREE.Vector3,
  ): boolean {
    if (!this.mounted) return false;
    this.turret.getBarrelTipWorldPosition(_scratchTip);
    this.turret.getBarrelDirectionWorld(_scratchDir);

    // Eye sits a hair ahead of the muzzle along the barrel direction so the
    // player view is on-axis with the bore (gunner-sight POV), then lifted
    // by `sightUpOffset` if a future scope-rise is needed.
    outPosition.copy(_scratchTip);
    outPosition.addScaledVector(_scratchDir, this.sightForwardOffset);
    outPosition.y += this.sightUpOffset;

    // Look-target is one metre further along the barrel; this gives
    // `PlayerCamera.lookAt(outLookTarget)` a stable forward vector.
    outLookTarget.copy(outPosition).addScaledVector(_scratchDir, 1);
    return true;
  }

  // ── Input plumbing ─────────────────────────────────────────────────────────

  private readAimInput(input: PlayerInput, deltaTime: number): void {
    if (!this.mounted) return;

    let dYaw = 0;
    let dPitch = 0;

    // Touch path: virtual right-stick steers the turret.
    const touch = input.getTouchControls?.();
    if (touch) {
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
        // Mouse-x → yaw (right swing = +yaw to the gunner's right, matching
        // the convention used by EmplacementPlayerAdapter — sign flipped so
        // right drag turns the turret right).
        dYaw += -m.x * this.mouseSensitivity;
        // Mouse-y → pitch (up drag = look up = +pitch).
        dPitch += -m.y * this.mouseSensitivity;
        input.clearMouseMovement();
      }
    }

    if (dYaw !== 0 || dPitch !== 0) {
      // Accumulate against the turret's current achieved aim and let the
      // turret model enforce its own yaw envelope (null = 360°) and pitch
      // envelope. The turret owns slew rate and clamping; the adapter just
      // forwards intent — same separation `EmplacementPlayerAdapter` keeps
      // for the M2HB Emplacement.
      this.turret.setTargetYaw(this.turret.getYaw() + dYaw);
      this.turret.setTargetPitch(this.turret.getPitch() + dPitch);
    }
  }

  private readFireInput(input: PlayerInput): void {
    // Left-click is exposed by PlayerInput via the same mouse-button
    // surface used by `EmplacementPlayerAdapter`; fall back to Space when
    // mouse fire is unavailable (consistency with M2HB so R2 cannon
    // wiring can share a single fire-poll contract).
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
