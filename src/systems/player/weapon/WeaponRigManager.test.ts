import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { WeaponRigManager } from './WeaponRigManager'

// Mock Logger
vi.mock('../../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock Three.js Scene and Group
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three')

  // Create mock Object3D that tracks getObjectByName calls
  class MockObject3D extends actual.Object3D {
    getObjectByName(name: string): actual.Object3D | undefined {
      if (name === 'muzzle') {
        const obj = new actual.Object3D()
        obj.name = 'muzzle'
        return obj
      }
      if (name === 'magazine') {
        const obj = new actual.Object3D()
        obj.name = 'magazine'
        return obj
      }
      if (name === 'pumpGrip') {
        const obj = new actual.Object3D()
        obj.name = 'pumpGrip'
        return obj
      }
      return undefined
    }
  }

  class MockGroup extends actual.Group {
    visible = true
    position = new actual.Vector3()

    getObjectByName(name: string): actual.Object3D | undefined {
      if (name === 'muzzle') {
        const obj = new actual.Object3D()
        obj.name = 'muzzle'
        return obj
      }
      if (name === 'magazine') {
        const obj = new actual.Object3D()
        obj.name = 'magazine'
        return obj
      }
      if (name === 'pumpGrip') {
        const obj = new actual.Object3D()
        obj.name = 'pumpGrip'
        return obj
      }
      return undefined
    }
  }

  class MockScene extends actual.Scene {
    add = vi.fn()
  }

  return {
    ...actual,
    Scene: MockScene,
    Group: MockGroup,
    Object3D: MockObject3D,
  }
})

// Mock ProgrammaticGunFactory
vi.mock('../ProgrammaticGunFactory', () => {
  // Import THREE from the mock
  const THREE = require('three')

  // Create a helper to make groups with mock named objects
  function createMockGroup(name: string, hasPumpGrip = false): any {
    const group = new THREE.Group()
    group.name = name

    // Create named objects that getObjectByName will find
    const muzzle = new THREE.Object3D()
    muzzle.name = 'muzzle'
    group.add(muzzle)

    const magazine = new THREE.Object3D()
    magazine.name = 'magazine'
    group.add(magazine)

    if (hasPumpGrip) {
      const pumpGrip = new THREE.Object3D()
      pumpGrip.name = 'pumpGrip'
      group.add(pumpGrip)
    }

    return group
  }

  return {
    ProgrammaticGunFactory: {
      createRifle: vi.fn(() => createMockGroup('rifle')),
      createShotgun: vi.fn(() => createMockGroup('shotgun', true)),
      createSMG: vi.fn(() => createMockGroup('smg')),
      createPistol: vi.fn(() => createMockGroup('pistol')),
    },
  }
})

// Mock GunplayCore
vi.mock('../../weapons/GunplayCore', () => ({
  GunplayCore: class MockGunplayCore {
    spec: any
    constructor(spec: any) {
      this.spec = spec
    }
    canFire() { return true }
    registerShot() {}
    cooldown() {}
    getSpreadDeg() { return 0 }
    getRecoilOffsetDeg() { return { pitch: 0, yaw: 0 } }
    computeShotRay() {}
    computeDamage() { return 30 }
    isShotgun() { return false }
  },
}))

