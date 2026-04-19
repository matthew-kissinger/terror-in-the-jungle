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
const { evaluateFireDecision, chooseHeadingByGradient } = require('../perf-active-driver.cjs');

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
