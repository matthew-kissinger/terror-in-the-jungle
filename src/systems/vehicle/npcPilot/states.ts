/**
 * Per-state update logic for the NPC fixed-wing pilot state machine.
 *
 * Each state's `update()` is a pure function that reads an observation bundle
 * (AirframeState + Mission + resources) and returns a `StateStep` — the
 * current-tick `FixedWingPilotIntent` plus the pilot's next state.
 *
 * Transitions are observation-driven: no timers beyond what falls out of the
 * airspeed/altitude observations. The single non-deterministic branch is
 * REATTACK_DECISION, which is a utility score threshold in v1.
 */

import * as THREE from 'three';
import type { FixedWingPilotIntent } from '../FixedWingControlLaw';
import { createIdleFixedWingPilotIntent } from '../FixedWingControlLaw';
import type { AirframeState } from '../airframe/types';
import {
  airspeedHold,
  altitudeHold,
  coordinatedYaw,
  headingHold,
  headingToTargetDeg,
  horizontalDistance,
} from './pdControllers';
import type {
  Mission,
  NPCFixedWingPilotConfig,
  PilotResourceState,
  PilotState,
  Waypoint,
} from './types';

export interface StateContext {
  readonly airframe: AirframeState;
  readonly mission: Mission;
  readonly config: NPCFixedWingPilotConfig;
  readonly resources: PilotResourceState;
  readonly waypointIndex: number;
  readonly timeInStateSec: number;
  readonly missionElapsedSec: number;
  readonly groundElevationM: number;
}

interface StateStep {
  readonly intent: FixedWingPilotIntent;
  readonly nextState: PilotState;
  readonly waypointAdvance: number;
  readonly resetTimeInState: boolean;
}

function baseIntent(): FixedWingPilotIntent {
  return createIdleFixedWingPilotIntent();
}

function isBingo(ctx: StateContext): boolean {
  return (
    ctx.resources.fuelFraction <= ctx.mission.bingo.fuelFraction
    || ctx.resources.ammoFraction <= ctx.mission.bingo.ammoFraction
  );
}

function currentWaypoint(ctx: StateContext): Waypoint | null {
  const wps = ctx.mission.waypoints;
  if (wps.length === 0 || ctx.waypointIndex >= wps.length) return null;
  return wps[ctx.waypointIndex];
}

/**
 * Terrain-aware cruise flight: fly toward (targetX, targetZ) while holding a
 * minimum AGL. Used by CRUISE_TO_WP, ATTACK_SETUP/RUN, RTB, APPROACH, ORBIT.
 */
function flyToward(
  ctx: StateContext,
  targetX: number,
  targetZ: number,
  targetAltitudeAGL: number,
  targetAirspeedMs: number,
  minSafeAGLm: number,
): FixedWingPilotIntent {
  const s = ctx.airframe;
  const desiredHeadingDeg = headingToTargetDeg(targetX - s.position.x, targetZ - s.position.z);
  // Terrain-safety floor: never command a descent into rising ground.
  const safeAGL = Math.max(targetAltitudeAGL, minSafeAGLm);
  const intent = baseIntent();
  intent.pitchIntent = altitudeHold(safeAGL, s.altitudeAGL, s.verticalSpeedMs, s.pitchRateDeg);
  intent.bankIntent = headingHold(desiredHeadingDeg, s.headingDeg, s.rollDeg, s.rollRateDeg);
  intent.yawIntent = coordinatedYaw(s.rollDeg);
  intent.throttleTarget = airspeedHold(targetAirspeedMs, s.forwardAirspeedMs);
  intent.assistEnabled = true;
  intent.pilotMode = 'assisted';
  return intent;
}

function flyToHome(ctx: StateContext): FixedWingPilotIntent {
  const home = ctx.mission.homeAirfield.runwayStart;
  return flyToward(
    ctx,
    home.x,
    home.z,
    ctx.config.cruiseAltitudeAGLm,
    ctx.config.cruiseAirspeedMs,
    ctx.config.minSafeAGLm,
  );
}

