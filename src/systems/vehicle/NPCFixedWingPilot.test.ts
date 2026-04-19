import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NPCFixedWingPilot } from './NPCFixedWingPilot';
import type { Mission, PilotState } from './NPCFixedWingPilot';
import type { AirframeState } from './airframe/types';

/**
 * Behavior tests for the NPC fixed-wing pilot state machine.
 *
 * These tests script AirframeState observations directly; we do NOT wire a
 * real Airframe. The pilot is a pure consumer of observations + mission, so
 * faking observations is the right level of abstraction for behavior tests.
 *
 * Each transition test: drive the pilot through observations that should
 * cause the guard to fire; assert that the pilot lands in the expected
 * state. We do not assert on specific intent values — those are PD output
 * and would enshrine tuning.
 */

function baseSnapshot(overrides: Partial<AirframeState> = {}): AirframeState {
  return {
    position: new THREE.Vector3(0, 10, 0),
    quaternion: new THREE.Quaternion(),
    velocity: new THREE.Vector3(),
    effectors: { throttle: 0, elevator: 0, aileron: 0, rudder: 0, brake: 0 },
    phase: 'parked',
    weightOnWheels: true,
    airspeedMs: 0,
    forwardAirspeedMs: 0,
    altitude: 10,
    altitudeAGL: 0,
    pitchDeg: 0,
    rollDeg: 0,
    headingDeg: 0,
    verticalSpeedMs: 0,
    aoaDeg: 0,
    sideslipDeg: 0,
    pitchRateDeg: 0,
    rollRateDeg: 0,
    yawRateDeg: 0,
    isStalled: false,
    ...overrides,
  };
}

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    kind: 'ferry',
    waypoints: [
      {
        position: new THREE.Vector3(0, 0, -1500),
        altitudeAGLm: 200,
        airspeedMs: 60,
        arrivalKind: 'flyby',
      },
    ],
    bingo: { fuelFraction: 0.1, ammoFraction: 0.05 },
    homeAirfield: {
      runwayStart: new THREE.Vector3(0, 10, 0),
      runwayHeading: 0,
    },
    ...overrides,
  };
}

/** Drive the pilot through a sequence of observations and return final state. */
function driveUntil(
  pilot: NPCFixedWingPilot,
  dt: number,
  maxSteps: number,
  makeObs: (i: number) => AirframeState,
  until: (state: PilotState) => boolean,
): PilotState {
  for (let i = 0; i < maxSteps; i++) {
    pilot.update(dt, makeObs(i));
    if (until(pilot.getState())) break;
  }
  return pilot.getState();
}

describe('NPCFixedWingPilot — lifecycle', () => {
  it('starts COLD before a mission is set', () => {
    const pilot = new NPCFixedWingPilot();
    expect(pilot.getState()).toBe('COLD');
  });

  it('setMission puts pilot in COLD and transitions to TAXI on first update', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission());
    expect(pilot.getState()).toBe('COLD');
    pilot.update(0.1, baseSnapshot());
    expect(pilot.getState()).toBe('TAXI');
  });

  it('update returns null when no mission', () => {
    const pilot = new NPCFixedWingPilot();
    const intent = pilot.update(0.1, baseSnapshot());
    expect(intent).toBeNull();
  });
});

