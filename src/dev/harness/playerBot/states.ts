/**
 * Per-state update logic for the harness PlayerBot state machine.
 *
 * Each state's `update()` is a pure function that reads a
 * `PlayerBotStateContext` and returns a `PlayerBotStateStep` — the
 * current-tick `PlayerBotIntent` plus the next state. No shared mutable
 * state lives here; `PlayerBot` owns the state/timeInState bookkeeping.
 *
 * Mirrors the architectural pattern of
 * `src/systems/vehicle/npcPilot/states.ts` so the ground-combat bot is
 * replay-friendly and testable the same way the fixed-wing pilot is.
 */

import {
  BotTarget,
  BotVec3,
  PlayerBotIntent,
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
 * Yaw angle pointing from `from` toward `to` (world-space, radians).
 * Convention matches the live camera: forward = (sin(yaw), 0, -cos(yaw)).
 */
export function yawToward(from: BotVec3, to: BotVec3): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.atan2(dx, -dz);
}

/**
 * Pitch angle from eye `from` toward 3D point `to` (radians, signed).
 * Negative = looking down (target below eye).
 */
export function pitchToward(from: BotVec3, to: BotVec3): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horizontal = Math.hypot(dx, dz) || 1e-6;
  return Math.atan2(dy, horizontal);
}

/** Chest-height offset applied to target ground position for aim. */
const TARGET_CHEST_HEIGHT = 1.2;

function aimPointForTarget(target: BotTarget): BotVec3 {
  return {
    x: target.position.x,
    y: target.position.y + TARGET_CHEST_HEIGHT,
    z: target.position.z,
  };
}

function fractionalHealth(ctx: PlayerBotStateContext): number {
  if (ctx.maxHealth <= 0) return 0;
  return ctx.health / ctx.maxHealth;
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
  // Sine wave so the strafe oscillates smoothly through zero. The sign
  // flips mid-period, producing the ±amplitude "dodge" the brief calls for.
  return Math.sin((2 * Math.PI * timeInStateMs) / periodMs) * amplitude;
}

/**
 * Yaw pointing AWAY from an enemy — used by RETREAT. Bearing is enemy→bot
 * ±135° so the bot doesn't just run in a straight line from the enemy.
 */
export function retreatYaw(from: BotVec3, enemyPos: BotVec3, offsetRad: number): number {
  const awayYaw = yawToward(enemyPos, from); // from-enemy direction
  return awayYaw + offsetRad;
}

// ── State handlers ──────────────────────────────────────────────────────────

function updatePatrol(ctx: PlayerBotStateContext): PlayerBotStateStep {
  const intent = createIdlePlayerBotIntent();
  intent.aimLerpRate = ctx.config.aimLerpRate;
  intent.aimYaw = ctx.yaw;
  intent.aimPitch = ctx.pitch;

  const enemy = ctx.findNearestEnemy();
  if (enemy) {
    // Hand off target selection to ALERT (which decides ENGAGE vs ADVANCE).
    return { intent, nextState: 'ALERT', resetTimeInState: true };
  }

  const objective = ctx.getObjective();
  const roamAnchor: BotVec3 | null = objective ? objective.position : null;
  if (roamAnchor) {
    intent.aimYaw = yawToward(ctx.eyePos, roamAnchor);
    intent.moveForward = 1;
    const dist = horizontalDistance(ctx.eyePos, roamAnchor);
    intent.sprint = dist > ctx.config.sprintDistance;
  }

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
    intent.aimYaw = ctx.yaw;
    intent.aimPitch = ctx.pitch;
    return { intent, nextState: 'PATROL', resetTimeInState: true };
  }

  const aimPt = aimPointForTarget(target);
  intent.aimYaw = yawToward(ctx.eyePos, aimPt);
  intent.aimPitch = pitchToward(ctx.eyePos, aimPt);
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
    intent.aimYaw = ctx.yaw;
    intent.aimPitch = ctx.pitch;
    return { intent, nextState: 'PATROL', resetTimeInState: true };
  }

  // Health / suppression bail-outs first.
  const healthFrac = fractionalHealth(ctx);
  if (healthFrac < ctx.config.retreatHealthFraction) {
    return { intent: aimOnlyIntent(ctx, target), nextState: 'RETREAT', resetTimeInState: true };
  }
  if (healthFrac < ctx.config.coverHealthFraction
      || ctx.suppressionScore >= ctx.config.coverSuppressionScore) {
    return { intent: aimOnlyIntent(ctx, target), nextState: 'SEEK_COVER', resetTimeInState: true };
  }

  const aimPt = aimPointForTarget(target);
  intent.aimYaw = yawToward(ctx.eyePos, aimPt);
  intent.aimPitch = pitchToward(ctx.eyePos, aimPt);

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

  // Back off a bit if too close.
  if (dist < ctx.config.retreatDistance) {
    intent.moveForward = -1;
  }

  return { intent, nextState: null, resetTimeInState: false };
}