function flyOrbit(ctx: StateContext): FixedWingPilotIntent {
  const tgt = ctx.mission.target;
  if (!tgt) return flyToHome(ctx);
  const radius = ctx.mission.orbitRadiusM ?? 300;
  // Left-hand orbit: advance along the orbit circle by a fixed angle step.
  const dx = ctx.airframe.position.x - tgt.position.x;
  const dz = ctx.airframe.position.z - tgt.position.z;
  const currentAngle = Math.atan2(dx, -dz);
  const angleAhead = currentAngle - 0.35;
  const aheadX = tgt.position.x + Math.sin(angleAhead) * radius;
  const aheadZ = tgt.position.z + -Math.cos(angleAhead) * radius;
  return flyToward(
    ctx,
    aheadX,
    aheadZ,
    ctx.config.cruiseAltitudeAGLm,
    ctx.config.cruiseAirspeedMs,
    ctx.config.minSafeAGLm,
  );
}

// ── State handlers ──────────────────────────────────────────────────────────

function updateCold(_ctx: StateContext): StateStep {
  const intent = baseIntent();
  intent.throttleTarget = 0;
  intent.brake = 1;
  return { intent, nextState: 'TAXI', waypointAdvance: 0, resetTimeInState: true };
}

// TAXI is a placeholder for future real-taxi logic. v1 spools engines
// briefly and commits straight to TAKEOFF_ROLL.
function updateTaxi(ctx: StateContext): StateStep {
  const intent = baseIntent();
  intent.throttleTarget = 0.35;
  intent.brake = 0;
  const commit = ctx.timeInStateSec > 0.4;
  return {
    intent,
    nextState: commit ? 'TAKEOFF_ROLL' : 'TAXI',
    waypointAdvance: 0,
    resetTimeInState: commit,
  };
}

function updateTakeoffRoll(ctx: StateContext): StateStep {
  const s = ctx.airframe;
  const intent = baseIntent();
  intent.throttleTarget = 1.0;
  intent.brake = 0;
  // Mild back pressure so the Airframe's rotation gate fires. The Airframe
  // clamps ground-pitch itself; we only indicate intent.
  intent.pitchIntent = 0.35;
  intent.assistEnabled = false;
  intent.pilotMode = 'assisted';
  const commit = !s.weightOnWheels && s.forwardAirspeedMs >= ctx.config.takeoffRotationAirspeedMs;
  return {
    intent,
    nextState: commit ? 'CLIMB' : 'TAKEOFF_ROLL',
    waypointAdvance: 0,
    resetTimeInState: commit,
  };
}

function updateClimb(ctx: StateContext): StateStep {
  const s = ctx.airframe;
  const climbTarget = ctx.config.cruiseAltitudeAGLm;
  const headingRad = THREE.MathUtils.degToRad(s.headingDeg);
  const intent = flyToward(
    ctx,
    s.position.x + Math.sin(headingRad) * 2000,
    s.position.z - Math.cos(headingRad) * 2000,
    climbTarget,
    ctx.config.cruiseAirspeedMs,
    ctx.config.minSafeAGLm,
  );
  // Extra pitch authority below cruise AGL — flyToward's PD alone is slow
  // to climb at the gentle gains we use in cruise.
  if (s.altitudeAGL < climbTarget - 10) {
    intent.pitchIntent = 0.4;
    intent.throttleTarget = 1.0;
  }
  const atCruiseAGL = s.altitudeAGL >= climbTarget - 10;
  return {
    intent,
    nextState: atCruiseAGL ? 'CRUISE_TO_WP' : 'CLIMB',
    waypointAdvance: 0,
    resetTimeInState: atCruiseAGL,
  };
}

function updateCruise(ctx: StateContext): StateStep {
  const s = ctx.airframe;
  if (isBingo(ctx)) {
    return { intent: flyToHome(ctx), nextState: 'RTB', waypointAdvance: 0, resetTimeInState: true };
  }
  const wp = currentWaypoint(ctx);
  if (!wp) {
    if (ctx.mission.kind === 'orbit' && ctx.mission.target) {
      return { intent: flyOrbit(ctx), nextState: 'ORBIT', waypointAdvance: 0, resetTimeInState: true };
    }
    return { intent: flyToHome(ctx), nextState: 'RTB', waypointAdvance: 0, resetTimeInState: true };
  }
  const intent = flyToward(ctx, wp.position.x, wp.position.z, wp.altitudeAGLm, wp.airspeedMs, ctx.config.minSafeAGLm);
  const dist = horizontalDistance(s.position.x, s.position.z, wp.position.x, wp.position.z);
  if (dist >= ctx.config.waypointReachedM) {
    return { intent, nextState: 'CRUISE_TO_WP', waypointAdvance: 0, resetTimeInState: false };
  }
  switch (wp.arrivalKind) {
    case 'attack':
      return { intent, nextState: 'ATTACK_SETUP', waypointAdvance: 1, resetTimeInState: true };
    case 'orbit':
      return { intent, nextState: 'ORBIT', waypointAdvance: 1, resetTimeInState: true };
    case 'flyby':
    default:
      return { intent, nextState: 'CRUISE_TO_WP', waypointAdvance: 1, resetTimeInState: false };
  }
}

