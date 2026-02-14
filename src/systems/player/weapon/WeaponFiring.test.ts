import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { WeaponFiring } from './WeaponFiring'
import { GunplayCore } from '../../weapons/GunplayCore'
import { CombatantSystem } from '../../combat/CombatantSystem'
import { TracerPool } from '../../effects/TracerPool'
import { MuzzleFlashSystem } from '../../effects/MuzzleFlashSystem'
import { ImpactEffectsPool } from '../../effects/ImpactEffectsPool'
import { AudioManager } from '../../audio/AudioManager'
import { PlayerStatsTracker } from '../PlayerStatsTracker'
import { ShotCommand } from './ShotCommand'
import { WeaponShotExecutor } from './WeaponShotExecutor'
import { performanceTelemetry } from '../../debug/PerformanceTelemetry'
import type { HUDSystem } from '../../../ui/hud/HUDSystem'

// Mock dependencies
vi.mock('../../weapons/GunplayCore')
vi.mock('../../combat/CombatantSystem')
vi.mock('../../effects/TracerPool')
vi.mock('../../effects/MuzzleFlashSystem')
vi.mock('../../effects/ImpactEffectsPool')
vi.mock('../../audio/AudioManager')
vi.mock('../PlayerStatsTracker')
// vi.mock('./WeaponShotExecutor') - We will test the real executor with mocked dependencies
vi.mock('../../../ui/hud/HUDSystem')
vi.mock('../../debug/PerformanceTelemetry', () => ({
  performanceTelemetry: {
    recordShot: vi.fn()
  }
}))

