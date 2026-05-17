import * as THREE from 'three'
import { Combatant, Faction, ITargetable, isAlly, isTargetAlive } from '../types'

/**
 * NPC tank-gunner firing route (cycle-vekhikl-4-tank-turret-and-cannon R2,
 * `tank-ai-gunner-route` task).
 *
 * Helper extracted from `CombatantAI` so the tank-mounted branch stays
 * focused. The combat-AI tree calls into this route when an NPC combatant
 * is mounted in a friendly tank's gunner seat and has acquired a target via
 * the existing `findNearestEnemy` pipeline.
 *
 * Method (per cycle brief §"tank-ai-gunner-route"):
 *   1. NPC has already acquired a target through `CombatantAI`'s rifle
 *      pipeline (the only thing that changes for a tank gunner is the
 *      *firing* path; acquisition is unchanged).
 *   2. Compute lead position by asking the injected ballistic solver for
 *      a trajectory to the (target + velocity × time_of_flight) point.
 *   3. Slew the turret toward that lead. The turret enforces its own
 *      cap on slew rate — this route just sets the target yaw + pitch.
 *   4. If the *current* turret pose is within the configured cone tolerance
 *      of the requested aim, and the reload-time gate has elapsed, fire
 *      the cannon. Otherwise, hold fire and let the turret continue
 *      slewing; the next tick re-evaluates.
 *
 * Stub-then-swap pattern: the ballistic solver lives in a sibling R2
 * task (`tank-ballistic-solver-wasm-pilot`) that has not yet merged.
 * To keep this PR independent, the route depends on a *structural*
 * `ITankBallisticSolver` interface declared in this file. Once the
 * sibling PR lands, the orchestrator will dispatch a swap step that
 * replaces this interface with the real import; no consumer of this
 * file needs to change because the structural shape matches.
 *
 * Damage attribution: the cannon's projectile system handles kill
 * accounting downstream. This route just emits a fire request — same
 * separation `M2HBEmplacementSystem.tryFire` keeps from
 * `EmplacementSeekHelper`.
 */

// ── Structural contracts (duck-typed so test fakes are one-liners) ───────────

/**
 * Minimal structural surface for the ballistic solver. Matches the public
 * shape the sibling-PR Rust→WASM wrapper will expose:
 *   `class TankBallisticSolver { solve(v, angle, target, gravity?): TrajectorySample[] }`.
 * The TS solver path (`solveTS`) is a superset; we depend only on `solve`.
 *
 * The `solve()` return value samples the trajectory in time order from
 * launch; we only need the apex/landing structure indirectly (we read the
 * final sample to validate the solver agrees the shell reaches the lead).
 */
export interface ITankBallisticSolver {
  solve(
    muzzleVelocity: number,
    elevationAngleRad: number,
    target: THREE.Vector3,
    gravity?: number,
  ): ReadonlyArray<{ time: number; x: number; y: number; z: number }>
}

/**
 * Subset of `Tank` the route needs to gate firing on chassis state. The
 * cycle #9 sibling `tank-damage-states` task adds `getTurretJammed()` /
 * `getEngineKilled()` on the live `Tank`; until then this route gates on
 * `isDestroyed()` alone — when those additional methods land, the
 * `engineKilled` / `turretJammed` checks below pick them up automatically
 * via the optional structural fields.
 */
export interface ITankChassis {
  readonly faction: Faction
  /** True when HP has reached zero (wreck). */
  isDestroyed(): boolean
  /**
   * Optional turret-jammed gate. Added by `tank-damage-states` (sibling R2).
   * When the method exists and returns true, the gunner cannot fire even
   * if the turret is still cosmetically tracking — same gate the player
   * adapter will read.
   */
  isTurretJammed?(): boolean
}

/**
 * Subset of `TankTurret` the route needs. Read-only world-space barrel
 * direction + tip; mutate `setTargetYaw` / `setTargetPitch` to slew.
 * The turret model owns slew caps + envelope clamping internally.
 */
