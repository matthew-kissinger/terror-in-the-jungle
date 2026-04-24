import * as THREE from 'three';
import { Combatant, CombatantState } from './types';
import { NPC_MAX_SPEED } from '../../config/CombatantConfig';

// Visible horizontal speed ceiling for rendered position. Anchored to
// NPC_MAX_SPEED with headroom; any logical horizontal jump larger than this
// per real frame (e.g. low-LOD dt amortization producing a multi-meter step)
// is smoothed across frames.
const RENDER_MAX_SPEED_MPS = Math.max(NPC_MAX_SPEED * 2, 12);

// Vertical behaviour (two-tier cap, no pop at the boundary):
//   - Small Y deltas (below VERTICAL_NEAR_THRESHOLD_M) are capped at the
//     locomotion rate RENDER_NEAR_VERTICAL_SPEED_MPS ≈ NPC_MAX_SPEED. That
//     matches the fastest a sprinting NPC can legitimately climb/descend,
//     keeps terrain-follow tight, and stops below-threshold deltas from
//     creating a visible pop once a large gap decays through the threshold.
//   - Large Y deltas (above the threshold) are upstream artifacts — the
//     distant-culled resume with DISTANT_CULLED_DEFAULT_Y = 3 snapping to
//     real terrain at +50m, LOD promotion resampling height after a long
//     dt amortization, etc. Resolved at the full 18 m/s magnitude cap they
//     read as a "leap into the air." Capped at RENDER_FAR_VERTICAL_SPEED_MPS
//     they ease in quietly.
const VERTICAL_NEAR_THRESHOLD_M = 1.0;
const RENDER_NEAR_VERTICAL_SPEED_MPS = NPC_MAX_SPEED; // locomotion rate
const RENDER_FAR_VERTICAL_SPEED_MPS = 2;              // upstream-snap rate
// Keep visible soldiers close to their logical grounded height so they do not
// appear buried in slopes or floating while Y catches up. Low/culled NPCs still
// ease large upstream snaps because they are not close enough to judge feet.
const MAX_GROUNDED_RENDER_OFFSET_M = 0.35;

// Minimum per-frame closure so the smoother always makes progress even when
// deltaTime is tiny or NPC_MAX_SPEED is tuned downward.
const MIN_CLOSE_STEP_M = 0.05;

// Minimum per-frame vertical closure (only used when a large Y delta is
// being eased down). Small enough to stay invisible frame-to-frame.
const MIN_CLOSE_VERTICAL_STEP_M = 0.02;

// Sub-cm drift is snapped away to keep idle combatants frame-accurate.
const SNAP_DISTANCE_M = 0.01;

function isPassThroughState(combatant: Combatant): boolean {
  if (combatant.isDying || combatant.state === CombatantState.DEAD) return true;
  switch (combatant.state) {
    case CombatantState.IN_VEHICLE:
    case CombatantState.BOARDING:
    case CombatantState.DISMOUNTING:
      return true;
    default:
      return false;
  }
}

/**
 * Splits logical combatant position from rendered (on-screen) position.
 *
 * The LOD manager amortizes simulation dt across staggered frames, which can
 * produce multi-meter logical position jumps for low-LOD combatants. Rendered
 * verbatim, that looks like the crowd is teleporting ("hypersprint").
 *
 * Per-combatant rendered Vector3 lives on `combatant.renderedPosition` for
 * zero-lookup access. Each real frame it moves toward the latest logical
 * position, capped at a visible speed. The sim is unchanged. Mounted and
 * dying combatants pass through unclamped.
 */
export class CombatantRenderInterpolator {
  private readonly scratchDelta = new THREE.Vector3();
  private readonly maxSpeedMps: number;
  private readonly maxVerticalNearMps: number;
  private readonly maxVerticalFarMps: number;

  constructor(options?: {
    maxSpeedMps?: number;
    maxVerticalNearMps?: number;
    maxVerticalFarMps?: number;
  }) {
    this.maxSpeedMps = options?.maxSpeedMps ?? RENDER_MAX_SPEED_MPS;
    this.maxVerticalNearMps = options?.maxVerticalNearMps ?? RENDER_NEAR_VERTICAL_SPEED_MPS;
    this.maxVerticalFarMps = options?.maxVerticalFarMps ?? RENDER_FAR_VERTICAL_SPEED_MPS;
  }

