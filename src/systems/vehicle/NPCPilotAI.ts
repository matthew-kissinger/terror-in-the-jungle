import * as THREE from 'three';

export type PilotState = 'idle' | 'takeoff' | 'fly_to' | 'orbit' | 'attack_run' | 'rtb' | 'landing';

export interface PilotMission {
  waypoints: THREE.Vector3[];
  cruiseAltitude: number;       // meters above ground
  cruiseSpeed: number;          // m/s
  orbitPoint?: THREE.Vector3;   // center of orbit for 'orbit' state
  orbitRadius?: number;         // meters
  homePosition: THREE.Vector3;  // RTB destination
  attackTarget?: THREE.Vector3; // target for attack runs
}

export interface PilotControls {
  collective?: number;
  cyclicPitch?: number;
  cyclicRoll?: number;
  yaw?: number;
  autoHover?: boolean;
  engineBoost?: boolean;
}

// PD controller gains
const ALTITUDE_KP = 0.04;
const ALTITUDE_KD = 0.02;
const HEADING_KP = 2.0;
const HEADING_KD = 0.5;
const SPEED_KP = 0.015;
const TAKEOFF_ALTITUDE = 30;
const WAYPOINT_REACH_DIST = 50;
const LANDING_APPROACH_DIST = 30;
const _LANDING_DESCENT_RATE = 2.0;
const GROUNDED_THRESHOLD = 1.5;

const _toTarget = new THREE.Vector3();
const _euler = new THREE.Euler();

export class NPCPilotAI {
  private state: PilotState = 'idle';
  private mission: PilotMission | null = null;
  private currentWaypointIndex = 0;
  private orbitAngle = 0;
  private prevAltitudeError = 0;
  private prevHeadingError = 0;

  getState(): PilotState {
    return this.state;
  }

  setMission(mission: PilotMission): void {
    this.mission = mission;
    this.currentWaypointIndex = 0;
    this.orbitAngle = 0;
    this.state = 'takeoff';
  }

  clearMission(): void {
    this.mission = null;
    this.state = 'idle';
  }

  /**
   * Compute helicopter controls for this frame.
   * Returns partial HelicopterControls to pass to setControls().
   */
  update(
    dt: number,
    currentPosition: THREE.Vector3,
    currentVelocity: THREE.Vector3,
    currentQuaternion: THREE.Quaternion,
    terrainHeight: number,
  ): PilotControls {
    if (!this.mission || this.state === 'idle') {
      return { collective: 0, autoHover: true };
    }

    switch (this.state) {
      case 'takeoff':
        return this.updateTakeoff(dt, currentPosition, terrainHeight);
      case 'fly_to':
        return this.updateFlyTo(dt, currentPosition, currentVelocity, currentQuaternion, terrainHeight);
      case 'orbit':
        return this.updateOrbit(dt, currentPosition, currentVelocity, currentQuaternion, terrainHeight);
      case 'attack_run':
        return this.updateAttackRun(dt, currentPosition, currentVelocity, currentQuaternion, terrainHeight);
      case 'rtb':
        return this.updateRTB(dt, currentPosition, currentVelocity, currentQuaternion, terrainHeight);
      case 'landing':
        return this.updateLanding(dt, currentPosition, terrainHeight);
      default:
        return { collective: 0, autoHover: true };
    }
  }

  private updateTakeoff(_dt: number, pos: THREE.Vector3, terrainHeight: number): PilotControls {
    const targetAlt = terrainHeight + TAKEOFF_ALTITUDE;
    const altError = targetAlt - pos.y;

    if (altError < 2) {
      // Reached takeoff altitude, transition to fly_to or orbit
      if (this.mission!.waypoints.length > 0) {
        this.state = 'fly_to';
      } else if (this.mission!.orbitPoint) {
        this.state = 'orbit';
      } else {
        this.state = 'idle';
      }
    }

    const collective = THREE.MathUtils.clamp(0.5 + altError * ALTITUDE_KP, 0, 1);
    return { collective, cyclicPitch: 0, cyclicRoll: 0, yaw: 0, autoHover: true };
  }

  private updateFlyTo(
    dt: number, pos: THREE.Vector3, vel: THREE.Vector3,
    quat: THREE.Quaternion, terrainHeight: number
  ): PilotControls {
    const mission = this.mission!;
    if (this.currentWaypointIndex >= mission.waypoints.length) {
      // All waypoints reached
      if (mission.orbitPoint) {
        this.state = 'orbit';
      } else {
        this.state = 'rtb';
      }
      return { collective: 0.5, autoHover: true };
    }

    const waypoint = mission.waypoints[this.currentWaypointIndex];
    _toTarget.set(waypoint.x - pos.x, 0, waypoint.z - pos.z);
    const distXZ = _toTarget.length();

    if (distXZ < WAYPOINT_REACH_DIST) {
      this.currentWaypointIndex++;
      return this.updateFlyTo(dt, pos, vel, quat, terrainHeight);
    }

    return this.flyToward(dt, pos, vel, quat, terrainHeight, waypoint, mission.cruiseAltitude, mission.cruiseSpeed);
  }