describe('WeaponRigManager', () => {
  let scene: THREE.Scene
  let manager: WeaponRigManager

  beforeEach(() => {
    scene = new THREE.Scene()
    manager = new WeaponRigManager(scene)
  })

  describe('constructor', () => {
    it('creates four weapon cores (rifle, shotgun, SMG, pistol)', () => {
      expect(manager.getRifleCore()).toBeDefined()
      expect(manager.getShotgunCore()).toBeDefined()
      expect(manager.getSMGCore()).toBeDefined()
      expect(manager.getPistolCore()).toBeDefined()
    })

    it('starts with rifle as current core', () => {
      const currentCore = manager.getCurrentCore()
      const rifleCore = manager.getRifleCore()
      expect(currentCore).toBe(rifleCore)
    })
  })

  describe('init()', () => {
    it('creates all four weapon rigs', async () => {
      await manager.init()

      const rig = manager.getCurrentRig()
      expect(rig).toBeDefined()
    })

    it('adds all weapon rigs to scene', async () => {
      await manager.init()

      // Scene.add should be called 4 times (rifle, shotgun, SMG, pistol)
      expect(scene.add).toHaveBeenCalledTimes(4)
    })

    it('sets rifle visible and others hidden initially', async () => {
      await manager.init()

      const currentRig = manager.getCurrentRig()
      expect(currentRig?.visible).toBe(true)
    })

    it('finds muzzle reference on rifle', async () => {
      await manager.init()

      const muzzle = manager.getMuzzleRef()
      expect(muzzle).toBeDefined()
      expect(muzzle?.name).toBe('muzzle')
    })

    it('finds magazine reference on rifle', async () => {
      await manager.init()

      const magazine = manager.getMagazineRef()
      expect(magazine).toBeDefined()
      expect(magazine?.name).toBe('magazine')
    })

    it('does not set pump grip reference for rifle', async () => {
      await manager.init()

      const pumpGrip = manager.getPumpGripRef()
      expect(pumpGrip).toBeUndefined()
    })
  })

  describe('getters', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('getCurrentRig returns active weapon rig', () => {
      const rig = manager.getCurrentRig()
      expect(rig).toBeDefined()
      expect(rig?.isGroup).toBe(true) // Check using Three.js property instead of instanceof
    })

    it('getMuzzleRef returns muzzle object', () => {
      const muzzle = manager.getMuzzleRef()
      expect(muzzle).toBeDefined()
    })

    it('getMagazineRef returns magazine object', () => {
      const magazine = manager.getMagazineRef()
      expect(magazine).toBeDefined()
    })

    it('getPumpGripRef returns undefined for rifle', () => {
      const pumpGrip = manager.getPumpGripRef()
      expect(pumpGrip).toBeUndefined()
    })

    it('getCurrentCore returns active weapon core', () => {
      const core = manager.getCurrentCore()
      expect(core).toBe(manager.getRifleCore())
    })

    it('getRifleCore returns rifle core', () => {
      const core = manager.getRifleCore()
      expect(core).toBeDefined()
    })

    it('getShotgunCore returns shotgun core', () => {
      const core = manager.getShotgunCore()
      expect(core).toBeDefined()
    })

    it('getSMGCore returns SMG core', () => {
      const core = manager.getSMGCore()
      expect(core).toBeDefined()
    })

    it('getPistolCore returns pistol core', () => {
      const core = manager.getPistolCore()
      expect(core).toBeDefined()
    })
  })

  describe('startWeaponSwitch()', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('returns false if switching to current weapon', () => {
      const result = manager.startWeaponSwitch('rifle')
      expect(result).toBe(false)
    })

    it('returns false if already mid-switch', () => {
      manager.startWeaponSwitch('shotgun')
      const result = manager.startWeaponSwitch('smg')
      expect(result).toBe(false)
    })

    it('returns true and starts switch for valid weapon type', () => {
      const result = manager.startWeaponSwitch('shotgun')
      expect(result).toBe(true)
      expect(manager.isSwitching()).toBe(true)
    })

    it('accepts rifle as weapon type', () => {
      // First switch to shotgun
      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(0.21) // Cross midpoint to actually switch
      manager.updateSwitchAnimation(0.8) // Complete animation

      // Now rifle should be available to switch to
      const result = manager.startWeaponSwitch('rifle')
      expect(result).toBe(true)
    })

    it('accepts shotgun as weapon type', () => {
      const result = manager.startWeaponSwitch('shotgun')
      expect(result).toBe(true)
    })

    it('accepts SMG as weapon type', () => {
      const result = manager.startWeaponSwitch('smg')
      expect(result).toBe(true)
    })

    it('accepts pistol as weapon type', () => {
      const result = manager.startWeaponSwitch('pistol')
      expect(result).toBe(true)
    })
  })

  describe('updateSwitchAnimation()', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('does nothing when not switching', () => {
      const offsetBefore = manager.getSwitchOffset()
      manager.updateSwitchAnimation(0.1)
      const offsetAfter = manager.getSwitchOffset()

      expect(offsetAfter.y).toBe(offsetBefore.y)
      expect(offsetAfter.rotX).toBe(offsetBefore.rotX)
    })

    it('advances progress with deltaTime', () => {
      manager.startWeaponSwitch('shotgun')
      expect(manager.isSwitching()).toBe(true)

      manager.updateSwitchAnimation(0.1)
      expect(manager.isSwitching()).toBe(true) // Still switching
    })

    it('completes switch when progress >= 1', () => {
      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(1) // Full second, more than SWITCH_ANIMATION_TIME

      expect(manager.isSwitching()).toBe(false)
      const offset = manager.getSwitchOffset()
      expect(offset.y).toBe(0)
      expect(offset.rotX).toBe(0)
    })
  })

  describe('switch animation stages', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('stage 1 (0-50%): lowers weapon with easeInCubic', () => {
      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(0.1) // 25% progress (0.1 / 0.4 = 0.25)

      const offset = manager.getSwitchOffset()
      expect(offset.y).toBeLessThan(0) // Weapon moved down
      expect(offset.rotX).toBeGreaterThan(0) // Weapon tilted forward
    })

    it('stage 2 (50-100%): performs switch then raises weapon with easeOutCubic', () => {
      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(0.25) // 62.5% progress (crosses midpoint)

      // After midpoint, weapon should be switching back up
      const offset = manager.getSwitchOffset()
      expect(offset.y).toBeLessThan(0) // Still below, but rising
    })

    it('performs actual weapon switch at midpoint', () => {
      const initialCore = manager.getCurrentCore()

      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(0.21) // Just after midpoint (52.5% progress)

      const newCore = manager.getCurrentCore()
      expect(newCore).not.toBe(initialCore)
      expect(newCore).toBe(manager.getShotgunCore())
    })

    it('only performs switch once at midpoint', () => {
      manager.startWeaponSwitch('shotgun')

      // Cross midpoint
      manager.updateSwitchAnimation(0.21)
      const coreAfterMidpoint = manager.getCurrentCore()

      // Continue animation
      manager.updateSwitchAnimation(0.1)
      const coreLater = manager.getCurrentCore()

      expect(coreLater).toBe(coreAfterMidpoint)
    })
  })

  describe('performWeaponSwitch', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('switches to rifle: visibility toggled, core updated, refs updated', () => {
      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(1)

      manager.startWeaponSwitch('rifle')
      manager.updateSwitchAnimation(1)

      expect(manager.getCurrentCore()).toBe(manager.getRifleCore())
      expect(manager.getMuzzleRef()).toBeDefined()
      expect(manager.getMagazineRef()).toBeDefined()
      expect(manager.getPumpGripRef()).toBeUndefined() // No pump grip on rifle
    })

    it('switches to shotgun: visibility toggled, core updated, pump grip found', () => {
      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(0.21) // Cross midpoint to perform switch

      expect(manager.getCurrentCore()).toBe(manager.getShotgunCore())
      expect(manager.getMuzzleRef()).toBeDefined()
      expect(manager.getMagazineRef()).toBeDefined()
      expect(manager.getPumpGripRef()).toBeDefined() // Shotgun has pump grip
    })

    it('switches to SMG: visibility toggled, core updated, refs updated', () => {
      manager.startWeaponSwitch('smg')
      manager.updateSwitchAnimation(0.21) // Cross midpoint to perform switch

      expect(manager.getCurrentCore()).toBe(manager.getSMGCore())
      expect(manager.getMuzzleRef()).toBeDefined()
      expect(manager.getMagazineRef()).toBeDefined()
      expect(manager.getPumpGripRef()).toBeUndefined() // No pump grip on SMG
    })

    it('switches to pistol: visibility toggled, core updated, refs updated', () => {
      manager.startWeaponSwitch('pistol')
      manager.updateSwitchAnimation(0.21) // Cross midpoint to perform switch

      expect(manager.getCurrentCore()).toBe(manager.getPistolCore())
      expect(manager.getMuzzleRef()).toBeDefined()
      expect(manager.getMagazineRef()).toBeDefined()
      expect(manager.getPumpGripRef()).toBeUndefined() // No pump grip on pistol
    })
  })

  describe('HUD notification on switch', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('calls hudSystem.showWeaponSwitch with correct params for rifle', () => {
      const hudSystem = {
        showWeaponSwitch: vi.fn(),
      } as any

      // First switch to shotgun (to set up switching back to rifle)
      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(0.21, hudSystem) // Cross midpoint
      manager.updateSwitchAnimation(0.8) // Complete animation

      // Clear the mock to only track the rifle switch
      hudSystem.showWeaponSwitch.mockClear()

      // Now switch back to rifle
      manager.startWeaponSwitch('rifle')
      manager.updateSwitchAnimation(0.21, hudSystem) // Pass hudSystem to update

      expect(hudSystem.showWeaponSwitch).toHaveBeenCalledWith(
        'RIFLE',
        'AR',
        expect.any(String)
      )
    })

    it('calls hudSystem.showWeaponSwitch with correct params for shotgun', () => {
      const hudSystem = {
        showWeaponSwitch: vi.fn(),
      } as any

      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(0.21, hudSystem) // Pass hudSystem to update

      expect(hudSystem.showWeaponSwitch).toHaveBeenCalledWith(
        'SHOTGUN',
        'SG',
        expect.any(String)
      )
    })

    it('calls hudSystem.showWeaponSwitch with correct params for SMG', () => {
      const hudSystem = {
        showWeaponSwitch: vi.fn(),
      } as any

      manager.startWeaponSwitch('smg')
      manager.updateSwitchAnimation(0.21, hudSystem) // Pass hudSystem to update

      expect(hudSystem.showWeaponSwitch).toHaveBeenCalledWith(
        'SMG',
        'SM',
        expect.any(String)
      )
    })

    it('calls hudSystem.showWeaponSwitch with correct params for pistol', () => {
      const hudSystem = {
        showWeaponSwitch: vi.fn(),
      } as any

      manager.startWeaponSwitch('pistol')
      manager.updateSwitchAnimation(0.21, hudSystem) // Pass hudSystem to update

      expect(hudSystem.showWeaponSwitch).toHaveBeenCalledWith(
        'PISTOL',
        'PT',
        expect.any(String)
      )
    })
  })

  describe('audio notification on switch', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('calls audioManager.playWeaponSwitchSound when switching', () => {
      const audioManager = {
        playWeaponSwitchSound: vi.fn(),
      } as any

      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(0.21, undefined, audioManager) // Pass audioManager to update

      expect(audioManager.playWeaponSwitchSound).toHaveBeenCalled()
    })

    it('does not call audio if audioManager not provided', () => {
      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(0.21)

      // Should not throw
      expect(manager.getCurrentCore()).toBe(manager.getShotgunCore())
    })
  })

  describe('getSwitchOffset', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('returns zero offset when not switching', () => {
      const offset = manager.getSwitchOffset()
      expect(offset.y).toBe(0)
      expect(offset.rotX).toBe(0)
    })

    it('returns non-zero offset during switch animation', () => {
      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(0.05)

      const offset = manager.getSwitchOffset()
      expect(offset.y).not.toBe(0)
      expect(offset.rotX).not.toBe(0)
    })

    it('resets to zero offset after switch completes', () => {
      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(1)

      const offset = manager.getSwitchOffset()
      expect(offset.y).toBe(0)
      expect(offset.rotX).toBe(0)
    })
  })

  describe('isSwitching', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('returns false when not switching', () => {
      expect(manager.isSwitching()).toBe(false)
    })

    it('returns true during switch animation', () => {
      manager.startWeaponSwitch('shotgun')
      expect(manager.isSwitching()).toBe(true)
    })

    it('returns false after switch completes', () => {
      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(1)
      expect(manager.isSwitching()).toBe(false)
    })
  })

  describe('setWeaponVisibility', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('sets current weapon rig visible to true', () => {
      manager.setWeaponVisibility(true)
      const rig = manager.getCurrentRig()
      expect(rig?.visible).toBe(true)
    })

    it('sets current weapon rig visible to false', () => {
      manager.setWeaponVisibility(false)
      const rig = manager.getCurrentRig()
      expect(rig?.visible).toBe(false)
    })

    it('handles call before init gracefully', () => {
      const newManager = new WeaponRigManager(scene)
      newManager.setWeaponVisibility(false)
      // Should not throw
      expect(newManager.getCurrentRig()).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    beforeEach(async () => {
      await manager.init()
    })

    it('pendingWeaponSwitch cleared after midpoint so switch only happens once', () => {
      manager.startWeaponSwitch('shotgun')

      // Cross midpoint
      manager.updateSwitchAnimation(0.21)
      const coreAfterFirst = manager.getCurrentCore()

      // Continue animating (should not switch again)
      manager.updateSwitchAnimation(0.1)
      manager.updateSwitchAnimation(0.1)

      const coreFinal = manager.getCurrentCore()
      expect(coreFinal).toBe(coreAfterFirst)
      expect(coreFinal).toBe(manager.getShotgunCore())
    })

    it('handles multiple consecutive switches', () => {
      manager.startWeaponSwitch('shotgun')
      manager.updateSwitchAnimation(0.21) // Cross midpoint
      manager.updateSwitchAnimation(0.8) // Complete

      manager.startWeaponSwitch('smg')
      manager.updateSwitchAnimation(0.21) // Cross midpoint
      manager.updateSwitchAnimation(0.8) // Complete

      manager.startWeaponSwitch('pistol')
      manager.updateSwitchAnimation(0.21) // Cross midpoint
      manager.updateSwitchAnimation(0.8) // Complete

      expect(manager.getCurrentCore()).toBe(manager.getPistolCore())
      expect(manager.isSwitching()).toBe(false)
    })

    it('handles rapid updateSwitchAnimation calls', () => {
      manager.startWeaponSwitch('shotgun')

      // Simulate many small time steps
      for (let i = 0; i < 50; i++) {
        manager.updateSwitchAnimation(0.01)
      }

      expect(manager.isSwitching()).toBe(false)
      expect(manager.getCurrentCore()).toBe(manager.getShotgunCore())
    })
  })
})
