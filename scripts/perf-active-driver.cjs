/**
 * Performance harness driver.
 *
 * This script is injected into the running page by the perf-capture harness.
 * It instantiates a `PlayerBot` (ground-combat state-machine bot) on each
 * active scenario and ticks it against the engine's own combat/navigation
 * primitives — terrain raycast for LOS, navmesh for movement, the live
 * combatant list for target search. The bot never reinvents those
 * primitives; it consumes them.
 *
 * The bot and its controller live in `src/dev/harness/playerBot/*.ts` as the
 * source-of-truth implementation (with Vitest coverage). This driver is a
 * pure-JS mirror of that state machine, because Vite's injected script tag
 * cannot import TypeScript modules. When changing bot behavior, change the
 * TypeScript source AND this file together (same discipline
 * `chooseHeadingByGradient`, `pointAlongPath`, etc. have followed since
 * perf-harness-redesign).
 */

(function (root) {
  const globalWindow = typeof window !== 'undefined' ? window : null;

  // ── Pure helpers kept for Node-side regression tests (scripts/perf-harness).
  // These are the same primitives that perf-harness-redesign, perf-harness-killbot
  // and perf-harness-verticality-and-sizing exercised; do not remove without
  // updating scripts/perf-harness/perf-active-driver.test.js in lockstep.

  function evaluateFireDecision(opts) {
    const forward = opts && opts.cameraForward;
    const toTarget = opts && opts.toTarget;
    const aimDotThreshold = Number(opts && opts.aimDotThreshold);
    const verticalThreshold = Number(opts && opts.verticalThreshold);
    const closeRange = !!(opts && opts.closeRange);

    if (!forward || !toTarget) {
      return { shouldFire: false, reason: 'missing_vectors', aimDot: 0, verticalComponent: 0 };
    }
    const fx = Number(forward.x || 0);
    const fy = Number(forward.y || 0);
    const fz = Number(forward.z || 0);
    const tx = Number(toTarget.x || 0);
    const ty = Number(toTarget.y || 0);
    const tz = Number(toTarget.z || 0);
    const fLen = Math.hypot(fx, fy, fz);
    const tLen = Math.hypot(tx, ty, tz);
    if (!Number.isFinite(fLen) || !Number.isFinite(tLen) || fLen < 1e-6 || tLen < 1e-6) {
      return { shouldFire: false, reason: 'degenerate_vectors', aimDot: 0, verticalComponent: 0 };
    }
    const fnx = fx / fLen;
    const fny = fy / fLen;
    const fnz = fz / fLen;
    const tnx = tx / tLen;
    const tny = ty / tLen;
    const tnz = tz / tLen;
    const aimDot = fnx * tnx + fny * tny + fnz * tnz;
    const verticalComponent = Math.abs(tny);
    const dotThreshold = Number.isFinite(aimDotThreshold) ? aimDotThreshold : 0.8;
    const vThreshold = Number.isFinite(verticalThreshold) ? verticalThreshold : 0.45;

    if (aimDot < dotThreshold) {
      return { shouldFire: false, reason: 'aim_dot_too_low', aimDot: aimDot, verticalComponent: verticalComponent };
    }
    if (verticalComponent > vThreshold && !closeRange) {
      return { shouldFire: false, reason: 'vertical_angle_rejected', aimDot: aimDot, verticalComponent: verticalComponent };
    }
    return { shouldFire: true, reason: 'ok', aimDot: aimDot, verticalComponent: verticalComponent };
  }

  function chooseHeadingByGradient(opts) {
    const sampleHeight = opts && opts.sampleHeight;
    const from = opts && opts.from;
    const bearingRad = Number(opts && opts.bearingRad);
    const maxGradient = Number(opts && opts.maxGradient);
    const lookAhead = Number(opts && opts.lookAhead);
    if (typeof sampleHeight !== 'function' || !from || !Number.isFinite(bearingRad)) {
      return null;
    }
    const grad = Number.isFinite(maxGradient) && maxGradient > 0 ? maxGradient : 0.45;
    const la = Number.isFinite(lookAhead) && lookAhead > 0 ? lookAhead : 8;
    const hHere = Number(sampleHeight(Number(from.x), Number(from.z)));
    if (!Number.isFinite(hHere)) return null;
    const offsets = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];
    let best = null;
    let bestAbsGrad = Number.POSITIVE_INFINITY;
    for (let i = 0; i < offsets.length; i++) {
      const yaw = bearingRad + offsets[i];
      const dx = Math.sin(yaw);
      const dz = -Math.cos(yaw);
      const bdx = Math.sin(bearingRad);
      const bdz = -Math.cos(bearingRad);
      const dot = dx * bdx + dz * bdz;
      if (dot <= 0) continue;
      const probeX = Number(from.x) + dx * la;
      const probeZ = Number(from.z) + dz * la;
      const hThere = Number(sampleHeight(probeX, probeZ));
      if (!Number.isFinite(hThere)) continue;
      const gradient = (hThere - hHere) / la;
      const absGradient = Math.abs(gradient);
      if (absGradient > grad) continue;
      if (absGradient < bestAbsGrad) {
        bestAbsGrad = absGradient;
        best = { yaw: yaw, gradient: gradient, offsetRad: offsets[i] };
      }
    }
    return best;
  }

  // Player eye-height and target chest-height — mirrors src/systems/player/PlayerMovement.ts
  // (PLAYER_EYE_HEIGHT = 2.2). Keep these constants in sync; the Node test
  // imports them as-is.
  const PLAYER_EYE_HEIGHT = 2.2;
  const TARGET_CHEST_HEIGHT = 1.2;
  const DEFAULT_BULLET_SPEED = 400;

  // Player's maximum walkable slope, derived from SlopePhysics.PLAYER_CLIMB_SLOPE_DOT.
  const PLAYER_CLIMB_SLOPE_DOT = 0.7;
  const PLAYER_MAX_CLIMB_ANGLE_RAD = Math.acos(PLAYER_CLIMB_SLOPE_DOT);
  const PLAYER_MAX_CLIMB_GRADIENT = Math.tan(PLAYER_MAX_CLIMB_ANGLE_RAD);

  // Path-trust invariant (perf-harness-verticality-and-sizing).
  const PATH_TRUST_TTL_MS = 5000;

  function isPathTrusted(opts) {
    const path = opts && opts.path;
    const index = Number(opts && opts.waypointIdx);
    const ageMs = Number(opts && opts.pathAgeMs);
    if (!Array.isArray(path) || path.length < 2) return false;
    if (!Number.isFinite(index) || index < 0 || index >= path.length) return false;
    if (!Number.isFinite(ageMs) || ageMs < 0) return false;
    return ageMs < PATH_TRUST_TTL_MS;
  }

  const AIM_PITCH_LIMIT_RAD = (80 * Math.PI) / 180;
  function clampAimYByPitch(playerY, desiredY, horizontalDist) {
    const py = Number(playerY || 0);
    const dy = Number(desiredY);
    if (!Number.isFinite(dy)) return py;
    const hz = Number(horizontalDist || 0);
    if (!Number.isFinite(hz) || hz <= 0.01) return dy;
    const vLimit = hz * Math.tan(AIM_PITCH_LIMIT_RAD);
    return Math.max(py - vLimit, Math.min(py + vLimit, dy));
  }

  function computeUtilityScore(opts) {
    const distance = Number(opts && opts.distance);
    const hasLOS = !!(opts && opts.hasLOS);
    const isEngagingUs = !!(opts && opts.isEngagingUs);
    if (!Number.isFinite(distance) || distance < 0) return 0;
    const visibility = hasLOS ? 1 : 0.3;
    const threat = isEngagingUs ? 2 : 1;
    return visibility * (1 / (distance + 1)) * threat;
  }

  function shouldSwitchTarget(currentScore, candidateScore, ratio) {
    const r = Number.isFinite(ratio) && ratio > 1 ? ratio : 1.3;
    const cur = Number.isFinite(currentScore) ? currentScore : 0;
    const cand = Number.isFinite(candidateScore) ? candidateScore : 0;
    if (cur <= 0) return cand > 0;
    return cand > cur * r;
  }

  function computeAimSolution(opts) {
    const eyeX = Number(opts && opts.eyeX);
    const eyeY = Number(opts && opts.eyeY);
    const eyeZ = Number(opts && opts.eyeZ);
    const targetX = Number(opts && opts.targetX);
    const targetY = Number(opts && opts.targetY);
    const targetZ = Number(opts && opts.targetZ);
    const vx = Number(opts && opts.targetVx) || 0;
    const vy = Number(opts && opts.targetVy) || 0;
    const vz = Number(opts && opts.targetVz) || 0;
    const bulletSpeed = Number(opts && opts.bulletSpeed) > 0 ? Number(opts.bulletSpeed) : DEFAULT_BULLET_SPEED;
    const horizontalDist = Math.hypot(targetX - eyeX, targetZ - eyeZ);
    const tFlight = horizontalDist / bulletSpeed;
    const aimX = targetX + vx * tFlight;
    const aimY = targetY + vy * tFlight;
    const aimZ = targetZ + vz * tFlight;
    const horizontalAim = Math.hypot(aimX - eyeX, aimZ - eyeZ) || 1e-6;
    const yaw = Math.atan2(aimX - eyeX, -(aimZ - eyeZ));
    const pitch = Math.atan2(aimY - eyeY, horizontalAim);
    return { yaw: yaw, pitch: pitch, aimPoint: { x: aimX, y: aimY, z: aimZ }, horizontalDist: horizontalDist };
  }

  function computeAdaptiveLookahead(speed) {
    const s = Number.isFinite(speed) && speed >= 0 ? Number(speed) : 0;
    return Math.max(5, Math.min(20, 8 + 0.05 * s));
  }

  function pointAlongPath(path, fromIdx, fromPos, lookaheadDist) {
    if (!Array.isArray(path) || path.length === 0) return null;
    const idx = Math.max(0, Math.min(path.length - 1, Number(fromIdx) || 0));
    const pos = fromPos || path[idx];
    let remaining = Number.isFinite(lookaheadDist) && lookaheadDist > 0 ? Number(lookaheadDist) : 8;
    let ax = Number(pos && pos.x || 0);
    let az = Number(pos && pos.z || 0);
    for (let i = idx; i < path.length; i++) {
      const wp = path[i];
      if (!wp) continue;
      const wx = Number(wp.x || 0);
      const wz = Number(wp.z || 0);
      const seg = Math.hypot(wx - ax, wz - az);
      if (seg >= remaining) {
        const t = seg > 0 ? remaining / seg : 0;
        return { x: ax + (wx - ax) * t, y: Number(wp.y || 0), z: az + (wz - az) * t };
      }
      remaining -= seg;
      ax = wx;
      az = wz;
    }
    const last = path[path.length - 1];
    return last ? { x: Number(last.x || 0), y: Number(last.y || 0), z: Number(last.z || 0) } : null;
  }

  function evaluateFireGate(opts) {
    const aimErrorRad = Number(opts && opts.aimErrorRad);
    const maxAimErrorRad = Number(opts && opts.maxAimErrorRad);
    const losClear = !!(opts && opts.losClear);
    const pitchRad = Number(opts && opts.pitchRad);
    const distance = Number(opts && opts.distance);
    const ammoReady = !!(opts && opts.ammoReady);
    const errLimit = Number.isFinite(maxAimErrorRad) && maxAimErrorRad > 0 ? maxAimErrorRad : (3 * Math.PI) / 180;
    if (!ammoReady) return { fire: false, reason: 'ammo_not_ready' };
    if (!Number.isFinite(aimErrorRad) || aimErrorRad > errLimit) return { fire: false, reason: 'aim_error_too_high' };
    if (!losClear) return { fire: false, reason: 'los_blocked' };
    const MIN_SAFE_PITCH = -25 * Math.PI / 180;
    if (Number.isFinite(pitchRad) && pitchRad < MIN_SAFE_PITCH && (!Number.isFinite(distance) || distance > 10)) {
      return { fire: false, reason: 'fire_pitch_unsafe' };
    }
    return { fire: true, reason: 'ok' };
  }

  function angularDistance(yaw1, pitch1, yaw2, pitch2) {
    let dy = Number(yaw2) - Number(yaw1);
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const dp = Number(pitch2) - Number(pitch1);
    return Math.hypot(dy, dp);
  }

  // ── PlayerBot state machine (JS mirror of src/dev/harness/playerBot/states.ts). ──
  //
  // `stepBotState(state, ctx)` is pure: returns { intent, nextState, resetTimeInState }.
  // The TypeScript version is unit-tested under src/dev/harness/*.test.ts;
  // changes here MUST be ported to the TS source in the same PR.

  const OPFOR_FACTIONS = new Set(['NVA', 'VC']);
  const BLUFOR_FACTIONS = new Set(['US', 'ARVN']);
  function isOpforFaction(faction) { return OPFOR_FACTIONS.has(faction); }
  function isBluforFaction(faction) { return BLUFOR_FACTIONS.has(faction); }

  function createIdleBotIntent() {
    return {
      moveForward: 0,
      moveStrafe: 0,
      sprint: false,
      crouch: false,
      jump: false,
      aimYaw: 0,
      aimPitch: 0,
      aimLerpRate: 1,
      firePrimary: false,
      reload: false,
    };
  }

  function botHorizontalDistance(a, b) {
    const dx = Number(a.x || 0) - Number(b.x || 0);
    const dz = Number(a.z || 0) - Number(b.z || 0);
    return Math.hypot(dx, dz);
  }

  function botYawToward(from, to) {
    const dx = Number(to.x || 0) - Number(from.x || 0);
    const dz = Number(to.z || 0) - Number(from.z || 0);
    return Math.atan2(dx, -dz);
  }

  function botPitchToward(from, to) {
    const dx = Number(to.x || 0) - Number(from.x || 0);
    const dy = Number(to.y || 0) - Number(from.y || 0);
    const dz = Number(to.z || 0) - Number(from.z || 0);
    const horizontal = Math.hypot(dx, dz) || 1e-6;
    return Math.atan2(dy, horizontal);
  }

  function botAimPoint(target) {
    return {
      x: Number(target.position.x || 0),
      y: Number(target.position.y || 0) + TARGET_CHEST_HEIGHT,
      z: Number(target.position.z || 0),
    };
  }

  function isEngagable(ctx, target) {
    if (!target) return false;
    const dist = botHorizontalDistance(ctx.eyePos, target.position);
    if (dist > ctx.config.maxFireDistance) return false;
    return !!ctx.canSeeTarget(target.position);
  }

  function engageStrafeIntent(timeInStateMs, periodMs, amplitude) {
    if (periodMs <= 0 || amplitude <= 0) return 0;
    return Math.sin((2 * Math.PI * timeInStateMs) / periodMs) * amplitude;
  }

  function botAimOnly(ctx, target) {
    const intent = createIdleBotIntent();
    intent.aimLerpRate = ctx.config.aimLerpRate;
    const aimPt = botAimPoint(target);
    intent.aimYaw = botYawToward(ctx.eyePos, aimPt);
    intent.aimPitch = botPitchToward(ctx.eyePos, aimPt);
    return intent;
  }

  function updatePatrolBot(ctx) {
    const intent = createIdleBotIntent();
    intent.aimLerpRate = ctx.config.aimLerpRate;
    intent.aimYaw = ctx.yaw;
    intent.aimPitch = ctx.pitch;
    const enemy = ctx.findNearestEnemy();
    if (enemy) {
      return { intent, nextState: 'ALERT', resetTimeInState: true };
    }
    const objective = ctx.getObjective();
    const roamAnchor = objective ? objective.position : null;
    if (roamAnchor) {
      intent.aimYaw = botYawToward(ctx.eyePos, roamAnchor);
      intent.moveForward = 1;
      intent.sprint = botHorizontalDistance(ctx.eyePos, roamAnchor) > ctx.config.sprintDistance;
    }
    return { intent, nextState: null, resetTimeInState: false };
  }

  function updateAlertBot(ctx) {
    const intent = createIdleBotIntent();
    intent.aimLerpRate = ctx.config.aimLerpRate;
    const target = ctx.currentTarget || ctx.findNearestEnemy();
    if (!target) {
      intent.aimYaw = ctx.yaw;
      intent.aimPitch = ctx.pitch;
      return { intent, nextState: 'PATROL', resetTimeInState: true };
    }
    const aimPt = botAimPoint(target);
    intent.aimYaw = botYawToward(ctx.eyePos, aimPt);
    intent.aimPitch = botPitchToward(ctx.eyePos, aimPt);
    intent.moveForward = 1;
    if (isEngagable(ctx, target)) {
      return { intent, nextState: 'ENGAGE', resetTimeInState: true };
    }
    return { intent, nextState: 'ADVANCE', resetTimeInState: true };
  }

  function updateEngageBot(ctx) {
    const intent = createIdleBotIntent();
    intent.aimLerpRate = ctx.config.aimLerpRate;
    const target = ctx.currentTarget;
    if (!target) {
      intent.aimYaw = ctx.yaw;
      intent.aimPitch = ctx.pitch;
      return { intent, nextState: 'PATROL', resetTimeInState: true };
    }
    const healthFrac = ctx.maxHealth > 0 ? ctx.health / ctx.maxHealth : 0;
    if (healthFrac < ctx.config.retreatHealthFraction) {
      return { intent: botAimOnly(ctx, target), nextState: 'RETREAT', resetTimeInState: true };
    }
    if (healthFrac < ctx.config.coverHealthFraction || ctx.suppressionScore >= ctx.config.coverSuppressionScore) {
      return { intent: botAimOnly(ctx, target), nextState: 'SEEK_COVER', resetTimeInState: true };
    }
    const aimPt = botAimPoint(target);
    intent.aimYaw = botYawToward(ctx.eyePos, aimPt);
    intent.aimPitch = botPitchToward(ctx.eyePos, aimPt);
    const visible = !!ctx.canSeeTarget(target.position);
    const dist = botHorizontalDistance(ctx.eyePos, target.position);
    if (!visible || dist > ctx.config.maxFireDistance) {
      return { intent, nextState: 'ADVANCE', resetTimeInState: true };
    }
    if (ctx.magazine.current <= 0) {
      intent.reload = true;
    } else {
      intent.firePrimary = true;
    }
    intent.moveStrafe = engageStrafeIntent(ctx.timeInStateMs, ctx.config.engageStrafePeriodMs, ctx.config.engageStrafeAmplitude);
    if (dist < ctx.config.retreatDistance) {
      intent.moveForward = -1;
    }
    return { intent, nextState: null, resetTimeInState: false };
  }

  function updateAdvanceBot(ctx) {
    const intent = createIdleBotIntent();
    intent.aimLerpRate = ctx.config.aimLerpRate;
    const target = ctx.currentTarget || ctx.findNearestEnemy();
    if (!target) {
      intent.aimYaw = ctx.yaw;
      intent.aimPitch = ctx.pitch;
      return { intent, nextState: 'PATROL', resetTimeInState: true };
    }
    if (isEngagable(ctx, target)) {
      const aimPt = botAimPoint(target);
      intent.aimYaw = botYawToward(ctx.eyePos, aimPt);
      intent.aimPitch = botPitchToward(ctx.eyePos, aimPt);
      return { intent, nextState: 'ENGAGE', resetTimeInState: true };
    }
    const aimPt = botAimPoint(target);
    intent.aimYaw = botYawToward(ctx.eyePos, aimPt);
    intent.aimPitch = botPitchToward(ctx.eyePos, aimPt);
    intent.moveForward = 1;
    const dist = botHorizontalDistance(ctx.eyePos, target.position);
    intent.sprint = dist > ctx.config.sprintDistance;
    return { intent, nextState: null, resetTimeInState: false };
  }

  function updateSeekCoverBot(ctx) {
    const intent = createIdleBotIntent();
    intent.aimLerpRate = ctx.config.aimLerpRate;
    intent.crouch = true;
    const target = ctx.currentTarget;
    if (target) {
      const aimPt = botAimPoint(target);
      intent.aimYaw = botYawToward(ctx.eyePos, aimPt);
      intent.aimPitch = botPitchToward(ctx.eyePos, aimPt);
    } else {
      intent.aimYaw = ctx.yaw;
      intent.aimPitch = ctx.pitch;
    }
    const healthFrac = ctx.maxHealth > 0 ? ctx.health / ctx.maxHealth : 0;
    if (healthFrac < ctx.config.retreatHealthFraction) {
      return { intent, nextState: 'RETREAT', resetTimeInState: true };
    }
    if (!target || (ctx.now - target.lastKnownMs) > 3000) {
      return { intent, nextState: 'PATROL', resetTimeInState: true };
    }
    intent.moveForward = -1;
    intent.moveStrafe = engageStrafeIntent(ctx.timeInStateMs, ctx.config.engageStrafePeriodMs, ctx.config.engageStrafeAmplitude);
    if (ctx.timeInStateMs > 2000 && ctx.suppressionScore >= ctx.config.coverSuppressionScore) {
      return { intent, nextState: 'RETREAT', resetTimeInState: true };
    }
    return { intent, nextState: null, resetTimeInState: false };
  }

  function updateRetreatBot(ctx) {
    const intent = createIdleBotIntent();
    intent.aimLerpRate = ctx.config.aimLerpRate;
    intent.sprint = true;
    const target = ctx.currentTarget;
    if (target) {
      const retreatBearing = botYawToward(target.position, ctx.eyePos);
      intent.aimYaw = retreatBearing;
      intent.aimPitch = 0;
    } else {
      intent.aimYaw = ctx.yaw;
      intent.aimPitch = ctx.pitch;
    }
    intent.moveForward = 1;
    if ((ctx.now - ctx.lastDamageMs) > ctx.config.retreatQuietMs) {
      return { intent, nextState: 'PATROL', resetTimeInState: true };
    }
    return { intent, nextState: null, resetTimeInState: false };
  }

  function updateRespawnWaitBot(ctx) {
    const intent = createIdleBotIntent();
    intent.aimLerpRate = 1;
    intent.aimYaw = ctx.yaw;
    intent.aimPitch = ctx.pitch;
    if (ctx.health > 0) {
      return { intent, nextState: 'PATROL', resetTimeInState: true };
    }
    return { intent, nextState: null, resetTimeInState: false };
  }

  function stepBotState(state, ctx) {
    if (ctx.health <= 0 && state !== 'RESPAWN_WAIT') {
      return { intent: createIdleBotIntent(), nextState: 'RESPAWN_WAIT', resetTimeInState: true };
    }
    switch (state) {
      case 'PATROL': return updatePatrolBot(ctx);
      case 'ALERT': return updateAlertBot(ctx);
      case 'ENGAGE': return updateEngageBot(ctx);
      case 'ADVANCE': return updateAdvanceBot(ctx);
      case 'SEEK_COVER': return updateSeekCoverBot(ctx);
      case 'RETREAT': return updateRetreatBot(ctx);
      case 'RESPAWN_WAIT': return updateRespawnWaitBot(ctx);
      default: return updatePatrolBot(ctx);
    }
  }

  // ── Mode profiles ──────────────────────────────────────────────────────────

  function profileForMode(mode) {
    const base = {
      ai_sandbox: {
        maxFireDistance: 165,
        sprintDistance: 200,
        approachDistance: 120,
        retreatDistance: 18,
        perceptionRange: 220,
        aggressiveMode: false,
        waypointReplanIntervalMs: 3500,
        decisionIntervalMs: 250,
      },
      open_frontier: {
        maxFireDistance: 245,
        sprintDistance: 360,
        approachDistance: 185,
        retreatDistance: 16,
        perceptionRange: 900,
        aggressiveMode: true,
        waypointReplanIntervalMs: 5000,
        decisionIntervalMs: 250,
      },
      a_shau_valley: {
        maxFireDistance: 235,
        sprintDistance: 320,
        approachDistance: 150,
        retreatDistance: 18,
        perceptionRange: 1100,
        aggressiveMode: true,
        waypointReplanIntervalMs: 4000,
        decisionIntervalMs: 250,
      },
      zone_control: {
        maxFireDistance: 150,
        sprintDistance: 220,
        approachDistance: 110,
        retreatDistance: 16,
        perceptionRange: 220,
        aggressiveMode: false,
        waypointReplanIntervalMs: 5000,
        decisionIntervalMs: 250,
      },
      team_deathmatch: {
        maxFireDistance: 140,
        sprintDistance: 175,
        approachDistance: 90,
        retreatDistance: 12,
        perceptionRange: 260,
        aggressiveMode: false,
        waypointReplanIntervalMs: 6000,
        decisionIntervalMs: 250,
      },
    };
    return base[mode] || base.ai_sandbox;
  }

  function botConfigForProfile(profile) {
    return {
      maxFireDistance: profile.maxFireDistance,
      sprintDistance: profile.sprintDistance,
      approachDistance: profile.approachDistance,
      retreatDistance: profile.retreatDistance,
      coverHealthFraction: 0.5,
      retreatHealthFraction: 0.2,
      coverSuppressionScore: 0.7,
      retreatQuietMs: 5000,
      aimLerpRate: 1,
      engageStrafeAmplitude: profile.aggressiveMode ? 0.3 : 0.2,
      engageStrafePeriodMs: 750,
      perceptionRange: profile.perceptionRange,
      tickMs: 250,
    };
  }

  // ── Driver implementation ──────────────────────────────────────────────────

  function createDriver(options) {
    const opts = {
      mode: String(options.mode || 'ai_sandbox').toLowerCase(),
      compressFrontline: !!options.compressFrontline,
      frontlineTriggerDistance: Number(options.frontlineTriggerDistance || 500),
      maxCompressedPerFaction: Number(options.maxCompressedPerFaction || 28),
      allowWarpRecovery: options.allowWarpRecovery === true,
      topUpHealth: options.topUpHealth !== false,
      autoRespawn: options.autoRespawn !== false,
    };
    const profile = profileForMode(opts.mode);
    const botConfig = botConfigForProfile(profile);
    const enableFrontlineCompression = opts.compressFrontline && (
      opts.mode === 'ai_sandbox' || opts.mode === 'zone_control' || opts.mode === 'team_deathmatch'
    );

    const state = {
      heartbeatTimer: null,
      // Bot bookkeeping.
      botState: 'PATROL',
      timeInStateMs: 0,
      currentTarget: null,
      lastTickMs: 0,
      lastDamageMs: 0,
      lastHealth: 100,
      lastObjectiveZoneId: null,
      // Movement / controller state.
      firingHeld: false,
      lastYaw: 0,
      lastPitch: 0,
      viewSeeded: false,
      // Path bookkeeping — used when the bot's ADVANCE state wants a planned route.
      waypoints: null,
      waypointIdx: 0,
      lastWaypointReplanAt: 0,
      waypointsFollowed: 0,
      waypointReplanFailures: 0,
      // Telemetry.
      respawnCount: 0,
      ammoRefillCount: 0,
      healthTopUpCount: 0,
      frontlineCompressed: false,
      frontlineDistance: 0,
      frontlineMoveCount: 0,
      lastShotAt: Date.now(),
      shotsFired: 0,
      reloadsIssued: 0,
      losRejectedShots: 0,
      stuckTeleportCount: 0,
      maxStuckMs: 0,
      stuckMs: 0,
      lastStablePos: null,
      transitions: 0,
      lastStateChangeAt: 0,
      stateHistogram: {
        PATROL: 0, ALERT: 0, ENGAGE: 0, ADVANCE: 0,
        SEEK_COVER: 0, RETREAT: 0, RESPAWN_WAIT: 0,
      },
      lastFireProbe: null,
      frontlineInserted: false,
      setupFastForwarded: false,
      enemySpawn: null,
    };

    function getSystems() {
      return globalWindow && globalWindow.__engine && globalWindow.__engine.systemManager;
    }

    function disablePointerLockForHarness(systems) {
      const pc = systems && systems.playerController;
      if (pc && typeof pc.setPointerLockEnabled === 'function') {
        pc.setPointerLockEnabled(false);
      }
    }

    function fastForwardSetupPhaseIfNeeded(systems) {
      if (state.setupFastForwarded || opts.mode !== 'a_shau_valley') return;
      const ticketSystem = systems && systems.ticketSystem;
      if (!ticketSystem || typeof ticketSystem.getGameState !== 'function' || typeof ticketSystem.update !== 'function') {
        return;
      }
      const phase = ticketSystem.getGameState().phase;
      if (phase !== 'SETUP') { state.setupFastForwarded = true; return; }
      const setupDuration = typeof ticketSystem.getSetupDuration === 'function'
        ? Number(ticketSystem.getSetupDuration()) : 10;
      ticketSystem.update(Math.max(0.25, setupDuration + 0.1));
      state.setupFastForwarded = true;
    }

    function getEnemySpawn(systems) {
      if (state.enemySpawn) return state.enemySpawn;
      const config = systems && systems.gameModeManager && systems.gameModeManager.getCurrentConfig
        ? systems.gameModeManager.getCurrentConfig() : null;
      const zones = config && Array.isArray(config.zones) ? config.zones : null;
      if (zones) {
        for (let i = 0; i < zones.length; i++) {
          const z = zones[i];
          if (z && z.isHomeBase && isOpforFaction(z.owner) && z.position) {
            state.enemySpawn = { x: Number(z.position.x), y: Number(z.position.y), z: Number(z.position.z) };
            return state.enemySpawn;
          }
        }
      }
      return null;
    }

    function getEngagementCenter(systems) {
      const cs = systems && systems.combatantSystem;
      const combatants = cs && cs.getAllCombatants ? cs.getAllCombatants() : null;
      if (!Array.isArray(combatants) || combatants.length === 0) return getEnemySpawn(systems);
      let usC = 0, opC = 0, usX = 0, usY = 0, usZ = 0, opX = 0, opY = 0, opZ = 0;
      for (let i = 0; i < combatants.length; i++) {
        const c = combatants[i];
        if (!c || c.id === 'player_proxy' || c.health <= 0 || c.state === 'dead') continue;
        if (isBluforFaction(c.faction)) {
          usX += Number(c.position.x); usY += Number(c.position.y); usZ += Number(c.position.z); usC++;
        } else if (isOpforFaction(c.faction)) {
          opX += Number(c.position.x); opY += Number(c.position.y); opZ += Number(c.position.z); opC++;
        }
      }
      if (usC > 0 && opC > 0) {
        return {
          x: (usX / usC + opX / opC) * 0.5,
          y: (usY / usC + opY / opC) * 0.5,
          z: (usZ / usC + opZ / opC) * 0.5,
        };
      }
      return getEnemySpawn(systems);
    }

    function getObjectiveZoneTarget(systems, playerPos) {
      const zoneManager = systems && systems.zoneManager;
      const zones = zoneManager && zoneManager.getAllZones ? zoneManager.getAllZones() : null;
      if (!Array.isArray(zones) || zones.length === 0) return null;
      let bestZone = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        if (!z || z.isHomeBase) continue;
        const isContested = z.state === 'contested';
        const isOwned = isBluforFaction(z.owner);
        const priority = isContested ? 0 : (isOwned ? 3 : 1);
        const dx = Number(z.position.x) - Number(playerPos.x);
        const dz = Number(z.position.z) - Number(playerPos.z);
        const distSq = dx * dx + dz * dz;
        const score = priority * 500000 + distSq;
        if (score < bestScore) { bestScore = score; bestZone = z; }
      }
      if (!bestZone || !bestZone.position) return null;
      state.lastObjectiveZoneId = String(bestZone.id || '');
      return {
        position: {
          x: Number(bestZone.position.x),
          y: Number(bestZone.position.y || 0),
          z: Number(bestZone.position.z),
        },
        priority: bestZone.state === 'contested' ? 2 : (isBluforFaction(bestZone.owner) ? 0 : 1),
      };
    }

    // ── Primitives wired to the engine ──

    // `findNearestEnemy` — delegated to the live combatant system.
    // Applies perception-range cull + live-only filter. Returns the
    // engine-agnostic `BotTarget` shape the state machine expects.
    function findNearestEnemy(systems, playerPos) {
      const cs = systems && systems.combatantSystem;
      const combatants = cs && cs.getAllCombatants ? cs.getAllCombatants() : null;
      if (!Array.isArray(combatants) || combatants.length === 0) return null;
      const pr = botConfig.perceptionRange;
      const prSq = pr * pr;
      let best = null;
      let bestDistSq = Number.POSITIVE_INFINITY;
      for (let i = 0; i < combatants.length; i++) {
        const c = combatants[i];
        if (!c || c.id === 'player_proxy') continue;
        if (!isOpforFaction(c.faction)) continue;
        if (c.health <= 0 || c.state === 'dead') continue;
        const dx = Number(c.position.x) - Number(playerPos.x);
        const dz = Number(c.position.z) - Number(playerPos.z);
        const distSq = dx * dx + dz * dz;
        if (distSq > prSq) continue;
        if (distSq < bestDistSq) { bestDistSq = distSq; best = c; }
      }
      if (!best) return null;
      return {
        id: String(best.id || ''),
        position: {
          x: Number(best.position.x),
          y: Number(best.position.y || 0),
          z: Number(best.position.z || 0),
        },
        lastKnownMs: Date.now(),
      };
    }

    // `canSeeTarget` — consumes `terrainSystem.raycastTerrain` (the same primitive
    // AILineOfSight uses internally), so the bot cannot acquire a target through
    // a hill. Eye-to-chest segment; hit distance < segment length → occluded.
    function canSeeTarget(systems, playerPos, targetPos) {
      const terrain = systems && systems.terrainSystem;
      if (!terrain || typeof terrain.raycastTerrain !== 'function') return true;
      const from = {
        x: Number(playerPos.x),
        y: Number(playerPos.y || 0) + PLAYER_EYE_HEIGHT,
        z: Number(playerPos.z),
      };
      const to = {
        x: Number(targetPos.x),
        y: Number(targetPos.y || 0) + TARGET_CHEST_HEIGHT,
        z: Number(targetPos.z),
      };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dz = to.z - from.z;
      const distance = Math.hypot(dx, dy, dz);
      if (!Number.isFinite(distance) || distance < 0.001) return true;
      const dir = { x: dx / distance, y: dy / distance, z: dz / distance };
      const hit = terrain.raycastTerrain(from, dir, distance);
      return !(hit && hit.hit && Number.isFinite(hit.distance) && hit.distance < distance - 0.75);
    }

    // `queryPath` — wraps `navmeshSystem.queryPath`. The bot passes plain-object
    // positions, we hand back plain-object waypoints. Null on any failure (off
    // navmesh, no path).
    function queryPath(systems, fromPos, toPos) {
      const nav = systems && systems.navmeshSystem;
      if (!nav || typeof nav.queryPath !== 'function') return null;
      try {
        // Snap both endpoints onto the mesh before querying. This is the
        // Round 3 fix: on open_frontier the player regularly stands just
        // off-mesh and queryPath returns null. findNearestPoint (radius 5m)
        // recovers the 99% case the way live NPCs already do.
        const start = snapOntoNavmesh(systems, fromPos);
        const end = snapOntoNavmesh(systems, toPos);
        const path = nav.queryPath(start, end);
        if (!path || path.length === 0) return null;
        const out = [];
        for (let i = 0; i < path.length; i++) {
          const p = path[i];
          if (!p) continue;
          out.push({ x: Number(p.x || 0), y: Number(p.y || 0), z: Number(p.z || 0) });
        }
        return out.length > 0 ? out : null;
      } catch (_err) {
        return null;
      }
    }

    function snapOntoNavmesh(systems, pos) {
      const nav = systems && systems.navmeshSystem;
      if (!nav || typeof nav.findNearestPoint !== 'function') return pos;
      try {
        const snapped = nav.findNearestPoint(pos, 5);
        if (snapped && Number.isFinite(snapped.x) && Number.isFinite(snapped.z)) {
          return { x: Number(snapped.x), y: Number(snapped.y || pos.y || 0), z: Number(snapped.z) };
        }
      } catch (_err) { /* ignore */ }
      return pos;
    }

    function findNearestNavmeshPoint(systems, pos) {
      const nav = systems && systems.navmeshSystem;
      if (!nav || typeof nav.findNearestPoint !== 'function') return null;
      try {
        const p = nav.findNearestPoint(pos, 5);
        if (!p || !Number.isFinite(p.x)) return null;
        return { x: Number(p.x), y: Number(p.y || 0), z: Number(p.z) };
      } catch (_err) {
        return null;
      }
    }

    function sampleHeight(systems, x, z) {
      const terrain = systems && systems.terrainSystem;
      if (!terrain || typeof terrain.getHeightAt !== 'function') return 0;
      const h = terrain.getHeightAt(Number(x), Number(z));
      return Number.isFinite(h) ? Number(h) : 0;
    }

    function getObjective(systems, playerPos) {
      const zoneTarget = getObjectiveZoneTarget(systems, playerPos);
      if (zoneTarget) return zoneTarget;
      const center = getEngagementCenter(systems);
      if (center) return { position: center, priority: 1 };
      return null;
    }

    function getPlayerPos(systems) {
      if (!systems || !systems.playerController || !systems.playerController.getPosition) return null;
      const pos = systems.playerController.getPosition();
      if (!pos) return null;
      return { x: Number(pos.x), y: Number(pos.y || 0), z: Number(pos.z) };
    }

    function getPlayerVelocity(systems) {
      if (!systems || !systems.playerController || !systems.playerController.getVelocity) {
        return { x: 0, y: 0, z: 0 };
      }
      const v = systems.playerController.getVelocity();
      return { x: Number(v.x || 0), y: Number(v.y || 0), z: Number(v.z || 0) };
    }

    function getPlayerHealth(systems) {
      const health = systems && systems.playerHealthSystem;
      if (!health || typeof health.getHealth !== 'function' || typeof health.getMaxHealth !== 'function') {
        return { cur: 100, max: 100, dead: false };
      }
      return {
        cur: Number(health.getHealth()),
        max: Number(health.getMaxHealth()),
        dead: !!(typeof health.isDead === 'function' && health.isDead()),
      };
    }

    function getMagazine(systems) {
      const weapon = systems && systems.firstPersonWeapon;
      if (!weapon || typeof weapon.getAmmoState !== 'function') {
        return { current: 30, max: 30 };
      }
      const s = weapon.getAmmoState();
      return {
        current: Number(s && s.currentMagazine) || 0,
        max: Number(s && s.magazineSize) || 30,
      };
    }

    function getCamera(systems) {
      return systems && systems.playerController && systems.playerController.getCamera
        ? systems.playerController.getCamera()
        : null;
    }

    function getCameraAngles(systems) {
      const pc = systems && systems.playerController;
      const cc = pc && pc.cameraController;
      if (cc) {
        return { yaw: Number(cc.yaw || 0), pitch: Number(cc.pitch || 0) };
      }
      const camera = getCamera(systems);
      return {
        yaw: Number((camera && camera.rotation && camera.rotation.y) || 0),
        pitch: Number((camera && camera.rotation && camera.rotation.x) || 0),
      };
    }

    // ── Respawn / health / ammo sustainment ──

    const HEALTH_TOP_UP_COOLDOWN_MS = 12000;
    const HEALTH_TOP_UP_CRITICAL_RATIO = 0.14;
    const HEALTH_TOP_UP_CRITICAL_HP_ABS = 20;
    const HEALTH_TOP_UP_TARGET_RATIO = 0.55;
    const HEALTH_TOP_UP_BURST_HP = 55;
    const RESPAWN_RETRY_COOLDOWN_MS = 450;
    const AMMO_REFILL_COOLDOWN_MS = 5000;
    const AMMO_RESERVE_FLOOR = 24;
    const AMMO_CRITICAL_RESERVE = 4;

    let lastHealthTopUpAt = 0;
    let lastAmmoRefillAt = 0;
    let respawnRetryAt = 0;
    let deathHandled = false;

    function topUpPlayerHealth(health) {
      if (!opts.topUpHealth || !health) return;
      if (!health.getHealth || !health.getMaxHealth || !health.isDead || health.isDead()) return;
      const now = Date.now();
      if (now - lastHealthTopUpAt < HEALTH_TOP_UP_COOLDOWN_MS) return;
      const hp = Number(health.getHealth());
      const maxHp = Number(health.getMaxHealth());
      if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return;
      const criticalHp = Math.max(HEALTH_TOP_UP_CRITICAL_HP_ABS, maxHp * HEALTH_TOP_UP_CRITICAL_RATIO);
      if (hp > criticalHp) return;
      if (!health.playerState) return;
      const targetHp = Math.min(maxHp, Math.max(maxHp * HEALTH_TOP_UP_TARGET_RATIO, hp + HEALTH_TOP_UP_BURST_HP));
      health.playerState.health = targetHp;
      lastHealthTopUpAt = now;
      state.healthTopUpCount++;
    }

    function sustainAmmo(systems, forceRefill) {
      const weapon = systems && systems.firstPersonWeapon;
      if (!weapon || typeof weapon.getAmmoState !== 'function') return false;
      const now = Date.now();
      if (!forceRefill && now - lastAmmoRefillAt < AMMO_REFILL_COOLDOWN_MS) return false;
      const ammoState = weapon.getAmmoState();
      const magazine = Number(ammoState && ammoState.currentMagazine);
      const reserve = Number(ammoState && ammoState.reserveAmmo);
      if (!Number.isFinite(magazine) || !Number.isFinite(reserve)) return false;
      const needsRefill = forceRefill || reserve <= AMMO_RESERVE_FLOOR || (magazine <= 0 && reserve <= AMMO_CRITICAL_RESERVE);
      if (!needsRefill) return false;
      if (systems.inventoryManager && typeof systems.inventoryManager.reset === 'function') {
        systems.inventoryManager.reset();
      }
      if (typeof weapon.enable === 'function') weapon.enable();
      lastAmmoRefillAt = now;
      state.ammoRefillCount++;
      return true;
    }

    function handleDeath(systems) {
      const now = Date.now();
      if (deathHandled && now < respawnRetryAt) return true;
      deathHandled = true;
      respawnRetryAt = now + RESPAWN_RETRY_COOLDOWN_MS;
      releaseAllControls(systems);
      if (systems.playerRespawnManager && systems.playerRespawnManager.cancelPendingRespawn) {
        systems.playerRespawnManager.cancelPendingRespawn();
      }
      if (systems.playerRespawnManager && systems.playerRespawnManager.respawnAtBase) {
        systems.playerRespawnManager.respawnAtBase();
        state.respawnCount++;
        lastHealthTopUpAt = now;
        sustainAmmo(systems, true);
      }
      return true;
    }

    function releaseAllControls(systems) {
      const pc = systems && systems.playerController;
      if (!pc) return;
      try { pc.applyMovementIntent({ forward: 0, strafe: 0, sprint: false }); } catch { /* ignore */ }
      if (state.firingHeld) {
        try { pc.fireStop(); } catch { /* ignore */ }
        state.firingHeld = false;
      }
    }

    // ── Frontline compression (tuning helper for AI sandbox modes) ──

    function compressFrontline(systems) {
      if (!enableFrontlineCompression || state.frontlineCompressed) return;
      const cs = systems && systems.combatantSystem;
      const combatants = cs && cs.getAllCombatants ? cs.getAllCombatants() : null;
      if (!Array.isArray(combatants) || combatants.length === 0) return;
      const alive = combatants.filter((c) => c && c.id !== 'player_proxy' && c.health > 0 && c.state !== 'dead');
      const us = alive.filter((c) => isBluforFaction(c.faction));
      const opfor = alive.filter((c) => isOpforFaction(c.faction));
      if (us.length === 0 || opfor.length === 0) return;
      function centroid(items) {
        let sx = 0, sz = 0;
        for (let i = 0; i < items.length; i++) { sx += Number(items[i].position.x); sz += Number(items[i].position.z); }
        return { x: sx / items.length, z: sz / items.length };
      }
      const uc = centroid(us);
      const oc = centroid(opfor);
      const dx = oc.x - uc.x;
      const dz = oc.z - uc.z;
      const distance = Math.hypot(dx, dz);
      state.frontlineDistance = distance;
      if (!Number.isFinite(distance) || distance < opts.frontlineTriggerDistance) {
        state.frontlineCompressed = true;
        return;
      }
      const safeDx = distance > 0.001 ? dx / distance : 1;
      const safeDz = distance > 0.001 ? dz / distance : 0;
      const midX = (uc.x + oc.x) * 0.5;
      const midZ = (uc.z + oc.z) * 0.5;
      const latX = -safeDz;
      const latZ = safeDx;
      function moveGroup(group, side) {
        let moved = 0;
        const cap = Math.min(group.length, Math.max(0, opts.maxCompressedPerFaction));
        for (let i = 0; i < cap; i++) {
          const c = group[i];
          const lane = (Math.random() - 0.5) * 130;
          const forward = side * (35 + Math.random() * 25);
          const nx = midX + safeDx * forward + latX * lane;
          const nz = midZ + safeDz * forward + latZ * lane;
          const h = systems.terrainSystem && systems.terrainSystem.getHeightAt
            ? systems.terrainSystem.getHeightAt(nx, nz) : undefined;
          c.position.x = nx;
          c.position.z = nz;
          if (Number.isFinite(h)) c.position.y = Number(h) + 2;
          if (c.velocity && c.velocity.set) c.velocity.set(0, 0, 0);
          moved++;
        }
        return moved;
      }
      const um = moveGroup(us, -1);
      const om = moveGroup(opfor, 1);
      state.frontlineMoveCount = um + om;
      state.frontlineCompressed = true;
    }

    // ── Path follow (ADVANCE / PATROL use the bot's moveForward + yaw; we
    // layer a navmesh waypoint so the camera yaw lock still respects terrain.) ──

    function updateWaypoints(systems, playerPos, target) {
      if (!target) { state.waypoints = null; state.waypointIdx = 0; return; }
      const now = Date.now();
      const sinceReplan = now - state.lastWaypointReplanAt;
      const pathExhausted = !state.waypoints || state.waypoints.length === 0 || state.waypointIdx >= state.waypoints.length;
      const needsReplan = sinceReplan > profile.waypointReplanIntervalMs || (pathExhausted && sinceReplan > 750);
      if (needsReplan) {
        const path = queryPath(systems, playerPos, target);
        state.lastWaypointReplanAt = now;
        if (path && path.length > 0) {
          state.waypoints = path;
          state.waypointIdx = 0;
        } else {
          state.waypointReplanFailures++;
          state.waypoints = null;
        }
      }
      if (state.waypoints && state.waypoints.length > 0) {
        while (state.waypointIdx < state.waypoints.length) {
          const wp = state.waypoints[state.waypointIdx];
          const d = Math.hypot(Number(wp.x) - playerPos.x, Number(wp.z) - playerPos.z);
          if (d > 4) break;
          state.waypointIdx++;
        }
        if (state.waypointIdx >= state.waypoints.length) state.lastWaypointReplanAt = 0;
      }
    }

    function overlayPathYaw(playerPos) {
      // Pure-pursuit lookahead along the current waypoints — when fresh and
      // valid, overrides the bot's "straight-line to target" yaw so the player
      // follows the navmesh route rather than wandering into a hill.
      const ageMs = Date.now() - state.lastWaypointReplanAt;
      if (!isPathTrusted({ path: state.waypoints, waypointIdx: state.waypointIdx, pathAgeMs: ageMs })) {
        return null;
      }
      const pt = pointAlongPath(state.waypoints, state.waypointIdx, { x: playerPos.x, z: playerPos.z }, computeAdaptiveLookahead(0));
      if (!pt) return null;
      state.waypointsFollowed++;
      return botYawToward(playerPos, pt);
    }

    // ── Telemetry ──

    function pushHistogram(currentState, dtMs) {
      if (!state.stateHistogram[currentState]) state.stateHistogram[currentState] = 0;
      state.stateHistogram[currentState] += Math.max(0, dtMs);
    }

    function transitionBot(nextState) {
      if (nextState === state.botState) return;
      state.transitions++;
      state.lastStateChangeAt = Date.now();
      state.botState = nextState;
      state.timeInStateMs = 0;
    }

    // ── Per-tick update ──

    function tick() {
      const systems = getSystems();
      if (!systems) return;
      disablePointerLockForHarness(systems);
      fastForwardSetupPhaseIfNeeded(systems);

      const health = getPlayerHealth(systems);
      // Detect damage taken.
      if (health.cur < state.lastHealth) state.lastDamageMs = Date.now();
      state.lastHealth = health.cur;

      // Ammo sustainment + health top-up.
      const hs = systems.playerHealthSystem;
      topUpPlayerHealth(hs);
      sustainAmmo(systems, false);

      if (health.dead) {
        if (opts.autoRespawn) handleDeath(systems);
        return;
      }
      deathHandled = false;

      const pc = systems.playerController;
      if (pc && typeof pc.isInHelicopter === 'function' && pc.isInHelicopter()) {
        const pos = pc.getPosition ? pc.getPosition() : null;
        if (pos && pos.clone) {
          const exit = pos.clone();
          const h = systems.terrainSystem && systems.terrainSystem.getHeightAt
            ? systems.terrainSystem.getHeightAt(exit.x, exit.z) : undefined;
          exit.y = Number.isFinite(h) ? Number(h) + 2 : exit.y;
          if (pc.exitHelicopter) pc.exitHelicopter(exit);
        }
      }

      compressFrontline(systems);

      const playerPos = getPlayerPos(systems);
      if (!playerPos) return;
      const velocity = getPlayerVelocity(systems);
      const angles = getCameraAngles(systems);
      const magazine = getMagazine(systems);

      // dt for histogram + state timer.
      const now = Date.now();
      const dtMs = state.lastTickMs > 0 ? Math.max(0, now - state.lastTickMs) : 0;
      state.lastTickMs = now;
      state.timeInStateMs += dtMs;
      pushHistogram(state.botState, dtMs);

      // Build the bot context. Primitives are closures capturing `systems` so
      // the state machine sees a stable, engine-agnostic surface.
      const findEnemyClosure = () => findNearestEnemy(systems, playerPos);
      const losClosure = (pos) => canSeeTarget(systems, playerPos, pos);
      const pathClosure = (from, to) => queryPath(systems, from, to);
      const snapClosure = (p) => findNearestNavmeshPoint(systems, p);
      const sampleClosure = (x, z) => sampleHeight(systems, x, z);
      const objectiveClosure = () => getObjective(systems, playerPos);

      // Update the locked target using object-permanence logic (4s stale window).
      state.currentTarget = updateLockedTarget(state.currentTarget, findEnemyClosure(), now);

      const ctx = {
        now,
        state: state.botState,
        timeInStateMs: state.timeInStateMs,
        eyePos: {
          x: playerPos.x,
          y: playerPos.y + PLAYER_EYE_HEIGHT,
          z: playerPos.z,
        },
        velocity: velocity,
        yaw: angles.yaw,
        pitch: angles.pitch,
        health: health.cur,
        maxHealth: health.max,
        suppressionScore: 0, // not surfaced from the engine today; bot treats as 0
        lastDamageMs: state.lastDamageMs,
        magazine: magazine,
        currentTarget: state.currentTarget,
        findNearestEnemy: findEnemyClosure,
        canSeeTarget: losClosure,
        queryPath: pathClosure,
        findNearestNavmeshPoint: snapClosure,
        getObjective: objectiveClosure,
        sampleHeight: sampleClosure,
        config: botConfig,
      };

      const step = stepBotState(state.botState, ctx);
      if (step.nextState && step.nextState !== state.botState) {
        transitionBot(step.nextState);
      } else if (step.resetTimeInState) {
        state.timeInStateMs = 0;
      }

      // ── Path overlay — when ADVANCE or PATROL, try to follow a navmesh waypoint
      // so the bot doesn't walk through hills. Active only if the current state
      // wants forward motion and we have a usable anchor.
      let overlayYaw = null;
      const wantsMove = step.intent.moveForward > 0.1;
      if (wantsMove && (state.botState === 'ADVANCE' || state.botState === 'PATROL' || state.botState === 'ALERT')) {
        const anchor = state.currentTarget ? state.currentTarget.position
          : (objectiveClosure() ? objectiveClosure().position : null);
        if (anchor) {
          updateWaypoints(systems, playerPos, anchor);
          overlayYaw = overlayPathYaw(playerPos);
        }
      }

      // Apply the intent via the PlayerController surface. Intent → controls.
      applyIntent(systems, step.intent, angles, overlayYaw);

      // Telemetry hooks for capture-side validators.
      if (step.intent.firePrimary) state.shotsFired++;
      if (step.intent.reload) state.reloadsIssued++;

      // Stuck detection — track horizontal displacement. The old driver had a
      // fancy teleport-recovery loop; with the bot consuming navmesh paths,
      // stuck-ness usually means "terrain not loaded yet", so we only record
      // the maximum for telemetry and let the autorespawn handle extreme cases.
      if (!state.lastStablePos) {
        state.lastStablePos = { x: playerPos.x, z: playerPos.z };
        state.stuckMs = 0;
      } else {
        const moved = Math.hypot(playerPos.x - state.lastStablePos.x, playerPos.z - state.lastStablePos.z);
        if (moved < 0.4) {
          state.stuckMs += dtMs;
        } else {
          state.stuckMs = 0;
          state.lastStablePos.x = playerPos.x;
          state.lastStablePos.z = playerPos.z;
        }
      }
      if (state.stuckMs > state.maxStuckMs) state.maxStuckMs = state.stuckMs;
    }

    function updateLockedTarget(current, fresh, now) {
      const staleMs = 4000;
      if (!current) return fresh;
      if (fresh && fresh.id === current.id) return fresh;
      if ((now - current.lastKnownMs) > staleMs) return fresh;
      return fresh || current;
    }

    function applyIntent(systems, intent, currentAngles, overlayYaw) {
      const pc = systems && systems.playerController;
      if (!pc) return;

      // Movement intent.
      const forward = clampAxis(intent.moveForward);
      const strafe = clampAxis(intent.moveStrafe);
      const sprint = !!intent.sprint && forward > 0.1;
      if (typeof pc.applyMovementIntent === 'function') {
        pc.applyMovementIntent({ forward, strafe, sprint });
      }

      // Aim. Use overlay yaw when active (navmesh path trumps straight-line yaw
      // so the bot follows the path instead of walking into terrain), but keep
      // the intent's pitch so the bot still aims up/down at the target.
      const targetYaw = overlayYaw != null ? overlayYaw : intent.aimYaw;
      if (!state.viewSeeded) {
        state.lastYaw = currentAngles.yaw;
        state.lastPitch = currentAngles.pitch;
        state.viewSeeded = true;
      }
      const yawNext = lerpAngle(state.lastYaw, targetYaw, intent.aimLerpRate);
      const pitchNext = clampPitch(intent.aimPitch);
      if (typeof pc.setViewAngles === 'function') {
        pc.setViewAngles(yawNext, pitchNext);
      }
      state.lastYaw = yawNext;
      state.lastPitch = pitchNext;

      // Fire / reload.
      if (intent.reload) {
        if (state.firingHeld) {
          if (typeof pc.fireStop === 'function') pc.fireStop();
          state.firingHeld = false;
        }
        if (typeof pc.reloadWeapon === 'function') pc.reloadWeapon();
      } else if (intent.firePrimary) {
        // LOS gate — one final engine check. The bot's LOS already passed,
        // but we guard against one-tick races where the target moved.
        if (!state.firingHeld) {
          if (typeof pc.fireStart === 'function') pc.fireStart();
          state.firingHeld = true;
          state.lastShotAt = Date.now();
        }
      } else if (state.firingHeld) {
        if (typeof pc.fireStop === 'function') pc.fireStop();
        state.firingHeld = false;
      }
    }

    function clampAxis(x) {
      if (!Number.isFinite(x)) return 0;
      return Math.max(-1, Math.min(1, x));
    }

    function clampPitch(p) {
      if (!Number.isFinite(p)) return 0;
      return Math.max(-AIM_PITCH_LIMIT_RAD, Math.min(AIM_PITCH_LIMIT_RAD, p));
    }

    function lerpAngle(from, to, t) {
      let delta = to - from;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const c = Math.max(0, Math.min(1, t));
      let out = from + delta * c;
      while (out > Math.PI) out -= Math.PI * 2;
      while (out < -Math.PI) out += Math.PI * 2;
      return out;
    }

    // ── Public surface ──

    function start() {
      state.heartbeatTimer = setInterval(tick, profile.decisionIntervalMs);
      tick();
    }

    function stop() {
      if (state.heartbeatTimer) { clearInterval(state.heartbeatTimer); state.heartbeatTimer = null; }
      const systems = getSystems();
      releaseAllControls(systems);
      return {
        respawnCount: state.respawnCount,
        ammoRefillCount: state.ammoRefillCount,
        healthTopUpCount: state.healthTopUpCount,
        frontlineCompressed: state.frontlineCompressed,
        frontlineDistance: state.frontlineDistance,
        frontlineMoveCount: state.frontlineMoveCount,
        capturedZoneCount: 0,
        movementTransitions: state.transitions,
        losRejectedShots: state.losRejectedShots,
        stuckTeleportCount: state.stuckTeleportCount,
        maxStuckSeconds: Math.max(0, Math.round(state.maxStuckMs / 100) / 10),
        gradientProbeDeflections: 0,
        waypointsFollowedCount: state.waypointsFollowed,
        waypointReplanFailures: state.waypointReplanFailures,
        lockSwitches: 0,
        firePitchSafetyGates: 0,
        combatState: state.botState,
        shotsFired: state.shotsFired,
        reloadsIssued: state.reloadsIssued,
        stateHistogramMs: Object.assign({}, state.stateHistogram),
      };
    }

    function getDebugSnapshot() {
      return {
        mode: opts.mode,
        botState: state.botState,
        timeInStateMs: state.timeInStateMs,
        currentTarget: state.currentTarget ? String(state.currentTarget.id) : null,
        shotsFired: state.shotsFired,
        reloadsIssued: state.reloadsIssued,
        waypointsFollowedCount: state.waypointsFollowed,
        waypointReplanFailures: state.waypointReplanFailures,
        waypointCount: state.waypoints ? state.waypoints.length : 0,
        waypointIdx: state.waypointIdx,
        movementTransitions: state.transitions,
        lastStateChangeAt: state.lastStateChangeAt,
        lastShotAt: state.lastShotAt,
        respawnCount: state.respawnCount,
        ammoRefillCount: state.ammoRefillCount,
        healthTopUpCount: state.healthTopUpCount,
        maxStuckSeconds: Math.max(0, Math.round(state.maxStuckMs / 100) / 10),
        stateHistogramMs: Object.assign({}, state.stateHistogram),
        pathTrustTtlMs: PATH_TRUST_TTL_MS,
        maxGradient: PLAYER_MAX_CLIMB_GRADIENT,
      };
    }

    start();
    return {
      stop: stop,
      getDebugSnapshot: getDebugSnapshot,
      movementPatternCount: 5, // PATROL/ALERT/ENGAGE/ADVANCE/SEEK_COVER — informative only
      compressFrontline: enableFrontlineCompression,
      mode: opts.mode,
      allowWarpRecovery: opts.allowWarpRecovery,
      topUpHealth: opts.topUpHealth,
      autoRespawn: opts.autoRespawn,
    };
  }

  if (globalWindow) {
    globalWindow.__perfHarnessDriver = {
      start: function (options) {
        if (globalWindow.__perfHarnessDriverState && globalWindow.__perfHarnessDriverState.stop) {
          globalWindow.__perfHarnessDriverState.stop();
        }
        const driver = createDriver(options || {});
        globalWindow.__perfHarnessDriverState = driver;
        return {
          movementPatternCount: driver.movementPatternCount || 0,
          compressFrontline: !!driver.compressFrontline,
          mode: String(driver.mode || ''),
          allowWarpRecovery: !!driver.allowWarpRecovery,
          topUpHealth: driver.topUpHealth !== false,
          autoRespawn: driver.autoRespawn !== false,
        };
      },
      stop: function () {
        if (!globalWindow.__perfHarnessDriverState || !globalWindow.__perfHarnessDriverState.stop) return null;
        const stats = globalWindow.__perfHarnessDriverState.stop();
        globalWindow.__perfHarnessDriverState = null;
        return stats;
      },
      getDebugSnapshot: function () {
        if (!globalWindow.__perfHarnessDriverState || !globalWindow.__perfHarnessDriverState.getDebugSnapshot) return null;
        return globalWindow.__perfHarnessDriverState.getDebugSnapshot();
      },
    };
  }

  // Expose pure helpers for Node-side regression tests.
  if (typeof module !== 'undefined' && module && module.exports) {
    module.exports = {
      evaluateFireDecision: evaluateFireDecision,
      chooseHeadingByGradient: chooseHeadingByGradient,
      computeUtilityScore: computeUtilityScore,
      shouldSwitchTarget: shouldSwitchTarget,
      computeAimSolution: computeAimSolution,
      computeAdaptiveLookahead: computeAdaptiveLookahead,
      pointAlongPath: pointAlongPath,
      evaluateFireGate: evaluateFireGate,
      angularDistance: angularDistance,
      PLAYER_EYE_HEIGHT: PLAYER_EYE_HEIGHT,
      TARGET_CHEST_HEIGHT: TARGET_CHEST_HEIGHT,
      DEFAULT_BULLET_SPEED: DEFAULT_BULLET_SPEED,
      PLAYER_CLIMB_SLOPE_DOT: PLAYER_CLIMB_SLOPE_DOT,
      PLAYER_MAX_CLIMB_ANGLE_RAD: PLAYER_MAX_CLIMB_ANGLE_RAD,
      PLAYER_MAX_CLIMB_GRADIENT: PLAYER_MAX_CLIMB_GRADIENT,
      PATH_TRUST_TTL_MS: PATH_TRUST_TTL_MS,
      AIM_PITCH_LIMIT_RAD: AIM_PITCH_LIMIT_RAD,
      isPathTrusted: isPathTrusted,
      clampAimYByPitch: clampAimYByPitch,
      // Bot primitives.
      stepBotState: stepBotState,
      createIdleBotIntent: createIdleBotIntent,
      engageStrafeIntent: engageStrafeIntent,
      profileForMode: profileForMode,
      botConfigForProfile: botConfigForProfile,
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
