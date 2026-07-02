// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  EmplacementAIGunnerRoute,
  type EmplacementGunnerContext,
} from '../../systems/combat/ai/EmplacementAIGunnerRoute'
import {
  EmplacementMountTracker,
  STALE_TARGET_DISMOUNT_MS,
  type INpcEmplacementWeapon,
} from '../../systems/combat/ai/EmplacementSeekHelper'
import { Combatant, CombatantState, Faction, ITargetable } from '../../systems/combat/types'
import { NPCVehicleController } from '../../systems/vehicle/NPCVehicleController'
import { VehicleManager } from '../../systems/vehicle/VehicleManager'
import { Emplacement } from '../../systems/vehicle/Emplacement'

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

/**
 * L3 scenario tests for the mounted NPC emplacement-gunner route
 * (npc-m2hb-gunners, F5 activation).
 *
 * BEFORE THIS TASK: CombatantAI's IN_VEHICLE branch handled only tank
 * gunners; a combatant seated on an M2HB tripod sat inert forever. These
 * tests pin the route's behavior at the observable level:
 *   - fires at a hostile in the field-of-fire cone;
 *   - holds fire when the threat is out of the cone (and eventually dismounts);
 *   - dismounts when the belt empties or the threat leaves the cone > 5 s;
 *   - a killed gunner releases the seat so the tripod is re-mountable.
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
    velocity: new THREE.Vector3(),
    state: CombatantState.IN_VEHICLE,
    rotation: 0,
    kills: 0,
    deaths: 0,
    health: 100,
    maxHealth: 100,
    target: null,
  } as unknown as Combatant
}

function makeTarget(id: string, faction: Faction, position: THREE.Vector3): ITargetable {
  return {
    id,
    faction,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    health: 100,
    state: CombatantState.ENGAGING,
  } as ITargetable
}

/** Aim-at-threat weapon fake: cone points from the emplacement toward the threat. */
function makeWeapon(
  empPos: THREE.Vector3,
  threatPos: THREE.Vector3,
  opts: { empty?: boolean; fire?: () => boolean } = {},
): INpcEmplacementWeapon {
  const dir = threatPos.clone().sub(empPos)
  dir.y = 0
  if (dir.lengthSq() > 1e-6) dir.normalize()
  else dir.set(0, 0, 1)
  return {
    tryFire: opts.fire ?? (() => true),
    isEmpty: () => opts.empty === true,
    getFieldOfFireCone: () => ({
      origin: empPos.clone(),
      direction: dir.clone(),
      halfAngleRad: Math.PI / 6,
    }),
  }
}

