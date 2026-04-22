import * as THREE from 'three';
import { NPCFixedWingPilot } from '../vehicle/NPCFixedWingPilot';
import type { Mission } from '../vehicle/NPCFixedWingPilot';
import { Airframe } from '../vehicle/airframe/Airframe';
import type { AirframeIntent, AirframeTerrainProbe } from '../vehicle/airframe/types';
import type { FixedWingPhysicsConfig } from '../vehicle/FixedWingConfigs';
import { airframeConfigFromLegacy } from '../vehicle/FixedWingTypes';
import { Logger } from '../../utils/Logger';

/**
 * Air-support variant of the NPC pilot bridge. Owns a single transient
 * aircraft and runs a fixed-wing `NPCFixedWingPilot` against a caller-
 * supplied mission. Used by `AirSupportManager` for one-off gunship / attack
 * / recon sorties. Persistent world-owned aircraft use
 * `FixedWingModel.attachNPCPilot()` instead.
 *
 * The public `PilotMission` shape is kept stable for callers; we translate
 * it into the fixed-wing `Mission` internally.
 */

interface PilotMission {
  waypoints: THREE.Vector3[];
  cruiseAltitude: number;
  cruiseSpeed: number;
  orbitPoint?: THREE.Vector3;
  orbitRadius?: number;
  homePosition: THREE.Vector3;
  attackTarget?: THREE.Vector3;
}

export class NPCFlightController {
  private readonly pilot: NPCFixedWingPilot;
  private readonly airframe: Airframe;
  private readonly aircraft: THREE.Group;
  /** Persisted across frames so setMission() can prime throttle pre-first-tick. */
  private intent: AirframeIntent = {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttle: 0,
    brake: 0,
    tier: 'raw',
  };
  /** True once a mission has been set; until then the airframe drifts. */
  private missionActive = false;

  constructor(
    aircraft: THREE.Group,
    startPosition: THREE.Vector3,
    physicsConfig: FixedWingPhysicsConfig,
  ) {
    this.aircraft = aircraft;
    this.pilot = new NPCFixedWingPilot();
    this.airframe = new Airframe(startPosition, airframeConfigFromLegacy(physicsConfig));
    // AirSupportManager spawns the aircraft airborne; mark WoW false so
    // the airframe integrates airborne physics straight away.
    const forwardSpeed = 60; // plausible cruise; pilot's PD reels it in.
    this.airframe.resetAirborne(startPosition, this.airframe.getQuaternion(), forwardSpeed);
  }

  setMission(legacy: PilotMission): void {
    const mission = legacyToFixedWingMission(legacy);
    this.pilot.setMission(mission);
    // Pilot starts cold by design; air-support callers expect the aircraft to
    // already be flying, so skip straight to cruise and prime throttle.
    this.intent.throttle = 0.9;
    this.missionActive = true;
  }

  setWorldHalfExtent(halfExtent: number): void {
    this.airframe.setWorldHalfExtent(halfExtent);
  }

  getState(): string {
    return this.pilot.getState();
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

  update(dt: number, terrainHeight: number): void {
    // Run the pilot state machine against the latest airframe observation.
    const snapshot = this.airframe.getState();
    const intent = this.missionActive ? this.pilot.update(dt, snapshot) : null;

    if (intent) {
      // Map FixedWingPilotIntent (pitch/bank/yaw) onto AirframeIntent.
      this.intent.pitch = intent.pitchIntent;
      this.intent.roll = intent.bankIntent;
      this.intent.yaw = intent.yawIntent;
      this.intent.throttle = intent.throttleTarget;
      this.intent.brake = intent.brake;
      this.intent.tier = intent.assistEnabled ? 'assist' : 'raw';
    }

    this.airframe.step(this.intent, makeStaticTerrainProbe(terrainHeight), dt);

    this.aircraft.position.copy(this.airframe.getPosition());
    this.aircraft.quaternion.copy(this.airframe.getQuaternion());
  }

  /**
   * Check if the pilot has landed / terminated its mission.
   * The pilot uses 'COLD' for both parked-never-started and
   * parked-after-landing; for the air-support case, a mission is complete
   * only if the pilot has transitioned to LANDING/DEAD or has passed through
   * at least one non-COLD state and returned to COLD (i.e. actually landed).
   */
  isMissionComplete(): boolean {
    if (!this.missionActive) return true;
    const state = this.pilot.getState();
    if (state === 'DEAD') return true;
    // Only treat COLD as complete if the pilot has logged any transitions
    // since setMission (a completed sortie logs COLD→TAXI→... →LANDING→COLD).
    const log = this.pilot.getTransitionLog();
    if (state === 'COLD' && log.length > 1) return true;
    return false;
  }

  dispose(): void {
    this.pilot.clearMission();
    this.missionActive = false;
  }
}

/**
 * Map a helicopter-style `PilotMission` to the fixed-wing pilot's `Mission`.
 * Waypoints become fly-by; orbitPoint → orbit target; attackTarget → attack
 * target; homePosition → home runway start.
 */
function legacyToFixedWingMission(legacy: PilotMission): Mission {
  const waypoints = legacy.waypoints.map((wp) => ({
    position: wp.clone(),
    altitudeAGLm: legacy.cruiseAltitude,
    airspeedMs: legacy.cruiseSpeed,
    arrivalKind: 'flyby' as const,
  }));

  let kind: Mission['kind'] = 'ferry';
  let targetPos: THREE.Vector3 | null = null;
  let minAttackAlt = 80;

  if (legacy.orbitPoint) {
    kind = 'orbit';
    targetPos = legacy.orbitPoint.clone();
    minAttackAlt = 120;
  } else if (legacy.attackTarget) {
    kind = 'attack';
    targetPos = legacy.attackTarget.clone();
    minAttackAlt = 80;
  }

  return {
    kind,
    waypoints,
    target: targetPos
      ? { position: targetPos, minAttackAltM: minAttackAlt }
      : undefined,
    bingo: { fuelFraction: 0.1, ammoFraction: 0.05 },
    homeAirfield: {
      runwayStart: legacy.homePosition.clone(),
      runwayHeading: 0,
    },
    orbitRadiusM: legacy.orbitRadius,
  };
}

/** Build a `PilotMission` from air support parameters. */
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