export interface ITankTurret {
  getYaw(): number
  getPitch(): number
  setTargetYaw(yaw: number): void
  setTargetPitch(pitch: number): void
  getBarrelTipWorldPosition(out: THREE.Vector3): THREE.Vector3
  getBarrelDirectionWorld(out: THREE.Vector3): THREE.Vector3
}

/**
 * Subset of `TankCannonProjectileSystem` the route uses to fire. The
 * `launch()` signature mirrors the real system exactly so the production
 * wiring is a single line-up.
 */
export interface ITankCannonSystem {
  launch(args: {
    origin: THREE.Vector3
    direction: THREE.Vector3
    muzzleSpeed: number
    ammoType: 'AP' | 'HEAT' | 'HE'
    shooterId: string
    shooterFaction: Faction
  }): string
}

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Default cone tolerance: ~2.86° — within this angular delta between current
 * barrel pose and requested aim, the gunner pulls the trigger. The cap is
 * generous because the projectile is an arcing shell, not a hitscan beam;
 * the slew cap on the turret means the gunner won't snap-fire across wide
 * traverses.
 */
const DEFAULT_CONE_TOLERANCE_RAD = 0.05

/**
 * Default reload time between cannon shots (seconds). M48 90 mm crew-served
 * reload is ~5-8 s historically; 3.5 s is a playable abstraction for the
 * AI gunner (matches the cycle brief's suggestion).
 */
const DEFAULT_RELOAD_SECONDS = 3.5

/** Muzzle velocity used to size the lead-prediction lookup. */
const DEFAULT_MUZZLE_SPEED = 400

/** Gravity for the solver. Matches `TANK_CANNON_CONSTANTS.GRAVITY`. */
const SOLVER_GRAVITY = -9.8

/** Maximum lead-iteration steps. Two passes converge to <1° for typical leads. */
const LEAD_REFINEMENT_PASSES = 2

// Module-level scratch vectors so the hot path never allocates.
const _leadPos = new THREE.Vector3()
const _toLead = new THREE.Vector3()
const _barrelTip = new THREE.Vector3()
const _barrelDir = new THREE.Vector3()
const _targetVelHorizontal = new THREE.Vector3()

export interface TankAIGunnerRouteOptions {
  /** Cone tolerance in radians (defaults to ~2.86°). */
  coneToleranceRad?: number
  /** Reload time between shots in seconds (defaults to 3.5). */
  reloadSeconds?: number
  /** Muzzle velocity in m/s used for lead prediction (defaults to 400). */
  muzzleSpeed?: number
  /** Ammo type to launch (defaults to 'AP', the MVP shell). */
  ammoType?: 'AP' | 'HEAT' | 'HE'
}

export interface TankAIGunnerRouteResult {
  /** True iff a cannon round actually launched this tick. */
  fired: boolean
  /** Reason fire was withheld (diagnostic, empty when `fired === true`). */
  reason?:
    | 'wrecked'
    | 'turret-jammed'
    | 'no-target'
    | 'friendly'
    | 'reloading'
    | 'aim-not-converged'
}

/**
 * Tank-mounted NPC firing route. Stateless aside from configuration; per-
 * combatant fire-rate is tracked via the combatant's own `lastShotTime`
 * field (same field the rifle path uses, repurposed for the cannon).
 */
export class TankAIGunnerRoute {
  private readonly coneToleranceRad: number
  private readonly reloadSeconds: number
  private readonly muzzleSpeed: number
  private readonly ammoType: 'AP' | 'HEAT' | 'HE'

  constructor(opts: TankAIGunnerRouteOptions = {}) {
    this.coneToleranceRad = opts.coneToleranceRad ?? DEFAULT_CONE_TOLERANCE_RAD
    this.reloadSeconds = opts.reloadSeconds ?? DEFAULT_RELOAD_SECONDS
    this.muzzleSpeed = opts.muzzleSpeed ?? DEFAULT_MUZZLE_SPEED
    this.ammoType = opts.ammoType ?? 'AP'
  }

  /** Cone tolerance read-back for tests / diagnostics. */
  getConeToleranceRad(): number {
    return this.coneToleranceRad
  }