describe('WeaponFiring', () => {
  let weaponFiring: WeaponFiring
  let camera: THREE.Camera
  let gunCore: GunplayCore
  let tracerPool: TracerPool
  let muzzleFlashSystem: MuzzleFlashSystem
  let impactEffectsPool: ImpactEffectsPool
  let combatantSystem: CombatantSystem
  let audioManager: AudioManager
  let statsTracker: PlayerStatsTracker
  let hudSystem: HUDSystem
  let overlayScene: THREE.Scene

  beforeEach(() => {
    vi.clearAllMocks()

    camera = new THREE.PerspectiveCamera()
    camera.position.set(0, 0, 0)
    camera.quaternion.set(0, 0, 0, 1)

    gunCore = new GunplayCore({} as any)
    tracerPool = new TracerPool({} as any)
    muzzleFlashSystem = new MuzzleFlashSystem({} as any)
    impactEffectsPool = new ImpactEffectsPool({} as any)
    combatantSystem = new CombatantSystem({} as any, {} as any)
    audioManager = new AudioManager({} as any)
    statsTracker = new PlayerStatsTracker()
    hudSystem = {
      showHitMarker: vi.fn(),
      spawnDamageNumber: vi.fn()
    } as any
    overlayScene = new THREE.Scene()

    weaponFiring = new WeaponFiring(
      camera,
      gunCore,
      tracerPool,
      muzzleFlashSystem,
      impactEffectsPool,
      overlayScene
    )
  })

  it('should initialize correctly', () => {
    expect(weaponFiring).toBeDefined()
    expect(weaponFiring.getGunCore()).toBe(gunCore)
  })

  describe('Setters', () => {
    it('should set combatant system and initialize shot executor', () => {
      weaponFiring.setCombatantSystem(combatantSystem)
      // @ts-ignore - accessing private for test
      expect(weaponFiring.combatantSystem).toBe(combatantSystem)
      // @ts-ignore
      expect(weaponFiring.shotExecutor).toBeDefined()
    })

    it('should set audio manager and update shot executor', () => {
      weaponFiring.setCombatantSystem(combatantSystem)
      weaponFiring.setAudioManager(audioManager)
      // @ts-ignore
      expect(weaponFiring.audioManager).toBe(audioManager)
      // @ts-ignore
      expect(weaponFiring.shotExecutor.audioManager).toBe(audioManager)
    })

    it('should set stats tracker and update shot executor', () => {
      weaponFiring.setCombatantSystem(combatantSystem)
      weaponFiring.setStatsTracker(statsTracker)
      // @ts-ignore
      expect(weaponFiring.statsTracker).toBe(statsTracker)
      // @ts-ignore
      expect(weaponFiring.shotExecutor.statsTracker).toBe(statsTracker)
    })

    it('should set HUD system and update shot executor', () => {
      weaponFiring.setCombatantSystem(combatantSystem)
      weaponFiring.setHUDSystem(hudSystem)
      // @ts-ignore
      expect(weaponFiring.hudSystem).toBe(hudSystem)
      // @ts-ignore
      expect(weaponFiring.shotExecutor.hudSystem).toBe(hudSystem)
    })

    it('should update gunCore', () => {
      const newGunCore = new GunplayCore({} as any)
      weaponFiring.setGunCore(newGunCore)
      expect(weaponFiring.getGunCore()).toBe(newGunCore)
    })
  })

  describe('executeShot with real Executor', () => {
    let command: ShotCommand

    beforeEach(() => {
      command = {
        ray: new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)),
        weaponType: 'rifle',
        damage: vi.fn().mockReturnValue(25),
        timestamp: Date.now(),
        isADS: false
      }
      weaponFiring.setCombatantSystem(combatantSystem)
      weaponFiring.setStatsTracker(statsTracker)
      weaponFiring.setAudioManager(audioManager)
      weaponFiring.setHUDSystem(hudSystem)

      vi.mocked(combatantSystem.handlePlayerShot).mockReturnValue({
        hit: true,
        point: new THREE.Vector3(0, 0, -10),
        damage: 25,
        killed: true,
        headshot: true
      })
    })

    it('should return default result if combatant system is missing', () => {
      const emptyWeaponFiring = new WeaponFiring(camera, gunCore, tracerPool, muzzleFlashSystem, impactEffectsPool, overlayScene)
      const result = emptyWeaponFiring.executeShot(command)
      expect(result).toEqual({ hit: false, killed: false, headshot: false, damageDealt: 0 })
    })

    it('should process a successful hit correctly', () => {
      const result = weaponFiring.executeShot(command)

      expect(result.hit).toBe(true)
      expect(result.killed).toBe(true)
      expect(result.headshot).toBe(true)
      expect(result.damageDealt).toBe(25)

      // Verify effects
      expect(impactEffectsPool.spawn).toHaveBeenCalled()
      expect(muzzleFlashSystem.spawnPlayer).toHaveBeenCalled()

      // Verify stats
      expect(statsTracker.registerShot).toHaveBeenCalledWith(true) // Called by WeaponFiring
      expect(statsTracker.addDamage).toHaveBeenCalledWith(25)
      expect(statsTracker.addHeadshot).toHaveBeenCalled()
      expect(statsTracker.updateLongestKill).toHaveBeenCalled()

      // Verify HUD
      expect(hudSystem.showHitMarker).toHaveBeenCalledWith('kill')
      expect(hudSystem.spawnDamageNumber).toHaveBeenCalled()
      expect(audioManager.playHitFeedback).toHaveBeenCalledWith('kill')
    })

    it('should handle a miss correctly', () => {
      vi.mocked(combatantSystem.handlePlayerShot).mockReturnValue({
        hit: false,
        point: new THREE.Vector3(0, 0, 0),
        damage: 0,
        killed: false,
        headshot: false
      })

      const result = weaponFiring.executeShot(command)

      expect(result.hit).toBe(false)
      expect(impactEffectsPool.spawn).not.toHaveBeenCalled()
      expect(statsTracker.addDamage).not.toHaveBeenCalled()
    })

    it('should handle shotgun shots with multiple pellets', () => {
      command.weaponType = 'shotgun'
      command.pelletRays = [
        new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 0, -1)),
        new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.1, 0, -1))
      ]

      vi.mocked(combatantSystem.handlePlayerShot).mockReturnValue({
        hit: true,
        point: new THREE.Vector3(0, 0, -10),
        damage: 10,
        killed: false,
        headshot: false
      })

      const result = weaponFiring.executeShot(command)

      expect(result.hit).toBe(true)
      expect(result.damageDealt).toBe(20) // 10 + 10
      expect(impactEffectsPool.spawn).toHaveBeenCalledTimes(2)
      expect(statsTracker.addDamage).toHaveBeenCalledWith(20)
    })

    it('should record shot in telemetry', () => {
      weaponFiring.executeShot(command)
      expect(performanceTelemetry.recordShot).toHaveBeenCalled()
    })

    it('should track stats correctly when optional components are missing', () => {
      const basicWeaponFiring = new WeaponFiring(camera, gunCore, tracerPool, muzzleFlashSystem, impactEffectsPool, overlayScene)
      basicWeaponFiring.setCombatantSystem(combatantSystem)
      
      const result = basicWeaponFiring.executeShot(command)
      expect(result.hit).toBe(true)
      // Should not crash even if statsTracker/audioManager/hudSystem are missing
    })
  })

  describe('spawnMuzzleFlash', () => {
    it('should use muzzleRef world position when provided', () => {
      const muzzleRef = new THREE.Object3D()
      muzzleRef.position.set(0.5, -0.3, -0.7)
      weaponFiring.setMuzzleRef(muzzleRef)

      vi.spyOn(muzzleRef, 'getWorldPosition').mockImplementation((target) => {
        target.set(0.5, -0.3, -0.7)
        return target
      })
      vi.spyOn(camera, 'getWorldDirection').mockImplementation((target) => {
        target.set(0, 0, -1)
        return target
      })

      // @ts-ignore - call private method
      weaponFiring.spawnMuzzleFlash()

      // Should use actual muzzle position, not camera offset
      expect(muzzleFlashSystem.spawnPlayer).toHaveBeenCalledWith(
        overlayScene,
        expect.objectContaining({ x: 0.5, y: -0.3, z: -0.7 }),
        expect.objectContaining({ x: 0, y: 0, z: -1 }),
        expect.any(Number)
      )
    })

    it('should use camera position fallback if muzzleRef is not provided', () => {
      camera.position.set(0, 1, 0)
      vi.spyOn(camera, 'getWorldPosition').mockImplementation((target) => {
        target.set(0, 1, 0)
        return target
      })
      vi.spyOn(camera, 'getWorldDirection').mockImplementation((target) => {
        target.set(0, 0, -1)
        return target
      })

      // @ts-ignore
      weaponFiring.spawnMuzzleFlash()

      // (0, 1, 0) + (0, 0, -1) * 1 = (0, 1, -1)
      expect(muzzleFlashSystem.spawnPlayer).toHaveBeenCalledWith(
        overlayScene,
        expect.objectContaining({ x: 0, y: 1, z: -1 }),
        expect.objectContaining({ x: 0, y: 0, z: -1 }),
        expect.any(Number)
      )
    })

    it('should use shotgun variant for shotgun weapon', () => {
      vi.mocked(gunCore.isShotgun).mockReturnValue(true)
      vi.spyOn(camera, 'getWorldDirection').mockImplementation((target) => {
        target.set(0, 0, -1)
        return target
      })
      // @ts-ignore
      weaponFiring.spawnMuzzleFlash()
      expect(muzzleFlashSystem.spawnPlayer).toHaveBeenCalledWith(
        overlayScene,
        expect.any(THREE.Vector3),
        expect.any(THREE.Vector3),
        1 // MuzzleFlashVariant.SHOTGUN = 1
      )
    })
  })

  describe('Legacy fire method', () => {
    beforeEach(() => {
      weaponFiring.setCombatantSystem(combatantSystem)
      weaponFiring.setStatsTracker(statsTracker)
      weaponFiring.setAudioManager(audioManager)
      vi.mocked(combatantSystem.handlePlayerShot).mockReturnValue({
        hit: true,
        point: new THREE.Vector3(0, 0, -10),
        damage: 10,
        killed: false,
        headshot: false
      })
      vi.mocked(gunCore.getSpreadDeg).mockReturnValue(0)
      vi.mocked(gunCore.computeShotRay).mockReturnValue(new THREE.Ray(new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)))
    })

    it('should register shot with stats tracker', () => {
      weaponFiring.fire(false)
      expect(statsTracker.registerShot).toHaveBeenCalledWith(true)
    })

    it('should play weapon sound', () => {
      weaponFiring.fire(false, 'smg')
      expect(audioManager.playPlayerWeaponSound).toHaveBeenCalledWith('smg')
    })

    it('should execute single shot when isShotgun is false', () => {
      weaponFiring.fire(false)
      expect(combatantSystem.handlePlayerShot).toHaveBeenCalled()
      expect(impactEffectsPool.spawn).toHaveBeenCalled()
    })

    it('should execute shotgun shot when isShotgun is true', () => {
      vi.mocked(gunCore.computePelletRays).mockReturnValue([new THREE.Ray()])
      weaponFiring.fire(true)
      expect(gunCore.computePelletRays).toHaveBeenCalled()
      expect(combatantSystem.handlePlayerShot).toHaveBeenCalled()
    })

    it('should spawn muzzle flash', () => {
      weaponFiring.fire(false)
      expect(muzzleFlashSystem.spawnPlayer).toHaveBeenCalled()
    })
  })
})
