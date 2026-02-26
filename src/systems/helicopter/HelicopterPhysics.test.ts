import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { HelicopterPhysics } from './HelicopterPhysics';

describe('HelicopterPhysics', () => {
  let physics: HelicopterPhysics;
  const initialPos = new THREE.Vector3(100, 50, 100); // Start high enough to fall

  beforeEach(() => {
    physics = new HelicopterPhysics(initialPos);
  });

  describe('Initial State', () => {
    it('should initialize with correct position and zero velocity', () => {
      const state = physics.getState();
      expect(state.position.equals(initialPos)).toBe(true);
      expect(state.velocity.equals(new THREE.Vector3(0, 0, 0))).toBe(true);
      expect(state.engineRPM).toBe(0);
      expect(state.isGrounded).toBe(true); // Initially grounded at spawn height
    });

    it('should have default controls set correctly', () => {
      const controls = physics.getControls();
      expect(controls.collective).toBe(0);
      expect(controls.autoHover).toBe(true);
      expect(controls.engineBoost).toBe(false);
    });
  });

  describe('Lift and Gravity', () => {
    it('should apply gravity when airborne with zero collective', () => {
      // Move helicopter up so it's not grounded
      const airbornePos = new THREE.Vector3(100, 100, 100);
      physics = new HelicopterPhysics(airbornePos);
      
      // Update with a ground height far below
      physics.update(0.1, 0);
      
      const state = physics.getState();
      expect(state.velocity.y).toBeLessThan(0); // Should fall
    });

    it('should gain upward velocity with full collective', () => {
      physics.setControls({ collective: 1.0 });
      
      // Run a few updates to allow input smoothing and engine spool up
      for(let i = 0; i < 20; i++) {
        physics.update(0.016, 0);
      }
      
      const state = physics.getState();
      // Logic: Gravity is -9.81 * 1500 = -14,715
      // Max Lift is 30,000
      // Net force should be positive ~15,000 N
      expect(state.velocity.y).toBeGreaterThan(0);
    });

    it('should apply engine boost multiplier', () => {
      // Two instances to compare
      const physicsNormal = new HelicopterPhysics(initialPos);
      const physicsBoost = new HelicopterPhysics(initialPos);
      
      physicsNormal.setControls({ collective: 1.0, engineBoost: false });
      physicsBoost.setControls({ collective: 1.0, engineBoost: true });
      
      // Run updates
      for(let i = 0; i < 20; i++) {
        physicsNormal.update(0.016, 0);
        physicsBoost.update(0.016, 0);
      }
      
      expect(physicsBoost.getState().velocity.y).toBeGreaterThan(physicsNormal.getState().velocity.y);
    });
  });

  describe('Cyclic Controls', () => {
    it('should move forward when pitching forward', () => {
      // Note: In this model, pitch forward is positive or negative?
      // Code: _cyclicForce.set(-cyclicPitch * MAX, 0, ...)
      // Assuming pitch 1.0 means "nose down/forward"
      physics.setControls({ cyclicPitch: 1.0 });
      
      // Update to smooth input and apply force
      for(let i = 0; i < 20; i++) {
        physics.update(0.016, 0);
      }
      
      // Force is along -X
      expect(physics.getState().velocity.x).toBeLessThan(0);
    });

    it('should move right when rolling right', () => {
      // Code: _cyclicForce.set(..., -cyclicRoll * MAX)
      // Assuming roll 1.0 is right
      physics.setControls({ cyclicRoll: 1.0 });
      
      for(let i = 0; i < 20; i++) {
        physics.update(0.016, 0);
      }
      
      // Force is along -Z
      expect(physics.getState().velocity.z).toBeLessThan(0);
    });

    it('should respect helicopter orientation for cyclic forces', () => {
      // Rotate helicopter 90 degrees around Y (facing -X becomes facing -Z?)
      // Initial identity: Forward is -X. 
      // Rotate 90 deg Y: -X axis rotates to ... ?
      // Let's just set a specific quaternion
      const rotatedState = physics.getState();
      const q = new THREE.Quaternion();
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      rotatedState.quaternion.copy(q);
      
      physics.setControls({ cyclicPitch: 1.0 }); // "Forward" relative to heli
      
      for(let i = 0; i < 20; i++) {
        physics.update(0.016, 0);
      }
      
      // After 90-deg yaw, cyclic pitch should produce mostly Z velocity
      expect(Math.abs(physics.getState().velocity.x)).toBeLessThan(1.0);
      expect(Math.abs(physics.getState().velocity.z)).toBeGreaterThan(0.5);
    });
  });

  describe('Yaw Control', () => {
    it('should rotate when yaw is applied', () => {
      physics.setControls({ yaw: 1.0 });
      physics.update(0.1, 0);
      
      expect(physics.getState().angularVelocity.y).toBeGreaterThan(0);
    });

    it('should rotate opposite when negative yaw is applied', () => {
      physics.setControls({ yaw: -1.0 });
      physics.update(0.1, 0);
      
      expect(physics.getState().angularVelocity.y).toBeLessThan(0);
    });
  });

  describe('Ground Interaction', () => {
    it('should detect ground correctly', () => {
      const highPos = new THREE.Vector3(0, 100, 0);
      physics = new HelicopterPhysics(highPos);
      
      // Not grounded yet
      physics.update(0.016, 0); // Terrain at 0
      expect(physics.getState().isGrounded).toBe(false);
      
      // Force position near ground
      physics.getState().position.y = 0.5;
      physics.update(0.016, 0);
      expect(physics.getState().isGrounded).toBe(true);
    });

    it('should clamp position to minimum height above ground', () => {
      physics.getState().position.y = -10; // Underground
      physics.update(0.016, 0); // Terrain at 0
      
      // Should be clamped to groundHeight + 0.5
      expect(physics.getState().position.y).toBeGreaterThanOrEqual(0.5);
    });

    it('should bounce on hard landing', () => {
      physics = new HelicopterPhysics(new THREE.Vector3(0, 10, 0));
      physics.getState().velocity.y = -10; // Fast descent
      
      // Move to ground level
      physics.getState().position.y = 0.5;
      physics.update(0.016, 0);
      
      // Should bounce (positive velocity)
      expect(physics.getState().velocity.y).toBeGreaterThan(0);
    });
  });

  describe('Auto-Stabilization', () => {
    it('should correct roll when auto-hover is enabled', () => {
      physics.setControls({ autoHover: true });
      
      // Tilt the helicopter
      const q = new THREE.Quaternion();
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5); // Roll
      physics.getState().quaternion.copy(q);
      
      physics.update(0.1, 0);
      
      // Should generate angular velocity to oppose the tilt
      // Roll is +Z rotation. Correction should be negative Z angular velocity.
      // Wait, code: `rollCorrection = -_euler.z * strength`. 
      // `angularVelocity.z += rollCorrection`.
      // If Euler.z is positive, correction is negative.
      expect(physics.getState().angularVelocity.z).toBeLessThan(0);
    });

    it('should not stabilize if auto-hover is disabled', () => {
      physics.setControls({ autoHover: false });
      
      // Tilt the helicopter
      const q = new THREE.Quaternion();
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5);
      physics.getState().quaternion.copy(q);
      
      physics.update(0.1, 0);
      
      // Should have minimal/no angular velocity correction (only damping might affect it if it had velocity)
      // Since initial angular velocity is 0, and no correction, it should remain 0
      expect(physics.getState().angularVelocity.z).toBe(0);
    });
  });

  describe('Helipad Interaction', () => {
    it('should use helipad height if provided and higher than terrain', () => {
      const terrainHeight = 10;
      const helipadHeight = 20;
      
      physics.getState().position.y = 25;
      physics.update(0.016, terrainHeight, helipadHeight);
      
      expect(physics.getState().groundHeight).toBe(helipadHeight);
    });

    it('should ignore helipad height if lower than terrain', () => {
      const terrainHeight = 20;
      const helipadHeight = 10;
      
      physics.getState().position.y = 25;
      physics.update(0.016, terrainHeight, helipadHeight);
      
      expect(physics.getState().groundHeight).toBe(terrainHeight);
    });
  });

  describe('Engine Audio Params', () => {
    it('should return RPM and load', () => {
      const params = physics.getEngineAudioParams();
      expect(params).toHaveProperty('rpm');
      expect(params).toHaveProperty('load');
    });

    it('should increase load with collective', () => {
      physics.setControls({ collective: 0 });
      physics.update(0.1, 0);
      const loadIdle = physics.getEngineAudioParams().load;
      
      physics.setControls({ collective: 1 });
      physics.update(0.1, 0);
      const loadActive = physics.getEngineAudioParams().load;
      
      expect(loadActive).toBeGreaterThan(loadIdle);
    });
  });

  describe('Reset', () => {
    it('should reset to stable state', () => {
      physics.getState().velocity.set(10, 10, 10);
      physics.setControls({ collective: 1 });
      
      const resetPos = new THREE.Vector3(50, 50, 50);
      physics.resetToStable(resetPos);
      
      const state = physics.getState();
      expect(state.position.equals(resetPos)).toBe(true);
      expect(state.velocity.length()).toBe(0);
      expect(physics.getControls().collective).toBe(0);
    });
  });
});
