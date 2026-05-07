// @ts-nocheck
// A4-class regression guard for the perf-active harness driver.
//
// The brief (docs/tasks/perf-harness-redesign.md) requires a behavior test that
// proves: when the camera is pointed at the OPPOSITE direction from the nearest
// opfor (the sign-flipped target-delta case), the driver must NOT invoke
// actionFireStart. The live driver routes this decision through
// evaluateFireDecision(); we exercise that helper directly here.
//
// The driver script is a dual-mode IIFE that exports its pure helpers via
// module.exports when loaded under Node. Browser callers never see that
// branch — see the tail of scripts/perf-active-driver.js.

// vitest's globals (describe/it/expect) are enabled in vitest.config.ts
// via `test.globals = true`. We pull the helpers through a CommonJS require()
// since the driver is a plain .js script with module.exports at its tail.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const driver = require('../perf-active-driver.cjs');
const {
  evaluateFireDecision,
  chooseHeadingByGradient,
  computeUtilityScore,
  shouldSwitchTarget,
  computeAimSolution,
  computeAdaptiveLookahead,
  pointAlongPath,
  evaluateFireGate,
  PLAYER_EYE_HEIGHT,
  TARGET_CHEST_HEIGHT,
  TARGET_ACTOR_AIM_Y_OFFSET,
  DEFAULT_BULLET_SPEED,
  PLAYER_CLIMB_SLOPE_DOT,
  PLAYER_MAX_CLIMB_ANGLE_RAD,
  PLAYER_MAX_CLIMB_GRADIENT,
  PATH_TRUST_TTL_MS,
  AIM_PITCH_LIMIT_RAD,
  isPathTrusted,
  clampAimYByPitch,
  // perf-harness-player-bot exports — JS mirror of src/dev/harness/playerBot/*.ts.
  stepBotState,
  createIdleBotIntent,
  selectDriverViewTarget,
  computeWorldMovementIntent,
  isRouteOverlayMicroTarget,
  isRoutePathExhausted,
  computeRouteContinuationPoint,
  computeAnchorContinuationPoint,
  applyRouteOverlayRecovery,
  shouldTrackHarnessStuckProgress,
  hasRouteTargetMoved,
  shouldResetRouteForNoProgress,
  isTargetTemporarilyBlocked,
  markTargetTemporarilyBlocked,
  shouldUseTargetForCurrentObjective,
  shouldUseRouteOverlayForIntent,
  shouldUseDirectCombatRouteFallback,
  createDirectCombatFallbackPath,
  selectLockedTarget,
  profileForMode,
  botConfigForProfile,
  combatObjectiveMaxDistanceForProfile,
  supportsFrontlineCompression,
  usesPlayerAnchoredFrontlineCompression,
  placeCompressedCombatantForHarness,
  // bot-pathing-pit-and-steep-uphill exports — waypoint/replan/pit heuristics.
  shouldAdvanceWaypoint,
  isSteepClimbWaypoint,
  shouldFastReplan,
  detectPitTrap,
  shouldSkipStuckWaypoint,
  // harness-lifecycle-halt-on-match-end exports.
  detectMatchEnded,
  detectMatchOutcome,
  shouldFinalizeAfterMatchEnd,
  MATCH_END_TAIL_MS,
  // harness-stats-accuracy-damage-wiring: combat stat helpers.
  deltaSinceBaseline,
  rebasedTotal,
  damageTakenDelta,
  computeAccuracy,
  // harness-ashau-objective-cycling-fix: objective zone picker.
  pickObjectiveZone,
  selectPatrolObjective,
  objectiveTelemetryKey,
} = driver;

function makeBotCtx(overrides = {}) {
  const config = overrides.config || botConfigForProfile(profileForMode('ai_sandbox'));
  return Object.assign({
    now: 1000,
    state: 'PATROL',
    timeInStateMs: 0,
    eyePos: { x: 0, y: 2, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    health: 100,
    maxHealth: 100,
    suppressionScore: 0,
    lastDamageMs: 0,
    magazine: { current: 30, max: 30 },
    currentTarget: null,
    findNearestEnemy: () => null,
    canSeeTarget: () => true,
    queryPath: () => null,
    findNearestNavmeshPoint: () => null,
    getObjective: () => null,
    sampleHeight: () => 0,
    config: config,
  }, overrides);
}

function makeBotTarget(overrides = {}) {
  return Object.assign({
    id: 'enemy_1',
    position: { x: 0, y: 0, z: -30 },
    lastKnownMs: 0,
  }, overrides);
}

describe('perf-active-driver fire decision (A4 regression)', () => {
  it('allows fire when camera forward aligns with the unit direction to target', () => {
    const result = evaluateFireDecision({
      cameraForward: { x: 0, y: 0, z: -1 },
      toTarget: { x: 0, y: 0, z: -1 },
      aimDotThreshold: 0.8,
      verticalThreshold: 0.45,
      closeRange: false
    });
    expect(result.shouldFire).toBe(true);
    expect(result.aimDot).toBeCloseTo(1, 5);
  });

  it('rejects fire when the target direction is flipped (camera points opposite)', () => {
    // Classic A4 regression case: aim-delta sign flip means the driver believes
    // the enemy is behind it. Must not fire or shots go into empty space/allies.
    const result = evaluateFireDecision({
      cameraForward: { x: 0, y: 0, z: -1 },
      toTarget: { x: 0, y: 0, z: 1 },
      aimDotThreshold: 0.8,
      verticalThreshold: 0.45,
      closeRange: false
    });
    expect(result.shouldFire).toBe(false);
    expect(result.reason).toBe('aim_dot_too_low');
    expect(result.aimDot).toBeCloseTo(-1, 5);
  });

  it('rejects fire when aim is perpendicular to target direction', () => {
    const result = evaluateFireDecision({
      cameraForward: { x: 0, y: 0, z: -1 },
      toTarget: { x: 1, y: 0, z: 0 },
      aimDotThreshold: 0.8,
      verticalThreshold: 0.45,
      closeRange: false
    });
    expect(result.shouldFire).toBe(false);
    expect(result.reason).toBe('aim_dot_too_low');
  });

  it('rejects fire when vertical angle is extreme at long range', () => {
    // Target direction mostly vertical (looking up at a helicopter). At long
    // range the harness suppresses vertical shots to avoid skybox cheese.
    const result = evaluateFireDecision({
      cameraForward: { x: 0, y: 0.95, z: -0.312 }, // aim nearly straight up
      toTarget: { x: 0, y: 0.95, z: -0.312 },      // target also nearly straight up
      aimDotThreshold: 0.8,
      verticalThreshold: 0.45,
      closeRange: false
    });
    expect(result.shouldFire).toBe(false);
    expect(result.reason).toBe('vertical_angle_rejected');
  });

  it('allows steep vertical angles when closeRange=true (knife fight on a hill)', () => {
    const result = evaluateFireDecision({
      cameraForward: { x: 0, y: 0.95, z: -0.312 },
      toTarget: { x: 0, y: 0.95, z: -0.312 },
      aimDotThreshold: 0.8,
      verticalThreshold: 0.45,
      closeRange: true
    });
    expect(result.shouldFire).toBe(true);
  });

  it('returns missing_vectors when inputs are incomplete', () => {
    const result = evaluateFireDecision({
      cameraForward: null,
      toTarget: { x: 0, y: 0, z: -1 }
    });
    expect(result.shouldFire).toBe(false);
    expect(result.reason).toBe('missing_vectors');
  });
});

describe('perf-active-driver terrain gradient probe (Layer 2)', () => {
  it('picks the straight-ahead direction when terrain is flat', () => {
    const result = chooseHeadingByGradient({
      sampleHeight: () => 0, // perfectly flat everywhere
      from: { x: 0, z: 0 },
      bearingRad: 0,          // due north (+z)
      maxGradient: 0.45,
      lookAhead: 8
    });
    expect(result).not.toBeNull();
    expect(result.gradient).toBeCloseTo(0, 5);
    expect(result.offsetRad).toBe(0);
  });

  it('deflects to a side when the ahead direction is steeper than maxGradient', () => {
    // North of origin: a wall (height 20 at 8m ahead -> gradient 2.5).
    // North-east: flat. Probe should choose the east side.
    const sampleHeight = (x, z) => {
      if (z > 5 && Math.abs(x) < 3) return 20; // wall straight ahead
      return 0;
    };
    const result = chooseHeadingByGradient({
      sampleHeight,
      from: { x: 0, z: 0 },
      bearingRad: 0, // bearing points +z (north) in driver yaw convention? No:
      // driver yaw uses forward = (sin(yaw), 0, -cos(yaw)). bearingRad=0 -> forward=(0,0,-1).
      // So "ahead" = -z, which is flat. To make the wall appear ahead we need
      // bearingRad=PI (forward = (0,0,1)).
      maxGradient: 0.45,
      lookAhead: 8
    });
    // Flat sample ahead — should accept direct bearing.
    expect(result).not.toBeNull();
    expect(result.offsetRad).toBe(0);
    // Now point at the wall and expect deflection.
    const blocked = chooseHeadingByGradient({
      sampleHeight,
      from: { x: 0, z: 0 },
      bearingRad: Math.PI,
      maxGradient: 0.45,
      lookAhead: 8
    });
    expect(blocked).not.toBeNull();
    expect(blocked.offsetRad).not.toBe(0);
  });

  it('returns null when every candidate exceeds maxGradient', () => {
    // A cone-shaped peak centered on the origin: height rises steeply in every
    // direction from where we stand, so no candidate (ahead, ±45, ±90) passes.
    const sampleHeight = (x, z) => 2 * Math.hypot(x, z); // 16 m rise at 8m -> gradient 2
    const result = chooseHeadingByGradient({
      sampleHeight,
      from: { x: 0, z: 0 },
      bearingRad: 0,
      maxGradient: 0.45,
      lookAhead: 8
    });
    expect(result).toBeNull();
  });
});

// perf-harness-killbot: rule-only NSRL primitives.
describe('perf-active-driver utility target lock (Dave Mark IAUS)', () => {
  it('prefers closer visible targets to farther visible ones', () => {
    const close = computeUtilityScore({ distance: 50, hasLOS: true, isEngagingUs: false });
    const far = computeUtilityScore({ distance: 200, hasLOS: true, isEngagingUs: false });
    expect(close).toBeGreaterThan(far);
  });

  it('reduces occluded targets without zeroing them (still a candidate)', () => {
    const visible = computeUtilityScore({ distance: 100, hasLOS: true, isEngagingUs: false });
    const occluded = computeUtilityScore({ distance: 100, hasLOS: false, isEngagingUs: false });
    expect(occluded).toBeGreaterThan(0);
    expect(occluded).toBeLessThan(visible);
  });

  it('keeps lock on current target when candidate barely exceeds it', () => {
    // Candidate must beat current by 30% to steal the lock.
    const current = 1.0;
    const narrowlyBetter = 1.2; // +20%
    expect(shouldSwitchTarget(current, narrowlyBetter, 1.3)).toBe(false);
  });

  it('switches lock once a candidate beats current by 30%', () => {
    const current = 1.0;
    const clearlyBetter = 1.31; // +31%
    expect(shouldSwitchTarget(current, clearlyBetter, 1.3)).toBe(true);
  });

  it('accepts any candidate when there is no current lock', () => {
    expect(shouldSwitchTarget(0, 0.5, 1.3)).toBe(true);
    expect(shouldSwitchTarget(0, 0, 1.3)).toBe(false);
  });
});

describe('perf-active-driver aim solution (eye-height + velocity lead)', () => {
  it('looks down at a stationary target 10m ahead at ground level', () => {
    // Eye at (0, eye_h, 0); ground/objective aim height is center mass.
    const solution = computeAimSolution({
      eyeX: 0, eyeY: PLAYER_EYE_HEIGHT, eyeZ: 0,
      targetX: 10, targetY: TARGET_CHEST_HEIGHT, targetZ: 0,
      targetVx: 0, targetVy: 0, targetVz: 0,
      bulletSpeed: DEFAULT_BULLET_SPEED
    });
    // Eye above target by PLAYER_EYE_HEIGHT - TARGET_CHEST_HEIGHT.
    const expectedPitch = Math.atan2(-(PLAYER_EYE_HEIGHT - TARGET_CHEST_HEIGHT), 10);
    expect(solution.pitch).toBeCloseTo(expectedPitch, 5);
    expect(solution.horizontalDist).toBeCloseTo(10, 5);
  });

  it('leads a target moving laterally', () => {
    // Target 40m ahead, moving +X at 5 m/s. With bullet speed 400, flight time
    // ~0.1s → lead offset 0.5m in X.
    const solution = computeAimSolution({
      eyeX: 0, eyeY: PLAYER_EYE_HEIGHT, eyeZ: 0,
      targetX: 0, targetY: TARGET_CHEST_HEIGHT, targetZ: -40,
      targetVx: 5, targetVy: 0, targetVz: 0,
      bulletSpeed: 400
    });
    expect(solution.aimPoint.x).toBeCloseTo(0.5, 3);
  });

  it('is undefined-safe for missing velocity components', () => {
    const solution = computeAimSolution({
      eyeX: 0, eyeY: PLAYER_EYE_HEIGHT, eyeZ: 0,
      targetX: 10, targetY: TARGET_CHEST_HEIGHT, targetZ: 0
      // no velocity provided
    });
    expect(Number.isFinite(solution.yaw)).toBe(true);
    expect(Number.isFinite(solution.pitch)).toBe(true);
  });
});

describe('perf-active-driver fire gate (pitch safety)', () => {
  const degToRad = (d) => d * Math.PI / 180;

  it('rejects fire when aim pitch is below -25 deg at range', () => {
    const gate = evaluateFireGate({
      aimErrorRad: 0,
      losClear: true,
      pitchRad: degToRad(-30),
      distance: 20,
      ammoReady: true
    });
    expect(gate.fire).toBe(false);
    expect(gate.reason).toBe('fire_pitch_unsafe');
  });

  it('allows fire when aim pitch is steep but target is close (<10m)', () => {
    const gate = evaluateFireGate({
      aimErrorRad: 0,
      losClear: true,
      pitchRad: degToRad(-30),
      distance: 5,
      ammoReady: true
    });
    expect(gate.fire).toBe(true);
  });

  it('rejects fire when ammo is not ready', () => {
    const gate = evaluateFireGate({
      aimErrorRad: 0,
      losClear: true,
      pitchRad: 0,
      distance: 50,
      ammoReady: false
    });
    expect(gate.fire).toBe(false);
    expect(gate.reason).toBe('ammo_not_ready');
  });

  it('rejects fire when LOS is blocked', () => {
    const gate = evaluateFireGate({
      aimErrorRad: 0,
      losClear: false,
      pitchRad: 0,
      distance: 50,
      ammoReady: true
    });
    expect(gate.fire).toBe(false);
    expect(gate.reason).toBe('los_blocked');
  });

  it('rejects fire when aim error exceeds the cone', () => {
    const gate = evaluateFireGate({
      aimErrorRad: degToRad(10),
      maxAimErrorRad: degToRad(3),
      losClear: true,
      pitchRad: 0,
      distance: 50,
      ammoReady: true
    });
    expect(gate.fire).toBe(false);
    expect(gate.reason).toBe('aim_error_too_high');
  });

  it('passes all gates when every condition is met', () => {
    const gate = evaluateFireGate({
      aimErrorRad: degToRad(1),
      maxAimErrorRad: degToRad(3),
      losClear: true,
      pitchRad: degToRad(-5),
      distance: 50,
      ammoReady: true
    });
    expect(gate.fire).toBe(true);
  });
});

describe('perf-active-driver pure-pursuit lookahead', () => {
  it('clamps to the [5, 20] metre range regardless of speed', () => {
    expect(computeAdaptiveLookahead(0)).toBe(8); // 8 + 0.05*0 = 8
    expect(computeAdaptiveLookahead(9999)).toBe(20);
    expect(computeAdaptiveLookahead(-100)).toBeGreaterThanOrEqual(5);
  });

  it('scales with speed between the bounds', () => {
    const slow = computeAdaptiveLookahead(100);
    const fast = computeAdaptiveLookahead(200);
    expect(fast).toBeGreaterThan(slow);
  });

  it('walks forward along a path by the lookahead distance', () => {
    // Straight path along +X. Lookahead 10m from origin should land at (10, 0, 0).
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 }
    ];
    const pt = pointAlongPath(path, 0, { x: 0, z: 0 }, 10);
    expect(pt).not.toBeNull();
    expect(pt.x).toBeCloseTo(10, 5);
  });

  it('clamps to the final waypoint when lookahead exceeds path length', () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 }
    ];
    const pt = pointAlongPath(path, 0, { x: 0, z: 0 }, 100);
    expect(pt.x).toBeCloseTo(5, 5);
  });

  it('handles a bend by advancing along both segments', () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
      { x: 5, y: 0, z: 5 }
    ];
    // Lookahead 8m starting at origin: traverses 5m on seg1, then 3m on seg2.
    const pt = pointAlongPath(path, 0, { x: 0, z: 0 }, 8);
    expect(pt.x).toBeCloseTo(5, 5);
    expect(pt.z).toBeCloseTo(3, 5);
  });

  it('projects onto the route before looking ahead so missed waypoints do not pull backward', () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
      { x: 20, y: 0, z: 20 }
    ];
    const pt = pointAlongPath(path, 0, { x: 12, z: 3 }, 8);
    expect(pt).not.toBeNull();
    expect(pt.x).toBeCloseTo(20, 5);
    expect(pt.z).toBeCloseTo(0, 5);
  });
});

