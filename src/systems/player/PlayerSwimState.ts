import * as THREE from 'three';
import type {
  WaterInteractionOptions,
  WaterInteractionSample,
} from '../environment/water/WaterSurfaceSampler';

/**
 * Pure swim/wade/walk state machine driven by
 * `WaterSystem.sampleWaterInteraction(headPosition).submerged`.
 *
 * Owned by `PlayerMovement` and updated once per fixed step. Reports a swim
 * velocity (3D, no gravity, depth-scaled drag), the next locomotion mode,
 * and breath/stamina scalars for the HUD + health systems.
 *
 * No allocations in the hot path; no DOM / Three.js scene access. Tests
 * supply a lightweight `WaterSampler` stub instead of pulling in the real
 * WaterSystem (renderer, AssetLoader, hydrology surfaces).
 */

// ---------- Public contract ----------

export type LocomotionMode = 'walk' | 'wade' | 'swim';

/**
 * Minimal sampler surface required by the swim state. The real
 * `WaterSystem` satisfies this directly; tests pass a stub.
 */
export interface WaterSampler {
  sampleWaterInteraction(
    position: THREE.Vector3,
    options?: WaterInteractionOptions,
  ): WaterInteractionSample;
}

export interface SwimInputIntent {
  /** Camera-relative forward intent in [-1, 1] (W positive, S negative). */
  forward: number;
  /** Camera-relative strafe intent in [-1, 1] (D positive, A negative). */
  strafe: number;
  /** Whether the up control is held (Space). */
  ascend: boolean;
  /** Whether the down control is held (Ctrl). */
  descend: boolean;
}

export interface SwimUpdateContext {
  /** Player body position (feet). Reused by integrator; do not mutate. */
  position: THREE.Vector3;
  /** Head position (eye level). Sampled for submerged check + breath timer. */
  headPosition: THREE.Vector3;
  /** Camera basis. Forward/right read once per tick. */
  camera: THREE.Camera;
  /** Swim base speed in m/s. */
  baseSpeed: number;
  /** Player input intent for the tick. */
  input: SwimInputIntent;
  /** Frame dt in seconds. */
  dt: number;
}

export interface SwimUpdateResult {
  /** Next locomotion mode. Walk -> wade -> swim -> wade -> walk transitions. */
  mode: LocomotionMode;
  /** True iff transitioning from a submerged mode back to walk. Triggers gasp + HUD hide. */
  surfacedThisStep: boolean;
  /** Latest water sample (head). Reused by callers (footstep, HUD, audio). */
  headSample: WaterInteractionSample;
}

export interface SwimVelocityResult {
  /** Computed 3D swim velocity for this tick. Caller writes into player velocity. */
  velocity: THREE.Vector3;
}

export interface BreathState {
  /** Remaining breath in seconds. Drains while submerged, regens otherwise. */
  remainingSeconds: number;
  /** Max breath capacity, baseline 45s. */
  capacitySeconds: number;
  /** True iff the gasp + drowning damage trigger has fired this submersion. */
  gasping: boolean;
}

export interface StaminaState {
  /** Remaining stamina in [0, 1]. Drains while swimming, regens while walking. */
  remaining01: number;
}

// ---------- Tuning constants (behavior knobs, not test asserts) ----------

/** Breath capacity before the gasp + drowning damage trigger fires. */
export const BREATH_CAPACITY_SECONDS = 45;
/** Damage applied per second after the gasp trigger fires. */
export const DROWNING_DAMAGE_PER_SECOND = 8;
/** Breath regen rate (seconds of breath per real second above water). */
export const BREATH_REGEN_RATE = 18;
/** Stamina drain rate while actively swimming (per second). */
export const SWIM_STAMINA_DRAIN_PER_SECOND = 0.12;
/** Stamina regen rate while walking (per second). */
export const SWALK_STAMINA_REGEN_PER_SECOND = 0.18;
/** Vertical ascend / descend speed (m/s) — Space up, Ctrl down. */
export const SWIM_VERTICAL_SPEED = 3.5;
/** Drag scalar applied per second when swimming, scaled by immersion01. */
export const SWIM_DRAG_PER_SECOND = 2.2;
/** Immersion01 (head-sample) below which we treat as wade. */
export const WADE_IMMERSION_THRESHOLD = 0.05;
/**
 * Per-second blend toward the head-sample's river flow vector while swimming.
 * Below SWIM_DRAG_PER_SECOND so the swimmer can still steer cross-current
 * while drifting downstream (target: visible meters of drift across A Shau).
 */
