import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { AIStateEngage } from '../../systems/combat/ai/AIStateEngage'
import {
  UtilityScorer,
  DEFAULT_UTILITY_ACTIONS,
  INpcEmplacementVehicle,
  INpcEmplacementQuery,
  INpcEmplacementWeapon,
  EmplacementCandidateCache,
} from '../../systems/combat/ai/utility'
import { Combatant, CombatantState, Faction } from '../../systems/combat/types'
import { NPCVehicleController } from '../../systems/vehicle/NPCVehicleController'
import { VehicleManager } from '../../systems/vehicle/VehicleManager'
import { Emplacement } from '../../systems/vehicle/Emplacement'

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

/**
 * L3 integration test for the combat-reviewer's B1 fix
 * (emplacement-npc-gunner).
 *
 * Wires AIStateEngage's mountEmplacement intent to the REAL
 * NPCVehicleController + a REAL Emplacement registered with a real
 * VehicleManager and asserts the end-to-end state transition:
 *   ENGAGING -> orderBoard('gunner') -> BOARDING -> IN_VEHICLE (gunner seat).
 *
 * The previous AIStateEngage routing pre-set `combatant.vehicleId` and
 * relied on the unwired-controller path; that combination deadlocked
 * because `NPCVehicleController.orderBoard` rejects when `vehicleId` is
 * already set AND `updateBoarding()` only iterates its own queue. The
 * fix routes the intent through `orderBoard(..., 'gunner')` and lets
 * the controller drive the state transitions.
 */

function makeCombatant(
  id: string,
  faction: Faction,
  position = new THREE.Vector3(),
): Combatant {
  return {
    id,
    faction,
    position: position.clone(),
    state: CombatantState.ENGAGING,
    skillProfile: {
      reactionDelayMs: 100,
      visualRange: 100,
      burstLength: 3,
      burstPauseMs: 1000,
    },
    squadId: 'squad-1',
    squadRole: 'follower',
    rotation: 0,
    kills: 0,
    deaths: 0,
    health: 100,
    maxHealth: 100,
    target: null,
    previousState: undefined,
    isFullAuto: false,
    inCover: false,
    coverPosition: undefined,
    panicLevel: 0,
    lastHitTime: Date.now() - 5000,
    alertTimer: 5.0,
    currentBurst: 0,
    suppressionEndTime: undefined,
    suppressionTarget: undefined,
    lastKnownTargetPos: undefined,
    reactionTimer: 0,
  } as Combatant
}

function makeAimAtThreatResolver(
  empPos: THREE.Vector3,
  threatPos: THREE.Vector3,
): (vehicleId: string) => INpcEmplacementWeapon | null {
  const dir = threatPos.clone().sub(empPos)
  if (dir.lengthSq() > 1e-6) dir.normalize()
  else dir.set(0, 0, 1)
  return (_vehicleId: string) => ({
    tryFire: () => true,
    isEmpty: () => false,
    getFieldOfFireCone: () => ({
      origin: empPos.clone(),
      direction: dir.clone(),
      halfAngleRad: Math.PI / 6,
    }),
  })
}

