import * as THREE from 'three';
import { Combatant, CombatantState } from './types';
import { NPC_MAX_SPEED } from '../../config/CombatantConfig';

// Visible speed ceiling for rendered position. Anchored to NPC_MAX_SPEED with
// headroom; any logical jump larger than this per real frame (e.g. low-LOD dt
// amortization producing a multi-meter step) is smoothed across frames.
const RENDER_MAX_SPEED_MPS = Math.max(NPC_MAX_SPEED * 2, 18);

// Minimum per-frame closure so the smoother always makes progress even when
// deltaTime is tiny or NPC_MAX_SPEED is tuned downward.
const MIN_CLOSE_STEP_M = 0.05;

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
 * This class keeps a separate rendered Vector3 per combatant (stored on
 * `combatant.renderedPosition` for zero-lookup access) and moves it toward
 * the latest logical position each real frame, capped at a visible speed.
 * The sim is unchanged. Mounted and dying combatants pass through unclamped.
 */
export class CombatantRenderInterpolator {
  private readonly scratchDelta = new THREE.Vector3();
  private readonly maxSpeedMps: number;

  constructor(options?: { maxSpeedMps?: number }) {
    this.maxSpeedMps = options?.maxSpeedMps ?? RENDER_MAX_SPEED_MPS;
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
    combatants.forEach(combatant => this.advance(combatant, maxStep));
  }

  /** Advance a single combatant. Public for targeted tests. */
  advance(combatant: Combatant, maxStep: number): void {
    const rendered = this.ensureRendered(combatant);
    if (isPassThroughState(combatant)) {
      rendered.copy(combatant.position);
      return;
    }
    this.scratchDelta.subVectors(combatant.position, rendered);
    const distance = this.scratchDelta.length();
    if (distance <= SNAP_DISTANCE_M || distance <= maxStep) {
      rendered.copy(combatant.position);
      return;
    }
    rendered.addScaledVector(this.scratchDelta, maxStep / distance);
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
}