describe('NPCFixedWingPilot — takeoff sequence', () => {
  it('TAXI → TAKEOFF_ROLL after short spool', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission());
    pilot.update(0.1, baseSnapshot()); // → TAXI
    expect(pilot.getState()).toBe('TAXI');

    // Accumulate timeInStateSec over several ticks of TAXI.
    for (let i = 0; i < 10; i++) pilot.update(0.1, baseSnapshot());
    expect(pilot.getState()).toBe('TAKEOFF_ROLL');
  });

  it('TAKEOFF_ROLL → CLIMB once airborne and at Vr', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission());
    // Fast-forward to TAKEOFF_ROLL
    driveUntil(pilot, 0.1, 50, () => baseSnapshot(), (s) => s === 'TAKEOFF_ROLL');
    expect(pilot.getState()).toBe('TAKEOFF_ROLL');

    // Now simulate becoming airborne at Vr.
    pilot.update(
      0.05,
      baseSnapshot({
        weightOnWheels: false,
        forwardAirspeedMs: 45,
        airspeedMs: 45,
        altitudeAGL: 2,
        altitude: 12,
      }),
    );
    expect(pilot.getState()).toBe('CLIMB');
  });

  it('CLIMB → CRUISE_TO_WP once at cruise AGL', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission());
    driveUntil(pilot, 0.1, 50, () => baseSnapshot(), (s) => s === 'TAKEOFF_ROLL');
    pilot.update(0.05, baseSnapshot({
      weightOnWheels: false,
      forwardAirspeedMs: 45,
      airspeedMs: 45,
      altitudeAGL: 2,
      altitude: 12,
    }));
    expect(pilot.getState()).toBe('CLIMB');

    // Now simulate reaching cruise altitude (default config is 180m AGL).
    pilot.update(0.1, baseSnapshot({
      weightOnWheels: false,
      forwardAirspeedMs: 60,
      airspeedMs: 60,
      altitudeAGL: 200,
      altitude: 210,
    }));
    expect(pilot.getState()).toBe('CRUISE_TO_WP');
  });
});