describe('perf-active-driver eye-height camera fix', () => {
  // Thin integration check — computeAimSolution consumes eyeY = playerY + PLAYER_EYE_HEIGHT.
  // If syncCameraPosition regresses to the feet (PLAYER_EYE_HEIGHT=0 case), pitch
  // inverts from slightly-down to slightly-up and long shots hit the ground.
  it('produces a downward pitch onto a ground-level target from eye height', () => {
    const feetY = 0;
    const eyeY = feetY + PLAYER_EYE_HEIGHT;
    const solution = computeAimSolution({
      eyeX: 0, eyeY: eyeY, eyeZ: 0,
      targetX: 50, targetY: TARGET_CHEST_HEIGHT, targetZ: 0
    });
    // Eye > chest → aim direction has negative pitch.
    expect(solution.pitch).toBeLessThan(0);
  });

  it('would invert pitch if the camera was left at the feet (regression guard)', () => {
    const feetY = 0;
    // Bug case: eyeY left at feet.
    const solution = computeAimSolution({
      eyeX: 0, eyeY: feetY, eyeZ: 0,
      targetX: 50, targetY: TARGET_CHEST_HEIGHT, targetZ: 0
    });
    // Eye below chest → aim direction has positive pitch. This is the bug
    // shape — keep the assertion so anyone reverting the eye-height fix will
    // fail this test.
    expect(solution.pitch).toBeGreaterThan(0);
  });
});

// perf-harness-verticality-and-sizing: behavior guards for the verticality pass.
describe('perf-active-driver slope contract (physics-hooked climb gradient)', () => {
  // Player physics `slopeDot = 0.7` and the navmesh `WALKABLE_SLOPE_ANGLE = 45°`
  // are the two surfaces the live game walks on. The driver MUST consume the
  // derived climb angle so its gradient probe cannot reject a slope the player
  // could legitimately walk. This set of tests asserts the derivation is
  // consistent, not the specific numeric value (non-implementation-mirror).

  it('derives the climb gradient from the slope-dot contract', () => {
    expect(PLAYER_MAX_CLIMB_ANGLE_RAD).toBeCloseTo(Math.acos(PLAYER_CLIMB_SLOPE_DOT), 10);
    expect(PLAYER_MAX_CLIMB_GRADIENT).toBeCloseTo(Math.tan(PLAYER_MAX_CLIMB_ANGLE_RAD), 10);
  });

  it('admits slopes within the climb envelope when probing', () => {
    // Uniform ~40° slope everywhere (below the ~45° climb limit). With a flat
    // playing field tilted at 40°, every candidate direction has the same
    // gradient magnitude, but none exceeds the physics climb cap — so the
    // probe must accept the direct bearing rather than returning null.
    // Deflecting-or-rejecting here is the bug shape that stalled the player
    // on any non-flat ridge when per-mode maxGradient diverged from physics.
    const gentleAngle = (40 * Math.PI) / 180;
    const gentle = Math.tan(gentleAngle);
    const sampleHeight = (x, z) => z * gentle; // tilt the whole world +z-up
    const choice = chooseHeadingByGradient({
      sampleHeight,
      from: { x: 0, z: 0 },
      bearingRad: Math.PI, // forward = +z (uphill)
      maxGradient: PLAYER_MAX_CLIMB_GRADIENT,
      lookAhead: 8
    });
    expect(choice).not.toBeNull();
    // Every candidate that still advances toward the bearing passes the cap,
    // so Math.abs(gradient) is below the climb envelope.
    expect(Math.abs(choice.gradient)).toBeLessThan(PLAYER_MAX_CLIMB_GRADIENT);
  });

  it('rejects slopes beyond the climb envelope', () => {
    // 60° ramp — well past ~45°. Probe must refuse the direct bearing.
    const steep = Math.tan((60 * Math.PI) / 180); // ~1.73 gradient
    const sampleHeight = (x, z) => 2 * steep * Math.hypot(x, z); // steep in every direction
    const choice = chooseHeadingByGradient({
      sampleHeight,
      from: { x: 0, z: 0 },
      bearingRad: 0,
      maxGradient: PLAYER_MAX_CLIMB_GRADIENT,
      lookAhead: 8
    });
    expect(choice).toBeNull();
  });
});