  /** Reload-gate value read-back for tests / diagnostics. */
  getReloadSeconds(): number {
    return this.reloadSeconds
  }

  /**
   * Evaluate the gunner's aim + fire pipeline for one tick.
   *
   * Inputs:
   *  - `combatant`: the NPC in the gunner seat (their `lastShotTime` is the
   *    reload-gate cursor and is mutated on a successful fire).
   *  - `tank`: chassis state (wrecked / turret-jammed gates).
   *  - `turret`: aim model (slewed via setTargetYaw / setTargetPitch).
   *  - `target`: enemy acquired by the upstream rifle target-acquisition path.
   *  - `cannon`: cannon launch surface (called on fire).
   *  - `solver`: ballistic solver, used for lead-time estimation.
   *  - `nowMs`: clock reading; passed in (not read inside) so tests are
   *    deterministic.
   *
   * Returns a result object with `fired` plus a diagnostic reason field.
   */
  evaluateLeadAndFire(
    combatant: Combatant,
    tank: ITankChassis,
    turret: ITankTurret,
    target: ITargetable | null | undefined,
    cannon: ITankCannonSystem,
    solver: ITankBallisticSolver,
    nowMs: number,
  ): TankAIGunnerRouteResult {
    // 1. Chassis gates: wrecked + turret-jammed both kill the firing route
    //    regardless of aim. We still let the AI continue (the upstream loop
    //    will hand the combatant back to the patrol/dismount flow eventually).
    if (tank.isDestroyed()) {
      return { fired: false, reason: 'wrecked' }
    }
    if (typeof tank.isTurretJammed === 'function' && tank.isTurretJammed()) {
      return { fired: false, reason: 'turret-jammed' }
    }

    // 2. Target gates: no target, dead target, or friendly target → no fire.
    if (!target || !isTargetAlive(target)) {
      return { fired: false, reason: 'no-target' }
    }
    if (isAlly(combatant.faction, target.faction)) {
      return { fired: false, reason: 'friendly' }
    }

    // 3. Compute lead position. Use the solver to estimate time-of-flight
    //    to the *current* target position, then offset by the target's
    //    horizontal velocity over that time. One refinement pass is
    //    enough for typical engagement distances (the slew cap dominates
    //    error before the lead-prediction step does).
    this.computeLeadPosition(turret, target, solver, _leadPos)

    // 4. Dispatch the slew. The turret enforces its own slew cap + pitch
    //    envelope, so we just request the angles and let the integrator
    //    walk toward them next `turret.update()`.
    turret.getBarrelTipWorldPosition(_barrelTip)
    _toLead.subVectors(_leadPos, _barrelTip)
    const desiredYaw = Math.atan2(_toLead.x, -_toLead.z) // -Z is barrel-forward
    const horizontalRange = Math.hypot(_toLead.x, _toLead.z)
    const desiredPitch = Math.atan2(_toLead.y, Math.max(horizontalRange, 1e-3))
    turret.setTargetYaw(desiredYaw)
    turret.setTargetPitch(desiredPitch)

    // 5. Cone-tolerance check: is the current barrel direction close enough
    //    to the requested aim that pulling the trigger now is on-target?
    //    We compute the angular delta between the world-space barrel direction
    //    and the world-space direction to the lead point; same metric for
    //    yaw + pitch combined, which is what the gunner actually cares about.
    turret.getBarrelDirectionWorld(_barrelDir)
    const toLeadNorm = _toLead.length()
    if (toLeadNorm < 1e-3) {
      // Degenerate (target on top of barrel tip). Treat as out-of-tolerance —
      // fire only when there's a real bearing.
      return { fired: false, reason: 'aim-not-converged' }
    }
    _toLead.divideScalar(toLeadNorm)
    const cosAngle = THREE.MathUtils.clamp(_barrelDir.dot(_toLead), -1, 1)
    const angleDelta = Math.acos(cosAngle)
    if (angleDelta > this.coneToleranceRad) {
      return { fired: false, reason: 'aim-not-converged' }
    }

    // 6. Reload-gate. `combatant.lastShotTime` is wall-clock ms; this is
    //    the same field the rifle path uses, so the reload-time gate
    //    behaves consistently across firing systems.
    const sinceLastShotMs = nowMs - (combatant.lastShotTime ?? 0)
    if (sinceLastShotMs < this.reloadSeconds * 1000) {
      return { fired: false, reason: 'reloading' }
    }

    // 7. Fire. Use the current barrel transform (post-slew) as origin +
    //    direction so the projectile spawns exactly where the turret
    //    points right now. The cannon system handles the ballistics.
    cannon.launch({
      origin: _barrelTip.clone(),
      direction: _barrelDir.clone(),
      muzzleSpeed: this.muzzleSpeed,
      ammoType: this.ammoType,
      shooterId: combatant.id,
      shooterFaction: combatant.faction,
    })
    combatant.lastShotTime = nowMs
    return { fired: true }
  }