  /** Advance rendered positions one real frame toward their logical targets. */
  update(combatants: Map<string, Combatant>, deltaTime: number): void {
    if (deltaTime <= 0) {
      // Initialize any new combatants so first render has a valid position.
      combatants.forEach(c => {
        if (!c.renderedPosition) this.ensureRendered(c);
      });
      return;
    }
    const maxStep = Math.max(MIN_CLOSE_STEP_M, this.maxSpeedMps * deltaTime);
    const maxVerticalNearStep = Math.max(MIN_CLOSE_VERTICAL_STEP_M, this.maxVerticalNearMps * deltaTime);
    const maxVerticalFarStep = Math.max(MIN_CLOSE_VERTICAL_STEP_M, this.maxVerticalFarMps * deltaTime);
    combatants.forEach(combatant => this.advance(combatant, maxStep, maxVerticalNearStep, maxVerticalFarStep));
  }

  /** Advance a single combatant. Public for targeted tests. */
  advance(
    combatant: Combatant,
    maxStep: number,
    maxVerticalNearStep?: number,
    maxVerticalFarStep?: number,
  ): void {
    const rendered = this.ensureRendered(combatant);
    if (isPassThroughState(combatant)) {
      rendered.copy(combatant.position);
      return;
    }
    this.scratchDelta.subVectors(combatant.position, rendered);
    const dy = this.scratchDelta.y;
    const absDy = Math.abs(dy);

    // Vertical resolution, decoupled from horizontal, with a two-tier cap.
    // See constants above for rationale. The two-tier form means large
    // Y gaps ease in at ~2 m/s, and small Y gaps — legitimate terrain-
    // follow — track at NPC_MAX_SPEED so an NPC sprinting downhill stays
    // glued to terrain.
    const nearStep = maxVerticalNearStep ?? MIN_CLOSE_VERTICAL_STEP_M;
    const farStep = maxVerticalFarStep ?? MIN_CLOSE_VERTICAL_STEP_M;
    const verticalCap = absDy <= VERTICAL_NEAR_THRESHOLD_M ? nearStep : farStep;
    const yStep = absDy <= verticalCap ? dy : Math.sign(dy) * verticalCap;

    // Horizontal (XZ) resolution — preserve the original magnitude-capped
    // behaviour so sim correctness and existing horizontal tests hold.
    const dxz = Math.hypot(this.scratchDelta.x, this.scratchDelta.z);
    if (dxz <= maxStep) {
      rendered.x = combatant.position.x;
      rendered.z = combatant.position.z;
    } else {
      const scale = maxStep / dxz;
      rendered.x += this.scratchDelta.x * scale;
      rendered.z += this.scratchDelta.z * scale;
    }

    if (absDy <= SNAP_DISTANCE_M) {
      rendered.y = combatant.position.y;
    } else {
      rendered.y += yStep;
    }

    if (combatant.lodLevel === 'high' || combatant.lodLevel === 'medium') {
      rendered.y = THREE.MathUtils.clamp(
        rendered.y,
        combatant.position.y - MAX_GROUNDED_RENDER_OFFSET_M,
        combatant.position.y + MAX_GROUNDED_RENDER_OFFSET_M,
      );
    }
  }

  /** Lazy-init rendered position to logical on first sight. */
  ensureRendered(combatant: Combatant): THREE.Vector3 {
    if (!combatant.renderedPosition) {
      combatant.renderedPosition = combatant.position.clone();
    }
    return combatant.renderedPosition;
  }

  /** Snap rendered to logical immediately (teleport, respawn, dismount). */
  snap(combatant: Combatant): void {
    this.ensureRendered(combatant).copy(combatant.position);
  }

  /** Max visible speed for rendered travel, in m/s. Exposed for tests. */
  getMaxSpeedMps(): number {
    return this.maxSpeedMps;
  }

  /** Max visible vertical speed (near tier, terrain-follow) in m/s. */
  getMaxVerticalNearMps(): number {
    return this.maxVerticalNearMps;
  }

  /** Max visible vertical speed (far tier, upstream-snap ease-in) in m/s. */
  getMaxVerticalFarMps(): number {
    return this.maxVerticalFarMps;
  }
}