describe('perf-active-driver path-trust invariant', () => {
  // Brief: when navmesh returns a valid path, the driver must follow the
  // pure-pursuit lookahead and NOT consult the per-tick gradient probe. The
  // probe is a Reynolds 1999 local obstacle-avoidance behavior and must not
  // override the macro path (NSRL invariant, arxiv:2410.04936).

  it('trusts a fresh, multi-waypoint path', () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 }
    ];
    expect(isPathTrusted({ path, waypointIdx: 0, pathAgeMs: 500 })).toBe(true);
  });

  it('does not trust a single-waypoint path', () => {
    const path = [{ x: 0, y: 0, z: 0 }];
    expect(isPathTrusted({ path, waypointIdx: 0, pathAgeMs: 0 })).toBe(false);
  });

  it('does not trust a null / missing path', () => {
    expect(isPathTrusted({ path: null, waypointIdx: 0, pathAgeMs: 0 })).toBe(false);
    expect(isPathTrusted({ waypointIdx: 0, pathAgeMs: 0 })).toBe(false);
  });

  it('does not trust a stale path (past PATH_TRUST_TTL_MS)', () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 }
    ];
    expect(isPathTrusted({ path, waypointIdx: 0, pathAgeMs: PATH_TRUST_TTL_MS + 1 })).toBe(false);
  });

  it('does not trust a path once we walked past the last waypoint', () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 }
    ];
    expect(isPathTrusted({ path, waypointIdx: 2, pathAgeMs: 100 })).toBe(false);
  });

  it('TTL is positive and covers typical planning cadence', () => {
    // Non-implementation-mirror: don't pin the exact 5000ms, but reject anything
    // below the realistic cadence window (navmesh replans are 3.5-6s per mode).
    expect(PATH_TRUST_TTL_MS).toBeGreaterThanOrEqual(3000);
  });
});

describe('perf-active-driver aim pitch range', () => {
  // Brief: vertical targets on steep terrain were going un-engaged because the
  // aim-Y clamp was too tight. ±80° must be accessible; the fire-gate pitch
  // safety ("-25° at > 10m") is the only ground-fire safety rail.

  it('accepts a +30° elevated target at 50m without clamping pitch', () => {
    const playerY = 0;
    const horizontalDist = 50;
    // +30° → desiredY = 50 * tan(30°) ≈ 28.87m above playerY.
    const desiredY = horizontalDist * Math.tan((30 * Math.PI) / 180);
    const clamped = clampAimYByPitch(playerY, desiredY, horizontalDist);
    expect(clamped).toBeCloseTo(desiredY, 5);
    const pitch = Math.atan2(clamped - playerY, horizontalDist);
    expect(pitch).toBeCloseTo((30 * Math.PI) / 180, 3);
  });

  it('accepts a -45° depressed target at 20m without clamping pitch', () => {
    const playerY = 10;
    const horizontalDist = 20;
    const desiredY = playerY - horizontalDist * Math.tan((45 * Math.PI) / 180);
    const clamped = clampAimYByPitch(playerY, desiredY, horizontalDist);
    expect(clamped).toBeCloseTo(desiredY, 5);
  });

  it('caps pitch at the ±80° gimbal margin', () => {
    const playerY = 0;
    const horizontalDist = 10;
    // Aim nearly straight up (85° → tan(85°) ≈ 11.43 m/m).
    const desiredY = 200; // way above the 80° envelope
    const clamped = clampAimYByPitch(playerY, desiredY, horizontalDist);
    const pitch = Math.atan2(clamped - playerY, horizontalDist);
    // Cap is 80° ± floating-point rounding.
    expect(pitch).toBeLessThanOrEqual(AIM_PITCH_LIMIT_RAD + 1e-9);
    expect(pitch).toBeGreaterThan((75 * Math.PI) / 180);
  });

  it('returns desired Y unchanged at extremely close range (<= 1cm)', () => {
    expect(clampAimYByPitch(2, 5, 0.005)).toBe(5);
  });
});

// ── perf-harness-player-bot: state-machine behavior tests. ──────────────────
// These exercise the driver's JS-mirror of the TypeScript state machine
// in src/dev/harness/playerBot/. The TypeScript tests (src/dev/harness/*.test.ts)
// are the source-of-truth contract; these Node tests prove the driver stays in
// sync so the browser harness does what the unit tests say it should.

describe('PlayerBot driver mirror — PATROL and ALERT', () => {
  it('starts in PATROL when no enemy is visible', () => {
    const step = stepBotState('PATROL', makeBotCtx());
    expect(step.nextState).toBeNull();
    expect(step.intent.firePrimary).toBe(false);
  });

  it('transitions PATROL → ALERT on first enemy sighting', () => {
    const step = stepBotState('PATROL', makeBotCtx({
      findNearestEnemy: () => makeBotTarget(),
    }));
    expect(step.nextState).toBe('ALERT');
  });

  it('keeps PATROL on the objective when only a distant target is perceived', () => {
    const step = stepBotState('PATROL', makeBotCtx({
      findNearestEnemy: () => makeBotTarget({ position: { x: 0, y: 0, z: -500 } }),
      getObjective: () => ({ position: { x: 100, y: 0, z: 0 }, priority: 1 }),
    }));
    expect(step.nextState).toBeNull();
    expect(step.intent.moveForward).toBeGreaterThan(0);
    expect(step.intent.aimTarget.x).toBeCloseTo(100, 5);
  });

  it('still breaks objective travel for a close visible target', () => {
    const step = stepBotState('PATROL', makeBotCtx({
      findNearestEnemy: () => makeBotTarget({ position: { x: 0, y: 0, z: -30 } }),
      getObjective: () => ({ position: { x: 100, y: 0, z: 0 }, priority: 1 }),
    }));
    expect(step.nextState).toBe('ALERT');
  });

  it('ALERT hands off to ENGAGE when target is near and visible', () => {
    const target = makeBotTarget({ position: { x: 0, y: 0, z: -30 } });
    const step = stepBotState('ALERT', makeBotCtx({
      currentTarget: target,
      canSeeTarget: () => true,
    }));
    expect(step.nextState).toBe('ENGAGE');
  });

  it('ALERT hands off to ADVANCE when target is occluded', () => {
    const target = makeBotTarget({ position: { x: 0, y: 0, z: -30 } });
    const step = stepBotState('ALERT', makeBotCtx({
      currentTarget: target,
      canSeeTarget: () => false,
    }));
    expect(step.nextState).toBe('ADVANCE');
  });

  it('does not reacquire an ungated enemy while ALERT is returning to a zone route', () => {
    const step = stepBotState('ALERT', makeBotCtx({
      currentTarget: null,
      findNearestEnemy: () => makeBotTarget({ position: { x: 0, y: 0, z: -220 } }),
      getObjective: () => ({ kind: 'zone', position: { x: 300, y: 0, z: 0 }, priority: 1 }),
    }));
    expect(step.nextState).toBe('PATROL');
    expect(step.intent.moveForward).toBe(0);
    expect(step.intent.aimTarget).toBeNull();
  });
});

describe('PlayerBot driver mirror — ENGAGE', () => {
  it('emits fire intent with a loaded magazine and visible target', () => {
    const step = stepBotState('ENGAGE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -30 } }),
      canSeeTarget: () => true,
    }));
    expect(step.intent.firePrimary).toBe(true);
    expect(step.intent.reload).toBe(false);
  });

  it('emits reload intent when magazine is empty', () => {
    const step = stepBotState('ENGAGE', makeBotCtx({
      currentTarget: makeBotTarget(),
      magazine: { current: 0, max: 30 },
    }));
    expect(step.intent.firePrimary).toBe(false);
    expect(step.intent.reload).toBe(true);
  });

  it('transitions to ADVANCE when LOS is lost mid-engagement (core bug fix)', () => {
    // Live playtest showed the old driver shooting through terrain. With the
    // bot consuming canSeeTarget (engine terrain raycast) directly, the
    // state machine yields ADVANCE after a short anti-flicker dwell.
    const config = botConfigForProfile(profileForMode('ai_sandbox'));
    const step = stepBotState('ENGAGE', makeBotCtx({
      currentTarget: makeBotTarget(),
      canSeeTarget: () => false,
      timeInStateMs: config.minEngageStateMs,
    }));
    expect(step.nextState).toBe('ADVANCE');
    expect(step.intent.firePrimary).toBe(false);
  });

  it('holds ENGAGE through a close transient LOS loss before the dwell expires', () => {
    const step = stepBotState('ENGAGE', makeBotCtx({
      currentTarget: makeBotTarget(),
      canSeeTarget: () => false,
      timeInStateMs: 0,
    }));
    expect(step.nextState).toBeNull();
    expect(step.intent.firePrimary).toBe(false);
    expect(step.intent.moveForward).toBe(0);
  });

  it('keeps pushing during a distant transient LOS loss before the dwell expires', () => {
    const step = stepBotState('ENGAGE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -180 } }),
      canSeeTarget: () => false,
      timeInStateMs: 0,
    }));
    expect(step.nextState).toBeNull();
    expect(step.intent.firePrimary).toBe(false);
    expect(step.intent.moveForward).toBeGreaterThan(0);
  });

  it('stays in ENGAGE and fires at low health (no SEEK_COVER/RETREAT)', () => {
    // Harness bot is a push-through perf surrogate, not a soldier.
    const step = stepBotState('ENGAGE', makeBotCtx({
      currentTarget: makeBotTarget(),
      health: 5,
    }));
    expect(step.nextState).toBeNull();
    expect(step.intent.firePrimary).toBe(true);
  });

  it('does NOT emit backward movement in ENGAGE even when close (REGRESSION 3)', () => {
    // Regression: PR #95 set moveForward = -1 when inside retreatDistance.
    for (let dist = 1; dist <= 100; dist += 5) {
      const step = stepBotState('ENGAGE', makeBotCtx({
        currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -dist } }),
      }));
      expect(step.intent.moveForward).toBeGreaterThanOrEqual(0);
    }
  });

  it('holds position and fires inside the close-contact push-in distance', () => {
    const step = stepBotState('ENGAGE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -10 } }),
    }));
    expect(step.intent.firePrimary).toBe(true);
    expect(step.intent.moveForward).toBe(0);
  });

  it('plants and fires inside the tactical engagement band', () => {
    const step = stepBotState('ENGAGE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -60 } }),
    }));
    expect(step.intent.firePrimary).toBe(true);
    expect(step.intent.moveForward).toBe(0);
  });

  it('pushes while firing when outside the tactical engagement band', () => {
    const step = stepBotState('ENGAGE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -160 } }),
    }));
    expect(step.intent.firePrimary).toBe(true);
    expect(step.intent.moveForward).toBeGreaterThan(0);
  });

  it('writes an aimTarget at the visual chest proxy — not angles', () => {
    const step = stepBotState('ENGAGE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 30, y: PLAYER_EYE_HEIGHT, z: 0 } }),
    }));
    expect(step.intent.aimTarget).not.toBeNull();
    expect(step.intent.aimTarget.x).toBeCloseTo(30, 5);
    expect(step.intent.aimTarget.y).toBeCloseTo(PLAYER_EYE_HEIGHT + TARGET_ACTOR_AIM_Y_OFFSET, 5);
    expect(step.intent.aimTarget.y).toBeLessThan(PLAYER_EYE_HEIGHT);
  });

  it('prefers rendered aim position when supplied by the live driver', () => {
    const step = stepBotState('ENGAGE', makeBotCtx({
      currentTarget: makeBotTarget({
        position: { x: 30, y: PLAYER_EYE_HEIGHT, z: 0 },
        aimPosition: { x: 36, y: PLAYER_EYE_HEIGHT + 0.5, z: -4 },
      }),
    }));
    expect(step.intent.aimTarget).not.toBeNull();
    expect(step.intent.aimTarget.x).toBeCloseTo(36, 5);
    expect(step.intent.aimTarget.y).toBeCloseTo(PLAYER_EYE_HEIGHT + 0.5 + TARGET_ACTOR_AIM_Y_OFFSET, 5);
    expect(step.intent.aimTarget.z).toBeCloseTo(-4, 5);
  });
});