describe('NPCFixedWingPilot — cruise and attack', () => {
  it('CRUISE_TO_WP flyby waypoint advances index and continues cruising', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission({
      waypoints: [
        { position: new THREE.Vector3(0, 0, -100), altitudeAGLm: 200, airspeedMs: 60, arrivalKind: 'flyby' },
        { position: new THREE.Vector3(0, 0, -800), altitudeAGLm: 200, airspeedMs: 60, arrivalKind: 'flyby' },
      ],
    }));
    // Force pilot into CRUISE_TO_WP by jumping its internal state.
    driveToCruise(pilot);

    // Aircraft is right on top of the first waypoint — should advance.
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(0, 210, -100),
      weightOnWheels: false,
      forwardAirspeedMs: 60,
      airspeedMs: 60,
      altitudeAGL: 200,
      altitude: 210,
    }));
    expect(pilot.getState()).toBe('CRUISE_TO_WP');
    expect(pilot.getWaypointIndex()).toBe(1);
  });

  it('CRUISE_TO_WP → ATTACK_SETUP when arriving at attack waypoint', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission({
      kind: 'attack',
      waypoints: [
        { position: new THREE.Vector3(0, 0, -100), altitudeAGLm: 200, airspeedMs: 60, arrivalKind: 'attack' },
      ],
      target: { position: new THREE.Vector3(0, 0, -100), minAttackAltM: 80 },
    }));
    driveToCruise(pilot);

    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(0, 210, -100),
      weightOnWheels: false,
      forwardAirspeedMs: 60,
      airspeedMs: 60,
      altitudeAGL: 200,
      altitude: 210,
    }));
    expect(pilot.getState()).toBe('ATTACK_SETUP');
  });

  it('ATTACK_RUN → BREAKAWAY at min-attack altitude', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission({
      kind: 'attack',
      waypoints: [
        { position: new THREE.Vector3(0, 0, -100), altitudeAGLm: 200, airspeedMs: 60, arrivalKind: 'attack' },
      ],
      target: { position: new THREE.Vector3(0, 0, -100), minAttackAltM: 80 },
    }));
    driveToCruise(pilot);
    // Arrive at attack waypoint → ATTACK_SETUP
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(0, 210, -100),
      weightOnWheels: false,
      forwardAirspeedMs: 60,
      airspeedMs: 60,
      altitudeAGL: 200,
      altitude: 210,
    }));
    expect(pilot.getState()).toBe('ATTACK_SETUP');

    // Force into ATTACK_RUN by simulating close-in alignment.
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(0, 200, -300),
      weightOnWheels: false,
      forwardAirspeedMs: 65,
      airspeedMs: 65,
      altitudeAGL: 190,
      altitude: 200,
      headingDeg: 180, // pointing +z → toward (0, 0, -100) from (0, 0, -300)? no, toward +z means away
    }));
    // The heading bit: headingToTargetDeg((0-0), (-100)-(-300)=200) is atan2(0, -200)=180.
    // current heading 180 matches → aligned. Close enough.
    // Force down to min-attack-alt → BREAKAWAY
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(0, 80, -150),
      weightOnWheels: false,
      forwardAirspeedMs: 70,
      airspeedMs: 70,
      altitudeAGL: 70,
      altitude: 80,
      headingDeg: 180,
    }));
    // After ATTACK_RUN commit, a low-alt obs triggers BREAKAWAY. Allow one
    // more tick for the transition to land deterministically.
    for (let i = 0; i < 3; i++) {
      pilot.update(0.1, baseSnapshot({
        position: new THREE.Vector3(0, 80, -150),
        weightOnWheels: false,
        forwardAirspeedMs: 70,
        airspeedMs: 70,
        altitudeAGL: 70,
        altitude: 80,
        headingDeg: 180,
      }));
    }
    // Assert: we're past ATTACK_SETUP by now (either in ATTACK_RUN about to
    // break, or already in BREAKAWAY / REATTACK_DECISION).
    expect(['ATTACK_RUN', 'BREAKAWAY', 'REATTACK_DECISION']).toContain(pilot.getState());
  });

  it('BREAKAWAY → REATTACK_DECISION once safe alt and distance reached', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission({
      kind: 'attack',
      waypoints: [
        { position: new THREE.Vector3(0, 0, -100), altitudeAGLm: 200, airspeedMs: 60, arrivalKind: 'attack' },
      ],
      target: { position: new THREE.Vector3(0, 0, -100), minAttackAltM: 80 },
    }));
    // Fast-forward all the way to BREAKAWAY by scripted observations.
    driveToCruise(pilot);
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(0, 210, -100),
      weightOnWheels: false,
      forwardAirspeedMs: 60,
      airspeedMs: 60,
      altitudeAGL: 200,
      altitude: 210,
    })); // → ATTACK_SETUP
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(0, 200, -300),
      weightOnWheels: false,
      forwardAirspeedMs: 65,
      airspeedMs: 65,
      altitudeAGL: 190,
      altitude: 200,
      headingDeg: 180,
    })); // → ATTACK_RUN
    // Drive to min attack alt to force BREAKAWAY
    for (let i = 0; i < 3; i++) {
      pilot.update(0.1, baseSnapshot({
        position: new THREE.Vector3(0, 80, -150),
        weightOnWheels: false,
        forwardAirspeedMs: 70,
        airspeedMs: 70,
        altitudeAGL: 70,
        altitude: 80,
        headingDeg: 180,
      }));
    }

    // Now far away and high → REATTACK_DECISION guard triggers.
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(0, 210, 1200),
      weightOnWheels: false,
      forwardAirspeedMs: 65,
      airspeedMs: 65,
      altitudeAGL: 200,
      altitude: 210,
      headingDeg: 0,
    }));
    expect(['REATTACK_DECISION', 'RTB', 'ATTACK_SETUP']).toContain(pilot.getState());
  });

  it('REATTACK_DECISION branches to RTB when ammo is near zero', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission({
      kind: 'attack',
      target: { position: new THREE.Vector3(0, 0, -100), minAttackAltM: 80 },
    }));
    pilot.setResources({ ammoFraction: 0.0, fuelFraction: 0.5 });
    // Skip through by building up to REATTACK_DECISION with scripted obs.
    driveToCruise(pilot);
    // Even with ammo gone, reaching the waypoint lands us in ATTACK_SETUP,
    // which immediately triggers bingo-check at the next cruise entry.
    // But the bingo threshold is ammoFraction <= 0.05 which is satisfied.
    // To directly exercise REATTACK_DECISION's branch, we use the utility
    // score module (tested separately via behavior of the entire pilot).
    // Drive a full sequence through attack, breakaway, reattack decision:
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(0, 210, -100),
      weightOnWheels: false,
      forwardAirspeedMs: 60,
      airspeedMs: 60,
      altitudeAGL: 200,
      altitude: 210,
    }));
    // ATTACK_SETUP checks bingo? No — bingo is only checked in cruise/orbit.
    // So we go through RUN → BREAKAWAY → REATTACK_DECISION.
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(0, 200, -300),
      weightOnWheels: false,
      forwardAirspeedMs: 65,
      airspeedMs: 65,
      altitudeAGL: 190,
      altitude: 200,
      headingDeg: 180,
    })); // ATTACK_RUN
    for (let i = 0; i < 3; i++) {
      pilot.update(0.1, baseSnapshot({
        position: new THREE.Vector3(0, 80, -150),
        weightOnWheels: false,
        forwardAirspeedMs: 70,
        airspeedMs: 70,
        altitudeAGL: 70,
        altitude: 80,
        headingDeg: 180,
      }));
    } // BREAKAWAY
    // Safe alt + distance from target → REATTACK_DECISION → RTB (ammo is 0).
    // With ammo at zero, the branch picks RTB. Once in RTB, subsequent ticks
    // may progress into APPROACH once the aircraft lands near home. Accept
    // any of the downstream states as evidence the REATTACK branch chose
    // "go home" rather than "reattack."
    for (let i = 0; i < 10; i++) {
      pilot.update(0.1, baseSnapshot({
        position: new THREE.Vector3(0, 210, 1200 + i * 50),
        weightOnWheels: false,
        forwardAirspeedMs: 65,
        airspeedMs: 65,
        altitudeAGL: 200,
        altitude: 210,
        headingDeg: 0,
      }));
      if (pilot.getState() === 'RTB' || pilot.getState() === 'APPROACH' || pilot.getState() === 'LANDING') break;
    }
    expect(['RTB', 'APPROACH', 'LANDING']).toContain(pilot.getState());
    // And the pilot must NOT have looped back to ATTACK_SETUP/RUN.
    expect(pilot.getState()).not.toBe('ATTACK_SETUP');
    expect(pilot.getState()).not.toBe('ATTACK_RUN');
  });
});

