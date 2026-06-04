// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import type {
  FlattenCapsuleTerrainStamp,
  FlattenCircleTerrainStamp,
  TerrainStampConfig,
} from '../TerrainFeatureTypes';
import type { HeightProviderConfig, IHeightProvider } from '../IHeightProvider';
import { detectStampConflicts } from './TerrainStampConflictDetector';
import { resolveStampPolicies } from './TerrainStampPolicyResolver';

/**
 * Behavior tests for the R2.1 stamp-policy resolver.
 *
 * Tests use synthetic stamps + a constant-height base provider so that the
 * resolver's decision logic is the only signal - no noise from the
 * procedural terrain function. Each test pins one resolver rule:
 *   - `consult` resolves against a partial composed provider
 *   - `never_above` clamps DOWN against an overlapping higher stamp below
 *   - `override` wins inside its envelope
 *   - `sample_post_compose` re-samples after lower-priority context composes
 *   - resolver is deterministic across two identical calls
 */

class ConstantHeightProvider implements IHeightProvider {
  constructor(private readonly height: number) {}
  getHeightAt(): number {
    return this.height;
  }
  getWorkerConfig(): HeightProviderConfig {
    return { type: 'noise', seed: 0 };
  }
}

function capsule(overrides: Partial<FlattenCapsuleTerrainStamp> = {}): FlattenCapsuleTerrainStamp {
  return {
    kind: 'flatten_capsule',
    startX: 0,
    startZ: 0,
    endX: 0,
    endZ: 0,
    innerRadius: 5,
    outerRadius: 8,
    gradeRadius: 12,
    gradeStrength: 0.5,
    samplingRadius: 4,
    targetHeightMode: 'center',
    heightOffset: 0,
    priority: 40,
    ...overrides,
  };
}

function circle(overrides: Partial<FlattenCircleTerrainStamp> = {}): FlattenCircleTerrainStamp {
  return {
    kind: 'flatten_circle',
    centerX: 0,
    centerZ: 0,
    innerRadius: 10,
    outerRadius: 14,
    gradeRadius: 16,
    gradeStrength: 0.5,
    samplingRadius: 8,
    targetHeightMode: 'center',
    heightOffset: 0,
    priority: 50,
    ...overrides,
  };
}

function priorities(stamps: TerrainStampConfig[]): number[] {
  return stamps.map((s) => s.priority);
}