describe('EmplacementAIGunnerRoute: mounted gunner fires + dismounts', () => {
  let tracker: EmplacementMountTracker
  let route: EmplacementAIGunnerRoute
  let emplacement: Emplacement

  beforeEach(() => {
    tracker = new EmplacementMountTracker()
    route = new EmplacementAIGunnerRoute(tracker)
    const root = new THREE.Object3D()
    root.position.set(0, 0, 0)
    emplacement = new Emplacement('m2hb_test', root, Faction.NVA)
  })

  function ctxFor(
    gunner: Combatant,
    weapon: INpcEmplacementWeapon,
    fire: (o: THREE.Vector3, d: THREE.Vector3) => boolean,
    dismount = vi.fn(() => true),
  ): EmplacementGunnerContext {
    return {
      vehicleId: 'm2hb_test',
      emplacement,
      weapon,
      fire,
      orderDismount: dismount,
    }
  }

  it('fires at a hostile inside the field-of-fire cone', () => {
    const gunner = makeCombatant('gunner', Faction.NVA)
    const threat = makeTarget('enemy', Faction.US, new THREE.Vector3(20, 0, 0))
    const fire = vi.fn(() => true)
    const weapon = makeWeapon(emplacement.getPosition(), threat.position)

    route.evaluate(gunner, ctxFor(gunner, weapon, fire), threat, 1000)

    expect(fire).toHaveBeenCalledTimes(1)
  })

  it('holds fire when the hostile is outside the cone', () => {
    const gunner = makeCombatant('gunner', Faction.NVA)
    const threat = makeTarget('enemy', Faction.US, new THREE.Vector3(20, 0, 0))
    // Cone points the opposite way (down -X) — the threat down +X is out of cone.
    const backwards = makeTarget('behind', Faction.US, new THREE.Vector3(-20, 0, 0))
    const fire = vi.fn(() => true)
    const weapon = makeWeapon(emplacement.getPosition(), backwards.position)

    route.evaluate(gunner, ctxFor(gunner, weapon, fire), threat, 1000)

    expect(fire).not.toHaveBeenCalled()
  })

  it('never fires on a friendly target (would only hit its own allies)', () => {
    const gunner = makeCombatant('gunner', Faction.NVA)
    const friendly = makeTarget('ally', Faction.NVA, new THREE.Vector3(20, 0, 0))
    const fire = vi.fn(() => true)
    const weapon = makeWeapon(emplacement.getPosition(), friendly.position)

    route.evaluate(gunner, ctxFor(gunner, weapon, fire), friendly, 1000)

    expect(fire).not.toHaveBeenCalled()
  })

  it('dismounts when the belt is empty', () => {
    const gunner = makeCombatant('gunner', Faction.NVA)
    const threat = makeTarget('enemy', Faction.US, new THREE.Vector3(20, 0, 0))
    const fire = vi.fn(() => true)
    const dismount = vi.fn(() => true)
    const weapon = makeWeapon(emplacement.getPosition(), threat.position, { empty: true })

    route.evaluate(gunner, ctxFor(gunner, weapon, fire, dismount), threat, 1000)

    expect(dismount).toHaveBeenCalledTimes(1)
    expect(fire).not.toHaveBeenCalled()
  })

  it('dismounts after the threat has been out of the cone longer than the stale window', () => {
    const gunner = makeCombatant('gunner', Faction.NVA)
    const inCone = makeTarget('enemy', Faction.US, new THREE.Vector3(20, 0, 0))
    const dismount = vi.fn(() => true)
    const weapon = makeWeapon(emplacement.getPosition(), inCone.position)

    // Tick once with the threat in cone to seed the stale-timer.
    route.evaluate(gunner, ctxFor(gunner, weapon, vi.fn(() => true), dismount), inCone, 1000)
    // The threat leaves the cone; before the window elapses no dismount.
    const outOfCone = makeTarget('enemy', Faction.US, new THREE.Vector3(-20, 0, 0))
    route.evaluate(gunner, ctxFor(gunner, weapon, vi.fn(() => true), dismount), outOfCone, 1000 + STALE_TARGET_DISMOUNT_MS - 1)
    expect(dismount).not.toHaveBeenCalled()
    // Past the window: dismount.
    route.evaluate(gunner, ctxFor(gunner, weapon, vi.fn(() => true), dismount), outOfCone, 1000 + STALE_TARGET_DISMOUNT_MS + 1)
    expect(dismount).toHaveBeenCalledTimes(1)
  })
})

describe('NPCVehicleController: a killed gunner releases the seat', () => {
  let vehicleManager: VehicleManager
  let controller: NPCVehicleController
  let combatants: Map<string, Combatant>

  beforeEach(async () => {
    vehicleManager = new VehicleManager()
    await vehicleManager.init()
    controller = new NPCVehicleController()
    combatants = new Map()
    controller.setVehicleManager(vehicleManager)
    controller.setCombatantProvider(() => combatants)
  })

  it('frees the gunner seat on death and lets another NPC re-mount the tripod', () => {
    const root = new THREE.Object3D()
    const emp = new Emplacement('m2hb_alpha', root, Faction.US)
    vehicleManager.register(emp)

    // Mount a gunner.
    const first = makeCombatant('first', Faction.US)
    first.state = CombatantState.PATROLLING
    combatants.set('first', first)
    expect(controller.orderBoard('first', 'm2hb_alpha', 'gunner')).toBe(true)
    controller.update(0.016)
    expect(first.state).toBe(CombatantState.IN_VEHICLE)
    expect(emp.hasFreeSeats('gunner')).toBe(false)

    // Gunner is killed while seated: state DEAD but still holds the vehicleId.
    first.state = CombatantState.DEAD

    // The controller releases the seat on its next tick.
    controller.update(0.016)
    expect(emp.getOccupant(0)).toBeNull()
    expect(emp.hasFreeSeats('gunner')).toBe(true)
    expect(first.vehicleId).toBeUndefined()

    // The tripod is re-mountable by a fresh NPC.
    const second = makeCombatant('second', Faction.US)
    second.state = CombatantState.PATROLLING
    combatants.set('second', second)
    expect(controller.orderBoard('second', 'm2hb_alpha', 'gunner')).toBe(true)
    controller.update(0.016)
    expect(second.state).toBe(CombatantState.IN_VEHICLE)
    expect(second.vehicleSeatIndex).toBe(0)
  })
})
