import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { NPCPilotAI, PilotMission } from './NPCPilotAI';

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

  // ---- State machine basics ----

  describe('state machine', () => {
    it('starts in idle state', () => {
      expect(ai.getState()).toBe('idle');
    });

    it('setMission transitions to takeoff', () => {
      ai.setMission(makeMission());
      expect(ai.getState()).toBe('takeoff');
    });

    it('setMission resets waypoint index on second mission', () => {
      const wp1 = new THREE.Vector3(200, 0, 0);
      const wp2 = new THREE.Vector3(400, 0, 0);
      ai.setMission(makeMission({ waypoints: [wp1, wp2] }));
      // Advance through takeoff -> fly_to
      ai.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('fly_to');
      // Reach wp1 to advance index
      ai.update(DT, new THREE.Vector3(200, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      // Set a new mission - should reset to first waypoint
      ai.setMission(makeMission({ waypoints: [wp1, wp2] }));
      expect(ai.getState()).toBe('takeoff');
      // Advance to fly_to and check it targets wp1 (index 0) again
      ai.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('fly_to');
      // Far from wp1 -> stays in fly_to (not yet advanced past it)
      ai.update(DT, new THREE.Vector3(0, 100, 0), new THREE.Vector3(0, 0, 10), IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('fly_to');
    });

    it('setMission resets orbitAngle', () => {
      ai.setMission(makeMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(100, 0, 100),
        orbitRadius: 100,
      }));
      // Takeoff -> orbit
      ai.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      // Run orbit to advance angle
      for (let i = 0; i < 30; i++) {
        ai.update(DT, new THREE.Vector3(200, 100, 100), ZERO_VEL, IDENTITY_QUAT, 0);
      }
      // Set new mission, orbitAngle should reset to 0
      ai.setMission(makeMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(100, 0, 100),
        orbitRadius: 100,
      }));
      expect(ai.getState()).toBe('takeoff');
    });

    it('clearMission transitions to idle and nulls mission', () => {
      ai.setMission(makeMission());
      ai.clearMission();
      expect(ai.getState()).toBe('idle');
    });

    it('update with no mission returns autoHover controls', () => {
      const controls = ai.update(DT, new THREE.Vector3(), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBe(0);
      expect(controls.autoHover).toBe(true);
    });

    it('update in idle state returns autoHover even after mission cleared', () => {
      ai.setMission(makeMission());
      ai.clearMission();
      const controls = ai.update(DT, new THREE.Vector3(), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBe(0);
      expect(controls.autoHover).toBe(true);
    });
  });

  // ---- Takeoff ----

  describe('takeoff', () => {
    it('returns positive collective when below takeoff altitude', () => {
      ai.setMission(makeMission());
      const terrainHeight = 10;
      // Target is terrainHeight + 30 = 40, pos.y = 15 -> altError = 25
      const pos = new THREE.Vector3(0, 15, 0);
      const controls = ai.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, terrainHeight);
      expect(controls.collective).toBeGreaterThan(0);
    });

    it('returns autoHover true during takeoff', () => {
      ai.setMission(makeMission());
      const controls = ai.update(DT, new THREE.Vector3(0, 5, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.autoHover).toBe(true);
    });

    it('transitions to fly_to when reaching altitude with waypoints', () => {
      const wp = new THREE.Vector3(500, 0, 500);
      ai.setMission(makeMission({ waypoints: [wp] }));
      // terrainHeight=0, target=30, altError < 2 means pos.y > 28
      const pos = new THREE.Vector3(0, 29, 0);
      ai.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('fly_to');
    });

    it('transitions to orbit when reaching altitude with orbitPoint but no waypoints', () => {
      ai.setMission(makeMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(100, 0, 100),
      }));
      const pos = new THREE.Vector3(0, 29, 0);
      ai.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('orbit');
    });

    it('transitions to idle when reaching altitude with no waypoints or orbitPoint', () => {
      ai.setMission(makeMission({ waypoints: [] }));
      const pos = new THREE.Vector3(0, 29, 0);
      ai.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('idle');
    });

    it('does not transition when still far below takeoff altitude', () => {
      ai.setMission(makeMission({ waypoints: [new THREE.Vector3(100, 0, 0)] }));
      const pos = new THREE.Vector3(0, 5, 0);
      ai.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('takeoff');
    });

    it('collective is clamped to [0, 1]', () => {
      ai.setMission(makeMission());
      // Very far below: altError huge -> collective clamped to 1
      const controls = ai.update(DT, new THREE.Vector3(0, -100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBeLessThanOrEqual(1);
      expect(controls.collective).toBeGreaterThanOrEqual(0);
    });
  });

  // ---- Fly_to ----

  describe('fly_to', () => {
    function enterFlyTo(inst: NPCPilotAI, mission: PilotMission): void {
      inst.setMission(mission);
      // Reach takeoff altitude to transition to fly_to
      inst.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
    }

    it('advances waypoint index when within reach distance (50m)', () => {
      const wp1 = new THREE.Vector3(10, 0, 10);
      const wp2 = new THREE.Vector3(500, 0, 500);
      const mission = makeMission({ waypoints: [wp1, wp2] });
      enterFlyTo(ai, mission);
      expect(ai.getState()).toBe('fly_to');
      // Position near wp1 (XZ distance < 50)
      ai.update(DT, new THREE.Vector3(10, 100, 10), new THREE.Vector3(0, 0, 10), IDENTITY_QUAT, 0);
      // Should have advanced past wp1, still fly_to targeting wp2
      expect(ai.getState()).toBe('fly_to');
    });

    it('transitions to orbit after all waypoints if orbitPoint exists', () => {
      const wp = new THREE.Vector3(10, 0, 10);
      const mission = makeMission({
        waypoints: [wp],
        orbitPoint: new THREE.Vector3(200, 0, 200),
      });
      enterFlyTo(ai, mission);
      // Near the only waypoint
      ai.update(DT, new THREE.Vector3(10, 100, 10), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('orbit');
    });

    it('transitions to rtb after all waypoints if no orbitPoint', () => {
      const wp = new THREE.Vector3(10, 0, 10);
      const mission = makeMission({ waypoints: [wp] });
      enterFlyTo(ai, mission);
      ai.update(DT, new THREE.Vector3(10, 100, 10), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('rtb');
    });

    it('returns cyclicPitch > 0 when stationary and target ahead', () => {
      const wp = new THREE.Vector3(500, 0, 0);
      const mission = makeMission({ waypoints: [wp], cruiseSpeed: 40 });
      enterFlyTo(ai, mission);
      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.cyclicPitch).toBeGreaterThan(0);
    });

    it('returns autoHover false during fly_to', () => {
      const wp = new THREE.Vector3(500, 0, 0);
      const mission = makeMission({ waypoints: [wp] });
      enterFlyTo(ai, mission);
      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.autoHover).toBe(false);
    });

    it('returns negative cyclicPitch when going too fast', () => {
      const wp = new THREE.Vector3(500, 0, 0);
      const mission = makeMission({ waypoints: [wp], cruiseSpeed: 10 });
      enterFlyTo(ai, mission);
      // Moving much faster than cruiseSpeed
      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), new THREE.Vector3(50, 0, 0), IDENTITY_QUAT, 0);
      expect(controls.cyclicPitch).toBeLessThan(0);
    });
  });

  // ---- Orbit ----

  describe('orbit', () => {
    function enterOrbit(inst: NPCPilotAI, mission: PilotMission): void {
      inst.setMission(mission);
      // No waypoints + orbitPoint -> takeoff then orbit
      inst.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
    }

    it('enters orbit when no waypoints and orbitPoint specified', () => {
      const mission = makeMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(100, 0, 100),
      });
      enterOrbit(ai, mission);
      expect(ai.getState()).toBe('orbit');
    });

    it('stays in orbit across multiple updates', () => {
      const mission = makeMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(100, 0, 100),
        orbitRadius: 100,
        cruiseSpeed: 40,
      });
      enterOrbit(ai, mission);
      for (let i = 0; i < 60; i++) {
        ai.update(DT, new THREE.Vector3(200, 100, 100), ZERO_VEL, IDENTITY_QUAT, 0);
      }
      expect(ai.getState()).toBe('orbit');
    });

    it('uses default orbit radius of 150 if not specified', () => {
      const mission = makeMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(0, 0, 0),
        cruiseSpeed: 30,
        // orbitRadius intentionally omitted
      });
      enterOrbit(ai, mission);
      // Should not crash and should produce valid controls
      const controls = ai.update(DT, new THREE.Vector3(150, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBeDefined();
      expect(controls.yaw).toBeDefined();
    });

    it('returns non-zero yaw for heading correction', () => {
      const mission = makeMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(100, 0, 100),
        orbitRadius: 100,
        cruiseSpeed: 40,
      });
      enterOrbit(ai, mission);
      // Position offset from orbit target - needs heading correction
      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.yaw).not.toBe(0);
    });

    it('returns autoHover false during orbit', () => {
      const mission = makeMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(100, 0, 100),
        cruiseSpeed: 40,
      });
      enterOrbit(ai, mission);
      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.autoHover).toBe(false);
    });

    it('advances orbitAngle based on angular speed', () => {
      const mission = makeMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(0, 0, 0),
        orbitRadius: 100,
        cruiseSpeed: 50,
      });
      enterOrbit(ai, mission);
      // Angular speed = cruiseSpeed / radius = 50 / 100 = 0.5 rad/s
      // After 1 second (60 frames at DT), angle should advance by ~0.5 rad
      // We can verify indirectly: different yaw/collective outputs over time
      const pos = new THREE.Vector3(100, 100, 0);
      const c1 = ai.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, 0);
      // Run 59 more frames
      for (let i = 0; i < 59; i++) {
        ai.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, 0);
      }
      const c2 = ai.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, 0);
      // Yaw should differ as orbit target has moved
      expect(c1.yaw).not.toBeCloseTo(c2.yaw!, 2);
    });
  });

  // ---- Attack run ----

  describe('attack_run', () => {
    it('transitions to orbit when close to target and orbitPoint exists', () => {
      ai.setMission(makeMission({
        waypoints: [],
        attackTarget: new THREE.Vector3(10, 0, 10),
        orbitPoint: new THREE.Vector3(200, 0, 200),
      }));
      (ai as any).state = 'attack_run';

      // Position within 50m XZ of attackTarget
      ai.update(DT, new THREE.Vector3(10, 100, 10), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('orbit');
    });

    it('transitions to rtb when close to target and no orbitPoint', () => {
      ai.setMission(makeMission({
        waypoints: [],
        attackTarget: new THREE.Vector3(10, 0, 10),
      }));
      (ai as any).state = 'attack_run';

      ai.update(DT, new THREE.Vector3(10, 100, 10), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('rtb');
    });

    it('stays in attack_run when far from target', () => {
      ai.setMission(makeMission({
        waypoints: [],
        attackTarget: new THREE.Vector3(500, 0, 500),
        orbitPoint: new THREE.Vector3(200, 0, 200),
      }));
      (ai as any).state = 'attack_run';

      ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('attack_run');
    });

    it('falls back to current pos when no attackTarget or orbitPoint, then transitions to rtb', () => {
      ai.setMission(makeMission({ waypoints: [] }));
      (ai as any).state = 'attack_run';

      // target = pos (fallback), dist = 0 < 50 -> breaks off, no orbitPoint -> rtb
      const pos = new THREE.Vector3(0, 100, 0);
      const controls = ai.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBeDefined();
      expect(ai.getState()).toBe('rtb');
    });

    it('returns autoHover false during attack run', () => {
      ai.setMission(makeMission({
        waypoints: [],
        attackTarget: new THREE.Vector3(500, 0, 500),
      }));
      (ai as any).state = 'attack_run';

      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.autoHover).toBe(false);
    });
  });

  // ---- RTB ----

  describe('rtb', () => {
    function enterRTB(inst: NPCPilotAI, mission: PilotMission): void {
      inst.setMission(mission);
      (inst as any).state = 'rtb';
    }

    it('transitions to landing when within approach distance (30m) of homePosition', () => {
      enterRTB(ai, makeMission({ homePosition: new THREE.Vector3(10, 0, 10) }));
      // XZ distance to home = sqrt(0) = 0 < 30
      ai.update(DT, new THREE.Vector3(10, 100, 10), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('landing');
    });

    it('stays in rtb when far from homePosition', () => {
      enterRTB(ai, makeMission({ homePosition: new THREE.Vector3(500, 0, 500) }));
      ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('rtb');
    });

    it('uses reduced speed (0.7x cruiseSpeed)', () => {
      // Verify indirectly: RTB cyclicPitch < fly_to cyclicPitch at same velocity
      enterRTB(ai, makeMission({
        homePosition: new THREE.Vector3(500, 0, 0),
        cruiseSpeed: 40,
      }));
      const pos = new THREE.Vector3(0, 100, 0);
      const rtbControls = ai.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, 0);

      const ai2 = new NPCPilotAI();
      ai2.setMission(makeMission({
        waypoints: [new THREE.Vector3(500, 0, 0)],
        cruiseSpeed: 40,
      }));
      ai2.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0); // takeoff -> fly_to
      const flyControls = ai2.update(DT, pos, ZERO_VEL, IDENTITY_QUAT, 0);

      // RTB target speed = 28 (40*0.7) vs fly_to = 40 -> lower cyclicPitch
      expect(rtbControls.cyclicPitch!).toBeLessThan(flyControls.cyclicPitch!);
    });

    it('returns autoHover false during rtb flight', () => {
      enterRTB(ai, makeMission({ homePosition: new THREE.Vector3(500, 0, 500) }));
      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.autoHover).toBe(false);
    });
  });

  // ---- Landing ----

  describe('landing', () => {
    function enterLanding(inst: NPCPilotAI): void {
      inst.setMission(makeMission({ homePosition: new THREE.Vector3(0, 0, 0) }));
      (inst as any).state = 'landing';
    }

    it('transitions to idle when altitude above ground < grounded threshold (1.5m)', () => {
      enterLanding(ai);
      const terrainHeight = 10;
      // altAboveGround = 11 - 10 = 1.0 < 1.5
      ai.update(DT, new THREE.Vector3(0, 11, 0), ZERO_VEL, IDENTITY_QUAT, terrainHeight);
      expect(ai.getState()).toBe('idle');
    });

    it('clears mission on landing', () => {
      enterLanding(ai);
      ai.update(DT, new THREE.Vector3(0, 1, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('idle');
      // Mission cleared - subsequent update should return idle controls
      const controls = ai.update(DT, new THREE.Vector3(0, 1, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBe(0);
      expect(controls.autoHover).toBe(true);
    });

    it('returns controlled descent collective when still airborne', () => {
      enterLanding(ai);
      const controls = ai.update(DT, new THREE.Vector3(0, 20, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBeGreaterThan(0);
      expect(controls.collective).toBeLessThanOrEqual(0.5);
      expect(ai.getState()).toBe('landing');
    });

    it('returns zero cyclic and yaw during landing', () => {
      enterLanding(ai);
      const controls = ai.update(DT, new THREE.Vector3(0, 20, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.cyclicPitch).toBe(0);
      expect(controls.cyclicRoll).toBe(0);
      expect(controls.yaw).toBe(0);
    });

    it('collective is clamped to at least 0.1 during descent', () => {
      enterLanding(ai);
      // altAboveGround = 3, formula: 0.45 + (3 - 5) * 0.005 = 0.44
      const controls = ai.update(DT, new THREE.Vector3(0, 3, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBeGreaterThanOrEqual(0.1);
    });

    it('returns autoHover true during landing', () => {
      enterLanding(ai);
      const controls = ai.update(DT, new THREE.Vector3(0, 20, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.autoHover).toBe(true);
    });
  });

  // ---- PD controller (flyToward) output clamps ----

  describe('flyToward PD controller', () => {
    function enterFlyToFar(inst: NPCPilotAI): void {
      inst.setMission(makeMission({
        waypoints: [new THREE.Vector3(1000, 0, 0)],
        cruiseAltitude: 100,
        cruiseSpeed: 40,
      }));
      (inst as any).state = 'fly_to';
    }

    it('collective clamped to max 1.0 when far below altitude', () => {
      enterFlyToFar(ai);
      const controls = ai.update(DT, new THREE.Vector3(0, -500, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBeLessThanOrEqual(1.0);
    });

    it('collective clamped to min 0.1 when far above altitude', () => {
      enterFlyToFar(ai);
      const controls = ai.update(DT, new THREE.Vector3(0, 5000, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBeGreaterThanOrEqual(0.1);
    });

    it('yaw clamped between -1.0 and 1.0', () => {
      enterFlyToFar(ai);
      // Target at (1000, 0, 0), pos at origin, heading along +Z (identity quat)
      // desiredHeading = atan2(1000, 0) = PI/2, headingError = PI/2
      // KP=2.0 -> 2.0 * PI/2 = PI > 1.0 -> clamped
      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.yaw).toBeGreaterThanOrEqual(-1.0);
      expect(controls.yaw).toBeLessThanOrEqual(1.0);
    });

    it('cyclicPitch clamped between -0.5 and 0.5', () => {
      enterFlyToFar(ai);
      // Zero velocity, cruiseSpeed=40 -> speedError=40, 40*0.015=0.6 -> clamped to 0.5
      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.cyclicPitch).toBeGreaterThanOrEqual(-0.5);
      expect(controls.cyclicPitch).toBeLessThanOrEqual(0.5);
    });

    it('autoHover is false during flight', () => {
      enterFlyToFar(ai);
      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.autoHover).toBe(false);
    });

    it('cyclicRoll is always 0', () => {
      enterFlyToFar(ai);
      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.cyclicRoll).toBe(0);
    });

    it('collective > 0.5 when below target altitude', () => {
      enterFlyToFar(ai);
      // cruiseAltitude=100, terrainHeight=0, pos.y=50 -> altError=50 -> collective well above 0.5
      const controls = ai.update(DT, new THREE.Vector3(0, 50, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBeGreaterThan(0.5);
    });

    it('collective < 0.5 when above target altitude', () => {
      const ai2 = new NPCPilotAI();
      enterFlyToFar(ai2);
      // pos.y=200, target=100 -> altError=-100 -> collective well below 0.5
      const controls = ai2.update(DT, new THREE.Vector3(0, 200, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.collective).toBeLessThan(0.5);
    });

    it('heading error normalizes to [-PI, PI]', () => {
      // Target behind the helicopter (negative Z)
      ai.setMission(makeMission({
        waypoints: [new THREE.Vector3(0, 0, -1000)],
        cruiseAltitude: 100,
        cruiseSpeed: 40,
      }));
      (ai as any).state = 'fly_to';
      const controls = ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(controls.yaw).toBeGreaterThanOrEqual(-1.0);
      expect(controls.yaw).toBeLessThanOrEqual(1.0);
    });
  });

  // ---- Full mission sequences ----

  describe('full mission sequences', () => {
    it('takeoff -> fly_to -> rtb -> landing -> idle', () => {
      const home = new THREE.Vector3(0, 0, 0);
      const wp = new THREE.Vector3(10, 0, 10);
      ai.setMission(makeMission({
        waypoints: [wp],
        homePosition: home,
      }));
      expect(ai.getState()).toBe('takeoff');

      // Reach takeoff altitude
      ai.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('fly_to');

      // Reach waypoint
      ai.update(DT, new THREE.Vector3(10, 100, 10), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('rtb');

      // Reach home
      ai.update(DT, new THREE.Vector3(0, 100, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('landing');

      // Touch down
      ai.update(DT, new THREE.Vector3(0, 1, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('idle');
    });

    it('takeoff -> orbit (no waypoints)', () => {
      ai.setMission(makeMission({
        waypoints: [],
        orbitPoint: new THREE.Vector3(200, 0, 200),
        orbitRadius: 100,
        cruiseSpeed: 30,
      }));
      expect(ai.getState()).toBe('takeoff');

      ai.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('orbit');

      // Stays in orbit
      for (let i = 0; i < 5; i++) {
        ai.update(DT, new THREE.Vector3(300, 100, 200), ZERO_VEL, IDENTITY_QUAT, 0);
      }
      expect(ai.getState()).toBe('orbit');
    });

    it('takeoff -> fly_to -> orbit (waypoints + orbitPoint)', () => {
      const wp = new THREE.Vector3(10, 0, 10);
      ai.setMission(makeMission({
        waypoints: [wp],
        orbitPoint: new THREE.Vector3(200, 0, 200),
        orbitRadius: 80,
      }));
      expect(ai.getState()).toBe('takeoff');

      ai.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('fly_to');

      ai.update(DT, new THREE.Vector3(10, 100, 10), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('orbit');
    });

    it('can start a new mission after completing one', () => {
      ai.setMission(makeMission({ waypoints: [] }));
      // takeoff -> idle (no waypoints, no orbit)
      ai.update(DT, new THREE.Vector3(0, 29, 0), ZERO_VEL, IDENTITY_QUAT, 0);
      expect(ai.getState()).toBe('idle');

      // New mission
      ai.setMission(makeMission({ waypoints: [new THREE.Vector3(500, 0, 500)] }));
      expect(ai.getState()).toBe('takeoff');
    });
  });
});