  private updateOrbit(
    dt: number, pos: THREE.Vector3, vel: THREE.Vector3,
    quat: THREE.Quaternion, terrainHeight: number
  ): PilotControls {
    const mission = this.mission!;
    const center = mission.orbitPoint!;
    const radius = mission.orbitRadius ?? 150;
    const speed = mission.cruiseSpeed;

    // Advance orbit angle
    const angularSpeed = speed / radius;
    this.orbitAngle += angularSpeed * dt;

    // Target position on orbit circle
    const targetX = center.x + radius * Math.cos(this.orbitAngle);
    const targetZ = center.z + radius * Math.sin(this.orbitAngle);
    const orbitTarget = new THREE.Vector3(targetX, 0, targetZ);

    return this.flyToward(dt, pos, vel, quat, terrainHeight, orbitTarget, mission.cruiseAltitude, speed);
  }

  private updateAttackRun(
    dt: number, pos: THREE.Vector3, vel: THREE.Vector3,
    quat: THREE.Quaternion, terrainHeight: number
  ): PilotControls {
    const mission = this.mission!;
    const target = mission.attackTarget ?? mission.orbitPoint ?? pos;

    _toTarget.set(target.x - pos.x, 0, target.z - pos.z);
    const dist = _toTarget.length();

    if (dist < 50) {
      // Break off attack run
      if (mission.orbitPoint) {
        this.state = 'orbit';
      } else {
        this.state = 'rtb';
      }
    }

    return this.flyToward(dt, pos, vel, quat, terrainHeight, target, mission.cruiseAltitude, mission.cruiseSpeed);
  }

  private updateRTB(
    dt: number, pos: THREE.Vector3, vel: THREE.Vector3,
    quat: THREE.Quaternion, terrainHeight: number
  ): PilotControls {
    const mission = this.mission!;
    _toTarget.set(mission.homePosition.x - pos.x, 0, mission.homePosition.z - pos.z);
    const dist = _toTarget.length();

    if (dist < LANDING_APPROACH_DIST) {
      this.state = 'landing';
    }

    return this.flyToward(dt, pos, vel, quat, terrainHeight, mission.homePosition, mission.cruiseAltitude, mission.cruiseSpeed * 0.7);
  }

  private updateLanding(_dt: number, pos: THREE.Vector3, terrainHeight: number): PilotControls {
    const altAboveGround = pos.y - terrainHeight;

    if (altAboveGround < GROUNDED_THRESHOLD) {
      this.state = 'idle';
      this.mission = null;
      return { collective: 0, cyclicPitch: 0, cyclicRoll: 0, yaw: 0, autoHover: true };
    }

    // Descend at controlled rate
    const collective = THREE.MathUtils.clamp(0.45 + (altAboveGround - 5) * 0.005, 0.1, 0.5);
    return { collective, cyclicPitch: 0, cyclicRoll: 0, yaw: 0, autoHover: true };
  }

  /**
   * PD controller to fly toward a target position at given altitude and speed.
   */
  private flyToward(
    dt: number, pos: THREE.Vector3, vel: THREE.Vector3,
    quat: THREE.Quaternion, terrainHeight: number,
    target: THREE.Vector3, cruiseAltitude: number, targetSpeed: number,
  ): PilotControls {
    // Altitude PD controller
    const targetAlt = terrainHeight + cruiseAltitude;
    const altError = targetAlt - pos.y;
    const altErrorDeriv = (altError - this.prevAltitudeError) / Math.max(dt, 0.001);
    this.prevAltitudeError = altError;
    const collective = THREE.MathUtils.clamp(
      0.5 + altError * ALTITUDE_KP + altErrorDeriv * ALTITUDE_KD,
      0.1, 1.0
    );

    // Heading PD controller
    const desiredHeading = Math.atan2(target.x - pos.x, target.z - pos.z);
    _euler.setFromQuaternion(quat, 'YXZ');
    const currentHeading = _euler.y;

    let headingError = desiredHeading - currentHeading;
    // Normalize to [-PI, PI]
    while (headingError > Math.PI) headingError -= Math.PI * 2;
    while (headingError < -Math.PI) headingError += Math.PI * 2;

    const headingErrorDeriv = (headingError - this.prevHeadingError) / Math.max(dt, 0.001);
    this.prevHeadingError = headingError;
    const yaw = THREE.MathUtils.clamp(
      headingError * HEADING_KP + headingErrorDeriv * HEADING_KD,
      -1.0, 1.0
    );

    // Speed -> cyclic pitch
    const hSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    const speedError = targetSpeed - hSpeed;
    const cyclicPitch = THREE.MathUtils.clamp(speedError * SPEED_KP, -0.5, 0.5);

    return { collective, cyclicPitch, cyclicRoll: 0, yaw, autoHover: false };
  }
}
