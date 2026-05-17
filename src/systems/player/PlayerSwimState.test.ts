import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  PlayerSwimState,
  BREATH_CAPACITY_SECONDS,
  type SwimUpdateContext,
  type WaterSampler,
} from './PlayerSwimState';
import type {
  WaterInteractionOptions,
  WaterInteractionSample,
} from '../environment/water/WaterSurfaceSampler';

/**
 * Behavior tests for the player swim/wade/walk state machine.
 *
 * These cover the gameplay contract the PR brief enumerates:
 *   (a) swim entry on submerge
 *   (b) swim exit on surface
 *   (c) breath timer drain + gasp at capacity (45s baseline)
 *   (d) HUD-driven breath snapshot stays consistent with the timer
 *   (e) stamina drain while swimming + regen while walking
 *   (f) 3D swim velocity from WASD/Space/Ctrl input
 *
 * No tuning constants are asserted — only behavior the player can feel.
 */

class StubWaterSampler implements WaterSampler {
  private nextSample: WaterInteractionSample;

  constructor(sample: WaterInteractionSample) {
    this.nextSample = sample;
  }

  setSample(sample: WaterInteractionSample): void {
    this.nextSample = sample;
  }

  setSubmerged(submerged: boolean, depth = submerged ? 1.6 : 0): void {
    this.nextSample = {
      source: submerged ? 'global' : 'none',
      surfaceY: submerged ? 0 : null,
      depth,
      submerged,
      immersion01: submerged ? 1 : 0,
      buoyancyScalar: submerged ? 1 : 0,
    };
  }

  sampleWaterInteraction(
    _position: THREE.Vector3,
    _options?: WaterInteractionOptions,
  ): WaterInteractionSample {
    return this.nextSample;
  }
}

function makeContext(overrides: Partial<SwimUpdateContext> = {}): SwimUpdateContext {
  const camera = new THREE.PerspectiveCamera();
  // Default look forward along -Z (Three.js convention).
  camera.lookAt(0, 0, -1);
  return {
    position: overrides.position ?? new THREE.Vector3(0, 0, 0),
    headPosition: overrides.headPosition ?? new THREE.Vector3(0, 1.7, 0),
    camera: overrides.camera ?? camera,
    baseSpeed: overrides.baseSpeed ?? 5,
    input: overrides.input ?? { forward: 0, strafe: 0, ascend: false, descend: false },
    dt: overrides.dt ?? 1 / 60,
  };
}

