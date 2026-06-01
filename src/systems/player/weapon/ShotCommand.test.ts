import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { ShotCommandFactory } from './ShotCommand'

/**
 * L1 behavior tests for ShotCommandFactory.
 *
 * The factory's observable contract is the ShotCommand it produces and the way
 * it recycles Ray objects from a frame-scoped pool. We assert on those outputs,
 * not on the pool's internal indices.
 */
describe('ShotCommandFactory', () => {
  beforeEach(() => {
    // Each "frame" starts from a clean pool cursor.
    ShotCommandFactory.resetPool()
  })

  describe('createSingleShot', () => {
    it('builds a command carrying the requested weapon type, ADS flag and damage fn', () => {
      const origin = new THREE.Vector3(1, 2, 3)
      const direction = new THREE.Vector3(0, 0, -2) // not unit length on purpose
      const damage = (d: number, head: boolean) => (head ? d * 2 : d)

      const command = ShotCommandFactory.createSingleShot(origin, direction, 'smg', damage, true)

      expect(command.weaponType).toBe('smg')
      expect(command.isADS).toBe(true)
      expect(command.damage).toBe(damage)
      expect(command.damage(10, true)).toBe(20)
      expect(command.pelletRays).toBeUndefined()
    })

    it('copies the origin and stores a normalized direction without mutating the inputs', () => {
      const origin = new THREE.Vector3(5, -1, 4)
      const direction = new THREE.Vector3(0, 0, -3)

      const command = ShotCommandFactory.createSingleShot(
        origin,
        direction,
        'rifle',
        () => 30,
        false
      )

      // Ray origin matches the supplied origin.
      expect(command.ray.origin.x).toBeCloseTo(5)
      expect(command.ray.origin.y).toBeCloseTo(-1)
      expect(command.ray.origin.z).toBeCloseTo(4)

      // Direction is unit length and points the same way as the input.
      expect(command.ray.direction.length()).toBeCloseTo(1)
      expect(command.ray.direction.z).toBeCloseTo(-1)

      // Caller's vectors are untouched (factory must copy, not alias).
      expect(direction.length()).toBeCloseTo(3)
      expect(origin.x).toBe(5)
    })

    it('stamps a non-decreasing timestamp', () => {
      const a = ShotCommandFactory.createSingleShot(
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, -1),
        'pistol',
        () => 1,
        false
      )
      const b = ShotCommandFactory.createSingleShot(
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, -1),
        'pistol',
        () => 1,
        false
      )
      expect(typeof a.timestamp).toBe('number')
      expect(b.timestamp).toBeGreaterThanOrEqual(a.timestamp)
    })
  })

  describe('createShotgunShot', () => {
    it('produces one pellet ray per pellet direction plus the base ray', () => {
      const origin = new THREE.Vector3(0, 1, 0)
      const base = new THREE.Vector3(0, 0, -1)
      const pellets = [
        new THREE.Vector3(0.1, 0, -1),
        new THREE.Vector3(-0.1, 0, -1),
        new THREE.Vector3(0, 0.1, -1),
      ]

      const command = ShotCommandFactory.createShotgunShot(origin, base, pellets, () => 8, false)

      expect(command.weaponType).toBe('shotgun')
      expect(command.pelletRays).toBeDefined()
      expect(command.pelletRays!.length).toBe(3)

      // Every pellet ray starts at the shared origin and is normalized.
      for (const ray of command.pelletRays!) {
        expect(ray.origin.x).toBeCloseTo(0)
        expect(ray.origin.y).toBeCloseTo(1)
        expect(ray.origin.z).toBeCloseTo(0)
        expect(ray.direction.length()).toBeCloseTo(1)
      }
    })

    it('preserves the relative aim of each pellet direction', () => {
      const pellets = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ]
      const command = ShotCommandFactory.createShotgunShot(
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, -1),
        pellets,
        () => 8,
        false
      )

      // First pellet pointed +X, second pointed -Z; normalization keeps direction.
      expect(command.pelletRays![0].direction.x).toBeCloseTo(1)
      expect(command.pelletRays![1].direction.z).toBeCloseTo(-1)
    })
  })

  describe('ray pooling across frames', () => {
    it('hands back stable Ray instances that are reused after resetPool', () => {
      const first = ShotCommandFactory.createSingleShot(
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, -1),
        'rifle',
        () => 1,
        false
      )
      const firstRay = first.ray

      // New frame: pool cursor resets, so the same Ray object is recycled.
      ShotCommandFactory.resetPool()
      const second = ShotCommandFactory.createSingleShot(
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, -1),
        'rifle',
        () => 1,
        false
      )

      expect(second.ray).toBe(firstRay)
    })

    it('does not alias rays issued within the same frame', () => {
      const a = ShotCommandFactory.createSingleShot(
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, -1),
        'rifle',
        () => 1,
        false
      )
      const b = ShotCommandFactory.createSingleShot(
        new THREE.Vector3(),
        new THREE.Vector3(1, 0, 0),
        'rifle',
        () => 1,
        false
      )
      expect(a.ray).not.toBe(b.ray)
      // The earlier command's ray is not overwritten by the later one.
      expect(a.ray.direction.z).toBeCloseTo(-1)
      expect(b.ray.direction.x).toBeCloseTo(1)
    })

    it('keeps the base ray and pellet rays distinct within one shotgun command', () => {
      const command = ShotCommandFactory.createShotgunShot(
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, -1),
        [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
        () => 8,
        false
      )
      expect(command.pelletRays![0]).not.toBe(command.ray)
      expect(command.pelletRays![0]).not.toBe(command.pelletRays![1])
    })
  })
})
