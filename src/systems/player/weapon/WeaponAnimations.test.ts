// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { WeaponAnimations } from './WeaponAnimations'

// Mock Logger
vi.mock('../../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock Three.js
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three')

  class MockObject3D {
    position = new actual.Vector3(0, 0, 0);
    userData: Record<string, any> = {};
  }

  class MockCamera extends actual.Camera {
    fov = 75;
    updateProjectionMatrix = vi.fn();
    isPerspectiveCamera = false;
  }

  class MockPerspectiveCamera extends MockCamera {
    isPerspectiveCamera = true;
    constructor(fov = 75, _aspect = 1, _near = 0.1, _far = 1000) {
      super();
      this.fov = fov;
    }
  }

  return {
    ...actual, // Import actual Vector3, MathUtils etc.
    Camera: MockCamera,
    PerspectiveCamera: MockPerspectiveCamera,
    Object3D: MockObject3D,
  };
});

describe('WeaponAnimations', () => {
  let camera: THREE.PerspectiveCamera
  let animations: WeaponAnimations

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000)
    animations = new WeaponAnimations(camera)
    vi.clearAllMocks() // Clear mocks between tests
  })

  // Constructor & setCamera()
  describe('Constructor & setCamera()', () => {
    it('stores camera reference and baseFOV from PerspectiveCamera on construction', () => {
      // @ts-ignore - Accessing private property for testing
      expect(animations.camera).toBe(camera)
      // @ts-ignore
      expect(animations.baseFOV).toBe(75)
    })

    it('setCamera updates the internal camera ref and baseFOV', () => {
      const newCamera = new THREE.PerspectiveCamera(90, 16 / 9, 0.1, 1000)
      animations.setCamera(newCamera)
      // @ts-ignore
      expect(animations.camera).toBe(newCamera)
      // @ts-ignore
      expect(animations.baseFOV).toBe(90)
    })

    it('setCamera does not update baseFOV if camera is not PerspectiveCamera', () => {
      const newCamera = new THREE.Camera() // A generic Camera, not PerspectiveCamera
      animations.setCamera(newCamera)
      // @ts-ignore
      expect(animations.camera).toBe(newCamera)
      // @ts-ignore
      expect(animations.baseFOV).toBe(75) // Should remain the original baseFOV
    })
  })

  // ADS (Aim Down Sights)
  describe('ADS (Aim Down Sights)', () => {
    it('setADS(true) and getADS() returns true', () => {
      animations.setADS(true)
      expect(animations.getADS()).toBe(true)
    })

    it('setADS(false) and getADS() returns false', () => {
      animations.setADS(false)
      expect(animations.getADS()).toBe(false)
    })

    it('ADS progress transitions from 0 toward 1 when ADS enabled (call update multiple times)', () => {
      animations.setADS(true)
      expect(animations.getADSProgress()).toBe(0)

      animations.update(0.05, false, new THREE.Vector3()) // Simulate some time
      const progress1 = animations.getADSProgress()
      expect(progress1).toBeGreaterThan(0)
      expect(progress1).toBeLessThan(1)

      animations.update(0.05, false, new THREE.Vector3())
      const progress2 = animations.getADSProgress()
      expect(progress2).toBeGreaterThan(progress1)
      expect(progress2).toBeLessThan(1)

      // Eventually reaches 1
      animations.update(1, false, new THREE.Vector3())
      expect(animations.getADSProgress()).toBeCloseTo(1)
    })

    it('ADS progress transitions from 1 toward 0 when ADS disabled', () => {
      // First, set ADS to true and let it complete
      animations.setADS(true)
      animations.update(1, false, new THREE.Vector3())
      expect(animations.getADSProgress()).toBeCloseTo(1)

      animations.setADS(false)
      animations.update(0.05, false, new THREE.Vector3())
      const progress1 = animations.getADSProgress()
      expect(progress1).toBeLessThan(1)
      expect(progress1).toBeGreaterThan(0)

      animations.update(0.05, false, new THREE.Vector3())
      const progress2 = animations.getADSProgress()
      expect(progress2).toBeLessThan(progress1)
      expect(progress2).toBeGreaterThan(0)

      // Eventually reaches 0
      animations.update(1, false, new THREE.Vector3())
      expect(animations.getADSProgress()).toBeCloseTo(0)
    })

    it('FOV changes when ADS is active (zooms in)', () => {
      const initialFov = camera.fov
      animations.setADS(true)
      animations.update(1, false, new THREE.Vector3()) // Let ADS complete
      expect(camera.fov).toBeLessThan(initialFov)
      expect(camera.fov).toBeCloseTo(initialFov / 1.3)
    })

    it('FOV returns to baseFOV when ADS disabled', () => {
      // First, set ADS to true and let it complete
      const initialFov = camera.fov
      animations.setADS(true)
      animations.update(1, false, new THREE.Vector3())
      expect(camera.fov).toBeLessThan(initialFov)

      animations.setADS(false)
      animations.update(1, false, new THREE.Vector3()) // Let ADS disable complete
      expect(camera.fov).toBeCloseTo(initialFov)
    })

    it('updateProjectionMatrix called during update when PerspectiveCamera FOV changes', () => {
      animations.setADS(true)
      animations.update(0.05, false, new THREE.Vector3())
      expect(camera.updateProjectionMatrix).toHaveBeenCalled()
    })

    it('does not refresh the projection matrix on stable hip-fire frames', () => {
      animations.update(0.05, false, new THREE.Vector3())
      animations.update(0.05, false, new THREE.Vector3())
      expect(camera.fov).toBe(75)
      expect(camera.updateProjectionMatrix).not.toHaveBeenCalled()
    })

    it('updateProjectionMatrix not called if camera is not PerspectiveCamera', () => {
      const genericCamera = new THREE.Camera()
      genericCamera.updateProjectionMatrix = vi.fn()
      animations.setCamera(genericCamera)

      animations.setADS(true)
      animations.update(0.05, false, new THREE.Vector3())
      expect(genericCamera.updateProjectionMatrix).not.toHaveBeenCalled()
    })
  })

  // Recoil System (Spring Physics)
  describe('Recoil System (Spring Physics)', () => {
    it('applyRecoilImpulse() sets non-zero velocity', () => {
      const _initialVelocity = animations.getRecoilOffset() // This returns offset, but we want to check velocity
      // @ts-ignore
      expect(animations.weaponRecoilVelocity.x).toBe(0)
      // @ts-ignore
      expect(animations.weaponRecoilVelocity.y).toBe(0)
      // @ts-ignore
      expect(animations.weaponRecoilVelocity.z).toBe(0)
      // @ts-ignore
      expect(animations.weaponRecoilVelocity.rotX).toBe(0)

      animations.applyRecoilImpulse(1)

      // @ts-ignore
      expect(animations.weaponRecoilVelocity.x).not.toBe(0)
      // @ts-ignore
      expect(animations.weaponRecoilVelocity.y).toBeGreaterThan(0)
      // @ts-ignore
      expect(animations.weaponRecoilVelocity.z).toBeLessThan(0)
      // @ts-ignore
      expect(animations.weaponRecoilVelocity.rotX).toBeGreaterThan(0)
    })

    it('After recoil, update() gradually returns offset toward zero (spring recovery)', () => {
      animations.applyRecoilImpulse(1)
      const initialOffset = animations.getRecoilOffset()
      expect(initialOffset.y).toBe(0) // Offset should be zero initially after impulse
      expect(initialOffset.z).toBe(0)

      animations.update(0.016, false, new THREE.Vector3()) // Simulate one frame
      const offsetAfter1 = animations.getRecoilOffset()
      expect(offsetAfter1.y).toBeGreaterThan(0) // Should have moved due to velocity
      expect(offsetAfter1.z).toBeLessThan(0)
      expect(offsetAfter1.rotX).toBeGreaterThan(0)

      for (let i = 0; i < 200; i++) {
        animations.update(0.016, false, new THREE.Vector3()) // Simulate many frames
      }
      const finalOffset = animations.getRecoilOffset()
      expect(finalOffset.x).toBeCloseTo(0, 2)
      expect(finalOffset.y).toBeCloseTo(0, 2)
      expect(finalOffset.z).toBeCloseTo(0, 2)
      expect(finalOffset.rotX).toBeCloseTo(0, 2)
    })

    it('getRecoilOffset() reflects current offset state', () => {
      animations.applyRecoilImpulse(1)
      animations.update(0.016, false, new THREE.Vector3())
      const offset = animations.getRecoilOffset()
      expect(offset.x).not.toBe(0)
      expect(offset.y).not.toBe(0)
      expect(offset.z).not.toBe(0)
      expect(offset.rotX).not.toBe(0)
    })

    it('Larger recoilMultiplier produces larger velocity', () => {
      animations.applyRecoilImpulse(0.5)
      // @ts-ignore
      const velocity1 = { ...animations.weaponRecoilVelocity }

      animations.reset() // Reset state
      animations.applyRecoilImpulse(1.0)
      // @ts-ignore
      const velocity2 = { ...animations.weaponRecoilVelocity }

      expect(Math.abs(velocity2.y)).toBeGreaterThan(Math.abs(velocity1.y))
      expect(Math.abs(velocity2.z)).toBeGreaterThan(Math.abs(velocity1.z))
      expect(Math.abs(velocity2.rotX)).toBeGreaterThan(Math.abs(velocity1.rotX))
    })

    // Helper: peak upward viewmodel offset a settling spring reaches.
    const peakUpwardOffset = (anim: WeaponAnimations, frames = 90, dt = 1 / 60): number => {
      let peak = 0
      for (let i = 0; i < frames; i++) {
        anim.update(dt, false, new THREE.Vector3())
        peak = Math.max(peak, anim.getRecoilOffset().y)
      }
      return peak
    }

    it('sustained automatic fire never rides the viewmodel above a believable height', () => {
      // Measure a single shot's natural peak first (the snap we must preserve).
      animations.applyRecoilImpulse(1)
      const singleShotPeak = peakUpwardOffset(animations)
      animations.reset()

      // Now hammer the gun at a realistic automatic cadence: fire roughly every
      // ~5 frames at 60fps so the spring never fully relaxes between shots.
      let maxOffset = 0
      const dt = 1 / 60
      let sinceShot = 0
      for (let frame = 0; frame < 360; frame++) {
        if (sinceShot <= 0) {
          animations.applyRecoilImpulse(1)
          sinceShot = 5
        }
        animations.update(dt, false, new THREE.Vector3())
        sinceShot--
        maxOffset = Math.max(maxOffset, animations.getRecoilOffset().y)
      }

      // The gun used to stack to ~2.5x a single shot under sustained fire; it must
      // now hold a believable height — never far above what one shot produces.
      expect(maxOffset).toBeLessThan(singleShotPeak * 1.6)
    })

    it("a single shot's peak kick is visually unchanged by the saturation clamp", () => {
      // A lone shot is well within headroom, so neither the headroom-scaling nor
      // the hard clamp should noticeably alter its peak. Compare against the
      // analytic peak of the un-clamped spring impulse (y velocity 1.2).
      animations.applyRecoilImpulse(1)
      const peak = peakUpwardOffset(animations)

      // Un-clamped single-shot peak for this spring is ~0.040 world units.
      expect(peak).toBeGreaterThan(0.035)
      expect(peak).toBeCloseTo(0.04, 2)
    })
  })

  // Idle Bob & Sway
  describe('Idle Bob & Sway', () => {
    it('getBobOffset() changes over time during update (idle time accumulates)', () => {
      animations.update(0.016, false, new THREE.Vector3()) // Prime idleTime
      expect(animations.getBobOffset().x).not.toBe(0) // Ensure initial non-zero
      expect(animations.getBobOffset().y).not.toBe(0)

      const initialBobX = animations.getBobOffset().x
      const initialBobY = animations.getBobOffset().y

      // Advance idleTime again and expect a different value
      animations.update(0.016, false, new THREE.Vector3())
      const newBobX = animations.getBobOffset().x
      const newBobY = animations.getBobOffset().y

      expect(newBobX).not.toBe(initialBobX)
      expect(newBobY).not.toBe(initialBobY)
    })

    it('Moving bob (isMoving=true) has larger amplitude than standing', () => {
      const standingBobAmplitudes: { x: number; y: number }[] = []
      const movingBobAmplitudes: { x: number; y: number }[] = []

      for (let i = 0; i < 100; i++) {
        animations.update(0.016, false, new THREE.Vector3()) // Standing
        const bob = animations.getBobOffset()
        standingBobAmplitudes.push({ x: Math.abs(bob.x), y: Math.abs(bob.y) })
      }

      animations.reset()

      for (let i = 0; i < 100; i++) {
        animations.update(0.016, true, new THREE.Vector3()) // Moving
        const bob = animations.getBobOffset()
        movingBobAmplitudes.push({ x: Math.abs(bob.x), y: Math.abs(bob.y) })
      }

      const maxStandingX = Math.max(...standingBobAmplitudes.map(b => b.x))
      const maxStandingY = Math.max(...standingBobAmplitudes.map(b => b.y))
      const maxMovingX = Math.max(...movingBobAmplitudes.map(b => b.x))
      const maxMovingY = Math.max(...movingBobAmplitudes.map(b => b.y))

      expect(maxMovingX).toBeGreaterThan(maxStandingX)
      expect(maxMovingY).toBeGreaterThan(maxStandingY)
    })

    it('getSwayOffset() changes based on lookVelocity magnitude', () => {
      const initialSway = animations.getSwayOffset()
      expect(initialSway.x).toBe(0)
      expect(initialSway.y).toBe(0)

      // Test with small look velocity
      animations.update(0.016, false, new THREE.Vector3(1, 0, 0))
      const sway1 = animations.getSwayOffset()
      expect(sway1.x).toBeGreaterThan(0)
      expect(sway1.y).toBeGreaterThan(0)

      animations.reset()

      // Test with larger look velocity
      animations.update(0.016, false, new THREE.Vector3(10, 0, 0))
      const sway2 = animations.getSwayOffset()
      expect(sway2.x).toBeGreaterThan(sway1.x)
      expect(sway2.y).toBeGreaterThan(sway1.y)

      animations.reset()

      // Test with zero look velocity, sway should decay over multiple updates
      // Use a larger initial lookVelocity to ensure a more significant swayActive value
      animations.update(0.016, false, new THREE.Vector3(100, 0, 0)) // Apply some sway with high look velocity
      const swayActiveX = animations.getSwayOffset().x
      const swayActiveY = animations.getSwayOffset().y
      
      // Simulate more frames with zero look velocity for decay
      for (let i = 0; i < 100; i++) { // Increased frames for more pronounced decay
        animations.update(0.016, false, new THREE.Vector3(0, 0, 0))
      }
      const swayDecay = animations.getSwayOffset()
      expect(swayDecay.x).toBeLessThan(swayActiveX)
      expect(swayDecay.y).toBeLessThan(swayActiveY)
      expect(swayDecay.x).toBeCloseTo(0, 3) // Should decay close to 0
      expect(swayDecay.y).toBeCloseTo(0, 3)
    })

    it('preserves proportional sway below the look-velocity cap', () => {
      const sqrtSpy = vi.spyOn(Math, 'sqrt')

      try {
        animations.update(0.016, false, new THREE.Vector3(3, 4, 0))

        expect(sqrtSpy).toHaveBeenCalledWith(25)
        expect(animations.getSwayOffset().x).toBeCloseTo(0.00128)
        expect(animations.getSwayOffset().y).toBeCloseTo(0.00128)
      } finally {
        sqrtSpy.mockRestore()
      }
    })

    it('saturates sway at and above the look-velocity cap', () => {
      animations.update(0.016, false, new THREE.Vector3(10, 0, 0))

      expect(animations.getSwayOffset().x).toBeCloseTo(0.00256)
      expect(animations.getSwayOffset().y).toBeCloseTo(0.00256)

      animations.reset()
      animations.update(0.016, false, new THREE.Vector3(50, 0, 0))

      expect(animations.getSwayOffset().x).toBeCloseTo(0.00256)
      expect(animations.getSwayOffset().y).toBeCloseTo(0.00256)
    })

    it('skips exact look-velocity square root once sway is saturated', () => {
      const sqrtSpy = vi.spyOn(Math, 'sqrt')

      try {
        animations.update(0.016, false, new THREE.Vector3(50, 0, 0))

        expect(sqrtSpy).not.toHaveBeenCalled()
        expect(animations.getSwayOffset().x).toBeGreaterThan(0)
      } finally {
        sqrtSpy.mockRestore()
      }
    })
  })

  // Pump Animation (Shotgun)
  describe('Pump Animation (Shotgun)', () => {
    let mockPumpGrip: THREE.Object3D

    beforeEach(() => {
      mockPumpGrip = new THREE.Object3D()
      mockPumpGrip.position.set(0, 0, 0)
      animations.setPumpGripRef(mockPumpGrip)
      // @ts-ignore
      animations.PUMP_ANIMATION_TIME = 0.35 // Ensure consistent time for testing
    })

    it('startPumpAnimation() sets isPumpAnimating true', () => {
      expect(animations.getIsPumpAnimating()).toBe(false)
      animations.startPumpAnimation()
      expect(animations.getIsPumpAnimating()).toBe(true)
    })

    it('getIsPumpAnimating() returns animation state', () => {
      animations.startPumpAnimation()
      expect(animations.getIsPumpAnimating()).toBe(true)
      // Let animation complete
      animations.update(1, false, new THREE.Vector3())
      expect(animations.getIsPumpAnimating()).toBe(false)
    })

    it('Pump animation completes after PUMP_ANIMATION_TIME', () => {
      animations.startPumpAnimation()
      expect(animations.getIsPumpAnimating()).toBe(true)

      animations.update(0.3, false, new THREE.Vector3()) // Just before completion
      expect(animations.getIsPumpAnimating()).toBe(true)

      animations.update(0.05, false, new THREE.Vector3()) // Exactly at or after completion
      expect(animations.getIsPumpAnimating()).toBe(false)
    })

    it(`Double-calling startPumpAnimation doesn't restart mid-animation`, () => {
      animations.startPumpAnimation()
      animations.update(0.1, false, new THREE.Vector3()) // Mid-animation
      const _progressMid = animations.getIsPumpAnimating()
      // @ts-ignore
      const pumpProgressBefore = animations.pumpAnimationProgress

      animations.startPumpAnimation() // Call again
      animations.update(0.05, false, new THREE.Vector3()) // Advance slightly

      // @ts-ignore
      expect(animations.pumpAnimationProgress).toBeGreaterThan(pumpProgressBefore) // Should continue, not reset
      expect(animations.getIsPumpAnimating()).toBe(true)
    })

    it('Pump grip ref position changes during animation (if setPumpGripRef set)', () => {
      const initialX = mockPumpGrip.position.x
      animations.startPumpAnimation()
      animations.update(0.05, false, new THREE.Vector3()) // Advance slightly
      expect(mockPumpGrip.position.x).not.toBe(initialX)
      expect(mockPumpGrip.position.x).toBeLessThan(initialX) // Should move backward (negative X)

      animations.update(0.1, false, new THREE.Vector3()) // More progress
      expect(mockPumpGrip.position.x).toBeLessThan(initialX) // Still backward or returning
    })

    it('Pump grip ref position returns to original after animation completes', () => {
      const initialX = mockPumpGrip.position.x
      animations.startPumpAnimation()
      animations.update(1, false, new THREE.Vector3()) // Let animation complete
      expect(mockPumpGrip.position.x).toBeCloseTo(initialX, 3) // Close to original, allowing for float error
    })

    it('pumpGripRef userData.originalX is set and used', () => {
      animations.startPumpAnimation();
      animations.update(0.01, false, new THREE.Vector3());
      expect(mockPumpGrip.userData.originalX).toBeDefined();
      expect(mockPumpGrip.userData.originalX).toBe(0); // Assuming initial position is 0
    });
  })

  // Position Getters
  describe('Position Getters', () => {
    it('getBasePosition() returns correct values', () => {
      const pos = animations.getBasePosition()
      expect(pos).toEqual({ x: 0.5, y: -0.6, z: -0.82 })
    })

    it('getADSPosition() returns correct values', () => {
      const pos = animations.getADSPosition()
      expect(pos).toEqual({ x: 0.0, y: -0.18, z: -0.55 })
    })
  })

  // reset()
  describe('reset()', () => {
    it('Resets ADS state to false, adsProgress to 0', () => {
      animations.setADS(true)
      animations.update(1, false, new THREE.Vector3()) // Complete ADS
      animations.reset()
      expect(animations.getADS()).toBe(false)
      expect(animations.getADSProgress()).toBe(0)
    })

    it('Resets recoil offset and velocity to zero', () => {
      animations.applyRecoilImpulse(1)
      animations.update(0.016, false, new THREE.Vector3()) // Apply some recoil
      expect(animations.getRecoilOffset().y).not.toBe(0)

      animations.reset()
      const recoilOffset = animations.getRecoilOffset()
      // @ts-ignore
      const recoilVelocity = animations.weaponRecoilVelocity
      expect(recoilOffset.x).toBe(0)
      expect(recoilOffset.y).toBe(0)
      expect(recoilOffset.z).toBe(0)
      expect(recoilOffset.rotX).toBe(0)
      expect(recoilVelocity.x).toBe(0)
      expect(recoilVelocity.y).toBe(0)
      expect(recoilVelocity.z).toBe(0)
      expect(recoilVelocity.rotX).toBe(0)
    })

    it('Resets idleTime and bobOffset and swayOffset', () => {
      animations.update(0.1, true, new THREE.Vector3(5, 5, 5)) // Create some idle/bob/sway
      expect(animations.getBobOffset().x).not.toBe(0)
      expect(animations.getSwayOffset().x).not.toBe(0)
      // @ts-ignore
      expect(animations.idleTime).not.toBe(0)

      animations.reset()
      expect(animations.getBobOffset().x).toBe(0)
      expect(animations.getBobOffset().y).toBe(0)
      expect(animations.getSwayOffset().x).toBe(0)
      expect(animations.getSwayOffset().y).toBe(0)
      // @ts-ignore
      expect(animations.idleTime).toBe(0)
    })
  })
})
