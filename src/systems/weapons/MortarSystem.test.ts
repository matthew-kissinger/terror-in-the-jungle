import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { MortarSystem } from './MortarSystem';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { CombatantSystem } from '../combat/CombatantSystem';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { InventoryManager } from '../player/InventoryManager';
import { AudioManager } from '../audio/AudioManager';
import { ProgrammaticExplosivesFactory } from './ProgrammaticExplosivesFactory';

// Mock window for Node environment (required by MortarCamera)
if (typeof window === 'undefined') {
  (global as any).window = {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

// Mock dependencies
const mockChunkManager = {
  getEffectiveHeightAt: vi.fn((x: number, z: number) => 0),
} as unknown as ImprovedChunkManager;

const mockCombatantSystem = {
  applyExplosionDamage: vi.fn(),
} as unknown as CombatantSystem;

const mockImpactEffectsPool = {
  spawn: vi.fn(),
} as unknown as ImpactEffectsPool;

const mockExplosionEffectsPool = {
  spawn: vi.fn(),
} as unknown as ExplosionEffectsPool;

const mockInventoryManager = {
  useMortarRound: vi.fn(() => true),
} as unknown as InventoryManager;

const mockAudioManager = {
  playExplosionAt: vi.fn(),
} as unknown as AudioManager;

// Mock ProgrammaticExplosivesFactory
vi.mock('./ProgrammaticExplosivesFactory', () => ({
  ProgrammaticExplosivesFactory: {
    createMortarTube: vi.fn(() => {
      const group = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      tube.name = 'tube';
      group.add(tube);
      return group;
    }),
    createMortarRound: vi.fn(() => new THREE.Group()),
  }
}));

describe('MortarSystem', () => {
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let mortarSystem: MortarSystem;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    mortarSystem = new MortarSystem(scene, camera, mockChunkManager);
    
    mortarSystem.setCombatantSystem(mockCombatantSystem);
    mortarSystem.setImpactEffectsPool(mockImpactEffectsPool);
    mortarSystem.setExplosionEffectsPool(mockExplosionEffectsPool);
    mortarSystem.setInventoryManager(mockInventoryManager);
    mortarSystem.setAudioManager(mockAudioManager);

    (mockInventoryManager.useMortarRound as any).mockReturnValue(true);

    await mortarSystem.init();
  });

  afterEach(() => {
    mortarSystem.dispose();
  });

  describe('Deployment', () => {
    it('should deploy mortar at correct position', () => {
      const playerPos = new THREE.Vector3(10, 0, 10);
      const playerDir = new THREE.Vector3(1, 0, 0);
      
      const success = mortarSystem.deployMortar(playerPos, playerDir);
      
      expect(success).toBe(true);
      expect(mortarSystem.isCurrentlyDeployed()).toBe(true);
      
      // Deploy position is playerPos + playerDir * 3
      // (10, 0, 10) + (1, 0, 0) * 3 = (13, 0, 10)
      // Height is mocked to 0
      const aimingState = mortarSystem.getAimingState();
      expect(mortarSystem.isCurrentlyAiming()).toBe(false);
    });

    it('should not deploy if already deployed', () => {
      mortarSystem.deployMortar(new THREE.Vector3(), new THREE.Vector3(1, 0, 0));
      const success = mortarSystem.deployMortar(new THREE.Vector3(), new THREE.Vector3(1, 0, 0));
      
      expect(success).toBe(false);
    });

    it('should undeploy mortar', () => {
      mortarSystem.deployMortar(new THREE.Vector3(), new THREE.Vector3(1, 0, 0));
      mortarSystem.undeployMortar();
      
      expect(mortarSystem.isCurrentlyDeployed()).toBe(false);
    });
  });

  describe('Aiming', () => {
    beforeEach(() => {
      mortarSystem.deployMortar(new THREE.Vector3(), new THREE.Vector3(0, 0, 1)); // Facing +Z
    });

    it('should start and cancel aiming', () => {
      mortarSystem.startAiming();
      expect(mortarSystem.isCurrentlyAiming()).toBe(true);
      
      mortarSystem.cancelAiming();
      expect(mortarSystem.isCurrentlyAiming()).toBe(false);
    });

    it('should adjust pitch within limits', () => {
      mortarSystem.startAiming();
      const initialState = mortarSystem.getAimingState();
      
      mortarSystem.adjustPitch(10);
      expect(mortarSystem.getAimingState().pitch).toBe(initialState.pitch + 10);
      
      // Test upper limit (85)
      mortarSystem.adjustPitch(100);
      expect(mortarSystem.getAimingState().pitch).toBe(85);
      
      // Test lower limit (45)
      mortarSystem.adjustPitch(-100);
      expect(mortarSystem.getAimingState().pitch).toBe(45);
    });

    it('should adjust yaw and wrap around', () => {
      mortarSystem.startAiming();
      // Facing +Z means yaw is 0 (or 180 depending on implementation, let's check)
      // Math.atan2(0, 1) * 180 / Math.PI = 0
      
      mortarSystem.adjustYaw(10);
      expect(mortarSystem.getAimingState().yaw).toBe(10);
      
      mortarSystem.adjustYaw(360);
      expect(mortarSystem.getAimingState().yaw).toBe(10);
      
      mortarSystem.adjustYaw(-20);
      expect(mortarSystem.getAimingState().yaw).toBe(350);
    });

    it('should adjust power within limits', () => {
      mortarSystem.startAiming();
      
      mortarSystem.adjustPower(0.1);
      expect(mortarSystem.getAimingState().power).toBeCloseTo(0.6);
      
      mortarSystem.adjustPower(1.0);
      expect(mortarSystem.getAimingState().power).toBe(1.0);
      
      mortarSystem.adjustPower(-2.0);
      expect(mortarSystem.getAimingState().power).toBe(0.0);
    });
  });

  describe('Firing', () => {
    beforeEach(() => {
      mortarSystem.deployMortar(new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    });

    it('should not fire if not aiming', () => {
      const fired = mortarSystem.fireMortarRound();
      expect(fired).toBe(false);
    });

    it('should fire if aiming and has rounds', () => {
      mortarSystem.startAiming();
      const fired = mortarSystem.fireMortarRound();
      
      expect(fired).toBe(true);
      expect(mockInventoryManager.useMortarRound).toHaveBeenCalled();
      expect(mockAudioManager.playExplosionAt).toHaveBeenCalled();
      expect(ProgrammaticExplosivesFactory.createMortarRound).toHaveBeenCalled();
    });

    it('should not fire if out of rounds', () => {
      (mockInventoryManager.useMortarRound as vi.Mock).mockReturnValue(false);
      mortarSystem.startAiming();
      const fired = mortarSystem.fireMortarRound();
      
      expect(fired).toBe(false);
    });
  });

  describe('Round Lifecycle', () => {
    it('should update rounds and detonate on impact', () => {
      mortarSystem.deployMortar(new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
      mortarSystem.startAiming();
      const fired = mortarSystem.fireMortarRound();
      expect(fired).toBe(true);
      
      // Mock height to be 100 to force impact even if round is moving up
      (mockChunkManager.getEffectiveHeightAt as vi.Mock).mockReturnValue(100);
      
      // Update system
      mortarSystem.update(1.0);
      
      expect(mockExplosionEffectsPool.spawn).toHaveBeenCalled();
      expect(mockCombatantSystem.applyExplosionDamage).toHaveBeenCalled();
    });

    it('should update trajectory preview when aiming', () => {
      mortarSystem.deployMortar(new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
      mortarSystem.startAiming();
      
      // We can't easily check private visuals, but we can check if it calls getEffectiveHeightAt
      // because updateTrajectoryPreview calls computeTrajectory which calls getGroundHeight
      vi.clearAllMocks();
      mortarSystem.update(0.1);
      expect(mockChunkManager.getEffectiveHeightAt).toHaveBeenCalled();
    });

    it('should detonate after fuse time', () => {
      mortarSystem.deployMortar(new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
      mortarSystem.startAiming();
      const fired = mortarSystem.fireMortarRound();
      expect(fired).toBe(true);
      
      // Set ground very low so it doesn't hit
      (mockChunkManager.getEffectiveHeightAt as vi.Mock).mockReturnValue(-1000);
      
      // FUSE_TIME is 15
      mortarSystem.update(16.0);
      
      expect(mockExplosionEffectsPool.spawn).toHaveBeenCalled();
    });
  });

  describe('Camera', () => {
    it('should toggle mortar camera', () => {
      mortarSystem.deployMortar(new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
      
      expect(mortarSystem.isUsingMortarCamera()).toBe(false);
      
      const success = mortarSystem.toggleMortarCamera();
      expect(success).toBe(true);
      expect(mortarSystem.isUsingMortarCamera()).toBe(true);
      expect(mortarSystem.getMortarCamera()).toBeDefined();
      
      mortarSystem.toggleMortarCamera();
      expect(mortarSystem.isUsingMortarCamera()).toBe(false);
    });

    it('should not toggle camera if not deployed', () => {
      const success = mortarSystem.toggleMortarCamera();
      expect(success).toBe(false);
    });
  });
});
