import * as THREE from 'three';
import { NPCPilotAI, type PilotMission } from '../vehicle/NPCPilotAI';
import { Airframe } from '../vehicle/airframe/Airframe';
import type { AirframeIntent, AirframeTerrainProbe } from '../vehicle/airframe/types';
import type { FixedWingPhysicsConfig } from '../vehicle/FixedWingConfigs';
import { airframeConfigFromLegacy } from '../vehicle/FixedWingTypes';
import { Logger } from '../../utils/Logger';

/**
 * Bridges NPCPilotAI (mission FSM) with the unified Airframe sim for
 * physics-driven air support missions.
 *
 * Each frame:
 *   1. NPCPilotAI.update() produces PilotControls (collective, cyclicPitch, yaw)
 *   2. Controls are mapped to an AirframeIntent (throttle, pitch, roll, yaw)
 *   3. Airframe.step() integrates forces and position using a flat-slab probe
 *      built from the supplied terrain height
 *   4. Aircraft mesh is synced to airframe state
 *
 * Minimum throttle clamp: NPC missions expect the aircraft to stay airborne
 * for the whole arrival / orbit phase. The pilot-AI collective is clamped to
 * a floor (0.3) so the sim never drops the throttle to zero and stalls into
 * the ground mid-mission.
 */
export class NPCFlightController {
  private readonly pilotAI: NPCPilotAI;
  private readonly airframe: Airframe;
  private readonly aircraft: THREE.Group;
  /**
   * Last intent fed to the airframe. Persisted across frames so setMission()
   * can prime throttle before the first pilot-AI update runs.
   */
  private intent: AirframeIntent = {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttle: 0,
    brake: 0,
    tier: 'raw',
  };

  constructor(
    aircraft: THREE.Group,
    startPosition: THREE.Vector3,
    physicsConfig: FixedWingPhysicsConfig,
  ) {
    this.aircraft = aircraft;
    this.pilotAI = new NPCPilotAI();
    this.airframe = new Airframe(startPosition, airframeConfigFromLegacy(physicsConfig));
  }

  setMission(mission: PilotMission): void {
    this.pilotAI.setMission(mission);
    // Start with throttle up so the aircraft is already airborne
    this.intent.throttle = 0.9;
  }

  setWorldHalfExtent(halfExtent: number): void {
    this.airframe.setWorldHalfExtent(halfExtent);
  }

  getState(): string {
    return this.pilotAI.getState();
  }

  getPosition(): THREE.Vector3 {
    return this.airframe.getPosition();
  }

  getQuaternion(): THREE.Quaternion {
    return this.airframe.getQuaternion();
  }

  getVelocity(): THREE.Vector3 {
    return this.airframe.getVelocity();
  }

  /**
   * Update the pilot AI and airframe, then sync the aircraft mesh.
   */
  update(dt: number, terrainHeight: number): void {
    const pos = this.airframe.getPosition();
    const vel = this.airframe.getVelocity();
    const quat = this.airframe.getQuaternion();

    // Run pilot AI to get desired controls
    const pilotControls = this.pilotAI.update(dt, pos, vel, quat, terrainHeight);

    // Map helicopter-style PilotControls to fixed-wing airframe intent.
    //   collective  -> throttle  (both 0..1 range for power)
    //   cyclicPitch -> pitch     (sign inverted: positive cyclicPitch = nose
    //                             down in heli, we want pitch-up in plane)
    //   cyclicRoll  -> roll      (direct)
    //   yaw         -> yaw       (heading correction)
    this.intent.throttle = Math.max(pilotControls.collective ?? 0.5, 0.3);
    this.intent.pitch = -(pilotControls.cyclicPitch ?? 0);
    this.intent.roll = pilotControls.cyclicRoll ?? 0;
    this.intent.yaw = pilotControls.yaw ?? 0;
    this.intent.brake = 0;
    this.intent.tier = 'raw';

    // Step the airframe with a flat-slab probe at the caller-supplied ground
    // height. Same terrain contract the old fixed-wing shim exposed: one
    // constant height fed for both sample and sweep.
    this.airframe.step(this.intent, makeStaticTerrainProbe(terrainHeight), dt);

    // Sync aircraft mesh to airframe state
    this.aircraft.position.copy(this.airframe.getPosition());
    this.aircraft.quaternion.copy(this.airframe.getQuaternion());
  }

  /**
   * Check if the pilot AI has completed its mission (returned to idle).
   */
  isMissionComplete(): boolean {
    return this.pilotAI.getState() === 'idle';
  }

  dispose(): void {
    this.pilotAI.clearMission();
  }
}

/**
 * Build a PilotMission from air support parameters.
 */
export function buildAirSupportMission(
  targetPosition: THREE.Vector3,
  approachDirection: THREE.Vector3,
  altitude: number,
  speed: number,
  missionType: 'orbit' | 'attack_run' | 'flyover',
  homePosition?: THREE.Vector3,
): PilotMission {
  const approach = approachDirection.clone().normalize();
  const approachDist = 500;
  const startPos = targetPosition.clone()
    .addScaledVector(approach, -approachDist);

  const home = homePosition ?? startPos.clone();

  const mission: PilotMission = {
    waypoints: [targetPosition.clone()],
    cruiseAltitude: altitude,
    cruiseSpeed: speed,
    homePosition: home,
  };

  if (missionType === 'orbit') {
    mission.orbitPoint = targetPosition.clone();
    mission.orbitRadius = 200;
  } else if (missionType === 'attack_run') {
    mission.attackTarget = targetPosition.clone();
  }

  Logger.debug('air-support', `Built ${missionType} mission: alt=${altitude}m, speed=${speed}m/s`);
  return mission;
}

function makeStaticTerrainProbe(height: number): AirframeTerrainProbe {
  const normal = new THREE.Vector3(0, 1, 0);
  return {
    sample() {
      return { height, normal };
    },
    sweep(from: THREE.Vector3, to: THREE.Vector3) {
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