function updateAdvance(ctx: PlayerBotStateContext): PlayerBotStateStep {
  const intent = createIdlePlayerBotIntent();
  intent.aimLerpRate = ctx.config.aimLerpRate;

  const target = ctx.currentTarget ?? ctx.findNearestEnemy();
  if (!target) {
    intent.aimYaw = ctx.yaw;
    intent.aimPitch = ctx.pitch;
    return { intent, nextState: 'PATROL', resetTimeInState: true };
  }

  // Re-check LOS: if we can now see the target, hand off to ENGAGE.
  if (isEngagable(ctx, target)) {
    intent.aimYaw = yawToward(ctx.eyePos, aimPointForTarget(target));
    intent.aimPitch = pitchToward(ctx.eyePos, aimPointForTarget(target));
    return { intent, nextState: 'ENGAGE', resetTimeInState: true };
  }

  // Aim at the target even while advancing — bot "keeps eyes on".
  intent.aimYaw = yawToward(ctx.eyePos, aimPointForTarget(target));
  intent.aimPitch = pitchToward(ctx.eyePos, aimPointForTarget(target));

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

function updateSeekCover(ctx: PlayerBotStateContext): PlayerBotStateStep {
  const intent = createIdlePlayerBotIntent();
  intent.aimLerpRate = ctx.config.aimLerpRate;
  intent.crouch = true;

  const target = ctx.currentTarget;
  if (target) {
    const aimPt = aimPointForTarget(target);
    intent.aimYaw = yawToward(ctx.eyePos, aimPt);
    intent.aimPitch = pitchToward(ctx.eyePos, aimPt);
  } else {
    intent.aimYaw = ctx.yaw;
    intent.aimPitch = ctx.pitch;
  }

  // Health recovery check — pop back out once safe, or bail to RETREAT if
  // the cover search failed and we are still low.
  const healthFrac = fractionalHealth(ctx);
  if (healthFrac < ctx.config.retreatHealthFraction) {
    return { intent, nextState: 'RETREAT', resetTimeInState: true };
  }

  // If contact has been quiet long enough, return to PATROL — cover worked.
  if (!target || (ctx.now - target.lastKnownMs) > 3000) {
    return { intent, nextState: 'PATROL', resetTimeInState: true };
  }

  // Crouch-retreat away from the target. Small lateral strafe to suggest
  // moving to a cover corner.
  intent.moveForward = -1;
  intent.moveStrafe = engageStrafeIntent(
    ctx.timeInStateMs,
    ctx.config.engageStrafePeriodMs,
    ctx.config.engageStrafeAmplitude,
  );

  // 2s fallthrough to RETREAT if no improvement.
  if (ctx.timeInStateMs > 2000 && ctx.suppressionScore >= ctx.config.coverSuppressionScore) {
    return { intent, nextState: 'RETREAT', resetTimeInState: true };
  }
  return { intent, nextState: null, resetTimeInState: false };
}

function updateRetreat(ctx: PlayerBotStateContext): PlayerBotStateStep {
  const intent = createIdlePlayerBotIntent();
  intent.aimLerpRate = ctx.config.aimLerpRate;
  intent.sprint = true;

  const target = ctx.currentTarget;
  if (target) {
    const retreatBearing = retreatYaw(ctx.eyePos, target.position, 0);
    intent.aimYaw = retreatBearing;
    intent.aimPitch = 0;
  } else {
    intent.aimYaw = ctx.yaw;
    intent.aimPitch = ctx.pitch;
  }
  intent.moveForward = 1;

  // 5s (config.retreatQuietMs) of no damage → PATROL.
  if ((ctx.now - ctx.lastDamageMs) > ctx.config.retreatQuietMs) {
    return { intent, nextState: 'PATROL', resetTimeInState: true };
  }
  return { intent, nextState: null, resetTimeInState: false };
}

function updateRespawnWait(ctx: PlayerBotStateContext): PlayerBotStateStep {
  const intent = createIdlePlayerBotIntent();
  intent.aimLerpRate = 1;
  intent.aimYaw = ctx.yaw;
  intent.aimPitch = ctx.pitch;
  if (ctx.health > 0) {
    return { intent, nextState: 'PATROL', resetTimeInState: true };
  }
  return { intent, nextState: null, resetTimeInState: false };
}

/** Helper: aim-at-target-only intent. Used for transition ticks. */
function aimOnlyIntent(ctx: PlayerBotStateContext, target: BotTarget): PlayerBotIntent {
  const intent = createIdlePlayerBotIntent();
  intent.aimLerpRate = ctx.config.aimLerpRate;
  const aimPt = aimPointForTarget(target);
  intent.aimYaw = yawToward(ctx.eyePos, aimPt);
  intent.aimPitch = pitchToward(ctx.eyePos, aimPt);
  return intent;
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
    case 'SEEK_COVER': return updateSeekCover(ctx);
    case 'RETREAT': return updateRetreat(ctx);
    case 'RESPAWN_WAIT': return updateRespawnWait(ctx);
  }
}
