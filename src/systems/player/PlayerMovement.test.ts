import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlayerMovement, PLAYER_EYE_HEIGHT } from './PlayerMovement';
import { PlayerState } from '../../types';
import * as THREE from 'three';
import { PlayerInput } from './PlayerInput';
import { TerrainSystem } from '../terrain/TerrainSystem';
import { SandbagSystem } from '../weapons/SandbagSystem';
import { FootstepAudioSystem } from '../audio/FootstepAudioSystem';

// Mock dependencies
vi.mock('./PlayerInput');
vi.mock('../terrain/TerrainSystem');
vi.mock('../weapons/SandbagSystem');
vi.mock('../audio/FootstepAudioSystem');
vi.mock('../../utils/Logger');
vi.mock('../terrain/HeightQueryCache', () => {
  const flatNormal = { x: 0, y: 1, z: 0 };
  const mockCache = {
    getNormalAt: vi.fn().mockReturnValue(flatNormal),
    getSlopeAt: vi.fn().mockReturnValue(0),
    getHeightAt: vi.fn().mockReturnValue(0),
  };
  return {
    getHeightQueryCache: vi.fn().mockReturnValue(mockCache),
    HeightQueryCache: vi.fn(),
  };
});

describe('PlayerMovement', () => {
  let playerMovement: PlayerMovement;
  let playerState: PlayerState;
  let mockInput: PlayerInput;
  let mockCamera: THREE.Camera;
  let mockTerrainSystem: TerrainSystem;
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
      isCrouching: false,
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
      getTouchControls: vi.fn().mockReturnValue(null),
      dispose: vi.fn()
    } as any;

    // Setup mock terrain system
    mockTerrainSystem = {
      getHeightAt: vi.fn().mockReturnValue(0),
      getEffectiveHeightAt: vi.fn().mockReturnValue(0),
      getPlayableWorldSize: vi.fn().mockReturnValue(0),
      getWorldSize: vi.fn().mockReturnValue(0)
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

  });

  // Vehicle control tests moved to HelicopterPlayerAdapter.test.ts and FixedWingPlayerAdapter.test.ts

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
      playerMovement.setTerrainSystem(mockTerrainSystem);
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
      playerMovement.setTerrainSystem(mockTerrainSystem);
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
      vi.mocked(mockTerrainSystem.getEffectiveHeightAt).mockReturnValue(0);

      playerMovement.updateMovement(0.5, mockInput, mockCamera); // Large deltaTime to ensure landing

      // Grounded Y = terrain height (0) + PLAYER_EYE_HEIGHT.
      expect(playerState.position.y).toBe(PLAYER_EYE_HEIGHT);
      expect(playerState.velocity.y).toBe(0);
      expect(playerState.isGrounded).toBe(true);
      expect(playerState.isJumping).toBe(false);
    });

    it('should set isGrounded to false when in air', () => {
      playerState.position.y = 10;
      playerState.isGrounded = true;
      vi.mocked(mockTerrainSystem.getEffectiveHeightAt).mockReturnValue(0);

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(playerState.isGrounded).toBe(false);
    });

    it('should query terrain height from chunk manager', () => {
      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      expect(mockTerrainSystem.getEffectiveHeightAt).toHaveBeenCalled();
    });

    it('should use default height when no chunk manager', () => {
      const movementWithoutChunk = new PlayerMovement(playerState);
      movementWithoutChunk.setSandbagSystem(mockSandbagSystem);
      playerState.position.y = 0;

      movementWithoutChunk.updateMovement(0.016, mockInput, mockCamera);

      // Flat-world fallback clamps to PLAYER_EYE_HEIGHT.
      expect(playerState.position.y).toBe(PLAYER_EYE_HEIGHT);
    });

    it('should allow climbing a walkable uphill slope without false step blocking', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyd');
      vi.mocked(mockTerrainSystem.getHeightAt).mockImplementation((x: number) => Math.max(0, x));
      vi.mocked(mockTerrainSystem.getEffectiveHeightAt).mockImplementation((x: number) => Math.max(0, x));

      playerMovement.updateMovement(0.2, mockInput, mockCamera);

      expect(playerState.position.x).toBeGreaterThan(0.5);
      expect(playerState.position.y).toBeGreaterThan(2.5);
    });

    it('redirects steep uphill input into contour flow instead of stalling', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyd');
      vi.mocked(mockTerrainSystem.getHeightAt).mockImplementation((x: number) => Math.max(0, x * 2));
      vi.mocked(mockTerrainSystem.getEffectiveHeightAt).mockImplementation((x: number) => Math.max(0, x * 2));
      playerState.position.set(1, 4, 0);

      playerMovement.updateMovement(0.2, mockInput, mockCamera);

      expect(playerState.position.distanceToSquared(new THREE.Vector3(1, 4, 0))).toBeGreaterThan(0.05);
      expect(Math.hypot(playerState.velocity.x, playerState.velocity.z)).toBeGreaterThan(0.5);
    });

    it('keeps uphill movement responsive on a walkable support plane', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyd');
      vi.mocked(mockTerrainSystem.getHeightAt).mockImplementation((x: number) => Math.max(0, x));
      vi.mocked(mockTerrainSystem.getEffectiveHeightAt).mockImplementation((x: number) => Math.max(0, x));

      playerMovement.updateMovement(0.016, mockInput, mockCamera);
      const flatEquivalentSpeed = playerState.speed * 0.25;

      expect(playerState.velocity.x).toBeGreaterThan(flatEquivalentSpeed);
    });
  });

  describe('updateMovement - collision detection', () => {
    beforeEach(() => {
      playerMovement.setTerrainSystem(mockTerrainSystem);
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
      const _initialPos = playerState.position.clone();

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      // Velocity should be zeroed due to collision
      expect(playerState.velocity.x).toBe(0);
      expect(playerState.velocity.z).toBe(0);
    });

    it('should allow sliding along sandbag in X direction', () => {
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');
      const _initialPos = playerState.position.clone();

      // Mock collision: block new position, allow slideX, block slideZ
      let callCount = 0;
      vi.mocked(mockSandbagSystem.checkCollision).mockImplementation((_pos: THREE.Vector3) => {
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

  describe('updateMovement - world boundary', () => {
    beforeEach(() => {
      playerMovement.setTerrainSystem(mockTerrainSystem);
      playerMovement.setSandbagSystem(mockSandbagSystem);
      vi.mocked(mockTerrainSystem.getPlayableWorldSize).mockReturnValue(500);
      vi.mocked(mockTerrainSystem.getEffectiveHeightAt).mockReturnValue(0);
    });

    it('clamps the player to the playable world boundary and bounces inward', () => {
      playerState.position.set(249, 2, 0);
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyd');

      for (let i = 0; i < 20; i++) {
        playerMovement.updateMovement(0.016, mockInput, mockCamera);
      }

      expect(playerState.position.x).toBeLessThanOrEqual(250);
      expect(playerState.velocity.x).toBeLessThanOrEqual(0);
    });
  });

  describe('updateMovement - landing sound', () => {
    beforeEach(() => {
      playerMovement.setTerrainSystem(mockTerrainSystem);
      playerMovement.setSandbagSystem(mockSandbagSystem);
      playerMovement.setFootstepAudioSystem(mockFootstepAudio);
    });

    it('should play landing sound when landing with sufficient velocity', () => {
      playerState.position.y = 20;
      playerState.velocity.y = -10; // Above threshold
      playerState.isGrounded = false;
      vi.mocked(mockTerrainSystem.getEffectiveHeightAt).mockReturnValue(0);

      playerMovement.updateMovement(1.0, mockInput, mockCamera);

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
      vi.mocked(mockTerrainSystem.getEffectiveHeightAt).mockReturnValue(0);

      playerMovement.updateMovement(0.016, mockInput, mockCamera); // Small deltaTime

      expect(mockFootstepAudio.playLandingSound).not.toHaveBeenCalled();
    });
  });

  describe('updateMovement - footstep audio', () => {
    beforeEach(() => {
      playerMovement.setTerrainSystem(mockTerrainSystem);
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

  describe('Edge cases', () => {
    beforeEach(() => {
      playerMovement.setTerrainSystem(mockTerrainSystem);
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
      // Start airborne (well above ground-plus-eye-height) so we can observe
      // the mid-air Y velocity without landing in the same tick.
      playerState.position.y = 10;
      playerState.isGrounded = false;
      playerState.velocity.y = 5; // Upward velocity
      vi.mocked(mockInput.isKeyPressed).mockImplementation((key: string) => key === 'keyw');

      playerMovement.updateMovement(0.016, mockInput, mockCamera);

      // Y velocity should be affected by gravity, but not zeroed
      expect(playerState.velocity.y).toBeLessThan(5);
      expect(playerState.velocity.y).toBeGreaterThan(0);
    });
  });
});