describe('PlayerBot driver mirror — ADVANCE', () => {
  it('returns to ENGAGE once LOS is restored', () => {
    const config = botConfigForProfile(profileForMode('ai_sandbox'));
    const step = stepBotState('ADVANCE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -30 } }),
      canSeeTarget: () => true,
      timeInStateMs: config.minAdvanceStateMs,
    }));
    expect(step.nextState).toBe('ENGAGE');
  });

  it('holds position on a close transient LOS reacquire before the dwell expires', () => {
    const step = stepBotState('ADVANCE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -30 } }),
      canSeeTarget: () => true,
      timeInStateMs: 0,
    }));
    expect(step.nextState).toBeNull();
    expect(step.intent.moveForward).toBe(0);
    expect(step.intent.firePrimary).toBe(false);
  });

  it('keeps advancing toward a distant transient LOS reacquire before the dwell expires', () => {
    const step = stepBotState('ADVANCE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -180 } }),
      canSeeTarget: () => true,
      timeInStateMs: 0,
    }));
    expect(step.nextState).toBeNull();
    expect(step.intent.moveForward).toBeGreaterThan(0);
    expect(step.intent.firePrimary).toBe(false);
  });

  it('keeps moving forward when target remains occluded', () => {
    const step = stepBotState('ADVANCE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -30 } }),
      canSeeTarget: () => false,
    }));
    expect(step.intent.moveForward).toBeGreaterThan(0);
    expect(step.intent.firePrimary).toBe(false);
  });

  it('keeps repositioning toward a close occluded target outside point-blank distance', () => {
    const step = stepBotState('ADVANCE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -15 } }),
      canSeeTarget: () => false,
    }));
    expect(step.nextState).toBeNull();
    expect(step.intent.moveForward).toBeGreaterThan(0);
    expect(step.intent.firePrimary).toBe(false);
  });

  it('holds instead of walking through a point-blank occluded target', () => {
    const step = stepBotState('ADVANCE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -3 } }),
      canSeeTarget: () => false,
    }));
    expect(step.nextState).toBeNull();
    expect(step.intent.moveForward).toBe(0);
    expect(step.intent.firePrimary).toBe(false);
  });

  it('falls back to PATROL when target is gone', () => {
    const step = stepBotState('ADVANCE', makeBotCtx({
      currentTarget: null,
      findNearestEnemy: () => null,
    }));
    expect(step.nextState).toBe('PATROL');
  });

  it('does not aim or move toward an ungated enemy while the active objective is a zone', () => {
    const step = stepBotState('ADVANCE', makeBotCtx({
      currentTarget: null,
      findNearestEnemy: () => makeBotTarget({ position: { x: -220, y: 0, z: 40 } }),
      getObjective: () => ({ kind: 'zone', position: { x: 300, y: 0, z: 0 }, priority: 1 }),
    }));
    expect(step.nextState).toBe('PATROL');
    expect(step.intent.moveForward).toBe(0);
    expect(step.intent.aimTarget).toBeNull();
  });
});

describe('PlayerBot driver mirror — RESPAWN_WAIT absorbs zero-health', () => {
  const states = ['PATROL', 'ALERT', 'ENGAGE', 'ADVANCE'];
  for (const s of states) {
    it(`forces RESPAWN_WAIT from ${s} when health reaches zero`, () => {
      const step = stepBotState(s, makeBotCtx({ health: 0 }));
      expect(step.nextState).toBe('RESPAWN_WAIT');
    });
  }

  it('leaves RESPAWN_WAIT once health is restored', () => {
    const step = stepBotState('RESPAWN_WAIT', makeBotCtx({ health: 100 }));
    expect(step.nextState).toBe('PATROL');
  });
});

describe('PlayerBot driver mirror — mode profiles', () => {
  it('open_frontier enables aggressiveMode', () => {
    expect(profileForMode('open_frontier').aggressiveMode).toBe(true);
  });

  it('combat120 (ai_sandbox) runs the standard profile', () => {
    expect(profileForMode('ai_sandbox').aggressiveMode).toBe(false);
  });

  it('perception range is larger in open_frontier than team_deathmatch', () => {
    const of = profileForMode('open_frontier');
    const tdm = profileForMode('team_deathmatch');
    expect(of.perceptionRange).toBeGreaterThan(tdm.perceptionRange);
  });

  it('botConfigForProfile carries over maxFireDistance from profile', () => {
    const profile = profileForMode('open_frontier');
    const config = botConfigForProfile(profile);
    expect(config.maxFireDistance).toBe(profile.maxFireDistance);
  });

  it('botConfigForProfile carries profile objective interrupt distance', () => {
    const profile = profileForMode('open_frontier');
    const config = botConfigForProfile(profile);
    expect(config.targetAcquisitionDistance).toBe(profile.targetAcquisitionDistance);
    expect(config.targetAcquisitionDistance).toBeLessThan(profile.maxFireDistance);
  });

  it('uses a longer combat-front route distance for aggressive large-map profiles', () => {
    const profile = profileForMode('open_frontier');
    expect(combatObjectiveMaxDistanceForProfile(profile)).toBeGreaterThan(profile.targetAcquisitionDistance);
    expect(combatObjectiveMaxDistanceForProfile(profile)).toBeLessThanOrEqual(profile.perceptionRange);
  });

  it('keeps non-aggressive profiles on the immediate target acquisition distance', () => {
    const profile = profileForMode('zone_control');
    expect(combatObjectiveMaxDistanceForProfile(profile)).toBe(profile.targetAcquisitionDistance);
  });

  it('botConfigForProfile uses retreatDistance as the close-contact hold distance', () => {
    const profile = profileForMode('a_shau_valley');
    const config = botConfigForProfile(profile);
    expect(config.pushInDistance).toBe(profile.retreatDistance);
  });

  it('botConfigForProfile defines a non-negative pushInDistance', () => {
    const config = botConfigForProfile(profileForMode('ai_sandbox'));
    expect(config.pushInDistance).toBeGreaterThanOrEqual(0);
  });

  it('botConfigForProfile defines anti-oscillation state dwell windows', () => {
    const config = botConfigForProfile(profileForMode('ai_sandbox'));
    expect(config.minEngageStateMs).toBeGreaterThan(0);
    expect(config.minAdvanceStateMs).toBeGreaterThan(0);
  });

  it('botConfigForProfile disables scripted strafe so stress captures do not mimic cover-peeking', () => {
    const config = botConfigForProfile(profileForMode('ai_sandbox'));
    expect(config.engageStrafeAmplitude).toBe(0);
  });

  it('botConfigForProfile no longer carries cover / retreat thresholds', () => {
    // Cover-seeking and retreating are gone from the harness bot.
    const config = botConfigForProfile(profileForMode('ai_sandbox'));
    expect(config.coverHealthFraction).toBeUndefined();
    expect(config.retreatHealthFraction).toBeUndefined();
    expect(config.coverSuppressionScore).toBeUndefined();
  });

  it('frontline compression covers long-map perf modes with shot gates', () => {
    expect(supportsFrontlineCompression('open_frontier')).toBe(true);
    expect(supportsFrontlineCompression('a_shau_valley')).toBe(true);
  });

  it('uses player-anchored compression only for long-map perf modes', () => {
    expect(usesPlayerAnchoredFrontlineCompression('open_frontier')).toBe(true);
    expect(usesPlayerAnchoredFrontlineCompression('a_shau_valley')).toBe(true);
    expect(usesPlayerAnchoredFrontlineCompression('ai_sandbox')).toBe(false);
  });

  it('compression relocation snaps rendered position and spatial grid with logical position', () => {
    const renderedPosition = {
      x: 0,
      y: 0,
      z: 0,
      copy(pos) {
        this.x = pos.x;
        this.y = pos.y;
        this.z = pos.z;
      },
    };
    const velocity = { set: vi.fn() };
    const combatant = {
      id: 'opfor-1',
      position: { x: 0, y: 0, z: 0 },
      renderedPosition,
      velocity,
    };
    const syncEntity = vi.fn();

    const placed = placeCompressedCombatantForHarness({
      terrainSystem: { getHeightAt: () => 12 },
      combatantSystem: { spatialGridManager: { syncEntity } },
    }, combatant, 25, -40);

    expect(placed).toBe(true);
    expect(combatant.position).toMatchObject({ x: 25, y: 14.2, z: -40 });
    expect(renderedPosition).toMatchObject(combatant.position);
    expect(velocity.set).toHaveBeenCalledWith(0, 0, 0);
    expect(syncEntity).toHaveBeenCalledWith('opfor-1', combatant.position);
  });
});

describe('PlayerBot driver mirror — idle intent shape', () => {
  it('is all-zero by default', () => {
    const intent = createIdleBotIntent();
    expect(intent.moveForward).toBe(0);
    expect(intent.moveStrafe).toBe(0);
    expect(intent.sprint).toBe(false);
    expect(intent.firePrimary).toBe(false);
    expect(intent.reload).toBe(false);
  });

  it('has a null aimTarget by default (hold angles)', () => {
    const intent = createIdleBotIntent();
    expect(intent.aimTarget).toBeNull();
  });

  it('has a null movementTarget by default', () => {
    const intent = createIdleBotIntent();
    expect(intent.movementTarget).toBeNull();
  });

  it('has an aimLerpRate of 1 (snap) by default', () => {
    const intent = createIdleBotIntent();
    expect(intent.aimLerpRate).toBe(1);
  });
});