  /**
   * Lead-prediction. Iteratively asks the solver for a trajectory to the
   * candidate intercept point, advancing the intercept by the target's
   * horizontal velocity over the resulting flight-time. Two refinement
   * passes converge well within turret cone tolerance for typical engagement
   * geometry; the slew cap on the turret swallows any residual error.
   *
   * The solver-call path is the swap point: today it depends on the
   * structural `ITankBallisticSolver`; post-merge the orchestrator points
   * it at the real `TankBallisticSolver` from the sibling WASM-pilot PR.
   *
   * Writes the computed lead position into `out`.
   */
  private computeLeadPosition(
    turret: ITankTurret,
    target: ITargetable,
    solver: ITankBallisticSolver,
    out: THREE.Vector3,
  ): void {
    turret.getBarrelTipWorldPosition(_barrelTip)
    // Start with the target's current position as the intercept candidate.
    out.copy(target.position)

    _targetVelHorizontal.copy(target.velocity)
    _targetVelHorizontal.y = 0
    const hasVelocity = _targetVelHorizontal.lengthSq() > 1e-6

    if (!hasVelocity) {
      // Stationary target — no lead needed; the solver call is still made
      // once so the WASM/TS path is exercised every fire decision (the
      // swap PR's perf comparison can amortise the call cost honestly).
      const elevAngle = this.estimateElevationAngle(_barrelTip, out)
      solver.solve(this.muzzleSpeed, elevAngle, out, SOLVER_GRAVITY)
      return
    }

    for (let pass = 0; pass < LEAD_REFINEMENT_PASSES; pass++) {
      const elevAngle = this.estimateElevationAngle(_barrelTip, out)
      const samples = solver.solve(this.muzzleSpeed, elevAngle, out, SOLVER_GRAVITY)
      if (!samples || samples.length === 0) {
        // Solver returned nothing actionable; fall back to a kinematic
        // time-of-flight estimate. Same `t = distance / muzzleSpeed`
        // closed-form the rifle's leading-error term uses.
        const range = _barrelTip.distanceTo(out)
        const tof = range / this.muzzleSpeed
        out.copy(target.position).addScaledVector(_targetVelHorizontal, tof)
        continue
      }
      const tof = samples[samples.length - 1].time
      out.copy(target.position).addScaledVector(_targetVelHorizontal, tof)
    }
  }

  /**
   * Closed-form initial guess for the elevation angle needed to lob a round
   * onto `target` from `origin`. This is the input the solver refines;
   * accuracy at this step is unimportant since the solver is the source of
   * truth on time-of-flight, but a reasonable seed cuts iteration cost.
   */
  private estimateElevationAngle(origin: THREE.Vector3, target: THREE.Vector3): number {
    const dx = target.x - origin.x
    const dz = target.z - origin.z
    const dy = target.y - origin.y
    const horizontalRange = Math.hypot(dx, dz)
    if (horizontalRange < 1e-3) return Math.sign(dy) * (Math.PI / 4)
    return Math.atan2(dy, horizontalRange)
  }
}
