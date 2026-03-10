import * as THREE from 'three';
import { NPCPilotAI, type PilotMission } from '../vehicle/NPCPilotAI';
import { FixedWingPhysics } from '../vehicle/FixedWingPhysics';
import type { FixedWingPhysicsConfig } from '../vehicle/FixedWingConfigs';
import { Logger } from '../../utils/Logger';

/**
 * Bridges NPCPilotAI (mission FSM) with FixedWingPhysics (flight model)
 * for physics-driven air support missions.
 *
 * Each frame:
 *   1. NPCPilotAI.update() produces PilotControls (collective, cyclicPitch, yaw)
 *   2. Controls are mapped to FixedWingPhysics inputs (throttle, pitch, yaw)
 *   3. FixedWingPhysics.update() integrates forces and position
 *   4. Aircraft mesh is synced to physics state
 */
export class NPCFlightController {
  private readonly pilotAI: NPCPilotAI;
  private readonly physics: FixedWingPhysics;
  private readonly aircraft: THREE.Group;

  constructor(
    aircraft: THREE.Group,
    startPosition: THREE.Vector3,
    physicsConfig: FixedWingPhysicsConfig,
  ) {
    this.aircraft = aircraft;
    this.pilotAI = new NPCPilotAI();
    this.physics = new FixedWingPhysics(startPosition, physicsConfig);
  }

  setMission(mission: PilotMission): void {
    this.pilotAI.setMission(mission);
    // Start with throttle up so the aircraft is already airborne
    this.physics.setControls({ throttle: 0.9 });
  }

  setWorldHalfExtent(halfExtent: number): void {
    this.physics.setWorldHalfExtent(halfExtent);
  }

  getState(): string {
    return this.pilotAI.getState();
  }

  getPosition(): THREE.Vector3 {
    return this.physics.getPosition();
  }

  getQuaternion(): THREE.Quaternion {
    return this.physics.getQuaternion();
  }

  getVelocity(): THREE.Vector3 {
    return this.physics.getVelocity();
  }

  /**
   * Update the pilot AI and physics, then sync the aircraft mesh.
   */
  update(dt: number, terrainHeight: number): void {
    const pos = this.physics.getPosition();
    const vel = this.physics.getVelocity();
    const quat = this.physics.getQuaternion();

    // Run pilot AI to get desired controls
    const pilotControls = this.pilotAI.update(dt, pos, vel, quat, terrainHeight);

    // Map helicopter-style PilotControls to fixed-wing controls
    // collective -> throttle (both 0-1 range for power)
    // cyclicPitch -> pitch (forward/back tilt)
    // yaw -> yaw (heading correction)
    this.physics.setControls({
      throttle: Math.max(pilotControls.collective ?? 0.5, 0.3), // minimum throttle to avoid stall
      pitch: -(pilotControls.cyclicPitch ?? 0), // inverted: positive cyclicPitch = nose down in heli = pitch up in plane
      roll: pilotControls.cyclicRoll ?? 0,
      yaw: pilotControls.yaw ?? 0,
    });

    // Step the physics simulation
    this.physics.update(dt, terrainHeight);

    // Sync aircraft mesh to physics state
    this.aircraft.position.copy(this.physics.getPosition());
    this.aircraft.quaternion.copy(this.physics.getQuaternion());
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