describe('PlayerBot driver mirror — route-overlay view target', () => {
  it('faces the movement target while moving and not firing', () => {
    const aimTarget = { x: 100, y: 2, z: 0 };
    const movementTarget = { x: 0, y: 2, z: -20 };
    const selected = selectDriverViewTarget({
      ...createIdleBotIntent(),
      moveForward: 1,
      aimTarget,
      movementTarget,
    }, null, true);
    expect(selected).toBe(movementTarget);
  });

  it('keeps the combat aim target while firing', () => {
    const aimTarget = { x: 100, y: 2, z: 0 };
    const movementTarget = { x: 0, y: 2, z: -20 };
    const selected = selectDriverViewTarget({
      ...createIdleBotIntent(),
      moveForward: 1,
      firePrimary: true,
      aimTarget,
      movementTarget,
    }, null, true);
    expect(selected).toBe(aimTarget);
  });

  it('uses the overlay point when callers have not already copied it onto the intent', () => {
    const aimTarget = { x: 100, y: 2, z: 0 };
    const overlayPoint = { x: -10, y: 2, z: 30 };
    const selected = selectDriverViewTarget({
      ...createIdleBotIntent(),
      moveForward: 1,
      aimTarget,
    }, overlayPoint, true);
    expect(selected).toBe(overlayPoint);
  });

  it('still faces the movement target near close combat when not firing', () => {
    const aimTarget = { x: 100, y: 2, z: 0 };
    const movementTarget = { x: 0, y: 2, z: -20 };
    const selected = selectDriverViewTarget({
      ...createIdleBotIntent(),
      moveForward: 1,
      aimTarget,
      movementTarget,
    }, null, true);
    expect(selected).toBe(movementTarget);
  });
});

describe('PlayerBot driver mirror — route-overlay eligibility', () => {
  it('uses route overlay while advancing toward an occluded target', () => {
    expect(shouldUseRouteOverlayForIntent({
      intent: {
        ...createIdleBotIntent(),
        moveForward: 1,
      },
      botState: 'ADVANCE',
      currentTarget: makeBotTarget(),
    })).toBe(true);
  });

  it('skips route overlay while firing and closing on a visible target', () => {
    expect(shouldUseRouteOverlayForIntent({
      intent: {
        ...createIdleBotIntent(),
        moveForward: 1,
        firePrimary: true,
      },
      botState: 'ENGAGE',
      currentTarget: makeBotTarget(),
    })).toBe(false);
  });

  it('still routes patrol objective travel through the overlay', () => {
    expect(shouldUseRouteOverlayForIntent({
      intent: {
        ...createIdleBotIntent(),
        moveForward: 1,
      },
      botState: 'PATROL',
      currentTarget: null,
    })).toBe(true);
  });
});

describe('PlayerBot driver mirror — world movement intent', () => {
  it('normalizes route movement independently from camera aim', () => {
    const intent = {
      ...createIdleBotIntent(),
      moveForward: 1,
      aimTarget: { x: 100, y: 2, z: 0 },
      movementTarget: { x: 0, y: 2, z: -20 },
    };
    const movement = computeWorldMovementIntent(intent, null, { x: 0, y: 2, z: 0 });
    expect(movement.x).toBeCloseTo(0, 5);
    expect(movement.z).toBeCloseTo(-1, 5);
    expect(movement.distance).toBeCloseTo(20, 5);
  });

  it('returns a zero vector when the route point is already reached', () => {
    const intent = {
      ...createIdleBotIntent(),
      moveForward: 1,
      movementTarget: { x: 0.1, y: 2, z: 0.1 },
    };
    const movement = computeWorldMovementIntent(intent, null, { x: 0, y: 2, z: 0 });
    expect(movement.x).toBe(0);
    expect(movement.z).toBe(0);
    expect(movement.distance).toBeLessThan(0.5);
  });

  it('returns null when the bot does not want movement', () => {
    const movement = computeWorldMovementIntent({
      ...createIdleBotIntent(),
      movementTarget: { x: 0, y: 2, z: -20 },
    }, null, { x: 0, y: 2, z: 0 });
    expect(movement).toBeNull();
  });

  it('falls back to the world-space aim target for forward movement when no route point is available', () => {
    const movement = computeWorldMovementIntent({
      ...createIdleBotIntent(),
      moveForward: 1,
      aimTarget: { x: 10, y: 2, z: 0 },
    }, null, { x: 0, y: 2, z: 0 });
    expect(movement.x).toBeCloseTo(1, 5);
    expect(movement.z).toBeCloseTo(0, 5);
    expect(movement.distance).toBeCloseTo(10, 5);
  });

  it('does not convert strafe-only aim into target-seeking world movement', () => {
    const movement = computeWorldMovementIntent({
      ...createIdleBotIntent(),
      moveStrafe: 1,
      aimTarget: { x: 10, y: 2, z: 0 },
    }, null, { x: 0, y: 2, z: 0 });
    expect(movement).toBeNull();
  });
});

describe('PlayerBot driver mirror — target lock stability', () => {
  it('keeps the current target through transient nearest-enemy churn', () => {
    const current = makeBotTarget({ id: 'old_target', lastKnownMs: 1000 });
    const fresh = makeBotTarget({ id: 'new_target', lastKnownMs: 2000 });
    expect(selectLockedTarget(current, fresh, 3000, 4000)).toBe(current);
  });

  it('switches target after the current target is stale', () => {
    const current = makeBotTarget({ id: 'old_target', lastKnownMs: 1000 });
    const fresh = makeBotTarget({ id: 'new_target', lastKnownMs: 7000 });
    expect(selectLockedTarget(current, fresh, 7000, 4000)).toBe(fresh);
  });

});

