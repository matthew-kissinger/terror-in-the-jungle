import type * as THREE from 'three';
import type { WaterInteractionOptions, WaterInteractionSample } from './WaterSurfaceSampler';

/**
 * Per-body buoyancy force consumer for `WaterSystem.sampleWaterInteraction`.
 * Hand-rolled physics — no external solver. Mirrors the GroundVehiclePhysics
 * pattern: explicit Euler step over the supplied dt with exponential damping
 * when the body is in water.
 *
 * The body contract is intentionally a structural duck-type so dropped
 * weapons, NPC ragdolls, future watercraft hulls, and tests can all satisfy
 * it without coupling to any concrete domain type.
 *
 * Force model (per call):
 *   F_buoy   = + g * ρ_water * V * buoyancyScalar        (up)
 *   F_weight = - g * m                                   (down)
 *   a        = (F_buoy + F_weight) / m
 *   v       += a * dt
 *   v       *= exp(-k * dt)         (only in water, scaled by immersion)
 *   p       += v * dt
 *
 * Cost per body: one `sampleWaterInteraction()` call + a small constant
 * number of ALU ops. No allocations in the hot path.
 */

// ---------- Public contract ----------

/**
 * Anything floatable that buoyancy can act on. Structural duck-type — do
 * NOT import this from concrete NPC / weapon / vehicle modules and do NOT
 * narrow it. R2 wade-foot-splash and the future watercraft cycle satisfy
 * this contract independently.
 */
export interface BuoyantBody {
  /** World-space position. Read for sampling; the y component is updated by integration. */
  position: THREE.Vector3;
  /** World-space linear velocity. Read and written each step. */
  velocity: THREE.Vector3;
  /** Body mass in kilograms. Read each step. */
  mass: number;
  /** Displaced volume in cubic meters when fully submerged. Read each step. */
  volume: number;
  /** Dimensionless linear drag coefficient applied per-step in water. */
  dragCoefficient: number;
}

/**
 * Minimal sampler surface required by `applyBuoyancyForce`. The real
 * `WaterSystem` satisfies this directly; tests pass a lightweight stub so
 * they do not pull in the renderer, asset loader, or DOM overlay.
 */
export interface BuoyancySamplerLike {
  sampleWaterInteraction(position: THREE.Vector3, options?: WaterInteractionOptions): WaterInteractionSample;
}

export interface BuoyancyConfig {
  /** Acceleration of gravity in m/s^2 (positive). */
  gravity: number;
  /** Density of water in kg/m^3. Fresh water default. */
  waterDensity: number;
  /**
   * Vertical clamp on linear velocity (m/s) to avoid exploding when a
   * body resurfaces from extreme depth in a single step. Mirrors the
   * stability clamps in HelicopterPhysics / GroundVehiclePhysics.
   */
  maxLinearSpeed: number;
  /**
   * Per-axis horizontal drag scale applied alongside the body's own
   * dragCoefficient when in water. Keeps lateral motion sane while
   * buoyancy oscillates vertically.
   */
  horizontalDragScale: number;
}

export const DEFAULT_BUOYANCY_CONFIG: BuoyancyConfig = {
  gravity: 9.81,
  waterDensity: 1000,
  maxLinearSpeed: 60,
  horizontalDragScale: 0.5,
};

export const DEFAULT_DRAG_COEFFICIENT = 1.4;

// ---------- Force application ----------

/**
 * Apply one explicit-Euler integration step to `body`, including buoyancy
 * and water drag derived from a fresh `sampleWaterInteraction` query. Dry
 * bodies fall under gravity only.
 *
 * Returns the sample that drove the step so callers (debug HUD, splash VFX,
 * audio) can reuse it without double-sampling.
 */
