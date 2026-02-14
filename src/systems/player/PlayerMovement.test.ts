import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlayerMovement } from './PlayerMovement';
import { PlayerState } from '../../types';
import * as THREE from 'three';
import { PlayerInput } from './PlayerInput';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { SandbagSystem } from '../weapons/SandbagSystem';
import { FootstepAudioSystem } from '../audio/FootstepAudioSystem';

// Mock dependencies
vi.mock('./PlayerInput');
vi.mock('../terrain/ImprovedChunkManager');
vi.mock('../weapons/SandbagSystem');
vi.mock('../audio/FootstepAudioSystem');
vi.mock('../../utils/Logger');

describe('PlayerMovement', () => {
  let playerMovement: PlayerMovement;
  let playerState: PlayerState;
  let mockInput: PlayerInput;
  let mockCamera: THREE.Camera;
  let mockChunkManager: ImprovedChunkManager;
  let mockSandbagSystem: SandbagSystem;
  let mockFootstepAudio: FootstepAudioSystem;

  beforeEach(() => {
    vi.clearAllMocks();

    // Initialize player state
    playerState = {
      position: new THREE.Vector3(0, 2, 0),
      rotation: new THREE.Euler(),
      velocity: new THREE.Vector3(0, 0, 0),
      speed: 5,
      runSpeed: 8,
      jumpForce: 10,
      gravity: -30,
      isGrounded: true,
      isJumping: false,
      isRunning: false,
      health: 100,
      maxHealth: 100,
      isADS: false,
      isInHelicopter: false,
      helicopterId: null,
      currentWeaponIndex: 0,
      isDead: false,
      weaponSlots: [],
      isReloading: false
    };

    // Create movement instance
    playerMovement = new PlayerMovement(playerState);

    // Setup mock camera
    mockCamera = new THREE.PerspectiveCamera();
    mockCamera.position.set(0, 2, 0);
    mockCamera.lookAt(0, 0, -1);

    // Setup mock input
    mockInput = {
      isKeyPressed: vi.fn().mockReturnValue(false),
      getMouseMovement: vi.fn().mockReturnValue({ x: 0, y: 0 }),
      getTouchMovementVector: vi.fn().mockReturnValue({ x: 0, z: 0 }),
      getTouchCyclicInput: vi.fn().mockReturnValue({ pitch: 0, roll: 0 }),
      dispose: vi.fn()
    } as any;

    // Setup mock chunk manager
    mockChunkManager = {
      getEffectiveHeightAt: vi.fn().mockReturnValue(0)
    } as any;

    // Setup mock sandbag system
    mockSandbagSystem = {
      checkCollision: vi.fn().mockReturnValue(false),
      getStandingHeight: vi.fn().mockReturnValue(null)
    } as any;

    // Setup mock footstep audio
    mockFootstepAudio = {
      playPlayerFootstep: vi.fn(),
      playLandingSound: vi.fn()
    } as any;
  });

  describe('Constructor', () => {
    it('should initialize with player state', () => {
      expect(playerMovement).toBeDefined();
    });

    it('should not be running initially', () => {
      expect(playerState.isRunning).toBe(false);
    });
  });

  describe('setRunning', () => {
    it('should enable running when true', () => {
      playerMovement.setRunning(true);
      expect(playerState.isRunning).toBe(true);
    });

    it('should disable running when false', () => {
      playerMovement.setRunning(true);
      playerMovement.setRunning(false);
      expect(playerState.isRunning).toBe(false);
    });

    it('should update helicopter engine boost when in helicopter', () => {
      playerState.isInHelicopter = true;
      playerMovement.setRunning(true);

      const controls = playerMovement.getHelicopterControls();
      expect(controls.engineBoost).toBe(true);
    });
  });

  describe('handleJump', () => {
    it('should apply jump velocity when grounded', () => {
      playerState.isGrounded = true;
      playerState.isJumping = false;

      playerMovement.handleJump();

      expect(playerState.velocity.y).toBe(playerState.jumpForce);
      expect(playerState.isJumping).toBe(true);
      expect(playerState.isGrounded).toBe(false);
    });

    it('should not jump when already in air', () => {
      playerState.isGrounded = false;
      playerState.velocity.y = 0;

      playerMovement.handleJump();

      expect(playerState.velocity.y).toBe(0);
    });

    it('should not jump when already jumping', () => {
      playerState.isGrounded = true;
      playerState.isJumping = true;
      playerState.velocity.y = 5;

      playerMovement.handleJump();

      expect(playerState.velocity.y).toBe(5); // Unchanged
    });
  });

  describe('updateMovement - basic movement', () => {
    beforeEach(() => {
      playerMovement.setChunkManager(mockChunkManager);
      playerMovement.setSandbagSystem(mockSandbagSystem);
    });

    it('should not move when in helicopter', () => {
      playerState.isInHelicopter = true;
      playerState.velocity.set(5, 0, 5);

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(playerState.velocity.x).toBe(0);
      expect(playerState.velocity.y).toBe(0);
      expect(playerState.velocity.z).toBe(0);
    });

    it('should apply sprint speed when running', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');
      playerMovement.setRunning(true);

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      // Velocity should be influenced by runSpeed (8) rather than speed (5)
      expect(Math.abs(playerState.velocity.z)).toBeGreaterThan(0);
    });

    it('should move forward when W is pressed', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      // Should have negative Z velocity (forward in camera space)
      expect(playerState.velocity.z).not.toBe(0);
    });

    it('should move backward when S is pressed', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keys');

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      // Should have positive Z velocity (backward in camera space)
      expect(playerState.velocity.z).not.toBe(0);
    });

    it('should strafe left when A is pressed', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keya');

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(playerState.velocity.x).not.toBe(0);
    });

    it('should strafe right when D is pressed', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyd');

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(playerState.velocity.x).not.toBe(0);
    });

    it('should apply friction when no movement keys pressed', () => {
      playerState.velocity.set(5, 0, 5);

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      // Velocity should decrease due to friction
      expect(Math.abs(playerState.velocity.x)).toBeLessThan(5);
      expect(Math.abs(playerState.velocity.z)).toBeLessThan(5);
    });
  });

  describe('updateMovement - gravity and ground detection', () => {
    beforeEach(() => {
      playerMovement.setChunkManager(mockChunkManager);
      playerMovement.setSandbagSystem(mockSandbagSystem);
    });

    it('should apply gravity each frame', () => {
      playerState.position.y = 10; // Start in air
      playerState.isGrounded = false;
      const initialY = playerState.velocity.y;

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(playerState.velocity.y).toBeLessThan(initialY);
    });

    it('should detect ground collision and stop falling', () => {
      playerState.position.y = 5;
      playerState.velocity.y = -10;
      playerState.isGrounded = false;
      vi.mocked(mockChunkManager.getEffectiveHeightAt).mockReturnValue(0);

      playerMovement.updateMovement(0.5, mockInput, mockCamera); // Large deltaTime to ensure landing

      expect(playerState.position.y).toBe(2); // Ground height (0) + 2
      expect(playerState.velocity.y).toBe(0);
      expect(playerState.isGrounded).toBe(true);
      expect(playerState.isJumping).toBe(false);
    });

    it('should set isGrounded to false when in air', () => {
      playerState.position.y = 10;
      playerState.isGrounded = true;
      vi.mocked(mockChunkManager.getEffectiveHeightAt).mockReturnValue(0);

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(playerState.isGrounded).toBe(false);
    });

    it('should query terrain height from chunk manager', () => {
      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(mockChunkManager.getEffectiveHeightAt).toHaveBeenCalled();
    });

    it('should use default height when no chunk manager', () => {
      const movementWithoutChunk = new PlayerMovement(playerState);
      movementWithoutChunk.setSandbagSystem(mockSandbagSystem);
      playerState.position.y = 0;

      movementWithoutChunk.updateMovement(0.016, mockInput, mockCamera);

      // Should clamp to default ground height (2)
      expect(playerState.position.y).toBe(2);
    });
  });

  describe('updateMovement - collision detection', () => {
    beforeEach(() => {
      playerMovement.setChunkManager(mockChunkManager);
      playerMovement.setSandbagSystem(mockSandbagSystem);
    });

    it('should check sandbag collision', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(mockSandbagSystem.checkCollision).toHaveBeenCalled();
    });

    it('should stop movement when colliding with sandbag', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');
      vi.mocked(mockSandbagSystem.checkCollision).mockReturnValue(true);
      const initialPos = playerState.position.clone();

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      // Velocity should be zeroed due to collision
      expect(playerState.velocity.x).toBe(0);
      expect(playerState.velocity.z).toBe(0);
    });

    it('should allow sliding along sandbag in X direction', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');
      const initialPos = playerState.position.clone();

      // Mock collision: block new position, allow slideX, block slideZ
      let callCount = 0;
      vi.mocked(mockSandbagSystem.checkCollision).mockImplementation((pos: THREE.Vector3) => {
        callCount++;
        // First call: block the full new position
        if (callCount === 1) return true;
        // Second call (slideX): allow it
        if (callCount === 2) return false;
        // All others: block
        return true;
      });

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      // Z should be zeroed due to collision in that direction
      expect(playerState.velocity.z).toBe(0);
    });
  });

  describe('updateMovement - landing sound', () => {
    beforeEach(() => {
      playerMovement.setChunkManager(mockChunkManager);
      playerMovement.setSandbagSystem(mockSandbagSystem);
      playerMovement.setFootstepAudioSystem(mockFootstepAudio);
    });

    it('should play landing sound when landing with sufficient velocity', () => {
      playerState.position.y = 10;
      playerState.velocity.y = -6; // Above threshold
      playerState.isGrounded = false;
      vi.mocked(mockChunkManager.getEffectiveHeightAt).mockReturnValue(0);

      playerMovement.updateMovement(0.5, mockInput, mockCamera);

      expect(mockFootstepAudio.playLandingSound).toHaveBeenCalled();
    });

    it('should not play landing sound when already grounded', () => {
      playerState.isGrounded = true;

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(mockFootstepAudio.playLandingSound).not.toHaveBeenCalled();
    });

    it('should not play landing sound with low velocity', () => {
      playerState.position.y = 2.5;
      playerState.velocity.y = -4; // Below -5 threshold
      playerState.isGrounded = false;
      vi.mocked(mockChunkManager.getEffectiveHeightAt).mockReturnValue(0);

      playerMovement.updateMovement(0.016, mockInput, mockCamera); // Small deltaTime

      expect(mockFootstepAudio.playLandingSound).not.toHaveBeenCalled();
    });
  });

  describe('updateMovement - footstep audio', () => {
    beforeEach(() => {
      playerMovement.setChunkManager(mockChunkManager);
      playerMovement.setSandbagSystem(mockSandbagSystem);
      playerMovement.setFootstepAudioSystem(mockFootstepAudio);
    });

    it('should play footsteps when moving on ground', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');
      playerState.isGrounded = true;

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(mockFootstepAudio.playPlayerFootstep).toHaveBeenCalledWith(
        expect.any(THREE.Vector3),
        false, // Not running
        0.016,
        true // Is moving and grounded
      );
    });

    it('should pass running flag to footstep system', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');
      playerState.isGrounded = true;
      playerMovement.setRunning(true);

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(mockFootstepAudio.playPlayerFootstep).toHaveBeenCalledWith(
        expect.any(THREE.Vector3),
        true, // Running
        0.016,
        true
      );
    });

    it('should not play footsteps when in helicopter', () => {
      playerState.isInHelicopter = true;

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(mockFootstepAudio.playPlayerFootstep).not.toHaveBeenCalled();
    });

    it('should indicate not moving when no keys pressed', () => {
      playerState.isGrounded = true;

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(mockFootstepAudio.playPlayerFootstep).toHaveBeenCalledWith(
        expect.any(THREE.Vector3),
        false,
        0.016,
        false // Not moving
      );
    });
  });

  describe('updateHelicopterControls', () => {
    it('should increase collective when W pressed', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');

      playerMovement.updateHelicopterControls(0.1, mockInput);

      const controls = playerMovement.getHelicopterControls();
      expect(controls.collective).toBeGreaterThan(0);
    });

    it('should decrease collective when S pressed', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');
      playerMovement.updateHelicopterControls(0.1, mockInput); // Build up collective

      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keys');
      playerMovement.updateHelicopterControls(0.1, mockInput);

      const controls = playerMovement.getHelicopterControls();
      expect(controls.collective).toBeLessThan(1.0);
    });

    it('should auto-stabilize collective when auto-hover enabled', () => {
      // Set collective to non-hover value
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');
      playerMovement.updateHelicopterControls(1.0, mockInput);

      // Release keys, auto-hover should pull toward 0.4
      vi.mocked(mockInput.isKeyPressed).mockReturnValue(false);
      playerMovement.updateHelicopterControls(1.0, mockInput);

      const controls = playerMovement.getHelicopterControls();
      // Should move toward hover point (0.4)
      expect(controls.collective).toBeLessThan(1.0);
    });

    it('should not auto-stabilize when auto-hover disabled', () => {
      playerMovement.toggleAutoHover(); // Disable

      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');
      playerMovement.updateHelicopterControls(0.5, mockInput);
      const collective1 = playerMovement.getHelicopterControls().collective;

      vi.mocked(mockInput.isKeyPressed).mockReturnValue(false);
      playerMovement.updateHelicopterControls(0.016, mockInput);
      const collective2 = playerMovement.getHelicopterControls().collective;

      // Should stay same (no auto-stabilization)
      expect(collective2).toBe(collective1);
    });

    it('should control yaw with A/D keys', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keya');
      playerMovement.updateHelicopterControls(0.1, mockInput);

      const controlsLeft = playerMovement.getHelicopterControls();
      expect(controlsLeft.yaw).toBeGreaterThan(0);

      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyd');
      playerMovement.updateHelicopterControls(0.2, mockInput);

      const controlsRight = playerMovement.getHelicopterControls();
      expect(controlsRight.yaw).toBeLessThan(controlsLeft.yaw);
    });

    it('should control cyclic pitch with arrow up/down', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'arrowup');
      playerMovement.updateHelicopterControls(0.1, mockInput);

      const controls = playerMovement.getHelicopterControls();
      expect(controls.cyclicPitch).toBeGreaterThan(0);
    });

    it('should control cyclic roll with arrow left/right', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'arrowright');
      playerMovement.updateHelicopterControls(0.1, mockInput);

      const controls = playerMovement.getHelicopterControls();
      expect(controls.cyclicRoll).toBeGreaterThan(0);
    });

    it('should clamp collective to [0, 1]', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');
      playerMovement.updateHelicopterControls(10.0, mockInput); // Very large delta

      const controls = playerMovement.getHelicopterControls();
      expect(controls.collective).toBeLessThanOrEqual(1.0);
      expect(controls.collective).toBeGreaterThanOrEqual(0.0);
    });

    it('should clamp yaw to [-1, 1]', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keya');
      playerMovement.updateHelicopterControls(10.0, mockInput);

      const controls = playerMovement.getHelicopterControls();
      expect(controls.yaw).toBeLessThanOrEqual(1.0);
      expect(controls.yaw).toBeGreaterThanOrEqual(-1.0);
    });
  });

  describe('addMouseControlToHelicopter', () => {
    it('should adjust cyclic roll based on mouse X', () => {
      const mouseMovement = { x: 0.5, y: 0 };

      playerMovement.addMouseControlToHelicopter(mouseMovement, 0.5);

      const controls = playerMovement.getHelicopterControls();
      expect(controls.cyclicRoll).toBeGreaterThan(0);
    });

    it('should adjust cyclic pitch based on mouse Y (inverted)', () => {
      const mouseMovement = { x: 0, y: 0.5 };

      playerMovement.addMouseControlToHelicopter(mouseMovement, 0.5);

      const controls = playerMovement.getHelicopterControls();
      expect(controls.cyclicPitch).toBeLessThan(0); // Inverted
    });

    it('should respect mouse sensitivity', () => {
      const mouseMovement = { x: 1, y: 0 };

      playerMovement.addMouseControlToHelicopter(mouseMovement, 0.1);
      const controls1 = playerMovement.getHelicopterControls();

      // Reset
      const freshMovement = new PlayerMovement(playerState);
      freshMovement.addMouseControlToHelicopter(mouseMovement, 1.0);
      const controls2 = freshMovement.getHelicopterControls();

      expect(Math.abs(controls2.cyclicRoll)).toBeGreaterThan(Math.abs(controls1.cyclicRoll));
    });

    it('should clamp controls to [-1, 1]', () => {
      const mouseMovement = { x: 100, y: 100 };

      playerMovement.addMouseControlToHelicopter(mouseMovement, 10.0);

      const controls = playerMovement.getHelicopterControls();
      expect(controls.cyclicRoll).toBeLessThanOrEqual(1.0);
      expect(controls.cyclicRoll).toBeGreaterThanOrEqual(-1.0);
      expect(controls.cyclicPitch).toBeLessThanOrEqual(1.0);
      expect(controls.cyclicPitch).toBeGreaterThanOrEqual(-1.0);
    });
  });

  describe('toggleAutoHover', () => {
    it('should toggle auto-hover from true to false', () => {
      const initialState = playerMovement.getHelicopterControls().autoHover;

      playerMovement.toggleAutoHover();

      const newState = playerMovement.getHelicopterControls().autoHover;
      expect(newState).toBe(!initialState);
    });

    it('should toggle auto-hover from false to true', () => {
      playerMovement.toggleAutoHover(); // First toggle
      const state1 = playerMovement.getHelicopterControls().autoHover;

      playerMovement.toggleAutoHover(); // Second toggle
      const state2 = playerMovement.getHelicopterControls().autoHover;

      expect(state2).toBe(!state1);
    });
  });

  describe('getHelicopterControls', () => {
    it('should return a copy of controls', () => {
      const controls1 = playerMovement.getHelicopterControls();
      const controls2 = playerMovement.getHelicopterControls();

      // Should be different objects
      expect(controls1).not.toBe(controls2);

      // But with same values
      expect(controls1.collective).toBe(controls2.collective);
      expect(controls1.yaw).toBe(controls2.yaw);
    });

    it('should not allow external mutation of internal state', () => {
      const controls = playerMovement.getHelicopterControls();
      controls.collective = 999;

      const freshControls = playerMovement.getHelicopterControls();
      expect(freshControls.collective).not.toBe(999);
    });
  });

  describe('Edge cases', () => {
    beforeEach(() => {
      playerMovement.setChunkManager(mockChunkManager);
      playerMovement.setSandbagSystem(mockSandbagSystem);
    });

    it('should handle diagonal movement correctly', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) =>
        key === 'keyw' || key === 'keyd'
      );

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      // Should normalize diagonal movement
      expect(playerState.velocity.x).not.toBe(0);
      expect(playerState.velocity.z).not.toBe(0);
    });

    it('should handle sprint while jumping', () => {
      playerState.isGrounded = true;
      playerMovement.setRunning(true);
      playerMovement.handleJump();

      // Should maintain jump even while running
      expect(playerState.velocity.y).toBe(playerState.jumpForce);
      expect(playerState.isRunning).toBe(true);
    });

    it('should handle zero deltaTime gracefully', () => {
      const initialPos = playerState.position.clone();

      playerMovement.updateMovement(0, mockInput, mockCamera);

      // Position should not change with zero deltaTime
      expect(playerState.position.equals(initialPos)).toBe(true);
    });

    it('should preserve Y velocity during horizontal movement', () => {
      playerState.velocity.y = 5; // Upward velocity
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      // Y velocity should be affected by gravity, but not zeroed
      expect(playerState.velocity.y).toBeLessThan(5);
      expect(playerState.velocity.y).toBeGreaterThan(0);
    });
  });
});