describe('PlayerBot driver mirror — route-overlay terrain recovery', () => {
  it('detects a tiny route overlay point while the real anchor is still far away', () => {
    expect(isRouteOverlayMicroTarget(
      { x: 0, y: 0, z: 0 },
      { x: 1.2, y: 0, z: 0 },
      { x: 80, y: 0, z: 0 },
    )).toBe(true);
  });

  it('keeps legitimate close anchors from being treated as exhausted route points', () => {
    expect(isRouteOverlayMicroTarget(
      { x: 0, y: 0, z: 0 },
      { x: 1.2, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    )).toBe(false);
  });

  it('detects an exhausted route so movement does not fall back to a far aim target', () => {
    expect(isRoutePathExhausted([{ x: 0, z: 0 }, { x: 10, z: 0 }], 2)).toBe(true);
    expect(isRoutePathExhausted([{ x: 0, z: 0 }, { x: 10, z: 0 }], 1)).toBe(false);
    expect(isRoutePathExhausted([], 0)).toBe(false);
  });

  it('continues briefly along the last valid route direction while replanning an exhausted path', () => {
    const point = computeRouteContinuationPoint(
      { x: 10, y: 4, z: 20 },
      3,
      4,
      10,
    );
    expect(point).not.toBeNull();
    expect(point.x).toBeCloseTo(16, 5);
    expect(point.y).toBeCloseTo(4, 5);
    expect(point.z).toBeCloseTo(28, 5);
  });

  it('does not synthesize a continuation from a missing route direction', () => {
    expect(computeRouteContinuationPoint({ x: 0, y: 0, z: 0 }, null, null, 8)).toBeNull();
  });

  it('falls back to the active anchor when an exhausted route has no remembered direction', () => {
    const point = computeAnchorContinuationPoint(
      { x: 10, y: 4, z: 20 },
      { x: 10, y: 0, z: 60 },
      8,
    );
    expect(point).not.toBeNull();
    expect(point.x).toBeCloseTo(10, 5);
    expect(point.y).toBeCloseTo(4, 5);
    expect(point.z).toBeCloseTo(28, 5);
  });

  it('does not synthesize an anchor continuation without an anchor', () => {
    expect(computeAnchorContinuationPoint({ x: 0, y: 0, z: 0 }, null, 8)).toBeNull();
  });

  it('walks instead of sprinting while following a route overlay', () => {
    const intent = {
      ...createIdleBotIntent(),
      moveForward: 1,
      sprint: true,
    };
    applyRouteOverlayRecovery(intent, { x: 0, y: 2, z: -20 }, 0);
    expect(intent.sprint).toBe(false);
    expect(intent.moveStrafe).toBe(0);
  });

  it('adds a small alternating strafe after the route has been stuck', () => {
    const intent = {
      ...createIdleBotIntent(),
      moveForward: 1,
      sprint: true,
    };
    applyRouteOverlayRecovery(intent, { x: 0, y: 2, z: -20 }, 2500);
    expect(intent.sprint).toBe(false);
    expect(Math.abs(intent.moveStrafe)).toBeGreaterThan(0.1);
    expect(Math.abs(intent.moveStrafe)).toBeLessThanOrEqual(1);
  });

  it('does not disturb combat fire aim/movement while firing', () => {
    const intent = {
      ...createIdleBotIntent(),
      moveForward: 1,
      sprint: true,
      firePrimary: true,
    };
    applyRouteOverlayRecovery(intent, { x: 0, y: 2, z: -20 }, 5000);
    expect(intent.sprint).toBe(true);
    expect(intent.moveStrafe).toBe(0);
  });
});

describe('PlayerBot driver mirror — stuck telemetry', () => {
  it('tracks stuck progress only while movement is being requested', () => {
    expect(shouldTrackHarnessStuckProgress({
      ...createIdleBotIntent(),
      moveForward: 1,
    })).toBe(true);
    expect(shouldTrackHarnessStuckProgress({
      ...createIdleBotIntent(),
      moveStrafe: -0.5,
    })).toBe(true);
  });

  it('does not count close-combat hold/fire as harness movement stuck time', () => {
    expect(shouldTrackHarnessStuckProgress({
      ...createIdleBotIntent(),
      firePrimary: true,
    })).toBe(false);
    expect(shouldTrackHarnessStuckProgress(createIdleBotIntent())).toBe(false);
  });
});

// ── bot-pathing-pit-and-steep-uphill: waypoint/replan/pit-trap heuristics. ──
//
// Behavior tests, not implementation-mirror. The numeric defaults (4m
// horizontal, 2.5m vertical, etc.) are tuning constants that may move; the
// tests pin the BEHAVIORS the brief specifies:
//   - waypoint advance must require both horizontal AND vertical proximity
//     so a steep-uphill waypoint is not falsely "passed" mid-climb
//   - the 750ms fast re-plan must NOT fire while the bot is still climbing
//     to a waypoint above it (the path is fine; the bot just needs time)
//   - a "pit trap" (long stuck + next waypoint above) must be detected so
//     the driver can invalidate and re-plan instead of looping in the pit

describe('shouldAdvanceWaypoint — 3D proximity (steep-uphill regression)', () => {
  it('advances when player is at the same altitude and within horizontal tolerance', () => {
    const advanced = shouldAdvanceWaypoint({
      playerPos: { x: 0, y: 10, z: 0 },
      waypoint: { x: 1, y: 10, z: 1 },
    });
    expect(advanced).toBe(true);
  });

  it('does NOT advance when waypoint is horizontally close but vertically still above', () => {
    // Steep uphill bug shape: bot is 2m below the waypoint with horizontal
    // distance 1m. Old horizontal-only rule advanced; new rule must not.
    const advanced = shouldAdvanceWaypoint({
      playerPos: { x: 0, y: 0, z: 0 },
      waypoint: { x: 0, y: 8, z: 1 },
    });
    expect(advanced).toBe(false);
  });

  it('does NOT advance when player is too far horizontally even on flat ground', () => {
    const advanced = shouldAdvanceWaypoint({
      playerPos: { x: 0, y: 0, z: 0 },
      waypoint: { x: 20, y: 0, z: 0 },
    });
    expect(advanced).toBe(false);
  });

  it('treats a waypoint without a y as planar (advances on horizontal alone)', () => {
    // Backward compat: navmesh queries that drop y still produce a usable
    // path. Don't deadlock the bot when y is missing.
    const advanced = shouldAdvanceWaypoint({
      playerPos: { x: 0, y: 0, z: 0 },
      waypoint: { x: 1, z: 1 },
    });
    expect(advanced).toBe(true);
  });

  it('refuses to advance with missing player or waypoint inputs', () => {
    expect(shouldAdvanceWaypoint({ playerPos: null, waypoint: { x: 0, y: 0, z: 0 } })).toBe(false);
    expect(shouldAdvanceWaypoint({ playerPos: { x: 0, y: 0, z: 0 }, waypoint: null })).toBe(false);
  });
});

describe('isSteepClimbWaypoint — detects mid-climb state', () => {
  it('flags a nearby waypoint that is meaningfully above the bot', () => {
    expect(isSteepClimbWaypoint({
      playerPos: { x: 0, y: 0, z: 0 },
      waypoint: { x: 0, y: 6, z: 4 },
    })).toBe(true);
  });

  it('does NOT flag a waypoint at the same altitude', () => {
    expect(isSteepClimbWaypoint({
      playerPos: { x: 0, y: 0, z: 0 },
      waypoint: { x: 0, y: 0, z: 4 },
    })).toBe(false);
  });

  it('does NOT flag a far-away waypoint even when much higher', () => {
    // Beyond ~12m horizontal the slope is averaged out; this isn't a
    // "still climbing right now" situation, it's just a distant goal.
    expect(isSteepClimbWaypoint({
      playerPos: { x: 0, y: 0, z: 0 },
      waypoint: { x: 0, y: 30, z: 50 },
    })).toBe(false);
  });

  it('does NOT flag a waypoint that is below the bot (downhill)', () => {
    expect(isSteepClimbWaypoint({
      playerPos: { x: 0, y: 10, z: 0 },
      waypoint: { x: 0, y: 0, z: 4 },
    })).toBe(false);
  });
});

describe('shouldFastReplan — over-pathing dampener', () => {
  it('fires a fast re-plan when the path is exhausted and we are not climbing', () => {
    expect(shouldFastReplan({
      pathExhausted: true,
      sinceReplanMs: 1000,
      steepClimbActive: false,
    })).toBe(true);
  });

  it('does NOT fire a fast re-plan while the bot is still climbing to a high waypoint', () => {
    // Brief: "Dampen re-plan cadence on steep climbs". This is the core
    // over-pathing fix — the path is still valid; the bot just needs time.
    expect(shouldFastReplan({
      pathExhausted: true,
      sinceReplanMs: 1000,
      steepClimbActive: true,
    })).toBe(false);
  });

  it('does NOT fire a fast re-plan when the path is still active', () => {
    expect(shouldFastReplan({
      pathExhausted: false,
      sinceReplanMs: 1000,
      steepClimbActive: false,
    })).toBe(false);
  });

  it('does NOT fire a fast re-plan inside the cooldown window', () => {
    // The cooldown prevents queryPath thrash; this is the same invariant
    // the prior fast-path enforced.
    expect(shouldFastReplan({
      pathExhausted: true,
      sinceReplanMs: 100, // way under the 750ms cooldown
      steepClimbActive: false,
    })).toBe(false);
  });
});

describe('detectPitTrap — pit-floor escape', () => {
  it('flags a stuck bot whose next waypoint is meaningfully above', () => {
    // Brief: "if the current nav path goes 'up and out' (vertical delta > 3m
    // over the next waypoint), trigger the stuck-recovery teleport earlier".
    expect(detectPitTrap({
      stuckMs: 5000,
      playerPos: { x: 0, y: 0, z: 0 },
      currentWaypoint: { x: 1, y: 10, z: 1 },
    })).toBe(true);
  });

  it('does NOT flag a bot that is stuck against a wall (waypoint at same altitude)', () => {
    // True pit signature is "up and out". Stuck against geometry at the
    // same altitude is a different bug; pit-escape is not the right fix.
    expect(detectPitTrap({
      stuckMs: 5000,
      playerPos: { x: 0, y: 5, z: 0 },
      currentWaypoint: { x: 1, y: 5, z: 1 },
    })).toBe(false);
  });

  it('does NOT flag short stuck windows', () => {
    expect(detectPitTrap({
      stuckMs: 500,
      playerPos: { x: 0, y: 0, z: 0 },
      currentWaypoint: { x: 1, y: 10, z: 1 },
    })).toBe(false);
  });

  it('flags a long-stuck bot with no active waypoint (defensive default)', () => {
    // No path → caller can choose to escape. The predicate stays observational.
    expect(detectPitTrap({
      stuckMs: 5000,
      playerPos: { x: 0, y: 0, z: 0 },
      currentWaypoint: null,
    })).toBe(true);
  });
});

describe('shouldSkipStuckWaypoint — terrain pinch recovery', () => {
  it('skips a waypoint when route-following is stuck long enough and another waypoint exists', () => {
    expect(shouldSkipStuckWaypoint({
      stuckMs: 5000,
      path: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
      waypointIdx: 0,
    })).toBe(true);
  });

  it('does not skip the final waypoint', () => {
    expect(shouldSkipStuckWaypoint({
      stuckMs: 5000,
      path: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
      waypointIdx: 1,
    })).toBe(false);
  });

  it('does not skip during short stuck windows', () => {
    expect(shouldSkipStuckWaypoint({
      stuckMs: 1000,
      path: [{ x: 0, z: 0 }, { x: 10, z: 0 }],
      waypointIdx: 0,
    })).toBe(false);
  });
});

describe('route objective-progress recovery', () => {
  it('invalidates the current route when the objective target moves materially', () => {
    expect(hasRouteTargetMoved({
      lastTarget: { x: 0, z: 0 },
      nextTarget: { x: 30, z: 0 },
      threshold: 24,
    })).toBe(true);
  });

  it('keeps a route when target motion is within the replan tolerance', () => {
    expect(hasRouteTargetMoved({
      lastTarget: { x: 0, z: 0 },
      nextTarget: { x: 12, z: 0 },
      threshold: 24,
    })).toBe(false);
  });

  it('requests a route reset when the player travels but does not close objective distance', () => {
    expect(shouldResetRouteForNoProgress({
      baselineDistance: 1000,
      currentDistance: 997,
      elapsedMs: 7000,
      playerMoved: 80,
    })).toBe(true);
  });

  it('requests a route reset when closure is too inefficient for the distance traveled', () => {
    expect(shouldResetRouteForNoProgress({
      baselineDistance: 1000,
      currentDistance: 991,
      elapsedMs: 7000,
      playerMoved: 80,
    })).toBe(true);
  });

  it('does not reset a route while objective distance is improving', () => {
    expect(shouldResetRouteForNoProgress({
      baselineDistance: 1000,
      currentDistance: 980,
      elapsedMs: 7000,
      playerMoved: 80,
    })).toBe(false);
  });

  it('temporarily blocks a target that caused route no-progress', () => {
    const blocked = Object.create(null);
    expect(markTargetTemporarilyBlocked(blocked, 'enemy_7', 1000, 5000)).toBe(true);
    expect(isTargetTemporarilyBlocked('enemy_7', blocked, 5999)).toBe(true);
    expect(isTargetTemporarilyBlocked('enemy_7', blocked, 6000)).toBe(false);
  });

  it('uses direct combat fallback when a current target endpoint will not snap onto navmesh', () => {
    expect(shouldUseDirectCombatRouteFallback({
      targetKind: 'current_target',
      failureReason: 'end_snap_failed',
      targetDistance: 180,
      maxDistance: 700,
    })).toBe(true);
  });

  it('keeps zone routing failures as real route failures', () => {
    expect(shouldUseDirectCombatRouteFallback({
      targetKind: 'zone',
      failureReason: 'end_snap_failed',
      targetDistance: 180,
      maxDistance: 700,
    })).toBe(false);
  });

  it('does not direct-fallback combat targets outside the allowed pursuit band', () => {
    expect(shouldUseDirectCombatRouteFallback({
      targetKind: 'current_target',
      failureReason: 'end_snap_failed',
      targetDistance: 900,
      maxDistance: 700,
    })).toBe(false);
  });

  it('builds a direct combat fallback path from the player to the target', () => {
    const path = createDirectCombatFallbackPath(
      { x: 10, y: 4, z: 20 },
      { x: 70, y: 8, z: -10 },
    );
    expect(path).toEqual([
      { x: 10, y: 4, z: 20 },
      { x: 70, y: 8, z: -10 },
    ]);
  });

  it('does not let a far perceived target steal zone-objective routing', () => {
    const config = botConfigForProfile(profileForMode('zone_control'));
    const target = makeBotTarget({ position: { x: 0, y: 0, z: -500 } });
    expect(shouldUseTargetForCurrentObjective({
      target,
      currentTarget: null,
      objective: { kind: 'zone', position: { x: 100, y: 0, z: 0 }, priority: 1 },
      playerPos: { x: 0, y: PLAYER_EYE_HEIGHT, z: 0 },
      botState: 'PATROL',
      acquisitionDistance: config.targetAcquisitionDistance,
      maxFireDistance: config.maxFireDistance,
      canSeeTarget: () => true,
    })).toBe(false);
  });

  it('allows a close visible target to interrupt objective routing', () => {
    const config = botConfigForProfile(profileForMode('zone_control'));
    const target = makeBotTarget({ position: { x: 0, y: 0, z: -30 } });
    expect(shouldUseTargetForCurrentObjective({
      target,
      currentTarget: null,
      objective: { kind: 'zone', position: { x: 100, y: 0, z: 0 }, priority: 1 },
      playerPos: { x: 0, y: PLAYER_EYE_HEIGHT, z: 0 },
      botState: 'PATROL',
      acquisitionDistance: config.targetAcquisitionDistance,
      maxFireDistance: config.maxFireDistance,
      canSeeTarget: () => true,
    })).toBe(true);
  });

  it('keeps an active close target through brief LOS flicker', () => {
    const config = botConfigForProfile(profileForMode('zone_control'));
    const target = makeBotTarget({
      id: 'locked_target',
      position: { x: 0, y: 0, z: -30 },
    });
    expect(shouldUseTargetForCurrentObjective({
      target,
      currentTarget: target,
      objective: { kind: 'zone', position: { x: 100, y: 0, z: 0 }, priority: 1 },
      playerPos: { x: 0, y: PLAYER_EYE_HEIGHT, z: 0 },
      botState: 'ENGAGE',
      acquisitionDistance: config.targetAcquisitionDistance,
      maxFireDistance: config.maxFireDistance,
      canSeeTarget: () => false,
    })).toBe(true);
  });
});

// ── harness-lifecycle-halt-on-match-end: terminal MATCH_ENDED state. ────────
//
// Brief: when the engine reports match-end, the harness driver must transition
// the bot into a terminal MATCH_ENDED state that emits zero movement / fire /
// aim intent, and the perf-capture loop must finalize ~2s after the first
// observation rather than continuing into the victory screen. These tests
// cover the pure pieces; the wiring is verified by the live capture.

describe('PlayerBot driver mirror — match-end detection', () => {
  it('treats phase=ENDED as match-ended', () => {
    expect(detectMatchEnded({ phase: 'ENDED', gameActive: false })).toBe(true);
  });

  it('treats gameActive=false as match-ended even without ENDED phase', () => {
    // Defensive: the engine may flip gameActive before the next phase tick.
    expect(detectMatchEnded({ phase: 'COMBAT', gameActive: false })).toBe(true);
  });

  it('does not treat live phases as match-ended', () => {
    expect(detectMatchEnded({ phase: 'COMBAT', gameActive: true })).toBe(false);
    expect(detectMatchEnded({ phase: 'OVERTIME', gameActive: true })).toBe(false);
    expect(detectMatchEnded({ phase: 'SETUP', gameActive: true })).toBe(false);
  });

  it('returns false for null/missing game state (engine not yet up)', () => {
    expect(detectMatchEnded(null)).toBe(false);
    expect(detectMatchEnded(undefined)).toBe(false);
  });

  // harness-match-end-skip-ai-sandbox: TicketSystem reports phase='ENDED'
  // from the first tick in ai_sandbox (no tickets, no objective). The driver
  // must skip the latch in that mode; win-condition modes still exit.
  it('does NOT latch match-end on ai_sandbox regardless of phase/gameActive', () => {
    expect(detectMatchEnded({ phase: 'ENDED', gameActive: false }, 'ai_sandbox')).toBe(false);
    expect(detectMatchEnded({ phase: 'COMBAT', gameActive: false }, 'ai_sandbox')).toBe(false);
    // Case-insensitive: driver lowercases opts.mode, belt-and-braces for callers.
    expect(detectMatchEnded({ phase: 'ENDED', gameActive: false }, 'AI_SANDBOX')).toBe(false);
    // Outcome helper must follow suit so the capture never surfaces an outcome.
    expect(detectMatchOutcome({ phase: 'ENDED', gameActive: false, winner: 'US' }, 'ai_sandbox')).toBeNull();
  });

  it('still latches match-end for win-condition modes at the right phase', () => {
    expect(detectMatchEnded({ phase: 'ENDED', gameActive: false, winner: 'US' }, 'open_frontier')).toBe(true);
    expect(detectMatchEnded({ phase: 'COMBAT', gameActive: false }, 'team_deathmatch')).toBe(true);
    expect(detectMatchEnded({ phase: 'SETUP', gameActive: true }, 'zone_control')).toBe(false);
  });
});

describe('PlayerBot driver mirror — match outcome mapping', () => {
  it('maps a BLUFOR winner to victory (player plays BLUFOR)', () => {
    expect(detectMatchOutcome({ phase: 'ENDED', gameActive: false, winner: 'US' })).toBe('victory');
    expect(detectMatchOutcome({ phase: 'ENDED', gameActive: false, winner: 'ARVN' })).toBe('victory');
  });

  it('maps an OPFOR winner to defeat', () => {
    expect(detectMatchOutcome({ phase: 'ENDED', gameActive: false, winner: 'NVA' })).toBe('defeat');
    expect(detectMatchOutcome({ phase: 'ENDED', gameActive: false, winner: 'VC' })).toBe('defeat');
  });

  it('maps no-winner / time-limit ties to draw', () => {
    expect(detectMatchOutcome({ phase: 'ENDED', gameActive: false })).toBe('draw');
    expect(detectMatchOutcome({ phase: 'ENDED', gameActive: false, winner: undefined })).toBe('draw');
  });

  it('returns null when the match is still live', () => {
    expect(detectMatchOutcome({ phase: 'COMBAT', gameActive: true })).toBeNull();
  });
});

describe('PlayerBot driver mirror — MATCH_ENDED terminal state', () => {
  it('transitions to MATCH_ENDED from any live state when ctx.matchEnded is true', () => {
    const states = ['PATROL', 'ALERT', 'ENGAGE', 'ADVANCE', 'RESPAWN_WAIT'];
    for (const s of states) {
      const step = stepBotState(s, makeBotCtx({ matchEnded: true }));
      expect(step.nextState).toBe('MATCH_ENDED');
    }
  });

  it('overrides RESPAWN_WAIT — match-end takes precedence over zero health', () => {
    // Player can die on the same frame as the victory trigger; bot must still
    // surrender control rather than try to respawn into a finished match.
    const step = stepBotState('PATROL', makeBotCtx({ matchEnded: true, health: 0 }));
    expect(step.nextState).toBe('MATCH_ENDED');
  });

  it('emits zero movement, no fire, and a null aim target while terminal', () => {
    // Even with a juicy enemy in front of us, the terminal state must not act.
    const step = stepBotState('MATCH_ENDED', makeBotCtx({
      matchEnded: true,
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -10 } }),
      findNearestEnemy: () => makeBotTarget(),
      canSeeTarget: () => true,
    }));
    expect(step.nextState).toBeNull();
    expect(step.intent.moveForward).toBe(0);
    expect(step.intent.moveStrafe).toBe(0);
    expect(step.intent.firePrimary).toBe(false);
    expect(step.intent.reload).toBe(false);
    expect(step.intent.aimTarget).toBeNull();
  });
});

