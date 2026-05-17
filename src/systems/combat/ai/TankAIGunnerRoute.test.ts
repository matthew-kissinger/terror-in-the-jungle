import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import {
  TankAIGunnerRoute,
  type ITankBallisticSolver,
  type ITankCannonSystem,
  type ITankChassis,
  type ITankTurret,
} from './TankAIGunnerRoute'
import { Combatant, CombatantState, Faction, ITargetable } from '../types'

/**
 * Behavior tests for the NPC tank-gunner firing route.
 *
 * Per docs/TESTING.md: assert observable outcomes (did a shot launch? did
 * the turret slew? did the reload gate hold?) rather than internal-state
 * names or specific tuning constants. Cone-tolerance / reload-time are
 * constructor knobs so the test can vary them without re-tuning the helper.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'gunner_1',
    faction: Faction.US,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state: CombatantState.IN_VEHICLE,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any,
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    reactionTimer: 0,
    suppressionLevel: 0,
    alertTimer: 0,
    isFullAuto: false,
    panicLevel: 0,
    lastHitTime: 0,
    consecutiveMisses: 0,
    wanderAngle: 0,
    timeToDirectionChange: 0,
    lastUpdateTime: 0,
    updatePriority: 0,
    simLane: 'high',
    renderLane: 'culled',
    kills: 0,
    deaths: 0,
    ...overrides,
  } as Combatant
}

function makeTarget(overrides: Partial<ITargetable> = {}): ITargetable {
  return {
    id: 'enemy_1',
    faction: Faction.NVA,
    position: new THREE.Vector3(0, 0, -50),
    velocity: new THREE.Vector3(0, 0, 0),
    health: 100,
    state: CombatantState.PATROLLING,
    ...overrides,
  }
}

function makeChassis(opts: { destroyed?: boolean; jammed?: boolean; faction?: Faction } = {}): ITankChassis {
  return {
    faction: opts.faction ?? Faction.US,
    isDestroyed: () => opts.destroyed === true,
    isTurretJammed: opts.jammed === undefined ? undefined : () => opts.jammed === true,
  }
}

/**
 * Mock turret. `barrelDirWorld` controls the world-space direction the
 * barrel currently points (used by the cone-tolerance check). The slew
 * functions just record the requested angles — the route is responsible
 * for *requesting* slew, not for integrating it.
 */
function makeTurret(opts: {
  barrelTip?: THREE.Vector3
  barrelDir?: THREE.Vector3
  initialYaw?: number
  initialPitch?: number
} = {}) {
  const tip = (opts.barrelTip ?? new THREE.Vector3(0, 2, 0)).clone()
  const dir = (opts.barrelDir ?? new THREE.Vector3(0, 0, -1)).clone().normalize()
  let yaw = opts.initialYaw ?? 0
  let pitch = opts.initialPitch ?? 0
  const setYawCalls: number[] = []
  const setPitchCalls: number[] = []
  const turret: ITankTurret & {
    setYawCalls: number[]
    setPitchCalls: number[]
    setBarrelDir: (d: THREE.Vector3) => void
  } = {
    getYaw: () => yaw,
    getPitch: () => pitch,
    setTargetYaw: (y: number) => {
      yaw = y
      setYawCalls.push(y)
    },
    setTargetPitch: (p: number) => {
      pitch = p
      setPitchCalls.push(p)
    },
    getBarrelTipWorldPosition: (out: THREE.Vector3) => {
      out.copy(tip)
      return out
    },
    getBarrelDirectionWorld: (out: THREE.Vector3) => {
      out.copy(dir)
      return out
    },
    setYawCalls,
    setPitchCalls,
    setBarrelDir: (d: THREE.Vector3) => {
      dir.copy(d).normalize()
    },
  }
  return turret
}

function makeCannon(): ITankCannonSystem & { launchCalls: any[] } {
  const launchCalls: any[] = []
  return {
    launch: vi.fn((args: any) => {
      launchCalls.push(args)
      return `shell_${launchCalls.length}`
    }) as any,
    launchCalls,
  }
}