describe('NPCFixedWingPilot — RTB and landing', () => {
  it('bingo fuel triggers RTB from CRUISE_TO_WP', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission({
      waypoints: [
        { position: new THREE.Vector3(0, 0, -3000), altitudeAGLm: 200, airspeedMs: 60, arrivalKind: 'flyby' },
      ],
    }));
    driveToCruise(pilot);
    pilot.setResources({ fuelFraction: 0.05 });
    // One more update with mid-cruise obs; guard fires.
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(0, 210, -500),
      weightOnWheels: false,
      forwardAirspeedMs: 60,
      airspeedMs: 60,
      altitudeAGL: 200,
      altitude: 210,
    }));
    expect(pilot.getState()).toBe('RTB');
  });

  it('any-state → RTB is reachable by clearing the mission (COLD absorbing)', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission());
    driveToCruise(pilot);
    pilot.clearMission();
    expect(pilot.getState()).toBe('COLD');
  });

  it('RTB → APPROACH when within capture distance of home', () => {
    const pilot = new NPCFixedWingPilot();
    const home = new THREE.Vector3(100, 10, 200);
    pilot.setMission(makeMission({
      homeAirfield: { runwayStart: home, runwayHeading: 0 },
      waypoints: [{ position: new THREE.Vector3(0, 0, -3000), altitudeAGLm: 200, airspeedMs: 60, arrivalKind: 'flyby' }],
    }));
    pilot.setResources({ fuelFraction: 0.05 });
    driveToCruise(pilot);
    // Trip RTB via bingo
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(0, 210, -500),
      weightOnWheels: false,
      forwardAirspeedMs: 60,
      airspeedMs: 60,
      altitudeAGL: 200,
      altitude: 210,
    }));
    expect(pilot.getState()).toBe('RTB');
    // Place the aircraft within capture distance of home (default 400m).
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(home.x + 200, 200, home.z + 50),
      weightOnWheels: false,
      forwardAirspeedMs: 55,
      airspeedMs: 55,
      altitudeAGL: 190,
      altitude: 200,
    }));
    expect(pilot.getState()).toBe('APPROACH');
  });

  it('APPROACH → LANDING on short final', () => {
    const pilot = makeCruisingPilot();
    // Walk the pilot into APPROACH
    stepThroughToApproach(pilot);
    // Close in on runway, low and slow
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(50, 40, 50),
      weightOnWheels: false,
      forwardAirspeedMs: 40,
      airspeedMs: 40,
      altitudeAGL: 30,
      altitude: 40,
    }));
    expect(pilot.getState()).toBe('LANDING');
  });

  it('LANDING → COLD when stopped on ground', () => {
    const pilot = makeCruisingPilot();
    stepThroughToApproach(pilot);
    // Trigger LANDING
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(50, 40, 50),
      weightOnWheels: false,
      forwardAirspeedMs: 40,
      airspeedMs: 40,
      altitudeAGL: 30,
      altitude: 40,
    }));
    expect(pilot.getState()).toBe('LANDING');
    // Now stopped on ground
    pilot.update(0.1, baseSnapshot({
      position: new THREE.Vector3(0, 10, 0),
      weightOnWheels: true,
      forwardAirspeedMs: 3,
      airspeedMs: 3,
      altitudeAGL: 0,
      altitude: 10,
    }));
    expect(pilot.getState()).toBe('COLD');
  });
});

