import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FixedWingPhysics } from './FixedWingPhysics';
import { FIXED_WING_CONFIGS } from './FixedWingConfigs';

const skyraiderCfg = FIXED_WING_CONFIGS.A1_SKYRAIDER.physics;
const phantomCfg = FIXED_WING_CONFIGS.F4_PHANTOM.physics;

function createPhysics(config = skyraiderCfg, altitude = 500) {
  return new FixedWingPhysics(new THREE.Vector3(0, altitude, 0), config);
}

describe('FixedWingPhysics', () => {
  describe('lift vs airspeed', () => {
    it('generates more lift at higher airspeeds', () => {
      const fw = createPhysics();
      // Accelerate to get airspeed
      fw.setControls({ throttle: 1.0 });
      for (let i = 0; i < 60; i++) fw.update(1 / 60, 0);
      const speed1 = fw.getAirspeed();
      const alt1 = fw.getAltitude();

      const fw2 = createPhysics();
      fw2.setControls({ throttle: 0.3 });
      for (let i = 0; i < 60; i++) fw2.update(1 / 60, 0);
      const speed2 = fw2.getAirspeed();
      const alt2 = fw2.getAltitude();

      // Higher throttle = higher speed
      expect(speed1).toBeGreaterThan(speed2);
      // More lift at higher speed = higher altitude maintained
      expect(alt1).toBeGreaterThan(alt2);
    });
  });

  describe('stall detection', () => {
    it('detects stall when the pilot over-rotates after takeoff', () => {
      const fw = new FixedWingPhysics(new THREE.Vector3(0, 0, 0), skyraiderCfg);
      for (let i = 0; i < 900; i++) {
        fw.setControls({
          throttle: 1.0,
          pitch: i > 180 ? 0.7 : 0,
          roll: 0,
          yaw: 0,
        });
        fw.update(1 / 60, 0);
      }

      expect(fw.getAltitude()).toBeGreaterThan(1.0);
      expect(fw.getAirspeed()).toBeLessThan(skyraiderCfg.stallSpeed);
      expect(fw.isStalled()).toBe(true);
    });

    it('is not stalled at cruise speed', () => {
      // Use Phantom at high altitude with enough time to build speed past stall
      const fw = createPhysics(phantomCfg, 2000);
      fw.setControls({ throttle: 1.0 });
      // Build up speed - needs time to accelerate past stall speed of 60 m/s
      for (let i = 0; i < 600; i++) fw.update(1 / 60, 0);
      expect(fw.getAirspeed()).toBeGreaterThan(phantomCfg.stallSpeed);
      expect(fw.isStalled()).toBe(false);
      expect(fw.getFlightState()).toBe('airborne');
    });
  });

  describe('bank-to-turn', () => {
    it('changes heading when banked', () => {
      // Use Phantom at high altitude with enough time to reach cruise speed
      const fw = createPhysics(phantomCfg, 2000);
      fw.setControls({ throttle: 1.0 });
      // Build speed past stall
      for (let i = 0; i < 600; i++) fw.update(1 / 60, 0);
      expect(fw.getFlightState()).toBe('airborne');
      const headingBefore = fw.getHeading();

      // Apply roll and continue flying
      fw.setControls({ throttle: 1.0, roll: 0.5 });
      for (let i = 0; i < 180; i++) fw.update(1 / 60, 0);
      const headingAfter = fw.getHeading();

      // Heading should have changed
      expect(headingAfter).not.toBeCloseTo(headingBefore, 0);
    });
  });

  describe('ground roll', () => {
    it('starts grounded', () => {
      const fw = new FixedWingPhysics(new THREE.Vector3(0, 0, 0), skyraiderCfg);
      expect(fw.getFlightState()).toBe('grounded');
    });

    it('stays on ground without enough speed for takeoff', () => {
      const fw = new FixedWingPhysics(new THREE.Vector3(0, 0, 0), skyraiderCfg);
      fw.setControls({ throttle: 0.2 });
      for (let i = 0; i < 60; i++) fw.update(1 / 60, 0);
      expect(fw.getAltitude()).toBeCloseTo(0.5, 0); // Just above ground clearance
    });

    it('takes off with a sensible rotation input', () => {
      const fw = new FixedWingPhysics(new THREE.Vector3(0, 0, 0), skyraiderCfg);
      for (let i = 0; i < 900; i++) {
        fw.setControls({
          throttle: 1.0,
          pitch: i > 180 ? 0.25 : 0,
          roll: 0,
          yaw: 0,
        });
        fw.update(1 / 60, 0);
      }

      expect(fw.getAltitude()).toBeGreaterThan(1.0);
      expect(fw.getFlightState()).not.toBe('grounded');
    });
  });

  describe('throttle response', () => {
    it('accelerates with full throttle', () => {
      const fw = createPhysics();
      const speedBefore = fw.getAirspeed();
      fw.setControls({ throttle: 1.0 });
      for (let i = 0; i < 60; i++) fw.update(1 / 60, 0);
      expect(fw.getAirspeed()).toBeGreaterThan(speedBefore);
    });

    it('respects max speed', () => {
      const fw = createPhysics();
      fw.setControls({ throttle: 1.0 });
      // Run for a long time
      for (let i = 0; i < 600; i++) fw.update(1 / 60, 0);
      expect(fw.getAirspeed()).toBeLessThanOrEqual(skyraiderCfg.maxSpeed + 1);
    });
  });

  describe('getters', () => {
    it('returns heading in 0-360 range', () => {
      const fw = createPhysics();
      const heading = fw.getHeading();
      expect(heading).toBeGreaterThanOrEqual(0);
      expect(heading).toBeLessThan(360);
    });

    it('returns vertical speed', () => {
      const fw = createPhysics();
      fw.setControls({ throttle: 0 });
      fw.update(1 / 60, 0);
      // Should be falling with no thrust
      expect(fw.getVerticalSpeed()).toBeLessThan(0);
    });
  });

  describe('resetToGround', () => {
    it('resets position and velocity', () => {
      const fw = createPhysics();
      fw.setControls({ throttle: 1.0 });
      for (let i = 0; i < 60; i++) fw.update(1 / 60, 0);

      const newPos = new THREE.Vector3(100, 50, 200);
      fw.resetToGround(newPos);
      expect(fw.getPosition().x).toBe(100);
      expect(fw.getAirspeed()).toBe(0);
      expect(fw.getFlightState()).toBe('grounded');
    });
  });

  describe('per-aircraft configs', () => {
    it('Phantom has higher stall speed than Skyraider', () => {
      expect(phantomCfg.stallSpeed).toBeGreaterThan(skyraiderCfg.stallSpeed);
    });

    it('Phantom has higher max speed than Skyraider', () => {
      expect(phantomCfg.maxSpeed).toBeGreaterThan(skyraiderCfg.maxSpeed);
    });
  });

  describe('world boundary', () => {
    it('enforces world boundary', () => {
      const fw = createPhysics();
      fw.setWorldHalfExtent(500);
      fw.setControls({ throttle: 1.0 });
      for (let i = 0; i < 6000; i++) fw.update(1 / 60, 0);
      const pos = fw.getPosition();
      expect(Math.abs(pos.x)).toBeLessThanOrEqual(500);
      expect(Math.abs(pos.z)).toBeLessThanOrEqual(500);
    });
  });
});
