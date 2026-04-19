import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { NPCFixedWingPilot } from './NPCFixedWingPilot';
import type { Mission } from './NPCFixedWingPilot';
import { Airframe } from './airframe/Airframe';
import { airframeConfigFromLegacy } from './FixedWingTypes';
import { FIXED_WING_CONFIGS } from './FixedWingConfigs';
import {
  buildFixedWingPilotCommand,
  type FixedWingPilotIntent,
} from './FixedWingControlLaw';
import { airframeStateToFixedWingSnapshot } from './FixedWingTypes';
import type { AirframeTerrainProbe } from './airframe/types';

/**
 * Integration test: drive a real A1_SKYRAIDER Airframe with the NPC pilot
 * through a full sortie to verify the pilot actually takes off and doesn't
 * auger in. This is the "no crash on takeoff" hard-stop guardrail — if this
 * fails, PD tuning is wrong.
 *
 * The test doesn't assert a specific landing position. It asserts:
 *   - The aircraft becomes airborne during the sortie (altitudeAGL > 50).
 *   - The aircraft gains forward airspeed (indicating the pilot commanded
 *     takeoff rather than the aircraft drifting off the runway).
 *   - The aircraft does not terminate below ground (no underground crash).
 */

function flatTerrainProbe(height: number): AirframeTerrainProbe {
  const normal = new THREE.Vector3(0, 1, 0);
  return {
    sample() {
      return { height, normal };
    },
    sweep(from, to) {
      if (from.y >= height && to.y < height) {
        const t = (from.y - height) / Math.max(from.y - to.y, 0.0001);
        const point = new THREE.Vector3().lerpVectors(from, to, t);
        point.y = height;
        return { hit: true, point, normal };
      }
      return null;
    },
  };
}

describe('NPCFixedWingPilot — integration with live Airframe', () => {
  it('A1 Skyraider takes off and reaches cruise altitude under NPC control', () => {
    const terrainH = 0;
    const config = FIXED_WING_CONFIGS.A1_SKYRAIDER;
    const startPos = new THREE.Vector3(0, terrainH + config.physics.gearClearance, 0);

    const airframe = new Airframe(startPos.clone(), airframeConfigFromLegacy(config.physics));
    const pilot = new NPCFixedWingPilot();

    const mission: Mission = {
      kind: 'ferry',
      waypoints: [
        {
          position: new THREE.Vector3(0, 0, -2000),
          altitudeAGLm: 180,
          airspeedMs: 60,
          arrivalKind: 'flyby',
        },
      ],
      bingo: { fuelFraction: 0.1, ammoFraction: 0.05 },
      homeAirfield: {
        runwayStart: startPos.clone(),
        runwayHeading: Math.PI, // point south
      },
    };
    // Start the airframe heading south so Vr-alignment matches the waypoint.
    airframe.getQuaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

    pilot.setMission(mission);

    const probe = flatTerrainProbe(terrainH);
    const dt = 1 / 60;
    let maxAltitudeAGL = 0;
    let maxAirspeed = 0;
    let minAltitude = Number.POSITIVE_INFINITY;
    let sawAirborne = false;

    // Simulate 60 seconds of flight.
    const totalSteps = 60 * 60;
    for (let i = 0; i < totalSteps; i++) {
      const snapshot = airframe.getState();
      const intent = pilot.update(dt, snapshot) ?? {
        throttleStep: 0,
        throttleTarget: 0,
        pitchIntent: 0,
        bankIntent: 0,
        yawIntent: 0,
        brake: 1,
        pilotMode: 'assisted' as const,
        assistEnabled: false,
        orbitHoldEnabled: false,
        orbitCenterX: 0,
        orbitCenterZ: 0,
        orbitRadius: 0,
        orbitBankDeg: 0,
        orbitTurnDirection: -1 as const,
        directPitchInput: 0,
        directRollInput: 0,
        directYawInput: 0,
      };
      const legacySnapshot = airframeStateToFixedWingSnapshot(snapshot);
      const cmd = buildFixedWingPilotCommand(
        legacySnapshot,
        config.physics,
        config.pilotProfile,
        intent as FixedWingPilotIntent,
        {
          positionX: snapshot.position.x,
          positionZ: snapshot.position.z,
        },
      );
      airframe.step(
        {
          pitch: cmd.pitchCommand,
          roll: cmd.rollCommand,
          yaw: cmd.yawCommand,
          throttle: cmd.throttleTarget,
          brake: cmd.brake,
          tier: cmd.stabilityAssist ? 'assist' : 'raw',
        },
        probe,
        dt,
      );

      maxAltitudeAGL = Math.max(maxAltitudeAGL, snapshot.altitudeAGL);
      maxAirspeed = Math.max(maxAirspeed, snapshot.forwardAirspeedMs);
      minAltitude = Math.min(minAltitude, snapshot.altitude);
      if (!snapshot.weightOnWheels) sawAirborne = true;
    }

    // Hard stop guard: aircraft MUST get airborne.
    expect(sawAirborne).toBe(true);
    // AND must climb at least above liftoff clearance.
    expect(maxAltitudeAGL).toBeGreaterThan(50);
    // AND must gain real airspeed (pilot commanded takeoff, not drift).
    expect(maxAirspeed).toBeGreaterThan(40);
    // AND must not drop below ground (no underground crash).
    expect(minAltitude).toBeGreaterThanOrEqual(terrainH - 0.5);
  });
});