describe('resolveStampPolicies', () => {
  it('`consult` + baked hydrology cedes its bed target to an overlapping airfield', () => {
    // Hydrology channel at priority 40, baked bedHeight at 5 m. Airfield
    // rect at priority 60 with fixedTargetHeight 30 m. The bed sits inside
    // the airfield's footprint -> bed should consult and adopt the
    // airfield's target (30 m).
    const base = new ConstantHeightProvider(0);
    const hydrologyBed = capsule({
      startX: -50,
      endX: 50,
      outerRadius: 6,
      gradeRadius: 10,
      fixedTargetHeight: 5,
      obstructionPolicy: 'consult',
      targetHeightStrategy: 'baked',
      priority: 40,
    });
    const airfieldRect = capsule({
      startX: -100,
      endX: 100,
      outerRadius: 80,
      gradeRadius: 120,
      fixedTargetHeight: 30,
      obstructionPolicy: 'override',
      targetHeightStrategy: 'baked',
      priority: 60,
    });
    const stamps: TerrainStampConfig[] = [hydrologyBed, airfieldRect];
    const conflicts = detectStampConflicts(stamps);

    const { stamps: resolved, resolutions } = resolveStampPolicies({
      baseProvider: base,
      stamps,
      conflicts,
    });

    expect(resolved[0].fixedTargetHeight).toBe(30);
    expect(resolved[1].fixedTargetHeight).toBe(30);
    expect(resolutions.some((r) => r.resolution === 'overridden')).toBe(true);
  });

  it('`never_above` motor-pool clamps DOWN to an overlapping river bed below', () => {
    // Synthetic OF case: a motor-pool circle at +12 m sits over a river bed
    // at -2 m. never_above means the motor-pool cannot flatten higher than
    // the lower terrain feature it yields to.
    //
    // The resolver applies the lower-priority stamp's policy. Here the
    // motor-pool is the LOWER-priority stamp (priority 35) so its policy
    // governs. The river bed is priority 40 (higher).
    const base = new ConstantHeightProvider(0);
    const motorPool = circle({
      centerX: 0,
      centerZ: 0,
      innerRadius: 25,
      outerRadius: 30,
      gradeRadius: 35,
      fixedTargetHeight: 12,
      obstructionPolicy: 'never_above',
      targetHeightStrategy: 'baked',
      priority: 35,
    });
    const riverBed = capsule({
      startX: -40,
      endX: 40,
      outerRadius: 8,
      gradeRadius: 12,
      fixedTargetHeight: -2,
      obstructionPolicy: 'consult',
      targetHeightStrategy: 'baked',
      priority: 40,
    });
    const stamps: TerrainStampConfig[] = [motorPool, riverBed];
    const conflicts = detectStampConflicts(stamps);
    expect(conflicts.length).toBeGreaterThan(0);

    const { stamps: resolved, resolutions } = resolveStampPolicies({
      baseProvider: base,
      stamps,
      conflicts,
    });

    expect(resolved[0].fixedTargetHeight).toBe(-2);
    expect(resolutions.some((r) => r.resolution === 'clamped')).toBe(true);
  });

  it("`override` policy keeps a stamp's target intact when it is the higher-priority side", () => {
    // Airfield rect with `override` at higher priority vs a `consult`
    // hydrology bed. The bed yields (loses its baked target). The airfield
    // rect must retain its target.
    const base = new ConstantHeightProvider(0);
    const hydrologyBed = capsule({
      startX: -30,
      endX: 30,
      outerRadius: 6,
      gradeRadius: 10,
      fixedTargetHeight: 4,
      obstructionPolicy: 'consult',
      targetHeightStrategy: 'baked',
      priority: 40,
    });
    const airfieldRect = capsule({
      startX: -60,
      endX: 60,
      outerRadius: 60,
      gradeRadius: 100,
      fixedTargetHeight: 25,
      obstructionPolicy: 'override',
      targetHeightStrategy: 'baked',
      priority: 70,
    });
    const stamps: TerrainStampConfig[] = [hydrologyBed, airfieldRect];
    const conflicts = detectStampConflicts(stamps);

    const { stamps: resolved } = resolveStampPolicies({
      baseProvider: base,
      stamps,
      conflicts,
    });

    expect(resolved[1].fixedTargetHeight).toBe(25);
    expect(resolved[0].fixedTargetHeight).toBe(25);
  });

  it('`sample_post_compose` airfield envelope re-samples after a route stamp composes (airfield padding fix)', () => {
    // Regression test for the airfield padding bug. A route stamp at low
    // priority cuts the base terrain along an edge; the airfield envelope
    // is `consult` + `sample_post_compose` and must read its datum from the
    // composed terrain that includes the route stamp, not from raw base.
    //
    // The route stamp has a baked target of 100 m and the envelope's
    // sampling region overlaps it. The envelope's datum
    // (sample_post_compose) should pick up the route's 100 m target, not
    // the base provider's 0 m height.
    const base = new ConstantHeightProvider(0);
    const routeStamp = capsule({
      startX: -100,
      endX: 100,
      outerRadius: 40,
      gradeRadius: 50, // grade ramp width 10 (< 30) -> non-envelope class
      fixedTargetHeight: 100,
      obstructionPolicy: 'override',
      targetHeightStrategy: 'baked',
      priority: 25,
    });
    const airfieldEnvelope = capsule({
      startX: -150,
      endX: 150,
      innerRadius: 80,
      outerRadius: 90,
      gradeRadius: 140, // grade ramp width 50 (>= 30) -> envelope-class
      samplingRadius: 30,
      fixedTargetHeight: undefined, // resolver re-samples
      obstructionPolicy: 'consult',
      targetHeightStrategy: 'sample_post_compose',
      priority: 30,
    });
    const stamps: TerrainStampConfig[] = [routeStamp, airfieldEnvelope];
    const conflicts = detectStampConflicts(stamps);

    const { stamps: resolved, resolutions } = resolveStampPolicies({
      baseProvider: base,
      stamps,
      conflicts,
    });

    // Envelope target re-sampled - must reflect the 100 m route stamp, not
    // the 0 m base. Center sampling at (0,0) lies inside the route stamp's
    // inner radius so the route's full 100 m target applies.
    const envelopeTarget = resolved[1].fixedTargetHeight;
    expect(envelopeTarget).toBeGreaterThan(50);
    expect(resolutions.some((r) => r.resolution === 'resampled')).toBe(true);
  });

  it('resolution is deterministic across two identical compose calls', () => {
    // Build a small synthetic scene that exercises both Pass 1 (resample)
    // and Pass 2 (clamp + override) at once. Two identical calls must
    // return the same fixedTargetHeight values for every stamp and the
    // same `resolution` kind for every conflict.
    const base = new ConstantHeightProvider(0);
    const stamps: TerrainStampConfig[] = [
      capsule({
        startX: -200,
        endX: 200,
        outerRadius: 40,
        gradeRadius: 50,
        fixedTargetHeight: 100,
        obstructionPolicy: 'override',
        targetHeightStrategy: 'baked',
        priority: 25,
      }),
      capsule({
        startX: -300,
        endX: 300,
        innerRadius: 80,
        outerRadius: 90,
        gradeRadius: 140,
        samplingRadius: 30,
        fixedTargetHeight: undefined,
        obstructionPolicy: 'consult',
        targetHeightStrategy: 'sample_post_compose',
        priority: 30,
      }),
      capsule({
        startX: -100,
        endX: 100,
        outerRadius: 6,
        gradeRadius: 10,
        fixedTargetHeight: 4,
        obstructionPolicy: 'consult',
        targetHeightStrategy: 'baked',
        priority: 40,
      }),
      circle({
        centerX: 50,
        centerZ: 0,
        innerRadius: 25,
        outerRadius: 30,
        gradeRadius: 35,
        fixedTargetHeight: 35,
        obstructionPolicy: 'never_above',
        targetHeightStrategy: 'baked',
        priority: 45,
      }),
    ];
    const conflicts = detectStampConflicts(stamps);

    const first = resolveStampPolicies({ baseProvider: base, stamps, conflicts });
    const second = resolveStampPolicies({ baseProvider: base, stamps, conflicts });

    expect(priorities(second.stamps)).toEqual(priorities(first.stamps));
    for (let i = 0; i < first.stamps.length; i++) {
      expect(second.stamps[i].fixedTargetHeight)
        .toBe(first.stamps[i].fixedTargetHeight);
    }
    expect(second.resolutions.length).toBe(first.resolutions.length);
    for (let i = 0; i < first.resolutions.length; i++) {
      expect(second.resolutions[i].resolution).toBe(first.resolutions[i].resolution);
    }
  });

  it('does not mutate the input stamps array (returns a new array of new stamps)', () => {
    const base = new ConstantHeightProvider(0);
    const stamps: TerrainStampConfig[] = [
      capsule({
        startX: -30,
        endX: 30,
        outerRadius: 6,
        gradeRadius: 10,
        fixedTargetHeight: 4,
        obstructionPolicy: 'consult',
        targetHeightStrategy: 'baked',
        priority: 40,
      }),
      capsule({
        startX: -60,
        endX: 60,
        outerRadius: 60,
        gradeRadius: 100,
        fixedTargetHeight: 25,
        obstructionPolicy: 'override',
        targetHeightStrategy: 'baked',
        priority: 70,
      }),
    ];
    const inputTargets = stamps.map((s) => s.fixedTargetHeight);
    const conflicts = detectStampConflicts(stamps);

    const { stamps: resolved } = resolveStampPolicies({
      baseProvider: base,
      stamps,
      conflicts,
    });

    expect(resolved).not.toBe(stamps);
    for (let i = 0; i < stamps.length; i++) {
      expect(stamps[i].fixedTargetHeight).toBe(inputTargets[i]);
    }
  });

  it('returns an empty resolutions array when there are no input conflicts', () => {
    const base = new ConstantHeightProvider(0);
    const stamps: TerrainStampConfig[] = [
      capsule({ startX: -1000, endX: -990, fixedTargetHeight: 10 }),
      capsule({ startX: 990, endX: 1000, fixedTargetHeight: 20 }),
    ];
    const conflicts = detectStampConflicts(stamps);
    expect(conflicts).toEqual([]);

    const { stamps: resolved, resolutions } = resolveStampPolicies({
      baseProvider: base,
      stamps,
      conflicts,
    });

    expect(resolutions).toEqual([]);
    expect(resolved[0].fixedTargetHeight).toBe(10);
    expect(resolved[1].fixedTargetHeight).toBe(20);
  });
});
