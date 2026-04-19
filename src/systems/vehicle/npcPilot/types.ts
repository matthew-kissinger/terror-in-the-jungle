/**
 * Types for the NPC fixed-wing pilot state machine. `Mission` is the
 * declarative, FlightGear-inspired input the pilot consumes; `PilotState`
 * enumerates the explicit states the state machine can occupy.
 */

import type * as THREE from 'three';

export type PilotState =
  | 'COLD'
  | 'TAXI'
  | 'TAKEOFF_ROLL'
  | 'CLIMB'
  | 'CRUISE_TO_WP'
  | 'ATTACK_SETUP'
  | 'ATTACK_RUN'
  | 'BREAKAWAY'
  | 'REATTACK_DECISION'
  | 'ORBIT'
  | 'RTB'
  | 'APPROACH'
  | 'LANDING'
  | 'DEAD';

export type MissionKind = 'ferry' | 'attack' | 'orbit' | 'patrol';

export interface Waypoint {
  position: THREE.Vector3;
  altitudeAGLm: number;
  airspeedMs: number;
  /** `flyby` advances to the next waypoint; `orbit`/`attack` forces a state change. */
  arrivalKind: 'flyby' | 'orbit' | 'attack';
}

export interface MissionTarget {
  position: THREE.Vector3;
  /** AGL at which ATTACK_RUN terminates into BREAKAWAY. */
  minAttackAltM: number;
}

export interface MissionBingo {
  /** Fuel fraction at which RTB triggers. */
  fuelFraction: number;
  /** Ammo fraction at which RTB triggers. */
  ammoFraction: number;
}

export interface MissionHomeAirfield {
  runwayStart: THREE.Vector3;
  runwayHeading: number;
}

export interface Mission {
  readonly kind: MissionKind;
  readonly waypoints: ReadonlyArray<Waypoint>;
  readonly target?: MissionTarget;
  readonly bingo: MissionBingo;
  readonly homeAirfield: MissionHomeAirfield;
  /** Seconds before a pure-orbit mission triggers RTB. 0/undefined = until bingo. */
  readonly orbitDurationSec?: number;
  /** Orbit circle radius (meters). Defaults to 300 when omitted. */
  readonly orbitRadiusM?: number;
}

/** Resource state the pilot reads as normalized fractions. Destruction is binary. */
export interface PilotResourceState {
  fuelFraction: number;
  ammoFraction: number;
  destroyed: boolean;
}

export interface TerrainProbe {
  getHeightAt(x: number, z: number): number;
}

export interface NPCFixedWingPilotConfig {
  readonly takeoffRotationAirspeedMs: number;
  readonly cruiseAltitudeAGLm: number;
  readonly cruiseAirspeedMs: number;
  readonly waypointReachedM: number;
  readonly approachCaptureM: number;
  readonly minSafeAGLm: number;
  readonly approachAirspeedMs: number;
}

export const DEFAULT_NPC_PILOT_CONFIG: NPCFixedWingPilotConfig = {
  takeoffRotationAirspeedMs: 40,
  cruiseAltitudeAGLm: 180,
  // 48 m/s sits near the A-1 Skyraider's natural level-flight airspeed
  // (roughly sqrt(weight/(0.5*rho*wingArea*cl0)) with the tuned cl0 of 1.55).
  // The airspeed PD runs throttle at its idle floor at this speed, which
  // keeps excess lift from ballooning altitude away from the target.
  // Aircraft with different aerodynamic characteristics will need their own
  // config (future work; not in scope for v1).
  cruiseAirspeedMs: 48,
  waypointReachedM: 120,
  approachCaptureM: 400,
  minSafeAGLm: 80,
  approachAirspeedMs: 46,
};
