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

  // Actor-height mirrors. PlayerController.getPosition() and combatant.position
  // are already eye-level actor anchors, matching PlayerMovement.PLAYER_EYE_HEIGHT
  // and CombatantConfig.NPC_Y_OFFSET. Only ground/objective points need a
  // positive look height; combatant targets need a center-mass offset below
  // their actor anchor.
  const PLAYER_EYE_HEIGHT = 2.2;
  // Mirrors the visual chest proxy center:
  // NPC_PIXEL_FORGE_VISUAL_HEIGHT(2.95) * HIT_PROXY_HEIGHT_MULTIPLIER(1.16)
  // * average chest ratio(0.59) - NPC_Y_OFFSET(2.2).
  const TARGET_ACTOR_AIM_Y_OFFSET = -0.18;
  const TARGET_CHEST_HEIGHT = PLAYER_EYE_HEIGHT + TARGET_ACTOR_AIM_Y_OFFSET;
  const TARGET_LOS_HEIGHT = TARGET_CHEST_HEIGHT;
  const DEFAULT_BULLET_SPEED = 400;

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
  const NAVMESH_START_SNAP_RADIUS = 80;
  const NAVMESH_TARGET_SNAP_RADIUS = 80;

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

  function angularDistance(yaw1, pitch1, yaw2, pitch2) {
    let dy = Number(yaw2) - Number(yaw1);
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const dp = Number(pitch2) - Number(pitch1);
    return Math.hypot(dy, dp);
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
      (!Number.isFinite(maxCombatDistance) || !Number.isFinite(combatDistance) || combatDistance <= maxCombatDistance);

    if (aggressive && combatInDetourRange) return combatObjective;
    if (zoneObjective) return zoneObjective;
    if (combatObjective) return combatObjective;
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

  function applyRouteOverlayRecovery(intent, overlayPoint, stuckMs) {
    if (!intent || !overlayPoint || intent.firePrimary) return intent;
    const wantsMove = Math.abs(Number(intent.moveForward || 0)) > 0.1
      || Math.abs(Number(intent.moveStrafe || 0)) > 0.1;
    if (!wantsMove) return intent;

    // Route-following on real terrain is more reliable at infantry walk speed:
    // sprinting into a navmesh corner can make PlayerMovement reject every
    // step as a terrain lip before the route can bend around it.
    intent.sprint = false;

    const stuck = Number(stuckMs || 0);
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
    if (objectiveKind === 'nearest_opfor') return true;

    const acquisitionDistance = Math.max(0, Number(opts && opts.acquisitionDistance || 0));
    const maxFireDistance = Math.max(acquisitionDistance, Number(opts && opts.maxFireDistance || acquisitionDistance));
    const botState = String(opts && opts.botState || 'PATROL');
    const current = opts && opts.currentTarget;
    const sameLockedTarget = current && target && String(current.id || '') === String(target.id || '');
    const canSeeTarget = opts && typeof opts.canSeeTarget === 'function'
      ? !!opts.canSeeTarget(target.position)
      : false;

    if (targetDistance <= acquisitionDistance && canSeeTarget) return true;
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

    // If the bot is already firing, LOS is established by the state machine.
    // Route overlay points are still useful around occlusion, but during
    // visible fire-and-close behavior they can make the driver step around a
    // local nav corner instead of simply pushing toward the target.
    if (botState === 'ENGAGE' && intent.firePrimary && opts && opts.currentTarget) {
      return false;
    }

    return botState === 'ADVANCE' || botState === 'PATROL' || botState === 'ALERT' || botState === 'ENGAGE';
  }

  function shouldUseDirectCombatRouteFallback(opts) {
    const targetKind = String(opts && opts.targetKind || '');
    if (targetKind !== 'current_target' && targetKind !== 'nearest_opfor') return false;
    const failureReason = String(opts && opts.failureReason || '');
    if (failureReason !== 'end_snap_failed' && failureReason !== 'start_snap_failed') return false;
    const targetDistance = Number(opts && opts.targetDistance);
    if (!Number.isFinite(targetDistance) || targetDistance <= 0) return false;
    const maxDistance = Number(opts && opts.maxDistance);
    if (!Number.isFinite(maxDistance) || maxDistance <= 0) return false;
    return targetDistance <= maxDistance;
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

  const OCCLUDED_TARGET_HOLD_DISTANCE = 6;
  function pushInDistanceForVisibility(config, visible) {
    const push = Math.max(0, Number(config && config.pushInDistance || 0));
    if (visible) return push;
    return Math.min(push, OCCLUDED_TARGET_HOLD_DISTANCE);
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
      y: Number(anchor.y || 0) + TARGET_ACTOR_AIM_Y_OFFSET,
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

  function updatePatrolBot(ctx) {
    const intent = createIdleBotIntent();
    intent.aimLerpRate = ctx.config.aimLerpRate;
    const objective = ctx.getObjective();
    const enemy = ctx.findNearestEnemy();
    if (enemy) {
      const dist = botHorizontalDistance(ctx.eyePos, enemy.position);
      const acquisitionDistance = Math.max(0, Number(ctx.config.targetAcquisitionDistance || ctx.config.maxFireDistance || 0));
      const interruptsObjective = !objective || (dist <= acquisitionDistance && ctx.canSeeTarget(enemy.position));
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
    if (ctx.magazine.current <= 0) {
      intent.reload = true;
    } else {
      intent.firePrimary = true;
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

  function selectLockedTarget(current, fresh, now, staleMs) {
    const ttlMs = Number.isFinite(Number(staleMs)) ? Number(staleMs) : 4000;
    if (!current) return fresh || null;
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
      aimLerpRate: 1,
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

  function combatObjectiveMaxDistanceForProfile(profile) {
    if (!profile) return 0;
    const acquisition = Number(profile.targetAcquisitionDistance);
    const base = Number.isFinite(acquisition) && acquisition > 0 ? acquisition : 0;
    if (!profile.aggressiveMode) return base;
    const fireRange = Number(profile.maxFireDistance);
    const perception = Number(profile.perceptionRange);
    const pursuitRange = Number.isFinite(fireRange) && fireRange > 0 ? fireRange * 3 : base;
    const cappedPursuit = Number.isFinite(perception) && perception > 0
      ? Math.min(perception, pursuitRange)
      : pursuitRange;
    return Math.max(base, cappedPursuit);
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
    };
    const profile = profileForMode(opts.mode);
    const botConfig = botConfigForProfile(profile);
    const enableFrontlineCompression = opts.compressFrontline && supportsFrontlineCompression(opts.mode);

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
      firstObjectiveDistance: null,
      minObjectiveDistance: null,
      playerDistanceMoved: 0,
      lastMovementSamplePos: null,
      movementIntentCalls: 0,
      nonZeroMovementIntentCalls: 0,
      lastMovementIntent: null,
      lastNonZeroMovementIntent: null,
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
      aimDotGateRejectedShots: 0,
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
      const bestZone = pickObjectiveZone({
        zones: zones,
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
      return {
        kind: 'zone',
        position: {
          x: Number(bestZone.position.x),
          y: Number(bestZone.position.y || 0),
          z: Number(bestZone.position.z),
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
      const pr = botConfig.perceptionRange;
      const prSq = pr * pr;
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
        if (distSq > prSq) continue;
        if (distSq < bestDistSq) { bestDistSq = distSq; best = c; }
      }
      if (!best) return null;
      const distance = Math.sqrt(bestDistSq);
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
        lastKnownMs: Date.now(),
      };
    }

    // `canSeeTarget` — consumes `terrainSystem.raycastTerrain` (the same primitive
    // AILineOfSight uses internally), so the bot cannot acquire a target through
    // a hill. Player/combatant positions are already eye-level actor anchors;
    // raycast from player eye to target center mass.
    function canSeeTarget(systems, playerPos, targetPos) {
      const terrain = systems && systems.terrainSystem;
      if (!terrain || typeof terrain.raycastTerrain !== 'function') return true;
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
      try {
        // Snap both endpoints onto the mesh before querying. This is the
        // Round 3 fix: on open_frontier the player regularly stands just
        // off-mesh and queryPath returns null. The harness player can drift
        // farther from the generated navmesh than NPC recovery allows while it
        // pushes across large Open Frontier slopes, and live OPFOR targets can
        // stand outside the walkable mesh too. Snap both sides to nearby
        // walkable points so the harness routes toward the combat front instead
        // of failing the whole long-map approach.
        const start = snapOntoNavmeshDetailed(systems, fromPos, NAVMESH_START_SNAP_RADIUS);
        const end = snapOntoNavmeshDetailed(systems, toPos, NAVMESH_TARGET_SNAP_RADIUS);
        state.lastPathStartSnapped = start.snapped;
        state.lastPathEndSnapped = end.snapped;
        state.lastPathStartSnapDistance = start.distance;
        state.lastPathEndSnapDistance = end.distance;
        const path = nav.queryPath(start.point, end.point);
        if (!path || path.length === 0) {
          state.lastPathFailureReason = !start.found
            ? 'start_snap_failed'
            : !end.found
              ? 'end_snap_failed'
              : 'compute_path_failed';
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
          return null;
        }
        return out;
      } catch (_err) {
        state.lastPathFailureReason = 'query_exception';
        return null;
      }
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

    function getRuntimeLiveness(systems) {
      const w = globalWindow;
      const pc = systems && systems.playerController;
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
          out.push({
            id: String(id),
            dynamic: !!entry.dynamic,
            minX: Number(box.min.x),
            maxX: Number(box.max.x),
            minY: Number(box.min.y),
            maxY: Number(box.max.y),
            minZ: Number(box.min.z),
            maxZ: Number(box.max.z),
          });
        });
      } catch (_err) {
        return out;
      }
      out.sort((a, b) => Number(b.maxY || 0) - Number(a.maxY || 0));
      return out.slice(0, 5);
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
            const lane = (Math.random() - 0.5) * (side > 0 ? 170 : 130);
            const forward = side > 0
              ? 160 + Math.random() * 130
              : -(65 + Math.random() * 85);
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
          const lane = (Math.random() - 0.5) * 130;
          const forward = side * (35 + Math.random() * 25);
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

    function updateWaypoints(systems, playerPos, target, targetKind) {
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
      const targetKey = targetKind ? String(targetKind) : 'unknown';
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
          if (state.lastPathTargetKind === 'current_target') {
            markTargetTemporarilyBlocked(
              state.blockedTargetUntil,
              state.currentTarget && state.currentTarget.id,
              now,
              ROUTE_NO_PROGRESS_TARGET_COOLDOWN_MS,
            );
            state.currentTarget = null;
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
        const path = queryPath(systems, playerPos, target);
        state.lastWaypointReplanAt = now;
        if (path && path.length > 0) {
          state.waypoints = path;
          state.waypointIdx = 0;
          state.lastPathQueryStatus = 'ok';
          state.lastPathLength = path.length;
          state.lastPathFailureReason = null;
        } else if (shouldUseDirectCombatRouteFallback({
          targetKind: targetKey,
          failureReason: state.lastPathFailureReason,
          targetDistance: targetDistance,
          maxDistance: combatObjectiveMaxDistanceForProfile(profile),
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
      const candidateTarget = updateLockedTarget(state.currentTarget, freshTarget, now);
      state.currentTarget = shouldUseTargetForCurrentObjective({
        target: candidateTarget,
        currentTarget: state.currentTarget,
        objective: objectiveForTargetGate,
        playerPos: playerPos,
        botState: state.botState,
        acquisitionDistance: botConfig.targetAcquisitionDistance,
        maxFireDistance: botConfig.maxFireDistance,
        canSeeTarget: losClosure,
      }) ? candidateTarget : null;
      state.currentTargetDistance = state.currentTarget && state.currentTarget.position
        ? botHorizontalDistance(playerPos, state.currentTarget.position)
        : null;

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
      })) {
        const patrolObjective = state.currentTarget ? null : objectiveClosure();
        const anchorKind = state.currentTarget ? 'current_target'
          : (patrolObjective && patrolObjective.kind ? patrolObjective.kind : null);
        const anchor = state.currentTarget ? state.currentTarget.position
          : (patrolObjective ? patrolObjective.position : null);
        if (anchor) {
          updateWaypoints(systems, playerPos, anchor, anchorKind);
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
      applyIntent(systems, step.intent, angles, overlayPoint, playerPos);

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

    function updateLockedTarget(current, fresh, now) {
      return selectLockedTarget(current, fresh, now, 4000);
    }

    function applyIntent(systems, intent, currentAngles, overlayPoint, playerPos) {
      const pc = systems && systems.playerController;
      if (!pc) return;

      // Movement intent.
      const forward = clampAxis(intent.moveForward);
      const strafe = clampAxis(intent.moveStrafe);
      const sprint = !!intent.sprint && forward > 0.1;
      const wantsMovement = Math.abs(forward) > 0.01 || Math.abs(strafe) > 0.01;
      const worldMovement = computeWorldMovementIntent(intent, overlayPoint, playerPos);
      if (typeof pc.applyMovementIntent === 'function') {
        if (worldMovement && typeof pc.applyWorldMovementIntent === 'function') {
          pc.applyWorldMovementIntent({ x: worldMovement.x, z: worldMovement.z, sprint });
        } else {
          pc.applyMovementIntent({ forward, strafe, sprint });
        }
        const movementIntent = {
          forward,
          strafe,
          sprint,
          wantsMovement,
          movementMode: worldMovement && typeof pc.applyWorldMovementIntent === 'function' ? 'world' : 'camera',
          worldX: worldMovement && typeof pc.applyWorldMovementIntent === 'function' ? worldMovement.x : null,
          worldZ: worldMovement && typeof pc.applyWorldMovementIntent === 'function' ? worldMovement.z : null,
          worldDistance: worldMovement && typeof pc.applyWorldMovementIntent === 'function' ? worldMovement.distance : null,
          atMs: Date.now(),
        };
        state.movementIntentCalls++;
        state.lastMovementIntent = movementIntent;
        if (wantsMovement) {
          state.nonZeroMovementIntentCalls++;
          state.lastNonZeroMovementIntent = movementIntent;
        }
      }

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

      let yawNext = state.lastYaw;
      let pitchNext = state.lastPitch;
      let aimDot = null; // aim-dot against intent.aimTarget, for the fire gate
      const viewTarget = selectDriverViewTarget(intent, overlayPoint, wantsMovement);
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

        yawNext = lerpAngle(state.lastYaw, targetYaw, intent.aimLerpRate);
        pitchNext = clampPitch(state.lastPitch + (clampPitch(targetPitch) - state.lastPitch) * clamp01(intent.aimLerpRate));
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
          }
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
        if (state.firingHeld) {
          if (typeof pc.fireStop === 'function') pc.fireStop();
          state.firingHeld = false;
        }
        if (typeof pc.reloadWeapon === 'function') pc.reloadWeapon();
      } else if (intent.firePrimary) {
        let passesAimGate = true;
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
          });
          passesAimGate = !!decision.shouldFire;
          if (!passesAimGate) state.aimDotGateRejectedShots++;
        }
        if (passesAimGate) {
          if (!state.firingHeld) {
            if (typeof pc.fireStart === 'function') pc.fireStart();
            state.firingHeld = true;
            state.lastShotAt = Date.now();
          }
        } else if (state.firingHeld) {
          if (typeof pc.fireStop === 'function') pc.fireStop();
          state.firingHeld = false;
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
      state.heartbeatTimer = setInterval(tick, profile.decisionIntervalMs);
      tick();
    }

    function stop() {
      if (state.heartbeatTimer) { clearInterval(state.heartbeatTimer); state.heartbeatTimer = null; }
      const systems = getSystems();
      const runtimeLiveness = getRuntimeLiveness(systems);
      // One last roll-up before we tear down so the stop-stats reflect
      // any damage / kills landed in the final tick window.
      pollEngineCombatStats(systems);
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
        aimDotGateRejectedShots: state.aimDotGateRejectedShots,
        stuckTeleportCount: state.stuckTeleportCount,
        stuckWaypointSkips: state.stuckWaypointSkips,
        routeTargetResets: state.routeTargetResets,
        routeNoProgressResets: state.routeNoProgressResets,
        maxStuckSeconds: Math.max(0, Math.round(state.maxStuckMs / 100) / 10),
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
        firstObjectiveDistance: state.firstObjectiveDistance,
        minObjectiveDistance: state.minObjectiveDistance,
        objectiveDistanceClosed: Number.isFinite(state.firstObjectiveDistance) && Number.isFinite(state.lastObjectiveDistance)
          ? state.firstObjectiveDistance - state.lastObjectiveDistance
          : null,
        playerDistanceMoved: state.playerDistanceMoved,
        movementIntentCalls: state.movementIntentCalls,
        nonZeroMovementIntentCalls: state.nonZeroMovementIntentCalls,
        lastMovementIntent: state.lastMovementIntent,
        lastNonZeroMovementIntent: state.lastNonZeroMovementIntent,
        runtimeLiveness: runtimeLiveness,
        perceptionRange: botConfig.perceptionRange,
      };
    }

    function getDebugSnapshot() {
      const systems = getSystems();
      return {
        mode: opts.mode,
        botState: state.botState,
        // Alias `botState` under the legacy `movementState` key so older
        // capture artifacts (and perf-capture readers prior to
        // harness-stats-accuracy-damage-wiring) still see a populated
        // movement field. New readers should prefer `botState`.
        movementState: state.botState,
        timeInStateMs: state.timeInStateMs,
        currentTarget: state.currentTarget ? String(state.currentTarget.id) : null,
        shotsFired: state.shotsFired,
        reloadsIssued: state.reloadsIssued,
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
        firstObjectiveDistance: state.firstObjectiveDistance,
        minObjectiveDistance: state.minObjectiveDistance,
        objectiveDistanceClosed: Number.isFinite(state.firstObjectiveDistance) && Number.isFinite(state.lastObjectiveDistance)
          ? state.firstObjectiveDistance - state.lastObjectiveDistance
          : null,
        playerDistanceMoved: state.playerDistanceMoved,
        movementIntentCalls: state.movementIntentCalls,
        nonZeroMovementIntentCalls: state.nonZeroMovementIntentCalls,
        lastMovementIntent: state.lastMovementIntent,
        lastNonZeroMovementIntent: state.lastNonZeroMovementIntent,
        runtimeLiveness: getRuntimeLiveness(systems),
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

    start();
    return {
      stop: stop,
      getDebugSnapshot: getDebugSnapshot,
      movementPatternCount: 5, // PATROL/ALERT/ENGAGE/ADVANCE/RESPAWN_WAIT — informative only
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
      shouldAdvanceWaypoint: shouldAdvanceWaypoint,
      isSteepClimbWaypoint: isSteepClimbWaypoint,
      shouldFastReplan: shouldFastReplan,
      detectPitTrap: detectPitTrap,
      evaluateFireGate: evaluateFireGate,
      angularDistance: angularDistance,
      PLAYER_EYE_HEIGHT: PLAYER_EYE_HEIGHT,
      TARGET_CHEST_HEIGHT: TARGET_CHEST_HEIGHT,
      TARGET_ACTOR_AIM_Y_OFFSET: TARGET_ACTOR_AIM_Y_OFFSET,
      TARGET_LOS_HEIGHT: TARGET_LOS_HEIGHT,
      DEFAULT_BULLET_SPEED: DEFAULT_BULLET_SPEED,
      PLAYER_CLIMB_SLOPE_DOT: PLAYER_CLIMB_SLOPE_DOT,
      PLAYER_MAX_CLIMB_ANGLE_RAD: PLAYER_MAX_CLIMB_ANGLE_RAD,
      PLAYER_MAX_CLIMB_GRADIENT: PLAYER_MAX_CLIMB_GRADIENT,
      PATH_TRUST_TTL_MS: PATH_TRUST_TTL_MS,
      AIM_PITCH_LIMIT_RAD: AIM_PITCH_LIMIT_RAD,
      NAVMESH_START_SNAP_RADIUS: NAVMESH_START_SNAP_RADIUS,
      NAVMESH_TARGET_SNAP_RADIUS: NAVMESH_TARGET_SNAP_RADIUS,
      isPathTrusted: isPathTrusted,
      clampAimYByPitch: clampAimYByPitch,
      // Bot primitives.
      stepBotState: stepBotState,
      createIdleBotIntent: createIdleBotIntent,
      selectDriverViewTarget: selectDriverViewTarget,
      computeWorldMovementIntent: computeWorldMovementIntent,
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
      shouldUseTargetForCurrentObjective: shouldUseTargetForCurrentObjective,
      shouldUseRouteOverlayForIntent: shouldUseRouteOverlayForIntent,
      shouldUseDirectCombatRouteFallback: shouldUseDirectCombatRouteFallback,
      createDirectCombatFallbackPath: createDirectCombatFallbackPath,
      engageStrafeIntent: engageStrafeIntent,
      selectLockedTarget: selectLockedTarget,
      profileForMode: profileForMode,
      botConfigForProfile: botConfigForProfile,
      combatObjectiveMaxDistanceForProfile: combatObjectiveMaxDistanceForProfile,
      supportsFrontlineCompression: supportsFrontlineCompression,
      usesPlayerAnchoredFrontlineCompression: usesPlayerAnchoredFrontlineCompression,
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
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
