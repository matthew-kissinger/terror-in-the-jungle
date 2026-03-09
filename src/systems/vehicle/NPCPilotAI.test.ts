import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NPCPilotAI, PilotMission } from './NPCPilotAI';

function createMission(overrides?: Partial<PilotMission>): PilotMission {
  return {
    waypoints: [new THREE.Vector3(500, 0, 0), new THREE.Vector3(500, 0, 500)],
    cruiseAltitude: 100,
    cruiseSpeed: 40,
    homePosition: new THREE.Vector3(0, 0, 0),
    ...overrides,
  };
}

function tick(ai: NPCPilotAI, pos: THREE.Vector3, vel: THREE.Vector3, n: number, dt = 1 / 60) {
  const quat = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const controls = ai.update(dt, pos, vel, quat, 0);
    // Simple integration to simulate movement
    if (controls.collective !== undefined) {
      vel.y += (controls.collective - 0.5) * 20 * dt;
    }
    if (controls.cyclicPitch !== undefined) {
      vel.z -= controls.cyclicPitch * 30 * dt;
    }
    pos.add(vel.clone().multiplyScalar(dt));
  }
}

describe('NPCPilotAI', () => {
  describe('state transitions', () => {
    it('starts idle', () => {
      const ai = new NPCPilotAI();
      expect(ai.getState()).toBe('idle');
    });

    it('transitions to takeoff on setMission', () => {
      const ai = new NPCPilotAI();
      ai.setMission(createMission());
      expect(ai.getState()).toBe('takeoff');
    });

    it('transitions from takeoff to fly_to when altitude reached', () => {
      const ai = new NPCPilotAI();
      ai.setMission(createMission());

      const pos = new THREE.Vector3(0, 0, 0);
      const vel = new THREE.Vector3(0, 0, 0);

      // Simulate climbing to 30m
      pos.y = 30;
      const quat = new THREE.Quaternion();
      ai.update(1 / 60, pos, vel, quat, 0);

      expect(ai.getState()).toBe('fly_to');
    });

    it('transitions to orbit when all waypoints reached', () => {
      const ai = new NPCPilotAI();
      ai.setMission(createMission({
        waypoints: [new THREE.Vector3(10, 0, 10)],
        orbitPoint: new THREE.Vector3(100, 0, 100),
        orbitRadius: 80,
      }));

      // Skip takeoff
      const pos = new THREE.Vector3(0, 40, 0);
      const vel = new THREE.Vector3(0, 0, 0);
      const quat = new THREE.Quaternion();
      ai.update(1 / 60, pos, vel, quat, 0); // takeoff -> fly_to

      // Move to near waypoint
      pos.set(10, 40, 10);
      ai.update(1 / 60, pos, vel, quat, 0);
      expect(ai.getState()).toBe('orbit');
    });

    it('transitions to rtb when waypoints done and no orbit', () => {
      const ai = new NPCPilotAI();
      ai.setMission(createMission({ waypoints: [new THREE.Vector3(5, 0, 5)] }));

      const pos = new THREE.Vector3(0, 40, 0);
      const vel = new THREE.Vector3(0, 0, 0);
      const quat = new THREE.Quaternion();
      ai.update(1 / 60, pos, vel, quat, 0); // takeoff -> fly_to

      pos.set(5, 40, 5);
      ai.update(1 / 60, pos, vel, quat, 0);
      expect(ai.getState()).toBe('rtb');
    });

    it('transitions from rtb to landing when near home', () => {
      const ai = new NPCPilotAI();
      ai.setMission(createMission({ waypoints: [new THREE.Vector3(5, 0, 5)] }));

      const pos = new THREE.Vector3(0, 40, 0);
      const vel = new THREE.Vector3(0, 0, 0);
      const quat = new THREE.Quaternion();

      ai.update(1 / 60, pos, vel, quat, 0); // takeoff -> fly_to
      pos.set(5, 40, 5);
      ai.update(1 / 60, pos, vel, quat, 0); // fly_to -> rtb

      // Move near home
      pos.set(0, 40, 0);
      ai.update(1 / 60, pos, vel, quat, 0);
      expect(ai.getState()).toBe('landing');
    });

    it('transitions from landing to idle when grounded', () => {
      const ai = new NPCPilotAI();
      ai.setMission(createMission({ waypoints: [new THREE.Vector3(5, 0, 5)] }));

      const pos = new THREE.Vector3(0, 40, 0);
      const vel = new THREE.Vector3(0, 0, 0);
      const quat = new THREE.Quaternion();

      // Force through states
      ai.update(1 / 60, pos, vel, quat, 0); // takeoff -> fly_to
      pos.set(5, 40, 5);
      ai.update(1 / 60, pos, vel, quat, 0); // fly_to -> rtb
      pos.set(0, 40, 0);
      ai.update(1 / 60, pos, vel, quat, 0); // rtb -> landing

      // Land
      pos.y = 1.0;
      ai.update(1 / 60, pos, vel, quat, 0);
      expect(ai.getState()).toBe('idle');
    });

    it('clearMission resets to idle', () => {
      const ai = new NPCPilotAI();
      ai.setMission(createMission());
      expect(ai.getState()).toBe('takeoff');
      ai.clearMission();
      expect(ai.getState()).toBe('idle');
    });
  });

  describe('PD controller', () => {
    it('produces positive collective when below target altitude', () => {
      const ai = new NPCPilotAI();
      ai.setMission(createMission());

      // At takeoff, well below target
      const pos = new THREE.Vector3(0, 5, 0);
      const vel = new THREE.Vector3(0, 0, 0);
      const quat = new THREE.Quaternion();
      const controls = ai.update(1 / 60, pos, vel, quat, 0);

      expect(controls.collective).toBeGreaterThan(0.5);
    });

    it('produces yaw toward waypoint', () => {
      const ai = new NPCPilotAI();
      ai.setMission(createMission({
        waypoints: [new THREE.Vector3(100, 0, 0)], // target to the right (positive X)
      }));

      // Skip to fly_to
      const pos = new THREE.Vector3(0, 40, 0);
      const vel = new THREE.Vector3(0, 0, 0);
      const quat = new THREE.Quaternion();
      ai.update(1 / 60, pos, vel, quat, 0); // takeoff -> fly_to

      const controls = ai.update(1 / 60, pos, vel, quat, 0);
      // Should produce yaw since waypoint is off to the side
      expect(controls.yaw).toBeDefined();
      expect(controls.yaw).not.toBe(0);
    });
  });

  describe('orbit', () => {
    it('stays in orbit state continuously', () => {
      const ai = new NPCPilotAI();
      ai.setMission(createMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(100, 0, 100),
        orbitRadius: 80,
      }));

      const pos = new THREE.Vector3(0, 40, 0);
      const vel = new THREE.Vector3(0, 0, 0);
      const quat = new THREE.Quaternion();

      // takeoff -> orbit (no waypoints, has orbit point)
      ai.update(1 / 60, pos, vel, quat, 0);

      // Should stay in orbit
      for (let i = 0; i < 60; i++) {
        ai.update(1 / 60, pos, vel, quat, 0);
      }
      expect(ai.getState()).toBe('orbit');
    });
  });
});
