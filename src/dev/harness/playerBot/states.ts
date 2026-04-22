/**
 * Per-state update logic for the harness PlayerBot state machine.
 *
 * Each state's `update()` is a pure function that reads a
 * `PlayerBotStateContext` and returns a `PlayerBotStateStep` — the
 * current-tick `PlayerBotIntent` plus the next state. No shared mutable
 * state lives here; `PlayerBot` owns the state/timeInState bookkeeping.
 *
 * States emit AIM AS A WORLD-SPACE POINT (`intent.aimTarget`). Camera
 * rotation conversion is done by the controller via `camera.lookAt()` —
 * the bot never hand-rolls yaw/pitch math and so cannot regress the
 * Three.js rotation convention.
 *
 * Mirrors the architectural pattern of
 * `src/systems/vehicle/npcPilot/states.ts` so the ground-combat bot is
 * replay-friendly and testable the same way the fixed-wing pilot is.
 */

import {
  BotTarget,
  BotVec3,
  PlayerBotState,
  PlayerBotStateContext,
  PlayerBotStateStep,
  createIdlePlayerBotIntent,
} from './types';

/** Horizontal distance between two 3D points. */
export function horizontalDistance(a: BotVec3, b: BotVec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

/**
 * Chest/LOS offset applied to a target's ground position. 1.7m aligns with
 * the engine NPC-to-NPC LOS height used by AILineOfSight — aiming at 1.2m
 * clipped low-torso shots into the ground on uneven terrain.
 */
const TARGET_LOS_HEIGHT = 1.7;

function aimPointForTarget(target: BotTarget): BotVec3 {
  return {
    x: target.position.x,
    y: target.position.y + TARGET_LOS_HEIGHT,
    z: target.position.z,
  };
}

/** True when target exists AND is within maxFireDistance AND visible. */
function isEngagable(ctx: PlayerBotStateContext, target: BotTarget | null): boolean {
  if (!target) return false;
  const dist = horizontalDistance(ctx.eyePos, target.position);
  if (dist > ctx.config.maxFireDistance) return false;
  return ctx.canSeeTarget(target.position);
}

/**
 * Strafe intent for ENGAGE — small alternating left/right to simulate a
 * player's natural dodge. Deterministic function of (timeInStateMs, period,
 * amplitude); no RNG so tests and replays are reproducible.
 */
export function engageStrafeIntent(
  timeInStateMs: number,
  periodMs: number,
  amplitude: number,
): number {
  if (periodMs <= 0 || amplitude <= 0) return 0;
  return Math.sin((2 * Math.PI * timeInStateMs) / periodMs) * amplitude;
}

// ── State handlers ──────────────────────────────────────────────────────────

function updatePatrol(ctx: PlayerBotStateContext): PlayerBotStateStep {
  const intent = createIdlePlayerBotIntent();
  intent.aimLerpRate = ctx.config.aimLerpRate;

  const enemy = ctx.findNearestEnemy();
  if (enemy) {
    // Hand off target selection to ALERT (which decides ENGAGE vs ADVANCE).
    intent.aimTarget = aimPointForTarget(enemy);
    return { intent, nextState: 'ALERT', resetTimeInState: true };
  }

  const objective = ctx.getObjective();
  if (objective) {
    intent.aimTarget = { x: objective.position.x, y: objective.position.y + TARGET_LOS_HEIGHT, z: objective.position.z };
    intent.moveForward = 1;
    const dist = horizontalDistance(ctx.eyePos, objective.position);
    intent.sprint = dist > ctx.config.sprintDistance;
  }
  // else: no objective known. Hold current angles (aimTarget stays null).

  return { intent, nextState: null, resetTimeInState: false };
}

function updateAlert(ctx: PlayerBotStateContext): PlayerBotStateStep {
  const intent = createIdlePlayerBotIntent();
  intent.aimLerpRate = ctx.config.aimLerpRate;

  // ALERT is a brief orient-toward + check-LOS pass. Two outcomes:
  //   - target visible & in range → ENGAGE
  //   - target known but blocked → ADVANCE to close the gap / regain LOS
  //   - target vanished → PATROL
  const target = ctx.currentTarget ?? ctx.findNearestEnemy();
  if (!target) {
    return { intent, nextState: 'PATROL', resetTimeInState: true };
  }

  intent.aimTarget = aimPointForTarget(target);
  intent.moveForward = 1;

  if (isEngagable(ctx, target)) {
    return { intent, nextState: 'ENGAGE', resetTimeInState: true };
  }
  return { intent, nextState: 'ADVANCE', resetTimeInState: true };
}

function updateEngage(ctx: PlayerBotStateContext): PlayerBotStateStep {
  const intent = createIdlePlayerBotIntent();
  intent.aimLerpRate = ctx.config.aimLerpRate;

  const target = ctx.currentTarget;
  if (!target) {
    return { intent, nextState: 'PATROL', resetTimeInState: true };
  }

  // Aim at the target (chest/LOS height). No health / suppression bail-outs —
  // this is a perf-harness player surrogate, not a soldier. Players push in
  // for kills; they do not flee on damage.
  intent.aimTarget = aimPointForTarget(target);

  const visible = ctx.canSeeTarget(target.position);
  const dist = horizontalDistance(ctx.eyePos, target.position);
  if (!visible || dist > ctx.config.maxFireDistance) {
    // Hold aim for a frame, but let the caller know we're switching.
    return { intent, nextState: 'ADVANCE', resetTimeInState: true };
  }

  // Fire intent — aim snap + weapon trigger. Reload when magazine empty.
  if (ctx.magazine.current <= 0) {
    intent.reload = true;
  } else {
    intent.firePrimary = true;
  }

  // Player-dodge strafe.
  intent.moveStrafe = engageStrafeIntent(
    ctx.timeInStateMs,
    ctx.config.engageStrafePeriodMs,
    ctx.config.engageStrafeAmplitude,
  );

  // Push in until close. NEVER negative — players don't back-pedal in a
  // fight, and back-pedalling broke hits=0 in Round 5/6.
  intent.moveForward = dist > ctx.config.pushInDistance ? 1 : 0;

  return { intent, nextState: null, resetTimeInState: false };
}

function updateAdvance(ctx: PlayerBotStateContext): PlayerBotStateStep {
  const intent = createIdlePlayerBotIntent();
  intent.aimLerpRate = ctx.config.aimLerpRate;

  const target = ctx.currentTarget ?? ctx.findNearestEnemy();
  if (!target) {
    return { intent, nextState: 'PATROL', resetTimeInState: true };
  }

  // Keep eyes on the target even while advancing.
  intent.aimTarget = aimPointForTarget(target);

  // Re-check LOS: if we can now see the target, hand off to ENGAGE.
  if (isEngagable(ctx, target)) {
    return { intent, nextState: 'ENGAGE', resetTimeInState: true };
  }

  // Movement toward the target. The DRIVER is expected to convert this
  // intent into navmesh-path pure-pursuit (that's where `queryPath` and
  // `findNearestNavmeshPoint` get consumed — the bot itself just says
  // "move forward toward the target bearing"). Keeping this tight avoids
  // duplicating path-follow logic between the bot and the driver.
  intent.moveForward = 1;
  const dist = horizontalDistance(ctx.eyePos, target.position);
  intent.sprint = dist > ctx.config.sprintDistance;
  return { intent, nextState: null, resetTimeInState: false };
}

function updateRespawnWait(ctx: PlayerBotStateContext): PlayerBotStateStep {
  const intent = createIdlePlayerBotIntent();
  intent.aimLerpRate = 1;
  if (ctx.health > 0) {
    return { intent, nextState: 'PATROL', resetTimeInState: true };
  }
  return { intent, nextState: null, resetTimeInState: false };
}

/**
 * Dispatch a state tick. If health <= 0, the absorbing RESPAWN_WAIT state is
 * forced regardless of current state (mirrors the pilot's DEAD guard).
 */
export function stepState(state: PlayerBotState, ctx: PlayerBotStateContext): PlayerBotStateStep {
  if (ctx.health <= 0 && state !== 'RESPAWN_WAIT') {
    const intent = createIdlePlayerBotIntent();
    return { intent, nextState: 'RESPAWN_WAIT', resetTimeInState: true };
  }
  switch (state) {
    case 'PATROL': return updatePatrol(ctx);
    case 'ALERT': return updateAlert(ctx);
    case 'ENGAGE': return updateEngage(ctx);
    case 'ADVANCE': return updateAdvance(ctx);
    case 'RESPAWN_WAIT': return updateRespawnWait(ctx);
  }
}