export const SWIM_FLOW_PUSH_PER_SECOND = 1.2;

// ---------- Scratch vectors (module-local; no per-call allocation) ----------

const _camForward = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _velocity = new THREE.Vector3();
const _zeroFlow = new THREE.Vector3();

// ---------- State holder ----------

export class PlayerSwimState {
  private mode: LocomotionMode = 'walk';
  private wasSubmerged = false;
  private readonly velocity = _velocity;
  private readonly lastFlow = new THREE.Vector3();
  private breath: BreathState = {
    remainingSeconds: BREATH_CAPACITY_SECONDS,
    capacitySeconds: BREATH_CAPACITY_SECONDS,
    gasping: false,
  };
  private stamina: StaminaState = { remaining01: 1 };
  private gaspEdgeArmed = false;

  getMode(): LocomotionMode {
    return this.mode;
  }

  getBreath(): Readonly<BreathState> {
    return this.breath;
  }

  getStamina(): Readonly<StaminaState> {
    return this.stamina;
  }

  /**
   * Step the state machine. Mutates internal mode / breath / stamina, returns
   * the resulting mode + transition flags. Velocity is computed separately via
   * `computeSwimVelocity` so callers can integrate without paying for vector
   * math when not in swim mode.
   */
  tick(
    sampler: WaterSampler,
    ctx: SwimUpdateContext,
  ): SwimUpdateResult {
    const sample = sampler.sampleWaterInteraction(ctx.headPosition);
    const submerged = sample.submerged;
    let nextMode: LocomotionMode;
    if (submerged) {
      nextMode = 'swim';
    } else if (sample.immersion01 > WADE_IMMERSION_THRESHOLD) {
      nextMode = 'wade';
    } else {
      nextMode = 'walk';
    }

    const surfacedThisStep = this.wasSubmerged && !submerged;

    // Stamina: drain while swimming, regen while walking.
    if (nextMode === 'swim') {
      this.stamina.remaining01 = Math.max(
        0,
        this.stamina.remaining01 - SWIM_STAMINA_DRAIN_PER_SECOND * ctx.dt,
      );
    } else if (nextMode === 'walk') {
      this.stamina.remaining01 = Math.min(
        1,
        this.stamina.remaining01 + SWALK_STAMINA_REGEN_PER_SECOND * ctx.dt,
      );
    }

    // Breath: drain while head submerged, regen otherwise.
    if (submerged) {
      this.breath.remainingSeconds = Math.max(
        0,
        this.breath.remainingSeconds - ctx.dt,
      );
      // Gasp + drowning damage trigger fires once when breath hits zero;
      // the trigger stays armed until the player resurfaces.
      if (this.breath.remainingSeconds <= 0 && !this.gaspEdgeArmed) {
        this.breath.gasping = true;
        this.gaspEdgeArmed = true;
      }
    } else {
      this.breath.remainingSeconds = Math.min(
        this.breath.capacitySeconds,
        this.breath.remainingSeconds + BREATH_REGEN_RATE * ctx.dt,
      );
      if (surfacedThisStep) {
        this.breath.gasping = false;
        this.gaspEdgeArmed = false;
      }
    }

    // Capture the latest flow vector so `computeSwimVelocity` can push the
    // player downstream without a second sample. Zero outside hydrology
    // channels; the swim integrator treats (0,0,0) as a no-op.
    this.lastFlow.copy(sample.flowVelocity ?? _zeroFlow);

    this.mode = nextMode;
    this.wasSubmerged = submerged;
    return { mode: nextMode, surfacedThisStep, headSample: sample };
  }