describe('PlayerSwimState', () => {
  let swim: PlayerSwimState;
  let sampler: StubWaterSampler;

  beforeEach(() => {
    swim = new PlayerSwimState();
    sampler = new StubWaterSampler({
      source: 'none',
      surfaceY: null,
      depth: 0,
      submerged: false,
      immersion01: 0,
      buoyancyScalar: 0,
    });
  });

  describe('mode transitions', () => {
    it('starts in walk mode on dry land', () => {
      expect(swim.getMode()).toBe('walk');
    });

    it('flips to swim when the head sample reports submerged', () => {
      sampler.setSubmerged(true);
      const result = swim.tick(sampler, makeContext());
      expect(result.mode).toBe('swim');
      expect(swim.getMode()).toBe('swim');
    });

    it('returns to walk after surfacing and flags surfacedThisStep once', () => {
      sampler.setSubmerged(true);
      swim.tick(sampler, makeContext());
      expect(swim.getMode()).toBe('swim');

      sampler.setSubmerged(false);
      const surfacing = swim.tick(sampler, makeContext());
      expect(surfacing.surfacedThisStep).toBe(true);
      expect(swim.getMode()).toBe('walk');

      // Subsequent dry ticks do not keep firing the surface flag.
      const drySecond = swim.tick(sampler, makeContext());
      expect(drySecond.surfacedThisStep).toBe(false);
    });
  });

  describe('breath timer', () => {
    it('drains breath while submerged and refills above water', () => {
      sampler.setSubmerged(true);
      const ctx = makeContext({ dt: 1 });
      const before = swim.getBreath().remainingSeconds;
      swim.tick(sampler, ctx);
      const after = swim.getBreath().remainingSeconds;
      expect(after).toBeLessThan(before);

      sampler.setSubmerged(false);
      swim.tick(sampler, ctx);
      expect(swim.getBreath().remainingSeconds).toBeGreaterThan(after);
    });

    it('fires gasp trigger and reports drowning past breath capacity', () => {
      sampler.setSubmerged(true);
      // Advance well past the capacity in coarse ticks.
      const ctx = makeContext({ dt: 1 });
      for (let i = 0; i < BREATH_CAPACITY_SECONDS + 3; i++) {
        swim.tick(sampler, ctx);
      }
      expect(swim.getBreath().remainingSeconds).toBe(0);
      expect(swim.isDrowning()).toBe(true);
      expect(swim.consumeGasp()).toBe(true);
      // consumeGasp clears the latched gasp flag exactly once.
      expect(swim.consumeGasp()).toBe(false);
    });

    it('clears drowning + restores breath on resurface', () => {
      sampler.setSubmerged(true);
      for (let i = 0; i < BREATH_CAPACITY_SECONDS + 2; i++) {
        swim.tick(sampler, makeContext({ dt: 1 }));
      }
      expect(swim.isDrowning()).toBe(true);

      sampler.setSubmerged(false);
      swim.tick(sampler, makeContext({ dt: 1 }));
      // One tick above water clears the drowning latch.
      expect(swim.isDrowning()).toBe(false);
      // Many seconds above water regenerate breath toward capacity.
      for (let i = 0; i < 10; i++) {
        swim.tick(sampler, makeContext({ dt: 1 }));
      }
      expect(swim.getBreath().remainingSeconds).toBeGreaterThan(5);
    });
  });

  describe('HUD breath snapshot consistency', () => {
    it('exposes remaining + capacity so a HUD gauge can render', () => {
      const initial = swim.getBreath();
      expect(initial.capacitySeconds).toBeGreaterThan(0);
      expect(initial.remainingSeconds).toBeLessThanOrEqual(initial.capacitySeconds);
    });

    it('breath snapshot stays consistent with timer drain', () => {
      sampler.setSubmerged(true);
      const before = swim.getBreath().remainingSeconds;
      swim.tick(sampler, makeContext({ dt: 0.5 }));
      const after = swim.getBreath().remainingSeconds;
      expect(after).toBeLessThan(before);
      // Consumer (HUD) renders gauge while submerged.
      expect(swim.getMode()).toBe('swim');
    });
  });

  describe('stamina', () => {
    it('drains while swimming', () => {
      sampler.setSubmerged(true);
      const before = swim.getStamina().remaining01;
      // Run several seconds of swim ticks.
      for (let i = 0; i < 5; i++) {
        swim.tick(sampler, makeContext({ dt: 1 }));
      }
      expect(swim.getStamina().remaining01).toBeLessThan(before);
    });

    it('regens while walking on dry land', () => {
      // Drain stamina first by spending time underwater.
      sampler.setSubmerged(true);
      for (let i = 0; i < 5; i++) {
        swim.tick(sampler, makeContext({ dt: 1 }));
      }
      const drained = swim.getStamina().remaining01;
      expect(drained).toBeLessThan(1);

      // Walk on dry land for several seconds.
      sampler.setSubmerged(false);
      for (let i = 0; i < 5; i++) {
        swim.tick(sampler, makeContext({ dt: 1 }));
      }
      expect(swim.getStamina().remaining01).toBeGreaterThan(drained);
    });
  });

  describe('swim velocity (3D input)', () => {
    beforeEach(() => {
      sampler.setSubmerged(true);
      // Establish swim mode so drag scaling is in the swim regime.
      swim.tick(sampler, makeContext());
    });

    it('forward intent produces forward-axis motion in the camera plane', () => {
      const ctx = makeContext({
        input: { forward: 1, strafe: 0, ascend: false, descend: false },
        baseSpeed: 5,
      });
      const v = swim.computeSwimVelocity(ctx, new THREE.Vector3());
      // Camera looks down -Z, so forward intent gives negative Z.
      expect(v.z).toBeLessThan(0);
      // Vertical neutral when neither ascend nor descend is held.
      expect(v.y).toBeCloseTo(0, 5);
    });

    it('strafe intent produces lateral motion', () => {
      const ctx = makeContext({
        input: { forward: 0, strafe: 1, ascend: false, descend: false },
        baseSpeed: 5,
      });
      const v = swim.computeSwimVelocity(ctx, new THREE.Vector3());
      // Right of -Z forward is +X.
      expect(v.x).toBeGreaterThan(0);
    });

    it('ascend (Space) drives positive vertical velocity', () => {
      const ctx = makeContext({
        input: { forward: 0, strafe: 0, ascend: true, descend: false },
        baseSpeed: 5,
      });
      const v = swim.computeSwimVelocity(ctx, new THREE.Vector3());
      expect(v.y).toBeGreaterThan(0);
    });

    it('descend (Ctrl) drives negative vertical velocity', () => {
      const ctx = makeContext({
        input: { forward: 0, strafe: 0, ascend: false, descend: true },
        baseSpeed: 5,
      });
      const v = swim.computeSwimVelocity(ctx, new THREE.Vector3());
      expect(v.y).toBeLessThan(0);
    });

    it('ascend + descend cancel to roughly neutral vertical', () => {
      const ctx = makeContext({
        input: { forward: 0, strafe: 0, ascend: true, descend: true },
        baseSpeed: 5,
      });
      const v = swim.computeSwimVelocity(ctx, new THREE.Vector3());
      expect(Math.abs(v.y)).toBeLessThan(0.5);
    });
  });

  describe('reset', () => {
    it('clears swim state, breath, stamina, and drowning back to defaults', () => {
      sampler.setSubmerged(true);
      for (let i = 0; i < BREATH_CAPACITY_SECONDS + 2; i++) {
        swim.tick(sampler, makeContext({ dt: 1 }));
      }
      expect(swim.isDrowning()).toBe(true);

      swim.reset();
      expect(swim.getMode()).toBe('walk');
      expect(swim.getBreath().remainingSeconds).toBe(swim.getBreath().capacitySeconds);
      expect(swim.getStamina().remaining01).toBe(1);
      expect(swim.isDrowning()).toBe(false);
    });
  });
});
