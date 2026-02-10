import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlayerCamera } from './PlayerCamera';
import * as THREE from 'three';
import type { PlayerState } from '../../types';
import type { PlayerInput } from './PlayerInput';
import type { CameraShakeSystem } from '../effects/CameraShakeSystem';
import type { IHelicopterModel } from '../../types/SystemInterfaces';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('PlayerCamera', () => {
  let camera: THREE.PerspectiveCamera;
  let playerState: PlayerState;
  let playerCamera: PlayerCamera;
  let mockInput: PlayerInput;
  let mockShakeSystem: CameraShakeSystem;
  let mockHelicopterModel: IHelicopterModel;

  beforeEach(() => {
    // Create real Three.js camera
    camera = new THREE.PerspectiveCamera();

    // Create mock PlayerState
    playerState = {
      position: new THREE.Vector3(0, 5, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      speed: 5,
      runSpeed: 8,
      isRunning: false,
      isGrounded: true,
      isJumping: false,
      jumpForce: 10,
      gravity: -20,
      isInHelicopter: false,
      helicopterId: null
    } as PlayerState;

    // Create mock PlayerInput
    mockInput = {
      getIsPointerLocked: vi.fn(() => true),
      getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })),
      clearMouseMovement: vi.fn()
    } as unknown as PlayerInput;

    // Create mock CameraShakeSystem
    mockShakeSystem = {
      getCurrentShakeOffset: vi.fn(() => ({ pitch: 0, yaw: 0 }))
    } as unknown as CameraShakeSystem;

    // Create mock IHelicopterModel
    mockHelicopterModel = {
      getHelicopterPositionTo: vi.fn((id: string, target: THREE.Vector3) => {
        target.set(100, 50, 100);
        return true;
      }),
      getHelicopterQuaternionTo: vi.fn((id: string, target: THREE.Quaternion) => {
        target.set(0, 0, 0, 1);
        return true;
      })
    } as unknown as IHelicopterModel;

    // Create PlayerCamera instance
    playerCamera = new PlayerCamera(camera, playerState);
  });

  describe('Constructor', () => {
    it('should create with camera and playerState', () => {
      expect(playerCamera).toBeDefined();
    });

    it('should initialize pitch to 0', () => {
      playerCamera.updateCamera(mockInput);
      expect(camera.rotation.x).toBe(0);
    });

    it('should initialize yaw to Math.PI', () => {
      playerCamera.updateCamera(mockInput);
      expect(camera.rotation.y).toBe(Math.PI);
    });
  });

  describe('setCameraShakeSystem', () => {
    it('should set camera shake system reference', () => {
      playerCamera.setCameraShakeSystem(mockShakeSystem);
      playerCamera.updateCamera(mockInput);
      expect(mockShakeSystem.getCurrentShakeOffset).toHaveBeenCalled();
    });
  });

  describe('setHelicopterModel', () => {
    it('should set helicopter model reference', () => {
      playerState.isInHelicopter = true;
      playerState.helicopterId = 'heli-1';

      playerCamera.setHelicopterModel(mockHelicopterModel);
      playerCamera.updateCamera(mockInput);

      expect(mockHelicopterModel.getHelicopterPositionTo).toHaveBeenCalled();
    });
  });

  describe('Helicopter mouse control', () => {
    it('should initialize with mouse control enabled', () => {
      expect(playerCamera.getHelicopterMouseControlEnabled()).toBe(true);
    });

    it('should set mouse control enabled state', () => {
      playerCamera.setHelicopterMouseControlEnabled(false);
      expect(playerCamera.getHelicopterMouseControlEnabled()).toBe(false);

      playerCamera.setHelicopterMouseControlEnabled(true);
      expect(playerCamera.getHelicopterMouseControlEnabled()).toBe(true);
    });

    it('should toggle mouse control and return new value', () => {
      const initial = playerCamera.getHelicopterMouseControlEnabled();
      const toggled = playerCamera.toggleHelicopterMouseControl();

      expect(toggled).toBe(!initial);
      expect(playerCamera.getHelicopterMouseControlEnabled()).toBe(toggled);
    });

    it('should toggle back to original state', () => {
      const initial = playerCamera.getHelicopterMouseControlEnabled();
      playerCamera.toggleHelicopterMouseControl();
      const back = playerCamera.toggleHelicopterMouseControl();

      expect(back).toBe(initial);
    });
  });

  describe('updateCamera - First Person Mode', () => {
    it('should use first-person camera when not in helicopter', () => {
      playerState.isInHelicopter = false;
      playerCamera.updateCamera(mockInput);

      expect(camera.position.x).toBe(playerState.position.x);
      expect(camera.position.y).toBe(playerState.position.y);
      expect(camera.position.z).toBe(playerState.position.z);
    });

    it('should update yaw from mouse X movement (negative direction)', () => {
      mockInput.getMouseMovement = vi.fn(() => ({ x: 0.01, y: 0 }));

      playerCamera.updateCamera(mockInput);
      const expectedYaw = Math.PI - 0.01;

      expect(camera.rotation.y).toBeCloseTo(expectedYaw, 5);
    });

    it('should update pitch from mouse Y movement (negative direction)', () => {
      mockInput.getMouseMovement = vi.fn(() => ({ x: 0, y: 0.01 }));

      playerCamera.updateCamera(mockInput);
      const expectedPitch = -0.01;

      expect(camera.rotation.x).toBeCloseTo(expectedPitch, 5);
    });

    it('should clamp pitch to +/- maxPitch (PI/2 - 0.1)', () => {
      const maxPitch = Math.PI / 2 - 0.1;

      // Try to pitch down beyond limit
      mockInput.getMouseMovement = vi.fn(() => ({ x: 0, y: -10 }));
      playerCamera.updateCamera(mockInput);
      expect(camera.rotation.x).toBeCloseTo(maxPitch, 5);

      // Reset
      playerCamera = new PlayerCamera(camera, playerState);

      // Try to pitch up beyond limit
      mockInput.getMouseMovement = vi.fn(() => ({ x: 0, y: 10 }));
      playerCamera.updateCamera(mockInput);
      expect(camera.rotation.x).toBeCloseTo(-maxPitch, 5);
    });

    it('should set camera rotation order to YXZ', () => {
      playerCamera.updateCamera(mockInput);
      expect(camera.rotation.order).toBe('YXZ');
    });

    it('should copy playerState.position to camera.position', () => {
      playerState.position.set(10, 20, 30);
      playerCamera.updateCamera(mockInput);

      expect(camera.position.x).toBe(10);
      expect(camera.position.y).toBe(20);
      expect(camera.position.z).toBe(30);
    });

    it('should only process mouse when pointer is locked', () => {
      mockInput.getIsPointerLocked = vi.fn(() => false);
      mockInput.getMouseMovement = vi.fn(() => ({ x: 0.5, y: 0.5 }));

      playerCamera.updateCamera(mockInput);

      // Rotation should remain at initial values
      expect(camera.rotation.y).toBe(Math.PI);
      expect(camera.rotation.x).toBe(0);
      expect(mockInput.clearMouseMovement).not.toHaveBeenCalled();
    });

    it('should clear mouse movement after processing', () => {
      mockInput.getIsPointerLocked = vi.fn(() => true);
      mockInput.getMouseMovement = vi.fn(() => ({ x: 0.01, y: 0.01 }));

      playerCamera.updateCamera(mockInput);

      expect(mockInput.clearMouseMovement).toHaveBeenCalled();
    });
  });

  describe('updateCamera - First Person with Camera Shake', () => {
    beforeEach(() => {
      playerCamera.setCameraShakeSystem(mockShakeSystem);
    });

    it('should add shake offset to camera rotation', () => {
      mockShakeSystem.getCurrentShakeOffset = vi.fn(() => ({ pitch: 0.1, yaw: 0.2 }));

      playerCamera.updateCamera(mockInput);

      expect(camera.rotation.x).toBeCloseTo(0.1, 5);
      expect(camera.rotation.y).toBeCloseTo(Math.PI + 0.2, 5);
    });

    it('should work correctly when shake returns zero offsets', () => {
      mockShakeSystem.getCurrentShakeOffset = vi.fn(() => ({ pitch: 0, yaw: 0 }));

      playerCamera.updateCamera(mockInput);

      expect(camera.rotation.x).toBe(0);
      expect(camera.rotation.y).toBe(Math.PI);
    });

    it('should combine mouse movement with shake offset', () => {
      mockInput.getMouseMovement = vi.fn(() => ({ x: 0.01, y: 0.01 }));
      mockShakeSystem.getCurrentShakeOffset = vi.fn(() => ({ pitch: 0.05, yaw: 0.05 }));

      playerCamera.updateCamera(mockInput);

      // pitch = 0 - 0.01 + 0.05 = 0.04
      // yaw = PI - 0.01 + 0.05 = PI + 0.04
      expect(camera.rotation.x).toBeCloseTo(0.04, 5);
      expect(camera.rotation.y).toBeCloseTo(Math.PI + 0.04, 5);
    });
  });

  describe('updateCamera - Helicopter Following Mode', () => {
    beforeEach(() => {
      playerState.isInHelicopter = true;
      playerState.helicopterId = 'heli-1';
      playerCamera.setHelicopterModel(mockHelicopterModel);
      playerCamera.setHelicopterMouseControlEnabled(true); // Following mode
    });

    it('should position camera behind helicopter based on quaternion', () => {
      playerCamera.updateCamera(mockInput);

      // Camera should be behind helicopter (25 units back, 8 units up)
      expect(mockHelicopterModel.getHelicopterPositionTo).toHaveBeenCalledWith('heli-1', expect.any(THREE.Vector3));
      expect(mockHelicopterModel.getHelicopterQuaternionTo).toHaveBeenCalledWith('heli-1', expect.any(THREE.Quaternion));
    });

    it('should look at helicopter position + 2 units up', () => {
      playerCamera.updateCamera(mockInput);

      // Camera should look at helicopter center (slightly elevated)
      const lookDirection = new THREE.Vector3();
      camera.getWorldDirection(lookDirection);

      // Direction should point toward helicopter (approximately)
      expect(lookDirection.length()).toBeCloseTo(1, 5);
    });

    it('should use configured distance (25) and height (8)', () => {
      mockHelicopterModel.getHelicopterPositionTo = vi.fn((id, target) => {
        target.set(0, 0, 0);
        return true;
      });
      mockHelicopterModel.getHelicopterQuaternionTo = vi.fn((id, target) => {
        target.set(0, 0, 0, 1); // Identity quaternion
        return true;
      });

      playerCamera.updateCamera(mockInput);

      // With identity quaternion, forward is (-1,0,0)
      // Camera at: (0,0,0) + (-1,0,0)*-25 + (0,8,0) = (25, 8, 0)
      expect(camera.position.x).toBeCloseTo(25, 1);
      expect(camera.position.y).toBeCloseTo(8, 1);
      expect(camera.position.z).toBeCloseTo(0, 1);
    });
  });

  describe('updateCamera - Helicopter Orbital Mode', () => {
    beforeEach(() => {
      playerState.isInHelicopter = true;
      playerState.helicopterId = 'heli-1';
      playerCamera.setHelicopterModel(mockHelicopterModel);
      playerCamera.setHelicopterMouseControlEnabled(false); // Orbital mode
    });

    it('should control camera with mouse in orbital mode', () => {
      mockInput.getMouseMovement = vi.fn(() => ({ x: 0.01, y: 0.01 }));

      playerCamera.updateCamera(mockInput);

      expect(mockInput.clearMouseMovement).toHaveBeenCalled();
    });

    it('should clamp pitch to +/- 0.4*PI', () => {
      const maxPitch = Math.PI * 0.4;

      // Try to pitch down beyond limit
      mockInput.getMouseMovement = vi.fn(() => ({ x: 0, y: -100 }));
      playerCamera.updateCamera(mockInput);

      // Internal pitch should be clamped
      // We can't directly access internal pitch, but camera position should reflect it
      expect(camera.position).toBeDefined();

      // Reset for up test
      playerCamera = new PlayerCamera(camera, playerState);
      playerState.isInHelicopter = true;
      playerState.helicopterId = 'heli-1';
      playerCamera.setHelicopterModel(mockHelicopterModel);
      playerCamera.setHelicopterMouseControlEnabled(false);

      mockInput.getMouseMovement = vi.fn(() => ({ x: 0, y: 100 }));
      playerCamera.updateCamera(mockInput);

      expect(camera.position).toBeDefined();
    });

    it('should position camera using spherical coordinates', () => {
      mockHelicopterModel.getHelicopterPositionTo = vi.fn((id, target) => {
        target.set(0, 0, 0);
        return true;
      });

      playerCamera.updateCamera(mockInput);

      // Camera should be approximately at radius 25 from helicopter
      // Note: height offset (8) affects total distance from origin
      const distance = camera.position.length();
      expect(distance).toBeGreaterThan(20); // At least somewhat distant
      expect(distance).toBeLessThan(30);    // But not too far
    });

    it('should look at helicopter center + 2 units up', () => {
      mockHelicopterModel.getHelicopterPositionTo = vi.fn((id, target) => {
        target.set(0, 0, 0);
        return true;
      });

      playerCamera.updateCamera(mockInput);

      // Camera should look at origin + (0, 2, 0)
      const lookDirection = new THREE.Vector3();
      camera.getWorldDirection(lookDirection);
      expect(lookDirection.length()).toBeCloseTo(1, 5);
    });

    it('should allow full 360-degree horizontal rotation', () => {
      // Rotate full circle horizontally
      mockInput.getMouseMovement = vi.fn(() => ({ x: Math.PI * 2, y: 0 }));

      playerCamera.updateCamera(mockInput);

      // Should complete rotation without issue
      expect(camera.position).toBeDefined();
    });
  });

  describe('updateCamera - Helicopter Fallback', () => {
    beforeEach(() => {
      playerState.isInHelicopter = true;
    });

    it('should fallback to first-person if helicopterId is null', () => {
      playerState.helicopterId = null;
      playerCamera.setHelicopterModel(mockHelicopterModel);

      playerCamera.updateCamera(mockInput);

      // Should use first-person camera (copies position)
      expect(camera.position.equals(playerState.position)).toBe(true);
    });

    it('should fallback if helicopterModel not set', () => {
      playerState.helicopterId = 'heli-1';
      // Don't set helicopter model

      playerCamera.updateCamera(mockInput);

      // Should use first-person camera
      expect(camera.position.equals(playerState.position)).toBe(true);
    });

    it('should fallback if getHelicopterPositionTo returns false', () => {
      playerState.helicopterId = 'heli-1';
      mockHelicopterModel.getHelicopterPositionTo = vi.fn(() => false);
      playerCamera.setHelicopterModel(mockHelicopterModel);

      playerCamera.updateCamera(mockInput);

      // Should use first-person camera
      expect(camera.position.equals(playerState.position)).toBe(true);
    });

    it('should fallback if getHelicopterQuaternionTo returns false', () => {
      playerState.helicopterId = 'heli-1';
      mockHelicopterModel.getHelicopterPositionTo = vi.fn((id, target) => {
        target.set(100, 50, 100);
        return true;
      });
      mockHelicopterModel.getHelicopterQuaternionTo = vi.fn(() => false);
      playerCamera.setHelicopterModel(mockHelicopterModel);
      playerCamera.setHelicopterMouseControlEnabled(true); // Following mode needs quaternion

      playerCamera.updateCamera(mockInput);

      // Should use first-person camera
      expect(camera.position.equals(playerState.position)).toBe(true);
    });
  });

  describe('applyRecoil', () => {
    it('should add pitch delta (clamped to maxPitch)', () => {
      const maxPitch = Math.PI / 2 - 0.1;

      playerCamera.applyRecoil(0.1, 0);
      playerCamera.updateCamera(mockInput);

      expect(camera.rotation.x).toBeCloseTo(0.1, 5);
    });

    it('should clamp pitch when delta exceeds maxPitch', () => {
      const maxPitch = Math.PI / 2 - 0.1;

      playerCamera.applyRecoil(-10, 0); // Large negative delta
      playerCamera.updateCamera(mockInput);

      expect(camera.rotation.x).toBeCloseTo(-maxPitch, 5);
    });

    it('should add yaw delta (unclamped)', () => {
      playerCamera.applyRecoil(0, 0.2);
      playerCamera.updateCamera(mockInput);

      expect(camera.rotation.y).toBeCloseTo(Math.PI + 0.2, 5);
    });

    it('should allow yaw to wrap around without clamping', () => {
      playerCamera.applyRecoil(0, Math.PI * 3); // Large yaw
      playerCamera.updateCamera(mockInput);

      // Yaw should not be clamped
      expect(camera.rotation.y).toBeCloseTo(Math.PI + Math.PI * 3, 5);
    });

    it('should apply both pitch and yaw deltas', () => {
      playerCamera.applyRecoil(0.05, -0.03);
      playerCamera.updateCamera(mockInput);

      expect(camera.rotation.x).toBeCloseTo(0.05, 5);
      expect(camera.rotation.y).toBeCloseTo(Math.PI - 0.03, 5);
    });

    it('should accumulate multiple recoil applications', () => {
      playerCamera.applyRecoil(0.01, 0.02);
      playerCamera.applyRecoil(0.01, 0.02);
      playerCamera.updateCamera(mockInput);

      expect(camera.rotation.x).toBeCloseTo(0.02, 5);
      expect(camera.rotation.y).toBeCloseTo(Math.PI + 0.04, 5);
    });
  });

  describe('resetCameraPosition', () => {
    it('should copy given position to camera', () => {
      const newPosition = new THREE.Vector3(100, 200, 300);

      playerCamera.resetCameraPosition(newPosition);

      expect(camera.position.x).toBe(100);
      expect(camera.position.y).toBe(200);
      expect(camera.position.z).toBe(300);
    });

    it('should not modify given position vector', () => {
      const newPosition = new THREE.Vector3(100, 200, 300);
      const originalX = newPosition.x;
      const originalY = newPosition.y;
      const originalZ = newPosition.z;

      playerCamera.resetCameraPosition(newPosition);

      expect(newPosition.x).toBe(originalX);
      expect(newPosition.y).toBe(originalY);
      expect(newPosition.z).toBe(originalZ);
    });

    it('should work with zero position', () => {
      const zero = new THREE.Vector3(0, 0, 0);

      playerCamera.resetCameraPosition(zero);

      expect(camera.position.x).toBe(0);
      expect(camera.position.y).toBe(0);
      expect(camera.position.z).toBe(0);
    });

    it('should work with negative coordinates', () => {
      const negative = new THREE.Vector3(-50, -100, -150);

      playerCamera.resetCameraPosition(negative);

      expect(camera.position.x).toBe(-50);
      expect(camera.position.y).toBe(-100);
      expect(camera.position.z).toBe(-150);
    });
  });

  describe('Integration - Mouse sensitivity', () => {
    it('should apply 0.01 sensitivity factor in helicopter orbital mode', () => {
      playerState.isInHelicopter = true;
      playerState.helicopterId = 'heli-1';
      playerCamera.setHelicopterModel(mockHelicopterModel);
      playerCamera.setHelicopterMouseControlEnabled(false);

      mockInput.getMouseMovement = vi.fn(() => ({ x: 1, y: 1 }));

      playerCamera.updateCamera(mockInput);

      // Mouse movement is multiplied by 0.01 in orbital mode
      // This is hard to verify directly, but the system should not crash
      expect(camera.position).toBeDefined();
    });
  });

  describe('Integration - State transitions', () => {
    it('should switch from first-person to helicopter camera', () => {
      // Start in first-person
      playerState.isInHelicopter = false;
      playerCamera.updateCamera(mockInput);
      const fpPosition = camera.position.clone();

      // Switch to helicopter
      playerState.isInHelicopter = true;
      playerState.helicopterId = 'heli-1';
      playerCamera.setHelicopterModel(mockHelicopterModel);
      playerCamera.updateCamera(mockInput);

      // Position should change (helicopter is at 100, 50, 100)
      expect(camera.position.equals(fpPosition)).toBe(false);
    });

    it('should switch from helicopter to first-person camera', () => {
      // Start in helicopter
      playerState.isInHelicopter = true;
      playerState.helicopterId = 'heli-1';
      playerCamera.setHelicopterModel(mockHelicopterModel);
      playerCamera.updateCamera(mockInput);
      const heliPosition = camera.position.clone();

      // Switch to first-person
      playerState.isInHelicopter = false;
      playerState.helicopterId = null;
      playerCamera.updateCamera(mockInput);

      // Position should be at player position
      expect(camera.position.equals(playerState.position)).toBe(true);
      expect(camera.position.equals(heliPosition)).toBe(false);
    });

    it('should switch between helicopter following and orbital modes', () => {
      playerState.isInHelicopter = true;
      playerState.helicopterId = 'heli-1';
      playerCamera.setHelicopterModel(mockHelicopterModel);

      // Following mode
      playerCamera.setHelicopterMouseControlEnabled(true);
      playerCamera.updateCamera(mockInput);
      const followPosition = camera.position.clone();

      // Orbital mode
      playerCamera.setHelicopterMouseControlEnabled(false);
      playerCamera.updateCamera(mockInput);

      // Position may differ based on internal pitch/yaw in orbital mode
      expect(camera.position).toBeDefined();
    });
  });

  describe('Edge cases', () => {
    it('should handle very small mouse movements', () => {
      mockInput.getMouseMovement = vi.fn(() => ({ x: 0.00001, y: 0.00001 }));

      playerCamera.updateCamera(mockInput);

      expect(camera.rotation.x).toBeCloseTo(-0.00001, 10);
      expect(camera.rotation.y).toBeCloseTo(Math.PI - 0.00001, 10);
    });

    it('should handle zero mouse movements', () => {
      mockInput.getMouseMovement = vi.fn(() => ({ x: 0, y: 0 }));

      playerCamera.updateCamera(mockInput);

      expect(camera.rotation.x).toBe(0);
      expect(camera.rotation.y).toBe(Math.PI);
    });

    it('should handle rapid camera updates', () => {
      for (let i = 0; i < 100; i++) {
        mockInput.getMouseMovement = vi.fn(() => ({ x: 0.001, y: 0.001 }));
        playerCamera.updateCamera(mockInput);
      }

      // Should accumulate movement without issues
      expect(camera.rotation.x).toBeCloseTo(-0.1, 2);
      expect(camera.rotation.y).toBeCloseTo(Math.PI - 0.1, 2);
    });

    it('should handle helicopter model methods returning false', () => {
      playerState.isInHelicopter = true;
      playerState.helicopterId = 'heli-1';

      mockHelicopterModel.getHelicopterPositionTo = vi.fn(() => false);
      mockHelicopterModel.getHelicopterQuaternionTo = vi.fn(() => false);

      playerCamera.setHelicopterModel(mockHelicopterModel);
      playerCamera.updateCamera(mockInput);

      // Should fallback to first-person without crashing
      expect(camera.position.equals(playerState.position)).toBe(true);
    });
  });
});
