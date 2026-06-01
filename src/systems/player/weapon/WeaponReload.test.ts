import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { WeaponReload } from './WeaponReload'

/**
 * L1 behavior tests for WeaponReload.
 *
 * WeaponReload owns the reload-animation lifecycle. We assert the observable
 * contract a caller relies on:
 *   - whether a reload is allowed to start (gated by the caller's canReload())
 *   - whether it is currently animating
 *   - that it eventually settles (no longer animating)
 *   - that the bound magazine mesh is restored to its base transform when done
 *   - that the reload sound fires once at the start
 *
 * We deliberately do NOT assert on the per-stage easing magnitudes or the
 * RELOAD_ANIMATION_TIME constant - those are tuning values.
 */
describe('WeaponReload', () => {
  let reload: WeaponReload

  beforeEach(() => {
    reload = new WeaponReload()
  })

  describe('startReload gating', () => {
    it('starts and reports animating when canReload() allows it', () => {
      expect(reload.isAnimating()).toBe(false)

      const started = reload.startReload(() => true)

      expect(started).toBe(true)
      expect(reload.isAnimating()).toBe(true)
    })

    it('refuses to start when canReload() returns false', () => {
      const started = reload.startReload(() => false)

      expect(started).toBe(false)
      expect(reload.isAnimating()).toBe(false)
    })

    it('does not restart or re-check while already animating', () => {
      reload.startReload(() => true)

      const canReload = vi.fn(() => true)
      const startedAgain = reload.startReload(canReload)

      expect(startedAgain).toBe(false)
      // The guard short-circuits before consulting canReload again.
      expect(canReload).not.toHaveBeenCalled()
      expect(reload.isAnimating()).toBe(true)
    })
  })

  describe('animation lifecycle', () => {
    it('stays animating partway through and settles once enough time elapses', () => {
      reload.startReload(() => true)

      // A small step does not finish the reload.
      reload.update(0.1)
      expect(reload.isAnimating()).toBe(true)

      // A large step (well beyond the reload duration) completes it.
      reload.update(10)
      expect(reload.isAnimating()).toBe(false)
    })

    it('ignores update() when no reload is in progress', () => {
      // No reload started - update must be a no-op and leave offsets at rest.
      reload.update(5)

      expect(reload.isAnimating()).toBe(false)
      expect(reload.getReloadTranslation()).toEqual({ x: 0, y: 0, z: 0 })
      expect(reload.getReloadRotation()).toEqual({ x: 0, y: 0, z: 0 })
    })

    it('drives non-zero rig offsets while mid-reload and zeroes them on completion', () => {
      reload.startReload(() => true)

      // Advance into the middle of the animation where the gun is tilted.
      reload.update(0.5)
      const midRotation = reload.getReloadRotation()
      const midTranslation = reload.getReloadTranslation()
      const moved =
        midRotation.x !== 0 || midRotation.y !== 0 || midRotation.z !== 0 ||
        midTranslation.x !== 0 || midTranslation.y !== 0 || midTranslation.z !== 0
      expect(moved).toBe(true)

      // Finish the reload - all offsets return to rest.
      reload.update(10)
      expect(reload.getReloadRotation()).toEqual({ x: 0, y: 0, z: 0 })
      expect(reload.getReloadTranslation()).toEqual({ x: 0, y: 0, z: 0 })
      expect(reload.getMagazineOffset()).toEqual({ x: 0, y: 0, z: 0 })
      expect(reload.getMagazineRotation()).toEqual({ x: 0, y: 0, z: 0 })
    })
  })

  describe('audio feedback', () => {
    it('plays the reload sound once when a reload begins', () => {
      const audioManager = { playReloadSound: vi.fn() } as any
      reload.setAudioManager(audioManager)

      reload.startReload(() => true)

      expect(audioManager.playReloadSound).toHaveBeenCalledTimes(1)
    })

    it('does not play the reload sound when the reload is rejected', () => {
      const audioManager = { playReloadSound: vi.fn() } as any
      reload.setAudioManager(audioManager)

      reload.startReload(() => false)

      expect(audioManager.playReloadSound).not.toHaveBeenCalled()
    })
  })

  describe('magazine mesh handling', () => {
    it('moves the bound magazine mesh during the reload and restores it afterward', () => {
      const magazine = new THREE.Object3D()
      magazine.position.set(0.2, -0.25, 0)
      magazine.rotation.set(0, 0, 0.1)
      reload.setMagazineRef(magazine)

      const baseY = magazine.position.y

      reload.startReload(() => true)

      // Partway through, the magazine drops away from its base position.
      reload.update(0.7)
      expect(magazine.position.y).not.toBeCloseTo(baseY, 5)

      // After completion the magazine snaps back to its captured base transform.
      reload.update(10)
      expect(magazine.position.x).toBeCloseTo(0.2)
      expect(magazine.position.y).toBeCloseTo(-0.25)
      expect(magazine.position.z).toBeCloseTo(0)
      expect(magazine.rotation.z).toBeCloseTo(0.1)
    })

    it('completes cleanly when no magazine mesh is bound', () => {
      reload.startReload(() => true)
      // Should not throw with a missing magazine ref.
      expect(() => reload.update(10)).not.toThrow()
      expect(reload.isAnimating()).toBe(false)
    })
  })
})
