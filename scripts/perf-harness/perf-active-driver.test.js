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
  clampAimYByPitch
} = driver;

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