  /**
   * Compute a 3D swim velocity from camera basis + input intent. Only valid
   * while in swim mode; callers should branch on `tick().mode === 'swim'`.
   * Velocity is reused across calls (scratch) — copy if you need to retain.
   */
  computeSwimVelocity(ctx: SwimUpdateContext, currentVelocity: THREE.Vector3): THREE.Vector3 {
    // Camera-relative horizontal basis (project forward onto XZ plane).
    ctx.camera.getWorldDirection(_camForward);
    _camForward.y = 0;
    if (_camForward.lengthSq() < 1e-6) {
      _camForward.set(0, 0, -1);
    }
    _camForward.normalize();
    _camRight.crossVectors(_camForward, _up).normalize();

    // Target velocity from input intent + base speed.
    this.velocity.set(0, 0, 0);
    this.velocity.addScaledVector(_camForward, ctx.input.forward * ctx.baseSpeed);
    this.velocity.addScaledVector(_camRight, ctx.input.strafe * ctx.baseSpeed);

    // Vertical: Space ascends, Ctrl descends. Both held cancels out.
    let verticalIntent = 0;
    if (ctx.input.ascend) verticalIntent += 1;
    if (ctx.input.descend) verticalIntent -= 1;
    this.velocity.y = verticalIntent * SWIM_VERTICAL_SPEED;

    // Apply exponential drag against current velocity so coasting decays.
    // Drag scales with immersion at the head — denser water = more drag.
    const headImmersion = Math.max(0, Math.min(1, this.wasSubmerged ? 1 : 0));
    const dragK = SWIM_DRAG_PER_SECOND * (0.5 + 0.5 * headImmersion);
    const dragFactor = Math.exp(-dragK * ctx.dt);
    this.velocity.x = currentVelocity.x * dragFactor + this.velocity.x * (1 - dragFactor);
    this.velocity.z = currentVelocity.z * dragFactor + this.velocity.z * (1 - dragFactor);
    // Vertical: blend toward intent so divers don't snap.
    this.velocity.y = currentVelocity.y * dragFactor + this.velocity.y * (1 - dragFactor);

    // River flow push: in a hydrology channel the head sample carries a
    // non-zero `flowVelocity`. Blend horizontal velocity toward flow at a
    // gentle rate so swimming perpendicular to the current visibly drifts
    // downstream without making the player feel pinned. Outside channels
    // `lastFlow` is (0,0,0), so this reduces to a no-op.
    const flowBlend = 1 - Math.exp(-SWIM_FLOW_PUSH_PER_SECOND * ctx.dt);
    this.velocity.x += (this.lastFlow.x - this.velocity.x) * flowBlend;
    this.velocity.z += (this.lastFlow.z - this.velocity.z) * flowBlend;
    return this.velocity;
  }

  /**
   * Hard reset (respawn / mode switch). Restores breath + stamina to full,
   * clears any pending gasp trigger, and returns the player to walk mode.
   */
  reset(): void {
    this.mode = 'walk';
    this.wasSubmerged = false;
    this.breath.remainingSeconds = this.breath.capacitySeconds;
    this.breath.gasping = false;
    this.stamina.remaining01 = 1;
    this.gaspEdgeArmed = false;
    this.lastFlow.set(0, 0, 0);
  }

  /**
   * Consume the gasp flag. Returns true exactly once per drown trigger so the
   * caller can play SFX + apply damage without re-firing each frame.
   */
  consumeGasp(): boolean {
    if (this.breath.gasping) {
      this.breath.gasping = false;
      return true;
    }
    return false;
  }

  /**
   * True while breath is depleted AND head still submerged. Caller applies
   * `DROWNING_DAMAGE_PER_SECOND * dt` to player health while this holds.
   */
  isDrowning(): boolean {
    return this.gaspEdgeArmed && this.wasSubmerged;
  }
}