describe('NPC gunner end-to-end: ENGAGING -> BOARDING -> IN_VEHICLE on the gunner seat', () => {
  let vehicleManager: VehicleManager
  let controller: NPCVehicleController
  let combatants: Map<string, Combatant>
  let engage: AIStateEngage
  const playerPosition = new THREE.Vector3()

  beforeEach(async () => {
    vehicleManager = new VehicleManager()
    await vehicleManager.init()
    controller = new NPCVehicleController()
    combatants = new Map()
    controller.setVehicleManager(vehicleManager)
    controller.setCombatantProvider(() => combatants)
    engage = new AIStateEngage()
  })

  function makeEmplacement(id: string, position: THREE.Vector3, faction: Faction = Faction.US): Emplacement {
    const root = new THREE.Object3D()
    root.position.copy(position)
    const emp = new Emplacement(id, root, faction)
    return emp
  }

  /**
   * Query that delegates to the real VehicleManager so vehicles register
   * naturally — keeps the integration path close to production.
   */
  function makeQueryOverManager(): INpcEmplacementQuery {
    return {
      getVehiclesInRadius(center, radius) {
        const all = vehicleManager.getVehiclesInRadius(center, radius)
        const out: INpcEmplacementVehicle[] = []
        for (const v of all) {
          if (v.category === 'emplacement') {
            out.push(v as unknown as INpcEmplacementVehicle)
          }
        }
        return out
      },
    }
  }

  function tickAi(npc: Combatant) {
    engage.handleEngaging(
      npc,
      0.016,
      playerPosition,
      combatants,
      undefined,
      () => true,
      () => false,
      () => null,
      () => 0,
      () => false,
    )
  }

  it('a friendly NPC near an unoccupied friendly emplacement with enemy in cone reaches IN_VEHICLE within 30 frames', () => {
    // Spawn an unoccupied US emplacement 2 m down +X (well inside BOARD_RANGE=5).
    const empPos = new THREE.Vector3(2, 0, 0)
    const emp = makeEmplacement('m2hb_alpha', empPos, Faction.US)
    vehicleManager.register(emp)

    // Friendly US NPC at origin with an NVA target 20 m down +X.
    const npc = makeCombatant('gunner_npc', Faction.US, new THREE.Vector3())
    const target = makeCombatant('enemy', Faction.NVA, new THREE.Vector3(20, 0, 0))
    npc.target = target
    combatants.set('gunner_npc', npc)
    combatants.set('enemy', target)

    // Wire engage with: live query over VehicleManager, resolver supplying
    // a cone aimed at the threat, real NPCVehicleController as the
    // boarding surface (it satisfies INpcVehicleBoarding by structural
    // shape — orderBoard(id, vid, 'gunner')).
    engage.setUtilityScorer(new UtilityScorer(DEFAULT_UTILITY_ACTIONS))
    engage.setCoverBearingProbe(() => false)
    engage.setEmplacementQuery(makeQueryOverManager())
    engage.setEmplacementWeaponResolver(
      makeAimAtThreatResolver(empPos, new THREE.Vector3(20, 0, 0)),
    )
    engage.setNpcVehicleBoarding(controller)

    // Step the engine for up to 30 frames @ 60fps. AIStateEngage routes
    // through orderBoard on the first tick where mountEmplacement wins;
    // NPCVehicleController then completes the BOARDING -> IN_VEHICLE
    // transition on the same frame (the NPC starts within BOARD_RANGE).
    let reachedInVehicle = false
    for (let frame = 0; frame < 30; frame++) {
      tickAi(npc)
      controller.update(0.016)
      if (npc.state === CombatantState.IN_VEHICLE) {
        reachedInVehicle = true
        break
      }
    }

    expect(reachedInVehicle).toBe(true)
    expect(npc.vehicleId).toBe('m2hb_alpha')
    // Gunner seat (index 0 per Emplacement DEFAULT_SEATS), not passenger (index 1).
    expect(npc.vehicleSeatIndex).toBe(0)
    // The Emplacement reports the gunner is the new occupant of seat 0.
    expect(emp.getOccupant(0)).toBe('gunner_npc')
    // Gunner-seat free-flag is now false; passenger seat is still free.
    expect(emp.hasFreeSeats('gunner')).toBe(false)
    expect(emp.hasFreeSeats('passenger')).toBe(true)
  })

  it('an NPC seeking the gunner seat is rejected when another NPC already mounted', () => {
    // First NPC mounts; second NPC's orderBoard for 'gunner' should
    // reject because the gunner seat is taken (even though passenger is
    // free — the previous boarding code used hasFreeSeats() without a
    // role and would have accepted, which was the B1 sub-defect).
    const empPos = new THREE.Vector3(2, 0, 0)
    const emp = makeEmplacement('m2hb_alpha', empPos, Faction.US)
    vehicleManager.register(emp)

    const first = makeCombatant('first', Faction.US, new THREE.Vector3())
    combatants.set('first', first)
    expect(controller.orderBoard('first', 'm2hb_alpha', 'gunner')).toBe(true)
    controller.update(0.016)
    expect(first.state).toBe(CombatantState.IN_VEHICLE)

    const second = makeCombatant('second', Faction.US, new THREE.Vector3())
    combatants.set('second', second)
    // Gunner-seat boarding should reject — second NPC stays patrolling.
    expect(controller.orderBoard('second', 'm2hb_alpha', 'gunner')).toBe(false)
    expect(second.state).not.toBe(CombatantState.BOARDING)
    // But the passenger seat is still free; passenger boarding works.
    expect(controller.orderBoard('second', 'm2hb_alpha', 'passenger')).toBe(true)
    controller.update(0.016)
    expect(second.state).toBe(CombatantState.IN_VEHICLE)
    expect(second.vehicleSeatIndex).toBe(1) // passenger seat
  })
})

describe('EmplacementCandidateCache: B2 hot-path budget', () => {
  it('a 500 ms TTL caps live scans at 1 per combatant per window even at 60fps', () => {
    // Per the brief: hammer the path and confirm the scan count stays
    // bounded. We assert against the live-scan compute fn directly so
    // the assertion is independent of internal data structures.
    const cache = new EmplacementCandidateCache()
    let scanCount = 0
    const compute = () => {
      scanCount += 1
      return { vehicleId: 'm2hb_alpha', distance: 2, threatInCone: true }
    }

    // 10 frames at 16.67 ms each (160 ms total) — well inside the 500 ms TTL.
    // 1 NPC: exactly 1 scan expected (the first tick fills the cache).
    const baseMs = 1000
    for (let frame = 0; frame < 10; frame++) {
      cache.getOrCompute('npc_1', baseMs + frame * 16.67, compute)
    }
    expect(scanCount).toBe(1)

    // 100 NPCs across the same 10 frames: 100 scans (one per NPC), not
    // 1000 — the cache is per-combatant. The brief's "100 NPCs × 10
    // frames" scenario expects no per-tick re-scan. Clear first so the
    // prior single-NPC run doesn't bias the count.
    cache.clear()
    scanCount = 0
    for (let frame = 0; frame < 10; frame++) {
      for (let n = 0; n < 100; n++) {
        cache.getOrCompute(`npc_${n}`, baseMs + frame * 16.67, compute)
      }
    }
    expect(scanCount).toBe(100)

    // After the TTL elapses the cache refreshes once per combatant.
    scanCount = 0
    cache.getOrCompute('npc_1', baseMs + 10 * 16.67, compute) // still cached
    expect(scanCount).toBe(0)
    cache.getOrCompute('npc_1', baseMs + 600, compute) // past 500 ms TTL
    expect(scanCount).toBe(1)
  })

  it('invalidate() forces a fresh scan on the next call', () => {
    const cache = new EmplacementCandidateCache()
    let scanCount = 0
    const compute = () => {
      scanCount += 1
      return null
    }
    cache.getOrCompute('npc_1', 1000, compute)
    cache.getOrCompute('npc_1', 1100, compute)
    expect(scanCount).toBe(1)
    cache.invalidate('npc_1')
    cache.getOrCompute('npc_1', 1100, compute)
    expect(scanCount).toBe(2)
  })
})