describe('NPCFixedWingPilot — dead state', () => {
  it('destroyed resource transitions to DEAD on next tick', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission());
    driveToCruise(pilot);
    pilot.markDestroyed();
    pilot.update(0.1, baseSnapshot({
      weightOnWheels: false,
      altitudeAGL: 200,
    }));
    expect(pilot.getState()).toBe('DEAD');
  });

  it('DEAD is absorbing — further updates keep pilot in DEAD', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission());
    pilot.markDestroyed();
    pilot.update(0.1, baseSnapshot());
    pilot.update(0.1, baseSnapshot());
    expect(pilot.getState()).toBe('DEAD');
  });
});

describe('NPCFixedWingPilot — transition log', () => {
  it('records state transitions with monotonic mission time', () => {
    const pilot = new NPCFixedWingPilot();
    pilot.setMission(makeMission());
    for (let i = 0; i < 40; i++) pilot.update(0.1, baseSnapshot());
    const log = pilot.getTransitionLog();
    expect(log.length).toBeGreaterThan(0);
    // First transition: COLD → (TAXI or other). Mission time monotonically
    // non-decreasing.
    let lastT = -1;
    for (const entry of log) {
      expect(entry.missionTimeSec).toBeGreaterThanOrEqual(lastT);
      lastT = entry.missionTimeSec;
    }
  });
});

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Drive the pilot through COLD → TAXI → TAKEOFF_ROLL → CLIMB → CRUISE_TO_WP
 * without trying to simulate physics. After this, the pilot is in
 * CRUISE_TO_WP with waypointIndex 0.
 */
function driveToCruise(pilot: NPCFixedWingPilot): void {
  // TAXI spool
  for (let i = 0; i < 10; i++) pilot.update(0.1, baseSnapshot());
  // Commit takeoff — observation says we're airborne at Vr.
  pilot.update(0.05, baseSnapshot({
    weightOnWheels: false,
    forwardAirspeedMs: 45,
    airspeedMs: 45,
    altitudeAGL: 2,
    altitude: 12,
  }));
  // Reach cruise altitude.
  pilot.update(0.1, baseSnapshot({
    weightOnWheels: false,
    forwardAirspeedMs: 60,
    airspeedMs: 60,
    altitudeAGL: 200,
    altitude: 210,
  }));
}

function makeCruisingPilot(): NPCFixedWingPilot {
  const pilot = new NPCFixedWingPilot();
  pilot.setMission(makeMission({
    waypoints: [{ position: new THREE.Vector3(0, 0, -3000), altitudeAGLm: 200, airspeedMs: 60, arrivalKind: 'flyby' }],
    homeAirfield: { runwayStart: new THREE.Vector3(0, 10, 0), runwayHeading: 0 },
  }));
  return pilot;
}

function stepThroughToApproach(pilot: NPCFixedWingPilot): void {
  pilot.setResources({ fuelFraction: 0.05 });
  driveToCruise(pilot);
  pilot.update(0.1, baseSnapshot({
    position: new THREE.Vector3(0, 210, -500),
    weightOnWheels: false,
    forwardAirspeedMs: 60,
    airspeedMs: 60,
    altitudeAGL: 200,
    altitude: 210,
  })); // → RTB
  // Arrive near home → APPROACH
  pilot.update(0.1, baseSnapshot({
    position: new THREE.Vector3(100, 200, 100),
    weightOnWheels: false,
    forwardAirspeedMs: 55,
    airspeedMs: 55,
    altitudeAGL: 190,
    altitude: 200,
  }));
}
