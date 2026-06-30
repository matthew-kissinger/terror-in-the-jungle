// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FirstPersonWeapon } from './FirstPersonWeapon';
import { AssetLoader } from '../assets/AssetLoader';
import { PlayerController } from './PlayerController';
import { CombatantSystem } from '../combat/CombatantSystem';
import { AudioManager } from '../audio/AudioManager';
import { InventoryManager, WeaponSlot } from './InventoryManager';
import { AmmoState } from '../weapons/AmmoManager';
import type { HUDSystem } from '../../ui/hud/HUDSystem';
import { Faction } from '../combat/types';
import { performanceTelemetry } from '../debug/PerformanceTelemetry';

// Create mock instances
let mockRigManager: any;
let mockAnimations: any;
let mockFiring: any;
let mockReload: any;
let mockModel: any;
let mockInput: any;
let mockAmmo: any;
let mockSwitching: any;
let mockTracerPool: any;
let mockMuzzleFlashSystem: any;
let mockImpactEffectsPool: any;
let mockStatsTracker: any;

const mockGunCore = {
  canFire: vi.fn(() => true),
  isShotgun: vi.fn(() => false),
  registerShot: vi.fn(),
  cooldown: vi.fn(),
  getRecoilOffsetDeg: vi.fn(() => ({ pitch: 0.3, yaw: 0.1 })),
};

const mockAmmoManager = {
  update: vi.fn(),
  canFire: vi.fn(() => true),
  isEmpty: vi.fn(() => false),
  consumeRound: vi.fn(() => true),
  getState: vi.fn(() => ({ currentMagazine: 30, reserveAmmo: 90 } as AmmoState)),
  startReload: vi.fn(() => true),
  isLowAmmo: vi.fn(() => false),
};

// Mock modules (using class constructors)
vi.mock('./weapon/WeaponRigManager', () => ({
  WeaponRigManager: vi.fn(function(this: any) {
    return mockRigManager;
  }),
}));

vi.mock('./weapon/WeaponAnimations', () => ({
  WeaponAnimations: vi.fn(function(this: any) {
    return mockAnimations;
  }),
}));

vi.mock('./weapon/WeaponFiring', () => ({
  WeaponFiring: vi.fn(function(this: any) {
    return mockFiring;
  }),
}));

vi.mock('./weapon/WeaponReload', () => ({
  WeaponReload: vi.fn(function(this: any) {
    return mockReload;
  }),
}));

vi.mock('./weapon/WeaponModel', () => ({
  WeaponModel: vi.fn(function(this: any) {
    return mockModel;
  }),
}));

vi.mock('./weapon/WeaponInput', () => ({
  WeaponInput: vi.fn(function(this: any) {
    return mockInput;
  }),
}));

vi.mock('./weapon/WeaponAmmo', () => ({
  WeaponAmmo: vi.fn(function(this: any) {
    return mockAmmo;
  }),
}));

vi.mock('./weapon/WeaponSwitching', () => ({
  WeaponSwitching: vi.fn(function(this: any) {
    return mockSwitching;
  }),
}));

vi.mock('./weapon/WeaponShotCommandBuilder', () => ({
  WeaponShotCommandBuilder: {
    createShotCommand: vi.fn(() => ({
      gunCore: mockGunCore,
      camera: {},
      weaponType: 'rifle',
      isShotgun: false,
      isADS: false,
    })),
  },
}));

vi.mock('../effects/TracerPool', () => ({
  TracerPool: vi.fn(function(this: any) {
    return mockTracerPool;
  }),
}));

vi.mock('../effects/MuzzleFlashSystem', () => ({
  MuzzleFlashSystem: vi.fn(function(this: any) {
    return mockMuzzleFlashSystem;
  }),
}));

vi.mock('../effects/ImpactEffectsPool', () => ({
  ImpactEffectsPool: vi.fn(function(this: any) {
    return mockImpactEffectsPool;
  }),
}));

vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('FirstPersonWeapon', () => {
  let weapon: FirstPersonWeapon;
  let mockScene: THREE.Scene;
  let mockCamera: THREE.Camera;
  let mockAssetLoader: AssetLoader;
  let mockPlayerController: PlayerController;
  let mockCombatantSystem: CombatantSystem;
  let mockHUDSystem: HUDSystem;
  let mockAudioManager: AudioManager;
  let mockInventoryManager: InventoryManager;

  beforeEach(() => {
    // Reset mock instances
    mockRigManager = {
      init: vi.fn().mockResolvedValue(undefined),
      setRifleFaction: vi.fn(),
      getCurrentRig: vi.fn(() => ({})),
      getCurrentWeaponType: vi.fn(() => 'rifle'),
      getCurrentCore: vi.fn(() => mockGunCore),
      getSMGCore: vi.fn(() => mockGunCore),
      getPistolCore: vi.fn(() => mockGunCore),
      getMuzzleRef: vi.fn(() => ({ current: new THREE.Object3D() })),
      getPumpGripRef: vi.fn(() => ({ current: new THREE.Object3D() })),
      getMagazineRef: vi.fn(() => ({ current: new THREE.Object3D() })),
      isSwitching: vi.fn(() => false),
      updateSwitchAnimation: vi.fn(),
      setWeaponVisibility: vi.fn(),
      setAllWeaponVisibility: vi.fn(),
    };

    mockAnimations = {
      update: vi.fn(),
      setADS: vi.fn(),
      getADS: vi.fn(() => false),
      reset: vi.fn(),
      setPumpGripRef: vi.fn(),
      startPumpAnimation: vi.fn(),
      applyRecoilImpulse: vi.fn(),
    };

    mockFiring = {
      executeShot: vi.fn(),
      setMuzzleRef: vi.fn(),
      setGunCore: vi.fn(),
      setCombatantSystem: vi.fn(),
      setHUDSystem: vi.fn(),
      setAudioManager: vi.fn(),
      setStatsTracker: vi.fn(),
    };

    mockReload = {
      update: vi.fn(),
      startReload: vi.fn(() => true),
      setMagazineRef: vi.fn(),
      setAudioManager: vi.fn(),
    };

    const weaponScene = new THREE.Scene();
    const weaponCamera = new THREE.PerspectiveCamera();
    mockModel = {
      getWeaponScene: vi.fn(() => weaponScene),
      getWeaponCamera: vi.fn(() => weaponCamera),
      updateTransform: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
    };

    mockInput = {
      setOnFireStart: vi.fn(),
      setOnReloadStart: vi.fn(),
      isFiringActive: vi.fn(() => false),
      setFiringActive: vi.fn(),
      setEnabled: vi.fn(),
      setGameStarted: vi.fn(),
      setInventoryManager: vi.fn(),
      dispose: vi.fn(),
    };

    mockAmmo = {
      getCurrentAmmoManager: vi.fn(() => mockAmmoManager),
      getAmmoState: vi.fn(() => ({ currentMagazine: 30, reserveAmmo: 90 })),
      setZoneManager: vi.fn(),
      resetAll: vi.fn(),
    };

    mockSwitching = {
      switchWeapon: vi.fn(),
      setHUDSystem: vi.fn(),
      setAudioManager: vi.fn(),
    };

    mockTracerPool = {
      update: vi.fn(),
      dispose: vi.fn(),
    };

    mockMuzzleFlashSystem = {
      preparePlayerOverlayScene: vi.fn(),
      update: vi.fn(),
      dispose: vi.fn(),
    };

    mockImpactEffectsPool = {
      update: vi.fn(),
      dispose: vi.fn(),
    };

    mockStatsTracker = {
      registerShot: vi.fn(),
      addDamage: vi.fn(),
      addHeadshot: vi.fn(),
      updateLongestKill: vi.fn(),
    };

    // Reset all mock functions
    vi.clearAllMocks();

    // Create dependencies
    mockScene = new THREE.Scene();
    mockCamera = new THREE.PerspectiveCamera();
    mockAssetLoader = {} as AssetLoader;

    mockPlayerController = {
      getPosition: vi.fn(() => new THREE.Vector3()),
      isMoving: vi.fn(() => false),
      getVelocity: vi.fn(() => new THREE.Vector3()),
      isInAnyVehicle: vi.fn(() => false),
      applyRecoil: vi.fn(),
      applyRecoilShake: vi.fn(),
    } as unknown as PlayerController;

    mockCombatantSystem = {} as CombatantSystem;

    mockHUDSystem = {
      getStatsTracker: vi.fn(() => mockStatsTracker),
      updateAmmoDisplay: vi.fn(),
      setADS: vi.fn(),
    } as unknown as HUDSystem;

    mockAudioManager = {} as AudioManager;

    mockInventoryManager = {
      onSlotChange: vi.fn(),
      getWeaponTypeForSlot: vi.fn((slot: WeaponSlot) => {
        switch (slot) {
          case WeaponSlot.PRIMARY:
            return 'rifle';
          case WeaponSlot.SHOTGUN:
            return 'shotgun';
          case WeaponSlot.SMG:
            return 'smg';
          case WeaponSlot.PISTOL:
            return 'pistol';
          default:
            return null;
        }
      }),
    } as unknown as InventoryManager;

    // Reset mock core and ammo manager
    mockGunCore.canFire.mockReturnValue(true);
    mockGunCore.isShotgun.mockReturnValue(false);
    mockGunCore.registerShot.mockClear();
    mockGunCore.cooldown.mockClear();

    mockAmmoManager.canFire.mockReturnValue(true);
    mockAmmoManager.isEmpty.mockReturnValue(false);
    mockAmmoManager.consumeRound.mockReturnValue(true);
    mockAmmoManager.isLowAmmo.mockReturnValue(false);
    mockAmmoManager.update.mockClear();

    // Create weapon
    weapon = new FirstPersonWeapon(mockScene, mockCamera, mockAssetLoader);
  });

  describe('Constructor and Initialization', () => {
    it('should initialize rig manager and update references', async () => {
      await weapon.init();

      expect(mockRigManager.init).toHaveBeenCalled();
      expect(mockRigManager.setRifleFaction).toHaveBeenCalledWith(Faction.US);
      expect(mockAnimations.setPumpGripRef).toHaveBeenCalled();
      expect(mockReload.setMagazineRef).toHaveBeenCalled();
      expect(mockFiring.setMuzzleRef).toHaveBeenCalled();
    });

    it('should trigger initial ammo display after init', async () => {
      weapon.setHUDSystem(mockHUDSystem);
      await weapon.init();

      expect(mockHUDSystem.updateAmmoDisplay).toHaveBeenCalledWith(30, 90);
    });

    it('should wire HUD-owned player stats into weapon firing', () => {
      weapon.setHUDSystem(mockHUDSystem);

      expect(mockHUDSystem.getStatsTracker).toHaveBeenCalled();
      expect(mockFiring.setStatsTracker).toHaveBeenCalledWith(mockStatsTracker);
    });

    it('should wire up input callbacks during construction', () => {
      expect(mockInput.setOnFireStart).toHaveBeenCalledWith(expect.any(Function));
      expect(mockInput.setOnReloadStart).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should prepare player muzzle flash overlay before first fire', () => {
      expect(mockMuzzleFlashSystem.preparePlayerOverlayScene).toHaveBeenCalledWith(
        mockModel.getWeaponScene.mock.results[0].value,
      );
    });
  });

  describe('Update Loop', () => {
    beforeEach(async () => {
      await weapon.init();
      weapon.setPlayerController(mockPlayerController);
    });

    it('should update all modules on each frame', () => {
      weapon.update(0.016);

      expect(mockAmmoManager.update).toHaveBeenCalledWith(0.016, expect.any(THREE.Vector3));
      expect(mockAnimations.update).toHaveBeenCalled();
      expect(mockReload.update).toHaveBeenCalledWith(0.016);
      expect(mockGunCore.cooldown).toHaveBeenCalledWith(0.016);
    });

    it('should not update when disabled', () => {
      weapon.disable();
      weapon.update(0.016);

      // Should not call update methods when disabled
      expect(mockAnimations.update).not.toHaveBeenCalled();
    });

    it('should update weapon switch animation when switching', () => {
      mockRigManager.isSwitching.mockReturnValue(true);
      weapon.setHUDSystem(mockHUDSystem);
      weapon.setAudioManager(mockAudioManager);

      weapon.update(0.016);

      expect(mockRigManager.updateSwitchAnimation).toHaveBeenCalledWith(
        0.016,
        mockHUDSystem,
        mockAudioManager,
        mockAmmoManager
      );
    });

    it('should update weapon references after switch completes', () => {
      // Start switching
      mockRigManager.isSwitching.mockReturnValue(true);
      weapon.update(0.016);

      // Complete switch
      mockRigManager.isSwitching.mockReturnValue(false);
      weapon.update(0.016);

      // Should have updated references
      expect(mockAnimations.setPumpGripRef).toHaveBeenCalled();
      expect(mockReload.setMagazineRef).toHaveBeenCalled();
      expect(mockFiring.setMuzzleRef).toHaveBeenCalled();
    });

    it('should update all effect pools', () => {
      weapon.update(0.016);

      expect(mockTracerPool.update).toHaveBeenCalled();
      expect(mockMuzzleFlashSystem.update).toHaveBeenCalled();
      expect(mockImpactEffectsPool.update).toHaveBeenCalledWith(0.016);
    });

    it('should get player movement state for animations', () => {
      weapon.update(0.016);

      expect(mockPlayerController.isMoving).toHaveBeenCalled();
      expect(mockPlayerController.getVelocity).toHaveBeenCalled();
      expect(mockAnimations.update).toHaveBeenCalledWith(
        0.016,
        false,
        expect.any(THREE.Vector3),
        // The equipped weapon type drives the per-weapon ADS FOV-zoom.
        expect.any(String)
      );
    });

    it('should handle missing player controller gracefully', () => {
      weapon.setPlayerController(undefined as any);
      expect(() => weapon.update(0.016)).not.toThrow();
    });

    it('should update weapon transform', () => {
      weapon.update(0.016);
      expect(mockModel.updateTransform).toHaveBeenCalledWith(mockRigManager);
    });

    it('should attempt auto-fire when firing is active', () => {
      weapon.setCombatantSystem(mockCombatantSystem);
      mockInput.isFiringActive.mockReturnValue(true);

      weapon.update(0.016);

      expect(mockAmmoManager.canFire).toHaveBeenCalled();
    });

    it('does not enter weapon telemetry spans when telemetry is disabled', () => {
      const isEnabledSpy = vi.spyOn(performanceTelemetry, 'isEnabled').mockReturnValue(false);
      const beginSystemSpy = vi.spyOn(performanceTelemetry, 'beginSystem').mockImplementation(() => undefined);
      const endSystemSpy = vi.spyOn(performanceTelemetry, 'endSystem').mockImplementation(() => undefined);

      try {
        weapon.update(0.016);

        expect(isEnabledSpy).toHaveBeenCalledTimes(1);
        expect(beginSystemSpy).not.toHaveBeenCalled();
        expect(endSystemSpy).not.toHaveBeenCalled();
        expect(mockAnimations.update).toHaveBeenCalled();
      } finally {
        isEnabledSpy.mockRestore();
        beginSystemSpy.mockRestore();
        endSystemSpy.mockRestore();
      }
    });

    it('keeps weapon phase telemetry spans when telemetry is enabled', () => {
      const isEnabledSpy = vi.spyOn(performanceTelemetry, 'isEnabled').mockReturnValue(true);
      const beginSystemSpy = vi.spyOn(performanceTelemetry, 'beginSystem').mockImplementation(() => undefined);
      const endSystemSpy = vi.spyOn(performanceTelemetry, 'endSystem').mockImplementation(() => undefined);

      try {
        weapon.update(0.016);

        expect(beginSystemSpy.mock.calls.map(([name]) => name)).toEqual([
          'Player.Weapon.Suppression',
          'Player.Weapon.Ammo',
          'Player.Weapon.Animations',
          'Player.Weapon.Reload',
          'Player.Weapon.Transform',
          'Player.Weapon.Cooldown',
          'Player.Weapon.Effects',
        ]);
        expect(endSystemSpy.mock.calls.map(([name]) => name)).toEqual([
          'Player.Weapon.Suppression',
          'Player.Weapon.Ammo',
          'Player.Weapon.Animations',
          'Player.Weapon.Reload',
          'Player.Weapon.Transform',
          'Player.Weapon.Cooldown',
          'Player.Weapon.Effects',
        ]);
      } finally {
        isEnabledSpy.mockRestore();
        beginSystemSpy.mockRestore();
        endSystemSpy.mockRestore();
      }
    });
  });

  describe('Firing Logic', () => {
    beforeEach(async () => {
      await weapon.init();
      weapon.setPlayerController(mockPlayerController);
      weapon.setCombatantSystem(mockCombatantSystem);
    });

    it('should fire when all conditions are met', () => {
      mockInput.isFiringActive.mockReturnValue(true);
      weapon.update(0.016);

      expect(mockAmmoManager.canFire).toHaveBeenCalled();
      expect(mockAmmoManager.consumeRound).toHaveBeenCalled();
      expect(mockGunCore.registerShot).toHaveBeenCalled();
      expect(mockFiring.executeShot).toHaveBeenCalled();
    });

    it('should not fire when disabled', () => {
      weapon.disable();
      mockInput.isFiringActive.mockReturnValue(true);

      weapon.update(0.016);

      expect(mockGunCore.registerShot).not.toHaveBeenCalled();
    });

    it('should not fire when gun cannot fire', () => {
      mockGunCore.canFire.mockReturnValue(false);
      mockInput.isFiringActive.mockReturnValue(true);

      weapon.update(0.016);

      expect(mockGunCore.registerShot).not.toHaveBeenCalled();
    });

    it('should not fire while weapon switch animation is in progress', () => {
      mockRigManager.isSwitching.mockReturnValue(true);
      mockInput.isFiringActive.mockReturnValue(true);

      weapon.update(0.016);

      expect(mockAmmoManager.consumeRound).not.toHaveBeenCalled();
      expect(mockGunCore.registerShot).not.toHaveBeenCalled();
      expect(mockFiring.executeShot).not.toHaveBeenCalled();
    });

    it('should not fire when ammo is empty', () => {
      mockAmmoManager.canFire.mockReturnValue(false);
      mockAmmoManager.isEmpty.mockReturnValue(true);
      mockInput.isFiringActive.mockReturnValue(true);

      weapon.update(0.016);

      expect(mockGunCore.registerShot).not.toHaveBeenCalled();
    });

    it('should auto-reload when empty and reserve ammo available', () => {
      mockAmmoManager.canFire.mockReturnValue(false);
      mockAmmoManager.isEmpty.mockReturnValue(true);
      mockAmmoManager.getState.mockReturnValue({ currentMagazine: 0, reserveAmmo: 30 } as AmmoState);
      mockInput.isFiringActive.mockReturnValue(true);

      weapon.update(0.016);

      expect(mockReload.startReload).toHaveBeenCalled();
    });

    it('should not consume ammo if consumeRound fails', () => {
      mockAmmoManager.consumeRound.mockReturnValue(false);
      mockInput.isFiringActive.mockReturnValue(true);

      weapon.update(0.016);

      expect(mockGunCore.registerShot).not.toHaveBeenCalled();
    });

    it('should apply recoil to player on shot', () => {
      mockInput.isFiringActive.mockReturnValue(true);
      weapon.update(0.016);

      expect(mockPlayerController.applyRecoil).toHaveBeenCalled();
      expect(mockPlayerController.applyRecoilShake).toHaveBeenCalled();
    });

    it('starts recoil shake before immediate camera recoil refresh', () => {
      mockInput.isFiringActive.mockReturnValue(true);
      weapon.update(0.016);

      expect(mockPlayerController.applyRecoilShake).toHaveBeenCalledTimes(1);
      expect(mockPlayerController.applyRecoil).toHaveBeenCalledTimes(1);
      expect(mockPlayerController.applyRecoilShake.mock.invocationCallOrder[0])
        .toBeLessThan(mockPlayerController.applyRecoil.mock.invocationCallOrder[0]);
    });

    it('should start pump animation for shotgun', () => {
      mockGunCore.isShotgun.mockReturnValue(true);
      mockInput.isFiringActive.mockReturnValue(true);

      weapon.update(0.016);

      expect(mockAnimations.startPumpAnimation).toHaveBeenCalled();
    });

    it('should apply increased recoil for shotgun', () => {
      mockGunCore.isShotgun.mockReturnValue(true);
      mockInput.isFiringActive.mockReturnValue(true);

      weapon.update(0.016);

      expect(mockAnimations.applyRecoilImpulse).toHaveBeenCalledWith(1.8);
    });

    it('should apply standard recoil for non-shotgun', () => {
      mockGunCore.isShotgun.mockReturnValue(false);
      mockInput.isFiringActive.mockReturnValue(true);

      weapon.update(0.016);

      expect(mockAnimations.applyRecoilImpulse).toHaveBeenCalledWith(1.0);
    });
  });

  describe('Reload Logic', () => {
    beforeEach(async () => {
      await weapon.init();
    });

    it('should auto-exit ADS and reload when ADS is active', () => {
      mockAnimations.getADS.mockReturnValue(true);
      mockReload.startReload.mockReturnValue(true);

      // Trigger reload via callback
      const reloadCallback = mockInput.setOnReloadStart.mock.calls[0][0];
      reloadCallback();

      // Should exit ADS and start reload
      expect(mockAnimations.setADS).toHaveBeenCalledWith(false);
      expect(mockReload.startReload).toHaveBeenCalled();
    });

    it('should reload normally when not ADS', () => {
      mockAnimations.getADS.mockReturnValue(false);
      mockReload.startReload.mockReturnValue(true);

      const reloadCallback = mockInput.setOnReloadStart.mock.calls[0][0];
      reloadCallback();

      expect(mockReload.startReload).toHaveBeenCalled();
    });

    it('should stop firing during reload', () => {
      mockReload.startReload.mockReturnValue(true);

      const reloadCallback = mockInput.setOnReloadStart.mock.calls[0][0];
      reloadCallback();

      expect(mockInput.setFiringActive).toHaveBeenCalledWith(false);
    });

    it('should not stop firing if reload fails to start', () => {
      mockReload.startReload.mockReturnValue(false);

      const reloadCallback = mockInput.setOnReloadStart.mock.calls[0][0];
      reloadCallback();

      expect(mockInput.setFiringActive).not.toHaveBeenCalled();
    });
  });

  describe('Weapon Switching', () => {
    beforeEach(async () => {
      await weapon.init();
      weapon.setInventoryManager(mockInventoryManager);
    });

    it('should wire up inventory slot change callbacks', () => {
      expect(mockInventoryManager.onSlotChange).toHaveBeenCalled();
    });

    it('should switch to rifle on PRIMARY slot change', () => {
      const slotCallback = mockInventoryManager.onSlotChange.mock.calls[0][0];
      slotCallback(WeaponSlot.PRIMARY);

      expect(mockSwitching.switchWeapon).toHaveBeenCalledWith('rifle', expect.any(Function));
    });

    it('should switch to shotgun on SHOTGUN slot change', () => {
      const slotCallback = mockInventoryManager.onSlotChange.mock.calls[0][0];
      slotCallback(WeaponSlot.SHOTGUN);

      expect(mockSwitching.switchWeapon).toHaveBeenCalledWith('shotgun', expect.any(Function));
    });

    it('should switch to SMG on SMG slot change', () => {
      const slotCallback = mockInventoryManager.onSlotChange.mock.calls[0][0];
      slotCallback(WeaponSlot.SMG);

      expect(mockSwitching.switchWeapon).toHaveBeenCalledWith('smg', expect.any(Function));
    });

    it('should switch to pistol on PISTOL slot change', () => {
      const slotCallback = mockInventoryManager.onSlotChange.mock.calls[0][0];
      slotCallback(WeaponSlot.PISTOL);

      expect(mockSwitching.switchWeapon).toHaveBeenCalledWith('pistol', expect.any(Function));
    });

    it('should allow setting primary weapon directly', () => {
      weapon.setPrimaryWeapon('smg');

      expect(mockSwitching.switchWeapon).toHaveBeenCalledWith('smg', expect.any(Function));
    });

    it('should update the visible rifle faction when player faction changes', () => {
      weapon.setPlayerFaction(Faction.NVA);

      expect(mockRigManager.setRifleFaction).toHaveBeenCalledWith(Faction.NVA);
    });
  });

  describe('Enable/Disable State', () => {
    beforeEach(async () => {
      await weapon.init();
    });

    it('should disable weapon and input', () => {
      weapon.disable();

      expect(mockInput.setEnabled).toHaveBeenCalledWith(false);
      expect(mockAnimations.setADS).toHaveBeenCalledWith(false);
      expect(mockAnimations.reset).toHaveBeenCalled();
      expect(mockRigManager.setAllWeaponVisibility).toHaveBeenCalledWith(false);
    });

    it('should enable weapon and reset ammo', () => {
      weapon.enable();

      expect(mockInput.setEnabled).toHaveBeenCalledWith(true);
      expect(mockRigManager.setWeaponVisibility).toHaveBeenCalledWith(true);
      expect(mockAmmo.resetAll).toHaveBeenCalled();
    });

    it('suppresses all weapon rigs and rendering while seated in a vehicle', () => {
      weapon.setVehicleEquipmentSuppressed(true);

      expect(mockInput.setEnabled).toHaveBeenCalledWith(false);
      expect(mockInput.setFiringActive).toHaveBeenCalledWith(false);
      expect(mockAnimations.setADS).toHaveBeenCalledWith(false);
      expect(mockRigManager.setAllWeaponVisibility).toHaveBeenCalledWith(false);
      expect(weapon.canRenderWeapon()).toBe(false);
    });

    it('uses live vehicle occupancy as an authoritative render and input guard', () => {
      weapon.setPlayerController(mockPlayerController);
      vi.mocked((mockPlayerController as any).isInAnyVehicle).mockReturnValue(true);

      weapon.update(0.016);
      weapon.renderWeapon({} as THREE.WebGLRenderer);

      expect(mockInput.setEnabled).toHaveBeenCalledWith(false);
      expect(mockInput.setFiringActive).toHaveBeenCalledWith(false);
      expect(mockAnimations.setADS).toHaveBeenCalledWith(false);
      expect(mockRigManager.setAllWeaponVisibility).toHaveBeenCalledWith(false);
      expect(mockModel.render).not.toHaveBeenCalled();
      expect(weapon.getWeaponPresentationState()).toMatchObject({
        vehicleSuppressed: true,
        canRender: false,
      });
    });

    it('keeps vehicle suppression authoritative when a slot tries to show the weapon', () => {
      weapon.setVehicleEquipmentSuppressed(true);
      vi.clearAllMocks();

      weapon.setWeaponVisibility(true);
      weapon.renderWeapon({} as THREE.WebGLRenderer);

      expect(mockRigManager.setAllWeaponVisibility).toHaveBeenCalledWith(false);
      expect(mockRigManager.setWeaponVisibility).not.toHaveBeenCalledWith(true);
      expect(mockModel.render).not.toHaveBeenCalled();
    });

    it('restores requested weapon visibility after vehicle suppression clears', () => {
      weapon.setVehicleEquipmentSuppressed(true);
      vi.clearAllMocks();

      weapon.setVehicleEquipmentSuppressed(false);

      expect(mockInput.setEnabled).toHaveBeenCalledWith(true);
      expect(mockRigManager.setWeaponVisibility).toHaveBeenCalledWith(true);
      expect(weapon.canRenderWeapon()).toBe(true);
    });

    it('should update HUD on enable', () => {
      weapon.setHUDSystem(mockHUDSystem);
      weapon.enable();

      expect(mockHUDSystem.updateAmmoDisplay).toHaveBeenCalledWith(30, 90);
    });
  });

  describe('Ammo State', () => {
    beforeEach(async () => {
      await weapon.init();
    });

    it('should get current ammo state', () => {
      const state = weapon.getAmmoState();

      expect(state).toEqual({ currentMagazine: 30, reserveAmmo: 90 });
    });

    it('should update HUD on ammo change callback', async () => {
      weapon.setHUDSystem(mockHUDSystem);

      // Ammo module constructor is called with onReloadComplete and onAmmoChange callbacks
      // Get the onAmmoChange callback (second argument to WeaponAmmo constructor)
      const WeaponAmmoModule = await import('./weapon/WeaponAmmo');
      const ammoChangeCallback = vi.mocked(WeaponAmmoModule.WeaponAmmo).mock.calls[0][1];

      ammoChangeCallback({ currentMagazine: 20, reserveAmmo: 60 });

      expect(mockHUDSystem.updateAmmoDisplay).toHaveBeenCalledWith(20, 60);
    });

    it('should check for low ammo warning on ammo change', async () => {
      mockAmmoManager.isLowAmmo.mockReturnValue(true);

      const WeaponAmmoModule = await import('./weapon/WeaponAmmo');
      const ammoChangeCallback = vi.mocked(WeaponAmmoModule.WeaponAmmo).mock.calls[0][1];

      ammoChangeCallback({ currentMagazine: 5, reserveAmmo: 0 });

      // Should check low ammo (Logger.info called in onAmmoChange)
      expect(mockAmmoManager.isLowAmmo).toHaveBeenCalled();
    });
  });

  describe('Disposal', () => {
    it('should dispose all modules and pools', () => {
      weapon.dispose();

      expect(mockInput.dispose).toHaveBeenCalled();
      expect(mockModel.dispose).toHaveBeenCalled();
      expect(mockTracerPool.dispose).toHaveBeenCalled();
      expect(mockMuzzleFlashSystem.dispose).toHaveBeenCalled();
      expect(mockImpactEffectsPool.dispose).toHaveBeenCalled();
    });
  });

  describe('Module-level scratch vectors (no per-frame allocations)', () => {
    it('should use module-level _zeroVelocity when player controller is undefined', async () => {
      await weapon.init();
      weapon.setPlayerController(undefined as any);

      // Should not throw when getting velocity
      expect(() => weapon.update(0.016)).not.toThrow();

      // Animations should receive zero velocity
      expect(mockAnimations.update).toHaveBeenCalledWith(
        0.016,
        false,
        expect.objectContaining({ x: 0, y: 0, z: 0 }),
        expect.any(String)
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    beforeEach(async () => {
      await weapon.init();
      weapon.setCombatantSystem(mockCombatantSystem);
      weapon.setPlayerController(mockPlayerController);
    });

    it('should handle missing rig gracefully', () => {
      mockRigManager.getCurrentRig.mockReturnValue(null);
      expect(() => weapon.update(0.016)).not.toThrow();
    });

    it('should not fire without combatant system', () => {
      weapon.setCombatantSystem(undefined as any);
      mockInput.isFiringActive.mockReturnValue(true);

      weapon.update(0.016);

      expect(mockGunCore.registerShot).not.toHaveBeenCalled();
    });

    it('should handle weapon type detection for shot command', () => {
      // Test rifle (default)
      mockInput.isFiringActive.mockReturnValue(true);
      weapon.update(0.016);

      // Test shotgun
      mockGunCore.isShotgun.mockReturnValue(true);
      weapon.update(0.016);

      // Test SMG (mock getCurrentCore to return SMG core)
      mockGunCore.isShotgun.mockReturnValue(false);
      mockRigManager.getCurrentCore.mockReturnValue(mockRigManager.getSMGCore());
      weapon.update(0.016);

      // Test pistol
      mockRigManager.getCurrentCore.mockReturnValue(mockRigManager.getPistolCore());
      weapon.update(0.016);

      // All should have attempted to fire
      expect(mockFiring.executeShot).toHaveBeenCalled();
    });
  });
});
