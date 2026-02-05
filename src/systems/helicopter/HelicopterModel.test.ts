import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { HelicopterModel } from './HelicopterModel';
import { HelicopterPhysics } from './HelicopterPhysics';
import { HelicopterAnimation } from './HelicopterAnimation';
import { HelicopterAudio } from './HelicopterAudio';
import { HelicopterInteraction } from './HelicopterInteraction';
import { createUH1HueyGeometry } from './HelicopterGeometry';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { HelipadSystem } from './HelipadSystem';
import { IHUDSystem, IPlayerController } from '../../types/SystemInterfaces';

// Hoisted mocks to store instances
const { mocks } = vi.hoisted(() => ({
  mocks: {
    physics: null as any,
    animation: null as any,
    audio: null as any,
    interaction: null as any
  }
}));

// Mock dependencies
vi.mock('./HelicopterPhysics', () => ({
  HelicopterPhysics: class {
    update = vi.fn();
    setControls = vi.fn();
    getState = vi.fn().mockImplementation(() => ({
      position: new THREE.Vector3(10, 20, 30),
      velocity: new THREE.Vector3(0, 0, 0),
      angularVelocity: new THREE.Vector3(0, 0, 0),
      quaternion: new THREE.Quaternion(),
      engineRPM: 0.5,
      isGrounded: false,
      groundHeight: 0
    }));
    getControls = vi.fn().mockImplementation(() => ({
      collective: 0.5,
      cyclicPitch: 0,
      cyclicRoll: 0,
      yaw: 0,
      engineBoost: false,
      autoHover: true
    }));
    constructor() {
      mocks.physics = this;
    }
  }
}));

vi.mock('./HelicopterAnimation', () => ({
  HelicopterAnimation: class {
    initialize = vi.fn();
    updateRotors = vi.fn();
    updateVisualTilt = vi.fn().mockImplementation(() => new THREE.Quaternion());
    dispose = vi.fn();
    disposeAll = vi.fn();
    constructor() {
      mocks.animation = this;
    }
  }
}));

vi.mock('./HelicopterAudio', () => ({
  HelicopterAudio: class {
    setAudioListener = vi.fn();
    initialize = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
    disposeAll = vi.fn();
    constructor() {
      mocks.audio = this;
    }
  }
}));

vi.mock('./HelicopterInteraction', () => ({
  HelicopterInteraction: class {
    setTerrainManager = vi.fn();
    setPlayerController = vi.fn();
    setHUDSystem = vi.fn();
    checkPlayerProximity = vi.fn();
    tryEnterHelicopter = vi.fn();
    exitHelicopter = vi.fn();
    constructor() {
      mocks.interaction = this;
    }
  }
}));

vi.mock('./HelicopterGeometry', () => ({
  createUH1HueyGeometry: vi.fn(() => {
    const group = new THREE.Group();
    group.userData = { model: 'UH-1 Huey' };
    return group;
  })
}));

vi.mock('../../utils/Logger');

