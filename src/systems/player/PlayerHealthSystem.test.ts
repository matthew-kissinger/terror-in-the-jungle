import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { PlayerHealthSystem } from './PlayerHealthSystem';
import { PlayerRespawnManager } from './PlayerRespawnManager';
import { PlayerHealthUI } from './PlayerHealthUI';
import { PlayerHealthEffects } from './PlayerHealthEffects';
import { Logger } from '../../utils/Logger';

// Mock dependencies
vi.mock('./PlayerHealthUI');
vi.mock('./PlayerHealthEffects');
vi.mock('./PlayerRespawnManager');
vi.mock('../../utils/Logger');

describe('PlayerHealthSystem', () => {
  let system: PlayerHealthSystem;
  let mockRespawnManager: any;
  let mockUI: any;
  let mockEffects: any;
  let mockPlayerController: any;
  let mockHUD: any;
  let mockTicketSystem: any;
  let mockCamera: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    // Reset mocks
    vi.clearAllMocks();

    // Setup mock instances
    mockUI = {
      init: vi.fn(),
      updateHealthDisplay: vi.fn(),
      setLowHealthEffect: vi.fn(),
      setSpawnProtection: vi.fn(),
      dispose: vi.fn()
    };
    (PlayerHealthUI as any).mockImplementation(function() { return mockUI; });

    mockEffects = {
      init: vi.fn(),
      updateDamageIndicators: vi.fn(),
      addDamageIndicator: vi.fn(),
      renderDamageOverlay: vi.fn(),
      startHeartbeat: vi.fn(),
      stopHeartbeat: vi.fn(),
      clearDamageIndicators: vi.fn(),
      dispose: vi.fn()
    };
    (PlayerHealthEffects as any).mockImplementation(function() { return mockEffects; });

    mockRespawnManager = {
      setRespawnCallback: vi.fn(),
      setZoneManager: vi.fn(),
      setPlayerController: vi.fn(),
      setFirstPersonWeapon: vi.fn(),
      onPlayerDeath: vi.fn()
    };

    mockPlayerController = {
      applyDamageShake: vi.fn()
    };

    mockHUD = {
      addDeath: vi.fn()
    };

    mockTicketSystem = {
      removeTickets: vi.fn()
    };

    mockCamera = new THREE.PerspectiveCamera();
    mockCamera.getWorldDirection = vi.fn((vec: THREE.Vector3) => vec.set(0, 0, -1));

    // Initialize system
    system = new PlayerHealthSystem();
    
    // Inject mocks via setters or by simulating initialization flow
    // Note: respawnManager is null initially in the real class until setRespawnManager is called
    system.setRespawnManager(mockRespawnManager);
    system.setPlayerController(mockPlayerController);
    system.setHUDSystem(mockHUD);
    system.setTicketSystem(mockTicketSystem);
    system.setCamera(mockCamera);

    await system.init();
  });

  afterEach(() => {
    system.dispose();
    vi.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with default values', () => {
      expect(system.getHealth()).toBe(150);
      expect(system.getMaxHealth()).toBe(150);
      expect(system.isAlive()).toBe(true);
      expect(system.isDead()).toBe(false);
      expect(system.hasSpawnProtection()).toBe(false);
    });

    it('should initialize UI and effects', () => {
      expect(mockUI.init).toHaveBeenCalled();
      expect(mockEffects.init).toHaveBeenCalled();
      expect(mockUI.updateHealthDisplay).toHaveBeenCalledWith(150, 150);
    });

    it('should setup callbacks with respawn manager', () => {
      expect(mockRespawnManager.setRespawnCallback).toHaveBeenCalled();
    });
  });

  describe('Damage Handling', () => {
    it('should reduce health when taking damage', () => {
      const damage = 50;
      const result = system.takeDamage(damage);

      expect(result).toBe(false); // Not dead yet
      expect(system.getHealth()).toBe(100);
      expect(mockUI.updateHealthDisplay).toHaveBeenCalledWith(100, 150);
      expect(mockEffects.addDamageIndicator).toHaveBeenCalled();
      expect(mockPlayerController.applyDamageShake).toHaveBeenCalledWith(damage);
    });

    it('should prevent damage when dead', () => {
      // First kill the player
      system.takeDamage(150);
      expect(system.isDead()).toBe(true);

      // Try to damage again
      const result = system.takeDamage(50);
      expect(result).toBe(false);
      expect(system.getHealth()).toBe(0);
      expect(mockPlayerController.applyDamageShake).toHaveBeenCalledTimes(1); // Only from the killing blow
    });

    it('should prevent damage when invulnerable', () => {
      system.applySpawnProtection(5.0);
      expect(system.hasSpawnProtection()).toBe(true);

      const result = system.takeDamage(50);
      expect(result).toBe(false);
      expect(system.getHealth()).toBe(150); // No damage taken
    });

    it('should trigger death when health reaches 0', () => {
      const result = system.takeDamage(150);

      expect(result).toBe(true); // Dead
      expect(system.isDead()).toBe(true);
      expect(system.isAlive()).toBe(false);
      expect(system.getHealth()).toBe(0);
      expect(mockRespawnManager.onPlayerDeath).toHaveBeenCalled();
      expect(mockHUD.addDeath).toHaveBeenCalled();
      expect(mockEffects.stopHeartbeat).toHaveBeenCalled();
    });

    it('should clamp health at 0', () => {
      system.takeDamage(200);
      expect(system.getHealth()).toBe(0);
    });

    it('should trigger low health effects when health is low', () => {
      system.takeDamage(130); // Health drops to 20
      system.update(0.1); // Trigger update to process low health check

      expect(mockUI.setLowHealthEffect).toHaveBeenCalledWith(true);
      expect(mockEffects.startHeartbeat).toHaveBeenCalled();
    });
  });

  describe('Health Regeneration', () => {
    it('should regenerate health after delay', () => {
      system.takeDamage(50); // Health = 100
      expect(system.getHealth()).toBe(100);

      // Advance time less than delay (5s)
      vi.setSystemTime(Date.now() + 4000);
      system.update(1.0);
      expect(system.getHealth()).toBe(100); // No regen yet

      // Advance time past delay
      vi.setSystemTime(Date.now() + 2000); // Total 6s
      system.update(1.0); // 1s delta
      
      // Regen rate is 20/s
      // We manually update health in the system, so we expect 100 + 20 = 120
      expect(system.getHealth()).toBe(120);
      expect(mockUI.updateHealthDisplay).toHaveBeenCalledWith(120, 150);
    });

    it('should not regenerate past max health', () => {
      system.takeDamage(10); // Health = 140
      vi.setSystemTime(Date.now() + 6000); // Past delay

      system.update(1.0); // Should add 20, but cap at 150
      expect(system.getHealth()).toBe(150);
    });
  });

  describe('Invulnerability', () => {
    it('should reduce invulnerability time on update', () => {
      system.applySpawnProtection(2.0);
      
      system.update(1.0);
      expect(system.hasSpawnProtection()).toBe(true);

      system.update(1.1);
      expect(system.hasSpawnProtection()).toBe(false);
      expect(mockUI.setSpawnProtection).toHaveBeenCalledWith(false);
    });
  });

  describe('Death and Respawn', () => {
    it('should handle voluntary respawn', () => {
      system.voluntaryRespawn();

      expect(system.isDead()).toBe(true);
      expect(system.getHealth()).toBe(0);
      expect(mockRespawnManager.onPlayerDeath).toHaveBeenCalled();
      expect(mockTicketSystem.removeTickets).toHaveBeenCalledWith(expect.anything(), 1);
    });

    it('should not trigger voluntary respawn if already dead', () => {
      system.takeDamage(150); // Die normally
      vi.clearAllMocks();

      system.voluntaryRespawn();
      expect(mockRespawnManager.onPlayerDeath).not.toHaveBeenCalled();
    });

    it('should reset state on respawn callback', () => {
      // Die first
      system.takeDamage(150);
      
      // Get the callback registered with RespawnManager
      const respawnCallback = mockRespawnManager.setRespawnCallback.mock.calls[0][0];
      
      // Trigger respawn
      respawnCallback(new THREE.Vector3(0, 0, 0));

      expect(system.getHealth()).toBe(150);
      expect(system.isAlive()).toBe(true);
      expect(system.isDead()).toBe(false);
      expect(system.hasSpawnProtection()).toBe(false); // As per code, it resets to 0
      expect(mockEffects.clearDamageIndicators).toHaveBeenCalled();
      expect(mockUI.updateHealthDisplay).toHaveBeenCalled();
    });
  });

  describe('System Connections', () => {
    it('should pass zone manager to respawn manager', () => {
      const mockZoneManager = {} as any;
      system.setZoneManager(mockZoneManager);
      expect(mockRespawnManager.setZoneManager).toHaveBeenCalledWith(mockZoneManager);
    });

    it('should pass player controller to respawn manager', () => {
      const mockPC = {} as any;
      system.setPlayerController(mockPC);
      expect(mockRespawnManager.setPlayerController).toHaveBeenCalledWith(mockPC);
    });

    it('should pass weapon to respawn manager', () => {
      const mockWeapon = {} as any;
      system.setFirstPersonWeapon(mockWeapon);
      expect(mockRespawnManager.setFirstPersonWeapon).toHaveBeenCalledWith(mockWeapon);
    });
  });
});