describe('perf-capture lifecycle — early finalize after match end', () => {
  it('does not finalize while the match is still live (no observation yet)', () => {
    expect(shouldFinalizeAfterMatchEnd(null, 30_000)).toBe(false);
    expect(shouldFinalizeAfterMatchEnd(undefined, 30_000)).toBe(false);
  });

  it('does not finalize before the tail window elapses', () => {
    // Match ended at t=30_000ms; "now" is 1s later → still inside the 2s tail.
    expect(shouldFinalizeAfterMatchEnd(30_000, 31_000)).toBe(false);
  });

  it('finalizes at exactly MATCH_END_TAIL_MS past observation', () => {
    // This is the brief's regression scenario — match-end at t=30s on a 90s
    // capture must finalize at ~32s, well before the configured duration.
    expect(shouldFinalizeAfterMatchEnd(30_000, 30_000 + MATCH_END_TAIL_MS)).toBe(true);
    // With the default tail of 2s, the early-exit ETA on a 90s capture is 32s.
    expect(MATCH_END_TAIL_MS).toBe(2000);
  });

  it('keeps finalizing as long as we are past the tail window', () => {
    expect(shouldFinalizeAfterMatchEnd(30_000, 90_000)).toBe(true);
  });

  it('honours an override tail when provided', () => {
    // Caller may want a longer flush window. Make sure the helper respects it
    // rather than falling back to the constant.
    expect(shouldFinalizeAfterMatchEnd(30_000, 31_500, 5_000)).toBe(false);
    expect(shouldFinalizeAfterMatchEnd(30_000, 35_500, 5_000)).toBe(true);
  });

  it('rejects non-finite inputs without crashing', () => {
    expect(shouldFinalizeAfterMatchEnd(Number.NaN, 1000)).toBe(false);
    expect(shouldFinalizeAfterMatchEnd(0, Number.NaN)).toBe(false);
  });
});

// ── harness-stats-accuracy-damage-wiring: behavior tests for the
// combat-stat rollup helpers used by the active driver.

describe('harness combat stats — damageTakenDelta', () => {
  it('reports zero when health is unchanged', () => {
    expect(damageTakenDelta(100, 100)).toBe(0);
  });

  it('reports the drop when health decreases', () => {
    expect(damageTakenDelta(100, 73)).toBe(27);
  });

  it('does not count regen / respawn (health going up)', () => {
    expect(damageTakenDelta(20, 100)).toBe(0);
  });

  it('is safe against NaN inputs', () => {
    expect(damageTakenDelta(NaN, 50)).toBe(0);
    expect(damageTakenDelta(100, NaN)).toBe(0);
  });
});

describe('harness combat stats — computeAccuracy', () => {
  it('returns hits/shots when both are positive', () => {
    expect(computeAccuracy(100, 25)).toBeCloseTo(0.25, 5);
  });

  it('returns 0 when no shots have been fired', () => {
    expect(computeAccuracy(0, 0)).toBe(0);
  });

  it('clamps to [0, 1] when hits exceed shots (impossible but defensive)', () => {
    expect(computeAccuracy(10, 50)).toBeLessThanOrEqual(1);
    expect(computeAccuracy(10, 50)).toBeGreaterThanOrEqual(0);
  });

  it('handles negative or NaN inputs as zero', () => {
    expect(computeAccuracy(-5, 1)).toBe(0);
    expect(computeAccuracy(10, -1)).toBe(0);
    expect(computeAccuracy(NaN, 1)).toBe(0);
  });
});

describe('harness combat stats — rebasedTotal (handles in-engine reset)', () => {
  // Behaviour we care about: the run total grows monotonically across
  // a sequence of polled snapshots, even if the in-engine counter is
  // reset mid-run (e.g. PlayerStatsTracker re-baselines on respawn).
  // The test simulates a sequence of polls; we assert end-state, not
  // any intermediate field shape.

  it('starts at zero before any poll', () => {
    expect(deltaSinceBaseline(0, null)).toBe(0);
  });

  it('grows as the polled value rises above the baseline', () => {
    // Baseline=0, poll1=5 -> total=5
    let { total, newBaseline } = rebasedTotal(0, 5, 0);
    expect(total).toBe(5);
    // poll2=12 -> total=12
    ({ total, newBaseline } = rebasedTotal(total, 12, newBaseline));
    expect(total).toBe(12);
  });

  it('does not double-count when the polled value plateaus', () => {
    let { total, newBaseline } = rebasedTotal(0, 8, 0);
    expect(total).toBe(8);
    ({ total, newBaseline } = rebasedTotal(total, 8, newBaseline));
    expect(total).toBe(8);
  });

  it('preserves accumulated total when the in-engine counter is reset', () => {
    // Bot deals 25 damage, in-engine tracker resets (respawn), then
    // bot deals 10 more. Total should be 25 + 10 = 35, not 10.
    let { total, newBaseline } = rebasedTotal(0, 25, 0);
    expect(total).toBe(25);
    // PlayerStatsTracker.reset() — polled value drops to 0.
    ({ total, newBaseline } = rebasedTotal(total, 0, newBaseline));
    expect(total).toBe(25);
    // After a couple ticks the polled value rises again.
    ({ total, newBaseline } = rebasedTotal(total, 4, newBaseline));
    expect(total).toBe(29);
    ({ total, newBaseline } = rebasedTotal(total, 10, newBaseline));
    expect(total).toBe(35);
  });

  it('survives a NaN poll without losing prior total', () => {
    let { total, newBaseline } = rebasedTotal(0, 12, 0);
    expect(total).toBe(12);
    const result = rebasedTotal(total, NaN, newBaseline);
    expect(result.total).toBe(12);
  });
});