function updateAttackSetup(ctx: StateContext): StateStep {
  const tgt = ctx.mission.target;
  if (!tgt) {
    return { intent: flyToHome(ctx), nextState: 'RTB', waypointAdvance: 0, resetTimeInState: true };
  }
  const patternAltAGL = Math.max(tgt.minAttackAltM + 120, ctx.config.minSafeAGLm);
  const intent = flyToward(ctx, tgt.position.x, tgt.position.z, patternAltAGL, ctx.config.cruiseAirspeedMs, ctx.config.minSafeAGLm);
  const s = ctx.airframe;
  const dist = horizontalDistance(s.position.x, s.position.z, tgt.position.x, tgt.position.z);
  const aligned = Math.abs(deltaHeadingDeg(
    headingToTargetDeg(tgt.position.x - s.position.x, tgt.position.z - s.position.z),
    s.headingDeg,
  )) < 20;
  const runIn = dist < 900 && aligned;
  return {
    intent,
    nextState: runIn ? 'ATTACK_RUN' : 'ATTACK_SETUP',
    waypointAdvance: 0,
    resetTimeInState: runIn,
  };
}

function updateAttackRun(ctx: StateContext): StateStep {
  const tgt = ctx.mission.target;
  if (!tgt) {
    return { intent: flyToHome(ctx), nextState: 'RTB', waypointAdvance: 0, resetTimeInState: true };
  }
  const intent = flyToward(
    ctx,
    tgt.position.x,
    tgt.position.z,
    tgt.minAttackAltM,
    ctx.config.cruiseAirspeedMs * 1.1,
    tgt.minAttackAltM, // never clip terrain during run-in
  );
  const breakoff = ctx.airframe.altitudeAGL <= tgt.minAttackAltM + 10;
  return {
    intent,
    nextState: breakoff ? 'BREAKAWAY' : 'ATTACK_RUN',
    waypointAdvance: 0,
    resetTimeInState: breakoff,
  };
}

function updateBreakaway(ctx: StateContext): StateStep {
  const tgt = ctx.mission.target;
  const s = ctx.airframe;
  if (!tgt) {
    return { intent: flyToHome(ctx), nextState: 'RTB', waypointAdvance: 0, resetTimeInState: true };
  }
  // Fly 1200m ahead in the current heading.
  const headingRad = (s.headingDeg * Math.PI) / 180;
  const escapeX = s.position.x + Math.sin(headingRad) * 1200;
  const escapeZ = s.position.z - Math.cos(headingRad) * 1200;
  const intent = flyToward(
    ctx,
    escapeX,
    escapeZ,
    ctx.config.cruiseAltitudeAGLm,
    ctx.config.cruiseAirspeedMs,
    ctx.config.minSafeAGLm,
  );
  const safe = s.altitudeAGL >= ctx.config.minSafeAGLm
    && horizontalDistance(s.position.x, s.position.z, tgt.position.x, tgt.position.z) > 900;
  return {
    intent,
    nextState: safe ? 'REATTACK_DECISION' : 'BREAKAWAY',
    waypointAdvance: 0,
    resetTimeInState: safe,
  };
}

/**
 * REATTACK_DECISION — single utility-scored branch in v1. Score weights ammo
 * and fuel; bingo is a hard gate. Score > 0.5 → ATTACK_SETUP; else RTB.
 */
function updateReattackDecision(ctx: StateContext): StateStep {
  if (isBingo(ctx)) {
    return { intent: flyToHome(ctx), nextState: 'RTB', waypointAdvance: 0, resetTimeInState: true };
  }
  const reattack = reattackScore(ctx.resources) > 0.5;
  // Single-tick branch — the transition fires next tick with its own PD.
  return {
    intent: flyToHome(ctx),
    nextState: reattack ? 'ATTACK_SETUP' : 'RTB',
    waypointAdvance: 0,
    resetTimeInState: true,
  };
}

