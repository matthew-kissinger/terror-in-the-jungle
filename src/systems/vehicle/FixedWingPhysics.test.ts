import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FixedWingPhysics } from './FixedWingPhysics';
import { FIXED_WING_CONFIGS } from './FixedWingConfigs';

const skyraiderCfg = FIXED_WING_CONFIGS.A1_SKYRAIDER.physics;
const phantomCfg = FIXED_WING_CONFIGS.F4_PHANTOM.physics;

function flatTerrain() {
  return { height: 0, normal: new THREE.Vector3(0, 1, 0) };
}

function createRunwayPhysics(config = skyraiderCfg) {
  return new FixedWingPhysics(new THREE.Vector3(0, 0, 0), config);
}

function createAirbornePhysics(config = skyraiderCfg, altitude = 1200, forwardSpeed = config.v2Speed + 12) {
  const fw = new FixedWingPhysics(new THREE.Vector3(0, altitude, 0), config);
  fw.getVelocity().set(0, 0, -forwardSpeed);
  return fw;
}

describe('FixedWingPhysics', () => {
  describe('ground handling', () => {
    it('stays on the runway at full throttle until the pilot rotates', () => {
      const fw = createRunwayPhysics();
      for (let i = 0; i < 900; i++) {
        fw.setCommand({ throttleTarget: 1, pitchCommand: 0, rollCommand: 0, yawCommand: 0, brake: 0 });
        fw.update(1 / 60, flatTerrain());
      }

      const snapshot = fw.getFlightSnapshot();
      expect(snapshot.phase).toBe('ground_roll');
      expect(snapshot.altitudeAGL).toBeCloseTo(0, 4);
      expect(snapshot.weightOnWheels).toBe(true);
    });

    it('takes off after a sensible rotation input above Vr', () => {
      const fw = createRunwayPhysics();
      for (let i = 0; i < 900; i++) {
        fw.setCommand({
          throttleTarget: 1,
          pitchCommand: i > 180 ? 0.25 : 0,
          rollCommand: 0,
          yawCommand: 0,
          brake: 0,
        });
        fw.update(1 / 60, flatTerrain());
      }

      const snapshot = fw.getFlightSnapshot();
      expect(snapshot.altitudeAGL).toBeGreaterThan(1.0);
      expect(snapshot.weightOnWheels).toBe(false);
      expect(fw.getFlightState()).not.toBe('grounded');
    });

    it('climbs away cleanly when the pilot relaxes after rotation with stability assist', () => {
      const fw = createRunwayPhysics();
      for (let i = 0; i < 1200; i++) {
        const snapshot = fw.getFlightSnapshot();
        const pitchCommand = i > 180 && snapshot.altitudeAGL < 2 ? 0.28 : 0;
        fw.setCommand({
          throttleTarget: 1,
          pitchCommand,
          rollCommand: 0,
          yawCommand: 0,
          brake: 0,
          stabilityAssist: true,
        });
        fw.update(1 / 60, flatTerrain());
      }

      const snapshot = fw.getFlightSnapshot();
      expect(snapshot.phase).toBe('airborne');
      expect(snapshot.altitudeAGL).toBeGreaterThan(10);
      expect(snapshot.aoaDeg).toBeLessThan(10);
      expect(snapshot.isStalled).toBe(false);
    });
  });

  describe('stall behavior', () => {
    it('alpha protection prevents stall during aggressive rotation', () => {
      const fw = createRunwayPhysics();
      for (let i = 0; i < 960; i++) {
        fw.setCommand({
          throttleTarget: 1,
          pitchCommand: i > 180 ? 0.75 : 0,
          rollCommand: 0,
          yawCommand: 0,
          brake: 0,
        });
        fw.update(1 / 60, flatTerrain());
      }

      const snapshot = fw.getFlightSnapshot();
      expect(snapshot.altitudeAGL).toBeGreaterThan(1.0);
      expect(snapshot.phase).not.toBe('stall');
      expect(snapshot.isStalled).toBe(false);
      expect(snapshot.aoaDeg).toBeLessThan(skyraiderCfg.alphaStallDeg);
    });

    it('takes off cleanly with full pitch input', () => {
      const fw = createRunwayPhysics();
      for (let i = 0; i < 900; i++) {
        fw.setCommand({
          throttleTarget: 1,
          pitchCommand: i > 180 ? 1.0 : 0,
          rollCommand: 0,
          yawCommand: 0,
          brake: 0,
        });
        fw.update(1 / 60, flatTerrain());
      }

      const snapshot = fw.getFlightSnapshot();
      expect(snapshot.altitudeAGL).toBeGreaterThan(1.0);
      expect(snapshot.weightOnWheels).toBe(false);
      expect(snapshot.isStalled).toBe(false);
    });

    it('stalls from speed loss', () => {
      const fw = createAirbornePhysics(skyraiderCfg, 2000, skyraiderCfg.stallSpeed);
      let stalledAtAnyPoint = false;
      for (let i = 0; i < 900; i++) {
        fw.setCommand({ throttleTarget: 0, pitchCommand: 0.6, stabilityAssist: false });
        fw.update(1 / 60, flatTerrain());
        const s = fw.getFlightSnapshot();
        if (s.isStalled) stalledAtAnyPoint = true;
      }

      expect(stalledAtAnyPoint).toBe(true);
    });

    it('reports descending vertical speed when an airborne aircraft has insufficient lift', () => {
      const fw = createAirbornePhysics(skyraiderCfg, 600, skyraiderCfg.stallSpeed * 0.7);
      fw.setCommand({ throttleTarget: 0 });
      for (let i = 0; i < 120; i++) {
        fw.update(1 / 60, flatTerrain());
      }

      expect(fw.getVerticalSpeed()).toBeLessThan(0);
    });
  });

  describe('airborne handling', () => {
    it('stays airborne at cruise speed', () => {
      const fw = createAirbornePhysics(phantomCfg, 2000, phantomCfg.v2Speed + 20);
      fw.setCommand({ throttleTarget: 0.85, stabilityAssist: true });
      for (let i = 0; i < 240; i++) {
        fw.update(1 / 60, flatTerrain());
      }

      expect(fw.getFlightState()).toBe('airborne');
      expect(fw.isStalled()).toBe(false);
      expect(fw.getFlightSnapshot().altitudeAGL).toBeGreaterThan(1000);
    });

    it('changes heading when banked in flight', () => {
      const fw = createAirbornePhysics(phantomCfg, 2200, phantomCfg.v2Speed + 35);
      fw.setCommand({ throttleTarget: 0.9, stabilityAssist: true });
      for (let i = 0; i < 120; i++) {
        fw.update(1 / 60, flatTerrain());
      }
      const headingBefore = fw.getHeading();

      fw.setCommand({
        throttleTarget: 0.9,
        rollCommand: 0.45,
        pitchCommand: 0.05,
        stabilityAssist: true,
      });
      for (let i = 0; i < 180; i++) {
        fw.update(1 / 60, flatTerrain());
      }

      const headingAfter = fw.getHeading();
      expect(headingAfter).not.toBeCloseTo(headingBefore, 0);
    });
  });

  describe('throttle response', () => {
    it('accelerates with full throttle', () => {
      const fw = createAirbornePhysics(skyraiderCfg, 1200, skyraiderCfg.stallSpeed + 5);
      const speedBefore = fw.getAirspeed();
      fw.setCommand({ throttleTarget: 1, stabilityAssist: true });
      for (let i = 0; i < 120; i++) {
        fw.update(1 / 60, flatTerrain());
      }
      expect(fw.getAirspeed()).toBeGreaterThan(speedBefore);
    });

    it('respects max speed', () => {
      const fw = createAirbornePhysics(phantomCfg, 3000, phantomCfg.v2Speed + 25);
      fw.setCommand({ throttleTarget: 1, stabilityAssist: true });
      for (let i = 0; i < 1200; i++) {
        fw.update(1 / 60, flatTerrain());
      }
      expect(fw.getAirspeed()).toBeLessThanOrEqual(phantomCfg.maxSpeed + 1);
    });
  });

  describe('resetToGround', () => {
    it('resets position, velocity, and phase', () => {
      const fw = createAirbornePhysics();
      fw.setCommand({ throttleTarget: 1, stabilityAssist: true });
      for (let i = 0; i < 60; i++) fw.update(1 / 60, flatTerrain());

      const newPos = new THREE.Vector3(100, 50, 200);
      fw.resetToGround(newPos);
      expect(fw.getPosition().x).toBe(100);
      expect(fw.getAirspeed()).toBe(0);
      expect(fw.getFlightState()).toBe('grounded');
      expect(fw.getFlightSnapshot().phase).toBe('parked');
    });
  });

  describe('resetAirborne', () => {
    it('repositions the aircraft into a clean airborne state', () => {
      const fw = createRunwayPhysics();
      const position = new THREE.Vector3(120, 85, -40);
      const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.5);

      fw.resetAirborne(position, quaternion, 72, -5, 10);

      const snapshot = fw.getFlightSnapshot();
      expect(fw.getPosition().x).toBeCloseTo(120, 4);
      expect(fw.getPosition().y).toBeCloseTo(85, 4);
      expect(fw.getFlightState()).toBe('airborne');
      expect(snapshot.phase).toBe('airborne');
      expect(snapshot.weightOnWheels).toBe(false);
      expect(snapshot.airspeed).toBeGreaterThan(60);
      expect(snapshot.verticalSpeed).toBeCloseTo(-5, 4);
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
    it('enforces the playable world boundary', () => {
      const fw = createAirbornePhysics(phantomCfg, 1500, phantomCfg.v2Speed + 40);
      fw.setWorldHalfExtent(500);
      fw.setCommand({ throttleTarget: 1, stabilityAssist: true });
      for (let i = 0; i < 6000; i++) {
        fw.update(1 / 60, flatTerrain());
      }

      const pos = fw.getPosition();
      expect(Math.abs(pos.x)).toBeLessThanOrEqual(500);
      expect(Math.abs(pos.z)).toBeLessThanOrEqual(500);
    });
  });
});
