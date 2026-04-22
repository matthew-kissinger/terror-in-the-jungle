/**
 * NPC fixed-wing pilot. State-machine pilot that produces
 * `FixedWingPilotIntent` each tick from the airframe's `AirframeState`.
 * Source-agnostic: used both by `FixedWingModel` (for aircraft in its
 * catalog) and by the transient `NPCFlightController` (air-support sorties).
 * Parallel to `NPCPilotAI` (helicopter) — not an extension.
 */

import type { AirframeState } from './airframe/types';
import type { FixedWingPilotIntent } from './FixedWingControlLaw';
import { stepState, type StateContext } from './npcPilot/states';
import {
  DEFAULT_NPC_PILOT_CONFIG,
  type Mission,
  type NPCFixedWingPilotConfig,
  type PilotResourceState,
  type PilotState,
  type TerrainProbe,
} from './npcPilot/types';

export class NPCFixedWingPilot {
  private state: PilotState = 'COLD';
  private mission: Mission | null = null;
  private waypointIndex = 0;
  private timeInStateSec = 0;
  private missionElapsedSec = 0;
  private resources: PilotResourceState = {
    fuelFraction: 1.0,
    ammoFraction: 1.0,
    destroyed: false,
  };
  private readonly config: NPCFixedWingPilotConfig;
  private readonly terrain: TerrainProbe | null;
  /** Bounded transition log for debug / playtest evidence. */
  private readonly transitionLog: Array<{ from: PilotState; to: PilotState; missionTimeSec: number }> = [];
  private static readonly TRANSITION_LOG_CAP = 64;

  constructor(
    config: NPCFixedWingPilotConfig = DEFAULT_NPC_PILOT_CONFIG,
    terrain: TerrainProbe | null = null,
  ) {
    this.config = config;
    this.terrain = terrain;
  }

  setMission(mission: Mission): void {
    this.mission = mission;
    this.waypointIndex = 0;
    this.timeInStateSec = 0;
    this.missionElapsedSec = 0;
    this.transitionTo('COLD');
  }

  clearMission(): void {
    this.mission = null;
    this.transitionTo('COLD');
  }

  setResources(resources: Partial<PilotResourceState>): void {
    this.resources = { ...this.resources, ...resources };
  }

  markDestroyed(): void {
    this.resources = { ...this.resources, destroyed: true };
  }

  getState(): PilotState {
    return this.state;
  }

  getMission(): Mission | null {
    return this.mission;
  }

  getWaypointIndex(): number {
    return this.waypointIndex;
  }

  getTransitionLog(): ReadonlyArray<{ from: PilotState; to: PilotState; missionTimeSec: number }> {
    return this.transitionLog;
  }

  /** Compute the pilot intent for this tick, or null if no mission is set. */
  update(dt: number, airframe: AirframeState): FixedWingPilotIntent | null {
    if (!this.mission) {
      return null;
    }
    this.timeInStateSec += dt;
    this.missionElapsedSec += dt;

    const groundElevationM = this.terrain?.getHeightAt(airframe.position.x, airframe.position.z)
      ?? (airframe.altitude - airframe.altitudeAGL);

    const ctx: StateContext = {
      airframe,
      mission: this.mission,
      config: this.config,
      resources: this.resources,
      waypointIndex: this.waypointIndex,
      timeInStateSec: this.timeInStateSec,
      missionElapsedSec: this.missionElapsedSec,
      groundElevationM,
    };

    const step = stepState(this.state, ctx);

    if (step.waypointAdvance !== 0) {
      this.waypointIndex = Math.min(
        this.waypointIndex + step.waypointAdvance,
        this.mission.waypoints.length,
      );
    }

    if (step.nextState !== this.state) {
      this.transitionTo(step.nextState);
    } else if (step.resetTimeInState) {
      this.timeInStateSec = 0;
    }

    return step.intent;
  }

  private transitionTo(next: PilotState): void {
    if (this.state === next) return;
    this.transitionLog.push({
      from: this.state,
      to: next,
      missionTimeSec: this.missionElapsedSec,
    });
    if (this.transitionLog.length > NPCFixedWingPilot.TRANSITION_LOG_CAP) {
      this.transitionLog.shift();
    }
    this.state = next;
    this.timeInStateSec = 0;
  }
}

export type { Mission, PilotState, TerrainProbe } from './npcPilot/types';