/**
 * Solver fake that always reports a flight-time of `tof` seconds, regardless
 * of the inputs. Lets us control the lead-time prediction deterministically.
 */
function makeSolver(tof = 0.5): ITankBallisticSolver & { solveCalls: number } {
  const solver: any = {
    solveCalls: 0,
    solve: (
      _v: number,
      _angle: number,
      target: THREE.Vector3,
      _g?: number,
    ) => {
      solver.solveCalls++
      // Return a 1-sample trajectory with the requested time of flight.
      return [{ time: tof, x: target.x, y: target.y, z: target.z }]
    },
  }
  return solver
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('TankAIGunnerRoute', () => {
  let route: TankAIGunnerRoute
  let cannon: ReturnType<typeof makeCannon>
  let solver: ReturnType<typeof makeSolver>

  beforeEach(() => {
    route = new TankAIGunnerRoute({
      coneToleranceRad: 0.05,
      reloadSeconds: 3.5,
    })
    cannon = makeCannon()
    solver = makeSolver(0)
  })

  describe('firing decision', () => {
    it('fires when the target is in cone tolerance and the reload gate has elapsed', () => {
      // Target directly in front of the barrel; barrel already aimed at -Z.
      const combatant = makeCombatant()
      const tank = makeChassis()
      const turret = makeTurret({
        barrelTip: new THREE.Vector3(0, 2, 0),
        barrelDir: new THREE.Vector3(0, 0, -1),
      })
      const target = makeTarget({ position: new THREE.Vector3(0, 2, -50) })

      const result = route.evaluateLeadAndFire(
        combatant,
        tank,
        turret,
        target,
        cannon,
        solver,
        10_000, // well past reload gate (lastShotTime defaults to 0)
      )

      expect(result.fired).toBe(true)
      expect(cannon.launchCalls).toHaveLength(1)
      const call = cannon.launchCalls[0]
      expect(call.shooterId).toBe('gunner_1')
      expect(call.shooterFaction).toBe(Faction.US)
      expect(call.muzzleSpeed).toBeGreaterThan(0)
      // Combatant's reload gate cursor advanced to nowMs
      expect(combatant.lastShotTime).toBe(10_000)
    })

    it('holds fire and slews the turret when the aim is outside cone tolerance', () => {
      const combatant = makeCombatant()
      const tank = makeChassis()
      // Barrel points along +X but target is behind along -Z — way out of
      // tolerance. The route must slew (setTargetYaw/Pitch) and NOT fire.
      const turret = makeTurret({
        barrelTip: new THREE.Vector3(0, 2, 0),
        barrelDir: new THREE.Vector3(1, 0, 0),
      })
      const target = makeTarget({ position: new THREE.Vector3(0, 2, -100) })

      const result = route.evaluateLeadAndFire(
        combatant,
        tank,
        turret,
        target,
        cannon,
        solver,
        10_000,
      )

      expect(result.fired).toBe(false)
      expect(result.reason).toBe('aim-not-converged')
      expect(cannon.launchCalls).toHaveLength(0)
      // Turret was asked to slew (at least one yaw + one pitch update).
      expect(turret.setYawCalls.length).toBeGreaterThan(0)
      expect(turret.setPitchCalls.length).toBeGreaterThan(0)
    })

    it('respects the reload-time gate between consecutive fire-eligible ticks', () => {
      const combatant = makeCombatant()
      const tank = makeChassis()
      const turret = makeTurret({
        barrelTip: new THREE.Vector3(0, 2, 0),
        barrelDir: new THREE.Vector3(0, 0, -1),
      })
      const target = makeTarget({ position: new THREE.Vector3(0, 2, -50) })

      // First call fires
      const first = route.evaluateLeadAndFire(
        combatant, tank, turret, target, cannon, solver, 10_000,
      )
      expect(first.fired).toBe(true)

      // 1 second later, still within reload gate (3.5 s) — must not fire
      const second = route.evaluateLeadAndFire(
        combatant, tank, turret, target, cannon, solver, 11_000,
      )
      expect(second.fired).toBe(false)
      expect(second.reason).toBe('reloading')

      // 4 seconds after first shot — past reload, fires again
      const third = route.evaluateLeadAndFire(
        combatant, tank, turret, target, cannon, solver, 14_000,
      )
      expect(third.fired).toBe(true)
      expect(cannon.launchCalls).toHaveLength(2)
    })

    it('does not fire when the tank is destroyed', () => {
      const combatant = makeCombatant()
      const tank = makeChassis({ destroyed: true })
      const turret = makeTurret({
        barrelTip: new THREE.Vector3(0, 2, 0),
        barrelDir: new THREE.Vector3(0, 0, -1),
      })
      const target = makeTarget({ position: new THREE.Vector3(0, 2, -50) })

      const result = route.evaluateLeadAndFire(
        combatant, tank, turret, target, cannon, solver, 10_000,
      )
      expect(result.fired).toBe(false)
      expect(result.reason).toBe('wrecked')
      expect(cannon.launchCalls).toHaveLength(0)
    })

    it('does not fire when the turret is jammed', () => {
      const combatant = makeCombatant()
      const tank = makeChassis({ jammed: true })
      const turret = makeTurret({
        barrelTip: new THREE.Vector3(0, 2, 0),
        barrelDir: new THREE.Vector3(0, 0, -1),
      })
      const target = makeTarget({ position: new THREE.Vector3(0, 2, -50) })

      const result = route.evaluateLeadAndFire(
        combatant, tank, turret, target, cannon, solver, 10_000,
      )
      expect(result.fired).toBe(false)
      expect(result.reason).toBe('turret-jammed')
      expect(cannon.launchCalls).toHaveLength(0)
    })

    it('does not fire on a friendly (allied-faction) target', () => {
      const combatant = makeCombatant({ faction: Faction.US })
      const tank = makeChassis({ faction: Faction.US })
      const turret = makeTurret({
        barrelTip: new THREE.Vector3(0, 2, 0),
        barrelDir: new THREE.Vector3(0, 0, -1),
      })
      // ARVN is BLUFOR-allied to US.
      const friendly = makeTarget({ faction: Faction.ARVN, position: new THREE.Vector3(0, 2, -50) })

      const result = route.evaluateLeadAndFire(
        combatant, tank, turret, friendly, cannon, solver, 10_000,
      )
      expect(result.fired).toBe(false)
      expect(result.reason).toBe('friendly')
      expect(cannon.launchCalls).toHaveLength(0)
    })

    it('does not fire when there is no target', () => {
      const combatant = makeCombatant()
      const tank = makeChassis()
      const turret = makeTurret()
      const result = route.evaluateLeadAndFire(
        combatant, tank, turret, null, cannon, solver, 10_000,
      )
      expect(result.fired).toBe(false)
      expect(result.reason).toBe('no-target')
      expect(cannon.launchCalls).toHaveLength(0)
    })

    it('does not fire when the target is dead', () => {
      const combatant = makeCombatant()
      const tank = makeChassis()
      const turret = makeTurret({ barrelDir: new THREE.Vector3(0, 0, -1) })
      const deadTarget = makeTarget({ state: CombatantState.DEAD, health: 0 })
      const result = route.evaluateLeadAndFire(
        combatant, tank, turret, deadTarget, cannon, solver, 10_000,
      )
      expect(result.fired).toBe(false)
      expect(result.reason).toBe('no-target')
    })
  })

  describe('lead prediction', () => {
    it('asks the solver for a trajectory each evaluation', () => {
      const combatant = makeCombatant()
      const tank = makeChassis()
      const turret = makeTurret({ barrelDir: new THREE.Vector3(0, 0, -1) })
      const target = makeTarget({ position: new THREE.Vector3(0, 2, -50) })

      route.evaluateLeadAndFire(combatant, tank, turret, target, cannon, solver, 10_000)
      expect(solver.solveCalls).toBeGreaterThan(0)
    })

    it('aims ahead of a moving target so the turret slews toward the lead, not the current position', () => {
      const combatant = makeCombatant()
      const tank = makeChassis()
      // Barrel pose ignored for this assertion; we look at requested turret yaw.
      const turret = makeTurret({
        barrelTip: new THREE.Vector3(0, 2, 0),
        barrelDir: new THREE.Vector3(0, 0, -1),
      })
      // Target 50 m forward, sprinting +X at 10 m/s. With a meaningful
      // time-of-flight (solver returns 1 s), lead should be +X of current.
      const target = makeTarget({
        position: new THREE.Vector3(0, 2, -50),
        velocity: new THREE.Vector3(10, 0, 0),
      })
      const leadingSolver = makeSolver(1.0)

      route.evaluateLeadAndFire(combatant, tank, turret, target, cannon, leadingSolver, 10_000)

      // Requested yaw should be biased toward +X (positive) — at the current
      // position alone it would be 0. The intermediate refinement may write
      // multiple yaw values; the final requested yaw should reflect the lead.
      const finalYaw = turret.setYawCalls[turret.setYawCalls.length - 1]
      expect(finalYaw).toBeGreaterThan(0)
    })

    it('falls back to a kinematic estimate when the solver returns no samples', () => {
      const combatant = makeCombatant()
      const tank = makeChassis()
      const turret = makeTurret({
        barrelTip: new THREE.Vector3(0, 2, 0),
        barrelDir: new THREE.Vector3(0, 0, -1),
      })
      // Stationary target — the fallback is exercised by an empty-solver
      // return but the resulting lead must still match the static position.
      const target = makeTarget({ position: new THREE.Vector3(0, 2, -50) })
      const emptySolver: ITankBallisticSolver = {
        solve: () => [],
      }

      // The route must not throw on an empty solver result; the turret is
      // still slewed and (with the barrel already aimed at -Z onto the
      // static target) the cannon fires.
      const result = route.evaluateLeadAndFire(
        combatant, tank, turret, target, cannon, emptySolver, 10_000,
      )
      expect(turret.setYawCalls.length).toBeGreaterThan(0)
      expect(result.fired).toBe(true)
    })
  })

  describe('options', () => {
    it('honours a custom cone tolerance', () => {
      const tightRoute = new TankAIGunnerRoute({ coneToleranceRad: 0.001 })
      const combatant = makeCombatant()
      const tank = makeChassis()
      // Barrel points at (0,0,-1); target a hair above. With tolerance 0.001,
      // even a small angular offset blocks fire.
      const turret = makeTurret({
        barrelTip: new THREE.Vector3(0, 0, 0),
        barrelDir: new THREE.Vector3(0, 0, -1),
      })
      const target = makeTarget({ position: new THREE.Vector3(0, 1, -50) })

      const result = tightRoute.evaluateLeadAndFire(
        combatant, tank, turret, target, cannon, solver, 10_000,
      )
      expect(result.fired).toBe(false)
      expect(result.reason).toBe('aim-not-converged')
    })

    it('honours a custom reload time', () => {
      const fastRoute = new TankAIGunnerRoute({ reloadSeconds: 0.1 })
      const combatant = makeCombatant()
      const tank = makeChassis()
      const turret = makeTurret({ barrelDir: new THREE.Vector3(0, 0, -1) })
      const target = makeTarget({ position: new THREE.Vector3(0, 0, -50) })

      fastRoute.evaluateLeadAndFire(combatant, tank, turret, target, cannon, solver, 10_000)
      // 200 ms later — past the 100 ms reload.
      const r2 = fastRoute.evaluateLeadAndFire(combatant, tank, turret, target, cannon, solver, 10_200)
      expect(r2.fired).toBe(true)
    })
  })
})