describe('harness combat stats — driver stop-stats surface (regression guard)', () => {
  // Brief: summary.json must be able to surface kills, damage dealt,
  // damage taken, accuracy, and the state histogram. The driver
  // exposes these as fields on the stop() return shape; this guard
  // makes sure their names don't drift without an intentional update
  // to the perf-capture summary writer.
  it('module exports the four combat-stat helpers used by the driver', () => {
    expect(typeof deltaSinceBaseline).toBe('function');
    expect(typeof rebasedTotal).toBe('function');
    expect(typeof damageTakenDelta).toBe('function');
    expect(typeof computeAccuracy).toBe('function');
  });
});

// ── harness-ashau-objective-cycling-fix: objective zone picker. ─────────────
//
// Behavior: the bot must not cycle back to a zone it already captured.
// The bug shape (playtest 2026-04-20, ashau mode) was a nearby friendly-
// owned zone beating a distant enemy zone on score = priority * weight +
// distSq, because distSq dominates on 20km maps. The selector now hard-
// skips friendly-owned non-contested zones; if nothing else is available,
// it returns null and the caller falls back to the engagement center.

describe('harness objective selector — pickObjectiveZone', () => {
  const isBlufor = (f) => f === 'US' || f === 'ARVN';

  it('skips a zone the bot already captured even when it is the closest', () => {
    // Ashau shape: captured zone at 100m, enemy zone 10km out. Old scoring
    // picked the captured one; new rule excludes it entirely.
    const captured = {
      id: 'hill_937',
      position: { x: 100, z: 0 },
      owner: 'US',
      state: 'blufor_controlled',
      isHomeBase: false,
    };
    const enemy = {
      id: 'dmz_bunker',
      position: { x: 10000, z: 0 },
      owner: 'NVA',
      state: 'opfor_controlled',
      isHomeBase: false,
    };
    const choice = pickObjectiveZone({
      zones: [captured, enemy],
      playerPos: { x: 0, z: 0 },
      isFriendly: isBlufor,
    });
    expect(choice).not.toBeNull();
    expect(choice.id).toBe('dmz_bunker');
  });

  it('still targets a friendly zone when enemies are actively contesting it', () => {
    // Defense case: a friendly zone flipping to contested is actionable.
    // The bot should push back to defend.
    const defended = {
      id: 'lz_eagle',
      position: { x: 50, z: 0 },
      owner: 'US',
      state: 'contested',
      isHomeBase: false,
    };
    const enemy = {
      id: 'dmz_bunker',
      position: { x: 500, z: 0 },
      owner: 'NVA',
      state: 'opfor_controlled',
      isHomeBase: false,
    };
    const choice = pickObjectiveZone({
      zones: [defended, enemy],
      playerPos: { x: 0, z: 0 },
      isFriendly: isBlufor,
    });
    expect(choice).not.toBeNull();
    expect(choice.id).toBe('lz_eagle');
  });

  it('returns null when every zone is friendly-owned and uncontested', () => {
    // All objectives captured — caller must fall back (engagement center).
    const zones = [
      { id: 'a', position: { x: 100, z: 0 }, owner: 'US', state: 'blufor_controlled', isHomeBase: false },
      { id: 'b', position: { x: 0, z: 100 }, owner: 'ARVN', state: 'blufor_controlled', isHomeBase: false },
    ];
    const choice = pickObjectiveZone({
      zones: zones,
      playerPos: { x: 0, z: 0 },
      isFriendly: isBlufor,
    });
    expect(choice).toBeNull();
  });

  it('skips home-base zones even if they are technically enemy-owned', () => {
    // Home bases are never objectives. The bot should not try to assault
    // the enemy spawn.
    const zones = [
      { id: 'enemy_home', position: { x: 100, z: 0 }, owner: 'NVA', state: 'opfor_controlled', isHomeBase: true },
      { id: 'ob', position: { x: 500, z: 0 }, owner: null, state: 'neutral', isHomeBase: false },
    ];
    const choice = pickObjectiveZone({
      zones: zones,
      playerPos: { x: 0, z: 0 },
      isFriendly: isBlufor,
    });
    expect(choice).not.toBeNull();
    expect(choice.id).toBe('ob');
  });

  it('prefers the nearest actionable zone when priorities tie', () => {
    const near = { id: 'near', position: { x: 50, z: 0 }, owner: 'NVA', state: 'opfor_controlled', isHomeBase: false };
    const far = { id: 'far', position: { x: 2000, z: 0 }, owner: null, state: 'neutral', isHomeBase: false };
    const choice = pickObjectiveZone({
      zones: [far, near],
      playerPos: { x: 0, z: 0 },
      isFriendly: isBlufor,
    });
    expect(choice.id).toBe('near');
  });

  it('prefers contested over uncontested even at longer distance', () => {
    // Contested is priority 0; unowned is priority 1. A contested zone 1km
    // away should beat a neutral zone 50m away.
    const contestedFar = { id: 'contested', position: { x: 1000, z: 0 }, owner: 'US', state: 'contested', isHomeBase: false };
    const neutralNear = { id: 'neutral', position: { x: 50, z: 0 }, owner: null, state: 'neutral', isHomeBase: false };
    const choice = pickObjectiveZone({
      zones: [neutralNear, contestedFar],
      playerPos: { x: 0, z: 0 },
      isFriendly: isBlufor,
    });
    expect(choice.id).toBe('contested');
  });

  it('is safe against missing or malformed inputs', () => {
    expect(pickObjectiveZone({})).toBeNull();
    expect(pickObjectiveZone({ zones: [], playerPos: { x: 0, z: 0 } })).toBeNull();
    expect(pickObjectiveZone({ zones: null, playerPos: { x: 0, z: 0 } })).toBeNull();
    expect(pickObjectiveZone({ zones: [{}], playerPos: { x: 0, z: 0 } })).toBeNull();
    // Non-finite player position — no crash, no pick.
    expect(pickObjectiveZone({
      zones: [{ id: 'a', position: { x: 10, z: 0 }, owner: null, state: 'neutral', isHomeBase: false }],
      playerPos: { x: Number.NaN, z: 0 },
      isFriendly: isBlufor,
    })).toBeNull();
  });

  it('re-selects a fresh zone once the previous pick becomes friendly-owned (capture-then-reselect)', () => {
    // Regression scenario from the brief: bot captures a zone (it flips to
    // blufor_controlled). On the NEXT selector tick the same zone must not
    // be returned — the bot must pick a different, still-enemy zone.
    const zoneA = {
      id: 'hill_937',
      position: { x: 100, z: 0 },
      owner: null,
      state: 'neutral',
      isHomeBase: false,
    };
    const zoneB = {
      id: 'dmz_bunker',
      position: { x: 5000, z: 0 },
      owner: 'NVA',
      state: 'opfor_controlled',
      isHomeBase: false,
    };
    const firstPick = pickObjectiveZone({
      zones: [zoneA, zoneB],
      playerPos: { x: 0, z: 0 },
      isFriendly: isBlufor,
    });
    expect(firstPick.id).toBe('hill_937');
    // Simulate capture: zoneA now blufor-owned, bot standing on it.
    zoneA.owner = 'US';
    zoneA.state = 'blufor_controlled';
    const secondPick = pickObjectiveZone({
      zones: [zoneA, zoneB],
      playerPos: { x: 100, z: 0 },
      isFriendly: isBlufor,
    });
    expect(secondPick).not.toBeNull();
    expect(secondPick.id).toBe('dmz_bunker');
  });
});

describe('harness objective selector — selectPatrolObjective', () => {
  const combatObjective = {
    kind: 'nearest_opfor',
    position: { x: 900, y: 0, z: 100 },
    priority: 3,
  };
  const zoneObjective = {
    kind: 'zone',
    position: { x: 100, y: 0, z: 0 },
    priority: 1,
  };
  const fallbackObjective = {
    kind: 'engagement_center',
    position: { x: 500, y: 0, z: 0 },
    priority: 1,
  };

  it('prefers the combat-front objective in aggressive large-map profiles', () => {
    const choice = selectPatrolObjective({
      aggressiveMode: true,
      combatObjective,
      zoneObjective,
      fallbackObjective,
      combatObjectiveMaxDistance: 1000,
    });
    expect(choice).toBe(combatObjective);
  });

  it('returns to zone routing when the aggressive combat objective is too far', () => {
    const choice = selectPatrolObjective({
      aggressiveMode: true,
      combatObjective: {
        ...combatObjective,
        distance: 450,
      },
      zoneObjective,
      fallbackObjective,
      combatObjectiveMaxDistance: 185,
    });
    expect(choice).toBe(zoneObjective);
  });

  it('keeps zone-first routing for non-aggressive objective modes', () => {
    const choice = selectPatrolObjective({
      aggressiveMode: false,
      combatObjective,
      zoneObjective,
      fallbackObjective,
    });
    expect(choice).toBe(zoneObjective);
  });

  it('falls back to the engagement center when no zone or combat target exists', () => {
    const choice = selectPatrolObjective({
      aggressiveMode: true,
      combatObjective: null,
      zoneObjective: null,
      fallbackObjective,
    });
    expect(choice).toBe(fallbackObjective);
  });
});

describe('harness objective telemetry identity', () => {
  it('keys zone objectives by zone id', () => {
    expect(objectiveTelemetryKey({
      kind: 'zone',
      position: { x: 100, y: 0, z: 200 },
    }, 'zone_bridge_north')).toBe('zone:zone_bridge_north');
  });

  it('keys combat objectives by target id', () => {
    expect(objectiveTelemetryKey({
      id: 'enemy_7',
      kind: 'nearest_opfor',
      position: { x: 20, y: 0, z: 30 },
    }, null)).toBe('nearest_opfor:enemy_7');
  });

  it('falls back to objective kind when no stable id exists', () => {
    expect(objectiveTelemetryKey({
      kind: 'engagement_center',
      position: { x: 0, y: 0, z: 0 },
    }, null)).toBe('engagement_center');
  });

  it('returns null for missing objectives', () => {
    expect(objectiveTelemetryKey(null, null)).toBeNull();
  });
});