describe('HelicopterModel', () => {
  let model: HelicopterModel;
  let scene: THREE.Scene;
  let mockTerrainManager: ImprovedChunkManager;
  let mockHelipadSystem: HelipadSystem;
  let mockPlayerController: IPlayerController;
  let mockHUDSystem: IHUDSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    scene = new THREE.Scene();
    
    // Clear the hoisted instances before creating a new model
    mocks.physics = null;
    mocks.animation = null;
    mocks.audio = null;
    mocks.interaction = null;
    
    model = new HelicopterModel(scene);

    mockTerrainManager = {
      getHeightAt: vi.fn().mockReturnValue(10),
      getChunkAt: vi.fn().mockReturnValue({}),
      registerCollisionObject: vi.fn(),
      unregisterCollisionObject: vi.fn(),
    } as unknown as ImprovedChunkManager;

    mockHelipadSystem = {
      getHelipadPosition: vi.fn().mockReturnValue(new THREE.Vector3(100, 10, 100)),
    } as unknown as HelipadSystem;

    mockPlayerController = {
      isInHelicopter: vi.fn().mockReturnValue(false),
      getHelicopterId: vi.fn().mockReturnValue(null),
      updatePlayerPosition: vi.fn(),
      enterHelicopter: vi.fn(),
      exitHelicopter: vi.fn(),
      getPosition: vi.fn().mockReturnValue(new THREE.Vector3(0, 0, 0)),
    } as unknown as IPlayerController;

    mockHUDSystem = {
      showInteractionPrompt: vi.fn(),
      hideInteractionPrompt: vi.fn(),
    } as unknown as IHUDSystem;
  });

  describe('Initialization and Dependency Injection', () => {
    it('should initialize correctly and create subsystems', () => {
      expect(model).toBeDefined();
      expect(mocks.animation).toBeDefined();
      expect(mocks.audio).toBeDefined();
      expect(mocks.interaction).toBeDefined();
    });

    it('should set terrain manager', () => {
      model.setTerrainManager(mockTerrainManager);
      expect(mocks.interaction.setTerrainManager).toHaveBeenCalledWith(mockTerrainManager);
    });

    it('should set player controller', () => {
      model.setPlayerController(mockPlayerController);
      expect(mocks.interaction.setPlayerController).toHaveBeenCalledWith(mockPlayerController);
    });

    it('should set HUD system', () => {
      model.setHUDSystem(mockHUDSystem);
      expect(mocks.interaction.setHUDSystem).toHaveBeenCalledWith(mockHUDSystem);
    });

    it('should set audio listener', () => {
      const listener = { type: 'AudioListener' } as unknown as THREE.AudioListener;
      model.setAudioListener(listener);
      expect(mocks.audio.setAudioListener).toHaveBeenCalledWith(listener);
    });
  });

  describe('Helicopter Creation', () => {
    it('should create helicopter when helipad is ready', () => {
      model.setHelipadSystem(mockHelipadSystem);
      model.setTerrainManager(mockTerrainManager);
      
      model.createHelicopterWhenReady();

      expect(createUH1HueyGeometry).toHaveBeenCalled();
      expect(scene.children.length).toBe(1);
      expect(model.getAllHelicopters().length).toBe(1);
    });

    it('should not create helicopter if systems are missing', () => {
      model.createHelicopterWhenReady();
      expect(createUH1HueyGeometry).not.toHaveBeenCalled();
    });

    it('should register helicopter for collision detection', () => {
      model.setHelipadSystem(mockHelipadSystem);
      model.setTerrainManager(mockTerrainManager);
      
      model.createHelicopterWhenReady();

      expect(mockTerrainManager.registerCollisionObject).toHaveBeenCalledWith('us_huey', expect.any(THREE.Group));
    });
  });

  describe('Getters', () => {
    beforeEach(() => {
      model.setHelipadSystem(mockHelipadSystem);
      model.setTerrainManager(mockTerrainManager);
      model.createHelicopterWhenReady();
    });

    it('should return helicopter position', () => {
      const pos = model.getHelicopterPosition('us_huey');
      expect(pos).toBeDefined();
      expect(pos?.x).toBe(100);
      expect(pos?.y).toBe(10);
      expect(pos?.z).toBe(100);
    });

    it('should return null for non-existent helicopter position', () => {
      const pos = model.getHelicopterPosition('non_existent');
      expect(pos).toBeNull();
    });

    it('should copy helicopter position to target vector', () => {
      const target = new THREE.Vector3();
      const success = model.getHelicopterPositionTo('us_huey', target);
      expect(success).toBe(true);
      expect(target.x).toBe(100);
    });

    it('should return false when copying non-existent helicopter position', () => {
      const target = new THREE.Vector3();
      const success = model.getHelicopterPositionTo('non_existent', target);
      expect(success).toBe(false);
    });

    it('should return helicopter quaternion', () => {
      const quat = model.getHelicopterQuaternion('us_huey');
      expect(quat).toBeDefined();
      expect(quat).toBeInstanceOf(THREE.Quaternion);
    });

    it('should copy helicopter quaternion to target', () => {
      const target = new THREE.Quaternion();
      const success = model.getHelicopterQuaternionTo('us_huey', target);
      expect(success).toBe(true);
    });

    it('should return all helicopters', () => {
      const helicopters = model.getAllHelicopters();
      expect(helicopters.length).toBe(1);
      expect(helicopters[0].id).toBe('us_huey');
      expect(helicopters[0].model).toBe('UH-1 Huey');
    });
  });

  describe('Update Loop', () => {
    beforeEach(() => {
      model.setHelipadSystem(mockHelipadSystem);
      model.setTerrainManager(mockTerrainManager);
    });

    it('should create helicopter in update if it does not exist and terrain is ready', () => {
      model.update(0.16);
      expect(createUH1HueyGeometry).toHaveBeenCalled();
    });

    it('should update animations, audio, and interactions', () => {
      model.createHelicopterWhenReady();
      model.setPlayerController(mockPlayerController);
      
      model.update(0.16);

      expect(mocks.animation.updateRotors).toHaveBeenCalled();
      expect(mocks.audio.update).toHaveBeenCalled();
      expect(mocks.interaction.checkPlayerProximity).toHaveBeenCalled();
    });

    it('should update physics when player is in helicopter', () => {
      model.createHelicopterWhenReady();
      model.setPlayerController(mockPlayerController);
      vi.mocked(mockPlayerController.isInHelicopter).mockReturnValue(true);
      vi.mocked(mockPlayerController.getHelicopterId).mockReturnValue('us_huey');

      model.update(0.16);

      expect(mocks.physics.update).toHaveBeenCalled();
      expect(mockPlayerController.updatePlayerPosition).toHaveBeenCalled();
    });

    it('should detect helipad height during physics update when near helipad', () => {
      model.setHelipadSystem(mockHelipadSystem);
      model.setTerrainManager(mockTerrainManager);
      model.createHelicopterWhenReady();
      model.setPlayerController(mockPlayerController);
      
      vi.mocked(mockPlayerController.isInHelicopter).mockReturnValue(true);
      vi.mocked(mockPlayerController.getHelicopterId).mockReturnValue('us_huey');
      
      // Helicopter is at (10, 20, 30) - from physics mock
      // Helipad is at (100, 10, 100) - from helipad mock
      // Distance is sqrt((100-10)^2 + (100-30)^2) = sqrt(90^2 + 70^2) = sqrt(8100 + 4900) = sqrt(13000) approx 114
      // Radius is 15. So it shouldn't detect helipad.
      
      model.update(0.16);
      expect(mocks.physics.update).toHaveBeenCalledWith(0.16, 10, undefined);
      
      // Now move helipad closer
      vi.mocked(mockHelipadSystem.getHelipadPosition).mockReturnValue(new THREE.Vector3(15, 10, 35));
      // Distance = sqrt(5^2 + 5^2) = sqrt(50) approx 7.07 < 15
      
      model.update(0.16);
      expect(mocks.physics.update).toHaveBeenCalledWith(0.16, 10, 10);
    });
  });

  describe('Interaction Methods', () => {
    it('should call tryEnterHelicopter on interaction subsystem', () => {
      model.tryEnterHelicopter();
      expect(mocks.interaction.tryEnterHelicopter).toHaveBeenCalled();
    });

    it('should call exitHelicopter on interaction subsystem', () => {
      model.exitHelicopter();
      expect(mocks.interaction.exitHelicopter).toHaveBeenCalled();
    });
  });

  describe('Physics Controls', () => {
    it('should set helicopter controls', () => {
      model.setHelipadSystem(mockHelipadSystem);
      model.setTerrainManager(mockTerrainManager);
      model.createHelicopterWhenReady();

      const controls = { collective: 0.8 };
      model.setHelicopterControls('us_huey', controls);

      expect(mocks.physics.setControls).toHaveBeenCalledWith(controls);
    });

    it('should return helicopter state', () => {
      model.setHelipadSystem(mockHelipadSystem);
      model.setTerrainManager(mockTerrainManager);
      model.createHelicopterWhenReady();

      const state = model.getHelicopterState('us_huey');
      expect(state).toBeDefined();
      expect(state?.position.y).toBe(20);
    });
  });

  describe('Dispose', () => {
    it('should dispose of all resources', () => {
      model.setHelipadSystem(mockHelipadSystem);
      model.setTerrainManager(mockTerrainManager);
      model.createHelicopterWhenReady();

      model.dispose();

      expect(mocks.animation.dispose).toHaveBeenCalled();
      expect(mocks.audio.dispose).toHaveBeenCalled();
      expect(scene.children.length).toBe(0);
      expect(mockTerrainManager.unregisterCollisionObject).toHaveBeenCalledWith('us_huey');
    });
  });
});
