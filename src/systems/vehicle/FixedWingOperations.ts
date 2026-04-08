import * as THREE from 'three';
import type { FixedWingControlPhase } from './FixedWingControlLaw';
import type { FixedWingConfig } from './FixedWingConfigs';
import type { FixedWingFlightSnapshot } from './FixedWingPhysics';

export type FixedWingOperationState =
  | 'parked'
  | 'stopped'
  | 'taxi'
  | 'lineup'
  | 'takeoff_roll'
  | 'rotation'
  | 'initial_climb'
  | 'cruise'
  | 'orbit_hold'
  | 'approach'
  | 'rollout';

export interface FixedWingRunwayStartWorld {
  id: string;
  position: THREE.Vector3;
  heading: number;
  holdShortPosition?: THREE.Vector3;
  shortFinalDistance: number;
  shortFinalAltitude: number;
}

export interface FixedWingSpawnMetadata {
  standId: string;
  taxiRoute: THREE.Vector3[];
  runwayStart?: FixedWingRunwayStartWorld;
}

export interface FixedWingExitStatus {
  canExit: boolean;
  message?: string;
}

const MIN_SAFE_GROUNDED_ALTITUDE = 0.6;

export function deriveFixedWingOperationState(
  snapshot: Pick<FixedWingFlightSnapshot, 'phase' | 'airspeed' | 'altitudeAGL' | 'weightOnWheels'>,
  controlPhase: FixedWingControlPhase,
  config: FixedWingConfig,
  options?: {
    orbitHoldEnabled?: boolean;
    lineupActive?: boolean;
  },
): FixedWingOperationState {
  if (options?.orbitHoldEnabled && !snapshot.weightOnWheels) {
    return 'orbit_hold';
  }

  if (controlPhase === 'landing_rollout') {
    if (snapshot.airspeed <= config.operation.stoppedSpeedMax) {
      return 'stopped';
    }
    return 'rollout';
  }

  if (snapshot.weightOnWheels) {
    if (options?.lineupActive && snapshot.airspeed <= config.operation.taxiSpeedMax) {
      return 'lineup';
    }
    if (snapshot.phase === 'parked') {
      return 'parked';
    }
    if (snapshot.airspeed <= config.operation.stoppedSpeedMax) {
      return 'stopped';
    }
  }

  switch (controlPhase) {
    case 'taxi':
      return snapshot.airspeed <= config.operation.stoppedSpeedMax ? 'stopped' : 'taxi';
    case 'takeoff_roll':
      return 'takeoff_roll';
    case 'rotation':
      return 'rotation';
    case 'initial_climb':
      return 'initial_climb';
    case 'approach':
      return 'approach';
    case 'flight':
    default:
      return snapshot.weightOnWheels ? 'taxi' : 'cruise';
  }
}

export function getFixedWingExitStatus(
  snapshot: Pick<FixedWingFlightSnapshot, 'weightOnWheels' | 'airspeed' | 'altitudeAGL'>,
  config: FixedWingConfig,
): FixedWingExitStatus {
  if (!snapshot.weightOnWheels) {
    return { canExit: false, message: 'Aircraft must be on the ground before exit.' };
  }
  if (snapshot.altitudeAGL > MIN_SAFE_GROUNDED_ALTITUDE) {
    return { canExit: false, message: 'Aircraft is not settled on the ground yet.' };
  }
  if (snapshot.airspeed > config.operation.exitSpeedMax) {
    return {
      canExit: false,
      message: `Slow below ${Math.round(config.operation.exitSpeedMax)} m/s before exit.`,
    };
  }
  return { canExit: true };
}

export function buildOrbitAnchorFromHeading(
  position: THREE.Vector3,
  headingRad: number,
  radius: number,
  direction: -1 | 1,
): { centerX: number; centerZ: number } {
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), headingRad);
  const leftVector = new THREE.Vector3(-1, 0, 0).applyQuaternion(rotation);
  const lateralScale = direction === -1 ? 1 : -1;
  return {
    centerX: position.x + leftVector.x * radius * lateralScale,
    centerZ: position.z + leftVector.z * radius * lateralScale,
  };
}
