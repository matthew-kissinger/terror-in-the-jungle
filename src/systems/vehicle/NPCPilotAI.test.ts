import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { NPCPilotAI, PilotMission } from './NPCPilotAI';

/**
 * Behavior tests for NPCPilotAI.
 *
 * We intentionally do NOT assert on specific state-machine label names
 * (takeoff/fly_to/orbit/rtb/landing). Those are implementation details
 * that will change. We assert on the observable control outputs the
 * pilot produces and on mission-level flow (takeoff -> fly -> return -> land).
 */

function makeMission(overrides: Partial<PilotMission> = {}): PilotMission {
  return {
    waypoints: [],
    cruiseAltitude: 100,
    cruiseSpeed: 40,
    homePosition: new THREE.Vector3(0, 0, 0),
    ...overrides,
  };
}

const DT = 1 / 60;
const IDENTITY_QUAT = new THREE.Quaternion();
const ZERO_VEL = new THREE.Vector3(0, 0, 0);

describe('NPCPilotAI', () => {
  let ai: NPCPilotAI;

  beforeEach(() => {
    ai = new NPCPilotAI();
  });

  describe('idle / no-mission behavior', () => {
    it('hovers with zero collective when no mission is assigned', () => {
      const controls = ai.update(DT, new THREE.Vector3(), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBe(0);
      expect(controls.autoHover).toBe(true);
    });

    it('returns to hover after the mission is cleared', () => {
      ai.setMission(makeMission());
      ai.clearMission();
      const controls = ai.update(DT, new THREE.Vector3(), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBe(0);
      expect(controls.autoHover).toBe(true);
    });
  });

  describe('takeoff', () => {
    it('commands climb while below takeoff altitude', () => {
      ai.setMission(makeMission());
      const controls = ai.update(DT, new THREE.Vector3(0, 5, 0), ZERO_VEL, IDENTITY_QUAT, 10);
      expect(controls.collective).toBeGreaterThan(0);
      expect(controls.autoHover).toBe(true);
    });

    it('clamps collective within [0, 1] even for a deep altitude deficit', () => {
      ai.setMission(makeMission());
      const controls = ai.update(DT, new THREE.Vector3(0, -100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBeLessThanOrEqual(1);
      expect(controls.collective).toBeGreaterThanOrEqual(0);
    });
  });

  describe('cruise flight toward waypoints', () => {
    function liftTo(inst: NPCPilotAI, mission: PilotMission): void {
      inst.setMission(mission);
      inst.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
    }

    it('pitches forward to reach a waypoint when stationary', () => {
      const wp = new THREE.Vector3(500, 0, 0);
      liftTo(ai, makeMission({ waypoints: [wp], cruiseSpeed: 40 }));
      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.cyclicPitch).toBeGreaterThan(0);
      expect(controls.autoHover).toBe(false);
    });

    it('pitches backward when already moving faster than cruise speed', () => {
      const wp = new THREE.Vector3(500, 0, 0);
      liftTo(ai, makeMission({ waypoints: [wp], cruiseSpeed: 10 }));
      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), new THREE.Vector3(50, 0, 0), IDENTITY_QUAT, 0);
      expect(controls.cyclicPitch).toBeLessThan(0);
    });

    it('adds lift when below the cruise altitude and bleeds it when above', () => {
      const wp = new THREE.Vector3(1000, 0, 0);
      const inst1 = new NPCPilotAI();
      liftTo(inst1, makeMission({ waypoints: [wp], cruiseAltitude: 100 }));
      const below = inst1.update(DT, new THREE.Vector3(0, 50, 0), ZERO_VEL, IDENTITY_QUAT, 0);

      const inst2 = new NPCPilotAI();
      liftTo(inst2, makeMission({ waypoints: [wp], cruiseAltitude: 100 }));
      const above = inst2.update(DT, new THREE.Vector3(0, 200, 0), ZERO_VEL, IDENTITY_QUAT, 0);

      expect(below.collective!).toBeGreaterThan(above.collective!);
    });

    it('clamps flight outputs to sane ranges regardless of error magnitude', () => {
      liftTo(ai, makeMission({ waypoints: [new THREE.Vector3(1000, 0, 0)], cruiseSpeed: 40 }));
      const far = ai.update(DT, new THREE.Vector3(0, -500, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(far.collective).toBeLessThanOrEqual(1);
      expect(far.collective).toBeGreaterThanOrEqual(0);
      expect(far.yaw!).toBeGreaterThanOrEqual(-1);
      expect(far.yaw!).toBeLessThanOrEqual(1);
      expect(far.cyclicPitch!).toBeGreaterThanOrEqual(-0.5);
      expect(far.cyclicPitch!).toBeLessThanOrEqual(0.5);
      expect(far.cyclicRoll).toBe(0);
    });
  });

  describe('orbit', () => {
    it('flies a non-stationary orbit that changes yaw command over time', () => {
      ai.setMission(makeMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(0, 0, 0),
        orbitRadius: 100,
        cruiseSpeed: 50,
      }));
      ai.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0); // takeoff -> orbit
      const pos = new THREE.Vector3(100, 100, 0);
      const first = ai.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, 0);
      for (let i = 0; i < 59; i++) {
        ai.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, 0);
      }
      const later = ai.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, 0);
      expect(first.yaw).not.toBeCloseTo(later.yaw!, 2);
      expect(later.autoHover).toBe(false);
    });

    it('does not crash when orbitRadius is omitted (uses default)', () => {
      ai.setMission(makeMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(0, 0, 0),
        cruiseSpeed: 30,
      }));
      ai.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      const controls = ai.update(DT, new THREE.Vector3(150, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBeDefined();
      expect(controls.yaw).toBeDefined();
    });
  });

  describe('landing', () => {
    function flyHomeAndLand(inst: NPCPilotAI): void {
      const home = new THREE.Vector3(0, 0, 0);
      inst.setMission(makeMission({ waypoints: [new THREE.Vector3(10, 0, 10)], homePosition: home }));
      // takeoff -> cruise
      inst.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      // reach waypoint -> rtb
      inst.update(DT, new THREE.Vector3(10, 100, 10), ZERO_VEL, IDENTITY_QUAT, 0);
      // reach home -> landing
      inst.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
    }

    it('commands a controlled descent while still above the ground', () => {
      flyHomeAndLand(ai);
      const controls = ai.update(DT, new THREE.Vector3(0, 20, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBeGreaterThan(0);
      expect(controls.collective).toBeLessThanOrEqual(0.5);
      expect(controls.cyclicPitch).toBe(0);
      expect(controls.cyclicRoll).toBe(0);
      expect(controls.yaw).toBe(0);
      expect(controls.autoHover).toBe(true);
    });

    it('touches down and returns to idle hover when close to the ground', () => {
      flyHomeAndLand(ai);
      // altitude above ground = 1 -> below grounded threshold
      ai.update(DT, new THREE.Vector3(0, 1, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      // mission is cleared; subsequent update yields idle hover
      const controls = ai.update(DT, new THREE.Vector3(0, 1, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBe(0);
      expect(controls.autoHover).toBe(true);
    });
  });

  describe('mission flow', () => {
    it('flies takeoff -> waypoint -> home -> touchdown on a simple out-and-back', () => {
      const home = new THREE.Vector3(0, 0, 0);
      const wp = new THREE.Vector3(500, 0, 500);
      ai.setMission(makeMission({ waypoints: [wp], homePosition: home }));

      // Before liftoff: should be commanding climb with auto-hover on.
      const atRest = ai.update(DT, new THREE.Vector3(0, 0, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(atRest.collective).toBeGreaterThan(0);
      expect(atRest.autoHover).toBe(true);

      // Reach takeoff altitude, then tick again: should now be cruising (autoHover off).
      ai.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      const cruising = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(cruising.autoHover).toBe(false);

      // Reach the waypoint, then tick again on the way home: still cruising.
      ai.update(DT, new THREE.Vector3(500, 100, 500), ZERO_VEL, IDENTITY_QUAT, 0);
      const returning = ai.update(DT, new THREE.Vector3(250, 100, 250), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(returning.autoHover).toBe(false);

      // Arrive home, then tick again: should be descending (autoHover on, low collective).
      ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      const descending = ai.update(DT, new THREE.Vector3(0, 20, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(descending.autoHover).toBe(true);
      expect(descending.collective).toBeLessThanOrEqual(0.5);

      // Touchdown -> back to idle hover on subsequent tick.
      ai.update(DT, new THREE.Vector3(0, 1, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      const idle = ai.update(DT, new THREE.Vector3(0, 1, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(idle.collective).toBe(0);
      expect(idle.autoHover).toBe(true);
    });

    it('loops in an orbit when given no waypoints but an orbit point', () => {
      ai.setMission(makeMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(200, 0, 200),
        orbitRadius: 100,
        cruiseSpeed: 30,
      }));
      // Climb to cruise altitude.
      ai.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);

      // Orbit should produce active (non-hover) flight controls for many ticks.
      let sawActiveCruise = false;
      for (let i = 0; i < 120; i++) {
        const c = ai.update(DT, new THREE.Vector3(300, 100, 200), ZERO_VEL, IDENTITY_QUAT, 0);
        if (c.autoHover === false) sawActiveCruise = true;
      }
      expect(sawActiveCruise).toBe(true);
    });

    it('can accept a fresh mission after an earlier one completes', () => {
      // First mission: no waypoints, no orbit. Returns to idle after reaching altitude.
      ai.setMission(makeMission({ waypoints: [] }));
      ai.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      const idleControls = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(idleControls.collective).toBe(0);

      // New mission: should be actively climbing again.
      ai.setMission(makeMission({ waypoints: [new THREE.Vector3(500, 0, 500)] }));
      const climbing = ai.update(DT, new THREE.Vector3(0, 5, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(climbing.collective).toBeGreaterThan(0);
      expect(climbing.autoHover).toBe(true);
    });
  });
});
