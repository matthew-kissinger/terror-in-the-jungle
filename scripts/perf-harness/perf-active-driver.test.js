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
  profileForMode,
  botConfigForProfile,
  // bot-pathing-pit-and-steep-uphill exports — waypoint/replan/pit heuristics.
  shouldAdvanceWaypoint,
  isSteepClimbWaypoint,
  shouldFastReplan,
  detectPitTrap,
  // harness-lifecycle-halt-on-match-end exports.
  detectMatchEnded,
  detectMatchOutcome,
  shouldFinalizeAfterMatchEnd,
  MATCH_END_TAIL_MS,
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
    // Eye at (0, eye_h, 0); target body at (10, 0, 0) ground; aim chest at +1.2.
    const solution = computeAimSolution({
      eyeX: 0, eyeY: PLAYER_EYE_HEIGHT, eyeZ: 0,
      targetX: 10, targetY: TARGET_CHEST_HEIGHT, targetZ: 0,
      targetVx: 0, targetVy: 0, targetVz: 0,
      bulletSpeed: DEFAULT_BULLET_SPEED
    });
    // Eye above chest by PLAYER_EYE_HEIGHT - TARGET_CHEST_HEIGHT = 0.8 m.
    // Pitch should be atan2(-0.8, 10) ≈ -4.57° — slightly down at the chest.
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
    // moment LOS breaks the state machine yields ADVANCE, not ENGAGE.
    const step = stepBotState('ENGAGE', makeBotCtx({
      currentTarget: makeBotTarget(),
      canSeeTarget: () => false,
    }));
    expect(step.nextState).toBe('ADVANCE');
    expect(step.intent.firePrimary).toBe(false);
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

  it('writes an aimTarget (world-space point) — not angles', () => {
    const step = stepBotState('ENGAGE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 30, y: 0, z: 0 } }),
    }));
    expect(step.intent.aimTarget).not.toBeNull();
    expect(step.intent.aimTarget.x).toBeCloseTo(30, 5);
  });
});

describe('PlayerBot driver mirror — ADVANCE', () => {
  it('returns to ENGAGE once LOS is restored', () => {
    const step = stepBotState('ADVANCE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -30 } }),
      canSeeTarget: () => true,
    }));
    expect(step.nextState).toBe('ENGAGE');
  });

  it('keeps moving forward when target remains occluded', () => {
    const step = stepBotState('ADVANCE', makeBotCtx({
      currentTarget: makeBotTarget({ position: { x: 0, y: 0, z: -30 } }),
      canSeeTarget: () => false,
    }));
    expect(step.intent.moveForward).toBeGreaterThan(0);
    expect(step.intent.firePrimary).toBe(false);
  });

  it('falls back to PATROL when target is gone', () => {
    const step = stepBotState('ADVANCE', makeBotCtx({
      currentTarget: null,
      findNearestEnemy: () => null,
    }));
    expect(step.nextState).toBe('PATROL');
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

  it('botConfigForProfile defines a non-negative pushInDistance', () => {
    const config = botConfigForProfile(profileForMode('ai_sandbox'));
    expect(config.pushInDistance).toBeGreaterThanOrEqual(0);
  });

  it('botConfigForProfile no longer carries cover / retreat thresholds', () => {
    // Cover-seeking and retreating are gone from the harness bot.
    const config = botConfigForProfile(profileForMode('ai_sandbox'));
    expect(config.coverHealthFraction).toBeUndefined();
    expect(config.retreatHealthFraction).toBeUndefined();
    expect(config.coverSuppressionScore).toBeUndefined();
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

  it('has an aimLerpRate of 1 (snap) by default', () => {
    const intent = createIdleBotIntent();
    expect(intent.aimLerpRate).toBe(1);
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
