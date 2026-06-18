// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

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
    const allowSteepGroundFire = !!(opts && opts.allowSteepGroundFire);

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
    if (verticalComponent > vThreshold && !closeRange && !allowSteepGroundFire) {
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

  // Actor-height mirrors. PlayerController.getPosition() and combatant.position
  // are already eye-level actor anchors, matching PlayerMovement.PLAYER_EYE_HEIGHT
  // and CombatantConfig.NPC_Y_OFFSET. Only ground/objective points need a
  // positive look height; combatant targets need a center-mass offset below
  // their actor anchor.
  const PLAYER_EYE_HEIGHT = 2.2;
  // Mirrors the visual chest proxy center from CombatantConfig and
  // CombatantBodyMetrics. Keep this formula aligned with
  // src/dev/harness/playerBot/states.ts.
  const NPC_PIXEL_FORGE_VISUAL_HEIGHT = 2.95 * 1.0;
  const COMBATANT_HIT_PROXY_VISUAL_HEIGHT_MULTIPLIER = 1.16;
  const COMBATANT_HIT_PROXY_CHEST_START_RATIO = 0.46;
  const COMBATANT_HIT_PROXY_CHEST_END_RATIO = 0.72;
  const COMBATANT_HIT_PROXY_CHEST_CENTER_RATIO =
    (COMBATANT_HIT_PROXY_CHEST_START_RATIO + COMBATANT_HIT_PROXY_CHEST_END_RATIO) / 2;
  const COMBATANT_HIT_PROXY_CHEST_RADIUS_RATIO = 0.18;
  const TARGET_ACTOR_AIM_Y_OFFSET =
    NPC_PIXEL_FORGE_VISUAL_HEIGHT
    * COMBATANT_HIT_PROXY_VISUAL_HEIGHT_MULTIPLIER
    * COMBATANT_HIT_PROXY_CHEST_CENTER_RATIO
    - PLAYER_EYE_HEIGHT;
  const TARGET_CHEST_HEIGHT = PLAYER_EYE_HEIGHT + TARGET_ACTOR_AIM_Y_OFFSET;
  const TARGET_LOS_HEIGHT = TARGET_CHEST_HEIGHT;
  const DEFAULT_BULLET_SPEED = 400;

  function targetActorAimYOffset(scaleY) {
    const scale = Number.isFinite(Number(scaleY)) ? Number(scaleY) : 1;
    return NPC_PIXEL_FORGE_VISUAL_HEIGHT
      * COMBATANT_HIT_PROXY_VISUAL_HEIGHT_MULTIPLIER
      * scale
      * COMBATANT_HIT_PROXY_CHEST_CENTER_RATIO
      - PLAYER_EYE_HEIGHT;
  }

  function targetChestProxyRadius(scaleY) {
    const scale = Number.isFinite(Number(scaleY)) ? Number(scaleY) : 1;
    return NPC_PIXEL_FORGE_VISUAL_HEIGHT
      * COMBATANT_HIT_PROXY_VISUAL_HEIGHT_MULTIPLIER
      * scale
      * COMBATANT_HIT_PROXY_CHEST_RADIUS_RATIO;
  }

  function computeRayAimMetrics(origin, direction, aimPoint, proxyRadius) {
    if (!origin || !direction || !aimPoint) return null;
    const tx = Number(aimPoint.x) - Number(origin.x);
    const ty = Number(aimPoint.y) - Number(origin.y);
    const tz = Number(aimPoint.z) - Number(origin.z);
    const targetDistance = Math.hypot(tx, ty, tz);
    const dirLen = Math.hypot(Number(direction.x), Number(direction.y), Number(direction.z));
    if (!Number.isFinite(targetDistance) || targetDistance <= 1e-6 || !Number.isFinite(dirLen) || dirLen <= 1e-6) {
      return null;
    }
    const fx = Number(direction.x) / dirLen;
    const fy = Number(direction.y) / dirLen;
    const fz = Number(direction.z) / dirLen;
    const aimDot = (fx * tx + fy * ty + fz * tz) / targetDistance;
    const clampedDot = Math.max(-1, Math.min(1, Number.isFinite(aimDot) ? aimDot : -1));
    const closestDistance = Math.max(0, fx * tx + fy * ty + fz * tz);
    const closestX = Number(origin.x) + fx * closestDistance;
    const closestY = Number(origin.y) + fy * closestDistance;
    const closestZ = Number(origin.z) + fz * closestDistance;
    const missDistance = Math.hypot(
      Number(aimPoint.x) - closestX,
      Number(aimPoint.y) - closestY,
      Number(aimPoint.z) - closestZ,
    );
    const radius = Number.isFinite(Number(proxyRadius)) && Number(proxyRadius) > 0
      ? Number(proxyRadius)
      : null;
    return {
      aimDot: clampedDot,
      aimAngleDeg: Math.acos(clampedDot) * 180 / Math.PI,
      aimMissDistance: missDistance,
      aimMissRadiusRatio: radius !== null ? missDistance / radius : null,
      aimDistance: targetDistance,
      rayDistanceToClosestAim: closestDistance,
    };
  }

  // Player's maximum walkable slope, derived from SlopePhysics.PLAYER_CLIMB_SLOPE_DOT.
  const PLAYER_CLIMB_SLOPE_DOT = 0.7;
  const PLAYER_MAX_CLIMB_ANGLE_RAD = Math.acos(PLAYER_CLIMB_SLOPE_DOT);
  const PLAYER_MAX_CLIMB_GRADIENT = Math.tan(PLAYER_MAX_CLIMB_ANGLE_RAD);

  // Path-trust invariant (perf-harness-verticality-and-sizing).
  const PATH_TRUST_TTL_MS = 5000;
  const ROUTE_MICRO_TARGET_DISTANCE = 3;
  const ROUTE_MICRO_TARGET_ANCHOR_DISTANCE = 12;
  const ROUTE_TARGET_REPLAN_DISTANCE = 24;
  const ROUTE_PROGRESS_MIN_IMPROVEMENT = 8;
  const ROUTE_PROGRESS_MIN_CLOSURE_RATIO = 0.15;
  const ROUTE_PROGRESS_TIMEOUT_MS = 6000;
  const ROUTE_PROGRESS_MIN_TRAVEL = 60;
  const ROUTE_NO_PROGRESS_TARGET_COOLDOWN_MS = 8000;
  const ROUTE_FAILED_OBJECTIVE_COOLDOWN_MS = 12000;
  const ROUTE_OVERLAY_WALK_RECOVERY_STUCK_MS = 600;
  const RUNTIME_TERRAIN_BLOCK_TARGET_COOLDOWN_MS = 3000;
  const SHOT_EPOCH_HISTORY_LIMIT = 32;
  const ROUTE_SNAP_EPOCH_HISTORY_LIMIT = 32;
  const FIRING_RETARGET_EPOCH_HISTORY_LIMIT = 32;
  const NAVMESH_START_SNAP_RADIUS = 80;
  const NAVMESH_TARGET_SNAP_RADIUS = 80;
  const NAVMESH_TRUSTED_ROUTE_SNAP_DISTANCE = 24;
  const COMBAT_APPROACH_MIN_HOLD_DISTANCE = 45;
  const COMBAT_APPROACH_MAX_HOLD_DISTANCE = 170;
  const COMBAT_APPROACH_CLOSE_STANDOFF_DISTANCE = 85;
  const COMBAT_APPROACH_LATERAL_MIN = 24;
  const COMBAT_APPROACH_LATERAL_MAX = 90;
  // Humanized synthetic-camera slew cap. The driver used to allow 24 deg yaw /
  // 8 deg pitch in one tick, which made route-to-fire handoffs look unlike a
  // player mouse sweep and could perturb terrain/CDLOD presentation.
  const DRIVER_VIEW_MAX_YAW_STEP_RAD = (12 * Math.PI) / 180;
  const DRIVER_VIEW_MAX_PITCH_STEP_RAD = (4 * Math.PI) / 180;

  function normalizeDriverSeed(raw) {
    const seed = Number(raw);
    if (!Number.isFinite(seed) || seed < 0) return null;
    return Math.floor(seed) >>> 0;
  }

  function createSeededRandom(seed) {
    let state = normalizeDriverSeed(seed);
    if (state === null) return Math.random;
    return function seededRandom() {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

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
    if (path.length === 1 || idx >= path.length - 1) {
      const last = path[path.length - 1];
      return last ? { x: Number(last.x || 0), y: Number(last.y || 0), z: Number(last.z || 0) } : null;
    }

    const pos = fromPos || path[idx];
    const px = Number(pos && pos.x || 0);
    const pz = Number(pos && pos.z || 0);
    const lookahead = Number.isFinite(lookaheadDist) && lookaheadDist > 0 ? Number(lookaheadDist) : 8;
    const cumulative = new Array(path.length).fill(0);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1] || {};
      const b = path[i] || {};
      cumulative[i] = cumulative[i - 1] + Math.hypot(
        Number(b.x || 0) - Number(a.x || 0),
        Number(b.z || 0) - Number(a.z || 0),
      );
    }

    let best = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    for (let i = idx; i < path.length - 1; i++) {
      const a = path[i] || {};
      const b = path[i + 1] || {};
      const ax = Number(a.x || 0);
      const az = Number(a.z || 0);
      const bx = Number(b.x || 0);
      const bz = Number(b.z || 0);
      const vx = bx - ax;
      const vz = bz - az;
      const segSq = vx * vx + vz * vz;
      if (segSq <= 1e-8) continue;
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / segSq));
      const qx = ax + vx * t;
      const qz = az + vz * t;
      const dx = qx - px;
      const dz = qz - pz;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistanceSq) {
        bestDistanceSq = dSq;
        best = {
          distance: cumulative[i] + Math.sqrt(segSq) * t,
        };
      }
    }
    if (!best) {
      const wp = path[idx];
      best = { distance: cumulative[idx], x: Number(wp.x || 0), z: Number(wp.z || 0) };
    }

    const targetDistance = Math.min(cumulative[cumulative.length - 1], best.distance + lookahead);
    for (let i = idx; i < path.length - 1; i++) {
      const a = path[i] || {};
      const b = path[i + 1] || {};
      const segStart = cumulative[i];
      const segEnd = cumulative[i + 1];
      const segLen = segEnd - segStart;
      if (segLen <= 1e-8) continue;
      if (targetDistance <= segEnd || i === path.length - 2) {
        const t = Math.max(0, Math.min(1, (targetDistance - segStart) / segLen));
        const ax = Number(a.x || 0);
        const ay = Number(a.y || 0);
        const az = Number(a.z || 0);
        const bx = Number(b.x || 0);
        const by = Number(b.y || 0);
        const bz = Number(b.z || 0);
        return {
          x: ax + (bx - ax) * t,
          y: ay + (by - ay) * t,
          z: az + (bz - az) * t,
        };
      }
    }
    const last = path[path.length - 1];
    return last ? { x: Number(last.x || 0), y: Number(last.y || 0), z: Number(last.z || 0) } : null;
  }

  // ── Waypoint advance + replan + pit-trap heuristics (bot-pathing-pit-and-steep-uphill). ──
  //
  // The driver's old advance-rule used horizontal-only distance to decide a
  // waypoint had been "passed". On steep uphill that fired before the bot
  // had actually climbed to the waypoint's height, which exhausted the path
  // mid-climb and triggered a 750ms-cadence re-plan. The bot then zigzagged.
  //
  // These helpers fence both decisions behind explicit horizontal AND vertical
  // tolerances, and surface the steep-climb case as a separate predicate so
  // the fast-replan path can defer while the bot is still climbing.
  //
  // Defaults:
  //   - horizontalTolerance 4m: same as the prior live-driver value.
  //   - verticalTolerance 2.5m: roughly one player-eye-height (2.2m) plus a
  //     small margin so a waypoint at ground-level still counts as reached.
  //   - steepClimbVerticalDelta 3m: heuristic for "still climbing"; matches
  //     the brief.

  function shouldAdvanceWaypoint(opts) {
    const player = opts && opts.playerPos;
    const wp = opts && opts.waypoint;
    if (!player || !wp) return false;
    const hTol = Number.isFinite(opts && opts.horizontalTolerance) && opts.horizontalTolerance > 0
      ? Number(opts.horizontalTolerance) : 4;
    const vTol = Number.isFinite(opts && opts.verticalTolerance) && opts.verticalTolerance > 0
      ? Number(opts.verticalTolerance) : 2.5;
    const dx = Number(wp.x || 0) - Number(player.x || 0);
    const dz = Number(wp.z || 0) - Number(player.z || 0);
    const horizontal = Math.hypot(dx, dz);
    if (horizontal > hTol) return false;
    // Some navmesh waypoints carry a y; if absent (or non-finite) we treat
    // the waypoint as planar and accept the advance on horizontal proximity.
    const wy = Number(wp.y);
    const py = Number(player.y);
    if (!Number.isFinite(wy) || !Number.isFinite(py)) return true;
    return Math.abs(wy - py) <= vTol;
  }

  function isSteepClimbWaypoint(opts) {
    const player = opts && opts.playerPos;
    const wp = opts && opts.waypoint;
    if (!player || !wp) return false;
    const climbDelta = Number.isFinite(opts && opts.climbDelta) && opts.climbDelta > 0
      ? Number(opts.climbDelta) : 3;
    const dx = Number(wp.x || 0) - Number(player.x || 0);
    const dz = Number(wp.z || 0) - Number(player.z || 0);
    const horizontal = Math.hypot(dx, dz);
    // Only "steep" if the waypoint is meaningfully above us AND still nearby
    // (within ~12m horizontally — beyond that the slope is averaged out).
    if (horizontal > 12) return false;
    const wy = Number(wp.y);
    const py = Number(player.y);
    if (!Number.isFinite(wy) || !Number.isFinite(py)) return false;
    return (wy - py) > climbDelta;
  }

  function shouldFastReplan(opts) {
    const pathExhausted = !!(opts && opts.pathExhausted);
    const sinceReplanMs = Number(opts && opts.sinceReplanMs);
    const fastReplanMs = Number.isFinite(opts && opts.fastReplanMs) && opts.fastReplanMs > 0
      ? Number(opts.fastReplanMs) : 750;
    if (!pathExhausted) return false;
    if (!Number.isFinite(sinceReplanMs) || sinceReplanMs <= fastReplanMs) return false;
    // Suppress the fast re-plan while the bot is mid-climb to a waypoint that
    // is still above it. The path is still trustworthy; we just need time to
    // climb. The full TTL re-plan still fires (handled outside this helper).
    if (opts && opts.steepClimbActive) return false;
    return true;
  }

  function detectPitTrap(opts) {
    const stuckMs = Number(opts && opts.stuckMs);
    const stuckThresholdMs = Number.isFinite(opts && opts.stuckThresholdMs) && opts.stuckThresholdMs > 0
      ? Number(opts.stuckThresholdMs) : 4000;
    if (!Number.isFinite(stuckMs) || stuckMs < stuckThresholdMs) return false;
    const player = opts && opts.playerPos;
    const wp = opts && opts.currentWaypoint;
    const pitDelta = Number.isFinite(opts && opts.pitVerticalDelta) && opts.pitVerticalDelta > 0
      ? Number(opts.pitVerticalDelta) : 3;
    if (!player || !wp) {
      // No active waypoint context — still surface as a pit-trap when stuck.
      // The caller decides whether to escape; this predicate is purely
      // observational so the test can pin "stuck for long enough" alone.
      return true;
    }
    const wy = Number(wp.y);
    const py = Number(player.y);
    if (!Number.isFinite(wy) || !Number.isFinite(py)) return true;
    // True pit signature: the next waypoint is meaningfully above us. If
    // the waypoint is at or below us, the bot is stuck for some other
    // reason (terrain wall, geometry pinch); the caller can still react
    // but a pit-escape teleport is the wrong fix. Return false here so
    // the escape path is reserved for the up-and-out case.
    return (wy - py) > pitDelta;
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

  function sampleTerrainLineHeight(terrain, x, z) {
    if (!terrain) return null;
    const sample = typeof terrain.getEffectiveHeightAt === 'function'
      ? terrain.getEffectiveHeightAt(x, z)
      : typeof terrain.getHeightAt === 'function'
        ? terrain.getHeightAt(x, z)
        : null;
    const height = Number(sample);
    return Number.isFinite(height) ? height : null;
  }

  function findHeightProfileTerrainBlock(terrain, from, dir, distance, clearance) {
    if (!terrain || (typeof terrain.getEffectiveHeightAt !== 'function' && typeof terrain.getHeightAt !== 'function')) {
      return null;
    }
    if (!Number.isFinite(distance) || distance <= 0) return null;
    const targetClearance = Number.isFinite(Number(clearance)) ? Math.max(0, Number(clearance)) : 0.75;
    const endpointPadding = Math.min(8, Math.max(targetClearance, distance * 0.05));
    // Terrain raycasts can miss when the camera is very close to, or already
    // partly inside, a hillside. Do not blind the driver to the first few
    // meters of terrain; this LOS result gates both target acquisition and
    // firing in the perf harness.
    const startDistance = Math.max(targetClearance, Math.min(2, endpointPadding));
    const stopDistance = distance - endpointPadding;
    if (stopDistance <= startDistance) return null;
    const step = Math.max(2, Math.min(4, distance / 96));
    const occlusionMargin = -0.25;
    for (let d = startDistance; d < stopDistance; d += step) {
      const x = from.x + dir.x * d;
      const y = from.y + dir.y * d;
      const z = from.z + dir.z * d;
      const terrainY = sampleTerrainLineHeight(terrain, x, z);
      if (terrainY === null) continue;
      if (terrainY - y >= occlusionMargin) {
        return d;
      }
    }
    return null;
  }

  function queryTerrainLineOfSight(terrain, fromPos, toPos, clearance) {
    if (!terrain || typeof terrain.raycastTerrain !== 'function') {
      return { status: 'unknown', clear: false, reason: 'missing_terrain_raycast' };
    }
    const from = {
      x: Number(fromPos && fromPos.x),
      y: Number((fromPos && fromPos.y) || 0),
      z: Number(fromPos && fromPos.z),
    };
    const to = {
      x: Number(toPos && toPos.x),
      y: Number((toPos && toPos.y) || 0),
      z: Number(toPos && toPos.z),
    };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const distance = Math.hypot(dx, dy, dz);
    if (!Number.isFinite(distance)) {
      return { status: 'unknown', clear: false, reason: 'invalid_query' };
    }
    if (distance < 0.001) {
      return { status: 'clear', clear: true, reason: 'degenerate_distance' };
    }
    const dir = { x: dx / distance, y: dy / distance, z: dz / distance };
    let hit;
    try {
      hit = terrain.raycastTerrain(from, dir, distance);
    } catch (_error) {
      return { status: 'unknown', clear: false, reason: 'raycast_error' };
    }
    const targetClearance = Number.isFinite(Number(clearance)) ? Math.max(0, Number(clearance)) : 0.75;
    if (!hit || !hit.hit) {
      const profileBlockDistance = findHeightProfileTerrainBlock(terrain, from, dir, distance, targetClearance);
      if (profileBlockDistance !== null) {
        return {
          status: 'blocked',
          clear: false,
          reason: 'height_profile_blocked',
          distance: profileBlockDistance,
        };
      }
      return { status: 'clear', clear: true, reason: 'raycast_miss' };
    }
    if (!Number.isFinite(Number(hit.distance))) {
      return { status: 'unknown', clear: false, reason: 'invalid_hit_distance' };
    }
    if (Number(hit.distance) < distance - targetClearance) {
      return { status: 'blocked', clear: false, reason: 'terrain_hit_before_target' };
    }
    return { status: 'clear', clear: true, reason: 'hit_within_target_clearance' };
  }

  function hasClearTerrainLineOfSight(terrain, fromPos, toPos, clearance) {
    return queryTerrainLineOfSight(terrain, fromPos, toPos, clearance).clear;
  }

  function angularDistance(yaw1, pitch1, yaw2, pitch2) {
    let dy = Number(yaw2) - Number(yaw1);
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const dp = Number(pitch2) - Number(pitch1);
    return Math.hypot(dy, dp);
  }

  function signedYawDelta(fromYaw, toYaw) {
    let delta = Number(toYaw) - Number(fromYaw);
    if (!Number.isFinite(delta)) return 0;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function clampSigned(value, maxAbs) {
    const v = Number(value);
    const limit = Math.max(0, Number(maxAbs) || 0);
    if (!Number.isFinite(v)) return 0;
    if (v > limit) return limit;
    if (v < -limit) return -limit;
    return v;
  }

  function clampDriverPitch(p) {
    if (!Number.isFinite(p)) return 0;
    return Math.max(-AIM_PITCH_LIMIT_RAD, Math.min(AIM_PITCH_LIMIT_RAD, p));
  }

  function applyViewSlewLimit(currentYaw, currentPitch, targetYaw, targetPitch, limits) {
    const yawLimit = Number.isFinite(Number(limits && limits.yaw))
      ? Math.max(0, Number(limits.yaw))
      : DRIVER_VIEW_MAX_YAW_STEP_RAD;
    const pitchLimit = Number.isFinite(Number(limits && limits.pitch))
      ? Math.max(0, Number(limits.pitch))
      : DRIVER_VIEW_MAX_PITCH_STEP_RAD;
    const yawDelta = signedYawDelta(currentYaw, targetYaw);
    const pitchDelta = Number(targetPitch) - Number(currentPitch);
    const clampedYawDelta = clampSigned(yawDelta, yawLimit);
    const clampedPitchDelta = clampSigned(pitchDelta, pitchLimit);
    const yaw = Number(currentYaw) + clampedYawDelta;
    const pitch = clampDriverPitch(Number(currentPitch) + clampedPitchDelta);
    return {
      yaw,
      pitch,
      yawDelta,
      pitchDelta,
      remainingYawDelta: signedYawDelta(yaw, targetYaw),
      remainingPitchDelta: Number(targetPitch) - pitch,
      yawClamped: Math.abs(clampedYawDelta - yawDelta) > 1e-9,
      pitchClamped: Math.abs(clampedPitchDelta - pitchDelta) > 1e-9,
    };
  }

  function syncViewAnchorToActual(anchorYaw, anchorPitch, actualYaw, actualPitch, epsilonRad) {
    const yawFallback = Number.isFinite(Number(anchorYaw)) ? Number(anchorYaw) : 0;
    const pitchFallback = clampDriverPitch(Number.isFinite(Number(anchorPitch)) ? Number(anchorPitch) : 0);
    const yaw = Number.isFinite(Number(actualYaw)) ? Number(actualYaw) : yawFallback;
    const pitch = Number.isFinite(Number(actualPitch)) ? clampDriverPitch(Number(actualPitch)) : pitchFallback;
    const yawDelta = signedYawDelta(yawFallback, yaw);
    const pitchDelta = pitch - pitchFallback;
    const epsilon = Number.isFinite(Number(epsilonRad)) ? Math.max(0, Number(epsilonRad)) : 1e-4;
    return {
      yaw,
      pitch,
      yawDelta,
      pitchDelta,
      changed: Math.abs(yawDelta) > epsilon || Math.abs(pitchDelta) > epsilon,
    };
  }

  // ── Objective zone selector (pure, exported for Node-side regression tests). ──
  //
  // Picks the next capture zone the harness bot should march on.
  //
  // Rules (mode-agnostic; callers pass in the friendly-faction predicate):
  //   - Skip home-base zones — the bot never targets its own or the enemy
  //     spawn as an objective.
  //   - Skip zones that are friendly-owned AND not contested. This is the
  //     cycling-fix invariant: once a zone is ours and uncontested, it is
  //     NOT a valid objective. On wide maps (e.g. A Shau) the previous
  //     "prefer distant unowned zones" scoring still picked a nearby owned
  //     zone because `priority * 500_000` was swamped by distSq across 10+
  //     km. Hard-skipping the owned-uncontested class prevents the loop.
  //   - Among the remaining candidates, prefer contested (someone is taking
  //     it from us right now), then unowned/enemy-held, breaking ties by
  //     squared distance. Returns null when no actionable zone remains.
  //
  // `isFriendly(owner)` is passed in so the selector stays faction-agnostic
  // and unit-testable without the BLUFOR/OPFOR constants.
  function pickObjectiveZone(opts) {
    const zones = opts && Array.isArray(opts.zones) ? opts.zones : null;
    if (!zones || zones.length === 0) return null;
    const playerPos = opts && opts.playerPos;
    if (!playerPos) return null;
    const isFriendly = (opts && typeof opts.isFriendly === 'function')
      ? opts.isFriendly
      : () => false;
    const px = Number(playerPos.x);
    const pz = Number(playerPos.z);
    if (!Number.isFinite(px) || !Number.isFinite(pz)) return null;
    // Lexicographic sort: priority class first (contested > unowned/enemy),
    // then distance. Explicit lex order is safer than a composite score on
    // wide maps (e.g. A Shau's ~20 km diagonal) where distSq would swamp any
    // fixed priority weight.
    let best = null;
    let bestPriority = Number.POSITIVE_INFINITY;
    let bestDistSq = Number.POSITIVE_INFINITY;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (!z || z.isHomeBase || !z.position) continue;
      const isContested = z.state === 'contested';
      const ownedByUs = isFriendly(z.owner);
      // Cycling-fix: friendly-owned non-contested zones are NOT actionable.
      if (ownedByUs && !isContested) continue;
      const dx = Number(z.position.x) - px;
      const dz = Number(z.position.z) - pz;
      if (!Number.isFinite(dx) || !Number.isFinite(dz)) continue;
      const distSq = dx * dx + dz * dz;
      // Priority 0 = contested (defend / retake now), 1 = unowned / enemy.
      const priority = isContested ? 0 : 1;
      if (priority < bestPriority || (priority === bestPriority && distSq < bestDistSq)) {
        best = z;
        bestPriority = priority;
        bestDistSq = distSq;
      }
    }
    return best;
  }

  function selectPatrolObjective(opts) {
    const aggressive = !!(opts && opts.aggressiveMode);
    const combatObjective = opts && opts.combatObjective && opts.combatObjective.position
      ? opts.combatObjective
      : null;
    const zoneObjective = opts && opts.zoneObjective && opts.zoneObjective.position
      ? opts.zoneObjective
      : null;
    const fallbackObjective = opts && opts.fallbackObjective && opts.fallbackObjective.position
      ? opts.fallbackObjective
      : null;
    const maxCombatDistance = Number(opts && opts.combatObjectiveMaxDistance);
    const combatDistance = Number(combatObjective && combatObjective.distance);
    const combatInDetourRange =
      combatObjective &&
      Number.isFinite(combatDistance) &&
      (!Number.isFinite(maxCombatDistance) || combatDistance <= maxCombatDistance);

    if (aggressive && combatInDetourRange) return combatObjective;
    if (zoneObjective) return zoneObjective;
    if (combatInDetourRange) return combatObjective;
    return fallbackObjective;
  }

  function objectiveTelemetryKey(objective, zoneId) {
    if (!objective || !objective.position) return null;
    const kind = String(objective.kind || 'unknown');
    if (kind === 'zone' && zoneId) return `zone:${String(zoneId)}`;
    if (objective.id !== null && objective.id !== undefined && String(objective.id) !== '') {
      return `${kind}:${String(objective.id)}`;
    }
    return kind;
  }

  function objectiveBlockKey(kind, id) {
    if (kind === null || kind === undefined || id === null || id === undefined || String(id) === '') return null;
    return `${String(kind)}:${String(id)}`;
  }

  function routeTargetIdentityKey(kind, objective, zoneId) {
    const normalizedKind = kind ? String(kind) : 'unknown';
    const routeObjective = objective && objective.position
      ? objective
      : objective
        ? { kind: normalizedKind, position: objective }
        : null;
    return objectiveTelemetryKey(routeObjective, zoneId) ?? normalizedKind;
  }

  // ── Combat stat helpers (pure, exported for Node-side regression tests). ──
  //
  // The driver polls the engine's PlayerStatsTracker each tick. These
  // helpers turn a (baseline, current) pair of polled snapshots into a
  // monotonically-increasing run total, ignoring snapshots that look
  // corrupt (negative, NaN). They also gracefully handle the
  // PlayerStatsTracker being reset mid-run (e.g. on respawn) by
  // re-baselining when the polled value drops below the baseline.

  function deltaSinceBaseline(currentValue, baselineValue) {
    const cur = Number(currentValue);
    const base = Number(baselineValue);
    if (!Number.isFinite(cur)) return 0;
    if (!Number.isFinite(base)) return Math.max(0, cur);
    return Math.max(0, cur - base);
  }

  function rebasedTotal(prevTotal, currentValue, baselineValue) {
    const prev = Number.isFinite(prevTotal) ? Number(prevTotal) : 0;
    const cur = Number(currentValue);
    const base = Number(baselineValue);
    if (!Number.isFinite(cur)) return { total: prev, newBaseline: base };
    // PlayerStatsTracker reset (cur dropped below baseline). Fold the
    // last segment into prev and rebase to current.
    if (Number.isFinite(base) && cur < base) {
      return { total: prev, newBaseline: cur };
    }
    return { total: prev + deltaSinceBaseline(cur, base), newBaseline: cur };
  }

  function damageTakenDelta(prevHealth, currentHealth) {
    const prev = Number(prevHealth);
    const cur = Number(currentHealth);
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) return 0;
    // Health going up = regen / respawn. Only count strict drops.
    if (cur >= prev) return 0;
    return prev - cur;
  }

  function computeAccuracy(shotsFired, shotsHit) {
    const f = Number(shotsFired);
    const h = Number(shotsHit);
    if (!Number.isFinite(f) || f <= 0) return 0;
    if (!Number.isFinite(h) || h <= 0) return 0;
    return Math.max(0, Math.min(1, h / f));
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

  // ── Match-end detection (harness-lifecycle-halt-on-match-end). ──
  //
  // The harness bot plays for BLUFOR; the live engine signals victory through
  // TicketSystem.getGameState() which exposes { phase: 'ENDED', winner: Faction }.
  // GameModeManager itself does not expose a match-end query — TicketSystem is
  // the canonical owner of that lifecycle bit. Pure helper so the Node test
  // can assert the outcome mapping without spinning up the engine.

  // Modes without a faction win condition (harness-match-end-skip-ai-sandbox).
  // TicketSystem reports phase='ENDED' from the start in ai_sandbox — no
  // tickets, no objective — which would otherwise latch match-end on the
  // first sample tick and truncate the capture. Keep the list small and
  // explicit so zone_control / team_deathmatch / open_frontier still exit
  // normally when their real win condition fires.
  const MODES_WITHOUT_WIN_CONDITION = new Set(['ai_sandbox']);

  function detectMatchEnded(gameState, mode) {
    if (mode && MODES_WITHOUT_WIN_CONDITION.has(String(mode).toLowerCase())) return false;
    if (!gameState) return false;
    if (gameState.phase === 'ENDED') return true;
    return gameState.gameActive === false;
  }

  function detectMatchOutcome(gameState, mode) {
    if (!detectMatchEnded(gameState, mode)) return null;
    const winner = gameState && gameState.winner;
    if (isBluforFaction(winner)) return 'victory';
    if (isOpforFaction(winner)) return 'defeat';
    return 'draw';
  }

  // How long perf-capture.ts keeps sampling after the harness reports match-end
  // before tearing down — gives tail frames a chance to flush. The brief
  // specifies 2s; tuneable but kept as a constant so the regression test can
  // assert against the same value.
  const MATCH_END_TAIL_MS = 2000;

  /**
   * Pure decision used by scripts/perf-capture.ts: should the capture loop
   * break out of its `while (Date.now() - startMs < durationSeconds * 1000)`
   * because the harness already observed match-end at least MATCH_END_TAIL_MS
   * ago? Returns false when no match-end has been observed yet (capture runs
   * to its configured duration).
   */
  function shouldFinalizeAfterMatchEnd(matchEndedAtMs, nowMs, tailMs) {
    if (matchEndedAtMs === null || matchEndedAtMs === undefined) return false;
    if (!Number.isFinite(matchEndedAtMs) || !Number.isFinite(nowMs)) return false;
    const tail = Number.isFinite(tailMs) && tailMs >= 0 ? tailMs : MATCH_END_TAIL_MS;
    return nowMs - matchEndedAtMs >= tail;
  }

  function appendBoundedEvent(buffer, event, limit) {
    if (!Array.isArray(buffer)) return [];
    const max = Math.max(1, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : SHOT_EPOCH_HISTORY_LIMIT);
    if (buffer.length < max) {
      buffer.push(event);
      return buffer;
    }
    if (buffer.length > max) {
      const retainStart = buffer.length - max;
      for (let i = 0; i < max; i++) {
        buffer[i] = buffer[i + retainStart];
      }
      buffer.length = max;
    }
    buffer.copyWithin(0, 1, max);
    buffer[max - 1] = event;
    return buffer;
  }

  function finiteOrNull(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function sanitizeVector3Like(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      x: finiteOrNull(value.x),
      y: finiteOrNull(value.y),
      z: finiteOrNull(value.z),
    };
  }

  function sanitizeRotationDegLike(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      yaw: finiteOrNull(value.yaw),
      pitch: finiteOrNull(value.pitch),
      roll: finiteOrNull(value.roll),
    };
  }

  function sanitizeQuaternionLike(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      x: finiteOrNull(value.x),
      y: finiteOrNull(value.y),
      z: finiteOrNull(value.z),
      w: finiteOrNull(value.w),
    };
  }

  function sanitizeCameraDeltaLike(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      positionMeters: finiteOrNull(value.positionMeters),
      yawDeg: finiteOrNull(value.yawDeg),
      pitchDeg: finiteOrNull(value.pitchDeg),
      rollDeg: finiteOrNull(value.rollDeg),
    };
  }

  function sanitizePresentationCameraEpoch(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      stage: typeof value.stage === 'string' ? value.stage : 'unknown',
      frameCount: finiteOrNull(value.frameCount),
      atMs: finiteOrNull(value.atMs),
      cameraSource: typeof value.cameraSource === 'string' ? value.cameraSource : 'unknown',
      position: sanitizeVector3Like(value.position),
      rotationDeg: sanitizeRotationDegLike(value.rotationDeg),
      quaternion: sanitizeQuaternionLike(value.quaternion),
      deltaFromPrevious: sanitizeCameraDeltaLike(value.deltaFromPrevious),
    };
  }

  function sanitizePresentationTerrainSample(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      terrainHeightAtCamera: finiteOrNull(value.terrainHeightAtCamera),
      effectiveHeightAtCamera: finiteOrNull(value.effectiveHeightAtCamera),
      clearanceMeters: finiteOrNull(value.clearanceMeters),
      effectiveClearanceMeters: finiteOrNull(value.effectiveClearanceMeters),
      hasTerrain: typeof value.hasTerrain === 'boolean' ? value.hasTerrain : null,
      areaReady: typeof value.areaReady === 'boolean' ? value.areaReady : null,
    };
  }

  function sanitizeStringNumberRecord(value) {
    if (!value || typeof value !== 'object') return {};
    const output = {};
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      const numeric = finiteOrNull(value[key]);
      if (numeric !== null) output[String(key)] = numeric;
    }
    return output;
  }

  function sanitizePresentationTerrainEpoch(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      tileCount: finiteOrNull(value.tileCount),
      tileSelectionSaturated: typeof value.tileSelectionSaturated === 'boolean'
        ? value.tileSelectionSaturated
        : null,
      tileHash: typeof value.tileHash === 'string' ? value.tileHash : null,
      tileIdentityHash: typeof value.tileIdentityHash === 'string' ? value.tileIdentityHash : null,
      morphHash: typeof value.morphHash === 'string' ? value.morphHash : null,
      edgeMaskHash: typeof value.edgeMaskHash === 'string' ? value.edgeMaskHash : null,
      lodCounts: sanitizeStringNumberRecord(value.lodCounts),
      morphingTiles: finiteOrNull(value.morphingTiles),
      maxMorphFactor: finiteOrNull(value.maxMorphFactor),
      edgeMorphTiles: finiteOrNull(value.edgeMorphTiles),
      edgeMorphMaskCounts: sanitizeStringNumberRecord(value.edgeMorphMaskCounts),
      minTileSize: finiteOrNull(value.minTileSize),
      maxTileSize: finiteOrNull(value.maxTileSize),
      cameraSample: sanitizePresentationTerrainSample(value.cameraSample),
    };
  }

  function sanitizePresentationTerrainSync(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      didSync: typeof value.didSync === 'boolean' ? value.didSync : null,
      reason: typeof value.reason === 'string' ? value.reason : 'unknown',
      selectionRechecked: typeof value.selectionRechecked === 'boolean' ? value.selectionRechecked : null,
      poseWasStale: typeof value.poseWasStale === 'boolean' ? value.poseWasStale : null,
      projectionChanged: typeof value.projectionChanged === 'boolean' ? value.projectionChanged : null,
      positionDeltaMeters: finiteOrNull(value.positionDeltaMeters),
      rotationDeltaDeg: finiteOrNull(value.rotationDeltaDeg),
      tileCount: finiteOrNull(value.tileCount),
      tileSelectionSaturated: typeof value.tileSelectionSaturated === 'boolean'
        ? value.tileSelectionSaturated
        : null,
      terrainBufferSubmitted: typeof value.terrainBufferSubmitted === 'boolean'
        ? value.terrainBufferSubmitted
        : null,
      submissionClassification: typeof value.submissionClassification === 'string'
        ? value.submissionClassification
        : null,
    };
  }

  function sanitizePresentationTerrainRender(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      instanceSubmissions: finiteOrNull(value.instanceSubmissions),
      regularInstanceSubmissions: finiteOrNull(value.regularInstanceSubmissions),
      lateSyncInstanceSubmissions: finiteOrNull(value.lateSyncInstanceSubmissions),
      lateSyncSameIdentitySubmissions: finiteOrNull(value.lateSyncSameIdentitySubmissions),
      lateSyncDynamicsChangedSubmissions: finiteOrNull(value.lateSyncDynamicsChangedSubmissions),
      lateSyncTileSetChangedSubmissions: finiteOrNull(value.lateSyncTileSetChangedSubmissions),
      unchangedSubmissionSkips: finiteOrNull(value.unchangedSubmissionSkips),
      lastSelectionMs: finiteOrNull(value.lastSelectionMs),
      lastUpdateInstancesMs: finiteOrNull(value.lastUpdateInstancesMs),
      boundedShadowPassEnabled: typeof value.boundedShadowPassEnabled === 'boolean'
        ? value.boundedShadowPassEnabled
        : null,
      shadowRadiusMeters: finiteOrNull(value.shadowRadiusMeters),
      shadowPrefixInstances: finiteOrNull(value.shadowPrefixInstances),
      lastMainPassInstances: finiteOrNull(value.lastMainPassInstances),
      lastShadowPassInstances: finiteOrNull(value.lastShadowPassInstances),
      lastMainPassEdgeSkirtInstances: finiteOrNull(value.lastMainPassEdgeSkirtInstances),
      lastShadowPassEdgeSkirtInstances: finiteOrNull(value.lastShadowPassEdgeSkirtInstances),
      shadowPrefixRatio: finiteOrNull(value.shadowPrefixRatio),
      shadowPassReductions: finiteOrNull(value.shadowPassReductions),
      edgeShadowPassReductions: finiteOrNull(value.edgeShadowPassReductions),
      sparseEdgeSkirtsEnabled: typeof value.sparseEdgeSkirtsEnabled === 'boolean'
        ? value.sparseEdgeSkirtsEnabled
        : null,
      tileInteriorTriangles: finiteOrNull(value.tileInteriorTriangles),
      tileSkirtTriangles: finiteOrNull(value.tileSkirtTriangles),
      tileSkirtTrianglesPerEdge: finiteOrNull(value.tileSkirtTrianglesPerEdge),
      tileTotalTriangles: finiteOrNull(value.tileTotalTriangles),
      tileFullSkirtTriangles: finiteOrNull(value.tileFullSkirtTriangles),
      lastMainPassTriangleEstimate: finiteOrNull(value.lastMainPassTriangleEstimate),
      lastShadowPassTriangleEstimate: finiteOrNull(value.lastShadowPassTriangleEstimate),
      playableWorldSize: finiteOrNull(value.playableWorldSize),
      visualWorldSize: finiteOrNull(value.visualWorldSize),
      visualMargin: finiteOrNull(value.visualMargin),
      maxLODLevels: finiteOrNull(value.maxLODLevels),
      lodRange0: finiteOrNull(value.lodRange0),
      lodRangeLast: finiteOrNull(value.lodRangeLast),
      lod0VertexSpacing: finiteOrNull(value.lod0VertexSpacing),
    };
  }

  function sanitizePresentationRendererStats(value) {
    if (!value || typeof value !== 'object') return null;
    return {
      drawCalls: finiteOrNull(value.drawCalls),
      triangles: finiteOrNull(value.triangles),
      geometries: finiteOrNull(value.geometries),
      textures: finiteOrNull(value.textures),
      programs: finiteOrNull(value.programs),
    };
  }

  function sanitizePresentationContext(value) {
    if (!value || typeof value !== 'object') return null;
    const terrainByStage = {};
    if (value.terrainByStage && typeof value.terrainByStage === 'object') {
      for (const stage in value.terrainByStage) {
        if (!Object.prototype.hasOwnProperty.call(value.terrainByStage, stage)) continue;
        const terrain = sanitizePresentationTerrainEpoch(value.terrainByStage[stage]);
        if (terrain) terrainByStage[String(stage)] = terrain;
      }
    }
    return {
      frameCount: finiteOrNull(value.frameCount),
      atMs: finiteOrNull(value.atMs),
      cameraEpochs: Array.isArray(value.cameraEpochs)
        ? value.cameraEpochs.slice(-8).map(sanitizePresentationCameraEpoch).filter(Boolean)
        : [],
      terrain: sanitizePresentationTerrainEpoch(value.terrain),
      terrainByStage,
      terrainSync: sanitizePresentationTerrainSync(value.terrainSync),
      terrainRender: sanitizePresentationTerrainRender(value.terrainRender),
      renderer: sanitizePresentationRendererStats(value.renderer),
    };
  }

  function readPresentationContextForShot() {
    const w = globalWindow;
    const store = w && w.__presentationEpochContext;
    if (!store || typeof store.getLatestContext !== 'function') return null;
    try {
      return sanitizePresentationContext(store.getLatestContext());
    } catch (_err) {
      return null;
    }
  }

  function collisionContributorSortY(contributor) {
    const value = Number(contributor && contributor.maxY || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function addTopCollisionContributor(out, contributor, limit) {
    if (!Array.isArray(out) || !contributor) return out;
    const max = Math.max(1, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 5);
    const candidateY = collisionContributorSortY(contributor);
    let insertIndex = out.length;
    for (let i = 0; i < out.length; i++) {
      if (candidateY > collisionContributorSortY(out[i])) {
        insertIndex = i;
        break;
      }
    }
    if (insertIndex >= max) return out;
    const cappedLength = Math.min(out.length, max - 1);
    out.length = Math.min(out.length + 1, max);
    for (let i = out.length - 1; i > insertIndex; i--) {
      if (i - 1 < cappedLength) out[i] = out[i - 1];
    }
    out[insertIndex] = contributor;
    return out;
  }

  function shouldRecordRouteSnapEpoch(opts) {
    const start = opts && opts.start;
    const end = opts && opts.end;
    const status = String((opts && opts.status) || 'unknown');
    const startDistance = start && Number.isFinite(Number(start.distance)) ? Number(start.distance) : null;
    const endDistance = end && Number.isFinite(Number(end.distance)) ? Number(end.distance) : null;
    return !!(
      (start && start.snapped) ||
      (end && end.snapped) ||
      !(start && start.found) ||
      !(end && end.found) ||
      status !== 'nav_ok' ||
      (startDistance !== null && startDistance > 0.01) ||
      (endDistance !== null && endDistance > 0.01)
    );
  }

  function createIdleBotIntent() {
    return {
      moveForward: 0,
      moveStrafe: 0,
      sprint: false,
      crouch: false,
      jump: false,
      // World-space aim target. null = hold current view angles.
      aimTarget: null,
      // World-space movement look target. Used for camera-relative path
      // following while moving but not firing.
      movementTarget: null,
      aimLerpRate: 1,
      firePrimary: false,
      reload: false,
    };
  }

  function selectDriverViewTarget(intent, overlayPoint, moving) {
    const movementTarget = (intent && intent.movementTarget) || overlayPoint || null;
    if (moving && movementTarget && !(intent && intent.firePrimary)) {
      return movementTarget;
    }
    return intent && intent.aimTarget ? intent.aimTarget : null;
  }

  function classifyDriverViewTarget(intent, overlayPoint, viewTarget) {
    if (!viewTarget) return null;
    if (intent && intent.aimTarget === viewTarget) return 'aim_target';
    if (intent && intent.movementTarget === viewTarget) return 'movement_target';
    if (overlayPoint && overlayPoint === viewTarget) return 'route_overlay';
    return 'other';
  }

  function computeWorldMovementIntent(intent, overlayPoint, playerPos) {
    if (!intent || !playerPos) return null;
    const forward = Number(intent.moveForward || 0);
    const strafe = Number(intent.moveStrafe || 0);
    const wantsMove = Math.abs(forward) > 0.1 || Math.abs(strafe) > 0.1;
    if (!wantsMove) return null;
    const target = intent.movementTarget || overlayPoint || (forward > 0.1 ? intent.aimTarget : null) || null;
    if (!target) return null;
    const dx = Number(target.x || 0) - Number(playerPos.x || 0);
    const dz = Number(target.z || 0) - Number(playerPos.z || 0);
    const len = Math.hypot(dx, dz);
    if (!Number.isFinite(len) || len < 0.5) {
      return { x: 0, z: 0, distance: Number.isFinite(len) ? len : 0 };
    }
    return { x: dx / len, z: dz / len, distance: len };
  }

  function computeCameraRelativeMovementIntent(intent, overlayPoint, playerPos, yawRad) {
    const forward = Number(intent && intent.moveForward || 0);
    const strafe = Number(intent && intent.moveStrafe || 0);
    const wantsMove = Math.abs(forward) > 0.1 || Math.abs(strafe) > 0.1;
    if (!intent || !wantsMove) {
      return { forward: 0, strafe: 0, targetDistance: null, targetYawDeltaDeg: null };
    }
    const target = intent.movementTarget || overlayPoint || (forward > 0.1 ? intent.aimTarget : null) || null;
    if (!target || !playerPos || !Number.isFinite(Number(yawRad))) {
      return { forward: forward, strafe: strafe, targetDistance: null, targetYawDeltaDeg: null };
    }
    const dx = Number(target.x || 0) - Number(playerPos.x || 0);
    const dz = Number(target.z || 0) - Number(playerPos.z || 0);
    const len = Math.hypot(dx, dz);
    if (!Number.isFinite(len) || len < 0.5) {
      return { forward: 0, strafe: 0, targetDistance: Number.isFinite(len) ? len : 0, targetYawDeltaDeg: 0 };
    }
    // PlayerMovement camera-relative convention: yaw 0 means world -Z
    // forward, and positive strafe is camera-right.
    const targetYaw = Math.atan2(dx, -dz);
    const delta = signedYawDelta(Number(yawRad), targetYaw);
    const relativeForward = Math.max(0, Math.cos(delta));
    const relativeStrafe = Math.sin(delta);
    const axisLen = Math.hypot(relativeForward, relativeStrafe);
    const normalizedForward = axisLen > 1 ? relativeForward / axisLen : relativeForward;
    const normalizedStrafe = axisLen > 1 ? relativeStrafe / axisLen : relativeStrafe;
    return {
      forward: normalizedForward,
      strafe: normalizedStrafe,
      targetDistance: len,
      targetYawDeltaDeg: Math.abs(delta) * 180 / Math.PI,
    };
  }

  function computeViewMovementDivergence(viewTarget, intent, overlayPoint, playerPos) {
    if (!viewTarget || !intent || !playerPos) return null;
    const movementTarget = intent.movementTarget || overlayPoint || null;
    if (!movementTarget) return null;
    const ax = Number(viewTarget.x || 0) - Number(playerPos.x || 0);
    const az = Number(viewTarget.z || 0) - Number(playerPos.z || 0);
    const mx = Number(movementTarget.x || 0) - Number(playerPos.x || 0);
    const mz = Number(movementTarget.z || 0) - Number(playerPos.z || 0);
    const aimLen = Math.hypot(ax, az);
    const moveLen = Math.hypot(mx, mz);
    if (!Number.isFinite(aimLen) || !Number.isFinite(moveLen) || aimLen < 1e-6 || moveLen < 1e-6) return null;
    const dot = Math.max(-1, Math.min(1, (ax * mx + az * mz) / (aimLen * moveLen)));
    return {
      angleDeg: Math.acos(dot) * 180 / Math.PI,
      aimDistance: aimLen,
      movementDistance: moveLen,
    };
  }

  function applyRouteOverlayRecovery(intent, overlayPoint, stuckMs) {
    if (!intent || !overlayPoint || intent.firePrimary) return intent;
    const wantsMove = Math.abs(Number(intent.moveForward || 0)) > 0.1
      || Math.abs(Number(intent.moveStrafe || 0)) > 0.1;
    if (!wantsMove) return intent;

    const stuck = Number(stuckMs || 0);
    // Route-following on real terrain can need infantry walk speed once the
    // stuck detector sees no progress, but healthy long-map route segments
    // should keep normal player sprint so completion captures reach combat.
    if (stuck >= ROUTE_OVERLAY_WALK_RECOVERY_STUCK_MS) {
      intent.sprint = false;
    }

    if (stuck > 2000) {
      const side = Math.floor(stuck / 1750) % 2 === 0 ? 1 : -1;
      const existingStrafe = Number(intent.moveStrafe || 0);
      intent.moveStrafe = Math.max(-1, Math.min(1, existingStrafe + side * 0.55));
    }
    return intent;
  }

  function shouldTrackHarnessStuckProgress(intent) {
    if (!intent) return false;
    return Math.abs(Number(intent.moveForward || 0)) > 0.1
      || Math.abs(Number(intent.moveStrafe || 0)) > 0.1;
  }

  function shouldSkipStuckWaypoint(opts) {
    const stuckMs = Number(opts && opts.stuckMs);
    if (!Number.isFinite(stuckMs) || stuckMs < 4500) return false;
    const path = opts && opts.path;
    const waypointIdx = Number(opts && opts.waypointIdx);
    if (!Array.isArray(path) || path.length < 2) return false;
    if (!Number.isInteger(waypointIdx) || waypointIdx < 0) return false;
    return waypointIdx < path.length - 1;
  }

  function hasRouteTargetMoved(opts) {
    const last = opts && opts.lastTarget;
    const next = opts && opts.nextTarget;
    const threshold = Number.isFinite(Number(opts && opts.threshold))
      ? Number(opts.threshold)
      : ROUTE_TARGET_REPLAN_DISTANCE;
    if (!last || !next) return false;
    if (last.x === null || last.x === undefined || last.z === null || last.z === undefined) return false;
    if (next.x === null || next.x === undefined || next.z === null || next.z === undefined) return false;
    const lx = Number(last.x);
    const lz = Number(last.z);
    const nx = Number(next.x);
    const nz = Number(next.z);
    if (!Number.isFinite(lx) || !Number.isFinite(lz) || !Number.isFinite(nx) || !Number.isFinite(nz)) {
      return false;
    }
    return Math.hypot(nx - lx, nz - lz) > Math.max(0, threshold);
  }

  function shouldResetRouteForNoProgress(opts) {
    const currentDistance = Number(opts && opts.currentDistance);
    const baselineDistance = Number(opts && opts.baselineDistance);
    const elapsedMs = Number(opts && opts.elapsedMs);
    const playerMoved = Number(opts && opts.playerMoved);
    if (!Number.isFinite(currentDistance) || !Number.isFinite(baselineDistance)) return false;
    if (!Number.isFinite(elapsedMs) || !Number.isFinite(playerMoved)) return false;
    const minImprovement = Number.isFinite(Number(opts && opts.minImprovement))
      ? Number(opts.minImprovement)
      : ROUTE_PROGRESS_MIN_IMPROVEMENT;
    const minClosureRatio = Number.isFinite(Number(opts && opts.minClosureRatio))
      ? Number(opts.minClosureRatio)
      : ROUTE_PROGRESS_MIN_CLOSURE_RATIO;
    const timeoutMs = Number.isFinite(Number(opts && opts.timeoutMs))
      ? Number(opts.timeoutMs)
      : ROUTE_PROGRESS_TIMEOUT_MS;
    const minTravel = Number.isFinite(Number(opts && opts.minTravel))
      ? Number(opts.minTravel)
      : ROUTE_PROGRESS_MIN_TRAVEL;
    const closure = baselineDistance - currentDistance;
    const closureRatio = playerMoved > 0 ? closure / playerMoved : closure > 0 ? Number.POSITIVE_INFINITY : 0;
    if (closure >= Math.max(0, minImprovement) && closureRatio >= Math.max(0, minClosureRatio)) {
      return false;
    }
    return elapsedMs >= Math.max(0, timeoutMs) && playerMoved >= Math.max(0, minTravel);
  }

  function isTargetTemporarilyBlocked(id, blockedTargets, nowMs) {
    if (id === null || id === undefined || !blockedTargets) return false;
    const key = String(id);
    const until = Number(blockedTargets[key]);
    const now = Number(nowMs);
    if (!Number.isFinite(until) || !Number.isFinite(now)) return false;
    if (until <= now) {
      try { delete blockedTargets[key]; } catch (_err) { /* ignore */ }
      return false;
    }
    return true;
  }

  function markTargetTemporarilyBlocked(blockedTargets, id, nowMs, durationMs) {
    if (!blockedTargets || id === null || id === undefined) return false;
    const now = Number(nowMs);
    const duration = Number.isFinite(Number(durationMs)) && Number(durationMs) > 0
      ? Number(durationMs)
      : ROUTE_NO_PROGRESS_TARGET_COOLDOWN_MS;
    if (!Number.isFinite(now)) return false;
    blockedTargets[String(id)] = now + duration;
    return true;
  }

  function addNearestVisibleCheckCandidate(candidates, candidate, maxCandidates) {
    if (!Array.isArray(candidates) || !candidate) return;
    const limit = Math.max(1, Number.isFinite(Number(maxCandidates)) ? Math.floor(Number(maxCandidates)) : 12);
    let insertAt = candidates.length;
    for (let i = 0; i < candidates.length; i++) {
      if (candidate.distSq < candidates[i].distSq) {
        insertAt = i;
        break;
      }
    }
    if (insertAt >= limit && candidates.length >= limit) {
      if (candidates.length > limit) {
        candidates.length = limit;
      }
      return;
    }
    const nextLength = Math.min(candidates.length + 1, limit);
    for (let i = nextLength - 1; i > insertAt; i--) {
      candidates[i] = candidates[i - 1];
    }
    candidates[insertAt] = candidate;
    candidates.length = nextLength;
  }

  function selectVisiblePreferredEnemyCandidate(opts) {
    const combatants = opts && Array.isArray(opts.combatants) ? opts.combatants : [];
    const playerPos = opts && opts.playerPos;
    if (!playerPos || combatants.length === 0) return null;
    const perceptionRange = Math.max(0, Number(opts && opts.perceptionRange || 0));
    const perceptionSq = perceptionRange > 0 ? perceptionRange * perceptionRange : Number.POSITIVE_INFINITY;
    const maxFireDistance = Math.max(0, Number(opts && opts.maxFireDistance || 0));
    const fireSq = maxFireDistance > 0 ? maxFireDistance * maxFireDistance : perceptionSq;
    const maxVisibleChecks = Number.isFinite(Number(opts && opts.maxVisibleChecks))
      ? Math.max(1, Math.floor(Number(opts.maxVisibleChecks)))
      : 12;
    const isEnemy = opts && typeof opts.isEnemy === 'function' ? opts.isEnemy : () => true;
    const isBlocked = opts && typeof opts.isBlocked === 'function' ? opts.isBlocked : () => false;
    const canSeeTarget = opts && typeof opts.canSeeTarget === 'function' ? opts.canSeeTarget : null;
    const viewForward = opts && opts.viewForward;
    const viewFx = Number(viewForward && viewForward.x);
    const viewFz = Number(viewForward && viewForward.z);
    const viewForwardLen = Math.hypot(viewFx, viewFz);
    const hasViewForward = Number.isFinite(viewForwardLen) && viewForwardLen > 1e-6;
    const minForwardDot = 0.5;
    let nearest = null;
    let nearestDistSq = Number.POSITIVE_INFINITY;
    const visibleCheckCandidates = [];

    for (let i = 0; i < combatants.length; i++) {
      const c = combatants[i];
      if (!c || c.id === 'player_proxy') continue;
      if (!isEnemy(c)) continue;
      if (c.health <= 0 || c.state === 'dead') continue;
      if (isBlocked(c)) continue;
      if (!c.position) continue;
      const dx = Number(c.position.x) - Number(playerPos.x);
      const dz = Number(c.position.z) - Number(playerPos.z);
      const distSq = dx * dx + dz * dz;
      if (!Number.isFinite(distSq) || distSq > perceptionSq) continue;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = c;
      }
      if (canSeeTarget && distSq <= fireSq) {
        addNearestVisibleCheckCandidate(visibleCheckCandidates, { combatant: c, distSq }, maxVisibleChecks);
      }
    }

    let fallbackVisible = null;
    for (let i = 0; i < visibleCheckCandidates.length; i++) {
      const candidate = visibleCheckCandidates[i];
      if (canSeeTarget(candidate.combatant.position)) {
        const selected = {
          combatant: candidate.combatant,
          distance: Math.sqrt(candidate.distSq),
          visible: true,
        };
        if (!fallbackVisible) fallbackVisible = selected;
        if (!hasViewForward) return selected;
        const tx = Number(candidate.combatant.position.x) - Number(playerPos.x);
        const tz = Number(candidate.combatant.position.z) - Number(playerPos.z);
        const targetLen = Math.hypot(tx, tz);
        const facingDot = Number.isFinite(targetLen) && targetLen > 1e-6
          ? ((tx / targetLen) * (viewFx / viewForwardLen)) + ((tz / targetLen) * (viewFz / viewForwardLen))
          : -1;
        if (facingDot >= minForwardDot) return selected;
      }
    }
    if (fallbackVisible) return fallbackVisible;

    return nearest ? {
      combatant: nearest,
      distance: Math.sqrt(nearestDistSq),
      visible: false,
    } : null;
  }

  function shouldUseTargetForCurrentObjective(opts) {
    const target = opts && opts.target;
    if (!target || !target.position) return false;
    const objective = opts && opts.objective;
    if (!objective || !objective.position) return true;
    const playerPos = opts && opts.playerPos;
    if (!playerPos) return false;
    const targetDistance = botHorizontalDistance(playerPos, target.position);
    if (!Number.isFinite(targetDistance)) return false;

    const objectiveKind = String(objective.kind || '');
    const acquisitionDistance = Math.max(0, Number(opts && opts.acquisitionDistance || 0));
    const maxFireDistance = Math.max(acquisitionDistance, Number(opts && opts.maxFireDistance || acquisitionDistance));
    const botState = String(opts && opts.botState || 'PATROL');
    const current = opts && opts.currentTarget;
    const sameLockedTarget = current && target && String(current.id || '') === String(target.id || '');
    const canSeeTarget = opts && typeof opts.canSeeTarget === 'function'
      ? !!opts.canSeeTarget(target.position)
      : false;

    if (objectiveKind === 'nearest_opfor') {
      return canSeeTarget && targetDistance <= maxFireDistance;
    }

    const interruptDistance = Math.max(acquisitionDistance, maxFireDistance);
    if (targetDistance <= interruptDistance && canSeeTarget) return true;
    if (!sameLockedTarget) return false;
    if (botState !== 'ALERT' && botState !== 'ENGAGE' && botState !== 'ADVANCE') return false;
    // Close-pressure fights can momentarily occlude the locked target behind
    // another NPC or a terrain/cover sample. Hold the lock through that short
    // flicker so the driver does not yaw 180 degrees between nearby candidates
    // on every decision tick.
    return targetDistance <= maxFireDistance;
  }

  function shouldUseRouteOverlayForIntent(opts) {
    const intent = opts && opts.intent;
    if (!intent) return false;
    const wantsMove = Math.abs(Number(intent.moveForward || 0)) > 0.1
      || Math.abs(Number(intent.moveStrafe || 0)) > 0.1;
    if (!wantsMove) return false;
    const botState = String(opts && opts.botState || '');
    if (botState !== 'ADVANCE' && botState !== 'PATROL' && botState !== 'ALERT' && botState !== 'ENGAGE') {
      return false;
    }

    // Keep movement aim-aligned whenever the current target is visible.
    // ADVANCE still owns routed occlusion recovery; ENGAGE owns short-range
    // pressure including reload/fire gaps.
    if (opts && opts.currentTarget) {
      if (botState === 'ENGAGE') return false;
      if ((botState === 'ADVANCE' || botState === 'ALERT') && opts.currentTargetVisible === true) {
        return false;
      }
    }

    return botState === 'ADVANCE' || botState === 'PATROL' || botState === 'ALERT' || botState === 'ENGAGE';
  }

  function shouldUseDirectCombatRouteFallback(opts) {
    const targetKind = String(opts && opts.targetKind || '');
    if (targetKind !== 'current_target' && targetKind !== 'nearest_opfor') return false;
    if (!opts || opts.targetVisible !== true) return false;
    const failureReason = String(opts && opts.failureReason || '');
    if (
      failureReason !== 'end_snap_failed'
      && failureReason !== 'start_snap_failed'
      && failureReason !== 'snap_distance_untrusted'
    ) return false;
    const targetDistance = Number(opts && opts.targetDistance);
    if (!Number.isFinite(targetDistance) || targetDistance <= 0) return false;
    const maxDistance = Number(opts && opts.maxDistance);
    if (!Number.isFinite(maxDistance) || maxDistance <= 0) return false;
    return targetDistance <= maxDistance;
  }

  function shouldUseDirectCombatRouteBypass(opts) {
    const targetKind = String(opts && opts.targetKind || '');
    if (targetKind !== 'current_target' && targetKind !== 'nearest_opfor') return false;
    if (!opts || opts.targetVisible !== true) return false;
    const targetDistance = Number(opts && opts.targetDistance);
    if (!Number.isFinite(targetDistance) || targetDistance <= 0) return false;
    const maxDistance = Number(opts && opts.maxDistance);
    if (!Number.isFinite(maxDistance) || maxDistance <= 0) return false;
    return targetDistance <= maxDistance;
  }

  function shouldUseTerrainDirectObjectiveRoute(opts) {
    if (!opts || opts.allowTerrainDirect !== true) return false;
    const targetKind = String(opts.targetKind || '');
    if (
      targetKind !== 'zone'
      && targetKind !== 'engagement_center'
      && targetKind !== 'nearest_opfor'
      && targetKind !== 'current_target'
    ) {
      return false;
    }
    const targetDistance = Number(opts.targetDistance);
    if (!Number.isFinite(targetDistance) || targetDistance <= 0) return false;
    if ((targetKind === 'nearest_opfor' || targetKind === 'current_target') && opts.targetVisible !== true) {
      return false;
    }
    return true;
  }

  function shouldUseTerrainDirectCombatApproachRoute(opts) {
    if (!opts || opts.allowTerrainDirect !== true) return false;
    return opts.hasCombatApproachTarget === true;
  }

  function shouldCooldownCombatTargetAfterRouteFailure(opts) {
    const targetKind = String(opts && opts.targetKind || '');
    if (targetKind !== 'current_target' && targetKind !== 'nearest_opfor') return false;
    if (opts && opts.targetVisible === true) return false;
    const failureReason = String(opts && opts.failureReason || '');
    return failureReason === 'end_snap_failed'
      || failureReason === 'start_snap_failed'
      || failureReason === 'snap_distance_untrusted'
      || failureReason === 'combat_approach_unavailable'
      || failureReason === 'nav_failed';
  }

  function shouldCooldownCombatTargetAfterNoProgress(opts) {
    const targetKind = String(opts && opts.targetKind || '');
    return targetKind === 'current_target' || targetKind === 'nearest_opfor';
  }

  function routeFailureIdentityTargetId(routeIdentityKey, targetKind) {
    if (routeIdentityKey === null || routeIdentityKey === undefined) return null;
    const key = String(routeIdentityKey);
    const kind = String(targetKind || '');
    if (!kind) return null;
    const prefix = `${kind}:`;
    if (!key.startsWith(prefix)) return null;
    const id = key.slice(prefix.length);
    return id ? id : null;
  }

  function routeFailureCooldownTargetId(currentTarget, routeTarget, routeIdentityKey, targetKind) {
    const kind = String(targetKind || '');
    const currentId = currentTarget && currentTarget.id !== null && currentTarget.id !== undefined
      ? String(currentTarget.id)
      : null;
    const routeId = routeTarget && routeTarget.id !== null && routeTarget.id !== undefined
      ? String(routeTarget.id)
      : null;
    const identityId = routeFailureIdentityTargetId(routeIdentityKey, kind);
    if (kind === 'nearest_opfor') {
      return routeId || identityId || currentId || null;
    }
    return currentId || routeId || identityId || null;
  }

  function shouldRequireTrustedCombatApproachRoute(opts) {
    const targetKind = String(opts && opts.targetKind || '');
    if (targetKind !== 'current_target' && targetKind !== 'nearest_opfor') return false;
    return !(opts && opts.targetVisible === true);
  }

  function shouldCooldownObjectiveAfterRouteFailure(opts) {
    const targetKind = String(opts && opts.targetKind || '');
    if (targetKind !== 'zone') return false;
    const failureReason = String(opts && opts.failureReason || '');
    return failureReason === 'end_snap_failed'
      || failureReason === 'start_snap_failed'
      || failureReason === 'snap_distance_untrusted'
      || failureReason === 'nav_failed'
      || failureReason === 'compute_path_failed';
  }

  function isRouteSnapTrusted(opts) {
    const limit = Number.isFinite(Number(opts && opts.limit))
      ? Math.max(0, Number(opts.limit))
      : NAVMESH_TRUSTED_ROUTE_SNAP_DISTANCE;
    if (opts && opts.startFound === false) return false;
    if (opts && opts.endFound === false) return false;
    const startDistance = finiteDistanceOrNull(opts && opts.startDistance);
    const endDistance = finiteDistanceOrNull(opts && opts.endDistance);
    const startOk = startDistance !== null && startDistance <= limit;
    const endOk = endDistance !== null && endDistance <= limit;
    return startOk && endOk;
  }

  function finiteDistanceOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const distance = Number(value);
    return Number.isFinite(distance) ? distance : null;
  }

  function createDirectCombatFallbackPath(playerPos, target) {
    if (!playerPos || !target) return null;
    const distance = botHorizontalDistance(playerPos, target);
    if (!Number.isFinite(distance) || distance < 0.5) return null;
    return [
      {
        x: Number(playerPos.x || 0),
        y: Number(playerPos.y || 0),
        z: Number(playerPos.z || 0),
      },
      {
        x: Number(target.x || 0),
        y: Number.isFinite(Number(target.y)) ? Number(target.y) : Number(playerPos.y || 0),
        z: Number(target.z || 0),
      },
    ];
  }

  function computeCombatApproachCandidates(playerPos, target) {
    if (!playerPos || !target) return [];
    const distance = botHorizontalDistance(playerPos, target);
    if (!Number.isFinite(distance) || distance < 1) return [];
    const dx = Number(target.x || 0) - Number(playerPos.x || 0);
    const dz = Number(target.z || 0) - Number(playerPos.z || 0);
    const len = Math.hypot(dx, dz);
    if (!Number.isFinite(len) || len < 1e-6) return [];
    const ux = dx / len;
    const uz = dz / len;
    const lateralX = -uz;
    const lateralZ = ux;
    const holdDistance = Math.min(
      COMBAT_APPROACH_MAX_HOLD_DISTANCE,
      Math.max(COMBAT_APPROACH_MIN_HOLD_DISTANCE, distance * 0.22),
    );
    const lateralDistance = Math.min(
      COMBAT_APPROACH_LATERAL_MAX,
      Math.max(COMBAT_APPROACH_LATERAL_MIN, holdDistance * 0.5),
    );
    const targetY = Number.isFinite(Number(target.y)) ? Number(target.y) : Number(playerPos.y || 0);
    const baseHold = Math.min(holdDistance, Math.max(0, distance - 8));
    const pushCandidate = (items, backoff, lateral, options) => {
      const allowRetreat = options && options.allowRetreat === true;
      if (!Number.isFinite(backoff) || backoff <= 0) return;
      if (!allowRetreat && backoff >= distance) return;
      if (allowRetreat && backoff <= distance + 6) return;
      const x = Number(target.x || 0) - ux * backoff + lateralX * lateral;
      const z = Number(target.z || 0) - uz * backoff + lateralZ * lateral;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (allowRetreat) {
        const playerDistance = Math.hypot(x - Number(playerPos.x || 0), z - Number(playerPos.z || 0));
        if (
          !Number.isFinite(playerDistance)
          || playerDistance < 6
          || playerDistance > COMBAT_APPROACH_MAX_HOLD_DISTANCE
        ) {
          return;
        }
      }
      items.push({ x, y: targetY, z });
    };
    const candidates = [];
    if (distance < COMBAT_APPROACH_MIN_HOLD_DISTANCE) {
      const retreatHold = Math.min(
        COMBAT_APPROACH_MAX_HOLD_DISTANCE,
        Math.max(COMBAT_APPROACH_CLOSE_STANDOFF_DISTANCE, COMBAT_APPROACH_MIN_HOLD_DISTANCE),
      );
      pushCandidate(candidates, retreatHold, 0, { allowRetreat: true });
      pushCandidate(candidates, Math.min(COMBAT_APPROACH_MAX_HOLD_DISTANCE, retreatHold * 1.25), 0, { allowRetreat: true });
      pushCandidate(candidates, retreatHold, lateralDistance, { allowRetreat: true });
      pushCandidate(candidates, retreatHold, -lateralDistance, { allowRetreat: true });
      return candidates;
    }
    pushCandidate(candidates, baseHold, 0);
    pushCandidate(candidates, Math.min(distance - 4, baseHold * 1.45), 0);
    pushCandidate(candidates, baseHold, lateralDistance);
    pushCandidate(candidates, baseHold, -lateralDistance);
    pushCandidate(candidates, Math.min(distance - 4, baseHold * 0.75), lateralDistance * 0.5);
    pushCandidate(candidates, Math.min(distance - 4, baseHold * 0.75), -lateralDistance * 0.5);
    return candidates;
  }

  function shouldIssueFireStart(firingHeld, weaponFiringActive) {
    if (weaponFiringActive === false) return true;
    return !firingHeld;
  }

  function shouldPulseHarnessFire(opts) {
    if (!opts || opts.firePrimary !== true) return false;
    const weaponType = String(opts.weaponType || '').toLowerCase();
    return weaponType !== 'launcher';
  }

  function shouldReleaseFireForRetarget(firingHeld, previousTargetId, selectedTargetId) {
    if (!firingHeld) return false;
    const previous = previousTargetId === null || previousTargetId === undefined ? null : String(previousTargetId);
    const selected = selectedTargetId === null || selectedTargetId === undefined ? null : String(selectedTargetId);
    return previous !== selected;
  }

  function classifyRuntimeShotPreview(preview, expectedTargetId) {
    const expected = expectedTargetId === null || expectedTargetId === undefined || String(expectedTargetId) === ''
      ? null
      : String(expectedTargetId);
    if (!preview || preview.available !== true) {
      return {
        shouldFire: false,
        status: 'unavailable',
        reason: preview && preview.reason ? String(preview.reason) : 'runtime_preview_unavailable',
      };
    }
    if (preview.hit !== true) {
      if (preview.status === 'terrain_blocked' || preview.reason === 'runtime_preview_terrain_blocked') {
        return {
          shouldFire: false,
          status: 'terrain_blocked',
          reason: 'runtime_preview_terrain_blocked',
        };
      }
      const missRatio = Number(preview.expectedAimMissRadiusRatio);
      if (Number.isFinite(missRatio) && missRatio > 1) {
        return {
          shouldFire: false,
          status: 'aim_settling',
          reason: 'runtime_preview_aim_settling',
        };
      }
      return {
        shouldFire: false,
        status: preview.status || 'miss',
        reason: preview.reason || preview.status || 'runtime_preview_miss',
      };
    }
    const hitTargetId = preview.hitTargetId === null || preview.hitTargetId === undefined || String(preview.hitTargetId) === ''
      ? null
      : String(preview.hitTargetId);
    if (expected && hitTargetId && hitTargetId !== expected) {
      return {
        shouldFire: false,
        status: 'wrong_target',
        reason: 'runtime_preview_wrong_target',
      };
    }
    return {
      shouldFire: true,
      status: 'hit',
      reason: 'ok',
    };
  }

  const OCCLUDED_TARGET_HOLD_DISTANCE = COMBAT_APPROACH_MIN_HOLD_DISTANCE;
  function pushInDistanceForVisibility(config, visible) {
    const push = Math.max(0, Number(config && config.pushInDistance || 0));
    if (visible) return push;
    return Math.max(push, OCCLUDED_TARGET_HOLD_DISTANCE);
  }

  function tacticalHoldDistance(config) {
    const push = Math.max(0, Number(config && config.pushInDistance || 0));
    const maxFire = Math.max(push, Number(config && config.maxFireDistance || 0));
    const approach = Math.max(push, Number(config && config.approachDistance || maxFire));
    // Fight like a player: keep closing from the edge of fire range, but stop
    // before point-blank crowd contact where target selection and collision
    // noise can dominate the harness.
    return Math.max(push, Math.min(approach, maxFire * 0.55));
  }

  function botHorizontalDistance(a, b) {
    const dx = Number(a.x || 0) - Number(b.x || 0);
    const dz = Number(a.z || 0) - Number(b.z || 0);
    return Math.hypot(dx, dz);
  }

  function isRouteOverlayMicroTarget(playerPos, overlayPoint, anchor) {
    if (!playerPos || !overlayPoint || !anchor) return false;
    const routeDistance = botHorizontalDistance(playerPos, overlayPoint);
    const anchorDistance = botHorizontalDistance(playerPos, anchor);
    return routeDistance > 0
      && routeDistance < ROUTE_MICRO_TARGET_DISTANCE
      && anchorDistance > ROUTE_MICRO_TARGET_ANCHOR_DISTANCE;
  }

  function isRoutePathExhausted(path, waypointIdx) {
    const index = Number(waypointIdx);
    return Array.isArray(path)
      && path.length > 0
      && Number.isFinite(index)
      && index >= path.length;
  }

  function computeRouteContinuationPoint(playerPos, dirX, dirZ, distance) {
    if (!playerPos) return null;
    const dx = Number(dirX);
    const dz = Number(dirZ);
    const len = Math.hypot(dx, dz);
    if (!Number.isFinite(len) || len < 0.5) return null;
    const d = Number.isFinite(Number(distance)) && Number(distance) > 0 ? Number(distance) : 8;
    return {
      x: Number(playerPos.x || 0) + (dx / len) * d,
      y: Number(playerPos.y || 0),
      z: Number(playerPos.z || 0) + (dz / len) * d,
    };
  }

  function computeAnchorContinuationPoint(playerPos, anchor, distance) {
    if (!playerPos || !anchor) return null;
    return computeRouteContinuationPoint(
      playerPos,
      Number(anchor.x || 0) - Number(playerPos.x || 0),
      Number(anchor.z || 0) - Number(playerPos.z || 0),
      distance,
    );
  }

  function rememberRouteOverlayDirection(state, playerPos, overlayPoint) {
    if (!state || !playerPos || !overlayPoint) return false;
    const dx = Number(overlayPoint.x || 0) - Number(playerPos.x || 0);
    const dz = Number(overlayPoint.z || 0) - Number(playerPos.z || 0);
    const len = Math.hypot(dx, dz);
    if (!Number.isFinite(len) || len < 0.5) return false;
    state.lastRouteOverlayDirX = dx / len;
    state.lastRouteOverlayDirZ = dz / len;
    return true;
  }

  function botAimPoint(target) {
    const anchor = target.aimPosition || target.position;
    return {
      x: Number(anchor.x || 0),
      y: Number(anchor.y || 0) + targetActorAimYOffset(target.scaleY),
      z: Number(anchor.z || 0),
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

  function shouldReloadMagazine(magazine) {
    const current = Number(magazine && magazine.current);
    const max = Number(magazine && magazine.max);
    if (!Number.isFinite(current)) return false;
    if (current <= 0) return true;
    const lowThreshold = Number.isFinite(max) && max > 0
      ? Math.max(3, Math.floor(max * 0.2))
      : 3;
    return current <= lowThreshold;
  }

  function updatePatrolBot(ctx) {
    const intent = createIdleBotIntent();
    intent.aimLerpRate = ctx.config.aimLerpRate;
    if (shouldReloadMagazine(ctx.magazine)) intent.reload = true;
    const objective = ctx.getObjective();
    const enemy = ctx.findNearestEnemy();
    if (enemy) {
      const dist = botHorizontalDistance(ctx.eyePos, enemy.position);
      const maxFireDistance = Math.max(0, Number(ctx.config.maxFireDistance || 0));
      const targetVisible = !!ctx.canSeeTarget(enemy.position);
      const advancesCombatObjective = objective
        && String(objective.kind || '') === 'nearest_opfor'
        && targetVisible
        && dist <= maxFireDistance;
      const acquisitionDistance = Math.max(0, Number(ctx.config.targetAcquisitionDistance || ctx.config.maxFireDistance || 0));
      const interruptDistance = Math.max(acquisitionDistance, maxFireDistance);
      const interruptsObjective = (!objective && targetVisible)
        || advancesCombatObjective
        || (dist <= interruptDistance && targetVisible);
      if (interruptsObjective) {
        intent.aimTarget = botAimPoint(enemy);
        return { intent, nextState: 'ALERT', resetTimeInState: true };
      }
    }
    if (objective && objective.position) {
      intent.aimTarget = {
        x: Number(objective.position.x || 0),
        y: Number(objective.position.y || 0) + TARGET_CHEST_HEIGHT,
        z: Number(objective.position.z || 0),
      };
      intent.moveForward = 1;
      intent.sprint = botHorizontalDistance(ctx.eyePos, objective.position) > ctx.config.sprintDistance;
    }
    return { intent, nextState: null, resetTimeInState: false };
  }

  function updateAlertBot(ctx) {
    const intent = createIdleBotIntent();
    intent.aimLerpRate = ctx.config.aimLerpRate;
    if (shouldReloadMagazine(ctx.magazine)) intent.reload = true;
    const target = ctx.currentTarget || resolveUngatedCombatTarget(ctx);
    if (!target) {
      return { intent, nextState: 'PATROL', resetTimeInState: true };
    }
    intent.aimTarget = botAimPoint(target);
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
      return { intent, nextState: 'PATROL', resetTimeInState: true };
    }
    // No health / suppression bail-out. Harness bot pushes through.
    intent.aimTarget = botAimPoint(target);
    const visible = !!ctx.canSeeTarget(target.position);
    const dist = botHorizontalDistance(ctx.eyePos, target.position);
    if (!visible || dist > ctx.config.maxFireDistance) {
      if (ctx.timeInStateMs < ctx.config.minEngageStateMs) {
        const holdDistance = Math.max(tacticalHoldDistance(ctx.config), pushInDistanceForVisibility(ctx.config, false));
        intent.moveForward = dist > holdDistance ? 1 : 0;
        intent.sprint = dist > ctx.config.sprintDistance;
        return { intent, nextState: null, resetTimeInState: false };
      }
      return { intent, nextState: 'ADVANCE', resetTimeInState: true };
    }
    if (shouldReloadMagazine(ctx.magazine)) {
      intent.reload = true;
    } else {
      intent.firePrimary = true;
      // Keep firing aim on the same humanized request path as movement/advance.
      // The aim-dot gate suppresses the trigger until the capped slew reaches
      // the visual hit proxy, so the driver does not need to request instant
      // target-angle jumps just because it intends to fire.
      intent.aimLerpRate = ctx.config.aimLerpRate;
    }
    intent.moveStrafe = engageStrafeIntent(ctx.timeInStateMs, ctx.config.engageStrafePeriodMs, ctx.config.engageStrafeAmplitude);
    // Push into firing range, then plant and shoot. Continuing to hold forward
    // while the camera is aim-locked makes close target clusters look like
    // 180-degree pacing because movement is camera-relative.
    const holdFireDistance = tacticalHoldDistance(ctx.config);
    intent.moveForward = dist > holdFireDistance ? 1 : 0;
    return { intent, nextState: null, resetTimeInState: false };
  }

  function updateAdvanceBot(ctx) {
    const intent = createIdleBotIntent();
    intent.aimLerpRate = ctx.config.aimLerpRate;
    if (shouldReloadMagazine(ctx.magazine)) intent.reload = true;
    const target = ctx.currentTarget || resolveUngatedCombatTarget(ctx);
    if (!target) {
      return { intent, nextState: 'PATROL', resetTimeInState: true };
    }
    intent.aimTarget = botAimPoint(target);
    const visible = !!ctx.canSeeTarget(target.position);
    const dist = botHorizontalDistance(ctx.eyePos, target.position);
    if (visible && dist <= ctx.config.maxFireDistance) {
      if (ctx.timeInStateMs >= ctx.config.minAdvanceStateMs) {
        return { intent, nextState: 'ENGAGE', resetTimeInState: true };
      }
      intent.moveForward = dist > tacticalHoldDistance(ctx.config) ? 1 : 0;
      intent.sprint = dist > ctx.config.sprintDistance;
      return { intent, nextState: null, resetTimeInState: false };
    }
    intent.moveForward = dist > pushInDistanceForVisibility(ctx.config, visible) ? 1 : 0;
    intent.sprint = dist > ctx.config.sprintDistance;
    return { intent, nextState: null, resetTimeInState: false };
  }

  function resolveUngatedCombatTarget(ctx) {
    const objective = ctx && typeof ctx.getObjective === 'function' ? ctx.getObjective() : null;
    const objectiveKind = objective && objective.kind ? String(objective.kind) : '';
    if (objective && objectiveKind === 'zone') return null;
    return ctx && typeof ctx.findNearestEnemy === 'function' ? ctx.findNearestEnemy() : null;
  }

  function updateRespawnWaitBot(ctx) {
    const intent = createIdleBotIntent();
    intent.aimLerpRate = 1;
    if (ctx.health > 0) {
      return { intent, nextState: 'PATROL', resetTimeInState: true };
    }
    return { intent, nextState: null, resetTimeInState: false };
  }

  function updateMatchEndedBot(_ctx) {
    // Terminal state. Harness must not drive movement, aim, or fire after the
    // engine reports match-end — the live game shows the victory/defeat screen
    // and any "find nearest enemy" calls return stale or null pointers.
    const intent = createIdleBotIntent();
    intent.aimLerpRate = 0;
    return { intent, nextState: null, resetTimeInState: false };
  }

  function selectLockedTarget(current, fresh, now, staleMs, currentIsLive) {
    const ttlMs = Number.isFinite(Number(staleMs)) ? Number(staleMs) : 4000;
    if (!current) return fresh || null;
    if (currentIsLive === false) return fresh || null;
    if (fresh && fresh.id === current.id) return fresh;
    if ((Number(now) - Number(current.lastKnownMs || 0)) > ttlMs) return fresh || null;
    return current;
  }

  function stepBotState(state, ctx) {
    // Match-end terminates regardless of health; outcome screen is up.
    if (ctx.matchEnded && state !== 'MATCH_ENDED') {
      return { intent: createIdleBotIntent(), nextState: 'MATCH_ENDED', resetTimeInState: true };
    }
    if (ctx.health <= 0 && state !== 'RESPAWN_WAIT' && state !== 'MATCH_ENDED') {
      return { intent: createIdleBotIntent(), nextState: 'RESPAWN_WAIT', resetTimeInState: true };
    }
    switch (state) {
      case 'PATROL': return updatePatrolBot(ctx);
      case 'ALERT': return updateAlertBot(ctx);
      case 'ENGAGE': return updateEngageBot(ctx);
      case 'ADVANCE': return updateAdvanceBot(ctx);
      case 'RESPAWN_WAIT': return updateRespawnWaitBot(ctx);
      case 'MATCH_ENDED': return updateMatchEndedBot(ctx);
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
        targetAcquisitionDistance: 165,
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
        combatObjectiveRouteDistance: 2200,
        targetAcquisitionDistance: 185,
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
        combatObjectiveRouteDistance: 2600,
        targetAcquisitionDistance: 150,
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
        targetAcquisitionDistance: 125,
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
        targetAcquisitionDistance: 140,
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
      // Stop pushing inside the mode's close-contact distance. NEVER
      // negative — the bot holds and shoots instead of back-pedalling or
      // charging through a crowded target cluster.
      pushInDistance: Math.max(8, Number(profile.retreatDistance || 0)),
      aimLerpRate: 0.2,
      engageStrafeAmplitude: 0,
      engageStrafePeriodMs: 750,
      minEngageStateMs: 700,
      minAdvanceStateMs: 700,
      perceptionRange: profile.perceptionRange,
      targetAcquisitionDistance: Number.isFinite(Number(profile.targetAcquisitionDistance))
        ? Number(profile.targetAcquisitionDistance)
        : profile.maxFireDistance,
      tickMs: 250,
    };
  }

  function resolveDriverDecisionIntervalMs(profile, requestedMs) {
    const requested = Number(requestedMs);
    if (Number.isFinite(requested) && requested > 0) {
      return Math.max(16, Math.floor(requested));
    }
    const profiled = Number(profile && profile.decisionIntervalMs);
    return Number.isFinite(profiled) && profiled > 0
      ? Math.max(16, Math.floor(profiled))
      : 250;
  }

  function combatObjectiveMaxDistanceForProfile(profile) {
    if (!profile) return 0;
    const acquisition = Number(profile.targetAcquisitionDistance);
    const base = Number.isFinite(acquisition) && acquisition > 0 ? acquisition : 0;
    if (!profile.aggressiveMode) return base;
    const explicitRouteDistance = Number(profile.combatObjectiveRouteDistance);
    if (Number.isFinite(explicitRouteDistance) && explicitRouteDistance > 0) {
      return Math.max(base, explicitRouteDistance);
    }
    const fireRange = Number(profile.maxFireDistance);
    const perception = Number(profile.perceptionRange);
    const pursuitRange = Number.isFinite(fireRange) && fireRange > 0 ? fireRange * 3 : base;
    if (Number.isFinite(perception) && perception > 0) {
      return Math.max(base, perception);
    }
    return Math.max(base, pursuitRange);
  }

  function supportsFrontlineCompression(mode) {
    return mode === 'ai_sandbox'
      || mode === 'zone_control'
      || mode === 'team_deathmatch'
      || mode === 'open_frontier'
      || mode === 'a_shau_valley';
  }

  function usesPlayerAnchoredFrontlineCompression(mode) {
    return mode === 'open_frontier' || mode === 'a_shau_valley';
  }

  function setPerfDriverHudActive(active) {
    const documentRef = globalWindow && globalWindow.document
      ? globalWindow.document
      : root && root.document;
    const hudRoot = documentRef && typeof documentRef.getElementById === 'function'
      ? documentRef.getElementById('game-hud-root')
      : null;
    if (!hudRoot || !hudRoot.dataset) return;
    if (active) {
      hudRoot.dataset.perfDriverActive = 'true';
      return;
    }
    delete hudRoot.dataset.perfDriverActive;
  }

  function placeCompressedCombatantForHarness(systems, combatant, x, z) {
    if (!combatant || !combatant.position) return false;
    const terrain = systems && systems.terrainSystem;
    const h = terrain && typeof terrain.getHeightAt === 'function'
      ? terrain.getHeightAt(x, z)
      : undefined;
    combatant.position.x = x;
    combatant.position.z = z;
    if (Number.isFinite(h)) combatant.position.y = Number(h) + PLAYER_EYE_HEIGHT;

    if (combatant.renderedPosition && typeof combatant.renderedPosition.copy === 'function') {
      combatant.renderedPosition.copy(combatant.position);
    } else if (combatant.position && typeof combatant.position.clone === 'function') {
      combatant.renderedPosition = combatant.position.clone();
    }

    if (combatant.velocity && typeof combatant.velocity.set === 'function') {
      combatant.velocity.set(0, 0, 0);
    }

    const cs = systems && systems.combatantSystem;
    const grid = cs && cs.spatialGridManager;
    if (grid && typeof grid.syncEntity === 'function' && combatant.id) {
      grid.syncEntity(combatant.id, combatant.position);
    }
    return true;
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
      driverSeed: normalizeDriverSeed(options.driverSeed),
    };
    const profile = profileForMode(opts.mode);
    const decisionIntervalMs = resolveDriverDecisionIntervalMs(profile, options.movementDecisionIntervalMs);
    const botConfig = botConfigForProfile(profile);
    const enableFrontlineCompression = opts.compressFrontline && supportsFrontlineCompression(opts.mode);
    const random = createSeededRandom(opts.driverSeed);

    const state = {
      heartbeatTimer: null,
      // Bot bookkeeping.
      botState: 'PATROL',
      timeInStateMs: 0,
      currentTarget: null,
      droppedDeadTargetLocks: 0,
      lastTickMs: 0,
      lastDamageMs: 0,
      lastHealth: 100,
      lastObjectiveZoneId: null,
      lastObjectiveKind: null,
      lastObjectiveKey: null,
      lastObjectiveDistance: null,
      nearestOpforDistance: null,
      nearestPerceivedEnemyDistance: null,
      currentTargetDistance: null,
      lastPathTargetKind: null,
      lastPathTargetDistance: null,
      lastPathTargetX: null,
      lastPathTargetZ: null,
      lastPathQueryStatus: null,
      lastPathLength: 0,
      lastPathFailureReason: null,
      lastPathQueryDistance: null,
      lastPathStartSnapped: null,
      lastPathEndSnapped: null,
      lastPathStartSnapDistance: null,
      lastPathEndSnapDistance: null,
      maxPathStartSnapDistance: 0,
      maxPathEndSnapDistance: 0,
      untrustedPathSnapCount: 0,
      combatApproachRouteCount: 0,
      routeSnapEpochs: [],
      firstObjectiveDistance: null,
      minObjectiveDistance: null,
      playerDistanceMoved: 0,
      lastMovementSamplePos: null,
      movementIntentCalls: 0,
      nonZeroMovementIntentCalls: 0,
      worldMovementIntentCalls: 0,
      cameraMovementIntentCalls: 0,
      nonZeroWorldMovementIntentCalls: 0,
      nonZeroCameraMovementIntentCalls: 0,
      lastMovementIntent: null,
      lastNonZeroMovementIntent: null,
      // Movement / controller state.
      firingHeld: false,
      firingRetargets: 0,
      firingRetargetFireStops: 0,
      firingRetargetEpochs: [],
      lastYaw: 0,
      lastPitch: 0,
      viewSeeded: false,
      lastViewStepYawDeg: 0,
      lastViewStepPitchDeg: 0,
      lastRequestedViewYawDeltaDeg: 0,
      lastRequestedViewPitchDeltaDeg: 0,
      lastRemainingViewYawErrorDeg: 0,
      lastRemainingViewPitchErrorDeg: 0,
      lastViewYawClamped: false,
      lastViewPitchClamped: false,
      lastViewTargetKind: null,
      lastViewAnchorResyncChanged: false,
      lastViewAnchorResyncYawDeg: 0,
      lastViewAnchorResyncPitchDeg: 0,
      lastViewUpdateAtMs: 0,
      lastAimDot: null,
      lastFireIntent: false,
      lastAimGatePassed: null,
      lastAimGateReason: null,
      lastFireLosGatePassed: null,
      maxViewYawStepDeg: 0,
      maxViewPitchStepDeg: 0,
      maxRequestedViewYawDeltaDeg: 0,
      maxRequestedViewPitchDeltaDeg: 0,
      maxRemainingViewYawErrorDeg: 0,
      maxRemainingViewPitchErrorDeg: 0,
      viewSlewClampCount: 0,
      viewAnchorResyncCount: 0,
      maxViewAnchorResyncYawDeg: 0,
      maxViewAnchorResyncPitchDeg: 0,
      largeViewTurnCount: 0,
      maxAimMovementDivergenceDeg: 0,
      aimMovementDivergenceSamples: 0,
      aimMovementDivergenceOver45Count: 0,
      // Path bookkeeping — used when the bot's ADVANCE state wants a planned route.
      waypoints: null,
      waypointIdx: 0,
      lastWaypointReplanAt: 0,
      waypointsFollowed: 0,
      waypointReplanFailures: 0,
      routeTargetResets: 0,
      routeNoProgressResets: 0,
      blockedTargetUntil: Object.create(null),
      lastRouteProgressDistance: null,
      lastRouteProgressMoved: 0,
      lastRouteProgressAt: 0,
      lastRouteOverlayDirX: null,
      lastRouteOverlayDirZ: null,
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
      losUnknownTargetChecks: 0,
      fireUnknownLosRejectedShots: 0,
      aimDotGateRejectedShots: 0,
      fireStartRejected: 0,
      pulsedFireStops: 0,
      runtimeShotPreviewRejectedShots: 0,
      runtimeShotPreviewAimSettlingShots: 0,
      runtimeShotPreviewTerrainBlockedShots: 0,
      runtimeShotPreviewUnavailableShots: 0,
      runtimeShotPreviewMissShots: 0,
      runtimeShotPreviewWrongTargetShots: 0,
      lastTargetLosStatus: null,
      lastTargetLosReason: null,
      lastFireLosStatus: null,
      lastFireLosReason: null,
      lastRuntimeShotPreviewStatus: null,
      lastRuntimeShotPreviewReason: null,
      lastRuntimeShotPreviewHitTargetId: null,
      lastRuntimeShotPreviewExpectedInSpatialCandidates: null,
      lastCurrentTargetLive: null,
      lastCurrentTargetHealth: null,
      lastCurrentTargetState: null,
      shotEpochs: [],
      stuckTeleportCount: 0,
      stuckWaypointSkips: 0,
      maxStuckMs: 0,
      stuckMs: 0,
      lastStablePos: null,
      transitions: 0,
      lastStateChangeAt: 0,
      stateHistogram: {
        PATROL: 0, ALERT: 0, ENGAGE: 0, ADVANCE: 0, RESPAWN_WAIT: 0, MATCH_ENDED: 0,
      },
      lastFireProbe: null,
      frontlineInserted: false,
      setupFastForwarded: false,
      enemySpawn: null,
      // Match-end lifecycle (harness-lifecycle-halt-on-match-end). Wall-clock ms
      // the harness first observed phase==='ENDED'; null while the match is
      // still active. Surfaced through getDebugSnapshot/stop so perf-capture.ts
      // can finalize early instead of running on into the victory screen.
      matchEndedAtMs: null,
      matchOutcome: null,
      // Combat stats (rolled up from engine PlayerStatsTracker each tick).
      // damageDealt / kills / shotsFired / shotsHit are run totals starting
      // from the moment the driver attached, even if the in-engine
      // PlayerStatsTracker was reset mid-run (rebasedTotal handles that).
      damageDealt: 0,
      damageTaken: 0,
      kills: 0,
      shotsFiredEngine: 0,
      shotsHitEngine: 0,
      damageDealtBaseline: null,
      killsBaseline: null,
      shotsFiredBaseline: null,
      shotsHitBaseline: null,
    };

    function getSystems() {
      return globalWindow && globalWindow.__engine && globalWindow.__engine.systemManager;
    }

    function getOptionalSystem(systems, key) {
      if (!systems || !key) return null;
      try {
        const registry = systems.registry;
        if (registry && typeof registry.get === 'function') {
          return registry.get(key) || null;
        }
      } catch (_err) {
        // Fall through to the public getter path below.
      }
      try {
        return systems[key] || null;
      } catch (_err) {
        return null;
      }
    }

    function getPlayerController(systems) {
      return getOptionalSystem(systems, 'playerController');
    }

    function getFirstPersonWeapon(systems) {
      return getOptionalSystem(systems, 'firstPersonWeapon');
    }

    function readPlayerWeaponFiringActive(systems) {
      const weapon = getFirstPersonWeapon(systems);
      if (!weapon || typeof weapon.getWeaponInput !== 'function') return null;
      let input;
      try {
        input = weapon.getWeaponInput();
      } catch (_err) {
        return null;
      }
      if (!input || typeof input.isFiringActive !== 'function') return null;
      try {
        return !!input.isFiringActive();
      } catch (_err) {
        return null;
      }
    }

    function getWeaponHarnessSnapshot(systems) {
      const weapon = getFirstPersonWeapon(systems);
      if (!weapon) return null;
      let ammoState = null;
      let presentation = null;
      let equippedWeaponType = null;
      try {
        if (typeof weapon.getAmmoState === 'function') ammoState = weapon.getAmmoState();
      } catch (_err) { ammoState = null; }
      try {
        if (typeof weapon.getWeaponPresentationState === 'function') presentation = weapon.getWeaponPresentationState();
      } catch (_err) { presentation = null; }
      try {
        if (typeof weapon.getEquippedWeaponType === 'function') equippedWeaponType = weapon.getEquippedWeaponType();
      } catch (_err) { equippedWeaponType = null; }
      return {
        firingActive: readPlayerWeaponFiringActive(systems),
        equippedWeaponType,
        ammoState,
        presentation,
      };
    }

    function disablePointerLockForHarness(systems) {
      const pc = getPlayerController(systems);
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

    function getNearestOpforObjective(systems, playerPos) {
      const cs = systems && systems.combatantSystem;
      const combatants = cs && cs.getAllCombatants ? cs.getAllCombatants() : null;
      state.nearestOpforDistance = null;
      if (!Array.isArray(combatants) || combatants.length === 0 || !playerPos) return null;
      let best = null;
      let bestDistSq = Number.POSITIVE_INFINITY;
      for (let i = 0; i < combatants.length; i++) {
        const c = combatants[i];
        if (!c || c.id === 'player_proxy') continue;
        if (!isOpforFaction(c.faction)) continue;
        if (c.health <= 0 || c.state === 'dead') continue;
        if (isTargetTemporarilyBlocked(c.id, state.blockedTargetUntil, Date.now())) continue;
        if (!c.position) continue;
        const dx = Number(c.position.x) - Number(playerPos.x);
        const dz = Number(c.position.z) - Number(playerPos.z);
        const distSq = dx * dx + dz * dz;
        if (!Number.isFinite(distSq) || distSq >= bestDistSq) continue;
        bestDistSq = distSq;
        best = c;
      }
      if (!best || !best.position) return null;
      const distance = Math.sqrt(bestDistSq);
      state.nearestOpforDistance = Number.isFinite(distance) ? distance : null;
      return {
        id: String(best.id || ''),
        kind: 'nearest_opfor',
        position: {
          x: Number(best.position.x),
          y: Number(best.position.y || 0),
          z: Number(best.position.z),
        },
        priority: 3,
        distance: state.nearestOpforDistance,
      };
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
      const nowMs = Date.now();
      const routableZones = zones.filter((zone) => !isTargetTemporarilyBlocked(
        objectiveBlockKey('zone', zone && zone.id),
        state.blockedTargetUntil,
        nowMs,
      ));
      if (routableZones.length === 0) {
        state.lastObjectiveZoneId = null;
        return null;
      }
      const bestZone = pickObjectiveZone({
        zones: routableZones,
        playerPos: playerPos,
        isFriendly: isBluforFaction,
      });
      if (!bestZone || !bestZone.position) {
        // Nothing actionable — clear the cached objective id so the next
        // selector pass doesn't carry a stale reference into telemetry.
        state.lastObjectiveZoneId = null;
        return null;
      }
      state.lastObjectiveZoneId = String(bestZone.id || '');
      const radius = Number(bestZone.radius);
      return {
        id: state.lastObjectiveZoneId,
        kind: 'zone',
        position: {
          x: Number(bestZone.position.x),
          y: Number(bestZone.position.y || 0),
          z: Number(bestZone.position.z),
          routeSnapTrustDistance: Number.isFinite(radius) && radius > 0
            ? Math.max(NAVMESH_TRUSTED_ROUTE_SNAP_DISTANCE, radius)
            : NAVMESH_TRUSTED_ROUTE_SNAP_DISTANCE,
        },
        priority: bestZone.state === 'contested' ? 2 : 1,
      };
    }

    // ── Primitives wired to the engine ──

    // `findNearestEnemy` — delegated to the live combatant system.
    // Applies perception-range cull + live-only filter. Returns the
    // engine-agnostic `BotTarget` shape the state machine expects.
    function findNearestEnemy(systems, playerPos) {
      const cs = systems && systems.combatantSystem;
      const combatants = cs && cs.getAllCombatants ? cs.getAllCombatants() : null;
      state.nearestPerceivedEnemyDistance = null;
      if (!Array.isArray(combatants) || combatants.length === 0) return null;
      const nowMs = Date.now();
      const camera = getCamera(systems);
      const viewForward = camera && readCameraWorld(camera, _tmpEye, _tmpForward)
        ? { x: _tmpForward.x, y: _tmpForward.y, z: _tmpForward.z }
        : null;
      const selected = selectVisiblePreferredEnemyCandidate({
        combatants,
        playerPos,
        perceptionRange: botConfig.perceptionRange,
        maxFireDistance: botConfig.maxFireDistance,
        maxVisibleChecks: 12,
        viewForward,
        isEnemy: (c) => isOpforFaction(c.faction),
        isBlocked: (c) => isTargetTemporarilyBlocked(c.id, state.blockedTargetUntil, nowMs),
        canSeeTarget: (pos) => canSeeTarget(systems, playerPos, pos),
      });
      if (!selected || !selected.combatant) return null;
      const best = selected.combatant;
      const distance = Number(selected.distance);
      state.nearestPerceivedEnemyDistance = Number.isFinite(distance) ? distance : null;
      return {
        id: String(best.id || ''),
        position: {
          x: Number(best.position.x),
          y: Number(best.position.y || 0),
          z: Number(best.position.z || 0),
        },
        aimPosition: best.renderedPosition ? {
          x: Number(best.renderedPosition.x),
          y: Number(best.renderedPosition.y || 0),
          z: Number(best.renderedPosition.z || 0),
        } : undefined,
        scaleY: best.scale && Number.isFinite(Number(best.scale.y)) ? Number(best.scale.y) : 1,
        lastKnownMs: Date.now(),
      };
    }

    function getCurrentTargetLiveDetails(systems, target) {
      if (!target || !target.id) {
        return { live: null, found: false, health: null, state: null };
      }
      const cs = systems && systems.combatantSystem;
      const combatants = cs && cs.getAllCombatants ? cs.getAllCombatants() : null;
      if (!Array.isArray(combatants)) {
        return { live: true, found: false, health: null, state: 'unknown_combatants' };
      }
      const targetId = String(target.id);
      for (let i = 0; i < combatants.length; i++) {
        const c = combatants[i];
        if (!c || String(c.id || '') !== targetId) continue;
        const stateName = String(c.state || '').toLowerCase();
        const health = Number(c.health ?? 0);
        const position = makePlainVector(c.position);
        const renderedPosition = makePlainVector(c.renderedPosition);
        return {
          live: health > 0 && stateName !== 'dead',
          found: true,
          health: Number.isFinite(health) ? health : null,
          state: stateName,
          position,
          aimPosition: renderedPosition || position,
          scaleY: c.scale && Number.isFinite(Number(c.scale.y)) ? Number(c.scale.y) : 1,
        };
      }
      return { live: false, found: false, health: null, state: 'missing' };
    }

    function refreshBotTargetFromLive(target, liveDetails) {
      if (!target || !liveDetails || liveDetails.found !== true || !liveDetails.position) return target;
      const refreshed = Object.assign({}, target, {
        position: liveDetails.position,
        scaleY: Number.isFinite(Number(liveDetails.scaleY)) ? Number(liveDetails.scaleY) : target.scaleY,
        lastKnownMs: Date.now(),
      });
      if (liveDetails.aimPosition) {
        refreshed.aimPosition = liveDetails.aimPosition;
      } else {
        delete refreshed.aimPosition;
      }
      return refreshed;
    }

    function makePlainVector(value) {
      if (!value) return null;
      const x = Number(value.x);
      const y = Number(value.y);
      const z = Number(value.z);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
      return { x, y, z };
    }

    function getCombatantMapForRuntimePreview(combatantSystem) {
      if (!combatantSystem) return null;
      try {
        if (combatantSystem.combatants instanceof Map) return combatantSystem.combatants;
      } catch (_err) {
        // Fall through to public snapshot.
      }
      const combatants = combatantSystem.getAllCombatants ? combatantSystem.getAllCombatants() : null;
      if (!Array.isArray(combatants)) return null;
      const map = new Map();
      for (let i = 0; i < combatants.length; i++) {
        const combatant = combatants[i];
        if (!combatant || !combatant.id) continue;
        map.set(String(combatant.id), combatant);
      }
      return map;
    }

    function readRuntimeShotRawHit(combatantSystem, ray, combatantMap) {
      try {
        const combat = combatantSystem && combatantSystem.combatantCombat;
        const hitDetection = combat && combat.hitDetection;
        if (!hitDetection || typeof hitDetection.raycastCombatants !== 'function' || !combatantMap) return null;
        return hitDetection.raycastCombatants(ray, 'US', combatantMap, { positionMode: 'visual' }) || null;
      } catch (_err) {
        return null;
      }
    }

    function readRuntimeShotCandidateIds(combatantSystem, origin) {
      try {
        const grid = combatantSystem && combatantSystem.spatialGridManager;
        if (!grid || typeof grid.queryRadius !== 'function' || !origin) return null;
        const ids = grid.queryRadius(origin, 280);
        return Array.isArray(ids) ? ids.map(id => String(id)) : null;
      } catch (_err) {
        return null;
      }
    }

    function queryRuntimeShotPreview(systems, camera, expectedTargetId, expectedAimPoint, expectedProxyRadius) {
      const combatantSystem = systems && systems.combatantSystem;
      if (!combatantSystem || typeof combatantSystem.resolvePlayerAimPoint !== 'function') {
        return { available: false, status: 'unavailable', reason: 'missing_resolve_player_aim_point' };
      }
      if (!camera || typeof camera.getWorldPosition !== 'function' || typeof camera.getWorldDirection !== 'function') {
        return { available: false, status: 'unavailable', reason: 'missing_camera_world_methods' };
      }

      const Vector3 = camera.position && camera.position.constructor;
      if (typeof Vector3 !== 'function') {
        return { available: false, status: 'unavailable', reason: 'missing_camera_vector_constructor' };
      }

      const origin = new Vector3();
      const direction = new Vector3();
      try {
        camera.getWorldPosition(origin);
        camera.getWorldDirection(direction);
      } catch (_err) {
        return { available: false, status: 'unavailable', reason: 'camera_world_read_failed' };
      }
      if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)
          || !Number.isFinite(direction.x) || !Number.isFinite(direction.y) || !Number.isFinite(direction.z)) {
        return { available: false, status: 'unavailable', reason: 'nonfinite_camera_ray' };
      }

      const ray = { origin, direction };
      let preview = null;
      try {
        preview = combatantSystem.resolvePlayerAimPoint(ray);
      } catch (_err) {
        return { available: false, status: 'unavailable', reason: 'resolve_player_aim_point_failed' };
      }

      const combatantMap = getCombatantMapForRuntimePreview(combatantSystem);
      const rawHit = readRuntimeShotRawHit(combatantSystem, ray, combatantMap);
      const candidateIds = readRuntimeShotCandidateIds(combatantSystem, origin);
      const expected = expectedTargetId === null || expectedTargetId === undefined || String(expectedTargetId) === ''
        ? null
        : String(expectedTargetId);
      const hitTargetId = rawHit && rawHit.combatant && rawHit.combatant.id
        ? String(rawHit.combatant.id)
        : null;
      const expectedInCandidates = expected && Array.isArray(candidateIds)
        ? candidateIds.includes(expected)
        : null;
      const finiteExpectedProxyRadius = Number.isFinite(Number(expectedProxyRadius)) && Number(expectedProxyRadius) > 0
        ? Number(expectedProxyRadius)
        : null;
      const aimMetrics = computeRayAimMetrics(origin, direction, expectedAimPoint, finiteExpectedProxyRadius);
      const didHit = !!(preview && preview.hit === true);
      let status = didHit ? 'hit' : 'miss';
      let reason = didHit ? 'ok' : 'runtime_preview_miss';
      if (!didHit && rawHit) {
        status = 'terrain_blocked';
        reason = 'runtime_preview_terrain_blocked';
      } else if (!didHit && expected && expectedInCandidates === false) {
        status = 'target_not_in_spatial_query';
        reason = 'runtime_preview_target_not_in_spatial_query';
      }

      return {
        available: true,
        hit: didHit,
        status,
        reason,
        expectedTargetId: expected,
        hitTargetId,
        rawHitDistance: rawHit && Number.isFinite(Number(rawHit.distance)) ? Number(rawHit.distance) : null,
        expectedTargetInSpatialCandidates: expectedInCandidates,
        candidateCount: Array.isArray(candidateIds) ? candidateIds.length : null,
        expectedAimPoint: makePlainVector(expectedAimPoint),
        expectedProxyRadius: finiteExpectedProxyRadius,
        expectedAimDot: aimMetrics && Number.isFinite(aimMetrics.aimDot) ? aimMetrics.aimDot : null,
        expectedAimAngleDeg: aimMetrics && Number.isFinite(aimMetrics.aimAngleDeg) ? aimMetrics.aimAngleDeg : null,
        expectedAimMissDistance: aimMetrics && Number.isFinite(aimMetrics.aimMissDistance) ? aimMetrics.aimMissDistance : null,
        expectedAimMissRadiusRatio: aimMetrics && Number.isFinite(aimMetrics.aimMissRadiusRatio) ? aimMetrics.aimMissRadiusRatio : null,
        expectedAimDistance: aimMetrics && Number.isFinite(aimMetrics.aimDistance) ? aimMetrics.aimDistance : null,
        rayDistanceToClosestAim: aimMetrics && Number.isFinite(aimMetrics.rayDistanceToClosestAim) ? aimMetrics.rayDistanceToClosestAim : null,
        point: makePlainVector(preview && preview.point),
        origin: makePlainVector(origin),
        direction: makePlainVector(direction),
      };
    }

    function isCurrentTargetLive(systems, target) {
      return getCurrentTargetLiveDetails(systems, target).live;
    }

    // `canSeeTarget` — consumes `terrainSystem.raycastTerrain` (the same primitive
    // AILineOfSight uses internally), so the bot cannot acquire a target through
    // a hill. Player/combatant positions are already eye-level actor anchors;
    // raycast from player eye to target center mass.
    function queryTargetLineOfSight(systems, playerPos, targetPos) {
      const terrain = systems && systems.terrainSystem;
      const from = {
        x: Number(playerPos.x),
        y: Number(playerPos.y || 0),
        z: Number(playerPos.z),
      };
      const to = {
        x: Number(targetPos.x),
        y: Number(targetPos.y || 0) + TARGET_ACTOR_AIM_Y_OFFSET,
        z: Number(targetPos.z),
      };
      return queryTerrainLineOfSight(terrain, from, to, 0.75);
    }

    function canSeeTarget(systems, playerPos, targetPos) {
      const result = queryTargetLineOfSight(systems, playerPos, targetPos);
      state.lastTargetLosStatus = result.status;
      state.lastTargetLosReason = result.reason;
      if (result.status === 'unknown') state.losUnknownTargetChecks++;
      return result.clear;
    }

    // `queryPath` — wraps `navmeshSystem.queryPath`. The bot passes plain-object
    // positions, we hand back plain-object waypoints. Null on any failure (off
    // navmesh, no path).
    function queryPath(systems, fromPos, toPos) {
      const nav = systems && systems.navmeshSystem;
      state.lastPathQueryDistance = fromPos && toPos ? botHorizontalDistance(fromPos, toPos) : null;
      state.lastPathFailureReason = null;
      state.lastPathStartSnapped = null;
      state.lastPathEndSnapped = null;
      state.lastPathStartSnapDistance = null;
      state.lastPathEndSnapDistance = null;
      if (!nav || typeof nav.queryPath !== 'function') {
        state.lastPathFailureReason = 'nav_unavailable';
        return null;
      }
      let start = null;
      let end = null;
      try {
        // Snap both endpoints onto the mesh before querying. This is the
        // Round 3 fix: on open_frontier the player regularly stands just
        // off-mesh and queryPath returns null. The harness player can drift
        // farther from the generated navmesh than NPC recovery allows while it
        // pushes across large Open Frontier slopes, and live OPFOR targets can
        // stand outside the walkable mesh too. Snap both sides to nearby
        // walkable points so the harness routes toward the combat front instead
        // of failing the whole long-map approach.
        start = snapOntoNavmeshDetailed(systems, fromPos, NAVMESH_START_SNAP_RADIUS);
        end = snapOntoNavmeshDetailed(systems, toPos, NAVMESH_TARGET_SNAP_RADIUS);
        state.lastPathStartSnapped = start.snapped;
        state.lastPathEndSnapped = end.snapped;
        state.lastPathStartSnapDistance = start.distance;
        state.lastPathEndSnapDistance = end.distance;
        const startSnapDistance = finiteDistanceOrNull(start.distance);
        const endSnapDistance = finiteDistanceOrNull(end.distance);
        if (startSnapDistance !== null) {
          state.maxPathStartSnapDistance = Math.max(state.maxPathStartSnapDistance, startSnapDistance);
        }
        if (endSnapDistance !== null) {
          state.maxPathEndSnapDistance = Math.max(state.maxPathEndSnapDistance, endSnapDistance);
        }
        const targetSnapTrustDistance = Number(toPos && toPos.routeSnapTrustDistance);
        const routeSnapTrustLimit = Number.isFinite(targetSnapTrustDistance) && targetSnapTrustDistance > 0
          ? Math.max(NAVMESH_TRUSTED_ROUTE_SNAP_DISTANCE, targetSnapTrustDistance)
          : NAVMESH_TRUSTED_ROUTE_SNAP_DISTANCE;
        if (!isRouteSnapTrusted({
          startFound: start.found,
          endFound: end.found,
          startDistance: start.distance,
          endDistance: end.distance,
          limit: routeSnapTrustLimit,
        })) {
          state.untrustedPathSnapCount++;
          state.lastPathFailureReason = 'snap_distance_untrusted';
          recordRouteSnapEpoch(start, end, 'snap_rejected', state.lastPathFailureReason, 0);
          return null;
        }
        const path = nav.queryPath(start.point, end.point);
        if (!path || path.length === 0) {
          state.lastPathFailureReason = !start.found
            ? 'start_snap_failed'
            : !end.found
              ? 'end_snap_failed'
              : 'compute_path_failed';
          recordRouteSnapEpoch(start, end, 'nav_failed', state.lastPathFailureReason, 0);
          return null;
        }
        const out = [];
        for (let i = 0; i < path.length; i++) {
          const p = path[i];
          if (!p) continue;
          out.push({ x: Number(p.x || 0), y: Number(p.y || 0), z: Number(p.z || 0) });
        }
        if (out.length === 0) {
          state.lastPathFailureReason = 'empty_path_after_filter';
          recordRouteSnapEpoch(start, end, 'nav_failed', state.lastPathFailureReason, 0);
          return null;
        }
        recordRouteSnapEpoch(start, end, 'nav_ok', null, out.length);
        return out;
      } catch (_err) {
        state.lastPathFailureReason = 'query_exception';
        recordRouteSnapEpoch(start, end, 'query_exception', state.lastPathFailureReason, 0);
        return null;
      }
    }

    function recordRouteSnapEpoch(start, end, status, reason, pathLength) {
      const startDistance = finiteDistanceOrNull(start && start.distance);
      const endDistance = finiteDistanceOrNull(end && end.distance);
      const startSnapped = !!(start && start.snapped);
      const endSnapped = !!(end && end.snapped);
      const startFound = !!(start && start.found);
      const endFound = !!(end && end.found);
      const meaningful =
        shouldRecordRouteSnapEpoch({ start: start, end: end, status: status });
      if (!meaningful) return;
      appendBoundedEvent(state.routeSnapEpochs, {
        atMs: Date.now(),
        botState: state.botState,
        status: String(status || 'unknown'),
        reason: reason ? String(reason) : null,
        pathLength: Number.isFinite(Number(pathLength)) ? Number(pathLength) : 0,
        pathTargetKind: state.lastPathTargetKind,
        pathTargetDistance: state.lastPathTargetDistance,
        pathQueryDistance: state.lastPathQueryDistance,
        objectiveKind: state.lastObjectiveKind,
        objectiveDistance: state.lastObjectiveDistance,
        currentTargetId: state.currentTarget ? String(state.currentTarget.id) : null,
        currentTargetDistance: state.currentTargetDistance,
        startFound,
        endFound,
        startSnapped,
        endSnapped,
        startSnapDistance: startDistance,
        endSnapDistance: endDistance,
        trusted: status !== 'snap_rejected',
        routeProgressAgeMs: state.lastRouteProgressAt > 0 ? Math.max(0, Date.now() - state.lastRouteProgressAt) : null,
        routeProgressDistance: state.lastRouteProgressDistance,
        waypointIdx: state.waypointIdx,
        waypointCount: state.waypoints ? state.waypoints.length : 0,
      }, ROUTE_SNAP_EPOCH_HISTORY_LIMIT);
    }

    function snapOntoNavmeshDetailed(systems, pos, searchRadius) {
      const point = {
        x: Number(pos && pos.x || 0),
        y: Number(pos && pos.y || 0),
        z: Number(pos && pos.z || 0),
      };
      const nav = systems && systems.navmeshSystem;
      if (!nav || typeof nav.findNearestPoint !== 'function') {
        return { point: point, found: true, snapped: false, distance: 0 };
      }
      try {
        const radius = Number.isFinite(Number(searchRadius)) && Number(searchRadius) > 0
          ? Number(searchRadius)
          : NAVMESH_START_SNAP_RADIUS;
        const snapped = nav.findNearestPoint(pos, radius);
        if (snapped && Number.isFinite(snapped.x) && Number.isFinite(snapped.z)) {
          const snappedPoint = { x: Number(snapped.x), y: Number(snapped.y || point.y || 0), z: Number(snapped.z) };
          const distance = botHorizontalDistance(point, snappedPoint);
          return { point: snappedPoint, found: true, snapped: distance > 0.01, distance: distance };
        }
      } catch (_err) { /* ignore */ }
      return { point: point, found: false, snapped: false, distance: null };
    }

    function snapOntoNavmesh(systems, pos) {
      return snapOntoNavmeshDetailed(systems, pos, NAVMESH_START_SNAP_RADIUS).point;
    }

    function findNearestNavmeshPoint(systems, pos) {
      const nav = systems && systems.navmeshSystem;
      if (!nav || typeof nav.findNearestPoint !== 'function') return null;
      try {
        const p = nav.findNearestPoint(pos, NAVMESH_START_SNAP_RADIUS);
        if (!p || !Number.isFinite(p.x)) return null;
        return { x: Number(p.x), y: Number(p.y || 0), z: Number(p.z) };
      } catch (_err) {
        return null;
      }
    }

    function resolveCombatApproachRouteTarget(systems, playerPos, target, targetKindName) {
      if (targetKindName !== 'current_target' && targetKindName !== 'nearest_opfor') return null;
      const candidates = computeCombatApproachCandidates(playerPos, target);
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const snapped = snapOntoNavmeshDetailed(systems, candidate, NAVMESH_TARGET_SNAP_RADIUS);
        if (!isRouteSnapTrusted({
          startFound: true,
          endFound: snapped.found,
          startDistance: 0,
          endDistance: snapped.distance,
        })) {
          continue;
        }
        return {
          x: Number(snapped.point.x),
          y: Number.isFinite(Number(snapped.point.y)) ? Number(snapped.point.y) : Number(candidate.y || 0),
          z: Number(snapped.point.z),
          routeSnapTrustDistance: NAVMESH_TRUSTED_ROUTE_SNAP_DISTANCE,
          sourceTargetKind: targetKindName,
        };
      }
      return null;
    }

    function sampleHeight(systems, x, z) {
      const terrain = systems && systems.terrainSystem;
      if (!terrain || typeof terrain.getHeightAt !== 'function') return 0;
      const h = terrain.getHeightAt(Number(x), Number(z));
      return Number.isFinite(h) ? Number(h) : 0;
    }

    function getObjective(systems, playerPos) {
      const combatTarget = getNearestOpforObjective(systems, playerPos);
      const zoneTarget = getObjectiveZoneTarget(systems, playerPos);
      const center = getEngagementCenter(systems);
      const fallbackTarget = center ? { kind: 'engagement_center', position: center, priority: 1 } : null;
      const selected = selectPatrolObjective({
        aggressiveMode: profile.aggressiveMode,
        combatObjective: combatTarget,
        zoneObjective: zoneTarget,
        fallbackObjective: fallbackTarget,
        combatObjectiveMaxDistance: combatObjectiveMaxDistanceForProfile(profile),
      });
      if (selected && selected.kind !== 'zone') state.lastObjectiveZoneId = null;
      const selectedObjectiveKey = objectiveTelemetryKey(selected, state.lastObjectiveZoneId);
      if (selectedObjectiveKey !== state.lastObjectiveKey) {
        state.lastObjectiveKey = selectedObjectiveKey;
        state.firstObjectiveDistance = null;
        state.minObjectiveDistance = null;
      }
      state.lastObjectiveKind = selected && selected.kind ? String(selected.kind) : null;
      if (selected && selected.position && playerPos) {
        const selectedDistance = Number(selected.distance);
        state.lastObjectiveDistance = Number.isFinite(selectedDistance)
          ? selectedDistance
          : botHorizontalDistance(playerPos, selected.position);
        if (Number.isFinite(state.lastObjectiveDistance)) {
          if (state.firstObjectiveDistance === null) state.firstObjectiveDistance = state.lastObjectiveDistance;
          if (state.minObjectiveDistance === null || state.lastObjectiveDistance < state.minObjectiveDistance) {
            state.minObjectiveDistance = state.lastObjectiveDistance;
          }
        }
      } else {
        state.lastObjectiveDistance = null;
      }
      return selected;
    }

    function getPlayerPos(systems) {
      const pc = getPlayerController(systems);
      if (!pc || !pc.getPosition) return null;
      const pos = pc.getPosition();
      if (!pos) return null;
      return { x: Number(pos.x), y: Number(pos.y || 0), z: Number(pos.z) };
    }

    function getPlayerVelocity(systems) {
      const pc = getPlayerController(systems);
      if (!pc || !pc.getVelocity) {
        return { x: 0, y: 0, z: 0 };
      }
      const v = pc.getVelocity();
      return { x: Number(v.x || 0), y: Number(v.y || 0), z: Number(v.z || 0) };
    }

    function getRuntimeLiveness(systems) {
      const w = globalWindow;
      const pc = getPlayerController(systems);
      const playerPos = getPlayerPos(systems);
      const terrain = systems && systems.terrainSystem;
      let metricsSnapshot = null;
      try {
        metricsSnapshot = w && w.__metrics && typeof w.__metrics.getSnapshot === 'function'
          ? w.__metrics.getSnapshot()
          : null;
      } catch (_err) {
        metricsSnapshot = null;
      }
      let movementStats = null;
      try {
        const perf = w && w.perf;
        movementStats = perf && typeof perf.getMovement === 'function'
          ? perf.getMovement()
          : null;
      } catch (_err) {
        movementStats = null;
      }
      let playerSpectating = false;
      try {
        playerSpectating = !!(pc && typeof pc.isSpectating === 'function' && pc.isSpectating());
      } catch (_err) {
        playerSpectating = false;
      }
      let playerInHelicopter = false;
      try {
        playerInHelicopter = !!(pc && typeof pc.isInHelicopter === 'function' && pc.isInHelicopter());
      } catch (_err) {
        playerInHelicopter = false;
      }
      let playerInFixedWing = false;
      try {
        playerInFixedWing = !!(pc && typeof pc.isInFixedWing === 'function' && pc.isInFixedWing());
      } catch (_err) {
        playerInFixedWing = false;
      }
      const doc = typeof document !== 'undefined' ? document : null;
      const velocity = getPlayerVelocity(systems);
      let playerMovementDebug = null;
      try {
        if (pc && typeof pc.getMovementDebugSnapshot === 'function') {
          playerMovementDebug = pc.getMovementDebugSnapshot();
        } else {
          const movement = pc && pc.movement;
          playerMovementDebug = movement && typeof movement.getDebugSnapshot === 'function'
            ? movement.getDebugSnapshot()
            : null;
        }
      } catch (_err) {
        playerMovementDebug = null;
      }
      const terrainHeightAtPlayer = playerPos && terrain && typeof terrain.getHeightAt === 'function'
        ? Number(terrain.getHeightAt(playerPos.x, playerPos.z))
        : null;
      const effectiveHeightAtPlayer = playerPos && terrain && typeof terrain.getEffectiveHeightAt === 'function'
        ? Number(terrain.getEffectiveHeightAt(playerPos.x, playerPos.z))
        : null;
      return {
        engineFrameCount: Number(metricsSnapshot && metricsSnapshot.frameCount) || 0,
        harnessRafTicks: Number(w && w.__perfHarnessRaf && w.__perfHarnessRaf.ticks) || 0,
        documentHidden: doc ? !!doc.hidden : null,
        visibilityState: doc ? String(doc.visibilityState || '') : null,
        gameStarted: !!(w && w.__engine && w.__engine.gameStarted),
        playerInHelicopter: playerInHelicopter,
        playerInFixedWing: playerInFixedWing,
        playerInVehicle: playerInHelicopter || playerInFixedWing,
        playerSpectating: playerSpectating,
        playerPositionX: playerPos ? Number(playerPos.x || 0) : null,
        playerPositionY: playerPos ? Number(playerPos.y || 0) : null,
        playerPositionZ: playerPos ? Number(playerPos.z || 0) : null,
        playerVelocityX: Number(velocity.x || 0),
        playerVelocityY: Number(velocity.y || 0),
        playerVelocityZ: Number(velocity.z || 0),
        playerMovementSamples: Number(movementStats && movementStats.player && movementStats.player.samples) || 0,
        playerAvgRequestedSpeed: Number(movementStats && movementStats.player && movementStats.player.avgRequestedSpeed) || 0,
        playerAvgActualSpeed: Number(movementStats && movementStats.player && movementStats.player.avgActualSpeed) || 0,
        playerBlockedByTerrain: Number(movementStats && movementStats.player && movementStats.player.blockedByTerrain) || 0,
        terrainHeightAtPlayer: Number.isFinite(terrainHeightAtPlayer) ? terrainHeightAtPlayer : null,
        effectiveHeightAtPlayer: Number.isFinite(effectiveHeightAtPlayer) ? effectiveHeightAtPlayer : null,
        collisionHeightDeltaAtPlayer: Number.isFinite(terrainHeightAtPlayer) && Number.isFinite(effectiveHeightAtPlayer)
          ? effectiveHeightAtPlayer - terrainHeightAtPlayer
          : null,
        collisionContributorsAtPlayer: getCollisionContributorsAtPlayer(systems, playerPos),
        playerMovementDebug: playerMovementDebug,
      };
    }

    function getCollisionContributorsAtPlayer(systems, playerPos) {
      if (!systems || !systems.terrainSystem || !playerPos) return [];
      const terrain = systems.terrainSystem;
      const queries = terrain.terrainQueries;
      const map = queries && queries.collisionObjects;
      if (!map || typeof map.forEach !== 'function') return [];
      const out = [];
      try {
        map.forEach((entry, id) => {
          if (!entry || !entry.object || !entry.object.visible) return;
          const box = entry.bounds;
          if (!box) return;
          if (entry.dynamic && typeof entry.object.updateMatrixWorld === 'function' && typeof box.setFromObject === 'function') {
            entry.object.updateMatrixWorld(true);
            box.setFromObject(entry.object);
          }
          if (!box.min || !box.max) return;
          if (playerPos.x < box.min.x || playerPos.x > box.max.x || playerPos.z < box.min.z || playerPos.z > box.max.z) {
            return;
          }
          addTopCollisionContributor(out, {
            id: String(id),
            dynamic: !!entry.dynamic,
            minX: Number(box.min.x),
            maxX: Number(box.max.x),
            minY: Number(box.min.y),
            maxY: Number(box.max.y),
            minZ: Number(box.min.z),
            maxZ: Number(box.max.z),
          }, 5);
        });
      } catch (_err) {
        return out;
      }
      return out;
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
      const weapon = getFirstPersonWeapon(systems);
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
      const pc = getPlayerController(systems);
      return pc && pc.getCamera
        ? pc.getCamera()
        : null;
    }

    function pollEngineCombatStats(systems) {
      const hud = systems && systems.hudSystem;
      if (!hud || typeof hud.getStatsTracker !== 'function') return;
      let tracker;
      try {
        tracker = hud.getStatsTracker();
      } catch (_err) { return; }
      if (!tracker || typeof tracker.getStats !== 'function') return;
      let stats;
      try {
        stats = tracker.getStats();
      } catch (_err) { return; }
      if (!stats) return;
      const damage = rebasedTotal(state.damageDealt, stats.damageDealt, state.damageDealtBaseline);
      state.damageDealt = damage.total;
      state.damageDealtBaseline = damage.newBaseline;
      const k = rebasedTotal(state.kills, stats.kills, state.killsBaseline);
      state.kills = k.total;
      state.killsBaseline = k.newBaseline;
      const sf = rebasedTotal(state.shotsFiredEngine, stats.shotsFired, state.shotsFiredBaseline);
      state.shotsFiredEngine = sf.total;
      state.shotsFiredBaseline = sf.newBaseline;
      const sh = rebasedTotal(state.shotsHitEngine, stats.shotsHit, state.shotsHitBaseline);
      state.shotsHitEngine = sh.total;
      state.shotsHitBaseline = sh.newBaseline;
    }

    function getCameraAngles(systems) {
      const pc = getPlayerController(systems);
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

    const HEALTH_TOP_UP_COOLDOWN_MS = 1500;
    const HEALTH_TOP_UP_CRITICAL_RATIO = 0.7;
    const HEALTH_TOP_UP_CRITICAL_HP_ABS = 70;
    const HEALTH_TOP_UP_TARGET_RATIO = 0.95;
    const HEALTH_TOP_UP_BURST_HP = 80;
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
      const pc = getPlayerController(systems);
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
      const playerPos = getPlayerPos(systems);
      if (usesPlayerAnchoredFrontlineCompression(opts.mode) && playerPos) {
        const pdx = oc.x - playerPos.x;
        const pdz = oc.z - playerPos.z;
        const playerToOpfor = Math.hypot(pdx, pdz);
        const safeDx = playerToOpfor > 0.001 ? pdx / playerToOpfor : 0;
        const safeDz = playerToOpfor > 0.001 ? pdz / playerToOpfor : -1;
        const latX = -safeDz;
        const latZ = safeDx;
        function moveGroupAroundPlayer(group, side) {
          let moved = 0;
          const perSideCap = side > 0 ? 10 : 8;
          const cap = Math.min(group.length, Math.max(0, Math.min(opts.maxCompressedPerFaction, perSideCap)));
          for (let i = 0; i < cap; i++) {
            const c = group[i];
            const lane = (random() - 0.5) * (side > 0 ? 170 : 130);
            const forward = side > 0
              ? 160 + random() * 130
              : -(65 + random() * 85);
            const nx = playerPos.x + safeDx * forward + latX * lane;
            const nz = playerPos.z + safeDz * forward + latZ * lane;
            if (placeCompressedCombatantForHarness(systems, c, nx, nz)) moved++;
          }
          return moved;
        }
        const um = moveGroupAroundPlayer(us, -1);
        const om = moveGroupAroundPlayer(opfor, 1);
        state.frontlineMoveCount = um + om;
        state.frontlineDistance = playerToOpfor;
        state.frontlineCompressed = true;
        return;
      }
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
          const lane = (random() - 0.5) * 130;
          const forward = side * (35 + random() * 25);
          const nx = midX + safeDx * forward + latX * lane;
          const nz = midZ + safeDz * forward + latZ * lane;
          if (placeCompressedCombatantForHarness(systems, c, nx, nz)) moved++;
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

    function updateWaypoints(systems, playerPos, target, targetKind, routeIdentityKey) {
      if (!target) {
        state.waypoints = null;
        state.waypointIdx = 0;
        state.lastPathTargetKind = null;
        state.lastPathTargetDistance = null;
        state.lastPathTargetX = null;
        state.lastPathTargetZ = null;
        state.lastPathQueryStatus = null;
        state.lastPathLength = 0;
        state.lastPathFailureReason = null;
        state.lastPathQueryDistance = null;
        state.lastPathStartSnapped = null;
        state.lastPathEndSnapped = null;
        state.lastPathStartSnapDistance = null;
        state.lastPathEndSnapDistance = null;
        state.lastRouteProgressDistance = null;
        state.lastRouteProgressMoved = state.playerDistanceMoved;
        state.lastRouteProgressAt = 0;
        state.lastRouteOverlayDirX = null;
        state.lastRouteOverlayDirZ = null;
        return;
      }
      const now = Date.now();
      const targetKindName = targetKind ? String(targetKind) : 'unknown';
      const targetKey = routeIdentityKey ? String(routeIdentityKey) : targetKindName;
      const targetX = Number(target.x);
      const targetZ = Number(target.z);
      const targetDistance = playerPos ? botHorizontalDistance(playerPos, target) : null;
      const targetKindChanged = !!state.lastPathTargetKind && state.lastPathTargetKind !== targetKey;
      const targetMoved = hasRouteTargetMoved({
        lastTarget: { x: state.lastPathTargetX, z: state.lastPathTargetZ },
        nextTarget: { x: targetX, z: targetZ },
      });
      if (targetKindChanged || targetMoved) {
        state.waypoints = null;
        state.waypointIdx = 0;
        state.lastWaypointReplanAt = 0;
        state.routeTargetResets++;
        state.lastRouteProgressDistance = Number.isFinite(Number(targetDistance)) ? Number(targetDistance) : null;
        state.lastRouteProgressMoved = state.playerDistanceMoved;
        state.lastRouteProgressAt = now;
        state.lastRouteOverlayDirX = null;
        state.lastRouteOverlayDirZ = null;
      }
      state.lastPathTargetKind = targetKey;
      state.lastPathTargetDistance = targetDistance;
      state.lastPathTargetX = Number.isFinite(targetX) ? targetX : null;
      state.lastPathTargetZ = Number.isFinite(targetZ) ? targetZ : null;
      const routeProgressDistance = Number(targetDistance);
      if (Number.isFinite(routeProgressDistance)) {
        if (state.lastRouteProgressDistance === null || !Number.isFinite(Number(state.lastRouteProgressDistance))) {
          state.lastRouteProgressDistance = routeProgressDistance;
          state.lastRouteProgressMoved = state.playerDistanceMoved;
          state.lastRouteProgressAt = now;
        } else if (shouldResetRouteForNoProgress({
          currentDistance: routeProgressDistance,
          baselineDistance: Number(state.lastRouteProgressDistance),
          elapsedMs: now - Number(state.lastRouteProgressAt || now),
          playerMoved: state.playerDistanceMoved - Number(state.lastRouteProgressMoved || 0),
        })) {
          state.waypoints = null;
          state.waypointIdx = 0;
          state.lastWaypointReplanAt = 0;
          state.routeNoProgressResets++;
          state.lastRouteProgressDistance = routeProgressDistance;
          state.lastRouteProgressMoved = state.playerDistanceMoved;
          state.lastRouteProgressAt = now;
          if (shouldCooldownCombatTargetAfterNoProgress({ targetKind: targetKindName })) {
            const blockedId = routeFailureCooldownTargetId(
              state.currentTarget,
              target,
              routeIdentityKey,
              targetKindName,
            );
            if (markTargetTemporarilyBlocked(
              state.blockedTargetUntil,
              blockedId,
              now,
              ROUTE_NO_PROGRESS_TARGET_COOLDOWN_MS,
            )) {
              state.currentTarget = null;
              state.waypoints = null;
              state.waypointIdx = 0;
              state.lastWaypointReplanAt = 0;
              state.routeTargetResets++;
            }
          }
        } else {
          const closure = Number(state.lastRouteProgressDistance) - routeProgressDistance;
          const movedSinceBaseline = state.playerDistanceMoved - Number(state.lastRouteProgressMoved || 0);
          const closureRatio = movedSinceBaseline > 0 ? closure / movedSinceBaseline : closure > 0 ? Number.POSITIVE_INFINITY : 0;
          if (closure >= ROUTE_PROGRESS_MIN_IMPROVEMENT && closureRatio >= ROUTE_PROGRESS_MIN_CLOSURE_RATIO) {
            state.lastRouteProgressDistance = routeProgressDistance;
            state.lastRouteProgressMoved = state.playerDistanceMoved;
            state.lastRouteProgressAt = now;
          }
        }
      }
      const sinceReplan = now - state.lastWaypointReplanAt;
      const pathExhausted = !state.waypoints || state.waypoints.length === 0 || state.waypointIdx >= state.waypoints.length;
      const currentWp = state.waypoints && state.waypoints.length > 0
        ? state.waypoints[Math.min(state.waypointIdx, state.waypoints.length - 1)]
        : null;
      const steepClimbActive = isSteepClimbWaypoint({ playerPos: playerPos, waypoint: currentWp });
      const fastReplan = shouldFastReplan({
        pathExhausted: pathExhausted,
        sinceReplanMs: sinceReplan,
        fastReplanMs: 750,
        steepClimbActive: steepClimbActive,
      });
      const fullReplan = sinceReplan > profile.waypointReplanIntervalMs;
      const needsReplan = fullReplan || fastReplan;
      if (needsReplan) {
        const combatRoute = targetKindName === 'current_target' || targetKindName === 'nearest_opfor';
        const prePathLos = combatRoute ? queryTargetLineOfSight(systems, playerPos, target) : null;
        const requiresCombatApproachRoute = shouldRequireTrustedCombatApproachRoute({
          targetKind: targetKindName,
          targetVisible: prePathLos && prePathLos.clear,
        });
        const combatApproachTarget = requiresCombatApproachRoute
          ? resolveCombatApproachRouteTarget(systems, playerPos, target, targetKindName)
          : null;
        const combatApproachUnavailable = requiresCombatApproachRoute && !combatApproachTarget;
        const pathTarget = combatApproachTarget || target;
        const usingCombatApproachRoute = !!combatApproachTarget;
        const useDirectCombatRoute = shouldUseDirectCombatRouteBypass({
          targetKind: targetKindName,
          targetDistance: targetDistance,
          maxDistance: combatObjectiveMaxDistanceForProfile(profile),
          targetVisible: prePathLos && prePathLos.clear,
        });
        const useTerrainDirectRoute = useDirectCombatRoute || shouldUseTerrainDirectObjectiveRoute({
          targetKind: targetKindName,
          targetDistance: targetDistance,
          targetVisible: prePathLos && prePathLos.clear,
          allowTerrainDirect: profile.aggressiveMode === true,
        });
        const useCombatApproachTerrainDirect = shouldUseTerrainDirectCombatApproachRoute({
          allowTerrainDirect: profile.aggressiveMode === true,
          hasCombatApproachTarget: usingCombatApproachRoute,
        });
        let path = null;
        if (combatApproachUnavailable) {
          state.lastPathFailureReason = 'combat_approach_unavailable';
          state.lastPathQueryDistance = targetDistance;
          state.lastPathStartSnapped = null;
          state.lastPathEndSnapped = null;
          state.lastPathStartSnapDistance = null;
          state.lastPathEndSnapDistance = null;
        } else {
          path = useTerrainDirectRoute || useCombatApproachTerrainDirect
            ? createDirectCombatFallbackPath(playerPos, pathTarget)
            : queryPath(systems, playerPos, pathTarget);
        }
        state.lastWaypointReplanAt = now;
        if (path && path.length > 0) {
          state.waypoints = path;
          state.waypointIdx = 0;
          if (usingCombatApproachRoute) state.combatApproachRouteCount++;
          state.lastPathQueryStatus = useDirectCombatRoute
            ? 'direct_combat_fallback'
            : useTerrainDirectRoute
              ? 'terrain_direct'
              : useCombatApproachTerrainDirect
                ? 'combat_approach_terrain_direct'
                : usingCombatApproachRoute
                  ? 'combat_approach'
                  : 'ok';
          state.lastPathLength = path.length;
          state.lastPathFailureReason = null;
        } else {
          const fallbackLos = prePathLos || queryTargetLineOfSight(systems, playerPos, target);
          if (shouldUseDirectCombatRouteFallback({
            targetKind: targetKindName,
            failureReason: state.lastPathFailureReason,
            targetDistance: targetDistance,
            maxDistance: combatObjectiveMaxDistanceForProfile(profile),
            targetVisible: fallbackLos.clear,
          })) {
            const fallbackPath = createDirectCombatFallbackPath(playerPos, target);
            if (fallbackPath) {
              state.waypoints = fallbackPath;
              state.waypointIdx = 0;
              state.lastPathQueryStatus = 'direct_combat_fallback';
              state.lastPathLength = fallbackPath.length;
              state.lastPathFailureReason = null;
            } else {
              state.waypointReplanFailures++;
              state.waypoints = null;
              state.lastPathQueryStatus = 'failed';
              state.lastPathLength = 0;
            }
          } else {
            state.waypointReplanFailures++;
            state.waypoints = null;
            state.lastPathQueryStatus = 'failed';
            state.lastPathLength = 0;
            if (shouldCooldownCombatTargetAfterRouteFailure({
              targetKind: targetKindName,
              failureReason: state.lastPathFailureReason,
              targetVisible: fallbackLos.clear,
            })) {
              const blockedId = routeFailureCooldownTargetId(
                state.currentTarget,
                target,
                routeIdentityKey,
                targetKindName,
              );
              if (markTargetTemporarilyBlocked(
                state.blockedTargetUntil,
                blockedId,
                now,
                ROUTE_NO_PROGRESS_TARGET_COOLDOWN_MS,
              )) {
                state.currentTarget = null;
                state.waypoints = null;
                state.waypointIdx = 0;
                state.lastWaypointReplanAt = 0;
                state.routeTargetResets++;
              }
            }
            if (shouldCooldownObjectiveAfterRouteFailure({
              targetKind: targetKindName,
              failureReason: state.lastPathFailureReason,
            })) {
              const objectiveKey = objectiveBlockKey('zone', state.lastObjectiveZoneId);
              if (objectiveKey && markTargetTemporarilyBlocked(
                state.blockedTargetUntil,
                objectiveKey,
                now,
                ROUTE_FAILED_OBJECTIVE_COOLDOWN_MS,
              )) {
                state.waypoints = null;
                state.waypointIdx = 0;
                state.lastWaypointReplanAt = 0;
              }
            }
          }
        }
      }
      if (state.waypoints && state.waypoints.length > 0) {
        // Advance using 3D proximity (horizontal + vertical). On steep uphill
        // the old horizontal-only test reported "waypoint passed" before the
        // bot had actually climbed; the full-3D check keeps the waypoint in
        // play until the bot is both near AND at roughly the same altitude.
        while (state.waypointIdx < state.waypoints.length) {
          const wp = state.waypoints[state.waypointIdx];
          if (!shouldAdvanceWaypoint({ playerPos: playerPos, waypoint: wp })) break;
          state.waypointIdx++;
        }
        if (state.waypointIdx >= state.waypoints.length) state.lastWaypointReplanAt = 0;
      }
    }

    function overlayPathPoint(playerPos) {
      // Pure-pursuit lookahead along the current waypoints — when fresh and
      // valid, supplies a MOVEMENT anchor the driver can steer toward on the
      // navmesh. Aim (at the enemy) and movement (along the path) may diverge
      // when a corner blocks line of sight; that's fine and matches how a
      // human player moves. Returns the lookahead point as a world-space
      // 3D position, or null if there is no trusted path.
      const ageMs = Date.now() - state.lastWaypointReplanAt;
      if (!isPathTrusted({ path: state.waypoints, waypointIdx: state.waypointIdx, pathAgeMs: ageMs })) {
        return null;
      }
      const pt = pointAlongPath(state.waypoints, state.waypointIdx, { x: playerPos.x, z: playerPos.z }, computeAdaptiveLookahead(0));
      if (!pt) return null;
      state.waypointsFollowed++;
      return pt;
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
      // Detect damage taken. Accumulate strict drops only; respawn /
      // regen (health going up) doesn't count.
      const damageThisTick = damageTakenDelta(state.lastHealth, health.cur);
      if (damageThisTick > 0) {
        state.damageTaken += damageThisTick;
        state.lastDamageMs = Date.now();
      }
      state.lastHealth = health.cur;

      // Roll up engine-side combat stats (damage dealt, kills, shots)
      // from the live PlayerStatsTracker. This is read-only polling —
      // no event subscription, no engine instrumentation.
      pollEngineCombatStats(systems);

      // Ammo sustainment + health top-up.
      const hs = systems.playerHealthSystem;
      topUpPlayerHealth(hs);
      sustainAmmo(systems, false);

      if (health.dead) {
        if (opts.autoRespawn) handleDeath(systems);
        return;
      }
      deathHandled = false;

      const pc = getPlayerController(systems);
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
      if (state.lastMovementSamplePos) {
        const moved = botHorizontalDistance(state.lastMovementSamplePos, playerPos);
        if (Number.isFinite(moved) && moved < 100) state.playerDistanceMoved += moved;
      }
      state.lastMovementSamplePos = { x: playerPos.x, y: playerPos.y, z: playerPos.z };
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
      let objectiveResolved = false;
      let objectiveCache = null;
      const objectiveClosure = () => {
        if (!objectiveResolved) {
          objectiveCache = getObjective(systems, playerPos);
          objectiveResolved = true;
        }
        return objectiveCache;
      };

      // Update the locked target using object-permanence logic (4s stale
      // window), then gate the lock against the current objective. Without the
      // second step, PATROL can correctly reject a distant target while the
      // wrapper still routes movement toward that stale combatant.
      const freshTarget = findEnemyClosure();
      const objectiveForTargetGate = objectiveClosure();
      const previousTarget = state.currentTarget;
      const currentTargetLiveDetails = getCurrentTargetLiveDetails(systems, previousTarget);
      const currentTargetLive = currentTargetLiveDetails.live;
      state.lastCurrentTargetLive = currentTargetLive;
      state.lastCurrentTargetHealth = currentTargetLiveDetails.health;
      state.lastCurrentTargetState = currentTargetLiveDetails.state;
      const candidateTarget = updateLockedTarget(previousTarget, freshTarget, now, currentTargetLive);
      if (previousTarget && currentTargetLive === false) {
        state.droppedDeadTargetLocks++;
        if (!candidateTarget || candidateTarget.id !== previousTarget.id) {
          state.waypoints = null;
          state.waypointIdx = 0;
          state.lastWaypointReplanAt = 0;
        }
      }
      state.currentTarget = shouldUseTargetForCurrentObjective({
        target: candidateTarget,
        currentTarget: previousTarget,
        objective: objectiveForTargetGate,
        playerPos: playerPos,
        botState: state.botState,
        acquisitionDistance: botConfig.targetAcquisitionDistance,
        maxFireDistance: botConfig.maxFireDistance,
        canSeeTarget: losClosure,
      }) ? candidateTarget : null;
      const selectedTargetLiveDetails = getCurrentTargetLiveDetails(systems, state.currentTarget);
      state.currentTarget = refreshBotTargetFromLive(state.currentTarget, selectedTargetLiveDetails);
      state.currentTargetDistance = state.currentTarget && state.currentTarget.position
        ? botHorizontalDistance(playerPos, state.currentTarget.position)
        : null;
      state.lastCurrentTargetLive = selectedTargetLiveDetails.live;
      state.lastCurrentTargetHealth = selectedTargetLiveDetails.health;
      state.lastCurrentTargetState = selectedTargetLiveDetails.state;
      const previousTargetId = previousTarget && previousTarget.id ? String(previousTarget.id) : null;
      const selectedTargetId = state.currentTarget && state.currentTarget.id ? String(state.currentTarget.id) : null;
      const releaseFireForRetarget = shouldReleaseFireForRetarget(
        state.firingHeld,
        previousTargetId,
        selectedTargetId,
      );
      if (releaseFireForRetarget) {
        state.firingRetargets++;
        if (pc && typeof pc.fireStop === 'function') pc.fireStop();
        state.firingHeld = false;
        state.firingRetargetFireStops++;
        appendBoundedEvent(state.firingRetargetEpochs, {
          atMs: now,
          fromTargetId: previousTargetId,
          toTargetId: selectedTargetId,
          releasedFire: true,
          previousTargetLive: currentTargetLive,
          previousTargetHealth: currentTargetLiveDetails.health,
          selectedTargetLive: selectedTargetLiveDetails.live,
          selectedTargetHealth: selectedTargetLiveDetails.health,
          botState: state.botState,
          objectiveKind: state.lastObjectiveKind,
          objectiveDistance: state.lastObjectiveDistance,
          deadTargetDrops: state.droppedDeadTargetLocks,
        }, FIRING_RETARGET_EPOCH_HISTORY_LIMIT);
      }

      // Match-end check: TicketSystem owns the lifecycle, not GameModeManager.
      // Latch the first-observed timestamp + outcome so the capture-side reader
      // sees a stable value across subsequent samples.
      const ticketGameState = systems && systems.ticketSystem && typeof systems.ticketSystem.getGameState === 'function'
        ? systems.ticketSystem.getGameState() : null;
      const matchEnded = detectMatchEnded(ticketGameState, opts.mode);
      if (matchEnded && state.matchEndedAtMs === null) {
        state.matchEndedAtMs = now;
        state.matchOutcome = detectMatchOutcome(ticketGameState, opts.mode);
      }

      const ctx = {
        now,
        state: state.botState,
        timeInStateMs: state.timeInStateMs,
        eyePos: {
          x: playerPos.x,
          y: playerPos.y,
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
        matchEnded: matchEnded,
      };

      const step = stepBotState(state.botState, ctx);
      if (step.nextState && step.nextState !== state.botState) {
        transitionBot(step.nextState);
      } else if (step.resetTimeInState) {
        state.timeInStateMs = 0;
      }

      // ── Path overlay — when ADVANCE or PATROL, try to follow a navmesh waypoint
      // so the bot doesn't walk through hills. Active only if the current state
      // wants forward motion and we have a usable anchor. `overlayPathPoint` is
      // a 3D point the driver steers MOVEMENT toward; AIM still points at the
      // bot's chosen aim target (usually the enemy).
      let overlayPoint = null;
      if (shouldUseRouteOverlayForIntent({
        intent: step.intent,
        botState: state.botState,
        currentTarget: state.currentTarget,
        currentTargetVisible: state.currentTarget ? losClosure(state.currentTarget.position) : false,
      })) {
        const patrolObjective = state.currentTarget ? null : objectiveClosure();
        const anchorKind = state.currentTarget ? 'current_target'
          : (patrolObjective && patrolObjective.kind ? patrolObjective.kind : null);
        const anchor = state.currentTarget ? state.currentTarget.position
          : (patrolObjective ? patrolObjective.position : null);
        const routeKey = state.currentTarget
          ? routeTargetIdentityKey(anchorKind, {
              id: state.currentTarget.id,
              kind: anchorKind,
              position: state.currentTarget.position,
            }, null)
          : routeTargetIdentityKey(anchorKind, patrolObjective, state.lastObjectiveZoneId);
        if (anchor) {
          updateWaypoints(systems, playerPos, anchor, anchorKind, routeKey);
          overlayPoint = overlayPathPoint(playerPos);
          if (overlayPoint) rememberRouteOverlayDirection(state, playerPos, overlayPoint);
          if (isRoutePathExhausted(state.waypoints, state.waypointIdx)) {
            state.lastWaypointReplanAt = 0;
            overlayPoint = computeRouteContinuationPoint(
              playerPos,
              state.lastRouteOverlayDirX,
              state.lastRouteOverlayDirZ,
              computeAdaptiveLookahead(0),
            ) || computeAnchorContinuationPoint(playerPos, anchor, computeAdaptiveLookahead(0));
            if (overlayPoint) {
              step.intent.movementTarget = {
                x: Number(overlayPoint.x || 0),
                y: Number.isFinite(Number(overlayPoint.y))
                  ? Number(overlayPoint.y) + PLAYER_EYE_HEIGHT
                  : Number(playerPos.y || 0),
                z: Number(overlayPoint.z || 0),
              };
              applyRouteOverlayRecovery(step.intent, overlayPoint, state.stuckMs);
            } else {
              step.intent.movementTarget = null;
              step.intent.moveForward = 0;
              step.intent.sprint = false;
            }
          } else if (isRouteOverlayMicroTarget(playerPos, overlayPoint, anchor)) {
            state.waypoints = null;
            state.waypointIdx = 0;
            state.lastWaypointReplanAt = 0;
            overlayPoint = computeAnchorContinuationPoint(playerPos, anchor, computeAdaptiveLookahead(0));
            if (overlayPoint) {
              step.intent.movementTarget = {
                x: Number(overlayPoint.x || 0),
                y: Number.isFinite(Number(overlayPoint.y))
                  ? Number(overlayPoint.y) + PLAYER_EYE_HEIGHT
                  : Number(playerPos.y || 0),
                z: Number(overlayPoint.z || 0),
              };
              applyRouteOverlayRecovery(step.intent, overlayPoint, state.stuckMs);
            } else {
              step.intent.movementTarget = null;
              step.intent.moveForward = 0;
              step.intent.sprint = false;
            }
          } else {
            step.intent.movementTarget = overlayPoint
              ? {
                  x: Number(overlayPoint.x || 0),
                  y: Number.isFinite(Number(overlayPoint.y))
                    ? Number(overlayPoint.y) + PLAYER_EYE_HEIGHT
                    : Number(playerPos.y || 0),
                  z: Number(overlayPoint.z || 0),
                }
              : null;
            applyRouteOverlayRecovery(step.intent, overlayPoint, state.stuckMs);
          }
        }
      }

      // Apply the intent via the PlayerController surface. Intent → controls.
      applyIntent(systems, step.intent, angles, overlayPoint, playerPos, releaseFireForRetarget);

      // Telemetry hooks for capture-side validators.
      if (step.intent.firePrimary) state.shotsFired++;
      if (step.intent.reload) state.reloadsIssued++;

      // Stuck detection — track horizontal displacement. The old driver had a
      // fancy teleport-recovery loop; with the bot consuming navmesh paths,
      // stuck-ness usually means "terrain not loaded yet", so we only record
      // the maximum for telemetry and let the autorespawn handle extreme cases.
      const shouldTrackStuck = shouldTrackHarnessStuckProgress(step.intent);
      if (!shouldTrackStuck) {
        state.stuckMs = 0;
        state.lastStablePos = { x: playerPos.x, z: playerPos.z };
      } else if (!state.lastStablePos) {
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

      // Pit-trap escape — when the bot has been pinned >4s and the next
      // waypoint is meaningfully above (i.e. the navmesh route requires
      // climbing out of a pit floor we snapped onto), invalidate the path
      // and force the next tick to re-snap + re-plan from the current
      // position. Re-planning from a pit floor sometimes finds a different
      // exit; if it doesn't, the planner will at least retry from a fresh
      // navmesh-snapped start point. We rate-limit to one escape per stuck
      // window so we don't thrash queryPath every tick.
      if (state.stuckMs > 4000) {
        const currentWp = state.waypoints && state.waypoints.length > 0
          ? state.waypoints[Math.min(state.waypointIdx, state.waypoints.length - 1)]
          : null;
        if (detectPitTrap({ stuckMs: state.stuckMs, playerPos: playerPos, currentWaypoint: currentWp })) {
          state.waypoints = null;
          state.waypointIdx = 0;
          state.lastWaypointReplanAt = 0; // force the next tick to replan
          state.stuckTeleportCount++;
          state.stuckMs = 0;
          state.lastStablePos = { x: playerPos.x, z: playerPos.z };
        } else if (shouldSkipStuckWaypoint({
          stuckMs: state.stuckMs,
          path: state.waypoints,
          waypointIdx: state.waypointIdx,
        })) {
          state.waypointIdx++;
          state.stuckWaypointSkips++;
          state.stuckMs = 0;
          state.lastStablePos = { x: playerPos.x, z: playerPos.z };
        }
      }
    }

    function updateLockedTarget(current, fresh, now, currentIsLive) {
      return selectLockedTarget(current, fresh, now, 4000, currentIsLive);
    }

    function applyIntent(systems, intent, currentAngles, overlayPoint, playerPos, releaseFireForRetarget) {
      const pc = getPlayerController(systems);
      if (!pc) return;

      const requestedForward = clampAxis(intent.moveForward);
      const requestedStrafe = clampAxis(intent.moveStrafe);
      const wantsMovement = Math.abs(requestedForward) > 0.01 || Math.abs(requestedStrafe) > 0.01;

      // ── Aim path: camera.lookAt() is the ONLY place the rotation
      // convention lives. The bot writes a world-space aim target; the
      // driver asks Three.js to compute the corresponding (yaw, pitch)
      // and then applies a lerped value via setViewAngles. This is the
      // same pattern as the old killbot (commit 37da280) and every other
      // camera consumer in the repo (PlayerCamera, DeathCamSystem,
      // MortarCamera, SpectatorCamera, flightTestScene).
      const camera = getCamera(systems);
      if (!state.viewSeeded) {
        state.lastYaw = currentAngles.yaw;
        state.lastPitch = currentAngles.pitch;
        state.viewSeeded = true;
      }
      const viewAnchor = syncViewAnchorToActual(
        state.lastYaw,
        state.lastPitch,
        currentAngles && currentAngles.yaw,
        currentAngles && currentAngles.pitch,
      );
      const viewAnchorYawDeg = Math.abs(viewAnchor.yawDelta) * 180 / Math.PI;
      const viewAnchorPitchDeg = Math.abs(viewAnchor.pitchDelta) * 180 / Math.PI;
      state.lastViewAnchorResyncChanged = !!viewAnchor.changed;
      state.lastViewAnchorResyncYawDeg = Number.isFinite(viewAnchorYawDeg) ? viewAnchorYawDeg : 0;
      state.lastViewAnchorResyncPitchDeg = Number.isFinite(viewAnchorPitchDeg) ? viewAnchorPitchDeg : 0;
      if (viewAnchor.changed) {
        state.viewAnchorResyncCount++;
        state.maxViewAnchorResyncYawDeg = Math.max(
          state.maxViewAnchorResyncYawDeg,
          state.lastViewAnchorResyncYawDeg,
        );
        state.maxViewAnchorResyncPitchDeg = Math.max(
          state.maxViewAnchorResyncPitchDeg,
          state.lastViewAnchorResyncPitchDeg,
        );
      }
      state.lastYaw = viewAnchor.yaw;
      state.lastPitch = viewAnchor.pitch;
      state.lastViewStepYawDeg = 0;
      state.lastViewStepPitchDeg = 0;
      state.lastRequestedViewYawDeltaDeg = 0;
      state.lastRequestedViewPitchDeltaDeg = 0;
      state.lastRemainingViewYawErrorDeg = 0;
      state.lastRemainingViewPitchErrorDeg = 0;
      state.lastViewYawClamped = false;
      state.lastViewPitchClamped = false;
      state.lastAimDot = null;
      state.lastFireIntent = !!intent.firePrimary;
      state.lastAimGatePassed = null;
      state.lastAimGateReason = null;
      state.lastFireLosGatePassed = null;
      state.lastViewUpdateAtMs = Date.now();

      let yawNext = state.lastYaw;
      let pitchNext = state.lastPitch;
      let aimDot = null; // aim-dot against intent.aimTarget, for the fire gate
      const viewTarget = selectDriverViewTarget(intent, overlayPoint, wantsMovement);
      state.lastViewTargetKind = classifyDriverViewTarget(intent, overlayPoint, viewTarget);
      if (viewTarget && camera) {
        const prevOrder = camera.rotation.order;
        camera.rotation.order = 'YXZ';
        const savedY = camera.rotation.y;
        const savedX = camera.rotation.x;
        camera.lookAt(
          Number(viewTarget.x || 0),
          Number(viewTarget.y || 0),
          Number(viewTarget.z || 0),
        );
        const targetYaw = Number(camera.rotation.y || 0);
        const targetPitch = Number(camera.rotation.x || 0);
        camera.rotation.y = savedY;
        camera.rotation.x = savedX;
        camera.rotation.order = prevOrder;

        const desiredYaw = lerpAngle(state.lastYaw, targetYaw, intent.aimLerpRate);
        const desiredPitch = clampPitch(state.lastPitch + (clampPitch(targetPitch) - state.lastPitch) * clamp01(intent.aimLerpRate));
        const slewedView = applyViewSlewLimit(state.lastYaw, state.lastPitch, desiredYaw, desiredPitch);
        yawNext = slewedView.yaw;
        pitchNext = slewedView.pitch;
        state.lastViewYawClamped = !!slewedView.yawClamped;
        state.lastViewPitchClamped = !!slewedView.pitchClamped;
        if (slewedView.yawClamped || slewedView.pitchClamped) {
          state.viewSlewClampCount++;
        }
        const yawStepDeg = Math.abs(signedYawDelta(state.lastYaw, yawNext)) * 180 / Math.PI;
        const pitchStepDeg = Math.abs(pitchNext - state.lastPitch) * 180 / Math.PI;
        const requestedYawDeltaDeg = Math.abs(Number(slewedView.yawDelta || 0) * 180 / Math.PI);
        const requestedPitchDeltaDeg = Math.abs(Number(slewedView.pitchDelta || 0) * 180 / Math.PI);
        const remainingYawErrorDeg = Math.abs(Number(slewedView.remainingYawDelta || 0) * 180 / Math.PI);
        const remainingPitchErrorDeg = Math.abs(Number(slewedView.remainingPitchDelta || 0) * 180 / Math.PI);
        state.lastViewStepYawDeg = Number.isFinite(yawStepDeg) ? yawStepDeg : 0;
        state.lastViewStepPitchDeg = Number.isFinite(pitchStepDeg) ? pitchStepDeg : 0;
        state.lastRequestedViewYawDeltaDeg = Number.isFinite(requestedYawDeltaDeg) ? requestedYawDeltaDeg : 0;
        state.lastRequestedViewPitchDeltaDeg = Number.isFinite(requestedPitchDeltaDeg) ? requestedPitchDeltaDeg : 0;
        state.lastRemainingViewYawErrorDeg = Number.isFinite(remainingYawErrorDeg) ? remainingYawErrorDeg : 0;
        state.lastRemainingViewPitchErrorDeg = Number.isFinite(remainingPitchErrorDeg) ? remainingPitchErrorDeg : 0;
        if (Number.isFinite(yawStepDeg)) {
          state.maxViewYawStepDeg = Math.max(state.maxViewYawStepDeg, yawStepDeg);
        }
        if (Number.isFinite(pitchStepDeg)) {
          state.maxViewPitchStepDeg = Math.max(state.maxViewPitchStepDeg, pitchStepDeg);
        }
        if (Number.isFinite(requestedYawDeltaDeg)) {
          state.maxRequestedViewYawDeltaDeg = Math.max(state.maxRequestedViewYawDeltaDeg, requestedYawDeltaDeg);
        }
        if (Number.isFinite(requestedPitchDeltaDeg)) {
          state.maxRequestedViewPitchDeltaDeg = Math.max(state.maxRequestedViewPitchDeltaDeg, requestedPitchDeltaDeg);
        }
        if (Number.isFinite(remainingYawErrorDeg)) {
          state.maxRemainingViewYawErrorDeg = Math.max(state.maxRemainingViewYawErrorDeg, remainingYawErrorDeg);
        }
        if (Number.isFinite(remainingPitchErrorDeg)) {
          state.maxRemainingViewPitchErrorDeg = Math.max(state.maxRemainingViewPitchErrorDeg, remainingPitchErrorDeg);
        }
        if (Math.max(requestedYawDeltaDeg, requestedPitchDeltaDeg) > 45) {
          state.largeViewTurnCount++;
        }
        if (typeof pc.setViewAngles === 'function') {
          pc.setViewAngles(yawNext, pitchNext);
        }
        state.lastYaw = yawNext;
        state.lastPitch = pitchNext;

        // After setViewAngles, the camera points at (yawNext, pitchNext).
        // Compute cosine of (camera forward) vs (eye→aimTarget) for the
        // fire gate. When viewTarget is the route overlay and the bot is not
        // firing, this is intentionally skipped.
        if (intent.aimTarget && readCameraWorld(camera, _tmpEye, _tmpForward)) {
          const tx = Number(intent.aimTarget.x || 0) - _tmpEye.x;
          const ty = Number(intent.aimTarget.y || 0) - _tmpEye.y;
          const tz = Number(intent.aimTarget.z || 0) - _tmpEye.z;
          const tLen = Math.hypot(tx, ty, tz);
          if (tLen > 1e-6) {
            aimDot = (_tmpForward.x * tx + _tmpForward.y * ty + _tmpForward.z * tz) / tLen;
            state.lastAimDot = Number.isFinite(aimDot) ? aimDot : null;
          }
        }
      }

      // Movement intent. Apply after view slew so the normal camera-relative
      // PlayerMovement path sees the same orientation the harness just
      // committed. This keeps route-following measurable without using the
      // perf-driver-only world-movement bypass.
      const cameraRelativeMovement = computeCameraRelativeMovementIntent(intent, overlayPoint, playerPos, yawNext);
      const forward = clampAxis(cameraRelativeMovement.forward);
      const strafe = clampAxis(cameraRelativeMovement.strafe);
      const sprint = !!intent.sprint && forward > 0.1;
      if (typeof pc.applyMovementIntent === 'function') {
        pc.applyMovementIntent({ forward, strafe, sprint });
        const movementIntent = {
          forward,
          strafe,
          sprint,
          wantsMovement,
          requestedForward,
          requestedStrafe,
          movementMode: 'camera',
          worldX: null,
          worldZ: null,
          worldDistance: cameraRelativeMovement.targetDistance,
          targetYawDeltaDeg: cameraRelativeMovement.targetYawDeltaDeg,
          atMs: Date.now(),
        };
        state.movementIntentCalls++;
        state.cameraMovementIntentCalls++;
        state.lastMovementIntent = movementIntent;
        if (wantsMovement) {
          state.nonZeroMovementIntentCalls++;
          state.nonZeroCameraMovementIntentCalls++;
          state.lastNonZeroMovementIntent = movementIntent;
        }
      }

      // ── Fire gate: require aim-dot ≥ 0.8 (cos ≈ 37° cone) before firing.
      // This catches any future yaw-convention drift: if the camera isn't
      // pointing at the aim target, SUPPRESS the trigger rather than spray
      // into empty air. The gate is the same primitive as
      // `evaluateFireDecision(aimDotThreshold=0.8)` exported at the top of
      // this file; we call that export directly so the gate behavior is
      // one surface, not two.
      if (intent.reload) {
        if (state.firingHeld || readPlayerWeaponFiringActive(systems) === true) {
          if (typeof pc.fireStop === 'function') pc.fireStop();
          state.firingHeld = false;
        }
        if (typeof pc.reloadWeapon === 'function') pc.reloadWeapon();
      } else if (intent.firePrimary) {
        let passesAimGate = true;
        let fireAimDot = aimDot;
        let fireAimReason = 'not_checked';
        let issuedFireStart = false;
        let issuedPulseFireStop = false;
        let weaponFiringActiveBefore = null;
        let weaponFiringActiveAfter = null;
        let passesRuntimeShotPreviewGate = true;
        let runtimeShotPreview = null;
        let runtimeShotPreviewDecision = { shouldFire: true, status: 'not_checked', reason: 'not_checked' };
        state.lastAimGateReason = fireAimReason;
        if (intent.aimTarget && camera && aimDot !== null && readCameraWorld(camera, _tmpEye, _tmpForward)) {
          // Route through evaluateFireDecision to reuse the export (not dead code).
          const toTarget = {
            x: Number(intent.aimTarget.x || 0) - _tmpEye.x,
            y: Number(intent.aimTarget.y || 0) - _tmpEye.y,
            z: Number(intent.aimTarget.z || 0) - _tmpEye.z,
          };
          const dist = Math.hypot(toTarget.x, toTarget.y, toTarget.z);
          const decision = evaluateFireDecision({
            cameraForward: { x: _tmpForward.x, y: _tmpForward.y, z: _tmpForward.z },
            toTarget: toTarget,
            aimDotThreshold: 0.8,
            verticalThreshold: 0.45,
            closeRange: dist < 10,
            allowSteepGroundFire: !!state.currentTarget,
          });
          passesAimGate = !!decision.shouldFire;
          fireAimDot = decision.aimDot;
          fireAimReason = decision.reason;
          state.lastAimGatePassed = passesAimGate;
          state.lastAimGateReason = fireAimReason;
          state.lastAimDot = Number.isFinite(Number(fireAimDot)) ? Number(fireAimDot) : state.lastAimDot;
          if (!passesAimGate) state.aimDotGateRejectedShots++;
        }
        let passesFireLosGate = true;
        let fireLosStatus = 'not_checked';
        let fireLosReason = 'not_checked';
        if (passesAimGate && intent.aimTarget && camera && readCameraWorld(camera, _tmpEye, _tmpForward)) {
          const fireLos = queryTerrainLineOfSight(
            systems && systems.terrainSystem,
            _tmpEye,
            intent.aimTarget,
            0.75,
          );
          passesFireLosGate = fireLos.clear;
          fireLosStatus = fireLos.status;
          fireLosReason = fireLos.reason;
          state.lastFireLosGatePassed = passesFireLosGate;
          state.lastFireLosStatus = fireLosStatus;
          state.lastFireLosReason = fireLosReason;
          state.lastFireProbe = {
            aimDot: Number.isFinite(Number(fireAimDot)) ? Number(fireAimDot) : null,
            aimReason: fireAimReason,
            losStatus: fireLosStatus,
            losReason: fireLosReason,
          };
          if (!passesFireLosGate) {
            state.losRejectedShots++;
            if (fireLos.status === 'unknown') state.fireUnknownLosRejectedShots++;
          }
        }
        if (passesAimGate && passesFireLosGate && camera) {
          const expectedTargetId = state.currentTarget ? String(state.currentTarget.id) : null;
          const expectedProxyRadius = state.currentTarget
            ? targetChestProxyRadius(state.currentTarget.scaleY)
            : null;
          runtimeShotPreview = queryRuntimeShotPreview(systems, camera, expectedTargetId, intent.aimTarget, expectedProxyRadius);
          runtimeShotPreviewDecision = classifyRuntimeShotPreview(runtimeShotPreview, expectedTargetId);
          passesRuntimeShotPreviewGate = !!runtimeShotPreviewDecision.shouldFire;
          state.lastRuntimeShotPreviewStatus = runtimeShotPreviewDecision.status;
          state.lastRuntimeShotPreviewReason = runtimeShotPreviewDecision.reason;
          state.lastRuntimeShotPreviewHitTargetId = runtimeShotPreview && runtimeShotPreview.hitTargetId
            ? String(runtimeShotPreview.hitTargetId)
            : null;
          state.lastRuntimeShotPreviewExpectedInSpatialCandidates =
            runtimeShotPreview && typeof runtimeShotPreview.expectedTargetInSpatialCandidates === 'boolean'
              ? runtimeShotPreview.expectedTargetInSpatialCandidates
              : null;
          if (!passesRuntimeShotPreviewGate) {
            if (runtimeShotPreviewDecision.status === 'aim_settling') {
              state.runtimeShotPreviewAimSettlingShots++;
            } else if (runtimeShotPreviewDecision.status === 'terrain_blocked') {
              state.runtimeShotPreviewTerrainBlockedShots++;
              const blockedId = state.currentTarget && state.currentTarget.id;
              if (markTargetTemporarilyBlocked(
                state.blockedTargetUntil,
                blockedId,
                Date.now(),
                RUNTIME_TERRAIN_BLOCK_TARGET_COOLDOWN_MS,
              )) {
                state.currentTarget = null;
                state.waypoints = null;
                state.waypointIdx = 0;
                state.lastWaypointReplanAt = 0;
                state.routeTargetResets++;
              }
            } else {
              state.runtimeShotPreviewRejectedShots++;
              if (runtimeShotPreviewDecision.status === 'unavailable') state.runtimeShotPreviewUnavailableShots++;
              else if (runtimeShotPreviewDecision.status === 'wrong_target') state.runtimeShotPreviewWrongTargetShots++;
              else state.runtimeShotPreviewMissShots++;
            }
          }
        } else {
          state.lastRuntimeShotPreviewStatus = runtimeShotPreviewDecision.status;
          state.lastRuntimeShotPreviewReason = runtimeShotPreviewDecision.reason;
          state.lastRuntimeShotPreviewHitTargetId = null;
          state.lastRuntimeShotPreviewExpectedInSpatialCandidates = null;
        }
        if (passesAimGate && passesFireLosGate && passesRuntimeShotPreviewGate && !releaseFireForRetarget) {
          weaponFiringActiveBefore = readPlayerWeaponFiringActive(systems);
          if (shouldIssueFireStart(state.firingHeld, weaponFiringActiveBefore)) {
            const weaponTypeForPulse = getWeaponHarnessSnapshot(systems)?.equippedWeaponType;
            if (typeof pc.fireStart === 'function') pc.fireStart();
            issuedFireStart = true;
            weaponFiringActiveAfter = readPlayerWeaponFiringActive(systems);
            if (weaponFiringActiveAfter === false) {
              state.firingHeld = false;
              state.fireStartRejected++;
            } else if (shouldPulseHarnessFire({
              firePrimary: true,
              weaponType: weaponTypeForPulse,
            }) && typeof pc.fireStop === 'function') {
              // Programmatic fireStart takes the same live shot path as a
              // player click. Stop immediately after that trigger so the
              // harness samples fresh aim for the next shot instead of holding
              // automatic fire while recoil climbs between driver ticks.
              pc.fireStop();
              issuedPulseFireStop = true;
              state.pulsedFireStops++;
              state.firingHeld = false;
              state.lastShotAt = Date.now();
            } else {
              state.firingHeld = true;
              state.lastShotAt = Date.now();
            }
          }
        }
        appendBoundedEvent(state.shotEpochs, {
          atMs: Date.now(),
          botState: state.botState,
          targetId: state.currentTarget ? String(state.currentTarget.id) : null,
          targetLive: state.lastCurrentTargetLive,
          targetHealth: state.lastCurrentTargetHealth,
          targetState: state.lastCurrentTargetState,
          targetDistance: state.currentTargetDistance,
          aimTarget: makePlainVector(intent.aimTarget),
          objectiveKind: state.lastObjectiveKind,
          objectiveDistance: state.lastObjectiveDistance,
          aimDot: Number.isFinite(Number(fireAimDot)) ? Number(fireAimDot) : null,
          aimReason: fireAimReason,
          aimGatePassed: passesAimGate,
          losStatus: fireLosStatus,
          losReason: fireLosReason,
          losGatePassed: passesFireLosGate,
          runtimeShotPreview: runtimeShotPreview,
          runtimeShotPreviewStatus: runtimeShotPreviewDecision.status,
          runtimeShotPreviewReason: runtimeShotPreviewDecision.reason,
          runtimeShotPreviewGatePassed: passesRuntimeShotPreviewGate,
          issuedFireStart,
          issuedPulseFireStop,
          releasedFireForRetarget: releaseFireForRetarget,
          firingHeld: state.firingHeld,
          weaponFiringActiveBefore,
          weaponFiringActiveAfter,
          pathTargetKind: state.lastPathTargetKind,
          pathQueryStatus: state.lastPathQueryStatus,
          pathFailureReason: state.lastPathFailureReason,
          pathStartSnapDistance: state.lastPathStartSnapDistance,
          pathEndSnapDistance: state.lastPathEndSnapDistance,
          routeProgressAgeMs: state.lastRouteProgressAt > 0 ? Math.max(0, Date.now() - state.lastRouteProgressAt) : null,
          deadTargetDrops: state.droppedDeadTargetLocks,
          presentationContext: readPresentationContextForShot(),
        }, SHOT_EPOCH_HISTORY_LIMIT);
        if (!(passesAimGate && passesFireLosGate && passesRuntimeShotPreviewGate) && (state.firingHeld || readPlayerWeaponFiringActive(systems) === true)) {
          if (typeof pc.fireStop === 'function') pc.fireStop();
          state.firingHeld = false;
        }
      } else if (state.firingHeld || readPlayerWeaponFiringActive(systems) === true) {
        if (typeof pc.fireStop === 'function') pc.fireStop();
        state.firingHeld = false;
      }

      const aimMovementDivergence = computeViewMovementDivergence(viewTarget, intent, overlayPoint, playerPos);
      if (aimMovementDivergence) {
        state.aimMovementDivergenceSamples++;
        state.maxAimMovementDivergenceDeg = Math.max(
          state.maxAimMovementDivergenceDeg,
          Number(aimMovementDivergence.angleDeg || 0),
        );
        if (Number(aimMovementDivergence.angleDeg || 0) > 45) {
          state.aimMovementDivergenceOver45Count++;
        }
      }
    }

    function clampAxis(x) {
      if (!Number.isFinite(x)) return 0;
      return Math.max(-1, Math.min(1, x));
    }

    function clampPitch(p) {
      return clampDriverPitch(p);
    }

    function clamp01(x) {
      if (!Number.isFinite(x)) return 0;
      return Math.max(0, Math.min(1, x));
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

    // ── Camera-world extraction (no THREE.Vector3 dependency).
    // applyIntent needs (camera position, forward direction) to compute the
    // aim-dot gate. We pull both directly from `camera.matrixWorld`, which
    // is a 16-element Float32Array/number[] in column-major order:
    //   elements[0..3]   = right  (x-axis column)
    //   elements[4..7]   = up     (y-axis column)
    //   elements[8..11]  = -forward (−z-axis column — THREE stores camera's
    //                                +z as "back"; −z is its forward)
    //   elements[12..15] = translation (world position)
    // This matches `camera.getWorldDirection()` / `getWorldPosition()` without
    // needing a THREE.Vector3 scratch, which the perf harness bundle does
    // not expose globally.
    function readCameraWorld(camera, outEye, outForward) {
      if (!camera || typeof camera.updateMatrixWorld !== 'function') return false;
      camera.updateMatrixWorld(true);
      const e = camera.matrixWorld && camera.matrixWorld.elements;
      if (!e) return false;
      outEye.x = Number(e[12]); outEye.y = Number(e[13]); outEye.z = Number(e[14]);
      // Forward = negative third column (camera looks down its -Z).
      let fx = -Number(e[8]), fy = -Number(e[9]), fz = -Number(e[10]);
      const len = Math.hypot(fx, fy, fz);
      if (len > 1e-6) { fx /= len; fy /= len; fz /= len; }
      outForward.x = fx; outForward.y = fy; outForward.z = fz;
      return true;
    }

    const _tmpEye = { x: 0, y: 0, z: 0 };
    const _tmpForward = { x: 0, y: 0, z: 0 };

    // ── Public surface ──

    function start() {
      setPerfDriverHudActive(true);
      state.heartbeatTimer = setInterval(tick, decisionIntervalMs);
      tick();
    }

    function stop() {
      if (state.heartbeatTimer) { clearInterval(state.heartbeatTimer); state.heartbeatTimer = null; }
      setPerfDriverHudActive(false);
      const systems = getSystems();
      const runtimeLiveness = getRuntimeLiveness(systems);
      // One last roll-up before we tear down so the stop-stats reflect
      // any damage / kills landed in the final tick window.
      pollEngineCombatStats(systems);
      releaseAllControls(systems);
      return {
        respawnCount: state.respawnCount,
        driverSeed: opts.driverSeed,
        movementDecisionIntervalMs: decisionIntervalMs,
        ammoRefillCount: state.ammoRefillCount,
        healthTopUpCount: state.healthTopUpCount,
        frontlineCompressed: state.frontlineCompressed,
        frontlineDistance: state.frontlineDistance,
        frontlineMoveCount: state.frontlineMoveCount,
        capturedZoneCount: 0,
        movementTransitions: state.transitions,
        droppedDeadTargetLocks: state.droppedDeadTargetLocks,
        firingRetargets: state.firingRetargets,
        firingRetargetFireStops: state.firingRetargetFireStops,
        firingRetargetEpochs: state.firingRetargetEpochs.slice(),
        losRejectedShots: state.losRejectedShots,
        losUnknownTargetChecks: state.losUnknownTargetChecks,
        fireUnknownLosRejectedShots: state.fireUnknownLosRejectedShots,
        lastTargetLosStatus: state.lastTargetLosStatus,
        lastTargetLosReason: state.lastTargetLosReason,
        lastFireLosStatus: state.lastFireLosStatus,
        lastFireLosReason: state.lastFireLosReason,
        lastCurrentTargetLive: state.lastCurrentTargetLive,
        lastCurrentTargetHealth: state.lastCurrentTargetHealth,
        lastCurrentTargetState: state.lastCurrentTargetState,
        shotEpochs: state.shotEpochs.slice(),
        lastFireProbe: state.lastFireProbe,
        aimDotGateRejectedShots: state.aimDotGateRejectedShots,
        fireStartRejected: state.fireStartRejected,
        pulsedFireStops: state.pulsedFireStops,
        runtimeShotPreviewRejectedShots: state.runtimeShotPreviewRejectedShots,
        runtimeShotPreviewAimSettlingShots: state.runtimeShotPreviewAimSettlingShots,
        runtimeShotPreviewTerrainBlockedShots: state.runtimeShotPreviewTerrainBlockedShots,
        runtimeShotPreviewUnavailableShots: state.runtimeShotPreviewUnavailableShots,
        runtimeShotPreviewMissShots: state.runtimeShotPreviewMissShots,
        runtimeShotPreviewWrongTargetShots: state.runtimeShotPreviewWrongTargetShots,
        lastRuntimeShotPreviewStatus: state.lastRuntimeShotPreviewStatus,
        lastRuntimeShotPreviewReason: state.lastRuntimeShotPreviewReason,
        lastRuntimeShotPreviewHitTargetId: state.lastRuntimeShotPreviewHitTargetId,
        lastRuntimeShotPreviewExpectedInSpatialCandidates: state.lastRuntimeShotPreviewExpectedInSpatialCandidates,
        stuckTeleportCount: state.stuckTeleportCount,
        stuckWaypointSkips: state.stuckWaypointSkips,
        routeTargetResets: state.routeTargetResets,
        routeNoProgressResets: state.routeNoProgressResets,
        maxStuckSeconds: Math.max(0, Math.round(state.maxStuckMs / 100) / 10),
        maxViewYawStepDeg: Math.round(state.maxViewYawStepDeg * 10) / 10,
        maxViewPitchStepDeg: Math.round(state.maxViewPitchStepDeg * 10) / 10,
        viewSlewClampCount: state.viewSlewClampCount,
        viewAnchorResyncCount: state.viewAnchorResyncCount,
        lastViewStepYawDeg: Math.round(state.lastViewStepYawDeg * 10) / 10,
        lastViewStepPitchDeg: Math.round(state.lastViewStepPitchDeg * 10) / 10,
        lastRequestedViewYawDeltaDeg: Math.round(state.lastRequestedViewYawDeltaDeg * 10) / 10,
        lastRequestedViewPitchDeltaDeg: Math.round(state.lastRequestedViewPitchDeltaDeg * 10) / 10,
        lastRemainingViewYawErrorDeg: Math.round(state.lastRemainingViewYawErrorDeg * 10) / 10,
        lastRemainingViewPitchErrorDeg: Math.round(state.lastRemainingViewPitchErrorDeg * 10) / 10,
        lastViewYawClamped: state.lastViewYawClamped,
        lastViewPitchClamped: state.lastViewPitchClamped,
        lastViewTargetKind: state.lastViewTargetKind,
        lastViewAnchorResyncChanged: state.lastViewAnchorResyncChanged,
        lastViewAnchorResyncYawDeg: Math.round(state.lastViewAnchorResyncYawDeg * 10) / 10,
        lastViewAnchorResyncPitchDeg: Math.round(state.lastViewAnchorResyncPitchDeg * 10) / 10,
        lastViewUpdateAtMs: state.lastViewUpdateAtMs,
        lastAimDot: Number.isFinite(Number(state.lastAimDot)) ? Number(state.lastAimDot) : null,
        lastFireIntent: state.lastFireIntent,
        lastAimGatePassed: typeof state.lastAimGatePassed === 'boolean' ? state.lastAimGatePassed : null,
        lastAimGateReason: state.lastAimGateReason,
        lastFireLosGatePassed: typeof state.lastFireLosGatePassed === 'boolean' ? state.lastFireLosGatePassed : null,
        maxRequestedViewYawDeltaDeg: Math.round(state.maxRequestedViewYawDeltaDeg * 10) / 10,
        maxRequestedViewPitchDeltaDeg: Math.round(state.maxRequestedViewPitchDeltaDeg * 10) / 10,
        maxRemainingViewYawErrorDeg: Math.round(state.maxRemainingViewYawErrorDeg * 10) / 10,
        maxRemainingViewPitchErrorDeg: Math.round(state.maxRemainingViewPitchErrorDeg * 10) / 10,
        maxViewAnchorResyncYawDeg: Math.round(state.maxViewAnchorResyncYawDeg * 10) / 10,
        maxViewAnchorResyncPitchDeg: Math.round(state.maxViewAnchorResyncPitchDeg * 10) / 10,
        largeViewTurnCount: state.largeViewTurnCount,
        maxAimMovementDivergenceDeg: Math.round(state.maxAimMovementDivergenceDeg * 10) / 10,
        aimMovementDivergenceSamples: state.aimMovementDivergenceSamples,
        aimMovementDivergenceOver45Count: state.aimMovementDivergenceOver45Count,
        gradientProbeDeflections: 0,
        waypointsFollowedCount: state.waypointsFollowed,
        waypointReplanFailures: state.waypointReplanFailures,
        lockSwitches: 0,
        firePitchSafetyGates: 0,
        combatState: state.botState,
        botState: state.botState,
        shotsFired: state.shotsFired,
        reloadsIssued: state.reloadsIssued,
        // Combat stats rolled up from PlayerStatsTracker. shotsFired /
        // shotsHit here are the engine-side counts (actual rounds
        // fired / impacts), distinct from the driver-side intent
        // count (`shotsFired` above tracks state.shotsFired which is
        // intent-fire ticks).
        damageDealt: state.damageDealt,
        damageTaken: state.damageTaken,
        kills: state.kills,
        engineShotsFired: state.shotsFiredEngine,
        engineShotsHit: state.shotsHitEngine,
        accuracy: computeAccuracy(state.shotsFiredEngine, state.shotsHitEngine),
        stateHistogramMs: Object.assign({}, state.stateHistogram),
        // Emit a non-numeric sentinel (not null) when match-end has not been
        // latched yet — the capture-side reader does `Number.isFinite(Number(v))`
        // which treats null as 0 and would spuriously latch. Omitting the
        // field via undefined round-trips cleanly through JSON/CDP as absent.
        matchEndedAtMs: typeof state.matchEndedAtMs === 'number' ? state.matchEndedAtMs : undefined,
        matchOutcome: state.matchOutcome,
        objectiveKind: state.lastObjectiveKind,
        objectiveDistance: state.lastObjectiveDistance,
        objectiveZoneId: state.lastObjectiveZoneId,
        nearestOpforDistance: state.nearestOpforDistance,
        nearestPerceivedEnemyDistance: state.nearestPerceivedEnemyDistance,
        currentTargetDistance: state.currentTargetDistance,
        pathTargetKind: state.lastPathTargetKind,
        pathTargetDistance: state.lastPathTargetDistance,
        routeProgressDistance: state.lastRouteProgressDistance,
        routeProgressAgeMs: state.lastRouteProgressAt > 0 ? Math.max(0, Date.now() - state.lastRouteProgressAt) : null,
        routeProgressTravelMeters: state.lastRouteProgressAt > 0
          ? Math.max(0, state.playerDistanceMoved - Number(state.lastRouteProgressMoved || 0))
          : null,
        pathQueryStatus: state.lastPathQueryStatus,
        pathLength: state.lastPathLength,
        pathFailureReason: state.lastPathFailureReason,
        pathQueryDistance: state.lastPathQueryDistance,
        pathStartSnapped: state.lastPathStartSnapped,
        pathEndSnapped: state.lastPathEndSnapped,
        pathStartSnapDistance: state.lastPathStartSnapDistance,
        pathEndSnapDistance: state.lastPathEndSnapDistance,
        maxPathStartSnapDistance: state.maxPathStartSnapDistance,
        maxPathEndSnapDistance: state.maxPathEndSnapDistance,
        untrustedPathSnapCount: state.untrustedPathSnapCount,
        combatApproachRouteCount: state.combatApproachRouteCount,
        routeSnapEpochs: state.routeSnapEpochs.slice(),
        firstObjectiveDistance: state.firstObjectiveDistance,
        minObjectiveDistance: state.minObjectiveDistance,
        objectiveDistanceClosed: Number.isFinite(state.firstObjectiveDistance) && Number.isFinite(state.lastObjectiveDistance)
          ? state.firstObjectiveDistance - state.lastObjectiveDistance
          : null,
        playerDistanceMoved: state.playerDistanceMoved,
        movementIntentCalls: state.movementIntentCalls,
        nonZeroMovementIntentCalls: state.nonZeroMovementIntentCalls,
        worldMovementIntentCalls: state.worldMovementIntentCalls,
        cameraMovementIntentCalls: state.cameraMovementIntentCalls,
        nonZeroWorldMovementIntentCalls: state.nonZeroWorldMovementIntentCalls,
        nonZeroCameraMovementIntentCalls: state.nonZeroCameraMovementIntentCalls,
        lastMovementIntent: state.lastMovementIntent,
        lastNonZeroMovementIntent: state.lastNonZeroMovementIntent,
        runtimeLiveness: runtimeLiveness,
        weaponHarness: getWeaponHarnessSnapshot(systems),
        perceptionRange: botConfig.perceptionRange,
      };
    }

    function getDebugSnapshot() {
      const systems = getSystems();
      return {
        mode: opts.mode,
        driverSeed: opts.driverSeed,
        movementDecisionIntervalMs: decisionIntervalMs,
        botState: state.botState,
        // Alias `botState` under the legacy `movementState` key so older
        // capture artifacts (and perf-capture readers prior to
        // harness-stats-accuracy-damage-wiring) still see a populated
        // movement field. New readers should prefer `botState`.
        movementState: state.botState,
        timeInStateMs: state.timeInStateMs,
        currentTarget: state.currentTarget ? String(state.currentTarget.id) : null,
        firingHeld: state.firingHeld,
        shotsFired: state.shotsFired,
        reloadsIssued: state.reloadsIssued,
        droppedDeadTargetLocks: state.droppedDeadTargetLocks,
        firingRetargets: state.firingRetargets,
        firingRetargetFireStops: state.firingRetargetFireStops,
        firingRetargetEpochs: state.firingRetargetEpochs.slice(),
        losRejectedShots: state.losRejectedShots,
        losUnknownTargetChecks: state.losUnknownTargetChecks,
        fireUnknownLosRejectedShots: state.fireUnknownLosRejectedShots,
        lastTargetLosStatus: state.lastTargetLosStatus,
        lastTargetLosReason: state.lastTargetLosReason,
        lastFireLosStatus: state.lastFireLosStatus,
        lastFireLosReason: state.lastFireLosReason,
        lastCurrentTargetLive: state.lastCurrentTargetLive,
        lastCurrentTargetHealth: state.lastCurrentTargetHealth,
        lastCurrentTargetState: state.lastCurrentTargetState,
        shotEpochs: state.shotEpochs.slice(),
        lastFireProbe: state.lastFireProbe,
        aimDotGateRejectedShots: state.aimDotGateRejectedShots,
        fireStartRejected: state.fireStartRejected,
        pulsedFireStops: state.pulsedFireStops,
        runtimeShotPreviewRejectedShots: state.runtimeShotPreviewRejectedShots,
        runtimeShotPreviewAimSettlingShots: state.runtimeShotPreviewAimSettlingShots,
        runtimeShotPreviewTerrainBlockedShots: state.runtimeShotPreviewTerrainBlockedShots,
        runtimeShotPreviewUnavailableShots: state.runtimeShotPreviewUnavailableShots,
        runtimeShotPreviewMissShots: state.runtimeShotPreviewMissShots,
        runtimeShotPreviewWrongTargetShots: state.runtimeShotPreviewWrongTargetShots,
        lastRuntimeShotPreviewStatus: state.lastRuntimeShotPreviewStatus,
        lastRuntimeShotPreviewReason: state.lastRuntimeShotPreviewReason,
        lastRuntimeShotPreviewHitTargetId: state.lastRuntimeShotPreviewHitTargetId,
        lastRuntimeShotPreviewExpectedInSpatialCandidates: state.lastRuntimeShotPreviewExpectedInSpatialCandidates,
        waypointsFollowedCount: state.waypointsFollowed,
        waypointReplanFailures: state.waypointReplanFailures,
        stuckWaypointSkips: state.stuckWaypointSkips,
        routeTargetResets: state.routeTargetResets,
        routeNoProgressResets: state.routeNoProgressResets,
        waypointCount: state.waypoints ? state.waypoints.length : 0,
        waypointIdx: state.waypointIdx,
        movementTransitions: state.transitions,
        lastStateChangeAt: state.lastStateChangeAt,
        lastShotAt: state.lastShotAt,
        respawnCount: state.respawnCount,
        ammoRefillCount: state.ammoRefillCount,
        healthTopUpCount: state.healthTopUpCount,
        maxStuckSeconds: Math.max(0, Math.round(state.maxStuckMs / 100) / 10),
        maxViewYawStepDeg: Math.round(state.maxViewYawStepDeg * 10) / 10,
        maxViewPitchStepDeg: Math.round(state.maxViewPitchStepDeg * 10) / 10,
        viewSlewClampCount: state.viewSlewClampCount,
        viewAnchorResyncCount: state.viewAnchorResyncCount,
        lastViewStepYawDeg: Math.round(state.lastViewStepYawDeg * 10) / 10,
        lastViewStepPitchDeg: Math.round(state.lastViewStepPitchDeg * 10) / 10,
        lastRequestedViewYawDeltaDeg: Math.round(state.lastRequestedViewYawDeltaDeg * 10) / 10,
        lastRequestedViewPitchDeltaDeg: Math.round(state.lastRequestedViewPitchDeltaDeg * 10) / 10,
        lastRemainingViewYawErrorDeg: Math.round(state.lastRemainingViewYawErrorDeg * 10) / 10,
        lastRemainingViewPitchErrorDeg: Math.round(state.lastRemainingViewPitchErrorDeg * 10) / 10,
        lastViewYawClamped: state.lastViewYawClamped,
        lastViewPitchClamped: state.lastViewPitchClamped,
        lastViewTargetKind: state.lastViewTargetKind,
        lastViewAnchorResyncChanged: state.lastViewAnchorResyncChanged,
        lastViewAnchorResyncYawDeg: Math.round(state.lastViewAnchorResyncYawDeg * 10) / 10,
        lastViewAnchorResyncPitchDeg: Math.round(state.lastViewAnchorResyncPitchDeg * 10) / 10,
        lastViewUpdateAtMs: state.lastViewUpdateAtMs,
        lastAimDot: Number.isFinite(Number(state.lastAimDot)) ? Number(state.lastAimDot) : null,
        lastFireIntent: state.lastFireIntent,
        lastAimGatePassed: typeof state.lastAimGatePassed === 'boolean' ? state.lastAimGatePassed : null,
        lastAimGateReason: state.lastAimGateReason,
        lastFireLosGatePassed: typeof state.lastFireLosGatePassed === 'boolean' ? state.lastFireLosGatePassed : null,
        maxRequestedViewYawDeltaDeg: Math.round(state.maxRequestedViewYawDeltaDeg * 10) / 10,
        maxRequestedViewPitchDeltaDeg: Math.round(state.maxRequestedViewPitchDeltaDeg * 10) / 10,
        maxRemainingViewYawErrorDeg: Math.round(state.maxRemainingViewYawErrorDeg * 10) / 10,
        maxRemainingViewPitchErrorDeg: Math.round(state.maxRemainingViewPitchErrorDeg * 10) / 10,
        maxViewAnchorResyncYawDeg: Math.round(state.maxViewAnchorResyncYawDeg * 10) / 10,
        maxViewAnchorResyncPitchDeg: Math.round(state.maxViewAnchorResyncPitchDeg * 10) / 10,
        largeViewTurnCount: state.largeViewTurnCount,
        maxAimMovementDivergenceDeg: Math.round(state.maxAimMovementDivergenceDeg * 10) / 10,
        aimMovementDivergenceSamples: state.aimMovementDivergenceSamples,
        aimMovementDivergenceOver45Count: state.aimMovementDivergenceOver45Count,
        stateHistogramMs: Object.assign({}, state.stateHistogram),
        // Combat stats rolled up from PlayerStatsTracker.
        damageDealt: state.damageDealt,
        damageTaken: state.damageTaken,
        kills: state.kills,
        accuracy: computeAccuracy(state.shotsFiredEngine, state.shotsHitEngine),
        engineShotsFired: state.shotsFiredEngine,
        engineShotsHit: state.shotsHitEngine,
        objectiveKind: state.lastObjectiveKind,
        objectiveDistance: state.lastObjectiveDistance,
        objectiveZoneId: state.lastObjectiveZoneId,
        nearestOpforDistance: state.nearestOpforDistance,
        nearestPerceivedEnemyDistance: state.nearestPerceivedEnemyDistance,
        currentTargetDistance: state.currentTargetDistance,
        pathTargetKind: state.lastPathTargetKind,
        pathTargetDistance: state.lastPathTargetDistance,
        routeProgressDistance: state.lastRouteProgressDistance,
        routeProgressAgeMs: state.lastRouteProgressAt > 0 ? Math.max(0, Date.now() - state.lastRouteProgressAt) : null,
        routeProgressTravelMeters: state.lastRouteProgressAt > 0
          ? Math.max(0, state.playerDistanceMoved - Number(state.lastRouteProgressMoved || 0))
          : null,
        pathQueryStatus: state.lastPathQueryStatus,
        pathLength: state.lastPathLength,
        pathFailureReason: state.lastPathFailureReason,
        pathQueryDistance: state.lastPathQueryDistance,
        pathStartSnapped: state.lastPathStartSnapped,
        pathEndSnapped: state.lastPathEndSnapped,
        pathStartSnapDistance: state.lastPathStartSnapDistance,
        pathEndSnapDistance: state.lastPathEndSnapDistance,
        maxPathStartSnapDistance: state.maxPathStartSnapDistance,
        maxPathEndSnapDistance: state.maxPathEndSnapDistance,
        untrustedPathSnapCount: state.untrustedPathSnapCount,
        combatApproachRouteCount: state.combatApproachRouteCount,
        routeSnapEpochs: state.routeSnapEpochs.slice(),
        firstObjectiveDistance: state.firstObjectiveDistance,
        minObjectiveDistance: state.minObjectiveDistance,
        objectiveDistanceClosed: Number.isFinite(state.firstObjectiveDistance) && Number.isFinite(state.lastObjectiveDistance)
          ? state.firstObjectiveDistance - state.lastObjectiveDistance
          : null,
        playerDistanceMoved: state.playerDistanceMoved,
        movementIntentCalls: state.movementIntentCalls,
        nonZeroMovementIntentCalls: state.nonZeroMovementIntentCalls,
        worldMovementIntentCalls: state.worldMovementIntentCalls,
        cameraMovementIntentCalls: state.cameraMovementIntentCalls,
        nonZeroWorldMovementIntentCalls: state.nonZeroWorldMovementIntentCalls,
        nonZeroCameraMovementIntentCalls: state.nonZeroCameraMovementIntentCalls,
        lastMovementIntent: state.lastMovementIntent,
        lastNonZeroMovementIntent: state.lastNonZeroMovementIntent,
        runtimeLiveness: getRuntimeLiveness(systems),
        weaponHarness: getWeaponHarnessSnapshot(systems),
        perceptionRange: botConfig.perceptionRange,
        pathTrustTtlMs: PATH_TRUST_TTL_MS,
        maxGradient: PLAYER_MAX_CLIMB_GRADIENT,
        // See stop() — omit when unset so Number(null)=0 doesn't trip the
        // capture-side isFinite latch. Surfaced as a numeric timestamp when the
        // harness has actually observed match-end.
        matchEndedAtMs: typeof state.matchEndedAtMs === 'number' ? state.matchEndedAtMs : undefined,
        matchOutcome: state.matchOutcome,
      };
    }

    function getCountersSnapshot() {
      return {
        shotsFired: state.shotsFired,
        reloadsIssued: state.reloadsIssued,
        damageDealt: state.damageDealt,
        damageTaken: state.damageTaken,
        kills: state.kills,
        accuracy: computeAccuracy(state.shotsFiredEngine, state.shotsHitEngine),
        engineShotsFired: state.shotsFiredEngine,
        engineShotsHit: state.shotsHitEngine,
        botState: state.botState,
        movementState: state.botState,
        matchEndedAtMs: typeof state.matchEndedAtMs === 'number' ? state.matchEndedAtMs : undefined,
        matchOutcome: state.matchOutcome,
      };
    }

    start();
    return {
      stop: stop,
      getDebugSnapshot: getDebugSnapshot,
      getCountersSnapshot: getCountersSnapshot,
      movementPatternCount: 5, // PATROL/ALERT/ENGAGE/ADVANCE/RESPAWN_WAIT — informative only
      compressFrontline: enableFrontlineCompression,
      mode: opts.mode,
      driverSeed: opts.driverSeed,
      movementDecisionIntervalMs: decisionIntervalMs,
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
          driverSeed: driver.driverSeed,
          movementDecisionIntervalMs: driver.movementDecisionIntervalMs,
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
      getCountersSnapshot: function () {
        if (!globalWindow.__perfHarnessDriverState) return null;
        if (globalWindow.__perfHarnessDriverState.getCountersSnapshot) {
          return globalWindow.__perfHarnessDriverState.getCountersSnapshot();
        }
        if (globalWindow.__perfHarnessDriverState.getDebugSnapshot) {
          const state = globalWindow.__perfHarnessDriverState.getDebugSnapshot();
          if (!state || typeof state !== 'object') return null;
          return {
            shotsFired: Number(state.shotsFired ?? 0),
            reloadsIssued: Number(state.reloadsIssued ?? 0),
            damageDealt: Number(state.damageDealt ?? 0),
            damageTaken: Number(state.damageTaken ?? 0),
            kills: Number(state.kills ?? 0),
            accuracy: Number(state.accuracy ?? 0),
            engineShotsFired: Number(state.engineShotsFired ?? 0),
            engineShotsHit: Number(state.engineShotsHit ?? 0),
            botState: state.botState,
            movementState: state.movementState,
            matchEndedAtMs: state.matchEndedAtMs,
            matchOutcome: state.matchOutcome,
          };
        }
        return null;
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
      shouldAdvanceWaypoint: shouldAdvanceWaypoint,
      isSteepClimbWaypoint: isSteepClimbWaypoint,
      shouldFastReplan: shouldFastReplan,
      detectPitTrap: detectPitTrap,
      evaluateFireGate: evaluateFireGate,
      appendBoundedEvent: appendBoundedEvent,
      sanitizePresentationContext: sanitizePresentationContext,
      addTopCollisionContributor: addTopCollisionContributor,
      shouldRecordRouteSnapEpoch: shouldRecordRouteSnapEpoch,
      queryTerrainLineOfSight: queryTerrainLineOfSight,
      hasClearTerrainLineOfSight: hasClearTerrainLineOfSight,
      computeRayAimMetrics: computeRayAimMetrics,
      angularDistance: angularDistance,
      signedYawDelta: signedYawDelta,
      clampDriverPitch: clampDriverPitch,
      applyViewSlewLimit: applyViewSlewLimit,
      syncViewAnchorToActual: syncViewAnchorToActual,
      DRIVER_VIEW_MAX_YAW_STEP_RAD: DRIVER_VIEW_MAX_YAW_STEP_RAD,
      DRIVER_VIEW_MAX_PITCH_STEP_RAD: DRIVER_VIEW_MAX_PITCH_STEP_RAD,
      PLAYER_EYE_HEIGHT: PLAYER_EYE_HEIGHT,
      TARGET_CHEST_HEIGHT: TARGET_CHEST_HEIGHT,
      TARGET_ACTOR_AIM_Y_OFFSET: TARGET_ACTOR_AIM_Y_OFFSET,
      TARGET_LOS_HEIGHT: TARGET_LOS_HEIGHT,
      targetActorAimYOffset: targetActorAimYOffset,
      targetChestProxyRadius: targetChestProxyRadius,
      DEFAULT_BULLET_SPEED: DEFAULT_BULLET_SPEED,
      PLAYER_CLIMB_SLOPE_DOT: PLAYER_CLIMB_SLOPE_DOT,
      PLAYER_MAX_CLIMB_ANGLE_RAD: PLAYER_MAX_CLIMB_ANGLE_RAD,
      PLAYER_MAX_CLIMB_GRADIENT: PLAYER_MAX_CLIMB_GRADIENT,
      PATH_TRUST_TTL_MS: PATH_TRUST_TTL_MS,
      AIM_PITCH_LIMIT_RAD: AIM_PITCH_LIMIT_RAD,
      NAVMESH_START_SNAP_RADIUS: NAVMESH_START_SNAP_RADIUS,
      NAVMESH_TARGET_SNAP_RADIUS: NAVMESH_TARGET_SNAP_RADIUS,
      NAVMESH_TRUSTED_ROUTE_SNAP_DISTANCE: NAVMESH_TRUSTED_ROUTE_SNAP_DISTANCE,
      isPathTrusted: isPathTrusted,
      clampAimYByPitch: clampAimYByPitch,
      // Bot primitives.
      stepBotState: stepBotState,
      createIdleBotIntent: createIdleBotIntent,
      selectDriverViewTarget: selectDriverViewTarget,
      computeWorldMovementIntent: computeWorldMovementIntent,
      computeCameraRelativeMovementIntent: computeCameraRelativeMovementIntent,
      computeAimMovementDivergence: function (intent, overlayPoint, playerPos) {
        return computeViewMovementDivergence(intent && intent.aimTarget, intent, overlayPoint, playerPos);
      },
      computeViewMovementDivergence: computeViewMovementDivergence,
      isRouteOverlayMicroTarget: isRouteOverlayMicroTarget,
      isRoutePathExhausted: isRoutePathExhausted,
      computeRouteContinuationPoint: computeRouteContinuationPoint,
      computeAnchorContinuationPoint: computeAnchorContinuationPoint,
      applyRouteOverlayRecovery: applyRouteOverlayRecovery,
      shouldTrackHarnessStuckProgress: shouldTrackHarnessStuckProgress,
      shouldSkipStuckWaypoint: shouldSkipStuckWaypoint,
      hasRouteTargetMoved: hasRouteTargetMoved,
      shouldResetRouteForNoProgress: shouldResetRouteForNoProgress,
      isTargetTemporarilyBlocked: isTargetTemporarilyBlocked,
      markTargetTemporarilyBlocked: markTargetTemporarilyBlocked,
      addNearestVisibleCheckCandidate: addNearestVisibleCheckCandidate,
      selectVisiblePreferredEnemyCandidate: selectVisiblePreferredEnemyCandidate,
      shouldUseTargetForCurrentObjective: shouldUseTargetForCurrentObjective,
      shouldUseRouteOverlayForIntent: shouldUseRouteOverlayForIntent,
      shouldUseDirectCombatRouteFallback: shouldUseDirectCombatRouteFallback,
      shouldUseDirectCombatRouteBypass: shouldUseDirectCombatRouteBypass,
      shouldUseTerrainDirectObjectiveRoute: shouldUseTerrainDirectObjectiveRoute,
      shouldUseTerrainDirectCombatApproachRoute: shouldUseTerrainDirectCombatApproachRoute,
      shouldCooldownCombatTargetAfterRouteFailure: shouldCooldownCombatTargetAfterRouteFailure,
      shouldCooldownCombatTargetAfterNoProgress: shouldCooldownCombatTargetAfterNoProgress,
      routeFailureCooldownTargetId: routeFailureCooldownTargetId,
      shouldRequireTrustedCombatApproachRoute: shouldRequireTrustedCombatApproachRoute,
      shouldCooldownObjectiveAfterRouteFailure: shouldCooldownObjectiveAfterRouteFailure,
      createDirectCombatFallbackPath: createDirectCombatFallbackPath,
      computeCombatApproachCandidates: computeCombatApproachCandidates,
      isRouteSnapTrusted: isRouteSnapTrusted,
      shouldReloadMagazine: shouldReloadMagazine,
      shouldIssueFireStart: shouldIssueFireStart,
      shouldPulseHarnessFire: shouldPulseHarnessFire,
      shouldReleaseFireForRetarget: shouldReleaseFireForRetarget,
      classifyRuntimeShotPreview: classifyRuntimeShotPreview,
      engageStrafeIntent: engageStrafeIntent,
      selectLockedTarget: selectLockedTarget,
      profileForMode: profileForMode,
      botConfigForProfile: botConfigForProfile,
      resolveDriverDecisionIntervalMs: resolveDriverDecisionIntervalMs,
      combatObjectiveMaxDistanceForProfile: combatObjectiveMaxDistanceForProfile,
      supportsFrontlineCompression: supportsFrontlineCompression,
      usesPlayerAnchoredFrontlineCompression: usesPlayerAnchoredFrontlineCompression,
      setPerfDriverHudActive: setPerfDriverHudActive,
      normalizeDriverSeed: normalizeDriverSeed,
      createSeededRandom: createSeededRandom,
      placeCompressedCombatantForHarness: placeCompressedCombatantForHarness,
      // Match-end lifecycle (harness-lifecycle-halt-on-match-end).
      detectMatchEnded: detectMatchEnded,
      detectMatchOutcome: detectMatchOutcome,
      shouldFinalizeAfterMatchEnd: shouldFinalizeAfterMatchEnd,
      MATCH_END_TAIL_MS: MATCH_END_TAIL_MS,
      // Combat stat helpers.
      deltaSinceBaseline: deltaSinceBaseline,
      rebasedTotal: rebasedTotal,
      damageTakenDelta: damageTakenDelta,
      computeAccuracy: computeAccuracy,
      // Objective selector (harness-ashau-objective-cycling-fix).
      pickObjectiveZone: pickObjectiveZone,
      selectPatrolObjective: selectPatrolObjective,
      objectiveTelemetryKey: objectiveTelemetryKey,
      objectiveBlockKey: objectiveBlockKey,
      routeTargetIdentityKey: routeTargetIdentityKey,
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