export function applyBuoyancyForce(
  body: BuoyantBody,
  dt: number,
  sampler: BuoyancySamplerLike,
  config: Partial<BuoyancyConfig> = {},
  options?: WaterInteractionOptions,
): WaterInteractionSample {
  // Guard against pathological dts (paused frame, debugger break).
  if (!Number.isFinite(dt) || dt <= 0) {
    return sampler.sampleWaterInteraction(body.position, options);
  }

  const cfg = mergeConfig(config);
  const mass = body.mass > 0 ? body.mass : 1e-6;
  const sample = sampler.sampleWaterInteraction(body.position, options);

  // --- Vertical acceleration: gravity always, buoyancy only when in water ---
  const weightForce = -cfg.gravity * mass;
  const buoyantForce = sample.submerged
    ? cfg.gravity * cfg.waterDensity * body.volume * sample.buoyancyScalar
    : 0;
  const accelY = (weightForce + buoyantForce) / mass;

  // v += a * dt (explicit Euler on Y only; horizontal is damping-only here).
  body.velocity.y += accelY * dt;

  // --- Water damping: exponential, scaled by immersion ---
  // Out of water → no extra damping (handled by callers' own air drag).
  if (sample.submerged) {
    const k = Math.max(0, body.dragCoefficient) * sample.immersion01;
    if (k > 0) {
      const verticalDecay = Math.exp(-k * dt);
      const horizontalDecay = Math.exp(-k * cfg.horizontalDragScale * dt);
      // River flow push: blend horizontal velocity toward the channel's
      // flow vector at the same rate water drags coasting motion. Net
      // effect over time: a body floating freely converges to the
      // segment's flow velocity, scaled by immersion + drag. Outside a
      // channel `flowVelocity` is (0,0,0) so this reduces to plain drag.
      const flow = sample.flowVelocity;
      const blend = 1 - horizontalDecay;
      body.velocity.x = body.velocity.x * horizontalDecay + flow.x * blend;
      body.velocity.z = body.velocity.z * horizontalDecay + flow.z * blend;
      body.velocity.y *= verticalDecay;
    }
  }

  // --- Stability clamp (mirrors helicopter / ground-vehicle posture) ---
  const speedSq = body.velocity.lengthSq();
  const maxSq = cfg.maxLinearSpeed * cfg.maxLinearSpeed;
  if (speedSq > maxSq) {
    body.velocity.multiplyScalar(cfg.maxLinearSpeed / Math.sqrt(speedSq));
  }

  // --- Integrate position ---
  body.position.x += body.velocity.x * dt;
  body.position.y += body.velocity.y * dt;
  body.position.z += body.velocity.z * dt;

  return sample;
}

/**
 * Convenience for batched callers. Cheaper than building closures around
 * `applyBuoyancyForce` per body since the merged config is built once.
 */
export function applyBuoyancyForceBatch(
  bodies: readonly BuoyantBody[],
  dt: number,
  sampler: BuoyancySamplerLike,
  config: Partial<BuoyancyConfig> = {},
  options?: WaterInteractionOptions,
): void {
  if (bodies.length === 0) return;
  // Pre-merge once; the per-body call would otherwise repeat this work.
  const merged = mergeConfig(config);
  for (let i = 0; i < bodies.length; i += 1) {
    applyBuoyancyForce(bodies[i], dt, sampler, merged, options);
  }
}

/**
 * Static helper for tuning new BuoyantBody shapes. Returns the equilibrium
 * immersion ratio (0..1) where a body of `mass` and `volume` would float
 * stationary. > 1 means the body sinks; < 0 is unreachable (negative-mass).
 *
 * Exposed because watercraft and dropped-weapon tuning will want to pick a
 * volume that lands a known waterline; this avoids re-deriving the algebra
 * at each call site.
 */
export function neutralImmersion(
  mass: number,
  volume: number,
  config: Partial<BuoyancyConfig> = {},
): number {
  const cfg = mergeConfig(config);
  if (volume <= 0) return Number.POSITIVE_INFINITY;
  return mass / (cfg.waterDensity * volume);
}

// ---------- Internals ----------

function mergeConfig(config: Partial<BuoyancyConfig>): BuoyancyConfig {
  // Cheap when called from the batch path (one allocation per frame, not
  // per body). Individual `applyBuoyancyForce` callers eat one allocation
  // per body — acceptable for the few-dozen-bodies regime this targets.
  if (
    config.gravity === undefined
    && config.waterDensity === undefined
    && config.maxLinearSpeed === undefined
    && config.horizontalDragScale === undefined
  ) {
    return DEFAULT_BUOYANCY_CONFIG;
  }
  return { ...DEFAULT_BUOYANCY_CONFIG, ...config };
}