function reattackScore(resources: PilotResourceState): number {
  const ammoWeight = 0.6;
  const fuelWeight = 0.4;
  return resources.ammoFraction * ammoWeight + resources.fuelFraction * fuelWeight;
}

function updateOrbit(ctx: StateContext): StateStep {
  const duration = ctx.mission.orbitDurationSec ?? 0;
  const durationHit = duration > 0 && ctx.missionElapsedSec >= duration;
  if (isBingo(ctx) || durationHit) {
    return { intent: flyToHome(ctx), nextState: 'RTB', waypointAdvance: 0, resetTimeInState: true };
  }
  return { intent: flyOrbit(ctx), nextState: 'ORBIT', waypointAdvance: 0, resetTimeInState: false };
}

function updateRTB(ctx: StateContext): StateStep {
  const s = ctx.airframe;
  const home = ctx.mission.homeAirfield.runwayStart;
  const intent = flyToHome(ctx);
  const dist = horizontalDistance(s.position.x, s.position.z, home.x, home.z);
  const captured = dist < ctx.config.approachCaptureM;
  return {
    intent,
    nextState: captured ? 'APPROACH' : 'RTB',
    waypointAdvance: 0,
    resetTimeInState: captured,
  };
}

function updateApproach(ctx: StateContext): StateStep {
  const home = ctx.mission.homeAirfield.runwayStart;
  const s = ctx.airframe;
  const approachAGL = 30;
  const intent = flyToward(ctx, home.x, home.z, approachAGL, ctx.config.approachAirspeedMs, approachAGL);
  // Bleed altitude — cap throttle for descent.
  intent.throttleTarget = Math.min(intent.throttleTarget, 0.45);
  const dist = horizontalDistance(s.position.x, s.position.z, home.x, home.z);
  const onFinal = dist < 200 && s.altitudeAGL < 50;
  return {
    intent,
    nextState: onFinal ? 'LANDING' : 'APPROACH',
    waypointAdvance: 0,
    resetTimeInState: onFinal,
  };
}

function updateLanding(ctx: StateContext): StateStep {
  const s = ctx.airframe;
  const intent = baseIntent();
  intent.throttleTarget = 0;
  intent.pitchIntent = 0.12; // gentle flare
  intent.brake = s.weightOnWheels ? 0.8 : 0;
  intent.assistEnabled = true;
  const stopped = s.weightOnWheels && s.forwardAirspeedMs < 5;
  return {
    intent,
    nextState: stopped ? 'COLD' : 'LANDING',
    waypointAdvance: 0,
    resetTimeInState: stopped,
  };
}

function updateDead(_ctx: StateContext): StateStep {
  const intent = baseIntent();
  intent.throttleTarget = 0;
  intent.brake = 1;
  return { intent, nextState: 'DEAD', waypointAdvance: 0, resetTimeInState: false };
}

/**
 * Dispatch a state tick. Guards on airframe destruction are applied here so
 * every state gets the absorbing-DEAD behavior for free.
 */
export function stepState(state: PilotState, ctx: StateContext): StateStep {
  if (ctx.resources.destroyed) {
    return updateDead(ctx);
  }
  switch (state) {
    case 'COLD': return updateCold(ctx);
    case 'TAXI': return updateTaxi(ctx);
    case 'TAKEOFF_ROLL': return updateTakeoffRoll(ctx);
    case 'CLIMB': return updateClimb(ctx);
    case 'CRUISE_TO_WP': return updateCruise(ctx);
    case 'ATTACK_SETUP': return updateAttackSetup(ctx);
    case 'ATTACK_RUN': return updateAttackRun(ctx);
    case 'BREAKAWAY': return updateBreakaway(ctx);
    case 'REATTACK_DECISION': return updateReattackDecision(ctx);
    case 'ORBIT': return updateOrbit(ctx);
    case 'RTB': return updateRTB(ctx);
    case 'APPROACH': return updateApproach(ctx);
    case 'LANDING': return updateLanding(ctx);
    case 'DEAD': return updateDead(ctx);
  }
}

/** Signed [-180, 180] difference between two heading angles in degrees. */
function deltaHeadingDeg(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}
