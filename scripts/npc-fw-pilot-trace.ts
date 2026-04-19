/**
 * Live trace of an NPC fixed-wing pilot flying an A-1 Skyraider through a
 * full sortie. Prints state transitions and final airframe snapshot as
 * playtest evidence for `npc-fixed-wing-pilot-ai`.
 *
 * Run with: `npx tsx scripts/npc-fw-pilot-trace.ts`
 */

import * as THREE from 'three';
import { NPCFixedWingPilot } from '../src/systems/vehicle/NPCFixedWingPilot';
import type { Mission } from '../src/systems/vehicle/NPCFixedWingPilot';
import { Airframe } from '../src/systems/vehicle/airframe/Airframe';
import {
  airframeConfigFromLegacy,
  airframeStateToFixedWingSnapshot,
} from '../src/systems/vehicle/FixedWingTypes';
import { FIXED_WING_CONFIGS } from '../src/systems/vehicle/FixedWingConfigs';
import { buildFixedWingPilotCommand } from '../src/systems/vehicle/FixedWingControlLaw';

const terrainH = 0;
const config = FIXED_WING_CONFIGS.A1_SKYRAIDER;
const startPos = new THREE.Vector3(0, terrainH + config.physics.gearClearance, 0);

const airframe = new Airframe(startPos.clone(), airframeConfigFromLegacy(config.physics));
const pilot = new NPCFixedWingPilot();

// Aircraft faces south (heading 180); waypoint is 2000m south of start so
// the pilot climbs straight ahead, flies over the waypoint, then RTB.
const mission: Mission = {
  kind: 'ferry',
  waypoints: [
    {
      position: new THREE.Vector3(0, 0, 2000),
      altitudeAGLm: 180,
      airspeedMs: 60,
      arrivalKind: 'flyby',
    },
  ],
  bingo: { fuelFraction: 0.1, ammoFraction: 0.05 },
  homeAirfield: { runwayStart: startPos.clone(), runwayHeading: Math.PI },
};
airframe.getQuaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
pilot.setMission(mission);

const normal = new THREE.Vector3(0, 1, 0);
const probe = {
  sample: () => ({ height: terrainH, normal }),
  sweep: (from: THREE.Vector3, to: THREE.Vector3) => {
    if (from.y >= terrainH && to.y < terrainH) {
      const t = (from.y - terrainH) / Math.max(from.y - to.y, 0.0001);
      const point = new THREE.Vector3().lerpVectors(from, to, t);
      point.y = terrainH;
      return { hit: true, point, normal };
    }
    return null;
  },
};

const dt = 1 / 60;
let lastState = pilot.getState();
// eslint-disable-next-line no-console
console.log(`t=0.00s state=${lastState}`);

for (let i = 0; i < 360 * 60; i++) {
  const snapshot = airframe.getState();
  const intent = pilot.update(dt, snapshot);
  if (!intent) break;
  if (pilot.getState() !== lastState) {
    lastState = pilot.getState();
    // eslint-disable-next-line no-console
    console.log(
      `t=${(i * dt).toFixed(2)}s state=${lastState} alt=${snapshot.altitudeAGL.toFixed(1)}m ias=${snapshot.forwardAirspeedMs.toFixed(1)}m/s pos=(${snapshot.position.x.toFixed(0)},${snapshot.position.z.toFixed(0)}) hdg=${snapshot.headingDeg.toFixed(0)}°`,
    );
  }
  const legacySnapshot = airframeStateToFixedWingSnapshot(snapshot);
  const cmd = buildFixedWingPilotCommand(
    legacySnapshot,
    config.physics,
    config.pilotProfile,
    intent,
    { positionX: snapshot.position.x, positionZ: snapshot.position.z },
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
  if (lastState === 'COLD' && i > 60) break; // landed back at COLD
}

const final = airframe.getState();
// eslint-disable-next-line no-console
console.log(
  `FINAL state=${pilot.getState()} alt=${final.altitudeAGL.toFixed(1)}m ias=${final.forwardAirspeedMs.toFixed(1)}m/s pos=(${final.position.x.toFixed(0)},${final.position.z.toFixed(0)}) WoW=${final.weightOnWheels}`,
);
// eslint-disable-next-line no-console
console.log(
  `Transitions (${pilot.getTransitionLog().length}):`,
  pilot.getTransitionLog().map((e) => `${e.from}->${e.to}@${e.missionTimeSec.toFixed(1)}s`).join(' | '),
);
